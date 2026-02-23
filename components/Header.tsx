import React from 'react';
import { Icon } from './Icon';

interface HeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
  onOpenCalibration?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ darkMode, toggleDarkMode, onSaveProject, onLoadProject, onOpenCalibration }) => {
  return (
    <>
      {/* Top accent line */}
      <div className="h-1 bg-primary w-full flex-shrink-0"></div>

      {/* Main Header - Clean Minimalist Background */}
      <header className="h-14 flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex items-center justify-between px-6 z-20 relative shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 select-none">
            <span className="font-black tracking-tighter text-2xl text-slate-800 dark:text-white">
              biolight<span className="text-primary text-3xl leading-none">.</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
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

          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

          <button
            onClick={() => {/* TODO: Implement Connection Logic */ }}
            className="flex items-center gap-1.5 bg-primary hover:opacity-90 text-white px-5 py-1.5 rounded-md font-bold shadow-sm transition-opacity text-xs tracking-wide"
          >
            <Icon name="link" className="text-sm" />
            Connect
          </button>

          <button
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-1"
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            <Icon name={darkMode ? "light_mode" : "dark_mode"} className="text-lg" />
          </button>
        </div>
      </header>
    </>
  );
};