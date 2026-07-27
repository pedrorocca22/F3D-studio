import uuid
import traceback
import os
import sys
import re
import math
import subprocess
import zipfile
import shutil
import json
import struct
import threading
from pathlib import Path
import io
import time

import numpy as np
from stl import mesh
from flask import Flask, render_template, request, redirect, url_for, send_file, send_from_directory, abort, jsonify
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps

from flask_cors import CORS
from moonraker_client import MoonrakerClient
from fdm_print_manager import FDMPrintManager, PrintJob, LayerAction, build_default_toolhead_actions
from datetime import datetime, timezone
from utils.gcode_infill_parser import parse_infill_lines, detect_perfect_squares, compute_centroids
from utils.gcode_injector import build_pore_injection_gcode, inject_pore_gcode_into_file, ensure_initial_toolhead
from utils.pore_injection_gcode import build_multilayer_injection_gcode

def _debug_log_to_file(filename, content):
    try:
        with open(filename, "w", encoding="utf-8") as f:
            f.write(content)
    except:
        pass

# In PyInstaller bundle, __file__ lives inside _internal/ but datas are at the bundle root.
if getattr(sys, 'frozen', False):
    BASE_DIR = Path(sys.executable).parent
else:
    BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"

# Configuracion
PRUSA_SLICER_CONSOLE = str(BASE_DIR / "PrusaSlicer-2.9.6" / "prusa-slicer-console.exe")
DEFAULT_CONFIG_INI = str(BASE_DIR / "config.ini")
FDM_CONFIG_INI = str(BASE_DIR / "config.ini")  # NEW: FDM uses the replaced config.ini array

JOBS_DIR = BASE_DIR / "jobs"
JOBS_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path="/")
CORS(app)  # Habilita CORS para todas las rutas

# Multiwell plate specs matching UI — FIX #4: added 'dia' field to match frontend constants/wellplate.ts
MULTIWELL_SPECS = {
    '6':  {'cols': 3, 'rows': 2, 'pitch': 39.1, 'dia': 34.8},
    '12': {'cols': 4, 'rows': 3, 'pitch': 26.1, 'dia': 22.1},
    '24': {'cols': 6, 'rows': 4, 'pitch': 19.3, 'dia': 15.62},
    '48': {'cols': 8, 'rows': 6, 'pitch': 13.0, 'dia': 11.0},
}

# Initialize Moonraker client + FDM manager (reads IP from config at first use)
_moonraker_client: MoonrakerClient | None = None
_fdm_print_manager: FDMPrintManager | None = None


def get_moonraker() -> MoonrakerClient:
    """Lazy-init the Moonraker client, reading IP from [Hardware] section of config.ini."""
    global _moonraker_client
    if _moonraker_client is None:
        import configparser
        cfg = configparser.ConfigParser()
        cfg.read(DEFAULT_CONFIG_INI)
        ip = cfg.get("Hardware", "rpi_ip", fallback="localhost")
        port = cfg.getint("Hardware", "moonraker_port", fallback=7125)
        _moonraker_client = MoonrakerClient(f"http://{ip}:{port}")
    return _moonraker_client


def get_fdm_manager() -> FDMPrintManager:
    global _fdm_print_manager
    if _fdm_print_manager is None:
        _fdm_print_manager = FDMPrintManager(get_moonraker())
    return _fdm_print_manager


# ----------------------------
# Job progress tracking
# ----------------------------
_slice_jobs: dict = {}  # job_id -> {status, progress, message, error}

def _set_progress(job_id: str, progress: float, message: str, status: str = "running"):
    """Thread-safe progress update."""
    _slice_jobs[job_id] = {"status": status, "progress": round(progress, 3), "message": message}


def _normalize_fill_pattern(value):
    if not value: return "gyroid"
    v = str(value).lower()
    mapping = {
        "rectilinear": "rectilinear",
        "monotonic": "monotonic",
        "monotoniclines": "monotoniclines",
        "alignedrectilinear": "alignedrectilinear",
        "grid": "grid",
        "triangles": "triangles",
        "stars": "stars",
        "cubic": "cubic",
        "line": "line",
        "concentric": "concentric",
        "honeycomb": "honeycomb",
        "3dhoneycomb": "3dhoneycomb",
        "gyroid": "gyroid",
        "hilbertcurve": "hilbertcurve",
        "archimedeanchords": "archimedeanchords",
        "octagramspiral": "octagramspiral",
        "adaptivecubic": "adaptivecubic",
        "supportcubic": "supportcubic",
        "lightning": "lightning"
    }
    return mapping.get(v, "gyroid")

def _safe_int(v):
    try:
        return int(v) if v not in (None, "", "null") else None
    except:
        return None

def _safe_str(v):
    return str(v).strip() if v not in (None, "", "null") else None

def _get_ext(tool_id, toolhead_to_extruder):
    if tool_id is None: return 1
    t_str = str(tool_id).lower()
    # Handle T0-T4 format -> 1-5
    if t_str.startswith('t') and t_str[1:].isdigit():
        return int(t_str[1:]) + 1
    # Handle raw numeric index strings
    if t_str.isdigit():
        return int(t_str) + 1
    # Map names to 1-based: fdm=1, syringe=2, uv=3, etc.
    return toolhead_to_extruder.get(t_str, 0) + 1


def _write_multimaterial_3mf(models_data, output_path, layer_actions=None, layer_height=0.2, first_layer_height=0.3):
    """
    Generates a PrusaSlicer-compatible 3MF file with per-volume extruder assignment
    and per-object FDM settings overrides.
    models_data: list of dicts: [
        {"mesh": m, "toolhead": "fdm", "scaffoldTools": {...}, "fdmSettings": {...}}, 
        ...
    ]
    output_path: Path to the .3mf file to write.
    """
    # Expanded toolhead mapping to support up to 5 tools (matching Prusa XL)
    # and allowing both named IDs and T0..T4 string identifiers.
    toolhead_to_extruder = {
        "fdm": 0,
        "t0": 0,
        "syringe": 1,
        "t1": 1,
        "uv": 2,
        "t2": 2,
        "t3": 3,
        "t4": 4,
        "none": 0
    }

    vertices = []
    vertex_map = {}
    volumes = []

    for m_data in models_data:
        m = m_data["mesh"]
        extruder = toolhead_to_extruder.get(m_data.get("toolhead", "fdm"), 1)
        tris = []
        for tri in m.vectors:
            idxs = []
            for v in tri:
                vt = (round(float(v[0]), 6), round(float(v[1]), 6), round(float(v[2]), 6))
                if vt not in vertex_map:
                    vertex_map[vt] = len(vertices)
                    vertices.append(vt)
                idxs.append(vertex_map[vt])
            if idxs[0] != idxs[1] and idxs[1] != idxs[2] and idxs[0] != idxs[2]:
                tris.append(tuple(idxs))
        
        vol_info = {
            "triangles": tris, 
            "extruder": extruder,
            "scaffoldTools": m_data.get("scaffoldTools"),
            "fdmSettings": m_data.get("fdmSettings"),
            "model_id": m_data.get("model_id")
        }
        volumes.append(vol_info)

    model_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">',
        ' <resources>',
    ]

    for vol_idx, vol in enumerate(volumes):
        obj_id = vol_idx + 1
        local_verts = []
        local_map = {}
        local_tris = []
        for tri in vol["triangles"]:
            local_idxs = []
            for vi in tri:
                if vi not in local_map:
                    local_map[vi] = len(local_verts)
                    local_verts.append(vertices[vi])
                local_idxs.append(local_map[vi])
            local_tris.append(tuple(local_idxs))

        model_lines.append(f'  <object id="{obj_id}" type="model">')
        model_lines.append(f'   <mesh>')
        model_lines.append(f'    <vertices>')
        for vt in local_verts:
            model_lines.append(f'     <vertex x="{vt[0]:.6f}" y="{vt[1]:.6f}" z="{vt[2]:.6f}" />')
        model_lines.append(f'    </vertices>')
        model_lines.append(f'    <triangles>')
        for t in local_tris:
            model_lines.append(f'     <triangle v1="{t[0]}" v2="{t[1]}" v3="{t[2]}" />')
        model_lines.append(f'    </triangles>')
        model_lines.append(f'   </mesh>')
        model_lines.append(f'  </object>')

    model_lines.append(' </resources>')
    model_lines.append(' <build>')
    for vol_idx in range(len(volumes)):
        obj_id = vol_idx + 1
        model_lines.append(f'  <item objectid="{obj_id}" />')
    model_lines.append(' </build>')
    model_lines.append('</model>')
    model_xml = "\n".join(model_lines)

    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\n'
        ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\n'
        '</Types>'
    )

    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\n'
        '</Relationships>'
    )

    # 2. Metadata/Slic3r_PE_model.config (Limpio, solo estructura)
    config_lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<config xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">']
    for vol_idx, vol in enumerate(volumes):
        obj_id = vol_idx + 1
        config_lines.append(f' <object id="{obj_id}" instances_count="1">')
        config_lines.append(f'  <metadata type="object" key="name" value="Part_{obj_id}"/>')
        config_lines.append(f'  <volume firstid="0" lastid="{len(vol["triangles"])-1}">')
        config_lines.append(f'   <metadata type="volume" key="name" value="Volume_{obj_id}"/>')
        config_lines.append(f'   <metadata type="volume" key="volume_type" value="ModelPart"/>')
        config_lines.append(f'  </volume>')
        config_lines.append(f' </object>')
    config_lines.append('</config>')
    slic3r_config = "\n".join(config_lines)

    # 3. Metadata/Prusa_Slicer_layer_config_ranges.xml (NUEVA LÓGICA CLONADA)
    ranges_xml_lines = ['<?xml version="1.0" encoding="utf-8"?>', '<objects>']
    ranges_found = False

    # Determinar si hay planes de capas para inyectar
    is_resolved_plan = False
    if layer_actions and isinstance(layer_actions, list) and len(layer_actions) > 0:
        if "ranges" in layer_actions[0] and "modelId" in layer_actions[0]:
            is_resolved_plan = True

    if is_resolved_plan:
        for vol_idx, vol in enumerate(volumes):
            obj_id = vol_idx + 1
            model_id = vol.get("model_id")
            plan = next((p for p in layer_actions if str(p.get("modelId")) == str(model_id)), None)
            
            if plan and plan.get("ranges"):
                ranges_found = True
                ranges_xml_lines.append(f'  <object id="{obj_id}">')
                for r in sorted(plan["ranges"], key=lambda k: int(k.get("layerFrom", 1))):
                    l_from = int(r.get("layerFrom", 1))
                    l_to = int(r.get("layerTo", 1))
                    
                    z_min = 0.0 if l_from <= 1 else round(first_layer_height + (l_from - 2) * layer_height, 4)
                    z_max = round(first_layer_height + (l_to - 1) * layer_height, 4)
                    
                    if z_max > z_min:
                        ranges_xml_lines.append(f'    <range min_z="{z_min:.4f}" max_z="{z_max:.4f}">')
                        setts = r.get("settings", {})
                        fdm_s = setts.get("fdm", {})
                        mapping = setts.get("mapping", {})

                        # Infill & Patterns
                        vi = _safe_str(fdm_s.get("infillPercent"))
                        if vi:
                            vi_clean = "".join(c for c in vi if c.isdigit() or c == ".")
                            if vi_clean:
                                ranges_xml_lines.append(f'      <option opt_key="fill_density">{vi_clean}%</option>')

                        pat = _normalize_fill_pattern(fdm_s.get("infillPattern"))
                        if pat:
                            ranges_xml_lines.append(f'      <option opt_key="fill_pattern">{pat}</option>')

                        wc = _safe_str(fdm_s.get("wallCount"))
                        if wc:
                            wc_clean = "".join(c for c in wc if c.isdigit())
                            if wc_clean:
                                ranges_xml_lines.append(f'      <option opt_key="perimeters">{wc_clean}</option>')

                        tsl = _safe_str(fdm_s.get("topSolidLayers"))
                        if tsl:
                            tsl_clean = "".join(c for c in tsl if c.isdigit())
                            if tsl_clean:
                                ranges_xml_lines.append(f'      <option opt_key="top_solid_layers">{tsl_clean}</option>')

                        bsl = _safe_str(fdm_s.get("bottomSolidLayers"))
                        if bsl:
                            bsl_clean = "".join(c for c in bsl if c.isdigit())
                            if bsl_clean:
                                ranges_xml_lines.append(f'      <option opt_key="bottom_solid_layers">{bsl_clean}</option>')

                        fa = _safe_str(fdm_s.get("fillAngle"))
                        if fa:
                            ranges_xml_lines.append(f'      <option opt_key="fill_angle">{fa}</option>')

                        # Speeds
                        ps = _safe_str(fdm_s.get("perimeterSpeedMmS"))
                        if ps: ranges_xml_lines.append(f'      <option opt_key="perimeter_speed">{ps}</option>')
                        eps = _safe_str(fdm_s.get("externalPerimeterSpeedMmS"))
                        if eps: ranges_xml_lines.append(f'      <option opt_key="external_perimeter_speed">{eps}</option>')
                        ins = _safe_str(fdm_s.get("infillSpeedMmS"))
                        if ins: ranges_xml_lines.append(f'      <option opt_key="infill_speed">{ins}</option>')
                        trs = _safe_str(fdm_s.get("travelSpeedMmS"))
                        if trs: ranges_xml_lines.append(f'      <option opt_key="travel_speed">{trs}</option>')

                        # Fan Speed Override
                        fs = _safe_str(fdm_s.get("fanSpeedPercent"))
                        if fs:
                            ranges_xml_lines.append(f'      <option opt_key="fan_always_on">1</option>')
                            ranges_xml_lines.append(f'      <option opt_key="min_fan_speed">{fs}</option>')
                            ranges_xml_lines.append(f'      <option opt_key="max_fan_speed">{fs}</option>')

                        # Layer Height Override
                        lh_ovr = _safe_str(fdm_s.get("layerHeightMm"))
                        if lh_ovr:
                             ranges_xml_lines.append(f'      <option opt_key="layer_height">{lh_ovr}</option>')
                        else:
                             ranges_xml_lines.append(f'      <option opt_key="layer_height">{layer_height}</option>')

                        # Extruder Assignments
                        has_feature_extruders = any(k in mapping for k in ("perimeter", "infill", "solidInfill", "support"))
                        if has_feature_extruders:
                            # Si hay específicos, anulamos el general con el valor '0' (estilo nativo Prusa)
                            ranges_xml_lines.append('      <option opt_key="extruder">0</option>')
                        else:
                            # Solo si el rango es uniforme, ponemos el índice real (1, 2, 3...)
                            primary = (mapping.get("perimeter") or mapping.get("infill") or "fdm")
                            ranges_xml_lines.append(f'      <option opt_key="extruder">{_get_ext(primary, toolhead_to_extruder)}</option>')

                        if "perimeter" in mapping:
                            ranges_xml_lines.append(f'      <option opt_key="perimeter_extruder">{_get_ext(mapping["perimeter"], toolhead_to_extruder)}</option>')
                        if "infill" in mapping:
                            ranges_xml_lines.append(f'      <option opt_key="infill_extruder">{_get_ext(mapping["infill"], toolhead_to_extruder)}</option>')
                        if "solidInfill" in mapping:
                            ranges_xml_lines.append(f'      <option opt_key="solid_infill_extruder">{_get_ext(mapping["solidInfill"], toolhead_to_extruder)}</option>')
                        if "support" in mapping:
                            ranges_xml_lines.append(f'      <option opt_key="support_material_extruder">{_get_ext(mapping["support"], toolhead_to_extruder)}</option>')

                        ranges_xml_lines.append('    </range>')
                ranges_xml_lines.append('  </object>')
    
    ranges_xml_lines.append('</objects>')
    ranges_xml = "\n".join(ranges_xml_lines)

    # 4. ZIP Construction with correct metadata files
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\n'
        ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\n'
        ' <Override PartName="/Metadata/Slic3r_PE_model.config" ContentType="application/vnd.slic3r.model-config+xml"/>\n'
        ' <Override PartName="/Metadata/Prusa_Slicer_layer_config_ranges.xml" ContentType="application/xml"/>\n'
        '</Types>'
    )
    
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        ' <Relationship Target="/3D/3dmodel.model" Id="rel1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\n'
        '</Relationships>'
    )

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/Slic3r_PE_model.config", slic3r_config)
        if ranges_found:
            zf.writestr("Metadata/Prusa_Slicer_layer_config_ranges.xml", ranges_xml)

    _debug_log_to_file("debug_last_config.xml", slic3r_config)
    if ranges_found:
        _debug_log_to_file("debug_last_ranges.xml", ranges_xml)



@app.get("/job/<job_id>/progress")
def get_job_progress(job_id):
    """Returns the slicing progress for a job."""
    if job_id not in _slice_jobs:
        return jsonify({"status": "unknown", "message": "Job not found"}), 404
    return jsonify(_slice_jobs[job_id])


# ----------------------------
# INI helpers
# ----------------------------
def parse_ini_dims(path: Path):
    # Defaults match the actual DLP3 work volume
    dims = {"width": 71.11, "height": 40.0, "depth": 76}
    if not path.exists():
        return dims

    settings = {}
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                settings[k.strip()] = v.strip()

    if "display_width" in settings:
        dims["width"] = float(settings["display_width"])
    if "display_height" in settings:
        dims["height"] = float(settings["display_height"])
    if "max_print_height" in settings:
        dims["depth"] = float(settings["max_print_height"])

    return dims


def _get_bed_center(path: Path) -> tuple[float, float]:
    """Parse bed_shape from config.ini and return bed center."""
    default_center = (50.0, 50.0)

    if not path.exists():
        return default_center

    try:
        bed_shape = None
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "=" not in line or line.strip().startswith("#"):
                    continue
                k, v = line.split("=", 1)
                if k.strip() == "bed_shape":
                    bed_shape = v.strip()
                    break

        if not bed_shape:
            return default_center

        points = []
        for token in bed_shape.split(","):
            token = token.strip()
            if "x" not in token:
                continue
            x_str, y_str = token.split("x", 1)
            points.append((float(x_str), float(y_str)))

        if len(points) < 2:
            return default_center

        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)
    except Exception:
        return default_center


def ensure_local_config():
    """Asegura BASE_DIR/config.ini para que la app sea autocontenida."""
    config_path = BASE_DIR / "config.ini"
    if not config_path.exists():
        src = Path(DEFAULT_CONFIG_INI)
        if not src.exists():
            # Si no existe el default, creamos uno basico dummy para evitar crash
            print(f"WARNING: No existe DEFAULT_CONFIG_INI: {src}")
            with open(config_path, "w") as f:
                f.write("printer_technology = SLA\n")
        else:
            shutil.copy(src, config_path)
    return config_path


def _format_gcode_float(value: float) -> str:
    s = f"{value:.5f}".rstrip("0").rstrip(".")
    if s in ("-0", "-0.0", ""):
        return "0"
    return s


def _offset_xy_in_gcode_line(line: str, dx: float, dy: float) -> str:
    if ";" in line:
        code_part, comment_part = line.split(";", 1)
        comment = ";" + comment_part
    else:
        code_part = line
        comment = ""

    def repl(match):
        axis = match.group(1)
        raw = match.group(2)
        try:
            value = float(raw)
        except Exception:
            return match.group(0)

        if axis == "X":
            value += dx
        elif axis == "Y":
            value += dy

        return f"{axis}{_format_gcode_float(value)}"

    code_part = re.sub(r"([XY])(-?\d+(?:\.\d+)?)", repl, code_part)
    return code_part + comment


def _apply_gcode_xy_offset(gcode_path: Path, dx: float, dy: float):
    """
    Shift absolute XY motions in generated G-code.
    Tracks G90/G91 and only modifies G0/G1/G2/G3 lines while in absolute mode.
    """
    if abs(dx) < 1e-9 and abs(dy) < 1e-9:
        return

    lines = gcode_path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    output = []
    absolute_mode = True

    for line in lines:
        stripped = line.lstrip()

        if stripped.startswith("G90"):
            absolute_mode = True
            output.append(line)
            continue

        if stripped.startswith("G91"):
            absolute_mode = False
            output.append(line)
            continue

        if absolute_mode and stripped.startswith(("G0", "G1", "G2", "G3")) and ("X" in line or "Y" in line):
            output.append(_offset_xy_in_gcode_line(line, dx, dy))
        else:
            output.append(line)

    gcode_path.write_text("".join(output), encoding="utf-8")


def _generate_uv_sweep_gcode(min_x, max_x, min_y, max_y, speed_mms, power_percent, line_spacing, z_offset):
    """
    Genera el G-code para un barrido UV en zigzag sobre un área delimitada.
    """
    gcode = []
    gcode.append("; --- INICIO BARRIDO UV ZIGZAG ---")
    gcode.append("T2 ; Cambiar a cabezal UV")
    
    # 1. Levantar el cabezal para evitar colisiones con biotinta fresca (Z-Hop relativo)
    gcode.append("G91 ; Coordenadas relativas")
    gcode.append(f"G1 Z{z_offset:.2f} F600 ; Levantar cabezal UV {z_offset}mm")
    gcode.append("G90 ; Coordenadas absolutas")
    
    # 2. Ir a la esquina de inicio (con el UV apagado)
    travel_feedrate = 6000 # 100 mm/s para movimientos rápidos
    feedrate_mm_min = speed_mms * 60 # Convertir mm/s a mm/min para el comando G1
    gcode.append(f"G0 X{min_x:.2f} Y{min_y:.2f} F{travel_feedrate} ; Ir a posicion inicial")
    
    # 3. Encender UV (Ajusta este comando según cómo Klipper controle tu UV)
    # Ejemplo: M106 P2 S255 (Ventilador 2) o un macro SET_PIN
    pwm_val = int((power_percent / 100.0) * 255)
    gcode.append(f"M106 P2 S{pwm_val} ; Encender UV al {power_percent}%")
    
    # 4. Generar el patrón de Zigzag
    current_y = min_y
    moving_right = True
    
    while current_y <= max_y:
        target_x = max_x if moving_right else min_x
        # Barrido horizontal
        gcode.append(f"G1 X{target_x:.2f} Y{current_y:.2f} F{feedrate_mm_min}")
        
        current_y += line_spacing
        
        # Salto vertical hacia la siguiente línea (si no hemos terminado)
        if current_y <= max_y:
            gcode.append(f"G1 X{target_x:.2f} Y{current_y:.2f} F{feedrate_mm_min}")
            
        moving_right = not moving_right
        
    # 5. Apagar UV
    gcode.append("M106 P2 S0 ; Apagar UV")
    
    # 6. Restaurar la altura Z
    gcode.append("G91 ; Coordenadas relativas")
    gcode.append(f"G1 Z-{z_offset:.2f} F600 ; Restaurar altura Z")
    gcode.append("G90 ; Coordenadas absolutas")
    gcode.append("; --- FIN BARRIDO UV ---")
    
    return gcode


def _sanitize_gcode_with_schedule(gcode_path: Path, layer_actions: list, toolheads_config: list = None, model_bboxes: dict = None):
    """
    Inyecta eventos de proceso (Macros y UV) en las capas especificadas.
    Nota: Ya NO fuerza comandos T0/T1. PrusaSlicer gestiona el ruteo de herramientas
    nativamente gracias a las opciones inyectadas en el archivo 3MF.
    """
    if not layer_actions:
        return

    events = {} # {layer: [gcode_lines]}

    for item in layer_actions:
        ranges = []
        if "ranges" in item:
            ranges = item["ranges"]
        else:
            ranges = [item]

        for r in ranges:
            try:
                lyr_from = int(r.get("layerFrom", 1))

                # Resolve UV Events / Macros (estos sí debemos inyectarlos manualmente)
                settings = r.get("settings", {})
                uv = settings.get("uv") or r.get("uvSettings")
                gcode_cmds = []
                
                if uv:
                    # Extraer parámetros de la UI (si no existen, ponemos valores por defecto)
                    speed_mms = float(uv.get("scanSpeedMmS", 20.0))
                    power_percent = float(uv.get("powerPercentage", 100.0))
                    line_spacing = float(uv.get("lineSpacingMm", 1.0))
                    z_offset = float(uv.get("zOffsetMm", 2.0))
                    
                    # Obtener los límites geométricos
                    model_id = str(r.get("modelId", "global"))
                    bbox = model_bboxes.get(model_id) if model_bboxes else None
                    if not bbox:
                        bbox = model_bboxes.get("global") if model_bboxes else None
                    
                    if bbox:
                        sweep_gcode = _generate_uv_sweep_gcode(
                            min_x=bbox["min_x"], max_x=bbox["max_x"], 
                            min_y=bbox["min_y"], max_y=bbox["max_y"], 
                            speed_mms=speed_mms, power_percent=power_percent, 
                            line_spacing=line_spacing, z_offset=z_offset
                        )
                        gcode_cmds.extend(sweep_gcode)
                    else:
                        # Fallback por si no hay geometria (el modo pausa original)
                        dur = uv.get("exposureTimeSec", 5)
                        gcode_cmds.append(f"; --- EVENTO UV EN CAPA {lyr_from} ---")
                        if uv.get("pausePrint", True): gcode_cmds.append("M0 ; Pausa para exposicion UV")
                        gcode_cmds.append("T2 ; Cambiar a cabezal UV")
                        gcode_cmds.append(f"G4 P{int(dur * 1000)} ; Exposicion de {dur}s")
                
                pre = settings.get("preMacro") or r.get("preMacro")
                if pre: gcode_cmds.append(str(pre))
                post = settings.get("postMacro") or r.get("postMacro")
                if post: gcode_cmds.append(str(post))

                if gcode_cmds:
                    if lyr_from not in events: events[lyr_from] = []
                    events[lyr_from].extend(gcode_cmds)

            except (ValueError, TypeError, KeyError):
                continue

    if not events:
        return

    lines = gcode_path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    output = []
    current_layer = 0
    active_tool = "T0"  # Default assumption

    for line in lines:
        stripped = line.strip()
        # Track active toolhead (T0, T1, T2...)
        if re.match(r"^T[0-9]+", stripped):
            # Extract only the T# part, ignoring comments
            active_tool = stripped.split(';')[0].strip()

        is_layer_marker = ";LAYER_CHANGE" in line or "; LAYER_CHANGE" in line or ";LAYER:" in line
        if is_layer_marker:
            current_layer += 1
            output.append(line)
            
            # Inyectar Eventos de Proceso (UV, Macros) al inicio de la capa
            if current_layer in events:
                for cmd in events[current_layer]:
                    output.append(f"{cmd}\n")
                
                # RESTAURAR EL CABEZAL ORIGINAL DESPUÉS DEL EVENTO
                # Si el evento (como el barrido UV) cambió a T2, debemos volver a lo que Prusa esperaba.
                output.append(f"{active_tool} ; Restaurar cabezal original tras evento de proceso\n")
            continue

        output.append(line)

    gcode_path.write_text("".join(output), encoding="utf-8")


def _primary_structural_tool(models_meta: list, layer_plans: list) -> str | None:
    """Return a deterministic startup tool when the scaffold map is uniform."""
    candidates = []
    feature_keys = ("perimeter", "infill", "solidInfill", "support")
    for plan in layer_plans or []:
        for range_item in plan.get("ranges", []):
            mapping = ((range_item.get("settings") or {}).get("mapping") or {})
            for key in feature_keys:
                tool = mapping.get(key)
                if tool and str(tool).lower() != "none":
                    candidates.append(str(tool).lower())
                    break

    if not candidates:
        for meta in models_meta or []:
            mapping = meta.get("scaffoldTools") or meta.get("scaffold_tools") or {}
            for key in feature_keys:
                tool = mapping.get(key)
                if tool and str(tool).lower() != "none":
                    candidates.append(str(tool).lower())
                    break
            if not mapping and meta.get("toolhead") and str(meta.get("toolhead")).lower() != "none":
                candidates.append(str(meta.get("toolhead")).lower())

    unique = set(candidates)
    if len(unique) != 1:
        return None
    return {"fdm": "T0", "syringe": "T1", "uv": "T2"}.get(next(iter(unique)))


# WiFi AP Configuration Routes
# ----------------------------
@app.get("/api/wifi/scan")
def wifi_scan():
    """Scans for available WiFi networks using nmcli."""
    try:
        cmd = ["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY", "dev", "wifi"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

        if result.returncode != 0:
            return jsonify({"error": "Failed to scan networks", "details": result.stderr}), 500

        networks = []
        for line in result.stdout.split("\n"):
            if not line.strip():
                continue
            parts = line.split(":")
            if len(parts) >= 3:
                ssid = parts[0].replace("\\:", ":")  # unescape colons
                if not ssid:
                    continue
                signal = parts[1]
                security = parts[2]
                networks.append({"ssid": ssid, "signal": signal, "security": security})

        unique_networks = {}
        for net in networks:
            ssid = net["ssid"]
            unique_networks[ssid] = net

        sorted_networks = sorted(
            unique_networks.values(),
            key=lambda x: int(x["signal"]) if x["signal"].isdigit() else 0,
            reverse=True,
        )

        return jsonify(sorted_networks)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/wifi/connect")
def wifi_connect():
    """Connects to a WiFi network and exits AP mode."""
    req = request.json or {}
    ssid = req.get("ssid")
    password = req.get("password", "")

    if not ssid:
        return jsonify({"error": "No SSID provided"}), 400

    try:
        cmd = ["nmcli", "dev", "wifi", "connect", ssid, "password", password]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

        if result.returncode == 0:
            return jsonify({"status": "connected", "message": f"Successfully connected to {ssid}"})
        else:
            return jsonify({"error": "Connection failed", "details": result.stderr}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# FDM Slicing Routes (BioFFF Studio)
# =============================================================================
def _run_fdm_slice_job(job_id: str, stl_paths: list, job_dir: Path, form_params: dict, preview_only: bool = False):
    """Background worker: slice STL with PrusaSlicer in FDM mode → .gcode."""
    import traceback
    import time as _t

    try:
        fdm_config = Path(FDM_CONFIG_INI) if Path(FDM_CONFIG_INI).exists() else None
        if not fdm_config:
            # Fallback: use minimal embedded FDM defaults
            fdm_config = job_dir / "fdm_defaults.ini"
            fdm_config.write_text(
                "# PrusaSlicer FDM minimal profile for BioFFF Studio\n"
                "printer_technology = FFF\n"
                "layer_height = 0.2\n"
                "first_layer_height = 0.3\n"
                "perimeters = 3\n"
                "fill_density = 15%\n"
                "fill_pattern = gyroid\n"
                "support_material = 0\n"
                "brim_width = 0\n"
                "temperature = 210\n"
                "first_layer_temperature = 215\n"
                "bed_temperature = 60\n"
                "gcode_flavor = klipper\n"
                "use_relative_e_distances = 1\n",
                encoding="utf-8",
            )

        gcode_out = job_dir / "print.gcode"

        layer_height = form_params.get("layer_height", "0.2")
        infill_raw = form_params.get("infill", "15")
        try:
            infill_f = float(str(infill_raw).replace("%", "").strip())
            infill = str(int(infill_f)) if infill_f == int(infill_f) else str(infill_f)
        except (ValueError, TypeError):
            infill = "15"
        
        print(f"[FDM SLICE] Processing job {job_id}. Infill: {infill}%")
        nozzle_temp = form_params.get("nozzle_temp", "210")
        bed_temp = form_params.get("bed_temp", "60")
        supports_raw = form_params.get("supports")
        supports = (supports_raw is True or supports_raw == "true" or supports_raw == "1")

        infill_pattern = form_params.get("infill_pattern", "grid")
        perimeters = form_params.get("perimeters", "3")
        models_meta = json.loads(form_params.get("models_metadata", "[]"))
        layer_actions_raw = json.loads(form_params.get("layer_actions", "[]"))
        toolheads_raw = form_params.get("toolheads")
        toolheads_config = json.loads(toolheads_raw) if toolheads_raw else []

        bed_center_x, bed_center_y = _get_bed_center(Path(FDM_CONFIG_INI))

        # Build a unified config file to override PrusaSlicer's priority system
        # PrusaSlicer processes CLI args first, then --load files. This means --load
        # completely wipes out CLI arguments! We must write overrides into the INI.
        job_config_ini = job_dir / "job_config.ini"

        noz_d = str(form_params.get("nozzle_diameter", "0.4"))
        ret_l = str(form_params.get("retract_length", "1.0"))
        ret_s = str(form_params.get("retract_speed", "45"))
        ext_m = str(form_params.get("extrusion_multiplier", "1.0"))

        overrides_dict = {
            "extruders_count": "3",
            "layer_height": str(layer_height),
            "fill_density": f"{infill}%",
            "temperature": f"{nozzle_temp},{nozzle_temp},{nozzle_temp}",
            "first_layer_temperature": f"{nozzle_temp},{nozzle_temp},{nozzle_temp}",
            "bed_temperature": str(bed_temp),
            "fill_pattern": str(infill_pattern),
            "perimeters": str(perimeters),
            "nozzle_diameter": f"{noz_d},{noz_d},{noz_d}",
            "first_layer_height": str(form_params.get("first_layer_height", "0.3")),
            "support_material": "1" if supports else "0",
            "skirts": str(form_params.get("skirt_count", "1")),
            "skirt_distance": str(form_params.get("skirt_distance", "6")),
            "skirt_height": str(form_params.get("skirt_height", "1")),
            "brim_width": str(form_params.get("brim_width", "0")),
            "top_solid_layers": str(form_params.get("top_shell", "3")),
            "bottom_solid_layers": str(form_params.get("bottom_shell", "3")),
            "fill_angle": str(form_params.get("fill_angle", "45")),
            "first_layer_speed": str(form_params.get("first_layer_speed", "20")),
            "perimeter_speed": str(form_params.get("perimeter_speed", "45")),
            "external_perimeter_speed": str(form_params.get("external_perimeter_speed", "25")),
            "infill_speed": str(form_params.get("infill_speed", "80")),
            "travel_speed": str(form_params.get("travel_speed", "130")),
            "retract_length": f"{ret_l},{ret_l},{ret_l}",
            "retract_speed": f"{ret_s},{ret_s},{ret_s}",
            "extrusion_multiplier": f"{ext_m},{ext_m},{ext_m}",
            "extruder_offset": "0x0,0x0,0x0",
            "cooling": str(form_params.get("cooling", "1")),
            
            "fan_always_on": str(form_params.get("fan_always_on", "1")),
            "min_fan_speed": str(form_params.get("min_fan_speed", "100")),
            "max_fan_speed": str(form_params.get("max_fan_speed", "100")),
            "disable_fan_first_layers": str(form_params.get("disable_fan_first_layers", "1")),
            "toolchange_gcode": "T[next_extruder]",
        }

        # ── Per-feature extruder assignment (Scaffold mode) ──
        # If any model carries scaffoldTools, apply PrusaSlicer's per-feature extruder keys.
        # ── Filter overrides ──
        # Determine which parameters are actually being overridden in ranges
        layer_plans = json.loads(form_params.get("resolved_layer_plans", "[]"))
        if not layer_plans:
            layer_plans = json.loads(form_params.get("layer_actions", "[]"))
            
        params_in_ranges = set()
        if layer_plans:
            for plan in layer_plans:
                for r in plan.get("ranges", []):
                    setts = r.get("settings", {}) or {}
                    fdm = setts.get("fdm", {})
                    # Map UI keys (frontend) to PrusaSlicer keys (ini)
                    if "infillPercent" in fdm: params_in_ranges.add("fill_density")
                    if "infillPattern" in fdm: 
                        params_in_ranges.add("fill_pattern")
                        params_in_ranges.add("infill_pattern")
                    if "wallCount" in fdm: params_in_ranges.add("perimeters")
                    if "topSolidLayers" in fdm: params_in_ranges.add("top_solid_layers")
                    if "bottomSolidLayers" in fdm: params_in_ranges.add("bottom_solid_layers")
                    if "fillAngle" in fdm: params_in_ranges.add("fill_angle")
                    
                    # Toolhead mappings in ranges
                    mapping = setts.get("mapping", {})
                    if "perimeter" in mapping: params_in_ranges.add("perimeter_extruder")
                    if "infill" in mapping: params_in_ranges.add("infill_extruder")
                    if "solidInfill" in mapping: params_in_ranges.add("solid_infill_extruder")
                    if "support" in mapping: params_in_ranges.add("support_material_extruder")

        # Parameters that should be omitted from .ini ONLY IF they are present in ranges
        # to ensure 3MF per-object/per-layer settings take precedence.
        # NOTE: We NEVER omit "fill_density" or "fill_pattern" because PrusaSlicer requires
        # a base value in the config.ini to validate overrides in the 3MF ranges.
        NEVER_OMIT = {"fill_density", "fill_pattern", "infill_pattern", "layer_height", "first_layer_height"}

        keys_to_omit = ({
            "perimeters", "top_solid_layers", "bottom_solid_layers", "fill_angle",
            "perimeter_extruder", "infill_extruder", "solid_infill_extruder", "support_material_extruder"
        }.intersection(params_in_ranges)) - NEVER_OMIT


        scaffold_tools = None
        for meta in models_meta:
            st = meta.get("scaffoldTools") or meta.get("scaffold_tools")
            if st:
                scaffold_tools = st
                break

        if scaffold_tools:
            # IMPORTANT: For .ini (config.ini) keys like perimeter_extruder, 
            # PrusaSlicer expects 1-based indexing (1, 2, 3, 4, 5).
            def _get_ini_ext(t_id):
                if not t_id: return "1"
                t_str = str(t_id).lower()
                if t_str.startswith('t') and t_str[1:].isdigit():
                    return str(int(t_str[1:]) + 1)
                if t_str.isdigit():
                    return str(int(t_str) + 1)
                # Map names to 1-based: fdm=1, syringe=2, uv=3
                mapping = {"fdm": 1, "syringe": 2, "uv": 3}
                return str(mapping.get(t_str, 1))

            overrides_dict["perimeter_extruder"] = _get_ini_ext(scaffold_tools.get("perimeter"))
            overrides_dict["infill_extruder"] = _get_ini_ext(scaffold_tools.get("infill"))
            overrides_dict["solid_infill_extruder"] = _get_ini_ext(scaffold_tools.get("solidInfill"))
            overrides_dict["support_material_extruder"] = _get_ini_ext(scaffold_tools.get("support"))

        config_lines = []
        applied_overrides = set()

        if fdm_config and fdm_config.exists():
            with open(fdm_config, "r", encoding="utf-8") as f:
                for line in f.readlines():
                    line_strip = line.strip()
                    if line_strip == "[Hardware]":
                        break

                    if "=" in line_strip and not line_strip.startswith("#"):
                        key = line_strip.split("=")[0].strip()
                        # Only skip if the key is actually being handled by 3MF ranges
                        if key in keys_to_omit:
                            continue
                            
                        if key in overrides_dict:
                            config_lines.append(f"{key} = {overrides_dict[key]}\n")
                            applied_overrides.add(key)
                        else:
                            config_lines.append(line)
                    else:
                        config_lines.append(line)
        else:
            config_lines = [
                "# Minimal FDM Profile\n",
                "printer_technology = FFF\n",
                "gcode_flavor = klipper\n",
                "use_relative_e_distances = 1\n",
            ]

        missing_overrides = [k for k in overrides_dict.keys() if k not in applied_overrides]
        if missing_overrides:
            config_lines.append("\n# --- Added by UI ---\n")
            for k in missing_overrides:
                if k in keys_to_omit:
                    continue
                config_lines.append(f"{k} = {overrides_dict[k]}\n")

        with open(job_config_ini, "w", encoding="utf-8") as f:
            f.writelines(config_lines)

        cmd = [
            PRUSA_SLICER_CONSOLE,
            "--load", str(job_config_ini),
            "--export-gcode",
            "--dont-arrange",
            "--output", str(gcode_out),
        ]

        # Process and apply transforms to STLs directly
        consolidated_data = []
        consolidated_scene_center = None

        if models_meta:
            # We process files based on the order they were sent
            for i, meta in enumerate(models_meta):
                f_name = f"model_{i}.stl"
                f_path = job_dir / f_name

                if f_path.exists():
                    try:
                        # Load and transform STL to match UI
                        m = mesh.Mesh.from_file(str(f_path))

                        # 1. Center the raw geometry first to apply rotations/scale correctly
                        cx = (m.x.min() + m.x.max()) / 2.0
                        cy = (m.y.min() + m.y.max()) / 2.0
                        cz = (m.z.min() + m.z.max()) / 2.0
                        m.x -= cx
                        m.y -= cy
                        m.z -= cz

                        # Read transforms
                        t = meta.get("transform", {})
                        s = t.get("scale", {"x": 1, "y": 1, "z": 1})
                        r = t.get("rotation", {"x": 0, "y": 0, "z": 0})
                        p = t.get("position", {"x": 0, "y": 0, "z": 0})

                        # 2. Scale
                        m.x *= s.get("x", 1.0)
                        m.y *= s.get("y", 1.0)
                        m.z *= s.get("z", 1.0)
                        # 3. Rotate (match Three.js XYZ Euler mapped to physical axes)
                        # UI r.y (yaw) -> Print Z axis [0,0,1]
                        # UI r.x (pitch) -> Print X axis [1,0,0]
                        # UI r.z (roll) -> Print Y axis [0,1,0]
                        if r.get("x"):
                            m.rotate([1, 0, 0], math.radians(r.get("x")))
                        if r.get("y"):
                            m.rotate([0, 1, 0], math.radians(r.get("y")))
                        if r.get("z"):
                            m.rotate([0, 0, 1], math.radians(r.get("z")))

                        # 4. Snap to Z=0 after rotation to ensure it prints flat
                        min_z = m.z.min()
                        m.z -= min_z

                        # 5. Translate to bed coordinates
                        # UI X -> Print X
                        # UI Y (Depth) -> Print Y
                        # UI Z (Height) -> Print Z
                        final_x = p.get("x", 0.0)
                        final_y = p.get("y", 0.0)
                        final_z = p.get("z", 0.0)

                        # Check for well assignment override
                        # wellAssignment lives in 'transform', not in 'position'
                        wa = t.get("wellAssignment")
                        if wa:
                            fmt = str(wa.get("format", "24"))
                            well_id = wa.get("wellId", "A1")
                            spec = MULTIWELL_SPECS.get(fmt, MULTIWELL_SPECS['24'])
                            
                            try:
                                row = ord(well_id[0].upper()) - 65
                                col = int(well_id[1:]) - 1
                                
                                # Well coordinates relative to plate center
                                well_x = (col - (spec['cols'] - 1) / 2.0) * spec['pitch']
                                well_y = (row - (spec['rows'] - 1) / 2.0) * spec['pitch']
                                
                                final_x = well_x
                                final_y = well_y
                                # final_z is usually 0 when in a well
                                print(f"[FDM SLICE] Model assigned to well {well_id}: ({final_x}, {final_y})")
                            except (ValueError, IndexError) as e:
                                print(f"[FDM SLICE] Error parsing wellId {well_id}: {e}")

                        m.x += final_x + bed_center_x
                        m.y += final_y + bed_center_y
                        m.z += final_z

                        consolidated_data.append({
                            "mesh": m,
                            "model_id": meta.get("id"),
                            "toolhead": meta.get("toolhead", "fdm"),
                            "scaffoldTools": meta.get("scaffoldTools") or meta.get("scaffold_tools"),
                            "fdmSettings": meta.get("fdm_settings"),
                            "bedMinX": float(m.x.min()),
                            "bedMaxX": float(m.x.max()),
                            "bedMinY": float(m.y.min()),
                            "bedMaxY": float(m.y.max()),
                        })
                    except Exception as e:
                        print(f"[FDM SLICE] Error processing {f_name}: {e}")

            if consolidated_data:
                consolidated_path = job_dir / "consolidated.3mf"
                # Coerce heights to float for Z range calculations
                lh = float(layer_height)
                flh = float(form_params.get("first_layer_height", "0.3"))
                # Prefer resolved_layer_plans from frontend if available
                layer_plans = json.loads(form_params.get("resolved_layer_plans", "[]"))
                if not layer_plans:
                    layer_plans = layer_actions_raw

                _write_multimaterial_3mf(consolidated_data, consolidated_path, layer_plans, lh, flh)
                cmd.append(str(consolidated_path))
            else:
                for stl_path in stl_paths:
                    cmd.append(str(stl_path))
        else:
            # Fallback for simple uploads
            for stl_path in stl_paths:
                cmd.append(str(stl_path))

        _set_progress(job_id, 0.1, "Running PrusaSlicer FDM...")
        t0 = _t.time()
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=60) # Fail safe timeout
        except subprocess.TimeoutExpired:
            print(f"[FDM SLICE] PrusaSlicer timed out after 60s")
            _set_progress(job_id, 0.0, "PrusaSlicer timed out", status="error")
            return None
            
        elapsed = _t.time() - t0
        print(f"[TIMING] FDM slice: {elapsed:.2f}s")

        if p.returncode != 0 or not gcode_out.exists():
            print(f"FDM Slice Error:\nSTDOUT: {p.stdout}\nSTDERR: {p.stderr}")
            _set_progress(job_id, 0.0, f"PrusaSlicer FDM failed: {p.stderr[:300]}", status="error")
            return None

        # correctly positioned relative to the bed origin.
        # (Post-processing continues below)

        # ── Apply Layer Schedule Priority over Scaffold Mapping ──
        # Use full layer plans if available for more accurate toolhead switching
        # Recopilar los límites para los barridos UV
        model_bboxes = {}
        if consolidated_data:
            model_bboxes["global"] = {
                "min_x": min([d["bedMinX"] for d in consolidated_data]),
                "max_x": max([d["bedMaxX"] for d in consolidated_data]),
                "min_y": min([d["bedMinY"] for d in consolidated_data]),
                "max_y": max([d["bedMaxY"] for d in consolidated_data])
            }
            for d in consolidated_data:
                model_bboxes[str(d["model_id"])] = {
                    "min_x": d["bedMinX"], "max_x": d["bedMaxX"],
                    "min_y": d["bedMinY"], "max_y": d["bedMaxY"]
                }

        sanitizer_actions = layer_plans if layer_plans else layer_actions_raw
        if sanitizer_actions:
            _set_progress(job_id, 0.95, "Applying layer schedule overrides...")
            _sanitize_gcode_with_schedule(gcode_out, sanitizer_actions, toolheads_config, model_bboxes)

        # Prusa profiles may start with their default extruder (commonly T1)
        # even when the resolved scaffold mapping is uniformly FDM. Normalize
        # that startup selection before pore blocks are appended; injection
        # blocks still switch to the syringe and restore the active tool.
        startup_tool = _primary_structural_tool(models_meta, layer_plans)
        if startup_tool:
            ensure_initial_toolhead(gcode_out, startup_tool)

        # ── Pore Injection Post-Processing (Segment-Based) ──
        z_zones_raw = form_params.get("z_zones", "[]")
        z_zones = json.loads(z_zones_raw)
        global_pore_raw = form_params.get("pore_injection")
        global_pore = None
        if global_pore_raw:
            try:
                global_pore = json.loads(global_pore_raw)
            except (TypeError, ValueError, json.JSONDecodeError):
                global_pore = None
        has_zonal_pore = any(
            isinstance(zone, dict)
            and ((zone.get("parameterOverride") or {}).get("poreInjection") or {}).get("enabled")
            for zone in z_zones
        )
        # The direct UI mode is represented as a synthetic all-height zone so it
        # uses exactly the same detector and G-code path as zonal injection.
        if isinstance(global_pore, dict) and global_pore.get("enabled") and not has_zonal_pore:
            z_zones = [
                *z_zones,
                {
                    "id": "__global_pore__",
                    "modelScope": "all",
                    "zStartMm": 0.0,
                    "zEndMm": 0.0,
                    "parameterOverride": {"poreInjection": global_pore},
                },
            ]
        detected_pores_for_metadata = []
        
        if z_zones and not preview_only:
            print(f"[PORE DEBUG] Processing {len(z_zones)} zones for injection...")
            try:
                _set_progress(job_id, 0.96, "Detecting pores in infill...")
                # 1. Parse infill ONCE
                lh_mm = float(layer_height)
                infill_data = parse_infill_lines(gcode_out, lh_mm)
                
                all_layer_injections = {}
                
                # Helper to map toolhead IDs to G-code tool numbers
                def get_tool_name(t_id):
                    if not t_id: return "T1"
                    s = str(t_id).lower()
                    if s.startswith("t"): return s.upper()
                    mapping = {"fdm": "T0", "syringe": "T1", "uv": "T2"}
                    return mapping.get(s, "T1")

                for zone in z_zones:
                    # Check if this zone has pore injection enabled
                    param_override = zone.get("parameterOverride", {})
                    pore_config = param_override.get("poreInjection")
                    
                    print(f"[PORE DEBUG] Zone '{zone.get('label')}': pore_config={pore_config}")

                    if not (pore_config and pore_config.get("enabled")):
                        continue
                    
                    is_global_zone = zone.get("id") == "__global_pore__"
                    z_start = 0.0 if is_global_zone else float(zone.get("zStartMm", 0.0))
                    z_end = float(zone.get("zEndMm", 10.0))
                    if is_global_zone:
                        z_end = max((float(data.get("z", 0.0)) for data in infill_data.values()), default=10.0)
                    print(f"[PORE] Scanning zone '{zone.get('label')}' ({z_start}-{z_end} mm)")
                    
                    mode = pore_config.get("mode", "layer_by_layer")
                    tol = float(pore_config.get("cellSizeToleranceMm", 0.1))
                    min_cell = float(pore_config.get("minCellSizeMm", 0.5))
                    syringe_tool = get_tool_name(pore_config.get("syringeToolhead", "syringe"))

                    if mode == "layer_by_layer":
                        # 2. Process layer by layer as usual
                        for layer_idx, data in infill_data.items():
                            z = data["z"]
                            if not (z_start <= z <= z_end):
                                continue
                            
                            squares = detect_perfect_squares(data["infill_segments"], tolerance_mm=tol, min_size_mm=min_cell)
                            if not squares:
                                continue
                                
                            centroids = compute_centroids(squares)
                            if centroids:
                                gcode_block = build_pore_injection_gcode(
                                    centroids=centroids,
                                    current_z=z,
                                    injection_depth_mm=float(pore_config.get("injectionDepthMm", 0.3)),
                                    flow_ul_per_cell=float(pore_config.get("flowRateUlPerCell", 0.5)),
                                    ul_per_mm=165.0, # Approximate for 10ml syringe
                                    travel_feedrate=float(pore_config.get("travelFeedrateMmMin", 6000)),
                                    inject_feedrate=float(pore_config.get("injectionFeedrateMmMin", 120)),
                                    syringe_tool=syringe_tool
                                )
                                
                                if layer_idx in all_layer_injections:
                                    all_layer_injections[layer_idx].extend(gcode_block)
                                else:
                                    all_layer_injections[layer_idx] = gcode_block
                                
                                for c in centroids:
                                    mid = "global"
                                    for d in consolidated_data:
                                        if (d["bedMinX"] - 0.1 <= c[0] <= d["bedMaxX"] + 0.1) and \
                                           (d["bedMinY"] - 0.1 <= c[1] <= d["bedMaxY"] + 0.1):
                                            mid = d["model_id"]
                                            break
                                    detected_pores_for_metadata.append({
                                        "x": float(c[0]), "y": float(c[1]), "z": float(z),
                                        "modelId": mid, "layer": int(layer_idx)
                                    })
                    else:
                        # MULTILAYER MODE: Find the highest layer in the zone, get its centroids, and inject once.
                        highest_layer_idx = None
                        highest_z = -1
                        for layer_idx, data in infill_data.items():
                            z = data["z"]
                            if z_start <= z <= z_end and z > highest_z:
                                highest_z = z
                                highest_layer_idx = layer_idx
                                
                        if highest_layer_idx is not None:
                            data = infill_data[highest_layer_idx]
                            squares = detect_perfect_squares(data["infill_segments"], tolerance_mm=tol, min_size_mm=min_cell)
                            centroids = compute_centroids(squares)
                            if centroids:
                                target_volume = float(pore_config.get("targetVolumeUl", 0.0))
                                flow_ul_per_cell = target_volume / len(centroids) if len(centroids) > 0 else 0
                                
                                gcode_block = build_multilayer_injection_gcode(
                                    centroids=centroids,
                                    z_start_mm=z_start,
                                    z_end_mm=highest_z,
                                    flow_ul_per_cell=flow_ul_per_cell,
                                    ul_per_mm=165.0,
                                    travel_feedrate=float(pore_config.get("travelFeedrateMmMin", 6000)),
                                    inject_feedrate=float(pore_config.get("injectionFeedrateMmMin", 120)),
                                    syringe_tool=syringe_tool
                                )
                                
                                if highest_layer_idx in all_layer_injections:
                                    all_layer_injections[highest_layer_idx].extend(gcode_block)
                                else:
                                    all_layer_injections[highest_layer_idx] = gcode_block
                                
                                for c in centroids:
                                    mid = "global"
                                    for d in consolidated_data:
                                        if (d["bedMinX"] - 0.1 <= c[0] <= d["bedMaxX"] + 0.1) and \
                                           (d["bedMinY"] - 0.1 <= c[1] <= d["bedMaxY"] + 0.1):
                                            mid = d["model_id"]
                                            break
                                    detected_pores_for_metadata.append({
                                        "x": float(c[0]), "y": float(c[1]), "z": float(highest_z),
                                        "modelId": mid, "layer": int(highest_layer_idx)
                                    })

                if all_layer_injections:
                    _set_progress(job_id, 0.97, f"Injecting {len(detected_pores_for_metadata)} pore sites...")
                    inject_pore_gcode_into_file(gcode_out, all_layer_injections)
                    
            except Exception as pe:
                print(f"[PORE] Injection processing failed: {pe}")
                traceback.print_exc()

        # Parse basic stats from G-code comments
        layer_count = 0
        estimated_time = 0
        filament_used = 0.0
        try:
            with open(gcode_out, "r", encoding="utf-8", errors="ignore") as gf:
                for line in gf:
                    if line.startswith("; total layers count ="):
                        layer_count = int(line.split("=")[1].strip())
                    elif line.startswith("; estimated printing time") and "normal mode" in line:
                        # format: "; estimated printing time (normal mode) = Xh Ym Zs"
                        pass
                    elif line.startswith("; filament used [mm]") or line.startswith("; filament_used"):
                        try:
                            filament_used = float(line.split("=")[1].strip().split()[0])
                        except Exception:
                            pass
        except Exception:
            pass

        # Write job manifest
        job_info = {
            "job_id": job_id,
            "type": "fdm",
            "status": "done",
            "gcode_filename": gcode_out.name,
            "gcode_path": str(gcode_out),
            "layer_count": layer_count,
            "layer_height_mm": float(layer_height),
            "filament_used_mm": filament_used,
            "toolhead_actions": layer_actions_raw,
            "toolheads": json.loads(form_params.get("toolheads", "[]")),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "xy_compensation": {
                "applied": False,
                "bed_center_x": bed_center_x,
                "bed_center_y": bed_center_y,
            },
            "pores": detected_pores_for_metadata
        }
        (job_dir / "job_fdm.json").write_text(json.dumps(job_info, indent=2), encoding="utf-8")

        _set_progress(
            job_id,
            1.0,
            f"Done — {layer_count} layers, {filament_used:.0f}mm filament",
            status="done",
        )
        return consolidated_data

    except Exception as e:
        traceback.print_exc()
        _set_progress(job_id, 0.0, f"FDM Slice error: {e}", status="error")
        return None




def _build_fdm_form_params(form) -> dict:
    """Normalize the multipart form contract used by the background slicer job."""
    return {
        "layer_height": form.get("layer_height", "0.2"),
        "infill": form.get("infill", "15"),
        "nozzle_temp": form.get("nozzle_temp", "210"),
        "bed_temp": form.get("bed_temp", "60"),
        "infill_pattern": form.get("infill_pattern", "grid"),
        "perimeters": form.get("perimeters", "3"),
        "supports": form.get("supports", "false") == "true",
        "toolheads": form.get("toolheads", "[]"),
        "layer_actions": form.get("layer_actions", "[]"),
        "resolved_layer_plans": form.get("resolved_layer_plans", "[]"),
        "models_metadata": form.get("models_metadata", "[]"),
        "nozzle_diameter": form.get("nozzle_diameter", "0.4"),
        "first_layer_height": form.get("first_layer_height", "0.3"),
        "skirt_count": form.get("skirt_count", "1"),
        "skirt_distance": form.get("skirt_distance", "6"),
        "skirt_height": form.get("skirt_height", "1"),
        "brim_width": form.get("brim_width", "0"),
        "top_shell": form.get("top_shell", "3"),
        "bottom_shell": form.get("bottom_shell", "3"),
        "fill_angle": form.get("fill_angle", "45"),
        "first_layer_speed": form.get("first_layer_speed", "20"),
        "perimeter_speed": form.get("perimeter_speed", "45"),
        "external_perimeter_speed": form.get("external_perimeter_speed", "25"),
        "infill_speed": form.get("infill_speed", "80"),
        "travel_speed": form.get("travel_speed", "130"),
        "retract_length": form.get("retraction_length", "1.0"),
        "retract_speed": form.get("retraction_speed", "45"),
        "extrusion_multiplier": form.get("extrusion_multiplier", "1.0"),
        "fan_always_on": form.get("fan_always_on", "1"),
        "min_fan_speed": form.get("min_fan_speed", "100"),
        "max_fan_speed": form.get("max_fan_speed", "100"),
        "disable_fan_first_layers": form.get("disable_fan_first_layers", "1"),
        "cooling": form.get("cooling", "1"),
        "pore_injection": form.get("pore_injection"),
        "z_zones": form.get("z_zones", "[]"),
        "print_bed": form.get("print_bed"),
    }


def _validate_fdm_slice_request(files, form_params: dict) -> list[dict]:
    """Validate workflow invariants before creating a background slicer job."""
    issues: list[dict] = []

    def issue(code: str, step: int, message: str) -> None:
        issues.append({"code": code, "step": step, "severity": "error", "message": message})

    if not files:
        issue("models.missing", 2, "At least one STL file is required.")

    def parse_json(name: str, fallback):
        raw = form_params.get(name)
        if not raw:
            return fallback
        try:
            return json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            issue(f"request.{name}.json", 6, f"Field '{name}' is not valid JSON.")
            return fallback

    bed = parse_json("print_bed", None)
    if not isinstance(bed, dict):
        issue("environment.bed.missing", 1, "A print surface must be selected before slicing.")
    else:
        bed_type = bed.get("type")
        if bed_type == "glass_bed":
            dimensions = bed.get("dimensions") or {}
            if float(dimensions.get("width", 0) or 0) <= 0 or float(dimensions.get("height", 0) or 0) <= 0:
                issue("environment.bed.dimensions", 1, "Glass bed dimensions must be greater than zero.")
        elif bed_type == "petri_dish":
            if bed.get("petriDiameter") not in (35, 60, 90):
                issue("environment.bed.diameter", 1, "A valid Petri dish diameter is required.")
        elif bed_type == "multiwell_plate":
            if bed.get("multiwellFormat") not in (6, 12, 24, 48):
                issue("environment.bed.format", 1, "A valid multiwell plate format is required.")
        else:
            issue("environment.bed.type", 1, "The selected print surface is not supported.")

    toolheads = parse_json("toolheads", [])
    if not isinstance(toolheads, list):
        toolheads = []
    assigned_tools = {
        str(tool.get("id"))
        for tool in toolheads
        if isinstance(tool, dict) and tool.get("slot") is not None
    }
    if not assigned_tools:
        issue("environment.toolheads.missing", 1, "Assign at least one toolhead to a machine slot.")

    models_metadata = parse_json("models_metadata", [])
    if not isinstance(models_metadata, list) or not models_metadata:
        issue("models.metadata.missing", 2, "Model metadata is required for slicing.")

    global_pore = parse_json("pore_injection", None)
    z_zones_for_validation = parse_json("z_zones", [])
    active_zone_pores = [
        zone for zone in (z_zones_for_validation if isinstance(z_zones_for_validation, list) else [])
        if isinstance(zone, dict) and ((zone.get("parameterOverride") or {}).get("poreInjection") or {}).get("enabled")
    ]
    if isinstance(global_pore, dict) and global_pore.get("enabled"):
        if active_zone_pores:
            issue("pore.scope.conflict", 5, "Choose either whole-scaffold or zonal Pore Injection, not both.")
        global_patterns = [
            (model.get("fdm_settings") or {}).get("infillPattern") or form_params.get("infill_pattern", "grid")
            for model in models_metadata if isinstance(model, dict)
        ]
        if any(pattern != "grid" for pattern in global_patterns):
            issue("pore.pattern.global", 5, "Whole-scaffold Pore Injection requires the GRID infill pattern for every model.")
        syringe_id = global_pore.get("syringeToolhead", "syringe")
        if syringe_id not in assigned_tools:
            issue("pore.toolhead.global", 5, "Whole-scaffold Pore Injection requires an assigned syringe toolhead.")
        try:
            if float(global_pore.get("injectionDepthMm", 0)) <= 0 or float(global_pore.get("flowRateUlPerCell", 0)) <= 0:
                issue("pore.parameters.global", 5, "Whole-scaffold Pore Injection flow and depth must be greater than zero.")
        except (TypeError, ValueError):
            issue("pore.parameters.global", 5, "Whole-scaffold Pore Injection numeric parameters are invalid.")

    supports_enabled = bool(form_params.get("supports"))
    for model in models_metadata if isinstance(models_metadata, list) else []:
        if not isinstance(model, dict):
            continue
        mapping = model.get("scaffoldTools") or {}
        required = {
            mapping.get("perimeter") or model.get("toolhead") or "none",
            mapping.get("infill") or model.get("toolhead") or "none",
            mapping.get("solidInfill") or model.get("toolhead") or "none",
        }
        if supports_enabled:
            required.add(mapping.get("support") or model.get("toolhead") or "none")
        if not (required - {"none", "None", None}):
            issue(
                f"mapping.model.missing.{model.get('id', 'unknown')}",
                3,
                f"Assign a toolhead to model '{model.get('name', model.get('id', 'unknown'))}' before slicing.",
            )
        for tool_id in required - {"none", "None", None}:
            if tool_id not in assigned_tools:
                issue(
                    f"mapping.toolhead.{model.get('id', 'unknown')}.{tool_id}",
                    3,
                    f"Model '{model.get('name', model.get('id', 'unknown'))}' references an unassigned toolhead.",
                )

    try:
        layer_height = float(form_params.get("layer_height", 0.2))
        infill = float(form_params.get("infill", 15))
        nozzle = float(form_params.get("nozzle_diameter", 0.4))
        if not 0.05 <= layer_height <= 0.4:
            issue("settings.layer_height", 4, "Layer height must be between 0.05 and 0.4 mm.")
        if not 0 <= infill <= 100:
            issue("settings.infill", 4, "Infill must be between 0 and 100%.")
        if nozzle <= 0:
            issue("settings.nozzle", 4, "Nozzle diameter must be greater than zero.")
    except (TypeError, ValueError):
        issue("settings.numeric", 4, "One or more numeric print settings are invalid.")

    z_zones = z_zones_for_validation
    if not isinstance(z_zones, list):
        z_zones = []
    for zone in z_zones:
        if not isinstance(zone, dict):
            continue
        try:
            z_start = float(zone.get("zStartMm", 0))
            z_end = float(zone.get("zEndMm", 0))
        except (TypeError, ValueError):
            z_start, z_end = 0, 0
        if z_start < 0 or z_end <= z_start:
            issue(f"zones.range.{zone.get('id', 'unknown')}", 5, "Every Z-zone must have zStart < zEnd.")

        pore = (zone.get("parameterOverride") or {}).get("poreInjection")
        if not isinstance(pore, dict) or not pore.get("enabled"):
            continue
        zone_pattern = ((zone.get("parameterOverride") or {}).get("fdm") or {}).get("infillPattern")
        scope = zone.get("modelScope", "all")
        scoped_models = models_metadata if scope == "all" else [
            model for model in models_metadata
            if isinstance(model, dict) and model.get("id") == scope
        ]
        if scoped_models:
            patterns = [
                zone_pattern
                or (model.get("fdm_settings") or {}).get("infillPattern")
                or form_params.get("infill_pattern", "grid")
                for model in scoped_models
                if isinstance(model, dict)
            ]
        else:
            patterns = [zone_pattern or form_params.get("infill_pattern", "grid")]
        if any(pattern != "grid" for pattern in patterns):
            issue(
                f"pore.pattern.{zone.get('id', 'unknown')}",
                5,
                "Pore Injection requires the GRID infill pattern.",
            )
        syringe_id = pore.get("syringeToolhead", "syringe")
        if syringe_id not in assigned_tools:
            issue(
                f"pore.toolhead.{zone.get('id', 'unknown')}",
                5,
                "Pore Injection requires an assigned syringe toolhead.",
            )
        try:
            if float(pore.get("injectionDepthMm", 0)) <= 0 or float(pore.get("flowRateUlPerCell", 0)) <= 0:
                issue(
                    f"pore.parameters.{zone.get('id', 'unknown')}",
                    5,
                    "Pore Injection flow and depth must be greater than zero.",
                )
        except (TypeError, ValueError):
            issue(
                f"pore.parameters.{zone.get('id', 'unknown')}",
                5,
                "Pore Injection numeric parameters are invalid.",
            )

    return issues


@app.post("/fdm/slice")
def fdm_slice():
    """
    FDM slicing endpoint — accepts STL file(s) + print parameters and
    produces a .gcode file via PrusaSlicer CLI in FFF mode.

    Form fields:
    files[]: STL file(s)
    layer_height: float (mm), e.g. "0.2"
    infill: int (%), e.g. "15"
    nozzle_temp: int (°C), e.g. "210"
    bed_temp: int (°C), e.g. "60"
    infill_pattern: str, e.g. "gyroid"
    perimeters: int, e.g. "3"
    supports: bool str, "true"|"false"
    layer_actions: JSON array of LayerAction objects
    experiment_name, author, intent, material: metadata
    """
    files = request.files.getlist("files[]")
    if not files:
        return jsonify({"error": "No files[] received"}), 400

    form_params = _build_fdm_form_params(request.form)

    validation_issues = _validate_fdm_slice_request(files, form_params)
    if validation_issues:
        return jsonify({"error": "workflow_validation_failed", "issues": validation_issues}), 422
    
    # DEBUG: Log raw request
    import json as debug_json
    _debug_log_to_file("debug_last_request.json", debug_json.dumps({
        "params": form_params,
        "files_count": len(files)
    }, indent=2))


    # FIX #11: Safe job cleanup — protect active jobs, keep last N completed ones.
    # Previously, all jobs were deleted unconditionally even if the user was still
    # viewing the G-code preview from the most recent slice.
    MAX_KEPT_JOBS = 3
    try:
        if JOBS_DIR.exists():
            job_dirs = sorted(
                [d for d in JOBS_DIR.iterdir() if d.is_dir()],
                key=lambda d: d.stat().st_mtime
            )
            completed_job_dirs = [
                d for d in job_dirs
                if d.name in _slice_jobs and _slice_jobs[d.name].get("status") in ("done", "error")
            ]
            # Delete oldest completed jobs beyond the keep limit
            for old_dir in completed_job_dirs[:-MAX_KEPT_JOBS]:
                try:
                    shutil.rmtree(old_dir)
                    _slice_jobs.pop(old_dir.name, None)
                except Exception as e:
                    print(f"[Cleanup] Could not remove {old_dir.name}: {e}")
    except Exception as e:
        print(f"[Cleanup] Error during job cleanup: {e}")

    job_id = uuid.uuid4().hex[:10]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded STL(s)
    saved_stls = []
    for i, f in enumerate(files):
        # Unique name to match the background thread's expectation
        safe_name = f"model_{i}.stl"
        stl_path = job_dir / safe_name
        f.save(stl_path)
        saved_stls.append(stl_path)

    _set_progress(job_id, 0.0, "Queued", status="pending")

    t = threading.Thread(
        target=_run_fdm_slice_job,
        args=(job_id, saved_stls, job_dir, form_params),
        daemon=True,
    )
    t.start()

    return jsonify({"status": "processing", "job_id": job_id})

@app.post("/fdm/preview_pores")
def fdm_preview_pores():
    """
    Endpoint deprecated. Use final slice for pore detection.
    """
    return jsonify({"error": "Endpoint deprecated. Use final slice for pore detection."}), 410


@app.get("/fdm/job/<job_id>/manifest")
def fdm_job_manifest(job_id):
    """Return the FDM job manifest (layer_count, gcode_filename, toolhead_actions, etc.)"""
    job_json = JOBS_DIR / job_id / "job_fdm.json"
    if not job_json.exists():
        return jsonify({"error": "FDM job not found"}), 404
    return jsonify(json.loads(job_json.read_text(encoding="utf-8")))


@app.get("/fdm/job/<job_id>/gcode")
def fdm_job_gcode(job_id):
    """Download the generated G-code file."""
    gcode_path = JOBS_DIR / job_id / "print.gcode"
    if not gcode_path.exists():
        return jsonify({"error": "gcode not found"}), 404
    return send_file(
        str(gcode_path),
        mimetype="text/plain",
        as_attachment=True,
        download_name="print.gcode",
    )


# =============================================================================
# Moonraker Proxy Routes (avoids CORS issues from browser)
# =============================================================================
@app.get("/moonraker/status")
def moonraker_status():
    """Returns Moonraker server info + printer state."""
    try:
        client = get_moonraker()
        info = client.get_server_info()
        status = client.get_print_progress()
        return jsonify({"server": info, "print": status, "connected": True})
    except Exception as e:
        return jsonify({"connected": False, "error": str(e)})


@app.get("/moonraker/printer/status")
def moonraker_printer_status():
    """Detailed Klipper printer object status."""
    try:
        return jsonify(get_moonraker().get_printer_status())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/moonraker/print/start")
def moonraker_start_print():
    """
    Upload the G-code for a job_id to Moonraker and start the print.
    Body JSON: { "job_id": "...", "layer_actions": [...] }
    """
    data = request.json or {}
    job_id = data.get("job_id")
    layer_actions_raw = data.get("layer_actions", [])

    if not job_id:
        return jsonify({"error": "job_id required"}), 400

    gcode_path = JOBS_DIR / job_id / "print.gcode"
    if not gcode_path.exists():
        return jsonify({"error": f"G-code not found for job {job_id}"}), 404

    # Parse layer_height from manifest
    layer_height = 0.2
    manifest_path = JOBS_DIR / job_id / "job_fdm.json"
    layer_count = 0
    if manifest_path.exists():
        mdata = json.loads(manifest_path.read_text(encoding="utf-8"))
        layer_height = mdata.get("layer_height_mm", 0.2)
        layer_count = mdata.get("layer_count", 0)

    # Build LayerAction objects
    layer_actions = []
    for la in layer_actions_raw:
        layer_actions.append(
            LayerAction(
                layer_from=int(la.get("layerFrom", 1)),
                layer_to=int(la.get("layerTo", layer_count)),
                toolhead=la.get("toolhead", "fdm"),
                klipper_tool=la.get("klipper_tool", "T0"),
                uv_exposure_time_sec=float(la.get("uvSettings", {}).get("exposureTimeSec", 0)),
                uv_dose_mjcm2=float(la.get("uvSettings", {}).get("doseTargetMjCm2", 0)),
                uv_pause_print=la.get("uvSettings", {}).get("pausePrint", True),
                pressurization_steps=int(la.get("syringeSettings", {}).get("pressurizationSteps", 0)),
                retraction_steps=int(la.get("syringeSettings", {}).get("retractionSteps", 0)),
                label=la.get("label", ""),
            )
        )

    if not layer_actions:
        layer_actions = build_default_toolhead_actions()

    print_job = PrintJob(
        job_id=job_id,
        gcode_path=str(gcode_path),
        gcode_filename=f"{job_id}_print.gcode",
        layer_count=layer_count,
        layer_height_mm=layer_height,
        layer_actions=layer_actions,
    )

    fm = get_fdm_manager()
    success = fm.start_job(print_job)

    if success:
        return jsonify({"status": "started", "job_id": job_id})
    else:
        return jsonify({"error": fm.state.message}), 500


@app.post("/moonraker/print/dry-run")
def moonraker_print_dry_run():
    """Static safety pass over a generated G-code file; never moves the printer."""
    data = request.json or {}
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400

    job_dir = JOBS_DIR / job_id
    gcode_path = job_dir / "print.gcode"
    manifest_path = job_dir / "job_fdm.json"
    if not gcode_path.exists() or not manifest_path.exists():
        return jsonify({"error": f"Generated job not found: {job_id}"}), 404

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    lines = gcode_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    tool_re = re.compile(r"^T(\d+)\b", re.IGNORECASE)
    move_re = re.compile(r"^G[01]\b", re.IGNORECASE)
    used_tools = {f"T{match.group(1)}" for line in lines if (match := tool_re.match(line.strip()))}
    assigned_tools = set()
    for tool in manifest.get("toolheads", []):
        if not isinstance(tool, dict) or tool.get("slot") is None:
            continue
        klipper_tool = str(tool.get("klipper_tool", "")).upper()
        if klipper_tool.startswith("T"):
            assigned_tools.add(klipper_tool)
        elif str(tool.get("id", "")).lower() == "fdm":
            assigned_tools.add("T0")
        elif str(tool.get("id", "")).lower() == "syringe":
            assigned_tools.add("T1")
        elif str(tool.get("id", "")).lower() == "uv":
            assigned_tools.add("T2")

    issues = []
    unknown_tools = sorted(used_tools - assigned_tools)
    if unknown_tools:
        issues.append({"code": "dry_run.toolhead.unassigned", "severity": "blocked", "message": f"G-code references unassigned toolhead(s): {', '.join(unknown_tools)}."})
    if not any(move_re.match(line.strip()) for line in lines):
        issues.append({"code": "dry_run.gcode.empty", "severity": "blocked", "message": "G-code contains no movement commands."})

    pore_blocks = sum(1 for line in lines if "PORE INJECTION START" in line)
    extrusion_moves = sum(1 for line in lines if move_re.match(line.strip()) and " E" in f" {line} ")
    report = {
        "status": "blocked" if issues else "ready",
        "issues": issues,
        "summary": {
            "lines": len(lines),
            "used_tools": sorted(used_tools),
            "assigned_tools": sorted(assigned_tools),
            "pore_injection_blocks": pore_blocks,
            "extrusion_moves": extrusion_moves,
            "layer_count": manifest.get("layer_count", 0),
        },
    }
    manifest["dry_run"] = {**report, "executed_at": datetime.now(timezone.utc).isoformat()}
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return jsonify(report), 422 if issues else 200


@app.post("/moonraker/print/pause")
def moonraker_pause():
    get_fdm_manager().pause()
    return jsonify({"status": "paused"})


@app.post("/moonraker/print/resume")
def moonraker_resume():
    get_fdm_manager().resume()
    return jsonify({"status": "resumed"})


@app.post("/moonraker/print/cancel")
def moonraker_cancel():
    get_fdm_manager().cancel()
    return jsonify({"status": "cancelled"})


@app.get("/moonraker/print/state")
def moonraker_print_state():
    """Returns the FDM print manager state (progress, layer, toolhead, etc.)."""
    fm = get_fdm_manager()
    s = fm.state
    return jsonify({
        "status": s.status,
        "current_layer": s.current_layer,
        "progress": s.progress,
        "active_toolhead": s.active_toolhead,
        "message": s.message,
        "elapsed_sec": s.elapsed_sec,
    })


@app.post("/moonraker/gcode")
def moonraker_run_gcode():
    """Run arbitrary G-code on the printer via Moonraker."""
    data = request.json or {}
    script = data.get("script", "")
    if not script:
        return jsonify({"error": "script required"}), 400
    try:
        result = get_moonraker().run_gcode(script)
        return jsonify({"status": "ok", "result": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/moonraker/toolhead")
def moonraker_set_toolhead():
    """Activate a toolhead by T-index."""
    data = request.json or {}
    tool = int(data.get("tool", 0))
    try:
        get_moonraker().set_toolhead(tool)
        return jsonify({"status": "ok", "tool": tool})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/moonraker/home")
def moonraker_home():
    """Home axes."""
    data = request.json or {}
    axes = data.get("axes", "XYZ")
    try:
        get_moonraker().home(axes)
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/moonraker/uv")
def moonraker_uv_expose():
    """Trigger UV crosslinker for a given duration."""
    data = request.json or {}
    duration = float(data.get("duration_sec", 0))
    if duration <= 0:
        return jsonify({"error": "duration_sec must be > 0"}), 400
    try:
        get_moonraker().uv_expose(duration)
        return jsonify({"status": "ok", "duration_sec": duration})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/assets/<path:filename>")
def serve_asset(filename):
    """Serve compiled frontend assets from dist/assets/."""
    asset_path = DIST_DIR / "assets" / filename
    if asset_path.exists():
        return send_file(asset_path)
    # Fallback: serve static assets (like reference STLs) from the project root
    return send_file(BASE_DIR / filename)


# ─────────────────────────────────────────────────────────────
# Serve compiled React SPA from dist/
# All non-API routes fall through to index.html (client-side routing)
# ─────────────────────────────────────────────────────────────
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """Serve the compiled React frontend. API routes take precedence."""
    if DIST_DIR.exists():
        target = DIST_DIR / path
        if path and target.exists():
            return send_from_directory(str(DIST_DIR), path)
        return send_from_directory(str(DIST_DIR), "index.html")
    return jsonify({"error": "Frontend not built. Run 'npm run build' first."}), 404


def _wait_for_server(url: str, timeout: float = 10.0):
    """Poll until the Flask server is accepting connections."""
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.2)
    return False


if __name__ == "__main__":
    # Detect if we are running inside PyInstaller bundle
    _bundled = getattr(sys, 'frozen', False)

    # Start Flask in a background daemon thread so the GUI thread stays free
    server_thread = threading.Thread(
        target=lambda: app.run(host="127.0.0.1", port=8000, debug=False, use_reloader=False),
        daemon=True,
    )
    server_thread.start()

    # Wait until the server is ready before opening the window
    if not _wait_for_server("http://127.0.0.1:8000"):
        print("[FATAL] Flask server failed to start.")
        sys.exit(1)

    # When bundled, show a native desktop window via pywebview
    if _bundled:
        import webview
        webview.create_window(
            title=" ",
            url="http://127.0.0.1:8000",
            width=1400,
            height=900,
            min_size=(1000, 650),
            text_select=True,
        )
        webview.start()
    else:
        # Development mode: open the system browser
        import webbrowser
        print("Starting F3D Studio Server...")
        print(" Frontend : http://localhost:8000")
        webbrowser.open("http://localhost:8000")
        # Keep the main thread alive in dev mode
        server_thread.join()
