import React, { useState } from 'react';
import { Icon } from '../Icon';
import { NumericInput } from './NumericInput';
import { GlobalSettings, INFILL_PATTERN_LABELS, InfillPattern, MaterialProfile, ModelData, ToolheadConfig } from '../../types';
import { HelpTopic } from '../HelpWiki/HelpWiki';
import { ToolheadProfilesSettings } from './ToolheadProfilesSettings';
import { ModelProcessProfilesSettings } from './ModelProcessProfilesSettings';
import { InfoTooltip } from '../InfoTooltip';
import { Step3Mapping } from './Step3Mapping';

interface Step4SettingsProps {
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  onOpenHelp: (topic: HelpTopic) => void;
  toolheads: ToolheadConfig[];
  onUpdateToolheads: (toolheads: ToolheadConfig[]) => void;
  selectedMaterials: Record<string, string>;
  userMaterials: MaterialProfile[];
  onAssignMaterial: (toolheadId: string, materialId: string) => void;
  models: ModelData[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onUpdateModel: (id: string, updates: Partial<ModelData>) => void;
}

type SettingsLevel = 'essential' | 'tune' | 'expert';

const LEVELS: Array<{ id: SettingsLevel; label: string }> = [
  { id: 'essential', label: 'Essential' },
  { id: 'tune', label: 'Tune' },
  { id: 'expert', label: 'Expert' },
];

const FIELD_LABEL = 'text-[8px] font-black uppercase tracking-[0.1em] text-slate-400';

const RangeField: React.FC<{
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}> = ({ label, value, unit, min, max, step, disabled, onChange }) => (
  <label className={`block space-y-2 ${disabled ? 'opacity-40' : ''}`}>
    <span className="flex items-baseline justify-between gap-2">
      <span className={FIELD_LABEL}>{label}</span>
      <span className="font-mono text-[10px] font-black text-primary">{value} {unit}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      className="w-full"
    />
  </label>
);

const Panel: React.FC<{
  title: string;
  badge?: string;
  children: React.ReactNode;
}> = ({ title, badge, children }) => (
  <section className="overflow-hidden rounded-lg border border-slate-200/90 bg-slate-100/70 shadow-xs dark:border-slate-700/80 dark:bg-slate-800/60">
    <header className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-200/60 px-2.5 py-1.5 dark:border-slate-700/80 dark:bg-slate-700/60">
      <h3 className="min-w-0 flex-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-slate-800 dark:text-slate-100">{title}</h3>
      {badge && <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[6.5px] font-black uppercase tracking-wider text-slate-600 dark:bg-slate-700 dark:text-slate-300">{badge}</span>}
    </header>
    <div className="p-2.5 bg-slate-50/90 dark:bg-slate-900/50 space-y-2">{children}</div>
  </section>
);

export const Step4Settings: React.FC<Step4SettingsProps> = ({
  globalSettings,
  onUpdateGlobalSettings,
  onOpenHelp,
  toolheads,
  onUpdateToolheads,
  selectedMaterials,
  userMaterials,
  onAssignMaterial,
  models,
  selectedModelId,
  onSelectModel,
  onUpdateModel,
}) => {
  const [level, setLevel] = useState<SettingsLevel>('essential');

  const update = (patch: Partial<GlobalSettings>) => {
    onUpdateGlobalSettings({ ...globalSettings, ...patch });
  };

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
      <div className="rounded-xl border border-slate-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(240,253,250,0.72))] p-3 dark:border-slate-800 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(6,78,59,0.16))]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-100">Protocol settings</h2>
            <p className="mt-0.5 text-[8px] font-medium text-slate-400">
              {level === 'essential' && 'The six decisions that define the scaffold'}
              {level === 'tune' && 'Printing behavior and surface controls'}
              {level === 'expert' && 'Hardware profiles and explicit exceptions'}
            </p>
          </div>
          <button
            onClick={() => onOpenHelp('hardware_mapping')}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-primary/10 hover:text-primary"
            title="Configuration help"
          >
            <Icon name="help_outline" className="text-base" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100/80 p-1 dark:bg-slate-950/50">
          {LEVELS.map(item => (
            <button
              key={item.id}
              onClick={() => setLevel(item.id)}
              aria-pressed={level === item.id}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[8px] font-black uppercase tracking-wider transition-all ${
                level === item.id
                  ? 'bg-white text-primary shadow-sm dark:bg-slate-800 dark:text-emerald-300'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {level === 'essential' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <Panel title="Process assignment" badge={`${models.length} ${models.length === 1 ? 'model' : 'models'}`}>
            <Step3Mapping
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={onSelectModel}
              toolheads={toolheads}
              globalSettings={globalSettings}
              onUpdateModel={onUpdateModel}
            />
          </Panel>

          <Panel title="Scaffold definition" badge="Protocol default">
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Layer height (µm)</span>
                <NumericInput value={globalSettings.layerHeight ?? 200} onChange={value => update({ layerHeight: value })} min={50} max={400} step={10} />
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Infill (%)</span>
                <NumericInput value={globalSettings.infill ?? 15} onChange={value => update({ infill: value })} min={0} max={100} />
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Infill pattern</span>
                <select
                  value={globalSettings.infillPattern ?? 'grid'}
                  onChange={event => update({ infillPattern: event.target.value as InfillPattern })}
                  className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-700 outline-none transition-colors focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {(Object.entries(INFILL_PATTERN_LABELS) as [InfillPattern, string][]).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Walls</span>
                <NumericInput value={globalSettings.perimeters ?? 3} onChange={value => update({ perimeters: value })} min={0} />
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Top layers</span>
                <NumericInput value={globalSettings.topSolidLayers ?? 3} onChange={value => update({ topSolidLayers: value })} min={0} />
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Bottom layers</span>
                <NumericInput value={globalSettings.bottomSolidLayers ?? 3} onChange={value => update({ bottomSolidLayers: value })} min={0} />
              </label>
            </div>
          </Panel>

        </div>
      )}

      {level === 'tune' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <Panel title="Layer refinement">
            <div className="space-y-4">
              <RangeField label="First layer" value={globalSettings.firstLayerHeight ?? 300} unit="µm" min={50} max={500} step={10} onChange={value => update({ firstLayerHeight: value })} />
              <RangeField label="Fill angle" value={globalSettings.fillAngle ?? 45} unit="°" min={0} max={360} step={5} onChange={value => update({ fillAngle: value })} />
            </div>
          </Panel>

          <Panel title="Motion">
            <div className="space-y-4">
              <RangeField label="Perimeter" value={globalSettings.perimeterSpeed ?? 45} unit="mm/s" min={5} max={150} step={5} onChange={value => update({ perimeterSpeed: value })} />
              <RangeField label="External perimeter" value={globalSettings.externalPerimeterSpeed ?? 25} unit="mm/s" min={5} max={150} step={5} onChange={value => update({ externalPerimeterSpeed: value })} />
              <RangeField label="Infill" value={globalSettings.infillSpeed ?? 80} unit="mm/s" min={5} max={200} step={5} onChange={value => update({ infillSpeed: value })} />
              <RangeField label="Travel" value={globalSettings.travelSpeed ?? 130} unit="mm/s" min={10} max={300} step={10} onChange={value => update({ travelSpeed: value })} />
            </div>
          </Panel>

          <Panel title="Bed adhesion">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Skirt loops</span>
                <NumericInput value={globalSettings.skirtCount || 0} onChange={value => update({ skirtCount: value })} min={0} />
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Distance (mm)</span>
                <NumericInput value={globalSettings.skirtDistance || 0} onChange={value => update({ skirtDistance: value })} min={0} />
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Skirt layers</span>
                <NumericInput value={globalSettings.skirtHeight || 1} onChange={value => update({ skirtHeight: value })} min={0} />
              </label>
              <label className="space-y-1">
                <span className={FIELD_LABEL}>Brim width (mm)</span>
                <NumericInput value={globalSettings.brimWidth || 0} onChange={value => update({ brimWidth: value })} min={0} />
              </label>
            </div>
          </Panel>

          <Panel title="Assistance">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 dark:text-slate-300">
                  Generate supports
                  <InfoTooltip content="Generates support structures for overhangs using the process assignment defined for supports." />
                </span>
                <button
                  aria-label="Toggle supports"
                  onClick={() => update({ supportsEnabled: !globalSettings.supportsEnabled })}
                  className={`relative h-4 w-8 rounded-full transition-colors ${globalSettings.supportsEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${globalSettings.supportsEnabled ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">Layer fan</span>
                <button
                  aria-label="Toggle layer fan"
                  onClick={() => update({ coolingEnabled: !globalSettings.coolingEnabled })}
                  className={`relative h-4 w-8 rounded-full transition-colors ${globalSettings.coolingEnabled !== false ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${globalSettings.coolingEnabled !== false ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>
              <RangeField
                label="Fan speed"
                value={globalSettings.minFanSpeed ?? 100}
                unit="%"
                min={0}
                max={100}
                step={5}
                disabled={globalSettings.coolingEnabled === false}
                onChange={value => update({ minFanSpeed: value, maxFanSpeed: value, fanAlwaysOn: value > 0 })}
              />
              <label className="grid grid-cols-[1fr_120px] items-center gap-3">
                <span className={FIELD_LABEL}>Disable first layers</span>
                <NumericInput
                  disabled={globalSettings.coolingEnabled === false}
                  value={globalSettings.disableFanFirstLayers ?? 1}
                  onChange={value => update({ disableFanFirstLayers: value })}
                />
              </label>
            </div>
          </Panel>
        </div>
      )}

      {level === 'expert' && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <Panel title="Hardware profiles" badge="Canonical source">
            <ToolheadProfilesSettings
              toolheads={toolheads}
              onUpdateToolheads={onUpdateToolheads}
              globalSettings={globalSettings}
              onUpdateGlobalSettings={onUpdateGlobalSettings}
              selectedMaterials={selectedMaterials}
              userMaterials={userMaterials}
              onAssignMaterial={onAssignMaterial}
            />
          </Panel>

          <Panel title="Model exceptions" badge={`${models.length} ${models.length === 1 ? 'model' : 'models'}`}>
            <ModelProcessProfilesSettings models={models} globalSettings={globalSettings} onUpdateModel={onUpdateModel} />
          </Panel>
        </div>
      )}
    </div>
  );
};
