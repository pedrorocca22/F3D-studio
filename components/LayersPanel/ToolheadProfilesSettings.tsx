import React, { useEffect, useMemo, useState } from 'react';
import {
  FDMToolheadConfig,
  GlobalSettings,
  MaterialProfile,
  SyringeToolheadConfig,
  ToolheadConfig,
  UVToolheadConfig,
} from '../../types';
import { getTipById } from '../../constants/nozzleTips';
import { NumericInput } from './NumericInput';
import { useProjectContext } from '../../contexts/ProjectContext';
import {
  getToolheadType,
  isFdmToolhead,
  isSyringeToolhead,
  isUvToolhead,
} from '../../utils/toolheads';

interface ToolheadProfilesSettingsProps {
  toolheads: ToolheadConfig[];
  onUpdateToolheads: (toolheads: ToolheadConfig[]) => void;
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  selectedMaterials: Record<string, string>;
  userMaterials: MaterialProfile[];
  onAssignMaterial: (toolheadId: string, materialId: string) => void;
}

const FIELD_LABEL = 'text-[8px] font-black uppercase tracking-wider text-slate-400';

const Field: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}> = ({ label, value, onChange, step, min, max }) => (
  <label className="space-y-1">
    <span className={FIELD_LABEL}>{label}</span>
    <NumericInput value={value} onChange={onChange} step={step} min={min} max={max} />
  </label>
);

const ProfileHeader: React.FC<{
  title: string;
  slot?: number;
}> = ({ title, slot }) => (
  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
    <h3 className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">{title}</h3>
    <span className="text-[7px] font-black uppercase tracking-wider text-slate-400">Slot {(slot ?? 0) + 1}</span>
  </div>
);

export const ToolheadProfilesSettings: React.FC<ToolheadProfilesSettingsProps> = ({
  toolheads,
  onUpdateToolheads,
  globalSettings,
  onUpdateGlobalSettings,
  selectedMaterials,
  userMaterials,
  onAssignMaterial,
}) => {
  const { project } = useProjectContext();
  const activeProfileIds = useMemo<string[]>(
    () => toolheads.filter(tool => tool.slot !== undefined).map(tool => tool.id),
    [toolheads],
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string>(activeProfileIds[0] ?? '');
  const selectedTool = toolheads.find(tool => tool.id === selectedProfileId);
  const fdm = isFdmToolhead(selectedTool) ? selectedTool : undefined;
  const syringe = isSyringeToolhead(selectedTool) ? selectedTool : undefined;
  const uv = isUvToolhead(selectedTool) ? selectedTool : undefined;
  const activeTip = syringe?.tipId
    ? project.tipsLibrary.find(tip => tip.id === syringe.tipId) || getTipById(syringe.tipId)
    : undefined;

  useEffect(() => {
    if (!activeProfileIds.includes(selectedProfileId)) {
      setSelectedProfileId(activeProfileIds[0] ?? '');
    }
  }, [activeProfileIds, selectedProfileId]);

  const updateFdm = (patch: Partial<FDMToolheadConfig>, globalPatch?: Partial<GlobalSettings>) => {
    onUpdateToolheads(toolheads.map(tool => tool.id === selectedProfileId ? { ...tool, ...patch } as ToolheadConfig : tool));
    if (globalPatch) onUpdateGlobalSettings({ ...globalSettings, ...globalPatch });
  };
  const updateSyringe = (patch: Partial<SyringeToolheadConfig>) => {
    onUpdateToolheads(toolheads.map(tool => tool.id === selectedProfileId ? { ...tool, ...patch } as ToolheadConfig : tool));
  };
  const updateUv = (patch: Partial<UVToolheadConfig>) => {
    onUpdateToolheads(toolheads.map(tool => tool.id === selectedProfileId ? { ...tool, ...patch } as ToolheadConfig : tool));
  };

  const materialsFor = (tool: 'fdm' | 'syringe') => userMaterials.filter(material => (
    tool === 'fdm'
      ? material.category === 'thermoplastic'
      : ['hydrogel', 'bio-ink', 'support'].includes(material.category)
  ));

  const materialSelect = (tool: FDMToolheadConfig | SyringeToolheadConfig) => (
    <label className="block space-y-1">
      <span className={FIELD_LABEL}>Assigned material</span>
      <select
        value={selectedMaterials[tool.id] || ''}
        onChange={event => onAssignMaterial(tool.id, event.target.value)}
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[9px] font-bold uppercase text-slate-700 outline-none transition-colors focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <option value="">Select material</option>
        {materialsFor(getToolheadType(tool) as 'fdm' | 'syringe').map(material => (
          <option key={material.id} value={material.id}>{material.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-3">
      {activeProfileIds.length > 0 ? (
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950/60">
          {toolheads.filter(tool => tool.slot !== undefined).map(tool => (
            <button
              key={tool.id}
              onClick={() => setSelectedProfileId(tool.id)}
              className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-[8px] font-black uppercase tracking-wider transition-all ${
                selectedProfileId === tool.id
                  ? 'bg-white text-primary shadow-sm dark:bg-slate-800 dark:text-emerald-300'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              T{tool.slot} · {tool.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-4 text-center text-[8px] font-bold text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          Assign a toolhead in Setup to expose its profile.
        </div>
      )}

      {fdm?.slot !== undefined && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
          <ProfileHeader title="FDM head" slot={fdm.slot} />
          {materialSelect(fdm)}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nozzle diameter (mm)" value={fdm.nozzleDiameter} onChange={value => updateFdm({ nozzleDiameter: value }, { nozzleDiameter: value })} step={0.05} min={0.1} />
            <Field label="Filament diameter (mm)" value={fdm.filamentDiameter} onChange={value => updateFdm({ filamentDiameter: value })} step={0.05} min={0.5} />
            <Field label="Print temperature (°C)" value={fdm.defaultTemperature} onChange={value => updateFdm({ defaultTemperature: value }, { nozzleTemperature: value })} step={5} min={0} max={fdm.maxTemperature} />
            <Field label="Maximum temperature (°C)" value={fdm.maxTemperature} onChange={value => updateFdm({ maxTemperature: value })} step={5} min={fdm.defaultTemperature} />
            <Field label="Flow multiplier (%)" value={fdm.flowratePercent ?? Math.round((globalSettings.extrusionMultiplier ?? 1) * 100)} onChange={value => updateFdm({ flowratePercent: value }, { extrusionMultiplier: value / 100 })} step={5} min={10} max={300} />
            <Field label="Retraction distance (mm)" value={fdm.retractionLength} onChange={value => updateFdm({ retractionLength: value, retractDistance: value }, { retractionLength: value })} step={0.1} min={0} />
            <Field label="Retraction speed (mm/s)" value={fdm.retractionSpeed} onChange={value => updateFdm({ retractionSpeed: value }, { retractionSpeed: value })} step={5} min={0} />
            <Field label="Z lift (mm)" value={fdm.zLiftDistance ?? 0.4} onChange={value => updateFdm({ zLiftDistance: value })} step={0.05} min={0} />
          </div>
        </section>
      )}

      {syringe?.slot !== undefined && (
        <section className="space-y-3 rounded-xl border border-cyan-200 bg-white p-3 shadow-sm dark:border-cyan-900/70 dark:bg-slate-900/50">
          <ProfileHeader title="Syringe head" slot={syringe.slot} />
          {materialSelect(syringe)}
          <label className="block space-y-1">
            <span className={FIELD_LABEL}>Injection tip</span>
            <select
              value={syringe.tipId || ''}
              onChange={event => {
                const tip = project.tipsLibrary.find(item => item.id === event.target.value) || getTipById(event.target.value);
                if (tip) updateSyringe({ tipId: tip.id, nozzleDiameterMm: tip.innerDiameterMm });
              }}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-700 outline-none transition-colors focus:border-primary dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Select tip</option>
              <optgroup label="Conical">
                {project.tipsLibrary.filter(tip => tip.type === 'conical' && !tip.isCustom).map(tip => (
                  <option key={tip.id} value={tip.id}>{tip.gauge} GA · ID {tip.innerDiameterMm} mm · {tip.colorName}</option>
                ))}
              </optgroup>
              <optgroup label="Straight">
                {project.tipsLibrary.filter(tip => tip.type === 'straight' && !tip.isCustom).map(tip => (
                  <option key={tip.id} value={tip.id}>{tip.gauge} GA · ID {tip.innerDiameterMm} mm · {tip.colorName}</option>
                ))}
              </optgroup>
              {project.tipsLibrary.some(tip => tip.isCustom) && (
                <optgroup label="Custom">
                  {project.tipsLibrary.filter(tip => tip.isCustom).map(tip => (
                    <option key={tip.id} value={tip.id}>{tip.gauge} GA · ID {tip.innerDiameterMm} mm · {tip.colorName}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {activeTip && (
              <span className="block text-[8px] font-medium text-slate-400">
                {activeTip.type === 'conical' ? 'Conical' : 'Straight'} · {activeTip.brand} {activeTip.series} · Ref. {activeTip.standardRef || 'Custom'}
              </span>
            )}
          </label>
          <div className="grid grid-cols-2 gap-2 border-t border-cyan-100 pt-3 dark:border-cyan-900/50">
            <Field label="Syringe capacity (mL)" value={syringe.syringeVolumeMl} onChange={value => updateSyringe({ syringeVolumeMl: value })} step={1} min={0.1} />
            <Field label="Actuator speed (mm/s)" value={syringe.flowrateMmPerSec ?? 2} onChange={value => updateSyringe({ flowrateMmPerSec: value })} step={0.1} min={0.01} />
            <Field label="Retraction distance (mm)" value={syringe.retractDistance ?? 1} onChange={value => updateSyringe({ retractDistance: value })} step={0.1} min={0} />
          </div>
          <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[8px] font-bold ${
            syringe.flowRateUlPerMm > 0
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
          }`}>
            {syringe.flowRateUlPerMm > 0 ? 'Internal dose conversion is available' : 'Dose conversion requires machine calibration'}
          </div>
        </section>
      )}

      {uv?.slot !== undefined && (
        <section className="space-y-3 rounded-xl border border-violet-200 bg-white p-3 shadow-sm dark:border-violet-900/70 dark:bg-slate-900/50">
          <ProfileHeader title="UV head" slot={uv.slot} />
          <div className="space-y-1">
            <span className={FIELD_LABEL}>Wavelength</span>
            <div className="grid grid-cols-3 gap-1.5">
              {([365, 385, 405] as const).map(wavelength => (
                <button
                  key={wavelength}
                  onClick={() => updateUv({ wavelengthNm: wavelength })}
                  className={`rounded-md border py-1.5 text-[9px] font-black transition-all ${
                    uv.wavelengthNm === wavelength
                      ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-violet-300 dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  {wavelength} nm
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1">
            <span className={FIELD_LABEL}>Operation mode</span>
            <select
              value={uv.mode}
              onChange={event => updateUv({ mode: event.target.value as UVToolheadConfig['mode'] })}
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[9px] font-bold uppercase text-slate-700 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="fixed">Fixed exposure</option>
              <option value="scanning">Scanning exposure</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Maximum power (mW)" value={uv.maxPowerMw} onChange={value => updateUv({ maxPowerMw: value })} step={10} min={1} />
            <Field label="Default dose (mJ/cm²)" value={uv.defaultDose} onChange={value => updateUv({ defaultDose: value })} step={1} min={0} />
            <Field label="Default exposure (s)" value={uv.defaultExposureTime} onChange={value => updateUv({ defaultExposureTime: value })} step={0.5} min={0} />
          </div>
        </section>
      )}
    </div>
  );
};
