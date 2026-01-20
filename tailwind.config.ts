import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#FF6B00',
        background: '#121212',
      },
      backdropBlur: {
        xs: '2px',
      },
    }
  },
  plugins: []
} satisfies Config;
