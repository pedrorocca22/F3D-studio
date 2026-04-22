import { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { 
  ModelData, 
  GlobalSettings, 
  ZZone, 
  ToolheadConfig, 
  TransformData, 
  SliceSettings, 
  AdvancedSliceSettings,
  MaterialProfile,
  MaterialCategory,
  ProjectProtocol
} from '../types';
import { generateUUID, generateBoxSTL, generateCylinderSTL } from '../utils';
import { MULTIWELL_SPECS } from '../constants/wellplate';
import { MATERIAL_PRESETS } from '../constants/materials';

const DEFAULT_TOOLHEADS: ToolheadConfig[] = [
  {
    id: 'fdm', label: 'FDM Hot-end', klipper_tool: 'T0', installed: false,
    nozzleDiameter: 0.4, filamentDiameter: 1.75, maxTemperature: 280,
    defaultTemperature: 210, retractionLength: 1.0, retractionSpeed: 45
  },
  {
    id: 'syringe', label: 'Hydrogel Syringe', klipper_tool: 'T1', installed: false,
    syringeVolumeMl: 5, nozzleDiameterMm: 0.4, flowRateUlPerMm: 0.8,
    pressurizationSteps: 10, retractionSteps: 5, actuatorType: 'mechanical'
  },
  {
    id: 'uv', label: 'UV Crosslinker', klipper_tool: 'T2', installed: false,
    wavelengthNm: 365 as const, maxPowerMw: 100, defaultDose: 50, defaultExposureTime: 5, mode: 'fixed'
  },
];

const fileToArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = error => reject(error);
  });
};

export const useProject = () => {
  const [models, setModels] = useState<ModelData[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [zZones, setZZones] = useState<ZZone[]>([]);
  const [toolheads, setToolheads] = useState<ToolheadConfig[]>(DEFAULT_TOOLHEADS);
  
  const [userMaterials, setUserMaterials] = useState<MaterialProfile[]>(MATERIAL_PRESETS);
  const [selectedMaterials, setSelectedMaterials] = useState<Record<string, string>>({});
  
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    layerHeight: 200,
    nozzleTemperature: 210,
    bedTemperature: 60,
    infill: 15,
    infillPattern: 'grid',
    perimeters: 3,
    supportsEnabled: false,
    nozzleDiameter: 0.4,
    firstLayerHeight: 300,
    firstLayerSpeed: 20,
    perimeterSpeed: 45,
    externalPerimeterSpeed: 25,
    infillSpeed: 80,
    travelSpeed: 130,
    retractionLength: 1.0,
    retractionSpeed: 45,
    extrusionMultiplier: 1.0,
    coolingEnabled: true,
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

  const handleUpdateMaterial = (id: string, updates: Partial<MaterialProfile>) => {
    setUserMaterials(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleAddMaterial = (category: MaterialCategory) => {
    const newMat: MaterialProfile = {
      id: `mat-${Date.now()}`,
      name: `New ${category} Material`,
      category,
      color: '#cbd5e1', // default slate
      temp: category === 'thermoplastic' ? 210 : undefined,
      flowRate: category !== 'thermoplastic' ? 1.0 : undefined,
      pressure: category !== 'thermoplastic' ? 20 : undefined
    };
    setUserMaterials(prev => [...prev, newMat]);
    return newMat.id;
  };

  const handleDeleteMaterial = (id: string) => {
    setUserMaterials(prev => prev.filter(m => m.id !== id));
    // Also clear from selected materials if used
    setSelectedMaterials(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (next[key] === id) delete next[key];
      });
      return next;
    });
  };

  const applyMaterialToToolhead = (toolheadId: string, materialId: string) => {
    const material = userMaterials.find(m => m.id === materialId);
    if (!material) return;

    setSelectedMaterials(prev => ({ ...prev, [toolheadId]: materialId }));

    // Auto-populate toolhead settings from material
    setToolheads(prev => prev.map(t => {
      if (t.id !== toolheadId) return t;
      
      if (t.id === 'fdm') {
        // Also update global settings for temperature if FDM material is changed
        setGlobalSettings(prevGS => ({
          ...prevGS,
          nozzleTemperature: material.temp ?? prevGS.nozzleTemperature,
          bedTemperature: material.bedTemp ?? prevGS.bedTemperature,
          retractionLength: material.retraction ?? prevGS.retractionLength,
        }));

        return {
          ...t,
          defaultTemperature: material.temp ?? t.defaultTemperature,
          retractionLength: material.retraction ?? t.retractionLength,
        };
      }
      if (t.id === 'syringe') {
        return {
          ...t,
          flowrateMmPerSec: material.flowRate ?? t.flowrateMmPerSec,
          pressureKPa: material.pressure ?? t.pressureKPa,
        };
      }
      return t;
    }));
  };

  const handleFileUpload = (file: File, shapeType?: 'box' | 'cylinder') => {
    const url = URL.createObjectURL(file);
    const isCube = shapeType === 'box';
    const newModel: ModelData = {
      id: generateUUID(),
      name: file.name,
      url,
      file,
      isCube,
      shapeType,
      transform: {
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        position: { x: 0, y: 0, z: 0 }
      },
      settings: {},
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

  const handleCreateBasicShape = (type: 'box' | 'cylinder', params: { w?: number, d?: number, h: number, dia?: number }) => {
    const stlContent = type === 'box' 
      ? generateBoxSTL(params.w || 20, params.d || 20, params.h || 5)
      : generateCylinderSTL(params.dia || 20, params.h || 5);
    
    const blob = new Blob([stlContent], { type: 'text/plain' });
    const filename = type === 'box' ? `Prism_${Date.now()}.stl` : `Cylinder_${Date.now()}.stl`;
    const file = new File([blob], filename, { type: 'text/plain' });
    
    handleFileUpload(file, type);
  };

  const handleDeleteModel = (id: string) => {
    const modelToDelete = models.find(m => m.id === id);
    if (!modelToDelete) return;

    const hasSpecificZones = zZones.some(z => z.modelScope === id);
    const isOnlyModel = models.length === 1;

    let message = `Are you sure you want to delete "${modelToDelete.name}"?`;
    if (hasSpecificZones || (isOnlyModel && zZones.length > 0)) {
      message = `⚠️ WARNING: DETECTED ACTIVE CONFIGURATIONS\n\nDeleting "${modelToDelete.name}" will permanently remove all associated Z-Zones.\n\nProceed?`;
    }

    if (window.confirm(message)) {
      setModels(prev => prev.filter(m => m.id !== id));
      setZZones(prev => {
        if (isOnlyModel) return [];
        return prev.filter(z => z.modelScope !== id);
      });
      if (selectedModelId === id) setSelectedModelId(null);
    }
  };

  const handleUpdateModel = (id: string, updates: Partial<ModelData>) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleTransformChange = (id: string, newTransform: TransformData) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, transform: newTransform } : m));
  };

  const handleUpdateSettings = (id: string, newSettings: SliceSettings) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, settings: newSettings } : m));
  };

  const handleUpdateAdvancedSettings = (id: string, newSettings: AdvancedSliceSettings) => {
    setModels(prev => prev.map(m => m.id === id ? { ...m, advancedSettings: newSettings } : m));
  };

  const handleApplySettingsToAll = (settings: SliceSettings) => {
    setModels(prev => prev.map(m => ({ ...m, settings: { ...settings } })));
  };

  const handleUpdateModelSize = (id: string, size: { x: number, y: number, z: number }) => {
    setModels(prev => prev.map(m => {
      if (m.id !== id) return m;
      if (m.size && Math.abs(m.size.x - size.x) < 0.01 && Math.abs(m.size.y - size.y) < 0.01 && Math.abs(m.size.z - size.z) < 0.01) return m;
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
      transform: {
        ...modelToClone.transform,
        position: { x: modelToClone.transform.position.x + 10, y: modelToClone.transform.position.y + 10, z: modelToClone.transform.position.z }
      },
      advancedSettings: { ...modelToClone.advancedSettings, segments: clonedSegments }
    };
    setModels(prev => [...prev, newModel]);
    setSelectedModelId(newModel.id);
  };

  const handleCloneToWells = (baseModelId: string, wellIds: string[], format: 6 | 12 | 24 | 48) => {
    const baseModel = models.find(m => m.id === baseModelId);
    if (!baseModel) return;
    const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
    if (!spec) return;

    if (wellIds.length === 0) {
      handleUpdateModel(baseModelId, { transform: { ...baseModel.transform, wellAssignment: undefined, position: { x: 0, y: 0, z: 0 } } });
      return;
    }

    setModels(prev => {
      let nextModels = [...prev];
      const baseIndex = nextModels.findIndex(m => m.id === baseModelId);
      const firstWell = wellIds[0];
      const row0 = firstWell.charCodeAt(0) - 65;
      const col0 = parseInt(firstWell.substring(1)) - 1;
      const cleanName = baseModel.name.replace(/\s\([A-Z]\d+\)$/, '');

      nextModels[baseIndex] = {
        ...baseModel,
        name: `${cleanName} (${firstWell})`,
        transform: {
          ...baseModel.transform,
          position: { x: (col0 - (spec.cols - 1) / 2.0) * spec.pitch, y: (row0 - (spec.rows - 1) / 2.0) * spec.pitch, z: 0 },
          wellAssignment: { format, wellId: firstWell }
        }
      };

      const newModels: ModelData[] = wellIds.slice(1).map(wellId => {
        const row = wellId.charCodeAt(0) - 65;
        const col = parseInt(wellId.substring(1)) - 1;
        const clonedSegments = baseModel.advancedSettings.segments.map(s => ({ ...s, id: generateUUID() }));
        return {
          ...baseModel,
          id: generateUUID(),
          name: `${cleanName} (${wellId})`,
          transform: {
            ...baseModel.transform,
            position: { x: (col - (spec.cols - 1) / 2.0) * spec.pitch, y: (row - (spec.rows - 1) / 2.0) * spec.pitch, z: 0 },
            wellAssignment: { format, wellId }
          },
          advancedSettings: { ...baseModel.advancedSettings, segments: clonedSegments }
        };
      });
      return [...nextModels, ...newModels];
    });
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
      return { ...model, transform: { ...model.transform, position: { ...model.transform.position, x: xPos, y: yPos } } };
    });
    setModels(newModels);
  };

  const handleSaveProject = async () => {
    try {
      const zip = new JSZip();
      const modelsMetadata = await Promise.all(models.map(async (m, index) => {
        if (m.file) {
          const buffer = await fileToArrayBuffer(m.file);
          const stlFilename = `model_${index}.stl`;
          zip.file(stlFilename, buffer);
          return { ...m, file: undefined, url: undefined, externalFilename: stlFilename, originalFilename: m.file.name };
        }
        return m;
      }));
      const projectData = { models: modelsMetadata, globalSettings, zZones, version: "3.5", selectedMaterials, userMaterials };
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

  const handleLoadProject = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const metadataFile = zip.file("project.json");
      if (!metadataFile) throw new Error("Invalid project file");
      const projectData = JSON.parse(await metadataFile.async("string"));

      if (projectData.globalSettings) setGlobalSettings(projectData.globalSettings);
      if (projectData.zZones) setZZones(projectData.zZones);
      if (projectData.selectedMaterials) setSelectedMaterials(projectData.selectedMaterials);
      if (projectData.userMaterials) setUserMaterials(projectData.userMaterials);
      if (projectData.models) {
        const rehydratedModels = await Promise.all(projectData.models.map(async (m: any) => {
          let fileObj = undefined;
          let url = "";
          if (m.externalFilename) {
            const stlFile = zip.file(m.externalFilename);
            if (stlFile) {
              const blob = await stlFile.async("blob");
              fileObj = new File([blob], m.originalFilename || m.externalFilename, { type: "model/stl" });
              url = URL.createObjectURL(fileObj);
            }
          }
          return { ...m, file: fileObj, url: url, id: m.id || generateUUID(), externalFilename: undefined, originalFilename: undefined };
        }));
        setModels(rehydratedModels as ModelData[]);
        if (rehydratedModels.length > 0) setSelectedModelId(rehydratedModels[0].id);
      }
    } catch (err) {
      console.error("Load failed", err);
      alert("Failed to load project.");
    }
  };

  const calculatedTotalLayers = useMemo(() => {
    const maxZ = Math.max(...models.map(m => m.size?.z ?? 0), 0);
    return maxZ > 0 ? Math.ceil(maxZ / (globalSettings.layerHeight / 1000)) : 100;
  }, [models, globalSettings.layerHeight]);

  const [savedProtocols, setSavedProtocols] = useState<ProjectProtocol[]>(() => {
    try {
        const saved = localStorage.getItem('biofff_protocols');
        return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
  });

  const handleSaveToGallery = (name: string, author: string, jobInfo?: any, notes?: string) => {
    const newProtocol: ProjectProtocol = {
      id: generateUUID(),
      name: name || `Protocol ${savedProtocols.length + 1}`,
      author: author || 'Unknown User',
      createdAt: new Date().toISOString(),
      models: models.map(m => ({ ...m, file: undefined, url: '' })),
      globalSettings: { ...globalSettings },
      zZones: [...zZones],
      toolheads: [...toolheads],
      selectedMaterials: { ...selectedMaterials },
      userMaterials: [...userMaterials],
      jobInfo,
      notes
    };
    const next = [newProtocol, ...savedProtocols];
    setSavedProtocols(next);
    localStorage.setItem('biofff_protocols', JSON.stringify(next));
    return newProtocol.id;
  };

  const handleUpdateProtocolNotes = (id: string, notes: string) => {
    const next = savedProtocols.map(p => p.id === id ? { ...p, notes } : p);
    setSavedProtocols(next);
    localStorage.setItem('biofff_protocols', JSON.stringify(next));
  };

  const handleLoadProtocol = (protocol: ProjectProtocol) => {
    setGlobalSettings(protocol.globalSettings);
    setZZones(protocol.zZones);
    setSelectedMaterials(protocol.selectedMaterials);
    setUserMaterials(protocol.userMaterials);
    setModels(protocol.models);
    if (protocol.models.length > 0) setSelectedModelId(protocol.models[0].id);
  };

  const handleDeleteProtocol = (id: string) => {
    const next = savedProtocols.filter(p => p.id !== id);
    setSavedProtocols(next);
    localStorage.setItem('biofff_protocols', JSON.stringify(next));
  };

  return {
    models, setModels,
    selectedModelId, setSelectedModelId,
    zZones, setZZones,
    toolheads, setToolheads,
    globalSettings, setGlobalSettings,
    selectedMaterials,
    userMaterials,
    savedProtocols,
    handleSaveToGallery,
    handleUpdateProtocolNotes,
    handleLoadProtocol, // Open project from gallery
    handleDeleteProtocol,
    applyMaterialToToolhead,
    handleUpdateMaterial,
    handleAddMaterial,
    handleDeleteMaterial,
    handleFileUpload,
    handleCreateBasicShape,
    handleDeleteModel,
    handleUpdateModel,
    handleTransformChange,
    handleUpdateSettings,
    handleUpdateAdvancedSettings,
    handleApplySettingsToAll,
    handleUpdateModelSize,
    handleCloneModel,
    handleCloneToWells,
    handleArrayModels,
    handleSaveProject,
    handleLoadProject,
    calculatedTotalLayers
  };
};
