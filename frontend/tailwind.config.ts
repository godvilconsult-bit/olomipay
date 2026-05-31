import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media', // respects system preference
  theme: {
    extend: {
      colors: {
        primary:    { DEFAULT: '#1a56db', light: '#3b82f6', dark: '#1e40af' },
        success:    { DEFAULT: '#16a34a', light: '#22c55e', dark: '#15803d' },
        warning:    { DEFAULT: '#d97706', light: '#f59e0b', dark: '#b45309' },
        danger:     { DEFAULT: '#dc2626', light: '#ef4444', dark: '#b91c1c' },
        background: { light: '#f8fafc', dark: '#0f172a' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      minHeight: { touch: '48px' },
      minWidth:  { touch: '48px' },
    },
  },
  plugins: [],
};

export default config;
