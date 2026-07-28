import React, { useState } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { ZZone, ModelData, ToolheadConfig, GlobalSettings, PoreInjectionConfig, INFILL_PATTERN_LABELS, InfillPattern } from '../../types';
import { generateUUID } from '../../utils';
import { ToolheadSelect, SCAFFOLD_FEATURE_META } from '../ToolheadPanel/ToolheadPanel';
import { getEffectiveInfillPattern, isGridInfillForPoreZone, WorkflowValidationContext } from '../../utils/workflowValidation';
import { InfoTooltip } from '../InfoTooltip';
import { estimateGridCellCapacityUl } from '../../utils/infillAnalysis';
import { isFdmToolhead, isSyringeToolhead, isUvToolhead, toolheadDisplayName } from '../../utils/toolheads';

interface Step5AdvancedProps {
  zZones: ZZone[];
  onUpdateZZones: (zones: ZZone[]) => void;
  models: ModelData[];
  toolheads: ToolheadConfig[];
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
}

export const Step5Advanced: React.FC<Step5AdvancedProps> = ({
  zZones,
  onUpdateZZones,
  models,
  toolheads,
  globalSettings,
  onUpdateGlobalSettings,
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    zZones: true
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddZZone = (modelScope: 'all' | string = 'all') => {
    const newId = generateUUID();
    const sorted = [...zZones].sort((a, b) => a.zEndMm - b.zEndMm);
    const last = sorted[sorted.length - 1];
    const start = last ? last.zEndMm : 0;
    const end = start + 5.0; // Default 5mm slab

    const newZone: ZZone = {
      id: newId,
      modelScope,
      zStartMm: start,
      zEndMm: end,
      enabled: true,
      priority: 1,
      label: `ZONE ${zZones.length + 1}`,
      color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`,
    };

    onUpdateZZones([...zZones, newZone]);
  };

  const handleUpdateZZone = (id: string, updates: Partial<ZZone>) => {
    onUpdateZZones(zZones.map(z => z.id === id ? { ...z, ...updates } : z));
  };

  const handleDeleteZZone = (id: string) => {
    onUpdateZZones(zZones.filter(z => z.id !== id));
  };

  const sortedZones = [...zZones].sort((a, b) => a.zStartMm - b.zStartMm);
  const poreZones = sortedZones.filter(zone => zone.parameterOverride?.poreInjection?.enabled);
  const globalPore = globalSettings.poreInjection;
  const globalPoreEnabled = !!globalPore?.enabled;
  const syringeTools = toolheads.filter(isSyringeToolhead).filter(tool => tool.slot !== undefined);
  const syringeReady = syringeTools.length > 0;
  const syringeTool = syringeTools.find(tool => tool.id === globalPore?.syringeToolhead) || syringeTools[0];
  const syringeCalibration = syringeTool?.flowRateUlPerMm;
  const fdmTool = toolheads.find(isFdmToolhead);
  const extrusionWidthMm = fdmTool?.nozzleDiameter ?? (globalSettings.nozzleDiameter ?? 0.4);
  const uvTool = toolheads.find(isUvToolhead);
  const uvTools = toolheads.filter(isUvToolhead).filter(tool => tool.slot !== undefined);
  const uvReady = uvTool?.slot !== undefined;
  const defaultToolId = toolheads.find(tool => tool.slot !== undefined)?.id ?? 'none';
  const defaultZoneScaffoldTools = {
    perimeter: defaultToolId,
    infill: defaultToolId,
    solidInfill: defaultToolId,
    bottomLayers: defaultToolId,
    topLayers: defaultToolId,
    support: defaultToolId,
  };
  const workflowContext: WorkflowValidationContext = { globalSettings, models, toolheads, zZones };
  const wholeScaffoldGridReady = models.length === 0
    ? getEffectiveInfillPattern(globalSettings) === 'grid'
    : models.every(model => getEffectiveInfillPattern(globalSettings, model) === 'grid');
  const gridReady = globalPoreEnabled
    ? wholeScaffoldGridReady
    : poreZones.length === 0
      ? getEffectiveInfillPattern(globalSettings) === 'grid'
      : poreZones.every(zone => isGridInfillForPoreZone(workflowContext, zone));
  const estimatedScaffoldHeightMm = Math.max(
    10,
    ...models.map(model => (model.size?.z || 0) * (model.transform.scale.z || 1)),
  );
  const layerHeightMm = Number(globalSettings.layerHeight || 200) / 1000;
  const firstLayerHeightMm = Number(globalSettings.firstLayerHeight || 300) / 1000;
  const bottomLayerCount = Math.max(
    Number(globalSettings.bottomSolidLayers ?? 3),
    ...models.map(model => Number(model.fdmSettings?.bottomSolidLayers ?? 0)),
  );
  const bottomShellThicknessMm = bottomLayerCount * layerHeightMm;
  const bottomShellTopMm = bottomLayerCount > 0
    ? firstLayerHeightMm + Math.max(0, bottomLayerCount - 1) * layerHeightMm
    : 0;
  const globalEstimatedCellCapacityUl = estimateGridCellCapacityUl(
    Number(globalSettings.infill ?? 15),
    extrusionWidthMm,
    layerHeightMm,
  );

  const defaultPoreConfig = (zEndMm: number): PoreInjectionConfig => ({
    enabled: true,
    mode: 'layer_by_layer',
    syringeToolhead: syringeTool?.id ?? 'none',
    zStartMm: bottomShellTopMm,
    zEndMm,
    flowRateUlPerCell: 0.5,
  });

  const updateGlobalPore = (updates: Partial<PoreInjectionConfig>) => {
    if (!globalPore) return;
    onUpdateGlobalSettings({
      ...globalSettings,
      poreInjection: { ...globalPore, ...updates },
    });
  };

  const toggleGlobalPore = () => {
    if (!globalPoreEnabled) {
      if (!syringeReady) return;
      onUpdateGlobalSettings({
        ...globalSettings,
        poreInjection: { ...defaultPoreConfig(estimatedScaffoldHeightMm), ...(globalPore || {}), enabled: true },
      });
      return;
    }
    updateGlobalPore({ enabled: false });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-left-1 pb-10 relative">
      <div className="sticky -top-2 z-20 bg-surface-light/40 dark:bg-slate-950/40 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 -mx-2 -mt-2 px-4 py-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="layers" className="text-primary text-[10px]" />
          </div>
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">Advanced Overrides</h2>
            <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Height-based variations</p>
          </div>
        </div>
        <button 
          onClick={() => handleAddZZone()}
          className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white rounded-md shadow-sm hover:bg-primary-dark transition-all text-[9px] font-black uppercase tracking-widest"
        >
          <Icon name="add" className="text-[10px]" />
          New Zone
        </button>
      </div>

      {/* The main toggle applies to the whole scaffold. Zonal activation lives inside each zone. */}
      <section className="mx-1 rounded-xl border border-cyan-200 dark:border-cyan-800/60 bg-cyan-50/60 dark:bg-cyan-950/20 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Icon name="water_drop" className="text-base" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-800 dark:text-cyan-300">Pore Injection</h3>
                <InfoTooltip
                  label="About Pore Injection"
                  content="Applies pore injection to the complete scaffold. For localized injection, create a New Zone and enable Pore Injection inside its Params section."
                  className="border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-300"
                />
              </div>
              <span className="text-[8px] font-mono font-bold text-cyan-700 dark:text-cyan-400">
                {globalPoreEnabled ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-cyan-200/80 dark:border-cyan-800/60 bg-white/70 dark:bg-slate-900/40 px-2.5 py-2">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-cyan-900 dark:text-cyan-200">
              Enable Pore Injection
              <InfoTooltip
                content="Enables layer-by-layer injection across the base scaffold. Z-zones are independent override regions and require their own Pore Injection toggle."
                className="border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-300"
              />
            </span>
          </div>
          <button
            disabled={!syringeReady}
            onClick={toggleGlobalPore}
            className={`relative w-9 h-5 rounded-full transition-all ${globalPoreEnabled ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'} ${!syringeReady ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={!syringeReady ? 'Assign a syringe toolhead in Machine Setup first' : 'Toggle base-scaffold Pore Injection'}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow transition-all ${globalPoreEnabled ? 'right-1' : 'left-1'}`} />
          </button>
        </div>
        {globalPoreEnabled && globalPore && (
          <div className="space-y-2 rounded-lg border border-cyan-200 dark:border-cyan-800/60 bg-white/70 dark:bg-slate-900/40 p-2.5 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[7px] text-cyan-700 dark:text-cyan-300 font-black uppercase tracking-widest">Injection profile</span>
              <span className="text-[7px] font-mono text-cyan-600 dark:text-cyan-400">{bottomShellTopMm.toFixed(2)} → {estimatedScaffoldHeightMm.toFixed(1)} mm</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-cyan-200/70 dark:border-cyan-800/60 bg-cyan-100/40 dark:bg-cyan-950/40 px-2 py-1.5">
              <Icon name="layers" className="text-sm text-cyan-600 dark:text-cyan-300" />
              <div>
                <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-cyan-800 dark:text-cyan-200">
                  Layer-by-layer protocol
                  <InfoTooltip content="Injection occurs immediately after each eligible infill layer, while its pores remain accessible." className="border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-300" />
                </span>
              </div>
            </div>
            {String(globalPore.mode) !== 'layer_by_layer' && (
              <button onClick={() => updateGlobalPore({ mode: 'layer_by_layer' })} className="w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-left text-[7px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                This project uses the retired multilayer mode. Click to convert it to layer-by-layer before slicing.
              </button>
            )}
            <div className="space-y-1">
              <span className="text-[8px] text-slate-500 font-black uppercase">Injection tool</span>
              <select
                value={globalPore.syringeToolhead}
                onChange={event => updateGlobalPore({ syringeToolhead: event.target.value })}
                className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {syringeTools.map(tool => <option key={tool.id} value={tool.id}>{toolheadDisplayName(tool)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-[8px] text-slate-500 font-black uppercase">
                Volume per pore (µL)
                <InfoTooltip content="Dose deposited at every detected GRID cell. Syringe motion, retraction and dose conversion are inherited from the assigned syringe head." />
              </span>
              <NumericInput value={globalPore.flowRateUlPerCell} onChange={v => updateGlobalPore({ flowRateUlPerCell: v })} className="h-7 text-[10px] bg-white dark:bg-slate-900" step={0.1} min={0.01} />
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[8px] dark:bg-slate-800/60">
                <span className="flex items-center gap-1 text-slate-500">
                  Estimated geometric max
                  <InfoTooltip content="Pre-slice estimate per cell and per layer. The preview replaces it with measurements from the generated GRID toolpath. This value is informative and does not limit the requested dose." />
                </span>
                <span className="font-mono font-black text-cyan-700 dark:text-cyan-300">{globalEstimatedCellCapacityUl.toFixed(3)} µL/cell</span>
              </div>
            </div>
            <div className="rounded-md border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 px-2 py-1.5">
              <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-200">
                <span className="flex items-center gap-1.5">
                  Bottom shell linked
                  <InfoTooltip content={`Injection begins only after the protected bottom envelope ends at Z ${bottomShellTopMm.toFixed(2)} mm.`} className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" />
                </span>
                <span>{bottomShellThicknessMm.toFixed(2)} mm protected</span>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-black uppercase tracking-wider">
          <span className={`px-2 py-1 rounded-full border ${syringeReady ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {syringeReady ? 'Syringe ready' : 'Assign syringe head'}
          </span>
          <span className={`px-2 py-1 rounded-full border ${syringeCalibration && syringeCalibration > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {syringeCalibration && syringeCalibration > 0 ? 'Head calibrated' : 'Calibration required'}
          </span>
          <span className={`px-2 py-1 rounded-full border ${gridReady ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {gridReady ? 'GRID active' : 'Change to GRID'}
          </span>
        </div>
      </section>

      <div className="relative pl-6 pr-1 space-y-6">
        {/* Vertical Timeline Line */}
        {sortedZones.length > 0 && (
          <div className="absolute left-[11px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-primary/20 via-primary/10 to-transparent rounded-full" />
        )}

        {sortedZones.length === 0 && (
          <div className="ml-2 text-center py-10 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
            <Icon name="straighten" className="text-slate-300 dark:text-slate-700 text-3xl mb-2 opacity-50" />
            <p className="text-[10px] text-slate-400 uppercase font-black">No height zones defined</p>
            <p className="text-[8px] text-slate-400 mt-1 px-10">Zones allow you to change print settings at specific Z heights.</p>
          </div>
        )}

        {sortedZones.map((zone, idx) => (
          <div key={zone.id} className="relative group animate-in fade-in slide-in-from-top-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
            {/* Timeline Marker */}
            <div className="absolute -left-[20px] top-4 w-4 h-4 rounded-full bg-white dark:bg-slate-900 border-2 border-primary shadow-sm flex items-center justify-center z-10 transition-transform group-hover:scale-110">
               <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: zone.color }} />
            </div>

            <div className="bg-white dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Zone Header */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/40 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="flex flex-col">
                    <span className="text-[7px] text-slate-400 font-black uppercase tracking-widest leading-none mb-0.5">Scope</span>
                    <select 
                      className="text-[9px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none font-black text-primary uppercase tracking-tighter"
                      value={zone.modelScope}
                      onChange={e => handleUpdateZZone(zone.id, { modelScope: e.target.value })}
                    >
                       <option value="all">Global</option>
                       {models.map(m => (
                         <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>
                       ))}
                    </select>
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[7px] text-slate-400 font-black uppercase tracking-widest leading-none mb-0.5">Label</span>
                    <input 
                      className="text-[10px] font-bold uppercase bg-transparent outline-none truncate text-slate-700 dark:text-slate-300 w-full"
                      value={zone.label}
                      onChange={e => handleUpdateZZone(zone.id, { label: e.target.value })}
                      placeholder="ZONE NAME..."
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-2">
                   <button 
                     onClick={() => handleDeleteZZone(zone.id)}
                     className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 transition-all"
                   >
                     <Icon name="delete" className="text-xs" />
                   </button>
                </div>
              </div>

              {/* Height Inputs */}
              <div className="p-3 grid grid-cols-2 gap-4 bg-white dark:bg-transparent">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Z Start</span>
                    <span className="text-[8px] text-slate-300 font-mono">mm</span>
                  </div>
                  <NumericInput 
                    value={zone.zStartMm} 
                    onChange={v => handleUpdateZZone(zone.id, { zStartMm: v })}
                    className="h-8 text-[11px] font-mono border-slate-200 dark:border-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest">Z End</span>
                    <span className="text-[8px] text-slate-300 font-mono">mm</span>
                  </div>
                  <NumericInput 
                    value={zone.zEndMm} 
                    onChange={v => handleUpdateZZone(zone.id, { zEndMm: v })}
                    className="h-8 text-[11px] font-mono border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>

              {/* Toggle Controls - The "Tabs" */}
              <div className="px-3 pb-3">
                <div className="bg-slate-50 dark:bg-slate-900/60 p-1 rounded-lg flex gap-1 border border-slate-100 dark:border-slate-800">
                   <button 
                     onClick={() => handleUpdateZZone(zone.id, { featureOverride: zone.featureOverride ? undefined : { toolhead: defaultToolId, targetFeatures: ['all'] } })}
                     className={`flex-1 py-1 rounded-md transition-all font-black uppercase tracking-widest text-[8px] ${zone.featureOverride ? 'bg-white dark:bg-teal-500 text-teal-600 dark:text-white shadow-sm border border-teal-200 dark:border-teal-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                   >
                     Tool
                   </button>
                   <button 
                     onClick={() => handleUpdateZZone(zone.id, { parameterOverride: zone.parameterOverride ? undefined : { fdm: {} } })}
                     className={`flex-1 py-1 rounded-md transition-all font-black uppercase tracking-widest text-[8px] ${zone.parameterOverride ? 'bg-white dark:bg-violet-500 text-violet-600 dark:text-white shadow-sm border border-violet-200 dark:border-violet-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                   >
                     Params
                   </button>
                   <button 
                     disabled={!uvReady && !zone.processEvent}
                     onClick={() => handleUpdateZZone(zone.id, {
                       processEvent: zone.processEvent ? undefined : {
                         toolheadId: uvTool?.id,
                         pausePrint: false,
                       },
                     })}
                     className={`flex-1 py-1 rounded-md transition-all font-black uppercase tracking-widest text-[8px] ${zone.processEvent ? 'bg-white dark:bg-amber-500 text-amber-600 dark:text-white shadow-sm border border-amber-200 dark:border-amber-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'} ${!uvReady && !zone.processEvent ? 'cursor-not-allowed opacity-40' : ''}`}
                     title={!uvReady && !zone.processEvent ? 'Assign a UV head in Machine Setup first' : 'Configure a UV event override'}
                   >
                     Event
                   </button>
                </div>

                {/* Expanded Sections with fine borders and white backgrounds */}
                {(zone.featureOverride || zone.parameterOverride || zone.processEvent) && (
                  <div className="mt-3 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                    
                    {/* TOOL OVERRIDE */}
                    {zone.featureOverride && (
                      <div className="rounded-xl border border-teal-400/30 dark:border-teal-500/30 bg-white dark:bg-slate-900/40 p-3 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black uppercase tracking-widest text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full bg-teal-500" />
                            Tool Mapping
                          </span>
                          <button 
                            onClick={() => {
                              const isScaffold = !!zone.featureOverride?.scaffoldTools;
                              handleUpdateZZone(zone.id, { 
                                featureOverride: { 
                                  ...zone.featureOverride!, 
                                  scaffoldTools: isScaffold ? undefined : defaultZoneScaffoldTools
                                } 
                              });
                            }}
                            className={`text-[7px] px-2 py-0.5 rounded-full border font-black uppercase tracking-widest transition-colors ${!!zone.featureOverride.scaffoldTools ? 'bg-teal-500 text-white border-teal-500' : 'bg-white dark:bg-transparent text-teal-600 border-teal-200'}`}
                          >
                            {!!zone.featureOverride.scaffoldTools ? 'Scaffold Mode' : 'Single Head'}
                          </button>
                        </div>

                        {!zone.featureOverride.scaffoldTools ? (
                          <div className="space-y-1">
                            <span className="text-[7px] text-slate-400 font-black uppercase tracking-tighter">Active Tool</span>
                            <ToolheadSelect 
                              className="w-full h-8 text-[10px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                              value={zone.featureOverride.toolhead || defaultToolId}
                              onChange={v => handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, toolhead: v } })}
                              toolheads={toolheads}
                            />
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 gap-1.5">
                            {SCAFFOLD_FEATURE_META.map(feat => (
                               <div key={feat.key} className="flex items-center justify-between bg-slate-50/50 dark:bg-black/20 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <span className="text-[8px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-tighter truncate">{feat.label}</span>
                                  <ToolheadSelect
                                    value={zone.featureOverride?.scaffoldTools?.[feat.key] || defaultToolId}
                                    onChange={v => {
                                      handleUpdateZZone(zone.id, { 
                                        featureOverride: { 
                                          ...zone.featureOverride!, 
                                          scaffoldTools: { ...(zone.featureOverride?.scaffoldTools || defaultZoneScaffoldTools), [feat.key]: v }
                                        } 
                                      });
                                    }}
                                    className="w-24 h-6 text-[9px]"
                                    toolheads={toolheads}
                                  />
                               </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* PARAMETERS OVERRIDE */}
                    {zone.parameterOverride && (
                      <div className="rounded-xl border border-violet-400/30 dark:border-violet-500/30 bg-white dark:bg-slate-900/40 p-3 space-y-3">
                        <span className="text-[8px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-violet-500" />
                          Print Parameters
                        </span>
                        
                        <div className="grid grid-cols-2 gap-3">
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Layer Height (µm)</span>
                              <NumericInput 
                                value={zone.parameterOverride.fdm?.layerHeightMm ? (zone.parameterOverride.fdm.layerHeightMm * 1000) : (globalSettings.layerHeight || 200)}
                                onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), layerHeightMm: v / 1000 } } })}
                                className="h-7 text-[10px] bg-white dark:bg-slate-900"
                                step={10}
                              />
                           </div>
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Infill (%)</span>
                              <NumericInput 
                                value={zone.parameterOverride.fdm?.infillPercent ?? 15}
                                onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPercent: v } } })}
                                className="h-7 text-[10px] bg-white dark:bg-slate-900"
                              />
                           </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[7px] text-slate-400 font-black uppercase">Infill Pattern</span>
                          <select 
                            className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1.5 font-bold text-slate-700 dark:text-slate-300"
                            value={zone.parameterOverride.fdm?.infillPattern || 'grid'}
                            onChange={e => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPattern: e.target.value as any } } })}
                          >
                             {(Object.entries(INFILL_PATTERN_LABELS) as [InfillPattern, string][]).map(([val, label]) => (
                               <option key={val} value={val}>{label}</option>
                             ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 dark:border-slate-800">
                           <div className="text-center">
                              <span className="text-[7px] text-slate-400 font-black uppercase block mb-1">Walls</span>
                              <NumericInput 
                                value={zone.parameterOverride.fdm?.wallCount ?? 3}
                                onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), wallCount: v } } })}
                                className="h-6 text-[9px] bg-white dark:bg-slate-900"
                              />
                           </div>
                           <div className="text-center">
                              <span className="text-[7px] text-slate-400 font-black uppercase block mb-1">Top L.</span>
                              <NumericInput 
                                value={zone.parameterOverride.fdm?.topSolidLayers ?? 3}
                                onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), topSolidLayers: v } } })}
                                className="h-6 text-[9px] bg-white dark:bg-slate-900"
                              />
                           </div>
                           <div className="text-center">
                              <span className="text-[7px] text-slate-400 font-black uppercase block mb-1">Bot L.</span>
                              <NumericInput 
                                value={zone.parameterOverride.fdm?.bottomSolidLayers ?? 3}
                                onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), bottomSolidLayers: v } } })}
                                className="h-6 text-[9px] bg-white dark:bg-slate-900"
                              />
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-1">
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Perim. Speed</span>
                              <NumericInput 
                                value={zone.parameterOverride.fdm?.perimeterSpeedMmS ?? (globalSettings.perimeterSpeed || 45)}
                                onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), perimeterSpeedMmS: v } } })}
                                className="h-7 text-[10px] bg-white dark:bg-slate-900"
                              />
                           </div>
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Infill Speed</span>
                              <NumericInput 
                                value={zone.parameterOverride.fdm?.infillSpeedMmS ?? (globalSettings.infillSpeed || 80)}
                                onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillSpeedMmS: v } } })}
                                className="h-7 text-[10px] bg-white dark:bg-slate-900"
                              />
                           </div>
                        </div>

                        {/* Pore Injection Segment Toggle & Config */}
                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                          {(() => {
                            const zoneGridReady = isGridInfillForPoreZone(workflowContext, zone);
                            const zonePoreEnabled = !!zone.parameterOverride?.poreInjection?.enabled;
                            const toggleDisabled = !syringeReady || !zoneGridReady;
                            return (
                              <>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex flex-col">
                              <span className="text-[7px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Pore Injection</span>
                              <span className={`text-[6px] font-bold uppercase tracking-tighter ${zoneGridReady ? 'text-cyan-500' : 'text-amber-500'}`}>
                                {globalPoreEnabled ? 'Independent zone override' : 'Requires Grid Infill'}
                              </span>
                            </div>
                            <button
                              disabled={toggleDisabled}
                              onClick={() => {
                                if (toggleDisabled) return;
                                const current = zone.parameterOverride?.poreInjection;
                                handleUpdateZZone(zone.id, {
                                  parameterOverride: {
                                    ...zone.parameterOverride!,
                                    poreInjection: current?.enabled ? undefined : {
                                      enabled: true,
                                      mode: 'layer_by_layer',
                                      syringeToolhead: syringeTool?.id ?? 'none',
                                      zStartMm: zone.zStartMm,
                                      zEndMm: zone.zEndMm,
                                      flowRateUlPerCell: 0.5,
                                    } 
                                  } 
                                });
                              }}
                              className={`relative w-8 h-4 rounded-full transition-all ${
                                zonePoreEnabled
                                  ? 'bg-cyan-500'
                                  : 'bg-slate-200 dark:bg-slate-700'
                              } ${toggleDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                              title={!syringeReady ? 'Assign a syringe toolhead in Machine Setup first' : !zoneGridReady ? 'Select GRID infill for this zone first' : 'Toggle Pore Injection for this zone'}
                            >
                              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${
                                zonePoreEnabled ? 'right-0.5' : 'left-0.5'
                              }`} />
                            </button>
                          </div>
                              </>
                            );
                          })()}

                          {zone.parameterOverride?.poreInjection?.enabled && (() => {
                            const activeModel = zone.modelScope === 'all' ? models[0] : models.find(m => m.id === zone.modelScope) || models[0];
                            const effectivePattern = getEffectiveInfillPattern(globalSettings, activeModel, zone);
                            const zoneInfillPercent = zone.parameterOverride?.fdm?.infillPercent
                              ?? activeModel?.fdmSettings?.infillPercent
                              ?? globalSettings.infill
                              ?? 15;
                            const zoneEstimatedCellCapacityUl = estimateGridCellCapacityUl(
                              Number(zoneInfillPercent),
                              extrusionWidthMm,
                              Number(zone.parameterOverride?.fdm?.layerHeightMm ?? layerHeightMm),
                            );

                            return (
                            <div className="space-y-3 bg-cyan-50/30 dark:bg-cyan-900/10 p-2.5 rounded-lg border border-cyan-100 dark:border-cyan-800/30 animate-in fade-in slide-in-from-top-1">
                              <select
                                value={zone.parameterOverride.poreInjection.syringeToolhead}
                                onChange={event => handleUpdateZZone(zone.id, {
                                  parameterOverride: {
                                    ...zone.parameterOverride!,
                                    poreInjection: { ...zone.parameterOverride!.poreInjection!, syringeToolhead: event.target.value },
                                  },
                                })}
                                className="h-7 w-full rounded-md border border-cyan-200 bg-white px-2 text-[9px] font-bold text-slate-700 outline-none dark:border-cyan-800 dark:bg-slate-900 dark:text-slate-200"
                              >
                                {syringeTools.map(tool => <option key={tool.id} value={tool.id}>{toolheadDisplayName(tool)}</option>)}
                              </select>
                              
                              <div className="flex items-center gap-2 rounded-md border border-cyan-200/70 dark:border-cyan-800/60 bg-cyan-100/40 dark:bg-cyan-950/40 px-2 py-1.5">
                                <Icon name="layers" className="text-sm text-cyan-600 dark:text-cyan-300" />
                              <div>
                                  <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-cyan-800 dark:text-cyan-200">
                                    Layer-by-layer protocol
                                    <InfoTooltip content="Injection runs immediately after the current layer infill, before the next layer closes access to the pore." className="border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-300" />
                                  </span>
                                </div>
                              </div>
                              {String(zone.parameterOverride.poreInjection.mode) !== 'layer_by_layer' && (
                                <button onClick={() => handleUpdateZZone(zone.id, {
                                  parameterOverride: { ...zone.parameterOverride!, poreInjection: { ...zone.parameterOverride!.poreInjection!, mode: 'layer_by_layer' } },
                                })} className="w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-left text-[7px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                  This zone uses the retired multilayer mode. Click to convert it to layer-by-layer.
                                </button>
                              )}

                              <div className="space-y-1">
                                <span className="flex items-center gap-1.5 text-[8px] text-slate-500 font-black uppercase">
                                  Volume per pore (µL)
                                  <InfoTooltip content="Dose deposited at each detected pore inside this zone. Motion and dose conversion come from the central syringe profile." />
                                </span>
                                <NumericInput
                                  value={zone.parameterOverride.poreInjection.flowRateUlPerCell}
                                  onChange={v => handleUpdateZZone(zone.id, {
                                    parameterOverride: {
                                      ...zone.parameterOverride!,
                                      poreInjection: { ...zone.parameterOverride!.poreInjection!, flowRateUlPerCell: v }
                                    }
                                  })}
                                  className="h-7 text-[10px] bg-white dark:bg-slate-900"
                                  step={0.1}
                                  min={0.01}
                                />
                                <div className="flex items-center justify-between rounded-md bg-white/80 px-2 py-1 text-[8px] dark:bg-slate-900/60">
                                  <span className="flex items-center gap-1 text-slate-500">
                                    Estimated geometric max
                                    <InfoTooltip content="Pre-slice capacity per detected GRID cell and layer. It is informational; the requested dose remains unrestricted." />
                                  </span>
                                  <span className="font-mono font-black text-cyan-700 dark:text-cyan-300">{zoneEstimatedCellCapacityUl.toFixed(3)} µL/cell</span>
                                </div>
                              </div>
                              <div className="rounded-md border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 px-2 py-1.5">
                                <div className="flex items-center justify-between text-[7px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-200">
                                  <span className="flex items-center gap-1.5">
                                    Bottom shell linked
                                    <InfoTooltip content={`This zone cannot inject below the protected bottom envelope ending at Z ${bottomShellTopMm.toFixed(2)} mm.`} className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" />
                                  </span>
                                  <span>{bottomShellThicknessMm.toFixed(2)} mm protected</span>
                                </div>
                              </div>

                              {effectivePattern !== 'grid' && (
                                <p className="text-[7px] text-amber-600 font-bold italic">Note: Only works with GRID pattern</p>
                              )}
                            </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}

                    {/* EVENT OVERRIDE */}
                    {zone.processEvent && (
                      <div className="rounded-xl border border-amber-400/30 dark:border-amber-500/30 bg-white dark:bg-slate-900/40 p-3 space-y-3">
                        <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <div className="w-1 h-1 rounded-full bg-amber-500" />
                          Process Event
                        </span>
                        <select
                          value={zone.processEvent.toolheadId ?? uvTool?.id ?? ''}
                          onChange={event => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, toolheadId: event.target.value } })}
                          className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-[9px] font-bold text-slate-700 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {uvTools.map(tool => <option key={tool.id} value={tool.id}>{toolheadDisplayName(tool)}</option>)}
                        </select>

                        <div className="grid grid-cols-2 gap-2">
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Mode</span>
                              <select 
                                className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1.5 font-bold"
                                value={zone.processEvent.mode ?? (uvTool?.mode === 'scanning' ? 'sweep' : 'stationary')}
                                onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, mode: e.target.value as any } })}
                              >
                                 <option value="stationary">Stationary</option>
                                 <option value="sweep">Sweep</option>
                              </select>
                           </div>
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Trigger</span>
                              <select 
                                className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1.5 font-bold"
                                value={zone.processEvent.trigger || 'after_layer'}
                                onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, trigger: e.target.value as any } })}
                              >
                                 <option value="after_layer">Layerwise</option>
                                 <option value="after_segment">End Zone</option>
                              </select>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Power (%)</span>
                              <NumericInput 
                                value={zone.processEvent.powerPercentage ?? 100}
                                onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, powerPercentage: v } })}
                                className="h-7 text-[10px] font-mono bg-white dark:bg-slate-900"
                              />
                           </div>
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Z-Hop (mm)</span>
                              <NumericInput 
                                value={zone.processEvent.zOffsetMm ?? 2.0}
                                onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, zOffsetMm: v } })}
                                className="h-7 text-[10px] font-mono bg-white dark:bg-slate-900"
                                step={0.1}
                              />
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Global Pore Injection System Panel removed in favor of Segment-based injection */}


    </div>
  );
};
