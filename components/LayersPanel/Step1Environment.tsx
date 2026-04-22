import React, { useState } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { GlobalSettings, ToolheadConfig } from '../../types';
import { HelpTopic } from '../HelpWiki/HelpWiki';
import { useProjectContext } from '../../contexts/ProjectContext';

interface Step1EnvironmentProps {
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  toolheads: ToolheadConfig[];
  onUpdateToolheads: (toolheads: ToolheadConfig[]) => void;
  onOpenHelp: (topic: HelpTopic) => void;
}

export const Step1Environment: React.FC<Step1EnvironmentProps> = ({
  globalSettings,
  onUpdateGlobalSettings,
  toolheads,
  onUpdateToolheads,
  onOpenHelp,
}) => {
  const { project } = useProjectContext();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    printBed: true,
    heatingBed: false,
    toolheads: false,
  });

  const [toolheadSettingsOpen, setToolheadSettingsOpen] = useState<string | null>(null);

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Machine Setup</span>
        <button
          onClick={() => onOpenHelp('hardware_mapping')}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-primary"
          title="Hardware Wiki"
        >
          <Icon name="help_outline" className="text-sm" />
        </button>
      </div>

      <AccordionSection title="Surface Configuration" isOpen={openSections.printBed} onToggle={() => toggleSection('printBed')}>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] text-slate-400 uppercase font-bold">Bed Type</label>
            <div className="grid grid-cols-1 gap-2">
              {/* Glass Bed */}
              <button
                onClick={() => onUpdateGlobalSettings({
                  ...globalSettings,
                  printBed: { type: 'glass_bed', dimensions: { width: 100, height: 100 } }
                })}
                className={`w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-all duration-200 ${
                  globalSettings.printBed?.type === 'glass_bed'
                    ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  globalSettings.printBed?.type === 'glass_bed'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  <Icon name="crop_square" className="text-sm" />
                </div>
                <div className="min-w-0">
                  <span className={`block text-[11px] font-bold transition-colors ${
                    globalSettings.printBed?.type === 'glass_bed' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                  }`}>Glass Bed</span>
                  <span className="block text-[9px] text-slate-400 font- medium mt-0.5">Standard flat surface · Custom dimensions</span>
                </div>
                {globalSettings.printBed?.type === 'glass_bed' && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>

              {/* Petri Dish */}
              <button
                onClick={() => onUpdateGlobalSettings({
                  ...globalSettings,
                  printBed: { type: 'petri_dish', petriDiameter: 60 }
                })}
                className={`w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-all duration-200 ${
                  globalSettings.printBed?.type === 'petri_dish'
                    ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  globalSettings.printBed?.type === 'petri_dish'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  <Icon name="circle" className="text-sm" />
                </div>
                <div className="min-w-0">
                  <span className={`block text-[11px] font-bold transition-colors ${
                    globalSettings.printBed?.type === 'petri_dish' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                  }`}>Petri Dish</span>
                  <span className="block text-[9px] text-slate-400 font-medium mt-0.5">Circular · 35 / 60 / 90 mm diameter</span>
                </div>
                {globalSettings.printBed?.type === 'petri_dish' && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>

              {/* Multiwell Plate */}
              <button
                onClick={() => onUpdateGlobalSettings({
                  ...globalSettings,
                  printBed: { type: 'multiwell_plate', multiwellFormat: 12 }
                })}
                className={`w-full p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-all duration-200 ${
                  globalSettings.printBed?.type === 'multiwell_plate'
                    ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                  globalSettings.printBed?.type === 'multiwell_plate'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  <Icon name="apps" className="text-sm" />
                </div>
                <div className="min-w-0">
                  <span className={`block text-[11px] font-bold transition-colors ${
                    globalSettings.printBed?.type === 'multiwell_plate' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                  }`}>Multiwell Plate</span>
                  <span className="block text-[9px] text-slate-400 font-medium mt-0.5">SBS format · 6 / 12 / 24 / 48 wells</span>
                </div>
                {globalSettings.printBed?.type === 'multiwell_plate' && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            </div>
          </div>

          {/* Glass Bed Options */}
          {globalSettings.printBed?.type === 'glass_bed' && (
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in slide-in-from-top-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold block">Bed Dimensions (mm)</label>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-medium">Width (X)</span>
                  <NumericInput
                    value={globalSettings.printBed.dimensions?.width || 100}
                    onChange={v => onUpdateGlobalSettings({
                      ...globalSettings,
                      printBed: { ...globalSettings.printBed, dimensions: { ...(globalSettings.printBed.dimensions || { width: 100, height: 100 }), width: v } }
                    })}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <span className="text-[9px] text-slate-500 uppercase font-medium">Depth (Y)</span>
                  <NumericInput
                    value={globalSettings.printBed.dimensions?.height || 100}
                    onChange={v => onUpdateGlobalSettings({
                      ...globalSettings,
                      printBed: { ...globalSettings.printBed, dimensions: { ...(globalSettings.printBed.dimensions || { width: 100, height: 100 }), height: v } }
                    })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Petri Dish Options */}
          {globalSettings.printBed?.type === 'petri_dish' && (
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-2 animate-in fade-in slide-in-from-top-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold block">Dish Diameter</label>
              <div className="flex gap-2">
                {[35, 60, 90].map(size => (
                  <button
                    key={size}
                    onClick={() => onUpdateGlobalSettings({
                      ...globalSettings,
                      printBed: { ...globalSettings.printBed, petriDiameter: size as any }
                    })}
                    className={`flex-1 py-1 px-2 rounded border text-xs font-bold transition-all ${
                      globalSettings.printBed?.petriDiameter === size
                        ? 'bg-action text-white border-action shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {size}mm
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Multiwell Options */}
          {globalSettings.printBed?.type === 'multiwell_plate' && (
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 space-y-2 animate-in fade-in slide-in-from-top-1">
              <label className="text-[10px] text-slate-400 uppercase font-bold block">Plate Format</label>
              <div className="flex gap-2">
                {[6, 12, 24, 48].map(format => (
                  <button
                    key={format}
                    onClick={() => onUpdateGlobalSettings({
                      ...globalSettings,
                      printBed: { ...globalSettings.printBed, multiwellFormat: format as any }
                    })}
                    className={`flex-1 py-1 px-2 rounded border text-xs font-bold transition-all ${
                      globalSettings.printBed?.multiwellFormat === format
                        ? 'bg-action text-white border-action shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {format} Wells
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccordionSection>

      <AccordionSection title="Heating Bed" isOpen={openSections.heatingBed} onToggle={() => toggleSection('heatingBed')}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">Enable Bed Heating</span>
            <button
              onClick={() => onUpdateGlobalSettings({
                ...globalSettings,
                bedHeatingEnabled: !globalSettings.bedHeatingEnabled
              })}
              className={`w-10 h-5 rounded-full relative transition-all ${globalSettings.bedHeatingEnabled ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${globalSettings.bedHeatingEnabled ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <span className="text-[10px] text-slate-500 font-medium">Temperature (°C):</span>
            <NumericInput className="w-full" value={globalSettings.bedTemperature ?? 60} onChange={v => onUpdateGlobalSettings({ ...globalSettings, bedTemperature: v })} step={0.5} />
          </div>

          <div className="text-[8px] text-slate-400 italic">
            {globalSettings.bedHeatingEnabled
              ? "Bed heating will be applied during print execution"
              : "Bed heating disabled - no temperature command will be sent"}
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Toolhead" isOpen={openSections.toolheads} onToggle={() => toggleSection('toolheads')}>
        <div className="space-y-3">
          <p className="text-[9px] text-slate-400 mb-2">Assign up to 3 tools to available slots</p>

          {[0, 1, 2].map(slotIndex => {
            const assignedTool = toolheads.find(t => t.slot === slotIndex);
            const availableTools = toolheads.filter(t => !t.slot || t.slot === slotIndex);

            return (
              <div key={slotIndex} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex-shrink-0">Slot {slotIndex + 1}</span>

                  <select
                    value={assignedTool?.id || ''}
                    onChange={e => {
                      const toolId = e.target.value;
                      if (toolId) {
                        const toolToAssign = toolheads.find(t => t.id === toolId);
                        if (toolToAssign) {
                          onUpdateToolheads(toolheads.map(t => {
                            if (t.id === toolId) return { ...t, slot: slotIndex };
                            return t;
                          }));
                        }
                      }
                    }}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[9px] font-bold uppercase outline-none focus:ring-1 focus:ring-primary min-w-0"
                  >
                    <option value="">-- Empty --</option>
                    {toolheads.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.id === 'fdm' ? 'FDM HEAD' : t.id === 'syringe' ? 'HYDROGEL HEAD' : 'UV HEAD'}
                      </option>
                    ))}
                  </select>

                  {assignedTool && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setToolheadSettingsOpen(toolheadSettingsOpen === assignedTool.id ? null : assignedTool.id)}
                        className={`p-1 rounded transition-colors ${toolheadSettingsOpen === assignedTool.id ? 'bg-primary/10 text-primary' : 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400'}`}
                        title="Settings"
                      >
                        <Icon name="settings" className="text-[14px]" />
                      </button>
                      <button
                        onClick={() => onUpdateToolheads(toolheads.map(t => t.id === assignedTool.id ? { ...t, slot: undefined } : t))}
                        className="p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:dark:bg-red-900/30 rounded transition-colors"
                        title="Remove Tool"
                      >
                        <Icon name="close" className="text-[14px]" />
                      </button>
                    </div>
                  )}
                </div>

                {assignedTool && toolheadSettingsOpen === assignedTool.id && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-1 duration-200 space-y-3">
                    {/* Material Assignment (Hidden for UV) */}
                    {assignedTool.id !== 'uv' && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                          <Icon name="science" className="text-[11px]" /> Assigned Material
                        </label>
                        <select
                          value={project.selectedMaterials[assignedTool.id] || ''}
                          onChange={e => project.applyMaterialToToolhead(assignedTool.id, e.target.value)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-[10px] font-bold uppercase transition-all focus:border-emerald-500 outline-none"
                        >
                          <option value="">-- Select Material --</option>
                          {project.userMaterials
                            .filter(m => {
                              if (assignedTool.id === 'fdm') return m.category === 'thermoplastic';
                              if (assignedTool.id === 'syringe') return m.category === 'hydrogel' || m.category === 'bio-ink' || m.category === 'support';
                              return true;
                            })
                            .map(mat => (
                              <option key={mat.id} value={mat.id}>{mat.name}</option>
                            ))
                          }
                        </select>
                        <p className="text-[8px] text-slate-400 italic">Parameters will sync with toolhead settings</p>
                      </div>
                    )}

                    <div>
                      {assignedTool.id === 'fdm' && (
                        <div className="space-y-2">
                           {/* ... existing FDM settings ... */}
                           <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Nozzle (mm)</label>
                              <NumericInput value={assignedTool.nozzleDiameter ?? 0.4} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, nozzleDiameter: v } : t))} step={0.05} />
                            </div>
                            <div>
                               <label className="text-[8px] text-slate-400 uppercase block">Temp (°C)</label>
                               <NumericInput 
                                 value={assignedTool.defaultTemperature ?? 210} 
                                 onChange={v => {
                                   onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, defaultTemperature: v } : t));
                                   onUpdateGlobalSettings({ ...globalSettings, nozzleTemperature: v });
                                 }} 
                                 step={5} 
                               />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Flowrate (%)</label>
                              <NumericInput value={assignedTool.flowratePercent ?? 100} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, flowratePercent: v } : t))} step={5} />
                            </div>
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Retract Speed</label>
                              <NumericInput value={assignedTool.retractionSpeed || 25} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, retractionSpeed: v } : t))} step={5} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Retract Dist (mm)</label>
                              <NumericInput value={assignedTool.retractDistance || 5} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, retractDistance: v } : t))} step={0.5} />
                            </div>
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Lift Z (mm)</label>
                              <NumericInput value={assignedTool.zLiftDistance || 0.4} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, zLiftDistance: v } : t))} step={0.1} />
                            </div>
                          </div>
                        </div>
                      )}
                      {assignedTool.id === 'syringe' && (
                        <div className="space-y-2">
                           {/* ... existing Syringe settings ... */}
                           <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Needle (mm)</label>
                              <NumericInput value={assignedTool.nozzleDiameterMm || 0.5} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'syringe' ? { ...t, nozzleDiameterMm: v } : t))} step={0.01} />
                            </div>
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Syringe (mL)</label>
                              <NumericInput value={assignedTool.syringeVolumeMl || 5} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'syringe' ? { ...t, syringeVolumeMl: v } : t))} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Flowrate (mm/s)</label>
                              <NumericInput value={assignedTool.flowrateMmPerSec || 2} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'syringe' ? { ...t, flowrateMmPerSec: v } : t))} step={0.5} />
                            </div>
                            <div>
                              <label className="text-[8px] text-slate-400 uppercase block">Retract (mm)</label>
                              <NumericInput value={assignedTool.retractDistance || 1} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'syringe' ? { ...t, retractDistance: v } : t))} step={0.5} />
                            </div>
                          </div>
                        </div>
                      )}
                      {assignedTool.id === 'uv' && (
                        <div className="space-y-3">
                           <div className="space-y-1.5">
                              <label className="text-[8px] text-slate-400 uppercase font-black block">UV Wavelength</label>
                              <div className="flex gap-1.5">
                                {[365, 385, 405].map(wl => (
                                  <button
                                    key={wl}
                                    onClick={() => onUpdateToolheads(toolheads.map(t => t.id === 'uv' ? { ...t, wavelengthNm: wl as any } : t))}
                                    className={`flex-1 py-1 px-1.5 rounded-lg border text-[9px] font-black transition-all ${
                                      assignedTool.wavelengthNm === wl 
                                        ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-500/20' 
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
                                    }`}
                                  >
                                    {wl}nm
                                  </button>
                                ))}
                              </div>
                           </div>
                           <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[8px] text-slate-400 uppercase font-black block">Max Power (mW)</label>
                                <NumericInput value={assignedTool.maxPowerMw || 1000} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'uv' ? { ...t, maxPowerMw: v } : t))} />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[8px] text-slate-400 uppercase font-black block">Default Dose</label>
                                <NumericInput value={assignedTool.defaultDose || 50} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'uv' ? { ...t, defaultDose: v } : t))} />
                              </div>
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AccordionSection>
    </div>
  );
};
