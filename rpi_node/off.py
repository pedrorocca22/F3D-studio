import sys
import os
import time

# Add parent directory to path to import controller module
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'Controller', 'src'))

from projector_driver import ProjectorDriver

def main():
    print("Connecting to projector...")
    driver = ProjectorDriver()
    
    # We initialize it just in case it wasn't recognized, though standby might work without full init
    if driver.initialize():
        print("Driver initialized.")
    else:
        print("Warning: Driver initialization failed, attempting standby anyway...")

    print("Sending STANDBY command...")
    try:
        driver.standby()
        print("SUCCESS: Projector is now in STANDBY mode (LEDs OFF).")
    except Exception as e:
        print(f"ERROR: Failed to set standby mode: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
