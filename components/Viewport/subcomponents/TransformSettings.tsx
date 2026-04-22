import React from 'react';
import { Icon } from '../../Icon';
import { ModelData, TransformData } from '../../../types';

export type ObjectTool = 'translate' | 'rotate' | 'scale' | 'orient' | 'modify';

interface TransformSettingsProps {
  selectedModel: ModelData;
  objectTool: ObjectTool;
  setObjectTool: (tool: ObjectTool) => void;
  arraySpacing: number;
  setArraySpacing: (val: number) => void;
  onArrayModels: (spacing: number) => void;
  onCloneModel: (id: string) => void;
  onTransformChange: (id: string, data: TransformData) => void;
  onDeleteModel: (id: string) => void;
  uniformScale: boolean;
  setUniformScale: (val: boolean) => void;
}

export const TransformSettings: React.FC<TransformSettingsProps> = ({
  selectedModel,
  objectTool,
  setObjectTool,
  arraySpacing,
  setArraySpacing,
  onArrayModels,
  onCloneModel,
  onTransformChange,
  onDeleteModel,
  uniformScale,
  setUniformScale
}) => {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
        <Icon name="transform" className="text-[10px]" /> Transform Controls
      </div>

      <div className="bg-slate-100/50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 p-1">
        <div className="grid grid-cols-4 gap-1">
          {[
            { id: 'translate', icon: 'open_with', label: 'Move' },
            { id: 'rotate', icon: 'rotate_right', label: 'Rotate' },
            { id: 'scale', icon: 'aspect_ratio', label: 'Scale' },
            { id: 'modify', icon: 'auto_fix_high', label: 'Tools' },
          ].map(tool => (
            <button
              key={tool.id}
              onClick={() => setObjectTool(tool.id as ObjectTool)}
              className={`flex flex-col items-center justify-center py-2 rounded transition-all ${objectTool === tool.id
                ? 'bg-white dark:bg-slate-700 text-primary'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              title={tool.label}
            >
              <Icon name={tool.icon} className="text-base" />
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
        {objectTool === 'modify' ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5 flex items-center gap-1.5">
                <Icon name="grid_view" className="text-[10px]" /> Arrange Pattern
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={arraySpacing}
                    onChange={(e) => setArraySpacing(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-600 dark:text-slate-300 outline-none pr-8"
                    placeholder="Spacing"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 font-bold uppercase tracking-tighter">mm</span>
                </div>
                <button
                  onClick={() => onArrayModels(arraySpacing)}
                  className="px-3 py-1.5 bg-slate-800 dark:bg-slate-700 hover:bg-primary text-white text-[9px] font-black rounded uppercase tracking-widest transition-all"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-700/50"></div>

            <div className="grid grid-cols-1 gap-1.5">
              <button
                onClick={() => onCloneModel(selectedModel.id)}
                className="w-full py-2 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:bg-primary/5 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded uppercase tracking-wide transition-all flex items-center justify-center gap-2"
              >
                <Icon name="content_copy" className="text-xs" /> Duplicate Model
              </button>
              <button
                onClick={() => onTransformChange(selectedModel.id, { ...selectedModel.transform, position: { x: 0, y: 0, z: 0 } })}
                className="w-full py-2 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:bg-primary/5 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded uppercase tracking-wide transition-all flex items-center justify-center gap-2"
              >
                <Icon name="center_focus_strong" className="text-xs" /> Reset Position
              </button>
              <button
                onClick={() => setObjectTool('orient')}
                className="w-full py-2 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:bg-primary/5 text-slate-500 dark:text-slate-400 text-[10px] font-bold rounded uppercase tracking-wide transition-all flex items-center justify-center gap-2"
              >
                <Icon name="vertical_align_bottom" className="text-xs" /> Align to Bed
              </button>
              <button
                onClick={() => onDeleteModel(selectedModel.id)}
                className="w-full py-2 bg-red-50/50 dark:bg-red-950/10 border border-red-100/50 dark:border-red-900/20 hover:bg-red-500 hover:text-white text-red-500 dark:text-red-400 text-[10px] font-black rounded uppercase tracking-widest transition-all flex items-center justify-center gap-2 mt-1"
              >
                <Icon name="delete" className="text-xs" /> Remove Model
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {objectTool === 'scale' && (
              <div className="flex items-center justify-end mb-1">
                <button 
                  onClick={() => setUniformScale(!uniformScale)}
                  className="flex items-center gap-2 group"
                >
                  <span className="text-[9px] font-black text-slate-400 group-hover:text-primary transition-colors select-none uppercase tracking-tighter">Uniform Scale</span>
                  <div className={`w-3.5 h-3.5 border-2 rounded-md flex items-center justify-center transition-all ${uniformScale ? 'bg-primary border-primary' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600'}`}>
                    {uniformScale && <Icon name="check" className="text-[10px] text-white font-bold" />}
                  </div>
                </button>
              </div>
            )}

            {['x', 'y', 'z'].map((axis) => {
              const value = objectTool === 'translate'
                ? selectedModel.transform.position[axis as 'x' | 'y' | 'z']
                : objectTool === 'rotate'
                  ? selectedModel.transform.rotation[axis as 'x' | 'y' | 'z']
                  : selectedModel.transform.scale[axis as 'x' | 'y' | 'z'];

              return (
                <div key={axis} className="flex items-center gap-2 group">
                  <div className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase select-none">
                    {axis}
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step={objectTool === 'rotate' ? 15 : objectTool === 'scale' ? 0.1 : 1}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-right text-xs font-mono text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-primary outline-none transition-all pr-8"
                      value={value !== undefined ? Number(value).toFixed(objectTool === 'scale' ? 2 : 1) : ''}
                      placeholder="0.0"
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (isNaN(val)) return;

                        const newTransform = JSON.parse(JSON.stringify(selectedModel.transform));
                        if (objectTool === 'translate') newTransform.position[axis] = val;
                        if (objectTool === 'rotate') newTransform.rotation[axis] = val;
                        if (objectTool === 'scale') {
                          if (uniformScale) {
                            newTransform.scale = { x: val, y: val, z: val };
                          } else {
                            newTransform.scale[axis] = val;
                          }
                        }
                        onTransformChange(selectedModel.id, newTransform);
                      }}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-black pointer-events-none select-none uppercase">
                      {objectTool === 'rotate' ? '°' : objectTool === 'scale' ? 'x' : 'mm'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
