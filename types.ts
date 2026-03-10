
// =============================================================================
//  BioFFF Studio — Type Definitions
//  Migrated from DLP3 Bioprinter. Adds FDM multi-toolhead interfaces.
// =============================================================================

// ---------------------------------------------------------------------------
//  DLP3 Legacy Types (kept for backward compatibility with existing job files)
// ---------------------------------------------------------------------------

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

export interface GlobalSettings {
  layerHeight: number;
  adhesion?: AdhesionSettings;
  thermodynamic?: ThermodynamicSettings;
  motor?: MotorControlSettings;
  // FDM additions
  nozzleTemperature?: number;
  bedTemperature?: number;
  infill?: number;
  infillPattern?: InfillPattern;
  perimeters?: number;
  supportsEnabled?: boolean;
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

/**
 * Identifies a physical toolhead mounted on the printer.
 *  - 'fdm'     : FDM hot-end (filament extrusion)
 *  - 'syringe' : Cold syringe extruder (mechanical plunger — hydrogels, bioinks)
 *  - 'uv'      : UV crosslinking head (LED 365 nm or 405 nm)
 *  - 'none'    : No active toolhead (parking / idle)
 */
export type ToolheadId = 'fdm' | 'syringe' | 'uv' | 'none';

/** Infill pattern types valid for FDM / syringe printing */
export type InfillPattern = 'grid' | 'gyroid' | 'honeycomb' | 'linear' | 'concentric' | 'triangles' | 'none';

/** PrusaSlicer speed profile presets */
export type PrintQuality = 'draft' | 'standard' | 'quality' | 'ultra';

// ---------------------------------------------------------------------------
//  Toolhead Configurations
// ---------------------------------------------------------------------------

/** Base config shared by every toolhead */
export interface BaseToolheadConfig {
  id: ToolheadId;
  label: string;
  /** Klipper tool macro name, e.g. "T0", "T1", "T2" */
  klipper_tool: string;
  /** Whether this toolhead is physically installed */
  installed: boolean;
  /** Klipper macro to call on activation (in addition to Tn) */
  activation_macro?: string;
  /** Klipper macro to call on deactivation */
  deactivation_macro?: string;
}

export interface FDMToolheadConfig extends BaseToolheadConfig {
  id: 'fdm';
  nozzleDiameter: number;        // mm, e.g. 0.4
  filamentDiameter: number;      // mm, e.g. 1.75
  maxTemperature: number;        // °C, hardware limit
  defaultTemperature: number;    // °C, working temp
  retractionLength: number;      // mm
  retractionSpeed: number;       // mm/s
}

export interface SyringeToolheadConfig extends BaseToolheadConfig {
  id: 'syringe';
  /** Syringe volume in mL */
  syringeVolumeMl: number;
  /** Needle/nozzle inner diameter in mm */
  nozzleDiameterMm: number;
  /** Volumetric flow rate relationship: µl deposited per mm of travel */
  flowRateUlPerMm: number;
  /** Steps to pre-pressurize before printing starts */
  pressurizationSteps: number;
  /** Steps to retract after the print segment ends (anti-drip) */
  retractionSteps: number;
  /** Whether the syringe uses air pressure (pneumatic) or mechanical plunger */
  actuatorType: 'mechanical' | 'pneumatic';
  /** Air pressure in kPa (if pneumatic) */
  pressureKPa?: number;
}

export interface UVToolheadConfig extends BaseToolheadConfig {
  id: 'uv';
  /** LED wavelength in nm */
  wavelengthNm: 365 | 405 | 385;
  /** Maximum power in mW/cm² */
  maxPowerMw: number;
  /** Default crosslinking dose target in mJ/cm² */
  defaultDose: number;
  /** Default exposure time per layer in seconds */
  defaultExposureTime: number;
  /** Whether the head also moves (scanning UV) or is fixed */
  mode: 'fixed' | 'scanning';
}

export type ToolheadConfig = FDMToolheadConfig | SyringeToolheadConfig | UVToolheadConfig;

// ---------------------------------------------------------------------------
//  Print Settings
// ---------------------------------------------------------------------------

/** FDM-specific printing parameters */
export interface FDMPrintSettings {
  layerHeightMm: number;         // mm, e.g. 0.2
  firstLayerHeightMm: number;    // mm, usually 0.3
  printSpeedMmS: number;         // mm/s general extrusion speed
  travelSpeedMmS: number;        // mm/s travel (no extrusion)
  firstLayerSpeedMmS: number;    // mm/s
  infillPercent: number;         // 0–100
  infillPattern: InfillPattern;
  wallCount: number;             // perimeter count
  topSolidLayers: number;
  bottomSolidLayers: number;
  nozzleTemperature: number;     // °C
  bedTemperature: number;        // °C
  fanSpeedPercent: number;       // 0–100
  quality: PrintQuality;
  // Supports / brim
  supportsEnabled: boolean;
  brimWidthMm: number;
  // Advanced
  zHopEnabled: boolean;
  zHopHeightMm: number;
}

/** Syringe-specific segment parameters */
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

/** UV crosslink parameters per segment */
export interface UVCrosslinkSettings {
  doseTargetMjCm2: number;
  exposureTimeSec: number;
  /** If scanning, speed of the head in mm/s */
  scanSpeedMmS?: number;
  /** Pause motion during exposure */
  pausePrint: boolean;
}

// ---------------------------------------------------------------------------
//  Layer Action System (multi-toolhead sequencing)
// ---------------------------------------------------------------------------

/**
 * Defines what toolhead is active and with what parameters
 * for a specific range of layers.
 */
export interface LayerAction {
  id: string;
  /** Layer index from (inclusive) */
  layerFrom: number;
  /** Layer index to (inclusive) */
  layerTo: number;
  toolhead: ToolheadId;
  /** FDM-specific overrides for this segment */
  fdmSettings?: Partial<FDMPrintSettings>;
  /** Syringe-specific overrides for this segment */
  syringeSettings?: Partial<SyringePrintSettings>;
  /** UV crosslinker settings applied after the segment is deposited */
  uvSettings?: UVCrosslinkSettings;
  /** Klipper macro to run before this segment starts */
  preMacro?: string;
  /** Klipper macro to run after this segment completes */
  postMacro?: string;
  /** Color label shown in the layer timeline */
  color?: string;
  label?: string;
}

// ---------------------------------------------------------------------------
//  Global FDM Settings
// ---------------------------------------------------------------------------

export interface FDMGlobalSettings {
  /** Machine build volume in mm */
  buildVolume: { x: number; y: number; z: number };
  /** Moonraker API base URL */
  moonrakerUrl: string;
  /** Installed toolhead configurations */
  toolheads: ToolheadConfig[];
  /** Default FDM print settings */
  defaultFDM: FDMPrintSettings;
  /** Layer action sequence (toolhead schedule) */
  layerActions: LayerAction[];
  /** Whether to pause between toolhead changes for manual confirmation */
  manualToolchangeConfirm: boolean;
  /** Bed mesh compensation enabled */
  bedMeshEnabled: boolean;
}

// ---------------------------------------------------------------------------
//  Job & Experiment Types (FDM)
// ---------------------------------------------------------------------------

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
  /** Status from Moonraker */
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

// ---------------------------------------------------------------------------
//  Calibration Types (FDM)
// ---------------------------------------------------------------------------

export interface FlowCalibrationPoint {
  steps: number;
  measured_volume_ul: number;
  error_percent: number;
}

export interface FlowCalibrationProfile {
  toolhead_id: ToolheadId;
  syringe_volume_ml: number;
  points: FlowCalibrationPoint[];
  calibrated_at: string;
  notes: string;
}

export interface UVCalibrationPoint {
  exposure_time_sec: number;
  measured_dose_mj_cm2: number;
}

export interface UVCalibrationProfile {
  wavelength_nm: number;
  points: UVCalibrationPoint[];
  calibrated_at: string;
}
