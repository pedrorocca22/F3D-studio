
import requests
import json
import os

class RemotePrinter:
    def __init__(self, ip_address, port=5000):
        self.base_url = f"http://{ip_address}:{port}"
        self.timeout = 10

    def is_connected(self):
        try:
            resp = requests.get(f"{self.base_url}/status", timeout=2)
            return resp.status_code == 200
        except:
            return False

    def initialize(self):
        try:
            resp = requests.post(f"{self.base_url}/init", timeout=self.timeout)
            return resp.json()
        except Exception as e:
            print(f"Init Error: {e}")
            return None

    def home_z(self):
        requests.post(f"{self.base_url}/motor/home", timeout=self.timeout)

    def move_z(self, distance_mm, speed=300):
        data = {"distance_mm": distance_mm, "speed": speed, "relative": True}
        requests.post(f"{self.base_url}/motor/move_z", json=data, timeout=self.timeout)

    def move_z_absolute(self, position_mm, speed=300):
        data = {"distance_mm": position_mm, "speed": speed, "relative": False}
        requests.post(f"{self.base_url}/motor/move_z", json=data, timeout=self.timeout)
        
    def display_image(self, image_path):
        if not os.path.exists(image_path):
            print(f"Image not found: {image_path}")
            return False
            
        with open(image_path, 'rb') as f:
            files = {'file': f}
            try:
                resp = requests.post(f"{self.base_url}/projector/display", files=files, timeout=10)
                return resp.status_code == 200
            except Exception as e:
                print(f"Display Error: {e}")
                return False

    def display_image_bytes(self, png_data, filename="layer.png"):
        """Send raw PNG bytes directly to the projector (no disk file needed)."""
        from io import BytesIO
        files = {'file': (filename, BytesIO(png_data), 'image/png')}
        try:
            resp = requests.post(f"{self.base_url}/projector/display", files=files, timeout=10)
            return resp.status_code == 200
        except Exception as e:
            print(f"Display Error: {e}")
            return False

    def expose(self, duration):
        data = {"duration": duration}
        try:
            requests.post(f"{self.base_url}/projector/expose", json=data, timeout=duration + 5)
        except Exception as e:
            print(f"Expose Error: {e}")

    def stop_projector(self):
        try:
            requests.post(f"{self.base_url}/projector/off", timeout=2)
        except:
            pass

    def get_projector_info(self):
        """Fetch projector hardware info (max PWM, current PWM, etc.) from RPi."""
        try:
            resp = requests.get(f"{self.base_url}/projector/info", timeout=5)
            return resp.json()
        except Exception as e:
            print(f"Projector Info Error: {e}")
            return {"error": str(e), "initialized": False}

    def set_pwm(self, pwm):
        """Set the projector LED PWM intensity (0-1023)."""
        data = {"pwm": pwm}
        try:
            resp = requests.post(f"{self.base_url}/projector/pwm", json=data, timeout=5)
            # Check if status is ok
            if resp.status_code == 200 and resp.json().get("status") == "ok":
                return True
            return False
        except Exception as e:
            print(f"Set PWM Error: {e}")
            return False
