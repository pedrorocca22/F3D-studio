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

        // Layer comment — PrusaSlicer emits ";LAYER_CHANGE" or ";layer_num"
        if (rawLine.includes(';LAYER_CHANGE') || rawLine.includes('; layer')) {
            currentLayer++;
            continue;
        }

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

        if (zM) {
            currentLayer = Math.round(nz / 0.2); // fallback layer calc
        }

        moves.push({ x: nx, y: ny, z: nz, extrude, layer: currentLayer, toolhead: activeToolhead });

        if (extrude) {
            bbox.minX = Math.min(bbox.minX, nx);
            bbox.maxX = Math.max(bbox.maxX, nx);
            bbox.minY = Math.min(bbox.minY, ny);
            bbox.maxY = Math.max(bbox.maxY, ny);
            bbox.maxZ = Math.max(bbox.maxZ, nz);
        }

        cx = nx; cy = ny; cz = nz;
    }

    if (!isFinite(bbox.minX)) { bbox.minX = 0; bbox.maxX = 100; bbox.minY = 0; bbox.maxY = 100; }

    return { moves, layerCount: currentLayer, bbox };
}

// ── Build BufferGeometry lines per toolhead ───────────────────────────────────
function buildLineGeometries(parsed: ParsedGCode, upToLayer: number) {
    // Accumulate positions per color key
    const buckets: Record<string, number[]> = {};

    const add = (key: string, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(x1, z1, y1, x2, z2, y2); // swap Y↔Z for Three.js convention
    };

    let prev: Move | null = null;
    for (const m of parsed.moves) {
        if (m.layer > upToLayer) break;
        if (prev) {
            const key = m.extrude ? (TOOLHEAD_COLOR[m.toolhead] ?? DEFAULT_COLOR) : TRAVEL_COLOR;
            if (m.extrude || upToLayer === parsed.layerCount) {
                add(key, prev.x, prev.y, prev.z, m.x, m.y, m.z);
            }
        }
        prev = m;
    }

    return Object.entries(buckets).map(([color, positions]) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return { color, geo };
    });
}

// ── Three.js scene component ──────────────────────────────────────────────────
function GCodeScene({ parsed, upToLayer }: { parsed: ParsedGCode; upToLayer: number }) {
    const lineData = useMemo(() => buildLineGeometries(parsed, upToLayer), [parsed, upToLayer]);
    const { camera } = useThree();

    useEffect(() => {
        // Center camera on BBox
        const cx = (parsed.bbox.minX + parsed.bbox.maxX) / 2;
        const cy = (parsed.bbox.minY + parsed.bbox.maxY) / 2;
        const sz = Math.max(parsed.bbox.maxX - parsed.bbox.minX, parsed.bbox.maxY - parsed.bbox.minY, parsed.bbox.maxZ);
        (camera as THREE.PerspectiveCamera).position.set(cx + sz * 0.8, sz * 1.2, cy + sz * 0.8);
        camera.lookAt(cx, 0, cy);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [parsed]);

    return (
        <>
            {/* Build plate */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[50, 0, 50]}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial color="#1e293b" opacity={0.6} transparent />
            </mesh>

            {/* Grid */}
            <gridHelper args={[100, 10, '#334155', '#1e293b']} position={[50, 0.01, 50]} />

            {/* Toolpaths */}
            {lineData.map(({ color, geo }, i) => (
                <lineSegments key={i} geometry={geo}>
                    <lineBasicMaterial color={color} linewidth={1} />
                </lineSegments>
            ))}
        </>
    );
}

// ── Main exported component ───────────────────────────────────────────────────
interface GCodePreviewProps {
    gcodeUrl: string;      // full URL to fetch .gcode from
    jobId: string;
    layerCount: number;
    onClose: () => void;
}

export const GCodePreview: React.FC<GCodePreviewProps> = ({ gcodeUrl, jobId, layerCount, onClose }) => {
    const [parsed, setParsed] = useState<ParsedGCode | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [upToLayer, setUpToLayer] = useState(layerCount);

    useEffect(() => {
        setLoading(true);
        setError(null);
        fetch(gcodeUrl)
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.text();
            })
            .then(raw => {
                const result = parseGCode(raw);
                setParsed(result);
                setUpToLayer(result.layerCount);
                setLoading(false);
            })
            .catch(e => {
                setError(e.message);
                setLoading(false);
            });
    }, [gcodeUrl]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-3">
                    <Icon name="route" className="text-primary text-xl" />
                    <span className="text-sm font-bold text-slate-100 uppercase tracking-wide">G-code Preview</span>
                    <span className="text-[10px] text-slate-500 font-mono">job:{jobId}</span>
                </div>

                <div className="flex items-center gap-4">
                    {/* Toolhead legend */}
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded inline-block" style={{ background: '#14b8a6' }} />FDM</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded inline-block" style={{ background: '#f59e0b' }} />Syringe</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded inline-block" style={{ background: '#8b5cf6' }} />UV</span>
                    </div>

                    <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <Icon name="close" className="text-lg" />
                    </button>
                </div>
            </div>

            {/* Canvas area */}
            <div className="flex-1 relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
                        <div className="text-center text-slate-400">
                            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm">Loading G-code…</p>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
                        <div className="text-center text-red-400">
                            <Icon name="error_outline" className="text-4xl mb-2" />
                            <p className="text-sm">{error}</p>
                            <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-700 rounded text-white text-xs">Close</button>
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
                        <GCodeScene parsed={parsed} upToLayer={upToLayer} />
                        <OrbitControls makeDefault />
                    </Canvas>
                )}
            </div>

            {/* Layer slider */}
            {parsed && (
                <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex items-center gap-4">
                    <Icon name="layers" className="text-slate-400 text-base" />
                    <span className="text-[10px] text-slate-500 uppercase font-bold w-16">Layer</span>
                    <input
                        type="range"
                        min={0}
                        max={parsed.layerCount}
                        step={1}
                        value={upToLayer}
                        onChange={e => setUpToLayer(+e.target.value)}
                        className="flex-1 h-1 accent-primary bg-slate-700 rounded-full cursor-pointer appearance-none"
                    />
                    <span className="text-xs font-mono text-primary font-bold w-20 text-right">
                        {upToLayer} / {parsed.layerCount}
                    </span>
                    <a
                        href={gcodeUrl}
                        download="print.gcode"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold rounded transition-colors"
                    >
                        <Icon name="download" className="text-sm" />
                        Download G-code
                    </a>
                </div>
            )}
        </div>
    );
};
