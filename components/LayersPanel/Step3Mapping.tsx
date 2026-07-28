import React, { useState } from 'react';
import { GlobalSettings, ModelData, ScaffoldToolMapping, ToolheadConfig } from '../../types';
import { SCAFFOLD_FEATURE_META, ToolheadSelect } from '../ToolheadPanel/ToolheadPanel';

interface Step3MappingProps {
  models: ModelData[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  toolheads: ToolheadConfig[];
  globalSettings: GlobalSettings;
  onUpdateModel: (id: string, updates: Partial<ModelData>) => void;
}

const EMPTY_SCAFFOLD_TOOLS = {
  perimeter: 'none' as const,
  infill: 'none' as const,
  solidInfill: 'none' as const,
  bottomLayers: 'none' as const,
  topLayers: 'none' as const,
  support: 'none' as const,
};

export const Step3Mapping: React.FC<Step3MappingProps> = ({
  models,
  selectedModelId,
  onSelectModel,
  toolheads,
  globalSettings,
  onUpdateModel,
}) => {
  const requiredValuesFor = (tools: ScaffoldToolMapping) => [
    tools.perimeter,
    tools.infill,
    tools.solidInfill,
    ...((globalSettings.bottomSolidLayers ?? 3) > 0 ? [tools.bottomLayers] : []),
    ...((globalSettings.topSolidLayers ?? 3) > 0 ? [tools.topLayers] : []),
    ...(globalSettings.supportsEnabled ? [tools.support] : []),
  ];
  const firstUnassigned = models.find(model => {
    const source = model.scaffoldTools;
    const tools = {
      ...EMPTY_SCAFFOLD_TOOLS,
      ...(source || {}),
      bottomLayers: source?.bottomLayers ?? source?.solidInfill ?? 'none',
      topLayers: source?.topLayers ?? source?.solidInfill ?? 'none',
    };
    return requiredValuesFor(tools).some(value => !value || value === 'none');
  });
  const [expandedId, setExpandedId] = useState<string | null>(firstUnassigned?.id ?? null);

  if (models.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-700">
        Add a model before assigning fabrication processes.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {models.map(model => {
        const tools = {
          ...EMPTY_SCAFFOLD_TOOLS,
          ...(model.scaffoldTools || {}),
          bottomLayers: model.scaffoldTools?.bottomLayers ?? model.scaffoldTools?.solidInfill ?? 'none',
          topLayers: model.scaffoldTools?.topLayers ?? model.scaffoldTools?.solidInfill ?? 'none',
        };
        const isConfigured = requiredValuesFor(tools).every(value => value !== 'none');
        const isExpanded = expandedId === model.id;

        return (
          <div
            key={model.id}
            className={`overflow-hidden rounded-lg border transition-colors ${
              selectedModelId === model.id
                ? 'border-primary/35 bg-primary/[0.025]'
                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40'
            }`}
          >
            <button
              onClick={() => {
                onSelectModel(model.id);
                setExpandedId(isExpanded ? null : model.id);
              }}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[9px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{model.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider ${
                isConfigured
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
              }`}>
                {isConfigured ? 'Assigned' : 'Required'}
              </span>
              <span className="text-[7px] font-black uppercase tracking-wider text-slate-400">{isExpanded ? 'Close' : 'Edit'}</span>
            </button>

            {isExpanded && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-2.5 dark:border-slate-800">
                {SCAFFOLD_FEATURE_META.map(feature => (
                  <label key={feature.key} className="space-y-1">
                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{feature.label}</span>
                    <ToolheadSelect
                      value={tools[feature.key]}
                      onChange={value => onUpdateModel(model.id, { scaffoldTools: { ...tools, [feature.key]: value } })}
                      className="h-7 w-full text-[9px]"
                      toolheads={toolheads}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
