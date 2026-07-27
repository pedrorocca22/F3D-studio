import {
  GlobalSettings,
  MaterialProfile,
  ModelData,
  PoreInjectionConfig,
  PoreProtocolIssue,
  PoreProtocolPreflight,
  ToolheadConfig,
  ZZone,
} from '../types';
import { analyzeGridInfill } from './infillAnalysis';

interface PoreProtocolContext {
  globalSettings: GlobalSettings;
  models: ModelData[];
  zZones: ZZone[];
  toolheads: ToolheadConfig[];
  selectedMaterials?: Record<string, string>;
  userMaterials?: MaterialProfile[];
}

const modelHeight = (model: ModelData) => Math.max(
  0,
  (model.size?.z || 0) * (model.transform.scale.z || 1),
);

const modelArea = (model: ModelData) => ({
  width: Math.max(0, (model.size?.x || 0) * (model.transform.scale.x || 1)),
  depth: Math.max(0, (model.size?.y || 0) * (model.transform.scale.y || 1)),
});

const activePoreZones = (zones: ZZone[]) => zones.filter(zone => zone.enabled !== false && zone.parameterOverride?.poreInjection?.enabled);

const addIssue = (issues: PoreProtocolIssue[], code: string, severity: PoreProtocolIssue['severity'], message: string) => {
  issues.push({ code, severity, message });
};

export const buildPoreProtocolPreflight = (ctx: PoreProtocolContext): PoreProtocolPreflight => {
  const globalPore = ctx.globalSettings.poreInjection?.enabled ? ctx.globalSettings.poreInjection : undefined;
  const poreZones = activePoreZones(ctx.zZones);
  const config = globalPore || poreZones[0]?.parameterOverride?.poreInjection;
  const scope: PoreProtocolPreflight['scope'] = globalPore ? 'global' : poreZones.length > 0 ? 'zonal' : 'none';
  const issues: PoreProtocolIssue[] = [];
  const assignedSyringe = ctx.toolheads.find(tool => tool.id === 'syringe' && tool.slot !== undefined);
  const bioinkId = ctx.selectedMaterials?.syringe;
  const bioink = ctx.userMaterials?.find(material => material.id === bioinkId);
  const tipId = assignedSyringe?.id === 'syringe' ? assignedSyringe.tipId : undefined;
  const calibrationUlPerMm = config?.calibrationUlPerMm ?? (assignedSyringe?.id === 'syringe' ? assignedSyringe.flowRateUlPerMm : undefined);

  if (scope === 'none') {
    return {
      status: 'inactive', scope, estimatedPoreCount: 0, availableVolumeUl: 0,
      requestedVolumeUl: 0, marginVolumeUl: 0, issues,
      checks: { geometry: 'ready', calibration: 'ready', volume: 'ready', collisions: 'not_checked', dryRun: 'not_run' },
    };
  }

  if (globalPore && poreZones.length > 0) {
    addIssue(issues, 'pore.scope.conflict', 'blocked', 'Whole-scaffold and zonal Pore Injection cannot be active at the same time.');
  }
  if (!assignedSyringe) {
    addIssue(issues, 'pore.toolhead.missing', 'blocked', 'Assign a syringe toolhead before creating an injection protocol.');
  }
  if (!bioink) {
    addIssue(issues, 'pore.bioink.missing', 'blocked', 'Select the bioink assigned to the syringe head.');
  }
  if (!tipId) {
    addIssue(issues, 'pore.tip.missing', 'blocked', 'Select a syringe tip before calculating deposition.');
  }
  if (!calibrationUlPerMm || calibrationUlPerMm <= 0) {
    addIssue(issues, 'pore.calibration.missing', 'blocked', 'Enter a measured calibration in µL/mm for this bioink and tip.');
  }
  if (config && config.calibrationBioinkId && bioinkId && config.calibrationBioinkId !== bioinkId) {
    addIssue(issues, 'pore.calibration.bioink_mismatch', 'blocked', 'The stored calibration belongs to another bioink.');
  }
  if (config && config.calibrationTipId && tipId && config.calibrationTipId !== tipId) {
    addIssue(issues, 'pore.calibration.tip_mismatch', 'blocked', 'The stored calibration belongs to another syringe tip.');
  }

  const fdmHead = ctx.toolheads.find(tool => tool.id === 'fdm');
  const extrusionWidth = fdmHead?.id === 'fdm' ? fdmHead.nozzleDiameter : (ctx.globalSettings.nozzleDiameter ?? 0.4);
  let estimatedPoreCount = 0;
  let availableVolumeUl = 0;
  let requestedVolumeUl = 0;
  let collisionStatus: PoreProtocolPreflight['checks']['collisions'] = 'not_checked';

  const analyze = (model: ModelData, pore: PoreInjectionConfig, zStart: number, zEnd: number) => {
    const area = modelArea(model);
    const zHeight = Math.max(0, Math.min(modelHeight(model), zEnd) - Math.max(0, zStart));
    const infillPercent = poreZones.find(zone => zone.parameterOverride?.poreInjection === pore)?.parameterOverride?.fdm?.infillPercent
      ?? model.fdmSettings?.infillPercent
      ?? ctx.globalSettings.infill
      ?? 15;
    const analysis = analyzeGridInfill(area.width, area.depth, zHeight, infillPercent, extrusionWidth);
    estimatedPoreCount += analysis.estimatedCellCount;
    availableVolumeUl += analysis.totalMaxVolumeUl;
    requestedVolumeUl += pore.mode === 'multilayer'
      ? (pore.targetVolumeUl ?? 0)
      : analysis.estimatedCellCount * pore.flowRateUlPerCell;
  };

  if (globalPore) {
    ctx.models.forEach(model => analyze(model, globalPore, 0, modelHeight(model)));
  } else {
    poreZones.forEach(zone => {
      const models = zone.modelScope === 'all' ? ctx.models : ctx.models.filter(model => model.id === zone.modelScope);
      models.forEach(model => analyze(model, zone.parameterOverride!.poreInjection!, zone.zStartMm, zone.zEndMm));
    });
  }

  const bedDimensions = ctx.globalSettings.printBed?.type === 'glass_bed'
    ? ctx.globalSettings.printBed.dimensions
    : undefined;
  if (bedDimensions) {
    collisionStatus = 'ready';
    ctx.models.forEach(model => {
      const area = modelArea(model);
      if (area.width > bedDimensions.width || area.depth > bedDimensions.height) {
        collisionStatus = 'blocked';
        addIssue(issues, 'pore.collision.bed', 'blocked', `Model “${model.name}” exceeds the configured print surface envelope.`);
      }
    });
  } else if (ctx.models.some(model => !model.size)) {
    collisionStatus = 'warning';
    addIssue(issues, 'pore.collision.geometry_missing', 'warning', 'Collision envelope cannot be fully checked until model dimensions are available.');
  }

  const syringeCapacityUl = assignedSyringe?.id === 'syringe' ? assignedSyringe.syringeVolumeMl * 1000 : undefined;
  if (syringeCapacityUl !== undefined && requestedVolumeUl > syringeCapacityUl) {
    addIssue(issues, 'pore.limit.syringe_capacity', 'blocked', 'Requested volume exceeds the loaded syringe capacity.');
  }

  if (estimatedPoreCount === 0) {
    addIssue(issues, 'pore.geometry.empty', 'blocked', 'No GRID pore cells are available in the configured volume.');
  }
  if (requestedVolumeUl > availableVolumeUl && availableVolumeUl > 0) {
    addIssue(issues, 'pore.volume.exceeds_capacity', 'blocked', 'Requested injection volume exceeds the estimated pore capacity.');
  }
  if (availableVolumeUl > 0 && requestedVolumeUl / availableVolumeUl > 0.9) {
    addIssue(issues, 'pore.volume.low_margin', 'warning', 'Requested volume leaves less than 10% capacity margin.');
  }

  const hasBlocked = issues.some(issue => issue.severity === 'blocked');
  const hasWarnings = issues.some(issue => issue.severity === 'warning');
  return {
    status: hasBlocked ? 'blocked' : hasWarnings ? 'warning' : 'ready',
    scope,
    estimatedPoreCount,
    availableVolumeUl,
    requestedVolumeUl,
    marginVolumeUl: availableVolumeUl - requestedVolumeUl,
    calibrationUlPerMm,
    bioinkId,
    bioinkName: bioink?.name,
    tipId,
    issues,
    checks: {
      geometry: estimatedPoreCount > 0 ? 'ready' : 'blocked',
      calibration: calibrationUlPerMm && calibrationUlPerMm > 0 ? 'ready' : 'blocked',
      volume: requestedVolumeUl <= availableVolumeUl ? 'ready' : 'blocked',
      collisions: collisionStatus,
      dryRun: 'not_run',
    },
  };
};
