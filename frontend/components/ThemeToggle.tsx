'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { getStoredTheme, applyTheme, type ThemeMode } from '../lib/theme';

const OPTIONS: { mode: ThemeMode; label: string; icon: any }[] = [
  { mode: 'light',  label: 'Light',  icon: Sun     },
  { mode: 'dark',   label: 'Dark',   icon: Moon    },
  { mode: 'system', label: 'System', icon: Monitor },
];

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => { setMode(getStoredTheme()); }, []);

  // Keep "system" mode in sync with OS changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (getStoredTheme() === 'system') applyTheme('system'); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function choose(m: ThemeMode) {
    setMode(m);
    applyTheme(m);
  }

  return (
    <div className="flex gap-1 bg-slate-100 dark:bg-white/5 rounded-full p-1">
      {OPTIONS.map(({ mode: m, label, icon: Icon }) => (
        <button key={m} onClick={() => choose(m)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-all ${
            mode === m
              ? 'bg-grad-brand text-white shadow-ds-btn'
              : 'text-slate-500 dark:text-slate-400'
          }`}>
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>
  );
}
