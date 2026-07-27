# Pore Injection — protocolo científico y preflight

## Diagnóstico

Pore Injection ya puede detectar celdas GRID después del slicing, dibujar un mapa 3D y generar bloques de G-code. El problema es que esas capacidades están acopladas al resultado del slicer: antes de generar el G-code el usuario no tiene un contrato claro sobre qué volumen se solicita, qué volumen está disponible, qué calibración se está usando ni qué riesgos impedirían enviar el trabajo a la impresora.

El objetivo no es añadir una segunda aplicación de simulación, sino convertir los datos que ya produce BioFFF Studio en un protocolo reproducible y auditable.

## Políticas de decisión

1. **Preflight antes de G-code.** El sistema debe poder rechazar o advertir antes de crear un archivo ejecutable.
2. **Una fuente de verdad por magnitud.** La detección geométrica y el mapa final deben provenir del mismo análisis que alimenta el G-code.
3. **Calibración explícita.** `µL/mm` depende de la combinación bioink + syringe head + tip; nunca debe inferirse silenciosamente desde un valor genérico.
4. **Seguridad por defecto.** Un límite incierto, una colisión no resuelta o un dry-run pendiente bloquean el envío a Moonraker, pero no impiden explorar el proyecto.
5. **Trazabilidad.** El manifest debe guardar configuración, calibración, conteo de poros, volumen solicitado/disponible, advertencias y resultado del dry-run.

## Flujo objetivo

```text
Configurar bioink/tip/calibración
        ↓
Preflight geométrico (GRID, celdas, volumen, límites, colisiones)
        ↓
Preview: mapa de poros + volumen solicitado vs disponible
        ↓
Generar G-code de simulación
        ↓
Validar G-code (tools, cambios, depósito, alturas, dry-run)
        ↓
Autorizar y enviar a Moonraker
```

## Fases

### Fase 1 — contrato preflight y preview

- `PoreProtocolPreflight` común para UI, backend y manifest.
- Estado explícito: `ready`, `warning`, `blocked`.
- Conteo de poros, volumen disponible, volumen solicitado y margen.
- Preview 3D/2D antes de autorizar la impresión.

### Fase 2 — calibración y límites

- Perfil de calibración por bioink + tip + syringe head.
- Factor `µL/mm`, rango operativo y volumen máximo por depósito.
- Límites de velocidad, profundidad, presión y volumen acumulado.

### Fase 3 — seguridad mecánica

- Comprobación de envelope XY contra la cama y zonas de wells.
- Comprobación de profundidad Z, retracciones y saltos seguros.
- Detección de cambios de toolhead incompatibles y colisiones con geometría/bed.

### Fase 4 — dry-run y autorización

- Dry-run sin extrusión/depósito, conservando movimientos y cambios de herramienta.
- Resultado guardado en el manifest.
- El botón de Moonraker queda bloqueado hasta que el dry-run sea válido y el usuario confirme el protocolo.

## Criterios de aceptación

- El usuario puede revisar el mapa de poros y el balance de volumen antes de enviar el trabajo.
- El sistema identifica qué bioink, tip, toolhead y calibración han producido el plan.
- Un volumen solicitado mayor que el disponible es bloqueante.
- Una calibración ausente o un límite excedido es bloqueante para imprimir, pero no para editar.
- Un G-code con retorno a un toolhead no asignado es bloqueante.
- El dry-run deja un resultado reproducible y asociado al job.
