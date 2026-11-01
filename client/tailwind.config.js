/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#121214',
        casing: '#181A1F',
        plate: '#1F2228',
        rule: '#343943',
        ink: '#E0E0E0',
        muted: '#A3A9B3',
        dim: '#8A909B',
        phosphor: '#33FF66',
        // Spec fills, plus lighter inks that clear 4.5:1 for small text.
        alpha: { DEFAULT: '#E53935', ink: '#FF7D78' },
        beta: { DEFAULT: '#1E88E5', ink: '#6CB8F7' },
        secure: { DEFAULT: '#43A047', ink: '#74D178' },
        intercepted: '#FB8C00',
        compromised: { DEFAULT: '#E53935', ink: '#FF7D78' },
      },
      fontFamily: {
        display: ['"Share Tech Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      screens: {
        console: '1100px',
      },
    },
  },
  plugins: [],
};
