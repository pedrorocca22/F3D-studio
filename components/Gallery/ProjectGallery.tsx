import React from 'react';
import { Icon } from '../Icon';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useUIContext } from '../../contexts/UIContext';
import { ProjectProtocol } from '../../types';

export const ProjectGallery: React.FC = () => {
    const { project } = useProjectContext();
    const { ui } = useUIContext();

    const handleLoad = (protocol: ProjectProtocol) => {
        project.handleLoadProtocol(protocol);
        ui.setCurrentView('editor');
    };

    return (
        <div className="absolute inset-0 z-[100] bg-slate-50 dark:bg-slate-950 flex flex-col animate-in fade-in zoom-in-95 duration-300">
            {/* Gallery Header */}
            <header className="h-16 flex-shrink-0 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => ui.setCurrentView('editor')}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                    >
                        <Icon name="arrow_back" />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Project & Protocol Archive</h1>
                        <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Traceability & Execution History</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                        <input 
                            type="text" 
                            placeholder="Filter by name or author..."
                            className="bg-slate-100 dark:bg-slate-900 border-none rounded-full pl-9 pr-4 py-2 text-xs w-64 focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                </div>
            </header>

            {/* Gallery Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {project.savedProtocols.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                        <Icon name="archive" className="text-6xl mb-4" />
                        <p className="text-sm font-medium">No archived protocols found</p>
                        <p className="text-[10px] uppercase tracking-widest mt-2">Protocols saved during the Build step will appear here</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {project.savedProtocols.map(protocol => (
                            <ProjectCard 
                                key={protocol.id} 
                                protocol={protocol} 
                                onLoad={() => handleLoad(protocol)}
                                onDelete={() => project.handleDeleteProtocol(protocol.id)}
                                onUpdateNotes={(notes) => project.handleUpdateProtocolNotes(protocol.id, notes)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const ProjectCard: React.FC<{ 
    protocol: ProjectProtocol; 
    onLoad: () => void;
    onDelete: () => void;
    onUpdateNotes: (notes: string) => void;
}> = ({ protocol, onLoad, onDelete, onUpdateNotes }) => {
    const [isEditingNotes, setIsEditingNotes] = React.useState(false);
    const [localNotes, setLocalNotes] = React.useState(protocol.notes || '');

    const date = new Date(protocol.createdAt).toLocaleDateString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const timeStr = protocol.jobInfo 
        ? `${Math.floor(protocol.jobInfo.estimatedTimeSec / 3600)}h ${Math.floor((protocol.jobInfo.estimatedTimeSec % 3600) / 60)}m`
        : 'Unknown';

    return (
        <div className="group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 flex flex-col h-full">
            {/* Card Body */}
            <div className="p-5 flex-1 select-none flex flex-col min-h-0 space-y-4">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/10 rounded-xl">
                            <Icon name="biotech" className="text-primary text-xl" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-black text-slate-800 dark:text-white leading-tight truncate text-sm" title={protocol.name}>{protocol.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-black text-primary uppercase tracking-tighter">{protocol.author}</span>
                                <span className="text-[10px] text-slate-300 dark:text-slate-600">•</span>
                                <span className="text-[9px] text-slate-400 font-mono italic">{date}</span>
                            </div>
                        </div>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); if(confirm('Delete Protocol?')) onDelete(); }}
                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 rounded-lg transition-all shrink-0"
                    >
                        <Icon name="delete" className="text-sm" />
                    </button>
                </div>

                {/* STATS OVERVIEW */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 dark:bg-slate-800/40 px-2 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Print Duration</p>
                            <p className="text-[11px] font-mono font-black text-slate-700 dark:text-slate-200">{timeStr}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/40 px-2 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Consumption</p>
                            <p className="text-[11px] font-mono font-black text-slate-700 dark:text-slate-200">
                            {protocol.jobInfo?.filamentUsedMm ? `${(protocol.jobInfo.filamentUsedMm / 1000).toFixed(2)}m` : '--'}
                            </p>
                    </div>
                </div>

                {/* GLOBAL PROCESS STRATEGY */}
                <div className="shrink-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Icon name="settings" className="text-[10px]" /> Global Process Strategy
                    </p>
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/20 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col"><span className="text-[8px] text-slate-400 uppercase">Layer</span><span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{protocol.globalSettings.layerHeight}µm</span></div>
                        <div className="flex flex-col"><span className="text-[8px] text-slate-400 uppercase">Infill</span><span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{protocol.globalSettings.infill}% {protocol.globalSettings.infillPattern}</span></div>
                        <div className="flex flex-col"><span className="text-[8px] text-slate-400 uppercase">Temp</span><span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{protocol.globalSettings.nozzleTemperature}°C / {protocol.globalSettings.bedTemperature}°C</span></div>
                    </div>
                </div>

                {/* STRATIGRAPHY (Z-ZONES) DETAIL */}
                <div className="flex-1 flex flex-col min-h-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                        <Icon name="layers" className="text-[10px]" /> Technical Stratigraphy
                    </p>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                        {/* BASE PROFILE ITEM */}
                        <div className="bg-slate-50/50 dark:bg-slate-800/10 p-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 opacity-60">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase">Base Profile (T0-FDM)</span>
                                <span className="text-[8px] font-mono text-slate-400">Full Z Range</span>
                            </div>
                            <div className="flex gap-3 text-[8px] text-slate-400 font-bold uppercase">
                                <span>Walls: {protocol.globalSettings.perimeters}</span>
                                <span>Speed: {protocol.globalSettings.perimeterSpeed}mm/s</span>
                                <span>Skirt: {protocol.globalSettings.skirtCount}x</span>
                            </div>
                        </div>

                        {protocol.zZones.map(z => {
                            const fdm = z.parameterOverride?.fdm;
                            const hasUV = z.processEvent && (z.processEvent.uvExposureTimeSec ?? 0) > 0;
                            const tool = z.featureOverride?.toolhead || 'fdm';
                            const toolColor = tool === 'syringe' ? 'border-amber-500/40 text-amber-600' : tool === 'uv' ? 'border-purple-500/40 text-purple-600' : 'border-primary/40 text-primary';

                            return (
                                <div key={z.id} className={`bg-white dark:bg-slate-800/40 p-2.5 rounded-xl border-l-[3px] shadow-sm space-y-2 ${toolColor}`}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black uppercase italic tracking-tight">{z.label || 'Segment'}</span>
                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full border ${toolColor} uppercase`}>{tool}</span>
                                        </div>
                                        <span className="text-[9px] font-mono font-black text-slate-400">{z.zStartMm}-{z.zEndMm}mm</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                                        <div className="flex items-center justify-between text-[9px]">
                                            <span className="text-slate-400">Infill Structure</span>
                                            <span className="font-bold text-slate-600 dark:text-slate-300">{fdm?.infillPercent ?? protocol.globalSettings.infill}% • {fdm?.infillPattern ?? protocol.globalSettings.infillPattern}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[9px]">
                                            <span className="text-slate-400">Shell Perimeters</span>
                                            <span className="font-bold text-slate-600 dark:text-slate-300">{fdm?.wallCount ?? protocol.globalSettings.perimeters} loops</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[9px]">
                                            <span className="text-slate-400">Process Speed</span>
                                            <span className="font-bold text-slate-600 dark:text-slate-300">{fdm?.perimeterSpeed ?? protocol.globalSettings.perimeterSpeed} mm/s</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[9px]">
                                            <span className="text-slate-400">Layer Logic</span>
                                            <span className="font-bold text-slate-600 dark:text-slate-300 truncate">Sync Layer-by-Layer</span>
                                        </div>
                                    </div>

                                    {/* UV Process Detail */}
                                    {hasUV && (
                                        <div className="mt-1.5 p-1.5 bg-purple-50 dark:bg-purple-900/10 rounded-lg border border-purple-200/50 dark:border-purple-800/30 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Icon name="wb_sunny" className="text-[10px] text-purple-600" />
                                                <span className="text-[8px] font-black text-purple-600 uppercase">UV Crosslinking</span>
                                            </div>
                                            <div className="flex gap-2 text-[9px] font-bold text-purple-700 dark:text-purple-400">
                                                <span>{z.processEvent?.uvExposureTimeSec}s @ {z.processEvent?.uvPowerPercent}%</span>
                                                <span className="opacity-40">|</span>
                                                <span className="capitalize text-[8px]">{z.processEvent?.trigger?.replace('_', ' ')}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* MATERIALS */}
                <div className="shrink-0 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Icon name="palette" className="text-[10px]" /> Materials
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(protocol.selectedMaterials).length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">Default mappings only</p>
                        ) : (
                            Object.entries(protocol.selectedMaterials).map(([toolId, matId]) => {
                                const material = protocol.userMaterials.find(m => m.id === matId);
                                if (!material) return null;
                                return (
                                    <div key={toolId} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/30 px-2 py-1 rounded-md border border-slate-100 dark:border-slate-700">
                                        <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: material.color }} />
                                        <span className="text-[9px] font-black text-slate-700 dark:text-slate-200 uppercase">{toolId}:</span>
                                        <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{material.name}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* NOTES SECTION */}
                <div className="shrink-0 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-1.5">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Icon name="sticky_note_2" className="text-[10px]" /> Results & Observations
                        </p>
                        <button 
                            onClick={() => {
                                if (isEditingNotes) {
                                    onUpdateNotes(localNotes);
                                }
                                setIsEditingNotes(!isEditingNotes);
                            }}
                            className="text-[9px] font-bold text-primary hover:underline uppercase"
                        >
                            {isEditingNotes ? 'Save Note' : 'Edit'}
                        </button>
                    </div>
                    {isEditingNotes ? (
                        <textarea 
                            className="w-full h-20 bg-slate-100 dark:bg-slate-800 border-none rounded-lg p-2 text-[10px] text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary/40 outline-none resize-none"
                            value={localNotes}
                            onChange={(e) => setLocalNotes(e.target.value)}
                            autoFocus
                        />
                    ) : (
                        <div className="min-h-[40px] max-h-24 overflow-y-auto bg-primary/5 dark:bg-primary/10 rounded-lg p-2 text-[10px] text-slate-600 dark:text-slate-400 border border-primary/10 italic leading-relaxed">
                            {localNotes || 'No notes added for this protocol. Click edit to add results or observations.'}
                        </div>
                    )}
                </div>
            </div>

            {/* Card Footer */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 flex gap-2 border-t border-slate-100 dark:border-slate-800/50">
                <button 
                    onClick={onLoad}
                    className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-primary text-slate-600 dark:text-slate-300 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 group"
                >
                    <Icon name="play_circle" className="text-[14px] group-hover:scale-110 transition-transform" />
                    Load Project
                </button>
                <button 
                    onClick={() => alert(`Re-printing job: ${protocol.jobInfo?.jobId || 'N/A'}`)}
                    className="flex-1 bg-primary hover:bg-primary-dark text-white py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm shadow-primary/20 flex items-center justify-center gap-2 group"
                >
                    <Icon name="print" className="text-[14px] group-hover:scale-110 transition-transform" />
                    Re-Print
                </button>
            </div>
        </div>
    );
};
