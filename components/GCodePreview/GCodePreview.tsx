/**
 * GCodePreview.tsx
 * Renders a 3D G-code toolpath visualisation inside a Three.js Canvas.
 * Supports FDM (T0), Syringe (T1), UV (T2) toolhead color-coding.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { Icon } from '../Icon';

declare global {
    namespace JSX {
        interface IntrinsicElements {
            mesh: any;
            instancedMesh: any;
            cylinderGeometry: any;
            lineSegments: any;
            lineBasicMaterial: any;
            planeGeometry: any;
            meshStandardMaterial: any;
            gridHelper: any;
            ambientLight: any;
            directionalLight: any;
            group: any;
            bufferGeometry: any;
            bufferAttribute: any;
        }
    }
}

// ── Color mapping by toolhead ──────────────────────────────────────────────────
const TOOLHEAD_COLOR: Record<string, string> = {
    T0: '#14b8a6',  // teal  – FDM
    T1: '#f59e0b',  // amber – syringe
    T2: '#8b5cf6',  // violet – UV
};
const TRAVEL_COLOR = '#374151'; // gray – travel moves (no extrusion)
const DEFAULT_COLOR = '#94a3b8';

// ── G-code parser types ───────────────────────────────────────────────────────
interface Move {
    x: number; y: number; z: number;
    extrude: boolean;   // true = print move, false = travel
    layer: number;
    toolhead: string;   // 'T0' | 'T1' | 'T2'
}

interface ParsedGCode {
    moves: Move[];
    layerCount: number;
    bbox: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parseGCode(raw: string): ParsedGCode {
    const lines = raw.split('\n');
    const moves: Move[] = [];

    let cx = 0, cy = 0, cz = 0;
    let activeToolhead = 'T0';
    let currentLayer = 0;
    let prevE = 0;
    let relativeE = false;
    
    // Track unique Z heights where actual extrusion occurs to robustly build layers
    const knownZ: number[] = [];
    let maxSeenLayer = 0;

    const bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: 0, maxZ: -Infinity };

    for (const rawLine of lines) {
        const line = rawLine.split(';')[0].trim(); // strip comments
        if (!line) continue;

        // Toolhead change
        if (/^T[0-9]+$/.test(line)) {
            activeToolhead = line;
            continue;
        }

        if (line.startsWith('M83')) { relativeE = true; continue; }
        if (line.startsWith('M82')) { relativeE = false; continue; }

        if (!line.startsWith('G0') && !line.startsWith('G1') && !line.startsWith('G92')) continue;

        if (line.startsWith('G92')) {
            // Reset E
            const eMatch = line.match(/E([-\d.]+)/);
            if (eMatch) prevE = parseFloat(eMatch[1]);
            continue;
        }

        // Parse G0/G1
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
            if (relativeE) {
                extrude = eVal > 0;
            } else {
                extrude = eVal > prevE;
                prevE = eVal;
            }
        }

        // Only assign layers dynamically based on Z height where ACTUAL material is dispensed.
        // This flawlessly ignores Z-hops since they happen during empty travel moves.
        if (extrude) {
            let found = false;
            for (let i = 0; i < knownZ.length; i++) {
                if (Math.abs(knownZ[i] - nz) < 0.005) {
                    found = true;
                    currentLayer = i + 1; // 1-indexed to match UI
                    break;
                }
            }
            if (!found) {
                knownZ.push(nz);
                knownZ.sort((a,b) => a-b);
                currentLayer = knownZ.findIndex(z => Math.abs(z - nz) < 0.005) + 1;
            }
            if (currentLayer > maxSeenLayer) maxSeenLayer = currentLayer;
        }

        moves.push({ x: nx, y: ny, z: nz, extrude, layer: currentLayer, toolhead: activeToolhead });

        if (extrude) {
            bbox.minX = Math.min(bbox.minX, nx);
            bbox.maxX = Math.max(bbox.maxX, nx);
            bbox.minY = Math.min(bbox.minY, ny);
            bbox.maxY = Math.max(bbox.maxY, ny);
            bbox.maxZ = Math.max(bbox.maxZ, nz);
        }

        cx = nx; cy = cy = ny; cz = nz;
    }

    if (!isFinite(bbox.minX)) { bbox.minX = 0; bbox.maxX = 100; bbox.minY = 0; bbox.maxY = 100; }

    return { moves, layerCount: maxSeenLayer, bbox };
}

// ── Pre-calculate geometries for lightning-fast slider updates ──────────────────
interface ExtrusionData {
    color: string;
    matrices: THREE.Matrix4[];
    countsByLayer: number[]; // countsByLayer[N] = number of elements up to layer N
}

interface GeometryData {
    extrusions: ExtrusionData[];
    travelPoints: Float32Array;
    travelCountsByLayer: number[];
}

function buildGeometries(parsed: ParsedGCode, nozzleDiameter: number = 0.4): GeometryData {
    console.time("buildGeometries");
    const buckets: Record<string, THREE.Matrix4[]> = {};
    const countsByLayer: Record<string, number[]> = {};
    const travelList: number[] = [];
    
    // Initialize count tracking arrays
    for (const key of Object.values(TOOLHEAD_COLOR)) countsByLayer[key] = new Array(parsed.layerCount + 1).fill(0);
    countsByLayer[DEFAULT_COLOR] = new Array(parsed.layerCount + 1).fill(0);
    const travelCountsByLayer: number[] = new Array(parsed.layerCount + 1).fill(0);

    let prev: Move | null = null;
    let currentCounts: Record<string, number> = {};
    for (const key of Object.keys(countsByLayer)) currentCounts[key] = 0;
    let currentTravelCount = 0;
    let currentLayerTracking = 0;

    const addTube = (key: string, p1: THREE.Vector3, p2: THREE.Vector3) => {
        const diff = new THREE.Vector3().subVectors(p2, p1);
        const len = diff.length();
        if (len < 0.0001) return;
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dir = diff.clone().normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const matrix = new THREE.Matrix4().compose(
            mid, quaternion, new THREE.Vector3(nozzleDiameter, len, nozzleDiameter)
        );
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(matrix);
        currentCounts[key] = buckets[key].length;
    };

    for (const m of parsed.moves) {
        // As we move through moves, snapshot counts when returning to higher layers
        while (currentLayerTracking < m.layer && currentLayerTracking <= parsed.layerCount) {
            for (const key of Object.keys(countsByLayer)) {
                countsByLayer[key][currentLayerTracking] = currentCounts[key] || 0;
            }
            travelCountsByLayer[currentLayerTracking] = currentTravelCount;
            currentLayerTracking++;
        }

        if (prev) {
            // Translate from GCode coords (Z=height) to ThreeJS coords (Y=height)
            const p1 = new THREE.Vector3(prev.x, prev.z, prev.y);
            const p2 = new THREE.Vector3(m.x, m.z, m.y);

            if (m.extrude) {
                const key = TOOLHEAD_COLOR[m.toolhead] ?? DEFAULT_COLOR;
                addTube(key, p1, p2);
            } else {
                travelList.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                currentTravelCount += 2; // Each line segment requires 2 vertices
            }
        }
        prev = m;
    }

    // Fill any remaining layers (e.g., up to max layer) with the final totals
    while (currentLayerTracking <= parsed.layerCount) {
        for (const key of Object.keys(countsByLayer)) {
            countsByLayer[key][currentLayerTracking] = currentCounts[key] || 0;
        }
        travelCountsByLayer[currentLayerTracking] = currentTravelCount;
        currentLayerTracking++;
    }

    const extrusions = Object.entries(buckets).map(([color, matrices]) => ({
        color,
        matrices,
        countsByLayer: countsByLayer[color] || []
    }));

    console.timeEnd("buildGeometries");
    return {
        extrusions,
        travelPoints: new Float32Array(travelList),
        travelCountsByLayer
    };
}

// ── Render single toolhead path (O(1) updates) ──────────────────────────────
function TubeSegment({ extrusion, count, nozzleDiameter }: { extrusion: ExtrusionData; count: number; nozzleDiameter: number }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Only set matrices once!
    useEffect(() => {
        if (!meshRef.current) return;
        for (let i = 0; i < extrusion.matrices.length; i++) {
            meshRef.current.setMatrixAt(i, extrusion.matrices[i]);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [extrusion.matrices]);

    // Update count immediately without rebuilding geometry
    useEffect(() => {
        if (meshRef.current) {
            meshRef.current.count = count;
        }
    }, [count]);

    if (extrusion.matrices.length === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, extrusion.matrices.length]} castShadow receiveShadow>
            <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
            <meshStandardMaterial color={extrusion.color} roughness={0.4} metalness={0.1} />
        </instancedMesh>
    );
}

// ── Render travel moves as thin red lines ───────────────────────────────────
function TravelSegments({ points, count, visible }: { points: Float32Array; count: number; visible: boolean }) {
    const geoRef = useRef<THREE.BufferGeometry>(null);

    useEffect(() => {
        if (geoRef.current) {
            geoRef.current.setDrawRange(0, count);
        }
    }, [count]);

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

// ── Three.js scene component ──────────────────────────────────────────────────
function GCodeScene({ parsed, upToLayer, nozzleDiameter = 0.4, showTravel = false }: { parsed: ParsedGCode; upToLayer: number; nozzleDiameter?: number; showTravel?: boolean }) {
    // Heavy calculation computed exactly ONCE upon load (or if nozzle diameter changes)
    const geoData = useMemo(() => buildGeometries(parsed, nozzleDiameter), [parsed, nozzleDiameter]);
    
    const { camera } = useThree();

    const centerOffset = useMemo(() => {
        const cx = (parsed.bbox.minX + parsed.bbox.maxX) / 2;
        const cy = (parsed.bbox.minY + parsed.bbox.maxY) / 2;
        if (!isFinite(cx) || !isFinite(cy)) return { x: 0, y: 0 };
        return {
            x: 50 - cx,
            y: 50 - cy,
        };
    }, [parsed.bbox]);

    useEffect(() => {
        // Center camera on BBox
        const cx = (parsed.bbox.minX + parsed.bbox.maxX) / 2 + centerOffset.x;
        const cy = (parsed.bbox.minY + parsed.bbox.maxY) / 2 + centerOffset.y;
        const sz = Math.max(parsed.bbox.maxX - parsed.bbox.minX, parsed.bbox.maxY - parsed.bbox.minY, parsed.bbox.maxZ);
        if (isFinite(cx) && isFinite(cy) && isFinite(sz) && sz > 0) {
            (camera as THREE.PerspectiveCamera).position.set(cx + sz * 0.8, sz * 1.2, cy + sz * 0.8);
            camera.lookAt(cx, 0, cy);
        }
    }, [parsed, centerOffset, camera]);

    // Safety clamp (just in case upToLayer goes out of bounds)
    const safeLayer = Math.min(Math.max(0, upToLayer), parsed.layerCount);

    return (
        <>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[50, 0, 50]}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#1e293b" opacity={0.6} transparent />
            </mesh>
            <gridHelper args={[100, 10, '#334155', '#1e293b']} position={[50, 0.01, 50]} />

            <group position={[centerOffset.x, 0, centerOffset.y]}>
                {/* Render Extrusions */}
                {geoData.extrusions.map((ext, i) => (
                    <TubeSegment 
                        key={i} 
                        extrusion={ext} 
                        count={ext.countsByLayer[safeLayer] ?? ext.matrices.length} 
                        nozzleDiameter={nozzleDiameter} 
                    />
                ))}
                
                {/* Render Travel Moves */}
                <TravelSegments 
                    points={geoData.travelPoints} 
                    count={geoData.travelCountsByLayer[safeLayer] ?? (geoData.travelPoints.length / 3 * 2)} 
                    visible={showTravel} 
                />
            </group>
        </>
    );
}

// ── Main exported component ───────────────────────────────────────────────────
interface GCodePreviewProps {
    gcodeUrl: string;      // full URL to fetch .gcode from
    jobId: string;
    layerCount: number;
    initialNozzleDiameter?: number;
    onClose: () => void;
}

export const GCodePreview: React.FC<GCodePreviewProps> = ({ gcodeUrl, jobId, layerCount, initialNozzleDiameter = 0.4, onClose }) => {
    console.log("[GCodePreview] Mounting for job:", jobId);
    const [parsed, setParsed] = useState<ParsedGCode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [upToLayer, setUpToLayer] = useState(layerCount);
    const [nozzleDiameter, setNozzleDiameter] = useState(initialNozzleDiameter);
    const [showTravel, setShowTravel] = useState(false);

    useEffect(() => {
        console.log("[GCodePreview] Fetching G-code from:", gcodeUrl);
        setLoading(true);
        setError(null);
        fetch(gcodeUrl)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            })
            .then(raw => {
                console.log("[GCodePreview] G-code received, parsing...");
                const result = parseGCode(raw);
                console.log("[GCodePreview] Parsing complete. Moves:", result.moves.length, "Layers:", result.layerCount);
                setParsed(result);
                setUpToLayer(result.layerCount);
                setLoading(false);
            })
            .catch(e => {
                console.error("[GCodePreview] Load error:", e);
                setError(e.message);
                setLoading(false);
            });
    }, [gcodeUrl]);

    return (
        <div className="relative flex flex-col w-full h-full bg-slate-950 overflow-hidden">
            {/* Main View Area */}
            <div className="flex-1 relative">
                {/* Floating Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-all shadow-xl"
                    title="Back to Model View"
                >
                    <Icon name="close" className="text-xl" />
                </button>

                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
                        <div className="text-center text-slate-400">
                            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm uppercase tracking-widest font-bold opacity-50">Slicing complete. Loading G-code...</p>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
                        <div className="text-center text-red-400 p-8 max-w-md">
                            <Icon name="error_outline" className="text-5xl mb-4 opacity-50" />
                            <p className="text-sm font-bold uppercase mb-2">Error Loading Preview</p>
                            <p className="text-xs opacity-80 mb-6">{error}</p>
                            <button onClick={onClose} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-white text-xs font-bold uppercase transition-all">Close</button>
                        </div>
                    </div>
                )}
                {parsed && !loading && (
                    <Canvas
                        camera={{ position: [150, 120, 150], fov: 45 }}
                        style={{ background: '#0f172a' }}
                    >
                        <ambientLight intensity={0.5} />
                        <directionalLight position={[50, 80, 50]} intensity={1} />
                        <GCodeScene parsed={parsed} upToLayer={upToLayer} nozzleDiameter={nozzleDiameter} showTravel={showTravel} />
                        <OrbitControls makeDefault target={[50, 0, 50]} />
                    </Canvas>
                )}
            </div>

            {/* Bottom Integrated Controls */}
            {parsed && (
                <div className="bg-slate-900/90 backdrop-blur-md border-t border-slate-800 px-6 py-3 flex items-center gap-6 z-20">
                    {/* Layer Slider */}
                    <div className="flex flex-1 items-center gap-4">
                        <Icon name="layers" className="text-slate-500 text-base" />
                        <span className="text-[10px] text-slate-500 uppercase font-bold w-12">Layer</span>
                        <input
                            type="range"
                            min={0}
                            max={parsed.layerCount}
                            step={1}
                            value={upToLayer}
                            onChange={e => setUpToLayer(+e.target.value)}
                            className="flex-1 h-1 accent-primary bg-slate-800 rounded-full cursor-pointer appearance-none"
                        />
                        <span className="text-xs font-mono text-primary font-bold w-16 text-right">
                            {upToLayer}/{parsed.layerCount}
                        </span>
                    </div>

                    {/* Nozzle Control (Moved to bottom) */}
                    <div className="h-6 w-[1px] bg-slate-800" />

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                            <span className="uppercase font-bold opacity-70">Nozzle</span>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0.1"
                                    max="2.0"
                                    step="0.05"
                                    value={nozzleDiameter}
                                    onChange={e => setNozzleDiameter(parseFloat(e.target.value) || 0.4)}
                                    className="w-14 px-1 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-center text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all"
                                />
                            </div>
                            <span className="text-slate-600 font-bold uppercase">mm</span>
                        </div>
                    </div>

                    <div className="h-6 w-[1px] bg-slate-800" />

                    {/* Travel Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-400 font-bold uppercase tracking-tight hover:text-slate-300 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={showTravel} 
                            onChange={e => setShowTravel(e.target.checked)} 
                            className="w-3 h-3 accent-primary cursor-pointer"
                        />
                        Travel Moves
                    </label>

                    <div className="h-6 w-[1px] bg-slate-800" />

                    {/* Legend (Moved to bottom) */}
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#14b8a6' }} />FDM</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#f59e0b' }} />Syr</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} />UV</span>
                    </div>

                    <div className="h-6 w-[1px] bg-slate-800" />

                    {/* Download */}
                    <a
                        href={gcodeUrl}
                        download="print.gcode"
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold rounded border border-slate-700 transition-all uppercase"
                    >
                        <Icon name="download" className="text-sm" />
                        G-code
                    </a>
                </div>
            )}
        </div>
    );
};
