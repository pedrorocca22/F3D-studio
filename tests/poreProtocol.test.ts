import { describe, expect, it } from 'vitest';
import { GlobalSettings, ModelData, ToolheadConfig } from '../types';
import { buildPoreProtocolPreflight } from '../utils/poreProtocol';

const settings: GlobalSettings = {
  layerHeight: 200,
  infill: 15,
  infillPattern: 'grid',
  printBed: { type: 'glass_bed', dimensions: { width: 100, height: 100 } },
};

const model: ModelData = {
  id: 'm1', name: 'Scaffold', url: 'blob:test', file: new File(['stl'], 'scaffold.stl'),
  transform: { rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, position: { x: 0, y: 0, z: 0 } },
  settings: {}, advancedSettings: { enabled: false, segments: [] }, size: { x: 20, y: 20, z: 5 }, toolhead: 'fdm',
};

const fdm: ToolheadConfig = {
  id: 'fdm', label: 'FDM', klipper_tool: 'T0', installed: true, slot: 0,
  nozzleDiameter: 0.4, filamentDiameter: 1.75, maxTemperature: 280, defaultTemperature: 210,
  retractionLength: 1, retractionSpeed: 45,
};

const syringe: ToolheadConfig = {
  id: 'syringe', label: 'Syringe', klipper_tool: 'T1', installed: true, slot: 1,
  syringeVolumeMl: 5, nozzleDiameterMm: 0.4, flowRateUlPerMm: 0.8, pressurizationSteps: 10,
  retractionSteps: 5, actuatorType: 'mechanical', tipId: '22ga_blue',
};

const pore = {
  enabled: true, mode: 'layer_by_layer' as const, syringeToolhead: 'syringe' as const,
  zStartMm: 0, zEndMm: 5, injectionDepthMm: 0.3, flowRateUlPerCell: 0.5,
  travelFeedrateMmMin: 6000, injectionFeedrateMmMin: 120, calibrationUlPerMm: 0.8,
};

describe('pore protocol preflight', () => {
  it('calculates geometry and volume before slicing', () => {
    const result = buildPoreProtocolPreflight({
      globalSettings: { ...settings, poreInjection: pore }, models: [model], zZones: [],
      toolheads: [fdm, syringe], selectedMaterials: { syringe: 'gelma' },
      userMaterials: [{ id: 'gelma', name: 'GelMA', category: 'hydrogel', color: '#f59e0b' }],
    });

    expect(result.status).toBe('ready');
    expect(result.scope).toBe('global');
    expect(result.estimatedPoreCount).toBeGreaterThan(0);
    expect(result.availableVolumeUl).toBeGreaterThan(result.requestedVolumeUl);
    expect(result.tipId).toBe('22ga_blue');
  });

  it('blocks a protocol without bioink or tip metadata', () => {
    const result = buildPoreProtocolPreflight({
      globalSettings: { ...settings, poreInjection: pore }, models: [model], zZones: [],
      toolheads: [{ ...syringe, tipId: undefined }], selectedMaterials: {}, userMaterials: [],
    });

    expect(result.status).toBe('blocked');
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'pore.bioink.missing', 'pore.tip.missing',
    ]));
  });
});
