import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
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

  // Slicing State
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState<string>("Initializing...");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Global Print Settings (Physical machine constraints)
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    layerHeight: 50
  });

  // State for multiple models
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [darkMode]);

  const handleFileUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    const newModel: ModelData = {
      id: generateUUID(),
      name: file.name,
      url,
      file,
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
          y: modelToClone.transform.position.y,
          z: modelToClone.transform.position.z + 10
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
      const depth = model.size ? model.size.z : 10;
      if (width > colWidths[col]) colWidths[col] = width;
      if (depth > rowDepths[row]) rowDepths[row] = depth;
    });

    const totalWidth = colWidths.reduce((a, b) => a + b, 0) + (spacing * (cols - 1));
    const totalDepth = rowDepths.reduce((a, b) => a + b, 0) + (spacing * (rows - 1));

    const startX = -totalWidth / 2;
    const startZ = -totalDepth / 2;

    const newModels = models.map((model, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      let xPos = startX;
      for (let i = 0; i < col; i++) xPos += colWidths[i] + spacing;
      xPos += colWidths[col] / 2;

      let zPos = startZ;
      for (let i = 0; i < row; i++) zPos += rowDepths[i] + spacing;
      zPos += rowDepths[row] / 2;

      return {
        ...model,
        transform: {
          ...model.transform,
          position: { ...model.transform.position, x: xPos, z: zPos }
        }
      };
    });

    setModels(newModels);
  };

  // --- REAL SLICING LOGIC (Using Python Backend "Plan B") ---
  const handleSlice = async () => {
    if (models.length === 0) {
      alert("Please add a model before slicing.");
      return;
    }

    setIsSlicing(true);
    setSliceProgress("Preparing scene data...");

    const formData = new FormData();
    const sceneData: SceneObject[] = [];

    // 1. Build Scene Data matching Backend Expectations
    const adhesionEnabled = globalSettings.adhesion?.enabled ?? false;
    const adhesionLayers = globalSettings.adhesion?.layers ?? 0;
    const adhesionHeightMM = adhesionEnabled ? (adhesionLayers * (globalSettings.adhesion?.layerHeight ?? 50)) / 1000 : 0;

    // Pass adhesion defaults for Global Config override if needed
    if (adhesionEnabled) {
      formData.append('initial_layer_height', ((globalSettings.adhesion?.layerHeight ?? 50) / 1000).toString());
      if (globalSettings.adhesion?.exposureTime) {
        formData.append('initial_exposure_time', globalSettings.adhesion.exposureTime.toString());
      }
      formData.append('faded_layers', adhesionLayers.toString());
    }

    models.forEach((model, index) => {
      if (!model.file) return;

      // Important: Must append files in the same order as scene_json
      formData.append('files[]', model.file);

      // Calculate Dose: Exposure Time (s) * Intensity (mW/cm2) = mJ/cm2
      const dose = model.settings.exposureTime * model.settings.lightIntensity;

      const layerHeightMM = globalSettings.layerHeight / 1000;

      // Correctly calculate ranges with start point accumulator
      let currentStartLayer = 0;

      // If adhesion is enabled, we essentially "skip" controlling the first N layers via Advanced Settings
      // because they are legally "Adhesion Layers".
      if (adhesionEnabled) {
        currentStartLayer = adhesionLayers;
      }

      const ranges = model.advancedSettings.enabled
        ? model.advancedSettings.segments.map(seg => {
          // Correctly calculate layer index for the top limit, accounting for adhesion thickness
          let endLayer = 0;
          if (adhesionEnabled && seg.topLimit > adhesionHeightMM) {
            const extraHeight = seg.topLimit - adhesionHeightMM;
            const extraLayers = extraHeight / layerHeightMM;
            endLayer = adhesionLayers + Math.floor(extraLayers);
          } else {
            // Fallback for uniform height or if segment ends within adhesion (unlikely due to UI constraints)
            const effectiveLH = adhesionEnabled && seg.topLimit <= adhesionHeightMM
              ? ((globalSettings.adhesion?.layerHeight ?? 50) / 1000)
              : layerHeightMM;
            endLayer = Math.floor(seg.topLimit / effectiveLH);
          }

          // If the segment ends before start, ignore
          if (endLayer <= currentStartLayer) return null;

          const rangeObj = {
            start: currentStartLayer,
            end: endLayer,
            irr: seg.lightIntensity,
            exposure: seg.exposureTime
          };
          currentStartLayer = endLayer;
          return rangeObj;
        }).filter(Boolean) as BackendRangeOverride[]
        : [];

      sceneData.push({
        original_filename: model.file.name,
        pos_x_mm: model.transform.position.x,
        pos_y_mm: model.transform.position.z,
        scale: model.transform.scale.x,
        irradiance_mW_cm2: model.settings.lightIntensity,
        dose_mJ_cm2: dose,
        rotation: { x: model.transform.rotation.x, y: model.transform.rotation.y, z: model.transform.rotation.z },
        override_ranges: ranges
      });
    });

    formData.append('scene_json', JSON.stringify(sceneData));
    formData.append('layer_height', (globalSettings.layerHeight / 1000).toString());

    try {
      setSliceProgress("Uploading & Processing...");

      // Connect to the Python Backend (default port 8000)
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

      if (data.status === 'ok') {
        setSliceProgress("Downloading result manifest...");
        setCurrentJobId(data.job_id);
        setIsSlicing(false);
        setIsSlicePreviewMode(true);
      } else {
        throw new Error("Backend returned invalid status");
      }

    } catch (error) {
      console.error("Slicing error:", error);

      const msg = (error as Error).message;
      if (msg.includes("Failed to fetch")) {
        alert("Connection Failed: Could not reach the Slicing Server.\n\n1. Ensure 'server.py' is running.\n2. Ensure 'flask-cors' is installed (pip install flask-cors).");
      } else {
        alert(`Slicing Failed: ${msg}`);
      }
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

      // 1. Save Models and prepare metadata
      const modelsMetadata = await Promise.all(models.map(async (m, index) => {
        if (m.file) {
          const buffer = await fileToArrayBuffer(m.file);
          // Save binary STL in ZIP with simple name
          const stlFilename = `model_${index}.stl`;
          zip.file(stlFilename, buffer);

          return {
            ...m,
            file: undefined, // Remove File object from metadata
            url: undefined,  // Remove Blob URL
            externalFilename: stlFilename, // Reference to ZIP entry
            originalFilename: m.file.name
          };
        }
        return m;
      }));

      // 2. Save Metadata JSON
      const projectData = {
        models: modelsMetadata,
        globalSettings,
        version: "2.0" // Version bump for ZIP format
      };

      zip.file("project.json", JSON.stringify(projectData, null, 2));

      // 3. Generate ZIP blob
      const content = await zip.generateAsync({ type: "blob" });

      // 4. Download
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `project-${new Date().toISOString().slice(0, 10)}.bpp`; // .bpp = BioPrint Project
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

        // 1. Load Metadata
        const metadataFile = zip.file("project.json");
        if (!metadataFile) throw new Error("Invalid project file: missing project.json");

        const metadataText = await metadataFile.async("string");
        const projectData = JSON.parse(metadataText);

        // 2. Restore Global Settings
        if (projectData.globalSettings) {
          setGlobalSettings(projectData.globalSettings);
        }

        // 3. Restore Models
        if (projectData.models) {
          const rehydratedModels = await Promise.all(projectData.models.map(async (m: any) => {
            let fileObj = undefined;
            let url = "";

            if (m.externalFilename) {
              const stlFile = zip.file(m.externalFilename);
              if (stlFile) {
                const blob = await stlFile.async("blob");
                // Restore original filename if available, or fallback
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
              // Cleanup internal fields
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
      />

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
          onApplySettingsToAll={handleApplySettingsToAll}
          isAdvancedSliceMode={isAdvancedSliceMode}
          setIsAdvancedSliceMode={setIsAdvancedSliceMode}
          onSlice={handleSlice}
          onFileUpload={handleFileUpload}
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

        {/* Slicing Loader Overlay */}
        {isSlicing && (
          <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
            <div className="flex flex-col items-center gap-6 p-8 rounded-2xl bg-[#1a1a1a] border border-slate-700 shadow-2xl min-w-[320px]">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <Icon name="settings" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-slate-400 animate-pulse" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold tracking-tight mb-1">Slicing Model</h3>
                <p className="text-sm text-blue-400 font-mono">{sliceProgress}</p>
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