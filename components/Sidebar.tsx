import React from 'react';
import { Icon } from './Icon';

interface NavItemProps {
  icon: string;
  active?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, active }) => (
  <button
    className={`p-2 rounded-lg transition-colors ${
      active
        ? 'text-primary bg-blue-50 dark:bg-blue-900/20'
        : 'text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800'
    }`}
  >
    <Icon name={icon} className="text-2xl" />
  </button>
);

export const Sidebar: React.FC = () => {
  return (
    <nav className="w-16 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-surface-light dark:bg-surface-dark flex flex-col items-center py-4 gap-4 z-10">
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