import React, { Suspense, useState, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

import { Icon } from '../Icon';
import { useGCodeLoader, GCodeScene, ColorMode } from '../GCodePreview/GCodePreview';

import './subcomponents/three-types';

// Subcomponents
import { ModelInfoPanel } from './subcomponents/ModelInfoPanel';
import { BuildPlate } from './subcomponents/BuildPlate';
import { UVProcessPlanes } from './subcomponents/UVProcessPlanes';
import { CameraManager } from './subcomponents/CameraManager';
import { ViewportModel, ObjectTool, ViewMode } from './subcomponents/ViewportModel';
import { GCodeTextViewer } from './subcomponents/GCodeTextViewer';
import { TransformSettings } from './subcomponents/TransformSettings';
import { CameraControls } from './subcomponents/CameraControls';
import { SceneControls } from './subcomponents/SceneControls';

// Shared Constants
import { BUILD_VOLUME, TOOLHEAD_COLORS, clippingPlane } from './constants';

// Contexts
import { useUIContext } from '../../contexts/UIContext';
import { useProjectContext } from '../../contexts/ProjectContext';
import { BACKEND_URL } from '../../config';

import { MaterialPresetPanel } from './subcomponents/MaterialPresetPanel';

type CameraMode = 'orbit' | 'pan';

export const Viewport: React.FC = () => {
  const { ui } = useUIContext();
  const { project, slicer } = useProjectContext();

  // ── GCode State ──────────────────────────────────────────
  const gcodeUrl = slicer.gcodePreviewJob ? `${BACKEND_URL}/fdm/job/${slicer.gcodePreviewJob.jobId}/gcode` : null; 
  
  const [gcodeLayer, setGcodeLayer] = useState<number>(0);
  const [gcodeMoveIndex, setGcodeMoveIndex] = useState<number>(0);
  const [isGCodePlaying, setIsGCodePlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  const { parsed: gcodeParsed, layerLines, allLines, layerMap, gcodeRaw, loading: gcodeLoading, error: gcodeError } = useGCodeLoader(
    gcodeUrl, 
    gcodeLayer
  );

  // Playback timer
  useEffect(() => {
    let interval: any;
    if (isGCodePlaying && gcodeParsed) {
      interval = setInterval(() => {
        setGcodeMoveIndex(prev => {
          const layerStart = gcodeParsed.layerMoveIndices[gcodeLayer] || 0;
          const layerEnd = gcodeParsed.layerMoveIndices[gcodeLayer + 1] || gcodeParsed.moves.length;
          const layerMoveCount = Math.max(1, layerEnd - layerStart);
          
          if (prev >= layerMoveCount) {
             // AUTO-ADVANCE LAYER
             if (gcodeLayer < gcodeParsed.layerCount) {
                 setGcodeLayer(l => l + 1);
                 return 0; // Start of next layer
             } else {
                 setIsGCodePlaying(false);
                 return layerMoveCount;
             }
          }
          // Increment based on speed. layerMoveCount / 200 is base.
          const baseStep = Math.max(1, Math.ceil(layerMoveCount / 300));
          const step = baseStep * playbackSpeed;
          return Math.min(prev + step, layerMoveCount);
        });
      }, 30);
    }
    return () => clearInterval(interval);
  }, [isGCodePlaying, gcodeLayer, gcodeParsed, playbackSpeed]);

  // Handle manual layer changes - stop playback if playing? 
  // Actually Prusa just keeps playing on the new layer if you slide it. 
  // But we need to reset move index IF not playing or if jumping layers.
  // The previous effect already handles resetting move index to END when layer changes.
  // I should modify it to only reset to END if NOT playing.
  useEffect(() => {
    if (gcodeParsed && !isGCodePlaying) {
      const layerStart = gcodeParsed.layerMoveIndices[gcodeLayer] || 0;
      const layerEnd = gcodeParsed.layerMoveIndices[gcodeLayer + 1] || gcodeParsed.moves.length;
      setGcodeMoveIndex(layerEnd - layerStart);
    }
  }, [gcodeLayer, gcodeParsed]); // Removed isGCodePlaying from deps to avoid jumpy starts

  const [inspectorTab, setInspectorTab] = useState<'inspector' | 'gcode' | 'materials'>('inspector');
  const gcodeScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [gcodeShowTravel, setGcodeShowTravel] = useState(false);
  const [gcodeNozzle, setGcodeNozzle] = useState(project.globalSettings.nozzleDiameter || 0.4);
  const [gcodeColorMode, setGcodeColorMode] = useState<ColorMode>('toolhead');
  const isGCodeMode = !!slicer.gcodePreviewJob;

  // ── Viewport State ───────────────────────────────────────
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit');
  const [objectTool, setObjectTool] = useState<ObjectTool>('translate');
  const [viewMode, setViewMode] = useState<ViewMode>('solid');
  const [zoomTrigger, setZoomTrigger] = useState(0);
  const [viewTrigger, setViewTrigger] = useState({ mode: 'iso', t: 0 });
  const [focusTarget, setFocusTarget] = useState<THREE.Vector3 | null>(null);
  const [isClipping, setIsClipping] = useState(false);
  const [clippingHeight, setClippingHeight] = useState(0);
  const [uniformScale, setUniformScale] = useState(true);
  const [arraySpacing, setArraySpacing] = useState(5);

  // ── Effects ──────────────────────────────────────────────
  useEffect(() => {
    if (gcodeParsed) setGcodeLayer(gcodeParsed.layerCount);
  }, [gcodeParsed]);

  useEffect(() => {
    if (inspectorTab === 'gcode' && activeLineRef.current && gcodeScrollRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [gcodeLayer, inspectorTab]);

  useEffect(() => {
    setGcodeNozzle(project.globalSettings.nozzleDiameter || 0.4);
  }, [slicer.gcodePreviewJob, project.globalSettings.nozzleDiameter]);

  useEffect(() => {
    clippingPlane.constant = clippingHeight;
  }, [clippingHeight]);

  // ── Handlers ─────────────────────────────────────────────
  const setView = (mode: string) => setViewTrigger(prev => ({ mode, t: prev.t + 1 }));
  const cycleViewMode = () => setViewMode(prev => prev === 'solid' ? 'transparent' : 'solid');
  const selectedModel = project.models.find(m => m.id === project.selectedModelId);

  const sliderMaxHeight = useMemo(() => {
    if (project.models.length === 0) return BUILD_VOLUME.height;
    const maxZ = Math.max(...project.models.map(m => (m.size?.z || 0) * (m.transform?.scale?.z || 1)), 0);
    return Math.min(Math.max(maxZ * 1.05, 1), BUILD_VOLUME.height);
  }, [project.models]);

  return (
    <div className="absolute inset-0 bg-white dark:bg-slate-950 overflow-hidden flex">
      <div className="flex-1 relative h-full">
        <div className="absolute inset-0 z-0">
          <Canvas
            shadows
            camera={{ position: [100, 100, 150], fov: 45, near: 0.01, far: 2000 }}
            onPointerMissed={() => project.setSelectedModelId(null)}
            gl={{ localClippingEnabled: true, antialias: true }}
          >
            <color attach="background" args={['#f8fafc']} />
            <ambientLight intensity={1.2} />
            <directionalLight position={[100, 100, 100]} intensity={1.2} />
            <directionalLight position={[-100, 100, -100]} intensity={0.8} />
            <pointLight position={[0, 200, 0]} intensity={0.5} />

            <BuildPlate globalSettings={project.globalSettings} />

            <UVProcessPlanes 
              zZones={project.zZones} 
              models={project.models}
              isVisible={isGCodeMode}
              currentHeight={gcodeParsed && gcodeParsed.layerHeights ? gcodeParsed.layerHeights[gcodeLayer] : null}
            />

            <Suspense fallback={null}>
              {project.models.map(model => (
                <ViewportModel
                  key={model.id}
                  {...model}
                  url={model.url}
                  objectTool={objectTool}
                  viewMode={isGCodeMode ? 'transparent' : viewMode}
                  isSelected={model.id === project.selectedModelId}
                  isVisible={!isGCodeMode}
                  isDimmed={ui.isAdvancedSliceMode && model.id !== project.selectedModelId}
                  isAdvancedMode={!!ui.isAdvancedSliceMode && model.id === project.selectedModelId}
                  advancedSettings={model.advancedSettings}
                  setIsSelected={(val) => val ? project.setSelectedModelId(model.id) : null}
                  transformData={model.transform}
                  onTransformChange={(newData) => project.handleTransformChange(model.id, newData)}
                  onUpdateSize={(size) => project.handleUpdateModelSize(model.id, size)}
                  adhesionOffset={(project.globalSettings.adhesion?.enabled) ? (project.globalSettings.adhesion.layers * project.globalSettings.adhesion.layerHeight) / 1000 : 0}
                  isClipping={isClipping}
                  clippingHeight={clippingHeight}
                  toolheadColor={TOOLHEAD_COLORS[model.toolhead || 'none'] || TOOLHEAD_COLORS.none}
                  globalSettings={project.globalSettings}
                  wellAssignment={model.transform.wellAssignment}
                />
              ))}
            </Suspense>

            {isGCodeMode && gcodeParsed && (
              <GCodeScene
                parsed={gcodeParsed}
                upToLayer={gcodeLayer}
                upToMoveIndex={gcodeMoveIndex}
                nozzleDiameter={gcodeNozzle}
                showTravel={gcodeShowTravel}
                colorMode={gcodeColorMode}
              />
            )}

            <ContactShadows position={[0, -0.01, 0]} opacity={0.2} scale={400} blur={2.5} far={10} color="#000000" />
            <SceneControls cameraMode={cameraMode} zoomTrigger={zoomTrigger} />
            <CameraManager viewTrigger={viewTrigger} focusTarget={focusTarget} />
          </Canvas>

          {/* G-Code Loading/Error Status */}
          {isGCodeMode && !gcodeParsed && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 dark:bg-slate-950/60 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-900 px-6 py-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_10px_40px_rgba(0,0,0,0.15)] flex flex-col items-center gap-3 animate-in zoom-in-95">
                    {gcodeError ? (
                        <>
                            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
                                <Icon name="error" className="text-2xl" />
                            </div>
                            <div className="text-center">
                                <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-1">G-Code Load Failed</p>
                                <p className="text-[10px] text-red-500 font-mono">{gcodeError}</p>
                            </div>
                            <button 
                                onClick={() => slicer.setGcodePreviewJob(null)}
                                className="mt-2 px-4 py-1.5 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold rounded-lg hover:bg-slate-200"
                            >
                                CLOSE
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary animate-spin">
                                <Icon name="refresh" className="text-2xl" />
                            </div>
                            <div className="text-center">
                                <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-1">Loading Toolpath</p>
                                <p className="text-[9px] text-slate-400 font-medium">Fetching and parsing G-code...</p>
                            </div>
                        </>
                    )}
                </div>
            </div>
          )}


          {isGCodeMode && (
            <button
              onClick={() => slicer.setGcodePreviewJob(null)}
              className="absolute top-6 right-6 z-30 flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-[0_4px_12px_rgba(239,68,68,0.35)] hover:shadow-[0_4px_16px_rgba(239,68,68,0.45)] transition-all font-black text-[10px] uppercase tracking-widest active:scale-95"
            >
              <Icon name="close" className="text-sm" />
              Exit Preview
            </button>
          )}

          {isGCodeMode && gcodeParsed && (
            <div className="absolute bottom-6 left-6 right-6 z-30 flex flex-col gap-2 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
              {/* LAYERS ROW */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 shrink-0 w-24">
                  <Icon name="layers" className="text-primary text-sm" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Layers</span>
                </div>
                <input
                  type="range" min={0} max={gcodeParsed.layerCount} step={1}
                  value={gcodeLayer}
                  onChange={e => setGcodeLayer(+e.target.value)}
                  className="flex-1 h-1 accent-primary bg-slate-200 dark:bg-slate-700 rounded-full cursor-pointer appearance-none"
                />
                <div className="shrink-0 w-20 text-right">
                  <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">{gcodeLayer} <span className="opacity-30">/ {gcodeParsed.layerCount}</span></span>
                </div>
              </div>

              {/* MOVES/PLAYBACK ROW */}
              <div className="flex items-center gap-4 py-1 border-t border-slate-100 dark:border-slate-800/50 mt-1 pt-2">
                <div className="flex items-center gap-2 shrink-0 w-24">
                   <button 
                    onClick={() => {
                        const start = gcodeParsed.layerMoveIndices[gcodeLayer] || 0;
                        const end = gcodeParsed.layerMoveIndices[gcodeLayer+1] || gcodeParsed.moves.length;
                        if (gcodeMoveIndex >= (end - start)) {
                            setGcodeMoveIndex(0);
                            // If we were at the very end of the model, wrap to start
                            if (gcodeLayer >= gcodeParsed.layerCount) setGcodeLayer(1);
                        }
                        setIsGCodePlaying(!isGCodePlaying);
                    }}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isGCodePlaying ? 'bg-primary text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary'}`}
                   >
                     <Icon name={isGCodePlaying ? 'pause' : 'play_arrow'} className="text-xs" />
                   </button>
                   
                   <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 ml-1">
                      {[1, 2, 4, 8].map(s => (
                        <button 
                          key={s} 
                          onClick={() => setPlaybackSpeed(s)}
                          className={`px-1.5 py-0.5 text-[8px] font-black rounded transition-all ${playbackSpeed === s ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                          {s}x
                        </button>
                      ))}
                   </div>
                </div>
                
                {(() => {
                    const start = gcodeParsed.layerMoveIndices[gcodeLayer] || 0;
                    const end = gcodeParsed.layerMoveIndices[gcodeLayer+1] || gcodeParsed.moves.length;
                    const max = Math.max(0, end - start);
                    return (
                        <>
                            <input
                                type="range" min={0} max={max} step={1}
                                value={gcodeMoveIndex}
                                onChange={e => {
                                    setGcodeMoveIndex(+e.target.value);
                                    if (isGCodePlaying) setIsGCodePlaying(false);
                                }}
                                className="flex-1 h-1 accent-emerald-500 bg-slate-200 dark:bg-slate-700 rounded-full cursor-pointer appearance-none"
                            />
                            <div className="shrink-0 w-20 text-right">
                                <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-200">{gcodeMoveIndex} <span className="opacity-30">/ {max}</span></span>
                            </div>
                        </>
                    );
                })()}

                <div className="relative group/legend ml-2">
                  <button
                    onClick={() => setGcodeColorMode(m => m === 'toolhead' ? 'linetype' : 'toolhead')}
                    className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                      gcodeColorMode === 'linetype'
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-primary'
                    }`}
                  >
                    <Icon name="palette" className="text-[12px]" />
                    {gcodeColorMode === 'toolhead' ? 'TOOL' : 'TYPE'}
                  </button>

                  <div className="absolute bottom-full right-0 mb-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] space-y-2 min-w-[180px] opacity-0 pointer-events-none group-hover/legend:opacity-100 group-hover/legend:pointer-events-auto transition-all duration-200 transform translate-y-2 group-hover/legend:translate-y-0">
                    <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 px-1">Legend</h4>
                    <div className="space-y-1.5">
                      {gcodeColorMode === 'toolhead' ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 px-1 py-0.5">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#14b8a6' }} />
                            <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">T0: FDM</span>
                          </div>
                          <div className="flex items-center gap-2 px-1 py-0.5">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#f59e0b' }} />
                            <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">T1: Syringe</span>
                          </div>
                          <div className="flex items-center gap-2 px-1 py-0.5">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#8b5cf6' }} />
                            <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">T2: UV</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#ef4444' }} />
                              <span className="text-[8.5px] font-bold text-slate-600 dark:text-slate-300">Ext. Perimeter</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#f97316' }} />
                              <span className="text-[8.5px] font-bold text-slate-600 dark:text-slate-300">Perimeter</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#eab308' }} />
                              <span className="text-[8.5px] font-bold text-slate-600 dark:text-slate-300">Infill</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#3b82f6' }} />
                              <span className="text-[8.5px] font-bold text-slate-600 dark:text-slate-300">Bridge</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-4 px-1 py-0.5 rounded transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#a855f7' }} />
                              <span className="text-[8.5px] font-bold text-slate-600 dark:text-slate-300">Support</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#94a3b8' }} />
                              <span className="text-[8.5px] font-bold text-slate-600 dark:text-slate-300">Skirt/Brim</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <CameraControls isGCodeMode={isGCodeMode} setView={setView} />
      </div>

      {/* Right Sidebar - Inspector */}
      <div className="w-72 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-30 flex flex-col h-full shadow-[0_0_20px_rgba(0,0,0,0.05)]">
        <div className="p-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex p-1 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200/50 dark:border-slate-700/30">
            <button 
              onClick={() => setInspectorTab('inspector')}
              className={`flex-1 py-1.5 rounded-md text-[8.5px] font-black uppercase tracking-[0.15em] transition-all duration-200 ${
                inspectorTab === 'inspector' 
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Inspector
            </button>
            <button 
              onClick={() => setInspectorTab('materials')}
              className={`flex-1 py-1.5 rounded-md text-[8.5px] font-black uppercase tracking-[0.15em] transition-all duration-200 ${
                inspectorTab === 'materials' 
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              Materials
            </button>
            <button 
              onClick={() => setInspectorTab('gcode')}
              className={`flex-1 py-1.5 rounded-md text-[8.5px] font-black uppercase tracking-[0.15em] transition-all duration-200 ${
                inspectorTab === 'gcode' 
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              G-Code
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          {inspectorTab === 'materials' ? (
            <MaterialPresetPanel />
          ) : inspectorTab === 'inspector' ? (
            selectedModel ? (
              <>
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <Icon name="info" className="text-[10px]" /> Model Properties
                    </div>
                    <button onClick={cycleViewMode} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                       <span className="text-[9px] font-bold text-slate-400 uppercase">{viewMode}</span>
                    </button>
                  </div>
                  <ModelInfoPanel
                    model={selectedModel}
                    adhesionOffset={(project.globalSettings.adhesion?.enabled) ? (project.globalSettings.adhesion.layers * project.globalSettings.adhesion.layerHeight) / 1000 : 0}
                  />
                </section>

                <TransformSettings 
                  selectedModel={selectedModel}
                  objectTool={objectTool}
                  setObjectTool={setObjectTool}
                  arraySpacing={arraySpacing}
                  setArraySpacing={setArraySpacing}
                  onArrayModels={project.handleArrayModels}
                  onCloneModel={project.handleCloneModel}
                  onTransformChange={project.handleTransformChange}
                  onDeleteModel={project.handleDeleteModel}
                  uniformScale={uniformScale}
                  setUniformScale={setUniformScale}
                />

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      <Icon name="content_cut" className="text-[10px]" /> Cross-Section
                    </div>
                    <button
                      onClick={() => setIsClipping(!isClipping)}
                      className={`w-9 h-5 rounded-full relative transition-all ${isClipping ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-800'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isClipping ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>

                  {isClipping && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-2">
                      <input
                        type="range" min="0" max={sliderMaxHeight} step="0.1" value={clippingHeight}
                        onChange={(e) => setClippingHeight(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl opacity-50">
                <Icon name="ads_click" className="text-4xl mb-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">Select Model</span>
              </div>
            )
          ) : (
            <GCodeTextViewer 
              gcodeRaw={gcodeRaw}
              gcodeParsed={gcodeParsed}
              allLines={allLines}
              layerMap={layerMap}
              gcodeLayer={gcodeLayer}
              gcodeUrl={gcodeUrl}
              gcodeScrollRef={gcodeScrollRef}
              activeLineRef={activeLineRef}
            />
          )}
        </div>
      </div>
    </div>
  );
};