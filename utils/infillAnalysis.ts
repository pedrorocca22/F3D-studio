/**
 * infillAnalysis.ts — BioFFF Studio
 * Utilidades para calcular y estimar la geometría del infill tipo GRID.
 * Usado para la inyección de poros (Multilayer mode) para determinar
 * la capacidad volumétrica teórica de los poros de un segmento FDM.
 */

export interface InfillAnalysisResult {
  /** Espaciado entre centros de líneas de infill (mm) */
  lineSpacingMm: number;
  /** Tamaño interior del poro cuadrado (mm) */
  poreSizeMm: number;
  /** Número estimado de eventos de inyección a través de todas las capas */
  estimatedCellCount: number;
  /** Capacidad geométrica de una celda en una capa (µL) */
  singleCellVolumeUl: number;
  /** Capacidad geométrica total de todos los eventos de inyección (µL) */
  totalMaxVolumeUl: number;
}

export function estimateGridCellCapacityUl(
  infillPercent: number,
  extrusionWidthMm: number,
  layerHeightMm: number,
): number {
  if (infillPercent <= 0 || infillPercent >= 100 || extrusionWidthMm <= 0 || layerHeightMm <= 0) return 0;
  const lineSpacingMm = (2 * extrusionWidthMm) / (infillPercent / 100);
  const poreSizeMm = Math.max(0, lineSpacingMm - extrusionWidthMm);
  return poreSizeMm * poreSizeMm * layerHeightMm;
}

/**
 * Calcula la volumetría teórica de un patrón GRID.
 * 
 * Basado en la fórmula de densidad de PrusaSlicer para "Grid":
 * La densidad D (0.0 a 1.0) = 2 * ExtrusionWidth / LineSpacing
 * Despejando: LineSpacing = 2 * ExtrusionWidth / D
 * 
 * @param areaWidthMm Ancho del bounding box del modelo (mm)
 * @param areaDepthMm Profundidad del bounding box del modelo (mm)
 * @param zHeightMm Altura total del segmento a inyectar (zEnd - zStart)
 * @param infillPercent Porcentaje de infill (ej. 20 para 20%)
 * @param extrusionWidthMm Ancho de extrusión (normalmente igual al diámetro del nozzle o ligeramente mayor)
 */
export function analyzeGridInfill(
  areaWidthMm: number,
  areaDepthMm: number,
  zHeightMm: number,
  infillPercent: number,
  extrusionWidthMm: number = 0.4,
  layerHeightMm: number = 0.2,
): InfillAnalysisResult {
  if (infillPercent <= 0 || infillPercent >= 100 || zHeightMm <= 0 || areaWidthMm <= 0 || areaDepthMm <= 0) {
    return {
      lineSpacingMm: 0,
      poreSizeMm: 0,
      estimatedCellCount: 0,
      singleCellVolumeUl: 0,
      totalMaxVolumeUl: 0,
    };
  }

  const density = infillPercent / 100.0;
  
  // Para patrón Grid (ortogonal, cruza en la misma capa):
  // Densidad = (Área de 2 líneas en una celda) / (Área total de la celda)
  // D ≈ (2 * W * S - W^2) / S^2  (Ignorando W^2 para S grandes, D ≈ 2W/S)
  const lineSpacingMm = (2 * extrusionWidthMm) / density;

  // El tamaño interno del poro (vacío)
  const poreSizeMm = Math.max(0, lineSpacingMm - extrusionWidthMm);

  // Número de celdas a lo largo de X e Y
  const cellsX = Math.floor(areaWidthMm / lineSpacingMm);
  const cellsY = Math.floor(areaDepthMm / lineSpacingMm);
  const cellsPerLayer = cellsX * cellsY;
  const estimatedLayerCount = Math.max(1, Math.ceil(zHeightMm / layerHeightMm));
  const estimatedCellCount = cellsPerLayer * estimatedLayerCount;

  // Capacidad por celda y por capa (1 mm³ = 1 µL).
  const singleCellVolumeUl = poreSizeMm * poreSizeMm * layerHeightMm;

  // Capacidad máxima sumando todos los poros
  const totalMaxVolumeUl = estimatedCellCount * singleCellVolumeUl;

  return {
    lineSpacingMm,
    poreSizeMm,
    estimatedCellCount,
    singleCellVolumeUl,
    totalMaxVolumeUl,
  };
}
