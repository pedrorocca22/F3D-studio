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
    onUpdate: (a: LayerAction) => void;
    onDelete: () => void;
}> = ({ action, totalLayers, onUpdate, onDelete }) => {
    const pctFrom = totalLayers > 0 ? (action.layerFrom / totalLayers) * 100 : 0;
    const pctTo = totalLayers > 0 ? (action.layerTo / totalLayers) * 100 : 0;

    return (
        <div className="bg-surface-container-low border border-outline-variant/20 p-4 space-y-4">
            {/* Row header */}
            <div className="flex items-center justify-between">
                <ToolheadBadge toolhead={action.toolhead} />
                <button onClick={onDelete} className="text-slate-400 hover:text-red-500 transition-colors">
                    <Icon name="close" className="text-sm" />
                </button>
            </div>

            {/* Layer range bar */}
            <div>
                <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-2 uppercase tracking-tight">
                    <span>L{action.layerFrom}</span>
                    <span title={action.label} className="truncate max-w-[120px] italic font-medium">{action.label || 'Unnamed Segment'}</span>
                    <span>L{action.layerTo}</span>
                </div>
                <div className="relative h-1 bg-surface-container">
                    <div
                        className="absolute h-full"
                        style={{ 
                            left: `${pctFrom}%`, 
                            right: `${100 - pctTo}%`,
                            backgroundColor: TOOLHEAD_COLORS[action.toolhead] 
                        }}
                    />
                </div>
            </div>

            {/* Layer range inputs */}
            <div className="grid grid-cols-2 gap-px bg-outline-variant/10">
                <div className="bg-white p-2">
                    <label className="text-[9px] text-slate-400 uppercase font-black tracking-tight block">Bounds Start</label>
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
                    <label className="text-[9px] text-slate-400 uppercase font-black tracking-tight block">Bounds End</label>
                    <input
                        type="number"
                        min={action.layerFrom}
                        value={action.layerTo}
                        onChange={e => onUpdate({ ...action, layerTo: +e.target.value })}
                        className="w-full mt-1 bg-transparent border-none p-0 text-xs font-bold outline-none font-mono"
                    />
                </div>
            </div>

            {/* UV-specific settings */}
            {action.toolhead === 'uv' && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-outline-variant/20">
                    <div className="space-y-1">
                        <label className="label-clinical">Exposure</label>
                        <input
                            type="number" min={0.1} step={0.5}
                            value={action.uvSettings?.exposureTimeSec ?? 5}
                            onChange={e => onUpdate({ ...action, uvSettings: { ...action.uvSettings, exposureTimeSec: +e.target.value, pausePrint: action.uvSettings?.pausePrint ?? true, doseTargetMjCm2: action.uvSettings?.doseTargetMjCm2 ?? 0 } })}
                            className="w-full bg-[#eaeff1] px-2 py-1 text-xs font-bold outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="label-clinical">Dose Target</label>
                        <input
                            type="number" min={0} step={1}
                            value={action.uvSettings?.doseTargetMjCm2 ?? 0}
                            onChange={e => onUpdate({ ...action, uvSettings: { ...action.uvSettings!, doseTargetMjCm2: +e.target.value, exposureTimeSec: action.uvSettings?.exposureTimeSec ?? 5, pausePrint: action.uvSettings?.pausePrint ?? true } })}
                            className="w-full bg-[#eaeff1] px-2 py-1 text-xs font-bold outline-none"
                        />
                    </div>
                </div>
            )}

            {/* Label */}
            <input
                type="text"
                placeholder="DESCRIPTION_NULL // ENTER_LABEL"
                value={action.label ?? ''}
                onChange={e => onUpdate({ ...action, label: e.target.value })}
                className="w-full bg-white border border-outline-variant/10 p-2 text-[10px] font-bold outline-none uppercase tracking-tight placeholder:opacity-30"
            />
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
                toolhead: newToolhead,
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
                    {/* Actions list */}
                    {layerActions.length === 0 ? (
                        <div className="text-center py-12 text-slate-300 border border-dashed border-outline-variant/10">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">SCHEDULE_NULL</span>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                            {layerActions.map((action, i) => (
                                <LayerActionRow
                                    key={action.id}
                                    action={action}
                                    totalLayers={totalLayers}
                                    onUpdate={updated => updateAction(i, updated)}
                                    onDelete={() => deleteAction(i)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Add action */}
                    <div className="flex gap-px bg-outline-variant/20 pt-2 border-t border-outline-variant/10">
                        <select
                            value={newToolhead}
                            onChange={e => setNewToolhead(e.target.value as ToolheadId)}
                            className="flex-1 bg-white border-none h-10 px-3 text-[10px] font-black uppercase tracking-widest outline-none"
                        >
                            <option value="fdm">FDM HEAD</option>
                            <option value="syringe">HYDROGEL HEAD</option>
                            <option value="uv">UV HEAD</option>
                        </select>
                        <button
                            onClick={addLayerAction}
                            className="bg-primary hover:bg-primary-dark text-white px-6 h-10 text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                        >
                            <Icon name="add" className="text-xs" />
                            Entry
                        </button>
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
