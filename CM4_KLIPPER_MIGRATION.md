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
Recomendación: En lugar de Raspberry Pi OS puro, instálale **MainsailOS** usando la herramienta oficial Raspberry Pi Imager. MainsailOS ya incluye: Klipper, Moonraker, Mainsail (Interfaz web útil para la calibración del Z).

### 2. Conexión Hardware y Firmware (Klipper)
* Conectar la CM4 a la board Mellow.
* Compilar el firmware de klipper en el SSH del CM4 (`make menuconfig` / `make`) asegurando arquitectura correcta para el MCU de Mellow.
* Flashear el firmware a la Mellow.

### 3. Crear el `printer.cfg`
Definir los pines que controlan el Stepper del Z, los endstops y el Pin de Relay (o Mosfet) para la fuente de luz UV.

### 4. Adaptar `rpi_node/server.py` o Modificar `server.py`
Reescribiremos la lógica del servidor que controla directamente hardware, cambiando esas llamadas por peticiones HTTP a la API local de Moonraker.
