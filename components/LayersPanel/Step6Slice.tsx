import React from 'react';
import { Icon } from '../Icon';
import { ModelData, GlobalSettings, ZZone } from '../../types';

interface Step6SliceProps {
  models: ModelData[];
  globalSettings: GlobalSettings;
  zZones: ZZone[];
  jobInfo?: { jobId: string; estimatedTimeSec: number; filamentUsedMm?: number; layerCount: number; };
  onSaveToGallery: (name: string, author: string, jobInfo: any, notes?: string, description?: string, tags?: string[]) => void;
}

export const Step6Slice: React.FC<Step6SliceProps> = ({
  models,
  globalSettings,
  zZones,
  jobInfo,
  onSaveToGallery
}) => {
  const [author, setAuthor] = React.useState('');
  const [protocolName, setProtocolName] = React.useState(`PRT-${new Date().toISOString().replace(/T/, '-').replace(/:/g, '').slice(0, 16)}`);
  const [description, setDescription] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState('');
  const [isSaved, setIsSaved] = React.useState(false);
  // 1. Calculamos la altura física real de los modelos cargados (Segmento base)
  const modelMaxZ = models.length > 0 
    ? Math.max(...models.map(m => (m.transform.position.z || 0) + (m.size?.z || 0)))
    : 0;
  
  // 2. Determinamos el límite superior del gráfico (el mayor entre modelos y zonas)
  const zonesMaxZ = zZones.length > 0 ? Math.max(...zZones.map(z => z.zEndMm)) : 0;
  const maxZ = Math.max(modelMaxZ, zonesMaxZ, 1); // Evitamos división por cero
  
  const layerHeightMm = (globalSettings.layerHeight || 200) / 1000;

  return (
    <div className="space-y-4 px-1 animate-in fade-in slide-in-from-left-1">
        {/* Resumen de Parámetros Críticos */}
        <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Hardware Setup</h3>
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span className="text-slate-500">Nozzle:</span><span className="font-mono font-bold text-primary">{globalSettings.nozzleDiameter || 0.4}mm</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Layer:</span><span className="font-mono font-bold text-primary">{globalSettings.layerHeight}µm</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Bed:</span><span className="font-mono font-bold">{globalSettings.bedHeatingEnabled ? `${globalSettings.bedTemperature}°C` : 'OFF'}</span></div>
                </div>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Print Area</h3>
                <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span className="text-slate-500">Surface:</span><span className="font-mono font-bold capitalize">{(globalSettings.printBed?.type || 'glass').replace('_', ' ')}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Height:</span><span className="font-mono font-bold text-primary">{modelMaxZ.toFixed(2)}mm</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Models:</span><span className="font-mono font-bold">{models.length}</span></div>
                </div>
            </div>
        </div>

        {/* Visualizador de Estratigrafía de Impresión */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Icon name="layers" className="text-xs" /> Build Schedule Summary
            </h3>
            
            <div className="relative h-[320px] flex items-stretch gap-4 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                
                {/* Regla de Altura (Eje Z) */}
                <div className="w-8 relative border-r border-slate-200 dark:border-slate-700">
                    <span className="absolute top-0 right-2 text-[8px] font-mono text-slate-400 -translate-y-1/2">{maxZ.toFixed(1)}</span>
                    <span className="absolute bottom-0 right-2 text-[8px] font-mono text-slate-400 translate-y-1/2">0.0</span>
                    <div className="absolute inset-y-0 right-0 w-1 bg-slate-100 dark:bg-slate-800" />
                </div>

                {/* Columna de Composición Geométrica */}
                <div className="w-12 relative group">
                    {/* 1. REPRESENTACIÓN DEL MODELO BASE (Default FDM Segment) */}
                    <div 
                        className="absolute bottom-0 left-0 w-full bg-[#14b8a6] border-x border-white/10 z-0"
                        style={{ height: `${(modelMaxZ / maxZ) * 100}%` }}
                        title="Default FDM Volume"
                    />

                    {/* 2. OVERLAY DE ZONAS CONFIGURADAS */}
                    {zZones.map(zone => {
                        const bottomPct = (zone.zStartMm / maxZ) * 100;
                        const heightPct = ((zone.zEndMm - zone.zStartMm) / maxZ) * 100;
                        
                        const hasUV = zone.processEvent && (zone.processEvent.uvExposureTimeSec ?? 0) > 0;
                        const isSingleLayerUV = (zone.zEndMm - zone.zStartMm) <= (layerHeightMm + 0.01) || zone.processEvent?.trigger === 'after_segment';
                        
                        const tool = zone.featureOverride?.toolhead || 'fdm';
                        // COLORES SOLIDOS: Syringe (Amber), FDM (Turquoise), UV (Purple)
                        const toolColor = tool === 'syringe' ? '#f59e0b' : tool === 'uv' ? '#a855f7' : '#14b8a6';

                        return (
                            <React.Fragment key={`zone-ui-${zone.id}`}>
                                {/* Bloque de Herramienta - COLOR SÓLIDO SIN TEXTO */}
                                <div 
                                    className="absolute left-0 w-full border-y-[1.5px] border-white/40 z-10"
                                    style={{ 
                                        bottom: `${bottomPct}%`, 
                                        height: `${Math.max(heightPct, 0.5)}%`, 
                                        backgroundColor: toolColor,
                                    }}
                                />

                                {/* Indicador UV - SÓLIDO, SIN GLOW */}
                                {hasUV && (
                                    isSingleLayerUV ? (
                                        /* Línea horizontal nítida en el tope de la zona o centro si es capa única */
                                        <div 
                                            className="absolute -left-1 w-14 h-[3px] bg-[#a855f7] z-30 border border-white/20"
                                            style={{ bottom: `${zone.processEvent?.trigger === 'after_segment' ? (zone.zEndMm / maxZ) * 100 : (bottomPct + heightPct/2)}%`, transform: 'translateY(50%)' }}
                                        />
                                    ) : (
                                        /* Barrido lateral sólido */
                                        <div 
                                            className="absolute -right-2 w-1.5 bg-[#a855f7] z-20 border border-white/10"
                                            style={{ 
                                                bottom: `${bottomPct}%`, 
                                                height: `${heightPct}%`,
                                            }}
                                        />
                                    )
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Panel de Detalles Alineado */}
                <div className="flex-1 relative">
                    {zZones.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                                    Base Profile Active
                                </p>
                                <p className="text-[8px] text-slate-400 font-mono">T0 - FDM • Standard</p>
                            </div>
                        </div>
                    )}
                    {zZones.map(zone => {
                        const bottomPct = (zone.zStartMm / maxZ) * 100;
                        const heightPct = ((zone.zEndMm - zone.zStartMm) / maxZ) * 100;
                        const tool = zone.featureOverride?.toolhead || 'fdm';
                        const hasUV = zone.processEvent && (zone.processEvent.uvExposureTimeSec ?? 0) > 0;

                        return (
                            <div 
                                key={`label-${zone.id}`}
                                className="absolute left-0 w-full flex items-center gap-2 group"
                                style={{ bottom: `${bottomPct + heightPct/2}%`, transform: 'translateY(50%)' }}
                            >
                                <div className="h-[1px] w-3 bg-slate-300 dark:bg-slate-700" />
                                <div className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 shadow-sm transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[9px] font-black text-slate-600 dark:text-slate-200 truncate">{zone.label || 'Segment'}</span>
                                        <span className="text-[8px] font-mono text-primary font-bold">{zone.zStartMm}-{zone.zEndMm}mm</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        <span className={`text-[7px] font-bold px-1 rounded-sm uppercase ${tool === 'syringe' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}>
                                            {tool}
                                        </span>
                                        {hasUV && (
                                            <span className="text-[7px] font-bold px-1 rounded-sm bg-purple-100 text-purple-700 uppercase">
                                                UV {zone.processEvent!.uvExposureTimeSec}s
                                            </span>
                                        )}
                                        {zone.parameterOverride?.fdm?.infillPercent !== undefined && (
                                            <span className="text-[7px] font-bold px-1 rounded-sm bg-slate-100 text-slate-500">
                                                {zone.parameterOverride.fdm.infillPercent}% INF
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* BUILD LOCK STATUS */}
        <div className={`p-3 rounded-xl border text-center transition-all duration-500 ${isSaved ? 'bg-green-500/10 border-green-500/20' : 'bg-primary/5 border-primary/10 animate-pulse'}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest ${isSaved ? 'text-green-600' : 'text-primary'}`}>
                {isSaved ? '✓ Protocol Archived Successfully' : 'Configuration Locked • Ready to Slice'}
            </p>
        </div>

        {/* ARCHIVE ACTION PANEL */}
        {jobInfo && !isSaved && (
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 mt-4 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="space-y-1.5">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter ml-1 text-primary">Project Description</p>
                <textarea 
                    placeholder="Short description of the project goal..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full h-12 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-[10px] text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 focus:ring-1 focus:ring-primary/20 outline-none resize-none placeholder:italic"
                />
             </div>

             <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon name="tag" className="text-primary text-[12px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Protocol Name</p>
                        <input 
                            type="text" 
                            placeholder="Protocol X..."
                            value={protocolName}
                            onChange={(e) => setProtocolName(e.target.value)}
                            className="w-full bg-transparent border-none p-0 text-[10px] font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none truncate"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon name="person" className="text-primary text-[12px]" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Researcher</p>
                        <input 
                            type="text" 
                            placeholder="Name..."
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            className="w-full bg-transparent border-none p-0 text-[10px] font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none truncate"
                        />
                    </div>
                </div>
             </div>

             <div className="flex items-center gap-2 px-1">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter shrink-0">Labels:</p>
                <div className="flex gap-1.5">
                    {['Project', 'Approved Protocol'].map(tag => (
                        <button
                            key={tag}
                            onClick={() => {
                                setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
                            }}
                            className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase transition-all border ${
                                tags.includes(tag) 
                                ? 'bg-primary border-primary text-white' 
                                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                            }`}
                        >
                            {tag}
                        </button>
                    ))}
                </div>
             </div>
             
             <div className="space-y-1.5 pt-1">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter ml-1">Post-Print Notes</p>
                <textarea 
                    placeholder="Observations, experimental results, or specific outcomes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full h-16 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 text-[10px] text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700 focus:ring-1 focus:ring-primary/20 outline-none resize-none placeholder:italic"
                />
             </div>
             
             <button 
                onClick={() => {
                   onSaveToGallery(protocolName || 'Untitled Protocol', author || 'Default User', jobInfo, notes, description, tags);
                   setIsSaved(true);
                }}
                className="w-full bg-primary text-white py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 group shadow-sm shadow-primary/20"
             >
                <Icon name="archive" className="text-xs group-hover:scale-110 transition-transform" />
                Archive & Lock Protocol
             </button>
          </div>
        )}
    </div>
  );
};
