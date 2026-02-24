import React, { useEffect, useState } from 'react';
import { Icon } from '../Icon';

export interface ExperimentDetailsProps {
    experimentId: string;
    onBack: () => void;
    onOpenPreview: (experimentId: string) => void;
    onDelete: () => void;
}

export const ExperimentDetails: React.FC<ExperimentDetailsProps> = ({ experimentId, onBack, onOpenPreview, onDelete }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Form State
    const [rating, setRating] = useState<number>(0);
    const [notes, setNotes] = useState<string>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetch(`http://127.0.0.1:8000/api/experiments/${experimentId}`)
            .then(res => res.json())
            .then(json => {
                setData(json);
                setRating(json.rating || 0);
                setNotes(json.notes || '');
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [experimentId]);

    const handleSaveEvaluation = async () => {
        setSaving(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/experiments/${experimentId}/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating, notes })
            });
            if (!res.ok) throw new Error("Failed to save evaluation");
            // Update local state smoothly
        } catch (err) {
            alert("Error saving evaluation");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this experiment and all its sliced files? This cannot be undone.")) return;
        setSaving(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/experiments/${experimentId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error("Failed to delete");
            onDelete();
        } catch (err) {
            alert("Error deleting experiment.");
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 bg-background-light dark:bg-background-dark flex items-center justify-center">
                <span className="text-slate-500">Loading Experiment...</span>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 bg-background-light dark:bg-background-dark flex py-20 px-10 flex-col items-center">
                <h2 className="text-xl font-bold text-red-500 mb-4">Experiment not found</h2>
                <button onClick={onBack} className="text-primary hover:underline">Go Back</button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden text-slate-800 dark:text-slate-100 h-full relative">
            <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-4 flex items-center gap-4 flex-shrink-0 z-10 shadow-sm">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors text-slate-500 dark:text-slate-300">
                    <Icon name="arrow_back" className="text-xl" />
                </button>
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Icon name="science" className="text-primary" />
                        {data.name || `Experiment ${data.id.substring(0, 6)}`}
                    </h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">ID: {data.id} - {new Date(data.created_at).toLocaleString()}</span>
                </div>
                <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="ml-auto p-2 hover:bg-red-50 dark:hover:bg-red-900/40 text-red-500 rounded-full transition-colors flex items-center justify-center opacity-70 hover:opacity-100"
                    title="Delete Experiment"
                >
                    <Icon name="delete" className="text-xl" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
                <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Section 1: Pre-Flight Context */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-lg font-bold border-b border-slate-100 dark:border-slate-700 pb-3 block mb-4 flex items-center gap-2">
                            <Icon name="info" className="text-blue-500" /> Context & Intention
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <span className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Intent / Hypothesis</span>
                                <p className="text-sm bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 min-h-[60px]">
                                    {data.intent || 'No intent provided.'}
                                </p>
                            </div>
                            <div>
                                <span className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">Material</span>
                                <p className="text-sm bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 text-slate-700 dark:text-slate-300">
                                    {data.material || 'Unknown material'}
                                </p>
                            </div>

                            <div className="pt-2 flex items-center justify-between">
                                <div>
                                    <span className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-2">Print Status</span>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-bold uppercase tracking-wider border ${['done', 'sliced', 'printing'].includes(data.status) ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/50' :
                                        'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                                        }`}>
                                        <Icon name={data.status === 'done' ? "check_circle" : "pending"} className="text-base" />
                                        {data.status}
                                    </span>
                                </div>

                                {['done', 'sliced', 'printing'].includes(data.status) && (
                                    <button
                                        onClick={() => onOpenPreview(data.id)}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-opacity-90 text-white rounded-md font-bold text-sm shadow-md transition-all uppercase mt-2"
                                    >
                                        <Icon name="visibility" className="text-lg" />
                                        Pre-visualize & Print
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Technical Configuration Snapshot */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm flex flex-col">
                        <h3 className="text-lg font-bold border-b border-slate-100 dark:border-slate-700 pb-3 block mb-4 flex items-center gap-2">
                            <Icon name="settings" className="text-slate-500" /> Configuration Snapshot
                        </h3>
                        <div className="flex-1 overflow-auto p-1 custom-scrollbar min-h-[200px]">
                            {data.config_snapshot ? (
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                                        <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Layer Height</span>
                                        <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                                            {data.config_snapshot.layer_height ? `${parseFloat(data.config_snapshot.layer_height) * 1000} µm` : 'Default'}
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                                        <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Base Layer Height</span>
                                        <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                                            {data.config_snapshot.initial_layer_height ? `${parseFloat(data.config_snapshot.initial_layer_height) * 1000} µm` : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                                        <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Base Layer Exp. Time</span>
                                        <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                                            {data.config_snapshot.initial_exposure_time ? `${parseFloat(data.config_snapshot.initial_exposure_time)} s` : 'Default'}
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                                        <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Base/Faded Layers</span>
                                        <span className="text-sm font-mono font-bold text-slate-700 dark:text-slate-200">
                                            {data.config_snapshot.faded_layers || '0'}
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 col-span-2 flex items-center justify-between">
                                        <div>
                                            <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">Thermodynamic Mod</span>
                                            <span className="text-sm font-mono font-bold flex items-center gap-2">
                                                {data.config_snapshot.thermodynamic_enabled ? (
                                                    <span className="text-green-600 dark:text-green-400"><Icon name="check_circle" className="text-sm" /> Enabled</span>
                                                ) : (
                                                    <span className="text-slate-400"><Icon name="cancel" className="text-sm" /> Disabled</span>
                                                )}
                                            </span>
                                        </div>
                                        {data.config_snapshot.thermodynamic_enabled && (
                                            <div className="text-right flex gap-3">
                                                <div className="text-xs">
                                                    <span className="text-slate-500 block text-[9px] uppercase">Cooling Pause</span>
                                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{data.config_snapshot.thermodynamic_cooling || '0'}s</span>
                                                </div>
                                                <div className="text-xs border-l border-slate-200 dark:border-slate-700 pl-3">
                                                    <span className="text-slate-500 block text-[9px] uppercase">Flash Max</span>
                                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{data.config_snapshot.thermodynamic_max_flash || '0'}s</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs italic text-slate-500 p-2">No configuration snapshot available.</p>
                            )}

                            {data.patterns_snapshot && data.patterns_snapshot.length > 0 && (
                                <div className="mt-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                                    <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide flex items-center gap-1.5">
                                        <Icon name="layers" className="text-sm text-primary" /> Applied Segments & Patterns:
                                    </span>
                                    <div className="flex flex-col gap-3">
                                        {data.patterns_snapshot.map((r: any, idx: number) => (
                                            <div key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm flex flex-col gap-2 relative overflow-hidden group">
                                                <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 group-hover:bg-primary transition-colors"></div>
                                                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2 pl-2">
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                        Layer Range: <span className="text-primary font-mono">{r.start ?? 0}</span> to <span className="text-primary font-mono">{r.end ?? 'Max'}</span>
                                                    </span>
                                                    {r.gradientMode === 'gradient' && (
                                                        <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 text-[10px] font-bold rounded-full uppercase tracking-wider border border-purple-200 dark:border-purple-800">Gradient</span>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap gap-5 text-xs mt-1 pl-2">
                                                    {r.exposure !== undefined && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 mb-0.5">Exposure</span>
                                                            <span className="font-mono text-slate-700 dark:text-slate-200 font-bold bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded inline-block">
                                                                {r.gradientMode === 'gradient' ? `${r.exposure}s → ${r.endExposureTime}s` : `${parseFloat(r.exposure).toFixed(1)}s`}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {r.irr !== undefined && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500 mb-0.5">Irradiance</span>
                                                            <span className="font-mono text-slate-700 dark:text-slate-200 font-bold bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded inline-block">
                                                                {r.gradientMode === 'gradient' ? `${r.irr} → ${r.endLightIntensity} mW` : `${parseFloat(r.irr).toFixed(2)} mW/cm²`}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {r.modifiers && r.modifiers.length > 0 && (
                                                    <div className="mt-2 bg-slate-50 dark:bg-slate-900 rounded-md p-2.5 border border-slate-100 dark:border-slate-700/80 flex flex-col gap-2 ml-2">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Pattern Modifiers:</span>
                                                        {r.modifiers.map((mod: any, mIdx: number) => {
                                                            const isShellCore = mod.type === 'shell_core';
                                                            const iconName = isShellCore ? (mod.core_pattern === 'grid' ? 'grid_4x4' : mod.core_pattern === 'hex' ? 'hexagon' : 'texture') : 'layers';
                                                            const title = isShellCore ? `${mod.core_pattern || 'Solid'} Pattern` : `${mod.type || 'Unknown'} Modifier`;
                                                            const configEntries = Object.entries(mod).filter(([k]) => k !== 'type' && k !== 'core_pattern');

                                                            return (
                                                                <div key={mIdx} className="flex items-start gap-2 text-xs">
                                                                    <Icon name={iconName} className="text-slate-400 dark:text-slate-500 text-[16px] mt-0.5" />
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-slate-700 dark:text-slate-300 capitalize">{title}</span>
                                                                        <span className="text-slate-500 dark:text-slate-400 text-[10px] font-mono mt-0.5 max-w-[200px] sm:max-w-[400px] break-words">
                                                                            {configEntries.length > 0 ? configEntries.map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Default / None'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 3: Evaluation (Post-Flight) */}
                    <div className="md:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm mt-2">
                        <h3 className="text-lg font-bold border-b border-slate-100 dark:border-slate-700 pb-3 block mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Icon name="rate_review" className="text-amber-500" />
                                Post-Print Evaluation
                            </div>

                            <button
                                onClick={handleSaveEvaluation}
                                disabled={saving}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-md font-bold text-sm transition-colors shadow-sm ${saving ? 'bg-slate-300 text-slate-600 cursor-not-allowed' : 'bg-primary hover:bg-opacity-90 text-white'
                                    }`}
                            >
                                <Icon name={saving ? "sync" : "save"} className={saving ? "animate-spin" : ""} />
                                {saving ? 'Saving...' : 'Save Evaluation'}
                            </button>
                        </h3>

                        <div className="flex flex-col md:flex-row gap-8">
                            {/* Star Rating */}
                            <div className="w-full md:w-1/3">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">Overall Success Rating</label>
                                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 justify-center">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <button
                                            key={star}
                                            type="button"
                                            onClick={() => setRating(star)}
                                            className="p-1 hover:scale-110 transition-transform outline-none"
                                        >
                                            <Icon
                                                name={star <= rating ? "star" : "star_outline"}
                                                className={`text-4xl ${star <= rating ? 'text-amber-400 filter drop-shadow-md' : 'text-slate-300 dark:text-slate-600'}`}
                                            />
                                        </button>
                                    ))}
                                </div>
                                {rating > 0 && <p className="text-center font-bold text-sm text-slate-500 mt-3">{rating} out of 5 stars</p>}
                                {rating === 0 && <p className="text-center italic text-sm text-slate-400 mt-3">Unrated</p>}
                            </div>

                            {/* Notes */}
                            <div className="flex-1">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Conclusions & Observations</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="E.g. The patterns effectively distributed the load, but exposure time was slightly high causing minor over-curing at the edges..."
                                    className="w-full h-32 md:h-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none text-slate-800 dark:text-slate-100 custom-scrollbar"
                                />
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
