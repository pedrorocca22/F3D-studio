# BioFFF Studio — Auditoría de Recomendaciones

> **Generado:** 2026-04-20  
> **Estado actual:** Sistema funcional con pipeline completo (STL → Slice → G-code → Preview → Print).  
> **Metodología:** Revisión estática de código fuente, sin ejecución.

---

## Resumen Ejecutivo

El proyecto está en un estado sólido. La arquitectura de pasos (Step 1→6), el motor de Z-Zones y la integración PrusaSlicer + Klipper son puntos fuertes diferenciales. Las mejoras identificadas son principalmente UX/UI y deuda técnica menor — nada arquitecturalmente crítico.

---

## 🔴 Bugs Funcionales (Alta Prioridad)

### BUG-01 — `onPrint` no hace nada
- **Fichero:** `App.tsx:898`
- **Problema:** El callback `onPrint` que se pasa a `LayersPanel` contiene solo un `console.log`. Si el usuario pulsa el botón de impresión en el Step 6, no ocurre ninguna acción real.
- **Fix:** Conectar con el endpoint de envío a Moonraker/Klipper.

```tsx
// Actual (inoperativo)
onPrint={() => console.log("Printing job:", gcodePreviewJob?.jobId)}

// Propuesta
onPrint={() => handleSendToPrinter(gcodePreviewJob?.jobId)}
```

---

### BUG-02 — `calculatedTotalLayers` aplica doble escalado en Z
- **Fichero:** `App.tsx:841`
- **Problema:** `m.size.z` ya include el scale (lo calcula `onUpdateModelSize` en Viewport), pero se vuelve a multiplicar por `scale.z`. Resultado: layers incorrectas cuando Z-scale ≠ 1.

```tsx
// Actual — DOBLE ESCALADO
const maxModelHeight = Math.max(...models.map(m => (m.size?.z ?? 0) * (m.transform.scale.z ?? 1)), 0);

// Fix — size.z ya está en espacio mundo
const maxModelHeight = Math.max(...models.map(m => m.size?.z ?? 0), 0);
```

---

### BUG-03 — Polling de slicing sin timeout global
- **Fichero:** `App.tsx:636`
- **Problema:** El `setInterval` del polling de progreso no tiene timeout máximo. Si el backend se cuelga en un estado ni `done` ni `error`, el cliente sondea indefinidamente.
- **Fix:** Añadir un contador de intentos o timeout de ~10 minutos.

```tsx
let attempts = 0;
const MAX_ATTEMPTS = 750; // 10 min @ 800ms
const poll = setInterval(async () => {
  if (++attempts > MAX_ATTEMPTS) {
    clearInterval(poll);
    reject(new Error('Slice timeout: backend did not respond'));
    return;
  }
  // ... lógica de polling existente
}, 800);
```

---

### BUG-04 — `MULTIWELL_SPECS` duplicado
- **Ficheros:** `Viewport.tsx:123` (copia local) y `constants/wellplate.ts` (fuente canónica)
- **Problema:** Los dos objetos deben mantenerse sincronizados manualmente. Un cambio de especificación en uno no se propaga al otro.
- **Fix:** Importar en `Viewport.tsx` desde `../../constants/wellplate`.

```tsx
// Eliminar de Viewport.tsx líneas 123-128 y añadir:
import { MULTIWELL_SPECS } from '../../constants/wellplate';
```

---

### BUG-05 — Dead code en `PrintMonitor.tsx`
- **Fichero:** `PrintMonitor.tsx:249-250`
- **Problema:** El fichero remata con un bloque `); };` extra después del `return` del componente. Residuo de un refactor incompleto, no rompe el build pero confunde.
- **Fix:** Eliminar las líneas 249-250.

---

### BUG-06 — URLs del backend hardcodeadas en 8+ sitios
- **Ficheros:** `App.tsx`, `Header.tsx`, `PrintMonitor.tsx`, `WifiConfig.tsx`...
- **Problema:** `http://127.0.0.1:8000` aparece literalmente en ~8 lugares. Un cambio de puerto requiere editar múltiples ficheros.
- **Fix:** Centralizar en un fichero `src/config.ts`.

```ts
// config.ts
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8000';
```

---

## 🟡 Deuda Técnica / Arquitectura

### ARCH-01 — `LayersPanel.tsx` es un monolito (107KB / 1717 líneas)
Contiene todos los 6 steps en un solo archivo. Refactorizar en componentes por step:
- `Step1_Environment.tsx` — Bed + Heating + Toolheads
- `Step2_Models.tsx` — Upload + gestión de models
- `Step3_Mapping.tsx` — Scaffold tool assignment
- `Step4_Settings.tsx` — FDM print parameters
- `Step5_Advanced.tsx` — Z-Zone editor
- `Step6_Slice.tsx` — Resumen + slice + print

### ARCH-02 — `Viewport.tsx` también monolítico (73KB / 1581 líneas)
Incluye: Build plate, Model rendering, GCode preview, Toolbar, Inspector, transform controls, cross-section, GCode viewer. La parte de GCode viewer debería estar en `GCodePreview/`.

### ARCH-03 — `App.tsx` como super-controller (944 líneas, 15+ handlers)
Candidato a usar `useReducer` + context parcial para las operaciones sobre modelos y Z-Zones.

### ARCH-04 — Idioma mixto en la UI
Panel mezcla español ("Modelos en Escena", "Bandeja Vacía") e inglés ("Machine Setup", "Bed Type"). Elegir uno consistentemente.

### ARCH-05 — Tipos legados de DLP3 en `types.ts`
`LayerSection`, `AdhesionSettings`, `ThermodynamicSettings`, `MotorControlSettings`, `SliceJobResponse`, `JobLayer`, `JobManifest` — interfaces del proyecto DLP3 que ya no se usan en BioFFF. Moverlas a `types.legacy.ts` o eliminarlas.

### ARCH-06 — `GlobalSettings` mezcla DLP y FDM
El tipo tiene `adhesion`, `thermodynamic`, `motor` (opcionales, nunca usadas en FDM) junto con `layerHeight`, `nozzleTemperature`, etc. Separar en interfaces o usar un discriminated union.

---

## 🟢 Mejoras Funcionales / UX

### UX-01 — Sin persistencia de sesión
Si el usuario recarga la página, pierde todos los modelos y el progreso del wizard.
- **Fix:** `localStorage` para `globalSettings` y `zZones`. Los modelos (File objects) no se pueden serializar — mostrar un aviso para recargarlos.

### UX-02 — Sin feedback cuando el backend no está disponible al arrancar
El header hace polling al status pero solo muestra "Offline" sin orientar al usuario.
- **Fix:** Banner de bienvenida o estado inicial explícito que explique cómo arrancar `server.py`.

### UX-03 — Validación del Step 1 bloquea modo exploración
Requiere asignar un toolhead para avanzar, lo que imposibilita explorar la UI sin hardware.
- **Fix:** Convertir a validación "soft" (warning) que no bloquee el flujo en modo demo.

### UX-04 — Sin modo offline
Si `server.py` no corre, la app es inútil. Un modo offline básico (cargar STL, ver viewport, configurar parámetros sin slicear) mejoraría el onboarding.

### UX-05 — Clone to Wells no valida el tamaño antes del diálogo
El aviso de "modelo muy grande para el pozo" solo aparece al ejecutar el Slice.
- **Fix:** Mostrar indicador de fit/overflow en el diálogo de selección de wells.

### UX-06 — Sin botón "Duplicate Zone" en el editor de Z-Zones
Solo hay "Add" y "Delete". Workflow común: clonar una zona base y ajustar rangos.

### UX-07 — Sin Undo/Redo
Cualquier borrado o cambio de configuración es irreversible. Implementar historial simple con Ctrl+Z para `models` y `zZones`.

---

## 🎨 Mejoras de UI/UX Visual

### UI-A — Header demasiado comprimido
`h-11` (44px) con texto de `10px`. El stepper de pasos en `11px` es difícil de leer en sesiones largas.
- **Fix:** `h-14`, fuente del stepper a `text-xs` (12px), wordmark a `text-sm`.

### UI-B — Paleta de colores de toolheads tiene baja diferenciación
```ts
// Actual — baja vibración, syringe casi gris
fdm:     '#2f6098'  // azul oscuro
syringe: '#586064'  // gris neutro ← casi indistinguible del texto
uv:      '#b71c1c'  // rojo agresivo

// Propuesta — vibrante y diferenciada
fdm:     '#2563eb'  // blue-600
syringe: '#059669'  // emerald-600
uv:      '#7c3aed'  // violet-600
none:    '#94a3b8'  // slate-400
```

### UI-C — Fondo del viewport demasiado claro
`bg-slate-100` hace que los modelos blancos/claros no destaquen.
- **Fix:** `bg-[#1e2024]` (canvas oscuro) o al menos `bg-slate-800` en modo oscuro.

### UI-D — Tarjetas de modelo en Step 2 sin border-radius
Las tarjetas usan `overflow-hidden` pero no tienen `rounded` explícito, dando estética cuadrada incoherente en una UI que usa `rounded-xl` y `rounded-lg`.

### UI-E — Accordions sin animación de apertura ✅ *APLICADO*
El contenido aparece instantáneamente. Añadir transición CSS suave.

### UI-F — `NumericInput` sin estados visuales de hover/focus ✅ *APLICADO*
El wrapper y los botones no muestran ningún feedback visual al hacer hover/focus.

### UI-G — Empty state del Viewport sin guía de onboarding ✅ *APLICADO*
Cuando no hay modelos, el viewport muestra solo el grid 3D vacío. Añadir overlay de bienvenida con instrucciones.

### UI-H — Backdrop blur inconsistente entre modales
Algunos overlays usan `backdrop-blur-sm`, otros no. Unificar.

### UI-I — `PrintMonitor` usa hex hardcodeados que no respetan dark mode ✅ *APLICADO*
`getStateColor()` retorna `'#2f6098'`, `'#b71c1c'`... fuera del design system de Tailwind.

### UI-J — Sin indicador visual global de modo G-code ✅ *APLICADO*
Cuando se activa el preview del G-code, no hay ningún banner o borde distintivo que indique que se ha abandonado el modo edición.

### UI-K — Tipografía del Step 6 (Slice) muy pequeña
El resumen antes de slice usa `text-[8px]` y `text-[9px]` para información crítica.

### UI-L — Las pestañas Inspector/Gcode son casi invisibles
Píldoras de `text-[9px]` con poco contraste. Serían más usables con iconos y mayor tamaño.

---

## 📋 Tabla de Prioridades Consolidada

| ID | Tipo | Descripción | Esfuerzo | Impacto | Estado |
|----|------|-------------|----------|---------|--------|
| BUG-01 | 🔴 Bug | `onPrint` no conectado | Bajo | Alto | Pendiente |
| BUG-02 | 🔴 Bug | Doble escalado Z en `calculatedTotalLayers` | Bajo | Alto | Pendiente |
| BUG-03 | 🔴 Bug | Polling sin timeout | Bajo | Medio | Pendiente |
| BUG-04 | 🟡 Arch | `MULTIWELL_SPECS` duplicado | Bajo | Bajo | Pendiente |
| BUG-05 | 🔴 Bug | Dead code `PrintMonitor` | Mínimo | Bajo | Pendiente |
| BUG-06 | 🟡 Arch | URLs hardcodeadas | Bajo | Medio | Pendiente |
| ARCH-01 | 🟡 Arch | Refactorizar `LayersPanel.tsx` | Alto | Medio | Pendiente |
| UX-01 | 🟢 UX | Persistencia en `localStorage` | Medio | Alto | Pendiente |
| UX-07 | 🟢 UX | Undo/Redo básico | Alto | Alto | Pendiente |
| UI-A | 🎨 UI | Header más generoso y legible | Bajo | Medio | ✅ Aplicado |
| UI-B | 🎨 UI | Paleta toolhead más diferenciada | Bajo | Medio | ✅ Aplicado |
| UI-C | 🎨 UI | Fondo viewport canvas oscuro | Bajo | Bajo | ✅ Aplicado |
| UI-D | 🎨 UI | Border-radius tarjetas modelo | Bajo | Bajo | ✅ Aplicado |
| UI-E | 🎨 UI | Animación acordeones | Bajo | Medio | ✅ Aplicado |
| UI-F | 🎨 UI | NumericInput hover/focus | Bajo | Bajo | ✅ Aplicado |
| UI-G | 🎨 UI | Empty state Viewport | Bajo | Medio | ✅ Aplicado |
| UI-I | 🎨 UI | PrintMonitor colores design system | Bajo | Bajo | ✅ Aplicado |
| UI-J | 🎨 UI | Indicador modo G-code | Bajo | Medio | ✅ Aplicado |
| UI-L | 🎨 UI | Pestañas Inspector más legibles | Bajo | Bajo | ✅ Aplicado |

---

## ✅ Lo que funciona bien (no tocar)

- **Pipeline de slicing completo** — STL → PrusaSlicer → G-code → preview funciona correctamente
- **Sistema de Z-Zones** — visualización en panel lateral + Viewport 3D es elegante y correcta
- **Build plate visual procedural** — vidrio, petri dish y multiwell en Three.js están bien ejecutados
- **`slicingParamsHash` / smart auto-reset** — muy buen detalle para evitar resets innecesarios
- **`AccordionSection`** — componente reutilizable bien estructurado
- **HelpWiki contextual** — feature diferenciadora y bien contenida
- **Shader GLSL por segmentos** — colorización por segmento de altura en el modelo 3D, técnicamente impresionante
- **`planResolver.ts`** — lógica de resolución de capas normalizada, sólida y testeable
- **Clone to Wells** — workflow de clonación por pocillo es una feature única y muy útil
