import React, { useState } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { GlobalSettings } from '../../types';
import { HelpTopic } from '../HelpWiki/HelpWiki';

interface Step4SettingsProps {
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  onOpenHelp: (topic: HelpTopic) => void;
  onApplyToAll: () => void;
}

export const Step4Settings: React.FC<Step4SettingsProps> = ({
  globalSettings,
  onUpdateGlobalSettings,
  onOpenHelp,
  onApplyToAll,
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    fffQuality: true,
    fffSpeeds: false,
    fffAdhesion: false,
    fffSupports: false,
    fffCooling: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-3 overflow-y-auto max-h-full pb-20 animate-in fade-in slide-in-from-left-1">
      <AccordionSection title="Z-Axis Configuration" isOpen={openSections.fffQuality} onToggle={() => toggleSection('fffQuality')}>
        <div className="space-y-4 py-2">
          <div className="space-y-2 px-1">
            <div className="flex justify-between items-center">
              <span className="label-clinical">Layer Height</span>
              <span className="text-[10px] font-mono font-bold text-primary">{globalSettings.layerHeight} µm</span>
            </div>
            <input 
              type="range" 
              min="50" max="400" step="10"
              value={globalSettings.layerHeight} 
              onChange={e => onUpdateGlobalSettings({ ...globalSettings, layerHeight: +e.target.value })} 
              className="w-full"
            />
          </div>
          <div className="space-y-2 px-1">
            <div className="flex justify-between items-center">
              <span className="label-clinical">First Layer</span>
              <span className="text-[10px] font-mono font-bold text-slate-400">{globalSettings.firstLayerHeight || 300} µm</span>
            </div>
            <input 
              type="range" 
              min="50" max="500" step="10"
              value={globalSettings.firstLayerHeight || 300} 
              onChange={e => onUpdateGlobalSettings({ ...globalSettings, firstLayerHeight: +e.target.value })} 
              className="w-full"
            />
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Motion Dynamics" isOpen={openSections.fffSpeeds} onToggle={() => toggleSection('fffSpeeds')}>
        <div className="space-y-4 py-2">
          <div className="space-y-2 px-1">
            <div className="flex justify-between items-center">
              <span className="label-clinical">Perimeter Speed</span>
              <span className="text-[10px] font-mono text-primary font-bold">{globalSettings.perimeterSpeed || 45} mm/s</span>
            </div>
            <input 
              type="range" 
              min="10" max="150" step="5"
              value={globalSettings.perimeterSpeed || 45} 
              onChange={e => onUpdateGlobalSettings({ ...globalSettings, perimeterSpeed: +e.target.value })} 
              className="w-full"
            />
          </div>
          <div className="space-y-2 px-1">
            <div className="flex justify-between items-center">
              <span className="label-clinical">Infill Speed</span>
              <span className="text-[10px] font-mono text-primary font-bold">{globalSettings.infillSpeed || 80} mm/s</span>
            </div>
            <input 
              type="range" 
              min="10" max="200" step="10"
              value={globalSettings.infillSpeed || 80} 
              onChange={e => onUpdateGlobalSettings({ ...globalSettings, infillSpeed: +e.target.value })} 
              className="w-full"
            />
          </div>
        </div>
      </AccordionSection>

      <AccordionSection 
        title="Adhesion"
        isOpen={openSections.fffAdhesion} 
        onToggle={() => toggleSection('fffAdhesion')}
      >
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3 items-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Skirts (loops):</span>
            <NumericInput className="w-full" value={globalSettings.skirtCount || 0} onChange={v => onUpdateGlobalSettings({ ...globalSettings, skirtCount: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Skirt Distance (mm):</span>
            <NumericInput className="w-full" value={globalSettings.skirtDistance || 0} onChange={v => onUpdateGlobalSettings({ ...globalSettings, skirtDistance: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Skirt Height (layers):</span>
            <NumericInput className="w-full" value={globalSettings.skirtHeight || 1} onChange={v => onUpdateGlobalSettings({ ...globalSettings, skirtHeight: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3 items-center pt-1 border-t border-slate-100 dark:border-slate-800/60">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Brim Width (mm):</span>
            <NumericInput className="w-full" value={globalSettings.brimWidth || 0} onChange={v => onUpdateGlobalSettings({ ...globalSettings, brimWidth: v })} />
          </div>
        </div>
      </AccordionSection>

      <AccordionSection 
        title="Supports"
        isOpen={openSections.fffSupports} 
        onToggle={() => toggleSection('fffSupports')}
      >
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Enable Supports</span>
            <button onClick={() => onUpdateGlobalSettings({ ...globalSettings, supportsEnabled: !globalSettings.supportsEnabled })} className={`w-8 h-4 rounded-full relative transition-colors ${globalSettings.supportsEnabled ? 'bg-primary' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${globalSettings.supportsEnabled ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/30">
            <p className="text-[9px] text-slate-400 leading-relaxed italic">
              When enabled, scaffold structures will be generated for overhangs based on the toolhead mapping defined in previous steps.
            </p>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Cooling" isOpen={openSections.fffCooling} onToggle={() => toggleSection('fffCooling')}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Always On:</span>
            <button onClick={() => onUpdateGlobalSettings({ ...globalSettings, fanAlwaysOn: !globalSettings.fanAlwaysOn })} className={`w-8 h-4 rounded-full relative transition-colors ${globalSettings.fanAlwaysOn ? 'bg-primary' : 'bg-slate-300'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${globalSettings.fanAlwaysOn ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Min Speed (%)</span>
              <NumericInput value={globalSettings.minFanSpeed || 35} onChange={v => onUpdateGlobalSettings({ ...globalSettings, minFanSpeed: v })} />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">Max Speed (%)</span>
              <NumericInput value={globalSettings.maxFanSpeed || 100} onChange={v => onUpdateGlobalSettings({ ...globalSettings, maxFanSpeed: v })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <span className="text-[10px] text-slate-500 font-medium uppercase">Disable for first (layers):</span>
            <NumericInput className="w-full" value={globalSettings.disableFanFirstLayers || 3} onChange={v => onUpdateGlobalSettings({ ...globalSettings, disableFanFirstLayers: v })} />
          </div>
        </div>
      </AccordionSection>

      <div className="pt-2">
        <button 
          onClick={onApplyToAll}
          className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase rounded-lg hover:bg-slate-200 transition-all border border-slate-200 dark:border-slate-700"
        >
          Apply these settings to ALL models
        </button>
      </div>
    </div>
  );
};
