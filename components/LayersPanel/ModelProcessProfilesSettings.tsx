import React, { useState } from 'react';
import { GlobalSettings, INFILL_PATTERN_LABELS, InfillPattern, ModelData } from '../../types';
import { NumericInput } from './NumericInput';
import { InfoTooltip } from '../InfoTooltip';

interface ModelProcessProfilesSettingsProps {
  models: ModelData[];
  globalSettings: GlobalSettings;
  onUpdateModel: (id: string, updates: Partial<ModelData>) => void;
}

export const ModelProcessProfilesSettings: React.FC<ModelProcessProfilesSettingsProps> = ({
  models,
  globalSettings,
  onUpdateModel,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (models.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center dark:border-slate-700">
        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Add a model to configure overrides</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-wider text-slate-500">
        Model overrides
        <InfoTooltip content="Models inherit the global scaffold profile. Add overrides only when one construct needs different geometry." />
      </div>
      {models.map(model => {
        const isExpanded = expandedId === model.id;
        const hasOverrides = !!model.fdmSettings && Object.keys(model.fdmSettings).length > 0;
        return (
          <div key={model.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50">
            <button
              onClick={() => setExpandedId(isExpanded ? null : model.id)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-[9px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{model.name}</span>
              <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase ${
                hasOverrides
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30'
              }`}>
                {hasOverrides ? 'Custom' : 'Global'}
              </span>
              <span className="text-[7px] font-black uppercase tracking-wider text-slate-400">{isExpanded ? 'Close' : 'Edit'}</span>
            </button>

            {isExpanded && (
              <div className="space-y-3 border-t border-slate-100 p-2.5 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[8px] font-black uppercase text-slate-400">Infill (%)</span>
                    <NumericInput value={model.fdmSettings?.infillPercent ?? globalSettings.infill ?? 15} onChange={value => onUpdateModel(model.id, { fdmSettings: { ...model.fdmSettings, infillPercent: value } })} min={0} max={100} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[8px] font-black uppercase text-slate-400">Walls</span>
                    <NumericInput value={model.fdmSettings?.wallCount ?? globalSettings.perimeters ?? 3} onChange={value => onUpdateModel(model.id, { fdmSettings: { ...model.fdmSettings, wallCount: value } })} min={0} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[8px] font-black uppercase text-slate-400">Top layers</span>
                    <NumericInput value={model.fdmSettings?.topSolidLayers ?? globalSettings.topSolidLayers ?? 3} onChange={value => onUpdateModel(model.id, { fdmSettings: { ...model.fdmSettings, topSolidLayers: value } })} min={0} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[8px] font-black uppercase text-slate-400">Bottom layers</span>
                    <NumericInput value={model.fdmSettings?.bottomSolidLayers ?? globalSettings.bottomSolidLayers ?? 3} onChange={value => onUpdateModel(model.id, { fdmSettings: { ...model.fdmSettings, bottomSolidLayers: value } })} min={0} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[8px] font-black uppercase text-slate-400">Fill angle (°)</span>
                    <NumericInput value={model.fdmSettings?.fillAngle ?? globalSettings.fillAngle ?? 45} onChange={value => onUpdateModel(model.id, { fdmSettings: { ...model.fdmSettings, fillAngle: value } })} min={0} max={360} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[8px] font-black uppercase text-slate-400">Pattern</span>
                    <select
                      value={model.fdmSettings?.infillPattern ?? globalSettings.infillPattern ?? 'grid'}
                      onChange={event => onUpdateModel(model.id, { fdmSettings: { ...model.fdmSettings, infillPattern: event.target.value as InfillPattern } })}
                      className="h-7 w-full rounded-sm border border-slate-200 bg-white px-1.5 text-[9px] font-bold text-slate-700 outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {(Object.entries(INFILL_PATTERN_LABELS) as [InfillPattern, string][]).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  disabled={!hasOverrides}
                  onClick={() => onUpdateModel(model.id, { fdmSettings: {} })}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 py-1.5 text-[8px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700"
                >
                  Use global scaffold profile
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
