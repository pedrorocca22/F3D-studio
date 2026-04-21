import React, { useState } from 'react';
import { Icon } from '../Icon';
import { TransformData, ModelData, SliceSettings, GlobalSettings, AdvancedSliceSettings, ToolheadConfig, ZZone } from '../../types';
import { HelpTopic } from '../HelpWiki/HelpWiki';
import { MULTIWELL_SPECS } from '../../constants/wellplate';

// Steps imports
import { Step1Environment } from './Step1Environment';
import { Step2Models } from './Step2Models';
import { Step3Mapping } from './Step3Mapping';
import { Step4Settings } from './Step4Settings';
import { Step5Advanced } from './Step5Advanced';
import { Step6Slice } from './Step6Slice';

interface LayersPanelProps {
  models: ModelData[];
  globalSettings: GlobalSettings;
  onUpdateGlobalSettings: (settings: GlobalSettings) => void;
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onDeleteModel: (id: string) => void;
  onUpdateModel: (id: string, updates: Partial<ModelData>) => void;
  onTransformChange: (data: TransformData) => void;
  onUpdateSettings: (data: SliceSettings) => void;
  onUpdateAdvancedSettings: (data: AdvancedSliceSettings) => void;
  onApplySettingsToAll: (data: SliceSettings) => void;
  onCloneToWells?: (baseModelId: string, wellIds: string[], format: 6 | 12 | 24 | 48) => void;
  isAdvancedSliceMode: boolean;
  onFileUpload: (file: File, isCube?: boolean) => void;
  setIsAdvancedSliceMode: (val: boolean) => void;
  onSlice: () => void;
  // Toolhead props
  toolheads: ToolheadConfig[];
  totalLayers: number;
  onUpdateToolheads: (toolheads: ToolheadConfig[]) => void;
  zZones: ZZone[];
  onUpdateZZones: (zones: ZZone[]) => void;
  isSlicing?: boolean;
  slicePercent?: number;
  sliceMessage?: string;
  hasGCode?: boolean;
  onPrint?: () => void;
  jobId?: string | null;
  activeStep: number;
  setActiveStep: (step: number) => void;
  onOpenHelp: (topic: HelpTopic) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  models, globalSettings, onUpdateGlobalSettings, selectedModelId, onSelectModel,
  onDeleteModel, onUpdateModel, onTransformChange, onUpdateSettings, onUpdateAdvancedSettings,
  onApplySettingsToAll, isAdvancedSliceMode, setIsAdvancedSliceMode, onSlice, onFileUpload,
  toolheads, totalLayers, onUpdateToolheads,
  zZones, onUpdateZZones,
  isSlicing, slicePercent = 0, sliceMessage = '', hasGCode, onPrint, jobId,
  activeStep, setActiveStep, onOpenHelp, onCloneToWells
}) => {
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Clone to wells state
  const [cloneWellDialogFor, setCloneWellDialogFor] = useState<string | null>(null);
  const [selectedCloneWells, setSelectedCloneWells] = useState<Set<string>>(new Set());

  const handleOpenCloneDialog = (modelId: string, initialWellId?: string) => {
    setCloneWellDialogFor(modelId);
    setSelectedCloneWells(new Set(initialWellId ? [initialWellId] : []));
  };

  const handleApplyToAll = () => {
    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) return;
    const currentSettings = selectedModel.settings || { exposureTime: 2.5, lightIntensity: 15 };
    onApplySettingsToAll(currentSettings);
  };

  return (
    <aside className="w-[420px] flex-shrink-0 bg-surface-light border-r border-border-light flex flex-col z-10 transition-all duration-300">
      
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-2 pb-2">
        {activeStep === 1 && (
          <Step1Environment
            globalSettings={globalSettings}
            onUpdateGlobalSettings={onUpdateGlobalSettings}
            toolheads={toolheads}
            onUpdateToolheads={onUpdateToolheads}
            onOpenHelp={onOpenHelp}
          />
        )}

        {activeStep === 2 && (
          <Step2Models
            models={models}
            selectedModelId={selectedModelId}
            onSelectModel={onSelectModel}
            onDeleteModel={onDeleteModel}
            onFileUpload={onFileUpload}
            globalSettings={globalSettings}
            onOpenCloneDialog={handleOpenCloneDialog}
          />
        )}

        {activeStep === 3 && (
          <Step3Mapping
            models={models}
            selectedModelId={selectedModelId}
            onSelectModel={onSelectModel}
            toolheads={toolheads}
            onUpdateModel={onUpdateModel}
            globalSettings={globalSettings}
            totalLayers={totalLayers}
            zZones={zZones}
          />
        )}

        {activeStep === 4 && (
          <Step4Settings
            globalSettings={globalSettings}
            onUpdateGlobalSettings={onUpdateGlobalSettings}
            onOpenHelp={onOpenHelp}
            onApplyToAll={handleApplyToAll}
          />
        )}

        {activeStep === 5 && (
          <Step5Advanced
            zZones={zZones}
            onUpdateZZones={onUpdateZZones}
            models={models}
            toolheads={toolheads}
            globalSettings={globalSettings}
          />
        )}

        {activeStep === 6 && (
          <Step6Slice
             models={models}
             globalSettings={globalSettings}
             zZones={zZones}
          />
        )}
      </div>

      {/* VALIDATION MESSAGE */}
      {validationError && (
        <div className="mx-3 mb-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <Icon name="warning" className="text-red-500 text-sm flex-shrink-0" />
          <span className="text-[11px] text-red-700 dark:text-red-400 font-medium">{validationError}</span>
        </div>
      )}

      {/* STEPPER WIZARD FOOTER */}
      <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-surface-dark flex items-center justify-between z-10 flex-shrink-0 gap-2">
          <button 
             disabled={activeStep === 1}
             onClick={() => {
               setValidationError(null);
               setActiveStep(activeStep - 1);
             }}
             className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[11px] rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1.5"
          >
              <Icon name="arrow_back" className="text-[12px]" /> Back
          </button>

          {/* Step indicator pills */}
          <div className="flex items-center gap-1">
            {[1,2,3,4,5,6].map(s => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                s === activeStep ? 'w-4 bg-primary' : s < activeStep ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-slate-200 dark:bg-slate-700'
              }`} />
            ))}
          </div>

          {activeStep < 6 ? (
              <button 
                 onClick={() => {
                    if (activeStep === 1) {
                      const hasTool = toolheads.some(t => t.slot !== undefined);
                      if (!hasTool) {
                        setValidationError("Assign at least one toolhead to a machine slot to continue.");
                        return;
                      }
                    }
                    if (activeStep === 2) {
                      if (models.length === 0) {
                        setValidationError("Load at least one model before proceeding.");
                        return;
                      }
                    }
                    setValidationError(null);
                    setActiveStep(activeStep === 6 ? 6 : activeStep + 1);
                 }}
                 className="px-4 py-1.5 bg-primary hover:bg-primary-dark text-white font-medium text-[11px] rounded-md transition-colors flex items-center gap-1.5"
              >
                  Next <Icon name="arrow_forward" className="text-[12px]" />
              </button>
          ) : (
              <button
                onClick={() => {
                  if (hasGCode && onPrint) {
                    onPrint();
                  } else if (!isSlicing) {
                    onSlice();
                  }
                }}
                className={`flex-1 py-1.5 px-4 text-[11px] font-medium rounded-md transition-all flex items-center justify-center gap-2 overflow-hidden relative ${
                  hasGCode
                    ? 'bg-primary hover:bg-primary-dark text-white'
                    : isSlicing
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-primary hover:bg-primary-dark text-white'
                }`}
              >
                {isSlicing && (
                  <div
                    className="absolute left-0 top-0 h-full bg-black/10 transition-all duration-300"
                    style={{ width: `${Math.round(slicePercent * 100)}%` }}
                  />
                )}
                <span className="relative z-10">
                  {hasGCode
                    ? 'Execute print'
                    : isSlicing
                      ? `Slicing… ${Math.round(slicePercent * 100)}%`
                      : 'Build'}
                </span>
                {!isSlicing && <Icon name={hasGCode ? 'play_arrow' : 'build'} className="text-[13px] relative z-10" />}
              </button>
          )}
      </div>

      {cloneWellDialogFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm overflow-hidden" onClick={() => setCloneWellDialogFor(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-[500px] flex flex-col overflow-hidden max-h-[85vh] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="py-3 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">Clone Model</h3>
              <button onClick={() => setCloneWellDialogFor(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-red-500 transition-colors">
                <Icon name="close" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
              <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">
                Select the target wells to distribute clones of the selected model. Each clone will automatically inherit all transformation, setting patterns, and feature overrides.
              </p>
              
              <div className="flex flex-col gap-2 relative bg-surface-container dark:bg-slate-800/50 p-4 border border-border-light dark:border-slate-700 rounded-xl shadow-inner">
                {(() => {
                  const format = globalSettings.printBed?.multiwellFormat ?? 24;
                  const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                  if (!spec) return null;
                  const baseModelWell = cloneWellDialogFor 
                    ? models.find(m => m.id === cloneWellDialogFor)?.transform.wellAssignment?.wellId 
                    : undefined;
                    
                  const occupiedWells = new Set(models
                    .map(m => m.transform.wellAssignment?.wellId)
                    .filter(w => w && w !== baseModelWell) as string[]);

                  const rows = [];
                  for (let r = 0; r < spec.rows; r++) {
                    const cols = [];
                    for (let c = 0; c < spec.cols; c++) {
                      const wellId = String.fromCharCode(65 + r) + (c + 1);
                      const isSelected = selectedCloneWells.has(wellId);
                      const isOccupied = occupiedWells.has(wellId);
                      
                      cols.push(
                        <button
                          key={wellId}
                          disabled={isOccupied}
                          title={isOccupied ? "Well already occupied by another model" : undefined}
                          onClick={() => {
                            if (isOccupied) return;
                            setSelectedCloneWells(prev => {
                              const next = new Set(prev);
                              if (next.has(wellId)) next.delete(wellId);
                              else next.add(wellId);
                              return next;
                            });
                          }}
                          className={`
                            relative ${spec.cols > 6 ? 'w-8 h-8 text-[8px]' : 'w-10 h-10 text-[10px]'} rounded-full border-2 transition-all flex items-center justify-center font-bold
                            ${isOccupied
                                ? 'bg-slate-200 border-slate-300 text-slate-400 dark:bg-slate-700/50 dark:border-slate-700 dark:text-slate-500 cursor-not-allowed opacity-60'
                                : isSelected 
                                  ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(22,163,74,0.2)] scale-110' 
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-400 hover:border-primary/50 hover:text-primary hover:scale-[1.05]'
                            }
                          `}
                        >
                          {wellId}
                        </button>
                      );
                    }
                    rows.push(<div key={r} className="flex gap-2 justify-center">{cols}</div>);
                  }
                  return rows;
                })()}
              </div>

              <div className="mt-4 flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md uppercase tracking-wider">
                  <span className="text-primary">{selectedCloneWells.size}</span> wells selected
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const format = globalSettings.printBed?.multiwellFormat ?? 24;
                      const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                      const all = new Set<string>();
                      const baseModelWell = cloneWellDialogFor 
                        ? models.find(m => m.id === cloneWellDialogFor)?.transform.wellAssignment?.wellId 
                        : undefined;
                      const occupiedWells = new Set(models
                        .map(m => m.transform.wellAssignment?.wellId)
                        .filter(w => w && w !== baseModelWell) as string[]);
                      
                      for (let r = 0; r < spec.rows; r++) {
                        for (let c = 0; c < spec.cols; c++) {
                          const w = String.fromCharCode(65 + r) + (c + 1);
                          if (!occupiedWells.has(w)) all.add(w);
                        }
                      }
                      setSelectedCloneWells(all);
                    }}
                    className="text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary-dark transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button 
                    onClick={() => setSelectedCloneWells(new Set())}
                    className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 shrink-0">
              <button 
                onClick={() => setCloneWellDialogFor(null)} 
                className="px-4 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-bold uppercase tracking-widest rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  if (onCloneToWells && cloneWellDialogFor) {
                    const format = globalSettings.printBed?.multiwellFormat ?? 24;
                    onCloneToWells(cloneWellDialogFor, Array.from(selectedCloneWells), format as 6 | 12 | 24 | 48);
                    setCloneWellDialogFor(null);
                  }
                }} 
                className="px-4 py-1.5 text-[11px] text-white bg-primary font-bold uppercase tracking-widest rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed shadow-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
