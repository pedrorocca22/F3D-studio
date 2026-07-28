import { ModelData, LayerAction, ResolvedModelPlan, ResolvedLayerRange, ResolvedLayerSettings, ToolheadConfig, ToolheadId, ZZone } from '../types';
import { isUvToolhead } from './toolheads';

/**
 * Normalizes and resolves all LayerActions and ZZones for each model into an execution plan.
 */
export function resolveLayerPlans(
  models: ModelData[],
  totalLayers: number,
  zZones: ZZone[] = [],
  layerHeightMm: number = 0.2,
  firstLayerHeightMm: number = 0.3,
  toolheads: ToolheadConfig[] = [],
  shellLayers: { top: number; bottom: number } = { top: 3, bottom: 3 },
): ResolvedModelPlan[] {
  const uvHead = toolheads.find(isUvToolhead);
  // Convert ZZones to LayerActions for internal processing
  const allActions: LayerAction[] = zZones.filter(z => z.enabled !== false).map(z => {
    // Helper to map Z height exactly to layer indices
    const mmToLayer = (zMm: number) => {
      if (zMm <= 0.001) return 1;
      if (zMm <= firstLayerHeightMm + 0.001) return 1;
      return Math.floor((zMm - firstLayerHeightMm - 0.001) / layerHeightMm) + 2;
    };

    const action: LayerAction = {
      id: z.id,
      layerFrom: mmToLayer(z.zStartMm),
      layerTo: mmToLayer(z.zEndMm),
      modelId: z.modelScope,
      kind: z.featureOverride ? 'feature_override' : (z.processEvent ? 'process_event' : 'parameter_override'),
      label: z.label,
      color: z.color,
      priority: z.priority,
    };

    if (z.featureOverride) {
      action.toolOverride = z.featureOverride.toolhead;
      action.targetFeatures = z.featureOverride.targetFeatures;
      action.scaffoldTools = z.featureOverride.scaffoldTools;
    }

    if (z.parameterOverride) {
      action.fdmSettings = z.parameterOverride.fdm;
      action.syringeSettings = z.parameterOverride.syringe;
      action.poreInjection = z.parameterOverride.poreInjection;
    }

    if (z.processEvent) {
      const eventUvHead = toolheads.filter(isUvToolhead).find(tool => (
        !z.processEvent?.toolheadId || tool.id === z.processEvent.toolheadId
      )) || uvHead;
      action.uvSettings = {
        toolheadId: eventUvHead?.id,
        doseTargetMjCm2: z.processEvent.doseTargetMjCm2 ?? (eventUvHead ? eventUvHead.defaultDose : 0),
        exposureTimeSec: z.processEvent.uvExposureTimeSec ?? (eventUvHead ? eventUvHead.defaultExposureTime : 0),
        pausePrint: !!z.processEvent.pausePrint,
        mode: z.processEvent.mode ?? (eventUvHead?.mode === 'scanning' ? 'sweep' : 'stationary'),
        powerPercentage: z.processEvent.powerPercentage ?? 100,
        ...(z.processEvent.pattern !== undefined ? { pattern: z.processEvent.pattern } : {}),
        ...(z.processEvent.scanSpeedMmS !== undefined ? { scanSpeedMmS: z.processEvent.scanSpeedMmS } : {}),
        ...(z.processEvent.lineSpacingMm !== undefined ? { lineSpacingMm: z.processEvent.lineSpacingMm } : {}),
        ...(z.processEvent.zOffsetMm !== undefined ? { zOffsetMm: z.processEvent.zOffsetMm } : {}),
        ...(z.processEvent.trigger !== undefined ? { trigger: z.processEvent.trigger } : {}),
      };
    }

    return action;
  });

  // Sort by priority if applicable
  const sortedActions = [...allActions].sort((a, b) => {
     const pA = a.priority ?? 0;
     const pB = b.priority ?? 0;
     return pA - pB;
  });

  return models.map(model => {
    const sourceMapping = model.scaffoldTools;
    const uniformTool = model.toolhead || 'none';
    // 1. Establish base mapping for this model
    const baseMapping: Required<NonNullable<ModelData['scaffoldTools']>> = sourceMapping
      ? {
          ...sourceMapping,
          bottomLayers: sourceMapping.bottomLayers ?? sourceMapping.solidInfill,
          topLayers: sourceMapping.topLayers ?? sourceMapping.solidInfill,
        }
      : {
          perimeter: uniformTool,
          infill: uniformTool,
          solidInfill: uniformTool,
          bottomLayers: uniformTool,
          topLayers: uniformTool,
          support: uniformTool,
        };
    const modelHeightMm = Math.max(0, (model.size?.z ?? 0) * (model.transform.scale.z || 1));
    const modelLayerCount = modelHeightMm > 0
      ? Math.min(totalLayers, Math.max(1, 1 + Math.ceil(Math.max(0, modelHeightMm - firstLayerHeightMm) / layerHeightMm)))
      : totalLayers;
    const bottomLayerCount = Math.max(0, Math.round(model.fdmSettings?.bottomSolidLayers ?? shellLayers.bottom));
    const topLayerCount = Math.max(0, Math.round(model.fdmSettings?.topSolidLayers ?? shellLayers.top));

    // 2. Resolve every layer independently first (1-indexed to match PrusaSlicer)
    const resolvedLayers: ResolvedLayerSettings[] = [];
    for (let L = 1; L <= totalLayers; L++) {
      // Start with base (including model-specific FDM overrides)
      const settings: ResolvedLayerSettings = {
        mapping: { ...baseMapping },
        fdm: { ...(model.fdmSettings || {}) },
        syringe: {},
      };

      // Find all actions that apply to this layer and model
      const applicableActions = sortedActions.filter(a => {
        const isModelMatch = a.modelId === 'all' || a.modelId === model.id;
        const isLayerMatch = L >= a.layerFrom && L <= a.layerTo;
        return isModelMatch && isLayerMatch;
      });

      // Apply actions in order (later actions override earlier ones)
      applicableActions.forEach(action => {
        if (action.kind === 'feature_override') {
          const targets = action.targetFeatures || ['all'];
          const tool = action.toolOverride || 'fdm';
          
          if (targets.includes('all')) {
            settings.mapping.perimeter = tool;
            settings.mapping.infill = tool;
            settings.mapping.solidInfill = tool;
            settings.mapping.bottomLayers = tool;
            settings.mapping.topLayers = tool;
            settings.mapping.support = tool;
          } else {
            if (targets.includes('perimeter')) settings.mapping.perimeter = tool;
            if (targets.includes('infill')) settings.mapping.infill = tool;
            if (targets.includes('solidInfill')) settings.mapping.solidInfill = tool;
            if (targets.includes('support')) settings.mapping.support = tool;
          }

          if (action.scaffoldTools) {
            settings.mapping = { ...settings.mapping, ...action.scaffoldTools };
          }

          // ALSO merge FDM settings if they exist in a feature override
          if (action.fdmSettings) {
            settings.fdm = { ...settings.fdm, ...action.fdmSettings };
          }
        } else if (action.kind === 'parameter_override') {
          // Merge settings
          if (action.fdmSettings) {
            settings.fdm = { ...settings.fdm, ...action.fdmSettings };
          }
          if (action.syringeSettings) {
             settings.syringe = { ...settings.syringe, ...action.syringeSettings };
          }
          if (action.scaffoldTools) {
            settings.mapping = { ...settings.mapping, ...action.scaffoldTools };
          }
        } else if (action.kind === 'process_event') {
          if (action.uvSettings) {
            settings.uv = { ...action.uvSettings };
          }
          if (action.preMacro) settings.preMacro = action.preMacro;
          if (action.postMacro) settings.postMacro = action.postMacro;
        }

        if (action.poreInjection !== undefined) {
          settings.poreInjection = action.poreInjection;
        }
      });

      // PrusaSlicer exposes one solid_infill_extruder setting. Resolve the
      // independent bottom/top choices into physical layer ranges before the
      // plan is compacted and written to the 3MF.
      if (bottomLayerCount > 0 && L <= bottomLayerCount) {
        settings.mapping.solidInfill = settings.mapping.bottomLayers;
      } else if (topLayerCount > 0 && L > modelLayerCount - topLayerCount) {
        settings.mapping.solidInfill = settings.mapping.topLayers;
      }

      resolvedLayers[L] = settings;
    }

    // 3. Compact consecutive layers with identical settings into ranges
    const ranges: ResolvedLayerRange[] = [];
    if (resolvedLayers.length > 1) {
      let currentRange: ResolvedLayerRange = {
        layerFrom: 1,
        layerTo: 1,
        settings: resolvedLayers[1]
      };

      for (let L = 2; L <= totalLayers; L++) {
        const settings = resolvedLayers[L];
        if (areSettingsEqual(settings, currentRange.settings)) {
          currentRange.layerTo = L;
        } else {
          ranges.push(currentRange);
          currentRange = {
            layerFrom: L,
            layerTo: L,
            settings: settings
          };
        }
      }
      ranges.push(currentRange);
    }

    return {
      modelId: model.id,
      modelName: model.name,
      ranges
    };
  });
}

/**
 * FIX #12: Stable deep equality for resolved settings.
 * JSON.stringify does not guarantee consistent key ordering across objects built
 * in different code paths. We use a recursive sorted-key serializer to ensure
 * two semantically identical objects always produce the same string.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}';
}

function areSettingsEqual(a: ResolvedLayerSettings, b: ResolvedLayerSettings): boolean {
  return stableStringify(a) === stableStringify(b);
}
