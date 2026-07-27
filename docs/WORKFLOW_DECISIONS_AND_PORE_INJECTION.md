# Workflow decisions and Pore Injection strategy

## Diagnosis

F3D Studio already has the right domain concepts — surface, models, mapping,
settings, Z-zones and slicing — but they are not yet enforced as one state
machine. The previous flow validated only two `Next` transitions, while the
sidebar could jump to any step. Critical values also looked configured when
they were only defaults (for example, a glass bed was selected before the
researcher made a choice).

Pore Injection is technically more interesting than a normal post-processing
script: the project detects square cells in the generated GRID infill, derives
centroids from the real toolpath, injects a syringe move at those locations,
and stores the detected sites in the job manifest. Its current weakness is
discoverability and scientific traceability rather than lack of ambition.

## Guiding policies

1. **One rule engine.** The same typed rules must drive the stepper, the slice
   button, the backend request and eventually the printer hand-off.
2. **Hard blockers are reserved for safety and reproducibility.** Missing
   geometry, missing hardware, invalid Z ranges, invalid tool mappings and
   invalid pore parameters stop the workflow. Suggestions such as bed heating
   or material presets remain warnings.
3. **No silent assumptions for critical hardware.** A default value may help
   the viewport render, but it must not count as a configured substrate,
   toolhead or bioink delivery path.
4. **Pore Injection is a protocol, not a toggle.** Every run should expose the
   geometry basis, detector tolerance, syringe calibration, target volume,
   safety limits and a reviewable injection map.
5. **The backend is the final authority.** Client validation improves UX, but
   the server must reject an unsafe or incomplete slice request even when the
   request does not come from the React UI.

## Blocker matrix

| Transition | Hard blockers | Warnings / review items |
| --- | --- | --- |
| 1 → 2 | Print surface selected and geometrically valid; at least one toolhead assigned to a slot | Material not assigned; bed heating disabled |
| 2 → 3 | At least one model exists | Model has no local STL file (possible for an archived protocol) |
| 3 → 4 | Every feature mapping references an assigned toolhead; multiwell assignments match the selected plate | Support mapping unused while supports are disabled |
| 4 → 5 | Layer height, nozzle and infill values are within physical ranges | Cooling, adhesion and speed choices may require experimental review |
| 5 → 6 | Every active Z-zone has `zStart < zEnd`; zone toolheads are assigned; pore preconditions pass | Overlapping zones should be reviewed by priority |
| Slice / Print | Local STL files exist; FDM path is assigned; all hard issues are clear; manifest is returned | Material volume, thermal limits, collision clearance and biological protocol approval |

The current implementation now has a shared TypeScript validator and uses it
for the sidebar, `Next`, and the final slice action. Flask also validates the
same critical invariants before a background job is created.

## Pore Injection assessment

### What is strong today

- Detection is based on the actual sliced infill rather than only on the CAD
  bounding box.
- The two operating modes are meaningful: layer-by-layer dosing and a single
  multilayer fill.
- The job manifest records detected sites, allowing a 3D overlay and later
  protocol review.
- The feature is scoped to Z-zones, which is the right abstraction for
  gradients and biologically distinct regions.

### What currently limits it

- It is hidden inside `Advanced → Zone → Params` and was not presented as a
  primary biocompatibility workflow.
- GRID is required, but the UI historically allowed the feature to be enabled
  with another pattern and only showed a note.
- `cellSizeToleranceMm` and `minCellSizeMm` are now exposed in the zone editor;
  they still need a richer preview/report to make their effect obvious.
- `globalSettings.poreInjection` is sent by the frontend, but the worker only
  processes zone-level pore configurations. The global path is therefore not a
  complete execution path.
- Syringe conversion uses a hard-coded `165 µL/mm`; it does not yet derive
  volume from the selected syringe, tip, calibration or pressure/flow profile.
- Tool switching, safe-Z movement, reservoir limits, collision checks and
  injection failure reporting need explicit validation before live printing.

### Recommended product shape

Treat Pore Injection as a five-part protocol:

1. **Geometry:** GRID pattern, line spacing, estimated cell size, accepted
   detector tolerance and minimum cell size.
2. **Region:** model scope, Z start/end and whether the zone is layer-wise or
   multilayer.
3. **Material:** syringe, tip, bioink profile and calibrated µL/mm conversion.
4. **Dose:** µL per pore or total target volume, maximum available volume and
   reservoir consumption.
5. **Safety review:** assigned tool, safe Z, depth below the current layer,
   return-to-FDM behavior, collision clearance and a preview of every site.

The most valuable near-term UI addition is a pre-slice pore report showing
estimated pore count, pore size, theoretical capacity, requested volume,
coverage percentage and any rejected cells. The slice should be explicitly
marked as “geometry detected” versus “injection generated”; those are not the
same guarantee.

## Roadmap

### P0 — workflow integrity

- Keep the shared validator as the only client-side gate.
- Add authoritative Flask validation and return structured issue codes.
- Include the selected print surface and its dimensions in the slice contract.
- Require an assigned FDM tool for a normal FDM slice and reject unassigned
  zone mappings.
- Add tests for direct sidebar jumps, malformed zones and backend rejection.

### P1 — make Pore Injection scientifically inspectable

- Move the feature into a first-class “Biocompatibility / Pore Injection”
  workspace while retaining per-zone configuration.
- Expose detector tolerance, minimum cell size, safe-Z and travel settings.
- Add a preview-only detector that returns the pore map before G-code mutation.
- Replace the fixed syringe conversion with a calibration profile per tip and
  material.
- Emit a machine-readable pore report in the manifest and archive it with the
  protocol.

### P2 — controlled execution

- Add a dry-run / simulation gate before Moonraker hand-off.
- Validate reservoir capacity, tool offsets, collision clearance and safe
  return to the active tool.
- Record operator, material lot, syringe tip, calibration, software version,
  detector result and final G-code hash for reproducibility.
