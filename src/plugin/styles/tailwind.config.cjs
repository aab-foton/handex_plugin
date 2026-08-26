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
          // Azul institucional CAIXA — revertido em 2026-08-26. A paleta
          // "Uau CAIXA" (azul-roxo #3d3dff) usada entre 2026-08 e esta data
          // era uma antecipação de rebranding que a CAIXA ainda não
          // publicou oficialmente; até a publicação, o Handex usa a marca
          // vigente. Extraído de refs/fundamentos-visuais.json
          // (color/bg/highlight, escala "primary" do DSC) — 500 ancorado em
          // "azul cx" (primary 90, #005ca9), degraus interpolados a partir
          // dos 7 valores reais do DSC (10/30/50/70/90/110/130).
          50:  '#f7fbfe',
          100: '#eaf5fd',
          200: '#c2e2fc',
          300: '#8cc8fb',
          400: '#479de6',
          500: '#005ca9',
          600: '#004d8d',
          700: '#004075',
          800: '#00325b',
          900: '#002442',
          950: '#00182a',
        },
        orange: {
          // Laranja institucional CAIXA — revertido em 2026-08-26 junto com
          // o azul (ver comentário acima). Extraído de
          // refs/fundamentos-visuais.json (color/bg/accent, escala
          // "secondary" do DSC) — 500 ancorado em "laranja cx" (secondary
          // 70, #f39200), degraus interpolados a partir dos 7 valores reais
          // do DSC (10/30/50/70/90/110/130).
          50:  '#fff9ee',
          100: '#fff2dd',
          200: '#ffe1b4',
          300: '#fec774',
          400: '#f9a72b',
          500: '#f39200',
          600: '#e08200',
          700: '#bf6c00',
          800: '#935300',
          900: '#5f3600',
          950: '#3d2300',
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
