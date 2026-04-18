import uuid
import traceback
import os
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

import numpy as np
from stl import mesh
from flask import Flask, render_template, request, redirect, url_for, send_file, abort, jsonify
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps

from flask_cors import CORS
from moonraker_client import MoonrakerClient
from fdm_print_manager import FDMPrintManager, PrintJob, LayerAction, build_default_toolhead_actions
from datetime import datetime

def _debug_log_to_file(filename, content):
    try:
        with open(filename, "w", encoding="utf-8") as f:
            f.write(content)
    except:
        pass

BASE_DIR = Path(__file__).resolve().parent

# Configuracion
PRUSA_SLICER_CONSOLE = str(BASE_DIR / "PrusaSlicer-2.9.3" / "prusa-slicer-console.exe")
DEFAULT_CONFIG_INI = str(BASE_DIR / "config.ini")
FDM_CONFIG_INI = str(BASE_DIR / "config.ini")  # NEW: FDM uses the replaced config.ini array

JOBS_DIR = BASE_DIR / "jobs"
JOBS_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
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
    if value is None:
        return None

    raw = str(value).strip().lower()
    if raw in ("", "default", "inherit", "none"):
        return None

    mapping = {
        "rectilinear": "rectilinear",
        "grid": "grid",
        "gyroid": "gyroid",
        "honeycomb": "honeycomb",
    }
    return mapping.get(raw, raw)


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
    toolhead_to_extruder = {
        "fdm": 0,
        "syringe": 1,
        "uv": 2,
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
                        if "infillPercent" in fdm_s:
                            ranges_xml_lines.append(f'      <option opt_key="fill_density">{fdm_s["infillPercent"]}%</option>')
                        if "infillPattern" in fdm_s:
                            ranges_xml_lines.append(f'      <option opt_key="fill_pattern">{_normalize_fill_pattern(fdm_s["infillPattern"])}</option>')
                        
                        # Layer Height (Clon Prusa)
                        ranges_xml_lines.append(f'      <option opt_key="layer_height">{layer_height}</option>')
                        
                        # Extruder (Base-0)
                        primary = (mapping.get("perimeter") or mapping.get("infill") or "fdm").lower()
                        ranges_xml_lines.append(f'      <option opt_key="extruder">{toolhead_to_extruder.get(primary, 0)}</option>')
                        
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


def _sanitize_gcode_with_schedule(gcode_path: Path, layer_actions: list, toolheads_config: list = None):
    """
    Apply Priority: Layer Schedule > Scaffold Mapping.
    Only feature_override actions should force tool changes.
    Parameter overrides must not inject T0/T1/T2 commands.
    """
    if not layer_actions:
        return

    overrides = {}
    events = {} # {layer: [gcode_lines]}

    # Map toolhead IDs to their temperatures
    temps = {}
    if toolheads_config:
        for th in toolheads_config:
            # Check for FDM temperature
            if th.get("id") == "fdm":
                temps["fdm"] = th.get("defaultTemperature")
            elif th.get("id") == "syringe":
                # syringe might not have temp, but fdm/nozzle often used as reference
                pass

    for item in layer_actions:
        # Support both legacy LayerAction and new ResolvedModelPlan formats
        ranges = []
        if "ranges" in item:
            # New format: loop through all ranges of the plan
            ranges = item["ranges"]
        else:
            # Legacy format: single action
            ranges = [item]

        for r in ranges:
            try:
                # Resolve Toolhead
                tool = "fdm"
                if "toolOverride" in r: 
                    tool = r["toolOverride"]
                elif "settings" in r and "mapping" in r["settings"]:
                    # In ResolvedModelPlan, we look at mapping.perimeter as primary
                    tool = r["settings"]["mapping"].get("perimeter", "fdm")
                else:
                    tool = r.get("toolhead") or "fdm"

                lyr_from = int(r.get("layerFrom", 1))
                lyr_to = int(r.get("layerTo", 1))

                t_cmd = "T0"
                if tool == "syringe":
                    t_cmd = "T1"
                elif tool == "uv":
                    t_cmd = "T2"

                # If we have a temperature for this tool, inject it
                if tool in temps and temps[tool]:
                    t_cmd += f"\nM104 S{temps[tool]} ; Set temperature for {tool}"

                for lyr in range(lyr_from, lyr_to + 1):
                    overrides[lyr] = t_cmd

                # Resolve UV Events / Macros (if present in Plan format)
                settings = r.get("settings", {})
                uv = settings.get("uv") or r.get("uvSettings")
                gcode_cmds = []
                
                if uv:
                    dur = uv.get("exposureTimeSec", 5)
                    pause = uv.get("pausePrint", True)
                    gcode_cmds.append(f"; --- UV EVENT AT LAYER {lyr_from} ---")
                    if pause: gcode_cmds.append("M0 ; Pause for UV exposure")
                    gcode_cmds.append("T2 ; Switch to UV head")
                    gcode_cmds.append(f"G4 P{int(dur * 1000)} ; Exposure for {dur}s")
                
                pre = settings.get("preMacro") or r.get("preMacro")
                if pre: gcode_cmds.append(str(pre))
                post = settings.get("postMacro") or r.get("postMacro")
                if post: gcode_cmds.append(str(post))

                if gcode_cmds:
                    if lyr_from not in events: events[lyr_from] = []
                    events[lyr_from].extend(gcode_cmds)

            except (ValueError, TypeError, KeyError):
                continue

    if not overrides and not events:
        return

    lines = gcode_path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    output = []
    current_layer = 0

    for line in lines:
        # Detect any common layer change markers used by different slicers/versions
        is_layer_marker = ";LAYER_CHANGE" in line or "; LAYER_CHANGE" in line or ";LAYER:" in line
        if is_layer_marker:
            current_layer += 1
            output.append(line)
            
            # 1. Inject Tool Change from Schedule 
            if current_layer in overrides:
                output.append(f"{overrides[current_layer]} ; Forced by Layer Schedule\n")
            
            # 2. Inject Process Events (UV, Macros)
            if current_layer in events:
                for cmd in events[current_layer]:
                    output.append(f"{cmd}\n")
            continue

        if current_layer in overrides:
            stripped = line.strip()
            # Suppress any existing toolchanges if we have an override for this layer
            if re.match(r"^T[0-9]+", stripped):
                output.append(f"; {stripped} ; Suppressed by Schedule priority\n")
                continue

        output.append(line)

    gcode_path.write_text("".join(output), encoding="utf-8")


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
def _run_fdm_slice_job(job_id: str, stl_paths: list, job_dir: Path, form_params: dict):
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
        infill = form_params.get("infill", "15")
        nozzle_temp = form_params.get("nozzle_temp", "210")
        bed_temp = form_params.get("bed_temp", "60")
        supports_raw = form_params.get("supports")
        supports = (supports_raw is True or supports_raw == "true" or supports_raw == "1")

        infill_pattern = form_params.get("infill_pattern", "gyroid")
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
            "fan_always_on": str(form_params.get("fan_always_on", "1")),
            "min_fan_speed": str(form_params.get("min_fan_speed", "100")),
            "max_fan_speed": str(form_params.get("max_fan_speed", "100")),
            "disable_fan_first_layers": str(form_params.get("disable_fan_first_layers", "1")),
            "toolchange_gcode": "T[next_extruder]",
        }

        # ── Per-feature extruder assignment (Scaffold mode) ──
        # If any model carries scaffoldTools, apply PrusaSlicer's per-feature extruder keys.
        scaffold_tools = None
        for meta in models_meta:
            st = meta.get("scaffoldTools") or meta.get("scaffold_tools")
            if st:
                scaffold_tools = st
                break

        if scaffold_tools:
            th_to_ext = {"fdm": "1", "syringe": "2", "uv": "3", "none": "1"}
            overrides_dict["perimeter_extruder"] = th_to_ext.get(scaffold_tools.get("perimeter", "fdm"), "1")
            overrides_dict["infill_extruder"] = th_to_ext.get(scaffold_tools.get("infill", "fdm"), "1")
            overrides_dict["solid_infill_extruder"] = th_to_ext.get(scaffold_tools.get("solidInfill", "fdm"), "1")
            overrides_dict["support_material_extruder"] = th_to_ext.get(scaffold_tools.get("support", "fdm"), "1")
            print(f"[FDM SLICE] Scaffold tools applied: perimeter={overrides_dict['perimeter_extruder']}, "
                  f"infill={overrides_dict['infill_extruder']}, solid={overrides_dict['solid_infill_extruder']}, "
                  f"support={overrides_dict['support_material_extruder']}")

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
                            "bedMinY": float(m.y.min()),
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
        p = subprocess.run(cmd, capture_output=True, text=True)
        elapsed = _t.time() - t0
        print(f"[TIMING] FDM slice: {elapsed:.2f}s")

        if p.returncode != 0 or not gcode_out.exists():
            print(f"FDM Slice Error:\nSTDOUT: {p.stdout}\nSTDERR: {p.stderr}")
            _set_progress(job_id, 0.0, f"PrusaSlicer FDM failed: {p.stderr[:300]}", status="error")
            return

        # correctly positioned relative to the bed origin.

        # ── Apply Layer Schedule Priority over Scaffold Mapping ──
        # Use full layer plans if available for more accurate toolhead switching
        sanitizer_actions = layer_plans if layer_plans else layer_actions_raw
        if sanitizer_actions:
            _set_progress(job_id, 0.95, "Applying layer schedule overrides...")
            _sanitize_gcode_with_schedule(gcode_out, sanitizer_actions, toolheads_config)

        # ── Pore Injection Post-Processing ──
        pore_models = [
            {
                **entry["poreParams"],
                "bedMinX": entry.get("bedMinX", 0.0),
                "bedMinY": entry.get("bedMinY", 0.0),
            }
            for entry in consolidated_data
            if entry.get("poreDepositionEnabled") and entry.get("poreParams")
        ]
        if pore_models:
            _set_progress(job_id, 0.97, f"Injecting pores into scaffold (T1)...")
            _inject_pores_in_gcode(gcode_out, pore_models)

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
        job_manifest = {
            "job_id": job_id,
            "type": "fdm",
            "gcode_filename": gcode_out.name,
            "gcode_path": str(gcode_out),
            "layer_count": layer_count,
            "layer_height_mm": float(layer_height),
            "filament_used_mm": filament_used,
            "toolhead_actions": layer_actions_raw,
            "created_at": datetime.utcnow().isoformat(),
            "xy_compensation": {
                "applied": False,
                "bed_center_x": bed_center_x,
                "bed_center_y": bed_center_y,
            },
        }
        (job_dir / "job_fdm.json").write_text(json.dumps(job_manifest, indent=2), encoding="utf-8")

        _set_progress(
            job_id,
            1.0,
            f"Done — {layer_count} layers, {filament_used:.0f}mm filament",
            status="done",
        )

    except Exception as e:
        traceback.print_exc()
        _set_progress(job_id, 0.0, f"FDM Slice error: {e}", status="error")




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

    form_params = {
        "layer_height": request.form.get("layer_height", "0.2"),
        "infill": request.form.get("infill", "15"),
        "nozzle_temp": request.form.get("nozzle_temp", "210"),
        "bed_temp": request.form.get("bed_temp", "60"),
        "infill_pattern": request.form.get("infill_pattern", "gyroid"),
        "perimeters": request.form.get("perimeters", "3"),
        "supports": request.form.get("supports", "false") == "true",
        "layer_actions": request.form.get("layer_actions", "[]"),
        "resolved_layer_plans": request.form.get("resolved_layer_plans", "[]"),  # FIX: was missing — segments never reached the slicer
        "models_metadata": request.form.get("models_metadata", "[]"),
        "nozzle_diameter": request.form.get("nozzle_diameter", "0.4"),
        "first_layer_height": request.form.get("first_layer_height", "0.3"),
        "skirt_count": request.form.get("skirt_count", "1"),
        "skirt_distance": request.form.get("skirt_distance", "6"),
        "brim_width": request.form.get("brim_width", "0"),
        "top_shell": request.form.get("top_shell", "3"),
        "bottom_shell": request.form.get("bottom_shell", "3"),
        "fill_angle": request.form.get("fill_angle", "45"),
        "first_layer_speed": request.form.get("first_layer_speed", "20"),
        "perimeter_speed": request.form.get("perimeter_speed", "45"),
        "external_perimeter_speed": request.form.get("external_perimeter_speed", "25"),
        "infill_speed": request.form.get("infill_speed", "80"),
        "travel_speed": request.form.get("travel_speed", "130"),
        "retract_length": request.form.get("retraction_length", "1.0"),
        "retract_speed": request.form.get("retraction_speed", "45"),
        "extrusion_multiplier": request.form.get("extrusion_multiplier", "1.0"),
        "fan_always_on": request.form.get("fan_always_on", "1"),
        "min_fan_speed": request.form.get("min_fan_speed", "100"),
        "max_fan_speed": request.form.get("max_fan_speed", "100"),
        "disable_fan_first_layers": request.form.get("disable_fan_first_layers", "1"),
    }
    
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
    """Serve static assets (like reference STLs) from the project root."""
    return send_file(BASE_DIR / filename)


if __name__ == "__main__":
    print("Starting BioFFF Studio Server...")
    print(f" DLP3 Legacy Config INI : {DEFAULT_CONFIG_INI}")
    print(f" FDM Profile INI : {FDM_CONFIG_INI}")
    print(f" PrusaSlicer Console : {PRUSA_SLICER_CONSOLE}")
    print(" Moonraker URL : (lazy-init from [Hardware] rpi_ip)")
    app.run(host="127.0.0.1", port=8000, debug=True)
