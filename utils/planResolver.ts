import { ModelData, LayerAction, ResolvedModelPlan, ResolvedLayerRange, ResolvedLayerSettings, ToolheadId } from '../types';

/**
 * Normalizes and resolves all LayerActions for each model into an execution plan.
 * This resolves model scoping ('all' -> specific), precedence, and feature mappings.
 */
export function resolveLayerPlans(
  models: ModelData[],
  layerActions: LayerAction[],
  totalLayers: number
): ResolvedModelPlan[] {
  return models.map(model => {
    // 1. Establish base mapping for this model
    const baseMapping: Record<'perimeter' | 'infill' | 'solidInfill' | 'support', ToolheadId> = model.scaffoldTools 
      ? { ...model.scaffoldTools }
      : {
          perimeter: model.toolhead || 'fdm',
          infill: model.toolhead || 'fdm',
          solidInfill: model.toolhead || 'fdm',
          support: model.toolhead || 'fdm',
        };

    // 2. Resolve every layer independently first
    const resolvedLayers: ResolvedLayerSettings[] = [];
    for (let L = 0; L <= totalLayers; L++) {
      // Start with base
      const settings: ResolvedLayerSettings = {
        mapping: { ...baseMapping },
        fdm: {},
        syringe: {},
      };

      // Find all actions that apply to this layer and model
      const applicableActions = layerActions.filter(a => {
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
            settings.mapping.support = tool;
          } else {
            if (targets.includes('perimeter')) settings.mapping.perimeter = tool;
            if (targets.includes('infill')) settings.mapping.infill = tool;
            if (targets.includes('solidInfill')) settings.mapping.solidInfill = tool;
            if (targets.includes('support')) settings.mapping.support = tool;
          }
        } else if (action.kind === 'parameter_override') {
          // Merge settings
          if (action.fdmSettings) {
            settings.fdm = { ...settings.fdm, ...action.fdmSettings };
          }
          if (action.syringeSettings) {
             settings.syringe = { ...settings.syringe, ...action.syringeSettings };
          }
        } else if (action.kind === 'process_event') {
          if (action.uvSettings) {
            settings.uv = { ...action.uvSettings };
          }
          if (action.preMacro) settings.preMacro = action.preMacro;
          if (action.postMacro) settings.postMacro = action.postMacro;
        }
      });

      resolvedLayers[L] = settings;
    }

    // 3. Compact consecutive layers with identical settings into ranges
    const ranges: ResolvedLayerRange[] = [];
    if (resolvedLayers.length > 0) {
      let currentRange: ResolvedLayerRange = {
        layerFrom: 0,
        layerTo: 0,
        settings: resolvedLayers[0]
      };

      for (let L = 1; L <= totalLayers; L++) {
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
 * Deep equality check for resolved settings to allow range compaction.
 */
function areSettingsEqual(a: ResolvedLayerSettings, b: ResolvedLayerSettings): boolean {
  // Simple JSON stringify for comparison since these are flat-ish objects
  // This is efficient enough for the number of layers/actions we handle
  return JSON.stringify(a) === JSON.stringify(b);
}
