import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SliceSegment, ToolheadConfig, LayerAction, ToolheadId, ScaffoldToolMapping, FDMToolheadConfig, SyringeToolheadConfig, UVToolheadConfig } from '../../types';
import { HelpTopic } from '../HelpWiki/HelpWiki';

import { generateUUID } from '../../utils';
import { generateCubeStl, generateCylinderStl } from '../../shapeGenerators';
import { ToolheadBadge, ToolheadSelect, LayerActionRow, SCAFFOLD_FEATURE_META, DEFAULT_SCAFFOLD_TOOLS } from '../ToolheadPanel/ToolheadPanel';
import { TOOLHEAD_COLORS } from '../Viewport/Viewport';

// Multiwell plate specifications
const MULTIWELL_SPECS = {
  '6': { cols: 3, rows: 2, pitch: 39.1, dia: 34.8 },
  '12': { cols: 4, rows: 3, pitch: 26.1, dia: 22.1 },
  '24': { cols: 6, rows: 4, pitch: 19.3, dia: 15.62 },
  '48': { cols: 8, rows: 6, pitch: 13.0, dia: 11.0 },
};

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
  isAdvancedSliceMode: boolean;
  onFileUpload: (file: File, isCube?: boolean) => void;
  setIsAdvancedSliceMode: (val: boolean) => void;
  onSlice: () => void;
  // Toolhead props
  toolheads: ToolheadConfig[];
  layerActions: LayerAction[];
  totalLayers: number;
  onUpdateToolheads: (toolheads: ToolheadConfig[]) => void;
  onUpdateLayerActions: (actions: LayerAction[]) => void;
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
    toolheads, layerActions, totalLayers, onUpdateToolheads, onUpdateLayerActions,
    isSlicing, slicePercent = 0, sliceMessage = '', hasGCode, onPrint, jobId,
    activeStep, setActiveStep, onOpenHelp
  } = props;

  const [newToolhead, setNewToolhead] = useState<ToolheadId>('fdm');
  
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
  });

  const [toolheadSettingsOpen, setToolheadSettingsOpen] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [heating, setHeating] = useState({
    temp: 60
  });

  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());

  const toggleModelExpand = (id: string) => {
    setExpandedModels(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedModel = models.find(m => m.id === selectedModelId);

  // Sync advanced mode state with accordion state
  useEffect(() => {
    if (selectedModelId) {
      setIsAdvancedSliceMode(!!selectedModelId);
    } else {
      setIsAdvancedSliceMode(false);
    }
  }, [selectedModelId, setIsAdvancedSliceMode]);


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

  const inputClass = "w-32";
  return (
    <aside className="w-[420px] flex-shrink-0 bg-surface-light border-r border-border-light flex flex-col z-10 transition-all duration-300">


      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-2 pb-2">

        {activeStep === 2 && (
          <div className="space-y-2 animate-in fade-in slide-in-from-left-1">
        {/* Upload Button */}
        <div className="mb-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".stl"
            multiple
            className="hidden"
          />
          <button
            onClick={handleUploadClick}
            className="w-full py-3 bg-primary/90 hover:bg-primary text-white text-[11px] font-black uppercase tracking-widest transition-colors btn-transition flex items-center justify-center gap-2"
          >
            <Icon name="upload_file" className="text-base" />
            LOAD FILES
          </button>
        </div>

        {/* Models List */}
        <AccordionSection
          title="Models"
          isOpen={openSections.models}
          onToggle={() => toggleSection('models')}
        >
          <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
             {models.map(model => {
               const thId = model.toolhead || 'none';
               const thColor = TOOLHEAD_COLORS[thId] || TOOLHEAD_COLORS.none;
               const thLabel = TOOLHEAD_LABELS[thId] || '';
               return (
                 <div
                   key={model.id}
                   onClick={() => onSelectModel(model.id)}
                   className={`flex items-center justify-between py-1 px-2 rounded-md border cursor-pointer transition-all group select-none ${selectedModelId === model.id
                      ? 'border-action bg-action text-white shadow-sm'
                     : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'}
                   `}
                 >
                   <div className="flex items-center gap-2 overflow-hidden">
                     <div
                       className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors"
                       style={{ backgroundColor: selectedModelId === model.id ? 'rgba(255,255,255,0.2)' : thColor + '22' }}
                     >
                       <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: thColor }} />
                     </div>
                     <span className="text-xs font-medium truncate" title={model.name}>{model.name}</span>
                     {thLabel && (
                       <span
                         className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 ${selectedModelId === model.id ? 'bg-white/20 text-white' : ''}`}
                         style={selectedModelId !== model.id ? { backgroundColor: thColor + '22', color: thColor } : {}}
                       >
                         {thLabel}
                       </span>
                     )}
                   </div>
                   
                    {/* Well Assignment UI (only for multiwell plate) */}
                    {globalSettings.printBed?.type === 'multiwell_plate' && (
                      <div className="flex items-baseline gap-1 text-[9px] ml-1">
                        <select
                          value={model.transform.wellAssignment?.wellId ?? 'none'}
                          onChange={(e) => {
                            const wellId = e.target.value;
                            if (wellId === 'none') {
                              onUpdateModel(model.id, { 
                                transform: { 
                                  ...model.transform, 
                                  wellAssignment: undefined 
                                } 
                              });
                            } else {
                            // When assigning to a well, reset Z position (height) to 0 so model sits on bed
                            onUpdateModel(model.id, { 
                              transform: { 
                                ...model.transform, 
                                position: { ...model.transform.position, z: 0 },
                                wellAssignment: { 
                                  format: (globalSettings.printBed?.multiwellFormat ?? 24) as 6 | 12 | 24 | 48, 
                                  wellId 
                                } 
                              } 
                            });
                            }
                          }}
                          className="w-[55px] bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-[10px] font-mono text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="none">â€”</option>
                         {[6, 12, 24, 48].includes(globalSettings.printBed?.multiwellFormat ?? 24) 
                           ? (() => {
                               const format = globalSettings.printBed?.multiwellFormat ?? 24;
                               const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                               const wells = [];
                               for (let r = 0; r < spec.rows; r++) {
                                 for (let c = 0; c < spec.cols; c++) {
                                   const wellId = String.fromCharCode(65 + r) + (c + 1);
                                   wells.push(<option key={wellId}>{wellId}</option>);
                                 }
                               }
                               return wells;
                             })()
                           : []
                         }
                       </select>
                     </div>
                   )}
                   
                   <button
                     onClick={(e) => { e.stopPropagation(); onDeleteModel(model.id); }}
                     className={`p-1 rounded transition-all focus:opacity-100 ${selectedModelId === model.id
                       ? 'opacity-100 text-white/70 hover:text-white hover:bg-white/20'
                       : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                     }`}
                     title="Remove model"
                   >
                     <Icon name="close" className="text-sm" />
                   </button>
                 </div>
               );
             })}
            {models.length === 0 && (
              <div className="text-center p-8 bg-slate-50 border border-outline-variant/10">
                <span className="text-slate-300 text-[9px] font-black uppercase tracking-widest">Models_Null</span>
              </div>
            )}
          </div>
        </AccordionSection>
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
                      <div key={slotIndex} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-bold text-slate-500 uppercase">Slot {slotIndex + 1}</span>
                          {assignedTool && (
                            <button 
                              onClick={() => onUpdateToolheads(toolheads.map(t => t.id === assignedTool.id ? { ...t, slot: undefined } : t))}
                              className="text-[8px] text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        
                        <select
                          value={assignedTool?.id || ''}
                          onChange={e => {
                            const toolId = e.target.value;
                            if (toolId) {
                              // Find the tool being moved
                              const toolToAssign = toolheads.find(t => t.id === toolId);
                              if (toolToAssign) {
                                // Remove from current slot if any, then assign to new slot
                                onUpdateToolheads(toolheads.map(t => {
                                  if (t.id === toolId) return { ...t, slot: slotIndex };
                                  return t;
                                }));
                              }
                            }
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-[10px] font-bold uppercase outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="">-- Empty --</option>
                          {toolheads.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.id === 'fdm' ? 'FDM HEAD' : t.id === 'syringe' ? 'HYDROGEL HEAD' : 'UV HEAD'}
                            </option>
                          ))}
                        </select>
                        
                        {assignedTool && (
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[8px] text-slate-400 uppercase">
                                {assignedTool.id === 'fdm' ? 'FDM Settings' : assignedTool.id === 'syringe' ? 'Hydrogel Settings' : 'UV Settings'}
                              </span>
                              {(assignedTool.id === 'fdm' || assignedTool.id === 'syringe') && (
                                <button
                                  onClick={() => setToolheadSettingsOpen(toolheadSettingsOpen === assignedTool.id ? null : assignedTool.id)}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                                >
                                  <Icon name="settings" className="text-[14px] text-slate-500" />
                                </button>
                              )}
                            </div>
                            
                            {(toolheadSettingsOpen === assignedTool.id || !assignedTool.id) && (
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
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AccordionSection>

              
            </div>
          )}

          {/* TAB 2: SCHEDULE */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-2">
            
            <section className="bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Process Management
                </span>
                <button 
                  onClick={() => onOpenHelp('layer_actions')}
                  className="p-1 hover:bg-white dark:hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-primary"
                  title="Open Layer Wiki"
                >
                  <Icon name="help_outline" className="text-sm" />
                </button>
              </div>

              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  {layerActions.length} SEGMENT{layerActions.length !== 1 ? 'S' : ''} DEFINED
                </span>
                {totalLayers > 0 && (
                  <span className="text-[9px] font-mono text-slate-400">
                    TOTAL: {totalLayers} LAYERS
                  </span>
                )}
              </div>

              {layerActions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/30 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                  <Icon name="layers" className="text-4xl mb-2 opacity-20" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">No Segments Defined</p>
                  <p className="text-[8px] text-slate-400 mt-1">Add segment below</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                  {layerActions.map((action, i) => (
                    <LayerActionRow
                      key={action.id}
                      action={action}
                      totalLayers={totalLayers}
                      models={models}
                      onUpdate={updated => {
                        const next = [...layerActions];
                        next[i] = updated;
                        onUpdateLayerActions(next);
                      }}
                      onDelete={() => onUpdateLayerActions(layerActions.filter((_, idx) => idx !== i))}
                    />
                  ))}
                </div>
              )}

              {/* Add new segment */}
              <div className="bg-white border-2 border-dashed border-outline-variant/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">New Segment</span>
                </div>
                
                {/* Intent selector */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { kind: 'feature_override', label: 'Feature Override', icon: 'swap_horiz' },
                    { kind: 'parameter_override', label: 'Parameter', icon: 'tune' },
                    { kind: 'process_event', label: 'Process Event', icon: 'bolt' },
                  ].map(opt => (
                    <button
                      key={opt.kind}
                      onClick={() => {
                        const last = layerActions[layerActions.length - 1];
                        const from = last ? last.layerTo + 1 : 1;
                        const to = from + 20;
                        onUpdateLayerActions([
                          ...layerActions,
                          {
                            id: generateUUID(),
                            layerFrom: from,
                            layerTo: to,
                            kind: opt.kind as 'feature_override' | 'parameter_override' | 'process_event',
                            targetFeatures: opt.kind === 'feature_override' ? ['all'] : undefined,
                            toolOverride: opt.kind === 'feature_override' ? newToolhead : undefined,
                            label: '',
                            color: '#0d9488',
                          }
                        ]);
                      }}
                      className="flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                    >
                      <Icon name={opt.icon} className="text-lg text-slate-400 group-hover:text-primary" />
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider text-center leading-tight group-hover:text-primary">
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Quick tool selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-slate-400 uppercase font-black tracking-wider flex-shrink-0">Tool:</span>
                  <div className="flex gap-1 flex-1">
                    {(['fdm', 'syringe', 'uv'] as const).map(th => (
                      <button
                        key={th}
                        onClick={() => setNewToolhead(th)}
                        className={`flex-1 text-[8px] font-black py-1.5 rounded border uppercase tracking-wider transition-all ${
                          newToolhead === th
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white border-outline-variant/30 text-slate-400 hover:border-primary/50'
                        }`}
                      >
                        {th === 'fdm' ? 'FDM' : th === 'syringe' ? 'HYDRO' : 'UV'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
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
                    const isScaffold = !!m.scaffoldTools;
                    const scTools = m.scaffoldTools || DEFAULT_SCAFFOLD_TOOLS;
                    const isSelected = selectedModelId === m.id;
                    const thColor = TOOLHEAD_COLORS[m.toolhead || 'fdm'];
                    
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
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer ${isSelected ? 'bg-primary/5' : 'bg-slate-50'}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: thColor + '22' }}
                            >
                              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: thColor }} />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-[11px] font-black uppercase tracking-wider truncate ${isSelected ? 'text-primary' : 'text-slate-700'}`}>
                                {m.name}
                              </p>
                              <p className="text-[9px] text-slate-400">
                                {isScaffold ? 'MULTI-TOOL MAPPING' : 'SINGLE TOOL'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleModelExpand(m.id); }}
                              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors"
                            >
                              <Icon 
                                name={expandedModels.has(m.id) ? "expand_less" : "expand_more"} 
                                className="text-slate-400 group-hover:text-primary transition-colors" 
                              />
                            </button>
                            
                            {/* Single / Multi-tool toggle */}
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isScaffold) {
                                  onUpdateModel(m.id, { scaffoldTools: undefined });
                                }
                              }}
                              className={`text-[8px] font-black px-3 py-1.5 uppercase tracking-widest border transition-all ${
                                !isScaffold 
                                  ? 'bg-primary text-white border-primary shadow-sm' 
                                  : 'bg-white border-outline-variant/30 text-slate-400 hover:border-primary/50 hover:text-primary'
                              }`}
                            >
                              Single
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isScaffold) {
                                  const base = m.toolhead || 'fdm';
                                  onUpdateModel(m.id, {
                                    scaffoldTools: { perimeter: base, infill: base, solidInfill: base, support: base }
                                  });
                                }
                              }}
                              className={`text-[8px] font-black px-3 py-1.5 uppercase tracking-widest border transition-all ${
                                isScaffold 
                                  ? 'bg-primary text-white border-primary shadow-sm' 
                                  : 'bg-white border-outline-variant/30 text-slate-400 hover:border-primary/50 hover:text-primary'
                              }`}
                            >
                              Multi
                            </button>
                          </div>
                        </div>
                      </div>

                        {/* Tool assignment */}
                        {expandedModels.has(m.id) && (
                        <div className="p-4 animate-in fade-in slide-in-from-top-1 duration-200">
                          {!isScaffold ? (
                            <div className="space-y-2">
                              <label className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Toolhead</label>
                              <ToolheadSelect
                                value={m.toolhead || 'fdm'}
                                onChange={v => onUpdateModel(m.id, { toolhead: v })}
                                className="w-full h-9"
                              />
                            </div>
                          ) : (
                            <div className="space-y-2">
                                {SCAFFOLD_FEATURE_META.map(feat => (
                                  <div key={feat.key} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 dark:bg-slate-900/40 dark:border-slate-800">
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">{feat.label}</span>
                                    <ToolheadSelect
                                      value={scTools[feat.key]}
                                      onChange={v => onUpdateModel(m.id, { scaffoldTools: { ...scTools, [feat.key]: v } })}
                                      className="w-32 h-7"
                                    />
                                  </div>
                                ))}

                            </div>
                          )}

                           {/* Base FDM Settings for the model */}
                           <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                             <label className="text-[9px] text-slate-400 uppercase font-black tracking-widest flex items-center gap-2">
                               <Icon name="settings" className="text-xs" /> BASE FDM PROFILE
                             </label>
                             <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                   <span className="text-[10px] text-slate-500 uppercase font-bold">Infill (%)</span>
                                   <div className="h-8">
                                     <NumericInput 
                                       value={m.fdmSettings?.infillPercent ?? globalSettings.infill ?? 15} 
                                       onChange={v => onUpdateModel(m.id, { fdmSettings: { ...m.fdmSettings, infillPercent: v } })} 
                                     />
                                   </div>
                                </div>
                                <div className="space-y-1">
                                   <span className="text-[10px] text-slate-500 uppercase font-bold">Perimeters</span>
                                   <div className="h-8">
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

          {/* TAB 4: SLICING CONFIGURATION */}
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

        {/* STEP 5: PREVIEW & SLICE */}
        {activeStep === 5 && (
            <div className="space-y-4 overflow-y-auto max-h-full pb-20">
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Global Settings</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                        <div className="flex justify-between"><span className="text-slate-400">Layer Height:</span><span className="font-mono">{globalSettings.layerHeight || 0.2}mm</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Infill:</span><span className="font-mono">{globalSettings.infill || 15}%</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Nozzle:</span><span className="font-mono">{globalSettings.nozzleDiameter || 0.4}mm</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Temperature:</span><span className="font-mono">{globalSettings.temperature || 210}°C</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Bed Temp:</span><span className="font-mono">{globalSettings.bedTemperature || 60}°C</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Perimeters:</span><span className="font-mono">{globalSettings.perimeters || 3}</span></div>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Print Bed</h3>
                    <div className="text-[10px] space-y-1">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Type:</span>
                            <span className="font-mono capitalize">{globalSettings.printBed?.type?.replace('_', ' ') || 'glass_bed'}</span>
                        </div>
                        {globalSettings.printBed?.type === 'glass_bed' && (
                            <div className="flex justify-between">
                                <span className="text-slate-400">Size:</span>
                                <span className="font-mono">{globalSettings.printBed?.dimensions?.width || 100}x{globalSettings.printBed?.dimensions?.height || 100}mm</span>
                            </div>
                        )}
                        {globalSettings.printBed?.type === 'multiwell_plate' && (
                            <div className="flex justify-between">
                                <span className="text-slate-400">Format:</span>
                                <span className="font-mono">{globalSettings.printBed?.multiwellFormat || 24} Wells</span>
                            </div>
                        )}
                        {globalSettings.printBed?.type === 'petri_dish' && (
                            <div className="flex justify-between">
                                <span className="text-slate-400">Diameter:</span>
                                <span className="font-mono">{globalSettings.printBed?.petriDiameter || 60}mm</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Models ({models.length})</h3>
                    {models.map(m => (
                        <div key={m.id} className="border-b border-slate-100 dark:border-slate-800 py-2 last:border-0">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{m.name}</span>
                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold uppercase">{m.toolhead || 'fdm'}</span>
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono">
                                {(m.size?.x || 0).toFixed(1)}x{(m.size?.y || 0).toFixed(1)}x{(m.size?.z || 0).toFixed(1)}mm
                                {m.wellAssignment && ` → Well ${m.wellAssignment.wellId}`}
                            </div>
                        </div>
                    ))}
                    {models.length === 0 && <p className="text-[10px] text-slate-400">No models loaded</p>}
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Layer Schedule ({layerActions.length} actions)</h3>
                    {layerActions.length > 0 ? (
                        <div className="space-y-2">
                            {layerActions.map((action, i) => (
                                <div key={action.id || i} className="flex items-center justify-between text-[10px]">
                                    <div className="flex items-center gap-2">
                                        <span className="w-14 font-mono text-slate-500">L{action.layerFrom}-{action.layerTo}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${(action.toolOverride || 'fdm') === 'syringe' ? 'bg-slate-200 dark:bg-slate-700' : (action.toolOverride || 'fdm') === 'uv' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                                            {action.toolOverride || 'fdm'}
                                        </span>
                                    </div>
                                    {action.label && <span className="text-slate-400 truncate max-w-[80px]">{action.label}</span>}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[10px] text-slate-400">No layer schedule defined</p>
                    )}
                </div>

                {layerActions.length > 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-slate-500">Total layers: <span className="font-mono font-bold">{Math.max(...layerActions.map(a => a.layerTo), 0)}</span></p>
                    </div>
                )}
            </div>
        )}

      </div>

      {/* STEPPER WIZARD FOOTER */}
      <div className="p-4 border-t border-border-light bg-surface-container-low flex items-center justify-between z-10 flex-shrink-0">
          <button 
             disabled={activeStep === 1}
             onClick={() => setActiveStep(s => s - 1)}
             className="px-4 py-2 bg-white border border-outline-variant/30 font-bold text-xs uppercase tracking-tight disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-2"
          >
              <Icon name="arrow_back" className="text-sm" /> BACK
          </button>
          
          {activeStep < 5 ? (
              <button 
                 onClick={() => setActiveStep(s => s + 1)}
                 className="px-6 py-2 bg-primary hover:bg-primary-dark text-white font-bold text-xs shadow-none transition-colors uppercase tracking-widest flex items-center gap-2"
              >
                  NEXT <Icon name="arrow_forward" className="text-sm" />
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
                className={`flex-1 ml-4 py-2 px-4 text-xs font-bold transition-all uppercase tracking-widest flex items-center justify-center gap-2 overflow-hidden relative shadow-none ${hasGCode
                  ? 'bg-[#1e4620] hover:bg-[#153418] text-white'
                  : isSlicing
                    ? 'bg-slate-200 text-slate-400 cursor-wait'
                    : 'bg-red-500 hover:bg-red-600 text-white'
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
                    ? 'EXECUTE PRINT'
                    : isSlicing
                      ? `SLICING... ${Math.round(slicePercent * 100)}%`
                      : 'BUILD'}
                </span>
              </button>
          )}
      </div>
    </aside>
  );
};
