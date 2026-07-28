import { useState, useMemo, useRef, useEffect } from 'react';
import { ModelData, GlobalSettings, PoreCapacitySummary, ZZone, ToolheadConfig } from '../types';
import { BACKEND_URL } from '../config';
import { MULTIWELL_SPECS } from '../constants/wellplate';
import { resolveLayerPlans } from '../utils/planResolver';
import { isFdmToolhead } from '../utils/toolheads';

export const useSlicer = (
  models: ModelData[],
  globalSettings: GlobalSettings,
  zZones: ZZone[],
  toolheads: ToolheadConfig[],
  calculatedTotalLayers: number,
  selectedMaterials: Record<string, string> = {}
) => {
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState('');
  const [slicePercent, setSlicePercent] = useState(0);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [gcodePreviewJob, setGcodePreviewJob] = useState<{
    jobId: string;
    layerCount: number;
    nozzleDiameter?: number;
    detectedPores?: Array<{
      x: number; y: number; z: number; modelId: string; layer: number;
      zStartMm?: number; zEndMm?: number; bottomSolidTopMm?: number;
      cellWidthMm?: number; cellDepthMm?: number;
      freeWidthMm?: number; freeDepthMm?: number; layerHeightMm?: number;
      maxVolumeUl?: number; requestedVolumeUl?: number; occupancyPercent?: number;
    }>;
    poreCapacity?: PoreCapacitySummary;
    bottomSolidTopMm?: number;
    bottomOverlapLayersSkipped?: number;
    bedCenter?: { x: number; y: number };
  } | null>(null);

  // Auto-reset logic from App.tsx
  const slicingParamsHash = useMemo(() => {
    const relevantData = {
      globalSettings,
      zZones,
      toolheads,
      selectedMaterials,
      modelParams: models.map(m => ({
        id: m.id, toolhead: m.toolhead, scaffoldTools: m.scaffoldTools,
        fdmSettings: m.fdmSettings, transform: m.transform,
        advancedSettings: m.advancedSettings,
      })),
    };
    return JSON.stringify(relevantData);
  }, [globalSettings, zZones, toolheads, selectedMaterials, models]);

  const prevSlicingParamsRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevSlicingParamsRef.current !== null && prevSlicingParamsRef.current !== slicingParamsHash) {
      if (gcodePreviewJob) {
        setGcodePreviewJob(null);
        setSlicePercent(0);
        setSliceError(null);
      }
    }
    prevSlicingParamsRef.current = slicingParamsHash;
  }, [slicingParamsHash, gcodePreviewJob]);

  const executeSlice = async () => {
    if (models.length === 0 || !models[0].file) {
      alert('No models loaded.');
      return;
    }

    setIsSlicing(true);
    setSliceError(null);
    setSlicePercent(0);
    setSliceProgress('Uploading STL to slicer...');

    const formData = new FormData();
    const fdmToolhead = toolheads.find(isFdmToolhead);
    const fdmNozzleDiameter = fdmToolhead
      ? fdmToolhead.nozzleDiameter
      : (globalSettings.nozzleDiameter ?? 0.4);
    const fdmTemperature = fdmToolhead
      ? fdmToolhead.defaultTemperature
      : (globalSettings.nozzleTemperature ?? 210);
    const fdmRetractionLength = fdmToolhead
      ? fdmToolhead.retractionLength
      : (globalSettings.retractionLength ?? 1);
    const fdmRetractionSpeed = fdmToolhead
      ? fdmToolhead.retractionSpeed
      : (globalSettings.retractionSpeed ?? 45);
    const fdmRetractionLift = fdmToolhead
      ? (fdmToolhead.zLiftDistance ?? 0.4)
      : 0.4;
    const fdmExtrusionMultiplier = fdmToolhead?.flowratePercent
      ? fdmToolhead.flowratePercent / 100
      : (globalSettings.extrusionMultiplier ?? 1);
    const modelsMetadata = models.map(m => ({
      id: m.id,
      name: m.file?.name ?? m.name,
      transform: m.transform,
      toolhead: m.toolhead || 'none',
      scaffoldTools: m.scaffoldTools,
      fdm_settings: m.fdmSettings,
    }));

    formData.append('models_metadata', JSON.stringify(modelsMetadata));
    models.forEach(m => { if (m.file) formData.append('files[]', m.file); });

    const layerH = (globalSettings.layerHeight / 1000).toFixed(3);
    const firstLayerH = ((globalSettings.firstLayerHeight ?? 300) / 1000).toFixed(3);

    formData.append('layer_height', layerH);
    formData.append('first_layer_height', firstLayerH);
    formData.append('toolheads', JSON.stringify(toolheads));
    formData.append('selected_materials', JSON.stringify(selectedMaterials));
    formData.append('nozzle_temp', String(fdmTemperature));
    formData.append('bed_temp', String(globalSettings.bedTemperature ?? 60));
    formData.append('infill', String(globalSettings.infill ?? 15));
    formData.append('infill_pattern', globalSettings.infillPattern ?? 'gyroid');
    formData.append('perimeters', String(globalSettings.perimeters ?? 3));
    formData.append('supports', globalSettings.supportsEnabled ? 'true' : 'false');
    formData.append('nozzle_diameter', String(fdmNozzleDiameter));
    formData.append('skirt_count', String(globalSettings.skirtCount ?? 1));
    formData.append('skirt_distance', String(globalSettings.skirtDistance ?? 6));
    formData.append('skirt_height', String(globalSettings.skirtHeight ?? 1));
    formData.append('brim_width', String(globalSettings.brimWidth ?? 0));
    formData.append('top_shell', String(globalSettings.topSolidLayers ?? 3));
    formData.append('bottom_shell', String(globalSettings.bottomSolidLayers ?? 3));
    formData.append('fill_angle', String(globalSettings.fillAngle ?? 45));
    formData.append('first_layer_speed', String(globalSettings.firstLayerSpeed ?? 20));
    formData.append('perimeter_speed', String(globalSettings.perimeterSpeed ?? 45));
    formData.append('external_perimeter_speed', String(globalSettings.externalPerimeterSpeed ?? 25));
    formData.append('infill_speed', String(globalSettings.infillSpeed ?? 80));
    formData.append('travel_speed', String(globalSettings.travelSpeed ?? 130));
    formData.append('retraction_length', String(fdmRetractionLength));
    formData.append('retraction_speed', String(fdmRetractionSpeed));
    formData.append('retraction_lift', String(fdmRetractionLift));
    formData.append('extrusion_multiplier', String(fdmExtrusionMultiplier));
    formData.append('cooling', globalSettings.coolingEnabled !== false ? '1' : '0');
    formData.append('fan_always_on', globalSettings.fanAlwaysOn !== false ? '1' : '0');
    formData.append('min_fan_speed', String(globalSettings.coolingEnabled !== false ? (globalSettings.minFanSpeed ?? 100) : 0));
    formData.append('max_fan_speed', String(globalSettings.coolingEnabled !== false ? (globalSettings.maxFanSpeed ?? 100) : 0));
    formData.append('disable_fan_first_layers', String(globalSettings.disableFanFirstLayers ?? 1));
    formData.append('z_zones', JSON.stringify(zZones));
    formData.append('print_bed', JSON.stringify(globalSettings.printBed ?? null));

    const resolvedPlans = resolveLayerPlans(
      models,
      calculatedTotalLayers,
      zZones,
      globalSettings.layerHeight / 1000,
      (globalSettings.firstLayerHeight || 300) / 1000,
      toolheads,
      {
        top: globalSettings.topSolidLayers ?? 3,
        bottom: globalSettings.bottomSolidLayers ?? 3,
      },
    );
    formData.append('resolved_layer_plans', JSON.stringify(resolvedPlans));

    if (globalSettings.poreInjection?.enabled) {
      formData.append('pore_injection', JSON.stringify(globalSettings.poreInjection));
    }

    const layer_h = globalSettings.layerHeight / 1000;
    const first_layer_h = (globalSettings.firstLayerHeight || 300) / 1000;
    const derivedLayerActions = zZones.map(zz => {
      const from = zz.zStartMm <= first_layer_h ? 1 : Math.max(1, Math.ceil((zz.zStartMm - first_layer_h) / layer_h) + 1);
      const to = Math.max(from, Math.floor((zz.zEndMm - first_layer_h) / layer_h) + 1);
      return {
        id: zz.id, layerFrom: from, layerTo: to,
        modelId: zz.modelScope === 'all' ? 'all' : zz.modelScope,
        kind: zz.featureOverride ? 'feature_override' : (zz.parameterOverride ? 'parameter_override' : 'process_event'),
        toolOverride: zz.featureOverride?.toolhead, fdmSettings: zz.parameterOverride?.fdm,
        syringeSettings: zz.parameterOverride?.syringe, uvSettings: zz.processEvent,
        poreInjection: zz.parameterOverride?.poreInjection,
        label: zz.label, color: zz.color
      };
    });
    formData.append('layer_actions', JSON.stringify(derivedLayerActions));

    try {
      const resp = await fetch(`${BACKEND_URL}/fdm/slice`, { method: 'POST', body: formData });
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      const data = await resp.json();
      const jobId = data.job_id;
      setCurrentJobId(jobId);
      setSliceProgress('Processing...');

      let layerCount = 0;
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const poll = setInterval(async () => {
          if (++attempts > 750) { clearInterval(poll); reject(new Error('Timeout')); return; }
          try {
            const pRes = await fetch(`${BACKEND_URL}/job/${jobId}/progress`);
            if (!pRes.ok) return;
            const p = await pRes.json();
            setSliceProgress(p.message || 'Processing...');
            setSlicePercent(p.progress || 0);
            if (p.status === 'done') {
              clearInterval(poll);
              let detectedPores = [];
              let bedCenter = { x: 0, y: 0 };
              let bottomSolidTopMm: number | undefined;
              let bottomOverlapLayersSkipped = 0;
              let poreCapacity: PoreCapacitySummary | undefined;
              const mRes = await fetch(`${BACKEND_URL}/fdm/job/${jobId}/manifest`);
              if (mRes.ok) {
                const manifest = await mRes.json();
                console.log("=== DEBUG 1: MANIFEST CRUDO ===", manifest); // Añade esta línea
                layerCount = manifest.layer_count ?? 0;
                detectedPores = manifest.pores || manifest.detected_pores || manifest.detectedPores || [];
                const poreProfiles = manifest.pore_protocol?.profiles || [];
                poreCapacity = manifest.pore_protocol?.capacity;
                if (poreProfiles.length > 0) {
                  bottomSolidTopMm = Math.max(...poreProfiles.map((profile: any) => Number(profile.bottom_solid_top_mm || 0)));
                  bottomOverlapLayersSkipped = poreProfiles.reduce((sum: number, profile: any) => sum + Number(profile.bottom_overlap_layers_skipped || 0), 0);
                }
                // Handle different manifest key formats (including xy_compensation)
                const bc = manifest.bed_center || manifest.xy_compensation || {};
                bedCenter = {
                  x: bc.bed_center_x ?? manifest.bed_center_x ?? 0,
                  y: bc.bed_center_y ?? manifest.bed_center_y ?? 0
                };
                console.log("[DEBUG FRONTEND] Bed Center detectado:", bedCenter);
              }
              setGcodePreviewJob({
                jobId,
                layerCount,
                nozzleDiameter: fdmNozzleDiameter,
                detectedPores,
                poreCapacity,
                bottomSolidTopMm,
                bottomOverlapLayersSkipped,
                bedCenter
              });
              resolve();
            } else if (p.status === 'error') {
              clearInterval(poll);
              reject(new Error(p.message || 'Failed'));
            }
          } catch (err) { console.error(err); }
        }, 800);
      });

      setIsSlicing(false);
      setSliceProgress('');
    } catch (error) {
      setIsSlicing(false);
      setSliceProgress('');
      alert(`Slice error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleSlice = () => {
    if (models.length === 0) { alert("Please add a model."); return; }
    if (globalSettings.printBed?.type === 'multiwell_plate') {
      const overflowing: string[] = [];
      for (const m of models) {
        if (!m.transform.wellAssignment || !m.size) continue;
        const spec = MULTIWELL_SPECS[String(m.transform.wellAssignment.format)];
        if (!spec) continue;
        const modelW = m.size.x * (m.transform.scale.x || 1);
        const modelD = m.size.y * (m.transform.scale.y || 1);
        if (Math.sqrt(modelW * modelW + modelD * modelD) > spec.dia) overflowing.push(m.name);
      }
      if (overflowing.length > 0) {
        alert("Some models do not fit in wells.");
        return;
      }
    }
    executeSlice();
  };

  return {
    isSlicing, sliceProgress, slicePercent, sliceError,
    currentJobId, gcodePreviewJob, setGcodePreviewJob,
    handleSlice
  };
};
