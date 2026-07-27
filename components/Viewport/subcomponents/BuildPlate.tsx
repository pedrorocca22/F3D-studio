import React from 'react';
import * as THREE from 'three';
import { GlobalSettings } from '../../../types';
import { MULTIWELL_SPECS } from '../../../constants/wellplate';

interface BuildPlateProps {
  globalSettings: GlobalSettings;
}

export const BuildPlate: React.FC<BuildPlateProps> = ({ globalSettings }) => {
  const bed = globalSettings?.printBed || { type: 'glass_bed', dimensions: { width: 100, height: 100 } };
  const bedType = bed?.type || 'glass_bed';

  let width = 100;
  let depth = 100;

  if (bedType === 'glass_bed') {
    width = bed.dimensions?.width || 100;
    depth = bed.dimensions?.height || 100;
  } else if (bedType === 'multiwell_plate') {
    width = 127.89;
    depth = 85.6;
  } else if (bedType === 'petri_dish') {
    width = bed.petriDiameter || 60;
    depth = bed.petriDiameter || 60;
  }

  return (
    <group>
      {bedType === 'glass_bed' && (
        <>
          {/* A real surface keeps the bed visible even when line rendering is faint. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[width, depth]} />
            <meshBasicMaterial color="#e2e8f0" transparent opacity={0.42} side={THREE.DoubleSide} />
          </mesh>
          <gridHelper
            args={[Math.max(width, depth), 10, '#94a3b8', '#cbd5e1']}
            position={[0, 0.04, 0]}
          />
        </>
      )}

      {/* 1. GLASS BED - ONLY OUTLINE */}
      {bedType === 'glass_bed' && (
        <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <edgesGeometry args={[new THREE.PlaneGeometry(width, depth)]} />
          <lineBasicMaterial color="#3b82f6" opacity={0.6} transparent />
        </lineSegments>
      )}

      {/* 2. PETRI DISH - ONLY OUTLINE */}
      {bedType === 'petri_dish' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[(width / 2) - 0.5, width / 2, 128]} />
          <meshBasicMaterial color="#3b82f6" opacity={0.6} transparent />
        </mesh>
      )}

      {/* 3. MULTIWELL PLATE - ONLY OUTLINES */}
      {bedType === 'multiwell_plate' && (
        <group>
          {/* Main Outline */}
          <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(127.89, 85.6)]} />
            <lineBasicMaterial color="#3b82f6" opacity={0.4} transparent />
          </lineSegments>

          {/* Procedural Wells - ONLY OUTLINES */}
          {(() => {
            const format = bed.multiwellFormat?.toString() || '24';
            const spec = MULTIWELL_SPECS[format as keyof typeof MULTIWELL_SPECS] || MULTIWELL_SPECS['24'];
            const wells = [];
            for (let r = 0; r < spec.rows; r++) {
              for (let c = 0; c < spec.cols; c++) {
                const x = (c - (spec.cols - 1) / 2) * spec.pitch;
                const z = (r - (spec.rows - 1) / 2) * spec.pitch;
                wells.push(
                  <group key={`${r}-${c}`} position={[x, 0.01, z]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[(spec.dia / 2) - 0.3, spec.dia / 2, 64]} />
                      <meshBasicMaterial color="#3b82f6" opacity={0.2} transparent />
                    </mesh>
                  </group>
                );
              }
            }
            return wells;
          })()}
        </group>
      )}

    </group>
  );
};
