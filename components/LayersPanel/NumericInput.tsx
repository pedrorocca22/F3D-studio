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
    <div className={`flex items-center bg-[#eaeff1] dark:bg-slate-800 ${className} transition-all border-b-2 border-outline-variant/20 h-7 hover:border-primary/40 focus-within:border-primary focus-within:bg-primary/5 dark:focus-within:bg-primary/10 rounded-sm group`}>
      <button
        onClick={decrement}
        className="px-2 h-full hover:bg-primary/10 text-slate-400 group-focus-within:text-primary hover:text-primary transition-all btn-transition flex items-center shrink-0"
      >
        <Icon name="remove" className="text-[10px]" />
      </button>
      <div className="relative flex-1 min-w-[2rem] h-full flex items-center">
        <input
          className="w-full text-center text-[11px] bg-transparent border-none focus:ring-0 py-0 text-slate-700 dark:text-slate-200 font-bold outline-none font-mono"
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {suffix && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none uppercase">
            {suffix}
          </span>
        )}
      </div>
      <button
        onClick={increment}
        className="px-2 h-full hover:bg-primary/10 text-slate-400 group-focus-within:text-primary hover:text-primary transition-all btn-transition flex items-center shrink-0"
      >
        <Icon name="add" className="text-[10px]" />
      </button>
    </div>
  );
};