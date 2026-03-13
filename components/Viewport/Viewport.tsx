import React, { Suspense, useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { Canvas, useLoader, useThree, ThreeEvent, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, useCursor, TransformControls, Environment, Grid, Text } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { TransformData, ModelData, AdvancedSliceSettings, SliceSegment, GlobalSettings, Modifier } from '../../types';
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
  onFileUpload?: (file: File) => void;
  isAdvancedSliceMode?: boolean;
  globalSettings: GlobalSettings;
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

// Toolhead colors for 3D preview
export const TOOLHEAD_COLORS: Record<string, string> = {
  fdm:     '#3b82f6', // Blue
  syringe: '#22c55e', // Green
  uv:      '#a855f7', // Purple
  none:    '#94a3b8', // Slate gray (default)
};

type CameraMode = 'orbit' | 'pan';
type ObjectTool = 'translate' | 'rotate' | 'scale' | 'orient' | 'modify';
type ViewMode = 'solid' | 'transparent';

// --- Model Info Panel Component ---
const ModelInfoPanel: React.FC<{ model: ModelData; adhesionOffset: number }> = ({ model, adhesionOffset }) => {
  const isAdv = !!model.advancedSettings.enabled;

  return (
    <div className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-700/50">
        <div className="w-8 h-8 rounded bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-primary shrink-0 border border-blue-100 dark:border-blue-900/30">
          <Icon name="inventory_2" className="text-lg" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate text-slate-800 dark:text-slate-100 leading-tight" title={model.name}>{model.name}</h3>
          <p className="text-[10px] text-slate-400 font-mono">ID: {model.id.slice(0, 6)}</p>
        </div>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white dark:bg-slate-900 rounded p-1.5 border border-slate-100 dark:border-slate-700/50">
          <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Size X</span>
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{model.size?.x?.toFixed(1) || '-'}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded p-1.5 border border-slate-100 dark:border-slate-700/50">
          <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Size Y</span>
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{model.size?.y?.toFixed(1) || '-'}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded p-1.5 border border-slate-100 dark:border-slate-700/50">
          <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Size Z</span>
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{model.size?.z?.toFixed(1) || '-'}</span>
        </div>
      </div>

      {/* Advanced Slice Badge */}
      {isAdv ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg p-2 mt-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Advanced Slice Settings Active</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};


// Procedural Build Plate Visuals (Parametric)
const MULTIWELL_SPECS = {
  '6': { cols: 3, rows: 2, pitch: 39.1, dia: 34.8 },
  '12': { cols: 4, rows: 3, pitch: 26.1, dia: 22.1 },
  '24': { cols: 6, rows: 4, pitch: 19.3, dia: 15.62 },
  '48': { cols: 8, rows: 6, pitch: 13.0, dia: 11.0 },
};

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

  useEffect(() => {
    if (focusTarget && controls) {
      const orb = controls as any;
      const currentPos = camera.position.clone();
      const currentTarget = orb.target.clone();

      const dir = new THREE.Vector3().subVectors(currentPos, currentTarget).normalize();
      const newPos = new THREE.Vector3().copy(focusTarget).add(dir.multiplyScalar(150));

      desiredPos.current.copy(newPos);
      desiredTarget.current.copy(focusTarget);
      isAnimating.current = true;
    }
  }, [focusTarget, camera, controls]);

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

// --- 2D Slice Slider Component ---
interface SliceSliderProps {
  segments: SliceSegment[];
  maxHeight: number;
  onUpdateSegment: (index: number, newTop: number) => void;
  adhesionOffset: number;
}

const SliceSlider: React.FC<SliceSliderProps> = ({ segments, maxHeight, onUpdateSegment, adhesionOffset }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    setDraggingIndex(index);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingIndex === null || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const offsetY = rect.bottom - e.clientY;
      const percentage = Math.max(0, Math.min(1, offsetY / rect.height));
      const value = percentage * maxHeight;
      const rounded = Math.round(value * 100) / 100;

      // Constrain value between prev segment top and next segment top
      const prevLimit = draggingIndex > 0 ? segments[draggingIndex - 1].topLimit : adhesionOffset;
      const nextLimit = draggingIndex < segments.length - 1 ? segments[draggingIndex + 1].topLimit : maxHeight;

      // Allow 0.05mm minimum gap (50um)
      const constrainedValue = Math.max(prevLimit + 0.05, Math.min(nextLimit - 0.05, rounded));

      onUpdateSegment(draggingIndex, constrainedValue);
    };

    const handleMouseUp = () => {
      setDraggingIndex(null);
    };

    if (draggingIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingIndex, segments, maxHeight, onUpdateSegment, adhesionOffset]);

  return (
    <div className="absolute left-12 top-1/2 -translate-y-1/2 h-[80%] flex items-center gap-4 z-30 select-none">
      <div className="flex flex-col h-full justify-start py-0 text-[10px] text-slate-400 font-mono text-left order-last min-w-[30px] -mt-1.5">
        <span>{maxHeight.toFixed(1)}mm</span>
      </div>
      <div ref={trackRef} className="relative h-full w-1.5 bg-slate-200 dark:bg-slate-700 rounded-full">
        {/* Render Segment Bars */}
        {segments.map((segment, i) => {
          const topLimit = segment.topLimit;
          const bottomLimit = i > 0 ? segments[i - 1].topLimit : 0;

          const topPct = (topLimit / maxHeight) * 100;
          const bottomPct = (bottomLimit / maxHeight) * 100;
          const heightPct = topPct - bottomPct;

          if (heightPct <= 0) return null;

          const color = getSegmentColor(i);

          return (
            <div
              key={segment.id}
              className="absolute w-full rounded-full border-b border-white/20"
              style={{
                bottom: `${bottomPct}%`,
                height: `${heightPct}%`,
                backgroundColor: color,
                opacity: 0.8
              }}
            />
          );
        })}

        {/* Render Handles for Top Limits */}
        {segments.map((segment, i) => {
          const topPct = (segment.topLimit / maxHeight) * 100;
          const color = getSegmentColor(i);

          return (
            <div
              key={`handle-${segment.id}`}
              className="absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded-full shadow-md cursor-ns-resize hover:scale-110 transition-transform flex items-center justify-center z-10 border border-white"
              style={{ bottom: `${topPct}%`, marginBottom: '-10px', backgroundColor: color }}
              onMouseDown={(e) => handleMouseDown(e, i)}
            >
              <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
}

const Model: React.FC<ModelProps & { globalSettings: GlobalSettings; wellAssignment?: { format: 6 | 12 | 24 | 48; wellId: string } }> = ({
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
  toolheadColor = '#94a3b8'
}) => {

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

  useCursor(objectTool === 'orient' && hovered && isVisible && !isAdvancedMode, 'pointer', 'auto');

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
         
         // Calculate well center position
         finalPosition.x = (col - (spec.cols - 1) / 2) * spec.pitch;
         finalPosition.z = (row - (spec.rows - 1) / 2) * spec.pitch;
         // Note: Y position (height) is preserved from transformData.position.y
       }

       // 1. Position Group (Universal Coordinates)
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

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isVisible) return;
    e.stopPropagation();
    if (!isSelected) setIsSelected(true);

    const ev = e as any;
    if (objectTool === 'orient' && ev.face && meshRef.current && !isAdvancedMode) {
      const normal = ev.face.normal.clone();
      normal.applyQuaternion(meshRef.current.quaternion).normalize();
      const targetNormal = new THREE.Vector3(0, -1, 0);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(normal, targetNormal);
      const newQuat = alignQuat.multiply(meshRef.current.quaternion.clone());
      const newEuler = new THREE.Euler().setFromQuaternion(newQuat);

      // Just update rotation - the adjustPositionToFloor effect will handle the Z snap perfectly
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
      // Map current group states back to flat transformData
      onTransformChange({
        ...transformData,
        position: {
          x: posGroupRef.current.position.x,
          y: posGroupRef.current.position.z, // Three Z -> Data Y
          z: posGroupRef.current.position.y  // Three Y -> Data Z
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
    if (!geometry.boundingBox) return;

    // 1. Construct the hierarchy math to find the world bounding box base
    // Note: We use the hierarchy: UniversalPos * UniversalScale * LocalRot * Mesh
    // To find the base, we calculate (Scale * Rot * Box) and see how far below 0 its Y is.

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

    const requiredZ = -box.min.y;

    if (updateIfChanged && Math.abs(requiredZ - transformData.position.z) > 0.001) {
      onTransformChange({
        ...transformData,
        position: { ...transformData.position, z: requiredZ }
      });
    }
  }, [geometry, transformData.scale, transformData.rotation, transformData.position.z, onTransformChange]);

  useEffect(() => {
    adjustPositionToFloor();
  }, [geometry, transformData.scale, transformData.rotation]);

  useEffect(() => {
    const { x, y, z } = transformData.position;
    // Initial grounding if we are at the center/bottom defaults
    if (x === 0 && y === 0 && z === 0) adjustPositionToFloor();
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
              receiveShadow
            >
              <meshPhysicalMaterial
                ref={materialRef}
                onBeforeCompile={onBeforeCompile}
                color={isOutOfBounds ? "#ef4444" : (isSelected ? "#f67104" : toolheadColor)}
                roughness={0.4}
                reflectivity={0.5}
                clearcoat={1.0}
                clearcoatRoughness={0.7}
                specularIntensity={1.0}
                metalness={0.1}
                envMapIntensity={1.0}
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

      {isSelected && objectTool !== 'orient' && isVisible && !isAdvancedMode && (
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
  onFileUpload,
  isAdvancedSliceMode,
  globalSettings,
  gcodeJob = null,
  onExitGCode,
}) => {
  // ── GCode integration ──────────────────────────────────────────
  const gcodeUrl = gcodeJob?.gcodeUrl ?? null;
  const { parsed: gcodeParsed, loading: gcodeLoading } = useGCodeLoader(gcodeUrl);
  const [gcodeLayer, setGcodeLayer] = useState<number>(0);
  const [gcodeShowTravel, setGcodeShowTravel] = useState(false);
  const [gcodeNozzle, setGcodeNozzle] = useState(gcodeJob?.nozzleDiameter ?? 0.4);
  const [gcodeColorMode, setGcodeColorMode] = useState<ColorMode>('toolhead');
  const isGCodeMode = !!gcodeJob;

  // When a new parsed result arrives, reset to last layer  
  useEffect(() => {
    if (gcodeParsed) setGcodeLayer(gcodeParsed.layerCount);
  }, [gcodeParsed]);

  // Update nozzle when job changes
  useEffect(() => {
    setGcodeNozzle(gcodeJob?.nozzleDiameter ?? 0.4);
  }, [gcodeJob]);
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [objectTool, setObjectTool] = useState<ObjectTool>('translate');
  const [viewMode, setViewMode] = useState<ViewMode>('solid');
  const [zoomTrigger, setZoomTrigger] = useState(0);
  const [viewTrigger, setViewTrigger] = useState({ mode: 'iso', t: 0 });
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (isAdvancedSliceMode && selectedModelId) {
      const model = models.find(m => m.id === selectedModelId);
      if (model) {
        const target = new THREE.Vector3(
          model.transform.position.x,
          model.transform.position.y + ((model.size?.y || 0) / 2),
          model.transform.position.z
        );
        setFocusTarget(target);
      }
    } else {
      setFocusTarget(null);
    }
  }, [isAdvancedSliceMode, selectedModelId, models]);

  const onMissed = () => {
    if (!isAdvancedSliceMode) {
      onSelectModel(null);
    }
  };

  const handleZoomIn = () => setZoomTrigger(prev => prev + 1);
  const handleZoomOut = () => setZoomTrigger(prev => prev - 1);
  const setView = (mode: string) => setViewTrigger(prev => ({ mode, t: prev.t + 1 }));

  const cycleViewMode = () => {
    const modes: ViewMode[] = ['solid', 'transparent'];
    setViewMode(modes[(modes.indexOf(viewMode) + 1) % modes.length]);
  };

  const handleEmptyStateClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onFileUpload) {
      Array.from(e.target.files).forEach(f => onFileUpload(f));
      e.target.value = '';
    }
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
        <div className="absolute inset-4 z-0 rounded-xl overflow-hidden shadow-inner bg-slate-100/50 dark:bg-slate-800/20 transition-all">
          <Canvas
            shadows
            camera={{ position: [100, 100, 150], fov: 45, near: 0.01, far: 2000 }}
            onPointerMissed={onMissed}
            gl={{ localClippingEnabled: true }}
          >
            <fog attach="fog" args={['#f8fafc', 1000, 2000]} />
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

            {/* STL Models - hidden when GCode is active */}
            <Suspense fallback={null}>
               {!isGCodeMode && models.map(model => {
                 const adhesionOffset = (globalSettings.adhesion?.enabled)
                   ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000
                   : 0;
 
                 return (
                   <Model
                     key={model.id}
                     id={model.id}
                     name={model.name}
                     url={model.url}
                     objectTool={objectTool}
                     viewMode={viewMode}
                     isSelected={model.id === selectedModelId}
                     isVisible={!isAdvancedSliceMode || model.id === selectedModelId}
                     isAdvancedMode={isAdvancedSliceMode && model.id === selectedModelId}
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

          {isAdvancedSliceMode && !isGCodeMode && selectedModel && (
            <SliceSlider
              segments={selectedModel.advancedSettings.segments}
              maxHeight={sliderMaxHeight}
              onUpdateSegment={handleUpdateSegmentSlider}
              adhesionOffset={(globalSettings.adhesion?.enabled)
                ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000
                : 0}
            />
          )}

          {!isGCodeMode && models.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div onClick={handleEmptyStateClick} className="text-center bg-white/80 dark:bg-slate-900/80 p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 backdrop-blur-sm pointer-events-auto cursor-pointer hover:border-primary hover:bg-blue-50/50 dark:hover:bg-slate-800 transition-all group max-w-md w-full mx-4">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".stl" multiple className="hidden" />
                <span className="text-primary text-lg font-medium block mb-1">No model loaded</span>
                <span className="text-sm font-normal text-slate-500 block">Click "Upload Model" or drag & drop a file (STL) here</span>
              </div>
            </div>
          )}

          {/* ── GCode exit button (top-right corner) */}
          {isGCodeMode && onExitGCode && (
            <button
              onClick={onExitGCode}
              title="Exit toolpath preview"
              className="absolute top-8 right-8 z-30 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-lg text-slate-600 dark:text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all duration-200 text-[11px] font-bold uppercase tracking-wider animate-in fade-in duration-300"
            >
              <Icon name="close" className="text-base" />
              Exit Preview
            </button>
          )}

          {/* ── GCode Layer Controls Bar ─────────────────────────────── */}
          {isGCodeMode && (
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-700 shadow-lg px-5 py-2.5 flex items-center gap-5 animate-in slide-in-from-bottom-2 duration-300">
              {/* Loading state */}
              {gcodeLoading && (
                <div className="flex items-center gap-3 flex-1 text-slate-500 dark:text-slate-400">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Loading toolpaths...</span>
                </div>
              )}
              {!gcodeLoading && gcodeParsed && (
                <>
                  {/* Layer Slider */}
                  <Icon name="layers" className="text-slate-400 text-base shrink-0" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider shrink-0">Layer</span>
                  <input
                    type="range" min={0} max={gcodeParsed.layerCount} step={1}
                    value={gcodeLayer}
                    onChange={e => setGcodeLayer(+e.target.value)}
                    className="flex-1 h-1.5 accent-primary bg-slate-200 dark:bg-slate-600 rounded-full cursor-pointer appearance-none"
                  />
                  <span className="text-xs font-mono text-primary font-bold w-14 text-right shrink-0">
                    {gcodeLayer}/{gcodeParsed.layerCount}
                  </span>

                  <div className="h-5 w-px bg-slate-200 dark:bg-slate-600 shrink-0" />

                  {/* Nozzle */}
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 shrink-0">
                    <span className="font-bold uppercase">⌀</span>
                    <input
                      type="number" min="0.1" max="2.0" step="0.05"
                      value={gcodeNozzle}
                      onChange={e => setGcodeNozzle(parseFloat(e.target.value) || 0.4)}
                      className="w-12 px-1 py-0.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center text-xs font-mono text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary/50 outline-none"
                    />
                    <span className="font-bold uppercase text-slate-400">mm</span>
                  </div>

                  <div className="h-5 w-px bg-slate-200 dark:bg-slate-600 shrink-0" />

                  {/* Travel toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-500 font-bold uppercase tracking-tight hover:text-primary transition-colors shrink-0">
                    <input type="checkbox" checked={gcodeShowTravel} onChange={e => setGcodeShowTravel(e.target.checked)} className="accent-primary w-3 h-3 cursor-pointer" />
                    Travel
                  </label>

                  <div className="h-5 w-px bg-slate-200 dark:bg-slate-600 shrink-0" />

                  {/* Color mode toggle + legend popover */}
                  <div className="relative group shrink-0">
                    <button
                      onClick={() => setGcodeColorMode(m => m === 'toolhead' ? 'linetype' : 'toolhead')}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-tight transition-all ${
                        gcodeColorMode === 'linetype'
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-primary/30 hover:text-primary'
                      }`}
                      title="Toggle coloring mode — hover to see legend"
                    >
                      <Icon name="palette" className="text-sm" />
                      {gcodeColorMode === 'toolhead' ? 'By Tool' : 'By Type'}
                      <Icon name="expand_less" className="text-[10px] opacity-50" />
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

                  <div className="h-5 w-px bg-slate-200 dark:bg-slate-600 shrink-0" />

                  {/* G-code download */}
                  {gcodeUrl && (
                    <a
                      href={gcodeUrl}
                      download="print.gcode"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 hover:text-primary text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-600 transition-all uppercase shrink-0"
                    >
                      <Icon name="download" className="text-sm" />
                      G-code
                    </a>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Bottom Center - Camera Views - raised clear of GCode layer bar */}
        <div className={`absolute ${isGCodeMode ? 'bottom-24' : 'bottom-6'} left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md p-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-xl z-20 transition-all duration-300`}>
          <button onClick={() => setView('iso')} className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 flex items-center justify-center group" title="Isometric View">
            <Icon name="view_in_ar" className="text-xl group-hover:scale-110 transition-transform" />
          </button>
          <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1"></div>
          <button onClick={() => setView('top')} className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase flex items-center justify-center border border-transparent hover:border-slate-200" title="Top View">TOP</button>
          <button onClick={() => setView('front')} className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase flex items-center justify-center border border-transparent hover:border-slate-200" title="Front View">FNT</button>
          <button onClick={() => setView('right')} className="w-10 h-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase flex items-center justify-center border border-transparent hover:border-slate-200" title="Right View">RGT</button>
        </div>
      </div>

      {/* Right Sidebar - Inspector */}
      <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-30 flex flex-col h-full">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 uppercase tracking-wide">
              <Icon name="tune" className="text-base text-primary" />
              Inspector
            </h2>
            {/* Global View Mode Toggle */}
            <button onClick={cycleViewMode} className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Toggle View Mode">
              <div className={`w-2 h-2 rounded-full border box-border ${viewMode === 'solid' ? 'bg-slate-800 border-slate-800 dark:bg-slate-200 dark:border-slate-200' : 'border-slate-400'}`}></div>
              <span className="text-[9px] font-bold text-slate-500 uppercase">{viewMode}</span>
            </button>
          </div>
        </div>



        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">

          {selectedModel ? (
            <>
              {/* Model Info Section */}
              <section>
                <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Model Information
                </div>
                <ModelInfoPanel
                  model={selectedModel}
                  adhesionOffset={(globalSettings.adhesion?.enabled) ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000 : 0}
                />
              </section>

              {/* Transform Section */}
              {!isAdvancedSliceMode && (
                <section>
                  <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Transform
                  </div>

                  <div className="bg-slate-50/50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 mb-2">
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
                          className={`flex flex-col items-center justify-center py-1.5 rounded-lg transition-all ${objectTool === tool.id
                            ? 'bg-white dark:bg-slate-700 shadow-sm text-primary ring-1 ring-slate-200 dark:ring-slate-600'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          title={tool.label}
                        >
                          <Icon name={tool.icon} className="text-lg mb-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Transform Inputs */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm">
                    {objectTool === 'modify' ? (
                      <div className="flex flex-col gap-3">
                        {/* Arrange Section */}
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5 flex items-center gap-2">
                            <Icon name="grid_view" className="text-sm" /> Arrange Models
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={arraySpacing}
                              onChange={(e) => setArraySpacing(parseFloat(e.target.value) || 0)}
                              className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary outline-none"
                              placeholder="Spacing (mm)"
                            />
                            <button
                              onClick={() => onArrayModels(arraySpacing)}
                              className="h-[30px] px-3 bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white dark:hover:bg-primary border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded transition-all"
                            >
                              Apply
                            </button>
                          </div>
                        </div>

                        <div className="h-px bg-slate-100 dark:bg-slate-700/50"></div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-1 gap-2">
                          <button
                            onClick={() => selectedModelId && onCloneModel(selectedModelId)}
                            className="w-full py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-2"
                          >
                            <Icon name="content_copy" className="text-xs" /> Duplication
                          </button>
                          <button
                            onClick={() => selectedModelId && onTransformChange(selectedModelId, { ...selectedModel.transform, position: { x: 0, y: 0, z: 0 } })}
                            className="w-full py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-2"
                          >
                            <Icon name="center_focus_strong" className="text-xs" /> Center to Build Plate
                          </button>
                          <button
                            onClick={() => setObjectTool('orient')}
                            className="w-full py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-slate-600 dark:text-slate-300 text-[10px] font-bold rounded transition-colors flex items-center justify-center gap-2"
                          >
                            <Icon name="vertical_align_bottom" className="text-xs" /> Orient Face to Bed
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {/* Quick Uniform Toggle for Scale */}
                        {objectTool === 'scale' && (
                          <div className="flex items-center justify-end mb-1">
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 select-none">Uniform Scaling</span>
                              <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${uniformScale ? 'bg-primary border-primary' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600'}`}>
                                {uniformScale && <Icon name="check" className="text-[10px] text-white font-bold" />}
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
                            <div key={axis} className="flex items-center gap-2 group">
                              <div className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[9px] font-bold text-slate-500 uppercase">
                                {axis}
                              </div>
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  step={objectTool === 'rotate' ? 15 : objectTool === 'scale' ? 0.1 : 1}
                                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 pr-6 text-right text-xs font-mono text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all appearance-none"
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
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-medium pointer-events-none select-none bg-transparent">
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
              )}

              <div className="border-t border-slate-100 dark:border-slate-800 my-4"></div>

              {/* Cross Section Analysis */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <Icon name="layers" className="text-xs" /> Cross-Section
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={isClipping} onChange={(e) => setIsClipping(e.target.checked)} />
                    <div className="w-7 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                {isClipping && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="text-[10px] text-slate-500 font-medium">Cut Height</span>
                      <span className="font-mono text-primary font-bold text-xs">{clippingHeight.toFixed(1)}mm</span>
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
                    <div className="flex justify-between text-[9px] text-slate-400 mt-1 font-mono">
                      <span>0mm</span>
                      <span>{sliderMaxHeight.toFixed(0)}mm</span>
                    </div>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Icon name="inbox" className="text-3xl mb-1 opacity-50" />
              <span className="text-[10px] font-medium">No Model Selected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};