import {
  FDMToolheadConfig,
  SyringeToolheadConfig,
  ToolheadConfig,
  ToolheadType,
  UVToolheadConfig,
} from '../types';

export const TOOLHEAD_TYPE_LABELS: Record<ToolheadType, string> = {
  fdm: 'FDM',
  syringe: 'Hydrogel',
  uv: 'UV',
};

export const getToolheadType = (tool: ToolheadConfig): ToolheadType => {
  if (tool.type) return tool.type;
  if (tool.id === 'fdm' || tool.id === 'syringe' || tool.id === 'uv') return tool.id;
  if ('syringeVolumeMl' in tool) return 'syringe';
  if ('wavelengthNm' in tool) return 'uv';
  return 'fdm';
};

export const isFdmToolhead = (tool?: ToolheadConfig): tool is FDMToolheadConfig =>
  Boolean(tool && getToolheadType(tool) === 'fdm');

export const isSyringeToolhead = (tool?: ToolheadConfig): tool is SyringeToolheadConfig =>
  Boolean(tool && getToolheadType(tool) === 'syringe');

export const isUvToolhead = (tool?: ToolheadConfig): tool is UVToolheadConfig =>
  Boolean(tool && getToolheadType(tool) === 'uv');

const instanceId = (type: ToolheadType): string => {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${type}-${suffix}`;
};

export const createToolhead = (
  type: ToolheadType,
  slot: number,
  id = instanceId(type),
): ToolheadConfig => {
  const base = {
    id,
    slot,
    installed: true,
    klipper_tool: `T${slot}`,
  };

  if (type === 'fdm') {
    return {
      ...base,
      type: 'fdm',
      label: 'FDM head',
      nozzleDiameter: 0.4,
      filamentDiameter: 1.75,
      maxTemperature: 280,
      defaultTemperature: 210,
      retractionLength: 1,
      retractionSpeed: 45,
      flowratePercent: 100,
      retractDistance: 1,
      zLiftDistance: 0.4,
    };
  }
  if (type === 'syringe') {
    return {
      ...base,
      type: 'syringe',
      label: 'Hydrogel syringe',
      syringeVolumeMl: 5,
      nozzleDiameterMm: 0.4,
      flowRateUlPerMm: 0.8,
      pressurizationSteps: 10,
      retractionSteps: 5,
      actuatorType: 'mechanical',
      flowrateMmPerSec: 2,
      retractDistance: 1,
    };
  }
  return {
    ...base,
    type: 'uv',
    label: 'UV head',
    wavelengthNm: 365,
    maxPowerMw: 100,
    defaultDose: 50,
    defaultExposureTime: 5,
    mode: 'fixed',
  };
};

export const normalizeToolheads = (loaded?: ToolheadConfig[]): ToolheadConfig[] =>
  (loaded ?? [])
    .filter(tool => tool.slot !== undefined || tool.installed)
    .map((tool, index) => {
      const type = getToolheadType(tool);
      const slot = tool.slot ?? index;
      return {
        ...createToolhead(type, slot, tool.id || instanceId(type)),
        ...tool,
        type,
        slot,
        installed: true,
        klipper_tool: `T${slot}`,
      } as ToolheadConfig;
    });

export const toolheadDisplayName = (tool: ToolheadConfig): string =>
  `${TOOLHEAD_TYPE_LABELS[getToolheadType(tool)]} · T${tool.slot ?? '?'}`;
