def _write_multimaterial_3mf(models_data, output_path, layer_actions=None, layer_height=0.2, first_layer_height=0.3):
    """
    Generates a PrusaSlicer-compatible 3MF file with per-volume extruder assignment
    and per-object FDM settings overrides.
    models_data: list of dicts: [
        {"mesh": m, "toolhead": "fdm", "scaffoldTools": {...}, "fdmSettings": {...}}, 
        ...
    ]
    output_path: Path to the .3mf file to write.
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

    for m_data in models_data:
        m = m_data["mesh"]
        extruder = toolhead_to_extruder.get(m_data.get("toolhead", "fdm"), 1)
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
        
        vol_info = {
            "triangles": tris, 
            "extruder": extruder,
            "scaffoldTools": m_data.get("scaffoldTools"),
            "fdmSettings": m_data.get("fdmSettings"),
            "model_id": m_data.get("model_id")
        }
        volumes.append(vol_info)

    model_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<model unit="millimeter" xml:lang="en-US"'
        ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"'
        ' xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">',
        ' <resources>',
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

        model_lines.append(f'  <object id="{obj_id}" type="model">')
        model_lines.append(f'   <mesh>')
        model_lines.append(f'    <vertices>')
        for vt in local_verts:
            model_lines.append(f'     <vertex x="{vt[0]:.6f}" y="{vt[1]:.6f}" z="{vt[2]:.6f}" />')
        model_lines.append(f'    </vertices>')
        model_lines.append(f'    <triangles>')
        for t in local_tris:
            model_lines.append(f'     <triangle v1="{t[0]}" v2="{t[1]}" v3="{t[2]}" />')
        model_lines.append(f'    </triangles>')
        model_lines.append(f'   </mesh>')
        model_lines.append(f'  </object>')

    model_lines.append(' </resources>')
    model_lines.append(' <build>')
    for vol_idx in range(len(volumes)):
        obj_id = vol_idx + 1
        model_lines.append(f'  <item objectid="{obj_id}" />')
    model_lines.append(' </build>')
    model_lines.append('</model>')
    model_xml = "\n".join(model_lines)

    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\n'
        ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\n'
        '</Types>'
    )

    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        ' <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\n'
        '</Relationships>'
    )

    config_lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>']
    for vol_idx, vol in enumerate(volumes):
        obj_id = vol_idx + 1
        config_lines.append(f' <object id="{obj_id}" instances_count="1">')
        config_lines.append(f'  <metadata type="object" key="name" value="Part_{obj_id}"/>')
        
        if vol.get("scaffoldTools"):
            st = vol["scaffoldTools"]
            config_lines.append(f'  <metadata type="object" key="perimeter_extruder" value="{toolhead_to_extruder.get(st.get("perimeter", "fdm"), 1)}"/>')
            config_lines.append(f'  <metadata type="object" key="infill_extruder" value="{toolhead_to_extruder.get(st.get("infill", "fdm"), 1)}"/>')
            config_lines.append(f'  <metadata type="object" key="solid_infill_extruder" value="{toolhead_to_extruder.get(st.get("solidInfill", "fdm"), 1)}"/>')
            config_lines.append(f'  <metadata type="object" key="support_material_extruder" value="{toolhead_to_extruder.get(st.get("support", "fdm"), 1)}"/>')
        else:
            config_lines.append(f'  <metadata type="object" key="extruder" value="{vol["extruder"]}"/>')

        if vol.get("fdmSettings"):
            fs = vol["fdmSettings"]
            if "infillPercent" in fs:
                config_lines.append(f'  <metadata type="object" key="fill_density" value="{fs["infillPercent"]}%"/>')
            if "infillPattern" in fs:
                config_lines.append(f'  <metadata type="object" key="fill_pattern" value="{fs["infillPattern"]}"/>')
            if "wallCount" in fs:
                config_lines.append(f'  <metadata type="object" key="perimeters" value="{fs["wallCount"]}"/>')
            if "topSolidLayers" in fs:
                config_lines.append(f'  <metadata type="object" key="top_solid_layers" value="{fs["topSolidLayers"]}"/>')
            if "bottomSolidLayers" in fs:
                config_lines.append(f'  <metadata type="object" key="bottom_solid_layers" value="{fs["bottomSolidLayers"]}"/>')
            if "fillAngle" in fs:
                config_lines.append(f'  <metadata type="object" key="fill_angle" value="{fs["fillAngle"]}"/>')
        # Determine if layer_actions contains resolved plans
        is_resolved_plan = False
        if layer_actions and isinstance(layer_actions, list) and len(layer_actions) > 0:
            if "ranges" in layer_actions[0] and "modelId" in layer_actions[0]:
                is_resolved_plan = True

        model_id = vol.get("model_id")

        # ── Helper: extract PrusaSlicer param dict from fdm settings dict ──
        def _fdm_to_ps_params(fdm: dict) -> dict:
            params = {}
            if "infillPercent" in fdm and fdm["infillPercent"] not in (None, ""):
                params["fill_density"] = f"{fdm['infillPercent']}%"
            normalized_pattern = _normalize_fill_pattern(fdm.get("infillPattern"))
            if normalized_pattern:
                params["fill_pattern"] = normalized_pattern
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
                        # l_from=1 → z=0 (first layer starts at 0)
                        z_min = 0.0 if l_from <= 1 else round(first_layer_height + (l_from - 2) * layer_height, 4)
                        z_max = round(first_layer_height + (l_to - 1) * layer_height, 4)
                        range_entries.append({"range": f"{z_min},{z_max}", "params": params})

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
                        z_min = 0.0 if l_from <= 1 else round(first_layer_height + (l_from - 2) * layer_height, 4)
                        z_max = round(first_layer_height + (l_to - 1) * layer_height, 4)
                        range_entries.append({"range": f"{z_min},{z_max}", "params": params})
                except Exception:
                    continue

        if range_entries:
            src = "resolved" if is_resolved_plan else "raw-actions"
            print(f"[3MF] Model {model_id} ({src}): {len(range_entries)} layer_range entries:")
            for e in range_entries:
                print(f"  Z[{e['range'].replace(',', ' -> ')}] params={e['params']}")

            # PrusaSlicer proprietary 3MF format for Height Range Modifiers
            ranges_str = ";".join(e["range"] for e in range_entries)
            config_lines.append(f'  <metadata type="object" key="layer_range">{ranges_str}</metadata>')
            
            for e in range_entries:
                z_rng = e["range"]
                for ps_key, ps_val in e["params"].items():
                    config_lines.append(f'  <metadata type="object" key="{ps_key}_{z_rng}">{ps_val}</metadata>')
                    if ps_key == "fill_pattern":
                        config_lines.append(f'  <metadata type="object" key="solid_fill_pattern_{z_rng}">{ps_val}</metadata>')
                        config_lines.append(f'  <metadata type="object" key="top_fill_pattern_{z_rng}">{ps_val}</metadata>')

        config_lines.append(f'  <volume firstid="0" lastid="{len(vol["triangles"])-1}">')
        config_lines.append(f'   <metadata type="volume" key="name" value="Volume_{obj_id}"/>')
        config_lines.append(f'   <metadata type="volume" key="volume_type" value="ModelPart"/>')
        config_lines.append(f'  </volume>')
        config_lines.append(f' </object>')
    config_lines.append('</config>')
    slic3r_config = "\n".join(config_lines)

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("3D/3dmodel.model", model_xml)
        zf.writestr("Metadata/Slic3r_PE_model.config", slic3r_config)
