import React, { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { ModelData, GlobalSettings } from '../../types';
import { TOOLHEAD_COLORS } from '../Viewport/constants';

const TOOLHEAD_LABELS: Record<string, string> = {
  fdm: 'FDM',
  syringe: 'SYR',
  uv: 'UV',
  none: 'None'
};

interface Step2ModelsProps {
  models: ModelData[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onDeleteModel: (id: string) => void;
  onFileUpload: (file: File) => void;
  globalSettings: GlobalSettings;
  onOpenCloneDialog: (modelId: string, initialWellId?: string) => void;
}

export const Step2Models: React.FC<Step2ModelsProps> = ({
  models,
  selectedModelId,
  onSelectModel,
  onDeleteModel,
  onFileUpload,
  globalSettings,
  onOpenCloneDialog
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => onFileUpload(file));
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-left-1">
      {/* Drag & Drop Upload Zone */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".stl"
        multiple
        className="hidden"
      />
      <div
        onClick={handleUploadClick}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragOver(false);
          const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.stl'));
          files.forEach(f => onFileUpload(f));
        }}
        className={`relative cursor-pointer border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-all duration-200 group ${
          isDragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'
        }`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
          isDragOver ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary'
        }`}>
          <Icon name={isDragOver ? 'file_download' : 'upload_file'} className="text-2xl" />
        </div>
        <div className="text-center">
          <p className={`text-[11px] font-black uppercase tracking-widest transition-colors ${
            isDragOver ? 'text-primary' : 'text-slate-600 dark:text-slate-300 group-hover:text-primary'
          }`}>
            {isDragOver ? 'Drop to Load' : 'Load Files'}
          </p>
          <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-wide">
            Click or drag & drop · .STL
          </p>
        </div>
        {isDragOver && (
          <div className="absolute inset-0 rounded-xl border-2 border-primary animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Lista de Modelos — Rediseño Plano y Segmentado */}
      <div className="space-y-2 mt-4">
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Modelos en Escena</span>
          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-sm border border-slate-200 dark:border-slate-700">
            {models.length}
          </span>
        </div>
        
        <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar max-h-[350px] pr-1">
          {models.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              <Icon name="layers_clear" className="text-3xl text-slate-200 dark:text-slate-800 mb-2" />
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Bandeja Vacía</p>
            </div>
          ) : (
            models.map(model => {
              const thId = model.toolhead || 'none';
              const thColor = TOOLHEAD_COLORS[thId] || TOOLHEAD_COLORS.none;
              const thLabel = TOOLHEAD_LABELS[thId] || 'OBJ';
              const isSelected = selectedModelId === model.id;
              const wellId = model.transform.wellAssignment?.wellId;

              return (
                <div
                  key={model.id}
                  onClick={() => onSelectModel(model.id)}
                  className={`flex items-stretch border rounded-md overflow-hidden transition-all select-none h-11 ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm shadow-primary/10'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {/* SEGMENTO 1: Identificador de Herramienta / Pocillo */}
                  <div 
                    className="w-11 flex items-center justify-center text-white shrink-0 border-r border-black/5"
                    style={{ backgroundColor: thColor }}
                  >
                    <span className="text-[11px] font-black tracking-tighter">
                      {(globalSettings.printBed?.type === 'multiwell_plate' && wellId) ? wellId : thLabel}
                    </span>
                  </div>

                  {/* SEGMENTO 2: Información Principal */}
                  <div className="flex-1 min-w-0 px-3 flex flex-col justify-center border-r border-slate-100 dark:border-slate-800">
                    <h3 className={`text-[11px] truncate uppercase tracking-tight ${isSelected ? 'font-black text-primary' : 'font-bold text-slate-700 dark:text-slate-300'}`}>
                      {model.name}
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] text-slate-400 font-black uppercase">{thId}</span>
                      {model.size && (
                        <>
                          <span className="text-[8px] text-slate-300">•</span>
                          <span className="text-[8px] text-slate-400 font-mono">{model.size.x.toFixed(1)}x{model.size.y.toFixed(1)}mm</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* SEGMENTO 3: Acciones rápidas (Background sólido) */}
                  <div className="flex items-center bg-slate-50 dark:bg-slate-800/50">
                    {/* Botón de Asignación / Clonación Visual */}
                    {globalSettings.printBed?.type === 'multiwell_plate' && (
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          onOpenCloneDialog(model.id, wellId);
                        }}
                        className="w-9 h-full flex items-center justify-center text-slate-300 hover:text-primary hover:bg-primary/10 border-r border-slate-100 dark:border-slate-800 transition-colors"
                        title="Asignar o clonar en pocillos"
                      >
                        <Icon name="grid_view" className="text-[16px]" />
                      </button>
                    )}

                    {/* Botón de Borrado */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteModel(model.id); }}
                      className="w-9 h-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Icon name="close" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
