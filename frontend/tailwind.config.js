/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 界面底色与中性灰：由 CSS 变量驱动，随 .dark 切换
        app: {
          bg: 'rgb(var(--color-app-bg) / <alpha-value>)',
          surface: 'rgb(var(--color-app-surface) / <alpha-value>)',
          border: 'rgb(var(--color-app-border) / <alpha-value>)',
          text: 'rgb(var(--color-app-text) / <alpha-value>)',
          muted: 'rgb(var(--color-app-muted) / <alpha-value>)',
          subtle: 'rgb(var(--color-app-subtle) / <alpha-value>)',
          danger: 'rgb(var(--color-app-danger) / <alpha-value>)',
          'danger-soft': 'rgb(var(--color-app-danger-soft) / <alpha-value>)',
          'danger-text': 'rgb(var(--color-app-danger-text) / <alpha-value>)',
          warn: 'rgb(var(--color-app-warn) / <alpha-value>)',
          'warn-soft': 'rgb(var(--color-app-warn-soft) / <alpha-value>)',
          'warn-text': 'rgb(var(--color-app-warn-text) / <alpha-value>)',
          ok: 'rgb(var(--color-app-ok) / <alpha-value>)',
          'ok-soft': 'rgb(var(--color-app-ok-soft) / <alpha-value>)',
          'ok-text': 'rgb(var(--color-app-ok-text) / <alpha-value>)',
          info: 'rgb(var(--color-app-info) / <alpha-value>)',
          'info-soft': 'rgb(var(--color-app-info-soft) / <alpha-value>)',
          'info-text': 'rgb(var(--color-app-info-text) / <alpha-value>)',
          brand: 'rgb(var(--color-app-brand) / <alpha-value>)',
          'brand-soft': 'rgb(var(--color-app-brand-soft) / <alpha-value>)',
          'brand-text': 'rgb(var(--color-app-brand-text) / <alpha-value>)',
        },
        // 交互强调色：克制的蓝绿（大色块仍用固定值，保证对比度）
        brand: {
          50: 'rgb(var(--color-app-brand-soft) / <alpha-value>)',
          100: '#CCFBF1',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#00897B',
          700: '#00796B',
          800: '#00695C',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
}
