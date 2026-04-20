import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Header } from './components/Header';

import { WifiConfig } from './components/WifiConfig/WifiConfig';
import JSZip from 'jszip';
import { LayersPanel } from './components/LayersPanel/LayersPanel';
import { Viewport } from './components/Viewport/Viewport';
// GCodePreview is now integrated into Viewport directly

import { Icon } from './components/Icon';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SceneObject, SliceJobResponse, BackendRangeOverride, ToolheadConfig, LayerAction, FDMToolheadConfig, SyringeToolheadConfig, UVToolheadConfig, ZZone } from './types';
import { generateUUID } from './utils';
import { resolveLayerPlans } from './utils/planResolver';
import { HelpWiki, HelpTopic } from './components/HelpWiki/HelpWiki';
// FIX #4: Import centralized MULTIWELL_SPECS — eliminates the local duplicate defined inside handleSlice
import { MULTIWELL_SPECS } from './constants/wellplate';

// Helper to convert File to ArrayBuffer
const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = error => reject(error);
  });
};

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [isAdvancedSliceMode, setIsAdvancedSliceMode] = useState(false);
  const [isSlicePreviewMode, setIsSlicePreviewMode] = useState(false);

  const [isWifiOpen, setIsWifiOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);


  // Slicing State
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState('');
  const [slicePercent, setSlicePercent] = useState(0);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [sliceStartTime, setSliceStartTime] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Pre-flight State
  const [showPreFlight, setShowPreFlight] = useState(false);
  // Global Print Settings (Physical machine constraints)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    layerHeight: 200, // 0.2mm = 200um
    nozzleTemperature: 210,
    bedTemperature: 60,
    infill: 15,
    infillPattern: 'grid',
    perimeters: 3,
    supportsEnabled: false,
    nozzleDiameter: 0.4,
    firstLayerHeight: 300,
    // Speeds Defaults
    firstLayerSpeed: 20,
    perimeterSpeed: 45,
    externalPerimeterSpeed: 25,
    infillSpeed: 80,
    travelSpeed: 130,
    // Material & Retraction Defaults
    retractionLength: 1.0,
    retractionSpeed: 45,
    extrusionMultiplier: 1.0,
    // Cooling Defaults
    fanAlwaysOn: true,
    minFanSpeed: 100,
    maxFanSpeed: 100,
    disableFanFirstLayers: 1,
    skirtCount: 1,
    skirtDistance: 6,
    brimWidth: 0,
    topSolidLayers: 3,
    bottomSolidLayers: 3,
    fillAngle: 0,
    printBed: {
      type: 'glass_bed',
      dimensions: { width: 100, height: 100 }
    }
  });

  // State for multiple models
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Toolheads state ──────────────────────────────────────────────
  const DEFAULT_TOOLHEADS: ToolheadConfig[] = [
    {
      id: 'fdm', label: 'FDM Hot-end', klipper_tool: 'T0', installed: false,
      nozzleDiameter: 0.4, filamentDiameter: 1.75, maxTemperature: 280,
      defaultTemperature: 210, retractionLength: 1.0, retractionSpeed: 45
    } as FDMToolheadConfig,
    {
      id: 'syringe', label: 'Hydrogel Syringe', klipper_tool: 'T1', installed: false,
      syringeVolumeMl: 5, nozzleDiameterMm: 0.4, flowRateUlPerMm: 0.8,
      pressurizationSteps: 10, retractionSteps: 5, actuatorType: 'mechanical'
    } as SyringeToolheadConfig,
    {
      id: 'uv', label: 'UV Crosslinker', klipper_tool: 'T2', installed: false,
      wavelengthNm: 365, maxPowerMw: 100, defaultDose: 50, defaultExposureTime: 5, mode: 'fixed'
    } as UVToolheadConfig,
  ];
  const [toolheads, setToolheads] = useState<ToolheadConfig[]>(DEFAULT_TOOLHEADS);
  const [zZones, setZZones] = useState<ZZone[]>([]);

  // G-code preview state
  const [gcodePreviewJob, setGcodePreviewJob] = useState<{
    jobId: string;
    layerCount: number;
    nozzleDiameter?: number
  } | null>(null);


  // FIX #7: Auto-reset G-code preview ONLY when slicing parameters change.
  // Previously, ANY models[] mutation (e.g. size update from Three.js) would destroy the preview.
  // We now track a hash of the fields that actually affect slicing output.
  const slicingParamsHash = useMemo(() => {
    const relevantData = {
      globalSettings,
      zZones,
      // Only model fields that affect slicing (not size, which Three.js updates after load)
      modelParams: models.map(m => ({
        id: m.id,
        toolhead: m.toolhead,
        scaffoldTools: m.scaffoldTools,
        fdmSettings: m.fdmSettings,
        transform: m.transform,
        advancedSettings: m.advancedSettings,
      })),
    };
    return JSON.stringify(relevantData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSettings, zZones, models.map(m => m.id).join(','),
      models.map(m => JSON.stringify(m.fdmSettings)).join('|'),
      models.map(m => JSON.stringify(m.transform)).join('|'),
      models.map(m => m.toolhead).join(','),
      models.map(m => JSON.stringify(m.advancedSettings)).join('|')]);

  const prevSlicingParamsRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSlicingParamsRef.current !== null && prevSlicingParamsRef.current !== slicingParamsHash) {
      if (gcodePreviewJob) {
        console.log("[App] Slicing parameters changed, reverting to model view.");
        setGcodePreviewJob(null);
        setSlicePercent(0);
        setSliceError(null);
      }
    }
    prevSlicingParamsRef.current = slicingParamsHash;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slicingParamsHash]);

  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [darkMode]);

  const handleFileUpload = (file: File, isCube = false) => {
    const url = URL.createObjectURL(file);
    const newModel: ModelData = {
      id: generateUUID(),
      name: file.name,
      url,
      file,
      isCube,
      transform: {
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        position: { x: 0, y: 0, z: 0 }
      },
      settings: {
        exposureTime: 2.5,
        lightIntensity: 15
      },
      advancedSettings: {
        enabled: false,
        segments: []
      },
      toolhead: 'fdm',
      fdmSettings: {
        infillPercent: globalSettings.infill ?? 15,
        infillPattern: globalSettings.infillPattern ?? 'grid',
        wallCount: globalSettings.perimeters ?? 2,
        topSolidLayers: globalSettings.topSolidLayers ?? 3,
        bottomSolidLayers: globalSettings.bottomSolidLayers ?? 3,
      },
    };

    setModels(prev => [...prev, newModel]);
    setSelectedModelId(newModel.id);
  };

  const handleDeleteModel = (id: string) => {
    const model = models.find(m => m.id === id);
    if (!model) return;

    const hasAssociatedZones = zZones.some(z => z.modelScope === id);
    const message = hasAssociatedZones 
      ? `Are you sure you want to delete "${model.name}"? This will also permanently remove all Z-Zones and custom configurations associated with this model.`
      : `Are you sure you want to delete "${model.name}"?`;

    if (window.confirm(message)) {
      setModels(prev => prev.filter(m => m.id !== id));
      
      // Also cleanup any Z-Zones specific to this model
      setZZones(prev => prev.filter(z => z.modelScope !== id));

      if (selectedModelId === id) {
        setSelectedModelId(null);
      }
    }
  };

  const handleTransformChange = (id: string, newTransform: TransformData) => {
    setModels(prev => prev.map(m =>
      m.id === id ? { ...m, transform: newTransform } : m
    ));
  };

  const handleUpdateModel = (id: string, updates: Partial<ModelData>) => {
    setModels(prev => prev.map(m =>
      m.id === id ? { ...m, ...updates } : m
    ));
  };

  const handleUpdateSettings = (id: string, newSettings: SliceSettings) => {
    setModels(prev => prev.map(m =>
      m.id === id ? { ...m, settings: newSettings } : m
    ));
  };

  const handleUpdateAdvancedSettings = (id: string, newSettings: AdvancedSliceSettings) => {
    setModels(prev => prev.map(m =>
      m.id === id ? { ...m, advancedSettings: newSettings } : m
    ));
  };

  const handleUpdateModifiers = (id: string, modifiers: any[]) => {
    setModels(prev => prev.map(m =>
      m.id === id ? { ...m, modifiers } : m
    ));
  };

  const handleApplySettingsToAll = (settings: SliceSettings) => {
    setModels(prev => prev.map(m => ({
      ...m,
      settings: { ...settings }
    })));
  };

  const handleUpdateModelSize = (id: string, size: { x: number, y: number, z: number }) => {
    setModels(prev => prev.map(m => {
      if (m.id !== id) return m;
      if (m.size &&
        Math.abs(m.size.x - size.x) < 0.01 &&
        Math.abs(m.size.y - size.y) < 0.01 &&
        Math.abs(m.size.z - size.z) < 0.01) {
        return m;
      }
      return { ...m, size };
    }));
  };

  const handleCloneModel = (id: string) => {
    const modelToClone = models.find(m => m.id === id);
    if (!modelToClone) return;

    const clonedSegments = modelToClone.advancedSettings.segments.map(s => ({ ...s, id: generateUUID() }));

    const newModel: ModelData = {
      ...modelToClone,
      id: generateUUID(),
      name: `${modelToClone.name} (Copy)`,
      file: modelToClone.file,
      transform: {
        ...modelToClone.transform,
        position: {
          x: modelToClone.transform.position.x + 10,
          y: modelToClone.transform.position.y + 10,
          z: modelToClone.transform.position.z
        },
        rotation: { ...modelToClone.transform.rotation },
        scale: { ...modelToClone.transform.scale }
      },
      settings: { ...modelToClone.settings },
      advancedSettings: {
        ...modelToClone.advancedSettings,
        segments: clonedSegments
      }
    };

    setModels(prev => [...prev, newModel]);
    setSelectedModelId(newModel.id);
  };

  const handleArrayModels = (spacing: number) => {
    if (models.length === 0) return;

    const count = models.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const colWidths = new Array(cols).fill(0);
    const rowDepths = new Array(rows).fill(0);

    models.forEach((model, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const width = model.size ? model.size.x : 10;
      const depth = model.size ? model.size.y : 10;
      if (width > colWidths[col]) colWidths[col] = width;
      if (depth > rowDepths[row]) rowDepths[row] = depth;
    });

    const totalWidth = colWidths.reduce((a, b) => a + b, 0) + (spacing * (cols - 1));
    const totalDepth = rowDepths.reduce((a, b) => a + b, 0) + (spacing * (rows - 1));

    const startX = -totalWidth / 2;
    const startY = -totalDepth / 2;

    const newModels = models.map((model, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      let xPos = startX;
      for (let i = 0; i < col; i++) xPos += colWidths[i] + spacing;
      xPos += colWidths[col] / 2;

      let yPos = startY;
      for (let i = 0; i < row; i++) yPos += rowDepths[i] + spacing;
      yPos += rowDepths[row] / 2;

      return {
        ...model,
        transform: {
          ...model.transform,
          position: { ...model.transform.position, x: xPos, y: yPos }
        }
      };
    });

    setModels(newModels);
  };

  const [lastSliceHash, setLastSliceHash] = useState<string | null>(null);

  // --- REAL SLICING LOGIC ---
  const handleSlice = () => {
    if (models.length === 0) {
      alert("Please add a model before slicing.");
      return;
    }

    // Multiwell size validation
    if (globalSettings.printBed?.type === 'multiwell_plate') {
      // FIX #4: Use centralized MULTIWELL_SPECS instead of local inline duplicate
      const overflowingModels: string[] = [];

      for (const model of models) {
        if (!model.transform.wellAssignment || !model.size) continue;

        const fmt = String(model.transform.wellAssignment.format);
        const spec = MULTIWELL_SPECS[fmt];
        if (!spec) continue;

        // Model footprint considering X/Y scale
        const sx = model.transform.scale.x ?? 1;
        const sy = model.transform.scale.y ?? 1;
        const modelW = model.size.x * sx;
        const modelD = model.size.y * sy;

        // The model diagonal must fit within the well diameter
        const modelDiagonal = Math.sqrt(modelW * modelW + modelD * modelD);

        if (modelDiagonal > spec.dia) {
          overflowingModels.push(
            `"${model.name}" (${modelW.toFixed(1)} × ${modelD.toFixed(1)} mm) → Well ${
              model.transform.wellAssignment.wellId
            } (ø${spec.dia} mm, plate ${fmt}-well)`
          );
        }
      }

      if (overflowingModels.length > 0) {
        alert(
          `⚠️ The following models do not fit inside their assigned well and cannot be sliced:\n\n` +
          overflowingModels.map(m => `• ${m}`).join('\n') +
          `\n\nPlease reduce the model scale or choose a plate format with larger wells.`
        );
        return;
      }
    }

    executeSlice();
  };


  const executeSlice = async () => {

    if (models.length === 0 || !models[0].file) {
      alert('No models loaded.');
      return;
    }

    setIsSlicing(true);
    setSliceError(null);
    setSlicePercent(0);
    setSliceProgress('Uploading STL to slicer...');
    setSliceStartTime(Date.now());

    const formData = new FormData();

    // Attach each model's STL and its metadata (transform, toolhead)
    const modelsMetadata = models.map(m => ({
      id: m.id,
      name: m.file?.name ?? m.name,
      transform: m.transform,
      toolhead: m.toolhead || 'fdm',

      // Enviamos ambos nombres por compatibilidad durante la transición
      scaffoldTools: m.scaffoldTools,
      scaffold_tools: m.scaffoldTools,

      fdm_settings: m.fdmSettings,
    }));

    formData.append('models_metadata', JSON.stringify(modelsMetadata));

    models.forEach(m => { if (m.file) formData.append('files[]', m.file); });

    // FDM print parameters
    const layerH = (globalSettings.layerHeight / 1000).toFixed(3); // μm → mm
    const firstLayerH = ((globalSettings.firstLayerHeight ?? 300) / 1000).toFixed(3); // μm → mm

    formData.append('layer_height', layerH);
    formData.append('first_layer_height', firstLayerH);
    formData.append('toolheads', JSON.stringify(globalSettings.toolheads));
    formData.append('nozzle_temp', String(globalSettings.nozzleTemperature ?? 210));
    formData.append('bed_temp', String(globalSettings.bedTemperature ?? 60));
    formData.append('infill', String(globalSettings.infill ?? 15));
    formData.append('infill_pattern', globalSettings.infillPattern ?? 'gyroid');
    formData.append('perimeters', String(globalSettings.perimeters ?? 3));
    formData.append('supports', globalSettings.supportsEnabled ? 'true' : 'false');
    formData.append('nozzle_diameter', String(globalSettings.nozzleDiameter ?? 0.4));
    formData.append('skirt_count', String(globalSettings.skirtCount ?? 1));
    formData.append('skirt_distance', String(globalSettings.skirtDistance ?? 6));
    formData.append('brim_width', String(globalSettings.brimWidth ?? 0));
    formData.append('top_shell', String(globalSettings.topSolidLayers ?? 3));
    formData.append('bottom_shell', String(globalSettings.bottomSolidLayers ?? 3));
    formData.append('fill_angle', String(globalSettings.fillAngle ?? 45));

    // Speeds
    formData.append('first_layer_speed', String(globalSettings.firstLayerSpeed ?? 20));
    formData.append('perimeter_speed', String(globalSettings.perimeterSpeed ?? 45));
    formData.append('external_perimeter_speed', String(globalSettings.externalPerimeterSpeed ?? 25));
    formData.append('infill_speed', String(globalSettings.infillSpeed ?? 80));
    formData.append('travel_speed', String(globalSettings.travelSpeed ?? 130));

    // Material & Retraction
    formData.append('retraction_length', String(globalSettings.retractionLength ?? 1.0));
    formData.append('retraction_speed', String(globalSettings.retractionSpeed ?? 45));
    formData.append('extrusion_multiplier', String(globalSettings.extrusionMultiplier ?? 1.0));

    // Cooling
    formData.append('fan_always_on', globalSettings.fanAlwaysOn !== false ? '1' : '0');
    formData.append('min_fan_speed', String(globalSettings.minFanSpeed ?? 100));
    formData.append('max_fan_speed', String(globalSettings.maxFanSpeed ?? 100));
    formData.append('disable_fan_first_layers', String(globalSettings.disableFanFirstLayers ?? 1));

    // Toolhead height zones
    formData.append('z_zones', JSON.stringify(zZones));

    // Resolved execution plan (normalized)
    const resolvedPlans = resolveLayerPlans(
      models, 
      calculatedTotalLayers, 
      zZones, 
      globalSettings.layerHeight / 1000, 
      (globalSettings.firstLayerHeight || 300) / 1000
    );
    formData.append('resolved_layer_plans', JSON.stringify(resolvedPlans));

    // Derive legacy layer_actions for backend G-code sanitizer (toolhead switching logic)
    const layer_h = globalSettings.layerHeight / 1000;
    const first_layer_h = (globalSettings.firstLayerHeight || 300) / 1000;
    
    const derivedLayerActions = zZones.map(zz => {
        const from = zz.zStartMm <= first_layer_h 
            ? 1 
            : Math.max(1, Math.ceil((zz.zStartMm - first_layer_h) / layer_h) + 1);
        
        const to = Math.max(from, Math.floor((zz.zEndMm - first_layer_h) / layer_h) + 1);

        return {
            id: zz.id,
            layerFrom: from,
            layerTo: to,
            modelId: zz.modelScope === 'all' ? 'all' : zz.modelScope,
            kind: zz.featureOverride ? 'feature_override' : (zz.parameterOverride ? 'parameter_override' : 'process_event'),
            toolOverride: zz.featureOverride?.toolhead,
            fdmSettings: zz.parameterOverride?.fdm,
            syringeSettings: zz.parameterOverride?.syringe,
            uvSettings: zz.processEvent ? {
               exposureTimeSec: zz.processEvent.uvExposureTimeSec || 5,
               doseTargetMjCm2: zz.processEvent.doseTargetMjCm2 || 0,
               pausePrint: zz.processEvent.pausePrint ?? true,
               mode: zz.processEvent.mode,
               pattern: zz.processEvent.pattern,
               scanSpeedMmS: zz.processEvent.scanSpeedMmS,
               powerPercentage: zz.processEvent.powerPercentage,
               lineSpacingMm: zz.processEvent.lineSpacingMm,
               zOffsetMm: zz.processEvent.zOffsetMm,
               trigger: zz.processEvent.trigger
            } : undefined,
            label: zz.label,
            color: zz.color
        };
    });
    formData.append('layer_actions', JSON.stringify(derivedLayerActions));




    try {
      console.log("[executeSlice] Sending FDM slice request...");
      const resp = await fetch('http://127.0.0.1:8000/fdm/slice', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) throw new Error(`Server error ${resp.status}: ${await resp.text()}`);

      const data = await resp.json();
      const jobId: string = data.job_id;
      console.log("[executeSlice] Job ID received:", jobId);
      setCurrentJobId(jobId);
      setSliceProgress('PrusaSlicer is processing...');

      // Poll /job/<id>/progress
      let layerCount = 0;
      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const pRes = await fetch(`http://127.0.0.1:8000/job/${jobId}/progress`);
            if (!pRes.ok) {
              console.warn("[executeSlice] Progress poll failed (404?), continuing...");
              return;
            }
            const p = await pRes.json();
            console.log("[executeSlice] Progress update:", p);

            setSliceProgress(p.message || 'Processing...');
            setSlicePercent(typeof p.progress === 'number' ? p.progress : 0);

            if (p.status === 'done') {
              clearInterval(poll);
              console.log("[executeSlice] Job done, fetching manifest...");

              const mRes = await fetch(`http://127.0.0.1:8000/fdm/job/${jobId}/manifest`);
              if (mRes.ok) {
                const manifest = await mRes.json();
                layerCount = manifest.layer_count ?? 0;
                console.log("[executeSlice] Manifest fetched. Layer count:", layerCount);
              } else {
                console.error("[executeSlice] Manifest fetch failed:", mRes.status);
              }
              resolve();
            } else if (p.status === 'error') {
              clearInterval(poll);
              reject(new Error(p.message || 'Slicing failed'));
            }
          } catch (err) {
            console.error("[executeSlice] Polling error:", err);
          }
        }, 800);
      });

      console.log("[executeSlice] Slicing workflow complete.");
      setIsSlicing(false);
      setSliceProgress('');

      if (jobId) {
        setGcodePreviewJob({ jobId, layerCount, nozzleDiameter: globalSettings.nozzleDiameter });
      }
      return { jobId, layerCount };

    } catch (error) {
      console.error("[executeSlice] Caught error:", error);
      const msg = (error as Error).message;
      setSliceProgress('');
      setIsSlicing(false);
      alert(`Slice error: ${msg}`);
      return null;
    }
  };



  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files) as File[];
    const validFiles = files.filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith('.stl');
    });

    if (validFiles.length > 0) {
      validFiles.forEach(file => handleFileUpload(file));
    }
  };

  const handleSaveProject = async () => {
    try {
      const zip = new JSZip();

      const modelsMetadata = await Promise.all(models.map(async (m, index) => {
        if (m.file) {
          const buffer = await fileToArrayBuffer(m.file);
          const stlFilename = `model_${index}.stl`;
          zip.file(stlFilename, buffer);

          return {
            ...m,
            file: undefined,
            url: undefined,
            externalFilename: stlFilename,
            originalFilename: m.file.name
          };
        }
        return m;
      }));

      const projectData = {
        models: modelsMetadata,
        globalSettings,
        zZones,
        version: "3.5"
      };

      zip.file("project.json", JSON.stringify(projectData, null, 2));

      const content = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `project-${new Date().toISOString().slice(0, 10)}.bpp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Save failed:", error);
      alert("Failed to save project.");
    }
  };

  const handleLoadProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bpp,.zip';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const zip = await JSZip.loadAsync(file);

        const metadataFile = zip.file("project.json");
        if (!metadataFile) throw new Error("Invalid project file: missing project.json");

        const metadataText = await metadataFile.async("string");
        const projectData = JSON.parse(metadataText);

        if (projectData.globalSettings) {
          setGlobalSettings(projectData.globalSettings);
        }
        if (projectData.zZones) {
          setZZones(projectData.zZones);
        }

        if (projectData.models) {
          const rehydratedModels = await Promise.all(projectData.models.map(async (m: any) => {
            let fileObj = undefined;
            let url = "";

            if (m.externalFilename) {
              const stlFile = zip.file(m.externalFilename);
              if (stlFile) {
                const blob = await stlFile.async("blob");
                const originalName = m.originalFilename || m.externalFilename;
                fileObj = new File([blob], originalName, { type: "model/stl" });
                url = URL.createObjectURL(fileObj);
              }
            }

            return {
              ...m,
              file: fileObj,
              url: url,
              id: m.id || generateUUID(),
              externalFilename: undefined,
              originalFilename: undefined
            };
          }));

          setModels(rehydratedModels as ModelData[]);
          if (rehydratedModels.length > 0) {
            setSelectedModelId(rehydratedModels[0].id);
          }
        }

      } catch (err) {
        console.error("Failed to load project", err);
        alert("Failed to load project file. Ensure it is a valid .bpp or .zip file.");
      }
    };
    input.click();
  };


  const maxModelHeight = Math.max(...models.map(m => (m.size?.z ?? 0) * (m.transform.scale.z ?? 1)), 0);
  const calculatedTotalLayers = maxModelHeight > 0 
    ? Math.ceil(maxModelHeight / (globalSettings.layerHeight / 1000)) 
    : 100;

  return (
    <div
      className="h-screen w-screen flex flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 transition-colors duration-200 relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Header
        darkMode={darkMode}
        toggleDarkMode={() => setDarkMode(!darkMode)}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onOpenWifi={() => setIsWifiOpen(true)}
        activeStep={activeStep}
        setActiveStep={setActiveStep}
      />




      <div className="flex flex-1 overflow-hidden relative">
        <LayersPanel
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          models={models}
          globalSettings={globalSettings}
          onUpdateGlobalSettings={setGlobalSettings}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          onDeleteModel={handleDeleteModel}
          onUpdateModel={handleUpdateModel}
          onTransformChange={(data) => selectedModelId && handleTransformChange(selectedModelId, data)}
          onUpdateSettings={(data) => selectedModelId && handleUpdateSettings(selectedModelId, data)}
          onUpdateAdvancedSettings={(data) => selectedModelId && handleUpdateAdvancedSettings(selectedModelId, data)}
          onApplySettingsToAll={handleApplySettingsToAll}
          isAdvancedSliceMode={isAdvancedSliceMode}
          setIsAdvancedSliceMode={setIsAdvancedSliceMode}
          onSlice={handleSlice}
          onFileUpload={handleFileUpload}
          toolheads={toolheads}
          totalLayers={calculatedTotalLayers}
          onUpdateToolheads={setToolheads}
          zZones={zZones}
          onUpdateZZones={setZZones}
          onOpenHelp={setHelpTopic}
          // Integrated slicing workflow props
          isSlicing={isSlicing}
          slicePercent={slicePercent}
          sliceMessage={sliceProgress}
          hasGCode={!!gcodePreviewJob}
          onPrint={() => console.log("Printing job:", gcodePreviewJob?.jobId)}
          jobId={currentJobId}
        />

        <main className="flex-1 relative overflow-hidden bg-slate-100 dark:bg-slate-950">
          {/* Viewport always shows — in GCode mode the STL is hidden and toolpaths are rendered inside */}
          <Viewport
            models={models}
            selectedModelId={selectedModelId}
            onSelectModel={setSelectedModelId}
            onTransformChange={handleTransformChange}
            onUpdateModelSize={handleUpdateModelSize}
            onUpdateAdvancedSettings={(data) => selectedModelId && handleUpdateAdvancedSettings(selectedModelId, data)}
            onCloneModel={handleCloneModel}
            onArrayModels={handleArrayModels}
            onDeleteModel={handleDeleteModel}

            isAdvancedSliceMode={isAdvancedSliceMode}
            globalSettings={globalSettings}
            zZones={zZones}
            gcodeJob={gcodePreviewJob ? {
              jobId: gcodePreviewJob.jobId,
              gcodeUrl: `http://127.0.0.1:8000/fdm/job/${gcodePreviewJob.jobId}/gcode`,
              nozzleDiameter: gcodePreviewJob.nozzleDiameter
            } : null}
            onExitGCode={() => setGcodePreviewJob(null)}
          />

          {/* ── Wifi Config Modal ── */}
          {isWifiOpen && (
            <WifiConfig onClose={() => setIsWifiOpen(false)} />
          )}

          {isDragging && (
            <div className="absolute inset-4 z-50 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 backdrop-blur-sm flex flex-col items-center justify-center text-primary pointer-events-none">
              <Icon name="upload_file" className="text-4xl mb-2 opacity-50" />
              <span className="text-sm font-medium">Drop STL file here</span>
              <span className="text-xs text-slate-400 mt-1">to add to the scene</span>
            </div>
          )}
        </main>
      </div>

      <HelpWiki topic={helpTopic} onClose={() => setHelpTopic(null)} />
    </div>
  );
}