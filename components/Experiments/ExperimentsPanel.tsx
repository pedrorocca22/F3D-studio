import React, { useEffect, useState } from 'react';
import { Icon } from '../Icon';

interface Experiment {
    id: string;
    name: string;
    author?: string;
    intent: string;
    status: string;
    material: string;
    created_at: string;
    rating: number | null;
}

interface ExperimentsPanelProps {
    onClose: () => void;
    onReplicate: (experimentId: string) => void;
    onViewDetails: (experimentId: string) => void;
    onOpenPreview: (experimentId: string) => void;
}

export const ExperimentsPanel: React.FC<ExperimentsPanelProps> = ({ onClose, onReplicate, onViewDetails, onOpenPreview }) => {
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://127.0.0.1:8000/api/experiments')
            .then(res => res.json())
            .then(data => {
                setExperiments(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this experiment and all its sliced files? This cannot be undone.")) return;

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/experiments/${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error("Failed to delete");
            setExperiments(prev => prev.filter(exp => exp.id !== id));
        } catch (err) {
            alert("Error deleting experiment.");
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-background-light dark:bg-background-dark overflow-hidden relative">
            <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-4 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Icon name="history" className="text-primary" />
                        Experiment History
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Track, evaluate, and replicate previous print jobs.
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md text-sm font-semibold transition-colors"
                >
                    <Icon name="arrow_back" /> Back to Design
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <span className="text-slate-500">Loading history...</span>
                    </div>
                ) : experiments.length === 0 ? (
                    <div className="text-center py-20 px-4">
                        <Icon name="science" className="text-6xl text-slate-300 dark:text-slate-700 mb-4" />
                        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300">No experiments yet</h3>
                        <p className="text-slate-500 mt-2">Your printed jobs will appear here for traceability.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full pb-10">
                        {experiments.map(exp => {
                            let statusColor = 'border-slate-200';
                            let iconName = 'science';
                            let iconColor = 'text-slate-400';
                            let statusText = exp.status;

                            if (exp.status === 'done') {
                                statusColor = 'border-l-4 border-l-green-500 bg-green-50/20 dark:bg-green-900/10';
                                iconColor = 'text-green-600 dark:text-green-400';
                                iconName = 'check_circle';
                            } else if (['sliced', 'printing', 'pending'].includes(exp.status)) {
                                statusColor = 'border-l-4 border-l-blue-500 bg-blue-50/20 dark:bg-blue-900/10';
                                iconColor = 'text-blue-600 dark:text-blue-400';
                                iconName = exp.status === 'printing' ? 'print' : 'layers';
                            } else if (['error', 'slicing_error', 'cancelled'].includes(exp.status)) {
                                statusColor = 'border-l-4 border-l-red-500 bg-red-50/20 dark:bg-red-900/10';
                                iconColor = 'text-red-600 dark:text-red-400';
                                iconName = 'error';
                            } else {
                                statusColor = 'border-l-4 border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-800';
                            }

                            return (
                                <div key={exp.id} className={`border-y border-r border-slate-200 dark:border-slate-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-all flex items-center gap-4 group cursor-pointer ${statusColor}`} onClick={() => onViewDetails(exp.id)}>
                                    <div className={`p-2 rounded-full ${iconColor} bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 flex-shrink-0`}>
                                        <Icon name={iconName} className="text-xl" />
                                    </div>

                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-[15px] truncate">
                                                {exp.name || `Experiment ${exp.id.substring(0, 8)}`}
                                            </h3>
                                            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-sm ${['done'].includes(exp.status) ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                                                    ['sliced', 'printing', 'pending'].includes(exp.status) ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                                                        ['error', 'slicing_error', 'cancelled'].includes(exp.status) ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                                                            'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                }`}>
                                                {statusText}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2 truncate">
                                            <span>{new Date(exp.created_at).toLocaleString()}</span>
                                            {exp.author && (
                                                <>
                                                    <span className="text-slate-300 dark:text-slate-600">•</span>
                                                    <span className="flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300"><Icon name="person" className="text-[11px] text-primary" /> {exp.author}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="hidden md:flex flex-col flex-1 pl-4 border-l border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400 justify-center min-w-0">
                                        <div className="truncate mb-0.5"><span className="font-semibold text-slate-600 dark:text-slate-300">Intent:</span> {exp.intent || 'N/A'}</div>
                                        <div className="truncate"><span className="font-semibold text-slate-600 dark:text-slate-300">Material:</span> {exp.material || 'Unknown'}</div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onOpenPreview(exp.id); }}
                                            className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md text-xs font-bold transition-colors flex items-center gap-1"
                                            title="Preview Job"
                                        >
                                            <Icon name="visibility" className="text-[15px]" />
                                            <span className="hidden sm:inline">Preview</span>
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(exp.id, e)}
                                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/40 text-red-500 rounded-md transition-colors"
                                            title="Delete Experiment"
                                        >
                                            <Icon name="delete" className="text-[16px]" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
