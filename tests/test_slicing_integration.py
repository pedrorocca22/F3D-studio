import json
import zipfile
from pathlib import Path
from types import SimpleNamespace

from werkzeug.datastructures import MultiDict

import server


def _write_triangle(path: Path) -> None:
    path.write_text(
        """solid triangle
 facet normal 0 0 1
  outer loop
   vertex 0 0 0
   vertex 10 0 0
   vertex 0 10 0
  endloop
 endfacet
endsolid triangle
""",
        encoding="utf-8",
    )


def test_fdm_slice_pipeline_writes_config_3mf_and_sanitized_gcode(tmp_path, monkeypatch):
    job_dir = tmp_path / "job-1"
    job_dir.mkdir()
    stl_path = job_dir / "model_0.stl"
    _write_triangle(stl_path)

    config_path = tmp_path / "config.ini"
    config_path.write_text(
        "printer_technology = FFF\n"
        "bed_shape = 0x0,100x0,100x100,0x100\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(server, "FDM_CONFIG_INI", str(config_path))
    monkeypatch.setattr(server, "_debug_log_to_file", lambda *_args: None)

    def fake_prusa_slicer(command, **_kwargs):
        output_path = Path(command[command.index("--output") + 1])
        output_path.write_text(
            "; total layers count = 2\n"
            "; filament used [mm] = 123.4\n"
            ";LAYER_CHANGE\n"
            "T0\n"
            "G1 X10 Y10 E1\n"
            ";LAYER_CHANGE\n"
            "G1 X20 Y20 E2\n",
            encoding="utf-8",
        )
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setattr(server.subprocess, "run", fake_prusa_slicer)

    resolved_plan = [
        {
            "modelId": "m1",
            "modelName": "triangle",
            "ranges": [
                {
                    "layerFrom": 1,
                    "layerTo": 1,
                    "settings": {
                        "mapping": {"perimeter": "fdm", "infill": "fdm"},
                        "fdm": {"infillPercent": 20, "perimeterSpeedMmS": 30},
                    },
                },
                {
                    "layerFrom": 2,
                    "layerTo": 2,
                    "settings": {
                        "mapping": {"perimeter": "fdm", "infill": "syringe"},
                        "uv": {
                            "exposureTimeSec": 1,
                            "pausePrint": False,
                            "scanSpeedMmS": 20,
                            "powerPercentage": 80,
                            "lineSpacingMm": 1,
                            "zOffsetMm": 2,
                        },
                    },
                },
            ],
        }
    ]

    form = MultiDict(
        [
            ("layer_height", "0.2"),
            ("first_layer_height", "0.3"),
            ("skirt_height", "2"),
            ("toolheads", json.dumps([{"id": "fdm"}, {"id": "syringe"}])),
            (
                "models_metadata",
                json.dumps(
                    [
                        {
                            "id": "m1",
                            "transform": {
                                "position": {"x": 0, "y": 0, "z": 0},
                                "rotation": {"x": 0, "y": 0, "z": 0},
                                "scale": {"x": 1, "y": 1, "z": 1},
                            },
                            "toolhead": "fdm",
                            "scaffoldTools": {
                                "perimeter": "fdm",
                                "infill": "syringe",
                                "solidInfill": "fdm",
                                "support": "fdm",
                            },
                        }
                    ]
                ),
            ),
            ("resolved_layer_plans", json.dumps(resolved_plan)),
            ("layer_actions", "[]"),
            ("z_zones", "[]"),
        ]
    )
    params = server._build_fdm_form_params(form)

    result = server._run_fdm_slice_job("job-1", [stl_path], job_dir, params)

    assert result and result[0]["model_id"] == "m1"

    job_config = (job_dir / "job_config.ini").read_text(encoding="utf-8")
    assert "skirt_height = 2" in job_config
    assert "temperature = 210,210,210" in job_config

    with zipfile.ZipFile(job_dir / "consolidated.3mf") as archive:
        names = set(archive.namelist())
        assert "3D/3dmodel.model" in names
        assert "Metadata/Prusa_Slicer_layer_config_ranges.xml" in names
        ranges_xml = archive.read(
            "Metadata/Prusa_Slicer_layer_config_ranges.xml"
        ).decode("utf-8")
        assert 'opt_key="perimeter_speed">30</option>' in ranges_xml
        assert 'opt_key="infill_extruder">2</option>' in ranges_xml

    gcode = (job_dir / "print.gcode").read_text(encoding="utf-8")
    assert "T2" in gcode
    assert "T0 ; Restaurar cabezal original tras evento de proceso" in gcode

    manifest = json.loads((job_dir / "job_fdm.json").read_text(encoding="utf-8"))
    assert manifest["layer_count"] == 2
    assert manifest["filament_used_mm"] == 123.4
