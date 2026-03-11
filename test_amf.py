import numpy as np
from stl import mesh
import os

# Create two simple boxes
def create_box(x, y, z):
    vertices = np.array([\
        [-1, -1, -1],
        [+1, -1, -1],
        [+1, +1, -1],
        [-1, +1, -1],
        [-1, -1, +1],
        [+1, -1, +1],
        [+1, +1, +1],
        [-1, +1, +1]])
    faces = np.array([\
        [0,3,1], [1,3,2], [0,4,7], [0,7,3], [4,5,6], [4,6,7],
        [5,1,2], [5,2,6], [2,3,6], [3,7,6], [0,1,5], [0,5,4]])
    
    box = mesh.Mesh(np.zeros(faces.shape[0], dtype=mesh.Mesh.dtype))
    for i, f in enumerate(faces):
        for j in range(3):
            box.vectors[i][j] = vertices[f[j],:]
            
    box.x += x + 100
    box.y += y + 100
    box.z += z + 1.0 # Ensure it rests on the bed (Z > 0)
    return box

box1 = create_box(0, 0, 0)
box2 = create_box(2, 0, 0)

models_data = [
    {"mesh": box1, "toolhead": "fdm"},
    {"mesh": box2, "toolhead": "syringe"}
]

toolhead_mapping = {
    "fdm": 1,
    "syringe": 2,
    "uv": 3
}

amf_path = "test_multi.amf"
with open(amf_path, "w", encoding="utf-8") as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n')
    f.write('<amf unit="millimeter" version="1.1">\n')
    
    f.write('  <material id="1"><metadata type="name">FDM</metadata></material>\n')
    f.write('  <material id="2"><metadata type="name">Syringe</metadata></material>\n')
    
    f.write('  <object id="1">\n')
    f.write('    <mesh>\n')
    
    f.write('      <vertices>\n')
    for m_data in models_data:
        m = m_data["mesh"]
        for tri in m.vectors:
            for v in tri:
                f.write(f'        <vertex><coordinates><x>{v[0]:.4f}</x><y>{v[1]:.4f}</y><z>{v[2]:.4f}</z></coordinates></vertex>\n')
    f.write('      </vertices>\n')
    
    current_v_idx = 0
    for m_data in models_data:
        m = m_data["mesh"]
        material_id = toolhead_mapping.get(m_data["toolhead"], 1)
        f.write(f'      <volume materialid="{material_id}">\n')
        num_triangles = len(m.vectors)
        for i in range(num_triangles):
            f.write(f'        <triangle><v1>{current_v_idx}</v1><v2>{current_v_idx+1}</v2><v3>{current_v_idx+2}</v3></triangle>\n')
            current_v_idx += 3
        f.write('      </volume>\n')
        
    f.write('    </mesh>\n')
    f.write('  </object>\n')
    f.write('</amf>\n')

print(f"Created {amf_path}")

# Note: We need a basic printer config with 2 extruders to test PrusaSlicer
config_path = "test_multi.ini"
with open(config_path, "w") as f:
    f.write('''
[printer]
nozzle_diameter = 0.4,0.4
extruder_offset = 0x0,0x0
''')
