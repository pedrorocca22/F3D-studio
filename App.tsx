import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { CalibrationTool } from './components/CalibrationTool';
import { WifiConfig } from './components/WifiConfig/WifiConfig';
import JSZip from 'jszip';
import { LayersPanel } from './components/LayersPanel/LayersPanel';
import { Viewport } from './components/Viewport/Viewport';
import { GCodePreview } from './components/GCodePreview/GCodePreview';

import { ExperimentsPanel } from './components/Experiments/ExperimentsPanel';
import { ExperimentDetails } from './components/Experiments/ExperimentDetails';
import { Icon } from './components/Icon';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SceneObject, SliceJobResponse, BackendRangeOverride, ToolheadConfig, LayerAction, FDMToolheadConfig, SyringeToolheadConfig, UVToolheadConfig } from './types';
import { generateUUID } from './utils';

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
  const [isExperimentsMode, setIsExperimentsMode] = useState(false);
  const [viewingExperimentId, setViewingExperimentId] = useState<string | null>(null);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isWifiOpen, setIsWifiOpen] = useState(false);

  // Slicing State
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState('');
  const [slicePercent, setSlicePercent] = useState(0);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [sliceStartTime, setSliceStartTime] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Pre-flight State
  const [showPreFlight, setShowPreFlight] = useState(false);
  const [experimentName, setExperimentName] = useState('');
  const [experimentAuthor, setExperimentAuthor] = useState('');
  const [experimentIntent, setExperimentIntent] = useState('');
  const [experimentMaterial, setExperimentMaterial] = useState('');

  // Global Print Settings (Physical machine constraints)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    layerHeight: 200, // 0.2mm = 200um
    nozzleTemperature: 210,
    bedTemperature: 60,
    infill: 15,
    infillPattern: 'gyroid',
    perimeters: 3,
    supportsEnabled: false
  });

  // State for multiple models
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Toolheads state ──────────────────────────────────────────────
  const DEFAULT_TOOLHEADS: ToolheadConfig[] = [
    {
      id: 'fdm', label: 'FDM Hot-end', klipper_tool: 'T0', installed: true,
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
  const [layerActions, setLayerActions] = useState<LayerAction[]>([]);

  // G-code preview state
  const [gcodePreviewJob, setGcodePreviewJob] = useState<{ jobId: string; layerCount: number } | null>(null);


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
      }
    };

    setModels(prev => [...prev, newModel]);
    setSelectedModelId(newModel.id);
  };

  const handleDeleteModel = (id: string) => {
    setModels(prev => prev.filter(m => m.id !== id));
    if (selectedModelId === id) {
      setSelectedModelId(null);
    }
  };

  const handleTransformChange = (id: string, newTransform: TransformData) => {
    setModels(prev => prev.map(m =>
      m.id === id ? { ...m, transform: newTransform } : m
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

    setExperimentName(`Exp: ${models[0].name.replace('.stl', '')}`);
    setShowPreFlight(true);
  };

  const executeSlice = async () => {
    setShowPreFlight(false);

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

    // Attach each model's STL
    models.forEach(m => { if (m.file) formData.append('files[]', m.file); });

    // FDM print parameters
    const layerH = (globalSettings.layerHeight / 1000).toFixed(3); // μm → mm
    formData.append('layer_height', layerH);
    formData.append('nozzle_temp', String(globalSettings.nozzleTemperature ?? 210));
    formData.append('bed_temp', String(globalSettings.bedTemperature ?? 60));
    formData.append('infill', String(globalSettings.infill ?? 15));
    formData.append('infill_pattern', globalSettings.infillPattern ?? 'gyroid');
    formData.append('perimeters', String(globalSettings.perimeters ?? 3));
    formData.append('supports', globalSettings.supportsEnabled ? 'true' : 'false');

    // Toolhead layer-schedule
    formData.append('layer_actions', JSON.stringify(layerActions));

    // Experiment metadata
    formData.append('experiment_name', experimentName);
    formData.append('author', experimentAuthor);
    formData.append('intent', experimentIntent);
    formData.append('material', experimentMaterial);

    try {
      const resp = await fetch('http://127.0.0.1:8000/fdm/slice', {
        method: 'POST',
        body: formData,
      });

      if (!resp.ok) throw new Error(`Server error ${resp.status}: ${await resp.text()}`);

      const data = await resp.json();
      const jobId: string = data.job_id;
      setCurrentJobId(jobId);
      setSliceProgress('PrusaSlicer is processing...');

      // Poll /fdm/job/<id>/progress (uses the shared _slice_jobs dict)
      // Note: we re-use the existing progress endpoint pattern
      let layerCount = 0;
      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const pRes = await fetch(`http://127.0.0.1:8000/job/${jobId}/progress`);
            if (!pRes.ok) return;
            const p = await pRes.json();
            setSliceProgress(p.message || 'Processing...');
            setSlicePercent(typeof p.progress === 'number' ? p.progress : 0);
            if (p.status === 'done') {
              clearInterval(poll);
              // Fetch manifest to get layer_count
              const mRes = await fetch(`http://127.0.0.1:8000/fdm/job/${jobId}/manifest`);
              if (mRes.ok) {
                const manifest = await mRes.json();
                layerCount = manifest.layer_count ?? 0;
              }
              resolve();
            } else if (p.status === 'error') {
              clearInterval(poll);
              reject(new Error(p.message || 'Slicing failed'));
            }
          } catch { /* hiccup */ }
        }, 500);
      });

      setIsSlicing(false);
      setLastSliceHash(JSON.stringify({ models: models.map(m => m.file?.name) }));

      // Open G-code preview automatically
      setGcodePreviewJob({ jobId, layerCount });

    } catch (error) {
      const msg = (error as Error).message;
      setSliceError(msg.includes('Failed to fetch')
        ? 'Cannot reach server.\nMake sure server.py is running on port 8000.'
        : msg);
    } finally {
      setIsSlicing(false);
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
        version: "2.0"
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

  // --- RENDER ---

  if (isSlicePreviewMode && currentJobId) {
    return (
      <div className="flex flex-col items-center justify-center p-8 h-screen w-screen bg-slate-900 text-slate-300">
        <Icon name="code" className="text-6xl text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-4 text-white">G-Code Preview (FDM)</h2>
        <p className="mb-6">The 3D visual toolpath viewer is coming soon.</p>
        <button
          onClick={() => {
            setIsSlicePreviewMode(false);
            setIsExperimentsMode(true);
          }}
          className="px-6 py-2 bg-primary rounded-md text-white font-bold text-sm shadow hover:bg-teal-500"
        >
          Back
        </button>
      </div>
    );
  }

  if (isExperimentsMode) {
    return (
      <div className="h-screen w-screen flex flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <Header
          darkMode={darkMode}
          toggleDarkMode={() => setDarkMode(!darkMode)}
          onSaveProject={handleSaveProject}
          onLoadProject={handleLoadProject}
          onOpenCalibration={() => setIsCalibrationOpen(true)}
          onOpenExperiments={() => setIsExperimentsMode(!isExperimentsMode)}
        />
        {viewingExperimentId ? (
          <ExperimentDetails
            experimentId={viewingExperimentId}
            onBack={() => setViewingExperimentId(null)}
            onOpenPreview={(id) => {
              setCurrentJobId(id);
              setIsSlicePreviewMode(true);
              setIsExperimentsMode(false);
            }}
            onDelete={() => setViewingExperimentId(null)}
          />
        ) : (
          <ExperimentsPanel
            onClose={() => setIsExperimentsMode(false)}
            onReplicate={(id) => { console.log("Replicate", id) }}
            onViewDetails={(id) => setViewingExperimentId(id)}
            onOpenPreview={(id) => {
              setCurrentJobId(id);
              setIsSlicePreviewMode(true);
              setIsExperimentsMode(false);
            }}
          />
        )}
      </div>
    );
  }

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
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        onOpenExperiments={() => {
          setIsExperimentsMode(true);
          setViewingExperimentId(null);
        }}
        onOpenWifi={() => setIsWifiOpen(true)}
      />
      {isCalibrationOpen && (
        <CalibrationTool onClose={() => setIsCalibrationOpen(false)} />
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <LayersPanel
          models={models}
          globalSettings={globalSettings}
          onUpdateGlobalSettings={setGlobalSettings}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          onDeleteModel={handleDeleteModel}
          onTransformChange={(data) => selectedModelId && handleTransformChange(selectedModelId, data)}
          onUpdateSettings={(data) => selectedModelId && handleUpdateSettings(selectedModelId, data)}
          onUpdateAdvancedSettings={(data) => selectedModelId && handleUpdateAdvancedSettings(selectedModelId, data)}
          onApplySettingsToAll={handleApplySettingsToAll}
          isAdvancedSliceMode={isAdvancedSliceMode}
          setIsAdvancedSliceMode={setIsAdvancedSliceMode}
          onSlice={handleSlice}
          onFileUpload={handleFileUpload}
          toolheads={toolheads}
          layerActions={layerActions}
          totalLayers={models.find(m => m.id === selectedModelId)?.advancedSettings?.segments?.length ?? 0}
          onUpdateToolheads={setToolheads}
          onUpdateLayerActions={setLayerActions}
        />
        <Viewport
          models={models}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          onTransformChange={handleTransformChange}
          onUpdateModelSize={handleUpdateModelSize}
          onUpdateAdvancedSettings={(data) => selectedModelId && handleUpdateAdvancedSettings(selectedModelId, data)}
          onCloneModel={handleCloneModel}
          onArrayModels={handleArrayModels}
          onFileUpload={handleFileUpload}
          isAdvancedSliceMode={isAdvancedSliceMode}
          globalSettings={globalSettings}
        />

        {/* ── Wifi Config Modal ── */}
        {isWifiOpen && (
          <WifiConfig onClose={() => setIsWifiOpen(false)} />
        )}

        {/* ── Pre-Flight Modal ── */}
        {showPreFlight && (
          <div className="absolute inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl w-[500px] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex-shrink-0">
              <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Icon name="biotech" className="text-primary" /> Experiment Pre-Flight
                </h3>
                <button onClick={() => setShowPreFlight(false)} className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
                  <Icon name="close" className="text-xl" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-slate-700 dark:text-slate-300">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">Experiment Name</label>
                  <input
                    type="text"
                    value={experimentName}
                    onChange={e => setExperimentName(e.target.value)}
                    placeholder="e.g. Scaffolds v2 - High Exposure"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">Author</label>
                  <input
                    type="text"
                    value={experimentAuthor}
                    onChange={e => setExperimentAuthor(e.target.value)}
                    placeholder="e.g. Dr. Jane Doe"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">Intent / Notes</label>
                  <textarea
                    value={experimentIntent}
                    onChange={e => setExperimentIntent(e.target.value)}
                    placeholder="What are you trying to test or achieve in this print?"
                    className="w-full h-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1 ml-1">Material</label>
                  <input
                    type="text"
                    value={experimentMaterial}
                    onChange={e => setExperimentMaterial(e.target.value)}
                    placeholder="e.g. PEGDA 20% + LAP"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                </div>
              </div>

              <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
                <button onClick={() => setShowPreFlight(false)} className="px-5 py-2 rounded-md font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm">Cancel</button>
                <button onClick={executeSlice} className="px-5 py-2 bg-primary hover:bg-opacity-90 text-white rounded-md font-bold text-sm shadow-md transition-all flex items-center gap-2">
                  <Icon name="play_arrow" className="text-lg" /> Start Slicing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Slicing Loader Overlay ── */}
        {isSlicing && (
          <div className="absolute inset-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-5 p-8 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl w-[400px]">

              {/* Large percentage */}
              <div className="flex items-center justify-center my-2">
                <span className="text-7xl font-bold text-primary">
                  {slicePercent > 0.02 ? `${Math.round(slicePercent * 100)}%` : '...'}
                </span>
              </div>

              {/* Title + elapsed */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-0.5">Slicing Model</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Elapsed: {Math.round((Date.now() - sliceStartTime) / 1000)}s
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, slicePercent * 100)}%` }}
                />
              </div>

              {/* Live message or error */}
              <div className="w-full bg-slate-50 dark:bg-slate-900/50 rounded-lg px-4 py-3 min-h-[52px] flex items-start border border-slate-100 dark:border-slate-700/50">
                {sliceError ? (
                  <div className="w-full">
                    <p className="text-xs text-red-500 font-bold mb-1">Error</p>
                    <p className="text-xs text-red-500/80 dark:text-red-400 whitespace-pre-wrap">{sliceError}</p>
                    <button
                      onClick={() => { setIsSlicing(false); setSliceError(null); }}
                      className="mt-2 text-xs font-bold text-red-600 hover:text-red-700 dark:hover:text-red-300 underline"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-mono leading-relaxed">
                    {sliceProgress || 'Working...'}
                  </p>
                )}
              </div>

              {/* Step pills: Transform → Slicer → Pattern → Manifest */}
              <div className="w-full grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Transform', done: slicePercent >= 0.20, active: slicePercent > 0 && slicePercent < 0.20 },
                  { label: 'Slicer', done: slicePercent >= 0.50, active: slicePercent >= 0.20 && slicePercent < 0.50 },
                  { label: 'Pattern', done: slicePercent >= 0.88, active: slicePercent >= 0.50 && slicePercent < 0.88 },
                  { label: 'Manifest', done: slicePercent >= 1.00, active: slicePercent >= 0.88 && slicePercent < 1.00 },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`w-full h-1.5 rounded-full transition-all duration-500 ${step.done ? 'bg-green-500'
                      : step.active ? 'bg-primary animate-pulse'
                        : 'bg-slate-200 dark:bg-slate-700'
                      }`} />
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${step.done ? 'text-green-600 dark:text-green-500'
                      : step.active ? 'text-primary'
                        : 'text-slate-400'
                      }`}>{step.label}</span>
                  </div>
                ))}
              </div>

            </div>
          </div>
        )}
      </div>

      {isDragging && (
        <div className="absolute inset-4 z-50 rounded-xl border-4 border-dashed border-primary bg-blue-50/90 dark:bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-primary animate-in fade-in duration-200 pointer-events-none">
          <Icon name="upload_file" className="text-8xl mb-4" />
          <span className="text-3xl font-bold">Drop STL file here</span>
          <span className="text-lg text-slate-500 dark:text-slate-400 mt-2">to add it to the scene</span>
        </div>
      )}
      {gcodePreviewJob && (
        <GCodePreview
          jobId={gcodePreviewJob.jobId}
          layerCount={gcodePreviewJob.layerCount}
          gcodeUrl={`http://127.0.0.1:8000/fdm/job/${gcodePreviewJob.jobId}/gcode`}
          onClose={() => setGcodePreviewJob(null)}
        />
      )}
    </div>
  );
}