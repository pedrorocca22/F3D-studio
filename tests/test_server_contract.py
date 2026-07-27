from werkzeug.datastructures import MultiDict

import json
from pathlib import Path

from server import _build_fdm_form_params, _validate_fdm_slice_request
import server


def test_fdm_form_contract_preserves_slicer_fields():
    form = MultiDict(
        [
            ("toolheads", '[{"id":"fdm"}]'),
            ("skirt_height", "2"),
            ("retraction_length", "1.25"),
            ("supports", "true"),
        ]
    )

    params = _build_fdm_form_params(form)

    assert params["toolheads"] == '[{"id":"fdm"}]'
    assert params["skirt_height"] == "2"
    assert params["retract_length"] == "1.25"
    assert params["supports"] is True


def test_fdm_form_contract_has_safe_defaults():
    params = _build_fdm_form_params(MultiDict())

    assert params["toolheads"] == "[]"
    assert params["skirt_height"] == "1"
    assert params["resolved_layer_plans"] == "[]"
    assert params["supports"] is False
    assert params["infill_pattern"] == "grid"


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
            ("toolheads", json.dumps([{"id": "fdm", "slot": 0}, {"id": "syringe", "slot": 1}])),
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
                "injectionDepthMm": 0.3,
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
