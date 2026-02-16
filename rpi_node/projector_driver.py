
import sys
import os
import time
import logging

# Add parent directory to path to import controller module
# NOTE: Case-sensitive on Linux! Folder is 'Controller' not 'controller'
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'Controller', 'src'))

try:
    # Attempt import on RPi environment
    import spidev
    try:
        import smbus
    except ImportError:
        import smbus2 as smbus
    import RPi.GPIO as GPIO
    from UV_projector.controller import DLPC1438, Mode
    _ON_RPI = True
    logging.info("RPi hardware drivers loaded successfully (RPi.GPIO + SPI + I2C)")
        
except ImportError as e:
    # Mock for testing on Windows/Non-Pi
    logging.warning(f"Hardware imports failed ({e}). Using MOCK Projector.")
    _ON_RPI = False
    class Mode:
        STANDBY = 0
        EXTERNALPRINT = 1
        
    class DLPC1438:
        def __init__(self, i2c, spi): pass
        def configure_external_print(self, LED_PWM): return {'LED1': 700, 'LED2': 41, 'LED3': 41}
        def read_max_led_pwm(self): return {'LED1': 700, 'LED2': 41, 'LED3': 41}
        def read_current_led_pwm(self): return {'LED1': 0, 'LED2': 0, 'LED3': 0}
        def switch_mode(self, mode): pass
        def set_background(self, intensity, both_buffers): pass
        def send_image_to_buffer(self, filename, x, y): pass
        def swap_buffer(self): pass
        def expose_pattern(self, exposed_frames): pass
        def stop_exposure(self): pass
    
    class MockSMBus:
        def __init__(self, bus): pass
    
    class MockSpiDev:
        def open(self, bus, device): pass
        max_speed_hz = 0
        mode = 0

    smbus = MockSMBus
    spidev = MockSpiDev

class ProjectorDriver:
    def __init__(self):
        self.dmd = None
        self.logger = logging.getLogger("ProjectorDriver")

    def initialize(self):
        try:
            if _ON_RPI:
                GPIO.setmode(GPIO.BCM)
                i2c = smbus.SMBus(1)
                spi = spidev.SpiDev()
                spi.open(0, 0)
                spi.max_speed_hz = 30000000 
                spi.mode = 3 
                self.dmd = DLPC1438(i2c, spi)
                self.logger.info("Projector Initialized (REAL hardware)")
            else:
                # Mock Mode
                self.dmd = DLPC1438(None, None)
                self.logger.info("Mock Projector Initialized")
                
            return True
        except Exception as e:
            self.logger.error(f"Failed to initialize projector: {e}")
            return False

    def prepare_print_mode(self, pwm_intensity=700):
        if self.dmd:
            try:
                hw_max = self.dmd.configure_external_print(LED_PWM=pwm_intensity)
                self.dmd.switch_mode(Mode.EXTERNALPRINT)
                self.dmd.set_background(intensity=0, both_buffers=True)
                self.logger.info(f"Switched to Print Mode (PWM: {pwm_intensity})")
                self.logger.info(f"Hardware max LED PWM: LED1={hw_max.get('LED1', '?')}, LED2={hw_max.get('LED2', '?')}, LED3={hw_max.get('LED3', '?')}")
                return True
            except Exception as e:
                self.logger.error(f"Failed to set print mode: {e}")
                return False
        return False

    def display_image(self, image_path):
        if self.dmd:
            try:
                # Assuming full screen 0,0
                self.dmd.send_image_to_buffer(str(image_path), 0, 0)
                self.dmd.swap_buffer()
                return True
            except Exception as e:
                self.logger.error(f"Failed to display image: {e}")
                return False
        return False

    def expose(self, duration_seconds):
        if self.dmd:
            try:
                # -1 for infinite, we control timing manually for precision
                self.dmd.expose_pattern(exposed_frames=-1)
                
                # Wait for exposure to complete
                time.sleep(duration_seconds)
                
                # Stop explicitly
                self.dmd.stop_exposure()
                return True
            except Exception as e:
                self.logger.error(f"Exposure failed: {e}")
                return False
        return False
    
    def stop(self):
        """Stop projection and put device into standby (LEDs OFF)."""
        if self.dmd:
            try:
                # First ensure exposure is stopped
                self.dmd.stop_exposure()
                # Then enter full standby mode
                self.standby()
            except:
                pass

    def standby(self):
        if self.dmd:
            try:
                self.dmd.switch_mode(Mode.STANDBY)
            except:
                pass
        if _ON_RPI:
            GPIO.cleanup()
