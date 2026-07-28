# F3D Studio — Interface Reorganization Roadmap

## 1. Diagnosis

F3D Studio already has a strong functional core, but the interface exposes too
many concepts at the same visual level.

The current six-step workflow separates related decisions and duplicates their
representation:

1. Surface and hardware
2. Models
3. Toolhead mapping
4. Process settings
5. Zones and advanced processes
6. Validation, slicing and execution

The main density is concentrated in Settings, Advanced and Slice. Hardware,
materials, process parameters, model overrides, zones, Pore Injection and
preflight results all appear as vertically stacked panels. Accordions reduce
height only after the user has already had to interpret every section title.

The core problem is therefore not “too many parameters”. It is:

- insufficient hierarchy between essential, contextual and expert parameters;
- separate screens for decisions that are naturally made together;
- repeated summaries and explanations;
- global, model and zonal scopes represented with similar-looking forms;
- configuration and validation competing for the same space;
- a narrow 420 px panel acting as both wizard, settings editor and scientific
  report.

## 2. Guiding policies

### A. Preserve power, reduce simultaneous exposure

No scientifically useful parameter should disappear merely to make the product
look simpler. Parameters move into three disclosure levels:

- **Essential:** required to produce a valid protocol.
- **Tune:** parameters commonly adjusted for the selected process.
- **Expert:** calibration, diagnostics and uncommon overrides.

### B. One concept, one owner

A value is editable in exactly one canonical place. Other surfaces may show its
current value and link to that owner, but may not duplicate the input.

- Hardware capabilities belong to machine/toolhead profiles.
- Material behavior belongs to material profiles.
- Default fabrication intent belongs to the protocol.
- Exceptions belong to a selected model or Z-zone.
- Validation belongs to the run workspace.

### C. Configuration follows the object being edited

Selecting a model, toolhead, zone or injection event opens its contextual
inspector. A separate “mapping” step should not be required for work that can be
performed directly on the selected model.

### D. Status is persistent; explanation is on demand

Blockers and warnings remain visible in a compact status rail. Long descriptions
live in `?` tooltips or a details sheet. A blocker must navigate directly to the
control that resolves it.

### E. Presets are transparent starting points

Future tissue presets—bone, cartilage, skin and others—must apply an explicit
set of values and show which fields came from the preset. Users can override
them, compare the delta and return to the preset. Presets must not become opaque
automation.

### F. Keep the current technical kit

The redesign remains within the existing React, context, validation and Three.js
architecture. It reorganizes components and state ownership without introducing
a new UI framework or a second state-management system.

## 3. Target information architecture

Replace the six equal wizard steps with four workspaces:

### 1. Setup

Purpose: define what is physically installed and where printing occurs.

- Surface and labware
- Toolhead slot assignment
- Toolhead profiles
- Material assignment
- Compact machine-readiness summary

Inactive hardware is represented by one collapsed row. Its complete parameter
panel is not rendered until assigned.

### 2. Design

Purpose: define the objects and which process builds each feature.

- Import and procedural geometry
- Object list
- Transform tools
- Per-model process assignment in the contextual inspector
- Clone-to-wells workflow

The current standalone Mapping step is absorbed here. Selecting a model exposes
its perimeter, infill, solid-fill and support assignments beside the 3D view.

### 3. Protocol

Purpose: define how the scaffold is fabricated.

- Protocol essentials
- Pore Injection process card
- Z-axis process timeline
- Model and zone overrides
- Tune and Expert drawers

The default view shows only the settings that materially define the protocol:
layer height, infill, walls, top/bottom shell and active process doses. Motion,
adhesion, cooling and support details are available through Tune. Rare settings
are available through Expert.

Z-zones are edited through a vertical timeline tied to the 3D Z axis. Selecting
a band opens one contextual editor; zones are not rendered as a long stack of
full forms.

### 4. Validate & Run

Purpose: determine whether the protocol is executable and inspect its result.

- Compact readiness rail
- Slice action
- G-code preview
- Pore-capacity and collision results
- Dry-run
- Execute and archive

Before slicing, only estimates and unresolved requirements are shown. After
slicing, measured results replace estimates instead of being added below them.
Detailed scientific results open in a report sheet.

## 4. Core interaction model

### Persistent workspace

- Left: four labeled workspaces, not six unlabeled icons.
- Center: 3D viewport remains the dominant surface.
- Right: contextual inspector for the currently selected object/process.
- Bottom or top: compact protocol-status rail showing blockers, warnings and
  readiness.

The large configuration column becomes a focused task panel rather than an
always-growing document.

### Settings presentation

Each configurable entity uses the same pattern:

1. Summary row: name, source, readiness and most important value.
2. Essential editor: no more than 4–6 immediately visible controls.
3. `Tune` action: opens common process controls.
4. `Expert` action: opens uncommon or diagnostic controls.
5. Reset/source indicator: global, preset, model override or zone override.

### Scope language

Use a consistent scope vocabulary everywhere:

- **Protocol default**
- **Model override**
- **Zone override**

Avoid mixing “global”, “base scaffold”, “segment” and “advanced override” when
they refer to the same inheritance relationship.

## 5. Elements to merge, move or remove

### Merge

- Models + Mapping → Design workspace.
- Machine Setup + Toolhead Profiles → Setup workspace.
- Global Scaffold Profile + Advanced Overrides → Protocol workspace.
- Slice summary + preflight + dry-run → Validate & Run workspace.

### Move

- Per-model overrides → selected model inspector.
- Z-zone parameters → selected timeline band inspector.
- Pore Injection calibration source → syringe/material profile; show read-only
  readiness in the Pore Injection card.
- Build schedule → protocol timeline; keep a detailed version in the scientific
  report.

### Remove from the default surface

- Fixed explanatory paragraphs.
- Complete UV configuration when no UV head is installed.
- Repeated hardware/material badges in multiple panels.
- Empty sections and inactive process forms.
- Repeated parameter summaries after measured results exist.
- Full warning lists when all checks are ready.

Nothing in this list requires deleting the underlying capability.

## 6. Delivery plan

### Current status — first simplification increment complete

- Protocol Settings now opens in Essential with six scaffold-defining controls.
- Model process assignment now opens at the start of Essential; Mapping is no
  longer a separate navigation step.
- Tune owns first-layer, motion, adhesion, support and cooling behavior.
- Expert owns canonical hardware profiles and model exceptions.
- Only assigned toolheads are exposed, one profile at a time.
- Model exceptions remain collapsed until explicitly selected.
- Promotional hardware and “Need more control” cards were removed from
  Essential.
- Slicing data and saved-project fields are unchanged.

### Phase 0 — UX contract and state ownership

Deliverables:

- canonical ownership map for every setting;
- vocabulary for scopes and readiness;
- inventory of duplicated controls;
- compatibility rule for existing saved projects.

Acceptance:

- every editable value has one canonical owner;
- existing project files load without migration loss.

### Phase 1 — Navigation shell

Deliverables:

- four-workspace navigation;
- labeled navigation in expanded state;
- persistent compact status rail;
- contextual right-inspector shell.

Acceptance:

- current validation blockers still prevent invalid progression;
- the 3D viewport retains at least half of the usable width;
- no process logic changes.

### Phase 2 — Setup and Design consolidation

Deliverables:

- toolhead profiles moved into Setup;
- inactive toolheads reduced to summary rows;
- Mapping absorbed into model selection;
- model process assignments editable from the inspector.

Acceptance:

- a model can be imported and fully assigned without visiting a separate mapping
  screen;
- FDM-only and syringe-only configurations remain valid.

### Phase 3 — Protocol composer

Deliverables:

- Essential / Tune / Expert disclosure;
- unified protocol-default editor;
- source and override indicators;
- Pore Injection as a compact process card.

Acceptance:

- the default protocol view exposes no more than 6 primary controls at once;
- no parameter is editable in more than one place;
- expert controls remain searchable and accessible.

### Phase 4 — Visual Z timeline

Deliverables:

- Z-axis band editor synchronized with the 3D viewport;
- one contextual zone inspector;
- create, resize, select, duplicate and delete zone actions;
- explicit protocol/model/zone inheritance display.

Acceptance:

- adding zones does not increase the main panel height;
- selecting a zone highlights the corresponding 3D volume;
- overlap and scope conflicts are visible before slicing.

### Phase 5 — Validate & Run simplification

Deliverables:

- estimate → measured result replacement;
- compact blocker/warning rail;
- expandable scientific report;
- direct navigation from every blocker to its source;
- unified Slice → Preview → Dry-run → Execute sequence.

Acceptance:

- ready protocols show a concise success state;
- warnings do not dominate the surface;
- blockers are actionable in one click.

### Phase 6 — Tissue preset foundation

Deliverables:

- versioned preset schema;
- preset browser for bone, cartilage, skin and future substrates;
- applied-value provenance;
- diff between preset and user overrides;
- reset and duplicate-as-custom actions.

Acceptance:

- applying a preset never hides the resulting values;
- unsupported hardware produces explicit compatibility warnings;
- presets can evolve without breaking archived protocols.

## 7. Recommended implementation order

1. Phase 0: ownership and vocabulary.
2. Phase 3 subset: reduce Settings to Essential / Tune / Expert.
3. Phase 5 subset: compact preflight and remove repeated summaries.
4. Phase 1: move to four workspaces.
5. Phase 2: merge Mapping into Design.
6. Phase 4: replace stacked zone cards with the Z timeline.
7. Phase 6: build tissue presets on the stabilized information architecture.

This order produces visible relief early while postponing the highest-risk
navigation and zone-editor changes until the content model is stable.

## 8. Success metrics

- Maximum of 6 primary controls visible in a default task context.
- Zero settings editable in multiple locations.
- No default panel longer than two viewport heights.
- A standard FDM scaffold reaches Slice without opening Tune or Expert.
- A Pore Injection scaffold reaches preflight with at most one additional
  process card.
- Every blocker links to its corrective control.
- At least 50% of the central horizontal workspace remains available to the 3D
  viewport at desktop width.
- Existing projects and generated G-code remain behaviorally compatible.

## 9. Architecture decision: instance-based toolheads

Status: implemented in the current interface and slicing contract.

- The machine declares its number of physical tool positions first.
- Every position owns a stable instance ID and a physical Klipper slot (`T0`,
  `T1`, `T2`, ...).
- `FDM`, `Hydrogel` and `UV` are repeatable process types, not singleton IDs.
- Models, scaffold features, zones, Pore Injection and UV events reference the
  selected instance ID.
- Settings exposes one independent profile per assigned instance.
- Projects using the legacy singleton IDs (`fdm`, `syringe`, `uv`) are
  normalized on load and remain slice-compatible.

This is a prerequisite for machine profiles and future substrate presets:
presets may require capabilities, but must never assume a fixed physical slot
or a single tool of each type.
