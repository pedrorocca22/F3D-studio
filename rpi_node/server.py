
import os
import logging
from flask import Flask, request, jsonify, make_response
from PIL import Image
from motor_driver import MotorDriver
from projector_driver import ProjectorDriver

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RPiNode")

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Handle preflight OPTIONS requests globally
@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def options_handler(path):
    return add_cors_headers(make_response())

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
            # We no longer set background to 255 here to avoid flickering/conflicts
            # with the solid images loaded in the next step.
            pass
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
    """Update displayed image for calibration (grayscale or grid)."""
    data = request.json
    gray = data.get('gray')
    
    if projector.dmd:
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            
            if gray == 'grid':
                filepath = os.path.join(base_dir, 'gray_scales', 'grid_calibration.png')
                filename = "grid_calibration.png"
            else:
                gray_val = int(gray) if gray is not None else 0
                gray_val = max(0, min(255, gray_val))
                filepath = os.path.join(base_dir, 'gray_scales', f"{gray_val}.png")
                filename = f"{gray_val}.png"
            
            if os.path.exists(filepath):
                projector.display_image(filepath)
                return jsonify({"status": "ok", "image": filename})
            else:
                return jsonify({"error": f"Image {filename} missing."}), 404
                
        except Exception as e:
            return jsonify({"error": f"Failed to set image: {str(e)}"}), 500
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
        if projector.dmd:
             # Fast PWM update without reloading mode or images
             projector.dmd.set_led_pwm(pwm)
             return jsonify({
                "status": "ok", 
                "pwm": pwm,
                "hw_limited": pwm > 700
            })
        return jsonify({"error": "Projector not ready"}), 500
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

@app.route('/i2c/write', methods=['POST'])
def i2c_write():
    """Low-level I2C write for debugging."""
    try:
        data = request.json
        reg = int(data.get('reg', 0))
        dataset = data.get('data', [])
        if projector.dmd:
             # Access private method for debug/test purposes 
             # (Python allows this, though it's technically private)
             projector.dmd._DLPC1438__i2c_write(reg, dataset)
             return jsonify({"status": "ok", "reg": hex(reg), "data": [hex(x) for x in dataset]})
        return jsonify({"error": "Projector not ready"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/i2c/read', methods=['POST'])
def i2c_read():
    """Low-level I2C read for debugging."""
    try:
        data = request.json
        reg = int(data.get('reg', 0))
        length = int(data.get('len', 1))
        if projector.dmd:
             # Access private method
             val = projector.dmd._DLPC1438__i2c_read(reg, length)
             return jsonify({"status": "ok", "reg": hex(reg), "val": [hex(x) for x in val]})
        return jsonify({"error": "Projector not ready"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run on all interfaces, port 5000
    app.run(host='0.0.0.0', port=5000)
