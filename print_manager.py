import threading
import time
import json
import logging
import io
from PIL import Image
from pathlib import Path
from printer_client import RemotePrinter

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("PrintManager")

class PrintState:
    IDLE = "IDLE"
    PRINTING = "PRINTING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"

class CalibrationManager:
    def __init__(self, calibration_file="calibration_gray.json"):
        self.calibration_file = Path(calibration_file)
        self.data = []
        self.max_pwm = 700
        self.max_gray = 255
        self.base_offset = 0.0
        self.mode = "grayscale" # default
        self.load()

    def load(self):
        if self.calibration_file.exists():
            try:
                with open(self.calibration_file, 'r') as f:
                    cal = json.load(f)
                    self.data = cal.get("data", [])
                    self.max_pwm = cal.get("fixed_pwm", 700) # Default to 700 for grayscale
                    self.max_gray = cal.get("max_gray", 255)
                    self.mode = cal.get("type", "grayscale")
                    self.base_offset = cal.get("base_irradiance_offset", 0.0)
                    
                    # Sort by irradiance for interpolation
                    self.data.sort(key=lambda x: x["irradiance"])
                    
                logging.info(f"Loaded calibration data: {len(self.data)} points. Mode: {self.mode}")
            except Exception as e:
                logging.error(f"Failed to load calibration: {e}")
        else:
            logging.warning("No calibration file found. Using default logic.")

    def get_gray_for_irradiance(self, net_target_mw_cm2):
        """Finds the closest Gray Value (0-255) for a NET target irradiance."""
        if not self.data:
            return 255 # Default to max if no cal
            
        # For grayscale, we typically assume offset is handled or negligible, 
        # but we can apply it if present in JSON.
        raw_target = net_target_mw_cm2 
        
        # 1. Check bounds
        if raw_target <= self.data[0]["irradiance"]:
            return self.data[0]["gray"]
        if raw_target >= self.data[-1]["irradiance"]:
            return self.data[-1]["gray"]
            
        # 2. Linear Interpolation
        for i in range(len(self.data) - 1):
            p1 = self.data[i]
            p2 = self.data[i+1]
            if p1["irradiance"] <= raw_target <= p2["irradiance"]:
                if p2["irradiance"] == p1["irradiance"]: return p1["gray"]
                
                ratio = (raw_target - p1["irradiance"]) / (p2["irradiance"] - p1["irradiance"])
                gray = p1["gray"] + ratio * (p2["gray"] - p1["gray"])
                return int(gray)
        
        return self.max_gray

    def get_pwm_for_irradiance(self, net_target_mw_cm2):
        """Legacy PWM lookup."""
        # If mode is grayscale, return fixed PWM
        if self.mode == "grayscale":
            return self.max_pwm

        if not self.data: return 700
            
        raw_target = net_target_mw_cm2 + self.base_offset
        # Simple fallback for PWM based data structure if we were using old files...
        # But we assume new structure. If structure differs, we'd need checks.
        # For now, simplistic implementation assuming we don't mix modes often.
        return 700 

    def get_time_for_dose(self, target_dose_mj_cm2, irradiance_mw_cm2):
        """Calculates exposure time (s) = Dose (mJ/cm2) / Irradiance (mW/cm2)."""
        if irradiance_mw_cm2 <= 0: return 0
        return target_dose_mj_cm2 / irradiance_mw_cm2

class PrintManager:
    def __init__(self, config_path):
        self.config_path = Path(config_path)
        self.printer = None
        self.state = PrintState.IDLE
        self.current_job_id = None
        self.current_layer_index = 0
        self.total_layers = 0
        self.job_data = None
        self.stop_flag = False
        self.pause_flag = False
        self.calibration = CalibrationManager() 
        
        # Load config
        self.load_config()

    def load_config(self):
        # Reload calibration too
        self.calibration.load()
        
        # Read IP from config.ini (Simple parsing)
        rpi_ip = "127.0.0.1" # Default
        if self.config_path.exists():
            with open(self.config_path, 'r') as f:
                for line in f:
                    if "rpi_ip" in line and "=" in line:
                        rpi_ip = line.split("=")[1].strip()
        
        # In a real scenario, use configparser. 
        # For now, we assume user updates config.ini manually or we inject it.
        self.printer = RemotePrinter(rpi_ip)
        logger.info(f"Initialized Printer Client with IP: {rpi_ip}")

    def start_print(self, job_id, jobs_dir):
        if self.state == PrintState.PRINTING:
            return False, "Already printing"
            
        self.current_job_id = job_id
        job_dir = Path(jobs_dir) / job_id
        job_json_path = job_dir / "job.json"
        
        if not job_json_path.exists():
            return False, "Job not found"
            
        try:
            with open(job_json_path, 'r') as f:
                self.job_data = json.load(f)
        except Exception as e:
            return False, f"Failed to load job data: {e}"
        
        # Validate job data
        if not self.job_data.get("constructs"):
             return False, "Invalid job data"
             
        # Flatten layers from constructs
        # Assuming single merged construct for simplicity as per server.py logic
        self.layers = self.job_data["constructs"][0]["layers"]
        self.total_layers = len(self.layers)
        self.current_layer_index = 0
        self.job_dir = job_dir
        self.stop_flag = False
        self.pause_flag = False
        
        return self._start_thread()

    def _start_thread(self):
        # Start Thread
        self.thread = threading.Thread(target=self._print_loop)
        self.thread.daemon = True
        self.thread.start()
        return True, "Started"

    def pause_print(self):
        if self.state == PrintState.PRINTING:
            self.pause_flag = True
            self.state = PrintState.PAUSED
            return True
        return False

    def resume_print(self):
        if self.state == PrintState.PAUSED:
            self.pause_flag = False
            self.state = PrintState.PRINTING
            return True
        return False

    def stop_print(self):
        self.stop_flag = True
        if self.state == PrintState.PAUSED:
            self.state = PrintState.IDLE # Break out of pause loop
            
    def _print_loop(self):
        self.state = PrintState.PRINTING
        try:
            logger.info("Connecting to printer...")
            if not self.printer.initialize():
                logger.error("Failed to initialize printer hardware")
                self.state = PrintState.ERROR
                return
            
            # --- SETUP GRAYSCALE/PWM ---
            # If in grayscale mode, we ensure PWM is set to fixed_pwm (usually 700)
            if self.calibration.mode == "grayscale":
                 target_pwm = self.calibration.max_pwm
                 logger.info(f"Setting fixed PWM for Grayscale: {target_pwm}")
                 self.printer.set_pwm(target_pwm)
                 # Also tell RPi we are in grayscale mode? 
                 # Currently RPi logic is simple, it just takes PWM and Display Image. 
                 # So just setting PWM is enough if we send pre-processed images.
            
            for i, layer in enumerate(self.layers):
                if self.stop_flag:
                    logger.info("Print Stopped by User")
                    break
                    
                while self.pause_flag and not self.stop_flag:
                    time.sleep(1)
                    
                self.current_layer_index = i
                
                # 1. Peel logic
                time.sleep(2.0)

                # 2. Prepare Image
                png_data = None
                
                # Check for Composite Layer (New Greyscale Logic)
                if layer.get("sources"):
                    try:
                        # We need to merge multiple sources
                        # Canvas initialized as None
                        import numpy as np
                        composite_arr = None
                        
                        for src in layer["sources"]:
                            sl1_path = src.get("sl1_path")
                            png_name = src.get("png_name")
                            irr = src.get("irradiance_mw_cm2", 0)
                            
                            # Read Image
                            src_data = None
                            if sl1_path and png_name:
                                import zipfile
                                with zipfile.ZipFile(sl1_path, "r") as z:
                                    src_data = z.read(png_name)
                            
                            if not src_data: continue
                                
                            # Convert to Gray
                            gray_val = 255
                            if self.calibration.mode == "grayscale":
                                gray_val = self.calibration.get_gray_for_irradiance(irr)
                                
                            with Image.open(io.BytesIO(src_data)) as img:
                                img = img.convert("L")
                                arr = np.array(img)
                                
                                # Apply Mask: if pixel > 128 -> gray_val
                                # We use np.where for speed
                                mask = arr > 128
                                arr_processed = np.zeros_like(arr)
                                arr_processed[mask] = gray_val
                                
                                # Merge into Composite
                                if composite_arr is None:
                                    composite_arr = arr_processed
                                else:
                                    # Use Maximum intensity for overlap
                                    composite_arr = np.maximum(composite_arr, arr_processed)
                        
                        if composite_arr is not None:
                            out_img = Image.fromarray(composite_arr)
                            buf = io.BytesIO()
                            out_img.save(buf, format="PNG")
                            png_data = buf.getvalue()
                            
                    except Exception as e:
                        logger.error(f"Failed to process composite layer: {e}")
                        self.state = PrintState.ERROR
                        return

                # Fallback / Single Source Logic (Legacy or Single Object)
                elif not png_data:
                    image_filename = layer["filename"]
                    sl1_path = layer.get("_sl1_path")
                    png_name = layer.get("_png_name")
                    
                    raw_data = None
                    
                    if sl1_path and png_name:
                        import zipfile
                        try:
                            with zipfile.ZipFile(sl1_path, "r") as z:
                                raw_data = z.read(png_name)
                        except Exception as e:
                            logger.error(f"Failed to read layer from ZIP: {e}")
                            self.state = PrintState.ERROR
                            return
                    else:
                        # Fallback to file on disk
                        image_path = self.job_dir / "merged_layers" / image_filename
                        if image_path.exists():
                            with open(image_path, "rb") as f:
                                raw_data = f.read()
                    
                    if raw_data:
                        # Single source processing (apply gray if needed)
                        target_irradiance = layer.get("irradiance_mw_cm2")
                        if self.calibration.mode == "grayscale" and target_irradiance:
                            gray_val = self.calibration.get_gray_for_irradiance(target_irradiance)
                            with Image.open(io.BytesIO(raw_data)) as img:
                                img = img.convert("L")
                                img_processed = img.point(lambda p: gray_val if p > 128 else 0)
                                output = io.BytesIO()
                                img_processed.save(output, format="PNG")
                                png_data = output.getvalue()
                        else:
                            png_data = raw_data

                if not png_data:
                    logger.error(f"No PNG data found for layer {i}")
                    self.state = PrintState.ERROR
                    return

                # 3. Display
                if not self.printer.display_image_bytes(png_data, layer["filename"]):
                    logger.error(f"Failed to display image")
                    self.state = PrintState.ERROR
                    return
                
                # 4. Expose
                # Do we need to recalculate time from Dose?
                # exposure_time = self.calibration.get_time_for_dose(layer_dose, current_irradiance)
                # For now use layer time
                exposure_time = layer.get("exposure_time", 2.0)
                
                logger.info(f"Exposing Layer {i} for {exposure_time}s")
                self.printer.expose(exposure_time)
                
            self.printer.stop_projector()
            
            if not self.stop_flag:
                self.state = PrintState.COMPLETED
            else:
                self.state = PrintState.IDLE

        except Exception as e:
            logger.error(f"Print Loop Exception: {e}")
            self.state = PrintState.ERROR
            self.printer.stop_projector()

    def get_status(self):
        return {
            "state": self.state,
            "current_layer": self.current_layer_index,
            "total_layers": self.total_layers,
            "job_id": self.current_job_id,
            "progress": (self.current_layer_index / self.total_layers * 100) if self.total_layers > 0 else 0
        }
