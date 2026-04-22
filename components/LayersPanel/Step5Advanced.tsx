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
}

export const Step5Advanced: React.FC<Step5AdvancedProps> = ({
  zZones,
  onUpdateZZones,
  models,
  toolheads,
  globalSettings,
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

  return (
    <div className="space-y-3 overflow-y-auto max-h-full pb-20 animate-in fade-in slide-in-from-left-1">
      <AccordionSection 
        title={
          <div className="flex items-center justify-between w-full pr-2">
            <div className="flex items-center gap-2">
              <Icon name="straighten" className="text-primary text-xs" />
              <span className="text-[10px] uppercase font-black tracking-widest">Height Zones</span>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); handleAddZZone(); }}
              className="text-[8px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 hover:bg-primary/20 transition-colors font-black uppercase tracking-widest"
            >
              + ADD
            </button>
          </div>
        } 
        isOpen={openSections.zZones} 
        onToggle={() => toggleSection('zZones')}
      >
        <div className="space-y-4 py-2 px-1">
          {zZones.length === 0 && (
            <div className="text-center py-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
              <p className="text-[10px] text-slate-400 uppercase font-black mb-1">No height zones</p>
              <button 
                onClick={() => handleAddZZone()}
                className="text-[10px] text-primary font-black hover:underline"
              >
                CREATE FIRST ZONE
              </button>
            </div>
          )}
          {zZones.sort((a,b) => a.zStartMm - b.zStartMm).map((zone, idx) => (
            <div key={zone.id} className="mb-2 last:mb-0">
              <div className="bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                    <select 
                      className="text-[8px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none font-black text-primary uppercase tracking-tighter max-w-[80px] truncate"
                      value={zone.modelScope}
                      onChange={e => handleUpdateZZone(zone.id, { modelScope: e.target.value })}
                    >
                       <option value="all">Global</option>
                       {models.map(m => (
                         <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>
                       ))}
                    </select>
                    <input 
                      className="text-[10px] font-bold uppercase bg-transparent outline-none w-full truncate text-slate-700 dark:text-slate-300 ml-1"
                      value={zone.label}
                      onChange={e => handleUpdateZZone(zone.id, { label: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                     <button onClick={() => handleDeleteZZone(zone.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                       <Icon name="delete" className="text-xs" />
                     </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest font-mono">Start (mm)</span>
                    <NumericInput 
                      value={zone.zStartMm} 
                      onChange={v => handleUpdateZZone(zone.id, { zStartMm: v })}
                      className="h-7 text-[10px] font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest font-mono">End (mm)</span>
                    <NumericInput 
                      value={zone.zEndMm} 
                      onChange={v => handleUpdateZZone(zone.id, { zEndMm: v })}
                      className="h-7 text-[10px] font-mono"
                    />
                  </div>
                </div>

                {/* Section Toggle Pills */}
                <div className="pt-1 flex gap-2">
                   <button 
                     onClick={() => handleUpdateZZone(zone.id, { featureOverride: zone.featureOverride ? undefined : { toolhead: 'fdm', targetFeatures: ['all'] } })}
                     className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.featureOverride ? 'bg-teal-500 border-teal-500 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                   >
                     Tool
                   </button>
                   <button 
                     onClick={() => handleUpdateZZone(zone.id, { parameterOverride: zone.parameterOverride ? undefined : { fdm: {} } })}
                     className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.parameterOverride ? 'bg-violet-500 border-violet-500 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                   >
                     Params
                   </button>
                   <button 
                     onClick={() => handleUpdateZZone(zone.id, { processEvent: zone.processEvent ? undefined : { uvExposureTimeSec: 5, doseTargetMjCm2: 50, pausePrint: false } })}
                     className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.processEvent ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                   >
                     Event
                   </button>
                </div>
                
                {/* Detail Overrides */}
                {(zone.featureOverride || zone.parameterOverride || zone.processEvent) && (
                   <div className="mt-1 space-y-2">

                      {/* TOOL SECTION */}
                      {zone.featureOverride && (
                        <div className="rounded-lg border border-teal-200 dark:border-teal-900/60 overflow-hidden">
                          <div className="flex items-center justify-between px-2.5 py-1.5 bg-teal-50 dark:bg-teal-900/20">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                              <span className="text-[8px] text-teal-700 dark:text-teal-400 uppercase font-black tracking-widest">Tool Override</span>
                            </div>
                            <button 
                              onClick={() => {
                                const isScaffold = !!zone.featureOverride?.scaffoldTools;
                                if (isScaffold) {
                                  handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, scaffoldTools: undefined } });
                                } else {
                                  handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, scaffoldTools: DEFAULT_SCAFFOLD_TOOLS } });
                                }
                              }}
                              className={`text-[8px] px-1.5 py-0.5 rounded border font-black uppercase tracking-tighter ${!!zone.featureOverride.scaffoldTools ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-teal-600 border-teal-300 dark:bg-transparent'}`}
                            >
                              {!!zone.featureOverride.scaffoldTools ? 'SCAFFOLD_ON' : 'SINGLE_HEAD'}
                            </button>
                          </div>
                          <div className="p-2.5">
                            {!zone.featureOverride.scaffoldTools ? (
                              <ToolheadSelect 
                                className="w-full h-8 text-[10px]"
                                value={zone.featureOverride.toolhead || 'fdm'}
                                onChange={v => handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, toolhead: v } })}
                                toolheads={toolheads}
                              />
                            ) : (
                              <div className="space-y-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-800">
                                {SCAFFOLD_FEATURE_META.map(feat => (
                                   <div key={feat.key} className="flex items-center justify-between gap-2">
                                      <span className="text-[8px] text-slate-500 font-bold uppercase truncate">{feat.label}</span>
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
                                        className="w-20"
                                        toolheads={toolheads}
                                      />
                                   </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* PARAMETERS SECTION */}
                      {zone.parameterOverride && (
                        <div className="rounded-lg border border-violet-200 dark:border-violet-900/60 overflow-hidden">
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 dark:bg-violet-900/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                            <span className="text-[8px] text-violet-700 dark:text-violet-400 uppercase font-black tracking-widest">Parameter Override</span>
                          </div>
                          <div className="p-2.5 space-y-2.5">
                            <div className="grid grid-cols-2 gap-3">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Layer Height (µm)</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.layerHeightMm ? (zone.parameterOverride.fdm.layerHeightMm * 1000) : (globalSettings.layerHeight || 200)}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), layerHeightMm: v / 1000 } } })}
                                    className="h-7 text-[10px]"
                                    step={10}
                                  />
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Infill %</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.infillPercent ?? 15}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPercent: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                            </div>
                            <div className="grid grid-cols-1">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Pattern</span>
                                  <select 
                                    className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-slate-50 dark:bg-slate-900 outline-none px-1 font-bold"
                                    value={zone.parameterOverride.fdm?.infillPattern || 'grid'}
                                    onChange={e => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPattern: e.target.value as any } } })}
                                  >
                                     {(Object.entries(INFILL_PATTERN_LABELS) as [InfillPattern, string][]).map(([val, label]) => (
                                       <option key={val} value={val}>{label}</option>
                                     ))}
                                  </select>
                               </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none">Walls</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.wallCount ?? 3}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), wallCount: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none">Top L.</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.topSolidLayers ?? 3}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), topSolidLayers: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none">Bot L.</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.bottomSolidLayers ?? 3}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), bottomSolidLayers: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Perim. Spd (mm/s)</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.perimeterSpeedMmS ?? (globalSettings.perimeterSpeed || 45)}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), perimeterSpeedMmS: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Ext. Spd (mm/s)</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.externalPerimeterSpeedMmS ?? (globalSettings.externalPerimeterSpeed || 25)}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), externalPerimeterSpeedMmS: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                            </div>                             <div className="grid grid-cols-2 gap-3">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Infill Spd (mm/s)</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.infillSpeedMmS ?? (globalSettings.infillSpeed || 80)}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillSpeedMmS: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Travel Spd (mm/s)</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.travelSpeedMmS ?? (globalSettings.travelSpeed || 130)}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), travelSpeedMmS: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                            </div>
                            <div className="grid grid-cols-1 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none">Layer Fan (%)</span>
                                  <NumericInput 
                                    value={zone.parameterOverride.fdm?.fanSpeedPercent ?? (globalSettings.minFanSpeed || 100)}
                                    onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), fanSpeedPercent: v } } })}
                                    className="h-7 text-[10px]"
                                  />
                               </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* EVENT SECTION */}
                      {zone.processEvent && (
                        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 overflow-hidden">
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            <span className="text-[8px] text-amber-700 dark:text-amber-400 uppercase font-black tracking-widest">UV Process Event</span>
                          </div>
                          <div className="p-2.5 space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-400 uppercase font-black">Mode</span>
                                  <select 
                                    className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1 font-bold"
                                    value={zone.processEvent.mode || 'stationary'}
                                    onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, mode: e.target.value as any } })}
                                  >
                                     <option value="stationary">Stationary</option>
                                     <option value="sweep">Sweep (Pattern)</option>
                                  </select>
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-400 uppercase font-black">Pattern</span>
                                  <select 
                                    disabled={zone.processEvent.mode !== 'sweep'}
                                    className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1 font-bold disabled:opacity-30"
                                    value={zone.processEvent.pattern || 'zigzag'}
                                    onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, pattern: e.target.value as any } })}
                                  >
                                     <option value="zigzag">Zigzag</option>
                                     <option value="concentric">Concentric</option>
                                     <option value="infill_mimic">Infill Mimic</option>
                                  </select>
                               </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-400 uppercase font-black">Power (%)</span>
                                  <NumericInput 
                                    value={zone.processEvent.powerPercentage ?? 100}
                                    onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, powerPercentage: v } })}
                                    className="h-7 text-[10px] font-mono"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-400 uppercase font-black">Scan Speed (mm/s)</span>
                                  <NumericInput 
                                    disabled={zone.processEvent.mode !== 'sweep'}
                                    value={zone.processEvent.scanSpeedMmS ?? 20}
                                    onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, scanSpeedMmS: v } })}
                                    className="h-7 text-[10px] font-mono"
                                  />
                               </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-400 uppercase font-black">Spacing (mm)</span>
                                  <NumericInput 
                                    disabled={zone.processEvent.mode !== 'sweep'}
                                    value={zone.processEvent.lineSpacingMm ?? 1.0}
                                    onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, lineSpacingMm: v } })}
                                    className="h-7 text-[10px] font-mono"
                                    step={0.1}
                                  />
                               </div>
                               <div className="space-y-1">
                                  <span className="text-[8px] text-slate-400 uppercase font-black">Z-Hop (mm)</span>
                                  <NumericInput 
                                    value={zone.processEvent.zOffsetMm ?? 2.0}
                                    onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, zOffsetMm: v } })}
                                    className="h-7 text-[10px] font-mono"
                                    step={0.1}
                                  />
                               </div>
                            </div>
                            <div className="space-y-1 mt-1">
                               <span className="text-[8px] text-slate-400 uppercase font-black">Trigger Mode</span>
                               <select 
                                 className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1 font-bold"
                                 value={zone.processEvent.trigger || 'after_layer'}
                                 onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, trigger: e.target.value as any } })}
                               >
                                  <option value="after_layer">After each layer</option>
                                  <option value="after_segment">After entire zone</option>
                               </select>
                            </div>
                          </div>
                        </div>
                      )}
                   </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </AccordionSection>
    </div>
  );
};
