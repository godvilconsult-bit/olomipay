import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // JIKO CONNECT — warm flame + clean-energy green
        primary: { DEFAULT: '#F15A24', light: '#FB7B4A', dark: '#C9430F' }, // flame orange
        flame:   { DEFAULT: '#F15A24', light: '#FB7B4A', dark: '#C9430F' },
        leaf:    { DEFAULT: '#1FA463', light: '#34C77B', dark: '#157A49' }, // clean energy
        ember:   { DEFAULT: '#FFB100' },                                     // LPG flame yellow
        success: { DEFAULT: '#1FA463', light: '#34C77B', dark: '#157A49' },
        warning: { DEFAULT: '#F59E0B', light: '#FBBF24', dark: '#B45309' },
        danger:  { DEFAULT: '#DC2626', light: '#EF4444', dark: '#B91C1C' },
        ink:     { DEFAULT: '#1A130E', 2: '#2A1F17' },                       // warm charcoal
        sand:    { DEFAULT: '#FBF7F2', 2: '#F4EDE3' },                       // warm light bg
        background: { light: '#FBF7F2', dark: '#160F0A' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'ds-xl':  '1.5rem',
        'ds-2xl': '2rem',
      },
      boxShadow: {
        'ds-card': '0 8px 30px -12px rgba(201,67,15,0.18)',
        'ds-btn':  '0 10px 25px -5px rgba(241,90,36,0.30)',
        'ds-nav':  '0 8px 30px -8px rgba(0,0,0,0.20)',
      },
      backgroundImage: {
        'grad-brand': 'linear-gradient(135deg, #F15A24 0%, #FFB100 100%)',
        'grad-flame': 'linear-gradient(135deg, #F15A24 0%, #FB7B4A 100%)',
        'grad-leaf':  'linear-gradient(135deg, #1FA463 0%, #34C77B 100%)',
        'grad-hero':  'radial-gradient(125% 95% at 50% 0%, #2A1206 0%, #1a0c05 55%, #120803 100%)',
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
