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
// FICHA_INSTRUCTION_CONTENT (import de JSON) foi junto pro onmessage.js
// (2026-09-14) — só era usado dentro do dispatcher (_buildFichaInstructionOnlyLegendColumn/
// _buildFichaLegendColumn), nunca em code.js diretamente. Bug real
// corrigido: esse import de JSON não tinha sido migrado junto com o resto
// do onmessage na Camada 2 parte 1 (grep original só pegou function/const/
// let, não import), causando "'FICHA_INSTRUCTION_CONTENT' is not defined"
// ao inserir a Ordem de Tabulação na Ficha (reportado com print pelo
// usuário, 2026-09-14).
// Motor de matching DSC→a11y e scan automático de área — EXTRAÍDO
// (2026-09-14, Camada 1 da modularização do backend) para
// backend/dsc-matching.js. Os imports de DSC_A11Y_MAPPING*/REF_SKELETON
// que este bloco usava foram junto — code.js não os consome mais
// diretamente, só através destas funções importadas.
import {
  _getDscComponentKeyToFrameMap,
  _resolveDscComponentA11yMatch,
  _resolveManualSpecMatchAndNotify,
  A11Y_INTERACTIVE_SHORTNAMES,
  _isA11yInteractiveComponentKey,
  _findVisibleLabelText,
  _a11yScanArea,
} from './backend/dsc-matching.js';

figma.showUI(__html__, { width: 480, height: 750 });

// Rede de segurança de MIGRAÇÃO (2026-09-11): o retângulo `[HighlightStroke]`
// em si foi removido por completo (pedido do usuário: "surge e não se apaga
// sozinha... Pode remover ele por completo. ñ preciso dele" — visto no botão
// "Ver no canvas" do alerta de handoff prévio, que fica visível na tela o
// tempo todo e nunca dava motivo/gatilho pro stroke sumir sozinho; a seleção
// nativa do Figma, sempre aplicada por highlight-node, já basta). Esta
// função continua existindo só pra limpar `[HighlightStroke]` que já tenham
// sobrado em arquivos de designers que usaram versões anteriores do hac —
// sem gerador ativo, é puramente defensiva/temporária, mas remover as
// chamadas agora deixaria esse lixo órfão preso pra sempre nesses arquivos.
export function _clearOrphanedHighlightStrokes() {
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
// _TAB_ORDER_ROW_GAP: 32 → 40 → 64 → 40px (2026-09-11, mesma sessão) —
// pedido do usuário oscilou de "muito coladas" pra "muito amplo" com 64px;
// 40 fica no meio, mais respiro que o original sem o vão exagerado de 64.
const _TAB_ORDER_ROW_GAP = 40;
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
export const _activeTabOrderCloneMaps = new Map();

// Mesmo raciocínio, espelhado pra Trilha de Swipe (2026-09-04-ac): a
// linha direcional com setas precisa ser desenhada sobre uma CÓPIA da
// Área, nunca sobre o frame original do design — mesmo requisito que
// Ordem de Tabulação já cumpre. Nunca compartilha o Map com Tabulação:
// cada feature tem sua própria cópia ativa por área, podem coexistir se
// o designer abrir as 2 tabs em sequência sem confirmar nenhuma. Mesma
// migração pra Map<areaId, nodeMap> (2026-09-08) e mesmo motivo de
// _activeTabOrderCloneMaps acima.
export const _activeSwipePathCloneMaps = new Map();

// Mesmo raciocínio e mesma migração pra Map<areaId, nodeMap> (2026-09-08),
// espelhado pra Especificações (Leitor de Tela): create-unified-spec
// passou a desenhar sobre uma CÓPIA da área (antes desenhava direto sobre
// o frame ORIGINAL) — mesma garantia de nunca tocar o design original que
// Tabulação/Swipe já davam. Nunca compartilha Map com as outras duas
// features (cada uma tem seu próprio clone ativo por área).
export const _activeSpecCloneMaps = new Map();

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
export function _resolveOriginalNodeIdFromTabOrderClone(areaId, nodeId) {
  const tabOrderMap = areaId ? _activeTabOrderCloneMaps.get(areaId) : null;
  if (!tabOrderMap) return nodeId;
  for (const [originalId, clonedNode] of tabOrderMap.entries()) {
    if (clonedNode && clonedNode.id === nodeId) return originalId;
  }
  return nodeId;
}

// Remove (se existir) a cópia rascunho de Ordem de Tabulação da área
// informada e zera o estado em memória correspondente — usada pelo handler
// de mensagem "delete-tab-order-draft-copy" (cancelamento EXPLÍCITO do
// designer, botão "Cancelar" no modal de revisão — aí sim é sempre seguro
// remover incondicionalmente, o designer pediu). 100% síncrona
// (getPluginData/remove não retornam Promise) de propósito.
export function _deleteTabOrderDraftCopy(areaId) {
  _removeExistingTabOrderCopiesForArea(areaId);
  _activeTabOrderCloneMaps.delete(areaId);
}

// Bug real corrigido (2026-09-10, reportado pelo usuário: "se eu fecho o
// plugin, tudo que eu construí é apagado"). figma.on('close', ...) rodava a
// MESMA remoção incondicional acima para TODA área com clone ativo em
// memória (_activeTabOrderCloneMaps/_activeSwipePathCloneMaps) — mas esses
// Maps não distinguem "cópia rascunho no meio de uma captura, nunca
// aplicada nem cancelada" (o caso que este handler foi escrito para
// limpar, evitando lixo órfão no .fig) de "clone de trabalho JÁ CONFIRMADO,
// com selos/trilha/specs reais desenhados, possivelmente já movido pra
// dentro do Handoff Completo" — que é o caso normal depois que o modelo
// virou "1 clone por tipo por área, reaproveitado incrementalmente"
// (2026-09-09, decisão de produto: "não precisamos da réplica da réplica").
// Fechar a janela do plugin (sem fechar o Figma) sempre dispara este
// handler — então todo trabalho já confirmado era apagado só por fechar a
// UI, mesmo com o arquivo aberto o tempo todo. Corrigido checando se o
// overlay de artefatos tem conteúdo REAL (mais que o "seed" que só existe
// pra manter o GROUP vivo, ver _getOrCreateCloneOverlayGroup) antes de
// remover — só descarta clones genuinamente vazios (capturas abertas e
// nunca confirmadas).
function _cloneOverlayHasRealContent(overlayGroup) {
  if (!overlayGroup || !Array.isArray(overlayGroup.children)) return false;
  return overlayGroup.children.some(child => {
    try { return !(child.name && child.name.indexOf('seed (não remover') === 0); } catch (e) { return true; }
  });
}

// Só remove clones de Tabulação/Swipe que ainda não têm nenhum trabalho
// real (overlay vazio ou inexistente) — usado exclusivamente pelo
// figma.on('close', ...) abaixo. Nunca usado pelo cancelamento explícito
// (_deleteTabOrderDraftCopy/delete-tab-order-draft-copy), que continua
// removendo incondicionalmente por ser um pedido direto do designer.
function _deleteTabOrderCloneIfEmpty(areaId) {
  _forEachTabOrderCopyCandidate(sibling => {
    try {
      if (sibling.getPluginData && sibling.getPluginData('hacTabOrderCopyForArea') === areaId) {
        const overlay = _findCloneOverlaySibling(sibling, 'hacTabOrderBadgesGroupForClone');
        if (!_cloneOverlayHasRealContent(overlay)) {
          _removeExistingTabOrderCopiesForArea(areaId);
        }
      }
    } catch (e) { }
  });
  _activeTabOrderCloneMaps.delete(areaId);
}

function _deleteSwipePathCloneIfEmpty(areaId) {
  _forEachSwipePathCopyCandidate(sibling => {
    try {
      if (sibling.getPluginData && sibling.getPluginData('hacSwipePathCopyForArea') === areaId) {
        const overlay = _findCloneOverlaySibling(sibling, 'hacSwipePathGroupForClone');
        if (!_cloneOverlayHasRealContent(overlay)) {
          _removeExistingSwipePathCopiesForArea(areaId);
        }
      }
    } catch (e) { }
  });
  _activeSwipePathCloneMaps.delete(areaId);
}

figma.on('close', () => {
  // Só descarta clones sem NENHUM trabalho real (capturas abertas e nunca
  // confirmadas) — clones com selos/trilha/specs reais são preservados,
  // mesmo que o plugin seja fechado no meio do trabalho.
  for (const areaId of Array.from(_activeTabOrderCloneMaps.keys())) {
    _deleteTabOrderCloneIfEmpty(areaId);
  }
  for (const areaId of Array.from(_activeSwipePathCloneMaps.keys())) {
    _deleteSwipePathCloneIfEmpty(areaId);
  }
});

// "Ordem de Tabulação"/"Trilha de Swipe"/matching manual do "+ Nova spec":
// estado de modo de clique + listener de seleção — EXTRAÍDOS (2026-09-14,
// Camada 2 da modularização do backend) para backend/onmessage.js, junto
// com figma.on('selectionchange', ...) que os lê/muta. Só migraram porque
// são atribuídos (não só lidos) tanto pelo onmessage (start-tab-order-mode/
// stop-tab-order-mode etc.) quanto pelo listener — em módulos ES, um `let`
// importado não pode ser reatribuído fora do módulo que o declara, então
// listener e onmessage precisam morar juntos com esse estado.

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
export function _resolveTabOrderCloneSelectionToOriginalId(cloneNodeId) {
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
export function _resolveSwipePathCloneSelectionToOriginalId(cloneNodeId) {
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
export function _orderNodesInZigzagReadingOrder(nodes) {
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

// Listener de seleção do canvas ('selectionchange') pros modos de captura
// de Ordem de Tabulação/Trilha de Swipe/matching manual — EXTRAÍDO
// (2026-09-14, Camada 2) para backend/onmessage.js, junto com o estado
// mutável que ele compartilha com o dispatcher figma.ui.onmessage (ver
// comentário completo acima, no lugar onde os `let` viviam).

// Usar APENAS onde o destino é selecionar/focar o nó (figma.currentPage.
// selection = [...] + scrollAndZoomIntoView): selecionar exige que o nó
// esteja na página que o usuário está vendo. Para "esse nó ainda é um
// container válido?", use _nodeIsAttached abaixo — ver a nota lá.
export function _nodeOnCurrentPage(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n != null && n.id === figma.currentPage.id;
}

// Cisão de _nodeOnCurrentPage (2026-09-15). Os dois testes andavam juntos
// porque o hac só operava numa página; com a página dedicada de Handoff
// eles divergem.
//
// Aqui a pergunta é só "o nó continua ANEXADO à árvore do documento?" —
// usado ao decidir se um clone de trabalho cacheado ainda serve de
// container pra appendChild. Um nó pode não estar removido (.removed ===
// false) e mesmo assim ter sido desanexado (pai removido, detach
// intermediário); nesse caso a subida por .parent termina em null, e é
// isso que este predicado pega. Comparar com a página corrente seria
// errado: o clone pode viver legitimamente na página dedicada enquanto o
// designer está olhando outra.
export function _nodeIsAttached(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n != null;
}

// Página a que um nó pertence, ou null se ele estiver desanexado
// (2026-09-15). Útil onde a operação precisa acontecer na página do NÓ e
// não na que o designer está vendo — ex.: achar o overlay irmão de um
// clone que vive na página dedicada de Handoff.
/** @returns {PageNode | null} */
export function _pageOfNode(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return /** @type {PageNode | null} */ (n || null);
}

// Wrapper tipado de figma.getNodeByIdAsync (2026-09-14, checkJs: true) —
// a API real retorna BaseNode|null, tipo amplo demais pra acessar
// propriedades de SceneNode (.visible/.absoluteBoundingBox/.clone() etc.)
// sem erro de tipo. Todo lugar do backend que resolve um id vindo de
// hacData/pluginData (Área Marcada, clone de trabalho, spec) sabe por
// contrato de produto que o node, se existir, é sempre um SceneNode real
// (nunca Page/Document) — o cast aqui documenta essa garantia uma única
// vez, em vez de re-afirmá-la em cada um dos ~40 call-sites.
/** @returns {Promise<SceneNode | null>} */
export async function _getSceneNodeById(id) {
  const node = await figma.getNodeByIdAsync(id);
  return /** @type {SceneNode | null} */ (node);
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
// Matching DSC → categoria de a11y — EXTRAÍDO (2026-09-14) para
// backend/dsc-matching.js (Camada 1 da modularização do backend). Motor
// transversal, usado tanto pelo scan geral (handler scan-frame) quanto
// pelo "Mapeamento Automático" da Ordem de Tabulação
// (generate-tab-order-from-layers) — ver import abaixo.
// ============================================================

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
export function _findMainTextContent(root) {
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
// decorativo) do component set "[hac mob] Box specs leitor de tela"
// (fileKey HhriLSpKnCB2dHhyiU16iB) — key resolvida em
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
export async function _tryImportA11yComponent(opts) {
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
      if (obsNode && obsNode.type === 'TEXT' && obsNode.fontName !== figma.mixed) {
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
export const A11Y_ITEM_NUMBER_KEYS_MOBILE = {
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
export const A11Y_TAB_ORDER_ITEM_KEY_MOBILE = 'a7b50306053bb1a4fb834f26c432dc7613ef9b13';

// "[a11y] Item Number" desktop — MESMA key já usada hoje em 2 lugares do
// closure figma.ui.onmessage (create-a11y-area, como A11Y_AREA_CONECTOR_KEYS;
// e o handler de Ordem de Tabulação, como A11Y_ITEM_NUMBER_KEYS — ambas já
// eram literalmente os mesmos 5 valores, duplicados por estarem presas em
// closures diferentes). Promovida aqui pro escopo de módulo (2026-09-10)
// especificamente para o selo de Número da tela do bloco "Frame Principal"
// da Ficha (_buildFichaFramePrincipalSection), que vive fora de qualquer um
// dos dois closures — mesma key/componente real, não uma via de importação
// nova. Se algum dia as 3 constantes forem unificadas numa só, esta é a
// candidata natural a virar a fonte única.
const A11Y_ITEM_NUMBER_KEYS_DESKTOP = {
  superior:   'ff43b15ac0c078b35219984bf035c4c0f0089cf1',
  inferior:   'b355a26c5a89aea074effe28ca6767b08e4a7f99',
  esquerda:   'f9cd4394c0bfc48ae86d3028e836877887d23fcd',
  direita:    '08ac04391034777646eec9395c6d221189ee6d46',
  desativado: '71719f112ec0135b16df0deb6584fbc44af3aff2',
};

const _A11Y_SIDE_TO_ORIENTACAO = { left: 'esquerda', right: 'direita', top: 'superior', bottom: 'inferior' };

// Tenta importar o marcador real (ver A11Y_AGRUPAMENTO_KEYS[_MOBILE]) em vez
// de desenhar o contorno tracejado + chip procedural. Lança em qualquer ponto
// de incerteza — quem chama trata a exceção como "cai no marcador desenhado".
// opts.a11yOrigin ('web'|'mobile', propagado desde a criação da spec no
// frontend) escolhe o dicionário mobile quando disponível; se a categoria ou
// a orientação específica não existir nele (lacuna real da lib mobile — ver
// comentário acima de A11Y_AGRUPAMENTO_KEYS_MOBILE), cai pro dicionário
// desktop equivalente ANTES de lançar erro.
export async function _tryImportA11yAgrupamento(opts) {
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
        || instance.findOne(n => n.type === 'TEXT' && /^H\d*$/.test(/** @type {TextNode} */(n).characters));
      if (numberNode && numberNode.type === 'TEXT' && numberNode.fontName !== figma.mixed) {
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
export async function _tryImportA11yConectorLinha(opts) {
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
export const A11Y_SECTION_NAME = 'hac — Especificações de Acessibilidade';
const A11Y_TAB_ORDER_SECTION_NAME = 'hac — Ordem de Tabulação';
// Section própria para as trilhas de Swipe (linha direcional com N pontos)
// — nunca compartilha a Section de Ordem de Tabulação, mesmo quando os dois
// artefatos existem para a MESMA área: são conceitos independentes (uma é
// sequência de foco DENTRO da área, a outra é uma trilha de navegação por
// gesto que pode atravessar vários pontos/áreas), ver bloco "Trilha de
// Swipe" mais abaixo. 3ª reformulação (2026-09-04): a constante mantém o
// nome (só o VALOR mudou, de "Fluxos" pra "Trilhas") pra não duplicar todo
// o código que já a referencia.
export const A11Y_SWIPE_FLOW_SECTION_NAME = 'hac — Trilhas de Swipe';

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
export function _isHacOwnedNode(node) {
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
export function _extractA11ySectionVersionSuffix(sectionName) {
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
export function _computeNextA11ySectionName() {
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
// legacyNames aceita string única (compatibilidade com chamadores
// existentes) ou array — necessário desde 2026-09-14 pra Sections com mais
// de um nome legado sobreposto no tempo (ex.: Handoff Completo → Handoff
// de Acessibilidade, que por sua vez já tinha migrado de Ficha de
// Handoff).
// `page` (2026-09-15) é opcional e o default preserva exatamente o
// comportamento anterior — todo chamador que não passa nada continua
// operando sobre figma.currentPage. Só os fluxos da página dedicada de
// Handoff (_getOrCreateHacPage) passam uma página explícita.
export function _getOrCreateNamedSection(sectionName, legacyNames, page) {
  const _page = page || figma.currentPage;
  const _legacyList = Array.isArray(legacyNames) ? legacyNames : (legacyNames ? [legacyNames] : []);
  let section = _page.children.find(
    n => n.type === 'SECTION' && (n.name === sectionName || _legacyList.includes(n.name))
  );
  if (!section) {
    section = figma.createSection();
    section.name = sectionName;
    section.x = 0;
    section.y = 0;
    section.resizeWithoutConstraints(200, 200);
  }
  // A Section nasce no topo da pilha da PÁGINA CORRENTE (padrão de
  // figma.create*(), que ignora `_page`), mas isso só vale no instante da
  // criação — depois disso o design original pode subir acima dela (novo
  // frame colado, reordenação manual no painel de Layers, duplicar tela
  // etc.), e todo marcador visual (contorno, conector, selo de Área/Ordem
  // de Tabulação) que vive dentro da Section passaria a ficar ATRÁS do
  // elemento escaneado. Reforça o topo aqui — no único ponto de acesso à
  // Section — para que qualquer chamador (spec nova, Área nova, cópia de
  // Ordem de Tabulação, cálculo de bounds ocupados) sempre a encontre por
  // cima do restante do canvas.
  //
  // O appendChild abaixo acumula um segundo papel quando `_page` não é a
  // página corrente: além de reforçar o topo, é ele que de fato MOVE a
  // Section recém-criada para a página certa (figma.createSection() sempre
  // nasce na corrente). Por isso a condição `indexOf !== _lastIndex` também
  // cobre o caso "não está nesta página" — indexOf devolve -1 ali, que
  // nunca é igual a _lastIndex.
  const _lastIndex = _page.children.length - 1;
  if (_page.children.indexOf(section) !== _lastIndex) {
    _page.appendChild(section);
  }
  return section;
}

export function _getOrCreateA11ySection(sectionName) {
  return _getOrCreateNamedSection(sectionName || A11Y_SECTION_NAME);
}

// Section ÚNICA por página E por designer, container de toda a documentação
// criada nesta sessão de trabalho. Identificada por pluginData
// ('hacSessionSection' + 'hacSessionOwnerId'), nunca por nome: o nome carrega
// timestamp + designer logado e muda a cada sessão, então buscar por nome
// criaria uma Section nova a cada Área marcada. O timestamp é gravado uma
// vez, na criação, e nunca mais muda — não é o mecanismo de versionamento de
// _computeNextA11ySectionName/_extractA11ySectionVersionSuffix, que
// permanece reservado ao propósito original (versionar uma nova geração
// completa de documentação).
//
// Isolamento por usuário (2026-09-10, bug real reportado: dois designers no
// mesmo arquivo ao mesmo tempo tiveram o trabalho misturado na mesma
// Section, porque a busca abaixo nunca filtrava por dono — pegava a
// PRIMEIRA Section de sessão da página inteira). `currentUserId` é o
// figma.currentUser.id (nativo do Figma, estável), não `designerName`
// (string cosmética só usada no nome, nunca um critério de busca confiável
// — dois designers podem ter o mesmo nome exibido, ou o nome pode nem
// chegar). Fallback defensivo: se currentUserId vier vazio/null (caso raro,
// mas possível — ex. figma.currentUser indisponível), cai no comportamento
// ANTIGO (primeira Section de sessão da página, sem filtro), pra nunca
// travar a criação de Área por falta de id.
// Bug real corrigido (2026-09-11, pedido do usuário): a Section deixou de
// ser sempre puxada pro TOPO ABSOLUTO da pilha de camadas da página a cada
// chamada — esse reforço (ver comentário removido, "reforço de topo de
// pilha de _getOrCreateNamedSection") existia pra evitar que marcadores
// ficassem escondidos atrás do design original, mas o usuário pediu o
// oposto: a Section deve nascer logo ABAIXO do frame selecionado na
// árvore de camadas (não visualmente/geometricamente — em nível/z-index),
// e permanecer onde estiver depois disso, sem ser puxada de volta pro
// topo em toda chamada subsequente. `referenceNode`, quando informado
// (só é conhecido no momento da CRIAÇÃO, vindo de create-a11y-area — o
// frame que o designer acabou de selecionar), posiciona a Section nova
// logo depois dele na pilha (figma.currentPage.insertChild). Chamadas que
// reaproveitam uma Section já existente ignoram completamente esse
// parâmetro — a ordem de camada dela já foi decidida na criação.
// `page` (2026-09-15) é opcional, default = figma.currentPage — todo
// chamador existente continua idêntico. Ver nota em _getOrCreateNamedSection.
export function _getOrCreateA11ySessionSection(designerName, currentUserId, referenceNode, page) {
  const _page = page || figma.currentPage;
  let section = null;
  let unownedSection = null; // Section antiga (pré-migração), sem hacSessionOwnerId gravado.
  for (const n of _page.children) {
    if (n.type !== 'SECTION') continue;
    try {
      if (n.getPluginData && n.getPluginData('hacSessionSection') === 'true') {
        const ownerId = n.getPluginData('hacSessionOwnerId') || '';
        if (!currentUserId) {
          // Sem id do usuário atual — comportamento antigo, sem filtro.
          section = n;
          break;
        }
        if (ownerId === currentUserId) {
          section = n;
          break;
        }
        if (!ownerId && !unownedSection) {
          // Section criada antes desta mudança — ainda não tem dono.
          unownedSection = n;
        }
      }
    } catch (e) { }
  }
  if (!section && unownedSection && currentUserId) {
    // Migração aditiva: adota a Section antiga pro usuário atual em vez de
    // criar uma nova duplicada só porque ela não tinha hacSessionOwnerId.
    section = unownedSection;
    try { section.setPluginData('hacSessionOwnerId', currentUserId); } catch (e) { }
  }
  if (!section) {
    section = figma.createSection();
    const _now = new Date();
    const _pad = (v) => String(v).padStart(2, '0');
    const _timestamp = `${_pad(_now.getDate())}/${_pad(_now.getMonth() + 1)}/${_now.getFullYear()} ${_pad(_now.getHours())}:${_pad(_now.getMinutes())}`;
    section.name = `[HAC] Handoff de Acessibilidade | ${_timestamp} | ${designerName || 'Designer não identificado'} | v1.0`;
    section.setPluginData('hacSessionSection', 'true');
    if (currentUserId) section.setPluginData('hacSessionOwnerId', currentUserId);
    section.setPluginData('hacSessionVersion', '1.0');
    section.x = 0;
    section.y = 0;
    section.resizeWithoutConstraints(200, 200);
    // Posiciona logo ABAIXO do frame selecionado na pilha de camadas, se
    // conhecido — insertChild(index, node) insere na posição `index`, e o
    // índice do referenceNode não muda por inserir DEPOIS dele (índices
    // maiores é que deslocariam) — index = índice do referenceNode + 1
    // coloca a Section logo depois dele (visualmente atrás/abaixo dele no
    // painel de Layers, que lista do topo pro fundo na ordem inversa do
    // array de children). Silenciosamente ignorado se o referenceNode não
    // for mais filho direto da página (cai no createSection padrão, que
    // já entra no topo do array).
    let _placed = false;
    if (referenceNode) {
      try {
        const refIndex = _page.children.indexOf(referenceNode);
        if (refIndex !== -1) {
          _page.insertChild(refIndex + 1, section);
          _placed = true;
        }
      } catch (e) { }
    }
    // figma.createSection() nasce SEMPRE na página corrente, ignorando
    // `_page`. Quando o alvo é outra página e o insertChild acima não
    // rodou (sem referenceNode, ou referenceNode não é filho de `_page`),
    // a Section ficaria órfã na página errada — este append é o que a
    // move. No caso default (_page === currentPage) é inofensivo: a
    // Section já está lá e o append só reforça o topo, mesmo efeito que
    // _getOrCreateNamedSection já faz.
    if (!_placed && _page.children.indexOf(section) === -1) {
      try { _page.appendChild(section); } catch (e) { }
    }
  }
  return section;
}


// Detecção de handoff já existente de OUTRO designer no mesmo arquivo
// (2026-09-10) — varre a página inteira por Sections de sessão
// ('hacSessionSection' === 'true') cujo 'hacSessionOwnerId' seja diferente
// de currentUserId (e não vazio: Sections antigas sem dono ainda não
// contam como "de outro designer", ver migração em
// _getOrCreateA11ySessionSection). Dedupe por ownerId — não deveria haver
// mais de uma Section por dono depois da Parte 1, mas seja defensivo (ex.:
// arquivo com Sections órfãs de bugs antigos). Usado pelo handler
// check-other-designers-sections, disparado pelo frontend logo após o
// designer confirmar a origem (Web/Mobile) pela primeira vez no arquivo —
// nunca no ui-ready, pra não competir com a checagem de storage/versão.
export function _findOtherDesignersSessionSections(currentUserId) {
  const seenOwnerIds = new Set();
  const result = [];
  for (const n of figma.currentPage.children) {
    if (n.type !== 'SECTION') continue;
    try {
      if (n.getPluginData && n.getPluginData('hacSessionSection') === 'true') {
        const ownerId = n.getPluginData('hacSessionOwnerId') || '';
        if (!ownerId) continue; // Section antiga sem dono — não conta como "outro designer".
        if (currentUserId && ownerId === currentUserId) continue;
        if (seenOwnerIds.has(ownerId)) continue;
        seenOwnerIds.add(ownerId);
        result.push({ name: n.name, ownerId });
      }
    } catch (e) { }
  }
  return result;
}

// Detecção de handoff PRÓPRIO já iniciado neste arquivo (2026-09-10) —
// irmã de _findOtherDesignersSessionSections acima, mas com o filtro
// invertido: acha a Section de sessão cujo 'hacSessionOwnerId' é o PRÓPRIO
// currentUserId. Usada pra avisar o designer, ao reabrir o arquivo (ou
// trocar de máquina/sessão), que ele já documentou telas aqui antes —
// complementa a checagem de storage local do frontend, que não sobrevive a
// troca de máquina/navegador. Usado pelo handler check-my-prior-session,
// disparado no mesmo momento que check-other-designers-sections (ver
// ensureA11yProjectOriginThen, accessibility.js). Nunca bloqueante: retorna
// null se não houver sessão própria ainda.
export function _findOwnPriorSessionSection(currentUserId) {
  if (!currentUserId) return null;
  for (const n of figma.currentPage.children) {
    if (n.type !== 'SECTION') continue;
    try {
      if (n.getPluginData && n.getPluginData('hacSessionSection') === 'true') {
        const ownerId = n.getPluginData('hacSessionOwnerId') || '';
        if (ownerId !== currentUserId) continue;
        // Grupo de Área é o GROUP marcado com hacCategory 'a11y' (mesmo
        // marcador gravado em create-a11y-area) — critério objetivo, não
        // um chute por tipo de node genérico.
        //
        // Bug real corrigido (2026-09-14, reportado com print pelo
        // usuário: alerta sempre mostrava "0 telas" mesmo com a Ficha
        // visivelmente populada): esta contagem só olhava FILHOS DIRETOS
        // da Section, premissa válida até 2026-09-10 (áreas nasciam soltas
        // na Section). Desde a reorganização da árvore da Ficha (Section >
        // [HAC] Documentação > Tela N > [HAC] Assets do Handoff > Grupo da
        // Área, ver _ensureLegendBesideClone/_getOrCreateFichaItensFrame),
        // o Grupo de Área fica bem mais fundo — a busca por filho direto
        // nunca mais encontrava nada. Descida recursiva limitada (mesmo
        // padrão de _forEachA11yFichaFrameChild, profundidade 12 — árvore
        // real tem no máximo ~5 níveis hoje, a folga é intencional contra
        // reestruturações futuras) substitui a busca de 1 nível só.
        let areaCount = 0;
        const _countAreaGroups = (node, depth) => {
          if (!node || depth > 12 || !Array.isArray(node.children)) return;
          for (const child of node.children) {
            try {
              if (child.type === 'GROUP' && child.getPluginData &&
                child.getPluginData('hacCategory') === 'a11y') {
                areaCount++;
                continue; // Grupo de Área não tem outro Grupo de Área dentro — não desce mais.
              }
            } catch (e) { }
            if (child.type === 'FRAME' || child.type === 'GROUP' || child.type === 'SECTION') {
              _countAreaGroups(child, depth + 1);
            }
          }
        };
        _countAreaGroups(n, 0);
        // timestamp/designerName extraídos do nome da própria Section
        // ("[HAC] Handoff de Acessibilidade | {timestamp} | {designerName} |
        // v{versão}") com o MESMO split por '|' que extractDesignerName usa
        // no frontend (accessibility.js, openA11yOtherDesignerModal) — não é
        // um parsing novo, só espelha o mesmo índice de partes aqui do lado
        // backend, que não tem acesso a funções do frontend.
        const _nameParts = String(n.name || '').split('|').map(s => s.trim());
        const timestamp = (_nameParts.length >= 3 && _nameParts[1]) ? _nameParts[1] : null;
        const designerName = (_nameParts.length >= 3 && _nameParts[2]) ? _nameParts[2] : null;
        return {
          name: n.name,
          ownerId: currentUserId,
          version: n.getPluginData('hacSessionVersion') || '1.0',
          areaCount,
          timestamp,
          designerName,
          sectionId: n.id,
        };
      }
    } catch (e) { }
  }
  return null;
}

// area.id É o GROUP da Área desde 2026-09-05 (create-a11y-area envolve o
// selo num GROUP e devolve o id DELE) — resolver o grupo é só resolver o id.
// Áreas criadas ANTES dessa mudança devolvem a INSTANCE solta do selo, que
// não aceita filhos: quem chama trata null/não-grupo caindo no caminho
// antigo (Section por tipo de artefato).
async function _getA11yAreaGroupNode(areaId) {
  if (!areaId) return null;
  try {
    const node = await _getSceneNodeById(areaId);
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
export function _reparentIntoSection(node, getSection) {
  try {
    const _origX = node.x;
    const _origY = node.y;
    // Container de ORIGEM guardado antes do appendChild (2026-09-14): tirar
    // um node de uma Section a deixa superdimensionada (ela foi esticada
    // pra abraçar esse node e nada a encolhe de volta — Sections não têm
    // auto-fit via API, só por interação manual do designer). Reajustar a
    // origem também evita que o "vão" volte por qualquer caminho de
    // reparenting futuro, não só pelos 3 fluxos de réplica já corrigidos.
    const oldParent = node.parent;
    const section = getSection();
    section.appendChild(node);
    node.x = Math.round(_origX - section.x);
    node.y = Math.round(_origY - section.y);
    _fitSectionToChildren(section);
    if (oldParent && oldParent !== section && !oldParent.removed &&
      oldParent.type === 'SECTION' && Array.isArray(oldParent.children)) {
      try { _fitSectionToChildren(oldParent); } catch (e2) { }
    }
  } catch (e) {
    // organização é só cosmética — a spec/área/cópia segue existindo
    // normalmente na página — mas loga sempre: um reparenting falhando em
    // silêncio deixa specs/áreas/cópias inteiras soltas fora da Section sem
    // nenhum rastro (bug real, 2026-09-03).
    console.error('[hac] _reparentIntoSection: falhou, node ficou solto na página.', e && e.message);
  }
}

// Bug real corrigido (2026-09-11, confirmado com print do usuário): uma
// Section, ao contrário de um Frame, NÃO recalcula seu tamanho/posição
// sozinha quando filhos são adicionados via appendChild pela Plugin API —
// esse "auto-fit" só acontece quando o Figma reage a um arrasto manual do
// usuário na própria UI, nunca em resposta a chamadas de API. Como
// _getOrCreateA11ySessionSection cria a Section com resizeWithoutConstraints
// (200,200) e nada nunca a redimensionava depois, ela ficava para sempre
// travada em 200×200 na origem — mesmo contendo, na árvore de nodes, todo o
// trabalho documentado (que continua desenhado nas coordenadas visuais
// reais, fora dessa caixa). Sintoma relatado: o botão "Ver no canvas" do
// alerta de handoff (focusNode/highlight-node, que usa
// node.absoluteBoundingBox) desenhava o highlight exatamente nessa caixa
// pequena e vazia — o highlight estava certo, era a Section que nunca
// tinha sido redimensionada para refletir o conteúdo real.
// Chamada sempre que algo é reparentado para dentro da Section de sessão
// (_reparentIntoSection) — recalcula o bounding box a partir da UNIÃO dos
// filhos reais e redimensiona/reposiciona a Section para envolvê-los, com
// uma margem pequena de respiro visual. Se a Section ficar vazia por
// qualquer motivo, mantém o tamanho mínimo original (200×200) em vez de
// zerar ou lançar erro com dimensão inválida.
// Generalizada (2026-09-11): apesar do nome, não depende de nada
// exclusivo de SectionNode (só children/resizeWithoutConstraints/x/y) —
// pode ser chamada com qualquer container. Hoje o único chamador real é a
// Section de sessão; os Frames internos da Ficha ([HAC] Documentação,
// [HAC] Itens e os blocos) usam Auto Layout e se redimensionam sozinhos.
export function _fitSectionToChildren(section) {
  try {
    const children = section.children || [];
    const withBounds = children.filter(c => !!c.absoluteBoundingBox && c.visible !== false);
    if (withBounds.length === 0) return;
    const PADDING = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of withBounds) {
      const bb = c.absoluteBoundingBox;
      // `absoluteBoundingBox` de um node com `clipsContent=false` inclui
      // TUDO que transborda dele — e toda a cadeia da Ficha usa
      // clipsContent=false de propósito (pra selos e overlays não serem
      // recortados). Medir por ele faz a Section se esticar pra abraçar
      // transbordamento invisível.
      //
      // `absoluteTransform` dá a posição absoluta do PRÓPRIO node
      // (tx=[0][2], ty=[1][2]), imune a transbordamento de filhos — e
      // `width`/`height` dão a caixa declarada. Origem e extensão vêm
      // então da MESMA fonte (a tentativa anterior misturava `bb.x` com
      // `c.width`, produzindo uma caixa deslocada quando o transbordamento
      // era pra esquerda/cima).
      //
      // Só vale pra node NÃO rotacionado: com rotação, a caixa alinhada
      // aos eixos (o próprio bb) é a única medida correta — width/height
      // descreveriam o retângulo girado, subdimensionando o espaço real.
      let x = bb.x, y = bb.y, w = bb.width, h = bb.height;
      try {
        const t = c.absoluteTransform;
        const semRotacao = t && Math.abs(t[0][1]) < 1e-6 && Math.abs(t[1][0]) < 1e-6;
        if (semRotacao && typeof c.width === 'number' && c.width > 0 &&
          typeof c.height === 'number' && c.height > 0) {
          x = t[0][2]; y = t[1][2]; w = c.width; h = c.height;
        }
      } catch (e) { /* sem absoluteTransform: mantém o bbox */ }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
    const newX = Math.round(minX - PADDING);
    const newY = Math.round(minY - PADDING);
    const newWidth = Math.max(200, Math.round((maxX - minX) + PADDING * 2));
    const newHeight = Math.max(200, Math.round((maxY - minY) + PADDING * 2));
    // Bug real corrigido (2026-09-11): `section.x`/`section.y` são sempre
    // RELATIVOS ao pai direto de `section` — só coincidem com absoluto
    // quando esse pai é a própria página. Ao ser chamada com um container
    // aninhado (filho da Section, não da página), misturar as duas
    // escalas quebrava o cálculo. `newX`/`newY` (derivados
    // de absoluteBoundingBox) são sempre absolutos — misturar os dois no
    // cálculo de delta somava/subtraía a posição absoluta da Section-mãe
    // como se fosse relativa, inflando a Section pra dezenas de milhares
    // de pixels (sintoma real reportado com print: W 46046 x H 29639).
    // Corrigido lendo a posição ABSOLUTA atual da própria `section` (via
    // absoluteBoundingBox dela, não section.x/y crus) — delta calculado
    // inteiramente em coordenadas absolutas, depois aplicado a section.x/y
    // (relativo) e aos filhos (também relativos): um delta é invariante à
    // translação do sistema de referência, então somá-lo a coordenadas
    // relativas continua correto independente da profundidade de
    // aninhamento.
    const sectionBB = section.absoluteBoundingBox;
    const oldAbsX = sectionBB ? sectionBB.x : section.x;
    const oldAbsY = sectionBB ? sectionBB.y : section.y;
    // A Section se move pela diferença ABSOLUTA (newX - oldAbsX) — seu
    // pai não muda, então esse é o delta certo pra section.x/y (relativo
    // ao pai) alcançar a nova posição absoluta desejada. Os FILHOS
    // precisam do delta OPOSTO (oldAbsX - newX): eles devem ficar
    // visualmente parados enquanto a Section muda de posição/tamanho ao
    // redor deles, então seu x/y relativo compensa exatamente o quanto a
    // Section (o pai deles) se deslocou.
    const sectionDeltaX = newX - oldAbsX;
    const sectionDeltaY = newY - oldAbsY;
    const childrenDeltaX = -sectionDeltaX;
    const childrenDeltaY = -sectionDeltaY;
    section.resizeWithoutConstraints(newWidth, newHeight);
    section.x = Math.round(section.x + sectionDeltaX);
    section.y = Math.round(section.y + sectionDeltaY);
    if (childrenDeltaX !== 0 || childrenDeltaY !== 0) {
      for (const c of children) {
        try {
          c.x = Math.round(c.x + childrenDeltaX);
          c.y = Math.round(c.y + childrenDeltaY);
        } catch (e) { }
      }
    }
  } catch (e) {
    // Ajuste é só cosmético/de bounding-box — nunca deve travar o
    // reparenting em si, que já aconteceu com sucesso antes desta chamada.
    console.error('[hac] _fitSectionToChildren: falhou ao redimensionar a Section.', e && e.message);
  }
}

// Moldura visual (fundo + stroke + título) atrás de uma réplica de
// trabalho (Tabulação/Swipe/Leitor de Tela), 2026-09-11, pedido do
// usuário: destacar cada réplica visualmente na Section de sessão, com um
// título indicando o que é cada frame. Desenhada como RETÂNGULO solto
// ATRÁS do clone+overlay (nunca os reparenta pra dentro de um FRAME) —
// decisão deliberada: reparentar clone+overlay pra dentro de um container
// novo arriscaria reabrir o bug de posicionamento absoluto já corrigido
// nesta sessão (overlay usa layoutPositioning=ABSOLUTE só quando o PAI tem
// Auto Layout; a Section de sessão não tem, então overlay e clone vivem
// hoje em x/y absoluto livre, um esquema frágil que não deve ganhar mais
// um nível de aninhamento sem necessidade). Dimensionada pela UNIÃO dos
// bounding boxes de clone+overlay (o overlay, quando existe, pode
// extrapolar os limites do clone — selos/trilha/conectores desenhados nas
// bordas ou fora dele). Cores confirmadas via REST API contra tokens reais
// do DSC (ver _createOrGetFichaFrame): stroke '#404b52' (color/border/
// neutral/6, mesmo tom já usado no container raiz da Ficha), fundo
// 'dsc/color/neutral/neutralBg2' (#f0f2f2, "não tão claro" — pedido
// explícito do usuário, não branco puro nem cinza escuro).
// Idempotente por pluginData('hacCloneWorkFrameFor', clone.id) — "Iniciar"/
// "Refazer" recriam o clone do zero (mesmo id novo a cada vez, então a
// moldura antiga vira órfã e é removida antes de desenhar a nova);
// "Adicionar item"/"Atualizar" reaproveitam o MESMO clone.id, então a
// moldura existente é só redimensionada/reposicionada.
// DESATIVADA (2026-09-12, pedido explícito do usuário: "Podemos eliminar a
// moldura cinza e o texto, isso está dificultando tudo"). A moldura
// ([Moldura] Réplica de Trabalho — ...) e o título ([Título] ...) eram
// nodes posicionados por x/y ABSOLUTO, irmãos do clone. Depois que a
// réplica passou a viver dentro de "[HAC] Handoff - {Func}" (FRAME com
// Auto Layout), esses dois nodes passaram a brigar com o layout — entravam
// no fluxo, esticavam/comprimiam o container e atrapalhavam o
// posicionamento de tudo dentro da Section.
//
// A função vira um no-op que apenas REMOVE qualquer moldura/título de
// sessões anteriores (via _removeCloneWorkFrame, que segue existindo e é
// usada também na limpeza do "Preencher Handoff") — assim arquivos já
// abertos convergem sozinhos, sem o designer precisar apagar na mão. Os 3
// call sites continuam chamando normalmente; não foram removidos pra manter
// o diff pequeno e reversível caso a moldura volte a ser pedida.
export async function _ensureCloneWorkFrame(clone, overlayGroup, title) {
  try {
    if (!clone || clone.removed) return;
    _removeCloneWorkFrame(clone);
  } catch (e) { }
  return;
}

// Corpo original preservado (nunca chamado) — caso a moldura volte a ser
// pedida, basta renomear esta função de volta para _ensureCloneWorkFrame.
async function _ensureCloneWorkFrame_DESATIVADA(clone, overlayGroup, title) {
  try {
    try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }
    if (!clone || clone.removed || !clone.absoluteBoundingBox) return;
    const parent = clone.parent;
    if (!parent || typeof parent.appendChild !== 'function') return;

    let minX = clone.absoluteBoundingBox.x;
    let minY = clone.absoluteBoundingBox.y;
    let maxX = minX + clone.absoluteBoundingBox.width;
    let maxY = minY + clone.absoluteBoundingBox.height;
    if (overlayGroup && !overlayGroup.removed && overlayGroup.absoluteBoundingBox) {
      const obb = overlayGroup.absoluteBoundingBox;
      minX = Math.min(minX, obb.x);
      minY = Math.min(minY, obb.y);
      maxX = Math.max(maxX, obb.x + obb.width);
      maxY = Math.max(maxY, obb.y + obb.height);
    }

    const PADDING = 24;
    const TITLE_HEIGHT = 28;

    // Remove qualquer moldura órfã de uma geração anterior deste clone
    // (mesmo padrão de dedupe já usado por _snapshotCloneIntoFichaSection)
    // — nunca deveria haver mais de uma por clone.id vivo, mas Iniciar/
    // Refazer trocam o id a cada vez, então a antiga vira lixo real.
    let frameRect = null;
    let titleText = null;
    for (const sibling of (parent.children || []).slice()) {
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacCloneWorkFrameFor') === clone.id) {
          if (sibling.type === 'TEXT') titleText = sibling;
          else frameRect = sibling;
        }
      } catch (e) { }
    }

    const rectX = Math.round(minX - PADDING);
    const rectY = Math.round(minY - PADDING - TITLE_HEIGHT);
    const rectWidth = Math.round((maxX - minX) + PADDING * 2);
    const rectHeight = Math.round((maxY - minY) + PADDING * 2 + TITLE_HEIGHT);

    if (!frameRect || frameRect.removed) {
      frameRect = figma.createRectangle();
      frameRect.name = `[Moldura] ${title}`;
      frameRect.fills = [{ type: 'SOLID', color: hexToRgb('#f0f2f2') }];
      frameRect.strokes = [{ type: 'SOLID', color: hexToRgb('#404b52') }];
      frameRect.strokeWeight = 1;
      frameRect.strokeAlign = 'INSIDE';
      frameRect.cornerRadius = 12;
      frameRect.locked = true;
      frameRect.setPluginData('hacCategory', 'a11y');
      frameRect.setPluginData('hacCloneWorkFrameFor', clone.id);
      parent.appendChild(frameRect);
      // Sempre no fundo da pilha de filhos do pai comum — atrás do clone e
      // do overlay, nunca por cima.
      try { parent.insertChild(0, frameRect); } catch (e) { }
    }
    // ORDEM CRÍTICA (2026-09-11, revisão 3): `parent` pode ser o FRAME
    // "[HAC] Handoff - {Func}", que TEM Auto Layout — ABSOLUTE precisa ser
    // reafirmado ANTES do resize/medição abaixo, senão o Auto Layout pode
    // descartar a escrita manual de posição no próximo reflow. No-op
    // quando `parent` não tem Auto Layout (ex. Section de sessão, caminho
    // legado), mesma função já usada pro overlay.
    _setCloneOverlayGroupAbsolutePositioning(frameRect);
    frameRect.resizeWithoutConstraints(Math.max(1, rectWidth), Math.max(1, rectHeight));
    const afterRectBB = frameRect.absoluteBoundingBox;
    if (afterRectBB) {
      frameRect.x = Math.round(frameRect.x + (rectX - afterRectBB.x));
      frameRect.y = Math.round(frameRect.y + (rectY - afterRectBB.y));
    }

    if (!titleText || titleText.removed) {
      titleText = figma.createText();
      titleText.name = `[Título] ${title}`;
      titleText.locked = true;
      titleText.setPluginData('hacCategory', 'a11y');
      titleText.setPluginData('hacCloneWorkFrameFor', clone.id);
      parent.appendChild(titleText);
      try {
        const rectIndex = parent.children.indexOf(frameRect);
        parent.insertChild(rectIndex + 1, titleText);
      } catch (e) { }
    }
    // ORDEM CRÍTICA (2026-09-11, revisão 3) — mesmo motivo de frameRect
    // acima, reafirmado ANTES da medição de posição final logo abaixo.
    _setCloneOverlayGroupAbsolutePositioning(titleText);
    try { titleText.fontName = { family: "Inter", style: "Bold" }; } catch (e) { }
    titleText.characters = title;
    titleText.fontSize = 12;
    titleText.fills = [{ type: 'SOLID', color: hexToRgb('#404b52') }];
    const afterTitleBB = titleText.absoluteBoundingBox;
    const titleTargetX = Math.round(minX);
    const titleTargetY = Math.round(minY - PADDING - TITLE_HEIGHT + 6);
    if (afterTitleBB) {
      titleText.x = Math.round(titleText.x + (titleTargetX - afterTitleBB.x));
      titleText.y = Math.round(titleText.y + (titleTargetY - afterTitleBB.y));
    }
  } catch (e) {
    console.error('[hac] _ensureCloneWorkFrame: falhou, moldura visual não aplicada (não afeta o trabalho real).', e && e.message);
  }
}

// Apaga a moldura+título (_ensureCloneWorkFrame) de um clone antes dele
// ser removido — moldura e título são IRMÃOS do clone (nunca filhos dele),
// então clone.remove() sozinho não os levaria junto, deixando um retângulo
// + texto órfãos presos na Section pra sempre. Chamada nos 3 pontos que já
// apagam a réplica de trabalho após a Ficha consumir o snapshot dela
// (insert-ficha-section) — mesmo padrão de busca por pluginData usado no
// resto do arquivo, nunca por parentesco.
export function _removeCloneWorkFrame(clone) {
  if (!clone) return;
  try {
    const parent = clone.parent;
    if (!parent || !parent.children) return;
    for (const sibling of parent.children.slice()) {
      try {
        if (sibling.getPluginData && sibling.getPluginData('hacCloneWorkFrameFor') === clone.id) {
          sibling.remove();
        }
      } catch (e) { }
    }
  } catch (e) { }
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
export function _reparentIntoAreaGroup(node, areaGroupNode) {
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
// Busca pura (sem criar nada) do overlay de um clone — usada tanto por
// _getOrCreateCloneOverlayGroup (que cria se não achar) quanto por
// checagens read-only que não devem criar overlay novo (ex.: detectar se
// há trabalho real antes de decidir remover um clone, ver
// _cloneOverlayHasRealContent/figma.on('close')).
//
// Bug real corrigido (2026-09-10, mudança "réplica de fundo vira
// snapshot"): até aqui, o overlay sempre vivia IRMÃO do clone (mesmo pai),
// então bastava varrer `clone.parent.children`. A partir da mudança em que
// a réplica de TRABALHO NUNCA MAIS é movida pra dentro da Ficha (só um
// snapshot/imagem dela vai pra lá — ver _snapshotCloneIntoFichaSection),
// enquanto o overlay de marcadores CONTINUA sendo movido/vivendo dentro da
// seção da Ficha, a premissa "mesmo pai" quebra: o clone fica pra sempre
// na Section de sessão, mas o overlay passa a viver em outro lugar da
// árvore. Troca a busca por parentesco por uma varredura da PÁGINA INTEIRA
// (mesmo padrão de fontes já usado por _forEachTabOrderCopyCandidate/
// _forEachSwipePathCopyCandidate/_forEachFichaFrameCandidate: soltos na
// página + dentro de Sections de sessão + dentro de frames de Ficha),
// procurando um GROUP marcado com `pluginDataKey` apontando pro id do
// clone, em qualquer lugar.
// `areaId` (opcional, 2026-09-11): busca PRIMEIRO pela chave estável
// `${pluginDataKey}ForArea` === areaId — necessária para o overlay
// continuar sendo encontrado depois que o CLONE de trabalho foi apagado
// (limpeza pós-geração da Ficha, ver insert-ficha-section) e um clone
// NOVO (id diferente) é criado num "Atualizar" seguinte. Buscar só por
// `clone.id` nesse cenário nunca bateria (o overlay foi marcado com o id
// do clone antigo, já removido) — resultado seria recriar um overlay do
// zero, perdendo os selos/specs já corretos e duplicando o snapshot.
// Cai para a busca antiga por `clone.id` quando `areaId` não bate com
// nada (overlay criado antes desta mudança, sem a chave por área ainda
// gravada) ou não é informado (fluxo normal de marcação, fora da Ficha,
// nunca passou por aqui e não precisa — o clone lá nunca é apagado).
function _findCloneOverlaySibling(clone, pluginDataKey, areaId) {
  if (!clone) return null;
  let found = null;
  const checkByArea = node => {
    if (found || !node || !areaId) return;
    try {
      if (node.type === 'GROUP' && node.getPluginData &&
        node.getPluginData(pluginDataKey + 'ForArea') === areaId &&
        !node.removed) {
        found = node;
      }
    } catch (e) { }
  };
  const checkByClone = node => {
    if (found || !node) return;
    try {
      if (node.type === 'GROUP' && node.getPluginData &&
        node.getPluginData(pluginDataKey) === clone.id &&
        !node.removed) {
        found = node;
      }
    } catch (e) { }
  };
  // Varre a página ONDE O CLONE ESTÁ, não a que o designer está vendo
  // (2026-09-15) — o overlay é sempre irmão do clone, então derivar a
  // página dele é mais confiável que assumir a corrente, e cobre o caso da
  // página dedicada de Handoff. Cai pra currentPage se o clone estiver
  // desanexado (_pageOfNode devolve null).
  const _page = _pageOfNode(clone) || figma.currentPage;
  const walkAll = check => {
    for (const sibling of _page.children) {
      if (found) break;
      if (sibling.type === 'SECTION') continue;
      check(sibling);
    }
    if (!found) _forEachA11ySessionAreaChild(check, _page);
    if (!found) _forEachA11ySessionDirectChild(check, _page);
    if (!found) _forEachFichaFrameCandidate(check, _page);
    if (!found) _forEachA11yFichaFrameChild(check, _page);
  };

  if (areaId) walkAll(checkByArea);
  if (!found) walkAll(checkByClone);

  return found;
}

// `areaId` (opcional, 2026-09-11) — ver comentário completo em
// _findCloneOverlaySibling. Propagado até a criação do grupo, onde grava
// a chave estável `${pluginDataKey}ForArea` além da chave por clone.id já
// existente — overlay novo fica localizável por área OU por clone, o que
// bater primeiro.
export function _getOrCreateCloneOverlayGroup(clone, pluginDataKey, namePrefix, areaId) {
  const existing = _findCloneOverlaySibling(clone, pluginDataKey, areaId);
  if (existing) {
    _setCloneOverlayGroupAbsolutePositioning(existing);
    // Backfill da chave por área (2026-09-11): overlay achado só pela
    // chave antiga (por clone.id) — ex. criado antes desta mudança, ou o
    // clone atual ainda é o mesmo de quando o overlay nasceu — ganha a
    // chave nova agora, pra sobreviver à próxima troca de clone sem
    // precisar recriar nada.
    if (areaId) {
      try { existing.setPluginData(pluginDataKey + 'ForArea', areaId); } catch (e) { }
    }
    return existing;
  }
  const cloneParent = clone.parent;

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
      if (areaId) {
        try { rescued.setPluginData(pluginDataKey + 'ForArea', areaId); } catch (e) { }
      }
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
  // Chave estável por área (2026-09-11) — ver comentário completo em
  // _findCloneOverlaySibling.
  if (areaId) overlayGroup.setPluginData(pluginDataKey + 'ForArea', areaId);

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
export function _setCloneOverlayGroupAbsolutePositioning(overlayGroup) {
  try {
    if ('layoutPositioning' in overlayGroup && overlayGroup.parent &&
      'layoutMode' in overlayGroup.parent && overlayGroup.parent.layoutMode !== 'NONE') {
      overlayGroup.layoutPositioning = 'ABSOLUTE';
    }
  } catch (e) { }
}

// Snapshot estático (imagem) da réplica de trabalho de uma área, pra
// dentro de uma seção da Ficha — substitui, pra este bloco específico, o
// antigo modelo de MOVER o clone real (_moveActiveCloneIntoFichaSection)
// pra dentro da Ficha (decisão de produto, 2026-09-10: cada área
// documentada carregava 3 clones reais e independentes da mesma tela — um
// por bloco/Tabulação/Swipe/Leitor — cada um clonando a árvore inteira,
// incluindo instâncias de componente DSC aninhadas, sem nenhuma otimização
// de peso). A réplica de TRABALHO (a que fica na Section de sessão, usada
// pra clicar/marcar incrementalmente) não muda em nada e NUNCA é movida —
// só esta função lê dela (exportAsync) pra gerar uma imagem estática.
// PRIMEIRA vez que o hac usa exportAsync/figma.createImage.
// Idempotente: se já existir uma imagem antiga deste clone dentro de
// `targetSection` (marcada com 'hacFichaSnapshotForClone' === clone.id),
// remove antes de criar a nova, pra "Atualizar" sempre refletir o estado
// atual da tela em vez de acumular imagens obsoletas.
//
// `areaId`/`pluginDataKey` (opcional, 2026-09-11): além da marca antiga
// por clone.id (instável — muda toda vez que o clone é recriado, ex.
// depois que a réplica de trabalho é apagada por "insert-ficha-section"),
// também marca/procura por uma chave estável `${pluginDataKey}ForArea`
// === areaId. `pluginDataKey` aqui é a MESMA chave que o chamador já usa
// em _getOrCreateCloneOverlayGroup pra este tipo (ex.
// 'hacTabOrderBadgesGroupForClone') — reaproveitada só como namespace pra
// diferenciar entre os múltiplos snapshots de uma mesma área (Frame
// Principal, Tabulação, Swipe, Leitor de Tela), já que todos vivem dentro
// da mesma `targetSection`. Sem `areaId`, o comportamento é o mesmo de
// antes (só busca/marca por clone.id).
export async function _snapshotCloneIntoFichaSection(clone, targetSection, pluginDataKey, areaId) {
  const stableKey = areaId && pluginDataKey ? (pluginDataKey + 'SnapshotForArea') : null;
  // Busca em 2 níveis (2026-09-11): desde a criação do GROUP "[HAC] Handoff
  // - {Func}", o snapshot da rodada anterior não é mais filho DIRETO do
  // bloco — está dentro desse grupo. Sem descer um nível, "Atualizar" não
  // acharia a imagem antiga e passaria a EMPILHAR imagens obsoletas sobre a
  // nova. Um nível basta: o grupo é sempre filho direto do bloco.
  const _removeOldSnapshots = (parentNode) => {
    for (const child of (parentNode.children || []).slice()) {
      try {
        const matchesStable = stableKey && child.getPluginData &&
          child.getPluginData(stableKey) === areaId;
        const matchesLegacy = child.getPluginData &&
          child.getPluginData('hacFichaSnapshotForClone') === clone.id;
        if (matchesStable || matchesLegacy) {
          child.remove();
        } else if (child.getPluginData && child.getPluginData('hacFichaHandoffGroup')) {
          _removeOldSnapshots(child);
        }
      } catch (e) { }
    }
  };
  _removeOldSnapshots(targetSection);

  const bb = clone.absoluteBoundingBox;

  let node;
  try {
    const bytes = await clone.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
    const image = figma.createImage(bytes);
    const rect = figma.createRectangle();
    rect.name = '[Snapshot] ' + clone.name;
    rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
    // Radius + sombra (2026-09-10, pedido do usuário, valores confirmados
    // via REST API contra o padrão real do DSC — bloco "image" do node de
    // referência HhriLSpKnCB2dHhyiU16iB/10459:24855: cornerRadius 8; efeito
    // "Shadows | Elevations/Elevation 1" resolvido e confirmado nas libs
    // Super DSC Web e DSC Super App, aplicado como valor fixo pelo mesmo
    // motivo já documentado nesta função pra fills/hex diretos).
    rect.cornerRadius = 8;
    rect.effects = [{
      type: 'DROP_SHADOW',
      visible: true,
      color: { r: 0, g: 0, b: 0, a: 0.04 },
      blendMode: 'NORMAL',
      offset: { x: 0, y: 1 },
      radius: 2,
      spread: 0,
      showShadowBehindNode: true
    }];
    // bb (absoluteBoundingBox) é relativo à página inteira — appendChild
    // primeiro, ABSOLUTE imediatamente (ORDEM CRÍTICA, 2026-09-11 revisão
    // 3: `targetSection` pode ser o FRAME "[HAC] Handoff - {Func}", que TEM
    // Auto Layout — sem isto o reflow do Auto Layout pode descartar a
    // escrita manual de posição abaixo), depois corrige x/y pela diferença
    // observada no absoluteBoundingBox antes/depois (mesmo princípio de
    // _reparentIntoAreaGroup: robusto contra qualquer sistema de
    // coordenadas do novo pai, Auto Layout ou não). No-op quando o pai não
    // tem Auto Layout.
    targetSection.appendChild(rect);
    _setCloneOverlayGroupAbsolutePositioning(rect);
    rect.resizeWithoutConstraints(bb.width, bb.height);
    const afterBB = rect.absoluteBoundingBox;
    if (afterBB) {
      rect.x = Math.round(rect.x + (bb.x - afterBB.x));
      rect.y = Math.round(rect.y + (bb.y - afterBB.y));
    }
    node = rect;
  } catch (e) {
    console.error('[hac] _snapshotCloneIntoFichaSection: exportAsync falhou, usando placeholder.', e && e.message);
    const placeholder = figma.createFrame();
    placeholder.name = '[Snapshot indisponível] ' + clone.name;
    placeholder.layoutMode = 'VERTICAL';
    placeholder.primaryAxisAlignItems = 'CENTER';
    placeholder.counterAxisAlignItems = 'CENTER';
    placeholder.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
    targetSection.appendChild(placeholder);
    // ORDEM CRÍTICA — ver comentário equivalente no caminho de sucesso acima.
    _setCloneOverlayGroupAbsolutePositioning(placeholder);
    placeholder.resizeWithoutConstraints(bb.width, bb.height);
    const afterBB = placeholder.absoluteBoundingBox;
    if (afterBB) {
      placeholder.x = Math.round(placeholder.x + (bb.x - afterBB.x));
      placeholder.y = Math.round(placeholder.y + (bb.y - afterBB.y));
    }

    const text = figma.createText();
    text.name = 'Texto';
    text.characters = 'Não foi possível gerar a prévia desta tela';
    text.textAlignHorizontal = 'CENTER';
    // Escala real (corrigido 2026-09-11, era 11.5px/Inter Regular — abaixo
    // do piso real de 12px): elevado para "label/tiny" (12px), com
    // weightOverride=400 pra manter o peso visual Regular de texto corrido.
    await _applyFichaTypography(text, 'label/tiny', 400);
    text.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    placeholder.appendChild(text);

    node = placeholder;
  }

  node.locked = true;
  node.setPluginData('hacFichaSnapshotForClone', clone.id);
  if (stableKey) node.setPluginData(stableKey, areaId);
  return node;
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
//
// SEM CHAMADOR ATIVO a partir de 2026-09-10 (mudança "réplica de fundo
// vira snapshot", ver _snapshotCloneIntoFichaSection): os 3 builders da
// Ficha (_buildFichaTabulacaoSection/_buildFichaSwipeSection/
// _buildFichaLeitorSection) pararam de MOVER o clone de trabalho pra
// dentro da Ficha — agora só exportam um snapshot (imagem) dele via
// _snapshotCloneIntoFichaSection, e movem/reaproveitam o overlay de
// marcadores separadamente. Mantida no código de propósito (preservação
// de histórico/lógica já testada de compensação de delta) — remoção
// definitiva é decisão de limpeza futura, fora de escopo desta mudança.
export async function _moveActiveCloneIntoFichaSection(clone, targetSection, pluginDataKey) {
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

  // Bug real corrigido (2026-09-10, reportado com print pelo usuário): o
  // appendChild abaixo, num pai com Auto Layout, faz o Figma recalcular
  // AUTOMATICAMENTE x/y do clone (layoutPositioning padrão = AUTO) pra
  // encaixá-lo no fluxo da seção — mas o overlay é marcado como ABSOLUTE
  // logo em seguida (_setCloneOverlayGroupAbsolutePositioning), o que só
  // tira ele do fluxo do Auto Layout, NUNCA recalcula sua posição. Sem
  // compensar isso, o overlay mantém os x/y que tinha no pai ANTIGO (a
  // Section de sessão do designer), agora reinterpretados como relativos ao
  // pai NOVO (a seção da Ficha) — um sistema de coordenadas diferente do
  // original, resultando no overlay (selos/trilha/specs) vazando pra fora
  // da área visível, sem respeitar o Auto Layout da Ficha. Corrigido
  // medindo o deslocamento REAL do clone (absoluteBoundingBox antes/depois
  // do appendChild, mesmo princípio já usado por _reparentIntoAreaGroup/
  // _reparentIntoSection acima) e aplicando o mesmo delta ao overlay —
  // como overlayGroup é sempre um GROUP (nunca FRAME), deslocar x/y do
  // grupo desloca todo o conteúdo interno junto, preservando as posições
  // relativas entre os filhos (selos individuais, segmentos da trilha,
  // specGroups), que já estavam corretas entre si.
  const beforeBB = clone.absoluteBoundingBox;
  targetSection.appendChild(clone);
  const afterBB = clone.absoluteBoundingBox;
  if (overlayGroup) {
    targetSection.appendChild(overlayGroup);
    if (beforeBB && afterBB) {
      try {
        overlayGroup.x += Math.round(afterBB.x - beforeBB.x);
        overlayGroup.y += Math.round(afterBB.y - beforeBB.y);
      } catch (e) { }
    }
    _setCloneOverlayGroupAbsolutePositioning(overlayGroup);
  }
}

// Destino padrão de todo artefato de uma Área: o Grupo dela. Áreas criadas
// antes de 2026-09-05 não têm Grupo (area.id é a INSTANCE solta do selo,
// que não aceita filhos) — nesses casos cai na Section por tipo de artefato
// que o chamador já usava, via fallbackReparent. Sem migração retroativa,
// por decisão de produto: arquivos já documentados continuam funcionando na
// estrutura antiga.
export async function _reparentArtifactIntoArea(node, areaId, fallbackReparent) {
  const areaGroup = await _getA11yAreaGroupNode(areaId);
  if (areaGroup) {
    _reparentIntoAreaGroup(node, areaGroup);
    return;
  }
  if (typeof fallbackReparent === 'function') fallbackReparent();
}

export function _reparentIntoA11ySection(node, sectionName) {
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
// `page` (2026-09-15) opcional, default = figma.currentPage. Ver nota em
// _getOrCreateNamedSection.
export function _forEachA11ySessionAreaChild(fn, page) {
  for (const sibling of (page || figma.currentPage).children) {
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
// `page` (2026-09-15) opcional, default = figma.currentPage.
export function _forEachA11ySessionDirectChild(fn, page) {
  for (const sibling of (page || figma.currentPage).children) {
    if (sibling.type !== 'SECTION') continue;
    let isSessionSection = false;
    try {
      isSessionSection = !!(sibling.getPluginData && sibling.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (!isSessionSection) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
}

// `page` (2026-09-15) opcional, default = figma.currentPage.
export function _forEachTabOrderCopyCandidate(fn, page) {
  const _page = page || figma.currentPage;
  for (const sibling of _page.children) {
    if (sibling.type === 'SECTION') continue;
    fn(sibling);
  }
  _forEachA11ySessionAreaChild(fn, _page);
  _forEachA11ySessionDirectChild(fn, _page);
  // Varre TAMBÉM dentro de frames de Ficha já existentes (2026-09-09) — a
  // cópia de trabalho pode ter sido MOVIDA pra dentro da Ficha por um
  // "Inserir na ficha" anterior (ver comentário completo em
  // _forEachA11yFichaFrameChild). Sem isto, um cache-miss depois de mover
  // recriaria a cópia do zero, deixando a movida órfã dentro da Ficha.
  _forEachA11yFichaFrameChild(fn, _page);
  // Varre TODAS as Sections de Ordem de Tabulação com o prefixo base,
  // qualquer sufixo de versão (v2, v3...) — não só o nome fixo sem versão.
  // A criação (_getOrCreateTabOrderSection) já aplica o sufixo da geração
  // ativa; buscar só o nome exato sem versão deixava cópias de qualquer
  // geração versionada permanentemente órfãs (nunca encontradas por
  // _removeExistingTabOrderCopiesForArea/_findTabOrderCopyForArea), o que
  // fazia clones antigos vazarem pra scans futuros como conteúdo "novo" do
  // design (bug real, 2026-09-03).
  for (const sibling of _page.children) {
    if (sibling.type !== 'SECTION' || !sibling.name.startsWith(A11Y_TAB_ORDER_SECTION_NAME)) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
}

export function _findTabOrderCopyForArea(areaId) {
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
export function _removeExistingTabOrderCopiesForArea(areaId) {
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
      const isWorkFrameOfRemovedClone = sibling.getPluginData &&
        cloneIdsToRemove.includes(sibling.getPluginData('hacCloneWorkFrameFor'));
      if (isClone || isOverlayOfRemovedClone || isWorkFrameOfRemovedClone) {
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
// `page` (2026-09-15) opcional, default = figma.currentPage — espelha
// _forEachTabOrderCopyCandidate.
export function _forEachSwipePathCopyCandidate(fn, page) {
  const _page = page || figma.currentPage;
  for (const sibling of _page.children) {
    if (sibling.type === 'SECTION') continue;
    fn(sibling);
  }
  for (const sibling of _page.children) {
    if (sibling.type !== 'SECTION' || !sibling.name.startsWith(A11Y_SWIPE_FLOW_SECTION_NAME)) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
  _forEachA11ySessionAreaChild(fn, _page);
  _forEachA11ySessionDirectChild(fn, _page);
  // Mesmo motivo de _forEachTabOrderCopyCandidate (2026-09-09) — a cópia de
  // Swipe pode ter sido MOVIDA pra dentro da Ficha.
  _forEachA11yFichaFrameChild(fn, _page);
}

// Mesma correção de vazamento de _removeExistingTabOrderCopiesForArea
// (2026-09-08), espelhada pro grupo-overlay da linha de Swipe
// ('hacSwipePathGroupForClone').
export function _removeExistingSwipePathCopiesForArea(areaId) {
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
      const isWorkFrameOfRemovedClone = sibling.getPluginData &&
        cloneIdsToRemove.includes(sibling.getPluginData('hacCloneWorkFrameFor'));
      if (isClone || isOverlayOfRemovedClone || isWorkFrameOfRemovedClone) {
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
const A11Y_FICHA_SECTION_NAME = 'hac — Handoff de Acessibilidade';
// Nomes antigos — arquivos já existentes têm Sections gravadas no canvas
// com um destes nomes; ver comentário de _getOrCreateNamedSection
// (legacyNames, aceita array) para o porquê de manter esta lista em vez de
// só trocar o valor acima. Ordem cronológica: "Ficha de Handoff" (original)
// → "Handoff Completo" (2026-09-09) → "Handoff de Acessibilidade"
// (2026-09-14, nomenclatura atual — pedido do usuário, evitar confundir
// com o significado de "documento único" que "Completo" sugeria).
const A11Y_FICHA_SECTION_NAME_LEGACY = 'hac — Ficha de Handoff';
const A11Y_FICHA_SECTION_NAME_LEGACY_2 = 'hac — Handoff Completo';

function _getOrCreateFichaSection(sectionName) {
  const suffix = _extractA11ySectionVersionSuffix(sectionName);
  return _getOrCreateNamedSection(A11Y_FICHA_SECTION_NAME + suffix, [
    A11Y_FICHA_SECTION_NAME_LEGACY + suffix,
    A11Y_FICHA_SECTION_NAME_LEGACY_2 + suffix,
  ]);
}

function _reparentIntoFichaSection(node, sectionName) {
  _reparentIntoSection(node, () => _getOrCreateFichaSection(sectionName));
}

// Mesmo padrão defensivo de _forEachTabOrderCopyCandidate/
// _forEachSwipeCopyCandidate: o frame da Ficha pode estar solto na página
// (nunca chegou a ser reparentado) ou já dentro de alguma Section de Ficha
// (qualquer geração/versão) — varre os dois níveis sempre.
// `page` (2026-09-15) opcional, default = figma.currentPage.
function _forEachFichaFrameCandidate(fn, page) {
  const _page = page || figma.currentPage;
  for (const sibling of _page.children) {
    if (sibling.type === 'SECTION') continue;
    fn(sibling);
  }
  for (const sibling of _page.children) {
    if (sibling.type !== 'SECTION') continue;
    if (!sibling.name.startsWith(A11Y_FICHA_SECTION_NAME) && !sibling.name.startsWith(A11Y_FICHA_SECTION_NAME_LEGACY) && !sibling.name.startsWith(A11Y_FICHA_SECTION_NAME_LEGACY_2)) continue;
    for (const child of (sibling.children || [])) fn(child);
  }
  _forEachA11ySessionAreaChild(fn, _page);
  _forEachA11ySessionDirectChild(fn, _page);
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
//
// Generalizada pra descida RECURSIVA (2026-09-10, reestruturação da árvore
// da Ficha em níveis de agrupamento — Section raiz > Grupo de Área >
// [HAC] Itens > Tabulação/Swipe/Leitor de Tela > clone+overlay): antes
// descia exatamente 2 níveis fixos (fichaFrame.children = seções,
// section.children = clone/overlay/legend), porque a árvore da Ficha tinha
// só essa profundidade. Com mais níveis de FRAME/GROUP intermediários, uma
// descida fixa deixaria de alcançar clone/overlay já movidos — sempre
// encontrar MAIS nunca quebra nenhum chamador (todos filtram por
// pluginData específico depois), então a recursão é estritamente aditiva.
// `page` (2026-09-15) opcional, default = figma.currentPage.
export function _forEachA11yFichaFrameChild(fn, page) {
  const visited = new Set();
  const walk = (node, depth) => {
    // Limite elevado pra 12 (2026-09-11): a árvore ganhou 2 níveis com a
    // reorganização (Tela N, Assets do Handoff). Aumentar é estritamente
    // aditivo — os chamadores filtram por pluginData depois.
    if (!node || depth > 12 || visited.has(node.id)) return;
    visited.add(node.id);
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) {
      fn(child);
      if (child.type === 'FRAME' || child.type === 'GROUP' || child.type === 'SECTION') {
        walk(child, depth + 1);
      }
    }
  };
  _forEachFichaFrameCandidate(fichaFrame => {
    if (!fichaFrame || fichaFrame.type === 'SECTION') return;
    walk(fichaFrame, 0);
  }, page);
}

// Localiza o frame da Ficha de uma área — tenta primeiro o id salvo em
// hacData (mais rápido, sem varredura), cai pra busca por pluginData
// 'hacFichaForArea' se o id não resolver mais (frame apagado/movido
// manualmente do canvas, dado local "mentindo" — mesmo trade-off aceito
// pelo resto do hac com tabOrderItems/a11ySwipePaths).
export async function _findFichaFrameForArea(areaId, savedFrameId) {
  if (savedFrameId) {
    try {
      const node = await _getSceneNodeById(savedFrameId);
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
// `page` (2026-09-15) opcional, default = figma.currentPage. ATENÇÃO: os
// retângulos somados aqui vêm de absoluteBoundingBox, que é relativo à
// PÁGINA — misturar bounds de páginas diferentes produz faixa livre sem
// sentido. Todo chamador precisa passar a MESMA página onde o nó a
// posicionar vai nascer.
export async function _collectA11yOccupiedBounds(page) {
  const _page = page || figma.currentPage;
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
  _page.children.forEach(n => {
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
  // Bug real corrigido (2026-09-11, print do usuário mostrando um vão
  // enorme entre o Frame Principal e as réplicas): o mesmo raciocínio vale
  // pro frame da Ficha ("[HAC] Handoff de Acessibilidade CAIXA | ..."),
  // que é um FRAME (não GROUP) e por isso caía no `else` abaixo, sendo
  // somado como UM retângulo único. Como ele cresce a cada bloco inserido
  // (Auto Layout HORIZONTAL), virava um obstáculo gigante que empurrava
  // cada réplica nova pra muito além da borda direita dele. Agora a Ficha
  // também tem os FILHOS somados, nunca o container inteiro.
  // Desce recursivamente enquanto o node for um CONTAINER organizador do
  // hac (GROUP solto, frame da Ficha, GROUP de área dentro dela) — só
  // soma como retângulo quando chega num artefato real (réplica, snapshot,
  // selo, bloco de seção). Profundidade elevada pra 6 (2026-09-11): a
  // árvore ganhou níveis com a reorganização (Documentação → Tela N →
  // Assets do Handoff → bloco → Handoff-{Func}). Com o limite antigo (3),
  // containers passavam a ser somados INTEIROS como obstáculo, distorcendo
  // o cálculo de faixa livre e fazendo réplicas novas nascerem sobre
  // conteúdo existente.
  const _isHacOrganizerContainer = (node, depth) => {
    if (depth > 6 || !node.children || node.children.length === 0) return false;
    if (node.type === 'GROUP') return true;
    try {
      if (node.getPluginData && (
        node.getPluginData('hacFichaForArea') ||
        node.getPluginData('hacFichaAreaGroup') === 'true' ||
        node.getPluginData('hacFichaDocumentacaoFrame') === 'true' ||
        node.getPluginData('hacFichaTelaForArea') ||
        node.getPluginData('hacFichaItensFrame') === 'true' ||
        // "[HAC] {Func}" (bloco) e "[HAC] Handoff - {Func}" (2026-09-11,
        // revisão 2: agora FRAME, não GROUP — precisa de reconhecimento
        // explícito por pluginData, senão o `node.type === 'GROUP'` acima
        // não cobre mais e _collectA11yOccupiedBounds volta a somar o FRAME
        // inteiro como 1 retângulo opaco, empurrando a próxima réplica pra
        // longe — mesmo bug do "obstáculo gigante" já corrigido antes).
        node.getPluginData('hacFichaSection') ||
        node.getPluginData('hacFichaHandoffGroup')
      )) return true;
    } catch (e) { }
    return false;
  };
  const addNodeOrDescend = (node, depth) => {
    if (_isHacOrganizerContainer(node, depth)) {
      node.children.forEach(c => addNodeOrDescend(c, depth + 1));
    } else {
      addNode(node);
    }
  };
  for (const sibling of _page.children) {
    if (sibling.type !== 'SECTION') continue;
    let isSessionSection = false;
    try {
      isSessionSection = !!(sibling.getPluginData && sibling.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (!isSessionSection) continue;
    for (const areaGroup of (sibling.children || [])) {
      addNodeOrDescend(areaGroup, 0);
    }
  }

  const areaTargetIds = [];
  for (const sibling of _page.children) {
    try {
      const areaTargetId = sibling.getPluginData && sibling.getPluginData('hacAreaTargetNodeId');
      if (areaTargetId) areaTargetIds.push(areaTargetId);
    } catch (e) { }
  }
  // Grupos de Área dentro da Section de sessão também guardam o id do frame
  // ORIGINAL — sem isto o cálculo não enxergaria o frame documentado de
  // nenhuma Área criada na estrutura nova.
  //
  // Descida recursiva (2026-09-11, não só 1 nível): desde que o Grupo da
  // Área passou a ser reparentado pra dentro de "Tela N > [HAC] Assets do
  // Handoff" na primeira captura (_ensureLegendBesideClone, pedido do
  // usuário: "a tela selecionada vai pra dentro da camada da Tela"), uma
  // busca rasa (só filhos diretos da Section) deixa de encontrar
  // `hacAreaTargetNodeId` de qualquer área já movida — mesmo limite de
  // profundidade 6 de _isHacOrganizerContainer, mesmo raciocínio.
  const _walkForAreaTargetIds = (node, depth) => {
    if (!node || depth > 6 || !node.children) return;
    for (const child of node.children) {
      try {
        const areaTargetId = child.getPluginData && child.getPluginData('hacAreaTargetNodeId');
        if (areaTargetId) areaTargetIds.push(areaTargetId);
      } catch (e) { }
      if (_isHacOrganizerContainer(child, depth)) {
        _walkForAreaTargetIds(child, depth + 1);
      }
    }
  };
  for (const sibling of _page.children) {
    if (sibling.type !== 'SECTION') continue;
    let isSessionSection = false;
    try {
      isSessionSection = !!(sibling.getPluginData && sibling.getPluginData('hacSessionSection') === 'true');
    } catch (e) { }
    if (!isSessionSection) continue;
    _walkForAreaTargetIds(sibling, 0);
  }
  // Varre TODAS as Sections de specs já existentes na página (qualquer
  // geração/versão, não só a ativa) — o cálculo de "faixa livre" precisa
  // evitar sobrepor documentação de handoffs antigos também, não só a
  // Section corrente.
  const specSectionPrefix = A11Y_SECTION_NAME;
  for (const sibling of _page.children) {
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
      const areaRoot = await _getSceneNodeById(areaTargetId);
      if (areaRoot) addNode(areaRoot);
    } catch (e) { }
  }

  // Mesmo raciocínio para as Sections de Trilha de Swipe.
  const swipeFlowSectionPrefix = A11Y_SWIPE_FLOW_SECTION_NAME;
  for (const sibling of _page.children) {
    if (sibling.type !== 'SECTION' || !sibling.name.startsWith(swipeFlowSectionPrefix)) continue;
    for (const child of (sibling.children || [])) addNode(child);
  }

  // Mesmo raciocínio para as Sections de Ficha de Handoff — sem isto, duas
  // Áreas diferentes gerando Ficha colidem visualmente entre si, e uma
  // Ficha já inserida pode ser sobreposta por uma cópia de Tabulação
  // criada depois dela (achado real de QA, 2026-09-04).
  for (const sibling of _page.children) {
    if (sibling.type !== 'SECTION') continue;
    if (!sibling.name.startsWith(A11Y_FICHA_SECTION_NAME) && !sibling.name.startsWith(A11Y_FICHA_SECTION_NAME_LEGACY) && !sibling.name.startsWith(A11Y_FICHA_SECTION_NAME_LEGACY_2)) continue;
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
export function _rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

// `page` (2026-09-15) opcional, default = figma.currentPage — precisa ser a
// mesma página onde o clone vai nascer, senão o cálculo de faixa livre roda
// contra os bounds de outra página (absoluteBoundingBox é por página).
export async function _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight, originBounds, page) {
  let occupied;
  try {
    occupied = await _collectA11yOccupiedBounds(page);
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
// Configuração de cada bloco de funcionalidade dentro de "[HAC] Assets do
// Handoff" — nome visível, título, e o texto de fallback da legenda.
// `name` = nome da LAYER no painel do Figma (contrato estrutural, com
// prefixo "[HAC]" — 2026-09-11, estrutura de árvore definida pelo
// usuário). `title` = texto de LEITURA que aparece desenhado no canvas
// (sem prefixo — é conteúdo pra quem lê o handoff, não identificador).
//
// ESCOPO GLOBAL por necessidade (bug real corrigido 2026-09-11): esta
// constante vivia DENTRO do corpo de `figma.ui.onmessage`, declarada no
// meio do handler. As funções de criação de réplica
// (_createTabOrderCloneForArea e irmãs) rodam ANTES dessa linha do handler
// ser executada, e um `const` fica na temporal dead zone até sua própria
// declaração rodar — então `_FICHA_BLOCK_CONFIG` lançava
// "is not initialized" e derrubava a cadeia inteira da Ficha (nenhum
// "[HAC] Documentação", nenhuma legenda junto da réplica). No escopo
// global a constante é inicializada no load do bundle, antes de qualquer
// mensagem chegar.
export const _FICHA_BLOCK_CONFIG = {
  tabulacao: {
    name: '[HAC] Ordem de Tabulação',
    title: 'Ordem de Tabulação',
    instructionKey: 'tabulacao',
    legendFallback: 'Sequência de foco do teclado (tecla Tab) desta tela — cada selo numerado indica a ordem em que o elemento recebe foco.',
    legendTitle: 'Ordem de Tabulação',
  },
  swipe: {
    name: '[HAC] Ordem de Leitura | Swipe',
    title: 'Ordem de Leitura | Swipe',
    instructionKey: 'swipe',
    legendFallback: 'Navegação por gesto de deslizar (swipe), exclusiva do leitor de tela mobile — trilha direcional de pontos, na ordem em que o gesto percorre a tela.',
    legendTitle: 'Trilha de Swipe',
  },
  leitor: {
    name: '[HAC] Leitor de Tela',
    title: 'Leitor de Tela',
    instructionKey: 'leitorTela',
    legendFallback: 'Elementos e imagens, estrutura da página, nível de título, elemento decorativo e informações adicionais — cada marcador indica a categoria de acessibilidade documentada naquele ponto da tela.',
    legendTitle: 'Especificações para Leitor de Tela',
    counterAxisAlignItems: 'MIN',
  },
};

export async function _createOrGetFichaFrame(area, designerName, currentUserId) {
  const sessionSection = _getOrCreateA11ySessionSection(designerName, currentUserId);

  // Identidade POR SECTION (2026-09-11, estrutura de árvore definida pelo
  // usuário): antes existia um frame raiz por ÁREA (marca
  // `hacFichaForArea`), o que gerava N irmãos soltos na Section. Agora há
  // UM "[HAC] Documentação" por Section, Auto Layout VERTICAL, empilhando
  // todas as telas documentadas.
  for (const child of (sessionSection.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaDocumentacaoFrame') === 'true') {
        try { child.name = '[HAC] Documentação'; } catch (e) { }
        return child;
      }
    } catch (e) { }
  }

  // Migração LAZY de arquivos anteriores a esta mudança: adota o primeiro
  // frame raiz antigo (marca `hacFichaForArea`) como o Documentação único,
  // convertendo-o no lugar, e recolhe os demais pra dentro dele. Nunca
  // remove nada — se algo falhar, o pior caso é um frame órfão visível,
  // que o designer apaga manualmente.
  const legacyFrames = [];
  for (const child of (sessionSection.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaForArea')) legacyFrames.push(child);
    } catch (e) { }
  }
  if (legacyFrames.length > 0) {
    try {
      const adopted = legacyFrames[0];
      // Contrato de dados: frames marcados com `hacFichaForArea` sempre
      // foram criados como FRAME (hoje `_createOrGetFichaFrame`, no legado
      // idem) — nunca outro tipo de SceneNode. 'layoutMode' in adopted só
      // documenta essa garantia pro TypeScript (checkJs); se algum dia
      // deixar de ser verdade, cai no catch abaixo como qualquer outra
      // falha de migração, sem quebrar o fluxo.
      if (!('layoutMode' in adopted) || !('appendChild' in adopted)) {
        throw new Error('frame legado adotado não é um container com Auto Layout (tipo inesperado: ' + adopted.type + ')');
      }
      adopted.name = '[HAC] Documentação';
      adopted.layoutMode = 'VERTICAL';
      adopted.itemSpacing = 48;
      adopted.clipsContent = false;
      adopted.setPluginData('hacFichaDocumentacaoFrame', 'true');
      adopted.setPluginData('hacFichaDocForSession', sessionSection.id);
      adopted.setPluginData('hacFichaDocMigratedAt', new Date().toISOString());
      for (let i = 1; i < legacyFrames.length; i++) {
        try { adopted.appendChild(legacyFrames[i]); } catch (e) { }
      }
      return adopted;
    } catch (e) {
      console.error('[hac] _createOrGetFichaFrame: falha ao migrar frames antigos (cria um Documentação novo).', e && e.message);
    }
  }

  // Posição livre calculada ANTES de criar/inserir o frame na página —
  // ponto de partida ao lado do frame ORIGINAL da área, sem colidir com o
  // que já existe no canvas. Dimensões "de partida" pequenas: o frame
  // ainda está vazio (Auto Layout AUTO cresce conforme telas entram) e o
  // cálculo só precisa de um ponto inicial; o frame real cresce depois sem
  // recalcular posição.
  const root = area && area.targetNodeId ? await _getSceneNodeById(area.targetNodeId) : null;
  const originBounds = (root && root.absoluteBoundingBox) || { x: 0, y: 0, width: 400, height: 400 };
  const { x, y } = await _findFreeTabOrderCopyPosition(480, 480, originBounds);

  const fichaFrame = figma.createFrame();
  // Nome fixo: o nome longo com timestamp/designer/versão já existe na
  // SECTION de sessão (_getOrCreateA11ySessionSection) e é ela quem tem o
  // incremento de versão — duplicá-lo aqui só gerava divergência.
  fichaFrame.name = '[HAC] Documentação';
  fichaFrame.layoutMode = 'VERTICAL';
  fichaFrame.primaryAxisSizingMode = 'AUTO';
  fichaFrame.counterAxisSizingMode = 'AUTO';
  fichaFrame.itemSpacing = 48;
  fichaFrame.paddingLeft = 80;
  fichaFrame.paddingRight = 80;
  fichaFrame.paddingTop = 80;
  fichaFrame.paddingBottom = 80;
  fichaFrame.cornerRadius = 16;
  // Container raiz "cartão" (2026-09-10, pedido do usuário, valores
  // confirmados via REST API contra o node de referência real
  // HhriLSpKnCB2dHhyiU16iB/10459:24855): fundo branco puro + stroke fino
  // usando o valor RESOLVIDO da variável real "color/border/neutral/6
  // (grayscale 110)" — #404b52, remote:true nesse arquivo (importada de
  // outra library, hiddenFromPublishing), por isso hex fixo em vez de
  // setBoundVariable/importVariableByKeyAsync, mesmo padrão já usado no
  // resto do hac.
  fichaFrame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  fichaFrame.strokes = [{ type: 'SOLID', color: hexToRgb('#404b52') }];
  fichaFrame.strokeWeight = 1;
  fichaFrame.strokeAlign = 'INSIDE';
  fichaFrame.counterAxisAlignItems = 'MIN';
  // clipsContent=false (2026-09-11): frames nascem com clip LIGADO na API
  // do Figma, e qualquer filho posicionado em ABSOLUTE (overlays de
  // marcadores, GROUPs de handoff) apareceria recortado.
  fichaFrame.clipsContent = false;
  fichaFrame.locked = false;
  fichaFrame.setPluginData('hacCategory', 'a11y');
  fichaFrame.setPluginData('hacFichaDocumentacaoFrame', 'true');
  fichaFrame.setPluginData('hacFichaDocForSession', sessionSection.id);

  // Nasce solto na página nas coordenadas ABSOLUTAS calculadas acima e só
  // depois é reparentado pra Section (que converte x/y pra relativo
  // preservando a posição visual) — mesmo padrão de
  // _createTabOrderCloneForArea.
  figma.currentPage.appendChild(fichaFrame);
  fichaFrame.x = x;
  fichaFrame.y = y;
  _reparentIntoSection(fichaFrame, () => sessionSection);

  return fichaFrame;
}

// ── Escala tipográfica real do DSC, aplicada na Ficha (2026-09-11) ─────────
// Correção de bug real: a Ficha inteira usava fontName "Inter" (a lib DSC
// real usa "Roboto") e tamanhos aproximados/inventados (60, 40, 13, 11.5, 11,
// 10px) que não batem com nenhum token real. Escala abaixo confirmada via
// REST API nesta sessão — é o teto (36px) e o piso (12px) reais; não existe
// token documentado acima ou abaixo desse intervalo. Cada entrada mapeia
// para {family, style} do peso Roboto correspondente (400=Regular,
// 500=Medium, 600=SemiBold, 700=Bold — Roboto não tem um estilo "SemiBold"
// nomeado assim em todo ambiente, por isso o fallback abaixo).
const A11Y_FICHA_TYPE_SCALE = {
  'display/standard':        { fontSize: 36, weight: 600, lineHeightPercent: 122 }, // 44/36
  'display/standard-semibold': { fontSize: 36, weight: 600, lineHeightPercent: 122 },
  'title/large':              { fontSize: 28, weight: 600, lineHeightPercent: 129 }, // 36/28
  'title/large-semibold':     { fontSize: 28, weight: 600, lineHeightPercent: 129 },
  'title/standard':           { fontSize: 24, weight: 600, lineHeightPercent: 133 }, // 32/24
  'title/small':              { fontSize: 20, weight: 600, lineHeightPercent: 140 }, // 28/20
  'body/large':               { fontSize: 18, weight: 400, lineHeightPercent: 156, letterSpacing: 0.5 }, // 28/18
  'label/standard':           { fontSize: 16, weight: 700, lineHeightPercent: 150, letterSpacing: 0.15 }, // 24/16
  'body/standard':            { fontSize: 16, weight: 400, lineHeightPercent: 150, letterSpacing: 0.5 }, // 24/16
  'label/small':              { fontSize: 14, weight: 700, lineHeightPercent: 143, letterSpacing: 0.10 }, // 20/14
  'body/small':               { fontSize: 14, weight: 400, lineHeightPercent: 143, letterSpacing: 0.25 }, // 20/14
  'label/tiny':                { fontSize: 12, weight: 700, lineHeightPercent: 133, letterSpacing: 0.5 }, // 16/12
};

// Roboto style por peso numérico — nomes exatamente como o Figma expõe a
// família "Roboto" padrão (pré-instalada em todo ambiente de renderização
// do Figma, diferente de fontes de terceiros).
function _a11yRobotoStyleForWeight(weight) {
  if (weight >= 700) return 'Bold';
  if (weight >= 600) return 'Medium'; // Roboto não publica um corte "SemiBold" — Medium é o mais próximo de 600 disponível nesta família
  if (weight >= 500) return 'Medium';
  return 'Regular';
}

// Aplica um token da escala acima a um TEXT node da Ficha: fontName (com
// loadFontAsync best-effort e fallback gracioso pra Inter caso "Roboto" não
// esteja disponível no runtime — nunca deixa a criação de spec/Ficha
// quebrar por causa de fonte, mesmo princípio já usado em todo o hac),
// fontSize, lineHeight e letterSpacing (quando o token define um).
//
// `weightOverride` (opcional, 400/500/700): usado só pelo piso da escala
// (label/tiny, único token abaixo de 14px) para textos que hoje têm peso
// visual diferente do peso "oficial" do token (ex.: um parágrafo corrido em
// Regular sendo elevado ao piso de 12px não deveria virar bold só por causa
// disso) — mantém fontSize/lineHeight/letterSpacing do token real, só troca
// a família/estilo de fonte pelo peso pedido.
export async function _applyFichaTypography(textNode, tokenName, weightOverride) {
  const token = A11Y_FICHA_TYPE_SCALE[tokenName] || A11Y_FICHA_TYPE_SCALE['body/standard'];
  const weight = typeof weightOverride === 'number' ? weightOverride : token.weight;
  const robotoStyle = _a11yRobotoStyleForWeight(weight);
  let fontName = { family: 'Roboto', style: robotoStyle };
  try {
    await figma.loadFontAsync(fontName);
  } catch (e) {
    // Fallback gracioso: "Roboto" indisponível neste runtime — cai para
    // "Inter" (fonte já usada/testada em todo o resto do hac) no estilo
    // equivalente, em vez de travar a criação do texto.
    const interStyle = weight >= 700 ? 'Bold' : (weight >= 500 ? 'Medium' : 'Regular');
    fontName = { family: 'Inter', style: interStyle };
    try { await figma.loadFontAsync(fontName); } catch (e2) { /* segue best-effort, mesmo padrão já usado no resto do arquivo */ }
  }
  try { textNode.fontName = fontName; } catch (e) { }
  textNode.fontSize = token.fontSize;
  try { textNode.lineHeight = { unit: 'PERCENT', value: token.lineHeightPercent }; } catch (e) { }
  if (typeof token.letterSpacing === 'number') {
    try { textNode.letterSpacing = { unit: 'PIXELS', value: token.letterSpacing }; } catch (e) { }
  }
  return fontName;
}

// ── Reestruturação da árvore da Ficha (2026-09-10) ─────────────────────────
// Antes desta mudança, cada builder (_buildFichaTabulacaoSection/Swipe/
// Leitor) fazia appendChild direto no fichaFrame raiz, lado a lado, sem
// nenhum nível intermediário de agrupamento. Pedido do usuário: introduzir
// 2 níveis de container Auto Layout — "Área N - [Nome do Frame]" (GROUP) >
// "[HAC] Documentação" (cabeçalho + nome do frame) e "[HAC] Itens" (onde
// Tabulação/Swipe/Leitor de Tela continuam vivendo exatamente como hoje).
// _getOrCreateFichaItensFrame é o novo destino que os 3 builders usam no
// lugar do fichaFrame raiz — TODA a lógica interna de cada builder
// (_findFichaSectionInFrame/_insertFichaSectionInOrder/snapshot/overlay)
// continua idêntica, só passa a operar contra este frame em vez da raiz.

// Cabeçalho de "[HAC] Documentação" REMOVIDO por completo (2026-09-11,
// pedido explícito do usuário: "Fallback cabeçalho. Nem quero isso mais" —
// reportado com print mostrando o texto "Handoff de acessibilidade"
// quebrado letra por letra, 480×494 Hug, um bug de largura nunca corrigido
// desde que existia). Existiam 2 caminhos: um componente real da lib (nunca
// chegou a ser usado — a key nunca foi publicada, ver histórico abaixo) e
// um fallback local (barra verde + texto) que era o único que efetivamente
// rodava. Ambos removidos — nenhum substituto foi pedido.
//
// Histórico preservado só como referência, caso o pedido mude no futuro: o
// component set ".[hac mob base] Cabeçalho Template" existe no arquivo
// HhriLSpKnCB2dHhyiU16iB (node 7100:1424, variante "Status=Finalizado" =
// node 7100:1423, confirmado via REST API 2026-09-10), mas nunca foi
// publicado (não aparece em /components nem /component_sets), então nunca
// teve key utilizável por figma.importComponentByKeyAsync.
//
// _getOrCreateFichaItensFrame (abaixo) não chama mais nenhuma função de
// cabeçalho. Migração defensiva: cabeçalhos órfãos de sessões anteriores
// (marcados `hacFichaDocHeader`) são removidos na primeira vez que
// _getOrCreateFichaItensFrame roda sobre aquele "[HAC] Documentação" — ver
// _removeOrphanDocumentacaoHeader.
function _removeOrphanDocumentacaoHeader(docFrame) {
  if (!docFrame || !docFrame.children) return;
  for (const child of docFrame.children.slice()) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaDocHeader') === 'true') {
        child.remove();
      }
    } catch (e) { }
  }
}

// Insere um frame de Tela na posição correta dentro de "[HAC] Documentação",
// ordenado por número da tela — mesmo princípio de
// _insertFichaSectionInOrder (ordem visual fixa, independente da ordem de
// clique do designer).
function _insertTelaFrameInOrder(docFrame, telaFrame, number) {
  const myNumber = Number(number) || 0;
  let beforeChild = null;
  for (const child of (docFrame.children || [])) {
    if (child === telaFrame) continue;
    let otherNumber = null;
    try { otherNumber = child.getPluginData && child.getPluginData('hacFichaTelaNumber'); } catch (e) { }
    if (!otherNumber) continue;
    if (Number(otherNumber) > myNumber) {
      beforeChild = child;
      break;
    }
  }
  if (beforeChild) {
    docFrame.insertChild(docFrame.children.indexOf(beforeChild), telaFrame);
  } else {
    docFrame.appendChild(telaFrame);
  }
}

// "Tela N - {nome}" — um por área documentada, empilhado verticalmente
// dentro de "[HAC] Documentação". FRAME com Auto Layout VERTICAL
// (2026-09-11, estrutura definida pelo usuário): era GROUP antes, mas
// GROUP não tem Auto Layout e o empilhamento "Título Card" sobre "[HAC]
// Assets do Handoff" depende dele.
export async function _getOrCreateFichaAreaGroup(fichaFrame, area) {
  const areaId = area.id || '';
  const frameLabel = area.targetNodeName || area.sectionName || area.label || 'Área';
  const areaNumber = area.number || 1;

  for (const child of (fichaFrame.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaTelaForArea') === areaId) {
        // Nome reflete o estado atual (o designer pode ter renomeado o
        // frame original depois de marcar a tela).
        try { child.name = `Tela ${areaNumber} - ${frameLabel}`; } catch (e) { }
        return child;
      }
    } catch (e) { }
  }

  const telaFrame = figma.createFrame();
  telaFrame.name = `Tela ${areaNumber} - ${frameLabel}`;
  telaFrame.layoutMode = 'VERTICAL';
  telaFrame.primaryAxisSizingMode = 'AUTO';
  // Hug nos dois eixos (2026-09-12, revisão final após 7 tentativas no
  // mesmo bug): a tentativa anterior de forçar `FIXED` 360px aqui piorou
  // tudo — o conteúdo real ("[HAC] Assets do Handoff" com frame original +
  // blocos lado a lado) é MUITO mais largo que 360, então o FIXED
  // transbordava e bagunçava a posição de tudo dentro da Section, além de
  // travar o FILL dos filhos contra uma largura errada. O natural aqui é
  // Hug: "Tela N" abraça o conteúdo. Quem precisa de largura real é o
  // "Título Card" (a barra azul), e ele resolve isso com largura FIXA
  // EXPLÍCITA sincronizada ao conteúdo — sem FILL, sem depender de
  // nenhuma cadeia de Auto Layout resolver corretamente
  // (ver _ensureTelaTituloCard/_syncTelaTituloCardWidth).
  telaFrame.counterAxisSizingMode = 'AUTO';
  telaFrame.counterAxisAlignItems = 'MIN';
  telaFrame.itemSpacing = 24;
  telaFrame.paddingLeft = 0; telaFrame.paddingRight = 0;
  telaFrame.paddingTop = 0; telaFrame.paddingBottom = 0;
  telaFrame.fills = [];
  telaFrame.clipsContent = false;
  telaFrame.setPluginData('hacCategory', 'a11y');
  telaFrame.setPluginData('hacFichaTelaForArea', areaId);
  telaFrame.setPluginData('hacFichaTelaNumber', String(areaNumber));
  // Marca legada mantida por compatibilidade — _isHacOrganizerContainer e
  // outras varreduras ainda a reconhecem.
  telaFrame.setPluginData('hacFichaAreaGroup', 'true');
  _insertTelaFrameInOrder(fichaFrame, telaFrame, areaNumber);

  await _ensureTelaTituloCard(telaFrame, area);
  telaFrame.appendChild(_createFichaItensFrame());

  return telaFrame;
}

// Sobe de "[HAC] Assets do Handoff" pro "Tela N" pai e ressincroniza a
// largura da barra de título (2026-09-12) — chamada nos pontos que já sabem
// que o conteúdo interno pode ter crescido (fim dos 3 builders de
// funcionalidade, fim de _ensureLegendBesideClone). `itensFrame` é sempre
// filho direto de `telaFrame` (ver _getOrCreateFichaAreaGroup), então
// `.parent` resolve direto, sem busca.
//
// Substitui a dupla _fitTelaFrameWidthToContent/_fitTelaFrameWidthFromItensFrame
// (removidas nesta revisão): elas forçavam `telaFrame` a ter largura FIXED
// pra servir de âncora ao FILL dos filhos — abordagem abandonada, porque o
// FIXED transbordava (conteúdo real é bem mais largo que o valor inicial) e
// bagunçava a posição de tudo dentro da Section, além de nunca estabilizar
// o FILL. Agora `telaFrame` é Hug (natural) e só a barra de título recebe
// largura numérica explícita.
export function _fitTelaFrameWidthFromItensFrame(itensFrame) {
  if (!itensFrame || itensFrame.removed) return;
  try {
    const telaFrame = itensFrame.parent;
    if (telaFrame && telaFrame.getPluginData && telaFrame.getPluginData('hacFichaTelaForArea')) {
      _syncTelaTituloCardWidth(telaFrame);
    }
  } catch (e) { }
}

// Sobe de "[HAC] Assets do Handoff" até a Section de sessão e a
// redimensiona (2026-09-14, pedido do usuário: "temos três colunas pra
// entrarem [...] a section e o frame interno precisam se adequar sobre
// isso") — chamada no fim dos 3 builders da Ficha (Tabulação/Swipe/Leitor),
// que rodam no "Preencher Handoff" e podem fazer qualquer bloco crescer
// bem além do tamanho que a Section tinha antes (o Leitor de Tela em
// especial: N specGroups lado a lado, um card por elemento marcado).
// `itensFrame` → `telaFrame` (pai) → `fichaFrame` ("[HAC] Documentação",
// avô) → Section de sessão (bisavô, sempre filho direto dela — ver
// _reparentIntoSection em _createOrGetFichaFrame). Idempotente e barata,
// mesmo princípio de _fitTelaFrameWidthFromItensFrame.
export function _fitSessionSectionFromItensFrame(itensFrame) {
  if (!itensFrame || itensFrame.removed) return;
  try {
    const telaFrame = itensFrame.parent;
    const fichaFrame = telaFrame && telaFrame.parent;
    const sessionSection = fichaFrame && fichaFrame.parent;
    if (sessionSection && !sessionSection.removed && sessionSection.type === 'SECTION') {
      _fitSectionToChildren(sessionSection);
    }
  } catch (e) { }
}

// "Título Card" > "Título do bloco" — barra de cabeçalho por Tela
// (2026-09-11, revisão visual: substitui o cartão cinza pequeno pelo
// tratamento azul-escuro largo da referência do usuário — mesmo lugar na
// árvore, mesma identidade de pluginData, só visual e texto novos). Texto
// "Documentação da Tela {N} - {Nome do Frame}", com largura numérica
// explícita (nunca FILL — ver comentário dentro da função).
async function _ensureTelaTituloCard(telaFrame, area) {
  const areaId = area.id || '';
  const frameLabel = area.targetNodeName || area.sectionName || area.label || 'Área';
  const areaNumber = area.number || 1;

  let card = null;
  for (const child of (telaFrame.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaTelaTituloCard') === areaId) {
        card = child;
        break;
      }
    } catch (e) { }
  }

  if (!card) {
    card = figma.createFrame();
    card.name = 'Título Card';
    card.layoutMode = 'HORIZONTAL';
    card.primaryAxisSizingMode = 'FIXED';
    card.counterAxisSizingMode = 'AUTO';
    card.paddingLeft = 16; card.paddingRight = 16;
    card.paddingTop = 12; card.paddingBottom = 12;
    card.cornerRadius = 8;
    card.clipsContent = false;
    card.setPluginData('hacCategory', 'a11y');
    card.setPluginData('hacFichaTelaTituloCard', areaId);
    telaFrame.insertChild(0, card);
  }
  // ABANDONO DO FILL (2026-09-12, revisão final após 7 tentativas): todas
  // as correções anteriores tentaram fazer `layoutSizingHorizontal='FILL'`
  // funcionar — ajustando ordem de operações, dando largura FIXED ao pai,
  // reafirmando a propriedade em nodes reaproveitados. Nada resolveu de
  // forma estável, porque FILL é uma relação DECLARATIVA que depende da
  // cadeia inteira de Auto Layout resolver na ordem certa, e essa cadeia
  // muda de largura várias vezes durante a montagem da Ficha (o conteúdo
  // cresce a cada bloco/réplica inserida).
  //
  // Solução definitiva: largura FIXA EXPLÍCITA, sincronizada ao conteúdo
  // real por _syncTelaTituloCardWidth (chamada no fim de cada builder,
  // quando o conteúdo já tem seu tamanho final). Sem FILL, sem depender de
  // nenhum ancestral: o card tem uma largura numérica, e o texto dentro
  // dele idem. É determinístico e imune a reflow/reaproveitamento.
  card.primaryAxisSizingMode = 'FIXED';
  // Barra azul-escura (referência visual do usuário) — reafirmado
  // incondicionalmente, pra convergir cards de sessões anteriores.
  card.fills = [{ type: 'SOLID', color: hexToRgb('#1F2933') }];

  let titulo = (card.children || []).find(c => {
    try { return c.getPluginData && c.getPluginData('hacFichaTelaTituloText') === areaId; } catch (e) { return false; }
  });
  if (!titulo) {
    titulo = figma.createText();
    titulo.name = 'Título do bloco';
    // textAutoResize ANTES de .characters (bug real já documentado no
    // fallback de cabeçalho): setar o texto primeiro trava a largura.
    titulo.textAutoResize = 'HEIGHT';
    titulo.setPluginData('hacFichaTelaTituloText', areaId);
    card.appendChild(titulo);
  }
  await _applyFichaTypography(titulo, 'label/standard');
  titulo.characters = `Documentação da Tela ${areaNumber} - ${frameLabel}`;
  // Texto branco sobre fundo azul-escuro (referência visual).
  titulo.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  // Sem FILL aqui também — a largura do texto é fixada junto com a do card
  // em _syncTelaTituloCardWidth. `textAutoResize='HEIGHT'` faz a altura
  // acompanhar as quebras de linha naturais dentro dessa largura fixa.
  _syncTelaTituloCardWidth(telaFrame);

  return card;
}

// Sincroniza a largura do "Título Card" (barra azul) e do texto dentro dele
// com a largura REAL do conteúdo da Tela (2026-09-12) — largura numérica
// explícita, nunca FILL (ver comentário em _ensureTelaTituloCard).
// Idempotente e barata: pode ser chamada quantas vezes for preciso, sempre
// que o conteúdo interno crescer.
// Repara containers Auto Layout VERTICAL cuja altura ficou travada em FIXED
// (2026-09-14, reportado com print: painel mostrando "Fixed height (1)" nos
// frames "Passos"/"Assets"/"Passo N" da Legenda, com o conteúdo invisível).
//
// Causa: `resizeWithoutConstraints(w, 1)` chamado DEPOIS de
// `primaryAxisSizingMode='AUTO'` faz a API do Figma reverter o eixo pra
// FIXED com a altura passada. A criação já foi corrigida (reafirmando AUTO
// depois de cada resize), mas isso não conserta nodes que JÁ existem em
// arquivos abertos — a Ficha é idempotente e reaproveita esses nodes.
// Esta função varre a subárvore e devolve o Hug de altura a qualquer frame
// Auto Layout que esteja com altura suspeita (<= 2px) apesar de ter filhos.
function _repairCollapsedAutoLayoutHeights(root, depth) {
  if (!root || root.removed || (depth || 0) > 8) return;
  try {
    for (const child of (root.children || [])) {
      try {
        const isAutoLayout = 'layoutMode' in child && child.layoutMode && child.layoutMode !== 'NONE';
        const hasChildren = Array.isArray(child.children) && child.children.length > 0;
        if (isAutoLayout && hasChildren &&
          child.primaryAxisSizingMode === 'FIXED' && child.height <= 2) {
          // VERTICAL: altura é o eixo primário. HORIZONTAL: é o contrário,
          // mas o sintoma real observado é sempre no eixo que virou FIXED
          // com valor 1 — reafirmar AUTO no eixo certo resolve os dois.
          if (child.layoutMode === 'VERTICAL') child.primaryAxisSizingMode = 'AUTO';
          else child.counterAxisSizingMode = 'AUTO';
        } else if (isAutoLayout && hasChildren &&
          child.layoutMode === 'HORIZONTAL' && child.counterAxisSizingMode === 'FIXED' && child.height <= 2) {
          child.counterAxisSizingMode = 'AUTO';
        }
      } catch (e) { }
      _repairCollapsedAutoLayoutHeights(child, (depth || 0) + 1);
    }
  } catch (e) { }
}

function _syncTelaTituloCardWidth(telaFrame) {
  if (!telaFrame || telaFrame.removed) return;
  try {
    // Repara alturas colapsadas de sessões anteriores antes de medir
    // (2026-09-14) — sem isto, um "Passos"/"Assets" travado em 1px
    // continuaria invisível para sempre em arquivos já abertos.
    _repairCollapsedAutoLayoutHeights(telaFrame, 0);
    let card = null;
    let contentWidth = 0;
    for (const child of (telaFrame.children || [])) {
      try {
        if (child.getPluginData && child.getPluginData('hacFichaTelaTituloCard')) {
          card = child;
        } else if (child.width > contentWidth) {
          // Maior filho que NÃO é o próprio card manda na largura — na
          // prática é sempre "[HAC] Assets do Handoff".
          contentWidth = child.width;
        }
      } catch (e) { }
    }
    if (!card || card.removed) return;
    // Piso de 360px cobre o instante inicial, quando "Assets do Handoff"
    // ainda está vazio e mediria ~0.
    const targetWidth = Math.max(360, Math.round(contentWidth));
    if (Math.round(card.width) !== targetWidth) {
      card.resizeWithoutConstraints(targetWidth, Math.max(1, Math.round(card.height)));
      // Reafirma o Hug de altura depois do resize (2026-09-14) — a API do
      // Figma reverte o eixo pra FIXED quando resizeWithoutConstraints roda
      // depois do sizing mode, travando a altura no valor passado. Ver
      // comentário completo em _buildFichaLegendColumn/stepsList.
      try { card.counterAxisSizingMode = 'AUTO'; } catch (e) { }
    }
    // O texto ganha a largura do card menos o padding horizontal — sem
    // FILL, sem herança: um número, calculado aqui.
    const innerWidth = Math.max(1, targetWidth - (card.paddingLeft || 0) - (card.paddingRight || 0));
    for (const t of (card.children || [])) {
      try {
        if (t.type !== 'TEXT') continue;
        if (t.textAutoResize !== 'HEIGHT') t.textAutoResize = 'HEIGHT';
        if (Math.round(t.width) !== innerWidth) {
          t.resizeWithoutConstraints(innerWidth, Math.max(1, Math.round(t.height)));
        }
      } catch (e) { }
    }
  } catch (e) {
    console.error('[hac] _syncTelaTituloCardWidth: falha ao sincronizar largura do título (não impede o restante).', e && e.message);
  }
}

// "[HAC] Itens" — novo destino das 3 seções (Tabulação/Swipe/Leitor de
// Tela), que hoje já sabem se auto-organizar via _findFichaSectionInFrame/
// _insertFichaSectionInOrder contra "qualquer frame recebido" — nenhuma
// dessas duas funções muda, só o frame que os builders passam a elas.
function _createFichaItensFrame() {
  const itensFrame = figma.createFrame();
  itensFrame.name = '[HAC] Assets do Handoff';
  itensFrame.layoutMode = 'HORIZONTAL';
  itensFrame.primaryAxisSizingMode = 'AUTO';
  itensFrame.counterAxisSizingMode = 'AUTO';
  // 64px (2026-09-14, pedido do usuário: "Aumente o gap entre o frame
  // principal e réplica para 64px"). Histórico: era 24, foi pra 16 em
  // 2026-09-11 quando o vão parecia "muito amplo" — mas naquele momento a
  // estrutura interna era outra (a réplica ainda não vivia dentro do bloco).
  itensFrame.itemSpacing = 64;
  // Padding/radius (2026-09-10, pedido do usuário): "[HAC] Itens" é o
  // container mais externo dos 3/4 blocos — nível logo abaixo do
  // fichaFrame raiz (80/16) na escala descendente confirmada via REST API
  // (ver comentário completo em _createOrGetFichaFrame).
  itensFrame.paddingLeft = 24; itensFrame.paddingRight = 24;
  itensFrame.paddingTop = 24; itensFrame.paddingBottom = 24;
  itensFrame.cornerRadius = 16;
  itensFrame.counterAxisAlignItems = 'MIN';
  itensFrame.fills = [];
  // clipsContent=false (2026-09-11): frames nascem com clip LIGADO na API
  // do Figma — sem isso, overlays de marcadores posicionados em ABSOLUTE
  // (que por natureza extrapolam os limites do clone) apareceriam cortados.
  itensFrame.clipsContent = false;
  itensFrame.setPluginData('hacFichaItensFrame', 'true');
  return itensFrame;
}

// Localiza o "[HAC] Assets do Handoff" DA ÁREA INFORMADA (2026-09-11): com
// várias telas dentro do mesmo "[HAC] Documentação", buscar só pela marca
// genérica devolveria o frame da tela errada. Sem `areaId`, cai no
// comportamento antigo (primeira tela encontrada) — usado só por caminhos
// legados.
function _findFichaItensFrame(fichaFrame, areaId) {
  const telaFrame = (fichaFrame.children || []).find(c => {
    try {
      if (!c.getPluginData) return false;
      if (areaId) return c.getPluginData('hacFichaTelaForArea') === areaId;
      return c.getPluginData('hacFichaAreaGroup') === 'true';
    } catch (e) { return false; }
  });
  if (!telaFrame) return null;
  for (const child of (telaFrame.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaItensFrame') === 'true') {
        return child;
      }
    } catch (e) { }
  }
  return null;
}

// Busca o frame de itens por pluginData, descendo a árvore inteira a
// partir de qualquer node-raiz (2026-09-11). Substitui as buscas por NOME
// (`findOne(n => n.name === '[HAC] Itens')`) que existiam nos handlers —
// nome é dado de exibição, o designer pode renomear, e uma renomeação
// interna do próprio plugin quebraria a busca em silêncio. Profundidade
// limitada por segurança (mesmo espírito de _forEachA11yFichaFrameChild).
export function _findFichaItensFrameDeep(rootNode) {
  if (!rootNode) return null;
  let found = null;
  const walk = (node, depth) => {
    if (found || !node || depth > 8) return;
    try {
      if (node.getPluginData && node.getPluginData('hacFichaItensFrame') === 'true') {
        found = node;
        return;
      }
    } catch (e) { }
    for (const child of (node.children || [])) walk(child, depth + 1);
  };
  walk(rootNode, 0);
  return found;
}

// Varre todos os nodes de todas as árvores de Ficha da página, em
// profundidade (2026-09-11) — necessário desde que a hierarquia ganhou os
// níveis "Tela N" > "[HAC] Assets do Handoff" > blocos: buscas que antes
// olhavam só filhos diretos do frame raiz deixam de encontrar o alvo.
// Coleta os nodes antes de chamar `fn`, pra que a callback possa remover
// nodes sem invalidar a iteração.
export function _forEachFichaFrameNodeDeep(fn) {
  const collected = [];
  const walk = (node, depth) => {
    if (!node || depth > 12) return;
    collected.push(node);
    for (const child of (node.children || [])) walk(child, depth + 1);
  };
  _forEachFichaFrameCandidate(root => {
    if (!root || root.type === 'SECTION') return;
    walk(root, 0);
  });
  for (const node of collected) {
    try { if (!node.removed) fn(node); } catch (e) { }
  }
}

// Destino único usado pelos 3 builders (Tabulação/Swipe/Leitor de Tela) no
// lugar do fichaFrame raiz — cria a estrutura Área>Documentação+Itens na
// primeira chamada (idempotente, mesmo princípio de _findFichaSectionInFrame
// já usado por cada builder logo em seguida) e devolve sempre o mesmo
// "[HAC] Itens".
//
// "Frame Principal" REMOVIDO desta cadeia (2026-09-11, bug real reportado
// pelo usuário com print: "Ele criou outro frame e outra réplica"). A
// chamada a _buildFichaFramePrincipalSection recriava, dentro do "[HAC]
// Documentação", um SNAPSHOT INTEIRO do frame original — que já está
// visível na própria Section, ao lado da réplica de trabalho. Não é uma
// réplica de trabalho nova, mas é uma cópia redundante do que o designer já
// vê no canvas. Decisão do usuário: "o frame principal já está ali na
// section, foi exatamente a tela que eu criei. A única coisa que é pra você
// fazer é organizar dentro do frame [HAC] Documentação [...] a legenda que
// será criada e a réplica que é criada" — o Documentação organiza só
// legenda + réplica de trabalho, nunca gera imagem própria do original.
// _buildFichaFramePrincipalSection não foi apagada (evita quebrar qualquer
// referência residual), só deixou de ser chamada automaticamente aqui.
export async function _getOrCreateFichaItensFrame(fichaFrame, area) {
  const areaId = (area && area.id) || '';
  // Cabeçalho REMOVIDO por completo (2026-09-11, pedido explícito do
  // usuário — ver comentário histórico acima de
  // _removeOrphanDocumentacaoHeader). Limpeza defensiva de qualquer
  // cabeçalho órfão de sessões anteriores, barata (só varre filhos
  // diretos).
  try { _removeOrphanDocumentacaoHeader(fichaFrame); } catch (e) { }
  let itensFrame = _findFichaItensFrame(fichaFrame, areaId);
  if (!itensFrame) {
    const telaFrame = await _getOrCreateFichaAreaGroup(fichaFrame, area);
    itensFrame = _findFichaItensFrame(fichaFrame, areaId) || (telaFrame.children || []).find(c => {
      try { return c.getPluginData && c.getPluginData('hacFichaItensFrame') === 'true'; } catch (e) { return false; }
    });
  }
  // Sem "[HAC] Assets do Handoff" nada abaixo dele pode ser criado (bloco da
  // funcionalidade, instruções, legenda). Falhar alto aqui (2026-09-11) em
  // vez de seguir com `undefined` — o chamador reporta o erro ao designer.
  if (!itensFrame) {
    throw new Error('não foi possível criar/localizar "[HAC] Assets do Handoff" da área ' + (areaId || '(sem id)'));
  }
  // Backfill do gap (2026-09-14, pedido do usuário: 64px entre o frame
  // principal e a réplica) — reafirmado a cada chamada pra convergir
  // "[HAC] Assets do Handoff" criados por versões anteriores (16/24px).
  try { itensFrame.itemSpacing = 64; } catch (e) { }
  // Frame principal (Grupo da Área) BLOQUEADO no canvas (2026-09-14,
  // pedido do usuário: "o frame principal pode ficar como bloqueado") — é
  // material de referência, não deve ser arrastado/editado por acidente
  // enquanto o designer trabalha na réplica ao lado. `locked` não impede
  // nada que o plugin faça por código, só a manipulação manual.
  try {
    for (const child of (itensFrame.children || [])) {
      try {
        if (child.type === 'GROUP' && child.getPluginData && child.getPluginData('hacAreaTargetNodeId')) {
          child.locked = true;
        }
      } catch (e) { }
    }
  } catch (e) { }
  // Backfill de nome (2026-09-11) — ver comentário equivalente em
  // _getOrCreateFichaBlockSection.
  try { if (itensFrame) itensFrame.name = '[HAC] Assets do Handoff'; } catch (e) { }
  // Limpeza defensiva de "frames fantasma" (2026-09-11, bug real reportado
  // pelo usuário com print) — remove qualquer "[HAC] Handoff - {Func}"
  // VAZIO encontrado aqui dentro. Cobre dois casos: (1) arquivos já abertos
  // com um frame vazio deixado por uma execução anterior que falhou entre
  // criar o FRAME e reparentar o clone nele (ver try/catch dedicado em
  // _ensureLegendBesideClone, que previne isso daqui pra frente); (2)
  // qualquer caminho futuro não coberto por essa proteção. Nunca remove um
  // FRAME com conteúdo — só o caso genuinamente vazio.
  try { _removeEmptyFichaHandoffFrames(itensFrame); } catch (e) { }
  return itensFrame;
}

function _removeEmptyFichaHandoffFrames(itensFrame) {
  if (!itensFrame || !itensFrame.children) return;
  for (const block of itensFrame.children.slice()) {
    try {
      if (!block.getPluginData || !block.getPluginData('hacFichaSection')) continue;
      for (const child of (block.children || []).slice()) {
        try {
          if (child.getPluginData && child.getPluginData('hacFichaHandoffGroup') &&
            !child.removed && (child.children || []).length === 0) {
            child.remove();
          }
        } catch (e) { }
      }
    } catch (e) { }
  }
}

// "Frame Principal" — 1º bloco de "[HAC] Itens" (2026-09-10, autorizado
// explicitamente pelo usuário como funcionalidade NOVA, não só reorganização
// de estrutura existente): nome do frame + selo real de "Número da tela"
// (mesma key/lógica já usada hoje em create-a11y-area, ver
// A11Y_ITEM_NUMBER_KEYS_DESKTOP/A11Y_ITEM_NUMBER_KEYS_MOBILE acima) +
// snapshot (imagem) da tela ORIGINAL da área — não um clone de trabalho
// novo. Reaproveita _snapshotCloneIntoFichaSection tal como está: a função
// só usa exportAsync/absoluteBoundingBox/id/name, propriedades de qualquer
// SceneNode — passar o node ORIGINAL (area.targetNodeId) em vez de um
// clone funciona sem nenhuma alteração nela, e evita criar um 4º clone
// incremental só pra isso (o node original é só lido, nunca precisa ficar
// "vivo"/editável como os clones de Tabulação/Swipe/Leitor).
//
// Decisão de quando rodar: chamada de dentro de _getOrCreateFichaItensFrame
// (não de um handler dedicado) — roda toda vez que qualquer um dos 3
// builders (Tabulação/Swipe/Leitor) cria/reaproveita "[HAC]
// Itens", em toda chamada (não só na primeira). Idempotente por conteúdo,
// não por "já rodou uma vez": o texto de nome só é criado se `section`
// ainda não existir, o snapshot é sempre regerado (mesmo princípio dos
// outros 3 blocos) e o selo de Número da tela só é criado uma vez (marcado
// por pluginData `hacFichaPrincipalBadgeForArea`), só reposicionado nas
// chamadas seguintes. Simétrico ao próprio bloco: comum aos 3, faz sentido
// existir assim que a Ficha começa a ser preenchida, sem precisar de um 4º
// botão "Inserir/Atualizar" dedicado no frontend.
async function _buildFichaFramePrincipalSection(itensFrame, area) {
  let section = _findFichaSectionInFrame(itensFrame, 'principal');
  const isNew = !section;
  if (isNew) {
    section = figma.createFrame();
    section.name = '[HAC] Frame Principal';
    section.layoutMode = 'VERTICAL';
    section.primaryAxisSizingMode = 'AUTO';
    section.counterAxisSizingMode = 'AUTO';
    section.itemSpacing = 16;
    section.paddingLeft = 16; section.paddingRight = 16;
    section.paddingTop = 16; section.paddingBottom = 16;
    section.cornerRadius = 8;
    section.fills = [];
    section.clipsContent = false;
    section.setPluginData('hacFichaSection', 'principal');
    _insertFichaSectionInOrder(itensFrame, section, 'principal');

    const nomeText = figma.createText();
    nomeText.name = '[Nome do Frame]';
    nomeText.characters = area.targetNodeName || area.sectionName || area.label || 'Área';
    nomeText.textAutoResize = 'HEIGHT';
    // Escala real (corrigido 2026-09-11, era 13px/Inter Bold — fora da
    // escala real): mapeado para "label/small" (14px, peso 700/bold,
    // lineHeight 20) — piso mais próximo acima de 13px, já que este texto é
    // um destaque (nome do frame em negrito), não texto corrido.
    await _applyFichaTypography(nomeText, 'label/small');
    nomeText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    section.appendChild(nomeText);
  }

  // Backfill de nome (2026-09-11) — fora do `if (isNew)` porque esta
  // função roda a cada chamada: blocos criados antes da renomeação
  // convergem para o nome novo sem precisar recriar nada.
  try { section.name = '[HAC] Frame Principal'; } catch (e) { }

  // Réplica de imagem SEMPRE regerada (mesmo princípio de idempotência já
  // usado nos outros 3 blocos — _snapshotCloneIntoFichaSection remove a
  // imagem antiga marcada com o mesmo id antes de criar a nova), mesmo
  // quando `section` já existia — "Atualizar" precisa refletir o estado
  // atual da tela original a cada chamada, não só na primeira criação.
  const root = area.targetNodeId ? await _getSceneNodeById(area.targetNodeId) : null;
  if (!root || !root.absoluteBoundingBox || typeof root.exportAsync !== 'function') {
    return section;
  }

  const snapshotRect = await _snapshotCloneIntoFichaSection(root, section, 'hacFichaPrincipalSnapshotForArea', area.id);

  // Selo de "Número da tela" — só desenhado uma vez (mesma marca de
  // pluginData verificada antes de criar) pra não empilhar instâncias
  // duplicadas a cada "Atualizar"; reposicionado a cada chamada pra
  // acompanhar o snapshot se ele mudar de tamanho.
  let badge = null;
  for (const child of (section.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaPrincipalBadgeForArea') === (area.id || '')) {
        badge = child;
        break;
      }
    } catch (e) { }
  }

  if (!badge) {
    const usingMobileKeys = area.a11yOrigin === 'mobile' && A11Y_ITEM_NUMBER_KEYS_MOBILE.desativado;
    const badgeKey = usingMobileKeys ? A11Y_ITEM_NUMBER_KEYS_MOBILE.desativado : A11Y_ITEM_NUMBER_KEYS_DESKTOP.desativado;
    const propKeys = usingMobileKeys
      ? { number: 'número#1478:0', showLabel: 'mostrar label#733:0', label: 'label#733:6' }
      : { number: 'number#1478:0', showLabel: 'show label#733:0', label: 'label#733:6' };
    try {
      const comp = await figma.importComponentByKeyAsync(badgeKey);
      badge = comp.createInstance();
      badge.setProperties({
        [propKeys.number]: String(area.number || 1),
        [propKeys.label]: area.label || '',
        [propKeys.showLabel]: !!area.label,
      });
    } catch (e) {
      badge = figma.createEllipse();
      badge.name = 'Selo de Número da Tela';
      badge.resize(24, 24);
      badge.fills = [{ type: 'SOLID', color: hexToRgb('#0070AF') }];
    }
    badge.setPluginData('hacFichaPrincipalBadgeForArea', area.id || '');
    section.appendChild(badge);
    // GROUP normalmente ficaria ABSOLUTE (ver _setCloneOverlayGroupAbsolutePositioning)
    // pra sair do fluxo do Auto Layout — aqui o badge é uma INSTANCE
    // simples, não um grupo com conteúdo herdado de outro sistema de
    // coordenadas, então o mesmo ajuste se aplica igual: precisa ficar
    // fora do fluxo vertical de `section` pra poder ser posicionado livre
    // (canto superior esquerdo do snapshot).
    try {
      if ('layoutPositioning' in badge) badge.layoutPositioning = 'ABSOLUTE';
    } catch (e) { }
  }

  // Posição sensata pedida: canto superior esquerdo do snapshot, com uma
  // pequena margem pra dentro (o selo fica parcialmente sobreposto à
  // imagem, mesmo padrão visual de como já aparece hoje marcando uma área
  // no canvas de trabalho).
  if (snapshotRect && badge) {
    badge.x = Math.round(snapshotRect.x + 8);
    badge.y = Math.round(snapshotRect.y + 8);
  }

  return section;
}

// Devolve a seção (Tabulação/Swipe/Leitor de Tela) já existente pra ser
// reaproveitada, identificada por pluginData 'hacFichaSection' no nó RAIZ
// daquela seção (não por nome/posição, o designer pode reordenar/renomear
// livremente dentro do frame) — 2026-09-09, necessário desde que
// Tabulação/Swipe/Leitor passaram a mover a réplica de trabalho pra dentro
// da Ficha em vez de recriá-la do zero a cada "Atualizar" (remover a seção
// pra desenhar de novo apagaria essa réplica MOVIDA, que não tem como ser
// recriada sem perder o trabalho já feito — por isso não existe mais uma
// função de "remover seção" irmã desta, ver histórico em
// _buildFichaReviewSection, removida em 2026-09-10, única chamadora que
// ainda precisava desse comportamento).
export function _findFichaSectionInFrame(fichaFrame, sectionKey) {
  for (const child of (fichaFrame.children || [])) {
    try {
      if (child.getPluginData && child.getPluginData('hacFichaSection') === sectionKey) {
        return child;
      }
    } catch (e) { }
  }
  return null;
}

// Ordem visual fixa dos blocos da Ficha — 1) Ordem de Tabulação, 2) Swipe,
// 3) Leitor de Tela. 'principal' mantido na lista só por compatibilidade de
// índice (nunca mais criado como bloco — ver comentário de remoção acima de
// _getOrCreateFichaItensFrame, 2026-09-11: "Frame Principal" duplicava a
// tela original, que já está visível na Section). Havia também um 4º bloco
// ("Handoff Review", consolidado) — removido por completo em 2026-09-10,
// funcionalidade descontinuada (nunca finalizada, ver comentário de remoção
// acima de _buildFichaReviewSection original, no bloco de handlers).
export const FICHA_SECTION_ORDER = ['principal', 'tabulacao', 'swipe', 'leitor'];

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
export function _insertFichaSectionInOrder(fichaFrame, section, sectionKey) {
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

// Mapeamento de cor do marcador visual (círculo) da seção Assets/Entendendo
// as categorias, por palavra-chave no label do asset — case-insensitive.
// Cinza neutro é o fallback pra qualquer label fora dessas 3 famílias
// conhecidas (nunca trava por label inesperado vindo do JSON).
function _fichaLegendAssetColor(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('interativ') || l.includes('imagens')) return '#fcbe05';
  if (l.includes('título') || l.includes('titulo')) return '#afca0b';
  if (l.includes('decorativ')) return '#b22c2c';
  return '#94a3b8';
}

// Mesmo mapeamento de _fichaLegendAssetColor, mas devolvendo a categoria
// real de A11Y_AGRUPAMENTO_KEYS (2026-09-10, pedido do usuário) — os
// marcadores da legenda "Entendendo as categorias" do Leitor de Tela devem
// usar os MESMOS círculos reais (H/imagem/proibido) já desenhados hoje nas
// specs, via _tryImportA11yAgrupamento, em vez de um círculo sólido sem
// ícone. Espelha A11Y_CATEGORIES (accessibility.js, frontend) — o backend
// não pode importar aquele módulo, mas o mapeamento label→categoria é o
// mesmo por definição (mesmas 3 categorias, mesmos textos).
function _fichaLegendAssetCategory(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('interativ') || l.includes('imagens')) return 'elemento';
  if (l.includes('título') || l.includes('titulo')) return 'titulo';
  if (l.includes('decorativ')) return 'decorativo';
  return null;
}

// Coluna de legenda textual, reaproveitada pelas seções de Tabulação/Swipe/
// Leitor de Tela — Auto Layout VERTICAL simples, sem depender de nenhum
// componente real da lib.
//
// `richContent` é um bloco de src/plugin/refs/ficha-instruction-content.json
// (FICHA_INSTRUCTION_CONTENT.tabulacao/.swipe/.leitorTela) — conteúdo REAL
// extraído do template oficial de Handoff (título, texto explicativo, passos
// numerados, seção de Assets com marcadores coloridos). Quando o bloco vier
// vazio (hoje é o caso do Swipe — a lib ainda não tem frame de instrução
// pra ele, ver swipeNote no JSON), cai no fallback de texto curto atual
// (fallbackTitle/fallbackDescription), exatamente como a função já se
// comportava antes desta mudança — nunca regride esse caso.
// Título de bloco (2026-09-10, pedido do usuário) — nome do bloco (Ordem de
// Tabulação/Swipe/Leitor de Tela). Corrigido 2026-09-11: o fontSize 40/
// lineHeight 140% usado antes não batia com nenhum token real (a escala
// confirmada via REST API nesta sessão vai só até 36px, "display/standard").
// Mapeado para "title/large" (28px, peso 600/semibold, lineHeight 36 ≈129%)
// em vez de "display/standard" (36px, mesmo token do nome da tela em
// `_createFichaDocumentacaoFrame`): este título já é hierarquicamente um
// nível abaixo do nome da tela (nomeText é o H1 da Ficha inteira; este é o
// H2 de cada bloco) — usar o mesmo tamanho de ambos removeria a única pista
// visual de hierarquia entre "nome da tela" e "nome do bloco", que a escala
// anterior (60px vs 40px) também preservava com uma escada nítida. 28px
// mantém essa escada (36 > 28) e ainda fica bem acima dos títulos de card
// internos (14-16px), preservando a leitura de "título de seção".
export async function _appendFichaBlockTitle(section, text) {
  const t = figma.createText();
  t.name = 'Título do bloco';
  // Bug real corrigido (2026-09-11, reportado com print pelo usuário: texto
  // quebrado letra por letra, "W 0" mesmo com Fill selecionado) —
  // textAutoResize precisa ser setado ANTES de `.characters`: um TEXT recém-
  // criado nasce com textAutoResize='NONE' (largura/altura fixas em 0), e
  // escrever texto nesse estado trava a largura nesse valor. FILL aplicado
  // depois não corrige retroativamente — mesmo padrão de bug já documentado
  // em _ensureTelaTituloCard (e no cabeçalho removido por completo).
  //
  // Medição em 2 fases (2026-09-14, corrige "Ordem de T..." cortado — print
  // do usuário mostrava o título truncado numa única linha): começa em
  // 'WIDTH_AND_HEIGHT' pra deixar o Figma medir a largura NATURAL do texto
  // em 'title/large' (28px) numa linha só — sem isso, não há como saber se
  // o título cabe no pai (260px, largo demais só pra "Leitor de Tela", curto
  // demais pra "Ordem de Leitura | Swipe") sem adivinhar largura-por-
  // caractere. Só depois de medir é que trocamos pra 'HEIGHT' com a largura
  // final explícita — mesma ordem seting-antes-de-characters de sempre,
  // só que em 2 passos.
  t.textAutoResize = 'WIDTH_AND_HEIGHT';
  await _applyFichaTypography(t, 'title/large');
  t.characters = text;
  t.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
  section.appendChild(t);
  // Largura numérica explícita, NÃO FILL (2026-09-12, mesma revisão que
  // abandonou o FILL em _ensureTelaTituloCard — ver comentário completo
  // lá). O pai ("[HAC] Instruções de {Func}") tem largura FIXED conhecida,
  // então dá pra calcular a largura do texto diretamente, sem depender do
  // Auto Layout resolver uma relação declarativa no momento certo.
  //
  // A largura final é o MAIOR entre a largura natural medida acima e a
  // largura interna do pai — nunca o menor: forçar o texto pra caber num
  // pai estreito demais é o que causava o corte ("Ordem de T..."). Quando o
  // texto natural for maior que o pai, também FAZEMOS o pai crescer (ver
  // bloco abaixo) — mesmo espírito de _syncTelaTituloCardWidth: o container
  // se adapta ao conteúdo real, não o contrário.
  try {
    const naturalWidth = Math.max(1, Math.round(t.width));
    const padH = (section && ((section.paddingLeft || 0) + (section.paddingRight || 0))) || 0;
    const parentWidth = section && section.width > 0 ? section.width : 260;
    const parentInnerWidth = Math.max(1, Math.round(parentWidth - padH));
    const innerWidth = Math.max(naturalWidth, parentInnerWidth);
    t.textAutoResize = 'HEIGHT';
    t.resizeWithoutConstraints(innerWidth, Math.max(1, Math.round(t.height)));
    // Se o texto precisou de mais espaço que o pai tinha, cresce o pai
    // também (só a largura — counterAxisSizingMode já é 'FIXED', então sem
    // isso o pai ficaria mais estreito que o próprio filho, cortando
    // visualmente do mesmo jeito). Idempotente: só redimensiona se
    // realmente precisar crescer, nunca encolhe um pai que já esteja maior
    // (ex.: por causa da Legenda ao lado, mais larga que o título).
    if (section && !section.removed && innerWidth > parentInnerWidth) {
      const newParentWidth = Math.round(innerWidth + padH);
      if (newParentWidth > Math.round(section.width)) {
        section.resizeWithoutConstraints(newParentWidth, Math.max(1, Math.round(section.height)));
      }
    }
  } catch (e) { }
  return t;
}

export async function _buildFichaLegendColumn(richContent, fallbackTitle, fallbackDescription) {
  const hasRichContent = !!(richContent && richContent.title);

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
  // Largura um pouco maior (260) que a versão só-com-texto-curto (220) —
  // o conteúdo rico (passos numerados, Assets) fica mais confortável com
  // mais espaço horizontal; não se aplica ao fallback, que continua leve.
  col.resizeWithoutConstraints(hasRichContent ? 260 : 220, 1);
  col.primaryAxisSizingMode = 'AUTO';
  col.counterAxisSizingMode = 'FIXED';
  // Cor de fundo real da lib (pedido do usuário): aproximação visual de
  // "color/bg/neutral/2" (grayscale 10) — mesma justificativa de hex fixo
  // (não setBoundVariable) do fundo da Ficha acima.
  col.fills = [{ type: 'SOLID', color: hexToRgb('#F5F5F5') }];

  // Largura interna (2026-09-14, abandono do FILL nesta função — mesma
  // revisão de _ensureTelaTituloCard/_appendFichaBlockTitle, ver comentário
  // completo lá): `col` tem largura FIXED conhecida no momento em que é
  // criado (220/260, acima), então dá pra calcular a largura útil de TODO
  // texto direto dela sem depender do Auto Layout resolver FILL na ordem
  // certa. Usada por todo o restante da função.
  const colInnerWidth = Math.max(1, Math.round(
    col.width - (col.paddingLeft || 0) - (col.paddingRight || 0)
  ));

  const titleText = figma.createText();
  titleText.name = 'Título';
  // Bug real corrigido (2026-09-11, auditoria completa): textAutoResize
  // precisa ser setado ANTES de `.characters` — ver comentário completo em
  // _appendFichaBlockTitle.
  titleText.textAutoResize = 'HEIGHT';
  // Escala real (corrigido 2026-09-11, era 13px/Inter Bold): "label/small"
  // (14px, peso 700/bold, lineHeight 20) — piso mais próximo acima de 13px
  // para este texto de destaque (título da legenda, em negrito).
  await _applyFichaTypography(titleText, 'label/small');
  titleText.characters = hasRichContent ? richContent.title : fallbackTitle;
  titleText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
  col.appendChild(titleText);
  // Largura numérica explícita, NÃO FILL (2026-09-14) — `colInnerWidth`
  // acima, calculado uma vez e reaproveitado por todo texto direto de
  // `col` nesta função. Só aplicado em textos/blocos de conteúdo (que
  // devem ocupar a largura do container); marcadores/badges pequenos
  // (`marker`, `number`) mantêm tamanho intrínseco.
  titleText.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(titleText.height)));

  if (!hasRichContent) {
    const descText = figma.createText();
    descText.name = 'Descrição';
    // Bug real corrigido (2026-09-11) — ordem, ver comentário em
    // _appendFichaBlockTitle.
    descText.textAutoResize = 'HEIGHT';
    // Escala real (corrigido 2026-09-11, era 11px/Inter Regular — abaixo do
    // piso real de 12px): elevado para "label/tiny" (12px, lineHeight 16),
    // com weightOverride=400 pra manter o peso visual Regular de texto
    // corrido (label/tiny é 700/bold por padrão — não se aplica aqui).
    await _applyFichaTypography(descText, 'label/tiny', 400);
    descText.characters = fallbackDescription;
    descText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    col.appendChild(descText);
    descText.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(descText.height)));
    return col;
  }

  // Subtítulo auxiliar (heading pequeno, Medium) reaproveitado pelos 3
  // "cabeçalhos" do conteúdo rico: instructionsHeading, stepsHeading,
  // assetsHeading — mesma hierarquia visual do template oficial.
  async function appendHeading(text) {
    if (!text) return;
    const t = figma.createText();
    t.name = 'Subtítulo';
    // Bug real corrigido (2026-09-11) — ordem, ver comentário em
    // _appendFichaBlockTitle.
    t.textAutoResize = 'HEIGHT';
    // Escala real (corrigido 2026-09-11, era 11px/Inter Medium — abaixo do
    // piso real de 12px): elevado para "label/tiny" (12px, lineHeight 16),
    // com weightOverride=500 pra manter o peso visual Medium.
    await _applyFichaTypography(t, 'label/tiny', 500);
    t.characters = text;
    t.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    col.appendChild(t);
    t.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(t.height)));
  }

  async function appendParagraph(text) {
    if (!text) return;
    const t = figma.createText();
    t.name = 'Parágrafo';
    // Bug real corrigido (2026-09-11) — ordem, ver comentário em
    // _appendFichaBlockTitle.
    t.textAutoResize = 'HEIGHT';
    // Escala real (corrigido 2026-09-11, era 11px/Inter Regular — abaixo do
    // piso real de 12px): elevado para "label/tiny" (12px, lineHeight 16),
    // com weightOverride=400 pra manter o peso visual Regular de texto
    // corrido.
    await _applyFichaTypography(t, 'label/tiny', 400);
    t.characters = text;
    t.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    col.appendChild(t);
    t.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(t.height)));
  }

  await appendHeading(richContent.instructionsHeading);
  await appendParagraph(richContent.instructionsBody);

  if (Array.isArray(richContent.steps) && richContent.steps.length > 0) {
    await appendHeading(richContent.stepsHeading);

    const stepsList = figma.createFrame();
    stepsList.name = 'Passos';
    stepsList.layoutMode = 'VERTICAL';
    // Escala real (corrigido 2026-09-11, era 6px — fora da escala de
    // spacing real): "nano" (8px) — espaço entre passos distintos, itens
    // de conteúdo separado, não partes do mesmo item.
    stepsList.itemSpacing = 8;
    stepsList.fills = [];
    stepsList.resizeWithoutConstraints(1, 1);
    stepsList.primaryAxisSizingMode = 'AUTO';
    stepsList.counterAxisSizingMode = 'FIXED';
    col.appendChild(stepsList);
    // Largura numérica explícita, NÃO FILL (2026-09-14) — `colInnerWidth`
    // (calculado uma vez no topo da função) já desconta o padding de `col`;
    // o valor antigo (`col.width`, largura EXTERNA, sem descontar padding)
    // transbordava 24px pra fora da área útil — um dos containers com
    // sizing incorreto encontrados na auditoria pedida (item 4).
    stepsList.counterAxisSizingMode = 'FIXED';
    stepsList.resizeWithoutConstraints(colInnerWidth, 1);
    // Bug real corrigido (2026-09-14, reportado com print: "ainda temos
    // itens recolhidos no frame da ordem de tabulação" — painel mostrava
    // este frame com H 1). `resizeWithoutConstraints` chamado DEPOIS de
    // `primaryAxisSizingMode='AUTO'` faz a API do Figma reverter
    // silenciosamente o eixo primário pra FIXED com a altura passada (1px),
    // colapsando a lista de passos — a MESMA armadilha já documentada em
    // `col` logo acima. Reafirmar AUTO depois do resize devolve o Hug.
    stepsList.primaryAxisSizingMode = 'AUTO';

    // for...of (não mais .forEach) — necessário pra poder `await` a
    // aplicação de tipografia (loadFontAsync) de cada texto em sequência.
    for (let i = 0; i < richContent.steps.length; i++) {
      const stepText = richContent.steps[i];
      const row = figma.createFrame();
      row.name = `Passo ${i + 1}`;
      row.layoutMode = 'HORIZONTAL';
      // Escala real (corrigido 2026-09-11, era 6px): "quark" (4px) — número
      // e texto do mesmo passo, mais próximos entre si do que os passos uns
      // dos outros (stepsList.itemSpacing acima, "nano"=8px).
      row.itemSpacing = 4;
      row.fills = [];
      row.counterAxisAlignItems = 'MIN';
      row.resizeWithoutConstraints(1, 1);
      row.primaryAxisSizingMode = 'AUTO';
      row.counterAxisSizingMode = 'FIXED';
      stepsList.appendChild(row);
      // `row` ganha a largura cheia de `stepsList` (que já é `colInnerWidth`,
      // sem padding próprio) — mesma lógica de "pai FIXED conhecido" do
      // resto da função, em vez de FILL.
      row.resizeWithoutConstraints(colInnerWidth, 1);
      // Reafirma AUTO depois do resize (2026-09-14) — senão a altura fica
      // travada em 1px e o passo inteiro some. Ver comentário em stepsList.
      row.primaryAxisSizingMode = 'AUTO';

      const number = figma.createText();
      number.name = 'Número';
      // Ordem preventiva (2026-09-11) — mesmo padrão do resto da função,
      // embora este texto não use FILL hoje (WIDTH_AND_HEIGHT não trava
      // largura como NONE/HEIGHT travariam).
      number.textAutoResize = 'WIDTH_AND_HEIGHT';
      number.characters = `${i + 1}.`;
      // Escala real (corrigido 2026-09-11, era 11px/Inter Bold — abaixo do
      // piso real de 12px): elevado para "label/tiny" (12px, peso 700/bold
      // — já é o peso "oficial" do token, sem precisar de override).
      await _applyFichaTypography(number, 'label/tiny');
      number.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      row.appendChild(number);

      const text = figma.createText();
      text.name = 'Texto';
      // Bug real corrigido (2026-09-11) — ordem, ver comentário em
      // _appendFichaBlockTitle.
      text.textAutoResize = 'HEIGHT';
      // Escala real (corrigido 2026-09-11, era 11px/Inter Regular — abaixo
      // do piso real de 12px): elevado para "label/tiny" (12px), com
      // weightOverride=400 pra manter o peso visual Regular de texto
      // corrido.
      await _applyFichaTypography(text, 'label/tiny', 400);
      text.characters = stepText;
      text.fills = [{ type: 'SOLID', color: { r: 0.3, g: 0.3, b: 0.3 } }];
      row.appendChild(text);
      // Largura numérica explícita, NÃO layoutGrow (2026-09-14) — mesmo
      // abandono do resto da função: a largura disponível pro texto é a de
      // `row` (colInnerWidth) menos o "Número" (medido, WIDTH_AND_HEIGHT) e
      // o itemSpacing entre os dois.
      const numberSlot = Math.round(number.width) + (row.itemSpacing || 0);
      const stepTextWidth = Math.max(1, colInnerWidth - numberSlot);
      text.resizeWithoutConstraints(stepTextWidth, Math.max(1, Math.round(text.height)));
    }
  }

  if (Array.isArray(richContent.assets) && richContent.assets.length > 0) {
    await appendHeading(richContent.assetsHeading);

    const assetsList = figma.createFrame();
    assetsList.name = 'Assets';
    assetsList.layoutMode = 'VERTICAL';
    // Escala real (corrigido 2026-09-11, era 6px): "nano" (8px) — mesmo
    // raciocínio de stepsList acima, assets distintos, não partes do mesmo
    // item.
    assetsList.itemSpacing = 8;
    assetsList.fills = [];
    assetsList.resizeWithoutConstraints(1, 1);
    assetsList.primaryAxisSizingMode = 'AUTO';
    assetsList.counterAxisSizingMode = 'AUTO';
    col.appendChild(assetsList);
    // Largura numérica explícita, NÃO FILL (2026-09-14) — mesma correção de
    // `stepsList` acima: `colInnerWidth` já desconta o padding de `col`,
    // diferente do `col.width` (largura EXTERNA) usado antes aqui, que
    // transbordava a área útil em 24px.
    assetsList.counterAxisSizingMode = 'FIXED';
    assetsList.resizeWithoutConstraints(colInnerWidth, 1);
    // Mesma correção de `stepsList` (2026-09-14): reafirmar AUTO depois do
    // resize, senão o eixo primário fica FIXED em 1px e a lista de Assets
    // colapsa (aparecia como um traço fino no print do usuário).
    assetsList.primaryAxisSizingMode = 'AUTO';

    for (let i = 0; i < richContent.assets.length; i++) {
      const asset = richContent.assets[i];
      const row = figma.createFrame();
      row.name = `Asset ${i + 1}`;
      row.layoutMode = 'HORIZONTAL';
      // Escala real (corrigido 2026-09-11, era 6px): "quark" (4px) — mesmo
      // raciocínio da linha de Passo acima: marcador e texto do mesmo
      // asset, mais próximos entre si do que assets distintos entre si.
      row.itemSpacing = 4;
      row.fills = [];
      row.counterAxisAlignItems = 'MIN';
      row.resizeWithoutConstraints(1, 1);
      row.primaryAxisSizingMode = 'AUTO';
      row.counterAxisSizingMode = 'FIXED';
      assetsList.appendChild(row);
      // `row` ganha a largura cheia de `assetsList` (já é `colInnerWidth`)
      // — mesmo padrão de "pai FIXED conhecido" do resto da função.
      row.resizeWithoutConstraints(colInnerWidth, 1);
      // Reafirma AUTO depois do resize (2026-09-14) — ver comentário
      // equivalente na linha de Passo acima.
      row.primaryAxisSizingMode = 'AUTO';

      // Marcador real da lib (2026-09-10, pedido do usuário) — mesmo
      // componente "[a11y] Agrupamento" já usado nas specs do Leitor de
      // Tela (_tryImportA11yAgrupamento), reaproveitado tal como está: nada
      // novo foi criado, só chamado de um lugar a mais. Fallback pro
      // círculo sólido de sempre se a categoria não mapear ou o import
      // falhar — nunca trava a montagem da legenda.
      let marker = null;
      const category = _fichaLegendAssetCategory(asset.label);
      if (category) {
        try {
          marker = await _tryImportA11yAgrupamento({ a11yType: category, guideSide: 'right', letter: category === 'titulo' ? 'H' : null });
          // 24x24 (não 16x16 como o círculo sólido de fallback) — o
          // componente real tem moldura tracejada + badge central;
          // redimensionar pra 16px distorceria a moldura fina demais pra
          // ficar legível numa legenda pequena.
          marker.resize(24, 24);
        } catch (e) {
          marker = null;
        }
      }
      if (!marker) {
        marker = figma.createEllipse();
        marker.name = 'Marcador';
        marker.resizeWithoutConstraints(16, 16);
        marker.fills = [{ type: 'SOLID', color: hexToRgb(_fichaLegendAssetColor(asset.label)) }];
      }
      row.appendChild(marker);

      const textCol = figma.createFrame();
      textCol.name = 'Texto';
      textCol.layoutMode = 'VERTICAL';
      // Escala real (corrigido 2026-09-11, era 2px — abaixo até do menor
      // token real, "quark"=4px): label e descrição do mesmo asset ficam
      // apertados de propósito (mesmo item), "quark" é o mínimo real
      // disponível pra esse contexto.
      textCol.itemSpacing = 4;
      textCol.fills = [];
      textCol.resizeWithoutConstraints(1, 1);
      textCol.primaryAxisSizingMode = 'AUTO';
      textCol.counterAxisSizingMode = 'FIXED';
      row.appendChild(textCol);
      // Largura numérica explícita, NÃO layoutGrow (2026-09-14) — o
      // `marker` varia de tamanho (24px componente real da lib, 16px
      // ellipse de fallback), então a largura disponível pro texto é
      // calculada por linha: colInnerWidth menos o marker medido e o
      // itemSpacing entre marker e textCol.
      const markerSlot = Math.round(marker.width) + (row.itemSpacing || 0);
      const textColWidth = Math.max(1, colInnerWidth - markerSlot);
      textCol.resizeWithoutConstraints(textColWidth, 1);
      // Reafirma AUTO depois do resize (2026-09-14) — ver comentário em
      // stepsList; sem isto a coluna de texto do Asset colapsa em 1px.
      textCol.primaryAxisSizingMode = 'AUTO';

      const label = figma.createText();
      label.name = 'Label';
      // Bug real corrigido (2026-09-11) — ordem, ver comentário em
      // _appendFichaBlockTitle.
      label.textAutoResize = 'HEIGHT';
      // Escala real (corrigido 2026-09-11, era 11px/Inter Bold — abaixo do
      // piso real de 12px): elevado para "label/tiny" (12px, peso 700/bold
      // — já é o peso "oficial" do token).
      await _applyFichaTypography(label, 'label/tiny');
      label.characters = asset.label || '';
      label.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
      textCol.appendChild(label);
      label.resizeWithoutConstraints(textColWidth, Math.max(1, Math.round(label.height)));

      if (asset.description) {
        const desc = figma.createText();
        desc.name = 'Descrição';
        // Bug real corrigido (2026-09-11) — ordem, ver comentário em
        // _appendFichaBlockTitle.
        desc.textAutoResize = 'HEIGHT';
        // Escala real (corrigido 2026-09-11, era 10px/Inter Regular —
        // abaixo do piso real de 12px, o mais distante de todos os pontos
        // corrigidos): elevado para "label/tiny" (12px), com
        // weightOverride=400 pra manter o peso visual Regular.
        await _applyFichaTypography(desc, 'label/tiny', 400);
        desc.characters = asset.description;
        desc.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
        textCol.appendChild(desc);
        desc.resizeWithoutConstraints(textColWidth, Math.max(1, Math.round(desc.height)));
      }
    }
  }

  return col;
}

// Legenda de Tabulação/Swipe (2026-09-14, pedido do usuário: "só instruções
// sobre o tipo de documentação", os passos numerados e a seção Assets saem
// da Ficha para estas duas funcionalidades — Leitor de Tela é diferente,
// continua com os 3 blocos completos via _buildFichaLegendColumn). Função
// PRÓPRIA em vez de um flag dentro de _buildFichaLegendColumn — Tabulação/
// Swipe e Leitor de Tela são funcionalidades distintas com necessidades de
// legenda diferentes, cada uma modularizada na sua função. O conteúdo de
// steps/assets permanece intacto em ficha-instruction-content.json (nada
// apagado da fonte), só não é mais desenhado por este caminho.
export async function _buildFichaInstructionOnlyLegendColumn(richContent, fallbackTitle, fallbackDescription) {
  const hasRichContent = !!(richContent && richContent.title);

  const col = figma.createFrame();
  col.name = 'Legenda';
  col.layoutMode = 'VERTICAL';
  col.itemSpacing = 8;
  col.paddingLeft = 12;
  col.paddingRight = 12;
  col.paddingTop = 12;
  col.paddingBottom = 12;
  col.cornerRadius = 8;
  // Mesma ordem resize→sizing modes de _buildFichaLegendColumn (bug real
  // corrigido em 2026-09-09, ver comentário completo lá).
  col.resizeWithoutConstraints(hasRichContent ? 260 : 220, 1);
  col.primaryAxisSizingMode = 'AUTO';
  col.counterAxisSizingMode = 'FIXED';
  col.fills = [{ type: 'SOLID', color: hexToRgb('#F5F5F5') }];

  const colInnerWidth = Math.max(1, Math.round(
    col.width - (col.paddingLeft || 0) - (col.paddingRight || 0)
  ));

  const titleText = figma.createText();
  titleText.name = 'Título';
  titleText.textAutoResize = 'HEIGHT';
  await _applyFichaTypography(titleText, 'label/small');
  titleText.characters = hasRichContent ? richContent.title : fallbackTitle;
  titleText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
  col.appendChild(titleText);
  titleText.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(titleText.height)));

  if (!hasRichContent) {
    const descText = figma.createText();
    descText.name = 'Descrição';
    descText.textAutoResize = 'HEIGHT';
    await _applyFichaTypography(descText, 'label/tiny', 400);
    descText.characters = fallbackDescription;
    descText.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    col.appendChild(descText);
    descText.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(descText.height)));
    return col;
  }

  if (richContent.instructionsHeading) {
    const heading = figma.createText();
    heading.name = 'Subtítulo';
    heading.textAutoResize = 'HEIGHT';
    await _applyFichaTypography(heading, 'label/tiny', 500);
    heading.characters = richContent.instructionsHeading;
    heading.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    col.appendChild(heading);
    heading.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(heading.height)));
  }

  if (richContent.instructionsBody) {
    const paragraph = figma.createText();
    paragraph.name = 'Parágrafo';
    paragraph.textAutoResize = 'HEIGHT';
    await _applyFichaTypography(paragraph, 'label/tiny', 400);
    paragraph.characters = richContent.instructionsBody;
    paragraph.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4 } }];
    col.appendChild(paragraph);
    paragraph.resizeWithoutConstraints(colInnerWidth, Math.max(1, Math.round(paragraph.height)));
  }

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

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0.5, g: 0.5, b: 0.5 };
}

/* global __HAC_VERSION__ */
export const PLUGIN_VERSION = (typeof __HAC_VERSION__ !== 'undefined') ? __HAC_VERSION__ : 'dev';

// ============================================================
// Scan enxuto de Detecção Automática (Área Marcada → candidatos de a11y) —
// EXTRAÍDO (2026-09-14) para backend/dsc-matching.js (_a11yScanArea, ver
// import abaixo), junto com o motor de matching DSC→a11y.
// ============================================================

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
export const HAC_DATA_LEGACY_KEY = 'hacData';

export function _getHacDataStorageKey() {
  return figma.fileKey ? `hacData:${figma.fileKey}` : null;
}

// ============================================================
// Dispatcher principal
// ============================================================

// EXTRAÍDO (2026-09-14, Camada 2 parte 1 da modularização do backend) para
// backend/onmessage.js — import por efeito colateral: o módulo, ao ser
// carregado, registra figma.ui.onmessage e figma.on('selectionchange', ...)
// (ver comentário completo no topo daquele arquivo).
import './backend/onmessage.js';
