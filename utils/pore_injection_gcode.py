import math
from pathlib import Path
import re
from utils.gcode_injector import RETURN_TOOL_PLACEHOLDER

def build_multilayer_injection_gcode(
    centroids: list,
    z_start_mm: float,
    z_end_mm: float,
    flow_ul_per_cell: float,
    ul_per_mm: float,
    travel_feedrate: float,
    inject_feedrate: float,
    syringe_tool: str = "T1",
    return_tool: str = RETURN_TOOL_PLACEHOLDER
) -> list[str]:
    """
    Generates G-code block for multilayer pore injection.
    It plunges the syringe down to z_start_mm, and extrudes material
    while moving the Z-axis up to z_end_mm.
    """
    if not centroids:
        return []

    gcode = []
    gcode.append("; --- MULTILAYER PORE INJECTION START ---")
    gcode.append(f"{syringe_tool} ; Switch to syringe")
    
    # Calculate E steps based on the target volume
    e_steps = flow_ul_per_cell / ul_per_mm if ul_per_mm > 0 else 0
    retract_mm = 0.5
    
    gcode.append("M83 ; Relative extrusion for syringe")
    gcode.append("G90 ; Absolute positioning for axes")
    
    z_safe_hop = max(z_end_mm + 5.0, 10.0) # Safe Z-hop before moving XY
    gcode.append(f"G0 Z{z_safe_hop:.3f} F600 ; Move to safe Z")
    
    for cx, cy in centroids:
        # 1. Travel to pore centroid at safe height
        gcode.append(f"G0 X{cx:.3f} Y{cy:.3f} F{travel_feedrate} ; Move to pore XY")
        
        # 2. Plunge down to the bottom of the pore (z_start_mm)
        gcode.append(f"G1 Z{z_start_mm:.3f} F600 ; Plunge to Z Start")
        
        # 3. Inject while moving UP to the top of the pore (z_end_mm)
        if e_steps > 0:
            gcode.append(f"G1 Z{z_end_mm:.3f} E{e_steps:.4f} F{inject_feedrate} ; Inject while retracting Z")
            gcode.append("G4 P200 ; Dwell to ensure flow")
            gcode.append(f"G1 E-{retract_mm:.4f} F1200 ; Retract to prevent stringing")
        else:
            gcode.append(f"G1 Z{z_end_mm:.3f} F600 ; Move Z up without extrusion")
            
        # 4. Safe hop before next pore
        gcode.append(f"G0 Z{z_safe_hop:.3f} F600 ; Safe Z hop")

    gcode.append(f"{return_tool} ; Restore previously active tool")
    gcode.append("M83 ; Keep relative extrusion mode")
    gcode.append("; --- MULTILAYER PORE INJECTION END ---")
    
    return gcode
