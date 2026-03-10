import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SliceSegment } from '../../types';
import { generateUUID } from '../../utils';
import { generateCubeStl, generateCylinderStl } from '../../shapeGenerators';



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
  // Previously removed props that are actually used in the component body
  setIsAdvancedSliceMode: (val: boolean) => void;
  onSlice: () => void;
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
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    models: true,
    sliceSettings: false,
    advanceSlice: false,
    adhesion: false,
    heating: false,
    separation: false,
    thermodynamic: false,
    motor: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [adhesion, setAdhesion] = useState({
    enabled: globalSettings.adhesion?.enabled ?? false,
    layerHeight: globalSettings.adhesion?.layerHeight ?? 20,
    layers: globalSettings.adhesion?.layers ?? 3,
    exposureTime: globalSettings.adhesion?.exposureTime ?? 3.2,
    lightIntensity: globalSettings.adhesion?.lightIntensity ?? 40,
    transitionLayers: globalSettings.adhesion?.transitionLayers ?? 2,
    exposureMode: globalSettings.adhesion?.exposureMode ?? ('time' as const),
    targetDose: globalSettings.adhesion?.targetDose ?? ((globalSettings.adhesion?.exposureTime ?? 3.2) * (globalSettings.adhesion?.lightIntensity ?? 40))
  });

  // Sync with global settings when they change externally
  useEffect(() => {
    if (globalSettings.adhesion) {
      setAdhesion(prev => ({
        ...prev,
        ...globalSettings.adhesion
      }));
    }
  }, [globalSettings.adhesion]);

  const [heating, setHeating] = useState({
    temp: 27.2
  });


  const [thermodynamic, setThermodynamic] = useState({
    enabled: globalSettings.thermodynamic?.enabled ?? false,
    maxFlashTime: globalSettings.thermodynamic?.maxFlashTime ?? 0.5,
    coolingPause: globalSettings.thermodynamic?.coolingPause ?? 2.0
  });

  // Sync with global settings when they change externally
  useEffect(() => {
    if (globalSettings.thermodynamic) {
      setThermodynamic(prev => ({
        ...prev,
        ...globalSettings.thermodynamic
      }));
    }
  }, [globalSettings.thermodynamic]);

  const [motor, setMotor] = useState({
    enabled: globalSettings.motor?.enabled ?? false,
    peelSpeed: globalSettings.motor?.peelSpeed ?? 30,
    retractSpeed: globalSettings.motor?.retractSpeed ?? 150,
    separationDistance: globalSettings.motor?.separationDistance ?? 4.2
  });

  // Sync with global settings when they change externally
  useEffect(() => {
    if (globalSettings.motor) {
      setMotor(prev => ({
        ...prev,
        ...globalSettings.motor
      }));
    }
  }, [globalSettings.motor]);

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





        {/* Slice Settings */}
        <div className={!selectedModel || isAdvancedSliceMode ? 'opacity-50 pointer-events-none grayscale' : ''}>
          <AccordionSection
            title="Slice settings"
            isOpen={openSections.sliceSettings}
            onToggle={() => toggleSection('sliceSettings')}

          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Mode</span>
              <div className="flex bg-slate-100 dark:bg-slate-700/50 p-0.5 rounded-md">
                <button
                  onClick={() => updateModelSettings('exposureMode', 'time' as any)}
                  className={`px-3 py-1 text-[10px] font-bold rounded ${(!currentSettings.exposureMode || currentSettings.exposureMode === 'time')
                    ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                  Time (s)
                </button>
                <button
                  onClick={() => updateModelSettings('exposureMode', 'dose' as any)}
                  className={`px-3 py-1 text-[10px] font-bold rounded ${(currentSettings.exposureMode === 'dose')
                    ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                  Dose (mJ)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Layer height (μm):</span>
              <NumericInput
                className={inputClass}
                value={globalSettings.layerHeight}
                onChange={updateGlobalLayerHeight}
                step={0.1}
              />
            </div>

            {/* Intensity First (Base for Dose Calc) */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Light intensity (mW/cm²):</span>
              <NumericInput
                className={inputClass}
                value={currentSettings.lightIntensity}
                onChange={v => {
                  const updates: any = { lightIntensity: v };

                  if (currentSettings.exposureMode === 'dose' && currentSettings.targetDose) {
                    // Start Dose Mode: Recalc Time
                    const t = v > 0 ? (currentSettings.targetDose / v) : 0;
                    updates.exposureTime = parseFloat(t.toFixed(2));
                  } else {
                    // Time Mode: Update Dose metadata
                    const d = v * currentSettings.exposureTime;
                    updates.targetDose = parseFloat(d.toFixed(1));
                  }

                  onUpdateSettings({ ...currentSettings, ...updates });
                }}
                step={0.1}
              />
            </div>

            {/* Conditional Input based on Mode */}
            {currentSettings.exposureMode === 'dose' ? (
              <div className="flex items-start justify-between">
                <span className="text-xs text-slate-500 text-primary font-semibold mt-1.5">Target Dose (mJ/cm²):</span>
                <div className="flex flex-col w-28">
                  <NumericInput
                    className="w-full"
                    value={currentSettings.targetDose || 0}
                    onChange={v => {
                      const irr = currentSettings.lightIntensity;
                      const t = irr > 0 ? (v / irr) : 0;
                      onUpdateSettings({
                        ...currentSettings,
                        targetDose: v, // Update dose
                        exposureTime: parseFloat(t.toFixed(2)) // Update time
                      });
                    }}
                    step={1}
                  />
                  <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                    ≈ {currentSettings.exposureTime.toFixed(2)}s
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <span className="text-xs text-slate-500 mt-1.5">Exposure time (s):</span>
                <div className="flex flex-col w-28">
                  <NumericInput
                    className="w-full"
                    value={currentSettings.exposureTime}
                    onChange={v => {
                      const d = v * currentSettings.lightIntensity;
                      onUpdateSettings({
                        ...currentSettings,
                        exposureTime: v, // Update time
                        targetDose: parseFloat(d.toFixed(1)) // Update dose
                      });
                    }}
                    step={0.1}
                  />
                  <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                    ≈ {(currentSettings.exposureTime * currentSettings.lightIntensity).toFixed(1)} mJ/cm²
                  </div>
                </div>
              </div>
            )}


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
        <div className={!selectedModel || isAdvancedSliceMode ? 'opacity-50 pointer-events-none grayscale' : ''}>
          <AccordionSection
            title="Build plate adhesion"
            isOpen={openSections.adhesion}
            onToggle={() => toggleSection('adhesion')}
            toggleSwitch
            switchOn={adhesion.enabled ?? false}
            onSwitchChange={() => {
              setAdhesion(prev => ({ ...prev, enabled: !prev.enabled }));
            }}
            info

          >
            {/* Refactored Adhesion Content */}
            <div className="space-y-3">
              {/* Only show controls if enabled via Header Toggle */}
              {adhesion.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Layers count:</span>
                    <NumericInput
                      className={inputClass}
                      value={adhesion.layers}
                      onChange={v => setAdhesion({ ...adhesion, layers: v })}
                      step={1}
                      min={1}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Layer thickness (μm):</span>
                    <NumericInput
                      className={inputClass}
                      value={adhesion.layerHeight}
                      onChange={v => setAdhesion({ ...adhesion, layerHeight: v })}
                      step={1}
                      min={1}
                    />
                  </div>

                  {/* Mode Toggle Row */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Mode</span>
                    <div className="flex bg-slate-100 dark:bg-slate-700/50 p-0.5 rounded-md">
                      <button
                        onClick={() => setAdhesion({ ...adhesion, exposureMode: 'time' })}
                        className={`px-3 py-1 text-[10px] font-bold rounded ${(!adhesion.exposureMode || adhesion.exposureMode === 'time')
                          ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                      >
                        Time (s)
                      </button>
                      <button
                        onClick={() => setAdhesion({ ...adhesion, exposureMode: 'dose' })}
                        className={`px-3 py-1 text-[10px] font-bold rounded ${(adhesion.exposureMode === 'dose')
                          ? 'bg-white dark:bg-slate-600 text-primary shadow-sm'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                      >
                        Dose (mJ)
                      </button>
                    </div>
                  </div>

                  {/* Intensity First */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Light Intensity (mW):</span>
                    <NumericInput
                      className={inputClass}
                      value={adhesion.lightIntensity}
                      onChange={v => {
                        const updates: any = { lightIntensity: v };
                        if (adhesion.exposureMode === 'dose' && adhesion.targetDose) {
                          const t = v > 0 ? (adhesion.targetDose / v) : 0;
                          updates.exposureTime = parseFloat(t.toFixed(2));
                        } else {
                          const d = v * adhesion.exposureTime;
                          updates.targetDose = parseFloat(d.toFixed(1));
                        }
                        setAdhesion({ ...adhesion, ...updates });
                      }}
                      step={1}
                    />
                  </div>

                  {/* Conditional Input */}
                  {adhesion.exposureMode === 'dose' ? (
                    <div className="flex items-start justify-between">
                      <span className="text-xs text-slate-500 text-primary font-semibold mt-1.5">Target Dose (mJ):</span>
                      <div className="flex flex-col w-28">
                        <NumericInput
                          className="w-full"
                          value={adhesion.targetDose || 0}
                          onChange={v => {
                            const irr = adhesion.lightIntensity;
                            const t = irr > 0 ? (v / irr) : 0;
                            setAdhesion({ ...adhesion, targetDose: v, exposureTime: parseFloat(t.toFixed(2)) });
                          }}
                          step={1}
                        />
                        <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                          ≈ {adhesion.exposureTime.toFixed(2)}s
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <span className="text-xs text-slate-500 mt-1.5">Exposure time (s):</span>
                      <div className="flex flex-col w-28">
                        <NumericInput
                          className="w-full"
                          value={adhesion.exposureTime}
                          onChange={v => {
                            const d = v * adhesion.lightIntensity;
                            setAdhesion({ ...adhesion, exposureTime: v, targetDose: parseFloat(d.toFixed(1)) });
                          }}
                          step={0.1}
                          min={0.1}
                        />
                        <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                          ≈ {(adhesion.exposureTime * adhesion.lightIntensity).toFixed(1)} mJ/cm²
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-900/40 rounded mt-2">
                    <p className="text-[10px] text-yellow-700 dark:text-yellow-400">
                      Total Adhesion Height: {((adhesion.layers * adhesion.layerHeight) / 1000).toFixed(3)} mm
                    </p>
                  </div>
                </>
              )}

              {/* SAVE CHANGES BUTTON */}
              <button
                onClick={() => {
                  onUpdateGlobalSettings({
                    ...globalSettings,
                    adhesion: { ...adhesion }
                  });
                }}
                disabled={
                  // Check if dirty: Compare local vs global
                  JSON.stringify(globalSettings.adhesion) === JSON.stringify(adhesion)
                }
                className={`w-full py-2 rounded text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 ${JSON.stringify(globalSettings.adhesion) !== JSON.stringify(adhesion)
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-default'
                  }`}
              >
                <Icon name="save" className="text-sm" />
                Save Changes
              </button>
            </div>
          </AccordionSection>
        </div>

        {/* Advance Slice (Active Section) */}
        <div className={!selectedModel ? 'opacity-50 pointer-events-none' : ''}>
          <AccordionSection
            title="Advance slice"
            isOpen={openSections.advanceSlice}
            onToggle={() => toggleSection('advanceSlice')}
            toggleSwitch
            switchOn={advancedSettings.enabled}
            onSwitchChange={() => {
              if (selectedModel) {
                onUpdateAdvancedSettings({
                  ...advancedSettings,
                  enabled: !advancedSettings.enabled
                });
              }
            }}
          >
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded mb-2 flex items-start gap-2">
              <Icon name="info" className="text-primary text-sm mt-0.5" />
              <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">
                Define multiple Z-regions with specific settings. Each segment starts where the previous one ends.
              </p>
            </div>

            {/* Dynamic Segments List */}
            <div className="space-y-3 pb-2">
              {advancedSettings.segments.map((segment, index) => {
                // START OFFSET LOGIC:
                const adhesionOffset = (globalSettings.adhesion?.enabled)
                  ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000
                  : 0;

                const prevTop = index > 0
                  ? advancedSettings.segments[index - 1].topLimit
                  : adhesionOffset;

                return (
                  <div key={segment.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden">
                    <div className="flex justify-between items-center px-3 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700/50">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Segment {index + 1}</span>
                      <div className="flex items-center gap-2">
                        {/* Gradient vs Mode Toggle */}
                        <div className="flex bg-slate-100 dark:bg-slate-700/50 p-0.5 rounded mr-1">
                          <button
                            onClick={() => updateSegment(index, 'gradientMode', 'flat')}
                            className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase ${(!segment.gradientMode || segment.gradientMode === 'flat') ? 'bg-white dark:bg-slate-600 text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            Flat
                          </button>
                          <button
                            onClick={() => updateSegment(index, 'gradientMode', 'gradient')}
                            className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase ${(segment.gradientMode === 'gradient') ? 'bg-gradient-to-r from-orange-400 to-primary text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            Gradient
                          </button>
                        </div>

                        <button
                          onClick={() => removeSegment(index)}
                          className="text-slate-400 hover:text-red-500 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Remove Segment"
                        >
                          <Icon name="delete" className="text-sm" />
                        </button>
                      </div>
                    </div>





                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Range (Z mm):</span>
                        <div className="flex items-center gap-2">
                          {segment.gradientMode === 'gradient' ? (
                            <div className="flex items-center gap-1 w-64">
                              <NumericInput
                                className="w-full text-center px-1"
                                value={segment.bottomLimit ?? prevTop}
                                onChange={v => updateSegment(index, 'bottomLimit', v)}
                                step={0.01}
                                min={0}
                              />
                              <span className="text-slate-300 dark:text-slate-600 text-[10px]">&rarr;</span>
                              <NumericInput
                                className="w-full text-center px-1 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-900/10"
                                value={segment.topLimit}
                                onChange={v => updateSegment(index, 'topLimit', v)}
                                step={0.01}
                                min={(segment.bottomLimit ?? prevTop) + 0.05}
                              />
                            </div>
                          ) : (
                            <>
                              <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded min-w-[3rem] text-center border border-slate-200 dark:border-slate-700">
                                {prevTop.toFixed(3)}
                              </span>
                              <span className="text-slate-300">-</span>
                              <NumericInput
                                className="w-48"
                                value={segment.topLimit}
                                onChange={v => updateSegment(index, 'topLimit', v)}
                                step={0.01}
                                min={prevTop + 0.05}
                              />
                            </>
                          )}
                        </div>
                      </div>

                      {/* --- LIGHT INTENSITY MULTI-INPUT (START/END) --- */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          {segment.gradientMode === 'gradient' ? 'Intensity Range (mW):' : 'Intensity (mW):'}
                        </span>

                        {segment.gradientMode === 'gradient' ? ( // Gradient Dual Input
                          <div className="flex items-center gap-1 w-64">
                            <NumericInput
                              className="w-full text-center px-1"
                              value={segment.lightIntensity}
                              onChange={v => updateSegment(index, 'lightIntensity', v)}
                              step={1}
                            />
                            <span className="text-slate-300 dark:text-slate-600 text-[10px]">&rarr;</span>
                            <NumericInput
                              className="w-full text-center px-1 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-900/10"
                              value={segment.endLightIntensity ?? segment.lightIntensity}
                              onChange={v => updateSegment(index, 'endLightIntensity', v)}
                              step={1}
                            />
                          </div>
                        ) : ( // Flat Single Input
                          <NumericInput
                            className="w-48"
                            value={segment.lightIntensity}
                            onChange={v => {
                              const newSegments = [...advancedSettings.segments];
                              const currentSeg = newSegments[index];
                              const updates: any = { lightIntensity: v };

                              if (currentSeg.exposureMode === 'dose' && currentSeg.targetDose) {
                                const t = v > 0 ? (currentSeg.targetDose / v) : 0;
                                updates.exposureTime = parseFloat(t.toFixed(2));
                              } else {
                                const d = v * currentSeg.exposureTime;
                                updates.targetDose = parseFloat(d.toFixed(1));
                              }

                              newSegments[index] = { ...currentSeg, ...updates };
                              updateAdvancedSettings({ ...advancedSettings, segments: newSegments });
                            }}
                            step={1}
                          />
                        )}
                      </div>

                      {/* --- NOISE/DOSE/TIME MULTI-INPUT (START/END) --- */}
                      <div className="flex items-start justify-between mt-2">
                        <span className="text-[10px] text-slate-500 mt-1.5 flex flex-col">
                          <span>{segment.exposureMode === 'dose' ? 'Target Dose (mJ):' : 'Exposure Time (s):'}</span>
                          <button
                            onClick={() => updateSegment(index, 'exposureMode', segment.exposureMode === 'dose' ? 'time' : 'dose' as any)}
                            className="text-[8px] text-blue-500 hover:underline uppercase text-left mt-0.5"
                          >
                            Switch to {segment.exposureMode === 'dose' ? 'Time' : 'Dose'}
                          </button>
                        </span>

                        {segment.gradientMode === 'gradient' ? ( // Gradient Dual Input
                          <div className="flex flex-col w-64 gap-1">
                            <div className="flex items-center gap-1">
                              <NumericInput
                                className="w-full text-center px-1"
                                value={segment.exposureMode === 'dose' ? (segment.targetDose || 0) : segment.exposureTime}
                                onChange={v => {
                                  if (segment.exposureMode === 'dose') updateSegment(index, 'targetDose', v);
                                  else updateSegment(index, 'exposureTime', v);
                                }}
                                step={segment.exposureMode === 'dose' ? 1 : 0.1}
                              />
                              <span className="text-slate-300 dark:text-slate-600 text-[10px]">&rarr;</span>
                              <NumericInput
                                className="w-full text-center px-1 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-900/10"
                                value={segment.exposureMode === 'dose' ? (segment.endTargetDose ?? segment.targetDose ?? 0) : (segment.endExposureTime ?? segment.exposureTime)}
                                onChange={v => {
                                  if (segment.exposureMode === 'dose') updateSegment(index, 'endTargetDose', v);
                                  else updateSegment(index, 'endExposureTime', v);
                                }}
                                step={segment.exposureMode === 'dose' ? 1 : 0.1}
                              />
                            </div>
                            <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                              ≈ {(segment.exposureTime * segment.lightIntensity).toFixed(1)} &rarr; {((segment.endExposureTime ?? segment.exposureTime) * (segment.endLightIntensity ?? segment.lightIntensity)).toFixed(1)} mJ/cm²
                            </div>
                          </div>
                        ) : ( // Flat Single Input
                          <div className="flex flex-col w-48">
                            <NumericInput
                              className="w-full"
                              value={segment.exposureMode === 'dose' ? (segment.targetDose || 0) : segment.exposureTime}
                              onChange={v => {
                                if (segment.exposureMode === 'dose') updateSegment(index, 'targetDose', v);
                                else updateSegment(index, 'exposureTime', v);
                              }}
                              step={segment.exposureMode === 'dose' ? 1 : 0.1}
                            />
                            <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                              ≈ {(segment.exposureTime * segment.lightIntensity).toFixed(1)} mJ/cm²
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="h-1"></div>

                      <div className="h-1"></div>

                    </div>
                  </div>
                );
              })}

              <button
                onClick={addSegment}
                className="w-full py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-500 hover:text-primary hover:border-primary hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-1 mt-2"
              >
                <Icon name="add" className="text-sm" /> Add Segment
              </button>
            </div>
          </AccordionSection>
        </div>

        {/* Other Sections (Hidden when advanced active) */}
        {!isAdvancedSliceMode && (
          <>
            <AccordionSection title="Bioink heating" isOpen={openSections.heating} onToggle={() => toggleSection('heating')} info>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Temp (°C):</span>
                <NumericInput className={inputClass} value={heating.temp} onChange={v => setHeating({ temp: v })} step={0.1} />
              </div>
            </AccordionSection>


            <AccordionSection
              title="Thermal Viability Saver"
              isOpen={openSections.thermodynamic}
              onToggle={() => toggleSection('thermodynamic')}
              toggleSwitch
              switchOn={thermodynamic.enabled}
              onSwitchChange={() => {
                setThermodynamic(prev => ({ ...prev, enabled: !prev.enabled }));
              }}
              info
            >
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded mb-3 flex items-start gap-2">
                <Icon name="ac_unit" className="text-primary text-sm mt-0.5" />
                <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">
                  Protects cells by breaking long UV exposures into short flashes with thermodynamic cooling pauses.
                </p>
              </div>

              {thermodynamic.enabled && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 flex flex-col">
                      <span>Max Flash Time (s):</span>
                      <span className="text-[8px] text-slate-400">Time before pause</span>
                    </span>
                    <NumericInput
                      className={inputClass}
                      value={thermodynamic.maxFlashTime}
                      onChange={v => setThermodynamic({ ...thermodynamic, maxFlashTime: v })}
                      step={0.1}
                      min={0.1}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 flex flex-col">
                      <span>Cooling Pause (s):</span>
                      <span className="text-[8px] text-slate-400">Min 2.0s recommended</span>
                    </span>
                    <NumericInput
                      className={inputClass}
                      value={thermodynamic.coolingPause}
                      onChange={v => setThermodynamic({ ...thermodynamic, coolingPause: v })}
                      step={0.5}
                      min={1.0}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  onUpdateGlobalSettings({
                    ...globalSettings,
                    thermodynamic: { ...thermodynamic }
                  });
                }}
                disabled={
                  JSON.stringify(globalSettings.thermodynamic) === JSON.stringify(thermodynamic)
                }
                className={`w-full py-2 mt-4 rounded text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 ${JSON.stringify(globalSettings.thermodynamic) !== JSON.stringify(thermodynamic)
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-default'
                  }`}
              >
                <Icon name="save" className="text-sm" />
                Save Changes
              </button>
            </AccordionSection>

            <AccordionSection
              title="Motor Speeds Control"
              isOpen={openSections.motor}
              onToggle={() => toggleSection('motor')}
              toggleSwitch
              switchOn={motor.enabled}
              onSwitchChange={() => {
                setMotor(prev => ({ ...prev, enabled: !prev.enabled }));
              }}
              info
            >
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded mb-3 flex items-start gap-2">
                <Icon name="speed" className="text-primary text-sm mt-0.5" />
                <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">
                  Override default motor speeds for peeling the layer and lowering the VAT back. Peeling is slow, descending is faster.
                </p>
              </div>

              {motor.enabled && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 flex flex-col">
                      <span>Lift/Peel Speed (mm/min):</span>
                      <span className="text-[8px] text-slate-400">Slow separation</span>
                    </span>
                    <NumericInput
                      className={inputClass}
                      value={motor.peelSpeed}
                      onChange={v => setMotor({ ...motor, peelSpeed: v })}
                      step={5}
                      min={1}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 flex flex-col">
                      <span>Approach Speed (mm/min):</span>
                      <span className="text-[8px] text-slate-400">Fast approach</span>
                    </span>
                    <NumericInput
                      className={inputClass}
                      value={motor.retractSpeed}
                      onChange={v => setMotor({ ...motor, retractSpeed: v })}
                      step={10}
                      min={10}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 flex flex-col">
                      <span>Separation Distance (mm):</span>
                      <span className="text-[8px] text-slate-400">Offset for peeling</span>
                    </span>
                    <NumericInput
                      className={inputClass}
                      value={motor.separationDistance}
                      onChange={v => setMotor({ ...motor, separationDistance: v })}
                      step={0.1}
                      min={0.1}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  onUpdateGlobalSettings({
                    ...globalSettings,
                    motor: { ...motor }
                  });
                }}
                disabled={
                  JSON.stringify(globalSettings.motor) === JSON.stringify(motor)
                }
                className={`w-full py-2 mt-4 rounded text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 ${JSON.stringify(globalSettings.motor) !== JSON.stringify(motor)
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-sm'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-default'
                  }`}
              >
                <Icon name="save" className="text-sm" />
                Save Changes
              </button>
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