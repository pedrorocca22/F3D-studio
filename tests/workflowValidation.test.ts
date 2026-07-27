import { describe, expect, it } from 'vitest';
import { GlobalSettings, ModelData, ToolheadConfig, ZZone } from '../types';
import { getStepBlocker, getWorkflowIssues } from '../utils/workflowValidation';

const baseSettings: GlobalSettings = {
  layerHeight: 200,
  infill: 15,
  infillPattern: 'grid',
  perimeters: 3,
  nozzleDiameter: 0.4,
  printBed: { type: 'glass_bed', dimensions: { width: 100, height: 100 } },
};

const model: ModelData = {
  id: 'model-1',
  name: 'Scaffold',
  file: new File(['solid scaffold'], 'scaffold.stl'),
  url: 'blob:test',
  transform: {
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 },
  },
  settings: {},
  advancedSettings: { enabled: false, segments: [] },
  toolhead: 'fdm',
};

const fdm: ToolheadConfig = {
  id: 'fdm', label: 'FDM', klipper_tool: 'T0', installed: true, slot: 0,
  nozzleDiameter: 0.4, filamentDiameter: 1.75, maxTemperature: 280,
  defaultTemperature: 210, retractionLength: 1, retractionSpeed: 45,
};

const syringe: ToolheadConfig = {
  id: 'syringe', label: 'Syringe', klipper_tool: 'T1', installed: true, slot: 1,
  syringeVolumeMl: 5, nozzleDiameterMm: 0.4, flowRateUlPerMm: 0.8,
  pressurizationSteps: 10, retractionSteps: 5, actuatorType: 'mechanical',
};

const zone = (poreInjection?: NonNullable<ZZone['parameterOverride']>['poreInjection']): ZZone => ({
  id: 'zone-1', modelScope: 'all', zStartMm: 0, zEndMm: 5, enabled: true, priority: 1,
  label: 'Pore zone', parameterOverride: poreInjection ? { fdm: { infillPattern: 'grid' }, poreInjection } : undefined,
});

describe('workflow validation', () => {
  it('blocks progression when the print surface and toolheads are not configured', () => {
    const issues = getWorkflowIssues({
      globalSettings: { ...baseSettings, printBed: undefined },
      models: [], toolheads: [], zZones: [],
    });

    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'environment.bed.missing',
      'environment.toolheads.missing',
      'models.missing',
    ]));
    expect(getStepBlocker({
      globalSettings: { ...baseSettings, printBed: undefined },
      models: [], toolheads: [], zZones: [],
    }, 1)?.code).toBe('environment.bed.missing');
  });

  it('requires every mapped toolhead to be assigned', () => {
    const issues = getWorkflowIssues({
      globalSettings: baseSettings, models: [model], toolheads: [], zZones: [],
    });
    expect(issues.some(issue => issue.code.includes('mapping.toolhead'))).toBe(true);
  });

  it('does not invent an FDM requirement for an unassigned model', () => {
    const syringeOnlyModel = { ...model, toolhead: 'none' as const, scaffoldTools: undefined };
    const issues = getWorkflowIssues({
      globalSettings: baseSettings,
      models: [syringeOnlyModel],
      toolheads: [syringe],
      zZones: [],
    });

    expect(issues.some(issue => issue.code.includes('.fdm'))).toBe(false);
    expect(issues.some(issue => issue.code === 'mapping.model.missing.model-1')).toBe(true);
  });

  it('accepts a syringe-only model when every feature is explicitly mapped', () => {
    const syringeOnlyModel = {
      ...model,
      toolhead: 'none' as const,
      scaffoldTools: {
        perimeter: 'syringe' as const,
        infill: 'syringe' as const,
        solidInfill: 'syringe' as const,
        support: 'syringe' as const,
      },
    };
    const issues = getWorkflowIssues({
      globalSettings: baseSettings,
      models: [syringeOnlyModel],
      toolheads: [syringe],
      zZones: [],
    });

    expect(issues.filter(issue => issue.step === 3)).toHaveLength(0);
  });

  it('blocks pore injection without GRID and a syringe', () => {
    const pore = {
      enabled: true, mode: 'layer_by_layer' as const, syringeToolhead: 'syringe' as const,
      zStartMm: 0, zEndMm: 5, injectionDepthMm: 0.3, flowRateUlPerCell: 0.5,
      travelFeedrateMmMin: 6000, injectionFeedrateMmMin: 120,
    };
    const issues = getWorkflowIssues({
      globalSettings: { ...baseSettings, infillPattern: 'gyroid' },
      models: [model], toolheads: [fdm], zZones: [
        { ...zone(pore), parameterOverride: { fdm: { infillPattern: 'gyroid' }, poreInjection: pore } },
      ],
    });
    expect(issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'pore.pattern.zone-1',
      'pore.toolhead.zone-1',
    ]));
  });

  it('accepts a valid FDM + syringe pore workflow', () => {
    const pore = {
      enabled: true, mode: 'layer_by_layer' as const, syringeToolhead: 'syringe' as const,
      zStartMm: 0, zEndMm: 5, injectionDepthMm: 0.3, flowRateUlPerCell: 0.5,
      travelFeedrateMmMin: 6000, injectionFeedrateMmMin: 120,
    };
    const issues = getWorkflowIssues({
      globalSettings: baseSettings, models: [model], toolheads: [fdm, syringe], zZones: [zone(pore)],
    });
    expect(issues.filter(issue => issue.severity === 'error')).toHaveLength(0);
  });

  it('accepts whole-scaffold pore injection without requiring a Z-zone', () => {
    const pore = {
      enabled: true, mode: 'layer_by_layer' as const, syringeToolhead: 'syringe' as const,
      zStartMm: 0, zEndMm: 5, injectionDepthMm: 0.3, flowRateUlPerCell: 0.5,
      travelFeedrateMmMin: 6000, injectionFeedrateMmMin: 120,
    };
    const issues = getWorkflowIssues({
      globalSettings: { ...baseSettings, poreInjection: pore },
      models: [model], toolheads: [fdm, syringe], zZones: [],
    });
    expect(issues.filter(issue => issue.severity === 'error')).toHaveLength(0);
  });

  it('uses the model pattern when a model overrides the global GRID default', () => {
    const pore = {
      enabled: true, mode: 'layer_by_layer' as const, syringeToolhead: 'syringe' as const,
      zStartMm: 0, zEndMm: 5, injectionDepthMm: 0.3, flowRateUlPerCell: 0.5,
      travelFeedrateMmMin: 6000, injectionFeedrateMmMin: 120,
    };
    const modelWithGyroid = { ...model, fdmSettings: { infillPattern: 'gyroid' as const } };
    const modelZone = { ...zone(), parameterOverride: { poreInjection: pore } };
    const issues = getWorkflowIssues({
      globalSettings: baseSettings, models: [modelWithGyroid], toolheads: [fdm, syringe], zZones: [modelZone],
    });
    expect(issues.some(issue => issue.code === 'pore.pattern.zone-1')).toBe(true);
  });
});
