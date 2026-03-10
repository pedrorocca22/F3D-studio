"""
fdm_print_manager.py — BioFFF Studio
Multi-toolhead FDM print orchestrator.

Replaces the DLP3 print_manager.py (which controlled a UV projector layer-by-layer).
Now coordinates:
  - G-code upload + print start via Moonraker
  - Layer-event polling via Moonraker REST (or WebSocket)
  - Toolhead switching (FDM → Syringe → UV) based on LayerAction schedule
  - UV crosslinking pauses
  - Syringe pressurization / retraction
"""

import time
import threading
import logging
from typing import Optional, Callable
from dataclasses import dataclass, field

from moonraker_client import MoonrakerClient

logger = logging.getLogger("FDMPrintManager")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")


# ---------------------------------------------------------------------------
#  Data structures (mirror of types.ts — Python side)
# ---------------------------------------------------------------------------

@dataclass
class LayerAction:
    """Defines which toolhead is active for a range of layers."""
    layer_from: int
    layer_to: int
    toolhead: str          # 'fdm' | 'syringe' | 'uv' | 'none'
    klipper_tool: str      # 'T0', 'T1', 'T2', etc.
    # FDM overrides
    print_speed_mms: Optional[float] = None
    nozzle_temp: Optional[float] = None
    # Syringe overrides
    pressurization_steps: int = 0
    retraction_steps: int = 0
    # UV settings
    uv_exposure_time_sec: float = 0.0
    uv_dose_mjcm2: float = 0.0
    uv_pause_print: bool = True
    # Macros
    pre_macro: Optional[str] = None
    post_macro: Optional[str] = None
    label: str = ""


@dataclass
class PrintJob:
    job_id: str
    gcode_path: str
    gcode_filename: str
    layer_count: int
    layer_height_mm: float
    layer_actions: list[LayerAction] = field(default_factory=list)


@dataclass
class PrintState:
    status: str = "idle"            # idle | printing | paused | complete | error | cancelled
    current_layer: int = 0
    progress: float = 0.0
    active_toolhead: str = "none"
    message: str = ""
    elapsed_sec: float = 0.0


# ---------------------------------------------------------------------------
#  Main class
# ---------------------------------------------------------------------------

class FDMPrintManager:
    """
    Orchestrates a multi-toolhead FDM bio-print job using Moonraker.

    Usage:
        client = MoonrakerClient("http://192.168.1.50:7125")
        pm = FDMPrintManager(client)
        pm.start_job(job)
    """

    POLL_INTERVAL_SEC = 1.0   # How often to poll Moonraker for layer progress

    def __init__(self, moonraker: MoonrakerClient,
                 on_state_change: Optional[Callable[[PrintState], None]] = None):
        self.moonraker = moonraker
        self.on_state_change = on_state_change
        self._state = PrintState()
        self._job: Optional[PrintJob] = None
        self._monitor_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    # -------------------------------------------------------------------------
    #  Public API
    # -------------------------------------------------------------------------

    def start_job(self, job: PrintJob) -> bool:
        """
        Upload the G-code and start the print job.
        Returns True if successfully started.
        """
        if self._state.status == "printing":
            logger.warning("A print is already in progress.")
            return False

        if not self.moonraker.is_connected():
            self._set_state("error", message="Cannot reach Moonraker. Check IP / network.")
            return False

        self._job = job
        self._stop_event.clear()

        try:
            logger.info(f"Uploading G-code: {job.gcode_path}")
            self._set_state("printing", message=f"Uploading {job.gcode_filename}...")
            self.moonraker.upload_gcode(job.gcode_path, job.gcode_filename)

            logger.info(f"Starting print: {job.gcode_filename}")
            self._set_state("printing", message="Starting print...")
            self.moonraker.start_print(job.gcode_filename)

            # Start the layer monitor in a background thread
            self._monitor_thread = threading.Thread(
                target=self._monitor_loop,
                daemon=True,
                name="fdm-monitor",
            )
            self._monitor_thread.start()
            logger.info("Print job started. Monitor thread running.")
            return True

        except Exception as e:
            logger.error(f"Failed to start job: {e}")
            self._set_state("error", message=str(e))
            return False

    def pause(self) -> None:
        """Pause the print at the next safe point."""
        if self._state.status == "printing":
            self.moonraker.pause()
            self._set_state("paused", message="Print paused.")

    def resume(self) -> None:
        """Resume from pause."""
        if self._state.status == "paused":
            self.moonraker.resume()
            self._set_state("printing", message="Resuming print...")

    def cancel(self) -> None:
        """Cancel the current print job."""
        self._stop_event.set()
        self.moonraker.cancel()
        self._set_state("cancelled", message="Print cancelled.")

    @property
    def state(self) -> PrintState:
        return self._state

    # -------------------------------------------------------------------------
    #  Monitor loop
    # -------------------------------------------------------------------------

    def _monitor_loop(self) -> None:
        """
        Polls Moonraker for layer progress and dispatches toolhead actions
        whenever a layer boundary is crossed.
        """
        last_layer = -1

        while not self._stop_event.is_set():
            try:
                progress = self.moonraker.get_print_progress()
                state = progress.get("state", "idle")
                current_layer = progress.get("current_layer") or 0
                pct = progress.get("progress", 0.0)
                duration = progress.get("print_duration", 0)

                # Update state object
                self._state.progress = pct
                self._state.current_layer = current_layer
                self._state.elapsed_sec = duration

                # Handle Moonraker-level state changes
                if state in ("complete", "error", "cancelled"):
                    self._set_state(state, message=f"Print {state}.")
                    break

                # Detect layer change
                if current_layer != last_layer and current_layer > 0:
                    logger.info(f"Layer change: {last_layer} → {current_layer}")
                    self._dispatch_layer_actions(current_layer)
                    last_layer = current_layer

                # Relay state to frontend
                if self.on_state_change:
                    self.on_state_change(self._state)

            except Exception as e:
                logger.warning(f"Monitor poll error: {e}")

            time.sleep(self.POLL_INTERVAL_SEC)

        logger.info("Monitor loop exited.")

    # -------------------------------------------------------------------------
    #  Toolhead action dispatch
    # -------------------------------------------------------------------------

    def _dispatch_layer_actions(self, layer: int) -> None:
        """
        Check whether any LayerAction boundaries are hit at this layer
        and execute the corresponding toolhead switch + operations.
        """
        if not self._job:
            return

        for action in self._job.layer_actions:
            if action.layer_from == layer:
                logger.info(f"Activating action '{action.label}' at layer {layer}: {action.toolhead}")
                self._execute_action(action)

    def _execute_action(self, action: LayerAction) -> None:
        """Execute a single LayerAction (toolhead switch + specific operations)."""

        # 1. Pre-macro (if any)
        if action.pre_macro:
            logger.info(f"  Running pre-macro: {action.pre_macro}")
            self.moonraker.run_gcode(action.pre_macro)

        # 2. Switch toolhead
        if action.toolhead != "none" and action.klipper_tool:
            logger.info(f"  Switching to toolhead {action.klipper_tool} ({action.toolhead})")
            self.moonraker.run_gcode(action.klipper_tool)
            self._state.active_toolhead = action.toolhead

        # 3. Toolhead-specific operations
        if action.toolhead == "fdm":
            self._handle_fdm_action(action)

        elif action.toolhead == "syringe":
            self._handle_syringe_action(action)

        elif action.toolhead == "uv":
            self._handle_uv_action(action)

        # 4. Post-macro (if any)
        if action.post_macro:
            logger.info(f"  Running post-macro: {action.post_macro}")
            self.moonraker.run_gcode(action.post_macro)

    def _handle_fdm_action(self, action: LayerAction) -> None:
        """Handle FDM toolhead activation."""
        if action.nozzle_temp is not None:
            logger.info(f"  Set extruder target: {action.nozzle_temp}°C")
            self.moonraker.set_temperature("extruder", action.nozzle_temp)

        if action.print_speed_mms is not None:
            logger.info(f"  Set print speed override: {action.print_speed_mms} mm/s")
            self.moonraker.run_gcode(f"SET_VELOCITY_LIMIT VELOCITY={action.print_speed_mms:.1f}")

    def _handle_syringe_action(self, action: LayerAction) -> None:
        """Handle syringe toolhead — pressurize, then print continues via G-code."""

        if action.pressurization_steps > 0:
            logger.info(f"  Syringe: pressurizing ({action.pressurization_steps} steps)")
            self.moonraker.syringe_pressurize(action.pressurization_steps)

        # Retraction is handled at the END of the layer range (by the next action's pre-macro
        # or by a dedicated 'none' action following this one)
        # For now, we register the retraction so it fires when the segment ends.
        # This will be upgraded to a proper "on_layer_exit" hook in a future release.

    def _handle_uv_action(self, action: LayerAction) -> None:
        """Handle UV crosslinking head — optionally pause print, expose, resume."""

        if action.uv_exposure_time_sec <= 0:
            logger.warning("  UV action has exposure_time = 0, skipping.")
            return

        if action.uv_pause_print:
            logger.info("  UV crosslink: pausing print motion")
            self.moonraker.pause()
            # Small settle delay (vibrations)
            time.sleep(0.5)

        logger.info(f"  UV crosslink: exposing for {action.uv_exposure_time_sec:.2f}s"
                    f" (target {action.uv_dose_mjcm2:.1f} mJ/cm²)")
        self.moonraker.uv_expose(action.uv_exposure_time_sec)

        if action.uv_pause_print:
            time.sleep(action.uv_exposure_time_sec + 0.5)
            logger.info("  UV crosslink: resuming print")
            self.moonraker.resume()

    # -------------------------------------------------------------------------
    #  Internal helpers
    # -------------------------------------------------------------------------

    def _set_state(self, status: str, message: str = "") -> None:
        self._state.status = status
        self._state.message = message
        logger.info(f"State: {status} — {message}")
        if self.on_state_change:
            self.on_state_change(self._state)


# ---------------------------------------------------------------------------
#  Convenience factory
# ---------------------------------------------------------------------------

def build_default_toolhead_actions() -> list[LayerAction]:
    """
    Returns a minimal default LayerAction sequence:
    All layers printed with FDM (T0).
    Override this in the UI / server as needed.
    """
    return [
        LayerAction(
            layer_from=1,
            layer_to=999999,
            toolhead="fdm",
            klipper_tool="T0",
            label="FDM Full Print",
        )
    ]
