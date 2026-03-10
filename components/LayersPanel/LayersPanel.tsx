import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SliceSegment, ToolheadConfig, LayerAction } from '../../types';
import { generateUUID } from '../../utils';
import { generateCubeStl, generateCylinderStl } from '../../shapeGenerators';
import { ToolheadPanel } from '../ToolheadPanel/ToolheadPanel';



interface LayersPanelProps {
  models: ModelData[];
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onDeleteModel: (id: string) => void;
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
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  models,
  globalSettings,
  onUpdateGlobalSettings,
  selectedModelId,
  onSelectModel,
  onDeleteModel,
  onTransformChange,
  onUpdateSettings,
  onUpdateAdvancedSettings,
  onApplySettingsToAll,
  isAdvancedSliceMode,
  setIsAdvancedSliceMode,
  onSlice,
  onFileUpload,
  toolheads,
  layerActions,
  totalLayers,
  onUpdateToolheads,
  onUpdateLayerActions,
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    models: true,
    sliceSettings: false,
    heating: false,
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
            {models.map(model => (
              <div
                key={model.id}
                onClick={() => onSelectModel(model.id)}
                className={`flex items-center justify-between py-1 px-2 rounded-md border cursor-pointer transition-all group select-none ${selectedModelId === model.id
                  ? 'border-primary bg-primary text-white shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center transition-colors ${selectedModelId === model.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                    <Icon name="view_in_ar" className="text-xs" />
                  </div>
                  <span className="text-xs font-medium truncate" title={model.name}>{model.name}</span>
                </div>
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
            ))}
            {models.length === 0 && (
              <div className="text-center p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50/50 dark:bg-slate-800/20">
                <span className="text-slate-400 text-sm block mb-1">No models loaded</span>
                <span className="text-slate-400/60 text-xs">Click Upload Model to start</span>
              </div>
            )}
          </div>
        </AccordionSection>





        {/* FFF Print Settings */}
        <div className={!selectedModel || isAdvancedSliceMode ? 'opacity-50 pointer-events-none grayscale' : ''}>
          <AccordionSection
            title="FFF Print Settings"
            isOpen={openSections.sliceSettings}
            onToggle={() => toggleSection('sliceSettings')}
            info
          >
            <div className="space-y-4">
              {/* Layer Height */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Layer height (μm):</span>
                <NumericInput
                  className={inputClass}
                  value={globalSettings.layerHeight}
                  onChange={(v) => onUpdateGlobalSettings({ ...globalSettings, layerHeight: v })}
                  step={10}
                />
              </div>

              {/* Temperatures */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Nozzle (°C)</span>
                  <NumericInput
                    className="w-full"
                    value={globalSettings.nozzleTemperature || 210}
                    onChange={(v) => onUpdateGlobalSettings({ ...globalSettings, nozzleTemperature: v })}
                    step={5}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Bed (°C)</span>
                  <NumericInput
                    className="w-full"
                    value={globalSettings.bedTemperature || 60}
                    onChange={(v) => onUpdateGlobalSettings({ ...globalSettings, bedTemperature: v })}
                    step={5}
                  />
                </div>
              </div>

              {/* Nozzle Diameter */}
              <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Nozzle Diameter (mm)</span>
                <div className="w-32">
                  <NumericInput
                    className={inputClass}
                    value={globalSettings.nozzleDiameter ?? 0.4}
                    onChange={(v) => onUpdateGlobalSettings({ ...globalSettings, nozzleDiameter: v })}
                    step={0.05}
                    min={0.1}
                    max={2.0}
                  />
                </div>
              </div>

              {/* Infill Pattern Selector */}
              <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Infill Pattern</span>
                <select
                  value={globalSettings.infillPattern ?? 'gyroid'}
                  onChange={(e) => onUpdateGlobalSettings({ ...globalSettings, infillPattern: e.target.value as any })}
                  className="w-32 text-xs py-1 px-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:ring-1 focus:ring-primary transition-all"
                >
                  <option value="rectilinear">Rectilinear</option>
                  <option value="grid">Grid</option>
                  <option value="triangles">Triangles</option>
                  <option value="stars">Stars</option>
                  <option value="cubic">Cubic</option>
                  <option value="line">Line</option>
                  <option value="concentric">Concentric</option>
                  <option value="honeycomb">Honeycomb</option>
                  <option value="3dhoneycomb">3D Honeycomb</option>
                  <option value="gyroid">Gyroid</option>
                  <option value="hilbertcurve">Hilbert Curve</option>
                  <option value="archimedeanchords">Archimedean Chords</option>
                  <option value="octagramspiral">Octagram Spiral</option>
                  <option value="adaptivecubic">Adaptive Cubic</option>
                  <option value="supportcubic">Support Cubic</option>
                  <option value="lightning">Lightning</option>
                  <option value="none">None</option>
                </select>
              </div>

              {/* Infill & Walls */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Infill (%)</span>
                  <NumericInput
                    className="w-full"
                    value={globalSettings.infill || 15}
                    onChange={(v) => onUpdateGlobalSettings({ ...globalSettings, infill: v })}
                    step={1}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Walls (Count)</span>
                  <NumericInput
                    className="w-full"
                    value={globalSettings.perimeters || 3}
                    onChange={(v) => onUpdateGlobalSettings({ ...globalSettings, perimeters: v })}
                    step={1}
                  />
                </div>
              </div>

              {/* Supports Toggle */}
              <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Generate Supports</span>
                <button
                  onClick={() => onUpdateGlobalSettings({ ...globalSettings, supportsEnabled: !globalSettings.supportsEnabled })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${globalSettings.supportsEnabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${globalSettings.supportsEnabled ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            </div>

            <div className="h-2"></div>

            <button
              onClick={handleApplyToAll}
              className="w-full py-2 rounded text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700 shadow-sm"
              title="Copy these settings to all other models"
            >
              <Icon name="done_all" className="text-sm" />
              Apply to All Models
            </button>
          </AccordionSection>
        </div>

        {/* Build Plate Adhesion (New Position & Logic) */}


        {/* Advance Slice (Active Section) */}


        {/* Other Sections */}
        {!isAdvancedSliceMode && (
          <>
            <AccordionSection title="Heating Bed" isOpen={openSections.heating} onToggle={() => toggleSection('heating')} info>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Bed Temp (°C):</span>
                <NumericInput className={inputClass} value={heating.temp} onChange={v => setHeating({ temp: v })} step={0.5} />
              </div>
              <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                Controls the heated bed temperature via Klipper <code>SET_HEATER_TEMPERATURE</code> macro.
              </p>
            </AccordionSection>

            <AccordionSection title="Toolheads &amp; Layer Schedule" isOpen={openSections.toolheads} onToggle={() => toggleSection('toolheads')} info>
              <ToolheadPanel
                toolheads={toolheads}
                layerActions={layerActions}
                totalLayers={totalLayers}
                onUpdateToolheads={onUpdateToolheads}
                onUpdateLayerActions={onUpdateLayerActions}
              />
            </AccordionSection>
          </>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-surface-light dark:bg-surface-dark">
        <button
          onClick={() => {
            console.log("Slice button clicked");
            onSlice();
          }}
          className="w-full py-3 px-4 text-sm font-bold bg-primary text-white rounded hover:bg-blue-600 transition-colors shadow-lg shadow-primary/30 uppercase tracking-wide flex items-center justify-center gap-2"
        >
          <Icon name="layers" className="text-lg" />
          SLICE MODEL
        </button>
      </div>
    </aside>
  );
};