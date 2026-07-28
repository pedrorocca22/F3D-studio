import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  content: React.ReactNode;
  label?: string;
  className?: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  content,
  label = 'More information',
  className = '',
}) => {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, above: false });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 264;
    const estimatedHeight = 88;
    const left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, rect.left + rect.width / 2 - tooltipWidth / 2));
    const above = rect.bottom + estimatedHeight + 12 > window.innerHeight && rect.top > estimatedHeight;
    setPosition({ left, top: above ? rect.top - 8 : rect.bottom + 8, above });
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tooltipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (event.key === 'Escape') setOpen(false);
        }}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-black leading-none text-slate-500 shadow-sm transition-colors hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/25 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 ${className}`}
      >
        ?
      </button>
      {open && createPortal(
        <div
          id={tooltipId}
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            width: 264,
            transform: position.above ? 'translateY(-100%)' : undefined,
          }}
          className="pointer-events-none fixed z-[9999] rounded-lg border border-slate-700/20 bg-slate-950 px-3 py-2.5 text-[11px] font-medium leading-relaxed text-white shadow-2xl shadow-slate-950/25 dark:border-slate-600"
        >
          {content}
          <span className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-950 ${
            position.above
              ? '-bottom-1 border-b border-r border-slate-700/20 dark:border-slate-600'
              : '-top-1 border-l border-t border-slate-700/20 dark:border-slate-600'
          }`} />
        </div>,
        document.body,
      )}
    </>
  );
};
