import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ModelData, GlobalSettings, ZZone } from '../../../types';
import { clippingPlane as globalClippingPlane } from '../constants';

interface PoreInjectionOverlayProps {
  poreInjection?: GlobalSettings['poreInjection'];
  models: ModelData[];
  globalSettings: GlobalSettings;
  zZones: ZZone[];
  detectedPores?: Array<{ x: number; y: number; z?: number; modelId?: string; layer: number }>;
  bedCenter?: { x: number; y: number };
  isClipping?: boolean;
  currentHeight?: number | null;
}

const MIN_PORE_RADIUS_MM = 0.12;
const MAX_PORE_RADIUS_MM = 0.55;

export const PoreInjectionOverlay: React.FC<PoreInjectionOverlayProps> = ({
  poreInjection,
  models,
  globalSettings,
  zZones,
  detectedPores,
  bedCenter,
  isClipping = false,
  currentHeight
}) => {
  // 1. LOCAL CLIPPING PLANE FOR G-CODE LAYERS
  const gcodeClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000), []);

  useEffect(() => {
    if (currentHeight !== undefined && currentHeight !== null) {
      gcodeClipPlane.constant = currentHeight;
    } else {
      gcodeClipPlane.constant = 1000; // Show all if no height
    }
  }, [currentHeight, gcodeClipPlane]);

  // 2. CÁLCULO DE RESULTADOS REALES (Post-Slice)
  const realPores = useMemo(() => {
    if (!detectedPores || detectedPores.length === 0) return [];

    const bedX = bedCenter?.x || 0;
    const bedY = bedCenter?.y || 0;

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

    return detectedPores.map((p, i) => {
      const poreZ = p.z !== undefined ? Number(p.z) : (Number(p.layer) * layerHeightMm);

      return {
        key: `real-pore-${i}-${p.layer}`,
        x: Number(p.x) - bedX,
        y: poreZ,               // Altura física
        z: Number(p.y) - bedY,  // Profundidad
        radius,
        height: displayHeight
      };
    });
  }, [detectedPores, bedCenter, globalSettings]);

  // 3. CÁLCULO DE LA GUÍA DE CONFIGURACIÓN (Pre-Slice)
  const zBandData = useMemo(() => {
    if (realPores.length > 0 || !poreInjection?.enabled || models.length === 0) return null;

    const segmentsToShow: { zStart: number; zEnd: number }[] = [];
    const activeZones = zZones.filter(z => z.enabled && z.parameterOverride?.poreInjectionEnabled);
    
    if (activeZones.length > 0) {
      activeZones.forEach(z => {
        segmentsToShow.push({ zStart: z.zStartMm, zEnd: z.zEndMm });
      });
    } else {
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

  if (!poreInjection?.enabled) return null;

  // Active planes: always include gcodeClipPlane, optionally include global clipping plane
  const activePlanes = [gcodeClipPlane];
  if (isClipping) activePlanes.push(globalClippingPlane);

  return (
    <group name="pore-injection-overlay">
      {realPores.map((p) => (
        <mesh key={p.key} position={[p.x, p.y, p.z]}>
          <cylinderGeometry args={[p.radius, p.radius, p.height, 12]} />
          <meshPhysicalMaterial
            color="#39d5e8"
            emissive="#18c1d6"
            emissiveIntensity={0.9}
            transparent
            opacity={0.85}
            clippingPlanes={activePlanes}
            clipShadows
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {zBandData?.map((band: any) => (
        <mesh key={band.id} position={band.pos}>
          <boxGeometry args={band.size} />
          <meshPhysicalMaterial
            color="#39d5e8"
            transparent
            opacity={0.15}
            depthWrite={false}
            clippingPlanes={activePlanes}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
};