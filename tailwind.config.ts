/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f7f1e5',
        card: '#fdf8ee',
        carddeep: '#f3ead8',
        ink: '#3d4a3e',
        inkmuted: '#8a7f6d',
        terra: '#c65d21',
        terradeep: '#a94e18',
        terrasoft: '#f6e3d3',
        moss: '#5c6f58',
        line: '#e7dcc6',
      },
      fontFamily: {
        hand: ['"LXGW WenKai"', '"Kaiti SC"', 'STKaiti', '"Noto Serif SC"', 'Songti SC', 'serif'],
      },
      boxShadow: {
        card: '0 2px 10px rgba(120, 90, 50, 0.08)',
        pop: '0 6px 24px rgba(120, 90, 50, 0.18)',
      },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
}
