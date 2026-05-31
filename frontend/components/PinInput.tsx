'use client';

import { useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';

interface Props {
  value:    string;
  onChange: (pin: string) => void;
  length?:  number;
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function PinInput({
  value,
  onChange,
  length  = 6,
  disabled = false,
  autoFocus = false,
}: Props) {
  const inputs = useRef<HTMLInputElement[]>([]);

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  const digits = value.split('').slice(0, length);
  while (digits.length < length) digits.push('');

  function handleChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next  = [...digits];
    next[idx]   = digit;
    const newPin = next.join('');
    onChange(newPin);
    if (digit && idx < length - 1) {
      inputs.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = '';
      onChange(next.join(''));
      inputs.current[idx - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted.padEnd(length, '').slice(0, length));
    const nextIdx = Math.min(pasted.length, length - 1);
    inputs.current[nextIdx]?.focus();
  }

  return (
    <div className="flex items-center justify-center gap-3" role="group" aria-label="PIN entry">
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={el => { if (el) inputs.current[idx] = el; }}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[idx]}
          disabled={disabled}
          onChange={e  => handleChange(idx, e.target.value)}
          onKeyDown={e => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          className={`
            w-12 h-14 rounded-2xl border-2 text-center text-2xl font-bold
            bg-white dark:bg-slate-800
            text-slate-900 dark:text-white
            caret-transparent select-none
            transition-all duration-150
            ${digits[idx]
              ? 'border-primary bg-primary/5'
              : 'border-slate-200 dark:border-slate-700'
            }
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30
            disabled:opacity-50 disabled:pointer-events-none
          `}
          aria-label={`PIN digit ${idx + 1}`}
        />
      ))}
    </div>
  );
}
