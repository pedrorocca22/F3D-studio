import React, { Suspense, useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { Icon } from '../Icon';
import { Canvas, useLoader, useThree, ThreeEvent, useFrame } from '@react-three/fiber';
import { OrbitControls, ContactShadows, useCursor, TransformControls, Environment, Grid } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { TransformData, ModelData, AdvancedSliceSettings, SliceSegment, GlobalSettings } from '../../types';
import { ThreeElements } from '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      planeGeometry: any;
      meshStandardMaterial: any;
      gridHelper: any;
      lineSegments: any;
      edgesGeometry: any;
      lineBasicMaterial: any;
      axesHelper: any;
      meshPhysicalMaterial: any;
      meshBasicMaterial: any;
      fog: any;
      ambientLight: any;
      directionalLight: any;
      [elemName: string]: any;
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
  onCloneModel: (id: string) => void;
  onArrayModels: (spacing: number) => void;
  onFileUpload?: (file: File) => void;
  isAdvancedSliceMode?: boolean;
  globalSettings: GlobalSettings;
}

// --- CLIPPING PLANE LOGIC ---
const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

const BUILD_VOLUME = {
  width: 120.96,
  depth: 68.04,
  height: 150
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

type CameraMode = 'orbit' | 'pan';
type ObjectTool = 'translate' | 'rotate' | 'scale' | 'orient' | 'modify';
type ViewMode = 'solid' | 'wireframe' | 'transparent';

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
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{model.size?.z?.toFixed(1) || '-'}</span>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded p-1.5 border border-slate-100 dark:border-slate-700/50">
          <span className="block text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Size Z</span>
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{model.size?.y?.toFixed(1) || '-'}</span>
        </div>
      </div>

      {/* Settings Summary */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-slate-500 flex items-center gap-1.5 font-medium"><Icon name="timer" className="text-[14px] text-slate-400" /> Exposure</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[11px]">{model.settings.exposureTime}s</span>
        </div>
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-slate-500 flex items-center gap-1.5 font-medium"><Icon name="flash_on" className="text-[14px] text-slate-400" /> Intensity</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-[11px]">{model.settings.lightIntensity} mW</span>
        </div>
      </div>

      {/* Advanced Slice Badge */}
      {isAdv ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg p-2 mt-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Advanced Slice Active</span>
          </div>

          <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1 border-t border-red-100 dark:border-red-900/30 pt-2">
            {model.advancedSettings.segments.map((seg, i) => {
              const prevTop = i > 0 ? model.advancedSettings.segments[i - 1].topLimit : adhesionOffset;
              const color = getSegmentColor(i);
              return (
                <div key={seg.id} className="flex justify-between items-center text-[10px] text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }}></div>
                    <span className="font-mono">S{i + 1}: {prevTop.toFixed(2)}-{seg.topLimit.toFixed(2)}mm</span>
                  </div>
                  <span className="font-mono text-slate-500">{seg.exposureTime}s / {seg.lightIntensity}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const BuildPlate = () => {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[BUILD_VOLUME.width, BUILD_VOLUME.depth]} />
        <meshStandardMaterial
          color="#f8fafc"
          transparent
          opacity={0.8}
          roughness={0.1}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <gridHelper
        args={[Math.max(BUILD_VOLUME.width, BUILD_VOLUME.depth) * 2, 20, 0x94a3b8, 0xe2e8f0]}
        position={[0, 0.05, 0]}
      />
      <group position={[0, BUILD_VOLUME.height / 2, 0]}>
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(BUILD_VOLUME.width, BUILD_VOLUME.height, BUILD_VOLUME.depth)]} />
          <lineBasicMaterial color="#cbd5e1" linewidth={1} />
        </lineSegments>
      </group>
      <axesHelper args={[20]} position={[-BUILD_VOLUME.width / 2 - 10, 0, BUILD_VOLUME.depth / 2 + 10]} />
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
      const newPos = new THREE.Vector3().copy(focusTarget).add(dir.multiplyScalar(80));

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
}

const Model: React.FC<ModelProps> = ({
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
  clippingHeight
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
                       gl_FragColor = vec4(mix(gl_FragColor.rgb, segColor, 0.6), gl_FragColor.a);
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
    if (meshRef.current) {
      // Force update matrix to ensure bounding box is accurate to current transforms
      meshRef.current.position.set(transformData.position.x, transformData.position.y, transformData.position.z);
      meshRef.current.rotation.set(
        THREE.MathUtils.degToRad(transformData.rotation.x),
        THREE.MathUtils.degToRad(transformData.rotation.y),
        THREE.MathUtils.degToRad(transformData.rotation.z)
      );
      meshRef.current.scale.set(transformData.scale.x, transformData.scale.y, transformData.scale.z);
      meshRef.current.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(meshRef.current);
      const size = new THREE.Vector3();
      box.getSize(size);

      // Notify parent of size update via ref to avoid dependency loop
      onUpdateSizeRef.current({ x: size.x, y: size.y, z: size.z });

      checkBounds();
    }
  }, [geometry, transformData, checkBounds]);

  const adjustPositionToFloor = (updateIfChanged = true) => {
    if (!meshRef.current || !geometry.boundingBox) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(transformData.rotation.x),
      THREE.MathUtils.degToRad(transformData.rotation.y),
      THREE.MathUtils.degToRad(transformData.rotation.z)
    ));
    const scale = new THREE.Vector3(transformData.scale.x, transformData.scale.y, transformData.scale.z);
    matrix.compose(new THREE.Vector3(0, 0, 0), quaternion, scale);

    const box = geometry.boundingBox;
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    let minY = Infinity;
    corners.forEach(p => { p.applyMatrix4(matrix); if (p.y < minY) minY = p.y; });

    const requiredY = -minY;
    if (updateIfChanged && Math.abs(requiredY - transformData.position.y) > 0.001) {
      onTransformChange({ ...transformData, position: { ...transformData.position, y: requiredY } });
    }
  };

  useEffect(() => { adjustPositionToFloor(); }, [transformData.scale, transformData.rotation]);
  useEffect(() => {
    const { x, y, z } = transformData.position;
    if (x === 0 && y === 0 && z === 0) adjustPositionToFloor();
  }, [transformData.position]);

  useEffect(() => {
    if (meshRef.current) {
      const isDragging = transformControlsRef.current?.dragging;
      if (!isDragging) {
        meshRef.current.scale.set(transformData.scale.x, transformData.scale.y, transformData.scale.z);
        meshRef.current.rotation.set(
          THREE.MathUtils.degToRad(transformData.rotation.x),
          THREE.MathUtils.degToRad(transformData.rotation.y),
          THREE.MathUtils.degToRad(transformData.rotation.z)
        );
        meshRef.current.position.set(transformData.position.x, transformData.position.y, transformData.position.z);
      }
    }
  }, [transformData, geometry]);

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

      const tempMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
      tempMesh.scale.copy(meshRef.current.scale);
      tempMesh.quaternion.copy(newQuat);
      tempMesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tempMesh);

      onTransformChange({
        ...transformData,
        rotation: {
          x: Math.round(THREE.MathUtils.radToDeg(newEuler.x)),
          y: Math.round(THREE.MathUtils.radToDeg(newEuler.y)),
          z: Math.round(THREE.MathUtils.radToDeg(newEuler.z)),
        },
        position: { ...transformData.position, y: -box.min.y }
      });
    }
  };

  const handleTransformComplete = () => {
    if (meshRef.current) {
      onTransformChange({
        ...transformData,
        position: { x: meshRef.current.position.x, y: meshRef.current.position.y, z: meshRef.current.position.z },
        rotation: {
          x: Math.round(THREE.MathUtils.radToDeg(meshRef.current.rotation.x)),
          y: Math.round(THREE.MathUtils.radToDeg(meshRef.current.rotation.y)),
          z: Math.round(THREE.MathUtils.radToDeg(meshRef.current.rotation.z)),
        },
        scale: { x: meshRef.current.scale.x, y: meshRef.current.scale.y, z: meshRef.current.scale.z }
      });
    }
    // Re-check one last time to be sure
    checkBounds();
  };

  return (
    <>
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
          color={isOutOfBounds ? "#ef4444" : (isSelected ? "#f67104" : "#94a3b8")}
          roughness={0.4}
          reflectivity={0.5}
          clearcoat={1.0}
          clearcoatRoughness={0.7}
          specularIntensity={1.0}
          metalness={0.1}
          envMapIntensity={1.0}
          wireframe={viewMode === 'wireframe'}
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
      {/* 1. Render Back faces to increment stencil buffer where object is clipped */}
      {isClipping && isVisible && (
        <mesh
          geometry={geometry}
          position={[transformData.position.x, transformData.position.y, transformData.position.z]}
          rotation={[
            THREE.MathUtils.degToRad(transformData.rotation.x),
            THREE.MathUtils.degToRad(transformData.rotation.y),
            THREE.MathUtils.degToRad(transformData.rotation.z)
          ]}
          scale={[transformData.scale.x, transformData.scale.y, transformData.scale.z]}
        >
          <meshBasicMaterial
            color="black"
            side={THREE.BackSide}
            clippingPlanes={[clippingPlane]}
            stencilWrite={true}
            stencilRef={0} // Constant value to compare against/write? Actually we want to Increment
            stencilFunc={THREE.AlwaysStencilFunc}
            stencilFail={THREE.IncrementWrapStencilOp}
            stencilZFail={THREE.IncrementWrapStencilOp}
            stencilZPass={THREE.IncrementWrapStencilOp}
            colorWrite={false}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* 2. Render Front faces to decrement stencil buffer */}
      {isClipping && isVisible && (
        <mesh
          geometry={geometry}
          position={[transformData.position.x, transformData.position.y, transformData.position.z]}
          rotation={[
            THREE.MathUtils.degToRad(transformData.rotation.x),
            THREE.MathUtils.degToRad(transformData.rotation.y),
            THREE.MathUtils.degToRad(transformData.rotation.z)
          ]}
          scale={[transformData.scale.x, transformData.scale.y, transformData.scale.z]}
        >
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

      {/* 3. Render the Cap Plane (where Stencil != 0) */}
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
          object={meshRef}
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
  globalSettings
}) => {
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
    const modes: ViewMode[] = ['solid', 'wireframe', 'transparent'];
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

  // Dynamic max height calculation — use real model Z height
  const sliderMaxHeight = useMemo(() => {
    if (!selectedModel?.size) return BUILD_VOLUME.height;
    const modelHeight = selectedModel.size.y || 0;
    // Add 5% padding, but never exceed build volume
    return Math.min(Math.max(modelHeight * 1.05, 0.5), BUILD_VOLUME.height);
  }, [selectedModel]);

  const handleUpdateSegmentSlider = (index: number, newTop: number) => {
    if (!selectedModel) return;
    const segments = [...selectedModel.advancedSettings.segments];
    if (segments[index]) {
      segments[index] = { ...segments[index], topLimit: newTop };
      onUpdateAdvancedSettings({ ...selectedModel.advancedSettings, segments });
    }
  };

  return (
    <main className="flex-1 relative bg-slate-50 dark:bg-slate-900 overflow-hidden flex">

      {/* Main Viewport Area */}
      <div className="flex-1 relative h-full">
        {/* Render Canvas */}
        <div className="absolute inset-4 z-0 rounded-xl overflow-hidden shadow-inner bg-slate-100/50 dark:bg-slate-800/20 transition-all">
          <Canvas
            shadows
            camera={{ position: [100, 100, 150], fov: 45 }}
            onPointerMissed={onMissed}
            gl={{ localClippingEnabled: true }}
          >
            <fog attach="fog" args={['#f8fafc', 200, 500]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[50, 50, 50]} intensity={1.0} castShadow shadow-bias={-0.0001} />
            <Environment preset="city" />

            {/* Render Clipping Plane Visualizer if enabled */}
            {isClipping && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, clippingHeight, 0]}>
                <planeGeometry args={[BUILD_VOLUME.width, BUILD_VOLUME.depth]} />
                <meshBasicMaterial color="#ff0000" opacity={0.1} transparent side={THREE.DoubleSide} depthWrite={false} />
                <lineSegments>
                  <edgesGeometry args={[new THREE.PlaneGeometry(BUILD_VOLUME.width, BUILD_VOLUME.depth)]} />
                  <lineBasicMaterial color="#ff0000" opacity={0.5} transparent />
                </lineSegments>
              </mesh>
            )}

            <BuildPlate />

            <Suspense fallback={null}>
              {models.map(model => {
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
                  />
                );
              })}
            </Suspense>

            <ContactShadows position={[0, 0.1, 0]} opacity={0.4} scale={200} blur={2.5} far={4} />
            <SceneControls cameraMode={cameraMode} zoomTrigger={zoomTrigger} />
            <CameraManager viewTrigger={viewTrigger} focusTarget={focusTarget} />
          </Canvas>

          {isAdvancedSliceMode && selectedModel && (
            <SliceSlider
              segments={selectedModel.advancedSettings.segments}
              maxHeight={sliderMaxHeight}
              onUpdateSegment={handleUpdateSegmentSlider}
              adhesionOffset={(globalSettings.adhesion?.enabled)
                ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000
                : 0}
            />
          )}

          {models.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div onClick={handleEmptyStateClick} className="text-center bg-white/80 dark:bg-slate-900/80 p-8 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 backdrop-blur-sm pointer-events-auto cursor-pointer hover:border-primary hover:bg-blue-50/50 dark:hover:bg-slate-800 transition-all group max-w-md w-full mx-4">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".stl" multiple className="hidden" />
                <span className="text-primary text-lg font-medium block mb-1">No model loaded</span>
                <span className="text-sm font-normal text-slate-500 block">Click "Upload Model" or drag & drop a file (STL) here</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Center - Camera Views */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md p-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-xl z-20">
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
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Icon name="tune" className="text-lg text-primary" />
            Inspector
          </h2>
          {/* Global View Mode Toggle */}
          <button onClick={cycleViewMode} className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700" title="Toggle View Mode">
            <div className={`w-2.5 h-2.5 rounded-full border box-border ${viewMode === 'solid' ? 'bg-slate-800 border-slate-800 dark:bg-slate-200 dark:border-slate-200' : 'border-slate-400'}`}></div>
            <span className="text-[10px] font-medium text-slate-500 uppercase">{viewMode}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">

          {selectedModel ? (
            <>
              {/* Model Info Section */}
              <section>
                <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
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
                  <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Transform
                  </div>

                  <div className="bg-slate-50/50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-1 mb-3">
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { id: 'translate', icon: 'open_with', label: 'Move' },
                        { id: 'rotate', icon: 'rotate_right', label: 'Rotate' },
                        { id: 'scale', icon: 'aspect_ratio', label: 'Scale' },
                        { id: 'modify', icon: 'build', label: 'Tools' },
                      ].map(tool => (
                        <button
                          key={tool.id}
                          onClick={() => setObjectTool(tool.id as ObjectTool)}
                          className={`flex flex-col items-center justify-center py-2 rounded-lg transition-all ${objectTool === tool.id
                            ? 'bg-white dark:bg-slate-700 shadow-sm text-primary ring-1 ring-slate-200 dark:ring-slate-600'
                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          title={tool.label}
                        >
                          <Icon name={tool.icon} className="text-xl mb-0.5" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Transform Inputs */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm">
                    {objectTool === 'modify' ? (
                      <div className="flex flex-col gap-4">
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
                              className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary outline-none"
                              placeholder="Spacing (mm)"
                            />
                            <button
                              onClick={() => onArrayModels(arraySpacing)}
                              className="h-[34px] px-4 bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white dark:hover:bg-primary border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold rounded transition-all"
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
                            className="w-full py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-slate-600 dark:text-slate-300 text-xs font-bold rounded transition-colors flex items-center justify-center gap-2"
                          >
                            <Icon name="content_copy" className="text-sm" /> Duplication
                          </button>
                          <button
                            onClick={() => selectedModelId && onTransformChange(selectedModelId, { ...selectedModel.transform, position: { x: 0, y: 0, z: 0 } })}
                            className="w-full py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-slate-600 dark:text-slate-300 text-xs font-bold rounded transition-colors flex items-center justify-center gap-2"
                          >
                            <Icon name="center_focus_strong" className="text-sm" /> Center to Build Plate
                          </button>
                          <button
                            onClick={() => setObjectTool('orient')}
                            className="w-full py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:border-primary/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 text-slate-600 dark:text-slate-300 text-xs font-bold rounded transition-colors flex items-center justify-center gap-2"
                          >
                            <Icon name="vertical_align_bottom" className="text-sm" /> Orient Face to Bed
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {/* Quick Uniform Toggle for Scale */}
                        {objectTool === 'scale' && (
                          <div className="flex items-center justify-end mb-2">
                            <label className="flex items-center gap-2 cursor-pointer group">
                              <span className="text-[10px] font-medium text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 select-none">Uniform Scaling</span>
                              <div className={`w-4 h-4 border rounded flex items-center justify-center transition-colors ${uniformScale ? 'bg-primary border-primary' : 'bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600'}`}>
                                {uniformScale && <Icon name="check" className="text-[12px] text-white font-bold" />}
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
                              <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
                                {axis}
                              </div>
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  step={objectTool === 'rotate' ? 15 : objectTool === 'scale' ? 0.1 : 1}
                                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-right text-sm font-mono text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                                  value={value !== undefined ? Number(value).toFixed(objectTool === 'scale' ? 2 : 1) : 0}
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
                                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] text-slate-300 pointer-events-none">
                                  {objectTool === 'rotate' ? 'deg' : objectTool === 'scale' ? 'x' : 'mm'}
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
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Icon name="inbox" className="text-4xl mb-2 opacity-50" />
              <span className="text-xs font-medium">No Model Selected</span>
            </div>
          )}

          <div className="border-t border-slate-100 dark:border-slate-800 my-4"></div>

          {/* Cross Section Analysis */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <Icon name="layers" className="text-sm" /> Cross-Section
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={isClipping} onChange={(e) => setIsClipping(e.target.checked)} />
                <div className="w-9 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            {isClipping && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[10px] text-slate-500 font-medium">Cut Height</span>
                  <span className="font-mono text-primary font-bold">{clippingHeight.toFixed(1)}mm</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="150"
                  step="0.1"
                  value={clippingHeight}
                  onChange={(e) => setClippingHeight(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>0mm</span>
                  <span>150mm</span>
                </div>
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
};