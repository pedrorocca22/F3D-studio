import React, { useState } from 'react';
import { Icon } from '../Icon';
import type { ToolheadConfig, ToolheadId, LayerAction, FDMToolheadConfig, SyringeToolheadConfig, UVToolheadConfig, ModelData, ScaffoldToolMapping } from '../../types';

interface ToolheadPanelProps {
    models: ModelData[];
    onUpdateModel: (id: string, updates: Partial<ModelData>) => void;
    toolheads: ToolheadConfig[];
    layerActions: LayerAction[];
    totalLayers: number;
    onUpdateToolheads: (toolheads: ToolheadConfig[]) => void;
    onUpdateLayerActions: (actions: LayerAction[]) => void;
}

// ---------- Toolhead color mapping ----------
const TOOLHEAD_COLORS: Record<ToolheadId, string> = {
    fdm: '#2f6098',
    syringe: '#586064',
    uv: '#b71c1c',
    none: '#abb3b7',
};
const TOOLHEAD_ICONS: Record<ToolheadId, string> = {
    fdm: 'precision_manufacturing',
    syringe: 'science',
    uv: 'wb_iridescent',
    none: 'block',
};
const TOOLHEAD_LABELS: Record<ToolheadId, string> = {
    fdm: 'FDM HEAD',
    syringe: 'HYDROGEL HEAD',
    uv: 'UV HEAD',
    none: 'NULL',
};

export const SCAFFOLD_FEATURE_META: { key: keyof ScaffoldToolMapping; label: string }[] = [
    { key: 'perimeter', label: 'Perimeters' },
    { key: 'infill', label: 'Infill' },
    { key: 'solidInfill', label: 'Solid Fill' },
    { key: 'support', label: 'Supports' },
];

export const DEFAULT_SCAFFOLD_TOOLS: ScaffoldToolMapping = {
    perimeter: 'fdm',
    infill: 'fdm',
    solidInfill: 'fdm',
    support: 'fdm',
};

function generateUUID(): string {
    return Math.random().toString(36).slice(2, 10);
}

// ---------- Sub-components ----------

export const ToolheadBadge: React.FC<{ toolhead: ToolheadId }> = ({ toolhead }) => (
    <span className="inline-flex items-center px-2 py-0.5 border border-slate-300 dark:border-slate-600 text-[9px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
        {TOOLHEAD_LABELS[toolhead]}
    </span>
);

export const ToolheadSelect: React.FC<{ value: ToolheadId; onChange: (v: ToolheadId) => void; className?: string }> = ({ value, onChange, className }) => (
    <select
        value={value}
        onChange={e => onChange(e.target.value as ToolheadId)}
        className={`bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[9px] font-bold uppercase px-1.5 py-1 rounded outline-none focus:ring-1 focus:ring-primary cursor-pointer ${className || 'w-20'}`}
    >
        <option value="fdm">FDM</option>
        <option value="syringe">SYR</option>
        <option value="uv">UV</option>
    </select>
);


export const LayerActionRow: React.FC<{
    action: LayerAction;
    totalLayers: number;
    models: ModelData[];
    onUpdate: (a: LayerAction) => void;
    onDelete: () => void;
}> = ({ action, totalLayers, models, onUpdate, onDelete }) => {
    const pctFrom = totalLayers > 0 ? (action.layerFrom / totalLayers) * 100 : 0;
    const pctTo = totalLayers > 0 ? (action.layerTo / totalLayers) * 100 : 0;

    const FEATURE_OPTIONS: { value: LayerAction['targetFeatures'][0]; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'perimeter', label: 'Perimeters' },
        { value: 'infill', label: 'Infill' },
        { value: 'solidInfill', label: 'Solid Fill' },
        { value: 'support', label: 'Supports' },
    ];

    return (
        <div className="bg-white border border-outline-variant/20 rounded-xl overflow-hidden">
            {/* Top bar: kind selector + model scope + delete */}
            <div className="flex items-center gap-1 p-2 bg-slate-50 border-b border-outline-variant/10">
                <select
                    value={action.kind}
                    onChange={e => onUpdate({ ...action, kind: e.target.value as LayerAction['kind'] })}
                    className="flex-1 bg-white border border-outline-variant/20 rounded px-2 py-1.5 text-[9px] font-black uppercase tracking-wider outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="feature_override">FEATURE OVERRIDE</option>
                    <option value="parameter_override">PARAMETER OVERRIDE</option>
                    <option value="process_event">PROCESS EVENT</option>
                </select>

                <select
                    value={action.modelId || 'all'}
                    onChange={e => onUpdate({ ...action, modelId: e.target.value })}
                    className="w-24 bg-white border border-outline-variant/20 rounded px-2 py-1.5 text-[9px] font-bold uppercase outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="all">ALL MODELS</option>
                    {models.map(m => (
                        <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>
                    ))}
                </select>

                <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete Segment">
                    <Icon name="delete" className="text-sm" />
                </button>
            </div>

            {/* Layer range bar */}
            <div className="px-4 pt-3">
                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-2 uppercase tracking-tight">
                    <span className="font-mono">L{action.layerFrom}</span>
                    <span className="truncate max-w-[120px] italic font-medium text-slate-600">{action.label || 'unnamed'}</span>
                    <span className="font-mono">L{action.layerTo}</span>
                </div>
                <div className="relative h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="absolute h-full rounded-full"
                        style={{ 
                            left: `${pctFrom}%`, 
                            right: `${100 - pctTo}%`,
                            backgroundColor: TOOLHEAD_COLORS[action.toolOverride || 'fdm'] 
                        }}
                    />
                </div>
            </div>

            {/* Layer range inputs */}
            <div className="grid grid-cols-2 gap-px bg-slate-100 mx-4 mt-3 rounded overflow-hidden">
                <div className="bg-white p-2">
                    <label className="text-[8px] text-slate-400 uppercase font-black tracking-tight block">From</label>
                    <input
                        type="number"
                        min={1}
                        max={action.layerTo}
                        value={action.layerFrom}
                        onChange={e => onUpdate({ ...action, layerFrom: +e.target.value })}
                        className="w-full mt-1 bg-transparent border-none p-0 text-xs font-bold outline-none font-mono"
                    />
                </div>
                <div className="bg-white p-2">
                    <label className="text-[8px] text-slate-400 uppercase font-black tracking-tight block">To</label>
                    <input
                        type="number"
                        min={action.layerFrom}
                        value={action.layerTo}
                        onChange={e => onUpdate({ ...action, layerTo: +e.target.value })}
                        className="w-full mt-1 bg-transparent border-none p-0 text-xs font-bold outline-none font-mono"
                    />
                </div>
            </div>

            {/* Common Feature Scope for overrides */}
            {(action.kind === 'feature_override' || action.kind === 'parameter_override') && (
                <div className="px-4 pt-1 space-y-1.5">
                    <label className="text-[8px] text-slate-400 uppercase font-black tracking-wider">Affected Features</label>
                    <div className="flex flex-wrap gap-1">
                        {FEATURE_OPTIONS.map(opt => (
                            <button
                                key={opt.label}
                                onClick={() => {
                                    const current = action.targetFeatures || [];
                                    const next = current.includes(opt.value)
                                        ? current.filter(f => f !== opt.value)
                                        : [...current, opt.value];
                                    // If All is selected, or if nothing is selected, default to All
                                    if (opt.value === 'all') {
                                        onUpdate({ ...action, targetFeatures: ['all'] });
                                    } else {
                                        const filtered = next.filter(f => f !== 'all');
                                        onUpdate({ ...action, targetFeatures: filtered.length > 0 ? filtered : ['all'] });
                                    }
                                }}
                                className={`text-[8px] font-black px-2 py-1 rounded border uppercase tracking-wider transition-all ${
                                    action.targetFeatures?.includes(opt.value)
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-white border-outline-variant/30 text-slate-500 hover:border-primary/50'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Kind-specific fields */}
            <div className="p-4 space-y-3 pt-0">
                {action.kind === 'feature_override' && (
                    <div className="space-y-1.5">
                        <label className="text-[8px] text-slate-400 uppercase font-black tracking-wider">Switch to Tool</label>
                        <div className="flex gap-1">
                            {(['fdm', 'syringe', 'uv'] as const).map(th => (
                                <button
                                    key={th}
                                    onClick={() => onUpdate({ ...action, toolOverride: th })}
                                    className={`flex-1 text-[8px] font-black py-1.5 rounded border uppercase tracking-wider transition-all ${
                                        action.toolOverride === th
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-white border-outline-variant/30 text-slate-500 hover:border-primary/50'
                                    }`}
                                >
                                    {th === 'fdm' ? 'FDM' : th === 'syringe' ? 'HYDRO' : 'UV'}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {action.kind === 'parameter_override' && (
                    <div className="space-y-4">
                        {/* FDM Overrides */}
                        <div className="space-y-2">
                            <label className="text-[8px] text-slate-600 dark:text-slate-400 uppercase font-bold tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> FDM PARAMETERS
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Speed (%)</label>
                                    <input
                                        type="number"
                                        placeholder="100"
                                        value={action.fdmSettings?.printSpeedMmS ? Math.round((action.fdmSettings.printSpeedMmS / 60) * 100) : ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            fdmSettings: { ...action.fdmSettings, printSpeedMmS: (+e.target.value / 100) * 60 }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Flow (%)</label>
                                    <input
                                        type="number"
                                        placeholder="100"
                                        value={action.fdmSettings?.extrusionMultiplier ? Math.round(action.fdmSettings.extrusionMultiplier * 100) : ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            fdmSettings: { ...action.fdmSettings, extrusionMultiplier: +e.target.value / 100 }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Temp (°C)</label>
                                    <input
                                        type="number"
                                        placeholder="210"
                                        value={action.fdmSettings?.nozzleTemperature || ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            fdmSettings: { ...action.fdmSettings, nozzleTemperature: +e.target.value }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Fan (%)</label>
                                    <input
                                        type="number"
                                        placeholder="100"
                                        value={action.fdmSettings?.fanSpeedPercent || ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            fdmSettings: { ...action.fdmSettings, fanSpeedPercent: +e.target.value }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Syringe Overrides */}
                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <label className="text-[8px] text-slate-600 dark:text-slate-400 uppercase font-bold tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> SYRINGE PARAMETERS
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Speed (mm/s)</label>
                                    <input
                                        type="number"
                                        step={0.1}
                                        value={action.syringeSettings?.printSpeedMmS || ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            syringeSettings: { ...action.syringeSettings, printSpeedMmS: +e.target.value }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Flow (µl/mm)</label>
                                    <input
                                        type="number"
                                        step={0.01}
                                        value={action.syringeSettings?.flowRateUlPerMm || ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            syringeSettings: { ...action.syringeSettings, flowRateUlPerMm: +e.target.value }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Pressure (kPa)</label>
                                    <input
                                        type="number"
                                        value={action.syringeSettings?.pressureKPa || ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            syringeSettings: { ...action.syringeSettings, pressureKPa: +e.target.value }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[8px] text-slate-400 uppercase font-black">Retract (Steps)</label>
                                    <input
                                        type="number"
                                        value={action.syringeSettings?.retractionSteps || ''}
                                        onChange={e => onUpdate({ 
                                            ...action, 
                                            syringeSettings: { ...action.syringeSettings, retractionSteps: +e.target.value }
                                        })}
                                        className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {action.kind === 'process_event' && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[8px] text-slate-400 uppercase font-black">UV Exposure (s)</label>
                                <input
                                    type="number" min={0.1} step={0.5}
                                    value={action.uvSettings?.exposureTimeSec ?? 5}
                                    onChange={e => onUpdate({ 
                                        ...action, 
                                        uvSettings: { 
                                            ...action.uvSettings, 
                                            exposureTimeSec: +e.target.value, 
                                            pausePrint: action.uvSettings?.pausePrint ?? true, 
                                            doseTargetMjCm2: action.uvSettings?.doseTargetMjCm2 ?? 0 
                                        }
                                    })}
                                    className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[8px] text-slate-400 uppercase font-black">Dose (mJ)</label>
                                <input
                                    type="number" min={0} step={1}
                                    value={action.uvSettings?.doseTargetMjCm2 ?? 0}
                                    onChange={e => onUpdate({ 
                                        ...action, 
                                        uvSettings: { 
                                            ...action.uvSettings!, 
                                            doseTargetMjCm2: +e.target.value, 
                                            exposureTimeSec: action.uvSettings?.exposureTimeSec ?? 5, 
                                            pausePrint: action.uvSettings?.pausePrint ?? true 
                                        }
                                    })}
                                    className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[8px] text-slate-400 uppercase font-black">Pre-Macro</label>
                                <input
                                    type="text"
                                    placeholder="M104 S0"
                                    value={action.preMacro || ''}
                                    onChange={e => onUpdate({ ...action, preMacro: e.target.value })}
                                    className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none uppercase"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[8px] text-slate-400 uppercase font-black">Post-Macro</label>
                                <input
                                    type="text"
                                    placeholder="M106 S255"
                                    value={action.postMacro || ''}
                                    onChange={e => onUpdate({ ...action, postMacro: e.target.value })}
                                    className="w-full bg-slate-50 border border-outline-variant/20 rounded px-2 py-1 text-[10px] font-bold outline-none uppercase"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Label */}
                <input
                    type="text"
                    placeholder="DESCRIPTION_LABEL // ENTER"
                    value={action.label ?? ''}
                    onChange={e => onUpdate({ ...action, label: e.target.value })}
                    className="w-full bg-slate-50 border border-outline-variant/10 p-2 text-[9px] font-bold outline-none uppercase tracking-tight placeholder:opacity-30 rounded"
                />
            </div>
        </div>
    );
};


// ---------- Main panel ----------

export const ToolheadPanel: React.FC<ToolheadPanelProps> = ({
    models, onUpdateModel,
    toolheads, layerActions, totalLayers,
    onUpdateToolheads, onUpdateLayerActions
}) => {
    const [activeTab, setActiveTab] = useState<'schedule' | 'mapping' | 'config'>('schedule');
    const [newToolhead, setNewToolhead] = useState<ToolheadId>('fdm');

    const addLayerAction = () => {
        const last = layerActions[layerActions.length - 1];
        const from = last ? last.layerTo + 1 : 1;
        const to = from + 20;
        const id = generateUUID();
        onUpdateLayerActions([
            ...layerActions,
            {
                id,
                layerFrom: from,
                layerTo: to,
                kind: 'feature_override',
                targetFeatures: ['all'],
                toolOverride: newToolhead,
                label: '',
                color: '#0d9488',
            }
        ]);
    };

    const updateAction = (index: number, updated: LayerAction) => {
        const next = [...layerActions];
        next[index] = updated;
        onUpdateLayerActions(next);
    };

    const deleteAction = (index: number) => {
        onUpdateLayerActions(layerActions.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Tabs */}
            <div className="flex border-b border-outline-variant/20">
                {(['schedule', 'mapping', 'config'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 -mb-px ${activeTab === tab
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-400 hover:text-slate-700'
                            }`}
                    >
                        {tab === 'schedule' ? 'Schedule' : tab === 'mapping' ? 'Mapping' : 'Hardware'}
                    </button>
                ))}
            </div>

            {/* ── MAPPING TAB ── */}
            {activeTab === 'mapping' && (
                <div className="space-y-3">
                    {models.length === 0 ? (
                        <div className="text-center py-6 text-slate-300 text-[9px] font-black uppercase tracking-widest">
                            PROJECT_NULL // NO_ASSETS
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {models.map(m => {
                                const isScaffold = !!m.scaffoldTools;
                                const scaffoldTools = m.scaffoldTools || DEFAULT_SCAFFOLD_TOOLS;

                                return (
                                    <div key={m.id} className="bg-white border border-outline-variant/20 overflow-hidden">
                                        {/* Model header */}
                                        <div className="flex items-center justify-between p-3 bg-slate-50">
                                            <span className="text-[10px] font-black text-slate-700 uppercase truncate mr-2" title={m.name}>
                                                {m.name}
                                            </span>

                                            {/* Single / Scaffold toggle */}
                                            <button
                                                onClick={() => {
                                                    if (isScaffold) {
                                                        onUpdateModel(m.id, { scaffoldTools: undefined });
                                                    } else {
                                                        const base = m.toolhead || 'fdm';
                                                        onUpdateModel(m.id, {
                                                            scaffoldTools: {
                                                                perimeter: base,
                                                                infill: base,
                                                                solidInfill: base,
                                                                support: base,
                                                            }
                                                        });
                                                    }
                                                }}
                                                className={`text-[9px] font-black px-2 py-1 uppercase tracking-widest transition-all ${
                                                    isScaffold
                                                        ? 'bg-primary text-white'
                                                        : 'bg-white border border-outline-variant/30 text-slate-400'
                                                }`}
                                            >
                                                {isScaffold ? 'SCAFFOLD_LINKED' : 'SINGLE_TOOL'}
                                            </button>
                                        </div>

                                        {/* Single tool mode */}
                                        {!isScaffold && (
                                            <div className="p-3">
                                                <ToolheadSelect
                                                    value={m.toolhead || 'fdm'}
                                                    onChange={v => onUpdateModel(m.id, { toolhead: v })}
                                                    className="w-full"
                                                />
                                            </div>
                                        )}

                                        {/* Scaffold mode — per-feature assignment */}
                                        {isScaffold && (
                                            <div className="p-3 space-y-2 bg-white">
                                                {SCAFFOLD_FEATURE_META.map(feat => (
                                                    <div key={feat.key} className="flex items-center justify-between gap-2">
                                                        <span className="text-[9px] text-slate-500 font-bold uppercase truncate">{feat.label}</span>
                                                        <ToolheadSelect
                                                            value={scaffoldTools[feat.key]}
                                                            onChange={v => {
                                                                onUpdateModel(m.id, {
                                                                    scaffoldTools: { ...scaffoldTools, [feat.key]: v }
                                                                });
                                                            }}
                                                            className="w-20 flex-shrink-0"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── SCHEDULE TAB ── */}
            {activeTab === 'schedule' && (
                <div className="space-y-4">
                    {/* Header info */}
                    <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            {layerActions.length} SEGMENT{layerActions.length !== 1 ? 'S' : ''} DEFINED
                        </span>
                        {totalLayers > 0 && (
                            <span className="text-[9px] font-mono text-slate-400">
                                TOTAL: {totalLayers} LAYERS
                            </span>
                        )}
                    </div>

                    {/* Actions list */}
                    {layerActions.length === 0 ? (
                        <div className="text-center py-12 text-slate-300 border border-dashed border-outline-variant/10 rounded-xl">
                            <Icon name="layers" className="text-3xl mb-2 opacity-30" />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] block">SCHEDULE_EMPTY</span>
                            <span className="text-[8px] text-slate-400 uppercase mt-1 block">Add segment below</span>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                            {layerActions.map((action, i) => (
                                <LayerActionRow
                                    key={action.id}
                                    action={action}
                                    totalLayers={totalLayers}
                                    models={models}
                                    onUpdate={updated => updateAction(i, updated)}
                                    onDelete={() => deleteAction(i)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Add new segment */}
                    <div className="bg-white border-2 border-dashed border-outline-variant/30 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">NEW SEGMENT</span>
                        </div>
                        
                        {/* Intent selector */}
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { kind: 'feature_override', label: 'Feature Override', icon: 'swap_horiz' },
                                { kind: 'parameter_override', label: 'Parameter', icon: 'tune' },
                                { kind: 'process_event', label: 'Process Event', icon: 'bolt' },
                            ].map(opt => (
                                <button
                                    key={opt.kind}
                                    onClick={() => {
                                        const last = layerActions[layerActions.length - 1];
                                        const from = last ? last.layerTo + 1 : 1;
                                        const to = from + 20;
                                        onUpdateLayerActions([
                                            ...layerActions,
                                            {
                                                id: generateUUID(),
                                                layerFrom: from,
                                                layerTo: to,
                                                kind: opt.kind as LayerAction['kind'],
                                                targetFeatures: opt.kind === 'feature_override' ? ['all'] : undefined,
                                                toolOverride: opt.kind === 'feature_override' ? newToolhead : undefined,
                                                label: '',
                                                color: '#0d9488',
                                            }
                                        ]);
                                    }}
                                    className="flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed border-outline-variant/30 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                                >
                                    <Icon name={opt.icon} className="text-lg text-slate-400 group-hover:text-primary" />
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider text-center leading-tight group-hover:text-primary">
                                        {opt.label}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Quick tool selector */}
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] text-slate-400 uppercase font-black tracking-wider flex-shrink-0">Tool:</span>
                            <div className="flex gap-1 flex-1">
                                {(['fdm', 'syringe', 'uv'] as const).map(th => (
                                    <button
                                        key={th}
                                        onClick={() => setNewToolhead(th)}
                                        className={`flex-1 text-[8px] font-black py-1.5 rounded border uppercase tracking-wider transition-all ${
                                            newToolhead === th
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white border-outline-variant/30 text-slate-400 hover:border-primary/50'
                                        }`}
                                    >
                                        {th === 'fdm' ? 'FDM' : th === 'syringe' ? 'HYDRO' : 'UV'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── CONFIG TAB ── */}
            {activeTab === 'config' && (
                <div className="space-y-3">
                    {toolheads.length === 0 ? (
                        <div className="text-center py-6 text-slate-300 text-[9px] font-black uppercase tracking-widest">
                            HARDWARE_NULL // OFFLINE
                        </div>
                    ) : (
                        toolheads.map((th, i) => (
                            <div key={th.id} className="bg-white border border-outline-variant/20 p-4 space-y-4">
                                <div className="flex items-center gap-2">
                                    <ToolheadBadge toolhead={th.id} />
                                    <span className="text-[10px] text-slate-400 font-mono">({th.klipper_tool})</span>
                                    {th.installed
                                        ? <span className="ml-auto text-[9px] text-[#1e4620] font-black uppercase tracking-widest">ACTIVE</span>
                                        : <span className="ml-auto text-[9px] text-slate-300 font-black uppercase tracking-widest">OFFLINE</span>
                                    }
                                </div>

                                {th.id === 'fdm' && (
                                    <div className="grid grid-cols-2 gap-px bg-outline-variant/10">
                                        <div className="bg-slate-50 p-2">
                                            <span className="label-clinical opacity-50 block">Nozzle</span>
                                            <span className="text-[10px] font-bold font-mono">{(th as FDMToolheadConfig).nozzleDiameter}MM</span>
                                        </div>
                                        <div className="bg-slate-50 p-2">
                                            <span className="label-clinical opacity-50 block">Filament</span>
                                            <span className="text-[10px] font-bold font-mono">{(th as FDMToolheadConfig).filamentDiameter}MM</span>
                                        </div>
                                    </div>
                                )}
                                {/* ... other toolheads ... */}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
