import uuid
import os
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

BASE_DIR = Path(__file__).resolve().parent

# Configuracion
PRUSA_SLICER_CONSOLE = str(BASE_DIR / "PrusaSlicer-2.9.3" / "prusa-slicer-console.exe")
DEFAULT_CONFIG_INI = str(BASE_DIR / "config.ini")
FDM_CONFIG_INI = str(BASE_DIR / "config.ini")   # NEW: FDM uses the replaced config.ini array

JOBS_DIR = BASE_DIR / "jobs"
JOBS_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
CORS(app)  # Habilita CORS para todas las rutas


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


def ensure_local_config():
    """Asegura BASE_DIR/config.ini para que la app sea autocontenida."""
    config_path = BASE_DIR / "config.ini"
    if not config_path.exists():
        src = Path(DEFAULT_CONFIG_INI)
        if not src.exists():
            # Si no existe el default, creamos uno basico dummy para evitar crash
            print(f"WARNING: No existe DEFAULT_CONFIG_INI: {src}")
            with open(config_path, 'w') as f:
                f.write("printer_technology = SLA\n")
        else:
            shutil.copy(src, config_path)
    return config_path


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
        for line in result.stdout.split('\n'):
            if not line.strip():
                continue
            parts = line.split(':')
            if len(parts) >= 3:
                ssid = parts[0].replace('\\:', ':') # unescape colons
                if not ssid:
                     continue
                signal = parts[1]
                security = parts[2]
                networks.append({"ssid": ssid, "signal": signal, "security": security})
        
        unique_networks = {}
        for net in networks:
            ssid = net["ssid"]
            unique_networks[ssid] = net
            
        sorted_networks = sorted(unique_networks.values(), key=lambda x: int(x["signal"]) if x["signal"].isdigit() else 0, reverse=True)
            
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
#  FDM Slicing Routes (BioFFF Studio)
# =============================================================================

def _run_fdm_slice_job(job_id: str, stl_path: Path, job_dir: Path, form_params: dict):
    """Background worker: slice STL with PrusaSlicer in FDM mode → .gcode."""
    import traceback, time as _t
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
                encoding="utf-8"
            )

        gcode_out = job_dir / "print.gcode"

        layer_height   = form_params.get("layer_height", "0.2")
        infill         = form_params.get("infill", "15")
        nozzle_temp    = form_params.get("nozzle_temp", "210")
        bed_temp       = form_params.get("bed_temp", "60")
        supports_raw   = form_params.get("supports")
        supports       = (supports_raw is True or supports_raw == "true" or supports_raw == "1")
        
        infill_pattern = form_params.get("infill_pattern", "gyroid")
        perimeters     = form_params.get("perimeters", "3")
        models_meta    = json.loads(form_params.get("models_metadata", "[]"))

        # Build a unified config file to override PrusaSlicer's priority system
        # PrusaSlicer processes CLI args first, then --load files. This means --load 
        # completely wipes out CLI arguments! We must write overrides into the INI.
        job_config_ini = job_dir / "job_config.ini"
        
        overrides_dict = {
            "layer_height": str(layer_height),
            "fill_density": f"{infill}%",
            "temperature": str(nozzle_temp),
            "first_layer_temperature": str(nozzle_temp),
            "bed_temperature": str(bed_temp),
            "fill_pattern": str(infill_pattern),
            "perimeters": str(perimeters),
            "nozzle_diameter": str(form_params.get("nozzle_diameter", "0.4")),
            "support_material": "1" if supports else "0"
        }
        
        config_lines = []
        applied_overrides = set()
        
        if fdm_config and fdm_config.exists():
            with open(fdm_config, 'r', encoding='utf-8') as f:
                for line in f.readlines():
                    line_strip = line.strip()
                    if line_strip == "[Hardware]":
                        break
                        
                    if "=" in line_strip and not line_strip.startswith("#"):
                        key = line_strip.split("=")[0].strip()
                        if key in overrides_dict:
                            # Replace the line in-place
                            config_lines.append(f"{key} = {overrides_dict[key]}\n")
                            applied_overrides.add(key)
                        else:
                            config_lines.append(line)
                    else:
                        config_lines.append(line)
        else:
            config_lines = ["# Minimal FDM Profile\n", "printer_technology = FFF\n", "gcode_flavor = klipper\n", "use_relative_e_distances = 1\n"]
            
        # Append any overrides that were NOT found in the original file
        missing_overrides = [k for k in overrides_dict.keys() if k not in applied_overrides]
        if missing_overrides:
            config_lines.append("\n# --- Added by UI ---\n")
            for k in missing_overrides:
                config_lines.append(f"{k} = {overrides_dict[k]}\n")

        with open(job_config_ini, 'w', encoding='utf-8') as f:
            f.writelines(config_lines)

        cmd = [
            PRUSA_SLICER_CONSOLE,
            "--load", str(job_config_ini),
            "--export-gcode",
            "--dont-arrange",
            "--output", str(gcode_out),
        ]

        # Process and apply transforms to STLs directly
        import math
        from stl import mesh

        if models_meta:
            for meta in models_meta:
                f_name = secure_filename(meta.get("name", ""))
                if f_name:
                    f_path = job_dir / f_name
                    if f_path.exists():
                        try:
                            # Load and transform STL to match UI
                            m = mesh.Mesh.from_file(str(f_path))
                            
                            # 1. Center the raw geometry first
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
                            if r.get("x"): m.rotate([1, 0, 0], math.radians(r.get("x")))
                            if r.get("z"): m.rotate([0, 0, 1], math.radians(r.get("z")))
                            if r.get("y"): m.rotate([0, 1, 0], math.radians(r.get("y")))
                            
                            # 4. Snap to Z=0 after rotation to ensure it prints flat
                            min_z = m.z.min()
                            m.z -= min_z
                            
                            # 5. Translate (Bed center is 50,50 for 100x100)
                            m.x += p.get("x", 0.0) + 50.0
                            m.y += p.get("y", 0.0) + 50.0
                            m.z += p.get("z", 0.0)
                            
                            # Save back and append to cmd
                            m.save(str(f_path))
                            cmd.append(str(f_path))
                        except Exception as e:
                            print(f"[FDM SLICE] Error applying transforms to {f_name}: {e}")
                            cmd.append(str(f_path))
        else:
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
        layer_actions_raw = json.loads(form_params.get("layer_actions", "[]"))
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
        }
        (job_dir / "job_fdm.json").write_text(json.dumps(job_manifest, indent=2), encoding="utf-8")

        _set_progress(job_id, 1.0,
                      f"Done — {layer_count} layers, {filament_used:.0f}mm filament",
                      status="done")

    except Exception as e:
        traceback.print_exc()
        _set_progress(job_id, 0.0, f"FDM Slice error: {e}", status="error")


@app.post("/fdm/slice")
def fdm_slice():
    """
    FDM slicing endpoint — accepts a single STL + print parameters and
    produces a .gcode file via PrusaSlicer CLI in FFF mode.

    Form fields:
      files[]:         STL file(s)
      layer_height:    float (mm), e.g. "0.2"
      infill:          int (%), e.g. "15"
      nozzle_temp:     int (°C), e.g. "210"
      bed_temp:        int (°C), e.g. "60"
      infill_pattern:  str, e.g. "gyroid"
      perimeters:      int, e.g. "3"
      supports:        bool str, "true"|"false"
      layer_actions:   JSON array of LayerAction objects
      experiment_name, author, intent, material: metadata
    """
    files = request.files.getlist("files[]")
    if not files:
        return jsonify({"error": "No files[] received"}), 400

    form_params = {
        "layer_height":   request.form.get("layer_height", "0.2"),
        "infill":         request.form.get("infill", "15"),
        "nozzle_temp":    request.form.get("nozzle_temp", "210"),
        "bed_temp":       request.form.get("bed_temp", "60"),
        "infill_pattern": request.form.get("infill_pattern", "gyroid"),
        "perimeters":     request.form.get("perimeters", "3"),
        "supports":       request.form.get("supports", "false") == "true",
        "layer_actions":  request.form.get("layer_actions", "[]"),
        "models_metadata": request.form.get("models_metadata", "[]"),
        "nozzle_diameter": request.form.get("nozzle_diameter", "0.4"),
    }

    # Limit to 1 job: Clean up previous ones
    try:
        if JOBS_DIR.exists():
            for item in JOBS_DIR.iterdir():
                if item.is_dir():
                    shutil.rmtree(item)
                elif item.name != "history.db":
                    item.unlink()
    except Exception as e:
        print(f"Cleanup error: {e}")

    job_id = uuid.uuid4().hex[:10]
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Save uploaded STL(s)
    saved_stl = None
    for i, f in enumerate(files):
        safe_name = secure_filename(f.filename) or f"model_{i}.stl"
        stl_path = job_dir / safe_name
        f.save(stl_path)
        if saved_stl is None:
            saved_stl = stl_path  # Use first file for now

    _set_progress(job_id, 0.0, "Queued", status="pending")

    t = threading.Thread(
        target=_run_fdm_slice_job,
        args=(job_id, saved_stl, job_dir, form_params),
        daemon=True
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
    return send_file(str(gcode_path), mimetype="text/plain",
                     as_attachment=True, download_name="print.gcode")


# =============================================================================
#  Moonraker Proxy Routes  (avoids CORS issues from browser)
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
        layer_actions.append(LayerAction(
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
        ))

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


if __name__ == "__main__":
    print(f"Starting BioFFF Studio Server...")
    print(f"  DLP3 Legacy Config INI : {DEFAULT_CONFIG_INI}")
    print(f"  FDM Profile INI        : {FDM_CONFIG_INI}")
    print(f"  PrusaSlicer Console    : {PRUSA_SLICER_CONSOLE}")
    print(f"  Moonraker URL          : (lazy-init from [Hardware] rpi_ip)")
    app.run(host="127.0.0.1", port=8000, debug=True)
