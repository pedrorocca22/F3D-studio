
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
  exposureTime: number;
  lightIntensity: number;
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
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
  shell_thickness_mm?: number;
  core_pattern?: 'solid' | 'gradient' | 'voronoi' | 'sponge';
  core_density?: number;
  sponge_density?: number; // 0-1 for Sponge Pattern
  pattern_cell_mm?: number;
  shell_gray?: number;
  core_gray?: number;

  // Radial Gradient Specifics
  gradient_type?: 'linear' | 'radial';
  gradient_center?: { x: number, y: number }; // Normalized 0-1
  gradient_radius?: number; // mm
  gradient_start_gray?: number; // 0-255 (Center)
  gradient_end_gray?: number;   // 0-255 (Edge)
  gradient_power?: number;      // 1.0 = Linear, >1 = Core focused, <1 = Edge focused

  // Voronoi Specifics
  voronoi_cell_size?: number; // Average cell size in mm
  voronoi_wall_thickness?: number; // Thickness of the cell walls in logical units
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
  irr: number;
  exposure?: number; // Added optional exposure override
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
