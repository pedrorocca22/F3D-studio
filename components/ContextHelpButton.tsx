import React from 'react';
import { useUIContext } from '../contexts/UIContext';
import { HelpTopic } from './HelpWiki/HelpWiki';

interface ContextHelpButtonProps {
  topic: HelpTopic;
  label?: string;
  className?: string;
}

export const ContextHelpButton: React.FC<ContextHelpButtonProps> = ({
  topic,
  label = 'Open contextual guide',
  className = '',
}) => {
  const { ui } = useUIContext();

  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        ui.setHelpTopic(topic);
      }}
      aria-label={label}
      title={label}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white font-mono text-[9px] font-bold leading-none text-slate-400 transition-all hover:border-primary hover:bg-primary hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-primary dark:hover:bg-primary dark:hover:text-white ${className}`}
    >
      ?
    </button>
  );
};
