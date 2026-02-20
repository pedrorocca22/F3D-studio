import React, { useState } from 'react';
import { Icon } from '../Icon';
import { Pattern, Modifier } from '../../types';
import { PatternPreview } from './PatternPreview';
import { generateUUID } from '../../utils';

interface ModifiersPanelProps {
    patterns: Pattern[];
    onSavePattern: (pattern: Pattern) => void;
    onDeletePattern: (id: string) => void;
    model: import('../../types').ModelData | null;
    onUpdateModifiers: (modifiers: Modifier[]) => void;
}

export const ModifiersPanel: React.FC<ModifiersPanelProps> = ({
    patterns,
    onSavePattern,
    onDeletePattern,
    model,
    onUpdateModifiers
}) => {
    const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);
    const [view, setView] = useState<'library' | 'editor'>('library');

    const handleCreateNew = () => {
        const newPattern: Pattern = {
            id: generateUUID(),
            name: 'New Pattern',
            config: {
                type: 'shell_core',
                core_pattern: 'sponge',
                voronoi_cell_size: 1.0,
                sponge_density: 0.5,
                shell_gray: 0,
                core_gray: 255,
            }
        };
        setEditingPattern(newPattern);
        setView('editor');
    };

    const handleEdit = (p: Pattern) => {
        setEditingPattern({ ...p });
        setView('editor');
    };

    const handleSave = () => {
        if (editingPattern) {
            console.log("Saving Pattern:", editingPattern);
            onSavePattern(editingPattern);
            setEditingPattern(null);
            setView('library');
        }
    };

    const onApplyToModel = (p: Pattern, modelData: import('../../types').ModelData) => {
        if (!onUpdateModifiers) return;

        console.log("Applying Pattern Config to Model:", p.config);

        // Use a clean copy of the config
        const newMod: Modifier = JSON.parse(JSON.stringify(p.config));
        onUpdateModifiers([newMod]);
    };

    const updateDraft = (updates: Partial<Modifier>) => {
        if (editingPattern) {
            setEditingPattern({
                ...editingPattern,
                config: { ...editingPattern.config, ...updates }
            });
        }
    };

    if (view === 'editor' && editingPattern) {
        const mod = editingPattern.config;
        return (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setView('library')}
                        className="text-[10px] font-bold text-slate-400 hover:text-primary flex items-center gap-1 uppercase tracking-wider transition-colors"
                    >
                        <Icon name="arrow_back" className="text-sm" /> Library
                    </button>
                    <button
                        onClick={handleSave}
                        className="bg-primary text-white text-[10px] font-bold px-3 py-1 rounded shadow-sm hover:bg-primary/90 transition-colors uppercase"
                    >
                        Save Pattern
                    </button>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm space-y-4">
                    <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Pattern Name</label>
                        <input
                            type="text"
                            value={editingPattern.name}
                            onChange={(e) => setEditingPattern({ ...editingPattern, name: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div className="flex justify-center bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700/50">
                        <PatternPreview
                            type={mod.core_pattern || 'gradient'}
                            cellSize={(mod.core_pattern === 'voronoi' || mod.core_pattern === 'sponge') ? (mod.voronoi_cell_size || 1.0) : (mod.gradient_radius || 5.0)}
                            coreGray={(mod.core_pattern === 'voronoi' || mod.core_pattern === 'sponge') ? (mod.core_gray ?? (mod.core_pattern === 'sponge' ? 255 : 0)) : (mod.gradient_start_gray ?? 255)}
                            shellGray={(mod.core_pattern === 'voronoi' || mod.core_pattern === 'sponge') ? (mod.shell_gray ?? (mod.core_pattern === 'sponge' ? 0 : 255)) : (mod.gradient_end_gray ?? 0)}
                            power={mod.gradient_power || 1.0}
                            thickness={mod.voronoi_wall_thickness || 0.5}
                            density={mod.sponge_density || 0.5}
                            width={180}
                            height={180}
                        />
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Pattern Type</label>
                            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                                <button
                                    onClick={() => updateDraft({ core_pattern: 'gradient' })}
                                    className={`flex-1 text-[10px] py-1 rounded-md font-medium transition-colors ${mod.core_pattern !== 'voronoi' && mod.core_pattern !== 'sponge' ? 'bg-white dark:bg-slate-700 text-purple-600 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Gradient
                                </button>
                                <button
                                    onClick={() => updateDraft({ core_pattern: 'voronoi' })}
                                    className={`flex-1 text-[10px] py-1 rounded-md font-medium transition-colors ${mod.core_pattern === 'voronoi' ? 'bg-white dark:bg-slate-700 text-purple-600 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Voronoi
                                </button>
                                <button
                                    onClick={() => updateDraft({ core_pattern: 'sponge' })}
                                    className={`flex-1 text-[10px] py-1 rounded-md font-medium transition-colors ${mod.core_pattern === 'sponge' ? 'bg-white dark:bg-slate-700 text-purple-600 shadow-sm' : 'text-slate-500'}`}
                                >
                                    Sponge
                                </button>
                            </div>
                        </div>

                        {mod.core_pattern === 'sponge' ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Pore Size</label>
                                        <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus-within:border-purple-400 transition-colors">
                                            <input
                                                type="number" step="0.1" min="0.1"
                                                value={mod.voronoi_cell_size || 1.0}
                                                onChange={(e) => updateDraft({ voronoi_cell_size: parseFloat(e.target.value) })}
                                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none w-full min-w-0"
                                            />
                                            <span className="text-[8px] text-slate-400 font-bold uppercase ml-1">mm</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Density</label>
                                        <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus-within:border-purple-400 transition-colors">
                                            <input
                                                type="number" step="0.05" min="0" max="1"
                                                value={mod.sponge_density || 0.5}
                                                onChange={(e) => updateDraft({ sponge_density: parseFloat(e.target.value) })}
                                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none w-full min-w-0"
                                            />
                                            <span className="text-[8px] text-slate-400 font-bold uppercase ml-1">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Matrix Color</label>
                                        <input
                                            type="number" min="0" max="255"
                                            value={mod.shell_gray ?? 0}
                                            onChange={(e) => updateDraft({ shell_gray: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Bone Color</label>
                                        <input
                                            type="number" min="0" max="255"
                                            value={mod.core_gray ?? 255}
                                            onChange={(e) => updateDraft({ core_gray: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : mod.core_pattern === 'voronoi' ? (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Cell Size</label>
                                        <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus-within:border-purple-400 transition-colors">
                                            <input
                                                type="number" step="0.01" min="0.01"
                                                value={mod.voronoi_cell_size || 0.1}
                                                onChange={(e) => updateDraft({ voronoi_cell_size: parseFloat(e.target.value) })}
                                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none w-full min-w-0"
                                            />
                                            <span className="text-[8px] text-slate-400 font-bold uppercase ml-1">mm</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Wall Thickness</label>
                                        <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus-within:border-purple-400 transition-colors">
                                            <input
                                                type="number" step="0.001" min="0.001"
                                                value={mod.voronoi_wall_thickness || 0.01}
                                                onChange={(e) => updateDraft({ voronoi_wall_thickness: parseFloat(e.target.value) })}
                                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none w-full min-w-0"
                                            />
                                            <span className="text-[8px] text-slate-400 font-bold uppercase ml-1">mm</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Matrix Color</label>
                                        <input
                                            type="number" min="0" max="255"
                                            value={mod.shell_gray ?? 125}
                                            onChange={(e) => updateDraft({ shell_gray: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Cell Color</label>
                                        <input
                                            type="number" min="0" max="255"
                                            value={mod.core_gray ?? 150}
                                            onChange={(e) => updateDraft({ core_gray: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Radius (mm)</label>
                                        <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus-within:border-purple-400 transition-colors">
                                            <input
                                                type="number" step="0.5" min="0.5"
                                                value={mod.gradient_radius || 5.0}
                                                onChange={(e) => updateDraft({ gradient_radius: parseFloat(e.target.value) })}
                                                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none w-full min-w-0"
                                            />
                                            <span className="text-[8px] text-slate-400 font-bold uppercase ml-1">mm</span>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase mb-1">
                                            <span>Falloff</span>
                                            <span>{mod.gradient_power || 1.0}</span>
                                        </div>
                                        <input
                                            type="range" min="0.1" max="5.0" step="0.1"
                                            value={mod.gradient_power || 1.0}
                                            onChange={(e) => updateDraft({ gradient_power: parseFloat(e.target.value) })}
                                            className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Core Color</label>
                                        <input
                                            type="number" min="0" max="255"
                                            value={mod.gradient_start_gray ?? 255}
                                            onChange={(e) => updateDraft({ gradient_start_gray: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Edge Color</label>
                                        <input
                                            type="number" min="0" max="255"
                                            value={mod.gradient_end_gray ?? 0}
                                            onChange={(e) => updateDraft({ gradient_end_gray: parseInt(e.target.value) })}
                                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pattern Library</span>
                <button
                    onClick={handleCreateNew}
                    className="text-[10px] px-2 py-1 rounded font-bold bg-primary/10 hover:bg-primary/20 text-primary transition-colors flex items-center gap-1 uppercase"
                >
                    <Icon name="add" className="text-sm" /> Designer
                </button>
            </div>

            {patterns.length === 0 ? (
                <div className="text-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-2 text-slate-400">
                        <Icon name="palette" className="text-xl" />
                    </div>
                    <p className="text-xs text-slate-500 mb-2">No custom patterns saved.</p>
                    <button
                        onClick={handleCreateNew}
                        className="text-[10px] font-bold text-primary hover:underline uppercase"
                    >
                        Create your first pattern
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {patterns.map(p => (
                        <div key={p.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm group hover:border-primary/30 transition-all">
                            <div className="flex items-center gap-3 p-2">
                                <div className="w-12 h-12 rounded bg-slate-100 dark:bg-slate-900 overflow-hidden border border-slate-100 dark:border-slate-700 shrink-0">
                                    <PatternPreview
                                        type={p.config.core_pattern || 'gradient'}
                                        cellSize={(p.config.core_pattern === 'voronoi' || p.config.core_pattern === 'sponge') ? (p.config.voronoi_cell_size || 1.0) : (p.config.gradient_radius || 5.0)}
                                        coreGray={(p.config.core_pattern === 'voronoi' || p.config.core_pattern === 'sponge') ? (p.config.core_gray ?? (p.config.core_pattern === 'sponge' ? 255 : 0)) : (p.config.gradient_start_gray ?? 255)}
                                        shellGray={(p.config.core_pattern === 'voronoi' || p.config.core_pattern === 'sponge') ? (p.config.shell_gray ?? (p.config.core_pattern === 'sponge' ? 0 : 255)) : (p.config.gradient_end_gray ?? 0)}
                                        power={p.config.gradient_power || 1.0}
                                        thickness={p.config.voronoi_wall_thickness || 0.5}
                                        density={p.config.sponge_density || 0.5}
                                        width={48}
                                        height={48}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</h3>
                                    <p className="text-[10px] text-slate-400 capitalize">{p.config.core_pattern}</p>
                                </div>
                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleEdit(p)}
                                        className="p-1 text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                                        title="Edit Pattern"
                                    >
                                        <Icon name="edit" className="text-xs" />
                                    </button>
                                    <button
                                        onClick={() => onDeletePattern(p.id)}
                                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                        title="Delete Pattern"
                                    >
                                        <Icon name="delete" className="text-xs" />
                                    </button>
                                </div>
                            </div>


                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
