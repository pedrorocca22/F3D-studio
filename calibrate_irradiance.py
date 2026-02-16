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
SERIAL_PORT_DEFAULT = "COM5" # Updated to COM5
BAUD_RATE = 115200 
OUTPUT_FILE = "calibration.json"

def setup_calibration(rpi_ip):
    """Initializes the projector (Mode + White Image) ONCE."""
    url = f"http://{rpi_ip}:5000/calibration/setup"
    try:
        print("Setting up Projector (Mode + Image)...")
        resp = requests.post(url, timeout=20)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"Error in setup: {e}")
        return False

def set_pwm_fast(rpi_ip, pwm):
    """Updates only the PWM register."""
    url = f"http://{rpi_ip}:5000/calibration/pwm"
    try:
        resp = requests.post(url, json={"pwm": pwm}, timeout=2)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"Error setting PWM {pwm}: {e}")
        return False

def trigger_exposure(rpi_ip, duration):
    """Triggers exposure (Blocking)."""
    url = f"http://{rpi_ip}:5000/projector/expose"
    try:
        # print(f"  > Exposing {duration}s...")
        resp = requests.post(url, json={"duration": duration}, timeout=duration + 5)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"Error triggering exposure: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Calibrate DLP3 Projector Irradiance")
    parser.add_argument("--ip", default=RPI_IP_DEFAULT, help="RPi IP Address")
    parser.add_argument("--port", default=SERIAL_PORT_DEFAULT, help="Arduino Serial Port")
    parser.add_argument("--step", type=int, default=50, help="PWM step size")
    parser.add_argument("--max", type=int, default=700, help="Max PWM")
    parser.add_argument("--output", default=OUTPUT_FILE, help="Output JSON file")
    
    args = parser.parse_args()

    print("=== Irradiance Calibration Tool (Optimized) ===")
    
    # 1. Connect to Sensor
    print(f"Connecting to Sensor on {args.port}...")
    try:
        ser = serial.Serial(args.port, BAUD_RATE, timeout=0.5)
        time.sleep(2) 
    except Exception as e:
        print(f"Failed to open serial port: {e}")
        sys.exit(1)

    print(f"Target RPi: {args.ip}")
    print("-----------------------------------")

    # 2. Setup Projector ONCE
    if not setup_calibration(args.ip):
        print("Failed to setup projector. Aborting.")
        sys.exit(1)

    calibration_data = []

    try:
        # Start Loop
        for pwm in range(0, args.max + 1, args.step):
            print(f"\nTesting PWM: {pwm}/{args.max}")
            
            # 3. Update PWM (Fast)
            if not set_pwm_fast(args.ip, pwm):
                continue
            
            # 4. Measure + Expose
            measurements = []
            stop_event = threading.Event()
            
            def measure_task():
                # Discard old buffer
                ser.reset_input_buffer()
                time.sleep(0.3) # Faster ramp-up wait
                
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
            
            # Exposure duration (2.5s is enough for stable reading)
            success = trigger_exposure(args.ip, 2.5)
            
            stop_event.set()
            t.join()
            
            if measurements:
                avg = statistics.mean(measurements)
            else:
                avg = 0.0
                
            print(f"  -> Irradiance: {avg:.4f} mW/cm2")
            
            calibration_data.append({"pwm": pwm, "irradiance": avg})
            time.sleep(4) # Wait 4s between steps for projector stability

    except KeyboardInterrupt:
        print("\nAborted.")
    finally:
        set_pwm_fast(args.ip, 0)
        ser.close()

    # Save
    if calibration_data:
        print(f"\nSaving to {args.output}...")
        with open(args.output, "w") as f:
            json.dump({
                "date": time.strftime("%Y-%m-%d %H:%M:%S"),
                "max_pwm": args.max,
                "data": calibration_data
            }, f, indent=4)
        print("Done!")

if __name__ == "__main__":
    main()
