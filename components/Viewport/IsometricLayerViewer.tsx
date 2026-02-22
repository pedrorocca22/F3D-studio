import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { JobLayer } from '../../types';

interface IsometricLayerViewerProps {
    layersData: JobLayer[];
    currentLayerIndex: number;
    backendUrl: string;
    jobId: string;
}

// Module-level cache to survive React re-renders but we clear it on unmount
const textureCache = new Map<string, THREE.Texture>();

const preloadTexture = (url: string) => {
    if (textureCache.has(url)) return;
    new THREE.TextureLoader().setCrossOrigin("anonymous").load(url, (tex) => {
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        textureCache.set(url, tex);
    });
};

const LayerPlane = React.memo(({ url, zHeight, bedX, bedY, isTop, mode }: { url: string, zHeight: number, bedX: number, bedY: number, isTop: boolean, mode: 'solid' | 'hologram' }) => {
    const [tex, setTex] = useState<THREE.Texture | null>(() => textureCache.get(url) || null);

    useEffect(() => {
        if (!tex) {
            new THREE.TextureLoader().setCrossOrigin("anonymous").load(url, (loadedTex) => {
                loadedTex.minFilter = THREE.NearestFilter;
                loadedTex.magFilter = THREE.NearestFilter;
                textureCache.set(url, loadedTex);
                setTex(loadedTex);
            });
        }
    }, [url, tex]);

    if (!tex) return null;

    if (mode === 'solid') {
        return (
            <mesh position={[0, 0, zHeight]}>
                <planeGeometry args={[bedX, bedY]} />
                <meshBasicMaterial
                    color={isTop ? "#ffffff" : "#4ade80"}
                    alphaMap={tex}
                    alphaTest={0.05} // Discard almost-black pixels
                    transparent={false}
                    depthWrite={true}
                    depthTest={true}
                    side={THREE.DoubleSide}
                />
            </mesh>
        );
    }

    return (
        <mesh position={[0, 0, zHeight]}>
            <planeGeometry args={[bedX, bedY]} />
            <meshBasicMaterial
                map={tex}
                color={isTop ? "#ffffff" : "#4ade80"}
                transparent={true}
                opacity={isTop ? 1.0 : 0.6}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
});

export const IsometricLayerViewer: React.FC<IsometricLayerViewerProps> = ({ layersData, currentLayerIndex, backendUrl, jobId }) => {
    const [renderMode, setRenderMode] = useState<'solid' | 'hologram'>('solid');

    // Real physical dimensions based on SL1 projector 2560x1440 at ~50um pixel setup
    const bedX = 71.11;
    const bedY = 40.0;

    const maxZMm = layersData.length > 0 ? layersData[layersData.length - 1].z_height_mm : 10;

    // Cleanup cache when destroying the viewer for this job
    useEffect(() => {
        return () => {
            textureCache.forEach(t => t.dispose());
            textureCache.clear();
        };
    }, [jobId]);

    // Preloader mechanism: load the current and next 15 frames in advance to avoid flickering at fast play speeds
    useEffect(() => {
        const maxPreload = Math.min(layersData.length - 1, currentLayerIndex + 15);
        for (let i = currentLayerIndex; i <= maxPreload; i++) {
            const url = `${backendUrl}/job/${jobId}/layer/${layersData[i].filename}`;
            preloadTexture(url);
        }
    }, [currentLayerIndex, layersData, backendUrl, jobId]);

    const activeLayers = layersData.slice(0, currentLayerIndex + 1);

    return (
        <div className="flex-1 w-full h-full bg-[#0a0f18] relative">
            <Canvas orthographic camera={{ position: [200, 200, 200], zoom: 4, up: [0, 0, 1] }}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 10]} intensity={1} />

                <OrbitControls makeDefault target={[0, 0, maxZMm / 2]} maxPolarAngle={Math.PI / 2} />

                {/* The Bed / Build Volume Bounding Box */}
                <group position={[0, 0, maxZMm / 2]}>
                    <lineSegments>
                        <edgesGeometry args={[new THREE.BoxGeometry(bedX, bedY, maxZMm)]} />
                        <lineBasicMaterial color="#334155" opacity={0.5} transparent />
                    </lineSegments>
                </group>

                {/* Platform Base Indicator */}
                <mesh position={[0, 0, -0.5]}>
                    <planeGeometry args={[bedX, bedY]} />
                    <meshBasicMaterial color="#1e293b" side={THREE.DoubleSide} />
                </mesh>

                {/* The Stacked Image Layers */}
                {activeLayers.map((layer, idx) => {
                    const isTop = idx === currentLayerIndex;
                    const url = `${backendUrl}/job/${jobId}/layer/${layer.filename}`;
                    return (
                        <LayerPlane
                            key={layer.filename}
                            url={url}
                            zHeight={layer.z_height_mm}
                            bedX={bedX}
                            bedY={bedY}
                            isTop={isTop}
                            mode={renderMode}
                        />
                    );
                })}

                {/* Grid helper on XY plane */}
                <gridHelper args={[200, 20]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]} />
            </Canvas>

            {/* Overlaid render mode controls */}
            <div className="absolute top-4 right-4 bg-[#1a1a1a] p-1 rounded border border-[#333] flex gap-1 z-10 shadow-xl">
                <button
                    onClick={() => setRenderMode('solid')}
                    className={`px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider ${renderMode === 'solid' ? 'bg-[#333] text-green-400 shadow-inner' : 'text-slate-500 hover:text-slate-300'} transition-all`}
                >
                    Sólido
                </button>
                <button
                    onClick={() => setRenderMode('hologram')}
                    className={`px-3 py-1.5 text-xs font-bold rounded uppercase tracking-wider ${renderMode === 'hologram' ? 'bg-[#333] text-purple-400 shadow-inner' : 'text-slate-500 hover:text-slate-300'} transition-all`}
                >
                    Holograma
                </button>
            </div>
        </div>
    );
};
