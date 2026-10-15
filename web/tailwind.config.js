/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0F19', surface: '#141A2A', 'surface-2': '#1C2438', line: '#2A3449',
        ink: '#E6EAF2', muted: '#8B94A8', accent: '#6C8CFF', accent2: '#9B6CFF',
        critical: '#F0564D', high: '#F5A524', medium: '#2DD4BF', low: '#4C9AFF', success: '#3DD68C',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
      fontSize: { xs: ['12px', '1.5'], sm: ['14px', '1.5'], base: ['16px', '1.5'], xl: ['20px', '1.5'], '3xl': ['28px', '1.5'] },
    },
  },
  plugins: [],
};
