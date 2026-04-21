import React, { useState } from 'react';
import { Icon } from '../../Icon';
import { useProjectContext } from '../../../contexts/ProjectContext';
import { MaterialProfile, MaterialCategory } from '../../../types';
import { NumericInput } from '../../LayersPanel/NumericInput';

export const MaterialPresetPanel: React.FC = () => {
  const { project } = useProjectContext();
  const [editingId, setEditingId] = useState<string | null>(null);

  const categories: { id: MaterialCategory; label: string; icon: string }[] = [
    { id: 'thermoplastic', label: 'Thermo', icon: 'thermostat' },
    { id: 'hydrogel', label: 'Hydrogel', icon: 'water_drop' },
    { id: 'bio-ink', label: 'Bio-Ink', icon: 'biotech' },
    { id: 'support', label: 'Support', icon: 'layers' }
  ];

  const handleAddNew = (cat: MaterialCategory) => {
    const newId = project.handleAddMaterial(cat);
    setEditingId(newId);
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300 pb-10">
      <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1 py-1 border-b border-slate-100 dark:border-slate-800">
        <Icon name="library_books" className="text-[10px]" /> Material Library
      </h3>

      <div className="space-y-4">
        {categories.map(cat => (
          <div key={cat.id} className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 opacity-60">
                <Icon name={cat.icon} className="text-[10px]" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-wider">{cat.label}</span>
              </div>
              <button 
                onClick={() => handleAddNew(cat.id)}
                className="px-1.5 py-0.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 transition-all text-[8px] font-black uppercase tracking-tighter flex items-center gap-0.5"
              >
                <Icon name="add" className="text-[9px]" /> New
              </button>
            </div>
            
            <div className="space-y-1">
              {project.userMaterials.filter(m => m.category === cat.id).map(mat => (
                <div key={mat.id} className="group transition-all">
                  <div className={`rounded-lg border transition-all ${
                    editingId === mat.id 
                      ? 'border-emerald-500/50 bg-emerald-50/20 dark:bg-emerald-900/10' 
                      : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-200 dark:hover:border-slate-700'
                  }`}>
                    <div className="flex items-center gap-2 p-1.5">
                      <div className="w-2.5 h-2.5 rounded-full border border-black/5 shrink-0" style={{ backgroundColor: mat.color }} />
                      <input 
                        type="text"
                        value={mat.name}
                        onChange={e => project.handleUpdateMaterial(mat.id, { name: e.target.value })}
                        className={`bg-transparent border-none outline-none text-[9px] font-bold uppercase truncate flex-1 min-w-0 ${
                          editingId === mat.id ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      />
                      <button 
                        onClick={() => setEditingId(editingId === mat.id ? null : mat.id)}
                        className={`p-1 rounded opacity-40 group-hover:opacity-100 transition-all ${editingId === mat.id ? 'text-emerald-600 opacity-100 rotate-180' : 'text-slate-400'}`}
                      >
                        <Icon name="expand_more" className="text-[12px]" />
                      </button>
                    </div>

                    {editingId === mat.id && (
                      <div className="p-2 border-t border-slate-100 dark:border-slate-800/60 bg-emerald-50/10 dark:bg-black/10 space-y-3 animate-in fade-in duration-200">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <span className="text-[7px] text-slate-400 font-black uppercase tracking-widest">Base Color</span>
                            <div className="flex items-center gap-1.5">
                              <input 
                                type="color" 
                                value={mat.color} 
                                onChange={e => project.handleUpdateMaterial(mat.id, { color: e.target.value })}
                                className="w-4 h-4 rounded-sm border-none bg-transparent cursor-pointer p-0"
                              />
                              <input 
                                type="text"
                                value={mat.color}
                                onChange={e => project.handleUpdateMaterial(mat.id, { color: e.target.value })}
                                className="w-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 font-mono text-[8px] uppercase outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                          {mat.category === 'thermoplastic' ? (
                            <>
                              <div className="space-y-0.5">
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Nozzle (°C)</span>
                                <NumericInput value={mat.temp || 0} onChange={v => project.handleUpdateMaterial(mat.id, { temp: v })} step={5} />
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Bed (°C)</span>
                                <NumericInput value={mat.bedTemp || 0} onChange={v => project.handleUpdateMaterial(mat.id, { bedTemp: v })} step={5} />
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Retr. (mm)</span>
                                <NumericInput value={mat.retraction || 0} onChange={v => project.handleUpdateMaterial(mat.id, { retraction: v })} step={0.5} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="space-y-0.5">
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Flow (ul/mm)</span>
                                <NumericInput value={mat.flowRate || 0} onChange={v => project.handleUpdateMaterial(mat.id, { flowRate: v })} step={0.1} />
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[7px] text-slate-400 font-bold uppercase">Press. (kPa)</span>
                                <NumericInput value={mat.pressure || 0} onChange={v => project.handleUpdateMaterial(mat.id, { pressure: v })} step={1} />
                              </div>
                            </>
                          )}
                        </div>
                        
                        <div className="flex justify-between items-center pt-1 mt-1 border-t border-emerald-500/10">
                           <button 
                            onClick={() => project.handleDeleteMaterial(mat.id)}
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
        ))}
      </div>
    </div>
  );
};
