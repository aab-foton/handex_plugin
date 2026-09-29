// ============================================================
// quick-spec.js — Spec Express (módulo isolado)
//
// Consulta rápida e EFÊMERA de propriedades brutas de elementos -- mescla
// visual entre Escanear Tokens (extração de propriedades) e Anotar Specs
// (apresentação em card no canvas), mas sem conformidade DSC e sem
// persistência em handoffData. Pensado pra devs sem acesso ao DevMode do
// Figma: cada elemento vira um card independente (tag A/B/C sequencial por
// sessão, só texto -- sem snapshot, removido 2026-09-25), tanto na UI
// quanto no canvas -- clicar leva direto àquele elemento. No canvas, o
// card nasce ligado ao elemento de origem por uma linha guia (contour +
// conector + dots), mesmo padrão visual das specs tradicionais.
//
// Fluxo de captura (2026-09-25, redesenho pedido pelo usuário; corrigido no
// mesmo dia para exigir Shift -- ver nota abaixo):
// 1. Designer clica "Escanear" -> modal de filtro (categorias a buscar).
// 2. Confirma a modal -> plugin COLAPSA (mesmo padrão do hac: mini-barra
//    substitui o header, com contador + Cancelar/Concluir) e entra em modo
//    de captura -- o backend espelha em tempo real a seleção múltipla do
//    Figma (ver selectionchange/start-quick-spec-capture em code.js).
//    EXIGE Shift+clique: a primeira versão acumulava qualquer elemento que
//    passasse por selectionchange mesmo sem Shift, capturando cliques de
//    TRÂNSITO (ex: um drill-in que seleciona o frame pai antes de alcançar
//    o filho desejado) -- corrigido pra só contar o que o designer de fato
//    marcou com Shift, trazendo exatamente os elementos pretendidos.
// 3. Designer clica "Concluir" -> plugin expande de volta, dispara a
//    extração das propriedades só agora, pra toda a seleção marcada.
// 4. Resultado vira uma LISTA PLANA de accordions -- 1 por elemento (não
//    mais agrupado por frame) -- com tag, propriedades, e ações de
//    focar/ocultar/excluir (mesmo esqueleto de accordion de item já usado
//    em Anotar Specs/Anotar Medidas: quick-actions no header + botão
//    grande de excluir no rodapé do conteúdo expandido).
//
// Estrutura de dados: _quickSpecSessionResults é uma lista PLANA de
// elementos (tag sequencial pela SESSÃO inteira, nunca reinicia).
//
// Decisões de produto (não reverter sem alinhamento):
// - Nada aqui é salvo em handoffData. Trocar de frame ou fechar o plugin
//   perde a lista da UI -- só os cards do canvas (se inseridos) persistem, e
//   isso é responsabilidade do designer, não do plugin.
// - Módulo isolado de propósito: nunca chamar nem ser chamado por
//   specifications.js (Anotar Specs) ou pelo scan de tokens (scanFrame em
//   specifications.js/handler scan-frame em code.js). Ver code.js, bloco
//   "MÓDULO: Spec Express" -- funções prefixadas _qs.
// - Filtro de categorias é sempre a mesma lista fixa (modal em
//   quick-spec.html) -- nunca calculado a partir de pré-leitura do frame.
// - 1 card por elemento (não 1 card por frame) -- cada elemento precisa ser
//   localizável/clicável de forma independente, com sua própria tag.
// - "Ocultar" alterna visibilidade na lista da UI e, se o elemento já tem
//   card inserido no canvas (insertedCardId), oculta/exibe o card real e
//   sua linha guia também (2026-09-28) -- útil pra reduzir ruído visual
//   tanto na lista quanto no canvas sem perder o dado. Elemento oculto
//   continua contando pra "Inserir no canvas" se o designer marcar (e um
//   elemento ainda sem card no canvas só tem o toggle visual da lista).
//
// Depende de: showToast, openModal/closeModal, toggleAccordion,
// collapseAllAccordions, focusNode, escapeHtml, _refreshIcons (core.js) --
// todas read-only quanto a este módulo, nenhuma delas é modificada aqui.
// ============================================================

// Lista PLANA de elementos escaneados nesta sessão -- efêmera de propósito,
// nunca persistida (nem localStorage, nem handoffData). Reseta ao
// recarregar o plugin, exatamente como pedido: "roda, mostra na UI, e se
// esquece".
let _quickSpecSessionResults = [];
// Contador de tag sequencial (A, B, C... depois AA, AB...) -- por SESSÃO
// inteira, não por captura. Nunca decrementado (mesmo se um card for
// excluído da lista depois) para nunca reaproveitar uma tag já mostrada/
// inserida no canvas nesta sessão.
let _quickSpecTagCounter = 0;
// Categorias escolhidas na modal de filtro, preservadas do momento da
// confirmação até o "Concluir" da captura (o plugin fica colapsado nesse
// meio-tempo, sem acesso à modal).
let _quickSpecPendingCategories = null;

function _quickSpecNextTag() {
  let n = _quickSpecTagCounter++;
  let tag = '';
  do {
    tag = String.fromCharCode(65 + (n % 26)) + tag;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return tag;
}

function _quickSpecToggleAllFilters() {
  const boxes = document.querySelectorAll('[data-quick-spec-filter]');
  const anyUnchecked = Array.from(boxes).some(b => !b.checked);
  boxes.forEach(b => { b.checked = anyUnchecked; });
  // "Marcar/Desmarcar tudo" seta .checked direto, sem disparar 'change' --
  // sincroniza manualmente o hint do checkbox "component-props" (ver
  // onchange inline em quick-spec.html), senão ele ficaria dessincronizado
  // do estado real do checkbox.
  const hint = document.getElementById('quick-spec-component-props-hint');
  if (hint) hint.classList.toggle('hidden', !anyUnchecked);
}
window._quickSpecToggleAllFilters = _quickSpecToggleAllFilters;

function _quickSpecGetSelectedCategories() {
  return Array.from(document.querySelectorAll('[data-quick-spec-filter]:checked')).map(b => b.value);
}

// Confirma a modal de filtro -- em vez de escanear na hora, agora entra em
// modo de captura (plugin colapsa, designer seleciona no canvas).
function _quickSpecConfirmFiltersAndScan() {
  const categories = _quickSpecGetSelectedCategories();
  if (categories.length === 0) {
    showToast('Marque ao menos uma categoria para escanear.', 'error');
    return;
  }
  _quickSpecPendingCategories = categories;
  closeModal('quick-spec-filters-modal');
  _quickSpecCaptureEnter();
}
window._quickSpecConfirmFiltersAndScan = _quickSpecConfirmFiltersAndScan;

// ── Captura colapsada (adaptado do padrão de mini-barra do hac) ────────
// Estado TEMPORÁRIO -- não confundir com isCollapsed (toggle manual do
// usuário via btn-collapse, em core.js). Entra ao confirmar a modal de
// filtro, sai ao Cancelar/Concluir.
window._quickSpecCaptureActive = false;

function _quickSpecCaptureEnter() {
  window._quickSpecCaptureActive = true;
  // O <header> GLOBAL (#header-home, fixo no topo em TODAS as telas) e o
  // header LOCAL da própria view (.subheader-brand, com "Spec Express" +
  // voltar) são elementos diferentes -- escondê-los é o que de fato reduz o
  // conteúdo visível a só a barra de captura. Bug real corrigido
  // (2026-09-25, reportado com print pelo usuário): o código só escondia o
  // header global; o .subheader-brand local e a lista scrollável
  // continuavam ocupando espaço, então a janela colapsava para uma altura
  // pequena demais até pra caber a própria barra, sobrando só a barra de
  // título nativa do Figma visível.
  const headerHome = document.getElementById('header-home');
  const headerEl = headerHome ? headerHome.closest('header') : null;
  const view = document.getElementById('view-quick-spec');
  const localHeader = view ? view.querySelector('.subheader-brand') : null;
  const scrollContainer = document.getElementById('quick-spec-scroll-container');
  const bar = document.getElementById('quick-spec-capture-bar');
  if (headerEl) headerEl.classList.add('hidden');
  else if (headerHome) headerHome.classList.add('hidden');
  if (localHeader) localHeader.classList.add('hidden');
  if (scrollContainer) scrollContainer.classList.add('hidden');
  if (bar) { bar.classList.remove('hidden'); bar.classList.add('flex'); }
  document.body.classList.add('a11y-capture-mini-active');
  const btnTop = document.getElementById('btn-top');
  if (btnTop) {
    btnTop.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10');
    btnTop.classList.remove('opacity-100', 'pointer-events-auto', 'translate-y-0');
  }
  _quickSpecCaptureUpdateCount(0);
  parent.postMessage({ pluginMessage: { type: 'start-quick-spec-capture' } }, '*');
  requestAnimationFrame(() => _quickSpecCaptureResizeToBar());
}

function _quickSpecCaptureResizeToBar() {
  const bar = document.getElementById('quick-spec-capture-bar');
  const FALLBACK_H = 52;
  let h = FALLBACK_H;
  if (bar) {
    // getBoundingClientRect() já mede o resultado PÓS `zoom` CSS (--ui-scale,
    // ver plugin.css) -- o valor retornado já é o tamanho físico real na
    // tela, correspondente exatamente ao que figma.ui.resize() precisa
    // receber. Multiplicar de novo por window.currentUiScale (como o código
    // fazia antes) dobrava a escala: com zoom da UI em 130%, a janela do
    // plugin pedida ao Figma ficava ~30% mais alta que o conteúdo desenhado,
    // sobrando uma faixa "fantasma" da própria janela do plugin sobre o
    // canvas -- clique ali nunca chegava ao Figma por trás (bug relatado
    // 2026-09-28: canvas travado com o Spec Express aberto).
    const measured = Math.ceil(bar.getBoundingClientRect().height);
    if (measured > 0) h = measured;
  }
  // FULL_W é declarado em core.js (const, mesmo escopo global de módulos
  // concatenados) -- referenciado direto, sem passar por window.*.
  parent.postMessage({ pluginMessage: { type: 'resize-ui', width: FULL_W, height: h } }, '*');
}

function _quickSpecCaptureExit() {
  window._quickSpecCaptureActive = false;
  const headerHome = document.getElementById('header-home');
  const headerEl = headerHome ? headerHome.closest('header') : null;
  const view = document.getElementById('view-quick-spec');
  const localHeader = view ? view.querySelector('.subheader-brand') : null;
  const scrollContainer = document.getElementById('quick-spec-scroll-container');
  const bar = document.getElementById('quick-spec-capture-bar');
  if (headerEl) headerEl.classList.remove('hidden');
  if (headerHome) headerHome.classList.remove('hidden');
  if (localHeader) localHeader.classList.remove('hidden');
  if (scrollContainer) scrollContainer.classList.remove('hidden');
  if (bar) { bar.classList.add('hidden'); bar.classList.remove('flex'); }
  document.body.classList.remove('a11y-capture-mini-active');
  // isCollapsed/FULL_W/FULL_H/MINI_H são declarados em core.js, mesmo
  // escopo global de módulos concatenados -- respeita o collapse manual: se
  // o designer já estava com o plugin colapsado ANTES de escanear, sair da
  // captura devolve pro estado colapsado manual, não força FULL_H.
  // Sem multiplicar por currentUiScale -- mesmo padrão de toggleCollapse()
  // (core.js): figma.ui.resize() espera o tamanho FÍSICO real da janela,
  // que nunca varia com o zoom da UI (--ui-scale só reescala o conteúdo
  // visualmente via `zoom` CSS dentro de uma janela de tamanho fixo, ver
  // plugin.css). Multiplicar aqui pedia uma janela maior que o conteúdo
  // desenhado, deixando uma faixa "fantasma" do plugin sobre o canvas que
  // engolia clique/arrasto (bug relatado 2026-09-28, canvas travado com o
  // Spec Express aberto e o zoom da UI acima de 100%).
  const h = isCollapsed ? MINI_H : FULL_H;
  parent.postMessage({ pluginMessage: { type: 'resize-ui', width: FULL_W, height: h } }, '*');
}

function _quickSpecCaptureUpdateCount(n) {
  const el = document.getElementById('quick-spec-capture-count');
  if (!el) return;
  el.textContent = n + (n === 1 ? ' elemento marcado' : ' elementos marcados');
}
window._quickSpecCaptureUpdateCount = _quickSpecCaptureUpdateCount;

// Chamado pelo dispatcher central (messages.js) a cada
// 'quick-spec-capture-count-changed' -- contador ao vivo, debounced no
// backend (300ms).
function handleQuickSpecCaptureCountChanged(msg) {
  _quickSpecCaptureUpdateCount(msg.count || 0);
}
window.handleQuickSpecCaptureCountChanged = handleQuickSpecCaptureCountChanged;

function _quickSpecCaptureCancel() {
  parent.postMessage({ pluginMessage: { type: 'stop-quick-spec-capture' } }, '*');
  _quickSpecPendingCategories = null;
  _quickSpecCaptureExit();
}
window._quickSpecCaptureCancel = _quickSpecCaptureCancel;

function _quickSpecCaptureFinish() {
  _quickSpecCaptureExit();
  // Loading da leitura de propriedades via modal genérica (2026-09-25, ver
  // showLoadingModal/core.js) -- antes era um bloco inline só desta tela;
  // agora reaproveita o mesmo padrão bloqueante usado em qualquer etapa de
  // espera do Handex. Sem contador incremental: sem snapshot (removido
  // 2026-09-25), a extração de propriedades é rápida o suficiente pra não
  // precisar de granularidade "X de Y".
  showLoadingModal('Lendo propriedades dos elementos...', { title: 'Processando', icon: 'loader-2' });
  parent.postMessage({
    pluginMessage: { type: 'quick-spec-capture-finish', categories: _quickSpecPendingCategories }
  }, '*');
  _quickSpecPendingCategories = null;
}
window._quickSpecCaptureFinish = _quickSpecCaptureFinish;

// Chamado pelo dispatcher central ao receber 'quick-spec-result'.
function handleQuickSpecResult(msg) {
  hideLoadingModal();

  if (msg.error) {
    showToast(msg.error, 'error');
    _quickSpecUpdateEmptyState();
    return;
  }

  const elements = (msg.elements || []).map(el => ({
    tag: _quickSpecNextTag(),
    nodeId: el.nodeId,
    name: el.name,
    nodeType: el.nodeType,
    properties: el.properties,
    hidden: false,
    // Id do card criado no canvas, preenchido só depois de uma inserção
    // bem-sucedida (ver handleQuickSpecCanvasResult) -- é o que permite
    // perguntar "apagar do canvas também?" ao excluir da lista.
    insertedCardId: null
  }));

  _quickSpecSessionResults = elements.concat(_quickSpecSessionResults);
  _quickSpecRenderList();
  showToast(`${elements.length} elemento(s) com propriedade encontrada.`);
}
window.handleQuickSpecResult = handleQuickSpecResult;

// Consulta o canvas de verdade pra descobrir quais cards do Spec Express já
// existem (2026-09-25, pedido do usuário: "quando o plugin recarrega [os
// cards] não ficam armazenadas, aí não consigo apagar itens que foram
// injetados") -- disparado ao ENTRAR na tela (ver navigate()/core.js), não
// só no boot do plugin, porque _quickSpecSessionResults é deliberadamente
// efêmera e pode ter sido perdida por um reload em qualquer momento.
function quickSpecSyncFromCanvas() {
  parent.postMessage({ pluginMessage: { type: 'quick-spec-list-canvas-cards' } }, '*');
}
window.quickSpecSyncFromCanvas = quickSpecSyncFromCanvas;

// Chamado pelo dispatcher central ao receber 'quick-spec-canvas-cards-list'
// -- mescla com a sessão em memória (nunca duplica: um card já rastreado
// por insertedCardId continua com sua entrada completa, propriedades
// incluídas). Cards do canvas sem entrada correspondente na sessão viram
// entradas MÍNIMAS (properties: null sinaliza "recuperado do canvas, sem
// propriedades" -- distinto de properties: [] que significaria "escaneado,
// mas nada encontrado"), sem preview nem categorias, só o essencial pra
// focar/ocultar/excluir.
function handleQuickSpecCanvasCardsList(msg) {
  const canvasCards = msg.cards || [];
  const knownCardIds = new Set(_quickSpecSessionResults.map(el => el.insertedCardId).filter(Boolean));
  const knownTags = new Set(_quickSpecSessionResults.map(el => el.tag));
  let addedAny = false;
  canvasCards.forEach(cc => {
    if (knownCardIds.has(cc.cardId) || knownTags.has(cc.tag)) return;
    _quickSpecSessionResults.push({
      tag: cc.tag,
      nodeId: cc.sourceNodeId,
      name: cc.name,
      nodeType: cc.nodeType,
      properties: null,
      hidden: false,
      insertedCardId: cc.cardId
    });
    addedAny = true;
  });
  if (addedAny) {
    // Mantém a ordem por tag (A, B, C...) em vez de empilhar os
    // recuperados no topo -- eles não são "mais recentes", só chegaram
    // depois na sincronização.
    _quickSpecSessionResults.sort((a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true }));
    _quickSpecRenderList();
  }
}
window.handleQuickSpecCanvasCardsList = handleQuickSpecCanvasCardsList;

function _quickSpecUpdateEmptyState() {
  const empty = document.getElementById('quick-spec-empty');
  const toolbar = document.getElementById('quick-spec-toolbar');
  const insertAll = document.getElementById('quick-spec-insert-all');
  const hasResults = _quickSpecSessionResults.length > 0;
  if (empty) empty.classList.toggle('hidden', hasResults);
  if (toolbar) toolbar.classList.toggle('hidden', !hasResults);
  if (insertAll) {
    insertAll.classList.toggle('hidden', !hasResults);
    insertAll.classList.toggle('flex', hasResults);
  }
}

function _quickSpecToggleSearchBar() {
  const bar = document.getElementById('quick-spec-search-bar');
  if (!bar) return;
  const willShow = bar.classList.contains('hidden');
  bar.classList.toggle('hidden');
  if (willShow) {
    const input = document.getElementById('quick-spec-search-input');
    if (input) input.focus();
  } else {
    const input = document.getElementById('quick-spec-search-input');
    if (input) input.value = '';
    _quickSpecApplySearch('');
  }
}
window._quickSpecToggleSearchBar = _quickSpecToggleSearchBar;

// Busca por nome, tag (A/B/C...) ou token/valor de propriedade -- pedido
// explícito do usuário pra "achar onde mais essa cor aparece", por exemplo.
function _quickSpecApplySearch(query) {
  const term = (query || '').toLowerCase().trim();
  const list = document.getElementById('quick-spec-list');
  const emptyMsg = document.getElementById('quick-spec-search-empty');
  if (!list) return;

  let anyVisible = false;
  list.querySelectorAll('[data-qs-element]').forEach(elCard => {
    const haystack = elCard.getAttribute('data-qs-search') || '';
    const match = !term || haystack.includes(term);
    elCard.classList.toggle('hidden', !match);
    if (match) anyVisible = true;
  });

  if (emptyMsg) emptyMsg.classList.toggle('hidden', !term || anyVisible);
}
window._quickSpecApplySearch = _quickSpecApplySearch;

function _quickSpecPropSearchText(props) {
  return (props || []).map(p => `${p.label} ${p.value} ${p.tokenName || ''} ${p.libName || ''}`).join(' ').toLowerCase();
}

// Pergunta sobre os cards do canvas quando os itens removidos da lista já
// tinham sido inseridos (2026-09-25, pedido do usuário) -- excluir da lista
// do plugin não deve deixar card órfão no canvas sem o designer decidir.
// Só pergunta se houver de fato algum card inserido; senão remove direto.
// Usa window.confirm, mesmo padrão das outras exclusões do plugin (ver
// clearAllData/core.js e as exclusões de spec em specifications.js).
function _quickSpecMaybeDeleteCanvasCards(removedElements) {
  const cardIds = removedElements.map(el => el.insertedCardId).filter(Boolean);
  if (cardIds.length === 0) return;
  const alsoDelete = window.confirm(
    cardIds.length > 1
      ? `${cardIds.length} desses itens já têm card no canvas. Apagar esses cards do canvas também?`
      : 'Esse item já tem um card no canvas. Apagar o card do canvas também?'
  );
  if (!alsoDelete) return;
  parent.postMessage({ pluginMessage: { type: 'quick-spec-delete-canvas-cards', cardIds } }, '*');
}

// Excluir um elemento da lista. Se ele já tiver card no canvas, pergunta se
// o card também deve ser apagado (ver _quickSpecMaybeDeleteCanvasCards).
function quickSpecRemoveElement(idx) {
  const removed = _quickSpecSessionResults[idx];
  if (!removed) return;
  _quickSpecSessionResults.splice(idx, 1);
  _quickSpecRenderList();
  _quickSpecMaybeDeleteCanvasCards([removed]);
}
window.quickSpecRemoveElement = quickSpecRemoveElement;

// Excluir todos os elementos da sessão de uma vez -- mesmo padrão de
// confirmação (window.confirm) já usado em outras exclusões em lote do
// plugin (ver clearAllData/core.js). Os cards já inseridos no canvas são
// tratados numa segunda pergunta (ver _quickSpecMaybeDeleteCanvasCards).
function quickSpecRemoveAllElements() {
  if (_quickSpecSessionResults.length === 0) return;
  const confirmed = window.confirm(`Excluir todos os ${_quickSpecSessionResults.length} elemento(s) da lista? Essa ação não pode ser desfeita.`);
  if (!confirmed) return;
  const removed = _quickSpecSessionResults.slice();
  _quickSpecSessionResults = [];
  _quickSpecRenderList();
  _quickSpecMaybeDeleteCanvasCards(removed);
}
window.quickSpecRemoveAllElements = quickSpecRemoveAllElements;

// Ocultar/exibir um elemento -- reduz ruído visual na lista da UI e, se o
// elemento já tem card no canvas (insertedCardId), oculta/exibe o card real
// e sua linha guia (contour+Conector+dots) também (2026-09-28, pedido do
// usuário). Sem card no canvas ainda, o toggle continua só visual na lista.
function quickSpecToggleHideElement(idx) {
  const el = _quickSpecSessionResults[idx];
  if (!el) return;
  el.hidden = !el.hidden;
  if (el.insertedCardId) {
    parent.postMessage({ pluginMessage: { type: 'quick-spec-toggle-visibility', cardId: el.insertedCardId, visible: !el.hidden } }, '*');
  }
  _quickSpecRenderList();
}
window.quickSpecToggleHideElement = quickSpecToggleHideElement;

function _quickSpecRenderList() {
  const list = document.getElementById('quick-spec-list');
  if (!list) return;
  _quickSpecUpdateEmptyState();

  list.innerHTML = _quickSpecSessionResults.map((el, idx) => {
    // properties === null: entrada MÍNIMA recuperada do canvas (ver
    // quickSpecSyncFromCanvas/handleQuickSpecCanvasCardsList) -- o card já
    // existe no canvas, mas suas propriedades escaneadas se perderam num
    // reload anterior. Sem accordion de propriedades nem "Inserir" (já está
    // lá); só focar/ocultar/excluir continuam disponíveis.
    const isCanvasOnly = el.properties === null;
    const searchText = `${el.name} ${el.tag} ${isCanvasOnly ? '' : _quickSpecPropSearchText(el.properties)}`.toLowerCase();
    // Hierarquia: quando existe token, ele vem PRIMEIRO e em destaque (é a
    // informação que o dev deve consumir -- itens vindos de lib já têm a
    // propriedade bem definida pelo token); o valor bruto vem logo abaixo,
    // como apoio/conferência. Sem token, o valor bruto é a própria linha
    // principal (nada a destacar acima dele) -- pedido do usuário
    // (2026-09-25, com exemplo real de "[m3] Top app bar": token de cor
    // aparecia depois do hex bruto, precisava ser o oposto).
    const propsHtml = isCanvasOnly
      ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 italic leading-snug">Card recuperado do canvas -- propriedades não disponíveis nesta sessão (re-escaneie o elemento se precisar consultá-las de novo).</p>`
      : el.properties.map(p => {
        if (p.tokenName) {
          return `
      <div class="text-[10px] leading-snug">
        <div>${escapeHtml(p.label)}: <strong class="${p.libName ? 'text-[#005ca9] dark:text-blue-400' : 'text-slate-700 dark:text-white'}">${escapeHtml(p.tokenName)}</strong>${p.libName ? ` <span class="text-slate-400 dark:text-slate-500 font-normal">· ${escapeHtml(p.libName)}</span>` : ''}</div>
        <div class="pl-3 text-slate-400 dark:text-slate-500">↳ valor bruto: ${escapeHtml(String(p.value))}</div>
      </div>
    `;
        }
        return `
      <div class="text-[10px] text-slate-500 dark:text-dark-muted leading-snug">
        <span>${escapeHtml(p.label)}: <strong class="text-slate-700 dark:text-white">${escapeHtml(String(p.value))}</strong></span>
      </div>
    `;
      }).join('');

    return `
      <li data-qs-element data-qs-search="${escapeHtml(searchText)}"
        class="border border-gray-100 dark:border-dark-line rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-dark-surface ${el.hidden ? 'opacity-50' : ''}">
        <div class="w-full flex items-center justify-between gap-2 p-3">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="shrink-0 w-5 h-5 flex items-center justify-center bg-[#005ca9] text-white text-[9px] font-black rounded">${escapeHtml(el.tag)}</span>
            <span class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${escapeHtml(el.name)}</span>
            <span class="text-[9.5px] text-slate-400 dark:text-slate-500 shrink-0">${el.nodeType}</span>
            ${el.insertedCardId ? '<span title="Já tem card no canvas" class="shrink-0 text-[8.5px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">No canvas</span>' : ''}
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="focusNode('${el.nodeId}')" title="Focar no elemento original" aria-label="Focar no elemento original no canvas"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-[#005ca9] dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">
              <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
            </button>
            ${el.insertedCardId ? `
            <button onclick="focusNode('${el.insertedCardId}')" title="Focar no card da spec" aria-label="Focar no card da spec no canvas"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-[#005ca9] dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
            </button>` : ''}
            <button onclick="quickSpecToggleHideElement(${idx})" title="${el.hidden ? 'Exibir' : 'Ocultar'}" aria-label="${el.hidden ? 'Exibir elemento' : 'Ocultar elemento'}"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-[#005ca9] dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">
              <i data-lucide="${el.hidden ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
            </button>
            <button type="button" data-accordion-toggle aria-expanded="false" onclick="toggleAccordion(this)"
              class="w-7 h-7 flex items-center justify-center text-slate-400 dark:text-slate-500">
              <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform"></i>
            </button>
          </div>
        </div>
        <div class="accordion-content hidden">
          <div class="space-y-0.5 px-3 pt-2">
            ${propsHtml}
          </div>
          <div class="p-3 space-y-2">
            ${isCanvasOnly ? '' : `
            <button onclick="quickSpecInsertCanvasCards(${idx})"
              class="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              Inserir card no canvas
            </button>`}
            <button onclick="quickSpecRemoveElement(${idx})"
              class="w-full py-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line hover:bg-gray-50 dark:hover:bg-slate-800 text-red-500 text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              Excluir da lista
            </button>
          </div>
        </div>
      </li>
    `;
  }).join('');

  if (typeof _refreshIcons === 'function') _refreshIcons();
}

// Loading da etapa de criação no canvas via modal genérica (2026-09-25, ver
// showLoadingModal/core.js) -- contador visível enquanto os cards ainda
// estão sendo criados (montar contour+conector+dots por elemento é o passo
// mais perceptível aqui). Antes era um bloco inline só desta tela
// (#quick-spec-loading), que também escondia lista/toolbar pra evitar
// clique duplicado; a modal genérica já é bloqueante por natureza (cobre a
// tela toda), então esconder a lista por baixo deixou de ser necessário.
function _quickSpecShowCreatingLoading(total) {
  showLoadingModal(
    total > 1 ? `Criando cards no canvas... 0 de ${total}` : 'Criando card no canvas...',
    { title: 'Processando', icon: 'loader-2' }
  );
}

function _quickSpecHideCreatingLoading() {
  hideLoadingModal();
  _quickSpecUpdateEmptyState();
}

// Chamado pelo dispatcher central a cada 'quick-spec-canvas-progress' --
// contador "X de Y" durante a criação dos cards no canvas, 1 vez por
// elemento. showLoadingModal já está aberta desde
// _quickSpecShowCreatingLoading -- chamar de novo só reescreve o texto, não
// pisca/reabre a modal.
function handleQuickSpecCanvasProgress(msg) {
  if (!msg.total) return;
  showLoadingModal(msg.total > 1 ? `Criando cards no canvas... ${msg.done} de ${msg.total}` : 'Criando card no canvas...');
}
window.handleQuickSpecCanvasProgress = handleQuickSpecCanvasProgress;

// ── Modal "Organizar cards" (grade colunas × linhas) ────────────────────
// Guarda os itens escolhidos entre o clique em "Inserir..." e a confirmação
// da grade -- só relevante com vários cards pra organizar; com poucos, a
// modal era atrito sem ganho real (pedido do usuário 2026-09-25: só faz
// sentido "na aplicação de vários elementos, mais de 4").
let _quickSpecPendingInsertItems = null;
const QUICK_SPEC_LAYOUT_GRID_MAX_COLS = 8;
const QUICK_SPEC_LAYOUT_GRID_MAX_ROWS = 6;
const QUICK_SPEC_LAYOUT_GRID_MIN_COLS = 2;
const QUICK_SPEC_LAYOUT_GRID_MIN_ROWS = 2;
const QUICK_SPEC_LAYOUT_MODAL_MIN_ITEMS = 5;

// Grade nasce dimensionada pro total real de itens (quase quadrada, cobre
// o total com o mínimo de sobra) -- em vez da grade fixa 8×6 sempre, que
// aparecia toda preenchida mesmo com poucos itens (print do usuário
// 2026-09-28: parecia sugerir qualquer combinação até 8×6 como válida).
function _quickSpecComputeLayoutGridSize(total) {
  const cols = Math.min(QUICK_SPEC_LAYOUT_GRID_MAX_COLS, Math.max(QUICK_SPEC_LAYOUT_GRID_MIN_COLS, Math.ceil(Math.sqrt(total))));
  const rows = Math.min(QUICK_SPEC_LAYOUT_GRID_MAX_ROWS, Math.max(QUICK_SPEC_LAYOUT_GRID_MIN_ROWS, Math.ceil(total / cols)));
  return { cols, rows };
}

function _quickSpecOpenLayoutModal(items) {
  // 4 ou menos: pula a modal, insere direto empilhado (columns: 1) -- mesmo
  // resultado de escolher 1×1 na grade, sem o passo extra.
  if (items.length < QUICK_SPEC_LAYOUT_MODAL_MIN_ITEMS) {
    _quickSpecShowCreatingLoading(items.length);
    parent.postMessage({ pluginMessage: { type: 'quick-spec-insert-canvas', items, columns: 1 } }, '*');
    return;
  }
  _quickSpecPendingInsertItems = items;
  _quickSpecBuildLayoutGrid();
  openModal('quick-spec-layout-modal');
}

// Monta a grade clicável estilo Excel/Word (hover destaca NxM a partir do
// canto superior esquerdo, clique confirma) -- reconstruída a cada
// abertura pra sempre nascer no estado 1×1.
function _quickSpecBuildLayoutGrid() {
  const grid = document.getElementById('quick-spec-layout-grid');
  if (!grid) return;
  const total = (_quickSpecPendingInsertItems || []).length;
  const { cols, rows } = _quickSpecComputeLayoutGridSize(total);
  // grid-template-columns precisa ser explícito por JS porque `cols` agora é
  // variável (grade dimensionada ao total de itens, ver
  // _quickSpecComputeLayoutGridSize) -- sem isso, o CSS mantinha um número
  // fixo de colunas por linha (herdado de quando a grade era sempre 8×6),
  // desalinhando o wrap dos divs em relação às linhas/colunas lógicas do JS.
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  let html = '';
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      html += `<div data-qs-layout-cell data-col="${c}" data-row="${r}"
        onmouseenter="_quickSpecLayoutGridHover(${c}, ${r})" onclick="_quickSpecLayoutGridPick(${c}, ${r})"
        class="w-5 h-5 rounded-sm border border-gray-200 dark:border-dark-line bg-gray-50 dark:bg-dark-surface cursor-pointer transition-colors"></div>`;
    }
  }
  grid.innerHTML = html;
  _quickSpecLayoutSelection = { columns: 1, rows: 1 };
  _quickSpecLayoutGridHover(1, 1);
}

let _quickSpecLayoutSelection = { columns: 1, rows: 1 };

function _quickSpecLayoutGridHover(columns, rows) {
  const grid = document.getElementById('quick-spec-layout-grid');
  const label = document.getElementById('quick-spec-layout-label');
  if (!grid) return;
  grid.querySelectorAll('[data-qs-layout-cell]').forEach(cell => {
    const inRange = Number(cell.dataset.col) <= columns && Number(cell.dataset.row) <= rows;
    cell.classList.toggle('bg-[#005ca9]', inRange);
    cell.classList.toggle('border-[#005ca9]', inRange);
    cell.classList.toggle('bg-gray-50', !inRange);
    cell.classList.toggle('dark:bg-dark-surface', !inRange);
    cell.classList.toggle('border-gray-200', !inRange);
    cell.classList.toggle('dark:border-dark-line', !inRange);
  });
  if (label) label.textContent = columns === 1 && rows === 1 ? '1 coluna × 1 linha (empilhado)' : `${columns} coluna${columns > 1 ? 's' : ''} × ${rows} linha${rows > 1 ? 's' : ''}`;
}
window._quickSpecLayoutGridHover = _quickSpecLayoutGridHover;

function _quickSpecLayoutGridReset() {
  if (_quickSpecLayoutSelection) _quickSpecLayoutGridHover(_quickSpecLayoutSelection.columns, _quickSpecLayoutSelection.rows);
}
window._quickSpecLayoutGridReset = _quickSpecLayoutGridReset;

function _quickSpecLayoutGridPick(columns, rows) {
  _quickSpecLayoutSelection = { columns, rows };
  _quickSpecLayoutGridHover(columns, rows);
}
window._quickSpecLayoutGridPick = _quickSpecLayoutGridPick;

// "Inserir no canvas" da modal de layout -- linhas são só orientação visual
// pro designer escolher a grade (mesma lógica de um seletor de tabela em
// editor de texto); o backend só recebe `columns`, calculando quantas
// linhas são de fato necessárias pra caber a quantidade real de cards.
function _quickSpecConfirmLayoutAndInsert() {
  const items = _quickSpecPendingInsertItems;
  if (!items || items.length === 0) return;
  closeModal('quick-spec-layout-modal');
  _quickSpecShowCreatingLoading(items.length);
  parent.postMessage({
    pluginMessage: { type: 'quick-spec-insert-canvas', items, columns: _quickSpecLayoutSelection.columns }
  }, '*');
  _quickSpecPendingInsertItems = null;
}
window._quickSpecConfirmLayoutAndInsert = _quickSpecConfirmLayoutAndInsert;

// Insere no canvas UM card do elemento indicado.
function quickSpecInsertCanvasCards(idx) {
  const el = _quickSpecSessionResults[idx];
  if (!el) return;
  _quickSpecOpenLayoutModal([{ tag: el.tag, nodeId: el.nodeId, name: el.name, nodeType: el.nodeType, properties: el.properties }]);
}
window.quickSpecInsertCanvasCards = quickSpecInsertCanvasCards;

// Insere todos os elementos NÃO ocultos da sessão de uma vez -- ação de
// lote equivalente ao antigo "Inserir todos os cards no canvas" por frame,
// agora aplicada à lista plana inteira. Itens "recuperados do canvas"
// (properties === null, ver handleQuickSpecCanvasCardsList) já TÊM card no
// canvas -- reinserir seria duplicar, e o botão "Inserir card no canvas" já
// nem aparece pra eles individualmente (ver _quickSpecRenderList); o lote
// precisa do mesmo filtro, senão manda properties/nodeId potencialmente
// vazios pro backend.
function quickSpecInsertAllCanvasCards() {
  const visible = _quickSpecSessionResults.filter(el => !el.hidden && el.properties !== null);
  if (visible.length === 0) {
    showToast('Nenhum elemento visível para inserir.', 'error');
    return;
  }
  _quickSpecOpenLayoutModal(visible.map(el => ({ tag: el.tag, nodeId: el.nodeId, name: el.name, nodeType: el.nodeType, properties: el.properties })));
}
window.quickSpecInsertAllCanvasCards = quickSpecInsertAllCanvasCards;

// Chamado pelo dispatcher central ao receber 'quick-spec-canvas-result'.
function handleQuickSpecCanvasResult(msg) {
  _quickSpecHideCreatingLoading();
  if (msg.error) {
    showToast(msg.error, 'error');
    return;
  }
  // Registra qual card do canvas pertence a cada item da lista -- casado
  // pela TAG (única por sessão), não pelo nodeId de origem, porque o mesmo
  // elemento do canvas pode ser escaneado duas vezes e virar dois itens
  // distintos na lista, cada um com seu próprio card.
  (msg.created || []).forEach(rec => {
    const el = _quickSpecSessionResults.find(e => e.tag === rec.tag);
    if (el) el.insertedCardId = rec.cardId;
  });
  _quickSpecRenderList();
  showToast(msg.count > 1 ? `${msg.count} cards inseridos no canvas.` : 'Card inserido no canvas.');
}
window.handleQuickSpecCanvasResult = handleQuickSpecCanvasResult;

// Chamado pelo dispatcher central ao receber
// 'quick-spec-canvas-cards-deleted' -- confirmação de que o backend
// removeu os cards; a lista da UI já foi atualizada antes do envio.
function handleQuickSpecCanvasCardsDeleted(msg) {
  if (msg.removed > 0) {
    showToast(msg.removed > 1 ? `${msg.removed} cards removidos do canvas.` : 'Card removido do canvas.');
  }
}
window.handleQuickSpecCanvasCardsDeleted = handleQuickSpecCanvasCardsDeleted;
