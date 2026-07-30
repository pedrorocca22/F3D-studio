import React from 'react';
import { Icon } from '../Icon';

interface AccordionSectionProps {
  title: string | React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  info?: boolean;
  toggleSwitch?: boolean;
  switchOn?: boolean;
  onSwitchChange?: () => void;
  children?: React.ReactNode;
  headerActions?: React.ReactNode;
  disableToggle?: boolean;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  isOpen,
  onToggle,
  info,
  toggleSwitch,
  switchOn,
  onSwitchChange,
  children,
  headerActions,
  disableToggle
}) => {
  const handleSwitchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSwitchChange?.();
  };

  const handleActionsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-200 ${
      isOpen
        ? 'border-slate-300/90 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/70 shadow-xs'
        : 'border-slate-200/80 dark:border-slate-800/90 bg-slate-100/40 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700'
    }`}>
      <div
        className={`px-2.5 py-1 flex items-center justify-between select-none transition-colors ${
          disableToggle ? 'cursor-default' : 'cursor-pointer'
        } ${
          isOpen
            ? 'bg-slate-200/70 dark:bg-slate-700/70 border-b border-slate-200/80 dark:border-slate-700/80'
            : 'bg-slate-100/80 dark:bg-slate-800/40 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
        }`}
        onClick={disableToggle ? undefined : onToggle}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {!disableToggle && (
            <Icon
              name="keyboard_arrow_right"
              className={`text-slate-400 text-[10px] transition-transform duration-150 shrink-0 ${isOpen ? 'rotate-90 text-primary font-bold' : ''}`}
            />
          )}
          <span className={`text-[9.5px] uppercase font-bold tracking-wider transition-colors truncate ${isOpen ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>{title}</span>
          {info && <Icon name="info" className="text-primary text-[9px] ml-0.5 opacity-50 shrink-0" />}
        </div>

        <div className="flex items-center shrink-0">
          {headerActions && (
            <div className="mr-1.5" onClick={handleActionsClick}>
              {headerActions}
            </div>
          )}

          {toggleSwitch && (
            <div
              className={`w-3.5 h-3.5 border border-outline-variant/30 rounded-sm flex items-center justify-center cursor-pointer transition-colors ${switchOn ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}
              onClick={handleSwitchClick}
            >
              {switchOn && <div className="w-1 h-1 bg-white rounded-xs"></div>}
            </div>
          )}
        </div>
      </div>

      <div
        className={`overflow-hidden transition-all duration-250 ease-in-out ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}
        style={{ transition: 'max-height 0.25s ease-in-out, opacity 0.2s ease-in-out' }}
      >
        {children && (
          <div className="p-2.5 space-y-2 bg-slate-50/90 dark:bg-slate-900/60">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};