/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        terminal: '#050807',
        panel: '#0b100e',
        phosphor: '#52ffa8',
        cyber: '#55d6ff',
        amberish: '#ffd166',
        danger: '#ff5d73',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"SFMono-Regular"', 'Consolas', 'monospace'],
        sans: ['Inter', 'ui-sans-system', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 28px rgba(82, 255, 168, 0.13)',
        panel: '0 18px 50px rgba(0,0,0,0.34)',
      },
    },
  },
  plugins: [],
};
