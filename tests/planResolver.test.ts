import { describe, it, expect } from 'vitest';
import { resolveLayerPlans } from '../utils/planResolver';
import type { ModelData, ToolheadConfig, ZZone } from '../types';

/**
 * Unit tests for the Z-Zone resolver (the most valuable piece of frontend logic).
 * These tests document and protect the CURRENT behavior of resolveLayerPlans.
 * Some mmToLayer outputs are non-intuitive (epsilon -0.001) — they are pinned here
 * on purpose so any future change to the formula is caught.
 */

// ---------------------------------------------------------------------------
// Minimal factory helpers — ModelData has many required fields, but the resolver
// only touches id, name, toolhead, scaffoldTools, fdmSettings. We build a minimal
// fixture via `as ModelData` to keep the tests readable.
// ---------------------------------------------------------------------------

function makeModel(overrides: Partial<ModelData> & { id: string } = { id: 'm1' }): ModelData {
  return {
    id: overrides.id,
    name: overrides.name ?? `model-${overrides.id}`,
    // The resolver never reads these; stubbed to satisfy the type.
    url: '',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
    settings: {} as ModelData['settings'],
    advancedSettings: {} as ModelData['advancedSettings'],
    ...overrides,
  } as ModelData;
}

function makeZone(overrides: Partial<ZZone> & { id: string }): ZZone {
  return {
    id: overrides.id,
    modelScope: overrides.modelScope ?? 'all',
    zStartMm: overrides.zStartMm ?? 0,
    zEndMm: overrides.zEndMm ?? 1,
    enabled: overrides.enabled ?? true,
    priority: overrides.priority ?? 0,
    ...overrides,
  } as ZZone;
}

// ---------------------------------------------------------------------------
// A. mmToLayer — Z (mm) → layer index conversion (tested via zone layer range)
//    Formula (defaults lh=0.2, flh=0.3):
//      zMm <= firstLayerHeightMm + 0.001          → 1
//      Math.floor((zMm - flh - 0.001) / lh) + 2   → N
// ---------------------------------------------------------------------------

describe('resolveLayerPlans — Z-to-layer conversion (mmToLayer)', () => {
  // Build a plan with a single feature_override zone; the resulting range that
  // carries the override has layerFrom/layerTo derived from the zone's z-range.
  const rangeOfOverride = (zone: ZZone, totalLayers = 10) => {
    const model = makeModel({ id: 'm1', toolhead: 'fdm' });
    const plan = resolveLayerPlans([model], totalLayers, [zone]);
    // The override zone applies a toolhead change; find the range where mapping.infill != 'fdm'
    // or — simpler — return the bounds of all ranges where the zone had any effect.
    // For feature_override with targetFeatures:['infill'] toolhead 'syringe', the affected
    // range is the one whose settings.mapping.infill === 'syringe'.
    const affected = plan[0].ranges.filter(r => r.settings.mapping.infill === 'syringe');
    if (affected.length === 0) return null;
    return {
      layerFrom: Math.min(...affected.map(r => r.layerFrom)),
      layerTo: Math.max(...affected.map(r => r.layerTo)),
    };
  };

  it('maps z within first layer height to layer 1', () => {
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0,
      zEndMm: 0.3,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    const r = rangeOfOverride(zone);
    expect(r).toEqual({ layerFrom: 1, layerTo: 1 });
  });

  it('epsilon -0.001 makes z=0.500 → layer 2 but z=0.501 → layer 3 (sensitive, pinned)', () => {
    // Formula: Math.floor((zMm - 0.3 - 0.001) / 0.2) + 2
    //   z=0.500: (0.500-0.3-0.001)/0.2 = 0.199/0.2 = 0.995 → floor=0 → layer 2
    //   z=0.501: (0.501-0.3-0.001)/0.2 = 0.200/0.2 = 1.000 → floor=1 → layer 3
    // A 1µm change in z flips the layer. This is the most fragile part of mmToLayer.
    const zoneLow = makeZone({
      id: 'z1',
      zStartMm: 0.3,
      zEndMm: 0.500,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    expect(rangeOfOverride(zoneLow)).toEqual({ layerFrom: 1, layerTo: 2 });

    const zoneHigh = makeZone({
      id: 'z1',
      zStartMm: 0.3,
      zEndMm: 0.501,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    expect(rangeOfOverride(zoneHigh)).toEqual({ layerFrom: 1, layerTo: 3 });
  });

  it('z well beyond first layer scales linearly (z=1.0 → layer 5)', () => {
    // (1.0-0.3-0.001)/0.2 = 3.495 → floor=3 → layer 5
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0.3,
      zEndMm: 1.0,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    expect(rangeOfOverride(zone)).toEqual({ layerFrom: 1, layerTo: 5 });
  });

  it('negative zStartMm clamps to layer 1', () => {
    const zone = makeZone({
      id: 'z1',
      zStartMm: -1,
      zEndMm: 0.2,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    const r = rangeOfOverride(zone);
    expect(r).toEqual({ layerFrom: 1, layerTo: 1 });
  });
});

// ---------------------------------------------------------------------------
// B. Input edge cases
// ---------------------------------------------------------------------------

describe('resolveLayerPlans — input edge cases', () => {
  it('returns [] when models is empty', () => {
    expect(resolveLayerPlans([], 10, [])).toEqual([]);
  });

  it('returns a plan with empty ranges when totalLayers is 0', () => {
    const plan = resolveLayerPlans([makeModel({ id: 'm1' })], 0, []);
    expect(plan).toHaveLength(1);
    expect(plan[0].ranges).toEqual([]);
  });

  it('returns a single range [1..1] when totalLayers is 1', () => {
    const plan = resolveLayerPlans([makeModel({ id: 'm1' })], 1, []);
    expect(plan[0].ranges).toEqual([
      { layerFrom: 1, layerTo: 1, settings: expect.any(Object) },
    ]);
  });

  it('ignores zones with enabled === false', () => {
    const zone = makeZone({
      id: 'z1',
      enabled: false,
      zStartMm: 0,
      zEndMm: 5,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    const plan = resolveLayerPlans([makeModel({ id: 'm1', toolhead: 'fdm' })], 10, [zone]);
    // No zone applied → mapping.infill stays 'fdm' everywhere.
    plan[0].ranges.forEach(r => {
      expect(r.settings.mapping.infill).toBe('fdm');
    });
  });

  it('DOES apply zones with enabled === undefined (filter is "!== false")', () => {
    const zone = makeZone({
      id: 'z1',
      // enabled intentionally omitted
      zStartMm: 0,
      zEndMm: 0.3,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    }) as ZZone;
    delete (zone as { enabled?: boolean }).enabled;
    const plan = resolveLayerPlans([makeModel({ id: 'm1', toolhead: 'fdm' })], 10, [zone]);
    const layer1 = plan[0].ranges.find(r => r.layerFrom === 1 && r.layerTo === 1);
    expect(layer1?.settings.mapping.infill).toBe('syringe');
  });
});

// ---------------------------------------------------------------------------
// C. Priority & overrides
// ---------------------------------------------------------------------------

describe('resolveLayerPlans — priority and override application', () => {
  it('feature_override with targetFeatures ["infill"] only changes infill mapping', () => {
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0,
      zEndMm: 0.3,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    const plan = resolveLayerPlans([makeModel({ id: 'm1', toolhead: 'fdm' })], 5, [zone]);
    const layer1 = plan[0].ranges.find(r => r.layerFrom === 1);
    expect(layer1?.settings.mapping).toEqual({
      perimeter: 'fdm',
      infill: 'syringe', // only this one changed
      solidInfill: 'fdm',
      bottomLayers: 'fdm',
      topLayers: 'fdm',
      support: 'fdm',
    });
  });

  it('feature_override with targetFeatures ["all"] changes all four features', () => {
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0,
      zEndMm: 0.3,
      featureOverride: { toolhead: 'uv', targetFeatures: ['all'] },
    });
    const plan = resolveLayerPlans([makeModel({ id: 'm1', toolhead: 'fdm' })], 5, [zone]);
    const layer1 = plan[0].ranges.find(r => r.layerFrom === 1);
    expect(layer1?.settings.mapping).toEqual({
      perimeter: 'uv',
      infill: 'uv',
      solidInfill: 'uv',
      bottomLayers: 'uv',
      topLayers: 'uv',
      support: 'uv',
    });
  });

  it('higher priority zone wins over lower priority on overlap', () => {
    // Zone A (priority 1): infill → syringe, layers 1..5
    const zoneA = makeZone({
      id: 'a',
      zStartMm: 0,
      zEndMm: 1.0,
      priority: 1,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    // Zone B (priority 2): infill → uv, layers 1..5 (overlaps A)
    const zoneB = makeZone({
      id: 'b',
      zStartMm: 0,
      zEndMm: 1.0,
      priority: 2,
      featureOverride: { toolhead: 'uv', targetFeatures: ['infill'] },
    });
    const plan = resolveLayerPlans([makeModel({ id: 'm1', toolhead: 'fdm' })], 5, [zoneA, zoneB]);
    const layer1 = plan[0].ranges.find(r => r.layerFrom === 1);
    // B applied last (higher priority) → uv wins
    expect(layer1?.settings.mapping.infill).toBe('uv');
  });

  it('parameter_override merges fdmSettings over base model fdmSettings', () => {
    const model = makeModel({
      id: 'm1',
      fdmSettings: { layer_height: 0.2, temperature: 200 } as ModelData['fdmSettings'],
    });
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0,
      zEndMm: 0.3,
      parameterOverride: {
        fdm: { temperature: 220 } as ZZone['parameterOverride'] extends infer T
          ? T extends { fdm?: infer F } ? F : never : never,
      },
    });
    const plan = resolveLayerPlans([model], 5, [zone]);
    const layer1 = plan[0].ranges.find(r => r.layerFrom === 1);
    expect(layer1?.settings.fdm).toMatchObject({ layer_height: 0.2, temperature: 220 });
  });

  it('process_event zone populates uv settings', () => {
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0,
      zEndMm: 0.3,
      processEvent: {
        uvExposureTimeSec: 10,
        doseTargetMjCm2: 5000,
        pausePrint: true,
      },
    });
    const plan = resolveLayerPlans([makeModel({ id: 'm1' })], 5, [zone]);
    const layer1 = plan[0].ranges.find(r => r.layerFrom === 1);
    expect(layer1?.settings.uv).toEqual({
      doseTargetMjCm2: 5000,
      exposureTimeSec: 10,
      pausePrint: true,
      mode: 'stationary',
      powerPercentage: 100,
    });
  });

  it('inherits UV dose, exposure and mode from the central head profile', () => {
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0,
      zEndMm: 0.3,
      processEvent: { pausePrint: false },
    });
    const uvHead = {
      id: 'uv', label: 'UV', klipper_tool: 'T2', installed: true, slot: 2,
      wavelengthNm: 405, maxPowerMw: 250, defaultDose: 72,
      defaultExposureTime: 8, mode: 'scanning',
    } as ToolheadConfig;
    const plan = resolveLayerPlans([makeModel({ id: 'm1' })], 5, [zone], 0.2, 0.3, [uvHead]);
    const layer1 = plan[0].ranges.find(range => range.layerFrom === 1);

    expect(layer1?.settings.uv).toMatchObject({
      doseTargetMjCm2: 72,
      exposureTimeSec: 8,
      mode: 'sweep',
      powerPercentage: 100,
    });
  });
});

// ---------------------------------------------------------------------------
// D. Range compaction + stableStringify (FIX #12)
// ---------------------------------------------------------------------------

describe('resolveLayerPlans — range compaction & stable equality (FIX #12)', () => {
  it('resolves bottom, internal solid and top tools into separate layer ranges', () => {
    const model = makeModel({
      id: 'm1',
      scaffoldTools: {
        perimeter: 'fdm',
        infill: 'fdm',
        solidInfill: 'solid-tool',
        bottomLayers: 'bottom-tool',
        topLayers: 'top-tool',
        support: 'none',
      },
    });

    const plan = resolveLayerPlans(
      [model],
      10,
      [],
      0.2,
      0.3,
      [],
      { bottom: 2, top: 3 },
    );

    expect(plan[0].ranges.map(range => ({
      from: range.layerFrom,
      to: range.layerTo,
      solidTool: range.settings.mapping.solidInfill,
    }))).toEqual([
      { from: 1, to: 2, solidTool: 'bottom-tool' },
      { from: 3, to: 7, solidTool: 'solid-tool' },
      { from: 8, to: 10, solidTool: 'top-tool' },
    ]);
  });

  it('compacts identical layers into a single range [1..N]', () => {
    const plan = resolveLayerPlans([makeModel({ id: 'm1', toolhead: 'fdm' })], 10, []);
    expect(plan[0].ranges).toHaveLength(1);
    expect(plan[0].ranges[0]).toMatchObject({ layerFrom: 1, layerTo: 10 });
  });

  it('splits into multiple ranges when a zone changes settings mid-height', () => {
    // Want the override on layers 3..5 (default flh=0.3, lh=0.2).
    //   layerFrom=3 → zStartMm in [0.501, 0.701): pick 0.501
    //   layerTo=5   → zEndMm   in [0.901, 1.101): pick 1.0
    //     verify: Math.floor((1.0 - 0.3 - 0.001) / 0.2) + 2 = Math.floor(3.495) + 2 = 5 ✓
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0.501,
      zEndMm: 1.0,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    const plan = resolveLayerPlans([makeModel({ id: 'm1', toolhead: 'fdm' })], 10, [zone]);
    // Expect 3 ranges: [1..2] fdm, [3..5] syringe, [6..10] fdm
    expect(plan[0].ranges).toHaveLength(3);
    expect(plan[0].ranges[0]).toMatchObject({ layerFrom: 1, layerTo: 2 });
    expect(plan[0].ranges[1]).toMatchObject({ layerFrom: 3, layerTo: 5 });
    expect(plan[0].ranges[1].settings.mapping.infill).toBe('syringe');
    expect(plan[0].ranges[2]).toMatchObject({ layerFrom: 6, layerTo: 10 });
  });

  it('treats two settings built with different key insertion order as equal (stableStringify)', () => {
    // Two zones that produce semantically identical mappings but via different assignment paths:
    //   - model with scaffoldTools {perimeter:fdm, infill:fdm, solidInfill:fdm, support:fdm}
    //   - feature_override with targetFeatures ['all'] toolhead 'fdm'
    // Both should yield the same settings object → single compacted range covering the whole print.
    const model = makeModel({
      id: 'm1',
      scaffoldTools: { perimeter: 'fdm', infill: 'fdm', solidInfill: 'fdm', support: 'fdm' },
    });
    const zone = makeZone({
      id: 'z1',
      zStartMm: 0,
      zEndMm: 0.3,
      featureOverride: { toolhead: 'fdm', targetFeatures: ['all'] },
    });
    const plan = resolveLayerPlans([model], 8, [zone]);
    // If stableStringify works, layers 1 and 2 (one through zone, one outside) are equal
    // and the whole plan compacts to a single range.
    expect(plan[0].ranges).toHaveLength(1);
    expect(plan[0].ranges[0]).toMatchObject({ layerFrom: 1, layerTo: 8 });
  });
});

// ---------------------------------------------------------------------------
// E. modelScope
// ---------------------------------------------------------------------------

describe('resolveLayerPlans — modelScope filtering', () => {
  it('modelScope "all" applies to every model', () => {
    const zone = makeZone({
      id: 'z1',
      modelScope: 'all',
      zStartMm: 0,
      zEndMm: 0.3,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    const plans = resolveLayerPlans(
      [makeModel({ id: 'a', toolhead: 'fdm' }), makeModel({ id: 'b', toolhead: 'fdm' })],
      5,
      [zone]
    );
    plans.forEach(p => {
      const l1 = p.ranges.find(r => r.layerFrom === 1);
      expect(l1?.settings.mapping.infill).toBe('syringe');
    });
  });

  it('modelScope targeting a specific modelId only affects that model', () => {
    const zone = makeZone({
      id: 'z1',
      modelScope: 'a',
      zStartMm: 0,
      zEndMm: 0.3,
      featureOverride: { toolhead: 'syringe', targetFeatures: ['infill'] },
    });
    const plans = resolveLayerPlans(
      [makeModel({ id: 'a', toolhead: 'fdm' }), makeModel({ id: 'b', toolhead: 'fdm' })],
      5,
      [zone]
    );
    const planA = plans.find(p => p.modelId === 'a')!;
    const planB = plans.find(p => p.modelId === 'b')!;
    expect(planA.ranges.find(r => r.layerFrom === 1)?.settings.mapping.infill).toBe('syringe');
    expect(planB.ranges.find(r => r.layerFrom === 1)?.settings.mapping.infill).toBe('fdm');
  });
});
