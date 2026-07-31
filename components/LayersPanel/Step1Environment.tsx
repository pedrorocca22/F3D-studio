import React, { useState } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { GlobalSettings, ToolheadConfig, ToolheadType } from '../../types';
import { HelpTopic } from '../HelpWiki/HelpWiki';
import { InfoTooltip } from '../InfoTooltip';
import { createToolhead, getToolheadType } from '../../utils/toolheads';

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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    printBed: true,
    heatingBed: false,
    toolheads: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Machine Setup</span>
        <button
          onClick={() => onOpenHelp('surface_configuration')}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-primary"
          title="Hardware Wiki"
        >
          <Icon name="help_outline" className="text-sm" />
        </button>
      </div>

      <AccordionSection title="Surface Configuration" helpTopic="surface_configuration" isOpen={openSections.printBed} onToggle={() => toggleSection('printBed')}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[9px] text-slate-400 uppercase font-bold">Bed Type</label>
            <div className="grid grid-cols-1 gap-1.5">
              {/* Glass Bed */}
              <button
                onClick={() => onUpdateGlobalSettings({
                  ...globalSettings,
                  printBed: { type: 'glass_bed', dimensions: { width: 100, height: 100 } }
                })}
                className={`w-full p-2 rounded-lg border-2 text-left flex items-center gap-2.5 transition-all duration-200 ${
                  globalSettings.printBed?.type === 'glass_bed'
                    ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                  globalSettings.printBed?.type === 'glass_bed'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  <Icon name="crop_square" className="text-xs" />
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold transition-colors ${
                    globalSettings.printBed?.type === 'glass_bed' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                  }`}>Glass Bed</span>
                  <span className="text-[8px] text-slate-400 font-medium truncate">Standard flat surface</span>
                </div>
                {globalSettings.printBed?.type === 'glass_bed' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>

              {/* Petri Dish */}
              <button
                onClick={() => onUpdateGlobalSettings({
                  ...globalSettings,
                  printBed: { type: 'petri_dish', petriDiameter: 60 }
                })}
                className={`w-full p-2 rounded-lg border-2 text-left flex items-center gap-2.5 transition-all duration-200 ${
                  globalSettings.printBed?.type === 'petri_dish'
                    ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                  globalSettings.printBed?.type === 'petri_dish'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  <Icon name="circle" className="text-xs" />
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold transition-colors ${
                    globalSettings.printBed?.type === 'petri_dish' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                  }`}>Petri Dish</span>
                  <span className="text-[8px] text-slate-400 font-medium truncate">Circular · 35/60/90mm</span>
                </div>
                {globalSettings.printBed?.type === 'petri_dish' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>

              {/* Multiwell Plate */}
              <button
                onClick={() => onUpdateGlobalSettings({
                  ...globalSettings,
                  printBed: { type: 'multiwell_plate', multiwellFormat: 12 }
                })}
                className={`w-full p-2 rounded-lg border-2 text-left flex items-center gap-2.5 transition-all duration-200 ${
                  globalSettings.printBed?.type === 'multiwell_plate'
                    ? 'border-primary bg-primary/8 shadow-sm shadow-primary/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-primary/40 hover:bg-primary/5'
                }`}
              >
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                  globalSettings.printBed?.type === 'multiwell_plate'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                }`}>
                  <Icon name="apps" className="text-xs" />
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-bold transition-colors ${
                    globalSettings.printBed?.type === 'multiwell_plate' ? 'text-primary' : 'text-slate-700 dark:text-slate-200'
                  }`}>Multiwell Plate</span>
                  <span className="text-[8px] text-slate-400 font-medium truncate">6 / 12 / 24 / 48 wells</span>
                </div>
                {globalSettings.printBed?.type === 'multiwell_plate' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
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

      <AccordionSection title="Heating Bed" helpTopic="heating_bed" helpLabel="Help: heating bed" isOpen={openSections.heatingBed} onToggle={() => toggleSection('heatingBed')}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">
              Enable Bed Heating
              <InfoTooltip content={globalSettings.bedHeatingEnabled
                ? 'The configured bed temperature will be applied during print execution.'
                : 'No bed-temperature command will be sent while heating is disabled.'}
              />
            </span>
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
        </div>
      </AccordionSection>

      <AccordionSection title="Toolhead" helpTopic="toolhead_setup" isOpen={openSections.toolheads} onToggle={() => toggleSection('toolheads')}>
        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_112px] items-end gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                Machine toolheads
                <InfoTooltip content="Define the number of physical tool positions first. Every position can independently use FDM, Hydrogel or UV, including repeated tool types." />
              </div>
              <p className="mt-1 text-[8px] text-slate-400">One slot becomes one Klipper tool (T0, T1, T2…)</p>
            </div>
            <NumericInput
              className="w-full min-w-0"
              value={globalSettings.machineToolheadCount ?? 3}
              min={1}
              step={1}
              onChange={value => {
                const count = Math.max(1, Math.round(value));
                onUpdateGlobalSettings({ ...globalSettings, machineToolheadCount: count });
                onUpdateToolheads(toolheads.filter(tool => (tool.slot ?? 0) < count));
              }}
            />
          </div>

          {Array.from({ length: globalSettings.machineToolheadCount ?? 3 }, (_, slotIndex) => slotIndex).map(slotIndex => {
            const assignedTool = toolheads.find(t => t.slot === slotIndex);

            return (
              <div key={slotIndex} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold text-slate-500 uppercase flex-shrink-0">Slot {slotIndex + 1}</span>

                  <select
                    value={assignedTool ? getToolheadType(assignedTool) : ''}
                    onChange={e => {
                      const type = e.target.value as ToolheadType | '';
                      const remaining = toolheads.filter(tool => tool.slot !== slotIndex);
                      onUpdateToolheads(type ? [...remaining, createToolhead(type, slotIndex)] : remaining);
                    }}
                    className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-[9px] font-bold uppercase outline-none focus:ring-1 focus:ring-primary min-w-0"
                  >
                    <option value="">-- Empty --</option>
                    <option value="fdm">FDM</option>
                    <option value="syringe">HYDROGEL</option>
                    <option value="uv">UV</option>
                  </select>

                  {assignedTool && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onUpdateToolheads(toolheads.filter(t => t.id !== assignedTool.id))}
                        className="p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:dark:bg-red-900/30 rounded transition-colors"
                        title="Remove Tool"
                      >
                        <Icon name="close" className="text-[14px]" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </AccordionSection>
    </div>
  );
};
