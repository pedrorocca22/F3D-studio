/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#16a34a',
        'primary-dark': '#15803d',
        'primary-light': '#bbf7d0',
        action: '#16a34a',
        'background-light': '#f8fafc',
        'background-dark': '#0c0f10',
        'surface-light': '#ffffff',
        'surface-dark': '#181a1b',
        'border-light': '#e2e8f0',
        'border-dark': '#334155',
        'outline-variant': '#94a3b8',
        'surface-container': '#f1f5f9',
        'surface-container-low': '#f8fafc',
        'on-surface': '#0f172a',
        'on-surface-variant': '#475569',
      },
      fontFamily: {
        sans: ['DM Sans', 'Inter', 'sans-serif'],
        outfit: ['Outfit', 'sans-serif'],
      },
      fontSize: {
        xxs: ['10px', '14px'],
        label: ['11px', '15px'],
        compact: ['12px', '16px'],
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        full: '9999px',
      },
    },
  },
  plugins: [],
};
