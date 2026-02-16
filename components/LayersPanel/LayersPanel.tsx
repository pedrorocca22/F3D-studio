import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { AccordionSection } from './AccordionSection';
import { NumericInput } from './NumericInput';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SliceSegment } from '../../types';
import { generateUUID } from '../../utils';

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

  setIsAdvancedSliceMode: (val: boolean) => void;
  onSlice: () => void;
  onFileUpload: (file: File) => void;
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
  onFileUpload
}) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    models: true, // Default open
    sliceSettings: false,
    advanceSlice: false,
    adhesion: false,
    heating: false,
    separation: false,
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

  // Sync with global settings when they change externally (e.g. on load or reset)
  // We only update if the global settings are different from current to avoid overwriting work-in-progress if possible, 
  // but since this is a "Save" model, we generally assume global settings are the source of truth until edited.
  // However, simpler approach: Update local state when globalSettings.adhesion changes identity.
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

  const [separation, setSeparation] = useState({
    offsetHeight: 4.2,
    speedUp: 22
  });

  // Derive current data from selected model or use defaults
  const selectedModel = models.find(m => m.id === selectedModelId);

  const transformData = selectedModel?.transform || {
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    position: { x: 0, y: 0, z: 0 }
  };

  const currentSettings = selectedModel?.settings || {
    exposureTime: 2.5,
    lightIntensity: 15
  };

  const advancedSettings = selectedModel?.advancedSettings || {
    enabled: false,
    segments: []
  };

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

  // Segment Handling Logic
  const addSegment = () => {
    const segments = [...advancedSettings.segments];

    // Calculate adhesion offset from saved global settings
    const adhesionOffset = (globalSettings.adhesion?.enabled)
      ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000
      : 0;

    const modelZHeight = selectedModel?.size?.y ?? 0;
    const modelTop = modelZHeight > 0 ? modelZHeight : 10;

    if (segments.length === 0) {
      // First segment: covers adhesionOffset → model top
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

      // Check if there is a gap at the end (e.g. user shortened the last segment)
      if (modelTop - currentTop > 0.05) {
        // FILL GAP mode: existing segment stays as is, new segment covers the gap
        const newSegment: SliceSegment = {
          id: generateUUID(),
          topLimit: modelTop,
          exposureTime: lastSegment.exposureTime,
          lightIntensity: lastSegment.lightIntensity
        };
        updateAdvancedSettings({ ...advancedSettings, segments: [...segments, newSegment] });
      } else {
        // SPLIT mode: Split the last segment in half
        const prevStart = segments.length > 1
          ? segments[segments.length - 2].topLimit
          : adhesionOffset;

        // Split the range [prevStart, currentTop]
        const midpoint = prevStart + (currentTop - prevStart) / 2;
        const splitPoint = Math.round(midpoint * 1000) / 1000;

        // Update old last segment
        segments[segments.length - 1] = {
          ...lastSegment,
          topLimit: splitPoint
        };

        // New segment takes the upper half
        const newSegment: SliceSegment = {
          id: generateUUID(),
          topLimit: currentTop,
          exposureTime: lastSegment.exposureTime,
          lightIntensity: lastSegment.lightIntensity
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

  const updateSegment = (index: number, field: keyof SliceSegment, value: number) => {
    const newSegments = [...advancedSettings.segments];
    const segment = { ...newSegments[index], [field]: value };

    // Ensure Top Limit respects constraints (must be > prev Top Limit)
    if (field === 'topLimit') {
      const prevTop = index > 0 ? newSegments[index - 1].topLimit : 0;
      if (value <= prevTop) value = prevTop + 0.1;

      const nextTop = index < newSegments.length - 1 ? newSegments[index + 1].topLimit : Infinity;
      if (value >= nextTop) value = nextTop - 0.1;
    }

    newSegments[index] = { ...segment, [field]: value };
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



  const inputClass = "w-28";

  return (
    <aside className="w-[380px] flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark flex flex-col z-10">

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 space-y-4 pb-6">

        {/* Upload Button */}
        <div className="mb-4">
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
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
          >
            <Icon name="upload_file" />
            Upload Model
          </button>
        </div>

        {/* Models List */}
        <AccordionSection
          title="Models"
          isOpen={openSections.models}
          onToggle={() => toggleSection('models')}
        >
          <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
            {models.map(model => (
              <div
                key={model.id}
                onClick={() => onSelectModel(model.id)}
                className={`flex items-center justify-between py-1.5 px-3 rounded-md border cursor-pointer transition-all group select-none ${selectedModelId === model.id
                  ? 'border-primary bg-primary text-white shadow-sm'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={`w-6 h-6 rounded flex-shrink-0 flex items-center justify-center transition-colors ${selectedModelId === model.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                    <Icon name="view_in_ar" className="text-sm" />
                  </div>
                  <span className="text-sm font-medium truncate" title={model.name}>{model.name}</span>
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
            headerActions={
              <button
                onClick={(e) => { e.stopPropagation(); handleApplyToAll(); }}
                className="hover:text-primary transition-colors text-slate-400 flex items-center gap-1"
                title="Apply exposure and intensity to all models"
              >
                <Icon name="check" className="text-sm" />
              </button>
            }
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
                        {/* Segment Mode Toggle */}
                        <button
                          onClick={() => updateSegment(index, 'exposureMode', segment.exposureMode === 'dose' ? 'time' : 'dose' as any)}
                          className="text-[9px] text-slate-400 uppercase font-bold hover:text-primary transition-colors"
                          title="Toggle Mode"
                        >
                          {segment.exposureMode === 'dose' ? 'DOSE' : 'TIME'}
                        </button>
                        {index > 0 && (
                          <button
                            onClick={() => removeSegment(index)}
                            className="text-slate-400 hover:text-red-500 p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Icon name="delete" className="text-sm" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Range (mm):</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-900 px-2 py-1 rounded min-w-[3rem] text-center border border-slate-200 dark:border-slate-700">
                            {prevTop.toFixed(3)}
                          </span>
                          <span className="text-slate-300">-</span>
                          <NumericInput
                            className="w-28"
                            value={segment.topLimit}
                            onChange={v => updateSegment(index, 'topLimit', v)}
                            step={0.01}
                            min={prevTop + 0.05}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">Intensity (mW):</span>
                        <NumericInput
                          className="w-28"
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
                      </div>

                      {segment.exposureMode === 'dose' ? (
                        <div className="flex items-start justify-between">
                          <span className="text-[10px] text-slate-500 text-primary font-semibold mt-1.5">Dose (mJ):</span>
                          <div className="flex flex-col w-28">
                            <NumericInput
                              className="w-full"
                              value={segment.targetDose || 0}
                              onChange={v => {
                                const newSegments = [...advancedSettings.segments];
                                const currentSeg = newSegments[index];
                                const irr = currentSeg.lightIntensity;
                                const t = irr > 0 ? (v / irr) : 0;

                                newSegments[index] = {
                                  ...currentSeg,
                                  targetDose: v,
                                  exposureTime: parseFloat(t.toFixed(2))
                                };
                                updateAdvancedSettings({ ...advancedSettings, segments: newSegments });
                              }}
                              step={1}
                            />
                            <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                              ≈ {segment.exposureTime.toFixed(2)}s
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between">
                          <span className="text-[10px] text-slate-500 mt-1.5">Exposure (s):</span>
                          <div className="flex flex-col w-28">
                            <NumericInput
                              className="w-full"
                              value={segment.exposureTime}
                              onChange={v => {
                                const newSegments = [...advancedSettings.segments];
                                const currentSeg = newSegments[index];
                                const d = v * currentSeg.lightIntensity;

                                newSegments[index] = {
                                  ...currentSeg,
                                  exposureTime: v,
                                  targetDose: parseFloat(d.toFixed(1))
                                };
                                updateAdvancedSettings({ ...advancedSettings, segments: newSegments });
                              }}
                              step={0.1}
                            />
                            <div className="mt-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-xs font-bold px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/50 shadow-sm text-center w-full">
                              ≈ {(segment.exposureTime * segment.lightIntensity).toFixed(1)} mJ/cm²
                            </div>
                          </div>
                        </div>
                      )}

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

            <AccordionSection title="Separation movement" isOpen={openSections.separation} onToggle={() => toggleSection('separation')}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Offset (mm):</span>
                <NumericInput className={inputClass} value={separation.offsetHeight} onChange={v => setSeparation({ ...separation, offsetHeight: v })} step={0.1} />
              </div>
            </AccordionSection>
          </>
        )}
      </div>

      <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-surface-light dark:bg-surface-dark">
        <button
          onClick={onSlice}
          className="w-full py-2.5 px-4 text-sm font-bold bg-primary text-white rounded hover:bg-blue-600 transition-colors shadow-sm uppercase tracking-wide"
        >
          SLICE
        </button>
      </div>
    </aside>
  );
};