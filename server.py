import uuid
import os
import subprocess
import zipfile
import shutil
import json
import struct
from pathlib import Path
import io

import numpy as np
from stl import mesh
from flask import Flask, render_template, request, redirect, url_for, send_file, abort, jsonify
from werkzeug.utils import secure_filename
from PIL import Image, ImageOps

from flask_cors import CORS
from print_manager import PrintManager

BASE_DIR = Path(__file__).resolve().parent

# Configuracion
# NOTA: Asegurate de que estas rutas sean correctas en tu maquina
PRUSA_SLICER_CONSOLE = str(BASE_DIR / "PrusaSlicer-2.9.3" / "prusa-slicer-console.exe")
DEFAULT_CONFIG_INI = str(BASE_DIR / "config.ini")

JOBS_DIR = BASE_DIR / "jobs"
JOBS_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
CORS(app) # Habilita CORS para todas las rutas

# Initialize Print Manager
print_manager = PrintManager(DEFAULT_CONFIG_INI)


# ----------------------------
# INI helpers
# ----------------------------
def parse_ini_dims(path: Path):
    dims = {"width": 120.96, "height": 68.04, "depth": 150}
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
    rotation=(0.0, 0.0, 0.0), # degrees x, y, z
    align_min_z_to_0: bool = True,
    rotate_flat: bool = False
):
    try:
        # Load the STL file using numpy-stl
        model_mesh = mesh.Mesh.from_file(str(in_stl))
    except Exception as e:
        print(f"Error loading STL {in_stl}: {e}")
        return

    # 1. Coordinate System Transformation: M_final = RotX(90) * Rot_User * RotX(-90)
    # Why? Frontend UI is Y-up, but raw STL is Z-up. When loading into UI, Three.js rotates X-90.
    # To match backend (Z-up), we must simulate:
    # 1. Transform to UI Space: RotX(-90)
    # 2. Apply User Rotations (XYZ)
    # 3. Transform back to Slicer Space (Z-up): RotX(90)

    # Rotation Helper
    def get_rotation_matrix(axis, theta_deg):
        theta = np.radians(theta_deg)
        c, s = np.cos(theta), np.sin(theta)
        if axis == 'x':
            return np.array([
                [1, 0, 0, 0],
                [0, c, -s, 0],
                [0, s, c, 0],
                [0, 0, 0, 1]
            ])
        elif axis == 'y':
            return np.array([
                [c, 0, s, 0],
                [0, 1, 0, 0],
                [-s, 0, c, 0],
                [0, 0, 0, 1]
            ])
        elif axis == 'z':
            return np.array([
                [c, -s, 0, 0],
                [s, c, 0, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 1]
            ])
        return np.eye(4)

    # Build Transformation Matrix (4x4)
    # Order of multiplications in NumPy is M1 @ M2 @ v (right-to-left application if column vectors, 
    # but numpy-stl vectors are row-vectors: v @ M2.T @ M1.T). 
    # numpy-stl applies `transform` using left-multiplication: m.vectors = m.vectors @ M.T
    # So we construct M such that v_new = M @ v_old is the standard column-vector logic.

    # 1. Base Transform: RotX(-90)
    M_base = get_rotation_matrix('x', -90)

    # 2. User Transform: RotX * RotY * RotZ (Intrinsic XYZ or Extrinsic? Three.js uses XYZ order)
    rx, ry, rz = rotation
    M_user_x = get_rotation_matrix('x', rx)
    M_user_y = get_rotation_matrix('y', ry)
    M_user_z = get_rotation_matrix('z', rz)
    
    # Standard Euler XYZ composition: M_user = M_z @ M_y @ M_x
    M_user = M_user_z @ M_user_y @ M_user_x

    # 3. To Z-up: RotX(90)
    M_to_z_up = get_rotation_matrix('x', 90)

    # Combine All Rotations
    M_rotation_final = M_to_z_up @ M_user @ M_base

    # Apply Rotation to Mesh
    # Note: We rotate around the CENTER of the object's geometry to match UI controls.
    # Calculate geometric center based on raw mesh
    min_x, max_x = model_mesh.x.min(), model_mesh.x.max()
    min_y, max_y = model_mesh.y.min(), model_mesh.y.max()
    min_z, max_z = model_mesh.z.min(), model_mesh.z.max()
    center = np.array([(min_x + max_x)/2, (min_y + max_y)/2, (min_z + max_z)/2])

    model_mesh.translate(-center) # Move to (0,0,0)
    model_mesh.transform(M_rotation_final) # Rotate
    # Do NOT translate back to original center yet, we want to place it at (0,0,0) for scaling/positioning
    
    # --- SCALING ---
    if scale != 1.0:
        model_mesh.points *= scale # Efficient numpy scaling of all vertices

    # --- POSITIONING ON BED ---
    # We want the CENTER of the scaled object to be at target_center_xy
    tx, ty = target_center_xy
    
    # Since we centered at (0,0,0) before, current (x,y) are relative to center.
    # Just translate x and y to target.
    model_mesh.translate(np.array([tx, ty, 0]))

    # --- ALIGN Z TO 0 (FLOOR) ---
    if align_min_z_to_0:
        current_z_min = model_mesh.z.min()
        if current_z_min != 0:
            model_mesh.translate(np.array([0, 0, -current_z_min]))
    
    # Save optimized STL
    model_mesh.save(str(out_stl))
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
# Scene slicing
# ----------------------------
@app.post("/slice_scene")
def slice_scene():
    files = request.files.getlist("files[]")
    if not files:
        return jsonify({"error": "No files[] received"}), 400

    scene_json = request.form.get("scene_json", "")
    if not scene_json:
        return jsonify({"error": "Missing scene_json"}), 400

    try:
        scene = json.loads(scene_json)
    except Exception as e:
        return jsonify({"error": f"Invalid scene_json: {e}"}), 400

    if len(scene) != len(files):
        return jsonify({"error": f"Count mismatch: scene={len(scene)} files={len(files)}"}), 400

    config_path = ensure_local_config()
    
    job_id = uuid.uuid4().hex[:10]
    
    # --- CLEANUP OLD JOBS ---
    # Borrar trabajos anteriores para ahorrar espacio
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

    job_data = {
        "job_id": job_id,
        "type": "multi",
        "mode": "scene",
        "config_ini": str(config_path),
        "constructs": [],
    }

    # Groups: key=(irr, dose, ranges_str) -> list of { 'placed_stl', 'original_filename' }
    batches = {}

    import traceback
    import time as _t
    _t0_total = _t.time()
    try:
        for i, obj in enumerate(scene):
            f = files[i]
            
            c_dir = constructs_dir / str(i)
            in_dir = c_dir / "in"
            in_dir.mkdir(parents=True, exist_ok=True)

            stl_path = in_dir / secure_filename(f.filename)
            f.save(stl_path)

            scale = float(obj.get("scale", 1.0))
            pos_x = float(obj.get("pos_x_mm", 0.0))
            pos_y = float(obj.get("pos_y_mm", 0.0))

            # Centramos en (pos_x, pos_y). Prusa considera (0,0) la esquina inferior izquierda.
            # Nuestro Frontend envia coordenadas donde (0,0) es el centro.
            # Convertimos coordenadas del Viewport (Centro=0,0) a Bed (Esq=0,0)
            dims = parse_ini_dims(config_path)
            bed_w = dims.get("width", 120.96)
            bed_h = dims.get("height", 68.04)
            
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
            print(f"⏱ [TIMING] transform_stl_to_scene: {_t.time()-_t1:.2f}s")
            
            irr = float(obj.get("irradiance", obj.get("irradiance_mW_cm2", 0.0)))
            dose = float(obj.get("dose", obj.get("dose_mJ_cm2", 0.0)))
            ranges = obj.get("override_ranges", [])
            
            ranges_str = json.dumps(ranges, sort_keys=True)
            key = (round(irr, 3), round(dose, 3), ranges_str)
            
            if key not in batches:
                batches[key] = {
                   "irr": irr,
                   "dose": dose,
                   "ranges": ranges,
                   "stls": [],
                   "filenames": []
                }
            
            batches[key]["stls"].append(placed_stl)
            batches[key]["filenames"].append(f.filename)

        # Process Batches
        batch_processing_info = []
        global_layer_height = float(request.form.get("layer_height", 0.05))
        if global_layer_height <= 0: global_layer_height = 0.05

        for idx, (key, batch_data) in enumerate(batches.items()):
            b_dir = constructs_dir / f"batch_{idx}"
            out_dir = b_dir / "out"
            layers_dir = b_dir / "layers"
            out_dir.mkdir(parents=True, exist_ok=True)
            
            irr = batch_data["irr"]
            dose = batch_data["dose"]
            
            overrides = {}
            exposure_time = 0.0
            if irr > 1e-9:
                 exposure_time = dose / irr
                 overrides['exposure_time'] = str(exposure_time)
                 # Default initial exposure to same unless overriden
                 overrides['initial_exposure_time'] = str(exposure_time)
            

            overrides['layer_height'] = str(global_layer_height)
            overrides['initial_layer_height'] = str(global_layer_height)

            overrides['layer_height'] = str(global_layer_height)
            overrides['initial_layer_height'] = str(global_layer_height)
            
            # --- Handle Adhesion / Initial Layers Overrides from Frontend ---

            submitted_initial_lh = request.form.get("initial_layer_height")
            submitted_initial_exp = request.form.get("initial_exposure_time")
            submitted_faded_layers = request.form.get("faded_layers")

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
                    return jsonify({"error": "Failed to merge STLs"}), 500


            

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
            
            print(f"⏱ [TIMING] config generation: {_t.time()-_t2:.2f}s")
            _t3 = _t.time()
            p = run_prusaslicer_export_sla([final_stl_for_slicing], job_config_path, sl1_out, overrides=None)
            print(f"⏱ [TIMING] PrusaSlicer slicing: {_t.time()-_t3:.2f}s")




            if p.returncode != 0 or not sl1_out.exists():
                print(f"Slicing Error:\nSTDOUT: {p.stdout}\nSTDERR: {p.stderr}")
                return jsonify({"error": f"Slicing failed for batch {idx}. See server logs."}), 500

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
            print(f"⏱ [TIMING] list PNGs from SL1: {_t.time()-_t4:.2f}s")
            
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
        return jsonify({"error": str(e)}), 500

    # --- BUILD MANIFEST ONLY (no disk I/O — PNGs served on-demand from ZIP) ---
    _t5 = _t.time()
    
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

    print(f"⏱ [TIMING] build manifest: {_t.time()-_t5:.2f}s")
    print(f"⏱ [TIMING] === TOTAL slice_scene: {_t.time()-_t0_total:.2f}s ===")

    return jsonify({
        "status": "ok", 
        "job_id": job_id, 
        "url": f"/job/{job_id}"
    })


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
                
                # Apply Intensity Mask
                # White pixels (>128) become gray_val
                mask = arr > 128
                arr_processed = np.zeros_like(arr)
                arr_processed[mask] = gray_val
                
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


if __name__ == "__main__":
    print(f"Starting BioPrint Server...")
    print(f"Config INI: {DEFAULT_CONFIG_INI}")
    print(f"Slicer: {PRUSA_SLICER_CONSOLE}")
    app.run(host="127.0.0.1", port=8000, debug=True)
