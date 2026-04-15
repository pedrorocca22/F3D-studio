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
    <div className="mb-0 border-b border-outline-variant/10 transition-all duration-200">
      <div
        className={`px-3 py-2 flex items-center justify-between select-none transition-colors ${disableToggle ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50'} bg-white`}
        onClick={disableToggle ? undefined : onToggle}
      >
        <div className="flex items-center gap-2">
          {!disableToggle && (
            <Icon
              name="keyboard_arrow_right"
              className={`text-slate-400 text-[12px] transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
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
              className={`w-4 h-4 border border-outline-variant/30 flex items-center justify-center cursor-pointer transition-colors ${switchOn ? 'bg-primary' : 'bg-slate-100'}`}
              onClick={handleSwitchClick}
            >
              {switchOn && <div className="w-1.5 h-1.5 bg-white"></div>}
            </div>
          )}
        </div>
      </div>

      {isOpen && children && (
        <div className="px-4 py-3 space-y-3 bg-white">
          {children}
        </div>
      )}
    </div>
  );
};