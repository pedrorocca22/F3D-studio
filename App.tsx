import React from 'react';
import { Header } from './components/Header';
import { WifiConfig } from './components/WifiConfig/WifiConfig';
import { LayersPanel } from './components/LayersPanel/LayersPanel';
import { Viewport } from './components/Viewport/Viewport';
import { HelpWiki } from './components/HelpWiki/HelpWiki';
import { ProjectGallery } from './components/Gallery/ProjectGallery';

// Contexts
import { useUIContext } from './contexts/UIContext';
import { useProjectContext } from './contexts/ProjectContext';

export default function App() {
  const { ui } = useUIContext();
  const { project } = useProjectContext();

  // Drag & Drop Handlers
  const handleDragEvents = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) ui.setIsDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      ui.setIsDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      ui.setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.stl'));
      files.forEach(f => project.handleFileUpload(f));
    }
  };

  return (
    <div
      className="h-screen w-screen flex flex-col bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 transition-colors duration-200 relative"
      {...handleDragEvents}
    >
      <Header
        darkMode={ui.darkMode}
        toggleDarkMode={ui.toggleDarkMode}
        onSaveProject={project.handleSaveProject}
        onLoadProject={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.bpp,.zip';
          input.onchange = (e: any) => e.target.files?.[0] && project.handleLoadProject(e.target.files[0]);
          input.click();
        }}
        onOpenWifi={() => ui.setIsWifiOpen(true)}
        activeStep={ui.activeStep}
        setActiveStep={ui.setActiveStep}
        currentView={ui.currentView}
        setCurrentView={ui.setCurrentView}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {ui.currentView === 'gallery' ? (
          <ProjectGallery />
        ) : (
          <>
            <LayersPanel />
            <main className="flex-1 relative overflow-hidden bg-slate-100 dark:bg-slate-950">
              <Viewport />
              {ui.isWifiOpen && <WifiConfig onClose={() => ui.setIsWifiOpen(false)} />}
              {ui.isDragging && (
                <div className="absolute inset-4 z-50 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 backdrop-blur-sm flex flex-col items-center justify-center text-primary pointer-events-none">
                  <span className="text-sm font-medium">Drop STL file here</span>
                </div>
              )}
            </main>
          </>
        )}
      </div>

      <HelpWiki topic={ui.helpTopic} onClose={() => ui.setHelpTopic(null)} />
    </div>
  );
}