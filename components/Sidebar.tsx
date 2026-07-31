import React from 'react';
import { Icon } from './Icon';
import { useUIContext } from '../contexts/UIContext';
import { useProjectContext } from '../contexts/ProjectContext';
import { getStepBlocker } from '../utils/workflowValidation';
import { AppSettingsDialog } from './AppSettingsDialog';

interface SidebarProps {
  activeStep: number;
  setActiveStep: (step: number) => void;
  currentView: 'editor' | 'gallery';
  setCurrentView: (view: 'editor' | 'gallery') => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
}

const STEPS = [
  { id: 1, label: 'Surface', icon: 'view_quilt' },
  { id: 2, label: 'Models', icon: 'view_in_ar' },
  { id: 4, label: 'Settings', icon: 'settings' },
  { id: 5, label: 'Advance', icon: 'tune' },
  { id: 6, label: 'Slice', icon: 'layers' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeStep,
  setActiveStep,
  currentView,
  setCurrentView,
  onSaveProject,
  onLoadProject,
}) => {
  const { ui } = useUIContext();
  const { project } = useProjectContext();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);

  return (
    <aside className="w-[68px] flex-shrink-0 bg-white dark:bg-surface-dark border-r border-slate-100 dark:border-slate-800 flex flex-col items-center py-6 z-50 relative transition-all duration-300">
        {/* Toggle Button - Internal for when expanded? No, let's put it outside */}
      
      {/* Branding - Dropdown Menu Button */}
      <div className="mb-8 relative">
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${isMenuOpen ? 'bg-primary text-white' : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-primary'}`}
        >
          <Icon name={isMenuOpen ? 'close' : 'menu'} className="text-lg" />
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute left-[52px] top-0 w-40 bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md border border-slate-100 dark:border-slate-800 rounded-lg shadow-lg z-50 py-1.5 animate-in slide-in-from-left-1 duration-200">
            <div className="px-3 py-1 mb-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Project</span>
            </div>
            <button 
              onClick={() => { onLoadProject(); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Icon name="folder_open" className="text-base" />
              <span>Load</span>
            </button>
            <button 
              onClick={() => { onSaveProject(); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Icon name="save" className="text-base" />
              <span>Save</span>
            </button>
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2" />
            <button 
              onClick={() => { setCurrentView('gallery'); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Icon name="home" className="text-base" />
              <span>Gallery</span>
            </button>
            <button
              onClick={() => { setIsSettingsOpen(true); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Icon name="settings" className="text-base" />
              <span>Settings</span>
            </button>
            <button
              onClick={() => { ui.setHelpTopic('getting_started'); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Icon name="menu_book" className="text-base" />
              <span>User guide</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Steps */}
      <div className="flex-1 flex flex-col items-center gap-1">
        {STEPS.map((step, idx) => {
          const isActive = activeStep === step.id && currentView === 'editor';
          const isDone = activeStep > step.id;

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={() => {
                  if (step.id > activeStep) {
                    const previousVisibleStep = idx > 0 ? STEPS[idx - 1].id : 1;
                    const blocker = getStepBlocker(
                      {
                        globalSettings: project.globalSettings,
                        models: project.models,
                        toolheads: project.toolheads,
                        zZones: project.zZones,
                        selectedMaterials: project.selectedMaterials,
                      },
                      previousVisibleStep as 1 | 2 | 3 | 4 | 5 | 6,
                    );
                    if (blocker) {
                      ui.setWorkflowNotice(blocker.message);
                      ui.setActiveStep(blocker.step);
                      setCurrentView('editor');
                      return;
                    }
                  }
                  ui.setWorkflowNotice(null);
                  setActiveStep(step.id);
                  setCurrentView('editor');
                }}
                className="group relative flex flex-col items-center gap-1 w-12"
                title={step.label}
              >
                {/* Active Indicator Line */}
                {isActive && (
                  <div className="absolute -left-3 top-2 bottom-2 w-[3px] bg-primary rounded-r-full animate-in slide-in-from-left-1 duration-300" />
                )}

                {/* Icon Container */}
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
                    ${isActive 
                      ? 'bg-primary text-white' 
                      : isDone
                        ? 'text-green-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                >
                  <Icon 
                    name={step.icon} 
                    className={`text-xl transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} 
                  />
                </div>
              </button>

              {/* Minimal Divider */}
              {idx < STEPS.length - 1 && (
                <div className="w-6 h-px bg-slate-100 dark:bg-slate-800 my-1" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom Actions - Protocol Archive / Settings etc */}
      <div className="mt-auto flex flex-col gap-4 pb-4">
        <button
          onClick={() => setCurrentView('gallery')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${currentView === 'gallery' ? 'bg-primary text-white' : 'text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          title="Protocol Archive"
        >
          <Icon name="archive" className="text-xl" />
        </button>
      </div>

      {isSettingsOpen && (
        <AppSettingsDialog
          globalSettings={project.globalSettings}
          onUpdateGlobalSettings={project.setGlobalSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </aside>
  );
};
