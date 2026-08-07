/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/plugin/views/*.html',
    './src/plugin/modules/*.js',
    './src/plugin/build.cjs',
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          // Nova identidade visual CAIXA (2026-08) — azul-roxo vibrante do
          // Uau CAIXA em vez do azul institucional marinho anterior
          // (#005ca9). Hex extraídos por leitura visual de posts do
          // Instagram @uaucaixa (não há manual de marca oficial disponível
          // no momento) — calibrar com hex exato se/quando disponível.
          50:  '#eef0ff',
          100: '#dcdfff',
          200: '#c3c7ff',
          300: '#8b8fff',
          400: '#868bff',
          500: '#3d3dff',
          600: '#2e2ee0',
          700: '#2323a8',
          800: '#181875',
          900: '#0d0d40',
          950: '#060620',
        },
        orange: {
          // Amarelo/dourado dos ícones hexagonais do Uau CAIXA — ocupa o
          // papel de acento secundário que o laranja institucional tinha
          // antes. Mesma ressalva de origem (leitura visual) do azul acima.
          50:  '#fffbea',
          100: '#fff3c4',
          200: '#ffe388',
          300: '#ffd24d',
          400: '#ffc940',
          500: '#f5b400',
          600: '#cc9500',
          700: '#a37600',
          800: '#7a5800',
          900: '#523a00',
          950: '#291d00',
        },
        light: {
          bg:      '#eef2f7',
          surface: '#ffffff',
          line:    '#dde3ec',
          muted:   '#8394a8',
        },
        dark: {
          bg:      '#0f172a',
          surface: '#1e293b',
          line:    '#334155',
          text:    '#f1f5f9',
          muted:   '#b4c6d8',
        },
      },
    },
  },
  safelist: [
    // Category badge colors (built dynamically via _getCatColor)
    'bg-slate-100','text-slate-600','border-slate-200',
    'bg-pink-50','text-pink-600','border-pink-200',
    'bg-blue-50','text-blue-600','border-blue-200',
    'bg-lime-50','text-lime-700','border-lime-200',
    'bg-indigo-50','text-indigo-600','border-indigo-200',
    'bg-rose-50','text-rose-600','border-rose-200',
    'bg-emerald-50','text-emerald-700','border-emerald-200',
    'bg-yellow-50','text-yellow-700','border-yellow-200',
    'bg-teal-50','text-teal-600','border-teal-200',
    'bg-purple-50','text-purple-600','border-purple-200',
    'bg-cyan-50','text-cyan-700','border-cyan-200',
    // Dark mode variants
    'dark:bg-slate-700','dark:text-slate-400','dark:border-slate-600',
    'dark:bg-pink-900/30','dark:text-pink-400','dark:border-pink-800/40',
    'dark:bg-blue-900/30','dark:text-blue-400','dark:border-blue-800/40',
    'dark:bg-lime-900/20','dark:text-lime-400','dark:border-lime-800/40',
    'dark:bg-indigo-900/20','dark:text-indigo-400','dark:border-indigo-800/40',
    'dark:bg-rose-900/20','dark:text-rose-400','dark:border-rose-800/40',
    'dark:bg-emerald-900/20','dark:text-emerald-400','dark:border-emerald-800/40',
    'dark:bg-yellow-900/20','dark:text-yellow-500','dark:border-yellow-800/40',
    'dark:bg-teal-900/20','dark:text-teal-400','dark:border-teal-800/40',
    'dark:bg-purple-900/20','dark:text-purple-400','dark:border-purple-800/40',
    'dark:bg-cyan-900/20','dark:text-cyan-400','dark:border-cyan-800/40',
  ],
  plugins: [],
};
