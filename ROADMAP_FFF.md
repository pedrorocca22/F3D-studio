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

## 🛠️ Notas de Seguimiento
- **Importante**: Todas las configuraciones nuevas deben mantener la lógica de validación preventiva (ej: advertencia si `layer_height` > `nozzle_diameter`).
- **Coordenadas**: Mantener el offset de -50/-50 en el preview de G-code para asegurar posicionamiento absoluto.
