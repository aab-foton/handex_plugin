// ============================================================
// frameworks.js — Catálogo e operações de frameworks (Maturai UX)
// ============================================================

let _activeCategory = 'Todos';

function renderFrameworks() {
  const list = document.getElementById('framework-list');
  if (!list) return;

  const filtered = _activeCategory === 'Todos'
    ? MATURAI_FRAMEWORKS
    : MATURAI_FRAMEWORKS.filter(f => f.category === _activeCategory);

  list.innerHTML = '';

  filtered.forEach(fw => {
    const fieldsHtml = fw.fields.map(f =>
      `<span class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-dark-muted text-[10px] font-bold rounded-full">${f.label}</span>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-dark-surface border border-gray-100 dark:border-dark-line rounded-2xl p-4 space-y-3 shadow-sm';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="w-10 h-10 flex items-center justify-center ${fw.bg} rounded-xl shrink-0">
          <i data-lucide="${fw.icon}" class="w-5 h-5 ${fw.color}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-extrabold text-[13px] text-slate-800 dark:text-white tracking-tight">${fw.name}</p>
            <span class="px-2 py-0.5 text-[9px] font-bold rounded uppercase tracking-wide ${fw.categoryColor}">${fw.category}</span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-dark-muted mt-1 leading-relaxed">${fw.description}</p>
        </div>
      </div>
      <div class="bg-slate-50 dark:bg-dark-bg/40 rounded-xl px-3 py-2">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Quando usar</p>
        <p class="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">${fw.when}</p>
      </div>
      <div>
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Campos estruturados (${fw.fields.length})</p>
        <div class="flex flex-wrap gap-1.5">${fieldsHtml}</div>
      </div>
      <button onclick="injectFramework('${fw.id}')"
        class="w-full py-2.5 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-600 hover:text-white text-emerald-700 dark:text-emerald-300 text-[12px] font-bold rounded-xl transition-all flex items-center justify-center gap-2">
        <i data-lucide="plus-circle" class="w-4 h-4"></i>
        Inserir no Canvas
      </button>
    `;
    list.appendChild(card);
  });

  try { lucide.createIcons(); } catch(e) {}
}

function _applyFilterStyles(category) {
  document.querySelectorAll('[data-fw-filter]').forEach(btn => {
    const active = btn.dataset.fwFilter === category;
    btn.className = `px-2.5 py-1 text-[10px] font-bold rounded-full transition-all ${
      active
        ? 'bg-[#059669] text-white'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-dark-muted hover:bg-slate-200'
    }`;
  });
}

function filterFrameworks(category) {
  _activeCategory = category;
  _applyFilterStyles(category);
  renderFrameworks();
}

function injectFramework(id) {
  const fw = MATURAI_FRAMEWORKS.find(f => f.id === id);
  if (!fw) return;
  parent.postMessage({ pluginMessage: { type: 'inject-framework', framework: fw } }, '*');
  showToast('Inserindo framework no canvas...', 'info');
}

function scanAll() {
  parent.postMessage({ pluginMessage: { type: 'scan-frameworks', frameworkIds: [] } }, '*');
  showToast('Escaneando canvas...', 'info');
}

function navigateToFrameworks() {
  navigate('view-frameworks');
  setTimeout(() => {
    _applyFilterStyles(_activeCategory);
    renderFrameworks();
  }, 50);
}

Object.assign(window, { renderFrameworks, filterFrameworks, injectFramework, scanAll, navigateToFrameworks });
