# 🚀 Plan de Migración: Raspberry Pi CM4 + Placa Mellow + Klipper

Este documento detalla la arquitectura, configuración y pasos a seguir para migrar el sistema de la impresora DLP a la nueva configuración de hardware (CM4 + Placa Mellow) y de software (Klipper + Moonraker).

## 🗺️ Arquitectura Propuesta

La nueva arquitectura se basará en un stack estándar y robusto de impresión 3D adaptado a nuestras necesidades de DLP:

```
[ Frontend (Navegador) ]
         │
         ▼ (HTTP / WebSockets)
[ Backend DLP (Python / Flask) ] ── (Slicing + Lógica de Patrones)
         │
         ▼ (HTTP API de Moonraker)
[ Moonraker (API Server) ] ── (Gestión de Estado y Archivos)
         │
         ▼ (Sockets Unix locales)
[ Klipper (Klippy Host) ]
         │
         ▼ (USB / UART / SPI)
[ Placa Mellow (MCU) ] ──▶ Motores (Eje Z), LEDs UV, Sensores
```

## 🔌 Estrategia de Conectividad a la Placa (Decisión: Punto de Acceso WiFi - Modo AP)

Para que el software sea elegante y muy amigable de cara al usuario, hemos decidido implementar usar el **Modo AP (Access Point)**. 

### ¿Cómo funcionará el Punto de Acceso (Modo AP)?
La CM4 creará su propia red WiFi (Hotspot) llamada, por ejemplo, "Setup_DLP" o "Impresora XYZ". 
1. El usuario enciende la impresora.
2. Desde su PC o móvil, busca redes WiFi y se conecta a "Impresora XYZ".
3. Automáticamente se le abrirá un portal (Portal Cautivo) o simplemente entrará a `http://10.0.0.1`.
4. (Opcional a futuro) En ese portal podrá poner la contraseña del WiFi de su casa para que la impresora se conecte a internet, o simplemente puede operar la impresora directamente desde esa red local cerrada.

*   **Pro:** Es el estándar profesional de la industria (IoT, Smart Home, impresoras comerciales). Es absolutamente a prueba de fallos de red iniciales porque no depende del router del usuario.

---

## 🤖 Integración del Software (Backend -> Klipper a través de Moonraker)

Lo mencionaste correctamente: **Los oomandos de Klipper se pueden y deben enviar por Moonraker.**
En lugar de que nuestro `server.py` intente controlar pines directamente, delegaremos la capa física a Klipper. Nuestro servidor Python será un nivel superior ("El Cerebro").

### ¿Cómo se comunican?
Moonraker expone un servidor REST y WebSockets en el puerto 7125. Nuestro servidor Python (`server.py`) le hablará usando HTTP.
*   **Para mover el eje Z:** Nuestro Python hará:
    `POST http://localhost:7125/printer/gcode/script` con JSON `{"script": "G1 Z10 F300"}`
*   **Para activar la luz UV temporalmente (Test):**
    `POST http://localhost:7125/printer/gcode/script` con JSON `{"script": "SET_PIN PIN=uv_led VALUE=1"}`
*   **Para leer Sensores y Posición del Z:**
    `GET http://localhost:7125/api/printer` o consultando los objetos de estado.

Esta separación ("Frontend" -> "Nuestro backend Python para capas/slicing" -> "Moonraker" -> "Klipper") hace el sistema modular, escalable y muy estable, aprovechando lo mejor del mundo open source de la impresión 3D.

---

## 📋 Pasos de Instalación Próximos

Cuando tengas ambas placas listas, procederemos en este orden:

### 1. Preparar la CM4 (Sistema Operativo Base)
**Opción A (Rápida - MainsailOS púlblico):** Instalar SainsailOS usando el menú "3D Printing" de Raspberry Pi Imager.
**Opción B (La que elegiste - SO Estable/Legacy + KIAUH):** Dado que has optado por usar una versión más antigua/estable de Raspberry Pi OS dictada por Mellow para evitar problemas de compatibilidad:
1. Flashea ese RPi OS estable en la CM4 (ya sea eMMC o tarjeta SD).
2. Entra por SSH a la CM4.
3. Instala **KIAUH** (Klipper Installation And Update Helper). Es un script oficial de la comunidad que te instala automáticamente todo lo necesario sobre *cualquier* versión de Linux:
   ```bash
   sudo apt-get install git -y
   cd ~ && git clone https://github.com/dw-0/kiauh.git
   ./kiauh/kiauh.sh
   ```
4. Dentro del menú de KIAUH, presiona "1" (Install) e instala en este orden: **Klipper**, luego **Moonraker**, y finalmente **Mainsail**. ¡Problema de SO resuelto!

### 2. Configuración de Hardware (DIP Switches)
La placa Fly-Puppet usa pines internos (UART) para comunicarse con el MCU RP2040. Es **vital** configurar los interruptores de la placa correctamente para habilitar el USB interno y poder flashear:
*   **Switch 1:** `ON` (Extiende el USB de la CM4 al hub interno)
*   **Switch 2:** `ON`
*   **Switch 3, 4, 5, 6:** `OFF`

Para comprobar que hay conexión, accede por SSH a la CM4 y ejecuta:
```bash
lsusb
```
Debe aparecer un dispositivo listado como **Raspberry Pi RP2 Boot** (indicando que está en modo Bootloader) con un ID similar a `2e8a:0003`. Si no aparece, mantén presionado el botón `BOOT` de la placa, pulsa `RST` y suelta `BOOT`.

### 3. Compilar y Flashear el Firmware (Klipper)
En la consola SSH de la CM4:
```bash
cd ~/klipper
make menuconfig
```
Configura las siguientes opciones para la placa Mellow:
*   **Enable extra low-level configuration options:** Checked ✔️
*   **Micro Controller Architecture:** Raspberry Pi RP2040
*   **Bootloader offset:** No bootloader
*   **Communication interface:** Serial (on UART0 GPIO1/GPIO0)

Guarda y compila:
```bash
make -j4
```
Flashea utilizando el ID del Bootloader (USB temporal):
```bash
make flash FLASH_DEVICE=2e8a:0003
```
Una vez flasheado, la placa reiniciará, apagará el USB y comenzará a comunicarse exclusivamente mediante el puerto **Serial UART** (`/dev/serial0` o `/dev/ttyAMA0`).

### 4. Crear el `printer.cfg` en Mainsail
Abre Mainsail, edita el archivo `printer.cfg` e introduce la siguiente configuración que vincula los pines correctos de la Fly-Puppet, establece la cinemática mínima para evitar errores, y configura el motor del eje Z en la ranura principal:

```ini
[include mainsail.cfg]

[mcu]
serial: /dev/serial0
baud: 250000
restart_method: command

# =========== CINEMÁTICA ===========
[printer]
kinematics: cartesian
max_velocity: 100
max_accel: 500

# =========== EJES FALSOS (Para engañar a Klipper) ===========
[stepper_x]
step_pin: gpio20
dir_pin: gpio19
enable_pin: !gpio18
microsteps: 16
rotation_distance: 40
endstop_pin: ^gpio22
position_endstop: 0
position_max: 200

[stepper_y]
step_pin: gpio16
dir_pin: gpio15
enable_pin: !gpio14
microsteps: 16
rotation_distance: 40
endstop_pin: ^gpio23
position_endstop: 0
position_max: 200

# =========== MOTOR Z (EL REAL) ===========
[stepper_z]
step_pin: gpio12
dir_pin: gpio11
enable_pin: !gpio10
microsteps: 16
rotation_distance: 8    # Avanza 8mm por cada revolución. Ajustar según varilla roscada.
endstop_pin: !gpio24    # Pin del Endstop Z. (Quitar el ! si la lógica está invertida)
position_endstop: 0.0
position_max: 200
homing_speed: 10.0

# =========== DRIVER Z (TMC2209) ===========
[tmc2209 stepper_z]
uart_pin: gpio13
run_current: 0.800
stealthchop_threshold: 999999

# === RUTAS REQUERIDAS DE MAINSAIL ===
[virtual_sdcard]
path: /home/pi/printer_data/gcodes
on_error_gcode: CANCEL_PRINT
```
*(Nota: Hemos omitido `[mcu host]` para evitar errores si no se instala el proceso de MCU de Linux, dado que nuestra placa principal RP2040 tiene pines suficientes).*

### 5. Adaptar el Código Python de la Biopresora (`server.py`)
En el futuro, reescribiremos la lógica del servidor que controla directamente hardware, cambiando esas llamadas por peticiones HTTP a la API local de Moonraker (`7125`) para instruir a la impresora que envíe comandos GCode estándar como subir, bajar, encender luces o aplicar capas.
