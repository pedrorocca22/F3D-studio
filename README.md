# 🧬 F3D Studio
<img width="1916" height="1040" alt="Screenshot_F3D" src="https://github.com/user-attachments/assets/8be57a5d-cdad-4fd5-961d-9d398acf5271" />

<div align="center">
  <i>Professional software suite for Advanced Bioprinting and Fused Filament Fabrication</i>
</div>
<br/>

F3D Studio is a comprehensive, professional-grade software suite designed for advanced bioprinting workflows. Built with a modern web interface and a robust Python backend, F3D Studio bridges the gap between 3D slicing parameters and user-friendly G-code generation. It enables precise control over print parameters across different heights (Z-Zones) and introduces advanced features tailored for biological and soft-material printing, such as Pore Injection.

> **Disclaimer:** This software is currently a beta version and is still under active development. Features and performance are subject to change.

## Key Features

### 1. Modern, Responsive User Interface
- **Visual Workspace:** A high-performance UI built with React and Three.js, featuring a flat, professional design aesthetic. It provides a real-time, interactive 3D viewport for inspecting toolpaths and simulating G-code execution.
- **Advanced G-Code Simulation:** Features a sophisticated visualizer where users can see the exact toolpath of the printer. The simulation includes a translucent toolhead (syringe tip) that is programmatically rotated and centered, accurately tracking the path during playback.
- **Wireframe & Solid Rendering:** Toggle between solid and wireframe rendering modes for detailed inspection of complex G-code layers and internal infill structures.

### 2. Multi-Zone Slicing Engine
- **PrusaSlicer Integration:** Seamlessly integrates with PrusaSlicer's CLI under the hood to perform robust geometry slicing without needing local desktop software.
- **Parametric Z-Zones:** Users can define dynamic Z-Zones, allowing per-segment configuration of layer heights, infill patterns, and speeds. This allows printing hybrid structures where properties vary across the height of the construct.
<img width="1920" height="1040" alt="Screenshot2_F3D" src="https://github.com/user-attachments/assets/a49a2352-f03f-4288-a28a-30b661fea026" />

### 3. Advanced Bioprinting Capabilities
- **Pore Injection Logic:** Allows fine-grained control over the printing process by enabling users to configure per-segment "Pore Injection" logic. When activated on compatible infill patterns (like GRID), the system modifies the G-code to inject specific biological or support materials directly into the pores of the structure.
- **Hardware Integration:** Connects directly with Klipper/Moonraker APIs, allowing users to send G-code seamlessly to their networked bioprinters.
<img width="1920" height="1040" alt="Screenshot3_F3D" src="https://github.com/user-attachments/assets/41887407-cff7-4d84-ac77-54d58b06a65b" />

### 4. Protocol Management & Workspace Features
- **Archived Protocol Gallery:** Save, organize, and reload past printing jobs complete with metadata, custom tags, and detailed project descriptions, ensuring reproducible bioprinting workflows.
- **Detailed Toolhead Mapping:** Support for interchangeable toolheads, allowing users to easily configure standard filament extruders, syringe injection heads for bioinks and gels, and UV curing tools for accurate simulation and precise volumetric control.
- **Live Print Monitoring:** Includes a built-in telemetry dashboard to track the progress and status of active print jobs in real-time.
- **Integrated Network Config:** Manage device connectivity (WiFi) directly from the interface, ideal for standalone or headless deployments (e.g., Raspberry Pi).
<img width="1920" height="1040" alt="Screenshot4_F3D" src="https://github.com/user-attachments/assets/42083427-19f9-4bbc-b4b5-fe3be837cc7c" />

## Tech Stack
- **Frontend:** React, TypeScript, Vite, CSS Modules, Three.js (3D rendering).
- **Backend:** Python, Flask, PrusaSlicer CLI.

## Acknowledgements & Origin

While the original vision, conceptualization, and workflow design for F3D Studio were mine, the software's codebase was **100% implemented using AI**. Through extensive AI-driven analysis, architectural refactoring, and continuous iteration, we successfully transformed complex printing workflows into a highly optimized system—achieving robust, professional-grade G-code generation and delivering a production-ready bioprinting suite.
