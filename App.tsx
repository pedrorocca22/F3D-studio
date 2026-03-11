import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { CalibrationTool } from './components/CalibrationTool';
import { WifiConfig } from './components/WifiConfig/WifiConfig';
import JSZip from 'jszip';
import { LayersPanel } from './components/LayersPanel/LayersPanel';
import { Viewport } from './components/Viewport/Viewport';
// GCodePreview is now integrated into Viewport directly

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
    supportsEnabled: false,
    nozzleDiameter: 0.4
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
  const [gcodePreviewJob, setGcodePreviewJob] = useState<{
    jobId: string;
    layerCount: number;
    nozzleDiameter?: number
  } | null>(null);


  // Auto-reset G-code preview if settings or models change
  useEffect(() => {
    if (gcodePreviewJob) {
      console.log("[App] Settings or models changed, reverting to model view.");
      setGcodePreviewJob(null);
      setSlicePercent(0);
      setSliceError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalSettings, models, layerActions]);

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

    // Attach each model's STL and its metadata (transform)
    const modelsMetadata = models.map(m => ({
      name: m.file?.name,
      transform: m.transform
    }));
    formData.append('models_metadata', JSON.stringify(modelsMetadata));

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
    formData.append('nozzle_diameter', String(globalSettings.nozzleDiameter ?? 0.4));

    // Toolhead layer-schedule
    formData.append('layer_actions', JSON.stringify(layerActions));

    // Experiment metadata
    formData.append('experiment_name', experimentName);
    formData.append('author', experimentAuthor);
    formData.append('intent', experimentIntent);
    formData.append('material', experimentMaterial);

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
      setLastSliceHash(JSON.stringify({ models: models.map(m => m.file?.name) }));

      // Open G-code preview automatically
      if (jobId) {
        setGcodePreviewJob({ jobId, layerCount, nozzleDiameter: globalSettings.nozzleDiameter });
      }

    } catch (error) {
      console.error("[executeSlice] Caught error:", error);
      const msg = (error as Error).message;
      setSliceError(msg.includes('Failed to fetch')
        ? 'Cannot reach server.\nMake sure server.py is running on port 8000.'
        : msg);
      setIsSlicing(false); // Ensure overlay stays open for errors
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
          // Integrated slicing workflow props
          isSlicing={isSlicing}
          slicePercent={slicePercent}
          sliceMessage={sliceProgress}
          hasGCode={!!gcodePreviewJob}
          onPrint={() => console.log("Printing job:", gcodePreviewJob?.jobId)}
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
            onFileUpload={handleFileUpload}
            isAdvancedSliceMode={isAdvancedSliceMode}
            globalSettings={globalSettings}
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

          {/* ── Experiments Mode (Absolute Overlay) ── */}
          {isExperimentsMode && (
            <div className="absolute inset-0 z-[60] bg-white dark:bg-slate-950 flex flex-col animate-in fade-in slide-in-from-bottom-5 duration-300">
              <Header
                darkMode={darkMode}
                toggleDarkMode={() => setDarkMode(!darkMode)}
                onSaveProject={handleSaveProject}
                onLoadProject={handleLoadProject}
                onOpenCalibration={() => setIsCalibrationOpen(true)}
                onOpenExperiments={() => setIsExperimentsMode(false)}
              />
              <div className="flex-1 overflow-hidden">
                {viewingExperimentId ? (
                  <ExperimentDetails
                    experimentId={viewingExperimentId}
                    onBack={() => setViewingExperimentId(null)}
                    onOpenPreview={(id) => {
                      setCurrentJobId(id);
                      setIsExperimentsMode(false);
                      // In integrated mode, we just set the preview job
                      setGcodePreviewJob({ jobId: id, layerCount: 100, nozzleDiameter: globalSettings.nozzleDiameter });
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
                      setIsExperimentsMode(false);
                      setGcodePreviewJob({ jobId: id, layerCount: 100, nozzleDiameter: globalSettings.nozzleDiameter });
                    }}
                  />
                )}
              </div>
            </div>
          )}



          {isDragging && (
            <div className="absolute inset-4 z-50 rounded-xl border-4 border-dashed border-primary bg-blue-50/90 dark:bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center text-primary animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
              <Icon name="upload_file" className="text-8xl mb-4" />
              <span className="text-3xl font-bold">Drop STL file here</span>
              <span className="text-lg text-slate-500 dark:text-slate-400 mt-2">to add it to the scene</span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}