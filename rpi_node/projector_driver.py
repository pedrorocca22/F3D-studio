
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
        def read_mode(self): return Mode.STANDBY
        def set_led_pwm(self, pwm): pass
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

    def clear_screen_fast(self):
        """Clear the screen by sending a black image buffer."""
        if self.dmd:
            try:
                import numpy as np
                black_frame = np.zeros((2560, 1440), dtype=np.uint8)
                self.dmd.split_spi_transmission(0, 0, black_frame)
                self.dmd.swap_buffer()
                return True
            except Exception as e:
                self.logger.error(f"Fast clear failed: {e}")
                return False
        return False

    def prepare_print_mode(self, pwm_intensity=700, force_reset=False):
        if self.dmd:
            try:
                # Unconditional switch for reliability
                hw_max = self.dmd.configure_external_print(LED_PWM=pwm_intensity)
                self.dmd.switch_mode(Mode.EXTERNALPRINT)
                self.clear_screen_fast()
                self.logger.info(f"Switched to Print Mode (PWM: {pwm_intensity})")
                return True
            except Exception as e:
                self.logger.error(f"Failed to set print mode: {e}")
                return False
        return False

    def display_image(self, image_path):
        if self.dmd:
            try:
                self.dmd.send_image_to_buffer(str(image_path), 0, 0)
                self.dmd.swap_buffer()
                return True
            except Exception as e:
                self.logger.error(f"Failed to display image: {e}")
                return False
        return False

    def expose(self, duration_seconds, dark_frames=0):
        """
        Expone el patrón actual durante duration_seconds.

        dark_frames: fotogramas oscuros entre cada fotograma expuesto.
          - 0  → LED encendido ininterrumpidamente → irradiancia máxima (calibración, impresión)
          - >0 → alterna encendido/apagado → reduce irradiancia efectiva.
                 Útil para estabilizar visualmente el Grid de calibración óptica,
                 pero NO usar en exposiciones de calibración de irradiancia ni en impresión.
        """
        if self.dmd:
            try:
                self.dmd.expose_pattern(exposed_frames=-1, dark_frames=dark_frames)
                time.sleep(duration_seconds)
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
                # KILL LIGHT FIRST to prevent flashes
                # Try to set PWM to 0 via controller if possible, or assume standby does it.
                # But to be safe, let's force I2C write for PWM 0 if we can access it, 
                # or just rely on switch_mode. 
                # Let's try to use configure_external_print(0) or similar? No, too slow.
                # Just call standby immediately, but let's ensure stop_exposure is called.
                
                # Best hack: Direct I2C to PWM register 0x54 if we could, 
                # but we don't have direct access here easily without private members.
                # We will rely on stop_exposure stopping the trigger and standby killing the LED.
                
                self.dmd.stop_exposure()
                # Force PWM 0 via a quick hack if enable_led is separate? 
                # Actually, switch_mode(STANDBY) SHOULD kill it.
                
                self.standby()
            except:
                pass

    def standby(self):
        if self.dmd:
            try:
                self.dmd.switch_mode(Mode.STANDBY)
            except:
                pass
        # REMOVED: GPIO.cleanup() - This was causing 'Setup failed' by unconfiguring pins
        # for subsequent commands. Pins should stay configured for the app lifecycle.
