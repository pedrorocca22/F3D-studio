import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { CalibrationTool } from './components/CalibrationTool';
import JSZip from 'jszip';
import { LayersPanel } from './components/LayersPanel/LayersPanel';
import { Viewport } from './components/Viewport/Viewport';
import { SlicePreview } from './components/SlicePreview';
import { Icon } from './components/Icon';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, SceneObject, SliceJobResponse, BackendRangeOverride } from './types';
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
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);

  // Slicing State
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState('');
  const [slicePercent, setSlicePercent] = useState(0);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [sliceStartTime, setSliceStartTime] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Global Print Settings (Physical machine constraints)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    layerHeight: 50
  });

  // State for multiple models
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Pattern Library State
  const [patterns, setPatterns] = useState<import('./types').Pattern[]>([]);

  // Load patterns from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('dlp3_patterns');
    if (saved) {
      try {
        setPatterns(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved patterns", e);
      }
    }
  }, []);

  // Save patterns to localStorage when they change
  useEffect(() => {
    localStorage.setItem('dlp3_patterns', JSON.stringify(patterns));
  }, [patterns]);

  const handleSavePattern = (pattern: import('./types').Pattern) => {
    setPatterns(prev => {
      const exists = prev.find(p => p.id === pattern.id);
      if (exists) {
        return prev.map(p => p.id === pattern.id ? pattern : p);
      }
      return [...prev, pattern];
    });
  };

  const handleDeletePattern = (id: string) => {
    setPatterns(prev => prev.filter(p => p.id !== id));
  };

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

  // --- REAL SLICING LOGIC ---
  const handleSlice = async () => {
    if (models.length === 0) {
      alert("Please add a model before slicing.");
      return;
    }

    setIsSlicing(true);
    setSliceError(null);
    setSlicePercent(0);
    setSliceProgress('Preparing scene data...');
    setSliceStartTime(Date.now());

    const formData = new FormData();
    const sceneData: SceneObject[] = [];

    // 1. Build Scene Data matching Backend Expectations
    const adhesionEnabled = globalSettings.adhesion?.enabled ?? false;
    const adhesionLayers = globalSettings.adhesion?.layers ?? 0;
    const adhesionHeightMM = adhesionEnabled ? (adhesionLayers * (globalSettings.adhesion?.layerHeight ?? 50)) / 1000 : 0;

    if (adhesionEnabled) {
      formData.append('initial_layer_height', ((globalSettings.adhesion?.layerHeight ?? 50) / 1000).toString());
      if (globalSettings.adhesion?.exposureTime) {
        formData.append('initial_exposure_time', globalSettings.adhesion.exposureTime.toString());
      }
      formData.append('faded_layers', adhesionLayers.toString());
    }

    models.forEach((model, index) => {
      if (!model.file) return;

      formData.append('files[]', model.file);

      const dose = model.settings.exposureTime * model.settings.lightIntensity;
      const layerHeightMM = globalSettings.layerHeight / 1000;

      let currentStartLayer = 0;
      if (adhesionEnabled) {
        currentStartLayer = adhesionLayers;
      }

      const ranges = model.advancedSettings.enabled
        ? model.advancedSettings.segments.map(seg => {
          let endLayer = 0;
          let startLayer = currentStartLayer;

          if (seg.bottomLimit !== undefined) {
            const startH = seg.bottomLimit;
            if (adhesionEnabled && startH > adhesionHeightMM) {
              const extraHeight = startH - adhesionHeightMM;
              startLayer = adhesionLayers + Math.floor(extraHeight / layerHeightMM);
            } else {
              const effectiveLH = adhesionEnabled && startH <= adhesionHeightMM
                ? ((globalSettings.adhesion?.layerHeight ?? 50) / 1000)
                : layerHeightMM;
              startLayer = Math.floor(startH / effectiveLH);
            }
          }

          if (adhesionEnabled && seg.topLimit > adhesionHeightMM) {
            const extraHeight = seg.topLimit - adhesionHeightMM;
            const extraLayers = extraHeight / layerHeightMM;
            endLayer = adhesionLayers + Math.floor(extraLayers);
          } else {
            const effectiveLH = adhesionEnabled && seg.topLimit <= adhesionHeightMM
              ? ((globalSettings.adhesion?.layerHeight ?? 50) / 1000)
              : layerHeightMM;
            endLayer = Math.floor(seg.topLimit / effectiveLH);
          }

          if (endLayer <= startLayer) return null;

          const rangeObj: BackendRangeOverride = {
            start: startLayer,
            end: endLayer,
            gradientMode: seg.gradientMode || 'flat',
            irr: seg.lightIntensity,
            exposure: seg.exposureTime,
            ...(seg.gradientMode === 'gradient' ? {
              endLightIntensity: seg.endLightIntensity ?? seg.lightIntensity,
              endExposureTime: seg.endExposureTime ?? seg.exposureTime
            } : {}),
            ...(seg.modifiers && seg.modifiers.length > 0 ? { modifiers: seg.modifiers } : {})
          };
          currentStartLayer = endLayer;
          return rangeObj;
        }).filter(Boolean) as BackendRangeOverride[]
        : [];

      sceneData.push({
        original_filename: model.file.name,
        pos_x_mm: model.transform.position.x,
        pos_y_mm: model.transform.position.y,
        scale: model.transform.scale.x,
        scale_x: model.transform.scale.x,
        scale_y: model.transform.scale.y,
        scale_z: model.transform.scale.z,
        irradiance_mW_cm2: model.settings.lightIntensity,
        dose_mJ_cm2: dose,
        rotation: { x: model.transform.rotation.x, y: model.transform.rotation.y, z: model.transform.rotation.z },
        override_ranges: ranges,
        modifiers: model.modifiers && model.modifiers.length > 0 ? [...model.modifiers] : []
      });
    });

    console.log("[App] Slicing Scene Data:", JSON.stringify(sceneData, null, 2));
    if (sceneData.length > 0) {
      console.log("[App] First Model Ranges:", sceneData[0].override_ranges);
      sceneData[0].override_ranges.forEach((r, i) => {
        console.log(`[App] Range ${i} Modifiers:`, r.modifiers);
      });
    }

    formData.append('scene_json', JSON.stringify(sceneData));
    formData.append('layer_height', (globalSettings.layerHeight / 1000).toString());

    try {
      setSliceProgress('Uploading to server...');

      const API_URL = 'http://127.0.0.1:8000/slice_scene';

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Server Error ${response.status}`);
      }

      const data: SliceJobResponse = await response.json();
      const jobId = data.job_id;
      setCurrentJobId(jobId);
      setSliceProgress('Waiting for slicer to start...');

      // --- Poll /job/<id>/progress until done or error ---
      await new Promise<void>((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const pRes = await fetch(`http://127.0.0.1:8000/job/${jobId}/progress`);
            if (!pRes.ok) return;
            const p = await pRes.json();
            setSliceProgress(p.message || 'Processing...');
            setSlicePercent(typeof p.progress === 'number' ? p.progress : 0);
            if (p.status === 'done') { clearInterval(poll); resolve(); }
            else if (p.status === 'error') { clearInterval(poll); reject(new Error(p.message || 'Slicing failed')); }
          } catch { /* network hiccup — keep polling */ }
        }, 500);
      });

      setIsSlicing(false);
      setIsSlicePreviewMode(true);

    } catch (error) {
      const msg = (error as Error).message;
      setSliceError(msg.includes('Failed to fetch')
        ? 'Cannot reach server.\nEnsure server.py is running.'
        : msg);
      // keep overlay open so the user sees the error; Dismiss button closes it
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
      <SlicePreview
        onBack={() => setIsSlicePreviewMode(false)}
        layerHeight={globalSettings.layerHeight}
        jobId={currentJobId}
      />
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
          onUpdateModifiers={(mods) => selectedModelId && handleUpdateModifiers(selectedModelId, mods)}
          onApplySettingsToAll={handleApplySettingsToAll}
          isAdvancedSliceMode={isAdvancedSliceMode}
          setIsAdvancedSliceMode={setIsAdvancedSliceMode}
          onSlice={handleSlice}
          patterns={patterns}
          onFileUpload={handleFileUpload}
        />
        <Viewport
          models={models}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          onTransformChange={handleTransformChange}
          onUpdateModelSize={handleUpdateModelSize}
          onUpdateAdvancedSettings={(data) => selectedModelId && handleUpdateAdvancedSettings(selectedModelId, data)}
          onUpdateModifiers={(mods) => selectedModelId && handleUpdateModifiers(selectedModelId, mods)}
          onCloneModel={handleCloneModel}
          onArrayModels={handleArrayModels}
          onFileUpload={handleFileUpload}
          isAdvancedSliceMode={isAdvancedSliceMode}
          globalSettings={globalSettings}
          patterns={patterns}
          onSavePattern={handleSavePattern}
          onDeletePattern={handleDeletePattern}
        />

        {/* ── Slicing Loader Overlay ── */}
        {isSlicing && (
          <div className="absolute inset-0 z-50 bg-slate-900/85 backdrop-blur-sm flex items-center justify-center text-white">
            <div className="flex flex-col items-center gap-5 p-8 rounded-2xl bg-[#111827] border border-slate-700 shadow-2xl w-[400px]">

              {/* Animated rings + percentage */}
              <div className="relative w-20 h-20 flex-shrink-0">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
                <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                {slicePercent > 0.05 && (
                  <div
                    className="absolute inset-2 rounded-full border-2 border-purple-400/40 border-b-transparent animate-spin"
                    style={{ animationDirection: 'reverse', animationDuration: '1.8s' }}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-400">
                    {slicePercent > 0.02 ? `${Math.round(slicePercent * 100)}%` : '...'}
                  </span>
                </div>
              </div>

              {/* Title + elapsed */}
              <div className="text-center">
                <h3 className="text-lg font-bold tracking-tight mb-0.5">Slicing Model</h3>
                <p className="text-xs text-slate-400">
                  Elapsed: {Math.round((Date.now() - sliceStartTime) / 1000)}s
                </p>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(2, slicePercent * 100)}%` }}
                />
              </div>

              {/* Live message or error */}
              <div className="w-full bg-slate-800/60 rounded-lg px-4 py-3 min-h-[52px] flex items-start">
                {sliceError ? (
                  <div className="w-full">
                    <p className="text-xs text-red-400 font-bold mb-1">Error</p>
                    <p className="text-xs text-red-300 whitespace-pre-wrap">{sliceError}</p>
                    <button
                      onClick={() => { setIsSlicing(false); setSliceError(null); }}
                      className="mt-2 text-xs font-bold text-red-400 hover:text-white underline"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-blue-300 font-mono leading-relaxed">
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
                      : step.active ? 'bg-blue-500 animate-pulse'
                        : 'bg-slate-700'
                      }`} />
                    <span className={`text-[9px] font-semibold uppercase tracking-wider ${step.done ? 'text-green-400'
                      : step.active ? 'text-blue-400'
                        : 'text-slate-600'
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
    </div>
  );
}