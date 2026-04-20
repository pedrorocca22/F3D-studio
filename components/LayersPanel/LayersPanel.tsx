import React, { useState, useRef } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SliceSegment, ToolheadConfig, ToolheadId, ScaffoldToolMapping, FDMToolheadConfig, SyringeToolheadConfig, UVToolheadConfig, ZZone } from '../../types';
import { HelpTopic } from '../HelpWiki/HelpWiki';

import { generateUUID } from '../../utils';
import { generateCubeStl, generateCylinderStl } from '../../shapeGenerators';
import { ToolheadBadge, ToolheadSelect, SCAFFOLD_FEATURE_META, DEFAULT_SCAFFOLD_TOOLS } from '../ToolheadPanel/ToolheadPanel';
import { TOOLHEAD_COLORS } from '../Viewport/Viewport';
// FIX #4: Import centralized MULTIWELL_SPECS instead of local duplicate
import { MULTIWELL_SPECS } from '../../constants/wellplate';

const TOOLHEAD_LABELS: Record<string, string> = {
  fdm: 'FDM',
  syringe: 'SYR',
  uv: 'UV',
  none: 'None'
};

const TOOLHEAD_DESCS: Record<ToolheadId, string> = {
  fdm: 'FDM Hot-end (T0)',
  syringe: 'Hydrogel Syringe (T1)',
  uv: 'UV Crosslinker (T2)',
  none: 'None',
};


interface LayersPanelProps {
  models: ModelData[];
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onDeleteModel: (id: string) => void;
  onUpdateModel: (id: string, updates: Partial<ModelData>) => void;
  onTransformChange: (data: TransformData) => void;
  onUpdateSettings: (data: SliceSettings) => void;
  onUpdateAdvancedSettings: (data: AdvancedSliceSettings) => void;
  onApplySettingsToAll: (data: SliceSettings) => void;
  onCloneToWells?: (baseModelId: string, wellIds: string[], format: 6 | 12 | 24 | 48) => void;
  isAdvancedSliceMode: boolean;
  onFileUpload: (file: File, isCube?: boolean) => void;
  setIsAdvancedSliceMode: (val: boolean) => void;
  onSlice: () => void;
  // Toolhead props
  toolheads: ToolheadConfig[];
  totalLayers: number;
  onUpdateToolheads: (toolheads: ToolheadConfig[]) => void;
  zZones: ZZone[];
  onUpdateZZones: (zones: ZZone[]) => void;
  isSlicing?: boolean;
  slicePercent?: number;
  sliceMessage?: string;
  hasGCode?: boolean;
  onPrint?: () => void;
  jobId?: string | null;
  activeStep: number;
  setActiveStep: (step: number) => void;
  onOpenHelp: (topic: HelpTopic) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({

  // ... props
  ...props
}) => {
  const {
    models, globalSettings, onUpdateGlobalSettings, selectedModelId, onSelectModel,
    onDeleteModel, onUpdateModel, onTransformChange, onUpdateSettings, onUpdateAdvancedSettings,
    onApplySettingsToAll, isAdvancedSliceMode, setIsAdvancedSliceMode, onSlice, onFileUpload,
    toolheads, totalLayers, onUpdateToolheads,
    zZones, onUpdateZZones,
    isSlicing, slicePercent = 0, sliceMessage = '', hasGCode, onPrint, jobId,
    activeStep, setActiveStep, onOpenHelp, onCloneToWells
  } = props;

  
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    printBed: true,
    models: false,
    fffQuality: false,
    fffShell: false,
    fffSpeeds: false,
    fffAdhesion: false,
    fffCooling: false,
    toolheads: false,
    heatingBed: false,
    zZones: true,
  });

  const [toolheadSettingsOpen, setToolheadSettingsOpen] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [heating, setHeating] = useState({
    temp: 60
  });

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  
  // Clone to wells state
  const [cloneWellDialogFor, setCloneWellDialogFor] = useState<string | null>(null);
  const [selectedCloneWells, setSelectedCloneWells] = useState<Set<string>>(new Set());

  const toggleModelExpand = (id: string) => {
    setExpandedModels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };


  const selectedModel = models.find(m => m.id === selectedModelId);

  // FIX #8: Removed useEffect that forced isAdvancedSliceMode=true on every model selection.
  // isAdvancedSliceMode is now controlled exclusively by the user's toggle — no side effects.


  const toggleSection = (key: string) => {
    if (key === 'advanceSlice' && !selectedModelId) return;

    setOpenSections(prev => {
      const isOpen = !prev[key];
      // Close all others when opening one? No, just toggle.
      return { ...prev, [key]: isOpen };
    });
  };

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

  const currentSettings = selectedModel?.settings || {
    exposureTime: 2.5,
    lightIntensity: 15
  };

  const advancedSettings = selectedModel?.advancedSettings || {
    enabled: false,
    segments: []
  };

  const updateModelSettings = (key: keyof SliceSettings, value: number) => {
    if (!selectedModel) return;
    onUpdateSettings({
      ...currentSettings,
      [key]: value
    });
  };

// Cleaned up legacy

  const updateGlobalLayerHeight = (value: number) => {
    onUpdateGlobalSettings({
      ...globalSettings,
      layerHeight: value
    });
  };

  const handleApplyToAll = () => {
    if (!selectedModel) return;
    onApplySettingsToAll(currentSettings);
  };


  const handleAddCube = () => {
    const blob = generateCubeStl(10);
    const file = new File([blob], "Cube_10mm.stl", { type: "model/stl" });
    onFileUpload(file, true);
    setOpenSections(prev => ({ ...prev, advanceSlice: false }));
  };

  const handleAddCylinder = () => {
    const blob = generateCylinderStl(5, 10, 64);
    const file = new File([blob], "Cylinder_10mm.stl", { type: "model/stl" });
    onFileUpload(file, false);
    setOpenSections(prev => ({ ...prev, advanceSlice: false }));
  };


  const handleAddZZone = (modelScope: 'all' | string = 'all') => {
    const newId = generateUUID();
    const sorted = [...zZones].sort((a, b) => a.zEndMm - b.zEndMm);
    const last = sorted[sorted.length - 1];
    const start = last ? last.zEndMm : 0;
    const end = start + 5.0; // Default 5mm slab

    const newZone: ZZone = {
      id: newId,
      modelScope,
      zStartMm: start,
      zEndMm: end,
      enabled: true,
      priority: 1,
      label: `ZONE ${zZones.length + 1}`,
      color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`,
    };

    onUpdateZZones([...zZones, newZone]);
  };

  const handleUpdateZZone = (id: string, updates: Partial<ZZone>) => {
    onUpdateZZones(zZones.map(z => z.id === id ? { ...z, ...updates } : z));
  };

  const handleDeleteZZone = (id: string) => {
    onUpdateZZones(zZones.filter(z => z.id !== id));
  };

  const inputClass = "w-32";
  return (
    <aside className="w-[420px] flex-shrink-0 bg-surface-light border-r border-border-light flex flex-col z-10 transition-all duration-300">


      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-2 pb-2">
        {activeStep === 2 && (
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
                                setCloneWellDialogFor(model.id); 
                                setSelectedCloneWells(new Set(wellId ? [wellId] : [])); 
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
        )}

        {/* TAB 1: PRINT BED */}
        {activeStep === 1 && (
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
                      <button
                        onClick={() => onUpdateGlobalSettings({
                          ...globalSettings,
                          printBed: { type: 'glass_bed', dimensions: { width: 100, height: 100 } }
                        })}
                        className={`w-full py-2 px-3 border text-left flex items-center gap-3 transition-all ${
                          globalSettings.printBed?.type === 'glass_bed'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-outline-variant/20 hover:border-outline-variant/40'
                        }`}
                       >
                         <Icon name="crop_square" className="text-xs" />
                         <span className="text-[10px] font-black uppercase tracking-[0.1em]">Glass Bed</span>
                      </button>

                      <button
                        onClick={() => onUpdateGlobalSettings({
                          ...globalSettings,
                          printBed: { type: 'petri_dish', petriDiameter: 60 }
                        })}
                        className={`w-full py-2 px-3 border text-left flex items-center gap-3 transition-all ${
                          globalSettings.printBed?.type === 'petri_dish'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-outline-variant/20 hover:border-outline-variant/40'
                        }`}
                       >
                         <Icon name="circle" className="text-xs" />
                         <span className="text-[10px] font-black uppercase tracking-[0.1em]">Petri Dish</span>
                      </button>

                      <button
                        onClick={() => onUpdateGlobalSettings({
                          ...globalSettings,
                          printBed: { type: 'multiwell_plate', multiwellFormat: 12 }
                        })}
                        className={`w-full py-2 px-3 border text-left flex items-center gap-3 transition-all ${
                          globalSettings.printBed?.type === 'multiwell_plate'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-outline-variant/20 hover:border-outline-variant/40'
                        }`}
                       >
                         <Icon name="apps" className="text-xs" />
                         <span className="text-[10px] font-black uppercase tracking-[0.1em]">Multiwell</span>
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
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-1 duration-200">
                              <>
                                {assignedTool.id === 'fdm' && (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[8px] text-slate-400 uppercase block">Nozzle (mm)</label>
                                        <NumericInput value={assignedTool.nozzleDiameter || 0.4} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, nozzleDiameter: v } : t))} step={0.05} />
                                      </div>
                                      <div>
                                        <label className="text-[8px] text-slate-400 uppercase block">Temp (°C)</label>
                                        <NumericInput value={assignedTool.defaultTemperature || 210} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, defaultTemperature: v } : t))} step={5} />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[8px] text-slate-400 uppercase block">Flowrate (%)</label>
                                        <NumericInput value={assignedTool.flowratePercent || 100} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, flowratePercent: v } : t))} step={5} />
                                      </div>
                                      <div>
                                        <label className="text-[8px] text-slate-400 uppercase block">Retract Speed</label>
                                        <NumericInput value={assignedTool.retractSpeed || 25} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, retractSpeed: v } : t))} step={5} />
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
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[8px] text-slate-400 uppercase block">Wavelength</label>
                                      <select 
                                        value={assignedTool.wavelengthNm || 405}
                                        onChange={e => onUpdateToolheads(toolheads.map(t => t.id === 'uv' ? { ...t, wavelengthNm: +e.target.value } : t))}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[9px]"
                                      >
                                        <option value={365}>365 nm</option>
                                        <option value={385}>385 nm</option>
                                        <option value={405}>405 nm</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-[8px] text-slate-400 uppercase block">Power (mW)</label>
                                      <NumericInput value={assignedTool.maxPowerMw || 1000} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'uv' ? { ...t, maxPowerMw: v } : t))} />
                                    </div>
                                  </div>
                                )}
                              </>
                          </div>
                        )}
                      </div>
                    );
                })}
                </div>
              </AccordionSection>

              
            </div>
          )}

          {/* TAB 3: MAPPING */}
          {activeStep === 3 && (
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
                    const scTools = m.scaffoldTools || DEFAULT_SCAFFOLD_TOOLS;
                    const isSelected = selectedModelId === m.id;
                    const thColor = TOOLHEAD_COLORS[m.toolhead || 'fdm'];
                    const modelZZones = zZones.filter(z => z.modelScope === 'all' || z.modelScope === m.id);
                    const totalHeightMm = totalLayers > 0 
                      ? ((totalLayers - 1) * globalSettings.layerHeight / 1000) + (globalSettings.firstLayerHeight || 300) / 1000
                      : 100; // Fallback
                    
                    return (
                      <div 
                        key={m.id} 
                        className={`bg-white border-2 rounded-xl overflow-hidden transition-all ${
                          isSelected 
                            ? 'border-primary shadow-lg shadow-primary/10' 
                            : 'border-outline-variant/20 hover:border-primary/40'
                        }`}
                      >
                        {/* Card header */}
                        <div 
                          onClick={() => onSelectModel(m.id)}
                          className={`flex items-center justify-between px-3 py-2 cursor-pointer ${isSelected ? 'bg-primary/5' : 'bg-slate-50'}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div 
                              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: thColor + '22' }}
                            >
                              <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: thColor }} />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-[10px] font-black uppercase tracking-wider truncate ${isSelected ? 'text-primary' : 'text-slate-700'}`}>
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
                                   <option value="rectilinear">Rectilinear</option>
                                   <option value="grid">Grid</option>
                                   <option value="gyroid">Gyroid</option>
                                   <option value="honeycomb">Honeycomb</option>
                                   <option value="triangles">Triangles</option>
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
          )}
          
          {/* TAB 4: GLOBAL SETTINGS */}
          {activeStep === 4 && (
            <div className="space-y-3 overflow-y-auto max-h-full pb-20">
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
                    />
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection 
                title={
                  <div className="flex items-center justify-between w-full pr-2">
                    <span>Adhesion & Shell</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onOpenHelp('adhesion'); }}
                      className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-primary"
                    >
                      <Icon name="help_outline" className="text-xs" />
                    </button>
                  </div>
                } 
                isOpen={openSections.fffAdhesion} 
                onToggle={() => toggleSection('fffAdhesion')}
              >
                <div className="space-y-3">
                   <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Enable Supports:</span>
                    <button onClick={() => onUpdateGlobalSettings({ ...globalSettings, supportsEnabled: !globalSettings.supportsEnabled })} className={`w-8 h-4 rounded-full relative transition-colors ${globalSettings.supportsEnabled ? 'bg-primary' : 'bg-slate-300'}`}>
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${globalSettings.supportsEnabled ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <span className="text-xs text-slate-500 font-medium">Brim Width (mm):</span>
                    <NumericInput className="w-full" value={globalSettings.brimWidth || 0} onChange={v => onUpdateGlobalSettings({ ...globalSettings, brimWidth: v })} />
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
                  onClick={handleApplyToAll}
                  className="w-full py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase rounded-lg hover:bg-slate-200 transition-all border border-slate-200 dark:border-slate-700"
                >
                  Apply these settings to ALL models
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: ADVANCED OVERRIDES (Z-ZONES) */}
          {activeStep === 5 && (
            <div className="space-y-3 overflow-y-auto max-h-full pb-20">
              <AccordionSection 
                title={
                  <div className="flex items-center justify-between w-full pr-2">
                    <div className="flex items-center gap-2">
                      <Icon name="straighten" className="text-primary text-xs" />
                      <span className="text-[10px] uppercase font-black tracking-widest">Height Zones</span>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleAddZZone(); }}
                      className="text-[8px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 hover:bg-primary/20 transition-colors font-black uppercase tracking-widest"
                    >
                      + ADD
                    </button>
                  </div>
                } 
                isOpen={openSections.zZones || true} 
                onToggle={() => toggleSection('zZones')}
              >
                <div className="space-y-4 py-2 px-1">
                  {zZones.length === 0 && (
                    <div className="text-center py-6 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                      <p className="text-[10px] text-slate-400 uppercase font-black mb-1">No height zones</p>
                      <button 
                        onClick={() => handleAddZZone()}
                        className="text-[10px] text-primary font-black hover:underline"
                      >
                        CREATE FIRST ZONE
                      </button>
                    </div>
                  )}
                  {zZones.sort((a,b) => a.zStartMm - b.zStartMm).map((zone, idx) => (
                    <div key={zone.id} className="mb-2 last:mb-0">
                      <div className="bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 p-2.5 space-y-2.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 overflow-hidden flex-1">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zone.color }} />
                            <select 
                              className="text-[8px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none font-black text-primary uppercase tracking-tighter max-w-[80px] truncate"
                              value={zone.modelScope}
                              onChange={e => handleUpdateZZone(zone.id, { modelScope: e.target.value })}
                            >
                               <option value="all">Global</option>
                               {models.map(m => (
                                 <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>
                               ))}
                            </select>
                            <input 
                              className="text-[10px] font-bold uppercase bg-transparent outline-none w-full truncate text-slate-700 dark:text-slate-300 ml-1"
                              value={zone.label}
                              onChange={e => handleUpdateZZone(zone.id, { label: e.target.value })}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                             <button onClick={() => handleDeleteZZone(zone.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                               <Icon name="delete" className="text-xs" />
                             </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest font-mono">Start (mm)</span>
                            <NumericInput 
                              value={zone.zStartMm} 
                              onChange={v => handleUpdateZZone(zone.id, { zStartMm: v })}
                              className="h-7 text-[10px] font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest font-mono">End (mm)</span>
                            <NumericInput 
                              value={zone.zEndMm} 
                              onChange={v => handleUpdateZZone(zone.id, { zEndMm: v })}
                              className="h-7 text-[10px] font-mono"
                            />
                          </div>
                        </div>

                        {/* Section Toggle Pills */}
                        <div className="pt-1 flex gap-2">
                           <button 
                             onClick={() => handleUpdateZZone(zone.id, { featureOverride: zone.featureOverride ? undefined : { toolhead: 'fdm', targetFeatures: ['all'] } })}
                             className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.featureOverride ? 'bg-teal-500 border-teal-500 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                           >
                             Tool
                           </button>
                           <button 
                             onClick={() => handleUpdateZZone(zone.id, { parameterOverride: zone.parameterOverride ? undefined : { fdm: {} } })}
                             className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.parameterOverride ? 'bg-violet-500 border-violet-500 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                           >
                             Params
                           </button>
                           <button 
                             onClick={() => handleUpdateZZone(zone.id, { processEvent: zone.processEvent ? undefined : { uvExposureTimeSec: 5, doseTargetMjCm2: 50, pausePrint: false } })}
                             className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.processEvent ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                           >
                             Event
                           </button>
                        </div>
                        
                        {/* Detail Overrides */}
                        {(zone.featureOverride || zone.parameterOverride || zone.processEvent) && (
                           <div className="mt-1 space-y-2">

                              {/* TOOL SECTION */}
                              {zone.featureOverride && (
                                <div className="rounded-lg border border-teal-200 dark:border-teal-900/60 overflow-hidden">
                                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-teal-50 dark:bg-teal-900/20">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                                      <span className="text-[8px] text-teal-700 dark:text-teal-400 uppercase font-black tracking-widest">Tool Override</span>
                                    </div>
                                    <button 
                                      onClick={() => {
                                        const isScaffold = !!zone.featureOverride?.scaffoldTools;
                                        if (isScaffold) {
                                          handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, scaffoldTools: undefined } });
                                        } else {
                                          handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, scaffoldTools: DEFAULT_SCAFFOLD_TOOLS } });
                                        }
                                      }}
                                      className={`text-[8px] px-1.5 py-0.5 rounded border font-black uppercase tracking-tighter ${!!zone.featureOverride.scaffoldTools ? 'bg-teal-500 text-white border-teal-500' : 'bg-white text-teal-600 border-teal-300 dark:bg-transparent'}`}
                                    >
                                      {!!zone.featureOverride.scaffoldTools ? 'SCAFFOLD_ON' : 'SINGLE_HEAD'}
                                    </button>
                                  </div>
                                  <div className="p-2.5">
                                    {!zone.featureOverride.scaffoldTools ? (
                                      <ToolheadSelect 
                                        className="w-full h-8 text-[10px]"
                                        value={zone.featureOverride.toolhead || 'fdm'}
                                        onChange={v => handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, toolhead: v } })}
                                        toolheads={toolheads}
                                      />
                                    ) : (
                                      <div className="space-y-1.5 p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-800">
                                        {SCAFFOLD_FEATURE_META.map(feat => (
                                           <div key={feat.key} className="flex items-center justify-between gap-2">
                                              <span className="text-[8px] text-slate-500 font-bold uppercase truncate">{feat.label}</span>
                                              <ToolheadSelect
                                                value={zone.featureOverride?.scaffoldTools?.[feat.key] || 'fdm'}
                                                onChange={v => {
                                                  handleUpdateZZone(zone.id, { 
                                                    featureOverride: { 
                                                      ...zone.featureOverride!, 
                                                      scaffoldTools: { ...(zone.featureOverride?.scaffoldTools || DEFAULT_SCAFFOLD_TOOLS), [feat.key]: v } 
                                                    } 
                                                  });
                                                }}
                                                className="w-20"
                                                toolheads={toolheads}
                                              />
                                           </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* PARAMETERS SECTION */}
                              {zone.parameterOverride && (
                                <div className="rounded-lg border border-violet-200 dark:border-violet-900/60 overflow-hidden">
                                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-50 dark:bg-violet-900/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                    <span className="text-[8px] text-violet-700 dark:text-violet-400 uppercase font-black tracking-widest">Parameter Override</span>
                                  </div>
                                  <div className="p-2.5 space-y-2.5">
                                    <div className="grid grid-cols-2 gap-3">
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Layer Height (µm)</span>
                                          <NumericInput 
                                            value={zone.parameterOverride.fdm?.layerHeightMm ? (zone.parameterOverride.fdm.layerHeightMm * 1000) : (globalSettings.layerHeight || 200)}
                                            onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), layerHeightMm: v / 1000 } } })}
                                            className="h-7 text-[10px]"
                                            step={10}
                                          />
                                       </div>
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Infill %</span>
                                          <NumericInput 
                                            value={zone.parameterOverride.fdm?.infillPercent ?? 15}
                                            onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPercent: v } } })}
                                            className="h-7 text-[10px]"
                                          />
                                       </div>
                                    </div>
                                    <div className="grid grid-cols-1">
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Pattern</span>
                                          <select 
                                            className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-slate-50 dark:bg-slate-900 outline-none px-1 font-bold"
                                            value={zone.parameterOverride.fdm?.infillPattern || 'grid'}
                                            onChange={e => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPattern: e.target.value as any } } })}
                                          >
                                             <option value="rectilinear">Rectilinear</option>
                                             <option value="grid">Grid</option>
                                             <option value="gyroid">Gyroid</option>
                                             <option value="honeycomb">Honeycomb</option>
                                             <option value="triangles">Triangles</option>
                                          </select>
                                       </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none">Walls</span>
                                          <NumericInput 
                                            value={zone.parameterOverride.fdm?.wallCount ?? 3}
                                            onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), wallCount: v } } })}
                                            className="h-7 text-[10px]"
                                          />
                                       </div>
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none">Top L.</span>
                                          <NumericInput 
                                            value={zone.parameterOverride.fdm?.topSolidLayers ?? 3}
                                            onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), topSolidLayers: v } } })}
                                            className="h-7 text-[10px]"
                                          />
                                       </div>
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest leading-none">Bot L.</span>
                                          <NumericInput 
                                            value={zone.parameterOverride.fdm?.bottomSolidLayers ?? 3}
                                            onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), bottomSolidLayers: v } } })}
                                            className="h-7 text-[10px]"
                                          />
                                       </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* EVENT SECTION */}
                              {zone.processEvent && (
                                <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 overflow-hidden">
                                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    <span className="text-[8px] text-amber-700 dark:text-amber-400 uppercase font-black tracking-widest">UV Process Event</span>
                                  </div>
                                  <div className="p-2.5 space-y-2.5">
                                    <div className="grid grid-cols-2 gap-2">
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-400 uppercase font-black">Mode</span>
                                          <select 
                                            className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1 font-bold"
                                            value={zone.processEvent.mode || 'stationary'}
                                            onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, mode: e.target.value as any } })}
                                          >
                                             <option value="stationary">Stationary</option>
                                             <option value="sweep">Sweep (Pattern)</option>
                                          </select>
                                       </div>
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-400 uppercase font-black">Pattern</span>
                                          <select 
                                            disabled={zone.processEvent.mode !== 'sweep'}
                                            className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1 font-bold disabled:opacity-30"
                                            value={zone.processEvent.pattern || 'zigzag'}
                                            onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, pattern: e.target.value as any } })}
                                          >
                                             <option value="zigzag">Zigzag</option>
                                             <option value="concentric">Concentric</option>
                                             <option value="infill_mimic">Infill Mimic</option>
                                          </select>
                                       </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-400 uppercase font-black">Power (%)</span>
                                          <NumericInput 
                                            value={zone.processEvent.powerPercentage ?? 100}
                                            onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, powerPercentage: v } })}
                                            className="h-7 text-[10px] font-mono"
                                          />
                                       </div>
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-400 uppercase font-black">Scan Speed (mm/s)</span>
                                          <NumericInput 
                                            disabled={zone.processEvent.mode !== 'sweep'}
                                            value={zone.processEvent.scanSpeedMmS ?? 20}
                                            onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, scanSpeedMmS: v } })}
                                            className="h-7 text-[10px] font-mono"
                                          />
                                       </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-400 uppercase font-black">Spacing (mm)</span>
                                          <NumericInput 
                                            disabled={zone.processEvent.mode !== 'sweep'}
                                            value={zone.processEvent.lineSpacingMm ?? 1.0}
                                            onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, lineSpacingMm: v } })}
                                            className="h-7 text-[10px] font-mono"
                                            step={0.1}
                                          />
                                       </div>
                                       <div className="space-y-1">
                                          <span className="text-[8px] text-slate-400 uppercase font-black">Z-Hop (mm)</span>
                                          <NumericInput 
                                            value={zone.processEvent.zOffsetMm ?? 2.0}
                                            onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, zOffsetMm: v } })}
                                            className="h-7 text-[10px] font-mono"
                                            step={0.1}
                                          />
                                       </div>
                                    </div>
                                    <div className="space-y-1 mt-1">
                                       <span className="text-[8px] text-slate-400 uppercase font-black">Trigger Mode</span>
                                       <select 
                                         className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-white dark:bg-slate-900 outline-none px-1 font-bold"
                                         value={zone.processEvent.trigger || 'after_layer'}
                                         onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, trigger: e.target.value as any } })}
                                       >
                                          <option value="after_layer">After each layer</option>
                                          <option value="after_segment">After entire zone</option>
                                       </select>
                                    </div>
                                  </div>
                                </div>
                              )}
                           </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionSection>
            </div>
          )}

        {/* STEP 6: PREVIEW & SLICE */}
        {activeStep === 6 && (() => {
            // 1. Calculamos la altura física real de los modelos cargados (Segmento base)
            const modelMaxZ = models.length > 0 
              ? Math.max(...models.map(m => (m.transform.position.z || 0) + (m.size?.z || 0)))
              : 0;
            
            // 2. Determinamos el límite superior del gráfico (el mayor entre modelos y zonas)
            const zonesMaxZ = zZones.length > 0 ? Math.max(...zZones.map(z => z.zEndMm)) : 0;
            const maxZ = Math.max(modelMaxZ, zonesMaxZ, 1); // Evitamos división por cero
            
            const layerHeightMm = (globalSettings.layerHeight || 200) / 1000;

            return (
            <div className="space-y-4 overflow-y-auto max-h-full pb-20 px-1">
                {/* Resumen de Parámetros Críticos */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Hardware Setup</h3>
                        <div className="space-y-1 text-[10px]">
                            <div className="flex justify-between"><span className="text-slate-500">Nozzle:</span><span className="font-mono font-bold text-primary">{globalSettings.nozzleDiameter || 0.4}mm</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Layer:</span><span className="font-mono font-bold text-primary">{globalSettings.layerHeight}µm</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Bed:</span><span className="font-mono font-bold">{globalSettings.bedHeatingEnabled ? `${globalSettings.bedTemperature}°C` : 'OFF'}</span></div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                        <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Print Area</h3>
                        <div className="space-y-1 text-[10px]">
                            <div className="flex justify-between"><span className="text-slate-500">Surface:</span><span className="font-mono font-bold capitalize">{(globalSettings.printBed?.type || 'glass').replace('_', ' ')}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Height:</span><span className="font-mono font-bold text-primary">{modelMaxZ.toFixed(2)}mm</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Models:</span><span className="font-mono font-bold">{models.length}</span></div>
                        </div>
                    </div>
                </div>

                {/* Visualizador de Estratigrafía de Impresión */}
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Icon name="layers" className="text-xs" /> Build Schedule Summary
                    </h3>
                    
                    <div className="relative h-[320px] flex items-stretch gap-4 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                        
                        {/* Regla de Altura (Eje Z) */}
                        <div className="w-8 relative border-r border-slate-200 dark:border-slate-700">
                            <span className="absolute top-0 right-2 text-[8px] font-mono text-slate-400 -translate-y-1/2">{maxZ.toFixed(1)}</span>
                            <span className="absolute bottom-0 right-2 text-[8px] font-mono text-slate-400 translate-y-1/2">0.0</span>
                            <div className="absolute inset-y-0 right-0 w-1 bg-slate-100 dark:bg-slate-800" />
                        </div>

                        {/* Columna de Composición Geométrica */}
                        <div className="w-12 relative group">
                            {/* 1. REPRESENTACIÓN DEL MODELO BASE (Default FDM Segment) */}
                            <div 
                                className="absolute bottom-0 left-0 w-full bg-[#14b8a6] border-x border-white/10 z-0"
                                style={{ height: `${(modelMaxZ / maxZ) * 100}%` }}
                                title="Default FDM Volume"
                            />

                            {/* 2. OVERLAY DE ZONAS CONFIGURADAS */}
                            {zZones.map(zone => {
                                const bottomPct = (zone.zStartMm / maxZ) * 100;
                                const heightPct = ((zone.zEndMm - zone.zStartMm) / maxZ) * 100;
                                
                                const hasUV = zone.processEvent && (zone.processEvent.uvExposureTimeSec ?? 0) > 0;
                                const isSingleLayerUV = (zone.zEndMm - zone.zStartMm) <= (layerHeightMm + 0.01) || zone.processEvent?.trigger === 'after_segment';
                                
                                const tool = zone.featureOverride?.toolhead || 'fdm';
                                // COLORES SOLIDOS: Syringe (Amber), FDM (Turquoise), UV (Purple)
                                const toolColor = tool === 'syringe' ? '#f59e0b' : tool === 'uv' ? '#a855f7' : '#14b8a6';

                                return (
                                    <React.Fragment key={`zone-ui-${zone.id}`}>
                                        {/* Bloque de Herramienta - COLOR SÓLIDO SIN TEXTO */}
                                        <div 
                                            className="absolute left-0 w-full border-y-[1.5px] border-white/40 z-10"
                                            style={{ 
                                                bottom: `${bottomPct}%`, 
                                                height: `${Math.max(heightPct, 0.5)}%`, 
                                                backgroundColor: toolColor,
                                            }}
                                        />

                                        {/* Indicador UV - SÓLIDO, SIN GLOW */}
                                        {hasUV && (
                                            isSingleLayerUV ? (
                                                /* Línea horizontal nítida en el tope de la zona o centro si es capa única */
                                                <div 
                                                    className="absolute -left-1 w-14 h-[3px] bg-[#a855f7] z-30 border border-white/20"
                                                    style={{ bottom: `${zone.processEvent?.trigger === 'after_segment' ? (zone.zEndMm / maxZ) * 100 : (bottomPct + heightPct/2)}%`, transform: 'translateY(50%)' }}
                                                />
                                            ) : (
                                                /* Barrido lateral sólido */
                                                <div 
                                                    className="absolute -right-2 w-1.5 bg-[#a855f7] z-20 border border-white/10"
                                                    style={{ 
                                                        bottom: `${bottomPct}%`, 
                                                        height: `${heightPct}%`,
                                                    }}
                                                />
                                            )
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>

                        {/* Panel de Detalles Alineado */}
                        <div className="flex-1 relative">
                            {zZones.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                                            Base Profile Active
                                        </p>
                                        <p className="text-[8px] text-slate-400 font-mono">T0 - FDM • Standard</p>
                                    </div>
                                </div>
                            )}
                            {zZones.map(zone => {
                                const bottomPct = (zone.zStartMm / maxZ) * 100;
                                const heightPct = ((zone.zEndMm - zone.zStartMm) / maxZ) * 100;
                                const tool = zone.featureOverride?.toolhead || 'fdm';
                                const hasUV = zone.processEvent && (zone.processEvent.uvExposureTimeSec ?? 0) > 0;

                                return (
                                    <div 
                                        key={`label-${zone.id}`}
                                        className="absolute left-0 w-full flex items-center gap-2 group"
                                        style={{ bottom: `${bottomPct + heightPct/2}%`, transform: 'translateY(50%)' }}
                                    >
                                        <div className="h-[1px] w-3 bg-slate-300 dark:bg-slate-700" />
                                        <div className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 shadow-sm transition-colors">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="text-[9px] font-black text-slate-600 dark:text-slate-200 truncate">{zone.label || 'Segment'}</span>
                                                <span className="text-[8px] font-mono text-primary font-bold">{zone.zStartMm}-{zone.zEndMm}mm</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                <span className={`text-[7px] font-bold px-1 rounded-sm uppercase ${tool === 'syringe' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}>
                                                    {tool}
                                                </span>
                                                {hasUV && (
                                                    <span className="text-[7px] font-bold px-1 rounded-sm bg-purple-100 text-purple-700 uppercase">
                                                        UV {zone.processEvent!.uvExposureTimeSec}s
                                                    </span>
                                                )}
                                                {zone.parameterOverride?.fdm?.infillPercent !== undefined && (
                                                    <span className="text-[7px] font-bold px-1 rounded-sm bg-slate-100 text-slate-500">
                                                        {zone.parameterOverride.fdm.infillPercent}% INF
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 text-center animate-pulse">
                    <p className="text-[10px] text-primary font-black uppercase tracking-widest">
                        Configuration Locked • Ready to Slice
                    </p>
                </div>
            </div>
            );
        })()}

      </div>

      {/* VALIDATION MESSAGE */}
      {validationError && (
        <div className="mx-3 mb-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <Icon name="warning" className="text-red-500 text-sm flex-shrink-0" />
          <span className="text-[11px] text-red-700 dark:text-red-400 font-medium">{validationError}</span>
        </div>
      )}

      {/* STEPPER WIZARD FOOTER */}
      <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-surface-dark flex items-center justify-between z-10 flex-shrink-0 gap-2">
          <button 
             disabled={activeStep === 1}
             onClick={() => {
               setValidationError(null);
               setActiveStep(activeStep - 1);
             }}
             className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[11px] rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1.5"
          >
              <Icon name="arrow_back" className="text-[12px]" /> Back
          </button>

          {/* Step indicator pills */}
          <div className="flex items-center gap-1">
            {[1,2,3,4,5,6].map(s => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                s === activeStep ? 'w-4 bg-primary' : s < activeStep ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-slate-200 dark:bg-slate-700'
              }`} />
            ))}
          </div>

          {activeStep < 6 ? (
              <button 
                 onClick={() => {
                    if (activeStep === 1) {
                      const hasTool = toolheads.some(t => t.slot !== undefined);
                      if (!hasTool) {
                        setValidationError("Assign at least one toolhead to a machine slot to continue.");
                        return;
                      }
                    }
                    if (activeStep === 2) {
                      if (models.length === 0) {
                        setValidationError("Load at least one model before proceeding.");
                        return;
                      }
                    }
                    setValidationError(null);
                    setActiveStep(activeStep === 6 ? 6 : activeStep + 1);
                 }}
                 className="px-4 py-1.5 bg-primary hover:bg-primary-dark text-white font-medium text-[11px] rounded-md transition-colors flex items-center gap-1.5"
              >
                  Next <Icon name="arrow_forward" className="text-[12px]" />
              </button>
          ) : (
              <button
                onClick={() => {
                  if (hasGCode && onPrint) {
                    onPrint();
                  } else if (!isSlicing) {
                    onSlice();
                  }
                }}
                className={`flex-1 py-1.5 px-4 text-[11px] font-medium rounded-md transition-all flex items-center justify-center gap-2 overflow-hidden relative ${
                  hasGCode
                    ? 'bg-primary hover:bg-primary-dark text-white'
                    : isSlicing
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-primary hover:bg-primary-dark text-white'
                }`}
              >
                {isSlicing && (
                  <div
                    className="absolute left-0 top-0 h-full bg-black/10 transition-all duration-300"
                    style={{ width: `${Math.round(slicePercent * 100)}%` }}
                  />
                )}
                <span className="relative z-10">
                  {hasGCode
                    ? 'Execute print'
                    : isSlicing
                      ? `Slicing… ${Math.round(slicePercent * 100)}%`
                      : 'Build'}
                </span>
                {!isSlicing && <Icon name={hasGCode ? 'play_arrow' : 'build'} className="text-[13px] relative z-10" />}
              </button>
          )}
      </div>

      {cloneWellDialogFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-hidden" onClick={() => setCloneWellDialogFor(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-[500px] flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Clone Model</h3>
              <button onClick={() => setCloneWellDialogFor(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-red-500 transition-colors">
                <Icon name="close" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
              <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">
                Select the target wells to distribute clones of the selected model. Each clone will automatically inherit all transformation, setting patterns, and feature overrides.
              </p>
              
              <div className="flex flex-col gap-2 relative bg-surface-container dark:bg-slate-800/50 p-4 border border-border-light dark:border-slate-700 rounded-xl shadow-inner">
                {(() => {
                  const format = globalSettings.printBed?.multiwellFormat ?? 24;
                  const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                  if (!spec) return null;
                  const baseModelWell = cloneWellDialogFor 
                    ? models.find(m => m.id === cloneWellDialogFor)?.transform.wellAssignment?.wellId 
                    : undefined;
                    
                  const occupiedWells = new Set(models
                    .map(m => m.transform.wellAssignment?.wellId)
                    .filter(w => w && w !== baseModelWell) as string[]);

                  const rows = [];
                  for (let r = 0; r < spec.rows; r++) {
                    const cols = [];
                    for (let c = 0; c < spec.cols; c++) {
                      const wellId = String.fromCharCode(65 + r) + (c + 1);
                      const isSelected = selectedCloneWells.has(wellId);
                      const isOccupied = occupiedWells.has(wellId);
                      
                      cols.push(
                        <button
                          key={wellId}
                          disabled={isOccupied}
                          title={isOccupied ? "Well already occupied by another model" : undefined}
                          onClick={() => {
                            if (isOccupied) return;
                            setSelectedCloneWells(prev => {
                              const next = new Set(prev);
                              if (next.has(wellId)) next.delete(wellId);
                              else next.add(wellId);
                              return next;
                            });
                          }}
                          className={`
                            relative ${spec.cols > 6 ? 'w-8 h-8 text-[8px]' : 'w-10 h-10 text-[10px]'} rounded-full border-2 transition-all flex items-center justify-center font-bold
                            ${isOccupied
                                ? 'bg-slate-200 border-slate-300 text-slate-400 dark:bg-slate-700/50 dark:border-slate-700 dark:text-slate-500 cursor-not-allowed opacity-60'
                                : isSelected 
                                  ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(22,163,74,0.2)] scale-110' 
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 hover:border-primary/50 hover:text-primary hover:scale-[1.05]'
                            }
                          `}
                        >
                          {wellId}
                        </button>
                      );
                    }
                    rows.push(<div key={r} className="flex gap-2 justify-center">{cols}</div>);
                  }
                  return rows;
                })()}
              </div>

              <div className="mt-4 flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md uppercase tracking-wider">
                  <span className="text-primary">{selectedCloneWells.size}</span> wells selected
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const format = globalSettings.printBed?.multiwellFormat ?? 24;
                      const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                      const all = new Set<string>();
                      const baseModelWell = cloneWellDialogFor 
                        ? models.find(m => m.id === cloneWellDialogFor)?.transform.wellAssignment?.wellId 
                        : undefined;
                      const occupiedWells = new Set(models
                        .map(m => m.transform.wellAssignment?.wellId)
                        .filter(w => w && w !== baseModelWell) as string[]);
                      
                      for (let r = 0; r < spec.rows; r++) {
                        for (let c = 0; c < spec.cols; c++) {
                          const w = String.fromCharCode(65 + r) + (c + 1);
                          if (!occupiedWells.has(w)) all.add(w);
                        }
                      }
                      setSelectedCloneWells(all);
                    }}
                    className="text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary-dark transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button 
                    onClick={() => setSelectedCloneWells(new Set())}
                    className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setCloneWellDialogFor(null)} 
                className="px-4 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-widest rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (onCloneToWells && cloneWellDialogFor) {
                    const format = globalSettings.printBed?.multiwellFormat ?? 24;
                    onCloneToWells(cloneWellDialogFor, Array.from(selectedCloneWells), format as 6 | 12 | 24 | 48);
                    setCloneWellDialogFor(null);
                  }
                }} 
                className="px-4 py-1.5 text-[11px] text-white bg-primary font-bold uppercase tracking-widest rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed shadow-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
};
