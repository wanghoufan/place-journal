/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主题化：具体色值在 src/styles/index.css 的 CSS 变量（:root / [data-theme=...]），
        // RGB 三元组 + <alpha-value> 支持 text-terra/40 之类透明度写法
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        carddeep: 'rgb(var(--c-carddeep) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        inkmuted: 'rgb(var(--c-inkmuted) / <alpha-value>)',
        terra: 'rgb(var(--c-terra) / <alpha-value>)',
        terradeep: 'rgb(var(--c-terradeep) / <alpha-value>)',
        terrasoft: 'rgb(var(--c-terrasoft) / <alpha-value>)',
        moss: 'rgb(var(--c-moss) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
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
