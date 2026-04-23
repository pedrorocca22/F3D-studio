import React, { useMemo } from 'react';
import { ModelData, GlobalSettings, ZZone } from '../../../types';

interface PoreInjectionOverlayProps {
  poreInjection?: GlobalSettings['poreInjection'];
  models: ModelData[];
  globalSettings: GlobalSettings;
  zZones: ZZone[];
  detectedPores?: Array<{ x: number; y: number; z?: number; modelId?: string; layer: number }>;
  bedCenter?: { x: number; y: number };
}

const MIN_PORE_RADIUS_MM = 0.12;
const MAX_PORE_RADIUS_MM = 0.55;

export const PoreInjectionOverlay: React.FC<PoreInjectionOverlayProps> = ({
  poreInjection,
  models,
  globalSettings,
  zZones,
  detectedPores,
  bedCenter
}) => {
  // 1. CÁLCULO DE RESULTADOS REALES (Post-Slice)
  const realPores = useMemo(() => {
    // Si no hay datos de poros detectados, devolvemos array vacío
    if (!detectedPores || detectedPores.length === 0) return [];

    const bedX = bedCenter?.x || 0;
    const bedY = bedCenter?.y || 0;

    // Parámetros de impresión para calcular el radio visual del poro
    const nozzle = Number(globalSettings.nozzleDiameter ?? 0.4);
    const infill = Number(globalSettings.infill ?? 15);
    const f = Math.max(0.01, Math.min(1, infill / 100));

    const layerHeightMm = Number(globalSettings.layerHeight || 200) / 1000;

    // Altura visual de cada cilindro (0.6mm o el doble de la capa para asegurar visibilidad)
    const displayHeight = Math.max(0.6, layerHeightMm * 2);

    const radius = Math.max(
      MIN_PORE_RADIUS_MM,
      Math.min(MAX_PORE_RADIUS_MM, (nozzle * 1.5) * (1 - f))
    );

    // Transformación de coordenadas de G-code a espacio de Three.js (Y es vertical)
    return detectedPores.map((p, i) => {
      // Fallback: si el backend no envía 'z' explícita, usamos la capa (layer)
      const poreZ = p.z !== undefined ? Number(p.z) : (Number(p.layer) * layerHeightMm);

      return {
        key: `real-pore-${i}-${p.layer}`,
        x: Number(p.x) - bedX,
        y: poreZ,               // Altura física (Eje vertical en Three.js)
        z: Number(p.y) - bedY,  // Profundidad (Eje Y en G-code)
        radius,
        height: displayHeight
      };
    });
  }, [detectedPores, bedCenter, globalSettings]);

  // 2. CÁLCULO DE LA GUÍA DE CONFIGURACIÓN (Pre-Slice)
  const zBandData = useMemo(() => {
    // Si ya hay resultados reales o el sistema está desactivado, no mostramos la banda
    if (realPores.length > 0 || !poreInjection?.enabled || models.length === 0) return null;

    // Determine segments to show
    const segmentsToShow: { zStart: number; zEnd: number }[] = [];
    
    // Check if any Z-Zone has poreInjectionEnabled
    const activeZones = zZones.filter(z => z.enabled && z.parameterOverride?.poreInjectionEnabled);
    
    if (activeZones.length > 0) {
      activeZones.forEach(z => {
        segmentsToShow.push({ zStart: z.zStartMm, zEnd: z.zEndMm });
      });
    } else {
      // Fallback to global range
      segmentsToShow.push({ zStart: poreInjection.zStartMm, zEnd: poreInjection.zEndMm });
    }

    const bands: any[] = [];
    models.forEach(m => {
      if (!m.size) return;
      const sx = m.size.x * m.transform.scale.x;
      const sy = m.size.y * m.transform.scale.y;
      
      segmentsToShow.forEach((seg, idx) => {
        const height = Math.max(0.1, Number(seg.zEnd) - Number(seg.zStart));
        const centerY = Number(seg.zStart) + height / 2;
        bands.push({
          id: `${m.id}-band-${idx}`,
          pos: [m.transform.position.x, centerY, m.transform.position.z] as [number, number, number],
          size: [sx, height, sy] as [number, number, number]
        });
      });
    });

    return bands;
  }, [realPores, poreInjection, models, zZones]);

  // --- LOGS DE DEPURACIÓN CRÍTICOS ---
  // Estos logs aparecerán en la consola de Chrome/Edge (F12) al terminar el slicing
  console.log("=== DEBUG 2: PROPS DEL OVERLAY ===", {
    enabled: poreInjection?.enabled,
    detectedPoresCount: detectedPores?.length,
    detectedPoresRaw: detectedPores,
    bedCenter: bedCenter
  });

  console.log("=== DEBUG 3: GEOMETRÍA CALCULADA (realPores) ===", realPores);

  // Si la función de inyección de poros no está habilitada en los ajustes globales, no renderizamos nada
  if (!poreInjection?.enabled) return null;

  return (
    <group name="pore-injection-overlay">
      {/* RESULTADOS REALES: Se muestran como cilindros brillantes tras el slicing */}
      {realPores.map((p) => (
        <mesh key={p.key} position={[p.x, p.y, p.z]}>
          <cylinderGeometry args={[p.radius, p.radius, p.height, 12]} />
          <meshStandardMaterial
            color="#39d5e8"
            emissive="#18c1d6"
            emissiveIntensity={0.9}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}

      {/* GUÍA DE CONFIGURACIÓN: Se muestra como una banda translúcida en el área de inyección definida */}
      {zBandData?.map((band: any) => (
        <mesh key={band.id} position={band.pos}>
          <boxGeometry args={band.size} />
          <meshStandardMaterial
            color="#39d5e8"
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};