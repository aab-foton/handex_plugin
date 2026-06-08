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
        orange: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#d36a00',
          600: '#b25a00',
          700: '#914900',
          800: '#703900',
          900: '#4f2800',
          950: '#2e1800',
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
  plugins: [],
};
