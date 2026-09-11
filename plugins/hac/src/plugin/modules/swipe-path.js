// Módulo extraído de accessibility.js (2026-09-09) — Trilha de Swipe.
// Depende globalmente (sem import — script único concatenado por build.cjs) de:
// hacData.a11ySwipePaths, hacData.projectOrigin, showToast, openModal, closeModal,
// escapeHtml, _refreshIcons, saveToStorage, renderA11yGroupedList,
// _renderA11yWorkspaceTab, _toastSaved, _a11yCaptureMiniBarEnter — todos definidos
// em outros módulos do bundle. Também referencia _currentTabOrderItems(areaId) e
// window._tabOrderCaptureMode/cancelTabOrderReview() (tab-order.js), concatenado
// logo antes deste no bundle final.

// Resposta de 'swipe-path-copy-started' (messages.js) — espelha
// handleTabOrderCopyStarted (2026-09-04-ac). cloneId null significa que o
// backend não conseguiu clonar (área não encontrada/não clonável) — a
// captura minimizada já foi ligada no frontend nesse ponto
// (_a11yCaptureMiniBarEnter roda antes da resposta do backend chegar),
// então sai da captura e cancela pra não deixar o designer preso numa
// janela minimizada sem nenhuma cópia pra clicar.
function handleSwipePathCopyStarted(cloneId) {
  if (!cloneId) {
    if (typeof _a11yCaptureMiniBarExit === 'function') _a11yCaptureMiniBarExit();
    cancelSwipePathReview();
  }
}
window.handleSwipePathCopyStarted = handleSwipePathCopyStarted;

// ── Trilha de Swipe ──────────────────────────────────────────────────────
// 3ª REFORMULAÇÃO (2026-09-04) — a v2 (conexão reta entre EXATAMENTE 2
// Áreas Marcadas escolhidas por dropdown) foi removida por completo. O
// modelo real, confirmado por imagem de referência do usuário (fluxo real
// do app CAIXA): uma TRILHA DIRECIONAL DE N PONTOS (mín. 2), capturados por
// clique sequencial no canvas OU seleção múltipla de uma vez — mesmo modelo
// EM LOTE de Ordem de Tabulação (ver applyTabOrderToCanvas acima e o
// modelo de acumulação silenciosa): cada clique só acumula em silêncio no
// backend (com highlight, sem desenhar nada ainda); a trilha inteira só é desenhada
// numa ÚNICA operação ao confirmar "Criar trilha de swipe" —
// insert-swipe-path (code.js). Diferente de Tabulação, aqui não há desenho
// incremental por item (não faria sentido: a trilha é UM único grupo
// cobrindo todos os pontos, não um selo por item), então o botão de
// confirmar só fica desabilitado durante o processamento da mensagem, sem
// loop de "aguardar cada resposta".
//
// Pontos NÃO são restritos a Áreas Marcadas nem operam sobre uma cópia
// rascunho — diferente de Tabulação, o backend nunca traduz clone→original
// aqui (ver listener de selectionchange em code.js): o designer clica
// direto nos nós reais do design. Sem "Mapeamento Automático" nesta
// entrega (fora de escopo, ver plano).
//
// Schema: hacData.a11ySwipePaths[] = [{ id, points: [{nodeId, nodeName}],
// areaId, createdAt }] (aditivo, sem bump de _schemaVersion, mesmo
// precedente de tabOrderItems/projectOrigin/handoffFicha). No máximo 1
// trilha por área — criar uma nova trilha para a mesma área é SUBSTITUIÇÃO
// completa.
window._swipePathPendingList = [];
window._swipePathPendingAreaId = null;
// 'continuous' (escuta toda seleção enquanto o modal estiver aberto) | null
// (parado). core.js guarda contra navegação/troca de view enquanto esta
// flag está ativa, chamando cancelSwipePathReview() automaticamente (mesmo
// padrão de window._tabOrderCaptureMode).
window._swipePathCaptureMode = null;
// true quando o modal de revisão foi aberto por "Editar pontos" numa
// trilha JÁ SALVA (openSwipePathEditMode), false no fluxo normal de
// criação/"Refazer" — openSwipePathReviewModal usa esta flag só para
// trocar título/instrução/texto do botão de confirmar (2026-09-09,
// feature "editar a Trilha de Swipe já criada"). Resetada em
// cancelSwipePathReview e handleSwipePathCreated para nunca vazar entre
// sessões do modal.
window._swipePathEditingExisting = false;
let _swipePathTempIdSeq = 1;

function _swipePathNextTempId() {
  return `tmp-swipe-${_swipePathTempIdSeq++}`;
}

// Botão "Editar pontos" do card já-criado (2026-09-09, feature "editar a
// Trilha de Swipe já criada") — diferente de "Refazer" (que recomeça a
// captura do zero, lista vazia), aqui a lista pendente já NASCE POPULADA
// a partir da trilha salva em hacData, reaproveitando 100% da mecânica de
// arrastar-para-reordenar/remover já existente no modal de revisão (mesmo
// formato usado por startSwipePathFromTabOrder). Não liga nenhuma escuta
// de captura sozinho — só popula e abre o modal; "+ Adicionar ponto"
// dentro do modal é quem, sob demanda, arma a captura de novo(s) ponto(s)
// (ver startSwipePathAddPoint).
function openSwipePathEditMode(areaId, targetNodeId, sectionName) {
  const existingPath = (hacData.a11ySwipePaths || []).find(p => p && p.areaId === areaId);
  if (!existingPath || !Array.isArray(existingPath.points) || existingPath.points.length === 0) return;

  window._swipePathPendingList = existingPath.points.map(p => ({
    nodeId: p.nodeId,
    nodeName: p.nodeName || '',
    tempId: _swipePathNextTempId(),
  }));
  window._swipePathPendingAreaId = areaId;
  window._swipePathPendingTargetNodeId = targetNodeId || null;
  window._swipePathEditingExisting = true;

  openSwipePathReviewModal();
}
window.openSwipePathEditMode = openSwipePathEditMode;

// Botão "Iniciar trilha de swipe"/"Refazer trilha de swipe" — reinicia a
// lista pendente (nunca acumula com uma sessão anterior não confirmada) e
// abre o modal de revisão já em modo de escuta contínua. targetNodeId é a
// raiz da Área Marcada, usada pelo backend pra clonar o frame ANTES de
// ligar a escuta (2026-09-04-ac, mesmo mecanismo de Ordem de Tabulação —
// a linha final não pode ser desenhada sobre o design original).
function startSwipePathManualMode(areaId, targetNodeId) {
  if (!areaId) return;
  // Exclusividade mútua com Ordem de Tabulação (2026-09-04-ad, mesmo bug
  // real corrigido, ver comentário completo em startTabOrderManualMode).
  if (window._tabOrderCaptureMode && typeof cancelTabOrderReview === 'function') {
    cancelTabOrderReview();
    showToast('A captura de Ordem de Tabulação em andamento foi cancelada.');
  }
  ensureA11yProjectOriginThen(() => {
    window._swipePathPendingList = [];
    window._swipePathPendingAreaId = areaId;
    window._swipePathPendingTargetNodeId = targetNodeId || null;
    // Modal de revisão NÃO abre mais aqui (2026-09-04-w, pedido do
    // usuário) — mesma mudança aplicada à Ordem de Tabulação: a janela
    // minimiza pra uma barra fina e o designer clica em toda a trilha em
    // silêncio. O modal só abre depois, via finishSwipePathCapture
    // (chamado por "Concluir seleção" na barra mini).
    if (typeof _a11yCaptureMiniBarEnter === 'function') _a11yCaptureMiniBarEnter('swipePath');
    _swipePathSetCaptureMode('continuous', areaId, targetNodeId || null, getA11yActiveSectionName());
    showToast('Cópia da tela criada — segure shift e clique (ou use marquise) pra marcar os pontos dela. A janela foi minimizada para dar espaço ao canvas.');
  });
}
window.startSwipePathManualMode = startSwipePathManualMode;

// "Gerar automaticamente" do Swipe (2026-09-08, pedido do usuário) —
// reaproveita a sequência já mapeada e confirmada pela Ordem de
// Tabulação desta MESMA área, na ordem exata de `number` (1, 2, 3...),
// em vez de calcular qualquer ordem própria (zigue-zague, posição
// visual, ou reler figma.currentPage.selection — cuja ordem a própria
// documentação da Plugin API do Figma declara "unspecified", não é um
// bug corrigível, é limitação real da API). A Ordem de Tabulação já
// resolve "captar a sequência real que o designer pretende" de forma
// validada — não mexida aqui, só consumida.
//
// Sem itens de Tabulação nesta área (ainda não documentada), cai no
// MESMO fluxo manual do botão "Iniciar/Refazer trilha de swipe" — nunca
// bloqueia o designer só porque a Tabulação não foi feita antes.
function startSwipePathFromTabOrder(areaId, targetNodeId) {
  if (!areaId) return;
  const items = _currentTabOrderItems(areaId)
    .filter(it => it && it.targetNodeId)
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  if (items.length < 2) {
    showToast('Esta tela ainda não tem Ordem de Tabulação com pelo menos 2 itens — marque a trilha manualmente.');
    startSwipePathManualMode(areaId, targetNodeId);
    return;
  }

  // Exclusividade mútua com Ordem de Tabulação, mesmo cuidado de
  // startSwipePathManualMode — só por segurança, já que esta função não
  // abre nenhum modo de captura contínua (desenha direto), mas evita
  // colisão de estado se algo ainda estivesse em andamento.
  if (window._tabOrderCaptureMode && typeof cancelTabOrderReview === 'function') {
    cancelTabOrderReview();
    showToast('A captura de Ordem de Tabulação em andamento foi cancelada.');
  }

  ensureA11yProjectOriginThen(() => {
    window._swipePathPendingAreaId = areaId;
    window._swipePathPendingTargetNodeId = targetNodeId || null;
    window._swipePathPendingList = items.map(it => ({
      nodeId: it.targetNodeId,
      nodeName: it.targetNodeName || '',
      tempId: _swipePathNextTempId(),
    }));
    showToast(`Desenhando a trilha de swipe com os ${items.length} pontos já mapeados na Ordem de Tabulação…`);
    applySwipePathToCanvas();
  });
}
window.startSwipePathFromTabOrder = startSwipePathFromTabOrder;

// Botão "Concluir seleção" da barra de captura minimizada — mesma lógica
// de finishTabOrderCapture (ver comentário lá, 2026-09-04-aa): pede ao
// backend tudo que foi acumulado em silêncio (get-swipe-path-accumulated-selection);
// a resposta é quem popula a lista pendente e abre o modal.
function finishSwipePathCapture() {
  parent.postMessage({ pluginMessage: { type: 'get-swipe-path-accumulated-selection' } }, '*');
}
window.finishSwipePathCapture = finishSwipePathCapture;

// Botão "+ Adicionar ponto" DENTRO do modal já aberto (2026-09-09, feature
// "editar a Trilha de Swipe já criada") — espelha startTabOrderAddItemsFromCard
// + startTabOrderAddItemWait: primeiro garante que a cópia clonada da área
// existe/é reconhecida via resolve-swipe-path-clone (NUNCA start-swipe-
// path-mode aqui — esse handler sempre CLONA um frame novo do zero,
// apagando a cópia com a revisão em andamento, ver comentário de
// resolve-swipe-path-clone em code.js); só depois de confirmado
// (handleSwipePathCloneResolved) é que a escuta de seleção é ligada.
// Sempre visível (não só no modo edição) — também útil ao revisar uma
// trilha recém-capturada antes da 1ª confirmação, quando o clone já
// existe da captura em andamento.
function startSwipePathAddPoint() {
  const areaId = window._swipePathPendingAreaId;
  if (!areaId) return;
  const btn = document.getElementById('btn-swipe-path-add-point');
  if (btn) btn.disabled = true;
  window._swipePathAddPointWaitingClone = true;
  parent.postMessage({
    pluginMessage: {
      type: 'resolve-swipe-path-clone',
      areaId,
      targetNodeId: window._swipePathPendingTargetNodeId || null,
      sectionName: getA11yActiveSectionName(),
      designerName: getA11yDesignerName(),
      designerId: getA11yDesignerId(),
    },
  }, '*');
}
window.startSwipePathAddPoint = startSwipePathAddPoint;

// Resposta de 'swipe-path-clone-resolved' (messages.js) — só depois de
// confirmar que a cópia existente foi encontrada/reaproveitada com
// sucesso é que a captura do(s) novo(s) ponto(s) é armada. Em falha,
// avisa e reabilita o botão sem tentar capturar nada.
function handleSwipePathCloneResolved(areaId, ok) {
  if (!window._swipePathAddPointWaitingClone || areaId !== window._swipePathPendingAreaId) return;
  window._swipePathAddPointWaitingClone = false;
  const btn = document.getElementById('btn-swipe-path-add-point');
  if (!ok) {
    if (btn) btn.disabled = false;
    showToast('Não foi possível localizar a cópia da tela no canvas — refaça a trilha.', 'error');
    return;
  }
  _swipePathStartAddPointWait();
}
window.handleSwipePathCloneResolved = handleSwipePathCloneResolved;

// Liga a escuta de seleção (só contagem/highlight, sem clonar — ver
// start-swipe-path-listen-only em code.js) e transforma "Adicionar ponto"
// em "Concluir seleção", mesmo padrão de startTabOrderAddItemWait: aceita
// shift+clique/marquise pra vários pontos novos de uma vez.
function _swipePathStartAddPointWait() {
  const btn = document.getElementById('btn-swipe-path-add-point');
  const label = btn ? btn.querySelector('[data-swipe-path-add-point-label]') : null;
  window._swipePathAddPointWaiting = true;
  window._swipePathCaptureMode = 'continuous';
  parent.postMessage({ pluginMessage: { type: 'start-swipe-path-listen-only' } }, '*');
  if (label) label.textContent = 'Concluir seleção';
  if (btn) { btn.disabled = false; btn.onclick = () => finishSwipePathAddPointWait(); }
  showToast('Segure shift e clique (ou use marquise) pra marcar quantos pontos novos precisar — clique em "Concluir seleção" quando terminar.');
}

// "Concluir seleção" do fluxo "+ Adicionar ponto" — lê tudo que foi
// acumulado em silêncio e desarma a espera.
// handleSwipePathAccumulatedSelectionResult já sabe ANEXAR ao final da
// lista pendente existente (não substituir) quando o modal já está
// aberto — nenhuma mudança necessária nesse ponto.
function finishSwipePathAddPointWait() {
  window._swipePathAddPointWaiting = false;
  window._swipePathCaptureMode = null;
  // Desliga a escuta ligada por start-swipe-path-listen-only — stop-swipe-
  // path-mode serve pros dois caminhos que ligam _swipePathModeActive no
  // backend (o clonador start-swipe-path-mode e o listen-only), então
  // reaproveita o mesmo tipo de mensagem sem precisar de um par dedicado.
  parent.postMessage({ pluginMessage: { type: 'stop-swipe-path-mode' } }, '*');
  parent.postMessage({ pluginMessage: { type: 'get-swipe-path-accumulated-selection' } }, '*');
}
window.finishSwipePathAddPointWait = finishSwipePathAddPointWait;

function _swipePathResetAddPointButton() {
  const btn = document.getElementById('btn-swipe-path-add-point');
  const label = btn ? btn.querySelector('[data-swipe-path-add-point-label]') : null;
  if (label) label.textContent = 'Adicionar ponto';
  // onclick restaurado explicitamente (mesmo cuidado de
  // _tabOrderResetAddItemButton) — sem isto, cancelar/concluir uma vez
  // deixaria o botão permanentemente preso em "Concluir seleção" na
  // próxima vez que o modal fosse reaberto.
  if (btn) { btn.disabled = false; btn.onclick = () => startSwipePathAddPoint(); }
}

// Abre o modal de revisão vazio/pré-populado — idempotente, reabrir com o
// modal já aberto só re-renderiza a lista. Troca título/instrução/texto do
// botão de confirmar conforme window._swipePathEditingExisting
// (2026-09-09, feature "editar a Trilha de Swipe já criada") — true
// (aberto por openSwipePathEditMode) fala de EDIÇÃO de uma trilha já
// salva; false (fluxo normal de criação/"Refazer"/"Gerar automaticamente")
// mantém exatamente os textos originais.
function openSwipePathReviewModal() {
  const titleEl = document.getElementById('a11y-swipe-path-review-title-text');
  const instructionEl = document.getElementById('a11y-swipe-path-review-instruction');
  const confirmTextEl = document.getElementById('a11y-swipe-path-review-confirm-text');
  if (window._swipePathEditingExisting) {
    if (titleEl) titleEl.textContent = 'Editar Trilha de Ordem de Leitura';
    if (instructionEl) instructionEl.textContent = 'Ajuste os pontos desta trilha — arraste para reordenar, remova ou adicione um novo ponto antes de salvar.';
    if (confirmTextEl) confirmTextEl.textContent = 'Salvar alterações';
  } else {
    if (titleEl) titleEl.textContent = 'Trilha de Ordem de Leitura';
    if (instructionEl) instructionEl.textContent = 'Esta é a trilha marcada no canvas, já na ordem espacial resolvida automaticamente — arraste para reordenar ou remova um ponto antes de confirmar.';
    if (confirmTextEl) confirmTextEl.textContent = 'Criar trilha de ordem de leitura';
  }
  openModal('a11y-swipe-path-review-modal');
  _renderSwipePathPendingList();
}
window.openSwipePathReviewModal = openSwipePathReviewModal;

// Liga/desliga a escuta de seleção do canvas no backend (start-swipe-path-
// mode/stop-swipe-path-mode, code.js) — mesmo padrão de
// _tabOrderSetCaptureMode. areaId/targetNodeId/sectionName (2026-09-04-ac):
// a Trilha de Swipe agora CLONA o frame da Área ao ligar a escuta (mesmo
// mecanismo de Ordem de Tabulação — a linha final não pode ser desenhada
// sobre o design original), então start-swipe-path-mode precisa dos
// mesmos 3 campos que start-tab-order-copy já usa pra criar a cópia.
function _swipePathSetCaptureMode(mode, areaId, targetNodeId, sectionName) {
  const wasOff = !window._swipePathCaptureMode;
  window._swipePathCaptureMode = mode;
  if (mode && wasOff) {
    parent.postMessage({ pluginMessage: { type: 'start-swipe-path-mode', areaId: areaId || null, targetNodeId: targetNodeId || null, sectionName: sectionName || null, designerName: getA11yDesignerName(), designerId: getA11yDesignerId() } }, '*');
  } else if (!mode && !wasOff) {
    parent.postMessage({ pluginMessage: { type: 'stop-swipe-path-mode' } }, '*');
  }
}

// Modelo de ACUMULAÇÃO SILENCIOSA (2026-09-04-aa) — mesmo modelo aplicado
// à Ordem de Tabulação (ver comentário completo lá): durante a captura, o
// backend só acumula em silêncio e desenha o highlight por conta própria,
// sem postar nada em tempo real. window._swipePathPendingList só é
// populada uma vez, ao "Concluir seleção".

// Contagem ao vivo — resposta de 'swipe-path-accumulated-count-changed'.
// Também serve pro fluxo de "+ Adicionar ponto" (modal já aberto, ver
// startSwipePathAddPoint): enquanto window._swipePathAddPointWaiting
// estiver ligado, só atualiza o texto do botão "Concluir seleção" com a
// contagem ao vivo — a leitura só acontece quando o designer de fato
// clicar nele (finishSwipePathAddPointWait), mesmo cuidado de
// handleTabOrderAccumulatedCountChanged pra aceitar shift+clique/marquise
// de vários pontos de uma vez, não só o primeiro.
function handleSwipePathAccumulatedCountChanged(count) {
  if (window._swipePathAddPointWaiting) {
    const btn = document.getElementById('btn-swipe-path-add-point');
    const label = btn ? btn.querySelector('[data-swipe-path-add-point-label]') : null;
    if (label) label.textContent = count > 0 ? `Concluir seleção (${count})` : 'Concluir seleção';
    return;
  }
  if (typeof _a11yCaptureMiniBarUpdateCount === 'function') _a11yCaptureMiniBarUpdateCount(count || 0);
}
window.handleSwipePathAccumulatedCountChanged = handleSwipePathAccumulatedCountChanged;

// Resposta de 'swipe-path-accumulated-selection-result' — dois chamadores:
// finishSwipePathCapture ("Concluir seleção" da captura inicial, modal
// ainda fechado — lista pendente NASCE aqui, substituída do zero) e
// finishSwipePathAddPointWait ("+ Adicionar ponto", modal JÁ aberto — os
// pontos recebidos são ANEXADOS ao final da lista existente, sem
// duplicar renderização/abertura). Diferencia os dois casos pelo modal já
// estar visível ou não, mesmo critério de
// handleTabOrderAccumulatedSelectionResult.
function handleSwipePathAccumulatedSelectionResult(points) {
  const incoming = (Array.isArray(points) ? points : [])
    .filter(p => p && p.nodeId)
    .map(p => ({ nodeId: p.nodeId, nodeName: p.nodeName || '', tempId: _swipePathNextTempId() }));

  const modalEl = document.getElementById('a11y-swipe-path-review-modal');
  const modalAlreadyOpen = modalEl && !modalEl.classList.contains('hidden');
  if (modalAlreadyOpen) {
    // "+ Adicionar ponto": anexa ao final, mantém o resto da lista intacta.
    window._swipePathPendingList = (window._swipePathPendingList || []).concat(incoming);
    _swipePathResetAddPointButton();
    _renderSwipePathPendingList();
    return;
  }

  window._swipePathPendingList = incoming;
  openSwipePathReviewModal();
}
window.handleSwipePathAccumulatedSelectionResult = handleSwipePathAccumulatedSelectionResult;

// Destaca um item da lista PENDENTE no canvas — usa o handler genérico
// highlight-node (code.js) direto com o nodeId real, sem tradução
// clone→original (diferente de Tabulação): Trilha de Swipe sempre opera
// sobre os nós reais do design.
// Bug real corrigido (2026-09-11, print do usuário: clicar num ponto da
// lista sempre levava pro Frame Principal, nunca pra réplica de trabalho
// do Swipe) — usa o handler dedicado highlight-swipe-path-copy-node
// (code.js), que resolve original→clone via _activeSwipePathCloneMaps,
// mesmo padrão já usado por _highlightTabOrderListItem (tab-order.js) e
// pelo wizard de Especificações (highlight-spec-copy-node). O genérico
// highlight-node dispara contra o nodeId ORIGINAL, que nunca foi tocado
// por este fluxo.
function _highlightSwipePathListItem(nodeId) {
  if (!nodeId) return;
  parent.postMessage({ pluginMessage: { type: 'highlight-swipe-path-copy-node', id: nodeId, areaId: window._swipePathPendingAreaId, highlight: true, color: '#0891B2', selectNode: false, shouldScroll: true } }, '*');
}
window._highlightSwipePathListItem = _highlightSwipePathListItem;

// Renderiza a lista PENDENTE dentro do modal de revisão — mesmo padrão
// visual/drag-and-drop de _renderTabOrderPendingList.
function _renderSwipePathPendingList() {
  const containerEl = document.getElementById('a11y-swipe-path-pending-list');
  const emptyEl = document.getElementById('a11y-swipe-path-pending-empty');
  const applyBtn = document.getElementById('btn-swipe-path-apply');
  if (!containerEl) return;

  const items = window._swipePathPendingList || [];
  if (emptyEl) emptyEl.classList.toggle('hidden', items.length > 0);
  if (applyBtn) applyBtn.disabled = items.length < 2;

  containerEl.innerHTML = items.map((it, listIndex) => `
    <li class="list-none flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-dark-surface rounded-dsc-small border border-gray-100 dark:border-dark-line shadow-dsc-elevation-1 cursor-pointer"
      title="Destacar este elemento no canvas"
      draggable="true"
      data-list-index="${listIndex}"
      onclick="_highlightSwipePathListItem('${escapeHtml(it.nodeId)}')"
      ondragstart="_swipePathPendingDragStart(event, ${listIndex})"
      ondragover="_tabOrderDragOver(event)"
      ondrop="_swipePathPendingDrop(event, ${listIndex})"
      ondragend="_tabOrderDragEnd(event)">
      <span class="text-gray-300 dark:text-dark-muted cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar" aria-hidden="true">
        <i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>
      </span>
      <div class="w-6 h-6 rounded-dsc-circ flex items-center justify-center text-dsc-label-tiny normal-case tracking-normal font-extrabold text-white shrink-0" style="background-color:#0891B2">${listIndex + 1}</div>
      <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal text-slate-700 dark:text-white truncate">${escapeHtml(it.nodeName || '')}</p>
      <button type="button" title="Remover da lista" aria-label="Remover da lista"
        onclick="event.stopPropagation(); deleteSwipePathPendingItem('${escapeHtml(it.tempId)}')"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </li>
  `).join('');

  _refreshIcons();
}
window._renderSwipePathPendingList = _renderSwipePathPendingList;

// Lista editável direto na aba Swipe da workspace (2026-09-11, paridade
// pedida pelo usuário com a aba Tabulação) — renderiza no container
// #a11y-swipe-path-tab-list (fora do modal), reaproveitando o MESMO
// estado (window._swipePathPendingList) e a MESMA mecânica de
// arrastar/remover do modal (_swipePathPendingDragStart/Drop,
// deleteSwipePathPendingItem) — só o destino do HTML muda. Diferente do
// modal, aqui NÃO existe botão "Salvar": cada mudança já dispara
// applySwipePathToCanvas() automaticamente (ver os dois pontos marcados
// "auto-save" abaixo), porque não há como editar "em memória, sem
// persistir" quando cada ponto não tem selo próprio no canvas — qualquer
// edição já implica redesenhar a trilha inteira mesmo.
function _renderSwipePathTabList(areaId, targetNodeId) {
  const existingPath = (hacData.a11ySwipePaths || []).find(p => p && p.areaId === areaId);
  const containerEl = document.getElementById('a11y-swipe-path-tab-list');
  if (!containerEl || !existingPath || !Array.isArray(existingPath.points)) return;

  window._swipePathPendingList = existingPath.points.map(p => ({
    nodeId: p.nodeId,
    nodeName: p.nodeName || '',
    tempId: _swipePathNextTempId(),
  }));
  window._swipePathPendingAreaId = areaId;
  window._swipePathPendingTargetNodeId = targetNodeId || null;
  window._swipePathEditingExisting = true;

  containerEl.innerHTML = window._swipePathPendingList.map((it, listIndex) => `
    <li class="list-none flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-dark-surface rounded-dsc-small border border-gray-100 dark:border-dark-line shadow-dsc-elevation-1 cursor-pointer"
      title="Destacar este elemento no canvas"
      draggable="true"
      data-list-index="${listIndex}"
      onclick="_highlightSwipePathListItem('${escapeHtml(it.nodeId)}')"
      ondragstart="_swipePathPendingDragStart(event, ${listIndex})"
      ondragover="_tabOrderDragOver(event)"
      ondrop="_swipePathPendingDrop(event, ${listIndex}, true)"
      ondragend="_tabOrderDragEnd(event)">
      <span class="text-gray-300 dark:text-dark-muted cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar" aria-hidden="true">
        <i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>
      </span>
      <div class="w-6 h-6 rounded-dsc-circ flex items-center justify-center text-dsc-label-tiny normal-case tracking-normal font-extrabold text-white shrink-0" style="background-color:#0891B2">${listIndex + 1}</div>
      <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal text-slate-700 dark:text-white truncate">${escapeHtml(it.nodeName || '')}</p>
      <button type="button" title="Remover da lista" aria-label="Remover da lista"
        onclick="event.stopPropagation(); deleteSwipePathPendingItem('${escapeHtml(it.tempId)}', true)"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </li>
  `).join('');

  _refreshIcons();
}
window._renderSwipePathTabList = _renderSwipePathTabList;

let _swipePathPendingDragIndex = null;

// Reaproveita _tabOrderDragOver/_tabOrderDragEnd (genéricos, já existem) —
// só o dragstart/drop precisam de estado próprio (índice/lista diferentes).
function _swipePathPendingDragStart(ev, listIndex) {
  _swipePathPendingDragIndex = listIndex;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', String(listIndex)); } catch (e) { }
  ev.currentTarget.classList.add('opacity-50');
}
window._swipePathPendingDragStart = _swipePathPendingDragStart;

// `autoSave` (2026-09-11): true quando chamado a partir da lista da ABA
// (sem modal) — dispara applySwipePathToCanvas() imediatamente após
// reordenar, redesenhando a trilha no canvas sem esperar um botão
// "Salvar" (que só existe dentro do modal). false/omitido preserva o
// comportamento original do modal (só reordena em memória, até o
// designer clicar em "Salvar alterações").
function _swipePathPendingDrop(ev, targetListIndex, autoSave) {
  ev.preventDefault();
  if (window._swipePathLocked) return; // trilha já enviada pro backend, aguardando resposta — ver applySwipePathToCanvas
  const sourceListIndex = _swipePathPendingDragIndex;
  if (sourceListIndex === null || sourceListIndex === targetListIndex) return;
  const list = window._swipePathPendingList;
  const [moved] = list.splice(sourceListIndex, 1);
  list.splice(targetListIndex, 0, moved);
  _swipePathPendingDragIndex = null;
  if (autoSave) applySwipePathToCanvas();
  else _renderSwipePathPendingList();
}
window._swipePathPendingDrop = _swipePathPendingDrop;

function deleteSwipePathPendingItem(tempId, autoSave) {
  if (window._swipePathLocked) return; // trilha já enviada pro backend, aguardando resposta — ver applySwipePathToCanvas
  const list = window._swipePathPendingList || [];
  const idx = list.findIndex(it => it.tempId === tempId);
  if (idx === -1) return;
  list.splice(idx, 1);
  // Remover o penúltimo ponto zera a trilha (mínimo de 2 pontos p/ existir
  // uma trilha) — nesse caso, apaga a trilha por completo em vez de tentar
  // redesenhar com 1 ponto só (o que insert-swipe-path/applySwipePathToCanvas
  // já bloqueiam via list.length < 2).
  if (autoSave && list.length < 2) {
    deleteSwipePathForArea(window._swipePathPendingAreaId);
    return;
  }
  if (autoSave) applySwipePathToCanvas();
  else _renderSwipePathPendingList();
}
window.deleteSwipePathPendingItem = deleteSwipePathPendingItem;

// Fecha o modal descartando tudo — nenhum selo/trilha real existe ainda
// nesse ponto (modelo em lote: só desenha ao confirmar), então cancelar só
// precisa parar a escuta e limpar o estado local, sem nenhuma chamada de
// limpeza de canvas (diferente de cancelTabOrderReview, que pode ter uma
// cópia rascunho pra apagar).
function cancelSwipePathReview() {
  _swipePathSetCaptureMode(null);
  // Limpa a cópia rascunho órfã (2026-09-04-ac, mesmo padrão de
  // cancelTabOrderReview/delete-tab-order-draft-copy) — precisa acontecer
  // ANTES de zerar window._swipePathPendingAreaId, senão o backend não
  // sabe qual área limpar. No modo "Editar pontos" a cópia é a mesma
  // clonada quando a trilha foi originalmente criada — apagá-la aqui é
  // seguro: insert-swipe-path (confirmação) sempre recria/reaproveita via
  // _resolveActiveSwipePathClone, então cancelar uma edição nunca deixa a
  // trilha JÁ SALVA em estado inconsistente no canvas (nada foi
  // redesenhado ainda).
  if (window._swipePathPendingAreaId) {
    parent.postMessage({ pluginMessage: { type: 'delete-swipe-path-draft-copy', areaId: window._swipePathPendingAreaId } }, '*');
  }
  window._swipePathPendingList = [];
  window._swipePathPendingAreaId = null;
  window._swipePathPendingTargetNodeId = null;
  window._swipePathLocked = false;
  // Reseta os flags de edição/adição de ponto (2026-09-09) — nunca deve
  // vazar pra próxima vez que o designer abrir o fluxo de criação do zero.
  window._swipePathEditingExisting = false;
  window._swipePathAddPointWaiting = false;
  window._swipePathAddPointWaitingClone = false;
  _swipePathResetAddPointButton();
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
  closeModal('a11y-swipe-path-review-modal');
}
window.cancelSwipePathReview = cancelSwipePathReview;

// "Criar trilha de swipe" — desenha a trilha completa numa ÚNICA operação
// (insert-swipe-path, code.js), diferente do desenho incremental item-a-
// item de Tabulação: aqui é um único grupo Figma cobrindo todos os pontos,
// não um selo por item, então não há necessidade de aguardar N respostas
// sequenciais — só desabilita o botão durante o processamento.
//
// Trava a lista pendente (window._swipePathLocked) enquanto a resposta
// assíncrona de insert-swipe-path está em trânsito — achado real de QA
// (2026-09-04): sem isso, dava pra arrastar/remover um item da lista
// pendente NESSE INTERVALO, e handleSwipePathCreated (abaixo) gravava em
// hacData.a11ySwipePaths uma lista diferente da que o backend de fato
// desenhou no canvas (que já tinha recebido a lista ORIGINAL, do momento
// do clique). _renderSwipePathPendingList/_swipePathPendingDrop/
// deleteSwipePathPendingItem respeitam essa trava.
function applySwipePathToCanvas() {
  const areaId = window._swipePathPendingAreaId;
  const list = window._swipePathPendingList || [];
  if (!areaId || list.length < 2 || window._swipePathLocked) return;

  const applyBtn = document.getElementById('btn-swipe-path-apply');
  const confirmTextEl = document.getElementById('a11y-swipe-path-review-confirm-text');
  if (applyBtn) applyBtn.disabled = true;
  if (confirmTextEl) confirmTextEl.textContent = 'Desenhando trilha…';
  window._swipePathLocked = true;

  parent.postMessage({
    pluginMessage: {
      type: 'insert-swipe-path',
      areaId,
      // targetNodeId (2026-09-04-ac): raiz da Área, usada pelo backend só
      // como fallback pra recriar a cópia clonada caso ela não exista mais
      // em memória (ex.: designer fechou/reabriu o plugin no meio do
      // fluxo) — ver _resolveActiveSwipePathClone em code.js.
      targetNodeId: window._swipePathPendingTargetNodeId || null,
      points: list.map(it => ({ nodeId: it.nodeId, nodeName: it.nodeName })),
      sectionName: getA11yActiveSectionName(),
      designerName: getA11yDesignerName(),
      designerId: getA11yDesignerId(),
    },
  }, '*');
}
window.applySwipePathToCanvas = applySwipePathToCanvas;

// Resposta de 'swipe-path-created' (messages.js) — a trilha foi desenhada
// com sucesso no canvas; agora sim persiste em hacData.a11ySwipePaths,
// substituindo (nunca somando) qualquer trilha anterior desta área. Backend
// só remove a trilha antiga do canvas DEPOIS de confirmar que a nova foi
// desenhada (ver insert-swipe-path, code.js) — aqui espelhamos a mesma
// ordem: só sobrescrevemos o dado quando esta resposta de SUCESSO chega.
//
// Usa msg.points (ecoado pelo backend, exatamente o payload que foi
// desenhado) — NUNCA relê window._swipePathPendingList aqui: a trava em
// applySwipePathToCanvas já impede mutação durante o trânsito, mas usar o
// valor ecoado é a garantia definitiva de que o dado persistido bate 1:1
// com o que está no canvas, mesmo que a trava falhe por algum motivo.
function handleSwipePathCreated(msg) {
  if (!msg || !msg.areaId) return;
  hacData.a11ySwipePaths = (hacData.a11ySwipePaths || []).filter(p => p && p.areaId !== msg.areaId);
  hacData.a11ySwipePaths.push({
    id: msg.pathNodeId || null,
    points: Array.isArray(msg.points) ? msg.points : [],
    areaId: msg.areaId,
    createdAt: Date.now(),
  });
  window._swipePathLocked = false;
  saveToStorage();
  if (window._toastSaved) _toastSaved();
  showToast(window._swipePathEditingExisting ? 'Trilha de swipe atualizada.' : 'Trilha de swipe criada.');

  _swipePathSetCaptureMode(null);
  window._swipePathPendingList = [];
  window._swipePathPendingAreaId = null;
  window._swipePathPendingTargetNodeId = null;
  // Reseta os flags de edição/adição de ponto (2026-09-09) — nunca deve
  // vazar pra próxima vez que o designer abrir o fluxo de criação do zero.
  window._swipePathEditingExisting = false;
  window._swipePathAddPointWaiting = false;
  window._swipePathAddPointWaitingClone = false;
  _swipePathResetAddPointButton();
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
  closeModal('a11y-swipe-path-review-modal');

  if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();
  renderA11yGroupedList();
}
window.handleSwipePathCreated = handleSwipePathCreated;

// Resposta de falha — a lista pendente e a escuta continuam ativas (o
// designer não perde o trabalho de captura já feito), só reabilita o
// botão pra tentar de novo. Restaura o texto correto do botão de
// confirmar conforme o modo (criação/"Refazer" vs. edição) em vez de
// assumir sempre "Criar trilha de swipe" (2026-09-09).
function handleSwipePathCreateFailed(msg) {
  window._swipePathLocked = false;
  const applyBtn = document.getElementById('btn-swipe-path-apply');
  const confirmTextEl = document.getElementById('a11y-swipe-path-review-confirm-text');
  if (applyBtn) applyBtn.disabled = (window._swipePathPendingList || []).length < 2;
  if (confirmTextEl) confirmTextEl.textContent = window._swipePathEditingExisting ? 'Salvar alterações' : 'Criar trilha de swipe';
  showToast(msg && msg.reason ? msg.reason : 'Não foi possível criar a trilha de swipe.', 'error');
}
window.handleSwipePathCreateFailed = handleSwipePathCreateFailed;

// Botão "Remover trilha" da tab Swipe (fora do modal, no card da área já
// com trilha existente).
function deleteSwipePathForArea(areaId) {
  if (!areaId) return;
  const existing = (hacData.a11ySwipePaths || []).find(p => p && p.areaId === areaId);
  if (existing && existing.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: existing.id } }, '*');
  }
  hacData.a11ySwipePaths = (hacData.a11ySwipePaths || []).filter(p => p && p.areaId !== areaId);
  saveToStorage();
  showToast('Trilha de swipe removida.');
  if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();
  renderA11yGroupedList();
}
window.deleteSwipePathForArea = deleteSwipePathForArea;

// Resposta de 'swipe-path-cleaned-up' (messages.js) — disparada pela
// cascata de exclusão de área (ver deleteA11yArea acima). No máximo 1
// trilha por área, então basta filtrar pela areaId excluída.
function handleSwipePathCleanedUp(msg) {
  if (!msg || !msg.areaId) return;
  const before = (hacData.a11ySwipePaths || []).length;
  hacData.a11ySwipePaths = (hacData.a11ySwipePaths || []).filter(p => p && p.areaId !== msg.areaId);
  if (hacData.a11ySwipePaths.length !== before) {
    saveToStorage();
    if (typeof _renderA11yWorkspaceTab === 'function') _renderA11yWorkspaceTab();
    renderA11yGroupedList();
  }
}
window.handleSwipePathCleanedUp = handleSwipePathCleanedUp;
