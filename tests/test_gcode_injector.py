from utils.gcode_injector import (
    RETURN_TOOL_PLACEHOLDER,
    build_pore_injection_gcode,
    inject_pore_gcode_into_file,
    ensure_initial_toolhead,
)


def test_pore_injection_restores_the_active_syringe_tool(tmp_path):
    gcode_path = tmp_path / "syringe-scaffold.gcode"
    gcode_path.write_text(
        ";LAYER_CHANGE\n"
        "T1 ; syringe scaffold\n"
        ";TYPE:Internal infill\n"
        "G1 X10 Y12 E0.2\n"
        ";TYPE:Top solid infill\n"
        "G1 X15 Y18 E0.3\n",
        encoding="utf-8",
    )
    injection = build_pore_injection_gcode(
        centroids=[(10.0, 12.0)],
        current_z=0.2,
        flow_ul_per_cell=0.5,
        ul_per_mm=165.0,
        travel_feedrate=6000,
        inject_feedrate=120,
        syringe_tool="T1",
    )

    inject_pore_gcode_into_file(gcode_path, {1: injection})
    result = gcode_path.read_text(encoding="utf-8")

    assert f"{RETURN_TOOL_PLACEHOLDER} " not in result
    assert "T1 ; Restore previously active tool" in result
    assert "T0 ; Restore previously active tool" not in result
    assert result.index("T1 ; Restore previously active tool") < result.index(";TYPE:Top solid infill")


def test_pore_injection_does_not_invent_a_return_tool(tmp_path):
    gcode_path = tmp_path / "no-explicit-tool.gcode"
    gcode_path.write_text(
        ";LAYER_CHANGE\n"
        ";TYPE:Internal infill\n"
        "G1 X10 Y12 E0.2\n"
        ";TYPE:Top solid infill\n",
        encoding="utf-8",
    )
    injection = build_pore_injection_gcode(
        centroids=[(10.0, 12.0)],
        current_z=0.2,
        flow_ul_per_cell=0.5,
        ul_per_mm=165.0,
        travel_feedrate=6000,
        inject_feedrate=120,
        syringe_tool="T1",
    )

    inject_pore_gcode_into_file(gcode_path, {1: injection})
    result = gcode_path.read_text(encoding="utf-8")

    assert RETURN_TOOL_PLACEHOLDER not in result
    assert "T0 ; Restore previously active tool" not in result


def test_initial_default_tool_is_normalized_before_first_layer(tmp_path):
    gcode_path = tmp_path / "fdm-scaffold.gcode"
    gcode_path.write_text(
        "G90\n"
        "T1 ; profile default\n"
        ";LAYER_CHANGE\n"
        ";TYPE:Perimeter\n"
        "G1 X10 Y10 E0.2\n",
        encoding="utf-8",
    )

    assert ensure_initial_toolhead(gcode_path, "T0") is True
    result = gcode_path.read_text(encoding="utf-8")
    assert "T0 ; profile default" in result
    assert result.index("T0 ; profile default") < result.index(";LAYER_CHANGE")


def test_initial_tool_is_not_changed_when_already_correct(tmp_path):
    gcode_path = tmp_path / "already-fdm.gcode"
    gcode_path.write_text("T0 ; profile default\n;LAYER_CHANGE\n", encoding="utf-8")

    assert ensure_initial_toolhead(gcode_path, "T0") is False


def test_injection_extrusion_uses_the_supplied_calibration():
    block = build_pore_injection_gcode(
        centroids=[(1.0, 1.0)],
        current_z=0.2,
        flow_ul_per_cell=0.5,
        ul_per_mm=0.5,
        travel_feedrate=6000,
        inject_feedrate=120,
    )

    assert "G1 E1.0000 F120 ; Deposit into open pore from layer surface" in block
    assert "E0.0030" not in "\n".join(block)


def test_surface_deposition_never_moves_the_syringe_down_in_z():
    block = build_pore_injection_gcode(
        centroids=[(1.0, 1.0)],
        current_z=0.2,
        flow_ul_per_cell=0.5,
        ul_per_mm=0.5,
        travel_feedrate=6000,
        inject_feedrate=120,
    )

    assert not any(line.startswith("G1 Z") for line in block)


def test_pore_retraction_uses_the_central_syringe_profile_value():
    block = build_pore_injection_gcode(
        centroids=[(1.0, 1.0)],
        current_z=0.2,
        flow_ul_per_cell=0.5,
        ul_per_mm=0.5,
        travel_feedrate=6000,
        inject_feedrate=120,
        retract_mm=0.2,
    )

    assert "G1 E-0.2000 F1200 ; Retract to prevent stringing" in block
