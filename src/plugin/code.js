import { auditProperty, AUDIT_SCORE, AUDIT_THRESHOLDS, frameJsonTemplate, suggestClosestMatch } from './audit.js';

figma.showUI(__html__, { width: 480, height: 750 });

let activeHighlightNode = null;
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

figma.on('selectionchange', () => {
  const currentIds = figma.currentPage.selection.map(n => n.id);
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

// Reordena o specGroup recém-criado entre os demais grupos de spec da página
// para que a profundidade (z-order) siga a ordem hierárquica das tags, não a
// ordem de criação. Não afeta X/Y — só o índice na lista de filhos da página.
function _reorderSpecGroupByTag(specGroup, tag) {
  // handexCategory cobre specs novas (FRAME/GROUP); prefixo de nome cobre
  // specs legadas criadas antes dessa marcação existir.
  const siblings = figma.currentPage.children.filter(n =>
    n !== specGroup && (n.getPluginData('handexCategory') === 'spec' || n.name.startsWith('[Spec')));
  // Fallback = ficar no topo (equivalente ao appendChild padrão), não a contagem de
  // grupos — misturar essa contagem com índices reais de children (abaixo) empurraria
  // a spec para trás de conteúdo não-spec da página quando não há tag posterior.
  let insertIndex = figma.currentPage.children.length;
  for (let i = 0; i < siblings.length; i++) {
    const m = siblings[i].name.match(/^\[Spec \| ([A-Z]\d*(?:\.\d+)*) \| [a-z]+\] /);
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

// ─── Helpers de montagem da ficha de handoff ──────────────────────────────
// Extraídos do escopo de create-handoff/insert-frame-in-ficha/
// insert-flows-in-ficha (onde existiam como 3 cópias quase idênticas) para
// que os 3 handlers montem os mesmos cards a partir da mesma fonte -- sem
// isso, criar a ficha do zero e atualizar uma ficha existente podiam
// divergir silenciosamente conforme um dos 3 fosse editado sem replicar a
// mudança nos outros dois.
function _hdCreateText(text, size = 14, weight = "Regular", color = { r: 0.12, g: 0.16, b: 0.23 }) {
  const t = figma.createText();
  t.fontName = { family: "Inter", style: weight };
  t.characters = String(text || "");
  t.fontSize = size;
  t.fills = [{ type: "SOLID", color }];
  return t;
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
  section.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
  section.strokeWeight = 1;
  const title = _hdCreateText(titleText, 16, "Bold", { r: 0.24, g: 0.24, b: 1 });
  section.appendChild(title);
  _hdSetFillAndHug(title);
  return section;
}
function _hdCreateRow(parent, label, value) {
  const row = _hdCreateFrame("VERTICAL", 0, 4);
  row.name = `[Campo] ${label}`;
  parent.appendChild(row);
  _hdSetFillAndHug(row);
  const lbl = _hdCreateText(label, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
  row.appendChild(lbl);
  _hdSetFillAndHug(lbl);
  const val = _hdCreateText(value || "-", 14, "Regular", { r: 0.12, g: 0.16, b: 0.23 });
  row.appendChild(val);
  _hdSetFillAndHug(val);
  return row;
}

// Card de "Frame Documentado" (nome, badge "Novo componente", auditoria DSC).
// handexFrameId identifica o card entre gerações para permitir substituir em
// vez de duplicar quando a ficha já existe.
function _hdBuildFrameCard(f, fi) {
  const fRow = _hdCreateFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.99, b: 1 });
  fRow.name = `[Frame] ${f.nome || 'Frame ' + (fi + 1)}`;
  fRow.cornerRadius = 8;
  fRow.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.92, b: 0.96 } }];
  fRow.setPluginData('handexFrameId', f.figmaId || f.id || '');
  const fHeader = _hdCreateFrame("HORIZONTAL", 0, 8);
  fHeader.counterAxisAlignItems = "CENTER";
  const fName = _hdCreateText(f.nome || 'Frame', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
  fName.layoutGrow = 1;
  fHeader.appendChild(fName);
  if (f.isNewComponent) {
    const badge = _hdCreateFrame("HORIZONTAL", 8, 3, { r: 0.94, g: 0.92, b: 1.0 });
    badge.cornerRadius = 999;
    badge.strokes = [{ type: "SOLID", color: { r: 0.70, g: 0.60, b: 0.96 } }];
    badge.strokeWeight = 1;
    badge.appendChild(_hdCreateText("Novo componente", 9, "Medium", { r: 0.38, g: 0.18, b: 0.78 }));
    fHeader.appendChild(badge);
  }
  fRow.appendChild(fHeader);
  _hdSetFillAndHug(fHeader);
  if (f.audit && f.audit.status) {
    _hdCreateRow(fRow, "Auditoria DSC", f.audit.status + (f.audit.justificativa ? ' — ' + f.audit.justificativa : ''));
  }
  return fRow;
}

// Subgrupo de medidas de 1 frame. handexFrameId identifica o subgrupo entre
// gerações.
function _hdBuildMeasuresSubgroup(f) {
  const fGroup = _hdCreateFrame("VERTICAL", 0, 6);
  fGroup.name = `[Medidas | ${f.figmaId || f.id}] ${f.nome || 'Frame'}`;
  fGroup.setPluginData('handexFrameId', f.figmaId || f.id || '');
  const fLabel = _hdCreateText(f.nome || 'Frame', 10, "Bold", { r: 0.27, g: 0.45, b: 0.78 });
  fGroup.appendChild(fLabel);
  _hdSetFillAndHug(fLabel);
  f.measurements.forEach(m => {
    const details = Array.isArray(m.details) ? m.details.join(' | ') : (m.details || '');
    const mRow = _hdCreateFrame("HORIZONTAL", 10, 7, { r: 0.94, g: 0.97, b: 1 });
    mRow.name = `[Medida] ${m.name || 'Medida'}`;
    mRow.cornerRadius = 6;
    mRow.counterAxisAlignItems = "CENTER";
    fGroup.appendChild(mRow);
    _hdSetFillAndHug(mRow);
    const mName = _hdCreateText(m.name || 'Medida', 11, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
    mName.layoutGrow = 1;
    mRow.appendChild(mName);
    const mVal = _hdCreateText(details, 10, "Regular", { r: 0.27, g: 0.45, b: 0.78 });
    mRow.appendChild(mVal);
    _hdSetFillAndHug(mVal);
  });
  return fGroup;
}

// Subgrupo de especificações anotadas de 1 frame (ou de specs avulsas, com
// f.nome === 'Sem frame vinculado'). handexFrameId identifica o subgrupo
// entre gerações; specs avulsas usam a chave fixa '__loose__' (setada pelo
// chamador) já que não têm frame.figmaId real.
async function _hdBuildSpecsSubgroup(f) {
  const fGroup = _hdCreateFrame("VERTICAL", 0, 10);
  fGroup.name = `[Specs] ${f.nome || 'Frame'}`;
  fGroup.setPluginData('handexFrameId', f.figmaId || f.id || '');
  const fLabel = _hdCreateText(f.nome || 'Frame', 10, "Bold", { r: 0.27, g: 0.45, b: 0.78 });
  fGroup.appendChild(fLabel);
  _hdSetFillAndHug(fLabel);

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
    const groupColor = groupSpecs[0]?.color ? hexToRgb(groupSpecs[0].color) : { r: 0.38, g: 0.35, b: 0.75 };
    const groupNameText = groupNames[letter] || '';

    const gBox = _hdCreateFrame("VERTICAL", 0, 6);
    gBox.name = `[Grupo/${letter}] ${groupNameText || letter}`;
    fGroup.appendChild(gBox);
    _hdSetFillAndHug(gBox);

    const gHeader = _hdCreateFrame("HORIZONTAL", 0, 6);
    gHeader.counterAxisAlignItems = "CENTER";
    gBox.appendChild(gHeader);
    _hdSetFillAndHug(gHeader);
    const gBadge = _hdCreateFrame("HORIZONTAL", 0, 0, groupColor);
    gBadge.resize(18, 18);
    gBadge.cornerRadius = 4;
    gBadge.primaryAxisAlignItems = "CENTER";
    gBadge.counterAxisAlignItems = "CENTER";
    gHeader.appendChild(gBadge);
    const gBadgeT = figma.createText();
    gBadgeT.fontName = { family: "Inter", style: "Bold" };
    gBadgeT.fontSize = 9;
    gBadgeT.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    gBadgeT.characters = letter;
    gBadgeT.textAutoResize = "WIDTH_AND_HEIGHT";
    gBadge.appendChild(gBadgeT);
    if (groupNameText) {
      const gName = _hdCreateText(groupNameText, 10, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
      gHeader.appendChild(gName);
      _hdSetFillAndHug(gName);
    }
    const gCount = _hdCreateText(`${groupSpecs.length} esp.`, 9, "Regular", { r: 0.55, g: 0.6, b: 0.65 });
    gHeader.appendChild(gCount);
    _hdSetFillAndHug(gCount);

    const gSpecs = _hdCreateFrame("VERTICAL", 0, 4);
    gSpecs.fills = [];
    gBox.appendChild(gSpecs);
    _hdSetFillAndHug(gSpecs);

    for (const s of groupSpecs) {
      const catLabel = s.type || s.categoryLabel || s.category || 'Geral';
      const sc = s.color ? hexToRgb(s.color) : { r: 0.38, g: 0.35, b: 0.75 };
      const scBg = s.fillColor ? hexToRgb(s.fillColor) : { r: 1 - (1 - sc.r) * 0.12, g: 1 - (1 - sc.g) * 0.12, b: 1 - (1 - sc.b) * 0.12 };
      const sRow = _hdCreateFrame("VERTICAL", 10, 8, { r: 0.97, g: 0.97, b: 1 });
      sRow.name = `[Spec/${s.letter || 'A'}] ${s.name || s.label || 'Spec'}`;
      sRow.cornerRadius = 8;
      sRow.strokes = [{ type: "SOLID", color: sc }];
      gSpecs.appendChild(sRow);
      _hdSetFillAndHug(sRow);
      const sTop = _hdCreateFrame("HORIZONTAL", 0, 6);
      sTop.counterAxisAlignItems = "CENTER";
      sRow.appendChild(sTop);
      _hdSetFillAndHug(sTop);
      const sName = _hdCreateText(s.name || s.label || 'Spec', 11, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
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
      sCatTag.cornerRadius = 999;
      sCatTag.strokes = [{ type: "SOLID", color: sc }];
      sCatTag.strokeWeight = 1;
      sTop.appendChild(sCatTag);
      _hdSetFillAndHug(sCatTag);
      sCatTag.appendChild(_hdCreateText(catLabel, 9, "Medium", sc));
      if (s.note) {
        const sNote = _hdCreateText(s.note, 10, "Regular", { r: 0.4, g: 0.45, b: 0.55 });
        sRow.appendChild(sNote);
        _hdSetFillAndHug(sNote);
      }
      const _props = s.properties || [];
      if (_props.length > 0) {
        const propsFrame = _hdCreateFrame("VERTICAL", 0, 3);
        propsFrame.fills = [];
        _hdSetFillAndHug(propsFrame);
        sRow.appendChild(propsFrame);
        _props.forEach(prop => {
          const pRow = _hdCreateFrame("HORIZONTAL", 8, 4, { r: 0.93, g: 0.95, b: 1 });
          pRow.cornerRadius = 4;
          pRow.counterAxisAlignItems = "CENTER";
          _hdSetFillAndHug(pRow);
          propsFrame.appendChild(pRow);
          const pKey = _hdCreateText(prop.label || prop.key || '', 9, "Regular", { r: 0.35, g: 0.4, b: 0.5 });
          pKey.layoutGrow = 1;
          pRow.appendChild(pKey);
          if (prop.token) {
            const tBadge = _hdCreateText(prop.token, 8, "Medium", { r: 0.24, g: 0.24, b: 1 });
            _hdSetFillAndHug(tBadge);
            pRow.appendChild(tBadge);
          }
          const pVal = _hdCreateText(String(prop.value || ''), 9, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          _hdSetFillAndHug(pVal);
          pRow.appendChild(pVal);
        });
      }
      const _excs = s.excecoes || [];
      if (_excs.length > 0) {
        const excFrame = _hdCreateFrame("VERTICAL", 0, 4);
        excFrame.fills = [];
        _hdSetFillAndHug(excFrame);
        sRow.appendChild(excFrame);
        _excs.forEach(exc => {
          const eRow = _hdCreateFrame("VERTICAL", 6, 2, { r: 1, g: 0.97, b: 0.92 });
          eRow.cornerRadius = 4;
          eRow.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.55, b: 0.13 } }];
          eRow.strokeWeight = 1;
          _hdSetFillAndHug(eRow);
          excFrame.appendChild(eRow);
          const eTitle = _hdCreateText(`${exc.tipo || 'Exceção'}${exc.titulo ? ' — ' + exc.titulo : ''}`, 9, "Bold", { r: 0.7, g: 0.4, b: 0.05 });
          eRow.appendChild(eTitle);
          _hdSetFillAndHug(eTitle);
          if (exc.obs) {
            const eObs = _hdCreateText(exc.obs, 9, "Regular", { r: 0.5, g: 0.45, b: 0.35 });
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
const _HD_FLOW_TYPE_LABEL = { line_solid: 'Linha sólida', line_dashed: 'Linha tracejada', diamond: 'Decisão', diamond_dashed: 'Decisão tracejada', event_start: 'Início', event_end: 'Fim', gateway_parallel: 'Paralelo' };
function _hdBuildFlowCard(flow, fi) {
  const fRow = _hdCreateFrame("VERTICAL", 12, 10, { r: 0.97, g: 0.96, b: 1 });
  fRow.name = `[Fluxo] ${flow.name || 'Fluxo ' + (fi + 1)}`;
  fRow.cornerRadius = 8;
  fRow.strokes = [{ type: "SOLID", color: { r: 0.86, g: 0.84, b: 0.96 } }];
  fRow.setPluginData('handexFlowId', flow.flowUid || flow.id || '');
  const fTop = _hdCreateFrame("HORIZONTAL", 0, 4);
  fTop.counterAxisAlignItems = "CENTER";
  const fName = _hdCreateText(flow.name || 'Fluxo', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
  fName.layoutGrow = 1;
  fTop.appendChild(fName);
  const typeStr = _HD_FLOW_TYPE_LABEL[flow.type] || flow.type || '';
  if (typeStr) {
    const fTypeTag = _hdCreateFrame("HORIZONTAL", 6, 3, { r: 0.93, g: 0.90, b: 1 });
    fTypeTag.cornerRadius = 999;
    fTop.appendChild(fTypeTag);
    _hdSetFillAndHug(fTypeTag);
    fTypeTag.appendChild(_hdCreateText(typeStr, 9, "Medium", { r: 0.45, g: 0.35, b: 0.75 }));
  }
  fRow.appendChild(fTop);
  _hdSetFillAndHug(fTop);
  if (flow.fromName || flow.toName) {
    const connStr = `${flow.fromName || '?'} → ${flow.toName || '?'}`;
    const fConn = _hdCreateText(connStr, 10, "Regular", { r: 0.45, g: 0.50, b: 0.60 });
    fRow.appendChild(fConn);
    _hdSetFillAndHug(fConn);
  }
  if (flow.decisionText) {
    const dText = _hdCreateText(`"${flow.decisionText}"`, 10, "Regular", { r: 0.5, g: 0.45, b: 0.70 });
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
function _hdFindExistingFicha(titulo) {
  const _titulo = (titulo || '').trim();
  const _prefix = _titulo ? `Handex | Ficha de Projeto | ${_titulo}` : 'Handex | Ficha de Projeto';
  const fichas = figma.currentPage.children.filter(
    n => n.type === 'FRAME' && n.name.startsWith(_prefix)
  );
  if (fichas.length === 0) return null;
  fichas.sort((a, b) => a.name.localeCompare(b.name));
  return fichas[fichas.length - 1];
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
const DSC_HANDOFF_SUMMARY_ENABLED = false;

// â”€â”€ Shared Plugin Data (MCP / REST API readable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Usa setSharedPluginData (namespace 'handex') para que agentes externos
// (MCP, REST API) consigam ler o contexto de negócio embutido nos nodes.
// setPluginData seria sandboxed ao plugin ID — inacessível externamente.
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
function _orthogonalElbowPoints(a, b) {
  const OFFSET = 24;
  const dirOf = (side) => ({
    top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  })[side];
  const dirA = dirOf(a.side), dirB = dirOf(b.side);
  const aPrime = { x: a.x + dirA.x * OFFSET, y: a.y + dirA.y * OFFSET };
  const bPrime = { x: b.x + dirB.x * OFFSET, y: b.y + dirB.y * OFFSET };

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

  const strokeColor = { r: 0.12, g: 0.16, b: 0.23 };
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
    decisionText: msg.decisionText || null,
    flowSide: msg.flowSide || 'auto',
    connectorStyle: _connectorStyle,
    curvature: _curvature
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
      _flowResult = { id: finalGroup.id, flowUid: _flowId, name: friendlyName, type: msg.flowType, ..._flowExtra };
    } catch (e) { console.error(e); }
  } else if (isEvent) {
    const isStart = msg.flowType === "event_start";
    const circle = figma.createEllipse();
    figma.currentPage.appendChild(circle);
    circle.resize(96, 96);
    circle.x = bestB.x - 48; circle.y = bestB.y - 48;
    circle.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
    circle.strokes = [{ type: "SOLID", color: isStart ? { r: 0.13, g: 0.6, b: 0.3 } : { r: 0.86, g: 0.1, b: 0.1 } }];
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
      _flowResult = { id: finalGroup.id, flowUid: _flowId, name: friendlyName, type: msg.flowType, ..._flowExtra };
    } catch (e) { console.error(e); }
  } else {
    const friendlyName = msg.flowName || "Conexão";
    const finalGroup = figma.group(nodesToGroup, figma.currentPage);
    finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | conexao] ${friendlyName}`;
    finalGroup.locked = true;
    finalGroup.setPluginData('handexCategory', 'fluxo');
    finalGroup.setPluginData('handexFlowId', _flowId);
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
  if (msg.type === 'ui-ready') {
    const currentUser = figma.currentUser
      ? { id: figma.currentUser.id, name: figma.currentUser.name, photoUrl: figma.currentUser.photoUrl }
      : null;
    const theme = figma.ui.theme || 'light';
    const sel = figma.currentPage.selection;
    const projectName = figma.root.name || figma.currentPage.name || '';
    try {
      const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
      let savedState = await figma.clientStorage.getAsync('handoffData_' + fileKey);
      if (!savedState) {
        // Migração única: versões anteriores gravavam handoffData numa chave
        // global (sem fileKey), compartilhada entre TODOS os arquivos .fig
        // abertos pelo mesmo usuário/dispositivo — dados de um projeto
        // vazavam para dentro de outro. Se a chave nova ainda não existe
        // mas a antiga tem dado, assume que pertence a este arquivo (era o
        // último salvo) e migra, sem perder o projeto em andamento.
        const legacyState = await figma.clientStorage.getAsync('handoffData');
        if (legacyState) {
          savedState = legacyState;
          await figma.clientStorage.setAsync('handoffData_' + fileKey, legacyState);
          await figma.clientStorage.setAsync('handoffData', null);
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
        onboardingSeen: onboardingSeen || null
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
        onboardingSeen: null
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
        desc.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
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
        excFrame.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.97 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.29, g: 0.33, b: 0.39 } }];
        excTitle.characters = `CENÁRIOS (${msg.excecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        const _excTypeEmoji = { 'Sucesso': '✅', 'Erro': '❌', 'Alerta': '⚠️', 'Confirmação': '❓' };
        msg.excecoes.forEach(exc => {
          const t = figma.createText();
          t.fontName = { family: "Inter", style: "Regular" };
          t.fontSize = 10;
          t.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
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
        excFrame.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.97 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const hdr = figma.createText();
        hdr.fontName = { family: "Inter", style: "Bold" };
        hdr.fontSize = 9;
        hdr.fills = [{ type: "SOLID", color: { r: 0.29, g: 0.33, b: 0.39 } }];
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
        'Erro':        { r: 0.80, g: 0.15, b: 0.15 },
        'Alerta':      { r: 0.80, g: 0.50, b: 0.00 },
        'Sucesso':     { r: 0.10, g: 0.55, b: 0.25 },
        'Confirmação': { r: 0.05, g: 0.35, b: 0.80 },
      };
      const excRow = figma.createFrame();
      excRow.layoutMode = "HORIZONTAL";
      excRow.itemSpacing = 6;
      excRow.fills = [];
      excRow.primaryAxisSizingMode = "AUTO";
      excRow.counterAxisSizingMode = "AUTO";
      excRow.counterAxisAlignItems = "CENTER";
      const typeColor = _excTypeRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 };
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
      titleLabel.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
      titleLabel.characters = `${exc.titulo || ''}${exc.obs ? ' — ' + exc.obs : ''}`;
      titleLabel.textAutoResize = "WIDTH_AND_HEIGHT";
      excRow.appendChild(typeLabel);
      excRow.appendChild(titleLabel);
      excFrame.appendChild(excRow);
      figma.ui.postMessage({ type: 'toast', message: 'Cenário injetado no card de spec.', kind: 'success' });
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

  if (msg.type === 'clear-cache') {
    const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
    const keys = [
      'handoffData_' + fileKey,
      'handoffData', // chave legada global — limpa também caso ainda não tenha migrado
      'handex-audit-refs-v1',
      'handex-scan-cache-v1_' + fileKey,
      'handex-scan-cache-v1', // idem
      'handex-history-' + fileKey,
    ];
    try {
      await Promise.all(keys.map(k => figma.clientStorage.setAsync(k, null)));
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
    // Todo conteúdo criado pelo Handex é agrupado num único nó de topo de página
    // no momento da criação (mainContainer da ficha, specGroup, grupo de medida,
    // finalGroup/legendFrame de fluxo) -- não sobram nós-irmãos soltos.
    // handexCategory (pluginData) é a fonte de verdade; prefixo de nome é fallback
    // para conteúdo criado antes desta marcação existir.
    const wanted = {
      ficha: !!msg.ficha,
      spec: !!msg.specs,
      medida: !!msg.medidas,
      fluxo: !!msg.fluxos,
    };

    const matchCategory = (node) => {
      const tag = node.getPluginData('handexCategory');
      if (tag) return wanted[tag] ? tag : null;
      if (!node.name) return null;
      if (wanted.ficha && node.name.startsWith('Handex | Ficha de Projeto')) return 'ficha';
      if (wanted.spec && (node.name.startsWith('[Spec | ') || node.name.startsWith('[Spec]'))) return 'spec';
      if (wanted.medida && node.name.startsWith('[Medida]')) return 'medida';
      if (wanted.fluxo && node.name.startsWith('[Fluxo')) return 'fluxo';
      return null;
    };

    const counts = { ficha: 0, spec: 0, medida: 0, fluxo: 0 };
    const toRemove = [];

    figma.currentPage.children.forEach(node => {
      const cat = matchCategory(node);
      if (cat) {
        toRemove.push(node);
        counts[cat]++;
      }
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
    toRemove.forEach(node => { try { node.remove(); } catch (e) {} });

    figma.ui.postMessage({ type: 'canvas-content-deleted', counts });
    return;
  }

  if (msg.type === 'scan-cache-save') {
    const scanFileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
    figma.clientStorage.setAsync('handex-scan-cache-v1_' + scanFileKey, msg.data).catch(e =>
      console.warn("scan-cache-save failed:", e)
    );
    return;
  }

  if (msg.type === 'scan-cache-load') {
    try {
      const scanFileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
      const cached = await figma.clientStorage.getAsync('handex-scan-cache-v1_' + scanFileKey);
      figma.ui.postMessage({ type: 'scan-cache-loaded', data: cached || null });
    } catch (e) {
      figma.ui.postMessage({ type: 'scan-cache-loaded', data: null });
    }
    return;
  }

  // â”€â”€â”€ Handoff snapshots / history (for diff between versions) â”€â”€â”€â”€â”€â”€â”€â”€
  if (msg.type === "snapshot-load") {
    try {
      const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
      const key = "handex-history-" + fileKey;
      const history = await figma.clientStorage.getAsync(key);
      figma.ui.postMessage({ type: "snapshot-history", history: Array.isArray(history) ? history : [] });
    } catch (e) {
      figma.ui.postMessage({ type: "snapshot-history", history: [] });
    }
    return;
  }

  if (msg.type === "snapshot-save") {
    try {
      const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
      const key = "handex-history-" + fileKey;
      const existing = (await figma.clientStorage.getAsync(key)) || [];
      const next = [msg.snapshot].concat(Array.isArray(existing) ? existing : []).slice(0, 5);
      await figma.clientStorage.setAsync(key, next);
    } catch (e) {
      console.error("snapshot-save failed:", e);
    }
    return;
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
      function createText(text, size = 14, weight = "Regular", color = { r: 0.12, g: 0.16, b: 0.23 }) {
        const t = figma.createText();
        t.fontName = { family: "Inter", style: weight };
        t.characters = String(text || "");
        t.fontSize = size;
        t.fills = [{ type: "SOLID", color }];
        return t;
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


      function createSection(parent, titleText) {
        const section = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
        section.name = `[Seção] ${titleText}`;
        if (parent) {
          parent.appendChild(section);
          setFillAndHug(section);
        }
        section.cornerRadius = 8;
        section.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        section.strokeWeight = 1;

        const title = createText(titleText, 16, "Bold", { r: 0.24, g: 0.24, b: 1 });
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
        
        const lbl = createText(label, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
        row.appendChild(lbl);
        setFillAndHug(lbl);

        const val = createText(value || "-", 14, "Regular", isLink ? { r: 0.24, g: 0.24, b: 1 } : { r: 0.12, g: 0.16, b: 0.23 });
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
      // Guarda só a posição (x/y) para a nova ficha herdar -- o designer
      // pode ter movido/organizado a ficha no canvas, atualizar não deve
      // reposicioná-la. Remove a antiga assim que a posição é capturada,
      // antes de construir a nova, para ela não interferir no cálculo de
      // colisão/posicionamento (que só roda quando não há ficha anterior).
      const _existingFicha = _hdFindExistingFicha(_titulo);
      let _inheritedX = null, _inheritedY = null;
      const _isUpdate = !!_existingFicha;
      if (_existingFicha) {
        _inheritedX = _existingFicha.x;
        _inheritedY = _existingFicha.y;
        try { _existingFicha.remove(); } catch (e) {}
      }
      const _now = new Date();
      const _ts = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')} ${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
      // Timestamp antes da versão no nome: garante que a ordenação alfabética
      // usada em pull-ficha-version-from-canvas continue resolvendo "mais
      // recente" pela data de criação, não pela string da versão.
      const _versaoLabel = (data.step1?.versao || '').trim();
      const _containerName = `${_handoffBase} | ${_ts}${_versaoLabel ? ' | ' + _versaoLabel : ''}`;

      // MAIN CONTAINER
      const mainContainer = createFrame("HORIZONTAL", 64, 48, hexToRgb("#00325b"));
      mainContainer.name = _containerName;
      mainContainer.counterAxisAlignItems = "MIN"; // Top align
      mainContainer.primaryAxisSizingMode = "AUTO"; // Hug children width
      mainContainer.counterAxisSizingMode = "AUTO"; // Hug children height

      // 1. FICHA TÉCNICA
      const fichaTecnica = createFrame("VERTICAL", 0, 0, { r: 1, g: 1, b: 1 });
      fichaTecnica.name = `${_handoffBase} | ${_ts} / Ficha de Projeto`;
      fichaTecnica.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
      fichaTecnica.resize(480, 100);
      fichaTecnica.counterAxisSizingMode = "FIXED"; // Base width 480
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

      const headerTitle = createText("Handex - Handoff Expresso", 14, "Medium", { r: 0.39, g: 0.45, b: 0.55 });
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
            'rascunho':       { label: 'Rascunho',        bg: { r: 0.94, g: 0.95, b: 0.96 }, text: { r: 0.42, g: 0.47, b: 0.55 } },
            'em-revisao':     { label: 'Em Revisão',      bg: { r: 1,    g: 0.96, b: 0.84 }, text: { r: 0.72, g: 0.45, b: 0.00 } },
            'pronto-para-dev':{ label: 'Pronto para Dev', bg: { r: 0.86, g: 0.93, b: 1.00 }, text: { r: 0.00, g: 0.35, b: 0.79 } },
            'finalizado':     { label: 'Finalizado',      bg: { r: 0.86, g: 0.97, b: 0.88 }, text: { r: 0.07, g: 0.53, b: 0.18 } },
          };
          const _sc = _statusMap[data.step1.status] || _statusMap['rascunho'];
          const statusCol = createFrame("VERTICAL", 0, 4);
          statusCol.name = '[Campo] Status';
          subGrid.appendChild(statusCol);
          setFillAndHug(statusCol);
          statusCol.appendChild(createText('Status', 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 }));
          const chip = createFrame("HORIZONTAL", 8, 4, _sc.bg);
          chip.cornerRadius = 999;
          chip.primaryAxisSizingMode = "AUTO";
          chip.counterAxisSizingMode = "AUTO";
          chip.counterAxisAlignItems = "CENTER";
          chip.appendChild(createText(_sc.label, 11, "Bold", _sc.text));
          statusCol.appendChild(chip);
        }
        createRow(subGrid, "Versão", data.step1.versao);
      }

      // 1.2 EQUIPE E RESPONSÁVEIS
      if (data.step1.equipe && data.step1.equipe.length > 0) {
        const teamSection = createSection(content, "Equipe e Responsáveis");
        data.step1.equipe.forEach(m => {
          const mRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
          teamSection.appendChild(mRow);
          setFillAndHug(mRow);
          mRow.counterAxisAlignItems = "CENTER";
          mRow.cornerRadius = 8;
          mRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const roleTag = createFrame("HORIZONTAL", 8, 3, { r: 0.93, g: 0.96, b: 1.0 });
          roleTag.cornerRadius = 999;
          roleTag.strokes = [{ type: "SOLID", color: { r: 0.70, g: 0.82, b: 0.96 } }];
          roleTag.strokeWeight = 1;
          roleTag.appendChild(createText(m.papel || 'Membro', 9, "Medium", { r: 0.24, g: 0.24, b: 1 }));
          mRow.appendChild(roleTag);

          const nameText = createText(m.nome || '', 12, "Medium");
          nameText.layoutGrow = 1;
          mRow.appendChild(nameText);

          if (m.email) {
            const contactLink = createText("Contato", 11, "Bold", { r: 0.24, g: 0.24, b: 1 });
            contactLink.textDecoration = "UNDERLINE";
            contactLink.hyperlink = { type: "URL", value: "mailto:" + m.email };
            mRow.appendChild(contactLink);
          }
        });
      }

      // 1.3 BRIEFING ESTRATÉGICO — coletado aqui, mas gerado no card2 separado
      const _briefingQs = (data.step2 && data.step2.briefingQuestions)
        ? data.step2.briefingQuestions.filter(q => q.answer && q.answer.trim())
        : [];

      // 1.4 REGRAS DE NEGÓCIO E HUs
      const _regras = (data.step2 && data.step2.regras) ? data.step2.regras : [];
      if (_regras.length > 0) {
        const rulesSection = createSection(content, "Regras de Negócio e HUs");
        _regras.forEach(r => {
          const rRow = createFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.98, b: 0.99 });
          rulesSection.appendChild(rRow);
          setFillAndHug(rRow);
          rRow.cornerRadius = 8;
          rRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const rTitle = createText(r.titulo || '', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          rRow.appendChild(rTitle);
          setFillAndHug(rTitle);

          if (r.link && r.link !== "#") {
            const lText = createText("Acesse o link da HU", 11, "Bold", { r: 0.24, g: 0.24, b: 1 });
            lText.textDecoration = "UNDERLINE";
            lText.hyperlink = { type: "URL", value: r.link };
            rRow.appendChild(lText);
            setFillAndHug(lText);
          }
          if (r.notas) {
            const nText = createText(r.notas, 12, "Regular", { r: 0.4, g: 0.4, b: 0.4 });
            rRow.appendChild(nText);
            setFillAndHug(nText);
          }
        });
        content.appendChild(rulesSection);
        setFillAndHug(rulesSection);
      }

      // 1.5 CENÁRIOS DE EXCEÇÃO (agregados de todas as specs, de todos os
      // frames + avulsas). Antes lia frame.excecoes (nível de frame) -- esse
      // conceito nunca teve UI real de entrada e foi removido; spec.excecoes
      // (nível de spec, anexado via botão "Cenário de Exceção" no card da
      // spec) é o único conceito vivo hoje. Também aparece dentro do card
      // de cada spec na seção "Especificações" (1.9) -- esta seção agregada
      // dá visibilidade extra, reunindo tudo num só lugar no topo da ficha.
      const _allExcecoes = [
        ...(data.frames || []).flatMap(f => (f.createdSpecs || []).flatMap(s =>
          (s.excecoes || []).map(e => ({ ...e, _frame: f.nome, _spec: s.name }))
        )),
        ...(data.specs || []).flatMap(s =>
          (s.excecoes || []).map(e => ({ ...e, _frame: null, _spec: s.name }))
        )
      ];
      if (_allExcecoes.length > 0) {
        const excSection = createSection(content, "Cenários de Exceção");
        _allExcecoes.forEach(e => {
          const eRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
          excSection.appendChild(eRow);
          setFillAndHug(eRow);
          eRow.counterAxisAlignItems = "CENTER";
          eRow.cornerRadius = 8;
          eRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const typeTag = createFrame("HORIZONTAL", 8, 4, { r: 0.9, g: 0.2, b: 0.2 });
          typeTag.cornerRadius = 4;
          typeTag.appendChild(createText(e.tipo || '', 10, "Bold", { r: 1, g: 1, b: 1 }));
          eRow.appendChild(typeTag);

          const _origem = e._frame ? `${e._spec || ''} — ${e._frame}` : (e._spec || '');
          const titleText = createText(`${e.titulo || ''}${_origem ? ' (' + _origem + ')' : ''}`, 12, "Medium");
          titleText.layoutGrow = 1;
          eRow.appendChild(titleText);

          if (e.anchor && e.anchor !== "#") {
            titleText.textDecoration = "UNDERLINE";
            titleText.hyperlink = { type: "URL", value: e.anchor };
          }
        });
        content.appendChild(excSection);
        setFillAndHug(excSection);
      }


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
          validDocItems.forEach(item => {
            const docData = data.docs[item.key];
            const dRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
            dRow.layoutAlign = "STRETCH";
            dRow.counterAxisAlignItems = "CENTER";
            dRow.cornerRadius = 8;
            dRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

            const dLabel = createText(item.label, 12, "Bold");
            dLabel.layoutGrow = 1;
            dRow.appendChild(dLabel);

            const dLink = createText("Acesse o link", 11, "Bold", { r: 0.24, g: 0.24, b: 1 });
            dLink.textDecoration = "UNDERLINE";
            dLink.hyperlink = { type: "URL", value: docData.link };
            dRow.appendChild(dLink);

            docsSection.appendChild(dRow);
          });
          setFillAndHug(docsSection);
        }
      }

      // 1.7 FRAMES DOCUMENTADOS
      const _frames = data.frames || [];
      if (_frames.length > 0) {
        const framesSection = _hdCreateSection(content, "Frames Documentados");
        _frames.forEach((f, fi) => {
          const fRow = _hdBuildFrameCard(f, fi);
          framesSection.appendChild(fRow);
          _hdSetFillAndHug(fRow);
        });
        content.appendChild(framesSection);
        setFillAndHug(framesSection);
      }

      // 1.8 MEDIDAS (seção independente, agrupada por frame)
      const _framesWithMeasures = (_frames || []).filter(f => (f.measurements || []).length > 0);
      if (_framesWithMeasures.length > 0) {
        const measSection = _hdCreateSection(content, "Medidas");
        _framesWithMeasures.forEach(f => {
          const fGroup = _hdBuildMeasuresSubgroup(f);
          measSection.appendChild(fGroup);
          _hdSetFillAndHug(fGroup);
        });
        content.appendChild(measSection);
        setFillAndHug(measSection);
      }

      // 1.9 ESPECIFICAÇÕES ANOTADAS (seção independente, agrupada por frame)
      // Specs criadas sem nenhum frame ativo/selecionado ficam em data.specs
      // (nível superior), não em nenhum frame.createdSpecs -- identificadas
      // pela chave fixa 'handexFrameId' = '__loose__' (mesmo padrão usado
      // pela inserção incremental), já que não têm frame.figmaId real.
      // data.specs pode conter specs que JÁ estão em algum frame.createdSpecs
      // (contaminação por saveSpecsToStorage/_mergeLooseAndFramed, mesma
      // duplicidade de fonte que já causou o bug de spec "ressuscitada" --
      // ver CHANGELOG v6.1.1/v6.2.0) -- sem este filtro, a spec apareceria
      // duas vezes na ficha: no card do frame real E no card de avulsas.
      const _framedSpecIds = new Set((_frames || []).flatMap(f => (f.createdSpecs || []).map(s => s.id)));
      const _looseSpecs = (data.specs || []).filter(s => !_framedSpecIds.has(s.id));
      const _framesWithSpecs = (_frames || []).filter(f => (f.createdSpecs || []).length > 0);
      if (_framesWithSpecs.length > 0 || _looseSpecs.length > 0) {
        const annotSection = _hdCreateSection(content, "Especificações");
        for (const f of _framesWithSpecs) {
          const fGroup = await _hdBuildSpecsSubgroup(f);
          annotSection.appendChild(fGroup);
          _hdSetFillAndHug(fGroup);
        }
        if (_looseSpecs.length > 0) {
          const looseFrame = { nome: 'Sem frame vinculado', createdSpecs: _looseSpecs, specGroupNames: {}, specGroupVisible: {} };
          const looseGroup = await _hdBuildSpecsSubgroup(looseFrame);
          looseGroup.setPluginData('handexFrameId', '__loose__');
          annotSection.appendChild(looseGroup);
          _hdSetFillAndHug(looseGroup);
        }
        content.appendChild(annotSection);
        setFillAndHug(annotSection);
      }

      // 1.10 FLUXOS DE TELA
      const _flows = data.createdFlows || [];
      if (_flows.length > 0) {
        const flowsSection = _hdCreateSection(content, "Fluxos de Tela");
        _flows.forEach((flow, fi) => {
          const fRow = _hdBuildFlowCard(flow, fi);
          flowsSection.appendChild(fRow);
          _hdSetFillAndHug(fRow);
        });
        content.appendChild(flowsSection);
        setFillAndHug(flowsSection);
      }

      fichaTecnica.appendChild(content);
      mainContainer.appendChild(fichaTecnica);

      // CARD 2 — BRIEFING ESTRATÉGICO (card separado, só criado se houver respostas)
      if (_briefingQs.length > 0) {
        const card2 = createFrame("VERTICAL", 0, 0, { r: 1, g: 1, b: 1 });
        card2.name = `${_handoffBase} | ${_ts} / Briefing`;
        card2.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        card2.resize(440, 100);
        card2.counterAxisSizingMode = "FIXED";
        card2.primaryAxisSizingMode = "AUTO";
        card2.cornerRadius = 16;

        const bContent = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
        card2.appendChild(bContent);
        setFillAndHug(bContent);

        const briefingSection = createSection(bContent, "Briefing Estratégico");
        _briefingQs.forEach((q, idx) => {
          const qRow = createFrame("VERTICAL", 0, 4);
          qRow.name = `[Briefing] Pergunta ${idx + 1}`;
          briefingSection.appendChild(qRow);
          setFillAndHug(qRow);

          const qText = createText(`${idx + 1}. ${q.question || ''}`, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
          qRow.appendChild(qText);
          setFillAndHug(qText);

          const aText = createText(q.answer, 13, "Regular", { r: 0.12, g: 0.16, b: 0.23 });
          aText.textAutoResize = "HEIGHT";
          aText.resize(392, 20);
          qRow.appendChild(aText);
          setFillAndHug(aText);
        });
        setFillAndHug(briefingSection);
        mainContainer.appendChild(card2);
      }

      // CARD 3 — USER INTERFACE
      if (!data.setup || data.setup.componentes !== false) {
        const uiBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
        uiBoard.name = `${_handoffBase} / Interface`;
        uiBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        uiBoard.cornerRadius = 16;
        uiBoard.primaryAxisSizingMode = "AUTO";   // Hug height
        uiBoard.counterAxisSizingMode = "AUTO";   // Hug width — se expande para todas as colunas
        uiBoard.layoutAlign = "INHERIT"; // Don't stretch height in horizontal parent

        // Header row: título à esquerda + legenda de status à direita
        const uiHeaderRow = createFrame("HORIZONTAL", 0, 12);
        uiHeaderRow.counterAxisAlignItems = "CENTER";
        setFillAndHug(uiHeaderRow);
        uiBoard.appendChild(uiHeaderRow);

        const uiTitle = createText("User Interface", 24, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
        uiTitle.layoutGrow = 1;
        uiHeaderRow.appendChild(uiTitle);


        // Helper para specs list (Colunas Verticais)
        function createSpecList(title, items, type) {
          if (!items || items.length === 0) return null;
          // Só mostra items com token aplicado (isDS !== false) e que tenham ao menos uma prop com token
          const tokenItems = items.filter(item => item.isDS !== false);
          if (tokenItems.length === 0) return null;
          items = tokenItems;

          const sec = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
          sec.name = `[Scan] ${title}`;
          sec.cornerRadius = 16;
          sec.resize(280, 100);
          sec.primaryAxisSizingMode = "AUTO";  // Hug height
          sec.counterAxisSizingMode = "FIXED"; // Base width 280

          const titleNode = createText(title, 18, "Bold", { r: 0.24, g: 0.24, b: 1 });
          sec.appendChild(titleNode);
          setFillAndHug(titleNode);

          const listContainer = createFrame("VERTICAL", 0, 12);
          sec.appendChild(listContainer);
          setFillAndHug(listContainer);

          items.forEach(item => {
            const elCard = createFrame("VERTICAL", 16, 12, { r: 0.98, g: 0.99, b: 1 });
            elCard.name = `[Token] ${item.name}`;
            elCard.cornerRadius = 12;
            elCard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.96 } }];
            elCard.strokeWeight = 1;
            
            listContainer.appendChild(elCard);
            setFillAndHug(elCard);

            // Element Header
            const headerRow = createFrame("HORIZONTAL", 0, 12);
            headerRow.counterAxisAlignItems = "CENTER";
            elCard.appendChild(headerRow);
            setFillAndHug(headerRow);

            // Preview if exists — createRectangle só é chamado após obter o hash
            // para evitar que um rect órfão fique solto na raiz da página caso
            // createImage lance exceção.
            if (item.preview) {
              try {
                const imageHash = figma.createImage(item.preview).hash;
                const rect = figma.createRectangle();
                rect.resize(32, 32);
                rect.fills = [{ type: "IMAGE", imageHash, scaleMode: "FIT" }];
                rect.cornerRadius = 4;
                headerRow.appendChild(rect);
              } catch(e) {}
            }

            const iName = createText(item.name, 13, "Bold", { r: 0.1, g: 0.15, b: 0.25 });
            iName.layoutGrow = 1;
            if (item.nodeId && figma.fileKey) {
              try {
                iName.hyperlink = {
                  type: "URL",
                  value: `https://www.figma.com/design/${figma.fileKey}?node-id=${encodeURIComponent(item.nodeId)}`
                };
                iName.textDecoration = "UNDERLINE";
                iName.fills = [{ type: "SOLID", color: { r: 0.24, g: 0.24, b: 1 } }];
              } catch(e) {}
            }
            headerRow.appendChild(iName);

            // Status Badge
            const status = item.componentStatus || (item.isDS === true ? "ok" : (item.isDS === "warning" ? "warning" : "error"));
            if (data.isAudit) {
              const statusColors = {
                ok: { bg: { r: 0.9, g: 0.98, b: 0.94 }, text: { r: 0.05, g: 0.5, b: 0.3 }, label: "DSC" },
                warning: { bg: { r: 1, g: 0.97, b: 0.9 }, text: { r: 0.7, g: 0.4, b: 0 }, label: "AJUSTE" },
                error: { bg: { r: 1, g: 0.93, b: 0.93 }, text: { r: 0.8, g: 0.2, b: 0.2 }, label: "FORA" }
              };
              const config = statusColors[status] || statusColors.error;
              const badge = createFrame("HORIZONTAL", 8, 4, config.bg);
              badge.cornerRadius = 6;
              badge.appendChild(createText(config.label, 9, "Bold", config.text));
              headerRow.appendChild(badge);
            }

            // Properties — só exibe props com token aplicado
            const _tokenProps = (item.properties || []).filter(p => p.isDS === true || p.isDS === "warning" || p.token);
            if (_tokenProps.length > 0) {
              const propsContainer = createFrame("VERTICAL", 0, 6);
              elCard.appendChild(propsContainer);
              setFillAndHug(propsContainer);

              _tokenProps.forEach(prop => {
                const pRow = createFrame("HORIZONTAL", 0, 8);
                pRow.counterAxisAlignItems = "CENTER";
                propsContainer.appendChild(pRow);
                setFillAndHug(pRow);

                // Property icon — semantic type indicator (neutral gray) or color swatch for fill/stroke
                if (prop.type === 'color' || prop.type === 'stroke') {
                  // Show actual color as a swatch — faster than SVG and more informative
                  const swatch = figma.createRectangle();
                  swatch.resize(10, 10);
                  swatch.cornerRadius = 2;
                  const swatchRgb = hexToRgb(prop.rawValue || prop.value);
                  swatch.fills = [{ type: 'SOLID', color: swatchRgb || { r: 0.8, g: 0.8, b: 0.8 } }];
                  swatch.strokes = [{ type: 'SOLID', color: { r: 0.7, g: 0.72, b: 0.75 } }];
                  swatch.strokeWeight = 0.5;
                  pRow.appendChild(swatch);
                } else {
                  try {
                    const iconSvg = getIconSvg(prop.type, prop.label);
                    const iconNode = figma.createNodeFromSvg(iconSvg);
                    iconNode.resize(12, 12);
                    const neutral = { r: 0.55, g: 0.58, b: 0.62 };
                    function setSvgColor(node, color) {
                      const isContainer = node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT';
                      if (isContainer) {
                        // Clear background of container — never fill it
                        if ('fills' in node) node.fills = [];
                        if ('strokes' in node) node.strokes = [];
                      } else {
                        // Color only leaf shapes (vectors, paths)
                        if ('fills' in node && node.fills.length) node.fills = [{ type: 'SOLID', color }];
                        if ('strokes' in node && node.strokes.length) node.strokes = [{ type: 'SOLID', color }];
                      }
                      if ('children' in node) node.children.forEach(c => setSvgColor(c, color));
                    }
                    setSvgColor(iconNode, neutral);
                    pRow.appendChild(iconNode);
                  } catch(e) {
                    const dot = figma.createEllipse();
                    dot.resize(6, 6);
                    dot.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.58, b: 0.62 } }];
                    pRow.appendChild(dot);
                  }
                }
                const pLabel = createText(`${prop.label || prop.type}:`, 10, "Medium", { r: 0.4, g: 0.45, b: 0.5 });
                pRow.appendChild(pLabel);

                const pVal = createText(prop.value, 10, "Bold", { r: 0.2, g: 0.25, b: 0.3 });
                pVal.layoutGrow = 1;
                pRow.appendChild(pVal);

                if (prop.token) {
                  const tBadge = createText(prop.token, 8, "Regular", { r: 0.24, g: 0.24, b: 1 });
                  pRow.appendChild(tBadge);
                }
              });
            }
          });
          
          return sec;
        }

        // Agrega specs de todos os frames + fallback para global
        const _allFrameSpecs = (data.frames || []).map(f => f.specs).filter(Boolean);
        const _globalSpecs = data.step2 && data.step2.specs ? data.step2.specs : null;
        const _specsSource = _allFrameSpecs.length > 0 ? _allFrameSpecs : (_globalSpecs ? [_globalSpecs] : []);
        const specsData = {
          components: _specsSource.flatMap(s => s.components || []),
          icons:      _specsSource.flatMap(s => s.icons      || []),
          typography: _specsSource.flatMap(s => s.typography || []),
          frames:     _specsSource.flatMap(s => s.frames     || []),
          vectors:    _specsSource.flatMap(s => s.vectors    || []),
        };

        const specsRow = figma.createFrame();
        specsRow.name = '[Row] Colunas UI';
        specsRow.layoutMode = "HORIZONTAL";
        specsRow.itemSpacing = 24;
        specsRow.paddingLeft = 0;
        specsRow.paddingRight = 0;
        specsRow.paddingTop = 0;
        specsRow.paddingBottom = 0;
        specsRow.fills = [];
        specsRow.primaryAxisSizingMode = "AUTO";
        specsRow.counterAxisSizingMode = "AUTO";
        specsRow.counterAxisAlignItems = "MIN";

        // Uma coluna por categoria, lado a lado
        [
          { title: "Componentes",     items: specsData.components, type: "components" },
          { title: "Ícones",          items: specsData.icons,      type: "icons"      },
          { title: "Tipografia",      items: specsData.typography, type: "typography" },
          { title: "Vetores",         items: specsData.vectors,    type: "vectors"    },
          { title: "Frames e Layouts",items: specsData.frames,     type: "frames"     },
        ].forEach(cat => {
          const sec = createSpecList(cat.title, cat.items, cat.type);
          if (sec) specsRow.appendChild(sec);
        });

        if (specsRow.children.length > 0) {
          uiBoard.appendChild(specsRow);
          setFillAndHug(specsRow);
          mainContainer.appendChild(uiBoard);
        } else {
          specsRow.remove();
          uiBoard.remove();
        }
      }

      // 3. ANATOMIA / MEDIDAS
      const selection = figma.currentPage.selection;
      if (selection.length > 0 && data.setup && (data.setup.espacamentos || data.setup.anatomia || data.setup.instancias)) {
        for (const node of selection) {
          if (node === mainContainer) continue;

          const specsBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
          specsBoard.name = `[Design Specs] ${node.name}`;
          specsBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
          specsBoard.cornerRadius = 16;
          specsBoard.resize(800, 100);
          specsBoard.counterAxisSizingMode = "FIXED"; // Base width 800
          specsBoard.primaryAxisSizingMode = "AUTO";  // Hug height
          specsBoard.layoutAlign = "INHERIT";         // Don't stretch height in horizontal parent

          const specsTitle = createText("Design Specs: " + node.name, 24, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          specsBoard.appendChild(specsTitle);
          setFillAndHug(specsTitle);

          if (data.setup.anatomia || data.setup.espacamentos) {
            const layoutSec = createSection(specsBoard, "Layout & Posicionamento");
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
            const appearSec = createSection(specsBoard, "Aparência");
            const grid = createFrame("HORIZONTAL", 0, 16);
            grid.layoutWrap = "WRAP";
            grid.layoutAlign = "STRETCH";

            if ('opacity' in node) createRow(grid, "Opacity", `${Math.round(node.opacity * 100)}%`);
            if ('blendMode' in node && node.blendMode !== "PASS_THROUGH") createRow(grid, "Blend Mode", node.blendMode);

            if ('fills' in node && Array.isArray(node.fills)) {
              const sf = node.fills.find(f => f.type === "SOLID");
              if (sf) {
                const hex = rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase();
                const token = await getVariableInfo(node, 'fills');
                createRow(grid, "Fills", token ? token : hex);
              }
            }
            if ('strokes' in node && Array.isArray(node.strokes)) {
              const ss = node.strokes.find(s => s.type === "SOLID");
              if (ss) {
                const hex = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
                const token = await getVariableInfo(node, 'strokes');
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
        auditBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        auditBoard.cornerRadius = 16;
        auditBoard.resize(800, 100);
        auditBoard.counterAxisSizingMode = "FIXED";
        auditBoard.primaryAxisSizingMode = "AUTO";
        
        const auditTitle = createText("Relatório de Auditoria", 24, "Bold", { r: 0.24, g: 0.24, b: 1 });
        auditBoard.appendChild(auditTitle);
        setFillAndHug(auditTitle);

        const summaryText = createText(`Aderência ao Design System: ${data.auditSummary.adoption}%`, 18, "Bold", data.auditSummary.adoption > 90 ? { r: 0, g: 0.5, b: 0 } : { r: 0.8, g: 0, b: 0 });
        auditBoard.appendChild(summaryText);
        setFillAndHug(summaryText);

        const statsText = createText(`Resumo: ${data.auditSummary.issues.length} Fora do Padrão | ${data.auditSummary.adjustments.length} Ajustes`, 14, "Medium", { r: 0.4, g: 0.45, b: 0.5 });
        auditBoard.appendChild(statsText);
        setFillAndHug(statsText);

        if (data.auditSummary.adjustments && data.auditSummary.adjustments.length > 0) {
           const adjSection = createSection(auditBoard, "Ajustes Recomendados (Minorias)");
           data.auditSummary.adjustments.slice(0, 10).forEach(adj => {
             const aRow = createText(`- [${adj.cat}] ${adj.name}`, 12, "Regular", { r: 0.7, g: 0.4, b: 0 });
             adjSection.appendChild(aRow);
             setFillAndHug(aRow);
           });
        }

        if (data.auditSummary.issues && data.auditSummary.issues.length > 0) {
           const issueList = createSection(auditBoard, "Pendências Críticas (Fora do Padrão)");
           data.auditSummary.issues.slice(0, 20).forEach(issue => {
             const iRow = createText(`- [${issue.cat}] ${issue.name}`, 12, "Regular", { r: 0.8, g: 0.2, b: 0.2 });
             issueList.appendChild(iRow);
             setFillAndHug(iRow);
           });
           if (data.auditSummary.issues.length > 20) {
             const moreText = createText(`... e mais ${data.auditSummary.issues.length - 20} itens.`, 10, "Regular", { r: 0.5, g: 0.5, b: 0.5 });
             issueList.appendChild(moreText);
             setFillAndHug(moreText);
           }
        }

        mainContainer.appendChild(auditBoard);
      }

      // Append ao canvas primeiro para que as dimensões AUTO sejam calculadas pelo Figma
      mainContainer.locked = false;
      mainContainer.setPluginData('handexCategory', 'ficha');
      figma.currentPage.appendChild(mainContainer);

      if (_isUpdate && _inheritedX !== null) {
        // Ficha existente: herda a posição exata de onde estava -- pula todo
        // o cálculo de posicionamento/colisão abaixo (só relevante para uma
        // ficha nova, que precisa achar um lugar livre no canvas).
        mainContainer.x = _inheritedX;
        mainContainer.y = _inheritedY;
        figma.currentPage.selection = [mainContainer];
        figma.viewport.scrollAndZoomIntoView([mainContainer]);
        figma.ui.postMessage({ type: "handoff-complete", isUpdate: _isUpdate, timestamp: _ts });
        return;
      }

      // Inicializar fora da tela para evitar flash de sobreposição enquanto calcula posição
      mainContainer.x = -99999;
      mainContainer.y = -99999;

      // Calcula gap considerando a largura real da ficha já renderizada
      const _fichaGap = 200;
      // Raio de proximidade para considerar uma ficha existente "do mesmo contexto"
      // do frame mapeado, evitando pegar uma ficha antiga e distante de outro projeto.
      const _nearbyRadius = 4000;

      let _positioned = false;
      let _existingFichas = [];

      // Todo o cálculo de posição é protegido: qualquer erro (ex: figmaId inválido
      // apontando para um node que não existe mais nesta cópia do arquivo) não pode
      // deixar a ficha presa na coordenada off-screen temporária (-99999,-99999).
      try {
        // 1ª prioridade: ao lado do frame mapeado por figmaId (referência real de onde
        // a ficha deve nascer no canvas — sempre a mais confiável quando disponível)
        let _anchorBb = null;
        const _mainFrames = data.frames || [];
        for (const _f of _mainFrames) {
          if (!_f.figmaId) continue;
          let _fNode = null;
          try {
            _fNode = await figma.getNodeByIdAsync(_f.figmaId);
          } catch (e) {
            _fNode = null;
          }
          if (!_fNode) continue;
          const _fBb = _fNode.absoluteBoundingBox;
          if (_fBb) {
            _anchorBb = _fBb;
            break;
          }
        }

        if (_anchorBb) {
          mainContainer.x = Math.round(_anchorBb.x + _anchorBb.width + _fichaGap);
          mainContainer.y = Math.round(_anchorBb.y);
          _positioned = true;
        }

        // 2ª prioridade: ao lado de ficha já existente no canvas, mas só se ela estiver
        // perto do frame mapeado (evita sobrepor outra ficha do mesmo projeto). Sem
        // âncora, mantém o comportamento antigo de olhar qualquer ficha no canvas.
        _existingFichas = figma.currentPage.children.filter(n => {
          if (n.type !== 'FRAME' || !n.name.startsWith('Handex | Ficha') || n === mainContainer) return false;
          if (!_anchorBb) return true;
          const bb = n.absoluteBoundingBox;
          if (!bb) return false;
          return Math.abs(bb.x - _anchorBb.x) < _nearbyRadius && Math.abs(bb.y - _anchorBb.y) < _nearbyRadius;
        });
        if (_existingFichas.length > 0) {
          const _rightmostFicha = _existingFichas.reduce((max, f) => {
            const bb = f.absoluteBoundingBox;
            if (!bb) return max;
            return (bb.x + bb.width) > max.right ? { right: bb.x + bb.width, y: bb.y } : max;
          }, { right: -Infinity, y: 0 });
          if (_rightmostFicha.right > -Infinity) {
            mainContainer.x = Math.round(_rightmostFicha.right + _fichaGap);
            mainContainer.y = Math.round(_rightmostFicha.y);
            _positioned = true;
          }
        }

        // 3ª prioridade: ao lado da seleção atual no canvas
        if (!_positioned) {
          const _sel = figma.currentPage.selection.filter(n => n !== mainContainer);
          if (_sel.length > 0) {
            const _rightmost = _sel.reduce((max, n) => {
              const bb = n.absoluteBoundingBox;
              return bb && (bb.x + bb.width) > max.edge ? { edge: bb.x + bb.width, x: bb.x + bb.width, y: bb.y } : max;
            }, { edge: -Infinity, x: 0, y: 0 });
            if (_rightmost.edge > -Infinity) {
              mainContainer.x = Math.round(_rightmost.x + _fichaGap);
              mainContainer.y = Math.round(_rightmost.y);
              _positioned = true;
            }
          }
        }
      } catch (posErr) {
        console.error("Handoff positioning error:", posErr);
        _positioned = false;
      }

      // 4ª prioridade (fallback): à direita da borda visível do viewport
      if (!_positioned) {
        const _vb = figma.viewport.bounds;
        mainContainer.x = Math.round(_vb.x + _vb.width + _fichaGap);
        mainContainer.y = Math.round(_vb.y + (_vb.height / 2) - (mainContainer.height / 2));
      }

      // Rede de segurança contra colisão: a posição escolhida acima já segue a lógica
      // de prioridade (âncora → ficha existente → seleção → viewport), mas nada nela
      // olha para o resto do conteúdo da página. Aqui empurramos a ficha para a direita
      // até não sobrepor nenhum outro nó de topo (frames de design, specs do Handex etc.).
      try {
        // Sections são só agrupadores visuais, sem conteúdo "por baixo" que
        // a ficha possa cobrir -- tratá-las como obstáculo faz a ficha ser
        // empurrada pela área da Section inteira, mesmo que o frame
        // mapeado (ou qualquer outro) ocupe só uma fração dela. "Achata"
        // cada Section nos seus filhos diretos antes de checar colisão,
        // preservando a proteção real (nunca sobrepor um frame, mesmo
        // dentro de uma Section) sem o falso positivo da área da Section.
        const _pageNodes = figma.currentPage.children
          .filter(n => n !== mainContainer && !_existingFichas.includes(n))
          .flatMap(n => n.type === 'SECTION' ? n.children : [n]);
        let _collisionIterations = 0;
        let _hasCollision = true;
        while (_hasCollision && _collisionIterations < 50) {
          _hasCollision = false;
          for (const _node of _pageNodes) {
            const _nBb = _node.absoluteBoundingBox;
            if (!_nBb) continue;
            const _overlaps = mainContainer.x < _nBb.x + _nBb.width && mainContainer.x + mainContainer.width > _nBb.x &&
              mainContainer.y < _nBb.y + _nBb.height && mainContainer.y + mainContainer.height > _nBb.y;
            if (_overlaps) {
              mainContainer.x = Math.round(_nBb.x + _nBb.width + _fichaGap);
              _hasCollision = true;
              _collisionIterations++;
              break;
            }
          }
        }
      } catch (collisionErr) {
        console.error("Handoff collision check error:", collisionErr);
      }

      figma.currentPage.selection = [mainContainer];
      figma.viewport.scrollAndZoomIntoView([mainContainer]);

      figma.ui.postMessage({ type: "handoff-complete", isUpdate: _isUpdate, timestamp: _ts });
    } catch (err) {
      console.error("Handoff Error:", err);
      figma.ui.postMessage({ type: "handoff-error", message: err.message });
    }
  }

  // add-annotations is handled below

  if (msg.type === "measure-nodes-custom") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("Selecione um ou mais itens para mensurar.");
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

    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }

      function createMeasurementLine(x1, y1, x2, y2, value, type = 'horizontal', redColor = { r: 1, g: 0.2, b: 0.2 }, tokenName = null) {
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

      for (const node of selection) {
        const bounds = node.absoluteRenderBounds || node.absoluteBoundingBox;
        if (!bounds) continue;

        let items = [];
        let appliedDetails = [];

        if (measureTypes && measureTypes.includes('wh')) {
          const wToken = await getVariableInfo(node, 'width');
          const hToken = await getVariableInfo(node, 'height');
          items.push(...createMeasurementLine(bounds.x, bounds.y - 20, bounds.x + bounds.width, bounds.y - 20, bounds.width, 'horizontal', { r: 1, g: 0.2, b: 0.2 }, wToken));
          items.push(...createMeasurementLine(bounds.x - 20, bounds.y, bounds.x - 20, bounds.y + bounds.height, bounds.height, 'vertical', { r: 1, g: 0.2, b: 0.2 }, hToken));

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

          if (node.paddingTop > 0) { items.push(...createMeasurementLine(shiftX, bounds.y, shiftX, bounds.y + node.paddingTop, node.paddingTop, 'vertical', { r: 0, g: 0.5, b: 1 }, tT)); pads.push(`Top: ${node.paddingTop}${tT ? ' [' + tT + ']' : ''}`); }
          if (node.paddingBottom > 0) { items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height - node.paddingBottom, shiftX, bounds.y + bounds.height, node.paddingBottom, 'vertical', { r: 0, g: 0.5, b: 1 }, tB)); pads.push(`Bottom: ${node.paddingBottom}${tB ? ' [' + tB + ']' : ''}`); }
          if (node.paddingLeft > 0) { items.push(...createMeasurementLine(bounds.x, shiftY, bounds.x + node.paddingLeft, shiftY, node.paddingLeft, 'horizontal', { r: 0, g: 0.5, b: 1 }, tL)); pads.push(`Left: ${node.paddingLeft}${tL ? ' [' + tL + ']' : ''}`); }
          if (node.paddingRight > 0) { items.push(...createMeasurementLine(bounds.x + bounds.width - node.paddingRight, shiftY, bounds.x + bounds.width, shiftY, node.paddingRight, 'horizontal', { r: 0, g: 0.5, b: 1 }, tR)); pads.push(`Right: ${node.paddingRight}${tR ? ' [' + tR + ']' : ''}`); }
          if (pads.length > 0) appliedDetails.push(`Padding Interno: ${pads.join(', ')}`);
        }

        if (measureTypes && measureTypes.includes('spacing') && 'layoutMode' in node && node.layoutMode !== "NONE" && node.children.length > 1) {
          let spaceCount = 0;
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
                items.push(...createMeasurementLine(startX, y, endX, y, endX - startX, 'horizontal', { r: 0.8, g: 0.2, b: 0.8 }, gapToken));
                spaceCount++;
              }
            } else if (node.layoutMode === "VERTICAL") {
              const startY = b1.y + b1.height;
              const endY = b2.y;
              const x = bounds.x + bounds.width / 2;
              if (endY > startY) {
                items.push(...createMeasurementLine(x, startY, x, endY, endY - startY, 'vertical', { r: 0.8, g: 0.2, b: 0.8 }, gapToken));
                spaceCount++;
              }
            }
          }
          if (spaceCount > 0) appliedDetails.push(`Gaps: ${spaceCount} espaços de ${node.itemSpacing}px ${gapToken ? '[' + gapToken + ']' : ''}`);
        }

        if (measureTypes && measureTypes.includes('outer')) {
          if (node.parent && node.parent.type !== "PAGE") {
            const pb = node.parent.absoluteRenderBounds || node.parent.absoluteBoundingBox;
            if (pb) {
              const shiftX = bounds.x + bounds.width / 2 + 12;
              const shiftY = bounds.y + bounds.height / 2 + 12;
              let outers = [];
              if (bounds.y > pb.y) { items.push(...createMeasurementLine(shiftX, pb.y, shiftX, bounds.y, bounds.y - pb.y, 'vertical', { r: 1, g: 0.5, b: 0 })); outers.push(`Top: ${Math.round(bounds.y - pb.y)}`); }
              if (bounds.x > pb.x) { items.push(...createMeasurementLine(pb.x, shiftY, bounds.x, shiftY, bounds.x - pb.x, 'horizontal', { r: 1, g: 0.5, b: 0 })); outers.push(`Left: ${Math.round(bounds.x - pb.x)}`); }
              if (pb.x + pb.width > bounds.x + bounds.width) { items.push(...createMeasurementLine(bounds.x + bounds.width, shiftY, pb.x + pb.width, shiftY, (pb.x + pb.width) - (bounds.x + bounds.width), 'horizontal', { r: 1, g: 0.5, b: 0 })); outers.push(`Right: ${Math.round((pb.x + pb.width) - (bounds.x + bounds.width))}`); }
              if (pb.y + pb.height > bounds.y + bounds.height) { items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height, shiftX, pb.y + pb.height, (pb.y + pb.height) - (bounds.y + bounds.height), 'vertical', { r: 1, g: 0.5, b: 0 })); outers.push(`Bottom: ${Math.round((pb.y + pb.height) - (bounds.y + bounds.height))}`); }
              if (outers.length > 0) appliedDetails.push(`Espaçamento Externo: ${outers.join(', ')}`);
            }
          } else {
            figma.notify("Outer padding necessita que o node esteja dentro de um frame.");
          }
        }

        if (items.length > 0) {
          const group = figma.group(items, figma.currentPage);
          group.name = `[Medida] ${node.name}`;
          group.locked = true;
          group.setPluginData('handexCategory', 'medida');
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
        //   auxFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.98 } }];
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
        //   connector.strokes = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.7 } }];
        //   connector.strokeWeight = 1.5;
        //   connector.dashPattern = [4, 4];
        //
        //   appliedMeasuresList.push({ name: node.name, nodeId: auxFrame.id, details: appliedDetails });
        // }
      }

      figma.ui.postMessage({ type: "measurements-applied", data: appliedMeasuresList });
      figma.notify("Medidas aplicadas com sucesso!");
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
  //         connector.strokes = [{ type: 'SOLID', color: { r: 0.3, g: 0.5, b: 0.9 } }];
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
    // Se veio um nodeId específico, usa ele; senão usa a seleção atual do canvas
    let selection;
    if (msg.nodeId) {
      const specificNode = await figma.getNodeByIdAsync(msg.nodeId);
      selection = specificNode ? [specificNode] : [];
    } else {
      selection = figma.currentPage.selection;
    }
    const _scanFrameId = msg.frameId || null;

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
    const rawReferenceTokens = msg.referenceTokens || null;
    const referenceTokens = (() => {
      if (!rawReferenceTokens || !selectedLibSlugs) return rawReferenceTokens;
      const list = Array.isArray(rawReferenceTokens) ? rawReferenceTokens : [rawReferenceTokens];
      const filtered = list.filter(lib => lib && lib.slug && selectedLibSlugs.includes(lib.slug));
      return filtered.length > 0 ? filtered : rawReferenceTokens;
    })();
    const isAudit = msg.isAudit || false;
    const allowedCategories = msg.categories || null; // Array of strings or null

    // Wraps auditProperty + derives the legacy isDS flag (true | "warning" | false).
    // Returns an object that can be spread into the prop, e.g.:
    //   props.push({ ..., ...audit("colors", hex, key) });
    // isRemote: variável ou estilo vem de lib publicada (variable.remote / style.remote).
    // Nesse caso o Figma já garante a origem — não precisa checar no skeleton.
    function audit(propType, propValue, propKey, propName, isRemote) {
      if (isRemote) {
        return { isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: 'remote', matchedIn: null, matchedTokenName: null, closestMatch: null };
      }
      const result = auditProperty(propName, propValue, propType, propKey, referenceTokens, isAudit);
      const isDS = result.score >= AUDIT_SCORE.EXACT ? true
                 : result.score >= AUDIT_SCORE.SOFT ? "warning"
                 : false;
      let closestMatch = null;
      if (isAudit && result.score < AUDIT_THRESHOLDS.AJUSTE) {
        closestMatch = suggestClosestMatch(propType, propValue, referenceTokens);
      }
      return {
        isDS,
        score: isAudit ? result.score : null,
        matchedBy: result.matchedBy,
        matchedIn: result.matchedIn,
        matchedTokenName: result.matchedTokenName,
        closestMatch
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
      return variable ? { name: variable.name, key: variable.key, remote: variable.remote === true } : null;
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
            const vInfo = await getVar(n, "fills");
            const name = (vInfo && vInfo.name) || styleName || hex;
            const key = (vInfo && vInfo.key) || styleKey;
            const _isRemote = (vInfo && vInfo.remote) || fillStyleRemote;
            props.push({ type: "color", name, value: hex, rawValue: hex, key, variableKey: vInfo ? vInfo.key : null, styleKey, label: "Cor (Fill)", ...audit("colors", hex, key, name, _isRemote) });
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
        const family = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.family : "Mixed";
        const fontStyle = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.style : "Mixed";
        const size = (n.fontSize && n.fontSize !== figma.mixed) ? n.fontSize : "Mixed";
        const name = styleName || `${family} ${fontStyle} (${size}px)`;
        const rawSize = typeof size === "number" ? size : null;
        props.push({ type: "typography", name, value: name, rawValue: rawSize, key: styleKey, styleKey, label: "Tipografia", ...audit("typography", name, styleKey, name, textStyleRemote) });
      }

      // Spacing, Alignment
      if ('layoutMode' in n && n.layoutMode !== "NONE") {
        if (n.itemSpacing !== figma.mixed && n.itemSpacing > 0) {
          const vInfo = await getVar(n, "itemSpacing");
          const val = `${n.itemSpacing}px`;
          const name = (vInfo && vInfo.name) || val;
          const propKey = vInfo ? vInfo.key : null;
          props.push({ type: "spacing", name, value: val, rawValue: n.itemSpacing, key: propKey, variableKey: propKey, label: "Gap", ...audit("spacing", val, propKey, name, vInfo && vInfo.remote) });
        }
        const paddings = [
          { prop: 'paddingTop', label: 'Top' }, { prop: 'paddingRight', label: 'Right' },
          { prop: 'paddingBottom', label: 'Bottom' }, { prop: 'paddingLeft', label: 'Left' }
        ];
        for (const p of paddings) {
          if (n[p.prop] > 0) {
            const vInfo = await getVar(n, p.prop);
            const val = `${n[p.prop]}px`;
            const name = (vInfo && vInfo.name) || val;
            const propKey = vInfo ? vInfo.key : null;
            props.push({ type: "spacing", name, value: val, rawValue: n[p.prop], key: propKey, variableKey: propKey, label: `Padding ${p.label}`, ...audit("spacing", val, propKey, name, vInfo && vInfo.remote) });
          }
        }
      }

      // Borders
      if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0) {
        // ONLY SCAN VISIBLE STROKES WITH WEIGHT > 0
        const visibleStroke = n.strokes.find(s => s.visible !== false && (s.opacity === undefined || s.opacity > 0));
        
        if (visibleStroke && 'strokeWeight' in n && n.strokeWeight !== figma.mixed && n.strokeWeight > 0) {
          const vInfo = await getVar(n, "strokeWeight");
          const val = `${n.strokeWeight}px`;
          const name = (vInfo && vInfo.name) || val;
          const propKey = vInfo ? vInfo.key : null;

          // Whitelist 1px and 0px border width: treat as exact match.
          const whitelisted = (val === "1px" || val === "0px");
          const auditFields = whitelisted
            ? { isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "value", matchedIn: null }
            : audit("borders", val, propKey, name);

          props.push({ type: "strokeWeight", name, value: val, rawValue: n.strokeWeight, key: propKey, variableKey: propKey, label: "Border Width", ...auditFields });

          if (visibleStroke.type === "SOLID") {
            const hex = rgbToHex(visibleStroke.color.r, visibleStroke.color.g, visibleStroke.color.b).toUpperCase();
            let styleName = null; let styleKey = null; let strokeStyleRemote = false;
            if ('strokeStyleId' in n && n.strokeStyleId) {
              const st = await figma.getStyleByIdAsync(n.strokeStyleId);
              if (st) { styleName = st.name; styleKey = st.key; strokeStyleRemote = st.remote === true; }
            }
            const sVar = await getVar(n, "strokes");
            const strokeKey = (sVar && sVar.key) || styleKey;
            const strokeName = (sVar && sVar.name) || styleName || hex;
            props.push({ type: "stroke", name: strokeName, value: hex, rawValue: hex, key: strokeKey, variableKey: sVar ? sVar.key : null, styleKey, label: "Border Color", ...audit("colors", hex, strokeKey, strokeName, (sVar && sVar.remote) || strokeStyleRemote) });
          }
        }
      }

      if ('cornerRadius' in n && n.cornerRadius !== figma.mixed && n.cornerRadius > 0) {
        const vInfo = await getVar(n, "cornerRadius");
        const val = `${n.cornerRadius}px`;
        const name = (vInfo && vInfo.name) || val;
        const propKey = vInfo ? vInfo.key : null;
        props.push({ type: "radius", name, value: val, rawValue: n.cornerRadius, key: propKey, variableKey: propKey, label: "Radius", ...audit("borders", val, propKey, name, vInfo && vInfo.remote) });
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
             const name = styleName || `${effect.type} (${effect.type.includes('SHADOW') ? 'Sombra' : 'Blur'})`;
             props.push({ type: "effect", name, value: effect.type, key: styleKey, styleKey, label: "Effect", ...audit("effects", effect.type, styleKey, name, effectStyleRemote) });
          }
        }
      }

      // RESIZING (Width / Height behavior)
      if (n.type !== "PAGE" && n.parent && n.parent.type !== "PAGE") {
        const parent = n.parent;
        let wMode = "Fixed";
        let hMode = "Fixed";

        // Logic for Width
        if (parent.layoutMode === "HORIZONTAL" && n.layoutGrow === 1) wMode = "Fill Container";
        else if (parent.layoutMode === "VERTICAL" && n.layoutAlign === "STRETCH") wMode = "Fill Container";
        else if (n.layoutMode && ((n.layoutMode === "HORIZONTAL" && n.primaryAxisSizingMode === "AUTO") || (n.layoutMode === "VERTICAL" && n.counterAxisSizingMode === "AUTO"))) wMode = "Hug Contents";

        // Logic for Height
        if (parent.layoutMode === "VERTICAL" && n.layoutGrow === 1) hMode = "Fill Container";
        else if (parent.layoutMode === "HORIZONTAL" && n.layoutAlign === "STRETCH") hMode = "Fill Container";
        else if (n.layoutMode && ((n.layoutMode === "VERTICAL" && n.primaryAxisSizingMode === "AUTO") || (n.layoutMode === "HORIZONTAL" && n.counterAxisSizingMode === "AUTO"))) hMode = "Hug Contents";

        props.push({ type: "layout", name: wMode, value: wMode, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: "W Sizing" });
        props.push({ type: "layout", name: hMode, value: hMode, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: "H Sizing" });
      }

      // VARIANTS (For Instances)
      if (n.type === "INSTANCE" && n.componentProperties) {
        Object.entries(n.componentProperties).forEach(([propName, propObj]) => {
          // Format name: remove #... suffix if present
          const cleanName = propName.split("#")[0];
          const val = String(propObj.value);
          // Variants are usually part of DS by definition if the component is [dsc]
          props.push({ type: "variant", name: cleanName, value: val, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: `Prop: ${cleanName}` });
        });
      }

      return props;
    }

    async function addElement(category, node, props) {
      // FILTRAGEM POR CATEGORIA (apenas se não for auditoria)
      if (!isAudit && allowedCategories && allowedCategories.length > 0) {
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

      // Frames: only keep "pure custom" frames — those with zero INSTANCE/COMPONENT descendants.
      // A frame that contains DS components is just a layout container; the conformance
      // signal lives on its children, not on the frame itself.
      if (category === "frames") {
        const _hasDSChild = (n) => {
          if (!n.children) return false;
          for (const c of n.children) {
            if (c.type === 'INSTANCE' || c.type === 'COMPONENT') return true;
            if (_hasDSChild(c)) return true;
          }
          return false;
        };
        if (_hasDSChild(node)) return;
      }

      const name = node.name;

      let componentKey = null;
      let mainComp = null;
      if (node.type === "INSTANCE") {
        mainComp = await node.getMainComponentAsync();
        if (mainComp) componentKey = mainComp.key;
      } else if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        componentKey = node.key;
      }

      let dsElement = false;
      let elementScore = null;
      let elementMatchedBy = null;
      let elementMatchedIn = null;
      let elementMatchedTokenName = null;
      if (category === "components" || category === "icons") {
        const a = audit(category, name, componentKey, name);
        dsElement = a.isDS;
        elementScore = a.score;
        elementMatchedBy = a.matchedBy;
        elementMatchedIn = a.matchedIn;
        elementMatchedTokenName = a.matchedTokenName;
        // Convenção [dsc] no nome confirma conformidade (fallback quando chave não está no skeleton)
        if (dsElement !== true && /^\[dsc\]/i.test(name)) dsElement = true;
        // Instância de biblioteca publicada (remote=true) → conforme ao DSC por definição
        if (dsElement !== true && node.type === 'INSTANCE' && mainComp && mainComp.remote) {
          dsElement = true;
        }
      }
      if (category === "frames") {
        // Frame é conforme se todos os seus tokens de estilo vêm do DSC.
        // Props sem isDS definido (variantes, etc.) são ignoradas na conta.
        const _auditableProps = props.filter(p => p.isDS !== undefined && p.type !== 'variant');
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
          // Token de estilo aplicado + fonte CAIXAstd = tipografia conforme ao DSC
          if (dsElement === false && _typoProp.styleKey) {
            const _family = (node.fontName && node.fontName !== figma.mixed) ? node.fontName.family : '';
            if (/caixa/i.test(_family)) dsElement = true;
          }
        }
      }

      // Pluck variant props from props[] into a separate flat list so the UI
      // can render them as pills in the card header (most relevant info for dev).
      const variants = props
        .filter(p => p.type === "variant")
        .map(p => ({ name: p.name, value: p.value }));

      const map = specs[category];
      if (!map.has(name)) {
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
          variants: variants,
          nodeId: node.id,
          layers: new Set([name]),
          properties: props
        };
        map.set(name, itemObj);
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
          variants: variants,
          properties: props
        });
      } else {
        const item = map.get(name);
        item.layers.add(name);
      }
    }

    async function extractSpecs(n, depth) {
      if ((depth || 0) > 8) return;
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
        framePreview = await selection[0].exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      } catch (err) {
        console.error("Erro ao exportar preview do frame principal:", err);
      }
    }

    const previewPromises = [];
    const prepareListWithPreviews = async (map) => {
      const items = Array.from(map.values());
      for (const item of items) {
        if (item.nodeId) {
          const node = await figma.getNodeByIdAsync(item.nodeId);
          if (node && 'exportAsync' in node) {
            previewPromises.push(
              node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } })
                .then(bytes => { item.preview = bytes; })
                .catch(() => { item.preview = null; })
            );
          }
        }
      }
    };

    await prepareListWithPreviews(specs.components);
    await prepareListWithPreviews(specs.icons);
    await prepareListWithPreviews(specs.typography);
    await prepareListWithPreviews(specs.frames);
    await prepareListWithPreviews(specs.vectors);
    await Promise.all(previewPromises);

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

      const red = { r: 1, g: 0.2, b: 0.2 };
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
          created++;
        }
      }

      figma.notify(`${created} medida(s) reaplicada(s) no canvas!`);
    })();
  }

  if (msg.type === "request-spec-properties") {
    const properties = [];
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("Selecione um elemento para escaneá-lo.");
      figma.ui.postMessage({ type: "show-spec-properties", properties: [] });
      return;
    }

    const node = selection[0];
    const getVar = async (p) => {
      if (!node.boundVariables) return null;
      const v = node.boundVariables[p];
      if (!v) return null;
      const id = Array.isArray(v) ? (v[0] && v[0].id) : v.id;
      if (!id) return null;
      const variable = await figma.variables.getVariableByIdAsync(id);
      return variable ? variable.name : null;
    };

    // 1. Dimensions
    if ("height" in node) {
      const token = await getVar("height");
      properties.push({ key: "height", label: "Altura", value: Math.round(node.height) + "px", token });
    }
    if ("width" in node) {
      const token = await getVar("width");
      properties.push({ key: "width", label: "Largura", value: Math.round(node.width) + "px", token });
    }

    // 2. Corner Radius
    if ("cornerRadius" in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
      const token = await getVar("cornerRadius");
      properties.push({ key: "radius", label: "Raio de borda", value: node.cornerRadius + "px", token });
    }

    // 3. Auto Layout
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      properties.push({ key: "direction", label: "Direção", value: node.layoutMode === "HORIZONTAL" ? "Horizontal" : "Vertical" });

      const align = `${node.primaryAxisAlignItems} / ${node.counterAxisAlignItems}`;
      properties.push({ key: "alignment", label: "Alinhamento", value: align });

      if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) {
        const token = await getVar("itemSpacing");
        properties.push({ key: "gap", label: "Espaçamento (Gap)", value: node.itemSpacing + "px", token });
      }

      const pt = node.paddingTop || 0, pr = node.paddingRight || 0, pb = node.paddingBottom || 0, pl = node.paddingLeft || 0;
      if (pt + pr + pb + pl > 0) {
        const tT = await getVar("paddingTop"), tR = await getVar("paddingRight"), tB = await getVar("paddingBottom"), tL = await getVar("paddingLeft");
        const vT = tT || `${pt}px`, vR = tR || `${pr}px`, vB = tB || `${pb}px`, vL = tL || `${pl}px`;
        let val, token;
        if (vT === vR && vR === vB && vB === vL) {
          val = vT;                           // todos iguais — mostra 1
        } else if (vT === vB && vR === vL) {
          val = `${vT} ${vR}`;               // simétrico V H
        } else {
          val = `${vT} ${vR} ${vB} ${vL}`;  // formato completo T R B L
        }
        // token: usa o primeiro token encontrado como referência
        token = tT || tR || tB || tL || null;
        properties.push({ key: "padding", label: "Padding", value: val, token });
      }
    }

    // 4. Colors & Strokes
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      const sf = node.fills.find(f => f.type === "SOLID");
      if (sf) {
        const token = await getVar("fills");
        const hexFill = rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase();
        properties.push({ key: "fill", label: "Preenchimento", value: token || hexFill, token });
      }
    }
    if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      const ss = node.strokes.find(s => s.type === "SOLID");
      if (ss) {
        const token = await getVar("strokes");
        const hexStroke = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
        properties.push({ key: "stroke", label: "Contorno", value: token || hexStroke, token });
      }
      if (node.strokeWeight !== figma.mixed && node.strokeWeight > 0) {
        properties.push({ key: "strokeWidth", label: "Espessura de borda", value: node.strokeWeight + "px" });
      }
    }

    // 5. Typography
    if (node.type === "TEXT") {
      if (node.fontName !== figma.mixed) {
        properties.push({ key: "fontFamily", label: "Família", value: node.fontName.family });
        properties.push({ key: "fontWeight", label: "Peso", value: node.fontName.style });
      }
      if (node.fontSize !== figma.mixed) {
        const token = await getVar("fontSize");
        properties.push({ key: "fontSize", label: "Tamanho da fonte", value: node.fontSize + "px", token });
      }
    }

    // 6. Component Properties
    if (node.type === "INSTANCE" && await node.getMainComponentAsync()) {
      const variantProps = node.variantProperties;
      if (variantProps) {
        for (const [key, val] of Object.entries(variantProps)) {
          properties.push({ key: `variant-${key}`, label: `Prop: ${key}`, value: val });
        }
      }
    }

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
    const node = msg.targetNodeId ? await figma.getNodeByIdAsync(msg.targetNodeId) : null;
    const bounds = node && (node.absoluteBoundingBox || node.absoluteRenderBounds);

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
    // Nasce ao lado do elemento (mesmo ponto de partida de hoje), já como
    // prévia arrastável -- não é mais um círculo genérico.
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
      title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
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
        desc.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
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
          row.name = `Prop/${p.label}`;
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
          pLabel.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
          pLabel.characters = p.label.toUpperCase();
          pLabel.textAutoResize = "WIDTH_AND_HEIGHT";

          const pVal = figma.createText();
          pVal.fontName = { family: "Inter", style: "Bold" };
          pVal.fontSize = 11;
          pVal.fills = [{ type: "SOLID", color: p.token ? themeColor : { r: 0.1, g: 0.1, b: 0.1 } }];
          pVal.characters = p.token || String(p.value);
          pVal.textAutoResize = "HEIGHT";

          row.appendChild(pLabel);
          row.appendChild(pVal);
          pVal.layoutAlign = "STRETCH";

          propsFrame.appendChild(row);
        });
        specCard.appendChild(propsFrame);
      }

      // Exceções mapeadas para esta spec
      const specExcecoes = opts.excecoes || [];
      if (specExcecoes.length > 0) {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const excFrame = figma.createFrame();
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 6;
        excFrame.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.97 } }];
        excFrame.paddingLeft = 10; excFrame.paddingRight = 10;
        excFrame.paddingTop = 8; excFrame.paddingBottom = 8;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        excFrame.layoutAlign = "STRETCH";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.29, g: 0.33, b: 0.39 } }];
        excTitle.characters = `CENÁRIOS DE EXCEÇÃO (${specExcecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        const _excTypeRgb = {
          'Erro':        { r: 0.80, g: 0.15, b: 0.15 },
          'Alerta':      { r: 0.80, g: 0.50, b: 0.00 },
          'Sucesso':     { r: 0.10, g: 0.55, b: 0.25 },
          'Confirmação': { r: 0.05, g: 0.35, b: 0.80 },
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
          const typeColor = _excTypeRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 };
          const typeLabel = figma.createText();
          typeLabel.fontName = { family: "Inter", style: "Bold" };
          typeLabel.fontSize = 9;
          typeLabel.fills = [{ type: "SOLID", color: typeColor }];
          typeLabel.characters = `${_excTypeEmoji[exc.tipo] || '❔'} ${(exc.tipo || 'GERAL').toUpperCase()}`;
          typeLabel.textAutoResize = "WIDTH_AND_HEIGHT";
          const titleLabel = figma.createText();
          titleLabel.fontName = { family: "Inter", style: "Regular" };
          titleLabel.fontSize = 10;
          titleLabel.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
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
        linkTxt.fills = [{ type: "SOLID", color: { r: 0.24, g: 0.24, b: 1 } }];
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
        const _stackScanNodes = figma.currentPage.children;
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
    const elCx = elBounds.x + elBounds.width / 2;
    const elCy = elBounds.y + elBounds.height / 2;
    const cardCx = cardBounds.x + cardBounds.width / 2;
    const cardCy = cardBounds.y + cardBounds.height / 2;
    const dx = cardCx - elCx;
    const dy = cardCy - elCy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? 'right' : 'left';
    }
    return dy >= 0 ? 'bottom' : 'top';
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
    const side = msg.guideSide || _computeSideFromBounds(bounds, cardBounds);
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
        obsFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.97, b: 0.91 } }];
        obsFrame.strokes = [{ type: "SOLID", color: { r: 0.98, g: 0.70, b: 0.30 } }];
        obsFrame.strokeWeight = 1;
        obsFrame.cornerRadius = 8;

        const labelText = figma.createText();
        labelText.fontName = { family: "Inter", style: "Bold" };
        labelText.characters = `Obs · ${msg.tipo || 'Exceção'}: ${msg.titulo || ''}`;
        labelText.fontSize = 10;
        labelText.fills = [{ type: "SOLID", color: { r: 0.72, g: 0.39, b: 0.0 } }];
        obsFrame.appendChild(labelText);

        const obsText = figma.createText();
        obsText.fontName = { family: "Inter", style: "Regular" };
        obsText.characters = msg.obs;
        obsText.fontSize = 11;
        obsText.fills = [{ type: "SOLID", color: { r: 0.25, g: 0.25, b: 0.25 } }];
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
    const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
    figma.clientStorage.setAsync('handoffData_' + fileKey, msg.data).catch(err => {
      console.warn("Storage save failed (possibly missing plugin ID in manifest):", err);
    });
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
        return;
      }
      await _buildFlowConnection(selection[0], null, msg);
      return;
    }

    if (selection.length < 2) {
      figma.notify("Selecione pelo menos dois elementos para conectar.");
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

    if (msg.oldGroupId) {
      try {
        const oldGroup = await figma.getNodeByIdAsync(msg.oldGroupId);
        if (oldGroup) oldGroup.remove();
      } catch (e) {}
    }

    await _buildFlowConnection(nodeA, nodeB, msg);
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
        if (oldGroup) oldGroup.remove();
        const result = await _buildFlowConnection(nodeA, nodeB, { ...flow, flowType: flow.type, flowName: flow.name, flowId: flow.flowUid, suppressFlowCreatedBroadcast: true });
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
      legendFrame.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
      legendFrame.strokeWeight = 1;
      legendFrame.primaryAxisSizingMode = "AUTO";
      legendFrame.counterAxisSizingMode = "AUTO";

      // Title
      const legendTitle = figma.createText();
      legendTitle.fontName = { family: "Inter", style: "Bold" };
      legendTitle.characters = "Legendas de Especificação";
      legendTitle.fontSize = 14;
      legendTitle.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
      legendFrame.appendChild(legendTitle);

      const types = [
        { name: "Cenário de exceção", c: { r: 0.97, g: 0.45, b: 0.08 } },
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
        text.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];

        row.appendChild(circle);
        row.appendChild(text);
        legendFrame.appendChild(row);
      }

      legendFrame.x = figma.viewport.center.x - 120;
      legendFrame.y = figma.viewport.center.y - 100;
      legendFrame.locked = true;
      legendFrame.setPluginData('handexCategory', 'fluxo');
      figma.currentPage.appendChild(legendFrame);
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
  if (msg.type === 'pull-ficha-version-from-canvas') {
    // Try/catch cobre toda a leitura: o frontend depende de sempre receber
    // uma resposta para não travar o botão "Gerar Ficha" (ver timeout de
    // segurança em openHandoffInjectModal, modules/handoff.js).
    try {
      // Escopa pelo título do projeto atual quando disponível -- sem isso,
      // fichas de OUTROS projetos na mesma página (mesmo prefixo de nome)
      // podiam ser lidas como "a mais recente" e sugerir a versão errada.
      const _titulo = (msg.titulo || '').trim();
      const _prefix = _titulo ? `Handex | Ficha de Projeto | ${_titulo}` : 'Handex | Ficha de Projeto';
      const fichas = figma.currentPage.children.filter(
        n => n.type === 'FRAME' && n.name.startsWith(_prefix)
      );
      if (fichas.length === 0) {
        figma.ui.postMessage({ type: 'ficha-version-pulled', versao: null, temFicha: false });
        return;
      }
      // Nome inclui timestamp "YYYY-MM-DD HH:MM" no final -- ordenação de string já resolve "mais recente"
      fichas.sort((a, b) => a.name.localeCompare(b.name));
      const latest = fichas[fichas.length - 1];
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
        blue:      { r: 0.239, g: 0.239, b: 1     },
        blueDark:  { r: 0.137, g: 0.137, b: 0.659 },
        blueLight: { r: 0.933, g: 0.941, b: 1     },
        orange:    { r: 0.961, g: 0.706, b: 0     },
        teal:      { r: 0.298, g: 0.745, b: 0.714 },
        tealLight: { r: 0.851, g: 0.961, b: 0.957 },
        lime:      { r: 0.831, g: 0.969, b: 0.188 },
        yellow:    { r: 1,     g: 0.949, b: 0.749 },
        white:     { r: 1,     g: 1,     b: 1     },
        bg:        { r: 0.941, g: 0.953, b: 0.969 },
        bgBlue:    { r: 0.933, g: 0.941, b: 1     },
        line:      { r: 0.882, g: 0.894, b: 0.910 },
        text:      { r: 0.118, g: 0.161, b: 0.231 },
        muted:     { r: 0.392, g: 0.455, b: 0.545 },
        light:     { r: 0.651, g: 0.706, b: 0.780 },
        green:     { r: 0.133, g: 0.694, b: 0.298 },
        greenLight:{ r: 0.941, g: 0.992, b: 0.949 },
        amber:     { r: 0.961, g: 0.769, b: 0.188 },
        red:       { r: 0.941, g: 0.263, b: 0.212 },
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
          { label: "Suposições", sub: "O que acreditamos, mas não validamos.",   hdr: C.amber,  bg: { r:1, g:0.980, b:0.929 } },
          { label: "Dúvidas",   sub: "O que precisamos descobrir.",              hdr: C.red,    bg: { r:1, g:0.949, b:0.949 } },
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

        const stickyBg = rct(106, 84, { r:1, g:0.937, b:0.698 }, 4);
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
        mainFrame = vb(800, 0, 0, { r:0.961, g:0.98, b:0.992 }, 16); 
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
        mainFrame = vb(1000, 0, 0, { r:0.941, g:0.965, b:0.976 }, 16); 
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
          
          const eTop = vb(null, 16, 4, { r:0.2, g:0.8, b:0.96 }, 8);
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
            const card = vb(200, 16, 0, { r:0.94, g:0.95, b:0.96 }, 8); 
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

  if (msg.type === "close") {
    figma.closePlugin();
  }
};


