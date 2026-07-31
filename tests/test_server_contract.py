from werkzeug.datastructures import MultiDict

import json
from pathlib import Path
from types import SimpleNamespace
import zipfile
import pytest

from server import _build_fdm_form_params, _validate_fdm_slice_request, _pore_calibration_ul_per_mm, _bottom_solid_top_z
import server


def test_layer_ranges_inherit_global_infill_pattern_unless_explicitly_overridden(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "_debug_log_to_file", lambda *_args, **_kwargs: None)
    mesh = SimpleNamespace(vectors=[[[0, 0, 0], [1, 0, 0], [0, 1, 0]]])
    output = tmp_path / "inherit-pattern.3mf"
    models = [{"mesh": mesh, "toolhead": "fdm", "model_id": "m1"}]
    plans = [{
        "modelId": "m1",
        "ranges": [
            {"layerFrom": 1, "layerTo": 2, "settings": {"mapping": {"infill": "fdm"}, "fdm": {}}},
            {"layerFrom": 3, "layerTo": 4, "settings": {"mapping": {"infill": "fdm"}, "fdm": {"infillPattern": "triangles"}}},
        ],
    }]

    server._write_multimaterial_3mf(models, output, plans)

    with zipfile.ZipFile(output) as archive:
        ranges_xml = archive.read("Metadata/Prusa_Slicer_layer_config_ranges.xml").decode("utf-8")

    assert ranges_xml.count('<option opt_key="fill_pattern">') == 1
    assert '<option opt_key="fill_pattern">triangles</option>' in ranges_xml
    assert "gyroid" not in ranges_xml


def test_instance_toolhead_ids_map_to_their_physical_extruders(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "_debug_log_to_file", lambda *_args, **_kwargs: None)
    mesh = SimpleNamespace(vectors=[[[0, 0, 0], [1, 0, 0], [0, 1, 0]]])
    output = tmp_path / "instance-tools.3mf"
    models = [{"mesh": mesh, "toolhead": "none", "model_id": "m1"}]
    plans = [{
        "modelId": "m1",
        "ranges": [{
            "layerFrom": 1,
            "layerTo": 2,
            "settings": {
                "mapping": {
                    "perimeter": "fdm-a",
                    "solidInfill": "syringe-a",
                    "infill": "syringe-b",
                    "support": "none",
                },
                "fdm": {},
            },
        }],
    }]
    toolheads = [
        {"id": "fdm-a", "type": "fdm", "slot": 0},
        {"id": "syringe-a", "type": "syringe", "slot": 1},
        {"id": "syringe-b", "type": "syringe", "slot": 2},
    ]

    server._write_multimaterial_3mf(
        models,
        output,
        plans,
        layer_height=0.2,
        first_layer_height=0.3,
        toolheads_config=toolheads,
    )

    with zipfile.ZipFile(output) as archive:
        ranges_xml = archive.read("Metadata/Prusa_Slicer_layer_config_ranges.xml").decode("utf-8")

    assert '<option opt_key="perimeter_extruder">1</option>' in ranges_xml
    assert '<option opt_key="solid_infill_extruder">2</option>' in ranges_xml
    assert '<option opt_key="infill_extruder">3</option>' in ranges_xml


def test_zones_mask_global_pore_sites_only_for_their_model_scope():
    all_models = {"enabled": True, "modelScope": "all", "zStartMm": 1.0, "zEndMm": 2.0}
    one_model = {"enabled": True, "modelScope": "m1", "zStartMm": 1.0, "zEndMm": 2.0}
    disabled = {"enabled": False, "modelScope": "all", "zStartMm": 1.0, "zEndMm": 2.0}

    assert server._zone_covers_pore_site(all_models, 1.5, "m2") is True
    assert server._zone_covers_pore_site(one_model, 1.5, "m1") is True
    assert server._zone_covers_pore_site(one_model, 1.5, "m2") is False
    assert server._zone_covers_pore_site(one_model, 2.5, "m1") is False
    assert server._zone_covers_pore_site(disabled, 1.5, "m1") is False


def test_fdm_form_contract_preserves_slicer_fields():
    form = MultiDict(
        [
            ("toolheads", '[{"id":"fdm"}]'),
            ("skirt_height", "2"),
            ("retraction_length", "1.25"),
            ("supports", "true"),
            ("firmware_type", "marlin2"),
            ("firmware_supports_arcs", "true"),
            ("gcode_curve_mode", "arcs"),
        ]
    )

    params = _build_fdm_form_params(form)

    assert params["toolheads"] == '[{"id":"fdm"}]'
    assert params["skirt_height"] == "2"
    assert params["retract_length"] == "1.25"
    assert params["supports"] is True
    assert params["firmware_type"] == "marlin2"
    assert params["firmware_supports_arcs"] is True
    assert params["gcode_curve_mode"] == "arcs"


def test_fdm_form_contract_has_safe_defaults():
    params = _build_fdm_form_params(MultiDict())

    assert params["toolheads"] == "[]"
    assert params["skirt_height"] == "1"
    assert params["resolved_layer_plans"] == "[]"
    assert params["supports"] is False
    assert params["infill_pattern"] == "grid"
    assert params["firmware_type"] == "reprapfirmware"
    assert params["firmware_supports_arcs"] is False
    assert params["gcode_curve_mode"] == "linear"


def test_fdm_slice_validation_rejects_unconfigured_environment():
    params = _build_fdm_form_params(MultiDict())
    issues = _validate_fdm_slice_request([], params)

    codes = {issue["code"] for issue in issues}
    assert "models.missing" in codes
    assert "environment.bed.missing" in codes
    assert "environment.toolheads.missing" in codes


def test_fdm_slice_validation_accepts_a_configured_request():
    form = MultiDict(
        [
            ("print_bed", json.dumps({"type": "glass_bed", "dimensions": {"width": 100, "height": 100}})),
            ("toolheads", json.dumps([{"id": "fdm", "slot": 0}])),
            ("models_metadata", json.dumps([{"id": "m1", "name": "Model", "toolhead": "fdm"}])),
            ("layer_height", "0.2"),
            ("infill", "15"),
            ("nozzle_diameter", "0.4"),
            ("infill_pattern", "grid"),
            ("z_zones", "[]"),
        ]
    )
    params = _build_fdm_form_params(form)
    assert _validate_fdm_slice_request([object()], params) == []


def test_slice_validation_accepts_a_syringe_only_mapping_without_fdm():
    form = MultiDict(
        [
            ("print_bed", json.dumps({"type": "glass_bed", "dimensions": {"width": 100, "height": 100}})),
            ("toolheads", json.dumps([{"id": "syringe", "slot": 0}])),
            ("models_metadata", json.dumps([{
                "id": "m1",
                "name": "Hydrogel model",
                "toolhead": "none",
                "scaffoldTools": {
                    "perimeter": "syringe",
                    "infill": "syringe",
                    "solidInfill": "syringe",
                    "support": "syringe",
                },
            }])),
            ("layer_height", "0.2"),
            ("infill", "15"),
            ("nozzle_diameter", "0.4"),
            ("infill_pattern", "grid"),
            ("z_zones", "[]"),
        ]
    )
    params = _build_fdm_form_params(form)
    assert _validate_fdm_slice_request([object()], params) == []


def test_slice_validation_accepts_whole_scaffold_pore_injection_without_zones():
    form = MultiDict(
        [
            ("print_bed", json.dumps({"type": "glass_bed", "dimensions": {"width": 100, "height": 100}})),
            ("toolheads", json.dumps([{"id": "fdm", "slot": 0}, {"id": "syringe", "slot": 1, "flowRateUlPerMm": 0.8}])),
            ("models_metadata", json.dumps([{
                "id": "m1",
                "name": "Scaffold",
                "toolhead": "fdm",
                "fdm_settings": {"infillPattern": "grid"},
            }])),
            ("pore_injection", json.dumps({
                "enabled": True,
                "mode": "layer_by_layer",
                "syringeToolhead": "syringe",
                "flowRateUlPerCell": 0.5,
            })),
            ("layer_height", "0.2"),
            ("infill", "15"),
            ("nozzle_diameter", "0.4"),
            ("infill_pattern", "grid"),
            ("z_zones", "[]"),
        ]
    )
    params = _build_fdm_form_params(form)
    assert _validate_fdm_slice_request([object()], params) == []


def test_slice_validation_rejects_legacy_multilayer_pore_injection():
    form = MultiDict(
        [
            ("print_bed", json.dumps({"type": "glass_bed", "dimensions": {"width": 100, "height": 100}})),
            ("toolheads", json.dumps([{"id": "fdm", "slot": 0}, {"id": "syringe", "slot": 1, "flowRateUlPerMm": 0.8}])),
            ("models_metadata", json.dumps([{"id": "m1", "name": "Scaffold", "toolhead": "fdm", "fdm_settings": {"infillPattern": "grid"}}])),
            ("pore_injection", json.dumps({
                "enabled": True,
                "mode": "multilayer",
                "syringeToolhead": "syringe",
                "flowRateUlPerCell": 0.5,
            })),
            ("z_zones", "[]"),
        ]
    )
    issues = _validate_fdm_slice_request([object()], _build_fdm_form_params(form))
    assert "pore.mode.global" in {issue["code"] for issue in issues}


def test_pore_calibration_comes_from_the_assigned_syringe_head():
    assert _pore_calibration_ul_per_mm([{"id": "syringe", "slot": 1, "flowRateUlPerMm": "0.8"}]) == 0.8
    assert _pore_calibration_ul_per_mm([{"id": "syringe", "slot": 1, "flowRateUlPerMm": "165"}]) == 165.0
    assert _pore_calibration_ul_per_mm([{"id": "syringe", "slot": 1, "flowRateUlPerMm": ""}]) is None
    assert _pore_calibration_ul_per_mm([{"id": "syringe", "flowRateUlPerMm": 0.8}]) is None


def test_bottom_solid_envelope_accounts_for_first_layer_height():
    assert _bottom_solid_top_z(
        {"first_layer_height": "0.3", "layer_height": "0.2", "bottom_shell": "3"},
        [],
        [],
    ) == 0.7
    assert _bottom_solid_top_z(
        {"first_layer_height": "0.3", "layer_height": "0.2", "bottom_shell": "1"},
        [{"fdm_settings": {"bottomSolidLayers": 4}}],
        [],
    ) == pytest.approx(0.9)


def test_slice_validation_blocks_pore_injection_without_calibration():
    form = MultiDict([
        ("print_bed", json.dumps({"type": "glass_bed", "dimensions": {"width": 100, "height": 100}})),
        ("toolheads", json.dumps([{"id": "fdm", "slot": 0}, {"id": "syringe", "slot": 1}])),
        ("models_metadata", json.dumps([{"id": "m1", "name": "Scaffold", "fdm_settings": {"infillPattern": "grid"}}])),
        ("pore_injection", json.dumps({"enabled": True, "flowRateUlPerCell": 0.5})),
        ("z_zones", "[]"),
    ])
    issues = _validate_fdm_slice_request([object()], _build_fdm_form_params(form))
    assert "pore.calibration.global" in {issue["code"] for issue in issues}


def test_dry_run_accepts_assigned_syringe_and_never_starts_printer(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "JOBS_DIR", Path(tmp_path))
    job_dir = Path(tmp_path) / "job-1"
    job_dir.mkdir()
    (job_dir / "print.gcode").write_text(
        "; total layers count = 1\nT1\n; --- PORE INJECTION START ---\nG1 X1 Y1 E0.1\n",
        encoding="utf-8",
    )
    (job_dir / "job_fdm.json").write_text(json.dumps({
        "layer_count": 1,
        "toolheads": [{"id": "syringe", "klipper_tool": "T1", "slot": 0}],
    }), encoding="utf-8")

    response = server.app.test_client().post("/moonraker/print/dry-run", json={"job_id": "job-1"})

    assert response.status_code == 200
    assert response.json["status"] == "ready"
    assert response.json["summary"]["pore_injection_blocks"] == 1
    assert json.loads((job_dir / "job_fdm.json").read_text(encoding="utf-8"))["dry_run"]["status"] == "ready"


def test_dry_run_blocks_an_unassigned_toolhead(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "JOBS_DIR", Path(tmp_path))
    job_dir = Path(tmp_path) / "job-2"
    job_dir.mkdir()
    (job_dir / "print.gcode").write_text("T0\nG1 X1 Y1 E0.1\n", encoding="utf-8")
    (job_dir / "job_fdm.json").write_text(json.dumps({
        "layer_count": 1,
        "toolheads": [{"id": "syringe", "klipper_tool": "T1", "slot": 0}],
    }), encoding="utf-8")

    response = server.app.test_client().post("/moonraker/print/dry-run", json={"job_id": "job-2"})

    assert response.status_code == 422
    assert response.json["issues"][0]["code"] == "dry_run.toolhead.unassigned"
def test_instance_toolheads_resolve_to_physical_slots():
    toolheads = [
        {"id": "syringe-a", "type": "syringe", "slot": 1},
        {"id": "syringe-b", "type": "syringe", "slot": 3},
        {"id": "uv-a", "type": "uv", "slot": 4},
    ]

    assert server._toolhead_gcode_name(toolheads, "syringe-a") == "T1"
    assert server._toolhead_gcode_name(toolheads, "syringe-b") == "T3"
    assert server._toolhead_ini_index(toolheads, "uv-a") == "5"
