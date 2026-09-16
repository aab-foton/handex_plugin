// Módulo extraído de accessibility.js (2026-09-09) — Ordem de Tabulação.
// Depende globalmente (sem import — script único concatenado por build.cjs) de:
// showToast, openModal, closeModal, escapeHtml, _refreshIcons, saveToStorage,
// renderA11yGroupedList, getA11yActiveSectionName, getA11yDesignerName,
// ensureA11yProjectOriginThen, _findA11yAreaById, _allA11yAreas, focusNode,
// _a11yCaptureMiniBarUpdateCount/_a11yCaptureMiniBarExit,
// A11Y_NARRATION_TYPE_LABELS/_EN, tabOrderItems (core.js) — todos definidos em
// outros módulos do bundle. Também referencia cancelSwipePathReview() e
// window._swipePathCaptureMode (swipe-path.js), concatenado logo em seguida.

function toggleA11yTabOrderAccordion(uid) {
  const body = document.getElementById(`tab-order-body-${uid}`);
  const chevron = document.getElementById(`tab-order-chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (isHidden) window._a11yExpandedTabOrderIds.add(uid);
  else window._a11yExpandedTabOrderIds.delete(uid);
}
window.toggleA11yTabOrderAccordion = toggleA11yTabOrderAccordion;

// Markup da seção "Ordem de Tabulação" dentro do accordion de UMA área —
// reaproveitado tanto por _a11yAreaAccordionEl (área real, com botões de
// criação) quanto por _a11ySemAreaAccordionEl (bucket "Sem área", read-only,
// sem botões — não há área real pra escopar clique manual ou varredura de
// camadas). O <ul> nasce vazio (id previsível ulId) e é preenchido depois,
// no DOM já inserido, por _renderTabOrderListForArea (ver chamada em
// renderA11yGroupedList).
function _tabOrderSectionHtml(uid, area) {
  const ulId = `tab-order-list-${uid}`;
  const readOnly = !area;
  const areaIdAttr = area ? area.id : '__sem_area__';
  const expand = window._a11yExpandedTabOrderIds.has(uid);
  const chevronStyle = expand ? 'rotate(180deg)' : 'rotate(0deg)';
  const bodyHiddenClass = expand ? '' : 'hidden';

  if (readOnly) {
    return `
      <div class="rounded-dsc-small border border-gray-100 dark:border-dark-line overflow-hidden ml-1">
        <div class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none bg-gray-50/60 dark:bg-dark-bg/30 hover:bg-gray-100/60 dark:hover:bg-dark-line/20 transition-colors"
          onclick="toggleA11yTabOrderAccordion('${uid}')">
          <div class="w-4.5 h-4.5 rounded-dsc-circ flex items-center justify-center shrink-0 bg-gray-100 dark:bg-dark-line/40">
            <i data-lucide="list-ordered" class="w-2.5 h-2.5 text-gray-400"></i>
          </div>
          <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal font-bold text-slate-500 dark:text-dark-muted truncate">Ordem de Tabulação</p>
          <i data-lucide="chevron-down" id="tab-order-chevron-${uid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0" style="transform:${chevronStyle}"></i>
        </div>
        <div id="tab-order-body-${uid}" class="accordion-content ${bodyHiddenClass} border-t border-gray-50 dark:border-dark-line p-1.5">
          <ul id="${ulId}" class="flex flex-col gap-1.5 min-h-[10px]"></ul>
        </div>
      </div>
    `;
  }

  return `
    <div class="rounded-dsc-small border border-gray-100 dark:border-dark-line overflow-hidden ml-1">
      <div class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none bg-gray-50/60 dark:bg-dark-bg/30 hover:bg-gray-100/60 dark:hover:bg-dark-line/20 transition-colors"
        onclick="toggleA11yTabOrderAccordion('${uid}')">
        <div class="w-4.5 h-4.5 rounded-dsc-circ flex items-center justify-center shrink-0" style="background-color:#E0F5FA">
          <i data-lucide="list-ordered" class="w-2.5 h-2.5" style="color:#0891B2"></i>
        </div>
        <p class="flex-1 min-w-0 text-dsc-label-tiny font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide truncate">Ordem de Tabulação</p>
        <i data-lucide="chevron-down" id="tab-order-chevron-${uid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0" style="transform:${chevronStyle}"></i>
      </div>
      <div id="tab-order-body-${uid}" class="accordion-content ${bodyHiddenClass} border-t border-gray-50 dark:border-dark-line p-1.5 space-y-1.5">
        <!-- Os 2 botões abaixo não desenham nada diretamente no canvas de
             trabalho: ambos abrem o MESMO modal de revisão
             (#a11y-tab-order-review-modal), que monta a lista pendente
             (modo em lote, 2026-09-04-e — desenha só ao confirmar).
             Hierarquia visual (2026-09-04-e, pedido explícito): Manual é o
             caminho PRIMÁRIO (botão preenchido) — o automático vira um
             link secundário abaixo, de propósito, pra que o designer
             aprenda o fluxo manual primeiro. Renomeado de "Gerar
             Automaticamente" pra "Mapeamento Automático" (mesmo motivo da
             correção em "Mapeamento Automatizado" — não é geração final,
             o resultado ainda passa por revisão). -->
        <button type="button" onclick="event.stopPropagation(); openA11yInstructionThenStart('tabulacao', '${escapeHtml(areaIdAttr)}', '${escapeHtml(area.targetNodeId || '')}')"
          class="w-full flex items-center justify-center gap-2 h-8 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold transition-all bg-[#0891B2] text-white hover:bg-cyan-700 active:scale-[0.99] shadow-sm shadow-cyan-500/20">
          <i data-lucide="list-ordered" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Iniciar Ordem de Tabulação
        </button>
        ${(typeof _currentTabOrderItems === 'function' && _currentTabOrderItems(area.id).length > 0) ? '' : `
        <button type="button" onclick="event.stopPropagation(); _confirmGenerateTabOrderFromLayers('${escapeHtml(areaIdAttr)}', '${escapeHtml(area.targetNodeId || '')}')"
          class="w-full flex items-center justify-center gap-1.5 h-6 mt-0.5 rounded-dsc-small text-dsc-label-tiny normal-case tracking-normal font-bold text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:scale-[0.99] transition-all">
          <i data-lucide="sparkles" class="w-3 h-3" aria-hidden="true"></i>
          ou usar Mapeamento Automático
        </button>`}
        <!-- Lista abaixo mostra os itens JÁ APLICADOS no canvas (na cópia do
             frame) nesta área, se houver uma cópia gerada anteriormente —
             não a lista pendente (essa vive só dentro do modal enquanto não
             aplicada). -->
        <ul id="${ulId}" class="flex flex-col gap-1.5 min-h-[10px]"></ul>
        <button type="button" onclick="event.stopPropagation(); updateTabOrderNumbering('${escapeHtml(areaIdAttr)}')"
          class="w-full flex items-center justify-center gap-2 h-7 mt-1 rounded-dsc-large text-dsc-label-tiny normal-case tracking-normal font-bold border border-gray-200 dark:border-dark-line text-slate-600 dark:text-dark-muted hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-slate-300 transition-all">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Atualizar
        </button>
      </div>
    </div>
  `;
}
// ── Ordem de Tabulação ───────────────────────────────────────────────────
// Ferramenta SEPARADA de "Especificação para Leitor de Tela" (Áreas
// Marcadas acima) — documenta a sequência de foco do teclado (tecla Tab),
// não uma marcação de seção/região. Usa o componente real "[a11y] Item
// Number" (family "handoff"), não o "[a11y] Conectores" usado por Marcar
// Área.
//
// Escopo por área: cada Área Marcada tem sua própria sequência 1,2,3... —
// os itens continuam numa lista solta só (tabOrderItems, mesma estrutura de
// sempre), só ganharam o campo a11yAreaId. "Reiniciar por área" é sempre
// uma questão de FILTRAR por a11yAreaId ao calcular o próximo número e ao
// exibir/reordenar — nunca de reestruturar o array em sub-arrays. Itens
// legados sem a11yAreaId caem no bucket "Sem área" (mesmo padrão visual do
// bucket de specs órfãs, _a11ySemAreaAccordionEl acima), só como vitrine
// read-only.
//
// Arquitetura: nenhum selo é desenhado sobre os elementos de trabalho
// reais — sempre sobre uma CÓPIA do frame da área (criada por start-tab-
// order-copy/generate-tab-order-from-layers, code.js). Clique manual e
// varredura automática POPULAM uma LISTA PENDENTE em memória
// (window._tabOrderPendingList), revisável no modal
// #a11y-tab-order-review-modal, e cada item já dispara o desenho do seu
// selo REAL na cópia assim que entra na lista (draw-tab-order-badge,
// code.js) — incremental, nunca em lote. Remover um item da lista apaga o
// selo real correspondente (delete-node); reordenar por drag-and-drop
// renumera os selos reais existentes (renumber-tab-order-items) — nunca
// recria nada. "Concluir" (applyTabOrderToCanvas) não desenha mais nada:
// só persiste os itens (já com id real de canvas) em tabOrderItems e fecha
// o modal.
//
// Decisão de UX: o modal de revisão fica aberto durante TODO o fluxo
// manual, não só ao final — abrir o modal já no início do clique
// sequencial dá feedback "ao vivo" da lista sendo montada. "+ Adicionar
// item" (usado só no automático, mas disponível nos dois) reaproveita
// exatamente o mesmo mecanismo de captura de clique que o manual já usa
// por baixo — só muda se o modo fica "sempre ouvindo" (manual) ou "ouve um
// clique e para" (adicionar item avulso).
window._tabOrderPendingList = [];
window._tabOrderPendingAreaId = null;
window._tabOrderPendingTargetNodeId = null;
// 'continuous' (fluxo manual, ouve toda seleção enquanto o modal estiver
// aberto) | 'single' (aguardando exatamente 1 clique via "+ Adicionar item")
// | null (parado). core.js guarda contra navegação/troca de view enquanto
// esta flag está ativa, chamando cancelTabOrderReview() automaticamente.
window._tabOrderCaptureMode = null;
let _tabOrderTempIdSeq = 1;

function _tabOrderNextTempId() {
  return `tmp-${_tabOrderTempIdSeq++}`;
}

// Ativado pelo botão "Iniciar Ordem de Tabulação" — reinicia a lista
// pendente (fluxo novo, nunca acumula com uma sessão anterior não aplicada)
// e dispara 'start-tab-order-copy': o backend clona o frame da área
// IMEDIATAMENTE (cópia vazia, sem selos ainda), pra que o frame ORIGINAL
// fique 100% intocado durante todo o fluxo manual (o highlight temporário
// de cada clique passa a ser desenhado sobre o node equivalente dentro da
// cópia, nunca mais no original). Resposta tratada em
// handleTabOrderCopyStarted (messages.js → aqui).
//
// Dica de Shift+clique por feature — incorporada como ÚLTIMO passo do bloco
// de instrução rico (ver _renderA11yInstructionContent abaixo). 'tabulacao'
// preserva o texto original (2026-09-10); 'swipe' adicionado em 2026-09-14
// (pedido do usuário: "coloque o toast sobre o Shift também no swipe" —
// Swipe nunca teve esta dica, só Tabulação).
const A11Y_SHIFT_HINT_STEP_BY_FEATURE = {
  // "Errou a ordem? Sem problema" removido (2026-09-16, pedido do usuário):
  // dava a entender que dá pra reordenar durante a própria captura, mas o
  // arrastar-para-reposicionar só existe DEPOIS de concluir a seleção, na
  // lista de revisão — texto reescrito pra descrever o fluxo real em vez de
  // sugerir uma correção "no ato".
  tabulacao: 'Sugestão de uso: <strong>segure Shift e clique</strong> em cada elemento, na ordem em que o teclado deve navegar por eles. Ao concluir a seleção, você pode <strong>arrastar para reposicionar</strong> os itens na lista de revisão.',
  swipe: 'Sugestão de uso: <strong>segure Shift e clique</strong> em cada ponto, na ordem em que o gesto de swipe deve passar por eles. Ao concluir a seleção, você pode <strong>arrastar para reposicionar</strong> os pontos na lista de revisão.',
};

function startTabOrderManualMode(areaId, targetNodeId) {
  if (!areaId || !targetNodeId) {
    // Diagnóstico (2026-09-16): se este toast aparece logo depois de
    // "Entendi, começar seleção", areaId/targetNodeId chegaram vazios ao
    // callback armado por openA11yInstructionThenStart — não é falha do
    // modal em si, é a Área de origem sem targetNodeId resolvido.
    console.warn('[hac] startTabOrderManualMode: areaId ou targetNodeId ausente.', { areaId, targetNodeId });
    showToast('Selecione uma tela antes de iniciar a ordem de tabulação.');
    return;
  }
  _startTabOrderManualModeInner(areaId, targetNodeId);
}
window.startTabOrderManualMode = startTabOrderManualMode;

// Monta o HTML dos passos numerados do template oficial de Handoff
// (FICHA_INSTRUCTION_CONTENT_UI, refs/ficha-instruction-content.json —
// mesmo texto já usado na coluna de legenda da Ficha final), acrescentando
// a dica de Shift+clique como último passo pra tabulacao/swipe
// (A11Y_SHIFT_HINT_STEP_BY_FEATURE — o template oficial descreve "como
// preencher a Ficha depois de pronta", não o gesto de captura no plugin em
// si, que continua precisando ser explicado à parte). Usado tanto pelo
// bloco de instrução da barra de captura (core.js,
// _a11yCaptureBarRenderInstructions) quanto pelo modal do Leitor de Tela
// (accessibility.js, openA11yCategoryPickerModal) — cada um passa os
// próprios ids de elemento (`ids`), o conteúdo/lógica é o mesmo.
//
// `reduced` (2026-09-16, pedido do usuário): DEPOIS que a captura já
// começou, a barra mini mostra só a dica prática de interação (Shift+clique/
// arrastar) — sem repetir a introdução institucional completa nem os passos
// formais do template, que já foram vistos na modal ANTES de iniciar
// (openA11yInstructionThenStart). Esconde os cards de
// instructionsHeading/Body e o heading "Como fazer", deixando só uma linha
// de texto com a dica de A11Y_SHIFT_HINT_STEP_BY_FEATURE dentro do bloco de
// steps. Não se aplica ao Leitor de Tela (chamado sempre com reduced=false/
// omitido) nem ao modal pré-captura, que continuam com o conteúdo completo.
function _renderA11yInstructionContent(feature, ids, reduced) {
  const content = (typeof FICHA_INSTRUCTION_CONTENT_UI !== 'undefined') ? FICHA_INSTRUCTION_CONTENT_UI[feature] : null;
  if (!content) return false;
  const titleEl = document.getElementById(ids.title);
  if (titleEl) titleEl.textContent = content.title || '';

  const instrBlockEl = ids.instructionsBlock ? document.getElementById(ids.instructionsBlock) : null;
  if (instrBlockEl) instrBlockEl.classList.toggle('hidden', !!reduced);
  const instrHeadingEl = document.getElementById(ids.instructionsHeading);
  if (instrHeadingEl) instrHeadingEl.textContent = content.instructionsHeading || 'Instruções sobre a documentação';
  const instrBodyEl = document.getElementById(ids.instructionsBody);
  if (instrBodyEl) instrBodyEl.textContent = content.instructionsBody || '';

  const stepsHeadingEl = document.getElementById(ids.stepsHeading);
  const stepsEl = document.getElementById(ids.steps);
  const shiftStep = A11Y_SHIFT_HINT_STEP_BY_FEATURE[feature];

  if (reduced) {
    // Versão reduzida: só a dica prática, sem heading "Como fazer" nem lista
    // numerada — um parágrafo simples, coerente com o espaço curto da barra.
    if (stepsHeadingEl) stepsHeadingEl.classList.add('hidden');
    if (stepsEl) {
      stepsEl.classList.remove('list-decimal', 'list-inside');
      stepsEl.innerHTML = shiftStep ? `<li class="list-none">${shiftStep}</li>` : '';
    }
    const stepsBlockEl = ids.stepsBlock ? document.getElementById(ids.stepsBlock) : null;
    if (stepsBlockEl) stepsBlockEl.classList.toggle('hidden', !shiftStep);
    return true;
  }

  if (stepsHeadingEl) {
    stepsHeadingEl.classList.remove('hidden');
    stepsHeadingEl.textContent = content.stepsHeading || 'Como fazer';
  }
  // Dica de Shift+clique só é injetada quando o JSON já tem steps reais
  // (ex.: Leitor de Tela) — pra Tabulação/Swipe, hoje com steps=[] porque o
  // parágrafo único de instructionsBody já cobre o gesto de captura
  // (2026-09-16, pedido do usuário: bloco "Como fazer" ficava repetindo a
  // mesma dica que já aparecia acima, mesmo sem nenhum step real no JSON —
  // antes essa dica era sempre anexada incondicionalmente).
  const hasRealSteps = Array.isArray(content.steps) && content.steps.length > 0;
  const finalShiftStep = hasRealSteps ? shiftStep : null;
  const steps = [...(content.steps || [])];
  if (finalShiftStep) steps.push(finalShiftStep);
  if (stepsEl) {
    stepsEl.classList.add('list-decimal', 'list-inside');
    stepsEl.innerHTML = steps.map(s => {
      const boldMatch = /^([^:]{1,80}):\s*(.*)$/s.exec(s);
      return boldMatch
        ? `<li><strong>${escapeHtml(boldMatch[1])}:</strong> ${boldMatch[2].includes('<') ? boldMatch[2] : escapeHtml(boldMatch[2])}</li>`
        : `<li>${s.includes('<') ? s : escapeHtml(s)}</li>`;
    }).join('');
  }
  const stepsBlockEl = ids.stepsBlock ? document.getElementById(ids.stepsBlock) : null;
  if (stepsBlockEl) stepsBlockEl.classList.toggle('hidden', steps.length === 0);
  return true;
}

// ids do modal — usado pelo Leitor de Tela (openA11yCategoryPickerModal,
// accessibility.js) e, desde 2026-09-16, também por Tabulação/Swipe ANTES
// de iniciar a captura (openA11yInstructionThenStart abaixo). As instruções
// continuam visíveis também dentro da própria barra de captura depois que
// ela já começou (#a11y-capture-bar-instructions, core.js) — este modal
// cobre o momento anterior ao clique em "Iniciar", que a barra (que só
// nasce depois da cópia de trabalho criada) não cobre.
const A11Y_INSTRUCTION_MODAL_IDS = {
  title: 'a11y-instruction-modal-title-text',
  instructionsBlock: 'a11y-instruction-modal-instructions-block',
  instructionsHeading: 'a11y-instruction-modal-instructions-heading',
  instructionsBody: 'a11y-instruction-modal-instructions-body',
  stepsHeading: 'a11y-instruction-modal-steps-heading',
  steps: 'a11y-instruction-modal-steps',
  stepsBlock: 'a11y-instruction-modal-steps-block',
};

// Modal PRÉ-captura: sempre conteúdo COMPLETO (introdução + passos do
// template), nas 3 features. A versão REDUZIDA (só "Sugestão de uso") é
// exclusiva da barra mini de captura, DEPOIS que a captura já começou
// (2026-09-16, pedido do usuário — tentativa anterior de aplicar reduced
// aqui no modal estava errada e foi revertida: "aqui é pra ela ficar como
// estava antes... a sugestão de uso é apenas quando está sendo criada a
// ordem"). Ver _a11yCaptureBarRenderInstructions (core.js).
function _renderA11yInstructionModal(feature) {
  return _renderA11yInstructionContent(feature, A11Y_INSTRUCTION_MODAL_IDS);
}

// Reabertura manual da instrução (ícone "?" no header do modal de REVISÃO,
// pós-captura) — abre o MODAL (não o bloco embutido da barra, que seria
// redundante já que a barra já está visível nesse momento, quando
// aplicável). Puramente informativa, nunca inicia/reinicia o fluxo de
// captura — não seta callback nenhum. feature ∈ 'tabulacao' | 'swipe'.
function openA11yInstructionManually(feature) {
  if (!_renderA11yInstructionModal(feature || 'tabulacao')) return;
  window._pendingA11yInstructionConfirm = null;
  // Sem callback pendente aqui (puramente informativa) — garante que o
  // texto do botão não fique preso em "Entendi, adicionar itens" de uma
  // abertura anterior via openA11yInstructionThenStart (2026-09-16-b).
  const continueBtn = document.getElementById('btn-a11y-instruction-modal-continue');
  if (continueBtn) continueBtn.textContent = 'Entendi, começar seleção';
  openModal('a11y-instruction-modal');
  if (typeof _refreshIcons === 'function') _refreshIcons();
}
window.openA11yInstructionManually = openA11yInstructionManually;

// Abertura ANTES de iniciar a captura (botões "Iniciar Ordem de
// Tabulação"/"Iniciar trilha de ordem de leitura"/"Refazer trilha de ordem
// de leitura", 2026-09-16, bug real reportado pelo usuário: "clicar Entendi
// começar seleção deve ser como se tivesse clicado em Iniciar — vale pro
// swipe e pro leitor de tela também"). Diferente de
// openA11yInstructionManually acima: SETA window._pendingA11yInstructionConfirm
// com a função de início real (mesma chamada que o botão "Iniciar" faria
// direto), então o botão "Entendi, começar seleção" do modal
// (_confirmA11yInstructionModal) de fato dispara a captura — mesmo
// mecanismo já usado pelo Leitor de Tela (openA11yCategoryPickerModal,
// accessibility.js), agora também para Tabulação/Swipe. feature ∈
// 'tabulacao' | 'swipe'.
//
// Refinamento 2026-09-16-b (pedido do usuário): quando a Área já tem
// conteúdo documentado para a feature (itens de Ordem de Tabulação ou
// pontos de Trilha de Swipe já salvos), esta modal NÃO pode recomeçar do
// zero ao confirmar — precisa continuar a partir do que já existe, mesmo
// caminho que os botões "Adicionar itens"/"Adicionar ponto" já usam fora
// da modal (_a11yWorkspaceTabTabulacao/_a11yWorkspaceTabSwipe,
// accessibility.js). Detecta isso ANTES de decidir o callback e troca
// também o texto do botão de confirmação, pra não sugerir "início" quando
// na verdade vai só somar aos itens existentes.
function openA11yInstructionThenStart(feature, areaId, targetNodeId) {
  if (!_renderA11yInstructionModal(feature)) {
    // Falha silenciosa real possível: FICHA_INSTRUCTION_CONTENT_UI[feature]
    // não existe/veio vazio no bundle carregado (ex.: build desatualizado
    // ou chave de feature errada). Sem este log, o clique no botão
    // "Iniciar..." simplesmente não fazia nada visível — diagnóstico já
    // reportado 2026-09-16.
    console.warn('[hac] openA11yInstructionThenStart: _renderA11yInstructionModal retornou false para feature=', feature, '— modal não será aberto, captura não iniciará.');
    return;
  }

  const hasExisting = feature === 'swipe'
    ? !!(hacData.a11ySwipePaths || []).find(p => p && p.areaId === areaId && Array.isArray(p.points) && p.points.length > 0)
    : (typeof _currentTabOrderItems === 'function' && _currentTabOrderItems(areaId).length > 0);

  window._pendingA11yInstructionConfirm = hasExisting
    ? (feature === 'swipe'
      ? () => openSwipePathEditMode(areaId, targetNodeId)
      : () => startTabOrderAddItemsFromCard(areaId))
    : (feature === 'swipe'
      ? () => startSwipePathManualMode(areaId, targetNodeId)
      : () => startTabOrderManualMode(areaId, targetNodeId));

  const continueBtn = document.getElementById('btn-a11y-instruction-modal-continue');
  if (continueBtn) continueBtn.textContent = hasExisting ? 'Entendi, adicionar itens' : 'Entendi, começar seleção';

  openModal('a11y-instruction-modal');
  if (typeof _refreshIcons === 'function') _refreshIcons();
}
window.openA11yInstructionThenStart = openA11yInstructionThenStart;

// Botão "Entendi, começar seleção" do modal — fecha e, se havia um
// callback pendente (window._pendingA11yInstructionConfirm, setado por
// openA11yInstructionThenStart pra Tabulação/Swipe, ou por
// openA11yCategoryPickerModal/accessibility.js pro Leitor de Tela),
// executa-o. Reabertura manual (openA11yInstructionManually acima) nunca
// seta esse callback, então aqui só fecha o modal nesse caso — é
// puramente informativa, não reinicia nada.
function _confirmA11yInstructionModal() {
  closeModal('a11y-instruction-modal');
  const onConfirm = window._pendingA11yInstructionConfirm;
  window._pendingA11yInstructionConfirm = null;
  if (typeof onConfirm === 'function') {
    onConfirm();
  } else {
    // Diagnóstico (2026-09-16): se este modal foi aberto por
    // openA11yInstructionThenStart, sempre deve haver um callback pendente
    // aqui — cair neste ramo com feature=tabulacao/swipe indica que o
    // callback foi perdido/zerado por outro caminho entre a abertura e a
    // confirmação (ex.: outra chamada a openA11yInstructionManually, que
    // seta null, disparada por engano no meio do fluxo).
    console.warn('[hac] _confirmA11yInstructionModal: nenhum callback pendente ao confirmar — modal fechado sem iniciar nenhuma captura.');
  }
}
window._confirmA11yInstructionModal = _confirmA11yInstructionModal;

// Botão "X"/clique no backdrop — fecha SEM executar nenhum callback
// pendente (2026-09-16, bug real corrigido: antes os dois usavam o mesmo
// onclick de "Entendi", então fechar a modal por engano disparava a mesma
// ação de confirmar — iniciar captura do zero ou adicionar itens). Zera
// window._pendingA11yInstructionConfirm sem chamá-lo, pra também não
// vazar pro próximo openModal('a11y-instruction-modal').
function _cancelA11yInstructionModal() {
  closeModal('a11y-instruction-modal');
  window._pendingA11yInstructionConfirm = null;
}
window._cancelA11yInstructionModal = _cancelA11yInstructionModal;
// Alias retrocompatível — o link "Como funciona a seleção?" do modal de
// revisão da Ordem de Tabulação (modals.html) já chama este nome.
window.openTabOrderShiftHintManually = function () { openA11yInstructionManually('tabulacao'); };

// Corpo real do fluxo manual — extraído de startTabOrderManualMode
// (2026-09-10) pra poder ser chamado tanto direto (dica já vista) quanto
// depois de fechar a dica educativa (1ª vez no arquivo).
function _startTabOrderManualModeInner(areaId, targetNodeId) {
  // Exclusividade mútua com Trilha de Swipe (2026-09-04-ad, bug real
  // corrigido): os dois modos de captura podiam ficar ativos ao mesmo
  // tempo se o designer trocasse de tab sem cancelar/confirmar — como
  // cada um clona e foca sua PRÓPRIA cópia da Área, clicar no canvas
  // nesse estado clicava sobre a cópia que estava fisicamente em foco
  // (a do modo iniciado por último), fazendo selos de Tabulação nascerem
  // dentro da Section de Swipe (ou vice-versa). Cancela a captura de
  // Swipe em andamento, se houver, antes de iniciar esta.
  if (window._swipePathCaptureMode && typeof cancelSwipePathReview === 'function') {
    cancelSwipePathReview();
    showToast('A captura de Trilha de Swipe em andamento foi cancelada.');
  }
  ensureA11yProjectOriginThen((origin) => {
    window._tabOrderDeclaredOrigin = origin;
    window._tabOrderPendingList = [];
    window._tabOrderPendingAreaId = areaId;
    window._tabOrderPendingTargetNodeId = targetNodeId;
    window._tabOrderActiveCloneId = null;
    window._tabOrderActiveCloneNodeMap = null;
    // Loading de canvas (2026-09-14, pedido do usuário com print real: a
    // barra mini de captura ("0 itens marcados") aparecia IMEDIATAMENTE ao
    // clicar, antes da cópia de trabalho terminar de ser clonada no
    // backend — em telas grandes/complexas isso dava a impressão de que o
    // designer já podia clicar no canvas quando na verdade a réplica ainda
    // não existia. Agora mostra o loading primeiro; a barra mini de
    // captura (_a11yCaptureMiniBarEnter, mais o toast de instrução) só
    // entra quando 'tab-order-copy-started' confirma que a cópia terminou
    // — ver handleTabOrderCopyStarted abaixo.
    if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading('Criando cópia de trabalho da tela…');
    window._tabOrderCopyStartPending = true;
    parent.postMessage({ pluginMessage: { type: 'start-tab-order-copy', areaId, targetNodeId, sectionName: getA11yActiveSectionName(), designerName: getA11yDesignerName(), designerId: getA11yDesignerId() } }, '*');
  });
}

// Resposta de 'tab-order-copy-started' (messages.js) — guarda o id da cópia
// rascunho e o mapa original→clone (objeto plano {nodeId-original:
// nodeId-do-clone}) pra uso local (diagnóstico/eventual necessidade futura
// do front); o BACKEND também guarda o mapa completo em memória — é ele
// quem de fato resolve original→clone a cada highlight, o front só precisa
// saber que a cópia existe.
function handleTabOrderCopyStarted(cloneId, nodeMap) {
  window._tabOrderActiveCloneId = cloneId || null;
  window._tabOrderActiveCloneNodeMap = nodeMap || null;

  // Fecha o loading de canvas e SÓ AGORA entra na barra mini de captura —
  // ver comentário completo em _startTabOrderManualModeInner (2026-09-14).
  // window._tabOrderCopyStartPending distingue esta resposta (do fluxo
  // "Iniciar Ordem de Tabulação") de qualquer outro uso futuro do mesmo
  // cloneId/nodeMap que não deva reabrir a barra mini.
  if (window._tabOrderCopyStartPending) {
    window._tabOrderCopyStartPending = false;
    if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
    if (!cloneId) {
      showToast('Não foi possível criar a cópia de trabalho. Tente novamente.', 'error');
      return;
    }
    if (typeof _a11yCaptureMiniBarEnter === 'function') _a11yCaptureMiniBarEnter('tabOrder');
    _tabOrderSetCaptureMode('continuous');
    showToast('Cópia da tela criada. Siga as instruções acima e clique nos elementos dela (segure shift, ou use marquise, pra marcar vários de uma vez).');
  }
}
window.handleTabOrderCopyStarted = handleTabOrderCopyStarted;

// Botão "Concluir seleção" da barra de captura minimizada (chamado por
// _a11yCaptureMiniBarFinish, core.js) — a janela já voltou ao tamanho
// normal quando isto roda. Pede ao backend tudo que foi acumulado em
// silêncio durante a captura (get-tab-order-accumulated-selection,
// 2026-09-04-aa); a resposta (tab-order-accumulated-selection-result,
// tratada por handleTabOrderAccumulatedSelectionResult) é quem de fato
// popula a lista pendente e abre o modal — resolver/ordenar um punhado de
// nós já em memória do Figma é síncrono o bastante pra não precisar de
// nenhum estado de "carregando" aqui. A escuta de seleção continua ativa
// depois disso — o designer ainda pode clicar no canvas com o modal já
// aberto (cada clique volta a acumular, mesma lógica de sempre); só não
// há mais push automático pra dentro da lista já renderizada — reabrir o
// modal ("Refazer") é quem lê o acumulado de novo.
function finishTabOrderCapture() {
  parent.postMessage({ pluginMessage: { type: 'get-tab-order-accumulated-selection' } }, '*');
}
window.finishTabOrderCapture = finishTabOrderCapture;

// Abre o modal de revisão vazio/pré-populado — chamado tanto pelo início do
// fluxo manual quanto pela chegada do resultado da varredura automática
// (addTabOrderItemsFromLayers). Idempotente: reabrir com o modal já aberto
// só re-renderiza a lista.
function openTabOrderReviewModal() {
  openModal('a11y-tab-order-review-modal');
  _renderTabOrderPendingList();
}
window.openTabOrderReviewModal = openTabOrderReviewModal;

// Liga/desliga a escuta de seleção do canvas no backend (start-tab-order-mode/
// stop-tab-order-mode) — o backend acumula em silêncio (2026-09-04-aa)
// enquanto ligado, independente de qualquer noção de "modo"; a única
// distinção que sobrou no frontend é on/off (window._tabOrderCaptureMode
// truthy ou null), não mais 'single' vs 'continuous'.
function _tabOrderSetCaptureMode(mode) {
  const wasOff = !window._tabOrderCaptureMode;
  window._tabOrderCaptureMode = mode;
  if (mode && wasOff) {
    parent.postMessage({ pluginMessage: { type: 'start-tab-order-mode' } }, '*');
  } else if (!mode && !wasOff) {
    parent.postMessage({ pluginMessage: { type: 'stop-tab-order-mode' } }, '*');
  }
}

// Botão "Adicionar itens" do card/tab (2026-09-04-aj, pedido do usuário)
// — visível SÓ quando a área já tem Ordem de Tabulação documentada
// (manual ou Mapeamento Automático). Diferente de "Iniciar Ordem de
// Tabulação" (que sempre recria a cópia do zero via start-tab-order-copy),
// aqui NÃO se recria nada: abre o modal de revisão já populado com os
// itens EXISTENTES (convertidos pro formato de lista pendente, com
// canvasId/badgeItem reais — applyTabOrderToCanvas já pula redesenhar
// quem já tem canvasId, então confirmar depois não duplica selo nenhum) e
// arma a captura de novo(s) elemento(s) via startTabOrderAddItemWait
// (mesmo mecanismo do "+ Adicionar item" já usado DENTRO do modal — só
// que aqui é a primeira vez que ele liga, com o modal recém-aberto).
function startTabOrderAddItemsFromCard(areaId) {
  const area = _findA11yAreaById(areaId);
  if (!area) return;
  const existing = _currentTabOrderItems(areaId).sort((a, b) => (a.number || 0) - (b.number || 0));

  // Bug real corrigido (2026-09-08): esta era a ÚNICA das 3 entradas do
  // fluxo de Ordem de Tabulação (manual, Mapeamento Automático, e esta —
  // "Adicionar itens" a uma área já documentada) que nunca setava
  // window._tabOrderDeclaredOrigin. draw-tab-order-badge manda
  // `a11yOrigin: window._tabOrderDeclaredOrigin || 'web'` pro backend — sem
  // declarar aqui, todo item NOVO acrescentado a uma ordem já existente
  // caía no fallback 'web' mesmo em projeto mobile, importando o componente
  // real errado (selo desktop "[a11y] Item Number", visualmente alongado
  // com conector, em vez do "[hac mob base]" pequeno e redondo que os itens
  // originais usam) — sintoma real reportado: item 17 com selo diferente
  // dos 16 anteriores. A área já existe e já tem origem definida há muito
  // tempo, então ensureA11yProjectOriginThen só lê o valor já persistido
  // (hacData.projectOrigin), sem reabrir nenhum prompt ao designer.
  ensureA11yProjectOriginThen((origin) => {
    window._tabOrderDeclaredOrigin = origin;
  });

  window._tabOrderPendingAreaId = areaId;
  window._tabOrderPendingTargetNodeId = area.targetNodeId || '';
  window._tabOrderPendingList = existing.map(it => ({
    nodeId: it.targetNodeId,
    nodeName: it.targetNodeName || '',
    tempId: _tabOrderNextTempId(),
    canvasId: it.id || null,
    drawing: false,
    drawFailed: false,
    badgeItem: { ...it },
  }));

  openTabOrderReviewModal();
  // Loading de canvas (2026-09-14) — resolve-tab-order-clone normalmente só
  // RECONHECE a cópia já existente (rápido), mas cai em recriá-la do zero
  // (clonar a árvore inteira de novo) se o plugin foi fechado/reaberto
  // desde a última vez — mesma readequação de layers de start-tab-order-copy,
  // por isso mostra o mesmo loading aqui.
  if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading('Preparando cópia de trabalho…');
  // Garante que a cópia clonada existente seja reconhecida/reaproveitada
  // ANTES de armar a captura (2026-09-04-aj) — sem isto, se o plugin foi
  // fechado/reaberto desde a última vez que a cópia foi tocada, o
  // primeiro item novo desenhado recriaria a cópia do zero, apagando os
  // selos já documentados (ver comentário completo no handler
  // resolve-tab-order-clone, code.js). startTabOrderAddItemWait só arma
  // depois da resposta confirmar sucesso (handleTabOrderCloneResolved).
  window._tabOrderAddItemsFromCardAreaId = areaId;
  parent.postMessage({ pluginMessage: { type: 'resolve-tab-order-clone', areaId, targetNodeId: window._tabOrderPendingTargetNodeId, sectionName: getA11yActiveSectionName(), designerName: getA11yDesignerName(), designerId: getA11yDesignerId() } }, '*');
}
window.startTabOrderAddItemsFromCard = startTabOrderAddItemsFromCard;

// Resposta de 'tab-order-clone-resolved' (messages.js) — só depois de
// confirmar que a cópia existente foi encontrada/reaproveitada com
// sucesso é que a captura de novo(s) item(ns) é armada. Em falha (área
// não encontrada/não clonável no canvas), avisa e fecha o modal sem
// tentar capturar nada — evitaria um "Concluir seleção" que nunca
// conseguiria desenhar o item novo de qualquer forma.
function handleTabOrderCloneResolved(areaId, ok) {
  if (areaId !== window._tabOrderAddItemsFromCardAreaId) return;
  window._tabOrderAddItemsFromCardAreaId = null;
  if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();
  if (!ok) {
    showToast('Não foi possível localizar a tela no canvas. Selecione novamente.');
    closeModal('a11y-tab-order-review-modal');
    return;
  }
  startTabOrderAddItemWait();
}
window.handleTabOrderCloneResolved = handleTabOrderCloneResolved;

// Botão "+ Adicionar item" dentro do modal JÁ ABERTO — diferente da
// captura minimizada (que só lê o acumulado ao "Concluir seleção"), aqui o
// designer já está vendo a lista e pediu deliberadamente 1 elemento a
// mais: não há ambiguidade de "gesto em composição" pra justificar
// silêncio (2026-09-04-aa) — o acumulador do backend já deve estar vazio
// neste momento (zerado pela última leitura), então basta esperar ele
// crescer pra 1 e ler. window._tabOrderAddItemWaiting marca essa espera;
// handleTabOrderAccumulatedCountChanged (abaixo) intercepta e busca assim
// que a contagem chegar a 1, em vez de só atualizar a barra mini (que nem
// está visível aqui, o modal já está aberto).
// Bug real corrigido (2026-09-08): até esta correção, "+ Adicionar item"
// só aceitava 1 elemento por vez — a 1ª contagem>0 já disparava a leitura
// do acumulado (ver handleTabOrderAccumulatedCountChanged), então um
// shift+clique em vários elementos de uma vez perdia todos menos o
// primeiro. Regra de produto confirmada pelo usuário: acrescentar itens a
// uma ordem JÁ GERADA/APLICADA no canvas precisa aceitar shift+clique/
// marquise pra vários de uma vez, com a MESMA mecânica de acumulação
// silenciosa da captura inicial (soma, nunca sobrepõe a ordem existente) —
// só uma forma explícita de indicar "terminei" é que muda. Reaproveita o
// mesmo botão: o 1º clique arma a captura (mesmo texto/estado de antes);
// enquanto ela está ativa, o botão vira "Concluir seleção" — o designer
// clica de novo quando tiver marcado todos os elementos novos que quiser.
function startTabOrderAddItemWait() {
  const btn = document.getElementById('btn-tab-order-add-item');
  const label = btn ? btn.querySelector('[data-tab-order-add-item-label]') : null;
  window._tabOrderAddItemWaiting = true;
  _tabOrderSetCaptureMode('continuous');
  if (label) label.textContent = 'Concluir seleção';
  if (btn) { btn.disabled = false; btn.onclick = () => finishTabOrderAddItemWait(); }
  showToast('Segure shift e clique (ou use marquise) pra marcar quantos elementos novos precisar. Clique em "Concluir seleção" quando terminar.');
}
window.startTabOrderAddItemWait = startTabOrderAddItemWait;

// "Concluir seleção" do fluxo "+ Adicionar item" — lê tudo que foi
// acumulado em silêncio (mesma leitura final de finishTabOrderCapture) e
// desarma a espera. handleTabOrderAccumulatedSelectionResult já sabe
// ANEXAR ao final da lista pendente existente (não substituir) quando o
// modal já está aberto — nenhuma mudança necessária nesse ponto.
function finishTabOrderAddItemWait() {
  window._tabOrderAddItemWaiting = false;
  parent.postMessage({ pluginMessage: { type: 'get-tab-order-accumulated-selection' } }, '*');
}
window.finishTabOrderAddItemWait = finishTabOrderAddItemWait;

function _tabOrderResetAddItemButton() {
  const btn = document.getElementById('btn-tab-order-add-item');
  const label = btn ? btn.querySelector('[data-tab-order-add-item-label]') : null;
  if (label) label.textContent = 'Adicionar item';
  // onclick restaurado explicitamente (2026-09-08): startTabOrderAddItemWait
  // reatribui onclick pra finishTabOrderAddItemWait enquanto a captura de
  // múltiplos itens está ativa — sem restaurar aqui, cancelar/concluir uma
  // vez deixaria o botão permanentemente preso no modo "Concluir seleção"
  // na próxima vez que o modal fosse reaberto.
  if (btn) { btn.disabled = false; btn.onclick = () => startTabOrderAddItemWait(); }
}

// Modelo de ACUMULAÇÃO SILENCIOSA (2026-09-04-aa, substitui 2 tentativas
// anteriores de streaming nesta mesma sessão): durante toda a captura, o
// backend não posta mais NENHUMA seleção em tempo real — só acumula em
// silêncio (soma, nunca remove, permite compor a trilha em várias levas
// de shift+clique) e desenha o highlight temporário no canvas por conta
// própria. O frontend só sabe a CONTAGEM ao vivo (ver
// handleTabOrderAccumulatedCountChanged abaixo) até o designer clicar
// "Concluir seleção" — só então a lista pendente é populada de uma vez
// (handleTabOrderAccumulatedSelectionResult), já resolvida/ordenada.
// window._tabOrderPendingList NUNCA mais é populada incrementalmente por
// clique — só por essa resposta final.

// Contagem ao vivo na barra de captura minimizada — resposta de
// 'tab-order-accumulated-count-changed' (messages.js), disparada pelo
// backend a cada novo nó somado ao acumulado silencioso. Também serve pro
// fluxo de "+ Adicionar item" (modal já aberto, ver startTabOrderAddItemWait):
// enquanto window._tabOrderAddItemWaiting estiver ligado, só atualiza o
// texto do botão "Concluir seleção" com a contagem ao vivo — a leitura só
// acontece quando o designer de fato clicar nele
// (finishTabOrderAddItemWait), nunca automaticamente na 1ª contagem>0
// (bug real corrigido 2026-09-08: isso limitava "+ Adicionar item" a 1
// elemento por vez, quebrando shift+clique/marquise de vários de uma vez).
function handleTabOrderAccumulatedCountChanged(count) {
  if (window._tabOrderAddItemWaiting) {
    const btn = document.getElementById('btn-tab-order-add-item');
    const label = btn ? btn.querySelector('[data-tab-order-add-item-label]') : null;
    if (label) label.textContent = count > 0 ? `Concluir seleção (${count})` : 'Concluir seleção';
    return;
  }
  if (typeof _a11yCaptureMiniBarUpdateCount === 'function') _a11yCaptureMiniBarUpdateCount(count || 0);
}
window.handleTabOrderAccumulatedCountChanged = handleTabOrderAccumulatedCountChanged;

// Resposta de 'tab-order-accumulated-selection-result' (messages.js) — já
// com TUDO que foi acumulado durante a captura resolvido ao nível de topo
// certo, sem duplicatas, ordenado em zigue-zague. Dois chamadores:
// finishTabOrderCapture ("Concluir seleção", modal ainda fechado — lista
// pendente NASCE aqui, substituída do zero) e startTabOrderAddItemWait
// ("+ Adicionar item", modal JÁ aberto — os itens recebidos são ANEXADOS
// ao final da lista existente, não substituem nada). Diferencia os dois
// casos por window._tabOrderAddItemWaiting já ter sido consumido (false)
// vs. a lista pendente já existir com o modal aberto.
function handleTabOrderAccumulatedSelectionResult(points) {
  const incoming = (Array.isArray(points) ? points : [])
    .filter(p => p && p.nodeId)
    .map(p => ({ nodeId: p.nodeId, nodeName: p.nodeName || '', tempId: _tabOrderNextTempId(), canvasId: null, drawing: false, drawFailed: false, badgeItem: null }));

  const modalAlreadyOpen = !document.getElementById('a11y-tab-order-review-modal').classList.contains('hidden');
  if (modalAlreadyOpen) {
    // "+ Adicionar item": anexa ao final, mantém o resto da lista intacto.
    window._tabOrderPendingList = (window._tabOrderPendingList || []).concat(incoming);
    _tabOrderResetAddItemButton();
    _renderTabOrderPendingList();
    return;
  }

  window._tabOrderPendingList = incoming;
  openTabOrderReviewModal();
}
window.handleTabOrderAccumulatedSelectionResult = handleTabOrderAccumulatedSelectionResult;

// Manda desenhar o selo REAL do item da lista pendente — chamado em lote
// por applyTabOrderToCanvas (confirmar "Criar ordem de tabulação") e,
// sequencialmente, por addTabOrderItemsFromLayers (Mapeamento Automático).
// Chamadas em sequência podem ter vários desenhos em voo ao mesmo tempo
// (aceito de propósito, ver handleTabOrderBadgeDrawn) — o `number` enviado
// é sempre a posição ATUAL do item na lista no momento do disparo; se a
// ordem mudar antes da resposta voltar, o flush em handleTabOrderBadgeDrawn
// corrige.
function _tabOrderDrawPendingBadge(tempId) {
  const list = window._tabOrderPendingList || [];
  const it = list.find(x => x.tempId === tempId);
  if (!it) return;
  const number = list.indexOf(it) + 1;
  parent.postMessage({
    pluginMessage: {
      type: 'draw-tab-order-badge',
      tempId,
      areaId: window._tabOrderPendingAreaId,
      targetNodeId: window._tabOrderPendingTargetNodeId,
      nodeId: it.nodeId,
      number,
      a11yOrigin: window._tabOrderDeclaredOrigin || 'web',
      sectionName: getA11yActiveSectionName(),
      designerName: getA11yDesignerName(),
      designerId: getA11yDesignerId(),
    },
  }, '*');
}

// Destaca um item da lista PENDENTE no canvas — usa o mesmo handler dedicado
// highlight-tab-order-copy-node (code.js) que o backend usa internamente
// pra destacar cada clique durante a captura silenciosa, em vez do
// sendHighlight genérico (que dispara highlight-node contra o node
// ORIGINAL). A lista pendente só
// existe enquanto a cópia rascunho está ativa, então o destaque tem que
// resolver original→clone como todo o resto do fluxo de Ordem de
// Tabulação — senão o retângulo aparece no frame errado (o original, nunca
// tocado por esse fluxo).
function _highlightTabOrderListItem(nodeId) {
  if (!nodeId) return;
  // shouldScroll: true — clicar num item da LISTA precisa levar a viewport
  // até o elemento (diferente do highlight automático ao clicar direto no
  // canvas, onde o designer já está olhando pro ponto certo). Sem isso, numa
  // área grande/com zoom distante o retângulo de destaque podia desenhar
  // fora da região visível sem o designer perceber (pedido explícito do
  // usuário, 2026-09-03).
  // areaId incluído (2026-09-08): o cache de clone ativo virou por área
  // (Map<areaId, nodeMap>, ver code.js) — sem isso o backend teria que
  // adivinhar de qual área é o nodeId clicado.
  parent.postMessage({ pluginMessage: { type: 'highlight-tab-order-copy-node', id: nodeId, areaId: window._tabOrderPendingAreaId, highlight: true, color: '#0891B2', selectNode: false, shouldScroll: true } }, '*');
}
window._highlightTabOrderListItem = _highlightTabOrderListItem;

// Renderiza a lista PENDENTE (ainda não concluída) dentro do modal de
// revisão — reaproveita o mesmo padrão visual/drag-and-drop de
// _renderTabOrderListForArea, mas opera sobre window._tabOrderPendingList
// (tempId, não originalIndex — cada item já pode ter um canvasId real
// assim que o desenho volta, mas o tempId segue sendo a chave estável da
// lista até "Concluir").
function _renderTabOrderPendingList() {
  const containerEl = document.getElementById('a11y-tab-order-pending-list');
  const emptyEl = document.getElementById('a11y-tab-order-pending-empty');
  const applyBtn = document.getElementById('btn-tab-order-apply');
  if (!containerEl) return;

  const items = window._tabOrderPendingList || [];
  const anyDrawing = items.some(it => it.drawing);
  if (emptyEl) emptyEl.classList.toggle('hidden', items.length > 0);
  if (applyBtn) applyBtn.disabled = items.length === 0 || anyDrawing;

  containerEl.innerHTML = items.map((it, listIndex) => `
    <li class="list-none flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-dark-surface rounded-dsc-small border border-gray-100 dark:border-dark-line shadow-dsc-elevation-1 cursor-pointer ${it.drawing ? 'opacity-60' : ''}"
      title="${it.drawFailed ? 'Falha ao desenhar o selo, remova e tente novamente' : 'Destacar este elemento no canvas'}"
      draggable="true"
      data-list-index="${listIndex}"
      onclick="_highlightTabOrderListItem('${escapeHtml(it.nodeId)}')"
      ondragstart="_tabOrderPendingDragStart(event, ${listIndex})"
      ondragover="_tabOrderDragOver(event)"
      ondrop="_tabOrderPendingDrop(event, ${listIndex})"
      ondragend="_tabOrderDragEnd(event)">
      <span class="text-gray-300 dark:text-dark-muted cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar" aria-hidden="true">
        <i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>
      </span>
      <div class="w-6 h-6 rounded-dsc-circ flex items-center justify-center text-dsc-label-tiny normal-case tracking-normal font-extrabold text-white shrink-0" style="background-color:${it.drawFailed ? '#DC2626' : '#0891B2'}">${listIndex + 1}</div>
      <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal text-slate-700 dark:text-white truncate">${escapeHtml(it.nodeName || '')}</p>
      ${it.drawFailed ? '<i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-red-500 shrink-0" title="Selo não desenhado"></i>' : ''}
      <button type="button" title="Remover da lista" aria-label="Remover da lista"
        onclick="event.stopPropagation(); deleteTabOrderPendingItem('${escapeHtml(it.tempId)}')"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </li>
  `).join('');

  _refreshIcons();
}
window._renderTabOrderPendingList = _renderTabOrderPendingList;

let _tabOrderPendingDragIndex = null;

function _tabOrderPendingDragStart(ev, listIndex) {
  _tabOrderPendingDragIndex = listIndex;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', String(listIndex)); } catch (e) { }
  ev.currentTarget.classList.add('opacity-50');
}
window._tabOrderPendingDragStart = _tabOrderPendingDragStart;

function _tabOrderPendingDrop(ev, targetListIndex) {
  ev.preventDefault();
  const sourceListIndex = _tabOrderPendingDragIndex;
  if (sourceListIndex === null || sourceListIndex === targetListIndex) return;
  const list = window._tabOrderPendingList;
  const [moved] = list.splice(sourceListIndex, 1);
  list.splice(targetListIndex, 0, moved);
  _tabOrderPendingDragIndex = null;
  _tabOrderRenumberPendingCanvas();
  _renderTabOrderPendingList();
}
window._tabOrderPendingDrop = _tabOrderPendingDrop;

// Propaga a posição ATUAL de cada item da lista pendente pros selos reais
// já desenhados no canvas — chamada após qualquer reordenação/remoção.
// Só manda renumber-tab-order-items pros itens que (a) já têm canvasId
// (selo desenhado) e (b) mudaram de número.
//
// No modelo EM LOTE (2026-09-04-e), durante a montagem da trilha NENHUM
// item tem canvasId ainda (nenhum selo existe até "Criar ordem de
// tabulação") — então o `if (it.canvasId && ...)` abaixo nunca dispara
// mensagem nenhuma pro backend nesse momento, só atualiza `it.number` no
// array local. A função só volta a mandar renumber-tab-order-items de
// verdade DEPOIS que os selos já existem — ou seja, no fluxo de "Atualizar"
// sobre uma ordem já aplicada (updateTabOrderNumbering), não durante a
// captura em si.
function _tabOrderRenumberPendingCanvas() {
  const list = window._tabOrderPendingList || [];
  const payload = [];
  list.forEach((it, i) => {
    const newNumber = i + 1;
    if (it.canvasId && it.number !== newNumber) payload.push({ id: it.canvasId, number: newNumber });
    it.number = newNumber;
  });
  if (payload.length > 0) {
    parent.postMessage({ pluginMessage: { type: 'renumber-tab-order-items', items: payload } }, '*');
  }
}

function deleteTabOrderPendingItem(tempId) {
  const list = window._tabOrderPendingList || [];
  const idx = list.findIndex(it => it.tempId === tempId);
  if (idx === -1) return;
  const [removed] = list.splice(idx, 1);
  // Se o selo já estava desenhado, apaga do canvas. Se ainda estava
  // `drawing`, não há canvasId pra apagar ainda — handleTabOrderBadgeDrawn
  // descarta o selo órfão sozinho quando a resposta atrasada chegar (o
  // tempId não vai mais existir na lista).
  if (!removed.drawing && removed.canvasId) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: removed.canvasId } }, '*');
  }
  _tabOrderRenumberPendingCanvas();
  _renderTabOrderPendingList();
}
window.deleteTabOrderPendingItem = deleteTabOrderPendingItem;

// Registro de "quem está esperando" a resposta de draw-tab-order-badge de um
// tempId específico — usado só pelo loop sequencial do scan automático
// (_tabOrderDrawPendingBadgeAwaitable/addTabOrderItemsFromLayers) pra saber
// quando avançar pro próximo item do lote, sem interferir no fluxo
// fire-and-forget normal do clique manual.
const _tabOrderDrawWaiters = new Map();
function _tabOrderResolveDrawWaiter(tempId) {
  const resolve = _tabOrderDrawWaiters.get(tempId);
  if (!resolve) return;
  _tabOrderDrawWaiters.delete(tempId);
  resolve();
}

// Respostas de draw-tab-order-badge (messages.js → aqui). Drawn grava o id
// real do selo no item pendente correspondente (por tempId); se o item já
// não existe mais na lista (foi apagado enquanto o desenho estava em voo),
// o selo chegou órfão — apaga direto, sem passar pela lista. Quando esse
// era o ÚLTIMO item ainda `drawing`, dispara o flush de renumeração (ver
// _tabOrderRenumberPendingCanvas) pra corrigir qualquer número que tenha
// saído desatualizado por causa de respostas chegando fora de ordem.
function handleTabOrderBadgeDrawn(tempId, canvasId, item) {
  const list = window._tabOrderPendingList || [];
  const it = list.find(x => x.tempId === tempId);
  if (!it) {
    if (canvasId) parent.postMessage({ pluginMessage: { type: 'delete-node', id: canvasId } }, '*');
    return;
  }
  it.canvasId = canvasId;
  it.badgeItem = item;
  it.drawing = false;
  it.drawFailed = false;
  if (!list.some(x => x.drawing)) {
    _tabOrderRenumberPendingCanvas();
  }
  _renderTabOrderPendingList();
  _tabOrderResolveDrawWaiter(tempId);
}
window.handleTabOrderBadgeDrawn = handleTabOrderBadgeDrawn;

function handleTabOrderBadgeDrawFailed(tempId) {
  const it = (window._tabOrderPendingList || []).find(x => x.tempId === tempId);
  if (it) {
    it.drawing = false;
    it.drawFailed = true;
    showToast('Não foi possível desenhar o selo deste item. Remova e adicione novamente.');
    _renderTabOrderPendingList();
  }
  _tabOrderResolveDrawWaiter(tempId);
}
window.handleTabOrderBadgeDrawFailed = handleTabOrderBadgeDrawFailed;

// Fecha o modal descartando tudo — a cópia "rascunho" do frame (criada em
// startTabOrderManualMode OU _confirmGenerateTabOrderFromLayers) pode ter
// selos reais desenhados nela quando o cancelamento acontece DEPOIS de já
// ter clicado "Criar ordem de tabulação" uma vez com falha parcial, ou
// vier do scan automático (que já desenha em lote sequencial); no modo
// manual em lote (2026-09-04-e), cancelar ANTES de confirmar nunca vai ter
// nenhum selo desenhado — só a cópia rascunho vazia. Em qualquer um desses
// casos, 'delete-tab-order-draft-copy' apaga a cópia INTEIRA de uma vez —
// cobre selos parciais (ou nenhum) sem precisar apagar um por um. Só
// dispara quando havia de fato uma cópia ativa desta área
// (window._tabOrderActiveCloneId) — guarda de defesa pro caso raro de o
// backend não ter conseguido criar a cópia (área não encontrada/não
// clonável).
function cancelTabOrderReview() {
  _tabOrderSetCaptureMode(null);
  window._tabOrderResumeCaptureMode = null;
  window._tabOrderAddItemWaiting = false;
  window._tabOrderAddItemsFromCardAreaId = null;
  window._tabOrderScanInFlight = false;
  window._tabOrderPendingGeneration = null;
  // window._tabOrderActiveCloneId só é setado por handleTabOrderCopyStarted
  // (resposta de start-tab-order-copy) — o fluxo "Adicionar itens"
  // (2026-09-04-aj) nunca manda essa mensagem de propósito (não recria a
  // cópia, só a reconhece via resolve-tab-order-clone), então esta guarda
  // continua null nesse caso e delete-tab-order-draft-copy corretamente
  // NÃO dispara — cancelar "Adicionar itens" nunca apaga a cópia/selos já
  // existentes, só descarta o(s) item(ns) novo(s) ainda não desenhado(s).
  if (window._tabOrderActiveCloneId && window._tabOrderPendingAreaId) {
    parent.postMessage({ pluginMessage: { type: 'delete-tab-order-draft-copy', areaId: window._tabOrderPendingAreaId } }, '*');
  }
  window._tabOrderActiveCloneId = null;
  window._tabOrderActiveCloneNodeMap = null;
  window._tabOrderPendingList = [];
  window._tabOrderPendingAreaId = null;
  window._tabOrderPendingTargetNodeId = null;
  window._tabOrderDeclaredOrigin = null;
  _tabOrderResetAddItemButton();
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
  closeModal('a11y-tab-order-review-modal');
}
window.cancelTabOrderReview = cancelTabOrderReview;

// "Criar ordem de tabulação" (antigo "Concluir") — modelo EM LOTE
// (2026-09-04-e, pedido da vertical de acessibilidade, revertendo
// parcialmente a decisão de "selos reais incrementais" de 2026-09-03):
// nenhum selo existe ainda quando este botão é clicado (o clique manual só
// acumula em silêncio no backend + highlight, ver o modelo de acumulação
// silenciosa mais acima) — este é o momento em que os selos são de fato
// desenhados, um a
// um em sequência, aguardando cada resposta antes do próximo
// (_tabOrderDrawPendingBadgeAwaitable, mesmo helper já usado pelo scan
// automático em addTabOrderItemsFromLayers — reaproveitado, não duplicado).
//
// Por que em lote de novo, sem reintroduzir o bug que motivou o modelo
// incremental: aquele bug era apagar/reordenar um item ANTES de confirmar
// não refletir nada no canvas (nenhum selo existia até "Aplicar"). Isso
// continua verdade aqui — mas agora é esperado, não um bug: o designer
// revisa/reordena a trilha inteira na lista pendente (que já mostra a
// numeração correta) ANTES de qualquer selo ser desenhado; o highlight no
// canvas a cada clique (não removido) já indica visualmente quais
// elementos foram selecionados, sem precisar do selo real ainda.
//
// Fica desabilitado (ver _renderTabOrderPendingList) enquanto a lista está
// vazia — e agora TAMBÉM durante o próprio desenho em lote (isDrawingBatch
// abaixo), pra não permitir clique duplo enquanto os selos ainda estão
// sendo criados um a um.
async function applyTabOrderToCanvas() {
  const areaId = window._tabOrderPendingAreaId;
  const list = window._tabOrderPendingList || [];
  if (!areaId || list.length === 0) return;

  const applyBtn = document.getElementById('btn-tab-order-apply');
  if (applyBtn) applyBtn.disabled = true;

  // Loading de canvas (2026-09-14) — ver showA11yCanvasLoading (accessibility.js).
  // O texto do botão ("Desenhando N de M...") já existia mas é discreto
  // (some da vista se o modal de revisão estiver scrollado); o modal
  // bloqueante deixa claro que o plugin está processando, não travado.
  const _hasCanvasLoading = typeof showA11yCanvasLoading === 'function';
  if (_hasCanvasLoading) showA11yCanvasLoading(`Desenhando 1 de ${list.length}...`);

  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (it.canvasId) continue; // já desenhado (não deveria acontecer neste fluxo, mas idempotente)
    if (applyBtn) applyBtn.textContent = `Desenhando ${i + 1} de ${list.length}...`;
    if (_hasCanvasLoading) {
      const loadingText = document.getElementById('a11y-post-area-loading-text');
      if (loadingText) loadingText.textContent = `Desenhando ${i + 1} de ${list.length}...`;
    }
    it.drawing = true;
    _renderTabOrderPendingList();
    await _tabOrderDrawPendingBadgeAwaitable(it.tempId);
  }

  if (_hasCanvasLoading) hideA11yCanvasLoading();

  const items = list.filter(it => it.canvasId);
  const failedCount = list.length - items.length;

  if (items.length === 0) {
    if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Criar ordem de tabulação'; }
    showToast('Não foi possível desenhar nenhum selo. Tente novamente.');
    return;
  }

  tabOrderItems = (tabOrderItems || []).filter(it => it && it.a11yAreaId !== areaId);
  items.forEach((it, i) => {
    addTabOrderItem({ ...it.badgeItem, number: i + 1 });
  });

  _tabOrderSetCaptureMode(null);
  window._tabOrderResumeCaptureMode = null;
  window._tabOrderScanInFlight = false;
  window._tabOrderPendingGeneration = null;
  window._tabOrderPendingList = [];
  window._tabOrderPendingAreaId = null;
  window._tabOrderPendingTargetNodeId = null;
  window._tabOrderDeclaredOrigin = null;
  window._tabOrderActiveCloneId = null;
  window._tabOrderActiveCloneNodeMap = null;
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
  closeModal('a11y-tab-order-review-modal');
  showToast(failedCount > 0
    ? `Ordem de tabulação concluída: ${failedCount} ${failedCount === 1 ? 'item falhou' : 'itens falharam'} ao desenhar e ${failedCount === 1 ? 'foi excluído' : 'foram excluídos'}.`
    : 'Ordem de tabulação concluída.');
}
window.applyTabOrderToCanvas = applyTabOrderToCanvas;

// Defensivo: itens salvos antes da introdução de canvasNumber (reordenação
// via drag-and-drop) não têm o campo — assume-se sincronizado com o canvas
// na primeira leitura, senão o botão "Atualizar" reenviaria tudo à toa.
// areaId filtra o subconjunto escopado à área (numeração reinicia por
// área); passe undefined só quando genuinamente precisar de todos os itens.
// Sentinel '__sem_area__' filtra o bucket "Sem área" (itens legados sem
// a11yAreaId, ou cuja área foi excluída).
function _currentTabOrderItems(areaId) {
  const all = (tabOrderItems || []).filter(Boolean).map(it => {
    if (it.canvasNumber === undefined) it.canvasNumber = it.number;
    return it;
  });
  if (areaId === undefined) return all;
  if (areaId === '__sem_area__') {
    const validAreaIds = new Set(_allA11yAreas().map(a => a.id));
    return all.filter(it => !it.a11yAreaId || !validAreaIds.has(it.a11yAreaId));
  }
  return all.filter(it => it.a11yAreaId === areaId);
}

// Resposta de tab-order-item-created (messages.js) — chamado de lá para
// manter o mesmo padrão de a11y-area-created (push no array, depois salva e
// renderiza). Re-render é sempre da lista agrupada inteira
// (renderA11yGroupedList) — mais simples e menos propenso a bug do que
// atualizar cirurgicamente um único accordion.
function addTabOrderItem(item) {
  if (!item) return;
  item.canvasNumber = item.number;
  tabOrderItems.push(item);
  saveToStorage();
  renderA11yGroupedList();
}
window.addTabOrderItem = addTabOrderItem;

// ── Geração automática por varredura de camadas ─────────────────────────
// Complementar ao fluxo manual acima: varre a árvore de uma Área Marcada já
// existente (na ordem espacial calculada em code.js) e POPULA a lista
// pendente com os candidatos, abrindo o modal de revisão já preenchido —
// não desenha mais nada direto no canvas (isso só acontece em
// applyTabOrderToCanvas). O designer pode reordenar via drag-and-drop,
// remover itens, ou complementar com "+ Adicionar item" antes de "Aplicar
// no Canvas". Cada botão "Gerar Automaticamente" já nasce dentro do
// accordion de uma área específica — chama direto com a área do próprio
// accordion, sem modal de escolha.
// Nenhuma trava impedia clicar "Gerar Automaticamente" de novo (ou em
// outra área) enquanto um scan anterior ainda estava em voo — o scan é
// lento de propósito (várias chamadas assíncronas encadeadas no backend) e
// um segundo clique disparava uma invocação concorrente que corrompia o
// estado global compartilhado (_activeTabOrderCloneMap/
// window._tabOrderPendingList, ambos únicos, não por-scan): a resposta
// tardia do primeiro scan sobrescrevia a lista/estado já populados pelo
// segundo, deixando itens fantasmas (inclusive o próprio clone sendo
// coletado como se fosse conteúdo do design) e selos órfãos fora do clone
// (bug real, 2026-09-03). _tabOrderScanGeneration invalida qualquer
// resposta que não seja da geração mais recente.
let _tabOrderScanGeneration = 0;

function _confirmGenerateTabOrderFromLayers(areaId, targetNodeId) {
  if (!areaId || !targetNodeId) return;
  if (window._tabOrderScanInFlight) {
    showToast('Aguarde a varredura em andamento terminar antes de iniciar outra.');
    return;
  }
  ensureA11yProjectOriginThen((origin) => {
    const myGeneration = ++_tabOrderScanGeneration;
    window._tabOrderScanInFlight = true;
    window._tabOrderDeclaredOrigin = origin;
    window._tabOrderPendingList = [];
    window._tabOrderPendingAreaId = areaId;
    window._tabOrderPendingTargetNodeId = targetNodeId;
    window._tabOrderActiveCloneId = null;
    window._tabOrderActiveCloneNodeMap = null;
    window._tabOrderPendingGeneration = myGeneration;
    // Loading de canvas (2026-09-14) — a operação mais pesada das 3:
    // clona a tela inteira E varre a árvore de camadas em busca de
    // elementos interativos. Fechado em addTabOrderItemsFromLayers, quando
    // a resposta 'tab-order-generated-from-layers' chega.
    if (typeof showA11yCanvasLoading === 'function') showA11yCanvasLoading('Varrendo elementos interativos da tela…');
    parent.postMessage({ pluginMessage: { type: 'generate-tab-order-from-layers', areaId, targetNodeId, sectionName: getA11yActiveSectionName(), designerName: getA11yDesignerName(), designerId: getA11yDesignerId(), generation: myGeneration } }, '*');
  });
}
window._confirmGenerateTabOrderFromLayers = _confirmGenerateTabOrderFromLayers;

// Resposta de tab-order-generated-from-layers (messages.js) — items é
// {nodeId, nodeName}[] (candidatos, referenciando o frame ORIGINAL, nunca
// itens já desenhados); cloneId/nodeMap vêm porque o backend já criou e
// focou a cópia da área ANTES de varrer (mesmo padrão do fluxo manual, ver
// handleTabOrderCopyStarted). Popula a lista pendente, abre o modal, e
// dispara o desenho do selo real de cada item — SEQUENCIALMENTE (aguarda
// cada resposta antes do próximo), ao contrário do clique manual (que aceita
// desenhos em paralelo): aqui não há cadência natural de usuário pra
// espaçar as chamadas, então serializar evita qualquer corrida e a lista
// populando item a item já serve de feedback visual do progresso do scan.
async function addTabOrderItemsFromLayers(items, cloneId, nodeMap, generation) {
  // Descarta respostas de uma geração de scan que não é mais a mais
  // recente (clique duplo em "Gerar Automaticamente", ou clique em outra
  // área enquanto um scan anterior ainda respondia) — sem isso, uma
  // resposta tardia sobrescrevia window._tabOrderPendingList inteiro,
  // trazendo de volta itens já apagados pelo designer e/ou colidindo com o
  // loop sequencial de desenho de outra geração ainda em voo (bug real,
  // 2026-09-03). _confirmGenerateTabOrderFromLayers já bloqueia um novo
  // disparo enquanto _tabOrderScanInFlight é true — esta checagem cobre a
  // resposta em si, que pode chegar fora de ordem.
  if (generation !== undefined && generation !== window._tabOrderPendingGeneration) return;
  window._tabOrderScanInFlight = false;
  if (typeof hideA11yCanvasLoading === 'function') hideA11yCanvasLoading();

  window._tabOrderActiveCloneId = cloneId || null;
  window._tabOrderActiveCloneNodeMap = nodeMap || null;

  // Sem cloneId, o backend nem chegou a criar a cópia (área não encontrada
  // ou não clonável) — nesse caso não há onde marcar nada, então não abre o
  // modal, só avisa (figma.notify do backend já cobriu o motivo).
  if (!cloneId) {
    window._tabOrderPendingList = [];
    return;
  }

  window._tabOrderPendingList = Array.isArray(items)
    ? items.map(it => ({ nodeId: it.nodeId, nodeName: it.nodeName || '', tempId: _tabOrderNextTempId(), canvasId: null, drawing: true, drawFailed: false, badgeItem: null }))
    : [];
  openTabOrderReviewModal();
  if (window._tabOrderPendingList.length === 0) {
    showToast('Nenhum elemento interativo encontrado automaticamente. A cópia da tela já está pronta para marcação manual ("+ Adicionar item").');
    return;
  }
  showToast(`${window._tabOrderPendingList.length} elemento${window._tabOrderPendingList.length === 1 ? '' : 's'} encontrado${window._tabOrderPendingList.length === 1 ? '' : 's'}, desenhando no canvas…`);

  for (const it of window._tabOrderPendingList.slice()) {
    // Aborta o loop se, no meio do caminho, uma geração mais nova assumiu
    // (outro clique disparou um novo scan que já foi liberado por algum
    // motivo) — nunca continua desenhando itens de uma lista que não é mais
    // a atual.
    if (window._tabOrderPendingGeneration !== generation) return;
    await _tabOrderDrawPendingBadgeAwaitable(it.tempId);
  }
}
window.addTabOrderItemsFromLayers = addTabOrderItemsFromLayers;

// Variante aguardável de _tabOrderDrawPendingBadge, usada só pelo loop
// sequencial do scan automático — resolve assim que a resposta (sucesso ou
// falha) daquele tempId específico chegar (ver _tabOrderDrawWaiters/
// _tabOrderResolveDrawWaiter, declarados junto de handleTabOrderBadgeDrawn).
function _tabOrderDrawPendingBadgeAwaitable(tempId) {
  return new Promise(resolve => {
    _tabOrderDrawWaiters.set(tempId, resolve);
    _tabOrderDrawPendingBadge(tempId);
  });
}

// Reordenação manual (drag-and-drop) é só de LISTA — a ordem visual normal
// é sempre derivada de it.number (ver .sort abaixo), então redistribuir a
// posição no array não muda nada sozinho. Ao soltar um item em nova posição
// (_tabOrderDrop), recalculamos number = index+1 pra TODOS os itens DA
// MESMA ÁREA (dado do plugin, sem tocar canvas) e guardamos o número já
// aplicado no canvas em canvasNumber, pra saber depois — no clique em
// "Atualizar" — quais itens realmente precisam de renumber-tab-order-items.
// canvasNumber nasce igual a number na criação e só é atualizado quando o
// backend confirma a renumeração.
let _tabOrderDragIndex = null;
let _tabOrderDragAreaId = null;

// Renderiza a lista de itens de Ordem de Tabulação escopada a UMA área (ou
// ao bucket "Sem área", passando areaId = '__sem_area__') dentro do
// containerEl fornecido (o <ul> específico daquele accordion). Chamada uma
// vez por accordion de área em _a11yAreaAccordionEl/_a11ySemAreaAccordionEl.
function _renderTabOrderListForArea(areaId, containerEl) {
  if (!containerEl) return;

  const items = _currentTabOrderItems(areaId)
    .map(it => Object.assign({}, it, { originalIndex: tabOrderItems.indexOf(it) }))
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const readOnly = areaId === '__sem_area__';

  containerEl.innerHTML = items.map((it, listIndex) => `
    <li class="list-none flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-dark-surface rounded-dsc-small border border-gray-100 dark:border-dark-line shadow-dsc-elevation-1"
      draggable="${readOnly ? 'false' : 'true'}"
      data-list-index="${listIndex}"
      ${readOnly ? '' : `ondragstart="_tabOrderDragStart(event, ${listIndex}, '${escapeHtml(String(areaId))}')"
      ondragover="_tabOrderDragOver(event)"
      ondrop="_tabOrderDrop(event, ${listIndex}, '${escapeHtml(String(areaId))}')"
      ondragend="_tabOrderDragEnd(event)"`}>
      ${readOnly ? '' : `<span class="text-gray-300 dark:text-dark-muted cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar" aria-hidden="true">
        <i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>
      </span>`}
      <div class="w-6 h-6 rounded-dsc-circ flex items-center justify-center text-dsc-label-tiny normal-case tracking-normal font-extrabold text-white shrink-0" style="background-color:#0891B2">${escapeHtml(String(it.number))}</div>
      <p class="flex-1 min-w-0 text-dsc-label-tiny normal-case tracking-normal text-slate-700 dark:text-white truncate">${escapeHtml(it.targetNodeName || '')}</p>
      <button type="button" title="Focar no canvas" aria-label="Focar no canvas"
        onclick="focusNode('${it.id}')"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
        <i data-lucide="locate" class="w-3.5 h-3.5"></i>
      </button>
      <button type="button" title="Remover da ordem de tabulação" aria-label="Remover da ordem de tabulação"
        onclick="deleteTabOrderItem(${it.originalIndex})"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </li>
  `).join('');

  _refreshIcons();
}
window._renderTabOrderListForArea = _renderTabOrderListForArea;

function _tabOrderDragStart(ev, listIndex, areaId) {
  _tabOrderDragIndex = listIndex;
  _tabOrderDragAreaId = areaId;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', String(listIndex)); } catch (e) { }
  ev.currentTarget.classList.add('opacity-50');
}
window._tabOrderDragStart = _tabOrderDragStart;

function _tabOrderDragOver(ev) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
}
window._tabOrderDragOver = _tabOrderDragOver;

function _tabOrderDragEnd(ev) {
  ev.currentTarget.classList.remove('opacity-50');
  _tabOrderDragIndex = null;
  _tabOrderDragAreaId = null;
}
window._tabOrderDragEnd = _tabOrderDragEnd;

// Reordena o array em memória e recalcula number = index+1 pra refletir a
// nova posição visual DENTRO DA MESMA ÁREA — sem enviar nada ao canvas
// aqui; a divergência com canvasNumber é o que o botão "Atualizar"
// (updateTabOrderNumbering) usa depois pra saber quem precisa de
// renumber-tab-order-items.
function _tabOrderDrop(ev, targetListIndex, areaId) {
  ev.preventDefault();
  const sourceListIndex = _tabOrderDragIndex;
  if (sourceListIndex === null || sourceListIndex === targetListIndex || areaId !== _tabOrderDragAreaId) return;

  const ordered = _currentTabOrderItems(areaId).sort((a, b) => (a.number || 0) - (b.number || 0));
  const [moved] = ordered.splice(sourceListIndex, 1);
  ordered.splice(targetListIndex, 0, moved);

  ordered.forEach((it, i) => { it.number = i + 1; });

  saveToStorage();
  renderA11yGroupedList();
  // Reordenar SÓ atualiza `number` em memória — o canvas (e canvasNumber)
  // continua com o valor antigo até "Atualizar" ser clicado. O botão
  // "Atualizar" da tab de trabalho (accessibility.js,
  // _a11yWorkspaceTabTabulacao) nasce desabilitado quando não há nada
  // pendente; este drop é o único evento que de fato cria divergência,
  // então é o único que precisa reabilitá-lo (2026-09-16).
  _tabOrderSyncUpdateButton(areaId);
}
window._tabOrderDrop = _tabOrderDrop;

// Reavalia se existe alguma divergência number≠canvasNumber pendente nesta
// área e sincroniza o estado disabled do botão "Atualizar" da tab de
// trabalho pelo id (sem re-renderizar a tab inteira) — chamado depois de
// qualquer ação que possa mudar essa divergência sem passar por um render
// completo (_tabOrderDrop acima; deleteTabOrderItem já autocorrige o canvas
// na hora, então não precisa chamar isto, mas não há problema em chamar de
// qualquer lugar que só mexa em `number`/`canvasNumber`). Sai em silêncio
// se o botão não estiver no DOM (ex.: outra tab aberta) — puramente
// cosmético, nunca crítico pro dado.
function _tabOrderSyncUpdateButton(areaId) {
  const btn = document.querySelector(`[id^="tab-order-update-btn-workspace-"]`);
  if (!btn || window._a11yWorkspaceAreaId !== areaId) return;
  const needsSync = _currentTabOrderItems(areaId).some(it => it.id && it.number !== it.canvasNumber);
  btn.disabled = !needsSync;
}
window._tabOrderSyncUpdateButton = _tabOrderSyncUpdateButton;

// Clique em "Atualizar" (escopado a uma área) — só ENTÃO o canvas é
// tocado. Compara number (já recalculado pelo drag-and-drop) contra
// canvasNumber (o que de fato está desenhado nos selos) e manda pro
// backend só quem realmente mudou, mesma lógica de comparação que
// deleteTabOrderItem já usa.
function updateTabOrderNumbering(areaId) {
  const ordered = _currentTabOrderItems(areaId).sort((a, b) => (a.number || 0) - (b.number || 0));
  const renumberPayload = [];
  ordered.forEach(it => {
    if (it.id && it.number !== it.canvasNumber) {
      renumberPayload.push({ id: it.id, number: it.number });
    }
  });

  if (renumberPayload.length === 0) {
    showToast('A ordem já está atualizada no canvas.');
    return;
  }

  parent.postMessage({ pluginMessage: { type: 'renumber-tab-order-items', items: renumberPayload } }, '*');
  ordered.forEach(it => { it.canvasNumber = it.number; });

  saveToStorage();
  showToast('Ordem atualizada no canvas.');
  // number/canvasNumber acabaram de ser igualados acima — reavalia o botão
  // pra ele voltar a nascer desabilitado até a próxima divergência real
  // (2026-09-16, mesmo helper usado por _tabOrderDrop).
  _tabOrderSyncUpdateButton(areaId);
}
window.updateTabOrderNumbering = updateTabOrderNumbering;

// ── Simulação de leitura por voz da Ordem de Tabulação (2026-09-09) ──────
// Ferramenta interativa (não vira bloco na Ficha de Handoff): narra em voz
// real, via Web Speech API nativa do navegador/Chromium do Figma Desktop
// (speechSynthesis — sem serviço externo, sem token novo), cada parada da
// Ordem de Tabulação já criada, com destaque sincronizado no canvas — como
// um leitor de tela faria de fato. O "tipo" falado (ex. "Botão, Enviar")
// não existe persistido em tabOrderItems (schema salvo não tem essa
// coluna) — é recalculado ao vivo a cada simulação via
// resolve-tab-order-narration (code.js), que resolve o matching DSC→a11y
// contra o node ORIGINAL de cada item (nunca o clone da Ordem de
// Tabulação, que pode já ter sido descartado).
//
// Estado module-level único (só uma simulação por vez faz sentido —
// speechSynthesis do navegador também só narra 1 fila de cada vez).
window._tabOrderNarration = {
  active: false,
  areaId: null,
  uid: null,
  lang: 'pt',
  queue: [],
  index: -1,
};

function _tabOrderNarrationPhrase(item, lang) {
  const name = (item.targetNodeName || '').trim() || (lang === 'en' ? 'Unnamed element' : 'Elemento sem nome');
  const labels = lang === 'en' ? A11Y_NARRATION_TYPE_LABELS_EN : A11Y_NARRATION_TYPE_LABELS;
  const typeLabel = item.shortName ? labels[item.shortName] : null;
  return typeLabel ? `${typeLabel}, ${name}` : name;
}

function _tabOrderNarrationButtonEl(uid) {
  return document.getElementById(`tab-order-narration-btn-${uid}`);
}

function _setTabOrderNarrationButtonState(uid, isActive) {
  const btn = _tabOrderNarrationButtonEl(uid);
  if (!btn) return;
  btn.innerHTML = isActive
    ? `<i data-lucide="square" class="w-3.5 h-3.5" aria-hidden="true"></i> Parar simulação`
    : `<i data-lucide="play" class="w-3.5 h-3.5" aria-hidden="true"></i> Simular leitura`;
  btn.classList.toggle('text-red-600', isActive);
  btn.classList.toggle('dark:text-red-400', isActive);
  btn.classList.toggle('text-slate-600', !isActive);
  btn.classList.toggle('dark:text-dark-muted', !isActive);
  try { _refreshIcons(); } catch (e) { }
}

// Encerra a simulação em qualquer ponto (fim natural do percurso, clique
// manual em "Parar simulação", ou fallback de ambiente sem suporte) —
// sempre por este único caminho, pra nunca deixar o botão preso em "Parar
// simulação" nem o highlight aceso no canvas depois que a fala parou.
function _stopTabOrderNarration() {
  const state = window._tabOrderNarration;
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { }
  const uid = state.uid;
  state.active = false;
  state.areaId = null;
  state.uid = null;
  state.queue = [];
  state.index = -1;
  if (uid) _setTabOrderNarrationButtonState(uid, false);
}

function _tabOrderNarrationAdvance() {
  const state = window._tabOrderNarration;
  if (!state.active) return;
  state.index += 1;
  if (state.index >= state.queue.length) {
    _stopTabOrderNarration();
    return;
  }
  const item = state.queue[state.index];
  if (item.targetNodeId) focusNode(item.targetNodeId);

  const lang = state.lang === 'en' ? 'en' : 'pt';
  // Velocidade relida a CADA item (2026-09-11, pedido do usuário) — mudar
  // o seletor no meio da simulação passa a valer já no próximo item, sem
  // precisar parar e recomeçar. Fallback 1.5x quando o seletor não existe
  // (build antiga em cache) ou tem valor inválido; a Web Speech API aceita
  // rate entre 0.1 e 10, mas acima de ~2.5 a maioria das vozes fica
  // ininteligível, então o seletor não oferece mais que isso.
  const rateSelect = state.uid ? document.getElementById(`tab-order-narration-rate-${state.uid}`) : null;
  const parsedRate = rateSelect ? parseFloat(rateSelect.value) : NaN;
  const rate = (isFinite(parsedRate) && parsedRate > 0) ? parsedRate : 1.5;

  const utterance = new SpeechSynthesisUtterance(_tabOrderNarrationPhrase(item, lang));
  utterance.lang = lang === 'en' ? 'en-US' : 'pt-BR';
  utterance.rate = rate;
  // Pausa entre itens proporcional à velocidade — numa leitura acelerada,
  // manter os 400ms fixos faria a pausa dominar o ritmo e anular boa parte
  // do ganho de velocidade.
  const gapMs = Math.round(400 / rate);
  utterance.onend = () => {
    if (!state.active) return;
    // Intervalo depois do fim real da fala (evento onend, não um timeout
    // arbitrário simulando a duração da fala) — reproduz a pausa natural
    // entre elementos de um leitor de tela real.
    setTimeout(() => { if (state.active) _tabOrderNarrationAdvance(); }, gapMs);
  };
  // Se a síntese falhar no meio (voz indisponível, engine travando), não
  // trava a simulação inteira nem deixa o botão preso — segue pro próximo
  // item do mesmo jeito que faria ao final de uma fala normal.
  utterance.onerror = () => { if (state.active) setTimeout(() => { if (state.active) _tabOrderNarrationAdvance(); }, gapMs); };
  try {
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    utterance.onerror();
  }
}

function _handleTabOrderNarrationResolved(areaId, items) {
  const state = window._tabOrderNarration;
  // A resposta pode chegar depois que o designer já cancelou ou trocou de
  // área/simulação — só inicia o percurso se ainda for a simulação ativa
  // esperada.
  if (!state.active || state.areaId !== areaId) return;
  state.queue = Array.isArray(items) ? items : [];
  state.index = -1;
  if (state.queue.length === 0) {
    showToast('Nenhum elemento na Ordem de Tabulação para narrar.');
    _stopTabOrderNarration();
    return;
  }
  _tabOrderNarrationAdvance();
}
window._handleTabOrderNarrationResolved = _handleTabOrderNarrationResolved;

// Clique único no botão "Simular leitura" / "Parar simulação" — alterna
// entre iniciar e interromper, nunca duas simulações ao mesmo tempo
// (starta sempre para do zero a anterior, se houver).
function toggleTabOrderNarration(areaId, uid) {
  const state = window._tabOrderNarration;
  if (state.active) {
    _stopTabOrderNarration();
    return;
  }
  if (!('speechSynthesis' in window)) {
    showToast('Simulação de leitura por voz não está disponível neste ambiente.', 'error');
    return;
  }
  const ordered = _currentTabOrderItems(areaId).sort((a, b) => (a.number || 0) - (b.number || 0));
  if (ordered.length === 0) {
    showToast('Nenhum elemento na Ordem de Tabulação para narrar.');
    return;
  }

  state.active = true;
  state.areaId = areaId;
  state.uid = uid;
  state.queue = [];
  state.index = -1;
  // Idioma escolhido no <select> ao lado do botão (pedido do usuário,
  // 2026-09-09) — só troca a pronúncia/idioma da síntese e o rótulo do tipo
  // (A11Y_NARRATION_TYPE_LABELS vs. _EN); o nome do elemento em si nunca
  // muda, vem sempre como está gravado no Figma. 'pt' é o default quando o
  // seletor não existe (ex. build antiga em cache) ou não tem valor ainda.
  const langSelect = document.getElementById(`tab-order-narration-lang-${uid}`);
  state.lang = (langSelect && langSelect.value === 'en') ? 'en' : 'pt';
  _setTabOrderNarrationButtonState(uid, true);

  parent.postMessage({
    pluginMessage: {
      type: 'resolve-tab-order-narration',
      areaId,
      items: ordered.map(it => ({ targetNodeId: it.targetNodeId, targetNodeName: it.targetNodeName, number: it.number })),
    },
  }, '*');
}
window.toggleTabOrderNarration = toggleTabOrderNarration;

// Excluir um item do MEIO da sequência renumera localmente todos os
// posteriores DA MESMA ÁREA (-1) antes de salvar/renderizar, e propaga a
// mudança pros selos já desenhados no canvas via renumber-tab-order-items.
function deleteTabOrderItem(originalIndex) {
  const raw = tabOrderItems[originalIndex];
  if (!raw) return;

  const areaId = raw.a11yAreaId || null;

  if (raw.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: raw.id } }, '*');
  }
  tabOrderItems.splice(originalIndex, 1);

  const remaining = _currentTabOrderItems(areaId || '__sem_area__')
    .sort((a, b) => (a.number || 0) - (b.number || 0));
  const renumberPayload = [];
  remaining.forEach((it, i) => {
    const newNumber = i + 1;
    if (it.number !== newNumber) {
      it.number = newNumber;
      if (it.id) renumberPayload.push({ id: it.id, number: newNumber });
    }
  });

  if (renumberPayload.length > 0) {
    parent.postMessage({ pluginMessage: { type: 'renumber-tab-order-items', items: renumberPayload } }, '*');
    // canvas já foi atualizado acima — sincroniza canvasNumber pra não sobrar
    // divergência falsa quando o designer clicar em "Atualizar" depois.
    remaining.forEach(it => { it.canvasNumber = it.number; });
  }

  saveToStorage();
  renderA11yGroupedList();
}
window.deleteTabOrderItem = deleteTabOrderItem;

// Ícone "Apagar toda a ordem de tabulação" ao lado de "Iniciar Ordem de
// Tabulação" (visível só quando a área já tem itens, 2026-09-04-ai,
// pedido do usuário) — apaga a Ordem inteira desta área de uma vez, em
// vez de excluir item por item via deleteTabOrderItem. Reaproveita
// delete-tab-order-copy-for-area (mesmo handler já usado na exclusão em
// cascata de deleteA11yArea, accessibility.js ~5667) — o backend remove a
// CÓPIA CLONADA inteira de uma vez (todos os selos vivem dentro dela
// desde a correção de coordenadas desta sessão), sem precisar de um
// delete-node por item. Sem modal de confirmação, mesmo padrão já usado
// por "Remover área"/"Remover trilha" (ação imediata, com Ctrl+Z do
// próprio Figma como rede de segurança).
function deleteAllTabOrderForArea(areaId) {
  if (!areaId) return;
  const items = _currentTabOrderItems(areaId);
  if (items.length === 0) return;

  parent.postMessage({ pluginMessage: { type: 'delete-tab-order-copy-for-area', areaId } }, '*');
  tabOrderItems = (tabOrderItems || []).filter(it => !it || it.a11yAreaId !== areaId);

  saveToStorage();
  renderA11yGroupedList(); // já atualiza a tab da workspace aberta, se houver
  showToast('Ordem de tabulação removida.');
}
window.deleteAllTabOrderForArea = deleteAllTabOrderForArea;

