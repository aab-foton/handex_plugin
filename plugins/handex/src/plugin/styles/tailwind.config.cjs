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
        // -- Escalas ancoradas na lib "DSC | Fundamentos Visuais" (2026-10-01) --
        // Mesmo método de blue/orange: degraus ancorados nos valores reais da lib
        // (color/bg|content|border/*), intermediários interpolados. Substituem as
        // escalas padrão do Tailwind, para que as classes já usadas nas views
        // (slate/gray/red/green/amber) renderizem cores da lib sem reescrever as telas.
        // neutros, grayscale 10/30/50/70/90/110/130: 50=#f7fafa 100=#ebf1f2 300=#d0e0e3 500=#64747a (4,9:1 s/ branco) 700=#404b52 800=#22292e; 200/400/600 interpolados; 900/950 além do último degrau
        slate: {
          50: '#f7fafa',
          100: '#ebf1f2',
          200: '#dee9eb',
          300: '#d0e0e3',
          400: '#819399',
          500: '#64747a',
          600: '#526066',
          700: '#404b52',
          800: '#22292e',
          900: '#1a1f23',
          950: '#0f1215',
        },
        // mesmo valor de slate (a UI usa gray e slate sem distinção semântica)
        gray: {
          50: '#f7fafa',
          100: '#ebf1f2',
          200: '#dee9eb',
          300: '#d0e0e3',
          400: '#819399',
          500: '#64747a',
          600: '#526066',
          700: '#404b52',
          800: '#22292e',
          900: '#1a1f23',
          950: '#0f1215',
        },
        // negative 10/30/50/90/110: 400=#e47272 (texto em tema escuro, 4,9:1 s/ #22292e) 500=#b22c2c (6,4:1 s/ branco) 700=#8c2424; negative 70 (#d93636) fica fora dos degraus por não passar 4,5:1 sobre tinta clara
        red: {
          50: '#fbebeb',
          100: '#f6cdcd',
          200: '#f0afaf',
          300: '#ea9191',
          400: '#e47272',
          500: '#b22c2c',
          600: '#9f2828',
          700: '#8c2424',
          800: '#651a1a',
          900: '#421111',
          950: '#280a0a',
        },
        // positive 10/30/50/90/110: 400=#5cb26e (texto escuro) 500=#127527 (5,8:1 s/ branco) 700=#0d581d
        green: {
          50: '#e7f4ea',
          100: '#c5e4cc',
          200: '#a2d3ad',
          300: '#7fc38e',
          400: '#5cb26e',
          500: '#127527',
          600: '#106722',
          700: '#0d581d',
          800: '#093f15',
          900: '#06290e',
          950: '#041908',
        },
        // attention 10/30/50/70/110/130: 400=#fcbe05 (ponto/texto escuro) 500=#977203 (4,45:1 s/ branco; attention 90 #ca9804 só dá 2,6:1) 700=#654c02
        amber: {
          50: '#fff9e6',
          100: '#ffefc1',
          200: '#fee59b',
          300: '#fdd150',
          400: '#fcbe05',
          500: '#977203',
          600: '#7e5f03',
          700: '#654c02',
          800: '#4c3902',
          900: '#382a01',
          950: '#231b01',
        },
        // ceu 10..130 (card Tokens): 600=#007899 (5,1:1 s/ branco)
        ceu: {
          50: '#e8faff',
          100: '#d0f5ff',
          200: '#6edbfa',
          300: '#2ec8f3',
          400: '#00b4e6',
          500: '#008cb2',
          600: '#007899',
          700: '#006480',
          800: '#003c4d',
          900: '#002732',
          950: '#00181f',
        },
        // tertiary 10..110 (card Specs Rápidas): 600=#2b8174 (4,7:1 s/ branco)
        turquesa: {
          50: '#f2fbfa',
          100: '#e4f7f4',
          200: '#b9ebe3',
          300: '#81d6c9',
          400: '#54bbab',
          500: '#359485',
          600: '#2b8174',
          700: '#216e62',
          800: '#184f47',
          900: '#10332e',
          950: '#0a201c',
        },
        // informative 10..110 (card Medidas): 600=#037286 (5,6:1 s/ branco)
        info: {
          50: '#f2fafc',
          100: '#e5f5f8',
          200: '#9bdae5',
          300: '#4fbed2',
          400: '#04a2bf',
          500: '#038299',
          600: '#037286',
          700: '#026273',
          800: '#014753',
          900: '#012e36',
          950: '#001c21',
        },
        // Superfícies (2026-10-01): só neutros da lib. light.bg=grayscale 30, line=grayscale 50,
        // muted=grayscale 90 (4,9:1 s/ branco); dark.bg/surface/line = slate-900/800/700,
        // text=grayscale 10, muted=grayscale 70 (6,7:1 s/ dark.surface).
        light: {
          bg:      '#ebf1f2',
          surface: '#ffffff',
          line:    '#d0e0e3',
          muted:   '#64747a',
        },
        dark: {
          bg:      '#1a1f23',
          surface: '#22292e',
          line:    '#404b52',
          text:    '#f7fafa',
          muted:   '#9eb2b8',
        },
        // Cores de STATUS (2026-10-01) — status do frame e marcadores dos itens
        // escaneados. Valores reais da lib "DSC | Fundamentos Visuais"
        // (refs/fundamentos-visuais.json, color/content/*), no degrau que
        // passa 4,5:1 em texto de 11px sobre branco; as variantes `-dark`
        // (degrau 30/50) passam 7:1 sobre dark-bg e dark-surface.
        //   ok      positive 90   #127527 (5,8:1)   ok-dark   positive 30  #a2d3ad
        //   warn    attention 130 #654c02 (8,1:1)   warn-dark attention 30 #fee59b
        //   err     negative 90   #b22c2c (6,4:1)   err-dark  negative 30  #f0afaf
        //   neutral grayscale 90  #64747a (4,9:1)   (escuro: dark-muted)
        //   info    primary 90    #005ca9 (6,8:1)   info-dark primary 50   #6dbafa
        // attention 110 (#977203) dá 4,45:1 — abaixo do mínimo — por isso 130.
        st: {
          ok:           '#127527',
          'ok-dark':    '#a2d3ad',
          warn:         '#654c02',
          'warn-dark':  '#fee59b',
          err:          '#b22c2c',
          'err-dark':   '#f0afaf',
          neutral:      '#64747a',
          info:         '#005ca9',
          'info-dark':  '#6dbafa',
        },
      },
    },
  },
  safelist: [
    // Paleta de categoria de scan (_getCatColor): órfã (dívida 18). Reduzida em
    // 2026-10-01 às escalas que existem na lib (slate, blue); pink/lime/rose/
    // emerald/yellow/teal/cyan saíram por estarem fora da lib.
    'bg-slate-100','text-slate-600','border-slate-200',
    'bg-blue-50','text-blue-600','border-blue-200',
    'dark:bg-slate-700','dark:text-slate-400','dark:border-slate-600',
    'dark:bg-blue-900/30','dark:text-blue-400','dark:border-blue-800/40',
  ],
  plugins: [],
};
