import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { BACKEND_URL } from '../config';

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
        const r = await fetch(`${BACKEND_URL}/moonraker/status`, { signal: AbortSignal.timeout(3000) });
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
      <header className="h-14 flex-shrink-0 bg-white dark:bg-surface-dark border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-5 z-20 relative">

        {/* Wordmark */}
        <div className="flex items-center gap-2.5 select-none min-w-[110px]">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary/30">
            <span className="text-white text-[10px] font-black">B</span>
          </div>
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 tracking-tight">
            Bio<span className="text-primary">FFF</span>
          </span>
        </div>

        {/* Stepper — continuous segmented banner */}
        <div className="flex items-stretch h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
          {STEPS.map((step, idx) => {
            const isDone   = activeStep > step.id;
            const isActive = activeStep === step.id;
            const isLast   = idx === STEPS.length - 1;
            return (
              <div
                key={step.id}
                className={`relative flex items-center justify-center px-4 text-[11px] font-semibold select-none transition-all duration-300 overflow-hidden
                  ${!isLast ? 'border-r border-white/20 dark:border-slate-600/40' : ''}
                  ${isActive
                    ? 'bg-primary text-white shadow-[0_2px_10px_-3px_rgba(22,163,74,0.4)]'
                    : isDone
                      ? 'bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400/80 font-bold'
                      : 'bg-white dark:bg-slate-800/60 text-slate-300 dark:text-slate-600'
                  }`}
              >

                <span className="relative z-10 tracking-wide">{step.label}</span>
              </div>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 min-w-[110px] justify-end">

          {/* Printer status */}
          <button
            onClick={onOpenPrinterStatus}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 text-xs font-medium text-slate-500 dark:text-slate-400 transition-all"
          >
            <span className={`w-2 h-2 rounded-full ${stateColor[printerState]}`} />
            <span className="hidden lg:inline">{stateLabel[printerState]}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Load / Save */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={onLoadProject}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium transition-colors"
            >
              <Icon name="folder_open" className="text-[13px]" />
              <span className="hidden sm:inline">Load</span>
            </button>
            <button
              onClick={onSaveProject}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium transition-colors"
            >
              <Icon name="save" className="text-[13px]" />
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Network */}
          <button
            onClick={onOpenWifi}
            className="flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm shadow-primary/20"
          >
            <Icon name="wifi" className="text-[13px]" />
            <span className="hidden sm:inline">Network</span>
          </button>

          {/* Dark mode toggle */}
          <button
            className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            onClick={toggleDarkMode}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
          >
            <Icon name={darkMode ? 'light_mode' : 'dark_mode'} className="text-[14px]" />
          </button>
        </div>
      </header>
    </>
  );
};