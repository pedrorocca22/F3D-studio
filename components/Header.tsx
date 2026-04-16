import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface HeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;

  onOpenWifi?: () => void;
  onOpenPrinterStatus?: () => void;
  activeStep: number;
  setActiveStep: (step: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  darkMode, toggleDarkMode, onSaveProject, onLoadProject,
  onOpenWifi, onOpenPrinterStatus,
  activeStep, setActiveStep
}) => {
  const [printerState, setPrinterState] = useState<'unknown' | 'ready' | 'printing' | 'error'>('unknown');

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('http://127.0.0.1:8000/moonraker/status', { signal: AbortSignal.timeout(3000) });
        if (r.ok) {
          const d = await r.json();
          const state = d?.print?.state ?? 'idle';
          if (state === 'printing') setPrinterState('printing');
          else setPrinterState('ready');
        } else {
          setPrinterState('error');
        }
      } catch {
        setPrinterState('error');
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  const stateColor: Record<string, string> = {
    unknown: 'bg-slate-400',
    ready: 'bg-primary',
    printing: 'bg-amber-400 animate-pulse',
    error: 'bg-red-500',
  };
  const stateLabel: Record<string, string> = {
    unknown: 'Connecting…',
    ready: 'Printer Ready',
    printing: 'Printing',
    error: 'Offline',
  };

  return (
    <>
      {/* Main Header */}
      <header className="h-10 flex-shrink-0 bg-surface-light dark:bg-surface-dark border-b border-outline-variant/20 text-slate-700 dark:text-slate-300 flex items-center justify-between px-4 z-20 relative">
        {/* Wordmark */}
        <div className="flex items-center gap-2 select-none">
          <span className="font-bold tracking-tight text-xs text-slate-800 dark:text-slate-100">
            Aura<span className="text-primary font-normal">Biotics</span>
          </span>
        </div>

        {/* Stepper Center */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
          {[
            { id: 1, label: 'Environment' },
            { id: 2, label: 'Models' },
            { id: 3, label: 'Mapping' },
            { id: 4, label: 'Configuration' },
            { id: 5, label: 'Slice' }
          ].map(step => (
            <button 
              key={step.id}
              onClick={() => setActiveStep(step.id)} 
              className={`px-4 h-10 text-[10px] font-bold uppercase tracking-widest transition-all duration-200 border-x border-transparent ${
                  activeStep === step.id 
                  ? 'bg-surface-container-low text-primary border-outline-variant/20' 
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              {step.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Printer Status chip - ultra compact */}
          <button
            onClick={onOpenPrinterStatus}
            className="hidden md:flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700/50 bg-transparent dark:bg-transparent hover:bg-slate-50/50 dark:hover:bg-slate-800/30 text-[9px] font-medium text-slate-500 dark:text-slate-400 transition-all btn-transition"
          >
            <span className={`w-1 h-1 rounded-full ${stateColor[printerState]}`} />
            <span className="hidden lg:inline">{stateLabel[printerState]}</span>
          </button>

          <div className="h-3 w-px bg-slate-200/60 dark:bg-slate-700/60" />

          <div className="flex items-center gap-0.5">
            <button onClick={onLoadProject} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 text-slate-500 dark:text-slate-400 text-[9px] font-medium rounded btn-transition">
              <Icon name="folder_open" className="text-[10px]" />
              <span className="hidden sm:inline">Load</span>
            </button>
            <button onClick={onSaveProject} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 text-slate-500 dark:text-slate-400 text-[9px] font-medium rounded btn-transition">
              <Icon name="save" className="text-[10px]" />
              <span className="hidden sm:inline">Save</span>
            </button>

          </div>

          <div className="h-3 w-px bg-slate-200/60 dark:bg-slate-700/60 mx-0.5" />

          <button
            onClick={onOpenWifi}
            className="flex items-center gap-1 bg-primary/80 hover:bg-primary text-white px-2 py-0.5 rounded text-[9px] font-medium btn-transition"
          >
            <Icon name="wifi" className="text-[10px]" />
            <span className="hidden sm:inline">Network</span>
          </button>

          <button
            className="p-1 rounded hover:bg-slate-100/50 dark:hover:bg-slate-800/30 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 btn-transition"
            onClick={toggleDarkMode}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
          >
            <Icon name={darkMode ? 'light_mode' : 'dark_mode'} className="text-[13px]" />
          </button>
        </div>
      </header>
    </>
  );
};