"""
moonraker_client.py — BioFFF Studio
Direct Moonraker REST + WebSocket client.
Replaces the old rpi_node Flask server + printer_client.py.

Moonraker API docs: https://moonraker.readthedocs.io/en/latest/web_api/
"""

import requests
import json
import time
import threading
import os
from typing import Callable, Optional


class MoonrakerClient:
    """
    Full-featured client for the Moonraker API (Klipper manager).
    Supports REST calls and WebSocket event subscriptions.
    """

    def __init__(self, base_url: str = "http://localhost:7125", timeout: int = 30):
        """
        Args:
            base_url: Moonraker base URL, e.g. "http://192.168.1.50:7125"
            timeout:  Default HTTP request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._ws_thread: Optional[threading.Thread] = None
        self._ws_running = False
        self._event_callbacks: list[Callable] = []

    # =========================================================================
    #  Connection & Status
    # =========================================================================

    def is_connected(self) -> bool:
        """Quick health-check — returns True if Moonraker is reachable."""
        try:
            r = requests.get(f"{self.base_url}/server/info", timeout=5)
            return r.status_code == 200
        except Exception:
            return False

    def get_server_info(self) -> dict:
        """Returns Moonraker server info (version, klippy state, etc.)."""
        return self._get("/server/info")

    def get_printer_status(self) -> dict:
        """
        Returns the full Klipper printer status object.
        Includes extruder temps, bed temp, print_stats, toolhead position, etc.
        """
        objects = "print_stats,toolhead,extruder,heater_bed,fan,display_status"
        return self._get(f"/printer/objects/query?{objects}")

    def get_current_layer(self) -> Optional[int]:
        """Best-effort: extract current layer from print_stats."""
        try:
            data = self._get("/printer/objects/query?print_stats")
            stats = data.get("result", {}).get("status", {}).get("print_stats", {})
            return stats.get("current_layer")
        except Exception:
            return None

    def get_print_progress(self) -> dict:
        """Returns progress (0–1), elapsed time, and estimated remaining time."""
        try:
            data = self._get("/printer/objects/query?display_status,print_stats")
            result = data.get("result", {}).get("status", {})
            display = result.get("display_status", {})
            stats = result.get("print_stats", {})
            return {
                "progress": display.get("progress", 0.0),
                "print_duration": stats.get("print_duration", 0),
                "filename": stats.get("filename", ""),
                "state": stats.get("state", "idle"),
                "current_layer": stats.get("current_layer"),
                "total_layer": stats.get("total_layer"),
            }
        except Exception as e:
            return {"error": str(e)}

    # =========================================================================
    #  File Management
    # =========================================================================

    def upload_gcode(self, filepath: str, remote_filename: Optional[str] = None) -> dict:
        """
        Upload a G-code file to Moonraker.

        Args:
            filepath:        Local path to the .gcode file
            remote_filename: Filename on the printer (defaults to basename)
        Returns:
            Moonraker upload response dict
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"G-code file not found: {filepath}")

        remote_filename = remote_filename or os.path.basename(filepath)
        with open(filepath, "rb") as f:
            files = {"file": (remote_filename, f, "text/plain")}
            r = requests.post(
                f"{self.base_url}/server/files/upload",
                files=files,
                timeout=120,  # big files
            )
        r.raise_for_status()
        return r.json()

    def list_files(self, root: str = "gcodes") -> list:
        """List files in a Moonraker virtual SD folder."""
        data = self._get(f"/server/files/list?root={root}")
        return data.get("result", [])

    def delete_file(self, filename: str) -> dict:
        """Delete a file from Moonraker gcodes root."""
        r = requests.delete(
            f"{self.base_url}/server/files/gcodes/{filename}",
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()

    # =========================================================================
    #  Print Control
    # =========================================================================

    def start_print(self, filename: str) -> dict:
        """Start printing a file that is already on the printer."""
        return self._post("/printer/print/start", {"filename": filename})

    def pause(self) -> dict:
        """Send PAUSE command to Klipper."""
        return self._post("/printer/print/pause", {})

    def resume(self) -> dict:
        """Send RESUME command to Klipper."""
        return self._post("/printer/print/resume", {})

    def cancel(self) -> dict:
        """Send CANCEL_PRINT command to Klipper."""
        return self._post("/printer/print/cancel", {})

    def emergency_stop(self) -> dict:
        """Firmware-level emergency stop (M112). Use with caution."""
        return self._post("/printer/emergency_stop", {})

    def firmware_restart(self) -> dict:
        """Restart Klipper firmware."""
        return self._post("/printer/firmware_restart", {})

    # =========================================================================
    #  G-code / Macro Execution
    # =========================================================================

    def run_gcode(self, gcode: str) -> dict:
        """
        Execute arbitrary G-code via Moonraker.
        E.g.: run_gcode("T0")  or  run_gcode("SET_HEATER_TEMPERATURE HEATER=extruder TARGET=200")
        """
        return self._post("/printer/gcode/script", {"script": gcode})

    def run_macro(self, macro_name: str, **kwargs) -> dict:
        """
        Run a Klipper [gcode_macro] with optional parameters.
        E.g.: run_macro("UV_EXPOSE", DURATION=5.0, DOSE=20.0)
        """
        params = " ".join(f"{k}={v}" for k, v in kwargs.items())
        script = f"{macro_name} {params}".strip()
        return self.run_gcode(script)

    # =========================================================================
    #  Toolhead / Tool change
    # =========================================================================

    def set_toolhead(self, tool_index: int) -> dict:
        """
        Activate a toolhead by T-index (T0 = FDM, T1 = Syringe, T2 = UV, etc.)
        Calls THE Klipper tool-change macro defined in printer.cfg.
        """
        return self.run_gcode(f"T{tool_index}")

    def set_temperature(self, heater: str, target: float) -> dict:
        """
        Set a heater target temperature.
        Args:
            heater: "extruder", "heater_bed", "extruder1", etc.
            target: Target temperature in °C
        """
        return self.run_gcode(f"SET_HEATER_TEMPERATURE HEATER={heater} TARGET={target:.1f}")

    def wait_for_temperature(self, heater: str, target: float, tolerance: float = 2.0) -> bool:
        """
        Block until a heater reaches the target temperature (±tolerance °C).
        Returns True on success, False on timeout (60s).
        """
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                data = self._get(f"/printer/objects/query?{heater}")
                temp = (
                    data.get("result", {})
                    .get("status", {})
                    .get(heater, {})
                    .get("temperature", 0)
                )
                if abs(temp - target) <= tolerance:
                    return True
            except Exception:
                pass
            time.sleep(1)
        return False

    # =========================================================================
    #  Homing & Motion
    # =========================================================================

    def home(self, axes: str = "XYZ") -> dict:
        """Home one, two, or all axes. E.g. home("XY") or home("Z")."""
        return self.run_gcode(f"G28 {axes}")

    def move_relative(self, x: float = 0, y: float = 0, z: float = 0,
                      speed_mm_s: float = 50) -> dict:
        """Move relative position (G91 + G1)."""
        self.run_gcode("G91")
        cmd = f"G1 X{x:.3f} Y{y:.3f} Z{z:.3f} F{speed_mm_s * 60:.0f}"
        result = self.run_gcode(cmd)
        self.run_gcode("G90")
        return result

    def move_absolute(self, x: Optional[float] = None, y: Optional[float] = None,
                      z: Optional[float] = None, speed_mm_s: float = 50) -> dict:
        """Move to absolute position (G90 + G1)."""
        parts = []
        if x is not None:
            parts.append(f"X{x:.3f}")
        if y is not None:
            parts.append(f"Y{y:.3f}")
        if z is not None:
            parts.append(f"Z{z:.3f}")
        if not parts:
            return {}
        self.run_gcode("G90")
        return self.run_gcode(f"G1 {' '.join(parts)} F{speed_mm_s * 60:.0f}")

    # =========================================================================
    #  UV Crosslinker
    # =========================================================================

    def uv_expose(self, duration_sec: float, **kwargs) -> dict:
        """
        Activate the UV crosslinker head for a fixed duration.
        Calls the Klipper macro UV_EXPOSE defined in printer.cfg.
        Additional kwargs are forwarded as macro parameters (e.g. POWER=80).
        """
        return self.run_macro("UV_EXPOSE", DURATION=round(duration_sec, 3), **kwargs)

    def uv_off(self) -> dict:
        """Turn off the UV LED immediately."""
        return self.run_macro("UV_OFF")

    # =========================================================================
    #  Syringe
    # =========================================================================

    def syringe_pressurize(self, steps: int) -> dict:
        """Pre-pressurize the syringe plunger. Calls SYRINGE_PRESSURIZE macro."""
        return self.run_macro("SYRINGE_PRESSURIZE", STEPS=steps)

    def syringe_retract(self, steps: int) -> dict:
        """Anti-drip retraction. Calls SYRINGE_RETRACT macro."""
        return self.run_macro("SYRINGE_RETRACT", STEPS=steps)

    # =========================================================================
    #  WebSocket event subscription (non-blocking)
    # =========================================================================

    def subscribe_events(self, callback: Callable[[dict], None]) -> None:
        """
        Subscribe to Moonraker WebSocket events.
        The callback receives a dict with the event data.

        The WebSocket connection runs in a background daemon thread.
        """
        self._event_callbacks.append(callback)
        if not self._ws_running:
            self._start_ws_thread()

    def _start_ws_thread(self) -> None:
        """Internal: start the WebSocket listener thread."""
        try:
            import websocket  # pip install websocket-client
        except ImportError:
            print("[MoonrakerClient] Install 'websocket-client' for event subscriptions.")
            return

        ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/websocket"

        def on_message(ws, message):
            try:
                data = json.loads(message)
                for cb in self._event_callbacks:
                    cb(data)
            except Exception as e:
                print(f"[MoonrakerClient] WS parse error: {e}")

        def on_error(ws, error):
            print(f"[MoonrakerClient] WS error: {error}")

        def on_close(ws, *args):
            self._ws_running = False

        def run():
            self._ws_running = True
            ws = websocket.WebSocketApp(
                ws_url,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
            )
            ws.run_forever(reconnect=5)

        self._ws_thread = threading.Thread(target=run, daemon=True, name="moonraker-ws")
        self._ws_thread.start()

    def stop_ws(self) -> None:
        """Stop the WebSocket listener thread."""
        self._ws_running = False

    # =========================================================================
    #  Internal helpers
    # =========================================================================

    def _get(self, path: str) -> dict:
        r = requests.get(f"{self.base_url}{path}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, payload: dict) -> dict:
        r = requests.post(
            f"{self.base_url}{path}",
            json=payload,
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()
