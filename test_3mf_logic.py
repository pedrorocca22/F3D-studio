import os
import zipfile
import json
from pathlib import Path
from xml.sax.saxutils import quoteattr

def xml_attr(s):
    return quoteattr(str(s))[1:-1]

def _normalize_fill_pattern(p):
    if not p: return "rectilinear"
    p = p.lower()
    if "gyroid" in p: return "gyroid"
    if "honeycomb" in p: return "honeycomb"
    return "rectilinear"

# --- LA FUNCIÓN A PROBAR (Lab Version) ---
def write_3mf_lab(models_data, output_path, layer_actions, lh=0.2, flh=0.3):
    """
    Versión de laboratorio para replicar la estructura de PrusaSlicer 2.9+
    con archivos Metadata separados.
    """
    toolhead_to_extruder = {"fdm": 0, "syringe": 1, "uv": 2, "none": 0}
    
    # 1. Preparar mallas (simplificado para el test)
    volumes = []
    for i, m_data in enumerate(models_data, start=1):
        volumes.append({
            "id": i,
            "model_id": m_data.get("model_id"),
            "toolhead": m_data.get("toolhead", "fdm"),
            "triangles": m_data["mesh_tri_count"] 
        })

    # 2. Generar 3D/3dmodel.model (Estructura básica)
    model_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model">
   <mesh>
    <vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/></vertices>
    <triangles><triangle v1="0" v2="1" v3="2"/></triangles>
   </mesh>
  </object>
 </resources>
 <build><item objectid="1"/></build>
</model>"""

    # 3. Generar Metadata/Slic3r_PE_model.config
    config_lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>']
    for vol in volumes:
        obj_id = vol["id"]
        config_lines.append(f' <object id="{obj_id}" instances_count="1">')
        config_lines.append(f'  <metadata type="object" key="name" value="test_part.stl"/>')
        config_lines.append(f'  <volume firstid="0" lastid="{vol["triangles"]-1}">')
        config_lines.append(f'   <metadata type="volume" key="name" value="test_part.stl"/>')
        config_lines.append(f'   <metadata type="volume" key="volume_type" value="ModelPart"/>')
        config_lines.append(f'  </volume>')
        config_lines.append(' </object>')
    config_lines.append('</config>')
    slic3r_pe_model_config = "\n".join(config_lines)

    # 4. Generar Metadata/Prusa_Slicer_layer_config_ranges.xml (NUEVA LÓGICA)
    ranges_xml_lines = ['<?xml version="1.0" encoding="utf-8"?>', '<objects>']
    ranges_found = False

    for vol in volumes:
        obj_id = vol["id"]
        model_id = vol["model_id"]
        
        # Buscar el plan para este modelo
        plan = next((p for p in layer_actions if str(p.get("modelId")) == str(model_id)), None)
        if plan and plan.get("ranges"):
            ranges_found = True
            ranges_xml_lines.append(f' <object id="{obj_id}">')
            for r in plan["ranges"]:
                l_from = int(r.get("layerFrom", 1))
                l_to = int(r.get("layerTo", 1))
                # Cálculo de Z exacto como Prusa
                z_min = 0.0 if l_from <= 1 else round(flh + (l_from - 2) * lh, 4)
                z_max = round(flh + (l_to - 1) * lh, 4)
                
                ranges_xml_lines.append(f'  <range min_z="{z_min:.4f}" max_z="{z_max:.4f}">')
                setts = r.get("settings", {}).get("fdm", {})
                if "infillPercent" in setts:
                    ranges_xml_lines.append(f'   <option opt_key="fill_density">{setts["infillPercent"]}%</option>')
                if "infillPattern" in setts:
                    ranges_xml_lines.append(f'   <option opt_key="fill_pattern">{_normalize_fill_pattern(setts["infillPattern"])}</option>')
                
                # AÑADIR LAYER_HEIGHT PARA CLONAR PRUSA
                ranges_xml_lines.append(f'   <option opt_key="layer_height">{lh}</option>')
                
                # Extruder (Base-0)
                tool = r.get("settings", {}).get("mapping", {}).get("infill", "fdm")
                ranges_xml_lines.append(f'   <option opt_key="extruder">{toolhead_to_extruder.get(tool, 0)}</option>')
                ranges_xml_lines.append('  </range>')
            ranges_xml_lines.append(' </object>')
    
    ranges_xml_lines.append('</objects>')
    ranges_xml = "\n".join(ranges_xml_lines)

    # 5. [Content_Types].xml (NUEVA LÓGICA)
    content_types = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
 <Override PartName="/Metadata/Slic3r_PE_model.config" ContentType="application/vnd.slic3r.model-config+xml"/>
 <Override PartName="/Metadata/Prusa_Slicer_layer_config_ranges.xml" ContentType="application/xml"/>
</Types>"""

    # 6. Empaquetar ZIP
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/Slic3r_PE_model.config", slic3r_pe_model_config)
        if ranges_found:
            zf.writestr("Metadata/Prusa_Slicer_layer_config_ranges.xml", ranges_xml)

    print(f"--- TEST FINISH: {output_path} ---")

# --- EJECUCIÓN DEL TEST ---
if __name__ == "__main__":
    dummy_models = [
        {"model_id": "MOD1", "mesh_tri_count": 100, "toolhead": "fdm"}
    ]
    
    # Simulación de UN SOLO GRUPO de capas como el de referencia
    dummy_layer_actions = [
        {
            "modelId": "MOD1",
            "ranges": [
                {
                    "layerFrom": 1, "layerTo": 10, # De 0 a ~2mm
                    "settings": {
                        "fdm": {"infillPercent": 30, "infillPattern": "gyroid"},
                        "mapping": {"infill": "fdm"}
                    }
                }
            ]
        }
    ]

    test_file = "test_output.3mf"
    write_3mf_lab(dummy_models, test_file, dummy_layer_actions)

    # Inspecciones básicas del resultado
    with zipfile.ZipFile(test_file, 'r') as z:
        print("\nArchivos generados en el ZIP:")
        for f in z.namelist():
            print(f" - {f}")
        
        if "Metadata/Prusa_Slicer_layer_config_ranges.xml" in z.namelist():
            print("\nContenido de Metadata/Prusa_Slicer_layer_config_ranges.xml:")
            print(z.read("Metadata/Prusa_Slicer_layer_config_ranges.xml").decode())
