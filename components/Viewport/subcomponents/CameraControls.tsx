import React from 'react';
import { Icon } from '../../Icon';

interface CameraControlsProps {
  isGCodeMode: boolean;
  setView: (mode: string) => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({ isGCodeMode, setView }) => {
  return (
    <div className={`absolute top-6 left-6 flex items-center gap-0.5 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1 rounded-lg border border-slate-200/60 dark:border-slate-700/60 z-20 transition-all duration-300`}>
      <button 
        onClick={() => setView('iso')} 
        className="w-8 h-8 rounded-md hover:bg-primary hover:text-white transition-all text-slate-500 dark:text-slate-400 flex items-center justify-center group" 
        title="Isometric View"
      >
        <Icon name="view_in_ar" className="text-base group-hover:scale-110 transition-transform" />
      </button>
      
      <div className="w-px h-4 bg-slate-200/60 dark:bg-slate-700/60 mx-1"></div>
      
      <div className="flex gap-1">
        <button 
          onClick={() => setView('top')} 
          className="px-2 h-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase flex items-center justify-center tracking-tighter" 
          title="Top View"
        >
          TOP
        </button>
        <button 
          onClick={() => setView('front')} 
          className="px-2 h-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase flex items-center justify-center tracking-tighter" 
          title="Front View"
        >
          FNT
        </button>
        <button 
          onClick={() => setView('right')} 
          className="px-2 h-8 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-all text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase flex items-center justify-center tracking-tighter" 
          title="Right View"
        >
          RGT
        </button>
      </div>
    </div>
  );
};
