// ============================================================
// accessibility.js — aba "Acessibilidade" da tela "Anotar Specs"
//
// Dois tipos de spec estruturada, criados exatamente como uma spec normal
// (elemento selecionado no canvas → formulário → create-unified-spec):
//   - Leitor de Tela   (Label, Role, Hint, Estado)
//   - Ordem de Tabulação (Ordem — número)
//
// Reaproveita a infraestrutura de specs já existente:
//   - Categoria "Acessibilidade" já cadastrada em specifications.js
//     (getCategoryColor/getCategoryFill, DEFAULT_CATEGORIES)
//   - Handler de backend 'create-unified-spec' (code.js) — sem schema paralelo,
//     os campos estruturados viram properties: [{key,label,value}]
//   - Array global `createdSpecs` (mesma fonte que alimenta renderSpecsList(),
//     ver nota "ÓRFÃ" em specifications.js sobre frame.createdSpecs vs createdSpecs)
//
// O switcher de aba (Specs | Acessibilidade) vive em specifications.js
// (switchSpecsMainTab) e chama renderA11ySpecsList() ao abrir esta aba.
//
// Depende de: handoffData, createdSpecs, getCategoryColor, getCategoryFill,
// saveToStorage, showToast, focusNode, openModal/closeModal, escapeHtml
// ============================================================

const A11Y_TYPES = {
  'leitor-de-tela':   { label: 'Leitor de Tela',     icon: 'volume-2' },
  'ordem-tabulacao':  { label: 'Ordem de Tabulação', icon: 'list-ordered' },
};

// ── Criação ──────────────────────────────────────────────────────────────

// Botão "Nova spec A11y" no header abre este menu com os dois tipos, em vez
// de criar diretamente — mesmo padrão de popover já usado em
// toggleMeasureTypesHelp (measurement.js): fecha ao clicar fora ou Esc.
function toggleA11yTypeMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('a11y-type-menu');
  const btn = document.getElementById('specs-header-action-a11y');
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) {
    closeA11yTypeMenu();
    return;
  }
  menu.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  const close = (ev) => {
    const wrap = document.getElementById('specs-header-action-a11y-wrap');
    if (!wrap || !wrap.contains(ev.target)) closeA11yTypeMenu();
  };
  const onEsc = (ev) => {
    if (ev.key === 'Escape') closeA11yTypeMenu();
  };
  _a11yMenuCloseHandlers = { close, onEsc };
  setTimeout(() => {
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', onEsc, true);
  }, 0);
}
window.toggleA11yTypeMenu = toggleA11yTypeMenu;

let _a11yMenuCloseHandlers = null;

function closeA11yTypeMenu() {
  const menu = document.getElementById('a11y-type-menu');
  const btn = document.getElementById('specs-header-action-a11y');
  if (menu) menu.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (_a11yMenuCloseHandlers) {
    document.removeEventListener('click', _a11yMenuCloseHandlers.close, true);
    document.removeEventListener('keydown', _a11yMenuCloseHandlers.onEsc, true);
    _a11yMenuCloseHandlers = null;
  }
}
window.closeA11yTypeMenu = closeA11yTypeMenu;

function chooseA11yType(subtype) {
  closeA11yTypeMenu();
  openA11yModal(subtype);
}
window.chooseA11yType = chooseA11yType;

function openA11yModal(subtype) {
  const meta = A11Y_TYPES[subtype];
  if (!meta) return;

  const modal = document.getElementById('a11y-spec-modal');
  if (!modal) return;
  modal.dataset.subtype = subtype;

  const title = document.getElementById('a11y-modal-title-text');
  if (title) title.textContent = subtype === 'leitor-de-tela' ? 'Especificação de Leitor de Tela' : 'Ordem de Tabulação';

  const fieldsScreenReader = document.getElementById('a11y-fields-screenreader');
  const fieldsTabOrder = document.getElementById('a11y-fields-taborder');
  if (fieldsScreenReader) fieldsScreenReader.classList.toggle('hidden', subtype !== 'leitor-de-tela');
  if (fieldsTabOrder) fieldsTabOrder.classList.toggle('hidden', subtype !== 'ordem-tabulacao');

  ['a11y-sr-label', 'a11y-sr-role', 'a11y-sr-hint', 'a11y-sr-estado', 'a11y-to-ordem'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  openModal('a11y-spec-modal');
}
window.openA11yModal = openA11yModal;

function closeA11yModal() {
  closeModal('a11y-spec-modal');
}
window.closeA11yModal = closeA11yModal;

// Próxima letra de Tag livre — mesmo namespace de agrupamento visual usado
// pelas specs normais no canvas (badge + linha de conexão).
function _nextA11ySpecLetter() {
  const used = new Set((createdSpecs || []).map(s => s && s.letter).filter(Boolean));
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!used.has(letter)) return letter;
  }
  let n = 1;
  while (used.has('A' + n)) n++;
  return 'A' + n;
}

function confirmA11ySpec() {
  const modal = document.getElementById('a11y-spec-modal');
  const subtype = modal ? modal.dataset.subtype : '';
  const meta = A11Y_TYPES[subtype];
  if (!meta) return;

  const g = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  let properties = [];

  if (subtype === 'leitor-de-tela') {
    const label = g('a11y-sr-label');
    if (!label) {
      showToast('Informe o Label do elemento.');
      return;
    }
    properties = [
      { key: 'label', label: 'Label', value: label },
      { key: 'role', label: 'Role', value: g('a11y-sr-role') },
      { key: 'hint', label: 'Hint', value: g('a11y-sr-hint') },
      { key: 'estado', label: 'Estado', value: g('a11y-sr-estado') },
    ].filter(p => p.value);
  } else if (subtype === 'ordem-tabulacao') {
    const ordemRaw = g('a11y-to-ordem');
    const ordem = parseInt(ordemRaw, 10);
    if (!ordemRaw || isNaN(ordem)) {
      showToast('Informe a ordem de tabulação (número).');
      return;
    }
    properties = [{ key: 'ordem', label: 'Ordem', value: String(ordem) }];
  }

  const opts = {
    category: 'acessibilidade',
    categoryLabel: 'Acessibilidade',
    letter: _nextA11ySpecLetter(),
    color: getCategoryColor('acessibilidade'),
    fillColor: getCategoryFill('acessibilidade'),
    guideSide: 'right',
    drawConnection: true,
    properties,
    // --- Acessibilidade --- diferencia o subtipo na hora de renderizar/agrupar
    a11yType: subtype,
  };

  parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
  closeA11yModal();
}
window.confirmA11ySpec = confirmA11ySpec;

// ── Listagem ─────────────────────────────────────────────────────────────

function renderA11ySpecsList() {
  const list = document.getElementById('a11y-specs-results');
  if (!list) return;
  list.innerHTML = '';

  const items = (createdSpecs || [])
    .map((s, i) => (s ? Object.assign({}, s, { originalIndex: i }) : null))
    .filter(s => s && s.a11yType);

  const hint = document.getElementById('hint-a11y-specs');
  if (hint) hint.classList.toggle('hidden', items.length > 0);

  if (items.length === 0) {
    list.innerHTML = `
      <li class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500 list-none">
        <div class="relative mb-4">
          <i data-lucide="accessibility" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
        </div>
        <p class="text-[12px] font-bold text-slate-500 dark:text-dark-muted text-center px-4 mb-1">Nenhuma especificação de acessibilidade ainda</p>
        <p class="text-[10px] text-slate-400 dark:text-dark-muted text-center px-6">Selecione um elemento no canvas e escolha um dos tipos acima</p>
      </li>
    `;
    _refreshIcons();
    return;
  }

  items.forEach(spec => {
    const meta = A11Y_TYPES[spec.a11yType] || { label: 'Acessibilidade', icon: 'accessibility' };
    const color = spec.color || '#0891B2';
    const fill = spec.fillColor || getCategoryFill('acessibilidade');
    const props = spec.properties || [];
    const isPending = spec.pendingConfirmation === true;

    const li = document.createElement('li');
    li.className = 'relative bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-line overflow-hidden list-none';
    li.innerHTML = `
      ${isPending ? `
      <div class="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30">
        <i data-lucide="move" class="w-3 h-3 text-amber-500 shrink-0"></i>
        <span class="flex-1 min-w-0 text-[9px] font-bold text-amber-600 dark:text-amber-400 truncate">Posicionando…</span>
        <button type="button" onclick="lockA11ySpec('${spec.id}')"
          class="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/30 border border-amber-200 dark:border-amber-700/40 rounded-md hover:bg-amber-200 transition-colors shrink-0">
          <i data-lucide="check" class="w-2.5 h-2.5"></i> Concluir posicionamento
        </button>
      </div>` : ''}
      <div class="flex items-start px-2.5 py-2 gap-2">
        <div class="w-5 h-5 rounded flex items-center justify-center text-[9px] font-extrabold text-white shrink-0 mt-0.5" style="background-color:${color}">${escapeHtml(spec.letter || 'A')}</div>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-semibold text-slate-700 dark:text-white truncate">${escapeHtml(spec.name || 'Elemento')}</p>
          <span class="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-bold" style="background-color:${fill};border-color:${color};color:${color};">
            <i data-lucide="${meta.icon}" class="w-2.5 h-2.5"></i> ${meta.label}
          </span>
        </div>
        <button type="button" title="Focar no elemento no canvas" aria-label="Focar no elemento no canvas"
          onclick="focusNode('${spec.id}')"
          class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
          <i data-lucide="locate" class="w-3.5 h-3.5"></i>
        </button>
        <button type="button" title="Remover" aria-label="Remover especificação de acessibilidade"
          onclick="deleteA11ySpec(${spec.originalIndex})"
          class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      ${props.length > 0 ? `
      <div class="px-2.5 pb-2.5 space-y-1">
        ${props.map(p => `
          <div class="flex items-center justify-between gap-2 px-2 py-1 bg-gray-50 dark:bg-dark-bg rounded-lg">
            <span class="text-[9px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider">${escapeHtml(p.label)}</span>
            <span class="text-[10px] font-semibold text-slate-700 dark:text-white text-right">${escapeHtml(String(p.value))}</span>
          </div>`).join('')}
      </div>` : ''}
    `;
    list.appendChild(li);
  });

  _refreshIcons();
}
window.renderA11ySpecsList = renderA11ySpecsList;

function deleteA11ySpec(originalIndex) {
  const spec = createdSpecs[originalIndex];
  if (!spec) return;
  if (spec.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
  }
  createdSpecs.splice(originalIndex, 1);
  saveToStorage();
  renderA11ySpecsList();
}
window.deleteA11ySpec = deleteA11ySpec;

function lockA11ySpec(specId) {
  parent.postMessage({ pluginMessage: { type: 'lock-spec', specId } }, '*');
}
window.lockA11ySpec = lockA11ySpec;
