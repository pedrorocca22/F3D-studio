"""
Unit tests for utils/gcode_infill_parser.py — the pore-detection algorithm.

This module is 100% stdlib (re, math, pathlib, collections), so tests run with no
external deps beyond pytest. Run from the project root with:

    python -m pytest tests/ -v

The cwd must be E:\\F3D-studio because gcode_infill_parser is imported as
`utils.gcode_infill_parser` (utils/ is a namespace package, no __init__.py).
"""

import math
import os
import sys

import pytest

# Ensure the project root is on sys.path so `from utils...` resolves when pytest
# is invoked from a different cwd.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from utils.gcode_infill_parser import (  # noqa: E402  (import after sys.path tweak)
    parse_infill_lines,
    detect_perfect_squares,
    compute_centroids,
    describe_pore_cells,
)


# ---------------------------------------------------------------------------
# Helpers — build small G-code samples programmatically
# ---------------------------------------------------------------------------

def _write_gcode(path, lines):
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


# ===========================================================================
# A. parse_infill_lines
# ===========================================================================

class TestParseInfillLines:
    def test_empty_file_returns_empty_dict(self, tmp_path, capsys):
        gcode = _write_gcode(tmp_path / "empty.gcode", [])
        result = parse_infill_lines(gcode, layer_height_mm=0.2)
        assert result == {}
        # The debug print should still fire (proves the function completed).
        assert "Parseo completado" in capsys.readouterr().out

    def test_single_layer_infill_segments(self, tmp_path):
        gcode = _write_gcode(tmp_path / "one.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            "G1 X10.000 Y10.000 E0.500",  # first extrusion — needs a prior pen position
            "G1 X20.000 Y10.000 E0.600",  # → segment (10,10)→(20,10)
            "G1 X20.000 Y20.000 E0.700",  # → segment (20,10)→(20,20)
        ])
        result = parse_infill_lines(gcode, layer_height_mm=0.2)
        assert set(result.keys()) == {1}
        assert result[1]["z"] == pytest.approx(0.2)
        # The first G1 has no prior (x,y), so it produces NO segment; the next two do.
        assert result[1]["infill_segments"] == [
            (10.0, 10.0, 20.0, 10.0),
            (20.0, 10.0, 20.0, 20.0),
        ]

    def test_multiple_layers_are_1_indexed(self, tmp_path):
        gcode = _write_gcode(tmp_path / "two.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            "G1 X0 Y0 E0.1",
            "G1 X1 Y0 E0.2",
            ";LAYER_CHANGE",
            ";Z:0.4",
            ";TYPE:Internal infill",
            "G0 X5 Y5",       # explicit travel to reset pen position at the new layer
            "G1 X6 Y5 E0.4",  # → single segment (5,5)→(6,5)
        ])
        result = parse_infill_lines(gcode, layer_height_mm=0.2)
        assert sorted(result.keys()) == [1, 2]
        assert result[1]["z"] == pytest.approx(0.2)
        assert result[2]["z"] == pytest.approx(0.4)
        assert len(result[1]["infill_segments"]) == 1
        assert len(result[2]["infill_segments"]) == 1
        assert result[2]["infill_segments"][0] == (5.0, 5.0, 6.0, 5.0)

    def test_pen_position_persists_across_layer_change(self, tmp_path):
        # Documents current behavior: current_x/current_y are NOT reset on
        # ;LAYER_CHANGE. If a layer starts with an extruding G1 (no preceding G0
        # travel), the segment is built from the last pen position of the prior
        # layer. Real PrusaSlicer output always precedes infill with a G0 travel,
        # so this is rarely hit in practice — but the parser allows it.
        gcode = _write_gcode(tmp_path / "persist.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            "G1 X0 Y0 E0.1",
            "G1 X1 Y0 E0.2",   # pen ends at (1,0)
            ";LAYER_CHANGE",
            ";Z:0.4",
            ";TYPE:Internal infill",
            "G1 X5 Y5 E0.3",   # no G0 before → segment from (1,0) → (5,5)
        ])
        result = parse_infill_lines(gcode, layer_height_mm=0.2)
        assert result[2]["infill_segments"][0] == (1.0, 0.0, 5.0, 5.0)

    def test_G0_travel_does_not_extrude_but_updates_position(self, tmp_path):
        # A G0 travel move must NOT create a segment, but the next G1 must start from it.
        gcode = _write_gcode(tmp_path / "travel.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            "G1 X1 Y1 E0.1",      # establishes pen position at (1,1)
            "G0 X50 Y50",         # travel — no extrusion, moves pen
            "G1 X51 Y50 E0.2",    # segment must be (50,50)→(51,50), NOT (1,1)→(51,50)
        ])
        result = parse_infill_lines(gcode, layer_height_mm=0.2)
        segs = result[1]["infill_segments"]
        assert segs == [(50.0, 50.0, 51.0, 50.0)]

    def test_G1_with_zero_E_does_not_extrude(self, tmp_path):
        gcode = _write_gcode(tmp_path / "noextrude.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            "G1 X0 Y0 E0.1",
            "G1 X10 Y0 E0",     # E=0 → no extrusion → no segment
            "G1 X20 Y0 E0.5",   # segment from last pen pos (10,0)
        ])
        result = parse_infill_lines(gcode, layer_height_mm=0.2)
        # Only the last move extrudes, starting from the E=0 move's position.
        assert result[1]["infill_segments"] == [(10.0, 0.0, 20.0, 0.0)]

    def test_TYPE_change_stops_infill_capture(self, tmp_path):
        # Lines after ;TYPE:Outer Wall must not be captured as infill.
        # Note: the non-infill G1 still updates the pen position, so the next
        # infill segment starts from where that G1 left the pen.
        gcode = _write_gcode(tmp_path / "types.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            "G1 X0 Y0 E0.1",
            "G1 X1 Y0 E0.2",      # captured: (0,0)→(1,0)
            ";TYPE:Outer Wall",
            "G1 X2 Y0 E0.3",      # NOT captured (different TYPE), but pen → (2,0)
            ";TYPE:Internal infill",
            "G1 X3 Y0 E0.4",      # captured: (2,0)→(3,0)
        ])
        result = parse_infill_lines(gcode, layer_height_mm=0.2)
        segs = result[1]["infill_segments"]
        assert len(segs) == 2
        assert segs[0] == (0.0, 0.0, 1.0, 0.0)
        assert segs[1] == (2.0, 0.0, 3.0, 0.0)

    def test_max_z_stops_parsing_early(self, tmp_path):
        # max_z=0.5 → parsing breaks when current_z > 0.5 + 1.0 = 1.5.
        gcode = _write_gcode(tmp_path / "cutoff.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            "G1 X0 Y0 E0.1",
            "G1 X1 Y0 E0.2",
            ";LAYER_CHANGE",
            ";Z:1.6",   # > 1.5 → breaks here, before this layer is populated with segments
            ";TYPE:Internal infill",
            "G1 X2 Y0 E0.3",
        ])
        result = parse_infill_lines(gcode, layer_height_mm=0.2, max_z=0.5)
        # Layer 1 is fully parsed; the layer 2 segment is never reached.
        assert 1 in result
        assert result[1]["infill_segments"] == [(0.0, 0.0, 1.0, 0.0)]


# ===========================================================================
# B. detect_perfect_squares
# ===========================================================================

def _h_line(x0, x1, y):
    """Horizontal segment (angle 0°)."""
    return (x0, y, x1, y)


def _v_line(x, y0, y1):
    """Vertical segment (angle 90°)."""
    return (x, y0, x, y1)


class TestDetectPerfectSquares:
    def test_empty_segments_returns_empty(self):
        assert detect_perfect_squares([]) == []

    def test_degenerate_segments_ignored(self):
        # Zero-length segments are filtered (dist < 0.1).
        assert detect_perfect_squares([(0, 0, 0, 0)]) == []

    def test_single_family_of_parallel_lines_returns_empty(self):
        # All horizontal → only 1 angular group → cannot form squares.
        segs = [_h_line(0, 10, 0), _h_line(0, 10, 1), _h_line(0, 10, 2)]
        assert detect_perfect_squares(segs) == []

    def test_non_orthogonal_families_return_empty(self):
        # 0° and 45° are not perpendicular (diff=45, not in [85,95]).
        diag = lambda x0, y0, x1, y1: (x0, y0, x1, y1)
        segs = [
            _h_line(0, 10, 0),
            diag(0, 0, 7.07, 7.07),  # 45°
        ]
        assert detect_perfect_squares(segs) == []

    def test_perfect_axis_aligned_grid_detects_cell(self):
        # 3 vertical + 3 horizontal lines forming a 2×2 lattice of 1mm cells,
        # but cells < min_size? no: 1.0 >= 0.5 default. Expect 4 candidate cells
        # in a 2x2 grid, but only those with all 4 vertices present are emitted.
        # Vertices are at the line crossings.
        segs = [
            _v_line(0, 0, 2), _v_line(1, 0, 2), _v_line(2, 0, 2),
            _h_line(0, 2, 0), _h_line(0, 2, 1), _h_line(0, 2, 2),
        ]
        squares = detect_perfect_squares(segs, tolerance_mm=0.1, min_size_mm=0.5)
        # 2×2 lattice → 4 cells, each 1.0×1.0.
        assert len(squares) == 4
        for (xmin, ymin, xmax, ymax) in squares:
            assert abs((xmax - xmin) - 1.0) < 0.05
            assert abs((ymax - ymin) - 1.0) < 0.05

    def test_min_size_filter_removes_small_cells(self):
        # 0.4mm cells with min_size_mm=0.5 → nothing emitted.
        segs = [
            _v_line(0, 0, 0.8), _v_line(0.4, 0, 0.8),
            _h_line(0, 0.8, 0), _h_line(0, 0.8, 0.4), _h_line(0, 0.8, 0.8),
        ]
        squares = detect_perfect_squares(segs, tolerance_mm=0.1, min_size_mm=0.5)
        assert squares == []

    def test_rotated_45_degree_grid_still_detected(self):
        # PrusaSlicer's default fill_angle for Grid is 45°/135°. Two families at
        # 45° and 135° are orthogonal (diff=90°) → must detect cells even though
        # they are not axis-aligned. The output is reconstructed in original coords.
        s = math.sqrt(2) / 2  # 0.7071 — diagonal unit step
        # Build a small 45° grid: two diagonals one way, two the other.
        segs = [
            (0, 0, 4 * s, 4 * s),   # 45°
            (2 * s, -2 * s, 6 * s, 2 * s),  # 45°, offset
            (0, 4 * s, 4 * s, 0),   # -45° (i.e. 135°)
            (2 * s, 6 * s, 6 * s, 2 * s),   # 135°, offset
        ]
        squares = detect_perfect_squares(segs, tolerance_mm=0.1, min_size_mm=0.5)
        # Should detect at least one cell. Size ~ 2.0mm (the lattice spacing).
        assert len(squares) >= 1


# ===========================================================================
# C. compute_centroids
# ===========================================================================

class TestComputeCentroids:
    def test_empty(self):
        assert compute_centroids([]) == []

    def test_single_square_center(self):
        sq = [(0.0, 0.0, 2.0, 4.0)]
        assert compute_centroids(sq) == [(1.0, 2.0)]

    def test_multiple_squares(self):
        sqs = [(0.0, 0.0, 2.0, 2.0), (10.0, 10.0, 12.0, 12.0)]
        assert compute_centroids(sqs) == [(1.0, 1.0), (11.0, 11.0)]


# ===========================================================================
# D. Integration — the real contract used by server.py
# ===========================================================================

class TestDescribePoreCells:
    def test_calculates_free_cell_volume_for_one_layer(self):
        cells = describe_pore_cells(
            [(0.0, 0.0, 1.0, 1.0)],
            extrusion_width_mm=0.4,
            layer_height_mm=0.2,
        )

        assert cells[0]["center_width_mm"] == pytest.approx(1.0)
        assert cells[0]["center_depth_mm"] == pytest.approx(1.0)
        assert cells[0]["free_width_mm"] == pytest.approx(0.6)
        assert cells[0]["free_depth_mm"] == pytest.approx(0.6)
        assert cells[0]["layer_height_mm"] == pytest.approx(0.2)
        assert cells[0]["max_volume_ul"] == pytest.approx(0.072)

    def test_never_reports_negative_capacity(self):
        cells = describe_pore_cells(
            [(0.0, 0.0, 0.3, 0.3)],
            extrusion_width_mm=0.4,
            layer_height_mm=0.2,
        )

        assert cells[0]["free_width_mm"] == 0.0
        assert cells[0]["free_depth_mm"] == 0.0
        assert cells[0]["max_volume_ul"] == 0.0


class TestPipelineIntegration:
    def test_parse_detect_centroids_chains_correctly(self, tmp_path):
        """Reproduces how server.py:1183/1221/1225 calls the three functions:
        parse_infill_lines → detect_perfect_squares → compute_centroids.
        The centroids must be (cx, cy) float tuples lying inside the print bed.
        """
        gcode = _write_gcode(tmp_path / "grid.gcode", [
            ";LAYER_CHANGE",
            ";Z:0.2",
            ";TYPE:Internal infill",
            # Establish pen at (0,0) then walk a 2x2 grid of infill lines.
            "G1 X0 Y0 E0.1",
            # Horizontal passes at y=0, y=1, y=2
            "G0 X0 Y0",
            "G1 X2 Y0 E0.2",
            "G0 X0 Y1",
            "G1 X2 Y1 E0.3",
            "G0 X0 Y2",
            "G1 X2 Y2 E0.4",
            # Vertical passes at x=0, x=1, x=2 (start each from a known point)
            "G0 X0 Y0",
            "G1 X0 Y2 E0.5",
            "G0 X1 Y0",
            "G1 X1 Y2 E0.6",
            "G0 X2 Y0",
            "G1 X2 Y2 E0.7",
        ])
        parsed = parse_infill_lines(gcode, layer_height_mm=0.2)
        assert 1 in parsed
        segments = parsed[1]["infill_segments"]
        squares = detect_perfect_squares(segments, tolerance_mm=0.1, min_size_mm=0.5)
        centroids = compute_centroids(squares)

        # A 2x2 grid (x∈[0,2], y∈[0,2], 1mm cells) yields up to 4 cells.
        assert len(squares) >= 1
        assert len(centroids) == len(squares)
        for (cx, cy) in centroids:
            assert isinstance(cx, float) and isinstance(cy, float)
            # Centroids must lie within the lattice span.
            assert -0.1 <= cx <= 2.1
            assert -0.1 <= cy <= 2.1
