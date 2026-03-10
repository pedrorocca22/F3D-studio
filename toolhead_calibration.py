"""
toolhead_calibration.py — BioFFF Studio
Calibration utilities for syringe flow rate and UV dose curves.

Provides measurement helpers and JSON persistence for both calibration types.
"""

import json
import os
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent
CALIBRATION_DIR = BASE_DIR / "calibrations"
CALIBRATION_DIR.mkdir(exist_ok=True)

SYRINGE_CAL_FILE = CALIBRATION_DIR / "syringe_flow_calibration.json"
UV_CAL_FILE = CALIBRATION_DIR / "uv_dose_calibration.json"


# ---------------------------------------------------------------------------
#  Flow Rate Calibration  (for syringe / hydrogel extruder)
# ---------------------------------------------------------------------------

@dataclass
class FlowPoint:
    steps: int
    measured_volume_ul: float
    error_percent: float = 0.0


@dataclass
class FlowCalibrationProfile:
    toolhead_id: str            # 'syringe'
    syringe_volume_ml: float    # e.g. 5.0
    nozzle_diameter_mm: float   # e.g. 0.6
    points: list[FlowPoint] = field(default_factory=list)
    calibrated_at: str = ""
    notes: str = ""

    def add_point(self, steps: int, measured_ul: float) -> None:
        """Add a measured calibration point and compute deviation."""
        if not self.points:
            error = 0.0
        else:
            # Compare to interpolated expected value from existing points
            expected = self.interpolate(steps)
            error = abs(measured_ul - expected) / max(expected, 1e-6) * 100 if expected else 0.0
        self.points.append(FlowPoint(steps=steps, measured_volume_ul=measured_ul, error_percent=error))
        self.calibrated_at = datetime.utcnow().isoformat()

    def interpolate(self, steps: int) -> float:
        """
        Linear interpolation: given a step count, estimate deposited µl.
        Returns 0 if fewer than 2 calibration points exist.
        """
        if len(self.points) < 2:
            return 0.0
        sorted_pts = sorted(self.points, key=lambda p: p.steps)
        # Find surrounding bracket
        for i in range(len(sorted_pts) - 1):
            a, b = sorted_pts[i], sorted_pts[i + 1]
            if a.steps <= steps <= b.steps:
                t = (steps - a.steps) / max(b.steps - a.steps, 1)
                return a.measured_volume_ul + t * (b.measured_volume_ul - a.measured_volume_ul)
        # Extrapolate linearly from last two points
        a, b = sorted_pts[-2], sorted_pts[-1]
        slope = (b.measured_volume_ul - a.measured_volume_ul) / max(b.steps - a.steps, 1)
        return b.measured_volume_ul + slope * (steps - b.steps)

    def ul_per_mm(self, screw_pitch_mm: float = 1.0) -> float:
        """
        Derive µl/mm flow rate from calibration.
        screw_pitch_mm: mm of plunger travel per rotation (from extruder config).
        Returns µl per mm of E travel.
        """
        if len(self.points) < 2:
            return 0.0
        # Use a linear fit through all points
        total_ul = self.points[-1].measured_volume_ul - self.points[0].measured_volume_ul
        total_steps = self.points[-1].steps - self.points[0].steps
        if total_steps == 0:
            return 0.0
        # Assuming rotation_distance drives steps, 1 step ≈ 1 rotation unit
        # This is hardware-dependent — returns µl per step unit
        ul_per_step = total_ul / total_steps
        return ul_per_step


def load_flow_calibration() -> Optional[FlowCalibrationProfile]:
    if SYRINGE_CAL_FILE.exists():
        try:
            data = json.loads(SYRINGE_CAL_FILE.read_text(encoding="utf-8"))
            profile = FlowCalibrationProfile(
                toolhead_id=data["toolhead_id"],
                syringe_volume_ml=data["syringe_volume_ml"],
                nozzle_diameter_mm=data.get("nozzle_diameter_mm", 0.6),
                calibrated_at=data.get("calibrated_at", ""),
                notes=data.get("notes", ""),
                points=[FlowPoint(**p) for p in data.get("points", [])]
            )
            return profile
        except Exception as e:
            print(f"[FlowCal] Load error: {e}")
    return None


def save_flow_calibration(profile: FlowCalibrationProfile) -> None:
    SYRINGE_CAL_FILE.write_text(json.dumps(asdict(profile), indent=2), encoding="utf-8")
    print(f"[FlowCal] Saved {len(profile.points)} points to {SYRINGE_CAL_FILE}")


# ---------------------------------------------------------------------------
#  UV Dose Calibration  (for UV crosslinking head)
# ---------------------------------------------------------------------------

@dataclass
class UVPoint:
    exposure_time_sec: float
    measured_dose_mj_cm2: float
    power_percent: float = 100.0  # LED power level during measurement


@dataclass
class UVCalibrationProfile:
    wavelength_nm: int              # 365 or 405
    max_power_mw_cm2: float         # Measured max irradiance
    points: list[UVPoint] = field(default_factory=list)
    calibrated_at: str = ""
    notes: str = ""

    def add_point(self, time_sec: float, dose_mj_cm2: float, power_pct: float = 100.0) -> None:
        self.points.append(UVPoint(
            exposure_time_sec=time_sec,
            measured_dose_mj_cm2=dose_mj_cm2,
            power_percent=power_pct
        ))
        self.calibrated_at = datetime.utcnow().isoformat()

    def time_for_dose(self, target_dose_mj_cm2: float, power_pct: float = 100.0) -> float:
        """
        Given a target dose (mJ/cm²), return the required exposure time in seconds.
        Uses linear interpolation between measured points or falls back to
        the physics calculation: dose = irradiance × time.
        """
        if not self.points:
            # Fallback: compute from max_power
            irr = self.max_power_mw_cm2 * (power_pct / 100.0)
            return target_dose_mj_cm2 / irr if irr > 0 else 0.0

        # Filter to matching power level (within ±5%)
        matching = [p for p in self.points if abs(p.power_percent - power_pct) < 5]
        if len(matching) < 2:
            matching = self.points  # Use all points as fallback

        sorted_pts = sorted(matching, key=lambda p: p.exposure_time_sec)

        # Linear interpolation
        for i in range(len(sorted_pts) - 1):
            a, b = sorted_pts[i], sorted_pts[i + 1]
            if a.measured_dose_mj_cm2 <= target_dose_mj_cm2 <= b.measured_dose_mj_cm2:
                t_ratio = (target_dose_mj_cm2 - a.measured_dose_mj_cm2) / max(
                    b.measured_dose_mj_cm2 - a.measured_dose_mj_cm2, 1e-6
                )
                return a.exposure_time_sec + t_ratio * (b.exposure_time_sec - a.exposure_time_sec)

        # Extrapolate: use average dose rate (mJ/cm² per second)
        last = sorted_pts[-1]
        dose_rate = last.measured_dose_mj_cm2 / max(last.exposure_time_sec, 1e-6)
        return target_dose_mj_cm2 / dose_rate if dose_rate > 0 else 0.0


def load_uv_calibration() -> Optional[UVCalibrationProfile]:
    if UV_CAL_FILE.exists():
        try:
            data = json.loads(UV_CAL_FILE.read_text(encoding="utf-8"))
            profile = UVCalibrationProfile(
                wavelength_nm=data["wavelength_nm"],
                max_power_mw_cm2=data.get("max_power_mw_cm2", 0.0),
                calibrated_at=data.get("calibrated_at", ""),
                notes=data.get("notes", ""),
                points=[UVPoint(**p) for p in data.get("points", [])]
            )
            return profile
        except Exception as e:
            print(f"[UVCal] Load error: {e}")
    return None


def save_uv_calibration(profile: UVCalibrationProfile) -> None:
    UV_CAL_FILE.write_text(json.dumps(asdict(profile), indent=2), encoding="utf-8")
    print(f"[UVCal] Saved {len(profile.points)} points to {UV_CAL_FILE}")
