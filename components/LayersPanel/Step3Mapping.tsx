import React, { useState } from 'react';
import { Icon } from '../Icon';
import { ModelData, GlobalSettings, ToolheadConfig, ZZone, INFILL_PATTERN_LABELS, InfillPattern } from '../../types';
import { TOOLHEAD_COLORS } from '../Viewport/constants';
import { SCAFFOLD_FEATURE_META, ToolheadSelect } from '../ToolheadPanel/ToolheadPanel';
import { NumericInput } from './NumericInput';

interface Step3MappingProps {
  models: ModelData[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  toolheads: ToolheadConfig[];
  onUpdateModel: (id: string, updates: Partial<ModelData>) => void;
  globalSettings: GlobalSettings;
  totalLayers: number;
  zZones: ZZone[];
}

export const Step3Mapping: React.FC<Step3MappingProps> = ({
  models,
  selectedModelId,
  onSelectModel,
  toolheads,
  onUpdateModel,
  globalSettings,
  totalLayers,
  zZones
}) => {
  const EMPTY_SCAFFOLD_TOOLS = {
    perimeter: 'none' as const,
    infill: 'none' as const,
    solidInfill: 'none' as const,
    support: 'none' as const,
  };
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  const toggleModelExpand = (id: string) => {
    setExpandedModels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
      {/* Models as individual cards */}
      {models.length === 0 ? (
        <div className="text-center py-10 text-slate-300 border border-dashed border-outline-variant/10 rounded-lg">
          <Icon name="view_in_ar" className="text-3xl mb-2 opacity-30" />
          <p className="text-[10px] font-black uppercase tracking-widest">NO_MODELS // LOAD_STL</p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map(m => {
            const scTools = m.scaffoldTools || EMPTY_SCAFFOLD_TOOLS;
            const isSelected = selectedModelId === m.id;
            const thColor = TOOLHEAD_COLORS[m.toolhead || 'none'];
            const modelZZones = zZones.filter(z => z.modelScope === 'all' || z.modelScope === m.id);
            const totalHeightMm = totalLayers > 0 
              ? ((totalLayers - 1) * (globalSettings.layerHeight || 200) / 1000) + (globalSettings.firstLayerHeight || 300) / 1000
              : 100; // Fallback
            
            return (
              <div 
                key={m.id} 
                className={`bg-white dark:bg-slate-900 border-2 rounded-xl overflow-hidden transition-all ${
                  isSelected 
                    ? 'border-primary shadow-lg shadow-primary/10' 
                    : 'border-slate-200 dark:border-slate-800 hover:border-primary/40'
                }`}
              >
                {/* Card header */}
                <div 
                  onClick={() => onSelectModel(m.id)}
                  className={`flex items-center justify-between px-3 py-2 cursor-pointer ${isSelected ? 'bg-primary/5' : 'bg-slate-50 dark:bg-slate-800/50'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div 
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: thColor + '22' }}
                    >
                      <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: thColor }} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[10px] font-black uppercase tracking-wider truncate ${isSelected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
                        {m.name}
                      </p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight">
                        CONFIGURATION
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleModelExpand(m.id); }}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                    >
                      <Icon 
                        name={expandedModels.has(m.id) ? "expand_less" : "expand_more"} 
                        className="text-slate-400 group-hover:text-primary transition-colors text-base" 
                      />
                    </button>
                  </div>
                </div>

                {/* Tool assignment */}
                {expandedModels.has(m.id) && (
                <div className="p-3 animate-in fade-in slide-in-from-top-1 duration-200 overflow-y-auto max-h-[60vh] custom-scrollbar">
                   <div className="grid grid-cols-2 gap-2">
                       {SCAFFOLD_FEATURE_META.map(feat => (
                         <div key={feat.key} className="flex flex-col gap-1 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100 dark:bg-slate-900/40 dark:border-slate-800">
                           <span className="text-[8px] text-slate-500 font-black uppercase tracking-tight">{feat.label}</span>
                           <ToolheadSelect
                             value={scTools[feat.key]}
                             onChange={v => onUpdateModel(m.id, { scaffoldTools: { ...scTools, [feat.key]: v } })}
                             className="w-full h-6 text-[10px]"
                             toolheads={toolheads}
                           />
                         </div>
                       ))}
                   </div>

                   {/* Base FDM Settings for the model */}
                   <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                     <label className="text-[8px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-1.5">
                       <Icon name="settings" className="text-[10px]" /> BASE FDM PROFILE
                     </label>
                     <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                           <span className="text-[8px] text-slate-500 uppercase font-black">Infill (%)</span>
                           <div className="h-7">
                             <NumericInput 
                               value={m.fdmSettings?.infillPercent ?? globalSettings.infill ?? 15} 
                               onChange={v => onUpdateModel(m.id, { fdmSettings: { ...m.fdmSettings, infillPercent: v } })} 
                             />
                           </div>
                        </div>
                        <div className="space-y-0.5">
                           <span className="text-[8px] text-slate-500 uppercase font-black">Walls</span>
                           <div className="h-7">
                             <NumericInput 
                               value={m.fdmSettings?.wallCount ?? globalSettings.perimeters ?? 3} 
                               onChange={v => onUpdateModel(m.id, { fdmSettings: { ...m.fdmSettings, wallCount: v } })} 
                             />
                           </div>
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                           <span className="text-[10px] text-slate-500 uppercase font-bold">Top Shell</span>
                           <div className="h-8">
                             <NumericInput 
                               value={m.fdmSettings?.topSolidLayers ?? globalSettings.topSolidLayers ?? 3} 
                               onChange={v => onUpdateModel(m.id, { fdmSettings: { ...m.fdmSettings, topSolidLayers: v } })} 
                             />
                           </div>
                        </div>
                        <div className="space-y-1">
                           <span className="text-[10px] text-slate-500 uppercase font-bold">Bottom Shell</span>
                           <div className="h-8">
                             <NumericInput 
                               value={m.fdmSettings?.bottomSolidLayers ?? globalSettings.bottomSolidLayers ?? 3} 
                               onChange={v => onUpdateModel(m.id, { fdmSettings: { ...m.fdmSettings, bottomSolidLayers: v } })} 
                             />
                           </div>
                        </div>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                       <div className="space-y-1">
                         <span className="text-[10px] text-slate-500 uppercase font-bold">Pattern</span>
                         <select
                           value={m.fdmSettings?.infillPattern ?? globalSettings.infillPattern ?? 'grid'}
                           onChange={e => onUpdateModel(m.id, { fdmSettings: { ...m.fdmSettings, infillPattern: e.target.value as any } })}
                           className="w-full h-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                         >
                           {(Object.entries(INFILL_PATTERN_LABELS) as [InfillPattern, string][]).map(([val, label]) => (
                             <option key={val} value={val}>{label}</option>
                           ))}
                         </select>
                       </div>
                       <div className="space-y-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Angle (°)</span>
                          <div className="h-8">
                            <NumericInput 
                              value={m.fdmSettings?.fillAngle ?? globalSettings.fillAngle ?? 45} 
                              onChange={v => onUpdateModel(m.id, { fdmSettings: { ...m.fdmSettings, fillAngle: v } })} 
                            />
                          </div>
                       </div>
                     </div>
                    </div>
                 </div>
               )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
