# 🧬 DLP3 Bioprinter — Control System

> Sistema de control completo para impresora DLP de bioresinas, con slicer integrado, control de irradiancia por escala de grises y monitorización en tiempo real.

---

## 📐 Arquitectura del Sistema

```mermaid
graph TB
    subgraph PC["💻 PC — Estación de Control"]
        direction TB
        FE["🖥️ Frontend<br/>React + Three.js<br/>:5173"]
        BE["⚙️ Backend Flask<br/>server.py<br/>:8000"]
        PS["🔪 PrusaSlicer CLI<br/>Export SLA / .sl1"]
        PM["🖨️ PrintManager<br/>print_manager.py"]
        CAL["📊 CalibrationManager<br/>tools/calibration_gray.json"]
        PAT["🎨 PatternEngine<br/>pattern_engine.py"]

        FE -- "POST /slice_scene<br/>STL + scene_json" --> BE
        BE -- "transform STL<br/>numpy-stl" --> PS
        PS -- "job.sl1 (ZIP)" --> BE
        BE -- "GET /job/:id/layer/:png" --> FE
        BE --> PM
        PM --> CAL
        BE --> PAT
    end

    subgraph RPI["🍓 Raspberry Pi — Nodo de Impresora"]
        direction TB
        RPIS["🌐 Flask Server<br/>rpi_node/server.py<br/>:5000"]
        PROJ["📽️ Projector Driver<br/>DLP UV Projector"]
        MOT["⚙️ Motor Driver<br/>Z-axis Stepper"]
    end

    PC -- "HTTP REST<br/>(LAN / WiFi)" --> RPI
    PM -- "display_image_bytes<br/>printer_client.py" --> RPIS
    RPIS --> PROJ
    RPIS --> MOT
```

---

## 🔄 Flujo de Slicing

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend (React)
    participant BE as Backend (Flask)
    participant STL as STL Transform
    participant PS as PrusaSlicer CLI
    participant JOB as Job Manifest

    User->>FE: Carga STL, configura parámetros
    User->>FE: Pulsa "Slice"
    FE->>BE: POST /slice_scene<br/>(files[] + scene_json)
    
    loop Por cada objeto en la escena
        BE->>STL: transform_stl_to_scene()<br/>Rotación + Escala + Posición
        Note over STL: 1. Centrar en origen (Z-up)<br/>2. RotX(-90) → espacio Three.js<br/>3. Aplicar rotación usuario<br/>4. RotX(+90) → volver a Z-up<br/>5. Escalar<br/>6. Posicionar en cama
        STL-->>BE: placed.stl
    end

    BE->>PS: --export-sla placed.stl<br/>--dont-arrange
    PS-->>BE: job.sl1 (ZIP con PNGs)
    
    opt Hay modificadores de patrón
        BE->>BE: PatternEngine.apply_modifiers()<br/>shell/core, gradiente, voronoi
    end

    BE->>JOB: Crea job.json con manifest
    BE-->>FE: { job_id, url }
    FE->>BE: GET /job/:id/manifest.json
    BE-->>FE: Lista de capas + tiempos
    FE->>FE: Muestra preview de capas
```

---

## 🖨️ Flujo de Impresión

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant PM as PrintManager
    participant CAL as CalibrationManager
    participant RPI as RPi Node

    User->>FE: Start Print
    FE->>PM: POST /start_print/:job_id
    PM->>RPI: initialize() — setup proyector
    
    loop Cada capa
        PM->>PM: Leer capa del job.json
        PM->>RPI: Peel (tiempo Z)
        
        alt Modo Grayscale (calibrado)
            PM->>CAL: get_gray_for_irradiance(irr)
            CAL-->>PM: gray_val (0–255)
            PM->>PM: Modular PNG: pixel × (gray/255)
        else Sin calibración
            PM->>PM: PNG sin modificar (255)
        end
        
        PM->>RPI: display_image_bytes(png)
        PM->>RPI: expose(exposure_time_s)
    end

    PM->>RPI: stop_projector()
    PM-->>FE: state = COMPLETED
```

---

## 🗂️ Estructura del Proyecto

```
dlp3-main/
├── 📄 server.py              # Backend Flask principal (slicing, rutas API)
├── 📄 print_manager.py       # Control de impresión + CalibrationManager
├── 📄 printer_client.py      # Cliente HTTP hacia Raspberry Pi
├── 📄 pattern_engine.py      # Motor de patrones (shell/core, voronoi, gradiente)
├── 📄 config.ini             # Configuración del slicer (dimensiones, material)
├── 📄 start.bat              # Lanzador Windows (Backend + Frontend)
│
├── 🖥️ App.tsx                # React App principal (manejo de estado global)
├── 📄 types.ts               # Interfaces TypeScript compartidas
├── 📄 index.tsx / index.html # Entry point del frontend
│
├── 📁 components/
│   ├── Viewport/
│   │   ├── Viewport.tsx      # Visor 3D (Three.js / R3F), herramientas transform
│   │   └── ModifiersPanel.tsx
│   ├── Sidebar.tsx           # Panel lateral (settings por objeto)
│   ├── LayersPanel/          # Panel de capas avanzadas
│   ├── SlicePreview.tsx      # Vista previa de capas sliceadas
│   ├── PrintMonitor.tsx      # Monitor de impresión en tiempo real
│   └── CalibrationTool.tsx   # Herramienta de calibración de irradiancia
│
├── 📁 tools/
│   ├── calibration_gray.json # Tabla irradiancia ↔ valor gris (calibración real)
│   └── calibrate_grayscale.py # Script para realizar la calibración
│
├── 📁 rpi_node/              # Código que corre en la Raspberry Pi
│   ├── server.py             # Flask API del nodo RPi (:5000)
│   ├── projector_driver.py   # Driver del proyector DLP UV
│   ├── motor_driver.py       # Driver del motor Z (stepper)
│   └── gray_scales/          # Imágenes de calibración
│
├── 📁 PrusaSlicer-2.9.3/     # Motor de slicing (no en git)
├── 📁 .venv/                 # Entorno Python (no en git)
└── 📁 node_modules/          # Dependencias Node (no en git)
```

---

## ⚙️ Sistema de Coordenadas

```mermaid
graph LR
    subgraph STL["STL (Z-up)"]
        S1["X → Derecha<br/>Y → Profundidad<br/>Z → Arriba"]
    end
    subgraph Three["Three.js (Y-up)"]
        T1["X → Derecha<br/>Y → Arriba<br/>Z → Cámara/Profundidad"]
    end
    subgraph Slicer["Slicer / Cama (Z-up)"]
        P1["X → Ancho cama (71.11mm)<br/>Y → Profundidad cama (40mm)<br/>Z → Altura impresión (76mm)"]
    end

    STL -- "RotX(-90)<br/>Three.js carga el STL" --> Three
    Three -- "Rotaciones usuario<br/>en TransformData" --> Three
    Three -- "RotX(+90)<br/>Backend (transform_stl_to_scene)" --> Slicer
```

### Tabla de mapeo de ejes

| TransformData (Frontend) | Three.js | Slicer (Backend) |
|:---|:---:|:---:|
| `position.x` | X | X (ancho, mm) |
| `position.y` | Z | Y (profundidad, mm) |
| `position.z` | Y | Z (altura, mm) |
| `rotation.x` | rotX | rotX |
| `rotation.y` | rotZ | rotZ (swap) |
| `rotation.z` | rotY | rotY (swap) |
| `scale.x` | scaleX | scaleX |
| `scale.y` | scaleZ | scaleY (swap) |
| `scale.z` | scaleY | scaleZ (swap) |

---

## 🌡️ Calibración de Irradiancia

El proyector UV usa **escala de grises** para modular la irradiancia:

```mermaid
graph LR
    A["Irradiancia objetivo<br/>(mW/cm²)"] --> B["CalibrationManager<br/>get_gray_for_irradiance()"]
    B --> C["Interpolación lineal<br/>en calibration_gray.json"]
    C --> D["Valor gris 0–255"]
    D --> E["Modular imagen PNG<br/>pixel × gray/255"]
    E --> F["Proyectar imagen<br/>PWM fijo = 700"]
```

- **Rango calibrado**: 0.03 – 21.3 mW/cm²
- **Archivo de calibración**: `tools/calibration_gray.json`
- **Herramienta de calibración**: `tools/calibrate_grayscale.py`

---

## 🚀 Inicio Rápido

### 1. Primera vez en una PC nueva

```powershell
# Clonar el repositorio
git clone https://github.com/pedrorocca22/dlp3-main2.git
cd dlp3-main2

# Crear entorno Python
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# Instalar dependencias Node
npm install

# Copiar manualmente PrusaSlicer-2.9.3/ a la raíz del proyecto
```

### 2. Lanzar el sistema

```powershell
# Opción A: Script automático (Windows)
start.bat

# Opción B: Manual (dos terminales)
# Terminal 1 — Backend
.\.venv\Scripts\activate
python server.py

# Terminal 2 — Frontend
npm run dev
```

| Servicio | URL |
|:---|:---|
| Frontend (UI) | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| RPi Node (en RPi) | http://\<rpi_ip\>:5000 |

### 3. Configurar IP de la Raspberry Pi

Editar `config.ini`, sección `[Hardware]`:
```ini
[Hardware]
rpi_ip = 192.168.137.148
```

---

## 📡 API del Backend

| Método | Ruta | Descripción |
|:---:|:---|:---|
| `GET` | `/` | Estado del servidor + dimensiones |
| `POST` | `/slice_scene` | Lanzar slicing de la escena completa |
| `GET` | `/job/<id>/manifest.json` | Manifest del trabajo (capas, tiempos) |
| `GET` | `/job/<id>/layer/<name>` | Servir PNG de capa (on-demand, desde ZIP) |
| `POST` | `/start_print/<job_id>` | Iniciar impresión |
| `POST` | `/pause_print` | Pausar impresión |
| `POST` | `/resume_print` | Reanudar impresión |
| `POST` | `/stop_print` | Detener impresión |
| `GET` | `/print_status` | Estado actual del PrintManager |
| `GET` | `/projector_info` | Info del proyector (via RPi proxy) |

---

## 📦 Dependencias

### Backend Python

| Paquete | Uso |
|:---|:---|
| `flask` + `flask-cors` | API REST |
| `numpy-stl` | Transformar geometría STL |
| `numpy` | Álgebra matricial, manipulación de imágenes |
| `Pillow` | Procesado de PNGs por capas |
| `opencv-python` | Generación de patrones (voronoi, texturas) |
| `requests` | Comunicación HTTP con Raspberry Pi |

### Frontend Node

| Paquete | Uso |
|:---|:---|
| `react` | Framework UI |
| `@react-three/fiber` + `drei` | Viewport 3D |
| `three` | Motor 3D WebGL |
| `three-stdlib` (STLLoader) | Carga de archivos STL |
| `jszip` | Lectura de archivos .sl1 en el navegador |
| `vite` | Build tool y dev server |

---

## 🔧 Dimensiones de la Máquina

| Parámetro | Valor |
|:---|:---|
| Ancho de cama (X) | 71.11 mm |
| Profundidad de cama (Y) | 40.00 mm |
| Altura máxima de impresión (Z) | 76 mm |
| Resolución proyector | 2560 × 1440 px |
| Tamaño de pixel | ~27.8 µm |
| PWM fijo (modo grayscale) | 700 |

---

## 🔄 Flujo de Trabajo Git

```mermaid
gitGraph
   commit id: "Estado inicial"
   branch feature
   checkout feature
   commit id: "Desarrollo en PC-A"
   commit id: "Más cambios"
   checkout main
   merge feature id: "git push origin main"
   branch pc-b
   checkout pc-b
   commit id: "git pull en PC-B"
   commit id: "Desarrollo en PC-B"
   checkout main
   merge pc-b id: "Push desde PC-B"
```

```powershell
# Al llegar a la PC
git pull origin main

# Al terminar el día
git add .
git commit -m "feat: descripción de los cambios"
git push origin main
```

---

*Generado el 2026-02-20 · DLP3 Bioprinter Control System*
