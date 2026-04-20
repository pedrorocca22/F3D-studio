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
    <div className={`rounded-lg border overflow-hidden transition-all duration-200 ${isOpen ? 'border-slate-200 dark:border-slate-700 shadow-sm' : 'border-slate-150 dark:border-slate-800'}`}>
      <div
        className={`px-3 py-2 flex items-center justify-between select-none transition-colors ${disableToggle ? 'cursor-default' : 'cursor-pointer'} ${isOpen ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
        onClick={disableToggle ? undefined : onToggle}
      >
        <div className="flex items-center gap-2">
          {!disableToggle && (
            <Icon
              name="keyboard_arrow_right"
              className={`text-slate-400 text-[12px] transition-transform duration-150 ${isOpen ? 'rotate-90 text-primary' : ''}`}
            />
          )}
          <span className={`section-header transition-colors ${isOpen ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>{title}</span>
          {info && <Icon name="info" className="text-primary text-[10px] ml-0.5 opacity-50" />}
        </div>

        <div className="flex items-center">
          {headerActions && (
            <div className="mr-2" onClick={handleActionsClick}>
              {headerActions}
            </div>
          )}

          {toggleSwitch && (
            <div
              className={`w-4 h-4 border border-outline-variant/30 flex items-center justify-center cursor-pointer transition-colors ${switchOn ? 'bg-primary' : 'bg-slate-100'}`}
              onClick={handleSwitchClick}
            >
              {switchOn && <div className="w-1.5 h-1.5 bg-white"></div>}
            </div>
          )}
        </div>
      </div>

      {isOpen && children && (
        <div className="px-4 py-3 space-y-3 bg-white dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-700/50">
          {children}
        </div>
      )}
    </div>
  );
};