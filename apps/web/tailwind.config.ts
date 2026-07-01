import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dream: {
          cream: '#fffaf0',
          paper: '#fffdf7',
          wood: '#b9845c',
          bark: '#6f4d38',
          peach: '#f2c6a5',
          orange: '#d98b5f',
          coral: '#e9a5a0',
          mint: '#b7d8b1',
          forest: '#5f7f64',
          sky: '#b9d7e8',
          blue: '#7fa9bd',
          butter: '#f4dc8f',
          ink: '#344238'
        }
      },
      boxShadow: {
        soft: '0 20px 48px rgba(111, 77, 56, 0.13)',
        story: '0 14px 0 rgba(185, 132, 92, 0.18), 0 26px 54px rgba(111, 77, 56, 0.16)'
      }
    }
  },
  plugins: []
} satisfies Config;
