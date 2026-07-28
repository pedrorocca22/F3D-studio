import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ModelData, GlobalSettings, ZZone } from '../../../types';
import { clippingPlane as globalClippingPlane } from '../constants';

interface PoreInjectionOverlayProps {
  poreInjection?: GlobalSettings['poreInjection'];
  models: ModelData[];
  globalSettings: GlobalSettings;
  zZones: ZZone[];
  detectedPores?: Array<{
    x: number; y: number; z?: number; modelId?: string; layer: number;
    zStartMm?: number; zEndMm?: number; bottomSolidTopMm?: number;
    cellWidthMm?: number; cellDepthMm?: number;
    freeWidthMm?: number; freeDepthMm?: number; layerHeightMm?: number;
    maxVolumeUl?: number; requestedVolumeUl?: number; occupancyPercent?: number;
  }>;
  bottomSolidTopMm?: number;
  bedCenter?: { x: number; y: number };
  nozzleDiameterMm?: number;
  isClipping?: boolean;
  currentHeight?: number | null;
}

const MIN_VISIBLE_FOOTPRINT_SCALE = 0.06;
const MAX_OVERFLOW_FOOTPRINT_SCALE = 2.5;
const SAFE_DEPOSIT_COLOR = new THREE.Color('#22d3ee');
const OVERFLOW_DEPOSIT_COLOR = new THREE.Color('#fb7185');

export const PoreInjectionOverlay: React.FC<PoreInjectionOverlayProps> = ({
  poreInjection,
  models,
  globalSettings,
  zZones,
  detectedPores,
  bottomSolidTopMm,
  bedCenter,
  nozzleDiameterMm,
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
    const nozzle = Number(nozzleDiameterMm ?? globalSettings.nozzleDiameter ?? 0.4);
    const infill = Number(globalSettings.infill ?? 15);
    const f = Math.max(0.01, Math.min(1, infill / 100));
    const layerHeightMm = Number(globalSettings.layerHeight || 200) / 1000;
    const lineSpacingMm = (2 * nozzle) / f;
    const fallbackFreeCellMm = Math.max(0.08, lineSpacingMm - nozzle);
    const displayHeight = Math.max(0.045, layerHeightMm * 0.34);

    return { bedX, bedY, layerHeightMm, displayHeight, fallbackFreeCellMm };
  }, [detectedPores, bedCenter, globalSettings, poreInjection, zZones, nozzleDiameterMm]);

  // 3. UPDATE INSTANCED MESH MATRICES
  useEffect(() => {
    if (!instancedMeshRef.current || !detectedPores || !poreParams) return;

    const { bedX, bedY, layerHeightMm, displayHeight, fallbackFreeCellMm } = poreParams;
    const dummy = new THREE.Object3D();

    detectedPores.forEach((p, i) => {
      const poreZ = p.z !== undefined ? Number(p.z) : (Number(p.layer) * layerHeightMm);
      const physicalLayerHeight = Math.max(0.001, Number(p.layerHeightMm ?? layerHeightMm));
      const freeWidth = Math.max(0.001, Number(p.freeWidthMm ?? fallbackFreeCellMm));
      const freeDepth = Math.max(0.001, Number(p.freeDepthMm ?? fallbackFreeCellMm));
      const capacityUl = Math.max(0, Number(p.maxVolumeUl ?? (freeWidth * freeDepth * physicalLayerHeight)));
      const requestedUl = Math.max(0, Number(p.requestedVolumeUl ?? poreInjection?.flowRateUlPerCell ?? 0));
      const occupancy = capacityUl > 0
        ? requestedUl / capacityUl
        : Math.max(0, Number(p.occupancyPercent ?? 0) / 100);
      const footprintScale = Math.min(
        MAX_OVERFLOW_FOOTPRINT_SCALE,
        Math.max(requestedUl > 0 ? MIN_VISIBLE_FOOTPRINT_SCALE : 0.001, Math.sqrt(occupancy)),
      );
      const prismWidth = freeWidth * footprintScale;
      const prismDepth = freeDepth * footprintScale;
      const centerZ = poreZ + displayHeight / 2;

      // G-code X,Y -> Three.js X,Z. G-code Z -> Three.js Y.
      dummy.position.set(Number(p.x) - bedX, centerZ, Number(p.y) - bedY);
      dummy.scale.set(prismWidth, displayHeight, prismDepth);
      dummy.updateMatrix();
      instancedMeshRef.current!.setMatrixAt(i, dummy.matrix);
      instancedMeshRef.current!.setColorAt(
        i,
        occupancy > 1 ? OVERFLOW_DEPOSIT_COLOR : SAFE_DEPOSIT_COLOR,
      );
    });

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (instancedMeshRef.current.instanceColor) {
      instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
    instancedMeshRef.current.count = detectedPores.length;
  }, [detectedPores, poreParams, poreInjection?.flowRateUlPerCell]);

  // 4. CONFIGURATION GUIDE (Standard Mesh as they are few)
  const zBandData = useMemo(() => {
    const activeZones = zZones.filter(z => z.enabled && z.parameterOverride?.poreInjection?.enabled);
    const overrideZones = zZones.filter(z => z.enabled !== false);

    const bands: any[] = [];
    models.forEach(m => {
      if (!m.size) return;
      const sx = m.size.x * m.transform.scale.x;
      const sy = m.size.y * m.transform.scale.y;
      let segmentsToShow: { zStart: number; zEnd: number; source: string }[] = [];

      if (poreInjection?.enabled) {
        segmentsToShow = [{
          zStart: poreInjection.zStartMm,
          zEnd: poreInjection.zEndMm,
          source: 'global',
        }];
        overrideZones
          .filter(zone => zone.modelScope === 'all' || zone.modelScope === m.id)
          .forEach(zone => {
            segmentsToShow = segmentsToShow.flatMap(segment => {
              if (zone.zEndMm <= segment.zStart || zone.zStartMm >= segment.zEnd) return [segment];
              return [
                ...(zone.zStartMm > segment.zStart ? [{ ...segment, zEnd: zone.zStartMm }] : []),
                ...(zone.zEndMm < segment.zEnd ? [{ ...segment, zStart: zone.zEndMm }] : []),
              ];
            });
          });
      }

      activeZones
        .filter(zone => zone.modelScope === 'all' || zone.modelScope === m.id)
        .forEach(zone => {
          segmentsToShow.push({ zStart: zone.zStartMm, zEnd: zone.zEndMm, source: zone.id });
        });

      segmentsToShow.forEach((seg, idx) => {
        const height = Math.max(0.1, Number(seg.zEnd) - Number(seg.zStart));
        const centerY = Number(seg.zStart) + height / 2;
        bands.push({
          id: `${m.id}-band-${seg.source}-${idx}`,
          pos: [m.transform.position.x, centerY, m.transform.position.z] as [number, number, number],
          size: [sx, height, sy] as [number, number, number]
        });
      });
    });

    return bands;
  }, [detectedPores, poreInjection, models, zZones]);

  const bottomShellBandData = useMemo(() => {
    const firstLayerHeightMm = Number(globalSettings.firstLayerHeight || 300) / 1000;
    const layerHeightMm = Number(globalSettings.layerHeight || 200) / 1000;
    const configuredBottomLayers = Math.max(
      Number(globalSettings.bottomSolidLayers ?? 3),
      ...models.map(model => Number(model.fdmSettings?.bottomSolidLayers ?? 0)),
    );
    const top = Number(bottomSolidTopMm ?? (
      configuredBottomLayers > 0
        ? firstLayerHeightMm + Math.max(0, configuredBottomLayers - 1) * layerHeightMm
        : 0
    ));
    if (!Number.isFinite(top) || top <= 0) return [];
    return models.filter(model => model.size).map(model => ({
      id: `${model.id}-bottom-shell`,
      pos: [model.transform.position.x, top / 2, model.transform.position.z] as [number, number, number],
      size: [
        model.size!.x * model.transform.scale.x,
        top,
        model.size!.y * model.transform.scale.y,
      ] as [number, number, number],
    }));
  }, [bottomSolidTopMm, globalSettings, models]);

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
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#075985"
            emissiveIntensity={0.35}
            transparent
            opacity={0.82}
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

      {/* Bottom-shell exclusion envelope: deposits must stay above this band. */}
      {bottomShellBandData.map((band: any) => (
        <mesh key={band.id} position={band.pos}>
          <boxGeometry args={band.size} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.08} wireframe clippingPlanes={activePlanes} />
        </mesh>
      ))}
    </group>
  );
};
