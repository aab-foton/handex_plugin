// ============================================================
// backend/onmessage.js — hac (backend, sandbox principal do Figma)
//
// EXTRAÍDO de code.js (2026-09-14) — Camada 2 (parte 1) da modularização
// do backend (plano em C:\Users\augus\.claude\plans\encapsulated-booping-toucan.md).
// Etapa MECÂNICA recomendada por 2 agentes (architecture-guardian,
// backend-plugin) antes de fatiar as ~25 funções de clone/Ficha (Tabulação/
// Swipe/Leitor de Tela) por área: mover o dispatcher `figma.ui.onmessage`
// INTEIRO (todos os handlers, não só os desta camada) para um módulo
// próprio primeiro, eliminando o ruído de ~4300 linhas de handlers não
// relacionados que hoje cercam essas funções dentro de code.js — só
// DEPOIS, com esse módulo isolado e sem ruído, faz sentido fatiar as
// funções de clone/Ficha em arquivos menores (parte 2, ainda não feita).
//
// Import por efeito colateral em code.js (`import './backend/onmessage.js';`)
// — este módulo, ao ser carregado, registra `figma.ui.onmessage` e
// `figma.on('selectionchange', ...)` exatamente como faziam antes,
// nenhuma mudança de comportamento, só de localização física do código.
//
// O listener de seleção do canvas (figma.on('selectionchange', ...)) e o
// estado mutável que ele compartilha com o onmessage (_tabOrderModeActive/
// _swipePathModeActive/_a11yManualMatchModeActive e as sequências/timers de
// debounce associados) migraram JUNTOS: em módulos ES, um `let` importado
// de outro arquivo não pode ser reatribuído aqui — como tanto o listener
// quanto vários handlers do onmessage (start-tab-order-mode,
// stop-tab-order-mode, etc.) ATRIBUEM a essas variáveis (não só leem),
// elas precisam morar no mesmo módulo que os usa para escrita.
// ============================================================

// Bug real corrigido (2026-09-14, reportado com print pelo usuário:
// "Instruções não inseridas: 'FICHA_INSTRUCTION_CONTENT' is not defined"
// ao inserir Ordem de Tabulação na Ficha) — este import de JSON usava
// _buildFichaLegendColumn/_buildFichaInstructionOnlyLegendColumn dentro do
// onmessage, mas ficou de fora da extração da Camada 2 parte 1 porque o
// levantamento original só rastreou `function`/`const`/`let`, não
// declarações `import`.
import FICHA_INSTRUCTION_CONTENT from '../refs/ficha-instruction-content.json';

import {
  A11Y_ITEM_NUMBER_KEYS_MOBILE,
  A11Y_SECTION_NAME,
  A11Y_SWIPE_FLOW_SECTION_NAME,
  A11Y_TAB_ORDER_ITEM_KEY_MOBILE,
  FICHA_SECTION_ORDER,
  HAC_DATA_LEGACY_KEY,
  PLUGIN_VERSION,
  _FICHA_BLOCK_CONFIG,
  _activeSpecCloneMaps,
  _activeSwipePathCloneMaps,
  _activeTabOrderCloneMaps,
  _appendFichaBlockTitle,
  _applyFichaTypography,
  _buildFichaInstructionOnlyLegendColumn,
  _buildFichaLegendColumn,
  _clearOrphanedHighlightStrokes,
  _collectA11yOccupiedBounds,
  _computeNextA11ySectionName,
  _createOrGetFichaFrame,
  _deleteTabOrderDraftCopy,
  _ensureCloneWorkFrame,
  _extractA11ySectionVersionSuffix,
  _findFichaFrameForArea,
  _findFichaItensFrameDeep,
  _findFichaSectionInFrame,
  _findFreeTabOrderCopyPosition,
  _findMainTextContent,
  _findOtherDesignersSessionSections,
  _findOwnPriorSessionSection,
  _findTabOrderCopyForArea,
  _fitSectionToChildren,
  _fitSessionSectionFromItensFrame,
  _fitTelaFrameWidthFromItensFrame,
  _forEachA11yFichaFrameChild,
  _forEachA11ySessionAreaChild,
  _forEachA11ySessionDirectChild,
  _forEachFichaFrameNodeDeep,
  _forEachSwipePathCopyCandidate,
  _forEachTabOrderCopyCandidate,
  _getHacDataStorageKey,
  _writeHacDataToDocument,
  _readHacDataFromDocument,
  _clearHacDataFromDocument,
  _hacDataWeight,
  _getSceneNodeById,
  _getOrCreateA11ySection,
  _getOrCreateA11ySessionSection,
  _getOrCreateCloneOverlayGroup,
  _getOrCreateFichaAreaGroup,
  _getOrCreateFichaItensFrame,
  _getOrCreateNamedSection,
  _getVerticalAnchorForNewArea,
  _insertFichaSectionInOrder,
  _isHacOwnedNode,
  _moveActiveCloneIntoFichaSection,
  _nodeOnCurrentPage,
  _orderNodesInZigzagReadingOrder,
  _rectsOverlap,
  _removeCloneWorkFrame,
  _removeExistingSwipePathCopiesForArea,
  _removeExistingTabOrderCopiesForArea,
  _reparentArtifactIntoArea,
  _reparentIntoA11ySection,
  _reparentIntoAreaGroup,
  _reparentIntoSection,
  _resolveOriginalNodeIdFromTabOrderClone,
  _resolveSwipePathCloneSelectionToOriginalId,
  _resolveTabOrderCloneSelectionToOriginalId,
  _setCloneOverlayGroupAbsolutePositioning,
  _snapshotCloneIntoFichaSection,
  _tryImportA11yAgrupamento,
  _tryImportA11yComponent,
  _tryImportA11yConectorLinha,
  hexToRgb,
} from '../code.js';
import {
  _getDscComponentKeyToFrameMap,
  _resolveDscComponentA11yMatch,
  _resolveManualSpecMatchAndNotify,
  A11Y_INTERACTIVE_SHORTNAMES,
  _isA11yInteractiveComponentKey,
  _findVisibleLabelText,
  _a11yScanArea,
} from './dsc-matching.js';

// "Ordem de Tabulação": modo de clique — liga/desliga via
// start-tab-order-mode/stop-tab-order-mode (vindos do frontend).
//
// Modelo de SEQUÊNCIA RASTREADA (2026-09-11, substitui a "leitura literal"
// de 2026-09-04-af — ver histórico completo no listener de selectionchange
// abaixo). A leitura literal partia da premissa de que
// figma.currentPage.selection preserva a ordem real de clique do
// designer — bug real confirmado (2026-09-11): a API do Figma NÃO garante
// isso; selection reflete a ordem estrutural da árvore de camadas
// (documento/z-index), não a ordem cronológica de interação. Usuário
// reportou print real: clicou em "Leading Button" primeiro, mas a leitura
// literal devolvia "Slot Hero" na posição 1 (elemento anterior na árvore,
// clicado depois). _tabOrderClickSequence é a fonte de verdade da ORDEM;
// figma.currentPage.selection continua consultado, mas só como filtro de
// "o que está selecionado agora", nunca mais como fonte de ordem.
let _tabOrderModeActive = false;
let _tabOrderClickSequence = [];

// "Trilha de Swipe": modo de clique análogo ao de Ordem de Tabulação —
// liga/desliga via start-swipe-path-mode/stop-swipe-path-mode (captura do
// zero) ou start-swipe-path-listen-only (retomar escuta sobre uma
// sequência já em andamento, fluxo "+ Adicionar ponto" — não reseta
// _swipePathClickSequence). Mesmo modelo de sequência rastreada
// (2026-09-11) espelhado de Ordem de Tabulação acima.
let _swipePathModeActive = false;
let _swipePathClickSequence = [];

// Matching determinístico do gate de seleção "+ Nova spec" (2026-09-11) —
// liga/desliga via resolve-manual-spec-match (liga, ver handler abaixo) e
// stop-manual-spec-match-mode (desliga, disparado pelo frontend ao fechar o
// picker de categoria por qualquer caminho: escolher categoria, X, backdrop).
// Diferente de Tabulação/Swipe, aqui NÃO acumula uma sequência de cliques —
// só reage à ÚLTIMA seleção (mesmo raciocínio de get-selection-name), porque
// o objetivo é apenas "que categoria sugerir para o que está selecionado
// AGORA", nunca uma trilha. O picker geralmente abre ANTES do designer
// clicar no elemento-alvo real (o clique acontece só depois de ler a
// instrução), então a resolução original (no momento do clique em "Nova
// spec") tende a resolver contra o próprio frame da Área — o listener abaixo
// existe para re-resolver ao vivo assim que o designer clicar no elemento
// de fato, sem exigir uma ação extra dele.
let _a11yManualMatchModeActive = false;
let _a11yManualMatchDebounceTimer = null;

// Bug real corrigido (2026-09-17, print confirmado: usuário clicou "Top App
// Bar" no canvas, "+ Nova spec" abriu o formulário com "Camada no canvas":
// "Actions" — um node diferente do que foi clicado). Causa raiz: o fluxo
// manual dispara, em paralelo, resolve-manual-spec-match (liga o modo acima
// e lê a seleção ATUAL) e start-spec-copy (cria/reaproveita a réplica de
// trabalho da Área e, ao terminar — spec-copy-started, messages.js —, FOCA
// essa réplica via focusA11yCloneNode → resolve-a11y-focus-node →
// focusNode → highlight-node, que faz figma.currentPage.selection =
// [cloneRaiz]). Esse foco automático é programático, mas dispara
// 'selectionchange' igual a um clique real do designer — e como a criação
// do clone é assíncrona (vários `await`, ver comentário em
// _resolveActiveSpecClone), ele frequentemente termina DEPOIS que o
// designer já clicou no elemento real dentro do frame. Sem distinguir
// "seleção mudou porque o PLUGIN focou a réplica" de "seleção mudou porque
// o DESIGNER clicou em algo", o listener abaixo (que already existe pra
// re-resolver o match ao vivo) reagia à sobrescrita programática como se
// fosse a escolha do designer, e o resultado (nodeName/match) virava o node
// RAIZ do clone (ex.: "Actions", nome do container clonado), nunca o
// elemento clicado. Set antes de QUALQUER `figma.currentPage.selection = `
// disparado pelo próprio hac para focar a réplica (resolve-a11y-focus-node
// abaixo) — o listener consome a flag e ignora esse ciclo de
// 'selectionchange', preservando a última seleção REAL do designer como
// candidata a match/nome de camada.
let _a11ySuppressNextSelectionChange = false;

// Última seleção REAL do designer conhecida enquanto o gate de "+ Nova
// spec" está ativo (_a11yManualMatchModeActive) — id do node, não o objeto
// (pode ter sido removido/mudado de página entre a leitura e o uso).
// Capturada no instante em que resolve-manual-spec-match liga o modo (é a
// seleção que o designer já tinha ANTES de clicar "+") e atualizada a cada
// 'selectionchange' real (não suprimido) enquanto o modo segue ativo. Existe
// porque, nesta janela, figma.currentPage.selection pode estar apontando
// pra réplica de trabalho recém-focada (foco programático, sempre suprimido
// no listener acima, mas que AINDA MUDA a seleção de fato) — get-selection-
// name (chamado de forma síncrona por openA11yModal, sem qualquer relação
// com o token do gate) não tem como saber disso sozinho, então prefere este
// registro sempre que o modo estiver ativo. null quando o modo nunca ligou
// ou a seleção capturada era vazia — nesses casos os handlers caem de volta
// no comportamento antigo (ler figma.currentPage.selection direto).
let _a11yManualMatchLastRealSelectionId = null;

// Listener único de seleção do canvas para os modos de captura de Ordem de
// Tabulação e Trilha de Swipe — LEITURA LITERAL (2026-09-04-af).
//
// Histórico: 2 tentativas anteriores nesta mesma sessão tentaram resolver
// "seleção múltipla trazendo itens errados" com streaming em tempo real
// (insuficiente — processava estados intermediários do próprio gesto) e
// depois com um acumulador em memória que somava tudo que já passou pela
// seleção durante a captura, sem nunca esquecer (insuficiente também —
// cliques de teste/engano continuavam contando pra sempre; usuário
// reportou "6 itens marcados" com só 1 elemento realmente selecionado).
// O usuário esclareceu o modelo correto: o FIGMA já resolve composição de
// seleção sozinho (shift+clique mantém, soltar e clicar de novo com shift
// continua de onde parou) — o plugin não precisa nem deve ter memória
// própria. Aqui, cada evento só faz 2 coisas, SEM guardar nada entre
// chamadas: desenha o highlight do último clique (feedback visual) e
// posta a contagem ao vivo (sel.length puro). A leitura que de fato vira
// a lista final só acontece em get-tab-order-accumulated-selection/
// get-swipe-path-accumulated-selection (handlers mais abaixo), lendo
// figma.currentPage.selection NAQUELE INSTANTE — nunca um histórico.
// Debounce só da CONTAGEM ao vivo (2026-09-04-ah) — não da leitura final
// (que continua síncrona/literal em get-tab-order-accumulated-selection/
// get-swipe-path-accumulated-selection, sem nenhuma mudança). Motivo:
// alcançar um elemento aninhado em vários níveis de auto-layout exige
// "entrar" (drill-in) camada por camada no Figma, e CADA passo
// intermediário desse drill-in também dispara selectionchange — sem
// debounce, a contagem da barra mini sobia/descia a cada passo de
// navegação, mesmo sendo só trânsito até o elemento realmente desejado
// (ruído visual, não erro de dado: "Concluir seleção" já é uma ação
// explícita que só acontece depois que o designer solta o drill-in e move
// o mouse até o botão da barra mini — deslocamento físico que já
// ultrapassa qualquer debounce razoável, então a lista final nunca foi o
// problema). O highlight continua INSTANTÂNEO, sem debounce — é feedback
// visual de "o que está selecionado agora", precisa ser imediato.
let _tabOrderCountDebounceTimer = null;
let _swipePathCountDebounceTimer = null;

// Highlight temporário de clique durante a captura de Tabulação/Swipe
// REMOVIDO (2026-09-08, pedido do usuário: "gerando ruído e mantendo
// alguns ativos após o uso" — o retângulo [HighlightStroke] tinha um
// histórico real de sobreviver órfão no canvas em mais de uma janela de
// corrida assíncrona ao longo desta sessão, mesmo depois de 2 rodadas de
// correção). O feedback de "isto foi selecionado" agora vem só da própria
// seleção nativa do Figma (o node já fica selecionado/com o contorno azul
// padrão do Figma ao clicar) — sem desenhar nenhum retângulo próprio.
// Reconcilia uma sequência de cliques acumulada com a seleção ATUAL do
// canvas (2026-09-11, bug real corrigido — a correção estava documentada
// desde a manhã mas nunca havia sido implementada: _tabOrderClickSequence/
// _swipePathClickSequence eram declaradas e nunca usadas, e os handlers
// seguiam lendo figma.currentPage.selection direto, que ordena por árvore
// de camadas/z-index, não por ordem de clique). Regras:
// - node que ENTROU na seleção desde a última checagem vai pro FIM da
//   sequência (é o clique mais recente — ordem cronológica real);
// - node que SAIU da seleção é removido da sequência (shift+clique num
//   item já selecionado desmarca, e ele não deve continuar na trilha);
// - a ordem relativa dos que continuam selecionados nunca muda.
// Retorna a sequência reconciliada (array de ids, na ordem de clique).
function _reconcileClickSequence(prevSequence, currentSelection) {
  const currentIds = currentSelection.map(n => n.id);
  const currentIdSet = new Set(currentIds);
  const kept = prevSequence.filter(id => currentIdSet.has(id));
  const keptSet = new Set(kept);
  for (const id of currentIds) {
    if (!keptSet.has(id)) {
      kept.push(id);
      keptSet.add(id);
    }
  }
  return kept;
}

figma.on('selectionchange', () => {
  // Consome a supressão de UM ciclo de 'selectionchange' causado pelo
  // próprio hac (foco automático na réplica de trabalho — ver comentário em
  // _a11ySuppressNextSelectionChange acima). Sem isso, o foco programático
  // seria indistinguível de um clique real do designer nos 3 modos abaixo.
  if (_a11ySuppressNextSelectionChange) {
    _a11ySuppressNextSelectionChange = false;
    return;
  }

  if (_tabOrderModeActive) {
    // Rastreado SEM debounce — a ordem de clique precisa ser capturada no
    // instante exato de cada selectionchange, senão cliques rápidos em
    // sequência se perdem (o debounce de 500ms abaixo é só pra contagem
    // exibida na UI, que pode atrasar sem prejuízo).
    _tabOrderClickSequence = _reconcileClickSequence(_tabOrderClickSequence, figma.currentPage.selection);
    clearTimeout(_tabOrderCountDebounceTimer);
    _tabOrderCountDebounceTimer = setTimeout(() => {
      figma.ui.postMessage({ type: 'tab-order-accumulated-count-changed', count: figma.currentPage.selection.length });
    }, 500);
    return;
  }

  if (_swipePathModeActive) {
    _swipePathClickSequence = _reconcileClickSequence(_swipePathClickSequence, figma.currentPage.selection);
    clearTimeout(_swipePathCountDebounceTimer);
    _swipePathCountDebounceTimer = setTimeout(() => {
      figma.ui.postMessage({ type: 'swipe-path-accumulated-count-changed', count: figma.currentPage.selection.length });
    }, 500);
  }

  if (_a11yManualMatchModeActive) {
    // Registra a seleção REAL corrente (ver comentário em
    // _a11yManualMatchLastRealSelectionId) — chegou até aqui porque não foi
    // suprimida acima, então é garantidamente um clique do designer, nunca
    // o foco automático na réplica.
    const _sel = figma.currentPage.selection;
    _a11yManualMatchLastRealSelectionId = _sel.length > 0 ? _sel[0].id : null;
    clearTimeout(_a11yManualMatchDebounceTimer);
    // Mesmo debounce (500ms) do padrão acima — evita disparar
    // getMainComponentAsync a cada passo de drill-in até o elemento real.
    // BUG REAL CORRIGIDO (2026-09-22): resolve pelo id GRAVADO no instante
    // do evento (_a11yManualMatchLastRealSelectionId), não por
    // figma.currentPage.selection lida de novo quando o timer dispara — um
    // drill-in em andamento pode ter avançado a seleção pra um componente
    // FILHO nesses 500ms (ver comentário completo em
    // _resolveManualSpecMatchAndNotify, dsc-matching.js).
    _a11yManualMatchDebounceTimer = setTimeout(async () => {
      const _node = _a11yManualMatchLastRealSelectionId ? await _getSceneNodeById(_a11yManualMatchLastRealSelectionId) : null;
      _resolveManualSpecMatchAndNotify(null, _node);
    }, 500);
  }
});
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'ui-ready') {
    const currentUser = figma.currentUser
      ? { id: figma.currentUser.id, name: figma.currentUser.name, photoUrl: figma.currentUser.photoUrl }
      : null;
    const theme = figma.ui.theme || 'light';
    try {
      const scopedKey = _getHacDataStorageKey();
      // scopedKey é null quando o arquivo ainda não foi salvo (sem
      // figma.fileKey) — nesse caso não há chave própria possível, então
      // nem lê nem migra nada: o painel sempre nasce vazio.
      let savedState = scopedKey ? await figma.clientStorage.getAsync(scopedKey) : null;

      // Migração automática da chave global legada para a chave por-arquivo.
      // Só roda se a chave nova ainda estiver vazia (arquivo nunca migrado)
      // E a antiga tiver dado — condição que deixa de ser satisfeita assim
      // que a migração acontece uma vez, então não reaplica em aberturas
      // seguintes (nem neste arquivo, nem em nenhum outro).
      if (!savedState && scopedKey) {
        const legacyState = await figma.clientStorage.getAsync(HAC_DATA_LEGACY_KEY);
        if (legacyState) {
          await figma.clientStorage.setAsync(scopedKey, legacyState);
          await figma.clientStorage.setAsync(HAC_DATA_LEGACY_KEY, null);
          savedState = legacyState;
        }
      }

      // Backup no documento (2026-09-22) — a ÚNICA fonte que sobrevive a:
      // arquivo não salvo, troca de máquina, outra pessoa abrindo o arquivo,
      // cache limpo e reinstalação do plugin. Ver _writeHacDataToDocument.
      //
      // Quando as duas fontes existem, vence a que tem MAIS conteúdo, nunca
      // "a mais recente": não há timestamp confiável por item para um merge
      // real, e o cenário que importa é sempre o de recuperação (clientStorage
      // vazio/zerado por um dos motivos acima, documento íntegro). Preferir a
      // maior garante que reabrir o plugin jamais apague trabalho — no pior
      // caso o designer reencontra algo que tinha apagado, o que é
      // recuperável; o contrário não é.
      const docState = _readHacDataFromDocument();
      if (docState && _hacDataWeight(docState) > _hacDataWeight(savedState)) {
        savedState = docState;
        // Reidrata o cache local com o que veio do documento, pra que os
        // próximos saves/leituras já partam do estado recuperado.
        if (scopedKey) {
          try { await figma.clientStorage.setAsync(scopedKey, docState); } catch (e) { /* best-effort */ }
        }
      }

      // Onboarding "visto" fica em chave própria — por instalação do plugin,
      // não por projeto/hacData, e sobrevive a "Limpar Cache" (mesmo padrão
      // do onboarding do Handex).
      const onboardingSeen = await figma.clientStorage.getAsync('hac-onboarding-seen');
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        savedState: savedState || null,
        onboardingSeen: onboardingSeen || null
      });
    } catch (err) {
      console.error("Initialization error (continuing without saved state):", err);
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        savedState: null,
        onboardingSeen: null
      });
    }
    return;
  }

  // Disparado pelo frontend (não pelo ui-ready) logo APÓS o designer
  // confirmar a origem do projeto (Web/Mobile) pela primeira vez neste
  // arquivo — ver ensureA11yProjectOriginThen, accessibility.js. Nunca
  // bloqueante: retorna lista vazia se não houver handoff de outro
  // designer, e o frontend simplesmente não mostra nenhum modal nesse caso.
  if (msg.type === 'check-other-designers-sections') {
    const otherDesignersSections = _findOtherDesignersSessionSections(msg.currentUserId || null);
    figma.ui.postMessage({ type: 'other-designers-sections-checked', otherDesignersSections });
    return;
  }

  // Disparado pelo frontend no mesmo momento que check-other-designers-sections
  // (ver ensureA11yProjectOriginThen, accessibility.js) — avisa o designer que
  // ELE MESMO já documentou telas neste arquivo antes (reabertura, troca de
  // máquina/sessão). Nunca bloqueante: retorna priorSession null se não houver.
  if (msg.type === 'check-my-prior-session') {
    const priorSession = _findOwnPriorSessionSection(msg.currentUserId || null);
    figma.ui.postMessage({ type: 'my-prior-session-checked', priorSession });
    return;
  }

  if (msg.type === 'resize') {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  if (msg.type === 'resize-ui') {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  if (msg.type === 'save-storage') {
    // Backup NO DOCUMENTO (2026-09-22) — roda SEMPRE, inclusive quando não há
    // scopedKey (arquivo ainda não salvo), que era justamente o caso de perda
    // total silenciosa relatado pelo usuário. Ver comentário completo em
    // _writeHacDataToDocument (code.js). Primeiro porque é o caminho que
    // funciona em mais cenários; clientStorage segue logo abaixo como cache
    // rápido de leitura.
    _writeHacDataToDocument(msg.data);

    const scopedKey = _getHacDataStorageKey();
    if (!scopedKey) {
      // Arquivo ainda não salvo: sem identidade estável, não há chave própria
      // possível em clientStorage (ver _getHacDataStorageKey) — mas o backup
      // no documento acima já garantiu a persistência.
      return;
    }
    try {
      await figma.clientStorage.setAsync(scopedKey, msg.data);
    } catch (err) {
      console.warn("Storage save failed (possivelmente falta o plugin ID no manifest):", err);
    }
    return;
  }

  if (msg.type === 'save-onboarding-state') {
    try {
      await figma.clientStorage.setAsync('hac-onboarding-seen', msg.data);
    } catch (err) {
      console.warn("Onboarding state save failed:", err);
    }
    return;
  }

  // 'save-spec-modal-instruction-seen' removido em 2026-09-11 — a instrução
  // única de vida inteira que ele persistia foi substituída pela orientação
  // repetida do gate de seleção (openA11yCategoryPickerModal,
  // accessibility.js), que não precisa de estado salvo.

  if (msg.type === 'clear-cache') {
    try {
      const scopedKey = _getHacDataStorageKey();
      if (scopedKey) {
        await figma.clientStorage.setAsync(scopedKey, null);
      }
      // Limpa TAMBÉM o backup no documento (2026-09-22) — sem isto, "Limpar
      // Cache" apagaria só o clientStorage e a reabertura seguinte
      // restauraria tudo a partir do documento, fazendo o botão parecer
      // quebrado (o dado "voltaria sozinho").
      _clearHacDataFromDocument();
      figma.ui.postMessage({ type: 'cache-cleared' });
    } catch (e) {
      console.error("clear-cache failed:", e);
      figma.notify('Erro ao limpar cache', { error: true });
    }
    return;
  }

  if (msg.type === 'highlight-node') {
    // Retângulo [HighlightStroke] REMOVIDO por completo (2026-09-11, pedido
    // do usuário: "Highligth stroke na hora que ele fala que encontrou
    // outro template surge e não se apaga sozinha. Pode remover ele por
    // completo. ñ preciso dele") — sintoma real reportado no botão "Ver no
    // canvas" do alerta de handoff prévio (renderA11yPriorSessionAlert,
    // accessibility.js): esse alerta fica visível na tela o tempo todo
    // (não é modal transitório), então o stroke desenhado nunca tinha
    // motivo/gatilho pra sumir sozinho. A seleção nativa do Figma
    // (figma.currentPage.selection abaixo, já sempre ativa por padrão) já
    // destaca o node com a borda azul padrão de seleção — suficiente pra
    // qualquer um dos usos de focusNode/highlight-node no projeto, sem
    // precisar de um retângulo extra pra gerenciar/limpar.
    const node = await _getSceneNodeById(msg.id);
    if (node && node.visible && _nodeOnCurrentPage(node)) {
      if (msg.selectNode !== false) {
        // Foco programático (ver _a11ySuppressNextSelectionChange acima) —
        // nunca deve ser confundido com um clique real do designer pelos
        // modos de captura/matching que escutam 'selectionchange'.
        _a11ySuppressNextSelectionChange = true;
        figma.currentPage.selection = [node];
      }
      if (msg.shouldScroll !== false) {
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    }
    return;
  }

  // Resolve qual node o frontend deve focar (focusNode/highlight-node) pra
  // uma etapa de a11y (Leitor de Tela/Tabulação/Swipe) — 2026-09-11, pedido
  // do usuário: "o foco nessa etapa... deve ser feito na frame da réplica e
  // não no frame principal. O frame principal é o backup, a base." Cada
  // etapa foca a RÉPLICA DE TRABALHO da sua PRÓPRIA funcionalidade (não a
  // do Frame Principal nem a de outra etapa) — é nela que o designer marca/
  // edita, então é ela que precisa estar em destaque/selecionada. Sem
  // réplica ainda (primeira vez que a etapa é aberta pra esta área), cai no
  // targetNodeId (Frame Principal) — mesmo comportamento de antes desta
  // mudança — pra sempre ter algo válido pra focar mesmo com o clone ainda
  // não criado.
  if (msg.type === 'resolve-a11y-focus-node') {
    // area.targetNodeId (Frame Principal) vem do FRONTEND (msg.targetNodeId
    // — backend não tem acesso a hacData/a11yAreas[], ver comentário acima
    // sobre A11Y_ITEM_NUMBER_KEYS/a11yOrigin) — usado como fallback quando
    // a réplica de trabalho da etapa ainda não existe (primeira vez que a
    // etapa é aberta pra esta área).
    let nodeId = msg.targetNodeId || null;
    try {
      let clone = null;
      if (msg.kind === 'leitor') clone = _findSpecCloneForArea(msg.areaId);
      else if (msg.kind === 'tabulacao') clone = _findTabOrderCopyForArea(msg.areaId);
      else if (msg.kind === 'swipe') clone = _findSwipePathCopyForArea(msg.areaId);
      if (clone && !clone.removed) nodeId = clone.id;
    } catch (e) { }
    figma.ui.postMessage({ type: 'a11y-focus-node-resolved', areaId: msg.areaId, kind: msg.kind, nodeId, requestId: msg.requestId });
    return;
  }

  // Usados por toggleA11ySpecVisibility/toggleAreaGroupVisibility
  // (accessibility.js) — ocultar/mostrar um selo ou uma área inteira sem
  // apagar nada. forceState (hide-node) permite setar um estado explícito em
  // vez de sempre forçar oculto, usado por toggleAreaGroupVisibility ao
  // sincronizar vários nós de uma vez com o mesmo estado alvo.
  if (msg.type === 'hide-node') {
    const node = await _getSceneNodeById(msg.id);
    if (node) {
      node.visible = msg.forceState !== undefined ? msg.forceState : false;
    }
    return;
  }

  if (msg.type === 'show-node') {
    const node = await _getSceneNodeById(msg.id);
    if (node) node.visible = true;
    return;
  }

  if (msg.type === 'delete-node') {
    const node = await _getSceneNodeById(msg.id);
    if (node) {
      node.remove();
      figma.notify("Item excluído com sucesso");
    }
    return;
  }

  if (msg.type === "get-selection-name") {
    // Bug real corrigido (2026-09-17, print confirmado — ver comentário
    // completo em _a11yManualMatchLastRealSelectionId): enquanto o gate do
    // "+ Nova spec" está ativo, figma.currentPage.selection pode estar
    // apontando pra réplica de trabalho recém-focada (foco automático
    // concorrente, start-spec-copy/spec-copy-started), não pro elemento que
    // o designer efetivamente clicou. Nesse caso, prefere o registro da
    // última seleção REAL conhecida; fora do modo (ou sem nada capturado
    // ainda), cai no comportamento de sempre.
    let node = null;
    if (_a11yManualMatchModeActive && _a11yManualMatchLastRealSelectionId) {
      node = await _getSceneNodeById(_a11yManualMatchLastRealSelectionId);
    }
    if (!node) {
      const sel = figma.currentPage.selection;
      node = sel.length > 0 ? sel[0] : null;
    }
    // Resolve o componente DSC real da seleção manual — mesmo padrão do scan
    // (_a11yScanArea): só INSTANCE com mainComponent remoto é candidato,
    // nunca lança se getMainComponentAsync falhar. dscComponentName é o nome
    // cru do component set (containingFrame, ex: "[dsc] Icon Button"); null
    // quando não é INSTANCE remota reconhecida ou não há match no catálogo
    // (isUnmapped conta como "sem nome pra exibir" aqui — o campo read-only
    // do formulário mostra "Não identificado" nesse caso, decisão do
    // frontend, não deste handler).
    let dscComponentName = null;
    if (node && node.type === 'INSTANCE') {
      try {
        const mainComp = await node.getMainComponentAsync();
        if (mainComp && mainComp.remote && mainComp.key) {
          const resolved = _getDscComponentKeyToFrameMap().get(mainComp.key);
          if (resolved) dscComponentName = resolved.containingFrame;
        }
      } catch (e) { dscComponentName = null; }
    }
    figma.ui.postMessage({
      type: "selection-name",
      // id (2026-09-04-ae): usado pelo frontend pra checar se este nó já
      // tem uma spec documentada antes de deixar o designer criar outra
      // duplicada (aviso não-bloqueante em prefillA11yComponentName).
      id: node ? node.id : null,
      name: node ? node.name : null,
      mainText: node ? _findMainTextContent(node) : null,
      dscComponentName,
    });
    return;
  }

  // Usado tanto para confirmar uma spec de A11y (mapeamento puro: só
  // precisamos saber QUAL nó foi selecionado) quanto pela ferramenta "Marcar
  // Área".

  if (msg.type === "get-a11y-selection-info") {
    const sel = figma.currentPage.selection;
    // Nunca devolve um node que seja artefato do próprio hac (Section
    // organizadora, selo, conector, cópia de área) — evita que uma seleção
    // "presa" nesses nodes (comum logo após create-a11y-area, que seleciona
    // o selo recém-criado ao final) vire, sem o designer perceber, o alvo
    // de uma nova Área ou o pré-preenchimento do rótulo dela.
    const picked = sel.length > 0 && !_isHacOwnedNode(sel[0]) ? sel[0] : null;
    figma.ui.postMessage({
      type: "a11y-selection-info",
      id: picked ? picked.id : null,
      name: picked ? picked.name : null,
    });
    return;
  }

  // get-a11y-documentation-status (consultado por openA11yAreaModal antes
  // de abrir "Marcar Área", pra alimentar o aviso "Continuar/Iniciar nova
  // Section") foi REMOVIDO em 2026-09-04-k — ver comentário em
  // accessibility.js, openA11yAreaModal. Marcar Área agora sempre entra na
  // Section ativa, sem perguntar. _computeNextA11ySectionName (abaixo)
  // continua existindo — é a peça que o futuro mecanismo AUTOMÁTICO de
  // versionamento (disparado ao gerar/atualizar a Ficha de Handoff num
  // projeto já documentado antes, não um botão manual) vai reaproveitar.

  // ── "Marcar Área" ──────────────────────────────────────────────────────
  // Cria um selo numerado usando o componente REAL "[a11y] Conectores"
  // (mesma family do modo Linha das specs), na variante escolhida pelo
  // designer (msg.conector: superior/inferior/esquerda/direita/desativado).
  const A11Y_AREA_CONECTOR_KEYS = {
    superior:   'ff43b15ac0c078b35219984bf035c4c0f0089cf1',
    inferior:   'b355a26c5a89aea074effe28ca6767b08e4a7f99',
    esquerda:   'f9cd4394c0bfc48ae86d3028e836877887d23fcd',
    direita:    '08ac04391034777646eec9395c6d221189ee6d46',
    desativado: '71719f112ec0135b16df0deb6584fbc44af3aff2',
  };
  if (msg.type === "create-a11y-area") {
    (async () => {
      const node = await _getSceneNodeById(msg.targetNodeId);
      if (!node || !node.absoluteBoundingBox) {
        figma.notify("Elemento não encontrado no canvas — selecione novamente.");
        return;
      }
      // Segunda camada de defesa (get-a11y-selection-info já filtra na
      // origem) — nunca cria Área apontando pra um artefato do próprio hac,
      // mesmo que o targetNodeId chegue de outra fonte no futuro.
      if (_isHacOwnedNode(node)) {
        figma.notify("Selecione um elemento do seu design, não uma estrutura criada pelo hac.");
        return;
      }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const _conector = A11Y_AREA_CONECTOR_KEYS[msg.conector] ? msg.conector : 'superior';
      // Origem Web/Mobile perguntada no frontend (confirmA11yArea) — não vem
      // de area.origin (não existe mais como estado persistido), só decide
      // o componente deste badge. Mesmo fallback mobile→desktop de
      // _createTabOrderBadge/_tryImportA11yAgrupamento: se a direção não
      // existir no dicionário mobile, cai pro desktop.
      const usingMobileKeys = msg.origin === 'mobile' && A11Y_ITEM_NUMBER_KEYS_MOBILE[_conector];
      const _conectorKey = usingMobileKeys ? A11Y_ITEM_NUMBER_KEYS_MOBILE[_conector] : A11Y_AREA_CONECTOR_KEYS[_conector];
      // rawKeys divergem entre as duas libs — ver mesmo comentário em
      // _createTabOrderBadge (só "label#733:6" coincide).
      const propKeys = usingMobileKeys
        ? { number: 'número#1478:0', showLabel: 'mostrar label#733:0', label: 'label#733:6' }
        : { number: 'number#1478:0', showLabel: 'show label#733:0', label: 'label#733:6' };
      let badge = null;
      let usedRealComponent = true;
      try {
        const comp = await figma.importComponentByKeyAsync(_conectorKey);
        badge = comp.createInstance();
        badge.setProperties({
          [propKeys.number]: String(msg.number),
          [propKeys.label]: msg.label,
          [propKeys.showLabel]: true,
        });
      } catch (e) {
        usedRealComponent = false;
        badge = figma.createEllipse();
        badge.name = 'Selo de Área';
        badge.resize(32, 32);
        badge.fills = [{ type: "SOLID", color: hexToRgb('#005ca9') }];
      }

      const bb = node.absoluteBoundingBox;
      figma.currentPage.appendChild(badge);
      const _A11Y_AREA_GAP = 24;
      const targetCenterX = bb.x + bb.width / 2;
      const targetCenterY = bb.y + bb.height / 2;
      if (_conector === 'inferior') {
        badge.x = Math.round(targetCenterX - badge.width / 2);
        badge.y = Math.round(bb.y + bb.height + _A11Y_AREA_GAP);
      } else if (_conector === 'esquerda') {
        badge.x = Math.round(bb.x - badge.width - _A11Y_AREA_GAP);
        badge.y = Math.round(targetCenterY - badge.height / 2);
      } else if (_conector === 'direita') {
        badge.x = Math.round(bb.x + bb.width + _A11Y_AREA_GAP);
        badge.y = Math.round(targetCenterY - badge.height / 2);
      } else if (_conector === 'desativado') {
        badge.x = Math.round(targetCenterX - badge.width / 2);
        badge.y = Math.round(bb.y - badge.height - _A11Y_AREA_GAP);
      } else { // superior
        badge.x = Math.round(targetCenterX - badge.width / 2);
        badge.y = Math.round(bb.y - badge.height - _A11Y_AREA_GAP);
      }

      // Marca o selo (e o texto de fallback) pra que update-a11y-area-conector
      // consiga trocá-los sem tocar nos demais filhos do Grupo da Área — que
      // desde 2026-09-05 abriga também specs, cópias e a Ficha daquela área.
      badge.setPluginData('hacAreaBadge', 'true');
      /** @type {SceneNode[]} */
      const badgeNodes = [badge];
      if (!usedRealComponent) {
        const labelText = figma.createText();
        labelText.name = 'Label';
        labelText.fontName = { family: "Inter", style: "Bold" };
        labelText.fontSize = 12;
        labelText.fills = [{ type: "SOLID", color: hexToRgb('#005ca9') }];
        labelText.characters = msg.label;
        figma.currentPage.appendChild(labelText);
        labelText.x = Math.round(badge.x + badge.width + 8);
        labelText.y = Math.round(badge.y + (badge.height / 2) - (labelText.height / 2));
        labelText.setPluginData('hacAreaBadge', 'true');
        badgeNodes.push(labelText);
      }
      // O FRAME ORIGINAL entra no mesmo GROUP do selo (2026-09-11, pedido
      // explícito do usuário: "mover o frame original de verdade" pra
      // dentro da Section — antes ele nunca era movido, só fotografado via
      // snapshot na hora de montar a Ficha, e ficava solto no canvas fora
      // de qualquer Section). figma.group() reparenta preservando a
      // posição visual absoluta automaticamente (não precisa de nenhum
      // ajuste manual de x/y aqui, diferente de _reparentIntoSection/
      // _reparentIntoAreaGroup) — mas TIRA o frame de onde quer que
      // estivesse antes (raiz da página, ou aninhado dentro de outro
      // frame/grupo do design). Efeito colateral aceito conscientemente
      // pelo usuário: se o frame estava dentro de um pai com Auto Layout,
      // esse pai perde o filho e pode realocar os demais.
      badgeNodes.push(node);
      // O selo SEMPRE nasce dentro de um GROUP próprio (2026-09-05), mesmo
      // no caminho normal em que ele é uma INSTANCE única — antes o "grupo"
      // da área era a própria instância, e não havia onde pendurar os
      // artefatos daquela área (specs, cópias de Tabulação/Swipe, Ficha),
      // que ficavam espalhados em Sections separadas por TIPO. Com o GROUP,
      // area.id passa a ser um container real: tudo da área vive dentro
      // dele, e excluir a área é uma única operação de canvas.
      const group = figma.group(badgeNodes, figma.currentPage);
      // Nome enxuto "N · Label": o Grupo é o item que o designer navega no
      // painel de Layers agora, não mais uma INSTANCE técnica solta — o
      // prefixo antigo "[A11yArea | N]" nunca foi lido por nenhum código
      // (busca é sempre por pluginData/id), era só ruído visual.
      group.name = `${msg.number} · ${msg.label}`;
      group.locked = false;
      group.setPluginData('hacCategory', 'a11y');
      // Guardamos o id do frame ORIGINAL (não-injetado pelo hac, então
      // invisível pro filtro hacCategory) pra que o cálculo de posição livre
      // da cópia de Ordem de Tabulação (_findFreeTabOrderCopyPosition)
      // consiga localizar e evitar sobrepor o frame de QUALQUER área, não só
      // da área sendo processada no momento.
      group.setPluginData('hacAreaTargetNodeId', node.id);

      _reparentIntoSection(group, () => _getOrCreateA11ySessionSection(msg.designerName, msg.designerId, node));

      figma.currentPage.selection = [group];
      figma.viewport.scrollAndZoomIntoView([group]);

      figma.ui.postMessage({
        type: "a11y-area-created",
        area: {
          id: group.id,
          number: msg.number,
          label: msg.label,
          conector: _conector,
          targetNodeId: node.id,
          targetNodeName: node.name,
          autoDetect: !!msg.autoDetect,
        }
      });

      figma.notify(usedRealComponent
        ? "Área marcada."
        : 'Área marcada — não foi possível usar o selo real da lib "Design Acessível" (modo simplificado).');
    })();
    return;
  }

  // ── Editar conector de uma Área já existente (2026-09-04-l, pedido do
  // usuário: "Mais ações" do card ganha a opção de trocar a direção do
  // selo) — edita o CONTEÚDO do grupo já existente (área.id), NUNCA
  // apaga/recria o grupo raiz em si: o Figma não deixa "editar" um node
  // pra trocar de componente, só apagar+criar, e um node novo sempre
  // ganha um ID novo — como area.id é referenciado em TUDO relacionado à
  // área (a11yAreaId de specs, tabOrderItems, a11ySwipePaths, handoffFicha),
  // recriar o grupo quebraria todos esses vínculos. Em vez disso: remove
  // só os FILHOS do grupo (instância antiga do selo + label de fallback,
  // se houver), importa/cria a nova instância na direção escolhida, e
  // insere DENTRO do mesmo grupo (mesmo id, preservado o tempo todo).
  if (msg.type === "update-a11y-area-conector") {
    (async () => {
      const rootNode = await _getSceneNodeById(msg.areaId);
      const node = await _getSceneNodeById(msg.targetNodeId);
      // area.id pode ser um GROUP (caminho de fallback, quando a lib
      // "Design Acessível" não estava disponível na criação — badge +
      // label texto agrupados) OU uma INSTANCE solta (caminho normal, com
      // a lib disponível — ver create-a11y-area acima: usedRealComponent
      // true faz `group = badge`, ou seja, o "grupo" é a própria
      // instância). Bug real corrigido (2026-09-04-p): o handler só
      // aceitava GROUP e falhava silenciosamente (reason nunca chegava a
      // aparecer porque a11y-area-conector-update-failed não tinha
      // nenhum toast até essa mesma correção) sempre que a área foi
      // criada com o componente real — o caso mais comum.
      if (!rootNode || (rootNode.type !== 'GROUP' && rootNode.type !== 'INSTANCE')) {
        figma.ui.postMessage({ type: 'a11y-area-conector-update-failed', areaId: msg.areaId, reason: 'O selo desta área não foi encontrado no canvas — pode ter sido apagado ou movido.' });
        return;
      }
      if (!node || !node.absoluteBoundingBox) {
        figma.ui.postMessage({ type: 'a11y-area-conector-update-failed', areaId: msg.areaId, reason: 'O elemento desta área não existe mais no canvas.' });
        return;
      }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const _AREA_CONECTOR_KEYS = {
        superior:   'ff43b15ac0c078b35219984bf035c4c0f0089cf1',
        inferior:   'b355a26c5a89aea074effe28ca6767b08e4a7f99',
        esquerda:   'f9cd4394c0bfc48ae86d3028e836877887d23fcd',
        direita:    '08ac04391034777646eec9395c6d221189ee6d46',
        desativado: '71719f112ec0135b16df0deb6584fbc44af3aff2',
      };
      const _conector = _AREA_CONECTOR_KEYS[msg.conector] ? msg.conector : 'superior';
      const usingMobileKeys = msg.origin === 'mobile' && A11Y_ITEM_NUMBER_KEYS_MOBILE[_conector];
      const _conectorKey = usingMobileKeys ? A11Y_ITEM_NUMBER_KEYS_MOBILE[_conector] : _AREA_CONECTOR_KEYS[_conector];
      const propKeys = usingMobileKeys
        ? { number: 'número#1478:0', showLabel: 'mostrar label#733:0', label: 'label#733:6' }
        : { number: 'number#1478:0', showLabel: 'show label#733:0', label: 'label#733:6' };

      const bb = node.absoluteBoundingBox;
      const _A11Y_AREA_GAP = 24;
      const targetCenterX = bb.x + bb.width / 2;
      const targetCenterY = bb.y + bb.height / 2;
      function _positionBadge(badge) {
        if (_conector === 'inferior') {
          badge.x = Math.round(targetCenterX - badge.width / 2);
          badge.y = Math.round(bb.y + bb.height + _A11Y_AREA_GAP);
        } else if (_conector === 'esquerda') {
          badge.x = Math.round(bb.x - badge.width - _A11Y_AREA_GAP);
          badge.y = Math.round(targetCenterY - badge.height / 2);
        } else if (_conector === 'direita') {
          badge.x = Math.round(bb.x + bb.width + _A11Y_AREA_GAP);
          badge.y = Math.round(targetCenterY - badge.height / 2);
        } else if (_conector === 'desativado') {
          badge.x = Math.round(targetCenterX - badge.width / 2);
          badge.y = Math.round(bb.y - badge.height - _A11Y_AREA_GAP);
        } else { // superior
          badge.x = Math.round(targetCenterX - badge.width / 2);
          badge.y = Math.round(bb.y - badge.height - _A11Y_AREA_GAP);
        }
      }

      let finalNode = rootNode;
      // Declarada no escopo externo (2026-09-05, bug real corrigido): o
      // ramo INSTANCE (swapComponent, sempre bem-sucedido pra chegar até
      // aqui) nunca lidava com fallback de lib indisponível, então
      // sempre é o selo real nesse caminho — só o ramo GROUP abaixo pode
      // setar false. figma.notify no final do handler lê esta variável
      // fora dos dois ramos; declará-la só dentro do `else` (como estava)
      // lançava ReferenceError sempre que rootNode.type === 'INSTANCE'.
      let usedRealComponent = true;

      if (rootNode.type === 'INSTANCE') {
        // Caminho normal: troca o COMPONENTE da instância existente (a
        // direção muda o component set inteiro, não é uma property) via
        // swapComponent — preserva o node/id da instância (area.id nunca
        // muda), diferente de apagar+recriar.
        try {
          const comp = await figma.importComponentByKeyAsync(_conectorKey);
          rootNode.swapComponent(comp);
          rootNode.setProperties({
            [propKeys.number]: String(msg.number),
            [propKeys.label]: msg.label,
            [propKeys.showLabel]: true,
          });
          _positionBadge(rootNode);
        } catch (e) {
          console.error('[hac] update-a11y-area-conector: falha ao trocar componente da instância.', e && e.message);
          figma.ui.postMessage({ type: 'a11y-area-conector-update-failed', areaId: msg.areaId, reason: 'Não foi possível importar o selo real da lib "Design Acessível" para a nova direção.' });
          return;
        }
      } else {
        // Caminho GROUP: desde 2026-09-05 é o caminho NORMAL (create-a11y-area
        // sempre envolve o selo num grupo), não mais só o fallback de lib
        // indisponível. Remove/insere apenas os nodes marcados com
        // 'hacAreaBadge' — os demais filhos do Grupo são os artefatos da área
        // (specs, cópias de Tabulação/Swipe, Ficha) e não podem ser tocados
        // aqui. Grupos criados ANTES dessa marcação existir só têm selo+label
        // como filhos, então cair pra "todos os filhos" preserva o
        // comportamento antigo nesses casos.
        let badge = null;
        usedRealComponent = true;
        try {
          const comp = await figma.importComponentByKeyAsync(_conectorKey);
          badge = comp.createInstance();
          badge.setProperties({
            [propKeys.number]: String(msg.number),
            [propKeys.label]: msg.label,
            [propKeys.showLabel]: true,
          });
        } catch (e) {
          usedRealComponent = false;
          badge = figma.createEllipse();
          badge.name = 'Selo de Área';
          badge.resize(32, 32);
          badge.fills = [{ type: "SOLID", color: hexToRgb('#005ca9') }];
        }

        figma.currentPage.appendChild(badge);
        _positionBadge(badge);
        badge.setPluginData('hacAreaBadge', 'true');

        /** @type {SceneNode[]} */
        let newChildren = [badge];
        if (!usedRealComponent) {
          const labelText = figma.createText();
          labelText.name = 'Label';
          labelText.fontName = { family: "Inter", style: "Bold" };
          labelText.fontSize = 12;
          labelText.fills = [{ type: "SOLID", color: hexToRgb('#005ca9') }];
          labelText.characters = msg.label;
          figma.currentPage.appendChild(labelText);
          labelText.x = Math.round(badge.x + badge.width + 8);
          labelText.y = Math.round(badge.y + (badge.height / 2) - (labelText.height / 2));
          labelText.setPluginData('hacAreaBadge', 'true');
          newChildren = [badge, labelText];
        }

        const _markedOldChildren = rootNode.children.filter(child => {
          try { return child.getPluginData && child.getPluginData('hacAreaBadge') === 'true'; } catch (e) { return false; }
        });
        const oldChildren = _markedOldChildren.length > 0 ? _markedOldChildren : rootNode.children.slice();
        newChildren.forEach(child => rootNode.appendChild(child));
        oldChildren.forEach(child => { try { child.remove(); } catch (e) { } });
      }

      figma.currentPage.selection = [finalNode];
      figma.viewport.scrollAndZoomIntoView([finalNode]);

      figma.ui.postMessage({
        type: 'a11y-area-conector-updated',
        areaId: msg.areaId,
        conector: _conector,
      });
      figma.notify(usedRealComponent
        ? 'Conector atualizado.'
        : 'Conector atualizado — não foi possível usar o selo real da lib "Design Acessível" (modo simplificado).');
    })();
    return;
  }

  // ── Detecção Automática — scan enxuto de uma Área Marcada ───────────────
  if (msg.type === "scan-frame") {
    (async () => {
      let selection;
      if (msg.nodeId) {
        const specificNode = await _getSceneNodeById(msg.nodeId);
        selection = specificNode ? [specificNode] : [];
      } else {
        selection = figma.currentPage.selection;
      }

      // Nunca escaneia a Section organizadora do próprio hac (nem qualquer
      // node marcado com hacCategory por ela) — sem esta checagem, uma Área
      // cujo targetNodeId acabou apontando pra Section (bug de seleção
      // contaminada, ver create-a11y-area) redetectava os próprios
      // selos/specs já criados como se fossem componentes novos do design a
      // cada "Gerar Automaticamente"/reescanear (bug real, 2026-09-03).
      selection = selection.filter(n => !_isHacOwnedNode(n));

      if (selection.length === 0) {
        figma.ui.postMessage({
          type: "scan-result",
          origin: msg.origin || null,
          error: "Nenhum item selecionado. Selecione a Área Marcada no canvas para escanear.",
        });
        return;
      }

      const merged = { components: [], icons: [], typography: [], frames: [], vectors: [], images: [] };
      for (const node of selection) {
        const partial = await _a11yScanArea(node);
        Object.keys(merged).forEach(k => merged[k].push(...partial[k]));
      }
      Object.keys(merged).forEach(k => merged[k].sort((a, b) => (a.treeOrder ?? Infinity) - (b.treeOrder ?? Infinity)));

      figma.ui.postMessage({
        type: "scan-result",
        origin: msg.origin || null,
        data: merged,
      });
    })();
    return;
  }

  // ── Criação unificada de spec de Acessibilidade ─────────────────────────
  // Toda spec do hac é uma spec de a11y — não existe discriminador
  // a11yType null/normal como no Handex (aqui opts.a11yType é sempre uma das
  // 5 categorias). Mantém o nome do tipo de mensagem para não introduzir um
  // contrato paralelo sem necessidade.
  //
  // opts.a11ySourceLib (novo, 2026-08-26): repasse puro, sem lógica própria
  // aqui — é o mesmo objeto {id, label} (ver SOURCE_LIB_BY_SLUG em
  // _getDscComponentKeyToFrameMap) que o frontend recebeu em
  // dscComponentMatch.sourceLib ao detectar o componente (scan-result) e
  // reenvia ao criar a spec, análogo a opts.a11yOrigin. Usado só para o
  // badge de origem de UI (accessibility.js, _a11ySpecItemHtml) — nunca
  // decide marcador/dicionário de import, só opts.a11yOrigin faz isso.
  if (msg.type === "create-unified-spec") {
    (async () => {
     try {
      const opts = msg.opts;
      let node = null;
      if (opts.targetNodeId) {
        node = await _getSceneNodeById(opts.targetNodeId);
      }
      if (!node) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.notify("Selecione um elemento no canvas.");
          return;
        }
        node = selection[0];
      }
      // Guardado ANTES de `node` ser possivelmente trocado pro node
      // equivalente dentro do clone (bloco abaixo) — o frontend persiste
      // `spec.targetNodeId` em hacData e usa esse id pra correlacionar com
      // o elemento ORIGINAL em outros fluxos (Detecção Automática marcando
      // "já documentado", edição de spec, destaque no canvas) — nunca deve
      // virar o id de um node que só existe dentro do clone.
      const _originalTargetNodeId = node.id;

      // Bug real corrigido (2026-09-08, pedido do usuário): specs passam a
      // documentar sobre uma CÓPIA da área, nunca mais sobre o frame
      // ORIGINAL — mesma garantia que Tabulação/Swipe já davam ("o design
      // original nunca é tocado"). Só se aplica quando a spec tem uma Área
      // Marcada de origem conhecida (opts.a11yAreaId) E essa área resolve
      // um targetNodeId clonável — specs sem área (fluxo legado/manual sem
      // Área Marcada) continuam apontando pro elemento original, sem
      // clone, exatamente como sempre funcionou (nada a clonar sem saber
      // qual é "a área"). `node` (resolvido acima, pelo id ORIGINAL vindo
      // do formulário/seleção) é traduzido pro node EQUIVALENTE dentro do
      // clone via nodeMap — mesma tradução que Tabulação já faz.
      let specClone = null;
      // workAnchor devolvido pra que o frontend grave, se esta chamada
      // acabou de CRIAR o clone da área pela 1ª vez (2026-09-21) — ver
      // comentário completo em start-spec-copy/_findFreeTabOrderCopyPosition.
      let _specCloneWorkAnchor = null;
      // Nó de referência pra posição manual do card (2026-09-21, ver
      // confirmA11ySpec no frontend, accessibility.js — sempre lê a
      // seleção ATUAL do canvas ao aplicar, sem perguntar nada ao
      // designer) — resolvido AQUI, antes do clone, porque precisa passar
      // pela mesma tradução original→clone que `node` recebe logo abaixo
      // (opts.manualAnchorNodeId sempre chega como id do canvas ORIGINAL,
      // igual opts.targetNodeId).
      let _manualAnchorNode = opts.manualAnchorNodeId ? await _getSceneNodeById(opts.manualAnchorNodeId) : null;
      if (opts.a11yAreaId && opts.a11yAreaTargetNodeId) {
        try {
          const resolved = await _resolveActiveSpecClone(opts.a11yAreaId, opts.a11yAreaTargetNodeId, opts.sectionName, opts.designerName, opts.designerId, opts.savedAnchor);
          if (resolved) {
            _specCloneWorkAnchor = resolved.workAnchor || null;
            const mappedNode = resolved.nodeMap.get(node.id);
            if (mappedNode && mappedNode.absoluteBoundingBox) {
              node = mappedNode;
              specClone = resolved.clone;
            } else {
              console.error('[hac] create-unified-spec: node não encontrado no clone da área — desenhando sobre o original.', JSON.stringify({ targetNodeId: node.id }));
            }
            if (_manualAnchorNode) {
              const mappedAnchor = resolved.nodeMap.get(_manualAnchorNode.id);
              // Só troca pro nó do clone se o mapeamento existir de fato —
              // se o elemento de referência escolhido não pertence a esta
              // área/clone (caso raro, seleção trocada entre marcar
              // referência e aplicar), cai no fallback abaixo (bounds do
              // nó original), nunca quebra a criação da spec por causa
              // disso.
              if (mappedAnchor && mappedAnchor.absoluteBoundingBox) _manualAnchorNode = mappedAnchor;
            }
          }
        } catch (e) {
          console.error('[hac] create-unified-spec: falha ao resolver/criar o clone da área — desenhando sobre o original.', e && e.message);
        }
      }

      const themeColor = hexToRgb(opts.color || '#005ca9');
      const themeFill  = hexToRgb(opts.fillColor || opts.color || '#EBF4FB');
      const _specSide = opts.guideSide || 'right';
      const _tagRadius = 21; // selos de A11y são círculos cheios no material da vertical
      const _layerTag = 'SpecA11y';

      let specCard = null;
      let _a11yImportFailReason = null;
      try {
        specCard = await _tryImportA11yComponent(opts);
        specCard.name = 'Spec Notes';
        try { specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]; } catch (e) { }
        try {
          if ('paddingLeft' in specCard) {
            specCard.paddingLeft = 12;
            specCard.paddingRight = 12;
            specCard.paddingTop = 12;
            specCard.paddingBottom = 12;
          }
        } catch (e) { }
      } catch (e) {
        specCard = null;
        _a11yImportFailReason = e && e.message ? e.message : String(e);
      }

      // Fallbacks ESPERADOS: variação sem componente real catalogado — não é
      // erro de biblioteca, cai no card procedural normalmente.
      const _A11Y_EXPECTED_FALLBACK_PREFIXES = [
        'a11y-elemento-outro-sem-componente-real',
        'a11y-titulo-mobile-sem-variante-real',
        'a11y-informacoes-customizavel-sem-variante-real',
        'a11y-estrutura-variacao-sem-import-real',
        'a11y-estrutura-marco-customizavel-sem-conteudo-catalogado',
      ];
      const _isExpectedFallback = _a11yImportFailReason && _A11Y_EXPECTED_FALLBACK_PREFIXES.some(p => _a11yImportFailReason.startsWith(p));
      if (_a11yImportFailReason && !_isExpectedFallback) {
        figma.notify('Não foi possível criar a especificação de acessibilidade. (' + _a11yImportFailReason + ')', { error: true });
        return;
      }

      if (!specCard) {
        specCard = figma.createFrame();
        specCard.name = 'Spec Notes';
        specCard.layoutMode = "VERTICAL";
        specCard.paddingLeft = 12;
        specCard.paddingRight = 12;
        specCard.paddingTop = 12;
        specCard.paddingBottom = 12;
        specCard.itemSpacing = 12;
        specCard.cornerRadius = 8;
        specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        specCard.strokes = [{ type: "SOLID", color: themeColor }];
        specCard.strokeWeight = 1.5;
        specCard.primaryAxisSizingMode = "AUTO";
        specCard.counterAxisSizingMode = "AUTO";

        const headerRow = figma.createFrame();
        headerRow.layoutMode = "HORIZONTAL";
        headerRow.itemSpacing = 8;
        headerRow.fills = [];
        headerRow.primaryAxisSizingMode = "AUTO";
        headerRow.counterAxisSizingMode = "AUTO";

        const tagCircle = figma.createFrame();
        tagCircle.name = 'Tag';
        tagCircle.layoutMode = "HORIZONTAL";
        tagCircle.primaryAxisSizingMode = "FIXED";
        tagCircle.counterAxisSizingMode = "FIXED";
        tagCircle.resize(42, 42);
        tagCircle.cornerRadius = _tagRadius;
        tagCircle.fills = [{ type: "SOLID", color: themeFill }];
        tagCircle.strokes = [{ type: "SOLID", color: themeColor }];
        tagCircle.strokeWeight = 1.5;
        tagCircle.primaryAxisAlignItems = "CENTER";
        tagCircle.counterAxisAlignItems = "CENTER";
        const tagText = figma.createText();
        tagText.characters = opts.letter;
        // Escala real: mantido acima do piso da escala (não estava na lista
        // de pontos fora de escala) — "title/small" (20px) é o token mais
        // próximo de 18px disponível, usado aqui por ser o maior texto do
        // card procedural (letra do selo).
        await _applyFichaTypography(tagText, 'title/small');
        tagText.fills = [{ type: "SOLID", color: themeColor }];
        tagCircle.appendChild(tagText);
        headerRow.appendChild(tagCircle);

        headerRow.counterAxisAlignItems = "CENTER";

        const title = figma.createText();
        title.characters = node.name;
        // Escala real (corrigido 2026-09-11, era 12px/Inter Bold — já no
        // piso real, só faltava a família Roboto e o lineHeight/
        // letterSpacing do token real): "label/tiny" (12px, peso 700/bold).
        await _applyFichaTypography(title, 'label/tiny');
        title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
        headerRow.appendChild(title);
        specCard.appendChild(headerRow);

        if (opts.categoryLabel) {
          const pill = figma.createFrame();
          pill.name = `Categoria/${opts.categoryLabel}`;
          pill.layoutMode = "HORIZONTAL";
          pill.paddingLeft = 8; pill.paddingRight = 8;
          pill.paddingTop = 4; pill.paddingBottom = 4;
          pill.cornerRadius = 12;
          pill.primaryAxisSizingMode = "AUTO";
          pill.counterAxisSizingMode = "AUTO";
          pill.fills = [{ type: "SOLID", color: themeFill }];
          pill.strokes = [{ type: "SOLID", color: themeColor }];
          const pillText = figma.createText();
          pillText.characters = opts.categoryLabel;
          // Escala real (corrigido 2026-09-11, era 10px/Inter Medium —
          // abaixo do piso real de 12px): elevado para "label/tiny" (12px),
          // com weightOverride=500 pra manter o peso visual Medium.
          await _applyFichaTypography(pillText, 'label/tiny', 500);
          pillText.fills = [{ type: "SOLID", color: themeColor }];
          pill.appendChild(pillText);
          specCard.appendChild(pill);
        }

        if (opts.note) {
          const desc = figma.createText();
          desc.characters = opts.note;
          desc.textAutoResize = "WIDTH_AND_HEIGHT";
          // Escala real (corrigido 2026-09-11, era 11px/Inter Regular —
          // abaixo do piso real de 12px): elevado para "label/tiny" (12px),
          // com weightOverride=400 pra manter o peso visual Regular de
          // texto corrido.
          await _applyFichaTypography(desc, 'label/tiny', 400);
          desc.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
          specCard.appendChild(desc);
        }

        if (opts.properties && opts.properties.length > 0) {
          const propsFrame = figma.createFrame();
          propsFrame.layoutMode = "VERTICAL";
          propsFrame.itemSpacing = 4;
          propsFrame.fills = [];
          propsFrame.primaryAxisSizingMode = "AUTO";
          propsFrame.counterAxisSizingMode = "AUTO";
          propsFrame.name = 'Propriedades';
          propsFrame.layoutAlign = "INHERIT";

          // for...of (não mais .forEach) — necessário pra poder `await` a
          // aplicação de tipografia de cada linha em sequência.
          for (const p of opts.properties) {
            const row = figma.createFrame();
            row.name = `Prop/${p.label}`;
            row.layoutMode = "HORIZONTAL";
            row.itemSpacing = 12;
            row.fills = [];
            row.primaryAxisSizingMode = "AUTO";
            row.counterAxisSizingMode = "AUTO";
            row.layoutAlign = "INHERIT";
            row.counterAxisAlignItems = "CENTER";

            const pLabel = figma.createText();
            pLabel.characters = p.label.toUpperCase();
            pLabel.textAutoResize = "WIDTH_AND_HEIGHT";
            // Escala real (corrigido 2026-09-11, era 10px/Inter Medium —
            // abaixo do piso real de 12px): elevado para "label/tiny"
            // (12px), com weightOverride=500 pra manter o peso Medium.
            await _applyFichaTypography(pLabel, 'label/tiny', 500);
            pLabel.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];

            const pVal = figma.createText();
            pVal.characters = p.token || String(p.value);
            pVal.textAutoResize = "WIDTH_AND_HEIGHT";
            // Escala real (corrigido 2026-09-11, era 11px/Inter Bold —
            // abaixo do piso real de 12px): elevado para "label/tiny" (12px,
            // peso 700/bold — já é o peso "oficial" do token).
            await _applyFichaTypography(pVal, 'label/tiny');
            pVal.fills = [{ type: "SOLID", color: p.token ? themeColor : { r: 0.1, g: 0.1, b: 0.1 } }];

            row.appendChild(pLabel);
            row.appendChild(pVal);

            propsFrame.appendChild(row);
          }
          specCard.appendChild(propsFrame);
        }

        if (opts.link) {
          const linkTxt = figma.createText();
          // Ordem corrigida (2026-09-14, mesmo bug de "W 0"/texto quebrado
          // letra por letra já documentado em _appendFichaBlockTitle):
          // textAutoResize precisa ser setado ANTES de `.characters` — um
          // TEXT recém-criado nasce em 'NONE' (largura/altura travadas em
          // 0), e escrever texto nesse estado trava a largura nesse valor.
          // Abandonado também o layoutAlign='STRETCH' legado — `specCard`
          // (pai) é Hug/Hug (AUTO/AUTO), então não existe largura FIXED
          // real pra esticar contra; 'WIDTH_AND_HEIGHT' (mesmo modo já
          // usado pelos textos irmãos `pLabel`/`pVal` deste fallback)
          // deixa o texto medir seu próprio tamanho natural.
          linkTxt.textAutoResize = "WIDTH_AND_HEIGHT";
          linkTxt.characters = opts.link;
          linkTxt.textDecoration = "UNDERLINE";
          linkTxt.hyperlink = { type: "URL", value: opts.link };
          // Escala real (corrigido 2026-09-11, era 11px/Inter Regular —
          // abaixo do piso real de 12px): elevado para "label/tiny" (12px),
          // com weightOverride=400 pra manter o peso visual Regular.
          await _applyFichaTypography(linkTxt, 'label/tiny', 400);
          linkTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0.4, b: 0.8 } }];
          specCard.appendChild(linkTxt);
        }
      } // fim do fallback procedural (if (!specCard))

      let groupNodes = [];
      let _absCardX = 0, _absCardY = 0, _absCardW = 0, _absCardH = 0;
      let _markerImportFailReason = null;

      const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
      if (bounds) {
        let marker = null;
        try {
          marker = opts.drawMode === 'linha'
            ? await _tryImportA11yConectorLinha(opts)
            : await _tryImportA11yAgrupamento(opts);
        } catch (e) {
          // Fallback brando: NÃO aborta a spec inteira (o card já foi criado
          // com sucesso acima, seja o componente real ou o procedural). Uma
          // combinação categoria/orientação sem marcador catalogado — ou uma
          // falha pontual de importComponentByKeyAsync (rede/lib
          // desconectada) — não deveria impedir o designer de documentar o
          // elemento; ele fica sem o contorno/conector visual, mas o card com
          // toda a informação (nome acessível, observações, notas) já existe
          // no canvas e pode ser revisado depois. Segue o fluxo com
          // marker = null; os pontos abaixo já toleram isso.
          marker = null;
          _markerImportFailReason = e && e.message ? e.message : String(e);
        }

        let _markerAnchorBounds = bounds;

        if (marker && opts.drawMode !== 'linha') {
          figma.currentPage.appendChild(marker);
          try {
            marker.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));
          } catch (e) { /* variante sem resize livre — segue com o tamanho padrão */ }
          marker.x = Math.round(bounds.x - 16);
          marker.y = Math.round(bounds.y - 16);
        } else if (marker) {
          // O componente "Conector" NÃO é simétrico: o selo fica numa ponta e
          // a linha se estende até a outra, que é o ponto de contato real com
          // o elemento. A ponta de contato é sempre OPOSTA ao lado indicado
          // pelo nome da variante.
          const _side = opts.guideSide || 'right';
          figma.currentPage.appendChild(marker);
          if (_side === 'right') { marker.x = bounds.x + bounds.width; marker.y = bounds.y + bounds.height / 2 - marker.height / 2; }
          else if (_side === 'left') { marker.x = bounds.x - marker.width; marker.y = bounds.y + bounds.height / 2 - marker.height / 2; }
          else if (_side === 'top') { marker.x = bounds.x + bounds.width / 2 - marker.width / 2; marker.y = bounds.y - marker.height; }
          else { marker.x = bounds.x + bounds.width / 2 - marker.width / 2; marker.y = bounds.y + bounds.height; }
        }
        if (marker) {
          groupNodes.push(marker);
          _markerAnchorBounds = marker.absoluteBoundingBox || _markerAnchorBounds;
        }

        figma.currentPage.appendChild(specCard);

        const side = opts.guideSide || 'right';
        const _specLetter = opts.letter;

        // Bug real corrigido (2026-09-08): antes, `node` era sempre
        // descendente direto do frame ORIGINAL (filho de figma.currentPage),
        // então subir a árvore até "o pai de nível página" achava certo o
        // frame-tela inteiro. Desde que specs passaram a documentar sobre
        // um CLONE (specClone, resolvido acima — reparentado pra dentro da
        // Section de sessão ANTES deste ponto), `node` agora é descendente
        // do clone, que por sua vez já não é mais filho direto da página —
        // o mesmo loop chegaria na SECTION inteira (bounds gigantes,
        // contendo qualquer coisa já desenhada nela), não no clone. Usa
        // `specClone` diretamente quando existir; só cai no loop antigo
        // (subir até o pai de nível página) no caminho legado sem clone.
        let _anchorBounds;
        if (specClone && specClone.absoluteBoundingBox) {
          _anchorBounds = specClone.absoluteBoundingBox;
        } else {
          let _anchorNode = node;
          while (_anchorNode.parent && _anchorNode.parent.type !== 'PAGE') {
            _anchorNode = _anchorNode.parent;
          }
          _anchorBounds = _anchorNode.absoluteBoundingBox || bounds;
        }

        const _letterMap = {};
        const _updateLetterMap = (l, bb) => {
          if (!_letterMap[l]) _letterMap[l] = { x: bb.x, topY: bb.y, bottom: bb.y + bb.height, right: bb.x + bb.width };
          if (bb.y + bb.height > _letterMap[l].bottom) _letterMap[l].bottom = bb.y + bb.height;
          if (bb.x + bb.width > _letterMap[l].right) _letterMap[l].right = bb.x + bb.width;
          if (bb.x < _letterMap[l].x) _letterMap[l].x = bb.x;
          if (bb.y < _letterMap[l].topY) _letterMap[l].topY = bb.y;
        };
        // Título usa selo FIXO "H" repetido em elementos diferentes — não
        // alimenta o agrupamento por "mesma tag" (empilharia specs de títulos
        // diferentes uma sobre a outra); cada spec de Título posiciona de
        // forma independente. Specs vivem dentro da Section de sessão, por
        // isso escaneamos os filhos dela, não a página inteira.
        //
        // Bug real corrigido (2026-09-09): usava _getOrCreateA11ySection
        // (modelo ANTIGO, por nome fixo A11Y_SECTION_NAME — pré-reorganização
        // de 2026-09-08) — sempre que opts.sectionName chegava vazio (caso
        // normal: hacData.activeSectionName só é setado quando o designer
        // escolhe explicitamente uma versão de Section, ver
        // getA11yActiveSectionName), essa chamada criava/reaproveitava uma
        // Section FANTASMA com o nome fixo "hac — Especificações de
        // Acessibilidade" (sem timestamp/designer), só pra ler .children —
        // solta e paralela à Section de sessão real (identificada por
        // pluginData hacSessionSection, não por nome), onde o specGroup de
        // fato é reparentado logo abaixo (_reparentIntoSection(specGroup,
        // () => _getOrCreateA11ySessionSection(...))). Trocado pra a MESMA
        // função usada pelo reparenting real, unificando os dois pontos —
        // nunca mais cria uma Section a mais.
        // Bug real corrigido (2026-09-16, reportado com print): a Section de
        // sessão pode conter VÁRIOS frames de tela lado a lado (ex.: "Swipe",
        // o frame de trabalho, e outro — caso real do usuário). Antes deste
        // fix, o scan abaixo somava specs de QUALQUER frame dentro da Section
        // inteira num único `_letterMap` global, sem levar em conta a qual
        // tela cada spec pertence. Resultado: ao criar uma spec de letra
        // inédita (não bate com nenhuma entrada existente em `_letterMap`),
        // o branch seguinte (`Object.keys(_letterMap).length > 0`, mais
        // abaixo) pegava o `_rightmost`/`_leftmost` entre TODAS as specs da
        // Section — inclusive de uma tela vizinha nada relacionada — e
        // ancorava o card novo colado nela, "vazando" pra longe do frame
        // real de origem. Filtra o scan pra só considerar specs cuja faixa
        // vertical (Y) tem interseção com a faixa vertical de
        // `_anchorBounds` (o mesmo frame de tela / clone de área do node
        // sendo documentado agora, já resolvido acima) — usa só o eixo Y
        // (não X) porque o card de uma spec sempre fica ao LADO do próprio
        // frame (side left/right, offset de 64-164px), fora da faixa X dele
        // por design; comparar bounding box X+Y completo rejeitaria até
        // specs legítimas da mesma tela. Frames de tela lado a lado
        // tipicamente têm X diferente mas Y igual/sobreposto — mesma faixa Y
        // é o sinal confiável de "mesma tela", sem precisar de novo
        // pluginData pra registrar o frame de origem de cada spec.
        const _stackScanNodes = _getOrCreateA11ySessionSection(opts.designerName, opts.designerId).children || [];
        const _yRangesIntersect = (bb, anchor) =>
          bb.y < anchor.y + anchor.height && bb.y + bb.height > anchor.y;
        if (opts.a11yType !== 'titulo') _stackScanNodes.forEach(n => {
          if (n.type !== 'GROUP') return;
          const newFmt = n.name.match(new RegExp('^\\[' + _layerTag + ' \\| ([A-Z]\\d*(?:\\.\\d+)*) \\| ([a-z]+)\\] '));
          if (!newFmt) return;
          if (newFmt[2] !== side) return;
          const specNotes = n.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes' && c !== specCard);
          if (!specNotes) return;
          const bb = 'absoluteRenderBounds' in specNotes ? (specNotes.absoluteBoundingBox || specNotes.absoluteRenderBounds) : specNotes.absoluteBoundingBox;
          if (!bb) return;
          if (_anchorBounds && !_yRangesIntersect(bb, _anchorBounds)) return;
          _updateLetterMap(newFmt[1], bb);
        });

        // Specs com Área Marcada (opts.a11yAreaId) ficam organizadas em
        // sub-colunas por CATEGORIA (opts.a11yType) dentro do espaço da área:
        // specs da MESMA área E MESMA categoria empilham na MESMA coluna X;
        // categorias diferentes da mesma área ganham colunas X diferentes,
        // lado a lado. opts.existingAreaSpecIds = irmãs da MESMA
        // área+categoria; opts.existingAreaAllSpecIds = irmãs da área
        // inteira (fallback pra achar a coluna mais à direita já ocupada
        // quando a categoria é nova na área).
        const _areaColKey = opts.a11yAreaId ? `${opts.a11yAreaId}::${opts.a11yType}` : null;
        const _areaMap = {};
        if (opts.a11yAreaId && Array.isArray(opts.existingAreaSpecIds) && opts.existingAreaSpecIds.length > 0) {
          for (const _sid of opts.existingAreaSpecIds) {
            if (!_sid) continue;
            const _sibling = await _getSceneNodeById(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = ('children' in _sibling) && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes');
            const _bb = (_siblingNotes && ('absoluteRenderBounds' in _siblingNotes ? (_siblingNotes.absoluteBoundingBox || _siblingNotes.absoluteRenderBounds) : _siblingNotes.absoluteBoundingBox))
              || ('absoluteRenderBounds' in _sibling ? (_sibling.absoluteBoundingBox || _sibling.absoluteRenderBounds) : _sibling.absoluteBoundingBox);
            if (!_bb) continue;
            if (!_areaMap[_areaColKey]) {
              _areaMap[_areaColKey] = { x: _bb.x, topY: _bb.y, bottom: _bb.y + _bb.height, right: _bb.x + _bb.width };
            } else {
              const _a = _areaMap[_areaColKey];
              if (_bb.y + _bb.height > _a.bottom) _a.bottom = _bb.y + _bb.height;
              if (_bb.x + _bb.width > _a.right) _a.right = _bb.x + _bb.width;
              if (_bb.x < _a.x) _a.x = _bb.x;
              if (_bb.y < _a.topY) _a.topY = _bb.y;
            }
          }
        }

        // Bug real corrigido (2026-09-16, 2ª tentativa — a 1ª mexeu só no
        // scan de `_letterMap`/faixa Y abaixo, que nunca é o caminho usado
        // aqui: áreas com `opts.a11yAreaId` sempre caem neste bloco de
        // colunas por categoria, nunca no `_letterMap`). Causa raiz real:
        // este branch só registrava o `right` (borda direita) da spec mais
        // à direita entre TODAS as categorias da área, sem nenhum teto —
        // cada categoria NOVA que aparece pela primeira vez numa área
        // (rotina normal do wizard de revisão em lote, que passa por várias
        // categorias em sequência, caso real do print "Item 6 de 30")
        // nascia numa coluna inteiramente nova, sempre mais uma
        // `cardW + _SPEC_COL_GAP` à direita da anterior — sem nunca voltar.
        // Com 5 categorias reais (A11Y_CATEGORIES) e cards de ~260-320px,
        // a 5ª coluna nova já nasce ~1500-1800px à direita do frame de
        // origem — fora da faixa visível de qualquer frame mobile
        // (~375-414px), aparecendo "solta bem à direita de toda a Section"
        // exatamente como no print. Agora também registra `bottom` (ponto
        // mais baixo ocupado por QUALQUER spec da área) e aplica WRAP: uma
        // nova coluna de categoria só nasce ao lado da anterior enquanto
        // isso mantém o conjunto dentro de `_AREA_MAX_COLS` larguras de
        // frame a partir de `_anchorBounds` (o mesmo frame/clone de origem,
        // já resolvido acima) — ao ultrapassar esse teto, quebra pra uma
        // nova "linha" de colunas, voltando ao X do frame e empilhando
        // abaixo do ponto mais baixo já ocupado por qualquer spec da área
        // (nunca sobrepõe o que já existe). Mantém specs sempre próximas do
        // frame real, sem depender de heurística de faixa Y (que nunca era
        // consultada neste caminho) nem de reescrever o schema pra gravar
        // o frame de origem em pluginData (mudança maior, ainda não feita).
        let _areaRightmostOtherCategory = null;
        let _areaBottomMost = null;
        if (opts.a11yAreaId && Array.isArray(opts.existingAreaAllSpecIds) && opts.existingAreaAllSpecIds.length > 0) {
          for (const _sid of opts.existingAreaAllSpecIds) {
            if (!_sid) continue;
            const _sibling = await _getSceneNodeById(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = ('children' in _sibling) && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes');
            const _bb = (_siblingNotes && ('absoluteRenderBounds' in _siblingNotes ? (_siblingNotes.absoluteBoundingBox || _siblingNotes.absoluteRenderBounds) : _siblingNotes.absoluteBoundingBox))
              || ('absoluteRenderBounds' in _sibling ? (_sibling.absoluteBoundingBox || _sibling.absoluteRenderBounds) : _sibling.absoluteBoundingBox);
            if (!_bb) continue;
            if (!_areaMap[_areaColKey] && (!_areaRightmostOtherCategory || _bb.x + _bb.width > _areaRightmostOtherCategory.right)) {
              _areaRightmostOtherCategory = { topY: _bb.y, right: _bb.x + _bb.width };
            }
            if (!_areaBottomMost || _bb.y + _bb.height > _areaBottomMost) {
              _areaBottomMost = _bb.y + _bb.height;
            }
          }
        }

        const _SPEC_GAP = 32;
        const _SPEC_COL_GAP = 64;
        const cardW = specCard.width;
        const cardH = specCard.height;
        // Teto de colunas por "linha" de categorias, relativo à largura do
        // próprio frame/clone de origem (_anchorBounds) — acima disso, a
        // próxima categoria nova quebra pra uma linha abaixo em vez de
        // continuar se afastando pra sempre.
        const _AREA_MAX_COLS = 3;
        let targetX, targetY;

        // Bounds do elemento de referência pra posição manual (2026-09-21) —
        // resolvido aqui, não antes, porque cardW/cardH (usados pro lado
        // "left"/"top") só existem a partir deste ponto.
        const _manualAnchorBounds = _manualAnchorNode
          ? ('absoluteRenderBounds' in _manualAnchorNode
              ? (_manualAnchorNode.absoluteBoundingBox || _manualAnchorNode.absoluteRenderBounds)
              : _manualAnchorNode.absoluteBoundingBox)
          : null;

        if (opts.pinnedPosition) {
          // Edição de spec (delete+recreate): mantém a spec exatamente onde
          // estava, sem reempilhar. Tem prioridade sobre a posição manual
          // (abaixo) — reconfirmar uma spec já existente nunca deve pulá-la
          // de lugar, mesmo que o designer tenha deixado o modo de posição
          // manual ligado por engano.
          targetX = opts.pinnedPosition.x;
          targetY = opts.pinnedPosition.y;
        } else if (_manualAnchorBounds) {
          // Elemento selecionado no canvas no momento de "Aplicar" (sempre
          // lido, ver confirmA11ySpec no frontend, accessibility.js) —
          // ignora todo o empilhamento automático (letra/área, que o
          // usuário reportou não funcionar bem) e ancora só ao lado do
          // elemento de referência, no lado escolhido em "Lado da Guia".
          // Mesmo cálculo usado no fallback "nenhuma spec anterior" abaixo,
          // só que a partir de _manualAnchorBounds em vez de _anchorBounds
          // (frame de origem inteiro) — mais a checagem de colisão logo
          // abaixo, que empurra pra baixo se o card cair sobre outro já
          // existente.
          if (side === 'right') {
            targetX = _manualAnchorBounds.x + _manualAnchorBounds.width + 100;
            targetY = _manualAnchorBounds.y;
          } else if (side === 'left') {
            targetX = _manualAnchorBounds.x - cardW - 100;
            targetY = _manualAnchorBounds.y;
          } else if (side === 'bottom') {
            targetX = _manualAnchorBounds.x;
            targetY = _manualAnchorBounds.y + _manualAnchorBounds.height + 100;
          } else { // top
            targetX = _manualAnchorBounds.x;
            targetY = _manualAnchorBounds.y - cardH - 100;
          }
          // Bug real corrigido (2026-09-21, pedido do usuário: "garantir que
          // ao selecionar um elemento do canvas, um card nunca fique um
          // sobre o outro, ele deve posicionar mais abaixo") — a posição
          // manual, ao contrário de todos os outros branches acima, nunca
          // checava colisão com cards JÁ existentes: dois designers (ou o
          // mesmo, duas vezes) escolhendo o mesmo elemento de referência
          // sempre calculavam o MESMO X/Y, sobrepondo os cards. Reusa
          // _rectsOverlap (já usado por _findFreeTabOrderCopyPosition) contra
          // TODAS as specs já desenhadas na Section de sessão (mesmo
          // conjunto que _stackScanNodes varre logo acima) — em colisão,
          // empurra o card pra baixo, mesmo X, até achar uma faixa Y livre.
          // Nunca mexe em X (o designer escolheu explicitamente "ao lado
          // deste elemento" — só a altura é renegociada).
          // specGroup (o GROUP desta spec) só é criado mais abaixo via
          // figma.group — neste ponto _stackScanNodes só pode conter specs
          // JÁ existentes, nunca a que está sendo criada agora.
          const _manualOccupied = [];
          _stackScanNodes.forEach(n => {
            if (n.type !== 'GROUP') return;
            const _notes = n.children && n.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes');
            const _bb = _notes && ('absoluteRenderBounds' in _notes ? (_notes.absoluteBoundingBox || _notes.absoluteRenderBounds) : _notes.absoluteBoundingBox);
            if (_bb) _manualOccupied.push(_bb);
          });
          let _manualGuard = 0;
          while (_manualGuard < 200) {
            const _rect = { left: targetX, right: targetX + cardW, top: targetY, bottom: targetY + cardH };
            const _hit = _manualOccupied.find(bb => _rectsOverlap(_rect, { left: bb.x, right: bb.x + bb.width, top: bb.y, bottom: bb.y + bb.height }));
            if (!_hit) break;
            targetY = _hit.y + _hit.height + _SPEC_GAP;
            _manualGuard++;
          }
        } else if (opts.a11yAreaId && _areaMap[_areaColKey]) {
          targetX = _areaMap[_areaColKey].x;
          targetY = _areaMap[_areaColKey].bottom + _SPEC_GAP;
        } else if (opts.a11yAreaId && _areaRightmostOtherCategory) {
          const _anchorRight = _anchorBounds ? (_anchorBounds.x + _anchorBounds.width) : _areaRightmostOtherCategory.right;
          const _maxRight = _anchorRight + (_AREA_MAX_COLS * (cardW + _SPEC_COL_GAP));
          const _wouldBeRight = _areaRightmostOtherCategory.right + _SPEC_COL_GAP + cardW;
          if (_wouldBeRight > _maxRight && _anchorBounds) {
            // Wrap: volta pra 1ª coluna (ao lado do frame), abaixo de tudo
            // que já existe na área — nunca mais longe do que isso.
            targetX = _anchorRight + _SPEC_COL_GAP;
            targetY = (_areaBottomMost != null ? _areaBottomMost : _anchorBounds.y) + _SPEC_GAP;
          } else {
            targetX = _areaRightmostOtherCategory.right + _SPEC_COL_GAP;
            targetY = _areaRightmostOtherCategory.topY;
          }
        } else if (_letterMap[_specLetter]) {
          targetX = _letterMap[_specLetter].x;
          if (side === 'top') {
            targetY = _letterMap[_specLetter].topY - cardH - _SPEC_GAP;
          } else {
            targetY = _letterMap[_specLetter].bottom + _SPEC_GAP;
          }
        } else if (Object.keys(_letterMap).length > 0) {
          if (side === 'left') {
            const _leftmost = Object.values(_letterMap).reduce((a, v) => v.x < a.x ? v : a);
            targetX = _leftmost.x - cardW - _SPEC_COL_GAP;
            targetY = _leftmost.topY;
          } else {
            const _rightmost = Object.values(_letterMap).reduce((a, v) => v.right > a.right ? v : a);
            targetX = _rightmost.right + _SPEC_COL_GAP;
            targetY = _rightmost.topY;
          }
        } else {
          if (side === 'right') {
            targetX = _anchorBounds.x + _anchorBounds.width + 100;
            targetY = _anchorBounds.y;
          } else if (side === 'left') {
            targetX = _anchorBounds.x - cardW - 100;
            targetY = _anchorBounds.y;
          } else if (side === 'bottom') {
            targetX = _anchorBounds.x;
            targetY = _anchorBounds.y + _anchorBounds.height + 100;
          } else { // top
            targetX = _anchorBounds.x;
            targetY = _anchorBounds.y - cardH - 100;
          }
        }

        _absCardX = Math.round(targetX);
        _absCardY = Math.round(targetY);
        _absCardW = Math.round(specCard.width);
        _absCardH = Math.round(specCard.height);
        specCard.x = _absCardX;
        specCard.y = _absCardY;
        groupNodes.push(specCard);

        // Modo "Linha": o marcador real importado já É o conector completo
        // (linha + selo embutidos no componente da lib) — não desenha nada
        // mais aqui, senão duplica a linha.
        if (opts.drawConnection !== false && opts.drawMode !== 'linha') {
          const _anchorB = _markerAnchorBounds;
          let startPt, endPt;
          if (side === 'right') {
            startPt = { x: _anchorB.x + _anchorB.width, y: _anchorB.y + _anchorB.height / 2 };
            endPt   = { x: specCard.x, y: specCard.y + specCard.height / 2 };
          } else if (side === 'left') {
            startPt = { x: _anchorB.x, y: _anchorB.y + _anchorB.height / 2 };
            endPt   = { x: specCard.x + specCard.width, y: specCard.y + specCard.height / 2 };
          } else if (side === 'bottom') {
            startPt = { x: _anchorB.x + _anchorB.width / 2, y: _anchorB.y + _anchorB.height };
            endPt   = { x: specCard.x + specCard.width / 2, y: specCard.y };
          } else { // top
            startPt = { x: _anchorB.x + _anchorB.width / 2, y: _anchorB.y };
            endPt   = { x: specCard.x + specCard.width / 2, y: specCard.y + specCard.height };
          }

          const connector = figma.createVector();
          connector.name = 'Conector';
          connector.vectorPaths = [{ windingRule: "NONZERO", data: `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}` }];
          connector.strokes = [{ type: "SOLID", color: themeColor }];
          connector.strokeWeight = 1.5;
          connector.dashPattern = [4, 4];
          connector.strokeCap = "ROUND";
          figma.currentPage.appendChild(connector);
          groupNodes.push(connector);

          const _DOT_R = 4;
          const startDot = figma.createEllipse();
          startDot.name = 'DotInicio';
          startDot.resize(_DOT_R * 2, _DOT_R * 2);
          startDot.fills = [{ type: "SOLID", color: themeColor }];
          startDot.strokes = [];
          figma.currentPage.appendChild(startDot);
          startDot.x = startPt.x - _DOT_R;
          startDot.y = startPt.y - _DOT_R;
          groupNodes.push(startDot);

          const endDot = figma.createEllipse();
          endDot.name = 'DotFim';
          endDot.resize(_DOT_R * 2, _DOT_R * 2);
          endDot.fills = [{ type: "SOLID", color: themeColor }];
          endDot.strokes = [];
          figma.currentPage.appendChild(endDot);
          endDot.x = endPt.x - _DOT_R;
          endDot.y = endPt.y - _DOT_R;
          groupNodes.push(endDot);
        }
      } else {
        figma.currentPage.appendChild(specCard);
        _absCardX = Math.round(figma.viewport.center.x);
        _absCardY = Math.round(figma.viewport.center.y);
        _absCardW = Math.round(specCard.width);
        _absCardH = Math.round(specCard.height);
        specCard.x = _absCardX;
        specCard.y = _absCardY;
        groupNodes.push(specCard);
      }

      const specGroup = figma.group(groupNodes, figma.currentPage);
      specGroup.name = `[${_layerTag} | ${opts.letter} | ${_specSide}] ${node.name}`;
      // Specs de A11y nascem travadas — o marcador já é calculado pra
      // contornar o elemento certo, não é pra arrastar/reposicionar. Um
      // cadeado na listagem destrava se precisar.
      specGroup.locked = true;
      specGroup.setPluginData('hacCategory', 'a11y');
      // hacSpecForArea (2026-09-08): fecha uma lacuna que já existia antes
      // desta mudança — specs nunca gravavam nenhum pluginData de área no
      // próprio node, só no array local (a11ySpecs). Permite localizar/
      // remover specs de uma área só pelo canvas, sem depender do estado
      // local (mesmo padrão já usado por Tabulação/Swipe/Ficha).
      if (opts.a11yAreaId) specGroup.setPluginData('hacSpecForArea', opts.a11yAreaId);

      // Reparenting (2026-09-08, pedido do usuário: artefatos de uma Área
      // não precisam mais estar aninhados dentro de um Grupo específico
      // dela — só precisam estar na MESMA Section, porque serão
      // reorganizados dentro da Ficha de Handoff depois):
      // - Com clone (specClone resolvido acima): grupo-overlay IRMÃO do
      //   clone, mesmo princípio já usado por Tabulação/Swipe pra evitar o
      //   bug de clipsContent (um elemento pequeno documentado perto da
      //   borda do clone pode "vazar" pra fora se ficar dentro dele).
      // - Sem clone (spec sem Área Marcada, fluxo legado): direto na
      //   Section de sessão, como antes desta mudança já fazia via
      //   _reparentArtifactIntoArea/_reparentIntoA11ySection (Grupo da
      //   Área mantido só como fallback de áreas legadas).
      let _reparentedIntoOverlay = false;
      if (specClone && !specClone.removed) {
        try {
          const specOverlayGroup = _getOrCreateCloneOverlayGroup(specClone, 'hacSpecGroupForClone', '[Specs de Leitor de Tela]', opts.a11yAreaId);
          _reparentIntoAreaGroup(specGroup, specOverlayGroup);
          _reparentedIntoOverlay = true;
          await _ensureCloneWorkFrame(specClone, specOverlayGroup, 'Réplica de Trabalho — Leitor de Tela');
        } catch (e) {
          console.error('[hac] create-unified-spec: reparenting pro grupo overlay falhou, caindo pra Section de sessão.', e && e.message);
        }
      }
      if (!_reparentedIntoOverlay) {
        _reparentIntoSection(specGroup, () => _getOrCreateA11ySessionSection(opts.designerName, opts.designerId));
      }

      // BUG REAL CORRIGIDO (2026-09-21, item 3 — "empilhamento entre telas
      // diferentes"): cada spec nova cresce `specOverlayGroup` (irmão do
      // clone, dentro de "[HAC] Handoff - {Func}") em ABSOLUTE — mas
      // `handoffFrame` NÃO tem Auto Layout (ver _fitFichaHandoffFrameToChildren)
      // e só é redimensionado quando algo chama essa função explicitamente.
      // Antes desta correção, isso só acontecia dentro de
      // _ensureLegendBesideClone, rodada UMA vez (na criação do clone) —
      // specs seguintes cresciam o overlay sem nunca re-"fit"ar o
      // handoffFrame, então "[HAC] Documentação" (Hug, pai de tudo) media
      // uma altura desatualizada (menor que a real, sem contar os cards).
      // _getVerticalAnchorForNewArea lê exatamente esse bounding box pra
      // decidir onde a PRÓXIMA área nasce — subdimensionado, a próxima área
      // podia nascer ainda dentro da faixa ocupada pelos cards da anterior.
      // Refaz a cadeia de fit (handoffFrame → itensFrame/telaFrame →
      // Section de sessão) toda vez que um specGroup novo entra, mesmo
      // princípio já usado pelos 3 builders da Ficha ao final de cada um.
      if (_reparentedIntoOverlay && specClone && !specClone.removed) {
        try {
          const handoffFrame = specClone.parent;
          if (handoffFrame && !handoffFrame.removed) {
            _fitFichaHandoffFrameToChildren(handoffFrame);
            const section = handoffFrame.parent;
            const itensFrame = section && section.parent;
            if (itensFrame && !itensFrame.removed) {
              _fitTelaFrameWidthFromItensFrame(itensFrame);
              _fitSessionSectionFromItensFrame(itensFrame);
            }
          }
        } catch (e) {
          console.error('[hac] create-unified-spec: falha ao reajustar o tamanho do bloco/Documentação após novo card.', e && e.message);
        }
      }

      figma.ui.postMessage({
        type: "spec-created",
        // workAnchor (2026-09-21) — só preenchido quando esta chamada criou
        // o clone de trabalho da área PELA 1ª VEZ; o frontend grava em
        // hacData.a11yAreas[].workAnchor e reenvia em toda chamada seguinte
        // pra MESMA área — a posição, uma vez fixada, nunca muda.
        workAnchor: _specCloneWorkAnchor,
        spec: {
          id: specGroup.id,
          targetNodeId: _originalTargetNodeId,
          name: node.name,
          letter: opts.letter,
          color: opts.color,
          fillColor: opts.fillColor || null,
          category: opts.category || "",
          type: opts.categoryLabel || "Sem categoria",
          note: opts.note,
          properties: opts.properties,
          excecoes: opts.excecaoInicial ? [opts.excecaoInicial] : [],
          guideSide: opts.guideSide || 'right',
          cardX: _absCardX,
          cardY: _absCardY,
          cardW: _absCardW,
          cardH: _absCardH,
          a11yType: opts.a11yType || null,
          a11ySubtype: opts.a11ySubtype || null,
          a11yOrigin: opts.a11yOrigin || 'web',
          a11ySourceLib: opts.a11ySourceLib || null,
          a11yDscComponentName: opts.a11yDscComponentName || null,
          a11yAreaId: opts.a11yAreaId || null,
          drawMode: opts.drawMode || 'contorno',
          needsReview: !!opts.needsReview,
        }
      });

      if (_markerImportFailReason) {
        // Card criado com sucesso (real ou procedural), mas o marcador visual
        // (contorno/conector) não pôde ser importado — ver fallback brando
        // acima. Nunca deixa a spec sumir por causa disso; só avisa que falta
        // revisar o destaque visual manualmente.
        figma.notify(`Especificação criada sem o marcador visual (contorno/conector) — não foi possível importá-lo (${_markerImportFailReason}). Revise o destaque manualmente.`, { error: true, timeout: 6000 });
      } else if (_isExpectedFallback) {
        figma.notify(`Especificação criada com card desenhado (sem componente real catalogado para esta variação: ${_a11yImportFailReason}). Arraste para posicionar.`);
      } else if (!opts.silent) {
        figma.notify("Especificação de acessibilidade criada.");
      }
     } catch (e) {
      // Rede de segurança de topo (2026-09-09) — antes, qualquer exceção
      // não tratada em algum ponto do fluxo (entre a resolução do node e o
      // postMessage de sucesso) matava a Promise em silêncio: nenhum
      // 'spec-created' chegava ao frontend, que só percebia via timeout de
      // 15s (_createA11ySpecAndWait) — sintoma real reportado: "Não foi
      // possível criar esta especificação — item pulado", sem nenhuma
      // pista da causa real (só visível no console do Figma, se alguém
      // tivesse aberto). Reporta o erro de verdade ao designer.
      console.error('[hac] create-unified-spec: falhou.', e && (e.stack || e.message));
      figma.notify(`Não foi possível criar a especificação: ${(e && e.message) || 'erro desconhecido'}`, { error: true, timeout: 6000 });
     }
    })();
    return;
  }

  if (msg.type === "unlock-spec-group") {
    const targetLocked = msg.locked !== undefined ? msg.locked : false;
    for (const specId of (msg.specIds || [])) {
      const specGroup = await _getSceneNodeById(specId);
      if (!specGroup) continue;
      specGroup.locked = targetLocked;
    }
    return;
  }

  // ── Ordem de Tabulação ───────────────────────────────────────────────
  const A11Y_ITEM_NUMBER_KEYS = {
    superior:   'ff43b15ac0c078b35219984bf035c4c0f0089cf1',
    inferior:   'b355a26c5a89aea074effe28ca6767b08e4a7f99',
    esquerda:   'f9cd4394c0bfc48ae86d3028e836877887d23fcd',
    direita:    '08ac04391034777646eec9395c6d221189ee6d46',
    desativado: '71719f112ec0135b16df0deb6584fbc44af3aff2',
  };

  // Origem (web/mobile) da Ordem de Tabulação é decidida por ÁREA MARCADA,
  // não por spec individual — diferente das specs de categoria (elemento/
  // titulo/etc.), uma Área não tem "categoria" própria, é só um agrupamento
  // espacial. O backend (aqui) não tem acesso a hacData/a11yAreas[] (isso
  // vive só no frontend); o frontend resolve a origem da área uma única vez
  // por sessão de revisão e manda pronta em msg.a11yOrigin em cada chamada
  // de draw-tab-order-badge — ver accessibility.js
  // (_tabOrderDrawPendingBadge) e A11Y_ITEM_NUMBER_KEYS_MOBILE (topo do
  // arquivo).

  if (msg.type === "start-tab-order-mode") {
    _tabOrderModeActive = true;
    // Zera a sequência de cliques da captura anterior (2026-09-11) — sem
    // isso, ids de uma sessão antiga sobrevivem e podem reaparecer no
    // começo da lista se o mesmo node for clicado de novo.
    _tabOrderClickSequence = [];
    return;
  }

  if (msg.type === "stop-tab-order-mode") {
    _tabOrderModeActive = false;
    return;
  }

  // "Iniciar trilha de swipe" dispara isto ANTES de abrir a escuta de
  // cliques — mesmo padrão de start-tab-order-copy (2026-09-04-ac): clona
  // o frame da Área IMEDIATAMENTE (cópia vazia, sem nenhuma linha ainda),
  // o frame ORIGINAL fica intocado durante todo o fluxo manual, e o
  // highlight/acumulação de cada clique passam a operar sobre o node
  // equivalente dentro desta cópia (ver listener de selectionchange e
  // _resolveSwipePathCloneSelectionToOriginalId acima).
  if (msg.type === "start-swipe-path-mode") {
    (async () => {
      const root = await _getSceneNodeById(msg.targetNodeId);
      if (!root || !root.absoluteBoundingBox) {
        figma.notify("Tela não encontrada no canvas — selecione novamente.");
        figma.ui.postMessage({ type: "swipe-path-copy-started", cloneId: null });
        return;
      }
      if (typeof root.clone !== 'function') {
        figma.notify("Este elemento não pode ser copiado — selecione a tela sobre um frame/grupo.");
        figma.ui.postMessage({ type: "swipe-path-copy-started", cloneId: null });
        return;
      }

      const { clone, nodeMap } = await _createSwipePathCloneForArea(root, msg.areaId, msg.sectionName, msg.designerName, msg.designerId);
      if (msg.areaId) _activeSwipePathCloneMaps.set(msg.areaId, nodeMap);

      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);

      _swipePathModeActive = true;
      // Zera a sequência de cliques da captura anterior (2026-09-11) —
      // depois de ativar o modo e DEPOIS do selection = [clone] acima, pra
      // que o próprio clone (selecionado programaticamente, não clicado
      // pelo designer) nunca entre na trilha como primeiro ponto.
      _swipePathClickSequence = [];
      figma.ui.postMessage({ type: "swipe-path-copy-started", cloneId: clone.id });
    })();
    return;
  }

  if (msg.type === "stop-swipe-path-mode") {
    _swipePathModeActive = false;
    return;
  }

  // Cancelamento do fluxo manual de Trilha de Swipe (espelha
  // delete-tab-order-draft-copy): a cópia rascunho fica órfã se o designer
  // desistir — remove pelo mesmo pluginData de sempre e zera o estado em
  // memória.
  if (msg.type === "delete-swipe-path-draft-copy") {
    _removeExistingSwipePathCopiesForArea(msg.areaId);
    _activeSwipePathCloneMaps.delete(msg.areaId);
    return;
  }

  // "Concluir seleção" (frontend) pede a seleção ATUAL do canvas — lê
  // figma.currentPage.selection LITERALMENTE neste instante (2026-09-04-af,
  // substitui o acumulador em memória: ver comentário completo no listener
  // de selectionchange acima), traduz cada nó clone→original, dedupe (2+
  // nós selecionados podem resolver pro mesmo original, caso raro) e
  // ordena em zigue-zague antes de devolver.
  if (msg.type === "get-tab-order-accumulated-selection") {
    (async () => {
      // Fonte de ORDEM: _tabOrderClickSequence (ordem cronológica real de
      // clique, rastreada pelo listener de selectionchange), nunca
      // figma.currentPage.selection — bug real reportado 2x pelo usuário
      // (2026-09-08 "7,6,5,4 em vez de 4,5,6,7"; 2026-09-11 "coloca o
      // primeiro item na terceira posição"): a API do Figma NÃO garante
      // que `selection` preserve ordem de clique, ela reflete a ordem
      // estrutural da árvore de camadas (z-index). A 1ª correção (remover
      // o zigue-zague) tratou só metade do problema; a ordem continuava
      // vindo de `selection`. Agora `selection` é usada só como FILTRO
      // ("ainda está selecionado?"), nunca como fonte de ordem.
      const selById = new Map(figma.currentPage.selection.filter(n => !!n && !!n.absoluteBoundingBox).map(n => [n.id, n]));
      const seen = new Set();
      const ordered = [];
      for (const clickedId of _tabOrderClickSequence) {
        const n = selById.get(clickedId);
        if (!n) continue;
        const originalId = _resolveTabOrderCloneSelectionToOriginalId(n.id);
        if (seen.has(originalId)) continue;
        seen.add(originalId);
        ordered.push(n);
      }
      figma.ui.postMessage({
        type: 'tab-order-accumulated-selection-result',
        points: ordered.map(n => ({ nodeId: _resolveTabOrderCloneSelectionToOriginalId(n.id), nodeName: n.name })),
      });
    })();
    return;
  }

  if (msg.type === "get-swipe-path-accumulated-selection") {
    (async () => {
      // Fonte de ORDEM: _swipePathClickSequence — ver comentário completo
      // em get-tab-order-accumulated-selection acima (mesmo bug, mesma
      // correção: `selection` ordena por árvore de camadas, não por
      // ordem de clique).
      const selById = new Map(figma.currentPage.selection.filter(n => !!n && !!n.absoluteBoundingBox).map(n => [n.id, n]));
      const seen = new Set();
      const ordered = [];
      for (const clickedId of _swipePathClickSequence) {
        const n = selById.get(clickedId);
        if (!n) continue;
        const originalId = _resolveSwipePathCloneSelectionToOriginalId(n.id);
        if (seen.has(originalId)) continue;
        seen.add(originalId);
        ordered.push(n);
      }
      figma.ui.postMessage({
        type: 'swipe-path-accumulated-selection-result',
        points: ordered.map(n => ({ nodeId: _resolveSwipePathCloneSelectionToOriginalId(n.id), nodeName: n.name })),
      });
    })();
    return;
  }

  // Chamada por draw-tab-order-badge uma vez por item da lista pendente
  // (fluxo manual e automático usam o mesmo caminho) — cria exatamente o
  // mesmo selo real (ou o fallback círculo+texto) sempre incrementalmente,
  // nunca em lote. Não faz appendChild na seleção nem scroll de viewport
  // (quem chama decide isso). Só desenha selo de ITEM de tabulação — o selo
  // de Área (create-a11y-area) tem seu próprio código, não passa por aqui.
  async function _createTabOrderBadge(node, number, label, conector, areaId, reparentToSection, origin, tabOrderClone, sectionName) {
    const _conectorOptions = ['desativado', 'inferior', 'superior', 'esquerda', 'direita'];
    const _conector = _conectorOptions.includes(conector) ? conector : 'direita';
    const hasLabel = !!label;

    // Mobile: "[a11y mob] Ordenação" (tamanho=pequeno) — sem conector
    // desenhado e sem property de direção (confirmado via REST API), então
    // _conector só decide o POSICIONAMENTO x/y abaixo, nunca a variante do
    // componente. Desktop mantém "[a11y] Item Number", que desenha o
    // conector/traço por direção (mesmo componente reaproveitado pro selo
    // de Área — não há equivalente "sem conector" na lib desktop).
    const usingMobile = origin === 'mobile';

    let badge = null;
    let usedRealComponent = true;
    try {
      if (usingMobile) {
        const comp = await figma.importComponentByKeyAsync(A11Y_TAB_ORDER_ITEM_KEY_MOBILE);
        badge = comp.createInstance();
        badge.setProperties({ 'número#5265:3': String(number) });
      } else {
        const comp = await figma.importComponentByKeyAsync(A11Y_ITEM_NUMBER_KEYS[_conector]);
        badge = comp.createInstance();
        badge.setProperties({
          'number#1478:0': String(number),
          'show label#733:0': hasLabel,
          'label#733:6': label || 'Label',
        });
      }
    } catch (e) {
      // Nunca deveria cair aqui com as keys atuais (confirmadas via REST API
      // contra os component sets reais "[a11y] Item Number"/"[a11y mob]
      // Ordenação") — mas se a lib "Design Acessível" não estiver
      // disponível como team library no arquivo (ex.: nunca habilitada,
      // removida), importComponentByKeyAsync falha e caímos aqui. Loga a
      // causa real em vez de engolir silenciosamente — sem isso, "por que
      // saiu o círculo azul em vez do selo de verdade" ficava indiagnosticável.
      console.error('[hac] _createTabOrderBadge: falha ao importar selo real, usando fallback procedural.', e && e.message);
      usedRealComponent = false;
      badge = figma.createEllipse();
      badge.name = 'Selo de Ordem de Tabulação';
      badge.resize(28, 28);
      badge.fills = [{ type: "SOLID", color: hexToRgb('#005ca9') }];
    }

    const bb = node.absoluteBoundingBox;
    figma.currentPage.appendChild(badge);
    const _TAB_ORDER_GAP = 4;
    const targetCenterX = bb.x + bb.width / 2;
    const targetCenterY = bb.y + bb.height / 2;
    if (_conector === 'inferior') {
      badge.x = Math.round(targetCenterX - badge.width / 2);
      badge.y = Math.round(bb.y + bb.height + _TAB_ORDER_GAP);
    } else if (_conector === 'esquerda') {
      badge.x = Math.round(bb.x - badge.width - _TAB_ORDER_GAP);
      badge.y = Math.round(targetCenterY - badge.height / 2);
    } else if (_conector === 'superior' || _conector === 'desativado') {
      badge.x = Math.round(targetCenterX - badge.width / 2);
      badge.y = Math.round(bb.y - badge.height - _TAB_ORDER_GAP);
    } else { // direita (default)
      badge.x = Math.round(bb.x + bb.width + _TAB_ORDER_GAP);
      badge.y = Math.round(targetCenterY - badge.height / 2);
    }

    /** @type {SceneNode} */
    let group = badge;
    if (!usedRealComponent) {
      const labelText = figma.createText();
      labelText.name = 'Número';
      // loadFontAsync("Inter", "Bold") já rodou no chamador (create-a11y-area/
      // draw-tab-order-badge), mas está dentro de um try/catch mudo lá — se
      // ele tiver falhado (fonte indisponível
      // neste documento), esta atribuição síncrona lança fora de qualquer
      // try/catch e derruba a badge inteira sem nenhum selo, real ou
      // fallback. Tenta de novo aqui, já dentro do escopo que pode reagir.
      try {
        labelText.fontName = { family: "Inter", style: "Bold" };
      } catch (fontError) {
        console.error('[hac] _createTabOrderBadge: fonte Inter Bold indisponível, tentando carregar novamente.', fontError && fontError.message);
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        labelText.fontName = { family: "Inter", style: "Bold" };
      }
      labelText.fontSize = 12;
      labelText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      labelText.characters = String(number);
      figma.currentPage.appendChild(labelText);
      labelText.x = Math.round(badge.x + badge.width / 2 - labelText.width / 2);
      labelText.y = Math.round(badge.y + badge.height / 2 - labelText.height / 2);
      group = figma.group([badge, labelText], figma.currentPage);
    }
    group.name = `[Selo de Tabulação | ${number}] ${node.name}`;
    group.locked = false;
    group.setPluginData('hacCategory', 'a11y');
    // Marca o node-alvo (dentro do CLONE, não o original) que este selo
    // aponta (2026-09-09) — usado por _buildFichaTabulacaoSection pra
    // detectar quais itens já têm selo desenhado no overlay ANTES de
    // decidir o que redesenhar, depois que a réplica de trabalho passou a
    // ser MOVIDA (não reclonada) pra dentro da Ficha.
    group.setPluginData('hacTabOrderBadgeForTarget', node.id);

    // O selo nasce em figma.currentPage (precisa de posição absoluta livre
    // pra calcular contra a bounding box do nó-alvo, que também é absoluta).
    // Reparentar pra dentro da CÓPIA do frame da Ordem de Tabulação (não pra
    // Section) é o que torna o agrupamento real: sem isso, o selo só parece
    // "dentro" do frame por coincidência de posição, mas é irmão solto na
    // página — não acompanha o clone se ele for movido/selecionado depois.
    // _reparentIntoA11ySection não serve aqui: ela reparenta pra Section
    // (nível página), não pro clone (nível frame) — mesmo cálculo de
    // x/y-relativo-ao-novo-pai, mas com pai diferente.
    // Best-effort, mesmo padrão de _reparentIntoA11ySection: root da área
    // pode em tese ser um node que aceita .clone() mas não children (ex.
    // TEXT/VECTOR soltos — "Marcar Área" não restringe o tipo na UI). Sem o
    // try/catch, um appendChild que falhasse no meio da criação de um selo
    // (draw-tab-order-badge/apply em lote) interromperia o restante sem
    // aviso — o selo já criado e corretamente posicionado não deve se perder
    // por causa de uma falha só na organização/agrupamento.
    // Bug real corrigido (2026-09-05): tabOrderClone podia ser uma
    // referência STALE (já removida do canvas, ver checagem .removed
    // acrescentada em _resolveActiveTabOrderClone) — appendChild num node
    // removido lança, e o catch abaixo, quando `reparentToSection` é
    // `false` (sempre o caso no fluxo real de draw-tab-order-badge), NÃO
    // FAZIA NADA: o selo ficava exatamente onde nasceu
    // (figma.currentPage.appendChild(badge), no início desta função) —
    // solto na página, fora de qualquer clone/Grupo/Section. Agora, em
    // qualquer falha (clone stale ou outro motivo), cai pro MESMO destino
    // que qualquer outro artefato órfão usa: o Grupo da Área (via
    // _reparentArtifactIntoArea, com _reparentIntoA11ySection só como
    // último recurso se nem o Grupo existir — Área legada).
    let _reparentedIntoClone = false;
    if (tabOrderClone && !tabOrderClone.removed) {
      try {
        // Bug real corrigido (2026-09-08, 6ª rodada): selo desenhado DENTRO
        // do próprio clone (_reparentIntoCloneAbsolute, tentativa anterior)
        // podia nascer corretamente posicionado e no topo do z-order, e
        // AINDA ASSIM não aparecer — clipsContent em algum frame no
        // caminho entre o clone-raiz e o selo recorta qualquer filho que
        // "vaze" pra fora dos limites daquele frame, e um selo ABSOLUTE ao
        // lado de um elemento pequeno vaza de propósito. Corrigido
        // reparentando pra um GRUPO IRMÃO do clone (nunca dentro dele) —
        // GROUP nunca tem clipsContent nem Auto Layout, então é
        // estruturalmente imune a este bug. _getOrCreateCloneOverlayGroup
        // cria/reaproveita esse grupo; _reparentIntoAreaGroup (já usada
        // pelo Grupo da Área, mesmo princípio) faz o reparenting medindo a
        // posição absoluta do selo antes/depois, sem depender de
        // layoutPositioning — GROUP não tem essa propriedade porque nunca
        // precisa dela.
        const badgesGroup = _getOrCreateCloneOverlayGroup(tabOrderClone, 'hacTabOrderBadgesGroupForClone', '[Selos de Tabulação]', areaId);
        _reparentIntoAreaGroup(group, badgesGroup);
        _reparentedIntoClone = true;
        await _ensureCloneWorkFrame(tabOrderClone, badgesGroup, 'Réplica de Trabalho — Ordem de Tabulação');
      } catch (e) {
        // Visível ao designer (2026-09-08): antes só logava no console e
        // seguia em silêncio — foi esse silêncio que deixou o bug real
        // (clone ainda era INSTANCE, appendChild sempre lançava) sobreviver
        // a duas rodadas de correção anteriores sem ninguém perceber a
        // causa. Com o detachInstance() em _createTabOrderCloneForArea este
        // catch não deveria mais disparar no caminho normal — se disparar,
        // é sinal de outra causa nova, e o designer precisa saber que o
        // selo caiu num destino de fallback (Grupo da Área direto).
        console.error('[hac] _createTabOrderBadge: reparenting pro grupo de selos falhou, caindo pro Grupo da Área.', e && e.message);
        figma.notify('Não foi possível encaixar o selo na cópia da Ordem de Tabulação — ele foi colocado direto no grupo da tela.');
      }
    }
    if (!_reparentedIntoClone) {
      await _reparentArtifactIntoArea(group, areaId, () => {
        if (reparentToSection !== false) _reparentIntoA11ySection(group, sectionName);
      });
    }

    // layoutPositioning só pode ser setado como ABSOLUTE depois que o node
    // já é filho de um pai com Auto Layout ativo (layoutMode !== 'NONE') —
    // setar antes do reparenting acima (com o pai ainda sendo
    // figma.currentPage, sem Auto Layout) sempre lança
    // "Can only set layoutPositioning = ABSOLUTE if the parent node has
    // layoutMode !== NONE" e derrubava o selo inteiro sem desenhar nada
    // (bug real: todo selo do fluxo incremental falhava, 2026-09-03). Sem o
    // pai final ter Auto Layout, a instância já nasce com posicionamento
    // absoluto por padrão — não precisa forçar nada.
    try {
      if ('layoutPositioning' in group && group.parent && 'layoutMode' in group.parent && group.parent.layoutMode !== 'NONE') {
        group.layoutPositioning = 'ABSOLUTE';
      }
    } catch (e) { }

    return {
      group,
      usedRealComponent,
      item: {
        id: group.id,
        number: number,
        label: label || '',
        conector: _conector,
        targetNodeId: node.id,
        targetNodeName: node.name,
        a11yAreaId: areaId || null,
      },
    };
  }

  // _orderNodesInZigzagReadingOrder foi movida para escopo de nível
  // superior do arquivo (perto de figma.on('selectionchange', ...), topo do
  // arquivo) em 2026-09-04 — a Trilha de Swipe precisa chamá-la a partir do
  // listener de seleção do canvas, que vive FORA do closure de
  // figma.ui.onmessage onde esta função vivia antes. Corpo inalterado
  // (reaproveitado tal como estava), só a localização mudou.

  // Geração automática varrendo a árvore de camadas de uma Área Marcada já
  // existente, em profundidade (ordem real de node.children, a mesma do
  // painel Layers do Figma), só para DESCOBERTA dos candidatos elegíveis —
  // não importa em que ordem o DFS os encontra, pois a ordem final é
  // recalculada por posição visual logo abaixo (_orderNodesInZigzagReadingOrder).
  // A varredura em si sempre opera sobre o frame ORIGINAL (nodeIds
  // devolvidos são os do original, nunca os do clone) — mas antes de
  // varrer já cria a cópia da área (_createTabOrderCloneForArea, mesma
  // usada pelo fluxo manual) e foca a viewport nela, pelo mesmo motivo do
  // fluxo manual: o designer não deve revisar/aplicar em cima da área
  // original cheia de selos de outras specs. Devolve {nodeId, nodeName} de
  // cada candidato (referenciando o ORIGINAL) — quem desenha de fato é
  // draw-tab-order-badge, chamado uma vez por candidato (sequencialmente,
  // ver accessibility.js) assim que a lista pendente é populada no
  // frontend, reaproveitando a cópia/mapa já ativos aqui.
  //
  // Critério de elegibilidade: só entram componentes que resolvem, via
  // catálogo DSC (_resolveDscComponentA11yMatch), para um shortName de
  // A11Y_INTERACTIVE_SHORTNAMES (controles reais de foco de teclado). Ícone
  // decorativo, card de layout, imagem, badge etc. são ignorados por
  // inteiro. Não desce dentro de um INSTANCE/COMPONENT que o PRÓPRIO nó já
  // foi capturado como candidato interativo — mesma regra de sempre, pra não
  // numerar sub-elementos internos (ex: ícone dentro de um Button já contado
  // como unidade inteira). Em qualquer outro caso (não interativo, ou DSC
  // sem mapeamento/isUnmapped) a varredura continua procurando candidatos
  // dentro dele — sem esse `continue` condicional, containers reais (Card,
  // Section) que contêm botões/abas aninhados nunca eram alcançados (bug
  // real, confirmado em arquivo de produção).
  if (msg.type === "generate-tab-order-from-layers") {
    (async () => {
      // Toda a IIFE precisa deste try/catch envolvendo o corpo inteiro —
      // sem ele, qualquer rejeição não prevista num dos awaits abaixo
      // (root.clone() falhando num node aparentemente clonável, um node
      // bloqueado/removido no meio do caminho etc.) morre como unhandled
      // rejection: nenhuma mensagem nunca chega no frontend, o modal de
      // revisão nunca abre, e o designer só vê o toast inicial ("Varrendo
      // elementos…") para sempre, sem nenhum erro visível — bug real
      // reproduzido em arquivo de produção (2026-09-02). Qualquer falha
      // aqui agora sempre responde tab-order-generated-from-layers com
      // items: [] e avisa via figma.notify, nunca falha em silêncio.
      try {
        const root = await _getSceneNodeById(msg.targetNodeId);
        if (!root || !root.absoluteBoundingBox) {
          figma.notify("Tela não encontrada no canvas — selecione novamente.");
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
          return;
        }
        if (typeof root.clone !== 'function') {
          figma.notify("Este elemento não pode ser copiado — selecione a tela sobre um frame/grupo.");
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
          return;
        }

        const { clone, nodeMap } = await _createTabOrderCloneForArea(root, msg.areaId, msg.sectionName, msg.designerName, msg.designerId);
        if (msg.areaId) _activeTabOrderCloneMaps.set(msg.areaId, nodeMap);

        figma.currentPage.selection = [clone];
        figma.viewport.scrollAndZoomIntoView([clone]);

        const collected = [];
        // Um await sequencial por INSTANCE/COMPONENT visitado (mesmo padrão
        // de _a11yScanArea) é rápido o bastante na prática — getMainComponentAsync
        // roda no runtime local do Figma, não é I/O de rede. Paraleliza por
        // NÍVEL (Promise.all entre os filhos de um mesmo nó) só para reduzir
        // ainda mais o tempo total em árvores largas (muitos irmãos), sem
        // mudar a semântica: cada child ainda decide sozinho se é candidato
        // interativo antes de decidir descer, preservando a regra de não
        // numerar sub-elementos internos de um match já capturado.
        async function _walk(n) {
          const children = n.children || [];
          await Promise.all(children.map(async (child) => {
            if (child.visible === false) return;
            // Nunca coleta (nem desce em) artefatos do próprio hac — clone
            // de Ordem de Tabulação, selo, conector — caso algum tenha
            // ficado fisicamente aninhado dentro do frame original por
            // qualquer motivo (race de scans concorrentes já bloqueada
            // acima, mas mantido como segunda camada de defesa; mesmo
            // padrão já aplicado em scan-frame/create-a11y-area).
            if (_isHacOwnedNode(child)) return;
            let isInteractiveMatch = false;
            if (child.type === 'INSTANCE' || child.type === 'COMPONENT') {
              let componentKey = null;
              if (child.type === 'INSTANCE') {
                try {
                  const mainComp = await child.getMainComponentAsync();
                  componentKey = mainComp ? mainComp.key : null;
                } catch (e) { componentKey = null; }
              } else {
                componentKey = child.key || null;
              }
              if (_isA11yInteractiveComponentKey(componentKey)) {
                collected.push(child);
                isInteractiveMatch = true;
              }
            }
            if (isInteractiveMatch) return;
            await _walk(child);
          }));
        }
        await _walk(root);

        const plainNodeMap = {};
        nodeMap.forEach((clonedNode, originalId) => { plainNodeMap[originalId] = clonedNode.id; });

        if (collected.length === 0) {
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [], cloneId: clone.id, nodeMap: plainNodeMap });
          return;
        }

        // `collected` nasce na ordem de descoberta (agora paralela por
        // nível, não mais DFS estrito), mas a ordem que importa pro
        // designer é sempre recalculada pela posição visual em
        // zigue-zague — ver _orderNodesInZigzagReadingOrder.
        const withBounds = collected.filter(node => !!node.absoluteBoundingBox);
        const items = _orderNodesInZigzagReadingOrder(withBounds)
          .map(node => ({ nodeId: node.id, nodeName: _findVisibleLabelText(node) || node.name }));

        figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items, cloneId: clone.id, nodeMap: plainNodeMap });
        figma.notify(`${items.length} elemento${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'} — revise no modal antes de aplicar.`);
      } catch (e) {
        console.error('[hac] generate-tab-order-from-layers falhou:', e && e.stack || e);
        figma.notify("Não foi possível varrer a tela automaticamente — tente novamente.");
        figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
      }
    })();
    return;
  }

  // Mapeamento Automático PRÓPRIO da Trilha de Swipe (2026-09-16, decisão
  // original da vertical de a11y — perdido sem querer no revert b228343 de
  // 2026-09-15, que voltou o branch inteiro a um ponto anterior a este
  // commit; reimplementado em 2026-09-18 a pedido do usuário, contra o
  // código atual, não copiado literalmente do commit antigo, que já estava
  // defasado). O gesto de swipe (VoiceOver/TalkBack) percorre TODOS os
  // componentes com conteúdo real da tela — interativos e não-interativos
  // — diferente de startSwipePathFromTabOrder (que só REUTILIZA a sequência
  // já mapeada pela Ordem de Tabulação, estritamente Tab-navegável). Este é
  // um scan PRÓPRIO, independente da Tabulação.
  //
  // Reaproveita _a11yScanArea — mesmo motor da Detecção Automática do
  // Leitor de Tela, com suas heurísticas já maduras de dedupe (não
  // fragmentar um componente DSC já resolvido em sub-itens), composição de
  // ícone, e clipping por ancestral — em vez de escrever um scanner
  // próprio como generate-tab-order-from-layers faz (aquele filtra só
  // interativos via _isA11yInteractiveComponentKey; aqui o critério é
  // oposto: manter tudo que tem CONTEÚDO real, decorativo por fora).
  // Descarta os buckets 'icons'/'vectors' (puramente decorativo — decisão
  // da vertical: gesto de swipe nunca foca elemento decorativo) e 'frames'
  // (nunca documentável); mantém components/typography/images, só quando
  // resolveram algum dscComponentMatch (mesmo filtro usado pelo picker
  // manual, evita nó estrutural sem relevância de a11y virar ponto de
  // trilha). Ordena por zigue-zague visual (_orderNodesInZigzagReadingOrder),
  // mesmo critério já usado pela Ordem de Tabulação — não ordem de
  // camadas/DOM (critério da Detecção Automática do Leitor de Tela; os dois
  // critérios coexistem no hac por decisões de produto tomadas em momentos
  // diferentes).
  if (msg.type === "generate-swipe-path-from-layers") {
    (async () => {
      // Mesmo motivo do try/catch em generate-tab-order-from-layers: sem
      // ele, uma rejeição não prevista morre como unhandled rejection e o
      // designer fica preso no toast inicial pra sempre, sem erro visível.
      try {
        const root = await _getSceneNodeById(msg.targetNodeId);
        if (!root || !root.absoluteBoundingBox) {
          figma.notify("Tela não encontrada no canvas — selecione novamente.");
          figma.ui.postMessage({ type: "swipe-path-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
          return;
        }
        if (typeof root.clone !== 'function') {
          figma.notify("Este elemento não pode ser copiado — selecione a tela sobre um frame/grupo.");
          figma.ui.postMessage({ type: "swipe-path-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
          return;
        }

        const { clone, nodeMap } = await _createSwipePathCloneForArea(root, msg.areaId, msg.sectionName, msg.designerName, msg.designerId);
        if (msg.areaId) _activeSwipePathCloneMaps.set(msg.areaId, nodeMap);

        figma.currentPage.selection = [clone];
        figma.viewport.scrollAndZoomIntoView([clone]);

        // Scan roda sobre o CLONE, não o original — os nodeId coletados por
        // _a11yScanArea referenciam a réplica de trabalho (mesmo padrão do
        // scan-frame manual). Precisam ser traduzidos de volta pro id
        // ORIGINAL antes de virarem items: `nodeMap` (de
        // _createSwipePathCloneForArea) mapeia originalId → nó-no-clone, e
        // insert-swipe-path (_buildSwipePathConnection) sempre espera
        // receber ids ORIGINAIS pra resolver contra o SEU PRÓPRIO nodeMap
        // ao desenhar (mesmo princípio de _originalTargetNodeId em
        // create-unified-spec) — diferente da Tabulação automática, que
        // desenha direto sobre o clone item a item.
        //
        // BUG REAL CORRIGIDO (2026-09-18, reportado com print: "elemento
        // '9:30' não existe mais na cópia da tela"): a 1ª versão desta
        // função pulava essa tradução por completo — usava o nodeId do
        // CLONE (vindo direto do scan) como se já fosse original, então
        // insert-swipe-path tentava achar um id-de-clone dentro do MAPA
        // ORIGINAL→clone daquele momento (que nunca teria essa chave) e
        // falhava sempre que o node não sobrevivia por coincidência
        // posicional a um detachInstance() intermediário. cloneIdToOriginalId
        // inverte nodeMap (clonedNode.id → originalId) pra fazer a tradução
        // que faltava, mesmo sentido de uso de plainNodeMap logo abaixo
        // (que serve só para o FRONTEND cachear _activeSwipePathCloneMaps,
        // não para esta tradução).
        const scanned = await _a11yScanArea(clone);
        // BUG REAL CORRIGIDO (2026-09-18, reportado com print: itens
        // genéricos como "Actions - Button Row"/"Swap Slot" — nomes de
        // FRAME/slot estrutural, não componentes de conteúdo real — na
        // trilha final). `dscComponentMatch` truthy sozinho não basta como
        // filtro: _a11yScanArea sempre preenche esse campo, mesmo para um
        // container SEM nenhum match real (isUnmapped: true, a11yCategory:
        // null, containingFrame: nome cru do node — ver comentário
        // "instância sem match DSC resolvido" em dsc-matching.js), porque a
        // varredura precisa continuar descendo dentro dele pra achar os
        // componentes reais aninhados (ver _hasResolvedDscMatch logo
        // abaixo, no mesmo arquivo). O container em si não é um ponto de
        // conteúdo — só os filhos resolvidos são. Exigir a11yCategory
        // truthy exclui esses containers estruturais sem descartar nenhum
        // componente/texto/imagem com match real.
        const candidates = [
          ...(scanned.components || []),
          ...(scanned.typography || []),
          ...(scanned.images || []),
        ].filter(item => item && item.dscComponentMatch && !item.dscComponentMatch.isUnmapped && item.dscComponentMatch.a11yCategory);

        const plainNodeMap = {};
        const cloneIdToOriginalId = new Map();
        nodeMap.forEach((clonedNode, originalId) => {
          plainNodeMap[originalId] = clonedNode.id;
          cloneIdToOriginalId.set(clonedNode.id, originalId);
        });

        if (candidates.length === 0) {
          figma.ui.postMessage({ type: "swipe-path-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [], cloneId: clone.id, nodeMap: plainNodeMap });
          return;
        }

        const resolvedNodes = [];
        for (const c of candidates) {
          const originalId = cloneIdToOriginalId.get(c.nodeId);
          if (!originalId) continue; // node do clone sem correspondente original mapeado (nunca deveria ocorrer, defesa silenciosa)
          const n = await _getSceneNodeById(originalId);
          if (n && n.absoluteBoundingBox) resolvedNodes.push(n);
        }
        const items = _orderNodesInZigzagReadingOrder(resolvedNodes)
          .map(node => ({ nodeId: node.id, nodeName: _findVisibleLabelText(node) || node.name }));

        figma.ui.postMessage({ type: "swipe-path-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items, cloneId: clone.id, nodeMap: plainNodeMap });
        figma.notify(`${items.length} elemento${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'} — revise no modal antes de aplicar.`);
      } catch (e) {
        console.error('[hac] generate-swipe-path-from-layers falhou:', e && e.stack || e);
        figma.notify("Não foi possível varrer a tela automaticamente — tente novamente.");
        figma.ui.postMessage({ type: "swipe-path-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
      }
    })();
    return;
  }

  // Simulação de leitura por voz da Ordem de Tabulação (2026-09-09) — a
  // Web Speech API (speechSynthesis) só existe no frontend (iframe), mas o
  // "tipo" falado por parada (ex. "Botão") depende do matching DSC→a11y,
  // que só o backend resolve (figma.* não existe no iframe). O tipo NUNCA
  // é persistido em tabOrderItems (schema salvo continua sem essa coluna,
  // ver comentário de generate-tab-order-from-layers/item acima) — é
  // recalculado ao vivo a cada simulação, mesmo princípio de "nunca mentir
  // dado antigo" já seguido no resto do hac (a spec pode ter sido
  // desenhada há dias; o node pode ter sido trocado por outro componente
  // desde então). Best-effort por item: um node apagado/movido, ou que
  // falhe getMainComponentAsync, nunca derruba o handler inteiro — só
  // aquele item narra sem tipo (shortName: null).
  if (msg.type === "resolve-tab-order-narration") {
    (async () => {
      const items = [];
      for (const entry of (msg.items || [])) {
        const out = { number: entry.number, targetNodeId: entry.targetNodeId, targetNodeName: entry.targetNodeName, shortName: null };
        try {
          const node = await _getSceneNodeById(entry.targetNodeId);
          if (node) {
            if (node.type === 'INSTANCE') {
              let componentKey = null;
              try {
                const mainComp = await node.getMainComponentAsync();
                componentKey = mainComp ? mainComp.key : null;
              } catch (e) { componentKey = null; }
              const match = _resolveDscComponentA11yMatch(componentKey);
              if (match && !match.isUnmapped && match.a11yCategory) {
                out.shortName = match.a11yCategory;
              }
            } else if (node.type === 'COMPONENT') {
              const match = _resolveDscComponentA11yMatch(node.key || null);
              if (match && !match.isUnmapped && match.a11yCategory) {
                out.shortName = match.a11yCategory;
              }
            }
            // Sem match DSC (isUnmapped/null) — fallback mínimo por tipo
            // nativo do Figma, só pra distinguir texto solto de qualquer
            // outra coisa. Nenhum outro node.type vira fala com tipo: um
            // fallback amplo demais (ex. FRAME → "Área") soaria estranho e
            // impreciso vindo de um leitor de tela de verdade.
            if (!out.shortName && node.type === 'TEXT') {
              out.shortName = 'texto';
            }
            // targetNodeName pode ter ficado desatualizado (renome do
            // layer/label depois que o item foi criado) — usa o nome atual
            // do node quando disponível, mesmo espírito de
            // generate-tab-order-from-layers usar _findVisibleLabelText.
            out.targetNodeName = _findVisibleLabelText(node) || node.name || entry.targetNodeName;
          }
        } catch (e) {
          // node sumiu ou getMainComponentAsync falhou — item já nasceu
          // com shortName: null acima, segue narrando só o nome salvo.
        }
        items.push(out);
      }
      figma.ui.postMessage({ type: "tab-order-narration-resolved", areaId: msg.areaId, items });
    })();
    return;
  }

  if (msg.type === "renumber-tab-order-items") {
    (async () => {
      const updated = [];
      for (const entry of (msg.items || [])) {
        const node = await _getSceneNodeById(entry.id);
        if (!node) continue;
        const instance = node.type === 'INSTANCE'
          ? node
          : ('findOne' in node ? node.findOne(n => n.type === 'INSTANCE') : null);
        if (!instance || instance.type !== 'INSTANCE') continue;
        try {
          // O selo pode ser desktop ('[a11y] Item Number', property
          // 'number#1478:0') ou mobile ('[a11y mob] Ordenação', property
          // 'número#5265:3') — os dois nomes de property nunca coexistem na
          // mesma instância, então basta checar qual delas existe via
          // componentProperties (setProperties com uma key errada lança e
          // era engolida em silêncio, deixando selos mobile sem renumerar
          // nunca — bug real, 2026-09-03). Sem assumir origin aqui: mais
          // simples e robusto detectar pela property real da instância.
          const props = instance.componentProperties || {};
          if ('number#1478:0' in props) {
            instance.setProperties({ 'number#1478:0': String(entry.number) });
          } else if ('número#5265:3' in props) {
            instance.setProperties({ 'número#5265:3': String(entry.number) });
          }
          node.name = `[Selo de Tabulação | ${entry.number}] ${node.name.replace(/^\[Selo de Tabulação \| \d+\]\s*/, '')}`;
          updated.push(entry.id);
        } catch (e) {
          console.error('[hac] renumber-tab-order-items: falha ao renumerar', entry.id, e && e.message);
        }
      }
      figma.ui.postMessage({ type: "tab-order-renumbered", updated });
    })();
    return;
  }

  // Constrói o mapa nodeId-original → node-equivalente-no-clone, percorrendo
  // as duas árvores (original e clone) EM PARALELO, índice a índice de
  // `children` — `node.clone()` preserva exatamente a mesma
  // estrutura/ordem/contagem de filhos que o original, então a
  // correspondência por índice é determinística mesmo com nomes duplicados.
  function _buildOriginalToCloneMap(originalRoot, clonedRoot) {
    const map = new Map();
    map.set(originalRoot.id, clonedRoot);
    (function walkPair(origNode, cloneNode) {
      const origChildren = origNode.children || [];
      const cloneChildren = cloneNode.children || [];
      const len = Math.min(origChildren.length, cloneChildren.length);
      for (let i = 0; i < len; i++) {
        map.set(origChildren[i].id, cloneChildren[i]);
        walkPair(origChildren[i], cloneChildren[i]);
      }
    })(originalRoot, clonedRoot);
    return map;
  }

  // _collectA11yOccupiedBounds/_rectsOverlap/_findFreeTabOrderCopyPosition
  // MOVIDAS pro escopo de módulo em 2026-09-09 (comentário completo lá,
  // logo antes de _createOrGetFichaFrame) — ficavam só aqui dentro do
  // closure, invisíveis para _createOrGetFichaFrame (escopo de módulo),
  // causando ReferenceError real em insert-ficha-section. Continuam
  // chamáveis normalmente aqui dentro (função de módulo é visível de
  // dentro de qualquer closure interno).

  // Remove qualquer cópia anterior da MESMA área (via pluginData, nunca por
  // nome — o designer pode renomear), clona `root`, posiciona numa faixa
  // livre (nunca sobrepondo o que o hac já colocou/referencia no canvas),
  // nomeia e marca pluginData. Não desenha nenhum selo — isso é
  // responsabilidade exclusiva de quem chama. A remoção da cópia antiga
  // acontece ANTES do cálculo de posição livre de propósito: se a
  // recriação for da MESMA área, o espaço que ela ocupava deve contar como
  // livre de novo.
  async function _createTabOrderCloneForArea(root, areaId, sectionName, designerName, currentUserId) {
    _removeExistingTabOrderCopiesForArea(areaId);

    let clone = root.clone();
    // Bug real corrigido (2026-09-08): quando a Área é marcada sobre uma
    // INSTANCE de tela publicada na lib (padrão comum — o designer arrasta
    // a tela pronta da lib "DSC | Super App"), clone() devolve outra
    // INSTANCE. A API do Figma proíbe appendChild em InstanceNode (a árvore
    // é governada pelo main component), então cada selo desenhado dentro
    // dela lançava silenciosamente e caía no fallback de reparenting pro
    // Grupo da Área — virando irmão do clone em vez de filho, visualmente
    // indistinguível de "solto" no painel de camadas. detachInstance()
    // devolve um FRAME com estrutura/ordem/contagem de filhos idênticas
    // (crítico: tem que rodar ANTES de _buildOriginalToCloneMap, que mapeia
    // por índice de children). O frame ORIGINAL nunca é tocado — só esta
    // cópia de trabalho descartável perde o vínculo com o main component.
    if (clone.type === 'INSTANCE') {
      try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE — fallback de reparenting cobre */ }
    }
    clone.name = `[Ordem de Tabulação] ${root.name}`;
    clone.locked = false;
    clone.setPluginData('hacCategory', 'a11y');
    clone.setPluginData('hacTabOrderCopyForArea', areaId || '');

    const nodeMap = _buildOriginalToCloneMap(root, clone);

    // A réplica de trabalho nasce SOLTA na página, numa faixa livre ao
    // lado do frame original, e só então é reparentada — primeiro pra
    // Section de sessão (aqui embaixo), depois pro FRAME "[HAC] Handoff -
    // {Func}" dentro de _ensureLegendBesideClone (2026-09-11, revisão 3).
    //
    // HISTÓRICO IMPORTANTE (2026-09-11): uma primeira tentativa desta
    // sessão de fazer o clone nascer DIRETO dentro de um FRAME com Auto
    // Layout foi revertida — o Auto Layout comprimia/escondia a réplica e
    // ela deixava de ser utilizável pro designer clicar nos elementos, que
    // é a razão de ela existir. A causa era o clone ficar em modo de FLUXO
    // dentro do Auto Layout. A revisão 3 do FRAME de Handoff reproduz o
    // container Auto Layout (necessário pro Hug automático que o usuário
    // pediu), mas com CADA filho (clone incluído) forçado a
    // `layoutPositioning='ABSOLUTE'` — isso tira o clone do fluxo
    // completamente, então ele nunca é comprimido, só o Hug do PAI se
    // ajusta ao redor dele. Não é o mesmo bug se repetindo.
    const cloneWidth = root.absoluteBoundingBox.width;
    const cloneHeight = root.absoluteBoundingBox.height;
    // `verticalAnchorBounds` (2026-09-17, ver comentário completo em
    // _findFreeTabOrderCopyPosition) — só não-null quando esta é a PRIMEIRA
    // réplica desta área E já existem outras áreas documentadas na sessão:
    // força a nova réplica a nascer ABAIXO delas, nunca ao lado (bug real
    // corrigido: spec nova nascendo alinhada com a altura de outra Área).
    const _verticalAnchor = _getVerticalAnchorForNewArea(areaId, currentUserId);
    const { x, y } = await _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, root.absoluteBoundingBox, _verticalAnchor);
    figma.currentPage.appendChild(clone);
    clone.x = x;
    clone.y = y;
    const _sessionSection = _getOrCreateA11ySessionSection(designerName, currentUserId);
    _reparentIntoSection(clone, () => _sessionSection);
    await _ensureLegendBesideClone(clone, 'tabulacao', await _areaStubFromRoot(areaId, root, sectionName), designerName, currentUserId);
    // Segundo fit da Section (2026-09-14, causa raiz do vão reportado):
    // _reparentIntoSection acima já dimensionou a Section abraçando o clone
    // na POSIÇÃO LIVRE DISTANTE em que ele nasceu. Logo depois,
    // _ensureLegendBesideClone move clone e overlay pra dentro do
    // handoffFrame (dentro da Ficha) — eles deixam de ser filhos diretos da
    // Section, mas nada re-dimensionava a Section, que ficava com o tamanho
    // antigo. O "vão" era literalmente o espaço que o clone ocupava antes
    // de ser movido.
    try { _fitSectionToChildren(_sessionSection); } catch (e) { }

    return { clone, nodeMap };
  }

  // Espelha _createTabOrderCloneForArea pra Trilha de Swipe (2026-09-04-ac)
  // — mesma lógica de posicionamento livre (_findFreeTabOrderCopyPosition,
  // já genérica e usada por ambas), trocando só nome do clone, pluginData
  // e Section de destino.
  async function _createSwipePathCloneForArea(root, areaId, sectionName, designerName, currentUserId) {
    _removeExistingSwipePathCopiesForArea(areaId);

    let clone = root.clone();
    // Mesmo bug/correção de _createTabOrderCloneForArea (2026-09-08): clone
    // de uma Área marcada sobre INSTANCE de tela publicada precisa virar
    // FRAME antes de qualquer coisa ser reparentada pra dentro dela.
    if (clone.type === 'INSTANCE') {
      try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE — fallback de reparenting cobre */ }
    }
    clone.name = `[Trilha de Swipe] ${root.name}`;
    clone.locked = false;
    clone.setPluginData('hacCategory', 'a11y');
    clone.setPluginData('hacSwipePathCopyForArea', areaId || '');

    const nodeMap = _buildOriginalToCloneMap(root, clone);
    // Réplica solta + reparent pra Section — ver comentário completo em
    // _createTabOrderCloneForArea (revertido em 2026-09-11).
    const cloneWidth = root.absoluteBoundingBox.width;
    const cloneHeight = root.absoluteBoundingBox.height;
    // `verticalAnchorBounds` (2026-09-17) — ver comentário completo em
    // _createTabOrderCloneForArea/_findFreeTabOrderCopyPosition.
    const _verticalAnchor = _getVerticalAnchorForNewArea(areaId, currentUserId);
    const { x, y } = await _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, root.absoluteBoundingBox, _verticalAnchor);
    figma.currentPage.appendChild(clone);
    clone.x = x;
    clone.y = y;
    const _sessionSection = _getOrCreateA11ySessionSection(designerName, currentUserId);
    _reparentIntoSection(clone, () => _sessionSection);
    await _ensureLegendBesideClone(clone, 'swipe', await _areaStubFromRoot(areaId, root, sectionName), designerName, currentUserId);
    // Segundo fit da Section — ver comentário completo em
    // _createTabOrderCloneForArea (2026-09-14, causa raiz do vão).
    try { _fitSectionToChildren(_sessionSection); } catch (e) { }

    return { clone, nodeMap };
  }

  // Espelha _createTabOrderCloneForArea/_createSwipePathCloneForArea pra
  // Especificações — Leitor de Tela (2026-09-08, pedido do usuário: specs
  // passam a documentar sobre uma CÓPIA da área, nunca mais sobre o frame
  // ORIGINAL, mesma garantia que Tabulação/Swipe já davam). Diferente das
  // duas: NÃO chama nenhum "_removeExisting...CopiesForArea" ao criar —
  // várias specs da MESMA área são criadas ao longo do tempo e todas
  // precisam continuar apontando pro MESMO clone (removê-lo a cada nova
  // spec apagaria/desconectaria as specs já desenhadas nas chamadas
  // anteriores). A resolução de "já existe, reaproveita" fica inteira em
  // _resolveActiveSpecClone (abaixo) — esta função só cria do zero quando
  // chamada.
  function _findSpecCloneForArea(areaId) {
    let found = null;
    _forEachA11ySessionDirectChild(sibling => {
      if (found) return;
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacSpecCloneForArea') === areaId) {
          found = sibling;
        }
      } catch (e) { }
    });
    if (!found) {
      _forEachA11ySessionAreaChild(sibling => {
        if (found) return;
        try {
          if (sibling.getPluginData && sibling.getPluginData('hacSpecCloneForArea') === areaId) {
            found = sibling;
          }
        } catch (e) { }
      });
    }
    // Mesmo motivo de _forEachTabOrderCopyCandidate (2026-09-09) — a cópia
    // de Specs pode ter sido MOVIDA pra dentro da Ficha.
    if (!found) {
      _forEachA11yFichaFrameChild(sibling => {
        if (found) return;
        try {
          if (sibling.getPluginData && sibling.getPluginData('hacSpecCloneForArea') === areaId) {
            found = sibling;
          }
        } catch (e) { }
      });
    }
    return found;
  }

  async function _createSpecCloneForArea(root, areaId, sectionName, designerName, currentUserId, savedAnchor) {
    let clone = root.clone();
    // Mesmo bug/correção de _createTabOrderCloneForArea (2026-09-08).
    if (clone.type === 'INSTANCE') {
      try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE — fallback de reparenting cobre */ }
    }
    clone.name = `[Leitor de Tela] ${root.name}`;
    clone.locked = false;
    clone.setPluginData('hacCategory', 'a11y');
    clone.setPluginData('hacSpecCloneForArea', areaId || '');

    const nodeMap = _buildOriginalToCloneMap(root, clone);
    // Réplica solta + reparent pra Section — ver comentário completo em
    // _createTabOrderCloneForArea (revertido em 2026-09-11).
    const cloneWidth = root.absoluteBoundingBox.width;
    const cloneHeight = root.absoluteBoundingBox.height;
    // `verticalAnchorBounds` (2026-09-17, correção de bug real reportado com
    // print pelo usuário: spec nova da Área 2 nascendo alinhada com a altura
    // da Área 1) — ver comentário completo em
    // _createTabOrderCloneForArea/_findFreeTabOrderCopyPosition.
    const _verticalAnchor = _getVerticalAnchorForNewArea(areaId, currentUserId);
    // `savedAnchor` (2026-09-21, bug real reportado com print: spec nova
    // ainda nascendo na altura de outra área mesmo com verticalAnchorBounds
    // — o cálculo era sempre REFEITO do zero a cada artefato novo da MESMA
    // área, dependente de estado transitório do canvas). Escopo restrito
    // de propósito à Spec/Leitor de Tela (única vertical onde o bug foi
    // reportado) — Tabulação/Swipe não são tocados aqui.
    const { x, y } = await _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, root.absoluteBoundingBox, _verticalAnchor, savedAnchor);
    figma.currentPage.appendChild(clone);
    clone.x = x;
    clone.y = y;
    const _sessionSection = _getOrCreateA11ySessionSection(designerName, currentUserId);
    _reparentIntoSection(clone, () => _sessionSection);
    await _ensureLegendBesideClone(clone, 'leitor', await _areaStubFromRoot(areaId, root, sectionName), designerName, currentUserId);
    // Segundo fit da Section — ver comentário completo em
    // _createTabOrderCloneForArea (2026-09-14, causa raiz do vão).
    try { _fitSectionToChildren(_sessionSection); } catch (e) { }

    return { clone, nodeMap, workAnchor: { x, y } };
  }

  // Race condition real corrigida (2026-09-16, pista do usuário: "quando eu
  // consolido a ficha, aí sim ele adequa" — sintoma de card nascendo fora
  // da Section só na criação inicial, nunca na consolidação). Causa raiz:
  // desde 2026-09-15/16, o clone de trabalho é adiantado via 'start-spec-copy'
  // assim que o designer clica "+ Nova spec"/abre um item do wizard — e
  // _createSpecCloneForArea (chamada de dentro de _resolveActiveSpecClone)
  // não é instantânea: tem vários `await` (loadFontAsync ×3+,
  // _createOrGetFichaFrame, _getOrCreateFichaItensFrame) antes de mover o
  // clone pra dentro do handoffFrame da Ficha via _ensureLegendBesideClone.
  // O formulário de categoria (chooseA11yType/openA11yModal, accessibility.js)
  // NUNCA espera essa promise terminar — só o foco/loading do canvas esperam
  // (ver spec-copy-started, messages.js). Se o designer confirmar "Aplicar"
  // (create-unified-spec) antes desse `await` encadeado terminar, uma
  // SEGUNDA chamada a _resolveActiveSpecClone para a MESMA área roda em
  // paralelo à primeira: como _activeSpecCloneMaps só é populado DEPOIS que
  // a criação termina, a segunda chamada não encontra nada em cache, acha o
  // clone já criado mas AINDA SOLTO na Section de sessão (via
  // _findSpecCloneForArea, que também acha nesse estado intermediário) e
  // usa esse `clone.parent` desatualizado como âncora — o specGroup nasce
  // irmão do clone ENQUANTO ele ainda está solto na Section "crua". Quando a
  // primeira chamada termina pouco depois e move SÓ o clone (não o specGroup
  // recém-criado, que ela não tem como saber que existe) pro handoffFrame, o
  // specGroup fica pra trás, órfão na Section. A consolidação manual
  // ("Preencher"/"Atualizar Handoff", insert-ficha-section →
  // _buildFichaLeitorSection) "corrige" isso não porque tem uma lógica de
  // posicionamento melhor, mas porque relê o clone já ESTÁVEL (todo `await`
  // concluído) e move o overlay INTEIRO (com o specGroup órfão dentro dele,
  // achado por busca na página inteira via _findCloneOverlaySibling, não por
  // parentesco) em bloco pro handoffFrame — mascarando o sintoma sem
  // eliminar a causa. Fix real: serializar chamadas concorrentes a
  // _resolveActiveSpecClone pela MESMA área — a segunda chamada aguarda a
  // promise da primeira em vez de rodar em paralelo contra um estado
  // intermediário. Mesmo padrão vulnerável existe em
  // _resolveActiveTabOrderClone/_resolveActiveSwipePathClone (nenhuma delas
  // tem hoje qualquer serialização), mas só Leitor de Tela foi reportado com
  // sintoma real — escopo da correção restrito a ele.
  const _specCloneResolutionInFlight = new Map();
  function _resolveActiveSpecClone(areaId, targetNodeId, sectionName, designerName, currentUserId, savedAnchor) {
    if (!areaId) return _resolveActiveSpecCloneInner(areaId, targetNodeId, sectionName, designerName, currentUserId, savedAnchor);
    const pending = _specCloneResolutionInFlight.get(areaId);
    const chained = (pending || Promise.resolve()).then(
      () => _resolveActiveSpecCloneInner(areaId, targetNodeId, sectionName, designerName, currentUserId, savedAnchor),
      () => _resolveActiveSpecCloneInner(areaId, targetNodeId, sectionName, designerName, currentUserId, savedAnchor)
    );
    // Guarda a promise encadeada pra próxima chamada esperar por ESTA,
    // não pela original — corrente serializada, uma de cada vez. Limpa a
    // entrada só se ninguém mais entrou na fila enquanto esta rodava
    // (compara identidade antes de deletar, senão uma 3ª chamada que já
    // substituiu a entrada seria apagada por engano).
    _specCloneResolutionInFlight.set(areaId, chained);
    chained.finally(() => {
      if (_specCloneResolutionInFlight.get(areaId) === chained) {
        _specCloneResolutionInFlight.delete(areaId);
      }
    });
    return chained;
  }

  // Resolve a cópia ativa de specs de uma área, ou cria do zero se não
  // houver nenhuma em memória/canvas — mesmo padrão de
  // _resolveActiveTabOrderClone/_resolveActiveSwipePathClone. Renomeada de
  // _resolveActiveSpecClone (2026-09-16) — o nome original agora é o
  // wrapper de serialização acima; esta é a lógica real, sempre chamada em
  // sequência, nunca mais concorrente pra mesma área.
  async function _resolveActiveSpecCloneInner(areaId, targetNodeId, sectionName, designerName, currentUserId, savedAnchor) {
    const root = await _getSceneNodeById(targetNodeId);
    if (!root || !root.absoluteBoundingBox) return null;
    if (typeof root.clone !== 'function') return null;

    const cachedNodeMap = areaId ? _activeSpecCloneMaps.get(areaId) : null;
    if (cachedNodeMap) {
      const existingCloneEntry = cachedNodeMap.get(root.id);
      const existingClone = existingCloneEntry ? await _getSceneNodeById(existingCloneEntry.id) : null;
      if (existingClone && !existingClone.removed && _nodeOnCurrentPage(existingClone)) {
        let clone = existingClone;
        if (clone.type === 'INSTANCE') {
          try {
            clone = clone.detachInstance();
            const nodeMap = _buildOriginalToCloneMap(root, clone);
            _activeSpecCloneMaps.set(areaId, nodeMap);
            return { clone, nodeMap };
          } catch (e) { /* segue com a INSTANCE — fallback de reparenting cobre */ }
        }
        return { clone, nodeMap: cachedNodeMap };
      }
    }

    // Cache em memória vazio (ex.: plugin fechado/reaberto) — antes de
    // recriar do zero, procura no CANVAS por um clone já existente desta
    // área (via pluginData), reconstruindo o Map por índice de children.
    // Sem isso, reabrir o plugin e criar uma nova spec na mesma área
    // duplicaria o clone (um antigo órfão + um novo), quebrando as specs
    // já desenhadas no clone antigo (ficam "penduradas" numa cópia que
    // ninguém mais referencia).
    const canvasClone = _findSpecCloneForArea(areaId);
    if (canvasClone && !canvasClone.removed && _nodeOnCurrentPage(canvasClone)) {
      let clone = canvasClone;
      if (clone.type === 'INSTANCE') {
        try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE */ }
      }
      const nodeMap = _buildOriginalToCloneMap(root, clone);
      if (areaId) _activeSpecCloneMaps.set(areaId, nodeMap);
      return { clone, nodeMap };
    }

    const created = await _createSpecCloneForArea(root, areaId, sectionName, designerName, currentUserId, savedAnchor);
    if (areaId) _activeSpecCloneMaps.set(areaId, created.nodeMap);
    return created;
  }

  // "Iniciar Ordem de Tabulação" dispara isto ANTES de abrir a escuta de
  // cliques. Clona o frame da área IMEDIATAMENTE (cópia vazia, sem nenhum
  // selo ainda) — o frame ORIGINAL fica intocado durante todo o fluxo
  // manual; o highlight temporário de cada clique passa a ser desenhado
  // sobre o node equivalente dentro desta cópia, nunca mais sobre o
  // original. O mapa original→clone fica em memória do módulo — quem
  // resolve o nodeId original pro node da cópia é sempre o BACKEND, nunca o
  // frontend (que só conhece ids, não objetos de node reais).
  if (msg.type === "start-tab-order-copy") {
    (async () => {
      const root = await _getSceneNodeById(msg.targetNodeId);
      if (!root || !root.absoluteBoundingBox) {
        figma.notify("Tela não encontrada no canvas — selecione novamente.");
        figma.ui.postMessage({ type: "tab-order-copy-started", cloneId: null, nodeMap: {} });
        return;
      }
      if (typeof root.clone !== 'function') {
        figma.notify("Este elemento não pode ser copiado — selecione a tela sobre um frame/grupo.");
        figma.ui.postMessage({ type: "tab-order-copy-started", cloneId: null, nodeMap: {} });
        return;
      }

      const { clone, nodeMap } = await _createTabOrderCloneForArea(root, msg.areaId, msg.sectionName, msg.designerName, msg.designerId);
      if (msg.areaId) _activeTabOrderCloneMaps.set(msg.areaId, nodeMap);

      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);

      const plainNodeMap = {};
      nodeMap.forEach((clonedNode, originalId) => { plainNodeMap[originalId] = clonedNode.id; });

      figma.ui.postMessage({ type: "tab-order-copy-started", cloneId: clone.id, nodeMap: plainNodeMap });
    })();
    return;
  }

  // Variante dedicada de highlight-node pro fluxo de Ordem de Tabulação:
  // recebe o nodeId ORIGINAL (o que o designer de fato clicou no canvas) e
  // resolve internamente, via _activeTabOrderCloneMaps (2026-09-08: Map por
  // área, ver comentário na declaração), pro node equivalente dentro da
  // cópia rascunho DA ÁREA INFORMADA — sem msg.areaId, uma sessão com mais
  // de uma área em captura simultânea não saberia qual Map usar. Highlight
  // próprio (retângulo [HighlightStroke]) REMOVIDO (2026-09-08, mesmo
  // pedido/motivo de figma.on('selectionchange') acima — órfãos
  // recorrentes) — agora só seleciona o node de verdade
  // (figma.currentPage.selection), que já dá o contorno azul nativo do
  // Figma como feedback visual, sem nenhum node extra criado/removido.
  if (msg.type === "highlight-tab-order-copy-node") {
    (async () => {
      let targetId = msg.id;
      const cloneMap = msg.areaId ? _activeTabOrderCloneMaps.get(msg.areaId) : null;
      if (cloneMap && cloneMap.has(msg.id)) {
        targetId = cloneMap.get(msg.id).id;
      }

      const node = await _getSceneNodeById(targetId);
      if (!node || !node.visible || !_nodeOnCurrentPage(node) || !node.absoluteBoundingBox) return;

      figma.currentPage.selection = [node];

      // Clicar num item da lista (pendente ou já aplicada) da Ordem de
      // Tabulação precisa levar a viewport até o elemento — sem isso, numa
      // área grande/muito escalada o designer via a seleção só se já
      // estivesse olhando pro trecho certo do canvas (pedido explícito do
      // usuário, 2026-09-03: hoje só o clique direto no canvas focava).
      if (msg.shouldScroll) {
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    })();
    return;
  }

  // Espelha start-tab-order-copy pro wizard de Especificações (Leitor de
  // Tela) — 2026-09-14, pedido do usuário: "cria-se primeiro a réplica e
  // depois o foco é sempre na réplica e não no frame principal", igual
  // Tabulação/Swipe já fazem. Antes desta mudança o Leitor de Tela NUNCA
  // tinha uma réplica antecipada (comentário histórico em
  // _buildFichaLeitorSection: "o Leitor de Tela NUNCA teve réplica visual") —
  // a cópia só nascia dentro de create-unified-spec, ao aplicar a PRIMEIRA
  // spec. Isso deixava o botão "Focar" do wizard (highlight-spec-copy-node
  // abaixo) sem nada em _activeSpecCloneMaps pra resolver na abertura do
  // wizard/primeiro item, caindo de volta no nodeId original (Frame
  // Principal). Disparado pelo frontend ao abrir o wizard de Detecção
  // Automática do Leitor de Tela (startA11yBatchWizard, accessibility.js),
  // ANTES do primeiro highlight — mesmo timing de start-tab-order-copy.
  // Reaproveita _resolveActiveSpecClone (idempotente: reusa clone existente
  // em memória/canvas, só cria do zero na primeira vez) — nenhuma duplicação
  // com o que create-unified-spec já faz.
  if (msg.type === "start-spec-copy") {
    (async () => {
      const root = await _getSceneNodeById(msg.targetNodeId);
      if (!root || !root.absoluteBoundingBox) {
        figma.ui.postMessage({ type: "spec-copy-started", cloneId: null });
        return;
      }
      try {
        const resolved = await _resolveActiveSpecClone(msg.areaId, msg.targetNodeId, msg.sectionName, msg.designerName, msg.designerId, msg.savedAnchor);
        // workAnchor (2026-09-21) — só vem preenchido quando esta chamada
        // de fato CRIOU o clone (1ª vez); se já existia em cache/canvas,
        // resolved.workAnchor é undefined e não há nada novo a gravar no
        // frontend (a área já tinha posição fixada antes).
        figma.ui.postMessage({ type: "spec-copy-started", cloneId: resolved ? resolved.clone.id : null, areaId: msg.areaId, workAnchor: resolved ? resolved.workAnchor : null });
      } catch (e) {
        figma.ui.postMessage({ type: "spec-copy-started", cloneId: null, areaId: msg.areaId });
      }
    })();
    return;
  }

  // Espelha highlight-tab-order-copy-node pro wizard de Especificações
  // (Leitor de Tela) — bug real corrigido (2026-09-09): o botão "Focar" do
  // wizard sempre usou o handler genérico highlight-node com o nodeId
  // ORIGINAL, focando o frame principal. Isso fazia sentido antes de
  // create-unified-spec passar a clonar réplica (2026-09-08) — desde essa
  // mudança, o card da spec é desenhado sobre o CLONE, não mais sobre o
  // original, então focar o original mostra uma tela onde nada vai
  // aparecer. Resolve via _activeSpecCloneMaps (mesmo Map por área que
  // create-unified-spec já usa) pro node equivalente dentro da cópia de
  // trabalho ativa da área.
  if (msg.type === "highlight-spec-copy-node") {
    (async () => {
      let targetId = msg.id;
      const cloneMap = msg.areaId ? _activeSpecCloneMaps.get(msg.areaId) : null;
      if (cloneMap && cloneMap.has(msg.id)) {
        targetId = cloneMap.get(msg.id).id;
      }

      const node = await _getSceneNodeById(targetId);
      if (!node || !node.visible || !_nodeOnCurrentPage(node) || !node.absoluteBoundingBox) return;

      figma.currentPage.selection = [node];
      if (msg.shouldScroll) {
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    })();
    return;
  }

  // Espelha highlight-tab-order-copy-node/highlight-spec-copy-node pra
  // Trilha de Swipe (2026-09-11, bug real reportado com print: clicar num
  // ponto da lista da aba/modal de edição sempre levava pro Frame
  // Principal, nunca pra réplica de trabalho do Swipe — _highlightSwipePath
  // ListItem, swipe-path.js, ainda usava o handler genérico highlight-node
  // direto com o nodeId ORIGINAL, sem resolver original→clone como
  // Tabulação/Leitor de Tela já fazem). Resolve via
  // _activeSwipePathCloneMaps (mesmo Map por área que insert-swipe-path já
  // usa) pro node equivalente dentro da cópia de trabalho ativa da área.
  if (msg.type === "highlight-swipe-path-copy-node") {
    (async () => {
      let targetId = msg.id;
      const cloneMap = msg.areaId ? _activeSwipePathCloneMaps.get(msg.areaId) : null;
      if (cloneMap && cloneMap.has(msg.id)) {
        targetId = cloneMap.get(msg.id).id;
      }

      const node = await _getSceneNodeById(targetId);
      if (!node || !node.visible || !_nodeOnCurrentPage(node) || !node.absoluteBoundingBox) return;

      figma.currentPage.selection = [node];
      if (msg.shouldScroll) {
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    })();
    return;
  }

  // Resolve a cópia "rascunho" ativa da área (criada por start-tab-order-copy
  // ou generate-tab-order-from-layers) ou cria uma do zero se por algum
  // motivo não houver nenhuma em memória — mesmo fallback que já existia
  // dentro do antigo handler "aplicar em lote", agora compartilhado com
  // draw-tab-order-badge (que precisa da mesma resolução a cada item).
  async function _resolveActiveTabOrderClone(areaId, targetNodeId, sectionName, designerName, currentUserId) {
    const root = await _getSceneNodeById(targetNodeId);
    if (!root || !root.absoluteBoundingBox) return null;
    if (typeof root.clone !== 'function') return null;

    // Cache por área (2026-09-08, ver comentário na declaração de
    // _activeTabOrderCloneMaps) — nunca mistura o clone ativo de uma área
    // com o de outra, mesmo alternando entre elas na mesma sessão.
    const cachedNodeMap = areaId ? _activeTabOrderCloneMaps.get(areaId) : null;
    if (cachedNodeMap) {
      const existingCloneEntry = cachedNodeMap.get(root.id);
      const existingClone = existingCloneEntry ? await _getSceneNodeById(existingCloneEntry.id) : null;
      // Bug real corrigido (2026-09-05): getNodeByIdAsync pode devolver um
      // node com .removed === true (id ainda "existe" no sentido de já ter
      // sido usado, mas o node foi desconectado da árvore) — aconteceu de
      // verdade depois da reorganização estrutural, porque
      // _forEachTabOrderCopyCandidate passou a alcançar clones dentro do
      // Grupo da Área (_forEachA11ySessionAreaChild), então
      // _removeExistingTabOrderCopiesForArea (chamada por qualquer
      // recriação de cópia da MESMA área, em outro fluxo) passou a
      // remover clones que este Map ainda referenciava sem nunca ser
      // avisado. Sem a checagem .removed, o `if (existingClone)` abaixo
      // devolvia esse clone morto; tabOrderClone.appendChild(group) em
      // _createTabOrderBadge lançava (node removido não aceita filhos),
      // caindo num catch mudo que deixava o selo solto na página (sem
      // reparentar em lugar nenhum). Também confirma que o node ainda
      // pertence à página atual — getNodeByIdAsync pode, em teoria,
      // resolver um id de outra página.
      if (existingClone && !existingClone.removed && _nodeOnCurrentPage(existingClone)) {
        // Migração leve (2026-09-08): clone resolvido da memória pode ter
        // sido criado ANTES da correção de detachInstance (áreas já em
        // documentação no momento do fix) — ainda é uma INSTANCE, então
        // appendChild continuaria falhando. Detacha aqui também, com
        // re-mapeamento (o detach devolve um node novo, o Map antigo
        // aponta pro node velho).
        let clone = existingClone;
        if (clone.type === 'INSTANCE') {
          try {
            clone = clone.detachInstance();
            const nodeMap = _buildOriginalToCloneMap(root, clone);
            _activeTabOrderCloneMaps.set(areaId, nodeMap);
            return { clone, nodeMap };
          } catch (e) { /* segue com a INSTANCE — fallback de reparenting cobre */ }
        }
        return { clone, nodeMap: cachedNodeMap };
      }
    }

    // Cache em memória vazio (ex.: plugin fechado/reaberto) — antes de
    // recriar do zero, procura no CANVAS por um clone já existente desta
    // área (mesmo padrão já usado por _resolveActiveSpecClone via
    // _findSpecCloneForArea). Crítico desde que "Inserir na ficha" passou
    // a MOVER a cópia de trabalho pra dentro do frame da Ficha
    // (2026-09-09) — sem este fallback, um cache-miss recriaria a cópia
    // do zero a partir do frame original, deixando a cópia MOVIDA (com
    // todo o trabalho já feito) órfã dentro da Ficha, nunca mais
    // encontrada por nenhuma varredura.
    const canvasClone = _findTabOrderCopyForArea(areaId);
    if (canvasClone && !canvasClone.removed && _nodeOnCurrentPage(canvasClone)) {
      let clone = canvasClone;
      if (clone.type === 'INSTANCE') {
        try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE */ }
      }
      const nodeMap = _buildOriginalToCloneMap(root, clone);
      if (areaId) _activeTabOrderCloneMaps.set(areaId, nodeMap);
      return { clone, nodeMap };
    }

    const created = await _createTabOrderCloneForArea(root, areaId, sectionName, designerName, currentUserId);
    if (areaId) _activeTabOrderCloneMaps.set(areaId, created.nodeMap);
    return created;
  }

  // Espelha _findTabOrderCopyForArea pra Trilha de Swipe.
  function _findSwipePathCopyForArea(areaId) {
    let found = null;
    _forEachSwipePathCopyCandidate(sibling => {
      if (found) return;
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacSwipePathCopyForArea') === areaId) {
          found = sibling;
        }
      } catch (e) { }
    });
    return found;
  }

  // Espelha _resolveActiveTabOrderClone pra Trilha de Swipe (2026-09-04-ac)
  // — fallback que recria a cópia se ela não existir mais em memória (ex.:
  // designer fechou/reabriu o plugin), usado por insert-swipe-path.
  async function _resolveActiveSwipePathClone(areaId, targetNodeId, sectionName, designerName, currentUserId) {
    const root = await _getSceneNodeById(targetNodeId);
    if (!root || !root.absoluteBoundingBox) return null;
    if (typeof root.clone !== 'function') return null;

    // Cache por área (2026-09-08), mesmo princípio de _resolveActiveTabOrderClone.
    const cachedNodeMap = areaId ? _activeSwipePathCloneMaps.get(areaId) : null;
    if (cachedNodeMap) {
      const existingCloneEntry = cachedNodeMap.get(root.id);
      const existingClone = existingCloneEntry ? await _getSceneNodeById(existingCloneEntry.id) : null;
      // Mesma checagem de .removed/_nodeOnCurrentPage de
      // _resolveActiveTabOrderClone (2026-09-05) — mesmo risco de
      // referência morta depois que _forEachSwipePathCopyCandidate passou
      // a alcançar clones dentro do Grupo da Área.
      if (existingClone && !existingClone.removed && _nodeOnCurrentPage(existingClone)) {
        // Mesma migração leve de _resolveActiveTabOrderClone (2026-09-08).
        let clone = existingClone;
        if (clone.type === 'INSTANCE') {
          try {
            clone = clone.detachInstance();
            const nodeMap = _buildOriginalToCloneMap(root, clone);
            _activeSwipePathCloneMaps.set(areaId, nodeMap);
            return { clone, nodeMap };
          } catch (e) { /* segue com a INSTANCE — fallback de reparenting cobre */ }
        }
        return { clone, nodeMap: cachedNodeMap };
      }
    }

    // Cache em memória vazio — mesmo fallback via canvas de
    // _resolveActiveTabOrderClone/_resolveActiveSpecClone (2026-09-09,
    // crítico desde que "Inserir na ficha" passou a MOVER a cópia de
    // trabalho pra dentro do frame da Ficha).
    const canvasClone = _findSwipePathCopyForArea(areaId);
    if (canvasClone && !canvasClone.removed && _nodeOnCurrentPage(canvasClone)) {
      let clone = canvasClone;
      if (clone.type === 'INSTANCE') {
        try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE */ }
      }
      const nodeMap = _buildOriginalToCloneMap(root, clone);
      if (areaId) _activeSwipePathCloneMaps.set(areaId, nodeMap);
      return { clone, nodeMap };
    }

    const created = await _createSwipePathCloneForArea(root, areaId, sectionName, designerName, currentUserId);
    if (areaId) _activeSwipePathCloneMaps.set(areaId, created.nodeMap);
    return created;
  }

  // Cancelamento do fluxo manual: a cópia rascunho criada por
  // start-tab-order-copy fica órfã (vazia ou parcialmente desenhada) se o
  // designer desistir — remove pelo mesmo pluginData de sempre e zera o
  // estado em memória.
  if (msg.type === "delete-tab-order-draft-copy") {
    _deleteTabOrderDraftCopy(msg.areaId);
    return;
  }

  // "Adicionar itens" a partir do card/tab, numa área que JÁ tem Ordem de
  // Tabulação documentada (2026-09-04-aj) — precisa garantir que
  // _activeTabOrderCloneMaps tenha a entrada da área CORRETA antes de armar
  // a captura de clique no frontend. Sem isto, se
  // o plugin foi fechado/reaberto desde a última vez que a cópia foi
  // tocada, esse estado em memória fica null — e o primeiro
  // draw-tab-order-badge do novo item chamaria _resolveActiveTabOrderClone,
  // que RECRIARIA a cópia do zero (removendo a existente, com todos os
  // selos já documentados, via _removeExistingTabOrderCopiesForArea
  // dentro de _createTabOrderCloneForArea) — apagando silenciosamente a
  // ordem que o designer queria só COMPLEMENTAR. Resolvendo aqui, ANTES
  // de qualquer clique, a cópia existente é reconhecida e reaproveitada
  // (mesma checagem de _resolveActiveTabOrderClone: reusa se o clone
  // ainda existir no canvas, só recria se genuinamente sumiu).
  if (msg.type === "resolve-tab-order-clone") {
    (async () => {
      const resolved = await _resolveActiveTabOrderClone(msg.areaId, msg.targetNodeId, msg.sectionName, msg.designerName, msg.designerId);
      figma.ui.postMessage({ type: "tab-order-clone-resolved", areaId: msg.areaId, ok: !!resolved });
    })();
    return;
  }

  // Espelha resolve-tab-order-clone pra Trilha de Swipe (2026-09-09,
  // feature "editar trilha já criada") — reconhece/reaproveita a cópia
  // clonada já existente da área (ou recria só se genuinamente sumiu, via
  // _resolveActiveSwipePathClone) SEM abrir a escuta de seleção. Existe
  // porque start-swipe-path-mode SEMPRE clona um frame novo do zero
  // (_createSwipePathCloneForArea remove qualquer cópia anterior da área
  // antes de clonar) — certo para "Iniciar/Refazer trilha de swipe"
  // (captura do zero), mas errado para "+ Adicionar ponto" numa trilha já
  // em edição: chamar start-swipe-path-mode ali apagaria a cópia com o
  // trabalho de revisão em andamento. startSwipePathAddPoint (frontend)
  // chama este handler primeiro para garantir o clone, e só ativa
  // _swipePathModeActive (via start-swipe-path-listen-only, abaixo) depois
  // da confirmação — mesma sequência de startTabOrderAddItemsFromCard/
  // handleTabOrderCloneResolved/startTabOrderAddItemWait.
  if (msg.type === "resolve-swipe-path-clone") {
    (async () => {
      const resolved = await _resolveActiveSwipePathClone(msg.areaId, msg.targetNodeId, msg.sectionName, msg.designerName, msg.designerId);
      if (resolved && resolved.clone) {
        figma.currentPage.selection = [resolved.clone];
        figma.viewport.scrollAndZoomIntoView([resolved.clone]);
      }
      figma.ui.postMessage({ type: "swipe-path-clone-resolved", areaId: msg.areaId, ok: !!resolved });
    })();
    return;
  }

  // Liga a escuta de seleção (contagem ao vivo/highlight) SEM clonar nada
  // — usada só depois que resolve-swipe-path-clone já confirmou que a
  // cópia existe (fluxo "+ Adicionar ponto"). start-swipe-path-mode
  // continua sendo o único caminho que CLONA (fluxo de captura do zero).
  if (msg.type === "start-swipe-path-listen-only") {
    _swipePathModeActive = true;
    return;
  }

  // Desenha UM selo real por vez, assim que o item entra na lista pendente
  // do modal (clique manual ou item do scan automático) — nunca em lote,
  // nunca redesenhando o que já existe. Reaproveita a cópia rascunho ativa
  // (criada por start-tab-order-copy/generate-tab-order-from-layers) e
  // resolve o node ALVO já mapeado pra dentro dela. tempId só existe do lado
  // do frontend (identifica o item na lista pendente antes de ter um id real
  // de canvas) — o backend só ecoa de volta pra resposta ser correlacionável.
  if (msg.type === "draw-tab-order-badge") {
    (async () => {
      const resolved = await _resolveActiveTabOrderClone(msg.areaId, msg.targetNodeId, msg.sectionName, msg.designerName, msg.designerId);
      if (!resolved) {
        figma.ui.postMessage({ type: "tab-order-badge-draw-failed", tempId: msg.tempId });
        return;
      }
      const { clone, nodeMap } = resolved;
      const mappedNode = nodeMap.get(msg.nodeId);
      if (!mappedNode || !mappedNode.absoluteBoundingBox) {
        figma.ui.postMessage({ type: "tab-order-badge-draw-failed", tempId: msg.tempId });
        return;
      }
      try {
        try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }
        const { group, item } = await _createTabOrderBadge(mappedNode, msg.number, '', 'direita', msg.areaId, false, msg.a11yOrigin, clone, msg.sectionName);
        figma.currentPage.selection = [clone, group];
        figma.viewport.scrollAndZoomIntoView([clone, group]);
        figma.ui.postMessage({ type: "tab-order-badge-drawn", tempId: msg.tempId, canvasId: group.id, item });
      } catch (e) {
        console.error('[hac] draw-tab-order-badge: falha ao desenhar selo para', msg.nodeId, e && e.message);
        figma.ui.postMessage({ type: "tab-order-badge-draw-failed", tempId: msg.tempId });
      }
    })();
    return;
  }

  // Exclusão em cascata da área — remove a cópia do frame da Ordem de
  // Tabulação desta área, se existir. Localiza só por pluginData, nunca por
  // nome (o designer pode ter renomeado a cópia livremente).
  if (msg.type === "delete-tab-order-copy-for-area") {
    _removeExistingTabOrderCopiesForArea(msg.areaId);
    _clearOrphanedHighlightStrokes();
    return;
  }

  // Rede de segurança pro clone de specs (Leitor de Tela, 2026-09-08) —
  // mesmo padrão de delete-tab-order-copy-for-area/cleanup-swipe-path-
  // for-area. O caminho principal de exclusão de specs continua sendo
  // delete-node por id individual (o frontend já conhece os ids via
  // a11ySpecs); este handler cobre o clone da área (que os specGroups
  // individuais vivem dentro dele, via overlay) e qualquer spec que porventura
  // não tenha sido removida a tempo pelo array local — localiza só por
  // pluginData, nunca por nome/hierarquia.
  if (msg.type === "delete-specs-for-area") {
    _activeSpecCloneMaps.delete(msg.areaId);
    const cloneIdsToRemove = [];
    _forEachA11ySessionDirectChild(sibling => {
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacSpecCloneForArea') === msg.areaId) {
          cloneIdsToRemove.push(sibling.id);
        }
      } catch (e) { }
    });
    _forEachA11ySessionAreaChild(sibling => {
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacSpecCloneForArea') === msg.areaId) {
          cloneIdsToRemove.push(sibling.id);
        }
      } catch (e) { }
    });
    const removeIfMatch = sibling => {
      try {
        const isClone = cloneIdsToRemove.includes(sibling.id);
        const isOverlayOfRemovedClone = sibling.getPluginData &&
          cloneIdsToRemove.includes(sibling.getPluginData('hacSpecGroupForClone'));
        const isSpecForArea = sibling.getPluginData && sibling.getPluginData('hacSpecForArea') === msg.areaId;
        if (isClone || isOverlayOfRemovedClone || isSpecForArea) {
          sibling.remove();
        }
      } catch (e) { }
    };
    _forEachA11ySessionDirectChild(removeIfMatch);
    _forEachA11ySessionAreaChild(removeIfMatch);
    _clearOrphanedHighlightStrokes();
    return;
  }

  // "Ocultar/Mostrar toda a área" cobre também a cópia de Ordem de
  // Tabulação, que vive dentro da Section dedicada "hac — Ordem de
  // Tabulação" (nunca dentro do specGroup das specs). Ocultar o frame
  // clonado inteiro já esconde os selos dentro dele de uma vez.
  // Fire-and-forget, sem resposta ao frontend.
  if (msg.type === "toggle-tab-order-copy-visibility") {
    _forEachTabOrderCopyCandidate(sibling => {
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacTabOrderCopyForArea') === msg.areaId) {
          sibling.visible = !!msg.visible;
        }
      } catch (e) { }
    });
    return;
  }

  // ============================================================
  // Trilha de Swipe — linha direcional com N pontos (3ª reformulação,
  // 2026-09-04)
  // ============================================================
  // Histórico nesta mesma sessão: v1 era sequência de elementos DENTRO de
  // uma Área (cópia do pipeline de Tabulação); v2 era uma conexão reta
  // entre exatamente 2 Áreas Marcadas escolhidas por dropdown
  // (_buildSwipeFlowConnection/_closestEdgePoints, removidas por completo
  // nesta reformulação — imagem de referência real do usuário mostrou uma
  // trilha ziguezagueante atravessando MUITOS pontos, não uma conexão de 2
  // pontas fixas). O modelo real: uma única linha direcional contínua
  // passando por N pontos em sequência (mín. 2), com seta em CADA segmento
  // indicando a direção do trajeto. Pontos NÃO são restritos a Áreas
  // Marcadas — qualquer nó clicado no canvas serve (mesma liberdade que a
  // Ordem de Tabulação já tem).
  //
  // Captura em lote (mesmo espírito do Plano B de Ordem de Tabulação):
  // clique único soma 1 ponto pendente no frontend; nada é desenhado até
  // "Criar trilha de Swipe" (insert-swipe-path abaixo), que desenha tudo de
  // uma vez.

  // Ponto de conexão de cada nó na trilha: sempre o CENTRO do bounding box
  // — nunca "a borda mais próxima entre os dois pontos" (abordagem
  // anterior, _closestEdgePointsBetween, removida em 2026-09-08 por bug
  // real confirmado com screenshot: em fileiras/grades de elementos
  // parecidos, a borda geometricamente mais curta entre 2 vizinhos quase
  // sempre são as bordas INTERNAS voltadas uma pra outra, fazendo a linha
  // "pular" pra dentro e cruzar de forma confusa em vez de fluir na
  // sequência real dos pontos). Centro a centro é previsível e sempre segue
  // a ordem certa, ao custo de a linha/seta passar por cima do próprio
  // elemento em vez de tangenciar a borda — troca aceita de propósito.
  function _connectionPointOf(bounds) {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  // Desenha UMA trilha contínua passando por `points` (lista ORDENADA de
  // nós já resolvidos via figma.getNodeByIdAsync, cada um com
  // absoluteBoundingBox) — um segmento reto entre cada par consecutivo,
  // sempre CENTRO a centro (ver _connectionPointOf), com uma seta em CADA
  // segmento (não só na ponta final, diferente da v2) e um
  // marcador de origem só no primeiro ponto. Traço mais grosso/marcado que
  // a v2 (pedido explícito do usuário sobre o traço fino de antes):
  // strokeWeight 4 (era 2) e cor de destaque mais forte. Agrupa tudo,
  // nomeia e marca via pluginData pra localizar/remover depois. Lança erro
  // (nunca retorna null silenciosamente) se `points` tiver menos de 2 nós
  // resolvíveis, pro handler decidir a mensagem de falha certa.
  async function _buildSwipePathConnection(nodes) {
    if (!nodes || nodes.length < 2) {
      throw new Error('São necessários pelo menos 2 pontos para desenhar uma trilha de swipe.');
    }

    const strokeColor = { r: 0, g: 0.361, b: 0.663 }; // #005ca9, azul institucional (alinhado ao Handex, 2026-09-18)
    const strokeWeight = 4;
    const arrowSize = 10;

    const segments = [];
    const parts = [];

    for (let i = 0; i < nodes.length - 1; i++) {
      const from = _connectionPointOf(nodes[i].absoluteBoundingBox);
      const to = _connectionPointOf(nodes[i + 1].absoluteBoundingBox);
      segments.push({ from, to });

      const line = figma.createVector();
      line.name = `Segmento ${i + 1}`;
      figma.currentPage.appendChild(line);
      line.x = 0; line.y = 0;
      line.strokes = [{ type: 'SOLID', color: strokeColor }];
      line.strokeWeight = strokeWeight;
      line.strokeCap = 'ROUND';
      line.vectorPaths = [{ windingRule: 'NONZERO', data: `M ${from.x} ${from.y} L ${to.x} ${to.y}` }];
      parts.push(line);

      // Seta no meio de CADA segmento (não só na ponta final) — deixa a
      // direção do trajeto clara em qualquer ponto da trilha, mesmo em
      // trilhas longas onde a ponta final está fora da área visível.
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const arrow = figma.createVector();
      arrow.name = `Seta ${i + 1}`;
      figma.currentPage.appendChild(arrow);
      arrow.x = 0; arrow.y = 0;
      arrow.strokes = [{ type: 'SOLID', color: strokeColor }];
      arrow.strokeWeight = strokeWeight * 0.75; arrow.strokeCap = 'ROUND'; arrow.strokeJoin = 'ROUND';
      const ax1 = midX - arrowSize * Math.cos(angle - Math.PI / 6);
      const ay1 = midY - arrowSize * Math.sin(angle - Math.PI / 6);
      const ax2 = midX - arrowSize * Math.cos(angle + Math.PI / 6);
      const ay2 = midY - arrowSize * Math.sin(angle + Math.PI / 6);
      arrow.vectorPaths = [{ windingRule: 'NONZERO', data: `M ${ax1} ${ay1} L ${midX} ${midY} L ${ax2} ${ay2}` }];
      parts.push(arrow);
    }

    // Marcador de origem só no primeiro ponto da trilha (mesmo raciocínio
    // da v2: a extremidade inicial não fica "solta" visualmente).
    const originDotR = 5;
    const origin = segments[0].from;
    const originDot = figma.createEllipse();
    originDot.name = 'Origem';
    figma.currentPage.appendChild(originDot);
    originDot.resize(originDotR * 2, originDotR * 2);
    originDot.x = origin.x - originDotR;
    originDot.y = origin.y - originDotR;
    originDot.fills = [{ type: 'SOLID', color: strokeColor }];
    originDot.strokes = [];
    parts.push(originDot);

    const group = figma.group(parts, figma.currentPage);
    group.name = `[hac Swipe] Trilha (${nodes.length} pontos)`;
    group.locked = false;
    group.setPluginData('hacCategory', 'a11y');

    return group;
  }

  // Localiza (varrendo a Section de Trilha de Swipe, qualquer geração/
  // versão, e também filhos soltos na página — mesmo padrão defensivo do
  // resto do hac) o grupo de trilha cuja área dona é `areaId`. Só pode
  // existir 1 por área (v1), então o primeiro achado já é o único relevante.
  function _findSwipePathForArea(areaId) {
    let found = null;
    const _check = (node) => {
      if (found) return;
      try {
        if (node.getPluginData && node.getPluginData('hacSwipePathAreaId') === areaId) {
          found = node;
        }
      } catch (e) { }
    };
    for (const sibling of figma.currentPage.children) {
      if (sibling.type === 'SECTION') continue;
      _check(sibling);
    }
    for (const sibling of figma.currentPage.children) {
      if (sibling.type !== 'SECTION' || !sibling.name.startsWith(A11Y_SWIPE_FLOW_SECTION_NAME)) continue;
      for (const child of (sibling.children || [])) _check(child);
    }
    _forEachA11ySessionAreaChild(_check);
    _forEachA11ySessionDirectChild(_check);
    // A trilha pode ter sido MOVIDA pra dentro de uma Ficha (2026-09-09,
    // ver _forEachA11yFichaFrameChild) — sem esta fonte, reabrir "Iniciar
    // trilha de swipe" depois de já ter inserido na Ficha não encontraria
    // a trilha antiga pra substituir, deixando-a órfã dentro da Ficha.
    _forEachA11yFichaFrameChild(_check);
    return found;
  }

  function _removeSwipePathForArea(areaId) {
    const existing = _findSwipePathForArea(areaId);
    if (existing) {
      try { existing.remove(); } catch (e) { }
    }
  }

  // insert-swipe-path — recebe a lista de pontos JÁ REVISADA/REORDENADA no
  // frontend (modelo em lote, ver applyTabOrderToCanvas em accessibility.js
  // pro padrão equivalente de Tabulação) e desenha a trilha completa numa
  // única operação.
  //
  // Ordem de operações importante (achado real do QA da v2 anterior,
  // resolvido de propósito aqui): a trilha antiga só é removida do canvas
  // DEPOIS de confirmar que a nova foi desenhada com sucesso — nunca
  // remove-then-draws-that-might-fail. Se _buildSwipePathConnection lançar,
  // a trilha antiga (se havia) permanece intacta no canvas e o dado não é
  // tocado, então hacData.a11ySwipePaths nunca afirma uma trilha que não
  // existe mais no canvas.
  if (msg.type === "insert-swipe-path") {
    (async () => {
      const areaId = msg.areaId;
      const points = Array.isArray(msg.points) ? msg.points : [];
      if (!areaId || points.length < 2) {
        figma.ui.postMessage({ type: 'swipe-path-create-failed', areaId, reason: 'São necessários pelo menos 2 pontos para criar uma trilha de swipe.' });
        return;
      }
      try {
        // A linha final precisa ser desenhada DENTRO DA CÓPIA clonada da
        // Área (2026-09-04-ac), nunca sobre o frame original — resolve o
        // clone ativo (ou recria, se não existir mais em memória — mesmo
        // fallback defensivo de draw-tab-order-badge/_resolveActiveTabOrderClone)
        // e traduz cada ponto (id ORIGINAL, vindo da lista pendente já
        // revisada) pro node EQUIVALENTE dentro dela.
        const cloneResolved = msg.targetNodeId
          ? await _resolveActiveSwipePathClone(areaId, msg.targetNodeId, msg.sectionName, msg.designerName, msg.designerId)
          : null;
        if (!cloneResolved) {
          throw new Error('A cópia da tela não foi encontrada no canvas — refaça a trilha.');
        }
        const { clone, nodeMap } = cloneResolved;

        const resolvedNodes = [];
        for (const p of points) {
          // Traduz de volta pro id ORIGINAL antes de consultar o nodeMap do
          // Swipe — "Gerar automaticamente" (startSwipePathFromTabOrder)
          // manda ids da CÓPIA de Tabulação, não da área original; ver
          // _resolveOriginalNodeIdFromTabOrderClone. No-op para pontos que já
          // chegam com id original (fluxo manual/marquee).
          const originalNodeId = p && p.nodeId ? _resolveOriginalNodeIdFromTabOrderClone(areaId, p.nodeId) : null;
          const mappedNode = originalNodeId ? nodeMap.get(originalNodeId) : null;
          if (!mappedNode || !mappedNode.absoluteBoundingBox) {
            throw new Error(`O elemento "${p && p.nodeName || 'sem nome'}" não existe mais na cópia da tela — refaça a trilha.`);
          }
          resolvedNodes.push(mappedNode);
        }

        const group = await _buildSwipePathConnection(resolvedNodes);
        group.setPluginData('hacSwipePathAreaId', areaId);

        // A linha passa a viver num GRUPO IRMÃO da própria cópia clonada
        // sobre a qual foi desenhada — nunca DENTRO dela (2026-09-08, 6ª
        // rodada: essa era a intenção da correção anterior, "a trilha tem
        // que ficar dentro do grupo da nova réplica", mas colocar a linha
        // como filha real do clone expõe o mesmo bug de clipsContent que
        // afetava os selos de Ordem de Tabulação — uma linha que cruza a
        // tela toda tem ainda mais chance de "vazar" pra fora dos limites
        // de algum frame intermediário do clone e ser recortada). O grupo
        // overlay (_getOrCreateCloneOverlayGroup, mesma função usada pelos
        // selos, chave de pluginData própria pra nunca compartilhar grupo
        // com eles) continua vivendo ao lado do clone — visualmente "preso"
        // a ele (mesmo Grupo da Área, sempre logo acima na pilha), só que
        // como GROUP puro, imune a clip. Fallback pro Grupo da Área (e daí
        // pra Section, Área legada) só se o clone não existir ou o
        // reparenting falhar por outro motivo.
        let _reparentedIntoClone = false;
        if (clone && !clone.removed) {
          try {
            const swipeOverlayGroup = _getOrCreateCloneOverlayGroup(clone, 'hacSwipePathGroupForClone', '[Trilha de Swipe]', areaId);
            _reparentIntoAreaGroup(group, swipeOverlayGroup);
            _reparentedIntoClone = true;
            await _ensureCloneWorkFrame(clone, swipeOverlayGroup, 'Réplica de Trabalho — Swipe');
          } catch (e) {
            console.error('[hac] insert-swipe-path: reparenting pro grupo overlay falhou, caindo pro Grupo da Área.', e && e.message);
            figma.notify('Não foi possível encaixar a trilha na cópia de Swipe — ela foi colocada direto no grupo da tela.');
          }
        }
        if (!_reparentedIntoClone) {
          await _reparentArtifactIntoArea(group, areaId, () => {
            _reparentIntoSection(group, () => {
              const suffix = _extractA11ySectionVersionSuffix(msg.sectionName);
              return _getOrCreateNamedSection(A11Y_SWIPE_FLOW_SECTION_NAME + suffix);
            });
          });
        }

        // Só remove a trilha antiga desta área DEPOIS que a nova já foi
        // desenhada, reparentada e marcada com sucesso — ver comentário do
        // handler acima.
        const existing = _findSwipePathForArea(areaId);
        if (existing && existing.id !== group.id) {
          try { existing.remove(); } catch (e) { }
        }

        figma.currentPage.selection = [group];
        figma.viewport.scrollAndZoomIntoView([group]);
        // Ecoa os MESMOS `points` recebidos no payload (não relê nenhum
        // estado do frontend) — o handler de resposta (handleSwipePathCreated,
        // accessibility.js) persiste exatamente esta lista, nunca
        // window._swipePathPendingList no momento em que a resposta chega.
        // Sem isso, reordenar/remover um item da lista pendente ENQUANTO
        // esta mensagem está em trânsito gravaria em hacData.a11ySwipePaths
        // uma trilha diferente da que foi de fato desenhada aqui (achado
        // real de QA, 2026-09-04).
        figma.ui.postMessage({
          type: 'swipe-path-created',
          areaId,
          pathNodeId: group.id,
          points,
        });
      } catch (e) {
        console.error('[hac] insert-swipe-path falhou:', e && e.stack || e);
        figma.ui.postMessage({
          type: 'swipe-path-create-failed',
          areaId,
          reason: e && e.message ? e.message : 'Não foi possível criar a trilha de swipe.',
        });
      }
    })();
    return;
  }

  // Exclusão de uma Área precisa limpar a trilha de swipe cuja área DONA é
  // ela (hacSwipePathAreaId === areaId) — cascata natural, ver
  // deleteA11yArea em accessibility.js. Pontos individuais que apontem pra
  // dentro de OUTRA área que foi excluída são um caso mais raro (a trilha
  // continua existindo, só com um ponto "quebrado" se o nó também for
  // removido do canvas por fora do hac) — tratado com o mesmo espírito
  // best-effort já usado em outros lugares do hac, não coberto 100% nesta
  // entrega (limitação conhecida, documentada aqui de propósito).
  if (msg.type === "cleanup-swipe-path-for-area") {
    (async () => {
      const areaId = msg.areaId;
      _removeSwipePathForArea(areaId);
      _clearOrphanedHighlightStrokes();
      figma.ui.postMessage({ type: 'swipe-path-cleaned-up', areaId });
    })();
    return;
  }

  // Checa se a lib "Design Acessível" está acessível pro reaproveitamento
  // dos componentes reais nas specs de A11y. Usa um componente canário real
  // ("elementos interativos e imagens") como teste: se o import funcionar, a
  // lib está acessível pra esse designer/arquivo; se falhar, orienta a
  // vinculação em vez de deixar o import de fato falhar na hora de criar a spec.
  if (msg.type === "check-a11y-library") {
    (async () => {
      const A11Y_LIBRARY_CANARY_KEY = 'f1bf785a343f191cff72e702d68a27a3a97f0ee9';
      let linked = false;
      try {
        await figma.importComponentByKeyAsync(A11Y_LIBRARY_CANARY_KEY);
        linked = true;
      } catch (e) {
        linked = false;
      }
      figma.ui.postMessage({ type: "a11y-library-status", linked, token: msg.token || null });
    })();
    return;
  }

  // Matching determinístico do fluxo manual "+ Nova spec" (2026-09-11) —
  // disparado por openA11yCategoryPickerModal (accessibility.js) assim que o
  // designer clica "Nova spec" e o canvas é focado no frame da Área. Liga
  // _a11yManualMatchModeActive: como o picker normalmente abre ANTES do
  // designer clicar no elemento-alvo real dentro do frame (o clique nele só
  // acontece depois de ler a instrução), o listener de selectionchange acima
  // re-resolve ao vivo enquanto o modo estiver ligado — sem isso, a única
  // resolução (no instante do clique em "Nova spec") tenderia a bater contra
  // o próprio frame da Área, quase nunca uma INSTANCE DSC útil.
  // stop-manual-spec-match-mode (frontend, ao fechar o picker por qualquer
  // caminho) desliga de novo.
  if (msg.type === "resolve-manual-spec-match") {
    _a11yManualMatchModeActive = true;
    // Captura a seleção REAL de abertura (o que o designer já tinha
    // selecionado antes de clicar "+ Nova spec") — ver comentário completo
    // em _a11yManualMatchLastRealSelectionId. Precisa ser lida aqui, de
    // forma síncrona, ANTES de qualquer foco automático concorrente
    // (start-spec-copy/spec-copy-started, disparado em paralelo pelo mesmo
    // clique) ter chance de mudar figma.currentPage.selection.
    const _sel = figma.currentPage.selection;
    const _openNode = _sel.length > 0 ? _sel[0] : null;
    _a11yManualMatchLastRealSelectionId = _openNode ? _openNode.id : null;
    (async () => { await _resolveManualSpecMatchAndNotify(msg.token || null, _openNode); })();
    return;
  }

  if (msg.type === "stop-manual-spec-match-mode") {
    _a11yManualMatchModeActive = false;
    _a11yManualMatchLastRealSelectionId = null;
    clearTimeout(_a11yManualMatchDebounceTimer);
    return;
  }

  // Ordena specs pela ordem de camadas real da árvore (painel Layers),
  // escopada à Área Marcada de cada grupo (o índice de visita só faz sentido
  // dentro da árvore de uma mesma área). Percorre a partir de
  // `areaTargetNodeId` em DFS — mesmo algoritmo `_walk` de
  // generate-tab-order-from-layers, mas sem o filtro de interatividade (aqui
  // queremos o índice de QUALQUER node). Sem efeito colateral.
  if (msg.type === "resolve-layer-order") {
    (async () => {
      const areaId = msg.areaId;
      const areaTargetNodeId = msg.areaTargetNodeId;
      const wantedIds = new Set(Array.isArray(msg.nodeIds) ? msg.nodeIds : []);
      const order = {};
      const root = areaTargetNodeId ? await _getSceneNodeById(areaTargetNodeId) : null;
      if (root) {
        let visitIndex = 0;
        async function _walkLayerOrder(n) {
          const children = n.children || [];
          for (const child of children) {
            if (child.visible === false) continue;
            if (wantedIds.has(child.id) && !(child.id in order)) {
              order[child.id] = visitIndex;
            }
            visitIndex++;
            await _walkLayerOrder(child);
          }
        }
        await _walkLayerOrder(root);
      }
      // Marca como RESOLVIDO-E-NÃO-ENCONTRADO (null) todo id pedido que a
      // varredura não alcançou — bug real corrigido (2026-09-15, plugin
      // travando ao criar spec): antes a resposta só trazia os ids
      // encontrados, e o frontend (messages.js, 'layer-order-resolved') só
      // cacheia o que volta, mas re-renderiza SEMPRE. Como o render
      // redispara resolve-layer-order pros ids ainda "faltando"
      // (_a11yQueueLayerOrderResolution filtra por `!(id in areaCache)`),
      // qualquer id não alcançável fechava um ciclo infinito
      // render → mensagem → render, sem debounce: o DOM era destruído e
      // reconstruído em loop apertado (innerHTML='' + _refreshIcons), que é
      // o "pisca, ícones somem e trava" relatado.
      //
      // Três caminhos reais levam a um id não alcançado, todos plausíveis
      // no uso normal: (a) `root` nulo — frame da Área apagado/movido;
      // (b) ancestral com visible === false, já que o `continue` acima pula
      // a subárvore inteira; (c) a spec aponta um nó que não está NESTA
      // árvore — o caso mais comum agora que a spec nasce sobre a réplica
      // de trabalho, não sobre o frame original.
      //
      // O valor null é deliberado: entra no cache (`id in areaCache` passa
      // a ser true, encerrando o ciclo) e _a11ySortSpecsByLayerOrder já
      // trata ausência de ordem caindo no fallback alfabético — null não é
      // confundido com posição 0 porque a comparação lá é por `undefined`.
      for (const id of wantedIds) {
        if (!(id in order)) order[id] = null;
      }
      figma.ui.postMessage({ type: "layer-order-resolved", areaId, areaTargetNodeId, order });
    })();
    return;
  }

  // ============================================================
  // Ficha de Handoff — handlers
  // ============================================================
  // _cloneAreaRootIntoFicha REMOVIDA (2026-09-09) — clonava o frame
  // ORIGINAL do zero a cada "Inserir/Atualizar ficha", ignorando a cópia
  // de trabalho que o designer já tinha pronta (com selos/trilha/specs já
  // desenhados). Decisão de produto: "não precisamos da réplica da
  // réplica" — 1 réplica por tipo (Tabulação/Swipe/Leitor de Tela) por
  // área, nunca 2. Os 3 builders abaixo passaram a MOVER a réplica ATIVA
  // (via _resolveActiveTabOrderClone/_resolveActiveSwipePathClone/
  // _resolveActiveSpecClone — mesmas funções que o fluxo de trabalho usa)
  // pra dentro da seção da Ficha, reaproveitando _moveActiveCloneIntoFichaSection.

  // _FICHA_BLOCK_CONFIG foi movida pro escopo GLOBAL (2026-09-11) — ver a
  // declaração acima de _createOrGetFichaFrame e o comentário lá.

  // Cria (ou retorna, idempotente) o bloco VAZIO de uma funcionalidade
  // dentro de "[HAC] Itens" — só a caixa com título + legenda, sem
  // snapshot/clone/marcadores ainda. Extraída dos 3 builders (2026-09-11,
  // modelo de estado único): o mesmo bloco é criado cedo (quando a Área é
  // marcada, via _ensureFichaBlocksForArea) e depois só tem seu CONTEÚDO
  // alternado entre clone real (em edição) e imagem+instruções
  // (finalizado) — nunca é recriado nem movido de lugar.
  async function _getOrCreateFichaBlockSection(itensFrame, sectionKey, areaId, a11yOrigin) {
    const cfg = _FICHA_BLOCK_CONFIG[sectionKey];
    if (!cfg) return null;

    let section = _findFichaSectionInFrame(itensFrame, sectionKey);
    if (section) {
      // Backfill de nome (2026-09-11): o bloco é idempotente por
      // pluginData, então um bloco criado antes da renomeação manteria o
      // nome antigo pra sempre. Nomes "[HAC] *" são contrato estrutural,
      // não anotação livre do designer — convergir aqui é seguro.
      try { section.name = cfg.name; } catch (e) { }
      // Backfill de direção (2026-09-14): blocos criados antes desta
      // revisão nasceram VERTICAL, empilhando réplica embaixo das
      // instruções. Converge sem recriar o node (a árvore não muda, só a
      // direção do Auto Layout).
      try {
        if (section.layoutMode === 'VERTICAL') section.layoutMode = 'HORIZONTAL';
      } catch (e) { }
    } else {
      section = figma.createFrame();
      section.name = cfg.name;
      // HORIZONTAL (2026-09-14, reportado com print: "a réplica está abaixo
      // dele, não do lado"): o bloco empilha "[HAC] Instruções de {Func}" e
      // "[HAC] Handoff - {Func}" (que contém a réplica + selos). Com
      // VERTICAL eles ficavam um sobre o outro; a referência visual do
      // usuário sempre mostrou instruções À ESQUERDA e réplica À DIREITA.
      section.layoutMode = 'HORIZONTAL';
      section.primaryAxisSizingMode = 'AUTO';
      section.counterAxisSizingMode = 'AUTO';
      section.itemSpacing = 16;
      if (cfg.counterAxisAlignItems) section.counterAxisAlignItems = cfg.counterAxisAlignItems;
      // Padding/radius intermediários (2026-09-10, mesma escala descendente
      // 80→64→24→16→8 confirmada via REST API no node de referência real —
      // ver comentário completo em _createOrGetFichaFrame).
      section.paddingLeft = 16; section.paddingRight = 16;
      section.paddingTop = 16; section.paddingBottom = 16;
      section.cornerRadius = 8;
      section.fills = [];
      section.clipsContent = false;
      section.setPluginData('hacFichaSection', sectionKey);
      _insertFichaSectionInOrder(itensFrame, section, sectionKey);
    }

    // Wrapper "[HAC] Instruções de {Func}" agrupando título + legenda
    // (2026-09-11, estrutura definida pelo usuário) — idempotente, criado
    // junto com o bloco.
    await _getOrCreateFichaInstrucoesFrame(section, sectionKey, areaId, a11yOrigin);
    return section;
  }

  // "[HAC] Instruções de {Func}" — agrupa o título do bloco e a legenda de
  // instruções, que antes ficavam soltos como filhos diretos do bloco.
  // Idempotente por pluginData `hacFichaInstrucoes` = sectionKey.
  async function _getOrCreateFichaInstrucoesFrame(section, sectionKey, areaId, a11yOrigin) {
    const cfg = _FICHA_BLOCK_CONFIG[sectionKey];
    if (!cfg || !section) return null;

    for (const child of (section.children || [])) {
      try {
        if (child.getPluginData && child.getPluginData('hacFichaInstrucoes') === sectionKey) {
          return child;
        }
      } catch (e) { }
    }

    const instrucoes = figma.createFrame();
    instrucoes.name = `[HAC] Instruções de ${cfg.title}`;
    instrucoes.layoutMode = 'VERTICAL';
    instrucoes.primaryAxisSizingMode = 'AUTO';
    // Bug estrutural corrigido (2026-09-12, mesma classe do bug já
    // corrigido em "Título Card"/"Tela N" — auditoria completa achou este
    // ponto sem a mesma correção): `counterAxisSizingMode='AUTO'` (Hug)
    // aqui deixa "Título do bloco" sem NENHUM ancestral imediato com
    // largura real — a Legenda (FIXED, ~260px) só entra DEPOIS. FIXED
    // resolve a raiz: o pai já nasce com largura real, antes mesmo do
    // título ser escrito.
    //
    // Largura elevada de 260 para 360 (2026-09-14, corrige "Ordem de T..."
    // cortado — print real do usuário): 260px cabia "Leitor de Tela" e
    // "Ordem de Tabulação", mas não "Ordem de Leitura | Swipe" (a mais
    // longa das 3, ~24 caracteres em 'title/large'=28px/Roboto SemiBold) —
    // o texto FILL antigo comprimia pro pai, quebrando linha ou cortando.
    // 360px é folga real medida pelas 3 strings de _FICHA_BLOCK_CONFIG,
    // não um chute — mas não é mais a única linha de defesa:
    // _appendFichaBlockTitle agora MEDE a largura natural do título (fase
    // 'WIDTH_AND_HEIGHT') e cresce este frame de novo se algum título
    // futuro, mesmo maior que os 3 atuais, ainda não couber.
    instrucoes.resizeWithoutConstraints(360, 1);
    instrucoes.counterAxisSizingMode = 'FIXED';
    instrucoes.counterAxisAlignItems = 'MIN';
    instrucoes.itemSpacing = 12;
    instrucoes.paddingLeft = 0; instrucoes.paddingRight = 0;
    instrucoes.paddingTop = 0; instrucoes.paddingBottom = 0;
    instrucoes.fills = [];
    instrucoes.clipsContent = false;
    instrucoes.setPluginData('hacCategory', 'a11y');
    instrucoes.setPluginData('hacFichaInstrucoes', sectionKey);
    section.insertChild(0, instrucoes);

    await _appendFichaBlockTitle(instrucoes, cfg.title);

    // Reaproveita a legenda que já nasceu junto da réplica de trabalho
    // (_ensureLegendBesideClone) em vez de criar uma segunda — é a MESMA
    // legenda do início ao fim. Só cria do zero quando não existe nenhuma
    // (ex.: área antiga, ou réplica já descartada).
    const existingLegend = areaId ? _findLegendForArea(areaId, sectionKey) : null;
    if (existingLegend) {
      instrucoes.appendChild(existingLegend);
    } else {
      // Tabulação/Swipe/Leitor de Tela: as 3 usam a legenda COMPLETA
      // (título + introdução + passos numerados do template) na Ficha final
      // — 2026-09-16, correção de mal-entendido: uma sessão anterior tinha
      // removido a instrução da Ficha pra Tabulação/Swipe interpretando
      // errado um pedido que era só sobre a UI do plugin ("retire da aba,
      // viva só na modal"); o usuário nunca pediu pra tirar da Ficha
      // entregável, e a reclamou explicitamente ao ver o frame sem o texto.
      // _buildFichaInstructionOnlyLegendColumn (só título) permanece
      // definida em code.js pra não perder o código, mas não é mais
      // chamada por nenhum caminho — reintroduzir exigiria pedido explícito
      // novo do usuário.
      const legendBuilder = _buildFichaLegendColumn;
      // 5º parâmetro `feature` (2026-09-17, correção de bug real: badges
      // vazando pra Tabulação/Swipe) — `cfg.instructionKey` já é exatamente
      // 'leitorTela'|'tabulacao'|'swipe' (ver _FICHA_BLOCK_CONFIG em
      // code.js), reaproveitado tal como está, sem valor novo a inventar.
      const legend = await legendBuilder(
        FICHA_INSTRUCTION_CONTENT[cfg.instructionKey],
        cfg.legendTitle,
        cfg.legendFallback,
        a11yOrigin,
        cfg.instructionKey
      );
      legend.setPluginData('hacCategory', 'a11y');
      if (areaId) legend.setPluginData('hacLegendForArea', `${areaId}::${sectionKey}`);
      instrucoes.appendChild(legend);
    }
    return instrucoes;
  }

  // "[HAC] Handoff - {Func}" — FRAME (2026-09-11, revisão 2: NÃO é mais
  // GROUP) que passa a conter, desde a CRIAÇÃO da réplica de trabalho: o
  // clone vivo (editável, clicável), sua Moldura+Título
  // (_ensureCloneWorkFrame) e o GROUP de overlay de marcadores
  // (_getOrCreateCloneOverlayGroup). No "Preencher Handoff", o clone é
  // substituído por um snapshot NO MESMO FRAME — o FRAME em si nunca é
  // recriado nem trocado de tipo.
  //
  // Revisão 3 (2026-09-11, confirmado pelo usuário via painel de
  // propriedades real do Figma — "742 Hug × 1704 Hug"): este FRAME TEM
  // Auto Layout ligado (`layoutMode='HORIZONTAL'`, sizing AUTO/AUTO) — é
  // isso que produz o "Hug × Hug" no painel. A aparente contradição com o
  // bug já revertido nesta sessão ("Auto Layout comprimia/escondia a
  // réplica") se resolve porque aqui TODO filho direto (clone, Moldura,
  // Título, GROUP de overlay) recebe `layoutPositioning = 'ABSOLUTE'`
  // (mesma função já usada pro overlay,
  // _setCloneOverlayGroupAbsolutePositioning) — um node ABSOLUTE fica FORA
  // do fluxo do Auto Layout (não é redimensionado/comprimido por ele), mas
  // o Figma ainda calcula o Hug do PAI pela união dos bounding boxes de
  // TODOS os filhos, ABSOLUTE incluído. Resultado: o FRAME cresce/encolhe
  // sozinho ao redor do conteúdo (sem resize manual, sem
  // _fitFichaHandoffFrameToChildren) e nenhum filho é comprimido — o bug
  // revertido antes só acontecia quando o CLONE em si ficava em FLUXO
  // (não-ABSOLUTE) dentro de um Auto Layout.
  //
  // Por que FRAME (não GROUP): GROUP tem o ícone/tipo errado no painel —
  // o usuário apontou a diferença visual entre os 2 ícones explicitamente.
  //
  // Idempotente por `hacFichaHandoffGroup` = "{areaId}::{sectionKey}" —
  // mesma chave já usada na versão GROUP, sem necessidade de migração.
  function _getOrCreateFichaHandoffFrame(section, sectionKey, areaId) {
    const cfg = _FICHA_BLOCK_CONFIG[sectionKey];
    if (!cfg || !section) return null;
    const markerValue = `${areaId}::${sectionKey}`;

    for (const child of (section.children || [])) {
      try {
        if (child.getPluginData && child.getPluginData('hacFichaHandoffGroup') === markerValue && !child.removed) {
          try { child.name = `[HAC] Handoff - ${cfg.title}`; } catch (e) { }
          return child;
        }
      } catch (e) { }
    }

    const frame = figma.createFrame();
    frame.name = `[HAC] Handoff - ${cfg.title}`;
    // SEM Auto Layout (2026-09-14, corrige "o frame da ordem de tabulação
    // está toda encolhida"): a revisão anterior ligava Auto Layout aqui
    // "só pelo Hug automático", partindo da premissa errada de que o Hug
    // se ajustaria ao bbox dos filhos ABSOLUTE. Não se ajusta — um filho
    // em `layoutPositioning='ABSOLUTE'` é IGNORADO pelo cálculo de Hug do
    // pai, então o frame colapsava para perto de zero e a réplica (que é o
    // conteúdo principal: clone + selos sobrepostos) aparecia espremida/
    // cortada dentro dele.
    //
    // Com `layoutMode='NONE'`, os filhos ficam em posicionamento livre
    // (que é exatamente o que réplica e overlay de selos precisam — eles se
    // sobrepõem por coordenada, não empilham em fluxo) e o tamanho do frame
    // é definido numericamente por _fitFichaHandoffFrameToChildren, mesma
    // abordagem de largura explícita já adotada nos textos da Ficha.
    frame.layoutMode = 'NONE';
    // clipsContent=false (2026-09-11): a réplica + moldura + overlay
    // extrapolam o bbox inicial (moldura tem padding próprio ao redor do
    // clone) — sem isso, qualquer parte fora dos limites do momento da
    // criação apareceria cortada.
    frame.clipsContent = false;
    frame.fills = [];
    frame.setPluginData('hacCategory', 'a11y');
    frame.setPluginData('hacFichaHandoffGroup', markerValue);
    section.appendChild(frame);
    return frame;
  }

  // Reafirma `layoutPositioning='ABSOLUTE'` em cada filho direto de
  // "[HAC] Handoff - {Func}" (2026-09-11, revisão 3) — chamar depois de
  // QUALQUER appendChild novo dentro dele (clone, moldura, título, overlay,
  // snapshot), pelo mesmo motivo documentado em
  // _setCloneOverlayGroupAbsolutePositioning: um node recém-parentado num
  // FRAME com Auto Layout nasce em modo de FLUXO por padrão, e só sai dele
  // quando esta propriedade é setada explicitamente — sem isso o Auto
  // Layout tentaria empilhar/comprimir o conteúdo (o bug já revertido
  // nesta sessão). Usa a MESMA função já usada pro overlay — ela já é
  // genérica (recebe qualquer node, só checa layoutMode do pai).
  function _absolutizeFichaHandoffFrameChildren(frame) {
    if (!frame || frame.removed) return;
    try {
      for (const child of (frame.children || [])) {
        _setCloneOverlayGroupAbsolutePositioning(child);
      }
    } catch (e) { }
  }

  // Redimensiona "[HAC] Handoff - {Func}" ao bounding box real dos filhos
  // (réplica de trabalho + overlay de selos, ou snapshot + overlay depois
  // do "Preencher Handoff").
  //
  // MECANISMO PRINCIPAL de dimensionamento desse frame (2026-09-14): como
  // ele não tem Auto Layout (ver _getOrCreateFichaHandoffFrame), nada o
  // dimensiona sozinho — sem esta função ele ficaria colapsado e o
  // conteúdo apareceria espremido/cortado. Precisa ser chamada sempre que
  // o conteúdo mudar de tamanho: ao reparentar o clone, ao desenhar
  // selos/trilha/specs, e depois de remover a réplica no Preencher Handoff.
  function _fitFichaHandoffFrameToChildren(frame) {
    if (!frame || frame.removed) return;
    try {
      const children = (frame.children || []).filter(c => {
        try { return c && !c.removed && c.visible !== false && c.absoluteBoundingBox; } catch (e) { return false; }
      });
      if (children.length === 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of children) {
        const bb = c.absoluteBoundingBox;
        minX = Math.min(minX, bb.x);
        minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width);
        maxY = Math.max(maxY, bb.y + bb.height);
      }
      const frameBB = frame.absoluteBoundingBox;
      if (!frameBB) return;
      const newWidth = Math.max(1, Math.round(maxX - minX));
      const newHeight = Math.max(1, Math.round(maxY - minY));
      frame.resizeWithoutConstraints(newWidth, newHeight);
      // O resize acima pode ter deslocado o FRAME visualmente (o Figma
      // ancora no canto sup.-esq. do próprio frame, não no bbox dos
      // filhos) — corrige x/y pra que o FRAME sempre envolva exatamente
      // [minX,minY]-[maxX,maxY], preservando as posições absolutas dos
      // filhos (que não são tocadas por este resize).
      const afterBB = frame.absoluteBoundingBox;
      if (afterBB) {
        frame.x = Math.round(frame.x + (minX - afterBB.x));
        frame.y = Math.round(frame.y + (minY - afterBB.y));
      }
    } catch (e) {
      console.error('[hac] _fitFichaHandoffFrameToChildren: falha ao ajustar tamanho (não impede o restante).', e && e.message);
    }
  }

  // Localiza a legenda de uma funcionalidade pelo pluginData estável
  // (`hacLegendForArea` = "{areaId}::{sectionKey}"), onde quer que ela
  // esteja: solta na Section (ao lado da réplica) ou já dentro do bloco da
  // Ficha. Mesmo princípio de busca por marca, nunca por posição/nome, já
  // usado pelo resto do hac.
  function _findLegendForArea(areaId, sectionKey) {
    const markerValue = `${areaId}::${sectionKey}`;
    let found = null;
    const check = (node) => {
      if (found || !node) return;
      try {
        if (node.getPluginData && node.getPluginData('hacLegendForArea') === markerValue && !node.removed) {
          found = node;
        }
      } catch (e) { }
    };
    _forEachA11ySessionDirectChild(check);
    if (!found) _forEachA11ySessionAreaChild(check);
    if (!found) _forEachA11yFichaFrameChild(check);
    return found;
  }

  // Monta o objeto mínimo de área que a cadeia da Ficha precisa, a partir
  // do que as funções de clone têm em mãos (2026-09-11). Elas recebem só
  // `areaId`/`sectionName`/`root`, não o objeto de área completo que vem do
  // frontend — e a cadeia só usa id, targetNodeId, targetNodeName,
  // sectionName e number. O número é lido do Grupo da Área no canvas (o
  // nome dele começa com "N · Label", ver create-a11y-area); sem isso, cai
  // em 1, que só afeta a ordem/rótulo, nunca a identidade (que é o id).
  async function _areaStubFromRoot(areaId, root, sectionName) {
    let number = 1;
    try {
      // getNodeByIdAsync (não a versão síncrona, proibida sob
      // documentAccess: dynamic-page — ver scripts/check-figma-api-usage.cjs).
      const areaGroup = areaId ? await _getSceneNodeById(areaId) : null;
      const m = areaGroup && areaGroup.name && areaGroup.name.match(/^(\d+)\s*·/);
      if (m) number = parseInt(m[1], 10) || 1;
    } catch (e) { }
    return {
      id: areaId || '',
      targetNodeId: root ? root.id : null,
      targetNodeName: root ? root.name : null,
      sectionName: sectionName || null,
      number,
    };
  }

  // Garante a estrutura da Ficha daquela funcionalidade NO MOMENTO em que
  // a réplica de trabalho é criada (2026-09-11, pedido do usuário: "as
  // instruções são criadas assim que as réplicas são criadas. Isso faria
  // com que o frame [HAC] {Funcionalidade} seja criado de maneira
  // correta"). Monta a cadeia inteira — "[HAC] Documentação" → "Tela N" →
  // "[HAC] Assets do Handoff" → "[HAC] {Funcionalidade}" → "[HAC]
  // Instruções de {Func}" — e é lá dentro que a legenda nasce.
  //
  // Revisão 2 (2026-09-11): também cria/obtém o FRAME "[HAC] Handoff -
  // {Func}" (irmão de "[HAC] Instruções de {Func}" dentro do bloco) e
  // REPARENTA o clone (+ Moldura/Título via _ensureCloneWorkFrame, já
  // chamado pelo chamador logo depois desta função) pra dentro dele — no
  // lugar de ficar solto na Section de sessão. Isso satisfaz a estrutura
  // exata pedida pelo usuário nos prints reais do painel de Layers.
  //
  // Por que reparentar AQUI (dentro desta função) em vez de mudar a ordem
  // das 3 `_create*CloneForArea`: o clone já chega aqui com x/y absolutos
  // corretos (calculados por _findFreeTabOrderCopyPosition, sem nenhuma
  // mudança) e já foi reparentado uma vez pra Section por
  // `_reparentIntoSection` no chamador — esta função só o move de novo,
  // da Section pro FRAME de Handoff, preservando posição visual (mesmo
  // princípio de medição before/after). Isso evita reordenar a sequência
  // testada e protegida das 3 funções de criação (R11 do plano).
  //
  // Toda a cadeia é idempotente por pluginData, então chamar aqui só
  // ANTECIPA a criação; o "Preencher Handoff" depois reaproveita
  // exatamente os mesmos nós, sem duplicar nada.
  // NÃO altera como a réplica nasce, como é clicada/marcada, nem o ciclo de
  // vida dela — só ONDE ela mora na árvore.
  async function _ensureLegendBesideClone(clone, sectionKey, area, designerName, currentUserId) {
    try {
      if (!clone || clone.removed) return null;
      const cfg = _FICHA_BLOCK_CONFIG[sectionKey];
      if (!cfg) return null;

      const areaId = (area && area.id) || '';
      const marker = 'hacLegendForArea';
      const markerValue = `${areaId}::${sectionKey}`;

      // Fontes pré-carregadas ANTES de montar a legenda (2026-09-11, bug
      // real: a instrução não aparecia ao criar a réplica). A API do Figma
      // exige a fonte carregada antes de escrever `characters`, e
      // _buildFichaLegendColumn seta `characters` antes de chamar
      // _applyFichaTypography (que é quem carrega) — nos builders da Ficha
      // isso passava batido porque alguma fonte já tinha sido carregada
      // antes na mesma execução, mas neste caminho (criação da réplica)
      // nada carregou ainda, então lançava e caía no catch silencioso.
      for (const f of [
        { family: 'Roboto', style: 'Regular' }, { family: 'Roboto', style: 'Medium' }, { family: 'Roboto', style: 'Bold' },
        { family: 'Inter', style: 'Regular' }, { family: 'Inter', style: 'Medium' }, { family: 'Inter', style: 'Bold' },
      ]) {
        try { await figma.loadFontAsync(f); } catch (e) { /* famílias ausentes são normais; basta uma delas resolver */ }
      }

      // A cadeia inteira é idempotente — _getOrCreateFichaBlockSection já
      // chama _getOrCreateFichaInstrucoesFrame, que por sua vez cria a
      // legenda (ou reaproveita uma já existente via _findLegendForArea).
      //
      // Logs de diagnóstico (2026-09-11, mantidos deliberadamente): foram
      // eles que expuseram o bug real de _FICHA_BLOCK_CONFIG declarada no
      // meio do handler (temporal dead zone) — sem passo a passo, o catch
      // abaixo reportava só a mensagem final, não qual elo da cadeia parou.
      console.log('[hac][legenda] início', { sectionKey, areaId, cloneName: clone.name });
      const docFrame = await _createOrGetFichaFrame(area, designerName, currentUserId);
      console.log('[hac][legenda] docFrame', docFrame && docFrame.id, docFrame && docFrame.name);
      const itensFrame = await _getOrCreateFichaItensFrame(docFrame, area);
      console.log('[hac][legenda] itensFrame', itensFrame && itensFrame.id, itensFrame && itensFrame.name);

      // Reparenta o Grupo da Área ("N · Label" — selo + frame ORIGINAL
      // marcado) pra dentro de "[HAC] Assets do Handoff", como PRIMEIRO
      // filho (2026-09-11, pedido explícito do usuário: "a tela
      // selecionada vai pra dentro da camada da Tela pela qual irá
      // receber a documentação [...] fica dentro da pasta de assets dessa
      // tela em específico"). Motivo: hoje esse GROUP nasce solto,
      // irmão direto de "[HAC] Documentação" — ao marcar uma 2ª tela, o
      // frame original dela se acumula solto ao lado, sem organização.
      //
      // Momento (2026-09-11, avaliado com architecture-guardian antes de
      // implementar): só AQUI, na primeira captura de qualquer
      // funcionalidade — nunca dentro de create-a11y-area em si, porque
      // "Tela N"/"[HAC] Assets do Handoff" só existem a partir desta
      // cadeia (_getOrCreateFichaItensFrame), que por sua vez PRECISA de
      // area.id já existente pra se marcar (hacFichaTelaForArea) — e
      // area.id só nasce depois do figma.group() em create-a11y-area.
      // Antecipar essa criação pra dentro de create-a11y-area inverteria
      // essa dependência e criaria a estrutura da Ficha mesmo quando o
      // designer nunca captura nada — mudança de comportamento maior, não
      // pedida. Idempotente: se o Grupo já estiver dentro de itensFrame
      // (chamada seguinte, "Atualizar"), não faz nada.
      try {
        const areaGroup = areaId ? await _getSceneNodeById(areaId) : null;
        // Log de diagnóstico (2026-09-11): sem isto, um `areaId` vazio/
        // divergente ou um `areaGroup` não encontrado passa batido — o `if`
        // abaixo simplesmente não entra, sem lançar nenhum erro, e o
        // catch (que só pega EXCEÇÕES) nunca dispara. Foi exatamente esse
        // silêncio que escondeu o bug real reportado com print ("o Grupo
        // ficou solto, fora da Section inteira").
        console.log('[hac][área] reparenting', {
          areaId, found: !!areaGroup, removed: areaGroup && areaGroup.removed,
          currentParent: areaGroup && areaGroup.parent && areaGroup.parent.id,
          currentParentName: areaGroup && areaGroup.parent && areaGroup.parent.name,
          targetParent: itensFrame && itensFrame.id,
        });
        if (areaGroup && !areaGroup.removed && areaGroup.parent !== itensFrame) {
          // Bug real corrigido (2026-09-12, regressão reportada pelo
          // usuário: "a réplica está sendo levada pra uma área totalmente
          // aleatória"): `itensFrame` TEM Auto Layout ativo
          // (layoutMode='HORIZONTAL'), e GroupNode NÃO suporta
          // `layoutPositioning` (propriedade nem existe nele) — então,
          // diferente do padrão usado em todo o resto do código pra
          // preservar posição absoluta (medir before/after, ajustar x/y
          // manual, válido só quando o destino NÃO tem Auto Layout ou
          // quando o node aceita ABSOLUTE), o GROUP aqui entra
          // necessariamente EM FLUXO dentro do Auto Layout. Um ajuste
          // manual de x/y sobre um node em fluxo é sobrescrito pelo motor
          // de Auto Layout do Figma no próximo reflow — o `beforeBB`/
          // `afterBB` daqui não tinha efeito real, só inflava o bounding
          // box reportado pra _collectA11yOccupiedBounds, empurrando a
          // PRÓXIMA réplica pra uma posição distorcida/distante. Correção:
          // não tentar preservar posição manual aqui — o GROUP participa
          // do fluxo normalmente (primeiro filho, lado a lado com os
          // blocos de funcionalidade), como qualquer outro item de um
          // Auto Layout HORIZONTAL.
          itensFrame.insertChild(0, areaGroup);
          console.log('[hac][área] reparentado com sucesso', areaGroup.id);
        }
      } catch (areaReparentError) {
        // Best-effort — organização é cosmética, nunca deve impedir o
        // resto da cadeia (legenda, bloco, réplica) de seguir. figma.notify
        // adicionado (2026-09-11): o console.error sozinho já escondeu
        // outro bug real nesta sessão (a instrução não aparecia) por não
        // ser visível ao designer sem o console aberto.
        console.error('[hac] _ensureLegendBesideClone: falha ao mover o Grupo da Área pra dentro de "[HAC] Assets do Handoff".', areaReparentError && (areaReparentError.stack || areaReparentError.message));
        try { figma.notify('Grupo da área não organizado: ' + (areaReparentError && (areaReparentError.message || String(areaReparentError))), { error: true, timeout: 6000 }); } catch (e4) { }
      }

      const section = await _getOrCreateFichaBlockSection(itensFrame, sectionKey, areaId, area && area.a11yOrigin);
      console.log('[hac][legenda] bloco', section && section.id, section && section.name);
      if (!section) return null;

      // FRAME "[HAC] Handoff - {Func}" (2026-09-11, revisão 3) — cria/obtém
      // e reparenta o clone nele, preservando a posição visual. ORDEM
      // CRÍTICA (mesmo princípio já usado pro overlay em todos os 3
      // builders): ABSOLUTE tem que ser setado IMEDIATAMENTE após o
      // appendChild, ANTES de medir/escrever qualquer x/y — o FRAME de
      // Handoff TEM Auto Layout (é isso que dá o Hug automático), e
      // enquanto o clone ainda está em modo de FLUXO (não-ABSOLUTE), o Auto
      // Layout pode recalcular/descartar a escrita manual de posição no
      // reflow seguinte.
      const handoffFrame = _getOrCreateFichaHandoffFrame(section, sectionKey, areaId);
      console.log('[hac][legenda] handoffFrame', handoffFrame && handoffFrame.id, handoffFrame && handoffFrame.name);
      // Bug real corrigido (2026-09-11, reportado com print pelo usuário:
      // "frame fantasma" vazio ao lado do bloco real): _getOrCreateFichaHandoffFrame
      // já PERSISTE o FRAME no canvas (section.appendChild dentro dela)
      // antes de devolver o controle aqui — se QUALQUER coisa falhar entre
      // esse ponto e o clone efetivamente entrar nele, o FRAME sobrevive
      // vazio, sem rollback. Try/catch dedicado: se o reparenting falhar,
      // remove o FRAME recém-criado (só se ainda estiver vazio — nunca
      // remove um FRAME que já tinha conteúdo de uma sessão anterior) em
      // vez de deixá-lo visível sem nada dentro.
      if (handoffFrame) {
        try {
          if (clone.parent !== handoffFrame) {
            // Overlay de selos/trilha/specs precisa ser movido JUNTO com o
            // clone (2026-09-14): ele é irmão do clone (nunca filho), e
            // sem isto ficaria pra trás, solto na Section, enquanto a
            // réplica entra no bloco — os selos "descolariam" da tela.
            const overlayKey = sectionKey === 'tabulacao' ? 'hacTabOrderBadgesGroupForClone'
              : sectionKey === 'swipe' ? 'hacSwipePathGroupForClone'
                : 'hacSpecGroupForClone';
            let overlay = null;
            try {
              for (const sibling of ((clone.parent && clone.parent.children) || [])) {
                if (sibling !== clone && sibling.getPluginData && sibling.getPluginData(overlayKey) === clone.id) {
                  overlay = sibling;
                  break;
                }
              }
            } catch (e) { }
            const overlayBeforeBB = overlay && !overlay.removed ? overlay.absoluteBoundingBox : null;
            // Bug real corrigido (2026-09-14): o código abaixo referenciava
            // `beforeBB`, variável que existe em funções IRMÃS mas nunca
            // neste escopo — lançava ReferenceError, engolido pelo catch
            // logo abaixo. Efeito em cascata: o overlay nunca era movido
            // junto (os selos "descolavam" da réplica) e, principalmente,
            // `_fitFichaHandoffFrameToChildren` (última linha do bloco)
            // nunca rodava — o frame ficava no tamanho default 100×100, e
            // o bbox calculado depois, já com overlay e clone desalinhados,
            // inflava "Tela N" para ~2520px de altura (o vão vertical
            // vazio reportado com print).
            const cloneBeforeBB = clone.absoluteBoundingBox;

            handoffFrame.appendChild(clone);
            _setCloneOverlayGroupAbsolutePositioning(clone);
            // Réplica ancorada na ORIGEM do frame (2026-09-14, corrige o
            // "frame fantasma"): antes o x/y era corrigido pelo delta
            // before/after, o que PRESERVAVA a posição livre distante em
            // que o clone tinha nascido no canvas — o bloco da Ficha
            // ficava visualmente vazio no lugar certo, com o conteúdo real
            // lá longe. Agora o clone vai pro canto do frame (0,0) e é o
            // FRAME que se ajusta ao redor dele, aqui dentro da Ficha.
            clone.x = 0;
            clone.y = 0;

            if (overlay && !overlay.removed && overlayBeforeBB) {
              // O overlay acompanha o MESMO deslocamento que o clone
              // sofreu, preservando o alinhamento selo↔elemento.
              const cloneAfterBB = clone.absoluteBoundingBox;
              handoffFrame.appendChild(overlay);
              _setCloneOverlayGroupAbsolutePositioning(overlay);
              const overlayAfterBB = overlay.absoluteBoundingBox;
              if (cloneAfterBB && cloneBeforeBB && overlayAfterBB) {
                const deltaX = Math.round((cloneAfterBB.x - cloneBeforeBB.x) - (overlayAfterBB.x - overlayBeforeBB.x));
                const deltaY = Math.round((cloneAfterBB.y - cloneBeforeBB.y) - (overlayAfterBB.y - overlayBeforeBB.y));
                overlay.x += deltaX;
                overlay.y += deltaY;
              }
            }

            // Ajusta o tamanho do FRAME ao conteúdo real assim que a
            // réplica entra (2026-09-14) — sem Auto Layout, ele não cresce
            // sozinho, e sem isto ficaria colapsado, com a réplica
            // aparecendo espremida/cortada dentro dele.
            _fitFichaHandoffFrameToChildren(handoffFrame);
          }
        } catch (reparentError) {
          // figma.notify além do console (2026-09-14): este catch escondeu
          // um ReferenceError por várias rodadas de teste — o sintoma
          // chegava como "layout bagunçado", nunca como erro. Qualquer
          // falha aqui quebra o dimensionamento do bloco, então precisa
          // ser visível pra quem está usando o plugin, não só no console.
          console.error('[hac] _ensureLegendBesideClone: reparenting do clone pro FRAME de Handoff falhou.', reparentError && (reparentError.stack || reparentError.message));
          try { figma.notify('Falha ao organizar a réplica no bloco: ' + (reparentError && (reparentError.message || String(reparentError))), { error: true, timeout: 8000 }); } catch (e4) { }
          try {
            if (!handoffFrame.removed && (handoffFrame.children || []).length === 0) {
              handoffFrame.remove();
            }
          } catch (e3) { }
        }
      }

      // "Tela N" precisa refletir a largura real do conteúdo assim que a
      // réplica entra pela primeira vez (2026-09-11) — ver comentário em
      // _getOrCreateFichaAreaGroup/_fitTelaFrameWidthToContent.
      _fitTelaFrameWidthFromItensFrame(itensFrame);

      const legend = _findLegendForArea(areaId, sectionKey) || null;
      console.log('[hac][legenda] legenda encontrada?', !!legend, legend && legend.id);
      return legend;
    } catch (e) {
      // Visível ao designer, não só no console (2026-09-11): este catch já
      // escondeu um bug real por uma rodada inteira (fonte não carregada
      // antes de escrever `characters`) — a instrução simplesmente não
      // aparecia, sem nenhum sinal de que algo tinha falhado.
      console.error('[hac] _ensureLegendBesideClone: falha ao inserir as instruções ao lado da réplica (não impede o trabalho).', e && (e.stack || e.message));
      // Mensagem com o erro REAL (2026-09-11): o texto genérico anterior não
      // dizia o que falhou, e o bug voltou a aparecer sem deixar rastro
      // utilizável pro designer relatar.
      try { figma.notify('Instruções não inseridas: ' + (e && (e.message || String(e))), { error: true, timeout: 8000 }); } catch (e2) { }
      return null;
    }
  }


  // Seção "Tabulação" da Ficha — MOVE a réplica de trabalho já existente
  // da área (2026-09-09, decisão de produto acima). Resolve a cópia ATIVA
  // via _resolveActiveTabOrderClone (mesma função que o fluxo de trabalho
  // normal usa — cria do zero só se genuinamente
  // não existir nenhuma ainda) e reparenta clone+overlay (com os selos JÁ
  // desenhados) pra dentro da seção da Ficha via
  // _moveActiveCloneIntoFichaSection (idempotente — chamar de novo em
  // "Atualizar" não move nada se já estiver dentro de uma Ficha). Itens
  // NOVOS (ainda sem selo no overlay) são desenhados incrementalmente
  // depois de mover, reaproveitando _createTabOrderBadge — que já resolve
  // sozinha o overlay correto do clone (agora dentro da Ficha) via
  // _getOrCreateCloneOverlayGroup.
  async function _buildFichaTabulacaoSection(fichaFrame, area, items, designerName, currentUserId) {
    // Reestruturação de árvore (2026-09-10): destino passa a ser "[HAC]
    // Itens" (dentro do Grupo "Área N - Nome"), não mais o fichaFrame raiz
    // diretamente — _findFichaSectionInFrame/_insertFichaSectionInOrder não
    // mudam, só o frame contra o qual operam.
    const itensFrame = await _getOrCreateFichaItensFrame(fichaFrame, area);
    const section = await _getOrCreateFichaBlockSection(itensFrame, 'tabulacao', area.id, area.a11yOrigin);

    let itemCount = 0;
    const resolved = area.targetNodeId
      ? await _resolveActiveTabOrderClone(area.id, area.targetNodeId, area.sectionName, designerName, currentUserId)
      : null;
    if (resolved) {
      const { clone, nodeMap } = resolved;
      // FRAME "[HAC] Handoff - {Func}" (2026-09-11, revisão 2) — já deve
      // existir a esta altura, criado junto com a réplica de trabalho (ver
      // _ensureLegendBesideClone/reordenação nos 3 _create*CloneForArea).
      // Fallback defensivo: cria aqui se por algum motivo ainda não existir
      // (ex. área antiga, migração), mas o caminho normal é reaproveitar.
      const handoffFrame = _getOrCreateFichaHandoffFrame(section, 'tabulacao', area.id);

      // Réplica de fundo vira snapshot estático (2026-09-10) — a réplica de
      // TRABALHO (`clone`) nunca mais é movida pra dentro da Ficha, só uma
      // imagem dela. O overlay de marcadores (selos) continua real e é
      // movido/reaproveitado como grupo, sobreposto ao snapshot. Snapshot e
      // overlay vivem dentro do FRAME "[HAC] Handoff - {Func}" (2026-09-11,
      // revisão 2 — antes era GROUP, agora é o mesmo FRAME que já hospedava
      // a réplica de trabalho viva).
      const snapshotTarget = handoffFrame || section;
      const snapshot = await _snapshotCloneIntoFichaSection(clone, snapshotTarget, 'hacTabOrderBadgesGroupForClone', area.id);

      // Selos já existentes no overlay não são redesenhados — só os itens
      // ainda sem selo equivalente dentro dele entram aqui. Dedupe por
      // hacTabOrderBadgeForTarget (marcado por _createTabOrderBadge desde
      // 2026-09-09); fallback por `number` no NOME do grupo cobre selos
      // criados ANTES desta correção, que ainda não têm a marca.
      const overlayGroup = _getOrCreateCloneOverlayGroup(clone, 'hacTabOrderBadgesGroupForClone', '[Selos de Tabulação]', area.id);
      const overlayTarget = handoffFrame || section;
      // Bug real corrigido (2026-09-14, confirmado com prints do usuário:
      // após "Atualizar Handoff", o snapshot novo — sempre recriado no FIM
      // da lista de children via appendChild em _snapshotCloneIntoFichaSection
      // — passava a renderizar POR CIMA do overlay de selos, que só era
      // reparentado (appendChild) na PRIMEIRA inserção (guardado atrás de
      // `if (overlayGroup.parent !== overlayTarget)`, que nunca reentra
      // depois da primeira vez). Reordenar (appendChild) incondicionalmente
      // a cada chamada garante que o overlay seja SEMPRE o último filho —
      // e portanto sempre renderiza por cima do snapshot, não importa
      // quantas vezes "Atualizar Handoff" rodar depois. Idempotente: mover
      // um node que já é o último filho do mesmo pai não tem efeito
      // colateral no Figma.
      {
        // Bug real corrigido (2026-09-11, confirmado com print do usuário:
        // selos aparecendo completamente FORA da imagem de snapshot): a
        // ordem antiga escrevia x/y ANTES de setar layoutPositioning =
        // 'ABSOLUTE'. Correção: ABSOLUTE é setado IMEDIATAMENTE após o
        // appendChild, ANTES de medir/escrever o delta final.
        //
        // ORDEM CRÍTICA — preservada textualmente (2026-09-11, revisão 2):
        // _setCloneOverlayGroupAbsolutePositioning é no-op quando o pai não
        // tem Auto Layout — e agora o pai (`handoffFrame`) NUNCA tem Auto
        // Layout (`layoutMode='NONE'` por design, ver
        // _getOrCreateFichaHandoffFrame), então o overlay permanece com
        // posicionamento livre normal (x/y absoluto manual), igual a
        // quando ficava solto na Section. A sequência
        // before → appendChild → (no-op ABSOLUTE) → after → delta segue
        // correta e serve só como proteção caso o overlay algum dia
        // precise ficar dentro de um pai com Auto Layout de novo.
        const beforeBB = overlayGroup.absoluteBoundingBox;
        overlayTarget.appendChild(overlayGroup);
        _setCloneOverlayGroupAbsolutePositioning(overlayGroup);
        const afterBB = overlayGroup.absoluteBoundingBox;
        if (beforeBB && afterBB) {
          overlayGroup.x += Math.round(beforeBB.x - afterBB.x);
          overlayGroup.y += Math.round(beforeBB.y - afterBB.y);
        }
      }
      const existingBadgeTargetIds = new Set();
      const existingBadgeNumbers = new Set();
      for (const c of (overlayGroup.children || [])) {
        try {
          const targetId = c.getPluginData && c.getPluginData('hacTabOrderBadgeForTarget');
          if (targetId) existingBadgeTargetIds.add(targetId);
          const m = c.name && c.name.match(/^\[Selo de Tabulação \| (\d+)\]/);
          if (m) existingBadgeNumbers.add(Number(m[1]));
        } catch (e) { }
      }

      try { await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }); } catch (e) { }
      for (const item of (items || [])) {
        // Bug real corrigido (2026-09-16, reportado pelo usuário: aba
        // Handoff sempre mostrava Tabulação como pendente/desatualizada,
        // mesmo logo depois de "Preencher"/"Atualizar Handoff"). Causa: os
        // itens de tabOrderItems guardam targetNodeId como o id do node
        // DENTRO DO CLONE de trabalho ativo no momento em que o selo foi
        // desenhado (_createTabOrderBadge recebe o node já mapeado, e usa
        // node.id — não o id original, ver comentário completo em
        // _resolveOriginalNodeIdFromTabOrderClone, code.js). `nodeMap` aqui
        // é Map<originalId, cloneNode> (_buildOriginalToCloneMap) — buscar
        // direto por item.targetNodeId (id de clone) contra um Map chaveado
        // por id ORIGINAL só batia por coincidência, deixando a maioria dos
        // itens fora da contagem (itemCount sempre menor que
        // tabOrderItems.length) e o card da aba Handoff preso em "stale"
        // pra sempre. Mesma tradução já usada por insert-swipe-path
        // (startSwipePathFromTabOrder) — reaproveitada aqui.
        const originalNodeId = item && item.targetNodeId
          ? _resolveOriginalNodeIdFromTabOrderClone(area.id, item.targetNodeId)
          : null;
        const mappedNode = originalNodeId ? nodeMap.get(originalNodeId) : null;
        if (!mappedNode || !mappedNode.absoluteBoundingBox) continue;
        itemCount++;
        if (existingBadgeTargetIds.has(mappedNode.id) || existingBadgeNumbers.has(item.number)) continue;
        try {
          await _createTabOrderBadge(
            mappedNode, item.number, item.label || '', item.conector || 'direita',
            area.id, false, area.a11yOrigin, clone, area.sectionName
          );
        } catch (e) {
          console.error('[hac] _buildFichaTabulacaoSection: falha ao desenhar selo.', e && e.message);
        }
      }

      // Depois de TODOS os selos desenhados — reafirma ABSOLUTE em todo
      // filho do FRAME de Handoff (defensivo: cada selo pode ter mexido em
      // filhos do overlay, não do FRAME em si, mas o custo de reconferir é
      // baixo). Com Auto Layout + ABSOLUTE, o Hug do FRAME já se ajusta
      // sozinho ao bbox final — não precisa de resize manual.
      if (handoffFrame) _fitFichaHandoffFrameToChildren(handoffFrame);
    }
    // "Tela N" precisa refletir a largura real do conteúdo que acabou de
    // crescer (2026-09-11) — sem isto, "Título Card" (FILL) fica sem
    // referência real pra esticar (ver comentário em
    // _getOrCreateFichaAreaGroup/_fitTelaFrameWidthToContent).
    _fitTelaFrameWidthFromItensFrame(itensFrame);
    // Section de sessão re-ajustada (2026-09-14) — ver comentário completo
    // em _fitSessionSectionFromItensFrame.
    _fitSessionSectionFromItensFrame(itensFrame);

    return itemCount;
  }

  // Seção "Swipe" da Ficha — réplica visual real (linha + setas com
  // _buildSwipePathConnection, a mesma função já usada no canvas de
  // trabalho). Só é acionada pelo handler quando o projeto é mobile
  // (Swipe é exclusivo mobile).
  // MOVE a réplica de trabalho já existente da área (2026-09-09, mesmo
  // modelo de _buildFichaTabulacaoSection) — resolve via
  // _resolveActiveSwipePathClone (cria do zero só se genuinamente não
  // existir nenhuma ainda) e reparenta clone+overlay pra dentro da Ficha.
  // Chave de overlay UNIFICADA com o fluxo de trabalho
  // ('hacSwipePathGroupForClone', ver insert-swipe-path) — antes deste
  // ajuste, o builder da Ficha usava uma chave PRÓPRIA
  // ('hacFichaSwipeGroupForClone'), nunca encontrando a trilha já
  // desenhada no fluxo de trabalho: cada "Inserir na ficha" recriava um
  // overlay novo (e nesse ponto ainda clonava a área do zero, então nunca
  // se percebeu — bug latente exposto só agora, ao mover em vez de clonar).
  async function _buildFichaSwipeSection(fichaFrame, area, points, designerName, currentUserId) {
    // Reestruturação de árvore (2026-09-10) — ver comentário equivalente em
    // _buildFichaTabulacaoSection.
    const itensFrame = await _getOrCreateFichaItensFrame(fichaFrame, area);
    const section = await _getOrCreateFichaBlockSection(itensFrame, 'swipe', area.id, area.a11yOrigin);

    const hasPoints = Array.isArray(points) && points.length >= 2;
    if (!hasPoints) {
      // Sem pontos suficientes pra desenhar uma trilha real (0 ou 1
      // ponto) — mesmo fallback textual de antes, só que como aviso, não
      // mais como caminho normal.
      const card = figma.createFrame();
      card.name = 'Trilha de Swipe';
      card.layoutMode = 'VERTICAL';
      card.paddingLeft = 12; card.paddingRight = 12; card.paddingTop = 12; card.paddingBottom = 12;
      card.itemSpacing = 4;
      card.cornerRadius = 8;
      card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
      card.strokes = [{ type: 'SOLID', color: { r: 0.537, g: 0.537, b: 0.537 } }];
      card.strokeWeight = 1;
      // BUG REAL CORRIGIDO (2026-09-21, reportado com print: texto cortado
      // "Nenhuma trilha de swipe definida..." ao clicar em "Preencher
      // Swipe"/"Gerar Handoff" sem trilha criada) — resize(w, h) explícito
      // nos dois eixos, chamado DEPOIS de primaryAxisSizingMode='AUTO',
      // faz a API do Figma reverter silenciosamente o eixo primário
      // (altura, já que layoutMode='VERTICAL') de volta pra FIXED com o
      // valor 1 passado — mesmo bug já documentado e corrigido em
      // _buildFichaLegendColumn (ver comentário completo lá). Ordem
      // corrigida: resizeWithoutConstraints ANTES de setar os sizing
      // modes.
      card.resizeWithoutConstraints(260, 1);
      card.primaryAxisSizingMode = 'AUTO';
      card.counterAxisSizingMode = 'FIXED';

      const text = figma.createText();
      text.name = 'Texto';
      // Bug real corrigido (2026-09-11) — ordem, ver comentário em
      // _appendFichaBlockTitle.
      text.textAutoResize = 'HEIGHT';
      // Escala real (corrigido 2026-09-11, era 11.5px/Inter Regular —
      // abaixo do piso real de 12px): elevado para "label/tiny" (12px), com
      // weightOverride=400 pra manter o peso visual Regular de texto
      // corrido.
      await _applyFichaTypography(text, 'label/tiny', 400);
      text.characters = 'Nenhuma trilha de swipe definida para esta área.';
      text.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
      card.appendChild(text);
      // Largura numérica explícita, NÃO FILL (2026-09-14, mesma revisão que
      // abandonou o FILL no resto da Ficha) — `card` é FIXED (260px, acima),
      // então a largura útil do texto é 260 menos o padding horizontal do
      // próprio card (12+12).
      try {
        const cardInnerWidth = Math.max(1, Math.round(
          card.width - (card.paddingLeft || 0) - (card.paddingRight || 0)
        ));
        text.resizeWithoutConstraints(cardInnerWidth, Math.max(1, Math.round(text.height)));
      } catch (e) { }

      section.appendChild(card);
      return 0;
    }

    const resolved = area.targetNodeId
      ? await _resolveActiveSwipePathClone(area.id, area.targetNodeId, area.sectionName, designerName, currentUserId)
      : null;
    if (!resolved) {
      // Frame original não resolve mais (área apagada/movida) — mesmo
      // fallback textual, agora como erro em vez de estado normal.
      const errorText = figma.createText();
      errorText.name = 'Erro';
      // Ordem preventiva (2026-09-11) — mesmo padrão do resto da função.
      errorText.textAutoResize = 'WIDTH_AND_HEIGHT';
      // Escala real (corrigido 2026-09-11, era 11.5px/Inter Regular —
      // abaixo do piso real de 12px): elevado para "label/tiny" (12px), com
      // weightOverride=400 pra manter o peso visual Regular de texto
      // corrido.
      await _applyFichaTypography(errorText, 'label/tiny', 400);
      errorText.characters = 'Não foi possível localizar/criar a cópia de trabalho para desenhar a trilha — marque a área novamente.';
      errorText.fills = [{ type: 'SOLID', color: { r: 0.7, g: 0.2, b: 0.2 } }];
      figma.currentPage.appendChild(errorText);
      section.appendChild(errorText);
      return 0;
    }

    const { clone, nodeMap } = resolved;
    // FRAME "[HAC] Handoff - {Func}" (2026-09-11, revisão 2) — mesmo
    // princípio de _buildFichaTabulacaoSection: já deve existir (criado
    // junto com a réplica de trabalho), fallback defensivo aqui.
    const handoffFrame = _getOrCreateFichaHandoffFrame(section, 'swipe', area.id);

    // Réplica de fundo vira snapshot estático (2026-09-10) — ver comentário
    // equivalente em _buildFichaTabulacaoSection. Criado JÁ AQUI, antes do
    // early-return de "menos de 2 pontos resolvidos" logo abaixo — senão o
    // snapshot ficaria solto no bloco nesse caminho.
    const snapshotTarget = handoffFrame || section;
    const snapshot = await _snapshotCloneIntoFichaSection(clone, snapshotTarget, 'hacSwipePathGroupForClone', area.id);
    if (handoffFrame) _fitFichaHandoffFrameToChildren(handoffFrame);

    const resolvedNodes = [];
    for (const p of points) {
      const mappedNode = p && p.nodeId ? nodeMap.get(p.nodeId) : null;
      if (mappedNode && mappedNode.absoluteBoundingBox) resolvedNodes.push(mappedNode);
    }

    if (resolvedNodes.length < 2) {
      // Pontos existem no dado, mas não foram encontrados no clone atual
      // (elementos renomeados/removidos do design desde a última trilha)
      // — a réplica em si já foi inserida (fica visível), só sem a linha.
      _fitTelaFrameWidthFromItensFrame(itensFrame);
      _fitSessionSectionFromItensFrame(itensFrame);
      return 0;
    }

    // A trilha antiga (se já existir — mesma marca 'hacSwipePathAreaId' do
    // fluxo de trabalho, ver insert-swipe-path: depois de movida pra
    // dentro da Ficha ela continua sendo A MESMA trilha, não uma cópia
    // própria da Ficha) é substituída — Swipe tem no máximo 1 trilha por
    // área, diferente de Tabulação (N selos incrementais), então
    // redesenhar do zero aqui continua correto e mais simples do que
    // tentar diffar segmentos.
    const overlayGroup = _getOrCreateCloneOverlayGroup(clone, 'hacSwipePathGroupForClone', '[Trilha de Swipe]', area.id);
    const overlayTarget = handoffFrame || section;
    // Reordenação incondicional (2026-09-14) — ver comentário completo em
    // _buildFichaTabulacaoSection: sem isso, o overlay só era reparentado
    // na primeira inserção, e qualquer "Atualizar Handoff" seguinte
    // recriava o snapshot no fim da lista de children, cobrindo a trilha.
    {
      // Bug real corrigido (2026-09-11) — ver comentário completo em
      // _buildFichaTabulacaoSection: ABSOLUTE precisa ser setado
      // IMEDIATAMENTE após o appendChild, ANTES de medir/escrever o delta
      // final. ORDEM CRÍTICA preservada (2026-09-11, revisão 2) mesmo com o
      // destino passando a ser o FRAME sem Auto Layout de Handoff —
      // _setCloneOverlayGroupAbsolutePositioning é no-op aqui por design.
      const beforeBB = overlayGroup.absoluteBoundingBox;
      overlayTarget.appendChild(overlayGroup);
      _setCloneOverlayGroupAbsolutePositioning(overlayGroup);
      const afterBB = overlayGroup.absoluteBoundingBox;
      if (beforeBB && afterBB) {
        overlayGroup.x += Math.round(beforeBB.x - afterBB.x);
        overlayGroup.y += Math.round(beforeBB.y - afterBB.y);
      }
    }
    for (const c of (overlayGroup.children || []).slice()) {
      try {
        if (c.getPluginData && c.getPluginData('hacSwipePathAreaId') === area.id) c.remove();
      } catch (e) { }
    }

    const pathGroup = await _buildSwipePathConnection(resolvedNodes);
    pathGroup.setPluginData('hacSwipePathAreaId', area.id);

    // Mesmo cuidado do canvas de trabalho (2026-09-08): a trilha nasce
    // DENTRO de um grupo-overlay IRMÃO do clone (_getOrCreateCloneOverlayGroup),
    // nunca filha direta dele — um GROUP nunca tem clipsContent nem Auto
    // Layout, imune ao bug já corrigido de a linha "vazar" pra fora de um
    // frame com clip no caminho (uma trilha cruzando a tela inteira tem
    // ainda mais chance de vazar do que um selo pontual).
    try {
      _reparentIntoAreaGroup(pathGroup, overlayGroup);
    } catch (e) {
      console.error('[hac] _buildFichaSwipeSection: reparenting da trilha pro overlay falhou, mantendo solta na página.', e && e.message);
    }

    // Reafirma ABSOLUTE agora que a trilha (que pode extrapolar o snapshot)
    // já está desenhada dentro do overlay — o Hug do FRAME de Handoff se
    // ajusta sozinho, não precisa de resize manual.
    if (handoffFrame) _fitFichaHandoffFrameToChildren(handoffFrame);
    // Ver comentário equivalente em _buildFichaTabulacaoSection.
    _fitTelaFrameWidthFromItensFrame(itensFrame);
    // Section de sessão re-ajustada (2026-09-14) — ver comentário completo
    // em _fitSessionSectionFromItensFrame.
    _fitSessionSectionFromItensFrame(itensFrame);

    return points.length;
  }

  // Seção "Leitor de Tela" da Ficha — um card por spec, Auto Layout puro
  // (mesmo padrão visual do card procedural de fallback de
  // create-unified-spec, sem reusar a função em si — aqui os dados já vêm
  // resolvidos/limpos do frontend, não de um fluxo de criação ao vivo).
  // `specs` chega do frontend já com os campos prontos pra exibição (ver
  // _fichaBuildSpecPayload em handoff-ficha.js): descricao, nomeAcessivel,
  // notaCodigo, notas, observacoes, componente — cada um `null`/ausente
  // quando a categoria da spec não tem aquele campo (nunca aparece vazio).
  // MOVE a réplica de trabalho já existente da área (2026-09-09) — igual
  // Tabulação/Swipe. Diferente deles, o Leitor de Tela NUNCA teve réplica
  // visual na Ficha até agora (só os cards de texto abaixo, que
  // continuam existindo do mesmo jeito) — a réplica movida entra como
  // mais um filho da seção, ao lado da legenda e antes dos cards, com os
  // marcadores/conectores (specGroups) já desenhados no clone de trabalho
  // via _getOrCreateCloneOverlayGroup(clone, 'hacSpecGroupForClone', ...)
  // — mesma chave já usada pelo fluxo de trabalho (create-unified-spec),
  // reaproveitada sem duplicar.
  async function _buildFichaLeitorSection(fichaFrame, area, specs, designerName, currentUserId) {
    // Reestruturação de árvore (2026-09-10) — ver comentário equivalente em
    // _buildFichaTabulacaoSection.
    const itensFrame = await _getOrCreateFichaItensFrame(fichaFrame, area);
    const section = await _getOrCreateFichaBlockSection(itensFrame, 'leitor', area.id, area.a11yOrigin);

    const resolved = area.targetNodeId
      ? await _resolveActiveSpecClone(area.id, area.targetNodeId, area.sectionName, designerName, currentUserId, area.workAnchor)
      : null;
    if (resolved) {
      // FRAME "[HAC] Handoff - {Func}" (2026-09-11, revisão 2) — ver
      // _buildFichaTabulacaoSection.
      const handoffFrame = _getOrCreateFichaHandoffFrame(section, 'leitor', area.id);

      // Réplica de fundo vira snapshot estático (2026-09-10) — ver
      // comentário equivalente em _buildFichaTabulacaoSection.
      const snapshotTarget = handoffFrame || section;
      const snapshot = await _snapshotCloneIntoFichaSection(resolved.clone, snapshotTarget, 'hacSpecGroupForClone', area.id);
      const specOverlayGroup = _getOrCreateCloneOverlayGroup(resolved.clone, 'hacSpecGroupForClone', '[Specs de Leitor de Tela]', area.id);
      const overlayTarget = handoffFrame || section;
      // Reordenação incondicional (2026-09-14) — ver comentário completo em
      // _buildFichaTabulacaoSection: sem isso, o overlay só era reparentado
      // na primeira inserção, e qualquer "Atualizar Handoff" seguinte
      // recriava o snapshot no fim da lista de children, cobrindo as specs.
      {
        // O overlay (com os specGroups reais já desenhados) é movido
        // SOZINHO. Bug real corrigido (2026-09-11) — ver comentário
        // completo em _buildFichaTabulacaoSection: ABSOLUTE precisa ser
        // setado IMEDIATAMENTE após o appendChild, ANTES de medir/escrever
        // o delta final. ORDEM CRÍTICA preservada (2026-09-11, revisão 3)
        // com o destino passando a ser o FRAME com Auto Layout de Handoff.
        const beforeBB = specOverlayGroup.absoluteBoundingBox;
        overlayTarget.appendChild(specOverlayGroup);
        _setCloneOverlayGroupAbsolutePositioning(specOverlayGroup);
        const afterBB = specOverlayGroup.absoluteBoundingBox;
        if (beforeBB && afterBB) {
          specOverlayGroup.x += Math.round(beforeBB.x - afterBB.x);
          specOverlayGroup.y += Math.round(beforeBB.y - afterBB.y);
        }
      }
      // Reafirma ABSOLUTE em todos os filhos do FRAME de Handoff. As specs
      // já estão desenhadas no overlay desde o fluxo de trabalho, então o
      // Hug do FRAME já reflete o tamanho final sozinho.
      if (handoffFrame) _fitFichaHandoffFrameToChildren(handoffFrame);
    }

    // Bug real corrigido (2026-09-10, reportado com print pelo usuário):
    // este bloco desenhava cards de texto PROCEDURAIS (figma.createFrame/
    // createText, um retângulo genérico por spec com selo+categoria+campos)
    // ao lado do clone — só que as specs REAIS já vêm "de graça" dentro do
    // overlay movido junto com o clone acima
    // (_moveActiveCloneIntoFichaSection(..., 'hacSpecGroupForClone')): cada
    // spec é criada como um specGroup reaproveitando o componente DSC real
    // importado (create-unified-spec, já reparentado pro mesmo overlay
    // 'hacSpecGroupForClone' no momento da criação, bem antes de qualquer
    // inserção na Ficha — ver comentário em create-unified-spec). Resultado
    // do bug: a Ficha mostrava as specs reais (corretamente sobrepostas ao
    // clone) E, ao lado, uma segunda leva de cards fake/genéricos sem
    // nenhuma relação com os componentes reais da lib — exatamente o que o
    // usuário reportou ("não são as specs reais... cards que não são as que
    // vêm da lib"). Removido por completo — a contagem usada por
    // itemCount/detecção de "desatualizado" (ver _fichaSectionIsStale,
    // handoff-ficha.js) já reflete o número de specs reais recebidas aqui,
    // sem precisar desenhar nada a mais.
    // Ver comentário equivalente em _buildFichaTabulacaoSection.
    _fitTelaFrameWidthFromItensFrame(itensFrame);
    // Section de sessão re-ajustada (2026-09-14) — ver comentário completo
    // em _fitSessionSectionFromItensFrame. Especialmente relevante aqui: o
    // Leitor de Tela pode gerar N specGroups lado a lado (um card por
    // elemento marcado), bem mais largo que Tabulação/Swipe.
    _fitSessionSectionFromItensFrame(itensFrame);
    return (specs || []).length;
  }

  // "Handoff Review" (4º bloco consolidado da Ficha) — FUNCIONALIDADE
  // DESCONTINUADA (2026-09-10, decisão do usuário): nunca foi finalizada
  // (a versão de código chegou a divergir do que foi de fato pedido, com
  // pontos de estrutura de nodes que o usuário reportou não bater com o
  // esperado) e foi abandonada em favor de manter só os 3 blocos reais
  // (Frame Principal, Tabulação, Swipe, Leitor de Tela). _buildFichaReviewSection
  // (que desenhava este bloco), a chave 'review' de FICHA_SECTION_ORDER e o
  // ramo correspondente no handler insert-ficha-section foram removidos por
  // completo — ver também a remoção equivalente no frontend
  // (handoff-ficha.js: _fichaReviewCardHtml, _fichaReviewIsStale,
  // _fichaReviewSourceKeys, candidateKeys/order de
  // _fichaGenerateCompleteHandoff) e em accessibility.js (fichaSectionKeys).

  // Handler único — despacha pro builder da seção pedida, sempre garantindo
  // primeiro que o frame-container da Ficha existe. `msg.area` chega do
  // frontend já resolvido (mesmo objeto de a11yAreas, com handoffFrameId se
  // já existir) — o backend nunca lê hacData diretamente (só existe do lado
  // do frontend, ver core.js).
  if (msg.type === "insert-ficha-section") {
    (async () => {
      const area = msg.area;
      const sectionKey = msg.sectionKey;
      if (!area || !area.id || !['tabulacao', 'swipe', 'leitor'].includes(sectionKey)) {
        figma.ui.postMessage({ type: 'ficha-section-insert-failed', areaId: area && area.id, sectionKey, reason: 'Dados inválidos.' });
        return;
      }

      // Tabulação e Swipe (2026-09-08: Swipe voltou a clonar a área pra
      // desenhar a trilha real, ver _buildFichaSwipeSection) precisam do
      // frame original resolvível. Leitor de Tela clona por conta própria
      // via _resolveActiveSpecClone (specs já resolvidas antes de chegar
      // aqui).
      const root = area.targetNodeId ? await _getSceneNodeById(area.targetNodeId) : null;
      if ((sectionKey === 'tabulacao' || sectionKey === 'swipe') && (!root || !root.absoluteBoundingBox)) {
        figma.ui.postMessage({
          type: 'ficha-section-insert-failed', areaId: area.id, sectionKey,
          reason: 'O frame original desta área não existe mais no canvas — marque a área novamente.'
        });
        return;
      }

      let fichaFrame;
      try {
        fichaFrame = await _createOrGetFichaFrame(area, msg.designerName, msg.designerId);
      } catch (e) {
        // Mensagem específica exposta ao designer (2026-09-09) — antes só
        // "Não foi possível criar o frame da Ficha." genérico, com a causa
        // real só no console do Figma (invisível pra quem reporta o bug).
        console.error('[hac] insert-ficha-section: falha ao criar/obter o frame do Handoff de Acessibilidade.', e && (e.stack || e.message));
        figma.ui.postMessage({
          type: 'ficha-section-insert-failed', areaId: area.id, sectionKey,
          reason: `Não foi possível criar o frame do Handoff de Acessibilidade: ${(e && e.message) || 'erro desconhecido'}`
        });
        return;
      }

      let itemCount = 0;
      try {
        if (sectionKey === 'tabulacao') {
          itemCount = await _buildFichaTabulacaoSection(fichaFrame, area, msg.items || [], msg.designerName, msg.designerId);
        } else if (sectionKey === 'swipe') {
          itemCount = await _buildFichaSwipeSection(fichaFrame, area, msg.points || [], msg.designerName, msg.designerId);
        } else if (sectionKey === 'leitor') {
          itemCount = await _buildFichaLeitorSection(fichaFrame, area, msg.specs || [], msg.designerName, msg.designerId);
        }
      } catch (e) {
        console.error('[hac] insert-ficha-section: falha ao montar a seção "' + sectionKey + '".', e && e.message);
        figma.ui.postMessage({ type: 'ficha-section-insert-failed', areaId: area.id, sectionKey, reason: e && e.message ? e.message : 'Falha ao montar a seção.' });
        return;
      }

      // Limpeza da réplica de TRABALHO após inserção bem-sucedida
      // (2026-09-11, pedido do usuário): a réplica com camadas reais (o
      // clone que vive na Section de sessão, usado só pra permitir a
      // marcação) não serve mais pra nada depois que o snapshot de imagem
      // já foi tirado e os marcadores já foram movidos pro overlay dentro
      // da Ficha — mantê-la só pesa o arquivo e "bagunça" a Section.
      // CUIDADO CRÍTICO: NÃO usar _removeExistingTabOrderCopiesForArea/
      // _removeExistingSwipePathCopiesForArea aqui — essas funções também
      // apagam qualquer overlay marcado como pertencente ao clone
      // removido (proteção contra vazamento, ver comentário nelas), e o
      // overlay de selos/specs JÁ FOI MOVIDO pra dentro da Ficha alguns
      // milissegundos atrás (dentro do builder acima) — usar essas
      // funções apagaria os selos que acabamos de posicionar
      // corretamente. Localiza e remove SÓ o clone em si, isoladamente,
      // por pluginData (nunca por parentesco), preservando o overlay
      // onde quer que ele esteja agora.
      // Revisão 3 (2026-09-11): o clone agora vive dentro do FRAME "[HAC]
      // Handoff - {Func}" (Auto Layout + filhos ABSOLUTE, não mais solto na
      // Section) — capturar o `parent` ANTES de remover clone+moldura.
      // _fitFichaHandoffFrameToChildren chamada como fallback defensivo
      // (o Hug do Auto Layout já deveria encolher sozinho ao remover
      // filhos ABSOLUTE, mas o ajuste manual é barato e idempotente).
      try {
        if (sectionKey === 'tabulacao') {
          const workingClone = _findTabOrderCopyForArea(area.id);
          if (workingClone && !workingClone.removed) {
            const handoffFrame = workingClone.parent;
            _removeCloneWorkFrame(workingClone);
            workingClone.remove();
            if (handoffFrame && !handoffFrame.removed) _fitFichaHandoffFrameToChildren(handoffFrame);
          }
          _activeTabOrderCloneMaps.delete(area.id);
        } else if (sectionKey === 'swipe') {
          const workingClone = _findSwipePathCopyForArea(area.id);
          if (workingClone && !workingClone.removed) {
            const handoffFrame = workingClone.parent;
            _removeCloneWorkFrame(workingClone);
            workingClone.remove();
            if (handoffFrame && !handoffFrame.removed) _fitFichaHandoffFrameToChildren(handoffFrame);
          }
          _activeSwipePathCloneMaps.delete(area.id);
        } else if (sectionKey === 'leitor') {
          const workingClone = _findSpecCloneForArea(area.id);
          if (workingClone && !workingClone.removed) {
            const handoffFrame = workingClone.parent;
            _removeCloneWorkFrame(workingClone);
            workingClone.remove();
            if (handoffFrame && !handoffFrame.removed) _fitFichaHandoffFrameToChildren(handoffFrame);
          }
          _activeSpecCloneMaps.delete(area.id);
        }
      } catch (e) {
        // Limpeza é só liberação de peso/organização — nunca deve derrubar
        // a resposta já bem-sucedida de ficha-section-inserted abaixo.
        console.error('[hac] insert-ficha-section: falha ao limpar a réplica de trabalho de "' + sectionKey + '" (não impede o handoff).', e && e.message);
      }

      // Incremento de versão MENOR (Parte 4.1, 2026-09-10): toda inserção/
      // atualização de seção do Handoff Completo processada com sucesso
      // sobe hacSessionVersion em 0.1 (ex. "1.0" -> "1.1") e reflete no nome
      // visível da Section de sessão. Best-effort — qualquer falha aqui
      // (parse corrompido, Section não encontrada) nunca deve derrubar a
      // resposta já bem-sucedida de ficha-section-inserted acima; cai em
      // "1.0" como default só nesta rotina, sem afetar o handoff em si.
      try {
        const sessionSection = _getOrCreateA11ySessionSection(msg.designerName, msg.designerId);
        let currentVersion = sessionSection.getPluginData('hacSessionVersion') || '';
        let major = 1, minor = 0;
        const versionMatch = currentVersion.match(/^(\d+)\.(\d+)$/);
        if (versionMatch) {
          major = parseInt(versionMatch[1], 10);
          minor = parseInt(versionMatch[2], 10);
        }
        minor += 1;
        const nextVersion = `${major}.${minor}`;
        sessionSection.setPluginData('hacSessionVersion', nextVersion);
        // Substitui só o segmento de versão do nome (" | vN.N" no final),
        // preservando timestamp/designer intactos — nomes de Sections
        // antigas (sem esse formato) simplesmente não batem com a regex e
        // ficam como estão, sem versão anexada (migração aditiva).
        if (/\|\s*v\d+\.\d+$/.test(sessionSection.name)) {
          sessionSection.name = sessionSection.name.replace(/\|\s*v\d+\.\d+$/, `| v${nextVersion}`);
        }
      } catch (e) {
        console.error('[hac] insert-ficha-section: falha ao incrementar a versão da Section de sessão (não impede o handoff).', e && e.message);
      }

      // Readequa o tamanho da Section de sessão ao conteúdo real — a
      // Ficha cresceu dentro dela (Auto Layout em cascata cuida do resto,
      // não há mais buckets/zonas a reposicionar manualmente desde a
      // adoção do modelo de estado único por bloco, 2026-09-11).
      try {
        _fitSectionToChildren(_getOrCreateA11ySessionSection(msg.designerName, msg.designerId));
      } catch (e) {
        console.error('[hac] insert-ficha-section: falha ao readequar o tamanho da Section (não impede o handoff).', e && e.message);
      }

      // Limpa a sinalização de "em edição" (hacFichaSectionStale) desta
      // seção, se havia sido marcada por um "Editar" anterior — o bloco
      // final acabou de ser reinserido/atualizado com sucesso.
      try {
        const itensFrameForStale = _findFichaItensFrameDeep(fichaFrame);
        const staleSection = itensFrameForStale ? _findFichaSectionInFrame(itensFrameForStale, sectionKey) : null;
        if (staleSection && staleSection.getPluginData('hacFichaSectionStale') === 'true') {
          staleSection.setPluginData('hacFichaSectionStale', '');
          staleSection.opacity = 1;
        }
      } catch (e) {
        console.error('[hac] insert-ficha-section: falha ao limpar sinalização de edição (não impede o handoff).', e && e.message);
      }

      figma.currentPage.selection = [fichaFrame];
      figma.viewport.scrollAndZoomIntoView([fichaFrame]);

      figma.ui.postMessage({
        type: 'ficha-section-inserted',
        areaId: area.id,
        sectionKey,
        itemCount,
        frameId: fichaFrame.id,
      });
    })();
    return;
  }

  // Prepara a réplica de trabalho de uma seção JÁ finalizada (virada
  // imagem dentro do "[HAC] Documento Final") pra edição (2026-09-11,
  // consolidação Section/Ficha — botão "Editar" do card de status).
  // Reaproveita literalmente a mesma resolução de clone que
  // insert-ficha-section já usa (_resolveActiveTabOrderClone/
  // _resolveActiveSwipePathClone/_resolveActiveSpecClone) — nenhuma
  // lógica nova de clonagem, só chamada a partir de um novo ponto de
  // entrada explícito. Marca o bloco final correspondente como
  // desatualizado (opacity reduzida) até o designer confirmar de novo via
  // "Atualizar Handoff" (que limpa a marca, ver final de
  // insert-ficha-section acima).
  if (msg.type === "prepare-ficha-section-edit") {
    (async () => {
      const area = msg.area;
      const sectionKey = msg.sectionKey;
      if (!area || !area.id || !['tabulacao', 'swipe', 'leitor'].includes(sectionKey)) {
        figma.ui.postMessage({ type: 'ficha-section-edit-failed', areaId: area && area.id, sectionKey, reason: 'Dados inválidos.' });
        return;
      }

      const root = area.targetNodeId ? await _getSceneNodeById(area.targetNodeId) : null;
      if (!root || !root.absoluteBoundingBox) {
        figma.ui.postMessage({
          type: 'ficha-section-edit-failed', areaId: area.id, sectionKey,
          reason: 'O frame original desta área não existe mais no canvas — marque a área novamente.'
        });
        return;
      }

      let clone = null;
      try {
        if (sectionKey === 'tabulacao') {
          const resolved = await _resolveActiveTabOrderClone(area.id, area.targetNodeId, area.sectionName, msg.designerName, msg.designerId);
          clone = resolved && resolved.clone;
        } else if (sectionKey === 'swipe') {
          const resolved = await _resolveActiveSwipePathClone(area.id, area.targetNodeId, area.sectionName, msg.designerName, msg.designerId);
          clone = resolved && resolved.clone;
        } else if (sectionKey === 'leitor') {
          const resolved = await _resolveActiveSpecClone(area.id, area.targetNodeId, area.sectionName, msg.designerName, msg.designerId, area.workAnchor);
          clone = resolved && resolved.clone;
        }
      } catch (e) {
        console.error('[hac] prepare-ficha-section-edit: falha ao resolver o clone de "' + sectionKey + '".', e && e.message);
      }
      if (!clone || clone.removed) {
        figma.ui.postMessage({ type: 'ficha-section-edit-failed', areaId: area.id, sectionKey, reason: 'Não foi possível preparar a réplica de trabalho.' });
        return;
      }

      // Marca o bloco final correspondente como desatualizado — só a
      // seção específica dentro de "[HAC] Itens", não a área inteira. O
      // clone recriado acima fica dentro de "[HAC] Handoff - {Func}"
      // (2026-09-11, revisão 2 — antes ficava solto na Section de sessão),
      // onde o designer consegue clicar nos elementos normalmente.
      try {
        const savedFrameId = area.handoffFicha && area.handoffFicha.frameId;
        const fichaFrame = await _findFichaFrameForArea(area.id, savedFrameId);
        const itensFrame = _findFichaItensFrameDeep(fichaFrame);
        const targetSection = itensFrame ? _findFichaSectionInFrame(itensFrame, sectionKey) : null;
        if (targetSection) {
          targetSection.setPluginData('hacFichaSectionStale', 'true');
          targetSection.opacity = 0.5;
        }
      } catch (e) {
        console.error('[hac] prepare-ficha-section-edit: falha ao sinalizar o bloco final como desatualizado.', e && e.message);
      }

      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);

      figma.ui.postMessage({ type: 'ficha-section-edit-ready', areaId: area.id, sectionKey, cloneId: clone.id });
    })();
    return;
  }

  // Exclusão em cascata — mesmo padrão de delete-tab-order-copy-for-area,
  // localizando só por pluginData.
  // Bug real evitado (2026-09-11): com a inversão da hierarquia, o frame
  // raiz "[HAC] Documentação" passou a ser ÚNICO por Section, compartilhado
  // por todas as telas. Buscar por `hacFichaForArea` (marca antiga, do
  // tempo em que havia um raiz por área) apagaria o Documentação inteiro —
  // e com ele o trabalho de TODAS as telas. Agora remove só o frame
  // "Tela N" daquela área (`hacFichaTelaForArea`).
  if (msg.type === "delete-ficha-for-area") {
    _forEachFichaFrameNodeDeep(node => {
      try {
        if (node.getPluginData && node.getPluginData('hacFichaTelaForArea') === msg.areaId) {
          node.remove();
        }
      } catch (e) { }
    });
    return;
  }

  // Ocultar/mostrar em cascata — mesmo padrão de
  // toggle-tab-order-copy-visibility. Fire-and-forget. Mesmo cuidado de
  // escopo do handler acima: opera no frame da Tela, nunca no Documentação.
  if (msg.type === "toggle-ficha-visibility") {
    _forEachFichaFrameNodeDeep(node => {
      try {
        if (node.getPluginData && node.getPluginData('hacFichaTelaForArea') === msg.areaId) {
          node.visible = !!msg.visible;
        }
      } catch (e) { }
    });
    return;
  }

  // Foco/destaque no frame da Ficha no canvas — mesmo padrão simplificado
  // (sem contorno de highlight, o frame inteiro já é grande o bastante pra
  // servir de próprio destaque) usado por "Ver ficha no canvas".
  if (msg.type === "highlight-ficha-node") {
    (async () => {
      const node = msg.frameId ? await _getSceneNodeById(msg.frameId) : null;
      if (!node) {
        figma.ui.postMessage({ type: 'ficha-node-not-found', areaId: msg.areaId });
        return;
      }
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    })();
    return;
  }
};
