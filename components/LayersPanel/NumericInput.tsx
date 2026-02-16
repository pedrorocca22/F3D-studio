import React, { useEffect, useState } from 'react';

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
    <div className={`flex items-center border border-slate-200 dark:border-slate-700 rounded overflow-hidden bg-white dark:bg-slate-900 ${className}`}>
      <button
        onClick={decrement}
        className="flex-shrink-0 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 border-r border-slate-200 dark:border-slate-700 text-slate-500 transition-colors"
      >
        -
      </button>
      <div className="relative flex-1 min-w-[3rem]">
        <input
          className="w-full text-center text-xs bg-transparent border-none focus:ring-0 p-1 text-slate-700 dark:text-slate-200 appearance-none"
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {suffix && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none opacity-50">
            {suffix}
          </span>
        )}
      </div>
      <button
        onClick={increment}
        className="flex-shrink-0 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 border-l border-slate-200 dark:border-slate-700 text-slate-500 transition-colors"
      >
        +
      </button>
    </div>
  );
};