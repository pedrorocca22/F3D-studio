import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ZZone, ModelData } from '../../../types';

interface UVProcessPlanesProps {
  zZones: ZZone[];
  models: ModelData[];
  currentHeight: number | null;
  isVisible: boolean;
}

export const UVProcessPlanes: React.FC<UVProcessPlanesProps> = ({ zZones, models, currentHeight, isVisible }) => {
  const uvZones = useMemo(() => {
    if (!isVisible || currentHeight === null) return [];
    return zZones.filter(z => z.enabled && z.processEvent && z.zStartMm <= currentHeight);
  }, [zZones, isVisible, currentHeight]);

  // Calculate bounding box for each zone based on its scope
  const zoneBounds = useMemo(() => {
    return uvZones.map(zone => {
      const box = new THREE.Box3();
      let hasModels = false;
      
      models.forEach(m => {
        // Only include if in scope
        if (zone.modelScope === 'all' || zone.modelScope === m.id) {
           if (m.size) {
             const sx = m.transform.scale.x ?? 1;
             const sy = m.transform.scale.y ?? 1;
             const sz = m.transform.scale.z ?? 1;

             const mBox = new THREE.Box3().setFromCenterAndSize(
               new THREE.Vector3(m.transform.position.x, m.transform.position.z, m.transform.position.y),
               new THREE.Vector3(m.size.x * sx, m.size.z * sz, m.size.y * sy)
             );
             box.union(mBox);
             hasModels = true;
           }
        }
      });
      
      if (!hasModels) return null;
      
      // Add 1mm offset
      box.expandByScalar(1.0);
      return box;
    });
  }, [uvZones, models]);

  if (uvZones.length === 0) return null;

  return (
    <group>
      {uvZones.map((zone, idx) => {
        const bounds = zoneBounds[idx];
        if (!bounds) return null;
        
        const size = new THREE.Vector3();
        bounds.getSize(size);
        const center = new THREE.Vector3();
        bounds.getCenter(center);
        
        const isPerLayer = zone.processEvent?.trigger === 'after_layer';
        
        // Dynamic height based on current slider position
        const zoneTop = Math.min(zone.zEndMm, currentHeight!);
        const height = Math.max(zoneTop - zone.zStartMm, 0.01);
        const zCenter = zone.zStartMm + height / 2;

        return (
          <group key={zone.id}>
            {isPerLayer ? (
              <mesh position={[center.x, zCenter, center.z]}>
                <boxGeometry args={[size.x, height, size.z]} />
                <meshBasicMaterial 
                  color="#a855f7" 
                  transparent 
                  opacity={0.12} 
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
                <lineSegments>
                  <edgesGeometry args={[new THREE.BoxGeometry(size.x, height, size.z)]} />
                  <lineBasicMaterial color="#a855f7" opacity={0.4} transparent />
                </lineSegments>
              </mesh>
            ) : (
              /* If it's a single trigger (after_zone), only show if we reached that height */
              currentHeight! >= zone.zEndMm && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, zone.zEndMm, center.z]}>
                  <planeGeometry args={[size.x, size.z]} />
                  <meshBasicMaterial 
                    color="#a855f7" 
                    transparent 
                    opacity={0.3} 
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                  <lineSegments>
                    <edgesGeometry args={[new THREE.PlaneGeometry(size.x, size.z)]} />
                    <lineBasicMaterial color="#a855f7" opacity={0.7} transparent />
                  </lineSegments>
                </mesh>
              )
            )}
          </group>
        );
      })}
    </group>
  );
};
