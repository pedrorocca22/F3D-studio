import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SliceSegment, ToolheadConfig, LayerAction, ToolheadId, ScaffoldToolMapping, FDMToolheadConfig, SyringeToolheadConfig, UVToolheadConfig } from '../../types';

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
    activeStep, setActiveStep
  } = props;

  const [newToolhead, setNewToolhead] = useState<ToolheadId>('fdm');
  
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    printBed: true,
    models: false,
    fffQuality: false,
    fffShell: false,
    fffSpeeds: false,
    fffAdhesion: false,
    fffMaterial: false,
    fffCooling: false,
    toolheads: false,
    heatingBed: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [heating, setHeating] = useState({
    temp: 60
  });

  const selectedModel = models.find(m => m.id === selectedModelId);

  // Sync advanced mode state with accordion state
  useEffect(() => {
    if (selectedModelId) {
      setIsAdvancedSliceMode(openSections.advanceSlice);
    } else {
      setIsAdvancedSliceMode(false);
    }
  }, [openSections.advanceSlice, selectedModelId, setIsAdvancedSliceMode]);


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

  const updateAdvancedSettings = (newSettings: AdvancedSliceSettings) => {
    if (!selectedModel) return;
    onUpdateAdvancedSettings(newSettings);
  };

  const addSegment = () => {
    const segments = [...advancedSettings.segments];
    const adhesionOffset = (globalSettings.adhesion?.enabled)
      ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000
      : 0;
    const modelZHeight = selectedModel?.size?.y ?? 0;
    const modelTop = modelZHeight > 0 ? modelZHeight : 10;

    if (segments.length === 0) {
      const newSegment: SliceSegment = {
        id: generateUUID(),
        topLimit: modelTop,
        exposureTime: 2.5,
        lightIntensity: 15
      };
      updateAdvancedSettings({ ...advancedSettings, segments: [newSegment] });
    } else {
      const lastSegment = segments[segments.length - 1];
      const currentTop = lastSegment.topLimit;

      if (modelTop - currentTop > 0.05) {
        const newSegment: SliceSegment = {
          id: generateUUID(),
          topLimit: modelTop,
          exposureTime: lastSegment.exposureTime,
          lightIntensity: lastSegment.lightIntensity,
          gradientMode: 'flat'
        };
        updateAdvancedSettings({ ...advancedSettings, segments: [...segments, newSegment] });
      } else {
        const prevStart = segments.length > 1
          ? segments[segments.length - 2].topLimit
          : adhesionOffset;
        const midpoint = prevStart + (currentTop - prevStart) / 2;
        const splitPoint = Math.round(midpoint * 1000) / 1000;
        segments[segments.length - 1] = {
          ...lastSegment,
          topLimit: splitPoint
        };
        const newSegment: SliceSegment = {
          id: generateUUID(),
          topLimit: currentTop,
          exposureTime: lastSegment.exposureTime,
          lightIntensity: lastSegment.lightIntensity,
          gradientMode: 'flat'
        };
        updateAdvancedSettings({ ...advancedSettings, segments: [...segments, newSegment] });
      }
    }
  };

  const removeSegment = (index: number) => {
    const newSegments = [...advancedSettings.segments];
    newSegments.splice(index, 1);
    updateAdvancedSettings({ ...advancedSettings, segments: newSegments });
  };

  const updateSegment = (index: number, field: keyof SliceSegment, value: any) => {
    console.log(`[LayersPanel] Updating Segment ${index} Field: ${field} Value:`, value);
    const newSegments = [...advancedSettings.segments];
    const segment = { ...newSegments[index], [field]: value };

    if (field === 'topLimit') {
      const prevTop = index > 0 ? newSegments[index - 1].topLimit : 0;
      if (value <= prevTop) value = prevTop + 0.1;
      const nextTop = index < newSegments.length - 1 ? newSegments[index + 1].topLimit : Infinity;
      if (value >= nextTop) value = nextTop - 0.1;
    }

    if (field === 'gradientMode' && value === 'gradient') {
      if (segment.endLightIntensity === undefined) segment.endLightIntensity = segment.lightIntensity;
      if (segment.endExposureTime === undefined) segment.endExposureTime = segment.exposureTime;
      if (segment.endTargetDose === undefined) segment.endTargetDose = segment.targetDose;
    }

    newSegments[index] = { ...segment, [field]: value };
    console.log(`[LayersPanel] New Segments State:`, newSegments);
    updateAdvancedSettings({ ...advancedSettings, segments: newSegments });
  };

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
    <aside className="w-[300px] flex-shrink-0 bg-surface-light border-r border-border-light flex flex-col z-10 transition-all duration-300">


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
            <div className="space-y-0 animate-in fade-in slide-in-from-left-1">
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
                <div className="grid grid-cols-2 gap-3 items-center">
                  <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Bed Surface Temp (°C):</span>
                  <NumericInput className="w-full" value={globalSettings.bedTemperature ?? 60} onChange={v => onUpdateGlobalSettings({ ...globalSettings, bedTemperature: v })} step={0.5} />
                </div>
              </AccordionSection>

              <AccordionSection title="Toolhead" isOpen={openSections.toolheads} onToggle={() => toggleSection('toolheads')}>
                <div className="space-y-4">
                  {toolheads.map(th => (
                    <div key={th.id} className="bg-slate-50 border border-outline-variant/10 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                          {th.id === 'fdm' ? 'FDM head' : th.id === 'syringe' ? 'Hydrogel head' : 'UV head'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 font-mono italic opacity-50">{th.klipper_tool}</span>
                      </div>
                      
                      {th.id === 'fdm' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] text-slate-400 uppercase font-bold">Nozzle (mm)</label>
                            <NumericInput value={(th as FDMToolheadConfig).nozzleDiameter} onChange={v => {
                              onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, nozzleDiameter: v } : t));
                              onUpdateGlobalSettings({ ...globalSettings, nozzleDiameter: v });
                            }} step={0.05} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-slate-400 uppercase font-bold">Temp (°C)</label>
                            <NumericInput value={(th as FDMToolheadConfig).defaultTemperature} onChange={v => {
                              onUpdateToolheads(toolheads.map(t => t.id === 'fdm' ? { ...t, defaultTemperature: v } : t));
                              onUpdateGlobalSettings({ ...globalSettings, nozzleTemperature: v });
                            }} step={5} />
                          </div>
                        </div>
                      )}

                      {th.id === 'syringe' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] text-slate-400 uppercase font-bold">Needle (mm)</label>
                            <NumericInput value={(th as SyringeToolheadConfig).nozzleDiameterMm} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'syringe' ? { ...t, nozzleDiameterMm: v } : t))} step={0.01} />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-slate-400 uppercase font-bold">Syringe (mL)</label>
                            <NumericInput value={(th as SyringeToolheadConfig).syringeVolumeMl} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'syringe' ? { ...t, syringeVolumeMl: v } : t))} />
                          </div>
                        </div>
                      )}

                      {th.id === 'uv' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] text-slate-400 uppercase font-bold">Wavelength (nm)</label>
                            <select 
                              value={(th as UVToolheadConfig).wavelengthNm}
                              onChange={e => onUpdateToolheads(toolheads.map(t => t.id === 'uv' ? { ...t, wavelengthNm: +e.target.value as any } : t))}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                            >
                              <option value={365}>365 nm</option>
                              <option value={385}>385 nm</option>
                              <option value={405}>405 nm</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] text-slate-400 uppercase font-bold">Max Power (mW)</label>
                            <NumericInput value={(th as UVToolheadConfig).maxPowerMw} onChange={v => onUpdateToolheads(toolheads.map(t => t.id === 'uv' ? { ...t, maxPowerMw: v } : t))} />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionSection>

              <AccordionSection title="Material & Extrusion" isOpen={openSections.fffMaterial} onToggle={() => toggleSection('fffMaterial')}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Flow Rate (%):</span>
                    <NumericInput className="w-full" value={(globalSettings.extrusionMultiplier || 1.0) * 100} onChange={v => onUpdateGlobalSettings({ ...globalSettings, extrusionMultiplier: v / 100 })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-400 uppercase font-bold">Retract (mm)</span>
                      <NumericInput value={globalSettings.retractionLength || 1.0} onChange={v => onUpdateGlobalSettings({ ...globalSettings, retractionLength: v })} step={0.1} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-slate-400 uppercase font-bold">Retract Speed</span>
                      <NumericInput value={globalSettings.retractionSpeed || 45} onChange={v => onUpdateGlobalSettings({ ...globalSettings, retractionSpeed: v })} />
                    </div>
                  </div>
                </div>
              </AccordionSection>
            </div>
          )}

          {/* TAB 2: SCHEDULE */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
              <div className="w-full h-px bg-outline-variant/10" />

              {layerActions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/30 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                  <Icon name="event_note" className="text-4xl mb-2 opacity-20" />
                  <p className="text-xs font-bold uppercase tracking-wider">No Actions defined</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                  {layerActions.map((action, i) => (
                    <LayerActionRow
                      key={action.id}
                      action={action}
                      totalLayers={totalLayers}
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

              <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <select
                  value={newToolhead}
                  onChange={e => setNewToolhead(e.target.value as ToolheadId)}
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-xs font-bold"
                >
                  <option value="fdm">FDM HEAD</option>
                  <option value="syringe">HYDROGEL HEAD</option>
                  <option value="uv">UV HEAD</option>
                </select>
                <button
                  onClick={() => {
                    const last = layerActions[layerActions.length - 1];
                    onUpdateLayerActions([...layerActions, {
                      id: generateUUID(),
                      layerFrom: last ? last.layerTo + 1 : 1,
                      layerTo: (last ? last.layerTo : 0) + 20,
                      toolhead: newToolhead,
                      label: '',
                      color: '#0d9488',
                    }]);
                  }}
                  className="flex items-center justify-center gap-1 px-3 py-1.5 bg-action text-white text-[10px] font-bold rounded uppercase whitespace-nowrap"
                >
                  <Icon name="add" className="text-sm" /> Add Segment
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: MAPPING */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
              <div className="space-y-3">
                {models.map(m => {
                  const isScaffold = !!m.scaffoldTools;
                  const scTools = m.scaffoldTools || DEFAULT_SCAFFOLD_TOOLS;
                  const isSelected = selectedModelId === m.id;
                  
                  return (
                    <div 
                      key={m.id} 
                      onClick={() => onSelectModel(m.id)}
                      className={`bg-white border transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-primary ring-1 ring-primary/20 shadow-none' 
                          : 'border-outline-variant/20 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className={`flex items-center justify-between p-3 ${
                        isSelected ? 'bg-primary/5' : 'bg-slate-50'
                      }`}>
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className={`w-1.5 h-1.5 ${isSelected ? 'bg-primary' : 'bg-slate-300'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest truncate pr-2 ${isSelected ? 'text-primary' : 'text-slate-600'}`}>
                            {m.name}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateModel(m.id, { 
                              scaffoldTools: isScaffold ? undefined : { ...DEFAULT_SCAFFOLD_TOOLS, perimeter: m.toolhead || 'fdm' } 
                            });
                          }}
                          className={`text-[8px] font-black px-2 py-0.5 border uppercase tracking-widest transition-all ${
                            isScaffold ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant/30 text-slate-400'
                          }`}
                        >
                          {isScaffold ? 'SCAFFOLD_LINKED' : 'SINGLE_TOOL'}
                        </button>
                      </div>

                      <div className="p-3">
                        {!isScaffold ? (
                          <ToolheadSelect
                            value={m.toolhead || 'fdm'}
                            onChange={v => onUpdateModel(m.id, { toolhead: v })}
                            className="w-full h-8"
                          />
                        ) : (
                          <div className="space-y-2">
                            {SCAFFOLD_FEATURE_META.map(feat => (
                              <div key={feat.key} className="flex items-center justify-between gap-4">
                                <span className="text-[9px] text-slate-500 uppercase font-bold">{feat.label}</span>
                                <ToolheadSelect
                                  value={scTools[feat.key]}
                                  onChange={v => onUpdateModel(m.id, { scaffoldTools: { ...scTools, [feat.key]: v } })}
                                  className="w-24 h-7"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
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

              <AccordionSection title="Shell & Infill" isOpen={openSections.fffShell} onToggle={() => toggleSection('fffShell')}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Perimeters</span>
                      <NumericInput value={globalSettings.perimeters || 3} onChange={v => onUpdateGlobalSettings({ ...globalSettings, perimeters: v })} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Fill Density (%)</span>
                      <NumericInput value={globalSettings.infill || 15} onChange={v => onUpdateGlobalSettings({ ...globalSettings, infill: v })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Top Layers</span>
                      <NumericInput value={globalSettings.topSolidLayers || 4} onChange={v => onUpdateGlobalSettings({ ...globalSettings, topSolidLayers: v })} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Bottom Layers</span>
                      <NumericInput value={globalSettings.bottomSolidLayers || 4} onChange={v => onUpdateGlobalSettings({ ...globalSettings, bottomSolidLayers: v })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Infill Pattern</span>
                      <select
                        value={globalSettings.infillPattern || 'grid'}
                        onChange={e => onUpdateGlobalSettings({ ...globalSettings, infillPattern: e.target.value as any })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary font-medium"
                      >
                        <option value="rectilinear">Rectilinear</option>
                        <option value="grid">Grid</option>
                        <option value="triangles">Triangles</option>
                        <option value="cubic">Cubic</option>
                        <option value="line">Line</option>
                        <option value="honeycomb">Honeycomb</option>
                        <option value="gyroid">Gyroid</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">Fill Angle (°)</span>
                      <NumericInput 
                        value={globalSettings.fillAngle ?? 0} 
                        onChange={v => onUpdateGlobalSettings({ ...globalSettings, fillAngle: v })} 
                      />
                    </div>
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

              <AccordionSection title="Support & Adhesion" isOpen={openSections.fffAdhesion} onToggle={() => toggleSection('fffAdhesion')}>
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
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${action.toolhead === 'syringe' ? 'bg-slate-200 dark:bg-slate-700' : action.toolhead === 'uv' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                                            {action.toolhead}
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
