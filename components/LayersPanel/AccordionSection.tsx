import React from 'react';
import { Icon } from '../Icon';

interface AccordionSectionProps {
  title: string;
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
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden transition-all duration-200">
      <div
        className={`bg-slate-50 dark:bg-slate-800/50 p-3 flex items-center justify-between select-none transition-colors ${disableToggle ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        onClick={disableToggle ? undefined : onToggle}
      >
        <div className="flex items-center gap-2">
          {!disableToggle && (
            <Icon
              name="expand_more"
              className={`text-slate-400 text-sm transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          )}
          <span className="text-sm font-semibold">{title}</span>
          {info && <Icon name="info" className="text-primary text-sm ml-1 hover:text-blue-600" />}
        </div>

        <div className="flex items-center">
          {headerActions && (
            <div className="mr-3" onClick={handleActionsClick}>
              {headerActions}
            </div>
          )}

          {toggleSwitch && (
            <div
              className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${switchOn ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'}`}
              onClick={handleSwitchClick}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all duration-200 ${switchOn ? 'right-0.5' : 'left-0.5'}`}></div>
            </div>
          )}
        </div>
      </div>

      {isOpen && children && (
        <div className="p-4 space-y-3 bg-white dark:bg-transparent border-t border-slate-200 dark:border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
};