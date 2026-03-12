# FFF / FDM Slicing Integration Roadmap

Este documento detalla los próximos pasos para profesionalizar la interfaz de BioFFF Studio en su vertiente de impresión por filamento (FDM).

## ✅ Fase 1: Adherencia y Estructura (Completado)
Implementación de controles para la base de la pieza y la arquitectura interna inicial.
- [x] **Skirt**: Control de vueltas (Loops) y distancia.
- [x] **Brim**: Control de ancho de ala para adherencia.
- [x] **Shells**: Control independiente de capas sólidas superiores (Top) e inferiores (Bottom).
- [x] **Infill Angle**: Control del ángulo de las pasadas de relleno.
- [x] **Sincronización Backend**: Los valores sobrescriben el `config.ini` en tiempo real.

---

## 🚀 Fase 2: Control de Velocidades (Completado)
Optimización del tiempo de impresión y calidad superficial diferenciando tipos de movimiento.
- [x] **First Layer Speed**: Velocidad reducida para asegurar la primera capa.
- [x] **Perimeter Speed**: Velocidades diferenciadas para perímetros internos (rápidos) y externos (calidad).
- [x] **Infill Speed**: Velocidad máxima para el relleno interno.
- [x] **Travel Speed**: Velocidad de movimientos en vacío (sin extrusión).
- [x] **Interfaz**: Nueva sección "Speeds" en el panel lateral.

---

## 🧪 Fase 3: Material y Retracciones (Completado)
Control del flujo y prevención de hilos (*stringing*).
- [x] **Retraction Length**: Distancia de retroceso del filamento.
- [x] **Retraction Speed**: Velocidad de retroceso y re-introducción.
- [x] **Extrusion Multiplier (Flow)**: Ajuste fino del caudal de material.
- [x] ~~**First Layer Flow**: Sobre-extrusión opcional para la base.~~ *(Unificado al multiplicador global)*
- [x] **Interfaz**: Nueva sección "Filament & Retraction".

---

## ❄️ Fase 4: Enfriamiento (Cooling) (Completado)
Esencial para detalles pequeños y puentes (*bridges*).
- [x] **Fan Always On**: Toggle para control del ventilador de capa.
- [x] **Min/Max Fan Speed**: Rangos de potencia del ventilador.
- [x] **Disable Fan First Layers**: Protección de la adherencia inicial.
- [x] **Interfaz**: Nueva sección "Cooling".

---

## 🎨 Fase 5: Soporte Multi-Extrusor / Cabezales (Completado)
Visualización y gestión de impresión con múltiples cabezales (toolheads) en archivos FDM.

### Lectura y Parseo de Modelos Multi-Extrusor
- [x] **Soporte 3MF multi-extrusor**: Parseo correcto de archivos `.3mf` con múltiples componentes y asignación de extrusores por modelo.
- [x] **Soporte AMF**: Lectura y extracción de metadatos de extrusor (`extruder` attribute) en archivos `.amf`.
- [x] **Backend (`server.py`)**: Nuevo endpoint y lógica para extraer el campo `extruder` de modelos dentro de archivos 3MF/AMF y retornarlo al frontend.

### Panel de Capas (Layers Panel)
- [x] **Icono de cabezal por modelo**: Cada modelo en el árbol de LayersPanel muestra el número de extrusor asignado (T0, T1, T2…) como badge visual junto al nombre.
- [x] **AccordionSection actualizado**: El componente `AccordionSection` acepta y renderiza la propiedad `extruder` de forma compacta y legible.

### Viewport 3D
- [x] **Colores por extrusor en el viewport**: Cada modelo se renderiza en Three.js con el color asociado a su extrusor asignado (paleta diferenciada por toolhead).
- [x] **Override de selección**: El color del modelo seleccionado tiene prioridad sobre el color de extrusor, manteniendo la retroalimentación visual de selección.
- [x] **Paleta de colores**: Implementada paleta de 8 colores diferenciados (`#E74C3C`, `#3498DB`, `#2ECC71`, `#F39C12`…) para identificar hasta 8 extrusores distintos.

### Panel de Toolhead (ToolheadPanel)
- [x] **ToolheadPanel**: Panel de configuración de parámetros por cabezal (nozzle diameter, filament diameter, temperatura, etc.) con soporte para múltiples toolheads.
- [x] **Tipos actualizados (`types.ts`)**: Definición de `ToolheadConfig` con los campos necesarios para multi-extrusor.

### Calidad y Tests
- [x] **Script de prueba (`test_amf.py`)**: Script de validación para verificar la correcta lectura de archivos AMF multi-extrusor y la extracción de datos por extrusor.
- [x] **Archivos de prueba**: Incluidos `test_multi.3mf`, `test_multi.amf`, `test_multi.gcode` e `test_multi.ini` como fixtures de referencia.

---

## 🧬 Fase 6: Multi-Tool Scaffold (En Progreso)
Asignación de herramientas por feature dentro de un mismo modelo (scaffold), permitiendo combinar distintos cabezales para perímetros, relleno, capas sólidas y soportes.

### Tipos y Modelo de Datos
- [x] **`ScaffoldToolMapping`**: Nueva interfaz con mapeo `perimeter`, `infill`, `solidInfill`, `support` → `ToolheadId`.
- [x] **`ModelData.scaffoldTools`**: Campo opcional en el modelo, retrocompatible con el modo single-tool existente.

### Interfaz de Usuario (ToolheadPanel)
- [x] **Toggle Single / Scaffold**: Botón por modelo para alternar entre asignación única y modo scaffold.
- [x] **Dropdowns per-feature**: 4 selectores independientes (Perimeters, Infill, Solid Fill, Support) con iconos y colores por herramienta.
- [x] **Reordenación de tabs**: Tools es ahora la primera pestaña del panel de configuración.

### Backend (server.py)
- [x] **Per-feature extruder INI keys**: Se escriben `perimeter_extruder`, `infill_extruder`, `solid_infill_extruder`, `support_material_extruder` en el config.ini generado por job.
- [x] **Mapeo toolhead → extruder**: Reutiliza la tabla `fdm=1, syringe=2, uv=3`.
- [x] **G-code Injection**: Forzados comandos `T0`, `T1`, `T2` explícitos vía `toolchange_gcode`.
- [x] **Conflict Resolution**: Implementada jerarquía de prioridad (**Layer Schedule > Scaffold Mapping**) mediante filtrado post-slice.

### Frontend
- [x] **Metadata ampliada**: `scaffoldTools` se envía al backend como parte de `models_metadata`.
- [x] **UX Priority**: Reordenadas pestañas: Schedule (Programación) como pestaña principal.

---

## 🛠️ Notas de Seguimiento
- **Importante**: Todas las configuraciones nuevas deben mantener la lógica de validación preventiva (ej: advertencia si `layer_height` > `nozzle_diameter`).
- **Coordenadas**: Mantener el offset de -50/-50 en el preview de G-code para asegurar posicionamiento absoluto.
- **Scaffold mode**: La asignación per-feature de PrusaSlicer es global (no por modelo). Si se necesita per-modelo en el futuro, se requerirá slicing separado + merge de G-code.
