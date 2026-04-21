import React, { Suspense, useState, useRef, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment } from '@react-three/drei';
import * as THREE from 'three';

import { Icon } from '../Icon';
import { GlobalSettings, ModelData, TransformData, AdvancedSliceSettings, ZZone, Modifier } from '../../types';
import { useGCodeLoader, GCodeScene, ColorMode, LINE_TYPE_COLOR, LINE_TYPE_LABELS, TOOLHEAD_COLOR } from '../GCodePreview/GCodePreview';

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

type CameraMode = 'orbit' | 'pan';

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
  // ── GCode State ──────────────────────────────────────────
  const gcodeUrl = gcodeJob?.gcodeUrl ?? null;
  const [gcodeLayer, setGcodeLayer] = useState<number>(0);
  const { parsed: gcodeParsed, loading: gcodeLoading, layerLines, allLines, layerMap, gcodeRaw } = useGCodeLoader(gcodeUrl, gcodeLayer);
  const [inspectorTab, setInspectorTab] = useState<'inspector' | 'gcode'>('inspector');
  const gcodeScrollRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [gcodeShowTravel, setGcodeShowTravel] = useState(false);
  const [gcodeNozzle, setGcodeNozzle] = useState(globalSettings.nozzleDiameter || 0.4);
  const [gcodeColorMode, setGcodeColorMode] = useState<ColorMode>('toolhead');
  const isGCodeMode = !!gcodeJob;

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
    setGcodeNozzle(globalSettings.nozzleDiameter || 0.4);
  }, [gcodeJob, globalSettings.nozzleDiameter]);

  useEffect(() => {
    clippingPlane.constant = clippingHeight;
  }, [clippingHeight]);

  // ── Handlers ─────────────────────────────────────────────
  const setView = (mode: string) => setViewTrigger(prev => ({ mode, t: prev.t + 1 }));
  const cycleViewMode = () => setViewMode(prev => prev === 'solid' ? 'transparent' : 'solid');
  const selectedModel = models.find(m => m.id === selectedModelId);

  const sliderMaxHeight = useMemo(() => {
    if (models.length === 0) return BUILD_VOLUME.height;
    const maxModelHeight = Math.max(...models.map(m => (m.size?.z || 0) * (m.transform?.scale?.z || 1)), 0);
    return Math.min(Math.max(maxModelHeight * 1.05, 1), BUILD_VOLUME.height);
  }, [models]);

  return (
    <div className="absolute inset-0 bg-white dark:bg-slate-950 overflow-hidden flex">
      {/* Main Viewport Area */}
      <div className="flex-1 relative h-full">
        {/* Render Canvas */}
        <div className="absolute inset-0 z-0">
          <Canvas
            shadows
            camera={{ position: [100, 100, 150], fov: 45, near: 0.01, far: 2000 }}
            onPointerMissed={() => onSelectModel(null)}
            gl={{ localClippingEnabled: true, antialias: true }}
          >
            <color attach="background" args={['#f8fafc']} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[100, 100, 100]} intensity={1.0} castShadow />
            <directionalLight position={[-100, 100, -100]} intensity={0.5} />

            <BuildPlate globalSettings={globalSettings} />

            <UVProcessPlanes 
              zZones={zZones} 
              models={models}
              isVisible={isGCodeMode}
              currentHeight={gcodeParsed && gcodeParsed.layerHeights ? gcodeParsed.layerHeights[gcodeLayer] : null}
            />

            <Suspense fallback={null}>
              {!isGCodeMode && models.map(model => (
                <ViewportModel
                  key={model.id}
                  {...model}
                  url={model.url}
                  objectTool={objectTool}
                  viewMode={viewMode}
                  isSelected={model.id === selectedModelId}
                  isVisible={true}
                  isDimmed={isAdvancedSliceMode && model.id !== selectedModelId}
                  isAdvancedMode={!!isAdvancedSliceMode && model.id === selectedModelId}
                  advancedSettings={model.advancedSettings}
                  setIsSelected={(val) => val ? onSelectModel(model.id) : null}
                  transformData={model.transform}
                  onTransformChange={(newData) => onTransformChange(model.id, newData)}
                  onUpdateSize={(size) => onUpdateModelSize(model.id, size)}
                  adhesionOffset={(globalSettings.adhesion?.enabled) ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000 : 0}
                  isClipping={isClipping}
                  clippingHeight={clippingHeight}
                  toolheadColor={TOOLHEAD_COLORS[model.toolhead || 'none'] || TOOLHEAD_COLORS.none}
                  globalSettings={globalSettings}
                  wellAssignment={model.transform.wellAssignment}
                />
              ))}
            </Suspense>

            {isGCodeMode && gcodeParsed && (
              <GCodeScene
                parsed={gcodeParsed}
                upToLayer={gcodeLayer}
                nozzleDiameter={gcodeNozzle}
                showTravel={gcodeShowTravel}
                colorMode={gcodeColorMode}
              />
            )}

            <ContactShadows position={[0, -0.01, 0]} opacity={0.2} scale={400} blur={2.5} far={10} color="#000000" />
            <SceneControls cameraMode={cameraMode} zoomTrigger={zoomTrigger} />
            <CameraManager viewTrigger={viewTrigger} focusTarget={focusTarget} />
          </Canvas>

          {/* Empty State */}
          {!isGCodeMode && models.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
              <div className="flex flex-col items-center gap-6 p-10 rounded-3xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-inner">
                  <Icon name="cloud_upload" className="text-4xl text-primary/80" />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-[0.2em] mb-2">Workspace Empty</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Load STL models to begin fabrication process</p>
                </div>
                <div className="px-4 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Step 2: Add Models
                </div>
              </div>
            </div>
          )}

          {/* GCode Exit Button */}
          {isGCodeMode && onExitGCode && (
            <button
              onClick={onExitGCode}
              className="absolute top-4 right-4 z-30 flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95"
            >
              <Icon name="close" className="text-sm" />
              Exit Preview
            </button>
          )}

          {/* GCode Layer Slider (Bottom) */}
          {isGCodeMode && gcodeParsed && (
            <div className="absolute bottom-6 left-6 right-6 z-30 flex items-center gap-6 px-6 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon name="layers" className="text-primary text-base" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Layer Index</p>
                  <p className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 leading-none">{gcodeLayer} <span className="opacity-30">/ {gcodeParsed.layerCount}</span></p>
                </div>
              </div>

              <input
                type="range" min={0} max={gcodeParsed.layerCount} step={1}
                value={gcodeLayer}
                onChange={e => setGcodeLayer(+e.target.value)}
                className="flex-1 h-1.5 accent-primary bg-slate-200 dark:bg-slate-700 rounded-full cursor-pointer appearance-none"
              />

              <div className="flex items-center gap-2 shrink-0">
                 {/* Legend Popover could go here, simplified for now */}
                 <button
                   onClick={() => setGcodeColorMode(m => m === 'toolhead' ? 'linetype' : 'toolhead')}
                   className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                     gcodeColorMode === 'linetype'
                       ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                       : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-primary'
                   }`}
                 >
                   <Icon name="palette" className="text-sm" />
                   {gcodeColorMode === 'toolhead' ? 'BY TOOL' : 'BY TYPE'}
                 </button>
              </div>
            </div>
          )}
        </div>

        <CameraControls isGCodeMode={isGCodeMode} setView={setView} />
      </div>

      {/* Right Sidebar - Inspector */}
      <div className="w-72 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 z-30 flex flex-col h-full shadow-2xl shadow-black/10">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button 
              onClick={() => setInspectorTab('inspector')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                inspectorTab === 'inspector'
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon name="tune" className="text-sm" />
              Inspector
            </button>
            <button 
              onClick={() => setInspectorTab('gcode')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                inspectorTab === 'gcode'
                  ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon name="code" className="text-sm" />
              G-Code
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          {inspectorTab === 'inspector' ? (
            selectedModel ? (
              <>
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <Icon name="info" className="text-[10px]" /> Model Properties
                    </div>
                    <button onClick={cycleViewMode} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group">
                       <div className={`w-2 h-2 rounded-full border-2 ${viewMode === 'solid' ? 'bg-primary border-primary' : 'border-slate-400'}`} />
                       <span className="text-[9px] font-bold text-slate-400 group-hover:text-primary transition-colors uppercase">{viewMode}</span>
                    </button>
                  </div>
                  <ModelInfoPanel
                    model={selectedModel}
                    adhesionOffset={(globalSettings.adhesion?.enabled) ? (globalSettings.adhesion.layers * globalSettings.adhesion.layerHeight) / 1000 : 0}
                  />
                </section>

                <TransformSettings 
                  selectedModel={selectedModel}
                  objectTool={objectTool}
                  setObjectTool={setObjectTool}
                  arraySpacing={arraySpacing}
                  setArraySpacing={setArraySpacing}
                  onArrayModels={onArrayModels}
                  onCloneModel={onCloneModel}
                  onTransformChange={onTransformChange}
                  onDeleteModel={onDeleteModel}
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
                      className={`w-9 h-5 rounded-full relative transition-all ${isClipping ? 'bg-primary shadow-lg shadow-primary/30' : 'bg-slate-200 dark:bg-slate-800'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-md ${isClipping ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>

                  {isClipping && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 shadow-sm">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Cutting Plane</span>
                        <span className="font-mono text-primary font-black text-[11px]">{clippingHeight.toFixed(1)}mm</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={sliderMaxHeight}
                        step="0.1"
                        value={clippingHeight}
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