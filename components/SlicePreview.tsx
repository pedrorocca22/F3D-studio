import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { PrintMonitor } from './PrintMonitor';
import { JobManifest, JobLayer } from '../types';

interface SlicePreviewProps {
  onBack: () => void;
  layerHeight: number; // in microns
  jobId: string;
}

const BACKEND_URL = "http://127.0.0.1:8000";

export const SlicePreview: React.FC<SlicePreviewProps> = ({ onBack, layerHeight = 50, jobId }) => {
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const [totalExposureEvents, setTotalExposureEvents] = useState(0);
  const [totalPhysicalLayers, setTotalPhysicalLayers] = useState(0);

  // Store full layer objects to access metadata (Z height, exposure time)
  const [layersData, setLayersData] = useState<JobLayer[]>([]);
  const [zoom, setZoom] = useState(1.0);

  const [isLoading, setIsLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

  const [viewerMode, setViewerMode] = useState<'2d' | '3d'>('2d');

  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(100);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentLayerIndex(prev => {
        if (prev >= totalExposureEvents - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, playSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, playSpeed, totalExposureEvents]);

  // Pre-cargar imágenes silenciosamente en caché (look-ahead buffer)
  // Para garantizar que al darle a Play la velocidad de 60fps funcione sin red
  useEffect(() => {
    if (layersData.length === 0) return;
    // Precargar las siguientes 20 capas en memoria
    const maxPreload = Math.min(layersData.length - 1, currentLayerIndex + 20);
    for (let i = currentLayerIndex; i <= maxPreload; i++) {
      const url = `${BACKEND_URL}/job/${jobId}/layer/${layersData[i].filename}`;
      const img = new Image();
      img.src = url;
    }
  }, [currentLayerIndex, layersData, jobId]);

  // Fetch Job Manifest to get layers
  useEffect(() => {
    const fetchManifest = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/job/${jobId}/manifest.json`);
        if (!res.ok) throw new Error("Failed to load job manifest");
        const data: JobManifest = await res.json();

        let processedLayers: JobLayer[] = [];

        // Handle "multi" type unified response logic from server.py
        if (data.type === 'multi' && data.constructs) {
          const merged = data.constructs.find((c: any) => c.id === 'merged');
          if (merged) {
            // Check if layers are objects or strings
            if (merged.layers.length > 0 && typeof merged.layers[0] === 'string') {
              // Fallback for old format (should not happen with new backend)
              processedLayers = (merged.layers as string[]).map((fname, idx) => ({
                filename: fname,
                original_layer_idx: idx,
                physical_layer_idx: idx,
                z_height_mm: (idx * layerHeight) / 1000,
                batch_id: "unknown",
                exposure_time: 0,
                is_sublayer: false
              }));
            } else {
              processedLayers = merged.layers as JobLayer[];
            }
            setTotalPhysicalLayers(merged.physical_layer_count || processedLayers[processedLayers.length - 1].physical_layer_idx + 1);
          }
        } else {
          // Single Mode
          const list = data.layers || [];
          if (list.length > 0 && typeof list[0] === 'string') {
            processedLayers = (list as string[]).map((fname, idx) => ({
              filename: fname,
              original_layer_idx: idx,
              physical_layer_idx: idx,
              z_height_mm: (idx * layerHeight) / 1000,
              batch_id: "single",
              exposure_time: 0,
              is_sublayer: false
            }));
          } else {
            processedLayers = list as JobLayer[];
          }
          setTotalPhysicalLayers(data.physical_layer_count || processedLayers.length);
        }

        setLayersData(processedLayers);
        setTotalExposureEvents(processedLayers.length);
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        alert("Error loading slice data");
        onBack();
      }
    };

    if (jobId) fetchManifest();
  }, [jobId, layerHeight]);

  // Loading Screen
  if (isLoading) {
    return (
      <div className="absolute inset-0 z-50 bg-slate-900 text-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-mono text-slate-400">LOADING LAYERS...</p>
      </div>
    );
  }

  const currentData = layersData[currentLayerIndex];

  // Construct Image URL
  const imageUrl = currentData ? `${BACKEND_URL}/job/${jobId}/layer/${currentData.filename}` : '';

  return (
    <div className="absolute inset-0 z-50 bg-[#1a1a1a] flex flex-col text-white">
      {/* Top Toolbar */}
      <div className="h-14 bg-[#2a2a2a] border-b border-[#333] flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#3a3a3a] rounded text-slate-300 hover:text-white transition-colors text-sm font-medium"
          >
            <Icon name="arrow_back" className="text-lg" />
            Back to Editor
          </button>
          <div className="h-6 w-px bg-[#444]"></div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Exposure Events</span>
            <span className="text-sm font-mono font-bold text-white">
              {currentLayerIndex + 1} <span className="text-slate-500">/</span> {totalExposureEvents}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Physical Layers</span>
            <span className="text-sm font-mono font-bold text-blue-400">
              {currentData ? currentData.physical_layer_idx + 1 : '-'} <span className="text-slate-500">/</span> {totalPhysicalLayers}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] text-slate-400 uppercase tracking-wide">Job ID</span>
            <span className="text-sm font-mono font-bold uppercase text-slate-500">{jobId.substring(0, 6)}</span>
          </div>

        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-[#1a1a1a] rounded-md p-1 border border-[#333] px-2 gap-2">
            <button title={isPlaying ? "Pause Animación" : "Auto-Play Slices"} onClick={() => setIsPlaying(!isPlaying)} className={`p-1.5 rounded transition-colors ${isPlaying ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'}`}>
              <Icon name={isPlaying ? "pause" : "play_arrow"} className="text-sm" />
            </button>
            <select
              value={playSpeed}
              onChange={e => setPlaySpeed(Number(e.target.value))}
              className="bg-[#2a2a2a] text-[10px] font-mono text-slate-300 rounded border border-[#444] p-1.5 focus:outline-none"
            >
              <option value={500}>0.5x</option>
              <option value={100}>1.0x</option>
              <option value={30}>2.0x</option>
              <option value={10}>MAX</option>
            </select>
          </div>
        </div>

        <button
          onClick={async () => {
            if (!confirm("Start Print on connected DLP printer?")) return;
            try {
              const res = await fetch(`${BACKEND_URL}/print/start/${jobId}`, { method: 'POST' });
              const data = await res.json();
              if (res.ok) {
                setIsPrinting(true);
              } else {
                alert("Error: " + data.error);
              }
            } catch (e) {
              alert("Failed to start print: " + e);
            }
          }}
          className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-bold text-sm shadow-lg shadow-green-900/20 transition-all"
        >
          <Icon name="play_arrow" />
          START PRINT
        </button>
      </div>


      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">

        <div className="flex-1 flex flex-col relative bg-black overflow-hidden">
          {/* Central Canvas (Projector View) */}
          {/* Zoom Controls Overlay */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-[#2a2a2a]/90 backdrop-blur border border-white/10 p-1 rounded-full shadow-lg">
            <button
              onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-300 transition-colors"
              title="Zoom Out"
            >
              <Icon name="remove" className="text-lg" />
            </button>
            <div className="px-2 w-16 text-center text-xs font-mono font-bold text-white">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={() => setZoom(z => Math.min(5.0, z + 0.1))}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-300 transition-colors"
              title="Zoom In"
            >
              <Icon name="add" className="text-lg" />
            </button>
            <div className="w-px h-4 bg-white/20 mx-1"></div>
            <button
              onClick={() => setZoom(1.0)}
              className="px-3 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-xs text-blue-400 font-bold uppercase transition-colors"
              title="Actual Size"
            >
              Fit
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center relative p-8 cursor-grab active:cursor-grabbing overflow-auto"
            onWheel={(e) => {
              if (e.ctrlKey) {
                e.preventDefault();
                setZoom(z => Math.max(0.1, Math.min(5.0, z - e.deltaY * 0.001)));
              }
            }}
          >
            {/* Resolution Frame (simulating the projector resolution) */}
            <div
              className="relative border border-slate-700 shadow-2xl bg-black flex items-center justify-center transition-transform duration-100 ease-out origin-center"
              style={{
                width: '1280px', // Ideally fetched from config, assume 1280x720 or similar aspect 
                aspectRatio: '16/9',
                transform: `scale(${zoom})`
              }}
            >
              {/* REAL IMAGE FROM BACKEND */}
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={`Exposure ${currentLayerIndex}`}
                  className="w-full h-full object-contain rendering-pixelated"
                  style={{ imageRendering: 'pixelated' }}
                  draggable={false}
                />
              )}

              {/* Sub-layer Warning Indicator (Scaled with zoom to remain visible detailed or fixed? Fixed is better) */}
              {currentData && currentData.is_sublayer && (
                <div className="absolute top-4 right-4 bg-orange-500/20 border border-orange-500/50 px-2 py-1 rounded flex items-center gap-2 transform" style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top right' }}>
                  <Icon name="layers" className="text-orange-400 text-sm" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Slider Panel */}
        <div className="w-20 bg-[#2a2a2a] border-l border-[#333] flex flex-col items-center py-4 relative z-10">

          <div className="mb-4 text-center w-full px-1">
            <span className="text-[9px] text-slate-400 block mb-1 uppercase tracking-wider">Index</span>
            <div className="w-full h-8 bg-[#1a1a1a] rounded border border-[#333] flex items-center justify-center text-xs font-mono font-bold text-blue-400">
              {currentLayerIndex + 1}
            </div>
          </div>

          <div className="flex-1 w-full flex justify-center py-2 relative group px-2">
            {/* Custom Vertical Slider */}
            <div className="h-full w-2 bg-[#1a1a1a] rounded-full relative">
              {/* Fill */}
              <div
                className="absolute bottom-0 w-full bg-blue-600 rounded-full"
                style={{ height: `${((currentLayerIndex + 1) / totalExposureEvents) * 100}%` }}
              />

              <input
                type="range"
                min="0"
                max={totalExposureEvents - 1}
                value={currentLayerIndex}
                onChange={(e) => setCurrentLayerIndex(parseInt(e.target.value))}
                className="absolute inset-0 -left-4 w-10 h-full opacity-0 cursor-ns-resize z-20"
                style={{ WebkitAppearance: 'slider-vertical' as any }}
              />

              {/* Thumb Visual */}
              <div
                className="absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-md pointer-events-none z-10 border-2 border-blue-600"
                style={{ bottom: `calc(${((currentLayerIndex + 1) / totalExposureEvents) * 100}% - 8px)` }}
              />
            </div>
          </div>

          <div className="mt-4 text-center w-full px-1">
            <span className="text-[9px] text-slate-400 block mb-1 uppercase tracking-wider">Height</span>
            <span className="text-xs font-mono text-slate-300 block">
              {currentData ? currentData.z_height_mm.toFixed(3) : '0.000'}
            </span>
            <span className="text-[9px] text-slate-500">mm</span>
          </div>

          <div className="mt-3 text-center w-full px-1 border-t border-white/5 pt-2">
            <span className="text-[9px] text-slate-400 block mb-1 uppercase tracking-wider">Time</span>
            <span className="text-xs font-mono text-green-400 block">
              {currentData ? currentData.exposure_time.toFixed(1) : '0.0'}s
            </span>
          </div>

        </div>
      </div>

      {/* Print Monitor Overlay */}
      {isPrinting && (
        <PrintMonitor
          jobId={jobId}
          totalLayers={totalExposureEvents}
          layersData={layersData}
          onClose={() => setIsPrinting(false)}
          onStopped={() => setIsPrinting(false)}
        />
      )}
    </div>
  );
};