import React, { useState } from 'react';
import { Icon } from '../../Icon';
import { useProjectContext } from '../../../contexts/ProjectContext';
import { NozzleTip } from '../../../constants/nozzleTips';
import { NumericInput } from '../../LayersPanel/NumericInput';

export const TipsLibraryPanel: React.FC = () => {
  const { project } = useProjectContext();
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAddNew = () => {
    const newTip: NozzleTip = {
      id: `custom_${Date.now()}`,
      brand: 'Custom',
      series: 'Series',
      type: 'conical',
      gauge: 20,
      colorName: 'Pink',
      colorHex: '#ec4899',
      innerDiameterMm: 0.6,
      innerDiameterIn: 0.024,
      standardRef: `C-${Date.now().toString().slice(-4)}`,
      isCustom: true
    };
    project.handleAddTip(newTip);
    setEditingId(newTip.id);
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to permanently delete tip "${name}"?`)) {
      project.handleDeleteTip(id);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 pb-10">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1">
        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
          <Icon name="hardware" className="text-[10px]" /> Tips Library
        </h3>
        <button 
          onClick={handleAddNew}
          className="px-1.5 py-0.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 transition-all text-[8px] font-black uppercase tracking-tighter flex items-center gap-0.5"
        >
          <Icon name="add" className="text-[9px]" /> New Tip
        </button>
      </div>

      <div className="space-y-1">
        {project.tipsLibrary.map(tip => (
          <div key={tip.id} className="group transition-all">
            <div className={`rounded-lg border transition-all ${
              editingId === tip.id 
                ? 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-900/10' 
                : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-200 dark:hover:border-slate-700'
            }`}>
              <div className="flex items-center gap-2 p-1.5">
                <div className="w-2.5 h-2.5 rounded-full border border-black/5 shrink-0" style={{ backgroundColor: tip.colorHex }} />
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className={`text-[9px] font-bold uppercase truncate ${
                    editingId === tip.id ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    {tip.gauge} GA {tip.colorName}
                  </span>
                  <span className="text-[7px] font-medium text-slate-400 uppercase truncate">
                    Ref. {tip.standardRef} — {tip.type}
                  </span>
                </div>
                {tip.isCustom && (
                  <span className="text-[6px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-black uppercase">
                    Custom
                  </span>
                )}
                <button 
                  onClick={() => setEditingId(editingId === tip.id ? null : tip.id)}
                  className={`p-1 rounded opacity-40 group-hover:opacity-100 transition-all ${editingId === tip.id ? 'text-emerald-600 opacity-100 rotate-180' : 'text-slate-400'}`}
                >
                  <Icon name="expand_more" className="text-[12px]" />
                </button>
              </div>

              {editingId === tip.id && (
                <div className="p-2 border-t border-slate-100 dark:border-slate-800/60 bg-emerald-50/10 dark:bg-black/10 space-y-3 animate-in fade-in duration-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="text-[7px] text-slate-400 font-black uppercase tracking-widest">Tip Color</span>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="color" 
                          value={tip.colorHex} 
                          onChange={e => project.handleUpdateTip(tip.id, { colorHex: e.target.value })}
                          className="w-4 h-4 rounded-sm border-none bg-transparent cursor-pointer p-0"
                        />
                        <input 
                          type="text"
                          value={tip.colorName}
                          onChange={e => project.handleUpdateTip(tip.id, { colorName: e.target.value })}
                          placeholder="Color Name"
                          className="flex-1 min-w-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 font-mono text-[8px] uppercase outline-none text-slate-600 dark:text-slate-300"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[7px] text-slate-400 font-black uppercase tracking-widest">Type</span>
                      <select 
                        value={tip.type}
                        onChange={e => project.handleUpdateTip(tip.id, { type: e.target.value as 'conical' | 'straight' })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase outline-none text-slate-600 dark:text-slate-300"
                      >
                        <option value="conical">Conical</option>
                        <option value="straight">Straight</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="space-y-0.5">
                      <span className="text-[7px] text-slate-400 font-bold uppercase">Gauge (AWG)</span>
                      <NumericInput value={tip.gauge} onChange={v => project.handleUpdateTip(tip.id, { gauge: v })} step={1} />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[7px] text-slate-400 font-bold uppercase">Inner Dia. (mm)</span>
                      <NumericInput value={tip.innerDiameterMm} onChange={v => project.handleUpdateTip(tip.id, { innerDiameterMm: v, innerDiameterIn: v / 25.4 })} step={0.01} />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[7px] text-slate-400 font-bold uppercase">Brand</span>
                      <input 
                        type="text"
                        value={tip.brand}
                        onChange={e => project.handleUpdateTip(tip.id, { brand: e.target.value })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 font-mono text-[8px] uppercase outline-none"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[7px] text-slate-400 font-bold uppercase">Ref (ID)</span>
                      <input 
                        type="text"
                        value={tip.standardRef}
                        onChange={e => project.handleUpdateTip(tip.id, { standardRef: e.target.value })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 font-mono text-[8px] uppercase outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-1 mt-1 border-t border-emerald-500/10">
                     <button 
                      onClick={() => handleDelete(tip.id, `${tip.gauge} GA ${tip.colorName}`)}
                      className="text-[7px] font-black text-red-400/60 hover:text-red-500 uppercase flex items-center gap-0.5 transition-colors"
                     >
                       <Icon name="delete" className="text-[10px]" /> Delete
                     </button>
                     <button 
                       onClick={() => setEditingId(null)}
                       className="text-[7px] font-black text-emerald-600 uppercase"
                     >
                       Close
                     </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
