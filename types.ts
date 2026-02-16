
export interface LayerSection {
  id: string;
  name: string;
  layerHeight: string;
  topLimit: string;
  bottomLimit: string;
  exposureTime: string;
  layersCount?: number;
}

export interface SliceSettings {
  exposureTime: number;
  lightIntensity: number;
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
}

export interface SliceSegment {
  id: string;
  topLimit: number;
  exposureTime: number;
  lightIntensity: number;
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
}

export interface AdvancedSliceSettings {
  enabled: boolean;
  segments: SliceSegment[];
}

export interface AdhesionSettings {
  enabled: boolean;
  layers: number;
  layerHeight: number; // microns
  exposureTime: number; // made required to match usage or keep optional? Usage seems to assume value.
  lightIntensity: number;
  transitionLayers: number;
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
}

export interface GlobalSettings {
  layerHeight: number;
  adhesion?: AdhesionSettings;
}

export interface SettingsState {
  layerHeightMode: string;
  advanced: boolean;
  sections: LayerSection[];
}

export interface TransformData {
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
}

export interface ModelData {
  id: string;
  name: string;
  url: string;
  transform: TransformData;
  settings: SliceSettings;
  advancedSettings: AdvancedSliceSettings;
  size?: { x: number; y: number; z: number };
  file?: File;
}

// --- Interfaces for Python Backend Communication ---

export interface BackendRangeOverride {
  start: number;
  end: number;
  irr: number;
  exposure?: number; // Added optional exposure override
}

export interface SceneObject {
  original_filename: string;
  pos_x_mm: number;
  pos_y_mm: number;
  scale: number;
  irradiance_mW_cm2: number;
  dose_mJ_cm2: number; // calculated as exposure_time * irradiance
  rotation: { x: number, y: number, z: number };
  override_ranges: BackendRangeOverride[];
}

export interface SliceJobResponse {
  status: string;
  job_id: string;
  url: string;
}

export interface JobLayer {
  filename: string;
  original_layer_idx: number;
  physical_layer_idx: number;
  z_height_mm: number;
  batch_id: string;
  exposure_time: number;
  is_sublayer: boolean;
}

export interface JobManifest {
  job_id: string;
  type: string;
  layer_count: number;
  physical_layer_count?: number; // Total physical Z steps
  layers: JobLayer[] | string[]; // Can be simple string array or object array
  constructs?: any[]; // For multi-part jobs
}
