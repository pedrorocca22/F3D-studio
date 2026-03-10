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
import sqlite3
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent

# Configuracion
PRUSA_SLICER_CONSOLE = str(BASE_DIR / "PrusaSlicer-2.9.3" / "prusa-slicer-console.exe")
DEFAULT_CONFIG_INI = str(BASE_DIR / "config.ini")
FDM_CONFIG_INI = str(BASE_DIR / "config_fdm.ini")   # NEW: FDM profile

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
# Database Initialization (History)
# ----------------------------
def get_db():
    conn = sqlite3.connect(str(JOBS_DIR / "history.db"), timeout=10)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as db:
        db.execute('''
        CREATE TABLE IF NOT EXISTS experiments (
            id TEXT PRIMARY KEY,
            name TEXT,
            author TEXT,
            intent TEXT,
            status TEXT,
            material TEXT,
            config_snapshot TEXT,
            patterns_snapshot TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            rating INTEGER
        )
        ''')
        
        # Safely add the column if it doesn't exist for existing databases
        try:
            db.execute("ALTER TABLE experiments ADD COLUMN author TEXT")
        except sqlite3.OperationalError:
            pass  # Column likely already exists
            
        db.commit()

init_db()

# ----------------------------
# Job progress tracking
# ----------------------------
_slice_jobs: dict = {}  # job_id -> {status, progress, message, error}

def _set_progress(job_id: str, progress: float, message: str, status: str = "running"):
    """Thread-safe progress update (CPython GIL makes dict assignment atomic)."""
    _slice_jobs[job_id] = {"status": status, "progress": round(progress, 3), "message": message}
    
    # We only want to update the experiment DB status when the slicing represents a definitive state.
    # We will use "printing" or "done" as terminal states for the EXPERIMENT later triggered by endpoints, 
    # but if slicing fails ("error") or finishes ("sliced") we log that here.
    try:
        if status in ["error", "done"]:
            db_status = "sliced" if status == "done" else "slicing_error"
            with get_db() as db:
                db.execute("UPDATE experiments SET status = ? WHERE id = ?", (db_status, job_id))
                db.commit()
    except Exception as e:
        print(f"Error updating db for job {job_id}: {e}")


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


# Experiments API (History)
# ----------------------------
@app.get("/api/experiments")
def get_experiments():
    with get_db() as db:
        rows = db.execute("SELECT id, name, author, intent, status, material, created_at, rating FROM experiments ORDER BY created_at DESC").fetchall()
        return jsonify([dict(r) for r in rows])

@app.get("/api/experiments/<experiment_id>")
def get_experiment(experiment_id):
    with get_db() as db:
        row = db.execute("SELECT * FROM experiments WHERE id = ?", (experiment_id,)).fetchone()
        if not row:
            return jsonify({"error": "Experiment not found"}), 404
        data = dict(row)
        if data.get("config_snapshot"):
            data["config_snapshot"] = json.loads(data["config_snapshot"])
        if data.get("patterns_snapshot"):
            data["patterns_snapshot"] = json.loads(data["patterns_snapshot"])
        return jsonify(data)

@app.post("/api/experiments/<experiment_id>/evaluate")
def evaluate_experiment(experiment_id):
    req = request.json or {}
    rating = req.get("rating")
    notes = req.get("notes")
    with get_db() as db:
        db.execute("UPDATE experiments SET rating = ?, notes = ? WHERE id = ?", (rating, notes, experiment_id))
        db.commit()
    return jsonify({"status": "success"})

@app.delete("/api/experiments/<experiment_id>")
def delete_experiment(experiment_id):
    with get_db() as db:
        db.execute("DELETE FROM experiments WHERE id = ?", (experiment_id,))
        db.commit()
    # Try to delete the physical files as well
    job_dir = JOBS_DIR / experiment_id
    try:
        if job_dir.exists() and job_dir.is_dir():
            shutil.rmtree(job_dir)
    except Exception as e:
        print(f"Could not delete physical job folder {job_dir}: {e}")
    return jsonify({"status": "deleted"})



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

        cmd = [
            PRUSA_SLICER_CONSOLE,
            "--load", str(fdm_config),
            "--export-gcode",
            "--layer-height", layer_height,
            "--fill-density", f"{infill}%",
            "--temperature", nozzle_temp,
            "--first-layer-temperature", nozzle_temp,
            "--bed-temperature", bed_temp,
            "--fill-pattern", infill_pattern,
            "--perimeters", perimeters,
            "--nozzle-diameter", form_params.get("nozzle_diameter", "0.4"),
            "--output", str(gcode_out),
        ]

        # Use the models metadata to apply transforms
        if models_meta:
            for meta in models_meta:
                t = meta.get("transform", {})
                s = t.get("scale", {"x": 1, "y": 1, "z": 1})
                r = t.get("rotation", {"x": 0, "y": 0, "z": 0})
                
                # Apply rotation (x, y, z in degrees)
                if r.get("x"): cmd.extend(["--rotate-x", str(r["x"])])
                if r.get("y"): cmd.extend(["--rotate-y", str(r["y"])])
                if r.get("z"): cmd.extend(["--rotate-z", str(r["z"])])
                
                # Apply scale (using factor as percentage, e.g. 1.0 -> 100%)
                sx, sy, sz = s.get("x", 1), s.get("y", 1), s.get("z", 1)
                cmd.extend(["--scale", f"{sx*100}%"])
                
                # Append the specific file for this meta
                f_name = secure_filename(meta.get("name", ""))
                if f_name:
                    f_path = job_dir / f_name
                    if f_path.exists():
                        cmd.append(str(f_path))
        else:
            # Fallback if no metadata (shouldn't happen with updated UI)
            cmd.append(str(stl_path))

        if supports:
            cmd.append("--support-material")

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

    experiment_name = request.form.get("experiment_name", "FDM Experiment")
    author = request.form.get("author", "")
    intent = request.form.get("intent", "")
    material = request.form.get("material", "")

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

    # Register experiment
    try:
        with get_db() as db:
            db.execute(
                "INSERT INTO experiments (id, name, author, intent, material, status) VALUES (?, ?, ?, ?, ?, ?)",
                (job_id, experiment_name, author, intent, material, "pending")
            )
            db.commit()
    except Exception as e:
        print(f"FDM experiment register error: {e}")

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
        try:
            with get_db() as db:
                db.execute("UPDATE experiments SET status = 'printing' WHERE id = ?", (job_id,))
                db.commit()
        except Exception as e:
            print(f"DB update error: {e}")
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
