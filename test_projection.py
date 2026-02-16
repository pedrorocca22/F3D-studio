import requests
import time
import sys

RPI_IP = "192.168.137.164"
URL_BASE = f"http://{RPI_IP}:5000"

def run_test():
    print(f"Testing Projector on {RPI_IP}...")
    
    # 1. Force Init (in case of hardware restart)
    print("1. Force Init...")
    try:
        r = requests.post(f"{URL_BASE}/projector/force_init", timeout=5)
        print(f"   Init Response: {r.text}")
    except Exception as e:
        print(f"   Init Failed: {e}")
        return

    # 2. Setup Calibration Mode (Load Image)
    print("2. Setup Calibration Mode...")
    try:
        r = requests.post(f"{URL_BASE}/calibration/setup", timeout=10)
        if r.status_code != 200:
            print(f"   Setup Failed: {r.text}")
            return
        print("   Setup OK")
    except Exception as e:
        print(f"   Setup Error: {e}")
        return

    # 3. Set PWM 500
    print("3. Setting PWM 500...")
    requests.post(f"{URL_BASE}/calibration/pwm", json={"pwm": 500})

    # 4. Expose 5s
    print("4. Exposing for 5 seconds (LOOK AT THE PROJECTOR!)...")
    try:
        requests.post(f"{URL_BASE}/projector/expose", json={"duration": 5}, timeout=10)
        print("   Exposure Done.")
    except Exception as e:
        print(f"   Exposure Error: {e}")

    # 5. Off
    print("5. Turning Off...")
    requests.post(f"{URL_BASE}/calibration/pwm", json={"pwm": 0})
    print("Test Complete.")

if __name__ == "__main__":
    run_test()
