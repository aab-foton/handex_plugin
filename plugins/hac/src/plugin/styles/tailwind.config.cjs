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
          50:  '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#38a9f8',
          500: '#005ca9',
          600: '#004782',
          700: '#00335c',
          800: '#001f38',
          900: '#000c17',
          950: '#000308',
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
      // Tokens `dsc-*` abaixo: confirmados via REST API das libs reais do DSC CAIXA
      // ("Super DSC | Web" e "DSC | Super App"), consulta em 2026-09-11. Cobrem só a
      // faixa útil para um painel de plugin (~400px) — tokens de página inteira do DSC
      // (ex. `giant`, `enormous`) foram deliberadamente deixados de fora.
      spacing: {
        'dsc-quark':   '4px',
        'dsc-nano':    '8px',
        'dsc-micro':   '12px',
        'dsc-tiny':    '16px',
        'dsc-smaller': '24px',
        'dsc-small':   '32px',
        'dsc-medium':  '40px',
        'dsc-large':   '48px',
      },
      borderRadius: {
        'dsc-nano':   '4px',
        'dsc-small':  '8px',
        'dsc-medium': '12px',
        'dsc-large':  '16px',
        'dsc-big':    '24px',
        'dsc-pill':   '1000px',
        'dsc-circ':   '9999px',
      },
      boxShadow: {
        'dsc-elevation-1': '0 1px 2px 0 rgba(0,0,0,0.04)',
        'dsc-elevation-2': '0 14px 28px 0 rgba(0,0,0,0.04)',
      },
      fontSize: {
        'dsc-label-tiny':     ['12px', { lineHeight: '16px', letterSpacing: '0.5px', fontWeight: '500' }],
        'dsc-label-small':    ['14px', { lineHeight: '20px', letterSpacing: '0.1px', fontWeight: '500' }],
        'dsc-body-small':     ['14px', { lineHeight: '20px', letterSpacing: '0.25px' }],
        'dsc-label-standard': ['16px', { lineHeight: '24px', letterSpacing: '0.15px', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
};
