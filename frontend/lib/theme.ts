'use client';

// JIKO CONNECT uses a single warm light theme (sand + flame). We intentionally
// do NOT follow the system dark mode — the design is light-only, so we always
// keep <html> out of `.dark` to avoid dark-on-dark contrast problems.

export type ThemeMode = 'light';

export function getStoredTheme(): ThemeMode { return 'light'; }
export function applyTheme(_mode?: ThemeMode) {
  if (typeof window === 'undefined') return;
  document.documentElement.classList.remove('dark');
}

/** Inline script (runs before paint): force light, never follow system dark. */
export const themeInitScript = `
(function(){try{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}catch(e){}})();
`;
