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
  currentView: 'editor' | 'gallery';
  setCurrentView: (view: 'editor' | 'gallery') => void;
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
  activeStep, setActiveStep,
  currentView, setCurrentView
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
        <div className="flex items-center gap-2 select-none min-w-[150px]">
          <span className="font-outfit text-base text-slate-950 dark:text-slate-100 tracking-tight">
            <span className="font-bold">F3D</span> <span className="font-normal opacity-90">studio</span>
          </span>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-4 min-w-[110px] justify-end">

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