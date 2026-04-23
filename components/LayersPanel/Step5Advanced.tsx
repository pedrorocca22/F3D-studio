import React, { useState } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { ZZone, ModelData, ToolheadConfig, GlobalSettings, INFILL_PATTERN_LABELS, InfillPattern } from '../../types';
import { generateUUID } from '../../utils';
import { ToolheadSelect, SCAFFOLD_FEATURE_META, DEFAULT_SCAFFOLD_TOOLS } from '../ToolheadPanel/ToolheadPanel';

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

      {/* ─── Pore Injection System ─────────────────────────────── */}
      <div className="mt-8 mx-1 border border-cyan-200 dark:border-cyan-800/50 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-cyan-50 dark:bg-cyan-900/20 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Icon name="vaccines" className="text-cyan-600 dark:text-cyan-400 text-sm" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-700 dark:text-cyan-300">
                Pore Injection
              </span>
              <p className="text-[8px] text-cyan-500 dark:text-cyan-500 font-medium">
                Post-print bio-material injection into infill pores
              </p>
            </div>
          </div>
          {/* Enable toggle */}
          <button
            onClick={() => {
              const current = globalSettings.poreInjection;
              onUpdateGlobalSettings({
                ...globalSettings,
                poreInjection: {
                  syringeToolhead: 'syringe',
                  zStartMm: 0,
                  zEndMm: 5,
                  injectionDepthMm: 0.3,
                  flowRateUlPerCell: 0.5,
                  travelFeedrateMmMin: 6000,
                  injectionFeedrateMmMin: 120,
                  ...(current || {}),
                  enabled: !(current?.enabled),
                }
              });
            }}
            className={`relative w-10 h-5 rounded-full transition-all ${
              globalSettings.poreInjection?.enabled
                ? 'bg-cyan-500'
                : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
              globalSettings.poreInjection?.enabled ? 'right-0.5' : 'left-0.5'
            }`} />
          </button>
        </div>

        {globalSettings.poreInjection?.enabled && (
          <div className="p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200 bg-white dark:bg-slate-900/40">

            {/* Infill pattern warning */}
            {(!globalSettings.infillPattern || globalSettings.infillPattern !== 'rectilinear') && (
              <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 p-2.5 rounded-lg flex items-start gap-2 text-[10px] border border-amber-200 dark:border-amber-800/50">
                <Icon name="warning" className="text-[13px] mt-0.5 flex-shrink-0" />
                <span>
                  Set global infill to <strong>Rectilinear</strong> (Step 4 → Settings) for correct pore detection.
                </span>
              </div>
            )}

            {/* Syringe toolhead selector */}
            {(() => {
              const syringes = toolheads.filter(t => t.id === 'syringe' && t.slot !== undefined);
              return (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                    <Icon name="medical_services" className="text-[10px] text-cyan-500" />
                    Syringe Toolhead
                  </span>
                  {syringes.length === 0 ? (
                    <div className="text-[9px] text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg p-2 flex items-center gap-1.5">
                      <Icon name="error_outline" className="text-[11px]" />
                      No syringe toolhead installed — configure one in Step 1 (Environment).
                    </div>
                  ) : (
                    <select
                      className="w-full h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold px-2 outline-none focus:ring-1 focus:ring-cyan-400"
                      value={globalSettings.poreInjection.syringeToolhead}
                      onChange={e => onUpdateGlobalSettings({
                        ...globalSettings,
                        poreInjection: { ...globalSettings.poreInjection!, syringeToolhead: e.target.value as any }
                      })}
                    >
                      {syringes.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.label || 'Syringe'} {t.slot !== undefined ? `(Slot ${t.slot + 1})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })()}

            {/* Z Range */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Icon name="height" className="text-[10px] text-cyan-500" />
                Injection Layer Range
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Z Start (mm)</span>
                  <NumericInput
                    value={globalSettings.poreInjection.zStartMm}
                    onChange={v => onUpdateGlobalSettings({ ...globalSettings, poreInjection: { ...globalSettings.poreInjection!, zStartMm: v } })}
                    className="h-8 text-xs"
                    step={0.1}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Z End (mm)</span>
                  <NumericInput
                    value={globalSettings.poreInjection.zEndMm}
                    onChange={v => onUpdateGlobalSettings({ ...globalSettings, poreInjection: { ...globalSettings.poreInjection!, zEndMm: v } })}
                    className="h-8 text-xs"
                    step={0.1}
                  />
                </div>
              </div>
              <p className="text-[8px] text-cyan-500 font-medium">
                ↳ Range visible as a Z-volume guide in the 3D viewport
              </p>
            </div>

            {/* Injection Physics */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Icon name="science" className="text-[10px] text-cyan-500" />
                Injection Parameters
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Flow/Pore (µL)</span>
                  <NumericInput
                    value={globalSettings.poreInjection.flowRateUlPerCell}
                    onChange={v => onUpdateGlobalSettings({ ...globalSettings, poreInjection: { ...globalSettings.poreInjection!, flowRateUlPerCell: v } })}
                    className="h-7 text-xs"
                    step={0.1}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Needle Depth (mm)</span>
                  <NumericInput
                    value={globalSettings.poreInjection.injectionDepthMm}
                    onChange={v => onUpdateGlobalSettings({ ...globalSettings, poreInjection: { ...globalSettings.poreInjection!, injectionDepthMm: v } })}
                    className="h-7 text-xs"
                    step={0.05}
                  />
                </div>
              </div>
            </div>

            {/* Feedrates */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Icon name="speed" className="text-[10px] text-cyan-500" />
                Feedrates
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Travel (mm/min)</span>
                  <NumericInput
                    value={globalSettings.poreInjection.travelFeedrateMmMin}
                    onChange={v => onUpdateGlobalSettings({ ...globalSettings, poreInjection: { ...globalSettings.poreInjection!, travelFeedrateMmMin: v } })}
                    className="h-7 text-xs"
                    step={100}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] text-slate-400 font-bold uppercase">Inject (mm/min)</span>
                  <NumericInput
                    value={globalSettings.poreInjection.injectionFeedrateMmMin}
                    onChange={v => onUpdateGlobalSettings({ ...globalSettings, poreInjection: { ...globalSettings.poreInjection!, injectionFeedrateMmMin: v } })}
                    className="h-7 text-xs"
                    step={10}
                  />
                </div>
              </div>
            </div>

            {/* Pore Detection - Automatic */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Icon name="auto_awesome" className="text-[10px] text-cyan-500" />
                Post-Slice Detection
              </span>
              <div className="bg-cyan-50/50 dark:bg-cyan-900/10 border border-cyan-100 dark:border-cyan-800/30 p-2 rounded-lg flex items-center gap-2">
                <Icon name="memory" className="text-cyan-500 text-[14px]" />
                <p className="text-[9px] text-cyan-700 dark:text-cyan-300 leading-tight">
                  <strong className="font-black">G-Code Analysis:</strong> Precise pore sites are calculated during the final slicing job. The system analyzes the actual infill toolpaths to inject exclusively into fully enclosed cells. Results are shown in the viewport after the slice is complete.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
