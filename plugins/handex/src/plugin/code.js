import { auditProperty, AUDIT_SCORE, frameJsonTemplate } from './audit.js';
import { hdFlowDiagramLayout } from './shared/flow-diagram-layout.js';

figma.showUI(__html__, { width: 480, height: 750 });

// Rede de segurança contra [HighlightStroke] órfão: activeHighlightNode (ver
// abaixo) só existe em memória do processo do plugin -- se ele recarregar ou
// fechar de forma atípica (crash, dev reload) enquanto um highlight estava
// ativo, a referência se perde e o retângulo fica esquecido no canvas pra
// sempre, sem nada que o remova depois. Varre a página atual uma única vez
// no boot e remove qualquer sobra de sessões anteriores. Não é mais a
// principal defesa (focusNode parou de criar stroke, ver core.js) -- é só
// o backstop pro que já pode ter sobrado antes dessa mudança, ou de qualquer
// caso de borda futuro.
//
// Só filhos DIRETOS da página, nunca findAll: o stroke é sempre criado via
// figma.currentPage.appendChild (handler highlight-node), nunca aninhado --
// então a busca recursiva não alcançava nada a mais, e travava o arquivo
// inteiro na abertura do plugin (percorria todos os nós da página de forma
// síncrona, na mesma thread do documento; em telas reais com milhares de
// instâncias, segundos de congelamento). Achado real 2026-09-24.
try {
  figma.currentPage.children
    .filter(n => n.name === '[HighlightStroke]')
    .forEach(n => { try { n.remove(); } catch (e) {} });
} catch (e) {}

let activeHighlightNode = null;
// Skeleton das libs DSC. A UI anexa em `referenceTokens` na primeira mensagem
// da sessão que depende dele (ver _withRefSkeleton, core.js); aqui só guarda.
let _refSkeletonCache = null;
// Incrementado a cada chamada de highlight-node -- o handler é async
// (await getNodeByIdAsync) e o Figma não serializa mensagens, então focos
// em sucessão rápida (hover, cliques rápidos) podiam ter duas chamadas em
// voo ao mesmo tempo: a mais lenta sobrescrevia activeHighlightNode da mais
// rápida sem nunca a ter lido, deixando o [HighlightStroke] antigo órfão no
// canvas (nunca removido). Cada chamada guarda o token que tinha ao entrar
// e só escreve o resultado se ainda for o mais recente ao terminar o await.
let _highlightToken = 0;

figma.on('close', () => {
  if (activeHighlightNode) {
    try { activeHighlightNode.remove(); } catch (e) { }
    activeHighlightNode = null;
  }
});

figma.on('currentpagechange', () => {
  if (activeHighlightNode) {
    try { activeHighlightNode.remove(); } catch (e) { }
    activeHighlightNode = null;
  }
});

// Alimenta o mini-mapa de ancoragem do modal "Conectar Frames" (ver
// _getFlowSelectionBoundsPayload) em tempo real, a cada mudança de seleção
// no canvas enquanto o modal está aberto -- sem isso o mini-mapa só
// atualizaria ao reabrir o modal. Guardado por _flowAnchorPreviewActive
// (setado por track-flow-anchor-preview, enviado ao abrir/fechar o modal no
// frontend) para não gerar postMessage a cada seleção o tempo todo,
// independente da tela em que o usuário está no plugin.
let _flowAnchorPreviewActive = false;

// highlight-node seleciona o nó programaticamente (figma.currentPage.selection
// = [node]) para focar -- isso também dispara selectionchange, então sem essa
// flag o listener abaixo apagaria o próprio [HighlightStroke] que acabou de
// criar no mesmo ciclo. Marca "seleção esperada" só durante essa chamada;
// qualquer selectionchange fora dessa janela é o usuário trocando de
// seleção de verdade no canvas, e aí sim o highlight deve sumir.
let _highlightSelectionExpected = false;

// Rastreamento de ORDEM DE CLIQUE real do usuário -- a Plugin API não expõe
// isso nativamente (figma.currentPage.selection reflete ordem interna de
// camadas do documento, não ordem de interação). Reconstruído por diff
// incremental a cada selectionchange: compara a seleção anterior com a
// atual, e qualquer id que "entrou" nesta mudança específica é anexado ao
// histórico na ordem em que apareceu. Confiável quando cada mudança
// adiciona 1 elemento por vez (clique simples, shift+clique um a um) --
// se alguma mudança adicionar 2+ ids de uma vez (marquise/drag-select,
// Ctrl+A), não há como saber a ordem real entre eles, e todo o
// rastreamento da seleção atual fica marcado como não-confiável até a
// seleção esvaziar de novo (reinicia o rastreamento do zero).
let _prevSelectionIds = [];
let _selectionClickOrder = [];
let _selectionOrderReliable = true;

// Debounce do postMessage de flow-selection-bounds -- selectionchange
// dispara em rajada durante drag/marquise ou cliques rápidos no canvas, e
// sem isso cada disparo forçava o frontend a reconstruir o SVG inteiro do
// mini-mapa (innerHTML) a cada evento, travando a sensação de resposta da
// UI. O diff de ordem de clique acima continua síncrono (não pode perder
// eventos); só o envio pro frontend é coalescido.
let _flowSelectionBoundsDebounceTimer = null;

// Modo de captura do Spec Express (2026-09-25) -- liga/desliga via
// start-quick-spec-capture/stop-quick-spec-capture. Guarda só metadado leve
// (id/nome/tipo), nunca a extração pesada de propriedades -- essa só roda
// depois do "Concluir" (ver quick-spec-capture-finish).
//
// Modelo por SHIFT+CLIQUE (corrigido 2026-09-25 -- primeira versão
// acumulava qualquer elemento que passasse por selectionchange, mesmo sem
// Shift; isso incluía cliques de TRÂNSITO, como um drill-in que seleciona o
// frame pai antes de alcançar o filho desejado, capturando elementos que o
// designer nunca teve intenção de escanear). Com Shift pressionado, a
// própria API do Figma já acumula a seleção real em
// figma.currentPage.selection -- mas essa lista vem na ordem de
// z-index/árvore de camadas, não na ordem cronológica de clique (corrigido
// 2026-09-28: a lista final estava embaralhada em relação à sequência real
// do designer). Por isso _quickSpecCaptureSelection é mantido como
// HISTÓRICO por ordem de entrada, não um espelho bruto do array do Figma: a
// cada selectionchange, remove quem saiu da seleção e só ACRESCENTA no
// final quem entrou e ainda não estava presente -- se um elemento for
// desmarcado e remarcado depois, ele volta pro final, o que é o
// comportamento esperado (reflete a nova ordem de entrada).
let _quickSpecCaptureModeActive = false;
let _quickSpecCaptureSelection = []; // [{nodeId, name, nodeType}] -- histórico por ordem de entrada, não espelho bruto da seleção
let _quickSpecCaptureCountDebounceTimer = null;

// Ordem real de clique da seleção, mantida SEMPRE (não só na captura): a
// lista figma.currentPage.selection não garante a ordem em que o designer
// clicou. Usada para semear a captura das Anotações com o que já estava
// selecionado, na ordem dos cliques (2026-10-05: A = 1º clique, B = 2º...).
let _hdSelectionOrder = [];

figma.on('selectionchange', () => {
  const currentIds = figma.currentPage.selection.map(n => n.id);
  {
    const cur = new Set(currentIds);
    _hdSelectionOrder = _hdSelectionOrder.filter(id => cur.has(id));
    const known = new Set(_hdSelectionOrder);
    currentIds.forEach(id => { if (!known.has(id)) _hdSelectionOrder.push(id); });
  }

  if (_quickSpecCaptureModeActive) {
    const currentIdSet = new Set(currentIds);
    _quickSpecCaptureSelection = _quickSpecCaptureSelection.filter(item => currentIdSet.has(item.nodeId));
    const knownIds = new Set(_quickSpecCaptureSelection.map(item => item.nodeId));
    for (const n of figma.currentPage.selection) {
      if (knownIds.has(n.id)) continue;
      _quickSpecCaptureSelection.push({ nodeId: n.id, name: n.name, nodeType: n.type });
    }
    clearTimeout(_quickSpecCaptureCountDebounceTimer);
    _quickSpecCaptureCountDebounceTimer = setTimeout(() => {
      figma.ui.postMessage({ type: 'quick-spec-capture-count-changed', count: _quickSpecCaptureSelection.length });
    }, 300);
  }

  if (currentIds.length === 0) {
    _selectionClickOrder = [];
    _selectionOrderReliable = true;
  } else {
    const currentSet = new Set(currentIds);
    const prevSet = new Set(_prevSelectionIds);
    const entered = currentIds.filter(id => !prevSet.has(id));
    const left = _prevSelectionIds.filter(id => !currentSet.has(id));
    if (entered.length > 1) _selectionOrderReliable = false;
    _selectionClickOrder = _selectionClickOrder.filter(id => !left.includes(id));
    _selectionClickOrder.push(...entered);
  }
  _prevSelectionIds = currentIds;

  if (_flowAnchorPreviewActive) {
    clearTimeout(_flowSelectionBoundsDebounceTimer);
    _flowSelectionBoundsDebounceTimer = setTimeout(() => {
      figma.ui.postMessage({ type: 'flow-selection-bounds', nodes: _getFlowSelectionBoundsPayload() });
    }, 120);
  }
  if (_highlightSelectionExpected) {
    _highlightSelectionExpected = false;
    return;
  }
  if (activeHighlightNode) {
    try { activeHighlightNode.remove(); } catch (e) { }
    activeHighlightNode = null;
  }
});

// Resolve a ordem real da cadeia: usa a ordem de clique rastreada quando ela
// cobre TODOS os elementos da seleção atual e não foi contaminada por uma
// entrada em lote; senão cai no fallback espacial (_orderNodesSpatially) --
// mesma garantia para 2 elementos (decide o lado A/B) e para cadeias de 3+
// (decide a sequência A→B→C). Usada tanto pela criação real quanto pelo
// mini-mapa de prévia, para as duas pontas nunca divergirem.
function _resolveChainOrder(nodes) {
  const selectionIds = new Set(nodes.map(n => n.id));
  const trackedIds = _selectionClickOrder.filter(id => selectionIds.has(id));
  const coversAll = _selectionOrderReliable && trackedIds.length === nodes.length;
  if (!coversAll) return _orderNodesSpatially(nodes);
  const byId = new Map(nodes.map(n => [n.id, n]));
  return trackedIds.map(id => byId.get(id));
}

function _nodeOnCurrentPage(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n != null && n.id === figma.currentPage.id;
}

// Ordem espacial (esquerda→direita, empate por cima→baixo) -- FALLBACK usado
// por _resolveChainOrder quando a ordem real de clique não está disponível
// ou não é confiável (seleção em lote/marquise). Não usar diretamente para
// decidir a cadeia; ver _resolveChainOrder acima.
function _orderNodesSpatially(nodes) {
  return [...nodes].sort((a, b) => {
    const ba = a.absoluteBoundingBox || a.absoluteRenderBounds;
    const bb = b.absoluteBoundingBox || b.absoluteRenderBounds;
    if (!ba || !bb) return 0;
    if (Math.abs(ba.x - bb.x) > 1) return ba.x - bb.x;
    return ba.y - bb.y;
  });
}

// Teto de 12 -- segurança contra o usuário selecionar dezenas de elementos
// por engano e o mini-mapa/backend tentarem processar uma cadeia gigante.
const FLOW_CHAIN_MAX = 12;

function _getFlowSelectionBoundsPayload() {
  const ordered = _resolveChainOrder(figma.currentPage.selection).slice(0, FLOW_CHAIN_MAX);
  return ordered.map(n => {
    const b = n.absoluteBoundingBox || n.absoluteRenderBounds;
    if (!b) return null;
    return { id: n.id, name: n.name, x: b.x, y: b.y, width: b.width, height: b.height };
  }).filter(Boolean);
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

// Reordena o specGroup recém-criado entre os demais grupos de spec para que
// a profundidade (z-order) siga a ordem hierárquica das tags, não a ordem de
// criação. Não afeta X/Y — só o índice na lista de filhos do container.
// Container = specGroup.parent (a Section "Handex | Specs" desde 2026-09-11,
// quando specs passaram a viver lá em vez de soltas em figma.currentPage
// diretamente — ver _hdMoveToCategorySection). Sem essa correção, os
// siblings/índices seriam buscados na página, mas os specGroups já não são
// mais filhos diretos dela, quebrando a comparação por completo.
function _reorderSpecGroupByTag(specGroup, tag) {
  const container = specGroup.parent;
  if (!container || !('children' in container)) return;
  // handexCategory cobre specs novas (FRAME/GROUP); prefixo de nome cobre
  // specs legadas criadas antes dessa marcação existir.
  const siblings = container.children.filter(n =>
    n !== specGroup && (n.getPluginData('handexCategory') === 'spec' || n.name.startsWith('[Spec')));
  // Fallback = ficar no topo (equivalente ao appendChild padrão), não a contagem de
  // grupos — misturar essa contagem com índices reais de children (abaixo) empurraria
  // a spec para trás de conteúdo não-spec do container quando não há tag posterior.
  let insertIndex = container.children.length;
  for (let i = 0; i < siblings.length; i++) {
    const m = siblings[i].name.match(/^\[Spec \| ([A-Z]\d*(?:\.\d+)*) \| [a-z]+\] /);
    if (!m) continue;
    if (_compareSpecTags(tag, m[1]) < 0) {
      const idx = container.children.indexOf(siblings[i]);
      insertIndex = Math.min(insertIndex, idx);
    }
  }
  container.insertChild(insertIndex, specGroup);
}


function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0.3922, g: 0.4549, b: 0.4784 };
}

// ─── Organização por categoria (Sections) ─────────────────────────────────
// Medidas, specs e fluxos criados pelo Handex ficavam soltos direto em
// figma.currentPage -- identificados só por pluginData (handexCategory),
// invisível na árvore de camadas normal do Figma (achado real, 2026-09-11).
// SECTION do Figma foi escolhida em vez de GROUP/FRAME porque, testado no
// próprio arquivo do usuário, ela NÃO recalcula a posição dos filhos como
// relativa ao container (diferente de group()/frame.appendChild(), que
// sempre fazem isso) -- move um nó existente pra dentro sem alterar sua
// posição visual/absoluta na página. Isso é essencial aqui: uma medida ou
// conector de fluxo precisa continuar ancorado exatamente no lugar do
// elemento real que anota, nunca reposicionado por entrar num container.
// _hdEnsureCategorySection busca a Section já existente na página (por
// nome fixo) e reaproveita; só cria uma nova na primeira vez que aquela
// categoria aparece. Nunca redimensiona a Section pra "abraçar" os filhos
// automaticamente -- ela só existe pra dar um agrupamento visível na árvore
// de camadas, o layout dos itens dentro continua exatamente como já era.
const HANDEX_SECTION_NAMES = { medida: 'Handex | Medidas', spec: 'Handex | Fluxos e Jornadas', fluxo: 'Handex | Conexões', ficha: 'Handex | Ficha', quickspec: 'Handex | Detalhar UI' };
function _hdEnsureCategorySection(category) {
  const sectionName = HANDEX_SECTION_NAMES[category];
  if (!sectionName) return null;
  // children (filhos diretos da página, não recursivo) em vez de findOne
  // (que percorre a árvore inteira) -- a Section sempre fica como filho
  // direto de currentPage, nunca aninhada, então não há necessidade de
  // busca recursiva aqui. Relevante porque essa checagem roda a cada
  // medida/spec/fluxo criado -- em páginas densas isso evita custo O(n) do
  // total de nós da página a cada criação (ver nota de performance
  // discutida nesta mesma sessão sobre documentações densas).
  const existing = figma.currentPage.children.find(n => n.type === 'SECTION' && n.getPluginData('handexCategorySection') === category);
  if (existing) {
    // Nomes de Section mudaram (2026-10-05 e 2026-10-08: Detalhar UI / Fluxos e Jornadas / Conexões);
    // a busca é por pluginData, então só atualiza o rótulo visível.
    if (existing.name !== sectionName) { try { existing.name = sectionName; } catch (e) {} }
    return existing;
  }
  const section = figma.createSection();
  section.name = sectionName;
  section.setPluginData('handexCategorySection', category);
  // Tamanho mínimo só pra Section existir de forma visível/selecionável antes
  // do primeiro filho entrar -- ela nunca é redimensionada depois pra ajustar
  // aos filhos (ver nota acima: não queremos nenhum recálculo de layout).
  try { section.resizeWithoutConstraints(100, 100); } catch (e) {}
  section.fills = [];
  figma.currentPage.appendChild(section);
  return section;
}
// Z-order no Figma = ordem dos filhos no pai. Uma Section criada na 1ª spec
// ficava ABAIXO de frames que o usuário criou/duplicou depois, escondendo
// contornos e marcadores atrás da tela. Traz ao topo da página (só filhos
// diretos, sem findAll) as Sections de anotação sobre telas e marcadores
// legados soltos; a Ficha não entra. appendChild no próprio pai só reordena
// e não altera x/y. Só mexe quando já não estão no topo.
const HANDEX_TOP_SECTION_CATEGORIES = ['spec', 'quickspec', 'medida', 'fluxo'];
function _hdBringAnnotationLayersToFront() {
  const kids = figma.currentPage.children;
  const isTop = n =>
    (n.type === 'SECTION' && HANDEX_TOP_SECTION_CATEGORIES.indexOf(n.getPluginData('handexCategorySection')) !== -1) ||
    (n.type !== 'SECTION' && !!n.getPluginData('handexSpecMarkerFor'));
  const tops = kids.filter(isTop);
  if (!tops.length) return;
  const firstTopIdx = kids.indexOf(tops[0]);
  const needs = kids.slice(firstTopIdx).some(n => !isTop(n));
  if (!needs) return;
  for (const n of tops) {
    if (n.type === 'SECTION' && n.fills && n.fills.length) { try { n.fills = []; } catch (e) {} }
    try { figma.currentPage.appendChild(n); } catch (e) {}
  }
}
// Move um nó (já criado e posicionado normalmente) pra dentro da Section da
// sua categoria, preservando x/y absolutos -- chamar DEPOIS que o nó já
// está com handexCategory setado e na posição final desejada.
function _hdMoveToCategorySection(node, category) {
  const section = _hdEnsureCategorySection(category);
  if (section) {
    try { section.appendChild(node); } catch (e) {}
    if (category !== 'ficha') _hdBringAnnotationLayersToFront();
  }
}

// ─── Helpers de montagem da ficha de handoff ──────────────────────────────
// Extraídos do escopo de create-handoff/insert-frame-in-ficha/
// insert-flows-in-ficha (onde existiam como 3 cópias quase idênticas) para
// que os 3 handlers montem os mesmos cards a partir da mesma fonte -- sem
// isso, criar a ficha do zero e atualizar uma ficha existente podiam
// divergir silenciosamente conforme um dos 3 fosse editado sem replicar a
// mudança nos outros dois.
// Padrão CAIXA na Ficha inteira: só vale DURANTE a geração/atualização da Ficha
// (_hdFichaGen, ligado em create-handoff/insert-ficha-section) e com fontes já
// resolvidas por _hdFicheFonts(). Fora disso (ex: card de Anotação, que
// também usa _hdCreateText) o texto continua em Inter, como sempre foi.
let _hdFichaGen = false;
function _hdStyled() { return FICHA_DSC_STYLE_ENABLED && _hdFichaGen && !!_hdFichaFontsCache; }
function _hdS(oldVal, styledVal) { return _hdStyled() ? styledVal : oldVal; }
// Zera o cache de fontes e resolve de novo no início de CADA geração/atualização
// da Ficha (create-handoff, insert-ficha-section); o fim desliga _hdFichaGen (finally).
async function _hdBeginFichaStyle() {
  _hdFichaFontsCache = null;
  _hdFichaGen = false;
  if (!FICHA_DSC_STYLE_ENABLED) return;
  await _hdFicheFonts();
  _hdFichaGen = true;
}
function _hdRemapColor(c) {
  if (c && Math.abs(c.r - 0.3922) < 0.002 && Math.abs(c.g - 0.4549) < 0.002 && Math.abs(c.b - 0.4784) < 0.002) return hexToRgb(_DS.text2);
  return c;
}
function _hdCreateText(text, size = 14, weight = "Regular", color = { r: 0.1333, g: 0.1608, b: 0.1804 }, opts) {
  const t = figma.createText();
  if (_hdStyled()) {
    const o = opts || {};
    const f = _hdFichaFontsCache;
    if (o.mono) {
      t.fontName = { family: f.code.family, style: weight === "Regular" ? f.code.regular : f.code.medium };
    } else {
      t.fontName = { family: f.text.family, style: f.text[o.w || (weight === "Regular" ? "regular" : "semibold")] };
    }
    t.characters = String(text || "");
    const sz = Math.max(size, 11);
    t.fontSize = sz;
    t.lineHeight = { unit: "PIXELS", value: Math.round(sz * 1.5) };
    t.fills = [{ type: "SOLID", color: _hdRemapColor(color) }];
    return t;
  }
  t.fontName = { family: "Inter", style: weight };
  t.characters = String(text || "");
  t.fontSize = size;
  t.fills = [{ type: "SOLID", color }];
  return t;
}
// Tag/selo no padrão do chip da referência (raio 4, borda 1px). Só no padrão CAIXA.
function _hdTag(text, o) {
  const tag = _hdCreateFrame("HORIZONTAL", 0, 0, hexToRgb(o.bg));
  tag.paddingTop = 3; tag.paddingBottom = 3; tag.paddingLeft = 8; tag.paddingRight = 8;
  tag.cornerRadius = 4;
  tag.counterAxisAlignItems = "CENTER";
  if (o.border) { tag.strokes = [{ type: "SOLID", color: hexToRgb(o.border) }]; tag.strokeWeight = 1; }
  tag.appendChild(_hdCreateText(text, o.size || 12, "Bold", hexToRgb(o.color)));
  return tag;
}

// Bloco de Documentação Visual (por frame / avulsas): painel da referência no
// padrão CAIXA (fundo #ebf1f2, borda #9eb2b8, raio 8); visual antigo se desligado.
function _hdStyleDocBlock(block) {
  if (_hdStyled()) {
    block.fills = [{ type: "SOLID", color: hexToRgb(_DS.gray) }];
    block.cornerRadius = 8;
    block.strokes = [{ type: "SOLID", color: hexToRgb(_DS.panelBorder) }];
  } else {
    block.cornerRadius = 12;
    block.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
  }
  block.strokeWeight = 1;
}
function _hdStylePreviewRect(rect) {
  if (!_hdStyled()) return;
  rect.strokes = [{ type: "SOLID", color: hexToRgb(_DS.panelBorder) }];
  rect.strokeWeight = 1;
}

// Tag "Preview" da referência (fundo claro, raio 8), usada como rótulo de imagem.
function _hdPreviewTag(text, fillHex) {
  const tag = _hdCreateFrame("HORIZONTAL", 0, 0, hexToRgb(fillHex || _DS.gray));
  tag.paddingTop = 6; tag.paddingBottom = 6; tag.paddingLeft = 12; tag.paddingRight = 12;
  tag.cornerRadius = 8;
  tag.counterAxisAlignItems = "CENTER";
  tag.name = "Tag Preview";
  tag.appendChild(_hdCreateText(text, 14, "Bold", hexToRgb(_DS.text)));
  return tag;
}

// Tabela no padrão da referência: cabeçalho #ebf1f2, células brancas, borda
// #d0e0e3 (só a linha inferior por célula), raio 8. cols: [{ title, w }] (w
// ausente = ocupa o restante). rows: array de células ou { cells, pd }; célula =
// string | { text, w, color, mono, link: HyperlinkTarget } | nó (TEXT/FRAME). Largura total = a do pai.
function _hdCell(spec) {
  if (spec == null) return _dsText("—", { size: 13, lh: 20, color: _DS.text2 });
  if (typeof spec === "string" || typeof spec === "number") return _dsText(String(spec), { size: 13, lh: 20 });
  if (spec.text === undefined) return spec;
  const t = _dsText(spec.text, { size: spec.size || 13, lh: spec.lh || 20, w: spec.w, color: spec.color, mono: spec.mono });
  if (spec.link) {
    try { t.hyperlink = spec.link; t.textDecoration = "UNDERLINE"; } catch (e) {}
  }
  return t;
}
function _hdDsTable(parent, name, cols, rows) {
  const table = _dsFrame(`[DSC] Tabela ${name}`, "VERTICAL", { fill: _DS.white, stroke: _DS.tableBorder, radius: 8, clip: true });
  _dsAdd(parent, table, true);
  const mkRow = (cells, header, pd) => {
    const row = _dsFrame(header ? "Cabeçalho" : "Linha", "HORIZONTAL", {});
    _dsAdd(table, row, true);
    if (pd) Object.keys(pd).forEach(k => { try { row.setPluginData(k, String(pd[k])); } catch (e) {} });
    cells.forEach((spec, ci) => {
      const c = header ? _dsText(spec, { w: "semibold", size: 13, lh: 20 }) : _hdCell(spec);
      const cell = _dsFrame("Célula", "VERTICAL", { pt: header ? 10 : 8, pb: header ? 10 : 8, pl: 12, pr: 12, fill: header ? _DS.gray : _DS.white, stroke: _DS.tableBorder });
      try { cell.strokeTopWeight = 0; cell.strokeLeftWeight = 0; cell.strokeRightWeight = 0; cell.strokeBottomWeight = 1; } catch (e) {}
      row.appendChild(cell);
      const w = cols[ci] && cols[ci].w;
      if (w) { cell.resize(w, 10); cell.counterAxisSizingMode = "FIXED"; cell.primaryAxisSizingMode = "AUTO"; }
      else { try { cell.layoutGrow = 1; } catch (e) {} }
      try { cell.layoutAlign = "STRETCH"; } catch (e) {}
      cell.appendChild(c);
      if (c.type === "TEXT") _dsFillW(c);
      cell.primaryAxisAlignItems = "CENTER";
    });
    // Todas as células da linha com a altura da mais alta (ex.: chip de papel
    // mais alto que o texto), para a borda inferior ficar contínua.
    row.children.forEach(cell => { try { cell.layoutSizingVertical = "FILL"; } catch (e) {} });
  };
  mkRow(cols.map(c => c.title), true, null);
  rows.forEach(r => (Array.isArray(r) ? mkRow(r, false, null) : mkRow(r.cells, false, r.pd)));
  return table;
}

function _hdCreateFrame(direction = "VERTICAL", padding = 0, spacing = 0, fill = null) {
  const f = figma.createFrame();
  f.layoutMode = direction;
  f.paddingLeft = padding; f.paddingRight = padding;
  f.paddingTop = padding; f.paddingBottom = padding;
  f.itemSpacing = spacing;
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = "AUTO";
  f.layoutAlign = "INHERIT";
  f.fills = fill ? [{ type: "SOLID", color: fill }] : [];
  return f;
}
function _hdSetFillAndHug(node) {
  if (!node) return;
  try {
    if ('layoutSizingHorizontal' in node) node.layoutSizingHorizontal = "FILL";
    if ('layoutSizingVertical' in node) node.layoutSizingVertical = "HUG";
  } catch (e) {}
  const parent = node.parent;
  const pMode = (parent && 'layoutMode' in parent) ? parent.layoutMode : "VERTICAL";
  if (pMode === "VERTICAL") {
    node.layoutAlign = "STRETCH";
    if (node.type === "FRAME") {
      if (node.layoutMode === "VERTICAL") node.primaryAxisSizingMode = "AUTO";
      else node.counterAxisSizingMode = "AUTO";
    } else if (node.type === "TEXT") node.textAutoResize = "HEIGHT";
  } else if (pMode === "HORIZONTAL") {
    node.layoutGrow = 1;
    node.layoutAlign = "INHERIT";
    if (node.type === "FRAME") {
      if (node.layoutMode === "HORIZONTAL") node.counterAxisSizingMode = "AUTO";
      else node.primaryAxisSizingMode = "AUTO";
    } else if (node.type === "TEXT") node.textAutoResize = "HEIGHT";
  }
}
function _hdCreateSection(parent, titleText) {
  const section = _hdCreateFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
  section.name = `[Seção] ${titleText}`;
  parent.appendChild(section);
  _hdSetFillAndHug(section);
  section.cornerRadius = 8;
  section.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
  section.strokeWeight = 1;
  const title = _hdCreateText(titleText, _hdS(16, 22), "Bold", hexToRgb("#005ca9"));
  section.appendChild(title);
  _hdSetFillAndHug(title);
  return section;
}
function _hdCreateRow(parent, label, value) {
  const row = _hdCreateFrame("VERTICAL", 0, 4);
  row.name = `[Campo] ${label}`;
  parent.appendChild(row);
  _hdSetFillAndHug(row);
  const lbl = _hdCreateText(label, 12, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 });
  row.appendChild(lbl);
  _hdSetFillAndHug(lbl);
  const val = _hdCreateText(value || "-", 14, "Regular", { r: 0.1333, g: 0.1608, b: 0.1804 });
  row.appendChild(val);
  _hdSetFillAndHug(val);
  return row;
}

// Resumo do frame para o DEV na seção "Frames Escaneados" (2026-10-05, pedido
// do Augusto): o que importar pronto da lib e o que construir. Só nomes --
// sem percentual nem status de conformidade (controle do designer, não ação
// do dev; "necessita revisão"/"fora do padrão" não vão para a Ficha, decisão
// de 2026-09-16). Reutilizar = componentes/ícones com vínculo PRÓPRIO a uma
// lib do DSC (não subpartes herdadas por ancestral, não personalizados sem
// vínculo, não os marcados "Vai para a Ficha"), agrupados por lib e por nome
// (×N quando repete), até HD_FRAME_REUSE_MAX nomes. Construir = itens
// marcados "Vai para a Ficha", com remissão ao card em User Interface.
const HD_FRAME_REUSE_MAX = 12;
// Só componentes e frames/layouts são "construídos" pelo dev (2026-10-05,
// decisão do Augusto): ícone se importa ou exporta como asset, texto é parte
// do componente/layout. "Vai para a Ficha" marcado em ícone/tipografia/vetor
// (dado antigo) fica salvo, mas é ignorado em toda a Ficha.
const HD_BUILDABLE_CATS = ['components', 'frames'];
// Instância do DSC com vínculo próprio e sem nenhuma personalização avaliada:
// não há o que construir, mesmo marcada (vai para "Reutilizar da lib").
function _hdIsUnalteredDsc(it) {
  return !!(it && it.matchedIn && it.matchedBy !== 'ancestor-key' && !it.isCustomComponent && it.customizationsStatus === 'evaluated' && Array.isArray(it.customizations) && it.customizations.length === 0);
}
function _hdIsBuildItem(it, cat) { return !!(it && it.isMarkedCustom === true && HD_BUILDABLE_CATS.includes(cat) && !_hdIsUnalteredDsc(it)); }
function _hdFrameDevSummary(f) {
  const specs = f.specs || {};
  const byLib = new Map();
  let total = 0;
  for (const cat of ['components', 'icons']) {
    for (const it of specs[cat] || []) {
      if (!it || _hdIsBuildItem(it, cat) || it.isCustomComponent || !it.matchedIn || it.matchedBy === 'ancestor-key') continue;
      const lib = String(it.matchedIn);
      if (!byLib.has(lib)) byLib.set(lib, new Map());
      const names = byLib.get(lib);
      const key = it.name || 'Componente';
      const prev = names.get(key) || { n: 0, custom: false };
      prev.n += Math.max(1, Array.isArray(it.nodeIds) ? it.nodeIds.length : 1);
      prev.custom = prev.custom || (Array.isArray(it.customizations) && it.customizations.length > 0);
      names.set(key, prev);
    }
  }
  const parts = [];
  let shown = 0;
  for (const [lib, names] of byLib) {
    const list = [];
    for (const [name, v] of names) {
      total++;
      if (shown >= HD_FRAME_REUSE_MAX) continue;
      shown++;
      list.push(`${name}${v.n > 1 ? ' ×' + v.n : ''}${v.custom ? ' (personalizado)' : ''}`);
    }
    if (list.length) parts.push(`${lib}: ${list.join(', ')}`);
  }
  let reuse = parts.join('\n');
  if (total > shown) reuse += `\n+${total - shown} outro(s) componente(s) da lib`;
  const build = [];
  for (const cat of HD_BUILDABLE_CATS) {
    for (const it of specs[cat] || []) {
      if (_hdIsBuildItem(it, cat)) build.push(`${it.name || 'Elemento'} → ver User Interface`);
    }
  }
  // Ícones soltos no frame (não os de dentro de um componente do DSC, que
  // vêm junto com o componente): o dev só precisa saber quais importar.
  const icons = [...new Set((specs.icons || []).filter(it => it && it.matchedBy !== 'ancestor-key').map(it => it.name).filter(Boolean))];
  // Fora do padrão (isDS false) e precisa de revisão (isDS "warning"), com o
  // motivo. Só nomes; até HD_FRAME_REUSE_MAX por lista.
  const outList = [], reviewList = [];
  const _catPt = { components: 'Componente', icons: 'Ícone', typography: 'Tipografia', vectors: 'Vetor' };
  ['components', 'icons', 'typography', 'vectors'].forEach(cat => (specs[cat] || []).forEach(it => {
    if (!it) return;
    const nm = `${it.name || 'Elemento'} (${_catPt[cat]})`;
    if (it.isDS === false) outList.push(nm);
    else if (it.isDS === 'warning') {
      const why = it.isCustomComponent ? 'sem vínculo com a lib'
        : (Array.isArray(it.customizations) && it.customizations.length) ? 'personalizado em relação à lib'
        : it.matchedBy === 'remote-unverified' ? 'token de lib fora do DSC cadastrado'
        : 'revisar';
      reviewList.push(`${nm}: ${why}`);
    }
  }));
  const cap = (arr) => arr.length > HD_FRAME_REUSE_MAX ? arr.slice(0, HD_FRAME_REUSE_MAX).concat([`+${arr.length - HD_FRAME_REUSE_MAX} outro(s)`]) : arr;
  return {
    reuse: reuse || null, build: build.length ? build.join('\n') : null, icons: icons.length ? icons.join(', ') : null,
    out: outList.length ? cap(outList).join('\n') : null, review: reviewList.length ? cap(reviewList).join('\n') : null
  };
}

// Status de revisão do frame na Ficha -- espelho de _getFrameStatusKey
// (core.js), mesma regra e mesmos rótulos.
function _hdFrameReviewStatus(f) {
  const a = f.audit || {};
  if (f.isNewComponent) return { label: 'Novo componente', reviewed: !!a.checkDone };
  if (!a.checkDone) return { label: 'Pendente de revisão', reviewed: false };
  const hasOut = ['components', 'icons', 'typography', 'vectors'].some(c => ((f.specs || {})[c] || []).some(it => it && it.isDS === false));
  const just = !!(a.observacoes && String(a.observacoes).trim());
  if (hasOut && just) return { label: 'Desvio justificado', reviewed: true };
  if (hasOut) return { label: 'Não conforme', reviewed: true };
  if (a.semDesvios) return { label: 'Conforme', reviewed: true };
  return { label: 'Não conforme', reviewed: true };
}

// Card de "Frame Documentado" (nome, badge "Novo componente", auditoria DSC).
// Os snapshots visuais de specs/medidas migraram para a seção
// "Documentação Visual" (ver _hdBuildFrameShowcaseBlock/
// _hdRebuildDocumentacaoVisualSection) -- este card volta a ser só
// identificação básica do frame, mais o resumo para o dev (Reutilizar da
// lib / Construir, ver _hdFrameDevSummary).
// handexFrameId identifica o card entre gerações para permitir substituir em
// vez de duplicar quando a ficha já existe.
async function _hdBuildFrameCard(f, fi) {
  const _st = _hdStyled();
  const fRow = _hdCreateFrame("VERTICAL", _st ? 16 : 12, _st ? 12 : 8, _st ? hexToRgb(_DS.white) : { r: 0.9686, g: 0.9804, b: 0.9804 });
  fRow.name = `[Frame] ${f.nome || 'Frame ' + (fi + 1)}`;
  fRow.cornerRadius = 8;
  fRow.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
  fRow.setPluginData('handexFrameId', f.figmaId || f.id || '');
  const fHeader = _hdCreateFrame("HORIZONTAL", 0, 8);
  fHeader.counterAxisAlignItems = "CENTER";
  const fName = _hdCreateText(f.nome || 'Frame', _hdS(12, 18), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
  fName.layoutGrow = 1;
  fHeader.appendChild(fName);
  if (f.isNewComponent) {
    if (_st) {
      fHeader.appendChild(_hdTag("Novo componente", { bg: _DS.numBg, border: _DS.numBorder, color: _DS.text }));
    } else {
      const badge = _hdCreateFrame("HORIZONTAL", 8, 3, { r: 1, g: 0.937, b: 0.839 });
      badge.cornerRadius = 999;
      badge.strokes = [{ type: "SOLID", color: { r: 0.992, g: 0.710, b: 0.282 } }];
      badge.strokeWeight = 1;
      badge.appendChild(_hdCreateText("Novo componente", 9, "Medium", { r: 0.4, g: 0.2275, b: 0 }));
      fHeader.appendChild(badge);
    }
  }
  fRow.appendChild(fHeader);
  _hdSetFillAndHug(fHeader);
  // Revisão do frame (2026-10-08): status, check de revisado e quem declarou.
  {
    const st = _hdFrameReviewStatus(f);
    const a = f.audit || {};
    const who = a.declaradoPor ? ` · declarado por ${a.declaradoPor}` : '';
    const when = a.declaradoEm ? ` em ${new Date(a.declaradoEm).toLocaleDateString('pt-BR')}` : '';
    _hdCreateRow(fRow, "Revisão DSC", `${st.reviewed ? '✓ Revisado' : 'Não revisado'} · ${st.label}${st.reviewed ? who + when : ''}`);
  }
  // Resumo para o dev (2026-10-05): o que reutilizar da lib, quais ícones
  // importar e o que construir. Em Novo Componente, o próprio frame é o item a
  // construir (card dele em User Interface, com anatomia e interações); a
  // antiga tabela com todas as camadas (nomes de texto, partes internas de
  // componentes do DSC) saiu por não dar ao dev nada acionável.
  const _sum = _hdFrameDevSummary(f);
  if (f.isNewComponent && f.newComponentObservations) {
    _hdCreateRow(fRow, "Padrão de uso, nomenclatura e diretrizes", f.newComponentObservations);
  }
  // Separação explícita (2026-10-07, pedido do Augusto): o que foi escaneado
  // e já está pronto/refinado na lib × o que precisa ser construído.
  const _ready = [];
  if (_sum.reuse) _ready.push(_sum.reuse);
  if (_sum.icons) _ready.push(`Ícones: ${_sum.icons}`);
  _hdCreateRow(fRow, "Reaproveitado do DSC", _ready.length ? _ready.join('\n') : "Nenhum componente da lib identificado.");
  if (_sum.out) _hdCreateRow(fRow, "Fora do padrão", _sum.out);
  if (_sum.review) _hdCreateRow(fRow, "Precisa de revisão", _sum.review);
  if (f.audit && f.audit.observacoes && String(f.audit.observacoes).trim()) _hdCreateRow(fRow, "Justificativa do designer", String(f.audit.observacoes).trim());
  const _build = [];
  if (f.isNewComponent) _build.push(`${f.nome || 'Frame'} (novo componente) → ver User Interface`);
  if (_sum.build) _build.push(_sum.build);
  _hdCreateRow(fRow, "Escaneados que precisam ser construídos", _build.length ? _build.join('\n') : "Nenhum item marcado como \"Vai para a Ficha\".");

  return fRow;
}

// Gera um PNG (bytes) do frame + nós auxiliares vinculados (specs ou
// medidas) a partir de CÓPIAS num frame temporário -- os nós originais nunca
// são movidos, agrupados nem reordenados. Tolera nós ausentes
// (getNodeByIdAsync -> null) pulando o item, nunca lança.
async function _hdSnapshotFrameWithNodes(frameNode, extraNodeIds, info) {
  if (!frameNode || !('exportAsync' in frameNode)) return null;

  const extraNodes = [];
  for (const id of (extraNodeIds || [])) {
    if (!id) continue;
    let n = null;
    try { n = await figma.getNodeByIdAsync(id); } catch (e) { n = null; }
    if (n) extraNodes.push(n);
  }

  if (extraNodes.length === 0) {
    // Nada para compor: exporta só o frame, sem tocar em parentesco.
    if (info) info.bounds = frameNode.absoluteRenderBounds || frameNode.absoluteBoundingBox;
    try {
      return await frameNode.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
    } catch (e) {
      return null;
    }
  }

  // NUNCA mexe nos nós originais (2026-10-05, bug grave: a versão anterior
  // agrupava o FRAME REAL do designer com as marcações num group temporário e
  // depois tentava devolvê-lo ao lugar; quando uma marcação vinculada já não
  // existia, a devolução falhava e o frame era apagado junto com o group).
  // Agora monta CÓPIAS num frame temporário fora de tudo, exporta e apaga só
  // o temporário. O original não muda de pai, posição nem índice.
  const allNodes = [frameNode, ...extraNodes].filter(n => n && !n.removed);
  const boxOf = n => n.absoluteRenderBounds || n.absoluteBoundingBox;
  const boxes = allNodes.map(boxOf).filter(Boolean);
  if (boxes.length === 0) return null;
  const ux = Math.min(...boxes.map(b => b.x)), uy = Math.min(...boxes.map(b => b.y));
  const ur = Math.max(...boxes.map(b => b.x + b.width)), ub = Math.max(...boxes.map(b => b.y + b.height));
  if (info) info.bounds = { x: ux, y: uy, width: ur - ux, height: ub - uy };

  let temp = null;
  let bytes = null;
  try {
    temp = figma.createFrame();
    temp.name = "[Handex] snapshot temporário";
    temp.fills = [];
    temp.clipsContent = true;
    figma.currentPage.appendChild(temp);
    temp.resize(Math.max(1, ur - ux), Math.max(1, ub - uy));
    temp.x = ux; temp.y = uy;
    for (const n of allNodes) {
      const bb = n.absoluteBoundingBox || boxOf(n);
      if (!bb) continue;
      let c = null;
      try { c = n.clone(); } catch (e) { c = null; }
      if (!c) continue;
      temp.appendChild(c);
      try { c.locked = false; } catch (e) {}
      c.x = bb.x - ux; c.y = bb.y - uy;
    }
    bytes = await temp.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
  } catch (e) {
    console.error('[Handex Ficha] snapshot falhou:', String(e && e.message || e));
    bytes = null;
  } finally {
    try { if (temp && !temp.removed) temp.remove(); } catch (e) {}
  }
  return bytes;
}

// Resolve os IDs de nós de spec (specGroup + contour) vinculados a um frame,
// só os explicitamente ligados via frame.createdSpecs -- nunca __loose__,
// nunca busca geométrica.
async function _hdCollectSpecSnapshotNodeIds(f) {
  const ids = [];
  for (const s of (f.createdSpecs || [])) {
    if (!s || !s.id) continue;
    ids.push(s.id);
    try {
      const specGroup = await figma.getNodeByIdAsync(s.id);
      const markerId = specGroup && specGroup.getPluginData('handexSpecMarkerId');
      if (markerId) ids.push(markerId);
    } catch (e) { /* specGroup ausente: ids já tem só o id direto, tolerado no snapshot */ }
  }
  return ids;
}

// Variante de _hdCollectSpecSnapshotNodeIds que retorna SÓ os contours
// (nunca o specGroup) -- usada pelo snapshot grande da Documentação Visual,
// que quer só selo (chip, filho do contour) + moldura, sem o Conector/
// specCard que vivem dentro do specGroup.
async function _hdCollectSpecContourIds(f) {
  const ids = [];
  for (const s of (f.createdSpecs || [])) {
    if (!s || !s.id) continue;
    try {
      const specGroup = await figma.getNodeByIdAsync(s.id);
      const markerId = specGroup && specGroup.getPluginData('handexSpecMarkerId');
      if (markerId) ids.push(markerId);
    } catch (e) { /* specGroup ausente: sem contour a coletar, tolerado no snapshot */ }
    [...(s.measurements || []), ...(s._sameElementMeasures || [])].forEach(m => { if (m && m.nodeId) ids.push(m.nodeId); });
  }
  return ids;
}

// Subgrupo de medidas de 1 frame. handexFrameId identifica o subgrupo entre
// gerações.
// Subgrupo de medidas de 1 frame (ou de medidas avulsas, com
// f.nome === 'Sem frame vinculado'). handexFrameId identifica o subgrupo
// entre gerações; medidas avulsas usam a chave fixa '__loose__' (setada pelo
// chamador, sobrescrevendo o valor vazio calculado aqui) já que não têm
// frame.figmaId real -- mesmo padrão de _hdBuildSpecsSubgroup.
function _hdBuildMeasuresSubgroup(f) {
  const fGroup = _hdCreateFrame("VERTICAL", 0, 6);
  const _frameKey = f.figmaId || f.id || '';
  fGroup.name = _frameKey ? `[Medidas | ${_frameKey}] ${f.nome || 'Frame'}` : `[Medidas] ${f.nome || 'Frame'}`;
  fGroup.setPluginData('handexFrameId', _frameKey);
  if (_hdStyled()) {
    _hdDsTable(fGroup, "Medidas", [{ title: "Medida", w: 170 }, { title: "Valores" }],
      f.measurements.map(m => [
        { text: m.name || 'Medida', w: "semibold" },
        { text: Array.isArray(m.details) ? m.details.join(' | ') : (m.details || ''), mono: true, size: 12, lh: 18, color: _DS.blue }
      ]));
    return fGroup;
  }
  f.measurements.forEach(m => {
    const details = Array.isArray(m.details) ? m.details.join(' | ') : (m.details || '');
    const mRow = _hdCreateFrame("HORIZONTAL", 10, 7, { r: 0.9686, g: 0.9804, b: 0.9804 });
    mRow.name = `[Medida] ${m.name || 'Medida'}`;
    mRow.cornerRadius = 6;
    mRow.counterAxisAlignItems = "CENTER";
    fGroup.appendChild(mRow);
    _hdSetFillAndHug(mRow);
    const mName = _hdCreateText(m.name || 'Medida', 11, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
    mName.layoutGrow = 1;
    mRow.appendChild(mName);
    const mVal = _hdCreateText(details, 10, "Regular", { r: 0, g: 0.3608, b: 0.6627 });
    mRow.appendChild(mVal);
    _hdSetFillAndHug(mVal);
  });
  return fGroup;
}

// Semântica por tipo de exceção (lib DSC | Fundamentos Visuais: negative/attention/positive;
// Confirmação mantém o azul de marca da UI). Texto sobre fundo claro >= 4.5:1.
const _HD_EXC_TYPE_STYLE = {
  'Erro':        { text: hexToRgb('#8c2424'), border: hexToRgb('#b22c2c'), bg: hexToRgb('#fbebeb') },
  'Alerta':      { text: hexToRgb('#654c02'), border: hexToRgb('#977203'), bg: hexToRgb('#fff9e6') },
  'Sucesso':     { text: hexToRgb('#0d581d'), border: hexToRgb('#127527'), bg: hexToRgb('#e7f4ea') },
  'Confirmação': { text: hexToRgb('#005ca9'), border: hexToRgb('#005ca9'), bg: hexToRgb('#e5f2fc') },
  _neutro:       { text: { r: 0.2, g: 0.2, b: 0.2 }, border: { r: 0.8157, g: 0.8784, b: 0.8902 }, bg: { r: 0.969, g: 0.980, b: 0.980 } }
};

// Subgrupo de especificações anotadas de 1 frame (ou de specs avulsas, com
// f.nome === 'Sem frame vinculado'). handexFrameId identifica o subgrupo
// entre gerações; specs avulsas usam a chave fixa '__loose__' (setada pelo
// chamador) já que não têm frame.figmaId real.
async function _hdBuildSpecsSubgroup(f) {
  const fGroup = _hdCreateFrame("VERTICAL", 0, 10);
  fGroup.name = `[Specs] ${f.nome || 'Frame'}`;
  fGroup.setPluginData('handexFrameId', f.figmaId || f.id || '');
  // Sem repetir o nome do frame (o bloco já tem o título) — 2026-10-07.
  const _st = _hdStyled();

  const groupNames = f.specGroupNames || {};
  const groupVisible = f.specGroupVisible || {};
  const letterOrder = [];
  const specsByLetter = {};
  (f.createdSpecs || []).forEach(s => {
    const l = s.letter || 'A';
    if (!specsByLetter[l]) { specsByLetter[l] = []; letterOrder.push(l); }
    specsByLetter[l].push(s);
  });

  for (const letter of letterOrder) {
    if (groupVisible[letter] === false) continue;
    const groupSpecs = specsByLetter[letter];
    const groupColor = groupSpecs[0]?.color ? hexToRgb(groupSpecs[0].color) : { r: 0, g: 0.361, b: 0.663 };
    const groupNameText = groupNames[letter] || '';

    const gBox = _hdCreateFrame("VERTICAL", 0, 6);
    gBox.name = `[Grupo/${letter}] ${groupNameText || letter}`;
    fGroup.appendChild(gBox);
    _hdSetFillAndHug(gBox);

    // Tag em destaque no próprio card de cada especificação (2026-10-07);
    // aqui fica só o nome do grupo, quando o designer deu um.
    if (groupNameText) {
      const gName = _hdCreateText(groupNameText, _hdS(10, 14), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
      gBox.appendChild(gName);
      _hdSetFillAndHug(gName);
    }

    const gSpecs = _hdCreateFrame("VERTICAL", 0, 4);
    gSpecs.fills = [];
    gBox.appendChild(gSpecs);
    _hdSetFillAndHug(gSpecs);

    for (const s of groupSpecs) {
      const catLabel = s.type || s.categoryLabel || s.category || 'Geral';
      const sc = s.color ? hexToRgb(s.color) : { r: 0, g: 0.361, b: 0.663 };
      const scBg = s.fillColor ? hexToRgb(s.fillColor) : { r: 1 - (1 - sc.r) * 0.12, g: 1 - (1 - sc.g) * 0.12, b: 1 - (1 - sc.b) * 0.12 };
      const sRow = _hdCreateFrame("VERTICAL", _st ? 12 : 10, _st ? 12 : 8, _st ? hexToRgb(_DS.white) : { r: 0.969, g: 0.980, b: 0.980 });
      sRow.name = `[Spec/${s.letter || 'A'}] ${s.name || s.label || 'Spec'}`;
      sRow.cornerRadius = 8;
      sRow.strokes = [{ type: "SOLID", color: sc }];
      gSpecs.appendChild(sRow);
      _hdSetFillAndHug(sRow);
      const sTop = _hdCreateFrame("HORIZONTAL", 0, 10);
      sTop.counterAxisAlignItems = "CENTER";
      sRow.appendChild(sTop);
      _hdSetFillAndHug(sTop);
      // Tag (A, B, A1...) como destaque: primeiro item do card, na cor da
      // especificação, com o nome do elemento ao lado.
      const sTag = _hdCreateFrame("HORIZONTAL", 0, 0, sc);
      sTag.name = `Tag ${s.letter || 'A'}`;
      sTag.cornerRadius = 6;
      sTag.paddingLeft = 10; sTag.paddingRight = 10; sTag.paddingTop = 4; sTag.paddingBottom = 4;
      sTag.primaryAxisAlignItems = "CENTER";
      sTag.counterAxisAlignItems = "CENTER";
      sTop.appendChild(sTag);
      const sTagT = _hdCreateText(s.letter || 'A', _hdS(14, 18), "Bold", { r: 1, g: 1, b: 1 });
      sTagT.textAutoResize = "WIDTH_AND_HEIGHT";
      sTag.appendChild(sTagT);
      const sName = _hdCreateText(s.name || s.label || 'Spec', _hdS(11, 16), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
      sName.layoutGrow = 1;
      sTop.appendChild(sName);
      if (s.link) {
        sName.textDecoration = "UNDERLINE";
        sName.hyperlink = { type: "URL", value: s.link };
      } else if (s.id && await figma.getNodeByIdAsync(s.id)) {
        sName.textDecoration = "UNDERLINE";
        sName.hyperlink = { type: "NODE", value: s.id };
      }
      const sCatTag = _hdCreateFrame("HORIZONTAL", 6, 3, scBg);
      sCatTag.cornerRadius = _hdS(999, 4);
      sCatTag.strokes = [{ type: "SOLID", color: sc }];
      sCatTag.strokeWeight = 1;
      sTop.appendChild(sCatTag);
      try { sCatTag.layoutSizingHorizontal = "HUG"; sCatTag.layoutSizingVertical = "HUG"; } catch (e) {}
      sCatTag.appendChild(_hdCreateText(catLabel, _hdS(9, 12), "Medium", sc));
      if (s.note) {
        const sNote = _hdCreateText(s.note, _hdS(10, 13), "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
        sRow.appendChild(sNote);
        _hdSetFillAndHug(sNote);
      }
      // 2026-10-08: informação visual fica só em Detalhar UI. Especificações
      // antigas com propriedades guardadas não as levam mais à Ficha.
      const _props = [];
      if (_props.length > 0 && _st) {
        const propsCol = _dsFrame("Propriedades da spec", "VERTICAL", { gap: 8 });
        _dsAdd(sRow, propsCol, true);
        _props.forEach(prop => {
          const val = String(_hdVocabValue(prop.value) || '');
          const hexM = /#([0-9a-f]{6})/i.exec(val);
          const chips = _dsChipsForRow({
            key: prop.key || '', cat: hexM ? "fill" : "", label: prop.label || '', value: val,
            token: prop.token || null, raw: hexM ? { hex: "#" + hexM[1] } : null, libName: null
          });
          _dsPropLine(propsCol, String(_hdVocabLabel(prop.label, prop.key) || prop.key || '').toLowerCase(), chips);
        });
      } else if (_props.length > 0) {
        const propsFrame = _hdCreateFrame("VERTICAL", 0, 3);
        propsFrame.fills = [];
        _hdSetFillAndHug(propsFrame);
        sRow.appendChild(propsFrame);
        _props.forEach(prop => {
          const pRow = _hdCreateFrame("HORIZONTAL", 8, 4, { r: 0.898, g: 0.949, b: 0.9882 });
          pRow.cornerRadius = 4;
          pRow.counterAxisAlignItems = "CENTER";
          _hdSetFillAndHug(pRow);
          propsFrame.appendChild(pRow);
          const pKey = _hdCreateText(_hdVocabLabel(prop.label, prop.key) || prop.key || '', 9, "Regular", { r: 0.251, g: 0.2941, b: 0.3216 });
          pKey.layoutGrow = 1;
          pRow.appendChild(pKey);
          if (prop.token) {
            const tBadge = _hdCreateText(prop.token, 8, "Medium", hexToRgb("#005ca9"));
            _hdSetFillAndHug(tBadge);
            pRow.appendChild(tBadge);
          }
          const pVal = _hdCreateText(String(_hdVocabValue(prop.value) || ''), 9, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
          _hdSetFillAndHug(pVal);
          pRow.appendChild(pVal);
        });
      }
      // Medidas vinculadas à especificação (2026-10-07).
      const _sms = [...(s.measurements || []), ...(s._sameElementMeasures || [])].filter(Boolean);
      if (_sms.length > 0) {
        const mCol = _hdCreateFrame("VERTICAL", 0, 4);
        mCol.name = "Medidas da especificação";
        mCol.fills = [];
        sRow.appendChild(mCol);
        _hdSetFillAndHug(mCol);
        const mLbl = _hdCreateText("Medidas", 9, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 });
        mCol.appendChild(mLbl); _hdSetFillAndHug(mLbl);
        _sms.forEach(m => (m.details || []).forEach(d => {
          const mt = _hdCreateText(String(d), 9, "Regular", { r: 0.1333, g: 0.1608, b: 0.1804 }, { mono: true });
          mCol.appendChild(mt); _hdSetFillAndHug(mt);
        }));
      }
      const _excs = s.excecoes || [];
      if (_excs.length > 0 && _st) {
        const excCol = _dsFrame("Exceções da spec", "VERTICAL", { gap: 8 });
        _dsAdd(sRow, excCol, true);
        for (const exc of _excs) {
          await _dsAlert(excCol, exc.tipo, `${exc.tipo || 'Exceção'}${exc.titulo ? ' — ' + exc.titulo : ''}`, [exc.obs]);
        }
      } else if (_excs.length > 0) {
        const excFrame = _hdCreateFrame("VERTICAL", 0, 4);
        excFrame.fills = [];
        _hdSetFillAndHug(excFrame);
        sRow.appendChild(excFrame);
        _excs.forEach(exc => {
          const ec = _HD_EXC_TYPE_STYLE[exc.tipo] || _HD_EXC_TYPE_STYLE._neutro;
          const eRow = _hdCreateFrame("VERTICAL", 6, 4, ec.bg);
          eRow.cornerRadius = 4;
          eRow.strokes = [{ type: "SOLID", color: ec.border }];
          eRow.strokeWeight = 1;
          eRow.strokeLeftWeight = 3;
          eRow.name = `[Exceção/${exc.tipo || 'Exceção'}]`;
          _hdSetFillAndHug(eRow);
          excFrame.appendChild(eRow);
          const eTitle = _hdCreateText(`${exc.tipo || 'Exceção'}${exc.titulo ? ' — ' + exc.titulo : ''}`, 9, "Bold", ec.text);
          eRow.appendChild(eTitle);
          _hdSetFillAndHug(eTitle);
          if (exc.obs) {
            const eObs = _hdCreateText(exc.obs, 9, "Regular", ec.text);
            eRow.appendChild(eObs);
            _hdSetFillAndHug(eObs);
          }
        });
      }
    }
  }
  return fGroup;
}

// Card de fluxo de tela. handexFlowId (id estável gerado no frontend, não o
// node.id do Figma) identifica o card entre gerações.
const _HD_FLOW_TYPE_LABEL = { line_solid: 'Sequência', line_dashed: 'Mensagem', diamond: 'Decisão', diamond_dashed: 'Decisão (opcional)', event_start: 'Início', event_end: 'Fim', gateway_parallel: 'Paralelo' };
function _hdBuildFlowCard(flow, fi) {
  const fRow = _hdCreateFrame("VERTICAL", 12, 10, { r: 0.969, g: 0.980, b: 0.980 });
  fRow.name = `[Fluxo] ${flow.name || 'Fluxo ' + (fi + 1)}`;
  fRow.cornerRadius = 8;
  fRow.strokes = [{ type: "SOLID", color: { r: 0.816, g: 0.878, b: 0.890 } }];
  fRow.setPluginData('handexFlowId', flow.flowUid || flow.id || '');
  const fTop = _hdCreateFrame("HORIZONTAL", 0, 4);
  fTop.counterAxisAlignItems = "CENTER";
  const fName = _hdCreateText(flow.name || 'Fluxo', 12, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
  fName.layoutGrow = 1;
  fTop.appendChild(fName);
  const typeStr = _HD_FLOW_TYPE_LABEL[flow.type] || flow.type || '';
  if (typeStr) {
    const fTypeTag = _hdCreateFrame("HORIZONTAL", 6, 3, { r: 0.898, g: 0.949, b: 0.988 });
    fTypeTag.cornerRadius = 999;
    fTop.appendChild(fTypeTag);
    _hdSetFillAndHug(fTypeTag);
    fTypeTag.appendChild(_hdCreateText(typeStr, 9, "Medium", { r: 0, g: 0.361, b: 0.663 }));
  }
  fRow.appendChild(fTop);
  _hdSetFillAndHug(fTop);
  if (flow.fromName || flow.toName) {
    const connStr = `${flow.fromName || '?'} → ${flow.toName || '?'}`;
    const fConn = _hdCreateText(connStr, 10, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
    fRow.appendChild(fConn);
    _hdSetFillAndHug(fConn);
  }
  if (flow.decisionText) {
    const dText = _hdCreateText(`"${flow.decisionText}"`, 10, "Regular", { r: 0.392, g: 0.455, b: 0.478 });
    fRow.appendChild(dText);
    _hdSetFillAndHug(dText);
  }
  return fRow;
}

// Localiza a ficha mais recente do projeto no canvas (mesmo critério usado
// por pull-ficha-version-from-canvas/insert-frame-in-ficha/
// insert-flows-in-ficha): prefixo de nome + ordenação por timestamp
// embutido no nome (ordenação alfabética de string já resolve, formato do
// timestamp é sempre YYYY-MM-DD HH:MM). Retorna null se não encontrar.
// Busca em figma.currentPage.children (fichas legadas, soltas na página,
// criadas antes de 2026-09-11) E dentro da Section "Handex | Ficha" (padrão
// atual) -- nunca recursiva além desse segundo nível, a ficha nunca fica
// aninhada mais fundo que isso.
function _hdFindExistingFicha(titulo) {
  const _titulo = (titulo || '').trim();
  const _prefix = _titulo ? `Handex | Ficha de Projeto | ${_titulo}` : 'Handex | Ficha de Projeto';
  const _isFicha = n => n.type === 'FRAME' && n.name.startsWith(_prefix);
  const _fichaSection = figma.currentPage.children.find(n => n.type === 'SECTION' && n.getPluginData('handexCategorySection') === 'ficha');
  const fichas = figma.currentPage.children.filter(_isFicha)
    .concat(_fichaSection ? _fichaSection.children.filter(_isFicha) : []);
  if (fichas.length === 0) return null;
  fichas.sort((a, b) => a.name.localeCompare(b.name));
  return fichas[fichas.length - 1];
}

// ============================================================
// Reconstrução por subseção da Ficha ("insert-ficha-section") -- cada
// função monta a subseção do zero (mesma lógica usada por create-handoff)
// e a devolve SOLTA, sem anexar a nenhum pai: o chamador decide entre
// content.insertChild(idx, secao) (update no lugar, preservando a posição
// das demais subseções) ou content.appendChild(secao) (subseção nova, sem
// posição anterior a preservar). Não reutilizam _hdCreateSection porque
// aquela sempre faz parent.appendChild internamente.
// ============================================================

function _hdBuildSectionShell(titleText) {
  const section = _hdCreateFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
  section.name = `[Seção] ${titleText}`;
  _hdSetFillAndHug(section);
  section.cornerRadius = 8;
  section.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
  section.strokeWeight = 1;
  const title = _hdCreateText(titleText, _hdS(16, 22), "Bold", hexToRgb("#005ca9"));
  section.appendChild(title);
  _hdSetFillAndHug(title);
  return section;
}

// Localiza a subseção existente de um dado título dentro de `content` (a
// busca é sempre por nome fixo, mesmo padrão já usado por
// pull-ficha-version-from-canvas) e substitui pelo conteúdo novo no MESMO
// índice, ou anexa ao final se a subseção ainda não existir (ela nasce
// vazia hoje, ex: projeto nunca teve medidas). Se `newSection` for null
// (subseção ficou sem conteúdo), só remove a existente, sem recriar.
function _hdReplaceSection(content, titleText, newSection, afterTitle) {
  const _name = `[Seção] ${titleText}`;
  const _legacyName = titleText === "Conexões entre telas" ? "[Seção] Fluxos de Tela" : null;
  const existing = content.children.find(n => n.type === 'FRAME' && (n.name === _name || (_legacyName && n.name === _legacyName)));
  let idx = content.children.length;
  if (!existing && afterTitle) {
    const _candidates = Array.isArray(afterTitle) ? afterTitle : [afterTitle];
    for (const t of _candidates) {
      const _after = content.children.find(n => n.type === 'FRAME' && n.name === `[Seção] ${t}`);
      if (_after) { idx = content.children.indexOf(_after) + 1; break; }
    }
  }
  if (existing) {
    idx = content.children.indexOf(existing);
    try { existing.remove(); } catch (e) {}
  }
  if (!newSection) return;
  content.insertChild(Math.min(idx, content.children.length), newSection);
  _hdSetFillAndHug(newSection);
}

// Um frame só é relevante pra Ficha se tiver ao menos 1 item do scan marcado
// manualmente como "Componente Personalizado" (item.isMarkedCustom) -- mesmo
// critério do Card 3 "User Interface" (createSpecList, ver decisão de produto
// no CLAUDE.md). Frames 100% conformes ao DSC não precisam aparecer: o dev já
// usa o componente pronto da lib, não há nada novo a construir ali.
function _hdFichaHasFrameSections(ficha) {
  try {
    return !!ficha.findOne(n => n.type === 'FRAME' && (n.name === '[Seção] Frames Escaneados' || n.name === '[Seção] User Interface'));
  } catch (e) { return false; }
}

function _hdFrameHasCustomItem(f) {
  if (!f || !f.specs) return false;
  return HD_BUILDABLE_CATS.some(cat => (f.specs[cat] || []).some(item => _hdIsBuildItem(item, cat)));
}

// Frame marcado como "Novo Componente" (toggle isNewComponent, ver
// Escanear Tokens) entra na Ficha SEMPRE, mesmo sem nenhum item isMarkedCustom
// -- o próprio frame já é a declaração de "isso é novo pro DSC", obrigatória,
// não depende de o designer também ter marcado itens individuais dentro dele.
// Desde 2026-10-08 (pedido do Augusto) todo frame escaneado entra como
// informação na Ficha, com o status de revisão; antes só os relevantes
// (Novo Componente ou item marcado).
function _hdFrameIsRelevantForFicha(f) {
  return !!(f && (f.isNewComponent || f.specs || _hdFrameHasCustomItem(f)));
}

// 1.7 FRAMES ESCANEADOS -- reconstrói a subseção inteira a partir de
// data.frames, só com os frames relevantes (_hdFrameIsRelevantForFicha:
// isNewComponent ou item isMarkedCustom) -- a menos que includeAllFrames seja
// true, aí entra a lista completa sem filtro (usado quando o designer
// confirma explicitamente incluir tudo no modal de "nada fora do DSC", ver
// handler insert-ficha-section/create-handoff). Retorna a seção solta (nunca
// vazia sem chamador saber: retorna null se não sobrar nenhum frame, para o
// chamador decidir remover).
async function _hdRebuildFramesSection(frames, includeAllFrames = false, excludeFrameIds = []) {
  // excludeFrameIds: frames sem nada a construir que o designer desmarcou no
  // modal "Incluir estes frames na Ficha?" (2026-10-08).
  const _ex = new Set(Array.isArray(excludeFrameIds) ? excludeFrameIds : []);
  const _frames = (includeAllFrames ? (frames || []) : (frames || []).filter(_hdFrameIsRelevantForFicha)).filter(f => !_ex.has(f.id));
  if (_frames.length === 0) return null;
  const framesSection = _hdBuildSectionShell("Frames Escaneados");
  for (const [fi, f] of _frames.entries()) {
    const fRow = await _hdBuildFrameCard(f, fi);
    framesSection.appendChild(fRow);
    _hdSetFillAndHug(fRow);
  }
  return framesSection;
}

// Bloco de "Documentação Visual" de 1 frame: até 2 pares (specs, medidas),
// cada par = snapshot grande (frame + só selos/contornos ou marcações de
// medida, nunca Conector/specCard) + card de detalhe em texto ao lado
// (_hdBuildSpecsSubgroup/_hdBuildMeasuresSubgroup, reaproveitadas sem
// alteração -- já eram exatamente "specs/medidas organizadas por frame",
// só viviam em seções separadas mais abaixo na Ficha). Retorna null se o
// frame não tiver nem specs nem medidas vinculadas (nunca gera bloco
// vazio). Substitui os dois snapshots pequenos que existiam antes dentro
// de _hdBuildFrameCard.
async function _hdBuildFrameShowcaseBlock(f, fi) {
  const _frameNode = f.figmaId ? await figma.getNodeByIdAsync(f.figmaId) : null;
  if (!_frameNode) return null;

  const _hasSpecs = (f.createdSpecs || []).length > 0;
  const _hasMeasures = (f.measurements || []).length > 0;
  if (!_hasSpecs && !_hasMeasures) return null;

  // Fill cinza claro (mesmo tom já usado em outros cards da Ficha, ex:
  // linhas de medida/regra/exceção) -- antes era branco puro sobre o fundo
  // branco da Ficha, sem contraste real (só a borda de 1px separava),
  // dificultando a leitura de onde um card de frame termina e o próximo
  // começa.
  const block = _hdCreateFrame("VERTICAL", 16, 16, { r: 0.9686, g: 0.9804, b: 0.9804 });
  block.name = `[Documentação] ${f.nome || 'Frame ' + (fi + 1)}`;
  _hdStyleDocBlock(block);
  block.setPluginData('handexFrameId', f.figmaId || f.id || '');

  const blockTitle = _hdCreateText(f.nome || 'Frame', _hdS(14, 18), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
  block.appendChild(blockTitle);
  _hdSetFillAndHug(blockTitle);

  // Layout fixo (decisão de produto 2026-09-17): a Ficha tem largura fixa
  // em cascata (mainContainer 1080 → fichaTecnica 952 → content 904, padding
  // 24 → block 872, padding 16). O snapshot NUNCA corta: sua largura é
  // sempre a proporção real do frame documentado, limitada a 872px (o
  // espaço disponível dentro de block) -- se o frame for mais largo que
  // isso, a imagem inteira reduz proporcionalmente (nunca crop). O card de
  // detalhe (specs/medidas) tem no máximo 450px, alinhado à esquerda (antes
  // esticava pra ocupar a largura toda do bloco via FILL).
  const _SNAPSHOT_MAX_W = 872;
  const _DETAIL_CARD_MAX_W = 450;
  const _addShowcasePair = async (label, nodeIds, detailNode, buildExtras) => {
    if (!detailNode) return;
    const pair = _hdCreateFrame("VERTICAL", 0, 8);
    pair.appendChild(_hdStyled() ? _hdPreviewTag(label, _DS.white) : _hdCreateText(label, 11, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 }));

    if (nodeIds.length > 0) {
      const bytes = await _hdSnapshotFrameWithNodes(_frameNode, nodeIds);
      if (bytes) {
        try {
          const imageHash = figma.createImage(bytes).hash;
          const _bb = _frameNode.absoluteBoundingBox;
          const _w = _bb && _bb.width > 0 ? Math.min(_SNAPSHOT_MAX_W, _bb.width) : _SNAPSHOT_MAX_W;
          const _h = _bb && _bb.width > 0 ? _w * (_bb.height / _bb.width) : _SNAPSHOT_MAX_W * 0.6;
          const rect = figma.createRectangle();
          rect.resize(_w, _h);
          rect.fills = [{ type: "IMAGE", imageHash, scaleMode: "FIT" }];
          rect.cornerRadius = 8;
          _hdStylePreviewRect(rect);
          rect.layoutAlign = "INHERIT"; // alinhado à esquerda, nunca estica (FILL)
          pair.appendChild(rect);
        } catch (e) { /* tolera falha de imagem isolada, mantém o card de detalhe */ }
      }
    }

    if (buildExtras) await buildExtras(pair);

    pair.appendChild(detailNode);
    // Card de detalhe: largura FIXA em 450px, alinhado à esquerda -- antes
    // usava _hdSetFillAndHug (FILL), esticando pra ocupar os 872px inteiros
    // do bloco. Uma primeira tentativa de HUG+maxWidth deixou o card
    // "espremido" (35px) porque HUG sem conteúdo largo o suficiente encolhe
    // livremente -- maxWidth é só um teto, nunca um piso. resize() +
    // counterAxisSizingMode FIXED (dentro de um pai VERTICAL como "pair",
    // largura é o eixo cruzado) força os 450px de verdade, com o conteúdo
    // interno (que já usa _hdSetFillAndHug) preenchendo essa largura.
    detailNode.resize(_DETAIL_CARD_MAX_W, detailNode.height);
    if ('counterAxisSizingMode' in detailNode) detailNode.counterAxisSizingMode = "FIXED";
    if ('primaryAxisSizingMode' in detailNode) detailNode.primaryAxisSizingMode = "AUTO";
    detailNode.layoutAlign = "INHERIT";
    block.appendChild(pair);
    _hdSetFillAndHug(pair);
  };

  // Medida feita no MESMO elemento de uma especificação vai para dentro do
  // card dela (2026-10-07), sem bloco nem nome repetido. Elemento alvo da
  // medida vem do pluginData handexMeasureTargetId do grupo no canvas.
  const _specByTarget = new Map();
  (f.createdSpecs || []).forEach(sp => { if (sp && sp.targetNodeId) _specByTarget.set(sp.targetNodeId, sp); });
  const _restMeasures = [];
  for (const m of (f.measurements || [])) {
    let tid = null;
    if (m && m.nodeId && _specByTarget.size) {
      try { const g = await figma.getNodeByIdAsync(m.nodeId); tid = g ? g.getPluginData('handexMeasureTargetId') : null; } catch (e) { tid = null; }
    }
    const sp = tid ? _specByTarget.get(tid) : null;
    if (sp) sp._sameElementMeasures = (sp._sameElementMeasures || []).concat([m]);
    else if (m) _restMeasures.push(m);
  }
  f = Object.assign({}, f, { measurements: _restMeasures });

  if (_hasSpecs) {
    await _addShowcasePair("Especificações", await _hdCollectSpecContourIds(f), await _hdBuildSpecsSubgroup(f));
  }
  if (_restMeasures.length > 0) {
    const _measureIds = f.measurements.map(m => m.nodeId).filter(Boolean);
    await _addShowcasePair("Outras medidas", _measureIds, _hdBuildMeasuresSubgroup(f), async (pair) => {
      let perFrame = 0;
      const seen = new Set();
      for (const m of f.measurements) {
        if (!m || !m.nodeId || seen.has(m.nodeId)) continue;
        seen.add(m.nodeId);
        if (perFrame >= _HD_CROPS_PER_FRAME_MAX || _hdCropBudget <= 0) break;
        let crop = null;
        try { crop = await _hdBuildMeasureCropImage(_frameNode, m, _SNAPSHOT_MAX_W); } catch (e) { crop = null; }
        if (!crop) continue;
        perFrame++;
        _hdCropBudget--;
        const lbl = _hdStyled() ? _hdPreviewTag(crop.label, _DS.white) : _hdCreateText(crop.label, 11, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 });
        pair.appendChild(lbl);
        _hdStylePreviewRect(crop.rect);
        pair.appendChild(crop.rect);
      }
    });
  }

  return block;
}

// Recortes ampliados das medidas (por grupo de medida): tetos de performance.
const _HD_CROPS_PER_FRAME_MAX = 8;
const _HD_CROPS_PER_FICHA_MAX = 20;
let _hdCropBudget = _HD_CROPS_PER_FICHA_MAX;

function _hdPngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const rd = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
  return { w: rd(16), h: rd(20) };
}

// Gera um retângulo de imagem recortado na região de UMA medida (elemento
// alvo, quando o pluginData handexMeasureTargetId existe; senão só a caixa
// das marcações do grupo) + 24px de respiro. Exporta frame + SÓ este grupo
// (nunca as demais medidas) e recorta via imageTransform (scaleMode CROP).
// A região é sempre clampada à imagem exportada e nunca menor que a caixa
// das marcações, então não corta nada. Retorna null (sem recorte) se a
// região cobrir >80% do frame, se as dimensões do PNG não baterem com os
// bounds esperados (mapeamento inseguro) ou em qualquer falha.
async function _hdBuildMeasureCropImage(frameNode, m, maxW) {
  const group = await figma.getNodeByIdAsync(m.nodeId);
  if (!group || group.removed) return null;
  const gb = group.absoluteRenderBounds || group.absoluteBoundingBox;
  const fb = frameNode.absoluteBoundingBox;
  if (!gb || !fb || fb.width <= 0 || fb.height <= 0) return null;

  let region = { x: gb.x, y: gb.y, x2: gb.x + gb.width, y2: gb.y + gb.height };
  let label = "Detalhe das medidas";
  let targetId = '';
  try { targetId = group.getPluginData('handexMeasureTargetId'); } catch (e) { targetId = ''; }
  if (targetId) {
    let t = null;
    try { t = await figma.getNodeByIdAsync(targetId); } catch (e) { t = null; }
    const tb = t && !t.removed ? (t.absoluteRenderBounds || t.absoluteBoundingBox) : null;
    if (tb) {
      region = {
        x: Math.min(region.x, tb.x), y: Math.min(region.y, tb.y),
        x2: Math.max(region.x2, tb.x + tb.width), y2: Math.max(region.y2, tb.y + tb.height),
      };
      label = `Detalhe: ${t.name || m.name || 'elemento'}`;
    }
  }
  if (label === "Detalhe das medidas" && m.name) label = `Detalhe: ${m.name}`;

  const PAD = 24;
  region = { x: region.x - PAD, y: region.y - PAD, x2: region.x2 + PAD, y2: region.y2 + PAD };
  const regionArea = (region.x2 - region.x) * (region.y2 - region.y);
  if (regionArea > 0.8 * fb.width * fb.height) return null;

  const info = {};
  const bytes = await _hdSnapshotFrameWithNodes(frameNode, [m.nodeId], info);
  const U = info.bounds;
  const px = _hdPngSize(bytes);
  if (!bytes || !U || !px || U.width <= 0 || U.height <= 0) return null;
  if (Math.abs(px.w / 2 - U.width) > 2 || Math.abs(px.h / 2 - U.height) > 2) return null;

  const cx = Math.max(region.x, U.x), cy = Math.max(region.y, U.y);
  const cx2 = Math.min(region.x2, U.x + U.width), cy2 = Math.min(region.y2, U.y + U.height);
  const cw = cx2 - cx, ch = cy2 - cy;
  if (cw < 8 || ch < 8) return null;

  const k = Math.min(maxW / cw, 3);
  const w = cw * k, h = ch * k;
  const rect = figma.createRectangle();
  rect.resize(w, h);
  rect.fills = [{
    type: "IMAGE",
    imageHash: figma.createImage(bytes).hash,
    scaleMode: "CROP",
    imageTransform: [
      [cw / U.width, 0, (cx - U.x) / U.width],
      [0, ch / U.height, (cy - U.y) / U.height],
    ],
  }];
  rect.cornerRadius = 8;
  rect.layoutAlign = "INHERIT";
  return { rect, label };
}

// "Documentação Visual" -- 1 bloco por frame documentado (via
// _hdBuildFrameShowcaseBlock), empilhados verticalmente. Substitui as
// antigas seções "Medidas" e "Especificações" (agregadas, listavam TODOS
// os frames juntos, sem nenhuma referência visual) -- decisão de produto
// 2026-09-17: dev não precisa de uma lista de texto separada da tela real,
// precisa ver a marcação sobre a tela e o detalhe ao lado, por frame.
// Specs avulsas (sem frame): data.specs é o array global, que após o merge do
// frontend (saveSpecsToStorage) também carrega as specs de frame -- por isso
// filtra por id contra as specs já vinculadas a algum frame.
function _hdLooseSpecsOf(data) {
  const framedIds = new Set();
  (data.frames || []).forEach(f => (f.createdSpecs || []).forEach(s => { if (s && s.id) framedIds.add(s.id); }));
  return (data.specs || []).filter(s => s && !framedIds.has(s.id));
}

async function _hdRebuildDocumentacaoVisualSection(frames, looseMeasurements, looseSpecs) {
  const _frames = frames || [];
  const _loose = (looseMeasurements || []).filter(Boolean);
  const _looseSpecs = (looseSpecs || []).filter(Boolean);
  if (_frames.length === 0 && _loose.length === 0 && _looseSpecs.length === 0) return null;
  _hdCropBudget = _HD_CROPS_PER_FICHA_MAX;
  const blocks = [];
  for (const [fi, f] of _frames.entries()) {
    const block = await _hdBuildFrameShowcaseBlock(f, fi);
    if (block) { blocks.push(block); continue; }
    // Frame sem bloco (nó do frame não encontrado no canvas, ex.: apagado ou
    // em outra página) mas com medidas/especificações: entram como avulsas em
    // vez de sumirem -- antes a seção vinha vazia e a inserção falhava com
    // "Não há especificações nem medidas" mesmo com medidas na lista.
    const _orphanM = (f.measurements || []).filter(Boolean);
    const _orphanS = (f.createdSpecs || []).filter(Boolean);
    if (_orphanM.length) _loose.push(..._orphanM);
    if (_orphanS.length) _looseSpecs.push(..._orphanS.filter(sp => !_looseSpecs.some(x => x && sp && x.id === sp.id)));
  }
  if (_looseSpecs.length > 0) {
    const block = _hdCreateFrame("VERTICAL", 16, 16, { r: 0.9686, g: 0.9804, b: 0.9804 });
    block.name = "[Documentação] Specs avulsas";
    _hdStyleDocBlock(block);
    block.setPluginData('handexFrameId', '__loose__');
    // Especificações são independentes do Escanear Tokens (2026-10-07): o
    // bloco deixa de ser "avulsas" e vira o lugar normal delas na Ficha.
    const t = _hdCreateText("Especificações", _hdS(14, 18), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
    block.appendChild(t);
    _hdSetFillAndHug(t);
    const detail = await _hdBuildSpecsSubgroup({ nome: "Especificações", createdSpecs: _looseSpecs });
    detail.setPluginData('handexFrameId', '__loose__');
    block.appendChild(detail);
    _hdSetFillAndHug(detail);
    blocks.push(block);
  }
  if (_loose.length > 0) {
    const block = _hdCreateFrame("VERTICAL", 16, 16, { r: 0.9686, g: 0.9804, b: 0.9804 });
    block.name = "[Documentação] Medidas avulsas";
    _hdStyleDocBlock(block);
    block.setPluginData('handexFrameId', '__loose__');
    const t = _hdCreateText("Medidas avulsas", _hdS(14, 18), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
    block.appendChild(t);
    _hdSetFillAndHug(t);
    const tSub = _hdCreateText("Aplicadas direto no canvas, sem um frame escaneado em Escanear Frames.", _hdS(10, 12), "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
    block.appendChild(tSub);
    _hdSetFillAndHug(tSub);
    const detail = _hdBuildMeasuresSubgroup({ nome: "Medidas aplicadas", measurements: _loose });
    detail.setPluginData('handexFrameId', '__loose__');
    block.appendChild(detail);
    _hdSetFillAndHug(detail);
    blocks.push(block);
  }
  if (blocks.length === 0) return null;
  const section = _hdBuildSectionShell("Documentação Visual");
  blocks.forEach(block => {
    section.appendChild(block);
    _hdSetFillAndHug(block);
  });
  return section;
}

// 1.10 FLUXOS DE TELA
// Padrão visual da Ficha (2026-10-05): diagrama por jornada -- caixas com o
// nome real de cada tela, Início/Fim como círculos ligados à tela marcada,
// setas na cor/tracejado da conexão e decisões como losangos numerados, com
// o texto completo listado abaixo. Layout calculado em
// shared/flow-diagram-layout.js (mesma função da Ficha HTML). Nomes das
// telas lidos do canvas na geração; os resolvidos voltam para a UI
// (flows-names-resolved) para a Ficha HTML usar os mesmos nomes.
async function _hdFlowNodeNames(flows) {
  const names = {};
  for (const f of flows) {
    for (const [id, stored] of [[f.sourceId, f.sourceName], [f.targetId, f.targetName]]) {
      if (!id || names[id]) continue;
      let n = null;
      try { n = await figma.getNodeByIdAsync(id); } catch (e) { n = null; }
      names[id] = (n && n.name) || stored || 'Tela removida';
    }
  }
  return names;
}

function _hdFlowVector(parent, d, o) {
  const v = figma.createVector();
  v.name = o.name || 'Linha';
  parent.appendChild(v);
  v.x = 0; v.y = 0;
  v.vectorPaths = [{ windingRule: "NONZERO", data: d }];
  v.strokes = o.stroke ? [{ type: "SOLID", color: hexToRgb(o.stroke) }] : [];
  v.strokeWeight = o.sw || 1.5;
  if (o.dashed) v.dashPattern = [4, 4];
  v.fills = o.fill ? [{ type: "SOLID", color: hexToRgb(o.fill) }] : [];
  return v;
}

function _hdFlowArrowHead(parent, a, b, color) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len, L = 8, W = 4.5;
  const bx = b.x - ux * L, by = b.y - uy * L;
  const p1 = `${bx + -uy * W} ${by + ux * W}`, p2 = `${bx - -uy * W} ${by - ux * W}`;
  _hdFlowVector(parent, `M ${b.x} ${b.y} L ${p1} L ${p2} Z`, { name: 'Seta', fill: color });
}

function _hdBuildFlowDiagram(lay) {
  const box = figma.createFrame();
  box.name = `[Diagrama] ${lay.title}`;
  box.resize(Math.max(1, Math.round(lay.width)), Math.max(1, Math.round(lay.height)));
  box.fills = [{ type: "SOLID", color: hexToRgb(_DS.gray) }];
  box.cornerRadius = 8;
  box.clipsContent = false;

  lay.edges.forEach(e => {
    const pts = e.points;
    _hdFlowVector(box, 'M ' + pts.map(p => `${p.x} ${p.y}`).join(' L '), { name: 'Conexão', stroke: e.color, dashed: e.dashed });
    _hdFlowArrowHead(box, pts[pts.length - 2], pts[pts.length - 1], e.color);
  });
  lay.events.forEach(ev => {
    _hdFlowVector(box, `M ${ev.line[0].x} ${ev.line[0].y} L ${ev.line[1].x} ${ev.line[1].y}`, { name: ev.kind === 'start' ? 'Linha Início' : 'Linha Fim', stroke: _DS.text2 });
    _hdFlowArrowHead(box, ev.line[0], ev.line[1], _DS.text2);
    const c = figma.createEllipse();
    c.name = ev.kind === 'start' ? 'Início' : 'Fim';
    c.resize(ev.r * 2, ev.r * 2);
    box.appendChild(c);
    c.x = ev.cx - ev.r; c.y = ev.cy - ev.r;
    c.fills = [{ type: "SOLID", color: hexToRgb(_DS.white) }];
    c.strokes = [{ type: "SOLID", color: hexToRgb(_DS.text) }];
    c.strokeWeight = ev.kind === 'start' ? 1.5 : 3.5;
  });
  lay.boxes.forEach(b => {
    const f = _dsFrame(`Tela | ${b.name}`, "VERTICAL", { pad: 8, fill: _DS.white, stroke: _DS.panelBorder, radius: 8 });
    f.primaryAxisSizingMode = "FIXED"; f.counterAxisSizingMode = "FIXED";
    f.resize(b.w, b.h);
    f.primaryAxisAlignItems = "CENTER"; f.counterAxisAlignItems = "CENTER";
    box.appendChild(f);
    f.x = b.x; f.y = b.y;
    const t = _dsText(b.name, { size: 12, lh: 16, w: "semibold" });
    t.textAlignHorizontal = "CENTER";
    f.appendChild(t);
    try { t.layoutSizingHorizontal = "FILL"; t.textAutoResize = "HEIGHT"; t.textTruncation = "ENDING"; t.maxLines = 2; } catch (e) {}
  });
  lay.edges.forEach(e => {
    if (!e.decision) return;
    const d = e.decision, h = 11;
    if (d.kind === 'label') {
      // Etiqueta da conexão (Sequência/Mensagem com texto): retângulo arredondado.
      _hdFlowVector(box, `M ${d.x - 10} ${d.y - 9} L ${d.x + 10} ${d.y - 9} L ${d.x + 10} ${d.y + 9} L ${d.x - 10} ${d.y + 9} Z`, { name: `Texto ${d.n}`, stroke: e.color, fill: _DS.white });
    } else {
      _hdFlowVector(box, `M ${d.x} ${d.y - h} L ${d.x + h} ${d.y} L ${d.x} ${d.y + h} L ${d.x - h} ${d.y} Z`, { name: `Decisão ${d.n}`, stroke: e.color, fill: _DS.white });
    }
    const t = _dsText(String(d.n), { size: 10, lh: 12, w: "bold", color: e.color });
    box.appendChild(t);
    t.x = Math.round(d.x - t.width / 2); t.y = Math.round(d.y - t.height / 2);
  });
  return box;
}

async function _hdRebuildFlowsSection(flows) {
  const _flows = flows || [];
  if (_flows.length === 0) return null;
  const flowsSection = _hdBuildSectionShell("Conexões entre telas");
  if (_hdStyled()) {
    const names = await _hdFlowNodeNames(_flows);
    try { figma.ui.postMessage({ type: 'flows-names-resolved', names }); } catch (e) {}
    const journeys = hdFlowDiagramLayout(_flows, id => names[id] || 'Tela', 856);
    journeys.forEach(lay => {
      const title = _dsText(lay.title, { size: 16, lh: 24, w: "semibold" });
      flowsSection.appendChild(title);
      _dsFillW(title);
      const diagram = _hdBuildFlowDiagram(lay);
      diagram.setPluginData('handexFlowJourney', lay.title);
      flowsSection.appendChild(diagram);
      if (lay.decisions.length > 0) {
        _hdDsTable(flowsSection, `Conexões ${lay.title}`, [{ title: "#", w: 48 }, { title: "Tipo", w: 150 }, { title: "Caminho", w: 300 }, { title: "Texto" }],
          lay.decisions.map(d => [{ text: String(d.n), w: "semibold" }, _HD_FLOW_TYPE_LABEL[d.type] || d.type || "—", `${d.from} → ${d.to}`, d.text || "—"]));
      }
    });
    return flowsSection;
  }
  _flows.forEach((flow, fi) => {
    const fRow = _hdBuildFlowCard(flow, fi);
    flowsSection.appendChild(fRow);
    _hdSetFillAndHug(fRow);
  });
  return flowsSection;
}

// CARD 3 -- USER INTERFACE: itens do scan declarados manualmente como
// "Componente Personalizado" (item.isMarkedCustom), com todas as propriedades
// já capturadas pelo scan (item.properties). Seção "User Interface" na coluna
// única da Ficha (dentro de Handex | Content, logo após Frames Escaneados),
// com um card empilhado por item. Retorna a seção (null se nada a mostrar).
const _HD_UI_COLUMN_PREFIX = "[User Interface] ";
const _HD_UI_TOKENIZED_TYPES = ["color", "stroke", "spacing", "strokeWeight", "radius", "typography", "effect"];

// token · valor quando há token real (mesmo formato do card da Spec
// Detalhada). No scan, `name` já vem como o nome do token (variável/estilo)
// ou, sem token, repete o próprio valor -- por isso o token só é considerado
// quando há variableKey/styleKey/key.
function _hdFormatScanProp(p) {
  const hasToken = _HD_UI_TOKENIZED_TYPES.includes(p.type) && !!(p.variableKey || p.styleKey || p.key);
  let val = p.value != null ? String(p.value) : "";
  if (p.type === "typography") val = typeof p.rawValue === "number" ? `${p.rawValue}px` : "";
  if (hasToken) return val && val !== p.name ? `${p.name} · ${val}` : String(p.name);
  if (p.type === "typography") return String(p.name || "");
  return val || String(p.name || "");
}

// Linha "RÓTULO  valor" usada no card User Interface (item e elementos internos).
function _hdAddUiPropRow(parent, label, text, hasToken, size) {
  const row = _hdCreateFrame("HORIZONTAL", 0, 12);
  row.name = `Prop/${label}`;
  parent.appendChild(row);
  _hdSetFillAndHug(row);

  const lbl = _hdCreateText(String(label).toUpperCase(), size - 1 < 9 ? 9 : size - 1, "Medium", { r: 0.3922, g: 0.4549, b: 0.4784 });
  lbl.resize(150, lbl.height);
  lbl.textAutoResize = "HEIGHT";
  row.appendChild(lbl);

  const valTxt = _hdCreateText(text, size, "Bold", hasToken ? hexToRgb("#005ca9") : { r: 0.1333, g: 0.1608, b: 0.1804 });
  row.appendChild(valTxt);
  valTxt.layoutGrow = 1;
  valTxt.textAutoResize = "HEIGHT";
}

// ─── Card "User Interface": leitura VIVA do nó marcado ───────────────────────
// Persona: dev de UI que vai CONSTRUIR o item sem abrir o Figma. Em vez de
// repetir item.properties (foto do scan, com ruído de PROP:/ids), o card lê
// o nó direto do canvas -- só itens marcados, poucos -- e organiza em grupos
// na ordem "O que é? > Como se organiza? > Como se parece? > O que muda? >
// De que é feito?". Cada leitura é protegida por _hdUiSafe: falha omite o
// grupo, nunca quebra a Ficha. Lê pelo leitor único _readNodeSpec (o mesmo da
// Anotação e da Detalhada). Sem findAll: só children direto, com os tetos abaixo.
const _HD_UI_COMP_MAX_DEPTH = 4;
const _HD_UI_COMP_MAX_NODES = 40;
const _HD_UI_PRIMITIVE_TYPES = ["VECTOR", "BOOLEAN_OPERATION", "ELLIPSE", "RECTANGLE", "LINE", "STAR", "POLYGON"];
const _HD_UI_IMG_MAX_W = 848;
const _HD_UI_IMG_MAX_H = 420;
const _HD_UI_IMG_MAX_CARDS = 12;
const _HD_UI_MAX_LINES = 25;
const _HD_UI_VARIANT_SCAN_MAX = 60;
let _hdUiImageCount = 0;

const _HD_UI_TYPE_PT = {
  FRAME: "Frame", GROUP: "Grupo", INSTANCE: "Instância de componente", COMPONENT: "Componente",
  COMPONENT_SET: "Conjunto de variantes", TEXT: "Texto", SECTION: "Seção"
};

async function _hdUiSafe(fn, fallback) {
  try { return await fn(); } catch (e) { return fallback; }
}
function _hdUiRow(label, text, token) { return { label, text: String(text), token: !!token }; }
function _hdUiPx(v) { return `${Math.round(v * 100) / 100}px`; }
function _hdUiTok(tok, val) { return tok && tok !== val ? `${tok} · ${val}` : val; }
function _hdUiCleanProp(name) { return String(name).split("#")[0]; }

// ═══════════════════════════════════════════════════════════════════════
// VOCABULÁRIO (HD_GLOSSARY) E LEITOR ÚNICO DE PROPRIEDADES (_readNodeSpec)
// ═══════════════════════════════════════════════════════════════════════
// Regra de produto (2026-10-01): comunicação em português (títulos de grupo,
// frases, avisos); nomenclatura técnica do Figma/CSS em inglês, como aparece
// no Dev Mode, sem traduzir. HD_GLOSSARY.labels é espelhado em HX_GLOSSARY
// (modules/core.js) -- os dois precisam ficar sincronizados. Toda linha
// emitida por _readNodeSpec carrega `key` estável, independente do rótulo.
//
// Desvios do Dev Mode (justificativa): "Primary / Counter axis" (key
// alignment) junta os dois eixos numa linha só na Especificação, que nunca
// teve linha por eixo; "Width (sizing)"/"Height (sizing)" separam o modo
// (Fixed/Hug contents/Fill container) do valor em px, que o Dev Mode mostra
// numa linha só ("Fixed 360px"); o card da Ficha recompõe como Dev Mode.
const HD_GLOSSARY = {
  groups: {
    summary: "Resumo", diff: "Diferenças em relação à lib", layout: "Layout", appearance: "Aparência",
    text: "Texto", states: "Estados e variantes", interactions: "Interações",
    composition: "Composição interna", config: "Configuração do componente"
  },
  labels: {
    direction: "Auto layout", primaryAxis: "Primary axis", counterAxis: "Counter axis", alignment: "Primary / Counter axis",
    gap: "Gap", rowGap: "Row gap", padding: "Padding",
    paddingTop: "Padding Top", paddingRight: "Padding Right", paddingBottom: "Padding Bottom", paddingLeft: "Padding Left",
    width: "Width", height: "Height", sizingW: "Width (sizing)", sizingH: "Height (sizing)", dimensions: "Width × Height",
    minWidth: "Min width", maxWidth: "Max width", minHeight: "Min height", maxHeight: "Max height",
    position: "Position", clip: "Clip content", rotation: "Rotation",
    fill: "Fill", stroke: "Border color", strokeWidth: "Border width", strokePosition: "Border position", dash: "Dash",
    radius: "Radius", smoothing: "Corner smoothing", opacity: "Opacity", blend: "Blend mode",
    textStyle: "Text style", typography: "Text style", fontFamily: "Font family", fontWeight: "Font style", fontSize: "Font size",
    lineHeight: "Line height", letterSpacing: "Letter spacing", textAlign: "Text align", textAlignVertical: "Text align vertical",
    textDecoration: "Text decoration", textCase: "Text case", truncate: "Truncate text", maxLines: "Max lines",
    component: "Component", componentProps: "Component properties", swap: "Instance swap"
  },
  // Rótulos antigos persistidos (scan, specs e Anotação salvos) -> rótulo atual.
  aliases: {
    "Cor (Fill)": "Fill", "Contorno": "Border color", "Cor (Stroke)": "Border color", "Border Color": "Border color",
    "Border Width": "Border width", "Espessura de borda": "Border width",
    "Raio de borda": "Radius", "Raio": "Radius",
    "Espaçamento (Gap)": "Gap", "Gap (eixo cruzado)": "Row gap",
    "Padding Interno": "Padding",
    "Tipografia": "Text style", "Text Style": "Text style", "Família": "Font family", "Peso": "Font style", "Tamanho da fonte": "Font size",
    "Direção": "Auto layout", "Alinhamento": "Primary / Counter axis",
    "Altura": "Height", "Largura": "Width", "Dimensões": "Width × Height",
    "W Sizing": "Width (sizing)", "H Sizing": "Height (sizing)", "Sizing Largura": "Width (sizing)", "Sizing Altura": "Height (sizing)",
    "Componente": "Component", "Subcomponente trocado": "Instance swap",
    "Effect (Sombra)": "Effect", "Effect (Blur)": "Effect"
  },
  sizing: { FIXED: "Fixed", HUG: "Hug contents", FILL: "Fill container" },
  axis: { MIN: "Min", CENTER: "Center", MAX: "Max", SPACE_BETWEEN: "Space between", BASELINE: "Baseline" },
  strokeAlign: { INSIDE: "Inside", OUTSIDE: "Outside", CENTER: "Center" },
  effects: { DROP_SHADOW: "Drop shadow", INNER_SHADOW: "Inner shadow", LAYER_BLUR: "Layer blur", BACKGROUND_BLUR: "Background blur" },
  constraintsH: { MIN: "Left", MAX: "Right", CENTER: "Center", STRETCH: "Left & Right", SCALE: "Scale" },
  constraintsV: { MIN: "Top", MAX: "Bottom", CENTER: "Center", STRETCH: "Top & Bottom", SCALE: "Scale" },
  propTypes: { VARIANT: "Variant", BOOLEAN: "Boolean", INSTANCE_SWAP: "Instance swap", TEXT: "Text" },
  triggers: {
    ON_CLICK: "On click", ON_HOVER: "While hovering", ON_PRESS: "While pressing", ON_DRAG: "On drag",
    AFTER_TIMEOUT: "After delay", MOUSE_ENTER: "Mouse enter", MOUSE_LEAVE: "Mouse leave",
    MOUSE_UP: "Mouse up", MOUSE_DOWN: "Mouse down", ON_KEY_DOWN: "Key/Gamepad",
    ON_MEDIA_HIT: "Media hit", ON_MEDIA_END: "Media ended"
  },
  navigation: {
    NAVIGATE: "Navigate to", OVERLAY: "Open overlay", SWAP: "Swap overlay",
    SCROLL_TO: "Scroll to", CHANGE_TO: "Change to"
  },
  transitions: {
    INSTANT: "Instant", DISSOLVE: "Dissolve", SMART_ANIMATE: "Smart animate", MOVE_IN: "Move in", MOVE_OUT: "Move out",
    PUSH: "Push", SLIDE_IN: "Slide in", SLIDE_OUT: "Slide out", SCROLL_ANIMATE: "Scroll animate"
  }
};

function _hdVocabLabel(label, key) {
  if (key && HD_GLOSSARY.labels[key]) return HD_GLOSSARY.labels[key];
  if (!label) return "";
  const s = String(label);
  if (HD_GLOSSARY.aliases[s]) return HD_GLOSSARY.aliases[s];
  if (s.startsWith("Prop: ")) return "Variant: " + s.slice(6);
  return s;
}

// Valores antigos persistidos (ex: scans anteriores) -> vocabulário atual.
const HD_VALUE_ALIASES = {
  "Hug Contents": "Hug contents", "Fill Container": "Fill container",
  DROP_SHADOW: "Drop shadow", INNER_SHADOW: "Inner shadow", LAYER_BLUR: "Layer blur", BACKGROUND_BLUR: "Background blur",
  MIN: "Min", CENTER: "Center", MAX: "Max", SPACE_BETWEEN: "Space between", BASELINE: "Baseline"
};

function _hdVocabValue(value) {
  if (typeof value !== "string") return value;
  if (HD_VALUE_ALIASES[value]) return HD_VALUE_ALIASES[value];
  if (/^[A-Z_]+ \/ [A-Z_]+$/.test(value)) return value.split(" / ").map(v => HD_VALUE_ALIASES[v] || v).join(" / ");
  return value;
}

const _SPEC_SIDES = [["Top", "strokeTopWeight"], ["Right", "strokeRightWeight"], ["Bottom", "strokeBottomWeight"], ["Left", "strokeLeftWeight"]];

function _specBoundId(b) { return Array.isArray(b) ? (b[0] && b[0].id) : (b && b.id); }

async function _specVarById(id, cache) {
  if (!id) return null;
  if (cache && cache.has(id)) return cache.get(id);
  let info = null;
  try {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) info = { name: v.name, key: v.key, remote: v.remote === true };
  } catch (e) {}
  if (cache) cache.set(id, info);
  return info;
}

async function _specNodeVar(n, field, cache) {
  return _specVarById(_specBoundId(n.boundVariables && n.boundVariables[field]), cache);
}

async function _specStyleById(id) {
  if (!id || typeof id !== "string") return null;
  try {
    const s = await figma.getStyleByIdAsync(id);
    return s ? { name: s.name, key: s.key, remote: s.remote === true } : null;
  } catch (e) { return null; }
}

// Nome do componente apontado por um id (INSTANCE_SWAP): o conjunto de
// variantes quando o alvo é uma variante, senão o próprio nome.
async function _specComponentName(id) {
  if (!id || typeof id !== "string") return null;
  try {
    const t = await figma.getNodeByIdAsync(id);
    if (!t) return null;
    return t.parent && t.parent.type === "COMPONENT_SET" ? t.parent.name : t.name;
  } catch (e) { return null; }
}

// Espessura de borda considerando os 4 lados. A Plugin API só tem binding
// de variável em strokeWeight (todos os lados) e em strokeTop/Right/Bottom/
// LeftWeight (VariableBindableNodeField); quando a borda é configurada POR
// LADO, a variável vive em boundVariables.strokeTopWeight etc. e
// boundVariables.strokeWeight fica vazio (bug do Tag, 2026-10-01: lia só
// strokeWeight e reportava "1px sem token"). Devolve null se não há espessura
// nem token; { uniform: true, rows: [1 linha] } se todos os lados têm o mesmo
// valor E o mesmo token; senão { uniform: false, rows: [lados com valor > 0
// ou com token] }. Lado com valor 0 e variável vinculada (ex: border/width/
// none) é mantido: é informação válida de conformidade.
async function _specStrokeWidths(n, cache) {
  if (!("strokeWeight" in n)) return null;
  const base = n.strokeWeight;
  const baseTok = await _specNodeVar(n, "strokeWeight", cache);
  const sides = [];
  for (const [side, f] of _SPEC_SIDES) {
    const hasSide = f in n;
    let v = hasSide ? n[f] : base;
    if (typeof v !== "number") v = typeof base === "number" ? base : null;
    if (v === null) continue;
    const info = (hasSide ? await _specNodeVar(n, f, cache) : null) || baseTok;
    sides.push({ side, value: v, info });
  }
  if (sides.length === 0) return null;
  const sig = (s) => `${s.value}|${s.info ? s.info.key : ""}`;
  if (sides.every(s => sig(s) === sig(sides[0]))) {
    const s = sides[0];
    return (s.value > 0 || s.info) ? { uniform: true, rows: [{ side: null, value: s.value, info: s.info }] } : null;
  }
  const rows = sides.filter(s => s.value > 0 || s.info);
  return rows.length ? { uniform: false, rows } : null;
}

function _specPx(v) { return `${Math.round(v * 100) / 100}px`; }
function _specHexA(c, opacity) {
  const hex = rgbToHex(c.r, c.g, c.b).toUpperCase();
  const a = typeof opacity === "number" ? opacity : (typeof c.a === "number" ? c.a : 1);
  return a < 1 ? `${hex} · ${Math.round(a * 100)}%` : hex;
}

async function _specDescribePaint(p, style, cache) {
  if (p.type === "SOLID" && p.color) {
    const v = await _specVarById(p.boundVariables && p.boundVariables.color && p.boundVariables.color.id, cache);
    return { value: _specHexA(p.color, p.opacity), tok: v || style, raw: { paintType: "SOLID", hex: rgbToHex(p.color.r, p.color.g, p.color.b).toUpperCase(), opacity: typeof p.opacity === "number" ? p.opacity : 1 } };
  }
  if (typeof p.type === "string" && p.type.startsWith("GRADIENT_")) {
    const kind = { GRADIENT_LINEAR: "Linear", GRADIENT_RADIAL: "Radial", GRADIENT_ANGULAR: "Angular", GRADIENT_DIAMOND: "Diamond" }[p.type] || "";
    const stops = (p.gradientStops || []).slice(0, 4).map(s => `${_specHexA(s.color)} ${Math.round(s.position * 100)}%`).join(" → ");
    return { value: `${kind} gradient: ${stops}`, tok: style, raw: { paintType: p.type } };
  }
  if (p.type === "IMAGE") return { value: `Image (${String(p.scaleMode || "").toLowerCase()})`, tok: null, raw: { paintType: "IMAGE" } };
  return { value: String(p.type), tok: null, raw: { paintType: p.type } };
}

// Leitor único das propriedades de um nó, neutro quanto a apresentação.
//   opts.level: 'quick' (só valores/tokens essenciais, Anotação) |
//     'essential' | 'full' (acrescentam eixos do auto layout, mín/máx,
//     posição, clip, rotação, posição/tracejado da borda, suavização,
//     opacidade, blend e detalhes de texto)
//   opts.include: { layout, appearance, text, componentProps } (default: todos)
//   opts.propKeys: filtro por categoria (cat), por key exata ou por prefixo
//     ('fill*'). Vazio = tudo. Categorias: dimensions, spacing, layout, fill,
//     border, radius, effect, appearance, typography, component, component-props
//   opts.solidOnly: só paints SOLID; opts.singleStroke: só o 1º stroke;
//   opts.componentPropTypes: ex. ['VARIANT']; opts.mainComp: componente
//     principal já resolvido (evita nova leitura)
// Devolve [{ group, cat, key, label, value, raw, token, tokenKey, libName, state }]
// com state 'token' | 'raw' | 'mixed' | 'zero-token' (valor 0 com variável
// vinculada: existe pra auditoria do scan; apresentação pode omitir).
// Composição interna (filhos) NÃO é lida aqui -- continua em
// _hdCollectUiComposition, que chama este leitor por filho.
async function _readNodeSpec(node, opts) {
  const o = opts || {};
  const inc = Object.assign({ layout: true, appearance: true, text: true, componentProps: true }, o.include || {});
  const ext = o.level === "essential" || o.level === "full";
  const G = HD_GLOSSARY;
  const cache = new Map();
  const rows = [];
  const allowed = (cat, key) => {
    const pk = o.propKeys;
    if (!pk || pk.length === 0) return true;
    return pk.some(k => k === cat || k === key || (k.endsWith("*") && key.startsWith(k.slice(0, -1))));
  };
  const add = (group, cat, key, value, raw, tok, label, state) => {
    if (!allowed(cat, key)) return;
    const tokenKey = tok && tok.key ? tok.key : null;
    rows.push({
      group, cat, key, label: label || G.labels[key] || key, value, raw,
      token: tok ? tok.name : null, tokenKey,
      libName: tokenKey ? _qsFindLibForKey(tokenKey) : null,
      state: state || (tok ? "token" : "raw")
    });
  };
  const nv = (f) => _specNodeVar(node, f, cache);

  if (inc.layout) {
    if ("layoutMode" in node) {
      const lm = node.layoutMode;
      if (lm === "NONE") {
        if (ext && node.children && node.children.length > 0) add("layout", "layout", "direction", "None", { layoutMode: lm });
      } else if (lm === "GRID") {
        add("layout", "layout", "direction", "Grid", { layoutMode: lm });
      } else {
        const wrap = "layoutWrap" in node && node.layoutWrap === "WRAP";
        add("layout", "layout", "direction", (lm === "HORIZONTAL" ? "Horizontal" : "Vertical") + (wrap ? " · Wrap" : ""), { layoutMode: lm, wrap });
        if (ext) {
          const horiz = lm === "HORIZONTAL";
          add("layout", "layout", "primaryAxis", G.axis[node.primaryAxisAlignItems] || String(node.primaryAxisAlignItems), { value: node.primaryAxisAlignItems, horizontal: horiz });
          add("layout", "layout", "counterAxis", G.axis[node.counterAxisAlignItems] || String(node.counterAxisAlignItems), { value: node.counterAxisAlignItems, horizontal: horiz });
        }
        if (typeof node.itemSpacing === "number") {
          const tok = await nv("itemSpacing");
          if (node.itemSpacing > 0 || tok) add("layout", "spacing", "gap", _specPx(node.itemSpacing), { value: node.itemSpacing, spaceBetween: node.primaryAxisAlignItems === "SPACE_BETWEEN" }, tok, null, node.itemSpacing > 0 ? null : "zero-token");
        }
        if (ext && wrap && typeof node.counterAxisSpacing === "number") {
          const tok = await nv("counterAxisSpacing");
          if (node.counterAxisSpacing > 0 || tok) add("layout", "spacing", "rowGap", _specPx(node.counterAxisSpacing), { value: node.counterAxisSpacing }, tok, null, node.counterAxisSpacing > 0 ? null : "zero-token");
        }
        for (const [side, f] of [["Top", "paddingTop"], ["Right", "paddingRight"], ["Bottom", "paddingBottom"], ["Left", "paddingLeft"]]) {
          const v = typeof node[f] === "number" ? node[f] : 0;
          const tok = await nv(f);
          if (v > 0 || tok) add("layout", "spacing", f, _specPx(v), { value: v, side }, tok, null, v > 0 ? null : "zero-token");
        }
      }
    }
    if ("width" in node && typeof node.width === "number") add("layout", "dimensions", "width", `${Math.round(node.width)}px`, { value: node.width }, await nv("width"));
    if ("height" in node && typeof node.height === "number") add("layout", "dimensions", "height", `${Math.round(node.height)}px`, { value: node.height }, await nv("height"));
    if (node.type !== "PAGE" && node.parent && node.parent.type !== "PAGE") {
      let sh = null, sv = null;
      try {
        if (typeof node.layoutSizingHorizontal === "string") sh = node.layoutSizingHorizontal;
        if (typeof node.layoutSizingVertical === "string") sv = node.layoutSizingVertical;
      } catch (e) {}
      if (!sh || !sv) {
        const parent = node.parent;
        sh = "FIXED"; sv = "FIXED";
        if (parent.layoutMode === "HORIZONTAL" && node.layoutGrow === 1) sh = "FILL";
        else if (parent.layoutMode === "VERTICAL" && node.layoutAlign === "STRETCH") sh = "FILL";
        else if (node.layoutMode && ((node.layoutMode === "HORIZONTAL" && node.primaryAxisSizingMode === "AUTO") || (node.layoutMode === "VERTICAL" && node.counterAxisSizingMode === "AUTO"))) sh = "HUG";
        if (parent.layoutMode === "VERTICAL" && node.layoutGrow === 1) sv = "FILL";
        else if (parent.layoutMode === "HORIZONTAL" && node.layoutAlign === "STRETCH") sv = "FILL";
        else if (node.layoutMode && ((node.layoutMode === "VERTICAL" && node.primaryAxisSizingMode === "AUTO") || (node.layoutMode === "HORIZONTAL" && node.counterAxisSizingMode === "AUTO"))) sv = "HUG";
      }
      add("layout", "dimensions", "sizingW", G.sizing[sh] || sh, { value: sh });
      add("layout", "dimensions", "sizingH", G.sizing[sv] || sv, { value: sv });
    }
    if (ext) {
      for (const f of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
        if (typeof node[f] === "number") add("layout", "layout", f, _specPx(node[f]), { value: node[f] });
      }
      if (node.layoutPositioning === "ABSOLUTE") {
        const c = node.constraints;
        const anc = c ? `\nConstraints: ${G.constraintsH[c.horizontal] || c.horizontal} / ${G.constraintsV[c.vertical] || c.vertical}` : "";
        add("layout", "layout", "position", `Absolute (ignores auto layout)${anc}`, { constraints: c || null });
      }
      if ("clipsContent" in node && node.clipsContent && node.children && node.children.length > 0) add("layout", "layout", "clip", "On", { value: true });
      if (typeof node.rotation === "number" && Math.round(node.rotation) !== 0) add("layout", "layout", "rotation", `${Math.round(node.rotation * 100) / 100}°`, { value: node.rotation });
    }
  }

  if (inc.appearance) {
    if ("fills" in node) {
      if (node.fills === figma.mixed) {
        add("appearance", "fill", "fill", "Mixed", { mixed: true }, null, null, "mixed");
      } else if (Array.isArray(node.fills)) {
        const style = await _specStyleById("fillStyleId" in node ? node.fillStyleId : null);
        let vis = node.fills.filter(f => f && f.visible !== false);
        if (o.solidOnly) vis = vis.filter(f => f.type === "SOLID" && f.color);
        for (const [i, f] of vis.entries()) {
          const d = await _specDescribePaint(f, style, cache);
          add("appearance", "fill", i === 0 ? "fill" : `fill-${i + 1}`, d.value, d.raw, d.tok, i === 0 ? null : `Fill ${i + 1}`);
        }
      }
    }

    if ("strokes" in node && Array.isArray(node.strokes)) {
      let vis = node.strokes.filter(s => s && s.visible !== false && (s.opacity === undefined || s.opacity > 0));
      if (o.solidOnly) vis = vis.filter(s => s.type === "SOLID" && s.color);
      const sw = vis.length ? await _specStrokeWidths(node, cache) : null;
      if (sw) {
        const style = await _specStyleById("strokeStyleId" in node ? node.strokeStyleId : null);
        for (const [i, s] of (o.singleStroke ? vis.slice(0, 1) : vis).entries()) {
          const d = await _specDescribePaint(s, style, cache);
          add("appearance", "border", i === 0 ? "stroke" : `stroke-${i + 1}`, d.value, d.raw, d.tok, i === 0 ? null : `Border color ${i + 1}`);
        }
        for (const r of sw.rows) {
          add("appearance", "border", r.side ? `strokeWidth${r.side}` : "strokeWidth", _specPx(r.value), { value: r.value, side: r.side }, r.info, r.side ? `Border width ${r.side}` : null, r.value > 0 ? null : "zero-token");
        }
        if (ext) {
          if (node.strokeAlign) add("appearance", "border", "strokePosition", G.strokeAlign[node.strokeAlign] || node.strokeAlign, { value: node.strokeAlign });
          if (Array.isArray(node.dashPattern) && node.dashPattern.length > 0) add("appearance", "border", "dash", node.dashPattern.join(", "), { value: node.dashPattern });
        }
      }
    }

    if ("cornerRadius" in node) {
      if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
        const tok = (await nv("topLeftRadius")) || (await nv("cornerRadius"));
        add("appearance", "radius", "radius", _specPx(node.cornerRadius), { value: node.cornerRadius }, tok);
      } else if (node.cornerRadius === figma.mixed) {
        const parts = [];
        let firstTok = null;
        for (const [k, f] of [["Top left", "topLeftRadius"], ["Top right", "topRightRadius"], ["Bottom right", "bottomRightRadius"], ["Bottom left", "bottomLeftRadius"]]) {
          const tok = await nv(f);
          if (tok && !firstTok) firstTok = tok;
          parts.push(`${k} ${tok ? tok.name + " · " : ""}${_specPx(node[f] || 0)}`);
        }
        add("appearance", "radius", "radius", parts.join("\n"), { mixed: true }, firstTok, null, "mixed");
      }
      if (ext && typeof node.cornerSmoothing === "number" && node.cornerSmoothing > 0) add("appearance", "radius", "smoothing", `${Math.round(node.cornerSmoothing * 100)}%`, { value: node.cornerSmoothing });
    }

    if ("effects" in node && Array.isArray(node.effects)) {
      const vis = node.effects.filter(e => e && e.visible !== false);
      const style = vis.length ? await _specStyleById("effectStyleId" in node ? node.effectStyleId : null) : null;
      for (const [i, e] of vis.entries()) {
        const tok = style || (await _specVarById(e.boundVariables && e.boundVariables.radius && e.boundVariables.radius.id, cache));
        let value;
        if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
          const off = e.offset || { x: 0, y: 0 };
          value = `X ${_specPx(off.x)} · Y ${_specPx(off.y)} · Blur ${_specPx(e.radius || 0)} · Spread ${_specPx(e.spread || 0)} · Color ${_specHexA(e.color || { r: 0, g: 0, b: 0, a: 1 })}`;
        } else {
          value = `Blur ${_specPx(e.radius || 0)}`;
        }
        add("appearance", "effect", `effect-${i}`, value, { effectType: e.type }, tok, G.effects[e.type] || String(e.type));
      }
    }

    if (ext) {
      if (typeof node.opacity === "number" && node.opacity < 1) add("appearance", "appearance", "opacity", `${Math.round(node.opacity * 100)}%`, { value: node.opacity });
      if (node.blendMode && node.blendMode !== "NORMAL" && node.blendMode !== "PASS_THROUGH") {
        const bm = String(node.blendMode).toLowerCase().replace(/_/g, " ");
        add("appearance", "appearance", "blend", bm.charAt(0).toUpperCase() + bm.slice(1), { value: node.blendMode });
      }
    }
  }

  if (inc.text && node.type === "TEXT") {
    const m = figma.mixed;
    const style = await _specStyleById(node.textStyleId !== m ? node.textStyleId : null);
    const sizeTok = await nv("fontSize");
    const hasFont = node.fontName !== m && node.fontName;
    if (style) add("text", "typography", "textStyle", style.name, { value: style.name }, style);
    add("text", "typography", "fontFamily", hasFont ? node.fontName.family : "Mixed", { value: hasFont ? node.fontName.family : null });
    add("text", "typography", "fontWeight", hasFont ? node.fontName.style : "Mixed", { value: hasFont ? node.fontName.style : null });
    add("text", "typography", "fontSize", typeof node.fontSize === "number" ? _specPx(node.fontSize) : "Mixed", { value: typeof node.fontSize === "number" ? node.fontSize : null }, sizeTok);
    if (ext) {
      if (node.lineHeight !== m && node.lineHeight) {
        const lh = node.lineHeight;
        add("text", "typography", "lineHeight", lh.unit === "AUTO" ? "Auto" : (lh.unit === "PERCENT" ? `${Math.round(lh.value * 10) / 10}%` : _specPx(lh.value)), { unit: lh.unit, value: lh.value }, await nv("lineHeight"));
      }
      if (node.letterSpacing !== m && node.letterSpacing && node.letterSpacing.value !== 0) {
        const ls = node.letterSpacing;
        add("text", "typography", "letterSpacing", ls.unit === "PERCENT" ? `${Math.round(ls.value * 100) / 100}%` : _specPx(ls.value), { unit: ls.unit, value: ls.value }, await nv("letterSpacing"));
      }
      if (node.textAlignHorizontal) add("text", "typography", "textAlign", { LEFT: "Left", CENTER: "Center", RIGHT: "Right", JUSTIFIED: "Justified" }[node.textAlignHorizontal] || node.textAlignHorizontal, { value: node.textAlignHorizontal });
      if (node.textAlignVertical && node.textAlignVertical !== "TOP") add("text", "typography", "textAlignVertical", { CENTER: "Center", BOTTOM: "Bottom" }[node.textAlignVertical] || node.textAlignVertical, { value: node.textAlignVertical });
      if (node.textDecoration && node.textDecoration !== m && node.textDecoration !== "NONE") add("text", "typography", "textDecoration", node.textDecoration === "UNDERLINE" ? "Underline" : "Strikethrough", { value: node.textDecoration });
      if (node.textCase && node.textCase !== m && node.textCase !== "ORIGINAL") {
        add("text", "typography", "textCase", { UPPER: "Upper", LOWER: "Lower", TITLE: "Title", SMALL_CAPS: "Small caps", SMALL_CAPS_FORCED: "Small caps" }[node.textCase] || node.textCase, { value: node.textCase });
      }
      if (node.textTruncation === "ENDING") {
        add("text", "typography", "truncate", "Ending", { value: "ENDING" });
        if (typeof node.maxLines === "number") add("text", "typography", "maxLines", String(node.maxLines), { value: node.maxLines });
      }
    }
  }

  if (inc.componentProps && node.type === "INSTANCE") {
    let main = o.mainComp || null;
    if (!main) { try { main = await node.getMainComponentAsync(); } catch (e) {} }
    if (main && allowed("component", "component")) {
      const key = main.key || null;
      rows.push({
        group: "componentProps", cat: "component", key: "component", label: G.labels.component, value: main.name,
        raw: { key, family: main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name },
        token: null, tokenKey: key, libName: key ? _qsFindLibForKey(key) : null, state: "raw"
      });
    }
    const cp = node.componentProperties;
    if (cp && allowed("component-props", "prop:")) {
      let defs = null;
      try {
        const holder = main && main.parent && main.parent.type === "COMPONENT_SET" ? main.parent : main;
        defs = holder ? holder.componentPropertyDefinitions || null : null;
      } catch (e) {}
      for (const [k, p] of Object.entries(cp)) {
        if (o.componentPropTypes && !o.componentPropTypes.includes(p.type)) continue;
        const name = _hdUiCleanProp(k);
        const def = defs && defs[k];
        let value = String(p.value);
        if (p.type === "INSTANCE_SWAP") value = (await _specComponentName(p.value)) || "(componente da biblioteca)";
        const state = def ? (def.defaultValue === p.value ? "default" : "changed") : "raw";
        rows.push({
          group: "componentProps", cat: "component-props", key: `prop:${name}`,
          label: `${G.propTypes[p.type] || p.type}: ${name}`, value,
          raw: { type: p.type, name, value: p.value, defaultValue: def ? def.defaultValue : undefined },
          token: null, tokenKey: null, libName: null, state
        });
      }
    }
  }
  return rows;
}

// Ordena as linhas do leitor por categoria (estável); categorias fora da lista
// vão pro fim, na ordem original.
function _specSortByCat(rows, order) {
  const idx = (r) => { const i = order.indexOf(r.cat); return i < 0 ? order.length : i; };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (idx(a.r) - idx(b.r)) || (a.i - b.i)).map(x => x.r);
}

async function _hdUiLayoutRows(n, compact, essential) {
  const spec = await _readNodeSpec(n, { level: essential ? "essential" : "full", include: { layout: true, appearance: false, text: false, componentProps: false } });
  const by = {};
  spec.forEach(r => { by[r.key] = r; });
  const L = HD_GLOSSARY.labels;
  const rows = [];
  const dir = by.direction;
  if (dir) {
    if (dir.raw.layoutMode === "NONE") {
      if (!compact && !essential) rows.push(_hdUiRow(L.direction, "Sem auto layout (posicionamento livre)"));
    } else {
      rows.push(_hdUiRow(L.direction, dir.value));
      if (by.primaryAxis && !(essential && by.primaryAxis.raw.value === "MIN")) rows.push(_hdUiRow(L.primaryAxis, by.primaryAxis.value));
      if (by.counterAxis && !(essential && by.counterAxis.raw.value === "MIN")) rows.push(_hdUiRow(L.counterAxis, by.counterAxis.value));
      if (by.gap && by.gap.raw.value > 0 && !by.gap.raw.spaceBetween) rows.push(_hdUiRow(L.gap, _hdUiTok(by.gap.token, by.gap.value), by.gap.token));
      if (by.rowGap && by.rowGap.raw.value > 0) rows.push(_hdUiRow(L.rowGap, _hdUiTok(by.rowGap.token, by.rowGap.value), by.rowGap.token));
      const sides = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].map(f => {
        const r = by[f];
        return r ? { v: r.raw.value, tok: r.token, text: _hdUiTok(r.token, r.value) } : { v: 0, tok: null, text: "0px" };
      });
      if (sides.some(s => s.v > 0)) {
        const [t, r, b, l] = sides.map(s => s.text);
        const text = (t === r && r === b && b === l) ? `${t} (all sides)` : `Top ${t}\nRight ${r}\nBottom ${b}\nLeft ${l}`;
        rows.push(_hdUiRow(L.padding, text, sides.some(s => s.tok)));
      }
    }
  }
  const sw = by.sizingW, sh = by.sizingH;
  if (sw && sh) {
    const fixedBoth = sw.raw.value === "FIXED" && sh.raw.value === "FIXED";
    const hugBoth = sw.raw.value === "HUG" && sh.raw.value === "HUG";
    if (!((compact && fixedBoth) || (essential && hugBoth))) {
      const fmt = (s, dim) => s.raw.value === "FIXED" && dim ? `Fixed ${dim.value}` : s.value;
      rows.push(_hdUiRow(L.width, fmt(sw, by.width), by.width && by.width.token));
      rows.push(_hdUiRow(L.height, fmt(sh, by.height), by.height && by.height.token));
    }
  }
  for (const f of ["minWidth", "maxWidth", "minHeight", "maxHeight"]) {
    if (by[f]) rows.push(_hdUiRow(L[f], by[f].value));
  }
  if (by.position) rows.push(_hdUiRow(L.position, by.position.value));
  if (!compact && by.clip) rows.push(_hdUiRow(L.clip, by.clip.value));
  if (by.rotation) rows.push(_hdUiRow(L.rotation, by.rotation.value));
  return rows;
}

async function _hdUiAppearanceRows(n, essential) {
  const spec = await _readNodeSpec(n, { level: essential ? "essential" : "full", include: { layout: false, appearance: true, text: false, componentProps: false } });
  const L = HD_GLOSSARY.labels;
  const tx = (r) => _hdUiTok(r.token, r.value);
  const rows = [];
  const sideRows = spec.filter(r => r.key.startsWith("strokeWidth") && r.raw && r.raw.side);
  const smooth = spec.find(r => r.key === "smoothing");
  let sideDone = false;
  for (const r of spec) {
    if (r.cat === "fill") {
      if (n.type === "TEXT") continue;
      rows.push(_hdUiRow(r.label, tx(r), r.token));
    } else if (r.key === "stroke" || r.key.startsWith("stroke-")) {
      rows.push(_hdUiRow(r.label, tx(r), r.token));
    } else if (r.key === "strokeWidth") {
      rows.push(_hdUiRow(L.strokeWidth, tx(r), r.token));
    } else if (r.key.startsWith("strokeWidth")) {
      if (sideDone) continue;
      sideDone = true;
      rows.push(_hdUiRow(L.strokeWidth, sideRows.map(s => `${s.raw.side} ${tx(s)}`).join("\n"), sideRows.some(s => s.token)));
    } else if (r.key === "strokePosition") {
      if (!(essential && r.raw.value === "INSIDE")) rows.push(_hdUiRow(L.strokePosition, r.value));
    } else if (r.key === "dash") {
      rows.push(_hdUiRow(L.dash, r.value));
    } else if (r.key === "radius") {
      rows.push(_hdUiRow(L.radius, (r.state === "mixed" ? r.value : tx(r)) + (smooth ? ` · ${L.smoothing} ${smooth.value}` : ""), r.token));
    } else if (r.cat === "effect") {
      rows.push(_hdUiRow(r.label, tx(r), r.token));
    } else if (r.key === "opacity") {
      rows.push(_hdUiRow(L.opacity, r.value));
    } else if (r.key === "blend") {
      rows.push(_hdUiRow(L.blend, r.value));
    }
  }
  return rows;
}

async function _hdUiTextRows(n, essential) {
  if (n.type !== "TEXT") return [];
  const spec = await _readNodeSpec(n, { level: essential ? "essential" : "full", include: { layout: false, appearance: false, text: true, componentProps: false } });
  const fills = await _readNodeSpec(n, { level: "quick", include: { layout: false, appearance: true, text: false, componentProps: false }, propKeys: ["fill"] });
  const by = {};
  spec.forEach(r => { by[r.key] = r; });
  const L = HD_GLOSSARY.labels;
  const rows = [];
  const font = `${by.fontFamily.value} ${by.fontWeight.value}`;
  const size = by.fontSize.value;
  const lh = !essential && by.lineHeight ? by.lineHeight.value : null;
  const ls = !essential && by.letterSpacing ? by.letterSpacing.value : null;
  if (by.textStyle) {
    rows.push(_hdUiRow(L.textStyle, `${by.textStyle.value} · ${font} ${size}${lh ? ` / ${lh}` : ""}${ls ? ` · Letter spacing ${ls}` : ""}`, true));
  } else {
    rows.push(_hdUiRow(L.fontFamily, by.fontFamily.value));
    rows.push(_hdUiRow(L.fontWeight, by.fontWeight.value));
    rows.push(_hdUiRow(L.fontSize, _hdUiTok(by.fontSize.token, size), by.fontSize.token));
    if (lh) rows.push(_hdUiRow(L.lineHeight, lh));
    if (ls) rows.push(_hdUiRow(L.letterSpacing, ls));
  }
  if (by.textAlign) rows.push(_hdUiRow(L.textAlign, by.textAlign.value));
  if (!essential) {
    for (const k of ["textAlignVertical", "textDecoration", "textCase"]) {
      if (by[k]) rows.push(_hdUiRow(L[k], by[k].value));
    }
    if (by.truncate) rows.push(_hdUiRow(L.truncate, `${by.truncate.value}${by.maxLines ? ` · ${L.maxLines} ${by.maxLines.value}` : ""}`));
  }
  for (const f of fills) rows.push(_hdUiRow(f.label, _hdUiTok(f.token, f.value), f.token));
  return rows;
}

async function _hdUiResolveName(id) {
  if (!id || typeof id !== "string") return null;
  try { const t = await figma.getNodeByIdAsync(id); return t ? t.name : null; } catch (e) { return null; }
}

// Itens "Configuração do componente": só o que foge do padrão da lib ou está
// ligado (BOOLEAN true), no formato `nome: valor` do Dev Mode.
async function _hdUiConfigItems(inst, mainComp) {
  const spec = await _readNodeSpec(inst, { level: "quick", include: { layout: false, appearance: false, text: false, componentProps: true }, mainComp, propKeys: ["component-props"] });
  const out = [];
  for (const r of spec) {
    const p = r.raw;
    if (p.type === "VARIANT") {
      if (r.state !== "default") out.push(`${p.name}: ${r.value}`);
    } else if (p.type === "BOOLEAN") {
      if (p.value === true) out.push(`${p.name}: true`);
      else if (p.defaultValue === true) out.push(`${p.name}: false`);
    } else if (p.type === "INSTANCE_SWAP") {
      if (r.value && r.state !== "default") out.push(`${p.name}: ${r.value}`);
    }
  }
  return out;
}

async function _hdUiVariantRows(root) {
  const rows = [];
  let holder = root;
  if (root.type === "COMPONENT" && root.parent && root.parent.type === "COMPONENT_SET") holder = root.parent;
  const defs = holder.componentPropertyDefinitions;
  if (!defs) return rows;
  const PT = HD_GLOSSARY.propTypes;
  if (holder.type === "COMPONENT_SET") {
    rows.push(_hdUiRow("Variants", `${holder.children.length} variante(s) no conjunto "${holder.name}"`));
    if (root.type === "COMPONENT" && root.variantProperties) {
      rows.push(_hdUiRow("Variant", Object.entries(root.variantProperties).map(([k, v]) => `${k}=${v}`).join(" · ")));
    }
  }
  for (const [k, d] of Object.entries(defs).slice(0, _HD_UI_MAX_LINES)) {
    const label = `${PT[d.type] || d.type}: ${_hdUiCleanProp(k)}`;
    if (d.type === "VARIANT") {
      rows.push(_hdUiRow(label, `${(d.variantOptions || []).join(" | ")}\npadrão: ${d.defaultValue}`));
    } else if (d.type === "BOOLEAN") {
      rows.push(_hdUiRow(label, `Liga/desliga · padrão: ${d.defaultValue}`));
    } else if (d.type === "TEXT") {
      rows.push(_hdUiRow(label, "Texto editável"));
    } else if (d.type === "INSTANCE_SWAP") {
      const nm = await _specComponentName(d.defaultValue);
      rows.push(_hdUiRow(label, `Slot de componente${nm ? ` · padrão: ${nm}` : ""}`));
    }
  }
  return rows;
}

async function _hdUiReactionLines(node, owner) {
  const rs = node.reactions;
  if (!Array.isArray(rs) || rs.length === 0) return [];
  const G = HD_GLOSSARY;
  const out = [];
  for (const r of rs) {
    const trig = (r.trigger && G.triggers[r.trigger.type]) || (r.trigger ? r.trigger.type : "Trigger");
    const actions = r.actions && r.actions.length ? r.actions : (r.action ? [r.action] : []);
    for (const a of actions) {
      let act;
      if (a.type === "NODE") {
        const dest = a.destinationId ? await _hdUiResolveName(a.destinationId) : null;
        act = `${G.navigation[a.navigation] || "Navigate to"} ${dest ? `"${dest}"` : "(sem destino)"}`;
        if (a.transition && a.transition.type) {
          const tr = G.transitions[a.transition.type] || a.transition.type;
          const dur = typeof a.transition.duration === "number" ? ` ${Math.round(a.transition.duration)}ms` : "";
          const eas = a.transition.easing && a.transition.easing.type ? ` ${String(a.transition.easing.type).toLowerCase().replace(/_/g, " ")}` : "";
          act += ` (${tr}${dur}${eas})`;
        }
      } else if (a.type === "BACK") act = "Back";
      else if (a.type === "CLOSE") act = "Close overlay";
      else if (a.type === "URL") act = `Open link ${a.url || ""}`;
      else if (a.type === "SET_VARIABLE") act = "Set variable";
      else if (a.type === "SET_VARIABLE_MODE") act = "Set variable mode";
      else if (a.type === "CONDITIONAL") act = "Conditional";
      else act = String(a.type);
      out.push({ owner, text: `${trig} → ${act}` });
    }
  }
  return out;
}

async function _hdUiReferenceImage(root) {
  if (!("exportAsync" in root) || _hdUiImageCount >= _HD_UI_IMG_MAX_CARDS) return null;
  const w = root.width, h = root.height;
  if (!(w > 0 && h > 0)) return null;
  let dw = w, dh = h;
  if (w < 120 && h < 120) { dw = w * 2; dh = h * 2; }
  const s = Math.min(1, _HD_UI_IMG_MAX_W / dw, _HD_UI_IMG_MAX_H / dh);
  dw *= s; dh *= s;
  let px = Math.min(2400, Math.max(1, Math.round(dw * 2)));
  if (px * (h / w) > 4096) px = Math.max(1, Math.floor(4096 * (w / h)));
  const bytes = await root.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: px } });
  _hdUiImageCount++;
  const hash = figma.createImage(bytes).hash;
  const holder = _hdCreateFrame("VERTICAL", 12, 0, { r: 0.9686, g: 0.9804, b: 0.9804 });
  holder.name = "Imagem de referência";
  holder.cornerRadius = 8;
  holder.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
  holder.strokeWeight = 1;
  holder.counterAxisAlignItems = "CENTER";
  const rect = figma.createRectangle();
  rect.resize(Math.max(1, dw), Math.max(1, dh));
  rect.fills = [{ type: "IMAGE", imageHash: hash, scaleMode: "FIT" }];
  holder.appendChild(rect);
  return holder;
}

async function _hdUiSummaryRows(item, root, main) {
  const rows = [];
  rows.push(_hdUiRow("Tipo", _HD_UI_TYPE_PT[root.type] || root.type));
  if (root.type === "INSTANCE") {
    if (main) {
      const family = main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name;
      const lib = _qsFindLibForKey(main.key) || item.matchedIn || null;
      rows.push(_hdUiRow("Baseado em", lib ? `${family}\n${lib}` : `${family}\nFora das libs DSC cadastradas`, !!lib));
    }
  } else if (root.type === "COMPONENT" || root.type === "COMPONENT_SET") {
    const lib = _qsFindLibForKey(root.key);
    rows.push(_hdUiRow("Baseado em", lib ? `Componente da lib\n${lib}` : "Componente novo, sem vínculo com a lib", !!lib));
  } else {
    rows.push(_hdUiRow("Baseado em", "Nenhum. Construído do zero, sem vínculo com a lib"));
  }
  if ("width" in root && typeof root.width === "number") rows.push(_hdUiRow(HD_GLOSSARY.labels.dimensions, `${Math.round(root.width)} × ${Math.round(root.height)}px`));
  const descSrc = root.type === "INSTANCE" ? main : root;
  const desc = descSrc && typeof descSrc.description === "string" ? descSrc.description.trim() : "";
  if (desc) rows.push(_hdUiRow("Descrição", desc.length > 400 ? desc.slice(0, 400) + "…" : desc));
  const links = descSrc && Array.isArray(descSrc.documentationLinks) ? descSrc.documentationLinks.map(l => l.uri).filter(Boolean) : [];
  if (links.length) rows.push(_hdUiRow("Documentação", links.slice(0, 3).join("\n")));
  return rows;
}

function _hdUiCustomizationRows(item) {
  if (item.customizationsStatus === "evaluated" && Array.isArray(item.customizations)) {
    if (item.customizations.length === 0) {
      return [_hdUiRow("Resultado", "Nenhuma diferença detectada nas propriedades avaliadas")];
    }
    const rows = item.customizations.slice(0, _HD_UI_MAX_LINES).map(c => _hdUiRow(c.layer || "Camada", `${c.campo}: ${c.atual}\nPadrão da lib: ${c.padrao}`, true));
    if (item.customizations.length > _HD_UI_MAX_LINES) rows.push(_hdUiRow("Outras", `+${item.customizations.length - _HD_UI_MAX_LINES} diferença(s) não listadas`));
    return rows;
  }
  if (item.customizationsStatus === "not-evaluated") {
    return [_hdUiRow("Resultado", "Não foi possível comparar este item com a biblioteca.")];
  }
  return [];
}

async function _hdCollectUiComposition(root) {
  const out = [];
  async function walk(n, depth) {
    if (!n.children || depth > _HD_UI_COMP_MAX_DEPTH) return;
    for (const c of n.children) {
      if (out.length >= _HD_UI_COMP_MAX_NODES) return;
      if (_HD_UI_PRIMITIVE_TYPES.includes(c.type)) continue;
      let visibleRef = null;
      try {
        const ref = c.componentPropertyReferences;
        if (ref && ref.visible) visibleRef = _hdUiCleanProp(ref.visible);
      } catch (e) {}
      if (c.visible === false && !visibleRef) continue;
      let dscLib = null;
      let main = null;
      if (c.type === "INSTANCE") {
        try {
          main = await c.getMainComponentAsync();
          if (main) dscLib = _qsFindLibForKey(main.key);
        } catch (e) {}
      }
      const compact = true;
      const rows = [];
      rows.push(_hdUiRow(HD_GLOSSARY.labels.dimensions, `${Math.round(c.width)} × ${Math.round(c.height)}px`));
      if (visibleRef) rows.push(_hdUiRow("Visibilidade", `${c.visible === false ? "Oculto por padrão" : "Visível"}; controlado pela propriedade "${visibleRef}"`));
      if (!dscLib) {
        rows.push(...await _hdUiSafe(() => _hdUiLayoutRows(c, compact), []));
        rows.push(...await _hdUiSafe(() => _hdUiAppearanceRows(c), []));
        rows.push(...await _hdUiSafe(() => _hdUiTextRows(c), []));
      }
      let config = [];
      if (c.type === "INSTANCE" && main) config = await _hdUiSafe(() => _hdUiConfigItems(c, main), []);
      if (config.length) rows.push(_hdUiRow(HD_GLOSSARY.labels.componentProps, config.join(" · ")));
      const reactions = await _hdUiSafe(() => _hdUiReactionLines(c, c.name), []);
      out.push({ name: c.name, type: c.type, depth, dscLib, rows, reactions });
      if (!dscLib) await walk(c, depth + 1);
    }
  }
  await walk(root, 1);
  return out;
}

function _hdUiRule(parent, name, color) {
  const r = figma.createRectangle();
  r.name = name;
  r.fills = [{ type: "SOLID", color }];
  r.resize(100, 1);
  parent.appendChild(r);
  r.layoutSizingHorizontal = "FILL";
  r.layoutSizingVertical = "FIXED";
  return r;
}

function _hdUiTitleRule(box) {
  _hdUiRule(box, "Divisor/Título", { r: 1, g: 0.8275, b: 0.5725 });
}

function _hdUiGroupDivider(card) {
  _hdUiRule(card, "Divisor/Grupo", { r: 1, g: 0.8275, b: 0.5725 });
}

function _hdUiTrimLastGroupDivider(card) {
  const last = card.children[card.children.length - 1];
  if (last && last.name === "Divisor/Grupo") last.remove();
}

function _hdUiAddGroup(card, title, subtitle, rows, highlight) {
  if (!rows || rows.length === 0) return;
  const box = highlight ? _hdCreateFrame("VERTICAL", 10, 6, { r: 1, g: 0.9373, b: 0.8392 }) : _hdCreateFrame("VERTICAL", 0, 4);
  box.name = `Grupo/${title}`;
  if (highlight) {
    box.cornerRadius = 8;
    box.strokes = [{ type: "SOLID", color: { r: 0.9922, g: 0.7098, b: 0.2824 } }];
    box.strokeWeight = 1;
  }
  card.appendChild(box);
  _hdSetFillAndHug(box);

  const tr = _hdCreateFrame("HORIZONTAL", 0, 8);
  tr.counterAxisAlignItems = "CENTER";
  box.appendChild(tr);
  _hdSetFillAndHug(tr);
  tr.appendChild(_hdCreateText(String(title).toUpperCase(), 11, "Bold", { r: 0.251, g: 0.2941, b: 0.3216 }));
  if (subtitle) tr.appendChild(_hdCreateText(subtitle, 9, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 }));

  if (!highlight) _hdUiTitleRule(box);
  rows.forEach(r => _hdAddUiPropRow(box, r.label, r.text, r.token, 11));
  if (!highlight) _hdUiGroupDivider(card);
}

const _HD_UI_NAMES_MAX_DEPTH = 2;

async function _hdUiEssentialComposition(root) {
  const names = [];
  let total = 0;
  let reactions = 0;
  async function walk(n, depth) {
    if (!n.children || depth > _HD_UI_COMP_MAX_DEPTH) return;
    for (const c of n.children) {
      if (total >= _HD_UI_COMP_MAX_NODES) return;
      if (_HD_UI_PRIMITIVE_TYPES.includes(c.type)) continue;
      let hasVisibleRef = false;
      try { hasVisibleRef = !!(c.componentPropertyReferences && c.componentPropertyReferences.visible); } catch (e) {}
      if (c.visible === false && !hasVisibleRef) continue;
      let dscLib = null;
      if (c.type === "INSTANCE") {
        try {
          const main = await c.getMainComponentAsync();
          if (main) dscLib = _qsFindLibForKey(main.key);
        } catch (e) {}
      }
      total++;
      try {
        (Array.isArray(c.reactions) ? c.reactions : []).forEach(r => { reactions += (r.actions && r.actions.length) || (r.action ? 1 : 0); });
      } catch (e) {}
      if (depth <= _HD_UI_NAMES_MAX_DEPTH && names.length < _HD_UI_MAX_LINES) names.push({ name: c.name, type: c.type, depth, dscLib });
      if (!dscLib) await walk(c, depth + 1);
    }
  }
  await walk(root, 1);
  return { names, total, reactions };
}

function _hdUiAddCompositionBlock(card, comp, mode) {
  if (!comp || comp.length === 0) return;
  const box = _hdCreateFrame("VERTICAL", 0, mode === "names" ? 3 : 8);
  box.name = "Grupo/Composição interna";
  card.appendChild(box);
  _hdSetFillAndHug(box);
  const tr = _hdCreateFrame("HORIZONTAL", 0, 8);
  tr.counterAxisAlignItems = "CENTER";
  box.appendChild(tr);
  _hdSetFillAndHug(tr);
  tr.appendChild(_hdCreateText("COMPOSIÇÃO INTERNA", 11, "Bold", { r: 0.251, g: 0.2941, b: 0.3216 }));
  tr.appendChild(_hdCreateText(mode === "names" ? "De que é feito (só os nomes)" : "De que é feito, na ordem em que aparecem", 9, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 }));
  _hdUiTitleRule(box);
  for (const c of comp) {
    if (mode === "names") {
      const label = c.dscLib ? `${c.name} · ${c.dscLib} · reutilizar` : `${c.name} · ${_HD_UI_TYPE_PT[c.type] || c.type}`;
      const line = _hdCreateText(label, 10, "Regular", c.dscLib ? { r: 0.0706, g: 0.4588, b: 0.1529 } : { r: 0.1333, g: 0.1608, b: 0.1804 });
      const wrap = _hdCreateFrame("VERTICAL", 0, 0);
      wrap.name = `[Interno] ${c.name}`;
      wrap.paddingLeft = (c.depth - 1) * 16;
      box.appendChild(wrap);
      _hdSetFillAndHug(wrap);
      wrap.appendChild(line);
      _hdSetFillAndHug(line);
      continue;
    }
    const cNode = _hdCreateFrame("VERTICAL", 0, 2);
    cNode.name = `[Interno] ${c.name}`;
    cNode.paddingLeft = (c.depth - 1) * 16;
    box.appendChild(cNode);
    _hdSetFillAndHug(cNode);

    const cHead = _hdCreateText(`${c.name} · ${_HD_UI_TYPE_PT[c.type] || c.type}`, 11, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
    cNode.appendChild(cHead);
    _hdSetFillAndHug(cHead);

    if (c.dscLib) {
      const dsc = _hdCreateText(`Componente do DSC (${c.dscLib}) — reutilizar, não construir`, 10, "Bold", { r: 0.0706, g: 0.4588, b: 0.1529 });
      cNode.appendChild(dsc);
      _hdSetFillAndHug(dsc);
    }
    c.rows.forEach(r => _hdAddUiPropRow(cNode, r.label, r.text, r.token, 10));
  }
  _hdUiGroupDivider(card);
}

async function _hdBuildUiItemCard(item, categoryTitle) {
  const elCard = _hdCreateFrame("VERTICAL", 12, 14, { r: 1, g: 0.9765, b: 0.902 });
  elCard.name = `[Token] ${item.name}`;
  elCard.cornerRadius = 12;
  elCard.strokes = [{ type: "SOLID", color: { r: 1, g: 0.8275, b: 0.5725 } }];
  elCard.strokeWeight = 1;

  const head = _hdCreateFrame("VERTICAL", 0, 2);
  elCard.appendChild(head);
  _hdSetFillAndHug(head);

  const iName = _hdCreateText(item.name, 14, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
  if (item.nodeId && figma.fileKey) {
    try {
      iName.hyperlink = {
        type: "URL",
        value: `https://www.figma.com/design/${figma.fileKey}?node-id=${encodeURIComponent(item.nodeId)}`
      };
      iName.textDecoration = "UNDERLINE";
      iName.fills = [{ type: "SOLID", color: hexToRgb("#005ca9") }];
    } catch (e) {}
  }
  head.appendChild(iName);
  _hdSetFillAndHug(iName);

  const full = item.uiDepth === "full";
  const warn = _hdCreateText(`${categoryTitle} · Personalizado, construir · ${full ? "Completo" : "Essencial"}`, 10, "Bold", { r: 0.651, g: 0.3686, b: 0 });
  head.appendChild(warn);
  _hdSetFillAndHug(warn);

  const root = item.nodeId ? await _hdUiSafe(() => figma.getNodeByIdAsync(item.nodeId), null) : null;
  if (!root || root.removed) {
    const props = (item.properties || []).filter(p => p && p.label && p.type !== "variant" && p.type !== "layout");
    _hdUiAddGroup(elCard, "Propriedades", "Elemento não encontrado no canvas; dados do último scan",
      props.map(p => _hdUiRow(_hdVocabLabel(p.label, p.propId), _hdFormatScanProp(p), _HD_UI_TOKENIZED_TYPES.includes(p.type) && !!(p.variableKey || p.styleKey || p.key))));
    _hdUiTrimLastGroupDivider(elCard);
    return elCard;
  }

  const main = root.type === "INSTANCE" ? await _hdUiSafe(() => root.getMainComponentAsync(), null) : null;

  const img = await _hdUiSafe(() => _hdUiReferenceImage(root), null);
  if (img) { elCard.appendChild(img); _hdSetFillAndHug(img); }

  _hdUiAddGroup(elCard, "Resumo", "O que é", await _hdUiSafe(() => _hdUiSummaryRows(item, root, main), []));
  _hdUiAddGroup(elCard, "Diferenças em relação à lib", "O que foi alterado sobre o componente original", _hdUiCustomizationRows(item), true);
  _hdUiAddGroup(elCard, "Layout", "Como se organiza", await _hdUiSafe(() => _hdUiLayoutRows(root, false, !full), []));
  _hdUiAddGroup(elCard, "Aparência", "Como se parece", await _hdUiSafe(() => _hdUiAppearanceRows(root, !full), []));
  _hdUiAddGroup(elCard, "Texto", "Tipografia do item", await _hdUiSafe(() => _hdUiTextRows(root, !full), []));

  if (!full) {
    const ess = await _hdUiSafe(() => _hdUiEssentialComposition(root), { names: [], total: 0, reactions: 0 });
    const rootReactions = await _hdUiSafe(() => _hdUiReactionLines(root, root.name), []);
    const rootReactionRows = rootReactions.slice(0, _HD_UI_MAX_LINES).map(r => _hdUiRow(r.owner, r.text));
    if (rootReactions.length > _HD_UI_MAX_LINES) rootReactionRows.push(_hdUiRow("Outras", `+${rootReactions.length - _HD_UI_MAX_LINES} interação(ões) não listadas`));
    _hdUiAddGroup(elCard, "Interações", "Protótipo: o que acontece e quando", rootReactionRows);
    _hdUiAddCompositionBlock(elCard, ess.names, "names");

    const omitted = [];
    if (ess.total > 0) omitted.push(`Composição interna: ${ess.total} elemento${ess.total > 1 ? "s" : ""}. Detalhamento não incluído nesta Ficha (nível Essencial).`);
    if (ess.reactions > 0) omitted.push(`Interações do protótipo: ${ess.reactions}. Não incluídas nesta Ficha.`);
    let hasOptions = false;
    try {
      if (root.type === "COMPONENT" || root.type === "COMPONENT_SET") {
        const holder = root.parent && root.parent.type === "COMPONENT_SET" ? root.parent : root;
        hasOptions = !!holder.componentPropertyDefinitions && Object.keys(holder.componentPropertyDefinitions).length > 0;
      } else if (root.type === "INSTANCE") {
        hasOptions = !!root.componentProperties && Object.keys(root.componentProperties).length > 0;
      }
    } catch (e) {}
    if (hasOptions) omitted.push("Opções do componente não incluídas nesta Ficha.");
    omitted.push("Detalhamento completo disponível no Figma, ou peça ao designer para gerar a Ficha no nível Completo.");
    const note = _hdCreateFrame("VERTICAL", 0, 3);
    note.name = "Grupo/Detalhamento omitido";
    elCard.appendChild(note);
    _hdSetFillAndHug(note);
    omitted.forEach(t => {
      const tx = _hdCreateText(t, 10, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
      note.appendChild(tx);
      _hdSetFillAndHug(tx);
    });
    return elCard;
  }

  if (root.type === "COMPONENT" || root.type === "COMPONENT_SET") {
    _hdUiAddGroup(elCard, "Estados e variantes", "Propriedades expostas e valores possíveis", await _hdUiSafe(() => _hdUiVariantRows(root), []));
  }

  const comp = await _hdUiSafe(() => _hdCollectUiComposition(root), []);

  const reactionLines = [];
  await _hdUiSafe(async () => {
    if (root.type === "COMPONENT_SET") {
      for (const v of root.children.slice(0, _HD_UI_VARIANT_SCAN_MAX)) reactionLines.push(...await _hdUiReactionLines(v, v.name));
    } else {
      reactionLines.push(...await _hdUiReactionLines(root, root.name));
    }
  }, null);
  comp.forEach(c => reactionLines.push(...c.reactions));
  const reactionRows = reactionLines.slice(0, _HD_UI_MAX_LINES).map(r => _hdUiRow(r.owner, r.text));
  if (reactionLines.length > _HD_UI_MAX_LINES) reactionRows.push(_hdUiRow("Outras", `+${reactionLines.length - _HD_UI_MAX_LINES} interação(ões) não listadas`));
  _hdUiAddGroup(elCard, "Interações", "Protótipo: o que acontece e quando", reactionRows);

  _hdUiAddCompositionBlock(elCard, comp, "detailed");

  const cfg = (root.type === "INSTANCE" && main) ? await _hdUiSafe(() => _hdUiConfigItems(root, main), []) : [];
  if (cfg.length > 0) {
    _hdUiAddGroup(elCard, "Configuração do componente", "Só o que está ligado ou fora do padrão", [_hdUiRow(HD_GLOSSARY.labels.componentProps, cfg.join(" · "))]);
  }
  _hdUiTrimLastGroupDivider(elCard);
  return elCard;
}

// ═══════════════════════════════════════════════════════════════════════
// CARD DE ELEMENTO NO PADRÃO DO HANDOFF DO DSC (Fase B) -- BLOCO DELIMITADO
// Referência: docs/referencia-handoff-dsc.md. Vale SÓ para este card (o que
// monta a Documentação Visual / User Interface); as demais seções da Ficha
// não mudam. Controlado por FICHA_DSC_STYLE_ENABLED (false = card antigo,
// _hdBuildUiItemCard). Escala reduzida da folha de 2400px para os 856px
// úteis da seção, mantendo proporções, raios, bordas e cores da referência.
// Leituras protegidas por _hdUiSafe (falha omite a parte); sem findAll.
// ═══════════════════════════════════════════════════════════════════════
const _DS = {
  blue: "#005ca9", text: "#22292e", text2: "#404b52", white: "#ffffff", gray: "#ebf1f2",
  tableBorder: "#d0e0e3", panelBorder: "#9eb2b8", previewAlt: "#a0d2fc",
  colorBg: "#e5f2fc", colorBorder: "#005ca9", numBg: "#fff3d6", numBorder: "#d19400",
  compBg: "#eac9de", compBorder: "#93537d", compBadge: "#753c61",
  spaceFill: "#ef765e", spaceBorder: "#b23820",
  alignFill: "#b26f9b", alignBorder: "#753c61", alignLabelBg: "#f8eaf3",
  alert: { "Erro": "#b22c2c", "Alerta": "#977203", "Sucesso": "#127527", "Confirmação": "#005ca9", _info: "#038299" }
};
// Base + até 23 partes (2026-10-08: antes 8, cortava listas como os ícones de
// um menu). Partes com propriedades idênticas viram uma coluna só.
const _DS_PARTS_MAX = 24;
const _DS_VARIANTS_MAX = 6;
const _DS_PROPS_MAX = 12;
const _DS_ROWS_PER_PART_MAX = 10;
const _DS_COL_W = 372;
const _DS_MARGIN = 34;
const _DS_STAGE_MAX_W = 712;
const _DS_STAGE_MAX_H = 300;
// Tamanho real (2026-10-08, pedido do Augusto): Anatomia e Espaçamento mostram
// o elemento a 100%; só reduzem se passar da largura do palco ou desta altura.
const _DS_REAL_MAX_H = 1600;

const _DS_WEIGHT_STYLES = {
  regular: ["Regular", "Book", "Normal"],
  medium: ["Medium", "Regular"],
  semibold: ["SemiBold", "Semi Bold", "Semibold", "DemiBold", "Demi Bold", "Bold"],
  bold: ["Bold"]
};
let _hdFichaFontsCache = null;

// Resolve UMA vez por geração: Roboto (texto, fonte vigente do DSC) e Fira Code
// (código), com fallback silencioso Inter / Roboto Mono. Só devolve
// famílias/estilos que carregaram de fato.
async function _hdFicheFonts() {
  if (_hdFichaFontsCache) return _hdFichaFontsCache;
  let avail = null;
  try { avail = await figma.listAvailableFontsAsync(); } catch (e) { avail = null; }
  const stylesOf = (family) => avail ? avail.filter(f => f.fontName.family === family).map(f => f.fontName.style) : null;
  const resolve = async (families, weights) => {
    for (const family of families) {
      const styles = stylesOf(family);
      if (styles && styles.length === 0) continue;
      const out = { family };
      let ok = true;
      for (const w of weights) {
        let picked = null;
        for (const cand of _DS_WEIGHT_STYLES[w]) {
          if (styles && !styles.includes(cand)) continue;
          try { await figma.loadFontAsync({ family, style: cand }); picked = cand; break; } catch (e) {}
        }
        if (!picked) { ok = false; break; }
        out[w] = picked;
      }
      if (ok) return out;
    }
    return null;
  };
  let text = await resolve(["Roboto", "Inter"], ["regular", "semibold", "bold"]);
  if (!text) {
    try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) {}
    text = { family: "Inter", regular: "Regular", semibold: "Bold", bold: "Bold" };
  }
  const code = (await resolve(["Fira Code", "Roboto Mono"], ["regular", "medium"])) || { family: text.family, regular: text.regular, medium: text.semibold };
  _hdFichaFontsCache = { text, code };
  return _hdFichaFontsCache;
}

function _dsText(str, o) {
  o = o || {};
  const f = _hdFichaFontsCache;
  const t = figma.createText();
  const fam = o.mono ? f.code : f.text;
  t.fontName = { family: fam.family, style: o.mono ? (o.w === "medium" ? fam.medium : fam.regular) : fam[o.w || "regular"] };
  t.characters = String(str == null ? "" : str);
  t.fontSize = o.size || 14;
  if (o.lh) t.lineHeight = { unit: "PIXELS", value: o.lh };
  t.fills = [{ type: "SOLID", color: hexToRgb(o.color || _DS.text) }];
  return t;
}

function _dsFrame(name, dir, o) {
  o = o || {};
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = dir;
  f.primaryAxisSizingMode = "AUTO";
  f.counterAxisSizingMode = "AUTO";
  const p = o.pad == null ? 0 : o.pad;
  f.paddingTop = o.pt != null ? o.pt : p;
  f.paddingBottom = o.pb != null ? o.pb : p;
  f.paddingLeft = o.pl != null ? o.pl : p;
  f.paddingRight = o.pr != null ? o.pr : p;
  f.itemSpacing = o.gap || 0;
  f.fills = o.fill ? [{ type: "SOLID", color: hexToRgb(o.fill) }] : [];
  if (o.stroke) { f.strokes = [{ type: "SOLID", color: hexToRgb(o.stroke) }]; f.strokeWeight = o.sw || 1; }
  if (o.radius) f.cornerRadius = o.radius;
  if (o.align) f.counterAxisAlignItems = o.align;
  f.clipsContent = !!o.clip;
  return f;
}

function _dsFillW(n) {
  try {
    n.layoutSizingHorizontal = "FILL";
    if (n.type === "TEXT") n.textAutoResize = "HEIGHT";
  } catch (e) {}
}

function _dsAdd(parent, child, fillW) {
  parent.appendChild(child);
  if (fillW) _dsFillW(child);
  return child;
}

function _dsWrap(row) {
  try { row.layoutWrap = "WRAP"; row.counterAxisSpacing = 4; } catch (e) {}
}

function _dsNum(v) { return String(Math.round(v * 100) / 100); }
function _dsPxRem(px) { return `${_dsNum(px)}px | ${String(Math.round(px / 16 * 1000) / 1000)}rem`; }

function _dsCssVar(name) {
  const s = String(name).trim().toLowerCase().replace(/[\s\/\\.]+/g, "-").replace(/[^a-z0-9_\-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return "--" + s;
}

function _dsChip(kind, text, o) {
  o = o || {};
  const label = String(text == null ? "" : text).replace(/\n/g, ", ");
  const mk = (bg, border, name) => _dsFrame(name, "HORIZONTAL", { pad: 4, gap: 4, fill: bg, stroke: border, radius: 4, align: "CENTER" });
  let chip;
  if (kind === "color") {
    chip = mk(_DS.colorBg, _DS.colorBorder, `[Token cor] ${o.tokenName || label}`);
    if (o.hex) {
      const sw = figma.createRectangle();
      sw.resize(16, 16);
      sw.fills = [{ type: "SOLID", color: hexToRgb(o.hex) }];
      sw.strokes = [{ type: "SOLID", color: hexToRgb(_DS.panelBorder) }];
      sw.strokeWeight = 1;
      sw.cornerRadius = 4;
      chip.appendChild(sw);
    }
  } else if (kind === "number") {
    chip = mk(_DS.numBg, _DS.numBorder, `[Token número] ${o.tokenName || label}`);
  } else if (kind === "component") {
    chip = mk(_DS.compBg, _DS.compBorder, `[Componente DSC] ${label}`);
    const badge = _dsFrame("Selo DSC Library", "HORIZONTAL", { pt: 2, pb: 2, pl: 4, pr: 4, fill: _DS.compBadge, radius: 4 });
    badge.appendChild(_dsText("DSC Library", { mono: true, w: "medium", size: 11, color: _DS.white }));
    chip.appendChild(badge);
  } else {
    chip = mk(_DS.gray, _DS.panelBorder, `[Valor] ${label}`);
  }
  chip.appendChild(_dsText(label, { mono: true, size: 12, color: _DS.text2 }));
  if (o.tokenName) { try { chip.setPluginData("handexTokenName", String(o.tokenName)); } catch (e) {} }
  return chip;
}

function _dsMarker(n) {
  const m = _dsFrame(`Marcador ${n}`, "HORIZONTAL", { fill: _DS.blue, radius: 500, align: "CENTER" });
  m.primaryAxisAlignItems = "CENTER";
  m.resize(18, 18);
  m.primaryAxisSizingMode = "FIXED";
  m.counterAxisSizingMode = "FIXED";
  m.appendChild(_dsText(String(n), { w: "semibold", size: 11, color: _DS.white }));
  return m;
}

function _dsRect(parent, x, y, w, h, hex, o) {
  o = o || {};
  const r = figma.createRectangle();
  r.resize(Math.max(0.01, w), Math.max(0.01, h));
  r.fills = [{ type: "SOLID", color: hexToRgb(hex), opacity: o.opacity != null ? o.opacity : 1 }];
  if (o.stroke) { r.strokes = [{ type: "SOLID", color: hexToRgb(o.stroke) }]; r.strokeWeight = o.sw || 1; }
  parent.appendChild(r);
  r.x = x; r.y = y;
  return r;
}

// Seção do card: título (azul, 600) + descrição curta. Devolve o corpo.
function _dsSection(card, title, desc) {
  const body = _dsFrame(`[DSC] ${title}`, "VERTICAL", { gap: 12 });
  _dsAdd(card, body, true);
  _dsAdd(body, _dsText(title, { w: "semibold", size: 22, lh: 30, color: _DS.blue }), true);
  if (desc) _dsAdd(body, _dsText(desc, { size: 14, lh: 21 }), true);
  return body;
}

function _dsPartTitle(n, name) {
  const h = _dsFrame("Cabeçalho da parte", "HORIZONTAL", { gap: 8, align: "CENTER" });
  h.appendChild(_dsMarker(n));
  h.appendChild(_dsText(name, { w: "bold", size: 13, lh: 20 }));
  return h;
}

// Cabeçalho de um grupo de partes idênticas: pílula com os números
// ("2–12") + quantas são + os nomes.
function _dsPartGroupTitle(nums, names) {
  const ranges = [];
  nums.forEach(n => {
    const last = ranges[ranges.length - 1];
    if (last && n === last[1] + 1) last[1] = n; else ranges.push([n, n]);
  });
  const label = ranges.map(([a, b]) => a === b ? String(a) : `${a}–${b}`).join(", ");
  const h = _dsFrame("Cabeçalho do grupo de partes", "VERTICAL", { gap: 4 });
  const top = _dsFrame("Linha do grupo", "HORIZONTAL", { gap: 8, align: "CENTER" });
  const pill = _dsFrame(`Marcadores ${label}`, "HORIZONTAL", { pt: 1, pb: 1, pl: 7, pr: 7, fill: _DS.blue, radius: 500, align: "CENTER" });
  pill.appendChild(_dsText(label, { w: "semibold", size: 11, color: _DS.white }));
  top.appendChild(pill);
  top.appendChild(_dsText(`${nums.length} partes com as mesmas propriedades`, { w: "bold", size: 13, lh: 20 }));
  h.appendChild(top);
  const shownNames = names.slice(0, 24).join(", ") + (names.length > 24 ? ` e mais ${names.length - 24}` : "");
  const namesText = _dsText(shownNames, { size: 12, lh: 18, color: _DS.text2 });
  namesText.name = "Nomes do grupo";
  h.appendChild(namesText);
  return h;
}

// Depois que as colunas já estão na árvore: o cabeçalho de grupo e a lista
// de nomes ocupam a largura da coluna e quebram linha (criados antes de ter
// pai com auto layout, não aceitam FILL).
function _dsFitGroupTitles(cols) {
  cols.forEach(c => (c.children || []).forEach(h => {
    if (h.name !== "Cabeçalho do grupo de partes") return;
    _dsFillW(h);
    (h.children || []).forEach(t => { if (t.name === "Nomes do grupo") _dsFillW(t); });
  }));
}

function _dsChipText(c) {
  try { return c.findAll(n => n.type === "TEXT").map(t => t.characters).join(" "); } catch (e) { return ""; }
}

function _dsPropLine(col, label, chips) {
  const row = _dsFrame(`[Propriedade] ${label}`, "HORIZONTAL", { gap: 8, align: "CENTER" });
  col.appendChild(row);
  _dsFillW(row);
  _dsWrap(row);
  row.appendChild(_dsText(`${label}:`, { mono: true, w: "medium", size: 12, lh: 18 }));
  chips.forEach(c => row.appendChild(c));
  return row;
}

// Partes e variantes EMPILHADAS, cada uma na largura inteira do card
// (2026-10-07, pedido do Augusto: em colunas lado a lado os chips e títulos
// longos se sobrepunham ou ficavam espremidos).
function _dsColumns(parent, cols) {
  const wrap = _dsFrame("Partes", "VERTICAL", { gap: 24 });
  _dsAdd(parent, wrap, true);
  cols.forEach(c => {
    wrap.appendChild(c);
    _dsFillW(c);
  });
  return wrap;
}

function _dsLabelOf(r, node) {
  if (r.cat === "fill") return node.type === "TEXT" ? "text color" : (r.key === "fill" ? "background color" : String(r.label).toLowerCase());
  return String(r.label || r.key).toLowerCase();
}

function _dsChipsForRow(r) {
  const out = [];
  const val = String(r.value == null ? "" : r.value);
  const tokVar = r.token ? _dsCssVar(r.token) : null;
  if (r.key === "component") {
    out.push(r.libName ? _dsChip("component", `${r.value} · ${r.libName}`) : _dsChip("raw", val));
    return out;
  }
  if (r.cat === "fill" || (r.cat === "border" && /^stroke(-\d+)?$/.test(r.key))) {
    const hex = r.raw && r.raw.hex;
    if (hex) {
      out.push(_dsChip("color", tokVar || val, { hex, tokenName: r.token }));
      if (tokVar) out.push(_dsChip("raw", val));
    } else out.push(_dsChip("raw", val));
    return out;
  }
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(val);
  if (m) {
    if (tokVar) out.push(_dsChip("number", tokVar, { tokenName: r.token }));
    out.push(_dsChip("raw", _dsPxRem(parseFloat(m[1]))));
    return out;
  }
  if (tokVar) {
    out.push(_dsChip("number", tokVar, { tokenName: r.token }));
    if (val && val !== r.token) out.push(_dsChip("raw", val));
    return out;
  }
  out.push(_dsChip("raw", val));
  return out;
}

function _dsPickRow(r, node, isRoot, full) {
  const k = r.key;
  if (r.state === "zero-token") return false;
  if (k === "fill" || k.startsWith("fill-")) return true;
  if (/^stroke(-\d+)?$/.test(k) || k.startsWith("strokeWidth") || k === "radius" || k.startsWith("effect-") || k === "opacity") return true;
  if (["textStyle", "fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing"].includes(k)) return true;
  if ((k === "width" || k === "height") && node.type !== "TEXT") return true;
  if (isRoot && k === "direction") return true;
  if (isRoot && !full && (k === "gap" || k.startsWith("padding"))) return true;
  if (k === "component") return true;
  return false;
}

// Linhas { label, chips } de um nó (padding unificado quando os 4 lados são iguais).
async function _dsLinesForNode(node, isRoot, full) {
  const spec = await _hdUiSafe(() => _readNodeSpec(node, { level: "essential", include: { layout: isRoot, appearance: true, text: true, componentProps: false } }), []);
  let comp = [];
  if (node.type === "INSTANCE") {
    comp = await _hdUiSafe(() => _readNodeSpec(node, { level: "quick", include: { layout: false, appearance: false, text: false, componentProps: true }, propKeys: ["component"] }), []);
  }
  const rows = comp.concat(spec).filter(r => _dsPickRow(r, node, isRoot, full));
  const lines = [];
  const pads = rows.filter(r => r.key.startsWith("padding"));
  const others = rows.filter(r => !r.key.startsWith("padding"));
  others.forEach(r => lines.push({ label: _dsLabelOf(r, node), chips: _dsChipsForRow(r) }));
  if (pads.length > 0) {
    const sig = (r) => `${r.raw && r.raw.value}|${r.token || ""}`;
    const four = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].map(f => pads.find(r => r.key === f) || null);
    const uniform = four.every(Boolean) && four.every(r => sig(r) === sig(four[0]));
    if (uniform) lines.push({ label: "padding", chips: _dsChipsForRow(four[0]) });
    else pads.forEach(r => lines.push({ label: String(r.label).toLowerCase(), chips: _dsChipsForRow(r) }));
  }
  return lines.slice(0, _DS_ROWS_PER_PART_MAX);
}

// PNG do elemento, dimensionado para caber no palco; conta no teto de imagens.
async function _dsSnapshot(node, maxW, maxH, allowUpscale) {
  if (!("exportAsync" in node) || _hdUiImageCount >= _HD_UI_IMG_MAX_CARDS) return null;
  const w = node.width, h = node.height;
  if (!(w > 0 && h > 0)) return null;
  const k = Math.min(maxW / w, maxH / h, allowUpscale && w < 160 && h < 160 ? 3 : 1);
  let px = Math.min(2400, Math.max(1, Math.round(w * k * 2)));
  if (px * (h / w) > 4096) px = Math.max(1, Math.floor(4096 * (w / h)));
  const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: px } });
  _hdUiImageCount++;
  return { hash: figma.createImage(bytes).hash, k, W: w, H: h, dw: w * k, dh: h * k, bb: node.absoluteBoundingBox };
}

async function _dsSnapshotReal(node) {
  if (!("exportAsync" in node) || _hdUiImageCount >= _HD_UI_IMG_MAX_CARDS) return null;
  const w = node.width, h = node.height;
  if (!(w > 0 && h > 0)) return null;
  const k = Math.min(1, (_DS_STAGE_MAX_W - 2 * _DS_MARGIN) / w, _DS_REAL_MAX_H / h);
  let px = Math.min(2400, Math.max(1, Math.round(w * k * 2)));
  if (px * (h / w) > 4096) px = Math.max(1, Math.floor(4096 * (w / h)));
  const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: px } });
  _hdUiImageCount++;
  return { hash: figma.createImage(bytes).hash, k, W: w, H: h, dw: w * k, dh: h * k, bb: node.absoluteBoundingBox };
}

// Rótulo de escala ao lado da tag Preview: deixa explícito se é o tamanho real.
function _dsScaleCaption(snap) {
  if (!snap) return null;
  const pct = Math.round(snap.k * 100);
  return pct >= 100 ? "Tamanho real (100%)" : `Reduzido a ${pct}% para caber`;
}

// Linha guia em segmentos retos (horizontais/verticais), 2px.
function _dsLeader(st, pts, hex) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    if (Math.abs(x1 - x2) < 0.5 && Math.abs(y1 - y2) < 0.5) continue;
    if (Math.abs(y1 - y2) < 0.5) _dsRect(st, Math.min(x1, x2), y1 - 1, Math.max(2, Math.abs(x2 - x1)), 2, hex);
    else _dsRect(st, x1 - 1, Math.min(y1, y2), 2, Math.max(2, Math.abs(y2 - y1)), hex);
  }
}

function _dsImageRect(snap, name) {
  const r = figma.createRectangle();
  r.name = name || "Imagem do elemento";
  r.resize(Math.max(1, snap.dw), Math.max(1, snap.dh));
  r.fills = [{ type: "IMAGE", imageHash: snap.hash, scaleMode: "FIT" }];
  return r;
}

function _dsPanel(fill, caption) {
  const p = _dsFrame("[DSC] Preview", "VERTICAL", { pad: 16, gap: 12, fill, stroke: _DS.panelBorder, radius: 8, align: "MIN" });
  const tag = _dsFrame("Tag Preview", "HORIZONTAL", { pt: 6, pb: 6, pl: 12, pr: 12, fill: _DS.gray, radius: 8 });
  tag.appendChild(_dsText("Preview", { w: "semibold", size: 13, lh: 20 }));
  if (caption) {
    const row = _dsFrame("Cabeçalho do Preview", "HORIZONTAL", { gap: 10, align: "CENTER" });
    row.appendChild(tag);
    row.appendChild(_dsText(caption, { size: 12, lh: 18, color: _DS.text2 }));
    p.appendChild(row);
  } else p.appendChild(tag);
  return p;
}

function _dsStage(panel, snap) {
  const st = figma.createFrame();
  st.name = "Palco";
  st.resize(snap.dw + 2 * _DS_MARGIN, snap.dh + 2 * _DS_MARGIN);
  st.fills = [];
  st.clipsContent = false;
  panel.appendChild(st);
  try { st.layoutAlign = "CENTER"; } catch (e) {}
  const img = _dsImageRect(snap);
  st.appendChild(img);
  img.x = _DS_MARGIN; img.y = _DS_MARGIN;
  return st;
}

function _dsRelBox(node, snap) {
  const b = node.absoluteBoundingBox;
  if (!b || !snap.bb) return null;
  return { x: _DS_MARGIN + (b.x - snap.bb.x) * snap.k, y: _DS_MARGIN + (b.y - snap.bb.y) * snap.k, w: b.width * snap.k, h: b.height * snap.k };
}

function _dsAnatomyRoot(root) {
  if (root.type === "COMPONENT_SET") return root.defaultVariant || (root.children && root.children[0]) || null;
  return root;
}

function _dsVisibleKids(n) {
  return (n.children || []).filter(c => c.visible !== false && c.width >= 2 && c.height >= 2);
}

async function _dsSectionAnatomy(card, root, full) {
  const aRoot = _dsAnatomyRoot(root);
  if (!aRoot) return;
  const kids = _dsVisibleKids(aRoot);
  const shown = kids.slice(0, _DS_PARTS_MAX - 1);
  const parts = [{ node: aRoot, name: "Base", isRoot: true }].concat(shown.map(c => ({ node: c, name: c.name, isRoot: false })));

  const snap = await _hdUiSafe(() => _dsSnapshotReal(aRoot), null);
  const body = _dsSection(card, "Anatomia", "Partes do elemento e as propriedades de cada uma.");
  if (snap) {
    const panel = _dsPanel(_DS.white, _dsScaleCaption(snap));
    _dsAdd(body, panel, true);
    const st = _dsStage(panel, snap);
    const M = _DS_MARGIN;
    // Marcadores seguem a direção do elemento (2026-10-08): vertical (ou mais
    // alto que largo) = coluna à direita, cada número na altura da sua parte;
    // horizontal = acima/abaixo. Colisão desloca o número e a linha dobra em
    // cotovelo -- nunca atravessa o elemento nem cruza outra linha.
    const vertical = aRoot.layoutMode === "VERTICAL" || (aRoot.layoutMode !== "HORIZONTAL" && snap.dh >= snap.dw);
    const items = [];
    parts.forEach((p, i) => {
      const b = _dsRelBox(p.node, snap);
      if (!b) return;
      if (p.isRoot) {
        const mk = _dsMarker(i + 1);
        st.appendChild(mk);
        mk.x = 4;
        mk.y = Math.max(0, M + Math.min(snap.dh / 2, 40) - 9);
        _dsLeader(st, [[22, mk.y + 9], [M, mk.y + 9]], _DS.blue);
        return;
      }
      items.push({ n: i + 1, b });
    });
    if (vertical) {
      const ex = M + snap.dw + 5, mx = M + snap.dw + 12;
      let last = -Infinity, maxY = 0;
      items.sort((a, c) => (a.b.y + a.b.h / 2) - (c.b.y + c.b.h / 2)).forEach(it => {
        const cy = it.b.y + it.b.h / 2;
        const y = Math.max(cy - 9, last + 22, 0);
        last = y;
        const mk = _dsMarker(it.n);
        st.appendChild(mk);
        mk.x = mx; mk.y = y;
        _dsLeader(st, [[it.b.x + it.b.w, cy], [ex, cy], [ex, y + 9], [mx, y + 9]], _DS.blue);
        maxY = Math.max(maxY, y + 18);
      });
      if (maxY + 4 > st.height) st.resize(st.width, maxY + 4);
    } else {
      const sorted = items.sort((a, c) => (a.b.x + a.b.w / 2) - (c.b.x + c.b.w / 2));
      const lanes = { top: -Infinity, bottom: -Infinity };
      let maxX = 0;
      sorted.forEach((it, idx) => {
        const top = idx % 2 === 0;
        const cx = it.b.x + it.b.w / 2;
        const x = Math.max(cx - 9, (top ? lanes.top : lanes.bottom) + 22, 0);
        if (top) lanes.top = x; else lanes.bottom = x;
        const mk = _dsMarker(it.n);
        st.appendChild(mk);
        mk.x = x;
        if (top) {
          mk.y = 4;
          const ey = M - 5;
          _dsLeader(st, [[cx, it.b.y], [cx, ey], [x + 9, ey], [x + 9, 22]], _DS.blue);
        } else {
          mk.y = M + snap.dh + M - 22;
          const ey = M + snap.dh + 5;
          _dsLeader(st, [[cx, it.b.y + it.b.h], [cx, ey], [x + 9, ey], [x + 9, mk.y]], _DS.blue);
        }
        maxX = Math.max(maxX, x + 18);
      });
      if (maxX + 4 > st.width) st.resize(maxX + 4, st.height);
    }
  }
  const full_ = !!full;
  // Lê todas as partes, agrupa as que têm exatamente as mesmas linhas de
  // propriedade (rótulo + valores dos chips) e monta uma coluna por grupo.
  // Cada parte mantém seu número no Preview.
  const read = [];
  for (const [i, p] of parts.entries()) {
    const lines = await _hdUiSafe(() => _dsLinesForNode(p.node, p.isRoot, full_), []);
    // A linha "component" fica fora da comparação: ícones são instâncias de
    // componentes diferentes com as mesmas propriedades; o nome de cada um
    // vai no cabeçalho do grupo ("2 menu, 3 search").
    const compLine = lines.find(l => l.label === "component");
    let compText = compLine ? compLine.chips.map(_dsChipText).join(" ").split(" · ")[0].trim() : null;
    // Nome de variante ("Property 1=Default") se repete entre componentes
    // diferentes e não identifica nada: usa o nome da camada.
    if (compText && compText.includes("=")) compText = null;
    const sig = p.isRoot ? `root:${i}` : lines.filter(l => l.label !== "component").map(l => `${l.label}=${l.chips.map(_dsChipText).join("|")}`).join(";");
    read.push({ n: i + 1, p, lines, sig, compText });
  }
  const groups = [];
  const bySig = new Map();
  read.forEach(r => {
    const g = bySig.get(r.sig);
    if (g) { g.members.push(r); r.lines.forEach(l => l.chips.forEach(c => { try { c.remove(); } catch (e) {} })); }
    else { const ng = { members: [r] }; bySig.set(r.sig, ng); groups.push(ng); }
  });
  const cols = [];
  for (const g of groups) {
    const first = g.members[0];
    const many = g.members.length > 1;
    const col = _dsFrame(many ? `[Partes ${g.members.map(m => m.n).join(",")}]` : `[Parte ${first.n}] ${first.p.name}`, "VERTICAL", { gap: 10 });
    col.appendChild(many ? _dsPartGroupTitle(g.members.map(m => m.n), g.members.map(m => `${m.n} ${m.compText || m.p.name}`)) : _dsPartTitle(first.n, first.p.name));
    const sameComp = !!first.compText && g.members.every(m => m.compText === first.compText);
    first.lines.forEach(l => {
      if (many && !sameComp && l.label === "component") { l.chips.forEach(c => { try { c.remove(); } catch (e) {} }); return; }
      _dsPropLine(col, l.label, l.chips);
    });
    if (first.lines.length === 0) col.appendChild(_dsText("Sem propriedades relevantes lidas.", { size: 12, lh: 18, color: _DS.text2 }));
    cols.push(col);
  }
  _dsColumns(body, cols);
  _dsFitGroupTitles(cols);
  if (kids.length > shown.length) _dsAdd(body, _dsText(`${kids.length - shown.length} parte(s) não exibida(s).`, { size: 12, lh: 18, color: _DS.text2 }), true);
  return snap;
}

async function _dsSectionSpacing(card, root) {
  const aRoot = _dsAnatomyRoot(root);
  if (!aRoot || (aRoot.layoutMode !== "HORIZONTAL" && aRoot.layoutMode !== "VERTICAL")) return;
  const spec = await _hdUiSafe(() => _readNodeSpec(aRoot, { level: "full", include: { layout: true, appearance: false, text: false, componentProps: false } }), []);
  const by = {};
  spec.forEach(r => { by[r.key] = r; });
  const pv = (f) => (by[f] && by[f].raw && typeof by[f].raw.value === "number") ? by[f].raw.value : 0;
  const pt = pv("paddingTop"), pr = pv("paddingRight"), pb = pv("paddingBottom"), pl = pv("paddingLeft");
  const gap = by.gap && by.gap.raw && !by.gap.raw.spaceBetween ? by.gap.raw.value : 0;
  const pa = aRoot.primaryAxisAlignItems, ca = aRoot.counterAxisAlignItems;
  const aligned = pa !== "MIN" || ca !== "MIN";
  if (!(pt || pr || pb || pl || gap || aligned)) return;

  const snap = await _hdUiSafe(() => _dsSnapshotReal(aRoot), null);
  const body = _dsSection(card, "Espaçamento e Alinhamento", "Áreas de espaçamento (gap e padding) e alinhamento do elemento.");
  if (snap) {
    const panel = _dsPanel(_DS.previewAlt, _dsScaleCaption(snap));
    _dsAdd(body, panel, true);
    const st = _dsStage(panel, snap);
    const k = snap.k, M = _DS_MARGIN;
    const area = (x, y, w, h) => { if (w >= 0.5 && h >= 0.5) _dsRect(st, x, y, w, h, _DS.spaceFill, { opacity: 0.64, stroke: _DS.spaceBorder }); };
    area(M, M, snap.dw, pt * k);
    area(M, M + snap.dh - pb * k, snap.dw, pb * k);
    area(M, M + pt * k, pl * k, snap.dh - (pt + pb) * k);
    area(M + snap.dw - pr * k, M + pt * k, pr * k, snap.dh - (pt + pb) * k);
    if (gap > 0) {
      const flow = _dsVisibleKids(aRoot).filter(c => c.layoutPositioning !== "ABSOLUTE").slice(0, 20);
      const boxes = flow.map(c => _dsRelBox(c, snap)).filter(Boolean);
      for (let i = 0; i < boxes.length - 1; i++) {
        const a = boxes[i], b = boxes[i + 1];
        if (aRoot.layoutMode === "HORIZONTAL") area(a.x + a.w, M + pt * k, b.x - (a.x + a.w), snap.dh - (pt + pb) * k);
        else area(M + pl * k, a.y + a.h, snap.dw - (pl + pr) * k, b.y - (a.y + a.h));
      }
    }
    if (aligned) {
      _dsRect(st, M + pl * k, M + pt * k, snap.dw - (pl + pr) * k, snap.dh - (pt + pb) * k, _DS.alignFill, { opacity: 0.12, stroke: _DS.alignBorder });
    }
    // Legenda abaixo do elemento (2026-10-08): antes o alinhamento era um
    // rótulo flutuando sobre a imagem, maior que o próprio elemento.
    const legend = _dsFrame("Legenda", "VERTICAL", { gap: 6 });
    const swatchRow = (fill, border, opacity, text, mono) => {
      const row = _dsFrame("Item da legenda", "HORIZONTAL", { gap: 8, align: "CENTER" });
      const sw = figma.createRectangle();
      sw.resize(14, 14);
      sw.cornerRadius = 3;
      sw.fills = [{ type: "SOLID", color: hexToRgb(fill), opacity }];
      sw.strokes = [{ type: "SOLID", color: hexToRgb(border) }];
      sw.strokeWeight = 1;
      row.appendChild(sw);
      row.appendChild(_dsText(text, { mono: !!mono, size: 12, lh: 18, color: _DS.text }));
      legend.appendChild(row);
    };
    if (pt || pr || pb || pl || gap) swatchRow(_DS.spaceFill, _DS.spaceBorder, 0.64, "Padding e gap");
    if (aligned) {
      const A = HD_GLOSSARY.axis;
      const txt = (pa === "CENTER" && ca === "CENTER") ? "Alinhamento: center" : `Alinhamento: main axis ${(A[pa] || pa).toLowerCase()} · cross axis ${(A[ca] || ca).toLowerCase()}`;
      swatchRow(_DS.alignFill, _DS.alignBorder, 0.12, txt);
    }
    if (legend.children.length) panel.appendChild(legend);
  }
  const lines = [];
  const padRows = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].map(f => by[f]).filter(Boolean);
  if (by.gap && gap > 0) lines.push({ label: "gap", chips: _dsChipsForRow(by.gap) });
  if (padRows.length) {
    const sig = (r) => `${r.raw && r.raw.value}|${r.token || ""}`;
    if (padRows.length === 4 && padRows.every(r => sig(r) === sig(padRows[0]))) lines.push({ label: "padding", chips: _dsChipsForRow(padRows[0]) });
    else padRows.forEach(r => lines.push({ label: String(r.label).toLowerCase(), chips: _dsChipsForRow(r) }));
  }
  if (by.primaryAxis) lines.push({ label: "primary axis", chips: _dsChipsForRow(by.primaryAxis) });
  if (by.counterAxis) lines.push({ label: "counter axis", chips: _dsChipsForRow(by.counterAxis) });
  if (lines.length) {
    const col = _dsFrame("Propriedades de espaçamento", "VERTICAL", { gap: 8 });
    lines.forEach(l => _dsPropLine(col, l.label, l.chips));
    _dsAdd(body, col, true);
  }
}

async function _dsComparable(node) {
  const spec = await _readNodeSpec(node, { level: "essential", include: { layout: true, appearance: true, text: node.type === "TEXT", componentProps: false } });
  const m = new Map();
  spec.filter(r => r.state !== "zero-token").forEach(r => m.set(r.key, r));
  return m;
}

function _dsDiffMaps(def, cur, node, prefix) {
  const out = [];
  for (const [k, r] of cur) {
    const d = def.get(k);
    if (!d || d.value !== r.value || d.token !== r.token) out.push({ label: prefix + _dsLabelOf(r, node), chips: _dsChipsForRow(r) });
  }
  for (const [k, d] of def) {
    if (!cur.has(k) && (d.cat === "fill" || d.cat === "border" || d.cat === "effect")) out.push({ label: prefix + _dsLabelOf(d, node), chips: [_dsChip("raw", "none")] });
  }
  return out;
}

async function _dsSectionVariants(card, root, main) {
  let holder = null;
  if (root.type === "COMPONENT_SET") holder = root;
  else if (root.type === "COMPONENT") holder = root.parent && root.parent.type === "COMPONENT_SET" ? root.parent : null;
  else if (root.type === "INSTANCE" && main) holder = main.parent && main.parent.type === "COMPONENT_SET" ? main.parent : null;
  if (!holder) return;
  const all = (holder.children || []).filter(c => c.type === "COMPONENT");
  if (all.length < 2) return;
  const def = holder.defaultVariant || all[0];
  const ordered = [def].concat(all.filter(c => c !== def));
  const shown = ordered.slice(0, _DS_VARIANTS_MAX);

  const body = _dsSection(card, "Variações e Estados", "Variantes do componente e o que muda em relação à variante padrão.");
  const panel = _dsPanel(_DS.white);
  _dsAdd(body, panel, true);
  const tiles = _dsFrame("Variantes", "HORIZONTAL", { gap: 24 });
  _dsAdd(panel, tiles, true);
  _dsWrap(tiles);

  const defKids = _dsVisibleKids(def).slice(0, 6);
  const defMap = await _hdUiSafe(() => _dsComparable(def), null);
  const cols = [];
  for (const [i, v] of shown.entries()) {
    const n = i + 1;
    const tile = _dsFrame(`Variante ${n}`, "VERTICAL", { gap: 8, align: "CENTER" });
    const snap = await _hdUiSafe(() => _dsSnapshot(v, 180, 140, true), null);
    if (snap) tile.appendChild(_dsImageRect(snap, `Imagem variante ${n}`));
    tile.appendChild(_dsMarker(n));
    tiles.appendChild(tile);

    const props = v.variantProperties ? Object.entries(v.variantProperties).map(([a, b]) => `${a}=${b}`).join(" · ") : v.name;
    const col = _dsFrame(`[Variante ${n}] ${props}`, "VERTICAL", { gap: 10 });
    col.appendChild(_dsPartTitle(n, `${props}${v === def ? " (padrão)" : ""}`));
    if (v !== def && defMap) {
      const diffs = await _hdUiSafe(async () => {
        const out = _dsDiffMaps(defMap, await _dsComparable(v), v, "");
        const vKids = _dsVisibleKids(v);
        for (const dk of defKids) {
          const vk = vKids.find(c => c.name === dk.name);
          if (!vk) continue;
          out.push(..._dsDiffMaps(await _dsComparable(dk), await _dsComparable(vk), vk, `${dk.name} · `));
        }
        return out;
      }, []);
      diffs.slice(0, _DS_ROWS_PER_PART_MAX).forEach(l => _dsPropLine(col, l.label, l.chips));
      if (diffs.length === 0) col.appendChild(_dsText("Sem diferenças de estilo lidas em relação ao padrão.", { size: 12, lh: 18, color: _DS.text2 }));
    } else if (v === def) {
      col.appendChild(_dsText("Variante de referência.", { size: 12, lh: 18, color: _DS.text2 }));
    }
    cols.push(col);
  }
  _dsColumns(body, cols);
  if (ordered.length > shown.length) _dsAdd(body, _dsText(`${ordered.length - shown.length} variante(s) não exibida(s).`, { size: 12, lh: 18, color: _DS.text2 }), true);
}

async function _dsSectionProps(card, root, main) {
  let holder = null;
  if (root.type === "COMPONENT_SET") holder = root;
  else if (root.type === "COMPONENT") holder = root.parent && root.parent.type === "COMPONENT_SET" ? root.parent : root;
  else if (root.type === "INSTANCE" && main) holder = main.parent && main.parent.type === "COMPONENT_SET" ? main.parent : main;
  const defs = holder ? holder.componentPropertyDefinitions : null;
  const entries = defs ? Object.entries(defs) : [];
  if (entries.length === 0) return;

  const rows = [];
  for (const [k, d] of entries.slice(0, _DS_PROPS_MAX)) {
    let segs = [];
    let defIdx = -1;
    if (d.type === "VARIANT") { segs = (d.variantOptions || []).map(String); defIdx = segs.indexOf(String(d.defaultValue)); }
    else if (d.type === "BOOLEAN") { segs = ["true", "false"]; defIdx = segs.indexOf(String(d.defaultValue)); }
    else if (d.type === "TEXT") { segs = [String(d.defaultValue)]; defIdx = 0; }
    else if (d.type === "INSTANCE_SWAP") { segs = [(await _specComponentName(d.defaultValue)) || "Instance swap"]; defIdx = 0; }
    else segs = [String(d.type)];
    rows.push({ name: _hdUiCleanProp(k), segs, defIdx, desc: typeof d.description === "string" && d.description.trim() ? d.description.trim() : "—" });
  }

  const body = _dsSection(card, "Propriedades", "Propriedades do componente e valores possíveis. O valor padrão aparece em negrito.");
  const table = _dsFrame("[DSC] Tabela de propriedades", "VERTICAL", { fill: _DS.white, stroke: _DS.tableBorder, radius: 8, clip: true });
  _dsAdd(body, table, true);
  const widths = [190, 330];
  const mkRow = (cells, header) => {
    const row = _dsFrame(header ? "Cabeçalho" : "Linha", "HORIZONTAL", {});
    _dsAdd(table, row, true);
    cells.forEach((c, ci) => {
      const cell = _dsFrame("Célula", "VERTICAL", { pt: header ? 10 : 8, pb: header ? 10 : 8, pl: 12, pr: 12, fill: header ? _DS.gray : _DS.white, stroke: _DS.tableBorder });
      try { cell.strokeTopWeight = 0; cell.strokeLeftWeight = 0; cell.strokeRightWeight = 0; cell.strokeBottomWeight = 1; } catch (e) {}
      row.appendChild(cell);
      if (ci < 2) { cell.resize(widths[ci], 10); cell.counterAxisSizingMode = "FIXED"; cell.primaryAxisSizingMode = "AUTO"; }
      else { try { cell.layoutGrow = 1; } catch (e) {} }
      try { cell.layoutAlign = "STRETCH"; } catch (e) {}
      cell.appendChild(c);
      _dsFillW(c);
    });
  };
  mkRow([
    _dsText("Propriedade", { w: "semibold", size: 13, lh: 20 }),
    _dsText("Valor", { w: "semibold", size: 13, lh: 20 }),
    _dsText("Descrição", { w: "semibold", size: 13, lh: 20 })
  ], true);
  const F = _hdFichaFontsCache.text;
  rows.forEach(r => {
    const valueText = _dsText(r.segs.join(" | "), { size: 13, lh: 20 });
    if (r.defIdx >= 0) {
      let start = 0;
      for (let i = 0; i < r.defIdx; i++) start += r.segs[i].length + 3;
      const end = start + r.segs[r.defIdx].length;
      try { if (end > start) valueText.setRangeFontName(start, end, { family: F.family, style: F.bold }); } catch (e) {}
    }
    mkRow([
      _dsText(r.name, { size: 13, lh: 20 }),
      valueText,
      _dsText(r.desc, { size: 13, lh: 20, color: _DS.text2 })
    ], false);
  });
  if (entries.length > rows.length) _dsAdd(body, _dsText(`${entries.length - rows.length} propriedade(s) não exibida(s).`, { size: 12, lh: 18, color: _DS.text2 }), true);
}

async function _dsAlertIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  try {
    const n = figma.createNodeFromSvg(svg);
    n.name = "Ícone info";
    return n;
  } catch (e) {
    const el = figma.createEllipse();
    el.resize(20, 20);
    el.fills = [];
    el.strokes = [{ type: "SOLID", color: hexToRgb(color) }];
    el.strokeWeight = 2;
    return el;
  }
}

async function _dsAlert(parent, tipo, title, lines, link) {
  const color = _DS.alert[tipo] || _DS.alert._info;
  const box = _dsFrame(`[DSC] Alerta ${tipo || "Informativo"}`, "HORIZONTAL", { pt: 10, pb: 10, pr: 12, pl: 14, gap: 12, fill: _DS.white, stroke: color, sw: 2, radius: 4 });
  try { box.strokeLeftWeight = 8; } catch (e) {}
  _dsAdd(parent, box, true);
  box.appendChild(await _dsAlertIcon(color));
  const txt = _dsFrame("Texto do alerta", "VERTICAL", { gap: 4 });
  box.appendChild(txt);
  try { txt.layoutGrow = 1; } catch (e) {}
  _dsAdd(txt, _dsText(title, { w: "bold", size: 14, lh: 21, color }), true);
  (lines || []).forEach(l => { if (l) _dsAdd(txt, _dsText(l, { size: 13, lh: 20 }), true); });
  if (link) {
    const lt = _dsText(link, { size: 13, lh: 20, color: _DS.blue });
    try { lt.textDecoration = "UNDERLINE"; lt.hyperlink = { type: "URL", value: link }; } catch (e) {}
    _dsAdd(txt, lt, true);
  }
}

function _dsSpecDescription(specs) {
  const withNote = specs.filter(s => s && s.note && String(s.note).trim());
  if (withNote.length === 0) return null;
  if (withNote.length === 1) return String(withNote[0].note).trim();
  return withNote.map(s => `${s.letter || ""} · ${s.name || s.label || "Spec"}: ${String(s.note).trim()}`).join("\n\n");
}

async function _dsNotes(card, item, specs, withDiffs) {
  const alerts = [];
  specs.forEach(s => (s.excecoes || []).forEach(e => alerts.push({ tipo: e.tipo, title: `${e.tipo || "Exceção"}${e.titulo ? " — " + e.titulo : ""}`, lines: [e.obs] })));
  specs.forEach(s => { if (s.link) alerts.push({ tipo: null, title: "Referência", lines: [], link: s.link }); });
  if (withDiffs && item && item.customizationsStatus === "evaluated" && Array.isArray(item.customizations) && item.customizations.length > 0) {
    const lines = item.customizations.slice(0, _HD_UI_MAX_LINES).map(c => `${c.layer || "Camada"} · ${c.campo}: ${c.atual} (padrão da lib: ${c.padrao})`);
    if (item.customizations.length > _HD_UI_MAX_LINES) lines.push(`+${item.customizations.length - _HD_UI_MAX_LINES} diferença(s) não listada(s).`);
    alerts.push({ tipo: null, title: "Diferenças em relação à lib", lines });
  }
  if (alerts.length === 0) return;
  const body = _dsSection(card, "Notas", null);
  for (const a of alerts) await _dsAlert(body, a.tipo, a.title, a.lines, a.link);
}

async function _hdBuildElementCard(item, categoryTitle, specs) {
  await _hdFicheFonts();
  const card = _dsFrame(`[Token] ${item.name}`, "VERTICAL", { pad: 20, gap: 28, fill: _DS.white, stroke: _DS.text2, sw: 2, radius: 16 });
  try {
    return await _hdFillElementCard(card, item, categoryTitle, Array.isArray(specs) ? specs : []);
  } catch (e) {
    try { card.remove(); } catch (e2) {}
    throw e;
  }
}

async function _hdFillElementCard(card, item, categoryTitle, specs) {
  const full = item.uiDepth === "full";

  const root = item.nodeId ? await _hdUiSafe(() => figma.getNodeByIdAsync(item.nodeId), null) : null;
  const live = root && !root.removed ? root : null;
  const main = live && live.type === "INSTANCE" ? await _hdUiSafe(() => live.getMainComponentAsync(), null) : null;

  let baseText;
  let libName = null;
  if (live && live.type === "INSTANCE" && main) {
    libName = _qsFindLibForKey(main.key);
    const family = main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name;
    baseText = `Baseado em ${family} · ${libName || "fora das libs DSC cadastradas"}`;
  } else if (live && (live.type === "COMPONENT" || live.type === "COMPONENT_SET")) {
    libName = _qsFindLibForKey(live.key);
    baseText = libName ? `Componente da lib · ${libName}` : "Componente novo, sem vínculo com a lib";
  } else {
    baseText = "Sem vínculo com a lib DSC. Construído do zero";
  }

  const head = _dsFrame("[DSC] Título", "VERTICAL", { gap: 6 });
  _dsAdd(card, head, true);
  const nameRow = _dsFrame("Nome e selos", "HORIZONTAL", { gap: 10, align: "CENTER" });
  _dsAdd(head, nameRow, true);
  _dsWrap(nameRow);
  const nameTxt = _dsText(item.name, { w: "semibold", size: 24, lh: 32 });
  if (item.nodeId && figma.fileKey) {
    try {
      nameTxt.hyperlink = { type: "URL", value: `https://www.figma.com/design/${figma.fileKey}?node-id=${encodeURIComponent(item.nodeId)}` };
      nameTxt.textDecoration = "UNDERLINE";
    } catch (e) {}
  }
  nameRow.appendChild(nameTxt);
  const seen = new Set();
  specs.forEach(s => {
    const lbl = s.type || s.categoryLabel || s.category;
    if (!lbl || seen.has(lbl)) return;
    seen.add(lbl);
    const sc = s.color ? hexToRgb(s.color) : hexToRgb(_DS.blue);
    const bg = s.fillColor ? hexToRgb(s.fillColor) : { r: 1 - (1 - sc.r) * 0.12, g: 1 - (1 - sc.g) * 0.12, b: 1 - (1 - sc.b) * 0.12 };
    const pill = _dsFrame(`Selo ${lbl}`, "HORIZONTAL", { pt: 3, pb: 3, pl: 8, pr: 8, radius: 4 });
    pill.fills = [{ type: "SOLID", color: bg }];
    pill.strokes = [{ type: "SOLID", color: sc }];
    pill.strokeWeight = 1;
    const t = _dsText(`${s.letter ? s.letter + " · " : ""}${lbl}`, { w: "semibold", size: 12, lh: 18 });
    t.fills = [{ type: "SOLID", color: sc }];
    pill.appendChild(t);
    nameRow.appendChild(pill);
  });
  _dsAdd(head, _dsText(baseText, { size: 14, lh: 21, color: _DS.text2 }), true);
  const _unalteredDsc = live && live.type === "INSTANCE" && main && libName && item.customizationsStatus === "evaluated" && Array.isArray(item.customizations) && item.customizations.length === 0;
  const _metaWhat = _unalteredDsc ? "Componente do DSC, reutilizar" : (item._newComponentRoot ? "Novo componente, construir" : "Personalizado, construir");
  _dsAdd(head, _dsText(`${categoryTitle} · ${_metaWhat}${_unalteredDsc ? "" : " · " + (full ? "Completo" : "Essencial")}`, { size: 12, lh: 18, color: _DS.text2 }), true);

  const desc = _dsSpecDescription(specs);
  if (desc) {
    const b = _dsSection(card, "Descrição de Funcionalidade", null);
    _dsAdd(b, _dsText(desc, { size: 14, lh: 21 }), true);
  }

  if (!live) {
    const props = (item.properties || []).filter(p => p && p.label && p.type !== "variant" && p.type !== "layout");
    if (props.length > 0) {
      const b = _dsSection(card, "Propriedades", "Elemento não encontrado no canvas; dados do último scan.");
      const col = _dsFrame("Propriedades do scan", "VERTICAL", { gap: 8 });
      props.slice(0, _HD_UI_MAX_LINES).forEach(p => _dsPropLine(col, String(_hdVocabLabel(p.label, p.propId)).toLowerCase(), [_dsChip("raw", _hdFormatScanProp(p))]));
      _dsAdd(b, col, true);
    }
    await _dsNotes(card, item, specs, false);
    return card;
  }

  const unaltered = live.type === "INSTANCE" && main && libName && item.customizationsStatus === "evaluated" && Array.isArray(item.customizations) && item.customizations.length === 0;
  if (unaltered) {
    const b = _dsSection(card, "Componente do DSC", null);
    _dsAdd(b, _dsChip("component", `${main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name} · ${libName} — reutilizar`), false);
    await _dsNotes(card, item, specs, false);
    return card;
  }

  await _hdUiSafe(() => _dsSectionProps(card, live, main), null);
  await _hdUiSafe(() => _dsSectionAnatomy(card, live, full), null);
  await _hdUiSafe(() => _dsSectionInteractions(card, live), null);
  if (full) {
    await _hdUiSafe(() => _dsSectionSpacing(card, live), null);
    await _hdUiSafe(() => _dsSectionVariants(card, live, main), null);
  }
  await _dsNotes(card, item, specs, true);
  return card;
}

// Interações do protótipo do elemento e de tudo dentro dele (2026-10-05: o
// card no padrão do DSC não trazia comportamento nenhum; um menu com estados
// e navegação chegava ao dev sem nada disso). Percorre até 6 níveis / 150 nós
// por node.children (sem findAll) e lista "Quando → O que acontece" por camada.
const _DS_INTERACTION_DEPTH = 6, _DS_INTERACTION_NODES = 150, _DS_INTERACTION_ROWS = 30;
async function _dsSectionInteractions(card, root) {
  const lines = [];
  let visited = 0;
  const walk = async (n, depth) => {
    if (!n || visited >= _DS_INTERACTION_NODES) return;
    visited++;
    const ls = await _hdUiSafe(() => _hdUiReactionLines(n, n === root ? (root.name || "Elemento") : n.name), []);
    lines.push(...ls);
    if (depth >= _DS_INTERACTION_DEPTH || !("children" in n)) return;
    for (const c of n.children) {
      if (c.visible === false) continue;
      await walk(c, depth + 1);
      if (visited >= _DS_INTERACTION_NODES) break;
    }
  };
  if (root.type === "COMPONENT_SET") {
    for (const v of root.children.slice(0, _HD_UI_VARIANT_SCAN_MAX)) await walk(v, 0);
  } else {
    await walk(root, 0);
  }
  if (lines.length === 0) return;
  const b = _dsSection(card, "Interações", "Protótipo: o que acontece e quando, por camada.");
  const rows = lines.slice(0, _DS_INTERACTION_ROWS).map(l => [{ text: l.owner, w: "semibold" }, l.text]);
  if (lines.length > _DS_INTERACTION_ROWS) rows.push(["Outras", `+${lines.length - _DS_INTERACTION_ROWS} interação(ões) no protótipo do Figma`]);
  _hdDsTable(b, "Interações", [{ title: "Camada", w: 260 }, { title: "Quando → O que acontece" }], rows);
}

// Casa cada spec do frame ao item escaneado dono (mesmo critério de
// resolve-spec-owners): igualdade em nodeIds, senão sobe por parent até o
// primeiro item escaneado ou o frame raiz. Specs avulsas só casam por
// igualdade. Em dúvida, não anexa. Devolve Map<item, spec[]> ordenado por letra.
async function _hdMatchSpecsToItems(frame, items, looseSpecs) {
  const result = new Map();
  if (!frame || !frame.figmaId) return result;
  const idToItem = new Map();
  items.forEach(it => {
    const ids = Array.isArray(it.nodeIds) && it.nodeIds.length ? it.nodeIds : (it.nodeId ? [it.nodeId] : []);
    ids.forEach(id => { if (!idToItem.has(id)) idToItem.set(id, it); });
  });
  const memo = new Map();
  const find = async (target, ancestors) => {
    if (idToItem.has(target)) return idToItem.get(target);
    if (!ancestors) return null;
    if (memo.has(target)) return memo.get(target);
    const path = [];
    let found = null;
    let node = await _hdUiSafe(() => figma.getNodeByIdAsync(target), null);
    while (node && node.type !== "PAGE" && node.type !== "DOCUMENT") {
      if (idToItem.has(node.id)) { found = idToItem.get(node.id); break; }
      if (memo.has(node.id)) { found = memo.get(node.id); break; }
      path.push(node.id);
      if (node.id === frame.figmaId) break;
      node = node.parent;
    }
    path.forEach(id => memo.set(id, found));
    memo.set(target, found);
    return found;
  };
  const attach = (it, s) => { if (!result.has(it)) result.set(it, []); result.get(it).push(s); };
  for (const s of (frame.createdSpecs || [])) {
    if (!s || !s.targetNodeId) continue;
    const it = await find(s.targetNodeId, true);
    if (it) attach(it, s);
  }
  for (const s of (looseSpecs || [])) {
    if (!s || !s.targetNodeId) continue;
    const it = await find(s.targetNodeId, false);
    if (it) attach(it, s);
  }
  result.forEach(list => list.sort((a, b) => String(a.letter || "").localeCompare(String(b.letter || ""))));
  return result;
}
// ═══ FIM DO BLOCO: card de elemento no padrão do DSC ════════════════════

async function _hdRebuildUiBoard(data) {
  if (data.setup && data.setup.componentes === false) return null;
  _hdUiImageCount = 0;

  const _cats = [
    { title: "Componentes", type: "components" },
    { title: "Ícones", type: "icons" },
    { title: "Tipografia", type: "typography" },
    { title: "Vetores", type: "vectors" },
    { title: "Frames e Layouts", type: "frames" },
  ];
  const _sources = (data.frames || []).filter(f => f.specs).map(f => ({ nome: f.nome || 'Frame', specs: f.specs, frame: f }));
  if (_sources.length === 0 && data.step2 && data.step2.specs) _sources.push({ nome: 'Sem frame vinculado', specs: data.step2.specs, frame: null });

  const groups = [];
  _sources.forEach(src => {
    const cards = [];
    // Frame marcado como Novo Componente: o PRÓPRIO frame é o que o dev
    // constrói (2026-10-05, pedido do Augusto: o card trazia só um [dsc]
    // Button pronto e nada do menu escaneado). Nasce no nível Completo, com
    // anatomia, espaçamento e interações do frame inteiro.
    if (src.frame && src.frame.isNewComponent && src.frame.figmaId) {
      cards.push({
        item: { name: src.frame.nome || 'Novo componente', type: 'frames', nodeId: src.frame.figmaId, nodeIds: [src.frame.figmaId], isMarkedCustom: true, uiDepth: 'full', properties: [], _newComponentRoot: true },
        cat: 'Novo componente'
      });
    }
    _cats.forEach(cat => {
      (src.specs[cat.type] || []).filter(it => _hdIsBuildItem(it, cat.type) && it.nodeId !== (src.frame && src.frame.figmaId)).forEach(it => cards.push({ item: it, cat: cat.title }));
    });
    if (cards.length > 0) groups.push({ nome: src.nome, cards, frame: src.frame, specs: src.specs });
  });
  if (groups.length === 0) return null;
  const looseSpecs = FICHA_DSC_STYLE_ENABLED ? _hdLooseSpecsOf(data) : [];
  const section = _hdBuildSectionShell("User Interface");
  for (const g of groups) {
    if (groups.length > 1) {
      const t = _hdCreateText(g.nome, _hdS(13, 18), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
      section.appendChild(t);
      _hdSetFillAndHug(t);
    }
    // Especificação NÃO é mais anexada ao card do item escaneado (2026-10-07,
    // decisão do Augusto): o elemento que o designer selecionou ao criar a
    // especificação é a referência dela na Ficha (Documentação Visual), e o
    // item do scan não deve virar o "principal" por cima dela.
    for (const c of g.cards) {
      let card = null;
      if (FICHA_DSC_STYLE_ENABLED) {
        card = await _hdUiSafe(() => _hdBuildElementCard(c.item, c.cat, []), null);
      }
      if (!card) card = await _hdBuildUiItemCard(c.item, c.cat);
      section.appendChild(card);
      _hdSetFillAndHug(card);
    }
  }
  return section;
}

// Remove os formatos antigos do card User Interface (colunas ao lado da
// Ficha, nomeadas "[User Interface] ..." ou soltas " / Interface"); a seção
// atual dentro de `content` é substituída por _hdReplaceSection.
function _hdRemoveUiColumns(ficha) {
  ficha.children
    .filter(n => n.type === 'FRAME' && (n.name.startsWith(_HD_UI_COLUMN_PREFIX) || n.name.endsWith(' / Interface')))
    .forEach(n => { try { n.remove(); } catch (e) {} });
}

const _HD_FICHA_SECTION_ORDER = [
  "Informações Básicas", "Equipe e Responsáveis", "Briefing Estratégico",
  "Regras de Negócio e HUs", "Docs e Anexos",
  "Frames Escaneados", "User Interface", "Documentação Visual", "Conexões entre telas"
];
function _hdPrecedingSectionTitles(titleText) {
  return _HD_FICHA_SECTION_ORDER.slice(0, _HD_FICHA_SECTION_ORDER.indexOf(titleText)).reverse();
}

function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// ============================================================
// Design refs extraction (token-free)
// Walks the bundled skeleton and resolves real values via Plugin
// API. Posts progress events to the UI as it goes.
// ============================================================
// Em desenvolvimento (sem bundle), cai no fallback 'dev'.
/* global __HANDEX_VERSION__ */
const PLUGIN_VERSION = (typeof __HANDEX_VERSION__ !== 'undefined') ? __HANDEX_VERSION__ : 'dev';

// FEATURE OCULTA (2026-08) — handoff de contexto pra plugins de handoff
// especializado (ex: hac, foco em a11y), via pluginData no próprio frame.
// Implementada e pronta, mas deliberadamente DESLIGADA até o hac estar
// consolidado o suficiente para consumir esse dado — ativar trocando este
// valor pra true (sem outra mudança de código necessária). Ver
// _writeDscHandoffSummary().
//
// ANTES DE ATIVAR (checado em 2026-08-28, ainda vale): confirmar no
// repositório de CÓDIGO-FONTE real do hac (não a pasta de distribuição
// hac-plugin/, que é só bundle compilado) se existe consumo real de
// getSharedPluginData('dsc-handoff', 'frame-summary') — nesta data não foi
// encontrado. Não presumir que o hac evoluiu sem checar o source; se não
// achar o source no ambiente, perguntar o caminho antes de concluir a
// partir do bundle. Ver memória "handex_hac_handoff_oculto" para o
// histórico completo dessa checagem.
const DSC_HANDOFF_SUMMARY_ENABLED = false;

// Aviso "Lib legada — precisa migrar" (Fase 4). Desligado em 2026-10-01: a Super DSC | Web
// ainda não foi adotada nos projetos (só a Super App existe de fato), então pedir migração
// não faz sentido. Os dados (legacyLib/matchedTier/libLegada) continuam sendo calculados;
// religar = trocar para true. A UI recebe o valor no init-plugin (legacyLibHintEnabled).
const LEGACY_LIB_MIGRATION_HINT_ENABLED = false;

// Padrão visual do handoff do DSC (card de elemento: Fase B, 2026-10-02; Ficha INTEIRA desde
// 2026-10-05: fontes, tabelas, chips, painéis; estrutura das seções inalterada).
// false = visual antigo da Ficha toda (Inter, cards cinza, _hdBuildUiItemCard).
// Ver docs/referencia-handoff-dsc.md.
const FICHA_DSC_STYLE_ENABLED = true;

// â”€â”€ Shared Plugin Data (MCP / REST API readable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Usa setSharedPluginData (namespace 'handex') para que agentes externos
// (MCP, REST API) consigam ler o contexto de negócio embutido nos nodes.
// setPluginData seria sandboxed ao plugin ID — inacessível externamente.
// ═══ Persistência POR ARQUIVO E POR DESIGNER (2026-10-08, mesmo modelo do hac) ═══
// Antes: chave 'handoffData_' + figma.root.id. figma.root.id é "0:0" em TODO
// arquivo, então havia um registro só para todos os arquivos (projeto de um
// arquivo aparecia em outro). figma.fileKey não existe para plugin público.
// Agora:
//  - Fonte principal: cópia DENTRO do arquivo (figma.root, pluginData
//    PRIVADO do Handex -- outros plugins não leem; chave `handoffData@<userId>`,
//    fatiada em blocos de 80KB). Privado por princípio de LGPD (finalidade e
//    necessidade): equipe/e-mails do projeto não ficam expostos a terceiros.
//    Viaja com o arquivo, sobrevive a outro computador e é separada por
//    designer (quem usa o mesmo arquivo não sobrescreve o trabalho do outro).
//  - Reserva rápida: clientStorage com chave `handoffData:<fileId>:<userId>`,
//    onde fileId é gerado uma vez e gravado no próprio documento
//    (root pluginData 'handexFileId').
//  - Passar o projeto a outro designer = exportar/importar o backup JSON.
// Arquivo duplicado leva a cópia junto (mesma limitação aceita no hac).
const HX_DOC_CHUNK = 80 * 1024;
const HX_LEGACY_KEY = 'handoffData_0:0';

function _hxUserId() {
  try { return (figma.currentUser && figma.currentUser.id) || null; } catch (e) { return null; }
}

function _hxFileId() {
  try {
    let id = figma.root.getPluginData('handexFileId');
    if (!id) {
      id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      figma.root.setPluginData('handexFileId', id);
    }
    return id;
  } catch (e) { return null; }
}

// null = não dá para identificar o arquivo (ex.: só leitura): não persiste,
// em vez de arriscar misturar projetos.
function _hxStorageKey(base) {
  const f = _hxFileId();
  if (!f) return null;
  const u = _hxUserId();
  return u ? `${base}:${f}:${u}` : `${base}:${f}`;
}

function _hxDocPrefix() {
  const u = _hxUserId();
  return u ? `handoffData@${u}` : 'handoffData';
}

// Cópia para o documento sem o que é pesado e regenerável (imagem do frame
// escaneado) nem o histórico de versões (tem storage próprio).
function _hxForDoc(data) {
  const out = Object.assign({}, data);
  delete out._history;
  delete out.previousSnapshot;
  if (Array.isArray(out.frames)) {
    out.frames = out.frames.map(f => {
      if (!f || !f.specs || !f.specs.framePreview) return f;
      const specs = Object.assign({}, f.specs);
      delete specs.framePreview;
      return Object.assign({}, f, { specs });
    });
  }
  return out;
}

function _hxWriteDoc(data) {
  try {
    const node = figma.root;
    const prefix = _hxDocPrefix();
    const json = JSON.stringify(_hxForDoc(data));
    const total = Math.ceil(json.length / HX_DOC_CHUNK) || 1;
    for (let i = 0; i < total; i++) node.setPluginData(`${prefix}:${i}`, json.slice(i * HX_DOC_CHUNK, (i + 1) * HX_DOC_CHUNK));
    const previous = parseInt(node.getPluginData(`${prefix}:count`) || '0', 10) || 0;
    for (let i = total; i < previous; i++) node.setPluginData(`${prefix}:${i}`, '');
    node.setPluginData(`${prefix}:count`, String(total));
    node.setPluginData(`${prefix}:savedAt`, new Date().toISOString());
    return true;
  } catch (e) {
    console.warn('[handex] cópia no documento falhou:', e && e.message);
    return false;
  }
}

function _hxReadDoc() {
  try {
    const node = figma.root;
    const prefix = _hxDocPrefix();
    const total = parseInt(node.getPluginData(`${prefix}:count`) || '0', 10) || 0;
    if (!total) return null;
    let json = '';
    for (let i = 0; i < total; i++) {
      const chunk = node.getPluginData(`${prefix}:${i}`);
      if (!chunk) return null;
      json += chunk;
    }
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    console.warn('[handex] cópia no documento ilegível (ignorada):', e && e.message);
    return null;
  }
}

// Quanto de documentação há num estado salvo -- decide entre clientStorage e
// cópia do documento quando as duas existem e divergem (sem merge campo a
// campo, que poderia ressuscitar o que o designer apagou).
function _hxWeight(d) {
  if (!d || typeof d !== 'object') return -1;
  const frames = Array.isArray(d.frames) ? d.frames : [];
  return frames.length
    + frames.reduce((n, f) => n + ((f && f.createdSpecs) || []).length + ((f && f.measurements) || []).length, 0)
    + (Array.isArray(d.specs) ? d.specs.length : 0)
    + (Array.isArray(d.measurements) ? d.measurements.length : 0)
    + (Array.isArray(d.createdFlows) ? d.createdFlows.length : 0)
    + ((d.step1 && d.step1.titulo) ? 1 : 0);
}

async function _hxLoadState() {
  const key = _hxStorageKey('handoffData');
  let local = null;
  if (key) { try { local = await figma.clientStorage.getAsync(key); } catch (e) {} }
  const doc = _hxReadDoc();
  if (local && doc) return _hxWeight(doc) > _hxWeight(local) ? doc : local;
  return local || doc || null;
}

async function _hxSaveState(data) {
  const key = _hxStorageKey('handoffData');
  let ok = false;
  if (key) {
    const persisted = Object.assign({}, data);
    delete persisted._history;
    delete persisted.previousSnapshot;
    try { await figma.clientStorage.setAsync(key, persisted); ok = true; } catch (e) {
      console.warn('[handex] clientStorage falhou:', e && e.message);
    }
  }
  const docOk = _hxWriteDoc(data);
  return ok || docOk;
}

// Registro antigo (um só para todos os arquivos). Só é oferecido em arquivo
// sem documentação própria e que ainda não respondeu à pergunta.
async function _hxLegacyCandidate() {
  try {
    if (figma.root.getPluginData('handexLegacyAnswered') === '1') return null;
    const legacy = (await figma.clientStorage.getAsync(HX_LEGACY_KEY)) || (await figma.clientStorage.getAsync('handoffData'));
    if (!legacy || _hxWeight(legacy) <= 0) return null;
    return legacy;
  } catch (e) { return null; }
}

async function _writeSharedPluginData(data) {
  const NS = 'handex';
  try {
    // Contexto do projeto na página atual
    const project = {
      titulo:    data.step1?.titulo   || '',
      versao:    data.step1?.versao   || '',
      objetivo:  data.step1?.objetivo || '',
      status:    data.step1?.status   || 'rascunho',
      equipe:    data.step1?.equipe   || [],
      briefing:  (data.step2?.briefingQuestions || []).map(q => ({
        categoria: q.category || '',
        pergunta:  q.question || '',
        resposta:  q.answer   || ''
      })),
      regras: (data.step2?.regras || []).map(r => ({
        titulo: r.titulo || '',
        notas:  r.notas  || '',
        link:   r.link   || ''
      })),
      updatedAt: new Date().toISOString(),
      plugin: `handex@${PLUGIN_VERSION}`
    };
    figma.currentPage.setSharedPluginData(NS, 'project', JSON.stringify(project));
  } catch (e) {
    console.warn('[handex] setSharedPluginData(project) failed:', e);
  }

  // Contexto por frame — getNodeByIdAsync é O(1), não percorre a árvore
  for (const frame of (data.frames || [])) {
    try {
      const node = await figma.getNodeByIdAsync(frame.figmaId);
      if (!node) continue;
      node.setSharedPluginData(NS, 'context', JSON.stringify({
        nome:           frame.nome           || '',
        isNewComponent: frame.isNewComponent || false,
        // Agregado das specs do frame -- frame.excecoes (nível de frame)
        // nunca teve UI real de entrada; spec.excecoes é o único conceito vivo.
        excecoes: (frame.createdSpecs || []).flatMap(s => (s.excecoes || []).map(e => ({
          tipo:   e.tipo   || '',
          titulo: e.titulo || '',
          obs:    e.obs    || '',
          link:   e.anchor || '',
          spec:   s.name   || ''
        })))
      }));
      if (DSC_HANDOFF_SUMMARY_ENABLED) _writeDscHandoffSummary(node, frame);
    } catch (e) {
      // Node pode ter sido deletado — ignorar silenciosamente
    }
  }
}

// Handoff pra outros plugins de handoff especializado (ex: hac, foco em
// a11y) — namespace/key dedicados, sem herdar semântica de 'handex'/
// 'context' acima (consumidor e propósito diferentes). Exporta só o FATO
// BRUTO de quais componentes o scan já identificou no frame (componentKey
// + name + nodeType) -- o Handex não resolve lib de origem/categoria de
// a11y por design: essa lógica já existe e é mantida no lado consumidor,
// duplicá-la aqui criaria duas cópias divergentes da mesma resolução.
// Consumidor decide o que fazer com o dado; ausência do campo (frame nunca
// escaneado) é tratada como caso normal, não erro -- ver frame.specs null.
function _writeDscHandoffSummary(node, frame) {
  if (!frame.specs) return;
  try {
    const toEntry = (c) => ({ componentKey: c.componentKey, name: c.name, nodeType: c.nodeType });
    const summary = {
      schemaVersion: 1,
      writerPlugin: `handex@${PLUGIN_VERSION}`,
      updatedAt: new Date().toISOString(),
      frameId: frame.figmaId,
      components: (frame.specs.components || []).filter(c => c.componentKey).map(toEntry),
      icons: (frame.specs.icons || []).filter(c => c.componentKey).map(toEntry)
    };
    node.setSharedPluginData('dsc-handoff', 'frame-summary', JSON.stringify(summary));
  } catch (e) {
    // Não deve impedir o resto do save -- é dado complementar opcional
  }
}

// Marcador automático de Início/Fim (opt-in, checkbox "Marcar início e fim
// automaticamente" no modal "Conectar Frames"). Cada elemento que já tem um
// marcador desse tipo carrega o vínculo em pluginData
// (handexFlowStartMarkerId/handexFlowEndMarkerId) -- ao mover o marcador pra
// um novo elemento (ex: estender uma cadeia existente com mais uma tela),
// procura e remove o marcador antigo primeiro, nunca deixa dois Fins (ou
// dois Inícios) simultâneos no canvas por essa via automática.
async function _moveFlowEndpointMarker(targetNode, isStart, nextFlowNumber) {
  const dataKey = isStart ? 'handexFlowStartMarkerId' : 'handexFlowEndMarkerId';
  // Procura, entre os elementos já marcados por essa via automática, se
  // ALGUM aponta pra um marcador ainda vivo no canvas -- se o alvo já é
  // esse mesmo elemento, não faz nada (idempotente).
  const alreadyMarkerId = targetNode.getPluginData(dataKey);
  if (alreadyMarkerId) {
    const existing = await figma.getNodeByIdAsync(alreadyMarkerId);
    if (existing) return; // já é o próprio marcador atual, nada a mover
  }
  // Varre a página procurando quem mais carrega esse vínculo (o elemento
  // que tinha o marcador antes) -- remove o marcador antigo e limpa a
  // referência antes de criar o novo.
  let removedOldId = null;
  for (const node of figma.currentPage.children) {
    if (node.getPluginData && node.getPluginData(dataKey)) {
      const oldMarkerId = node.getPluginData(dataKey);
      if (oldMarkerId === alreadyMarkerId) continue;
      try {
        const oldMarker = await figma.getNodeByIdAsync(oldMarkerId);
        if (oldMarker) { oldMarker.remove(); removedOldId = oldMarkerId; }
      } catch (e) {}
      node.setPluginData(dataKey, '');
    }
  }
  const eventMsg = {
    flowType: isStart ? 'event_start' : 'event_end',
    flowName: isStart ? 'Início' : 'Fim',
    nextFlowNumber,
    flowId: `${Date.now()}-${isStart ? 'start' : 'end'}-${targetNode.id}`,
    // Broadcast próprio (flow-marker-moved) em vez do flow-created padrão --
    // precisa carregar removedOldId pro frontend tirar a entrada antiga da
    // lista antes de adicionar a nova, senão o item órfão (apontando pro nó
    // já removido do canvas) fica na lista até o usuário recarregar.
    suppressFlowCreatedBroadcast: true
  };
  const result = await _buildFlowConnection(targetNode, null, eventMsg);
  if (result) {
    targetNode.setPluginData(dataKey, result.id);
    figma.ui.postMessage({ type: 'flow-marker-moved', flow: result, removedOldId });
  }
}

// Lado da linha guia de uma especificação a partir das CAIXAS (elemento e
// card), não só dos centros (2026-10-05, print do Augusto: card acima de um
// header largo, linha saindo pela direita e entrando pela esquerda do card,
// cruzando o card no meio). Prefere o lado em que o card está totalmente
// separado do elemento; se houver dois (diagonal), o de maior folga; se as
// caixas se sobrepõem nos dois eixos, cai no critério antigo pelo centro.
function _hdSideFromBoxes(el, card) {
  const gaps = {
    right: card.x - (el.x + el.width),
    left: el.x - (card.x + card.width),
    bottom: card.y - (el.y + el.height),
    top: el.y - (card.y + card.height)
  };
  const free = Object.keys(gaps).filter(k => gaps[k] >= 0).sort((a, b) => gaps[b] - gaps[a]);
  if (free.length) return free[0];
  const dx = (card.x + card.width / 2) - (el.x + el.width / 2);
  const dy = (card.y + card.height / 2) - (el.y + el.height / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
}
// Mantém o lado pedido só se o card estiver mesmo daquele lado do elemento;
// senão a linha cruzaria o card ou o elemento, e o lado é recalculado.
function _hdValidLineSide(el, card, side) {
  const ok = {
    right: card.x >= el.x + el.width,
    left: card.x + card.width <= el.x,
    bottom: card.y >= el.y + el.height,
    top: card.y + card.height <= el.y
  };
  return (side && ok[side]) ? side : _hdSideFromBoxes(el, card);
}

// Corpo compartilhado da criação de fluxo — usado tanto pela criação normal
// (create-flow-connection, nodeA/nodeB vêm da seleção ativa) quanto pela
// recriação a partir de backup (recreate-flow-connection, nodeA/nodeB vêm
// de IDs salvos em handoffData.createdFlows). Ambos os handlers resolvem os
// nós antes de chamar esta função; ela cuida do desenho e do agrupamento.
// Roteamento ortogonal genérico entre dois pontos com lado definido
// (side: 'top'|'bottom'|'left'|'right') -- garante SEMPRE que o primeiro
// segmento saia reto na direção do lado de A e o último segmento entre
// reto na direção do lado de B, com o número mínimo de dobras de 90°
// necessário (1, 2 ou 3) para qualquer combinação de lados e posição
// relativa. Usado tanto por fluxos (_buildFlowConnection) quanto por specs
// (_rebuildSpecConnector/create-unified-spec).
//
// Estratégia: avança um trecho fixo (OFFSET) na direção normal de cada
// ponto -- A' = A + dir(A)*OFFSET, B' = B + dir(B)*OFFSET -- isso garante
// os segmentos A→A' e B'→B já retos nas direções certas. Depois conecta
// A'→B' com 0 dobras (se já alinhados), 1 dobra (se eixos perpendiculares)
// ou 2 dobras (se eixos paralelos, evitando cruzar os próprios elementos).
function _orthogonalElbowPoints(a, b, offset, offsetB) {
  // `offset` opcional (default 24, comportamento original intocado) --
  // parametrizado em 2026-09-29 só pra permitir que o Spec Express
  // (_qsBuildConnectorForCard) peça um afastamento maior antes da dobra
  // final, sem alterar as especificações tradicionais nem os conectores de
  // Fluxos de Tela, que continuam chamando sem esse argumento.
  // `offsetB` opcional (default = mesmo valor de `offset`) -- adicionado
  // 2026-09-29 pra resolver bug real reportado com print: no grid do Spec
  // Express, o offset de aproximação em B (o card) competia pelo mesmo
  // espaço físico do GRID_GAP entre colunas (48px) -- com offset=40 em
  // ambas as pontas, sobravam só 48-40=8px de folga entre a coluna de
  // trânsito do cotovelo e o card vizinho na mesma linha, imperceptível
  // ("linha colada na lateral"). Offsets assimétricos permitem manter o
  // respiro desejado do lado do elemento de origem (sem essa restrição de
  // grid dele) e um valor menor, compatível com o gap real, do lado do card.
  const OFFSET = typeof offset === 'number' ? offset : 24;
  const OFFSET_B = typeof offsetB === 'number' ? offsetB : OFFSET;
  const dirOf = (side) => ({
    top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  })[side];
  const dirA = dirOf(a.side), dirB = dirOf(b.side);
  const aPrime = { x: a.x + dirA.x * OFFSET, y: a.y + dirA.y * OFFSET };
  const bPrime = { x: b.x + dirB.x * OFFSET_B, y: b.y + dirB.y * OFFSET_B };

  const points = [aPrime];
  const aVertical = dirA.x === 0;
  const bVertical = dirB.x === 0;

  if (Math.abs(aPrime.x - bPrime.x) < 0.01 || Math.abs(aPrime.y - bPrime.y) < 0.01) {
    // A' e B' já alinhados num eixo -- 0 dobras entre eles, só o trecho
    // reto direto (o path final ainda tem as dobras em A e B, ver abaixo).
  } else if (aVertical !== bVertical) {
    // Eixos perpendiculares -- 1 dobra: o corner compartilha uma
    // coordenada com A' (mantém a direção de saída) e a outra com B'
    // (mantém a direção de entrada).
    const corner = aVertical ? { x: bPrime.x, y: aPrime.y } : { x: aPrime.x, y: bPrime.y };
    points.push(corner);
  } else {
    // Eixos paralelos -- 2 dobras (Z/U), coluna/linha de trânsito sempre
    // "por fora" dos dois pontos avançados na direção de saída de A (max
    // se 'right'/'bottom', min se 'left'/'top'), replicando o mesmo
    // raciocínio geométrico do caso original (evita voltar por dentro do
    // próprio elemento e degenerar segmentos).
    if (aVertical) {
      const midY = dirA.y > 0 ? Math.max(aPrime.y, bPrime.y) : Math.min(aPrime.y, bPrime.y);
      points.push({ x: aPrime.x, y: midY }, { x: bPrime.x, y: midY });
    } else {
      const midX = dirA.x > 0 ? Math.max(aPrime.x, bPrime.x) : Math.min(aPrime.x, bPrime.x);
      points.push({ x: midX, y: aPrime.y }, { x: midX, y: bPrime.y });
    }
  }
  points.push(bPrime);
  return points;
}

const _FLOW_COLOR_DEFAULT = '#22292e';
const _FLOW_COLORS = ['#22292e', '#005ca9', '#127527', '#b22c2c', '#a65e00', '#216e62', '#026273', '#64747a', '#ffffff'];
function _normalizeFlowColor(c) {
  const v = typeof c === 'string' ? c.trim().toLowerCase() : '';
  return _FLOW_COLORS.indexOf(v) !== -1 ? v : _FLOW_COLOR_DEFAULT;
}

async function _buildFlowConnection(nodeA, nodeB, msg) {
  const isEvent = msg.flowType === "event_start" || msg.flowType === "event_end";
  let boundsA = nodeA.absoluteBoundingBox || nodeA.absoluteRenderBounds;
  let boundsB = nodeB ? (nodeB.absoluteBoundingBox || nodeB.absoluteRenderBounds) : null;
  if (!boundsA) { figma.notify("Elemento de origem sem dimensões válidas."); return; }

  // orderIsIntentional: nodeA/nodeB já vêm na ordem real de clique do
  // usuário (resolvida por _resolveChainOrder antes de chamar esta função)
  // -- o swap espacial abaixo existe só pra quando a ordem é arbitrária
  // (ordem interna de camadas do Figma) e precisamos adivinhar a direção
  // pela posição. Com ordem intencional, inverter por posição reverteria
  // silenciosamente a intenção do usuário.
  if (!isEvent && boundsB && !msg.orderIsIntentional && (!msg.flowSide || msg.flowSide === 'auto')) {
    const cAx = boundsA.x + boundsA.width / 2, cAy = boundsA.y + boundsA.height / 2;
    const cBx = boundsB.x + boundsB.width / 2, cBy = boundsB.y + boundsB.height / 2;
    const adx = Math.abs(cBx - cAx), ady = Math.abs(cBy - cAy);
    const shouldSwap = adx >= ady ? (cBx < cAx) : (cBy < cAy);
    if (shouldSwap) { [nodeA, nodeB] = [nodeB, nodeA]; [boundsA, boundsB] = [boundsB, boundsA]; }
  }

  const getEdgePoints = (b) => ({
    top:    { x: b.x + b.width / 2,  y: b.y,              side: 'top'    },
    bottom: { x: b.x + b.width / 2,  y: b.y + b.height,   side: 'bottom' },
    left:   { x: b.x,                y: b.y + b.height / 2, side: 'left'  },
    right:  { x: b.x + b.width,      y: b.y + b.height / 2, side: 'right' }
  });

  const pointsA = getEdgePoints(boundsA);
  let bestA, bestB;

  if (msg.flowType === "event_start")      bestA = pointsA.left;
  else if (msg.flowType === "event_end")   bestA = pointsA.right;
  else if (msg.flowSide && msg.flowSide !== 'auto' && pointsA[msg.flowSide]) bestA = pointsA[msg.flowSide];

  if (nodeB && boundsB) {
    const pointsB = getEdgePoints(boundsB);
    if (!bestA) {
      const cAx = boundsA.x + boundsA.width / 2, cAy = boundsA.y + boundsA.height / 2;
      const cBx = boundsB.x + boundsB.width / 2, cBy = boundsB.y + boundsB.height / 2;
      const dx = cBx - cAx, dy = cBy - cAy;

      const noOverlapH = boundsA.x + boundsA.width <= boundsB.x || boundsB.x + boundsB.width <= boundsA.x;
      const noOverlapV = boundsA.y + boundsA.height <= boundsB.y || boundsB.y + boundsB.height <= boundsA.y;

      if (noOverlapH) {
        bestA = dx >= 0 ? pointsA.right  : pointsA.left;
        bestB = dx >= 0 ? pointsB.left   : pointsB.right;
      } else if (noOverlapV) {
        bestA = dy >= 0 ? pointsA.bottom : pointsA.top;
        bestB = dy >= 0 ? pointsB.top    : pointsB.bottom;
      } else {
        if (Math.abs(dx) >= Math.abs(dy)) { bestA = dx >= 0 ? pointsA.right : pointsA.left; bestB = dx >= 0 ? pointsB.left : pointsB.right; }
        else                              { bestA = dy >= 0 ? pointsA.bottom : pointsA.top;  bestB = dy >= 0 ? pointsB.top : pointsB.bottom; }
      }
    } else if (msg.flowSideB && msg.flowSideB !== 'auto' && pointsB[msg.flowSideB]) {
      // Lado de ENTRADA escolhido manualmente no card de destino (ver
      // flowEndSide em confirmFlowConnection, specifications.js) -- só se
      // aplica ao último card da cadeia, que nunca é origem de segmento
      // (por isso não tem equivalente a msg.flowSide pra ele).
      bestB = pointsB[msg.flowSideB];
    } else {
      let minDist = Infinity;
      for (const pB of Object.values(pointsB)) {
        const d = Math.sqrt(Math.pow(bestA.x - pB.x, 2) + Math.pow(bestA.y - pB.y, 2));
        if (d < minDist) { minDist = d; bestB = pB; }
      }
    }
  } else {
    if (msg.flowType === "event_start")     { bestA = pointsA.left;  bestB = { x: bestA.x - 60, y: bestA.y }; }
    else if (msg.flowType === "event_end")  { bestA = pointsA.right; bestB = { x: bestA.x + 60, y: bestA.y }; }
    else {
      bestA = bestA || pointsA.right;
      const offset = 40;
      bestB = { x: bestA.x, y: bestA.y };
      if (bestA.side === 'top') bestB.y -= offset;
      else if (bestA.side === 'bottom') bestB.y += offset;
      else if (bestA.side === 'left')   bestB.x -= offset;
      else bestB.x += offset;
    }
  }

  // Estilo de conexão só se aplica a linhas de conexão puras
  // (line_solid/line_dashed) -- diamond/event têm forma própria com
  // semântica fixa, moldar a linha que leva até elas confundiria a leitura
  // do fluxograma. 'straight' (padrão) | 'curved' (Bézier, grau -100..100,
  // deslocamento perpendicular em % da distância) | 'elbow' (esquinas retas
  // de 90°, 1 ou 2 dobras conforme a compatibilidade dos lados de saída/entrada).
  const _connectorStyle = (msg.flowType === "line_solid" || msg.flowType === "line_dashed") ? (msg.connectorStyle || 'straight') : 'straight';
  const _curvature = _connectorStyle === 'curved' ? (msg.curvature || 0) : 0;
  const _midX = (bestA.x + bestB.x) / 2, _midY = (bestA.y + bestB.y) / 2;
  let curveCtrl = { x: _midX, y: _midY };
  if (_curvature) {
    const dx = bestB.x - bestA.x, dy = bestB.y - bestA.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Perpendicular unitária ao segmento AB.
    const px = -dy / dist, py = dx / dist;
    const offset = (_curvature / 100) * dist * 0.5;
    curveCtrl = { x: _midX + px * offset, y: _midY + py * offset };
  }
  // Ponto médio real da curva (t=0.5 de uma quadrática) -- usado para
  // centralizar texto/chip de decisão; coincide com curveCtrl quando reto.
  const curveMid = _curvature
    ? { x: 0.25 * bestA.x + 0.5 * curveCtrl.x + 0.25 * bestB.x, y: 0.25 * bestA.y + 0.5 * curveCtrl.y + 0.25 * bestB.y }
    : { x: _midX, y: _midY };

  // Conector ortogonal (elbow): roteamento genérico com N dobras de 90° --
  // SEMPRE sai reto na direção do lado de A e entra reto na direção do
  // lado de B, qualquer que seja a combinação de lados (opostos, iguais ou
  // perpendiculares) e a posição relativa dos dois elementos. Usa
  // _orthogonalElbowPoints (ver função abaixo), compartilhada com o
  // conector de specs (_rebuildSpecConnector).
  const elbowPoints = (_connectorStyle === 'elbow' && bestA.side && bestB.side)
    ? _orthogonalElbowPoints(bestA, bestB)
    : [];
  // Midpoint do conector elbow para o chip de decisão: ponto médio do
  // segmento central do caminho completo (independente de quantas dobras
  // o roteamento ortogonal precisou) -- padrão visual já usado por
  // ferramentas de diagrama (draw.io/Visio).
  const _elbowFullPath = elbowPoints.length > 0 ? [bestA, ...elbowPoints, bestB] : null;
  const elbowMid = _elbowFullPath
    ? (() => {
        const midIdx = Math.floor((_elbowFullPath.length - 1) / 2);
        const p1 = _elbowFullPath[midIdx], p2 = _elbowFullPath[Math.min(midIdx + 1, _elbowFullPath.length - 1)];
        return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      })()
    : curveMid;

  const _flowColorHex = _normalizeFlowColor(msg.color);
  const strokeColor = hexToRgb(_flowColorHex);
  const line = figma.createVector();
  line.name = `Linha`;
  figma.currentPage.appendChild(line);
  line.x = 0; line.y = 0;
  line.strokes = [{ type: "SOLID", color: strokeColor }];
  line.strokeWeight = 2;
  if (msg.flowType === "line_dashed" || msg.flowType === "diamond_dashed") line.dashPattern = [6, 4];
  let linePath;
  if (elbowPoints.length > 0) {
    const segs = [bestA, ...elbowPoints, bestB].map(p => `${p.x} ${p.y}`).join(' L ');
    linePath = `M ${segs}`;
  } else if (_curvature) {
    linePath = `M ${bestA.x} ${bestA.y} Q ${curveCtrl.x} ${curveCtrl.y} ${bestB.x} ${bestB.y}`;
  } else {
    linePath = `M ${bestA.x} ${bestA.y} L ${bestB.x} ${bestB.y}`;
  }
  line.vectorPaths = [{ windingRule: "NONZERO", data: linePath }];

  let nodesToGroup = [line];

  // Marcador na ponta de ORIGEM (bestA) -- a linha já tinha seta em bestB
  // (destino) mas nada marcando de onde ela sai, deixando a extremidade
  // inicial "solta" visualmente. Eventos (Início/Fim) não entram aqui: já
  // têm seu próprio círculo grande de 96px como marcador (ver bloco isEvent
  // logo abaixo), que cobre esse papel. Losango pequeno em vez de bolinha
  // quando o segmento é de decisão (diamond/diamond_dashed) -- convenção
  // BPMN: círculo é reservado a eventos, losango marca gateway/decisão. O
  // losango GRANDE (64px) no meio da linha (ver bloco diamond abaixo) é o
  // próprio gateway; este aqui é só o marcador da ponta, no mesmo espírito
  // do dot de origem das linhas comuns.
  const isDecision = msg.flowType === "diamond" || msg.flowType === "diamond_dashed";
  if (!isEvent) {
    if (isDecision) {
      const r = 6;
      const originMarker = figma.createVector();
      figma.currentPage.appendChild(originMarker);
      originMarker.x = 0; originMarker.y = 0;
      originMarker.vectorPaths = [{ windingRule: "NONZERO", data: `M ${bestA.x} ${bestA.y - r} L ${bestA.x + r} ${bestA.y} L ${bestA.x} ${bestA.y + r} L ${bestA.x - r} ${bestA.y} Z` }];
      originMarker.fills = [{ type: "SOLID", color: strokeColor }];
      originMarker.strokes = [];
      nodesToGroup.push(originMarker);
    } else {
      const originDotR = 4;
      const originDot = figma.createEllipse();
      figma.currentPage.appendChild(originDot);
      originDot.resize(originDotR * 2, originDotR * 2);
      originDot.x = bestA.x - originDotR;
      originDot.y = bestA.y - originDotR;
      originDot.fills = [{ type: "SOLID", color: strokeColor }];
      originDot.strokes = [];
      nodesToGroup.push(originDot);
    }
  }

  if (msg.flowType !== "event_start") {
    // Ângulo da seta: direção do ÚLTIMO segmento antes de bestB. Com elbow,
    // é o penúltimo ponto do path (mais simples que a tangente de Bézier --
    // é constante ao longo do segmento reto, não varia por t). Com
    // curvatura, é a tangente exata (bestB - curveCtrl); reto, os dois
    // casos coincidem porque curveCtrl é o midpoint quando _curvature é 0.
    const arrowFrom = elbowPoints.length > 0 ? elbowPoints[elbowPoints.length - 1] : curveCtrl;
    const angle = Math.atan2(bestB.y - arrowFrom.y, bestB.x - arrowFrom.x);
    const arrowSize = 8;
    const arrow = figma.createVector();
    figma.currentPage.appendChild(arrow);
    arrow.x = 0; arrow.y = 0;
    arrow.strokes = [{ type: "SOLID", color: strokeColor }];
    arrow.strokeWeight = 2; arrow.strokeCap = "ROUND"; arrow.strokeJoin = "ROUND";
    const x1 = bestB.x - arrowSize * Math.cos(angle - Math.PI / 6);
    const y1 = bestB.y - arrowSize * Math.sin(angle - Math.PI / 6);
    const x2 = bestB.x - arrowSize * Math.cos(angle + Math.PI / 6);
    const y2 = bestB.y - arrowSize * Math.sin(angle + Math.PI / 6);
    arrow.vectorPaths = [{ windingRule: "NONZERO", data: `M ${x1} ${y1} L ${bestB.x} ${bestB.y} L ${x2} ${y2}` }];
    nodesToGroup.push(arrow);
  }

  // Id estável do fluxo, gerado no frontend (não é o node.id do Figma) --
  // sobrevive a recriações (regroup manual, restore de backup via
  // recreate-flow-connection), permitindo que a inserção incremental na
  // ficha (insert-flows-in-ficha) reconheça "este é o mesmo fluxo" mesmo
  // após o grupo visual antigo ter sido substituído por um novo node.
  const _flowId = msg.flowId || String(Date.now());
  const _flowExtra = {
    sourceId: nodeA.id,
    targetId: nodeB ? nodeB.id : null,
    sourceName: nodeA.name,
    targetName: nodeB ? nodeB.name : null,
    decisionText: msg.decisionText || null,
    flowSide: msg.flowSide || 'auto',
    connectorStyle: _connectorStyle,
    curvature: _curvature,
    color: _flowColorHex
  };
  // Preenchido pelo branch que efetivamente criar o grupo -- usado pelo
  // resync em lote (resync-all-flows) pra saber o novo id do fluxo
  // recriado sem depender de escutar flow-created assincronamente.
  let _flowResult = null;

  if (msg.flowType === "diamond" || msg.flowType === "diamond_dashed") {
    const midX = (bestA.x + bestB.x) / 2, midY = (bestA.y + bestB.y) / 2;
    const size = 64, halfSize = size / 2;
    const shape = figma.createVector();
    figma.currentPage.appendChild(shape);
    shape.x = 0; shape.y = 0;
    shape.vectorPaths = [{ windingRule: "NONZERO", data: `M ${midX} ${midY - halfSize} L ${midX + halfSize} ${midY} L ${midX} ${midY + halfSize} L ${midX - halfSize} ${midY} Z` }];
    shape.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    shape.strokes = [{ type: "SOLID", color: strokeColor }];
    shape.strokeWeight = 2;
    if (msg.flowType === "diamond_dashed") shape.dashPattern = [6, 4];
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      const symbol = figma.createText();
      figma.currentPage.appendChild(symbol);
      symbol.fontName = { family: "Inter", style: "Bold" };
      symbol.characters = msg.decisionText || "IF";
      symbol.fontSize = 11;
      symbol.textAlignHorizontal = "CENTER"; symbol.textAlignVertical = "CENTER";
      symbol.fills = [{ type: "SOLID", color: strokeColor }];
      symbol.resize(size * 0.8, symbol.height);
      symbol.x = midX - symbol.width / 2; symbol.y = midY - symbol.height / 2;
      nodesToGroup.push(shape, symbol);
      const friendlyName = msg.flowName || "Decisão";
      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | decisao] ${friendlyName}`;
      finalGroup.locked = true;
      finalGroup.setPluginData('handexCategory', 'fluxo');
      finalGroup.setPluginData('handexFlowId', _flowId);
      finalGroup.setPluginData('handexFlowColor', _flowColorHex);
      _hdMoveToCategorySection(finalGroup, 'fluxo');
      _flowResult = { id: finalGroup.id, flowUid: _flowId, name: friendlyName, type: msg.flowType, ..._flowExtra };
    } catch (e) { console.error(e); }
  } else if (isEvent) {
    const isStart = msg.flowType === "event_start";
    const circle = figma.createEllipse();
    figma.currentPage.appendChild(circle);
    circle.resize(96, 96);
    circle.x = bestB.x - 48; circle.y = bestB.y - 48;
    circle.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    circle.strokes = [{ type: "SOLID", color: isStart ? { r: 0.0706, g: 0.4588, b: 0.1529 } : { r: 0.698, g: 0.1725, b: 0.1725 } }];
    circle.strokeWeight = isStart ? 3 : 5;
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      const label = figma.createText();
      figma.currentPage.appendChild(label);
      label.fontName = { family: "Inter", style: "Bold" };
      label.characters = isStart ? "INÍCIO" : "FIM";
      label.fontSize = 11;
      label.textAlignHorizontal = "CENTER"; label.textAlignVertical = "CENTER";
      label.fills = circle.strokes;
      label.x = circle.x + circle.width / 2 - label.width / 2;
      label.y = circle.y + circle.height / 2 - label.height / 2;
      nodesToGroup.push(circle, label);
      const friendlyName = msg.flowName || (isStart ? "Início" : "Fim");
      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | ${isStart ? 'inicio' : 'fim'}] ${friendlyName}`;
      finalGroup.locked = true;
      finalGroup.setPluginData('handexCategory', 'fluxo');
      finalGroup.setPluginData('handexFlowId', _flowId);
      finalGroup.setPluginData('handexFlowColor', _flowColorHex);
      _hdMoveToCategorySection(finalGroup, 'fluxo');
      _flowResult = { id: finalGroup.id, flowUid: _flowId, name: friendlyName, type: msg.flowType, ..._flowExtra };
    } catch (e) { console.error(e); }
  } else if (msg.decisionText && (msg.flowType === "line_solid" || msg.flowType === "line_dashed")) {
    const midX = elbowMid.x, midY = elbowMid.y;
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      const textNode = figma.createText();
      textNode.name = "Texto";
      textNode.fontName = { family: "Inter", style: "Bold" };
      textNode.characters = msg.decisionText;
      textNode.fontSize = 10;
      textNode.textAlignHorizontal = "CENTER"; textNode.textAlignVertical = "CENTER";
      textNode.fills = [{ type: "SOLID", color: strokeColor }];
      const paddingH = 8, paddingV = 4;
      const chipBg = figma.createRectangle();
      figma.currentPage.appendChild(chipBg);
      chipBg.name = "Fundo";
      chipBg.resize(textNode.width + paddingH * 2, textNode.height + paddingV * 2);
      chipBg.cornerRadius = 6;
      chipBg.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      chipBg.strokes = [{ type: "SOLID", color: strokeColor }]; chipBg.strokeWeight = 1;
      chipBg.x = midX - chipBg.width / 2; chipBg.y = midY - chipBg.height / 2;
      figma.currentPage.appendChild(textNode);
      textNode.x = chipBg.x + paddingH; textNode.y = chipBg.y + paddingV;
      nodesToGroup.push(chipBg, textNode);
      const friendlyName = msg.flowName || "Conexão";
      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | conexao] ${friendlyName}`;
      finalGroup.locked = true;
      finalGroup.setPluginData('handexCategory', 'fluxo');
      finalGroup.setPluginData('handexFlowId', _flowId);
      finalGroup.setPluginData('handexFlowColor', _flowColorHex);
      _hdMoveToCategorySection(finalGroup, 'fluxo');
      _flowResult = { id: finalGroup.id, flowUid: _flowId, name: friendlyName, type: msg.flowType, ..._flowExtra };
    } catch (e) { console.error(e); }
  } else {
    const friendlyName = msg.flowName || "Conexão";
    const finalGroup = figma.group(nodesToGroup, figma.currentPage);
    finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | conexao] ${friendlyName}`;
    finalGroup.locked = true;
    finalGroup.setPluginData('handexCategory', 'fluxo');
    finalGroup.setPluginData('handexFlowId', _flowId);
      finalGroup.setPluginData('handexFlowColor', _flowColorHex);
    _hdMoveToCategorySection(finalGroup, 'fluxo');
    _flowResult = { id: finalGroup.id, flowUid: _flowId, name: friendlyName, type: msg.flowType, ..._flowExtra };
  }

  // resync-all-flows agrega tudo num único flows-resynced/notify no fim do
  // lote -- sem essa flag, cada item recriado dispararia seu próprio
  // flow-created e duplicaria a entrada em handoffData.createdFlows (que já
  // é reescrita pela UI a partir do resultado agregado).
  if (!msg.suppressFlowCreatedBroadcast) {
    if (_flowResult) figma.ui.postMessage({ type: 'flow-created', flow: _flowResult });
    figma.notify("Fluxo criado!");
  }
  return _flowResult;
}

figma.ui.onmessage = async (msg) => {
  // Antes de qualquer await: garante o cache pronto pro handler desta mesma
  // mensagem (scan, Anotação, Ficha) e pras seguintes.
  if (msg.referenceTokens) _refSkeletonCache = msg.referenceTokens;
  if (msg.type === 'ui-ready') {
    try { _hdBringAnnotationLayersToFront(); } catch (e) {}
    // UI (re)conectando: qualquer captura do Spec Express anterior morreu com
    // a UI antiga. Se o modo estava ligado, a janela pode ter ficado encolhida
    // na altura da barra (sem botão de voltar) -- devolve o tamanho normal.
    if (_quickSpecCaptureModeActive) {
      figma.ui.resize(480, 750);
    }
    _quickSpecCaptureModeActive = false;
    _quickSpecCaptureSelection = [];
    clearTimeout(_quickSpecCaptureCountDebounceTimer);
    const currentUser = figma.currentUser
      ? { id: figma.currentUser.id, name: figma.currentUser.name, photoUrl: figma.currentUser.photoUrl }
      : null;
    const theme = figma.ui.theme || 'light';
    const sel = figma.currentPage.selection;
    const projectName = figma.root.name || figma.currentPage.name || '';
    try {
      // Por arquivo e por designer (2026-10-08) -- ver _hxLoadState. Registro
      // antigo (global) só é oferecido; o designer decide se é deste arquivo.
      const savedState = await _hxLoadState();
      let legacyCandidate = null;
      // <= 1: a abertura já grava título/designer sozinha; sem documentação
      // real neste arquivo, a pergunta continua valendo até ser respondida.
      if (!savedState || _hxWeight(savedState) <= 1) {
        const legacy = await _hxLegacyCandidate();
        if (legacy) {
          const frames = Array.isArray(legacy.frames) ? legacy.frames.length : 0;
          legacyCandidate = { titulo: (legacy.step1 && legacy.step1.titulo) || '', frames };
        }
      }
      // Onboarding é por instalação do plugin, não por handoffData/projeto —
      // chave própria, sobrevive a "Limpar Dados do plugin" de propósito.
      const onboardingSeen = await figma.clientStorage.getAsync('handex-onboarding-seen');
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        projectName,
        savedState: savedState || null,
        legacyCandidate,
        onboardingSeen: onboardingSeen || null,
        hasRefSkeleton: !!_refSkeletonCache,
        legacyLibHintEnabled: LEGACY_LIB_MIGRATION_HINT_ENABLED
      });
    } catch (err) {
      console.error("Initialization error (continuing without saved state):", err);
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        projectName,
        savedState: null,
        onboardingSeen: null,
        hasRefSkeleton: !!_refSkeletonCache,
        legacyLibHintEnabled: LEGACY_LIB_MIGRATION_HINT_ENABLED
      });
    }
    return;
  }

  if (msg.type === 'get-project-name') {
    figma.ui.postMessage({ type: 'project-name', name: figma.root.name || figma.currentPage.name || '' });
    return;
  }

  if (msg.type === 'refresh-spec-card') {
    const grpNode = await figma.getNodeByIdAsync(msg.nodeId);
    if (!grpNode) { figma.ui.postMessage({ type: 'toast', message: 'Card não encontrado no canvas.', kind: 'error' }); return; }
    // Find the spec card frame inside the group (nome atual 'Spec Notes', legado 'Ficha' ou '.../Ficha')
    const children = 'children' in grpNode ? grpNode.children : [grpNode];
    const cardFrame = children.find(n => n.name && (n.name === 'Spec Notes' || n.name === 'Ficha' || n.name.endsWith('/Ficha')));
    if (!cardFrame || cardFrame.type !== 'FRAME') { figma.ui.postMessage({ type: 'toast', message: 'Card não encontrado no grupo.', kind: 'error' }); return; }
    // Remove existing exception frame if any (named /Exceções)
    const existing = cardFrame.children.find(n => n.name === '[Spec] Exceções');
    if (existing) existing.remove();
    if (msg.hasOwnProperty('note')) {
      const existingNote = cardFrame.children.find(n => n.name === '[Spec] Nota');
      if (existingNote) existingNote.remove();
      if (msg.note) {
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const desc = figma.createText();
        desc.name = '[Spec] Nota';
        desc.fontName = { family: "Inter", style: "Regular" };
        desc.fontSize = 11;
        desc.fills = [{ type: "SOLID", color: { r: 0.3922, g: 0.4549, b: 0.4784 } }];
        desc.characters = msg.note;
        desc.textAutoResize = "WIDTH_AND_HEIGHT";
        const propsFrame = cardFrame.children.find(n => n.name === 'Propriedades');
        const insertIdx = propsFrame ? cardFrame.children.indexOf(propsFrame) : cardFrame.children.length;
        cardFrame.insertChild(insertIdx, desc);
      }
    }
    if (msg.excecoes && msg.excecoes.length > 0) {
      (async () => {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const excFrame = figma.createFrame();
        excFrame.name = '[Spec] Exceções';
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 4;
        excFrame.fills = [{ type: "SOLID", color: { r: 0.9686, g: 0.9804, b: 0.9804 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.251, g: 0.2941, b: 0.3216 } }];
        excTitle.characters = `CENÁRIOS (${msg.excecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        const _excTypeEmoji = { 'Sucesso': '✅', 'Erro': '❌', 'Alerta': '⚠️', 'Confirmação': '❓' };
        msg.excecoes.forEach(exc => {
          const t = figma.createText();
          t.fontName = { family: "Inter", style: "Regular" };
          t.fontSize = 10;
          t.fills = [{ type: "SOLID", color: { r: 0.1333, g: 0.1608, b: 0.1804 } }];
          t.characters = `${_excTypeEmoji[exc.tipo] || '❔'} ${exc.tipo || 'Geral'} — ${exc.titulo || ''}`;
          t.textAutoResize = "WIDTH_AND_HEIGHT";
          excFrame.appendChild(t);
        });
        cardFrame.appendChild(excFrame);
        figma.ui.postMessage({ type: 'toast', message: 'Card atualizado com os cenários.', kind: 'success' });
      })();
    } else {
      figma.ui.postMessage({ type: 'toast', message: 'Card atualizado.', kind: 'success' });
    }
    return;
  }

  if (msg.type === 'inject-exception-to-spec-canvas') {
    (async () => {
      const exc = msg.exc || {};
      const sel = figma.currentPage.selection;
      if (!sel || sel.length === 0) {
        figma.notify('Selecione um card de especificação no canvas.');
        return;
      }
      const node = sel[0];
      let cardFrame = null;
      const _isSpecCardName = (name) => name === 'Spec Notes' || name === 'Ficha' || name.endsWith('/Ficha');
      if (node.name && _isSpecCardName(node.name) && node.type === 'FRAME') {
        cardFrame = node;
      } else if ((node.type === 'GROUP' || node.type === 'FRAME') && node.children) {
        cardFrame = node.children.find(n => n.name && _isSpecCardName(n.name));
      }
      if (!cardFrame && node.parent && (node.parent.type === 'GROUP' || node.parent.type === 'FRAME')) {
        cardFrame = node.parent.children.find(n => n.name && _isSpecCardName(n.name));
      }
      if (!cardFrame) {
        figma.notify('Card de especificação não encontrado. Selecione o card no canvas.');
        return;
      }
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      let excFrame = cardFrame.children.find(n => n.name === '[Spec] Exceções');
      if (!excFrame) {
        excFrame = figma.createFrame();
        excFrame.name = '[Spec] Exceções';
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 4;
        excFrame.fills = [{ type: "SOLID", color: { r: 0.9686, g: 0.9804, b: 0.9804 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const hdr = figma.createText();
        hdr.fontName = { family: "Inter", style: "Bold" };
        hdr.fontSize = 9;
        hdr.fills = [{ type: "SOLID", color: { r: 0.251, g: 0.2941, b: 0.3216 } }];
        hdr.characters = 'CENÁRIOS (0)';
        hdr.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(hdr);
        cardFrame.appendChild(excFrame);
      }
      const existingCount = excFrame.children.length - 1;
      const newCount = existingCount + 1;
      const hdrNode = excFrame.children[0];
      if (hdrNode && hdrNode.type === 'TEXT') {
        hdrNode.characters = `CENÁRIOS (${newCount})`;
      }
      const _excTypeRgb = {
        'Erro':        { r: 0.698, g: 0.1725, b: 0.1725 },
        'Alerta':      { r: 0.651, g: 0.3686, b: 0 },
        'Sucesso':     { r: 0.0706, g: 0.4588, b: 0.1529 },
        'Confirmação': { r: 0, g: 0.3608, b: 0.6627 },
      };
      const excRow = figma.createFrame();
      excRow.layoutMode = "HORIZONTAL";
      excRow.itemSpacing = 6;
      excRow.fills = [];
      excRow.primaryAxisSizingMode = "AUTO";
      excRow.counterAxisSizingMode = "AUTO";
      excRow.counterAxisAlignItems = "CENTER";
      const typeColor = _excTypeRgb[exc.tipo] || { r: 0.3922, g: 0.4549, b: 0.4784 };
      const _excTypeEmoji = { 'Sucesso': '✅', 'Erro': '❌', 'Alerta': '⚠️', 'Confirmação': '❓' };
      const typeLabel = figma.createText();
      typeLabel.fontName = { family: "Inter", style: "Bold" };
      typeLabel.fontSize = 9;
      typeLabel.fills = [{ type: "SOLID", color: typeColor }];
      typeLabel.characters = `${_excTypeEmoji[exc.tipo] || '❔'} ${(exc.tipo || 'GERAL').toUpperCase()}`;
      typeLabel.textAutoResize = "WIDTH_AND_HEIGHT";
      const titleLabel = figma.createText();
      titleLabel.fontName = { family: "Inter", style: "Regular" };
      titleLabel.fontSize = 10;
      titleLabel.fills = [{ type: "SOLID", color: { r: 0.1333, g: 0.1608, b: 0.1804 } }];
      titleLabel.characters = `${exc.titulo || ''}${exc.obs ? ' — ' + exc.obs : ''}`;
      titleLabel.textAutoResize = "WIDTH_AND_HEIGHT";
      excRow.appendChild(typeLabel);
      excRow.appendChild(titleLabel);
      excFrame.appendChild(excRow);
      figma.ui.postMessage({ type: 'toast', message: 'Cenário injetado no card da especificação.', kind: 'success' });
    })();
    return;
  }

  if (msg.type === 'get-context-name') {
    const sel = figma.currentPage.selection;
    const name = sel.length > 0 ? sel[0].name : '';
    figma.ui.postMessage({ type: 'context-name', name });
    return;
  }

  if (msg.type === 'get-selection-info') {
    const validTypes = ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION', 'GROUP'];
    const selection = figma.currentPage.selection.filter(n => validTypes.includes(n.type));
    if (selection.length > 0) {
      figma.ui.postMessage({
        type: 'selection-info',
        nodes: selection.map(n => ({ nodeId: n.id, name: n.name }))
      });
    } else {
      figma.ui.postMessage({
        type: 'selection-info',
        nodes: [],
        error: 'Nenhum frame selecionado no canvas.'
      });
    }
    return;
  }
  if (msg.type === "resize") {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  // Registro antigo (um só para todos os arquivos): o designer disse se o
  // projeto pertence a este arquivo (2026-10-08). Sim = migra para o escopo
  // arquivo + designer e apaga o antigo (não aparece em outros arquivos).
  // Não = este arquivo não pergunta mais; o antigo fica para outro arquivo.
  if (msg.type === 'legacy-project-answer') {
    try {
      if (msg.accept) {
        const legacy = (await figma.clientStorage.getAsync(HX_LEGACY_KEY)) || (await figma.clientStorage.getAsync('handoffData'));
        if (legacy) {
          await _hxSaveState(legacy);
          await figma.clientStorage.setAsync(HX_LEGACY_KEY, null);
          await figma.clientStorage.setAsync('handoffData', null);
        }
      }
      try { figma.root.setPluginData('handexLegacyAnswered', '1'); } catch (e) {}
      figma.ui.postMessage({ type: 'legacy-project-answered', accepted: !!msg.accept });
    } catch (e) {
      figma.ui.postMessage({ type: 'legacy-project-answered', accepted: false, error: String((e && e.message) || e) });
    }
    return;
  }

  if (msg.type === 'clear-cache') {
    const keys = [
      _hxStorageKey('handoffData'),
      _hxStorageKey('handex-scan-cache-v1'),
      _hxStorageKey('handex-history'),
      'handex-audit-refs-v1',
    ].filter(Boolean);
    try {
      await Promise.all(keys.map(k => figma.clientStorage.setAsync(k, null)));
      _hxWriteDoc({});
      // Limpa também os sharedPluginData da página atual
      try { figma.currentPage.setSharedPluginData('handex', 'project', ''); } catch (e) {}
      figma.ui.postMessage({ type: 'cache-cleared' });
    } catch (e) {
      console.error("clear-cache failed:", e);
      figma.notify('Erro ao limpar cache', { error: true });
    }
    return;
  }

  if (msg.type === 'delete-canvas-content') {
    // Todo conteúdo criado pelo Handex é agrupado num único nó de topo
    // (mainContainer da ficha, specGroup, grupo de medida, finalGroup/
    // legendFrame de fluxo) -- não sobram nós-irmãos soltos DENTRO desse
    // grupo. Desde 2026-09-11 esses nós de topo moram dentro das Sections
    // "Handex | *" (ver _hdMoveToCategorySection), não mais soltos como
    // filhos diretos da página -- por isso a varredura cobre também os
    // filhos de cada Section, além de figma.currentPage.children (conteúdo
    // legado, criado antes da migração pra Sections).
    // handexCategory (pluginData) é a fonte de verdade; prefixo de nome é fallback
    // para conteúdo criado antes desta marcação existir.
    const wanted = {
      ficha: !!msg.ficha,
      spec: !!msg.specs,
      medida: !!msg.medidas,
      fluxo: !!msg.fluxos,
      quickspec: !!msg.quickspec,
    };

    const matchCategory = (node) => {
      const tag = node.getPluginData('handexCategory');
      if (tag) return wanted[tag] ? tag : null;
      if (!node.name) return null;
      if (wanted.ficha && node.name.startsWith('Handex | Ficha de Projeto')) return 'ficha';
      if (wanted.spec && (node.name.startsWith('[Spec | ') || node.name.startsWith('[Spec]'))) return 'spec';
      if (wanted.medida && node.name.startsWith('[Medida]')) return 'medida';
      if (wanted.fluxo && node.name.startsWith('[Fluxo')) return 'fluxo';
      if (wanted.quickspec && (node.name.startsWith('Anotação') || node.name.startsWith('Spec Rápida') || node.name.startsWith('Spec Express'))) return 'quickspec';
      return null;
    };

    const counts = { ficha: 0, spec: 0, medida: 0, fluxo: 0, quickspec: 0 };
    const toRemove = [];
    const _handexSections = [];

    figma.currentPage.children.forEach(node => {
      if (node.type === 'SECTION' && node.getPluginData('handexCategorySection')) {
        _handexSections.push(node);
        return;
      }
      const cat = matchCategory(node);
      if (cat) {
        toRemove.push(node);
        counts[cat]++;
      }
    });
    _handexSections.forEach(section => {
      section.children.forEach(node => {
        const cat = matchCategory(node);
        if (cat) {
          toRemove.push(node);
          counts[cat]++;
        }
      });
    });

    // Marcador (contour procedural) fica fora do specGroup, vinculado só por
    // pluginData (handexSpecMarkerId) -- remover o specGroup sozinho não o
    // leva junto (mesmo cuidado de delete-node), senão ele fica órfão no
    // canvas após a limpeza em massa.
    for (const node of toRemove) {
      const markerId = node.getPluginData && node.getPluginData('handexSpecMarkerId');
      if (markerId) {
        const marker = await figma.getNodeByIdAsync(markerId);
        if (marker) { try { marker.remove(); } catch (e) {} }
      }
    }
    // Mesmo cuidado pros cards do Spec Express: o vínculo (contour/Conector/
    // DotInicio/DotFim, handexQuickSpecMarkerFor) é por CARD individual, não
    // pelo wrapper (que é o que está em toRemove) -- precisa achatar os
    // filhos de cada wrapper marcado pra "quickspec" antes de coletar os
    // marcadores, senão eles ficam órfãos após a limpeza em massa.
    //
    // Bug real de performance corrigido (2026-09-25, reportado pelo
    // usuário: Figma trava por vários segundos ao confirmar a exclusão) --
    // a versão anterior usava figma.currentPage.findAll aqui, uma varredura
    // RECURSIVA de toda a árvore da página (pode ter milhares de nós num
    // arquivo real de produto). Os marcadores soltos do Spec Express já são
    // movidos pra dentro da mesma Section "Handex | Spec Express" do
    // wrapper (ver _qsBuildConnectorForCard/_hdMoveToCategorySection) -- a
    // busca não precisa nunca sair dali, então usa os filhos DIRETOS da
    // Section (já coletados em _handexSections acima), sem tocar o resto da
    // árvore do documento.
    if (wanted.quickspec) {
      const quickSpecCardIds = new Set(
        toRemove
          .filter(n => n.getPluginData('handexCategory') === 'quickspec' && 'children' in n)
          .flatMap(wrapper => wrapper.children.map(c => c.id))
      );
      if (quickSpecCardIds.size > 0) {
        _handexSections.forEach(section => {
          section.children.forEach(n => {
            const markerFor = n.getPluginData && n.getPluginData('handexQuickSpecMarkerFor');
            if (markerFor && quickSpecCardIds.has(markerFor)) {
              try { n.remove(); } catch (e) {}
            }
          });
        });
      }
    }
    toRemove.forEach(node => { try { node.remove(); } catch (e) {} });

    // Section "Handex | *" de uma categoria marcada que ficou vazia sai junto
    // (2026-10-05, pedido do Augusto: as Sections sobravam vazias na árvore).
    // Só remove se não sobrou nada dentro -- conteúdo do designer colocado
    // na Section por engano nunca é apagado junto.
    _handexSections.forEach(section => {
      const cat = section.getPluginData('handexCategorySection');
      if (!wanted[cat]) return;
      try { if (!section.removed && section.children.length === 0) section.remove(); } catch (e) {}
    });

    figma.ui.postMessage({ type: 'canvas-content-deleted', counts });
    return;
  }

  if (msg.type === 'scan-cache-save') {
    const scanKey = _hxStorageKey('handex-scan-cache-v1');
    if (scanKey) figma.clientStorage.setAsync(scanKey, msg.data).catch(e =>
      console.warn("scan-cache-save failed:", e)
    );
    return;
  }

  if (msg.type === 'scan-cache-load') {
    try {
      const scanKey = _hxStorageKey('handex-scan-cache-v1');
      const cached = scanKey ? await figma.clientStorage.getAsync(scanKey) : null;
      figma.ui.postMessage({ type: 'scan-cache-loaded', data: cached || null });
    } catch (e) {
      figma.ui.postMessage({ type: 'scan-cache-loaded', data: null });
    }
    return;
  }

  // â”€â”€â”€ Handoff snapshots / history (for diff between versions) â”€â”€â”€â”€â”€â”€â”€â”€
  if (msg.type === "snapshot-load") {
    try {
      const key = _hxStorageKey("handex-history");
      const history = key ? await figma.clientStorage.getAsync(key) : null;
      figma.ui.postMessage({ type: "snapshot-history", history: Array.isArray(history) ? history : [] });
    } catch (e) {
      figma.ui.postMessage({ type: "snapshot-history", history: [] });
    }
    return;
  }

  if (msg.type === "snapshot-save") {
    try {
      const key = _hxStorageKey("handex-history");
      if (!key) return;
      const existing = (await figma.clientStorage.getAsync(key)) || [];
      const next = [msg.snapshot].concat(Array.isArray(existing) ? existing : []).slice(0, 5);
      await figma.clientStorage.setAsync(key, next);
    } catch (e) {
      console.error("snapshot-save failed:", e);
    }
    return;
  }

  // check-frames-relevance: pergunta leve (nenhuma escrita no canvas) usada
  // ANTES de inserir/gerar a seção "Frames Escaneados" -- o frontend chama
  // isso pra decidir se mostra o modal "nada fora do DSC, incluir mesmo
  // assim?" (só faz sentido perguntar quando NENHUM frame é relevante hoje).
  if (msg.type === 'check-frames-relevance') {
    const _frames = (msg.data && msg.data.frames) || [];
    const hasRelevantFrame = _frames.some(_hdFrameIsRelevantForFicha);
    figma.ui.postMessage({ type: 'frames-relevance-checked', hasRelevantFrame, hasAnyFrame: _frames.length > 0 });
    return;
  }

  // insert-ficha-section: atualiza SÓ uma subseção da Ficha existente
  // (tokens/specs/medidas/fluxos), preservando as demais como estavam.
  // Se a Ficha ainda não existe para este projeto, não duplica a lógica de
  // criação completa (create-handoff tem ~1050 linhas) -- devolve um sinal
  // pro frontend disparar create-handoff normalmente, que já cobre esse
  // caso (ficha nova) pelo caminho já validado.
  if (msg.type === 'insert-ficha-section') {
    try {
      const data = msg.data;
      const _titulo = (data.step1?.titulo || 'Projeto').replace(/\//g, '-');
      const existingFicha = _hdFindExistingFicha(_titulo);

      if (!existingFicha) {
        figma.ui.postMessage({ type: 'ficha-section-needs-full-create', section: msg.section });
        return;
      }

      const content = existingFicha.findOne(n => n.type === 'FRAME' && n.name === 'Handex | Content');
      if (!content) {
        throw new Error('Ficha existente sem container de conteúdo reconhecido. Gere a Ficha completa uma vez para habilitar inserção por seção.');
      }

      const fonts = [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Medium" },
        { family: "Inter", style: "SemiBold" },
        { family: "Inter", style: "Semi Bold" },
        { family: "Inter", style: "Bold" }
      ];
      for (const font of fonts) {
        try { await figma.loadFontAsync(font); } catch (e) { console.log("Font not loaded:", font); }
      }
      await _hdBeginFichaStyle();

      const _frames = data.frames || [];

      if (msg.section === 'tokens') {
        if (_frames.length === 0 && _hdFichaHasFrameSections(existingFicha)) {
          throw new Error('A Ficha atual tem "Frames Escaneados"/"User Interface", mas o plugin não tem nenhum frame escaneado neste momento (os dados do scan não foram carregados). Reescaneie os frames antes de atualizar para não apagar essas seções.');
        }
        const framesSection = await _hdRebuildFramesSection(_frames, !!msg.includeAllFrames, msg.excludeFrameIds);
        _hdReplaceSection(content, "Frames Escaneados", framesSection, _hdPrecedingSectionTitles("Frames Escaneados"));

        _hdRemoveUiColumns(existingFicha);
        const uiSection = await _hdRebuildUiBoard(data);
        _hdReplaceSection(content, "User Interface", uiSection, _hdPrecedingSectionTitles("User Interface"));
      } else if (msg.section === 'medidas' || msg.section === 'specs') {
        // Specs e Medidas compartilham a mesma seção "Documentação Visual"
        // (1 bloco por frame, com os dois pares lado a lado) -- qualquer um
        // dos dois botões reconstrói a seção inteira a partir do estado
        // atual de handoffData, nunca seções separadas como antes.
        const docVisualSection = await _hdRebuildDocumentacaoVisualSection(_frames, data.measurements, _hdLooseSpecsOf(data));
        if (!docVisualSection) {
          throw new Error('Não há especificações nem medidas para inserir. Crie uma especificação ou medida (com ou sem frame vinculado) e tente de novo.');
        }
        _hdReplaceSection(content, "Documentação Visual", docVisualSection);
      } else if (msg.section === 'fluxos') {
        const flowsSection = await _hdRebuildFlowsSection(data.createdFlows || []);
        _hdReplaceSection(content, "Conexões entre telas", flowsSection);
      }

      figma.currentPage.selection = [existingFicha];
      figma.viewport.scrollAndZoomIntoView([existingFicha]);
      figma.ui.postMessage({ type: 'ficha-section-inserted', section: msg.section });
    } catch (err) {
      console.error('Insert Ficha Section Error:', String(err && err.message || err), err && err.stack);
      figma.ui.postMessage({ type: 'ficha-section-insert-error', section: msg.section, message: err.message });
    } finally {
      _hdFichaGen = false;
    }
  }

  if (msg.type === "create-handoff") {
    try {
      // Carrega as fontes antes de escrever e ignora erros caso alguma nao exista
      const fonts = [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Medium" },
        { family: "Inter", style: "SemiBold" },
        { family: "Inter", style: "Semi Bold" },
        { family: "Inter", style: "Bold" }
      ];
      for (const font of fonts) {
        try {
          await figma.loadFontAsync(font);
        } catch (e) {
          console.log("Font not loaded:", font);
        }
      }
      await _hdBeginFichaStyle();

      const data = msg.data;

      // Fallback de segurança: trava specs pendentes de confirmação de posicionamento
      // antes de gerar a ficha, para não deixar grupos editáveis esquecidos no canvas.
      let _pendingSpecsLocked = 0;
      for (const frame of (data.frames || [])) {
        for (const spec of (frame.createdSpecs || [])) {
          if (!spec || !spec.pendingConfirmation) continue;
          const specNode = await figma.getNodeByIdAsync(spec.id);
          if (specNode && specNode.name && specNode.name.startsWith('[Spec | ')) {
            specNode.locked = true;
          }
          spec.pendingConfirmation = false;
          _pendingSpecsLocked++;
        }
      }
      if (_pendingSpecsLocked > 0) {
        figma.notify(`${_pendingSpecsLocked} especificação(ões) pendente(s) foram travadas automaticamente ao gerar a ficha.`);
      }

      // Helpers
      function createText(text, size = 14, weight = "Regular", color = { r: 0.1333, g: 0.1608, b: 0.1804 }, opts) {
        return _hdCreateText(text, size, weight, color, opts);
      }

      function createFrame(direction = "VERTICAL", padding = 0, spacing = 0, fill = null) {
        const f = figma.createFrame();
        f.layoutMode = direction;
        f.paddingLeft = padding;
        f.paddingRight = padding;
        f.paddingTop = padding;
        f.paddingBottom = padding;
        f.itemSpacing = spacing;
        
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "AUTO";
        f.layoutAlign = "INHERIT";

        if (fill) {
          f.fills = [{ type: "SOLID", color: fill }];
        } else {
          f.fills = [];
        }
        return f;
      }

      function setFillAndHug(node) {
        if (!node) return;
        
        try {
          if ('layoutSizingHorizontal' in node) {
            node.layoutSizingHorizontal = "FILL";
          }
          if ('layoutSizingVertical' in node) {
            node.layoutSizingVertical = "HUG";
          }
        } catch(e) {}

        const parent = node.parent;
        const pMode = (parent && 'layoutMode' in parent) ? parent.layoutMode : "VERTICAL";

        if (pMode === "VERTICAL") {
          node.layoutAlign = "STRETCH"; // Fill width
          if (node.type === "FRAME") {
            if (node.layoutMode === "VERTICAL") node.primaryAxisSizingMode = "AUTO"; // Hug height
            else node.counterAxisSizingMode = "AUTO"; // Hug height
          } else if (node.type === "TEXT") {
            node.textAutoResize = "HEIGHT"; // Fill width, hug height
          }
        } else if (pMode === "HORIZONTAL") {
          node.layoutGrow = 1; // Fill width
          node.layoutAlign = "INHERIT"; // Hug height (don't stretch)
          if (node.type === "FRAME") {
            if (node.layoutMode === "HORIZONTAL") node.counterAxisSizingMode = "AUTO"; // Hug height
            else node.primaryAxisSizingMode = "AUTO"; // Hug height
          } else if (node.type === "TEXT") {
            node.textAutoResize = "HEIGHT"; // Hug height, width controlled by layoutGrow
          }
        }
      }

      // Returns SVG string for a property type. label is used to distinguish spacing subtypes.
      function getIconSvg(type, label) {
        const S = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
        const E = '</svg>';
        const l = (label || '').toLowerCase();

        if (type === 'spacing') {
          if (l.includes('gap'))
            return S+'<line x1="4" y1="4" x2="4" y2="20"/><line x1="20" y1="4" x2="20" y2="20"/><path d="M9 12H4"/><path d="M15 12H20"/><path d="M9 9l-3 3 3 3"/><path d="M15 9l3 3-3 3"/>'+E;
          if (l.includes('topo') || l.includes('top'))
            return S+'<line x1="4" y1="4" x2="20" y2="4"/><line x1="12" y1="8" x2="12" y2="20"/><polyline points="8,14 12,20 16,14"/>'+E;
          if (l.includes('abaixo') || l.includes('bottom'))
            return S+'<line x1="4" y1="20" x2="20" y2="20"/><line x1="12" y1="4" x2="12" y2="16"/><polyline points="8,10 12,4 16,10"/>'+E;
          if (l.includes('esquerda') || l.includes('left'))
            return S+'<line x1="4" y1="4" x2="4" y2="20"/><line x1="8" y1="12" x2="20" y2="12"/><polyline points="14,8 20,12 14,16"/>'+E;
          if (l.includes('direita') || l.includes('right'))
            return S+'<line x1="20" y1="4" x2="20" y2="20"/><line x1="4" y1="12" x2="16" y2="12"/><polyline points="10,8 4,12 10,16"/>'+E;
          // generic spacing
          return S+'<path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/>'+E;
        }

        if (type === 'layout') {
          if (l.includes('w') || l.includes('width') || l.includes('larg'))
            return S+'<path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/>'+E;
          if (l.includes('h') || l.includes('height') || l.includes('alt'))
            return S+'<path d="M12 3v18"/><path d="M8 7l4-4 4 4"/><path d="M8 17l4 4 4-4"/>'+E;
          return S+'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>'+E;
        }

        const icons = {
          typography:   S+'<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'+E,
          radius:       S+'<path d="m14 18-4-4 4-4"/><path d="M20 14c-4.4 0-8-3.6-8-8"/>'+E,
          strokeWeight: S+'<line x1="3" y1="6" x2="21" y2="6" stroke-width="1"/><line x1="3" y1="12" x2="21" y2="12" stroke-width="2.5"/><line x1="3" y1="18" x2="21" y2="18" stroke-width="4"/>'+E,
          stroke:       S+'<rect width="18" height="18" x="3" y="3" rx="2" stroke-width="2.5"/>'+E,
          variant:      S+'<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'+E,
          effect:       S+'<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>'+E,
        };
        return icons[type] || (S+'<rect width="18" height="18" x="3" y="3" rx="2"/>'+E);
      }


      function createSection(parent, titleText, sub) {
        const section = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
        section.name = `[Seção] ${titleText}`;
        if (parent) {
          parent.appendChild(section);
          setFillAndHug(section);
        }
        section.cornerRadius = 8;
        section.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
        section.strokeWeight = 1;

        const title = createText(titleText, _hdS(16, sub ? 18 : 22), "Bold", hexToRgb("#005ca9"));
        section.appendChild(title);
        setFillAndHug(title);
        return section;
      }

      // ATENÇÃO: o handler 'pull-ficha-version-from-canvas' (mais abaixo neste
      // arquivo) lê de volta o campo "Versão" navegando por nome do frame
      // ('[Campo] Versão') e por posição do nó TEXT (label=[0], valor=[1]).
      // Mudar o label "Versão" ou a ordem dos filhos aqui quebra essa leitura
      // silenciosamente (degrada para null, não lança erro).
      function createRow(parent, label, value, isLink = false, url = "") {
        const row = createFrame("VERTICAL", 0, 4);
        row.name = `[Campo] ${label}`;
        if (parent) {
           parent.appendChild(row);
           setFillAndHug(row);
        }
        
        const lbl = createText(label, 12, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 });
        row.appendChild(lbl);
        setFillAndHug(lbl);

        const val = createText(value || "-", 14, "Regular", isLink ? hexToRgb("#005ca9") : { r: 0.1333, g: 0.1608, b: 0.1804 });
        row.appendChild(val);
        setFillAndHug(val);

        if (isLink && value) {
          val.textDecoration = "UNDERLINE";
          if (url && typeof url === "string") {
            try {
              val.hyperlink = { type: "URL", value: url.startsWith("http") ? url : "https://" + url };
            } catch (e) { }
          }
        }
        return row;
      }



      // Semantic name prefix for all handoff canvas nodes
      const _titulo = (data.step1?.titulo || 'Projeto').replace(/\//g, '-');
      const _handoffBase = `Handex | Ficha de Projeto | ${_titulo}`;

      // Detecta ficha já existente do projeto ANTES de construir a nova --
      // decisão de produto: "Gerar Ficha" atualiza em vez de duplicar.
      // versionType vem do modal "Versionar Ficha de Projeto" (só existe
      // quando já havia uma ficha gerada, ver confirmHandoffVersion em
      // handoff.js): "major" (Nova Versão, redesenho/mudança estrutural)
      // preserva a ficha anterior como histórico e nasce AO LADO dela --
      // nunca remove. "minor" (Atualização) ou ausente (ficha não
      // versionada, ou primeira geração) continua substituindo no mesmo
      // lugar -- remove a antiga antes de construir a nova.
      const _isNewVersion = msg.versionType === 'major';
      const _existingFicha = _hdFindExistingFicha(_titulo);
      const _isUpdate = !!_existingFicha && !_isNewVersion;
      if (_isUpdate && (data.frames || []).length === 0 && _hdFichaHasFrameSections(_existingFicha)) {
        figma.ui.postMessage({
          type: "handoff-error",
          message: 'A Ficha atual tem "Frames Escaneados"/"User Interface", mas o plugin não tem nenhum frame escaneado neste momento. Gerar agora apagaria essas seções. Reescaneie os frames, ou use "Nova Versão" (preserva a Ficha anterior).'
        });
        return;
      }
      if (_existingFicha && !_isNewVersion) {
        try { _existingFicha.remove(); } catch (e) {}
      }

      // Posição da Ficha: NUNCA mais adivinhada por heurística de âncora/
      // colisão (essa lógica existiu e foi removida em 2026-09-17 -- gerava
      // fichas a "milhões de pixels de distância" em cenários reais, mesmo
      // depois de 2 rodadas de tentativa de correção). A posição agora é
      // sempre decisão do designer: `data._fichaBasePosition` (persistido em
      // handoffData, setado uma única vez via confirm-ficha-position, ver
      // handler abaixo) é a fonte de verdade. Sem ela ainda (primeiro
      // handoff do projeto), a Ficha nasce numa posição sugerida simples e
      // o backend avisa o frontend que a posição precisa de confirmação —
      // nenhuma tentativa de "adivinhar melhor" substitui a decisão manual.
      //
      // Só confia na posição salva se a Ficha REAL ainda existir no canvas
      // (_existingFicha, checado acima) -- sem isso, apagar a Ficha
      // manualmente (testes, limpeza do projeto) deixava
      // _fichaBasePosition "órfão" e válido pra sempre, pulando o modal de
      // confirmação mesmo sem nenhuma Ficha de verdade ter existido ainda
      // neste canvas. Mesma classe de bug já corrigida em _fichaGenerated
      // (ver CLAUDE.md) -- aqui vinculado à mesma fonte de verdade em vez
      // de duplicar uma checagem própria.
      const _fichaBasePos = (_existingFicha && data._fichaBasePosition) ? data._fichaBasePosition : null;
      const _now = new Date();
      const _ts = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')} ${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
      // Timestamp antes da versão no nome: garante que a ordenação alfabética
      // usada em pull-ficha-version-from-canvas continue resolvendo "mais
      // recente" pela data de criação, não pela string da versão.
      const _versaoLabel = (data.step1?.versao || '').trim();
      const _containerName = `${_handoffBase} | ${_ts}${_versaoLabel ? ' | ' + _versaoLabel : ''}`;

      // MAIN CONTAINER
      // Coluna única vertical de largura fixa (1080 → 952 → 904 → 872),
      // altura Hug -- decisão 2026-09-17, reafirmada em 2026-09-30 (PDF e
      // Ficha navegável não toleram colunas lado a lado).
      const mainContainer = createFrame("VERTICAL", 64, 48, hexToRgb("#004d8d"));
      mainContainer.name = _containerName;
      mainContainer.resize(1080, 100);
      mainContainer.counterAxisSizingMode = "FIXED";
      mainContainer.primaryAxisSizingMode = "AUTO";

      // 1. FICHA TÉCNICA
      const fichaTecnica = createFrame("VERTICAL", 0, 0, { r: 1, g: 1, b: 1 });
      fichaTecnica.name = `${_handoffBase} | ${_ts} / Ficha de Projeto`;
      fichaTecnica.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
      if (_hdStyled()) {
        fichaTecnica.strokes = [{ type: "SOLID", color: hexToRgb(_DS.text2) }];
        fichaTecnica.strokeWeight = 2;
        fichaTecnica.cornerRadius = 16;
        fichaTecnica.clipsContent = true;
      }
      fichaTecnica.resize(952, 100);
      fichaTecnica.counterAxisSizingMode = "FIXED"; // Base width 952
      fichaTecnica.primaryAxisSizingMode = "AUTO";  // Hug height

      // HEADER (CAIXA)
      const header = createFrame("HORIZONTAL", 24, 16, { r: 1, g: 1, b: 1 });
      fichaTecnica.appendChild(header);
      setFillAndHug(header);
      
      header.counterAxisAlignItems = "CENTER";
      header.primaryAxisAlignItems = "SPACE_BETWEEN";
      header.paddingTop = 20;
      header.paddingBottom = 20;

      const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631">
        <g transform="translate(-284.78446,-475.51214)">
          <g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)">
            <g transform="scale(0.24,0.24)">
              <path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f39200;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f39200;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none" />
            </g>
          </g>
        </g>
      </svg>`;
      const logoWrapper = figma.createNodeFromSvg(logoSvg);
      logoWrapper.name = "CAIXA Logo";
      const ratio = 205.51 / 46.55;
      logoWrapper.resize(32 * ratio, 32);

      const headerTitle = createText("Handex - Handoff Expresso", _hdS(14, 18), "Medium", _hdStyled() ? hexToRgb(_DS.blue) : { r: 0.3922, g: 0.4549, b: 0.4784 });
      header.appendChild(logoWrapper);
      header.appendChild(headerTitle);
      fichaTecnica.appendChild(header);

      // CONTENT WRAPPER
      const content = createFrame("VERTICAL", 24, 24, { r: 1, g: 1, b: 1 });
      // Nome próprio permite ao handler insert-frame-in-ficha localizar este
      // nó sem depender de posição/índice de filho (fichas geradas antes
      // desta marcação existir caem no fallback posicional, ver lá).
      content.name = 'Handex | Content';
      fichaTecnica.appendChild(content);
      setFillAndHug(content);

      // 1.1 INFORMAÇÕES BÁSICAS
      if (!data.setup || data.setup.ficha !== false) {
        const infoSection = createSection(content, "Informações Básicas");
        createRow(infoSection, "Título do Projeto", data.step1.titulo);
        if (data.step1.jornada) createRow(infoSection, "Jornada", data.step1.jornada);
        if (data.step1.feature) createRow(infoSection, "Feature", data.step1.feature);
        createRow(infoSection, "Objetivo da Entrega", data.step1.objetivo);

        const subGrid = createFrame("HORIZONTAL", 0, 16);
        infoSection.appendChild(subGrid);
        setFillAndHug(subGrid);

        // Status chip com semântica de cor
        {
          const _statusMap = {
            'rascunho':       { label: 'Rascunho',        bg: { r: 0.9216, g: 0.9451, b: 0.949 }, text: { r: 0.251, g: 0.2941, b: 0.3216 } },
            'em-revisao':     { label: 'Em Revisão',      bg: { r: 1, g: 0.9765, b: 0.902 }, text: { r: 0.3961, g: 0.298, b: 0.0078 } },
            'pronto-para-dev':{ label: 'Pronto para Dev', bg: { r: 0.898, g: 0.949, b: 0.9882 }, text: { r: 0, g: 0.3608, b: 0.6627 } },
            'finalizado':     { label: 'Finalizado',      bg: { r: 0.9059, g: 0.9569, b: 0.9176 }, text: { r: 0.0706, g: 0.4588, b: 0.1529 } },
          };
          const _sc = _statusMap[data.step1.status] || _statusMap['rascunho'];
          const statusCol = createFrame("VERTICAL", 0, 4);
          statusCol.name = '[Campo] Status';
          subGrid.appendChild(statusCol);
          setFillAndHug(statusCol);
          statusCol.appendChild(createText('Status', 12, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 }));
          const chip = createFrame("HORIZONTAL", 8, 4, _sc.bg);
          chip.cornerRadius = _hdS(999, 4);
          if (_hdStyled()) { chip.strokes = [{ type: "SOLID", color: _sc.text }]; chip.strokeWeight = 1; chip.paddingTop = 3; chip.paddingBottom = 3; }
          chip.primaryAxisSizingMode = "AUTO";
          chip.counterAxisSizingMode = "AUTO";
          chip.counterAxisAlignItems = "CENTER";
          chip.appendChild(createText(_sc.label, _hdS(11, 12), "Bold", _sc.text));
          statusCol.appendChild(chip);
        }
        createRow(subGrid, "Versão", data.step1.versao);
      }

      // 1.2 EQUIPE E RESPONSÁVEIS
      if (data.step1.equipe && data.step1.equipe.length > 0) {
        const teamSection = createSection(content, "Equipe e Responsáveis");
        if (_hdStyled()) {
          _hdDsTable(teamSection, "Equipe", [{ title: "Papel", w: 160 }, { title: "Nome" }, { title: "Contato", w: 300 }],
            data.step1.equipe.map(m => [
              _hdTag(m.papel || 'Membro', { bg: _DS.colorBg, border: _DS.colorBorder, color: _DS.blue }),
              { text: m.nome || '', w: "semibold" },
              m.email ? { text: String(m.email).trim(), color: _DS.blue, link: { type: "URL", value: "mailto:" + String(m.email).trim() } } : "—"
            ]));
        }
        else data.step1.equipe.forEach(m => {
          const mRow = createFrame("HORIZONTAL", 12, 12, { r: 0.9686, g: 0.9804, b: 0.9804 });
          teamSection.appendChild(mRow);
          setFillAndHug(mRow);
          mRow.counterAxisAlignItems = "CENTER";
          mRow.cornerRadius = 8;
          mRow.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];

          const roleTag = createFrame("HORIZONTAL", 8, 3, { r: 0.898, g: 0.949, b: 0.9882 });
          roleTag.cornerRadius = 999;
          roleTag.strokes = [{ type: "SOLID", color: { r: 0.6275, g: 0.8235, b: 0.9882 } }];
          roleTag.strokeWeight = 1;
          roleTag.appendChild(createText(m.papel || 'Membro', 9, "Medium", hexToRgb("#005ca9")));
          mRow.appendChild(roleTag);

          const nameText = createText(m.nome || '', 12, "Medium");
          nameText.layoutGrow = 1;
          mRow.appendChild(nameText);

          if (m.email) {
            const contactLink = createText(String(m.email).trim(), 11, "Bold", hexToRgb("#005ca9"));
            contactLink.textDecoration = "UNDERLINE";
            contactLink.hyperlink = { type: "URL", value: "mailto:" + m.email };
            mRow.appendChild(contactLink);
          }
        });
      }

      // 1.3 BRIEFING ESTRATÉGICO (só se houver respostas)
      const _briefingQs = (data.step2 && data.step2.briefingQuestions)
        ? data.step2.briefingQuestions.filter(q => q.answer && q.answer.trim())
        : [];
      if (_briefingQs.length > 0) {
        const briefingSection = createSection(content, "Briefing Estratégico");
        if (_hdStyled()) {
          _hdDsTable(briefingSection, "Briefing", [{ title: "Pergunta", w: 340 }, { title: "Resposta" }],
            _briefingQs.map((q, idx) => [{ text: `${idx + 1}. ${q.question || ''}`, w: "semibold" }, q.answer]));
        }
        else _briefingQs.forEach((q, idx) => {
          const qRow = createFrame("VERTICAL", 0, 4);
          qRow.name = `[Briefing] Pergunta ${idx + 1}`;
          briefingSection.appendChild(qRow);
          setFillAndHug(qRow);

          const qText = createText(`${idx + 1}. ${q.question || ''}`, 12, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 });
          qRow.appendChild(qText);
          setFillAndHug(qText);

          const aText = createText(q.answer, 13, "Regular", { r: 0.1333, g: 0.1608, b: 0.1804 });
          qRow.appendChild(aText);
          setFillAndHug(aText);
        });
      }

      // 1.4 REGRAS DE NEGÓCIO E HUs
      const _regras = (data.step2 && data.step2.regras) ? data.step2.regras : [];
      if (_regras.length > 0) {
        const rulesSection = createSection(content, "Regras de Negócio e HUs");
        if (_hdStyled()) {
          _hdDsTable(rulesSection, "Regras", [{ title: "Regra", w: 260 }, { title: "HU", w: 150 }, { title: "Notas" }],
            _regras.map(r => [
              { text: r.titulo || '', w: "semibold" },
              (r.link && r.link !== "#") ? { text: "Acesse o link da HU", color: _DS.blue, link: { type: "URL", value: r.link } } : "—",
              r.notas ? { text: r.notas, color: _DS.text2 } : "—"
            ]));
        }
        else _regras.forEach(r => {
          const rRow = createFrame("VERTICAL", 12, 8, { r: 0.9686, g: 0.9804, b: 0.9804 });
          rulesSection.appendChild(rRow);
          setFillAndHug(rRow);
          rRow.cornerRadius = 8;
          rRow.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];

          const rTitle = createText(r.titulo || '', 12, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
          rRow.appendChild(rTitle);
          setFillAndHug(rTitle);

          if (r.link && r.link !== "#") {
            const lText = createText("Acesse o link da HU", 11, "Bold", hexToRgb("#005ca9"));
            lText.textDecoration = "UNDERLINE";
            lText.hyperlink = { type: "URL", value: r.link };
            rRow.appendChild(lText);
            setFillAndHug(lText);
          }
          if (r.notas) {
            const nText = createText(r.notas, 12, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
            rRow.appendChild(nText);
            setFillAndHug(nText);
          }
        });
        content.appendChild(rulesSection);
        setFillAndHug(rulesSection);
      }

      // Cenários de exceção NÃO têm seção própria: vivem só no card da spec
      // (Documentação Visual, _hdBuildSpecsSubgroup).

      // 1.6 DOCS E ANEXOS
      if (data.docs) {
        const docItems = [
          { key: "proto", label: "Protótipo Navegável" },
          { key: "a11y", label: "Handoff Acessibilidade" },
          { key: "research", label: "Pesquisa de UX" }
        ];
        const validDocItems = docItems.filter(item => data.docs[item.key] && data.docs[item.key].link);
        if (validDocItems.length > 0) {
          const docsSection = createSection(content, "Docs e Anexos");
          if (_hdStyled()) {
            _hdDsTable(docsSection, "Docs", [{ title: "Documento" }, { title: "Link", w: 220 }],
              validDocItems.map(item => [
                { text: item.label, w: "semibold" },
                { text: "Acesse o link", color: _DS.blue, link: { type: "URL", value: data.docs[item.key].link } }
              ]));
          }
          else validDocItems.forEach(item => {
            const docData = data.docs[item.key];
            const dRow = createFrame("HORIZONTAL", 12, 12, { r: 0.9686, g: 0.9804, b: 0.9804 });
            dRow.layoutAlign = "STRETCH";
            dRow.counterAxisAlignItems = "CENTER";
            dRow.cornerRadius = 8;
            dRow.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];

            const dLabel = createText(item.label, 12, "Bold");
            dLabel.layoutGrow = 1;
            dRow.appendChild(dLabel);

            const dLink = createText("Acesse o link", 11, "Bold", hexToRgb("#005ca9"));
            dLink.textDecoration = "UNDERLINE";
            dLink.hyperlink = { type: "URL", value: docData.link };
            dRow.appendChild(dLink);

            docsSection.appendChild(dRow);
          });
          setFillAndHug(docsSection);
        }
      }

      // 1.7-1.9 -- delega para as funções _hdRebuild*Section (mesma lógica
      // de montagem, extraída para ser reaproveitada também pelo handler
      // insert-ficha-section). Aqui é sempre uma ficha nova/recriada, então
      // sempre appendChild ao final, nunca insertChild em índice existente.
      const _frames = data.frames || [];

      const framesSection = await _hdRebuildFramesSection(_frames, !!msg.includeAllFrames, msg.excludeFrameIds);
      if (framesSection) { content.appendChild(framesSection); _hdSetFillAndHug(framesSection); }

      const uiSection = await _hdRebuildUiBoard(data);
      if (uiSection) { content.appendChild(uiSection); _hdSetFillAndHug(uiSection); }

      // "Documentação Visual" substitui as antigas seções "Medidas" e
      // "Especificações" (agregadas, texto puro, sem nenhuma referência à
      // tela real) -- 1 bloco por frame, com snapshot amplo (specs/medidas
      // marcadas sobre o frame real) + card de detalhe em texto ao lado.
      // Decisão de produto 2026-09-17, ver CLAUDE.md.
      const docVisualSection = await _hdRebuildDocumentacaoVisualSection(_frames, data.measurements, _hdLooseSpecsOf(data));
      if (docVisualSection) { content.appendChild(docVisualSection); _hdSetFillAndHug(docVisualSection); }

      const flowsSection = await _hdRebuildFlowsSection(data.createdFlows || []);
      if (flowsSection) { content.appendChild(flowsSection); _hdSetFillAndHug(flowsSection); }

      fichaTecnica.appendChild(content);
      mainContainer.appendChild(fichaTecnica);

      // 3. ANATOMIA / MEDIDAS
      const selection = figma.currentPage.selection;
      if (selection.length > 0 && data.setup && (data.setup.espacamentos || data.setup.anatomia || data.setup.instancias)) {
        for (const node of selection) {
          if (node === mainContainer) continue;

          const specsBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
          specsBoard.name = `[Design Specs] ${node.name}`;
          specsBoard.strokes = [{ type: "SOLID", color: _hdStyled() ? hexToRgb(_DS.text2) : { r: 0.8157, g: 0.8784, b: 0.8902 } }];
          if (_hdStyled()) specsBoard.strokeWeight = 2;
          specsBoard.cornerRadius = 16;
          specsBoard.resize(800, 100);
          specsBoard.counterAxisSizingMode = "FIXED"; // Base width 800
          specsBoard.primaryAxisSizingMode = "AUTO";  // Hug height

          const specsTitle = createText("Design Specs: " + node.name, _hdS(24, 28), "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
          specsBoard.appendChild(specsTitle);
          setFillAndHug(specsTitle);

          if (data.setup.anatomia || data.setup.espacamentos) {
            const layoutSec = createSection(specsBoard, "Layout & Posicionamento", true);
            const grid = createFrame("HORIZONTAL", 0, 16);
            grid.layoutWrap = "WRAP";
            
            createRow(grid, "Position", `X: ${Math.round(node.x)}, Y: ${Math.round(node.y)}`);
            createRow(grid, "Size", `W: ${Math.round(node.width)}, H: ${Math.round(node.height)}`);

            if ('layoutMode' in node && node.layoutMode !== "NONE") {
              createRow(grid, "Auto Layout", `Dir: ${node.layoutMode}, Spacing: ${node.itemSpacing}`);
              createRow(grid, "Padding", `T: ${node.paddingTop}, R: ${node.paddingRight}, B: ${node.paddingBottom}, L: ${node.paddingLeft}`);
            }
            if ('cornerRadius' in node && node.cornerRadius !== figma.mixed) {
              createRow(grid, "Corner Radius", `${node.cornerRadius}px`);
            }
            layoutSec.appendChild(grid);
            setFillAndHug(grid);
          }

          if (data.setup.instancias || data.setup.anatomia) {
            const appearSec = createSection(specsBoard, "Aparência", true);
            const grid = createFrame("HORIZONTAL", 0, 16);
            grid.layoutWrap = "WRAP";
            grid.layoutAlign = "STRETCH";

            if ('opacity' in node) createRow(grid, "Opacity", `${Math.round(node.opacity * 100)}%`);
            if ('blendMode' in node && node.blendMode !== "PASS_THROUGH") createRow(grid, "Blend Mode", node.blendMode);

            if ('fills' in node && Array.isArray(node.fills)) {
              const sf = node.fills.find(f => f.type === "SOLID");
              if (sf) {
                const hex = rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase();
                const token = await getPaintVariableInfo(sf);
                createRow(grid, "Fills", token ? token : hex);
              }
            }
            if ('strokes' in node && Array.isArray(node.strokes)) {
              const ss = node.strokes.find(s => s.type === "SOLID");
              if (ss) {
                const hex = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
                const token = await getPaintVariableInfo(ss);
                createRow(grid, "Strokes", `${token ? token : hex} (${node.strokeWeight}px)`);
              }
            }

            if (grid.children.length > 0) {
              appearSec.appendChild(grid);
              setFillAndHug(grid);
            } else {
              appearSec.remove();
            }
          }

          specsBoard.layoutAlign = "STRETCH";
          mainContainer.appendChild(specsBoard);
        }
      }

      // 4. AUDIT SUMMARY
      if (data.isAudit && data.auditSummary) {
        const auditBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
        auditBoard.name = `${_handoffBase} / Auditoria`;
        auditBoard.strokes = [{ type: "SOLID", color: _hdStyled() ? hexToRgb(_DS.text2) : { r: 0.8157, g: 0.8784, b: 0.8902 } }];
        if (_hdStyled()) auditBoard.strokeWeight = 2;
        auditBoard.cornerRadius = 16;
        auditBoard.resize(800, 100);
        auditBoard.counterAxisSizingMode = "FIXED";
        auditBoard.primaryAxisSizingMode = "AUTO";
        
        const auditTitle = createText("Relatório de Auditoria", 24, "Bold", hexToRgb("#005ca9"));
        auditBoard.appendChild(auditTitle);
        setFillAndHug(auditTitle);

        const summaryText = createText(`Aderência ao Design System: ${data.auditSummary.adoption}%`, 18, "Bold", data.auditSummary.adoption > 90 ? { r: 0.0706, g: 0.4588, b: 0.1529 } : { r: 0.698, g: 0.1725, b: 0.1725 });
        auditBoard.appendChild(summaryText);
        setFillAndHug(summaryText);

        const statsText = createText(`Resumo: ${data.auditSummary.issues.length} Fora do Padrão | ${data.auditSummary.adjustments.length} Ajustes`, 14, "Medium", { r: 0.3922, g: 0.4549, b: 0.4784 });
        auditBoard.appendChild(statsText);
        setFillAndHug(statsText);

        if (data.auditSummary.adjustments && data.auditSummary.adjustments.length > 0) {
           const adjSection = createSection(auditBoard, "Ajustes Recomendados (Minorias)", true);
           data.auditSummary.adjustments.slice(0, 10).forEach(adj => {
             const aRow = createText(`- [${adj.cat}] ${adj.name}`, 12, "Regular", { r: 0.651, g: 0.3686, b: 0 });
             adjSection.appendChild(aRow);
             setFillAndHug(aRow);
           });
        }

        if (data.auditSummary.issues && data.auditSummary.issues.length > 0) {
           const issueList = createSection(auditBoard, "Pendências Críticas (Fora do Padrão)", true);
           data.auditSummary.issues.slice(0, 20).forEach(issue => {
             const iRow = createText(`- [${issue.cat}] ${issue.name}`, 12, "Regular", { r: 0.698, g: 0.1725, b: 0.1725 });
             issueList.appendChild(iRow);
             setFillAndHug(iRow);
           });
           if (data.auditSummary.issues.length > 20) {
             const moreText = createText(`... e mais ${data.auditSummary.issues.length - 20} itens.`, 10, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
             issueList.appendChild(moreText);
             setFillAndHug(moreText);
           }
        }

        mainContainer.appendChild(auditBoard);
        auditBoard.layoutAlign = "STRETCH";
      }

      // Append ao canvas primeiro para que as dimensões AUTO sejam calculadas pelo Figma
      mainContainer.locked = false;
      mainContainer.setPluginData('handexCategory', 'ficha');
      figma.currentPage.appendChild(mainContainer);
      // Move pra Section "Handex | Ficha" ANTES de qualquer posicionamento
      // abaixo -- Section preserva x/y absolutos (ver _hdMoveToCategorySection).
      _hdMoveToCategorySection(mainContainer, 'ficha');

      const _fichaGap = 200;

      if (_fichaBasePos) {
        // Posição já confirmada pelo designer em algum momento anterior
        // (persistida em handoffData._fichaBasePosition) -- nunca recalculada
        // por heurística. "Nova Versão" nasce ao lado dela (preserva a
        // anterior); "Atualização"/primeira geração pós-confirmação usa
        // exatamente a posição salva.
        if (_isNewVersion) {
          const _prevBB = _existingFicha ? _existingFicha.absoluteBoundingBox : null;
          mainContainer.x = Math.round(_prevBB ? _prevBB.x + _prevBB.width + _fichaGap : _fichaBasePos.x + mainContainer.width + _fichaGap);
          mainContainer.y = Math.round(_fichaBasePos.y);
        } else {
          mainContainer.x = Math.round(_fichaBasePos.x);
          mainContainer.y = Math.round(_fichaBasePos.y);
        }
        figma.currentPage.selection = [mainContainer];
        figma.viewport.scrollAndZoomIntoView([mainContainer]);
        figma.ui.postMessage({ type: "handoff-complete", isUpdate: _isUpdate, timestamp: _ts });
        return;
      }

      // Primeira geração deste projeto, sem posição confirmada ainda: nasce
      // numa posição sugerida simples (abaixo do primeiro frame documentado
      // com âncora conhecida, senão abaixo da seleção atual, senão abaixo do
      // viewport) e já fica VISÍVEL e selecionada -- o designer arrasta ela
      // mesma no canvas se quiser um lugar diferente, sem fantasma separado.
      // O frontend mostra um aviso pedindo confirmação (handoff-needs-
      // position-confirmation); só ao confirmar (confirm-ficha-position,
      // handler abaixo) a posição vira _fichaBasePosition definitiva.
      let _suggestedAnchor = null;
      for (const _f of (data.frames || [])) {
        if (!_f.figmaId) continue;
        let _fNode = null;
        try { _fNode = await figma.getNodeByIdAsync(_f.figmaId); } catch (e) { _fNode = null; }
        if (_fNode && _fNode.absoluteBoundingBox) { _suggestedAnchor = _fNode.absoluteBoundingBox; break; }
      }
      if (!_suggestedAnchor) {
        const _sel = figma.currentPage.selection.filter(n => n !== mainContainer);
        const _bb = _sel.length > 0 ? _sel[0].absoluteBoundingBox : null;
        if (_bb) _suggestedAnchor = _bb;
      }
      if (_suggestedAnchor) {
        mainContainer.x = Math.round(_suggestedAnchor.x);
        mainContainer.y = Math.round(_suggestedAnchor.y + _suggestedAnchor.height + _fichaGap);
      } else {
        const _vb = figma.viewport.bounds;
        mainContainer.x = Math.round(_vb.x + (_vb.width / 2) - (mainContainer.width / 2));
        mainContainer.y = Math.round(_vb.y + _vb.height + _fichaGap);
      }

      figma.currentPage.selection = [mainContainer];
      figma.viewport.scrollAndZoomIntoView([mainContainer]);

      figma.ui.postMessage({ type: "handoff-needs-position-confirmation", fichaId: mainContainer.id, isUpdate: _isUpdate, timestamp: _ts });
    } catch (err) {
      console.error('Handoff Error:', String(err && err.message || err), err && err.stack);
      figma.ui.postMessage({ type: "handoff-error", message: err.message });
    } finally {
      _hdFichaGen = false;
    }
  }

  // add-annotations is handled below

  if (msg.type === "measure-nodes-custom") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("Selecione um ou mais itens para mensurar.");
      figma.ui.postMessage({ type: 'canvas-action-failed' });
      return;
    }

    const { measureTypes } = msg;

    async function getVariableInfo(node, prop) {
      if (!node.boundVariables) return null;
      const boundVar = node.boundVariables[prop];
      if (!boundVar) return null;
      const varId = Array.isArray(boundVar) ? (boundVar[0] && boundVar[0].id) : boundVar.id;
      if (!varId) return null;
      const v = await figma.variables.getVariableByIdAsync(varId);
      return v ? v.name : null;
    }
    // fills/strokes não seguem o padrão de node.boundVariables[prop] usado
    // acima (width/height/padding/itemSpacing) -- o binding de cor de um
    // paint vive dentro do próprio paint, em paint.boundVariables.color.id.
    // getVariableInfo(node, 'fills'/'strokes') sempre retornava null aqui.
    async function getPaintVariableInfo(paint) {
      const id = paint && paint.boundVariables && paint.boundVariables.color && paint.boundVariables.color.id;
      if (!id) return null;
      const v = await figma.variables.getVariableByIdAsync(id);
      return v ? v.name : null;
    }

    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }

      function createMeasurementLine(x1, y1, x2, y2, value, type = 'horizontal', redColor = { r: 0.851, g: 0.2118, b: 0.2118 }, tokenName = null) {
        const elements = [];
        const mainLine = figma.createLine();
        mainLine.strokes = [{ type: "SOLID", color: redColor }];
        mainLine.strokeWeight = 1;
        mainLine.x = x1;
        mainLine.y = y1;

        if (type === 'horizontal') {
          mainLine.resize(Math.max(0.01, x2 - x1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color: redColor }];
          t1.x = x1; t1.y = y1 - 4; t1.resize(8, 0); t1.rotation = -90;
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color: redColor }];
          t2.x = x2; t2.y = y1 - 4; t2.resize(8, 0); t2.rotation = -90;
          elements.push(mainLine, t1, t2);
        } else {
          mainLine.rotation = -90;
          mainLine.resize(Math.max(0.01, y2 - y1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color: redColor }];
          t1.x = x1 - 4; t1.y = y1; t1.resize(8, 0);
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color: redColor }];
          t2.x = x1 - 4; t2.y = y2; t2.resize(8, 0);
          elements.push(mainLine, t1, t2);
        }

        const label = figma.createText();
        label.fontName = { family: "Inter", style: "Regular" };
        const labelVal = Math.round(value);
        label.characters = tokenName ? `${tokenName} (${labelVal})` : String(labelVal);
        label.fontSize = 10;
        label.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

        const bg = figma.createRectangle();
        bg.resize(label.width + 8, label.height + 4);
        bg.fills = [{ type: "SOLID", color: redColor }];
        bg.strokes = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        bg.strokeWeight = 1;
        bg.cornerRadius = 4;

        // Coloca o texto por cima do fundo antes de agrupar
        figma.currentPage.appendChild(label);

        if (type === 'horizontal') {
          const dist = Math.abs(x2 - x1);
          const cx = x1 + (x2 - x1) / 2;
          if (dist < bg.width + 8) {
            // Muito pequeno para o chip, traz ao lado (direita)
            bg.x = x2 + 6;
            bg.y = y1 - bg.height / 2;
          } else {
            bg.x = cx - bg.width / 2;
            bg.y = y1 - bg.height / 2;
          }
        } else {
          const dist = Math.abs(y2 - y1);
          const cy = y1 + (y2 - y1) / 2;
          if (dist < bg.height + 8) {
            // Muito pequeno para o chip, traz abaixo
            bg.x = x1 - bg.width / 2;
            bg.y = y2 + 6;
          } else {
            bg.x = x1 - bg.width / 2;
            bg.y = cy - bg.height / 2;
          }
        }

        // Centraliza o texto no chip
        label.x = bg.x + 4;
        label.y = bg.y + 2;

        elements.push(bg, label);
        return elements;
      }

      const appliedMeasuresList = [];
      // O que foi pedido e não tinha o que medir, por elemento (2026-10-05,
      // pedido do Augusto): vira aviso na UI em vez de sumir em silêncio.
      const skippedMeasures = [];

      for (const node of selection) {
        const bounds = node.absoluteRenderBounds || node.absoluteBoundingBox;
        if (!bounds) continue;

        let items = [];
        let appliedDetails = [];
        const skipped = [];
        const _isAL = 'layoutMode' in node && node.layoutMode !== "NONE";

        if (measureTypes && measureTypes.includes('wh')) {
          const wToken = await getVariableInfo(node, 'width');
          const hToken = await getVariableInfo(node, 'height');
          items.push(...createMeasurementLine(bounds.x, bounds.y - 20, bounds.x + bounds.width, bounds.y - 20, bounds.width, 'horizontal', { r: 0.851, g: 0.2118, b: 0.2118 }, wToken));
          items.push(...createMeasurementLine(bounds.x - 20, bounds.y, bounds.x - 20, bounds.y + bounds.height, bounds.height, 'vertical', { r: 0.851, g: 0.2118, b: 0.2118 }, hToken));

          let whLabel = `Dimensões: ${Math.round(bounds.width)}x${Math.round(bounds.height)}`;
          if (wToken || hToken) whLabel += ` [Tokens: ${wToken || '-'} x ${hToken || '-'}]`;
          appliedDetails.push(whLabel);
        }

        if (measureTypes && measureTypes.includes('inner') && 'layoutMode' in node && node.layoutMode !== "NONE") {
          const shiftX = bounds.x + bounds.width / 2 - 12;
          const shiftY = bounds.y + bounds.height / 2 - 12;
          let pads = [];
          const tT = await getVariableInfo(node, 'paddingTop');
          const tB = await getVariableInfo(node, 'paddingBottom');
          const tL = await getVariableInfo(node, 'paddingLeft');
          const tR = await getVariableInfo(node, 'paddingRight');

          if (node.paddingTop > 0) { items.push(...createMeasurementLine(shiftX, bounds.y, shiftX, bounds.y + node.paddingTop, node.paddingTop, 'vertical', { r: 0.1765, g: 0.5412, b: 0.8471 }, tT)); pads.push(`Top: ${node.paddingTop}${tT ? ' [' + tT + ']' : ''}`); }
          if (node.paddingBottom > 0) { items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height - node.paddingBottom, shiftX, bounds.y + bounds.height, node.paddingBottom, 'vertical', { r: 0.1765, g: 0.5412, b: 0.8471 }, tB)); pads.push(`Bottom: ${node.paddingBottom}${tB ? ' [' + tB + ']' : ''}`); }
          if (node.paddingLeft > 0) { items.push(...createMeasurementLine(bounds.x, shiftY, bounds.x + node.paddingLeft, shiftY, node.paddingLeft, 'horizontal', { r: 0.1765, g: 0.5412, b: 0.8471 }, tL)); pads.push(`Left: ${node.paddingLeft}${tL ? ' [' + tL + ']' : ''}`); }
          if (node.paddingRight > 0) { items.push(...createMeasurementLine(bounds.x + bounds.width - node.paddingRight, shiftY, bounds.x + bounds.width, shiftY, node.paddingRight, 'horizontal', { r: 0.1765, g: 0.5412, b: 0.8471 }, tR)); pads.push(`Right: ${node.paddingRight}${tR ? ' [' + tR + ']' : ''}`); }
          if (pads.length > 0) appliedDetails.push(`Padding Interno: ${pads.join(', ')}`);
          else skipped.push('padding interno (todos os lados com 0px)');
        } else if (measureTypes && measureTypes.includes('inner')) {
          skipped.push('padding interno (sem Auto layout)');
        }

        if (measureTypes && measureTypes.includes('spacing') && _isAL && node.children.length > 1) {
          let spaceCount = 0;
          const _gapVals = [];
          const gapToken = await getVariableInfo(node, 'itemSpacing');
          for (let i = 0; i < node.children.length - 1; i++) {
            const child1 = node.children[i];
            const child2 = node.children[i + 1];
            const b1 = child1.absoluteRenderBounds || child1.absoluteBoundingBox;
            const b2 = child2.absoluteRenderBounds || child2.absoluteBoundingBox;
            if (!b1 || !b2) continue;

            if (node.layoutMode === "HORIZONTAL") {
              const startX = b1.x + b1.width;
              const endX = b2.x;
              const y = bounds.y + bounds.height / 2;
              if (endX > startX) {
                items.push(...createMeasurementLine(startX, y, endX, y, endX - startX, 'horizontal', { r: 0.208, g: 0.580, b: 0.522 }, gapToken));
                spaceCount++;
                _gapVals.push(Math.round(endX - startX));
              }
            } else if (node.layoutMode === "VERTICAL") {
              const startY = b1.y + b1.height;
              const endY = b2.y;
              const x = bounds.x + bounds.width / 2;
              if (endY > startY) {
                items.push(...createMeasurementLine(x, startY, x, endY, endY - startY, 'vertical', { r: 0.208, g: 0.580, b: 0.522 }, gapToken));
                spaceCount++;
                _gapVals.push(Math.round(endY - startY));
              }
            }
          }
          // Rótulo com a distância REAL medida (antes repetia node.itemSpacing,
          // que é 0 em "space between" e virava "1 espaços de 0px").
          if (spaceCount > 0) {
            const uniq = [...new Set(_gapVals)];
            const auto = node.primaryAxisAlignItems === 'SPACE_BETWEEN';
            const vals = uniq.length === 1 ? `${uniq[0]}px` : `${Math.min(...uniq)}–${Math.max(...uniq)}px`;
            appliedDetails.push(`Gap: ${spaceCount} ${spaceCount > 1 ? 'espaços' : 'espaço'} de ${vals}${auto ? ' (space between)' : ''}${gapToken ? ' [' + gapToken + ']' : ''}`);
          } else {
            skipped.push('gap (as camadas internas estão encostadas, 0px)');
          }
        } else if (measureTypes && measureTypes.includes('spacing')) {
          skipped.push(_isAL ? 'gap (menos de 2 camadas internas)' : 'gap (sem Auto layout)');
        }

        if (measureTypes && measureTypes.includes('outer')) {
          if (node.parent && node.parent.type !== "PAGE") {
            const pb = node.parent.absoluteRenderBounds || node.parent.absoluteBoundingBox;
            if (pb) {
              const shiftX = bounds.x + bounds.width / 2 + 12;
              const shiftY = bounds.y + bounds.height / 2 + 12;
              let outers = [];
              if (bounds.y > pb.y) { items.push(...createMeasurementLine(shiftX, pb.y, shiftX, bounds.y, bounds.y - pb.y, 'vertical', { r: 0.9529, g: 0.5725, b: 0 })); outers.push(`Top: ${Math.round(bounds.y - pb.y)}`); }
              if (bounds.x > pb.x) { items.push(...createMeasurementLine(pb.x, shiftY, bounds.x, shiftY, bounds.x - pb.x, 'horizontal', { r: 0.9529, g: 0.5725, b: 0 })); outers.push(`Left: ${Math.round(bounds.x - pb.x)}`); }
              if (pb.x + pb.width > bounds.x + bounds.width) { items.push(...createMeasurementLine(bounds.x + bounds.width, shiftY, pb.x + pb.width, shiftY, (pb.x + pb.width) - (bounds.x + bounds.width), 'horizontal', { r: 0.9529, g: 0.5725, b: 0 })); outers.push(`Right: ${Math.round((pb.x + pb.width) - (bounds.x + bounds.width))}`); }
              if (pb.y + pb.height > bounds.y + bounds.height) { items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height, shiftX, pb.y + pb.height, (pb.y + pb.height) - (bounds.y + bounds.height), 'vertical', { r: 0.9529, g: 0.5725, b: 0 })); outers.push(`Bottom: ${Math.round((pb.y + pb.height) - (bounds.y + bounds.height))}`); }
              if (outers.length > 0) appliedDetails.push(`Espaçamento Externo: ${outers.join(', ')}`);
              else skipped.push('espaçamento externo (encostado no frame pai)');
            }
          } else {
            skipped.push('espaçamento externo (o elemento não está dentro de um frame)');
          }
        }
        if (skipped.length > 0) skippedMeasures.push({ name: node.name, reasons: skipped, created: items.length > 0 });

        if (items.length > 0) {
          const group = figma.group(items, figma.currentPage);
          group.name = `[Medida] ${node.name}`;
          group.locked = true;
          group.setPluginData('handexCategory', 'medida');
          group.setPluginData('handexMeasureTargetId', node.id);
          _hdMoveToCategorySection(group, 'medida');
          appliedMeasuresList.push({ name: node.name, nodeId: group.id, details: appliedDetails });
        }

        /* â”€â”€ DORMANT: Frame Auxiliar de Medidas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         * Para ativar:
         *   1. Remover o bloco `figma.group(...)` acima
         *   2. Descomentar este bloco
         *   3. Remover `disabled` e `opacity-50` do checkbox `chk-store-parent` no modal
         *
         * Comportamento: cria "[Medida-Aux] NomeDoFrame" ao lado do original,
         * coloca uma cópia do frame dentro, aplica as medidas na cópia e
         * cria um conector pontilhado ligando original â†’ auxiliar.
         * Re-scan substitui o frame auxiliar existente.
         */
        // if (items.length > 0) {
        //   const pageLvl = figma.currentPage;
        //   const orig = (node.parent && node.parent.type === 'FRAME') ? node.parent : node;
        //   const auxName = `[Medida-Aux] ${orig.name}`;
        //
        //   // Re-scan: substitui frame auxiliar anterior
        //   const existing = pageLvl.children.find(n => n.name === auxName && n.type === 'FRAME');
        //   if (existing) existing.remove();
        //
        //   // Cria frame auxiliar ao lado do original
        //   const auxFrame = figma.createFrame();
        //   auxFrame.name = auxName;
        //   auxFrame.resize(orig.width + 120, orig.height + 120);
        //   auxFrame.x = orig.x + orig.width + 80;
        //   auxFrame.y = orig.y;
        //   auxFrame.fills = [{ type: 'SOLID', color: { r: 0.9686, g: 0.9804, b: 0.9804 } }];
        //   pageLvl.appendChild(auxFrame);
        //
        //   // Copia o frame original para dentro do auxiliar
        //   const clone = orig.clone();
        //   clone.x = 60; clone.y = 60;
        //   auxFrame.appendChild(clone);
        //
        //   // Insere as anotações de medida no frame auxiliar
        //   const group = figma.group(items, auxFrame);
        //   group.name = `[Medidas] ${node.name}`;
        //   group.locked = true;
        //
        //   // Conector pontilhado: original â†’ auxiliar
        //   const connector = figma.createConnector();
        //   connector.connectorStart = { endpointNodeId: orig.id, magnet: 'AUTO' };
        //   connector.connectorEnd   = { endpointNodeId: auxFrame.id, magnet: 'AUTO' };
        //   connector.connectorLineType = 'ELBOWED';
        //   connector.strokes = [{ type: 'SOLID', color: { r: 0.6196, g: 0.698, b: 0.7216 } }];
        //   connector.strokeWeight = 1.5;
        //   connector.dashPattern = [4, 4];
        //
        //   appliedMeasuresList.push({ name: node.name, nodeId: auxFrame.id, details: appliedDetails });
        // }
      }

      figma.ui.postMessage({ type: "measurements-applied", data: appliedMeasuresList, skipped: skippedMeasures });
      if (appliedMeasuresList.length > 0) figma.notify("Medidas aplicadas com sucesso!");
    })();
  }

  /* â”€â”€ DORMANT: Feature 5 — Mapeamento de Protótipo (Conectores + Mermaid) â”€â”€
   * Para ativar:
   *   1. Descomentar o bloco abaixo
   *   2. Adicionar botão "Mapear Protótipo" na view de Fluxos (Step 4)
   *      com onclick: parent.postMessage({ pluginMessage: { type: 'map-prototype-flows' } }, '*')
   *   3. Adicionar handler 'prototype-flows-mapped' em messages.js para receber
   *      { edges, mermaid } e renderizar na lista de fluxos
   *
   * Limitação conhecida: reactions contém apenas transições configuradas no
   * modo Prototype. Frames sem ligação não aparecem — informar o usuário e
   * deixar adição manual via Fluxos (Feature 4) como complemento.
   */
  // if (msg.type === 'map-prototype-flows') {
  //   const frames = figma.currentPage.children.filter(n =>
  //     n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'SECTION'
  //   );
  //   const edges = [];
  //   const nodeIndex = {};
  //   frames.forEach(frame => { nodeIndex[frame.id] = frame.name; });
  //
  //   frames.forEach(frame => {
  //     (frame.reactions || []).forEach(r => {
  //       if (r.action?.type === 'NODE' && r.action.destinationId) {
  //         edges.push({
  //           sourceId:   frame.id,
  //           sourceName: frame.name,
  //           destId:     r.action.destinationId,
  //           destName:   nodeIndex[r.action.destinationId] || r.action.destinationId,
  //           trigger:    r.trigger?.type || 'ON_CLICK'
  //         });
  //         // Conector visual no canvas
  //         const connector = figma.createConnector();
  //         connector.connectorStart = { endpointNodeId: frame.id, magnet: 'AUTO' };
  //         connector.connectorEnd   = { endpointNodeId: r.action.destinationId, magnet: 'AUTO' };
  //         connector.connectorLineType = 'ELBOWED';
  //         connector.strokes = [{ type: 'SOLID', color: { r: 0.1765, g: 0.5412, b: 0.8471 } }];
  //         connector.strokeWeight = 2;
  //       }
  //     });
  //   });
  //
  //   // Serialização Mermaid
  //   // Exemplo de saída: flowchart LR\n  N0["Home"] -->|ON_CLICK| N1["Dashboard"]
  //   const idMap = {};
  //   let idx = 0;
  //   let mermaid = 'flowchart LR\n';
  //   edges.forEach(e => {
  //     if (!idMap[e.sourceId]) idMap[e.sourceId] = `N${idx++}`;
  //     if (!idMap[e.destId])   idMap[e.destId]   = `N${idx++}`;
  //     const src = e.sourceName.replace(/"/g, "'");
  //     const dst = e.destName.replace(/"/g, "'");
  //     mermaid += `  ${idMap[e.sourceId]}["${src}"] -->|${e.trigger}| ${idMap[e.destId]}["${dst}"]\n`;
  //   });
  //
  //   figma.ui.postMessage({ type: 'prototype-flows-mapped', edges, mermaid });
  //   if (edges.length === 0) {
  //     figma.notify('Nenhuma ligação de protótipo encontrada. Adicione conexões manualmente via Fluxos.');
  //   }
  //   return;
  // }

  if (msg.type === "scan-frame") {
    // Qualquer falha fora dos try internos devolvia nada à UI e o loading
    // "Escaneando frame..." ficava preso (2026-10-05) -- agora sempre responde.
    const _scanT0 = Date.now();
    try {
      await _hdRunScanFrame(msg);
    } catch (err) {
      console.error('[Handex scan] falhou:', String(err && err.message || err), err && err.stack);
      figma.ui.postMessage({ type: "scan-result", frameId: msg.frameId || null, error: 'Não foi possível concluir o escaneamento: ' + (err && err.message || err) });
    }
    console.log('[Handex scan] total', Date.now() - _scanT0, 'ms');
    return;
  }

  // Conta camadas visíveis abaixo do nível `limit` e a profundidade máxima
  // (até SCAN_DEPTH_HARD_MAX + 1). Só percorre `children`, sem ler propriedade.
  function _hdProbeDepth(roots, limit) {
    let maxDepth = 0, deeper = 0, standardCount = 0, fullCount = 0;
    const all = [];
    const walk = (n, d) => {
      if (n.visible === false) return;
      if (d > maxDepth) maxDepth = d;
      if (d > limit) deeper++;
      if (d <= limit) standardCount++;
      if (d <= SCAN_DEPTH_HARD_MAX) fullCount++;
      all.push({ n: String(n.name || n.type), d, std: d <= limit, full: d <= SCAN_DEPTH_HARD_MAX });
      if (d > SCAN_DEPTH_HARD_MAX || !('children' in n) || !n.children) return;
      for (const c of n.children) walk(c, d + 1);
    };
    roots.forEach(r => walk(r, 0));
    // Nomes das camadas para o modal (teto 300: 150 do Padrão + 150 só do
    // Completo); o excedente vira contagem "+N".
    const NAMES_CAP = 150;
    const stdAll = all.filter(x => x.std), extraAll = all.filter(x => !x.std && x.full);
    const layers = stdAll.slice(0, NAMES_CAP).concat(extraAll.slice(0, NAMES_CAP));
    return {
      maxDepth, deeper, standardCount, fullCount, layers,
      stdMore: Math.max(0, stdAll.length - NAMES_CAP),
      extraMore: Math.max(0, extraAll.length - NAMES_CAP),
      beyondFull: all.length - fullCount
    };
  }

  async function _hdRunScanFrame(msg) {
    // Se veio um nodeId específico, usa ele; senão usa a seleção atual do canvas
    let selection;
    if (msg.nodeId) {
      const specificNode = await figma.getNodeByIdAsync(msg.nodeId);
      selection = specificNode ? [specificNode] : [];
    } else {
      selection = figma.currentPage.selection;
    }
    const _scanFrameId = msg.frameId || null;
    // Profundidade (2026-10-08): padrão SCAN_DEPTH_DEFAULT níveis. Sem decisão
    // do designer (msg.scanDepth) e com camadas mais fundas que isso, só conta
    // e pergunta antes de escanear.
    const _scanMaxDepth = typeof msg.scanDepth === 'number' ? Math.min(SCAN_DEPTH_HARD_MAX, Math.max(1, msg.scanDepth)) : SCAN_DEPTH_DEFAULT;
    if (typeof msg.scanDepth !== 'number' && selection.length > 0) {
      const probe = _hdProbeDepth(selection, SCAN_DEPTH_DEFAULT);
      if (probe.deeper > 0) {
        figma.ui.postMessage({ type: 'scan-depth-check', frameId: _scanFrameId, maxDepth: probe.maxDepth, deeper: probe.deeper, defaultDepth: SCAN_DEPTH_DEFAULT, hardMax: SCAN_DEPTH_HARD_MAX, standardCount: probe.standardCount, fullCount: probe.fullCount, layers: probe.layers, stdMore: probe.stdMore, extraMore: probe.extraMore, beyondFull: probe.beyondFull });
        return;
      }
    }

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "scan-result",
        frameId: _scanFrameId,
        error: "Nenhum item selecionado. Por favor, selecione um ou mais frames, seções ou grupos no Figma para escanear.",
      });
      return;
    }

    const specs = {
      components: new Map(),
      icons: new Map(),
      typography: new Map(),
      frames: new Map(),
      vectors: new Map()
    };
    const frameJson = frameJsonTemplate();

    const selectedLibSlugs = Array.isArray(msg.selectedLibSlugs) && msg.selectedLibSlugs.length > 0 ? msg.selectedLibSlugs : null;
    // O skeleton já está em _refSkeletonCache (guardado no topo do onmessage).
    // Mesmo objeto entre scans = índice de chaves de auditProperty (audit.js)
    // construído uma vez só.
    const rawReferenceTokens = _refSkeletonCache || null;
    const referenceTokens = (() => {
      if (!rawReferenceTokens || !selectedLibSlugs) return rawReferenceTokens;
      const list = Array.isArray(rawReferenceTokens) ? rawReferenceTokens : [rawReferenceTokens];
      const filtered = list.filter(lib => lib && lib.slug && (selectedLibSlugs.includes(lib.slug) || lib.shared === true));
      if (filtered.filter(lib => lib.shared !== true).length === 0) {
        // Mantém o fallback (travar o scan seria pior), mas não em silêncio:
        // slug salvo que já não existe no skeleton embarcado.
        console.warn('[Handex] Nenhuma das libs selecionadas existe no skeleton (' + selectedLibSlugs.join(', ') + '); auditando contra todas as libs.');
        return rawReferenceTokens;
      }
      return filtered;
    })();
    const allowedCategories = msg.categories || null; // Array of strings or null

    // Wraps auditProperty + derives the legacy isDS flag (true | "warning" | false).
    // Returns an object that can be spread into the prop, e.g.:
    //   props.push({ ..., ...audit("colors", hex, key) });
    // isRemote: variável ou estilo vem de lib publicada (variable.remote / style.remote).
    // altKey: a outra chave da mesma propriedade (estilo x variável) -- uma prop
    // pode ter as duas, e basta uma bater no skeleton.
    //
    // "remote" NÃO prova que o token é do DSC: só que vem de ALGUMA lib
    // publicada (pode ser lib pessoal, de outro projeto, de terceiros). Até a
    // v6.32.0 isso aprovava direto, sem consultar o skeleton -- mesma brecha já
    // corrigida pra componentes em v6.8.3. Agora a lib publicada do DSC (o
    // skeleton é o snapshot dela) é a única prova: bateu a chave = conforme;
    // remoto sem match = "warning" (necessita revisão -- pode ser lib fora do
    // DSC ou skeleton desatualizado), nunca false (vermelho é desvio
    // comprovado, não desconhecimento). Sem skeleton disponível também é
    // "warning" (não verificado), nunca aprovado.
    const _unmatchedRemoteLogged = new Set();
    const _lastVarIdByKey = new Map();
    async function _logUnmatchedRemote(propType, propName, propKey, altKey, varId) {
      let colecao = null, colecaoKey = null, modos = null;
      try {
        const v = varId ? await figma.variables.getVariableByIdAsync(varId) : null;
        const c = v ? await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId) : null;
        if (c) { colecao = c.name; colecaoKey = c.key || null; modos = (c.modes || []).map(m => m.name).join(', '); }
      } catch (e) { colecao = 'erro: ' + (e && e.message); }
      console.warn('[Handex scan] token de lib publicada sem chave no skeleton:', JSON.stringify({ tipo: propType, token: propName, key: propKey, altKey: altKey || null, colecao, colecaoKey, modos, varId: varId || null }));
    }
    function audit(propType, propValue, propKey, propName, isRemote, altKey) {
      let result = auditProperty(propName, propValue, propType, propKey, referenceTokens);
      if (result.score < AUDIT_SCORE.EXACT && altKey && altKey !== propKey) {
        const alt = auditProperty(propName, propValue, propType, altKey, referenceTokens);
        if (alt.score > result.score) result = alt;
      }
      if (result.score < AUDIT_SCORE.EXACT && isRemote) {
        // Sem skeleton não há como provar origem: "não verificado" (âmbar), nunca
        // "conforme". A UI manda o skeleton antes de toda operação que o usa
        // (_withRefSkeleton, core.js), então este ramo só ocorre se o
        // skeleton embarcado estiver ausente.
        if (!referenceTokens) {
          return { isDS: "warning", score: null, matchedBy: 'unverified-no-skeleton', matchedIn: null, matchedTokenName: null };
        }
        if (!_unmatchedRemoteLogged.has(propKey || propName)) {
          _unmatchedRemoteLogged.add(propKey || propName);
          _logUnmatchedRemote(propType, propName, propKey, altKey, _lastVarIdByKey.get(propKey));
        }
        return { isDS: "warning", score: null, matchedBy: 'remote-unverified', matchedIn: null, matchedTokenName: null };
      }
      const isDS = result.score >= AUDIT_SCORE.EXACT ? true
                 : result.score >= AUDIT_SCORE.SOFT ? "warning"
                 : false;
      return {
        isDS,
        score: null,
        matchedBy: result.matchedBy,
        matchedIn: result.matchedIn,
        matchedTokenName: result.matchedTokenName,
        matchedTier: result.matchedTier
      };
    }

    function rgbToHex(r, g, b) {
      const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };
      return "#" + toHex(r) + toHex(g) + toHex(b);
    }

    async function getVar(n, p) {
      if (!n.boundVariables) return null;
      const v = n.boundVariables[p];
      if (!v) return null;
      const id = Array.isArray(v) ? (v[0] && v[0].id) : v.id;
      if (!id) return null;
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (variable && variable.key) _lastVarIdByKey.set(variable.key, variable.id);
      return variable ? { name: variable.name, key: variable.key, remote: variable.remote === true } : null;
    }
    async function _resolveVarById(id) {
      if (!id) return null;
      const variable = await figma.variables.getVariableByIdAsync(id);
      return variable ? { name: variable.name, key: variable.key, remote: variable.remote === true } : null;
    }
    // fill/stroke (paint) e effect NÃO seguem o padrão de node.boundVariables[prop]
    // usado acima (itemSpacing/padding/strokeWeight/topLeftRadius/fontSize,
    // todos campos escalares do próprio nó) -- o binding de cor de um paint
    // vive dentro do próprio paint (paint.boundVariables.color.id), e o
    // binding de um effect (radius/spread/offset/color) vive dentro do
    // próprio effect (effect.boundVariables.{campo}.id). getVar(n, "fills")/
    // getVar(n, "strokes") sempre retornavam null, fazendo o scan reportar
    // hex bruto mesmo quando havia um token de cor real vinculado -- impacto
    // real: conformidade DSC calculada a partir de "sem token" quando na
    // verdade havia um.
    async function getPaintVar(paint) {
      return _resolveVarById(paint && paint.boundVariables && paint.boundVariables.color && paint.boundVariables.color.id);
    }
    async function getEffectVar(effect, field) {
      return _resolveVarById(effect && effect.boundVariables && effect.boundVariables[field] && effect.boundVariables[field].id);
    }

    async function extractNodeProperties(n) {
      const props = [];
      
      // Colors (Fills)
      if ('fills' in n && Array.isArray(n.fills)) {
        let styleName = null;
        let styleKey = null;
        let fillStyleRemote = false;
        if ('fillStyleId' in n && typeof n.fillStyleId === "string" && n.fillStyleId) {
          const style = await figma.getStyleByIdAsync(n.fillStyleId);
          if (style) { styleName = style.name; styleKey = style.key; fillStyleRemote = style.remote === true; }
        }
        for (const fill of n.fills) {
          // SKIP HIDDEN FILLS
          if (fill.visible === false) continue;

          if (fill.type === "SOLID" && fill.color) {
            const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b).toUpperCase();
            const vInfo = await getPaintVar(fill);
            const name = (vInfo && vInfo.name) || styleName || hex;
            const key = (vInfo && vInfo.key) || styleKey;
            const _isRemote = (vInfo && vInfo.remote) || fillStyleRemote;
            props.push({ type: "color", name, value: hex, rawValue: hex, key, variableKey: vInfo ? vInfo.key : null, styleKey, label: HD_GLOSSARY.labels.fill, propId: "fill", ...audit("colors", hex, key, name, _isRemote, styleKey) });
          }
        }
      }

      // Typography
      if (n.type === "TEXT") {
        let styleName = null;
        let styleKey = null;
        let textStyleRemote = false;
        if ('textStyleId' in n && typeof n.textStyleId === "string" && n.textStyleId !== figma.mixed && n.textStyleId) {
          const style = await figma.getStyleByIdAsync(n.textStyleId);
          if (style) { styleName = style.name; styleKey = style.key; textStyleRemote = style.remote === true; }
        }
        // Variáveis de tipografia (fontSize/fontFamily/lineHeight/etc) são um
        // mecanismo separado de Text Style -- um TEXT pode ter fontSize
        // vinculado a uma variável sem nenhum Text Style aplicado. Sem essa
        // checagem, esses casos sempre caíam no fallback de "Family Style
        // (NNpx)" cru, mesmo tendo um token real. Só fontSize é usado como
        // representante (mesmo padrão de cornerRadius acima) -- é o campo
        // mais comumente tokenizado e evita duplicar leitura de vários
        // campos pra um resultado que é só o "name" de exibição.
        const sizeVar = await getVar(n, "fontSize");
        const family = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.family : "Mixed";
        const fontStyle = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.style : "Mixed";
        const size = (n.fontSize && n.fontSize !== figma.mixed) ? n.fontSize : "Mixed";
        const name = styleName || (sizeVar && sizeVar.name) || `${family} ${fontStyle} (${size}px)`;
        const rawSize = typeof size === "number" ? size : null;
        const typoKey = styleKey || (sizeVar ? sizeVar.key : null);
        props.push({ type: "typography", name, value: name, rawValue: rawSize, key: typoKey, variableKey: sizeVar ? sizeVar.key : null, styleKey, label: HD_GLOSSARY.labels.typography, propId: "typography", ...audit("typography", name, typoKey, name, textStyleRemote || (sizeVar && sizeVar.remote), sizeVar ? sizeVar.key : null) });
      }

      // Spacing, Alignment
      if ('layoutMode' in n && n.layoutMode !== "NONE") {
        // Valor 0 com variável vinculada (ex: spacing/none) é conformidade
        // válida: registra e audita; valor 0 sem token continua omitido.
        if (n.itemSpacing !== figma.mixed) {
          const vInfo = await getVar(n, "itemSpacing");
          if (n.itemSpacing > 0 || vInfo) {
            const val = `${n.itemSpacing}px`;
            const name = (vInfo && vInfo.name) || val;
            const propKey = vInfo ? vInfo.key : null;
            props.push({ type: "spacing", name, value: val, rawValue: n.itemSpacing, key: propKey, variableKey: propKey, label: HD_GLOSSARY.labels.gap, propId: "gap", ...audit("spacing", val, propKey, name, vInfo && vInfo.remote) });
          }
        }
        const paddings = [
          { prop: 'paddingTop', label: 'Top' }, { prop: 'paddingRight', label: 'Right' },
          { prop: 'paddingBottom', label: 'Bottom' }, { prop: 'paddingLeft', label: 'Left' }
        ];
        for (const p of paddings) {
          const vInfo = await getVar(n, p.prop);
          if (n[p.prop] > 0 || vInfo) {
            const val = `${n[p.prop] || 0}px`;
            const name = (vInfo && vInfo.name) || val;
            const propKey = vInfo ? vInfo.key : null;
            props.push({ type: "spacing", name, value: val, rawValue: n[p.prop] || 0, key: propKey, variableKey: propKey, label: `Padding ${p.label}`, propId: p.prop, ...audit("spacing", val, propKey, name, vInfo && vInfo.remote) });
          }
        }
      }

      // Borders
      if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0) {
        // ONLY SCAN VISIBLE STROKES WITH WEIGHT > 0
        const visibleStroke = n.strokes.find(s => s.visible !== false && (s.opacity === undefined || s.opacity > 0));
        
        // Espessura lida pelos 4 lados (_specStrokeWidths): borda por lado
        // guarda a variável em boundVariables.strokeTopWeight etc., nunca em
        // strokeWeight -- ler só strokeWeight reportava "sem token".
        const strokeW = visibleStroke ? await _specStrokeWidths(n) : null;
        if (visibleStroke && strokeW) {
          for (const r of strokeW.rows) {
            const val = `${r.value}px`;
            const name = (r.info && r.info.name) || val;
            const propKey = r.info ? r.info.key : null;
            props.push({ type: "strokeWeight", name, value: val, rawValue: r.value, key: propKey, variableKey: propKey, label: r.side ? `${HD_GLOSSARY.labels.strokeWidth} ${r.side}` : HD_GLOSSARY.labels.strokeWidth, propId: r.side ? `strokeWidth${r.side}` : "strokeWidth", ...audit("borders", val, propKey, name, r.info && r.info.remote) });
          }

          if (visibleStroke.type === "SOLID") {
            const hex = rgbToHex(visibleStroke.color.r, visibleStroke.color.g, visibleStroke.color.b).toUpperCase();
            let styleName = null; let styleKey = null; let strokeStyleRemote = false;
            if ('strokeStyleId' in n && n.strokeStyleId) {
              const st = await figma.getStyleByIdAsync(n.strokeStyleId);
              if (st) { styleName = st.name; styleKey = st.key; strokeStyleRemote = st.remote === true; }
            }
            const sVar = await getPaintVar(visibleStroke);
            const strokeKey = (sVar && sVar.key) || styleKey;
            const strokeName = (sVar && sVar.name) || styleName || hex;
            props.push({ type: "stroke", name: strokeName, value: hex, rawValue: hex, key: strokeKey, variableKey: sVar ? sVar.key : null, styleKey, label: HD_GLOSSARY.labels.stroke, propId: "stroke", ...audit("colors", hex, strokeKey, strokeName, (sVar && sVar.remote) || strokeStyleRemote, styleKey) });
          }
        }
      }

      if ('cornerRadius' in n && n.cornerRadius !== figma.mixed && n.cornerRadius > 0) {
        // "cornerRadius" não é um campo vinculável de verdade -- a Plugin API
        // só expõe binding nos 4 cantos individuais (topLeftRadius etc, ver
        // VariableBindableNodeField). getVar(n, "cornerRadius") sempre
        // retornava null. Como o código só chega aqui quando cornerRadius
        // !== figma.mixed (os 4 cantos já são iguais), basta ler um
        // representante -- topLeftRadius.
        const vInfo = await getVar(n, "topLeftRadius");
        const val = `${n.cornerRadius}px`;
        const name = (vInfo && vInfo.name) || val;
        const propKey = vInfo ? vInfo.key : null;
        props.push({ type: "radius", name, value: val, rawValue: n.cornerRadius, key: propKey, variableKey: propKey, label: HD_GLOSSARY.labels.radius, propId: "radius", ...audit("borders", val, propKey, name, vInfo && vInfo.remote) });
      }

      // Effects
      if ('effects' in n && Array.isArray(n.effects)) {
        let styleName = null; let styleKey = null; let effectStyleRemote = false;
        if ('effectStyleId' in n && n.effectStyleId) {
          const style = await figma.getStyleByIdAsync(n.effectStyleId);
          if (style) { styleName = style.name; styleKey = style.key; effectStyleRemote = style.remote === true; }
        }
        for (const effect of n.effects) {
          if (effect.visible) {
             // Variável de effect (radius/spread/offset/color) vive dentro
             // do próprio objeto effect, em effect.boundVariables.{campo}.id
             // -- mesmo padrão estrutural de paint (fill/stroke), nunca em
             // node.boundVariables. Sem Effect Style aplicado, isso nunca
             // tinha sido checado -- radius é usado como representante por
             // existir tanto em shadow quanto em blur.
             const effVar = await getEffectVar(effect, 'radius');
             const name = styleName || (effVar && effVar.name) || `${effect.type} (${effect.type.includes('SHADOW') ? 'Sombra' : 'Blur'})`;
             const effKey = styleKey || (effVar ? effVar.key : null);
             props.push({ type: "effect", name, value: effect.type, key: effKey, variableKey: effVar ? effVar.key : null, styleKey, label: "Effect", propId: "effect", ...audit("effects", effect.type, effKey, name, effectStyleRemote || (effVar && effVar.remote), effVar ? effVar.key : null) });
          }
        }
      }

      // RESIZING (Width / Height behavior)
      if (n.type !== "PAGE" && n.parent && n.parent.type !== "PAGE") {
        const parent = n.parent;
        let wMode = "Fixed";
        let hMode = "Fixed";

        // Logic for Width
        if (parent.layoutMode === "HORIZONTAL" && n.layoutGrow === 1) wMode = "Fill container";
        else if (parent.layoutMode === "VERTICAL" && n.layoutAlign === "STRETCH") wMode = "Fill container";
        else if (n.layoutMode && ((n.layoutMode === "HORIZONTAL" && n.primaryAxisSizingMode === "AUTO") || (n.layoutMode === "VERTICAL" && n.counterAxisSizingMode === "AUTO"))) wMode = "Hug contents";

        // Logic for Height
        if (parent.layoutMode === "VERTICAL" && n.layoutGrow === 1) hMode = "Fill container";
        else if (parent.layoutMode === "HORIZONTAL" && n.layoutAlign === "STRETCH") hMode = "Fill container";
        else if (n.layoutMode && ((n.layoutMode === "VERTICAL" && n.primaryAxisSizingMode === "AUTO") || (n.layoutMode === "HORIZONTAL" && n.counterAxisSizingMode === "AUTO"))) hMode = "Hug contents";

        props.push({ type: "layout", name: wMode, value: wMode, isDS: null, score: null, matchedBy: "not-evaluated", matchedIn: null, label: HD_GLOSSARY.labels.sizingW, propId: "sizingW" });
        props.push({ type: "layout", name: hMode, value: hMode, isDS: null, score: null, matchedBy: "not-evaluated", matchedIn: null, label: HD_GLOSSARY.labels.sizingH, propId: "sizingH" });
      }

      // VARIANTS (For Instances)
      if (n.type === "INSTANCE" && n.componentProperties) {
        for (const [propName, propObj] of Object.entries(n.componentProperties)) {
          // Format name: remove #... suffix if present
          const cleanName = propName.split("#")[0];
          // INSTANCE_SWAP guarda o id do componente: mostra o nome, nunca o id cru.
          const val = propObj.type === "INSTANCE_SWAP"
            ? ((await _specComponentName(propObj.value)) || "(componente da biblioteca)")
            : String(propObj.value);
          props.push({ type: "variant", name: cleanName, value: val, isDS: null, score: null, matchedBy: "not-evaluated", matchedIn: null, label: `${HD_GLOSSARY.propTypes[propObj.type] || propObj.type}: ${cleanName}`, propId: `prop:${cleanName}` });
        }
      }

      return props;
    }

    const _isLibNodeType = (t) => t === 'INSTANCE' || t === 'COMPONENT' || t === 'COMPONENT_SET';
    const _libLinkCache = new Map();
    const _ancestorLinkCache = new Map();
    const _keyedDescendantCache = new Map();

    async function _nodeKey(n) {
      if (n.type === 'INSTANCE') {
        const m = await n.getMainComponentAsync();
        return m ? m.key : null;
      }
      return n.key || null;
    }

    async function _libLinkOf(n, knownKey) {
      if (_libLinkCache.has(n.id)) return _libLinkCache.get(n.id);
      const key = knownKey !== undefined ? knownKey : await _nodeKey(n);
      let result = null;
      if (key) {
        const a = auditProperty(n.name, n.name, "components", key, referenceTokens);
        if (a.score >= AUDIT_SCORE.EXACT) result = { lib: a.matchedIn || null, tier: a.matchedTier || null, name: n.name };
      }
      _libLinkCache.set(n.id, result);
      return result;
    }

    // Sobe pelos pais até achar um com componentKey no skeleton; memorizado
    // por nó, então irmãos compartilham o resultado do trecho já percorrido.
    async function _libAncestorOf(n) {
      const p = n.parent;
      if (!p || p.type === 'PAGE' || p.type === 'DOCUMENT') return null;
      if (_ancestorLinkCache.has(p.id)) return _ancestorLinkCache.get(p.id);
      let result = null;
      if (_isLibNodeType(p.type)) result = await _libLinkOf(p);
      if (!result) result = await _libAncestorOf(p);
      _ancestorLinkCache.set(p.id, result);
      return result;
    }

    async function _hasKeyedDescendant(n) {
      if (_keyedDescendantCache.has(n.id)) return _keyedDescendantCache.get(n.id);
      let found = false;
      if (n.children) {
        for (const c of n.children) {
          if ((_isLibNodeType(c.type) && await _libLinkOf(c)) || await _hasKeyedDescendant(c)) { found = true; break; }
        }
      }
      _keyedDescendantCache.set(n.id, found);
      return found;
    }

    // ── Fase 5b: personalização de instância DSC ────────────────────────────
    // Referência = componente principal (variante atual) com os valores das
    // propriedades de componente aplicados, o estado que o "Reset" do Figma
    // restauraria. instance.overrides diz QUAIS campos de QUAIS sub-nós
    // diferem desse estado; o valor atual vem da instância e o padrão, do nó
    // equivalente no componente principal. Texto (characters), visibilidade e
    // troca via propriedade INSTANCE_SWAP nunca contam.
    const _CUST_FIELD_GROUPS = {
      fills: ['fill'], fillStyleId: ['fill'],
      strokes: ['stroke'], strokeStyleId: ['stroke'],
      effects: ['effect'], effectStyleId: ['effect'],
      cornerRadius: ['radius'], topLeftRadius: ['radius'], topRightRadius: ['radius'], bottomLeftRadius: ['radius'], bottomRightRadius: ['radius'],
      strokeWeight: ['strokeWeight'], strokeTopWeight: ['strokeWeight'], strokeRightWeight: ['strokeWeight'], strokeBottomWeight: ['strokeWeight'], strokeLeftWeight: ['strokeWeight'], stokeTopWeight: ['strokeWeight'],
      itemSpacing: ['itemSpacing'], counterAxisSpacing: ['counterAxisSpacing'],
      paddingTop: ['paddingTop'], paddingRight: ['paddingRight'], paddingBottom: ['paddingBottom'], paddingLeft: ['paddingLeft'],
      width: ['width'], height: ['height'], size: ['width', 'height'],
      textStyleId: ['typography'], fontSize: ['typography'], fontName: ['typography'], lineHeight: ['typography'], letterSpacing: ['typography'],
      mainComponent: ['swap']
    };
    // Campos que a regra de produto exclui de propósito: não geram log de "não mapeado".
    const _CUST_IGNORED_FIELDS = new Set(['characters', 'styledTextSegments', 'visible', 'name', 'x', 'y', 'relativeTransform', 'rotation', 'componentProperties', 'componentPropertyReferences', 'componentPropertyDefinitions', 'pluginData', 'locked', 'reactions', 'opacity', 'blendMode', 'layoutPositioning', 'layoutGrow', 'layoutAlign', 'textAutoResize', 'textTruncation', 'maxLines', 'hyperlink', 'exportSettings', 'expanded', 'isExposedInstance', 'overrides', 'constraints', 'clipsContent', 'autoRename', 'description', 'mediaData']);
    // Grupos sensíveis a troca de token: o Figma nem sempre lista o campo em
    // overriddenFields quando só a variável vinculada muda, então são
    // reavaliados em todo sub-nó com override.
    const _CUST_IMPLICIT_GROUPS = ['radius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'counterAxisSpacing', 'strokeWeight'];
    let _custUnmappedLogs = 0;
    const _CUST_LABELS = {
      fill: HD_GLOSSARY.labels.fill, stroke: HD_GLOSSARY.labels.stroke, effect: 'Effect', radius: HD_GLOSSARY.labels.radius, strokeWeight: HD_GLOSSARY.labels.strokeWidth,
      itemSpacing: HD_GLOSSARY.labels.gap, counterAxisSpacing: HD_GLOSSARY.labels.rowGap,
      paddingTop: 'Padding Top', paddingRight: 'Padding Right', paddingBottom: 'Padding Bottom', paddingLeft: 'Padding Left',
      width: HD_GLOSSARY.labels.width, height: HD_GLOSSARY.labels.height, typography: HD_GLOSSARY.labels.typography, swap: HD_GLOSSARY.labels.swap
    };
    const _custVarNameCache = new Map();
    const _custIndexCache = new Map();
    let _custDiagLogged = false;
    let _custNotEvalLogs = 0;
    let _custStrokeProbeFirst = false;
    let _custStrokeProbeDiff = false;

    async function _custStrokeProbe(tag, layer, actual, def) {
      const FIELDS = ['strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];
      const side = async (n) => {
        const o = {};
        for (const f of FIELDS) {
          const v = n[f];
          const id = _custBoundId(n, f);
          o[f] = { v: v === figma.mixed ? 'mixed' : (typeof v === 'number' ? v : null), var: id ? { idBruto: id, key: _custVarKey(id), nome: await _custVarName(id) } : null };
        }
        return o;
      };
      try {
        console.log('[Handex 5b] sonda-borda ' + tag + ' ' + JSON.stringify({ camada: layer, instanciaId: actual.id, principalId: def.id, instancia: await side(actual), principal: await side(def) }));
      } catch (e) { console.log('[Handex 5b] sonda-borda falhou:', e && e.message); }
    }

    async function _custVarName(id) {
      if (!id) return null;
      if (_custVarNameCache.has(id)) return _custVarNameCache.get(id);
      let name = null;
      try { const v = await figma.variables.getVariableByIdAsync(id); name = v ? v.name : null; } catch (e) { name = null; }
      _custVarNameCache.set(id, name);
      return name;
    }

    async function _custStyleName(id) {
      if (!id) return null;
      try { const s = await figma.getStyleByIdAsync(id); return s ? s.name : null; } catch (e) { return null; }
    }

    function _custBoundId(node, field) {
      const bv = node.boundVariables && node.boundVariables[field];
      if (!bv) return '';
      return (Array.isArray(bv) ? (bv[0] && bv[0].id) : bv.id) || '';
    }

    function _custVarKey(id) {
      if (!id) return '';
      const m = /^VariableID:([^/]+)/.exec(id);
      return m ? m[1] : id;
    }

    async function _custNum(node, field, fallbackField) {
      const v = node[field];
      if (typeof v !== 'number') return null;
      const id = _custBoundId(node, field) || (fallbackField ? _custBoundId(node, fallbackField) : '');
      const vn = await _custVarName(id);
      const px = `${Math.round(v * 100) / 100}px`;
      return { val: String(v), hasTok: !!id, sig: v + '|' + _custVarKey(id), text: id ? `${vn || '(token da biblioteca)'} · ${px}` : `${px} (sem token)` };
    }

    async function _custMulti(node, fields, fallbackField) {
      const parts = [];
      for (const f of fields) {
        const p = await _custNum(node, f, fallbackField);
        if (!p) return null;
        parts.push(p);
      }
      const allSame = parts.every(p => p.text === parts[0].text);
      return { val: parts.map(p => p.val).join(','), hasTok: parts.some(p => p.hasTok), sig: parts.map(p => p.sig).join(','), text: allSame ? parts[0].text : parts.map(p => p.text).join(' / ') };
    }

    async function _custPaints(node, field, styleField) {
      const arr = node[field];
      if (!Array.isArray(arr)) return null;
      const styleId = (styleField in node && typeof node[styleField] === 'string') ? node[styleField] : '';
      const styleName = await _custStyleName(styleId);
      const sig = ['style:' + styleId];
      const texts = [];
      const vals = [];
      let hasTok = !!styleId;
      for (const p of arr) {
        if (p.visible === false) continue;
        if (p.type === 'SOLID' && p.color) {
          const hex = rgbToHex(p.color.r, p.color.g, p.color.b).toUpperCase();
          const vid = (p.boundVariables && p.boundVariables.color && p.boundVariables.color.id) || '';
          const vn = await _custVarName(vid);
          const op = p.opacity !== undefined && p.opacity !== 1 ? ' @' + Math.round(p.opacity * 100) + '%' : '';
          sig.push('S' + hex + op + '|' + _custVarKey(vid));
          vals.push(hex + op);
          if (vid) hasTok = true;
          texts.push((vn || styleName || vid) ? `${vn || styleName || '(token da biblioteca)'} (${hex}${op})` : hex + op);
        } else {
          sig.push(p.type);
          vals.push(p.type);
          texts.push(p.type);
        }
      }
      return { val: vals.join(';'), hasTok, sig: sig.join(';'), text: texts.join(', ') || 'nenhum' };
    }

    async function _custEffects(node) {
      if (!Array.isArray(node.effects)) return null;
      const styleId = (typeof node.effectStyleId === 'string') ? node.effectStyleId : '';
      const styleName = await _custStyleName(styleId);
      const sig = ['style:' + styleId];
      const texts = [];
      for (const e of node.effects) {
        if (e.visible === false) continue;
        const bv = e.boundVariables || {};
        const ids = Object.keys(bv).map(k => k + ':' + _custVarKey(bv[k] && bv[k].id)).join(',');
        const off = e.offset ? `${e.offset.x},${e.offset.y}` : '';
        sig.push([e.type, e.radius, e.spread, off, ids].join('|'));
        texts.push(`${e.type}${typeof e.radius === 'number' ? ' ' + e.radius + 'px' : ''}`);
      }
      const hasTok = !!styleId || node.effects.some(e => e.visible !== false && e.boundVariables && Object.keys(e.boundVariables).length > 0);
      return { hasTok, sig: sig.join(';'), text: (styleName ? styleName + ' — ' : '') + (texts.join(', ') || 'nenhum') };
    }

    async function _custTypography(node) {
      if (node.type !== 'TEXT') return null;
      const m = figma.mixed;
      if (node.textStyleId === m || node.fontSize === m || node.fontName === m || node.lineHeight === m || node.letterSpacing === m) return null;
      const styleId = typeof node.textStyleId === 'string' ? node.textStyleId : '';
      const styleName = await _custStyleName(styleId);
      const sizeId = _custBoundId(node, 'fontSize');
      const vn = await _custVarName(sizeId);
      const lh = node.lineHeight && node.lineHeight.unit !== 'AUTO' ? `${node.lineHeight.value}${node.lineHeight.unit === 'PERCENT' ? '%' : 'px'}` : 'auto';
      const base = `${node.fontName.family} ${node.fontName.style} ${node.fontSize}px`;
      const ls = node.letterSpacing ? `${node.letterSpacing.value}${node.letterSpacing.unit === 'PERCENT' ? '%' : 'px'}` : '0';
      return {
        val: [base, lh, ls].join('|'), hasTok: !!(styleId || sizeId),
        sig: [styleId, base, lh, ls, _custVarKey(sizeId)].join('|'),
        text: (styleName ? styleName + ' — ' : '') + base + ((vn || sizeId) ? ' (' + (vn || 'token da biblioteca') + ')' : '')
      };
    }

    async function _custSwap(node) {
      if (node.type !== 'INSTANCE') return null;
      if (node.componentPropertyReferences && node.componentPropertyReferences.mainComponent) return { ignore: true };
      const mc = await node.getMainComponentAsync();
      if (!mc) return null;
      const label = (mc.parent && mc.parent.type === 'COMPONENT_SET') ? mc.parent.name : mc.name;
      return { hasTok: true, sig: mc.key || mc.id, text: label };
    }

    async function _custSnapshot(node, group) {
      if (group === 'fill') return _custPaints(node, 'fills', 'fillStyleId');
      if (group === 'stroke') return _custPaints(node, 'strokes', 'strokeStyleId');
      if (group === 'effect') return _custEffects(node);
      if (group === 'typography') return _custTypography(node);
      if (group === 'swap') return _custSwap(node);
      if (group === 'radius') {
        return _custMulti(node, ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius']);
      }
      if (group === 'strokeWeight') {
        const sides = await _custMulti(node, ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'], 'strokeWeight');
        return sides || _custNum(node, 'strokeWeight');
      }
      if (group === 'width' || group === 'height') {
        const sizing = group === 'width' ? node.layoutSizingHorizontal : node.layoutSizingVertical;
        if (sizing && sizing !== 'FIXED') return { ignore: true };
        return _custNum(node, group);
      }
      return _custNum(node, group);
    }

    async function _custIdIndex(mainComp) {
      if (_custIndexCache.has(mainComp.id)) return _custIndexCache.get(mainComp.id);
      const index = new Map();
      let budget = 6000;
      const walk = (n) => {
        index.set(n.id, n);
        if (--budget <= 0 || !n.children) return;
        for (const c of n.children) walk(c);
      };
      walk(mainComp);
      _custIndexCache.set(mainComp.id, index);
      return index;
    }

    // ids de sub-nós de instância: I<instância>;<id no principal>; níveis
    // aninhados ficam como I<a>;<b>, e no principal o mesmo nó é "I<a>;<b>".
    async function _custDefaultNode(inst, mainComp, id) {
      if (id === inst.id) return mainComp;
      const prefix = inst.id + ';';
      if (!id.startsWith(prefix)) return null;
      const segs = id.slice(prefix.length).split(';');
      const key = segs.length === 1 ? segs[0] : 'I' + segs.join(';');
      const index = await _custIdIndex(mainComp);
      return index.get(key) || null;
    }

    async function _custEvalEntry(inst, mainComp, entry) {
      const out = { items: [], unresolved: 0 };
      const groups = new Set();
      const fieldsOf = entry.overriddenFields || [];
      fieldsOf.forEach(f => {
        if (_CUST_FIELD_GROUPS[f]) { _CUST_FIELD_GROUPS[f].forEach(g => groups.add(g)); }
        else if (!_CUST_IGNORED_FIELDS.has(f) && _custUnmappedLogs < 3) { _custUnmappedLogs++; console.log('[Handex 5b] campo de override sem mapeamento:', f, 'id:', entry.id); }
      });
      const actual = await figma.getNodeByIdAsync(entry.id);
      if (!actual) { if (groups.size > 0) out.unresolved++; return out; }
      const implicit = new Set();
      if (fieldsOf.length > 0) {
        _CUST_IMPLICIT_GROUPS.forEach(g => { if (!groups.has(g)) { groups.add(g); implicit.add(g); } });
      }
      if (actual.type === 'INSTANCE' && actual.id !== inst.id) groups.add('swap');
      if (groups.size === 0) return out;
      if (actual.id !== inst.id) {
        let p = actual.parent;
        while (p && p.id !== inst.id) {
          if (p.type === 'INSTANCE' && await _libLinkOf(p)) return out;
          p = p.parent;
        }
      }
      const def = await _custDefaultNode(inst, mainComp, entry.id);
      if (!def) { out.unresolved += groups.size - implicit.size; return out; }
      for (const g of groups) {
        const a = await _custSnapshot(actual, g);
        const d = await _custSnapshot(def, g);
        if (!a || !d) { if (!implicit.has(g)) out.unresolved++; continue; }
        if (a.ignore || d.ignore) continue;
        if (g === 'strokeWeight') {
          const differs = a.sig !== d.sig;
          if (differs && !_custStrokeProbeDiff) { _custStrokeProbeDiff = true; await _custStrokeProbe('DIFERENCA', actual.name, actual, def); }
          else if (!_custStrokeProbeFirst && typeof actual.strokeWeight === 'number' && actual.strokeWeight > 0) { _custStrokeProbeFirst = true; await _custStrokeProbe('PRIMEIRA', actual.name, actual, def); }
        }
        // Base é sempre a referência da lib (2026-10-08, decisão do Augusto):
        // só conta como personalização o que se afasta de um token, estilo ou
        // componente da lib. Padrão da lib sem referência (ex.: Header com
        // largura 1200px sem token) não é julgado, seja qual for o valor da
        // instância.
        if (!d.hasTok) continue;
        if (a.sig !== d.sig && String(a.text).trim() !== String(d.text).trim()) out.items.push({ layer: actual.name, campo: _CUST_LABELS[g] || g, atual: a.text, padrao: d.text });
      }
      return out;
    }

    // Retorna { list, unresolved } ou null (não avaliável: nunca conforme
    // nem âmbar falso).
    async function _customizationsOf(inst, mainComp) {
      let reason = null;
      try {
        if (!mainComp) { reason = 'sem componente principal'; return null; }
        const ov = inst.overrides;
        if (!Array.isArray(ov)) { reason = 'instance.overrides indisponível (' + typeof ov + ')'; return null; }
        if (!_custDiagLogged) {
          _custDiagLogged = true;
          let defKeys = null;
          try {
            const setNode = mainComp.parent && mainComp.parent.type === 'COMPONENT_SET' ? mainComp.parent : mainComp;
            defKeys = Object.keys(setNode.componentPropertyDefinitions || {});
          } catch (e) { defKeys = 'erro: ' + (e && e.message); }
          const fields = new Set();
          ov.forEach(o => (o.overriddenFields || []).forEach(f => fields.add(f)));
          console.log('[Handex 5b] sonda (1ª instância DSC do scan)', {
            instancia: inst.name,
            mainRemote: mainComp.remote === true,
            mainParentType: mainComp.parent ? mainComp.parent.type : null,
            definicoes: defKeys,
            overrides: ov.length,
            camposVistos: Array.from(fields),
            idsExemplo: ov.slice(0, 3).map(o => o.id)
          });
        }
        const list = [];
        let unresolved = 0;
        for (let i = 0; i < ov.length; i += 6) {
          const results = await Promise.all(ov.slice(i, i + 6).map(e => _custEvalEntry(inst, mainComp, e).catch(err => { unresolved++; return { items: [], unresolved: 0 }; })));
          results.forEach(r => { list.push(...r.items); unresolved += r.unresolved; });
        }
        if (list.length === 0 && unresolved > 0) { reason = unresolved + ' campo(s) sem leitura do padrão'; return null; }
        return { list, unresolved };
      } catch (err) {
        reason = 'erro: ' + (err && err.message ? err.message : String(err));
        return null;
      } finally {
        if (reason && _custNotEvalLogs < 3) { _custNotEvalLogs++; console.log('[Handex 5b] personalização não avaliada em "' + inst.name + '":', reason); }
      }
    }

    async function addElement(category, node, props) {
      // FILTRAGEM POR CATEGORIA (apenas se não for auditoria)
      if (allowedCategories && allowedCategories.length > 0) {
        let isAllowed = false;
        if (category === "frames" && allowedCategories.includes("containers")) isAllowed = true;
        else if (category === "vectors" && allowedCategories.includes("shapes")) isAllowed = true;
        else if (allowedCategories.includes(category)) isAllowed = true;
        
        if (!isAllowed) return;
      }

      // If props is empty, and it's not a component/icon/text, skip to reduce noise
      if (props.length === 0 && (category === "frames" || category === "vectors")) return;

      // Vectors: skip entirely — primitive shapes carry no DS conformance signal
      if (category === "vectors") return;

      const name = node.name;

      let componentKey = null;
      let mainComp = null;
      if (node.type === "INSTANCE") {
        mainComp = await node.getMainComponentAsync();
        if (mainComp) componentKey = mainComp.key;
      } else if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        componentKey = node.key;
      }

      // Vínculo real com o DSC é estrutural, nunca por nome: (1) o componentKey
      // do próprio nó bate no skeleton, ou (2) o nó está DENTRO de uma
      // instância/componente cujo componentKey bate (é parte dele). Nome de
      // camada é texto livre e nunca decide; mainComponent.remote só prova que
      // vem de alguma lib publicada, não do DSC.
      const _ownLibLink = (node.type === "INSTANCE" || node.type === "COMPONENT" || node.type === "COMPONENT_SET")
        ? await _libLinkOf(node, componentKey)
        : null;
      const _ancestorLink = _ownLibLink ? null : await _libAncestorOf(node);

      // Nó sem vínculo próprio nem ancestral com chave: não é auditado
      // isoladamente se tiver descendente com chave no skeleton (wrapper
      // interno/layout, a conformidade vive no descendente). Frames dentro de
      // um ancestral DSC são só estrutura do componente e também não entram.
      if (!_ownLibLink && category === "frames" && _ancestorLink) return;
      if (!_ownLibLink && !_ancestorLink && (category === "frames" || category === "components" || category === "icons")) {
        if (await _hasKeyedDescendant(node)) return;
      }

      let dsElement = false;
      let elementScore = null;
      let elementMatchedBy = null;
      let elementMatchedIn = null;
      let elementMatchedTokenName = null;
      let isCustomComponent = false;
      let legacyLib = false;
      if (category === "components" || category === "icons") {
        const a = audit(category, name, componentKey, name);
        legacyLib = _ownLibLink ? a.matchedTier === 'legacy' : false;
        dsElement = a.isDS;
        elementScore = a.score;
        elementMatchedBy = a.matchedBy;
        elementMatchedIn = a.matchedIn;
        elementMatchedTokenName = a.matchedTokenName;
        // Sub-componente interno de um componente DSC (ancestral com chave no
        // skeleton): parte dele, herda o nome REAL da lib do ancestral. A
        // chave própria nunca bate (não é publicado sozinho) -- achado
        // 2026-09-24: "Ação 2" dentro de ".[dsc] Header Actions".
        if (!_ownLibLink && _ancestorLink) {
          dsElement = true;
          elementScore = null;
          elementMatchedBy = 'ancestor-key';
          elementMatchedIn = _ancestorLink.lib;
          elementMatchedTokenName = null;
          legacyLib = _ancestorLink.tier === 'legacy';
        }
        // Sem vínculo (nem próprio, nem por ancestral) é sempre COMPONENTE
        // PERSONALIZADO (âmbar), nunca FORA DO PADRÃO (vermelho): ausência de
        // vínculo significa "não dá pra afirmar nada", não "está errado".
        // mainComponent.remote nunca prova vínculo com o DSC (ex: "NavBar" de
        // outra lib publicada).
        if (!_ownLibLink && !_ancestorLink) {
          dsElement = "warning";
          isCustomComponent = true;
        } else {
          // Componente COM vínculo real: a conformidade também depende das
          // próprias propriedades (gap, padding etc.) -- uma instância
          // legítima do DSC pode ter sido redimensionada/customizada fora do
          // padrão, e o vínculo sozinho não cobre isso. Mesma agregação usada
          // em "frames": todas as props OK = conforme; alguma OK = requer
          // revisão; nenhuma OK = fora do padrão.
          const _auditableProps = props.filter(p => p.isDS === true || p.isDS === 'warning' || p.isDS === false);
          if (_auditableProps.length > 0) {
            const _allOk = _auditableProps.every(p => p.isDS === true);
            const _anyOk = _auditableProps.some(p => p.isDS === true);
            dsElement = _allOk ? dsElement : (_anyOk ? 'warning' : false);
          }
        }
      }
      // Personalização (Fase 5b): só instância com vínculo próprio. Âmbar,
      // nunca vermelho; desvio comprovado de token (vermelho) tem precedência.
      let customizations = null;
      let customizationsStatus = null;
      if ((category === "components" || category === "icons") && _ownLibLink && node.type === "INSTANCE") {
        const cust = await _customizationsOf(node, mainComp);
        if (cust) {
          customizations = cust.list;
          customizationsStatus = 'evaluated';
          if (customizations.length > 0 && dsElement === true) {
            dsElement = "warning";
            elementMatchedBy = 'customized';
          }
        } else {
          customizationsStatus = 'not-evaluated';
        }
      }
      if (category === "frames") {
        // Frame é conforme se todos os seus tokens de estilo vêm do DSC.
        // Props sem checagem real contra a lib (isDS null: sizing, variantes) são ignoradas na conta.
        const _auditableProps = props.filter(p => p.isDS === true || p.isDS === 'warning' || p.isDS === false);
        if (_auditableProps.length === 0) {
          dsElement = true; // sem props auditáveis — sem desvio declarável
        } else {
          const _allOk = _auditableProps.every(p => p.isDS === true);
          const _anyOk = _auditableProps.some(p => p.isDS === true);
          dsElement = _allOk ? true : (_anyOk ? 'warning' : false);
        }
      }
      if (category === "typography") {
        const _typoProp = props.find(p => p.type === "typography");
        if (_typoProp) {
          dsElement = _typoProp.isDS !== undefined ? _typoProp.isDS : false;
          elementScore = _typoProp.score || null;
          elementMatchedBy = _typoProp.matchedBy || null;
          elementMatchedIn = _typoProp.matchedIn || null;
          elementMatchedTokenName = _typoProp.matchedTokenName || null;
        }
      }

      // Pluck variant props from props[] into a separate flat list so the UI
      // can render them as pills in the card header (most relevant info for dev).
      const variants = props
        .filter(p => p.type === "variant")
        .map(p => ({ name: p.name, value: p.value }));

      // Mesmo nome de camada com vínculo diferente (próprio / por ancestral /
      // nenhum) são itens distintos: senão a 1ª ocorrência conforme esconderia
      // uma ocorrência personalizada homônima (ex: "Icon" dentro de um
      // componente DSC e "Icon" solto custom).
      const _custSigKey = (customizations && customizations.length > 0)
        ? '|c:' + customizations.map(c => `${c.layer}.${c.campo}=${c.atual}`).join(';')
        : '';
      const _dedupKey = (category === "components" || category === "icons")
        ? name + '|' + (_ownLibLink ? 'own' : _ancestorLink ? 'ancestor' : 'none') + _custSigKey
        : name;
      const map = specs[category];
      if (!map.has(_dedupKey)) {
        // isMarkedCustom é declaração manual do designer ("Componente
        // Personalizado" no card do item, tela Escanear Tokens) -- itens
        // são recriados do zero a cada scan (este bloco só roda na
        // primeira ocorrência de `name` NESTE scan), então sem herdar do
        // scan anterior a marcação se perderia a cada re-scan. Casamento
        // por nodeId (não por name, que pode colidir entre elementos
        // diferentes) contra msg.previousSpecs, enviado pelo frontend
        // junto com o pedido de scan.
        const _prevItem = (msg.previousSpecs && msg.previousSpecs[category] || [])
          .find(p => p.nodeId === node.id || (Array.isArray(p.nodeIds) && p.nodeIds.includes(node.id)));
        const itemObj = {
          name: name,
          type: category,
          nodeType: node.type,
          componentKey: componentKey,
          layerName: name,
          isDS: dsElement,
          score: elementScore,
          matchedBy: elementMatchedBy,
          matchedIn: elementMatchedIn,
          matchedTokenName: elementMatchedTokenName,
          isCustomComponent: isCustomComponent,
          legacyLib: legacyLib,
          customizations: customizations,
          customizationsStatus: customizationsStatus,
          isMarkedCustom: _prevItem
            ? !!_prevItem.isMarkedCustom
            : (msg.isNewComponent === true && isCustomComponent === true && HD_BUILDABLE_CATS.includes(category)),
          customDecided: _prevItem ? _prevItem.customDecided === true : false,
          uiDepth: _prevItem && _prevItem.uiDepth === 'full' ? 'full' : 'essential',
          specDismissed: _prevItem ? _prevItem.specDismissed === true : false,
          variants: variants,
          nodeId: node.id,
          nodeIds: [node.id],
          layers: new Set([name]),
          properties: props
        };
        map.set(_dedupKey, itemObj);
        frameJson.elements[category].push({
          name: name,
          type: category,
          nodeType: node.type,
          componentKey: componentKey,
          layerName: name,
          isDS: dsElement,
          score: elementScore,
          matchedBy: elementMatchedBy,
          matchedIn: elementMatchedIn,
          matchedTokenName: elementMatchedTokenName,
          isCustomComponent: isCustomComponent,
          legacyLib: legacyLib,
          customizations: customizations,
          customizationsStatus: customizationsStatus,
          variants: variants,
          properties: props
        });
      } else {
        const item = map.get(_dedupKey);
        item.layers.add(name);
        if (item.nodeIds.length < 50 && !item.nodeIds.includes(node.id)) item.nodeIds.push(node.id);
      }
    }

    async function extractSpecs(n, depth) {
      if ((depth || 0) > _scanMaxDepth) return;
      // SKIP HIDDEN NODES
      if (n.visible === false) return;

      try {
        const props = await extractNodeProperties(n);
        let category = "frames";

        const nameLower = n.name.toLowerCase();
        const isIcon = nameLower.includes("icon") || nameLower.includes("ic-") || 
                       (n.type === "INSTANCE" && n.width <= 32 && n.height <= 32 && !nameLower.includes("button"));

        if (n.type === "TEXT") {
          category = isIcon ? "icons" : "typography";
        } else if (n.type === "INSTANCE" || n.type === "COMPONENT") {
          category = isIcon ? "icons" : "components";
        } else if (n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION" || n.type === "ELLIPSE" || n.type === "RECTANGLE") {
          category = isIcon ? "icons" : "vectors";
        } else if (n.type === "FRAME" || n.type === "GROUP" || n.type === "SECTION") {
          category = "frames";
        }

        await addElement(category, n, props);

        if ('children' in n && n.children) {
          for (const child of n.children) {
            await extractSpecs(child, (depth || 0) + 1);
          }
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        const stack = err && err.stack ? err.stack : "";
        console.error("Erro ao extrair specs do node:", n.name, "(type=" + n.type + ", id=" + n.id + ")", msg, stack);
      }
    }

    for (const node of selection) {
      await extractSpecs(node);
    }

    let framePreview = null;
    if (selection.length > 0 && 'exportAsync' in selection[0]) {
      try {
        // Largura limitada (antes SCALE 2 do frame inteiro: uma tela de
        // 1440px virava 2880px e pesava no envio para a UI).
        const _fw = selection[0].width || 0;
        framePreview = await selection[0].exportAsync({ format: 'PNG', constraint: _fw > 1200 ? { type: 'WIDTH', value: 1200 } : { type: 'SCALE', value: Math.min(2, 1200 / Math.max(1, _fw)) } });
      } catch (err) {
        console.error("Erro ao exportar preview do frame principal:", err);
      }
    }

    // Miniaturas dos itens (exibidas a 32px no card). Antes: PNG em tamanho
    // real de CADA item, todos ao mesmo tempo -- numa tela inteira os
    // containers grandes (1440px) travavam o scan (2026-10-05). Agora: lado
    // maior limitado a 64px e lotes de 8.
    const _thumbJobs = [];
    for (const map of [specs.components, specs.icons, specs.typography, specs.frames, specs.vectors]) {
      for (const item of map.values()) if (item.nodeId) _thumbJobs.push(item);
    }
    const _tP = Date.now();
    for (let i = 0; i < _thumbJobs.length; i += 8) {
      await Promise.all(_thumbJobs.slice(i, i + 8).map(async item => {
        try {
          const node = await figma.getNodeByIdAsync(item.nodeId);
          if (!node || !('exportAsync' in node)) return;
          const c = (node.width || 0) >= (node.height || 0) ? { type: 'WIDTH', value: 64 } : { type: 'HEIGHT', value: 64 };
          item.preview = await node.exportAsync({ format: 'PNG', constraint: c });
        } catch (e) { item.preview = null; }
      }));
    }
    console.log('[Handex scan] miniaturas', _thumbJobs.length, Date.now() - _tP, 'ms');

    const formatMap = (map) => {
      return Array.from(map.values())
        .map((item) => {
          const newItem = Object.assign({}, item);
          newItem.layers = Array.from(item.layers);
          return newItem;
        })
        .sort((a, b) => {
          if (a.isDS && !b.isDS) return -1;
          if (!a.isDS && b.isDS) return 1;
          return a.name.localeCompare(b.name);
        });
    };

    figma.ui.postMessage({
      type: "scan-result",
      frameId: _scanFrameId,
      data: {
        components: formatMap(specs.components),
        icons: formatMap(specs.icons),
        typography: formatMap(specs.typography),
        frames: formatMap(specs.frames),
        vectors: formatMap(specs.vectors),
        frameJson: frameJson,
        fileKey: figma.fileKey,
        framePreview: framePreview
      },
    });
  }

  if (msg.type === "get-selection-link") {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      const node = selection[0];
      const fileKey = figma.fileKey;
      const deeplink = fileKey
        ? `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(node.id)}`
        : '';
      figma.ui.postMessage({
        type: "selection-link",
        targetId: msg.targetId,
        linkName: node.name,
        nodeId: node.id,
        deeplink
      });
    } else {
      figma.ui.postMessage({
        type: "selection-link",
        targetId: msg.targetId,
        linkName: figma.root.name,
        nodeId: null,
        deeplink: ''
      });
    }
  }

  if (msg.type === "remove-measurement") {
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node) {
        node.remove();
        figma.notify("Medida removida.");
      } else {
        figma.notify("Elemento não encontrado (já removido?).");
      }
    } catch (e) {
      figma.notify("Erro ao remover: " + e.message);
    }
  }

  if (msg.type === "reapply-measurements") {
    const { frameId, measurements } = msg;
    const frameNode = await figma.getNodeByIdAsync(frameId);
    if (!frameNode) {
      figma.notify("Frame não encontrado no canvas.");
      return;
    }
    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      // Mesma lógica da createMeasurementLine — cria linha + terminadores + chip com valor
      function _measLine(x1, y1, x2, y2, value, type, color) {
        const elements = [];
        const mainLine = figma.createLine();
        mainLine.strokes = [{ type: "SOLID", color }];
        mainLine.strokeWeight = 1;
        mainLine.x = x1; mainLine.y = y1;
        if (type === 'horizontal') {
          mainLine.resize(Math.max(0.01, x2 - x1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color }]; t1.x = x1; t1.y = y1 - 4; t1.resize(8, 0); t1.rotation = -90;
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color }]; t2.x = x2; t2.y = y1 - 4; t2.resize(8, 0); t2.rotation = -90;
          elements.push(mainLine, t1, t2);
        } else {
          mainLine.rotation = -90;
          mainLine.resize(Math.max(0.01, y2 - y1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color }]; t1.x = x1 - 4; t1.y = y1; t1.resize(8, 0);
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color }]; t2.x = x1 - 4; t2.y = y2; t2.resize(8, 0);
          elements.push(mainLine, t1, t2);
        }
        const label = figma.createText();
        label.fontName = { family: "Inter", style: "Regular" };
        label.characters = String(Math.round(value));
        label.fontSize = 10;
        label.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        const bg = figma.createRectangle();
        bg.resize(label.width + 8, label.height + 4);
        bg.fills = [{ type: "SOLID", color }];
        bg.cornerRadius = 4;
        figma.currentPage.appendChild(label);
        if (type === 'horizontal') {
          const cx = x1 + (x2 - x1) / 2;
          bg.x = cx - bg.width / 2; bg.y = y1 - bg.height / 2;
        } else {
          const cy = y1 + (y2 - y1) / 2;
          bg.x = x1 - bg.width / 2; bg.y = cy - bg.height / 2;
        }
        label.x = bg.x + 4; label.y = bg.y + 2;
        elements.push(bg, label);
        return elements;
      }

      const red = { r: 0.851, g: 0.2118, b: 0.2118 };
      let created = 0;

      for (const m of measurements) {
        // Localiza o elemento pelo nome dentro do frame; fallback para o próprio frame
        const target = frameNode.findOne(n => n.name === m.name && n.type !== 'GROUP') || frameNode;
        const bounds = target.absoluteBoundingBox;
        if (!bounds) continue;

        const items = [
          ..._measLine(bounds.x, bounds.y - 20, bounds.x + bounds.width, bounds.y - 20, bounds.width, 'horizontal', red),
          ..._measLine(bounds.x - 20, bounds.y, bounds.x - 20, bounds.y + bounds.height, bounds.height, 'vertical', red)
        ];

        if (items.length > 0) {
          const group = figma.group(items, figma.currentPage);
          group.name = `[Medida] ${m.name}`;
          group.locked = true;
          group.setPluginData('handexCategory', 'medida');
          if (target !== frameNode) group.setPluginData('handexMeasureTargetId', target.id);
          _hdMoveToCategorySection(group, 'medida');
          created++;
        }
      }

      figma.notify(`${created} medida(s) reaplicada(s) no canvas!`);
    })();
  }

  if (msg.type === "resolve-spec-owners") {
    const results = [];
    try {
      const specsIn = Array.isArray(msg.specs) ? msg.specs.slice(0, 400) : [];
      const idToKey = new Map();
      (Array.isArray(msg.items) ? msg.items : []).forEach(it => {
        if (!it || it.key == null) return;
        const ids = Array.isArray(it.nodeIds) && it.nodeIds.length ? it.nodeIds : (it.nodeId ? [it.nodeId] : []);
        ids.forEach(id => { if (!idToKey.has(id)) idToKey.set(id, it.key); });
      });
      const memo = new Map();
      const resolveOne = async (spec) => {
        const target = spec && spec.targetNodeId;
        if (!target) return { specId: spec && spec.id, itemKey: null, via: 'none' };
        if (idToKey.has(target)) return { specId: spec.id, itemKey: idToKey.get(target), via: 'exact' };
        if (memo.has(target)) {
          const m = memo.get(target);
          return { specId: spec.id, itemKey: m, via: m == null ? 'none' : 'ancestor' };
        }
        const path = [];
        let found = null;
        let node = await figma.getNodeByIdAsync(target);
        while (node && node.type !== 'PAGE' && node.type !== 'DOCUMENT') {
          if (idToKey.has(node.id)) { found = idToKey.get(node.id); break; }
          if (memo.has(node.id)) { found = memo.get(node.id); break; }
          path.push(node.id);
          if (msg.frameRootId && node.id === msg.frameRootId) break;
          node = node.parent;
        }
        path.forEach(id => memo.set(id, found));
        memo.set(target, found);
        return { specId: spec.id, itemKey: found, via: found == null ? 'none' : 'ancestor' };
      };
      for (let i = 0; i < specsIn.length; i += 12) {
        const batch = specsIn.slice(i, i + 12);
        const out = await Promise.all(batch.map(s => resolveOne(s).catch(() => ({ specId: s && s.id, itemKey: null, via: 'none' }))));
        out.forEach(r => results.push(r));
      }
    } catch (err) {
      console.error('[Handex] resolve-spec-owners falhou:', err);
    }
    figma.ui.postMessage({ type: 'spec-owners-resolved', frameId: msg.frameId || null, results });
    return;
  }

  if (msg.type === "request-spec-properties") {
    const properties = [];
    const selection = figma.currentPage.selection;
    let node = null;
    if (msg.targetNodeId) {
      node = await figma.getNodeByIdAsync(msg.targetNodeId);
      if (!node || node.type === "PAGE" || node.type === "DOCUMENT") node = null;
    }
    if (!node) {
      if (msg.targetNodeId) console.warn(`[Handex spec] targetNodeId ${msg.targetNodeId} inexistente; lendo selection[0]${selection[0] ? ` (${selection[0].id})` : ' (vazia)'}`);
      if (selection.length === 0) {
        figma.notify("Selecione um elemento para escaneá-lo.");
        figma.ui.postMessage({ type: "show-spec-properties", properties: [] });
        return;
      }
      node = selection[0];
    }
    // Chamador fino do leitor único (_readNodeSpec): a Detalhada lê o mesmo
    // que a Rápida e mantém o formato { key, label, value, token } que a UI e
    // o pluginData das specs esperam. Linhas ficam fora quando o formato antigo
    // as omitia (raio misto, gap/padding 0, só o 1º stroke sólido).
    const spec = await _readNodeSpec(node, {
      level: "full",
      propKeys: ["width", "height", "radius", "direction", "primaryAxis", "counterAxis", "gap", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fill*", "stroke", "strokeWidth*", "textStyle", "fontFamily", "fontWeight", "fontSize", "effect", "sizingW", "sizingH", "component", "prop:*"],
      solidOnly: true,
      singleStroke: true,
      componentPropTypes: ["VARIANT"]
    });
    const by = {};
    spec.forEach(r => { by[r.key] = r; });
    const L = HD_GLOSSARY.labels;
    const out = (key, label, value, token) => properties.push({ key, label, value, token: token || null });

    if (by.height) out("height", L.height, by.height.value, by.height.token);
    if (by.width) out("width", L.width, by.width.value, by.width.token);
    if (by.radius && by.radius.state !== "mixed") out("radius", L.radius, by.radius.value, by.radius.token);
    if (by.direction && by.direction.raw.layoutMode !== "NONE") {
      out("direction", L.direction, by.direction.value);
      if (by.primaryAxis && by.counterAxis) out("alignment", L.alignment, `${by.primaryAxis.value} / ${by.counterAxis.value}`);
    }
    if (by.gap && by.gap.raw.value > 0) out("gap", L.gap, by.gap.value, by.gap.token);
    const pads = ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].map(f => by[f] || null);
    const pv = pads.map(r => (r ? r.raw.value : 0));
    if (pv.some(v => v > 0)) {
      const [vT, vR, vB, vL] = pv.map(v => `${v}px`);
      let val;
      if (vT === vR && vR === vB && vB === vL) val = vT;
      else if (vT === vB && vR === vL) val = `${vT} ${vR}`;
      else val = `${vT} ${vR} ${vB} ${vL}`;
      const tokens = [...new Set(pads.map(r => r && r.token).filter(Boolean))];
      out("padding", L.padding, val, tokens.length > 0 ? tokens.join(", ") : null);
    }
    spec.filter(r => r.cat === "fill" && r.state !== "mixed").forEach(r => out(r.key, r.label, r.value, r.token));
    if (by.stroke) out("stroke", L.stroke, by.stroke.value, by.stroke.token);
    spec.filter(r => r.key.startsWith("strokeWidth") && r.state !== "zero-token").forEach(r => out(r.key, r.label, r.value, r.token));
    if (by.textStyle) out("textStyle", L.textStyle, by.textStyle.value, by.textStyle.token);
    if (by.fontFamily && by.fontFamily.raw.value) out("fontFamily", L.fontFamily, by.fontFamily.value);
    if (by.fontWeight && by.fontWeight.raw.value) out("fontWeight", L.fontWeight, by.fontWeight.value);
    if (by.fontSize && by.fontSize.raw.value !== null) out("fontSize", L.fontSize, by.fontSize.value, by.fontSize.token);
    spec.filter(r => r.cat === "effect").forEach(r => out(r.key, r.label, r.value, r.token));
    if (by.sizingW) out("sizingW", L.sizingW, by.sizingW.value);
    if (by.sizingH) out("sizingH", L.sizingH, by.sizingH.value);
    if (by.component) out("component", L.component, by.component.libName ? `${by.component.value} (${by.component.libName})` : by.component.value);
    spec.filter(r => r.cat === "component-props").forEach(r => out(`variant-${r.raw.name}`, r.label, r.value));

    figma.ui.postMessage({ type: "show-spec-properties", properties });
  }

  // Nome de um nó específico por id -- usado pra mostrar "Especificando:
  // [nome]" no formulário de criação, fixo mesmo que a seleção do canvas
  // mude depois (ex: ao marcar a posição).
  if (msg.type === "get-node-name") {
    const node = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : null;
    figma.ui.postMessage({ type: "node-name-for-spec", name: node ? node.name : null });
  }

  // Id do elemento selecionado no momento em que o formulário de criação
  // de spec abriu -- fixado ANTES de qualquer marcação de posição trocar a
  // seleção (ver create-position-ghost abaixo), pra nunca perder a
  // referência ao elemento real sendo documentado.
  if (msg.type === "get-selection-id-for-spec") {
    const selection = figma.currentPage.selection;
    figma.ui.postMessage({ type: "selection-id-for-spec", targetNodeId: selection.length > 0 ? selection[0].id : null });
  }

  // Card fantasma de posição -- a Plugin API não expõe clique bruto no
  // canvas (nem em área vazia), só reage a mudanças de estado observáveis
  // (seleção, documento). Pra deixar o usuário "apontar" onde quer o card
  // antes de finalizar o formulário, cria uma prévia leve no tamanho/estilo
  // aproximado do card final (nome do elemento, tag, categoria, nota),
  // já selecionada e arrastável livremente; a posição final é lida via
  // seleção (read-position-ghost) e o fantasma é removido em seguida.
  if (msg.type === "create-position-ghost") {
    // Prioridade de âncora pra sugestão de posição: 1) a ÚLTIMA spec já
    // criada no canvas (specs nascem em sequência, organizadas, em vez de
    // espalhadas perto de cada elemento anotado) -- 2) o elemento sendo
    // anotado agora, se ainda não existe nenhuma spec no projeto -- 3)
    // centro do viewport. É só sugestão inicial: o fantasma nasce
    // arrastável e o designer decide a posição final antes de confirmar.
    let anchorNode = msg.lastSpecId ? await figma.getNodeByIdAsync(msg.lastSpecId) : null;
    if (!anchorNode) {
      anchorNode = msg.targetNodeId ? await figma.getNodeByIdAsync(msg.targetNodeId) : null;
    }
    const bounds = anchorNode && (anchorNode.absoluteBoundingBox || anchorNode.absoluteRenderBounds);

    const themeColor = hexToRgb(msg.color || '#004d8d');
    // Sem texto real -- só a moldura, no tamanho ESTIMADO do card final
    // (título sempre existe; categoria e nota somam altura quando
    // preenchidas), o suficiente pra dar noção de onde ele vai caber sem
    // duplicar a renderização completa do card real.
    const estimatedHeight = 64 + (msg.hasCategory ? 20 : 0) + (msg.hasNote ? 32 : 0);
    const ghost = figma.createFrame();
    ghost.name = "[Handex] Prévia de Posição";
    ghost.cornerRadius = 8;
    ghost.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.5 }];
    ghost.strokes = [{ type: 'SOLID', color: themeColor }];
    ghost.strokeWeight = 1.5;
    ghost.dashPattern = [4, 3];
    ghost.resize(220, estimatedHeight);
    ghost.setPluginData('handexPositionGhost', 'true');

    figma.currentPage.appendChild(ghost);
    // Nasce ao lado da âncora (última spec criada, ou do elemento sendo
    // anotado se ainda não há nenhuma spec), já como prévia arrastável.
    if (bounds) {
      ghost.x = bounds.x + bounds.width + 60;
      ghost.y = bounds.y;
    } else {
      ghost.x = figma.viewport.center.x;
      ghost.y = figma.viewport.center.y;
    }
    _highlightSelectionExpected = true;
    figma.currentPage.selection = [ghost];
    // Só o fantasma, centralizado -- é ele que o usuário precisa ver e
    // arrastar; incluir o elemento original no mesmo scrollAndZoomIntoView
    // também falhava silenciosamente sem checar se ele está na página
    // atual (node pode viver em outra página que a do fantasma recém-
    // criado, e a Plugin API não mistura nós de páginas diferentes numa
    // mesma chamada).
    figma.viewport.scrollAndZoomIntoView([ghost]);
    figma.ui.postMessage({ type: "position-ghost-created", ghostId: ghost.id });
  }

  // Confirma a posição da Ficha na 1ª geração do projeto (ver comentário em
  // create-handoff sobre _fichaBasePosition) -- lê onde o designer deixou a
  // Ficha de verdade (ela já nasceu visível/arrastável, sem fantasma
  // separado) e devolve pro frontend persistir como base definitiva.
  if (msg.type === "confirm-ficha-position") {
    const ficha = msg.fichaId ? await figma.getNodeByIdAsync(msg.fichaId) : null;
    if (!ficha) {
      figma.ui.postMessage({ type: "ficha-position-confirmed", position: null });
      return;
    }
    const bb = ficha.absoluteBoundingBox;
    figma.ui.postMessage({ type: "ficha-position-confirmed", position: bb ? { x: bb.x, y: bb.y } : null });
    return;
  }

  // Lista frames de nível superior da página atual, pro modal "Incluir mais
  // frames no contexto" (aberto por downloadAiContextPackage, ver
  // handoff.js) -- o designer normalmente documenta só PARTES de uma tela
  // (um header, um menu), nunca a tela inteira; pra dar ao Figma Make
  // contexto amplo de onde essas partes vivem, ele pode escolher incluir a
  // imagem de telas completas do canvas, mesmo sem spec/medida nenhuma
  // vinculada. Exclui as Sections do próprio Handex (Specs/Medidas/Fluxos/
  // Ficha, identificadas por handexCategorySection) -- não são telas de
  // produto, são organização interna do plugin.
  if (msg.type === "list-canvas-frames-for-ai") {
    const validTypes = ['FRAME', 'COMPONENT', 'COMPONENT_SET'];
    const candidates = figma.currentPage.children
      .filter(n => validTypes.includes(n.type) && !n.getPluginData('handexCategory'))
      .map(n => ({ id: n.id, nome: n.name }));
    figma.ui.postMessage({ type: 'canvas-frames-for-ai-listed', frames: candidates });
    return;
  }

  // Gera um PNG por frame documentado (mesma marcação da Documentação
  // Visual da Ficha: frame real + só selos/contornos de spec ou marcações
  // de medida, nunca Conector/specCard) pra download manual -- usado pelo
  // botão "Baixar imagens dos frames" (junto de "Copiar contexto pro Figma
  // Make"). Não tenta combinar imagem+texto num clipboard só: investigação
  // (2026-09-18) mostrou que ClipboardItem com múltiplos tipos representa
  // a MESMA informação em formatos alternativos, não duas coisas
  // distintas -- o app que recebe o paste escolheria só um dos dois,
  // resultado incerto. Download separado é garantido de funcionar.
  // extraFrameIds (opcional): frames adicionais escolhidos no modal acima,
  // sem spec/medida nenhuma -- snapshot é do frame INTEIRO, sem nenhuma
  // marcação de selo/contorno (não há spec pra marcar), só a tela completa
  // como referência visual de contexto.
  if (msg.type === "export-frame-snapshots-for-ai") {
    (async () => {
      const frames = (msg.data && msg.data.frames) || [];
      const results = [];
      for (const f of frames) {
        if (!f.figmaId) continue;
        let frameNode = null;
        try { frameNode = await figma.getNodeByIdAsync(f.figmaId); } catch (e) { frameNode = null; }
        if (!frameNode) continue;

        const hasSpecs = (f.createdSpecs || []).length > 0;
        const hasMeasures = (f.measurements || []).length > 0;
        if (!hasSpecs && !hasMeasures) continue;

        const nodeIds = hasSpecs
          ? await _hdCollectSpecContourIds(f)
          : (f.measurements || []).map(m => m.nodeId).filter(Boolean);

        try {
          const bytes = await _hdSnapshotFrameWithNodes(frameNode, nodeIds);
          if (bytes) {
            results.push({ nome: f.nome || 'Frame', base64: figma.base64Encode(bytes) });
          }
        } catch (e) { /* tolera falha isolada, segue pros próximos frames */ }
      }

      for (const id of (msg.extraFrameIds || [])) {
        let extraNode = null;
        try { extraNode = await figma.getNodeByIdAsync(id); } catch (e) { extraNode = null; }
        if (!extraNode || !('exportAsync' in extraNode)) continue;
        try {
          const bytes = await extraNode.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
          if (bytes) {
            results.push({ nome: extraNode.name || 'Frame', base64: figma.base64Encode(bytes) });
          }
        } catch (e) { /* tolera falha isolada, segue pros próximos */ }
      }

      figma.ui.postMessage({ type: "frame-snapshots-for-ai-ready", images: results });
    })();
    return;
  }

  // Lê a posição atual do fantasma (arrastado livremente pelo usuário) e o
  // remove -- chamado ao clicar em "Usar esta posição".
  if (msg.type === "read-position-ghost") {
    const ghost = await figma.getNodeByIdAsync(msg.ghostId);
    if (!ghost) {
      figma.ui.postMessage({ type: "position-ghost-read", position: null });
      return;
    }
    const bounds = ghost.absoluteBoundingBox || ghost.absoluteRenderBounds;
    const position = bounds ? { x: bounds.x, y: bounds.y } : null;
    ghost.remove();
    figma.ui.postMessage({ type: "position-ghost-read", position });
  }

  // Cancelamento -- remove o fantasma órfão sem aplicar posição nenhuma.
  if (msg.type === "cancel-position-ghost") {
    const ghost = await figma.getNodeByIdAsync(msg.ghostId);
    if (ghost) { try { ghost.remove(); } catch (e) { } }
  }

  if (msg.type === "create-unified-spec") {
    (async () => {
      const opts = msg.opts;
      // Suporte a targetNodeId (spec gerada a partir de exceção de frame)
      let node = null;
      if (opts.targetNodeId) {
        node = await figma.getNodeByIdAsync(opts.targetNodeId);
      }
      if (!node) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.notify("Selecione um elemento no canvas.");
          figma.ui.postMessage({ type: 'canvas-action-failed' });
          return;
        }
        node = selection[0];
      }

      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      // Convert hex color to rgb (stroke = themeColor, fill = themeFill)
      const themeColor = hexToRgb(opts.color || '#004d8d');
      const themeFill  = hexToRgb(opts.fillColor || opts.color || '#EBF4FB');

      const _specSide = opts.guideSide || 'right';

      const _tagRadius = 8;

      const _layerTag = 'Spec';

      // Create Spec Card
      const specCard = figma.createFrame();
      specCard.name = 'Spec Notes';
      specCard.layoutMode = "VERTICAL";
      const _cardPadding = 16;
      specCard.paddingLeft = _cardPadding;
      specCard.paddingRight = _cardPadding;
      specCard.paddingTop = _cardPadding;
      specCard.paddingBottom = _cardPadding;
      specCard.itemSpacing = 12;
      specCard.cornerRadius = 8;
      specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      specCard.strokes = [{ type: "SOLID", color: themeColor }];
      specCard.strokeWeight = 1.5;
      specCard.primaryAxisSizingMode = "AUTO";
      specCard.counterAxisSizingMode = "FIXED";
      const SPEC_CARD_WIDTH = 480;
      specCard.resize(SPEC_CARD_WIDTH, specCard.height);

      // Header row with Tag
      const headerRow = figma.createFrame();
      headerRow.layoutMode = "HORIZONTAL";
      headerRow.itemSpacing = 8;
      headerRow.fills = [];
      headerRow.primaryAxisSizingMode = "AUTO";
      headerRow.counterAxisSizingMode = "AUTO";
      headerRow.layoutAlign = "STRETCH";

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
      title.fills = [{ type: "SOLID", color: { r: 0.1333, g: 0.1608, b: 0.1804 } }];
      title.characters = node.name;
      title.textAutoResize = "HEIGHT";
      headerRow.appendChild(title);
      title.layoutAlign = "STRETCH";
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
        desc.name = '[Spec] Nota';
        desc.fontName = { family: "Inter", style: "Regular" };
        desc.fontSize = 11;
        desc.fills = [{ type: "SOLID", color: { r: 0.3922, g: 0.4549, b: 0.4784 } }];
        desc.characters = opts.note;
        desc.textAutoResize = "HEIGHT";
        specCard.appendChild(desc);
        desc.layoutAlign = "STRETCH";
      }

      // Add properties list
      if (opts.properties && opts.properties.length > 0) {
        const propsFrame = figma.createFrame();
        propsFrame.layoutMode = "VERTICAL";
        propsFrame.itemSpacing = 4;
        propsFrame.fills = [];
        propsFrame.primaryAxisSizingMode = "AUTO";
        propsFrame.counterAxisSizingMode = "AUTO";
        propsFrame.name = 'Propriedades';
        propsFrame.layoutAlign = "STRETCH";

        opts.properties.forEach(p => {
          const row = figma.createFrame();
          row.name = `Prop/${_hdVocabLabel(p.label, p.key)}`;
          row.layoutMode = "HORIZONTAL";
          row.itemSpacing = 12;
          row.fills = [];
          row.primaryAxisSizingMode = "AUTO";
          row.counterAxisSizingMode = "AUTO";
          row.layoutAlign = "STRETCH";
          row.counterAxisAlignItems = "CENTER";

          const pLabel = figma.createText();
          pLabel.fontName = { family: "Inter", style: "Medium" };
          pLabel.fontSize = 10;
          pLabel.fills = [{ type: "SOLID", color: { r: 0.3922, g: 0.4549, b: 0.4784 } }];
          pLabel.characters = _hdVocabLabel(p.label, p.key).toUpperCase();
          pLabel.textAutoResize = "WIDTH_AND_HEIGHT";

          const pVal = figma.createText();
          pVal.fontName = { family: "Inter", style: "Bold" };
          pVal.fontSize = 11;
          pVal.fills = [{ type: "SOLID", color: p.token ? themeColor : { r: 0.1333, g: 0.1608, b: 0.1804 } }];
          const _pValStr = String(_hdVocabValue(p.value));
          pVal.characters = p.token && p.token !== _pValStr ? `${p.token} · ${_pValStr}` : (p.token || _pValStr);
          pVal.textAutoResize = "HEIGHT";

          row.appendChild(pLabel);
          row.appendChild(pVal);
          pVal.layoutAlign = "STRETCH";

          propsFrame.appendChild(row);
        });
        specCard.appendChild(propsFrame);
      }

      // Exceções mapeadas para esta spec
      const specExcecoes = (opts.excecoes && opts.excecoes.length > 0)
        ? opts.excecoes
        : (opts.excecaoInicial ? [opts.excecaoInicial] : []);
      if (specExcecoes.length > 0) {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const excFrame = figma.createFrame();
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 6;
        excFrame.fills = [{ type: "SOLID", color: { r: 0.9686, g: 0.9804, b: 0.9804 } }];
        excFrame.paddingLeft = 10; excFrame.paddingRight = 10;
        excFrame.paddingTop = 8; excFrame.paddingBottom = 8;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        excFrame.layoutAlign = "STRETCH";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.251, g: 0.2941, b: 0.3216 } }];
        excTitle.characters = `CENÁRIOS (${specExcecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        const _excTypeRgb = {
          'Erro':        { r: 0.698, g: 0.1725, b: 0.1725 },
          'Alerta':      { r: 0.651, g: 0.3686, b: 0 },
          'Sucesso':     { r: 0.0706, g: 0.4588, b: 0.1529 },
          'Confirmação': { r: 0, g: 0.3608, b: 0.6627 },
        };
        const _excTypeEmoji = { 'Sucesso': '✅', 'Erro': '❌', 'Alerta': '⚠️', 'Confirmação': '❓' };
        specExcecoes.forEach(exc => {
          const excRow = figma.createFrame();
          excRow.layoutMode = "HORIZONTAL";
          excRow.itemSpacing = 6;
          excRow.fills = [];
          excRow.primaryAxisSizingMode = "AUTO";
          excRow.counterAxisSizingMode = "AUTO";
          excRow.layoutAlign = "STRETCH";
          excRow.counterAxisAlignItems = "CENTER";
          const typeColor = _excTypeRgb[exc.tipo] || { r: 0.3922, g: 0.4549, b: 0.4784 };
          const typeLabel = figma.createText();
          typeLabel.fontName = { family: "Inter", style: "Bold" };
          typeLabel.fontSize = 9;
          typeLabel.fills = [{ type: "SOLID", color: typeColor }];
          typeLabel.characters = `${_excTypeEmoji[exc.tipo] || '❔'} ${(exc.tipo || 'GERAL').toUpperCase()}`;
          typeLabel.textAutoResize = "WIDTH_AND_HEIGHT";
          const titleLabel = figma.createText();
          titleLabel.fontName = { family: "Inter", style: "Regular" };
          titleLabel.fontSize = 10;
          titleLabel.fills = [{ type: "SOLID", color: { r: 0.1333, g: 0.1608, b: 0.1804 } }];
          titleLabel.characters = `${exc.titulo || ''}${exc.notas ? ' — ' + exc.notas : ''}`;
          titleLabel.textAutoResize = "HEIGHT";
          excRow.appendChild(typeLabel);
          excRow.appendChild(titleLabel);
          titleLabel.layoutAlign = "STRETCH";
          excFrame.appendChild(excRow);
        });
        specCard.appendChild(excFrame);
      }

      // Add link after title/properties
      if (opts.link) {
        const linkTxt = figma.createText();
        linkTxt.fontName = { family: "Inter", style: "Regular" };
        linkTxt.fontSize = 11;
        linkTxt.fills = [{ type: "SOLID", color: hexToRgb("#005ca9") }];
        linkTxt.characters = opts.link;
        linkTxt.textDecoration = "UNDERLINE";
        linkTxt.hyperlink = { type: "URL", value: opts.link };
        linkTxt.textAutoResize = "HEIGHT";
        linkTxt.layoutAlign = "STRETCH";
        specCard.appendChild(linkTxt);
      }

      // Nós que entram no GROUP móvel (Conector + specCard). contour/chip
      // ficam FORA do group, soltos na página e travados -- locked bloqueia
      // seleção/edição direta mas não desacopla um nó de transformações do
      // grupo PAI, então a única forma do marcador não se mover junto com o
      // group ao arrastar é ele nunca ter sido filho dele. O vínculo entre
      // os dois é feito por pluginData bidirecional (handexSpecMarkerId /
      // handexSpecMarkerFor), gravado depois que specGroup existe.
      let groupNodes = [];
      let _absCardX = 0, _absCardY = 0, _absCardW = 0, _absCardH = 0;
      // Declarado no escopo externo (não dentro do if(bounds) abaixo) --
      // precisa ser lido depois da criação do group.
      let contour = null;

      // Positioning
      const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
      // Âncora do lado do elemento para o conector -- os bounds do próprio
      // elemento.
      let _markerAnchorBounds = bounds;
      if (bounds) {
        // Draw a dotted highlight frame around the node
        contour = figma.createFrame();
        contour.name = 'Destaque';
        contour.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));

        // Append first, then set absolute coordinates to avoid origin issues
        figma.currentPage.appendChild(contour);
        contour.x = bounds.x - 16;
        contour.y = bounds.y - 16;

        contour.fills = [];
        contour.strokes = [{ type: "SOLID", color: themeColor }];
        contour.strokeWeight = 2;
        contour.dashPattern = [4, 4];
        contour.locked = true;
        contour.setPluginData('handexCategory', 'spec-marcador');

        // Tag chip on contour
        const chip = figma.createFrame();
        chip.name = 'Chip';
        chip.layoutMode = "HORIZONTAL";
        chip.primaryAxisSizingMode = "FIXED";
        chip.counterAxisSizingMode = "FIXED";
        chip.resize(42, 42);
        chip.cornerRadius = _tagRadius;
        chip.fills = [{ type: "SOLID", color: themeFill }];
        chip.strokes = [{ type: "SOLID", color: themeColor }];
        chip.strokeWeight = 1.5;
        chip.primaryAxisAlignItems = "CENTER";
        chip.counterAxisAlignItems = "CENTER";
        const chipText = figma.createText();
        chipText.fontName = { family: "Inter", style: "Bold" };
        chipText.fontSize = 18;
        chipText.fills = [{ type: "SOLID", color: themeColor }];
        chipText.characters = opts.letter;
        chip.appendChild(chipText);
        contour.appendChild(chip);
        chip.x = 0;
        chip.y = 0;

        // contour NÃO entra em groupNodes -- fica solto na página, fora do
        // group que vai se mover (ver comentário acima). O vínculo
        // bidirecional por pluginData, gravado após o specGroup existir, é o
        // que os demais handlers (lock/hide/show/delete/highlight) usam pra
        // encontrar um a partir do outro, então o
        // comportamento precisa ser único independente da origem do marcador.

        // Append card to page first so Figma computes its real dimensions
        figma.currentPage.appendChild(specCard);

        // Com pinnedPosition (marcador de posição arrastado pelo usuário
        // antes do formulário abrir, ver create-position-marker), o lado
        // da linha guia é derivado da posição REAL onde a spec vai nascer
        // -- opts.guideSide (sempre 'right' hoje) não bateria com o lugar
        // que o usuário escolheu.
        const side = (opts.pinnedPosition && bounds)
          ? _computeSideFromBounds(bounds, { x: opts.pinnedPosition.x, y: opts.pinnedPosition.y, width: specCard.width, height: specCard.height })
          : (opts.guideSide || 'right'); // 'right' | 'left' | 'top' | 'bottom'
        const _isVertSide = side === 'right' || side === 'left';
        const _specLetter = opts.letter;

        // Âncora: o FRAME que contém o elemento -- para não posicionar a
        // spec por cima de outro frame. Sections são só agrupadores visuais
        // (sem conteúdo "por baixo" que possa ser coberto), então param a
        // subida sem virar âncora -- sem esse cuidado, um frame dentro de
        // uma Section fazia a spec ser posicionada na altura da SECTION
        // inteira em vez do frame específico.
        let _anchorNode = node;
        while (_anchorNode.parent && _anchorNode.type !== 'FRAME' && _anchorNode.parent.type !== 'PAGE') {
          _anchorNode = _anchorNode.parent;
        }
        const _anchorBounds = _anchorNode.absoluteBoundingBox || bounds;

        // Escaneia o canvas — novo formato: [Spec | A | right] NodeName
        // Legado: [Spec] NodeName com ficha filha "[Spec/A] .../Ficha:side"
        const _letterMap = {};
        const _updateLetterMap = (l, bb) => {
          if (!_letterMap[l]) _letterMap[l] = { x: bb.x, topY: bb.y, bottom: bb.y + bb.height, right: bb.x + bb.width };
          if (bb.y + bb.height > _letterMap[l].bottom) _letterMap[l].bottom = bb.y + bb.height;
          if (bb.x + bb.width > _letterMap[l].right) _letterMap[l].right = bb.x + bb.width;
          if (bb.x < _letterMap[l].x) _letterMap[l].x = bb.x;
          if (bb.y < _letterMap[l].topY) _letterMap[l].topY = bb.y;
        };
        // "Achata" a Section "Handex | Specs" nos filhos diretos antes de
        // escanear -- specs vivem lá desde 2026-09-11 (ver
        // _hdMoveToCategorySection), não mais soltas em figma.currentPage.
        const _stackScanNodes = figma.currentPage.children.flatMap(n => n.type === 'SECTION' ? n.children : [n]);
        _stackScanNodes.forEach(n => {
          // handexCategory cobre specs novas (FRAME/GROUP); prefixo de nome
          // cobre specs legadas criadas antes dessa marcação existir.
          const _isSpecNode = n.getPluginData('handexCategory') === 'spec' || n.name.startsWith('[Spec');
          if (!_isSpecNode) return;
          // Novo formato semântico.
          const newFmt = n.name.match(new RegExp('^\\[' + _layerTag + ' \\| ([A-Z]\\d*(?:\\.\\d+)*) \\| ([a-z]+)\\] '));
          if (newFmt) {
            if (newFmt[2] !== side) return;
            const specNotes = n.children && n.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && (c.name === 'Spec Notes' || c.name === 'Ficha') && c !== specCard);
            if (!specNotes) return;
            const bb = specNotes.absoluteBoundingBox || specNotes.absoluteRenderBounds;
            if (bb) _updateLetterMap(newFmt[1], bb);
            return;
          }
          // Formato legado: [Spec] NodeName (specs anteriores a essa marcação).
          if (!n.name.startsWith('[Spec]')) return;
          const ficha = n.children && n.children.find(c => c.type === 'FRAME' && c.name.includes('/Ficha') && c !== specCard);
          if (!ficha) return;
          const lm = ficha.name.match(/\[Spec\/([A-Z]\d*(?:\.\d+)*)\]/);
          const sm = ficha.name.match(/\/Ficha:([a-z]+)/);
          if (!lm) return;
          if ((sm ? sm[1] : 'right') !== side) return;
          const bb = ficha.absoluteBoundingBox || ficha.absoluteRenderBounds;
          if (bb) _updateLetterMap(lm[1], bb);
        });

        const _SPEC_GAP = 32;
        const _SPEC_COL_GAP = 64;
        const cardW = specCard.width;
        const cardH = specCard.height;
        let targetX, targetY;

        if (opts.pinnedPosition) {
          // Edição de spec (delete+recreate): mantém a spec exatamente onde
          // estava, sem reempilhar — o scan de "mesma tag" acima não
          // encontra mais a spec antiga (já foi apagada antes desta
          // chamada), então sem isso ela seria posicionada como se fosse
          // uma spec nova (empilhada no fim do grupo ou ao lado das
          // últimas), "descendo" na tela sem motivo pro designer.
          targetX = opts.pinnedPosition.x;
          targetY = opts.pinnedPosition.y;
        } else if (_letterMap[_specLetter]) {
          // Mesma letra → empilha na direção do lado
          targetX = _letterMap[_specLetter].x;
          if (side === 'top') {
            targetY = _letterMap[_specLetter].topY - cardH - _SPEC_GAP;
          } else {
            targetY = _letterMap[_specLetter].bottom + _SPEC_GAP;
          }
        } else if (Object.keys(_letterMap).length > 0) {
          // Letra diferente → posiciona ao lado (à direita do mais à direita, exceto lado=esquerda)
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
          // Primeira spec: posiciona ao lado do anchor, nunca sobre o frame
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

        // --- Conector (opcional: desativado se drawConnection === false) ---
        // SPIKE: USE_NATIVE_CONNECTOR alterna entre o VectorNode estático (produção,
        // default) e um ConnectorNode nativo (figma.createConnector()) ancorado via
        // connectorStart/connectorEnd + magnet: 'AUTO'. Objetivo: validar se o conector
        // nativo recalcula sozinho quando o nó original ou o specCard se movem, evitando
        // coordenadas fixas desatualizadas. Para reverter: apenas trocar para `false`
        // (ou remover o branch `if (USE_NATIVE_CONNECTOR)` e o bloco todo abaixo dele,
        // mantendo só o `else`). Resultado do spike documentado no PR/changelog — ver
        // resumo do agente backend-plugin.
        const USE_NATIVE_CONNECTOR = false;

        if (opts.drawConnection !== false) {
          // Âncora do lado do elemento: bounds do elemento/contorno.
          const _anchorB = _markerAnchorBounds;
          const _lineSide = _hdValidLineSide(_anchorB, { x: specCard.x, y: specCard.y, width: specCard.width, height: specCard.height }, side);
          let startPt, endPt;
          if (_lineSide === 'right') {
            startPt = { x: _anchorB.x + _anchorB.width, y: _anchorB.y + _anchorB.height / 2 };
            endPt   = { x: specCard.x, y: specCard.y + specCard.height / 2 };
          } else if (_lineSide === 'left') {
            startPt = { x: _anchorB.x, y: _anchorB.y + _anchorB.height / 2 };
            endPt   = { x: specCard.x + specCard.width, y: specCard.y + specCard.height / 2 };
          } else if (_lineSide === 'bottom') {
            startPt = { x: _anchorB.x + _anchorB.width / 2, y: _anchorB.y + _anchorB.height };
            endPt   = { x: specCard.x + specCard.width / 2, y: specCard.y };
          } else { // top
            startPt = { x: _anchorB.x + _anchorB.width / 2, y: _anchorB.y };
            endPt   = { x: specCard.x + specCard.width / 2, y: specCard.y + specCard.height };
          }

          if (USE_NATIVE_CONNECTOR) {
            // SPIKE: ConnectorNode nativo. Ancora nos nós reais (node.id / specCard.id)
            // em vez de coordenadas calculadas — em teoria o Figma reposiciona a linha
            // automaticamente se `node` ou `specCard` se moverem depois de criados.
            // ATENÇÃO: connectorStart/connectorEnd exigem que os nós referenciados já
            // estejam no canvas (appendChild) com id estável — ambos já satisfazem isso
            // neste ponto do fluxo (node veio da seleção; specCard já foi appendChild'd
            // acima). Não criamos DotInicio/DotFim nesta variante: o ConnectorNode tem
            // seus próprios estilos de ponta (connectorStartStrokeCap/connectorEndStrokeCap)
            // que substituem a necessidade dos dots decorativos — ver riscos/resultado
            // no resumo do spike.
            const connector = figma.createConnector();
            connector.name = 'Conector';
            connector.connectorStart = { endpointNodeId: node.id, magnet: 'AUTO' };
            connector.connectorEnd = { endpointNodeId: specCard.id, magnet: 'AUTO' };
            connector.connectorLineType = 'STRAIGHT';
            connector.strokes = [{ type: "SOLID", color: themeColor }];
            connector.strokeWeight = 1.5;
            connector.dashPattern = [4, 4];
            connector.connectorStartStrokeCap = 'CIRCLE_FILLED';
            connector.connectorEndStrokeCap = 'CIRCLE_FILLED';
            figma.currentPage.appendChild(connector);
            groupNodes.push(connector);
          } else {
            // Estilo opcional: 'straight' (padrão) | 'curved' (grau -100..100,
            // deslocamento perpendicular em % da distância) | 'elbow'
            // (roteamento ortogonal, ver _orthogonalElbowPoints -- SEMPRE
            // sai reto na direção do lado e entra reto no card, com quantas
            // dobras de 90° forem necessárias). Sem edição pós-criação aqui
            // (diferente de fluxos) -- só no momento em que a spec é
            // criada, e a linha não se realinha se o card for arrastado
            // depois (limitação pré-existente, não agravada por isso, só
            // mais perceptível visualmente com curva/esquina).
            const _specConnectorStyle = opts.connectorStyle || 'straight';
            const _specCurvature = _specConnectorStyle === 'curved' ? (opts.connectorCurvature || 0) : 0;
            let connectorPath = `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}`;
            if (_specConnectorStyle === 'elbow') {
              // endPt sempre entra pelo lado OPOSTO de `side` (right→left,
              // left→right, bottom→top, top→bottom) -- arquitetura fixa de
              // specs (guia sempre sai de um lado do elemento e entra pelo
              // lado voltado pra ele no card).
              const OPPOSITE_SIDE = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' };
              const specElbowPoints = _orthogonalElbowPoints(
                { x: startPt.x, y: startPt.y, side: _lineSide },
                { x: endPt.x, y: endPt.y, side: OPPOSITE_SIDE[_lineSide] }
              );
              const segs = [startPt, ...specElbowPoints, endPt].map(p => `${p.x} ${p.y}`).join(' L ');
              connectorPath = `M ${segs}`;
            } else if (_specCurvature) {
              const dx = endPt.x - startPt.x, dy = endPt.y - startPt.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const px = -dy / dist, py = dx / dist;
              const offset = (_specCurvature / 100) * dist * 0.5;
              const midX = (startPt.x + endPt.x) / 2, midY = (startPt.y + endPt.y) / 2;
              const ctrlX = midX + px * offset, ctrlY = midY + py * offset;
              connectorPath = `M ${startPt.x} ${startPt.y} Q ${ctrlX} ${ctrlY} ${endPt.x} ${endPt.y}`;
            }
            const connector = figma.createVector();
            connector.name = 'Conector';
            connector.strokes = [{ type: "SOLID", color: themeColor }];
            connector.strokeWeight = 1.5;
            connector.dashPattern = [4, 4];
            connector.strokeCap = "ROUND";
            figma.currentPage.appendChild(connector);
            // vectorPaths embute coordenadas absolutas no `data` do SVG.
            // figma.currentPage tem origem 0,0, então startPt/endPt (já
            // absolutos) servem direto -- sem conversão, porque não há mais
            // FRAME container cuja origem precise ser subtraída.
            connector.vectorPaths = [{ windingRule: "NONZERO", data: connectorPath }];
            groupNodes.push(connector);

            const _DOT_R = 4;
            const startDot = figma.createEllipse();
            startDot.name = 'DotInicio';
            startDot.resize(_DOT_R * 2, _DOT_R * 2);
            startDot.fills = [{ type: "SOLID", color: themeColor }];
            startDot.strokes = [];
            startDot.locked = true;
            figma.currentPage.appendChild(startDot);
            startDot.x = startPt.x - _DOT_R;
            startDot.y = startPt.y - _DOT_R;
            groupNodes.push(startDot);

            const endDot = figma.createEllipse();
            endDot.name = 'DotFim';
            endDot.resize(_DOT_R * 2, _DOT_R * 2);
            endDot.fills = [{ type: "SOLID", color: themeColor }];
            endDot.strokes = [];
            endDot.locked = true;
            figma.currentPage.appendChild(endDot);
            endDot.x = endPt.x - _DOT_R;
            endDot.y = endPt.y - _DOT_R;
            groupNodes.push(endDot);
          }
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

      // GROUP contendo só os nós móveis (Conector + specCard, e DotInicio/
      // DotFim quando existem) -- contour/chip ficam de fora, soltos na
      // página. figma.group() preserva as posições absolutas atuais dos
      // nós (não precisa recalcular x/y relativo, diferente do FRAME).
      const specGroup = figma.group(groupNodes, figma.currentPage);
      specGroup.name = `[${_layerTag} | ${opts.letter} | ${_specSide}] ${node.name}`;
      specGroup.locked = false;
      specGroup.setPluginData('handexCategory', 'spec');

      // Vínculo bidirecional entre o marcador solto (contour) e o group
      // móvel -- é assim que os demais handlers (lock, hide, delete,
      // highlight, unlock) encontram o marcador a partir do specGroup e
      // vice-versa, já que não há mais relação de parentesco entre eles.
      if (contour) {
        contour.setPluginData('handexSpecMarkerFor', specGroup.id);
        specGroup.setPluginData('handexSpecMarkerId', contour.id);
      }
      // Move os dois (specGroup + contour) pra dentro da mesma Section --
      // preserva a posição absoluta de ambos (Section não recalcula, ver
      // _hdMoveToCategorySection) e mantém os dois visíveis juntos na árvore
      // de camadas, sem reverter a decisão de mantê-los como nós irmãos
      // separados (essa decisão é sobre não compartilhar o MESMO grupo/frame
      // -- não sobre não compartilhar a mesma Section).
      _hdMoveToCategorySection(specGroup, 'spec');
      if (contour) _hdMoveToCategorySection(contour, 'spec');

      _reorderSpecGroupByTag(specGroup, opts.letter);

      figma.ui.postMessage({
        type: "spec-created",
        spec: {
          id: specGroup.id,
          targetNodeId: node.id,
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
          connectorStyle: opts.connectorStyle || 'straight',
          connectorCurvature: opts.connectorCurvature || 0,
          cardX: _absCardX,
          cardY: _absCardY,
          cardW: _absCardW,
          cardH: _absCardH,
        }
      });

      figma.notify("Especificação criada — arraste para posicionar. Clique em Concluir quando pronto.");
    })();
  }

  if (msg.type === "get-selection-name") {
    const sel = figma.currentPage.selection;
    figma.ui.postMessage({ type: "selection-name", name: sel.length > 0 ? sel[0].name : null });
  }

  if (msg.type === "lock-spec") {
    const specNode = await figma.getNodeByIdAsync(msg.specId);
    if (specNode && specNode.name && /^\[Spec \| /.test(specNode.name)) {
      specNode.locked = true;
      // contour está fora do group -- trava também via pluginData, reforço
      // defensivo (já nasce locked=true na criação, mas cobre specs cujo
      // marcador tenha sido destravado manualmente por engano).
      const markerId = specNode.getPluginData('handexSpecMarkerId');
      if (markerId) {
        const marker = await figma.getNodeByIdAsync(markerId);
        if (marker) marker.locked = true;
      }
      figma.ui.postMessage({ type: "spec-locked", specId: msg.specId });
    }
  }

  if (msg.type === "highlight-node") {
    // Remove qualquer highlight anterior se existir
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }

    const myToken = ++_highlightToken;
    const node = await figma.getNodeByIdAsync(msg.id);
    // Uma chamada mais recente já assumiu enquanto este await estava em
    // voo -- descarta este resultado sem tocar em activeHighlightNode (que
    // já pertence à chamada mais nova) e sem criar um stroke órfão.
    if (myToken !== _highlightToken) return;
    if (node && node.visible && _nodeOnCurrentPage(node)) {
      if (msg.selectNode !== false) {
        _highlightSelectionExpected = true;
        figma.currentPage.selection = [node];
      }
      if (msg.shouldScroll !== false) {
        // contour (marcador) está fora do specGroup desde a reversão da
        // migração para FRAME único -- enquadrar só o specGroup deixaria o
        // contour de fora do zoom quando ele está distante (ex.: spec
        // arrastada para longe do elemento original). Inclui o marcador
        // vinculado via pluginData quando existir.
        const zoomTargets = [node];
        const markerId = node.getPluginData && node.getPluginData('handexSpecMarkerId');
        if (markerId) {
          const marker = await figma.getNodeByIdAsync(markerId);
          if (marker) zoomTargets.push(marker);
        }
        figma.viewport.scrollAndZoomIntoView(zoomTargets);
      }

      if (msg.highlight && node.absoluteBoundingBox) {
        const hexToRgbLocal = (hex) => {
          const h = (hex || '#005ca9').replace('#', '');
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
        // Outra chamada pode ter passado na frente entre o fim do await
        // acima e este ponto -- checa de novo antes de assumir a variável
        // compartilhada, senão o stroke recém-criado também ficaria órfão.
        if (myToken !== _highlightToken) { try { strokeRect.remove(); } catch (e) {} return; }
        activeHighlightNode = strokeRect;
      }
    }
  }

  if (msg.type === "clear-highlight") {
    // Invalida qualquer highlight-node ainda em voo (await pendente) --
    // sem isso, ele poderia terminar depois deste clear e recriar um
    // stroke que devia ter sido limpo.
    _highlightToken++;
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
  }

  if (msg.type === "hide-node") {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      const targetVisible = msg.forceState !== undefined ? msg.forceState : false;
      node.visible = targetVisible;
      // contour está fora do specGroup -- ocultar o group não afeta o
      // marcador, então replica a visibilidade nele via pluginData.
      const markerId = node.getPluginData && node.getPluginData('handexSpecMarkerId');
      if (markerId) {
        const marker = await figma.getNodeByIdAsync(markerId);
        if (marker) marker.visible = targetVisible;
      }
    }
  }

  if (msg.type === "show-node") {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      node.visible = true;
      const markerId = node.getPluginData && node.getPluginData('handexSpecMarkerId');
      if (markerId) {
        const marker = await figma.getNodeByIdAsync(markerId);
        if (marker) marker.visible = true;
      }
    }
  }

  if (msg.type === "hide-spec-lines") {
    const targetVisible = msg.forceState !== undefined ? msg.forceState : false;
    for (const specId of (msg.specIds || [])) {
      const specGroup = await figma.getNodeByIdAsync(specId);
      if (!specGroup || !('findChildren' in specGroup)) continue;
      const lineNodes = specGroup.findChildren(n => n.name === 'Conector' || n.name === 'DotInicio' || n.name === 'DotFim');
      lineNodes.forEach(n => { n.visible = targetVisible; });
    }
  }

  // Deriva de qual lado do elemento a linha guia deve saír, a partir da
  // posição REAL do card -- usado quando não há guideSide explícito
  // (usuário arrastou livremente, sem declarar lado antes). Compara a
  // posição do centro do card contra os 4 lados do elemento e escolhe o
  // eixo dominante (maior distância relativa), depois o sinal dentro dele.
  function _computeSideFromBounds(elBounds, cardBounds) {
    return _hdSideFromBoxes(elBounds, cardBounds);
  }


  // Recalcula e recria a linha (Conector/DotInicio/DotFim) de UMA spec já
  // criada, a partir da posição ATUAL do card e do elemento vinculado no
  // canvas -- não das coordenadas salvas na criação, o que resolve de
  // brinde "linha desalinha se o card ou o elemento forem arrastados".
  // Diferente de fluxos (edit-flow-connection), NÃO apaga o specGroup
  // inteiro -- specCard permanece intacto, só a linha é substituída.
  // 'Destaque' está fora do specGroup (contour solto na página) e nunca é
  // tocado aqui: a busca por nome inclui só Conector/DotInicio/DotFim.
  async function _rebuildSpecConnector(msg) {
    const specGroup = await figma.getNodeByIdAsync(msg.specId);
    const node = msg.targetNodeId ? await figma.getNodeByIdAsync(msg.targetNodeId) : null;
    if (!specGroup || !('findChildren' in specGroup) || !node) {
      throw new Error('nodes-nao-encontrados');
    }
    const specCard = specGroup.findOne(n => n.name === 'Spec Notes');
    const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
    // specCard.x/y são relativos ao specGroup (GROUP) -- usa
    // absoluteBoundingBox para obter a posição real no canvas, igual já
    // se fazia para `node`. Continua necessário mesmo com GROUP (não só
    // com FRAME): x/y de qualquer nó são sempre relativos ao parent
    // imediato, e o specGroup pode ter sido movido pelo usuário.
    const cardBounds = specCard && (specCard.absoluteBoundingBox || specCard.absoluteRenderBounds);
    if (!specCard || !bounds || !cardBounds) {
      throw new Error('elemento-nao-encontrado');
    }

    const wasVisible = specGroup.findChildren(n => n.name === 'Conector' || n.name === 'DotInicio' || n.name === 'DotFim')
      .every(n => n.visible !== false);

    // Sem guideSide explícito (ex: "Concluir posicionamento" após o
    // usuário arrastar o card livremente) -- deriva o lado da posição REAL
    // do card em relação ao elemento, em vez de usar uma escolha prévia
    // que pode não bater mais com onde o card acabou. Compara o centro do
    // card contra os 4 lados do elemento e escolhe o mais próximo.
    const side = _hdValidLineSide(bounds, cardBounds, msg.guideSide);
    let startPt, endPt;
    if (side === 'right') {
      startPt = { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
      endPt   = { x: cardBounds.x, y: cardBounds.y + cardBounds.height / 2 };
    } else if (side === 'left') {
      startPt = { x: bounds.x, y: bounds.y + bounds.height / 2 };
      endPt   = { x: cardBounds.x + cardBounds.width, y: cardBounds.y + cardBounds.height / 2 };
    } else if (side === 'bottom') {
      startPt = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
      endPt   = { x: cardBounds.x + cardBounds.width / 2, y: cardBounds.y };
    } else { // top
      startPt = { x: bounds.x + bounds.width / 2, y: bounds.y };
      endPt   = { x: cardBounds.x + cardBounds.width / 2, y: cardBounds.y + cardBounds.height };
    }

    const _specConnectorStyle = msg.connectorStyle || 'straight';
    const _specCurvature = _specConnectorStyle === 'curved' ? (msg.connectorCurvature || 0) : 0;

    // Path desenhado em coordenadas ABSOLUTAS de página (startPt/endPt já
    // são absolutos) -- não em relativas ao specGroup. Calcular relativo
    // manualmente (via specCard.x/y como origem) quebrava sempre que o
    // group se redimensionava ao ganhar um filho nesta mesma função: um
    // GROUP no Figma reancora sua origem no bounding box da união dos
    // filhos, e ao mudar essa origem o Figma desloca x/y de TODOS os
    // filhos (incluindo o specCard já existente) para preservar a posição
    // absoluta deles -- só que isso acontece DEPOIS do cálculo de origem
    // feito aqui, invalidando-o e jogando o Conector novo pra longe do
    // lugar certo. Solução: construir tudo solto na página (absoluto,
    // como o fluxo de criação em create-unified-spec já faz) e só then
    // mover pro group -- o Figma recalcula o relativo sozinho no
    // appendChild, sem depender de origem pré-calculada.
    let connectorPath = `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}`;
    if (_specConnectorStyle === 'elbow') {
      // Roteamento ortogonal (ver _orthogonalElbowPoints) -- mesma fórmula
      // da criação (create-unified-spec): sempre sai reto na direção do
      // lado e entra reto no card, com quantas dobras forem necessárias.
      const OPPOSITE_SIDE = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' };
      const specElbowPoints = _orthogonalElbowPoints(
        { x: startPt.x, y: startPt.y, side },
        { x: endPt.x, y: endPt.y, side: OPPOSITE_SIDE[side] }
      );
      const segs = [startPt, ...specElbowPoints, endPt].map(p => `${p.x} ${p.y}`).join(' L ');
      connectorPath = `M ${segs}`;
    } else if (_specCurvature) {
      const dx = endPt.x - startPt.x, dy = endPt.y - startPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / dist, py = dx / dist;
      const offset = (_specCurvature / 100) * dist * 0.5;
      const midX = (startPt.x + endPt.x) / 2, midY = (startPt.y + endPt.y) / 2;
      const ctrlX = midX + px * offset, ctrlY = midY + py * offset;
      connectorPath = `M ${startPt.x} ${startPt.y} Q ${ctrlX} ${ctrlY} ${endPt.x} ${endPt.y}`;
    }

    const themeColor = hexToRgb(msg.color || '#004d8d');

    const oldLineNodes = specGroup.findChildren(n => n.name === 'Conector' || n.name === 'DotInicio' || n.name === 'DotFim');
    oldLineNodes.forEach(n => n.remove());

    // connector.x/y ficam em 0,0 (origem do vetor) porque o path já
    // carrega as coordenadas absolutas -- appendChild só precisa acontecer
    // DEPOIS que o vetor já está solto na página com o path certo, senão
    // o group tenta reancorar em cima de um vetor ainda sem path.
    const connector = figma.createVector();
    connector.name = 'Conector';
    figma.currentPage.appendChild(connector);
    connector.x = 0;
    connector.y = 0;
    connector.vectorPaths = [{ windingRule: "NONZERO", data: connectorPath }];
    connector.strokes = [{ type: "SOLID", color: themeColor }];
    connector.strokeWeight = 1.5;
    connector.dashPattern = [4, 4];
    connector.strokeCap = "ROUND";
    connector.visible = wasVisible;
    connector.locked = false;

    const _DOT_R = 4;
    const startDot = figma.createEllipse();
    startDot.name = 'DotInicio';
    startDot.resize(_DOT_R * 2, _DOT_R * 2);
    startDot.fills = [{ type: "SOLID", color: themeColor }];
    startDot.strokes = [];
    startDot.visible = wasVisible;
    startDot.locked = true;
    figma.currentPage.appendChild(startDot);
    startDot.x = startPt.x - _DOT_R;
    startDot.y = startPt.y - _DOT_R;

    const endDot = figma.createEllipse();
    endDot.name = 'DotFim';
    endDot.resize(_DOT_R * 2, _DOT_R * 2);
    endDot.fills = [{ type: "SOLID", color: themeColor }];
    endDot.strokes = [];
    endDot.visible = wasVisible;
    endDot.locked = true;
    figma.currentPage.appendChild(endDot);
    endDot.x = endPt.x - _DOT_R;
    endDot.y = endPt.y - _DOT_R;

    // Move os 3 pro group por último -- solto na página com coordenadas
    // absolutas já corretas, o Figma recalcula x/y relativo sozinho ao
    // trocar de parent, sem precisar de origem pré-calculada que fica
    // obsoleta assim que o group se redimensiona.
    specGroup.appendChild(connector);
    specGroup.appendChild(startDot);
    specGroup.appendChild(endDot);

    return { connectorStyle: _specConnectorStyle, connectorCurvature: _specCurvature };
  }

  if (msg.type === "edit-spec-connector") {
    try {
      const result = await _rebuildSpecConnector(msg);
      figma.ui.postMessage({
        type: 'spec-connector-edited',
        specId: msg.specId,
        connectorStyle: result.connectorStyle,
        connectorCurvature: result.connectorCurvature
      });
    } catch (e) {
      figma.ui.postMessage({ type: 'spec-connector-edit-failed', specId: msg.specId, message: e.message });
    }
  }

  // Bounds do elemento vinculado + do specCard, pro frontend sugerir
  // Reta/Angular no modal "Editar Linha da Spec" (ver
  // _suggestConnectorStyleFromBounds em specifications.js) -- só faz
  // sentido na EDIÇÃO (não na criação): o specCard só existe depois que a
  // spec já foi criada, então não há como sugerir estilo antes disso.
  if (msg.type === "get-spec-connector-bounds") {
    try {
      const specGroup = await figma.getNodeByIdAsync(msg.specId);
      const node = msg.targetNodeId ? await figma.getNodeByIdAsync(msg.targetNodeId) : null;
      const specCard = specGroup && 'findOne' in specGroup ? specGroup.findOne(n => n.name === 'Spec Notes') : null;
      const nodeBounds = node && (node.absoluteBoundingBox || node.absoluteRenderBounds);
      const cardBounds = specCard && (specCard.absoluteBoundingBox || specCard.absoluteRenderBounds);
      if (!nodeBounds || !cardBounds) {
        figma.ui.postMessage({ type: 'spec-connector-bounds', specId: msg.specId, nodeBounds: null, cardBounds: null });
      } else {
        figma.ui.postMessage({
          type: 'spec-connector-bounds', specId: msg.specId,
          nodeBounds: { x: nodeBounds.x, y: nodeBounds.y, width: nodeBounds.width, height: nodeBounds.height },
          cardBounds: { x: cardBounds.x, y: cardBounds.y, width: cardBounds.width, height: cardBounds.height }
        });
      }
    } catch (e) {
      figma.ui.postMessage({ type: 'spec-connector-bounds', specId: msg.specId, nodeBounds: null, cardBounds: null });
    }
  }

  if (msg.type === "unlock-spec-group") {
    const targetLocked = msg.locked !== undefined ? msg.locked : false;
    for (const specId of (msg.specIds || [])) {
      const specGroup = await figma.getNodeByIdAsync(specId);
      if (!specGroup) continue;
      // Travando de volta (fim da edição/posicionamento) com targetNodeId
      // conhecido (enviado só por toggleSpecLock, não por
      // toggleSpecGroupLock) -- recalcula o lado da linha a partir de onde
      // o card REALMENTE ficou, em vez de manter o lado escolhido antes de
      // saber onde ele ia parar. Best-effort: falha aqui não deve impedir
      // o travamento (ação principal do usuário).
      if (targetLocked && msg.targetNodeId) {
        try {
          await _rebuildSpecConnector({ specId, targetNodeId: msg.targetNodeId, color: msg.color });
        } catch (e) { }
      }
      // specGroup (GROUP) só contém Conector + specCard (+ DotInicio/DotFim)
      // -- contour nunca esteve dentro dele, então travar/destravar o group
      // inteiro já respeita a regra de negócio (só linha e posição do card
      // são editáveis) sem precisar de lock seletivo por filho.
      specGroup.locked = targetLocked;
      // Reforço defensivo: o marcador vinculado nunca pode ser destravado,
      // mesmo que o group esteja sendo destravado.
      const markerId = specGroup.getPluginData('handexSpecMarkerId');
      if (markerId) {
        const destaque = await figma.getNodeByIdAsync(markerId);
        if (destaque) destaque.locked = true;
      }
    }
  }

  if (msg.type === 'rename-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      // Grupos de fluxo carregam um prefixo técnico "[Fluxo | N | tipo] " no
      // nome do nó (usado por delete/resync/identificação de categoria) --
      // renomear via UI só deve trocar a parte legível depois do prefixo,
      // nunca sobrescrever o nome inteiro (perderia o prefixo e quebraria
      // esses outros handlers).
      const prefixMatch = node.name.match(/^(\[Fluxo \| \d+ \| \w+\] )/);
      node.name = prefixMatch ? `${prefixMatch[1]}${msg.name}` : msg.name;
      // Se for um grupo ou frame, tenta encontrar um texto interno para atualizar também
      if (node.type === 'GROUP' || node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        const textNode = node.findOne(n => n.type === 'TEXT');
        if (textNode) {
          (async () => {
            try {
              await figma.loadFontAsync(textNode.fontName);
              textNode.characters = msg.name;
              // Reposicionar texto se houver um fundo (losango, círculo, etc)
              const bg = node.findOne(n => n.type === 'POLYGON' || n.type === 'ELLIPSE' || n.type === 'RECTANGLE' || n.type === 'STAR' || n.type === 'VECTOR');
              if (bg) {
                textNode.x = bg.x + (bg.width / 2) - (textNode.width / 2);
                textNode.y = bg.y + (bg.height / 2) - (textNode.height / 2);
              }
            } catch (err) {
              console.error("Erro ao carregar fonte para renomear:", err);
            }
          })();
        }
      }
    }
  }

  if (msg.type === "inject-obs-to-spec") {
    (async () => {
      try {
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        const specNode = await figma.getNodeByIdAsync(msg.specNodeId);
        if (!specNode) { figma.notify("Frame de spec não encontrado", { error: true }); return; }

        const obsFrame = figma.createFrame();
        obsFrame.name = `[Obs] ${msg.tipo || 'Exceção'}`;
        obsFrame.layoutMode = "VERTICAL";
        obsFrame.paddingLeft = 10; obsFrame.paddingRight = 10;
        obsFrame.paddingTop = 8; obsFrame.paddingBottom = 8;
        obsFrame.itemSpacing = 4;
        obsFrame.primaryAxisSizingMode = "AUTO";
        obsFrame.counterAxisSizingMode = "AUTO";
        obsFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.9765, b: 0.902 } }];
        obsFrame.strokes = [{ type: "SOLID", color: { r: 0.9922, g: 0.7098, b: 0.2824 } }];
        obsFrame.strokeWeight = 1;
        obsFrame.cornerRadius = 8;

        const labelText = figma.createText();
        labelText.fontName = { family: "Inter", style: "Bold" };
        labelText.characters = `Obs · ${msg.tipo || 'Exceção'}: ${msg.titulo || ''}`;
        labelText.fontSize = 10;
        labelText.fills = [{ type: "SOLID", color: { r: 0.651, g: 0.3686, b: 0 } }];
        obsFrame.appendChild(labelText);

        const obsText = figma.createText();
        obsText.fontName = { family: "Inter", style: "Regular" };
        obsText.characters = msg.obs;
        obsText.fontSize = 11;
        obsText.fills = [{ type: "SOLID", color: { r: 0.251, g: 0.2941, b: 0.3216 } }];
        obsFrame.appendChild(obsText);

        const parent = specNode.parent || figma.currentPage;
        parent.appendChild(obsFrame);
        obsFrame.x = specNode.x;
        obsFrame.y = (specNode.y || 0) + (specNode.height || 0) + 8;
        figma.notify("Observação injetada no canvas");
      } catch (e) {
        figma.notify("Erro ao injetar observação: " + e.message, { error: true });
      }
    })();
  }

  if (msg.type === "delete-node") {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      // contour (marcador) está fora do specGroup -- remove() no group não
      // o leva junto, então busca e remove o marcador vinculado primeiro,
      // senão ele fica órfão no canvas.
      const markerId = node.getPluginData && node.getPluginData('handexSpecMarkerId');
      if (markerId) {
        const marker = await figma.getNodeByIdAsync(markerId);
        if (marker) { try { marker.remove(); } catch (e) { } }
      }
      node.remove();
      figma.notify("Item excluído com sucesso");
    }
    // Remove também o highlight temporário se estiver ativo
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
  }

  if (msg.type === 'save-storage') {
    // Por arquivo e por designer: clientStorage + cópia no documento
    // (_hxSaveState). Falha só quando as duas falharem.
    const ok = await _hxSaveState(msg.data);
    if (ok) figma.ui.postMessage({ type: 'storage-saved' });
    else figma.ui.postMessage({ type: 'storage-save-failed', message: 'Não foi possível salvar neste arquivo (sem permissão de edição ou limite de tamanho).' });
    await _writeSharedPluginData(msg.data);
  }

  // Estado de onboarding — chave própria, deliberadamente fora de
  // handoffData (não deve ser apagado por "Limpar Dados do plugin" nem
  // exportado/importado junto com o backup do projeto).
  if (msg.type === 'save-onboarding-state') {
    figma.clientStorage.setAsync('handex-onboarding-seen', msg.data).catch(err => {
      console.warn("Onboarding state save failed:", err);
    });
  }

  if (msg.type === 'focus-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node && _nodeOnCurrentPage(node)) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
  }

  if (msg.type === 'resize-ui') {
    figma.ui.resize(msg.width, msg.height);
  }

  if (msg.type === "export-design-data") {
    // Generate a simple CSV or handle basic data extraction. 
    // In Figma plugins, we generally extract the data and send it back to UI to trigger download.
    const nodes = figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
    let data = "Node Name, Type, Width, Height\n";
    nodes.forEach(n => {
      data += `${n.name.replace(/,/g, '')},${n.type},${n.width || 0},${n.height || 0}\n`;
    });
    figma.ui.postMessage({ type: 'design-data-exported', data: data, format: msg.format });
  }

  if (msg.type === "get-flow-selection-bounds") {
    figma.ui.postMessage({ type: 'flow-selection-bounds', nodes: _getFlowSelectionBoundsPayload() });
  }

  // Liga/desliga o listener de selectionchange do mini-mapa de ancoragem —
  // enviado pelo frontend ao abrir/fechar o modal "Conectar Frames", evita
  // postMessage a cada mudança de seleção quando ninguém está olhando pro
  // mini-mapa (modal fechado ou outra tela do plugin).
  if (msg.type === "track-flow-anchor-preview") {
    _flowAnchorPreviewActive = !!msg.active;
  }

  if (msg.type === "create-flow-connection") {
    const selection = figma.currentPage.selection;
    const isEvent = msg.flowType === "event_start" || msg.flowType === "event_end";

    if (isEvent) {
      if (selection.length === 0) {
        figma.notify("Selecione pelo menos um elemento.");
        figma.ui.postMessage({ type: 'canvas-action-failed' });
        return;
      }
      await _buildFlowConnection(selection[0], null, msg);
      return;
    }

    if (selection.length < 2) {
      figma.notify("Selecione pelo menos dois elementos para conectar.");
      figma.ui.postMessage({ type: 'canvas-action-failed' });
      return;
    }

    if (selection.length === 2) {
      // Resolve A/B pela ordem real de clique quando disponível -- sem isso,
      // o swap espacial em _buildFlowConnection decide a direção só pela
      // posição no canvas, podendo inverter a intenção do usuário mesmo com
      // apenas 2 elementos selecionados.
      const orderedPair = _resolveChainOrder(selection);
      const pairMsg = Object.assign({}, msg, { orderIsIntentional: _selectionOrderReliable, flowSideB: msg.flowEndSide });
      const result = await _buildFlowConnection(orderedPair[0], orderedPair[1], pairMsg);
      // Marcadores automáticos usam sourceId/targetId do RESULTADO, não
      // selection[0]/[1] -- _buildFlowConnection pode ter invertido A/B
      // internamente por posição espacial (flowSide 'auto'), e o resultado
      // já reflete a ordem final real da seta.
      if (msg.autoMarkEndpoints && result) {
        const nodeStart = await figma.getNodeByIdAsync(result.sourceId);
        const nodeEnd = result.targetId ? await figma.getNodeByIdAsync(result.targetId) : null;
        if (nodeStart) await _moveFlowEndpointMarker(nodeStart, true, msg.nextFlowNumber || 1);
        if (nodeEnd) await _moveFlowEndpointMarker(nodeEnd, false, msg.nextFlowNumber || 1);
      }
      return;
    }

    // 3+ elementos: conecta em sequência (A→B→C→D), uma conexão a menos que
    // o total de elementos. A ordem de figma.currentPage.selection reflete
    // a ordem interna de camadas do Figma, não a ordem de clique do usuário
    // -- por isso resolve pela ordem de clique rastreada (com fallback
    // espacial), mesma função do mini-mapa (_resolveChainOrder), pra
    // garantir que a cadeia mostrada na prévia bata com o resultado real
    // no canvas.
    const ordered = _resolveChainOrder(selection);
    figma.ui.postMessage({ type: 'flow-batch-started' });
    let created = 0;
    for (let i = 0; i < ordered.length - 1; i++) {
      // Cada conexão da sequência precisa de flowId/nextFlowNumber próprios
      // -- sem isso, todas as conexões do lote colidiriam no mesmo
      // handexFlowId (duplicaria/substituiria umas às outras na ficha) e
      // teriam o mesmo número sequencial no nome do grupo. flowSide também
      // é por segmento -- flowSidesByIndex[i] é o lado escolhido no card de
      // ORIGEM deste segmento (índice i na cadeia ordenada), permitindo A
      // sair pela direita, B pelo topo, C por baixo etc na mesma cadeia
      // (ver flowSidesByIndex em confirmFlowConnection, specifications.js).
      const segFlowSide = (Array.isArray(msg.flowSidesByIndex) && msg.flowSidesByIndex[i]) || msg.flowSide;
      // flowEndSide (lado de ENTRADA escolhido no último card da cadeia) só
      // se aplica ao segmento final -- os segmentos intermediários usam o
      // ponto mais próximo, como sempre.
      const isLastSegment = i === ordered.length - 2;
      const segMsg = Object.assign({}, msg, {
        flowId: `${msg.flowId || Date.now()}-${i}`,
        nextFlowNumber: (msg.nextFlowNumber || 1) + i,
        orderIsIntentional: true,
        flowSide: segFlowSide,
        flowSideB: isLastSegment ? msg.flowEndSide : undefined
      });
      await _buildFlowConnection(ordered[i], ordered[i + 1], segMsg);
      created++;
      // Cede o controle ao runtime do Figma entre cada segmento -- sem isso,
      // uma cadeia longa (cada segmento cria vetores/grupos/texto) roda como
      // um bloco síncrono contínuo (cada `await` acima resolve
      // instantaneamente sem ceder o main thread de verdade), deixando o
      // Figma sem processar input do usuário (teclado no canvas, cliques)
      // até o loop inteiro terminar -- reportado como travamento de alguns
      // segundos ao conectar 3+ elementos.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    // Cadeia: Início vai sempre no primeiro elemento da ordem final, Fim no
    // último -- os intermediários nunca recebem marcador, mesmo que já
    // tivessem um de uma conexão anterior isolada (esse caso não é coberto
    // aqui; a movimentação de marcador existente só se aplica ao próprio
    // elemento que está virando a nova ponta da cadeia).
    if (msg.autoMarkEndpoints && ordered.length >= 2) {
      await _moveFlowEndpointMarker(ordered[0], true, msg.nextFlowNumber || 1);
      await _moveFlowEndpointMarker(ordered[ordered.length - 1], false, (msg.nextFlowNumber || 1) + created);
    }
    figma.ui.postMessage({ type: 'flow-batch-created', count: created });
  }

  // Recria um fluxo salvo em handoffData.createdFlows (import de backup JSON).
  // Diferente de create-flow-connection, não depende de seleção ativa --
  // resolve os nós de origem/destino pelos IDs salvos no momento da criação
  // original (sourceId/targetId, ver flow-created em _buildFlowConnection).
  // Fluxos criados antes dessa marcação existir não têm esses IDs e são
  // sinalizados como não recriáveis pela UI antes mesmo de chegar aqui.
  if (msg.type === "recreate-flow-connection") {
    const isEvent = msg.flowType === "event_start" || msg.flowType === "event_end";
    const nodeA = msg.sourceId ? await figma.getNodeByIdAsync(msg.sourceId) : null;
    const nodeB = msg.targetId ? await figma.getNodeByIdAsync(msg.targetId) : null;

    if (!nodeA || (!isEvent && msg.targetId && !nodeB)) {
      figma.ui.postMessage({ type: 'flow-recreate-failed', flowName: msg.flowName || '' });
      return;
    }

    await _buildFlowConnection(nodeA, nodeB, msg);
  }

  // Edita curvatura/texto de um fluxo já criado -- não há API do Figma pra
  // "reformar" um VECTOR existente com um path diferente preservando o
  // resto do grupo (seta, chip de texto reposicionado), então apaga o
  // grupo antigo e recria do zero com os parâmetros novos, preservando
  // flowUid pra não perder o vínculo com a ficha (insert-flows-in-ficha).
  if (msg.type === "edit-flow-connection") {
    const nodeA = msg.sourceId ? await figma.getNodeByIdAsync(msg.sourceId) : null;
    const nodeB = msg.targetId ? await figma.getNodeByIdAsync(msg.targetId) : null;

    if (!nodeA) {
      figma.ui.postMessage({ type: 'flow-edit-failed', reason: 'nodes-nao-encontrados' });
      return;
    }

    let _editColor = msg.color;
    if (msg.oldGroupId) {
      try {
        const oldGroup = await figma.getNodeByIdAsync(msg.oldGroupId);
        if (oldGroup) {
          if (!_editColor) _editColor = oldGroup.getPluginData('handexFlowColor');
          oldGroup.remove();
        }
      } catch (e) {}
    }

    await _buildFlowConnection(nodeA, nodeB, Object.assign({}, msg, { color: _editColor }));
  }

  // Recria em lote todos os fluxos salvos em handoffData.createdFlows --
  // mesma lógica de recreate-flow-connection, mas iterando a lista inteira
  // sem postar um flow-created por item (evitaria duplicar entradas em
  // handoffData.createdFlows); a UI substitui a lista inteira a partir do
  // resultado agregado flows-resynced.
  if (msg.type === "resync-all-flows") {
    const updated = [];
    const failed = [];
    for (const flow of (msg.flows || [])) {
      if (!flow.sourceId) { failed.push({ flowUid: flow.flowUid, name: flow.name, reason: 'sem-origem-salva' }); continue; }
      const nodeA = await figma.getNodeByIdAsync(flow.sourceId);
      const nodeB = flow.targetId ? await figma.getNodeByIdAsync(flow.targetId) : null;
      const isEvent = flow.type === 'event_start' || flow.type === 'event_end';
      if (!nodeA || (!isEvent && flow.targetId && !nodeB)) { failed.push({ flowUid: flow.flowUid, name: flow.name, reason: 'elemento-nao-encontrado' }); continue; }
      try {
        const oldGroup = flow.id ? await figma.getNodeByIdAsync(flow.id) : null;
        const _savedColor = flow.color || (oldGroup ? oldGroup.getPluginData('handexFlowColor') : '');
        if (oldGroup) oldGroup.remove();
        const result = await _buildFlowConnection(nodeA, nodeB, { ...flow, color: _savedColor, flowType: flow.type, flowName: flow.name, flowId: flow.flowUid, suppressFlowCreatedBroadcast: true });
        if (!result) { failed.push({ flowUid: flow.flowUid, name: flow.name, reason: 'erro-ao-recriar' }); continue; }
        updated.push({ flowUid: flow.flowUid, oldId: flow.id, newId: result.id });
      } catch (e) {
        failed.push({ flowUid: flow.flowUid, name: flow.name, reason: 'erro-ao-recriar' });
      }
      // Mesmo motivo do loop de cadeia em create-flow-connection: cede o
      // main thread do Figma entre cada fluxo recriado, senão um resync com
      // muitos fluxos trava input do usuário (teclado/clique no canvas) até
      // o lote inteiro terminar.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    figma.ui.postMessage({ type: 'flows-resynced', updated, failed });
    figma.notify(`${updated.length} fluxo(s) atualizado(s)${failed.length ? `, ${failed.length} não recriado(s)` : ''}.`);
  }

  if (msg.type === "create-legend") {
    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const legendFrame = figma.createFrame();
      legendFrame.name = "[Fluxo | legenda] Legendas dos Fluxos";
      legendFrame.layoutMode = "VERTICAL";
      legendFrame.paddingLeft = 20;
      legendFrame.paddingRight = 20;
      legendFrame.paddingTop = 20;
      legendFrame.paddingBottom = 20;
      legendFrame.itemSpacing = 16;
      legendFrame.cornerRadius = 12;
      legendFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      legendFrame.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
      legendFrame.strokeWeight = 1;
      legendFrame.primaryAxisSizingMode = "AUTO";
      legendFrame.counterAxisSizingMode = "AUTO";

      // Title
      const legendTitle = figma.createText();
      legendTitle.fontName = { family: "Inter", style: "Bold" };
      legendTitle.characters = "Legendas de Especificação";
      legendTitle.fontSize = 14;
      legendTitle.fills = [{ type: "SOLID", color: { r: 0.1333, g: 0.1608, b: 0.1804 } }];
      legendFrame.appendChild(legendTitle);

      const types = [
        { name: "Cenário de exceção", c: { r: 0.9529, g: 0.5725, b: 0 } },
        { name: "Informação extra", c: { r: 0.05, g: 0.64, b: 0.91 } },
        { name: "Comportamento", c: { r: 0.92, g: 0.28, b: 0.60 } },
        { name: "Regra de Negócio", c: { r: 0.02, g: 0.71, b: 0.82 } },
        { name: "Dados da API", c: { r: 0.51, g: 0.80, b: 0.08 } }
      ];

      for (const t of types) {
        const row = figma.createFrame();
        row.layoutMode = "HORIZONTAL";
        row.itemSpacing = 12;
        row.counterAxisAlignItems = "CENTER";
        row.primaryAxisSizingMode = "AUTO";
        row.counterAxisSizingMode = "AUTO";
        row.fills = [];

        const circle = figma.createEllipse();
        circle.resize(16, 16);
        circle.fills = [{ type: "SOLID", color: t.c }];
        circle.strokes = [];

        const text = figma.createText();
        text.fontName = { family: "Inter", style: "Medium" };
        text.characters = t.name;
        text.fontSize = 12;
        text.fills = [{ type: "SOLID", color: { r: 0.1333, g: 0.1608, b: 0.1804 } }];

        row.appendChild(circle);
        row.appendChild(text);
        legendFrame.appendChild(row);
      }

      legendFrame.x = figma.viewport.center.x - 120;
      legendFrame.y = figma.viewport.center.y - 100;
      legendFrame.locked = true;
      legendFrame.setPluginData('handexCategory', 'fluxo');
      figma.currentPage.appendChild(legendFrame);
      _hdMoveToCategorySection(legendFrame, 'fluxo');
      figma.currentPage.selection = [legendFrame];
      figma.viewport.scrollAndZoomIntoView([legendFrame]);
      figma.notify("Legenda criada!");
    })();
  }


  if (msg.type === 'pull-briefing-from-canvas') {
    const briefingFrame = figma.currentPage.findOne(n => n.type === 'FRAME' && n.name === 'Briefing Estruturado');
    if (!briefingFrame) {
      figma.ui.postMessage({ type: 'briefing-data-pulled', data: [] });
      return;
    }

    const data = [];
    let currentHeader = null;

    const texts = briefingFrame.findAll(n => n.type === 'TEXT');
    for (const child of texts) {
      const style = child.fontName.style || '';
      if (style.includes('Bold') || style.includes('SemiBold') || style.includes('Black')) {
        currentHeader = child.characters;
      } else if (style.includes('Regular') && currentHeader) {
        if (child.characters.trim().length > 0 && child.characters.trim() !== 'Clique para adicionar...') {
          data.push({ category: "Importado do Canvas", question: currentHeader, answer: child.characters });
        }
        currentHeader = null; 
      }
    }

    figma.ui.postMessage({ type: 'briefing-data-pulled', data });
    return;
  }

  // Resgata a versao da ficha de handoff mais recente ja gerada na pagina
  // atual (busca por nome, ignora titulo -- assume 1 handoff por pagina).
  // Usado ao abrir o modal "Gerar Ficha" para o resumo/versionamento
  // partirem do que de fato esta no canvas, nao so do que ficou salvo
  // no estado do plugin (que pode estar desatualizado).
  // Exporta a Ficha do canvas (a que já existe, não uma reconstrução) como
  // PDF nativo -- Plugin API tem format: 'PDF' em exportAsync, fidelidade
  // visual total (cores, cards, snapshots) sem precisar reconstruir nada
  // via lib externa (diferente do PDF de texto puro já existente em
  // exportHandoff, handoff.js, que só converte o Markdown pra texto
  // corrido). Reaproveita _hdFindExistingFicha (mesmo critério de busca já
  // usado em pull-ficha-version-from-canvas/insert-ficha-section).
  if (msg.type === 'export-ficha-pdf') {
    (async () => {
      try {
        const _titulo = (msg.titulo || '').replace(/\//g, '-');
        const ficha = _hdFindExistingFicha(_titulo);
        if (!ficha) {
          figma.ui.postMessage({ type: 'ficha-pdf-exported', bytes: null, error: 'no-ficha' });
          return;
        }
        const bytes = await ficha.exportAsync({ format: 'PDF' });
        figma.ui.postMessage({ type: 'ficha-pdf-exported', base64: figma.base64Encode(bytes) });
      } catch (e) {
        figma.ui.postMessage({ type: 'ficha-pdf-exported', bytes: null, error: e.message });
      }
    })();
    return;
  }

  if (msg.type === 'pull-ficha-version-from-canvas') {
    // Try/catch cobre toda a leitura: o frontend depende de sempre receber
    // uma resposta para não travar o botão "Gerar Ficha" (ver timeout de
    // segurança em openHandoffInjectModal, modules/handoff.js).
    try {
      // Escopa pelo título do projeto atual quando disponível -- sem isso,
      // fichas de OUTROS projetos na mesma página (mesmo prefixo de nome)
      // podiam ser lidas como "a mais recente" e sugerir a versão errada.
      // Reaproveita _hdFindExistingFicha (mesmo critério, já busca dentro da
      // Section "Handex | Ficha" além de fichas legadas soltas na página) em
      // vez de duplicar a lógica de busca aqui -- eram duas cópias quase
      // idênticas antes de 2026-09-11.
      const latest = _hdFindExistingFicha(msg.titulo);
      if (!latest) {
        figma.ui.postMessage({ type: 'ficha-version-pulled', versao: null, temFicha: false });
        return;
      }
      const campoVersao = latest.findOne(n => n.type === 'FRAME' && n.name === '[Campo] Versão');
      const versaoText = campoVersao ? campoVersao.findAll(n => n.type === 'TEXT')[1] : null;
      const versao = versaoText ? versaoText.characters.trim() : null;
      figma.ui.postMessage({ type: 'ficha-version-pulled', versao: (versao && versao !== '-') ? versao : null, temFicha: true });
    } catch (e) {
      figma.ui.postMessage({ type: 'ficha-version-pulled', versao: null });
    }
    return;
  }


  // â”€â”€â”€ INJECT FRAMEWORK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (msg.type === 'inject-framework') {
    (async () => {
      for (const font of [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Medium" },
        { family: "Inter", style: "Bold" }
      ]) {
        try { await figma.loadFontAsync(font); } catch(e) {}
      }

      const CAIXA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631"><g transform="translate(-284.78446,-475.51214)"><g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)"><g transform="scale(0.24,0.24)"><path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f39200;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f39200;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#005ca9;fill-opacity:1;fill-rule:evenodd;stroke:none"/></g></g></g></svg>`;

      const mkLogo = (h) => {
        try {
          const n = figma.createNodeFromSvg(CAIXA_SVG);
          n.name = "CAIXA Logo";
          n.resize(Math.round(h * 205.51 / 46.55), h);
          return n;
        } catch(e) {
          const t = tx("CAIXA", Math.round(h * 0.6), "Bold", C.blue);
          return t;
        }
      };

      const mkHeader = (title) => {
        const bar = figma.createFrame();
        bar.layoutMode = "HORIZONTAL";
        bar.paddingLeft = bar.paddingRight = 16;
        bar.paddingTop = bar.paddingBottom = 14;
        bar.itemSpacing = 12;
        bar.primaryAxisSizingMode = "AUTO";
        bar.counterAxisSizingMode = "AUTO";
        bar.layoutAlign = "STRETCH";
        bar.counterAxisAlignItems = "CENTER";
        bar.fills = [{ type: "SOLID", color: C.bgBlue }];
        bar.appendChild(mkLogo(20));
        bar.appendChild(tx("|", 14, "Regular", C.blueDark));
        bar.appendChild(tx(title, 14, "Bold", C.blueDark));
        return bar;
      };

      const mkCanvas = (h, fill) => {
        const c = figma.createFrame();
        c.resize(100, h);
        c.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        c.layoutAlign = "STRETCH";
        return c;
      };

      const C = {
        blue:      { r: 0, g: 0.361, b: 0.663 },
        blueDark:  { r: 0, g: 0.263, b: 0.478 },
        blueLight: { r: 0.898, g: 0.949, b: 0.988 },
        orange:    { r: 0.953, g: 0.573, b: 0     },
        teal:      { r: 0.3294, g: 0.7333, b: 0.6706 },
        tealLight: { r: 0.8941, g: 0.9686, b: 0.9569 },
        lime:      { r: 0.7725, g: 0.8706, b: 0.1922 },
        yellow:    { r: 0.9961, g: 0.898, b: 0.6078 },
        white:     { r: 1,     g: 1,     b: 1     },
        bg:        { r: 0.9216, g: 0.9451, b: 0.949 },
        bgBlue:    { r: 0.898, g: 0.949, b: 0.988 },
        line:      { r: 0.8157, g: 0.8784, b: 0.8902 },
        text:      { r: 0.1333, g: 0.1608, b: 0.1804 },
        muted:     { r: 0.3922, g: 0.4549, b: 0.4784 },
        light:     { r: 0.6196, g: 0.698, b: 0.7216 },
        green:     { r: 0.0706, g: 0.4588, b: 0.1529 },
        greenLight:{ r: 0.9059, g: 0.9569, b: 0.9176 },
        amber:     { r: 0.9882, g: 0.7451, b: 0.0196 },
        red:       { r: 0.851, g: 0.2118, b: 0.2118 },
      };

      const tx = (text, size, weight, color) => {
        const n = figma.createText();
        n.fontName = { family: "Inter", style: weight || "Regular" };
        n.characters = String(text || "");
        n.fontSize = size || 12;
        n.fills = [{ type: "SOLID", color: color || C.text }];
        n.textAutoResize = "WIDTH_AND_HEIGHT";
        return n;
      };

      const vb = (w, pad, gap, fill, cr) => {
        const f = figma.createFrame();
        f.layoutMode = "VERTICAL";
        f.paddingLeft = f.paddingRight = pad;
        f.paddingTop = f.paddingBottom = pad;
        f.itemSpacing = gap;
        f.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (cr) f.cornerRadius = cr;
        if (w !== null) {
          f.counterAxisSizingMode = "FIXED";
          f.resize(w, 10);
        } else {
          f.counterAxisSizingMode = "AUTO";
        }
        f.primaryAxisSizingMode = "AUTO"; 
        return f;
      };

      const hb = (pad, gap, fill, cr) => {
        const f = figma.createFrame();
        f.layoutMode = "HORIZONTAL";
        f.paddingLeft = f.paddingRight = pad;
        f.paddingTop = f.paddingBottom = pad;
        f.itemSpacing = gap;
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "AUTO";
        f.counterAxisAlignItems = "CENTER";
        f.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (cr) f.cornerRadius = cr;
        return f;
      };

      const addT = (parent, text, size, weight, color) => {
        const n = tx(text, size, weight, color);
        n.textAutoResize = "HEIGHT";
        n.layoutAlign = "STRETCH";
        parent.appendChild(n);
        return n;
      };

      const sp = (h) => {
        const r = figma.createRectangle();
        r.resize(4, h); r.opacity = 0;
        return r;
      };

      const rct = (w, h, fill, cr, strokeC, strokeW, dash) => {
        const r = figma.createRectangle();
        r.resize(w, h);
        r.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (cr) r.cornerRadius = cr;
        if (strokeC) {
          r.strokes = [{ type: "SOLID", color: strokeC }];
          r.strokeWeight = strokeW || 1;
          if (dash) r.dashPattern = dash;
        }
        return r;
      };

      const ell = (w, h, fill, strokeC, strokeW, dash) => {
        const e = figma.createEllipse();
        e.resize(w, h);
        e.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (strokeC) {
          e.strokes = [{ type: "SOLID", color: strokeC }];
          e.strokeWeight = strokeW || 1;
          if (dash) e.dashPattern = dash;
        }
        return e;
      };

      const addLogo = (parent, x, y, size) => {
        size = size || 36;
        const c = ell(size, size, C.blue);
        c.x = x; c.y = y; parent.appendChild(c);
        const lt = tx("UX", Math.round(size * 0.3), "Bold", C.white);
        lt.x = x + Math.round(size * 0.22); lt.y = y + Math.round(size * 0.33);
        parent.appendChild(lt);
      };

      let mainFrame = null;

      if (msg.frameworkId === 'briefing') {
        mainFrame = vb(700, 48, 0, C.white, 16);
        mainFrame.name = "Briefing Estruturado";
        const hdr = mkHeader("Briefing Estruturado");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        mainFrame.appendChild(sp(20));

        const fieldRow = (label, val) => {
          const row = hb(0, 6, null);
          row.counterAxisAlignItems = "MIN";
          row.appendChild(tx(label + "  ", 13, "Bold", C.blue));
          row.appendChild(tx(val, 13, "Regular", C.text));
          mainFrame.appendChild(row);
          mainFrame.appendChild(sp(4));
        };

        const section = (header, body, sub) => {
          mainFrame.appendChild(sp(sub ? 4 : 14));
          addT(mainFrame, header, sub ? 12 : 14, "Bold", sub ? C.orange : C.blue);
          if (body) {
            mainFrame.appendChild(sp(4));
            addT(mainFrame, body, 12, "Regular", C.muted);
          }
        };

        fieldRow("Nome do Projeto:", "Nome do projeto");
        fieldRow("Data de Início:", "00/00/00");
        mainFrame.appendChild(sp(12));
        const sep = rct(604, 1, C.line); mainFrame.appendChild(sep);

        section("Contexto", "Descreva o contexto atual do projeto e por que ele está sendo demandado. Se existirem jornadas mapeadas ou algum material, ele deve ser registrado ou linkado nesta sessão.");
        section("Resultados-chave e critério de sucesso", "Como o sucesso do projeto será medido?");
        section("Atores e usuários", "Quem é o público deste projeto? Você pode aprofundar, aqui, para um estudo de personas.");
        section("Stakeholders e equipe", "Anote quem faz parte da(s) equipe(s), quais são suas responsabilidades. Importante anotar quem vai validar as decisões.");
        section("Escopo");
        section("Está no escopo", "O que precisa ser trabalhado e por que.", true);
        section("Pode estar no escopo", "O que depende de outros fatores para entrar no escopo.", true);
        section("Não está no escopo", "Limitações técnicas ou escopo excluído explicitamente.", true);
        section("Dependências", "Outras áreas que podem ter conhecimento ou domínio sobre parte do projeto.");
        section("Riscos", "Riscos que atrapalhem o sucesso do projeto. O que pode acontecer se não atingirmos as metas?");
        section("Tempo", "Roadmaps, prazos, sprints necessárias, qualquer fator que tangibilize tempo de projeto.");
        section("Organização do trabalho");
        section("Rotina de trabalho da equipe", "Reuniões diárias? Sprint? Retrô?", true);
        section("Comunicação", "Exemplo: reuniões marcadas por email, feitas pelo Teams.", true);
        section("Compartilhamento de dados", "Softwares e pastas, meio de compartilhamento, formatos de arquivos.", true);
        section("Notas adicionais", "Notas aqui.");
        mainFrame.appendChild(sp(8));
      }
      else if (msg.frameworkId === 'csd') {
        mainFrame = vb(940, 0, 0, C.white, 16);
        mainFrame.name = "Matriz CSD";
        const hdr = mkHeader("Matriz CSD – Certezas · Suposições · Dúvidas");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const csdRow = hb(20, 16, null);
        csdRow.layoutAlign = "STRETCH";
        mainFrame.appendChild(csdRow);

        const csdCols = [
          { label: "Certezas",   sub: "O que sabemos com certeza.",              hdr: C.green,  bg: C.greenLight },
          { label: "Suposições", sub: "O que acreditamos, mas não validamos.",   hdr: C.amber,  bg: { r: 1, g: 0.9765, b: 0.902 } },
          { label: "Dúvidas",   sub: "O que precisamos descobrir.",              hdr: C.red,    bg: { r: 0.9843, g: 0.9216, b: 0.9216 } },
        ];

        csdCols.forEach(col => {
          const card = vb(280, 0, 8, col.bg, 12);
          card.paddingBottom = 16;
          const chdr = vb(280, 16, 4, col.hdr, 0);
          chdr.paddingTop = chdr.paddingBottom = 10;
          chdr.layoutAlign = "STRETCH";
          const ct = tx(col.label, 13, "Bold", C.white);
          ct.layoutAlign = "STRETCH"; ct.textAutoResize = "HEIGHT";
          const cs = tx(col.sub, 10, "Regular", C.white); cs.opacity = 0.85;
          cs.layoutAlign = "STRETCH"; cs.textAutoResize = "HEIGHT";
          chdr.appendChild(ct); chdr.appendChild(cs);
          card.appendChild(chdr);

          for (let i = 0; i < 3; i++) {
            const itemWrap = vb(248, 12, 0, C.white, 8);
            itemWrap.paddingTop = itemWrap.paddingBottom = 10;
            itemWrap.strokes = [{ type: "SOLID", color: C.line }];
            itemWrap.strokeWeight = 1;
            itemWrap.layoutAlign = "STRETCH";
            const ph = tx("Clique para adicionar...", 11, "Regular", C.light);
            ph.layoutAlign = "STRETCH"; ph.textAutoResize = "HEIGHT";
            itemWrap.appendChild(ph);
            card.appendChild(itemWrap);
          }
          csdRow.appendChild(card);
        });
      }
      else if (msg.frameworkId === 'five-whys') {
        mainFrame = vb(600, 40, 0, C.bgBlue, 20);
        mainFrame.name = "Os 5 Porquês";
        const hdr = mkHeader("Os 5 porquê?");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        mainFrame.appendChild(sp(12));
        mainFrame.appendChild(rct(520, 1, C.line));
        mainFrame.appendChild(sp(12));

        const probRow = hb(0, 8, null);
        probRow.counterAxisAlignItems = "MIN";
        probRow.appendChild(tx("Problema:  ", 13, "Bold", C.blue));
        probRow.appendChild(tx("Diga qual o problema encontrado.", 13, "Regular", C.muted));
        mainFrame.appendChild(probRow);

        const emojis  = ["ðŸ˜€","ðŸ˜Š","ðŸ¤”","ðŸ˜¢","ðŸ¤¯","ðŸ˜±"];
        const qLabels = ["Porquê o problema ocorre?","Porquê?","Porquê?","Porquê?","Porquê?","Porquê?"];
        const motivos = ["1Â° motivo","2Â° motivo","3Â° motivo","4Â° motivo","5Â° motivo","6Â° motivo"];

        for (let i = 0; i < 6; i++) {
          mainFrame.appendChild(sp(14));
          const row = hb(0, 12, null);
          row.counterAxisAlignItems = "CENTER";
          row.appendChild(tx(emojis[i], 18, "Regular", C.text));
          const block = vb(null, 0, 2, null);
          block.appendChild(tx(qLabels[i], 13, "Bold", C.blue));
          block.appendChild(tx(motivos[i], 12, "Regular", C.muted));
          row.appendChild(block);
          mainFrame.appendChild(row);
        }

        mainFrame.appendChild(sp(20));
        mainFrame.appendChild(rct(520, 1, C.line));
        mainFrame.appendChild(sp(12));
        addT(mainFrame, "Causa raiz", 14, "Bold", C.blue);
        mainFrame.appendChild(sp(4));
        addT(mainFrame, "A real causa do problema é...", 12, "Regular", C.muted);
        mainFrame.appendChild(sp(8));
      }
      else if (msg.frameworkId === 'stakeholders') {
        const shCanvas = figma.createFrame();
        shCanvas.resize(600, 620);
        shCanvas.fills = [{ type: "SOLID", color: C.white }];
        shCanvas.layoutAlign = "STRETCH";

        const cx = 300, cy = 330;
        [[520, 460], [390, 344], [260, 230], [130, 115]].forEach(([ew, eh]) => {
          const e = ell(ew, eh, null, C.line, 1.5, [8, 8]);
          e.x = cx - ew / 2; e.y = cy - eh / 2;
          shCanvas.appendChild(e);
        });

        const solT = tx("Solução", 13, "Bold", C.text);
        solT.x = cx - 26; solT.y = cy + 10; shCanvas.appendChild(solT);

        const stickyBg = rct(106, 84, { r: 0.9961, g: 0.898, b: 0.6078 }, 4);
        stickyBg.x = cx - 100; stickyBg.y = cy - 88; shCanvas.appendChild(stickyBg);
        const st1 = tx("Stakeholder", 10, "Medium", C.text);
        st1.x = cx - 94; st1.y = cy - 76; shCanvas.appendChild(st1);
        const st2 = tx("• Necessidade", 10, "Regular", C.text);
        st2.x = cx - 94; st2.y = cy - 60; shCanvas.appendChild(st2);

        mainFrame = vb(600, 0, 0, C.white, 16);
        mainFrame.name = "Mapa de Stakeholders";
        const hdr = mkHeader("Mapa de Stakeholders");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        mainFrame.appendChild(shCanvas);
      }
      else if (msg.frameworkId === 'value-effort') {
        const veCanvas = figma.createFrame();
        veCanvas.resize(620, 720);
        veCanvas.fills = [{ type: "SOLID", color: C.white }];
        veCanvas.layoutAlign = "STRETCH";

        const chartBg = rct(500, 580, C.bgBlue, 8);
        chartBg.x = 60; chartBg.y = 20; veCanvas.appendChild(chartBg);

        const yAx = rct(2, 500, C.text); yAx.x = 100; yAx.y = 40; veCanvas.appendChild(yAx);
        const xAx = rct(420, 2, C.text); xAx.x = 100; xAx.y = 560; veCanvas.appendChild(xAx);
        
        mainFrame = vb(620, 0, 0, C.white, 16);
        mainFrame.name = "Matriz Valor × Esforço";
        const hdr = mkHeader("Matriz Valor × Esforço");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        mainFrame.appendChild(veCanvas);
      }
      else if (msg.frameworkId === 'atomic-research') {
        mainFrame = vb(960, 0, 0, C.white, 16);
        mainFrame.name = "Atomic Research";
        const hdr = mkHeader("Atomic Research");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Insira dados de pesquisa atômica aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'blueprint') {
        mainFrame = vb(1200, 0, 0, C.white, 16);
        mainFrame.name = "Blueprint de Serviço";
        const hdr = mkHeader("Blueprint de Serviço");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Construa o blueprint de serviço aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'heuristics') {
        mainFrame = vb(960, 0, 0, C.white, 16);
        mainFrame.name = "Heurísticas de Nielsen";
        const hdr = mkHeader("Heurísticas de Nielsen");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Avaliação heurística aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'opportunities') {
        mainFrame = vb(960, 0, 0, C.white, 16);
        mainFrame.name = "Mapa de Oportunidades";
        const hdr = mkHeader("Mapa de Oportunidades");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Mapeamento de oportunidades aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'personas') {
        mainFrame = vb(800, 0, 0, { r: 0.9686, g: 0.9804, b: 0.9804 }, 16); 
        mainFrame.name = "Painel de Personas";
        const hdr = mkHeader("Painel de Personas");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const body = vb(null, 40, 24, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        const infoRow = hb(0, 16, null);
        infoRow.counterAxisAlignItems = "CENTER";
        const pic = rct(48, 48, C.blue, 24);
        infoRow.appendChild(pic);
        const nameCol = vb(null, 0, 4, null);
        nameCol.appendChild(tx("Perfil 1 - Nome do Perfil", 18, "Bold", C.blueDark));
        nameCol.appendChild(tx("Breve descrição (exemplo: Perfil 1 foi mapeado entendendo cliente interno)", 12, "Regular", C.muted));
        infoRow.appendChild(nameCol);
        body.appendChild(infoRow);

        const sep1 = rct(720, 1, C.blueLight);
        body.appendChild(sep1);
        sep1.layoutAlign = "STRETCH";

        const detailsRow = hb(0, 32, null);
        detailsRow.counterAxisAlignItems = "MIN";
        const photo = rct(160, 200, C.blue, 12);
        detailsRow.appendChild(photo);
        
        const dataCol = vb(null, 0, 16, null);
        const addData = (l, v) => {
          const r = hb(0, 8, null);
          r.appendChild(tx(l+":", 14, "Bold", C.blueDark));
          r.appendChild(tx(v, 14, "Regular", C.text));
          dataCol.appendChild(r);
        };
        addData("Nome", "Um nome (opcional)");
        addData("Idade", "idade média do perfil (pode ser conseguido por dados)");
        addData("Ocupação", "Trabalho / meio de trabalho");
        addData("Renda", "Renda média");
        addData("Escolaridade", "Educação formal");
        detailsRow.appendChild(dataCol);
        body.appendChild(detailsRow);

        const colsRow = hb(0, 40, null);
        colsRow.layoutAlign = "STRETCH";
        
        const col1 = vb(null, 0, 12, null);
        col1.layoutAlign = "STRETCH";
        col1.appendChild(tx("Objetivos", 16, "Bold", C.blueDark));
        const objT = tx("Listar objetivos relacionados ao produto, sejam eles objetivos de vida ou objetivos do dia, organização financeira, etc.", 13, "Regular", C.text);
        col1.appendChild(objT);
        objT.textAutoResize = "HEIGHT"; objT.layoutAlign = "STRETCH";
        colsRow.appendChild(col1);

        const col2 = vb(null, 0, 12, null);
        col2.layoutAlign = "STRETCH";
        col2.appendChild(tx("Necessidade", 16, "Bold", C.blueDark));
        const necT = tx("Listar necessidades relacionados ao produto, aqui podemos mapear dores para identificar oportunidades.", 13, "Regular", C.text);
        col2.appendChild(necT);
        necT.textAutoResize = "HEIGHT"; necT.layoutAlign = "STRETCH";
        colsRow.appendChild(col2);

        body.appendChild(colsRow);

        const oppCol = vb(null, 0, 12, null);
        oppCol.layoutAlign = "STRETCH";
        oppCol.appendChild(tx("Oportunidades", 16, "Bold", C.blueDark));
        const oppT = tx("Liste oportunidades de produto relacionadas às sessões anteriores.", 13, "Regular", C.text);
        oppCol.appendChild(oppT);
        oppT.textAutoResize = "HEIGHT"; oppT.layoutAlign = "STRETCH";
        body.appendChild(oppCol);

        const sep2 = rct(720, 1, C.blueLight);
        body.appendChild(sep2);
        sep2.layoutAlign = "STRETCH";

        const obsCol = vb(null, 0, 12, null);
        obsCol.layoutAlign = "STRETCH";
        obsCol.appendChild(tx("Observações adicionais", 14, "Bold", C.blueDark));
        const obsT = tx("Escreva aqui observações de hipóteses descobertas em análise de dados internos e externos que ajudaram a mapear perfis de clientes / usuários.", 13, "Regular", C.text);
        obsCol.appendChild(obsT);
        obsT.textAutoResize = "HEIGHT"; obsT.layoutAlign = "STRETCH";
        body.appendChild(obsCol);
      }
      else if (msg.frameworkId === 'interview-script') {
        mainFrame = vb(800, 0, 0, C.white, 16);
        mainFrame.name = "Roteiro de Entrevistas";
        const hdr = mkHeader("Tag - Nome do Projeto");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const body = vb(null, 40, 24, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        const title = tx("Roteiro de Entrevistas", 24, "Bold", C.blueDark);
        body.appendChild(title);

        const addSec = (titleStr, descStr, isTitle = false) => {
          const sec = vb(null, 0, 8, null);
          sec.layoutAlign = "STRETCH";
          const t = tx(titleStr, isTitle ? 18 : 14, "Bold", isTitle ? C.blueDark : C.text);
          sec.appendChild(t);
          const d = tx(descStr, 13, "Regular", C.muted);
          sec.appendChild(d);
          d.textAutoResize = "HEIGHT"; d.layoutAlign = "STRETCH";
          body.appendChild(sec);
        };

        addSec("1. Introdução e Aquecimento", "Apresente-se, explique o objetivo da entrevista de forma neutra (sem enviesar) e peça consentimento para gravar. Faça perguntas que quebrem o gelo.", true);
        addSec("Sugestões de perguntas:", "- Como é um dia típico de trabalho para você?\n- Quais ferramentas você mais utiliza hoje?");
        
        const sep1 = rct(720, 1, C.line); body.appendChild(sep1); sep1.layoutAlign = "STRETCH";

        addSec("2. Descoberta e Contexto", "Entenda como o usuário lida com o problema hoje, antes de apresentar qualquer solução.", true);
        addSec("Sugestões de perguntas:", "- Me conte sobre a última vez que você precisou realizar [tarefa].\n- O que foi mais difícil nesse processo?\n- Como você contorna esse problema atualmente?");

        const sep2 = rct(720, 1, C.line); body.appendChild(sep2); sep2.layoutAlign = "STRETCH";

        addSec("3. Aprofundamento (Solução / Protótipo)", "Caso haja um protótipo, apresente agora. Peça para o usuário pensar em voz alta.", true);
        addSec("Sugestões de perguntas:", "- O que você acha que essa tela faz?\n- Onde você clicaria para [ação]?\n- O que você esperava que acontecesse ao clicar ali?");

        const sep3 = rct(720, 1, C.line); body.appendChild(sep3); sep3.layoutAlign = "STRETCH";

        addSec("4. Encerramento", "Abra espaço para considerações finais e agradeça.", true);
        addSec("Sugestões de perguntas:", "- Há algo que não perguntei e que você gostaria de comentar?\n- Como você resumiria essa experiência?");
      }
      else if (msg.frameworkId === 'journey') {
        mainFrame = vb(1000, 0, 0, { r: 0.9686, g: 0.9804, b: 0.9804 }, 16); 
        mainFrame.name = "Jornada de Usuário";
        const hdr = mkHeader("Jornada de Usuário");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const body = hb(24, 24, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        const leftCol = vb(220, 0, 12, null);
        body.appendChild(leftCol);

        const mkL = (title, sub, h) => {
          const b = vb(220, 16, 4, C.white, 8);
          if(h) {
            b.counterAxisSizingMode = "FIXED";
            b.resize(220, h);
            b.primaryAxisSizingMode = "FIXED"; 
          }
          b.appendChild(tx(title, 16, "Bold", C.text));
          if(sub) b.appendChild(tx(sub, 12, "Regular", C.muted));
          return b;
        };

        const topBlock = mkL("Jornada", "Etapas da jornada");
        leftCol.appendChild(topBlock);
        leftCol.appendChild(mkL("Passos", "O que faz..."));
        leftCol.appendChild(mkL("Pensa e fala", "O que pensa e fala..."));
        leftCol.appendChild(mkL("Sentimentos", ""));
        leftCol.appendChild(mkL("Oportunidades", ""));
        leftCol.appendChild(mkL("Experiência", "", 240));

        const rightCol = hb(0, 12, null);
        body.appendChild(rightCol);
        rightCol.layoutAlign = "STRETCH";

        const numEtapas = 2; 
        for(let i=1; i<=numEtapas; i++) {
          const col = vb(330, 0, 12, null);
          col.layoutAlign = "STRETCH";
          
          const eTop = vb(null, 16, 4, { r: 0.1804, g: 0.7843, b: 0.9529 }, 8);
          eTop.layoutAlign = "STRETCH";
          eTop.appendChild(tx(i + ". Nome da Etapa", 16, "Bold", C.blueDark));
          eTop.appendChild(tx("Descrição (opcional)", 12, "Regular", C.blueDark));
          col.appendChild(eTop);

          const mkr = (val, h) => {
            const b = vb(null, 16, 4, C.white, 8);
            b.layoutAlign = "STRETCH";
            if(h) {
              b.counterAxisSizingMode = "FIXED"; 
              b.resize(330, h);
              b.primaryAxisSizingMode = "FIXED"; 
            }
            b.appendChild(tx(val, 13, "Regular", C.text));
            return b;
          };

          const s1 = mkr("1.1 Passo");
          const s2 = mkr("1.2 Passo");
          const wS = vb(null, 0, 8, null);
          wS.layoutAlign = "STRETCH";
          wS.appendChild(s1); wS.appendChild(s2);
          col.appendChild(wS);

          const wP = vb(null, 0, 8, null);
          wP.layoutAlign = "STRETCH";
          wP.appendChild(mkr("Pensamento")); wP.appendChild(mkr("Pensamento"));
          col.appendChild(wP);

          const wF = vb(null, 0, 8, null);
          wF.layoutAlign = "STRETCH";
          wF.appendChild(mkr("Sentimento")); wF.appendChild(mkr("Sentimento"));
          col.appendChild(wF);

          const wO = vb(null, 0, 8, null);
          wO.layoutAlign = "STRETCH";
          wO.appendChild(mkr("Oportunidade")); wO.appendChild(mkr("Oportunidade"));
          col.appendChild(wO);

          const expB = vb(null, 16, 4, null, 0); 
          expB.layoutAlign = "STRETCH";
          expB.counterAxisSizingMode = "FIXED";
          expB.resize(330, 240);
          expB.primaryAxisSizingMode = "FIXED";
          
          const line = rct(330, 1, C.muted);
          expB.appendChild(line); 
          line.layoutAlign = "STRETCH";
          
          col.appendChild(expB);

          rightCol.appendChild(col);
        }
      }
      else if (msg.frameworkId === 'relational-map') {
        mainFrame = vb(1000, 0, 0, C.white, 16);
        mainFrame.name = "Mapa Relacional";
        const hdr = mkHeader("Mapa Relacional");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const body = hb(40, 32, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        for (let i=0; i<4; i++) {
          const col = vb(200, 0, 16, null);
          
          const headB = vb(200, 12, 0, C.white, 4);
          headB.strokes = [{ type: "SOLID", color: C.blue }];
          headB.strokeWeight = 1.5;
          const ht = tx("Classifique, por temas gerais, os itens a serem agrupados abaixo", 10, "Bold", C.text);
          ht.textAlignHorizontal = "CENTER";
          ht.textAutoResize = "HEIGHT";
          ht.layoutAlign = "STRETCH";
          headB.appendChild(ht);
          col.appendChild(headB);

          for (let j=0; j<4; j++) {
            const card = vb(200, 16, 0, { r: 0.9216, g: 0.9451, b: 0.949 }, 8); 
            card.counterAxisSizingMode = "FIXED";
            card.resize(200, 100);
            card.primaryAxisSizingMode = "FIXED";
            
            const dot = ell(20, 20, j%2==0 ? C.teal : (j==1 ? C.blue : C.orange));
            card.appendChild(dot);
            
            col.appendChild(card);
          }

          body.appendChild(col);
        }
      }

      // â”€â”€ finalizar no canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (mainFrame) {
        const frameName = mainFrame.name;
        figma.currentPage.appendChild(mainFrame);

        const vp = figma.viewport.bounds;
        mainFrame.x = Math.round(vp.x + (vp.width  - mainFrame.width)  / 2);
        mainFrame.y = Math.round(vp.y + (vp.height - mainFrame.height) / 2);

        const grp = figma.group([mainFrame], figma.currentPage);
        grp.name = frameName;

        figma.currentPage.selection = [grp];
        figma.viewport.scrollAndZoomIntoView([grp]);
        figma.ui.postMessage({ type: 'framework-injected', name: msg.frameworkId });
        figma.notify("Framework inserido no canvas! âœ“");
      }
    })();
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MÓDULO: Spec Express — consulta rápida e efêmera de propriedades brutas
  // de elementos, sem conformidade DSC, sem persistência em handoffData.
  // Handler isolado: não chama nem é chamado por nenhuma função do scan de
  // tokens (scan-frame) ou de Anotar Specs (create-unified-spec). Ver
  // funções _qsExtractRaw/_qsBuildElementCard no final deste arquivo, e o
  // modo de captura por Shift+clique no listener de selectionchange (topo
  // do arquivo, _quickSpecCaptureModeActive).
  // ═══════════════════════════════════════════════════════════════════════
  // Início do modo de captura (2026-09-25): a modal de filtro já foi
  // confirmada no frontend, o plugin colapsa e o designer marca os
  // elementos no canvas com Shift+clique -- a seleção múltipla resultante é
  // espelhada em tempo real (ver listener de selectionchange acima), sem
  // nenhuma extração pesada ainda.
  if (msg.type === "start-quick-spec-capture") {
    _quickSpecCaptureModeActive = true;
    // O que já estava selecionado ao abrir a captura entra direto (2026-10-05,
    // pedido do Augusto) -- seleção feita antes é intenção explícita, não clique
    // de passagem. Camadas criadas pelo próprio Handex (cards, linhas) ficam
    // de fora. Shift+clique continua acrescentando a partir daí.
    const _ord = new Map(_hdSelectionOrder.map((id, i) => [id, i]));
    _quickSpecCaptureSelection = figma.currentPage.selection
      .filter(n => !(n.getPluginData && n.getPluginData('handexCategory')))
      .slice()
      .sort((a, b) => (_ord.has(a.id) ? _ord.get(a.id) : 1e9) - (_ord.has(b.id) ? _ord.get(b.id) : 1e9))
      .map(n => ({ nodeId: n.id, name: n.name, nodeType: n.type }));
    figma.ui.postMessage({ type: 'quick-spec-capture-count-changed', count: _quickSpecCaptureSelection.length });
    return;
  }

  // Cancelar a captura -- descarta a seleção corrente, sem rodar extração
  // nenhuma.
  if (msg.type === "stop-quick-spec-capture") {
    _quickSpecCaptureModeActive = false;
    _quickSpecCaptureSelection = [];
    return;
  }

  // "Concluir": encerra a captura e roda a extração pesada (propriedades +
  // snapshot) só agora, para toda a seleção marcada com Shift -- nunca
  // durante a seleção, pra não pesar enquanto o designer ainda está
  // escolhendo (pedido explícito do usuário). `msg.categories` vem
  // preservado do frontend desde a confirmação da modal de filtro (antes do
  // colapso).
  if (msg.type === "quick-spec-capture-finish") {
    _quickSpecCaptureModeActive = false;
    const accumulated = _quickSpecCaptureSelection.slice();
    _quickSpecCaptureSelection = [];
    if (accumulated.length === 0) {
      figma.ui.postMessage({ type: "quick-spec-result", error: "Nenhum elemento selecionado durante a captura." });
      return;
    }
    try {
      // _qsExtractRaw lê só o próprio nó marcado; o dedupe por nodeId
      // protege contra o mesmo id acumulado 2x na seleção.
      const seenIds = new Set();
      const elements = [];
      for (const acc of accumulated) {
        const node = await figma.getNodeByIdAsync(acc.nodeId);
        if (!node) continue;
        const found = await _qsExtractRaw(node, msg.categories);
        for (const el of found) {
          if (seenIds.has(el.nodeId)) continue;
          seenIds.add(el.nodeId);
          elements.push(el);
        }
      }
      // Sem snapshot por elemento (removido 2026-09-25, pedido do usuário)
      // -- a extração de propriedades sozinha é rápida o suficiente pra não
      // precisar de contador incremental nesta etapa; o loading genérico
      // (showLoadingModal, já disparado em _quickSpecCaptureFinish) cobre o
      // tempo de espera sem granularidade por elemento.
      figma.ui.postMessage({ type: "quick-spec-result", elements: elements });
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      console.error("Erro no Spec Express:", errMsg);
      figma.ui.postMessage({ type: "quick-spec-result", error: "Erro ao ler propriedades dos elementos: " + errMsg });
    }
    return;
  }

  // Sobe por node.parent (nunca findAll/varredura de página) até achar o
  // ancestral FRAME/COMPONENT/COMPONENT_SET de nível superior -- mesmo
  // critério de "frame de nível superior" já usado em
  // list-canvas-frames-for-ai (pai é a PAGE ou uma SECTION do Handex).
  // Usada só por quick-spec-insert-canvas pra ancorar o wrapper de cards
  // pela borda do FRAME, não do elemento individual (ver comentário no
  // handler). Retorna null se o nó for solto direto na página/Section, sem
  // nenhum ancestral desses tipos.
  function _qsFindTopLevelFrame(node) {
    const topLevelTypes = ['FRAME', 'COMPONENT', 'COMPONENT_SET'];
    let current = node;
    while (current && current.parent) {
      if (topLevelTypes.includes(current.type) && (current.parent.type === 'PAGE' || current.parent.type === 'SECTION')) {
        return current;
      }
      current = current.parent;
    }
    // Fallback: tela solta num GROUP/outro tipo direto na página -- usa o
    // ancestral mais alto, em vez do elemento (que cairia sobre a tela).
    current = node;
    while (current && current.parent && current.parent.type !== 'PAGE' && current.parent.type !== 'SECTION') {
      current = current.parent;
    }
    return (current && current.parent && current !== node) ? current : null;
  }

  if (msg.type === "quick-spec-insert-canvas") {
    // Um card por elemento (não mais 1 card por frame) -- cada card leva a
    // tag (A, B, C..., atribuída pelo frontend por sessão) e o snapshot
    // daquele elemento específico. Ver _qsBuildElementCard.
    try {
      const items = Array.isArray(msg.items) ? msg.items : [];
      if (items.length === 0) {
        figma.ui.postMessage({ type: "quick-spec-canvas-result", error: "Nada para inserir." });
        return;
      }
      const cards = [];
      const createdMap = [];
      let anchorX = null, anchorY = null, anchorFrameId = null;
      // Loading com contador na UI durante a criação (2026-09-25, pedido do
      // usuário): montar o card no canvas por elemento é o passo caro aqui
      // -- reporta progresso incremental pra UI não ficar sem feedback até
      // o fim do lote inteiro. Sem snapshot (removido 2026-09-25, pedido do
      // usuário) -- o card só traz nome/tipo/propriedades em texto.
      const totalToCreate = items.length;
      figma.ui.postMessage({ type: "quick-spec-canvas-progress", done: 0, total: totalToCreate });
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const node = item.nodeId ? await figma.getNodeByIdAsync(item.nodeId) : null;
        const card = await _qsBuildElementCard(item, node);
        if (anchorX === null && node && 'absoluteBoundingBox' in node && node.absoluteBoundingBox) {
          // Ancora pelo FRAME PRINCIPAL do elemento, não pelo elemento em si
          // (bug real reportado pelo usuário com print, 2026-09-28): o
          // elemento escaneado costuma estar no meio/topo de um frame de tela
          // inteira, então `elemento.x + elemento.width + 60` ainda cai
          // dentro da área horizontal do próprio frame documentado -- o
          // wrapper de cards nascia sobrepondo o frame em vez de nascer ao
          // lado. Usar a borda direita do frame ancestral resolve isso;
          // se não houver frame de nível superior identificável (nó solto
          // direto na página), cai de volta pro bounding box do elemento.
          const topFrame = _qsFindTopLevelFrame(node);
          const anchorBox = (topFrame && topFrame.absoluteBoundingBox) ? topFrame.absoluteBoundingBox : node.absoluteBoundingBox;
          anchorX = anchorBox.x + anchorBox.width + 60;
          anchorY = anchorBox.y;
          anchorFrameId = topFrame ? topFrame.id : node.id;
        }
        cards.push(card);
        // Devolve o par (elemento de origem -> card criado) pra UI saber
        // quais itens da lista já têm card no canvas -- é o que permite
        // perguntar "apagar do canvas também?" ao excluir da lista.
        createdMap.push({ sourceNodeId: item.nodeId || null, tag: item.tag, cardId: card.id });
        figma.ui.postMessage({ type: "quick-spec-canvas-progress", done: i + 1, total: totalToCreate });
      }
      // Cada card na ALTURA DO SEU ELEMENTO, numa coluna ao lado do frame
      // (2026-10-05, pedido do Augusto: na grade com Auto Layout as linhas se
      // misturavam). O centro do card mira o centro do elemento, então a linha
      // sai quase sempre reta e horizontal; quando dois cards colidem, o de
      // baixo desce o necessário (GAP). Cards de lotes anteriores do mesmo
      // frame também contam como ocupados. O wrapper é um frame SEM Auto
      // Layout, só para agrupar (ocultar/excluir em lote continuam iguais) e
      // deixar cada card livre para o designer mover.
      const GAP = 24;
      const vp = figma.viewport.bounds;
      const colX = anchorX !== null ? Math.round(anchorX) : Math.round(vp.x + vp.width / 2);
      const fallbackY = anchorY !== null ? anchorY : Math.round(vp.y + vp.height / 2);
      const cardWidth = cards.length > 0 ? Math.max(...cards.map(c => c.width)) : 280;

      const occupied = [];
      const _qsSection = figma.currentPage.children.find(n => n.type === 'SECTION' && n.getPluginData('handexCategorySection') === 'quickspec');
      if (_qsSection) {
        for (const n of _qsSection.children) {
          if (n.getPluginData('handexCategory') !== 'quickspec' || !('children' in n) || !n.absoluteBoundingBox) continue;
          let fid = n.getPluginData('handexQuickSpecFrameId');
          if (!fid) {
            const firstCard = n.children.find(c => c.getPluginData && c.getPluginData('handexQuickSpecSourceId'));
            const src = firstCard ? await figma.getNodeByIdAsync(firstCard.getPluginData('handexQuickSpecSourceId')) : null;
            const tf = src ? _qsFindTopLevelFrame(src) : null;
            fid = tf ? tf.id : (src ? src.id : '');
          }
          if (!anchorFrameId || fid !== anchorFrameId) continue;
          for (const c of n.children) {
            const bb = c.absoluteBoundingBox;
            if (bb && bb.x < colX + cardWidth && bb.x + bb.width > colX) occupied.push({ top: bb.y, bottom: bb.y + bb.height });
          }
        }
      }

      const desired = [];
      const centers = [];
      for (let i = 0; i < cards.length; i++) {
        const node = items[i].nodeId ? await figma.getNodeByIdAsync(items[i].nodeId) : null;
        const bb = node && node.absoluteBoundingBox;
        desired.push(bb ? bb.y + bb.height / 2 - cards[i].height / 2 : null);
        centers.push(bb ? bb.y + bb.height / 2 : null);
      }
      let _seqY = fallbackY;
      for (let i = 0; i < desired.length; i++) {
        if (desired[i] === null) { desired[i] = _seqY; centers[i] = _seqY + cards[i].height / 2; _seqY += cards[i].height + GAP; }
      }
      // Ordem dos cards na coluna = ordem das TAGS (A, B, C... = ordem dos
      // cliques), pedido do Augusto (2026-10-05): "A é o primeiro, B é o
      // segundo", e a ordem não muda quando um card cresce ou encolhe (filhos
      // diretos, observação). Cada card tenta a altura do seu elemento, mas
      // nunca sobe acima do card anterior. Se os cliques não seguirem a ordem
      // vertical dos elementos, linhas podem se cruzar -- a ordem das tags tem
      // precedência.
      const _tagIdx = t => { let n = -1; for (const ch of String(t || '')) n = (n + 1) * 26 + (ch.charCodeAt(0) - 65); return n; };
      const order = cards.map((_, i) => i).sort((x, y) => _tagIdx(items[x].tag) - _tagIdx(items[y].tag) || centers[x] - centers[y]);
      const placedY = new Array(cards.length);
      let _prevBottom = -Infinity;
      for (const i of order) {
        let y = Math.round(Math.max(desired[i], _prevBottom + GAP));
        const h = cards[i].height;
        let moved = true;
        while (moved) {
          moved = false;
          for (const o of occupied) {
            if (y < o.bottom + GAP && y + h + GAP > o.top) { y = Math.round(o.bottom + GAP); moved = true; }
          }
        }
        placedY[i] = y;
        _prevBottom = y + h;
        occupied.push({ top: y, bottom: y + h });
      }

      const minY = Math.min(...placedY);
      const maxY = Math.max(...placedY.map((y, i) => y + cards[i].height));
      const wrapper = figma.createFrame();
      wrapper.name = "Detalhar UI — Cards";
      wrapper.fills = [];
      wrapper.clipsContent = false;
      wrapper.resize(cardWidth, Math.max(1, maxY - minY));
      for (let i = 0; i < cards.length; i++) {
        wrapper.appendChild(cards[i]);
        cards[i].x = 0;
        cards[i].y = placedY[i] - minY;
      }
      figma.currentPage.appendChild(wrapper);
      wrapper.setPluginData('handexCategory', 'quickspec');
      if (anchorFrameId) wrapper.setPluginData('handexQuickSpecFrameId', anchorFrameId);
      _hdMoveToCategorySection(wrapper, 'quickspec');
      wrapper.x = colX;
      wrapper.y = minY;
      // Corrige qualquer deslocamento do pai (Section) para o wrapper ficar
      // exatamente na posição absoluta calculada.
      const _wbb = wrapper.absoluteBoundingBox;
      if (_wbb) { wrapper.x += colX - _wbb.x; wrapper.y += minY - _wbb.y; }

      // Linhas guia do lote, roteadas juntas para não se cruzarem
      // (ver _qsBuildBatchConnectors).
      const _qsPairs = [];
      for (let i = 0; i < cards.length; i++) {
        const node = items[i].nodeId ? await figma.getNodeByIdAsync(items[i].nodeId) : null;
        _qsPairs.push({ card: cards[i], node, tag: items[i].tag });
      }
      const { parts: markerParts, markers } = await _qsBuildBatchConnectors(_qsPairs);

      // Rede de segurança de z-order MANTIDA (2026-09-28) mesmo depois do
      // desvio geométrico acima -- o desvio cobre o caso comum (grid com gap
      // generoso), mas não há garantia geométrica de espaço suficiente pra
      // desviar quando um card obstruindo está colado perto demais do
      // elemento de origem (sem os 16px de margem cabendo). Nesse caso
      // residual a linha ainda poderia cruzar por cima do texto de um card;
      // manter os markers atrás do wrapper custa nada e evita esse resíduo
      // ser visível. Figma Plugin API não tem z-index -- ordem de
      // renderização é a ordem na lista de children do pai; reinserir cada
      // marker no índice 0 da Section empurra o wrapper pra frente de todos.
      const _qsSectionForOrder = wrapper.parent;
      if (_qsSectionForOrder && typeof _qsSectionForOrder.insertChild === 'function') {
        for (const part of markerParts) {
          try { _qsSectionForOrder.insertChild(0, part); } catch (e) {}
        }
      }

      figma.currentPage.selection = [wrapper, ...markers];
      figma.viewport.scrollAndZoomIntoView([wrapper, ...markers]);
      figma.ui.postMessage({ type: "quick-spec-canvas-result", count: cards.length, created: createdMap });
      figma.notify(cards.length > 1 ? `${cards.length} cards de Detalhar UI inseridos no canvas ✓` : "Card de Detalhar UI inserido no canvas ✓");
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      console.error("Erro ao inserir card do Spec Express:", errMsg);
      figma.ui.postMessage({ type: "quick-spec-canvas-result", error: "Erro ao criar o card: " + errMsg });
    }
    return;
  }

  // Reconstrói a lista da UI a partir do CANVAS (2026-09-25, pedido do
  // usuário: "as specs express quando o plugin recarrega não ficam
  // armazenadas, aí não consigo apagar itens que foram injetados pelo
  // plugin") -- a sessão em memória (_quickSpecSessionResults) é
  // deliberadamente efêmera (decisão de produto), mas isso deixava órfão
  // qualquer card já inserido antes de um reload: sem saber que ele existe,
  // o designer não tinha como excluí-lo (nem a lista, nem o card) pela UI.
  // Devolve o ESSENCIAL gravado por pluginData em cada card (tag, nome,
  // tipo, sourceId, o próprio cardId) e, desde 2026-09-29, também as
  // PROPRIEDADES escaneadas (cor, spacing etc.), gravadas em
  // 'handexQuickSpecProperties' por _qsBuildElementCard -- não é mais
  // preciso re-ler cada elemento de origem. Cards legados (criados antes
  // dessa mudança) nunca tiveram essa chave gravada: `properties` volta
  // `null` nesse caso, mesmo comportamento de antes ("não disponível" na
  // UI); array vazio é resultado legítimo (nó sem props na categoria
  // filtrada) e é distinto de `null` -- a UI já sabe diferenciar os dois.
  if (msg.type === "quick-spec-list-canvas-cards") {
    const cards = [];
    const quickSpecSection = figma.currentPage.children.find(n => n.type === 'SECTION' && n.getPluginData('handexCategorySection') === 'quickspec');
    if (quickSpecSection) {
      quickSpecSection.children.forEach(wrapper => {
        if (wrapper.getPluginData('handexCategory') !== 'quickspec' || !('children' in wrapper)) return;
        wrapper.children.forEach(card => {
          const tag = card.getPluginData('handexQuickSpecTag');
          if (!tag) return;
          const rawProperties = card.getPluginData('handexQuickSpecProperties');
          cards.push({
            cardId: card.id,
            tag,
            name: card.getPluginData('handexQuickSpecName') || card.name,
            nodeType: card.getPluginData('handexQuickSpecNodeType') || '',
            sourceNodeId: card.getPluginData('handexQuickSpecSourceId') || null,
            properties: rawProperties ? JSON.parse(rawProperties) : null,
            note: card.getPluginData('handexQuickSpecNote') || '',
            childrenData: (() => { try { const r = card.getPluginData('handexQuickSpecChildren'); return r ? JSON.parse(r) : null; } catch (e) { return null; } })()
          });
        });
      });
    }
    figma.ui.postMessage({ type: 'quick-spec-canvas-cards-list', cards });
    return;
  }

  if (msg.type === "quick-spec-read-children") {
    try {
      const node = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : null;
      if (!node) {
        figma.ui.postMessage({ type: 'quick-spec-children-read', tag: msg.tag, error: 'Elemento não encontrado no canvas.' });
        return;
      }
      // Mais de QS_CHILDREN_MAX camadas e ainda sem decisão: pergunta antes
      // de ler (2026-10-08) -- só conta, nada é lido.
      const _visibleNodes = ('children' in node) ? node.children.filter(c => c.visible !== false) : [];
      const _visible = _visibleNodes.length;
      if (typeof msg.limit !== 'number' && _visible > QS_CHILDREN_MAX) {
        const _names = _visibleNodes.slice(0, 300).map((c, i) => ({ n: String(c.name || c.type), t: c.type, std: i < QS_CHILDREN_MAX, full: i < QS_CHILDREN_HARD_MAX }));
        figma.ui.postMessage({ type: 'quick-spec-children-read', tag: msg.tag, needsDecision: true, total: _visible, defaultLimit: QS_CHILDREN_MAX, max: QS_CHILDREN_HARD_MAX, layers: _names, layersMore: Math.max(0, _visible - _names.length) });
        return;
      }
      const { children, more } = await _qsReadDirectChildren(node, msg.categories, msg.limit);
      figma.ui.postMessage({ type: 'quick-spec-children-read', tag: msg.tag, children, more });
    } catch (e) {
      figma.ui.postMessage({ type: 'quick-spec-children-read', tag: msg.tag, error: 'Não foi possível ler as camadas internas: ' + (e && e.message || e) });
    }
    return;
  }

  // Liga/desliga o bloco "Filhos diretos" num card que já está no canvas,
  // sem recriar o card (mesmo padrão da Observação).
  if (msg.type === "quick-spec-update-children") {
    const card = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : null;
    if (!card || card.removed || card.type !== 'FRAME' || !card.getPluginData('handexQuickSpecTag')) {
      figma.ui.postMessage({ type: 'toast', message: 'Card da anotação não encontrado no canvas.', kind: 'error' });
      return;
    }
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    const old = card.children.find(c => (c.name === "Camadas internas" || c.name === "Filhos diretos") && c.type === 'FRAME');
    if (old) old.remove();
    if (Array.isArray(msg.children)) {
      const block = _qsBuildChildrenBlock(msg.children, msg.more || 0);
      const noteIdx = card.children.findIndex(c => c.name === "Observação" && c.type === 'FRAME');
      if (noteIdx >= 0) card.insertChild(noteIdx, block); else card.appendChild(block);
      _hdSetFillAndHug(block);
      card.setPluginData('handexQuickSpecChildren', JSON.stringify({ children: msg.children, more: msg.more || 0 }));
    } else {
      card.setPluginData('handexQuickSpecChildren', '');
    }
    await _qsResolveCardOverlaps(card);
    return;
  }

  if (msg.type === "quick-spec-update-note") {
    const card = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : null;
    const note = _qsNormalizeNote(msg.note);
    if (!card || card.removed || card.type !== 'FRAME' || !card.getPluginData('handexQuickSpecTag')) {
      figma.ui.postMessage({ type: 'quick-spec-note-updated', nodeId: msg.nodeId || null, error: 'Card não encontrado no canvas.' });
      return;
    }
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
    const existing = card.children.find(c => c.name === "Observação" && c.type === 'FRAME');
    if (!note) {
      if (existing) existing.remove();
    } else if (existing) {
      const body = existing.children.find(c => c.type === 'TEXT' && c.name === "Observação texto");
      if (body) body.characters = note;
    } else {
      _qsAppendNoteBlock(card, note);
    }
    card.setPluginData('handexQuickSpecNote', note);
    await _qsResolveCardOverlaps(card);
    figma.ui.postMessage({ type: 'quick-spec-note-updated', nodeId: card.id, note });
    return;
  }

  // Remove cards específicos do Spec Express do canvas (2026-09-25, pedido
  // do usuário): ao excluir um item da lista do plugin que já tem card
  // inserido, o designer é perguntado se quer apagar do canvas também.
  // Recebe os ids dos CARDS (não dos elementos de origem) -- a UI conhece
  // esse par desde a inserção (ver `created` em quick-spec-canvas-result).
  // Se o wrapper do lote ficar vazio depois das remoções, ele também sai:
  // um frame de Auto Layout vazio no canvas é lixo visual, não organização.
  if (msg.type === "quick-spec-delete-canvas-cards") {
    const ids = Array.isArray(msg.cardIds) ? msg.cardIds : [];
    let removed = 0;
    const touchedWrappers = new Set();
    // Bug real de performance corrigido (2026-09-25, reportado pelo
    // usuário: "está completamente lento... quando mando apagar, ele
    // trava"): a versão original usava figma.currentPage.findAll, uma
    // varredura RECURSIVA de toda a árvore da página (pode ter milhares de
    // nós num arquivo real de produto) -- e pior, rodava DENTRO do loop, uma
    // vez por card apagado. Os marcadores soltos do Spec Express já vivem
    // só dentro da Section "Handex | Spec Express" (ver
    // _qsBuildConnectorForCard/_hdMoveToCategorySection), então a busca não
    // precisa nunca sair dali -- olha só os filhos DIRETOS dessa Section,
    // uma única vez, fora do loop.
    const idSet = new Set(ids);
    const markersByCard = new Map();
    if (idSet.size > 0) {
      const quickSpecSection = figma.currentPage.children.find(n => n.type === 'SECTION' && n.getPluginData('handexCategorySection') === 'quickspec');
      if (quickSpecSection) {
        quickSpecSection.children.forEach(n => {
          const cardId = n.getPluginData && n.getPluginData('handexQuickSpecMarkerFor');
          if (cardId && idSet.has(cardId)) {
            if (!markersByCard.has(cardId)) markersByCard.set(cardId, []);
            markersByCard.get(cardId).push(n);
          }
        });
      }
    }
    for (const id of ids) {
      try {
        const node = await figma.getNodeByIdAsync(id);
        if (!node) continue;
        const parent = node.parent;
        if (parent && parent.type === 'FRAME' && parent.getPluginData('handexCategory') === 'quickspec') {
          touchedWrappers.add(parent);
        }
        // Marcadores soltos (contour/Conector/DotInicio/DotFim, vinculados
        // por handexQuickSpecMarkerFor) ficam FORA do wrapper -- remover o
        // card sozinho não os leva junto (mesmo cuidado já aplicado nas
        // specs tradicionais, ver delete-canvas-content/handexSpecMarkerId).
        (markersByCard.get(id) || []).forEach(n => { try { n.remove(); } catch (e) {} });
        node.remove();
        removed++;
      } catch (e) { /* card já removido à mão pelo designer -- ignora */ }
    }
    touchedWrappers.forEach(w => {
      try { if (w.children.length === 0) w.remove(); } catch (e) {}
    });
    figma.ui.postMessage({ type: "quick-spec-canvas-cards-deleted", removed });
    if (removed > 0) figma.notify(removed > 1 ? `${removed} cards removidos do canvas ✓` : "Card removido do canvas ✓");
    return;
  }

  // Ocultar/exibir um card do Spec Express NO CANVAS (2026-09-28, pedido do
  // usuário) -- diferente de hide-node/show-node (specs tradicionais, um
  // marcador só via handexSpecMarkerId), aqui são 4 nós soltos vinculados
  // por handexQuickSpecMarkerFor (contour/Conector/DotInicio/DotFim, ver
  // _qsBuildConnectorForCard) -- reaproveita o mesmo critério de busca já
  // usado em quick-spec-delete-canvas-cards (filhos diretos da Section
  // "Handex | Spec Express", sem findAll recursivo). Só chamado pelo
  // frontend quando o elemento já tem card inserido (insertedCardId) --
  // card ainda não inserido não tem nada no canvas pra ocultar.
  if (msg.type === "quick-spec-toggle-visibility") {
    const cardId = msg.cardId;
    if (cardId) {
      const card = await figma.getNodeByIdAsync(cardId);
      if (card) {
        const targetVisible = msg.visible !== undefined ? msg.visible : !card.visible;
        card.visible = targetVisible;
        const quickSpecSection = figma.currentPage.children.find(n => n.type === 'SECTION' && n.getPluginData('handexCategorySection') === 'quickspec');
        if (quickSpecSection) {
          quickSpecSection.children.forEach(n => {
            if (n.getPluginData('handexQuickSpecMarkerFor') === cardId) n.visible = targetVisible;
          });
        }
      }
    }
    return;
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: Spec Express — funções isoladas, sem dependência de nenhum
// estado/closure do scan de tokens ou de Anotar Specs. Propositalmente
// duplica um subconjunto pequeno da extração de propriedades já usada em
// scan-frame (fills, tipografia, spacing, bordas, radius, effects, sizing,
// variants) -- SEM chamar audit()/auditProperty(): aqui não existe
// conformidade DSC, só o valor bruto e o nome do token quando houver
// (variável ou estilo vinculado). Ver decisão de produto: "Spec Express não
// audita, só consulta" -- nunca reintroduzir bateção contra o skeleton
// aqui, é isso que a separa da Escanear Tokens.
// ═══════════════════════════════════════════════════════════════════════

// Acha qual lib DSC publicou uma key (componentKey, key de variável ou de
// estilo) -- usa o mesmo skeleton já reconectado ao scan normal
// (_refSkeletonCache, populado sob demanda pela UI via _withRefSkeleton). PURA
// IDENTIFICAÇÃO DE ORIGEM, nunca julgamento: não existe aqui o conceito de
// "conforme"/"fora do padrão" -- só "essa key está publicada nesta lib" ou
// "não foi encontrada em nenhuma lib cadastrada" (pode ser variável local do
// arquivo, ou lib não sincronizada via refs:update). Reaproveita o mesmo
// índice de precedência priority > legacy/standalone do scan normal (ver
// audit.js) através de uma varredura simples, já que aqui o volume de
// lookups por card é pequeno (dezenas, não milhares) -- não justifica montar
// o índice completo de audit.js só para isso.
function _qsFindLibForKey(key) {
  if (!key || !_refSkeletonCache) return null;
  const libs = Array.isArray(_refSkeletonCache) ? _refSkeletonCache : [_refSkeletonCache];
  let found = null;
  for (const lib of libs) {
    if (!lib) continue;
    const inVariableKeys = Array.isArray(lib.variableKeys) && lib.variableKeys.some(v => v.key === key);
    const inComponentKeys = Array.isArray(lib.componentKeys) && lib.componentKeys.includes(key);
    const inStyles = lib.styleTokens && Object.values(lib.styleTokens).some(arr => Array.isArray(arr) && arr.some(s => s.key === key));
    if (inVariableKeys || inComponentKeys || inStyles) {
      const tierRank = lib.tier === 'priority' ? 2 : 1;
      if (!found || tierRank > found._rank) found = { name: lib.name, _rank: tierRank };
    }
  }
  return found ? found.name : null;
}

function _qsIsLegacyLibName(libName) {
  if (!libName || !_refSkeletonCache) return false;
  const libs = Array.isArray(_refSkeletonCache) ? _refSkeletonCache : [_refSkeletonCache];
  return libs.some(lib => lib && lib.name === libName && lib.tier === 'legacy');
}

// Categorias fixas oferecidas na modal de filtro (quick-spec-filters-modal,
// ver quick-spec.js) -- decisão de produto: lista genérica sempre igual,
// nunca calculada a partir de uma pré-leitura do frame. Se uma categoria
// marcada não existir naquele frame/elemento específico, ela simplesmente
// não aparece no resultado -- o filtro só reduz o que É perguntado, nunca
// gera linha vazia.
// 'component-props' (opcional, desmarcada por padrão na modal -- ver
// comentário em _qsExtractNodeProperties) fica fora desta lista de
// propósito: ela só é usada como FALLBACK quando `categories` vem vazio,
// e nesse caso o comportamento seguro é o mesmo padrão "sem ruído" da
// modal, não incluir a categoria que o designer teria que marcar à parte.
const QUICK_SPEC_CATEGORIES = ['dimensions', 'layout', 'spacing', 'fill', 'border', 'radius', 'effect', 'appearance', 'typography', 'component', 'devmode'];

// Extrai as propriedades brutas de UM nó, filtradas pelas categorias
// marcadas na modal -- sem auditoria, sem filtro de vetores/frames (o
// elemento marcado pelo designer é sempre lido, diferente do scan de
// tokens que filtra shapes primitivas e containers puros por não
// representarem conformidade DS). Cada prop devolve { label, value,
// tokenName, tokenKey, libName } -- libName só é preenchido quando tokenKey
// bate em alguma lib do skeleton (ver _qsFindLibForKey).
async function _qsExtractNodeProperties(n, categories) {
  if (!Array.isArray(categories) || categories.length === 0) return [];
  // Chamador fino do leitor único (_readNodeSpec, nível 'quick'). Mantém o
  // formato { label, value, tokenName, libName } e a ordem por categoria.
  // Nível COMPLETO do leitor (2026-10-08, pedido do Augusto): a Anotação traz
  // tudo o que o Dev Mode mostra no Inspect -- todos os fills (gradiente e
  // imagem inclusive), todas as bordas com posição/tracejado, raio por canto,
  // auto layout com alinhamento/wrap, min/max, posição absoluta, opacidade,
  // blend e o detalhe de texto. O designer tem licença de Dev Mode; o dev que
  // recebe a Anotação não precisa ter.
  const spec = await _readNodeSpec(n, { level: "full", propKeys: categories });
  const L = HD_GLOSSARY.labels;
  const by = {};
  spec.forEach(r => { by[r.key] = r; });
  const props = [];
  let curGroup = 'componente';
  const out = (label, value, tokenName, libName, group) => props.push({ label, value, tokenName: tokenName || null, libName: libName || null, group: group || curGroup });
  let typoDone = false, dimsDone = false;
  const TYPO_BASE = { textStyle: 1, fontFamily: 1, fontWeight: 1, fontSize: 1 };
  const order = ['component', 'dimensions', 'layout', 'spacing', 'fill', 'border', 'radius', 'effect', 'appearance', 'typography', 'component-props'];
  for (const r of _specSortByCat(spec, order)) {
    curGroup = _QS_GROUP_OF_CAT[r.cat] || 'componente';
    if (r.cat === "fill") {
      out(r.label, r.value, r.token, r.libName);
    } else if (r.cat === "typography") {
      if (!TYPO_BASE[r.key]) { out(r.label, r.value, r.token, r.libName); continue; }
      if (typoDone) continue;
      typoDone = true;
      const style = by.textStyle, size = by.fontSize;
      const family = by.fontFamily && by.fontFamily.raw.value ? by.fontFamily.raw.value : "Mixed";
      const fstyle = by.fontWeight && by.fontWeight.raw.value ? by.fontWeight.raw.value : "Mixed";
      const px = size && size.raw.value !== null ? ` (${size.raw.value}px)` : "";
      out(L.typography, `${family} ${fstyle}${px}`, (style && style.token) || (size && size.token), (style && style.libName) || (size && size.libName));
    } else if (r.cat === "spacing") {
      if (r.state !== "zero-token") out(r.label, r.value, r.token, r.libName);
    } else if (r.cat === "border") {
      if (r.state !== "zero-token") out(r.label, r.value, r.token, r.libName);
    } else if (r.cat === "radius") {
      out(r.label, r.value, r.token, r.libName);
    } else if (r.cat === "layout" || r.cat === "appearance") {
      out(r.label, r.value, r.token, r.libName);
    } else if (r.cat === "effect") {
      out(r.label, r.value, r.token, r.libName);
    } else if (r.cat === "dimensions") {
      if (dimsDone) continue;
      dimsDone = true;
      if (by.sizingW) out(L.sizingW, by.sizingW.value);
      if (by.sizingH) out(L.sizingH, by.sizingH.value);
      if (by.width && by.height) out(L.dimensions, `${Math.round(by.width.raw.value)} × ${Math.round(by.height.raw.value)}px`);
    } else if (r.cat === "component-props") {
      out(r.label, r.value);
    } else if (r.cat === "component") {
      out(L.component, r.value, null, r.libName);
    }
  }
  if (categories.includes("layout")) {
    for (const p of _qsLayoutGrids(n)) out(p.label, p.value, null, null, 'layout');
  }
  if (categories.includes("devmode")) {
    for (const p of await _qsDevModeExtras(n)) out(p.label, p.value, null, null, 'devmode');
  }
  if (categories.includes("css")) {
    const css = await _qsCssOf(n);
    if (css) out("CSS", css, null, null, 'css');
  }
  return props;
}

// Grupos de exibição (2026-10-08): organiza a lista plana em seções. Dado
// antigo sem `group` cai em 'outros' ("Propriedades").
const _QS_GROUP_OF_CAT = {
  component: 'componente', 'component-props': 'componente',
  dimensions: 'layout', layout: 'layout',
  spacing: 'espacamento',
  fill: 'aparencia', border: 'aparencia', radius: 'aparencia', effect: 'aparencia', appearance: 'aparencia',
  typography: 'texto'
};
const _QS_GROUP_ORDER = ['componente', 'layout', 'espacamento', 'aparencia', 'texto', 'devmode', 'css', 'outros'];
const _QS_GROUP_TITLE = { componente: 'Componente', layout: 'Layout', espacamento: 'Espaçamento', aparencia: 'Aparência', texto: 'Texto', devmode: 'Extras do Dev Mode', css: 'Código CSS', outros: 'Propriedades' };
function _qsGroupProps(props) {
  const buckets = {};
  for (const p of props || []) {
    const g = p && _QS_GROUP_TITLE[p.group] ? p.group : 'outros';
    (buckets[g] = buckets[g] || []).push(p);
  }
  return _QS_GROUP_ORDER.filter(g => buckets[g]).map(g => ({ group: g, title: _QS_GROUP_TITLE[g], props: buckets[g] }));
}

// Layout grids do frame (columns/rows/grid), como o Dev Mode lista.
function _qsLayoutGrids(n) {
  const res = [];
  try {
    if (!("layoutGrids" in n) || !Array.isArray(n.layoutGrids)) return res;
    n.layoutGrids.filter(g => g && g.visible !== false).forEach((g, i) => {
      let v;
      if (g.pattern === "GRID") v = `Grid ${g.sectionSize}px`;
      else {
        const kind = g.pattern === "COLUMNS" ? "Columns" : "Rows";
        const count = g.count === Infinity || g.count == null ? "Auto" : g.count;
        const parts = [`${kind} ${count}`, String(g.alignment || "").toLowerCase()];
        if (typeof g.gutterSize === "number") parts.push(`gutter ${_specPx(g.gutterSize)}`);
        if (typeof g.offset === "number" && g.alignment !== "CENTER") parts.push(`margin ${_specPx(g.offset)}`);
        if (typeof g.sectionSize === "number" && g.alignment !== "STRETCH") parts.push(`width ${_specPx(g.sectionSize)}`);
        v = parts.filter(Boolean).join(" · ");
      }
      res.push({ label: i === 0 ? "Layout grid" : `Layout grid ${i + 1}`, value: v });
    });
  } catch (e) {}
  return res;
}

// O que o Dev Mode mostra além das propriedades do Inspect (2026-10-08):
// anotações nativas do Dev Mode, descrição e links de documentação do
// componente, dev resources, modo de variável aplicado e export settings.
// Cada leitura isolada em try/catch: campo indisponível (lib remota, API
// fora do modo) só some, nunca quebra o card.
async function _qsDevModeExtras(n) {
  const res = [];
  const add = (label, value) => { if (value && String(value).trim()) res.push({ label, value: String(value).trim() }); };
  try {
    if (Array.isArray(n.annotations) && n.annotations.length) {
      let cats = null;
      try { cats = await figma.annotations.getAnnotationCategoriesAsync(); } catch (e) {}
      n.annotations.forEach((a, i) => {
        const cat = cats && a.categoryId ? (cats.find(c => c.id === a.categoryId) || {}).label : null;
        const txt = a.label || a.labelMarkdown || "";
        const pinned = Array.isArray(a.properties) && a.properties.length ? `\nPropriedades fixadas: ${a.properties.map(p => p.type).join(", ")}` : "";
        add(n.annotations.length > 1 ? `Anotação do Dev Mode ${i + 1}` : "Anotação do Dev Mode", `${cat ? "[" + cat + "] " : ""}${txt}${pinned}`);
      });
    }
  } catch (e) {}
  try {
    let comp = null;
    if (n.type === "INSTANCE") comp = await n.getMainComponentAsync();
    else if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") comp = n;
    if (comp) {
      const holder = comp.type === "COMPONENT" && comp.parent && comp.parent.type === "COMPONENT_SET" ? comp.parent : comp;
      add("Descrição do componente", holder.description || comp.description);
      const links = (holder.documentationLinks || []).concat(holder !== comp ? (comp.documentationLinks || []) : []).map(l => l && l.uri).filter(Boolean);
      if (links.length) add("Documentação do componente", Array.from(new Set(links)).join("\n"));
    }
  } catch (e) {}
  try {
    if (typeof n.getDevResourcesAsync === "function") {
      const dr = await n.getDevResourcesAsync();
      if (Array.isArray(dr) && dr.length) add("Dev resources", dr.map(d => d.name ? `${d.name}: ${d.url}` : d.url).join("\n"));
    }
  } catch (e) {}
  try {
    const modes = n.explicitVariableModes;
    if (modes && Object.keys(modes).length) {
      const lines = [];
      for (const [colId, modeId] of Object.entries(modes)) {
        try {
          const col = await figma.variables.getVariableCollectionByIdAsync(colId);
          const mode = col && (col.modes || []).find(m => m.modeId === modeId);
          if (col) lines.push(`${col.name}: ${mode ? mode.name : modeId}`);
        } catch (e) {}
      }
      add("Modo de variável", lines.join("\n"));
    }
  } catch (e) {}
  try {
    if (Array.isArray(n.exportSettings) && n.exportSettings.length) {
      add("Export", n.exportSettings.map(s => {
        const c = s.constraint;
        const scale = c ? (c.type === "SCALE" ? `${c.value}x` : `${c.type === "WIDTH" ? "W" : "H"} ${c.value}px`) : "";
        return [s.format, scale, s.suffix ? `sufixo "${s.suffix}"` : ""].filter(Boolean).join(" ");
      }).join("\n"));
    }
  } catch (e) {}
  return res;
}

// Código CSS exatamente como o painel Code do Dev Mode (getCSSAsync).
async function _qsCssOf(n) {
  try {
    if (typeof n.getCSSAsync !== "function") return null;
    const css = await n.getCSSAsync();
    const lines = Object.entries(css || {}).map(([k, v]) => `${k}: ${v};`);
    return lines.length ? lines.join("\n") : null;
  } catch (e) { return null; }
}

// Extrai só o PRÓPRIO nó marcado (sem descer na subárvore -- decisão de
// produto: a Rápida entrega o essencial do elemento marcado; quem quer os
// filhos marca os filhos também, e o aprofundamento vive na Detalhada).
// Devolve lista com 0 ou 1 item. `categories` vem da modal de filtro
// (quick-spec-filters-modal) -- nunca vazio (frontend garante ao menos 1
// categoria marcada antes de disparar o scan).
async function _qsExtractRaw(rootNode, categories) {
  const cats = (Array.isArray(categories) && categories.length > 0) ? categories : QUICK_SPEC_CATEGORIES;
  const elements = [];
  if (rootNode.visible === false) return elements;
  try {
    const props = await _qsExtractNodeProperties(rootNode, cats);
    if (props.length > 0) {
      elements.push({ nodeId: rootNode.id, name: rootNode.name, nodeType: rootNode.type, properties: props });
    }
  } catch (e) {
    console.error("Spec Express: erro ao ler nó", rootNode.name, e && e.message);
  }
  return elements;
}

// Monta UM card por ELEMENTO (não mais 1 card por frame com vários blocos
// dentro) -- pedido do usuário: cada elemento com propriedade encontrada
// precisa ser localizável e clicável de forma independente, com sua própria
// tag. O card em si NÃO é agrupado num GROUP com o conector (diferente das
// specs manuais) -- cada card já vive dentro do wrapper de grid (Auto
// Layout WRAP, ver quick-spec-insert-canvas), e um GROUP por cima quebraria
// essa distribuição. A linha guia até o elemento (contour+conector+dots) é
// montada à parte, depois que o card já tem posição definitiva -- ver
// _qsBuildConnectorForCard.
//
// `item` = { tag, name, nodeType, properties } -- sem snapshot (removido
// 2026-09-25, pedido do usuário: card só em texto). `node` é o nó real no
// canvas (pode ser null se o arquivo mudou entre o scan e a inserção --
// card nasce sem o botão de foco nesse caso, mas os dados textuais
// continuam válidos).
function _qsNormalizeNote(raw) {
  return typeof raw === 'string' ? raw.trim().slice(0, 280) : '';
}

// "Incluir filhos diretos" (2026-10-05, pedido do Augusto): opcional, por
// elemento, desligado por padrão. Lê SÓ o 1º nível de filhos visíveis, com
// teto de QS_CHILDREN_MAX -- nunca a subárvore (aprofundamento total é das
// Especificações). Filho sem nenhuma propriedade nas categorias marcadas não
// entra; `more` conta os filhos visíveis além do teto.
const QS_CHILDREN_MAX = 8;
// Escanear Frames (2026-10-08): níveis de camadas lidos por padrão e teto
// quando o designer escolhe escanear tudo.
const SCAN_DEPTH_DEFAULT = 8;
const SCAN_DEPTH_HARD_MAX = 20;
// Teto mesmo quando o designer escolhe ler mais (2026-10-08): cada camada traz
// a leitura completa do Dev Mode, e o card cresce no canvas.
const QS_CHILDREN_HARD_MAX = 30;
async function _qsReadDirectChildren(node, categories, limit) {
  const lim = Math.max(1, Math.min(QS_CHILDREN_HARD_MAX, typeof limit === 'number' ? limit : QS_CHILDREN_MAX));
  const cats = (Array.isArray(categories) && categories.length > 0) ? categories : QUICK_SPEC_CATEGORIES;
  if (!node || !('children' in node)) return { children: [], more: 0 };
  const visible = node.children.filter(c => c.visible !== false);
  const children = [];
  for (const c of visible.slice(0, lim)) {
    try {
      const props = await _qsExtractNodeProperties(c, cats);
      if (props.length > 0) children.push({ nodeId: c.id, name: c.name, nodeType: c.type, properties: props });
    } catch (e) {
      console.error("Anotações: erro ao ler camada interna", c.name, e && e.message);
    }
  }
  return { children, more: Math.max(0, visible.length - lim) };
}

function _qsSectionTitle(parent, title) {
  const t = _hdCreateText(title, 9, "Bold", { r: 0, g: 0.3608, b: 0.6627 });
  parent.appendChild(t); _hdSetFillAndHug(t);
  try { t.name = "Seção | " + title; } catch (e) {}
}

function _qsPropLines(parent, props, indent) {
  for (const sec of _qsGroupProps(props)) {
    _qsSectionTitle(parent, sec.title);
    _qsPropLinesFlat(parent, sec.props);
  }
}

function _qsPropLinesFlat(parent, props) {
  for (const prop of props || []) {
    const lbl = _hdVocabLabel(prop.label, prop.key);
    if (prop.tokenName) {
      const tokenColor = prop.libName ? { r: 0, g: 0.3608, b: 0.6627 } : { r: 0.1333, g: 0.1608, b: 0.1804 };
      const t = _hdCreateText(prop.libName ? `${lbl}: ${prop.tokenName}  ·  ${prop.libName}` : `${lbl}: ${prop.tokenName}`, 10, "Bold", tokenColor);
      parent.appendChild(t); _hdSetFillAndHug(t);
      const r = _hdCreateText(`↳ valor bruto: ${_hdVocabValue(prop.value)}`, 9.5, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
      parent.appendChild(r); _hdSetFillAndHug(r);
    } else {
      const t = _hdCreateText(`${lbl}: ${_hdVocabValue(prop.value)}`, 10, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
      parent.appendChild(t); _hdSetFillAndHug(t);
    }
  }
}

// Bloco "Filhos diretos" do card: um subgrupo por filho (nome + tipo e as
// mesmas linhas de propriedade do elemento). Inserido antes da Observação.
function _qsBuildChildrenBlock(children, more) {
  const block = _hdCreateFrame("VERTICAL", 0, 8, null);
  block.name = "Camadas internas";
  const label = _hdCreateText(`Camadas internas (${(children || []).length}${more > 0 ? ' de ' + ((children || []).length + more) : ''})`, 10, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
  block.appendChild(label); _hdSetFillAndHug(label);
  if (!children || children.length === 0) {
    const empty = _hdCreateText("Nenhuma camada interna com propriedade nas categorias marcadas.", 10, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
    block.appendChild(empty); _hdSetFillAndHug(empty);
  }
  for (const ch of children || []) {
    const sub = _hdCreateFrame("VERTICAL", 0, 2, null);
    sub.name = "Camada | " + ch.name;
    sub.paddingLeft = 10;
    sub.paddingTop = 4; sub.paddingBottom = 4;
    sub.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
    sub.strokeWeight = 0;
    try { sub.strokeLeftWeight = 2; } catch (e) {}
    block.appendChild(sub); _hdSetFillAndHug(sub);
    const head = _hdCreateText(`${ch.name}  ·  ${ch.nodeType || ''}`, 10, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
    sub.appendChild(head); _hdSetFillAndHug(head);
    _qsPropLines(sub, ch.properties, 0);
  }
  if (more > 0) {
    const m = _hdCreateText(`+${more} camada(s) interna(s) não lida(s). Para ver outra camada, anote-a separadamente.`, 9.5, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
    block.appendChild(m); _hdSetFillAndHug(m);
  }
  return block;
}

function _qsAppendNoteBlock(card, note) {
  const block = _hdCreateFrame("VERTICAL", 0, 2, null);
  block.name = "Observação";
  const label = _hdCreateText("Observação", 9, "Bold", { r: 0.3922, g: 0.4549, b: 0.4784 });
  label.layoutAlign = "STRETCH";
  label.textAutoResize = "HEIGHT";
  block.appendChild(label);
  const body = _hdCreateText(note, 10, "Regular", { r: 0.1333, g: 0.1608, b: 0.1804 });
  body.name = "Observação texto";
  body.layoutAlign = "STRETCH";
  body.textAutoResize = "HEIGHT";
  block.appendChild(body);
  card.appendChild(block);
  _hdSetFillAndHug(block);
  return block;
}

async function _qsBuildElementCard(item, node) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  const note = _qsNormalizeNote(item.note);

  const card = _hdCreateFrame("VERTICAL", 16, 10, { r: 1, g: 1, b: 1 });
  card.name = "Anotação " + item.tag + " | " + item.name;
  card.strokes = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
  card.strokeWeight = 1;
  card.cornerRadius = 12;
  card.resize(280, card.height || 100);
  card.counterAxisSizingMode = "FIXED";
  card.setPluginData('handexQuickSpecTag', item.tag);
  card.setPluginData('handexQuickSpecName', item.name);
  card.setPluginData('handexQuickSpecNodeType', item.nodeType || '');
  if (node) card.setPluginData('handexQuickSpecSourceId', node.id);
  card.setPluginData('handexQuickSpecProperties', JSON.stringify(item.properties || []));

  // Header: tag em destaque (badge) + nome/tipo do elemento
  const headerRow = _hdCreateFrame("HORIZONTAL", 0, 8, null);
  headerRow.layoutAlign = "STRETCH";
  headerRow.counterAxisAlignItems = "CENTER";

  const tagBadge = _hdCreateFrame("HORIZONTAL", 0, 0, { r: 0, g: 0.3608, b: 0.6627 });
  tagBadge.cornerRadius = 6;
  tagBadge.paddingLeft = 8; tagBadge.paddingRight = 8; tagBadge.paddingTop = 3; tagBadge.paddingBottom = 3;
  const tagText = _hdCreateText(item.tag, 11, "Bold", { r: 1, g: 1, b: 1 });
  tagBadge.appendChild(tagText);
  headerRow.appendChild(tagBadge);

  const nameCol = _hdCreateFrame("VERTICAL", 0, 0, null);
  const elName = _hdCreateText(item.name, 12, "Bold", { r: 0.1333, g: 0.1608, b: 0.1804 });
  elName.layoutAlign = "STRETCH";
  elName.textAutoResize = "HEIGHT";
  nameCol.appendChild(elName);
  const elType = _hdCreateText(item.nodeType, 9, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
  elType.layoutAlign = "STRETCH";
  elType.textAutoResize = "HEIGHT";
  nameCol.appendChild(elType);
  // appendChild ANTES de qualquer ajuste de sizing -- layoutGrow/
  // layoutSizingHorizontal só têm efeito depois que o nó já é filho de um
  // pai com Auto Layout (achado real 2026-09-25: setar layoutGrow num nó
  // órfão, como acontecia aqui antes, é ineficaz e deixa o frame nascer
  // encolhido em 1px assim que appendChild acontece depois, porque nenhuma
  // das duas API (legada layoutGrow / moderna layoutSizingHorizontal) tinha
  // rodado no contexto certo).
  headerRow.appendChild(nameCol);
  _hdSetFillAndHug(nameCol);
  card.appendChild(headerRow);

  const divider = figma.createRectangle();
  divider.resize(248, 1);
  divider.fills = [{ type: "SOLID", color: { r: 0.8157, g: 0.8784, b: 0.8902 } }];
  divider.layoutAlign = "STRETCH";
  card.appendChild(divider);

  if (!item.properties || item.properties.length === 0) {
    const empty = _hdCreateText("Nenhuma propriedade nas categorias marcadas.", 10, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
    empty.layoutAlign = "STRETCH";
    empty.textAutoResize = "HEIGHT";
    card.appendChild(empty);
  }

  for (const prop of _qsGroupProps(item.properties).flatMap(sec => [{ __title: sec.title }].concat(sec.props))) {
    if (prop.__title) { _qsSectionTitle(card, prop.__title); continue; }
    // Hierarquia: quando há token vinculado, ELE vem primeiro e em destaque
    // -- azul se a origem bateu numa lib DSC cadastrada (libName), cinza
    // mais escuro se o token existe mas a lib não foi identificada (ex:
    // variável local do arquivo, ou lib não sincronizada via refs:update).
    // O valor bruto vem logo abaixo, menor, como conferência -- itens
    // vindos de lib já têm a propriedade bem definida pelo token, então é
    // essa a informação que o dev deve consumir primeiro (pedido do
    // usuário 2026-09-25, com exemplo real de "[m3] Top app bar": o hex
    // bruto aparecia antes do token de cor, precisava ser o oposto). Sem
    // token, o valor bruto é a própria linha principal.
    if (prop.tokenName) {
      const tokenColor = prop.libName ? { r: 0, g: 0.3608, b: 0.6627 } : { r: 0.1333, g: 0.1608, b: 0.1804 };
      const _qsLbl = _hdVocabLabel(prop.label, prop.key);
      const tokenLine = prop.libName ? `${_qsLbl}: ${prop.tokenName}  ·  ${prop.libName}` : `${_qsLbl}: ${prop.tokenName}`;
      const tokenText = _hdCreateText(tokenLine, 10, "Bold", tokenColor);
      tokenText.layoutAlign = "STRETCH";
      tokenText.textAutoResize = "HEIGHT";
      card.appendChild(tokenText);

      const rawLine = `↳ valor bruto: ${_hdVocabValue(prop.value)}`;
      const rawText = _hdCreateText(rawLine, 9.5, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
      rawText.layoutAlign = "STRETCH";
      rawText.textAutoResize = "HEIGHT";
      card.appendChild(rawText);
    } else {
      const rawLine = `${_hdVocabLabel(prop.label, prop.key)}: ${_hdVocabValue(prop.value)}`;
      const propText = _hdCreateText(rawLine, 10, "Regular", { r: 0.3922, g: 0.4549, b: 0.4784 });
      propText.layoutAlign = "STRETCH";
      propText.textAutoResize = "HEIGHT";
      card.appendChild(propText);
    }
  }

  if (Array.isArray(item.children)) {
    card.setPluginData('handexQuickSpecChildren', JSON.stringify({ children: item.children, more: item.childrenMore || 0 }));
    const cb = _qsBuildChildrenBlock(item.children, item.childrenMore || 0);
    card.appendChild(cb);
    _hdSetFillAndHug(cb);
  }

  if (note) {
    card.setPluginData('handexQuickSpecNote', note);
    _qsAppendNoteBlock(card, note);
  }

  figma.currentPage.appendChild(card);
  card.setPluginData('handexCategory', 'quickspec');
  // Não move o card individual pra Section aqui -- o handler
  // quick-spec-insert-canvas agrupa todos os cards do lote num FRAME
  // wrapper (Auto Layout WRAP, grade de colunas), e é ESSE wrapper que
  // acaba sendo movido pra dentro da Section "Handex | Spec Express" (ver
  // _hdMoveToCategorySection lá) -- mover o card aqui e de novo lá
  // duplicaria/desfaria o reparenting sem necessidade.

  return card;
}

// Linha guia (contour tracejado no elemento + conector em cotovelo + dots)
// do card até o elemento de origem -- reaproveita o ESSENCIAL da
// arquitetura das specs tradicionais (createHandoffSpec, ver contour/
// Conector/DotInicio/DotFim acima no arquivo), mas simplificado: sem o
// sistema de empilhamento por letra/lado (a posição de cada card já é
// decidida pelo grid do Spec Express, não por uma lógica de anti-colisão
// própria) e sem GROUP amarrando conector+card (cada card aqui já vive
// dentro do wrapper de grid -- criar mais um GROUP por cima quebraria o
// Auto Layout WRAP que distribui os cards). O conector fica solto na
// página, vinculado ao card por pluginData (mesmo padrão
// handexSpecMarkerId/handexSpecMarkerFor), pra handlers futuros (focar/
// ocultar/excluir) poderem achar um a partir do outro caso precisem.
//
// `card` já tem posição ABSOLUTA final (chamado depois do wrapper.x/y
// setados e do Auto Layout WRAP já ter distribuído os cards). `node` é o
// elemento de origem no canvas (pode ser null se o arquivo mudou desde o
// scan -- nesse caso não há como desenhar a linha, e a função retorna null
// sem quebrar a criação do card). `obstacleBounds` é a lista de bounds
// absolutos de todo OUTRO card do lote (nem a origem nem o destino desta
// linha) -- usada pra desviar o cotovelo de vizinhos que estariam no
// caminho, ver _qsDetourAroundObstacles logo abaixo.
// Desvio geométrico do conector em cotovelo ao redor de cards vizinhos
// (2026-09-28, pedido do usuário -- reverte a tentativa anterior de resolver
// isso só com z-order/insertChild(0,...): o Augusto quer que a linha nunca
// passe por cima OU por trás de nenhum card, ela precisa contornar de
// verdade). `points` é o path já calculado por _orthogonalElbowPoints
// (lista ordenada de pontos, segmentos retos entre consecutivos). `obstacles`
// é a lista de bounds (x/y/width/height) de todo card do lote MENOS o de
// origem e o de destino desta linha (checados fora desta função).
//
// Teste segmento-retângulo: um segmento cruza um retângulo se qualquer um
// dos seus dois pontos cai dentro dele, OU se ele intersecta qualquer uma
// das 4 arestas do retângulo (caso o segmento atravesse de lado a lado sem
// nenhum ponto interno -- ex: passando reto por cima de um card mais
// estreito que o próprio segmento).
// Cards das Anotações ficam soltos no wrapper (sem Auto Layout, ver
// quick-spec-insert-canvas). Se um card cresce (observação nova), empurra para
// baixo os cards do mesmo lote que passaram a colidir e refaz a linha guia
// deles, para a linha continuar chegando no card.
async function _qsResolveCardOverlaps(card) {
  const wrapper = card.parent;
  if (!wrapper || wrapper.type !== 'FRAME' || wrapper.layoutMode !== 'NONE' || wrapper.getPluginData('handexCategory') !== 'quickspec') return;
  // Recalcula a coluna inteira (2026-10-08, pedido do Augusto): cada card
  // volta a mirar a altura do próprio elemento (centro com centro) e só desce
  // o necessário para não encostar no anterior. Assim, quando um card encolhe
  // (camadas internas desligadas, observação apagada), ele e os de baixo
  // voltam à posição original; quando cresce, os de baixo descem. A ordem é a
  // atual da coluna (ordem das tags). O quadro que agrupa os cards encolhe
  // junto e as linhas são refeitas.
  const GAP = 24;
  const wbb = wrapper.absoluteBoundingBox;
  if (!wbb) return;
  const cards = wrapper.children.slice().sort((a, b) => a.y - b.y);
  const targets = [];
  let prevBottom = -Infinity;
  for (const c of cards) {
    let home = wbb.y + c.y;
    const srcId = c.getPluginData('handexQuickSpecSourceId');
    const src = srcId ? await figma.getNodeByIdAsync(srcId) : null;
    const sbb = src && src.absoluteBoundingBox;
    if (sbb) home = sbb.y + sbb.height / 2 - c.height / 2;
    const y = Math.round(Math.max(home, prevBottom + GAP));
    targets.push(y);
    prevBottom = y + c.height;
  }
  const newMin = Math.min(...targets);
  const newMax = Math.max(...cards.map((c, i) => targets[i] + c.height));
  wrapper.y += newMin - wbb.y;
  cards.forEach((c, i) => { c.y = targets[i] - newMin; });
  wrapper.resize(wrapper.width, Math.max(1, newMax - newMin));
  const section = wrapper.parent;
  const ids = new Set(wrapper.children.map(c => c.id));
  if (section && 'children' in section) {
    section.children.slice().forEach(n => {
      if (n.getPluginData && ids.has(n.getPluginData('handexQuickSpecMarkerFor'))) { try { n.remove(); } catch (e) {} }
    });
  }
  const pairs = [];
  for (const c of wrapper.children) {
    const srcId = c.getPluginData('handexQuickSpecSourceId');
    const src = srcId ? await figma.getNodeByIdAsync(srcId) : null;
    if (src) pairs.push({ card: c, node: src, tag: c.getPluginData('handexQuickSpecTag') });
  }
  const { parts } = await _qsBuildBatchConnectors(pairs);
  const hidden = new Set(wrapper.children.filter(c => !c.visible).map(c => c.id));
  parts.forEach(n => { if (hidden.has(n.getPluginData('handexQuickSpecMarkerFor'))) n.visible = false; });
  if (section && typeof section.insertChild === 'function') {
    for (const part of parts) { try { section.insertChild(0, part); } catch (e) {} }
  }
}

function _qsSegmentIntersectsRect(p1, p2, rect) {
  const { x, y, width: w, height: h } = rect;
  const pointInRect = (p) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
  if (pointInRect(p1) || pointInRect(p2)) return true;

  const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  const segmentsIntersect = (a, b, c, d) =>
    ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);

  const corners = [
    { x, y }, { x: x + w, y },
    { x: x + w, y: y + h }, { x, y: y + h }
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(p1, p2, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}

// Verifica o path inteiro (lista de pontos) contra a lista de obstáculos e
// devolve os retângulos que de fato colidem com algum segmento -- vazio se
// o caminho direto já está livre (caso comum, grid com gap generoso).
function _qsPathObstacles(pathPoints, obstacles) {
  const hit = [];
  for (const rect of obstacles) {
    for (let i = 0; i < pathPoints.length - 1; i++) {
      if (_qsSegmentIntersectsRect(pathPoints[i], pathPoints[i + 1], rect)) {
        hit.push(rect);
        break;
      }
    }
  }
  return hit;
}

// Recalcula o path desviando por fora da união dos obstáculos colididos.
// Estratégia (cenário real: grid regular de cards com gap generoso, não
// obstáculos arbitrários) -- calcula a bounding box união de todos os cards
// no caminho, escolhe o lado mais curto a partir do ponto de saída (acima/
// abaixo se o desvio vertical for menor, esquerda/direita caso contrário) e
// insere 2 pontos de desvio (entrando e saindo da margem) antes de retomar
// o cotovelo original em direção ao ponto de entrada do destino. Mantém
// SEMPRE ângulos de 90° -- nunca diagonal.
function _qsDetourAroundObstacles(startPt, endPt, side, oppositeSide, obstacles) {
  // 40px -- valor de segurança pro caso de colisão REAL com card vizinho no
  // meio do caminho (raro; a maioria das linhas nunca aciona este desvio).
  // Era 16px (pedido anterior do Augusto: "com 16px o desvio ainda vinha
  // grudado no card"). Não confundir com QS_ELBOW_OFFSET_CARD (16px, ver
  // _qsBuildConnectorForCard) -- aquele é o offset de aproximação final no
  // ponto de entrada do card, medido contra o GRID_GAP (48px) do grid;
  // este é a margem de desvio ao redor de um obstáculo já detectado no
  // meio do trajeto, sem essa mesma restrição de espaço.
  const MARGIN = 40;
  const union = obstacles.reduce((acc, r) => ({
    x: Math.min(acc.x, r.x), y: Math.min(acc.y, r.y),
    right: Math.max(acc.right, r.x + r.width), bottom: Math.max(acc.bottom, r.y + r.height)
  }), { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity });
  union.width = union.right - union.x;
  union.height = union.bottom - union.y;

  const detourVertical = side === 'left' || side === 'right';
  // Distância até contornar por cima vs. por baixo (perpendicular a `side`)
  // a partir do ponto de saída -- escolhe o lado que produz o desvio mais
  // curto, evitando dar a volta inteira quando o card obstruindo está
  // encostado numa das bordas da união.
  let waypoints;
  if (detourVertical) {
    const distTop = Math.abs(startPt.y - (union.y - MARGIN));
    const distBottom = Math.abs((union.bottom + MARGIN) - startPt.y);
    const clearY = distTop <= distBottom ? union.y - MARGIN : union.bottom + MARGIN;
    waypoints = [
      { x: startPt.x, y: clearY },
      { x: endPt.x, y: clearY }
    ];
  } else {
    const distLeft = Math.abs(startPt.x - (union.x - MARGIN));
    const distRight = Math.abs((union.right + MARGIN) - startPt.x);
    const clearX = distLeft <= distRight ? union.x - MARGIN : union.right + MARGIN;
    waypoints = [
      { x: clearX, y: startPt.y },
      { x: clearX, y: endPt.y }
    ];
  }
  return [startPt, ...waypoints, endPt];
}

// Conta trechos do path que correm colineares SOBRE trechos já usados por
// outras linhas do lote (mesmo eixo, dentro de 2px, com interseção de
// comprimento > 1px). Cruzamento perpendicular não conta de propósito.
function _qsCountOverlaps(pathPoints, usedSegments) {
  const TOL = 2;
  let count = 0;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const a = pathPoints[i], b = pathPoints[i + 1];
    const horiz = Math.abs(a.y - b.y) < 0.01 && Math.abs(a.x - b.x) > 0.01;
    const vert = Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) > 0.01;
    if (!horiz && !vert) continue;
    for (const s of usedSegments) {
      if (s.horiz !== horiz) continue;
      const fixedA = horiz ? a.y : a.x;
      if (Math.abs(fixedA - s.fixed) >= TOL) continue;
      const lo = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      if (Math.min(hi, s.hi) - Math.max(lo, s.lo) > 1) { count++; break; }
    }
  }
  return count;
}

function _qsRecordSegments(pathPoints, usedSegments) {
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const a = pathPoints[i], b = pathPoints[i + 1];
    if (Math.abs(a.y - b.y) < 0.01 && Math.abs(a.x - b.x) > 0.01) {
      usedSegments.push({ horiz: true, fixed: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    } else if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) > 0.01) {
      usedSegments.push({ horiz: false, fixed: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
    }
  }
}

// Desloca, no eixo perpendicular, os trechos INTERMEDIÁRIOS do path (nunca o
// primeiro/último, que carregam startPt/endPt e os dots) que sobrepõem linhas
// já desenhadas. Só desloca segmento cujos dois vizinhos são perpendiculares
// a ele (senão a dobra viraria diagonal) e cujos vizinhos mantêm o sentido
// original (senão o stub de saída/entrada inverteria). Prioridade: nunca
// introduzir colisão com card -- candidato que aumenta colisões é descartado.
function _qsSeparateFromUsedLines(pathPoints, usedSegments, obstacleBounds) {
  const STEP = 8, MAX_TRIES = 8;
  const obstacles = obstacleBounds || [];
  let path = pathPoints;
  for (let i = 1; i < path.length - 2; i++) {
    const a = path[i], b = path[i + 1];
    const horiz = Math.abs(a.y - b.y) < 0.01;
    const vert = Math.abs(a.x - b.x) < 0.01;
    if (horiz === vert) continue;
    const prev = path[i - 1], next = path[i + 2];
    const prevPerp = horiz ? Math.abs(prev.x - a.x) < 0.01 : Math.abs(prev.y - a.y) < 0.01;
    const nextPerp = horiz ? Math.abs(next.x - b.x) < 0.01 : Math.abs(next.y - b.y) < 0.01;
    if (!prevPerp || !nextPerp) continue;
    const baseOverlaps = _qsCountOverlaps(path, usedSegments);
    if (baseOverlaps === 0) break;
    const baseHits = _qsPathObstacles(path, obstacles).length;
    const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
    const prevDir = sign(horiz ? a.y - prev.y : a.x - prev.x);
    const nextDir = sign(horiz ? next.y - b.y : next.x - b.x);
    let best = null;
    for (let t = 1; t <= MAX_TRIES; t++) {
      const d = (t % 2 === 1 ? 1 : -1) * STEP * Math.ceil(t / 2);
      const na = horiz ? { x: a.x, y: a.y + d } : { x: a.x + d, y: a.y };
      const nb = horiz ? { x: b.x, y: b.y + d } : { x: b.x + d, y: b.y };
      const newPrevDir = sign(horiz ? na.y - prev.y : na.x - prev.x);
      const newNextDir = sign(horiz ? next.y - nb.y : next.x - nb.x);
      if (newPrevDir !== prevDir || newNextDir !== nextDir) continue;
      const candidate = path.slice();
      candidate[i] = na;
      candidate[i + 1] = nb;
      if (_qsPathObstacles(candidate, obstacles).length > baseHits) continue;
      const ov = _qsCountOverlaps(candidate, usedSegments);
      if (ov < baseOverlaps) { best = candidate; break; }
    }
    if (best) path = best;
  }
  return path;
}

// Linhas de um lote em coluna (cards à direita do frame, cada um na altura
// do seu elemento ou empurrado para baixo). Garante que nenhuma linha cruze
// outra: ordenadas pela altura do elemento, as que precisam descer dobram em
// faixas verticais escalonadas -- a do elemento mais alto dobra mais perto
// dos cards, cada uma abaixo dobra um passo mais à esquerda. Como um card
// nunca fica acima do seu elemento e a ordem dos cards segue a dos
// elementos, essa regra elimina cruzamentos (2026-10-05, pedido do Augusto).
async function _qsBuildBatchConnectors(pairs) {
  const parts = [];
  const markers = [];
  const rows = [];
  for (const p of pairs) {
    const bb = p.node && (p.node.absoluteBoundingBox || p.node.absoluteRenderBounds);
    const cb = p.card.absoluteBoundingBox;
    if (!bb || !cb) continue;
    rows.push({ p, sy: bb.y + bb.height / 2, ey: cb.y + cb.height / 2, startX: bb.x + bb.width + 16, cardX: cb.x });
  }
  if (rows.length === 0) return { parts, markers };
  rows.sort((a, b) => a.sy - b.sy);
  const cardX = Math.min(...rows.map(r => r.cardX));
  const bendy = rows.filter(r => Math.abs(r.ey - r.sy) >= 1);
  const left = Math.max(...rows.map(r => r.startX)) + 16;
  const right = cardX - 16;
  const step = bendy.length > 0 ? Math.max(4, Math.min(12, (right - left) / (bendy.length + 1))) : 0;
  bendy.forEach((r, i) => { r.elbowX = Math.round(right - step * (i + 1)); });
  for (const r of rows) {
    const built = _qsBuildConnectorForCard(r.p.card, r.p.node, r.p.tag, [], 1, null, { elbowX: r.elbowX == null ? null : r.elbowX });
    if (built) { markers.push(built.marker); parts.push(...built.parts); }
  }
  return { parts, markers };
}

function _qsBuildConnectorForCard(card, node, tag, obstacleBounds, gridColumns, usedSegments, lane) {
  if (!node) return null;
  const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
  if (!bounds) return null;

  // Cinza neutro (slate-400, #94A3B8) a 50% de opacidade -- decisão estética
  // do usuário (2026-09-28) pra diferenciar visualmente o Spec Express
  // (rascunho/efêmero) da spec tradicional (registro definitivo, que
  // continua com a cor de marca azul). Só este módulo muda -- specifications.js
  // permanece intocado.
  const themeColor = { r: 148 / 255, g: 163 / 255, b: 184 / 255 };
  const THEME_OPACITY = 0.5;
  // Bug real corrigido (2026-09-25, reportado pelo usuário: "as linhas não
  // se conectam ao card"): card.x/card.y são RELATIVOS ao pai quando o nó
  // está dentro de um Auto Layout (o wrapper de grid, aqui) -- nunca
  // coordenadas absolutas de página. absoluteBoundingBox é o que reflete a
  // posição real na página independente do nível de aninhamento.
  const cardAbs = card.absoluteBoundingBox;
  const cardBounds = cardAbs
    ? { x: cardAbs.x, y: cardAbs.y, width: cardAbs.width, height: cardAbs.height }
    : { x: card.x, y: card.y, width: card.width, height: card.height };

  const contour = figma.createFrame();
  contour.name = 'Destaque';
  contour.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));
  figma.currentPage.appendChild(contour);
  contour.x = bounds.x - 16;
  contour.y = bounds.y - 16;
  contour.fills = [];
  contour.strokes = [{ type: "SOLID", color: themeColor, opacity: THEME_OPACITY }];
  contour.strokeWeight = 2;
  contour.dashPattern = [4, 4];
  contour.locked = true;
  contour.setPluginData('handexCategory', 'quickspec');

  // Lado de saída: eixo dominante entre o centro do elemento e o centro do
  // card (mesmo critério de _computeSideFromBounds nas specs tradicionais,
  // mas essa função vive dentro de outro closure/handler e não é acessível
  // aqui -- reimplementado localmente por isso, não por preferência).
  const elCx = bounds.x + bounds.width / 2, elCy = bounds.y + bounds.height / 2;
  const cardCx = cardBounds.x + cardBounds.width / 2, cardCy = cardBounds.y + cardBounds.height / 2;
  const dx = cardCx - elCx, dy = cardCy - elCy;
  const sourceSide = lane ? 'right' : (Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top'));
  const OPPOSITE_SIDE = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' };

  // Lado de ENTRADA no card -- não necessariamente o oposto de `sourceSide`
  // (2026-09-29, segunda rodada de correção: aumentar offset não resolveu,
  // print novo confirmou linha ainda colada em "Header content"/"Vector").
  // Causa raiz real: o wrapper nasce inteiro à direita do frame de origem
  // (anchorX = frame.x + frame.width + 60, ver quick-spec-insert-canvas) --
  // pra QUALQUER card do grid, a distância X até o elemento (que fica
  // dentro do frame, sempre longe do grid inteiro) tende a dominar sobre a
  // distância Y (a diferença de altura entre o elemento e aquela linha
  // específica do grid, tipicamente pequena) -- `sourceSide`/`side`
  // resolvia 'left'/'right' pra praticamente TODO card do lote, mesmo os
  // que não estão na primeira linha do grid. Com entrada horizontal
  // dominante, a linha atravessa o corredor ESTREITO entre colunas
  // (largura fixa = GRID_GAP, compartilhado por várias linhas do lote
  // simultaneamente) -- nenhum valor de offset resolve isso, porque o
  // problema é de ROTA (todo mundo espremido no mesmo corredor vertical
  // apertado), não de distância antes da dobra.
  // Quando o grid tem mais de 1 coluna, força entrada vertical (top/bottom)
  // no card -- ignora `dx` de propósito só pra essa decisão específica
  // (compara só elCy vs cardCy): dá à linha o corredor HORIZONTAL entre
  // linhas do grid (altura = GRID_GAP, mas sem concorrência de colunas
  // vizinhas tentando entrar no mesmo espaço). `_orthogonalElbowPoints` já
  // suporta lados de entrada/saída independentes (não precisam ser opostos
  // -- o ramo "eixos perpendiculares" cobre exatamente esse caso com 1
  // dobra); com 1 coluna o grid é uma pilha vertical pura e o comportamento
  // original (entrada sempre oposta à saída) é mantido, já que ali nunca
  // houve o sintoma reportado. Trade-off aceito: um card exatamente na
  // mesma linha do elemento (cardCy ~= elCy) também entra por cima/baixo em
  // vez de lateral direto -- 1 dobra a mais nesse caso pontual, mas nunca
  // reintroduz o corredor apertado entre colunas que causava o bug.
  const cardSide = lane ? 'left' : (gridColumns > 1)
    ? (cardCy >= elCy ? 'top' : 'bottom')
    : OPPOSITE_SIDE[sourceSide];

  // A linha nasce na BORDA DO CONTORNO (16px fora do elemento), não na borda
  // do elemento: não atravessa a área tracejada e a tag fica sobre o contorno,
  // no ponto de saída (2026-10-05, pedido do Augusto).
  const cb = { x: contour.x, y: contour.y, width: contour.width, height: contour.height };
  let startPt, endPt;
  if (sourceSide === 'right') {
    startPt = { x: cb.x + cb.width, y: cb.y + cb.height / 2 };
  } else if (sourceSide === 'left') {
    startPt = { x: cb.x, y: cb.y + cb.height / 2 };
  } else if (sourceSide === 'bottom') {
    startPt = { x: cb.x + cb.width / 2, y: cb.y + cb.height };
  } else {
    startPt = { x: cb.x + cb.width / 2, y: cb.y };
  }
  if (cardSide === 'left') {
    endPt = { x: cardBounds.x, y: cardBounds.y + cardBounds.height / 2 };
  } else if (cardSide === 'right') {
    endPt = { x: cardBounds.x + cardBounds.width, y: cardBounds.y + cardBounds.height / 2 };
  } else if (cardSide === 'top') {
    endPt = { x: cardBounds.x + cardBounds.width / 2, y: cardBounds.y };
  } else {
    endPt = { x: cardBounds.x + cardBounds.width / 2, y: cardBounds.y + cardBounds.height };
  }

  // Cotovelo ortogonal SEMPRE (2026-09-28, pedido do usuário) -- a curva
  // automática (detecção de cruzamento com o frame principal + Bézier
  // perpendicular) foi removida: mesmo desviando do frame de origem, a
  // curva ainda cruzava por cima do CARD de destino, que não entrava na
  // conta do cálculo. Cotovelo/aresta reta com _orthogonalElbowPoints
  // (mesma função das specs tradicionais, ver createHandoffSpec) desvia de
  // verdade, sem ambiguidade -- sempre sai reto na direção de `sourceSide` e
  // entra reto no card pelo lado calculado em `cardSide`.
  // Offset maior SÓ no Spec Express do lado do ELEMENTO DE ORIGEM
  // (2026-09-29, print real do usuário: comparando dois cards do mesmo
  // lote, o caso "bom" tinha um respiro visível antes da dobra final, o
  // "ruim" aparecia colado/abraçando a lateral do card). Isolado por
  // parâmetro (default 24 preservado para specs tradicionais e Fluxos de
  // Tela, que nunca tiveram esse problema reportado).
  //
  // Investigação de rodada seguinte (mesmo dia, 3 prints novos: linhas
  // ainda coladas em "user info"/"user content"/"info"/"name") apontou a
  // causa raiz real: QS_ELBOW_OFFSET=40 tinha sido aplicado nas DUAS pontas
  // (ver `_orthogonalElbowPoints`), mas só o lado do elemento de origem
  // tem espaço livre de sobra pra esse respiro -- o lado do CARD compete
  // pelo mesmo espaço físico do GRID_GAP do grid (48px, ver wrapper.
  // itemSpacing/counterAxisSpacing acima). Com offset=40 nos dois lados, a
  // coluna de trânsito do cotovelo final fica a só GRID_GAP-40=8px da
  // borda do card vizinho na mesma linha -- abaixo do detour por obstáculo
  // (que só age em colisão real, não em proximidade) e visualmente
  // imperceptível como respiro. QS_ELBOW_OFFSET_CARD=16 garante
  // GRID_GAP-16=32px de folga real (mesma margem de 16px já usada no
  // contour do elemento de origem, ver acima) sem tocar no respiro do lado
  // do elemento, que nunca teve essa restrição de grid.
  const QS_ELBOW_OFFSET = 40;
  const QS_ELBOW_OFFSET_CARD = 16;
  let qsPathPoints = [
    startPt,
    ..._orthogonalElbowPoints(
      { x: startPt.x, y: startPt.y, side: sourceSide },
      { x: endPt.x, y: endPt.y, side: cardSide },
      QS_ELBOW_OFFSET,
      QS_ELBOW_OFFSET_CARD
    ),
    endPt
  ];

  // Desvio de cards vizinhos (2026-09-28) -- checa o path direto contra todo
  // card do lote que não seja nem a origem nem o destino desta linha (já
  // filtrados em obstacleBounds pelo chamador). Se colidir, recalcula em
  // volta da união dos obstáculos atingidos e checa de novo (o desvio
  // sempre passa por fora da união inteira, então uma segunda rodada só
  // aconteceria por um obstáculo fora da união detectada na 1ª -- caso
  // extremo não esperado no cenário real de grid regular, mas a checagem
  // final abaixo é honesta: se ainda colidir, mantém o path desviado mesmo
  // assim, é sempre melhor que o direto). `_qsDetourAroundObstacles` só usa
  // `side` pra decidir a ORIENTAÇÃO do desvio (vertical se a saída for
  // lateral) -- `sourceSide` continua correto pra essa decisão mesmo com
  // `cardSide` independente.
  // Coluna de cards ao lado do frame (lane): rota fixa calculada pelo lote
  // inteiro em _qsBuildBatchConnectors -- sai reto, dobra na faixa vertical
  // própria desta linha e entra reto no card. Sem desvio nem separação
  // posterior, que reintroduziriam cruzamentos.
  if (lane) {
    qsPathPoints = (lane.elbowX == null || Math.abs(startPt.y - endPt.y) < 1)
      ? [startPt, { x: endPt.x, y: startPt.y }]
      : [startPt, { x: lane.elbowX, y: startPt.y }, { x: lane.elbowX, y: endPt.y }, endPt];
    if (Math.abs(startPt.y - endPt.y) < 1) endPt = { x: endPt.x, y: startPt.y };
  } else if (obstacleBounds && obstacleBounds.length > 0) {
    const hitRects = _qsPathObstacles(qsPathPoints, obstacleBounds);
    if (hitRects.length > 0) {
      qsPathPoints = _qsDetourAroundObstacles(startPt, endPt, sourceSide, cardSide, hitRects);
    }
  }

  if (usedSegments && !lane) {
    qsPathPoints = _qsSeparateFromUsedLines(qsPathPoints, usedSegments, obstacleBounds);
    _qsRecordSegments(qsPathPoints, usedSegments);
  }

  const qsSegs = qsPathPoints.map(p => `${p.x} ${p.y}`).join(' L ');
  const connectorPath = `M ${qsSegs}`;

  const connector = figma.createVector();
  connector.name = 'Conector';
  connector.strokes = [{ type: "SOLID", color: themeColor, opacity: THEME_OPACITY }];
  connector.strokeWeight = 1.5;
  connector.dashPattern = [4, 4];
  connector.strokeCap = "ROUND";
  figma.currentPage.appendChild(connector);
  connector.vectorPaths = [{ windingRule: "NONZERO", data: connectorPath }];
  connector.setPluginData('handexCategory', 'quickspec');
  connector.setPluginData('handexQuickSpecMarkerFor', card.id);

  // Tag (A, B, C...) no ponto de saída da linha, no lugar do dot de início
  // (2026-10-05, pedido do Augusto: no canto do contorno, em cinza a 50%, ela
  // quase não aparecia e ficava longe da linha, que costuma sair pela direita).
  // Preenchimento sólido no cinza de texto secundário da lib, texto branco.
  const _DOT_R = 4;
  const _CHIP = 24;
  const chip = figma.createFrame();
  chip.name = 'Tag';
  chip.layoutMode = "HORIZONTAL";
  chip.primaryAxisSizingMode = "FIXED";
  chip.counterAxisSizingMode = "FIXED";
  chip.resize(_CHIP, _CHIP);
  chip.cornerRadius = _CHIP / 2;
  chip.fills = [{ type: "SOLID", color: hexToRgb("#64747a") }];
  chip.strokes = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  chip.strokeWeight = 2;
  chip.strokeAlign = "OUTSIDE";
  chip.primaryAxisAlignItems = "CENTER";
  chip.counterAxisAlignItems = "CENTER";
  const chipText = figma.createText();
  chipText.fontName = { family: "Inter", style: "Bold" };
  chipText.fontSize = 11;
  chipText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  chipText.characters = tag;
  chip.appendChild(chipText);
  figma.currentPage.appendChild(chip);
  chip.x = startPt.x - _CHIP / 2;
  chip.y = startPt.y - _CHIP / 2;
  chip.locked = true;
  chip.setPluginData('handexCategory', 'quickspec');
  chip.setPluginData('handexQuickSpecMarkerFor', card.id);

  const endDot = figma.createEllipse();
  endDot.name = 'DotFim';
  endDot.resize(_DOT_R * 2, _DOT_R * 2);
  endDot.fills = [{ type: "SOLID", color: themeColor, opacity: THEME_OPACITY }];
  endDot.strokes = [];
  endDot.locked = true;
  figma.currentPage.appendChild(endDot);
  endDot.x = endPt.x - _DOT_R;
  endDot.y = endPt.y - _DOT_R;
  endDot.setPluginData('handexCategory', 'quickspec');
  endDot.setPluginData('handexQuickSpecMarkerFor', card.id);

  // Vínculo por pluginData -- mesmo padrão das specs tradicionais
  // (handexSpecMarkerId/handexSpecMarkerFor), pra handlers de
  // focar/ocultar/excluir conseguirem achar contour+conector+dots a partir
  // do card (ver quick-spec-delete-canvas-cards, que usa
  // handexQuickSpecMarkerFor pra limpar os 4 (contour+conector+2 dots)
  // junto quando o card é removido -- sem isso, ficariam órfãos no canvas).
  contour.setPluginData('handexQuickSpecMarkerFor', card.id);
  card.setPluginData('handexQuickSpecMarkerId', contour.id);

  // Mesma Section do wrapper (organização de canvas, ver
  // _hdMoveToCategorySection) -- marcadores soltos ficam soltos na
  // ÁRVORE (fora do wrapper/card, sem relação de parentesco), mas ainda
  // organizados dentro da Section "Handex | Spec Express" junto do resto.
  _hdMoveToCategorySection(contour, 'quickspec');
  _hdMoveToCategorySection(connector, 'quickspec');
  _hdMoveToCategorySection(chip, 'quickspec');
  _hdMoveToCategorySection(endDot, 'quickspec');

  // Ordem importa: o chamador reinsere cada parte no índice 0 da Section, então
  // a primeira da lista termina por cima das demais (tag acima da linha).
  return { marker: contour, parts: [chip, contour, connector, endDot] };
}


