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
from print_manager import PrintManager
from pattern_engine import PatternEngine
import sqlite3
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent

# Configuracion
# NOTA: Asegurate de que estas rutas sean correctas en tu maquina
PRUSA_SLICER_CONSOLE = str(BASE_DIR / "PrusaSlicer-2.9.3" / "prusa-slicer-console.exe")
DEFAULT_CONFIG_INI = str(BASE_DIR / "config.ini")

JOBS_DIR = BASE_DIR / "jobs"
JOBS_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
CORS(app)  # Habilita CORS para todas las rutas

# Initialize Print Manager
print_manager = PrintManager(DEFAULT_CONFIG_INI)

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


# ----------------------------
# STL transform helpers (Plan B)
# ----------------------------
# ----------------------------
# STL transform helpers (Optimized with NumPy)
# ----------------------------

def transform_stl_to_scene(
    in_stl: Path,
    out_stl: Path,
    *,
    scale: float = 1.0,
    target_center_xy=(0.0, 0.0),
    rotation=(0.0, 0.0, 0.0), # degrees x, y, z (in Three.js / data space)
    align_min_z_to_0: bool = True,
    rotate_flat: bool = False
):
    try:
        # Load the STL file using numpy-stl
        model_mesh = mesh.Mesh.from_file(str(in_stl))
    except Exception as e:
        print(f"Error loading STL {in_stl}: {e}")
        return

    # -----------------------------------------------------------------------
    # COORDINATE SYSTEM
    # Raw STL = Z-up world (X=right, Y=depth, Z=up)
    # Three.js viewport = Y-up world (X=right, Y=up, Z=depth)
    # 
    # When Three.js loads the STL it applies RotX(-90) to convert Z-up -> Y-up.
    # User rotations (rx, ry, rz from TransformData) are in Three.js Y-up space.
    # We must:
    #   1. Map STL to Three.js space:  RotX(-90)
    #   2. Apply user rotation in Three.js space: Rz @ Ry @ Rx
    #   3. Map back to slicer Z-up:    RotX(+90)
    # Combined: M_final = RotX(90) @ M_user @ RotX(-90)
    # -----------------------------------------------------------------------

    def get_rotation_matrix_3x3(axis, theta_deg):
        """Return a 3x3 rotation matrix (standard column-vector convention)."""
        theta = np.radians(theta_deg)
        c, s = np.cos(theta), np.sin(theta)
        if axis == 'x':
            return np.array([[1,0,0],[0,c,-s],[0,s,c]], dtype=np.float64)
        elif axis == 'y':
            return np.array([[c,0,s],[0,1,0],[-s,0,c]], dtype=np.float64)
        elif axis == 'z':
            return np.array([[c,-s,0],[s,c,0],[0,0,1]], dtype=np.float64)
        return np.eye(3, dtype=np.float64)

    # User rotations from frontend (Three.js Y-up space, XYZ Euler order)
    # IMPORTANT: Frontend TransformData applies a Y<->Z axis swap for rendering:
    #   rotation.x -> Three.js X rotation (correct, no swap)
    #   rotation.y -> Three.js Z rotation (swap! Data Y <-> Three.js Z)
    #   rotation.z -> Three.js Y rotation (swap! Data Z <-> Three.js Y)
    rx, ry, rz = rotation
    Rx = get_rotation_matrix_3x3('x', rx)   # Data X -> Three.js X (no swap)
    Ry = get_rotation_matrix_3x3('z', ry)   # Data Y -> Three.js Z  (swapped)
    Rz = get_rotation_matrix_3x3('y', rz)   # Data Z -> Three.js Y  (swapped)
    # Euler XYZ intrinsic order (as applied in Three.js rotGroupRef.current.rotation.set)
    M_user = Rz @ Ry @ Rx

    # Coordinate space bridge matrices
    M_to_ui   = get_rotation_matrix_3x3('x', -90)  # STL Z-up  -> Three.js Y-up
    M_to_zup  = get_rotation_matrix_3x3('x', +90)  # Three.js Y-up -> STL Z-up

    # Final rotation in Z-up slicer space
    M_final = M_to_zup @ M_user @ M_to_ui

    print(f"[DEBUG] Rotation applied (rx={rx}, ry={ry}, rz={rz}), Scale: {scale}", flush=True)

    # --- STEP 1: Center the raw STL at origin (in original Z-up coords) ---
    min_x, max_x = model_mesh.x.min(), model_mesh.x.max()
    min_y, max_y = model_mesh.y.min(), model_mesh.y.max()
    min_z, max_z = model_mesh.z.min(), model_mesh.z.max()
    center = np.array([(min_x + max_x)/2, (min_y + max_y)/2, (min_z + max_z)/2])
    model_mesh.translate(-center)

    # --- STEP 2: Apply combined rotation ---
    # numpy-stl.transform expects a 4x4 matrix and uses row-vector convention:
    #   v_new_row = v_old_row @ M.T
    # which is equivalent to the column-vector: v_new = M @ v_old
    M4 = np.eye(4, dtype=np.float64)
    M4[:3, :3] = M_final
    model_mesh.transform(M4)

    # --- STEP 3: Apply scale (now in Z-up slicer space after rotation) ---
    # After rotation the axes in the mesh ARE the slicer X/Y/Z, so we
    # scale all vertex X/Y/Z coordinates directly.
    if isinstance(scale, (float, int)):
        if scale != 1.0:
            model_mesh.points *= scale
    elif isinstance(scale, (tuple, list)) and len(scale) == 3:
        # Non-uniform scale: sx/sy/sz are in SLICER Z-up space.
        # In the frontend TransformData:
        #   scale.x -> slicer X (bed width)
        #   scale.y -> slicer Y (bed depth)  [Three.js Z -> Data Y]
        #   scale.z -> slicer Z (print height)[Three.js Y -> Data Z]
        sx, sy, sz = scale
        # model_mesh.vectors has shape (N, 3, 3): N triangles, 3 vertices, xyz
        model_mesh.vectors[:, :, 0] *= sx  # scale X
        model_mesh.vectors[:, :, 1] *= sy  # scale Y (bed depth)
        model_mesh.vectors[:, :, 2] *= sz  # scale Z (height)

    # --- STEP 4: Place object center at target XY on the bed ---
    # The object is now centered at (0,0,z_offset); translate X and Y only.
    tx, ty = target_center_xy
    model_mesh.translate(np.array([tx, ty, 0]))

    # --- STEP 5: Align bottom face to Z=0 (floor of the build plate) ---
    if align_min_z_to_0:
        current_z_min = model_mesh.z.min()
        if abs(current_z_min) > 1e-6:
            model_mesh.translate(np.array([0, 0, -current_z_min]))

    # Save the transformed STL
    model_mesh.save(str(out_stl))

    # Debug summary
    bb_min = np.array([model_mesh.x.min(), model_mesh.y.min(), model_mesh.z.min()])
    bb_max = np.array([model_mesh.x.max(), model_mesh.y.max(), model_mesh.z.max()])
    print(f"[DEBUG] Placed STL bbox: min={bb_min.round(2)}, max={bb_max.round(2)}", flush=True)
    return out_stl


# ----------------------------
# Routes
# ----------------------------
@app.get("/")
def index():
    cfg = ensure_local_config()
    dims = parse_ini_dims(cfg)
    # Si no tienes templates, retornamos JSON para testing
    return jsonify({"status": "BioPrint Server Running", "dims": dims})


# ----------------------------
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


# ----------------------------
# PrusaSlicer CLI

# ----------------------------
def run_prusaslicer_export_sla(stl_paths: list[Path], config_path: Path, sl1_out: Path, overrides: dict | None = None):
    cmd = [
        PRUSA_SLICER_CONSOLE,
        "--load", str(config_path),
        "--export-sla",
        "--dont-arrange",
        "--output", str(sl1_out)
    ]
    # Add all STL paths
    for p in stl_paths:
        cmd.append(str(p))

    if overrides:
        for k, v in overrides.items():
            cmd.extend([f"--{k.replace('_', '-')}", str(v)])

    return subprocess.run(cmd, capture_output=True, text=True)


def extract_root_pngs_from_sl1_and_rename(sl1_path: Path, layers_dir: Path):
    """Extract root-level PNGs from .sl1 (ZIP) archive, writing them
    directly with sequential names. Reads entire ZIP into memory for speed."""
    layers_dir.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(sl1_path, "r") as z:
            names = z.namelist()
            pngs = sorted(
                [n for n in names if n.lower().endswith(".png") and "/" not in n],
                key=lambda s: s.lower()
            )

            for i, name in enumerate(pngs):
                data = z.read(name)
                dst = layers_dir / f"{i:06d}.png"
                dst.write_bytes(data)
                
            return len(pngs)
    except zipfile.BadZipFile:
        return 0


# ----------------------------
# Job progress endpoint
# ----------------------------
@app.get("/job/<job_id>/progress")
def job_progress(job_id):
    info = _slice_jobs.get(job_id)
    if not info:
        return jsonify({"status": "unknown", "progress": 0, "message": "Job not found"})
    return jsonify(info)


# ----------------------------
# Scene slicing
# ----------------------------
@app.post("/slice_scene")
def slice_scene():
    # Reload calibration to ensure any frontend preview layer lookups use the latest mapping
    if print_manager and hasattr(print_manager, 'calibration'):
        print_manager.calibration.load()

    files = request.files.getlist("files[]")
    if not files:
        return jsonify({"error": "No files[] received"}), 400

    scene_json = request.form.get("scene_json", "")
    if not scene_json:
        return jsonify({"error": "Missing scene_json"}), 400

    try:
        scene = json.loads(scene_json)
        print(f"[DEBUG] Received Scene JSON: {json.dumps(scene, indent=2)}")
    except Exception as e:
        return jsonify({"error": f"Invalid scene_json: {e}"}), 400

    experiment_name = request.form.get("experiment_name", "")
    author = request.form.get("author", "")
    intent = request.form.get("intent", "")
    material = request.form.get("material", "")

    if len(scene) != len(files):
        return jsonify({"error": f"Count mismatch: scene={len(scene)} files={len(files)}"}), 400

    config_path = ensure_local_config()

    job_id = uuid.uuid4().hex[:10]

    # --- CLEANUP OLD JOBS ---
    try:
        if JOBS_DIR.exists():
            for item in JOBS_DIR.iterdir():
                if item.is_dir():
                    shutil.rmtree(item)
    except Exception as e:
        print(f"Warning: Could not clean up old jobs: {e}")
    # ------------------------

    job_dir = JOBS_DIR / job_id
    constructs_dir = job_dir / "constructs"
    job_dir.mkdir(parents=True, exist_ok=True)
    constructs_dir.mkdir(parents=True, exist_ok=True)

    # --- Save uploaded files immediately (request context won't be available in thread) ---
    saved_files = []  # list of (filename, Path)
    for i, f in enumerate(files):
        safe_name = secure_filename(f.filename) or f"model_{i}.stl"
        tmp_path = job_dir / f"upload_{i}_{safe_name}"
        f.save(tmp_path)
        saved_files.append((f.filename, tmp_path))

    # Snapshot all form params needed by the worker thread
    form_params = {
        "layer_height":           request.form.get("layer_height", "0.05"),
        "initial_layer_height":   request.form.get("initial_layer_height"),
        "initial_exposure_time":  request.form.get("initial_exposure_time"),
        "faded_layers":           request.form.get("faded_layers"),
        "thermodynamic_enabled":  request.form.get("thermodynamic_enabled") == "true",
        "thermodynamic_max_flash":request.form.get("thermodynamic_max_flash"),
        "thermodynamic_cooling":  request.form.get("thermodynamic_cooling"),
        "motor_enabled":          request.form.get("motor_enabled") == "true",
        "motor_peel_speed":       request.form.get("motor_peel_speed"),
        "motor_retract_speed":    request.form.get("motor_retract_speed"),
        "motor_separation_distance": request.form.get("motor_separation_distance"),
    }

    # Register experiment
    patterns_snapshot = []
    for obj in scene:
        base_exposure = round(float(obj.get("dose_mJ_cm2", 0)) / float(obj.get("irradiance_mW_cm2", 1)), 2) if float(obj.get("irradiance_mW_cm2", 1)) > 0 else 0
        base_params = {
            "exposure": base_exposure,
            "irr": obj.get("irradiance_mW_cm2", 0),
            "modifiers": obj.get("modifiers", [])
        }
        
        overrides = obj.get("override_ranges", [])
        if not overrides:
            patterns_snapshot.append({**base_params, "start": 0, "end": "Max", "is_base": True})
        else:
            sorted_ovr = sorted(overrides, key=lambda r: int(r.get("start", 0)))
            current_layer = 0
            
            for ovr in sorted_ovr:
                st = int(ovr.get("start", 0))
                en = int(ovr.get("end", 0))
                if st > current_layer:
                    patterns_snapshot.append({**base_params, "start": current_layer, "end": st - 1, "is_base": True})
                
                # Ensure the main override also correctly casts to int for sorting purposes
                patterns_snapshot.append(ovr)
                current_layer = en + 1
                
            # Add final trailing base segment
            patterns_snapshot.append({**base_params, "start": current_layer, "end": "Max", "is_base": True})

    try:
        with get_db() as db:
            db.execute(
                "INSERT INTO experiments (id, name, author, intent, material, status, config_snapshot, patterns_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (job_id, experiment_name, author, intent, material, "pending", json.dumps(form_params), json.dumps(patterns_snapshot))
            )
            db.commit()
    except Exception as e:
        print(f"Error registering experiment {job_id}: {e}")

    # Register job as pending
    _set_progress(job_id, 0.0, "Queued", status="pending")

    # --- Launch background worker ---
    def worker():
        _run_slice_job(job_id, scene, saved_files, config_path, job_dir, constructs_dir, form_params)

    t = threading.Thread(target=worker, daemon=True)
    t.start()

    return jsonify({"status": "processing", "job_id": job_id, "url": f"/job/{job_id}"})


def _run_slice_job(job_id, scene, saved_files, config_path, job_dir, constructs_dir, form_params):
    """Background worker: full slice pipeline."""
    import traceback
    import time as _t

    job_data = {
        "job_id": job_id,
        "type": "multi",
        "mode": "scene",
        "config_ini": str(config_path),
        "thermodynamic": {
            "enabled": form_params.get("thermodynamic_enabled", False),
            "max_flash": float(form_params.get("thermodynamic_max_flash") or 0.5),
            "cooling_pause": float(form_params.get("thermodynamic_cooling") or 2.0),
        },
        "motor": {
            "enabled": form_params.get("motor_enabled", False),
            "peel_speed": float(form_params.get("motor_peel_speed") or 30),
            "retract_speed": float(form_params.get("motor_retract_speed") or 150),
            "separation_distance": float(form_params.get("motor_separation_distance") or 4.2),
        },
        "constructs": [],
    }

    batches = {}

    _t0_total = _t.time()
    try:
        n_models = len(scene)
        for i, obj in enumerate(scene):
            orig_filename, stl_tmp_path = saved_files[i]

            _set_progress(job_id, 0.05 + 0.15 * (i / max(n_models, 1)),
                          f"Transforming model {i+1}/{n_models}: {orig_filename}")

            c_dir = constructs_dir / str(i)
            in_dir = c_dir / "in"
            in_dir.mkdir(parents=True, exist_ok=True)

            # Copy already-saved upload into the construct in/ dir
            stl_path = in_dir / secure_filename(orig_filename)
            shutil.copy2(stl_tmp_path, stl_path)

            scale_x = float(obj.get("scale", obj.get("scale_x", 1.0)))
            scale_y = float(obj.get("scale", obj.get("scale_y", 1.0)))
            scale_z = float(obj.get("scale", obj.get("scale_z", 1.0)))

            if "scale_x" in obj: scale_x = float(obj["scale_x"])
            if "scale_y" in obj: scale_y = float(obj["scale_y"])
            if "scale_z" in obj: scale_z = float(obj["scale_z"])

            scale = (scale_x, scale_y, scale_z)

            pos_x = float(obj.get("pos_x_mm", 0.0))
            pos_y = float(obj.get("pos_y_mm", 0.0))

            dims = parse_ini_dims(config_path)
            bed_w = dims.get("width", 71.11)
            bed_h = dims.get("height", 40.0)

            target_cx = pos_x + (bed_w / 2.0)
            target_cy = pos_y + (bed_h / 2.0)

            rot_data = obj.get("rotation", {})
            rot_x = float(rot_data.get("x", 0.0))
            rot_y = float(rot_data.get("y", 0.0))
            rot_z = float(rot_data.get("z", 0.0))

            placed_stl = in_dir / "placed.stl"
            _t1 = _t.time()
            transform_stl_to_scene(
                stl_path, placed_stl,
                scale=scale,
                target_center_xy=(target_cx, target_cy),
                rotation=(rot_x, rot_y, rot_z),
                align_min_z_to_0=True
            )
            print(f"[TIMING] transform_stl_to_scene: {_t.time()-_t1:.2f}s")

            irr = float(obj.get("irradiance", obj.get("irradiance_mW_cm2", 0.0)))
            dose = float(obj.get("dose", obj.get("dose_mJ_cm2", 0.0)))
            ranges = obj.get("override_ranges", [])
            modifiers = obj.get("modifiers", [])

            ranges_str = json.dumps(ranges, sort_keys=True)
            modifiers_str = json.dumps(modifiers, sort_keys=True)

            key = (round(irr, 3), round(dose, 3), ranges_str, modifiers_str)

            if key not in batches:
                batches[key] = {
                   "irr": irr,
                   "dose": dose,
                   "ranges": ranges,
                   "modifiers": modifiers,
                   "stls": [],
                   "filenames": []
                }

            batches[key]["stls"].append(placed_stl)
            batches[key]["filenames"].append(orig_filename)

        # Process Batches
        batch_processing_info = []
        global_layer_height = float(form_params.get("layer_height") or 0.05)
        if global_layer_height <= 0: global_layer_height = 0.05

        n_batches = len(batches)

        for idx, (key, batch_data) in enumerate(batches.items()):
            b_dir = constructs_dir / f"batch_{idx}"
            out_dir = b_dir / "out"
            layers_dir = b_dir / "layers"
            out_dir.mkdir(parents=True, exist_ok=True)
            
            irr = batch_data["irr"]
            dose = batch_data["dose"]

            _set_progress(job_id, 0.20 + 0.30 * (idx / max(n_batches, 1)),
                          f"Slicing batch {idx+1}/{n_batches} with PrusaSlicer...")

            overrides = {}
            exposure_time = 0.0
            if irr > 1e-9:
                 exposure_time = dose / irr
                 overrides['exposure_time'] = str(exposure_time)
                 overrides['initial_exposure_time'] = str(exposure_time)

            overrides['layer_height'] = str(global_layer_height)
            overrides['initial_layer_height'] = str(global_layer_height)

            # --- Handle Adhesion / Initial Layers Overrides from Frontend ---
            submitted_initial_lh  = form_params.get("initial_layer_height")
            submitted_initial_exp = form_params.get("initial_exposure_time")
            submitted_faded_layers = form_params.get("faded_layers")

            if submitted_initial_lh:
                 overrides['initial_layer_height'] = str(submitted_initial_lh)

            if submitted_initial_exp:
                 overrides['initial_exposure_time'] = str(submitted_initial_exp)

            if submitted_faded_layers:
                 overrides['faded_layers'] = str(submitted_faded_layers)
            # ----------------------------------------------------------------

            sl1_out = out_dir / "job.sl1"
            
            final_stl_for_slicing = None
            
            if len(batch_data["stls"]) == 1:
                final_stl_for_slicing = batch_data["stls"][0]
            else:
                # Merge multiple STLs into one using numpy-stl
                combined_data = []
                for p_stl in batch_data["stls"]:
                    m = mesh.Mesh.from_file(str(p_stl))
                    combined_data.append(m.data)
                
                if combined_data:
                    combined_mesh = mesh.Mesh(np.concatenate(combined_data))
                    merged_name = out_dir / "batch_merged.stl"
                    combined_mesh.save(str(merged_name))
                    final_stl_for_slicing = merged_name
                else:
                    _set_progress(job_id, 0.0, "Failed to merge STLs", status="error")
                    return


            

            # --- CREATE TEMP CONFIG.INI TO ENSURE NO SUPPORTS ---
            _t2 = _t.time()
            job_config_path = out_dir / "job_config.ini"
            
            with open(config_path, "r", encoding="utf-8", errors="ignore") as f_in:
                lines = f_in.readlines()
            
            forced_keys = {
                "supports_enable", "pad_enable", "hollowing_enable", "pad_around_object",
                "support_object_elevation", "branchingsupport_object_elevation",
                "sla_print_settings_id", "sla_material_settings_id"
            }
            # Combine with override keys to avoid duplicates
            skip_keys = forced_keys.union(overrides.keys())

            with open(job_config_path, "w", encoding="utf-8") as f_out:
                for line in lines:
                    stripped = line.strip()
                    # Stop at INI section headers like [Hardware] — everything after is custom
                    if stripped.startswith("["):
                        break
                    if "=" in line:
                        key = line.split('=')[0].strip()
                        if key in skip_keys:
                            continue
                    f_out.write(line)
                
                # Append our forced settings
                f_out.write("\nsupports_enable = 0\n")
                f_out.write("pad_enable = 0\n")
                f_out.write("hollowing_enable = 0\n")
                f_out.write("pad_around_object = 0\n")
                f_out.write("support_object_elevation = 0\n")
                f_out.write("branchingsupport_object_elevation = 0\n")


                # Append OVERRIDES from our logic (e.g. exposure time, layer height)
                for k, v in overrides.items():
                    f_out.write(f"{k} = {v}\n")
            
            print(f"[TIMING] config generation: {_t.time()-_t2:.2f}s")
            _t3 = _t.time()
            p = run_prusaslicer_export_sla([final_stl_for_slicing], job_config_path, sl1_out, overrides=None)
            print(f"[TIMING] PrusaSlicer slicing: {_t.time()-_t3:.2f}s")




            if p.returncode != 0 or not sl1_out.exists():
                print(f"Slicing Error:\nSTDOUT: {p.stdout}\nSTDERR: {p.stderr}")
                _set_progress(job_id, 0.0, f"PrusaSlicer failed for batch {idx+1}", status="error")
                return

            # --- MODIFIERS POST-PROCESSING ---
            modifiers = batch_data.get("modifiers", [])
            ranges = batch_data.get("ranges", [])
            has_range_modifiers = any("modifiers" in r and r["modifiers"] for r in ranges)

            print(f"[DEBUG] Batch {idx}: Global Modifiers: {len(modifiers)}, Range Modifiers: {has_range_modifiers}")

            if (modifiers or has_range_modifiers) and sl1_out.exists():
                print(f"[DEBUG] Applying Modifiers to {sl1_out}...")
                _t_mod = _t.time()
                try:
                    processed_images = []
                    dims = parse_ini_dims(config_path)
                    pixel_size_um = 50.0

                    with zipfile.ZipFile(sl1_out, "r") as z:
                        png_list = sorted([n for n in z.namelist() if n.lower().endswith(".png") and "/" not in n])
                        n_layers = len(png_list)

                        if png_list:
                            with z.open(png_list[0]) as f0:
                                with Image.open(f0) as img0:
                                    w_px, h_px = img0.size
                                    w_mm = dims.get("width", 120.96)
                                    if w_px > 0:
                                        pixel_size_um = (w_mm / w_px) * 1000.0

                            batch_progress_base = 0.50 + 0.35 * (idx / max(n_batches, 1))
                            batch_progress_span = 0.35 / max(n_batches, 1)

                            for layer_idx, pname in enumerate(png_list):
                                # Update progress every 10 layers to avoid flooding
                                if layer_idx % 10 == 0 or layer_idx == n_layers - 1:
                                    frac = layer_idx / max(n_layers - 1, 1)
                                    _set_progress(
                                        job_id,
                                        batch_progress_base + frac * batch_progress_span,
                                        f"Applying pattern — layer {layer_idx+1}/{n_layers}"
                                    )

                                with z.open(pname) as f_img:
                                    base_img = Image.open(f_img).convert("L")
                                    base_img.load()

                                    # Determine Active Modifiers for this layer.
                                    # Priority: range-level modifiers > global batch modifiers.
                                    active_modifiers = list(modifiers)  # start with global

                                    # Search for the range that covers this layer
                                    for r in ranges:
                                        r_start = int(r.get("start", 0))
                                        r_end   = int(r.get("end", 999999))

                                        if r_start <= layer_idx < r_end:
                                            if "modifiers" in r and r["modifiers"]:
                                                # Range-level modifiers override global ones
                                                active_modifiers = r["modifiers"]
                                            # Range matched — stop searching even if no modifiers
                                            break

                                    # APPLY PATTERN ENGINE
                                    if active_modifiers:
                                        res_img = PatternEngine.apply_modifiers(
                                            base_img, active_modifiers,
                                            pixel_size_um=pixel_size_um,
                                            layer_index=layer_idx
                                        )
                                        processed_images.append((pname, res_img))
                                    else:
                                        processed_images.append((pname, base_img))

                    # 2. Update ZIP
                    tmp_zip = sl1_out.with_suffix(".temp.sl1")
                    with zipfile.ZipFile(sl1_out, "r") as z_in:
                        with zipfile.ZipFile(tmp_zip, "w", zipfile.ZIP_DEFLATED) as z_out:
                            # Copy non-PNG files
                            for item in z_in.infolist():
                                if not item.filename.lower().endswith(".png"):
                                    z_out.writestr(item, z_in.read(item.filename))
                                    
                            # Write processed images
                            for pname, pimg in processed_images:
                                buf = io.BytesIO()
                                pimg.save(buf, format="PNG")
                                z_out.writestr(pname, buf.getvalue())
                                
                    sl1_out.unlink()
                    tmp_zip.rename(sl1_out)
                    print(f"[TIMING] Pattern Modifiers: {_t.time()-_t_mod:.2f}s")
                    
                except Exception as e:
                    print(f"Modifiers Error: {e}")
                    traceback.print_exc()

            # Instead of extracting PNGs to disk, just count them and store ZIP path
            _t4 = _t.time()
            png_names = []
            try:
                with zipfile.ZipFile(sl1_out, "r") as z:
                    png_names = sorted(
                        [n for n in z.namelist() if n.lower().endswith(".png") and "/" not in n],
                        key=lambda s: s.lower()
                    )
            except zipfile.BadZipFile:
                pass
            print(f"[TIMING] list PNGs from SL1: {_t.time()-_t4:.2f}s")
            
            batch_processing_info.append({
                "id": f"batch_{idx}",
                "sl1_path": sl1_out,        # Store ZIP path for direct reading later
                "png_names": png_names,      # Ordered list of PNG names inside ZIP
                "filenames": batch_data["filenames"],
                "irradiance_mW_cm2": irr,
                "dose_mJ_cm2": dose,
                "ranges": batch_data["ranges"],
                "layer_count": len(png_names),
                "base_exposure_time": exposure_time,
                "initial_layer_height": float(submitted_initial_lh) if submitted_initial_lh else global_layer_height,
                "faded_layers": int(submitted_faded_layers) if submitted_faded_layers else 0,
                "initial_exposure_time": float(submitted_initial_exp) if submitted_initial_exp else exposure_time
            })

    except Exception as e:
        traceback.print_exc()
        _set_progress(job_id, 0.0, f"Error: {e}", status="error")
        return

    # --- BUILD MANIFEST ONLY (no disk I/O — PNGs served on-demand from ZIP) ---
    _set_progress(job_id, 0.88, "Building layer manifest...")
    
    final_layers = []
    max_layers = 0
    if batch_processing_info:
        max_layers = max(c["layer_count"] for c in batch_processing_info)

    current_z_height = 0.0
        
    for l_idx in range(max_layers):
        
        # Determine global Z and basic params from primary batch
        primary_batch = batch_processing_info[0] if batch_processing_info else None
        step_height = global_layer_height
        
        if primary_batch:
            faded = primary_batch.get("faded_layers", 0)
            init_h = primary_batch.get("initial_layer_height", global_layer_height)
            if l_idx < faded:
                step_height = init_h
            else:
                step_height = global_layer_height
        
        current_z_height += step_height

        # Collect all sources for this layer index across all batches
        layer_sources = []
        base_exposure = 2.0 # Fallback
        
        for b in batch_processing_info:
            if l_idx < b["layer_count"]:
                png_name_in_zip = b["png_names"][l_idx]
                
                # Determine exposure and irradiance for this batch component
                curr_exp = b["base_exposure_time"]
                curr_irr = b["irradiance_mW_cm2"]
                
                faded_cnt = b.get("faded_layers", 0)
                if l_idx < faded_cnt:
                    curr_exp = b.get("initial_exposure_time", curr_exp)
                
                if "ranges" in b:
                    for r in b["ranges"]:
                        start = r.get("start", 0)
                        end = r.get("end", 999999)
                        if start <= l_idx < end:
                            # Is this a gradient?
                            gradient_mode = r.get("gradientMode", "flat")
                            
                            if gradient_mode == "gradient":
                                # Calculate interpolation factor (0.0 at start, 1.0 at end-1)
                                range_len = max(1, (end - start) - 1)
                                t = (l_idx - start) / range_len
                                
                                # Interpolate Exposure
                                start_exp = float(r.get("exposure", curr_exp))
                                end_exp = float(r.get("endExposureTime", start_exp))
                                curr_exp = start_exp + t * (end_exp - start_exp)
                                
                                # Interpolate Irradiance 
                                start_irr = float(r.get("irr", curr_irr))
                                end_irr = float(r.get("endLightIntensity", start_irr))
                                curr_irr = start_irr + t * (end_irr - start_irr)
                                
                            else:
                                # Flat
                                if "exposure" in r:
                                    curr_exp = float(r["exposure"])
                                if "irr" in r:
                                    curr_irr = float(r["irr"])
                            break
                
                layer_sources.append({
                    "batch_id": b["id"],
                    "sl1_path": str(b["sl1_path"]),
                    "png_name": png_name_in_zip,
                    "irradiance_mw_cm2": curr_irr,
                    "dose_mJ_cm2": b["dose_mJ_cm2"], # Note: Dose might arguably change if irr changes, but we leave base dose for reference
                    "exposure_time": curr_exp
                })
                # We typically take the max exposure or primary exposure?
                # For greyscale, we want fixed time, variable intensity.
                # Use the exposure of the first batch or max?
                base_exposure = max(base_exposure, curr_exp)

        if not layer_sources:
            continue

        # Create Unified Layer Entry
        # If single source, keep it simple (backward compat?)
        # Or always use the new structure. Let's use new structure but include legacy fields pointing to first source.
        
        first = layer_sources[0]
        dst_name = f"{len(final_layers):05d}.png" # Virtual filename for frontend
        
        final_layers.append({
            "filename": dst_name,
            "original_layer_idx": l_idx,
            "physical_layer_idx": l_idx, 
            "z_height_mm": current_z_height,
            "exposure_time": base_exposure,
            "is_sublayer": False, # No longer using sublayers for simultaneous parts
            
            # Legacy/Primary fields (points to first source)
            # This allows simple viewer to see at least something
            "_sl1_path": first["sl1_path"],
            "_png_name": first["png_name"], 
            "irradiance_mw_cm2": first["irradiance_mw_cm2"],
            
            # THE NEW FIELD: List of all components to merge
            "sources": layer_sources
        })

    job_data["constructs"] = [{
        "id": "merged",
        "name": "Unified Scene",
        "layer_count": len(final_layers),
        "physical_layer_count": len(final_layers),
        "layers": final_layers
    }]

    (job_dir / "job.json").write_text(json.dumps(job_data, indent=2), encoding="utf-8")

    elapsed = _t.time() - _t0_total
    print(f"[TIMING] === TOTAL slice_job: {elapsed:.2f}s ===")
    _set_progress(job_id, 1.0, f"Done — {len(final_layers)} layers in {elapsed:.1f}s", status="done")


@app.get("/job/<job_id>/manifest.json")
def job_manifest(job_id):
    job_dir = JOBS_DIR / job_id
    job_json = job_dir / "job.json"

    if job_json.exists():
        data = json.loads(job_json.read_text(encoding="utf-8"))
        return jsonify(data)
    return jsonify({"error": "Not found"}), 404



# In-memory cache for layer lookups: { job_id: { "00000.png": (sl1_path, png_name), ... } }
_layer_cache = {}

@app.get("/job/<job_id>/layer/<name>")
def layer_file(job_id, name):
    """Serve a layer PNG on-demand. Merges sources if composite layer."""
    
    # Cache lookup logic
    if job_id not in _layer_cache:
        job_json_path = JOBS_DIR / job_id / "job.json"
        if not job_json_path.exists(): abort(404)
        
        try:
            data = json.loads(job_json_path.read_text(encoding="utf-8"))
        except: abort(500)
            
        lookup = {}
        for construct in data.get("constructs", []):
            for layer in construct.get("layers", []):
                # Store the WHOLE layer object to allow specific merge logic
                lookup[layer["filename"]] = layer
        _layer_cache[job_id] = lookup
    
    layer_data = _layer_cache.get(job_id, {}).get(name)
    if not layer_data: abort(404)
    
    try:
        # Check if composite
        sources = layer_data.get("sources")
        if not sources:
            # Legacy fallback
            sl1 = layer_data.get("_sl1_path")
            png = layer_data.get("_png_name")
            if not sl1 or not png: abort(404)
            with zipfile.ZipFile(sl1, "r") as z:
                return send_file(io.BytesIO(z.read(png)), mimetype="image/png")

        # --- COMPOSITE MERGE FOR PREVIEW ---
        # For preview, we just want to see the shape.
        # We can add them up or just overlay.
        # Let's do a simple Additive mix for now.
        
        base_img = None
        composite_arr = None
        
        for src in sources:
            sl1 = src["sl1_path"]
            png = src["png_name"]
            irr = src.get("irradiance_mw_cm2", 0.0)
            
            # Calculate Gray Value for Preview
            gray_val = 255
            # We use the global print_manager instance's calibration
            if print_manager and hasattr(print_manager, 'calibration'):
                 gray_val = print_manager.calibration.get_gray_for_irradiance(irr)
            
            with zipfile.ZipFile(sl1, "r") as z:
                img_data = z.read(png)
                
            with Image.open(io.BytesIO(img_data)) as img:
                img = img.convert("L") # Ensure Grayscale
                arr = np.array(img)
                
                # Apply Intensity Scaling (Modulation) logic
                # This preserves patterns/gradients within the layer
                # pixel_out = (pixel_in / 255.0) * gray_val
                if gray_val < 255:
                    arr_processed = (arr.astype(np.float32) / 255.0 * gray_val).astype(np.uint8)
                else:
                    arr_processed = arr
                
                if composite_arr is None:
                    composite_arr = arr_processed
                else:
                    # Use Maximum intensity for overlap visualization
                    composite_arr = np.maximum(composite_arr, arr_processed)

        if composite_arr is not None:
            out_img = Image.fromarray(composite_arr)
            img_io = io.BytesIO()
            out_img.save(img_io, 'PNG')
            img_io.seek(0)
            return send_file(img_io, mimetype="image/png")
        else:
            abort(404)

    except Exception as e:
        print(f"Layer Serve Error: {e}")
        abort(500)


# ----------------------------
# Print Control Routes
# ----------------------------
@app.post("/print/start/<job_id>")
def start_print(job_id):
    success, msg = print_manager.start_print(job_id, JOBS_DIR)
    if success:
        try:
            with get_db() as db:
                db.execute("UPDATE experiments SET status = 'printing' WHERE id = ?", (job_id,))
                db.commit()
        except Exception as e:
            print("DB Update Error", e)
        return jsonify({"status": "started", "message": msg})
    else:
        return jsonify({"error": msg}), 400

@app.post("/print/pause")
def pause_print():
    if print_manager.pause_print():
        return jsonify({"status": "paused"})
    return jsonify({"error": "Cannot pause"}), 400

@app.post("/print/resume")
def resume_print():
    if print_manager.resume_print():
        return jsonify({"status": "resumed"})
    return jsonify({"error": "Cannot resume"}), 400

@app.post("/print/stop")
def stop_print():
    print_manager.stop_print()
    job_id = print_manager.current_job_id
    if job_id:
        try:
            with get_db() as db:
                db.execute("UPDATE experiments SET status = 'cancelled' WHERE id = ?", (job_id,))
                db.commit()
        except:
            pass
    return jsonify({"status": "stopped"})

@app.get("/print/status")
def print_status():
    return jsonify(print_manager.get_status())

@app.get("/projector/info")
def projector_info():
    """Proxy to RPi projector/info endpoint. Also prints result to local console."""
    info = print_manager.printer.get_projector_info()
    
    # Log to local console for easy visibility
    print("\n" + "="*50)
    print("  PROJECTOR HARDWARE INFO (from RPi)")
    print("="*50)
    if "error" in info:
        print(f"  ERROR: {info['error']}")
    else:
        print(f"  Initialized: {info.get('initialized', False)}")
        max_pwm = info.get('max_pwm')
        if max_pwm:
            print(f"  Hardware Max PWM:")
            print(f"    LED1: {max_pwm.get('LED1', '?')}/1023")
            print(f"    LED2: {max_pwm.get('LED2', '?')}/1023")
            print(f"    LED3: {max_pwm.get('LED3', '?')}/1023")
        cur_pwm = info.get('current_pwm')
        if cur_pwm:
            print(f"  Current PWM:")
            print(f"    LED1: {cur_pwm.get('LED1', '?')}/1023")
            print(f"    LED2: {cur_pwm.get('LED2', '?')}/1023")
            print(f"    LED3: {cur_pwm.get('LED3', '?')}/1023")
    print("="*50 + "\n")
    
    return jsonify(info)


# ----------------------------
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


if __name__ == "__main__":
    print(f"Starting BioPrint Server...")
    print(f"Config INI: {DEFAULT_CONFIG_INI}")
    print(f"Slicer: {PRUSA_SLICER_CONSOLE}")
    app.run(host="127.0.0.1", port=8000, debug=True)
