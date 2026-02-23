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
                shell_thickness: 1.0,
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

                    <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Pattern Algorithm</label>
                        <select
                            value={mod.core_pattern || 'sponge'}
                            onChange={(e) => updateDraft({ core_pattern: e.target.value as any })}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="sponge">Sponge (Trabecular Bone)</option>
                            <option value="vascular">Vascular Tree (Perfusion)</option>
                            <option value="lattice">Lattice (Grid Matrix)</option>
                            <option value="linear">Linear (Grooves / Muscle)</option>
                            <option value="noise">Noise (Micro-Roughness)</option>
                        </select>
                    </div>

                    <div className="flex justify-center bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700/50">
                        <PatternPreview
                            type={mod.core_pattern === 'vascular' ? 'vascular' : (mod.core_pattern === 'lattice' ? 'lattice' : (mod.core_pattern === 'linear' ? 'linear' : (mod.core_pattern === 'noise' ? 'noise' : 'sponge')))}
                            cellSize={mod.voronoi_cell_size || 1.0}
                            coreGray={mod.core_gray ?? 255}
                            shellGray={mod.shell_gray ?? 0}
                            density={mod.sponge_density || 0.5}
                            width={180}
                            height={180}
                        />
                    </div>

                    {/* Dynamic settings based on pattern algorithm */}
                    <div className="space-y-3">
                        {/* Shell (cortical bone) thickness */}
                        <div>
                            <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">Shell Thickness</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range" min="0" max="5" step="0.1"
                                    value={mod.shell_thickness ?? 1.0}
                                    onChange={(e) => updateDraft({ shell_thickness: parseFloat(e.target.value) })}
                                    className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 w-20 focus-within:border-purple-400 transition-colors">
                                    <input
                                        type="number" step="0.1" min="0" max="5"
                                        value={mod.shell_thickness ?? 1.0}
                                        onChange={(e) => updateDraft({ shell_thickness: parseFloat(e.target.value) })}
                                        className="bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none w-full"
                                    />
                                    <span className="text-[8px] text-slate-400 font-bold uppercase ml-1">mm</span>
                                </div>
                            </div>
                        </div>
                        {/* Parameter size + Density */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">
                                    {mod.core_pattern === 'vascular' ? 'Vascular Branch Freq.' : (mod.core_pattern === 'lattice' ? 'Grid Span' : (mod.core_pattern === 'linear' ? 'Channel Span' : (mod.core_pattern === 'noise' ? 'Scale (N/A)' : 'Pore Size')))}
                                </label>
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
                                <label className="text-[9px] text-slate-400 font-bold uppercase block mb-1">
                                    {mod.core_pattern === 'vascular' ? 'Vein Width' : (mod.core_pattern === 'lattice' || mod.core_pattern === 'linear' ? 'Wall Thickness' : 'Density')}
                                </label>
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
                                        type={p.config.core_pattern === 'vascular' ? 'vascular' : (p.config.core_pattern === 'lattice' ? 'lattice' : (p.config.core_pattern === 'linear' ? 'linear' : (p.config.core_pattern === 'noise' ? 'noise' : 'sponge')))}
                                        cellSize={p.config.voronoi_cell_size || 1.0}
                                        coreGray={p.config.core_gray ?? 255}
                                        shellGray={p.config.shell_gray ?? 0}
                                        density={p.config.sponge_density || 0.5}
                                        width={48}
                                        height={48}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{p.name}</h3>
                                    <p className="text-[10px] text-slate-400">{p.config.core_pattern === 'vascular' ? 'Vascular Tree' : (p.config.core_pattern === 'lattice' ? 'Lattice Grid' : (p.config.core_pattern === 'linear' ? 'Linear Channel' : (p.config.core_pattern === 'noise' ? 'Static Noise' : 'Sponge')))}</p>
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
