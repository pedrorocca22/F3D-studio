import serial
import time
import requests
import json
import argparse
import sys
import threading
import statistics

# Configuration
RPI_IP_DEFAULT = "192.168.137.164"
SERIAL_PORT_DEFAULT = "COM5"
BAUD_RATE = 115200
OUTPUT_FILE = "calibration_gray.json"
FIXED_PWM = 700  # LED always at maximum

def setup_grayscale(rpi_ip):
    """Setup projector for grayscale calibration: PWM=700, mode=grayscale."""
    url = f"http://{rpi_ip}:5000/calibration/setup"
    try:
        print(f"Setting up Projector (PWM={FIXED_PWM}, Grayscale Mode)...")
        resp = requests.post(url, json={"pwm": FIXED_PWM, "mode": "grayscale"}, timeout=20)
        resp.raise_for_status()
        print(f"  Setup response: {resp.json()}")
        return True
    except Exception as e:
        print(f"Error in setup: {e}")
        return False

def set_gray(rpi_ip, gray_value):
    """Set uniform gray value for all pixels."""
    url = f"http://{rpi_ip}:5000/calibration/gray"
    try:
        resp = requests.post(url, json={"gray": gray_value}, timeout=5)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"Error setting gray {gray_value}: {e}")
        return False

def trigger_exposure(rpi_ip, duration):
    """Trigger exposure (blocking)."""
    url = f"http://{rpi_ip}:5000/projector/expose"
    try:
        resp = requests.post(url, json={"duration": duration}, timeout=duration + 5)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"Error triggering exposure: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Calibrate DLP3 Projector using Grayscale")
    parser.add_argument("--ip", default=RPI_IP_DEFAULT, help="RPi IP Address")
    parser.add_argument("--port", default=SERIAL_PORT_DEFAULT, help="Arduino Serial Port")
    parser.add_argument("--step", type=int, default=5, help="Gray value step size (1-255)")
    parser.add_argument("--output", default=OUTPUT_FILE, help="Output JSON file")
    
    args = parser.parse_args()

    print("=== Grayscale Irradiance Calibration ===")
    print(f"  LED PWM: {FIXED_PWM} (fixed)")
    print(f"  Gray range: 0-255, step={args.step}")
    
    # 1. Connect to Sensor
    print(f"\nConnecting to Sensor on {args.port}...")
    try:
        ser = serial.Serial(args.port, BAUD_RATE, timeout=0.5)
        time.sleep(2)
    except Exception as e:
        print(f"Failed to open serial port: {e}")
        sys.exit(1)

    print(f"Target RPi: {args.ip}")
    print("-----------------------------------")

    # 2. Setup Projector (PWM=700, Grayscale mode)
    if not setup_grayscale(args.ip):
        print("Failed to setup projector. Aborting.")
        sys.exit(1)

    calibration_data = []
    gray_values = list(range(0, 256, args.step))
    # Ensure 255 is always included
    if gray_values[-1] != 255:
        gray_values.append(255)
    
    total = len(gray_values)

    try:
        for i, gray in enumerate(gray_values):
            print(f"\nTesting Gray: {gray}/255  ({i+1}/{total})")
            
            # 3. Set gray value (set_background + swap)
            if not set_gray(args.ip, gray):
                continue
            
            # 4. Measure + Expose
            measurements = []
            stop_event = threading.Event()
            
            def measure_task():
                ser.reset_input_buffer()
                time.sleep(0.3)
                while not stop_event.is_set():
                    try:
                        line = ser.readline().decode('utf-8', errors='ignore').strip()
                        if line:
                            val = float(line)
                            measurements.append(val)
                    except:
                        pass
            
            t = threading.Thread(target=measure_task)
            t.start()
            
            # Expose 2.5s
            trigger_exposure(args.ip, 2.5)
            
            stop_event.set()
            t.join()
            
            if measurements:
                avg = statistics.mean(measurements)
            else:
                avg = 0.0
                
            print(f"  -> Irradiance: {avg:.4f} mW/cm2")
            
            calibration_data.append({"gray": gray, "irradiance": avg})
            time.sleep(4)  # Wait 4s for stability

    except KeyboardInterrupt:
        print("\nAborted.")
    finally:
        # Turn off: set gray 0
        set_gray(args.ip, 0)
        ser.close()

    # Save
    if calibration_data:
        print(f"\nSaving to {args.output}...")
        with open(args.output, "w") as f:
            json.dump({
                "date": time.strftime("%Y-%m-%d %H:%M:%S"),
                "type": "grayscale",
                "fixed_pwm": FIXED_PWM,
                "max_gray": 255,
                "data": calibration_data
            }, f, indent=4)
        print("Done!")

if __name__ == "__main__":
    main()
