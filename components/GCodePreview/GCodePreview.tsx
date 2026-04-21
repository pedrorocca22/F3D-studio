/**
 * GCodePreview.tsx
 * Renders a 3D G-code toolpath visualisation inside a Three.js Canvas.
 * Supports FDM (T0), Syringe (T1), UV (T2) toolhead color-coding
 * AND per-line-type coloring (External perimeter, Infill, Support, etc.)
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Icon } from '../Icon';

// ── Three.js JSX element declarations ─────────────────────────────────────────
declare global {
    namespace JSX {
        interface IntrinsicElements {
            mesh: any; instancedMesh: any; cylinderGeometry: any; sphereGeometry: any;
            lineSegments: any; lineBasicMaterial: any; planeGeometry: any;
            meshStandardMaterial: any; gridHelper: any; ambientLight: any;
            directionalLight: any; fog: any; group: any;
            bufferGeometry: any; bufferAttribute: any;
        }
    }
}

// ── Color mode ────────────────────────────────────────────────────────────────
export type ColorMode = 'toolhead' | 'linetype';

// ── Color by toolhead ─────────────────────────────────────────────────────────
export const TOOLHEAD_COLOR: Record<string, string> = {
    T0: '#14b8a6',   // teal   – FDM
    T1: '#f59e0b',   // amber  – syringe
    T2: '#8b5cf6',   // violet – UV
};

// ── Color by PrusaSlicer line type ────────────────────────────────────────────
export const LINE_TYPE_COLOR: Record<string, string> = {
    'External perimeter':           '#ef4444',  // red
    'Perimeter':                    '#f97316',  // orange
    'Overhang perimeter':           '#fb923c',  // light orange
    'Internal infill':              '#eab308',  // yellow
    'Solid infill':                 '#22c55e',  // green
    'Top solid infill':             '#16a34a',  // dark green
    'Bridge infill':                '#3b82f6',  // blue
    'Support material':             '#a855f7',  // purple
    'Support material interface':   '#c084fc',  // light purple
    'Skirt/Brim':                   '#94a3b8',  // slate
    'Unknown':                      '#64748b',  // dark slate
};

// ── Human-readable labels for legend ─────────────────────────────────────────
export const LINE_TYPE_LABELS: [string, string][] = [
    ['External perimeter',          'Ext. Perimeter'],
    ['Perimeter',                   'Perimeter'],
    ['Overhang perimeter',          'Overhang'],
    ['Internal infill',             'Infill'],
    ['Solid infill',                'Solid Infill'],
    ['Top solid infill',            'Top Solid'],
    ['Bridge infill',               'Bridge'],
    ['Support material',            'Support'],
    ['Support material interface',  'Support I/F'],
    ['Skirt/Brim',                  'Skirt/Brim'],
];

const DEFAULT_COLOR = '#94a3b8';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Move {
    x: number; y: number; z: number;
    extrude: boolean;
    layer: number;
    toolhead: string;
    lineType: string;   // PrusaSlicer "; TYPE:xxx" value
    moveIndex: number;
}

export interface ParsedGCode {
    moves: Move[];
    layerCount: number;
    bbox: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
    usedLineTypes: Set<string>;
    usedToolheads: Set<string>;
    layerHeights: number[]; // Mapping of layer index (1-based) to Z height
    layerMoveIndices: number[]; // Index of the first move of each layer in the moves array
}
/** Interface for the current layer's raw G-code lines */
export interface LayerLines {
    lines: string[];
    lineStartIndex: number;
}

interface ExtrusionData {
    color: string;
    matrices: THREE.Matrix4[];
    jointMatrices: THREE.Matrix4[];
    countsByLayer: number[];
    jointCountsByLayer: number[];
    moveIndices: number[]; // moveIndex for each instance to allow sub-layer filtering
}

interface GeometryData {
    extrusions: ExtrusionData[];
    travelPoints: Float32Array;
    travelCountsByLayer: number[];
    travelMoveIndices: number[];
}

// ── Parser ────────────────────────────────────────────────────────────────────
export function parseGCode(raw: string): ParsedGCode {
    const lines = raw.split('\n');
    const moves: Move[] = [];

    let cx = 0, cy = 0, cz = 0;
    let activeToolhead = 'T0';
    let activeLineType = 'Unknown';
    let currentLayer = 0;
    let prevE = 0;
    let relativeE = false;

    const knownZ: number[] = [];
    let maxSeenLayer = 0;
    const bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: 0, maxZ: -Infinity };
    const usedLineTypes = new Set<string>();
    const usedToolheads = new Set<string>(['T0']);
    const layerMoveIndices: number[] = [];

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        // Read PrusaSlicer TYPE comment BEFORE stripping inline comments
        const typeMatch = rawLine.match(/;\s*TYPE\s*:\s*(.+)/i);
        if (typeMatch) {
            activeLineType = typeMatch[1].trim();
            usedLineTypes.add(activeLineType);
        }

        const line = rawLine.split(';')[0].trim();
        if (!line) continue;

        if (/^T[0-9]+$/.test(line)) {
            activeToolhead = line;
            usedToolheads.add(line);
            continue;
        }

        if (line.startsWith('M83')) { relativeE = true; continue; }
        if (line.startsWith('M82')) { relativeE = false; continue; }
        if (!line.startsWith('G0') && !line.startsWith('G1') && !line.startsWith('G92')) continue;

        if (line.startsWith('G92')) {
            const eMatch = line.match(/E([-\d.]+)/);
            if (eMatch) prevE = parseFloat(eMatch[1]);
            continue;
        }

        const xM = line.match(/X([-\d.]+)/);
        const yM = line.match(/Y([-\d.]+)/);
        const zM = line.match(/Z([-\d.]+)/);
        const eM = line.match(/E([-\d.]+)/);

        const nx = xM ? parseFloat(xM[1]) : cx;
        const ny = yM ? parseFloat(yM[1]) : cy;
        const nz = zM ? parseFloat(zM[1]) : cz;

        let extrude = false;
        if (eM) {
            const eVal = parseFloat(eM[1]);
            if (relativeE) { extrude = eVal > 0; }
            else { extrude = eVal > prevE; prevE = eVal; }
        }

        const prevLayer = currentLayer;
        // Assign layer only when actual material is being extruded (ignores Z-hops)
        if (extrude) {
            let found = false;
            for (let j = 0; j < knownZ.length; j++) {
                if (Math.abs(knownZ[j] - nz) < 0.005) { found = true; currentLayer = j + 1; break; }
            }
            if (!found) {
                knownZ.push(nz);
                knownZ.sort((a, b) => a - b);
                currentLayer = knownZ.findIndex(z => Math.abs(z - nz) < 0.005) + 1;
            }
            if (currentLayer > maxSeenLayer) maxSeenLayer = currentLayer;
            
            // Record the first move index for this layer
            if (currentLayer > prevLayer && layerMoveIndices[currentLayer] === undefined) {
                layerMoveIndices[currentLayer] = moves.length;
            }
        }

        moves.push({ x: nx, y: ny, z: nz, extrude, layer: currentLayer, toolhead: activeToolhead, lineType: activeLineType, moveIndex: i });

        if (extrude) {
            bbox.minX = Math.min(bbox.minX, nx); bbox.maxX = Math.max(bbox.maxX, nx);
            bbox.minY = Math.min(bbox.minY, ny); bbox.maxY = Math.max(bbox.maxY, ny);
            bbox.maxZ = Math.max(bbox.maxZ, nz);
        }

        cx = nx; cy = ny; cz = nz;
    }

    if (!isFinite(bbox.minX)) { bbox.minX = 0; bbox.maxX = 100; bbox.minY = 0; bbox.maxY = 100; }
    
    // Fill gaps in layerMoveIndices
    for (let i = 1; i <= maxSeenLayer; i++) {
        if (layerMoveIndices[i] === undefined) {
            layerMoveIndices[i] = layerMoveIndices[i-1] || 0;
        }
    }
    layerMoveIndices[maxSeenLayer + 1] = moves.length;

    // Map of layer index to physical Z height
    const layerHeights = [0, ...knownZ]; // layer 1 is knownZ[0], etc.

    return { moves, layerCount: maxSeenLayer, bbox, usedLineTypes, usedToolheads, layerHeights, layerMoveIndices };
}

// ── Geometry builder ──────────────────────────────────────────────────────────
function buildGeometries(parsed: ParsedGCode, nozzleDiameter = 0.4, colorMode: ColorMode = 'toolhead'): GeometryData {
    const getColor = (m: Move): string => {
        if (colorMode === 'linetype') return LINE_TYPE_COLOR[m.lineType] ?? DEFAULT_COLOR;
        return TOOLHEAD_COLOR[m.toolhead] ?? DEFAULT_COLOR;
    };

    const allColors = colorMode === 'linetype'
        ? Object.values(LINE_TYPE_COLOR)
        : [...Object.values(TOOLHEAD_COLOR), DEFAULT_COLOR];

    const buckets: Record<string, THREE.Matrix4[]> = {};
    const jointBuckets: Record<string, THREE.Matrix4[]> = {};
    const moveIndexBuckets: Record<string, number[]> = {};
    const countsByLayer: Record<string, number[]> = {};
    const jointCountsByLayer: Record<string, number[]> = {};

    for (const c of allColors) {
        countsByLayer[c] = new Array(parsed.layerCount + 1).fill(0);
        jointCountsByLayer[c] = new Array(parsed.layerCount + 1).fill(0);
        moveIndexBuckets[c] = [];
    }

    const travelCountsByLayer = new Array(parsed.layerCount + 1).fill(0);
    const travelList: number[] = [];
    const travelMoveIndices: number[] = [];

    let prev: Move | null = null;
    const currentCounts: Record<string, number> = {};
    const currentJointCounts: Record<string, number> = {};
    for (const c of allColors) {
        currentCounts[c] = 0;
        currentJointCounts[c] = 0;
    }

    let currentTravelCount = 0;
    let currentLayerTracking = 0;

    const addTube = (key: string, p1: THREE.Vector3, p2: THREE.Vector3, originalMoveIndex: number) => {
        const diff = new THREE.Vector3().subVectors(p2, p1);
        const len = diff.length();
        if (len < 0.0001) return;

        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.clone().normalize());
        const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(nozzleDiameter, len, nozzleDiameter));

        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(mat);
        moveIndexBuckets[key].push(originalMoveIndex);
        currentCounts[key] = buckets[key].length;

        // Sphere joint at the end of segment for continuity
        const jointMat = new THREE.Matrix4().compose(p2, new THREE.Quaternion(), new THREE.Vector3(nozzleDiameter, nozzleDiameter, nozzleDiameter));
        if (!jointBuckets[key]) jointBuckets[key] = [];
        jointBuckets[key].push(jointMat);
        currentJointCounts[key] = jointBuckets[key].length;
    };

    for (let i = 0; i < parsed.moves.length; i++) {
        const m = parsed.moves[i];
        while (currentLayerTracking < m.layer && currentLayerTracking <= parsed.layerCount) {
            for (const k of allColors) {
                countsByLayer[k][currentLayerTracking] = currentCounts[k];
                jointCountsByLayer[k][currentLayerTracking] = currentJointCounts[k];
            }
            travelCountsByLayer[currentLayerTracking] = currentTravelCount;
            currentLayerTracking++;
        }

        if (prev) {
            const p1 = new THREE.Vector3(prev.x, prev.z, prev.y);
            const p2 = new THREE.Vector3(m.x, m.z, m.y);
            if (m.extrude) {
                addTube(getColor(m), p1, p2, i);
            } else {
                travelList.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                travelMoveIndices.push(i, i); // Two points per segment
                currentTravelCount += 2;
            }
        }
        prev = m;
    }

    while (currentLayerTracking <= parsed.layerCount) {
        for (const k of allColors) {
            countsByLayer[k][currentLayerTracking] = currentCounts[k];
            jointCountsByLayer[k][currentLayerTracking] = currentJointCounts[k];
        }
        travelCountsByLayer[currentLayerTracking] = currentTravelCount;
        currentLayerTracking++;
    }

    const extrusions: ExtrusionData[] = Object.keys(buckets).map(color => ({
        color,
        matrices: buckets[color],
        jointMatrices: jointBuckets[color] || [],
        countsByLayer: countsByLayer[color],
        jointCountsByLayer: jointCountsByLayer[color] || [],
        moveIndices: moveIndexBuckets[color],
    }));

    return { extrusions, travelPoints: new Float32Array(travelList), travelCountsByLayer, travelMoveIndices };
}

function findInstanceCount(moveIndices: number[], maxMove: number) {
    if (!moveIndices || moveIndices.length === 0) return 0;
    let low = 0, high = moveIndices.length - 1;
    let index = -1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (moveIndices[mid] <= maxMove) {
            index = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return index + 1;
}

// ── TubeSegments renderer ─────────────────────────────────────────────────────
function TubeSegments({ extrusion, count }: { extrusion: ExtrusionData; count: number }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const jointRef = useRef<THREE.InstancedMesh>(null);

    useEffect(() => {
        if (!meshRef.current) return;
        for (let i = 0; i < extrusion.matrices.length; i++) meshRef.current.setMatrixAt(i, extrusion.matrices[i]);
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [extrusion.matrices]);

    useEffect(() => {
        if (!jointRef.current) return;
        for (let i = 0; i < extrusion.jointMatrices.length; i++) jointRef.current.setMatrixAt(i, extrusion.jointMatrices[i]);
        jointRef.current.instanceMatrix.needsUpdate = true;
    }, [extrusion.jointMatrices]);

    useEffect(() => { if (meshRef.current) meshRef.current.count = count; }, [count]);
    useEffect(() => { if (jointRef.current) jointRef.current.count = count; }, [count]); // Joint count matches segment count

    return (
        <group>
            <instancedMesh ref={meshRef} args={[undefined, undefined, extrusion.matrices.length]} frustumCulled={false}>
                <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
                <meshStandardMaterial color={extrusion.color} roughness={0.3} metalness={0} />
            </instancedMesh>
            <instancedMesh ref={jointRef} args={[undefined, undefined, extrusion.jointMatrices.length]} frustumCulled={false}>
                <sphereGeometry args={[0.5, 8, 8]} />
                <meshStandardMaterial color={extrusion.color} roughness={0.3} metalness={0} />
            </instancedMesh>
        </group>
    );
}

// ── TravelSegments renderer ───────────────────────────────────────────────────
function TravelSegments({ points, count, visible }: { points: Float32Array; count: number; visible: boolean }) {
    const geoRef = useRef<THREE.BufferGeometry>(null);
    useEffect(() => { if (geoRef.current) geoRef.current.setDrawRange(0, count); }, [count]);
    if (points.length === 0) return null;
    return (
        <lineSegments visible={visible}>
            <bufferGeometry ref={geoRef}>
                <bufferAttribute attach="attributes-position" array={points} itemSize={3} count={points.length / 3} />
            </bufferGeometry>
            <lineBasicMaterial color="#ef4444" opacity={0.6} transparent linewidth={1} />
        </lineSegments>
    );
}

// ── Wireframe renderer ────────────────────────────────────────────────────────
function WireSegments({ extrusion, count }: { extrusion: ExtrusionData; count: number }) {
    const geoRef = useRef<THREE.BufferGeometry>(null);

    // Build the points for wireframe
    const points = useMemo(() => {
        const pts = new Float32Array(extrusion.matrices.length * 6); // 2 points * 3 coords
        for (let i = 0; i < extrusion.matrices.length; i++) {
            const mat = extrusion.matrices[i];
            const p1 = new THREE.Vector3(0, -0.5, 0).applyMatrix4(mat);
            const p2 = new THREE.Vector3(0, 0.5, 0).applyMatrix4(mat);
            pts[i * 6 + 0] = p1.x; pts[i * 6 + 1] = p1.y; pts[i * 6 + 2] = p1.z;
            pts[i * 6 + 3] = p2.x; pts[i * 6 + 4] = p2.y; pts[i * 6 + 5] = p2.z;
        }
        return pts;
    }, [extrusion.matrices]);

    useEffect(() => {
        if (geoRef.current) geoRef.current.setDrawRange(0, count * 2);
    }, [count]);

    return (
        <lineSegments>
            <bufferGeometry ref={geoRef}>
                <bufferAttribute attach="attributes-position" array={points} itemSize={3} count={points.length / 3} />
            </bufferGeometry>
            <lineBasicMaterial color={extrusion.color} linewidth={1} />
        </lineSegments>
    );
}

// ── GCodeScene (embedded in Viewport's Canvas) ────────────────────────────────
export function GCodeScene({
    parsed, upToLayer, upToMoveIndex, nozzleDiameter = 0.4, showTravel = false, colorMode = 'toolhead', renderMode = 'solid'
}: {
    parsed: ParsedGCode; upToLayer: number; upToMoveIndex?: number;
    nozzleDiameter?: number; showTravel?: boolean; colorMode?: ColorMode;
    renderMode?: 'solid' | 'wire';
}) {
    const geoData = useMemo(() => buildGeometries(parsed, nozzleDiameter, colorMode), [parsed, nozzleDiameter, colorMode]);

    const centerOffset = useMemo(() => {
        return { x: -50, y: -50 };
    }, []);

    const safeLayer = Math.min(Math.max(0, upToLayer), parsed.layerCount);
    
    // Determine the global move index limit
    // If upToMoveIndex is provided, it's relative to the start of 'upToLayer'
    const absoluteMoveLimit = useMemo(() => {
        if (upToMoveIndex === undefined) return parsed.moves.length;
        const layerStart = parsed.layerMoveIndices[safeLayer] || 0;
        const layerEnd = parsed.layerMoveIndices[safeLayer + 1] || parsed.moves.length;
        const layerMoveCount = layerEnd - layerStart;
        return layerStart + Math.floor(upToMoveIndex);
    }, [parsed, safeLayer, upToMoveIndex]);

    return (
        <group position={[centerOffset.x, 0, centerOffset.y]}>
            {geoData.extrusions.map((ext, i) => {
                const count = upToMoveIndex !== undefined 
                    ? findInstanceCount(ext.moveIndices, absoluteMoveLimit)
                    : ext.countsByLayer[safeLayer];

                if (renderMode === 'wire') {
                    return (
                        <WireSegments
                            key={`wire-${colorMode}-${ext.color}-${i}`}
                            extrusion={ext}
                            count={count}
                        />
                    );
                }

                return (
                    <TubeSegments
                        key={`solid-${colorMode}-${ext.color}-${i}`}
                        extrusion={ext}
                        count={count}
                    />
                );
            })}
            <TravelSegments
                points={geoData.travelPoints}
                count={upToMoveIndex !== undefined 
                    ? findInstanceCount(geoData.travelMoveIndices, absoluteMoveLimit)
                    : geoData.travelCountsByLayer[safeLayer]
                }
                visible={showTravel}
            />
        </group>
    );
}

export interface LayerBoundary {
  start: number;
  end: number;
}

export function useGCodeLoader(gcodeUrl: string | null, currentLayer?: number) {
    const [parsed, setParsed] = useState<ParsedGCode | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [layerLines, setLayerLines] = useState<LayerLines | null>(null);
    const [gcodeRaw, setGcodeRaw] = useState<string>('');
    const [allLines, setAllLines] = useState<string[]>([]);
    const [layerMap, setLayerMap] = useState<LayerBoundary[]>([]);

    useEffect(() => {
        if (!gcodeUrl) { 
            setParsed(null); setLoading(false); setError(null); 
            setGcodeRaw(''); setAllLines([]); setLayerLines(null); setLayerMap([]);
            return; 
        }
        setLoading(true); setError(null); setParsed(null);
        fetch(gcodeUrl)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
            .then(raw => { 
                setGcodeRaw(raw);
                const lines = raw.split('\n');
                setAllLines(lines);
                
                const result = parseGCode(raw); 
                setParsed(result); 
                
                // Pre-calculate layer boundaries
                const boundaries: LayerBoundary[] = [];
                let currentTrackedLayer = -1;
                let currentStart = -1;
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const layerMatch = line.match(/;LAYER:(\d+)/i);
                    const layerChangeMarker = line.includes(';LAYER_CHANGE');
                    
                    if (layerMatch || layerChangeMarker) {
                        // Close previous boundary
                        if (currentTrackedLayer >= 0 && currentStart !== -1) {
                            boundaries[currentTrackedLayer] = { start: currentStart, end: i - 1 };
                        }
                        
                        if (layerMatch) currentTrackedLayer = parseInt(layerMatch[1]);
                        else currentTrackedLayer++;
                        
                        currentStart = i;
                    }
                }
                // Close the last one
                if (currentTrackedLayer >= 0 && currentStart !== -1) {
                    boundaries[currentTrackedLayer] = { start: currentStart, end: lines.length - 1 };
                }
                setLayerMap(boundaries);
                setLoading(false); 
            })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [gcodeUrl]);

    // Extract lines for the current layer when currentLayer changes
    useEffect(() => {
        if (!allLines.length || currentLayer === undefined || currentLayer === null) {
            setLayerLines(null);
            return;
        }

        const boundary = layerMap[currentLayer];
        if (boundary) {
            setLayerLines({
                lines: allLines.slice(boundary.start, boundary.end + 1),
                lineStartIndex: boundary.start
            });
        } else {
            setLayerLines(null);
        }
    }, [allLines, layerMap, currentLayer]);

    return { parsed, loading, error, layerLines, gcodeRaw, allLines, layerMap };
}

// ── Standalone GCodePreview component (legacy / experiments panel) ────────────
interface GCodePreviewProps {
    gcodeUrl: string;
    jobId: string;
    layerCount: number;
    initialNozzleDiameter?: number;
    onClose: () => void;
}

export const GCodePreview: React.FC<GCodePreviewProps> = ({ gcodeUrl, jobId, layerCount, initialNozzleDiameter = 0.4, onClose }) => {
    const [parsed, setParsed] = useState<ParsedGCode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [upToLayer, setUpToLayer] = useState(layerCount);
    const [nozzleDiameter, setNozzleDiameter] = useState(initialNozzleDiameter);
    const [showTravel, setShowTravel] = useState(false);
    const [colorMode, setColorMode] = useState<ColorMode>('toolhead');

    useEffect(() => {
        setLoading(true); setError(null);
        fetch(gcodeUrl)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
            .then(raw => { const result = parseGCode(raw); setParsed(result); setUpToLayer(result.layerCount); setLoading(false); })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [gcodeUrl]);

    return (
        <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900 flex flex-col">
            <div className="flex-1 relative h-full">
                <div className="absolute inset-4 z-0 rounded-xl overflow-hidden shadow-inner">
                    {parsed && !loading && (
                        <Canvas camera={{ position: [150, 120, 150], fov: 45 }} shadows>
                            <fog attach="fog" args={['#f8fafc', 200, 500]} />
                            <ambientLight intensity={0.4} />
                            <directionalLight position={[50, 50, 50]} intensity={1.0} castShadow />
                            <Environment preset="city" />
                            <GCodeScene parsed={parsed} upToLayer={upToLayer} nozzleDiameter={nozzleDiameter} showTravel={showTravel} colorMode={colorMode} />
                            <OrbitControls makeDefault />
                        </Canvas>
                    )}
                </div>
                <button onClick={onClose} className="absolute top-8 right-8 z-20 px-4 py-2 rounded-lg bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-primary transition-all font-bold text-[10px] uppercase cursor-pointer">
                    <Icon name="arrow_back" className="text-base" /> Return to Designer
                </button>
                {loading && <div className="absolute inset-4 flex items-center justify-center bg-slate-100/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 rounded-xl"><div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
                {error && <div className="absolute inset-4 flex items-center justify-center z-10 rounded-xl"><div className="text-center text-red-500 p-8 bg-white dark:bg-slate-800 rounded-xl border border-red-200"><Icon name="error_outline" className="text-5xl mb-3" /><p className="text-xs mb-4">{error}</p><button onClick={onClose} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded text-xs font-bold uppercase">Go Back</button></div></div>}
            </div>
        </div>
    );
};
