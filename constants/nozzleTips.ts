/**
 * nozzleTips.ts — BioFFF Studio
 * Catálogo estático de puntas Nordson EFD SmoothFlow™.
 * Datos extraídos de la tabla oficial (Puntas Cónicas SmoothFlow).
 *
 * El modelo 3D es único para toda la familia (punta.stl).
 * Solo varía el color Three.js para representar el color físico de cada punta.
 */

export interface NozzleTip {
  /** Identificador único: <gauge>ga_<color_en> */
  id: string;
  brand: 'Nordson EFD';
  series: 'SmoothFlow';
  /** Calibre en gauge (AWG) */
  gauge: number;
  /** Nombre del color en español */
  colorName: string;
  /** Hex para representar el color físico en Three.js / UI */
  colorHex: string;
  /** Diámetro interior en mm */
  innerDiameterMm: number;
  /** Diámetro interior en pulgadas */
  innerDiameterIn: number;
  /** Número de referencia Nordson */
  standardRef: string;
}

export const NORDSON_TIPS: NozzleTip[] = [
  {
    id: '14ga_olive',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 14,
    colorName: 'Olivo',
    colorHex: '#6B6B2A',
    innerDiameterMm: 1.60,
    innerDiameterIn: 0.063,
    standardRef: '7018052',
  },
  {
    id: '16ga_gray',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 16,
    colorName: 'Gris',
    colorHex: '#9E9E9E',
    innerDiameterMm: 1.19,
    innerDiameterIn: 0.047,
    standardRef: '7018100',
  },
  {
    id: '18ga_green',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 18,
    colorName: 'Verde',
    colorHex: '#2E9E4F',
    innerDiameterMm: 0.84,
    innerDiameterIn: 0.033,
    standardRef: '7018158',
  },
  {
    id: '18ga_black',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 18,
    colorName: 'Negro',
    colorHex: '#1A1A1A',
    innerDiameterMm: 0.84,
    innerDiameterIn: 0.033,
    standardRef: '7018150',
  },
  {
    id: '20ga_pink',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 20,
    colorName: 'Rosa',
    colorHex: '#FF69B4',
    innerDiameterMm: 0.58,
    innerDiameterIn: 0.023,
    standardRef: '7005009',
  },
  {
    id: '20ga_black',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 20,
    colorName: 'Negro',
    colorHex: '#1A1A1A',
    innerDiameterMm: 0.58,
    innerDiameterIn: 0.023,
    standardRef: '7018211',
  },
  {
    id: '22ga_blue',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 22,
    colorName: 'Azul',
    colorHex: '#1E6FD9',
    innerDiameterMm: 0.41,
    innerDiameterIn: 0.016,
    standardRef: '7018298',
  },
  {
    id: '25ga_red',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 25,
    colorName: 'Rojo',
    colorHex: '#D32F2F',
    innerDiameterMm: 0.25,
    innerDiameterIn: 0.010,
    standardRef: '7018391',
  },
  {
    id: '25ga_black',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 25,
    colorName: 'Negro',
    colorHex: '#1A1A1A',
    innerDiameterMm: 0.25,
    innerDiameterIn: 0.010,
    standardRef: '7018373',
  },
  {
    id: '27ga_clear',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    gauge: 27,
    colorName: 'Transparente',
    colorHex: '#C8D8E8',
    innerDiameterMm: 0.20,
    innerDiameterIn: 0.008,
    standardRef: '7018417',
  },
];

/** Busca una punta por su ID. Devuelve undefined si no existe. */
export function getTipById(id: string): NozzleTip | undefined {
  return NORDSON_TIPS.find(t => t.id === id);
}

/** Punta por defecto (20 GA Rosa — la que ya estaba en el proyecto). */
export const DEFAULT_TIP_ID = '20ga_pink';
