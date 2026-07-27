import React, { useState } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { ZZone, ModelData, ToolheadConfig, GlobalSettings, PoreInjectionConfig, INFILL_PATTERN_LABELS, InfillPattern } from '../../types';
import { generateUUID } from '../../utils';
import { analyzeGridInfill } from '../../utils/infillAnalysis';
import { ToolheadSelect, SCAFFOLD_FEATURE_META, DEFAULT_SCAFFOLD_TOOLS } from '../ToolheadPanel/ToolheadPanel';
import { getEffectiveInfillPattern, isGridInfillForPoreZone, WorkflowValidationContext } from '../../utils/workflowValidation';

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
  const syringeReady = toolheads.some(tool => tool.id === 'syringe' && tool.slot !== undefined);
  const syringeTool = toolheads.find(tool => tool.id === 'syringe' && tool.slot !== undefined);
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

  const defaultPoreConfig = (zEndMm: number): PoreInjectionConfig => ({
    enabled: true,
    mode: 'layer_by_layer',
    syringeToolhead: 'syringe',
    zStartMm: 0,
    zEndMm,
    injectionDepthMm: 0.3,
    flowRateUlPerCell: 0.5,
    travelFeedrateMmMin: 6000,
    injectionFeedrateMmMin: 120,
    cellSizeToleranceMm: 0.1,
    minCellSizeMm: 0.5,
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
      if (!syringeReady || poreZones.length > 0) return;
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
              <h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-800 dark:text-cyan-300">Pore Injection</h3>
              <span className="text-[8px] font-mono font-bold text-cyan-700 dark:text-cyan-400">
                {globalPoreEnabled ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
            <p className="hidden">
              Infuses a secondary bioink into detected GRID pores. Use the direct mode for the entire scaffold,
              or use the zone Params toggle for height-specific injection.
              Configure the mode and dose inside a zone’s <b>Params</b> section.
            </p>
            <p className="text-[8px] leading-relaxed text-cyan-900/70 dark:text-cyan-200/70 mt-1">
              Applies pore injection to the complete scaffold. For localized injection, create a New Zone and enable Pore Injection inside its Params section.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg border border-cyan-200/80 dark:border-cyan-800/60 bg-white/70 dark:bg-slate-900/40 px-2.5 py-2">
          <div className="min-w-0">
            <span className="block text-[8px] font-black uppercase tracking-widest text-cyan-900 dark:text-cyan-200">Enable Pore Injection</span>
            <span className="block text-[7px] text-cyan-800/60 dark:text-cyan-300/60 mt-0.5">
              {poreZones.length > 0 ? 'Controlled by an active Z-Zone' : 'Applies to the complete scaffold'}
            </span>
          </div>
          <button
            disabled={!syringeReady || (!globalPoreEnabled && poreZones.length > 0)}
            onClick={toggleGlobalPore}
            className={`relative w-9 h-5 rounded-full transition-all ${globalPoreEnabled ? 'bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'} ${(!syringeReady || (!globalPoreEnabled && poreZones.length > 0)) ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={!syringeReady ? 'Assign a syringe toolhead in Machine Setup first' : !globalPoreEnabled && poreZones.length > 0 ? 'Disable zonal pore injection first' : 'Toggle Pore Injection'}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow transition-all ${globalPoreEnabled ? 'right-1' : 'left-1'}`} />
          </button>
        </div>
        {globalPoreEnabled && globalPore && (
          <div className="space-y-2 rounded-lg border border-cyan-200 dark:border-cyan-800/60 bg-white/70 dark:bg-slate-900/40 p-2.5 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[7px] text-cyan-700 dark:text-cyan-300 font-black uppercase tracking-widest">Injection profile</span>
              <span className="text-[7px] font-mono text-cyan-600 dark:text-cyan-400">0 → {estimatedScaffoldHeightMm.toFixed(1)} mm</span>
            </div>
            <div className="flex bg-cyan-100/50 dark:bg-cyan-950/50 p-1 rounded-md border border-cyan-200/50 dark:border-cyan-800/50">
              {(['layer_by_layer', 'multilayer'] as const).map(mode => (
                <button key={mode} onClick={() => updateGlobalPore({ mode })} className={`flex-1 py-1 rounded text-[8px] font-black uppercase tracking-widest ${globalPore.mode === mode ? 'bg-white dark:bg-cyan-600 text-cyan-700 dark:text-white shadow-sm' : 'text-cyan-600/60 dark:text-cyan-400/60'}`}>
                  {mode === 'layer_by_layer' ? 'Layer by Layer' : 'Multilayer'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Toolhead</span><select value={globalPore.syringeToolhead} onChange={e => updateGlobalPore({ syringeToolhead: e.target.value as any })} className="w-full h-6 rounded border border-slate-200 dark:border-slate-800 text-[9px] bg-white dark:bg-slate-900 font-bold outline-none px-1"><option value="syringe">SYRINGE</option></select></div>
              <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Inject Feedrate</span><NumericInput value={globalPore.injectionFeedrateMmMin} onChange={v => updateGlobalPore({ injectionFeedrateMmMin: v })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={10} /></div>
              <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Travel Feedrate</span><NumericInput value={globalPore.travelFeedrateMmMin} onChange={v => updateGlobalPore({ travelFeedrateMmMin: v })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={100} /></div>
            </div>
            <div className="space-y-1 pt-1 border-t border-cyan-100 dark:border-cyan-800/40">
              <span className="text-[7px] text-slate-400 font-black uppercase">Calibration (µL/mm)</span>
              <NumericInput value={globalPore.calibrationUlPerMm ?? (syringeTool?.id === 'syringe' ? syringeTool.flowRateUlPerMm : 0)} onChange={v => updateGlobalPore({ calibrationUlPerMm: v, calibrationTipId: syringeTool?.id === 'syringe' ? syringeTool.tipId : undefined })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={0.01} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {globalPore.mode === 'layer_by_layer' ? (
                <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Flow/Pore (µL)</span><NumericInput value={globalPore.flowRateUlPerCell} onChange={v => updateGlobalPore({ flowRateUlPerCell: v })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={0.1} /></div>
              ) : (
                <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Target Volume (µL)</span><NumericInput value={globalPore.targetVolumeUl ?? 0} onChange={v => updateGlobalPore({ targetVolumeUl: v })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={1} /></div>
              )}
              <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Depth (mm)</span><NumericInput value={globalPore.injectionDepthMm} onChange={v => updateGlobalPore({ injectionDepthMm: v })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={0.05} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cyan-100 dark:border-cyan-800/40">
              <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Cell Tolerance (mm)</span><NumericInput value={globalPore.cellSizeToleranceMm ?? 0.1} onChange={v => updateGlobalPore({ cellSizeToleranceMm: v })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={0.05} /></div>
              <div className="space-y-1"><span className="text-[7px] text-slate-400 font-black uppercase">Min Cell (mm)</span><NumericInput value={globalPore.minCellSizeMm ?? 0.5} onChange={v => updateGlobalPore({ minCellSizeMm: v })} className="h-6 text-[9px] bg-white dark:bg-slate-900" step={0.1} /></div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-[8px] font-black uppercase tracking-wider">
          <span className={`px-2 py-1 rounded-full border ${syringeReady ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
            {syringeReady ? 'Syringe ready' : 'Assign syringe head'}
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
                     onClick={() => handleUpdateZZone(zone.id, { featureOverride: zone.featureOverride ? undefined : { toolhead: 'fdm', targetFeatures: ['all'] } })}
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
                     onClick={() => handleUpdateZZone(zone.id, { processEvent: zone.processEvent ? undefined : { uvExposureTimeSec: 5, doseTargetMjCm2: 50, pausePrint: false } })}
                     className={`flex-1 py-1 rounded-md transition-all font-black uppercase tracking-widest text-[8px] ${zone.processEvent ? 'bg-white dark:bg-amber-500 text-amber-600 dark:text-white shadow-sm border border-amber-200 dark:border-amber-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
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
                                  scaffoldTools: isScaffold ? undefined : DEFAULT_SCAFFOLD_TOOLS 
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
                              value={zone.featureOverride.toolhead || 'fdm'}
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
                                    value={zone.featureOverride?.scaffoldTools?.[feat.key] || 'fdm'}
                                    onChange={v => {
                                      handleUpdateZZone(zone.id, { 
                                        featureOverride: { 
                                          ...zone.featureOverride!, 
                                          scaffoldTools: { ...(zone.featureOverride?.scaffoldTools || DEFAULT_SCAFFOLD_TOOLS), [feat.key]: v } 
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
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex flex-col">
                              <span className="text-[7px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Pore Injection</span>
                              <span className="text-[6px] text-cyan-500 font-bold uppercase tracking-tighter">Requires Grid Infill</span>
                            </div>
                            <button
                              disabled={!syringeReady || globalPoreEnabled}
                              onClick={() => {
                                if (!syringeReady || globalPoreEnabled) return;
                                const current = zone.parameterOverride?.poreInjection;
                                handleUpdateZZone(zone.id, { 
                                  parameterOverride: { 
                                    ...zone.parameterOverride!, 
                                    poreInjection: current ? undefined : {
                                      enabled: true,
                                      mode: 'layer_by_layer',
                                      syringeToolhead: 'syringe',
                                      zStartMm: zone.zStartMm,
                                      zEndMm: zone.zEndMm,
                                      injectionDepthMm: 0.3,
                                      flowRateUlPerCell: 0.5,
                                      travelFeedrateMmMin: 6000,
                                      injectionFeedrateMmMin: 120,
                                      cellSizeToleranceMm: 0.1,
                                      minCellSizeMm: 0.5
                                    } 
                                  } 
                                });
                              }}
                              className={`relative w-8 h-4 rounded-full transition-all ${
                                zone.parameterOverride?.poreInjection?.enabled
                                  ? 'bg-cyan-500'
                                  : 'bg-slate-200 dark:bg-slate-700'
                              } ${(!syringeReady || globalPoreEnabled) ? 'opacity-40 cursor-not-allowed' : ''}`}
                              title={!syringeReady ? 'Assign a syringe toolhead in Machine Setup first' : globalPoreEnabled ? 'Disable whole scaffold pore injection first' : 'Toggle Pore Injection'}
                            >
                              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${
                                zone.parameterOverride?.poreInjection?.enabled ? 'right-0.5' : 'left-0.5'
                              }`} />
                            </button>
                          </div>

                          {zone.parameterOverride?.poreInjection?.enabled && (() => {
                            const activeModel = zone.modelScope === 'all' ? models[0] : models.find(m => m.id === zone.modelScope) || models[0];
                            const areaWidth = activeModel?.size ? activeModel.size.x * activeModel.transform.scale.x : 20;
                            const areaDepth = activeModel?.size ? activeModel.size.y * activeModel.transform.scale.y : 20;
                            const infillPercent = zone.parameterOverride.fdm?.infillPercent ?? globalSettings.infill ?? 15;
                            const fdmHead = toolheads.find(tool => tool.id === 'fdm');
                            const extrusionWidth = fdmHead?.id === 'fdm'
                              ? fdmHead.nozzleDiameter
                              : (globalSettings.nozzleDiameter ?? 0.4);
                            const zHeight = Math.max(0, zone.zEndMm - zone.zStartMm);
                            const analysis = analyzeGridInfill(areaWidth, areaDepth, zHeight, infillPercent, extrusionWidth);
                            const currentMode = zone.parameterOverride.poreInjection.mode || 'layer_by_layer';
                            const effectivePattern = getEffectiveInfillPattern(globalSettings, activeModel, zone);

                            return (
                            <div className="space-y-3 bg-cyan-50/30 dark:bg-cyan-900/10 p-2.5 rounded-lg border border-cyan-100 dark:border-cyan-800/30 animate-in fade-in slide-in-from-top-1">
                              
                              {/* Mode Selector Tabs */}
                              <div className="flex bg-cyan-100/50 dark:bg-cyan-950/50 p-1 rounded-md border border-cyan-200/50 dark:border-cyan-800/50">
                                <button
                                  onClick={() => handleUpdateZZone(zone.id, { 
                                    parameterOverride: { ...zone.parameterOverride!, poreInjection: { ...zone.parameterOverride!.poreInjection!, mode: 'layer_by_layer' } } 
                                  })}
                                  className={`flex-1 py-1 rounded transition-all text-[8px] font-black uppercase tracking-widest ${currentMode === 'layer_by_layer' ? 'bg-white dark:bg-cyan-600 text-cyan-700 dark:text-white shadow-sm border border-cyan-200 dark:border-cyan-500' : 'text-cyan-600/60 dark:text-cyan-400/60 hover:text-cyan-700 dark:hover:text-cyan-300'}`}
                                >
                                  Layer by Layer
                                </button>
                                <button
                                  onClick={() => handleUpdateZZone(zone.id, { 
                                    parameterOverride: { ...zone.parameterOverride!, poreInjection: { ...zone.parameterOverride!.poreInjection!, mode: 'multilayer' } } 
                                  })}
                                  className={`flex-1 py-1 rounded transition-all text-[8px] font-black uppercase tracking-widest ${currentMode === 'multilayer' ? 'bg-white dark:bg-cyan-600 text-cyan-700 dark:text-white shadow-sm border border-cyan-200 dark:border-cyan-500' : 'text-cyan-600/60 dark:text-cyan-400/60 hover:text-cyan-700 dark:hover:text-cyan-300'}`}
                                >
                                  Multilayer
                                </button>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <span className="text-[7px] text-slate-400 font-black uppercase">Toolhead</span>
                                  <select
                                    className="w-full h-6 rounded border border-slate-200 dark:border-slate-800 text-[9px] bg-white dark:bg-slate-900 font-bold outline-none px-1"
                                    value={zone.parameterOverride.poreInjection.syringeToolhead}
                                    onChange={e => handleUpdateZZone(zone.id, { 
                                      parameterOverride: { 
                                        ...zone.parameterOverride!, 
                                        poreInjection: { ...zone.parameterOverride!.poreInjection!, syringeToolhead: e.target.value as any } 
                                      } 
                                    })}
                                  >
                                    {toolheads.filter(t => t.id === 'syringe').map(t => (
                                      <option key={t.id} value={t.id}>{t.label || 'Syringe'}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[7px] text-slate-400 font-black uppercase">Inject Feedrate</span>
                                  <NumericInput
                                    value={zone.parameterOverride.poreInjection.injectionFeedrateMmMin}
                                    onChange={v => handleUpdateZZone(zone.id, { 
                                      parameterOverride: { 
                                        ...zone.parameterOverride!, 
                                        poreInjection: { ...zone.parameterOverride!.poreInjection!, injectionFeedrateMmMin: v } 
                                      } 
                                    })}
                                    className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                    step={10}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[7px] text-slate-400 font-black uppercase">Travel Feedrate</span>
                                  <NumericInput
                                    value={zone.parameterOverride.poreInjection.travelFeedrateMmMin}
                                    onChange={v => handleUpdateZZone(zone.id, {
                                      parameterOverride: {
                                        ...zone.parameterOverride!,
                                        poreInjection: { ...zone.parameterOverride!.poreInjection!, travelFeedrateMmMin: v }
                                      }
                                    })}
                                    className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                    step={100}
                                  />
                                </div>
                              </div>

                              {currentMode === 'layer_by_layer' ? (
                                <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <span className="text-[7px] text-slate-400 font-black uppercase">Flow/Pore (µL)</span>
                                    <NumericInput
                                      value={zone.parameterOverride.poreInjection.flowRateUlPerCell}
                                      onChange={v => handleUpdateZZone(zone.id, { 
                                        parameterOverride: { 
                                          ...zone.parameterOverride!, 
                                          poreInjection: { ...zone.parameterOverride!.poreInjection!, flowRateUlPerCell: v } 
                                        } 
                                      })}
                                      className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                      step={0.1}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[7px] text-slate-400 font-black uppercase">Depth (mm)</span>
                                    <NumericInput
                                      value={zone.parameterOverride.poreInjection.injectionDepthMm}
                                      onChange={v => handleUpdateZZone(zone.id, { 
                                        parameterOverride: { 
                                          ...zone.parameterOverride!, 
                                          poreInjection: { ...zone.parameterOverride!.poreInjection!, injectionDepthMm: v } 
                                        } 
                                      })}
                                      className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                      step={0.05}
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cyan-100 dark:border-cyan-800/40">
                                  <div className="space-y-1">
                                    <span className="text-[7px] text-slate-400 font-black uppercase">Cell Tolerance (mm)</span>
                                    <NumericInput
                                      value={zone.parameterOverride.poreInjection.cellSizeToleranceMm ?? 0.1}
                                      onChange={v => handleUpdateZZone(zone.id, {
                                        parameterOverride: {
                                          ...zone.parameterOverride!,
                                          poreInjection: { ...zone.parameterOverride!.poreInjection!, cellSizeToleranceMm: v }
                                        }
                                      })}
                                      className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                      step={0.05}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[7px] text-slate-400 font-black uppercase">Min Cell (mm)</span>
                                    <NumericInput
                                      value={zone.parameterOverride.poreInjection.minCellSizeMm ?? 0.5}
                                      onChange={v => handleUpdateZZone(zone.id, {
                                        parameterOverride: {
                                          ...zone.parameterOverride!,
                                          poreInjection: { ...zone.parameterOverride!.poreInjection!, minCellSizeMm: v }
                                        }
                                      })}
                                      className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                      step={0.1}
                                    />
                                  </div>
                                </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex justify-between items-end">
                                    <div className="space-y-1 flex-1 pr-2">
                                      <span className="text-[7px] text-slate-400 font-black uppercase flex justify-between">
                                        <span>Target Vol. (µL)</span>
                                        <span className="text-cyan-500">Max: {analysis.totalMaxVolumeUl.toFixed(1)}</span>
                                      </span>
                                      <NumericInput
                                        value={zone.parameterOverride.poreInjection.targetVolumeUl ?? (analysis.totalMaxVolumeUl * 0.5)}
                                        onChange={v => handleUpdateZZone(zone.id, { 
                                          parameterOverride: { 
                                            ...zone.parameterOverride!, 
                                            poreInjection: { ...zone.parameterOverride!.poreInjection!, targetVolumeUl: Math.min(v, analysis.totalMaxVolumeUl) } 
                                          } 
                                        })}
                                        className="h-6 text-[9px] bg-white dark:bg-slate-900 border-cyan-300 dark:border-cyan-700"
                                        step={1}
                                      />
                                    </div>
                                    <div className="flex flex-col items-end pb-1">
                                      <span className="text-[7px] text-slate-400 font-black uppercase">Est. Pores</span>
                                      <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">{analysis.estimatedCellCount}</span>
                                    </div>
                                  </div>
                                  <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                  <div
                                      className="h-full bg-cyan-500 transition-all duration-300"
                                      style={{ width: `${Math.min(100, ((zone.parameterOverride.poreInjection.targetVolumeUl || 0) / analysis.totalMaxVolumeUl) * 100)}%` }}
                                    />
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-cyan-100 dark:border-cyan-800/40">
                                    <div className="space-y-1">
                                      <span className="text-[7px] text-slate-400 font-black uppercase">Cell Tolerance (mm)</span>
                                      <NumericInput
                                        value={zone.parameterOverride.poreInjection.cellSizeToleranceMm ?? 0.1}
                                        onChange={v => handleUpdateZZone(zone.id, {
                                          parameterOverride: {
                                            ...zone.parameterOverride!,
                                            poreInjection: { ...zone.parameterOverride!.poreInjection!, cellSizeToleranceMm: v }
                                          }
                                        })}
                                        className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                        step={0.05}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[7px] text-slate-400 font-black uppercase">Min Cell (mm)</span>
                                      <NumericInput
                                        value={zone.parameterOverride.poreInjection.minCellSizeMm ?? 0.5}
                                        onChange={v => handleUpdateZZone(zone.id, {
                                          parameterOverride: {
                                            ...zone.parameterOverride!,
                                            poreInjection: { ...zone.parameterOverride!.poreInjection!, minCellSizeMm: v }
                                          }
                                        })}
                                        className="h-6 text-[9px] bg-white dark:bg-slate-900"
                                        step={0.1}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

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

                        <div className="grid grid-cols-2 gap-2">
                           <div className="space-y-1">
                              <span className="text-[7px] text-slate-400 font-black uppercase">Mode</span>
                              <select 
                                className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1.5 font-bold"
                                value={zone.processEvent.mode || 'stationary'}
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
