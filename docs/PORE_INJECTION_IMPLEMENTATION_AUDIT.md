# Auditoría de implementación y viabilidad de Pore Injection

Fecha: 27 de julio de 2026

## Diagnóstico

Pore Injection es actualmente un **postprocesador funcional de G-code**, pero
todavía no es un planificador de inserción físicamente cualificado. El sistema
detecta celdas GRID, calcula centroides, cambia a la jeringa y genera movimientos
de descenso, dosificación y retirada. Sin embargo, que exista una trayectoria
geométrica no demuestra que la punta real quepa en el poro, pueda alcanzar la
profundidad indicada, deposite el volumen solicitado o lo haga sin dañar el
scaffold, la punta o el bioink.

La interfaz mezcla hoy tres clases de datos sin distinguirlas:

1. parámetros que sí modifican el G-code;
2. datos que se guardan o se usan sólo en estimaciones;
3. atributos físicos que todavía no participan en ninguna validación.

La política adecuada es no presentar una orden de movimiento como “viable”. Una
operación sólo debería llamarse viable cuando pase, por separado, validaciones
geométricas, cinemáticas, de dosificación y de cualificación experimental.

## Implementación de esta iteración

Se tomó una decisión de alcance: Pore Injection sólo admite `layer_by_layer`.
La inyección se ejecuta inmediatamente después del infill de cada capa, cuando
el poro está abierto y accesible desde arriba. El modo `multilayer`, que exigía
penetrar un scaffold ya terminado, se retiró de la interfaz, del generador
activo y del contrato aceptado por frontend y backend.

El OD no es un requisito para este protocolo capa a capa. Los proyectos antiguos
que todavía contienen `multilayer` quedan bloqueados y muestran una acción
explícita para convertirlos, evitando reinterpretar silenciosamente un protocolo.
La profundidad queda limitada a la altura de la capa actual para que la operación
no se convierta accidentalmente en una inserción sobre capas ya consolidadas.

## Trazabilidad de los parámetros actuales

| Parámetro | Estado real | Efecto actual | Observación |
|---|---|---|---|
| Activación global o zonal | Implementado | Crea el protocolo para todo el scaffold o para una zona Z | Los ámbitos global y zonal son mutuamente excluyentes. |
| Modo `layer_by_layer` | Implementado | Inyecta después del infill interno de cada capa elegible | Deposita sobre la superficie de la capa, sin descenso Z. |
| Modo `multilayer` | Retirado | No genera G-code y el contrato lo bloquea | Se conserva únicamente como concepto diferido para investigación futura. |
| Syringe toolhead | Implementado | Emite el cambio de herramienta correspondiente | No verifica offsets, envolvente ni geometría montada. |
| Calibration µL/mm | Implementado | Convierte el volumen solicitado en desplazamiento E | Es una conversión volumétrica; no garantiza presión, flujo real ni repetibilidad. |
| Flow/Pore (µL) | Implementado en layer-by-layer | Define la dosis de cada celda | No se compara con capacidad local del poro real en el backend. |
| Penetration depth | Retirado | No se emiten movimientos Z de penetración | La protección del bottom shell sigue siendo bloqueante. |
| Injection Feedrate | Centralizado | Hereda la velocidad del actuador del Syringe head | No es presión ni caudal volumétrico medido. |
| Travel Feedrate | Centralizado | Hereda la velocidad global de viaje | No existe descenso vertical. |
| Cell Tolerance | Interno | Modifica la agrupación/detección de la cuadrícula | No se expone como parámetro de protocolo. |
| Min Cell | Interno | Descarta celdas geométricas menores | No se expone como parámetro de protocolo. |
| Tip ID | Parcial | Identifica la calibración y la visualización | El OD no es requisito mientras el protocolo permanezca capa a capa. |
| Nozzle diameter de jeringa | Parcial | Se carga desde el diámetro interior de la punta | No interviene en la autorización de la inserción. |
| Bioink seleccionado | Parcial | Trazabilidad y asociación de calibración | No existe modelo de viscosidad, shear-thinning, temperatura o presión requerida. |
| Capacidad de jeringa | Parcial | Compara volumen solicitado con capacidad nominal | No descuenta volumen ya usado, volumen muerto ni reserva de seguridad. |
| Pressure (kPa) | No conectado a Pore Injection | Se almacena en configuraciones de jeringa/material | El generador de Pore Injection no lo utiliza. |
| Flowrate (mm/s) del toolhead | Conectado | Gobierna el feedrate E del bloque de inyección | Sigue requiriendo cualificación experimental. |
| Retract del toolhead | Conectado | Gobierna la retracción posterior a cada depósito | La velocidad de retracción continúa fija por ahora. |
| Pressurization / retraction steps | No conectado a Pore Injection | Sólo se usan en otro flujo de acciones por capa | No afectan al bloque de Pore Injection. |
| Tipo de actuador | No conectado | Metadato | El mismo G-code se genera para accionamiento mecánico o neumático. |
| Velocidad vertical | No aplica | No existe penetración ni retirada Z | El depósito se realiza en la superficie de la capa. |
| Dwell | Fijo | Pausa de 200 ms después de inyectar | No depende del bioink, punta o volumen. |
| Dry-run | Implementado como chequeo estático mínimo | Comprueba herramientas asignadas y existencia de movimientos | No simula colisiones, límites de ejes, extrusión, presión ni contacto físico. |

## Hallazgos bloqueantes

### Decisión resuelta: no penetrar un scaffold terminado

La inserción profunda requeriría conocer el envolvente exterior de la punta,
su longitud útil, offsets, deformación y continuidad real de cada canal. En una
punta cónica el OD cambia con la profundidad, por lo que un único valor tampoco
describiría correctamente la operación.

Ese problema se elimina del alcance ejecutable actual. Pore Injection deposita
sólo sobre la capa recién construida y no intenta alcanzar el fondo de un
scaffold terminado. Si en el futuro se recupera la inyección volumétrica, deberá
volver como una función experimental separada y con su propio modelo físico.

### P0. El dry-run no prueba viabilidad física

El endpoint denominado dry-run no mueve la máquina. Recorre el archivo y
comprueba principalmente que las herramientas usadas estén asignadas y que haya
movimientos. No valida:

- límites XYZ ni coordenadas negativas/fuera de carrera;
- colisión de la punta, el hub, el carro o los toolheads aparcados;
- trayectoria completa de entrada y salida;
- diámetro exterior frente a la apertura;
- longitud de punta frente a profundidad;
- velocidad o fuerza de penetración;
- presión, contrapresión, atasco o flujo real.

El nombre debería mostrarse como **Static G-code check**. Un dry-run de máquina
debería ser otra fase explícita y, si se realiza físicamente, usar una altura
segura o un útil no dispensador.

### P1. El tamaño detectado no equivale a apertura física garantizada

El detector encuentra cuadrados a partir de los trazos de infill del G-code.
Esto es suficiente para proponer centros, pero no para garantizar el hueco real.
La apertura útil depende también de ancho de extrusión real, sobreextrusión,
sagging, contracción, temperatura, adhesión entre capas y desviaciones del
scaffold ya impreso.

Además, la estimación previa de volumen usa el bounding box y una fórmula teórica
de GRID; no integra el volumen libre real de cada celda detectada ni un factor de
ocupación seguro.

### P1. No existe un modelo de esfuerzo de inserción

El sistema ordena un movimiento Z a velocidad fija, sin sensor de contacto ni
límite de fuerza. Incluso si una punta cabe nominalmente, puede:

- enganchar una hebra por error de posición;
- flexionar una aguja larga;
- deformar o despegar el scaffold;
- tocar el fondo por variación de altura;
- arrastrar material durante la retirada.

Sin feedback de fuerza, la primera política debe ser conservadora: sólo permitir
entrada por huecos con holgura cualificada y limitar profundidad/velocidad según
un perfil ensayado.

### P1. La dosificación es una orden, no una medición

`µL/mm` convierte una orden E en volumen esperado. El resultado cambia con
bioink, temperatura, tiempo desde la carga, punta, diámetro, longitud, presión,
velocidad, compresibilidad y holguras del mecanismo. En un actuador neumático,
una relación lineal entre E y volumen ni siquiera describe directamente la
física del sistema.

## Política de viabilidad propuesta

Cada sitio debe obtener un resultado separado para cuatro dominios:

1. **Geometría:** ¿la punta cabe a lo largo de toda la profundidad?
2. **Cinemática:** ¿la máquina puede recorrer la trayectoria sin colisión?
3. **Dosificación:** ¿puede entregar el volumen y caudal dentro de límites
   cualificados?
4. **Protocolo biológico:** ¿bioink, punta, presión/velocidad y temperatura
   pertenecen a una combinación calibrada?

Estados recomendados:

- `verified`: combinación y rango ensayados en esta máquina;
- `conditionally viable`: pasa cálculos con márgenes, pero falta ensayo;
- `not viable`: viola un límite conocido;
- `unknown`: faltan datos; bloquea el envío, no la exploración.

### Regla geométrica mínima

No utilizar `minCellSize > tip ID`. La regla debe operar con la apertura libre
mínima y el envolvente exterior:

```text
holgura_radial =
  (apertura_libre_mínima - OD_punta_a_esa_profundidad) / 2

margen_requerido =
  error_XY + incertidumbre_offset_tool + runout +
  desviación_scaffold + margen_protocolo

viable_geométricamente ⇔
  holgura_radial >= margen_requerido
```

Todos los términos deben ser configurables o provenir de una cualificación de
máquina. No conviene fijar universalmente un margen: depende del hardware y del
proceso. Para puntas rectas el OD es constante; para puntas cónicas debe
evaluarse el OD máximo alcanzado en toda la profundidad.

La comprobación debe usar el corredor completo de descenso, no sólo el centro
del poro en una capa. Una celda puede estar desplazada o parcialmente cerrada en
capas inferiores.

## Datos que faltan en los perfiles

### Perfil de punta

- referencia, fabricante y lote;
- geometría (`straight`, `tapered`, etc.);
- diámetro interior y exterior;
- longitud expuesta y longitud insertable;
- perfil exterior axial para puntas cónicas;
- material y flexibilidad;
- límite de presión/caudal si el fabricante lo especifica;
- condición de esterilidad y número de usos.

### Perfil de máquina

- carrera XYZ y envolventes de cada toolhead;
- offsets XYZ calibrados entre FDM y jeringa;
- repetibilidad, runout y error de perpendicularidad;
- aceleración y velocidad máxima segura de inserción;
- distancia punta-hub y colisiones del carro;
- presencia y límite de sensor de fuerza/contacto.

### Perfil experimental bioink + punta

- temperatura y ventana temporal;
- curva volumen ordenado/volumen medido, no un único punto;
- velocidad o presión usadas durante la calibración;
- retardo, dwell, retract y volumen muerto;
- rango de caudal estable y riesgo de atasco;
- límites biológicos aceptados y evidencia del ensayo.

La literatura de bioprinting muestra que diámetro, geometría, presión y reología
alteran el esfuerzo cortante y el flujo. Por ello no es defendible reutilizar una
calibración únicamente por compartir el mismo ID de punta.

## Acciones priorizadas

### Prioridad 0 — honestidad y bloqueo seguro

1. Mantener `layer_by_layer` como único modo ejecutable y bloquear proyectos
   antiguos hasta convertirlos. **Completado.**
2. Cambiar “Dry-run” por “Static G-code check” hasta que exista una simulación
   real de límites y colisiones.
3. Etiquetar en UI cada parámetro como `applied`, `estimated` o `not connected`.
4. No permitir “Send to printer” si el protocolo por capas está incompleto.

### Prioridad 1 — motor de viabilidad

1. Verificar que cada inyección ocurra después del infill de la capa correcta.
2. Depositar desde la superficie de la capa y comenzar únicamente por encima
   del bottom shell protegido. **Completado.**
3. Incorporar offsets de herramienta y límites XYZ.
4. Verificar el retorno al toolhead de scaffold y la posición de impresión.
5. Calcular capacidad local con un factor de llenado configurable y conservador.

### Prioridad 2 — cualificación experimental

1. Asistente de calibración por máquina + actuador + jeringa + bioink + punta +
   temperatura.
2. Ensayo de volumen gravimétrico/volumétrico con repetibilidad y rango válido.
3. Cupón GRID de prueba para cualificar holgura, volumen y velocidad.
4. Registro de observaciones: deformación, backflow, clogging y daño celular.
5. Opcionalmente, sensor de fuerza/contacto para abortar una inserción anómala.

## Criterio de aceptación de la siguiente iteración

Para cada celda de una capa, la aplicación debe poder informar:

- capa y Z exactas donde se inyectará;
- superficie de deposición y límite inferior protegido;
- volumen solicitado y capacidad estimada;
- combinación de bioink/punta calibrada o no;
- resultado por sitio y razón concreta de cualquier bloqueo.

La inserción profunda en un scaffold terminado permanece fuera de alcance.

## Referencias primarias consultadas

- Nordson EFD, [SmoothFlow tapered dispense tips](https://www.nordson.com/en/products/efd-products/smoothflow-tapered-dispense-tips).
- Nordson EFD, [General purpose stainless-steel tips: ID, OD y longitudes](https://www.nordson.com/en/products/efd-products/general-purpose-dispense-tips).
- Chand et al., [Computational Fluid Dynamics Assessment of the Effect of Bioprinting Parameters in Extrusion Bioprinting](https://pmc.ncbi.nlm.nih.gov/articles/PMC9159488/).
- Ouyang et al., [Extrusion Bioprinting of Shear-Thinning Gelatin Methacryloyl Bioinks](https://pmc.ncbi.nlm.nih.gov/articles/PMC5545786/).
- Ning et al., [Study of the process-induced cell damage in forced extrusion bioprinting](https://pubmed.ncbi.nlm.nih.gov/34020427/).
