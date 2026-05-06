/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0a0f',
          card: '#12121a',
          border: '#1e1e2e',
          accent: '#7c3aed',
          'accent-light': '#9d5cff',
          green: '#00c896',
          red: '#ff4d6d',
          yellow: '#ffd700',
          blue: '#4da6ff',
          purple: '#b57bee',
          muted: '#4a4a6a',
          text: '#e2e2f0',
          'text-dim': '#8888aa',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-green': 'pulseGreen 1s ease-in-out infinite',
        'pulse-red': 'pulseRed 1s ease-in-out infinite',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        pulseGreen: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 200, 150, 0)' },
          '50%': { boxShadow: '0 0 0 4px rgba(0, 200, 150, 0.3)' },
        },
        pulseRed: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 77, 109, 0)' },
          '50%': { boxShadow: '0 0 0 4px rgba(255, 77, 109, 0.3)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
