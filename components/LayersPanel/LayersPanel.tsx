import React, { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import { MULTIWELL_SPECS } from '../../constants/wellplate';

// Steps imports
import { Step1Environment } from './Step1Environment';
import { Step2Models } from './Step2Models';
import { Step4Settings } from './Step4Settings';
import { Step5Advanced } from './Step5Advanced';
import { Step6Slice } from './Step6Slice';

// Contexts
import { useUIContext } from '../../contexts/UIContext';
import { useProjectContext } from '../../contexts/ProjectContext';
import { BACKEND_URL } from '../../config';
import { getStepBlocker, WorkflowValidationContext } from '../../utils/workflowValidation';
import { buildPoreProtocolPreflight } from '../../utils/poreProtocol';
import { PanelEdgeToggle } from '../PanelEdgeToggle';

export const LayersPanel: React.FC = () => {
  const { ui } = useUIContext();
  const { project, slicer } = useProjectContext();
  
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dryRunStatus, setDryRunStatus] = useState<'not_run' | 'ready' | 'blocked'>('not_run');
  const visibleSteps = [1, 2, 4, 5, 6] as const;
  const activeStepIndex = visibleSteps.indexOf(ui.activeStep as typeof visibleSteps[number]);
  const previousStep = activeStepIndex > 0 ? visibleSteps[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex >= 0 && activeStepIndex < visibleSteps.length - 1
    ? visibleSteps[activeStepIndex + 1]
    : null;
  const workflowContext: WorkflowValidationContext = {
    globalSettings: project.globalSettings,
    models: project.models,
    toolheads: project.toolheads,
    zZones: project.zZones,
    selectedMaterials: project.selectedMaterials,
  };
  const visibleValidationError = validationError || ui.workflowNotice;
  const porePreflight = buildPoreProtocolPreflight({
    globalSettings: project.globalSettings,
    models: project.models,
    zZones: project.zZones,
    toolheads: project.toolheads,
    selectedMaterials: project.selectedMaterials,
    userMaterials: project.userMaterials,
  });

  useEffect(() => {
    setDryRunStatus('not_run');
  }, [slicer.gcodePreviewJob?.jobId]);

  useEffect(() => {
    if (ui.activeStep === 3) ui.setActiveStep(4);
  }, [ui.activeStep, ui]);
  
  // Clone to wells state
  const [cloneWellDialogFor, setCloneWellDialogFor] = useState<string | null>(null);
  const [selectedCloneWells, setSelectedCloneWells] = useState<Set<string>>(new Set());

  const handleExecutePrint = async () => {
    if (!slicer.gcodePreviewJob?.jobId) return;
    try {
      const dryRun = await fetch(`${BACKEND_URL}/moonraker/print/dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: slicer.gcodePreviewJob.jobId }),
      });
      const report = await dryRun.json();
      if (!dryRun.ok || report.status !== 'ready') {
        setDryRunStatus('blocked');
        const message = report.issues?.map((issue: { message: string }) => issue.message).join('\n') || 'Dry-run blocked the print.';
        setValidationError(message);
        return;
      }
      setDryRunStatus('ready');
      if (!window.confirm(`Dry-run OK: ${report.summary?.pore_injection_blocks ?? 0} pore injection blocks. Send this protocol to the printer?`)) return;
      const res = await fetch(`${BACKEND_URL}/moonraker/print/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: slicer.gcodePreviewJob.jobId }),
      });
      if (!res.ok) alert(`Print failed: ${await res.text()}`);
    } catch (err) {
      setDryRunStatus('blocked');
      setValidationError(`Dry-run failed: ${(err as Error).message}`);
    }
  };

  const handleOpenCloneDialog = (modelId: string, initialWellId?: string) => {
    setCloneWellDialogFor(modelId);
    setSelectedCloneWells(new Set(initialWellId ? [initialWellId] : []));
  };

  return (
    <div className="relative flex-shrink-0 flex items-center z-10 h-full bg-transparent">
      <PanelEdgeToggle
        edge="right"
        collapsed={ui.isPanelCollapsed}
        onToggle={() => ui.setIsPanelCollapsed(!ui.isPanelCollapsed)}
        panelName="workflow panel"
      />

      <div className={`h-full overflow-hidden bg-transparent transition-[width] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${ui.isPanelCollapsed ? 'w-0' : 'w-[428px]'}`}>
      <aside className={`mx-1 my-2 h-[calc(100%-1rem)] w-[420px] overflow-hidden rounded-xl border border-slate-200/90 bg-surface-light flex flex-col transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none dark:border-slate-700/80 dark:bg-surface-dark ${ui.isPanelCollapsed ? 'pointer-events-none -translate-x-4 opacity-0' : 'translate-x-0 opacity-100'}`}>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 py-2 space-y-2 pb-64">
        {ui.activeStep === 1 && (
          <Step1Environment
            globalSettings={project.globalSettings}
            onUpdateGlobalSettings={project.setGlobalSettings}
            toolheads={project.toolheads}
            onUpdateToolheads={project.setToolheads}
            onOpenHelp={ui.setHelpTopic}
          />
        )}

        {ui.activeStep === 2 && (
          <Step2Models
            models={project.models}
            selectedModelId={project.selectedModelId}
            onSelectModel={project.setSelectedModelId}
            onDeleteModel={project.handleDeleteModel}
            onFileUpload={project.handleFileUpload}
            onCreateBasicShape={project.handleCreateBasicShape}
            globalSettings={project.globalSettings}
            onOpenCloneDialog={handleOpenCloneDialog}
          />
        )}

        {ui.activeStep === 4 && (
          <Step4Settings
            globalSettings={project.globalSettings}
            onUpdateGlobalSettings={project.setGlobalSettings}
            onOpenHelp={ui.setHelpTopic}
            toolheads={project.toolheads}
            onUpdateToolheads={project.setToolheads}
            selectedMaterials={project.selectedMaterials}
            userMaterials={project.userMaterials}
            onAssignMaterial={project.applyMaterialToToolhead}
            models={project.models}
            selectedModelId={project.selectedModelId}
            onSelectModel={project.setSelectedModelId}
            onUpdateModel={project.handleUpdateModel}
          />
        )}

        {ui.activeStep === 5 && (
          <Step5Advanced
            zZones={project.zZones}
            onUpdateZZones={project.setZZones}
            models={project.models}
            toolheads={project.toolheads}
            globalSettings={project.globalSettings}
            onUpdateGlobalSettings={project.setGlobalSettings}
          />
        )}

        {ui.activeStep === 6 && (
          <Step6Slice
             models={project.models}
             globalSettings={project.globalSettings}
             zZones={project.zZones}
             toolheads={project.toolheads}
             selectedMaterials={project.selectedMaterials}
             userMaterials={project.userMaterials}
             dryRunStatus={dryRunStatus}
             jobInfo={slicer.gcodePreviewJob}
             onSaveToGallery={project.handleSaveToGallery}
          />
        )}
      </div>

      {/* VALIDATION MESSAGE */}
      {visibleValidationError && (
        <div className="mx-3 mb-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 animate-in slide-in-from-bottom-2">
          <Icon name="warning" className="text-red-500 text-sm flex-shrink-0" />
          <span className="text-[11px] text-red-700 dark:text-red-400 font-medium">{visibleValidationError}</span>
        </div>
      )}

      {/* STEPPER WIZARD FOOTER */}
      <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-surface-dark flex items-center justify-between z-10 flex-shrink-0 gap-2">
          <button 
             disabled={previousStep === null}
             onClick={() => {
               setValidationError(null);
               ui.setWorkflowNotice(null);
               if (previousStep !== null) ui.setActiveStep(previousStep);
             }}
             className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[11px] rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1.5"
          >
              <Icon name="arrow_back" className="text-[12px]" /> Back
          </button>

          {/* Step indicator pills */}
          <div className="flex items-center gap-1">
            {visibleSteps.map((s, index) => (
              <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${
                s === ui.activeStep ? 'w-4 bg-primary' : index < activeStepIndex ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-slate-200 dark:bg-slate-700'
              }`} />
            ))}
          </div>

          {nextStep !== null ? (
              <button 
                 onClick={() => {
                    const blocker = getStepBlocker(workflowContext, ui.activeStep as 1 | 2 | 3 | 4 | 5 | 6);
                    if (blocker) {
                      setValidationError(blocker.message);
                      ui.setWorkflowNotice(null);
                      return;
                    }
                    setValidationError(null);
                    ui.setWorkflowNotice(null);
                    ui.setActiveStep(nextStep);
                 }}
                 className="px-4 py-1.5 bg-primary hover:bg-primary-dark text-white font-medium text-[11px] rounded-md transition-colors flex items-center gap-1.5"
              >
                  Next <Icon name="arrow_forward" className="text-[12px]" />
              </button>
          ) : (
              <button
                onClick={() => {
                  const blocker = getStepBlocker(workflowContext, 6);
                  if (blocker) {
                    setValidationError(blocker.message);
                    ui.setActiveStep(blocker.step);
                    return;
                  }
                  if (porePreflight.status === 'blocked') {
                    setValidationError(porePreflight.issues.find(issue => issue.severity === 'blocked')?.message || 'Pore Injection preflight is incomplete.');
                    ui.setActiveStep(6);
                    return;
                  }
                  if (slicer.gcodePreviewJob && !slicer.isSlicing) {
                    handleExecutePrint();
                  } else if (!slicer.isSlicing) {
                    slicer.handleSlice();
                  }
                }}
                className={`flex-1 py-1.5 px-4 text-[11px] font-medium rounded-md transition-all flex items-center justify-center gap-2 overflow-hidden relative ${
                  slicer.gcodePreviewJob
                    ? 'bg-primary hover:bg-primary-dark text-white'
                    : slicer.isSlicing
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-primary hover:bg-primary-dark text-white'
                }`}
              >
                {slicer.isSlicing && (
                  <div
                    className="absolute left-0 top-0 h-full bg-primary/20 transition-all duration-300 border-r border-primary/50"
                    style={{ width: `${Math.round(slicer.slicePercent * 100)}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {slicer.isSlicing && <Icon name="refresh" className="animate-spin text-[12px]" />}
                  {slicer.gcodePreviewJob
                    ? 'Execute print'
                    : slicer.isSlicing
                      ? `Slicing… ${Math.round(slicer.slicePercent * 100)}%`
                      : 'Build'}
                </span>
                {!slicer.isSlicing && <Icon name={slicer.gcodePreviewJob ? 'play_arrow' : 'build'} className="text-[13px] relative z-10" />}
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
              <p className="text-[11px] text-slate-500 mb-3 font-medium leading-relaxed">
                Select the target wells to distribute clones of the selected model. Each clone will automatically inherit all transformation, setting patterns, and feature overrides.
              </p>
              
              {(() => {
                const format = project.globalSettings.printBed?.multiwellFormat ?? 24;
                const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                const targetModel = cloneWellDialogFor ? project.models.find(m => m.id === cloneWellDialogFor) : undefined;
                const maxFootprintMm = targetModel?.size ? Math.hypot(targetModel.size.x, targetModel.size.y) : 0;
                const isOverflow = targetModel?.size && spec && (maxFootprintMm > spec.dia);
                if (!isOverflow) return null;
                return (
                  <div className="mb-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 text-[10px] font-medium flex items-center gap-2">
                    <Icon name="warning" className="text-amber-500 text-sm shrink-0" />
                    <span>Model diagonal ({maxFootprintMm.toFixed(1)} mm for {targetModel.size!.x.toFixed(1)} x {targetModel.size!.y.toFixed(1)} mm) exceeds well inner diameter ({spec.dia} mm).</span>
                  </div>
                );
              })()}

              <div className="flex flex-col gap-2 relative bg-surface-container dark:bg-slate-800/50 p-4 border border-border-light dark:border-slate-700 rounded-xl shadow-inner">
                {(() => {
                  const format = project.globalSettings.printBed?.multiwellFormat ?? 24;
                  const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                  if (!spec) return null;
                  const baseModelWell = cloneWellDialogFor 
                    ? project.models.find(m => m.id === cloneWellDialogFor)?.transform.wellAssignment?.wellId 
                    : undefined;
                    
                  const occupiedWells = new Set(project.models
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
                      const format = project.globalSettings.printBed?.multiwellFormat ?? 24;
                      const spec = MULTIWELL_SPECS[format.toString() as keyof typeof MULTIWELL_SPECS];
                      const all = new Set<string>();
                      const baseModelWell = cloneWellDialogFor 
                        ? project.models.find(m => m.id === cloneWellDialogFor)?.transform.wellAssignment?.wellId 
                        : undefined;
                      const occupiedWells = new Set(project.models
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
                  if (project.handleCloneToWells && cloneWellDialogFor) {
                    const format = project.globalSettings.printBed?.multiwellFormat ?? 24;
                    project.handleCloneToWells(cloneWellDialogFor, Array.from(selectedCloneWells), format as 6 | 12 | 24 | 48);
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
      </div>
    </div>
  );
};
