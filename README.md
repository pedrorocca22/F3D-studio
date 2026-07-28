# F3D Studio

<img width="1916" height="1040" alt="F3D Studio workspace" src="https://github.com/user-attachments/assets/8be57a5d-cdad-4fd5-961d-9d398acf5271" />

<div align="center">
  <i>Multi-process slicing and protocol design for advanced fabrication and bioprinting</i>
</div>

F3D Studio is a research-oriented workspace for preparing hybrid 3D-printing
protocols that combine thermoplastic extrusion, hydrogel dispensing and UV
processing. It connects a React/Three.js interface to a Python slicing pipeline
built around PrusaSlicer, with explicit hardware mapping, process constraints,
G-code inspection and Klipper/Moonraker integration.

> **Development status:** F3D Studio is beta software under active development.
> It is intended for research workflows and does not replace experimental,
> biological or medical validation.

## Current capabilities

- **Machine-agnostic toolheads:** define the number of physical slots and assign
  any combination of FDM, hydrogel syringe and UV tools, including multiple
  tools of the same type.
- **Per-process assignment:** independently map perimeters, infill, solid infill,
  bottom layers, top layers and supports to installed toolheads.
- **Centralized process profiles:** configure FDM, syringe and UV hardware in one
  place and reuse those values throughout the workflow.
- **Height-based zones:** override process assignments and parameters over
  selected Z ranges or model scopes.
- **Multimaterial slicing:** generate physical tool changes from instance-based
  toolhead assignments while retaining compatibility with older projects.
- **Interactive G-code preview:** inspect layers or individual segments with one
  timeline, color paths by tool or line type, and switch between solid and
  wireframe rendering.
- **Process-aware tool visualization:** display the correct FDM nozzle or syringe
  tip while a mixed-tool program is simulated.
- **Labware and materials:** work with flat beds, Petri dishes and multiwell
  plates, plus reusable thermoplastic, hydrogel and support-material profiles.
- **Protocol archive:** save configured projects with materials, toolheads,
  zones, metadata and slicing results for later review.

## Layer-by-layer Pore Injection

Pore Injection is an experimental workflow for depositing a secondary material
inside detected GRID infill cells while the scaffold is being constructed.
F3D Studio currently implements the physically conservative **layer-by-layer**
strategy: a scaffold layer is printed, accessible cells are detected, and the
assigned syringe deposits from the surface of that fresh layer.

The current implementation includes:

- Whole-scaffold or explicitly zonal activation.
- GRID compatibility checks without implicitly enabling injection in other
  GRID-configured zones.
- Selection of a dedicated syringe toolhead and its central calibration.
- Protection of the configured bottom solid envelope.
- Geometric estimation of available volume for every detected cell.
- Requested-versus-available volume summaries and over-capacity warnings.
- 3D pore-site previews whose footprint represents the requested fill ratio.
- Preflight validation and a dry-run before a job is sent to the printer.

Post-print needle penetration through an already completed scaffold is not
currently supported. This avoids presenting a theoretically possible toolpath
as a mechanically reliable process without accounting for tip geometry,
material behavior and scaffold accessibility.

## Workflow

1. **Machine Setup** — choose the print surface and configure physical tool
   slots.
2. **Models** — import STL geometry or create basic primitives.
3. **Essential** — assign tools to scaffold features and configure the active
   FDM, syringe and UV profiles.
4. **Expert** — add Z zones, parameter overrides, UV events or localized pore
   injection when required.
5. **Slice** — resolve constraints, generate G-code, inspect the preview and run
   the final checks.

Blocking validation prevents progression when required surfaces, models,
toolheads, material metadata or process-specific parameters are missing.

## Requirements

- Node.js and npm
- Python 3.10+
- PrusaSlicer 2.9.6 console executable
- Windows for the repository's default PrusaSlicer binary path

The PrusaSlicer distribution is intentionally not committed. Download the
Windows console package from the
[official PrusaSlicer releases](https://github.com/prusa3d/PrusaSlicer/releases),
extract it and place it at:

```text
F3D-studio/
└── PrusaSlicer-2.9.6/
    └── prusa-slicer-console.exe
```

The path is currently resolved in `server.py` as:

```text
PrusaSlicer-2.9.6/prusa-slicer-console.exe
```

## Development setup

Install dependencies:

```bash
npm install
python -m pip install -r requirements.txt
```

Start the backend:

```bash
python -m flask --app server run --host 127.0.0.1 --port 8000 --no-debugger --no-reload
```

In a second terminal, start the frontend:

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

To use another backend address, define `VITE_BACKEND_URL` before starting or
building the frontend.

## Local production build

```bash
npm run build
python server.py
```

`server.py` serves the compiled frontend and API at
[http://127.0.0.1:8000](http://127.0.0.1:8000).

## Testing

```bash
# TypeScript unit tests
npm test

# Python unit and integration tests
python -m pytest tests/ -v

# Production build
npm run build
```

The test suite covers workflow restrictions, layer-plan resolution,
instance-based toolheads, G-code preview behavior, infill-cell detection, pore
injection, server contracts and slicing integration.

## Architecture

```text
React + TypeScript + Three.js
            │
            ▼
      Flask API (Python)
            │
      ┌─────┴─────────┐
      ▼               ▼
 PrusaSlicer     G-code processing
                      │
                      ▼
             Klipper / Moonraker
```

Core design notes and audits are available in:

- [`docs/WORKFLOW_DECISIONS_AND_PORE_INJECTION.md`](docs/WORKFLOW_DECISIONS_AND_PORE_INJECTION.md)
- [`docs/PORE_INJECTION_IMPLEMENTATION_AUDIT.md`](docs/PORE_INJECTION_IMPLEMENTATION_AUDIT.md)
- [`docs/INTERFACE_REORGANIZATION_ROADMAP.md`](docs/INTERFACE_REORGANIZATION_ROADMAP.md)

## Technology

- React 18, TypeScript and Vite
- Three.js and React Three Fiber
- Tailwind CSS
- Python and Flask
- PrusaSlicer CLI
- Klipper/Moonraker APIs
- Vitest and pytest

## Origin

F3D Studio is an independently conceived research-software project developed
through an iterative, AI-assisted engineering workflow. Its objective is to make
complex multimaterial fabrication strategies easier to configure, inspect and
reproduce while keeping machine constraints explicit.
