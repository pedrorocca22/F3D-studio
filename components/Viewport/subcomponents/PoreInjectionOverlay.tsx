import React, { useEffect, useState, useMemo } from 'react';
import { ModelData, GlobalSettings } from '../../../types';
import { BACKEND_URL } from '../../../config';
import { Html } from '@react-three/drei';

interface PoreInjectionOverlayProps {
  poreInjection?: GlobalSettings['poreInjection'];
  models: ModelData[];
  globalSettings: GlobalSettings;
  detectedPores?: Array<{ x: number; y: number; z: number; modelId: string; layer: number }>;
  bedCenter?: { x: number; y: number };
}

const MIN_PORE_RADIUS_MM = 0.12;
const MAX_PORE_RADIUS_MM = 0.55;

export const PoreInjectionOverlay: React.FC<PoreInjectionOverlayProps> = ({
  poreInjection,
  models,
  globalSettings,
  detectedPores,
  bedCenter
}) => {
  // If we have real detected pores, render them exactly
  const realPores = useMemo(() => {
    if (!detectedPores || detectedPores.length === 0) return [];
    
    const bedX = bedCenter?.x || 0;
    const bedY = bedCenter?.y || 0;
    const { zStartMm, zEndMm } = poreInjection || { zStartMm: 0, zEndMm: 0 };
    
    // Estimate a reasonable display radius
    const nozzle = Number(globalSettings.nozzleDiameter ?? 0.4);
    const infill = Number(globalSettings.infill ?? 15);
    const f = Math.max(0.01, Math.min(1, infill / 100));
    const pitch = (Math.max(0.45, nozzle * 1.125) / f) * (globalSettings.infillPattern === 'grid' ? 2 : 1);
    
    const layerHeightMm = (globalSettings.layerHeight || 200) / 1000;
    const rawHeight = zEndMm - zStartMm;
    const height = rawHeight <= 0.01 ? layerHeightMm : rawHeight;

    const radius = Math.max(
      MIN_PORE_RADIUS_MM,
      Math.min(MAX_PORE_RADIUS_MM, pitch * 0.18)
    );

    return detectedPores.map((p, i) => ({
      key: `real-pore-${i}-${p.layer}`,
      x: p.x - bedX,
      y: p.z,
      z: p.y - bedY,
      radius,
      height
    }));
  }, [detectedPores, bedCenter, poreInjection, globalSettings]);

  // If no real pores yet, show the "Z-Band" configuration volume
  const zBandData = useMemo(() => {
    if (realPores.length > 0 || !poreInjection?.enabled || models.length === 0) return null;
    
    const { zStartMm, zEndMm } = poreInjection;
    const height = Math.max(0.1, zEndMm - zStartMm);
    const centerY = zStartMm + height / 2;

    return models.map(m => {
      if (!m.size) return null;
      const sx = m.size.x * m.transform.scale.x;
      const sy = m.size.y * m.transform.scale.y;
      return {
        id: m.id,
        pos: [m.transform.position.x, centerY, m.transform.position.z] as [number, number, number],
        size: [sx, height, sy] as [number, number, number]
      };
    }).filter(Boolean);
  }, [realPores, poreInjection, models]);

  if (!poreInjection?.enabled) return null;

  return (
    <group name="pore-injection-overlay">
      {/* REAL RESULTS (Post-Slice) */}
      {realPores.map((p) => (
        <mesh key={p.key} position={[p.x, p.y, p.z]}>
          <cylinderGeometry args={[p.radius, p.radius, p.height, 12]} />
          <meshStandardMaterial
            color="#39d5e8"
            emissive="#18c1d6"
            emissiveIntensity={0.8}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}

      {/* CONFIGURATION GUIDE (Pre-Slice) */}
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
