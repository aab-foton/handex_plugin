// ============================================================
// HANDEX PLUGIN — build.cjs
// Assembles all modular source files into the final ui.html
// that Figma requires as a single file.
//
// Usage:  node src/plugin/build.cjs
// Or via: npm run bundle:ui
// ============================================================

const fs   = require('fs');
const path = require('path');

const BASE = path.join(__dirname);
const OUT  = path.join(BASE, 'ui.html');

// ── Helpers ──────────────────────────────────────────────────
function read(relPath) {
  const abs = path.join(BASE, relPath);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠  Missing: ${relPath}`);
    return `/* MISSING: ${relPath} */`;
  }
  return fs.readFileSync(abs, 'utf8');
}

// ── Load source parts ─────────────────────────────────────────
const tailwindCSS = read('styles/tailwind-compiled.css');
const css         = read('styles/plugin.css');
const modCore    = read('modules/core.js');
const modBriefing = read('modules/briefing.js');
const modHomeCards = read('modules/home-cards.js');
const modHandoff = read('modules/handoff.js');
const modMeasure = read('modules/measurement.js');
const modSpecs   = read('modules/specifications.js');
const modOnboard = read('modules/onboarding.js');
const modData    = read('modules/design-data.js');
const modMsgs    = read('modules/messages.js');
// Spec Express -- módulo isolado (consulta rápida de propriedades brutas,
// sem conformidade DSC, sem persistência). Ver quick-spec.js/quick-spec.html.
const modQuickSpec = read('modules/quick-spec.js');
// Layout do diagrama de Fluxos de Tela -- mesmo arquivo importado por code.js
// (Ficha do canvas); aqui entra como script comum, sem o `export`.
const sharedFlowLayout = read('shared/flow-diagram-layout.js').replace(/^export\s+function/m, 'function');

// Skeleton das libs DSC (refs/_skeleton.json, gerado por refs/build-skeleton.cjs)
// -- reintroduzido no embed em 2026-09-24. Tinha sido removido achando que
// nada o consumia mais ("scan resolve via figma.getStyleByIdAsync"), mas
// getStyleByIdAsync só resolve NOME/flag remote de um estilo -- nunca
// confere componentKey contra a lib DSC de verdade. Sem o skeleton
// disponível, auditProperty() (audit.js) recebe referenceTokens null e
// NUNCA acha match por key -- toda auditoria de conformidade por
// componentKey ficava só no fallback de convenção [dsc] no nome, ou no
// proxy mais fraco remote===true (que não distingue "é do DSC" de "é de
// QUALQUER lib publicada"). Achado real: ícone "menu" (Fundamentos
// Visuais, vínculo confirmado no painel do Figma) reportado como
// "COMPONENTE PERSONALIZADO" mesmo com componentKey presente no skeleton,
// porque o skeleton nunca chegava ao backend pra comparação. A lib
// publicada continua sendo a fonte da verdade -- o skeleton é só o
// snapshot local dela, atualizado via `npm run refs:update`, nunca gerado
// nem inferido pelo próprio plugin.
let skeletonJSON = 'null';
const skeletonPath = path.join(BASE, 'refs', '_skeleton.json');
if (fs.existsSync(skeletonPath)) {
  skeletonJSON = fs.readFileSync(skeletonPath, 'utf8').trim();
} else {
  console.warn('⚠  refs/_skeleton.json not found — auditoria por componentKey ficará sem dados');
}

// ── Load Code Connect mappings (lib name → import path / docs) ──
const codeMapPath = path.join(BASE, 'refs', 'code-mappings.json');
let codeMappingsJSON = 'null';
if (fs.existsSync(codeMapPath)) {
  const raw = fs.readFileSync(codeMapPath, 'utf8');
  const parsed = JSON.parse(raw);
  codeMappingsJSON = JSON.stringify(parsed);
  const u2028 = String.fromCharCode(0x2028);
  const u2029 = String.fromCharCode(0x2029);
  if (codeMappingsJSON.indexOf(u2028) >= 0 || codeMappingsJSON.indexOf(u2029) >= 0) {
    throw new Error('⛔  code-mappings.json contains illegal U+2028/U+2029 whitespace');
  }
} else {
  console.warn('⚠  refs/code-mappings.json not found — Code Connect column will be empty');
}

// ── Load view partials ────────────────────────────────────────
const viewHome   = read('views/home.html');
const viewMeasure = read('views/measurement.html');
const viewGuide = read('views/guide.html');
const viewSpecs  = read('views/specifications.html');
const viewFrames           = read('views/handoff.html');
const viewFlows            = read('views/flows.html');
const viewDadosProjeto     = read('views/dados-projeto.html');
const viewHandoffSummary   = read('views/handoff-summary.html');
const modalsShared         = read('views/modals.html');
const viewQuickSpec        = read('views/quick-spec.html');

// ── Assemble ──────────────────────────────────────────────────
const html = `<!doctype html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">
  <!-- Versão fixada (não @latest): cache de CDN mais previsível e evita
       quebra silenciosa se uma versão nova do Lucide mudar a API de ícones.
       Atualizar manualmente quando quiser ícones novos. -->
  <script src="https://unpkg.com/lucide@1.47.0" defer></script>
  <script>
    // Shim síncrono: garante que window.lucide existe antes dos módulos rodarem
    // (lucide é defer — pode não ter carregado ainda ao executar os módulos).
    // Quando o script defer carregar, substitui o shim e dispara _refreshIcons.
    if (typeof window.lucide === 'undefined') {
      window.lucide = { createIcons: function () {} };
    }
    document.querySelector('script[src*="lucide"]')?.addEventListener('load', function() {
      if (window._refreshIcons) window._refreshIcons();
    });
  </script>
  <script>
    // Code Connect mappings — DSC lib name → code import path.
    // Edit refs/code-mappings.json and rebuild to update.
    window.__HANDEX_CODE_MAPPINGS__ = ${codeMappingsJSON};
  </script>
  <script>
    // Skeleton das libs DSC (fonte real: refs/_skeleton.json, atualizado via
    // 'npm run refs:update') -- enviado ao backend em cada scan-frame pra
    // auditProperty() (audit.js) checar componentKey/style/variable contra a
    // lib publicada de verdade. Objeto já parseado (não é fetch nem JSON.parse
    // de string em runtime) -- não bloqueia DOMContentLoaded/ui-ready.
    window.__HANDEX_REF_SKELETON__ = ${skeletonJSON};
  </script>
  <!-- jszip + jspdf carregados sob demanda ao exportar -->
  <style>
${tailwindCSS}
${css}
  </style>
</head>

<body class="h-screen flex flex-col overflow-hidden bg-light-bg text-slate-900 dark:bg-dark-bg dark:text-dark-text">
  <header
    class="relative flex items-center justify-between px-4 py-2 border-b border-light-line dark:border-dark-line shrink-0 bg-light-surface dark:bg-dark-bg z-50">
    <!-- Home Header -->
    <div id="header-home" class="flex items-center justify-between w-full">
      <button type="button" onclick="openModal('about-modal')" title="Sobre o Handex" aria-label="Sobre o Handex"
        class="flex items-center gap-2 -m-1 p-1 rounded-md hover:bg-light-line dark:hover:bg-dark-surface transition-colors cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631" class="h-5 w-auto">
          <g transform="translate(-284.78446,-475.51214)">
            <g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)">
              <g transform="scale(0.24,0.24)">
                <path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
                <path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
                <path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f39200;fill-opacity:1;fill-rule:evenodd;stroke:none" />
                <path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f39200;fill-opacity:1;fill-rule:evenodd;stroke:none" />
                <path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
                <path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              </g>
            </g>
          </g>
        </svg>
        <span class="text-slate-800 dark:text-white font-bold text-[12px] opacity-50">|</span>
        <h1 class="font-bold text-slate-800 dark:text-white text-[12px] tracking-[0.15em] uppercase">
          HANDEX
        </h1>
      </button>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick="ensureExpanded(); openDadosProjetoModal()" title="Dados do Projeto" aria-label="Dados do Projeto"
          class="p-1.5 hover:bg-light-line dark:hover:bg-dark-surface rounded-md transition-colors cursor-pointer text-slate-600 dark:text-dark-muted">
          <i data-lucide="clipboard-list" class="w-4 h-4" aria-hidden="true"></i>
        </button>
        <!-- Backup (2026-10-08, mesmo padrão do hac): baixar e restaurar o
             projeto saíram do rodapé da home para este menu. Limpar dados
             fica no modal de salvamento automático (rodapé). -->
        <div class="relative">
          <button type="button" id="btn-hx-backup-menu" onclick="ensureExpanded(); toggleHxBackupMenu()"
            title="Backup do projeto" aria-label="Baixar ou restaurar backup do projeto" aria-haspopup="true" aria-expanded="false" aria-controls="hx-backup-menu"
            class="p-1.5 hover:bg-light-line dark:hover:bg-dark-surface rounded-md transition-colors cursor-pointer text-slate-600 dark:text-dark-muted">
            <i data-lucide="hard-drive-download" class="w-4 h-4" aria-hidden="true"></i>
          </button>
          <div id="hx-backup-menu" class="hidden absolute right-0 top-full mt-1 w-64 py-1.5 bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-gray-100 dark:border-dark-line z-[1100]">
            <button type="button" onclick="toggleHxBackupMenu(false); exportHandoffData()"
              class="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left">
              <i data-lucide="download" class="w-4 h-4 mt-0.5 text-slate-500 dark:text-dark-muted shrink-0" aria-hidden="true"></i>
              <span class="min-w-0">
                <span class="block">Baixar backup (.json)</span>
                <span class="block text-[11px] font-normal text-slate-500 dark:text-dark-muted leading-snug">Guarda o projeto ou passa para outro designer.</span>
              </span>
            </button>
            <button type="button" onclick="toggleHxBackupMenu(false); navigate('view-handoff-summary'); setTimeout(() => openModal('export-modal'), 50)"
              class="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left">
              <i data-lucide="file-text" class="w-4 h-4 mt-0.5 text-slate-500 dark:text-dark-muted shrink-0" aria-hidden="true"></i>
              <span class="min-w-0">
                <span class="block">Outras exportações</span>
                <span class="block text-[11px] font-normal text-slate-500 dark:text-dark-muted leading-snug">Ficha em PDF, Markdown, briefing, contexto para IA.</span>
              </span>
            </button>
            <div class="my-1 border-t border-gray-100 dark:border-dark-line"></div>
            <button type="button" onclick="toggleHxBackupMenu(false); importHandoffData()"
              class="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left">
              <i data-lucide="upload" class="w-4 h-4 mt-0.5 text-slate-500 dark:text-dark-muted shrink-0" aria-hidden="true"></i>
              <span class="min-w-0">
                <span class="block">Restaurar backup (.json)</span>
                <span class="block text-[11px] font-normal text-slate-500 dark:text-dark-muted leading-snug">Substitui a sua documentação atual neste arquivo.</span>
              </span>
            </button>
          </div>
        </div>
        <!-- Personalização (2026-10-08, mesmo padrão do hac): escala da
             interface, tema e espaçamento de texto (WCAG 2.2, 1.4.12) num menu
             só, no lugar dos botões soltos de zoom e tema. -->
        <div class="relative">
          <button type="button" id="btn-hx-personalize" onclick="ensureExpanded(); toggleHxPersonalizeMenu()"
            title="Personalização" aria-label="Personalização" aria-haspopup="true" aria-expanded="false" aria-controls="hx-personalize-menu"
            class="p-1.5 hover:bg-light-line dark:hover:bg-dark-surface rounded-md transition-colors cursor-pointer text-slate-600 dark:text-dark-muted">
            <i data-lucide="sliders-horizontal" class="w-5 h-5" aria-hidden="true"></i>
          </button>
          <div id="hx-personalize-menu" role="dialog" aria-label="Personalização" class="hidden absolute right-0 top-full mt-1 w-64 p-3 space-y-3 bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-gray-100 dark:border-dark-line z-[1100]">
            <p class="text-[12px] font-bold text-slate-800 dark:text-white">Personalização</p>
            <div>
              <p class="text-[11px] font-bold text-slate-500 dark:text-dark-muted mb-1.5" id="hx-pz-scale-label">Escala da interface</p>
              <div class="grid grid-cols-3 gap-1" role="group" aria-labelledby="hx-pz-scale-label">
                <button type="button" data-hx-scale="1" onclick="setUiScale(1)" class="hx-pz-opt">100%</button>
                <button type="button" data-hx-scale="1.15" onclick="setUiScale(1.15)" class="hx-pz-opt">115%</button>
                <button type="button" data-hx-scale="1.3" onclick="setUiScale(1.3)" class="hx-pz-opt">130%</button>
              </div>
            </div>
            <div>
              <p class="text-[11px] font-bold text-slate-500 dark:text-dark-muted mb-1.5" id="hx-pz-theme-label">Tema</p>
              <div class="grid grid-cols-2 gap-1" role="group" aria-labelledby="hx-pz-theme-label">
                <button type="button" data-hx-theme="light" onclick="setHxTheme('light')" class="hx-pz-opt">Claro</button>
                <button type="button" data-hx-theme="dark" onclick="setHxTheme('dark')" class="hx-pz-opt">Escuro</button>
              </div>
            </div>
            <label class="flex items-start justify-between gap-2 cursor-pointer">
              <span>
                <span class="block text-[11px] font-bold text-slate-500 dark:text-dark-muted">Espaçamento de texto</span>
                <span class="block text-[11px] text-slate-500 dark:text-dark-muted leading-snug">Mais espaço entre linhas, letras e palavras</span>
              </span>
              <input type="checkbox" role="switch" id="hx-pz-text-spacing" onchange="setHxTextSpacing(this.checked)" class="hx-switch mt-0.5 shrink-0">
            </label>
          </div>
        </div>
        <button onclick="toggleCollapse()" id="btn-collapse" aria-label="Minimizar plugin"
          title="Minimizar — clique no ícone para expandir novamente"
          class="p-1.5 hover:bg-light-line dark:hover:bg-dark-surface rounded-md transition-colors cursor-pointer text-slate-600 dark:text-dark-muted">
          <i data-lucide="minimize-2" class="w-4 h-4" aria-hidden="true"></i>
        </button>
      </div>
    </div>

  </header>

  <div class="flex-1 overflow-hidden relative min-h-0">
${viewHome}
${viewMeasure}
${viewGuide}
${viewSpecs}
${viewFrames}
${viewFlows}
${viewDadosProjeto}
${viewHandoffSummary}
${viewQuickSpec}
${modalsShared}
  </div>

  <!-- Rodapé de salvamento automático (2026-10-08, mesmo padrão do hac):
       sempre visível, mostra o estado real ('storage-saved'/'storage-save-failed')
       e abre a orientação sobre salvamento e limpeza (autosave-modal).
       Oculto com o plugin recolhido e na captura do Detalhar UI (plugin.css). -->
  <footer id="hx-autosave-bar" class="shrink-0 h-8 border-t border-gray-100 dark:border-dark-line bg-white dark:bg-dark-surface">
    <button type="button" id="hx-autosave-btn" onclick="openModal('autosave-modal')" aria-haspopup="dialog"
      aria-label="Salvamento automático ativo. Abrir orientações sobre salvamento e limpeza"
      class="w-full h-full flex items-center gap-1.5 px-4 text-[11px] hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
      <span id="hx-autosave-icon" class="shrink-0 flex items-center text-green-600 dark:text-green-400" aria-hidden="true"><i data-lucide="cloud-check" class="w-3.5 h-3.5"></i></span>
      <span id="hx-autosave-text" class="flex-1 min-w-0 text-left truncate font-semibold text-slate-600 dark:text-dark-muted">Salvamento automático ativo</span>
      <span class="shrink-0 flex items-center gap-0.5 font-bold text-[#005ca9] dark:text-blue-300">Como funciona <i data-lucide="chevron-up" class="w-3 h-3" aria-hidden="true"></i></span>
    </button>
    <span id="hx-autosave-live" class="sr-only" role="status" aria-live="polite"></span>
  </footer>

  <!--
    Plugin runtime — concatenado em um único <script> para que todos os
    módulos compartilhem o mesmo escopo. A separação em arquivos-fonte é
    puramente organizacional; o resultado em runtime é idêntico ao monolito
    anterior.
  -->
  <script>
// ============================================================
// MODULE: core.js
// ============================================================
${modCore}

// ============================================================
// MODULE: briefing.js
// ============================================================
${modBriefing}

// ============================================================
// MODULE: home-cards.js
// ============================================================
${modHomeCards}

// ============================================================
// MODULE: messages.js
// ============================================================
${modMsgs}

// ============================================================
// MODULE: measurement.js
// ============================================================
${modMeasure}

// ============================================================
// MODULE: specifications.js
// ============================================================
${modSpecs}

// ============================================================
// MODULE: onboarding.js
// ============================================================
${modOnboard}

// ============================================================
// MODULE: design-data.js
// ============================================================
${modData}

// ============================================================
// MODULE: handoff.js
// ============================================================
${modHandoff}

// ============================================================
// MODULE: quick-spec.js (Spec Express — módulo isolado)
// ============================================================
${modQuickSpec}

// ============================================================
// SHARED: flow-diagram-layout.js (também usado por code.js)
// ============================================================
${sharedFlowLayout}
  </script>

  <!-- Back-to-top button (ghost at rest, highlighted on hover -- estilo real
       vem de #btn-top em styles/plugin.css, não das classes Tailwind
       abaixo, que só cuidam de posição/tamanho/estado de visibilidade) -->
  <button id="btn-top" onclick="scrollToTop()" title="Voltar ao topo" aria-label="Voltar ao topo"
    class="fixed bottom-6 right-6 w-10 h-10 rounded-full flex items-center justify-center opacity-0 pointer-events-none translate-y-10 z-[100] transition-colors duration-200">
    <i data-lucide="chevron-up" class="w-5 h-5"></i>
  </button>

  <div id="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>
  <div id="resize-handle"></div>

</body>
</html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`✅ ui.html assembled (${(html.length / 1024).toFixed(1)} KB)`);
console.log(`   Source: ${BASE}`);
console.log(`   Output: ${OUT}`);
