import React from 'react';
import { Icon } from './Icon';

interface PanelEdgeToggleProps {
  edge: 'left' | 'right';
  collapsed: boolean;
  onToggle: () => void;
  panelName: string;
}

export const PanelEdgeToggle: React.FC<PanelEdgeToggleProps> = ({
  edge,
  collapsed,
  onToggle,
  panelName,
}) => {
  const pointsRight = edge === 'right' ? collapsed : !collapsed;
  const action = collapsed ? 'Open' : 'Close';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={`${action} ${panelName}`}
      title={`${action} ${panelName}`}
      className={`group absolute top-1/2 z-40 flex h-12 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/90 bg-white/95 text-slate-400 shadow-[0_5px_18px_rgba(15,23,42,0.12)] backdrop-blur-md transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out hover:scale-[1.03] hover:border-primary/40 hover:bg-primary hover:text-white hover:shadow-[0_7px_22px_rgba(16,185,129,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95 motion-reduce:transition-none dark:border-slate-700/90 dark:bg-slate-900/95 dark:text-slate-400 dark:hover:border-primary/50 dark:hover:bg-primary dark:hover:text-white ${
        edge === 'right'
          ? 'left-full ml-1'
          : 'right-full mr-1'
      }`}
    >
      <span className="absolute inset-y-3 left-1/2 w-px -translate-x-1/2 rounded-full bg-slate-200 opacity-60 transition-opacity group-hover:opacity-0 dark:bg-slate-700" />
      <Icon
        name={pointsRight ? 'chevron_right' : 'chevron_left'}
        className="relative text-[17px] transition-transform duration-200 group-hover:scale-110"
      />
    </button>
  );
};
