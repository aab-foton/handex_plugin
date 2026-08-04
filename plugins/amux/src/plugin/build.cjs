// ============================================================
// AMUX — build.cjs
// Monta todos os arquivos modulares em um único ui.html
// Uso: node src/plugin/build.cjs  |  npm run bundle:ui
// ============================================================

const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname);
const OUT  = path.join(BASE, 'ui.html');

function read(relPath) {
  const abs = path.join(BASE, relPath);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠  Missing: ${relPath}`);
    return `/* MISSING: ${relPath} */`;
  }
  return fs.readFileSync(abs, 'utf8');
}

// Frameworks JSON embutido como variável global
const frameworksJSON = JSON.stringify(JSON.parse(fs.readFileSync(path.join(BASE, 'refs', 'frameworks.json'), 'utf8')));

const css          = read('styles/plugin.css');
const modCore      = read('modules/core.js');
const modAudit     = read('modules/audit.js');
const modEvidence  = read('modules/evidence-bridge.js');
const modUxTest    = read('modules/usability-test.js');
const modMsgs      = read('modules/messages.js');
const modAi        = read('modules/ai-client.js');
const modFw        = read('modules/frameworks.js');

const viewHome        = read('views/home.html');
const viewBriefing    = read('views/briefing.html');
const viewAudit       = read('views/audit.html');
const viewScore       = read('views/score.html');
const viewFrameworks  = read('views/frameworks.html');
const viewUxTest      = read('views/usability-test.html');
const viewGuide       = read('views/guide.html');
const modals          = read('views/modals.html');

const html = `<!doctype html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <script>
    if (typeof window.lucide === 'undefined') {
      window.lucide = { createIcons: function () {} };
    }
  </script>
  <script>
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          colors: {
            dark: {
              bg:      "#0f172a",
              surface: "#1e293b",
              line:    "#334155",
              text:    "#f1f5f9",
              muted:   "#94a3b8",
            },
          },
        },
      },
    };
  </script>
  <style>
${css}
  </style>
</head>

<body class="h-screen flex flex-col overflow-hidden bg-white text-slate-900 dark:bg-dark-bg dark:text-dark-text">

  <header class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-dark-line shrink-0 bg-white dark:bg-dark-bg z-50">
    <div class="flex items-center gap-2">
      <!-- Logo AMUX -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" class="h-6 w-6">
        <rect width="40" height="40" rx="8" fill="#2563eb"/>
        <path d="M12 26 L16 14 L20 26 M14 21 L18 21" stroke="white" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M23 26 L23 14 L29 26 L29 14" stroke="white" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="text-[#1E293B] dark:text-white font-bold text-[12px] opacity-50">|</span>
      <h1 class="font-bold text-[#1E293B] dark:text-white text-[12px] tracking-[0.15em] uppercase">AMUX</h1>
      <span id="version-badge" class="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-bold rounded flex items-center justify-center">v1.0.0</span>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <button onclick="exportAmuxData()" title="Exportar dados do projeto" aria-label="Exportar"
        class="p-1.5 hover:bg-blue-50 dark:hover:bg-dark-surface rounded-md transition-colors cursor-pointer text-blue-600 dark:text-blue-400">
        <i data-lucide="download" class="w-4 h-4" aria-hidden="true"></i>
      </button>
      <button onclick="toggleTheme()" title="Alternar tema" aria-label="Alternar tema claro/escuro"
        class="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface rounded-md transition-colors cursor-pointer text-slate-600 dark:text-dark-muted">
        <i data-lucide="sun" class="sun-icon w-5 h-5" aria-hidden="true"></i>
        <i data-lucide="moon" class="moon-icon w-5 h-5 hidden" aria-hidden="true"></i>
      </button>
      <button onclick="toggleCollapse()" id="btn-collapse"
        title="Minimizar — clique no ícone para expandir novamente" aria-label="Minimizar plugin"
        class="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-surface rounded-md transition-colors cursor-pointer text-slate-600 dark:text-dark-muted">
        <i data-lucide="minimize-2" class="w-4 h-4" aria-hidden="true"></i>
      </button>
    </div>
  </header>

  <div class="flex-1 overflow-y-auto relative">
${viewHome}
${viewBriefing}
${viewAudit}
${viewScore}
${viewFrameworks}
${viewUxTest}
${viewGuide}
${modals}
  </div>

  <footer id="footer-signature" class="pb-2 pt-1 text-center shrink-0 bg-white dark:bg-dark-bg">
    <p class="text-[9px] text-gray-400 dark:text-dark-muted font-bold tracking-wider uppercase">
      Auditoria & Maturidade em UX
    </p>
  </footer>

  <script>
    // Frameworks data — embutido do refs/frameworks.json no build
    const AMUX_FRAMEWORKS = ${frameworksJSON};

// ============================================================
// MODULE: core.js
// ============================================================
${modCore}

// ============================================================
// MODULE: audit.js
// ============================================================
${modAudit}

// ============================================================
// MODULE: evidence-bridge.js
// ============================================================
${modEvidence}

// ============================================================
// MODULE: usability-test.js
// ============================================================
${modUxTest}

// ============================================================
// MODULE: messages.js
// ============================================================
${modMsgs}

// ============================================================
// MODULE: ai-client.js
// ============================================================
${modAi}

// ============================================================
// MODULE: frameworks.js
// ============================================================
${modFw}
  </script>

  <button id="btn-top" onclick="scrollToTop()" title="Voltar ao topo" aria-label="Voltar ao topo"
    class="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center opacity-0 pointer-events-none translate-y-10 z-[100]">
    <i data-lucide="chevron-up" class="w-5 h-5"></i>
  </button>

  <script>
    window.addEventListener('load', () => {
      if (typeof lucide !== 'undefined') lucide.createIcons();
    });

    function handleScroll(el) {
      const btn = document.getElementById('btn-top');
      if (!btn) return;
      if (el.scrollTop > 80) {
        btn.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10');
      } else {
        btn.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
      }
    }
    // O scroll de fato acontece dentro de cada <main class="view">
    // (cada view tem seu próprio overflow-y-auto), não no wrapper
    // ".flex-1.overflow-y-auto" que só as contém — scroll não faz bubble,
    // então escutamos na fase de captura no ancestral comum para cobrir
    // qualquer view ativa sem precisar de um listener por view.
    document.addEventListener('scroll', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('view')) {
        handleScroll(e.target);
      }
    }, true);
    function scrollToTop() {
      document.querySelectorAll('.view.active').forEach(v => v.scrollTo({ top: 0, behavior: 'smooth' }));
      const sc = document.querySelector('.flex-1.overflow-y-auto');
      if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' });
    }
  </script>

  <div id="toast-container"></div>
  <div id="resize-handle"></div>

</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`✅ ui.html assembled (${(html.length / 1024).toFixed(1)} KB)`);
console.log(`   Source: ${BASE}`);
console.log(`   Output: ${OUT}`);
