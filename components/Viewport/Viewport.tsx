import React, { Suspense, useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { Canvas, useLoader, useThree, ThreeEvent, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, useCursor, TransformControls, Environment, Grid, Text } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { SceneObject, GlobalSettings, ModelData, TransformData, AdvancedSliceSettings, ZZone, ToolheadConfig, Modifier } from '../../types';
import { MULTIWELL_SPECS } from '../../constants/wellplate';
import { ModifiersPanel } from './ModifiersPanel';
import { ThreeElements } from '@react-three/fiber';
import { useGCodeLoader, GCodeScene, ColorMode, LINE_TYPE_COLOR, LINE_TYPE_LABELS, TOOLHEAD_COLOR } from '../GCodePreview/GCodePreview';

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements extends ThreeElements {}
    }
  }
}

interface ViewportProps {
  models: ModelData[];
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
  onTransformChange: (id: string, data: TransformData) => void;
  onUpdateModelSize: (id: string, size: { x: number, y: number, z: number }) => void;
  onUpdateAdvancedSettings: (data: AdvancedSliceSettings) => void;
  onUpdateModifiers?: (modifiers: Modifier[]) => void;
  onCloneModel: (id: string) => void;
  onArrayModels: (spacing: number) => void;
  onDeleteModel: (id: string) => void;

  isAdvancedSliceMode?: boolean;
  globalSettings: GlobalSettings;
  zZones?: ZZone[];
  // GCode integration
  gcodeJob?: { jobId: string; gcodeUrl: string; nozzleDiameter?: number } | null;
  onExitGCode?: () => void;
}

// --- CLIPPING PLANE LOGIC ---
const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

const BUILD_VOLUME = {
  width: 100,    // X: bed width (mm)
  depth: 100,    // Y: bed depth (mm)  [Three.js Z axis]
  height: 100    // Z: max print height (mm) [Three.js Y axis]
};

// Distinct colors for segments
const SEGMENT_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#f97316', // Orange
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#eab308', // Yellow
  '#06b6d4', // Cyan
];

const getSegmentColor = (index: number) => SEGMENT_COLORS[index % SEGMENT_COLORS.length];

// Toolhead colors for 3D preview — paleta vibrante diferenciada
export const TOOLHEAD_COLORS: Record<string, string> = {
  fdm:     '#2563eb', // blue-600  — FDM hot-end
  syringe: '#059669', // emerald-600 — hydrogel syringe
  uv:      '#7c3aed', // violet-600 — UV crosslinker
  none:    '#94a3b8', // slate-400  — unassigned
};

type CameraMode = 'orbit' | 'pan';
type ObjectTool = 'translate' | 'rotate' | 'scale' | 'orient' | 'modify';
type ViewMode = 'solid' | 'transparent';

// --- Model Info Panel Component ---
const ModelInfoPanel: React.FC<{ model: ModelData; adhesionOffset: number }> = ({ model, adhesionOffset }) => {
  const isAdv = !!model.advancedSettings.enabled;

  return (
    <div className="w-full bg-white border border-outline-variant/30 p-2 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2 pb-1.5 border-b border-outline-variant/10">
        <div className="w-4 h-4 bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
          <Icon name="inventory_2" className="text-[10px]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-[10px] uppercase tracking-widest truncate text-slate-700 leading-none" title={model.name}>{model.name}</h3>
          <p className="text-[8px] text-slate-400 font-mono mt-0.5">OBJ_REF: {model.id.slice(0, 8).toUpperCase()}</p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-3 gap-px bg-outline-variant/10 border border-outline-variant/5">
        <div className="bg-white p-1.5">
          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-tight mb-0.5">Bound_X</span>
          <span className="block text-[10px] font-bold text-slate-700 font-mono">{model.size?.x?.toFixed(1) || '-'}</span>
        </div>
        <div className="bg-white p-1.5">
          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-tight mb-0.5">Bound_Y</span>
          <span className="block text-[10px] font-bold text-slate-700 font-mono">{model.size?.y?.toFixed(1) || '-'}</span>
        </div>
        <div className="bg-white p-1.5">
          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-tight mb-0.5">Bound_Z</span>
          <span className="block text-[10px] font-bold text-slate-700 font-mono">{model.size?.z?.toFixed(1) || '-'}</span>
        </div>
      </div>

      {/* Advanced Slice Badge */}
      {isAdv ? (
        <div className="bg-red-50 border border-red-100 p-1">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-red-600"></div>
            <span className="text-[8px] font-black text-red-600 uppercase tracking-widest">MULTI_STAGE_ACTIVE</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// MULTIWELL_SPECS imported from ../../constants/wellplate (BUG-04 fix — no longer duplicated here)

const BuildPlate = ({ globalSettings }: { globalSettings: GlobalSettings }) => {
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
      {/* Grid helper - sized to BUILD_VOLUME or bed? Usually builders like to see the machine limits */}
      <Grid 
        infiniteGrid 
        fadeDistance={400} 
        fadeStrength={5} 
        cellSize={10} 
        sectionSize={50} 
        sectionColor="#cbd5e1" 
        sectionThickness={1} 
        cellColor="#e2e8f0" 
        cellThickness={0.5} 
        position={[0, -0.01, 0]} 
      />

      {/* 1. GLASS BED */}
      {bedType === 'glass_bed' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
            <planeGeometry args={[width, depth]} />
            <meshStandardMaterial
              color="#f8fafc"
              transparent
              opacity={0.4}
              roughness={0.1}
              metalness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
          <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(width, depth)]} />
            <lineBasicMaterial color="#3b82f6" linewidth={2} />
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
            <meshBasicMaterial color="#3b82f6" />
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
        <Text fontSize={3} color="#94a3b8" anchorX="center" anchorY="middle">
          {width.toFixed(1)}mm
        </Text>
      </group>
      <group position={[width / 2 + 5, 0.1, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <Text fontSize={3} color="#94a3b8" anchorX="center" anchorY="middle">
          {depth.toFixed(1)}mm
        </Text>
      </group>
    </group>
  );
};

const UVProcessPlanes = ({ zZones, models, currentHeight, isVisible }: { zZones: ZZone[], models: ModelData[], currentHeight: number | null, isVisible: boolean }) => {
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

const SceneControls = ({ cameraMode, zoomTrigger }: { cameraMode: CameraMode; zoomTrigger: number }) => {
  const { camera } = useThree();
  const prevZoomRef = useRef(zoomTrigger);

  useEffect(() => {
    if (prevZoomRef.current !== zoomTrigger) {
      const delta = zoomTrigger - prevZoomRef.current;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      camera.position.addScaledVector(direction, delta * 20);
      prevZoomRef.current = zoomTrigger;
    }
  }, [zoomTrigger, camera]);

  const orbitProps = {
    enableRotate: cameraMode === 'orbit',
    mouseButtons: cameraMode === 'pan'
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  } as any;

  return <OrbitControls makeDefault enableDamping dampingFactor={0.1} {...orbitProps} />;
};

const CameraManager = ({ viewTrigger, focusTarget }: { viewTrigger: { mode: string, t: number }, focusTarget: THREE.Vector3 | null }) => {
  const { camera, controls } = useThree();

  const desiredPos = useRef(new THREE.Vector3(100, 100, 150));
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const isAnimating = useRef(false);

  useEffect(() => {
    if (!controls) return;
    const { mode } = viewTrigger;
    const distance = 180;

    if (mode === 'iso') {
      desiredPos.current.set(100, 100, 150);
      desiredTarget.current.set(0, 0, 0);
    } else if (mode === 'top') {
      desiredPos.current.set(0, distance, 0.01);
      desiredTarget.current.set(0, 0, 0);
    } else if (mode === 'front') {
      desiredPos.current.set(0, 0, distance);
      desiredTarget.current.set(0, 0, 0);
    } else if (mode === 'right') {
      desiredPos.current.set(distance, 0, 0);
      desiredTarget.current.set(0, 0, 0);
    }

    isAnimating.current = true;
  }, [viewTrigger, controls]);


  useFrame((state, delta) => {
    if (!isAnimating.current || !controls) return;

    const orb = controls as any;
    const speed = 4 * delta;

    camera.position.lerp(desiredPos.current, speed);
    orb.target.lerp(desiredTarget.current, speed);
    orb.update();

    if (
      camera.position.distanceTo(desiredPos.current) < 0.1 &&
      orb.target.distanceTo(desiredTarget.current) < 0.1
    ) {
      isAnimating.current = false;
    }
  });

  return null;
};



interface ModelProps {
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
}

const Model: React.FC<ModelProps & { globalSettings: GlobalSettings; wellAssignment?: { format: 6 | 12 | 24 | 48; wellId: string } }> = (props) => {
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
    isDimmed
  } = props;
  const globalSettings = props.globalSettings;
  const wellAssignment = props.wellAssignment;

  const result = useLoader(STLLoader, url);

  const geometry = useMemo(() => {
    let geo = (result as THREE.BufferGeometry).clone();

    // Geometry Smoothing Logic Removed to prevent runtime errors and artifacts
    // Default STLLoader behavior is used (flat shading usually)
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

  // Use a ref for onUpdateSize to avoid effect dependency cycle
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
          uniform float uLimits[32]; // [bottom, top, bottom, top...]
          uniform vec3 uColors[16]; // Max 16 segments
          uniform float uIsAdvanced;
          uniform float uAdhesionOffset;
          varying vec3 vWorldPosition;
          ${shader.fragmentShader}
        `.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
           
           if (uIsAdvanced > 0.5) {
               // Adhesion Area Logic
               if (vWorldPosition.y < uAdhesionOffset) {
                   // Render Adhesion area as a distinct band (e.g., striped or gray)
                   vec3 adhesionColor = vec3(0.5, 0.5, 0.5); // Gray
                   gl_FragColor = vec4(mix(gl_FragColor.rgb, adhesionColor, 0.8), gl_FragColor.a);
               } else {
                   // Advanced Segments Logic
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
      const colors = new Float32Array(16 * 3); // 16 segments * 3 (rgb)

      segments.forEach((seg, i) => {
        // Calculate bottom limit: for first segment it is adhesionOffset, for others it's previous segment's top
        const prevTop = i > 0 ? segments[i - 1].topLimit : adhesionOffset;
        limits[i * 2] = prevTop;
        limits[i * 2 + 1] = seg.topLimit;

        // Convert hex to rgb
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

  // Reusable check bounds function
  const checkBounds = useCallback(() => {
    if (meshRef.current) {
      const box = new THREE.Box3().setFromObject(meshRef.current);
      const tolerance = 0.05; // 50 micron tolerance
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

  useEffect(() => {
    if (meshRef.current && posGroupRef.current && scaleGroupRef.current && rotGroupRef.current) {
      const isDragging = transformControlsRef.current?.dragging;
      if (!isDragging) {
       // Hierarchy: PosGroup (Universal Position) -> ScaleGroup (Universal Scale) -> RotGroup (Local Rotation) -> Mesh

       const bed = globalSettings.printBed || { type: 'glass_bed', dimensions: { width: 100, height: 100 } };
       const bedType = bed.type;

       // Check for well assignment in multiwell plate
       let finalPosition = { ...transformData.position };
       if (bedType === 'multiwell_plate' && wellAssignment) {
         const { format, wellId } = wellAssignment;
         const spec = MULTIWELL_SPECS[format.toString()] || MULTIWELL_SPECS['24'];
         
         // Parse wellId (e.g., "A1", "B3") to row and column indices
         const row = wellId.charCodeAt(0) - 65; // A=0, B=1, etc.
         const col = parseInt(wellId.substring(1)) - 1; // Convert to 0-based index
         
         // Calculate well center position - same formula as BuildPlate renders
         const wellX = (col - (spec.cols - 1) / 2) * spec.pitch;
         const wellDepth = (row - (spec.rows - 1) / 2) * spec.pitch;
         
         // Original height (Z in data → Y in Three)
         const originalHeight = transformData.position.z;
         
         // Apply well position: X = column, Y(depth) = wellDepth, Z(height) = originalHeight
         finalPosition.x = wellX;
         finalPosition.y = wellDepth;
         finalPosition.z = originalHeight;
       }
        posGroupRef.current.position.set(finalPosition.x, finalPosition.z, finalPosition.y);

        // 2. Scale Group (Universal Scaling - Bed Aligned)
        scaleGroupRef.current.scale.set(transformData.scale.x, transformData.scale.z, transformData.scale.y);

        // 3. Rotation Group (Local Rotation)
        rotGroupRef.current.rotation.set(
          THREE.MathUtils.degToRad(transformData.rotation.x),
          THREE.MathUtils.degToRad(transformData.rotation.z), // Data Z -> Three Y
          THREE.MathUtils.degToRad(transformData.rotation.y)  // Data Y -> Three Z
        );
      }

      // CRITICAL: Force update from the root of our transform hierarchy
      posGroupRef.current.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(posGroupRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Report size: Three Y is Vertical (Z), Three Z is Depth (Y)
      onUpdateSizeRef.current({
        x: size.x,
        y: size.z, // Three Z -> Data Y (Depth)
        z: size.y  // Three Y -> Data Z (Height)
      });

      checkBounds();
    }
  }, [transformData, geometry, checkBounds]);

  const getBottomOffset = useCallback(() => {
    if (!geometry.boundingBox) return 0;
    const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(transformData.rotation.x),
      THREE.MathUtils.degToRad(transformData.rotation.z), // Data Z -> Three Y
      THREE.MathUtils.degToRad(transformData.rotation.y)  // Data Y -> Three Z
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

  useEffect(() => {
    if (posGroupRef.current) {
      const offset = getBottomOffset();
      posGroupRef.current.position.set(
        transformData.position.x,
        transformData.position.z - offset, // Three Y = Data Z + Pivot Offset
        transformData.position.y
      );
    }
  }, [transformData.position, getBottomOffset]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isVisible) return;
    e.stopPropagation();
    if (!isSelected) setIsSelected(true);

    const ev = e as any;
    if (objectTool === 'orient' && ev.face && meshRef.current) {
      const normal = ev.face.normal.clone();
      normal.applyQuaternion(meshRef.current.quaternion).normalize();
      const targetNormal = new THREE.Vector3(0, -1, 0);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(normal, targetNormal);
      const newQuat = alignQuat.multiply(meshRef.current.quaternion.clone());
      const newEuler = new THREE.Euler().setFromQuaternion(newQuat);

      onTransformChange({
        ...transformData,
        rotation: {
          x: Math.round(THREE.MathUtils.radToDeg(newEuler.x)),
          y: Math.round(THREE.MathUtils.radToDeg(newEuler.z)), // Swap Back
          z: Math.round(THREE.MathUtils.radToDeg(newEuler.y)), // Swap Back
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
          y: posGroupRef.current.position.z, // Three Z -> Data Y
          z: posGroupRef.current.position.y + offset // Real Bottom Z = Pivot Y + Offset
        },
        rotation: {
          x: Math.round(THREE.MathUtils.radToDeg(rotGroupRef.current.rotation.x)),
          y: Math.round(THREE.MathUtils.radToDeg(rotGroupRef.current.rotation.z)), // Three Z -> Data Y
          z: Math.round(THREE.MathUtils.radToDeg(rotGroupRef.current.rotation.y)), // Three Y -> Data Z
        },
        scale: {
          x: scaleGroupRef.current.scale.x,
          y: scaleGroupRef.current.scale.z, // Three Scale Z -> Data Scale Y
          z: scaleGroupRef.current.scale.y  // Three Scale Y -> Data Scale Z
        }
      });
    }
    checkBounds();
  };

  const adjustPositionToFloor = useCallback((updateIfChanged = true) => {
    // With the new mapping, grounding just means Z=0
    if (updateIfChanged && Math.abs(transformData.position.z) > 0.001) {
      onTransformChange({
        ...transformData,
        position: { ...transformData.position, z: 0 }
      });
    }
  }, [transformData.position.z, onTransformChange]);

  useEffect(() => {
    const { x, y, z } = transformData.position;
    // Initial grounding check (if almost zero, snap to 0)
    if (Math.abs(z) < 0.001) adjustPositionToFloor();
  }, [transformData.position]);

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
              receiveShadow={false}
            >
              <meshPhysicalMaterial
                ref={materialRef}
                onBeforeCompile={onBeforeCompile}
                color={isOutOfBounds ? "#ef4444" : (isSelected ? "#f67104" : (isDimmed ? "#94a3b8" : toolheadColor))}
                roughness={isDimmed ? 1.0 : 0.4}
                reflectivity={isDimmed ? 0.0 : 0.5}
                clearcoat={isDimmed ? 0.0 : 1.0}
                clearcoatRoughness={0.7}
                specularIntensity={isDimmed ? 0.0 : 1.0}
                metalness={0.1}
                envMapIntensity={isDimmed ? 0.2 : 1.0}
                wireframe={false}
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

            {/* SOLID CAP RENDERING LOGIC (Stencil method) */}
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

      {/* 3. Render the Cap Plane (where Stencil != 0) is GLOBAL, so outside the hierarchy */}
      {isClipping && isVisible && (
        <mesh
          position={[0, clippingHeight, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1} // Render after stencil ops
        >
          <planeGeometry args={[BUILD_VOLUME.width, BUILD_VOLUME.depth]} />
          <meshBasicMaterial
            color={isSelected ? "#f67104" : "#94a3b8"}
            side={THREE.DoubleSide}
            stencilWrite={true}
            stencilRef={0}
            stencilFunc={THREE.NotEqualStencilFunc}
            stencilFail={THREE.KeepStencilOp}
            stencilZFail={THREE.KeepStencilOp}
            stencilZPass={THREE.KeepStencilOp}
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

export const Viewport: React.FC<ViewportProps> = ({
  models,
  selectedModelId,
  onSelectModel,
  onTransformChange,
  onUpdateModelSize,
  onUpdateAdvancedSettings,
  onCloneModel,
  onArrayModels,
  onDeleteModel,

  isAdvancedSliceMode,
  globalSettings,
  zZones = [],
  gcodeJob = null,
  onExitGCode,
}) => {
  // ── GCode integration ──────────────────────────────────────────
  const gcodeUrl = gcodeJob?.gcodeUrl ?? null;
  const [gcodeLayer, setGcodeLayer] = useState<number>(0);
  const { parsed: gcodeParsed, loading: gcodeLoading, layerLines, gcodeRaw, allLines, layerMap } = useGCodeLoader(gcodeUrl, gcodeLayer);
  const [inspectorTab, setInspectorTab] = useState<'inspector' | 'gcode'>('inspector');
  const gcodeScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [gcodeShowTravel, setGcodeShowTravel] = useState(false);
  const [gcodeNozzle, setGcodeNozzle] = useState(globalSettings.nozzleDiameter || 0.4);
  const [gcodeColorMode, setGcodeColorMode] = useState<ColorMode>('toolhead');
  const isGCodeMode = !!gcodeJob;


  // When a new parsed result arrives, reset to last layer  
  useEffect(() => {
    if (gcodeParsed) setGcodeLayer(gcodeParsed.layerCount);
  }, [gcodeParsed]);

  // Auto-scroll to current layer in gcode panel
  useEffect(() => {
    if (inspectorTab === 'gcode' && activeLineRef.current && gcodeScrollRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [gcodeLayer, inspectorTab]);

  // Update nozzle when job or global settings change
  useEffect(() => {
    setGcodeNozzle(globalSettings.nozzleDiameter || 0.4);
  }, [gcodeJob, globalSettings.nozzleDiameter]);



  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [objectTool, setObjectTool] = useState<ObjectTool>('translate');
  const [viewMode, setViewMode] = useState<ViewMode>('solid');
  const [zoomTrigger, setZoomTrigger] = useState(0);
  const [viewTrigger, setViewTrigger] = useState({ mode: 'iso', t: 0 });
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null);



  // Clipping State
  const [isClipping, setIsClipping] = useState(false);
  const [clippingHeight, setClippingHeight] = useState(0);

  // Transform State
  // Transform State
  const [uniformScale, setUniformScale] = useState(true);
  const [arraySpacing, setArraySpacing] = useState(5);

  useEffect(() => {
    clippingPlane.constant = clippingHeight;
    // Window hack no longer needed
  }, [clippingHeight]);

  useEffect(() => {
    setFocusTarget(null);
  }, [isAdvancedSliceMode, selectedModelId]);

  const onMissed = () => {
    onSelectModel(null);
  };

  const handleZoomIn = () => setZoomTrigger(prev => prev + 1);
  const handleZoomOut = () => setZoomTrigger(prev => prev - 1);
  const setView = (mode: string) => setViewTrigger(prev => ({ mode, t: prev.t + 1 }));

  const cycleViewMode = () => {
    const modes: ViewMode[] = ['solid', 'transparent'];
    setViewMode(modes[(modes.indexOf(viewMode) + 1) % modes.length]);
  };




  const selectedModel = models.find(m => m.id === selectedModelId);

  // Dynamic max height calculation — use max Z height of ALL models on bed
  const sliderMaxHeight = useMemo(() => {
    if (models.length === 0) return BUILD_VOLUME.height;
    const maxModelHeight = Math.max(...models.map(m => (m.size?.z || 0) * (m.transform?.scale?.z || 1)), 0);
    // Add 5% padding, but never exceed build volume
    return Math.min(Math.max(maxModelHeight * 1.05, 1), BUILD_VOLUME.height);
  }, [models]);

  const handleUpdateSegmentSlider = (index: number, newTop: number) => {
    if (!selectedModel) return;
    const segments = [...selectedModel.advancedSettings.segments];
    if (segments[index]) {
      segments[index] = { ...segments[index], topLimit: newTop };
      onUpdateAdvancedSettings({ ...selectedModel.advancedSettings, segments });
    }
  };

  return (
    <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900 overflow-hidden flex">

      {/* Main Viewport Area */}
      <div className="flex-1 relative h-full">

        {/* Render Canvas */}
        <div className={`absolute inset-3 z-0 rounded-xl overflow-hidden transition-all shadow-inner bg-slate-100/60 dark:bg-slate-800/20`}>
          <Canvas
            shadows
            camera={{ position: [100, 100, 150], fov: 45, near: 0.01, far: 2000 }}
            onPointerMissed={onMissed}
            gl={{ localClippingEnabled: true }}
          >
            <fog attach="fog" args={['#1a1d22', 1200, 2500]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[50, 50, 50]} intensity={1.0} castShadow shadow-bias={-0.0001} />
            <Environment preset="city" />

            {/* Render Clipping Plane Visualizer if enabled */}
            {isClipping && !isGCodeMode && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, clippingHeight, 0]}>
                <planeGeometry args={[BUILD_VOLUME.width, BUILD_VOLUME.depth]} />
                <meshBasicMaterial color="#ff0000" opacity={0.1} transparent side={THREE.DoubleSide} depthWrite={false} />
                <lineSegments>
                  <edgesGeometry args={[new THREE.PlaneGeometry(BUILD_VOLUME.width, BUILD_VOLUME.depth)]} />
                  <lineBasicMaterial color="#ff0000" opacity={0.5} transparent />
                </lineSegments>
              </mesh>
            )}

            <BuildPlate globalSettings={globalSettings} />

            {/* UV Process Indicators */}
            <UVProcessPlanes 
              zZones={zZones} 
              models={models}
              isVisible={isGCodeMode}
              currentHeight={gcodeParsed && gcodeParsed.layerHeights ? gcodeParsed.layerHeights[gcodeLayer] : null}
            />

            {/* STL Models - hidden when GCode is active */}
            <Suspense fallback={null}>
               {!isGCodeMode && models.length === 0 && null}
               {!isGCodeMode && models.map(model => {
                 const adhesionOffset = (globalSettings.adhesion?.enabled)
                   ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000
                   : 0;
 
                 const isSelected = model.id === selectedModelId;
                 const isDimmed = isAdvancedSliceMode && !isSelected;

                 return (
                   <Model
                     key={model.id}
                     id={model.id}
                     name={model.name}
                     url={model.url}
                     objectTool={objectTool}
                     viewMode={viewMode}
                     isSelected={isSelected}
                     isVisible={true}
                     isDimmed={isDimmed}
                     isAdvancedMode={isAdvancedSliceMode && isSelected}
                     advancedSettings={model.advancedSettings}
                     setIsSelected={(val) => val ? onSelectModel(model.id) : null}
                     transformData={model.transform}
                     onTransformChange={(newData) => onTransformChange(model.id, newData)}
                     onUpdateSize={(size) => onUpdateModelSize(model.id, size)}
                     adhesionOffset={adhesionOffset}
                     isClipping={isClipping}
                     clippingHeight={clippingHeight}
                     toolheadColor={TOOLHEAD_COLORS[model.toolhead || 'none'] || TOOLHEAD_COLORS.none}
                     globalSettings={globalSettings}
                     wellAssignment={model.transform.wellAssignment}
                   />
                 );
               })}
            </Suspense>

            {/* GCode Toolpath - renders in same canvas when active */}
            {isGCodeMode && gcodeParsed && (
              <GCodeScene
                parsed={gcodeParsed}
                upToLayer={gcodeLayer}
                nozzleDiameter={gcodeNozzle}
                showTravel={gcodeShowTravel}
                colorMode={gcodeColorMode}
              />
            )}

            <ContactShadows position={[0, 0.1, 0]} opacity={0.4} scale={200} blur={2.5} far={4} />
            <SceneControls cameraMode={cameraMode} zoomTrigger={zoomTrigger} />
            <CameraManager viewTrigger={viewTrigger} focusTarget={focusTarget} />
          </Canvas>





          {/* ── Empty state cuando no hay modelos ── */}
          {!isGCodeMode && models.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white/90 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/60 shadow-lg shadow-slate-200/50 dark:shadow-black/30">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Icon name="upload_file" className="text-3xl text-primary/70" />
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1">No Models Loaded</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Drag &amp; drop STL files · or use the panel</p>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-slate-400 dark:text-slate-500 font-mono">
                  <span className="px-2 py-0.5 bg-primary/8 dark:bg-primary/10 text-primary/70 rounded-md border border-primary/20">Step 2 → Load Files</span>
                </div>
              </div>
            </div>
          )}

          {/* ── GCode exit button (top-right corner) */}
          {isGCodeMode && onExitGCode && (
            <button
              onClick={onExitGCode}
              title="Exit toolpath preview"
              className="absolute top-3 right-3 z-30 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200/60 dark:hover:border-red-900/30 hover:bg-red-50/80 dark:hover:bg-red-900/10 transition-all btn-transition text-[9px] font-medium uppercase tracking-wide"
            >
              <Icon name="close" className="text-sm" />
              Exit Preview
            </button>
          )}

          {/* ── GCode Layer Controls Bar ─────────────────────────────── */}
          {isGCodeMode && (
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-t border-slate-200/60 dark:border-slate-700/60 px-4 py-2 flex items-center gap-4">
              {/* Loading state */}
              {gcodeLoading && (
                <div className="flex items-center gap-2 flex-1 text-slate-500 dark:text-slate-400">
                  <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[9px] font-medium uppercase tracking-wide">Loading toolpaths...</span>
                </div>
              )}
              {!gcodeLoading && gcodeParsed && (
                <>
                  {/* Layer Slider */}
                  <Icon name="layers" className="text-slate-400 text-[13px] shrink-0" />
                  <span className="text-[9px] text-slate-500 font-medium uppercase tracking-wide shrink-0">Layer</span>
                  <input
                    type="range" min={0} max={gcodeParsed.layerCount} step={1}
                    value={gcodeLayer}
                    onChange={e => setGcodeLayer(+e.target.value)}
                    className="flex-1 h-1 accent-primary bg-slate-200 dark:bg-slate-600 rounded-full cursor-pointer appearance-none"
                  />
                  <input
                    type="number"
                    min={0}
                    max={gcodeParsed.layerCount}
                    value={gcodeLayer}
                    onChange={e => {
                      const val = Math.max(0, Math.min(gcodeParsed.layerCount, parseInt(e.target.value) || 0));
                      setGcodeLayer(val);
                    }}
                    className="w-12 px-1 py-0.5 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-600/60 rounded-md text-center text-[10px] font-mono text-primary focus:ring-1 focus:ring-primary/30 outline-none"
                  />
                  <span className="text-[10px] font-mono text-slate-400 w-6 shrink-0">
                    /{gcodeParsed.layerCount}
                  </span>

                  <div className="h-4 w-px bg-slate-200/60 dark:bg-slate-600/60 shrink-0" />

                  {/* Travel toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer text-[9px] text-slate-500 font-medium uppercase tracking-wide hover:text-primary transition-colors shrink-0">
                    <input type="checkbox" checked={gcodeShowTravel} onChange={e => setGcodeShowTravel(e.target.checked)} className="accent-primary w-2.5 h-2.5 cursor-pointer" />
                    Travel
                  </label>

                  <div className="h-4 w-px bg-slate-200/60 dark:bg-slate-600/60 shrink-0" />

                  {/* Color mode toggle + legend popover */}
                  <div className="relative group shrink-0">
                    <button
                      onClick={() => setGcodeColorMode(m => m === 'toolhead' ? 'linetype' : 'toolhead')}
                      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[9px] font-medium uppercase tracking-wide transition-all ${
                        gcodeColorMode === 'linetype'
                          ? 'bg-primary/10 border-primary/20 text-primary'
                          : 'bg-slate-100/50 dark:bg-slate-700/50 border-slate-200/60 dark:border-slate-600/60 text-slate-500 dark:text-slate-400 hover:border-primary/20 hover:text-primary'
                      }`}
                      title="Toggle coloring mode — hover to see legend"
                    >
                      <Icon name="palette" className="text-[10px]" />
                      {gcodeColorMode === 'toolhead' ? 'By Tool' : 'By Type'}
                    </button>

                    {/* Floating legend — appears above the bar on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 min-w-[140px]">
                        <p className="text-[9px] font-bold uppercase text-slate-400 mb-2 tracking-widest">
                          {gcodeColorMode === 'toolhead' ? 'Toolhead' : 'Line Type'}
                        </p>
                        <div className="flex flex-col gap-1.5">
                          {gcodeColorMode === 'toolhead' ? (
                            <>
                              <span className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 font-medium"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TOOLHEAD_COLOR.T0 }} />FDM Hot-end</span>
                              <span className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 font-medium"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TOOLHEAD_COLOR.T1 }} />Syringe</span>
                              <span className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 font-medium"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TOOLHEAD_COLOR.T2 }} />UV Crosslinker</span>
                            </>
                          ) : (
                            LINE_TYPE_LABELS.filter(([k]) => gcodeParsed?.usedLineTypes?.has(k)).map(([k, label]) => (
                              <span key={k} className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-300 font-medium">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LINE_TYPE_COLOR[k] }} />
                                {label}
                              </span>
                            ))
                          )}
                        </div>
                        {/* Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-slate-800" />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom Center - Camera Views */}
        <div className={`absolute ${isGCodeMode ? 'bottom-16' : 'bottom-3'} left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm p-0.5 rounded-md border border-slate-200/50 dark:border-slate-700/50 z-20 transition-all duration-300`}>
          <button onClick={() => setView('iso')} className="w-7 h-7 rounded hover:bg-slate-100/70 dark:hover:bg-slate-700/70 btn-transition text-slate-500 dark:text-slate-400 flex items-center justify-center" title="Isometric View">
            <Icon name="view_in_ar" className="text-sm" />
          </button>
          <div className="w-px h-3.5 bg-slate-200/60 dark:bg-slate-600/60 mx-0.5"></div>
          <button onClick={() => setView('top')} className="w-7 h-7 rounded hover:bg-slate-100/70 dark:hover:bg-slate-700/70 btn-transition text-slate-500 dark:text-slate-400 text-[8px] font-medium uppercase flex items-center justify-center" title="Top View">TOP</button>
          <button onClick={() => setView('front')} className="w-7 h-7 rounded hover:bg-slate-100/70 dark:hover:bg-slate-700/70 btn-transition text-slate-500 dark:text-slate-400 text-[8px] font-medium uppercase flex items-center justify-center" title="Front View">FNT</button>
          <button onClick={() => setView('right')} className="w-7 h-7 rounded hover:bg-slate-100/70 dark:hover:bg-slate-700/70 btn-transition text-slate-500 dark:text-slate-400 text-[8px] font-medium uppercase flex items-center justify-center" title="Right View">RGT</button>
        </div>
      </div>

      {/* Right Sidebar - Inspector */}
      <div className="w-64 bg-surface-light dark:bg-surface-dark border-l border-slate-200/60 dark:border-slate-800/60 z-30 flex flex-col h-full panel-transition">
        <div className="px-2.5 py-2.5 border-b border-slate-200/60 dark:border-slate-800/40">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <button 
                onClick={() => setInspectorTab('inspector')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold rounded-md transition-all ${
                  inspectorTab === 'inspector'
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon name="tune" className="text-[11px]" />
                Inspector
              </button>
              <button 
                onClick={() => setInspectorTab('gcode')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold rounded-md transition-all ${
                  inspectorTab === 'gcode'
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon name="code" className="text-[11px]" />
                G-code
              </button>
            </div>
            {inspectorTab === 'inspector' && (
              <button onClick={cycleViewMode} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 rounded btn-transition cursor-pointer" title="Toggle View Mode">
                <div className={`w-1 h-1 rounded-full border box-border ${viewMode === 'solid' ? 'bg-slate-600 border-slate-600 dark:bg-slate-300 dark:border-slate-300' : 'border-slate-400'}`}></div>
                <span className="text-[8px] font-medium text-slate-400 uppercase">{viewMode}</span>
              </button>
            )}
          </div>
        </div>



        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
          {inspectorTab === 'inspector' && selectedModel && (
            <>
              {/* Model Info Section */}
              <section>
                <div className="flex items-center gap-1.5 mb-2 text-[9px] font-medium text-slate-400 uppercase tracking-wider">
                  Model Information
                </div>
                <ModelInfoPanel
                  model={selectedModel}
                  adhesionOffset={(globalSettings.adhesion?.enabled) ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000 : 0}
                />
              </section>

              {/* Transform Section */}
              {/* Transform Section */}
              <section>
                <div className="flex items-center gap-1.5 mb-2 text-[9px] font-medium text-slate-400 uppercase tracking-wider">
                  Transform
                </div>

                <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-800/50 p-0.5 mb-2">
                  <div className="grid grid-cols-4 gap-0.5">
                    {[
                      { id: 'translate', icon: 'open_with', label: 'Move' },
                      { id: 'rotate', icon: 'rotate_right', label: 'Rotate' },
                      { id: 'scale', icon: 'aspect_ratio', label: 'Scale' },
                      { id: 'modify', icon: 'build', label: 'Tools' },
                    ].map(tool => (
                      <button
                        key={tool.id}
                        onClick={() => setObjectTool(tool.id as ObjectTool)}
                        className={`flex flex-col items-center justify-center py-1.5 rounded btn-transition ${objectTool === tool.id
                          ? 'bg-white dark:bg-slate-700 text-primary'
                          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                          }`}
                        title={tool.label}
                      >
                        <Icon name={tool.icon} className="text-sm mb-0.5" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transform Inputs */}
                <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-lg border border-slate-100 dark:border-slate-800/50 p-2">
                  {objectTool === 'modify' ? (
                    <div className="flex flex-col gap-2">
                      {/* Arrange Section */}
                      <div>
                        <label className="text-[9px] font-medium text-slate-400 uppercase block mb-1 flex items-center gap-1">
                          <Icon name="grid_view" className="text-xs" /> Arrange Models
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={arraySpacing}
                            onChange={(e) => setArraySpacing(parseFloat(e.target.value) || 0)}
                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-primary outline-none"
                            placeholder="Spacing"
                          />
                          <button
                            onClick={() => onArrayModels(arraySpacing)}
                            className="h-[26px] px-2 bg-slate-100 dark:bg-slate-700 hover:bg-primary/80 hover:text-white text-slate-600 dark:text-slate-300 text-[10px] font-medium rounded btn-transition"
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      <div className="h-px bg-slate-100 dark:bg-slate-700/50"></div>

                      {/* Quick Actions */}
                      <div className="grid grid-cols-1 gap-1">
                        <button
                          onClick={() => selectedModelId && onCloneModel(selectedModelId)}
                          className="w-full py-1.5 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:bg-primary/5 text-slate-500 dark:text-slate-400 text-[10px] font-medium rounded btn-transition flex items-center justify-center gap-1"
                        >
                          <Icon name="content_copy" className="text-xs" /> Duplicate
                        </button>
                        <button
                          onClick={() => selectedModelId && onTransformChange(selectedModelId, { ...selectedModel.transform, position: { x: 0, y: 0, z: 0 } })}
                          className="w-full py-1.5 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:bg-primary/5 text-slate-500 dark:text-slate-400 text-[10px] font-medium rounded btn-transition flex items-center justify-center gap-1"
                        >
                          <Icon name="center_focus_strong" className="text-xs" /> Center to Bed
                        </button>
                        <button
                          onClick={() => setObjectTool('orient')}
                          className="w-full py-1.5 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 hover:border-primary/30 hover:bg-primary/5 text-slate-500 dark:text-slate-400 text-[10px] font-medium rounded btn-transition flex items-center justify-center gap-1"
                        >
                          <Icon name="vertical_align_bottom" className="text-xs" /> Orient to Bed
                        </button>
                        <button
                          onClick={() => selectedModelId && onDeleteModel(selectedModelId)}
                          className="w-full py-1.5 bg-red-50/50 dark:bg-red-950/10 border border-red-100/50 dark:border-red-900/20 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-500/50 text-red-500 dark:text-red-400 text-[10px] font-medium rounded btn-transition flex items-center justify-center gap-1 mt-1"
                        >
                          <Icon name="delete" className="text-xs" /> Remove Model
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {/* Quick Uniform Toggle for Scale */}
                      {objectTool === 'scale' && (
                        <div className="flex items-center justify-end mb-0.5">
                          <label className="flex items-center gap-1.5 cursor-pointer group">
                            <span className="text-[9px] font-medium text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 select-none">Uniform</span>
                            <div className={`w-3 h-3 border rounded flex items-center justify-center btn-transition ${uniformScale ? 'bg-primary/80 border-primary/80' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600'}`}>
                              {uniformScale && <Icon name="check" className="text-[8px] text-white font-bold" />}
                            </div>
                            <input type="checkbox" className="hidden" checked={uniformScale} onChange={(e) => setUniformScale(e.target.checked)} />
                          </label>
                        </div>
                      )}

                      {['x', 'y', 'z'].map((axis) => {
                        const value = objectTool === 'translate'
                          ? selectedModel.transform.position[axis as 'x' | 'y' | 'z']
                          : objectTool === 'rotate'
                            ? selectedModel.transform.rotation[axis as 'x' | 'y' | 'z']
                            : selectedModel.transform.scale[axis as 'x' | 'y' | 'z'];

                        return (
                          <div key={axis} className="flex items-center gap-1.5 group">
                            <div className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[8px] font-medium text-slate-400 uppercase">
                              {axis}
                            </div>
                            <div className="relative flex-1">
                              <input
                                type="number"
                                step={objectTool === 'rotate' ? 15 : objectTool === 'scale' ? 0.1 : 1}
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5 pr-5 text-right text-xs font-mono text-slate-600 dark:text-slate-300 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all appearance-none"
                                value={value !== undefined ? Number(value).toFixed(objectTool === 'scale' ? 2 : 1) : ''}
                                placeholder="0.0"
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (isNaN(val)) return;

                                  const newTransform = { ...selectedModel.transform };
                                  if (objectTool === 'translate') newTransform.position = { ...newTransform.position, [axis]: val };
                                  if (objectTool === 'rotate') newTransform.rotation = { ...newTransform.rotation, [axis]: val };
                                  if (objectTool === 'scale') {
                                    if (uniformScale) {
                                      newTransform.scale = { x: val, y: val, z: val };
                                    } else {
                                      newTransform.scale = { ...newTransform.scale, [axis]: val };
                                    }
                                  }

                                  onTransformChange(selectedModel.id, newTransform);
                                }}
                              />
                              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 font-medium pointer-events-none select-none bg-transparent">
                                {objectTool === 'rotate' ? '°' : objectTool === 'scale' ? 'x' : 'mm'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <div className="border-t border-slate-100 dark:border-slate-800/50 my-3"></div>

              {/* Cross Section Analysis */}
              <section>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1 text-[9px] font-medium text-slate-400 uppercase tracking-wider">
                    <Icon name="layers" className="text-xs" /> Cross-Section
                  </div>
                  <button
                    onClick={() => setIsClipping(!isClipping)}
                    className={`w-8 h-4 rounded-full relative transition-all shrink-0 ${isClipping ? 'bg-green-500 shadow-sm shadow-green-500/20' : 'bg-slate-300 dark:bg-slate-600'}`}
                  >
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-md ${isClipping ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </div>

                {isClipping && (
                  <div className="bg-slate-50/50 dark:bg-slate-800/30 rounded-lg p-2 border border-slate-100 dark:border-slate-800/50 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="text-[9px] text-slate-500 font-medium">Cut Height</span>
                      <span className="font-mono text-primary/80 font-medium text-xs">{clippingHeight.toFixed(1)}mm</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={sliderMaxHeight}
                      step="0.1"
                      value={clippingHeight}
                      onChange={(e) => setClippingHeight(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[8px] text-slate-400 mt-1 font-mono">
                      <span>0</span>
                      <span>{sliderMaxHeight.toFixed(0)}</span>
                    </div>
                  </div>
                )}
            </section>
          </>
        )}
        {inspectorTab === 'inspector' && !selectedModel && (
          <div className="flex flex-col items-center justify-center h-24 text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            <Icon name="inbox" className="text-2xl mb-1 opacity-40" />
            <span className="text-[10px] font-medium">No Model Selected</span>
          </div>
        )}
        {inspectorTab === 'gcode' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[9px] font-medium text-slate-400 uppercase">Gcode Output</span>
              <span className="text-[8px] text-slate-400 font-mono">{(gcodeRaw || '').split('\n').length} lines</span>
            </div>
            {gcodeRaw ? (
              <div className="flex-1 flex flex-col min-h-0">
                {gcodeParsed && allLines.length > 0 ? (
                  <div 
                    ref={gcodeScrollRef}
                    className="flex-1 overflow-y-auto min-h-0 bg-slate-100 dark:bg-slate-900 rounded custom-scrollbar scroll-smooth"
                  >
                    <div className="text-[9px] font-bold text-slate-500 px-2 py-1 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-slate-100 dark:bg-slate-900 z-10 flex justify-between">
                      <span>Full G-code File</span>
                      <span className="text-primary tracking-tighter">Layer {gcodeLayer}</span>
                    </div>
                    <div className="p-2 space-y-0.5">
                      {allLines.map((line, idx) => {
                        const boundary = layerMap[gcodeLayer];
                        const isActive = boundary && idx >= boundary.start && idx <= boundary.end;
                        const isStartOfLayer = boundary && idx === boundary.start;

                        // Determine color based on line content
                        let lineColor = 'text-slate-500 dark:text-slate-400';
                        if (line.includes(';')) {
                          lineColor = 'text-slate-400 dark:text-slate-500 opacity-60';
                        } else if (line.startsWith('G0') || line.startsWith('G1')) {
                          if (line.includes('E') && !line.includes('E0')) {
                            // Extrusion - check for toolhead color
                            if (line.includes('T0')) lineColor = 'text-blue-600 dark:text-blue-400';
                            else if (line.includes('T1')) lineColor = 'text-green-600 dark:text-green-400';
                            else if (line.includes('T2')) lineColor = 'text-purple-600 dark:text-purple-400';
                            else lineColor = 'text-amber-600 dark:text-amber-400';
                          } else if (line.match(/X|Y|Z/) && !line.includes('E')) {
                            lineColor = 'text-orange-600 dark:text-orange-400';
                          }
                        }
                        
                        return (
                          <div 
                            key={idx} 
                            ref={isStartOfLayer ? activeLineRef : null}
                            className={`font-mono text-[8px] ${lineColor} ${isActive ? 'bg-primary/10 dark:bg-primary/20 ring-1 ring-primary/20 rounded-sm -mx-1 px-1 py-px shadow-sm' : ''} hover:bg-yellow-500/10 transition-colors cursor-pointer`}
                          >
                            <span className={`inline-block w-8 text-right mr-3 select-none ${isActive ? 'text-primary font-bold' : 'text-slate-300 dark:text-slate-700'}`}>
                              {idx + 1}
                            </span>
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <pre className="flex-1 text-[8px] font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-900 p-2 rounded overflow-y-auto whitespace-pre-wrap break-all">
                    {gcodeRaw}
                  </pre>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-24 text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <Icon name="inbox" className="text-2xl mb-1 opacity-40" />
                <span className="text-[10px] font-medium">No Gcode Generated</span>
              </div>
            )}
            {gcodeUrl && (
              <div className="pt-2">
                <a
                  href={gcodeUrl}
                  download="print.gcode"
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 hover:text-primary text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-600 transition-all uppercase w-full"
                >
                  <Icon name="download" className="text-sm" />
                  Download Gcode
                </a>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};