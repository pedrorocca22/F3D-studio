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
  /** Número estimado total de celdas (poros) en el área dada */
  estimatedCellCount: number;
  /** Volumen de una única celda a lo largo de toda la altura Z (µL) */
  singleCellVolumeUl: number;
  /** Volumen máximo total disponible en todos los poros (µL) */
  totalMaxVolumeUl: number;
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
  extrusionWidthMm: number = 0.4
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
  const estimatedCellCount = cellsX * cellsY;

  // Volumen de una celda (prisma rectangular) en mm³ (1 mm³ = 1 µL)
  const singleCellVolumeUl = (poreSizeMm * poreSizeMm) * zHeightMm;

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
