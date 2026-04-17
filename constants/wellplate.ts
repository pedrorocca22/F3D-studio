/**
 * SINGLE SOURCE OF TRUTH for multiwell plate specifications.
 * FIX #4: Previously duplicated in server.py, LayersPanel.tsx and App.tsx with inconsistent fields.
 *
 * Physical specs reference: ANSI/SLAS 1-2004 microplate standards.
 */
export interface WellPlateSpec {
  /** Number of columns */
  cols: number;
  /** Number of rows */
  rows: number;
  /** Center-to-center spacing between wells in mm */
  pitch: number;
  /** Well inner diameter in mm (usable area for models) */
  dia: number;
}

export const MULTIWELL_SPECS: Record<string, WellPlateSpec> = {
  '6':  { cols: 3, rows: 2, pitch: 39.1, dia: 34.8 },
  '12': { cols: 4, rows: 3, pitch: 26.1, dia: 22.1 },
  '24': { cols: 6, rows: 4, pitch: 19.3, dia: 15.62 },
  '48': { cols: 8, rows: 6, pitch: 13.0, dia: 11.0 },
} as const;

export type MultiwellFormat = 6 | 12 | 24 | 48;
export const MULTIWELL_FORMATS: MultiwellFormat[] = [6, 12, 24, 48];

/** Generate all well IDs for a given plate format (e.g. "A1", "B3") */
export function getWellIds(format: MultiwellFormat): string[] {
  const spec = MULTIWELL_SPECS[String(format)];
  if (!spec) return [];
  const ids: string[] = [];
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.cols; c++) {
      ids.push(String.fromCharCode(65 + r) + (c + 1));
    }
  }
  return ids;
}

/** Calculate the XY position (mm) of a well relative to the plate center */
export function getWellPosition(format: MultiwellFormat, wellId: string): { x: number; y: number } | null {
  const spec = MULTIWELL_SPECS[String(format)];
  if (!spec) return null;
  try {
    const row = wellId.charCodeAt(0) - 65;
    const col = parseInt(wellId.slice(1), 10) - 1;
    return {
      x: (col - (spec.cols - 1) / 2.0) * spec.pitch,
      y: (row - (spec.rows - 1) / 2.0) * spec.pitch,
    };
  } catch {
    return null;
  }
}
