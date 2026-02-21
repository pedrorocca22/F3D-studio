
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
  modifiers?: Modifier[];
}

export interface SliceSegment {
  id: string;
  topLimit: number;
  bottomLimit?: number;         // NEW: Optional independent start for a gradient segment
  lightIntensity: number;       // Start intensity if gradient, flat intensity else
  exposureTime: number;         // Start time if gradient
  endLightIntensity?: number;   // NEW: Target end intensity for gradient
  endExposureTime?: number;     // NEW: Target end exposure for gradient
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
  endTargetDose?: number;       // NEW: Target end dose
  gradientMode?: 'flat' | 'gradient'; // NEW: Is this segment a gradient?
  modifiers?: Modifier[];
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

export interface Modifier {
  type: 'shell_core' | 'volume';
  shell_thickness?: number;     // mm — cortical/perimeter shell thickness (sent to backend)
  shell_thickness_mm?: number;  // legacy alias
  core_pattern?: 'solid' | 'sponge' | 'vascular';
  core_density?: number;
  sponge_density?: number;      // 0–1: bone fraction inside the core
  pattern_cell_mm?: number;
  shell_gray?: number;          // 0–255: grayscale of the shell/matrix (void)
  core_gray?: number;           // 0–255: grayscale of the bone trabeculae
  voronoi_cell_size?: number;   // reused as pore size (mm) for sponge
}

export interface Pattern {
  id: string;
  name: string;
  config: Modifier;
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
  modifiers?: Modifier[];
  size?: { x: number; y: number; z: number };
  file?: File;
  isCube?: boolean;
}

// --- Interfaces for Python Backend Communication ---

export interface BackendRangeOverride {
  start: number;
  end: number;
  gradientMode?: 'flat' | 'gradient';
  irr: number;
  endLightIntensity?: number;
  exposure?: number; // Added optional exposure override
  endExposureTime?: number;
  modifiers?: Modifier[];
}

export interface SceneObject {
  original_filename: string;
  pos_x_mm: number;
  pos_y_mm: number;
  scale: number;
  scale_x?: number;
  scale_y?: number;
  scale_z?: number;
  irradiance_mW_cm2: number;
  dose_mJ_cm2: number; // calculated as exposure_time * irradiance
  rotation: { x: number, y: number, z: number };
  override_ranges: BackendRangeOverride[];
  modifiers?: Modifier[];
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
