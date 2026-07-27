import math
from pathlib import Path
import re

RETURN_TOOL_PLACEHOLDER = "__F3D_RETURN_TOOL__"


def ensure_initial_toolhead(gcode_path: Path, expected_tool: str) -> bool:
    """Ensure the first layer starts with the tool selected by the scaffold map.

    Some multi-extruder Prusa profiles emit their default tool (often T1) in
    start-gcode even when every model feature is assigned to FDM (T0).  That
    leaves the first layers running on the syringe until the first explicit
    tool change.  Replace only that pre-layer startup selection; tool changes
    inside the print remain untouched.
    """
    if not expected_tool or not gcode_path.exists():
        return False

    expected = str(expected_tool).upper()
    if not re.fullmatch(r"T\d+", expected):
        return False

    lines = gcode_path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    first_layer = next((i for i, line in enumerate(lines)
                        if re.search(r";\s*LAYER_CHANGE", line, re.IGNORECASE)
                        or re.search(r";\s*LAYER:\d+", line, re.IGNORECASE)), len(lines))

    for i in range(first_layer):
        match = re.match(r"^(\s*)T\d+(\b.*)$", lines[i], re.IGNORECASE)
        if match:
            current = re.search(r"T\d+", match.group(0), re.IGNORECASE).group(0).upper()
            if current == expected:
                return False
            lines[i] = f"{match.group(1)}{expected}{match.group(2)}"
            gcode_path.write_text("".join(lines), encoding="utf-8")
            return True

    # If the profile did not emit a startup tool, add one immediately before
    # the first layer marker so the first extrusion is deterministic.
    if first_layer < len(lines):
        lines.insert(first_layer, f"{expected} ; F3D scaffold tool\n")
        gcode_path.write_text("".join(lines), encoding="utf-8")
        return True
    return False

def build_pore_injection_gcode(
    centroids: list,
    current_z: float,
    injection_depth_mm: float,
    flow_ul_per_cell: float,
    ul_per_mm: float,
    travel_feedrate: float,
    inject_feedrate: float,
    syringe_tool: str = "T1",
    return_tool: str = RETURN_TOOL_PLACEHOLDER
) -> list[str]:
    """
    Generates G-code block for injecting into all centroids of a layer.
    """
    if not centroids:
        return []

    gcode = []
    gcode.append("; --- PORE INJECTION START ---")
    gcode.append(f"{syringe_tool} ; Switch to syringe")
    
    e_steps = flow_ul_per_cell / ul_per_mm if ul_per_mm > 0 else 0
    retract_mm = 0.5
    
    # M83 asegura el modo relativo (corregido)
    gcode.append("M83 ; Relative extrusion for syringe")
    
    for cx, cy in centroids:
        gcode.append(f"G0 X{cx:.3f} Y{cy:.3f} F{travel_feedrate} ; Move to pore centroid")
        z_target = current_z - injection_depth_mm
        gcode.append(f"G1 Z{z_target:.3f} F600 ; Lower syringe into pore")
        
        if e_steps > 0:
            gcode.append(f"G1 E{e_steps:.4f} F{inject_feedrate} ; Inject material")
            gcode.append("G4 P200 ; Dwell to ensure flow")
            gcode.append(f"G1 E-{retract_mm:.4f} F1200 ; Retract to prevent stringing")
            
        gcode.append(f"G1 Z{current_z:.3f} F600 ; Raise syringe back to layer height")

    # Devolvemos la herramienta y aseguramos que el FDM también use M83
    gcode.append(f"{return_tool} ; Restore previously active tool")
    gcode.append("M83 ; Keep relative extrusion mode")
    gcode.append("; --- PORE INJECTION END ---")
    
    return gcode

def inject_pore_gcode_into_file(gcode_path: Path, layer_injections: dict):
    """
    Inserts generated injection gcode blocks right after the Internal Infill for the matching layer.
    """
    if not layer_injections:
        return

    lines = gcode_path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    output = []
    
    current_layer = 0
    in_infill = False
    active_tool = None
    infill_tool = None
    
    # Variables para rastrear la última posición conocida del FDM
    last_x = None
    last_y = None
    
    layer_change_re = re.compile(r';\s*LAYER_CHANGE', re.IGNORECASE)
    type_infill_re = re.compile(r';\s*TYPE:\s*Internal infill', re.IGNORECASE)
    type_other_re = re.compile(r';\s*TYPE:', re.IGNORECASE)
    tool_change_re = re.compile(r'^(T\d+)\b', re.IGNORECASE)
    
    def extract_val(line, axis):
        match = re.search(f'{axis}([0-9.-]+)', line)
        if match: return float(match.group(1))
        return None

    def append_injection(return_tool):
        if current_layer not in layer_injections:
            return
        output.append("\n")
        for injection_line in layer_injections[current_layer]:
            if RETURN_TOOL_PLACEHOLDER in injection_line:
                if not return_tool:
                    continue
                injection_line = injection_line.replace(RETURN_TOOL_PLACEHOLDER, return_tool)
            output.append(f"{injection_line}\n")
        if last_x is not None and last_y is not None:
            output.append(f"G0 X{last_x:.3f} Y{last_y:.3f} F7200 ; Restore print position\n")
        output.append("\n")
        del layer_injections[current_layer]

    for line in lines:
        stripped = line.strip()
        tool_match = tool_change_re.match(stripped)
        previous_active_tool = active_tool
        if tool_match:
            active_tool = tool_match.group(1).upper()
        
        # RASTREO: Capturamos la posición X e Y en cada movimiento de PrusaSlicer
        if stripped.startswith('G0') or stripped.startswith('G1'):
            x = extract_val(stripped, 'X')
            y = extract_val(stripped, 'Y')
            if x is not None: last_x = x
            if y is not None: last_y = y
        
        if layer_change_re.search(stripped):
            if in_infill:
                append_injection(infill_tool or previous_active_tool)
            current_layer += 1
            in_infill = False
            infill_tool = None
            output.append(line)
            continue
            
        if type_infill_re.search(stripped):
            in_infill = True
            infill_tool = active_tool
            output.append(line)
            continue
            
        if in_infill and (type_other_re.search(stripped) or tool_match):
            # ¡El infill ha terminado! Insertamos nuestra inyección
            append_injection(infill_tool or previous_active_tool)
                
                # RETORNO: Forzamos al cabezal a volver a su posición original
            in_infill = False
            infill_tool = None

        output.append(line)
        
    gcode_path.write_text("".join(output), encoding="utf-8")
