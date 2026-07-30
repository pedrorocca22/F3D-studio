import React from 'react';
import { Icon } from '../../Icon';
import { ModelData } from '../../../types';

interface ModelInfoPanelProps {
  model: ModelData;
  adhesionOffset: number;
}

export const ModelInfoPanel: React.FC<ModelInfoPanelProps> = ({ model, adhesionOffset }) => {
  const isAdv = !!model.advancedSettings.enabled;

  return (
    <div className="w-full bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/80 p-2 flex flex-col gap-2 rounded-xl shadow-xs">
      {/* Header */}
      <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200/60 dark:border-slate-700/50 px-0.5">
        <div className="w-4 h-4 bg-slate-200/60 dark:bg-slate-700 flex items-center justify-center text-slate-500 shrink-0 rounded-md">
          <Icon name="inventory_2" className="text-[10px]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-[10px] uppercase tracking-widest truncate text-slate-700 dark:text-slate-200 leading-none" title={model.name}>{model.name}</h3>
          <p className="text-[8px] text-slate-400 font-mono mt-0.5 uppercase">ID_{model.id.slice(0, 8)}</p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-3 gap-1 bg-slate-200/60 dark:bg-slate-700/60 p-1 border border-slate-200/80 dark:border-slate-700/80 overflow-hidden rounded-lg">
        <div className="bg-white dark:bg-slate-800 p-1.5 rounded-md">
          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-tight mb-0.5">Width_X</span>
          <span className="block text-[10px] font-bold text-slate-700 dark:text-slate-200 font-mono">{model.size?.x?.toFixed(1) || '-'}</span>
        </div>
        <div className="bg-white dark:bg-slate-800 p-1.5 rounded-md">
          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-tight mb-0.5">Depth_Y</span>
          <span className="block text-[10px] font-bold text-slate-700 dark:text-slate-200 font-mono">{model.size?.y?.toFixed(1) || '-'}</span>
        </div>
        <div className="bg-white dark:bg-slate-800 p-1.5 rounded-md">
          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-tight mb-0.5">Height_Z</span>
          <span className="block text-[10px] font-bold text-slate-700 dark:text-slate-200 font-mono">{model.size?.z?.toFixed(1) || '-'}</span>
        </div>
      </div>

      {/* Advanced Slice Badge */}
      {isAdv && (
        <div className="bg-primary/5 border border-primary/20 p-1 rounded-md">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-primary animate-pulse rounded-full" />
            <span className="text-[8px] font-black text-primary uppercase tracking-widest">Multi-Stage Active</span>
          </div>
        </div>
      )}
    </div>
  );
};
