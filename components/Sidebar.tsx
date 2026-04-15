import React from 'react';
import { Icon } from './Icon';

interface NavItemProps {
  icon: string;
  active?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, active }) => (
  <button
    className={`p-2 rounded transition-all btn-transition ${
      active
        ? 'text-primary bg-primary/5'
        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
    }`}
  >
    <Icon name={icon} className="text-lg" />
  </button>
);

export const Sidebar: React.FC = () => {
  return (
    <nav className="w-12 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark flex flex-col items-center py-3 gap-1 z-10">
      <NavItem icon="layers" />
      <NavItem icon="architecture" />
      <NavItem icon="settings_input_component" active />
      <NavItem icon="format_list_bulleted" />
      <NavItem icon="history" />
      <div className="mt-auto">
        <NavItem icon="info" />
      </div>
    </nav>
  );
};