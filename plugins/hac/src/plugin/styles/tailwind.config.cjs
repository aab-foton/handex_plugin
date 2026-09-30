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
        // Azul — ESCALA DSC "primary" (color/bg|content|border/highlight/*), só valores
        // REAIS da lib "DSC | Fundamentos Visuais" v2.6.0 (fundamentos-visuais.json).
        // 500 = azul cx (primary 90, #005ca9). Degraus Tailwind sem valor próprio
        // na lib repetem o valor real mais próximo — nenhum hex interpolado.
        // 400 = primary 50 (e não 70): dark:text-blue-400 (38 usos) precisa de
        // contraste >= ao antigo sobre o tema escuro. 600/700: idem, ver seção 8z.
        blue: {
          50: '#e5f2fc',
          100: '#e5f2fc',
          200: '#a0d2fc',
          300: '#a0d2fc',
          400: '#6dbafa',
          500: '#005ca9',
          600: '#00437a',
          700: '#00437a',
          800: '#002747',
          900: '#002747',
          950: '#002747',
        },
        // Neutros — escala grayscale do DSC (color/bg|content|border/neutral/*).
        // slate e gray recebem os MESMOS valores reais da lib, para que as
        // ~660 classes existentes passem a renderizar cinzas do DSC sem
        // reescrever as telas. Texto: degrau mais escuro quando o valor mais
        // próximo pioraria o contraste (400->grayscale 90). O 700 fica em
        // grayscale 110 (8,95:1 sobre branco, já AAA): descer para 130 só
        // apagaria a diferença para o 800 sem ganho de leitura.
        slate: {
          50: '#f7fafa',
          100: '#ebf1f2',
          200: '#d0e0e3',
          300: '#d0e0e3',
          400: '#64747a',
          500: '#64747a',
          600: '#404b52',
          700: '#404b52',
          800: '#22292e',
          900: '#22292e',
          950: '#22292e',
        },
        // (ver comentário de slate)
        gray: {
          50: '#f7fafa',
          100: '#ebf1f2',
          200: '#ebf1f2',
          300: '#d0e0e3',
          400: '#64747a',
          500: '#64747a',
          600: '#404b52',
          700: '#404b52',
          800: '#22292e',
          900: '#22292e',
          950: '#22292e',
        },
        // Warning/attention do DSC (color/bg|content|border/warning/*).
        amber: {
          50: '#fff9e6',
          100: '#fff9e6',
          200: '#fee59b',
          300: '#fee59b',
          400: '#fdd150',
          500: '#ca9804',
          600: '#977203',
          700: '#654c02',
          800: '#654c02',
          900: '#654c02',
          950: '#654c02',
        },
        // Danger/negative do DSC (color/bg|content|border/danger/*).
        red: {
          50: '#fbebeb',
          100: '#fbebeb',
          200: '#f0afaf',
          300: '#f0afaf',
          400: '#f0afaf',
          500: '#d93636',
          600: '#b22c2c',
          700: '#b22c2c',
          800: '#8c2424',
          900: '#8c2424',
          950: '#8c2424',
        },
        // Success/positive do DSC (color/bg|content|border/success/*).
        green: {
          50: '#e7f4ea',
          100: '#e7f4ea',
          200: '#e7f4ea',
          300: '#a2d3ad',
          400: '#a2d3ad',
          500: '#5cb26e',
          600: '#179231',
          700: '#127527',
          800: '#0d581d',
          900: '#0d581d',
          950: '#0d581d',
        },
        // Emerald -> mesma escala success/positive do DSC (o DSC não tem verde-esmeralda).
        emerald: {
          50: '#e7f4ea',
          100: '#e7f4ea',
          200: '#e7f4ea',
          300: '#a2d3ad',
          400: '#a2d3ad',
          500: '#5cb26e',
          600: '#179231',
          700: '#127527',
          800: '#0d581d',
          900: '#0d581d',
          950: '#0d581d',
        },
        // Accent/secondary do DSC (color/bg|content|border/accent/*).
        orange: {
          50: '#ffefd6',
          100: '#ffefd6',
          200: '#ffd392',
          300: '#fdb548',
          400: '#f39200',
          500: '#d87b00',
          600: '#d87b00',
          700: '#a65e00',
          800: '#663a00',
          900: '#663a00',
          950: '#663a00',
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
      // Tokens `dsc-*` abaixo: espaçamento/raio da lib "DSC | Fundamentos Visuais"
      // v2.6.0 (spacing/*, border/radius/* em refs/fundamentos-visuais.json) — escala
      // completa desde 2026-09-30 (antes só a faixa útil de painel de ~400px).
      // Conferido por `npm run check:visual`. Nomes `dsc-*` preservados.
      spacing: {
        'dsc-quark':    '4px',
        'dsc-nano':     '8px',
        'dsc-micro':    '12px',
        'dsc-tiny':     '16px',
        'dsc-smaller':  '24px',
        'dsc-small':    '32px',
        'dsc-medium':   '40px',
        'dsc-large':    '48px',
        'dsc-larger':   '56px',
        'dsc-big':      '64px',
        'dsc-bigger':   '72px',
        'dsc-huge':     '80px',
        'dsc-giant':    '120px',
        'dsc-enormous': '160px',
      },
      borderRadius: {
        'dsc-quark':  '2px',
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
      // Roboto, NÃO CAIXA Std (corrigido em 2026-09-30). Nas libs do produto
      // (Super DSC Web e Super App, com estilos de texto resolvidos em
      // refs/super-dsc-web.json e super-app.json) a CAIXA Std só é usada em
      // title/display (20px ou mais, pesos 400 e 600); label, body e link
      // (12 a 18px, pesos 400/500/600/700, espaçamento de letras 0,1 a 0,5)
      // são Roboto. Toda a interface do hac está nessa faixa (nenhum texto
      // chega a 20px), e os tokens dsc-label-*/dsc-body-* abaixo são
      // exatamente esses estilos Roboto — incluindo o peso 500, que a
      // CAIXA Std não tem. Inter fica como fallback: é a fonte que o Figma
      // fornece ao iframe quando Roboto não está instalada.
      // Mesma pilha em plugin.css (body + 2 regras !important) — manter idêntica.
      fontFamily: {
        sans: ['"Roboto"', '"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
