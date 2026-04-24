import React, { useEffect, useMemo, useRef } from 'react';
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
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);

  // 1. LOCAL CLIPPING PLANE FOR G-CODE LAYERS
  const gcodeClipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000), []);

  useEffect(() => {
    if (currentHeight !== undefined && currentHeight !== null) {
      gcodeClipPlane.constant = currentHeight;
    } else {
      gcodeClipPlane.constant = 1000;
    }
  }, [currentHeight, gcodeClipPlane]);

  // 2. OPTIMIZED PARAMETERS FOR INSTANCING
  const poreParams = useMemo(() => {
    if (!detectedPores || detectedPores.length === 0) return null;

    const bedX = bedCenter?.x || 0;
    const bedY = bedCenter?.y || 0;
    const nozzle = Number(globalSettings.nozzleDiameter ?? 0.4);
    const infill = Number(globalSettings.infill ?? 15);
    const f = Math.max(0.01, Math.min(1, infill / 100));
    const layerHeightMm = Number(globalSettings.layerHeight || 200) / 1000;
    
    const displayHeight = Math.max(0.6, layerHeightMm * 2);
    const radius = Math.max(MIN_PORE_RADIUS_MM, Math.min(MAX_PORE_RADIUS_MM, (nozzle * 1.5) * (1 - f)));

    return { bedX, bedY, layerHeightMm, displayHeight, radius };
  }, [detectedPores, bedCenter, globalSettings]);

  // 3. UPDATE INSTANCED MESH MATRICES
  useEffect(() => {
    if (!instancedMeshRef.current || !detectedPores || !poreParams) return;

    const { bedX, bedY, layerHeightMm } = poreParams;
    const dummy = new THREE.Object3D();

    detectedPores.forEach((p, i) => {
      const poreZ = p.z !== undefined ? Number(p.z) : (Number(p.layer) * layerHeightMm);
      // G-code X,Y -> Three.js X,Z. G-code Z -> Three.js Y.
      dummy.position.set(Number(p.x) - bedX, poreZ, Number(p.y) - bedY);
      dummy.updateMatrix();
      instancedMeshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    instancedMeshRef.current.count = detectedPores.length;
  }, [detectedPores, poreParams]);

  // 4. CONFIGURATION GUIDE (Standard Mesh as they are few)
  const zBandData = useMemo(() => {
    const segmentsToShow: { zStart: number; zEnd: number }[] = [];
    const activeZones = zZones.filter(z => z.enabled && z.parameterOverride?.poreInjection?.enabled);
    
    if (activeZones.length > 0) {
      activeZones.forEach(z => {
        segmentsToShow.push({ zStart: z.zStartMm, zEnd: z.zEndMm });
      });
    } else if (poreInjection?.enabled) {
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
  }, [detectedPores, poreInjection, models, zZones]);

  // Master visibility: Show if we have real results OR if any zone has it enabled
  const anyZoneEnabled = useMemo(() => zZones.some(z => z.enabled && z.parameterOverride?.poreInjection?.enabled), [zZones]);
  const isVisible = (detectedPores && detectedPores.length > 0) || anyZoneEnabled || poreInjection?.enabled;

  if (!isVisible) return null;

  const activePlanes = [gcodeClipPlane];
  if (isClipping) activePlanes.push(globalClippingPlane);

  return (
    <group name="pore-injection-overlay">
      {/* REAL RESULTS USING INSTANCING (High Performance) */}
      {detectedPores && detectedPores.length > 0 && poreParams && (
        <instancedMesh 
          ref={instancedMeshRef} 
          args={[undefined, undefined, detectedPores.length]}
          frustumCulled={false}
        >
          <cylinderGeometry args={[poreParams.radius, poreParams.radius, poreParams.displayHeight, 8]} />
          <meshStandardMaterial
            color="#39d5e8"
            emissive="#18c1d6"
            emissiveIntensity={0.8}
            transparent
            opacity={0.8}
            clippingPlanes={activePlanes}
            clipShadows
          />
        </instancedMesh>
      )}

      {/* CONFIGURATION GUIDE (Standard Meshes) */}
      {zBandData?.map((band: any) => (
        <mesh key={band.id} position={band.pos}>
          <boxGeometry args={band.size} />
          <meshStandardMaterial
            color="#39d5e8"
            transparent
            opacity={0.15}
            depthWrite={false}
            clippingPlanes={activePlanes}
          />
        </mesh>
      ))}
    </group>
  );
};