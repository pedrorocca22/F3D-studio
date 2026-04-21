import { useState, useMemo, useRef, useEffect } from 'react';
import { ModelData, GlobalSettings, ZZone, ToolheadConfig } from '../types';
import { BACKEND_URL } from '../config';
import { MULTIWELL_SPECS } from '../constants/wellplate';
import { resolveLayerPlans } from '../utils/planResolver';

export const useSlicer = (
  models: ModelData[],
  globalSettings: GlobalSettings,
  zZones: ZZone[],
  toolheads: ToolheadConfig[],
  calculatedTotalLayers: number
) => {
  const [isSlicing, setIsSlicing] = useState(false);
  const [sliceProgress, setSliceProgress] = useState('');
  const [slicePercent, setSlicePercent] = useState(0);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [gcodePreviewJob, setGcodePreviewJob] = useState<{
    jobId: string;
    layerCount: number;
    nozzleDiameter?: number
  } | null>(null);

  // Auto-reset logic from App.tsx
  const slicingParamsHash = useMemo(() => {
    const relevantData = {
      globalSettings,
      zZones,
      modelParams: models.map(m => ({
        id: m.id, toolhead: m.toolhead, scaffoldTools: m.scaffoldTools,
        fdmSettings: m.fdmSettings, transform: m.transform,
        advancedSettings: m.advancedSettings,
      })),
    };
    return JSON.stringify(relevantData);
  }, [globalSettings, zZones, models]);

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
    const modelsMetadata = models.map(m => ({
      id: m.id,
      name: m.file?.name ?? m.name,
      transform: m.transform,
      toolhead: m.toolhead || 'fdm',
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
    formData.append('first_layer_speed', String(globalSettings.firstLayerSpeed ?? 20));
    formData.append('perimeter_speed', String(globalSettings.perimeterSpeed ?? 45));
    formData.append('external_perimeter_speed', String(globalSettings.externalPerimeterSpeed ?? 25));
    formData.append('infill_speed', String(globalSettings.infillSpeed ?? 80));
    formData.append('travel_speed', String(globalSettings.travelSpeed ?? 130));
    formData.append('retraction_length', String(globalSettings.retractionLength ?? 1.0));
    formData.append('retraction_speed', String(globalSettings.retractionSpeed ?? 45));
    formData.append('extrusion_multiplier', String(globalSettings.extrusionMultiplier ?? 1.0));
    formData.append('fan_always_on', globalSettings.fanAlwaysOn !== false ? '1' : '0');
    formData.append('min_fan_speed', String(globalSettings.minFanSpeed ?? 100));
    formData.append('max_fan_speed', String(globalSettings.maxFanSpeed ?? 100));
    formData.append('disable_fan_first_layers', String(globalSettings.disableFanFirstLayers ?? 1));
    formData.append('z_zones', JSON.stringify(zZones));

    const resolvedPlans = resolveLayerPlans(models, calculatedTotalLayers, zZones, globalSettings.layerHeight / 1000, (globalSettings.firstLayerHeight || 300) / 1000);
    formData.append('resolved_layer_plans', JSON.stringify(resolvedPlans));

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
              const mRes = await fetch(`${BACKEND_URL}/fdm/job/${jobId}/manifest`);
              if (mRes.ok) {
                const manifest = await mRes.json();
                layerCount = manifest.layer_count ?? 0;
              }
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
      setGcodePreviewJob({ jobId, layerCount, nozzleDiameter: globalSettings.nozzleDiameter });
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
        if (Math.sqrt(modelW*modelW + modelD*modelD) > spec.dia) overflowing.push(m.name);
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
