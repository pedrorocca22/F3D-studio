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

const STEPS = [
  { id: 1, label: 'Environment' },
  { id: 2, label: 'Models' },
  { id: 3, label: 'Mapping' },
  { id: 4, label: 'Settings' },
  { id: 5, label: 'Advance' },
  { id: 6, label: 'Slice' },
];

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
          setPrinterState(state === 'printing' ? 'printing' : 'ready');
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
    unknown:  'bg-slate-300',
    ready:    'bg-primary',
    printing: 'bg-amber-400 animate-pulse',
    error:    'bg-red-400',
  };
  const stateLabel: Record<string, string> = {
    unknown:  'Connecting…',
    ready:    'Ready',
    printing: 'Printing',
    error:    'Offline',
  };

  return (
    <>
      <header className="h-11 flex-shrink-0 bg-white dark:bg-surface-dark border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-4 z-20 relative">

        {/* Wordmark */}
        <div className="flex items-center gap-2 select-none min-w-[100px]">
          <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[9px] font-bold">B</span>
          </div>
          <span className="font-semibold text-[13px] text-slate-800 dark:text-slate-100 tracking-tight">
            Bio<span className="text-primary">FFF</span>
          </span>
        </div>

        {/* Stepper — background-state pills, no separators */}
        <div className="flex items-center gap-1">
          {STEPS.map((step) => {
            const isDone   = activeStep > step.id;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary text-white shadow-sm shadow-primary/30'
                    : isDone
                      ? 'bg-primary/10 text-primary hover:bg-primary/15'
                      : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {isDone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="check" className="text-[10px]" />
                    {step.label}
                  </span>
                )}
                {!isDone && step.label}
              </button>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 min-w-[100px] justify-end">

          {/* Printer status */}
          <button
            onClick={onOpenPrinterStatus}
            className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 text-[10px] font-medium text-slate-500 dark:text-slate-400 transition-all"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${stateColor[printerState]}`} />
            <span className="hidden lg:inline">{stateLabel[printerState]}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Load / Save */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={onLoadProject}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-medium transition-colors"
            >
              <Icon name="folder_open" className="text-[12px]" />
              <span className="hidden sm:inline">Load</span>
            </button>
            <button
              onClick={onSaveProject}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-medium transition-colors"
            >
              <Icon name="save" className="text-[12px]" />
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Network */}
          <button
            onClick={onOpenWifi}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors"
          >
            <Icon name="wifi" className="text-[12px]" />
            <span className="hidden sm:inline">Network</span>
          </button>

          {/* Dark mode toggle */}
          <button
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
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