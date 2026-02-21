# 🚀 DLP3 Bioprinter — Roadmap de Funciones Disruptivas

Este documento sirve como registro y seguimiento de ideas avanzadas e innovadoras diseñadas para igualar y/o superar a los sistemas comerciales de bio-impresión (como la CELLINK Lumen X). El objetivo de estas características es brindar un valor incalculable a los investigadores, resolviendo problemas críticos de inviabilidad celular, perfusión y microfluídica mediante algoritmos de software puros sin alterar el hardware.

---

## 🚦 Estado General del Proyecto

- [x] **A. Generador de Redes Vasculares (Vascular Tree / Voronoi Perfusion)**
- [ ] **B. Mapeo Metabólico y Gradientes Funcionales (Math-Gradient Stiffness)**
- [ ] **C. Control de Sangrado Lumínico de Alta Precisión (Anti-Bleeding Microfluidics)**
- [ ] **D. Dosimetría Pulsada Dinámica (Cell Viability Saver)**

---

## 📝 Descripción Detallada de Funciones

### A. Generador de Redes Vasculares (Vascular Tree / Voronoi Perfusion)
**Estado:** � Terminado (`Done`)

* **El Problema:** La impresión de bloques densos de hidrogel (mayores a 2 mm) provoca la muerte celular (necrosis) en el núcleo de la pieza por asfixia y falta de nutrientes. Modelar capilares huecos en 3D CAD es complejo.
* **La Solución (Software):** Añadir un algoritmo al `pattern_engine.py` que perfore automáticamente canales huecos interconectados en 3D (basado en fractales o diagramas de Voronoi Invertidos).
* **Impacto en Investigación:** Permite al científico imprimir un andamio sólido, conectarle una bomba de fluido externo e irrigar nutrientes o sangre a través de los canales directamente a las células más profundas.

### B. Mapeo Metabólico y Gradientes Funcionales (Math-Gradient Stiffness)
**Estado:** 🔴 Por hacer (`To Do`)

* **El Problema:** El tejido biológico real (ej. osteocondral, transición hueso-cartílago) no tiene una dureza uniforme.
* **La Solución (Software):** Explotar la tabla matemática de escala de grises (`calibration_gray.json`). Se añadirá una opción interactiva a la UI que modifique la potencia de gris a lo largo del eje Z o radialmente. Así, la pieza puede pasar de curarse a 24.2 mW/cm² (duro) en la base a 5.0 mW/cm² (blando) en la cúspide.
* **Impacto en Investigación:** Replicar condiciones biomiméticas *in-vivo* y posibilitar estudios de migración celular regidos por la rigidez del entorno estructural (Mecanotransducción).

### C. Control de Sangrado Lumínico de Alta Precisión (Anti-Bleeding Microfluidics)
**Estado:** 🔴 Por hacer (`To Do`)

* **El Problema:** El rebote de los fotones UV ("back-scattering") dentro de las biotrinas translúcidas provoca que los canales huecos diseñados para flujo de fluidos (microfluídica) se taponen accidentalmente por curado indeseado de resina sobrante.
* **La Solución (Software):** Implementar un analizador de bordes con `OpenCV`. Si el motor detecta una cavidad vacía diseñada por el usuario, aplicará inteligentemente "Píxeles Grises Atenuados" en las paredes limitantes del borde interno. Esto reduce energéticamente los bordes (*Edge Erasion Dimming*) para compensar la dispersión lumínica.
* **Impacto en Investigación:** Viabiliza la impresión fiable de reactores de Lab-On-A-Chip o redes de hasta 50 micras sin fallos geométricos.

### D. Dosimetría Pulsada Dinámica (Cell Viability Saver)
**Estado:** 🔴 Por hacer (`To Do`)

* **El Problema:** Exposiciones a proyectores UV prolongadas (ej. 5 o 6 segundos a toda potencia) matan a las colonias celulares alojadas en la resina, debido a la toxicidad del foto-iniciador al fraccionarse, o por picos súbitos en la temperatura del gel (reacción exotérmica).
* **La Solución (Software):** Modificar el bucle de impresión en `print_manager.py` para permitir la "Exposición Pulsada". Alcanzar la mJ/cm² deseado fraccionándolo. Por ejemplo, en vez de iluminar `3s continuo`, la máquina flashea secuencias termodinámicas de `[0.5s ON] -> [0.5s OFF]` hasta acumular la dosis completa permitiendo a los tejidos enfriarse.
* **Impacto en Investigación:** Resuelve el mayor terror en el bio-printing: las tasas de supervivencia. Protegeremos radicalmente la viabilidad de los microorganismos de cara a cultivos de larga duración.

---

*Documento de Trabajo - Proyecto DLP3 Bioprinter (2026)*
