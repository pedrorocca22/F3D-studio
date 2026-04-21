import React, { useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { useLoader, useFrame } from '@react-three/fiber';
import { useCursor, TransformControls } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { TransformData, AdvancedSliceSettings, GlobalSettings } from '../../../types';
import { MULTIWELL_SPECS } from '../../../constants/wellplate';
import { SEGMENT_COLORS, BUILD_VOLUME, clippingPlane } from '../constants';

export type ObjectTool = 'translate' | 'rotate' | 'scale' | 'orient' | 'modify';
export type ViewMode = 'solid' | 'transparent';

export interface ViewportModelProps {
  id: string;
  name: string;
  url: string;
  objectTool: ObjectTool;
  viewMode: ViewMode;
  isSelected: boolean;
  isVisible: boolean;
  isAdvancedMode: boolean;
  advancedSettings: AdvancedSliceSettings;
  setIsSelected: (val: boolean) => void;
  transformData: TransformData;
  onTransformChange: (data: TransformData) => void;
  onUpdateSize: (size: { x: number, y: number, z: number }) => void;
  adhesionOffset: number;
  isClipping: boolean;
  clippingHeight: number;
  toolheadColor?: string;
  isDimmed?: boolean;
  globalSettings: GlobalSettings;
  wellAssignment?: { format: 6 | 12 | 24 | 48; wellId: string };
}

export const ViewportModel: React.FC<ViewportModelProps> = (props) => {
  const {
    id,
    name,
    url,
    objectTool,
    viewMode,
    isSelected,
    isVisible,
    isAdvancedMode,
    advancedSettings,
    setIsSelected,
    transformData,
    onTransformChange,
    onUpdateSize,
    adhesionOffset,
    isClipping,
    clippingHeight,
    toolheadColor,
    isDimmed,
    globalSettings,
    wellAssignment
  } = props;

  const result = useLoader(STLLoader, url);

  const geometry = useMemo(() => {
    let geo = (result as THREE.BufferGeometry).clone();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    if (geo.boundingBox) {
      const center = new THREE.Vector3();
      geo.boundingBox.getCenter(center);
      geo.translate(-center.x, -center.y, -center.z);
    }
    geo.computeBoundingBox();
    return geo;
  }, [result]);

  const meshRef = useRef<THREE.Mesh>(null!);
  const posGroupRef = useRef<THREE.Group>(null!);
  const scaleGroupRef = useRef<THREE.Group>(null!);
  const rotGroupRef = useRef<THREE.Group>(null!);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const [hovered, setHover] = useState(false);
  const transformControlsRef = useRef<any>(null);
  const [isOutOfBounds, setIsOutOfBounds] = useState(false);

  const onUpdateSizeRef = useRef(onUpdateSize);
  useLayoutEffect(() => { onUpdateSizeRef.current = onUpdateSize; });

  useCursor(objectTool === 'orient' && hovered && isVisible, 'pointer', 'auto');

  const onBeforeCompile = useMemo(() => {
    return (shader: any) => {
      shader.uniforms.uSegmentCount = { value: 0 };
      shader.uniforms.uLimits = { value: new Float32Array(32) };
      shader.uniforms.uIsAdvanced = { value: 0 };
      shader.uniforms.uColors = { value: new Float32Array(32 * 3) };
      shader.uniforms.uAdhesionOffset = { value: 0 };

      if (materialRef.current) {
        materialRef.current.userData.shader = shader;
      }

      shader.vertexShader = `
          varying vec3 vWorldPosition;
          ${shader.vertexShader}
        `.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
           vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

      shader.fragmentShader = `
          uniform int uSegmentCount;
          uniform float uLimits[32]; 
          uniform vec3 uColors[16]; 
          uniform float uIsAdvanced;
          uniform float uAdhesionOffset;
          varying vec3 vWorldPosition;
          ${shader.fragmentShader}
        `.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
           
           if (uIsAdvanced > 0.5) {
               if (vWorldPosition.y < uAdhesionOffset) {
                   vec3 adhesionColor = vec3(0.5, 0.5, 0.5); 
                   gl_FragColor = vec4(mix(gl_FragColor.rgb, adhesionColor, 0.8), gl_FragColor.a);
               } else {
                   int activeSegmentIndex = -1;
                   for (int i = 0; i < 16; i++) {
                       if (i >= uSegmentCount) break;
                       float b = uLimits[i * 2];
                       float t = uLimits[i * 2 + 1];
                       if (vWorldPosition.y >= b && vWorldPosition.y <= t) {
                           activeSegmentIndex = i;
                           break;
                       }
                   }
                   if (activeSegmentIndex != -1) {
                       vec3 segColor = uColors[activeSegmentIndex];
                       gl_FragColor = mix(gl_FragColor, vec4(segColor, 1.0), 0.6);
                   }
               }
           }
          `
      );
    };
  }, []);

  useFrame(() => {
    if (materialRef.current && materialRef.current.userData.shader) {
      const shader = materialRef.current.userData.shader;
      shader.uniforms.uIsAdvanced.value = isAdvancedMode ? 1 : 0;
      shader.uniforms.uAdhesionOffset.value = adhesionOffset;
      const segments = advancedSettings.segments;
      shader.uniforms.uSegmentCount.value = segments.length;
      const limits = new Float32Array(32);
      const colors = new Float32Array(16 * 3);
      segments.forEach((seg, i) => {
        const prevTop = i > 0 ? segments[i - 1].topLimit : adhesionOffset;
        limits[i * 2] = prevTop;
        limits[i * 2 + 1] = seg.topLimit;
        const hex = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
        const c = new THREE.Color(hex);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      });
      shader.uniforms.uLimits.value = limits;
      shader.uniforms.uColors.value = colors;
    }
  });

  const checkBounds = useCallback(() => {
    if (meshRef.current) {
      const box = new THREE.Box3().setFromObject(meshRef.current);
      const tolerance = 0.05; 
      const halfWidth = BUILD_VOLUME.width / 2;
      const halfDepth = BUILD_VOLUME.depth / 2;
      const isOut =
        box.min.x < (-halfWidth - tolerance) ||
        box.max.x > (halfWidth + tolerance) ||
        box.min.z < (-halfDepth - tolerance) ||
        box.max.z > (halfDepth + tolerance) ||
        box.min.y < (-tolerance) ||
        box.max.y > (BUILD_VOLUME.height + tolerance);
      setIsOutOfBounds(isOut);
    }
  }, []);

  const getBottomOffset = useCallback(() => {
    if (!geometry.boundingBox) return 0;
    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(transformData.rotation.x),
      THREE.MathUtils.degToRad(transformData.rotation.z), 
      THREE.MathUtils.degToRad(transformData.rotation.y)  
    ));
    const scaleMatrix = new THREE.Matrix4().makeScale(
      transformData.scale.x,
      transformData.scale.z,
      transformData.scale.y
    );
    const worldMatrix = new THREE.Matrix4().multiplyMatrices(scaleMatrix, rotMatrix);
    const box = geometry.boundingBox.clone().applyMatrix4(worldMatrix);
    return box.min.y;
  }, [geometry, transformData.rotation, transformData.scale]);

  // 1. Sync All Transforms (Position, Rotation, Scale)

  useEffect(() => {
    if (meshRef.current && posGroupRef.current && scaleGroupRef.current && rotGroupRef.current) {
      const isDragging = transformControlsRef.current?.dragging;
      if (!isDragging) {
        // Hierarchy: PosGroup (Universal Position + Offset) -> ScaleGroup (Universal Scale) -> RotGroup (Local Rotation) -> Mesh

        // A. Base Position (taking well assignment into account)
        let basePosX = transformData.position.x;
        let basePosY = transformData.position.y;
        const basePosZ = transformData.position.z;

        const bed = globalSettings.printBed || { type: 'glass_bed', dimensions: { width: 100, height: 100 } };
        if (bed.type === 'multiwell_plate' && wellAssignment) {
          const { format, wellId } = wellAssignment;
          const spec = MULTIWELL_SPECS[format.toString()] || MULTIWELL_SPECS['24'];
          const row = wellId.charCodeAt(0) - 65; 
          const col = parseInt(wellId.substring(1)) - 1; 
          basePosX = (col - (spec.cols - 1) / 2) * spec.pitch;
          basePosY = (row - (spec.rows - 1) / 2) * spec.pitch;
        }

        // B. Apply Grounding Offset
        const offset = getBottomOffset();
        
        // C. Set PosGroup (Three Y is Data Z)
        posGroupRef.current.position.set(basePosX, basePosZ - offset, basePosY);

        // D. Set ScaleGroup
        scaleGroupRef.current.scale.set(transformData.scale.x, transformData.scale.z, transformData.scale.y);

        // E. Set RotGroup
        rotGroupRef.current.rotation.set(
          THREE.MathUtils.degToRad(transformData.rotation.x),
          THREE.MathUtils.degToRad(transformData.rotation.z), 
          THREE.MathUtils.degToRad(transformData.rotation.y)  
        );
      }

      posGroupRef.current.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(posGroupRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);
      onUpdateSizeRef.current({
        x: size.x,
        y: size.z, 
        z: size.y  
      });
      checkBounds();
    }
  }, [transformData, wellAssignment, globalSettings.printBed?.type, geometry, getBottomOffset, checkBounds]);

  const handleClick = (e: any) => {
    if (!isVisible) return;
    e.stopPropagation();
    if (!isSelected) setIsSelected(true);
    if (objectTool === 'orient' && e.face && meshRef.current) {
      const normal = e.face.normal.clone();
      normal.applyQuaternion(meshRef.current.quaternion).normalize();
      const targetNormal = new THREE.Vector3(0, -1, 0);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(normal, targetNormal);
      const newQuat = alignQuat.multiply(meshRef.current.quaternion.clone());
      const newEuler = new THREE.Euler().setFromQuaternion(newQuat);
      onTransformChange({
        ...transformData,
        rotation: {
          x: Math.round(THREE.MathUtils.radToDeg(newEuler.x)),
          y: Math.round(THREE.MathUtils.radToDeg(newEuler.z)), 
          z: Math.round(THREE.MathUtils.radToDeg(newEuler.y)), 
        }
      });
    }
  };

  const handleTransformComplete = () => {
    if (posGroupRef.current && scaleGroupRef.current && rotGroupRef.current) {
      const offset = getBottomOffset();
      onTransformChange({
        ...transformData,
        position: {
          x: posGroupRef.current.position.x,
          y: posGroupRef.current.position.z, 
          z: posGroupRef.current.position.y + offset 
        },
        rotation: {
          x: Math.round(THREE.MathUtils.radToDeg(rotGroupRef.current.rotation.x)),
          y: Math.round(THREE.MathUtils.radToDeg(rotGroupRef.current.rotation.z)), 
          z: Math.round(THREE.MathUtils.radToDeg(rotGroupRef.current.rotation.y)), 
        },
        scale: {
          x: scaleGroupRef.current.scale.x,
          y: scaleGroupRef.current.scale.z, 
          z: scaleGroupRef.current.scale.y  
        }
      });
    }
    checkBounds();
  };

  return (
    <>
      <group ref={posGroupRef}>
        <group ref={scaleGroupRef}>
          <group ref={rotGroupRef}>
            <mesh
              ref={meshRef}
              visible={isVisible}
              geometry={geometry}
              onClick={handleClick}
              onPointerOver={() => isVisible && setHover(true)}
              onPointerOut={() => setHover(false)}
              castShadow
            >
              <meshPhysicalMaterial
                ref={materialRef}
                onBeforeCompile={onBeforeCompile}
                color={isOutOfBounds ? "#ef4444" : (isSelected ? "#f67104" : (isDimmed ? "#94a3b8" : toolheadColor))}
                roughness={isDimmed ? 1.0 : 0.4}
                reflectivity={isDimmed ? 0.0 : 0.5}
                clearcoat={isDimmed ? 0.0 : 1.0}
                metalness={0.1}
                transparent={viewMode === 'transparent'}
                opacity={viewMode === 'transparent' ? 0.4 : 1.0}
                side={THREE.DoubleSide}
                clippingPlanes={isClipping ? [clippingPlane] : []}
                clipShadows
                stencilWrite={true}
                stencilRef={0}
                stencilFunc={THREE.AlwaysStencilFunc}
                stencilFail={THREE.KeepStencilOp}
                stencilZFail={THREE.KeepStencilOp}
                stencilZPass={THREE.KeepStencilOp}
              />
            </mesh>

            {isClipping && isVisible && (
              <mesh geometry={geometry}>
                <meshBasicMaterial
                  color="black"
                  side={THREE.BackSide}
                  clippingPlanes={[clippingPlane]}
                  stencilWrite={true}
                  stencilRef={0}
                  stencilFunc={THREE.AlwaysStencilFunc}
                  stencilFail={THREE.IncrementWrapStencilOp}
                  stencilZFail={THREE.IncrementWrapStencilOp}
                  stencilZPass={THREE.IncrementWrapStencilOp}
                  colorWrite={false}
                  depthWrite={false}
                />
              </mesh>
            )}

            {isClipping && isVisible && (
              <mesh geometry={geometry}>
                <meshBasicMaterial
                  color="black"
                  side={THREE.FrontSide}
                  clippingPlanes={[clippingPlane]}
                  stencilWrite={true}
                  stencilRef={0}
                  stencilFunc={THREE.AlwaysStencilFunc}
                  stencilFail={THREE.DecrementWrapStencilOp}
                  stencilZFail={THREE.DecrementWrapStencilOp}
                  stencilZPass={THREE.DecrementWrapStencilOp}
                  colorWrite={false}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        </group>
      </group>

      {isClipping && isVisible && (
        <mesh
          position={[0, clippingHeight, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1} 
        >
          <planeGeometry args={[BUILD_VOLUME.width, BUILD_VOLUME.depth]} />
          <meshBasicMaterial
            color={isSelected ? "#f67104" : "#94a3b8"}
            side={THREE.DoubleSide}
            stencilWrite={true}
            stencilRef={0}
            stencilFunc={THREE.NotEqualStencilFunc}
          />
        </mesh>
      )}

      {isSelected && objectTool !== 'orient' && isVisible && (
        <TransformControls
          ref={transformControlsRef}
          object={
            objectTool === 'scale' ? scaleGroupRef.current :
              objectTool === 'rotate' ? rotGroupRef.current :
                posGroupRef.current
          }
          mode={objectTool === 'rotate' ? 'rotate' : objectTool === 'scale' ? 'scale' : 'translate'}
          onMouseUp={handleTransformComplete}
          onChange={checkBounds}
          space="world"
        />
      )}
    </>
  );
};
