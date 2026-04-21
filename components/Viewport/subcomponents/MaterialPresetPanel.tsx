import React from 'react';
import { Icon } from '../../Icon';
import { MATERIAL_PRESETS } from '../../../constants/materials';
import { useProjectContext } from '../../../contexts/ProjectContext';
import { MaterialProfile, ToolheadConfig } from '../../../types';

export const MaterialPresetPanel: React.FC = () => {
  const { project } = useProjectContext();

  const getToolheadMaterial = (id: string) => {
    const matId = project.selectedMaterials[id];
    return MATERIAL_PRESETS.find(m => m.id === matId);
  };

  const categories: { id: string; label: string; icon: string }[] = [
    { id: 'thermoplastic', label: 'Thermo', icon: 'thermostat' },
    { id: 'hydrogel', label: 'Hydrogel', icon: 'water_drop' },
    { id: 'bio-ink', label: 'Bio-Ink', icon: 'biotech' },
    { id: 'support', label: 'Support', icon: 'layers' }
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Active Selection Cards */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Icon name="settings_input_component" className="text-[12px]" /> Configured Toolheads
        </h3>
        
        {project.toolheads.filter(t => t.installed || t.slot !== undefined).map(th => {
          const activeMat = getToolheadMaterial(th.id);
          return (
            <div key={th.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-8 rounded-full ${activeMat ? '' : 'bg-slate-200 dark:bg-slate-700'}`} style={{ backgroundColor: activeMat?.color }} />
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{th.label}</p>
                  <p className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase truncate max-w-[120px]">
                    {activeMat ? activeMat.name : 'No Material Assigned'}
                  </p>
                </div>
              </div>
              {activeMat && (
                <div className="flex flex-col items-end opacity-40 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] font-mono font-bold text-slate-500">
                    {th.id === 'fdm' && `${activeMat.temp}°C`}
                    {th.id === 'syringe' && `${activeMat.pressure}kPa`}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Preset Library */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Icon name="library_books" className="text-[12px]" /> Material Library
        </h3>

        {categories.map(cat => {
          const catMats = MATERIAL_PRESETS.filter(m => m.category === cat.id);
          if (catMats.length === 0) return null;

          return (
            <div key={cat.id} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Icon name={cat.icon} className="text-[10px] text-primary" />
                <span className="text-[9px] font-bold text-slate-400 uppercase">{cat.label}</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {catMats.map(mat => (
                  <button
                    key={mat.id}
                    onClick={() => {
                      // Mapping logic: which toolhead can take which material?
                      // Simple approach: FDM for thermoplastics, Syringe for Hydrogels/Bio-inks
                      let targetTh = 'fdm';
                      if (mat.category === 'hydrogel' || mat.category === 'bio-ink' || mat.category === 'support') targetTh = 'syringe';
                      project.applyMaterialToToolhead(targetTh, mat.id);
                    }}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary/50 hover:shadow-md transition-all text-left flex items-center gap-3 active:scale-95"
                  >
                    <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: mat.color }} />
                    <div className="flex-1 overflow-hidden">
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{mat.name}</p>
                      <div className="flex gap-2">
                        {mat.temp && <span className="text-[8px] text-slate-400 font-mono italic">{mat.temp}°C</span>}
                        {mat.pressure && <span className="text-[8px] text-slate-400 font-mono italic">{mat.pressure}kPa</span>}
                      </div>
                    </div>
                    <Icon name="add" className="text-slate-200 group-hover:text-primary text-sm" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
