import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class', // toggled via .dark on <html>; defaults to system on first load
  theme: {
    extend: {
      colors: {
        primary:    { DEFAULT: '#1a56db', light: '#3b82f6', dark: '#1e40af' },
        success:    { DEFAULT: '#16a34a', light: '#22c55e', dark: '#15803d' },
        warning:    { DEFAULT: '#d97706', light: '#f59e0b', dark: '#b45309' },
        danger:     { DEFAULT: '#dc2626', light: '#ef4444', dark: '#b91c1c' },
        background: { light: '#f8fafc', dark: '#0f172a' },
        // ── Design-system accents (from colors_and_type.css) ──
        emerald:    { DEFAULT: '#10b981' },
        cyan:       { DEFAULT: '#22d3ee' },
        teal:       { DEFAULT: '#14b8a6' },
        night:      { DEFAULT: '#060b18', 2: '#0a1120', 3: '#0b1426' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // ── Design-system radii / shadows / gradients (additive) ──
      borderRadius: {
        'ds-xl':  '1.5rem',
        'ds-2xl': '2rem',
      },
      boxShadow: {
        'ds-card': '0 8px 30px -12px rgba(30,58,138,0.18)',
        'ds-btn':  '0 10px 25px -5px rgba(26,86,219,0.25)',
        'ds-nav':  '0 8px 30px -8px rgba(0,0,0,0.25)',
      },
      backgroundImage: {
        'grad-brand':   'linear-gradient(to right, #3b82f6, #22c55e)',
        'grad-balance': 'linear-gradient(to bottom right, #1a3a6b, #1a56db)',
      },
      transitionTimingFunction: {
        'ds-out':   'cubic-bezier(0.22, 1, 0.36, 1)',
        'ds-press': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      minHeight: { touch: '48px' },
      minWidth:  { touch: '48px' },
    },
  },
  plugins: [],
};

export default config;
