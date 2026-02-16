# DLP3 Bioprinter - Documentación del Proyecto

## Descripción General

Sistema de bioimpresión 3D basado en tecnología DLP (Digital Light Processing) usando el controlador **DLPC1438** de Texas Instruments con un DMD **DLP300S/DLP301S** (0.3", 1280×720, 3.6 megapíxeles).

El sistema permite la fotopolimerización controlada de hidrogeles (GelMA, PEGDA, etc.) mediante proyección UV con control preciso de irradiancia por píxel.

---

## Arquitectura del Sistema

```
┌─────────────────────┐     HTTP/REST      ┌──────────────────────┐
│   PC (Windows)      │ ←────────────────→ │  Raspberry Pi Zero 2W│
│                     │   192.168.137.164   │                      │
│  - Flask Server     │                    │  - Flask Server (:5000)│
│  - React Frontend   │                    │  - ProjectorDriver    │
│  - PrintManager     │        I2C         │  - DLPC1438 Controller│
│  - Slicer           │  ←──────────────→  │  - MotorDriver        │
│                     │        SPI         │                      │
└────────┬────────────┘                    └──────────────────────┘
         │ USB/Serial (COM5)
         │ 115200 baud
┌────────┴────────────┐
│  Arduino + Sensor   │
│  (Irradiance Meter) │
│  Reads mW/cm²       │
└─────────────────────┘
```

### Componentes Hardware

| Componente | Descripción | Conexión |
|-----------|-------------|----------|
| DLPC1438 | Controlador DLP de TI | I2C + SPI desde RPi |
| DLP300S/DLP301S | DMD (Digital Micromirror Device) | Sub-LVDS desde DLPC1438 |
| DLPA2000/3000 | PMIC/LED Driver | Controlado por DLPC1438 |
| RPi Zero 2W | Computadora de control | Ethernet USB (192.168.137.164) |
| Arduino | Sensor de irradiancia | USB Serial COM5 @ 115200 |
| Motor Z | Eje vertical (stepper) | /dev/ttyUSB0 en RPi |

### Parámetros Ópticos

#### DMD
- **Modelo**: DLP300S / DLP301S (0.3")
- **Resolución**: 1280 × 720 píxeles
- **Aspect Ratio**: 16:9

#### Distancia de Trabajo

La relación tamaño-distancia es lineal: `Tamaño / Distancia = constante (ángulo del lente)`

| Parámetro | Nominal (Datasheet) | Optimizado (Bioprinter) |
|-----------|--------------------|-----------------------|
| **Distancia de trabajo** | 141.3 mm | **78.5 mm** |
| Área de proyección | 128 × 72 mm | **71.1 × 40 mm** |
| Superficie | 9,216 mm² | 2,844 mm² |
| **Tamaño de píxel** | 100 µm | **55.5 µm** |
| **Irradiancia máxima** | ~6.5 mW/cm² | **~21.3 mW/cm²** |
| Factor de ganancia | 1× | **3.24×** |

#### Fórmula para calcular distancia personalizada

Para un lado corto deseado `L` (en mm):
```
Distancia (mm) = L × 141.3 / 72
Lado largo (mm) = L × 128 / 72 = L × 1.778
Pixel size (µm) = L / 720 × 1000
```

Ejemplo para L=40mm: distancia=78.5mm, lado largo=71.1mm, pixel=55.5µm

#### Notas
- La distancia se mide desde el **final del lente** hasta el **plano de trabajo** (superficie de impresión).
- Al reducir la distancia se gana irradiancia (misma luz, menor área) y resolución XY.
- Si se cambia la distancia, se debe **recalibrar** la irradiancia.

---

## Estructura de Archivos

```
dlp3-main/
├── server.py                    # Flask server principal (PC)
├── print_manager.py             # Gestión de impresión y calibración
├── calibrate_irradiance.py      # Calibración por PWM (legacy)
├── calibrate_grayscale.py       # Calibración por escala de grises ✅ NUEVO
├── test_projection.py           # Test rápido del proyector
├── calibration.json             # Datos calibración PWM (legacy)
├── calibration_gray.json        # Datos calibración greyscale ✅ NUEVO
├── _deploy_projector_info.py    # Script de despliegue a RPi
├── fetch_logs.py                # Obtener logs del servicio RPi
│
├── rpi_node/                    # Código que corre en la RPi
│   ├── server.py                # Flask API (endpoints REST)
│   ├── projector_driver.py      # Driver de alto nivel del proyector
│   ├── motor_driver.py          # Driver del motor Z
│   ├── focus_pattern.py         # Patrón de enfoque
│   ├── off.py                   # Apagar proyector
│   └── calibracion.png          # Imagen blanca para calibración PWM
│
├── Controller/
│   └── src/
│       └── UV_projector/
│           ├── controller.py    # Clase DLPC1438 (I2C/SPI)
│           └── img_convert.py   # Conversión de imágenes para SPI
│
├── dlpc1438.pdf                 # Datasheet del controlador
└── dlpu111.pdf                  # Guía del programador (comandos I2C)
```

---

## Registro I2C del DLPC1438 (Comandos Clave)

| Registro | Comando | Descripción |
|----------|---------|-------------|
| `0x06` | Write Operating Mode | STANDBY (0xFF), EXTERNALPRINT (0x06), TESTPATTERN (0x01) |
| `0x54` | Write LED PWM Current | 6 bytes: LED1(2B) + LED2(2B) + LED3(2B), little-endian, 10-bit |
| `0x55` | Read LED PWM Current | Lee PWM actual configurado |
| `0x5C` | Write LED Max PWM | Límite hardware de PWM por LED |
| `0x5D` | Read LED Max PWM | Lee límite hardware |
| `0xA8` | Write External Print Config | Byte1: Degamma (0x00=Linear, 0x01=Uniformity), Byte2: LED enable |
| `0xA9` | Read External Print Config | Lee configuración actual |
| `0xC1` | Write External Print Control | Start/Stop + Dark Frames + Exposed Frames |
| `0xC3` | Write Parallel Video | Habilita interfaz FPGA paralela |
| `0xC5` | Write Active Buffer | Selecciona buffer activo (0 o 1, double buffering) |
| `0xC8` | Write Actuator Orientation | Configuración de orientación de subframes |
| `0xCA` | Write FPGA Control | CRC, reset FPGA |

### Notas importantes del DLPC1438:
- **Exposed Frames = 0xFFFF** → exposición infinita (parar con comando Stop)
- **Se recomiendan ≥3 dark frames** antes de los exposed frames
- **SPI data a 30 MHz** (bajado de 125 MHz para estabilidad)
- **Transfer function Linear (0x00)**: pixel value 0→0, 128→128, 255→255
- **Solo 1 LED a la vez** (el software no soporta múltiples LEDs simultáneos)

---

## Modos de Control de Irradiancia

### Modo PWM (Legacy)
- Se varía el registro 0x54 (corriente del LED) de 0 a 700
- Imagen siempre blanca (255)
- Curva **no lineal**: 1.3 → 19 mW/cm²
- Susceptible a ruido y fluctuaciones térmicas

### Modo Greyscale (Nuevo - Recomendado) ✅
- PWM fijado al máximo (700)
- Se varía el valor de gris de la imagen (0-255)
- El DMD modula la luz temporalmente (bit-plane dithering a ~60Hz)
- Curva **lineal**: 0.03 → 21.27 mW/cm²
- ~0.083 mW/cm² por unidad de gris
- **Control por píxel** → permite porosidades variables

### Cómo genera grises el DMD:
El DMD es binario (espejo ON/OFF). Los 256 niveles se logran dividiendo cada frame (~16.7ms a 60Hz) en 8 sub-frames con duraciones ponderadas (1, 2, 4, 8, 16, 32, 64, 128). Un píxel con valor 128 tiene el espejo ON el 50% del tiempo.

---

## Etapas Completadas ✅

### 1. Comunicación RPi ↔ DLPC1438
- Driver I2C/SPI funcional (`controller.py`)
- Modos: STANDBY, EXTERNALPRINT, TESTPATTERN
- Double buffering SPI (buffer 0/1)
- Envío de imágenes al DMD vía SPI

### 2. Servidor RPi (Flask API)
- Endpoints para control del proyector, motor y calibración
- Inicialización automática del proyector al arrancar (`projector.initialize()`)
- Servicio systemd `dlp3-rpi` con restart automático
- Deploy automatizado desde PC (`_deploy_projector_info.py`)

### 3. Calibración de Irradiancia por PWM
- Script `calibrate_irradiance.py`
- Comunicación con Arduino (sensor) vía serial
- Exposición infinita (-1) controlada con time.sleep (frames finitos causan parpadeo)
- Generación de `calibration.json` con tabla PWM→Irradiancia

### 4. Calibración de Irradiancia por Greyscale ✅ NUEVO
- Script `calibrate_grayscale.py`
- PWM fijo a 700, varía gray value (0-255)
- Usa `set_background(gray)` + `swap_buffer()` para cada nivel
- Resultado: curva prácticamente lineal (0.03 → 21.27 mW/cm²)
- Generación de `calibration_gray.json`

### 5. Descubrimientos Técnicos
- **SPI a 30 MHz** (125 MHz causaba inestabilidad)
- **expose_pattern(-1)** es estable; frames finitos causan parpadeo
- **4 segundos de espera** entre pasos de calibración para estabilidad
- **Offset del sensor**: ~1.3-1.7 mW/cm² en modo PWM, ~0.03 en modo greyscale

### 6. Refactorización UI (React) ✅
- **Unified Inspector**: Panel lateral derecho unificado que consolida Información del Modelo, Transformaciones y Herramientas de Corte (Cross-Section).
- **Camera Controls**: Barra de herramientas de cámara centralizada en la parte inferior del Viewport.
- **Layout Flex**: Diseño robusto que elimina superposiciones, colocando el Canvas 3D y el Sidebar lado a lado.
- **Estética**: Estilo "Glassmorphism" con componentes de TailwindCSS y soporte Dark Mode.

---

## Etapas Pendientes 🔜

### 6. Integrar Greyscale en PrintManager ✅
- `CalibrationManager` ahora carga `calibration_gray.json` por defecto.
- Implementado `get_gray_for_irradiance(target_mw)` con interpolación lineal.
- Soporte para mezcla de imágenes en tiempo real durante la impresión.

### 7. Flujo de Impresión Greyscale ✅
- Implementado en el lado del PC (`PrintManager`) para maximizar rendimiento y evitar complejidad en RPi.
- El servidor RPi recibe la imagen final ya procesada (pixel values 0-255).
- Soporte para "Composite Layers": mezcla automática de objetos con diferente irradiancia en la misma capa física.
- Irradiancia variable controlada por píxel (Dose Control).

### 8. Slicer con Soporte Greyscale ✅
- `server.py` modificado para generar "Composite Layers" en lugar de secuencias.
- Detecta y agrupa objetos por irradiancia.
- Genera un manifiesto de trabajo (`job.json`) con metadatos `sources` para fusión en tiempo de impresión.
- Endpoint de visualización `/layer/<name>` mezcla dinámicamente las capas para preview en Frontend.

### 9. Calibración Fina (Pendiente de montaje robusto)
- Calibración de 1 en 1 (255 puntos) cuando el sensor tenga anclaje fijo
- Eliminará los picos de ruido por vibración
- Generar tabla definitiva para producción

### 10. Compensación de Uniformidad Óptica
- Medir la distribución de irradiancia en el plano focal
- Crear mapa de corrección por píxel
- Asegurar dosis uniforme en toda la superficie de impresión

### 11. Frontend (React con Vite)
- **Framework**: React 18 + TypeScript + Vite
- **Estilos**: TailwindCSS
- **3D Engine**: React Three Fiber (Three.js)
- **Componentes Clave**:
  - `Viewport`: Contenedor principal 3D.
  - `Model`: Renderizado de STLs con shaders personalizados para visualización de capas.
  - `Slicer`: Lógica de corte en cliente/servidor.

### 12. Investigación de Patrones Nativos (Hardware) 🔍
El controlador DLPC1438 y la FPGA tienen capacidades integradas para generar patrones de prueba sin enviar datos por SPI.
- **Objetivo**: Encontrar el comando para mostrar una **retícula (Grid)** nativa.
- **Pista**: El registro `0x67` controla el generador de patrones.
  - Byte 1: Habilitar (probablemente `0x03`).
  - Byte 2: ID del patrón (actualmente se usa `0x0B` en `test_FPGA`).
- **Acción**: Iterar valores del Byte 2 (`0x01`, `0x02`...) para identificar patrones útiles (Grid, Checkerboard, Full White) que sirvan para enfoque y calibración óptica sin depender de la RPi.

### 13. Arquitectura de Interfaz (Viewport)
El diseño se ha consolidado en una estructura de "Single Screen App" para maximizar el área de trabajo 3D.

#### Canvas Area
- Ocupa el espacio central/izquierdo.
- Contiene el `BuildPlate` y los modelos 3D.
- **Camera Bar**: Pill flotante inferior con accesos rápidos (ISO, TOP, FNT, RGT).

#### Inspector (Sidebar Derecho)
Panel fijo de 320px (`w-80`) que centraliza toda la manipulación:
1.  **Header**: Control global de modo de vista (Solid/Wireframe).
2.  **Model Info**: Tarjeta con metadatos del objeto seleccionado (Dimensiones, Settings).
3.  **Transform Tools**:
    - Selectores para Translate, Rotate, Scale.
    - Inputs numéricos precisos.
    - Herramientas de modificación: Arrange, Clone, Center.
4.  **Cross-Section**: Slider para inspección de capas internas (Clipping Plane).

### 14. Actualización de Hardware (Futuro) 🔮
Para mejorar la robustez y simplificar la electrónica, se planea una migración de hardware:


1.  **Placa Base**: Mellow Fly (o similar STM32/RP2040)
    - Reemplazo del driver de motor custom actual por una solución estándar de impresora 3D.
    - Soporte nativo para drivers TMC (Trinamic) silenciosos y precisos.
    - Gestión integrada de finales de carrera, ventiladores y neopíxeles.

2.  **Compute Module**: Raspberry Pi CM4
    - Reemplazo de la RPi Zero 2W.
    - Mayor potencia de procesamiento para manejar la interfaz web y la comunicación SPI simultáneamente.
    - Conexión directa a la placa base (vía carrier board o socket CM4 en placa Mellow).
    - Conectividad WiFi/Ethernet más estable.

3.  **Sensor UV Integrado (I2C Stemma QT)** ⚡
    - Sensor Específico: **SparkFun AS7331** (UVA/UVB/UVC).
    - **Conexión Confirmada (Schematic Rev 0.1)**:
        - Conector **J8** está ruteado al bus I2C1 (`GPIO2/SDA`, `GPIO3/SCL`).
        - Bus compartido con el DLPC1438.
        - Direcciones I2C: DLPC1438 (`0x1B`) vs AS7331 (`0x74`) -> **Sin Conflicto**.
    - **Acción**: Migrar el código del sensor de Arduino a Python (RPi) y conectar directamente.
    - **Beneficio**: Lectura digital directa de alta precisión sin conversión Serial-USB.

---

## API REST del Servidor RPi (Endpoints)

### Control del Proyector
| Método | Endpoint | Descripción | Body |
|--------|----------|-------------|------|
| POST | `/projector/force_init` | Reinicializar driver | - |
| POST | `/projector/expose` | Exponer patrón | `{"duration": 2.5}` |
| POST | `/projector/off` | Apagar (standby) | - |
| POST | `/projector/display` | Mostrar imagen (upload) | multipart file |
| GET | `/projector/info` | Info HW (PWM max, etc.) | - |

### Calibración
| Método | Endpoint | Descripción | Body |
|--------|----------|-------------|------|
| POST | `/calibration/setup` | Setup inicial | `{"pwm": 700, "mode": "grayscale"}` |
| POST | `/calibration/pwm` | Cambiar PWM (legacy) | `{"pwm": 350}` |
| POST | `/calibration/gray` | Cambiar gray value | `{"gray": 128}` |

### Motor
| Método | Endpoint | Descripción | Body |
|--------|----------|-------------|------|
| POST | `/motor/move_z` | Mover eje Z | `{"distance_mm": 0.1, "speed": 300}` |
| POST | `/motor/home` | Home eje Z | - |

### Sistema
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/status` | Estado del sistema |
| POST | `/init` | Inicializar todo |
| POST | `/shutdown` | Apagar hardware |

---

## Datos de Calibración Greyscale (15 Feb 2026)

Condiciones: PWM=700, SPI=30MHz, distancia=fija, sensor Arduino

| Gray | Irradiancia (mW/cm²) | Gray | Irradiancia (mW/cm²) |
|------|---------------------|------|---------------------|
| 0 | 0.03 | 130 | 10.88 |
| 5 | 0.53 | 135 | 13.55* |
| 10 | 0.87 | 140 | 11.69 |
| 15 | 1.28 | 145 | 12.13 |
| 20 | 1.70 | 150 | 12.54 |
| 25 | 2.09 | 155 | 12.96 |
| 30 | 2.55 | 160 | 13.37 |
| 35 | 2.95 | 165 | 13.77 |
| 40 | 3.38 | 170 | 12.68* |
| 45 | 3.80 | 175 | 14.62 |
| 50 | 4.03 | 180 | 15.01 |
| 55 | 5.57* | 185 | 11.55* |
| 60 | 5.06 | 190 | 15.87 |
| 65 | 5.46 | 195 | 16.25 |
| 70 | 5.88 | 200 | 16.67 |
| 75 | 6.29 | 205 | 17.09 |
| 80 | 6.73 | 210 | 17.51 |
| 85 | 7.12 | 215 | 17.92 |
| 90 | 7.56 | 220 | 18.37 |
| 95 | 7.96 | 225 | 18.74 |
| 100 | 8.31 | 230 | 19.16 |
| 105 | 8.79 | 235 | 19.58 |
| 110 | 9.25 | 240 | 20.00 |
| 115 | 9.67 | 245 | 20.42 |
| 120 | 10.05 | 250 | 20.86 |
| 125 | 10.46 | 255 | 21.27 |

*Valores marcados con * son outliers probablemente causados por vibraciones del sensor.

**Fórmula lineal aproximada**: `Irradiancia ≈ 0.083 × gray_value`

---

## Configuración de Conexión

| Parámetro | Valor |
|-----------|-------|
| RPi IP | 192.168.137.164 |
| RPi User | pi |
| RPi Password | pi |
| RPi Service | dlp3-rpi (systemd) |
| RPi Port | 5000 (Flask) |
| Arduino Port | COM5 (Windows) |
| Arduino Baud | 115200 |
| SPI Clock | 30 MHz |
| I2C Baud | 100 kHz |

---

## Despliegue

Para desplegar cambios a la RPi:
```bash
python _deploy_projector_info.py
```

Archivos desplegados (definidos en `_deploy_projector_info.py`):
- `rpi_node/server.py`
- `rpi_node/projector_driver.py`
- `rpi_node/focus_pattern.py`
- `rpi_node/off.py`
- `Controller/src/UV_projector/controller.py`
- `rpi_node/calibracion.png`

El script también reinicia el servicio `dlp3-rpi` automáticamente.

---

*Última actualización: 16 de Febrero de 2026*
