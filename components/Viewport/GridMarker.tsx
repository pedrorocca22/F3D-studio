import React from 'react';

interface GridMarkerProps {
  label: string;
  isPrimary?: boolean;
  isTop?: boolean;
  className?: string;
}

export const GridMarker: React.FC<GridMarkerProps> = ({ label, isPrimary, isTop, className = "" }) => {
  return (
    <div className={`relative w-full ${isPrimary ? 'border-b border-blue-400' : 'border-b border-slate-400/30'} ${className}`}>
      <div className={`absolute -left-16 ${isTop ? '-top-2' : '-top-2'} flex items-center gap-2 w-24 justify-end pr-4`}>
        <span className={`text-[10px] font-mono ${isPrimary ? 'text-primary font-bold' : 'text-slate-500'}`}>
          {label}
        </span>
        <div className={`w-3 h-3 bg-white dark:bg-slate-800 border-2 rounded-full ${isPrimary ? 'border-primary' : 'border-slate-400'}`}></div>
      </div>
    </div>
  );
};