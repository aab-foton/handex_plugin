// ============================================================
// code.js — hac (backend, sandbox principal do Figma)
//
// ADAPTAÇÃO/REDUÇÃO do Handex Beta (src/plugin/code.js) para o plugin
// hac, enxuto e independente — 2026-08-24. Porta só a vertical de
// Acessibilidade (a11y): matching DSC → categoria de a11y, import dos
// componentes reais da lib "Design Acessível", marcadores visuais
// (Agrupamento/Conector), "Marcar Área", "Ordem de Tabulação" completa e uma
// função de scan própria e enxuta (sem o aparato de auditoria de
// conformidade geral do Handex — audit()/AUDIT_SCORE/frameJsonTemplate/
// suggestClosestMatch não existem aqui). Não porta frames/briefing/fluxos/
// medidas/export de Ficha de Handoff — ver CLAUDE.md do Handex para as
// decisões de produto herdadas (dots de conformidade removidos, vetores e
// frames-com-filhos-DS filtrados do scan, etc.).
// ============================================================

import A11Y_CONTENT from './refs/design-acessivel-content.json';
import A11Y_COMPONENT_PROPERTIES_RAW from './refs/design-acessivel-component-properties.json';
import A11Y_MOBILE_WRAPPER_RAW from './refs/design-acessivel-mobile-wrapper.generated.json';
import DSC_A11Y_MAPPING from './refs/dsc-component-a11y-mapping.json';
import DSC_A11Y_MAPPING_MOBILE from './refs/dsc-component-a11y-mapping-mobile.json';
import DSC_A11Y_MAPPING_SUPERDSCWEB from './refs/dsc-component-a11y-mapping-superdscweb.json';
import DSC_A11Y_MAPPING_ANDROID from './refs/dsc-component-a11y-mapping-android.json';
import REF_SKELETON from './refs/_skeleton.json';

figma.showUI(__html__, { width: 480, height: 750 });

let activeHighlightNode = null;

// Rede de segurança contra highlights órfãos (bug real corrigido
// 2026-09-09): highlight-node cria um retângulo solto `[HighlightStroke]`
// direto em figma.currentPage (nunca dentro de nenhum clone/Section), e o
// único ponto que o remove é clear-highlight, que só sabe apagar o node
// referenciado pela variável em memória `activeHighlightNode` — se o
// plugin foi fechado/reaberto entre a criação do highlight e a exclusão da
// Ordem/Trilha, essa referência já se perdeu, e clear-highlight não acha
// nada pra remover mesmo sendo chamado. Sintoma real reportado: apagar uma
// Ordem de Tabulação deixava um `[HighlightStroke]` solto na Layers,
// sobrevivendo à exclusão da cópia inteira porque nunca viveu dentro dela.
// Chamado nos handlers de exclusão de Tabulação/Swipe como reforço —
// nunca depende de `activeHighlightNode` ainda ser válido, varre por NOME
// entre os filhos soltos de primeiro nível da página (mesmo escopo raso já
// usado por outras varreduras defensivas do hac).
function _clearOrphanedHighlightStrokes() {
  if (activeHighlightNode && !activeHighlightNode.removed) {
    try { activeHighlightNode.remove(); } catch (e) { }
  }
  activeHighlightNode = null;
  try {
    for (const sibling of figma.currentPage.children) {
      if (sibling.name === '[HighlightStroke]') {
        try { sibling.remove(); } catch (e) { }
      }
    }
  } catch (e) { }
}

// Gap entre a faixa ocupada (áreas/specs/cópias já existentes) e a nova
// réplica de trabalho de Ordem de Tabulação/Swipe/Leitor de Tela — mesmo
// valor de _SPEC_GAP por consistência visual com o restante do canvas
// injetado pelo hac. Nome mantido (_TAB_ORDER_ROW_GAP) por compatibilidade
// com o restante do código, mas desde 2026-09-09 é usado como gap
// HORIZONTAL: réplicas novas nascem AO LADO do frame original, não mais
// abaixo dele (ver _findFreeTabOrderCopyPosition). _TAB_ORDER_COL_GAP
// (~64) reaproveita o mesmo raciocínio de _SPEC_COL_GAP, mas não tem
// consumidor ativo hoje. Declaradas aqui no escopo de módulo (não dentro
// de figma.ui.onmessage) porque são `const` — declará-las no meio do corpo
// do handler as deixa presas à temporal dead zone até a linha da
// declaração realmente executar, e qualquer branch anterior do handler
// (como generate-tab-order-from-layers) que as use antes disso lança
// ReferenceError (bug real reproduzido em arquivo de produção, 2026-09-03).
const _TAB_ORDER_ROW_GAP = 32;
const _TAB_ORDER_COL_GAP = 64;

// Cópia "rascunho" do frame da Área Marcada, criada já ao clicar "Iniciar
// Ordem de Tabulação" (start-tab-order-copy) ou "Gerar Automaticamente"
// (generate-tab-order-from-layers), antes de qualquer selo ser desenhado.
// Mantida em memória do módulo (não só via pluginData no canvas) porque
// tanto o highlight temporário de cada clique quanto cada novo selo
// desenhado (draw-tab-order-badge) precisam resolver o nó ORIGINAL pro nó
// EQUIVALENTE dentro da cópia sem reconstruir o mapa a cada chamada. Mapa
// nodeId-original → node real do Figma, nunca serializado como tal para o
// frontend (que só recebe ids planos).
//
// Bug real corrigido (2026-09-08): antes era 1 ÚNICO par de variáveis
// globais (_activeTabOrderCloneMap + _activeTabOrderCloneAreaId), então só
// UMA área por vez podia ter uma cópia "lembrada" em memória. Trocar de
// área (abrir o card de outra Área Marcada) sobrescrevia essas variáveis
// com o clone da nova área — ao voltar pra área original e continuar a
// Tabulação (ex.: "Adicionar itens"), o backend não reconhecia mais o
// clone certo: recriava tudo do zero (apagando os selos já desenhados,
// removidos por _removeExistingTabOrderCopiesForArea dentro de
// _createTabOrderCloneForArea) e a resolução de nós clicados
// (highlight-tab-order-copy-node) parava de achar o node no Map errado,
// caindo no fallback que resolve contra o elemento ORIGINAL em vez do
// clone — sintoma real reportado: "puxa o componente errado e parece
// aplicar tudo de novo". Migrado pra Map<areaId, nodeMap> — cada área
// mantém seu próprio clone ativo em memória, sem colisão nenhuma entre
// áreas diferentes trabalhadas na mesma sessão, mesmo alternando entre
// elas livremente.
const _activeTabOrderCloneMaps = new Map();

// Mesmo raciocínio, espelhado pra Trilha de Swipe (2026-09-04-ac): a
// linha direcional com setas precisa ser desenhada sobre uma CÓPIA da
// Área, nunca sobre o frame original do design — mesmo requisito que
// Ordem de Tabulação já cumpre. Nunca compartilha o Map com Tabulação:
// cada feature tem sua própria cópia ativa por área, podem coexistir se
// o designer abrir as 2 tabs em sequência sem confirmar nenhuma. Mesma
// migração pra Map<areaId, nodeMap> (2026-09-08) e mesmo motivo de
// _activeTabOrderCloneMaps acima.
const _activeSwipePathCloneMaps = new Map();

// Mesmo raciocínio e mesma migração pra Map<areaId, nodeMap> (2026-09-08),
// espelhado pra Especificações (Leitor de Tela): create-unified-spec
// passou a desenhar sobre uma CÓPIA da área (antes desenhava direto sobre
// o frame ORIGINAL) — mesma garantia de nunca tocar o design original que
// Tabulação/Swipe já davam. Nunca compartilha Map com as outras duas
// features (cada uma tem seu próprio clone ativo por área).
const _activeSpecCloneMaps = new Map();

// Bug real corrigido (2026-09-08): "Gerar automaticamente" do Swipe
// (startSwipePathFromTabOrder, accessibility.js) reaproveita a sequência já
// mapeada na Ordem de Tabulação — mas os itens de Tabulação guardam
// targetNodeId como o id do node DENTRO DA CÓPIA CLONADA de Tabulação
// (_createTabOrderBadge recebe o node já mapeado pelo nodeMap de
// Tabulação, e usa node.id — não o id original), enquanto insert-swipe-path
// sempre esperou o id ORIGINAL da área (pra traduzir pro clone PRÓPRIO do
// Swipe, um clone diferente do de Tabulação). Os dois clones nunca
// compartilham id de node — o resultado, sem esta tradução, é sempre
// "elemento não existe mais na cópia da área", mesmo a trilha nunca tendo
// sido desenhada. Resolve traduzindo de volta: se o id recebido bate com
// algum valor do Map ATIVO de Tabulação desta área, devolve a chave
// correspondente (o id original) em vez do id recebido; senão, assume que
// já é original (fluxo manual/marquee, nunca passou pelo clone de
// Tabulação) e devolve sem alterar.
function _resolveOriginalNodeIdFromTabOrderClone(areaId, nodeId) {
  const tabOrderMap = areaId ? _activeTabOrderCloneMaps.get(areaId) : null;
  if (!tabOrderMap) return nodeId;
  for (const [originalId, clonedNode] of tabOrderMap.entries()) {
    if (clonedNode && clonedNode.id === nodeId) return originalId;
  }
  return nodeId;
}

// Remove (se existir) a cópia rascunho de Ordem de Tabulação da área
// informada e zera o estado em memória correspondente — mesma lógica usada
// pelo handler de mensagem "delete-tab-order-draft-copy" (cancelamento
// manual do fluxo) e pelo handler figma.on('close', ...) logo abaixo
// (designer fecha o plugin/Figma com a cópia rascunho ainda ativa, sem
// nunca ter clicado em "Aplicar" ou "Cancelar" — sem isso, a cópia ficava
// salva permanentemente no .fig). 100% síncrona (getPluginData/remove não
// retornam Promise) de propósito: figma.on('close', ...) não espera
// Promises pendentes, então nada aqui pode depender de await.
function _deleteTabOrderDraftCopy(areaId) {
  _removeExistingTabOrderCopiesForArea(areaId);
  _activeTabOrderCloneMaps.delete(areaId);
}

figma.on('close', () => {
  if (activeHighlightNode) {
    try { activeHighlightNode.remove(); } catch (e) { }
    activeHighlightNode = null;
  }
  // Gap pré-existente: se o designer fechar o plugin/Figma com uma cópia
  // rascunho de Ordem de Tabulação ainda ativa (nunca aplicou nem
  // cancelou), ela ficava órfã e permanente no .fig, sem handler de
  // limpeza algum. Reaproveita a mesma remoção de sempre — agora para
  // TODAS as áreas com clone ativo em memória (Map, 2026-09-08), não só
  // a última tocada.
  for (const areaId of Array.from(_activeTabOrderCloneMaps.keys())) {
    _deleteTabOrderDraftCopy(areaId);
  }
  // Mesmo raciocínio pra Trilha de Swipe (2026-09-04-ac).
  for (const areaId of Array.from(_activeSwipePathCloneMaps.keys())) {
    _removeExistingSwipePathCopiesForArea(areaId);
    _activeSwipePathCloneMaps.delete(areaId);
  }
});

figma.on('currentpagechange', () => {
  if (activeHighlightNode) {
    try { activeHighlightNode.remove(); } catch (e) { }
    activeHighlightNode = null;
  }
});

// "Ordem de Tabulação": modo de clique — liga/desliga via
// start-tab-order-mode/stop-tab-order-mode (vindos do frontend). Modelo de
// LEITURA LITERAL (2026-09-04-af, substituindo a acumulação em memória
// anterior — ver motivo completo no listener de selectionchange abaixo):
// o backend NÃO guarda nenhum estado de seleção entre eventos. Enquanto
// ativo, cada selectionchange só atualiza a contagem ao vivo (pro número
// da barra mini) e o highlight do último clique — nada mais. Ao "Concluir
// seleção" (get-tab-order-accumulated-selection), o backend lê
// figma.currentPage.selection NAQUELE INSTANTE, literalmente — é essa
// leitura que vira a lista final, nunca um histórico acumulado.
let _tabOrderModeActive = false;

// "Trilha de Swipe": modo de clique análogo ao de Ordem de Tabulação —
// liga/desliga via start-swipe-path-mode/stop-swipe-path-mode. Mesmo
// modelo de leitura literal (2026-09-04-af) — sem estado próprio entre
// eventos, só lê a seleção atual no momento de "Concluir seleção"
// (get-swipe-path-accumulated-selection).
let _swipePathModeActive = false;

// O designer clica fisicamente na CÓPIA rascunho (é o que está focado na
// tela desde start-tab-order-copy — a instrução de UI já diz "clique nos
// elementos dela"), então figma.currentPage.selection sempre traz um node
// que vive DENTRO do clone, nunca o original. Todo o resto do fluxo (o
// nodeMap guardado pra draw-tab-order-badge, que é Map<originalId,
// cloneNode>) espera receber o id do ORIGINAL — sem esta tradução aqui,
// nodeMap.get(idDoClone) nunca acha nada e TODOS os itens da lista viravam
// "não encontrado" ao desenhar (bug real confirmado em arquivo de produção,
// 23 de 23 itens, 2026-09-02). Busca linear no Map ativo (chave=original,
// valor=node do clone) porque é o único sentido em que ele existe hoje —
// aceitável para o volume real de nodes de uma Área Marcada.
// Bug real corrigido (2026-09-08): recebe só cloneNodeId, sem areaId — com
// o Map por área (_activeTabOrderCloneMaps), a área de origem do clique
// não é conhecida aqui, então varre TODOS os nodeMaps ativos (uma área por
// vez sendo capturada na prática, mas nada impede o designer de alternar
// entre áreas com captura em andamento).
function _resolveTabOrderCloneSelectionToOriginalId(cloneNodeId) {
  for (const nodeMap of _activeTabOrderCloneMaps.values()) {
    for (const [originalId, clonedNode] of nodeMap) {
      if (clonedNode.id === cloneNodeId) return originalId;
    }
  }
  return cloneNodeId;
}

// Espelha _resolveTabOrderCloneSelectionToOriginalId pra Trilha de Swipe
// (2026-09-04-ac) — agora que Swipe também clica sobre uma CÓPIA, precisa
// da mesma tradução clone→original antes de acumular/desenhar. Mesma
// migração pra varrer todos os Maps ativos (2026-09-08).
function _resolveSwipePathCloneSelectionToOriginalId(cloneNodeId) {
  for (const nodeMap of _activeSwipePathCloneMaps.values()) {
    for (const [originalId, clonedNode] of nodeMap) {
      if (clonedNode.id === cloneNodeId) return originalId;
    }
  }
  return cloneNodeId;
}

// Reordena candidatos já coletados (DFS de generate-tab-order-from-layers,
// OU seleção múltipla no modo de captura de Trilha de Swipe) seguindo um
// padrão de leitura visual em zigue-zague ("boustrophedon"): linha 1
// esquerda→direita, linha 2 direita→esquerda, linha 3 esquerda→direita, e
// assim por diante. Esse é o critério confirmado pela vertical de
// acessibilidade do produto como referência real de reading order para
// Ordem de Tabulação em telas com múltiplas colunas (ex: extrato bancário,
// grids de cards) — NÃO é convenção nativa de leitor de tela (que lê
// top-to-bottom/DOM order) nem ordem de camadas do Figma; é um critério de
// produto documentado pela vertical de a11y. Não "simplificar" de volta
// para top-to-bottom ou ordem de DFS.
//
// Agrupamento em linhas: dois nós pertencem à mesma linha visual quando
// suas faixas verticais (absoluteBoundingBox.y → y+height) SE SOBREPÕEM —
// não é uma tolerância fixa em pixels, porque elementos de alturas
// diferentes na mesma linha (ex: label pequeno ao lado de um input maior)
// não teriam o mesmo y exato. Comparação contra QUALQUER nó já acumulado
// na linha atual (não só o último) para tolerar leve desalinhamento
// vertical entre elementos da mesma linha.
//
// Movida para escopo de nível superior (2026-09-04) — antes vivia só
// dentro do closure de figma.ui.onmessage (usada por generate-tab-order-
// from-layers); a Trilha de Swipe precisa dela também a partir do listener
// de seleção do canvas abaixo, que roda fora daquele closure. Corpo
// inalterado, reaproveitada tal como estava.
function _orderNodesInZigzagReadingOrder(nodes) {
  const sortedByY = nodes.slice().sort((a, b) => a.absoluteBoundingBox.y - b.absoluteBoundingBox.y);

  const rows = [];
  let currentRow = [];
  function _overlapsRow(node, row) {
    const nodeTop = node.absoluteBoundingBox.y;
    const nodeBottom = nodeTop + node.absoluteBoundingBox.height;
    return row.some(other => {
      const otherTop = other.absoluteBoundingBox.y;
      const otherBottom = otherTop + other.absoluteBoundingBox.height;
      return nodeTop < otherBottom && otherTop < nodeBottom;
    });
  }
  for (const node of sortedByY) {
    if (currentRow.length === 0 || _overlapsRow(node, currentRow)) {
      currentRow.push(node);
    } else {
      rows.push(currentRow);
      currentRow = [node];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  rows.sort((rowA, rowB) => {
    const minYA = Math.min(...rowA.map(n => n.absoluteBoundingBox.y));
    const minYB = Math.min(...rowB.map(n => n.absoluteBoundingBox.y));
    return minYA - minYB;
  });

  const ordered = [];
  rows.forEach((row, rowIndex) => {
    const sortedRow = row.slice().sort((a, b) => a.absoluteBoundingBox.x - b.absoluteBoundingBox.x);
    if (rowIndex % 2 === 1) sortedRow.reverse();
    ordered.push(...sortedRow);
  });
  return ordered;
}

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
figma.on('selectionchange', () => {
  if (_tabOrderModeActive) {
    clearTimeout(_tabOrderCountDebounceTimer);
    _tabOrderCountDebounceTimer = setTimeout(() => {
      figma.ui.postMessage({ type: 'tab-order-accumulated-count-changed', count: figma.currentPage.selection.length });
    }, 500);
    return;
  }

  if (_swipePathModeActive) {
    clearTimeout(_swipePathCountDebounceTimer);
    _swipePathCountDebounceTimer = setTimeout(() => {
      figma.ui.postMessage({ type: 'swipe-path-accumulated-count-changed', count: figma.currentPage.selection.length });
    }, 500);
  }
});

function _nodeOnCurrentPage(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n != null && n.id === figma.currentPage.id;
}

// "A1.10" deve ordenar depois de "A1.2" — comparação puramente alfabética
// trataria "10" < "2" como string. Parseia em [letra, ...números] e compara
// parte a parte numericamente para obter a ordem hierárquica real (A < A1 < A1.1 < A1.2 < A2 < B).
function _parseSpecTag(tag) {
  const m = tag.match(/^([A-Z])(.*)$/);
  if (!m) return [tag];
  const letter = m[1];
  const nums = m[2].split('.').filter(Boolean).map(Number);
  return [letter, ...nums];
}

function _compareSpecTags(tagA, tagB) {
  const a = _parseSpecTag(tagA);
  const b = _parseSpecTag(tagB);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av === bv) continue;
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av) < String(bv) ? -1 : 1;
  }
  return 0;
}

// ============================================================
// Matching DSC → categoria de a11y
// ============================================================

// key (componentKey resolvido via getMainComponentAsync/mainComp.key) →
// { containingFrame, origin, sourceLib } — origin é 'web' (libs "Web
// Angular & React" e "Super DSC | Web", ambas desktop) ou 'mobile' (libs
// "DSC | Super App" e "DSC | Android", ambas mobile — a segunda recadastrada
// em 2026-09-02, ver nota abaixo). origin decide só qual FAMÍLIA de marcador
// visual (A11Y_*_KEYS vs A11Y_*_KEYS_MOBILE) é instanciada — não confundir
// com sourceLib. Construído uma única vez a partir de REF_SKELETON.libraries
// (componentsDetailed de CADA lib do manifest — ver build-skeleton.cjs,
// estendido em 2026-08-25 para também gerar componentsDetailed de
// 'super-app', em 2026-08-26 para 'super-dsc-web', e em 2026-09-02 para
// 'dsc-android'), não de DSC_A11Y_MAPPING*.sampleKeys (que são só amostras
// de 3 chaves por família, insuficientes para resolver qualquer instância
// real). Component keys NUNCA colidem entre libs diferentes (são globais no
// Figma) — não há risco de uma key de 'web' sobrescrever uma de 'mobile' ou
// vice-versa, mesmo que os NOMES de containingFrame se repitam entre libs
// (ex: "[dsc] Button" existe em mais de uma, cada uma com suas próprias
// component keys).
//
// sourceLib é um campo PARALELO e não-destrutivo a origin — carrega a
// IDENTIDADE EXATA da lib de origem (não só a plataforma), para uso futuro
// de UI (badge "Super DSC | Web" vs. "DSC Legado" vs. "DSC | Super App" vs.
// "DSC | Android"). 'web-angular-react' e 'super-dsc-web' são as DUAS libs
// desktop que coexistem hoje (migração de design system em andamento — ver
// refs/_manifest.json) e por isso compartilham origin: 'web', mas têm
// sourceLib.id diferente — mesmo raciocínio vale para 'super-app' e
// 'dsc-android', ambas origin: 'mobile' com sourceLib.id diferente (React
// Native vs. Material Design nativo). Nunca usar sourceLib para decidir
// dicionário de marcador — essa decisão é exclusivamente de origin (ver
// _createA11yAgrupamento/_createA11yConectorLinha).
//
// 'dsc-android' (Material Design nativo, fileKey W8GUeHypdco1I3dneN6P3H) foi
// cadastrada e removida no mesmo dia em 2026-08-26 (decisão de produto,
// ver memória de projeto), e recadastrada em 2026-09-02 após bug real
// confirmado: "[dsc] Icon Button" desta lib, sem reconhecimento nenhum,
// caía na Detecção Automática como "Elemento Decorativo" — agora resolve
// corretamente para a categoria 'button' com confiança alta (ver
// dsc-component-a11y-mapping-android.json).
let _dscComponentKeyToFrameMap = null;
function _getDscComponentKeyToFrameMap() {
  if (_dscComponentKeyToFrameMap) return _dscComponentKeyToFrameMap;
  _dscComponentKeyToFrameMap = new Map();
  const libs = (REF_SKELETON && Array.isArray(REF_SKELETON.libraries)) ? REF_SKELETON.libraries : [];
  const ORIGIN_BY_SLUG = { 'web-angular-react': 'web', 'super-app': 'mobile', 'super-dsc-web': 'web', 'dsc-android': 'mobile' };
  const SOURCE_LIB_BY_SLUG = {
    'web-angular-react': { id: 'web-angular-react', label: 'DSC Legado' },
    'super-dsc-web': { id: 'super-dsc-web', label: 'Super DSC | Web' },
    'super-app': { id: 'super-app', label: 'DSC | Super App' },
    'dsc-android': { id: 'dsc-android', label: 'DSC | Android' }
  };
  libs.forEach(lib => {
    const origin = lib && ORIGIN_BY_SLUG[lib.slug];
    if (!origin || !Array.isArray(lib.componentsDetailed)) return;
    const sourceLib = SOURCE_LIB_BY_SLUG[lib.slug] || null;
    lib.componentsDetailed.forEach(c => {
      if (c && c.key && c.containingFrame) {
        _dscComponentKeyToFrameMap.set(c.key, { containingFrame: c.containingFrame, origin, sourceLib });
      }
    });
  });
  return _dscComponentKeyToFrameMap;
}

// containingFrame → { shortName, confidence } (só alta/baixa confiança;
// famílias sem match não entram no mapa e resultam em dscComponentMatch: null).
// Combina DSC_A11Y_MAPPING (desktop, "Web Angular & React"),
// DSC_A11Y_MAPPING_MOBILE ("DSC | Super App"), DSC_A11Y_MAPPING_SUPERDSCWEB
// ("Super DSC | Web", curadoria adicionada em 2026-09-01 junto com a correção
// de matching do build-dsc-a11y-mapping.cjs — filtro de prefixo + palavra
// completa + tabela por lib, ver comentário de cabeçalho do script) e
// DSC_A11Y_MAPPING_ANDROID ("DSC | Android", curadoria adicionada em
// 2026-09-02 — recadastro da lib após bug real confirmado com "[dsc] Icon
// Button" classificado como "Elemento Decorativo"; ver _manifest.json e
// dsc-component-a11y-mapping-android.json).
// Dividido em DOIS mapas por plataforma (web / mobile) — corrigido em
// 2026-09-02: antes havia um único Map global fundindo as 4 libs, o que
// permitia colisão silenciosa entre plataformas (ex: nome de frame só
// catalogado na lib mobile aceito por engano para resolver uma instância
// web, ou vice-versa). Os NOMES de containingFrame podem se repetir entre as
// libs de uma MESMA plataforma (ex: "[dsc] Button" mapeado pra 'button' em
// ambas as libs web), o que é esperado e não é conflito: a resolução de
// CATEGORIA por nome é a mesma para as libs da mesma origem — mas NUNCA deve
// atravessar a fronteira web/mobile. A ORIGEM (de qual componentKey→
// containingFrame o match veio, resolvida em _getDscComponentKeyToFrameMap)
// decide qual dos dois mapas consultar.
let _dscFrameToA11yMapWeb = null;
let _dscFrameToA11yMapMobile = null;
function _buildDscFrameToA11yMap(buckets) {
  const map = new Map();
  buckets.forEach(bucket => {
    if (!Array.isArray(bucket)) return;
    bucket.forEach(entry => {
      if (entry && entry.containingFrame && entry.match && !map.has(entry.containingFrame)) {
        map.set(entry.containingFrame, {
          shortName: entry.match.shortName,
          confidence: entry.match.confidence
        });
      }
    });
  });
  return map;
}
function _getDscFrameToA11yMap(origin) {
  if (origin === 'mobile') {
    if (!_dscFrameToA11yMapMobile) {
      _dscFrameToA11yMapMobile = _buildDscFrameToA11yMap([
        DSC_A11Y_MAPPING_MOBILE.altaConfianca, DSC_A11Y_MAPPING_MOBILE.baixaConfianca,
        DSC_A11Y_MAPPING_ANDROID.altaConfianca, DSC_A11Y_MAPPING_ANDROID.baixaConfianca
      ]);
    }
    return _dscFrameToA11yMapMobile;
  }
  if (!_dscFrameToA11yMapWeb) {
    _dscFrameToA11yMapWeb = _buildDscFrameToA11yMap([
      DSC_A11Y_MAPPING.altaConfianca, DSC_A11Y_MAPPING.baixaConfianca,
      DSC_A11Y_MAPPING_SUPERDSCWEB.altaConfianca, DSC_A11Y_MAPPING_SUPERDSCWEB.baixaConfianca
    ]);
  }
  return _dscFrameToA11yMapWeb;
}

// Retorna { containingFrame, a11yCategory, confidence, origin, sourceLib }
// (match normal), { containingFrame, a11yCategory: null, confidence: null,
// isUnmapped: true, origin, sourceLib } (componente DSC real, mas SEM
// categoria de a11y catalogada — vira sugestão "Outro" no lote de Detecção
// Automática; ex: "[dsc] Card"/"[dsc] Tooltip"/"[dsc] Spinner" em qualquer
// das 4 libs — componentes DSC reais que genuinamente não correspondem a
// nenhum dos 16 shortNames de a11y, curadoria confirmada em 2026-09-01
// (web-angular-react/super-app/super-dsc-web) e 2026-09-02 (dsc-android), ver
// build-dsc-a11y-mapping.cjs) ou null (componentKey não corresponde a nenhum
// componente DSC catalogado em nenhuma lib — não é caso de a11y). origin é 'web' ou
// 'mobile', conforme a PLATAFORMA da lib de onde a componentKey resolvida
// veio (decide só a família de marcador visual — ver comentário de
// _getDscComponentKeyToFrameMap). sourceLib é a IDENTIDADE exata da lib
// ({id, label}), paralela a origin, para uso futuro de badge de UI —
// propagada tal como veio do Map, sem lógica própria aqui.
// componentKey deve ser o mainComp.key de uma INSTANCE remote — chamador garante isso.
function _resolveDscComponentA11yMatch(componentKey) {
  if (!componentKey) return null;
  const resolved = _getDscComponentKeyToFrameMap().get(componentKey);
  if (!resolved) return null;
  const { containingFrame, origin, sourceLib } = resolved;
  const a11yMatch = _getDscFrameToA11yMap(origin).get(containingFrame);
  if (!a11yMatch) {
    return { containingFrame, a11yCategory: null, confidence: null, isUnmapped: true, origin, sourceLib };
  }
  return {
    containingFrame,
    a11yCategory: a11yMatch.shortName,
    confidence: a11yMatch.confidence,
    origin,
    sourceLib
  };
}

// shortNames (mesmo vocabulário de a11yCategory retornado por
// _resolveDscComponentA11yMatch) que representam controles reais de foco de
// teclado — usados para filtrar a geração automática de Ordem de Tabulação
// (generate-tab-order-from-layers), que deve percorrer só "links, botões e
// campos de formulário", não qualquer INSTANCE/COMPONENT solto no canvas
// (ícone decorativo, card, imagem, badge). Revisão completa das 16
// categorias (critério: "essa categoria, quando existe como instância real
// no canvas, é algo que um usuário de teclado alcançaria com Tab?"):
// - 'listas' inclusa: [dsc] Menu item/Menu Lateral são links de navegação
//   reais, focáveis via Tab.
// - 'link' inclusa por consistência semântica, mesmo sem componente [dsc]
//   Link publicado hoje (não muda comportamento na prática).
// - 'dialog'/'snackbar'/'table' FORA: o container em si não é o alvo de
//   foco — ações/controles internos já são instâncias próprias capturadas
//   separadamente (button/checkbox/inputs).
// - 'imagem'/'titulo'/'decorativo' FORA: nunca são foco de Tab.
const A11Y_INTERACTIVE_SHORTNAMES = new Set([
  'button', 'checkbox', 'radio button', 'switch', 'inputs',
  'paginator', 'stepper', 'tab group', 'accordion', 'breadcrumb',
  'listas', 'link'
]);

// Único ponto de verdade de "esse componentKey é um controle real de foco de
// teclado" — usado pela varredura automática (generate-tab-order-from-layers)
// como filtro de SUGESTÃO de itens catalogados com certeza. NÃO é mais usado
// para bloquear o clique manual no canvas (bloqueio revertido em 2026-09-02:
// o reconhecimento via matching DSC falhava em casos reais — Icon Buttons de
// libs não mapeadas, cards customizados sem match no catálogo — então o
// clique manual voltou a aceitar qualquer elemento, sem checagem). Resolve
// via o mesmo catálogo DSC de sempre (_resolveDscComponentA11yMatch) e checa
// contra A11Y_INTERACTIVE_SHORTNAMES; componentKey nulo/sem match/isUnmapped
// conta como não-interativo.
function _isA11yInteractiveComponentKey(componentKey) {
  if (!componentKey) return false;
  const match = _resolveDscComponentA11yMatch(componentKey);
  return !!(match && !match.isUnmapped && A11Y_INTERACTIVE_SHORTNAMES.has(match.a11yCategory));
}

// Busca o primeiro TEXT visível com conteúdo dentro de um node (recursão
// rasa, alguns níveis — o bastante pra achar o label de um botão real sem
// virar uma varredura irrestrita) — usado por generate-tab-order-from-layers
// (2026-09-09) pra mostrar, na revisão da Ordem de Tabulação, o TEXTO REAL
// do componente (ex. "Label") em vez do nome da camada do Figma (ex.
// "Button 1"). É o nome acessível de fato — o que um leitor de tela real
// anuncia ao chegar num botão — então é isso que ajuda o designer a
// confirmar "é isso que vai ser lido em voz alta aqui", sem mudar em nada
// a regra de 1 parada de Tab por componente (a busca não gera itens novos,
// só decide o TEXTO do item já coletado). Limite de profundidade pequeno
// (3 níveis) evita custo alto em componentes muito aninhados — um botão
// real do DSC nunca precisa de mais que isso pra expor seu texto.
function _findVisibleLabelText(node, depth) {
  if (!node || node.visible === false) return null;
  if ((depth || 0) > 3) return null;
  if (node.type === 'TEXT' && typeof node.characters === 'string' && node.characters.trim()) {
    return node.characters.trim();
  }
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = _findVisibleLabelText(child, (depth || 0) + 1);
      if (found) return found;
    }
  }
  return null;
}

// Mesmo espírito de _findVisibleLabelText acima, mas retorna o NODE (não a
// string) — usado pelo bloco "Hierarquia de títulos" da Ficha Review
// (_buildFichaReviewSection, 2026-09-09) pra achar o TEXT real por trás de
// uma spec de título marcada num container (frame/grupo), e então ler
// node.textStyleId nele.
function _findFirstTextNode(node, depth) {
  if (!node || node.visible === false) return null;
  if ((depth || 0) > 3) return null;
  if (node.type === 'TEXT') return node;
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = _findFirstTextNode(child, (depth || 0) + 1);
      if (found) return found;
    }
  }
  return null;
}

// Nome de estilo de texto nomeado (styleName, quando o TEXT usa um Text
// Style do Figma) ou nome da própria camada — sinal fraco, mas suficiente
// para sugerir (nunca afirmar) que um texto é um "Nível de Título". QUAL
// nível (h1..h6) NÃO é inferido automaticamente — o nível de heading é
// definido pela hierarquia lógica do conteúdo, nunca pelo tamanho visual da
// fonte (W3C WAI: https://www.w3.org/WAI/tutorials/page-structure/headings/).
// Sempre sugere H1 como default; o designer ajusta pro nível lógico real.
const _A11Y_HEADING_NAME_REGEX = /\bh[1-6]\b|título|titulo|heading|headline/i;

// origin (web/mobile) NÃO é calculável aqui: diferente de
// _resolveDscComponentA11yMatch (que descobre a origin pela LIB do
// componente DSC real detectado), "Título" nasce de heurística de texto
// solto (estilo de tipografia/nome de camada), sem componente real por trás
// — não há de onde "puxar" a lib de origem neste ponto do backend, que só
// enxerga o node isolado, nunca a Área/o schema hacData (que vivem só no
// frontend). Retorna origin: null de propósito — o frontend
// (handleA11yPostAreaDetectionResult, accessibility.js) retropreenche este
// campo com a origin da Área Marcada onde o scan rodou (voto de maioria dos
// componentes reais detectados na mesma área), fonte de verdade válida
// porque uma Área representa uma tela inteira, sempre inteiramente web OU
// mobile. Mesmo raciocínio vale para _resolveDecorativeA11yMatch abaixo.
function _resolveTypographyA11yMatch(node, typoProp) {
  const styleName = (typoProp && typoProp.styleKey && typoProp.name) ? typoProp.name : null;
  const layerName = node && node.name ? node.name : '';
  const signal = (styleName && _A11Y_HEADING_NAME_REGEX.test(styleName)) ? styleName
    : (_A11Y_HEADING_NAME_REGEX.test(layerName) ? layerName : null);
  if (!signal) return null;
  return {
    containingFrame: null,
    a11yCategory: 'titulo',
    confidence: 'baixa',
    source: styleName && signal === styleName ? 'text-style-name' : 'layer-name',
    origin: null
  };
}

// Ícone/vetor solto (não coberto por _resolveDscComponentA11yMatch) — sugere
// "Elemento Decorativo" só quando não há indício de que o elemento carregue
// texto/rótulo próprio. Sinal: nome da camada não menciona termos de
// rótulo/label/alt/ícone-com-função — conservador, sempre confidence 'baixa'.
const _A11Y_NON_DECORATIVE_NAME_REGEX = /label|rótulo|rotulo|alt|informativ|funcional|clic[áa]vel|button|botão|botao/i;

// origin: null pelo mesmo motivo documentado acima em
// _resolveTypographyA11yMatch — heurística de ícone/vetor solto, sem
// componente DSC real por trás. Retropreenchido pelo frontend com a origin
// da Área Marcada.
function _resolveDecorativeA11yMatch(node) {
  const layerName = node && node.name ? node.name : '';
  if (_A11Y_NON_DECORATIVE_NAME_REGEX.test(layerName)) return null;
  return {
    containingFrame: null,
    a11yCategory: 'decorativo',
    confidence: 'baixa',
    source: 'layer-name',
    origin: null
  };
}

// Node com fill do tipo IMAGE — imagem de CONTEÚDO real (não ícone
// decorativo), precisa de texto alternativo para leitor de tela. Categoria
// de a11y correta é o shortName 'imagem' (cai no branch de "elemento" no
// formulário), não 'decorativo'. Sempre confidence 'baixa'.
function _resolveImageA11yMatch(node) {
  return {
    containingFrame: null,
    a11yCategory: 'imagem',
    confidence: 'baixa',
    source: 'image-fill'
  };
}

// ============================================================
// Aplicação de componentes reais da lib "Design Acessível"
// ============================================================

const _A11Y_SELECT_TO_SHORTNAME = { imagem: 'texto alternativo para imagens' };

function _normalizeA11yToggleName(rawName) {
  const s = String(rawName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (s === 'nome acesivel' || s === 'nome acessivel') return 'nomeAcessivel';
  if (s === 'observacao' || s === 'observacoes') return 'observacoes';
  if (s === 'notas' || s === 'notas de codigo') return 'notas';
  return null;
}

// Property definitions (com syncId real) do component set "[a11y base]"
// correspondente ao componente/subtipo escolhido no formulário — usado pelas
// 5 categorias. Retorna null se o componente/subtipo não estiver catalogado
// (fallback gracioso: nenhum toggle extra é aplicado).
function _getA11yComponentToggleMap(selectValue) {
  const shortName = _A11Y_SELECT_TO_SHORTNAME[selectValue] || selectValue;
  const entry = A11Y_COMPONENT_PROPERTIES_RAW.components.find(c => c.shortName === shortName);
  if (!entry) return null;
  const map = {};
  entry.properties.forEach(p => {
    if (p.type !== 'BOOLEAN') return;
    const canonical = _normalizeA11yToggleName(p.name);
    if (!canonical || map[canonical]) return;
    map[canonical] = { rawKey: p.rawKey, name: p.name, syncId: p.syncId };
  });
  return map;
}

// Procura, em profundidade, a primeira INSTANCE descendente (inclusive a
// própria raiz) que tenha uma componentProperty cujo nome (sem o sufixo
// "#id") bata com um dos candidatos, na ordem dada. Se o nome real divergir
// de todos os candidatos, retorna null e o chamador trata como falha (cai no
// fallback procedural).
function _findNestedInstanceWithAnyProp(root, propNameCandidates) {
  if (root.type === 'INSTANCE' && root.componentProperties) {
    for (const candidate of propNameCandidates) {
      const key = Object.keys(root.componentProperties).find(
        k => k.split('#')[0].toLowerCase() === candidate.toLowerCase()
      );
      if (key) return { instance: root, key };
    }
  }
  if ('children' in root) {
    for (const child of root.children) {
      const found = _findNestedInstanceWithAnyProp(child, propNameCandidates);
      if (found) return found;
    }
  }
  return null;
}

// Procura, em profundidade, a primeira INSTANCE descendente cujo NOME DE
// CAMADA bata exatamente com `instanceName` — diferente de
// _findNestedInstanceWithAnyProp (que busca por nome de componentProperty).
// Usado quando o campo a preencher é uma sub-instância cujos próprios TEXT
// filhos têm nomes genéricos ("Label"/"Text", iguais em toda a lib), então
// só o nome da instância em si identifica qual campo é qual (ver
// _fillA11yMobileElementosEImagensFields).
function _findNestedInstanceByName(root, instanceName) {
  if (root.type === 'INSTANCE' && root.name === instanceName) return root;
  if ('children' in root) {
    for (const child of root.children) {
      const found = _findNestedInstanceByName(child, instanceName);
      if (found) return found;
    }
  }
  return null;
}

// Localiza um TEXT node descendente cujo conteúdo atual bate exatamente com
// `value` — usado para achar o campo "Observações" (ou "Descrição") dentro
// do componente real importado, sem depender do nome da camada.
function _findTextNodeByCurrentValue(root, value) {
  if (root.type === 'TEXT' && root.characters === value) return root;
  if ('children' in root) {
    for (const child of root.children) {
      const found = _findTextNodeByCurrentValue(child, value);
      if (found) return found;
    }
  }
  return null;
}

// Primeiro TEXT node VISÍVEL na ordem de camadas (profundidade primeiro) —
// usado para sugerir o texto de Label (accessibilityLabel) a partir do
// conteúdo real do elemento. Ignora nós invisíveis e strings vazias/só
// espaço. Best-effort: se não achar nenhum texto, retorna null.
function _findMainTextContent(root) {
  if (root.visible === false) return null;
  if (root.type === 'TEXT') {
    const text = String(root.characters || '').trim();
    return text ? text : null;
  }
  if ('children' in root) {
    for (const child of root.children) {
      const found = _findMainTextContent(child);
      if (found) return found;
    }
  }
  return null;
}

// Best-effort: tenta achar o selo/tag de letra manual (A, B, A1...) dentro
// do componente importado para sincronizar com o texto digitado no
// formulário. Nunca lança erro: se não achar, a spec real ainda é criada, só
// sem o selo sincronizado.
function _bestEffortSyncA11yBadgeLetter(root, letter) {
  try {
    const byName = root.findOne
      ? root.findOne(n => n.type === 'TEXT' && /tag|selo|letra/i.test(n.name))
      : null;
    const target = byName || root.findOne(n => n.type === 'TEXT' && /^[A-Z]\d*(\.\d+)*$/.test(n.characters));
    if (target) {
      figma.loadFontAsync(target.fontName).then(() => { target.characters = letter; }).catch(() => {});
    }
  } catch (e) { /* best-effort — nunca bloqueia a criação da spec */ }
}

// Importa a VARIANTE mobile REAL certa para a categoria (elemento/titulo/
// decorativo) do component set "[a11y mob] Box specs leitor de tela"
// (fileKey 3zdtN13YvPlCGPdXeL0Y2i) — key resolvida em
// wrapperData.componentKeyByA11yType[type] (ver
// design-acessivel-mobile-wrapper.generated.json). Cada categoria já importa
// a key da sua própria variante (COMPONENT) diretamente — não a key do
// component set (essa não é importável via figma.importComponentByKeyAsync,
// que exige key de COMPONENT individual; era o bug real corrigido em
// 2026-09-02, "Could not find a published component with the key..."), e
// por isso não há mais setProperties de "Conector" aqui: a variante já vem
// fixada por ter importado a key certa.
// Chamado só por _tryImportA11yComponent quando opts.a11yOrigin === 'mobile'
// e a categoria é uma das 3 cobertas. Lança em qualquer ponto de incerteza —
// o chamador de _tryImportA11yComponent já trata isso como "não deu, volta
// pro card procedural" (mesmo contrato do caminho desktop).
//
// Preenchimento fino dos campos internos (Descrição/Nome acessível/Dica
// Leitor de Tela/Observação, mais a instância "Link do componente") está
// CONFIRMADO via REST API (ver design-acessivel-mobile-link-property.json)
// para a variante "Elementos e imagens" — rawKeys reais:
//   Descrição#7111:0 / Nome acessível#5366:0 / Dica Leitor de Tela#5405:0 /
//   Observação#5365:0 (todas BOOLEAN, controlam "visible" de sub-instâncias)
// As variantes "Títulos" e "Elementos decorativos" TIVERAM a árvore interna
// extraída em profundidade nesta sessão (2026-09-02, GET /v1/files/:key/
// nodes?ids=5413:1259,5413:1260&depth=10 + componentPropertyDefinitions dos
// componentIds base 5514:8933/5370:1835) — estrutura real, bem mais enxuta
// que "Elementos e imagens":
//   - "Elementos decorativos" (componentId base 5370:1835, instância
//     "Elementos decorativos" dentro do wrapper): SÓ tem uma property real,
//     "Observações#5413:0" (BOOLEAN, controla "visible" da sub-instância
//     "Observações"). Não há "Descrição"/"Nome acessível"/"Dica Leitor de
//     Tela" nem "Link do componente" nessa variante — a sub-instância
//     "Descrição" existe no canvas mas é SEMPRE visível, sem toggle.
//   - "Títulos" (componentId base 5514:8933, instância "Título" dentro do
//     wrapper): mesma forma, só "Observações#5514:1" (BOOLEAN). A variante
//     tem DUAS sub-instâncias "Descrição" (uma antes, uma depois da
//     "Observações") — a primeira mostra "Descrição: Identificar como
//     título.", a segunda (reaproveitando o MESMO componente base, só com o
//     TEXT "Label" trocado no default publicado) mostra "Notas de Código:
//     Aplicar a propriedade accessibilityRole="header"...". Nenhuma das duas
//     tem property própria (componentId 31:227 "Box conteúdo bloqueado" não
//     tem componentPropertyDefinitions nenhuma, confirmado via REST API) —
//     são conteúdo fixo da lib, sem vínculo editável, mesmo padrão do
//     workaround do TEXT "Number" hardcoded em _tryImportA11yAgrupamento.
// Por isso, para essas duas variantes, o preenchimento fino cobre SÓ o
// toggle real "Observações" (liga o BOOLEAN quando o designer marcou
// "observacoes" no formulário + escreve o texto no TEXT node correspondente
// via _findTextNodeByCurrentValue, mesma técnica best-effort já usada em
// outros caminhos deste arquivo). Não há "Nome acessível"/"Dica Leitor de
// Tela"/"Link do componente" para preencher nessas duas — não existem no
// componente real. O texto de Descrição/Nota de Código (properties
// 'descricao'/'notaCodigo' em opts.properties, já coletado e catalogado em
// A11Y_CONTENT) fica só nas propriedades da SPEC (painel do hac) — são
// conteúdo fixo da lib publicada, sem property exposta pra sincronizar.
async function _tryImportA11yMobileWrapperComponent(opts, wrapperData) {
  const type = opts.a11yType;
  const componentKey = wrapperData.componentKeyByA11yType && wrapperData.componentKeyByA11yType[type];
  if (!componentKey) throw new Error('a11y-mobile-wrapper-sem-key-de-variante: ' + type);

  // Importa a key da VARIANTE (COMPONENT) diretamente — a key do component
  // set "[a11y mob] Box specs leitor de tela" (que existia aqui antes) não é
  // importável via figma.importComponentByKeyAsync (só aceita key de
  // COMPONENT individual), causava "Could not find a published component
  // with the key..." em runtime. Sem setProperties de Conector: a variante
  // já vem fixada na categoria certa por ter importado a key certa.
  const variantComponent = await figma.importComponentByKeyAsync(componentKey);
  const instance = variantComponent.createInstance();

  // Preenchimento fino — best-effort: nunca lança a partir daqui, porque o
  // wrapper com a variante certa já é um resultado válido por si só.
  try {
    if (type === 'elemento') {
      await _fillA11yMobileElementosEImagensFields(instance, opts);
    } else if (type === 'titulo') {
      await _fillA11yMobileTituloFields(instance, opts);
    } else if (type === 'decorativo') {
      await _fillA11yMobileDecorativoFields(instance, opts);
    }
  } catch (e) { /* best-effort — a instância com a variante certa já foi criada */ }

  return instance;
}

// Preenche os campos internos REAIS da instância "Elementos e imagens"
// (component set oculto ".[a11y mob base] Elementos e imagens", node
// 5362:961) dentro da variante "Conector=Elementos e imagens" do wrapper —
// rawKeys confirmados via REST API (design-acessivel-mobile-link-property.
// json): Descrição#7111:0 / Nome acessível#5366:0 / Dica Leitor de Tela#
// 5405:0 / Observação#5365:0 (BOOLEAN, controlam visibilidade de
// sub-instâncias de texto), mais a instância sempre-visível "Link do
// componente" (sem toggle). opts.properties chega no formato coletado por
// _collectA11yElementoMobileToggleProperties (accessibility.js) MAIS o
// campo "label" do topo do formulário (accessibilityLabel), sempre incluído
// em opts.properties como { key: 'label', value } — ver confirmA11ySpec em
// accessibility.js. Chaves possíveis: 'label', 'descricao',
// 'accessibilityHint', 'observacoes', 'linkComponente', 'linkComponenteNome'.
// "Nome acessível" (campo interno BOOLEAN do componente real) é preenchido
// a partir desse mesmo 'label' — não há campo dedicado no formulário mobile
// pra isso, o Label do topo é a fonte única de accessibilityLabel.
async function _fillA11yMobileElementosEImagensFields(wrapperInstance, opts) {
  const nested = _findNestedInstanceWithAnyProp(wrapperInstance, ['Descrição', 'Nome acessível', 'Dica Leitor de Tela', 'Observação']);
  if (!nested) return; // best-effort — wrapper com Conector certo já é um resultado válido

  const props = opts.properties || [];
  const getProp = key => {
    const p = props.find(x => x && x.key === key);
    return p ? p.value : '';
  };

  const rawKeys = Object.keys(nested.instance.componentProperties || {});
  const findRawKey = (name) => rawKeys.find(k => k.split('#')[0] === name);

  // Descrição — sempre visível por padrão na definição do componente base;
  // liga explicitamente quando há texto de descrição coletado (variante
  // "componente" não tem campo de descrição livre próprio no formulário
  // hoje — best-effort, só ativa o toggle se o valor existir).
  const descricaoTexto = getProp('descricao');
  const descricaoKey = findRawKey('Descrição');
  if (descricaoKey && descricaoTexto) {
    try { nested.instance.setProperties({ [descricaoKey]: true }); } catch (e) { /* best-effort */ }
  }

  // Dica Leitor de Tela — toggle real, texto vem de 'accessibilityHint'.
  const dicaTexto = getProp('accessibilityHint');
  const dicaKey = findRawKey('Dica Leitor de Tela');
  if (dicaKey) {
    try { nested.instance.setProperties({ [dicaKey]: !!dicaTexto }); } catch (e) { /* best-effort */ }
  }

  // Observação — toggle real, texto vem de 'observacoes'.
  const observacaoTexto = getProp('observacoes');
  const observacaoKey = findRawKey('Observação');
  if (observacaoKey) {
    try { nested.instance.setProperties({ [observacaoKey]: !!observacaoTexto }); } catch (e) { /* best-effort */ }
  }

  // Nome acessível — toggle real, texto vem do Label do topo do formulário
  // ('label' em opts.properties, fonte única de accessibilityLabel desde a
  // remoção do toggle duplicado "Nome Acessível" da UI mobile).
  const nomeAcessivelTexto = getProp('label');
  const nomeAcessivelKey = findRawKey('Nome acessível');
  if (nomeAcessivelKey) {
    try { nested.instance.setProperties({ [nomeAcessivelKey]: !!nomeAcessivelTexto }); } catch (e) { /* best-effort */ }
  }

  // Sincroniza o conteúdo real de cada sub-instância ligada. Bug real
  // corrigido em 2026-09-02: a versão anterior buscava um TEXT node cujo
  // NOME DE CAMADA batesse com o campo ("descri"/"dica"/"observ"/"nome
  // acess") — mas a árvore real (confirmada via REST API,
  // GET /v1/files/3zdtN13YvPlCGPdXeL0Y2i/nodes?ids=5362:961&depth=10) não
  // tem TEXT nodes com esses nomes: cada campo é uma INSTANCE aninhada
  // ("Descrição"/"Nome acessível"/"Dica para Leitor de Tela"/"Observações")
  // cujos dois TEXT filhos se chamam sempre "Label"/"Text", iguais em todas
  // — o `findOne` por nome nunca encontrava nada e o card real ficava com o
  // texto placeholder publicado. O conteúdo de cada sub-instância é uma
  // component property de texto própria, "Texto#7316:0" — mesmo padrão já
  // usado abaixo para "Link do componente" — então a sincronização correta é
  // achar a INSTANCE pelo nome dela e usar setProperties, não findOne+TEXT.
  const syncNestedInstanceText = (instanceName, text) => {
    if (!text) return;
    const target = _findNestedInstanceByName(wrapperInstance, instanceName);
    if (!target || !target.componentProperties) return;
    const textoKey = Object.keys(target.componentProperties).find(k => k.split('#')[0] === 'Texto');
    if (!textoKey) return;
    try { target.setProperties({ [textoKey]: text }); } catch (e) { /* best-effort */ }
  };
  syncNestedInstanceText('Descrição', descricaoTexto);
  syncNestedInstanceText('Dica para Leitor de Tela', dicaTexto);
  syncNestedInstanceText('Observações', observacaoTexto);
  syncNestedInstanceText('Nome acessível', nomeAcessivelTexto);

  // Link do componente — instância SEMPRE presente, sem toggle (ver
  // estruturaCompletaVarianteElementosEImagens no JSON de referência).
  // Property real "Link" (VARIANT, rótulo textual) + companheiro TEXT
  // "Texto#7157:0" com a URL/nome digitado pelo designer.
  const linkNome = getProp('linkComponenteNome');
  const linkUrl = getProp('linkComponente');
  if (linkNome || linkUrl) {
    const linkFound = _findNestedInstanceWithAnyProp(wrapperInstance, ['Link']);
    if (linkFound) {
      if (linkNome) {
        try { linkFound.instance.setProperties({ [linkFound.key]: linkNome }); } catch (e) { /* best-effort */ }
      }
      if (linkUrl) {
        const textoKey = Object.keys(linkFound.instance.componentProperties || {}).find(
          k => k.split('#')[0] === 'Texto'
        );
        if (textoKey) {
          // "Texto#7157:0" é TEXT (component property de texto, não TEXT
          // node direto) — setProperties já cobre esse caso sem precisar de
          // loadFontAsync/findOne.
          try { linkFound.instance.setProperties({ [textoKey]: linkUrl }); } catch (e) { /* best-effort */ }
        }
      }
    }
  }
}

// Preenche o campo interno REAL da instância "Título" (componentId base
// 5514:8933, ".[a11y mob base] Títulos") dentro da variante "Conector=
// Títulos" do wrapper — rawKey confirmado via REST API em 2026-09-02
// (GET /v1/files/3zdtN13YvPlCGPdXeL0Y2i/nodes?ids=5413:1259,5514:8933):
// só existe UMA property real, "Observações#5514:1" (BOOLEAN, controla
// "visible" da sub-instância "Observações"). Não há "Descrição"/"Nome
// acessível"/"Dica Leitor de Tela"/"Link do componente" nessa variante —
// as duas sub-instâncias "Descrição" (rótulos "Descrição:"/"Notas de
// Código:") são conteúdo FIXO da lib publicada (componentId 31:227, "Box
// conteúdo bloqueado", sem nenhuma componentPropertyDefinition), sempre
// visíveis, sem vínculo editável — não têm o que sincronizar aqui.
// opts.properties chega no formato coletado em confirmA11ySpec
// (accessibility.js, ramo `category === 'titulo'`): 'descricao' (fixo,
// já documentado na SPEC, sem property pra sincronizar), 'notaCodigo'
// (idem) e 'observacoes' (toggle real, via _collectA11yFixedToggleProperties
// com listId 'a11y-titulo-toggles-list') — só este último é preenchido aqui.
async function _fillA11yMobileTituloFields(wrapperInstance, opts) {
  const nested = _findNestedInstanceWithAnyProp(wrapperInstance, ['Observações']);
  if (!nested) return; // best-effort — wrapper com Conector certo já é um resultado válido

  const props = opts.properties || [];
  const getProp = key => {
    const p = props.find(x => x && x.key === key);
    return p ? p.value : '';
  };

  const observacaoTexto = getProp('observacoes');
  if (nested.key) {
    try { nested.instance.setProperties({ [nested.key]: !!observacaoTexto }); } catch (e) { /* best-effort */ }
  }

  // Sincroniza o TEXT visível da sub-instância "Observações" por valor-padrão
  // atual ("É um elemento que ajuda a organizar..."), não por nome de camada
  // (a árvore real tem duas instâncias "Descrição" com o mesmo nome de
  // camada "Text"/"Label" — buscar por nome colidiria com a errada).
  if (observacaoTexto) {
    try {
      const defaultNode = _findTextNodeByCurrentValue(
        nested.instance,
        'É um elemento que ajuda a organizar o conteúdo da página, fornecendo uma estrutura clara e semântica.'
      );
      if (defaultNode) {
        await figma.loadFontAsync(defaultNode.fontName);
        defaultNode.characters = observacaoTexto;
      }
    } catch (e) { /* best-effort */ }
  }
}

// Preenche o campo interno REAL da instância "Elementos decorativos"
// (componentId base 5370:1835, ".[a11y mob base] Elementos decorativos")
// dentro da variante "Conector=Elementos decorativos" do wrapper — rawKey
// confirmado via REST API em 2026-09-02 (GET /v1/files/3zdtN13YvPlCGPdXeL0Y2i/
// nodes?ids=5413:1260,5370:1835): só existe UMA property real, "Observações#
// 5413:0" (BOOLEAN, controla "visible" da sub-instância "Observações"). Não
// há "Descrição"/"Nome acessível"/"Dica Leitor de Tela"/"Link do componente"
// nessa variante — a sub-instância "Descrição" ("Não deve ser anunciado pelo
// Leitor de Tela.") é conteúdo FIXO da lib publicada (mesmo componentId
// 31:227 "Box conteúdo bloqueado" de _fillA11yMobileTituloFields, sem
// nenhuma componentPropertyDefinition), sempre visível, sem vínculo
// editável. opts.properties segue o mesmo formato do ramo `category ===
// 'decorativo'` em confirmA11ySpec: 'descricao' (fixo), 'notaCodigo' (fixo)
// e 'observacoes' (toggle real, via _collectA11yFixedToggleProperties com
// listId 'a11y-decorativo-toggles-list') — só este último é preenchido aqui.
async function _fillA11yMobileDecorativoFields(wrapperInstance, opts) {
  const nested = _findNestedInstanceWithAnyProp(wrapperInstance, ['Observações']);
  if (!nested) return; // best-effort — wrapper com Conector certo já é um resultado válido

  const props = opts.properties || [];
  const getProp = key => {
    const p = props.find(x => x && x.key === key);
    return p ? p.value : '';
  };

  const observacaoTexto = getProp('observacoes');
  if (nested.key) {
    try { nested.instance.setProperties({ [nested.key]: !!observacaoTexto }); } catch (e) { /* best-effort */ }
  }

  // Sincroniza o TEXT visível da sub-instância "Observações" por valor-padrão
  // atual ("Insira seu texto da observação."), não por nome de camada (nomes
  // de camada "Text"/"Label" se repetem entre "Descrição" e "Observações"
  // dentro da mesma variante).
  if (observacaoTexto) {
    try {
      const defaultNode = _findTextNodeByCurrentValue(nested.instance, 'Insira seu texto da observação.');
      if (defaultNode) {
        await figma.loadFontAsync(defaultNode.fontName);
        defaultNode.characters = observacaoTexto;
      }
    } catch (e) { /* best-effort */ }
  }
}

// Tenta reaproveitar o componente REAL da lib "Design Acessível" em vez de
// desenhar o card do zero. Lança (throw) em qualquer ponto de incerteza —
// quem chama trata a exceção como "não deu, volta pro card procedural" (ver
// create-unified-spec). "Estrutura da página" tem dois níveis de instância
// aninhada (variacao → tipo/idioma). "titulo da pagina" não tem segundo
// nível (conteúdo fixo); variação "customizavel" (nível 1) e "customizavel"
// dentro de marco de navegação não têm conteúdo catalogado — caem no
// fallback procedural.
// EXCEÇÃO a essa regra: "elemento" isOutro (componente DSC real detectado,
// mas sem categoria de a11y catalogada) NÃO lança — usa o wrapper real com a
// property "componente" no valor DEFAULT da instância aninhada (não
// corresponde ao componente real detectado), documentando o restante via
// texto em Observações. O badge "Verificar" já avisa que precisa de revisão manual.
async function _tryImportA11yComponent(opts) {
  const type = opts.a11yType;

  // Origem mobile, categoria coberta pelo wrapper mobile REAL ("[a11y mob]
  // Box specs leitor de tela") — desvia por completo do wrapper desktop.
  // "estrutura" e "informacoes" não têm equivalente mobile publicado
  // conhecido (ver design-acessivel-mobile-wrapper.generated.json._meta) e
  // caem no `else` abaixo, que mantém o comportamento desktop de sempre —
  // mesmo raciocínio para origem 'web'. Ver _tryImportA11yMobileWrapper.
  const MOBILE_WRAPPER_COVERED_TYPES = new Set(['elemento', 'titulo', 'decorativo']);
  if (
    opts.a11yOrigin === 'mobile' &&
    MOBILE_WRAPPER_COVERED_TYPES.has(type) &&
    A11Y_MOBILE_WRAPPER_RAW && A11Y_MOBILE_WRAPPER_RAW.wrapper
  ) {
    return await _tryImportA11yMobileWrapperComponent(opts, A11Y_MOBILE_WRAPPER_RAW.wrapper);
  }

  const catData = A11Y_CONTENT.categories[type];
  if (!catData || !catData.wrapperComponentKey) throw new Error('a11y-sem-wrapper-key: ' + type);

  const sub = opts.a11ySubtype || {};
  let defaultEntry = null;
  let propCandidates = null;
  let propValue = null;
  // Quando true, pula por completo o passo de achar a instância aninhada de
  // "componente" e chamar setProperties nela (não existe componente real
  // catalogado pra ajustar). O wrapper ainda é importado e instanciado
  // normalmente — a instância aninhada interna fica no valor DEFAULT dela.
  let skipNestedComponentProp = false;

  if (type === 'elemento') {
    if (sub.isOutro) {
      skipNestedComponentProp = true;
      defaultEntry = null;
    } else {
      if (!sub.componente) throw new Error('a11y-elemento-outro-sem-componente-real');
      defaultEntry = catData.componentes[sub.componente];
      if (!defaultEntry) throw new Error('a11y-elemento-componente-desconhecido: ' + sub.componente);
      propCandidates = ['componente'];
      propValue = sub.componente;
    }
  } else if (type === 'titulo') {
    if (sub.nivel === 'mobile') throw new Error('a11y-titulo-mobile-sem-variante-real');
    defaultEntry = catData.niveis && catData.niveis[sub.nivel];
    if (!defaultEntry) throw new Error('a11y-titulo-nivel-desconhecido: ' + sub.nivel);
    propCandidates = ['nivel'];
    propValue = sub.nivel;
  } else if (type === 'decorativo') {
    defaultEntry = catData.subtipos && catData.subtipos[sub.tipo];
    if (!defaultEntry) throw new Error('a11y-decorativo-subtipo-desconhecido: ' + sub.tipo);
    propCandidates = ['variacao', 'tipo'];
    propValue = sub.tipo;
  } else if (type === 'informacoes') {
    if (sub.subtipo === 'customizavel') throw new Error('a11y-informacoes-customizavel-sem-variante-real');
    defaultEntry = catData.subtipos && catData.subtipos[sub.subtipo];
    if (!defaultEntry) throw new Error('a11y-informacoes-subtipo-desconhecido: ' + sub.subtipo);
    propCandidates = ['tipo', 'subtipo', 'variacao'];
    propValue = sub.subtipo;
  } else if (type === 'estrutura') {
    if (sub.variacao !== 'idiomas' && sub.variacao !== 'marco de navegacao' && sub.variacao !== 'titulo da pagina') {
      throw new Error('a11y-estrutura-variacao-sem-import-real: ' + sub.variacao);
    }
    propCandidates = ['variacao'];
    propValue = sub.variacao;
    if (sub.variacao === 'idiomas') {
      defaultEntry = catData.subtipos.idiomas && catData.subtipos.idiomas[sub.idioma];
      if (!defaultEntry) throw new Error('a11y-estrutura-idioma-desconhecido: ' + sub.idioma);
    } else if (sub.variacao === 'marco de navegacao') {
      if (sub.tipo === 'customizavel') throw new Error('a11y-estrutura-marco-customizavel-sem-conteudo-catalogado');
      defaultEntry = catData.subtipos['marco de navegacao'] && catData.subtipos['marco de navegacao'][sub.tipo];
      if (!defaultEntry) throw new Error('a11y-estrutura-marco-desconhecido: ' + sub.tipo);
    } else {
      defaultEntry = catData.subtipos['titulo da pagina'];
    }
  } else {
    throw new Error('a11y-tipo-sem-import-real: ' + type);
  }

  const wrapperComponent = await figma.importComponentByKeyAsync(catData.wrapperComponentKey);
  const instance = wrapperComponent.createInstance();

  let found;
  if (skipNestedComponentProp) {
    found = { instance, key: null };
  } else {
    found = _findNestedInstanceWithAnyProp(instance, propCandidates);
    if (!found) {
      instance.remove();
      throw new Error('a11y-instancia-aninhada-nao-encontrada: prop~=' + propCandidates.join('|'));
    }

    try {
      found.instance.setProperties({ [found.key]: propValue });
    } catch (e) {
      instance.remove();
      throw new Error('a11y-set-properties-falhou: ' + (e && e.message ? e.message : e));
    }
  }

  // Categoria "elemento": trocar "componente" no wrapper (found.instance)
  // revela um SEGUNDO nível de instância aninhada (ex: instância "Button",
  // "Accordion"...) — é nela, não no wrapper, que vivem a property "tipo"
  // (variante secundária) e os 3 toggles booleanos (nome acessivel/observacoes/notas).
  let _elementoNestedFound = null;
  if (type === 'elemento') {
    _elementoNestedFound = _findNestedInstanceWithAnyProp(found.instance, ['tipo', 'nome acessivel', 'observacoes', 'notas']);
    if (_elementoNestedFound) {
      found = _elementoNestedFound;
    }

    if (sub.tipo && _elementoNestedFound) {
      const tipoKey = Object.keys(found.instance.componentProperties || {}).find(
        k => k.split('#')[0].toLowerCase() === 'tipo'
      );
      if (tipoKey) {
        try { found.instance.setProperties({ [tipoKey]: sub.tipo }); } catch (e) { /* best-effort */ }
      }
    }
  }

  // Estrutura da página tem um SEGUNDO nível de instância aninhada dentro do
  // primeiro (variacao) — "idiomas" e "marco de navegacao" abrem um
  // sub-componente próprio com a property "tipo" (idioma ou marco
  // específico); "titulo da pagina" não tem esse segundo nível.
  let _estruturaNestedFound = null;
  if (type === 'estrutura' && sub.variacao !== 'titulo da pagina') {
    const nestedValue = sub.variacao === 'idiomas' ? sub.idioma : sub.tipo;
    const nestedFound = _findNestedInstanceWithAnyProp(found.instance, ['tipo']);
    if (!nestedFound) {
      instance.remove();
      throw new Error('a11y-estrutura-instancia-tipo-nao-encontrada');
    }
    try {
      nestedFound.instance.setProperties({ [nestedFound.key]: nestedValue });
    } catch (e) {
      instance.remove();
      throw new Error('a11y-estrutura-set-tipo-falhou: ' + (e && e.message ? e.message : e));
    }
    _estruturaNestedFound = nestedFound;
  }

  // Elemento Decorativo tem um TERCEIRO nível de instância aninhada — o
  // wrapper (found, prop "variacao") revela uma instância "Elementos
  // decorativos" (nível 2, já é 'found' aqui) cujo filho direto "Content"
  // (nível 3) é quem tem observacoes/notas/tipo de verdade.
  let _decorativoNestedFound = null;
  if (type === 'decorativo') {
    _decorativoNestedFound = _findNestedInstanceWithAnyProp(found.instance, ['notas', 'observacoes']) || found;
  }

  // Tag manual de Estrutura — o "Conector" (selo/estrela visível no elemento)
  // tem sua própria property "letter#..." num nível irmão de "Elementos
  // estruturais", fora da árvore de variacao/tipo.
  if (type === 'estrutura' && opts.letter) {
    const letterFound = _findNestedInstanceWithAnyProp(instance, ['letter']);
    if (letterFound) {
      try { letterFound.instance.setProperties({ [letterFound.key]: opts.letter }); } catch (e) { /* best-effort */ }
    }
  }

  // Campos dinâmicos Nome Acessível/Observações/Notas de Código — nas 5
  // categorias, só os que o componente/subtipo ESCOLHIDO realmente tem no
  // catálogo (ver _getA11yComponentToggleMap) e que o designer ligou +
  // preencheu no formulário. Cada um precisa de dois passos: (1) ativar o
  // toggle de verdade na instância aninhada via setProperties (usa o syncId
  // exato do catálogo), pra revelar o bloco de conteúdo; (2) achar o TEXT
  // node revelado por valor-padrão atual e escrever o texto digitado. Nenhuma
  // etapa lança — falha em um toggle não derruba a spec inteira.
  //
  // shortName do catálogo e a instância aninhada onde a property BOOLEAN de
  // fato mora variam por categoria:
  //   elemento    → shortName = sub.componente (ou 'texto alternativo para
  //                 imagens' se 'imagem'); instância = _elementoNestedFound
  //   titulo      → shortName 'niveis de titulo'; instância = found (nível 1)
  //   informacoes → shortName 'informações adicionais'; instância = found
  //   decorativo  → shortName 'ED gerais'/'ED imagem' conforme sub.tipo;
  //                 instância = _decorativoNestedFound (3º nível "Content")
  //   estrutura   → shortName 'EE idiomas'/'EE marco de navegacao' conforme
  //                 sub.variacao; instância = _estruturaNestedFound (nulo em
  //                 "titulo da pagina", sem toggle catalogado)
  const _dynamicToggleKeys = new Set(['nomeAcessivel', 'observacoes', 'notas']);
  let _toggleShortName = null;
  let _toggleTargetInstance = null;
  if (type === 'elemento' && !sub.isOutro && sub.componente) {
    _toggleShortName = sub.componente;
    _toggleTargetInstance = found.instance;
  } else if (type === 'titulo') {
    _toggleShortName = 'niveis de titulo';
    _toggleTargetInstance = found.instance;
  } else if (type === 'informacoes') {
    _toggleShortName = 'informações adicionais';
    _toggleTargetInstance = found.instance;
  } else if (type === 'decorativo' && _decorativoNestedFound) {
    _toggleShortName = sub.tipo === 'imagem' ? 'ED imagem' : 'ED gerais';
    _toggleTargetInstance = _decorativoNestedFound.instance;
  } else if (type === 'estrutura' && _estruturaNestedFound) {
    _toggleShortName = sub.variacao === 'idiomas' ? 'EE idiomas' : sub.variacao === 'marco de navegacao' ? 'EE marco de navegacao' : null;
    _toggleTargetInstance = _estruturaNestedFound.instance;
  }

  if (_toggleShortName && _toggleTargetInstance) {
    const toggleMap = _getA11yComponentToggleMap(_toggleShortName);
    if (toggleMap) {
      for (const p of (opts.properties || [])) {
        if (!p || !p.value || !_dynamicToggleKeys.has(p.key)) continue;
        const toggleDef = toggleMap[p.key];
        if (!toggleDef) continue; // componente/subtipo não tem esse toggle — ignora silenciosamente
        try {
          _toggleTargetInstance.setProperties({ [toggleDef.rawKey]: true });
        } catch (e) { continue; } // toggle não ativou — não adianta procurar o texto
        const defaultText = p.key === 'observacoes' ? defaultEntry.observacoes
          : p.key === 'notas' ? defaultEntry.notasCodigo
          : p.key === 'nomeAcessivel' ? defaultEntry.nomeAcessivel
          : null;
        if (!defaultText) continue;
        const fieldNode = _findTextNodeByCurrentValue(instance, defaultText);
        if (fieldNode) {
          try {
            await figma.loadFontAsync(fieldNode.fontName);
            fieldNode.characters = p.value;
          } catch (e) { /* best-effort — campo fica com o texto padrão do componente */ }
        }
      }
    }
  }

  // O componente real (wrapper DESKTOP, único importado aqui hoje — não há
  // wrapper mobile "[a11y mob] Box specs leitor de tela" cadastrado em
  // A11Y_CONTENT ainda) só tem campos de Descrição/Observações/Notas de
  // Código (mais Nome Acessível, quando o componente tem) — não tem onde
  // encaixar Componente/Variante/Label/accessibilityHint/Link do Componente
  // separadamente. Injeta o que sobrar (exceto Descrição/Notas/os 3 toggles
  // dinâmicos já tratados acima) dentro do campo Observações, uma linha por
  // propriedade — cobre também specs de origem mobile (opts.a11yOrigin),
  // porque _tryImportA11yComponent hoje não distingue origem ao importar.
  const _infoLines = (opts.properties || [])
    .filter(p => p && p.value && p.key !== 'descricao' && p.key !== 'notaCodigo' && !_dynamicToggleKeys.has(p.key))
    .map(p => `${p.label}: ${p.value}`)
    .join('\n');
  // Caso isOutro não tem defaultEntry (não há componente real escolhido),
  // então não existe texto-padrão catalogado para achar o TEXT node de
  // Observações por valor atual. Fallback best-effort por NOME DE CAMADA — se
  // não achar, a spec real ainda é criada, só sem o texto sincronizado.
  if (_infoLines && skipNestedComponentProp) {
    try {
      const obsNode = instance.findOne
        ? instance.findOne(n => n.type === 'TEXT' && /observ/i.test(n.name))
        : null;
      if (obsNode) {
        await figma.loadFontAsync(obsNode.fontName);
        obsNode.characters = _infoLines;
      }
    } catch (e) { /* best-effort — nunca bloqueia a criação da spec */ }
  } else if (_infoLines && defaultEntry && defaultEntry.observacoes) {
    const obsNode = _findTextNodeByCurrentValue(instance, defaultEntry.observacoes);
    if (obsNode) {
      try {
        await figma.loadFontAsync(obsNode.fontName);
        obsNode.characters = _infoLines;
      } catch (e) { /* não bloqueia — observação fica com o texto padrão do componente */ }
    }
  }

  // Tag manual (A, B, A1... ou H1, H2, H3... em Título) — sincroniza o selo
  // do componente importado com o nível/letra escolhido no formulário.
  if ((type === 'elemento' || type === 'informacoes' || type === 'titulo') && opts.letter) {
    _bestEffortSyncA11yBadgeLetter(instance, opts.letter);
  }

  return instance;
}

// ============================================================
// Marcadores visuais — Agrupamento (contorno/moldura) e Conector linha
// ============================================================

// Keys publicadas do component set "[a11y] Agrupamento" — o selo/marcador
// PEQUENO (badge + moldura, ~40×40) que a vertical usa pra indicar QUAL
// elemento a spec documenta, com uma "orientação" que já embute a direção do
// conector. É o modo "Área" do formulário (drawMode === 'contorno', default).
const A11Y_AGRUPAMENTO_KEYS = {
  elemento: {
    direita:  '1a32480d314943f85d5bf48e97beda44be37233b',
    esquerda: '918dc37577a8ba0b0b9b421bbfa4c0e831696b7a',
    superior: 'e58a10ad987b3cc2feb7c7acf4b77e4e132c0b62',
    inferior: 'f70dae1493341f9839a3a2e11b93855ddb78192b',
  },
  decorativo: {
    direita:  'db8057dd5440ba35593fed4823b6b0746d2a5d3a',
    esquerda: 'a638d41c126fc85074ecfb6b5c013ded77a7ca30',
    superior: '625a28708db4453614eb3d18f2163f53a01738fc',
    inferior: 'a8abbf67336b205d944ec2a97a62879c7f8a378e',
  },
  estrutura: {
    direita:  '2f62f4c09d769578d3c5f9f7c42de94ea4b5a559',
    esquerda: '0736255a49a164a93dbe5913925e8cd94474c102',
    superior: 'cb88b4fe2d7a34fa5db191e1e29e99a462eaa88e',
    inferior: 'd1de84d4afe1d169d51471b049e3b55191319b72',
  },
  titulo: {
    direita:  '4df3d05e26dd4168c7d7de71fe689515c9b1895c',
    esquerda: '5b759c2904110d3c60891be859e24f64d15833e9',
    superior: '75e44fd1fc2f346fdaa7c6c59a9af09356bb045f',
    inferior: 'f18bae60d1e9109c2ecd1b3c5e49bacdb3c6267a',
  },
  informacoes: {
    direita:  '42eafe50b7b07e5cdacbbc1845c05af877768337',
    esquerda: 'b1155ae94b549e7de188458b1289b8ba476af73d',
    superior: '060a2f17dff2dc489fcb1620404eda5269b5e182',
    inferior: 'faa943c3ccdec90b2fb06e6e58aaaa9ba0cbb867',
  },
};

// ── Integração com a lib mobile "[a11y mob]" (2026-08-25) ──────────────────
// Segunda lib DSC ("DSC | Super App", mobile/React Native) mapeada para a11y
// — ver dsc-component-a11y-mapping-mobile.json e REF_SKELETON.libraries
// (slug 'super-app'). A Detecção Automática agora reconhece sozinha se um
// componente do canvas é web ou mobile via a componentKey (única por lib de
// origem — nunca colide entre libs), sem o designer escolher manualmente
// (ver _resolveDscComponentA11yMatch acima, campo `origin`).
//
// KEYS CONFIRMADAS via REST API em 2026-08-25 (GET /v1/files/
// 3zdtN13YvPlCGPdXeL0Y2i/components, fileKey da lib "[a11y mob]" — arquivo
// DIFERENTE da lib de componentes reais 'super-app', que é o template/
// handoff de marcadores visuais). A lib mobile tem só 39 componentes reais
// no total (varredura completa, não amostra) e, DIFERENTE da lib desktop
// "[a11y]" (25 = 5 categorias × 5 direções em cada modo), tem LACUNAS REAIS:
//
//   [a11y mob] Agrupamento: só 3 categorias (elemento/estrutura/decorativo)
//     × 4 orientações = 12 componentes. NÃO existe "titulo" nem
//     "informacoes" no Agrupamento mobile — confirmado, não é lacuna de
//     amostragem.
//   [a11y mob] Conectores: só 3 categorias (elemento/titulo/decorativo) × 5
//     direções (incluindo "desativado") = 15 componentes. NÃO existe
//     "estrutura" nem "informacoes" no modo Conectores/Linha mobile —
//     também confirmado por varredura completa.
//   [a11y mob] Número da tela: 5 componentes (4 direções + desativado),
//     paridade completa com A11Y_ITEM_NUMBER_KEYS desktop.
//
// FALLBACK (decisão de produto, não questionar sem alinhamento): quando uma
// categoria/orientação não existir no dicionário mobile (typeKeys
// undefined, ou key da orientação específica undefined), cai pro
// dicionário DESKTOP equivalente ANTES de lançar erro — nunca quebra a
// criação da spec. Implementado em _tryImportA11yAgrupamento/
// _tryImportA11yConectorLinha logo abaixo. Como as 5 categorias fixas do
// hac (elemento/estrutura/titulo/decorativo/informacoes) SEMPRE existem
// completas nos dicionários desktop, esse fallback nunca deveria de fato
// lançar — é uma segunda rede de segurança, não o caminho esperado na
// prática (a maioria das specs mobile usa elemento/decorativo, que TÊM
// marcador mobile próprio).
const A11Y_AGRUPAMENTO_KEYS_MOBILE = {
  elemento: {
    esquerda: 'd93c8cf698d12840af7f3c3ea0bda4b9cd5a0728',
    direita:  'de08af167290b5220aa75ae757603a26b48c6a68',
    superior: '55144e19b4306199ceb1de0dff2abd4f01c01b72',
    inferior: '01acc2917e26866d5b468f8aef3a8bfb99881202',
  },
  estrutura: {
    esquerda: '9b25c0b70cb75cc162ad2f2bb9ed34fe52f32f0f',
    direita:  '584e699ec0cf98c45ea17d5a9615932f81aa1e8a',
    superior: 'd78117bfb35d40e98dd4071e772413b959d37c3e',
    inferior: 'a74142992e0968ade98fbe97590d45b31fc3f35a',
  },
  decorativo: {
    esquerda: '1cecb187f29bfed5c7d6648dd227b3f852b4ebb5',
    direita:  'c1c3ba0100e3315569a4ed75cd5ee6922d7150d4',
    superior: 'f93ce3228aa430bde1858891eae64b78c957b781',
    inferior: 'c266a6bab1277efdac43ecea9171efb60961ed47',
  },
  // titulo/informacoes: SEM key mobile (lacuna real da lib) — typeKeys
  // undefined, _tryImportA11yAgrupamento cai no dicionário desktop.
};

const A11Y_CONECTOR_LINHA_KEYS_MOBILE = {
  elemento: {
    esquerda: '8e397918ad10aeb63b2e747d2834c8105a0aa1d1',
    direita:  '90bbec6996ca447f3594497f0a35854544de3021',
    superior: 'a6c7e7dab90b9b23a06b072331c246fd4392b749',
    inferior: '978a6433237eefdf540d82bcba40e74e39aeecba',
    desativado: '4c060718da4b3350ee5f290742a3a6cd1db23618',
  },
  titulo: {
    esquerda: 'd9d79daa2318b2b6758376123899a40329222b48',
    direita:  'b52cb9d60f6ca81eaf82492d4b110b105bc76305',
    superior: '1bd8c85dbdc47d3bef93ac9b71ad5f6d875d810b',
    inferior: '66c4100b5d1b1432ebeb3e9202fca08d173a02be',
    desativado: '966f90f2fc56afdb7e2b8025ba83b48a9622a698',
  },
  decorativo: {
    esquerda: '2709c008c084daaba24063ccf42da4a8c1db0745',
    direita:  '1865f8ed37ac6a33cccbcd874f02238c39b0ff39',
    superior: '06c9ac2cae9926e57456ddad6eda7a70ffc9bca0',
    inferior: '638d682d97a2f82bc35cbb76ae9f6b05132a7176',
    desativado: '4f478e385d22c92b1df3b53883a9a97abe61be6f',
  },
  // estrutura/informacoes: SEM key mobile (lacuna real da lib) — typeKeys
  // undefined, _tryImportA11yConectorLinha cai no dicionário desktop.
};

// "[a11y mob] Número da tela" — usado SÓ pro selo de ÁREA MARCADA (ver
// handler create-a11y-area). Desenha um Connector visual (traço) por
// direção, igual "[a11y] Item Number" no desktop — confirmado via REST API
// (children da variante incluem um RECTANGLE "Connector" em toda direção
// exceto "desativado"). Item de tabulação mobile usa A11Y_TAB_ORDER_ITEM_KEY
// _MOBILE (abaixo), componente diferente e sem conector.
const A11Y_ITEM_NUMBER_KEYS_MOBILE = {
  superior:   '8165d5888c8a03c7affb955a9b5364cec563ee63',
  inferior:   '4b03dd0857a71158da36bab09707538ecf047620',
  esquerda:   'aebd2221d0238799706e54521cccd7bcee24733d',
  direita:    'f7977c26c71f36e05bf2b92e645ecd1d1491d458',
  desativado: 'd88850d40989bbd99cdc98b29a1f2cc516278699',
};

// "[a11y mob] Ordenação" (variante tamanho=pequeno) — selo de ITEM dentro da
// Ordem de Tabulação no mobile. Confirmado via REST API (fileKey
// 3zdtN13YvPlCGPdXeL0Y2i, node 5222:4270): só tem properties "tamanho"
// (grande/pequeno) e "número" — SEM variante de direção/conector, porque a
// posição do selo já é resolvida por x/y absoluto em _createTabOrderBadge
// (a lib não desenha conector pra esse caso, diferente de "Número da tela").
// Não tem equivalente separado no desktop — lá "[a11y] Item Number" é o
// único componente e é reaproveitado também pro selo de Área (mesmas keys
// de A11Y_AREA_CONECTOR_KEYS), assimetria real entre as duas libs.
const A11Y_TAB_ORDER_ITEM_KEY_MOBILE = 'a7b50306053bb1a4fb834f26c432dc7613ef9b13';

const _A11Y_SIDE_TO_ORIENTACAO = { left: 'esquerda', right: 'direita', top: 'superior', bottom: 'inferior' };

// Tenta importar o marcador real (ver A11Y_AGRUPAMENTO_KEYS[_MOBILE]) em vez
// de desenhar o contorno tracejado + chip procedural. Lança em qualquer ponto
// de incerteza — quem chama trata a exceção como "cai no marcador desenhado".
// opts.a11yOrigin ('web'|'mobile', propagado desde a criação da spec no
// frontend) escolhe o dicionário mobile quando disponível; se a categoria ou
// a orientação específica não existir nele (lacuna real da lib mobile — ver
// comentário acima de A11Y_AGRUPAMENTO_KEYS_MOBILE), cai pro dicionário
// desktop equivalente ANTES de lançar erro.
async function _tryImportA11yAgrupamento(opts) {
  const orientacao = _A11Y_SIDE_TO_ORIENTACAO[opts.guideSide || 'right'];
  const mobileTypeKeys = opts.a11yOrigin === 'mobile' ? A11Y_AGRUPAMENTO_KEYS_MOBILE[opts.a11yType] : null;
  const typeKeys = (mobileTypeKeys && mobileTypeKeys[orientacao]) ? mobileTypeKeys : A11Y_AGRUPAMENTO_KEYS[opts.a11yType];
  if (!typeKeys) throw new Error('a11y-agrupamento-tipo-desconhecido: ' + opts.a11yType);
  const key = typeKeys[orientacao];
  if (!key) throw new Error('a11y-agrupamento-orientacao-desconhecida: ' + orientacao);

  const component = await figma.importComponentByKeyAsync(key);
  const instance = component.createInstance();
  instance.name = 'Agrupamento';

  if (opts.letter) {
    try {
      instance.setProperties({ 'letra#3925:32': opts.letter });
    } catch (e) { /* best-effort — cai no workaround abaixo se for título */ }
  }

  // WORKAROUND — falha real confirmada na própria lib publicada: a variante
  // "tipo=nível de título" do component set "[a11y] Agrupamento" tem o TEXT
  // node "Number" com o texto "H" HARDCODED, sem vínculo com a property
  // "letra#3925:32" (as outras 4 categorias têm o vínculo correto). Bypassa
  // escrevendo `.characters` direto no node, com fallback por regex caso a
  // lib mude a estrutura interna no futuro.
  if (opts.letter && opts.a11yType === 'titulo') {
    try {
      const numberNode = instance.findOne(n => n.type === 'TEXT' && n.name === 'Number')
        || instance.findOne(n => n.type === 'TEXT' && /^H\d*$/.test(n.characters));
      if (numberNode) {
        await figma.loadFontAsync(numberNode.fontName);
        numberNode.characters = opts.letter;
      }
    } catch (e) { /* best-effort — selo fica com o texto padrão "H" da lib */ }
  }

  return instance;
}

// Keys publicadas do component set "tipo=<categoria>, conector=<direção>" —
// frame "Conectores  [Handoff]" do arquivo da lib (25 componentes = 5
// categorias × 5 direções, incluindo "desativado"). Direção "desativado"
// catalogada mas ainda não usada por _tryImportA11yConectorLinha — o modo
// Linha sempre nasce com uma direção real.
const A11Y_CONECTOR_LINHA_KEYS = {
  elemento: {
    esquerda: '9c1f1679ab73055ef68dbcbd11b89fc711629f6a',
    direita:  'eec4d7b2153d9eb6bc300787c861b8cfee10dcbf',
    superior: 'fcdb189d2cbdcda11488030e4d4c523d08d95865',
    inferior: '509491cd5e458ec0cf974b00390f8f65d078c326',
    desativado: 'eb12c7da71c1b661a72438ff4e27462ce798c07e',
  },
  estrutura: {
    esquerda: '13141fdadb7e8675d8a47ba70be1b6d24d4ed35c',
    direita:  '2621f5cdadea32e0802c8196aad03db1da20bf72',
    superior: '76d6ba85e4fed4a5d0bd67c709860877fe236d2f',
    inferior: '3021c901640ffb86e8228dd12bd730ee3f770ebb',
    desativado: '63e22dc70dde84d0aa43c1592388751e6bb8c44e',
  },
  titulo: {
    esquerda: '670c7c055ed7ebc01a523add5b69499680076419',
    direita:  'f63a82ad250bcc8569d83affbcc39d6f226d64ca',
    superior: 'baf0b4ea8417911a42f7d890654ad8dc3d047881',
    inferior: '3dafdf7d0543989b82c25686abb88134c879a94c',
    desativado: 'ba1aa8640e1593f93ed1e0ee03cd59ed4ff54ae8',
  },
  decorativo: {
    esquerda: '4866349b6246fbd45cf493cce308f7da2c312569',
    direita:  '85ff209c592f55cc2149b256909ac65e2e06a66b',
    superior: 'ad87c4797c992bfaadbb41d8d05e9c81fc4207c2',
    inferior: 'a419476ffe6c0b6c10a32c080d624091cf083171',
    desativado: '08ec11bff941a75a75bbe248b822da7715140da7',
  },
  informacoes: {
    esquerda: 'edb9fed9e58a7bf279d8804014f8755ffc4e711d',
    direita:  'ceff0c518ef33fc326eec74af0320255a6ba53a8',
    superior: 'f8dcedebd882a13e26659b1a614adf16166b996d',
    inferior: 'c2ef79c032a76ffefcb0a8b3123bf91ff2c8a221',
    desativado: 'cef964a1a1bfa7ea3d0e4d24d005d3a669ca56b2',
  },
};

// Tenta importar o conector-linha real (ver A11Y_CONECTOR_LINHA_KEYS[_MOBILE])
// em vez de desenhar o vetor procedural (linha tracejada + dots). Lança em
// qualquer ponto de incerteza — quem chama trata a exceção como "cai no vetor
// desenhado". Mesmo fallback mobile→desktop de _tryImportA11yAgrupamento: a
// lib mobile só cobre "elementos e imagens"/"títulos"/"decorativo" no modo
// Linha (falta estrutura/informacoes) — se a categoria ou a orientação
// específica não existir no dicionário mobile, cai pro desktop ANTES de
// lançar erro.
async function _tryImportA11yConectorLinha(opts) {
  const orientacao = _A11Y_SIDE_TO_ORIENTACAO[opts.guideSide || 'right'];
  const mobileTypeKeys = opts.a11yOrigin === 'mobile' ? A11Y_CONECTOR_LINHA_KEYS_MOBILE[opts.a11yType] : null;
  const typeKeys = (mobileTypeKeys && mobileTypeKeys[orientacao]) ? mobileTypeKeys : A11Y_CONECTOR_LINHA_KEYS[opts.a11yType];
  if (!typeKeys) throw new Error('a11y-conector-linha-tipo-desconhecido: ' + opts.a11yType);
  const key = typeKeys[orientacao];
  if (!key) throw new Error('a11y-conector-linha-orientacao-desconhecida: ' + orientacao);

  const component = await figma.importComponentByKeyAsync(key);
  const instance = component.createInstance();
  instance.name = 'Conector';

  // "[a11y] Conectores" tem DUAS properties de texto separadas: "letra"
  // (tags A/B/A1...) e "nível de título" (H1/H2/H3...) — Título usa a
  // segunda, as demais categorias usam a primeira.
  if (opts.letter) {
    const propKey = opts.a11yType === 'titulo' ? 'nível de título#6411:2' : 'letra#3925:6';
    try {
      instance.setProperties({ [propKey]: opts.letter });
    } catch (e) { /* best-effort — nunca bloqueia a criação da spec */ }
  }

  return instance;
}

// ============================================================
// Organização de canvas
// ============================================================

// Todo nó criado pelo hac é agrupado dentro de uma SECTION na página, em
// vez de ficar solto ao nível da página. Section (não Frame) porque não
// recorta conteúdo que ultrapasse seus limites — as specs continuam
// espalhadas pela tela perto de cada elemento documentado, a Section só as
// organiza no painel de Layers. Duas Sections distintas, cada uma com seu
// próprio propósito no painel de Layers: uma para specs de acessibilidade
// (áreas marcadas + tags), outra para as cópias de frame da Ordem de
// Tabulação — mantê-las separadas evita que dezenas de selos/conectores de
// spec se misturem visualmente, no Layers, com cópias inteiras de tela.
const A11Y_SECTION_NAME = 'hac — Especificações de Acessibilidade';
const A11Y_TAB_ORDER_SECTION_NAME = 'hac — Ordem de Tabulação';
// Section própria para as trilhas de Swipe (linha direcional com N pontos)
// — nunca compartilha a Section de Ordem de Tabulação, mesmo quando os dois
// artefatos existem para a MESMA área: são conceitos independentes (uma é
// sequência de foco DENTRO da área, a outra é uma trilha de navegação por
// gesto que pode atravessar vários pontos/áreas), ver bloco "Trilha de
// Swipe" mais abaixo. 3ª reformulação (2026-09-04): a constante mantém o
// nome (só o VALOR mudou, de "Fluxos" pra "Trilhas") pra não duplicar todo
// o código que já a referencia.
const A11Y_SWIPE_FLOW_SECTION_NAME = 'hac — Trilhas de Swipe';

// Identifica qualquer node que seja artefato do PRÓPRIO hac — a Section
// organizadora (specs ou Ordem de Tabulação, qualquer versão/sufixo) ou
// qualquer node marcado com hacCategory (selos, conectores, cópias de área)
// já reparentado dentro delas. Usado pra recusar esses nodes como seleção
// válida de "Marcar Área"/scan — sem essa checagem, uma seleção "presa" na
// Section (ex.: o selo recém-criado, que create-a11y-area seleciona ao
// final, ainda ativo se o próximo clique do designer for mal direcionado)
// virava uma nova Área apontando pra própria Section, e reescanear essa
// Área redetectava as specs já existentes como se fossem componentes novos
// do design (bug real, 2026-09-03).
function _isHacOwnedNode(node) {
  if (!node) return false;
  if (node.type === 'SECTION' && typeof node.name === 'string' &&
    (node.name === A11Y_SECTION_NAME || node.name.startsWith(A11Y_SECTION_NAME + ' v') ||
      node.name === A11Y_TAB_ORDER_SECTION_NAME || node.name.startsWith(A11Y_TAB_ORDER_SECTION_NAME + ' v') ||
      node.name === A11Y_SWIPE_FLOW_SECTION_NAME || node.name.startsWith(A11Y_SWIPE_FLOW_SECTION_NAME + ' v'))) {
    return true;
  }
  try {
    // Checagem por pluginData além dos prefixos de nome acima: a Section de
    // sessão (_getOrCreateA11ySessionSection) tem nome VARIÁVEL (timestamp +
    // designer), então nenhum prefixo literal a reconheceria. De quebra
    // resolve o bug latente da Section de Ficha de Handoff, que nunca
    // constou da lista de prefixos e por isso nunca era reconhecida como
    // artefato do hac.
    if (node.getPluginData && node.getPluginData('hacSessionSection') === 'true') return true;
    if (node.getPluginData && node.getPluginData('hacCategory')) return true;
  } catch (e) { }
  return false;
}

// Extrai o sufixo de versão (" v2", " v3"...) de um nome de Section de specs
// ativo — "" quando sectionName é o nome fixo original (ou vazio/ausente,
// arquivo sem activeSectionName definido ainda). Usado por
// _getOrCreateTabOrderSection pra aplicar o MESMO sufixo à Section de Ordem
// de Tabulação da mesma geração de documentação.
function _extractA11ySectionVersionSuffix(sectionName) {
  if (!sectionName || sectionName === A11Y_SECTION_NAME) return '';
  const m = sectionName.match(new RegExp('^' + A11Y_SECTION_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( v\\d+)$'));
  return m ? m[1] : '';
}

// Varre a página por Sections de specs já existentes com o prefixo base
// (A11Y_SECTION_NAME) e devolve o próximo nome versionado livre — sem
// sufixo = v1 implícito (a Section original, de sempre); a primeira nova
// geração recebe " v2", a próxima " v3", etc. Usada pelo handler
// get-a11y-documentation-status ao abrir "Marcar Área" com documentação já
// existente no arquivo.
function _computeNextA11ySectionName() {
  let maxVersion = 1;
  for (const n of figma.currentPage.children) {
    if (n.type !== 'SECTION') continue;
    if (n.name === A11Y_SECTION_NAME) {
      maxVersion = Math.max(maxVersion, 1);
      continue;
    }
    const m = n.name.match(new RegExp('^' + A11Y_SECTION_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' v(\\d+)$'));
    if (m) maxVersion = Math.max(maxVersion, parseInt(m[1], 10));
  }
  return `${A11Y_SECTION_NAME} v${maxVersion + 1}`;
}

// legacyName (opcional, 2026-09-09): usado só pela Section-mãe da Ficha
// (renomeada de "hac — Ficha de Handoff" pra "hac — Handoff Completo",
// pedido de produto) — arquivos já existentes têm essa Section gravada no
// canvas com o nome ANTIGO; sem aceitar os dois nomes na busca, ela nunca
// seria reencontrada, e a próxima inserção criaria uma Section NOVA
// duplicada, deixando a antiga (com todo o trabalho já documentado) órfã.
// Migração puramente aditiva: nunca renomeia a Section antiga em si, só a
// reconhece — decisão do usuário, evitar qualquer rename in-place por ora.
function _getOrCreateNamedSection(sectionName, legacyName) {
  let section = figma.currentPage.children.find(
    n => n.type === 'SECTION' && (n.name === sectionName || (legacyName && n.name === legacyName))
  );
  if (!section) {
    section = figma.createSection();
    section.name = sectionName;
    section.x = 0;
    section.y = 0;
    section.resizeWithoutConstraints(200, 200);
  }
  // A Section nasce no topo da pilha de figma.currentPage.children (padrão
  // de figma.create*()), mas isso só vale no instante da criação — depois
  // disso o design original pode subir acima dela (novo frame colado,
  // reordenação manual no painel de Layers, duplicar tela etc.), e todo
  // marcador visual (contorno, conector, selo de Área/Ordem de Tabulação)
  // que vive dentro da Section passaria a ficar ATRÁS do elemento escaneado.
  // Reforça o topo aqui — no único ponto de acesso à Section — para que
  // qualquer chamador (spec nova, Área nova, cópia de Ordem de Tabulação,
  // cálculo de bounds ocupados) sempre a encontre por cima do restante do
  // canvas.
  const _lastIndex = figma.currentPage.children.length - 1;
  if (figma.currentPage.children.indexOf(section) !== _lastIndex) {
    figma.currentPage.appendChild(section);
  }
  return section;
}

function _getOrCreateA11ySection(sectionName) {
  return _getOrCreateNamedSection(sectionName || A11Y_SECTION_NAME);
}

// Section ÚNICA por página, container de toda a documentação criada nesta
// sessão de trabalho. Identificada SÓ por pluginData ('hacSessionSection'),
// nunca por nome: o nome carrega timestamp + designer logado e muda a cada
// sessão, então buscar por nome criaria uma Section nova a cada Área
// marcada. O timestamp é gravado uma vez, na criação, e nunca mais muda —
// não é o mecanismo de versionamento de
// _computeNextA11ySectionName/_extractA11ySectionVersionSuffix, que
// permanece reservado ao propósito original (versionar uma nova geração
// completa de documentação).
function _getOrCreateA11ySessionSection(designerName) {
  let section = null;
  for (const n of figma.currentPage.children) {
    if (n.type !== 'SECTION') continue;
    try {
      if (n.getPluginData && n.getPluginData('hacSessionSection') === 'true') {
        section = n;
        break;
      }
    } catch (e) { }
  }
  if (!section) {
    section = figma.createSection();
    const _now = new Date();
    const _pad = (v) => String(v).padStart(2, '0');
    const _timestamp = `${_pad(_now.getDate())}/${_pad(_now.getMonth() + 1)}/${_now.getFullYear()} ${_pad(_now.getHours())}:${_pad(_now.getMinutes())}`;
    section.name = `hac - Especificações de Acessibilidade - ${_timestamp} - ${designerName || 'Designer não identificado'}`;
    section.setPluginData('hacSessionSection', 'true');
    section.x = 0;
    section.y = 0;
    section.resizeWithoutConstraints(200, 200);
  }
  // Mesmo reforço de topo de pilha de _getOrCreateNamedSection — ver o
  // comentário longo lá: sem isso, todo marcador visual dentro da Section
  // acaba atrás do design original assim que um frame novo sobe acima dela.
  const _lastIndex = figma.currentPage.children.length - 1;
  if (figma.currentPage.children.indexOf(section) !== _lastIndex) {
    figma.currentPage.appendChild(section);
  }
  return section;
}

// area.id É o GROUP da Área desde 2026-09-05 (create-a11y-area envolve o
// selo num GROUP e devolve o id DELE) — resolver o grupo é só resolver o id.
// Áreas criadas ANTES dessa mudança devolvem a INSTANCE solta do selo, que
// não aceita filhos: quem chama trata null/não-grupo caindo no caminho
// antigo (Section por tipo de artefato).
async function _getA11yAreaGroupNode(areaId) {
  if (!areaId) return null;
  try {
    const node = await figma.getNodeByIdAsync(areaId);
    if (!node || node.removed) return null;
    if (node.type !== 'GROUP') return null;
    return node;
  } catch (e) {
    return null;
  }
}

// Ordem de Tabulação segue o mesmo nome versionado da Section de specs
// (mesmo sufixo " v2"/" v3"), só trocando o prefixo — mantém as duas
// Sections de uma mesma geração de documentação juntas e coerentes. Quando
// sectionName é o nome fixo original (ou omitido), o resultado é
// A11Y_TAB_ORDER_SECTION_NAME de sempre, sem mudança de comportamento.
function _getOrCreateTabOrderSection(sectionName) {
  const suffix = _extractA11ySectionVersionSuffix(sectionName);
  return _getOrCreateNamedSection(A11Y_TAB_ORDER_SECTION_NAME + suffix);
}

// Espelha _getOrCreateTabOrderSection pra Trilha de Swipe (2026-09-04-ac).
function _getOrCreateSwipePathSection(sectionName) {
  const suffix = _extractA11ySectionVersionSuffix(sectionName);
  return _getOrCreateNamedSection(A11Y_SWIPE_FLOW_SECTION_NAME + suffix);
}

// Reparenta `node` (hoje filho direto de figma.currentPage, com x/y já
// absolutos da página) para dentro da Section organizadora informada,
// preservando a posição visual. Section só existe como filha direta da
// página (sem transform próprio além de x/y), então x/y do nó relativo à
// Section = x/y absolutos atuais − x/y da Section. Best-effort: qualquer
// falha aqui não deve invalidar a spec/área/cópia já criada normalmente na
// página.
function _reparentIntoSection(node, getSection) {
  try {
    const _origX = node.x;
    const _origY = node.y;
    const section = getSection();
    section.appendChild(node);
    node.x = Math.round(_origX - section.x);
    node.y = Math.round(_origY - section.y);
  } catch (e) {
    // organização é só cosmética — a spec/área/cópia segue existindo
    // normalmente na página — mas loga sempre: um reparenting falhando em
    // silêncio deixa specs/áreas/cópias inteiras soltas fora da Section sem
    // nenhum rastro (bug real, 2026-09-03).
    console.error('[hac] _reparentIntoSection: falhou, node ficou solto na página.', e && e.message);
  }
}

// Reparenta um artefato (spec, cópia de Tabulação/Swipe, linha de Swipe,
// Ficha) pra dentro do GROUP da Área que o originou, preservando a posição
// visual. Diferente de _reparentIntoSection, aqui NÃO dá pra subtrair o x/y
// do novo pai: o Grupo da Área vive dentro da Section de sessão, e GROUP
// não estabelece sistema de coordenadas próprio (os filhos herdam o do
// container acima dele) — subtrair o bounding box do Grupo jogaria o
// artefato pra longe. Corrige pela DIFERENÇA observada no
// absoluteBoundingBox antes/depois do appendChild, que é a única medida
// robusta contra qualquer profundidade/tipo de aninhamento. Best-effort,
// mesmo espírito de _reparentIntoSection: organização é cosmética, o
// artefato segue existindo se o reparenting falhar.
function _reparentIntoAreaGroup(node, areaGroupNode) {
  try {
    const _beforeBB = node.absoluteBoundingBox;
    areaGroupNode.appendChild(node);
    const _afterBB = node.absoluteBoundingBox;
    if (_beforeBB && _afterBB) {
      node.x = Math.round(node.x + (_beforeBB.x - _afterBB.x));
      node.y = Math.round(node.y + (_beforeBB.y - _afterBB.y));
    }
  } catch (e) {
    console.error('[hac] _reparentIntoAreaGroup: falhou, node ficou solto na página.', e && e.message);
  }
}

// Reparentar DENTRO do clone (Tabulação/Swipe) foi tentado em 5 rodadas de
// correção nesta sessão (2026-09-08) — cada uma resolveu um bug real
// (mistura de sistema de coordenadas, Auto Layout com sizing HUG alterando
// o pai antes da leitura, layoutPositioning setado tarde demais, e por fim
// itemReverseZIndex invertendo o z-order de frames com Auto Layout), mas a
// causa raiz definitiva era estrutural: `clipsContent` em algum frame no
// caminho entre o clone-raiz e o artefato recorta qualquer filho que
// "vaze" pra fora dos limites daquele frame — e um selo ao lado de um
// elemento pequeno, ou uma linha de swipe cruzando a tela toda, vazam de
// propósito. Abandonado em favor de _getOrCreateCloneOverlayGroup (grupo
// IRMÃO do clone, nunca dentro dele — GROUP nunca tem clipsContent nem
// Auto Layout, estruturalmente imune a todos os bugs das 5 rodadas
// anteriores de uma vez). Ver essa função para a solução atual.

// Migração defensiva (2026-09-09): entre a introdução de
// _getOrCreateCloneOverlayGroup e a rodada anterior (_reparentIntoCloneAbsolute,
// ver comentário acima), o overlay de artefatos chegou a nascer AGRUPADO
// DENTRO do próprio clone, não irmão dele — bug já corrigido na lógica de
// criação, mas sem migração retroativa: qualquer Área cuja Ordem de
// Tabulação/Swipe/Leitor já existia ANTES dessa correção carrega esse
// overlay legado até hoje, aninhado dentro do clone. Isso só apareceu como
// sintoma visível quando "Inserir/Atualizar na Ficha" passou a MOVER
// (appendChild) a réplica de trabalho já existente pra dentro da Section
// da Ficha (2026-09-09) — o move leva o clone inteiro, incluindo esse
// overlay legado agarrado por dentro, resultando no grupo de selos
// aparecendo como FILHO do clone no painel de camadas em vez de IRMÃO.
// Busca recursiva (profundidade limitada não é necessária — árvores de
// tela raramente passam de poucas dezenas de níveis) por um GROUP marcado
// com `pluginDataKey` apontando pro id do PRÓPRIO clone (mesma marca que
// _getOrCreateCloneOverlayGroup sempre usou, legado ou não) em qualquer
// profundidade dentro dele. Se achar, resgata pra fora: appendChild no
// `newParent` (pai do clone no destino final), compensando x/y pela
// diferença de bounding box (mesmo princípio de _reparentIntoAreaGroup,
// robusto contra qualquer profundidade de aninhamento removida).
// Idempotente: clones já corrigidos (overlay nasceu/já vive como irmão)
// não têm nada pra achar aqui e a função não faz nada.
function _rescueLegacyOverlayNestedInsideClone(clone, newParent, pluginDataKey) {
  let legacyOverlay = null;
  (function walk(node) {
    if (legacyOverlay || !node || !Array.isArray(node.children)) return;
    for (const child of node.children) {
      if (legacyOverlay) return;
      try {
        if (child.type === 'GROUP' && child.getPluginData &&
          child.getPluginData(pluginDataKey) === clone.id && !child.removed) {
          legacyOverlay = child;
          return;
        }
      } catch (e) { }
      walk(child);
    }
  })(clone);

  if (!legacyOverlay) return null;

  try {
    _reparentIntoAreaGroup(legacyOverlay, newParent);
  } catch (e) {
    console.error('[hac] _rescueLegacyOverlayNestedInsideClone: falhou ao resgatar overlay legado, mantendo aninhado.', e && e.message);
    return null;
  }
  return legacyOverlay;
}

// Resolve (ou cria) um GRUPO de overlay pra artefatos desenhados "sobre"
// um clone (selos de Ordem de Tabulação, linha de Trilha de Swipe) — vive
// IRMÃO do clone (mesmo pai — o Grupo da Área, ou figma.currentPage antes
// do primeiro reparenting), nunca dentro dele.
//
// Bug real corrigido (2026-09-08, 6ª rodada): mesmo com o clone virando
// FRAME (detachInstance) e o z-order corrigido (itemReverseZIndex),
// artefatos desenhados DENTRO do clone continuavam sumindo — a causa real
// é `clipsContent`: qualquer frame no caminho entre o clone-raiz e o
// artefato (o próprio clone-raiz, ou um frame intermediário dele) pode ter
// clipsContent=true, recortando visualmente qualquer filho posicionado
// fora dos limites daquele frame — incluindo um selo ABSOLUTE que nasce
// intencionalmente "vazando" pra fora de um botão pequeno, pra ficar
// visível ao lado dele, ou uma linha de swipe que cruza toda a tela.
// Diferente do bug de z-order (resolvido com insertChild/
// itemReverseZIndex), aqui a solução não pode ser "ficar dentro do clone
// de outro jeito" — precisa estar FORA da árvore com clip. Tirar o clip do
// clone foi descartado de propósito (mudaria a aparência da própria
// réplica — telas com carrossel/scroll dependem do clip pra ficar fiel ao
// design original).
//
// Grupo simples (GROUP, nunca FRAME) porque GROUP nunca tem clipsContent
// nem layoutMode — é estruturalmente imune a este bug, sem precisar setar/
// lembrar de desligar nenhuma propriedade. Fica marcado com o pluginData
// `pluginDataKey` informado, apontando pro id do clone, pra ser encontrado
// de novo em chamadas seguintes sem recriar toda vez. `namePrefix` e
// `pluginDataKey` diferem por chamador (selos de Tabulação vs. linha de
// Swipe) — cada um com seu próprio grupo-overlay, nunca compartilhado,
// mesmo quando os dois clones (Tabulação/Swipe) são o mesmo frame original.
function _getOrCreateCloneOverlayGroup(clone, pluginDataKey, namePrefix) {
  const cloneParent = clone.parent;
  if (cloneParent && Array.isArray(cloneParent.children)) {
    for (const sibling of cloneParent.children) {
      try {
        if (sibling.type === 'GROUP' && sibling.getPluginData &&
          sibling.getPluginData(pluginDataKey) === clone.id &&
          !sibling.removed) {
          _setCloneOverlayGroupAbsolutePositioning(sibling);
          return sibling;
        }
      } catch (e) { }
    }
  }

  // Dado legado (ver _rescueLegacyOverlayNestedInsideClone): antes de
  // assumir "não existe" e criar um overlay novo do zero, confirma que não
  // há um overlay antigo AGARRADO por dentro do clone — sem isso, cada
  // clone legado acabaria com dois grupos de artefatos coexistindo (o
  // velho, aninhado e nunca mais alcançado por nenhuma varredura por
  // irmão; um novo, vazio, criado aqui do lado de fora), perdendo os
  // selos/trilha já desenhados no velho.
  if (cloneParent) {
    const rescued = _rescueLegacyOverlayNestedInsideClone(clone, cloneParent, pluginDataKey);
    if (rescued) {
      rescued.name = `${namePrefix} ${clone.name}`;
      _setCloneOverlayGroupAbsolutePositioning(rescued);
      return rescued;
    }
  }

  // figma.group() exige pelo menos 1 node — cria com um retângulo
  // "seed" na mesma posição do clone, que fica DENTRO do grupo
  // PERMANENTEMENTE (visible=false, sem fill/stroke, nunca removido).
  // Bug real corrigido (2026-09-08, 7ª rodada): a versão anterior removia
  // o seed logo após criar o grupo — mas um GROUP no Figma não pode ficar
  // vazio: perder o ÚLTIMO filho faz o Figma apagar o grupo inteiro
  // automaticamente. O overlay sumia no mesmo instante em que era criado,
  // antes de qualquer selo/linha entrar nele — a variável `overlayGroup`
  // continuava "existindo" do lado do JavaScript, mas o node por trás dela
  // já tinha sido coletado. Cada reparenting seguinte
  // (`_reparentIntoAreaGroup`) operava contra um grupo fantasma: o
  // appendChild ou falhava silenciosamente (caindo no fallback pro Grupo
  // da Área, que já não existe mais no modelo atual) ou criava
  // implicitamente algo fora do controle desta função — em qualquer caso,
  // o selo acabava solto na página. Manter o seed oculto resolve de vez:
  // o grupo nunca fica vazio, então nunca é coletado pelo Figma.
  const seed = figma.createRectangle();
  seed.name = 'seed (não remover — mantém o grupo vivo)';
  seed.resize(1, 1);
  seed.x = clone.x;
  seed.y = clone.y;
  seed.fills = [];
  seed.strokes = [];
  seed.visible = false;
  seed.locked = true;
  (cloneParent || figma.currentPage).appendChild(seed);

  const overlayGroup = figma.group([seed], cloneParent || figma.currentPage);
  overlayGroup.name = `${namePrefix} ${clone.name}`;
  overlayGroup.locked = false;
  overlayGroup.setPluginData('hacCategory', 'a11y');
  overlayGroup.setPluginData(pluginDataKey, clone.id);

  // Sempre logo ACIMA do clone na pilha de filhos do pai comum — garante
  // que o overlay fique visualmente por cima do clone inteiro (grupo sem
  // Auto Layout/clip, então esta ordem de índice já basta, sem depender de
  // itemReverseZIndex nenhum aqui).
  if (cloneParent && typeof cloneParent.insertChild === 'function') {
    try {
      const cloneIndex = cloneParent.children.indexOf(clone);
      cloneParent.insertChild(cloneIndex + 1, overlayGroup);
    } catch (e) { /* ordem cosmética — grupo já existe e já está correto por baixo */ }
  }

  _setCloneOverlayGroupAbsolutePositioning(overlayGroup);

  return overlayGroup;
}

// Bug real corrigido (2026-09-08, 8ª rodada): a Ficha de Handoff é o
// PRIMEIRO lugar onde um clone (e portanto o grupo-overlay irmão dele)
// passa a viver dentro de um pai com Auto Layout (a seção horizontal da
// Ficha) — em todo outro caso (Ordem de Tabulação/Swipe no canvas de
// trabalho) o clone sempre viveu solto numa Section comum, sem Auto
// Layout, então o overlayGroup nunca precisou disso antes. Sem forçar
// layoutPositioning = ABSOLUTE, o overlayGroup participa do FLUXO do Auto
// Layout como mais um filho: nasce do tamanho do seed (1x1), mas assim que
// a trilha de swipe (ou qualquer artefato com coordenadas absolutas
// distantes, vindas do canvas original) é reparentada pra dentro dele, o
// grupo cresce pra cobrir a distância inteira até essas coordenadas —
// esticando a seção inteira (visto em produção: bloco de ~7081px de
// largura) e empurrando/distorcendo visualmente as próximas seções, no
// lugar de ficar ao lado do clone como as outras 2 réplicas. Mesmo ajuste
// já usado no badge de Tabulação em fallback (linha ~4403), generalizado
// aqui pra qualquer overlay, novo ou reaproveitado de uma chamada anterior.
function _setCloneOverlayGroupAbsolutePositioning(overlayGroup) {
  try {
    if ('layoutPositioning' in overlayGroup && overlayGroup.parent &&
      'layoutMode' in overlayGroup.parent && overlayGroup.parent.layoutMode !== 'NONE') {
      overlayGroup.layoutPositioning = 'ABSOLUTE';
    }
  } catch (e) { }
}

// Move a réplica de trabalho JÁ EXISTENTE de uma área (clone + seu grupo-
// overlay de artefatos, ex. selos de Tabulação ou a linha de Swipe) pra
// dentro de uma seção da Ficha — em vez de clonar de novo a partir do
// frame original (decisão de produto, 2026-09-09: "não precisamos da
// réplica da réplica", 1 réplica por tipo por área, editada
// incrementalmente onde quer que esteja). `pluginDataKey` é a mesma chave
// de pluginData usada por _getOrCreateCloneOverlayGroup pra este tipo
// (ex. 'hacTabOrderBadgesGroupForClone') — precisa achar o overlay ATUAL
// do clone (no pai ANTIGO, antes de mover) e movê-lo junto, na mesma
// operação: se o clone fosse movido primeiro e só depois
// _getOrCreateCloneOverlayGroup fosse chamada, ela procuraria (e não
// acharia) o overlay no NOVO pai, criando um segundo overlay vazio e
// deixando os selos/trilha já desenhados órfãos no overlay antigo.
// Idempotente: se o clone já está dentro de UM frame de Ficha (mesmo
// destino ou outro), não reparenta de novo — só devolve a referência.
async function _moveActiveCloneIntoFichaSection(clone, targetSection, pluginDataKey) {
  // Já dentro de algum frame de Ficha (ex.: "Atualizar" chamado de novo
  // depois de já ter movido numa entrega anterior) — idempotente.
  let ancestor = clone.parent;
  while (ancestor) {
    try {
      if (ancestor.getPluginData && ancestor.getPluginData('hacFichaForArea')) {
        return; // já vive dentro de uma Ficha, nada a mover.
      }
    } catch (e) { }
    ancestor = ancestor.parent;
  }

  const oldParent = clone.parent;
  let overlayGroup = null;
  if (oldParent && Array.isArray(oldParent.children)) {
    for (const sibling of oldParent.children) {
      try {
        if (sibling.type === 'GROUP' && sibling.getPluginData &&
          sibling.getPluginData(pluginDataKey) === clone.id && !sibling.removed) {
          overlayGroup = sibling;
          break;
        }
      } catch (e) { }
    }
  }

  // Dado legado (ver _rescueLegacyOverlayNestedInsideClone): Áreas
  // documentadas ANTES da correção que introduziu o overlay-irmão (2026-
  // 09-08/09) podem ter o grupo de selos/trilha AGARRADO por dentro do
  // clone em vez de irmão dele — a busca acima nunca encontra esse caso
  // (só olha irmãos), então sem este resgate o move abaixo levaria o
  // overlay legado junto, DENTRO do clone, pra dentro da Ficha (bug real
  // reportado: "[Selos de Tabulação] ... apareceu ANINHADO DENTRO do
  // clone" no painel de camadas). Resgata pra fora, como irmão do clone no
  // pai ATUAL (antes de mover), pra cair no mesmo caminho de código já
  // testado logo abaixo (appendChild pro destino final + correção de
  // layoutPositioning).
  if (!overlayGroup && oldParent) {
    overlayGroup = _rescueLegacyOverlayNestedInsideClone(clone, oldParent, pluginDataKey);
  }

  targetSection.appendChild(clone);
  if (overlayGroup) {
    targetSection.appendChild(overlayGroup);
    _setCloneOverlayGroupAbsolutePositioning(overlayGroup);
  }
}

// Destino padrão de todo artefato de uma Área: o Grupo dela. Áreas criadas
// antes de 2026-09-05 não têm Grupo (area.id é a INSTANCE solta do selo,
// que não aceita filhos) — nesses casos cai na Section por tipo de artefato
// que o chamador já usava, via fallbackReparent. Sem migração retroativa,
// por decisão de produto: arquivos já documentados continuam funcionando na
// estrutura antiga.
async function _reparentArtifactIntoArea(node, areaId, fallbackReparent) {
  const areaGroup = await _getA11yAreaGroupNode(areaId);
  if (areaGroup) {
    _reparentIntoAreaGroup(node, areaGroup);
    return;
  }
  if (typeof fallbackReparent === 'function') fallbackReparent();
}

function _reparentIntoA11ySection(node, sectionName) {
  _reparentIntoSection(node, () => _getOrCreateA11ySection(sectionName));
}

function _reparentIntoTabOrderSection(node, sectionName) {
  _reparentIntoSection(node, () => _getOrCreateTabOrderSection(sectionName));
}

// Espelha _reparentIntoTabOrderSection pra Trilha de Swipe (2026-09-04-ac)
// — a cópia clonada da Área passa a viver na MESMA Section que a linha
// final já usa hoje (A11Y_SWIPE_FLOW_SECTION_NAME).
function _reparentIntoSwipePathSection(node, sectionName) {
  _reparentIntoSection(node, () => _getOrCreateSwipePathSection(sectionName));
}

// Candidatas a "cópia de Ordem de Tabulação" hoje vivem dentro da Section
// dedicada (_getOrCreateTabOrderSection), mas também podem ser filhas
// diretas de figma.currentPage — cópias criadas ANTES desta Section existir
// (arquivos de produção já em uso) nunca foram migradas automaticamente pra
// dentro dela. Varre os dois níveis sempre, sem duplicar (uma cópia nunca é
// simultaneamente filha da página e da Section).
// Artefatos criados a partir de 2026-09-05 vivem DENTRO do Grupo da sua
// Área, que por sua vez vive dentro da Section de sessão — dois níveis
// abaixo da página. Toda busca por pluginData de artefato
// (hacTabOrderCopyForArea/hacSwipePathCopyForArea/hacFichaForArea) precisa
// varrer também esse nível, senão cópias/fichas da estrutura nova ficam
// invisíveis pra remoção/toggle/localização e vazam órfãs no canvas.
function _forEachA11ySessionAreaChild(fn) {
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION') continue;
    let isSessionSection = false;
    try {
      isSessionSection = !!(sibling.getPluginData && sibling.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (!isSessionSection) continue;
    for (const areaGroup of (sibling.children || [])) {
      if (areaGroup.type !== 'GROUP') continue;
      for (const child of (areaGroup.children || [])) fn(child);
    }
  }
}

// Nova fonte de varredura (2026-09-08, simplificação de hierarquia): a
// partir desta mudança, artefatos de uma Área (specs, clone de Tabulação,
// clone de Swipe, frame da Ficha) nascem SOLTOS direto na Section de
// sessão — irmãos do Grupo do selo, não mais aninhados dentro dele (ver
// _forEachA11ySessionAreaChild acima, que continua existindo só pra
// alcançar áreas documentadas ANTES desta mudança, na estrutura aninhada
// antiga). Varre os filhos DIRETOS da Section de sessão (1 nível) — soma
// a essa fonte antiga, nunca substitui (mesmo princípio já usado por todo
// o resto do código: nunca remover uma fonte de varredura quando surge
// uma estrutura nova, pra nunca deixar artefatos de qualquer geração
// órfãos/invisíveis).
function _forEachA11ySessionDirectChild(fn) {
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION') continue;
    let isSessionSection = false;
    try {
      isSessionSection = !!(sibling.getPluginData && sibling.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (!isSessionSection) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
}

function _forEachTabOrderCopyCandidate(fn) {
  for (const sibling of figma.currentPage.children) {
    if (sibling.type === 'SECTION') continue;
    fn(sibling);
  }
  _forEachA11ySessionAreaChild(fn);
  _forEachA11ySessionDirectChild(fn);
  // Varre TAMBÉM dentro de frames de Ficha já existentes (2026-09-09) — a
  // cópia de trabalho pode ter sido MOVIDA pra dentro da Ficha por um
  // "Inserir na ficha" anterior (ver comentário completo em
  // _forEachA11yFichaFrameChild). Sem isto, um cache-miss depois de mover
  // recriaria a cópia do zero, deixando a movida órfã dentro da Ficha.
  _forEachA11yFichaFrameChild(fn);
  // Varre TODAS as Sections de Ordem de Tabulação com o prefixo base,
  // qualquer sufixo de versão (v2, v3...) — não só o nome fixo sem versão.
  // A criação (_getOrCreateTabOrderSection) já aplica o sufixo da geração
  // ativa; buscar só o nome exato sem versão deixava cópias de qualquer
  // geração versionada permanentemente órfãs (nunca encontradas por
  // _removeExistingTabOrderCopiesForArea/_findTabOrderCopyForArea), o que
  // fazia clones antigos vazarem pra scans futuros como conteúdo "novo" do
  // design (bug real, 2026-09-03).
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION' || !sibling.name.startsWith(A11Y_TAB_ORDER_SECTION_NAME)) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
}

function _findTabOrderCopyForArea(areaId) {
  let found = null;
  _forEachTabOrderCopyCandidate(sibling => {
    if (found) return;
    try {
      if (sibling.getPluginData && sibling.getPluginData('hacTabOrderCopyForArea') === areaId) {
        found = sibling;
      }
    } catch (e) { }
  });
  return found;
}

// Bug real corrigido (2026-09-08, junto com a 6ª rodada de correção do
// z-order/clip dos selos): remover só o CLONE (por pluginData
// 'hacTabOrderCopyForArea') deixava o grupo-overlay de selos
// (_getOrCreateCloneOverlayGroup, marcado com 'hacTabOrderBadgesGroupForClone'
// apontando pro id do clone que acabou de ser removido) órfão no canvas —
// toda recriação da cópia de Tabulação da mesma área (start-tab-order-copy/
// generate-tab-order-from-layers) vazava um grupo de selos "fantasma" a
// mais. Varre a mesma lista de candidatos duas vezes: 1ª pra achar o(s)
// clone(s) e coletar seus ids ANTES de remover (o grupo overlay aponta pro
// id do clone, então precisa ser conhecido antes do clone sumir), 2ª pra
// remover clone(s) e overlay(s) junto.
function _removeExistingTabOrderCopiesForArea(areaId) {
  const cloneIdsToRemove = [];
  _forEachTabOrderCopyCandidate(sibling => {
    try {
      if (sibling.getPluginData && sibling.getPluginData('hacTabOrderCopyForArea') === areaId) {
        cloneIdsToRemove.push(sibling.id);
      }
    } catch (e) { }
  });
  _forEachTabOrderCopyCandidate(sibling => {
    try {
      const isClone = sibling.getPluginData && sibling.getPluginData('hacTabOrderCopyForArea') === areaId;
      const isOverlayOfRemovedClone = sibling.getPluginData &&
        cloneIdsToRemove.includes(sibling.getPluginData('hacTabOrderBadgesGroupForClone'));
      if (isClone || isOverlayOfRemovedClone) {
        sibling.remove();
      }
    } catch (e) { }
  });
}

// Família espelhada pra Trilha de Swipe (2026-09-04-ac) — mesmo raciocínio
// de _forEachTabOrderCopyCandidate/_findTabOrderCopyForArea/
// _removeExistingTabOrderCopiesForArea, trocando só o pluginData
// ('hacSwipePathCopyForArea') e a Section de destino
// (A11Y_SWIPE_FLOW_SECTION_NAME).
function _forEachSwipePathCopyCandidate(fn) {
  for (const sibling of figma.currentPage.children) {
    if (sibling.type === 'SECTION') continue;
    fn(sibling);
  }
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION' || !sibling.name.startsWith(A11Y_SWIPE_FLOW_SECTION_NAME)) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
  _forEachA11ySessionAreaChild(fn);
  _forEachA11ySessionDirectChild(fn);
  // Mesmo motivo de _forEachTabOrderCopyCandidate (2026-09-09) — a cópia de
  // Swipe pode ter sido MOVIDA pra dentro da Ficha.
  _forEachA11yFichaFrameChild(fn);
}

// Mesma correção de vazamento de _removeExistingTabOrderCopiesForArea
// (2026-09-08), espelhada pro grupo-overlay da linha de Swipe
// ('hacSwipePathGroupForClone').
function _removeExistingSwipePathCopiesForArea(areaId) {
  const cloneIdsToRemove = [];
  _forEachSwipePathCopyCandidate(sibling => {
    try {
      if (sibling.getPluginData && sibling.getPluginData('hacSwipePathCopyForArea') === areaId) {
        cloneIdsToRemove.push(sibling.id);
      }
    } catch (e) { }
  });
  _forEachSwipePathCopyCandidate(sibling => {
    try {
      const isClone = sibling.getPluginData && sibling.getPluginData('hacSwipePathCopyForArea') === areaId;
      const isOverlayOfRemovedClone = sibling.getPluginData &&
        cloneIdsToRemove.includes(sibling.getPluginData('hacSwipePathGroupForClone'));
      if (isClone || isOverlayOfRemovedClone) {
        sibling.remove();
      }
    } catch (e) { }
  });
}

// ============================================================
// Ficha de Handoff — Section/frame dedicados
// ============================================================
// Artefato de EXPORT (não é mais um pipeline de captura como Tabulação) —
// um frame por Área Marcada, dentro de Section própria, com 3 seções
// internas independentes (Tabulação/Swipe/Leitor de Tela) inseridas
// incrementalmente pelos 3 botões "Inserir/Atualizar ficha" das abas de
// trabalho. Desenha DO ZERO a partir dos itens/specs já persistidos —
// nunca clona a cópia rascunho de Tabulação/Swipe (destruída/recriada a
// cada "Gerar Automaticamente", ficaria órfã aqui) — sempre clona de novo o
// frame ORIGINAL da área (area.targetNodeId). Prefixo `_ficha`/`hacFicha*`
// em tudo (dado de canvas e funções) para não colidir com o pipeline de
// Tabulação/Swipe.
const A11Y_FICHA_SECTION_NAME = 'hac — Handoff Completo';
// Nome antigo (pré-2026-09-09) — arquivos já existentes têm Sections
// gravadas no canvas com este nome; ver comentário de
// _getOrCreateNamedSection (legacyName) para o porquê de manter esta
// constante em vez de só trocar o valor acima.
const A11Y_FICHA_SECTION_NAME_LEGACY = 'hac — Ficha de Handoff';

function _getOrCreateFichaSection(sectionName) {
  const suffix = _extractA11ySectionVersionSuffix(sectionName);
  return _getOrCreateNamedSection(A11Y_FICHA_SECTION_NAME + suffix, A11Y_FICHA_SECTION_NAME_LEGACY + suffix);
}

function _reparentIntoFichaSection(node, sectionName) {
  _reparentIntoSection(node, () => _getOrCreateFichaSection(sectionName));
}

// Mesmo padrão defensivo de _forEachTabOrderCopyCandidate/
// _forEachSwipeCopyCandidate: o frame da Ficha pode estar solto na página
// (nunca chegou a ser reparentado) ou já dentro de alguma Section de Ficha
// (qualquer geração/versão) — varre os dois níveis sempre.
function _forEachFichaFrameCandidate(fn) {
  for (const sibling of figma.currentPage.children) {
    if (sibling.type === 'SECTION') continue;
    fn(sibling);
  }
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION') continue;
    if (!sibling.name.startsWith(A11Y_FICHA_SECTION_NAME) && !sibling.name.startsWith(A11Y_FICHA_SECTION_NAME_LEGACY)) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
  _forEachA11ySessionAreaChild(fn);
  _forEachA11ySessionDirectChild(fn);
}

// Nova fonte de varredura (2026-09-09, decisão de produto): a partir
// desta mudança, "Inserir na ficha" passa a MOVER a réplica de trabalho
// já existente (com selos/trilha já desenhados) pra dentro do frame da
// Ficha, em vez de clonar de novo a partir do frame original — 1 réplica
// por tipo por área, nunca 2 ("não precisamos da réplica da réplica",
// palavras do usuário). Isso significa que a cópia ativa de uma área
// pode passar a viver 2 níveis dentro de um fichaFrame (fichaFrame →
// seção "Ficha — Tabulação/Swipe/Leitor" → clone + overlay) — nenhuma
// fonte de varredura existente descia até aqui (_forEachA11ySessionDirectChild
// só desce 1 nível a partir da Section de sessão, onde a cópia vivia
// ANTES de ser movida). Sem esta fonte, _resolveActiveTabOrderClone
// (e os pares de Swipe/Specs) não encontrariam mais a cópia já movida
// num cache-miss (plugin fechado/reaberto, por exemplo) e cairiam no
// fallback de recriar do zero — deixando a cópia movida órfã dentro da
// Ficha (nunca mais encontrada) e uma cópia NOVA solta fora dela,
// exatamente o sintoma que motivou esta mudança de modelo.
// Somada às fontes já existentes, nunca substituindo nenhuma (mesmo
// princípio de sempre usado em toda a base).
function _forEachA11yFichaFrameChild(fn) {
  _forEachFichaFrameCandidate(fichaFrame => {
    if (!fichaFrame || fichaFrame.type === 'SECTION' || !Array.isArray(fichaFrame.children)) return;
    for (const section of fichaFrame.children) {
      if (!section || !Array.isArray(section.children)) continue;
      for (const child of section.children) fn(child);
    }
  });
}

// Localiza o frame da Ficha de uma área — tenta primeiro o id salvo em
// hacData (mais rápido, sem varredura), cai pra busca por pluginData
// 'hacFichaForArea' se o id não resolver mais (frame apagado/movido
// manualmente do canvas, dado local "mentindo" — mesmo trade-off aceito
// pelo resto do hac com tabOrderItems/a11ySwipePaths).
async function _findFichaFrameForArea(areaId, savedFrameId) {
  if (savedFrameId) {
    try {
      const node = await figma.getNodeByIdAsync(savedFrameId);
      if (node && !node.removed) return node;
    } catch (e) { }
  }
  let found = null;
  _forEachFichaFrameCandidate(sibling => {
    if (found) return;
    try {
      if (sibling.getPluginData && sibling.getPluginData('hacFichaForArea') === areaId) {
        found = sibling;
      }
    } catch (e) { }
  });
  return found;
}

// Varre TODO conteúdo de topo de nível da página atual — não só o que o
// hac já colocou/referencia. Motivo: a réplica de Ordem de Tabulação não
// pode sobrepor NADA no canvas, inclusive telas/frames do designer que o
// hac nunca tocou (sem hacCategory, sem virar Área Marcada). Antes desta
// correção a varredura considerava só a Section organizadora + siblings
// com hacCategory 'a11y' + frames-raiz de Área Marcada via
// hacAreaTargetNodeId — qualquer outro conteúdo real do arquivo (outras
// telas, componentes soltos etc.) ficava invisível pro cálculo e podia
// ser coberto pela cópia. figma.currentPage.children só traz nodes de
// TOPO de nível (não desce recursivamente), então o custo é baixo mesmo
// em arquivos grandes. Devolve o Y mais baixo ocupado (bottom) e o X mais
// à esquerda (left) entre tudo isso, sempre a partir de
// absoluteBoundingBox/absoluteRenderBounds (nunca node.x/y crus — um node
// dentro de uma Section tem x/y relativos a ela, não à página).
// Cópias de Ordem de Tabulação vivem dentro da Section dedicada
// (_getOrCreateTabOrderSection), não mais soltas em figma.currentPage —
// sem somar explicitamente os filhos dela aqui, o cálculo de "faixa livre"
// deixaria de "ver" cópias já existentes (a Section em si cresce pra
// envolver todas as cópias, mas usar SÓ o bounding box dela distorceria o
// cálculo: uma Section com 3 cópias lado a lado tem bounds bem diferentes
// de 3 retângulos individuais, e sobreporia a próxima cópia no meio das
// existentes em vez de colocá-la ao final da faixa).
//
// Bug real corrigido (2026-09-09): esta função (e _rectsOverlap/
// _findFreeTabOrderCopyPosition logo abaixo) vivia DENTRO do closure de
// figma.ui.onmessage — invisível para _createOrGetFichaFrame, que sempre
// viveu no escopo de módulo (fora do closure). insert-ficha-section
// lançava "'_findFreeTabOrderCopyPosition' is not defined" toda vez que
// o frame da Ficha ainda não existia (ReferenceError, não capturado por
// nenhum try/catch específico — só o genérico em insert-ficha-section,
// que reportava um erro vago ao designer). Movidas as 3 funções pro
// escopo de módulo, junto de _createOrGetFichaFrame — todas as 3 chamadas
// que já existiam DENTRO do closure (_createTabOrderCloneForArea/
// _createSwipePathCloneForArea/_createSpecCloneForArea) continuam
// funcionando normalmente: uma função de escopo de módulo é visível de
// dentro de qualquer closure interno, só o inverso que não vale.
async function _collectA11yOccupiedBounds() {
  const bounds = [];
  const seen = new Set();
  const addNode = (n) => {
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    const bb = n.absoluteBoundingBox || n.absoluteRenderBounds;
    if (!bb) return;
    bounds.push({ left: bb.x, top: bb.y, right: bb.x + bb.width, bottom: bb.y + bb.height });
  };

  // A Section de sessão (2026-09-05) é um container que CRESCE a cada
  // artefato novo — somar o bounding box dela como um bloco só faria a
  // faixa livre encolher a cada Área/cópia criada, até nenhum dos 4 lados
  // candidatos passar. Mesmo raciocínio já documentado abaixo pras Sections
  // por tipo: nunca o container, sempre os conteúdos.
  figma.currentPage.children.forEach(n => {
    let isSessionSection = false;
    try {
      isSessionSection = !!(n.getPluginData && n.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (isSessionSection) return;
    addNode(n);
  });

  // Dentro da Section de sessão cada Área é um GROUP que também cresce a
  // cada artefato (specs, cópias, Ficha) — por isso somamos os FILHOS
  // diretos de cada Grupo, um retângulo por artefato, nunca o Grupo
  // inteiro. Um Grupo com 3 artefatos espalhados tem bounds muito maiores
  // que a união real ocupada por eles.
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION') continue;
    let isSessionSection = false;
    try {
      isSessionSection = !!(sibling.getPluginData && sibling.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (!isSessionSection) continue;
    for (const areaGroup of (sibling.children || [])) {
      if (areaGroup.type === 'GROUP' && areaGroup.children) {
        areaGroup.children.forEach(addNode);
      } else {
        addNode(areaGroup);
      }
    }
  }

  const areaTargetIds = [];
  for (const sibling of figma.currentPage.children) {
    try {
      const areaTargetId = sibling.getPluginData && sibling.getPluginData('hacAreaTargetNodeId');
      if (areaTargetId) areaTargetIds.push(areaTargetId);
    } catch (e) { }
  }
  // Grupos de Área dentro da Section de sessão também guardam o id do frame
  // ORIGINAL — sem isto o cálculo não enxergaria o frame documentado de
  // nenhuma Área criada na estrutura nova.
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION') continue;
    let isSessionSection = false;
    try {
      isSessionSection = !!(sibling.getPluginData && sibling.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (!isSessionSection) continue;
    for (const child of (sibling.children || [])) {
      try {
        const areaTargetId = child.getPluginData && child.getPluginData('hacAreaTargetNodeId');
        if (areaTargetId) areaTargetIds.push(areaTargetId);
      } catch (e) { }
    }
  }
  // Varre TODAS as Sections de specs já existentes na página (qualquer
  // geração/versão, não só a ativa) — o cálculo de "faixa livre" precisa
  // evitar sobrepor documentação de handoffs antigos também, não só a
  // Section corrente.
  const specSectionPrefix = A11Y_SECTION_NAME;
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION' || !sibling.name.startsWith(specSectionPrefix)) continue;
    for (const child of (sibling.children || [])) {
      try {
        const areaTargetId = child.getPluginData && child.getPluginData('hacAreaTargetNodeId');
        if (areaTargetId) areaTargetIds.push(areaTargetId);
      } catch (e) { }
    }
  }

  for (const areaTargetId of areaTargetIds) {
    try {
      const areaRoot = await figma.getNodeByIdAsync(areaTargetId);
      if (areaRoot) addNode(areaRoot);
    } catch (e) { }
  }

  // Mesmo raciocínio para as Sections de Trilha de Swipe.
  const swipeFlowSectionPrefix = A11Y_SWIPE_FLOW_SECTION_NAME;
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION' || !sibling.name.startsWith(swipeFlowSectionPrefix)) continue;
    for (const child of (sibling.children || [])) addNode(child);
  }

  // Mesmo raciocínio para as Sections de Ficha de Handoff — sem isto, duas
  // Áreas diferentes gerando Ficha colidem visualmente entre si, e uma
  // Ficha já inserida pode ser sobreposta por uma cópia de Tabulação
  // criada depois dela (achado real de QA, 2026-09-04).
  for (const sibling of figma.currentPage.children) {
    if (sibling.type !== 'SECTION') continue;
    if (!sibling.name.startsWith(A11Y_FICHA_SECTION_NAME) && !sibling.name.startsWith(A11Y_FICHA_SECTION_NAME_LEGACY)) continue;
    for (const child of (sibling.children || [])) addNode(child);
  }

  return bounds;
}

// A cópia de Ordem de Tabulação nasce perto do frame ORIGINAL que ela
// replica — não numa faixa global calculada contra tudo que já existe na
// página inteira (isso jogava a cópia pra muito longe em arquivos grandes
// com telas espalhadas por toda parte, bug real relatado em 2026-09-03).
// Tenta, em ordem, os 4 lados do frame original (direita, abaixo,
// esquerda, acima) e usa o primeiro que não colide com nada que esteja
// fisicamente PRÓXIMO (checagem contra occupied, que ainda cobre toda a
// página — mas aqui só descarta candidatos que colidem de verdade, não
// empurra pra baixo de tudo só por existir algo distante). Depois de
// nascer, a cópia é um frame comum — o designer arrasta pra onde quiser,
// sem precisar de nenhuma opção extra no plugin.
function _rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, originBounds) {
  let occupied;
  try {
    occupied = await _collectA11yOccupiedBounds();
  } catch (e) {
    console.error('[hac] _findFreeTabOrderCopyPosition: falhou em _collectA11yOccupiedBounds', e && e.message);
    throw e;
  }

  const ox = originBounds.x;
  const oy = originBounds.y;
  const ow = originBounds.width;
  const oh = originBounds.height;

  // Sempre AO LADO do frame original (2026-09-09, pedido do usuário —
  // antes era sempre ABAIXO, 2026-09-08). Motivo da troca: o designer pode
  // começar a documentar por qualquer bloco (Swipe, Leitor de Tela ou
  // Tabulação, em qualquer ordem) e cada um pode precisar criar uma
  // réplica nova (quando não há uma já reaproveitável, ver
  // _resolveActiveTabOrderClone/_resolveActiveSwipePathClone/
  // _resolveActiveSpecClone — esse reaproveitamento não muda aqui, só a
  // posição de quando uma réplica NOVA de fato precisa nascer). Mesma
  // lógica de "tentar, colidir, empurrar mais pra longe, tentar de novo"
  // de antes, só invertendo o eixo de busca: a posição vertical é sempre a
  // mesma do original (y = oy) — a posição horizontal avança à direita, em
  // incrementos de _TAB_ORDER_ROW_GAP a partir de logo depois do original,
  // até achar uma faixa livre. Sem limite de tentativas: numa página real,
  // sempre existe espaço mais à direita.
  let x = Math.round(ox + ow + _TAB_ORDER_ROW_GAP);
  const y = Math.round(oy);
  for (let guard = 0; guard < 500; guard++) {
    const rect = { left: x, top: y, right: x + cloneWidth, bottom: y + cloneHeight };
    const collidingBounds = occupied.filter(b => _rectsOverlap(rect, b));
    if (collidingBounds.length === 0) return { x, y };
    // Colidiu com algo que já está mais à direita — avança até passar do
    // ponto mais à direita de tudo que colidiu, e tenta de novo dali.
    const rightmostConflict = collidingBounds.reduce((max, b) => Math.max(max, b.right), x);
    x = Math.round(rightmostConflict + _TAB_ORDER_ROW_GAP);
  }
  return { x, y };
}

// Cria (ou retorna, se já existir) o frame-container da Ficha de uma área —
// Auto Layout HORIZONTAL vazio, uma seção (Tabulação/Swipe/Leitor de Tela)
// é appendChild'ada dentro dele por vez, cada builder cuidando de remover a
// seção antiga antes de inserir a nova (substituição completa, nunca
// merge). Posicionado via _findFreeTabOrderCopyPosition (genérica o
// bastante apesar do nome — aceita qualquer originBounds/dimensões)
// usando o bounding box do frame ORIGINAL da área como origem, igual às
// cópias de Tabulação/Swipe.
async function _createOrGetFichaFrame(area, designerName) {
  const savedFrameId = area.handoffFicha && area.handoffFicha.frameId;
  const existing = await _findFichaFrameForArea(area.id, savedFrameId);
  if (existing) {
    // Migração defensiva (2026-09-09): bug real reportado — a Ficha
    // aparecia FORA da Section principal ("hac — Especificações de
    // Acessibilidade — ..."), em vez de dentro dela junto com as réplicas
    // de trabalho. Causa: esta função só chama _reparentIntoSection na
    // hora de CRIAR o frame (abaixo) — uma Ficha já existente (criada
    // antes desta chamada existir no código, ou desalinhada por qualquer
    // outro motivo) é sempre devolvida como está, sem nunca ser
    // reparentada de novo em nenhum "Atualizar" seguinte. Checa se
    // `existing` já vive dentro de uma Section de sessão (mesma marca
    // 'hacSessionSection' que _getOrCreateA11ySessionSection sempre usa) e,
    // se não, reparenta agora — mesma função já usada na criação,
    // idempotente e segura de chamar de novo mesmo quando já está correta.
    let alreadyInSession = false;
    let ancestor = existing.parent;
    while (ancestor) {
      try {
        if (ancestor.getPluginData && ancestor.getPluginData('hacSessionSection') === 'true') {
          alreadyInSession = true;
          break;
        }
      } catch (e) { }
      ancestor = ancestor.parent;
    }
    if (!alreadyInSession) {
      _reparentIntoSection(existing, () => _getOrCreateA11ySessionSection(designerName));
    }
    return existing;
  }

  const root = area.targetNodeId ? await figma.getNodeByIdAsync(area.targetNodeId) : null;
  const originBounds = (root && root.absoluteBoundingBox) || { x: 0, y: 0, width: 400, height: 400 };

  // Posição livre calculada ANTES de criar/inserir o frame na página — mesma
  // ordem de _createTabOrderCloneForArea (o cálculo
  // não deve "ver" o próprio frame nasce em 0,0 com dimensões default como
  // se fosse conteúdo real já ocupando espaço). Dimensões "de partida"
  // pequenas: o frame ainda está vazio (Auto Layout AUTO cresce conforme
  // seções entram) e o cálculo só precisa de um ponto de partida sem colidir
  // com o que já existe; o frame real cresce depois sem recalcular posição.
  const { x, y } = await _findFreeTabOrderCopyPosition(480, 480, originBounds);

  const fichaFrame = figma.createFrame();
  fichaFrame.name = `[Handoff Completo] ${area.label || 'Área'}`;
  fichaFrame.layoutMode = 'HORIZONTAL';
  fichaFrame.primaryAxisSizingMode = 'AUTO';
  fichaFrame.counterAxisSizingMode = 'AUTO';
  fichaFrame.itemSpacing = 40;
  fichaFrame.paddingLeft = 40;
  fichaFrame.paddingRight = 40;
  fichaFrame.paddingTop = 40;
  fichaFrame.paddingBottom = 40;
  // Cor de fundo real da lib (2026-09-09, pedido do usuário): aproximação
  // visual de "color/bg/information/2" (informative 30) — variável real
  // do Design System, mas não capturada nos dados já rastreados do hac
  // (nomenclatura diferente das 4 libs DSC monitoradas), então usada como
  // hex fixo em vez de setBoundVariable (o hac não usa variáveis
  // vinculadas em nenhum lugar hoje, mesmo padrão já existente).
  fichaFrame.fills = [{ type: 'SOLID', color: hexToRgb('#DCEEFB') }];
  fichaFrame.counterAxisAlignItems = 'MIN';
  fichaFrame.locked = false;
  fichaFrame.setPluginData('hacCategory', 'a11y');
  fichaFrame.setPluginData('hacFichaForArea', area.id || '');

  figma.currentPage.appendChild(fichaFrame);
  fichaFrame.x = x;
  fichaFrame.y = y;

  // Direto na Section de sessão (2026-09-08) — mesmo raciocínio de specs/
  // Tabulação/Swipe: a Ficha não precisa mais estar aninhada no Grupo da
  // Área, só na mesma Section (de onde será reorganizada quando a
  // montagem final da Ficha for desenhada).
  _reparentIntoSection(fichaFrame, () => _getOrCreateA11ySessionSection(designerName));

  return fichaFrame;
}

// Remove a seção antiga (Tabulação/Swipe/Leitor de Tela) já inserida na
// Ficha, se existir — identificada por pluginData 'hacFichaSection' no nó
// RAIZ daquela seção (não por nome/posição, o designer pode reordenar/
// renomear livremente dentro do frame). Substituição completa: cada
// "Inserir/Atualizar ficha" começa sempre limpando a seção correspondente
// antes de desenhar a nova versão. Usada hoje só pelo Handoff Review
// (_buildFichaReviewSection, sem estado próprio pra preservar) — Tabulação/
// Swipe/Leitor pararam de chamar isto (2026-09-09, ver
// _findFichaSectionInFrame): remover a seção apagaria a réplica de
// trabalho MOVIDA pra dentro dela, que não tem como ser recriada sem
// perder o trabalho já feito.
function _removeFichaSectionInFrame(fichaFrame, sectionKey) {
  const children = (fichaFrame.children || []).slice();
  for (const child of children) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaSection') === sectionKey) {
        child.remove();
      }
    } catch (e) { }
  }
}

// Espelha _removeFichaSectionInFrame, mas SEM remover — devolve a seção já
// existente pra ser reaproveitada (2026-09-09, necessário desde que
// Tabulação/Swipe/Leitor passaram a mover a réplica de trabalho pra dentro
// da Ficha em vez de recriá-la do zero a cada "Atualizar").
function _findFichaSectionInFrame(fichaFrame, sectionKey) {
  for (const child of (fichaFrame.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaSection') === sectionKey) {
        return child;
      }
    } catch (e) { }
  }
  return null;
}

// Ordem visual fixa dos 4 blocos da Ficha (2026-09-08, pedido do
// usuário) — 1) Ordem de Tabulação, 2) Swipe, 3) Leitor de Tela,
// 4) Handoff Review (consolidado, sem instrução/réplica própria).
const FICHA_SECTION_ORDER = ['tabulacao', 'swipe', 'leitor', 'review'];

// Bug real corrigido (2026-09-08): antes, cada builder de seção fazia
// `fichaFrame.appendChild(section)` direto — como appendChild sempre
// insere no ÚLTIMO índice, a posição final de cada seção no canvas
// virava simplesmente "a ordem em que o designer clicou Inserir/
// Atualizar pela primeira vez em cada aba", nunca uma ordem fixa. Se o
// designer inserisse Leitor de Tela antes de Tabulação, por exemplo,
// Leitor aparecia à ESQUERDA de Tabulação. Corrigido calculando o
// índice correto contra FICHA_SECTION_ORDER e usando insertChild antes
// do primeiro filho existente com ordem MAIOR que a da seção sendo
// inserida — assim a posição final no `fichaFrame` (Auto Layout
// HORIZONTAL, já com sizing AUTO nos dois eixos — isso já garante
// "lado a lado, sem sobreposição, largura própria" mecanicamente,
// sem nenhum ajuste de sizing necessário) sempre respeita 1-2-3-4,
// não importa a ordem de clique.
function _insertFichaSectionInOrder(fichaFrame, section, sectionKey) {
  const orderIndex = FICHA_SECTION_ORDER.indexOf(sectionKey);
  const children = fichaFrame.children || [];
  let beforeChild = null;
  for (const child of children) {
    let otherKey = null;
    try { otherKey = child.getPluginData && child.getPluginData('hacFichaSection'); } catch (e) { }
    const otherIndex = otherKey ? FICHA_SECTION_ORDER.indexOf(otherKey) : -1;
    if (otherIndex !== -1 && orderIndex !== -1 && otherIndex > orderIndex) {
      beforeChild = child;
      break;
    }
  }
  if (beforeChild) {
    fichaFrame.insertChild(fichaFrame.children.indexOf(beforeChild), section);
  } else {
    fichaFrame.appendChild(section);
  }
}

// Coluna de legenda textual, reaproveitada pelas seções de Tabulação/Swipe
// (mesmo texto didático curto, só o título muda) — Auto Layout VERTICAL
// simples, sem depender de nenhum componente real da lib.
function _buildFichaLegendColumn(title, description) {
  const col = figma.createFrame();
  col.name = 'Legenda';
  col.layoutMode = 'VERTICAL';
  col.itemSpacing = 8;
  col.paddingLeft = 12;
  col.paddingRight = 12;
  col.paddingTop = 12;
  col.paddingBottom = 12;
  col.cornerRadius = 8;
  // Bug real corrigido (2026-09-09, diagnosticado numa sessão anterior):
  // resize(w, h) explícito nos dois eixos, chamado DEPOIS de
  // primaryAxisSizingMode = 'AUTO', fazia a API do Figma reverter
  // silenciosamente o eixo primário (altura, aqui) de volta pra FIXED com
  // o valor 1 passado — o painel do Figma mostrava "H 1" fixo em vez de
  // "Hug". resizeWithoutConstraints ANTES de setar os sizing modes evita
  // esse conflito: define só a largura de partida, e os dois modos abaixo
  // (largura FIXED, altura AUTO/Hug) passam a valer de fato.
  col.resizeWithoutConstraints(220, 1);
  col.primaryAxisSizingMode = 'AUTO';
  col.counterAxisSizingMode = 'FIXED';
  // Cor de fundo real da lib (pedido do usuário): aproximação visual de
  // "color/bg/neutral/2" (grayscale 10) — mesma justificativa de hex fixo
  // (não setBoundVariable) do fundo da Ficha acima.
  col.fills = [{ type: 'SOLID', color: hexToRgb('#F5F5F5') }];

  const titleText = figma.createText();
  titleText.name = 'Título';
  titleText.fontName = { family: 'Inter', style: 'Bold' };
  titleText.fontSize = 13;
  titleText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
  titleText.characters = title;
  titleText.textAutoResize = 'HEIGHT';
  titleText.layoutAlign = 'STRETCH';
  col.appendChild(titleText);

  const descText = figma.createText();
  descText.name = 'Descrição';
  descText.fontName = { family: 'Inter', style: 'Regular' };
  descText.fontSize = 11;
  descText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
  descText.characters = description;
  descText.textAutoResize = 'HEIGHT';
  descText.layoutAlign = 'STRETCH';
  col.appendChild(descText);

  return col;
}

// Reordena o specGroup recém-criado entre os demais grupos de spec da página
// para que a profundidade (z-order) siga a ordem hierárquica das tags, não a
// ordem de criação. Não afeta X/Y — só o índice na lista de filhos da página.
function _reorderSpecGroupByTag(specGroup, tag) {
  const siblings = figma.currentPage.children.filter(n => n !== specGroup && n.type === 'GROUP');
  let insertIndex = figma.currentPage.children.length;
  for (let i = 0; i < siblings.length; i++) {
    const m = siblings[i].name.match(/^\[SpecA11y \| ([A-Z]\d*(?:\.\d+)*) \| [a-z]+\] /);
    if (!m) continue;
    if (_compareSpecTags(tag, m[1]) < 0) {
      const idx = figma.currentPage.children.indexOf(siblings[i]);
      insertIndex = Math.min(insertIndex, idx);
    }
  }
  figma.currentPage.insertChild(insertIndex, specGroup);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0.5, g: 0.5, b: 0.5 };
}

/* global __HAC_VERSION__ */
const PLUGIN_VERSION = (typeof __HAC_VERSION__ !== 'undefined') ? __HAC_VERSION__ : 'dev';

// ============================================================
// Scan enxuto de Detecção Automática (Área Marcada → candidatos de a11y)
//
// Substitui, de forma bem mais enxuta, o enriquecimento que no Handex vive
// dentro do scan de conformidade GERAL (scan-frame): aqui não existe
// audit()/AUDIT_SCORE/frameJsonTemplate/suggestClosestMatch — o hac não
// audita tokens DSC, só categoriza os elementos da árvore e resolve o
// matching de a11y (dscComponentMatch/needsA11yTokenReview) sobre eles.
// Preserva as duas heurísticas já validadas: `treeOrder` (índice de visita
// DFS pré-order, usado por accessibility.js pra numerar o lote na ordem
// estrutural real) e `needsA11yTokenReview` (TEXT sem token DSC vinculado E
// sem match de heading — aviso de baixa prioridade, não afirma que É título).
// ============================================================

async function _a11yScanArea(rootNode) {
  const results = { components: [], icons: [], typography: [], frames: [], vectors: [], images: [] };
  let _treeVisitIndex = 0;

  // Só documentamos o que é de fato VISÍVEL no handoff real. Um ancestral
  // com clipsContent ativado recorta tudo que ultrapassa seus próprios
  // limites — um filho posicionado fora dessa área nunca aparece pro
  // usuário final, então não deve virar item a documentar (regra de
  // negócio confirmada pelo usuário, 2026-09-03). Verificado contra
  // TODOS os ancestrais com clip entre o node e a raiz do scan (não só o
  // pai direto), já que qualquer um deles pode recortar.
  function _isClippedByAncestor(n) {
    const bb = n.absoluteBoundingBox;
    if (!bb) return false;
    let p = n.parent;
    while (p && p !== rootNode.parent) {
      if (p.clipsContent && p.absoluteBoundingBox) {
        const pbb = p.absoluteBoundingBox;
        const outside = bb.x + bb.width <= pbb.x || bb.x >= pbb.x + pbb.width ||
          bb.y + bb.height <= pbb.y || bb.y >= pbb.y + pbb.height;
        if (outside) return true;
      }
      if (p === rootNode) break;
      p = p.parent;
    }
    return false;
  }

  // `parentComponentMatch` (2026-09-09): preenchido só quando esta chamada
  // de _extract está visitando um filho DIRETO de um componente DSC já
  // resolvido (ver _hasResolvedDscMatch/_hasExposedSlotProperties abaixo)
  // — nunca mais fundo que 1 nível. Sinaliza pro bloco de classificação
  // "só aceite este node se ele for um ÍCONE isolado (categoria 'icons'),
  // ignore qualquer outra categoria e não desça mais fundo" — ver uso mais
  // abaixo. Fora desse modo (undefined), o comportamento é o de sempre.
  async function _extract(n, depth, parentComponentMatch) {
    if ((depth || 0) > 16) return;
    if (n.visible === false) return;
    if (n !== rootNode && _isClippedByAncestor(n)) return;

    try {
      // Resolvidos aqui (escopo de toda a função, não só do bloco de
      // categorização abaixo) porque também são consultados depois, ao
      // decidir se a recursão nos filhos deve parar por causa de um slot
      // exposto via componentPropertyReferences (_hasExposedSlotProperties).
      let componentKey = null;
      let mainComp = null;
      let _mainCompError = null;
      if (n.type === "INSTANCE") {
        try { mainComp = await n.getMainComponentAsync(); } catch (e) { mainComp = null; _mainCompError = e && e.message; }
        if (mainComp) componentKey = mainComp.key;
      } else if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") {
        componentKey = n.key;
      }

      // Preenchido só quando n é INSTANCE remota resolvida via
      // _resolveDscComponentA11yMatch — usado abaixo pra decidir se a
      // recursão nos filhos deve ser interrompida (ver bloco após o push
      // em results[category]).
      let _dscRemoteMatch = null;

      const nameLower = n.name.toLowerCase();
      const looksLikeButton = nameLower.includes("button");
      const isIcon = !looksLikeButton && (
        nameLower.includes("icon") || nameLower.includes("ic-") ||
        (n.type === "INSTANCE" && n.width <= 32 && n.height <= 32)
      );

      // hasImageFill só se aplica a nodes que PODEM ser uma imagem de
      // verdade (RECTANGLE/ELLIPSE/VECTOR/frames de imagem legítimos) —
      // nunca a um FRAME/GROUP/SECTION estrutural. Um container de layout
      // (ex.: um "Row" de botões) pode ter um fill IMAGE aplicado por
      // engano ou como placeholder/mockup de referência sem ser, ele
      // mesmo, uma imagem — sem essa checagem de tipo, esse container
      // inteiro virava 1 item genérico de categoria "images" (sem
      // componente, sem sugestão) e a recursão nos filhos reais (botões)
      // continuava, mas o container nunca deveria ter sido tratado como
      // candidato de a11y — só os filhos importam (bug real, 2026-09-03).
      const _canBeImage = n.type !== 'FRAME' && n.type !== 'GROUP' && n.type !== 'SECTION';
      const hasImageFill = _canBeImage && Array.isArray(n.fills) &&
        n.fills.some(f => f && f.type === 'IMAGE' && f.visible !== false);

      // Um GROUP/FRAME "parece ícone" pelo mesmo critério de nome/tamanho
      // usado pro nó atual — usado tanto pra decidir se O PRÓPRIO node
      // estrutural deve virar 1 item decorativo (ver _isIconLikeContainer
      // abaixo) quanto pra saber se um vetor/path é peça de composição de
      // um ícone ancestral.
      function _looksLikeIconContainer(node) {
        const nLower = (node.name || '').toLowerCase();
        const looksLikeBtn = nLower.includes('button');
        return !looksLikeBtn && (
          nLower.includes('icon') || nLower.includes('ic-') ||
          (typeof node.width === 'number' && typeof node.height === 'number' && node.width <= 32 && node.height <= 32)
        );
      }

      // Vetor/path que é filho de um ícone/composição maior (grupo/frame
      // pequeno com vários vetores formando 1 desenho, ex.: "Wifi" = 2
      // Path + 1 Rectangle) não deve virar item individual — só o ícone
      // como um todo é a unidade relevante pra documentar (regra de
      // negócio confirmada, 2026-09-03). Sem essa supressão, o scan pegava
      // só UMA peça solta da composição (ex.: só o Rectangle) e ignorava
      // as demais, um resultado incoerente — nem a peça isolada nem o
      // ícone completo faziam sentido como candidato.
      const parent = n.parent;
      const parentLooksLikeIcon = !!(parent && parent !== rootNode.parent && _looksLikeIconContainer(parent));
      const _isVectorLikeType = n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION" ||
        n.type === "ELLIPSE" || n.type === "RECTANGLE";
      const isVectorInsideIconComposition = _isVectorLikeType && parentLooksLikeIcon;

      // O GROUP/FRAME que representa o ícone como um todo (ex.: "Wifi",
      // "Signal", "Battery") precisa continuar documentável como 1
      // elemento decorativo — suprimir as peças internas sem preservar o
      // grupo faria o ícone inteiro desaparecer do scan. Só se aplica
      // quando o próprio grupo não tem match de componente DSC (senão cai
      // no branch de INSTANCE/COMPONENT normalmente) e tem pelo menos um
      // filho vetorial de composição (evita capturar todo GROUP pequeno
      // sem relação nenhuma com ícone, ex.: um badge de texto compacto).
      const _isIconGroupContainer = (n.type === "GROUP" || n.type === "FRAME") &&
        _looksLikeIconContainer(n) &&
        Array.isArray(n.children) &&
        n.children.some(c => c.type === "VECTOR" || c.type === "BOOLEAN_OPERATION" || c.type === "ELLIPSE" || c.type === "RECTANGLE");

      let category = "frames";
      if (isVectorInsideIconComposition) {
        category = "frames"; // nunca vira item — a composição já é capturada pelo grupo pai (_isIconGroupContainer)
      } else if (_isIconGroupContainer) {
        category = "icons";
      } else if (hasImageFill && !isIcon) {
        category = "images";
      } else if (n.type === "TEXT") {
        category = isIcon ? "icons" : "typography";
      } else if (n.type === "INSTANCE" || n.type === "COMPONENT") {
        category = isIcon ? "icons" : "components";
      } else if (n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION" || n.type === "ELLIPSE" || n.type === "RECTANGLE") {
        category = isIcon ? "icons" : "vectors";
      } else if (n.type === "FRAME" || n.type === "GROUP" || n.type === "SECTION") {
        category = "frames";
      }

      // Vetores: sem correspondência de biblioteca real — não carregam
      // conformidade DS, mas ainda entram na Detecção Automática via
      // heurística de decorativo (ver bloco de matching abaixo). Frames
      // puramente estruturais (sem função de a11y própria) são ignorados —
      // esta função não pretende listar containers de layout, só candidatos
      // reais de a11y (texto, componente, ícone, imagem).
      const _treeOrder = _treeVisitIndex++;

      // Dentro de um componente pai já resolvido (parentComponentMatch
      // preenchido), só ícones/decorativos isolados viram item — qualquer
      // outra categoria (texto solto, outra INSTANCE de componente DSC,
      // sub-frame estrutural) é descartada aqui, preservando a garantia
      // original de nunca fragmentar o componente pai em itens
      // concorrentes (2026-09-04, ver comentário em _hasResolvedDscMatch
      // abaixo) — a única exceção nova e deliberada é o ícone decorativo
      // que o design pode ter embutido (ex.: ícone dentro de cada botão
      // de "[dsc-tc] Actions - Button Row"), que precisa virar spec
      // própria de Elemento Decorativo.
      if (parentComponentMatch && category !== 'icons') category = 'frames';

      if (category !== 'frames') {
        let dscComponentMatch = null;
        let needsA11yTokenReview = false;

        if (n.type === 'INSTANCE' && mainComp && mainComp.remote && componentKey) {
          dscComponentMatch = _resolveDscComponentA11yMatch(componentKey);
          _dscRemoteMatch = dscComponentMatch;
        }
        if (!dscComponentMatch && (category === 'icons' || category === 'vectors')) {
          dscComponentMatch = _resolveDecorativeA11yMatch(n);
        } else if (!dscComponentMatch && category === 'images') {
          dscComponentMatch = _resolveImageA11yMatch(n);
        } else if (!dscComponentMatch && category === 'components') {
          // Instância real (categoria calculada acima já garante n.type ===
          // INSTANCE/COMPONENT), mas sem match resolvido — seja porque
          // getMainComponentAsync falhou, mainComp.remote veio false (link
          // com a lib quebrado/pendente de resync no arquivo do usuário,
          // cópia local de um componente originalmente remoto), ou o
          // componentKey não bate com nenhuma das 4 libs catalogadas.
          // Antes desta correção, um item nesse estado nunca ganhava
          // dscComponentMatch e era descartado SEM RASTRO pelo filtro do
          // frontend (_collectA11yDetections só aceita item com match
          // truthy) — o designer nunca via nem "Não identificado", o
          // componente simplesmente sumia do lote (bug real, 2026-09-03:
          // instância confirmada real de "[dsc] Icon Button Text" nunca
          // apareceu na Detecção Automática). Loga a causa real (nunca
          // muda pra fallback silencioso) e ainda assim marca como
          // candidato "não identificado" — o wizard mostra "Componente
          // DSC: Não identificado" (mesmo texto já usado hoje pra outros
          // casos de match ausente), permitindo ao designer documentar
          // manualmente em vez de o item desaparecer.
          console.error('[hac] _a11yScanArea: instância sem match DSC resolvido — não deveria ser descartada silenciosamente.', JSON.stringify({
            layerName: n.name,
            isRemote: mainComp ? !!mainComp.remote : null,
            hasMainComp: !!mainComp,
            mainCompError: _mainCompError,
            componentKey: componentKey ? componentKey.slice(0, 12) + '…' : null,
          }));
          dscComponentMatch = { containingFrame: n.name, a11yCategory: null, confidence: 'baixa', source: 'unresolved-instance', isUnmapped: true };
        } else if (category === 'typography') {
          let styleName = null, styleKey = null;
          if ('textStyleId' in n && typeof n.textStyleId === "string" && n.textStyleId !== figma.mixed && n.textStyleId) {
            const style = await figma.getStyleByIdAsync(n.textStyleId);
            if (style) { styleName = style.name; styleKey = style.key; }
          }
          const _typoProp = styleKey ? { styleKey, name: styleName } : null;
          dscComponentMatch = _resolveTypographyA11yMatch(n, _typoProp);
          // Sem token DSC vinculado (nenhum text style aplicado) e sem
          // nenhum match de heading — candidato plausível de título sem
          // conformidade declarada, aviso de baixa prioridade.
          if (!dscComponentMatch && !styleKey) {
            needsA11yTokenReview = true;
          }
        }

        results[category].push({
          name: n.name,
          type: category,
          nodeType: n.type,
          componentKey: componentKey,
          layerName: n.name,
          dscComponentMatch,
          needsA11yTokenReview,
          nodeId: n.id,
          treeOrder: _treeOrder,
          // Contexto pro frontend mostrar "ícone dentro de: <nome do
          // componente pai>" na revisão do lote — evita confusão sobre um
          // ícone aparecer "solto" quando na verdade vive dentro de um
          // componente maior já documentado à parte (2026-09-09).
          parentComponentMatch: parentComponentMatch || null,
        });
      }

      // Instância remota já resolvida com sucesso (componente DSC real
      // identificado, não isUnmapped): os filhos internos (glifos, textos,
      // ícones decorativos embutidos) são parte da MESMA unidade já
      // documentada — descer neles geraria detecções concorrentes e
      // menores (ex.: o "?" dentro de um Icon Button) que competem com o
      // resultado correto do pai na agregação final do lote. Nós sem match
      // (isUnmapped ou sem componentKey remoto) continuam descendo
      // normalmente — é assim que hoje se descobrem componentes reais
      // aninhados dentro de containers genéricos sem match direto.
      const _hasResolvedDscMatch = n.type === 'INSTANCE' &&
        _dscRemoteMatch && !_dscRemoteMatch.isUnmapped && !!_dscRemoteMatch.a11yCategory;

      // Mesmo SEM categoria de a11y própria (isUnmapped), uma instância
      // remota real com "slot" — conteúdo interno exposto via
      // componentPropertyReferences do componente pai (ex.: "[dsc] Value
      // Section" expõe visibilidade/texto do Footer/Badge internos como
      // properties do próprio componente, não como filhos soltos) — não
      // deve ter a recursão descendo dentro dela. Sem essa checagem, o
      // conteúdo do slot (ex.: a instância "[dsc] Badge Text" aninhada no
      // Footer Container) virava um item SEPARADO e concorrente do
      // componente pai, gerando ruído no lote e uma detecção fragmentada
      // do que na prática é uma única unidade documentável (bug real,
      // 2026-09-04). O designer documenta "Value Section" como unidade —
      // o conteúdo do slot já é coberto por essa mesma spec.
      const _hasExposedSlotProperties = n.type === 'INSTANCE' && mainComp && mainComp.remote &&
        n.componentPropertyReferences && Object.keys(n.componentPropertyReferences).length > 0;

      // Já estamos DENTRO do modo restrito (visitando filho direto de um
      // componente pai resolvido, ver ramo abaixo) — nunca desce mais
      // fundo que esse 1 nível, mesmo que este próprio filho seja um
      // FRAME/GROUP com filhos, e mesmo que ele próprio resolva como
      // outro componente DSC. Isso é o que garante "só 1 nível", sem
      // depender de _hasResolvedDscMatch/_hasExposedSlotProperties
      // calculados de novo pra este filho.
      if (parentComponentMatch) {
        // não desce.
      } else if (!_hasResolvedDscMatch && !_hasExposedSlotProperties && 'children' in n && n.children) {
        for (const child of n.children) {
          await _extract(child, (depth || 0) + 1);
        }
      } else if (_hasResolvedDscMatch && !_hasExposedSlotProperties && 'children' in n && n.children) {
        // Regra nova (2026-09-09, caso real: "[dsc-tc] Actions - Button
        // Row" — cada botão tem um ícone interno que precisa virar spec
        // própria de Elemento Decorativo, hoje invisível porque a
        // recursão parava aqui). Em vez de bloquear totalmente, desce SÓ
        // 1 nível (os filhos diretos — o guard `if (parentComponentMatch)`
        // acima impede qualquer nível além deste) — cada filho é
        // classificado normalmente pela lógica acima, mas só é aceito se
        // for um ÍCONE isolado (parentComponentMatch !== null &&
        // category !== 'icons' vira 'frames', descartado). Não reintroduz
        // o bug original: qualquer OUTRA INSTANCE de componente DSC
        // dentro (ex. um Badge) nunca bate na heurística de ícone, então
        // nunca vira item concorrente — e mesmo que batesse, o guard
        // acima impediria ela de descer mais fundo ainda. Aplicado só ao
        // caso _hasResolvedDscMatch — _hasExposedSlotProperties (conteúdo
        // de slot dinâmico, ex. Footer/Badge do Value Section) continua
        // bloqueado por completo, caso conceitualmente diferente
        // (conteúdo configurável via property, não decoração fixa do
        // design).
        for (const child of n.children) {
          await _extract(child, (depth || 0) + 1, _dscRemoteMatch);
        }
      }
    } catch (err) {
      console.error("Erro ao escanear node:", n.name, "(type=" + n.type + ", id=" + n.id + ")", err && err.message ? err.message : err);
    }
  }

  await _extract(rootNode, 0);
  return results;
}

// ============================================================
// Escopo de clientStorage por arquivo
//
// Bug real confirmado: figma.clientStorage é vinculado ao PLUGIN (instalação),
// não ao arquivo — é global entre todos os arquivos Figma onde o plugin roda
// na mesma máquina/conta. Usar a chave fixa 'hacData' fazia dados de um
// arquivo vazarem/sobrescreverem os de outro quando o hac estava aberto em
// mais de um arquivo (ou alternado entre eles). Escopamos por figma.fileKey.
//
// Arquivos ainda não salvos pela primeira vez não têm figma.fileKey — e a
// API do Figma não expõe nenhum identificador estável para esse estado.
// Uma chave de fallback fixa ('hacData:unsaved') foi cogitada, mas é
// compartilhada por TODOS os arquivos não-salvos na mesma instalação do
// Figma: abrir um segundo arquivo não-salvo carregaria os dados do
// primeiro, vazando conteúdo entre projetos/clientes diferentes — bug real
// já confirmado. Um ID de sessão gerado no boot também não resolve: ainda
// vaza entre arquivos não-salvos abertos na mesma sessão (ex: duplicar o
// arquivo). Como não há identidade estável possível, a única correção
// correta é não persistir nem reidratar hacData nesse estado — o arquivo
// não-salvo sempre abre zerado e não grava em clientStorage. Perder o
// progresso de uma sessão nesse cenário é preferível a corromper
// silenciosamente os dados de outro projeto.
const HAC_DATA_LEGACY_KEY = 'hacData';

function _getHacDataStorageKey() {
  return figma.fileKey ? `hacData:${figma.fileKey}` : null;
}

// ============================================================
// Dispatcher principal
// ============================================================

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

      // Onboarding "visto" fica em chave própria — por instalação do plugin,
      // não por projeto/hacData, e sobrevive a "Limpar Cache" (mesmo padrão
      // do onboarding do Handex).
      const onboardingSeen = await figma.clientStorage.getAsync('hac-onboarding-seen');
      // Instrução do modal de spec ("selecione o elemento antes de aplicar")
      // — mesma ideia do onboarding (visto uma vez, nunca mais, por
      // instalação do plugin), mas em chave própria: não é um passo de
      // onboarding formal, só um snackbar avulso que não deve reaparecer.
      const specModalInstructionSeen = await figma.clientStorage.getAsync('hac-spec-modal-instruction-seen');
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        savedState: savedState || null,
        onboardingSeen: onboardingSeen || null,
        specModalInstructionSeen: !!specModalInstructionSeen
      });
    } catch (err) {
      console.error("Initialization error (continuing without saved state):", err);
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        savedState: null,
        onboardingSeen: null,
        specModalInstructionSeen: false
      });
    }
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
    const scopedKey = _getHacDataStorageKey();
    if (!scopedKey) {
      // Arquivo ainda não salvo: sem identidade estável, não persiste —
      // ver comentário em _getHacDataStorageKey.
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

  if (msg.type === 'save-spec-modal-instruction-seen') {
    try {
      await figma.clientStorage.setAsync('hac-spec-modal-instruction-seen', true);
    } catch (err) {
      console.warn("Spec modal instruction state save failed:", err);
    }
    return;
  }

  if (msg.type === 'clear-cache') {
    try {
      const scopedKey = _getHacDataStorageKey();
      if (scopedKey) {
        await figma.clientStorage.setAsync(scopedKey, null);
      }
      figma.ui.postMessage({ type: 'cache-cleared' });
    } catch (e) {
      console.error("clear-cache failed:", e);
      figma.notify('Erro ao limpar cache', { error: true });
    }
    return;
  }

  if (msg.type === 'highlight-node') {
    // Bug real corrigido (2026-09-05): a remoção do highlight anterior
    // saiu daqui de cima — ficando ANTES do único await desta função
    // (getNodeByIdAsync), ela mesma reabria a mesma janela de corrida que
    // a correção de 2026-09-04-ag (mover a atribuição de .selection pra
    // depois) só resolveu parcialmente. Durante o await, o listener
    // SÍNCRONO de selectionchange podia rodar e criar seu próprio
    // retângulo; ao retomar, este handler sobrescrevia activeHighlightNode
    // com o dele, órfão o do listener. Resolvendo o node PRIMEIRO, e só
    // removendo+criando depois — sem nenhum await entre as duas
    // operações —, fecha a janela por completo. Cor mantida customizável
    // (msg.color, ex. '#0070af' em core.js pro highlight genérico de spec,
    // diferente do cyan fixo de _drawAccumulatedSelectionHighlight), então
    // não reaproveita aquela função aqui.
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node && node.visible && _nodeOnCurrentPage(node)) {
      if (activeHighlightNode && !activeHighlightNode.removed) {
        try { activeHighlightNode.remove(); } catch (e) { }
      }
      activeHighlightNode = null;

      if (msg.highlight && node.absoluteBoundingBox) {
        const hexToRgbLocal = (hex) => {
          const h = (hex || '#0070af').replace('#', '');
          return {
            r: parseInt(h.substring(0, 2), 16) / 255,
            g: parseInt(h.substring(2, 4), 16) / 255,
            b: parseInt(h.substring(4, 6), 16) / 255,
          };
        };
        const strokeColor = hexToRgbLocal(msg.color);
        const bb = node.absoluteBoundingBox;
        const strokeRect = figma.createRectangle();
        strokeRect.name = '[HighlightStroke]';
        strokeRect.x = bb.x;
        strokeRect.y = bb.y;
        strokeRect.resize(Math.max(1, bb.width), Math.max(1, bb.height));
        strokeRect.fills = [];
        strokeRect.strokes = [{ type: 'SOLID', color: strokeColor }];
        strokeRect.strokeWeight = 2;
        strokeRect.strokeAlign = 'OUTSIDE';
        strokeRect.locked = true;
        strokeRect.cornerRadius = node.cornerRadius && typeof node.cornerRadius === 'number' ? node.cornerRadius : 0;
        figma.currentPage.appendChild(strokeRect);
        activeHighlightNode = strokeRect;
      }

      if (msg.selectNode !== false) {
        figma.currentPage.selection = [node];
      }
      if (msg.shouldScroll !== false) {
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    }
    return;
  }

  if (msg.type === 'clear-highlight') {
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
    return;
  }

  // Usados por toggleA11ySpecVisibility/toggleAreaGroupVisibility
  // (accessibility.js) — ocultar/mostrar um selo ou uma área inteira sem
  // apagar nada. forceState (hide-node) permite setar um estado explícito em
  // vez de sempre forçar oculto, usado por toggleAreaGroupVisibility ao
  // sincronizar vários nós de uma vez com o mesmo estado alvo.
  if (msg.type === 'hide-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      node.visible = msg.forceState !== undefined ? msg.forceState : false;
    }
    return;
  }

  if (msg.type === 'show-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) node.visible = true;
    return;
  }

  if (msg.type === 'delete-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      node.remove();
      figma.notify("Item excluído com sucesso");
    }
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
    return;
  }

  if (msg.type === "get-selection-name") {
    const sel = figma.currentPage.selection;
    const node = sel.length > 0 ? sel[0] : null;
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
      const node = await figma.getNodeByIdAsync(msg.targetNodeId);
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
        badge.fills = [{ type: "SOLID", color: hexToRgb('#0070AF') }];
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
      const badgeNodes = [badge];
      if (!usedRealComponent) {
        const labelText = figma.createText();
        labelText.name = 'Label';
        labelText.fontName = { family: "Inter", style: "Bold" };
        labelText.fontSize = 12;
        labelText.fills = [{ type: "SOLID", color: hexToRgb('#0070AF') }];
        labelText.characters = msg.label;
        figma.currentPage.appendChild(labelText);
        labelText.x = Math.round(badge.x + badge.width + 8);
        labelText.y = Math.round(badge.y + (badge.height / 2) - (labelText.height / 2));
        labelText.setPluginData('hacAreaBadge', 'true');
        badgeNodes.push(labelText);
      }
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

      _reparentIntoSection(group, () => _getOrCreateA11ySessionSection(msg.designerName));

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
      const rootNode = await figma.getNodeByIdAsync(msg.areaId);
      const node = await figma.getNodeByIdAsync(msg.targetNodeId);
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
          badge.fills = [{ type: "SOLID", color: hexToRgb('#0070AF') }];
        }

        figma.currentPage.appendChild(badge);
        _positionBadge(badge);
        badge.setPluginData('hacAreaBadge', 'true');

        let newChildren = [badge];
        if (!usedRealComponent) {
          const labelText = figma.createText();
          labelText.name = 'Label';
          labelText.fontName = { family: "Inter", style: "Bold" };
          labelText.fontSize = 12;
          labelText.fills = [{ type: "SOLID", color: hexToRgb('#0070AF') }];
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
        const specificNode = await figma.getNodeByIdAsync(msg.nodeId);
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
        node = await figma.getNodeByIdAsync(opts.targetNodeId);
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
      if (opts.a11yAreaId && opts.a11yAreaTargetNodeId) {
        try {
          const resolved = await _resolveActiveSpecClone(opts.a11yAreaId, opts.a11yAreaTargetNodeId, opts.sectionName, opts.designerName);
          if (resolved) {
            const mappedNode = resolved.nodeMap.get(node.id);
            if (mappedNode && mappedNode.absoluteBoundingBox) {
              node = mappedNode;
              specClone = resolved.clone;
            } else {
              console.error('[hac] create-unified-spec: node não encontrado no clone da área — desenhando sobre o original.', JSON.stringify({ targetNodeId: node.id }));
            }
          }
        } catch (e) {
          console.error('[hac] create-unified-spec: falha ao resolver/criar o clone da área — desenhando sobre o original.', e && e.message);
        }
      }

      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

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
        tagText.fontName = { family: "Inter", style: "Bold" };
        tagText.fontSize = 18;
        tagText.fills = [{ type: "SOLID", color: themeColor }];
        tagText.characters = opts.letter;
        tagCircle.appendChild(tagText);
        headerRow.appendChild(tagCircle);

        headerRow.counterAxisAlignItems = "CENTER";

        const title = figma.createText();
        title.fontName = { family: "Inter", style: "Bold" };
        title.fontSize = 12;
        title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
        title.characters = node.name;
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
          pillText.fontName = { family: "Inter", style: "Medium" };
          pillText.fontSize = 10;
          pillText.fills = [{ type: "SOLID", color: themeColor }];
          pillText.characters = opts.categoryLabel;
          pill.appendChild(pillText);
          specCard.appendChild(pill);
        }

        if (opts.note) {
          const desc = figma.createText();
          desc.fontName = { family: "Inter", style: "Regular" };
          desc.fontSize = 11;
          desc.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
          desc.characters = opts.note;
          desc.textAutoResize = "WIDTH_AND_HEIGHT";
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

          opts.properties.forEach(p => {
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
            pLabel.fontName = { family: "Inter", style: "Medium" };
            pLabel.fontSize = 10;
            pLabel.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
            pLabel.characters = p.label.toUpperCase();
            pLabel.textAutoResize = "WIDTH_AND_HEIGHT";

            const pVal = figma.createText();
            pVal.fontName = { family: "Inter", style: "Bold" };
            pVal.fontSize = 11;
            pVal.fills = [{ type: "SOLID", color: p.token ? themeColor : { r: 0.1, g: 0.1, b: 0.1 } }];
            pVal.characters = p.token || String(p.value);
            pVal.textAutoResize = "WIDTH_AND_HEIGHT";

            row.appendChild(pLabel);
            row.appendChild(pVal);

            propsFrame.appendChild(row);
          });
          specCard.appendChild(propsFrame);
        }

        if (opts.link) {
          const linkTxt = figma.createText();
          linkTxt.fontName = { family: "Inter", style: "Regular" };
          linkTxt.fontSize = 11;
          linkTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0.4, b: 0.8 } }];
          linkTxt.characters = opts.link;
          linkTxt.textDecoration = "UNDERLINE";
          linkTxt.hyperlink = { type: "URL", value: opts.link };
          linkTxt.textAutoResize = "HEIGHT";
          linkTxt.layoutAlign = "STRETCH";
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
        const _stackScanNodes = _getOrCreateA11ySessionSection(opts.designerName).children || [];
        if (opts.a11yType !== 'titulo') _stackScanNodes.forEach(n => {
          if (n.type !== 'GROUP') return;
          const newFmt = n.name.match(new RegExp('^\\[' + _layerTag + ' \\| ([A-Z]\\d*(?:\\.\\d+)*) \\| ([a-z]+)\\] '));
          if (!newFmt) return;
          if (newFmt[2] !== side) return;
          const specNotes = n.children && n.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes' && c !== specCard);
          if (!specNotes) return;
          const bb = specNotes.absoluteBoundingBox || specNotes.absoluteRenderBounds;
          if (bb) _updateLetterMap(newFmt[1], bb);
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
            const _sibling = await figma.getNodeByIdAsync(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = _sibling.children && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes');
            const _bb = (_siblingNotes && (_siblingNotes.absoluteBoundingBox || _siblingNotes.absoluteRenderBounds))
              || _sibling.absoluteBoundingBox || _sibling.absoluteRenderBounds;
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

        let _areaRightmostOtherCategory = null;
        if (opts.a11yAreaId && !_areaMap[_areaColKey] && Array.isArray(opts.existingAreaAllSpecIds) && opts.existingAreaAllSpecIds.length > 0) {
          for (const _sid of opts.existingAreaAllSpecIds) {
            if (!_sid) continue;
            const _sibling = await figma.getNodeByIdAsync(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = _sibling.children && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && c.name === 'Spec Notes');
            const _bb = (_siblingNotes && (_siblingNotes.absoluteBoundingBox || _siblingNotes.absoluteRenderBounds))
              || _sibling.absoluteBoundingBox || _sibling.absoluteRenderBounds;
            if (!_bb) continue;
            if (!_areaRightmostOtherCategory || _bb.x + _bb.width > _areaRightmostOtherCategory.right) {
              _areaRightmostOtherCategory = { topY: _bb.y, right: _bb.x + _bb.width };
            }
          }
        }

        const _SPEC_GAP = 32;
        const _SPEC_COL_GAP = 64;
        const cardW = specCard.width;
        const cardH = specCard.height;
        let targetX, targetY;

        if (opts.pinnedPosition) {
          // Edição de spec (delete+recreate): mantém a spec exatamente onde
          // estava, sem reempilhar.
          targetX = opts.pinnedPosition.x;
          targetY = opts.pinnedPosition.y;
        } else if (opts.a11yAreaId && _areaMap[_areaColKey]) {
          targetX = _areaMap[_areaColKey].x;
          targetY = _areaMap[_areaColKey].bottom + _SPEC_GAP;
        } else if (opts.a11yAreaId && _areaRightmostOtherCategory) {
          targetX = _areaRightmostOtherCategory.right + _SPEC_COL_GAP;
          targetY = _areaRightmostOtherCategory.topY;
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
          const specOverlayGroup = _getOrCreateCloneOverlayGroup(specClone, 'hacSpecGroupForClone', '[Specs de Leitor de Tela]');
          _reparentIntoAreaGroup(specGroup, specOverlayGroup);
          _reparentedIntoOverlay = true;
        } catch (e) {
          console.error('[hac] create-unified-spec: reparenting pro grupo overlay falhou, caindo pra Section de sessão.', e && e.message);
        }
      }
      if (!_reparentedIntoOverlay) {
        _reparentIntoSection(specGroup, () => _getOrCreateA11ySessionSection(opts.designerName));
      }

      figma.ui.postMessage({
        type: "spec-created",
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
      const specGroup = await figma.getNodeByIdAsync(specId);
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
    return;
  }

  if (msg.type === "stop-tab-order-mode") {
    _tabOrderModeActive = false;
    // Limpa o highlight do último clique ao encerrar a captura
    // (2026-09-04-ah, bug real corrigido) — nada no ciclo de vida da
    // captura fazia isso antes, só figma.on('close')/('currentpagechange'),
    // eventos globais não ligados a "parei de capturar".
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
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
      const root = await figma.getNodeByIdAsync(msg.targetNodeId);
      if (!root || !root.absoluteBoundingBox) {
        figma.notify("Área não encontrada no canvas — marque novamente.");
        figma.ui.postMessage({ type: "swipe-path-copy-started", cloneId: null });
        return;
      }
      if (typeof root.clone !== 'function') {
        figma.notify("Este elemento não pode ser copiado — marque a área sobre um frame/grupo.");
        figma.ui.postMessage({ type: "swipe-path-copy-started", cloneId: null });
        return;
      }

      const { clone, nodeMap } = await _createSwipePathCloneForArea(root, msg.areaId, msg.sectionName, msg.designerName);
      if (msg.areaId) _activeSwipePathCloneMaps.set(msg.areaId, nodeMap);

      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);

      _swipePathModeActive = true;
      figma.ui.postMessage({ type: "swipe-path-copy-started", cloneId: clone.id });
    })();
    return;
  }

  if (msg.type === "stop-swipe-path-mode") {
    _swipePathModeActive = false;
    // Mesma limpeza de highlight ao encerrar a captura (2026-09-04-ah).
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
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
      const sel = figma.currentPage.selection.filter(n => !!n && !!n.absoluteBoundingBox);
      const seen = new Set();
      const resolved = [];
      for (const n of sel) {
        const originalId = _resolveTabOrderCloneSelectionToOriginalId(n.id);
        if (seen.has(originalId)) continue;
        seen.add(originalId);
        resolved.push(n);
      }
      // Bug real corrigido (2026-09-08): _orderNodesInZigzagReadingOrder
      // aqui reordenava a seleção múltipla (shift+clique/marquise) por
      // heurística de leitura visual em grade — inverte linhas alternadas
      // (1ª esquerda→direita, 2ª direita→esquerda...), certo pra "Gerar
      // Automaticamente" (que nunca teve ordem de clique nenhuma pra
      // preservar), mas errado aqui: o modelo de leitura literal
      // (2026-09-04-af, ver comentário do listener de selectionchange
      // acima) existe justamente pra respeitar a ORDEM DE CLIQUE real do
      // designer — o Figma já preserva essa ordem em
      // figma.currentPage.selection (shift+clique soma ao final). Reordenar
      // por zigue-zague depois disso descartava a ordem de clique real e
      // inseria uma inversão inesperada sempre que os elementos clicados
      // caíam em "linhas" (por Y) que o algoritmo contava como ímpares —
      // reportado pelo usuário numa fileira horizontal única de botões que
      // saiu na ordem 7,6,5,4 em vez de 4,5,6,7 (a ordem real do clique).
      // `resolved` já está na ordem de seleção — usar direto.
      const ordered = resolved;
      // Limpa o highlight do último clique ao ler a seleção final
      // (2026-09-04-ah) — "Concluir seleção" fecha o ciclo de captura
      // silenciosa, não deve sobrar nenhum retângulo residual na página.
      if (activeHighlightNode) {
        try { activeHighlightNode.remove(); } catch (e) { }
        activeHighlightNode = null;
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
      const sel = figma.currentPage.selection.filter(n => !!n && !!n.absoluteBoundingBox);
      const seen = new Set();
      const resolved = [];
      for (const n of sel) {
        const originalId = _resolveSwipePathCloneSelectionToOriginalId(n.id);
        if (seen.has(originalId)) continue;
        seen.add(originalId);
        resolved.push(n);
      }
      // Mesma correção de _orderNodesInZigzagReadingOrder descartando a
      // ordem de clique real (2026-09-08, ver comentário espelhado em
      // get-tab-order-accumulated-selection acima).
      const ordered = resolved;
      // Mesma limpeza de highlight ao ler a seleção final (2026-09-04-ah).
      if (activeHighlightNode) {
        try { activeHighlightNode.remove(); } catch (e) { }
        activeHighlightNode = null;
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
      badge.fills = [{ type: "SOLID", color: hexToRgb('#0070AF') }];
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
        const badgesGroup = _getOrCreateCloneOverlayGroup(tabOrderClone, 'hacTabOrderBadgesGroupForClone', '[Selos de Tabulação]');
        _reparentIntoAreaGroup(group, badgesGroup);
        _reparentedIntoClone = true;
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
        figma.notify('Não foi possível encaixar o selo na cópia da Ordem de Tabulação — ele foi colocado direto no grupo da área.');
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
        const root = await figma.getNodeByIdAsync(msg.targetNodeId);
        if (!root || !root.absoluteBoundingBox) {
          figma.notify("Área não encontrada no canvas — marque novamente.");
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
          return;
        }
        if (typeof root.clone !== 'function') {
          figma.notify("Este elemento não pode ser copiado — marque a área sobre um frame/grupo.");
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
          return;
        }

        const { clone, nodeMap } = await _createTabOrderCloneForArea(root, msg.areaId, msg.sectionName, msg.designerName);
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
        figma.notify("Não foi possível varrer a área automaticamente — tente novamente.");
        figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, generation: msg.generation, items: [] });
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
          const node = await figma.getNodeByIdAsync(entry.targetNodeId);
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
        const node = await figma.getNodeByIdAsync(entry.id);
        if (!node) continue;
        const instance = node.type === 'INSTANCE'
          ? node
          : (typeof node.findOne === 'function' ? node.findOne(n => n.type === 'INSTANCE') : null);
        if (!instance) continue;
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
  async function _createTabOrderCloneForArea(root, areaId, sectionName, designerName) {
    _removeExistingTabOrderCopiesForArea(areaId);

    const cloneWidth = root.absoluteBoundingBox.width;
    const cloneHeight = root.absoluteBoundingBox.height;
    const { x, y } = await _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, root.absoluteBoundingBox);

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
    figma.currentPage.appendChild(clone);
    clone.x = x;
    clone.y = y;
    clone.name = `[Ordem de Tabulação] ${root.name}`;
    clone.locked = false;
    clone.setPluginData('hacCategory', 'a11y');
    clone.setPluginData('hacTabOrderCopyForArea', areaId || '');

    const nodeMap = _buildOriginalToCloneMap(root, clone);

    // Reparenta DEPOIS de mapear original→clone (o mapeamento é por índice
    // de children, que appendChild/reparenting não altera) e depois de
    // calcular x/y livres (que precisam do clone ainda solto em
    // figma.currentPage, com x/y absolutos, pra bater com o bounding box
    // calculado por _findFreeTabOrderCopyPosition). O reparenting converte
    // x/y pra relativo ao novo pai preservando a posição visual.
    // Direto na Section de sessão (2026-09-08) — não mais no Grupo da
    // Área nem na Section por tipo antiga (_reparentIntoTabOrderSection,
    // mantida só como referência histórica/fallback de áreas legadas via
    // outros pontos de código que ainda a chamam).
    _reparentIntoSection(clone, () => _getOrCreateA11ySessionSection(designerName));

    return { clone, nodeMap };
  }

  // Espelha _createTabOrderCloneForArea pra Trilha de Swipe (2026-09-04-ac)
  // — mesma lógica de posicionamento livre (_findFreeTabOrderCopyPosition,
  // já genérica e usada por ambas), trocando só nome do clone, pluginData
  // e Section de destino.
  async function _createSwipePathCloneForArea(root, areaId, sectionName, designerName) {
    _removeExistingSwipePathCopiesForArea(areaId);

    const cloneWidth = root.absoluteBoundingBox.width;
    const cloneHeight = root.absoluteBoundingBox.height;
    const { x, y } = await _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, root.absoluteBoundingBox);

    let clone = root.clone();
    // Mesmo bug/correção de _createTabOrderCloneForArea (2026-09-08): clone
    // de uma Área marcada sobre INSTANCE de tela publicada precisa virar
    // FRAME antes de qualquer coisa ser reparentada pra dentro dela.
    if (clone.type === 'INSTANCE') {
      try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE — fallback de reparenting cobre */ }
    }
    figma.currentPage.appendChild(clone);
    clone.x = x;
    clone.y = y;
    clone.name = `[Trilha de Swipe] ${root.name}`;
    clone.locked = false;
    clone.setPluginData('hacCategory', 'a11y');
    clone.setPluginData('hacSwipePathCopyForArea', areaId || '');

    const nodeMap = _buildOriginalToCloneMap(root, clone);
    // Direto na Section de sessão (2026-09-08) — mesmo raciocínio de
    // _createTabOrderCloneForArea.
    _reparentIntoSection(clone, () => _getOrCreateA11ySessionSection(designerName));

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

  async function _createSpecCloneForArea(root, areaId, sectionName, designerName) {
    const cloneWidth = root.absoluteBoundingBox.width;
    const cloneHeight = root.absoluteBoundingBox.height;
    const { x, y } = await _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, root.absoluteBoundingBox);

    let clone = root.clone();
    // Mesmo bug/correção de _createTabOrderCloneForArea (2026-09-08).
    if (clone.type === 'INSTANCE') {
      try { clone = clone.detachInstance(); } catch (e) { /* segue como INSTANCE — fallback de reparenting cobre */ }
    }
    figma.currentPage.appendChild(clone);
    clone.x = x;
    clone.y = y;
    clone.name = `[Leitor de Tela] ${root.name}`;
    clone.locked = false;
    clone.setPluginData('hacCategory', 'a11y');
    clone.setPluginData('hacSpecCloneForArea', areaId || '');

    const nodeMap = _buildOriginalToCloneMap(root, clone);
    _reparentIntoSection(clone, () => _getOrCreateA11ySessionSection(designerName));

    return { clone, nodeMap };
  }

  // Resolve a cópia ativa de specs de uma área, ou cria do zero se não
  // houver nenhuma em memória/canvas — mesmo padrão de
  // _resolveActiveTabOrderClone/_resolveActiveSwipePathClone.
  async function _resolveActiveSpecClone(areaId, targetNodeId, sectionName, designerName) {
    const root = await figma.getNodeByIdAsync(targetNodeId);
    if (!root || !root.absoluteBoundingBox) return null;
    if (typeof root.clone !== 'function') return null;

    const cachedNodeMap = areaId ? _activeSpecCloneMaps.get(areaId) : null;
    if (cachedNodeMap) {
      const existingCloneEntry = cachedNodeMap.get(root.id);
      const existingClone = existingCloneEntry ? await figma.getNodeByIdAsync(existingCloneEntry.id) : null;
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

    const created = await _createSpecCloneForArea(root, areaId, sectionName, designerName);
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
      const root = await figma.getNodeByIdAsync(msg.targetNodeId);
      if (!root || !root.absoluteBoundingBox) {
        figma.notify("Área não encontrada no canvas — marque novamente.");
        figma.ui.postMessage({ type: "tab-order-copy-started", cloneId: null, nodeMap: {} });
        return;
      }
      if (typeof root.clone !== 'function') {
        figma.notify("Este elemento não pode ser copiado — marque a área sobre um frame/grupo.");
        figma.ui.postMessage({ type: "tab-order-copy-started", cloneId: null, nodeMap: {} });
        return;
      }

      const { clone, nodeMap } = await _createTabOrderCloneForArea(root, msg.areaId, msg.sectionName, msg.designerName);
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

      const node = await figma.getNodeByIdAsync(targetId);
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

      const node = await figma.getNodeByIdAsync(targetId);
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
  async function _resolveActiveTabOrderClone(areaId, targetNodeId, sectionName, designerName) {
    const root = await figma.getNodeByIdAsync(targetNodeId);
    if (!root || !root.absoluteBoundingBox) return null;
    if (typeof root.clone !== 'function') return null;

    // Cache por área (2026-09-08, ver comentário na declaração de
    // _activeTabOrderCloneMaps) — nunca mistura o clone ativo de uma área
    // com o de outra, mesmo alternando entre elas na mesma sessão.
    const cachedNodeMap = areaId ? _activeTabOrderCloneMaps.get(areaId) : null;
    if (cachedNodeMap) {
      const existingCloneEntry = cachedNodeMap.get(root.id);
      const existingClone = existingCloneEntry ? await figma.getNodeByIdAsync(existingCloneEntry.id) : null;
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

    const created = await _createTabOrderCloneForArea(root, areaId, sectionName, designerName);
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
  async function _resolveActiveSwipePathClone(areaId, targetNodeId, sectionName, designerName) {
    const root = await figma.getNodeByIdAsync(targetNodeId);
    if (!root || !root.absoluteBoundingBox) return null;
    if (typeof root.clone !== 'function') return null;

    // Cache por área (2026-09-08), mesmo princípio de _resolveActiveTabOrderClone.
    const cachedNodeMap = areaId ? _activeSwipePathCloneMaps.get(areaId) : null;
    if (cachedNodeMap) {
      const existingCloneEntry = cachedNodeMap.get(root.id);
      const existingClone = existingCloneEntry ? await figma.getNodeByIdAsync(existingCloneEntry.id) : null;
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

    const created = await _createSwipePathCloneForArea(root, areaId, sectionName, designerName);
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
      const resolved = await _resolveActiveTabOrderClone(msg.areaId, msg.targetNodeId, msg.sectionName, msg.designerName);
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
      const resolved = await _resolveActiveSwipePathClone(msg.areaId, msg.targetNodeId, msg.sectionName, msg.designerName);
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
      const resolved = await _resolveActiveTabOrderClone(msg.areaId, msg.targetNodeId, msg.sectionName, msg.designerName);
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

    const strokeColor = { r: 0.03, g: 0.55, b: 0.62 }; // #0891B2, cor de destaque do hac
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
          ? await _resolveActiveSwipePathClone(areaId, msg.targetNodeId, msg.sectionName, msg.designerName)
          : null;
        if (!cloneResolved) {
          throw new Error('A cópia da área não foi encontrada no canvas — refaça a trilha.');
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
            throw new Error(`O elemento "${p && p.nodeName || 'sem nome'}" não existe mais na cópia da área — refaça a trilha.`);
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
            const swipeOverlayGroup = _getOrCreateCloneOverlayGroup(clone, 'hacSwipePathGroupForClone', '[Trilha de Swipe]');
            _reparentIntoAreaGroup(group, swipeOverlayGroup);
            _reparentedIntoClone = true;
          } catch (e) {
            console.error('[hac] insert-swipe-path: reparenting pro grupo overlay falhou, caindo pro Grupo da Área.', e && e.message);
            figma.notify('Não foi possível encaixar a trilha na cópia de Swipe — ela foi colocada direto no grupo da área.');
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
      const root = areaTargetNodeId ? await figma.getNodeByIdAsync(areaTargetNodeId) : null;
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
  async function _buildFichaTabulacaoSection(fichaFrame, area, items, designerName) {
    let section = _findFichaSectionInFrame(fichaFrame, 'tabulacao');
    if (!section) {
      section = figma.createFrame();
      section.name = 'Handoff Completo — Tabulação';
      section.layoutMode = 'HORIZONTAL';
      section.primaryAxisSizingMode = 'AUTO';
      section.counterAxisSizingMode = 'AUTO';
      section.itemSpacing = 24;
      section.fills = [];
      section.setPluginData('hacFichaSection', 'tabulacao');
      _insertFichaSectionInOrder(fichaFrame, section, 'tabulacao');

      const legend = _buildFichaLegendColumn(
        'Ordem de Tabulação',
        'Sequência de foco do teclado (tecla Tab) desta tela — cada selo numerado indica a ordem em que o elemento recebe foco.'
      );
      section.appendChild(legend);
    }

    let itemCount = 0;
    const resolved = area.targetNodeId
      ? await _resolveActiveTabOrderClone(area.id, area.targetNodeId, area.sectionName, designerName)
      : null;
    if (resolved) {
      const { clone, nodeMap } = resolved;
      await _moveActiveCloneIntoFichaSection(clone, section, 'hacTabOrderBadgesGroupForClone');

      // Selos já existentes no overlay não são redesenhados — só os itens
      // ainda sem selo equivalente dentro dele entram aqui. Dedupe por
      // hacTabOrderBadgeForTarget (marcado por _createTabOrderBadge desde
      // 2026-09-09); fallback por `number` no NOME do grupo cobre selos
      // criados ANTES desta correção, que ainda não têm a marca.
      const overlayGroup = _getOrCreateCloneOverlayGroup(clone, 'hacTabOrderBadgesGroupForClone', '[Selos de Tabulação]');
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
        const mappedNode = item && item.targetNodeId ? nodeMap.get(item.targetNodeId) : null;
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
    }

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
  async function _buildFichaSwipeSection(fichaFrame, area, points, designerName) {
    let section = _findFichaSectionInFrame(fichaFrame, 'swipe');
    if (!section) {
      section = figma.createFrame();
      section.name = 'Handoff Completo — Swipe';
      section.layoutMode = 'HORIZONTAL';
      section.primaryAxisSizingMode = 'AUTO';
      section.counterAxisSizingMode = 'AUTO';
      section.itemSpacing = 24;
      section.fills = [];
      section.setPluginData('hacFichaSection', 'swipe');
      _insertFichaSectionInOrder(fichaFrame, section, 'swipe');

      const legend = _buildFichaLegendColumn(
        'Trilha de Swipe',
        'Navegação por gesto de deslizar (swipe), exclusiva do leitor de tela mobile — trilha direcional de pontos, na ordem em que o gesto percorre a tela.'
      );
      section.appendChild(legend);
    }

    try { await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }); } catch (e) { }
    try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (e) { }

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
      card.primaryAxisSizingMode = 'AUTO';
      card.counterAxisSizingMode = 'FIXED';
      card.resize(260, 1);

      const text = figma.createText();
      text.name = 'Texto';
      text.fontName = { family: 'Inter', style: 'Regular' };
      text.fontSize = 11.5;
      text.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
      text.characters = 'Nenhuma trilha de swipe definida para esta área.';
      text.textAutoResize = 'HEIGHT';
      text.layoutAlign = 'STRETCH';
      card.appendChild(text);

      section.appendChild(card);
      return 0;
    }

    const resolved = area.targetNodeId
      ? await _resolveActiveSwipePathClone(area.id, area.targetNodeId, area.sectionName, designerName)
      : null;
    if (!resolved) {
      // Frame original não resolve mais (área apagada/movida) — mesmo
      // fallback textual, agora como erro em vez de estado normal.
      const errorText = figma.createText();
      errorText.name = 'Erro';
      errorText.fontName = { family: 'Inter', style: 'Regular' };
      errorText.fontSize = 11.5;
      errorText.fills = [{ type: 'SOLID', color: { r: 0.7, g: 0.2, b: 0.2 } }];
      errorText.characters = 'Não foi possível localizar/criar a cópia de trabalho para desenhar a trilha — marque a área novamente.';
      figma.currentPage.appendChild(errorText);
      section.appendChild(errorText);
      return 0;
    }

    const { clone, nodeMap } = resolved;
    await _moveActiveCloneIntoFichaSection(clone, section, 'hacSwipePathGroupForClone');

    const resolvedNodes = [];
    for (const p of points) {
      const mappedNode = p && p.nodeId ? nodeMap.get(p.nodeId) : null;
      if (mappedNode && mappedNode.absoluteBoundingBox) resolvedNodes.push(mappedNode);
    }

    if (resolvedNodes.length < 2) {
      // Pontos existem no dado, mas não foram encontrados no clone atual
      // (elementos renomeados/removidos do design desde a última trilha)
      // — a réplica em si já foi inserida (fica visível), só sem a linha.
      return 0;
    }

    // A trilha antiga (se já existir — mesma marca 'hacSwipePathAreaId' do
    // fluxo de trabalho, ver insert-swipe-path: depois de movida pra
    // dentro da Ficha ela continua sendo A MESMA trilha, não uma cópia
    // própria da Ficha) é substituída — Swipe tem no máximo 1 trilha por
    // área, diferente de Tabulação (N selos incrementais), então
    // redesenhar do zero aqui continua correto e mais simples do que
    // tentar diffar segmentos.
    const overlayGroup = _getOrCreateCloneOverlayGroup(clone, 'hacSwipePathGroupForClone', '[Trilha de Swipe]');
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
  async function _buildFichaLeitorSection(fichaFrame, area, specs, designerName) {
    let section = _findFichaSectionInFrame(fichaFrame, 'leitor');
    if (!section) {
      section = figma.createFrame();
      section.name = 'Handoff Completo — Leitor de Tela';
      section.layoutMode = 'HORIZONTAL';
      section.primaryAxisSizingMode = 'AUTO';
      section.counterAxisSizingMode = 'AUTO';
      section.itemSpacing = 16;
      section.counterAxisAlignItems = 'MIN';
      section.fills = [];
      section.setPluginData('hacFichaSection', 'leitor');
      _insertFichaSectionInOrder(fichaFrame, section, 'leitor');

      const legend = _buildFichaLegendColumn(
        'Especificações para Leitor de Tela',
        'Elementos e imagens, estrutura da página, nível de título, elemento decorativo e informações adicionais — cada marcador indica a categoria de acessibilidade documentada naquele ponto da tela.'
      );
      section.appendChild(legend);
    }

    const resolved = area.targetNodeId
      ? await _resolveActiveSpecClone(area.id, area.targetNodeId, area.sectionName, designerName)
      : null;
    if (resolved) {
      await _moveActiveCloneIntoFichaSection(resolved.clone, section, 'hacSpecGroupForClone');
    }

    // Cards de texto SEMPRE recriados do zero a cada "Atualizar" (não
    // carregam estado como a réplica/overlay movidos acima) — remove só os
    // cards antigos, marcados com pluginData próprio, preservando a
    // legenda e a réplica movida intactas.
    for (const child of (section.children || []).slice()) {
      try {
        if (child.getPluginData && child.getPluginData('hacFichaLeitorSpecCard') === 'true') child.remove();
      } catch (e) { }
    }

    try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (e) { }
    try { await figma.loadFontAsync({ family: 'Inter', style: 'Medium' }); } catch (e) { }
    try { await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }); } catch (e) { }

    let specCount = 0;
    for (const spec of (specs || [])) {
      try {
        const themeColor = hexToRgb(spec.categoryColor || '#0891B2');
        const themeFill = hexToRgb(spec.categoryFill || spec.categoryColor || '#EBF4FB');

        const card = figma.createFrame();
        card.name = `Spec ${spec.letter || ''}`.trim();
        card.layoutMode = 'VERTICAL';
        card.paddingLeft = 12; card.paddingRight = 12; card.paddingTop = 12; card.paddingBottom = 12;
        card.itemSpacing = 8;
        card.cornerRadius = 8;
        card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        card.strokes = [{ type: 'SOLID', color: themeColor }];
        card.strokeWeight = 1.5;
        card.primaryAxisSizingMode = 'AUTO';
        card.counterAxisSizingMode = 'FIXED';
        card.resize(240, 1);
        card.setPluginData('hacFichaLeitorSpecCard', 'true');

        const headerRow = figma.createFrame();
        headerRow.layoutMode = 'HORIZONTAL';
        headerRow.itemSpacing = 8;
        headerRow.fills = [];
        headerRow.primaryAxisSizingMode = 'AUTO';
        headerRow.counterAxisSizingMode = 'AUTO';
        headerRow.counterAxisAlignItems = 'CENTER';

        const tagCircle = figma.createFrame();
        tagCircle.name = 'Tag';
        tagCircle.layoutMode = 'HORIZONTAL';
        tagCircle.primaryAxisSizingMode = 'FIXED';
        tagCircle.counterAxisSizingMode = 'FIXED';
        tagCircle.resize(32, 32);
        tagCircle.cornerRadius = 16;
        tagCircle.fills = [{ type: 'SOLID', color: themeFill }];
        tagCircle.strokes = [{ type: 'SOLID', color: themeColor }];
        tagCircle.strokeWeight = 1.5;
        tagCircle.primaryAxisAlignItems = 'CENTER';
        tagCircle.counterAxisAlignItems = 'CENTER';
        const tagText = figma.createText();
        tagText.fontName = { family: 'Inter', style: 'Bold' };
        tagText.fontSize = 14;
        tagText.fills = [{ type: 'SOLID', color: themeColor }];
        tagText.characters = spec.letter || '•';
        tagCircle.appendChild(tagText);
        headerRow.appendChild(tagCircle);

        const title = figma.createText();
        title.fontName = { family: 'Inter', style: 'Bold' };
        title.fontSize = 11;
        title.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
        title.characters = spec.targetNodeName || spec.categoryLabel || 'Elemento';
        title.textAutoResize = 'HEIGHT';
        title.layoutAlign = 'STRETCH';
        headerRow.appendChild(title);
        card.appendChild(headerRow);

        if (spec.categoryLabel) {
          const pill = figma.createFrame();
          pill.name = `Categoria/${spec.categoryLabel}`;
          pill.layoutMode = 'HORIZONTAL';
          pill.paddingLeft = 8; pill.paddingRight = 8; pill.paddingTop = 4; pill.paddingBottom = 4;
          pill.cornerRadius = 12;
          pill.primaryAxisSizingMode = 'AUTO';
          pill.counterAxisSizingMode = 'AUTO';
          pill.fills = [{ type: 'SOLID', color: themeFill }];
          pill.strokes = [{ type: 'SOLID', color: themeColor }];
          const pillText = figma.createText();
          pillText.fontName = { family: 'Inter', style: 'Medium' };
          pillText.fontSize = 9;
          pillText.fills = [{ type: 'SOLID', color: themeColor }];
          pillText.characters = spec.categoryLabel;
          pill.appendChild(pillText);
          card.appendChild(pill);
        }

        // Campos por spec.fields[] — já filtrados/resolvidos no frontend
        // (_fichaBuildSpecPayload), então um campo ausente na categoria da
        // spec simplesmente não está no array, nunca aparece com valor vazio.
        (spec.fields || []).forEach(f => {
          if (!f || !f.value) return;
          const fieldCol = figma.createFrame();
          fieldCol.name = `Campo/${f.label}`;
          fieldCol.layoutMode = 'VERTICAL';
          fieldCol.itemSpacing = 2;
          fieldCol.fills = [];
          fieldCol.primaryAxisSizingMode = 'AUTO';
          fieldCol.counterAxisSizingMode = 'AUTO';
          fieldCol.layoutAlign = 'STRETCH';

          const fLabel = figma.createText();
          fLabel.fontName = { family: 'Inter', style: 'Medium' };
          fLabel.fontSize = 9;
          fLabel.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
          fLabel.characters = f.label.toUpperCase();
          fLabel.textAutoResize = 'HEIGHT';
          fLabel.layoutAlign = 'STRETCH';

          const fVal = figma.createText();
          fVal.fontName = { family: 'Inter', style: 'Regular' };
          fVal.fontSize = 10.5;
          fVal.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
          fVal.characters = String(f.value);
          fVal.textAutoResize = 'HEIGHT';
          fVal.layoutAlign = 'STRETCH';

          fieldCol.appendChild(fLabel);
          fieldCol.appendChild(fVal);
          card.appendChild(fieldCol);
        });

        section.appendChild(card);
        specCount++;
      } catch (e) {
        console.error('[hac] _buildFichaLeitorSection: falha ao montar card de spec.', e && e.message);
      }
    }

    return specCount;
  }

  // Seção "Handoff Review" da Ficha (2026-09-08, 4º e último bloco,
  // sempre na ponta direita — ver FICHA_SECTION_ORDER) — o CONSOLIDADO
  // do que já foi inserido nas outras 3 seções, sem instrução didática
  // nem réplica própria (confirmado pelo usuário: "não precisa de
  // instrução. Ele é o consolidado de tudo"). `sectionsSummary` e
  // `categoryBreakdown` chegam já calculados do frontend
  // (_fichaInsertSection, handoff-ficha.js) — o backend não tem acesso a
  // hacData/A11Y_CATEGORIES, mesmo padrão já usado por items/points/specs
  // das outras 3 seções. Nunca bloqueia: se nada foi inserido ainda, mostra
  // 1 card avisando isso, em vez de recusar a inserção.
  // 2026-09-09: mais 2 blocos, mesmo padrão — `titleHierarchy` (specs
  // "titulo" ordenadas por camada, com letter H1-H6/H e cor já resolvida —
  // só existe pra área web, ver checagem `if (!isMobile)` em
  // _fichaInsertSection) e `decorativeItems` (specs "decorativo", com cor e
  // badge "Ø" já resolvidos, web+mobile) — dado 100% real de a11ySpecs, sem
  // checklist inventado. `titleHierarchy` também traz, por item, o nome do
  // componente DSC (`componentName`, já limpo no frontend) e — resolvido
  // aqui no backend, direto do node real via textStyleId/getStyleByIdAsync,
  // mesmo padrão de _a11yScanArea (categoria "typography") — o nome do
  // token tipográfico vinculado ao texto, quando existir.
  async function _buildFichaReviewSection(fichaFrame, area, sectionsSummary, categoryBreakdown, titleHierarchy, decorativeItems, designerName) {
    _removeFichaSectionInFrame(fichaFrame, 'review');

    const section = figma.createFrame();
    section.name = 'Handoff Completo — Handoff Review';
    section.layoutMode = 'VERTICAL';
    section.primaryAxisSizingMode = 'AUTO';
    section.counterAxisSizingMode = 'AUTO';
    section.itemSpacing = 12;
    section.fills = [];
    section.setPluginData('hacFichaSection', 'review');
    _insertFichaSectionInOrder(fichaFrame, section, 'review');

    try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (e) { }
    try { await figma.loadFontAsync({ family: 'Inter', style: 'Medium' }); } catch (e) { }
    try { await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }); } catch (e) { }

    const title = figma.createText();
    title.name = 'Título';
    title.fontName = { family: 'Inter', style: 'Bold' };
    title.fontSize = 14;
    title.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    title.characters = 'Handoff Review';
    title.textAutoResize = 'HEIGHT';
    section.appendChild(title);

    const hasAnySummary = Array.isArray(sectionsSummary) && sectionsSummary.length > 0;
    const hasAnyBreakdown = Array.isArray(categoryBreakdown) && categoryBreakdown.length > 0;
    const hasAnyTitles = Array.isArray(titleHierarchy) && titleHierarchy.length > 0;
    const hasAnyDecorative = Array.isArray(decorativeItems) && decorativeItems.length > 0;

    if (!hasAnySummary && !hasAnyBreakdown && !hasAnyTitles && !hasAnyDecorative) {
      const emptyCard = figma.createFrame();
      emptyCard.name = 'Vazio';
      emptyCard.layoutMode = 'VERTICAL';
      emptyCard.paddingLeft = 12; emptyCard.paddingRight = 12; emptyCard.paddingTop = 12; emptyCard.paddingBottom = 12;
      emptyCard.cornerRadius = 8;
      emptyCard.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
      emptyCard.strokes = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
      emptyCard.strokeWeight = 1;
      emptyCard.primaryAxisSizingMode = 'AUTO';
      emptyCard.counterAxisSizingMode = 'FIXED';
      emptyCard.resize(260, 1);
      const emptyText = figma.createText();
      emptyText.fontName = { family: 'Inter', style: 'Regular' };
      emptyText.fontSize = 11;
      emptyText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
      emptyText.characters = 'Nada documentado nesta ficha ainda — insira as seções nas abas de trabalho.';
      emptyText.textAutoResize = 'HEIGHT';
      emptyText.layoutAlign = 'STRETCH';
      emptyCard.appendChild(emptyText);
      section.appendChild(emptyCard);
      return 0;
    }

    // Cards de status por seção já inserida — mesma paleta neutra
    // (cyan de destaque) usada pelos cards de status do dashboard
    // (_fichaStatusCardHtml, handoff-ficha.js), só que como frames reais
    // no canvas em vez de HTML.
    if (hasAnySummary) {
      const summaryRow = figma.createFrame();
      summaryRow.name = 'Resumo por seção';
      summaryRow.layoutMode = 'HORIZONTAL';
      summaryRow.itemSpacing = 8;
      summaryRow.fills = [];
      summaryRow.primaryAxisSizingMode = 'AUTO';
      summaryRow.counterAxisSizingMode = 'AUTO';
      section.appendChild(summaryRow);

      sectionsSummary.forEach(item => {
        if (!item || !item.label) return;
        const card = figma.createFrame();
        card.name = `Status/${item.label}`;
        card.layoutMode = 'VERTICAL';
        card.paddingLeft = 10; card.paddingRight = 10; card.paddingTop = 8; card.paddingBottom = 8;
        card.itemSpacing = 2;
        card.cornerRadius = 8;
        card.fills = [{ type: 'SOLID', color: { r: 0.925, g: 0.976, b: 0.984 } }];
        card.strokes = [{ type: 'SOLID', color: { r: 0.03, g: 0.55, b: 0.62 } }];
        card.strokeWeight = 1;
        card.primaryAxisSizingMode = 'AUTO';
        card.counterAxisSizingMode = 'AUTO';

        const labelText = figma.createText();
        labelText.fontName = { family: 'Inter', style: 'Medium' };
        labelText.fontSize = 9;
        labelText.fills = [{ type: 'SOLID', color: { r: 0.03, g: 0.4, b: 0.45 } }];
        labelText.characters = item.label.toUpperCase();
        labelText.textAutoResize = 'HEIGHT';
        card.appendChild(labelText);

        const countText = figma.createText();
        countText.fontName = { family: 'Inter', style: 'Bold' };
        countText.fontSize = 13;
        countText.fills = [{ type: 'SOLID', color: { r: 0.03, g: 0.55, b: 0.62 } }];
        countText.characters = String(item.countLabel || item.count || 0);
        countText.textAutoResize = 'HEIGHT';
        card.appendChild(countText);

        summaryRow.appendChild(card);
      });
    }

    // Lista compacta de specs por categoria — mesmo dado de
    // categoryBreakdown já calculado hoje em _a11yAreaAccordionEl
    // (accessibility.js), reaproveitado aqui só pra exibição.
    if (hasAnyBreakdown) {
      const breakdownCol = figma.createFrame();
      breakdownCol.name = 'Specs por categoria';
      breakdownCol.layoutMode = 'VERTICAL';
      breakdownCol.itemSpacing = 4;
      breakdownCol.fills = [];
      breakdownCol.primaryAxisSizingMode = 'AUTO';
      breakdownCol.counterAxisSizingMode = 'FIXED';
      breakdownCol.resize(260, 1);
      section.appendChild(breakdownCol);

      categoryBreakdown.forEach(item => {
        if (!item || !item.label) return;
        const row = figma.createFrame();
        row.layoutMode = 'HORIZONTAL';
        row.itemSpacing = 6;
        row.fills = [];
        row.primaryAxisSizingMode = 'AUTO';
        row.counterAxisSizingMode = 'AUTO';
        row.counterAxisAlignItems = 'CENTER';

        const dot = figma.createEllipse();
        dot.resize(6, 6);
        dot.fills = [{ type: 'SOLID', color: hexToRgb(item.color || '#0891B2') }];
        row.appendChild(dot);

        const rowText = figma.createText();
        rowText.fontName = { family: 'Inter', style: 'Regular' };
        rowText.fontSize = 10.5;
        rowText.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
        rowText.characters = `${item.label} (${item.count || 0})`;
        rowText.textAutoResize = 'HEIGHT';
        row.appendChild(rowText);

        breakdownCol.appendChild(row);
      });
    }

    // Hierarquia de títulos (2026-09-09) — lista das specs "titulo" já
    // ordenadas por ordem de leitura real (mesmo dado de _fichaInsertSection,
    // handoff-ficha.js). Indenta visualmente por nível (H1 sem indent, H2 um
    // tico, H3 mais um...) pra reforçar a hierarquia lógica. Só existe de
    // fato na origem web (lib "Design Acessível" só distingue H1-H6 nesse
    // fluxo) — pra área mobile o frontend já nem envia titleHierarchy
    // (hasAnyTitles fica false), então este bloco simplesmente não desenha
    // nada, mesmo padrão de "sem bloco vazio" do resto do card.
    if (hasAnyTitles) {
      const titlesCol = figma.createFrame();
      titlesCol.name = 'Hierarquia de títulos';
      titlesCol.layoutMode = 'VERTICAL';
      titlesCol.itemSpacing = 6;
      titlesCol.fills = [];
      titlesCol.primaryAxisSizingMode = 'AUTO';
      titlesCol.counterAxisSizingMode = 'FIXED';
      titlesCol.resize(260, 1);
      section.appendChild(titlesCol);

      const titlesHeading = figma.createText();
      titlesHeading.fontName = { family: 'Inter', style: 'Medium' };
      titlesHeading.fontSize = 10;
      titlesHeading.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      titlesHeading.characters = 'HIERARQUIA DE TÍTULOS';
      titlesHeading.textAutoResize = 'HEIGHT';
      titlesCol.appendChild(titlesHeading);

      // Token tipográfico real (2026-09-09) — nome do text style vinculado
      // ao node do título, mesmo padrão já usado em _a11yScanArea (categoria
      // "typography": textStyleId + figma.getStyleByIdAsync). Resolve o
      // clone ativo da área UMA vez (mesmo mecanismo de tradução
      // original→clone já usado por Leitor de Tela/Tabulação/Swipe, evita
      // reintroduzir o bug de nodeId não traduzido entre clones) — se não
      // houver clone/área resolvível, cai pro node original via
      // figma.getNodeByIdAsync. Nunca impeditivo: falha em achar o node ou
      // o token de UM item só omite essa informação extra naquele item.
      let titleCloneResolved = null;
      try {
        titleCloneResolved = area.targetNodeId
          ? await _resolveActiveSpecClone(area.id, area.targetNodeId, area.sectionName, designerName)
          : null;
      } catch (e) { titleCloneResolved = null; }

      for (const item of titleHierarchy) {
        if (!item) continue;
        let typographyTokenName = null;
        try {
          let targetNode = null;
          if (item.targetNodeId && titleCloneResolved && titleCloneResolved.nodeMap) {
            targetNode = titleCloneResolved.nodeMap.get(item.targetNodeId) || null;
          }
          if (!targetNode && item.targetNodeId) {
            targetNode = await figma.getNodeByIdAsync(item.targetNodeId);
          }
          if (targetNode && targetNode.type !== 'TEXT') {
            targetNode = _findFirstTextNode(targetNode, 0);
          }
          if (targetNode && targetNode.type === 'TEXT' && 'textStyleId' in targetNode &&
            typeof targetNode.textStyleId === 'string' && targetNode.textStyleId !== figma.mixed && targetNode.textStyleId) {
            const style = await figma.getStyleByIdAsync(targetNode.textStyleId);
            if (style) typographyTokenName = style.name;
          }
        } catch (e) { typographyTokenName = null; }

        const letter = item.letter || 'H';
        const levelMatch = /^H(\d)$/.exec(letter);
        const level = levelMatch ? parseInt(levelMatch[1], 10) : 1;
        const indent = Math.max(0, (level - 1)) * 12;

        const row = figma.createFrame();
        row.layoutMode = 'HORIZONTAL';
        row.itemSpacing = 6;
        row.fills = [];
        row.primaryAxisSizingMode = 'AUTO';
        row.counterAxisSizingMode = 'AUTO';
        row.counterAxisAlignItems = 'CENTER';
        if (indent > 0) { row.paddingLeft = indent; }

        const badge = figma.createFrame();
        badge.layoutMode = 'HORIZONTAL';
        badge.primaryAxisAlignItems = 'CENTER';
        badge.counterAxisAlignItems = 'CENTER';
        badge.paddingLeft = 5; badge.paddingRight = 5; badge.paddingTop = 2; badge.paddingBottom = 2;
        badge.cornerRadius = 4;
        badge.fills = [{ type: 'SOLID', color: hexToRgb(item.color || '#AFCA0B') }];
        badge.primaryAxisSizingMode = 'AUTO';
        badge.counterAxisSizingMode = 'AUTO';

        const badgeText = figma.createText();
        badgeText.fontName = { family: 'Inter', style: 'Bold' };
        badgeText.fontSize = 9;
        badgeText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        badgeText.characters = letter;
        badgeText.textAutoResize = 'WIDTH_AND_HEIGHT';
        badge.appendChild(badgeText);
        row.appendChild(badge);

        // Coluna nome do elemento + (opcional) nome do componente DSC real
        // por trás da spec — mesmo padrão label/valor pequeno-cinza-embaixo
        // já usado nos campos de spec.fields em _buildFichaLeitorSection.
        const textCol = figma.createFrame();
        textCol.layoutMode = 'VERTICAL';
        textCol.itemSpacing = 1;
        textCol.fills = [];
        textCol.primaryAxisSizingMode = 'AUTO';
        textCol.counterAxisSizingMode = 'AUTO';

        const rowText = figma.createText();
        rowText.fontName = { family: 'Inter', style: 'Regular' };
        rowText.fontSize = 10.5;
        rowText.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
        rowText.characters = item.targetNodeName || '(sem nome)';
        rowText.textAutoResize = 'HEIGHT';
        textCol.appendChild(rowText);

        if (item.componentName) {
          const componentText = figma.createText();
          componentText.fontName = { family: 'Inter', style: 'Regular' };
          componentText.fontSize = 9;
          componentText.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
          componentText.characters = item.componentName;
          componentText.textAutoResize = 'HEIGHT';
          textCol.appendChild(componentText);
        }

        // Token tipográfico real vinculado ao TEXT (textStyleId), resolvido
        // acima — omitido quando o texto não tem token vinculado (sinal
        // por si só de falta de conformidade declarada com a lib DSC, mas
        // não bloqueia a montagem do item).
        if (typographyTokenName) {
          const tokenText = figma.createText();
          tokenText.fontName = { family: 'Inter', style: 'Regular' };
          tokenText.fontSize = 9;
          tokenText.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
          tokenText.characters = `Token: ${typographyTokenName}`;
          tokenText.textAutoResize = 'HEIGHT';
          textCol.appendChild(tokenText);
        }

        row.appendChild(textCol);

        titlesCol.appendChild(row);
      }
    }

    // Itens decorativos (2026-09-09) — lista das specs "decorativo", com o
    // badge fixo dessa categoria (Ø, A11Y_CATEGORIES.decorativo.badge).
    if (hasAnyDecorative) {
      const decorativeCol = figma.createFrame();
      decorativeCol.name = 'Itens decorativos';
      decorativeCol.layoutMode = 'VERTICAL';
      decorativeCol.itemSpacing = 6;
      decorativeCol.fills = [];
      decorativeCol.primaryAxisSizingMode = 'AUTO';
      decorativeCol.counterAxisSizingMode = 'FIXED';
      decorativeCol.resize(260, 1);
      section.appendChild(decorativeCol);

      const decorativeHeading = figma.createText();
      decorativeHeading.fontName = { family: 'Inter', style: 'Medium' };
      decorativeHeading.fontSize = 10;
      decorativeHeading.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
      decorativeHeading.characters = 'ITENS DECORATIVOS';
      decorativeHeading.textAutoResize = 'HEIGHT';
      decorativeCol.appendChild(decorativeHeading);

      decorativeItems.forEach(item => {
        if (!item) return;
        const row = figma.createFrame();
        row.layoutMode = 'HORIZONTAL';
        row.itemSpacing = 6;
        row.fills = [];
        row.primaryAxisSizingMode = 'AUTO';
        row.counterAxisSizingMode = 'AUTO';
        row.counterAxisAlignItems = 'CENTER';

        const badge = figma.createFrame();
        badge.layoutMode = 'HORIZONTAL';
        badge.primaryAxisAlignItems = 'CENTER';
        badge.counterAxisAlignItems = 'CENTER';
        badge.paddingLeft = 5; badge.paddingRight = 5; badge.paddingTop = 2; badge.paddingBottom = 2;
        badge.cornerRadius = 4;
        badge.fills = [{ type: 'SOLID', color: hexToRgb(item.color || '#D93636') }];
        badge.primaryAxisSizingMode = 'AUTO';
        badge.counterAxisSizingMode = 'AUTO';

        const badgeText = figma.createText();
        badgeText.fontName = { family: 'Inter', style: 'Bold' };
        badgeText.fontSize = 9;
        badgeText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        badgeText.characters = item.badge || 'Ø';
        badgeText.textAutoResize = 'WIDTH_AND_HEIGHT';
        badge.appendChild(badgeText);
        row.appendChild(badge);

        // Coluna nome do elemento + (opcional) nome do componente DSC real —
        // mesmo padrão da lista de hierarquia de títulos acima.
        const textCol = figma.createFrame();
        textCol.layoutMode = 'VERTICAL';
        textCol.itemSpacing = 1;
        textCol.fills = [];
        textCol.primaryAxisSizingMode = 'AUTO';
        textCol.counterAxisSizingMode = 'AUTO';

        const rowText = figma.createText();
        rowText.fontName = { family: 'Inter', style: 'Regular' };
        rowText.fontSize = 10.5;
        rowText.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
        rowText.characters = item.targetNodeName || '(sem nome)';
        rowText.textAutoResize = 'HEIGHT';
        textCol.appendChild(rowText);

        if (item.componentName) {
          const componentText = figma.createText();
          componentText.fontName = { family: 'Inter', style: 'Regular' };
          componentText.fontSize = 9;
          componentText.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.55, b: 0.55 } }];
          componentText.characters = item.componentName;
          componentText.textAutoResize = 'HEIGHT';
          textCol.appendChild(componentText);
        }

        row.appendChild(textCol);

        decorativeCol.appendChild(row);
      });
    }

    return (sectionsSummary || []).length + (categoryBreakdown || []).length + (titleHierarchy || []).length + (decorativeItems || []).length;
  }

  // Handler único — despacha pro builder da seção pedida, sempre garantindo
  // primeiro que o frame-container da Ficha existe. `msg.area` chega do
  // frontend já resolvido (mesmo objeto de a11yAreas, com handoffFrameId se
  // já existir) — o backend nunca lê hacData diretamente (só existe do lado
  // do frontend, ver core.js).
  if (msg.type === "insert-ficha-section") {
    (async () => {
      const area = msg.area;
      const sectionKey = msg.sectionKey;
      if (!area || !area.id || !['tabulacao', 'swipe', 'leitor', 'review'].includes(sectionKey)) {
        figma.ui.postMessage({ type: 'ficha-section-insert-failed', areaId: area && area.id, sectionKey, reason: 'Dados inválidos.' });
        return;
      }

      // Tabulação e Swipe (2026-09-08: Swipe voltou a clonar a área pra
      // desenhar a trilha real, ver _buildFichaSwipeSection) precisam do
      // frame original resolvível. Leitor de Tela clona por conta própria
      // via _resolveActiveSpecClone (specs já resolvidas antes de chegar
      // aqui). Review não clona nada — é o consolidado, sem depender do
      // frame original existir.
      const root = area.targetNodeId ? await figma.getNodeByIdAsync(area.targetNodeId) : null;
      if ((sectionKey === 'tabulacao' || sectionKey === 'swipe') && (!root || !root.absoluteBoundingBox)) {
        figma.ui.postMessage({
          type: 'ficha-section-insert-failed', areaId: area.id, sectionKey,
          reason: 'O frame original desta área não existe mais no canvas — marque a área novamente.'
        });
        return;
      }

      let fichaFrame;
      try {
        fichaFrame = await _createOrGetFichaFrame(area, msg.designerName);
      } catch (e) {
        // Mensagem específica exposta ao designer (2026-09-09) — antes só
        // "Não foi possível criar o frame da Ficha." genérico, com a causa
        // real só no console do Figma (invisível pra quem reporta o bug).
        console.error('[hac] insert-ficha-section: falha ao criar/obter o frame do Handoff Completo.', e && (e.stack || e.message));
        figma.ui.postMessage({
          type: 'ficha-section-insert-failed', areaId: area.id, sectionKey,
          reason: `Não foi possível criar o frame do Handoff Completo: ${(e && e.message) || 'erro desconhecido'}`
        });
        return;
      }

      let itemCount = 0;
      try {
        if (sectionKey === 'tabulacao') {
          itemCount = await _buildFichaTabulacaoSection(fichaFrame, area, msg.items || [], msg.designerName);
        } else if (sectionKey === 'swipe') {
          itemCount = await _buildFichaSwipeSection(fichaFrame, area, msg.points || [], msg.designerName);
        } else if (sectionKey === 'leitor') {
          itemCount = await _buildFichaLeitorSection(fichaFrame, area, msg.specs || [], msg.designerName);
        } else if (sectionKey === 'review') {
          itemCount = await _buildFichaReviewSection(fichaFrame, area, msg.sectionsSummary || [], msg.categoryBreakdown || [], msg.titleHierarchy || [], msg.decorativeItems || [], msg.designerName);
        }
      } catch (e) {
        console.error('[hac] insert-ficha-section: falha ao montar a seção "' + sectionKey + '".', e && e.message);
        figma.ui.postMessage({ type: 'ficha-section-insert-failed', areaId: area.id, sectionKey, reason: e && e.message ? e.message : 'Falha ao montar a seção.' });
        return;
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

  // Exclusão em cascata — mesmo padrão de delete-tab-order-copy-for-area,
  // localizando só por pluginData.
  if (msg.type === "delete-ficha-for-area") {
    _forEachFichaFrameCandidate(sibling => {
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacFichaForArea') === msg.areaId) {
          sibling.remove();
        }
      } catch (e) { }
    });
    return;
  }

  // Ocultar/mostrar em cascata — mesmo padrão de
  // toggle-tab-order-copy-visibility. Fire-and-forget.
  if (msg.type === "toggle-ficha-visibility") {
    _forEachFichaFrameCandidate(sibling => {
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacFichaForArea') === msg.areaId) {
          sibling.visible = !!msg.visible;
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
      const node = msg.frameId ? await figma.getNodeByIdAsync(msg.frameId) : null;
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
