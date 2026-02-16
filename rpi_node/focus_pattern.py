import sys
import os
import time
import signal
from PIL import Image, ImageDraw

# Add parent directory to path to import controller module
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'Controller', 'src'))

from projector_driver import ProjectorDriver

# Configuration
WIDTH = 2560
HEIGHT = 1440
GRID_SPACING = 200 # pixels
OUTPUT_FILE = "focus_grid.png"

def generate_grid_image():
    print(f"Generating {WIDTH}x{HEIGHT} FULL WHITE calibration image...")
    # Create FULL WHITE image for max power
    img = Image.new('L', (WIDTH, HEIGHT), 255)
    
    # No drawing needed for full white
    # draw = ImageDraw.Draw(img)
    
    # Save
    img.save(OUTPUT_FILE)
    print(f"Grid saved to {OUTPUT_FILE}")
    return os.path.abspath(OUTPUT_FILE)

def main():
    driver = ProjectorDriver()
    
    print("Initializing projector...")
    if not driver.initialize():
        print("Failed to initialize projector.")
        sys.exit(1)

    print("Setting Print Mode (700/1023 PWM)...")
    # Use 700 as established safe limit
    if not driver.prepare_print_mode(pwm_intensity=700):
        print("Failed to set print mode.")
        sys.exit(1)

    # Generate and display image
    img_path = generate_grid_image()
    print("Sending image to projector buffer...")
    if not driver.display_image(img_path):
        print("Failed to display image.")
        sys.exit(1)

    print("\n" + "="*40)
    print("  PROJECTING PATTERN for FOCUSING")
    print("  Maximum Intensity (700/1023)")
    print("  Press CTRL+C to stop")
    print("="*40 + "\n")

    try:
        # Start infinite exposure
        # We access dmd directly to use infinite mode (-1) without the sleep loop in driver.expose
        driver.dmd.expose_pattern(exposed_frames=-1)
        
        # Keep script running until Ctrl+C
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\nStopping exposure...")
    finally:
        try:
            driver.stop()
            print("Projector turned off.")
        except Exception as e:
            print(f"Error stopping: {e}")

if __name__ == "__main__":
    main()
