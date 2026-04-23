// ---------------------------------------------------------------------------
//  LEGACY — DLP3 Inheritance (Marked for future deprecation)
// ---------------------------------------------------------------------------

/** @deprecated Use BioFFF toolhead settings instead. Kept for project compatibility. */
export interface LegacyDLPSettings {
  exposureTime: number;
  lightIntensity: number;
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
  peelSpeed?: number;
  retractSpeed?: number;
  separationDistance?: number;
}

export interface LayerSection {
  id: string;
  name: string;
  layerHeight: string;
  topLimit: string;
  bottomLimit: string;
  exposureTime: string;
  layersCount?: number;
}

export interface SliceSegment {
  id: string;
  topLimit: number;
  bottomLimit?: number;
  lightIntensity: number;
  exposureTime: number;
  endLightIntensity?: number;
  endExposureTime?: number;
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
  endTargetDose?: number;
  gradientMode?: 'flat' | 'gradient';
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
  exposureTime: number;
  lightIntensity: number;
  transitionLayers: number;
  exposureMode?: 'time' | 'dose';
  targetDose?: number;
}

// ---------------------------------------------------------------------------
//  BioFFF Core — Materials & Presets
// ---------------------------------------------------------------------------

export type MaterialCategory = 'thermoplastic' | 'hydrogel' | 'bio-ink' | 'support' | 'reagent';

export interface MaterialProfile {
  id: string;
  name: string;
  category: MaterialCategory;
  color: string;
  // FDM specific
  temp?: number;
  bedTemp?: number;
  retraction?: number;
  speedMultiplier?: number;
  // Syringe specific
  flowRate?: number;
  pressure?: number;
  // UV specific
  doseMjCm2?: number;
  intensityPercent?: number;
}

export interface SliceSettings extends Partial<LegacyDLPSettings> {
  modifiers?: Modifier[];
}

export interface ThermodynamicSettings {
  enabled: boolean;
  maxFlashTime: number;
  coolingPause: number;
}

export interface MotorControlSettings {
  enabled: boolean;
  peelSpeed: number;
  retractSpeed: number;
  separationDistance: number;
}

export interface PoreInjectionConfig {
  enabled: boolean;
  syringeToolhead: ToolheadId;
  zStartMm: number;
  zEndMm: number;
  injectionDepthMm: number;
  flowRateUlPerCell: number;
  travelFeedrateMmMin: number;
  injectionFeedrateMmMin: number;
}

export interface GlobalSettings {
  layerHeight: number;
  adhesion?: AdhesionSettings;
  thermodynamic?: ThermodynamicSettings;
  motor?: MotorControlSettings;
  poreInjection?: PoreInjectionConfig;
  // FDM additions
  nozzleTemperature?: number;
  bedTemperature?: number;
  bedHeatingEnabled?: boolean;
  infill?: number;
  infillPattern?: InfillPattern;
  perimeters?: number;
  supportsEnabled?: boolean;
  nozzleDiameter?: number;
  firstLayerHeight?: number;
  // Speeds
  firstLayerSpeed?: number;
  perimeterSpeed?: number;
  externalPerimeterSpeed?: number;
  infillSpeed?: number;
  travelSpeed?: number;
  // Material & Retraction
  retractionLength?: number;
  retractionSpeed?: number;
  extrusionMultiplier?: number;
  // Cooling
  coolingEnabled?: boolean;
  fanAlwaysOn?: boolean;
  minFanSpeed?: number;
  maxFanSpeed?: number;
  disableFanFirstLayers?: number;
  // Adhesion & Shell
  skirtCount?: number;
  skirtDistance?: number;
  skirtHeight?: number;
  brimWidth?: number;
  topSolidLayers?: number;
  bottomSolidLayers?: number;
  fillAngle?: number;
  printBed?: PrintBedSettings;
}

// ---------------------------------------------------------------------------
//  Print Bed Settings
// ---------------------------------------------------------------------------

export type PrintBedType = 'glass_bed' | 'petri_dish' | 'multiwell_plate';

export interface PrintBedSettings {
  type: PrintBedType;
  /** Petri dish diameter in mm (35, 60, 90) */
  petriDiameter?: 35 | 60 | 90;
  /** Multiwell plate format (6, 12, 24, 48) */
  multiwellFormat?: 6 | 12 | 24 | 48;
  /** Custom dimensions if necessary */
  dimensions?: { width: number; height: number };
}

export interface SettingsState {
  layerHeightMode: string;
  advanced: boolean;
  sections: LayerSection[];
}

export interface Modifier {
  type: 'shell_core' | 'volume';
  shell_thickness?: number;
  shell_thickness_mm?: number;
  core_pattern?: 'solid' | 'sponge' | 'vascular' | 'lattice' | 'linear' | 'noise' | 'trabecular';
  core_density?: number;
  sponge_density?: number;
  pattern_cell_mm?: number;
  shell_gray?: number;
  core_gray?: number;
  voronoi_cell_size?: number;
  randomize_z?: boolean;
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
  /** Optional assignment to a specific well in a multiwell plate. */
  wellAssignment?: {
    format: 6 | 12 | 24 | 48;
    wellId: string; // e.g., "A1", "B3", "H6"
  };
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
  shapeType?: 'box' | 'cylinder';
  toolhead?: ToolheadId;
  /** Per-feature toolhead mapping for scaffold mode (optional). */
  scaffoldTools?: ScaffoldToolMapping;
  /** Optional assignment to a specific well in a multiwell plate. */
  wellAssignment?: {
    format: 6 | 12 | 24 | 48;
    wellId: string; // e.g., "A1", "B3", "H6"
  };
  /** Per-model FDM profile overrides. */
  fdmSettings?: Partial<FDMPrintSettings>;
}

export interface BackendRangeOverride {
  start: number;
  end: number;
  gradientMode?: 'flat' | 'gradient';
  irr: number;
  endLightIntensity?: number;
  exposure?: number;
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
  dose_mJ_cm2: number;
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
  physical_layer_count?: number;
  layers: JobLayer[] | string[];
  constructs?: any[];
}

// =============================================================================
//  BioFFF New Types — FDM Multi-Toolhead Bio-Printer
// =============================================================================

export type ToolheadId = 'fdm' | 'syringe' | 'uv' | 'none';

export interface ScaffoldToolMapping {
  perimeter: ToolheadId;
  infill: ToolheadId;
  solidInfill: ToolheadId;
  support: ToolheadId;
}

export type InfillPattern =
  | 'rectilinear' | 'monotonic' | 'monotoniclines' | 'alignedrectilinear' 
  | 'grid' | 'triangles' | 'stars' | 'cubic' | 'line'
  | 'concentric' | 'honeycomb' | '3dhoneycomb' | 'gyroid' | 'hilbertcurve'
  | 'archimedeanchords' | 'octagramspiral' | 'adaptivecubic' | 'supportcubic'
  | 'lightning' | 'none';

export const INFILL_PATTERN_LABELS: Record<InfillPattern, string> = {
  rectilinear: 'Rectilinear',
  monotonic: 'Monotonic',
  monotoniclines: 'Monotonic Lines',
  alignedrectilinear: 'Aligned Rectilinear',
  grid: 'Grid',
  triangles: 'Triangles',
  stars: 'Stars',
  cubic: 'Cubic',
  line: 'Line',
  concentric: 'Concentric',
  honeycomb: 'Honeycomb',
  '3dhoneycomb': '3D Honeycomb',
  gyroid: 'Gyroid',
  hilbertcurve: 'Hilbert Curve',
  archimedeanchords: 'Archimedean Chords',
  octagramspiral: 'Octagram Spiral',
  adaptivecubic: 'Adaptive Cubic',
  supportcubic: 'Support Cubic',
  lightning: 'Lightning',
  none: 'None (0%)',
};


export type PrintQuality = 'draft' | 'standard' | 'quality' | 'ultra';

// ---------------------------------------------------------------------------
//  Toolhead Configurations
// ---------------------------------------------------------------------------

export interface BaseToolheadConfig {
  id: ToolheadId;
  label: string;
  klipper_tool: string;
  installed: boolean;
  slot?: number;
  activation_macro?: string;
  deactivation_macro?: string;
}

export interface FDMToolheadConfig extends BaseToolheadConfig {
  id: 'fdm';
  nozzleDiameter: number;
  filamentDiameter: number;
  maxTemperature: number;
  defaultTemperature: number;
  retractionLength: number;
  retractionSpeed: number;
  flowratePercent?: number;
  retractDistance?: number;
  zLiftDistance?: number;
}

export interface SyringeToolheadConfig extends BaseToolheadConfig {
  id: 'syringe';
  syringeVolumeMl: number;
  nozzleDiameterMm: number;
  flowRateUlPerMm: number;
  pressurizationSteps: number;
  retractionSteps: number;
  actuatorType: 'mechanical' | 'pneumatic';
  pressureKPa?: number;
  flowrateMmPerSec?: number;
  retractDistance?: number;
}

export interface UVToolheadConfig extends BaseToolheadConfig {
  id: 'uv';
  wavelengthNm: 365 | 405 | 385;
  maxPowerMw: number;
  defaultDose: number;
  defaultExposureTime: number;
  mode: 'fixed' | 'scanning';
}

export type ToolheadConfig = FDMToolheadConfig | SyringeToolheadConfig | UVToolheadConfig;

// ---------------------------------------------------------------------------
//  Print Settings
// ---------------------------------------------------------------------------

export interface FDMPrintSettings {
  layerHeightMm: number;
  firstLayerHeightMm: number;
  perimeterSpeedMmS: number;
  externalPerimeterSpeedMmS: number;
  infillSpeedMmS: number;
  travelSpeedMmS: number;
  firstLayerSpeedMmS: number;
  infillPercent: number;
  infillPattern: InfillPattern;
  wallCount: number;
  topSolidLayers: number;
  bottomSolidLayers: number;
  nozzleTemperature: number;
  bedTemperature: number;
  fanSpeedPercent: number;
  quality: PrintQuality;
  supportsEnabled: boolean;
  brimWidthMm: number;
  zHopEnabled: boolean;
  zHopHeightMm: number;
  fillAngle?: number;
  extrusionMultiplier?: number;
}

export interface SyringePrintSettings {
  flowRateUlPerMm: number;
  pressureKPa?: number;
  infillPercent: number;
  infillPattern: InfillPattern;
  wallCount: number;
  layerHeightMm: number;
  printSpeedMmS: number;
  travelSpeedMmS: number;
  retractionSteps: number;
  pressurizationSteps: number;
}

export interface UVCrosslinkSettings {
  doseTargetMjCm2: number;
  exposureTimeSec: number;
  scanSpeedMmS?: number;
  pausePrint: boolean;
  mode?: 'stationary' | 'sweep';
  pattern?: 'zigzag' | 'concentric' | 'infill_mimic';
  powerPercentage?: number;
  lineSpacingMm?: number;
  zOffsetMm?: number;
  trigger?: 'after_layer' | 'after_segment';
}

// ---------------------------------------------------------------------------
//  Resolved Execution Plan
// ---------------------------------------------------------------------------

export interface ResolvedLayerSettings {
  mapping: Record<'perimeter' | 'infill' | 'solidInfill' | 'support', ToolheadId>;
  fdm?: Partial<FDMPrintSettings>;
  syringe?: Partial<SyringePrintSettings>;
  uv?: UVCrosslinkSettings;
  poreInjectionEnabled?: boolean;
  preMacro?: string;
  postMacro?: string;
}

export interface ResolvedLayerRange {
  layerFrom: number;
  layerTo: number;
  settings: ResolvedLayerSettings;
}

export interface ResolvedModelPlan {
  modelId: string;
  modelName: string;
  ranges: ResolvedLayerRange[];
}

export interface LayerAction {
  id: string;
  layerFrom: number;
  layerTo: number;
  modelId?: string | 'all';
  priority?: number;
  kind: 'feature_override' | 'parameter_override' | 'process_event';
  targetFeatures?: ('perimeter' | 'infill' | 'solidInfill' | 'support' | 'all')[];
  toolOverride?: ToolheadId;
  scaffoldTools?: ScaffoldToolMapping;
  fdmSettings?: Partial<FDMPrintSettings>;
  syringeSettings?: Partial<SyringePrintSettings>;
  uvSettings?: UVCrosslinkSettings;
  poreInjectionEnabled?: boolean;
  preMacro?: string;
  postMacro?: string;
  color?: string;
  label?: string;
}

// ---------------------------------------------------------------------------
//  Z Zones — Unified Height-based Slicing Overrides
// ---------------------------------------------------------------------------

export interface ZZone {
  id: string;
  modelScope: 'all' | string;
  zStartMm: number;
  zEndMm: number;
  enabled: boolean;
  priority: number;

  featureOverride?: {
    toolhead?: ToolheadId;
    targetFeatures?: ('all' | 'perimeter' | 'infill' | 'solidInfill' | 'support')[];
    /** Per-feature override mapping within this zone. */
    scaffoldTools?: ScaffoldToolMapping;
  };

  parameterOverride?: {
    fdm?: Partial<FDMPrintSettings>;
    syringe?: Partial<SyringePrintSettings>;
    poreInjectionEnabled?: boolean;
  };

  processEvent?: {
    uvExposureTimeSec?: number;
    doseTargetMjCm2?: number;
    pausePrint?: boolean;
    scanSpeedMmS?: number;
    mode?: 'stationary' | 'sweep';
    pattern?: 'zigzag' | 'concentric' | 'infill_mimic';
    powerPercentage?: number;
    lineSpacingMm?: number;
    zOffsetMm?: number;
    trigger?: 'after_layer' | 'after_segment';
  };

  label?: string;
  color?: string;
}

// ---------------------------------------------------------------------------
//  Global FDM Settings
// ---------------------------------------------------------------------------

export interface FDMGlobalSettings {
  buildVolume: { x: number; y: number; z: number };
  moonrakerUrl: string;
  toolheads: ToolheadConfig[];
  defaultFDM: FDMPrintSettings;
  layerActions: LayerAction[];
  manualToolchangeConfirm: boolean;
  bedMeshEnabled: boolean;
}

export interface FDMJobManifest {
  job_id: string;
  type: 'fdm';
  gcode_filename: string;
  estimated_time_sec: number;
  estimated_filament_mm?: number;
  layer_count: number;
  layer_height_mm: number;
  toolhead_actions: LayerAction[];
  created_at: string;
  status?: 'idle' | 'printing' | 'paused' | 'complete' | 'error' | 'cancelled';
}

export interface MoonrakerStatus {
  state: 'ready' | 'printing' | 'paused' | 'error' | 'shutdown' | 'startup';
  message: string;
  filename?: string;
  progress?: number;
  current_layer?: number;
  total_layers?: number;
  print_duration?: number;
  filament_used?: number;
  extruder_temp?: number;
  bed_temp?: number;
}
export interface ProjectProtocol {
  id: string;
  name: string;
  author: string;
  description?: string;
  tags?: string[];
  createdAt: string;
  thumbnail?: string;
  
  // Snapshotted project state
  models: ModelData[];
  globalSettings: GlobalSettings;
  zZones: ZZone[];
  toolheads: ToolheadConfig[];
  selectedMaterials: Record<string, string>;
  userMaterials: MaterialProfile[];
  
  // Slicing result
  jobInfo?: {
    jobId: string;
    estimatedTimeSec: number;
    filamentUsedMm?: number;
    layerCount: number;
  };
  notes?: string;
}
