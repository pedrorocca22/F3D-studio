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
    <div className="mb-0.5 transition-all duration-200">
      <div
        className={`px-2 py-1.5 flex items-center justify-between select-none transition-colors btn-transition ${disableToggle ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/[0.03]'} rounded-sm`}
        onClick={disableToggle ? undefined : onToggle}
      >
        <div className="flex items-center gap-1.5">
          {!disableToggle && (
            <Icon
              name="expand_more"
              className={`text-slate-400 dark:text-slate-600 text-[10px] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            />
          )}
          <span className="section-header">{title}</span>
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
              className={`w-6 h-3 rounded-full relative cursor-pointer transition-colors btn-transition ${switchOn ? 'bg-primary/60' : 'bg-slate-200 dark:bg-slate-700'}`}
              onClick={handleSwitchClick}
            >
              <div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full shadow-sm transition-all duration-200 ${switchOn ? 'right-0.5' : 'left-0.5'}`}></div>
            </div>
          )}
        </div>
      </div>

      {isOpen && children && (
        <div className="px-2 py-1.5 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
};