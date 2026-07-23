// ============================================================
// accessibility.js — aba "Acessibilidade" da tela "Anotar Specs"
//
// Três categorias de spec estruturada, criadas exatamente como uma spec
// normal (elemento selecionado no canvas → formulário → create-unified-spec).
// No material de referência da vertical de acessibilidade da CAIXA cada
// elemento documentado ganha UM selo só: a letra sequencial (A, B, C...) já
// É a ordem de leitura E a categoria (cor do círculo) — não existem "tipos"
// separados de spec.
//
//   - elemento    Elementos e Imagens (Componente, Variante, Label, Hint,
//                 Observações, Link do componente)
//   - titulo      Título (Descrição e Nota de Código fixas; só Observações
//                 é editável)
//   - decorativo  Elemento Decorativo (Descrição fixa; só Observações é
//                 editável)
//
// Reaproveita a infraestrutura de specs já existente:
//   - Categoria "Acessibilidade" já cadastrada em specifications.js
//     (getCategoryColor/getCategoryFill, DEFAULT_CATEGORIES)
//   - Handler de backend 'create-unified-spec' (code.js) — sem schema paralelo,
//     os campos estruturados viram properties: [{key,label,value}]. Para
//     'titulo'/'decorativo' as properties fixas (Descrição, Nota de Código)
//     são incluídas automaticamente junto da Observação do usuário.
//   - Array global `createdSpecs` (mesma fonte que alimenta renderSpecsList(),
//     ver nota "ÓRFÃ" em specifications.js sobre frame.createdSpecs vs createdSpecs)
//
// O switcher de aba (Specs | Acessibilidade) vive em specifications.js
// (switchSpecsMainTab) e chama renderA11ySpecsList() ao abrir esta aba.
//
// A letra (ordem) é reatribuída em lote pelo botão "Atualizar Ordem", que
// manda 'reorder-a11y-specs' pro backend: ele resolve a posição de cada
// specGroup no canvas, ordena em leitura natural (Y, depois X) e devolve o
// novo mapeamento id→letra. O reordenamento roda só entre specs de
// acessibilidade (o selo delas é circular e ciano, visualmente distinto do
// selo quadrado das specs normais) — não reaproveita nem colide com as
// letras do namespace de specs normais.
//
// Depende de: handoffData, createdSpecs, getCategoryColor, getCategoryFill,
// saveToStorage, showToast, focusNode, openModal/closeModal, escapeHtml
// ============================================================

const A11Y_CATEGORIES = {
  elemento:   { label: 'Elementos e Imagens', icon: 'image' },
  titulo:     { label: 'Título',              icon: 'heading' },
  decorativo: { label: 'Elemento Decorativo', icon: 'ban' },
};

const A11Y_FIXED_TEXT = {
  titulo: {
    descricao: 'Identificar como título.',
    notaCodigo: 'accessibilityRole="header"',
  },
  decorativo: {
    descricao: 'Não deve ser anunciado pelo Leitor de Tela.',
  },
};

// ── Criação ──────────────────────────────────────────────────────────────

// Botão "Nova spec A11y" no header abre este menu com as três categorias, em
// vez de criar diretamente — mesmo padrão de popover já usado em
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

function chooseA11yType(category) {
  closeA11yTypeMenu();
  openA11yModal(category);
}
window.chooseA11yType = chooseA11yType;

const A11Y_MODAL_TITLE = {
  elemento: 'Elementos e Imagens',
  titulo: 'Título',
  decorativo: 'Elemento Decorativo',
};

function openA11yModal(category) {
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;

  const modal = document.getElementById('a11y-spec-modal');
  if (!modal) return;
  modal.dataset.category = category;

  const title = document.getElementById('a11y-modal-title-text');
  if (title) title.textContent = A11Y_MODAL_TITLE[category] || 'Especificação de Acessibilidade';

  const fieldsElemento = document.getElementById('a11y-fields-elemento');
  const fieldsTitulo = document.getElementById('a11y-fields-titulo');
  const fieldsDecorativo = document.getElementById('a11y-fields-decorativo');
  if (fieldsElemento) fieldsElemento.classList.toggle('hidden', category !== 'elemento');
  if (fieldsTitulo) fieldsTitulo.classList.toggle('hidden', category !== 'titulo');
  if (fieldsDecorativo) fieldsDecorativo.classList.toggle('hidden', category !== 'decorativo');

  const fixedDescricaoEl = document.getElementById('a11y-fixed-descricao');
  const fixedNotaEl = document.getElementById('a11y-fixed-nota');
  const fixedText = A11Y_FIXED_TEXT[category];
  if (fixedDescricaoEl && fixedText) fixedDescricaoEl.textContent = fixedText.descricao || '';
  if (fixedNotaEl) fixedNotaEl.textContent = (fixedText && fixedText.notaCodigo) || '';

  [
    'a11y-el-componente', 'a11y-el-variante', 'a11y-el-label', 'a11y-el-hint',
    'a11y-el-obs', 'a11y-el-link',
    'a11y-titulo-obs', 'a11y-decorativo-obs',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Pré-preenche o Componente com o nome do elemento selecionado no canvas,
  // se houver seleção — puramente cosmético, o designer pode sobrescrever.
  if (category === 'elemento') {
    parent.postMessage({ pluginMessage: { type: 'get-selection-name' } }, '*');
  }

  openModal('a11y-spec-modal');
}
window.openA11yModal = openA11yModal;

function prefillA11yComponentName(name) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (modal.dataset.category !== 'elemento') return;
  const el = document.getElementById('a11y-el-componente');
  if (el && !el.value && name) el.value = name;
}
window.prefillA11yComponentName = prefillA11yComponentName;

function closeA11yModal() {
  closeModal('a11y-spec-modal');
}
window.closeA11yModal = closeA11yModal;

// Próxima letra de Tag livre — namespace próprio das specs de acessibilidade
// (selo circular ciano), independente do namespace A-Z das specs normais
// (selo quadrado colorido por categoria).
function _nextA11ySpecLetter() {
  const used = new Set((createdSpecs || []).filter(s => s && s.a11yType).map(s => s.letter).filter(Boolean));
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
  const category = modal ? modal.dataset.category : '';
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;

  const g = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  let properties = [];

  if (category === 'elemento') {
    const componente = g('a11y-el-componente');
    const label = g('a11y-el-label');
    if (!componente) {
      showToast('Informe o Componente documentado.');
      return;
    }
    if (!label) {
      showToast('Informe o Label (accessibilityLabel) do elemento.');
      return;
    }
    properties = [
      { key: 'componente', label: 'Componente', value: componente },
      { key: 'variante', label: 'Variante', value: g('a11y-el-variante') },
      { key: 'label', label: 'Label', value: label },
      { key: 'hint', label: 'Hint', value: g('a11y-el-hint') },
      { key: 'observacoes', label: 'Observações', value: g('a11y-el-obs') },
      { key: 'link', label: 'Link do componente', value: g('a11y-el-link') },
    ].filter(p => p.value);
  } else if (category === 'titulo') {
    const fixedText = A11Y_FIXED_TEXT.titulo;
    properties = [
      { key: 'descricao', label: 'Descrição', value: fixedText.descricao },
      { key: 'notaCodigo', label: 'Nota de Código', value: fixedText.notaCodigo },
    ];
    const obs = g('a11y-titulo-obs');
    if (obs) properties.push({ key: 'observacoes', label: 'Observações', value: obs });
  } else if (category === 'decorativo') {
    const fixedText = A11Y_FIXED_TEXT.decorativo;
    properties = [
      { key: 'descricao', label: 'Descrição', value: fixedText.descricao },
    ];
    const obs = g('a11y-decorativo-obs');
    if (obs) properties.push({ key: 'observacoes', label: 'Observações', value: obs });
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
    // --- Acessibilidade --- diferencia a categoria na hora de renderizar/agrupar
    // e sinaliza pro backend usar o selo circular em vez do quadrado padrão.
    a11yType: category,
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

  const btnReorder = document.getElementById('btn-reorder-a11y-specs');
  if (btnReorder) btnReorder.classList.toggle('hidden', items.length === 0);

  if (items.length === 0) {
    list.innerHTML = `
      <li class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500 list-none">
        <div class="relative mb-4">
          <i data-lucide="accessibility" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
        </div>
        <p class="text-[12px] font-bold text-slate-500 dark:text-dark-muted text-center px-4 mb-1">Nenhuma especificação de acessibilidade ainda</p>
        <p class="text-[10px] text-slate-400 dark:text-dark-muted text-center px-6">Selecione um elemento no canvas e escolha uma das categorias acima</p>
      </li>
    `;
    _refreshIcons();
    return;
  }

  // Ordem de leitura (letra) primeiro — mesmo critério visual do canvas.
  items.sort((a, b) => String(a.letter || '').localeCompare(String(b.letter || '')));

  items.forEach(spec => {
    const meta = A11Y_CATEGORIES[spec.a11yType] || { label: 'Acessibilidade', icon: 'accessibility' };
    const color = spec.color || '#0891B2';
    const fill = spec.fillColor || getCategoryFill('acessibilidade');
    const props = spec.properties || [];
    const isPending = spec.pendingConfirmation === true;
    const isHidden = spec.visible === false;

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
        <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white shrink-0 mt-0.5" style="background-color:${color}">${escapeHtml(spec.letter || 'A')}</div>
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
        <button type="button" title="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas" aria-label="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas"
          onclick="toggleA11ySpecVisibility(${spec.originalIndex})"
          class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
          <i data-lucide="${isHidden ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
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
  (handoffData.frames || []).forEach(frame => {
    if (!frame.createdSpecs) return;
    const idx = frame.createdSpecs.indexOf(spec);
    if (idx !== -1) frame.createdSpecs.splice(idx, 1);
  });
  saveToStorage();
  renderA11ySpecsList();
}
window.deleteA11ySpec = deleteA11ySpec;

function toggleA11ySpecVisibility(originalIndex) {
  const spec = createdSpecs[originalIndex];
  if (!spec) return;
  spec.visible = spec.visible === false ? true : false;
  if (spec.id) {
    parent.postMessage({ pluginMessage: { type: spec.visible === false ? 'hide-node' : 'show-node', id: spec.id } }, '*');
  }
  saveToStorage();
  renderA11ySpecsList();
}
window.toggleA11ySpecVisibility = toggleA11ySpecVisibility;

function lockA11ySpec(specId) {
  parent.postMessage({ pluginMessage: { type: 'lock-spec', specId } }, '*');
}
window.lockA11ySpec = lockA11ySpec;

// ── Reordenação automática ("Atualizar Ordem") ──────────────────────────
// Manda os ids dos specGroups de acessibilidade pro backend, que resolve a
// posição de cada um no canvas (ordem de leitura: topo→base, esquerda→direita)
// e devolve o novo mapeamento id→letra. Ver handler 'reorder-a11y-specs' em
// code.js e a resposta 'a11y-specs-reordered' tratada em messages.js.
function reorderA11ySpecs() {
  const items = (createdSpecs || []).filter(s => s && s.a11yType && s.id && s.pendingConfirmation !== true);
  if (items.length === 0) {
    showToast('Nenhuma especificação de acessibilidade posicionada para reordenar.');
    return;
  }
  parent.postMessage({
    pluginMessage: { type: 'reorder-a11y-specs', specs: items.map(s => ({ id: s.id })) }
  }, '*');
}
window.reorderA11ySpecs = reorderA11ySpecs;
