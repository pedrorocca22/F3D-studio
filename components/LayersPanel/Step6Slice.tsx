import React from 'react';
import { Icon } from '../Icon';
import { ModelData, GlobalSettings, ZZone } from '../../types';

interface Step6SliceProps {
  models: ModelData[];
  globalSettings: GlobalSettings;
  zZones: ZZone[];
}

export const Step6Slice: React.FC<Step6SliceProps> = ({
  models,
  globalSettings,
  zZones,
}) => {
  // 1. Calculamos la altura física real de los modelos cargados (Segmento base)
  const modelMaxZ = models.length > 0 
    ? Math.max(...models.map(m => (m.transform.position.z || 0) + (m.size?.z || 0)))
    : 0;
  
  // 2. Determinamos el límite superior del gráfico (el mayor entre modelos y zonas)
  const zonesMaxZ = zZones.length > 0 ? Math.max(...zZones.map(z => z.zEndMm)) : 0;
  const maxZ = Math.max(modelMaxZ, zonesMaxZ, 1); // Evitamos división por cero
  
  const layerHeightMm = (globalSettings.layerHeight || 200) / 1000;

  return (
    <div className="space-y-4 overflow-y-auto max-h-full pb-20 px-1 animate-in fade-in slide-in-from-left-1">
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

        <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 text-center animate-pulse">
            <p className="text-[10px] text-primary font-black uppercase tracking-widest">
                Configuration Locked • Ready to Slice
            </p>
        </div>
    </div>
  );
};
