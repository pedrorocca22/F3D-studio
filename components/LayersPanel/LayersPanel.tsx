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
    isSlicing, slicePercent = 0, sliceMessage = '', hasGCode, onPrint
  } = props;

  const [activeTab, setActiveTab] = useState<'printbed' | 'schedule' | 'mapping' | 'hardware' | 'slicing'>('printbed');
  const [newToolhead, setNewToolhead] = useState<ToolheadId>('fdm');
  
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    models: true,
    fffQuality: true,
    fffShell: false,
    fffSpeeds: false,
    fffAdhesion: false,
    fffMaterial: false,
    fffCooling: false,
    toolheads: true,
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
    <aside className="w-[500px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark flex flex-col z-10">

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4 pb-4">



        {/* Upload Button */}
        <div className="mb-2 space-y-2">
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
            className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
          >
            <Icon name="upload_file" className="text-sm" />
            Upload Model
          </button>

          {/* Quick Shapes */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleAddCube}
              className="py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 text-[10px] font-bold rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors uppercase flex items-center justify-center gap-1"
            >
              <Icon name="check_box_outline_blank" className="text-xs" /> Cube
            </button>
            <button
              onClick={handleAddCylinder}
              className="py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 text-[10px] font-bold rounded shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors uppercase flex items-center justify-center gap-1"
            >
              <Icon name="circle" className="text-xs" /> Cylinder
            </button>
          </div>
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
                     ? 'border-primary bg-primary text-white shadow-sm'
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
                     <div className="flex items-baseline gap-2 text-[9px]">
                       <span className="text-slate-500">Well:</span>
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
                           onUpdateModel(model.id, { 
                             transform: { 
                               ...model.transform, 
                               wellAssignment: { 
                                 format: (globalSettings.printBed?.multiwellFormat ?? 24) as 6 | 12 | 24 | 48, 
                                 wellId 
                               } 
                             } 
                           });
                           }
                         }}
                         className="w-[60px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                       >
                         <option value="none">None</option>
                         {[6, 12, 24, 48].includes(globalSettings.printBed?.multiwellFormat ?? 24) 
                           ? (() => {
                               const format = globalSettings.printBed?.multiwellFormat ?? 24;
                               const spec = MULTIWELL_SPECS[format as keyof typeof MULTIWELL_SPECS];
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
              <div className="text-center p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-800/20">
                <span className="text-slate-400 text-sm block mb-1">No models loaded</span>
                <span className="text-slate-400/60 text-xs">Click Upload Model to start</span>
              </div>
            )}
          </div>
        </AccordionSection>

        {/* Bioprinting Workflow Tabs */}
        <div className={`mt-2 ${!selectedModel || isAdvancedSliceMode ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-lg mb-4 border border-slate-200 dark:border-slate-800">
            {[
              { id: 'printbed', label: '1. Bed', icon: 'grid_view' },
              { id: 'schedule', label: '2. Schedule', icon: 'event_note' },
              { id: 'mapping', label: '3. Mapping', icon: 'account_tree' },
              { id: 'hardware', label: '4. Hardware', icon: 'handyman' },
              { id: 'slicing', label: '5. Slicing', icon: 'layers' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-1.5 px-1 text-[9px] sm:text-[10px] font-bold rounded-md flex items-center justify-center gap-1 transition-all
                  ${activeTab === tab.id 
                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm ring-1 ring-black/5 dark:ring-white/10' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50 dark:hover:bg-slate-800/50'}`}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </button>
            ))}
          </div>

          {/* TAB 1: PRINT BED */}
          {activeTab === 'printbed' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
              <AccordionSection title="Surface Configuration" isOpen={true} onToggle={() => {}} disableToggle>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">Bed Type</label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={() => onUpdateGlobalSettings({
                          ...globalSettings,
                          printBed: { type: 'glass_bed', dimensions: { width: 100, height: 100 } }
                        })}
                        className={`w-full py-2 px-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                          globalSettings.printBed?.type === 'glass_bed'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className={`p-2 rounded-md ${globalSettings.printBed?.type === 'glass_bed' ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                          <Icon name="crop_square" className="text-lg" />
                        </div>
                        <div>
                          <p className="text-xs font-bold">Glass Bed</p>
                          <p className="text-[10px] opacity-70 text-slate-500">Square 100x100mm surface</p>
                        </div>
                        {globalSettings.printBed?.type === 'glass_bed' && <Icon name="check_circle" className="ml-auto text-sm" />}
                      </button>

                      <button
                        onClick={() => onUpdateGlobalSettings({
                          ...globalSettings,
                          printBed: { type: 'petri_dish', petriDiameter: 60 }
                        })}
                        className={`w-full py-2 px-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                          globalSettings.printBed?.type === 'petri_dish'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className={`p-2 rounded-md ${globalSettings.printBed?.type === 'petri_dish' ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                          <Icon name="circle" className="text-lg" />
                        </div>
                        <div>
                          <p className="text-xs font-bold">Petri Dish</p>
                          <p className="text-[10px] opacity-70 text-slate-500">Circular bio-container</p>
                        </div>
                        {globalSettings.printBed?.type === 'petri_dish' && <Icon name="check_circle" className="ml-auto text-sm" />}
                      </button>

                      <button
                        onClick={() => onUpdateGlobalSettings({
                          ...globalSettings,
                          printBed: { type: 'multiwell_plate', multiwellFormat: 12 }
                        })}
                        className={`w-full py-2 px-3 rounded-lg border text-left flex items-center gap-3 transition-all ${
                          globalSettings.printBed?.type === 'multiwell_plate'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className={`p-2 rounded-md ${globalSettings.printBed?.type === 'multiwell_plate' ? 'bg-primary/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                          <Icon name="apps" className="text-lg" />
                        </div>
                        <div>
                          <p className="text-xs font-bold">Multiwell Plate</p>
                          <p className="text-[10px] opacity-70 text-slate-500">Cell culture grid</p>
                        </div>
                        {globalSettings.printBed?.type === 'multiwell_plate' && <Icon name="check_circle" className="ml-auto text-sm" />}
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
                                ? 'bg-primary text-white border-primary shadow-sm'
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
                                ? 'bg-primary text-white border-primary shadow-sm'
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

              <AccordionSection title="Heating Bed" isOpen={openSections.fffMaterial} onToggle={() => toggleSection('fffMaterial')}>
                <div className="grid grid-cols-2 gap-3 items-center">
                  <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Bed Surface Temp (°C):</span>
                  <NumericInput className="w-full" value={globalSettings.bedTemperature ?? 60} onChange={v => onUpdateGlobalSettings({ ...globalSettings, bedTemperature: v })} step={0.5} />
                </div>
              </AccordionSection>
            </div>
          )}

          {/* TAB 2: SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
              <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                <p className="text-[10px] text-primary leading-relaxed font-bold">
                  The Schedule rules override any model-specific mapping. 
                </p>
              </div>

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
                  <option value="fdm">FDM (T0)</option>
                  <option value="syringe">Syringe (T1)</option>
                  <option value="uv">UV Crosslinker (T2)</option>
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
                  className="flex-center gap-1 px-4 py-1.5 bg-primary text-white text-[10px] font-black rounded uppercase"
                >
                  <Icon name="add" className="text-sm" /> Add Segment
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: MAPPING */}
          {activeTab === 'mapping' && (
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
                      className={`bg-white dark:bg-slate-900 border rounded-xl overflow-hidden transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-primary ring-2 ring-primary/20 shadow-md' 
                          : 'border-slate-200 dark:border-slate-700 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className={`flex items-center justify-between p-3 ${
                        isSelected ? 'bg-primary/5' : 'bg-slate-50/50 dark:bg-slate-800/50'
                      }`}>
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-primary' : 'bg-slate-300'}`} />
                          <span className={`text-xs font-bold truncate pr-2 ${isSelected ? 'text-primary' : 'text-slate-700 dark:text-slate-200'}`}>
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
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter transition-all ${
                            isScaffold ? 'bg-primary text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                          }`}
                        >
                          {isScaffold ? 'Scaffold MODE' : 'Single Tool'}
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
                                <div className="flex items-center gap-2">
                                  <Icon name={feat.icon} className="text-xs text-slate-400" />
                                  <span className="text-[9px] text-slate-500 uppercase font-black">{feat.label}</span>
                                </div>
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

          {/* TAB 4: HARDWARE */}
          {activeTab === 'hardware' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
              <AccordionSection title="Toolhead Hardware" isOpen={true} onToggle={() => {}} disableToggle>
                <div className="space-y-3">
                  {toolheads.map(th => (
                    <div key={th.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <ToolheadBadge toolhead={th.id} />
                        <span className="text-[10px] font-bold text-slate-400 font-mono italic">{th.klipper_tool}</span>
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

              <AccordionSection title="Material & Extrusion" isOpen={true} onToggle={() => {}} disableToggle>
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

          {/* TAB 5: SLICING */}
          {activeTab === 'slicing' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-left-1">
              <AccordionSection title="Layer Settings" isOpen={openSections.fffQuality} onToggle={() => toggleSection('fffQuality')}>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <span className="text-xs text-slate-600 font-bold">Resolution (μm):</span>
                    <NumericInput className="w-full" value={globalSettings.layerHeight} onChange={v => onUpdateGlobalSettings({ ...globalSettings, layerHeight: v })} step={10} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <span className="text-xs text-slate-500 font-medium">First Layer (μm):</span>
                    <NumericInput className="w-full" value={globalSettings.firstLayerHeight || 300} onChange={v => onUpdateGlobalSettings({ ...globalSettings, firstLayerHeight: v })} step={10} />
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
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Infill Pattern</span>
                    <select
                      value={globalSettings.infillPattern || 'gyroid'}
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
                </div>
              </AccordionSection>

              <AccordionSection title="Speeds" isOpen={openSections.fffSpeeds} onToggle={() => toggleSection('fffSpeeds')}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Perimeters</span>
                    <NumericInput value={globalSettings.perimeterSpeed || 45} onChange={v => onUpdateGlobalSettings({ ...globalSettings, perimeterSpeed: v })} />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Infill</span>
                    <NumericInput value={globalSettings.infillSpeed || 80} onChange={v => onUpdateGlobalSettings({ ...globalSettings, infillSpeed: v })} />
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

        </div>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-surface-light dark:bg-surface-dark">
        <button
          onClick={() => {
            if (hasGCode && onPrint) {
              onPrint();
            } else if (!isSlicing) {
              onSlice();
            }
          }}
          className={`w-full py-3 px-4 text-sm font-bold rounded transition-all shadow-lg uppercase tracking-wide flex items-center justify-center gap-2 overflow-hidden relative ${hasGCode
            ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/30'
            : isSlicing
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-wait'
              : 'bg-primary hover:bg-blue-600 text-white shadow-primary/30'
            }`}
        >
          {/* Progress fill animation */}
          {isSlicing && (
            <div
              className="absolute left-0 top-0 h-full bg-primary/20 transition-all duration-300"
              style={{ width: `${Math.round(slicePercent * 100)}%` }}
            />
          )}

          <Icon
            name={hasGCode ? 'play_arrow' : isSlicing ? 'hourglass_empty' : 'layers'}
            className={`text-lg relative z-10 ${isSlicing ? 'animate-spin' : ''}`}
          />
          <span className="relative z-10 flex flex-col items-center">
            <span className="leading-none">
              {hasGCode
                ? 'PRINT MODEL'
                : isSlicing
                  ? `SLICING... ${Math.round(slicePercent * 100)}%`
                  : 'SLICE MODEL'}
            </span>
            {isSlicing && sliceMessage && (
              <span className="text-[10px] font-normal opacity-70 mt-0.5 animate-pulse uppercase tracking-tighter">
                {sliceMessage}
              </span>
            )}
          </span>
        </button>
      </div>
    </aside>
  );
};