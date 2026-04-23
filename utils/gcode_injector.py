import math
from pathlib import Path
import re

def build_pore_injection_gcode(
    centroids: list,
    current_z: float,
    injection_depth_mm: float,
    flow_ul_per_cell: float,
    ul_per_mm: float,
    travel_feedrate: float,
    inject_feedrate: float,
    syringe_tool: str = "T1",
    fdm_tool: str = "T0"
) -> list[str]:
    """
    Generates G-code block for injecting into all centroids of a layer.
    """
    if not centroids:
        return []

    gcode = []
    gcode.append("; --- PORE INJECTION START ---")
    gcode.append(f"{syringe_tool} ; Switch to syringe")
    
    # Calculate extrusion length in mm from ul
    e_steps = flow_ul_per_cell / ul_per_mm if ul_per_mm > 0 else 0
    retract_mm = 0.5 # Default retraction
    
    # Use relative extrusion if possible, but Prusa usually uses absolute. 
    # For injection, relative makes it much easier.
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

    gcode.append("M82 ; Back to absolute extrusion")
    gcode.append(f"{fdm_tool} ; Switch back to FDM tool")
    gcode.append("; --- PORE INJECTION END ---")
    
    return gcode

def inject_pore_gcode_into_file(gcode_path: Path, layer_injections: dict):
    """
    Inserts generated injection gcode blocks right after the Internal Infill for the matching layer.
    layer_injections is a dict: {layer_index: [gcode_line_1, gcode_line_2, ...]}
    """
    if not layer_injections:
        return

    lines = gcode_path.read_text(encoding="utf-8", errors="ignore").splitlines(keepends=True)
    output = []
    
    current_layer = 0
    in_infill = False
    
    layer_change_re = re.compile(r';LAYER_CHANGE')
    type_infill_re = re.compile(r';TYPE:Internal infill')
    type_other_re = re.compile(r';TYPE:')
    
    for line in lines:
        stripped = line.strip()
        
        if layer_change_re.search(stripped):
            current_layer += 1
            in_infill = False
            output.append(line)
            continue
            
        if type_infill_re.search(stripped):
            in_infill = True
            output.append(line)
            continue
            
        if in_infill and (type_other_re.search(stripped) or layer_change_re.search(stripped)):
            # Infill block just ended! Insert the injection gcode here if any.
            if current_layer in layer_injections:
                output.append("\n")
                for injection_line in layer_injections[current_layer]:
                    output.append(f"{injection_line}\n")
                output.append("\n")
                # Remove it so we don't inject twice if there are multiple infill blocks in a layer
                del layer_injections[current_layer]
            in_infill = False

        output.append(line)
        
    gcode_path.write_text("".join(output), encoding="utf-8")
