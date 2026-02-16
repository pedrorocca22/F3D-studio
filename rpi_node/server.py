
import os
import logging
from flask import Flask, request, jsonify
from motor_driver import MotorDriver
from projector_driver import ProjectorDriver

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RPiNode")

app = Flask(__name__)
# Global projector instance
try:
    projector = ProjectorDriver() 
    projector.initialize() # <--- CRITICAL FIX
except Exception as e:
    logging.error(f"Startup crash: {e}")
    projector = None

# Initialize Drivers
# NOTE: Config paths or ports might need adjustment on actual Pi
motor = MotorDriver(port='/dev/ttyUSB0')

@app.route('/projector/force_init', methods=['POST'])
def force_init():
    global projector
    try:
        projector = ProjectorDriver()
        success = projector.initialize() # <--- CRITICAL FIX
        
        if success and projector.dmd:
             return jsonify({"status": "ok", "initialized": True})
        else:
             return jsonify({"status": "failed", "error": "Initialization returned False"}), 500
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/status', methods=['GET'])
def status():
    return jsonify({
        "motor_connected": motor.ser is not None and motor.ser.is_open,
        "projector_initialized": projector.dmd is not None
    })

@app.route('/init', methods=['POST'])
def initialize():
    m_ok = motor.connect()
    p_ok = projector.initialize()
    if p_ok:
        projector.prepare_print_mode()
    
    return jsonify({
        "motor": "connected" if m_ok else "failed",
        "projector": "initialized" if p_ok else "failed"
    })

@app.route('/motor/move_z', methods=['POST'])
def move_z():
    data = request.json
    dist = data.get('distance_mm', 0)
    speed = data.get('speed', 300)
    relative = data.get('relative', True)
    
    if relative:
        motor.move_z_relative(dist, speed)
    else:
        motor.move_z_absolute(dist, speed)
        
    return jsonify({"status": "ok"})

@app.route('/motor/home', methods=['POST'])
def home_z():
    motor.home_z()
    return jsonify({"status": "ok"})

@app.route('/projector/display', methods=['POST'])
def display():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    filepath = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(filepath)
    
    success = projector.display_image(filepath)
    return jsonify({"status": "ok" if success else "failed"})

@app.route('/projector/expose', methods=['POST'])
def expose():
    data = request.json
    duration = data.get('duration', 1.0)
    success = projector.expose(duration)
    return jsonify({"status": "ok" if success else "failed"})

@app.route('/projector/off', methods=['POST'])
def off():
    projector.stop()
    return jsonify({"status": "ok"})

@app.route('/calibration/setup', methods=['POST'])
def calib_setup():
    """Initial setup for calibration: Set mode, load image or background."""
    try:
        data = request.json or {}
        pwm = int(data.get('pwm', 0))
        mode = data.get('mode', 'pwm')  # 'pwm' or 'grayscale'

        # 1. Enter External Print Mode
        success = projector.prepare_print_mode(pwm_intensity=pwm)
        if not success or not projector.dmd:
             return jsonify({"error": "Failed to enter print mode"}), 500

        if mode == 'grayscale':
            # For grayscale cal: set white background (gray will be changed per step)
            projector.dmd.set_background(255, both_buffers=True)
        else:
            # For PWM cal: load white image
            import os
            base_dir = os.path.dirname(os.path.abspath(__file__))
            img_path = os.path.join(base_dir, 'calibracion.png')
            if os.path.exists(img_path):
                 projector.dmd.send_image_to_buffer(img_path, 0, 0)
                 projector.dmd.swap_buffer()
            else:
                 return jsonify({"error": "calibracion.png missing"}), 404

        return jsonify({"status": "ok", "mode": mode, "pwm": pwm})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/calibration/gray', methods=['POST'])
def calib_gray():
    """Update gray value for all pixels (for grayscale calibration)."""
    data = request.json
    gray = int(data.get('gray', 0))
    gray = max(0, min(255, gray))  # Clamp to 0-255
    if projector.dmd:
        projector.dmd.set_background(gray)
        projector.dmd.swap_buffer()
        return jsonify({"status": "ok", "gray": gray})
    return jsonify({"error": "Projector not ready"}), 500

@app.route('/calibration/pwm', methods=['POST'])
def calib_pwm():
    """Update PWM only (fast)."""
    data = request.json
    pwm = int(data.get('pwm', 0))
    if projector.dmd:
        projector.dmd.set_led_pwm(pwm)
        return jsonify({"status": "ok"})
    return jsonify({"error": "Projector not ready"}), 500

@app.route('/projector/pwm', methods=['POST'])
def set_pwm():
    # Legacy / Compatibility endpoint
    # ... logic continues ...
    data = request.json
    pwm = data.get('pwm')
    
    if pwm is None:
        return jsonify({"error": "pwm parameter required"}), 400
        
    try:
        pwm = int(pwm)
        # Use prepare_print_mode to configure the PWM
        # This writes to register 0x54 and ensures we are in the right mode
        success = projector.prepare_print_mode(pwm_intensity=pwm)
        
        # Show full white screen to ensure sensor sees the light
        # We need to ensure a pattern is displayed
        upload_folder = 'uploads'
        # Check if we have a white pattern, if not we can generate one or just assume 
        # the user handles it. But prepare_print_mode sets background to 0 (black).
        # We should probably set background to full white for calibration measurement?
        # The user said "ejecute un plano de luz completo".
        # Let's verify if prepare_print_mode sets background to 0. 
        # Yes: self.dmd.set_background(intensity=0, both_buffers=True) 
        
        # So we must set background to 255 OR display a white image.
        # Let's set background to 255 (Max intensity) for calibration immediately after.
        if success and projector.dmd:
             import os
             base_dir = os.path.dirname(os.path.abspath(__file__))
             img_path = os.path.join(base_dir, 'calibracion.png')
             
             if os.path.exists(img_path):
                 try:
                     projector.dmd.send_image_to_buffer(img_path, 0, 0)
                     projector.dmd.swap_buffer()
                     # Exposure will be triggered by a separate call or manually
                 except Exception as e:
                     return jsonify({"error": f"Failed to project image: {str(e)}"}), 500
             else:
                 return jsonify({"error": "calibracion.png not found on RPi"}), 404
             
             # projector.dmd.expose_pattern(exposed_frames=-1) # Already called above
        
        return jsonify({
            "status": "ok" if success else "failed", 
            "pwm": pwm,
            "hw_limited": pwm > 700 # Just a hint, real limit is in logs
        })
    except ValueError:
        return jsonify({"error": "pwm must be an integer"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/shutdown', methods=['POST'])
def shutdown():
    projector.standby()
    motor.disconnect()
    return jsonify({"status": "ok", "message": "Hardware shutdown"})

@app.route('/projector/info', methods=['GET'])
def projector_info():
    """Return projector hardware info including max LED PWM values."""
    info = {
        "initialized": projector.dmd is not None,
        "current_pwm": None,
        "max_pwm": None,
    }
    if projector.dmd:
        try:
            info["max_pwm"] = projector.dmd.read_max_led_pwm()
        except Exception as e:
            info["max_pwm_error"] = str(e)
        try:
            info["current_pwm"] = projector.dmd.read_current_led_pwm()
        except Exception as e:
            info["current_pwm_error"] = str(e)
    return jsonify(info)

if __name__ == '__main__':
    # Run on all interfaces, port 5000
    app.run(host='0.0.0.0', port=5000)
