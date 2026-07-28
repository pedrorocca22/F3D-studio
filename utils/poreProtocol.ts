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
import { isFdmToolhead, isSyringeToolhead } from './toolheads';

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

const bottomSolidTopMm = (ctx: PoreProtocolContext) => {
  const layerHeightMm = Number(ctx.globalSettings.layerHeight || 200) / 1000;
  const firstLayerHeightMm = Number(ctx.globalSettings.firstLayerHeight || 300) / 1000;
  const bottomLayers = Math.max(
    Number(ctx.globalSettings.bottomSolidLayers ?? 3),
    ...ctx.models.map(model => Number(model.fdmSettings?.bottomSolidLayers ?? 0)),
  );
  return bottomLayers > 0
    ? firstLayerHeightMm + Math.max(0, bottomLayers - 1) * layerHeightMm
    : 0;
};

export const buildPoreProtocolPreflight = (ctx: PoreProtocolContext): PoreProtocolPreflight => {
  const globalPore = ctx.globalSettings.poreInjection?.enabled ? ctx.globalSettings.poreInjection : undefined;
  const poreZones = activePoreZones(ctx.zZones);
  const config = globalPore || poreZones[0]?.parameterOverride?.poreInjection;
  const scope: PoreProtocolPreflight['scope'] = globalPore ? 'global' : poreZones.length > 0 ? 'zonal' : 'none';
  const issues: PoreProtocolIssue[] = [];
  const requestedSyringeId = config?.syringeToolhead;
  const assignedSyringe = ctx.toolheads
    .filter(isSyringeToolhead)
    .find(tool => (
      tool.slot !== undefined
      && (!requestedSyringeId || requestedSyringeId === 'syringe' || tool.id === requestedSyringeId)
    ));
  const bioinkId = assignedSyringe ? ctx.selectedMaterials?.[assignedSyringe.id] : undefined;
  const bioink = ctx.userMaterials?.find(material => material.id === bioinkId);
  const tipId = assignedSyringe?.tipId;
  // Mechanical dose conversion belongs to the syringe head configuration.
  // Pore Injection consumes it but never duplicates or overrides it.
  const calibrationUlPerMm = assignedSyringe?.flowRateUlPerMm;
  const protectedBottomTopMm = bottomSolidTopMm(ctx);

  if (scope === 'none') {
    return {
      status: 'inactive', scope, estimatedPoreCount: 0, availableVolumeUl: 0,
      requestedVolumeUl: 0, marginVolumeUl: 0, issues,
      bottomSolidTopMm: protectedBottomTopMm,
      checks: { geometry: 'ready', calibration: 'ready', volume: 'ready', collisions: 'not_checked', dryRun: 'not_run' },
    };
  }

  if (config && String(config.mode) !== 'layer_by_layer') {
    addIssue(issues, 'pore.mode.unsupported', 'blocked', 'Only layer-by-layer Pore Injection is currently supported.');
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
    addIssue(issues, 'pore.calibration.missing', 'blocked', 'The assigned syringe head requires a valid dose calibration.');
  }

  const fdmHead = ctx.toolheads.find(isFdmToolhead);
  const extrusionWidth = fdmHead?.nozzleDiameter ?? (ctx.globalSettings.nozzleDiameter ?? 0.4);
  let estimatedPoreCount = 0;
  let availableVolumeUl = 0;
  let requestedVolumeUl = 0;
  let collisionStatus: PoreProtocolPreflight['checks']['collisions'] = 'not_checked';

  const analyze = (model: ModelData, pore: PoreInjectionConfig, zStart: number, zEnd: number) => {
    const area = modelArea(model);
    const effectiveStart = Math.max(0, zStart, protectedBottomTopMm);
    const zHeight = Math.max(0, Math.min(modelHeight(model), zEnd) - effectiveStart);
    const infillPercent = poreZones.find(zone => zone.parameterOverride?.poreInjection === pore)?.parameterOverride?.fdm?.infillPercent
      ?? model.fdmSettings?.infillPercent
      ?? ctx.globalSettings.infill
      ?? 15;
    const analysis = analyzeGridInfill(
      area.width,
      area.depth,
      zHeight,
      infillPercent,
      extrusionWidth,
      Number(ctx.globalSettings.layerHeight || 200) / 1000,
    );
    estimatedPoreCount += analysis.estimatedCellCount;
    availableVolumeUl += analysis.totalMaxVolumeUl;
    requestedVolumeUl += analysis.estimatedCellCount * pore.flowRateUlPerCell;
  };

  if (globalPore) {
    if ((globalPore.zStartMm ?? 0) < protectedBottomTopMm) {
      addIssue(issues, 'pore.bottom_shell.protected', 'warning', `The first ${protectedBottomTopMm.toFixed(2)} mm are protected by the bottom shell; injection starts above that envelope.`);
    }
    ctx.models.forEach(model => {
      let segments = [{ start: globalPore.zStartMm ?? 0, end: modelHeight(model) }];
      ctx.zZones
        .filter(zone => zone.enabled !== false && (zone.modelScope === 'all' || zone.modelScope === model.id))
        .forEach(zone => {
          segments = segments.flatMap(segment => {
            if (zone.zEndMm <= segment.start || zone.zStartMm >= segment.end) return [segment];
            return [
              ...(zone.zStartMm > segment.start ? [{ start: segment.start, end: zone.zStartMm }] : []),
              ...(zone.zEndMm < segment.end ? [{ start: zone.zEndMm, end: segment.end }] : []),
            ];
          });
        });
      segments.forEach(segment => analyze(model, globalPore, segment.start, segment.end));
    });
  }
  poreZones.forEach(zone => {
    if (zone.zStartMm < protectedBottomTopMm) {
      addIssue(issues, `pore.bottom_shell.${zone.id}`, 'warning', `Zone “${zone.label || zone.id}” overlaps the bottom shell envelope; injection starts above ${protectedBottomTopMm.toFixed(2)} mm.`);
    }
    const models = zone.modelScope === 'all' ? ctx.models : ctx.models.filter(model => model.id === zone.modelScope);
    const pore = zone.parameterOverride!.poreInjection!;
    models.forEach(model => analyze(model, pore, Math.max(zone.zStartMm, pore.zStartMm ?? zone.zStartMm), zone.zEndMm));
  });

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

  const syringeCapacityUl = assignedSyringe ? assignedSyringe.syringeVolumeMl * 1000 : undefined;
  if (syringeCapacityUl !== undefined && requestedVolumeUl > syringeCapacityUl) {
    addIssue(issues, 'pore.limit.syringe_capacity', 'blocked', 'Requested volume exceeds the loaded syringe capacity.');
  }

  if (estimatedPoreCount === 0) {
    addIssue(issues, 'pore.geometry.empty', 'blocked', 'No GRID pore cells are available in the configured volume.');
  }
  if (requestedVolumeUl > availableVolumeUl && availableVolumeUl > 0) {
    addIssue(issues, 'pore.volume.exceeds_capacity', 'warning', 'Requested injection volume exceeds the estimated geometric pore capacity. The value is allowed but may overflow.');
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
    bottomSolidTopMm: protectedBottomTopMm,
    bioinkId,
    bioinkName: bioink?.name,
    tipId,
    issues,
    checks: {
      geometry: estimatedPoreCount > 0 ? 'ready' : 'blocked',
      calibration: calibrationUlPerMm && calibrationUlPerMm > 0 ? 'ready' : 'blocked',
      volume: requestedVolumeUl <= availableVolumeUl ? 'ready' : 'warning',
      collisions: collisionStatus,
      dryRun: 'not_run',
    },
  };
};
