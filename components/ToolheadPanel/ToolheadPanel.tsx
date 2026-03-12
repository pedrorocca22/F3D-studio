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
    fdm: 'bg-teal-500',
    syringe: 'bg-amber-500',
    uv: 'bg-violet-500',
    none: 'bg-slate-400',
};
const TOOLHEAD_ICONS: Record<ToolheadId, string> = {
    fdm: 'print',
    syringe: 'vaccines',
    uv: 'wb_sunny',
    none: 'do_not_disturb',
};
const TOOLHEAD_LABELS: Record<ToolheadId, string> = {
    fdm: 'FDM Hot-end',
    syringe: 'Hydrogel Syringe',
    uv: 'UV Crosslinker',
    none: 'None',
};

const SCAFFOLD_FEATURE_META: { key: keyof ScaffoldToolMapping; label: string; icon: string }[] = [
    { key: 'perimeter', label: 'Perimeters (Walls)', icon: 'crop_square' },
    { key: 'infill', label: 'Infill', icon: 'grid_on' },
    { key: 'solidInfill', label: 'Solid Fill (Top/Bottom)', icon: 'layers' },
    { key: 'support', label: 'Supports', icon: 'support' },
];

const DEFAULT_SCAFFOLD_TOOLS: ScaffoldToolMapping = {
    perimeter: 'fdm',
    infill: 'fdm',
    solidInfill: 'fdm',
    support: 'fdm',
};

function generateUUID(): string {
    return Math.random().toString(36).slice(2, 10);
}

// ---------- Sub-components ----------

const ToolheadBadge: React.FC<{ toolhead: ToolheadId }> = ({ toolhead }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-xs font-bold ${TOOLHEAD_COLORS[toolhead]}`}>
        <span className="material-icons-outlined text-xs">{TOOLHEAD_ICONS[toolhead]}</span>
        {TOOLHEAD_LABELS[toolhead]}
    </span>
);

const ToolheadSelect: React.FC<{ value: ToolheadId; onChange: (v: ToolheadId) => void; className?: string }> = ({ value, onChange, className }) => (
    <select
        value={value}
        onChange={e => onChange(e.target.value as ToolheadId)}
        className={`bg-slate-50 dark:bg-slate-800 border-none text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary font-medium ${className || 'w-28'}`}
    >
        <option value="fdm">FDM (T0)</option>
        <option value="syringe">Syringe (T1)</option>
        <option value="uv">UV (T2)</option>
    </select>
);


const LayerActionRow: React.FC<{
    action: LayerAction;
    totalLayers: number;
    onUpdate: (a: LayerAction) => void;
    onDelete: () => void;
}> = ({ action, totalLayers, onUpdate, onDelete }) => {
    const pctFrom = totalLayers > 0 ? (action.layerFrom / totalLayers) * 100 : 0;
    const pctTo = totalLayers > 0 ? (action.layerTo / totalLayers) * 100 : 0;

    return (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
            {/* Row header */}
            <div className="flex items-center justify-between">
                <ToolheadBadge toolhead={action.toolhead} />
                <button onClick={onDelete} className="text-slate-400 hover:text-red-500 transition-colors">
                    <Icon name="delete_outline" className="text-base" />
                </button>
            </div>

            {/* Layer range bar */}
            <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Layer {action.layerFrom}</span>
                    <span title={action.label} className="truncate max-w-[120px] text-slate-400 italic">{action.label}</span>
                    <span>Layer {action.layerTo}</span>
                </div>
                <div className="relative h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={`absolute h-full rounded-full ${TOOLHEAD_COLORS[action.toolhead]}`}
                        style={{ left: `${pctFrom}%`, right: `${100 - pctTo}%` }}
                    />
                </div>
            </div>

            {/* Layer range inputs */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-xs text-slate-500 uppercase font-semibold">From Layer</label>
                    <input
                        type="number"
                        min={1}
                        max={action.layerTo}
                        value={action.layerFrom}
                        onChange={e => onUpdate({ ...action, layerFrom: +e.target.value })}
                        className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-500 uppercase font-semibold">To Layer</label>
                    <input
                        type="number"
                        min={action.layerFrom}
                        value={action.layerTo}
                        onChange={e => onUpdate({ ...action, layerTo: +e.target.value })}
                        className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            {/* UV-specific settings */}
            {action.toolhead === 'uv' && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <div>
                        <label className="text-xs text-slate-500 uppercase font-semibold">Exposure (s)</label>
                        <input
                            type="number" min={0.1} step={0.5}
                            value={action.uvSettings?.exposureTimeSec ?? 5}
                            onChange={e => onUpdate({ ...action, uvSettings: { ...action.uvSettings, exposureTimeSec: +e.target.value, pausePrint: action.uvSettings?.pausePrint ?? true, doseTargetMjCm2: action.uvSettings?.doseTargetMjCm2 ?? 0 } })}
                            className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase font-semibold">Dose (mJ/cm²)</label>
                        <input
                            type="number" min={0} step={1}
                            value={action.uvSettings?.doseTargetMjCm2 ?? 0}
                            onChange={e => onUpdate({ ...action, uvSettings: { ...action.uvSettings!, doseTargetMjCm2: +e.target.value, exposureTimeSec: action.uvSettings?.exposureTimeSec ?? 5, pausePrint: action.uvSettings?.pausePrint ?? true } })}
                            className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                        <input
                            id={`pause-${action.id}`}
                            type="checkbox"
                            checked={action.uvSettings?.pausePrint ?? true}
                            onChange={e => onUpdate({ ...action, uvSettings: { ...action.uvSettings!, pausePrint: e.target.checked } })}
                            className="rounded accent-primary"
                        />
                        <label htmlFor={`pause-${action.id}`} className="text-xs text-slate-600 dark:text-slate-300">
                            Pause print during UV exposure
                        </label>
                    </div>
                </div>
            )}

            {/* Syringe-specific settings */}
            {action.toolhead === 'syringe' && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                    <div>
                        <label className="text-xs text-slate-500 uppercase font-semibold">Pressurize Steps</label>
                        <input
                            type="number" min={0} step={5}
                            value={action.syringeSettings?.pressurizationSteps ?? 0}
                            onChange={e => onUpdate({ ...action, syringeSettings: { ...action.syringeSettings!, pressurizationSteps: +e.target.value } })}
                            className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase font-semibold">Retract Steps</label>
                        <input
                            type="number" min={0} step={5}
                            value={action.syringeSettings?.retractionSteps ?? 0}
                            onChange={e => onUpdate({ ...action, syringeSettings: { ...action.syringeSettings!, retractionSteps: +e.target.value } })}
                            className="w-full mt-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>
                </div>
            )}

            {/* Label */}
            <input
                type="text"
                placeholder="Segment label (e.g. 'Hydrogel core — layers 10–40')"
                value={action.label ?? ''}
                onChange={e => onUpdate({ ...action, label: e.target.value })}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs outline-none focus:ring-1 focus:ring-primary placeholder:text-slate-400"
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
            <div className="flex border-b border-slate-200 dark:border-slate-700">
                {(['schedule', 'mapping', 'config'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-2 text-[11px] font-bold capitalize transition-colors border-b-2 -mb-px ${activeTab === tab
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        {tab === 'schedule' ? 'Layer Schedule' : tab === 'mapping' ? 'STL Mapping' : 'Hardware'}
                    </button>
                ))}
            </div>

            {/* ── MAPPING TAB ── */}
            {activeTab === 'mapping' && (
                <div className="space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Assign toolheads to each scaffold. Use <strong>Scaffold mode</strong> to assign different tools per feature (perimeters, infill, etc.).
                    </p>

                    {models.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">
                            No models loaded.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {models.map(m => {
                                const isScaffold = !!m.scaffoldTools;
                                const scaffoldTools = m.scaffoldTools || DEFAULT_SCAFFOLD_TOOLS;

                                return (
                                    <div key={m.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                        {/* Model header */}
                                        <div className="flex items-center justify-between p-2">
                                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mr-2" title={m.name}>
                                                {m.name}
                                            </span>

                                            {/* Single / Scaffold toggle */}
                                            <button
                                                onClick={() => {
                                                    if (isScaffold) {
                                                        // Switch back to single tool
                                                        onUpdateModel(m.id, { scaffoldTools: undefined });
                                                    } else {
                                                        // Activate scaffold mode with defaults based on current toolhead
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
                                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide transition-all flex items-center gap-1 ${
                                                    isScaffold
                                                        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                }`}
                                            >
                                                <Icon name={isScaffold ? 'account_tree' : 'linear_scale'} className="text-xs" />
                                                {isScaffold ? 'Scaffold' : 'Single'}
                                            </button>
                                        </div>

                                        {/* Single tool mode */}
                                        {!isScaffold && (
                                            <div className="px-2 pb-2">
                                                <ToolheadSelect
                                                    value={m.toolhead || 'fdm'}
                                                    onChange={v => onUpdateModel(m.id, { toolhead: v })}
                                                    className="w-full"
                                                />
                                            </div>
                                        )}

                                        {/* Scaffold mode — per-feature assignment */}
                                        {isScaffold && (
                                            <div className="border-t border-slate-200 dark:border-slate-700 p-2 space-y-1.5 bg-slate-50/50 dark:bg-slate-800/30">
                                                {SCAFFOLD_FEATURE_META.map(feat => (
                                                    <div key={feat.key} className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <Icon name={feat.icon} className="text-sm text-slate-400 flex-shrink-0" />
                                                            <span className="text-[10px] text-slate-600 dark:text-slate-300 font-semibold uppercase truncate">{feat.label}</span>
                                                        </div>
                                                        <ToolheadSelect
                                                            value={scaffoldTools[feat.key]}
                                                            onChange={v => {
                                                                onUpdateModel(m.id, {
                                                                    scaffoldTools: { ...scaffoldTools, [feat.key]: v }
                                                                });
                                                            }}
                                                            className="w-28 flex-shrink-0"
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
                <div className="space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Define which toolhead is active for each layer range. BioFFF Studio will automatically switch between FDM, syringe, and UV heads at the configured layer boundaries.
                    </p>

                    {/* Actions list */}
                    {layerActions.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 dark:text-slate-500">
                            <span className="material-icons-outlined text-4xl mb-2 block">layers</span>
                            <p className="text-sm">No toolhead actions defined.</p>
                            <p className="text-xs">Add an action below to get started.</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
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
                    <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <select
                            value={newToolhead}
                            onChange={e => setNewToolhead(e.target.value as ToolheadId)}
                            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="fdm">FDM Hot-end (T0)</option>
                            <option value="syringe">Hydrogel Syringe (T1)</option>
                            <option value="uv">UV Crosslinker (T2)</option>
                        </select>
                        <button
                            onClick={addLayerAction}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:opacity-90 text-white text-xs font-bold rounded-md transition-opacity"
                        >
                            <Icon name="add" className="text-sm" />
                            Add Action
                        </button>
                    </div>
                </div>
            )}

            {/* ── CONFIG TAB ── */}
            {activeTab === 'config' && (
                <div className="space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Installed toolhead hardware parameters. These map to Klipper T0/T1/T2 extruder definitions.
                    </p>

                    {toolheads.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-sm">
                            No toolheads configured.
                        </div>
                    ) : (
                        toolheads.map((th, i) => (
                            <div key={th.id} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <ToolheadBadge toolhead={th.id} />
                                    <span className="text-xs text-slate-500">({th.klipper_tool})</span>
                                    {th.installed
                                        ? <span className="ml-auto text-xs text-teal-600 dark:text-teal-400 font-bold">● Installed</span>
                                        : <span className="ml-auto text-xs text-slate-400 font-semibold">○ Not installed</span>
                                    }
                                </div>

                                {th.id === 'fdm' && (
                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <span>Nozzle: {(th as FDMToolheadConfig).nozzleDiameter}mm</span>
                                        <span>Filament: {(th as FDMToolheadConfig).filamentDiameter}mm</span>
                                        <span>Max temp: {(th as FDMToolheadConfig).maxTemperature}°C</span>
                                        <span>Default: {(th as FDMToolheadConfig).defaultTemperature}°C</span>
                                    </div>
                                )}
                                {th.id === 'syringe' && (
                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <span>Volume: {(th as SyringeToolheadConfig).syringeVolumeMl}mL</span>
                                        <span>Needle: {(th as SyringeToolheadConfig).nozzleDiameterMm}mm</span>
                                        <span>Flow: {(th as SyringeToolheadConfig).flowRateUlPerMm} µl/mm</span>
                                        <span>Type: {(th as SyringeToolheadConfig).actuatorType}</span>
                                    </div>
                                )}
                                {th.id === 'uv' && (
                                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <span>λ: {(th as UVToolheadConfig).wavelengthNm}nm</span>
                                        <span>Max: {(th as UVToolheadConfig).maxPowerMw} mW/cm²</span>
                                        <span>Default dose: {(th as UVToolheadConfig).defaultDose} mJ/cm²</span>
                                        <span>Mode: {(th as UVToolheadConfig).mode}</span>
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    <p className="text-xs text-slate-400 italic">
                        Toolhead hardware configuration is defined in <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">config_fdm.ini</code> and <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">klipper_configs/printer_biofff.cfg</code>.
                    </p>
                </div>
            )}
        </div>
    );
};
