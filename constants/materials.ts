import { MaterialProfile } from '../types';

export const MATERIAL_PRESETS: MaterialProfile[] = [
  // --- Thermoplastics (FDM) ---
  {
    id: 'mat-pla-standard',
    name: 'PLA Standard',
    category: 'thermoplastic',
    color: '#3b82f6', // blue
    temp: 210,
    bedTemp: 60,
    retraction: 1.0,
    speedMultiplier: 1.0
  },
  {
    id: 'mat-pcl-bio',
    name: 'PCL (Bio-grade)',
    category: 'thermoplastic',
    color: '#10b981', // emerald
    temp: 90,
    bedTemp: 37,
    retraction: 2.5,
    speedMultiplier: 0.6
  },
  // --- Hydrogels (Syringe) ---
  {
    id: 'mat-gelma-5',
    name: 'GelMA 5% / LAP',
    category: 'hydrogel',
    color: '#f59e0b', // amber
    flowRate: 0.8,
    pressure: 15,
    doseMjCm2: 50
  },
  {
    id: 'mat-alginate-2',
    name: 'Alginate 2%',
    category: 'hydrogel',
    color: '#8b5cf6', // violet
    flowRate: 1.2,
    pressure: 25
  },
  // --- Supports ---
  {
    id: 'mat-pluronic-f127',
    name: 'Pluronic F-127',
    category: 'support',
    color: '#f43f5e', // rose
    flowRate: 1.5,
    pressure: 40
  }
];
