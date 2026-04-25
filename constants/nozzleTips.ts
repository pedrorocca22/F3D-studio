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
  series: 'SmoothFlow' | 'Precision';
  /** Forma de la punta */
  type: 'conical' | 'straight';
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
    type: 'conical',
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
    type: 'conical',
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
    type: 'conical',
    gauge: 18,
    colorName: 'Verde',
    colorHex: '#2E9E4F',
    innerDiameterMm: 0.84,
    innerDiameterIn: 0.033,
    standardRef: '7018158',
  },

  {
    id: '20ga_pink',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    type: 'conical',
    gauge: 20,
    colorName: 'Rosa',
    colorHex: '#FF69B4',
    innerDiameterMm: 0.58,
    innerDiameterIn: 0.023,
    standardRef: '7005009',
  },

  {
    id: '22ga_blue',
    brand: 'Nordson EFD',
    series: 'SmoothFlow',
    type: 'conical',
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
    type: 'conical',
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
    type: 'conical',
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
    type: 'conical',
    gauge: 27,
    colorName: 'Transparente',
    colorHex: '#C8D8E8',
    innerDiameterMm: 0.20,
    innerDiameterIn: 0.008,
    standardRef: '7018417',
  },
  // PUNTAS RECTAS (Precision Stainless Steel)
  {
    id: '14ga_olive_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 14,
    colorName: 'Olivo',
    colorHex: '#6B6B2A',
    innerDiameterMm: 1.55,
    innerDiameterIn: 0.061,
    standardRef: '7018029',
  },
  {
    id: '15ga_amber_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 15,
    colorName: 'Ámbar',
    colorHex: '#FFB300',
    innerDiameterMm: 1.37,
    innerDiameterIn: 0.054,
    standardRef: '7018056',
  },
  {
    id: '18ga_green_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 18,
    colorName: 'Verde',
    colorHex: '#2E9E4F',
    innerDiameterMm: 0.84,
    innerDiameterIn: 0.033,
    standardRef: '7018107',
  },
  {
    id: '20ga_pink_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 20,
    colorName: 'Rosa',
    colorHex: '#FF69B4',
    innerDiameterMm: 0.61,
    innerDiameterIn: 0.024,
    standardRef: '7018163',
  },
  {
    id: '21ga_purple_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 21,
    colorName: 'Morado',
    colorHex: '#800080',
    innerDiameterMm: 0.51,
    innerDiameterIn: 0.020,
    standardRef: '7018222',
  },
  {
    id: '22ga_blue_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 22,
    colorName: 'Azul',
    colorHex: '#1E6FD9',
    innerDiameterMm: 0.41,
    innerDiameterIn: 0.016,
    standardRef: '7018260',
  },
  {
    id: '23ga_orange_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 23,
    colorName: 'Naranja',
    colorHex: '#FF8C00',
    innerDiameterMm: 0.33,
    innerDiameterIn: 0.013,
    standardRef: '7018302',
  },
  {
    id: '25ga_red_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 25,
    colorName: 'Rojo',
    colorHex: '#D32F2F',
    innerDiameterMm: 0.25,
    innerDiameterIn: 0.010,
    standardRef: '7018333',
  },
  {
    id: '27ga_clear_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 27,
    colorName: 'Transparente',
    colorHex: '#C8D8E8',
    innerDiameterMm: 0.20,
    innerDiameterIn: 0.008,
    standardRef: '7018395',
  },
  {
    id: '30ga_lavender_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 30,
    colorName: 'Lavanda',
    colorHex: '#E6E6FA',
    innerDiameterMm: 0.15,
    innerDiameterIn: 0.006,
    standardRef: '7018424',
  },
  {
    id: '32ga_yellow_st',
    brand: 'Nordson EFD',
    series: 'Precision',
    type: 'straight',
    gauge: 32,
    colorName: 'Amarillo',
    colorHex: '#FFEB3B',
    innerDiameterMm: 0.10,
    innerDiameterIn: 0.004,
    standardRef: '7018462',
  },
];

/** Busca una punta por su ID. Devuelve undefined si no existe. */
export function getTipById(id: string): NozzleTip | undefined {
  return NORDSON_TIPS.find(t => t.id === id);
}

/** Punta por defecto (20 GA Rosa — la que ya estaba en el proyecto). */
export const DEFAULT_TIP_ID = '20ga_pink';
