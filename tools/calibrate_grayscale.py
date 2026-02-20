"""
calibrate_grayscale.py
======================
Script de calibración de irradiancia para el proyector DLP3.

Modo de funcionamiento:
  - Recorre todas las imágenes de gray_scales/ de 0 a 255 (paso configurable,
    por defecto 1 => medición completa imagen por imagen).
  - Para cada valor:
      1. Carga la imagen (gray_scales/{n}.png) en el proyector via /calibration/gray.
      2. Lanza /projector/expose para encender el LED (bloqueante en hilo aparte).
      3. Lee muestras del sensor UV (Arduino COM) durante la ventana de exposición.
      4. Calcula la media y la guarda.
  - Guarda el resultado en tools/calibration_gray.json.

Uso rápido (valores por defecto):
  python calibrate_grayscale.py

Uso avanzado:
  python calibrate_grayscale.py --ip 192.168.137.148 --port COM5 --step 1 --samples 5 --output calibration_gray.json
"""

import serial
import time
import requests
import json
import argparse
import sys
import threading
import concurrent.futures
import statistics
from datetime import datetime

# ─── Configuración por defecto ───────────────────────────────────────────────
RPI_IP_DEFAULT      = "192.168.137.148"
SERIAL_PORT_DEFAULT = "COM5"
BAUD_RATE           = 115200
OUTPUT_FILE         = "calibration_gray.json"
FIXED_PWM           = 700   # PWM fijo del LED (máximo hardware)
STABILIZE_SECS      = 0.5   # Espera tras cargar imagen antes de encender LED
EXPOSE_SECS         = 3.0   # Duración de la exposición (y ventana de medición)
SENSOR_DELAY_SECS   = 0.5   # El sensor empieza a medir 0.5s después de iniciar exposición
COOLDOWN_SECS       = 2.0   # Espera entre pasos (enfriamiento / estabilización)


# Añadimos una Session_global para reusar las conexiones TCP y evitar agotar sockets (WinError 10061)
SESSION = requests.Session()

def setup_grayscale(rpi_ip: str) -> bool:
    """Prepara el proyector en modo grayscale con PWM fijo."""
    url = f"http://{rpi_ip}:5000/calibration/setup"
    try:
        print(f"  Configurando proyector (PWM={FIXED_PWM}, modo=grayscale)...")
        resp = SESSION.post(url, json={"pwm": FIXED_PWM, "mode": "grayscale"}, timeout=20)
        resp.raise_for_status()
        print(f"  Setup OK: {resp.json()}")
        return True
    except Exception as e:
        print(f"  [ERROR] setup_grayscale: {e}")
        return False

def set_gray(rpi_ip: str, gray_value: int) -> bool:
    """Carga la imagen gray_scales/{gray_value}.png en el proyector."""
    url = f"http://{rpi_ip}:5000/calibration/gray"
    try:
        resp = SESSION.post(url, json={"gray": gray_value}, timeout=10)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"  [ERROR] set_gray({gray_value}): {e}")
        return False


def expose_projector(rpi_ip: str, duration: float) -> bool:
    """Llama a /projector/expose para encender el LED durante `duration` segundos (bloqueante)."""
    url = f"http://{rpi_ip}:5000/projector/expose"
    try:
        # Añadido un poco más de margen al timeout del socket para evitar que cierre antes que el RPi responda
        resp = SESSION.post(url, json={"duration": duration}, timeout=duration + 15)
        resp.raise_for_status()
        return True
    except Exception as e:
        print(f"  [ERROR] expose_projector: {e}")
        return False


def read_sensor_samples(ser: serial.Serial, duration: float, pre_delay: float = 0.0) -> list[float]:
    """
    Lee muestras del sensor durante `duration` segundos.
    `pre_delay`: espera inicial antes de empezar a registrar (para que el LED se estabilice).
    El Arduino envía una línea por medida, con el valor en mW/cm².
    """
    samples = []
    ser.reset_input_buffer()
    if pre_delay > 0:
        time.sleep(pre_delay)
    deadline = time.time() + duration
    while time.time() < deadline:
        try:
            line = ser.readline().decode("utf-8", errors="ignore").strip()
            if line:
                val = float(line)
                samples.append(val)
        except ValueError:
            pass   # Ignora líneas no numéricas (ej. "Ready", unidades, etc.)
        except Exception:
            pass
    return samples


def measure_gray(rpi_ip: str, ser: serial.Serial, gray: int, n_measures: int) -> float | None:
    """
    Patrón idéntico al script original que funcionó:
      - El SENSOR lee en un hilo secundario (no bloqueante).
      - El EXPOSE bloquea el hilo principal (requests bloqueante con timeout).
    Pasos:
      1. Carga la imagen gray_scales/{gray}.png en el proyector.
      2. Espera STABILIZE_SECS para que el DMD asiente la imagen.
      3. Arranca hilo de lectura del sensor.
      4. El hilo principal llama a /projector/expose (bloqueante EXPOSE_SECS).
      5. Al terminar expose, señala al hilo de sensor que pare.
      6. Recoge muestras y devuelve la media.
    n_measures repeticiones para acumular más muestras y reducir ruido.
    """
    all_samples: list[float] = []

    for rep in range(n_measures):
        # 1. Cargar imagen
        if not set_gray(rpi_ip, gray):
            continue

        # 2. Esperar estabilización del DMD
        time.sleep(STABILIZE_SECS)

        # 3. Hilo que lee el sensor en segundo plano
        measurements = []
        stop_event = threading.Event()

        def measure_task():
            ser.reset_input_buffer()
            # Pequeña espera para que el LED se estabilice tras encender
            time.sleep(SENSOR_DELAY_SECS)
            while not stop_event.is_set():
                try:
                    line = ser.readline().decode("utf-8", errors="ignore").strip()
                    if line:
                        measurements.append(float(line))
                except (ValueError, Exception):
                    pass

        t = threading.Thread(target=measure_task, daemon=True)
        t.start()

        # 4. Hilo principal: trigger_expose es BLOQUEANTE (igual que el original)
        expose_projector(rpi_ip, EXPOSE_SECS)

        # 5. Señalar al hilo de sensor que pare y esperar que termine
        stop_event.set()
        t.join(timeout=3)

        all_samples.extend(measurements)

    if not all_samples:
        print(f"  [WARN] gray={gray}: sin muestras del sensor.")
        return None

    # Para capturar el verdadero "punto dulce" y evitar picos eléctricos fantasma (EMI):
    # Aislamos temporalmente el fragmento central de la lectura y sacamos la Mediana.
    n = len(all_samples)
    if n >= 5:
        # Descartar 30% inicial (rampa subida/pico encendido) y 30% final (bajada)
        start_idx = int(n * 0.3)
        end_idx = int(n * 0.7)
        centro_estable = all_samples[start_idx:end_idx]
        return statistics.median(centro_estable)
    
    return statistics.median(all_samples)


def main():
    parser = argparse.ArgumentParser(
        description="Calibración completa de irradiancia (0-255) del proyector DLP3.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("--ip",      default=RPI_IP_DEFAULT,    help=f"IP de la RPi (defecto: {RPI_IP_DEFAULT})")
    parser.add_argument("--port",    default=SERIAL_PORT_DEFAULT, help=f"Puerto COM del Arduino (defecto: {SERIAL_PORT_DEFAULT})")
    parser.add_argument("--step",    type=int, default=1,        help="Paso entre valores de gris 0-255 (defecto: 1 = todos)")
    parser.add_argument("--samples", type=int, default=1,        help="Número de ventanas de medición por nivel (defecto: 1)")
    parser.add_argument("--output",  default=OUTPUT_FILE,        help=f"Archivo JSON de salida (defecto: {OUTPUT_FILE})")
    parser.add_argument("--resume",  type=int, default=0,        help="Reanudar desde este valor de gris (defecto: 0 = inicio)")
    args = parser.parse_args()

    step = max(1, min(255, args.step))

    gray_values = list(range(0, 256, step))
    if gray_values[-1] != 255:
        gray_values.append(255)

    # Filtrar si se reanuda
    if args.resume > 0:
        gray_values = [g for g in gray_values if g >= args.resume]
        print(f"  [RESUME] Reanudando desde gray={args.resume}")

    total = len(gray_values)

    print("=" * 55)
    print("  CALIBRACION DE IRRADIANCIA - DLP3 Proyector")
    print("=" * 55)
    print(f"  RPi IP    : {args.ip}")
    print(f"  Puerto COM: {args.port} @ {BAUD_RATE} baud")
    print(f"  PWM LED   : {FIXED_PWM} (fijo)")
    print(f"  Rango gris: 0-255, paso={step} ({total} puntos)")
    print(f"  Muestras  : {args.samples} x {EXPOSE_SECS}s/ventana")
    print(f"  Salida    : {args.output}")
    print("-" * 55)

    # ── Conectar sensor ──────────────────────────────────────────
    print(f"\n[1/3] Conectando al sensor en {args.port}...")
    try:
        ser = serial.Serial(args.port, BAUD_RATE, timeout=1.0)
        time.sleep(2)  # Espera reset Arduino
        print(f"  Sensor conectado en {args.port}.")
    except Exception as e:
        print(f"  [ERROR] No se puede abrir {args.port}: {e}")
        sys.exit(1)

    # ── Setup proyector ──────────────────────────────────────────
    print(f"\n[2/3] Configurando proyector en {args.ip}...")
    if not setup_grayscale(args.ip):
        print("  [ERROR] No se pudo configurar el proyector. Abortando.")
        ser.close()
        sys.exit(1)

    time.sleep(2)  # Estabilización del modo

    # ── Bucle de medición ────────────────────────────────────────
    print(f"\n[3/3] Iniciando barrido de irradiancia...\n")
    calibration_data = []

    # Si se reanuda, cargar datos previos
    if args.resume > 0:
        try:
            with open(args.output, "r") as f:
                prev = json.load(f)
                calibration_data = [d for d in prev.get("data", []) if d["gray"] < args.resume]
                print(f"  Cargados {len(calibration_data)} puntos previos del archivo.")
        except Exception:
            print("  No se encontró archivo previo; partiendo desde cero.")

    try:
        for i, gray in enumerate(gray_values):
            pct = (i + 1) / total * 100
            print(f"  [{i+1:3d}/{total}] gray={gray:3d}  ({pct:.1f}%)", end="", flush=True)

            max_irr = measure_gray(args.ip, ser, gray, args.samples)

            if max_irr is None:
                max_irr = 0.0
                print(f"  → 0.0000 mW/cm² [SIN DATO]")
            else:
                print(f"  → {max_irr:.4f} mW/cm²")

            calibration_data.append({"gray": gray, "irradiance": max_irr})

            # Guardado incremental: cada 10 pasos o en el primero/último
            if i == 0 or (i + 1) % 10 == 0 or gray == 255:
                _save(args.output, calibration_data, args)

            time.sleep(COOLDOWN_SECS)

    except KeyboardInterrupt:
        print("\n\n  [INTERRUMPIDO] Guardando datos parciales...")

    finally:
        # Apagar imagen al finalizar
        set_gray(args.ip, 0)
        ser.close()

    _save(args.output, calibration_data, args)
    print(f"\n✓ Calibración completada. {len(calibration_data)} puntos guardados en '{args.output}'.")


def _save(output_path: str, data: list, args) -> None:
    """Guarda el JSON de calibración con metadata."""
    payload = {
        "date":      datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "type":      "grayscale",
        "fixed_pwm": FIXED_PWM,
        "max_gray":  255,
        "step":      max(1, min(255, args.step)),
        "sensor_port": args.port,
        "data":      sorted(data, key=lambda x: x["gray"])
    }
    try:
        with open(output_path, "w") as f:
            json.dump(payload, f, indent=4)
    except Exception as e:
        print(f"  [ERROR] No se pudo guardar '{output_path}': {e}")


if __name__ == "__main__":
    main()
