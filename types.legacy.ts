// ---------------------------------------------------------------------------
//  LEGACY — DLP3 / Resina Inheritance (Aislado para retrocompatibilidad)
// ---------------------------------------------------------------------------

/** @deprecated Utilizar la configuración de cabezales BioFFF. Conservado para compatibilidad de proyectos de resina previos. */
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
  modifiers?: any[];
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
