import re

with open("server.py", "r", encoding="utf-8") as f:
    code = f.read()

replacement = '''def _write_multimaterial_3mf(models_data, output_path, layer_actions=None, layer_height=0.2, first_layer_height=0.3):
    """
    Generates a PrusaSlicer-compatible 3MF file with per-volume extruder assignment
    and per-object FDM settings overrides perfectly encoded via Modifier Volumes.
    """
    toolhead_to_extruder = {
        "fdm": 1,
        "syringe": 2,
        "uv": 3,
        "none": 1
    }

    vertices = []
    vertex_map = {}
    volumes = []

    # Parse layer actions
    is_resolved_plan = False
    if layer_actions and isinstance(layer_actions, list) and len(layer_actions) > 0:
        if "ranges" in layer_actions[0] and "modelId" in layer_actions[0]:
            is_resolved_plan = True
            
    def _fdm_to_ps_params(fdm: dict) -> dict:
        params = {}
        if "infillPercent" in fdm and fdm["infillPercent"] not in (None, ""):
            params["fill_density"] = f"{fdm['infillPercent']}%"
        from urllib.parse import unquote
        
        # very basic normalization mapping
        mapping = {"rectilinear": "rectilinear", "grid": "grid", "gyroid": "gyroid", "honeycomb": "honeycomb"}
        raw_pat = fdm.get("infillPattern", "")
        if raw_pat:
            params["fill_pattern"] = mapping.get(raw_pat, raw_pat)
        if "wallCount" in fdm and fdm["wallCount"] not in (None, ""):
            params["perimeters"] = str(fdm["wallCount"])
        if "topSolidLayers" in fdm and fdm["topSolidLayers"] not in (None, ""):
            params["top_solid_layers"] = str(fdm["topSolidLayers"])
        if "bottomSolidLayers" in fdm and fdm["bottomSolidLayers"] not in (None, ""):
            params["bottom_solid_layers"] = str(fdm["bottomSolidLayers"])
        if "layerHeightMm" in fdm and fdm["layerHeightMm"] not in (None, ""):
            params["layer_height"] = str(fdm["layerHeightMm"])
        if "extrusionMultiplier" in fdm and fdm["extrusionMultiplier"] not in (None, ""):
            params["extrusion_multiplier"] = str(fdm["extrusionMultiplier"])
        return params

    for m_data in models_data:
        m = m_data["mesh"]
        extruder = toolhead_to_extruder.get(m_data.get("toolhead", "fdm"), 1)
        model_id = m_data.get("model_id")

        # Extract range modifications for this model
        range_entries = []
        if is_resolved_plan:
            plan = next((p for p in layer_actions if str(p.get("modelId")) == str(model_id)), None)
            if plan:
                for r in plan.get("ranges", []):
                    l_from = int(r.get("layerFrom", 1))
                    l_to = int(r.get("layerTo", 1))
                    settings = r.get("settings", {}) or {}
                    fdm = settings.get("fdm", {}) or {}
                    params = _fdm_to_ps_params(fdm)
                    if params:
                        z_min_val = 0.0 if l_from <= 1 else round(first_layer_height + (l_from - 2) * layer_height, 4)
                        z_max_val = round(first_layer_height + (l_to - 1) * layer_height, 4)
                        range_entries.append({"z_min": z_min_val, "z_max": z_max_val, "params": params})

        elif layer_actions:
            for action in layer_actions:
                if action.get("kind") != "parameter_override":
                    continue
                action_model_id = action.get("modelId")
                if action_model_id not in (None, "", "all") and str(action_model_id) != str(model_id):
                    continue
                try:
                    l_from = int(action.get("layerFrom", 1))
                    l_to = int(action.get("layerTo", 1))
                    fdm = action.get("fdmSettings", {}) or {}
                    params = _fdm_to_ps_params(fdm)
                    if params:
                        z_min_val = 0.0 if l_from <= 1 else round(first_layer_height + (l_from - 2) * layer_height, 4)
                        z_max_val = round(first_layer_height + (l_to - 1) * layer_height, 4)
                        range_entries.append({"z_min": z_min_val, "z_max": z_max_val, "params": params})
                except Exception:
                    continue

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
        
        min_x = min([v[0] for v in vertices]) if vertices else -150
        max_x = max([v[0] for v in vertices]) if vertices else 150
        min_y = min([v[1] for v in vertices]) if vertices else -150
        max_y = max([v[1] for v in vertices]) if vertices else 150
        pad = 5.0

        vol_info = {
            "triangles": tris,
            "extruder": extruder,
            "scaffoldTools": m_data.get("scaffoldTools"),
            "fdmSettings": m_data.get("fdmSettings"),
            "model_id": model_id,
            "range_entries": range_entries,
            "bbox": (min_x-pad, max_x+pad, min_y-pad, max_y+pad)
        }
        volumes.append(vol_info)

    model_lines = [
        \'<?xml version="1.0" encoding="UTF-8"?>\',
        \'<model unit="millimeter" xml:lang="en-US"\'
        \' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"\'
        \' xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">\',
        \' <resources>\',
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
            
        vol["main_geom"] = (0, len(local_tris) - 1)
        
        vol["modifiers"] = []
        min_x, max_x, min_y, max_y = vol["bbox"]
        
        for e in vol["range_entries"]:
            z_min = float(e["z_min"])
            z_max = float(e["z_max"])
            
            box_verts = [
                (min_x, min_y, z_min), (max_x, min_y, z_min), (max_x, max_y, z_min), (min_x, max_y, z_min),
                (min_x, min_y, z_max), (max_x, min_y, z_max), (max_x, max_y, z_max), (min_x, max_y, z_max)
            ]
            v_offset = len(local_verts)
            for v in box_verts:
                local_verts.append(v)
                
            box_tris = [
                (0,1,2), (0,2,3), # bottom
                (4,6,5), (4,7,6), # top
                (0,4,5), (0,5,1), # front
                (1,5,6), (1,6,2), # right
                (2,6,7), (2,7,3), # back
                (3,7,4), (3,4,0)  # left
            ]
            
            t_offset = len(local_tris)
            for t in box_tris:
                local_tris.append((t[0]+v_offset, t[1]+v_offset, t[2]+v_offset))
                
            vol["modifiers"].append({
                "firstid": t_offset,
                "lastid": len(local_tris) - 1,
                "params": e["params"],
                "z_min": z_min, "z_max": z_max
            })

        model_lines.append(f\'  <object id="{obj_id}" type="model">\')
        model_lines.append(f\'   <mesh>\')
        model_lines.append(f\'    <vertices>\')
        for vt in local_verts:
            model_lines.append(f\'     <vertex x="{vt[0]:.6f}" y="{vt[1]:.6f}" z="{vt[2]:.6f}" />\')
        model_lines.append(f\'    </vertices>\')
        model_lines.append(f\'    <triangles>\')
        for t in local_tris:
            model_lines.append(f\'     <triangle v1="{t[0]}" v2="{t[1]}" v3="{t[2]}" />\')
        model_lines.append(f\'    </triangles>\')
        model_lines.append(f\'   </mesh>\')
        model_lines.append(f\'  </object>\')

    model_lines.append(\' </resources>\')
    model_lines.append(\' <build>\')
    for vol_idx in range(len(volumes)):
        obj_id = vol_idx + 1
        model_lines.append(f\'  <item objectid="{obj_id}" />\')
    model_lines.append(\' </build>\')
    model_lines.append(\'</model>\')
    model_xml = "\\n".join(model_lines)

    content_types = (
        \'<?xml version="1.0" encoding="UTF-8"?>\\n\'
        \'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\\n\'
        \' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\\n\'
        \' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\\n\'
        \'</Types>\'
    )

    rels = (
        \'<?xml version="1.0" encoding="UTF-8"?>\\n\'
        \'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\\n\'
        \' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\\n\'
        \'</Relationships>\'
    )

    config_lines = [\'<?xml version="1.0" encoding="UTF-8"?>\', \'<config>\']
    for vol_idx, vol in enumerate(volumes):
        obj_id = vol_idx + 1
        config_lines.append(f\' <object id="{obj_id}" instances_count="1">\')
        config_lines.append(f\'  <metadata type="object" key="name" value="Part_{obj_id}"/>\')
        
        if vol.get("scaffoldTools"):
            st = vol["scaffoldTools"]
            config_lines.append(f\'  <metadata type="object" key="perimeter_extruder" value="{toolhead_to_extruder.get(st.get("perimeter", "fdm"), 1)}"/>\')
            config_lines.append(f\'  <metadata type="object" key="infill_extruder" value="{toolhead_to_extruder.get(st.get("infill", "fdm"), 1)}"/>\')
            config_lines.append(f\'  <metadata type="object" key="solid_infill_extruder" value="{toolhead_to_extruder.get(st.get("solidInfill", "fdm"), 1)}"/>\')
            config_lines.append(f\'  <metadata type="object" key="support_material_extruder" value="{toolhead_to_extruder.get(st.get("support", "fdm"), 1)}"/>\')
        else:
            config_lines.append(f\'  <metadata type="object" key="extruder" value="{vol["extruder"]}"/>\')

        if vol.get("fdmSettings"):
            fs = vol["fdmSettings"]
            if "infillPercent" in fs:
                config_lines.append(f\'  <metadata type="object" key="fill_density" value="{fs["infillPercent"]}%"/>\')
            if "infillPattern" in fs:
                config_lines.append(f\'  <metadata type="object" key="fill_pattern" value="{fs["infillPattern"]}"/>\')
            if "wallCount" in fs:
                config_lines.append(f\'  <metadata type="object" key="perimeters" value="{fs["wallCount"]}"/>\')
            if "topSolidLayers" in fs:
                config_lines.append(f\'  <metadata type="object" key="top_solid_layers" value="{fs["topSolidLayers"]}"/>\')
            if "bottomSolidLayers" in fs:
                config_lines.append(f\'  <metadata type="object" key="bottom_solid_layers" value="{fs["bottomSolidLayers"]}"/>\')
            if "fillAngle" in fs:
                config_lines.append(f\'  <metadata type="object" key="fill_angle" value="{fs["fillAngle"]}"/>\')

        # 1. Main Geometry Volume
        if "main_geom" in vol:
            first_id, last_id = vol["main_geom"]
            config_lines.append(f\'  <volume firstid="{first_id}" lastid="{last_id}">\')
            config_lines.append(f\'   <metadata type="volume" key="name" value="Volume_{obj_id}"/>\')
            config_lines.append(f\'   <metadata type="volume" key="volume_type" value="ModelPart"/>\')
            config_lines.append(f\'  </volume>\')

        # 2. Modifier Geometries (Virtual Boxes)
        if vol.get("modifiers"):
            print(f"[3MF] Model {vol.get('model_id')}: {len(vol['modifiers'])} MESH Modifiers injected:")
            for m in vol["modifiers"]:
                print(f"  Z[{m['z_min']} -> {m['z_max']}] params={m['params']}")
                config_lines.append(f\'  <volume firstid="{m["firstid"]}" lastid="{m["lastid"]}">\')
                config_lines.append(f\'   <metadata type="volume" key="name" value="Modifier_Z_{m["z_min"]}_{m["z_max"]}"/>\')
                config_lines.append(f\'   <metadata type="volume" key="volume_type" value="Modifier"/>\')
                for ps_key, ps_val in m["params"].items():
                    config_lines.append(f\'   <metadata type="volume" key="{ps_key}" value="{ps_val}"/>\')
                    if ps_key == "fill_pattern":
                        config_lines.append(f\'   <metadata type="volume" key="solid_fill_pattern" value="{ps_val}"/>\')
                        config_lines.append(f\'   <metadata type="volume" key="top_fill_pattern" value="{ps_val}"/>\')
                config_lines.append(f\'  </volume>\')

        config_lines.append(f\' </object>\')
    config_lines.append(\'</config>\')
    import zipfile
    slic3r_config = "\\n".join(config_lines)

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/Slic3r_PE_model.config", slic3r_config)

    print(f"[3MF] Written multi-material 3MF with {len(volumes)} volumes to {output_path}")
'''

import re
old_func_pattern = re.compile(r'def _write_multimaterial_3mf\([^)]+\):.*?print\(f"\[3MF\].*?\n\n', re.DOTALL)
new_code = old_func_pattern.sub(replacement + "\n\n", code)

if "modifiers" in new_code:
    with open("server.py", "w", encoding="utf-8") as f:
        f.write(new_code)
    print("Replaced successfully")
else:
    print("Replacement Failed")
