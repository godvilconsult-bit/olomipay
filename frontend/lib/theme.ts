'use client';

export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'olomipay_theme';

export function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const v = localStorage.getItem(KEY) as ThemeMode | null;
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

/** Apply a theme mode to <html> and persist it. */
export function applyTheme(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, mode);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  document.documentElement.classList.toggle('dark', dark);
}

/** Inline script (runs before paint) to avoid a light/dark flash on load. */
export const themeInitScript = `
(function(){try{
  var m=localStorage.getItem('${KEY}')||'system';
  var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark',d);
}catch(e){}})();
`;
