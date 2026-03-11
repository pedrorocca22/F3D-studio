import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

interface HeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  onOpenCalibration?: () => void;
  onOpenWifi?: () => void;
  onOpenPrinterStatus?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  darkMode, toggleDarkMode, onSaveProject, onLoadProject,
  onOpenCalibration, onOpenWifi, onOpenPrinterStatus
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
      {/* Top accent gradient line */}
      <div className="h-1 w-full flex-shrink-0 bg-gradient-to-r from-primary via-teal-400 to-teal-300" />

      {/* Main Header */}
      <header className="h-14 flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex items-center justify-between px-6 z-20 relative shadow-sm">
        {/* Wordmark */}
        <div className="flex items-center gap-2 select-none">
          <span className="font-black tracking-tighter text-xl text-slate-800 dark:text-white">
            bio<span className="text-primary">FDM</span>
            <span className="font-light text-slate-400 dark:text-slate-500 text-sm ml-1">studio</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Printer Status chip */}
          <button
            onClick={onOpenPrinterStatus}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${stateColor[printerState]}`} />
            {stateLabel[printerState]}
          </button>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

          <div className="flex items-center gap-2">
            <button onClick={onLoadProject} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
              <Icon name="folder_open" className="text-sm" /> Load
            </button>
            <button onClick={onSaveProject} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
              <Icon name="save" className="text-sm" /> Save
            </button>
            <button onClick={onOpenCalibration} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
              <Icon name="science" className="text-sm" /> Calibrate
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

          <button
            onClick={onOpenWifi}
            className="flex items-center gap-1.5 bg-primary hover:opacity-85 text-white px-4 py-1.5 rounded-md font-bold shadow-sm transition-opacity text-xs tracking-wide"
          >
            <Icon name="wifi" className="text-sm" />
            Network
          </button>

          <button
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            onClick={toggleDarkMode}
            title={darkMode ? 'Light Mode' : 'Dark Mode'}
          >
            <Icon name={darkMode ? 'light_mode' : 'dark_mode'} className="text-lg" />
          </button>
        </div>
      </header>
    </>
  );
};