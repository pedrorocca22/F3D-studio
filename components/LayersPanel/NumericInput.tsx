import React, { useEffect, useState } from 'react';
import { Icon } from '../Icon';

interface NumericInputProps {
  value: number | string;
  onChange?: (val: number) => void;
  className?: string;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  className = "",
  step = 1,
  min,
  max,
  suffix = ""
}) => {
  // Local state to handle typing without forcing validation on every keystroke
  const [localValue, setLocalValue] = useState<string>(value.toString());

  useEffect(() => {
    setLocalValue(value.toString());
  }, [value]);

  const handleBlur = () => {
    let num = parseFloat(localValue);
    if (isNaN(num)) num = typeof value === 'number' ? value : 0;

    if (min !== undefined && num < min) num = min;
    if (max !== undefined && num > max) num = max;

    setLocalValue(num.toString());
    onChange?.(num);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
      (e.target as HTMLInputElement).blur();
    }
  };

  const increment = () => {
    const current = parseFloat(localValue) || 0;
    const newValue = Number((current + step).toFixed(2)); // Avoid floating point errors
    if (max !== undefined && newValue > max) return;
    onChange?.(newValue);
  };

  const decrement = () => {
    const current = parseFloat(localValue) || 0;
    const newValue = Number((current - step).toFixed(2));
    if (min !== undefined && newValue < min) return;
    onChange?.(newValue);
  };

  return (
    <div className={`flex items-center rounded-sm overflow-hidden bg-slate-100 dark:bg-slate-800/40 ${className} transition-colors focus-within:bg-slate-200/60 dark:focus-within:bg-slate-800/70`}>
      <button
        onClick={decrement}
        className="flex-shrink-0 px-1.5 py-0.5 hover:bg-slate-200/60 dark:hover:bg-slate-700/40 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all btn-transition"
      >
        <Icon name="remove" className="text-[9px]" />
      </button>
      <div className="relative flex-1 min-w-[3rem]">
        <input
          className="w-full text-center text-[10px] bg-transparent border-none focus:ring-0 py-0.5 text-slate-700 dark:text-slate-200 appearance-none font-medium outline-none"
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {suffix && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      <button
        onClick={increment}
        className="flex-shrink-0 px-1.5 py-0.5 hover:bg-slate-200/60 dark:hover:bg-slate-700/40 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all btn-transition"
      >
        <Icon name="add" className="text-[9px]" />
      </button>
    </div>
  );
};