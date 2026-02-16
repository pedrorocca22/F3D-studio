
import serial
import time
import logging

class MotorDriver:
    def __init__(self, port='/dev/ttyUSB0', baudrate=115200, timeout=1):
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.ser = None
        self.logger = logging.getLogger("MotorDriver")
        
    def connect(self):
        try:
            self.ser = serial.Serial(self.port, self.baudrate, timeout=self.timeout)
            time.sleep(2) # Wait for connection to settle (DTR reset)
            self.ser.flushInput()
            self.logger.info(f"Connected to 3D Printer Board on {self.port}")
            self._send_gcode("M114") # Get position to clear buffers
            return True
        except Exception as e:
            self.logger.error(f"Failed to connect to motor board: {e}")
            return False

    def disconnect(self):
        if self.ser and self.ser.is_open:
            self.ser.close()
            self.logger.info("Disconnected from motor board")

    def _send_gcode(self, gcode):
        if not self.ser or not self.ser.is_open:
            self.logger.error("Not connected to motor board")
            return None
        
        cmd = f"{gcode}\n".encode('utf-8')
        self.ser.write(cmd)
        
        response = []
        while True:
            line = self.ser.readline().decode('utf-8').strip()
            if line == 'ok':
                break
            if line:
                response.append(line)
            # Timeout break logic if board hangs? rely on serial timeout for now
        
        return response

    def home_z(self):
        self.logger.info("Homing Z axis...")
        self._send_gcode("G28 Z")

    def move_z_relative(self, distance_mm, speed_mm_min=300):
        """Move Z axis relative to current position. Positive = Up, Negative = Down"""
        self._send_gcode("G91") # Relative positioning
        self._send_gcode(f"G1 Z{distance_mm} F{speed_mm_min}")
        self._send_gcode("G90") # Absolute positioning
        
    def move_z_absolute(self, position_mm, speed_mm_min=300):
        """Move Z axis to absolute position"""
        self._send_gcode("G90") # Absolute positioning
        self._send_gcode(f"G1 Z{position_mm} F{speed_mm_min}")

    def get_z_position(self):
        # Request current position
        # Response format usually: X:0.00 Y:0.00 Z:0.00 E:0.00 Count X:0 Y:0 Z:0
        response = self._send_gcode("M114")
        if response:
            for line in response:
                if "Z:" in line:
                    try:
                        # Simple parsing, might need adjustment based on specific firmware response
                        parts = line.split()
                        for part in parts:
                            if part.startswith("Z:"):
                                return float(part.split(":")[1])
                    except ValueError:
                        pass
        return None
