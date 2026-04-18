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
    activeStep, setActiveStep, onOpenHelp
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
                        {/* Z-Zone Visual Bar */}
                        {modelZZones.length > 0 && (
                          <div className="px-4 py-1.5 bg-slate-50/50 dark:bg-slate-900/30 border-b border-outline-variant/5">
                            <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full relative w-full overflow-hidden flex items-center shadow-inner">
                              {modelZZones.map((zone, idx) => {
                                const left = (zone.zStartMm / totalHeightMm) * 100;
                                const width = ((zone.zEndMm - zone.zStartMm) / totalHeightMm) * 100;
                                return (
                                  <div 
                                    key={zone.id}
                                    className="absolute h-full opacity-90 flex items-center justify-center overflow-hidden border-r border-white/10 hover:opacity-100 transition-opacity"
                                    style={{ 
                                      left: `${left}%`, 
                                      width: `${width}%`,
                                      backgroundColor: zone.color || '#3b82f6'
                                    }}
                                    title={`${zone.label || 'Zone'} (${zone.zStartMm}-${zone.zEndMm}mm)`}
                                  >
                                    {width > 6 && (
                                      <span className="text-[6px] text-white font-black truncate px-0.5 pointer-events-none">
                                        {seg.label ? seg.label.split(' ').map(w => w[0]).join('').toUpperCase() : `S${idx+1}`}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

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
                isOpen={openSections.zZones} 
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
                    <div key={zone.id} className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-800 pb-2 last:pb-0">
                      <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 border border-white dark:border-slate-900" />
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

                        <div className="pt-1 flex gap-2">
                           <button 
                             onClick={() => handleUpdateZZone(zone.id, { featureOverride: zone.featureOverride ? undefined : { toolhead: 'fdm', targetFeatures: ['all'] } })}
                             className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.featureOverride ? 'bg-primary border-primary text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                           >
                             Tool
                           </button>
                           <button 
                             onClick={() => handleUpdateZZone(zone.id, { parameterOverride: zone.parameterOverride ? undefined : { fdm: {} } })}
                             className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.parameterOverride ? 'bg-primary border-primary text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                           >
                             Param
                           </button>
                           <button 
                             onClick={() => handleUpdateZZone(zone.id, { processEvent: zone.processEvent ? undefined : { uvExposureTimeSec: 5, doseTargetMjCm2: 50, pausePrint: false } })}
                             className={`flex-1 text-[8px] py-1 rounded-md border transition-all font-black uppercase tracking-widest ${zone.processEvent ? 'bg-primary border-primary text-white shadow-sm' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-900'}`}
                           >
                             Event
                           </button>
                        </div>
                        
                        {/* Detail Overrides */}
                        {(zone.featureOverride || zone.parameterOverride || zone.processEvent) && (
                           <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                              {zone.featureOverride && (
                                <div className="space-y-1.5">
                                  <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Assigned Tool</span>
                                  <ToolheadSelect 
                                    className="w-full h-8 text-[10px]"
                                    value={zone.featureOverride.toolhead || 'fdm'}
                                    onChange={v => handleUpdateZZone(zone.id, { featureOverride: { ...zone.featureOverride!, toolhead: v } })}
                                    toolheads={toolheads}
                                  />
                                </div>
                              )}
                              {zone.parameterOverride && (
                                <div className="grid grid-cols-2 gap-3">
                                   <div className="space-y-1">
                                      <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Infill %</span>
                                      <NumericInput 
                                        value={zone.parameterOverride.fdm?.infillPercent ?? 15}
                                        onChange={v => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPercent: v } } })}
                                        className="h-7 text-[10px]"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">Pattern</span>
                                      <select 
                                        className="w-full h-7 rounded border border-slate-200 dark:border-slate-800 text-[10px] bg-slate-50 dark:bg-slate-900 outline-none px-1"
                                        value={zone.parameterOverride.fdm?.infillPattern || 'grid'}
                                        onChange={e => handleUpdateZZone(zone.id, { parameterOverride: { ...zone.parameterOverride!, fdm: { ...(zone.parameterOverride?.fdm || {}), infillPattern: e.target.value as any } } })}
                                      >
                                         <option value="rectilinear">Rectilinear</option>
                                         <option value="grid">Grid</option>
                                         <option value="gyroid">Gyroid</option>
                                         <option value="honeycomb">Honeycomb</option>
                                      </select>
                                   </div>
                                </div>
                              )}
                              {zone.processEvent && (
                                <div className="grid grid-cols-2 gap-3 items-end">
                                   <div className="space-y-1 flex-1">
                                      <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest">UV Time (s)</span>
                                      <NumericInput 
                                        value={zone.processEvent.uvExposureTimeSec || 0}
                                        onChange={v => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, uvExposureTimeSec: v } })}
                                        className="h-7 text-[10px] font-mono"
                                      />
                                   </div>
                                   <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 h-7 px-3 rounded-lg border border-slate-100 dark:border-slate-800">
                                      <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">Pause</span>
                                      <input 
                                        type="checkbox" 
                                        className="accent-primary w-3 h-3"
                                        checked={!!zone.processEvent.pausePrint}
                                        onChange={e => handleUpdateZZone(zone.id, { processEvent: { ...zone.processEvent!, pausePrint: e.target.checked } })}
                                      />
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
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Z-Zones Schedule ({zZones.length} zones)</h3>
                    {zZones.length > 0 ? (
                        <div className="space-y-2">
                            {zZones.sort((a,b) => a.zStartMm - b.zStartMm).map((zone, i) => (
                                <div key={zone.id || i} className="flex items-center justify-between text-[10px]">
                                    <div className="flex items-center gap-2">
                                        <span className="w-16 font-mono text-slate-500">{zone.zStartMm}-{zone.zEndMm}mm</span>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-colors ${(zone.featureOverride?.toolhead || 'fdm') === 'syringe' ? 'bg-slate-200 dark:bg-slate-700' : (zone.featureOverride?.toolhead || 'fdm') === 'uv' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                                            {zone.featureOverride?.toolhead || 'fdm'}
                                        </span>
                                    </div>
                                    <span className="text-slate-400 truncate max-w-[80px]">{zone.label || 'Zone'}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[10px] text-slate-400">No height zones predefined</p>
                    )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-slate-500 uppercase font-black">Ready for slicing</p>
                </div>
            </div>
        )}

      </div>

      {/* VALIDATION MESSAGE */}
      {validationError && (
        <div className="mx-4 mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <Icon name="warning" className="text-red-500 text-sm" />
          <span className="text-[10px] text-red-700 dark:text-red-400 font-bold uppercase tracking-tight">{validationError}</span>
        </div>
      )}

      {/* STEPPER WIZARD FOOTER */}
      <div className="p-4 border-t border-border-light bg-surface-container-low flex items-center justify-between z-10 flex-shrink-0">
          <button 
             disabled={activeStep === 1}
             onClick={() => {
               setValidationError(null);
               setActiveStep(activeStep - 1);
             }}
             className="px-4 py-2 bg-white border border-outline-variant/30 font-bold text-xs uppercase tracking-tight disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-2"
          >
              <Icon name="arrow_back" className="text-sm" /> BACK
          </button>
          
          {activeStep < 5 ? (
              <button 
                 onClick={() => {
                    if (activeStep === 1) {
                      // Validate if at least one toolhead is assigned to a slot
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
                    setActiveStep(activeStep + 1);
                 }}
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
