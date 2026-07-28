import {
  GlobalSettings,
  ModelData,
  ToolheadConfig,
  ToolheadId,
  ZZone,
} from '../types';
import { isFdmToolhead, isSyringeToolhead, isUvToolhead } from './toolheads';

export type WorkflowStep = 1 | 2 | 3 | 4 | 5 | 6;
export type WorkflowIssueSeverity = 'error' | 'warning';

export interface WorkflowIssue {
  code: string;
  step: WorkflowStep;
  severity: WorkflowIssueSeverity;
  message: string;
}

export interface WorkflowValidationContext {
  globalSettings: GlobalSettings;
  models: ModelData[];
  toolheads: ToolheadConfig[];
  zZones: ZZone[];
  selectedMaterials?: Record<string, string>;
}

export const getEffectiveInfillPattern = (
  globalSettings: GlobalSettings,
  model?: ModelData,
  zone?: ZZone,
) => zone?.parameterOverride?.fdm?.infillPattern
  ?? model?.fdmSettings?.infillPattern
  ?? globalSettings.infillPattern
  ?? 'grid';

export const isGridInfillForPoreZone = (
  ctx: WorkflowValidationContext,
  zone: ZZone,
) => {
  const scopedModels = zone.modelScope === 'all'
    ? ctx.models
    : ctx.models.filter(model => model.id === zone.modelScope);
  if (scopedModels.length === 0) return getEffectiveInfillPattern(ctx.globalSettings, undefined, zone) === 'grid';
  return scopedModels.every(model => getEffectiveInfillPattern(ctx.globalSettings, model, zone) === 'grid');
};

const VALID_BED_TYPES = new Set(['glass_bed', 'petri_dish', 'multiwell_plate']);
const VALID_WELL_FORMATS = new Set([6, 12, 24, 48]);

const assignedToolIds = (toolheads: ToolheadConfig[]): Set<ToolheadId> =>
  new Set(toolheads.filter(tool => tool.slot !== undefined).map(tool => tool.id));

const effectiveModelTools = (model: ModelData) => ({
  perimeter: model.scaffoldTools?.perimeter ?? model.toolhead ?? 'none',
  infill: model.scaffoldTools?.infill ?? model.toolhead ?? 'none',
  solidInfill: model.scaffoldTools?.solidInfill ?? model.toolhead ?? 'none',
  bottomLayers: model.scaffoldTools?.bottomLayers ?? model.scaffoldTools?.solidInfill ?? model.toolhead ?? 'none',
  topLayers: model.scaffoldTools?.topLayers ?? model.scaffoldTools?.solidInfill ?? model.toolhead ?? 'none',
  support: model.scaffoldTools?.support ?? model.toolhead ?? 'none',
});

const add = (
  issues: WorkflowIssue[],
  code: string,
  step: WorkflowStep,
  message: string,
  severity: WorkflowIssueSeverity = 'error',
) => issues.push({ code, step, severity, message });

const validateEnvironment = (
  ctx: WorkflowValidationContext,
  issues: WorkflowIssue[],
) => {
  const bed = ctx.globalSettings.printBed;

  if (!bed) {
    add(issues, 'environment.bed.missing', 1, 'Select a print surface before continuing.');
  } else if (!VALID_BED_TYPES.has(bed.type)) {
    add(issues, 'environment.bed.type', 1, 'The selected print surface is not supported.');
  } else if (bed.type === 'glass_bed') {
    const width = bed.dimensions?.width ?? 0;
    const depth = bed.dimensions?.height ?? 0;
    if (width <= 0 || depth <= 0) {
      add(issues, 'environment.bed.dimensions', 1, 'Glass bed dimensions must be greater than zero.');
    }
  } else if (bed.type === 'petri_dish' && !bed.petriDiameter) {
    add(issues, 'environment.bed.diameter', 1, 'Choose a Petri dish diameter.');
  } else if (bed.type === 'multiwell_plate' && !VALID_WELL_FORMATS.has(bed.multiwellFormat ?? 0)) {
    add(issues, 'environment.bed.format', 1, 'Choose a valid multiwell plate format.');
  }

  if (assignedToolIds(ctx.toolheads).size === 0) {
    add(issues, 'environment.toolheads.missing', 1, 'Assign at least one toolhead to a machine slot.');
  }
};

const validateModels = (
  ctx: WorkflowValidationContext,
  issues: WorkflowIssue[],
) => {
  if (ctx.models.length === 0) {
    add(issues, 'models.missing', 2, 'Load or create at least one model before continuing.');
    return;
  }

  if (ctx.models.some(model => !model.file)) {
    add(
      issues,
      'models.file.missing',
      6,
      'Every model must have a local STL file before slicing.',
    );
  }
};

const validateMapping = (
  ctx: WorkflowValidationContext,
  issues: WorkflowIssue[],
) => {
  const assigned = assignedToolIds(ctx.toolheads);

  ctx.models.forEach(model => {
    const mapping = effectiveModelTools(model);
    const activeTools = [mapping.perimeter, mapping.infill, mapping.solidInfill, mapping.bottomLayers, mapping.topLayers, mapping.support]
      .filter(toolId => toolId !== 'none');
    if (activeTools.length === 0) {
      add(
        issues,
        `mapping.model.missing.${model.id}`,
        4,
        `Assign a toolhead to model “${model.name}” before continuing.`,
      );
    }
    const required = new Set([
      mapping.perimeter,
      mapping.infill,
      mapping.solidInfill,
      ...((ctx.globalSettings.bottomSolidLayers ?? 3) > 0 ? [mapping.bottomLayers] : []),
      ...((ctx.globalSettings.topSolidLayers ?? 3) > 0 ? [mapping.topLayers] : []),
    ]);
    if (ctx.globalSettings.supportsEnabled) required.add(mapping.support);

    required.forEach(toolId => {
      if (toolId !== 'none' && !assigned.has(toolId)) {
        add(
          issues,
          `mapping.toolhead.${model.id}.${toolId}`,
          4,
          `Model “${model.name}” references ${toolId.toUpperCase()}, but that toolhead is not assigned.`,
        );
      }
    });
  });
};

const validateSettings = (
  ctx: WorkflowValidationContext,
  issues: WorkflowIssue[],
) => {
  const settings = ctx.globalSettings;
  if (settings.layerHeight < 50 || settings.layerHeight > 400) {
    add(issues, 'settings.layer_height', 4, 'Layer height must be between 50 and 400 µm.');
  }
  if ((settings.infill ?? 0) < 0 || (settings.infill ?? 0) > 100) {
    add(issues, 'settings.infill', 4, 'Infill must be between 0 and 100%.');
  }
  if ((settings.perimeters ?? 0) < 0) {
    add(issues, 'settings.perimeters', 4, 'Wall count cannot be negative.');
  }
  const fdmHead = ctx.toolheads.find(isFdmToolhead);
  const nozzleDiameter = fdmHead?.nozzleDiameter ?? settings.nozzleDiameter;
  if ((nozzleDiameter ?? 0) <= 0) {
    add(issues, 'settings.nozzle', 4, 'Nozzle diameter must be greater than zero.');
  }
};

const validateZones = (
  ctx: WorkflowValidationContext,
  issues: WorkflowIssue[],
) => {
  const assigned = assignedToolIds(ctx.toolheads);
  const globalPore = ctx.globalSettings.poreInjection;
  const activePoreZones = ctx.zZones.filter(zone => zone.parameterOverride?.poreInjection?.enabled);
  const configuredSyringeId = globalPore?.syringeToolhead;
  const syringeHead = ctx.toolheads.filter(isSyringeToolhead).find(tool => tool.slot !== undefined && (
    !configuredSyringeId || configuredSyringeId === 'syringe' || tool.id === configuredSyringeId
  ));
  const syringeCalibration = syringeHead?.flowRateUlPerMm;

  if (globalPore?.enabled) {
    if (!ctx.models.every(model => getEffectiveInfillPattern(ctx.globalSettings, model) === 'grid')) {
      add(issues, 'pore.pattern.global', 5, 'Whole-scaffold Pore Injection requires the GRID infill pattern for every model.');
    }
    if (!syringeHead) {
      add(issues, 'pore.toolhead.global', 5, 'Whole-scaffold Pore Injection requires an assigned syringe toolhead.');
    }
    if (String(globalPore.mode) !== 'layer_by_layer') {
      add(issues, 'pore.mode.global', 5, 'Only layer-by-layer Pore Injection is currently supported.');
    }
    if (globalPore.flowRateUlPerCell <= 0) {
      add(issues, 'pore.parameters.global', 5, 'Whole-scaffold Pore Injection requires a positive volume per pore.');
    }
    if (!syringeCalibration || syringeCalibration <= 0) {
      add(issues, 'pore.calibration.global', 5, 'The assigned syringe head requires a valid dose calibration.');
    }
  }

  ctx.zZones.forEach(zone => {
    if (zone.zStartMm < 0 || zone.zEndMm <= zone.zStartMm) {
      add(issues, `zones.range.${zone.id}`, 5, `Zone “${zone.label || zone.id}” has an invalid Z range.`);
    }

    const featureTools = zone.featureOverride?.scaffoldTools
      ? Object.values(zone.featureOverride.scaffoldTools)
      : [zone.featureOverride?.toolhead];
    featureTools.filter(Boolean).forEach(toolId => {
      if (toolId !== 'none' && !assigned.has(toolId as ToolheadId)) {
        add(
          issues,
          `zones.toolhead.${zone.id}.${toolId}`,
          5,
          `Zone “${zone.label || zone.id}” references an unassigned toolhead.`,
        );
      }
    });

    if (zone.processEvent) {
      const eventUvHead = ctx.toolheads.filter(isUvToolhead).find(tool => (
        tool.slot !== undefined
        && (!zone.processEvent?.toolheadId || tool.id === zone.processEvent.toolheadId)
      ));
      if (!eventUvHead) {
        add(issues, `event.toolhead.${zone.id}`, 5, `UV event in “${zone.label || zone.id}” requires an assigned UV head.`);
      }
      const exposure = zone.processEvent.uvExposureTimeSec ?? (eventUvHead?.defaultExposureTime ?? 0);
      const dose = zone.processEvent.doseTargetMjCm2 ?? (eventUvHead?.defaultDose ?? 0);
      if (exposure <= 0 || dose <= 0) {
        add(issues, `event.parameters.${zone.id}`, 5, `UV event in “${zone.label || zone.id}” requires a positive exposure and dose in the central UV profile.`);
      }
    }

    const pore = zone.parameterOverride?.poreInjection;
    if (!pore?.enabled) return;

    if (!isGridInfillForPoreZone(ctx, zone)) {
      add(
        issues,
        `pore.pattern.${zone.id}`,
        5,
        `Pore Injection in “${zone.label || zone.id}” requires the GRID infill pattern.`,
      );
    }
    const zoneSyringe = ctx.toolheads.filter(isSyringeToolhead).find(tool => (
      tool.id === pore.syringeToolhead && tool.slot !== undefined
    ));
    if (!zoneSyringe) {
      add(
        issues,
        `pore.toolhead.${zone.id}`,
        5,
        `Pore Injection in “${zone.label || zone.id}” requires an assigned syringe toolhead.`,
      );
    }
    if (String(pore.mode) !== 'layer_by_layer') {
      add(issues, `pore.mode.${zone.id}`, 5, `Only layer-by-layer Pore Injection is currently supported in “${zone.label || zone.id}”.`);
    }
    if (pore.flowRateUlPerCell <= 0) {
      add(issues, `pore.parameters.${zone.id}`, 5, `Pore Injection in “${zone.label || zone.id}” requires a positive volume per pore.`);
    }
    if (!zoneSyringe?.flowRateUlPerMm || zoneSyringe.flowRateUlPerMm <= 0) {
      add(issues, `pore.calibration.${zone.id}`, 5, 'The assigned syringe head requires a valid dose calibration.');
    }
  });
};

export const getWorkflowIssues = (ctx: WorkflowValidationContext): WorkflowIssue[] => {
  const issues: WorkflowIssue[] = [];
  validateEnvironment(ctx, issues);
  validateModels(ctx, issues);
  validateMapping(ctx, issues);
  validateSettings(ctx, issues);
  validateZones(ctx, issues);
  return issues;
};

/**
 * Returns the first hard blocker in the workflow up to a completed step.
 * Warnings are intentionally excluded so users can explore a project before
 * the final slice.
 */
export const getStepBlocker = (
  ctx: WorkflowValidationContext,
  targetStep: WorkflowStep,
): WorkflowIssue | null => {
  const issues = getWorkflowIssues(ctx);
  return issues
    .filter(issue => issue.severity === 'error' && issue.step <= targetStep)
    .sort((a, b) => a.step - b.step)[0] ?? null;
};
