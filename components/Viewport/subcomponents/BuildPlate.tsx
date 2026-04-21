import React from 'react';
import * as THREE from 'three';
import { Grid, Text } from '@react-three/drei';
import { GlobalSettings } from '../../../types';
import { MULTIWELL_SPECS } from '../../../constants/wellplate';

interface BuildPlateProps {
  globalSettings: GlobalSettings;
}

export const BuildPlate: React.FC<BuildPlateProps> = ({ globalSettings }) => {
  const bed = globalSettings.printBed || { type: 'glass_bed', dimensions: { width: 100, height: 100 } };
  const bedType = bed.type;

  // Determine actual dimensions for labels and grid
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
      {/* Infinite Grid Helper */}
      <Grid 
        infiniteGrid 
        fadeDistance={400} 
        fadeStrength={5} 
        cellSize={10} 
        sectionSize={50} 
        sectionColor="#64748b" 
        sectionThickness={1} 
        cellColor="#94a3b8" 
        cellThickness={0.5} 
        position={[0, -0.01, 0]} 
      />

      {/* 1. GLASS BED */}
      {bedType === 'glass_bed' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
            <planeGeometry args={[width, depth]} />
            <meshStandardMaterial
              color="#f1f5f9"
              transparent
              opacity={0.3}
              roughness={0.1}
              metalness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(width, depth)]} />
            <lineBasicMaterial color="#3b82f6" linewidth={2} opacity={0.5} transparent />
          </lineSegments>
        </>
      )}

      {/* 2. PETRI DISH */}
      {bedType === 'petri_dish' && (
        <group>
          {/* Base of Petri */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
            <circleGeometry args={[width / 2, 64]} />
            <meshStandardMaterial 
              color="#e2e8f0" 
              transparent 
              opacity={0.4} 
              roughness={0} 
              metalness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* Rim of Petri */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <ringGeometry args={[(width / 2) - 0.5, width / 2, 64]} />
            <meshBasicMaterial color="#3b82f6" opacity={0.8} transparent />
          </mesh>
          {/* Subtle crosshair for centering */}
          <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
             <mesh>
               <planeGeometry args={[width * 0.1, 0.2]} />
               <meshBasicMaterial color="#3b82f6" opacity={0.3} transparent />
             </mesh>
             <mesh rotation={[0, 0, Math.PI / 2]}>
               <planeGeometry args={[width * 0.1, 0.2]} />
               <meshBasicMaterial color="#3b82f6" opacity={0.3} transparent />
             </mesh>
          </group>
        </group>
      )}

      {/* 3. MULTIWELL PLATE */}
      {bedType === 'multiwell_plate' && (
        <group>
          {/* Base Plate Body */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <planeGeometry args={[127.89, 85.6]} />
            <meshStandardMaterial color="#f8fafc" transparent opacity={0.2} />
          </mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(127.89, 85.6)]} />
            <lineBasicMaterial color="#3b82f6" opacity={0.5} transparent />
          </lineSegments>

          {/* Procedural Wells Grid */}
          {(() => {
            const format = bed.multiwellFormat?.toString() || '24';
            const spec = MULTIWELL_SPECS[format as keyof typeof MULTIWELL_SPECS] || MULTIWELL_SPECS['24'];
            const wells = [];
            for (let r = 0; r < spec.rows; r++) {
              for (let c = 0; c < spec.cols; c++) {
                const x = (c - (spec.cols - 1) / 2) * spec.pitch;
                const z = (r - (spec.rows - 1) / 2) * spec.pitch;
                wells.push(
                  <group key={`${r}-${c}`} position={[x, 0.05, z]}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                      <circleGeometry args={[spec.dia / 2, 32]} />
                      <meshStandardMaterial color="#e2e8f0" transparent opacity={0.5} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                      <ringGeometry args={[(spec.dia / 2) - 0.2, spec.dia / 2, 32]} />
                      <meshBasicMaterial color="#3b82f6" opacity={0.6} transparent />
                    </mesh>
                    {/* Well Label */}
                    <group position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                      <Text fontSize={2} color="#94a3b8" opacity={0.5} transparent>
                        {String.fromCharCode(65 + r)}{c + 1}
                      </Text>
                    </group>
                  </group>
                );
              }
            }
            return wells;
          })()}
        </group>
      )}

      {/* Dimensions Text labels */}
      <group position={[0, 0.1, depth / 2 + 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <Text fontSize={3} color="#64748b" anchorX="center" anchorY="middle">
          {width.toFixed(1)}mm
        </Text>
      </group>
      <group position={[width / 2 + 5, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <Text fontSize={3} color="#64748b" anchorX="center" anchorY="middle">
          {depth.toFixed(1)}mm
        </Text>
      </group>
    </group>
  );
};
