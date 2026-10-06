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
// inteira, não por captura. Exclusão INDIVIDUAL fecha o buraco deixado na
// sequência (pedido do usuário, 2026-09-29: excluir "C" faz D virar C, E
// virar D...), mas só entre itens AINDA SEM card no canvas -- ver
// _quickSpecCloseTagGap, chamada por quickSpecRemoveElement. Tags de itens
// já inseridos (insertedCardId) são intocáveis: o chip do card real
// (chipText.characters) é gravado uma vez na criação e não existe canal pra
// atualizá-lo depois, então renomear na lista sem tocar o card criaria
// dessincronização visível (lista diz "C", card mostra "D"). O contador
// nunca gera uma tag nova que colida com uma tag ainda em uso (fixa ou
// reordenada) -- ver recálculo dentro de _quickSpecCloseTagGap. "Excluir
// todos" (quickSpecRemoveAllElements) continua zerando o contador direto,
// já que esvazia a lista inteira e não sobra nenhum item pra colidir.
let _quickSpecTagCounter = 0;
// Categorias escolhidas na modal de filtro, preservadas do momento da
// confirmação até o "Concluir" da captura (o plugin fica colapsado nesse
// meio-tempo, sem acesso à modal).
let _quickSpecPendingCategories = null;
// Categorias da última captura -- reaproveitadas para ler os filhos diretos
// com o mesmo filtro do elemento (null = todas).
let _quickSpecLastCategories = null;

function _quickSpecNextTag() {
  return _quickSpecTagFromIndex(_quickSpecTagCounter++);
}

// Converte um índice 0-based (mesma base numérica bijetiva usada por
// _quickSpecNextTag) na tag correspondente -- extraída à parte pra permitir
// recalcular tags de itens já existentes (ver _quickSpecCloseTagGap) sem
// duplicar a lógica de geração.
function _quickSpecTagFromIndex(n) {
  let tag = '';
  do {
    tag = String.fromCharCode(65 + (n % 26)) + tag;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return tag;
}

// Inversa de _quickSpecTagFromIndex -- só usada para reordenar/renomear tags
// existentes (ver _quickSpecCloseTagGap), nunca para gerar tag nova.
function _quickSpecTagToIndex(tag) {
  let n = -1;
  for (let i = 0; i < tag.length; i++) {
    n = (n + 1) * 26 + (tag.charCodeAt(i) - 65);
  }
  return n;
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

// Rede de segurança contra o travamento recorrente "só consigo clicar no
// plugin, não movo o canvas" (4ª correção do sintoma, 2026-09-30): a captura
// muda estado GLOBAL (janela encolhida ~52px, headers escondidos, backend
// espelhando seleção) e antes só 2 botões desfaziam isso (Cancelar/Concluir).
// Qualquer outro caminho (erro JS no meio, navigate(), UI recarregada) deixava
// a janela presa sem botão de voltar. Camadas: try/catch em Enter, saída
// forçada em navigate() (core.js), reset no boot da UI (abaixo) e reset do
// flag do backend no ui-ready (code.js).
function _quickSpecCaptureEnter() {
  try {
    _quickSpecCaptureEnterUnsafe();
  } catch (e) {
    try { parent.postMessage({ pluginMessage: { type: 'stop-quick-spec-capture' } }, '*'); } catch (_) {}
    _quickSpecPendingCategories = null;
    _quickSpecCaptureExit();
    showToast('Não foi possível iniciar a captura. Tente novamente.', 'error');
  }
}

function _quickSpecCaptureEnterUnsafe() {
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
  // 64 e não 52: se a barra ainda não estiver renderizada (measured 0), uma
  // janela menor que a barra real (~50px + zoom da UI) cortaria Cancelar/
  // Concluir e o designer ficaria sem saída.
  const FALLBACK_H = 64;
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

// Boot da UI: o estado de captura nunca sobrevive a uma UI recém-carregada.
// Restaura só o que _quickSpecCaptureEnter esconde, sem resize (o backend já
// devolve o tamanho da janela no ui-ready, ver code.js).
function _quickSpecCaptureResetOnBoot() {
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
}
window._quickSpecCaptureResetOnBoot = _quickSpecCaptureResetOnBoot;

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
    pluginMessage: _withRefSkeleton({ type: 'quick-spec-capture-finish', categories: _quickSpecPendingCategories })
  }, '*');
  _quickSpecLastCategories = _quickSpecPendingCategories;
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
    note: '',
    categories: _quickSpecLastCategories,
    includeChildren: false,
    children: null,
    childrenMore: 0,
    childrenLoading: false,
    // Id do card criado no canvas, preenchido só depois de uma inserção
    // bem-sucedida (ver handleQuickSpecCanvasResult) -- é o que permite
    // perguntar "apagar do canvas também?" ao excluir da lista.
    insertedCardId: null
  }));

  // Lista sempre na ordem das tags (A no topo = 1º clique), nunca com o lote
  // novo por cima (2026-10-05).
  _quickSpecSessionResults = _quickSpecSessionResults.concat(elements)
    .sort((a, b) => _quickSpecTagToIndex(a.tag) - _quickSpecTagToIndex(b.tag));
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
// incluídas). Cards do canvas sem entrada correspondente na sessão trazem
// as propriedades reidratadas do pluginData do próprio card (2026-09-29 --
// antes eram sempre null; ver _qsBuildElementCard/code.js). `properties`
// ainda pode vir `null` para cards legados (criados antes dessa mudança,
// sem a chave gravada) -- nesse caso a UI mostra "não disponível", mesmo
// comportamento de antes. Em qualquer caso, quem decide se o item já tem
// card no canvas (e portanto bloqueia inserir/converter de novo) é
// `insertedCardId`, nunca `properties`.
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
      properties: cc.properties,
      hidden: false,
      note: typeof cc.note === 'string' ? cc.note : '',
      categories: null,
      includeChildren: !!(cc.childrenData && Array.isArray(cc.childrenData.children)),
      children: cc.childrenData && Array.isArray(cc.childrenData.children) ? cc.childrenData.children : null,
      childrenMore: cc.childrenData ? (cc.childrenData.more || 0) : 0,
      childrenLoading: false,
      insertedCardId: cc.cardId
    });
    addedAny = true;
  });
  if (addedAny) {
    // Mantém a ordem por tag (A, B, C...) em vez de empilhar os
    // recuperados no topo -- eles não são "mais recentes", só chegaram
    // depois na sincronização.
    _quickSpecSessionResults.sort((a, b) => _quickSpecTagToIndex(a.tag) - _quickSpecTagToIndex(b.tag));
    _quickSpecRenderList();
  }
  // Botão "Limpar Dados" da Home já pode ter avaliado hasDocumentedContent()
  // ANTES desta resposta chegar (a sincronização é assíncrona, dispara ao
  // entrar nesta tela -- ver quickSpecSyncFromCanvas/navigate) -- recalcula
  // pra não deixar o botão preso desabilitado com cards reais no canvas.
  if (typeof updateHomeFooterButtonsState === 'function') updateHomeFooterButtonsState();
  if (typeof updateHomeCardsCheckState === 'function') updateHomeCardsCheckState();
}
window.handleQuickSpecCanvasCardsList = handleQuickSpecCanvasCardsList;

function _quickSpecUpdateEmptyState() {
  const empty = document.getElementById('quick-spec-empty');
  const toolbar = document.getElementById('quick-spec-toolbar');
  const insertRow = document.getElementById('quick-spec-insert-row');
  const insertAll = document.getElementById('quick-spec-insert-all');
  const hasResults = _quickSpecSessionResults.length > 0;
  if (empty) empty.classList.toggle('hidden', hasResults);
  if (toolbar) toolbar.classList.toggle('hidden', !hasResults);
  const countEl = document.getElementById('quick-spec-count');
  if (countEl) countEl.textContent = _quickSpecSessionResults.length;
  if (insertRow) {
    insertRow.classList.toggle('hidden', !hasResults);
    insertRow.classList.toggle('flex', hasResults);
  }
  // Desabilita o lote quando não sobra nenhum elemento visível ainda sem
  // card no canvas -- "inserir todos" não teria nada de novo a fazer
  // (pedido do usuário, 2026-09-29). `insertedCardId` é o critério de "já
  // tem card", não `properties` (que agora pode vir preenchido mesmo em
  // itens recuperados do canvas, ver handleQuickSpecCanvasCardsList).
  if (insertAll) {
    const anyPending = _quickSpecSessionResults.some(el => !el.hidden && !el.insertedCardId);
    insertAll.disabled = hasResults && !anyPending;
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
  return (props || []).map(p => `${p.label} ${_vocabLabel(p.label)} ${p.value} ${p.tokenName || ''} ${p.libName || ''}`).join(' ').toLowerCase();
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

// Fecha o "buraco" deixado na sequência de tags depois de uma exclusão
// individual (pedido do usuário, 2026-09-29: excluir "C" faz D virar C, E
// virar D...). Só renomeia itens SEM card no canvas (!insertedCardId) -- um
// item já inserido tem sua tag "impressa" fisicamente no chip do card
// (chipText.characters, setado uma vez na criação em
// _qsBuildElementCard/_qsBuildConnectorForCard, code.js) e não existe hoje
// nenhum canal pra atualizar esse texto depois; renomear na lista sem tocar
// o card criaria uma dessincronização visível (lista diz "C", card mostra
// "D"). Tags de itens com card ficam fixas e reservam seu índice -- os
// itens sem card preenchem, em ordem, os índices restantes (0, 1, 2...),
// pulando os fixos, o que fecha buracos reais sem nunca colidir com uma tag
// já gravada num card físico.
function _quickSpecCloseTagGap() {
  const fixedIndexes = new Set(
    _quickSpecSessionResults.filter(el => el.insertedCardId).map(el => _quickSpecTagToIndex(el.tag))
  );
  const pending = _quickSpecSessionResults
    .filter(el => !el.insertedCardId)
    .sort((a, b) => _quickSpecTagToIndex(a.tag) - _quickSpecTagToIndex(b.tag));

  let nextIndex = 0;
  let maxIndexUsed = -1;
  pending.forEach(el => {
    while (fixedIndexes.has(nextIndex)) nextIndex++;
    el.tag = _quickSpecTagFromIndex(nextIndex);
    maxIndexUsed = Math.max(maxIndexUsed, nextIndex);
    nextIndex++;
  });

  // O contador da próxima tag nova precisa continuar depois do maior índice
  // realmente em uso agora (fixo ou reordenado) -- senão a próxima captura
  // pode gerar uma tag que colide com uma já existente na lista/canvas.
  fixedIndexes.forEach(i => { maxIndexUsed = Math.max(maxIndexUsed, i); });
  _quickSpecTagCounter = maxIndexUsed + 1;
}

// Excluir um elemento da lista. Se ele já tiver card no canvas, pergunta se
// o card também deve ser apagado (ver _quickSpecMaybeDeleteCanvasCards).
function quickSpecRemoveElement(idx) {
  const removed = _quickSpecSessionResults[idx];
  if (!removed) return;
  _quickSpecSessionResults.splice(idx, 1);
  _quickSpecCloseTagGap();
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
  // Diferente da exclusão individual (nunca reaproveita tag): esvaziar a
  // lista inteira reinicia a sequência A/B/C -- não sobra nenhum item na UI
  // que possa colidir com uma tag reaproveitada (pedido do usuário,
  // 2026-09-29).
  _quickSpecTagCounter = 0;
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

function _quickSpecPropsHtml(props) {
  return (props || []).map(p => {
        if (p.tokenName) {
          return `
      <div class="text-[10px] leading-snug">
        <div>${escapeHtml(_vocabLabel(p.label))}: <strong class="${p.libName ? 'text-[#005ca9] dark:text-blue-400' : 'text-slate-700 dark:text-white'}">${escapeHtml(p.tokenName)}</strong>${p.libName ? ` <span class="text-slate-400 dark:text-slate-500 font-normal">· ${escapeHtml(p.libName)}</span>` : ''}</div>
        <div class="pl-3 text-slate-400 dark:text-slate-500">↳ valor bruto: ${escapeHtml(String(p.value))}</div>
      </div>
    `;
        }
        return `
      <div class="text-[10px] text-slate-500 dark:text-dark-muted leading-snug">
        <span>${escapeHtml(_vocabLabel(p.label))}: <strong class="text-slate-700 dark:text-white">${escapeHtml(String(_vocabValue(p.value)))}</strong></span>
      </div>
    `;
      }).join('');
}

function _quickSpecChildrenHtml(el) {
  if (!el.includeChildren) return '';
  if (el.childrenLoading) return `<p class="text-[10px] text-slate-400 dark:text-slate-500 italic pt-2">Lendo filhos diretos...</p>`;
  if (!Array.isArray(el.children)) return '';
  const items = el.children.length === 0
    ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 italic">Nenhum filho direto com propriedade nas categorias marcadas.</p>`
    : el.children.map(ch => `
      <div class="border-l-2 border-gray-200 dark:border-dark-line pl-2 space-y-0.5">
        <p class="text-[10px] font-bold text-slate-700 dark:text-white">${escapeHtml(ch.name)} <span class="font-normal text-slate-400 dark:text-slate-500">· ${escapeHtml(ch.nodeType || '')}</span></p>
        ${_quickSpecPropsHtml(ch.properties)}
      </div>`).join('');
  const more = el.childrenMore > 0 ? `<p class="text-[10px] text-slate-400 dark:text-slate-500">+${el.childrenMore} filho(s) não lido(s): o limite é 8. Para ver outro filho, anote-o separadamente.</p>` : '';
  return `<div class="pt-2 space-y-2"><p class="text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider">Filhos diretos</p>${items}${more}</div>`;
}

function _quickSpecRenderList() {
  const list = document.getElementById('quick-spec-list');
  if (!list) return;
  _quickSpecUpdateEmptyState();

  list.innerHTML = _quickSpecSessionResults.map((el, idx) => {
    // properties === null: card legado (criado antes de 2026-09-29, sem a
    // chave de propriedades gravada no pluginData) -- não tem como mostrar
    // texto de propriedades, só o aviso de "não disponível" (ver
    // handleQuickSpecCanvasCardsList/code.js). Não confundir com "já tem
    // card no canvas", que é sempre `insertedCardId` -- um item recuperado
    // do canvas pode muito bem ter properties reidratadas (não é mais
    // sempre null) e ainda assim já ter card, então continuar bloqueado
    // pra inserir/converter de novo.
    const hasNoPropertiesData = el.properties === null;
    const alreadyOnCanvas = !!el.insertedCardId;
    const searchText = `${el.name} ${el.tag} ${hasNoPropertiesData ? '' : _quickSpecPropSearchText(el.properties)}`.toLowerCase();
    // Hierarquia: quando existe token, ele vem PRIMEIRO e em destaque (é a
    // informação que o dev deve consumir -- itens vindos de lib já têm a
    // propriedade bem definida pelo token); o valor bruto vem logo abaixo,
    // como apoio/conferência. Sem token, o valor bruto é a própria linha
    // principal (nada a destacar acima dele) -- pedido do usuário
    // (2026-09-25, com exemplo real de "[m3] Top app bar": token de cor
    // aparecia depois do hex bruto, precisava ser o oposto).
    const propsHtml = hasNoPropertiesData
      ? `<p class="text-[10px] text-slate-400 dark:text-slate-500 italic leading-snug">Card recuperado do canvas -- propriedades não disponíveis nesta sessão (re-escaneie o elemento se precisar consultá-las de novo).</p>`
      : _quickSpecPropsHtml(el.properties);
    const childrenHtml = _quickSpecChildrenHtml(el);

    return `
      <li data-qs-element data-qs-search="${escapeHtml(searchText)}"
        class="border border-gray-100 dark:border-dark-line rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-dark-surface ${el.hidden ? 'opacity-50' : ''}">
        <div class="w-full flex items-center justify-between gap-2 p-3">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <span class="shrink-0 w-5 h-5 flex items-center justify-center bg-[#005ca9] text-white text-[9px] font-black rounded">${escapeHtml(el.tag)}</span>
            <span class="text-[11px] font-bold text-slate-700 dark:text-white truncate">${escapeHtml(el.name)}</span>
            <span class="text-[9.5px] text-slate-400 dark:text-slate-500 shrink-0">${el.nodeType}</span>
            ${el.insertedCardId ? '<span title="Já tem card no canvas" class="shrink-0 text-[8.5px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded">No canvas</span>' : ''}
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="focusNode('${el.nodeId}')" title="Focar no elemento original" aria-label="Focar no elemento original no canvas"
              class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-[#005ca9] dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors">
              <i data-lucide="crosshair" class="w-3.5 h-3.5"></i>
            </button>
            ${el.insertedCardId ? `
            <button onclick="focusNode('${el.insertedCardId}')" title="Focar no card da anotação" aria-label="Focar no card da anotação no canvas"
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
          ${hasNoPropertiesData ? '' : `
          <div class="px-3 pt-2">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[12px] font-medium text-slate-700 dark:text-white">Incluir filhos diretos</p>
                <p class="text-[10px] text-slate-500 dark:text-dark-muted">Lê só o 1º nível, até 8 filhos.</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer shrink-0">
                <input type="checkbox" class="sr-only peer" ${el.includeChildren ? 'checked' : ''} ${el.childrenLoading ? 'disabled' : ''}
                  aria-label="Incluir filhos diretos de ${escapeHtml(el.name)}"
                  onchange="quickSpecToggleChildren('${escapeHtml(el.tag)}', this.checked)">
                <div class="w-9 h-5 bg-gray-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#005ca9]"></div>
              </label>
            </div>
            ${childrenHtml}
          </div>`}
          <div class="px-3 pt-2">
            <div class="flex items-center justify-between mb-1 ml-1">
              <label for="qs-note-${escapeHtml(el.tag)}" class="text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider">Observação <span class="normal-case font-medium text-slate-400 dark:text-slate-500">(opcional)</span></label>
              <span id="qs-note-count-${escapeHtml(el.tag)}" class="text-[9px] font-bold text-slate-400 dark:text-dark-muted">${(el.note || '').length}/280</span>
            </div>
            <textarea id="qs-note-${escapeHtml(el.tag)}" rows="2" maxlength="280" placeholder="Ex: usar só no estado ativo"
              oninput="quickSpecSetNote('${escapeHtml(el.tag)}', this.value)" onblur="quickSpecFlushNote('${escapeHtml(el.tag)}')"
              class="w-full px-3 py-2 bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-2xl text-[11px] text-slate-700 dark:text-dark-text placeholder:text-gray-300 outline-none focus:ring-2 focus:ring-blue-100 resize-none transition-all">${escapeHtml(el.note || '')}</textarea>
          </div>
          <div class="p-3 space-y-2">
            ${alreadyOnCanvas ? '' : `
            <button onclick="quickSpecInsertCanvasCards(${idx})"
              class="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-500">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              Inserir card no canvas
            </button>
            <button onclick="quickSpecConvertToDetailedSpec(${idx})"
              class="w-full py-2 bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line hover:bg-gray-50 dark:hover:bg-slate-800 text-[#005ca9] dark:text-blue-400 text-[11px] font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5">
              <i data-lucide="file-plus-2" class="w-3.5 h-3.5"></i>
              Converter em Especificação
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
// Inserção direta, sem modal de grade (2026-10-05, pedido do Augusto): cada
// card nasce ao lado do frame, na altura do próprio elemento, e o backend
// empurra para baixo o que colidir (ver quick-spec-insert-canvas, code.js).
function _quickSpecInsertCards(items) {
  if (!items || items.length === 0) return;
  _quickSpecShowCreatingLoading(items.length);
  parent.postMessage({ pluginMessage: { type: 'quick-spec-insert-canvas', items } }, '*');
}

// Observação por elemento (máx. 280): fica no estado da sessão e, se o item
// já tem card no canvas, é reenviada ao backend com debounce (ou ao sair do
// campo) para atualizar o bloco sem recriar o card.
const _quickSpecNoteTimers = {};

function _quickSpecSendNoteUpdate(tag) {
  const el = _quickSpecSessionResults.find(e => e.tag === tag);
  if (!el || !el.insertedCardId) return;
  parent.postMessage({ pluginMessage: { type: 'quick-spec-update-note', nodeId: el.insertedCardId, note: (el.note || '').trim().slice(0, 280) } }, '*');
}

function quickSpecSetNote(tag, value) {
  const el = _quickSpecSessionResults.find(e => e.tag === tag);
  if (!el) return;
  el.note = String(value).slice(0, 280);
  const counter = document.getElementById('qs-note-count-' + tag);
  if (counter) counter.textContent = `${el.note.length}/280`;
  clearTimeout(_quickSpecNoteTimers[tag]);
  if (el.insertedCardId) _quickSpecNoteTimers[tag] = setTimeout(() => _quickSpecSendNoteUpdate(tag), 500);
}
window.quickSpecSetNote = quickSpecSetNote;

function quickSpecFlushNote(tag) {
  if (_quickSpecNoteTimers[tag] === undefined) return;
  clearTimeout(_quickSpecNoteTimers[tag]);
  delete _quickSpecNoteTimers[tag];
  _quickSpecSendNoteUpdate(tag);
}
window.quickSpecFlushNote = quickSpecFlushNote;

// Item enviado ao backend para criar o card (filhos só se o designer ligou e
// já foram lidos).
function _quickSpecInsertPayload(el) {
  const p = { tag: el.tag, nodeId: el.nodeId, name: el.name, nodeType: el.nodeType, properties: el.properties, note: (el.note || '').trim().slice(0, 280) };
  if (el.includeChildren && Array.isArray(el.children)) { p.children = el.children; p.childrenMore = el.childrenMore || 0; }
  return p;
}

// "Incluir filhos diretos" (2026-10-05): liga = lê o 1º nível no backend
// (mesmo filtro de categorias da captura); desliga = descarta. Se o item já
// tem card no canvas, o bloco do card acompanha.
function quickSpecToggleChildren(tag, on) {
  const el = _quickSpecSessionResults.find(e => e.tag === tag);
  if (!el) return;
  el.includeChildren = !!on;
  if (!on) {
    el.children = null;
    el.childrenMore = 0;
    if (el.insertedCardId) parent.postMessage({ pluginMessage: { type: 'quick-spec-update-children', nodeId: el.insertedCardId, children: null } }, '*');
    _quickSpecRenderList();
    _quickSpecReopenItem(tag);
    return;
  }
  if (!el.nodeId) { el.includeChildren = false; showToast('Elemento de origem não encontrado.'); _quickSpecRenderList(); return; }
  el.childrenLoading = true;
  _quickSpecRenderList();
  _quickSpecReopenItem(tag);
  parent.postMessage({ pluginMessage: { type: 'quick-spec-read-children', tag, nodeId: el.nodeId, categories: el.categories || null } }, '*');
}
window.quickSpecToggleChildren = quickSpecToggleChildren;

function handleQuickSpecChildrenRead(msg) {
  const el = _quickSpecSessionResults.find(e => e.tag === msg.tag);
  if (!el) return;
  el.childrenLoading = false;
  if (msg.error) {
    el.includeChildren = false;
    showToast(msg.error);
  } else if (el.includeChildren) {
    el.children = msg.children || [];
    el.childrenMore = msg.more || 0;
    if (el.insertedCardId) parent.postMessage({ pluginMessage: { type: 'quick-spec-update-children', nodeId: el.insertedCardId, children: el.children, more: el.childrenMore } }, '*');
  }
  _quickSpecRenderList();
  _quickSpecReopenItem(msg.tag);
}
window.handleQuickSpecChildrenRead = handleQuickSpecChildrenRead;

// A lista é redesenhada inteira; mantém aberto o item em que o designer mexia.
function _quickSpecReopenItem(tag) {
  const idx = _quickSpecSessionResults.findIndex(e => e.tag === tag);
  const li = document.querySelectorAll('#quick-spec-list [data-qs-element]')[idx];
  const btn = li && li.querySelector('[data-accordion-toggle]');
  if (btn && btn.getAttribute('aria-expanded') !== 'true') toggleAccordion(btn);
}

// Insere no canvas UM card do elemento indicado.
function quickSpecInsertCanvasCards(idx) {
  const el = _quickSpecSessionResults[idx];
  if (!el) return;
  _quickSpecInsertCards([_quickSpecInsertPayload(el)]);
}
window.quickSpecInsertCanvasCards = quickSpecInsertCanvasCards;

// Guarda qual elemento da sessão está em conversão -- só entre o clique em
// "Converter em Especificação" e o desfecho do fluxo (spec-created ou
// cancelamento). Casado pela TAG (igual handleQuickSpecCanvasResult), nunca
// pelo índice puro: o índice muda se a lista for reordenada/filtrada
// enquanto o modal de Especificação está aberto por cima.
window._quickSpecPendingConversionTag = null;

// Converte um item do Spec Express em Especificação -- abre o fluxo normal
// de criação (openSpecFormModal, specifications.js) já com o elemento de
// origem vinculado e as observação como nota inicial. Reaproveita o fluxo inteiro (propriedades -> posição -> exceção)
// sem duplicar nada dele; só o desfecho (spec-created, ver messages.js) é
// que sabe completar a conversão removendo o card Express original.
function quickSpecConvertToDetailedSpec(idx) {
  const el = _quickSpecSessionResults[idx];
  // Bloqueio é por já ter card no canvas (insertedCardId), não por
  // properties -- desde 2026-09-29 um item recuperado do canvas pode ter
  // properties reidratadas mesmo já tendo card; conversão continua
  // indisponível nesse caso (mesmo comportamento de antes, ver
  // _quickSpecRenderList/alreadyOnCanvas).
  if (!el || el.insertedCardId) return;
  if (typeof openSpecFormModal !== 'function') return;

  // Fixa o elemento de origem ANTES de abrir o modal -- openSpecFormModal só
  // dispara 'get-selection-id-for-spec' (que pegaria a seleção atual do
  // canvas, não o elemento do Spec Express) quando este valor ainda está
  // vazio.
  window._pendingSpecTargetNodeId = el.nodeId;
  window._quickSpecPendingConversionTag = el.tag;

  openSpecFormModal();

  // Nome do elemento já é conhecido (veio do próprio Spec Express) -- evita
  // esperar a resposta assíncrona de 'get-node-name' só pra preencher o
  // indicador de elemento vinculado nos 3 modais do fluxo.
  if (typeof _onNodeNameForSpec === 'function') _onNodeNameForSpec(el.name);

  const noteField = document.getElementById('ann-note');
  if (noteField) {
    noteField.value = (el.note || '').slice(0, 500);
    if (typeof _updateCharCount === 'function') _updateCharCount(noteField, 500);
  }
}
window.quickSpecConvertToDetailedSpec = quickSpecConvertToDetailedSpec;

// Chamado pelo handler de 'spec-created' (messages.js) quando havia uma
// conversão pendente -- remove o card Express original do canvas (mesmo
// caminho de exclusão já usado no botão "Excluir da lista", sem confirmação
// window.confirm: a criação da Especificação JÁ é a confirmação explícita
// do designer) e tira o item da lista da sessão.
function _quickSpecFinishPendingConversion() {
  const tag = window._quickSpecPendingConversionTag;
  window._quickSpecPendingConversionTag = null;
  if (!tag) return;
  const idx = _quickSpecSessionResults.findIndex(e => e.tag === tag);
  if (idx === -1) return;
  const el = _quickSpecSessionResults[idx];
  _quickSpecSessionResults.splice(idx, 1);
  _quickSpecRenderList();
  if (el.insertedCardId) {
    parent.postMessage({ pluginMessage: { type: 'quick-spec-delete-canvas-cards', cardIds: [el.insertedCardId] } }, '*');
  }
}
window._quickSpecFinishPendingConversion = _quickSpecFinishPendingConversion;

// Insere todos os elementos NÃO ocultos da sessão de uma vez -- ação de
// lote equivalente ao antigo "Inserir todos os cards no canvas" por frame,
// agora aplicada à lista plana inteira. Itens que já têm card no canvas
// (insertedCardId, ver handleQuickSpecCanvasCardsList) ficam de fora --
// reinserir seria duplicar, e o botão "Inserir card no canvas" já nem
// aparece pra eles individualmente (ver _quickSpecRenderList/
// alreadyOnCanvas). Critério é só insertedCardId, não mais properties
// (que desde 2026-09-29 pode vir preenchido mesmo em itens recuperados do
// canvas).
function quickSpecInsertAllCanvasCards() {
  const visible = _quickSpecSessionResults.filter(el => !el.hidden && !el.insertedCardId);
  if (visible.length === 0) {
    showToast('Nenhum elemento pendente de inserção.', 'error');
    return;
  }
  _quickSpecInsertCards(visible.map(_quickSpecInsertPayload));
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
