import React from 'react';
import { Icon } from './Icon';

interface HeaderProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
}

export const Header: React.FC<HeaderProps> = ({ darkMode, toggleDarkMode, onSaveProject, onLoadProject }) => {
  return (
    <>
      {/* Top accent line */}
      <div className="h-1 bg-slate-800 dark:bg-slate-900 w-full flex-shrink-0"></div>

      {/* Main Header - Dark Gray Background */}
      <header className="h-14 flex-shrink-0 border-b border-[#333] bg-[#1a1a1a] text-white flex items-center justify-between px-4 z-20 relative shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 select-none">
            <Icon name="print" className="text-primary text-xl" />
            <span className="font-bold tracking-wide">BioPrint Pro</span>
          </div>

          <div className="h-6 w-px bg-slate-700 mx-2"></div>

          <div className="flex items-center gap-2">
            <button onClick={onLoadProject} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors">
              <Icon name="folder_open" className="text-sm" /> Load
            </button>
            <button onClick={onSaveProject} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors">
              <Icon name="save" className="text-sm" /> Save
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            onClick={toggleDarkMode}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            <Icon name={darkMode ? "light_mode" : "dark_mode"} />
          </button>
        </div>
      </header>
    </>
  );
};