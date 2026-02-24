import React, { useEffect, useState } from 'react';
import { Icon } from '../Icon';

interface Experiment {
    id: string;
    name: string;
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {experiments.map(exp => (
                            <div key={exp.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col group">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1 pr-2">
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg line-clamp-1">
                                            {exp.name || `Experiment ${exp.id.substring(0, 6)}`}
                                        </h3>
                                        <span className={`inline-block mt-1 text-[10px] uppercase font-bold px-2 py-1 rounded-full ${['done', 'sliced', 'printing'].includes(exp.status) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                            exp.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                            }`}>
                                            {exp.status}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(exp.id, e)}
                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/40 text-red-400 hover:text-red-600 rounded-md transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                                        title="Delete Experiment"
                                    >
                                        <Icon name="delete" className="text-sm" />
                                    </button>
                                </div>

                                <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-mono">
                                    {new Date(exp.created_at).toLocaleString()}
                                </div>

                                <div className="mb-4 flex-1">
                                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">
                                        <span className="font-semibold mr-1">Intent:</span>
                                        {exp.intent || 'No intent recorded.'}
                                    </p>
                                    {exp.material && (
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                                            <span className="font-semibold mr-1">Material:</span>
                                            {exp.material}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-1 mb-4">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <Icon
                                            key={star}
                                            name="star"
                                            className={`text-lg ${star <= (exp.rating || 0) ? 'text-amber-400' : 'text-slate-200 dark:text-slate-700'}`}
                                        />
                                    ))}
                                    {!exp.rating && <span className="text-xs text-slate-400 ml-2 italic">Unrated</span>}
                                </div>

                                <div className="flex items-center gap-2 mt-auto pt-4 border-t border-slate-100 dark:border-slate-700">
                                    <button
                                        onClick={() => onViewDetails(exp.id)}
                                        className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        <Icon name="info" className="text-sm" /> Details
                                    </button>
                                    <button
                                        onClick={() => onOpenPreview(exp.id)}
                                        className="flex-1 py-1.5 bg-primary hover:opacity-90 text-white rounded text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                        <Icon name="visibility" className="text-sm" /> Preview
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
