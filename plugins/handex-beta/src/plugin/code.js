import { auditProperty, AUDIT_SCORE, AUDIT_THRESHOLDS, frameJsonTemplate, suggestClosestMatch } from './audit.js';
import A11Y_CONTENT from './refs/design-acessivel-content.json';
// BETA-ONLY: a11y-formulario-dinamico — refs/design-acessivel-component-properties.json
// não existe na main; precisa ser gerado lá também. Ver MIGRATION-BETA-TO-MAIN.md.
import A11Y_COMPONENT_PROPERTIES_RAW from './refs/design-acessivel-component-properties.json';
// BETA-ONLY: a11y-deteccao-automatica — refs/dsc-component-a11y-mapping.json
// não existe na main. Ver MIGRATION-BETA-TO-MAIN.md.
import DSC_A11Y_MAPPING from './refs/dsc-component-a11y-mapping.json';
// BETA-ONLY: a11y-deteccao-automatica — usado só para resolver componente DSC
// → categoria de a11y via _getDscComponentKeyToFrameMap. Ver MIGRATION-BETA-TO-MAIN.md.
import REF_SKELETON from './refs/_skeleton.json';

figma.showUI(__html__, { width: 480, height: 750 });

let activeHighlightNode = null;

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

// ══ BETA-ONLY: a11y-ordem-tabulacao + flows-mini-mapa-conector-criacao (início) ══
// Listener único de selectionchange compartilhado pelas duas features: posta
// 'flow-selection-bounds' sempre (flows-mini-mapa-conector-criacao) e, quando
// o modo de clique sequencial está ativo, também 'tab-order-selection-changed'
// (a11y-ordem-tabulacao). Ver MIGRATION-BETA-TO-MAIN.md — cuidado ao migrar
// uma feature sem a outra: este listener precisa ser dividido ou adaptado.
// --- Acessibilidade --- "Ordem de Tabulação": modo de clique sequencial.
// Reaproveita o MESMO listener global de selectionchange (já usado pelo
// preview de conexão de fluxos) em vez de registrar um segundo — quando o
// modo está ativo (ligado/desligado por start-tab-order-mode/stop-tab-order-mode,
// vindos do frontend) e há exatamente 1 elemento selecionado, também posta
// tab-order-selection-changed; seleção vazia ou múltipla é ignorada nesse modo.
let _tabOrderModeActive = false;

figma.on('selectionchange', () => {
  figma.ui.postMessage({ type: 'flow-selection-bounds', nodes: _getFlowSelectionBoundsPayload() });
  if (_tabOrderModeActive) {
    const sel = figma.currentPage.selection;
    if (sel.length === 1) {
      figma.ui.postMessage({ type: 'tab-order-selection-changed', nodeId: sel[0].id, nodeName: sel[0].name });
    }
  }
});

function _nodeOnCurrentPage(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n != null && n.id === figma.currentPage.id;
}

// BETA-ONLY: flows-mini-mapa-conector-criacao
function _getFlowSelectionBoundsPayload() {
  return figma.currentPage.selection.slice(0, 2).map(n => {
    const b = n.absoluteBoundingBox || n.absoluteRenderBounds;
    if (!b) return null;
    return { id: n.id, name: n.name, x: b.x, y: b.y, width: b.width, height: b.height };
  }).filter(Boolean);
}
// ══ BETA-ONLY: a11y-ordem-tabulacao + flows-mini-mapa-conector-criacao (fim, setup do listener) ══

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
// Fase 2c — import real dos componentes da lib "Design Acessível" em vez de
// desenhar o card procedural. Ver .claude/agents/accessibility-specialist.md
// ("Mecânica de variantes aninhadas") e refs/design-acessivel-content.json.
// ============================================================

// ══ BETA-ONLY: a11y-formulario-dinamico (início) ══
// Depende de: refs/design-acessivel-component-properties.json (import JSON,
// só existe na beta). Ver MIGRATION-BETA-TO-MAIN.md, seção 1.
// Duplicação consciente: mesmo catálogo de component properties da lib
// "Design Acessível" que accessibility.js (frontend) usa pra RENDERIZAR o
// formulário dinâmico da categoria "elemento" — aqui o backend precisa dele
// pra APLICAR (setProperties na instância aninhada certa). Diferente de
// A11Y_AGRUPAMENTO_KEYS/A11Y_CONECTOR_LINHA_KEYS (só-backend, o frontend não
// participa dessas), esta é uma das poucas constantes do módulo a11y que
// PRECISA existir nos dois runtimes — front pra render, back pra aplicar —
// então a duplicação (aqui via import de JSON; lá via literal JS colado,
// já que o frontend não tem bundler de módulos) é decisão consciente, não
// esquecimento. Se o catálogo mudar (refetch da lib), rodar
// `npm run refs:a11y-properties` e colar de novo em accessibility.js.
// ============================================================
// ══ BETA-ONLY: a11y-formulario-dinamico (fim do bloco acima) ══

// ══ BETA-ONLY: a11y-deteccao-automatica (início) ══
// Depende de: refs/dsc-component-a11y-mapping.json, refs/_skeleton.json
// (REF_SKELETON). Ver MIGRATION-BETA-TO-MAIN.md, seção 4.
// Detecção aditiva: instância de componente DSC → categoria de a11y
// (fundação para uma futura pré-sugestão de handoff de acessibilidade —
// NÃO implementada ainda, ver tarefa que introduziu este bloco). Só
// enriquece o resultado do scan com um campo novo (`dscComponentMatch`),
// nunca altera isDS/score/matchedBy existentes.
// ============================================================

// key (componentKey resolvido via getMainComponentAsync/mainComp.key) →
// containingFrame (nome do component set real, ex: "[dsc] Accordion").
// Construído uma única vez a partir de REF_SKELETON.libraries
// (slug "web-angular-react" → componentsDetailed), não de
// DSC_A11Y_MAPPING.*.sampleKeys (que são só amostras de 3 chaves por
// família, insuficientes para resolver qualquer instância real).
let _dscComponentKeyToFrameMap = null;
function _getDscComponentKeyToFrameMap() {
  if (_dscComponentKeyToFrameMap) return _dscComponentKeyToFrameMap;
  _dscComponentKeyToFrameMap = new Map();
  const lib = (REF_SKELETON && Array.isArray(REF_SKELETON.libraries))
    ? REF_SKELETON.libraries.find(l => l.slug === 'web-angular-react')
    : null;
  if (lib && Array.isArray(lib.componentsDetailed)) {
    lib.componentsDetailed.forEach(c => {
      if (c && c.key && c.containingFrame) _dscComponentKeyToFrameMap.set(c.key, c.containingFrame);
    });
  }
  return _dscComponentKeyToFrameMap;
}

// containingFrame → { shortName, confidence } (só alta/baixa confiança;
// famílias sem match não entram no mapa e resultam em dscComponentMatch: null).
let _dscFrameToA11yMap = null;
function _getDscFrameToA11yMap() {
  if (_dscFrameToA11yMap) return _dscFrameToA11yMap;
  _dscFrameToA11yMap = new Map();
  const buckets = [DSC_A11Y_MAPPING.altaConfianca, DSC_A11Y_MAPPING.baixaConfianca];
  buckets.forEach(bucket => {
    if (!Array.isArray(bucket)) return;
    bucket.forEach(entry => {
      if (entry && entry.containingFrame && entry.match) {
        _dscFrameToA11yMap.set(entry.containingFrame, {
          shortName: entry.match.shortName,
          confidence: entry.match.confidence
        });
      }
    });
  });
  return _dscFrameToA11yMap;
}

// Retorna { containingFrame, a11yCategory, confidence } ou null.
// componentKey deve ser o mainComp.key de uma INSTANCE remote (mesma
// condição que já decide "conforme ao DSC" hoje) — chamador garante isso.
function _resolveDscComponentA11yMatch(componentKey) {
  if (!componentKey) return null;
  const containingFrame = _getDscComponentKeyToFrameMap().get(componentKey);
  if (!containingFrame) return null;
  const a11yMatch = _getDscFrameToA11yMap().get(containingFrame);
  if (!a11yMatch) return null;
  return {
    containingFrame,
    a11yCategory: a11yMatch.shortName,
    confidence: a11yMatch.confidence
  };
}

// ══ BETA-ONLY: a11y-mapeamento-interativo (início) ══
// shortNames (mesmo vocabulário de a11yCategory retornado por
// _resolveDscComponentA11yMatch) que representam controles reais de foco de
// teclado — usados pra filtrar a geração automática de Ordem de Tabulação
// (generate-tab-order-from-layers), que deve percorrer só "links, botões e
// campos de formulário" (texto da lib "Design Acessível"), não qualquer
// INSTANCE/COMPONENT solto no canvas (ícone decorativo, card, imagem, badge).
// Decisão de produto (confirmada pelo designer): inclui 'inputs' (após
// achado 2 cobre select/slider/datepicker/etc.), 'accordion' (cabeçalho é
// focável) e 'breadcrumb' (é composto por links). NÃO inclui 'dialog',
// 'snackbar', 'table', 'listas' (não são o elemento focável em si) nem
// 'imagem'/'titulo'/'decorativo' (nunca focáveis).
const A11Y_INTERACTIVE_SHORTNAMES = new Set([
  'button', 'checkbox', 'radio button', 'switch', 'inputs',
  'paginator', 'stepper', 'tab group', 'accordion', 'breadcrumb'
]);
// ══ BETA-ONLY: a11y-mapeamento-interativo (fim) ══

// ============================================================
// Expansão da detecção aditiva para texto (categoria "titulo") e
// ícones/vetores (categoria "decorativo") — ver tarefa que introduziu este
// bloco. Diferente de _resolveDscComponentA11yMatch acima (que casa
// componentKey real contra o skeleton DSC, com possível confiança "alta"),
// estas duas funções NUNCA têm uma key/nome de biblioteca real para casar —
// são heurísticas de nome de camada/estilo, propositalmente conservadoras, e
// por isso SEMPRE retornam confidence: 'baixa'. O shape retornado usa
// containingFrame: null (não existe frame de componente DSC por trás) e um
// campo `source` extra para o frontend/telemetria saberem que a origem foi
// heurística, não correspondência de biblioteca.
// ============================================================

// Nome de estilo de texto nomeado (styleName, quando o TEXT usa um Text
// Style do Figma) ou nome da própria camada — sinal fraco, mas suficiente
// pra sugerir (nunca afirmar) que um texto é um "Nível de Título". Não
// analisa tamanho de fonte, peso ou posição — isso seria heurística visual
// elaborada, fora de escopo (ver tarefa). Também não tenta advinhar o nível
// (h1..h6): o designer escolhe o nível certo no formulário depois de "Usar
// sugestão"; aqui só decidimos SE parece um título, não QUAL nível.
const _A11Y_HEADING_NAME_REGEX = /\bh[1-6]\b|título|titulo|heading|headline/i;

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
    source: styleName && signal === styleName ? 'text-style-name' : 'layer-name'
  };
}

// Ícone/vetor solto (não coberto por _resolveDscComponentA11yMatch, ou seja,
// não é instância remote de um componente DSC catalogado) — sugere "Elemento
// Decorativo" só quando não há indício de que o elemento carregue
// texto/rótulo próprio (o que sugeriria antes um componente com nome
// acessível do que algo puramente decorativo). Sinal: nome da camada não
// menciona termos de rótulo/label/alt/ícone-com-função (ex.: "icon-button",
// "ícone informativo") — mantém conservador, sempre confidence 'baixa'.
const _A11Y_NON_DECORATIVE_NAME_REGEX = /label|rótulo|rotulo|alt|informativ|funcional|clic[áa]vel|button|botão|botao/i;

function _resolveDecorativeA11yMatch(node) {
  const layerName = node && node.name ? node.name : '';
  if (_A11Y_NON_DECORATIVE_NAME_REGEX.test(layerName)) return null;
  return {
    containingFrame: null,
    a11yCategory: 'decorativo',
    confidence: 'baixa',
    source: 'layer-name'
  };
}

// ══ BETA-ONLY: a11y-mapeamento-interativo (início) ══
// Node com fill do tipo IMAGE (categoria "images" do scan, ver
// extractSpecs/_walk mais abaixo) — imagem de CONTEÚDO real (não ícone
// decorativo), portanto precisa de texto alternativo pra leitor de tela.
// Categoria de a11y correta é o shortName 'imagem' (não 'decorativo' — ver
// _resolveDecorativeA11yMatch acima, que é só pra ícone/vetor sem função) e
// NÃO 'elemento' (que é a categoria MACRO/rótulo de formulário, não o
// shortName usado em dscComponentMatch.a11yCategory — confirmado contra o
// uso real em accessibility.js, onde shortName 'imagem' cai no branch
// _buildA11yElementoPayload(letter, 'imagem', ...) dentro da categoria macro
// 'elemento'). Sempre confidence 'baixa' — mesmo padrão conservador de
// _resolveDecorativeA11yMatch/_resolveTypographyA11yMatch, sem correspondência
// de biblioteca real por trás.
function _resolveImageA11yMatch(node) {
  return {
    containingFrame: null,
    a11yCategory: 'imagem',
    confidence: 'baixa',
    source: 'image-fill'
  };
}
// ══ BETA-ONLY: a11y-mapeamento-interativo (fim) ══
// ══ BETA-ONLY: a11y-deteccao-automatica (fim) ══

// ══ BETA-ONLY: a11y-formulario-dinamico (retomada — aplicação backend) ══
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

// Property definitions (com syncId real, ex: "observacoes#7489:0") do
// component set "[a11y base]" correspondente ao componente/subtipo escolhido
// no formulário — usado pelas 5 categorias (ver bloco de toggles dinâmicos em
// _tryImportA11yComponent, que resolve o shortName certo por categoria).
// Retorna null se o componente/subtipo não estiver catalogado (fallback
// gracioso: nenhum toggle extra é aplicado).
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
// ══ BETA-ONLY: a11y-formulario-dinamico (fim da aplicação backend) ══

// Procura, em profundidade, a primeira INSTANCE descendente (inclusive a
// própria raiz) que tenha uma componentProperty cujo nome (sem o sufixo
// "#id" que o Figma às vezes adiciona) bata com um dos candidatos, na ordem
// dada. Candidatos múltiplos existem porque nem todo nome de property foi
// confirmado ao vivo no Figma (ver comentários de cada categoria abaixo) —
// se o nome real divergir de todos os candidatos, retorna null e o chamador
// trata como falha (cai no fallback procedural).
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

// Localiza um TEXT node descendente cujo conteúdo atual bate exatamente com
// `value` — usado para achar o campo "Observações" (ou "Descrição", quando
// customizável) dentro do componente real importado, sem depender do nome
// da camada (que não foi catalogado). O valor padrão vem do próprio
// design-acessivel-content.json, então o match tende a ser exato logo após
// o import (antes de qualquer edição).
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

// ══ BETA-ONLY: label-automatico (início) ══
// Chamada por get-selection-name/get-node-main-text mais abaixo. Ver
// MIGRATION-BETA-TO-MAIN.md.
// Primeiro TEXT node VISÍVEL na ordem de camadas (profundidade primeiro,
// mesma ordem em que os filhos aparecem no painel do Figma) — usado pra
// sugerir o texto de Label (accessibilityLabel) a partir do conteúdo real do
// elemento, em vez do designer digitar do zero. Ignora nós com visible ===
// false (não é isso que aparece de fato na tela) e strings vazias/só
// espaço. Best-effort: se não achar nenhum texto, retorna null e o
// formulário permanece vazio como hoje, sem travar nada.
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
// ══ BETA-ONLY: label-automatico (fim) ══

// Best-effort: tenta achar o selo/tag de letra manual (A, B, A1...) dentro
// do componente importado para sincronizar com o texto digitado no
// formulário. Não catalogamos o nome exato dessa camada ainda — procura por
// nome de camada plausível (Tag/Selo/Letra) e, como último recurso, por um
// TEXT node cujo conteúdo atual seja uma letra maiúscula curta (o "molde"
// que a vertical deixou no componente publicado, ex: "A"). Nunca lança erro:
// se não achar, a spec real ainda é criada, só sem o selo sincronizado —
// precisa validação ao vivo no Figma (ver resumo da tarefa).
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

// Tenta reaproveitar o componente REAL da lib "Design Acessível" em vez de
// desenhar o card do zero. Lança (throw) em qualquer ponto de incerteza —
// quem chama trata a exceção como "não deu, volta pro card procedural" (ver
// create-unified-spec). "Estrutura da página" tem dois níveis de instância
// aninhada (variacao → tipo/idioma) — mecânica confirmada via REST API em
// 2026-07-23 (nodes 31:535 "[a11y base] estrutura da página", 31:408 "EE
// marco de navegacao", 31:383 "EE idiomas"; ver
// .claude/agents/accessibility-specialist.md). "titulo da pagina" não tem
// segundo nível (conteúdo fixo); variação "customizavel" (nível 1) e
// "customizavel" dentro de marco de navegação não têm conteúdo catalogado —
// caem no fallback procedural.
async function _tryImportA11yComponent(opts) {
  const type = opts.a11yType;

  const catData = A11Y_CONTENT.categories[type];
  if (!catData || !catData.wrapperComponentKey) throw new Error('a11y-sem-wrapper-key: ' + type);

  const sub = opts.a11ySubtype || {};
  let defaultEntry = null;
  let propCandidates = null;
  let propValue = null;

  if (type === 'elemento') {
    if (sub.isOutro || !sub.componente) throw new Error('a11y-elemento-outro-sem-componente-real');
    defaultEntry = catData.componentes[sub.componente];
    if (!defaultEntry) throw new Error('a11y-elemento-componente-desconhecido: ' + sub.componente);
    // Nome confirmado no material da vertical (ver accessibility-specialist.md).
    propCandidates = ['componente'];
    propValue = sub.componente;
  } else if (type === 'titulo') {
    if (sub.nivel === 'mobile') throw new Error('a11y-titulo-mobile-sem-variante-real');
    defaultEntry = catData.niveis && catData.niveis[sub.nivel];
    if (!defaultEntry) throw new Error('a11y-titulo-nivel-desconhecido: ' + sub.nivel);
    // Nome confirmado no material da vertical.
    propCandidates = ['nivel'];
    propValue = sub.nivel;
  } else if (type === 'decorativo') {
    defaultEntry = catData.subtipos && catData.subtipos[sub.tipo];
    if (!defaultEntry) throw new Error('a11y-decorativo-subtipo-desconhecido: ' + sub.tipo);
    // Nome citado como "variacao" no material da vertical ("variacao=gerais" /
    // "variacao=imagem"), mas não confirmado via REST API node a node — por
    // isso também tenta "tipo" como segundo candidato.
    propCandidates = ['variacao', 'tipo'];
    propValue = sub.tipo;
  } else if (type === 'informacoes') {
    if (sub.subtipo === 'customizavel') throw new Error('a11y-informacoes-customizavel-sem-variante-real');
    defaultEntry = catData.subtipos && catData.subtipos[sub.subtipo];
    if (!defaultEntry) throw new Error('a11y-informacoes-subtipo-desconhecido: ' + sub.subtipo);
    // Nome da property não catalogado no material da vertical — tenta os
    // candidatos mais prováveis. Precisa confirmar ao vivo no Figma.
    propCandidates = ['tipo', 'subtipo', 'variacao'];
    propValue = sub.subtipo;
  } else if (type === 'estrutura') {
    // Nível 1: property "variacao" no set 31:535, valores reais confirmados
    // (idiomas / marco de navegacao / titulo da pagina) — "customizavel" (o
    // 4º valor que o formulário oferece) não existe como variante real.
    if (sub.variacao !== 'idiomas' && sub.variacao !== 'marco de navegacao' && sub.variacao !== 'titulo da pagina') {
      throw new Error('a11y-estrutura-variacao-sem-import-real: ' + sub.variacao);
    }
    propCandidates = ['variacao'];
    propValue = sub.variacao;
    if (sub.variacao === 'idiomas') {
      defaultEntry = catData.subtipos.idiomas && catData.subtipos.idiomas[sub.idioma];
      if (!defaultEntry) throw new Error('a11y-estrutura-idioma-desconhecido: ' + sub.idioma);
    } else if (sub.variacao === 'marco de navegacao') {
      // "customizavel" existe como variante real do sub-set (valor
      // "customizável", com acento) mas não temos Descrição/Notas
      // catalogadas pra ele — cai no fallback procedural.
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

  let found = _findNestedInstanceWithAnyProp(instance, propCandidates); // BETA-ONLY: a11y-formulario-dinamico — era `const`, virou `let` pra permitir reatribuição no bloco de nível 2 abaixo
  if (!found) {
    instance.remove();
    throw new Error('a11y-instancia-aninhada-nao-encontrada: prop~=' + propCandidates.join('|'));
  }

  // Validação combinada com o pedido da tarefa: loga a property completa uma
  // vez por import pra facilitar conferir ao vivo no Figma (nome exato,
  // sufixo #id, opções aceitas) sem precisar de outro ciclo de debug.
  console.log('[a11y-import] propriedade encontrada:', found.key, JSON.stringify(instance.componentProperties));

  try {
    found.instance.setProperties({ [found.key]: propValue });
  } catch (e) {
    instance.remove();
    throw new Error('a11y-set-properties-falhou: ' + (e && e.message ? e.message : e));
  }

  // ══ BETA-ONLY: a11y-formulario-dinamico (início do trecho intercalado em
  // _tryImportA11yComponent — instâncias aninhadas de nível 2/3 e aplicação
  // de variantFields/toggles dinâmicos). Ver MIGRATION-BETA-TO-MAIN.md. ══
  // Categoria "elemento": trocar "componente" no wrapper (found.instance)
  // revela um SEGUNDO nível de instância aninhada (ex: instância "Button",
  // "Accordion"...) — é NELA, não no wrapper, que vivem a property "tipo"
  // (variante secundária, ex: Button tem default/desabilitado/de icone/...)
  // e os 3 toggles booleanos (nome acessivel/observacoes/notas). Confirmado
  // via REST API em 2026-08-19 (node 45:3389, instância "Elementos
  // interativos e imagens" tem só variante+componente; a instância filha
  // "Accordion" tem letter/observacoes/notas de codigo/nome acessivel/tipo).
  // Mesmo padrão de "Estrutura da página" (variacao → tipo) mais abaixo.
  let _elementoNestedFound = null;
  if (type === 'elemento') {
    _elementoNestedFound = _findNestedInstanceWithAnyProp(found.instance, ['tipo', 'nome acessivel', 'observacoes', 'notas']);
    if (_elementoNestedFound) {
      found = _elementoNestedFound;
    }
    // Se não achar, segue com found.instance (nível 1) — toggles/tipo
    // simplesmente não são aplicados, mesma filosofia best-effort do resto
    // da função; a spec real (Descrição/Nota fixas) já foi criada.

    // Variante secundária "tipo" (ex: Button → de icone, Switch → switch e
    // rotulo...) escolhida no <select> dinâmico do formulário (ver
    // _getA11yComponentToggles/variantFields, accessibility.js). Só aplica se
    // o designer escolheu algo diferente do default — best-effort, nunca
    // derruba a criação da spec se o componente não tiver "tipo" ou o valor
    // não existir mais na lib.
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
  // específico); "titulo da pagina" não tem esse segundo nível (conteúdo
  // fixo). Precisa buscar DEPOIS de setProperties acima, porque é a troca de
  // variacao que revela a subárvore certa. Essa mesma instância aninhada
  // ("EE idiomas"/"EE marco de navegacao" no catálogo) já é onde vivem os
  // toggles observacoes/notas dessa categoria — guardada em
  // _estruturaNestedFound pro bloco de toggles dinâmicos mais abaixo.
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
  // decorativos" (nível 2, mesma prop "variacao" — já é 'found' aqui) cujo
  // filho direto "Content" (nível 3) é quem tem observacoes/notas/tipo de
  // verdade. Confirmado via REST API em 2026-08-19 (node 31:553): "Elementos
  // decorativos [variacao]" > "Content [notas, observacoes, tipo]". Guardado
  // pra o bloco de toggles dinâmicos mais abaixo, mesma filosofia de
  // _elementoNestedFound/_estruturaNestedFound.
  let _decorativoNestedFound = null;
  if (type === 'decorativo') {
    _decorativoNestedFound = _findNestedInstanceWithAnyProp(found.instance, ['notas', 'observacoes']) || found;
  }
  // ══ BETA-ONLY: a11y-formulario-dinamico (pausa — próximo trecho é pré-existente) ══

  // Tag manual de Estrutura — o "Conector" (selo/estrela visível no elemento)
  // tem sua própria property "letter#..." num nível irmão de "Elementos
  // estruturais", fora da árvore de variacao/tipo — setProperties direto em
  // vez do texto heurístico usado pra elemento/informacoes (mais confiável,
  // confirmado via REST API).
  if (type === 'estrutura' && opts.letter) {
    const letterFound = _findNestedInstanceWithAnyProp(instance, ['letter']);
    if (letterFound) {
      try { letterFound.instance.setProperties({ [letterFound.key]: opts.letter }); } catch (e) { /* best-effort */ }
    }
  }

  // ══ BETA-ONLY: a11y-formulario-dinamico (retomada — aplicação dos toggles
  // dinâmicos Nome Acessível/Observações/Notas de Código na instância real) ══
  // Campos dinâmicos Nome Acessível/Observações/Notas de Código — nas 5
  // categorias, só os que o componente/subtipo ESCOLHIDO realmente tem no
  // catálogo (ver _getA11yComponentToggleMap) e que o designer ligou +
  // preencheu no formulário (properties[].key já vem no vocabulário canônico
  // nomeAcessivel/observacoes/notas, ver accessibility.js). Cada um precisa
  // de dois passos: (1) ativar o toggle de verdade na instância aninhada via
  // setProperties (usa o syncId exato do catálogo, próprio de cada
  // componente/subtipo), pra revelar o bloco de conteúdo; (2) achar o TEXT
  // node revelado por valor-padrão atual (mesmo mecanismo de
  // _findTextNodeByCurrentValue já usado abaixo) e escrever o texto
  // digitado. Nenhuma etapa lança — falha em um toggle não derruba a spec
  // inteira, só aquele campo específico fica sem o texto do designer.
  //
  // shortName do catálogo (design-acessivel-component-properties.json) e a
  // instância aninhada onde a property BOOLEAN de fato mora variam por
  // categoria — todos confirmados via REST API em 2026-08-19/20 (ver
  // .claude/agents/accessibility-specialist.md):
  //   elemento    → shortName = sub.componente (ou 'texto alternativo para
  //                 imagens' se 'imagem', ver _A11Y_SELECT_TO_SHORTNAME);
  //                 instância = _elementoNestedFound (2º nível, "Button" etc)
  //   titulo      → shortName 'niveis de titulo'; instância = found (nível 1,
  //                 já tem observacoes+nivel juntos — confirmado node 31:551)
  //   informacoes → shortName 'informações adicionais'; instância = found
  //                 (nível 1, já tem observacoes+tipo juntos — node 31:555)
  //   decorativo  → shortName 'ED gerais'/'ED imagem' conforme sub.tipo;
  //                 instância = _decorativoNestedFound (3º nível "Content" —
  //                 node 31:553)
  //   estrutura   → shortName 'EE idiomas'/'EE marco de navegacao' conforme
  //                 sub.variacao; instância = _estruturaNestedFound (2º
  //                 nível, mesmo já usado pra aplicar "tipo"/"idioma" acima —
  //                 nulo em "titulo da pagina", sem toggle catalogado)
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
        // Valor-padrão atual do campo (placeholder tipo "Insira seu texto da
        // observação.") é o que _findTextNodeByCurrentValue usa pra achar o
        // TEXT node certo sem depender do nome da camada — mesmo padrão do
        // bloco de Descrição/Notas mais abaixo. defaultEntry já é resolvido
        // por categoria/subtipo mais acima na função (ex: decorativo/
        // estrutura já têm 'observacoes'/'notasCodigo' reais no JSON de
        // conteúdo, não só 'descricao'/'notasCodigo' como no bloco de
        // "elemento").
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
  // ══ BETA-ONLY: a11y-formulario-dinamico (fim do trecho intercalado) ══

  // O componente real só tem campos de Descrição/Observações/Notas de Código
  // (mais Nome Acessível, quando o componente tem, ver bloco acima) — não tem
  // onde encaixar Componente/Variante/Label/Hint separadamente. Em vez de
  // perder esse dado (ou duplicar num card paralelo), injeta o que sobrar
  // (exceto Descrição/Notas/os 3 toggles dinâmicos já tratados acima, que já
  // foram escritos nos campos certos) dentro do campo Observações, uma linha
  // por propriedade. Só cai no texto padrão do componente se não houver
  // nenhum dado capturado pra mostrar.
  const _infoLines = (opts.properties || [])
    .filter(p => p && p.value && p.key !== 'descricao' && p.key !== 'notaCodigo' && !_dynamicToggleKeys.has(p.key)) // BETA-ONLY: a11y-formulario-dinamico — exclusão de _dynamicToggleKeys
    .map(p => `${p.label}: ${p.value}`)
    .join('\n');
  if (_infoLines && defaultEntry.observacoes) {
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
  // BETA-ONLY: bugfixes-a11y-diversos — "|| type === 'titulo'" é novo (o selo
  // de Título antes não sincronizava H1-H6, ver workaround no WORKAROUND
  // abaixo de _tryImportA11yAgrupamento).
  if ((type === 'elemento' || type === 'informacoes' || type === 'titulo') && opts.letter) {
    _bestEffortSyncA11yBadgeLetter(instance, opts.letter);
  }

  return instance;
}

// Keys publicadas do component set "[a11y] Agrupamento" — o selo/marcador
// PEQUENO (badge + moldura, ~40×40) que a vertical usa pra indicar QUAL
// elemento a spec documenta, com uma "orientação" que já embute a direção do
// conector (esquerda/direita/superior/inferior). Diferente do "Box specs LT"
// (_tryImportA11yComponent, o card de detalhamento) — este é o marcador que
// fica junto do elemento no canvas. Confirmado via REST API em 2026-07-24
// (component set com properties "tipo"/"orientação"/"variação", variação
// sempre "unitário" — por isso já indexamos direto por tipo+orientação em vez
// de importar uma key e trocar variantProperties).
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
const _A11Y_SIDE_TO_ORIENTACAO = { left: 'esquerda', right: 'direita', top: 'superior', bottom: 'inferior' };

// Tenta importar o marcador real (ver A11Y_AGRUPAMENTO_KEYS) em vez de
// desenhar o contorno tracejado + chip procedural. Lança em qualquer ponto de
// incerteza — quem chama trata a exceção como "cai no marcador desenhado" (ver
// create-unified-spec), mesma filosofia de _tryImportA11yComponent.
async function _tryImportA11yAgrupamento(opts) {
  const orientacao = _A11Y_SIDE_TO_ORIENTACAO[opts.guideSide || 'right'];
  const typeKeys = A11Y_AGRUPAMENTO_KEYS[opts.a11yType];
  if (!typeKeys) throw new Error('a11y-agrupamento-tipo-desconhecido: ' + opts.a11yType);
  const key = typeKeys[orientacao];
  if (!key) throw new Error('a11y-agrupamento-orientacao-desconhecida: ' + orientacao);

  const component = await figma.importComponentByKeyAsync(key);
  const instance = component.createInstance();
  instance.name = 'Agrupamento';

  if (opts.letter) {
    try {
      instance.setProperties({ 'letra#3925:32': opts.letter });
    } catch (e) { /* best-effort — cai no workaround abaixo se for título */ } // BETA-ONLY: bugfixes-a11y-diversos — comentário atualizado, cai no workaround abaixo
  }

  // ══ BETA-ONLY: bugfixes-a11y-diversos (início) — correção de badge de
  // título hardcoded na lib "[a11y] Agrupamento". Ver MIGRATION-BETA-TO-MAIN.md. ══
  // WORKAROUND — falha real confirmada na própria lib publicada (2026-08-20):
  // a variante "tipo=nível de título" do component set "[a11y] Agrupamento"
  // tem o TEXT node "Number" com o texto "H" HARDCODED, sem
  // componentPropertyReferences nenhuma vinculando ele à property
  // "letra#3925:32" (confirmado inspecionando a árvore bruta via REST API —
  // as outras 4 categorias têm o vínculo correto, só esta variante foi
  // publicada sem ele). Por isso "H2"/"H3"/etc nunca apareciam — o
  // setProperties acima roda sem erro, mas não tem efeito nenhum nesse texto
  // específico porque ele não escuta a property. Bypassa escrevendo
  // `.characters` direto no node, pelo caminho conhecido (Agrupamento >
  // "order" > "Number"), com fallback pra busca por nome caso a lib mude a
  // estrutura interna no futuro. Se a lib um dia corrigir o vínculo na
  // origem, o setProperties acima já resolve sozinho e este bloco vira
  // no-op inofensivo (best-effort, nunca lança).
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
  // ══ BETA-ONLY: bugfixes-a11y-diversos (fim) ══

  return instance;
}

// ============================================================
// Três famílias de componente real da lib "Design Acessível", cada uma com
// uma função fixa — não reaproveitar o componente de uma família pra outra
// finalidade, mesmo quando pareceem visualmente próximos:
//
//   1. Agrupamento (A11Y_AGRUPAMENTO_KEYS, acima) — CONTORNO/moldura que
//      envolve a área inteira do elemento documentado, com o selo embutido
//      num dos 4 cantos conforme a orientação. É o modo "Área" do formulário
//      (drawMode === 'contorno', default). Diferente do Conector linha
//      (abaixo), este component set NÃO publica uma variante "desativado" —
//      só as 4 orientações reais existem na lib (confirmado por extração
//      completa de refs/design-acessivel.json em 2026-08-19: 20 componentes
//      = 5 categorias × 4 orientações, sem exceção). Não inventar uma 5ª
//      variante aqui; se um dia a lib publicar "desativado" pra esta família,
//      recatalogar então.
//   2. Conector linha (A11Y_CONECTOR_LINHA_KEYS, abaixo) — LIGAÇÃO simples
//      (traço + selo na ponta) entre o elemento e o card de detalhamento, sem
//      envolver a área do elemento. É o modo "Linha" do formulário
//      (drawMode === 'linha'). Publicado na lib como "tipo=<categoria>,
//      conector=<direção>" (frame "Conectores  [Handoff]" do arquivo — não
//      confundir com a frame homônima "Conectores  [DSC Handoff]", de outra
//      finalidade/vertical, com nomenclatura de tipo diferente e sem
//      conteúdo catalogado aqui). Esta família TEM a variante "desativado"
//      (ver comentário da constante abaixo) — visualmente é só o selo, sem
//      o traço/linha e sem ponta de contato com o elemento; não tem "lado"
//      geométrico, por isso ainda não está exposta no seletor "Lado da
//      Guia" da UI (que hoje só lista as 4 direções reais) — precisaria de
//      um cálculo de posicionamento próprio (selo solto perto do elemento,
//      sem ancoragem por borda oposta) em vez do usado pelas 4 direções
//      reais. Decisão de escopo: catalogado no backend, sem UI ainda —
//      ver A11Y_COMBINADOS_KEYS mais abaixo pro mesmo raciocínio aplicado
//      à família 4.
//   3. Item Number ("[a11y] Item Number", keys em A11Y_ITEM_NUMBER_KEYS mais
//      abaixo, handler create-tab-order-item) — marcador de ORDEM DE
//      TABULAÇÃO (sequência de foco do teclado), ferramenta separada dentro
//      da aba Acessibilidade ("Ordem de Tabulação", accessibility.js). Não
//      tem relação com Agrupamento nem Conector linha; não reaproveitar.
//   4. Combinados (A11Y_COMBINADOS_KEYS, abaixo) — permite empilhar MAIS DE
//      UM selo no mesmo conector (ex: uma spec que é ao mesmo tempo
//      "Elemento e Imagens" E "Nível de Título"). Publicado na lib como
//      "variação=<layout>, conector=<direção>" (mesma frame "Conectores
//      [Handoff]", sem a property "tipo" — os selos empilhados dentro do
//      componente é que carregam a categoria, não o conector em si).
//      CATALOGADO mas SEM fluxo de uso no plugin ainda: o schema de spec
//      hoje (`a11yType`) é uma categoria única por spec, não há conceito de
//      "esta spec pertence a duas categorias" em nenhum lugar do formulário
//      ou do handoffData — usar esta família exigiria desenhar essa UX
//      (como escolher quais categorias combinar, quantos selos, em que
//      ordem) antes de implementar. Não inventar essa UI sem alinhamento
//      explícito — ver CLAUDE.md.
// ============================================================

// Keys publicadas do component set "tipo=<categoria>, conector=<direção>" —
// frame "Conectores  [Handoff]" do arquivo da lib (25 componentes = 5
// categorias × 5 direções, incluindo "desativado"). Direção "desativado"
// existe na lib e está catalogada aqui, mas ainda não é usada por
// _tryImportA11yConectorLinha — o modo Linha sempre nasce com uma direção
// real (mesmo default do modo Contorno, guideSide 'right'); ver o item 2 do
// bloco de comentário acima pra explicação de por que "desativado" não tem
// um "lado" equivalente no cálculo de posicionamento atual.
// Confirmado via inspeção local de refs/design-acessivel.json (2026-08-07,
// revalidado 2026-08-19) — nomes em português com grafia exata "elementos
// interativos e imagens" / "estrutura da página" / "nível de título /
// titulo" / "decorativo" / "informações adicionais".
const A11Y_CONECTOR_LINHA_KEYS = {
  elemento: {
    esquerda: '9c1f1679ab73055ef68dbcbd11b89fc711629f6a',
    direita:  'eec4d7b2153d9eb6bc300787c861b8cfee10dcbf',
    superior: 'fcdb189d2cbdcda11488030e4d4c523d08d95865',
    inferior: '509491cd5e458ec0cf974b00390f8f65d078c326',
    desativado: 'eb12c7da71c1b661a72438ff4e27462ce798c07e', // BETA-ONLY: bugfixes-a11y-diversos
  },
  estrutura: {
    esquerda: '13141fdadb7e8675d8a47ba70be1b6d24d4ed35c',
    direita:  '2621f5cdadea32e0802c8196aad03db1da20bf72',
    superior: '76d6ba85e4fed4a5d0bd67c709860877fe236d2f',
    inferior: '3021c901640ffb86e8228dd12bd730ee3f770ebb',
    desativado: '63e22dc70dde84d0aa43c1592388751e6bb8c44e', // BETA-ONLY: bugfixes-a11y-diversos
  },
  titulo: {
    esquerda: '670c7c055ed7ebc01a523add5b69499680076419',
    direita:  'f63a82ad250bcc8569d83affbcc39d6f226d64ca',
    superior: 'baf0b4ea8417911a42f7d890654ad8dc3d047881',
    inferior: '3dafdf7d0543989b82c25686abb88134c879a94c',
    desativado: 'ba1aa8640e1593f93ed1e0ee03cd59ed4ff54ae8', // BETA-ONLY: bugfixes-a11y-diversos
  },
  decorativo: {
    esquerda: '4866349b6246fbd45cf493cce308f7da2c312569',
    direita:  '85ff209c592f55cc2149b256909ac65e2e06a66b',
    superior: 'ad87c4797c992bfaadbb41d8d05e9c81fc4207c2',
    inferior: 'a419476ffe6c0b6c10a32c080d624091cf083171',
    desativado: '08ec11bff941a75a75bbe248b822da7715140da7', // BETA-ONLY: bugfixes-a11y-diversos
  },
  informacoes: {
    esquerda: 'edb9fed9e58a7bf279d8804014f8755ffc4e711d',
    direita:  'ceff0c518ef33fc326eec74af0320255a6ba53a8',
    superior: 'f8dcedebd882a13e26659b1a614adf16166b996d',
    inferior: 'c2ef79c032a76ffefcb0a8b3123bf91ff2c8a221',
    desativado: 'cef964a1a1bfa7ea3d0e4d24d005d3a669ca56b2', // BETA-ONLY: bugfixes-a11y-diversos
  },
};

// Keys publicadas do component set "variação=<layout>, conector=<direção>"
// (mesma frame "Conectores  [Handoff]", ver item 4 do bloco de comentário
// acima) — permite empilhar múltiplos selos de categoria no mesmo conector.
// 25 componentes no total: 4 layouts ("só vertical" / "só horizontal" /
// "dupla vertical" / "dupla horizontal") × 5 direções (incluindo
// "desativado") = 20, mais 5 componentes "conector=<direção>" sem variação
// (layout base/nenhum, um único selo — a raiz do variant group antes de
// aplicar "variação"). Confirmado via inspeção local de
// refs/design-acessivel.json em 2026-08-19. NÃO usada em nenhum fluxo do
// plugin ainda — ver o item 4 do bloco de comentário acima: falta desenhar
// a UX de "combinar categorias numa spec" antes de ter um chamador real
// (equivalente a _tryImportA11yAgrupamento/_tryImportA11yConectorLinha).
// AVISO: por não ter nenhum chamador, esta constante é removida do
// code.bundle.js pelo tree-shaking do esbuild (bundle-code.cjs usa
// bundle:true) — ela só existe hoje na fonte (code.js). Isso é esperado e
// inofensivo (sem side-effect, não é referenciada por engano em nenhum
// lugar); quando alguém implementar a função de import real desta família,
// ela volta a aparecer no bundle automaticamente. Não é preciso "forçar" a
// sobrevivência dela até existir um uso de verdade.
// BETA-ONLY: bugfixes-a11y-diversos — constante catalogada, sem chamador
// ainda (removida do bundle por tree-shoking, ver comentário acima). Ver
// MIGRATION-BETA-TO-MAIN.md.
const A11Y_COMBINADOS_KEYS = {
  base: {
    esquerda: 'f9cd4394c0bfc48ae86d3028e836877887d23fcd',
    direita:  '08ac04391034777646eec9395c6d221189ee6d46',
    superior: 'ff43b15ac0c078b35219984bf035c4c0f0089cf1',
    inferior: 'b355a26c5a89aea074effe28ca6767b08e4a7f99',
    desativado: '71719f112ec0135b16df0deb6584fbc44af3aff2',
  },
  soVertical: {
    esquerda: '213f18aa23c4a840ddaae07ffe5aeeabe4615627',
    direita:  '5a3a927d60d20014473782bfbe7ffb8b75df53d4',
    superior: 'a8c6982340d110a2de97f700fa8641f79e8ab0dc',
    inferior: '3baea19ba737593ece499033603469d0ccba2f44',
    desativado: '683436fb483bbbd84909e19a22ef44ca85b77788',
  },
  soHorizontal: {
    esquerda: 'c8be4be969e448d2c111482d0a3fc43fe620bec7',
    direita:  'ab50550d6b4fa0c9bd6fb582b4f9d4623693df23',
    superior: '486d97e5dd243af65f2142aed26bc6f439d707a1',
    inferior: 'a27bb28570c0041fb41ceebe4a37539f3d508fc5',
    desativado: 'be7a32a35125f7b086d47de7f6f93c4901299faf',
  },
  duplaVertical: {
    esquerda: '836529947666a324678552bd57d377ee94c686ad',
    direita:  'd2569306f2cd11e8d6ced4b308b403e03387b170',
    superior: 'b219d9ac725540f309a06675cbefac94baec3132',
    inferior: '2a2e7ce268d169c65086bb59c9c82cf19debbf14',
    desativado: 'ca002cd0f9bb8a236f74b9e4170431fd8492509f',
  },
  duplaHorizontal: {
    esquerda: '8da5d723b005b4ab001fab5cf9ad301f334cbbe6',
    direita:  '74fba6bdbbd2a02788176d58723802909e46ef33',
    superior: 'ddbec1765daf151d178927b7ea8224776cea2aa3',
    inferior: '8022fdb598077eff42c81cf9a2cfff74300413db',
    desativado: 'c9c0cd18390420ec66c1e0a66bf3f53a99d41509',
  },
};

// Tenta importar o conector-linha real (ver A11Y_CONECTOR_LINHA_KEYS) em vez
// de desenhar o vetor procedural (linha tracejada + dots). Lança em qualquer
// ponto de incerteza — quem chama trata a exceção como "cai no vetor
// desenhado", mesma filosofia de _tryImportA11yAgrupamento.
async function _tryImportA11yConectorLinha(opts) {
  const orientacao = _A11Y_SIDE_TO_ORIENTACAO[opts.guideSide || 'right'];
  const typeKeys = A11Y_CONECTOR_LINHA_KEYS[opts.a11yType];
  if (!typeKeys) throw new Error('a11y-conector-linha-tipo-desconhecido: ' + opts.a11yType);
  const key = typeKeys[orientacao];
  if (!key) throw new Error('a11y-conector-linha-orientacao-desconhecida: ' + orientacao);

  const component = await figma.importComponentByKeyAsync(key);
  const instance = component.createInstance();
  instance.name = 'Conector';

  // BETA-ONLY: bugfixes-a11y-diversos (início) — antes usava sempre
  // 'letra#3925:6', que não existe/não sincroniza pra Título.
  // "[a11y] Conectores" tem DUAS properties de texto separadas (confirmado
  // via componentPropertyDefinitions do component set, node 1:50): "letra"
  // (tags A/B/A1...) e "nível de título" (H1/H2/H3...) — não são a mesma
  // property, diferente do que se poderia supor pelo padrão de "Agrupamento".
  // Título usa a segunda; as demais categorias usam a primeira.
  if (opts.letter) {
    const propKey = opts.a11yType === 'titulo' ? 'nível de título#6411:2' : 'letra#3925:6';
    try {
      instance.setProperties({ [propKey]: opts.letter });
    } catch (e) { /* best-effort — nunca bloqueia a criação da spec */ }
  }
  // ══ BETA-ONLY: bugfixes-a11y-diversos (fim) ══

  return instance;
}

// Organização de canvas para specs/áreas de Acessibilidade — todo nó criado
// pela vertical de a11y é agrupado dentro de uma única SECTION na página,
// em vez de ficar solto ao nível da página. Section (não Frame) porque não
// recorta conteúdo que ultrapasse seus limites — as specs continuam
// espalhadas pela tela perto de cada elemento documentado, a Section só as
// organiza no painel de Layers.
const A11Y_SECTION_NAME = 'Especificações de Acessibilidade';

function _getOrCreateA11ySection() {
  let section = figma.currentPage.children.find(
    n => n.type === 'SECTION' && n.name === A11Y_SECTION_NAME
  );
  if (!section) {
    section = figma.createSection();
    section.name = A11Y_SECTION_NAME;
    section.x = 0;
    section.y = 0;
    section.resizeWithoutConstraints(200, 200);
  }
  return section;
}

// Reparenta `node` (hoje filho direto de figma.currentPage, com x/y já
// absolutos da página) para dentro da Section organizadora de Acessibilidade,
// preservando a posição visual. Section só existe como filha direta da
// página (sem transform próprio além de x/y), então x/y do nó relativo à
// Section = x/y absolutos atuais − x/y da Section. Best-effort: qualquer
// falha aqui não deve invalidar a spec/área já criada normalmente na página.
function _reparentIntoA11ySection(node) {
  try {
    const _origX = node.x;
    const _origY = node.y;
    const section = _getOrCreateA11ySection();
    section.appendChild(node);
    node.x = Math.round(_origX - section.x);
    node.y = Math.round(_origY - section.y);
  } catch (e) {
    // organização é só cosmética — a spec/área segue existindo normalmente
  }
}

// Reordena o specGroup recém-criado entre os demais grupos de spec da página
// para que a profundidade (z-order) siga a ordem hierárquica das tags, não a
// ordem de criação. Não afeta X/Y — só o índice na lista de filhos da página.
function _reorderSpecGroupByTag(specGroup, tag) {
  const siblings = figma.currentPage.children.filter(n => n !== specGroup && n.type === 'GROUP');
  // Fallback = ficar no topo (equivalente ao appendChild padrão), não a contagem de
  // grupos — misturar essa contagem com índices reais de children (abaixo) empurraria
  // a spec para trás de conteúdo não-spec da página quando não há tag posterior.
  let insertIndex = figma.currentPage.children.length;
  for (let i = 0; i < siblings.length; i++) {
    const m = siblings[i].name.match(/^\[Spec(?:A11y)? \| ([A-Z]\d*(?:\.\d+)*) \| [a-z]+\] /);
    if (!m) continue;
    if (_compareSpecTags(tag, m[1]) < 0) {
      const idx = figma.currentPage.children.indexOf(siblings[i]);
      insertIndex = Math.min(insertIndex, idx);
    }
  }
  figma.currentPage.insertChild(insertIndex, specGroup);
}


// ══ BETA-ONLY: ficha-atualiza-sem-duplicar (início) ══
// Depende de: chamada em handler de geração de ficha mais abaixo
// (const _existingFicha = _hdFindExistingFicha(_titulo)). Ver
// MIGRATION-BETA-TO-MAIN.md.
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
// ══ BETA-ONLY: ficha-atualiza-sem-duplicar (fim) ══

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0.5, g: 0.5, b: 0.5 };
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
        excecoes: (frame.excecoes || []).map(e => ({
          tipo:   e.tipo   || '',
          titulo: e.titulo || '',
          notas:  e.notas  || '',
          link:   e.link   || ''
        }))
      }));
    } catch (e) {
      // Node pode ter sido deletado — ignorar silenciosamente
    }
  }
}

// Corpo compartilhado da criação de fluxo — usado tanto pela criação normal
// (create-flow-connection, nodeA/nodeB vêm da seleção ativa) quanto pela
// recriação a partir de backup (recreate-flow-connection, nodeA/nodeB vêm
// de IDs salvos em handoffData.createdFlows). Ambos os handlers resolvem os
// nós antes de chamar esta função; ela cuida do desenho e do agrupamento.
async function _buildFlowConnection(nodeA, nodeB, msg) {
  const isEvent = msg.flowType === "event_start" || msg.flowType === "event_end";
  let boundsA = nodeA.absoluteBoundingBox || nodeA.absoluteRenderBounds;
  let boundsB = nodeB ? (nodeB.absoluteBoundingBox || nodeB.absoluteRenderBounds) : null;
  if (!boundsA) { figma.notify("Elemento de origem sem dimensões válidas."); return; }

  if (!isEvent && boundsB && (!msg.flowSide || msg.flowSide === 'auto')) {
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

  const strokeColor = { r: 0.12, g: 0.16, b: 0.23 };

  // ══ BETA-ONLY: flows-mini-mapa-conector-criacao (início) ══
  // Depende de: msg.connectorStyle/msg.curvature vindos do modal de criação
  // (specifications.js: confirmFlowConnection) e de resync-all-flows
  // repassando os mesmos campos salvos. Ver MIGRATION-BETA-TO-MAIN.md.
  // Mesmo cálculo de estilo de conector usado em edit-spec-connector --
  // reaproveitado aqui para que fluxos respeitem connectorStyle/curvature
  // vindos do frontend (antes ignorados, sempre desenhava reta).
  const _flowConnectorStyle = msg.connectorStyle || 'straight';
  const _flowCurvature = _flowConnectorStyle === 'curved' ? (msg.curvature || 0) : 0;

  let linePath = `M ${bestA.x} ${bestA.y} L ${bestB.x} ${bestB.y}`;
  let arrowAngle = Math.atan2(bestB.y - bestA.y, bestB.x - bestA.x);

  if (_flowConnectorStyle === 'elbow') {
    const isHorizontal = bestA.side === 'left' || bestA.side === 'right';
    const corner = isHorizontal ? { x: bestB.x, y: bestA.y } : { x: bestA.x, y: bestB.y };
    linePath = `M ${bestA.x} ${bestA.y} L ${corner.x} ${corner.y} L ${bestB.x} ${bestB.y}`;
    arrowAngle = Math.atan2(bestB.y - corner.y, bestB.x - corner.x);
  } else if (_flowCurvature) {
    const dx = bestB.x - bestA.x, dy = bestB.y - bestA.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / dist, py = dx / dist;
    const offset = (_flowCurvature / 100) * dist * 0.5;
    const midX = (bestA.x + bestB.x) / 2, midY = (bestA.y + bestB.y) / 2;
    const ctrlX = midX + px * offset, ctrlY = midY + py * offset;
    linePath = `M ${bestA.x} ${bestA.y} Q ${ctrlX} ${ctrlY} ${bestB.x} ${bestB.y}`;
    // Aproximação barata da tangente no ponto final: ângulo entre o ponto
    // de controle e o ponto final -- suficiente pra apontar a seta na
    // direção geral de chegada da curva sem calcular derivada da bezier.
    arrowAngle = Math.atan2(bestB.y - ctrlY, bestB.x - ctrlX);
  }
  // ══ BETA-ONLY: flows-mini-mapa-conector-criacao (fim do cálculo de path) ══

  const line = figma.createVector();
  line.name = `Linha`;
  figma.currentPage.appendChild(line);
  line.x = 0; line.y = 0;
  line.strokes = [{ type: "SOLID", color: strokeColor }];
  line.strokeWeight = 2;
  if (msg.flowType === "line_dashed" || msg.flowType === "diamond_dashed") line.dashPattern = [6, 4];
  line.vectorPaths = [{ windingRule: "NONZERO", data: linePath }]; // BETA-ONLY: flows-mini-mapa-conector-criacao — linePath (antes hardcoded reta)

  let nodesToGroup = [line];

  if (msg.flowType !== "event_start") {
    const angle = arrowAngle; // BETA-ONLY: flows-mini-mapa-conector-criacao — arrowAngle (antes calculado só da reta bestA→bestB)
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
  // sobrevive à recriação por edição (edit-flow-connection apaga e recria o
  // group), permitindo que a inserção incremental na ficha reconheça "este
  // é o mesmo fluxo" mesmo após o grupo visual antigo ter sido substituído.
  const _flowId = msg.flowId || String(Date.now());
  const _flowExtra = {
    sourceId: nodeA.id,
    targetId: nodeB ? nodeB.id : null,
    decisionText: msg.decisionText || null,
    flowSide: msg.flowSide || 'auto',
    flowUid: _flowId,
    connectorStyle: _flowConnectorStyle, // BETA-ONLY: flows-mini-mapa-conector-criacao
    curvature: _flowCurvature // BETA-ONLY: flows-mini-mapa-conector-criacao
  };

  // BETA-ONLY: flows-mini-mapa-conector-criacao — _buildFlowConnection
  // passou a RETORNAR { group, flow } em vez de postar 'flow-created' e
  // chamar figma.notify direto; os 3 chamadores (create-flow-connection/
  // recreate-flow-connection/edit-spec-connector) e o novo resync-all-flows
  // (abaixo) agora fazem isso eles mesmos. Ver MIGRATION-BETA-TO-MAIN.md.
  let result = null;

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
      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | decisao] ${msg.flowName || "Decisão"}`;
      finalGroup.locked = true;
      finalGroup.setPluginData('handexCategory', 'fluxo');
      result = { group: finalGroup, flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType, ..._flowExtra } };
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
      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | ${isStart ? 'inicio' : 'fim'}] ${msg.flowName || (isStart ? "Início" : "Fim")}`;
      finalGroup.locked = true;
      finalGroup.setPluginData('handexCategory', 'fluxo');
      result = { group: finalGroup, flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType, ..._flowExtra } };
    } catch (e) { console.error(e); }
  } else if (msg.decisionText && (msg.flowType === "line_solid" || msg.flowType === "line_dashed")) {
    const midX = (bestA.x + bestB.x) / 2, midY = (bestA.y + bestB.y) / 2;
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
      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | conexao] ${msg.flowName || "Conexão"}`;
      finalGroup.locked = true;
      finalGroup.setPluginData('handexCategory', 'fluxo');
      result = { group: finalGroup, flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType, ..._flowExtra } };
    } catch (e) { console.error(e); }
  } else {
    const finalGroup = figma.group(nodesToGroup, figma.currentPage);
    finalGroup.name = `[Fluxo | ${msg.nextFlowNumber || 1} | conexao] ${msg.flowName || "Conexão"}`;
    finalGroup.locked = true;
    finalGroup.setPluginData('handexCategory', 'fluxo');
    result = { group: finalGroup, flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType, ..._flowExtra } };
  }

  return result;
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
      const savedState = await figma.clientStorage.getAsync('handoffData');
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        projectName,
        savedState: savedState || null
      });
    } catch (err) {
      console.error("Initialization error (continuing without saved state):", err);
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        projectName,
        savedState: null
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
    const children = grpNode.type === 'GROUP' ? grpNode.children : [grpNode];
    const cardFrame = children.find(n => n.name && (n.name === 'Spec Notes' || n.name === 'Ficha' || n.name.endsWith('/Ficha')));
    if (!cardFrame || cardFrame.type !== 'FRAME') { figma.ui.postMessage({ type: 'toast', message: 'Card não encontrado no grupo.', kind: 'error' }); return; }
    // Remove existing exception frame if any (named /Exceções)
    const existing = cardFrame.children.find(n => n.name === '[Spec] Exceções');
    if (existing) existing.remove();
    if (msg.excecoes && msg.excecoes.length > 0) {
      (async () => {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const excFrame = figma.createFrame();
        excFrame.name = '[Spec] Exceções';
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 4;
        excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
        excTitle.characters = `CENÁRIOS (${msg.excecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        msg.excecoes.forEach(exc => {
          const t = figma.createText();
          t.fontName = { family: "Inter", style: "Regular" };
          t.fontSize = 10;
          t.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
          t.characters = `[${exc.tipo || 'Geral'}] ${exc.titulo || ''}`;
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
        excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const hdr = figma.createText();
        hdr.fontName = { family: "Inter", style: "Bold" };
        hdr.fontSize = 9;
        hdr.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
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
      const typeLabel = figma.createText();
      typeLabel.fontName = { family: "Inter", style: "Bold" };
      typeLabel.fontSize = 9;
      typeLabel.fills = [{ type: "SOLID", color: typeColor }];
      typeLabel.characters = (exc.tipo || 'GERAL').toUpperCase();
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
      'handoffData',
      'handex-audit-refs-v1',
      'handex-scan-cache-v1',
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
    // finalGroup/legendFrame de fluxo) -- não sobram nós-irmãos soltos. Exceção:
    // specs/áreas de A11y são reparentadas para dentro da Section dedicada
    // (_reparentIntoA11ySection) logo após criadas, então varrem um nível a
    // mais (os filhos da Section), não só figma.currentPage.children.
    // handexCategory (pluginData) é a fonte de verdade; prefixo de nome é fallback
    // para conteúdo criado antes desta marcação existir.
    const wanted = {
      ficha: !!msg.ficha,
      spec: !!msg.specs,
      a11y: !!msg.a11y,
      medida: !!msg.medidas,
      fluxo: !!msg.fluxos,
    };

    const matchCategory = (node) => {
      const tag = node.getPluginData('handexCategory');
      if (tag) return wanted[tag] ? tag : null;
      if (!node.name) return null;
      if (wanted.ficha && node.name.startsWith('Handex | Ficha de Projeto')) return 'ficha';
      if (wanted.spec && (node.name.startsWith('[Spec | ') || node.name.startsWith('[Spec]'))) return 'spec';
      if (wanted.a11y && (node.name.startsWith('[SpecA11y') || node.name.startsWith('[A11yArea') || node.name.startsWith('[TabOrder'))) return 'a11y'; // BETA-ONLY: apagar-tudo — "|| node.name.startsWith('[TabOrder')" é novo, bugfix de filtro do canvas não reconhecer selos de Ordem de Tabulação
      if (wanted.medida && node.name.startsWith('[Medida]')) return 'medida';
      if (wanted.fluxo && node.name.startsWith('[Fluxo')) return 'fluxo';
      return null;
    };

    const counts = { ficha: 0, spec: 0, a11y: 0, medida: 0, fluxo: 0 };
    const toRemove = [];

    figma.currentPage.children.forEach(node => {
      if (node.type === 'SECTION' && node.name === A11Y_SECTION_NAME) {
        (node.children || []).forEach(child => {
          const cat = matchCategory(child);
          if (cat) {
            toRemove.push(child);
            counts[cat]++;
          }
        });
        return;
      }
      const cat = matchCategory(node);
      if (cat) {
        toRemove.push(node);
        counts[cat]++;
      }
    });

    toRemove.forEach(node => { try { node.remove(); } catch (e) {} });

    figma.ui.postMessage({ type: 'canvas-content-deleted', counts });
    return;
  }

  // BETA-ONLY: a11y-reducao-ruido-visual — handler 'toggle-a11y-category-visibility'
  // removido (órfão): operava sobre a Section de Acessibilidade inteira, sem
  // distinguir área, e não tinha mais chamador depois que o controle de
  // visibilidade virou POR ÁREA (setAreaViewMode, accessibility.js —
  // BETA-ONLY: a11y-switch-modo-visualizacao), que reaproveita os handlers
  // singulares 'hide-node'/'show-node' já existentes abaixo, um nó por vez,
  // iterando os ids da área no frontend. Ver MIGRATION-BETA-TO-MAIN.md.

  if (msg.type === 'scan-cache-save') {
    figma.clientStorage.setAsync('handex-scan-cache-v1', msg.data).catch(e =>
      console.warn("scan-cache-save failed:", e)
    );
    return;
  }

  if (msg.type === 'scan-cache-load') {
    try {
      const cached = await figma.clientStorage.getAsync('handex-scan-cache-v1');
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
          if (specNode && specNode.name && /^\[Spec(A11y)? \| /.test(specNode.name)) {
            specNode.locked = true;
          }
          spec.pendingConfirmation = false;
          _pendingSpecsLocked++;
        }
        // --- Acessibilidade --- mesmo auto-lock, agora a partir do array dedicado
        for (const spec of (frame.a11ySpecs || [])) {
          if (!spec || !spec.pendingConfirmation) continue;
          const specNode = await figma.getNodeByIdAsync(spec.id);
          if (specNode && specNode.name && /^\[Spec(A11y)? \| /.test(specNode.name)) {
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

        const title = createText(titleText, 16, "Bold", { r: 0, g: 0.35, b: 0.79 });
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

        const val = createText(value || "-", 14, "Regular", isLink ? { r: 0, g: 0.35, b: 0.79 } : { r: 0.12, g: 0.16, b: 0.23 });
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

      // ══ BETA-ONLY: ficha-atualiza-sem-duplicar (início) ══
      // Depende de: _hdFindExistingFicha (função dedicada acima nesta
      // mesma fonte). Ver MIGRATION-BETA-TO-MAIN.md.
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
      // ══ BETA-ONLY: ficha-atualiza-sem-duplicar (pausa — segue lógica pré-existente) ══
      const _now = new Date();
      const _ts = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')} ${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
      // Timestamp antes da versão no nome: garante que a ordenação alfabética
      // usada em pull-ficha-version-from-canvas continue resolvendo "mais
      // recente" pela data de criação, não pela string da versão.
      const _versaoLabel = (data.step1?.versao || '').trim();
      const _containerName = `${_handoffBase} | ${_ts}${_versaoLabel ? ' | ' + _versaoLabel : ''}`;

      // MAIN CONTAINER
      const mainContainer = createFrame("HORIZONTAL", 64, 48, hexToRgb("#026173"));
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
              <path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
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
          roleTag.appendChild(createText(m.papel || 'Membro', 9, "Medium", { r: 0, g: 0.35, b: 0.79 }));
          mRow.appendChild(roleTag);

          const nameText = createText(m.nome || '', 12, "Medium");
          nameText.layoutGrow = 1;
          mRow.appendChild(nameText);

          if (m.email) {
            const contactLink = createText("Contato", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
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
            const lText = createText("Acesse o link da HU", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
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

      // 1.5 CENÁRIOS DE EXCEÇÃO (agregados de todos os frames)
      const _allExcecoes = (data.frames || []).flatMap(f =>
        (f.excecoes || []).map(e => ({ ...e, _frame: f.nome }))
      );
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

          const titleText = createText(`${e.titulo || ''}${e._frame ? ' (' + e._frame + ')' : ''}`, 12, "Medium");
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

            const dLink = createText("Acesse o link", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
            dLink.textDecoration = "UNDERLINE";
            dLink.hyperlink = { type: "URL", value: docData.link };
            dRow.appendChild(dLink);

            docsSection.appendChild(dRow);
          });
          setFillAndHug(docsSection);
        }
      }

      // 1.6b — seção "Especificações Visuais" removida; specs consolidadas em 1.9
      if (false) { // dead block kept for diff clarity — remove on next cleanup
        const SPEC_CARD_W = 240;
        function buildSpecCard(s) {
          const tc = s.color
            ? { r: parseInt(s.color.slice(1,3),16)/255, g: parseInt(s.color.slice(3,5),16)/255, b: parseInt(s.color.slice(5,7),16)/255 }
            : themeColor;

          const card = figma.createFrame();
          card.name = `[Spec/${s.letter || 'A'}] ${s.name || ''}`;
          card.layoutMode = "VERTICAL";
          card.itemSpacing = 4;
          card.paddingLeft = 10; card.paddingRight = 10;
          card.paddingTop = 8; card.paddingBottom = 8;
          card.cornerRadius = 8;
          card.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 1 } }];
          card.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.92, b: 0.96 } }];
          card.primaryAxisSizingMode = "AUTO";    // hug height
          card.counterAxisSizingMode = "FIXED";   // fixed width → text wraps
          card.resize(SPEC_CARD_W, 10);

          // Header: badge + name
          const sHeader = figma.createFrame();
          sHeader.layoutMode = "HORIZONTAL";
          sHeader.itemSpacing = 8;
          sHeader.fills = [];
          sHeader.counterAxisAlignItems = "CENTER";
          sHeader.primaryAxisSizingMode = "FIXED";
          sHeader.counterAxisSizingMode = "AUTO";
          sHeader.layoutAlign = "STRETCH";
          card.appendChild(sHeader);

          const badge = figma.createFrame();
          badge.layoutMode = "HORIZONTAL";
          badge.resize(20, 20);
          badge.cornerRadius = 4;
          badge.fills = [{ type: "SOLID", color: tc }];
          badge.primaryAxisAlignItems = "CENTER"; badge.counterAxisAlignItems = "CENTER";
          const badgeT = figma.createText();
          badgeT.fontName = { family: "Inter", style: "Bold" }; badgeT.fontSize = 9;
          badgeT.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
          badgeT.characters = s.letter || 'A'; badgeT.textAutoResize = "WIDTH_AND_HEIGHT";
          badge.appendChild(badgeT);
          sHeader.appendChild(badge);

          const sName = figma.createText();
          sName.fontName = { family: "Inter", style: "Bold" }; sName.fontSize = 11;
          sName.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.16, b: 0.23 } }];
          sName.characters = s.name || '';
          sName.textAutoResize = "HEIGHT";  // wrap within fixed card width
          sName.layoutGrow = 1;
          sHeader.appendChild(sName);

          if (s.note) {
            const sNote = figma.createText();
            sNote.fontName = { family: "Inter", style: "Regular" }; sNote.fontSize = 10;
            sNote.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
            sNote.characters = s.note;
            sNote.textAutoResize = "HEIGHT";
            sNote.layoutAlign = "STRETCH";
            card.appendChild(sNote);
          }

          // Link
          if (s.link) {
            const lText = figma.createText();
            lText.fontName = { family: "Inter", style: "Regular" }; lText.fontSize = 9;
            lText.fills = [{ type: "SOLID", color: { r: 0, g: 0.35, b: 0.79 } }];
            lText.characters = s.link;
            lText.textDecoration = "UNDERLINE";
            lText.hyperlink = { type: "URL", value: s.link };
            lText.textAutoResize = "HEIGHT";  // wrap long URLs
            lText.layoutAlign = "STRETCH";
            card.appendChild(lText);
          }

          // Exceptions
          const sExcs = s.excecoes || [];
          if (sExcs.length > 0) {
            const _excRgb = { 'Erro': { r: 0.80, g: 0.15, b: 0.15 }, 'Alerta': { r: 0.80, g: 0.50, b: 0.00 }, 'Sucesso': { r: 0.10, g: 0.55, b: 0.25 }, 'Confirmação': { r: 0.05, g: 0.35, b: 0.80 } };
            sExcs.forEach(exc => {
              const eRow = figma.createFrame();
              eRow.layoutMode = "HORIZONTAL"; eRow.itemSpacing = 6; eRow.fills = [];
              eRow.primaryAxisSizingMode = "FIXED"; eRow.counterAxisSizingMode = "AUTO";
              eRow.layoutAlign = "STRETCH";
              eRow.counterAxisAlignItems = "CENTER";
              card.appendChild(eRow);
              const eType = figma.createText();
              eType.fontName = { family: "Inter", style: "Bold" }; eType.fontSize = 9;
              eType.fills = [{ type: "SOLID", color: _excRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 } }];
              eType.characters = (exc.tipo || 'GERAL').toUpperCase(); eType.textAutoResize = "WIDTH_AND_HEIGHT";
              const eTitle = figma.createText();
              eTitle.fontName = { family: "Inter", style: "Regular" }; eTitle.fontSize = 10;
              eTitle.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
              eTitle.characters = exc.titulo || '';
              eTitle.textAutoResize = "HEIGHT";
              eTitle.layoutGrow = 1;
              eRow.appendChild(eType); eRow.appendChild(eTitle);
            });
          }

          return card;
        }

        // Group specs by tag
        const _specsByTag = {};
        _globalSpecs.forEach(s => {
          const tag = s.categoryLabel || s.category || 'Geral';
          if (!_specsByTag[tag]) _specsByTag[tag] = [];
          _specsByTag[tag].push(s);
        });

        const specsSection = createSection(content, "Especificações Visuais");

        // Outer row: different tags side by side
        const specsTagRow = figma.createFrame();
        specsTagRow.name = '[Row] Especificações por Tag';
        specsTagRow.layoutMode = "HORIZONTAL";
        specsTagRow.layoutWrap = "WRAP";
        specsTagRow.itemSpacing = 16;
        specsTagRow.counterAxisSpacing = 16;
        specsTagRow.fills = [];
        specsTagRow.primaryAxisSizingMode = "AUTO";
        specsTagRow.counterAxisSizingMode = "AUTO";
        specsTagRow.counterAxisAlignItems = "MIN";
        specsSection.appendChild(specsTagRow);
        setFillAndHug(specsTagRow);

        Object.entries(_specsByTag).forEach(([tag, tagSpecs]) => {
          if (tagSpecs.length === 1) {
            // Single spec: no group wrapper
            specsTagRow.appendChild(buildSpecCard(tagSpecs[0]));
          } else {
            // 2+ specs with same tag: vertical group
            const group = figma.createFrame();
            group.name = `[Specs/${tag}] Especificações Visuais`;
            group.layoutMode = "VERTICAL";
            group.itemSpacing = 8;
            group.fills = [];
            group.primaryAxisSizingMode = "AUTO";
            group.counterAxisSizingMode = "AUTO";
            group.counterAxisAlignItems = "MIN";
            tagSpecs.forEach(s => group.appendChild(buildSpecCard(s)));
            specsTagRow.appendChild(group);
            setFillAndHug(group);
          }
        });

        content.appendChild(specsSection);
        setFillAndHug(specsSection);
      }

      // 1.7 FRAMES DOCUMENTADOS
      const _frames = data.frames || [];
      if (_frames.length > 0) {
        const framesSection = createSection(content, "Frames Documentados");
        _frames.forEach((f, fi) => {
          const fRow = createFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.99, b: 1 });
          fRow.name = `[Frame] ${f.nome || 'Frame ' + (fi + 1)}`;
          fRow.cornerRadius = 8;
          fRow.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.92, b: 0.96 } }];
          framesSection.appendChild(fRow);
          setFillAndHug(fRow);

          // Nome + badge novo componente
          const fHeader = createFrame("HORIZONTAL", 0, 8);
          fHeader.counterAxisAlignItems = "CENTER";
          fRow.appendChild(fHeader);
          setFillAndHug(fHeader);
          const fName = createText(f.nome || 'Frame', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          fName.layoutGrow = 1;
          fHeader.appendChild(fName);
          if (f.isNewComponent) {
            const badge = createFrame("HORIZONTAL", 8, 3, { r: 0.94, g: 0.92, b: 1.0 });
            badge.cornerRadius = 999;
            badge.strokes = [{ type: "SOLID", color: { r: 0.70, g: 0.60, b: 0.96 } }];
            badge.strokeWeight = 1;
            badge.appendChild(createText("Novo componente", 9, "Medium", { r: 0.38, g: 0.18, b: 0.78 }));
            fHeader.appendChild(badge);
          }
          if (f.audit && f.audit.checkDone) {
            const _ressalvas = f.audit.ressalvas || [];
            const _status = f.audit.semDesvios
              ? (_ressalvas.length > 0 ? 'Conforme com ressalvas' : 'Conforme')
              : 'Não Conforme';
            createRow(fRow, "Auditoria DSC", _status + (f.audit.observacoes ? ' — ' + f.audit.observacoes : ''));
            if (f.audit.semDesvios && (f.audit.declaradoPor || f.audit.declaradoEm)) {
              const _dataFmt = f.audit.declaradoEm ? new Date(f.audit.declaradoEm).toLocaleDateString('pt-BR') : '—';
              createRow(fRow, "Declarado por", `${f.audit.declaradoPor || '—'} em ${_dataFmt}`);
            }
          }
        });
        content.appendChild(framesSection);
        setFillAndHug(framesSection);
      }

      // 1.8 MEDIDAS (seção independente, agrupada por frame)
      const _framesWithMeasures = (_frames || []).filter(f => (f.measurements || []).length > 0);
      if (_framesWithMeasures.length > 0) {
        const measSection = createSection(content, "Medidas");
        _framesWithMeasures.forEach(f => {
          // Sub-cabeçalho do frame
          const fGroup = createFrame("VERTICAL", 0, 6);
          fGroup.name = `[Medidas | ${f.figmaId || f.id}] ${f.nome || 'Frame'}`;
          measSection.appendChild(fGroup);
          setFillAndHug(fGroup);
          const fLabel = createText(f.nome || 'Frame', 10, "Bold", { r: 0.27, g: 0.45, b: 0.78 });
          fGroup.appendChild(fLabel);
          setFillAndHug(fLabel);
          f.measurements.forEach(m => {
            const details = Array.isArray(m.details) ? m.details.join(' | ') : (m.details || '');
            const mRow = createFrame("HORIZONTAL", 10, 7, { r: 0.94, g: 0.97, b: 1 });
            mRow.name = `[Medida] ${m.name || 'Medida'}`;
            mRow.cornerRadius = 6;
            mRow.counterAxisAlignItems = "CENTER";
            fGroup.appendChild(mRow);
            setFillAndHug(mRow);
            const mName = createText(m.name || 'Medida', 11, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            mName.layoutGrow = 1;
            mRow.appendChild(mName);
            const mVal = createText(details, 10, "Regular", { r: 0.27, g: 0.45, b: 0.78 });
            mRow.appendChild(mVal);
            setFillAndHug(mVal);
          });
        });
        content.appendChild(measSection);
        setFillAndHug(measSection);
      }

      // 1.9 ESPECIFICAÇÕES ANOTADAS (seção independente, agrupada por frame)
      // Specs de Acessibilidade (a11yType) ficam de fora daqui — têm seção própria
      // logo abaixo (ver "1.9b ESPECIFICAÇÕES DE ACESSIBILIDADE").
      // ══ BETA-ONLY: ficha-specs-avulsas-sem-frame (início) ══
      // Antes desta sessão a Ficha só olhava frame.createdSpecs — specs
      // criadas sem frame associado (avulsas) simplesmente não apareciam na
      // Ficha, apesar de existirem no canvas e em handoffData.specs. Ver
      // MIGRATION-BETA-TO-MAIN.md.
      // data.specs (nível superior) é o array JÁ MESCLADO avulsas+por-frame (ver
      // saveSpecsToStorage em core.js) — specs realmente sem frame são as que sobram
      // depois de remover, por id, tudo que já está em algum frame.createdSpecs.
      // Entram como um grupo "Avulsas" próprio, no mesmo formato de card usado pelos
      // frames reais (mesmo padrão do bucket "Sem área" da a11y — ver 1.9b/handoff.js).
      const _framedSpecIds = new Set(_frames.flatMap(f => (f.createdSpecs || []).map(s => s && s.id)).filter(Boolean));
      const _looseSpecs = (data.specs || []).filter(s => s && !s.a11yType && !_framedSpecIds.has(s.id));
      const _framesWithSpecs = (_frames || []).filter(f => (f.createdSpecs || []).some(s => s && !s.a11yType));
      if (_looseSpecs.length > 0) {
        _framesWithSpecs.push({ nome: 'Avulsas (sem frame)', createdSpecs: _looseSpecs });
      }
      // ══ BETA-ONLY: ficha-specs-avulsas-sem-frame (fim) ══
      if (_framesWithSpecs.length > 0) {
        const annotSection = createSection(content, "Especificações");
        for (const f of _framesWithSpecs) {
          const fGroup = createFrame("VERTICAL", 0, 10);
          fGroup.name = `[Specs] ${f.nome || 'Frame'}`;
          annotSection.appendChild(fGroup);
          setFillAndHug(fGroup);
          const fLabel = createText(f.nome || 'Frame', 10, "Bold", { r: 0.27, g: 0.45, b: 0.78 });
          fGroup.appendChild(fLabel);
          setFillAndHug(fLabel);

          // Agrupa specs por letra, mantendo ordem de aparição
          const groupNames = f.specGroupNames || {};
          const groupVisible = f.specGroupVisible || {};
          const letterOrder = [];
          const specsByLetter = {};
          (f.createdSpecs || []).filter(s => s && !s.a11yType).forEach(s => {
            const l = s.letter || 'A';
            if (!specsByLetter[l]) { specsByLetter[l] = []; letterOrder.push(l); }
            specsByLetter[l].push(s);
          });

          for (const letter of letterOrder) {
            if (groupVisible[letter] === false) continue; // grupo oculto
            const groupSpecs = specsByLetter[letter];
            const groupColor = groupSpecs[0]?.color ? hexToRgb(groupSpecs[0].color) : { r: 0.38, g: 0.35, b: 0.75 };
            const groupNameText = groupNames[letter] || '';

            // Contêiner do grupo
            const gBox = createFrame("VERTICAL", 0, 6);
            gBox.name = `[Grupo/${letter}] ${groupNameText || letter}`;
            fGroup.appendChild(gBox);
            setFillAndHug(gBox);

            // Cabeçalho do grupo: badge da letra + nome do grupo
            const gHeader = createFrame("HORIZONTAL", 0, 6);
            gHeader.counterAxisAlignItems = "CENTER";
            gBox.appendChild(gHeader);
            setFillAndHug(gHeader);
            const gBadge = createFrame("HORIZONTAL", 0, 0, groupColor);
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
              const gName = createText(groupNameText, 10, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
              gHeader.appendChild(gName);
              setFillAndHug(gName);
            }
            const gCount = createText(`${groupSpecs.length} esp.`, 9, "Regular", { r: 0.55, g: 0.6, b: 0.65 });
            gHeader.appendChild(gCount);
            setFillAndHug(gCount);

            // Specs do grupo
            const gSpecs = createFrame("VERTICAL", 0, 4);
            gSpecs.fills = [];
            gBox.appendChild(gSpecs);
            setFillAndHug(gSpecs);

            for (const s of groupSpecs) {
              const catLabel = s.type || s.categoryLabel || s.category || 'Geral';
              const sc = s.color ? hexToRgb(s.color) : { r: 0.38, g: 0.35, b: 0.75 };
              const scBg = s.fillColor ? hexToRgb(s.fillColor) : { r: 1 - (1 - sc.r) * 0.12, g: 1 - (1 - sc.g) * 0.12, b: 1 - (1 - sc.b) * 0.12 };
              const sRow = createFrame("VERTICAL", 10, 8, { r: 0.97, g: 0.97, b: 1 });
              sRow.name = `[Spec/${s.letter || 'A'}] ${s.name || s.label || 'Spec'}`;
              sRow.cornerRadius = 8;
              sRow.strokes = [{ type: "SOLID", color: sc }];
              gSpecs.appendChild(sRow);
              setFillAndHug(sRow);
              // Linha topo: nome + categoria (badge da letra no grupo já identifica)
              const sTop = createFrame("HORIZONTAL", 0, 6);
              sTop.counterAxisAlignItems = "CENTER";
              sRow.appendChild(sTop);
              setFillAndHug(sTop);
              // Nome: link para spec no canvas (ou DSC docs)
              const sName = createText(s.name || s.label || 'Spec', 11, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
              sName.layoutGrow = 1;
              sTop.appendChild(sName);
              if (s.link) {
                sName.textDecoration = "UNDERLINE";
                sName.hyperlink = { type: "URL", value: s.link };
              } else if (s.id && await figma.getNodeByIdAsync(s.id)) {
                sName.textDecoration = "UNDERLINE";
                sName.hyperlink = { type: "NODE", value: s.id };
              }
              // Categoria chip
              const sCatTag = createFrame("HORIZONTAL", 6, 3, scBg);
              sCatTag.cornerRadius = 999;
              sCatTag.strokes = [{ type: "SOLID", color: sc }];
              sCatTag.strokeWeight = 1;
              sTop.appendChild(sCatTag);
              setFillAndHug(sCatTag);
              sCatTag.appendChild(createText(catLabel, 9, "Medium", sc));
              // Nota (se tiver)
              if (s.note) {
                const sNote = createText(s.note, 10, "Regular", { r: 0.4, g: 0.45, b: 0.55 });
                sRow.appendChild(sNote);
                setFillAndHug(sNote);
              }
              // Propriedades selecionadas na spec
              const _props = s.properties || [];
              if (_props.length > 0) {
                const propsFrame = createFrame("VERTICAL", 0, 3);
                propsFrame.fills = [];
                setFillAndHug(propsFrame);
                sRow.appendChild(propsFrame);
                _props.forEach(prop => {
                  const pRow = createFrame("HORIZONTAL", 8, 4, { r: 0.93, g: 0.95, b: 1 });
                  pRow.cornerRadius = 4;
                  pRow.counterAxisAlignItems = "CENTER";
                  setFillAndHug(pRow);
                  propsFrame.appendChild(pRow);
                  const pKey = createText(prop.label || prop.key || '', 9, "Regular", { r: 0.35, g: 0.4, b: 0.5 });
                  pKey.layoutGrow = 1;
                  pRow.appendChild(pKey);
                  if (prop.token) {
                    const tBadge = createText(prop.token, 8, "Medium", { r: 0, g: 0.44, b: 0.69 });
                    setFillAndHug(tBadge);
                    pRow.appendChild(tBadge);
                  }
                  const pVal = createText(String(prop.value || ''), 9, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
                  setFillAndHug(pVal);
                  pRow.appendChild(pVal);
                });
              }
            }
          }
        }
        content.appendChild(annotSection);
        setFillAndHug(annotSection);
      }

      // 1.9b ESPECIFICAÇÕES DE ACESSIBILIDADE (seção independente — só aparece se
      // houver ao menos uma spec de a11y, avulsa ou em algum frame.a11ySpecs). Array
      // estruturalmente separado de frame.createdSpecs (ver core.js/
      // _migrateA11ySpecsFromCreatedSpecs para dados salvos antes dessa separação) —
      // mesmo formato de properties[] que 1.9, só de origem e rótulo diferentes.
      // ══ BETA-ONLY: ficha-specs-avulsas-sem-frame (a11y) (início) ══
      // Mesma correção do bloco 1.9 acima, agora para specs/áreas de a11y —
      // antes só frame.a11ySpecs entrava na Ficha. Ver MIGRATION-BETA-TO-MAIN.md.
      // data.a11ySpecs/data.a11yAreas (nível superior) são os arrays JÁ MESCLADOS
      // avulsas+por-frame (ver saveSpecsToStorage em core.js) — itens realmente
      // avulsos são os que sobram depois de remover, por id, tudo que já está em
      // algum frame.a11ySpecs/a11yAreas.
      const _A11Y_TYPE_LABEL = { elemento: 'Elementos e Imagens', estrutura: 'Estrutura da Página', titulo: 'Nível de Título', decorativo: 'Elemento Decorativo', informacoes: 'Informações Adicionais' };
      const _framedA11ySpecIds = new Set(_frames.flatMap(f => (f.a11ySpecs || []).map(s => s && s.id)).filter(Boolean));
      const _framedA11yAreaIds = new Set(_frames.flatMap(f => (f.a11yAreas || []).map(a => a && a.id)).filter(Boolean));
      const _looseA11ySpecs = (data.a11ySpecs || []).filter(s => s && !_framedA11ySpecIds.has(s.id));
      const _looseA11yAreas = (data.a11yAreas || []).filter(a => a && !_framedA11yAreaIds.has(a.id));
      const _framesWithA11y = (_frames || []).filter(f => (f.a11ySpecs || []).length > 0);
      if (_looseA11ySpecs.length > 0) {
        _framesWithA11y.push({ nome: 'Avulsas (sem frame)', a11ySpecs: _looseA11ySpecs, a11yAreas: _looseA11yAreas });
      }
      // ══ BETA-ONLY: ficha-specs-avulsas-sem-frame (a11y) (fim) ══
      if (_framesWithA11y.length > 0) {
        const a11ySection = createSection(content, "Especificações de Acessibilidade");
        for (const f of _framesWithA11y) {
          const fGroup = createFrame("VERTICAL", 0, 10);
          fGroup.name = `[A11y] ${f.nome || 'Frame'}`;
          a11ySection.appendChild(fGroup);
          setFillAndHug(fGroup);
          const fLabel = createText(f.nome || 'Frame', 10, "Bold", { r: 0.27, g: 0.45, b: 0.78 });
          fGroup.appendChild(fLabel);
          setFillAndHug(fLabel);

          // ══ BETA-ONLY: ficha-a11y-agrupada-por-area (início) ══
          // buildA11ySpecCard foi extraída do corpo do loop antigo (que
          // iterava a11ySpecs linearmente, sem agrupar) para ser reaproveitada
          // tanto dentro de cada Área Marcada quanto no bucket "Sem área"
          // abaixo. Espelha na Ficha o mesmo agrupamento por área que a UI já
          // faz (accessibility.js: renderA11yGroupedList). Ver
          // MIGRATION-BETA-TO-MAIN.md.
          const buildA11ySpecCard = (parent, s) => {
            const subtypeLabel = _A11Y_TYPE_LABEL[s.a11yType] || 'Acessibilidade';
            const sc = s.color ? hexToRgb(s.color) : { r: 0.03, g: 0.57, b: 0.70 };
            const scBg = s.fillColor ? hexToRgb(s.fillColor) : { r: 0.88, g: 0.96, b: 0.98 };
            const sRow = createFrame("VERTICAL", 10, 8, { r: 0.97, g: 0.99, b: 0.99 });
            sRow.name = `[A11y/${s.letter || 'A'}] ${s.name || 'Spec'}`;
            sRow.cornerRadius = 8;
            sRow.strokes = [{ type: "SOLID", color: sc }];
            parent.appendChild(sRow);
            setFillAndHug(sRow);

            const sTop = createFrame("HORIZONTAL", 0, 6);
            sTop.counterAxisAlignItems = "CENTER";
            sRow.appendChild(sTop);
            setFillAndHug(sTop);

            const sName = createText(s.name || 'Spec', 11, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            sName.layoutGrow = 1;
            sTop.appendChild(sName);

            const sTypeTag = createFrame("HORIZONTAL", 6, 3, scBg);
            sTypeTag.cornerRadius = 999;
            sTypeTag.strokes = [{ type: "SOLID", color: sc }];
            sTypeTag.strokeWeight = 1;
            sTop.appendChild(sTypeTag);
            setFillAndHug(sTypeTag);
            sTypeTag.appendChild(createText(subtypeLabel, 9, "Medium", sc));

            const _props = s.properties || [];
            if (_props.length > 0) {
              const propsFrame = createFrame("VERTICAL", 0, 3);
              propsFrame.fills = [];
              setFillAndHug(propsFrame);
              sRow.appendChild(propsFrame);
              _props.forEach(prop => {
                const pRow = createFrame("HORIZONTAL", 8, 4, { r: 0.93, g: 0.97, b: 0.98 });
                pRow.cornerRadius = 4;
                pRow.counterAxisAlignItems = "CENTER";
                setFillAndHug(pRow);
                propsFrame.appendChild(pRow);
                const pKey = createText(prop.label || prop.key || '', 9, "Regular", { r: 0.35, g: 0.4, b: 0.5 });
                pKey.layoutGrow = 1;
                pRow.appendChild(pKey);
                const pVal = createText(String(prop.value || ''), 9, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
                setFillAndHug(pVal);
                pRow.appendChild(pVal);
              });
            }
            return sName;
          };

          const a11ySpecs = (f.a11ySpecs || []).filter(Boolean);
          const a11yAreas = (f.a11yAreas || []).filter(Boolean).sort((a, b) => (a.number || 0) - (b.number || 0));
          const aAreasBox = createFrame("VERTICAL", 0, 8);
          aAreasBox.fills = [];
          fGroup.appendChild(aAreasBox);
          setFillAndHug(aAreasBox);

          for (const area of a11yAreas) {
            const areaSpecs = a11ySpecs.filter(s => s.a11yAreaId === area.id);
            if (areaSpecs.length === 0) continue;

            const gBox = createFrame("VERTICAL", 0, 6);
            gBox.name = `[Área ${area.number != null ? area.number : ''}] ${area.label || 'Área'}`;
            aAreasBox.appendChild(gBox);
            setFillAndHug(gBox);

            const gHeader = createFrame("HORIZONTAL", 0, 6);
            gHeader.counterAxisAlignItems = "CENTER";
            gBox.appendChild(gHeader);
            setFillAndHug(gHeader);
            const gBadge = createFrame("HORIZONTAL", 0, 0, { r: 0, g: 0.44, b: 0.69 });
            gBadge.resize(18, 18);
            gBadge.cornerRadius = 999;
            gBadge.primaryAxisAlignItems = "CENTER";
            gBadge.counterAxisAlignItems = "CENTER";
            gHeader.appendChild(gBadge);
            const gBadgeT = figma.createText();
            gBadgeT.fontName = { family: "Inter", style: "Bold" };
            gBadgeT.fontSize = 9;
            gBadgeT.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            gBadgeT.characters = String(area.number != null ? area.number : '·');
            gBadgeT.textAutoResize = "WIDTH_AND_HEIGHT";
            gBadge.appendChild(gBadgeT);
            const gName = createText(area.label || 'Área', 10, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            gHeader.appendChild(gName);
            setFillAndHug(gName);
            const gCount = createText(`${areaSpecs.length} esp.`, 9, "Regular", { r: 0.55, g: 0.6, b: 0.65 });
            gHeader.appendChild(gCount);
            setFillAndHug(gCount);

            const gSpecs = createFrame("VERTICAL", 0, 6);
            gSpecs.fills = [];
            gBox.appendChild(gSpecs);
            setFillAndHug(gSpecs);

            for (const s of areaSpecs) {
              const sName = buildA11ySpecCard(gSpecs, s);
              if (s.id && await figma.getNodeByIdAsync(s.id)) {
                sName.textDecoration = "UNDERLINE";
                sName.hyperlink = { type: "NODE", value: s.id };
              }
            }
          }

          const _semArea = a11ySpecs.filter(s => !s.a11yAreaId || !a11yAreas.some(a => a.id === s.a11yAreaId));
          if (_semArea.length > 0) {
            const gBox = createFrame("VERTICAL", 0, 6);
            gBox.name = `[Sem área]`;
            aAreasBox.appendChild(gBox);
            setFillAndHug(gBox);

            const gHeader = createFrame("HORIZONTAL", 0, 6);
            gHeader.counterAxisAlignItems = "CENTER";
            gBox.appendChild(gHeader);
            setFillAndHug(gHeader);
            const gName = createText('Sem área', 10, "Bold", { r: 0.7, g: 0.5, b: 0.1 });
            gHeader.appendChild(gName);
            setFillAndHug(gName);
            const gCount = createText(`${_semArea.length} esp.`, 9, "Regular", { r: 0.55, g: 0.6, b: 0.65 });
            gHeader.appendChild(gCount);
            setFillAndHug(gCount);

            const gSpecs = createFrame("VERTICAL", 0, 6);
            gSpecs.fills = [];
            gBox.appendChild(gSpecs);
            setFillAndHug(gSpecs);

            for (const s of _semArea) {
              const sName = buildA11ySpecCard(gSpecs, s);
              if (s.id && await figma.getNodeByIdAsync(s.id)) {
                sName.textDecoration = "UNDERLINE";
                sName.hyperlink = { type: "NODE", value: s.id };
              }
            }
          }
          // ══ BETA-ONLY: ficha-a11y-agrupada-por-area (fim) ══
        }
        content.appendChild(a11ySection);
        setFillAndHug(a11ySection);
      }

      // 1.10 FLUXOS DE TELA
      const _flows = data.createdFlows || [];
      if (_flows.length > 0) {
        const flowTypeLabel = { line_solid: 'Linha sólida', line_dashed: 'Linha tracejada', diamond: 'Decisão', diamond_dashed: 'Decisão tracejada', event_start: 'Início', event_end: 'Fim', gateway_parallel: 'Paralelo' };
        const flowsSection = createSection(content, "Fluxos de Tela");
        _flows.forEach((flow, fi) => {
          const fRow = createFrame("VERTICAL", 12, 10, { r: 0.97, g: 0.96, b: 1 });
          fRow.name = `[Fluxo] ${flow.name || 'Fluxo ' + (fi + 1)}`;
          fRow.cornerRadius = 8;
          fRow.strokes = [{ type: "SOLID", color: { r: 0.86, g: 0.84, b: 0.96 } }];
          flowsSection.appendChild(fRow);
          setFillAndHug(fRow);
          // Topo: nome + tipo
          const fTop = createFrame("HORIZONTAL", 0, 4);
          fTop.counterAxisAlignItems = "CENTER";
          fRow.appendChild(fTop);
          setFillAndHug(fTop);
          const fName = createText(flow.name || 'Fluxo', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          fName.layoutGrow = 1;
          fTop.appendChild(fName);
          const typeStr = flowTypeLabel[flow.type] || flow.type || '';
          if (typeStr) {
            const fTypeTag = createFrame("HORIZONTAL", 6, 3, { r: 0.93, g: 0.90, b: 1 });
            fTypeTag.cornerRadius = 999;
            fTop.appendChild(fTypeTag);
            setFillAndHug(fTypeTag);
            fTypeTag.appendChild(createText(typeStr, 9, "Medium", { r: 0.45, g: 0.35, b: 0.75 }));
          }
          // Conexão origem → destino
          if (flow.fromName || flow.toName) {
            const connStr = `${flow.fromName || '?'} → ${flow.toName || '?'}`;
            const fConn = createText(connStr, 10, "Regular", { r: 0.45, g: 0.50, b: 0.60 });
            fRow.appendChild(fConn);
            setFillAndHug(fConn);
          }
          // Texto de decisão
          if (flow.decisionText) {
            const dText = createText(`"${flow.decisionText}"`, 10, "Regular", { r: 0.5, g: 0.45, b: 0.70 });
            fRow.appendChild(dText);
            setFillAndHug(dText);
          }
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

          const titleNode = createText(title, 18, "Bold", { r: 0, g: 0.35, b: 0.79 });
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
                iName.fills = [{ type: "SOLID", color: { r: 0, g: 0.35, b: 0.79 } }];
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
                  const tBadge = createText(prop.token, 8, "Regular", { r: 0, g: 0.44, b: 0.69 });
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
        
        const auditTitle = createText("Relatório de Auditoria", 24, "Bold", { r: 0, g: 0.35, b: 0.79 });
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
        // BETA-ONLY: ficha-atualiza-sem-duplicar
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
      // ══ BETA-ONLY: ficha-atualiza-sem-duplicar (fim) ══

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
        const _pageNodes = figma.currentPage.children.filter(n => n !== mainContainer && !_existingFichas.includes(n));
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
        origin: msg.origin || null, // BETA-ONLY: a11y-deteccao-automatica — roteia a resposta em messages.js
        error: "Nenhum item selecionado. Por favor, selecione um ou mais frames, seções ou grupos no Figma para escanear.",
      });
      return;
    }

    const specs = {
      components: new Map(),
      icons: new Map(),
      typography: new Map(),
      frames: new Map(),
      vectors: new Map(),
      images: new Map() // BETA-ONLY: a11y-mapeamento-interativo
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

      // ══ BETA-ONLY: a11y-deteccao-automatica (início — enriquecimento do scan) ══
      // Depende de: _resolveDscComponentA11yMatch/_resolveDecorativeA11yMatch/
      // _resolveTypographyA11yMatch (definidas mais acima nesta mesma fonte).
      // Ver MIGRATION-BETA-TO-MAIN.md.
      // Aditivo: detecção de correspondência componente DSC → categoria de a11y.
      // Não influencia isDS/score/matchedBy — só anexa dado extra ao lado, usado
      // pela Detecção Automática de a11y (aba Anotar Specs).
      let dscComponentMatch = null;
      if (node.type === 'INSTANCE' && mainComp && mainComp.remote && componentKey) {
        dscComponentMatch = _resolveDscComponentA11yMatch(componentKey);
      } else if ((category === 'icons' || category === 'vectors') && !dscComponentMatch) {
        // Ícone/vetor solto sem correspondência de biblioteca real — heurística
        // conservadora de "Elemento Decorativo" (ver _resolveDecorativeA11yMatch).
        dscComponentMatch = _resolveDecorativeA11yMatch(node);
      } else if (category === 'images' && !dscComponentMatch) {
        // BETA-ONLY: a11y-mapeamento-interativo — imagem de conteúdo real
        // (fill IMAGE), ver _resolveImageA11yMatch.
        dscComponentMatch = _resolveImageA11yMatch(node);
      }
      // ══ BETA-ONLY: a11y-deteccao-automatica (pausa — segue lógica pré-existente) ══
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
        // BETA-ONLY: a11y-deteccao-automatica
        // Aditivo: heurística fraca de nome (estilo nomeado ou camada) →
        // sugestão de "Nível de Título" para a Detecção Automática de a11y.
        // Sempre confidence 'baixa' — ver _resolveTypographyA11yMatch.
        dscComponentMatch = _resolveTypographyA11yMatch(node, _typoProp);
      }
      // ══ BETA-ONLY: a11y-deteccao-automatica (fim do enriquecimento do scan) ══

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
          dscComponentMatch: dscComponentMatch, // BETA-ONLY: a11y-deteccao-automatica
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
          dscComponentMatch: dscComponentMatch, // BETA-ONLY: a11y-deteccao-automatica
          variants: variants,
          properties: props
        });
      } else {
        const item = map.get(name);
        item.layers.add(name);
      }
    }

    async function extractSpecs(n, depth) {
      // BETA-ONLY: a11y-fixes-pos-teste — profundidade. Telas bancárias reais
      // (sidebar + área de conteúdo com cards/seções aninhadas) facilmente
      // ultrapassam 8 níveis, fazendo o scan "esquecer" elementos legítimos
      // nos níveis mais profundos. Afeta ambos os scans (tokens e a11y —
      // mesma função, `origin` só diferencia o roteamento da resposta).
      if ((depth || 0) > 16) return;
      // SKIP HIDDEN NODES
      if (n.visible === false) return;

      try {
        const props = await extractNodeProperties(n);
        let category = "frames";

        const nameLower = n.name.toLowerCase();
        const isIcon = nameLower.includes("icon") || nameLower.includes("ic-") ||
                       (n.type === "INSTANCE" && n.width <= 32 && n.height <= 32 && !nameLower.includes("button"));

        // ══ BETA-ONLY: a11y-mapeamento-interativo (início) ══
        // Node com fill do tipo IMAGE (RECTANGLE, FRAME, ELLIPSE ou qualquer
        // node com `fills`) nunca era coletado em categoria nenhuma, e por
        // isso nunca passava pelo enriquecimento de a11y — imagens de
        // conteúdo real (que precisam de "Elementos e Imagens"/texto
        // alternativo para leitores de tela) ficavam invisíveis pra Detecção
        // Automática. Checado ANTES das ramificações abaixo pra garantir
        // categorização mutuamente exclusiva (um node com fill de imagem não
        // deve também virar vectors/components/icons na mesma passada).
        const hasImageFill = Array.isArray(n.fills) &&
          n.fills.some(f => f && f.type === 'IMAGE' && f.visible !== false);

        if (hasImageFill && !isIcon) {
          category = "images";
        } else if (n.type === "TEXT") {
        // ══ BETA-ONLY: a11y-mapeamento-interativo (fim) ══
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
    await prepareListWithPreviews(specs.images); // BETA-ONLY: a11y-mapeamento-interativo
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
      origin: msg.origin || null, // BETA-ONLY: a11y-deteccao-automatica — roteia a resposta em messages.js
      data: {
        components: formatMap(specs.components),
        icons: formatMap(specs.icons),
        typography: formatMap(specs.typography),
        frames: formatMap(specs.frames),
        vectors: formatMap(specs.vectors),
        images: formatMap(specs.images), // BETA-ONLY: a11y-mapeamento-interativo
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
      const themeColor = hexToRgb(opts.color || '#005ca9');
      const themeFill  = hexToRgb(opts.fillColor || opts.color || '#EBF4FB');

      const _specSide = opts.guideSide || 'right';

      // Selos de specs de Acessibilidade são círculos cheios no material de
      // referência da vertical — quadrado arredondado (radius 8) continua
      // sendo o padrão das specs normais, não mexer nisso globalmente.
      const _tagRadius = opts.a11yType ? 21 : 8;

      // Specs de Acessibilidade recebem layer tag própria ([SpecA11y | ...])
      // para ficarem identificáveis e filtráveis no painel de layers do Figma,
      // sem se misturar com as specs normais ([Spec | ...]).
      const _layerTag = opts.a11yType ? 'SpecA11y' : 'Spec';

      // Fase 2c — pra specs de Acessibilidade, tenta reaproveitar o
      // componente REAL da lib "Design Acessível" (importComponentByKeyAsync)
      // no lugar do card desenhado. Algumas variações não têm componente real
      // catalogado de propósito (ex: Componente "Outro/fora do catálogo",
      // Título mobile, Customizável) — nesses casos cai no card desenhado
      // sem erro (fallback ESPERADO, ver _A11Y_EXPECTED_FALLBACK_PREFIXES
      // abaixo). Qualquer outra falha (lib inacessível, key errada) é erro
      // real e é tratada mais abaixo, depois que sabemos se era esperado.
      let specCard = null;
      let _a11yImportFailReason = null;
      if (opts.a11yType) {
        try {
          specCard = await _tryImportA11yComponent(opts);
          specCard.name = 'Spec Notes';
          // Fundo branco garantido — o componente real já nasce branco na
          // maioria dos casos, mas força explicitamente pra não depender
          // disso (evita ficar transparente sobre conteúdo real da tela).
          try { specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }]; } catch (e) { }
          // Padding interno garantido em 12 — força explicitamente em vez de
          // confiar no padding embutido da variante importada, que pode
          // variar entre as 5 categorias/subtipos.
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
      }

      const _A11Y_EXPECTED_FALLBACK_PREFIXES = [
        'a11y-elemento-outro-sem-componente-real',
        'a11y-titulo-mobile-sem-variante-real',
        'a11y-informacoes-customizavel-sem-variante-real',
        'a11y-estrutura-variacao-sem-import-real',
        'a11y-estrutura-marco-customizavel-sem-conteudo-catalogado',
      ];
      const _isExpectedFallback = _a11yImportFailReason && _A11Y_EXPECTED_FALLBACK_PREFIXES.some(p => _a11yImportFailReason.startsWith(p));
      if (opts.a11yType && _a11yImportFailReason && !_isExpectedFallback) {
        figma.notify('Não foi possível criar a especificação — a lib "Design Acessível" precisa estar habilitada neste arquivo. (' + _a11yImportFailReason + ')', { error: true });
        return;
      }

      if (!specCard) {
      // Create Spec Card
      specCard = figma.createFrame();
      specCard.name = 'Spec Notes';
      specCard.layoutMode = "VERTICAL";
      // Specs de A11y usam 12px, igual ao padding padrão do "Box specs LT"
      // real da lib — specs normais mantêm 16px (não mexer nisso).
      const _cardPadding = opts.a11yType ? 12 : 16;
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
      specCard.counterAxisSizingMode = "AUTO";

      // Header row with Tag
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

      // Add properties list
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

      // Exceções mapeadas para esta spec
      const specExcecoes = opts.excecoes || [];
      if (specExcecoes.length > 0) {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const excFrame = figma.createFrame();
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 6;
        excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
        excFrame.paddingLeft = 10; excFrame.paddingRight = 10;
        excFrame.paddingTop = 8; excFrame.paddingBottom = 8;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
        excTitle.characters = `CENÁRIOS DE EXCEÇÃO (${specExcecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        const _excTypeRgb = {
          'Erro':        { r: 0.80, g: 0.15, b: 0.15 },
          'Alerta':      { r: 0.80, g: 0.50, b: 0.00 },
          'Sucesso':     { r: 0.10, g: 0.55, b: 0.25 },
          'Confirmação': { r: 0.05, g: 0.35, b: 0.80 },
        };
        specExcecoes.forEach(exc => {
          const excRow = figma.createFrame();
          excRow.layoutMode = "HORIZONTAL";
          excRow.itemSpacing = 6;
          excRow.fills = [];
          excRow.primaryAxisSizingMode = "AUTO";
          excRow.counterAxisSizingMode = "AUTO";
          excRow.counterAxisAlignItems = "CENTER";
          const typeColor = _excTypeRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 };
          const typeLabel = figma.createText();
          typeLabel.fontName = { family: "Inter", style: "Bold" };
          typeLabel.fontSize = 9;
          typeLabel.fills = [{ type: "SOLID", color: typeColor }];
          typeLabel.characters = (exc.tipo || 'GERAL').toUpperCase();
          typeLabel.textAutoResize = "WIDTH_AND_HEIGHT";
          const titleLabel = figma.createText();
          titleLabel.fontName = { family: "Inter", style: "Regular" };
          titleLabel.fontSize = 10;
          titleLabel.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
          titleLabel.characters = `${exc.titulo || ''}${exc.notas ? ' — ' + exc.notas : ''}`;
          titleLabel.textAutoResize = "WIDTH_AND_HEIGHT";
          excRow.appendChild(typeLabel);
          excRow.appendChild(titleLabel);
          excFrame.appendChild(excRow);
        });
        specCard.appendChild(excFrame);
      }

      // Add link after title/properties
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

      // Group variables
      let groupNodes = [];
      let _absCardX = 0, _absCardY = 0, _absCardW = 0, _absCardH = 0;

      // Positioning
      const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
      if (bounds) {
        // Specs de Acessibilidade usam exclusivamente o marcador REAL da lib:
        // "[a11y] Agrupamento" no modo Contorno (default), ou o conector-linha
        // real (A11Y_CONECTOR_LINHA_KEYS) no modo Linha — nada de contorno
        // tracejado ou chip desenhado por procedimento. Se o import falhar, a
        // spec inteira é abortada (o card já criado é removido) em vez de
        // nascer com um marcador improvisado.
        let marker = null;
        if (opts.a11yType) {
          try {
            marker = opts.drawMode === 'linha'
              ? await _tryImportA11yConectorLinha(opts)
              : await _tryImportA11yAgrupamento(opts);
          } catch (e) {
            try { specCard.remove(); } catch (_) { }
            figma.notify('Não foi possível criar o marcador — a lib "Design Acessível" precisa estar habilitada neste arquivo. (' + (e && e.message ? e.message : String(e)) + ')', { error: true });
            return;
          }
        }

        // Âncora usada pelo conector mais abaixo — bounds do elemento por
        // padrão (specs normais), ou do marcador real quando ele existe (o
        // conector nasce dele, não do elemento em si).
        let _markerAnchorBounds = bounds;

        if (marker) {
          // Redimensiona o marcador real pra envolver o elemento inteiro —
          // mesma folga (16px por lado) que o contorno tracejado procedural
          // usava antes, mantendo o mesmo enquadramento visual. O componente
          // "Agrupamento" foi feito pra isso (moldura + selo num canto,
          // conforme a orientação escolhida), não é só um badge pequeno. O
          // conector-linha real já nasce no tamanho certo, não redimensiona.
          if (opts.drawMode !== 'linha') {
            figma.currentPage.appendChild(marker);
            try {
              marker.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));
            } catch (e) { /* variante sem resize livre — segue com o tamanho padrão */ }
            marker.x = Math.round(bounds.x - 16);
            marker.y = Math.round(bounds.y - 16);
          } else {
            // O componente "Conector" NÃO é simétrico: o selo fica numa ponta
            // e a linha se estende até a outra, que é o ponto de contato real
            // com o elemento (confirmado via REST API + render em 2026-08-07,
            // ver nodes 1:91/1:65/1:143/1:117 do arquivo da lib). A ponta de
            // contato é sempre OPOSTA ao lado indicado pelo nome da variante —
            // "conector=direita" tem o selo à direita e a ponta de contato na
            // borda ESQUERDA do bounding box (a linha aponta para a esquerda,
            // de volta ao elemento); "conector=superior" tem o selo em cima e
            // a ponta de contato na borda INFERIOR (a linha desce até o
            // elemento). Por isso o cálculo abaixo ancora a borda oposta do
            // marcador na borda do elemento, sem gap extra (o componente já
            // nasce com o comprimento de linha padrão da lib).
            const _side = opts.guideSide || 'right';
            figma.currentPage.appendChild(marker);
            // right → conector=direita: ponto de contato é a borda ESQUERDA
            // do marker (x local 0); encosta na borda direita do elemento.
            if (_side === 'right') { marker.x = bounds.x + bounds.width; marker.y = bounds.y + bounds.height / 2 - marker.height / 2; }
            // left → conector=esquerda: ponto de contato é a borda DIREITA
            // do marker; encosta na borda esquerda do elemento.
            else if (_side === 'left') { marker.x = bounds.x - marker.width; marker.y = bounds.y + bounds.height / 2 - marker.height / 2; }
            // top → conector=superior: ponto de contato é a borda INFERIOR
            // do marker (selo fica no topo); encosta no topo do elemento.
            else if (_side === 'top') { marker.x = bounds.x + bounds.width / 2 - marker.width / 2; marker.y = bounds.y - marker.height; }
            // bottom → conector=inferior: ponto de contato é a borda
            // SUPERIOR do marker (selo fica embaixo); encosta na base do elemento.
            else { marker.x = bounds.x + bounds.width / 2 - marker.width / 2; marker.y = bounds.y + bounds.height; }
          }
          groupNodes.push(marker);
          _markerAnchorBounds = marker.absoluteBoundingBox || _markerAnchorBounds;
        } else {
          // Specs normais (sem a11yType) continuam com o contorno tracejado
          // + chip desenhados por procedimento — não mexer nisso.
          const contour = figma.createFrame();
          contour.name = 'Destaque';
          contour.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));

          figma.currentPage.appendChild(contour);
          contour.x = bounds.x - 16;
          contour.y = bounds.y - 16;

          contour.fills = [];
          contour.strokes = [{ type: "SOLID", color: themeColor }];
          contour.strokeWeight = 2;
          contour.dashPattern = [4, 4];
          contour.locked = true;

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

          groupNodes.push(contour);
        }

        // Append card to page first so Figma computes its real dimensions
        figma.currentPage.appendChild(specCard);

        const side = opts.guideSide || 'right'; // 'right' | 'left' | 'top' | 'bottom'
        const _isVertSide = side === 'right' || side === 'left';
        const _specLetter = opts.letter;

        // Âncora: frame de nível de página que contém o elemento
        let _anchorNode = node;
        while (_anchorNode.parent && _anchorNode.parent.type !== 'PAGE') {
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
        // Título usa selo FIXO "H" repetido em elementos diferentes — não é um
        // identificador único como as tags normais/de Elementos e Imagens, então
        // não pode alimentar o agrupamento por "mesma tag" (empilharia specs de
        // títulos diferentes uma sobre a outra). Cada spec de Título posiciona
        // de forma independente, sempre relativa ao próprio elemento-alvo.
        // Specs de A11y são reparentadas pra dentro da Section organizadora
        // logo após criadas (_reparentIntoA11ySection) — por isso deixam de
        // ser filhas diretas da página, e escanear só figma.currentPage.children
        // não encontra mais as specs anteriores (empilhamento silenciosamente
        // parava de funcionar, causando sobreposição). Specs normais continuam
        // soltas na página, sem mudança.
        const _stackScanNodes = opts.a11yType
          ? (_getOrCreateA11ySection().children || [])
          : figma.currentPage.children;
        if (opts.a11yType !== 'titulo') _stackScanNodes.forEach(n => {
          if (n.type !== 'GROUP') return;
          // Novo formato semântico — compara apenas contra o mesmo tipo de layer
          // (Spec normal x SpecA11y têm namespaces de letra independentes, não
          // devem se empilhar uma sobre a outra ao posicionar).
          const newFmt = n.name.match(new RegExp('^\\[' + _layerTag + ' \\| ([A-Z]\\d*(?:\\.\\d+)*) \\| ([a-z]+)\\] '));
          if (newFmt) {
            if (newFmt[2] !== side) return;
            // 'Spec Notes' pode ser um FRAME desenhado (fallback procedural) ou
            // uma INSTANCE do componente real importado da lib (Fase 2c) — o
            // agrupamento por tag precisa reconhecer ambos.
            const specNotes = n.children && n.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && (c.name === 'Spec Notes' || c.name === 'Ficha') && c !== specCard);
            if (!specNotes) return;
            const bb = specNotes.absoluteBoundingBox || specNotes.absoluteRenderBounds;
            if (bb) _updateLetterMap(newFmt[1], bb);
            return;
          }
          // Formato legado: [Spec] NodeName (specs normais anteriores à separação A11y)
          if (opts.a11yType || !n.name.startsWith('[Spec]')) return;
          const ficha = n.children && n.children.find(c => c.type === 'FRAME' && c.name.includes('/Ficha') && c !== specCard);
          if (!ficha) return;
          const lm = ficha.name.match(/\[Spec\/([A-Z]\d*(?:\.\d+)*)\]/);
          const sm = ficha.name.match(/\/Ficha:([a-z]+)/);
          if (!lm) return;
          if ((sm ? sm[1] : 'right') !== side) return;
          const bb = ficha.absoluteBoundingBox || ficha.absoluteRenderBounds;
          if (bb) _updateLetterMap(lm[1], bb);
        });

        // ══ BETA-ONLY: a11y-layout-colunas (início) ══
        // Depende de: opts.existingAreaSpecIds/opts.existingAreaAllSpecIds
        // (accessibility.js: _collectAreaSiblingSpecIds/_collectAreaAllSpecIds).
        // Ver MIGRATION-BETA-TO-MAIN.md.
        // Specs de A11y com Área Marcada (opts.a11yAreaId) precisam ficar
        // organizadas em sub-colunas por CATEGORIA (opts.a11yType) dentro do
        // espaço da área: specs da MESMA área E MESMA categoria empilham na
        // MESMA coluna X (independente de letra ou lado do conector);
        // categorias diferentes da mesma área ganham colunas X diferentes,
        // lado a lado (refinamento sobre o agrupamento por área anterior,
        // que indexava só por a11yAreaId). O node de spec no canvas não
        // carrega a11yAreaId/a11yType em lugar nenhum (nem no nome, nem em
        // pluginData) — só o frontend sabe essa associação, via handoffData.
        // Por isso o frontend manda opts.existingAreaSpecIds (irmãs da MESMA
        // área+categoria, ver _collectAreaSiblingSpecIds em accessibility.js)
        // e opts.existingAreaAllSpecIds (irmãs da área inteira, qualquer
        // categoria — só usado como fallback pra achar a coluna mais à
        // direita já ocupada quando a categoria é nova na área). Resolvemos
        // aqui via getNodeByIdAsync — sem depender de parsing de nome nem de
        // pluginData retroativo, compatível com specs criadas antes desta
        // mudança.
        const _areaColKey = opts.a11yAreaId ? `${opts.a11yAreaId}::${opts.a11yType}` : null;
        const _areaMap = {};
        if (opts.a11yType && opts.a11yAreaId && Array.isArray(opts.existingAreaSpecIds) && opts.existingAreaSpecIds.length > 0) {
          for (const _sid of opts.existingAreaSpecIds) {
            if (!_sid) continue;
            const _sibling = await figma.getNodeByIdAsync(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = _sibling.children && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && (c.name === 'Spec Notes' || c.name === 'Ficha'));
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

        // Categoria nova na área (sem specs próprias ainda): calcula a
        // coluna mais à direita já ocupada por OUTRA categoria da MESMA área
        // (não do canvas inteiro) pra encostar a nova sub-coluna ao lado
        // dela — mesmo princípio do fallback "letra nova" mais abaixo
        // (_letterMap), aplicado agora ao nível de área.
        let _areaRightmostOtherCategory = null;
        if (opts.a11yType && opts.a11yAreaId && !_areaMap[_areaColKey] && Array.isArray(opts.existingAreaAllSpecIds) && opts.existingAreaAllSpecIds.length > 0) {
          for (const _sid of opts.existingAreaAllSpecIds) {
            if (!_sid) continue;
            const _sibling = await figma.getNodeByIdAsync(_sid);
            if (!_sibling || _sibling.removed) continue;
            const _siblingNotes = _sibling.children && _sibling.children.find(c => (c.type === 'FRAME' || c.type === 'INSTANCE') && (c.name === 'Spec Notes' || c.name === 'Ficha'));
            const _bb = (_siblingNotes && (_siblingNotes.absoluteBoundingBox || _siblingNotes.absoluteRenderBounds))
              || _sibling.absoluteBoundingBox || _sibling.absoluteRenderBounds;
            if (!_bb) continue;
            if (!_areaRightmostOtherCategory || _bb.x + _bb.width > _areaRightmostOtherCategory.right) {
              _areaRightmostOtherCategory = { topY: _bb.y, right: _bb.x + _bb.width };
            }
          }
        }
        // ══ BETA-ONLY: a11y-layout-colunas (fim do cálculo — uso em targetX/targetY abaixo) ══

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
        // BETA-ONLY: a11y-layout-colunas (início) — os 2 branches abaixo
        } else if (opts.a11yType && opts.a11yAreaId && _areaMap[_areaColKey]) {
          // Já existe pelo menos uma spec nesta Área Marcada E nesta mesma
          // categoria — empilha na MESMA sub-coluna X dela, independente da
          // letra ou do lado (side) da spec sendo criada agora. Empilhamento
          // sempre por Y crescente (regra do usuário: "conforme novas specs
          // são adicionadas", não depende de side aqui como o agrupamento
          // por letra depende).
          targetX = _areaMap[_areaColKey].x;
          targetY = _areaMap[_areaColKey].bottom + _SPEC_GAP;
        } else if (opts.a11yType && opts.a11yAreaId && _areaRightmostOtherCategory) {
          // Categoria nova dentro de uma área que já tem outras categorias —
          // abre uma sub-coluna nova ao lado da mais à direita JÁ OCUPADA
          // NESTA ÁREA (não do canvas inteiro), mantendo as sub-colunas de
          // uma mesma área fisicamente próximas umas das outras.
          targetX = _areaRightmostOtherCategory.right + _SPEC_COL_GAP;
          targetY = _areaRightmostOtherCategory.topY;
        // BETA-ONLY: a11y-layout-colunas (fim)
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
        // Sempre VectorNode estático — figma.createConnector() é exclusivo do
        // FigJam, não funciona em arquivos Figma Design (confirmado via API
        // docs), então não há alternativa nativa viável aqui.
        //
        // Modo "Linha" de A11y: o marcador real importado acima (Fase 2d,
        // `marker`) já É o conector completo (linha + selo embutidos no
        // componente da lib) — não desenha nada mais aqui, senão duplica a
        // linha. Este bloco só roda pra specs normais e pro modo Contorno de
        // A11y (que precisa da linha ligando a moldura ao card de texto).
        if (opts.drawConnection !== false && !(opts.a11yType && opts.drawMode === 'linha')) {
          // Âncora do lado do elemento: bounds do marcador real quando ele
          // existe (Fase 2d), senão os bounds do elemento/contorno como antes.
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

      // Always create group at the Page level to avoid nesting in selected components
      const specGroup = figma.group(groupNodes, figma.currentPage);
      specGroup.name = `[${_layerTag} | ${opts.letter} | ${_specSide}] ${node.name}`;
      // Specs de A11y nascem travadas — o marcador já é calculado pra
      // contornar o elemento certo, não é pra arrastar/reposicionar como as
      // specs normais. Um cadeado na listagem destrava se precisar.
      specGroup.locked = !!opts.a11yType;
      // Specs de A11y ganham categoria própria ('a11y', não 'spec') — permite
      // apagar/filtrar separadamente das specs normais (ver delete-canvas-content
      // e o checkbox "Specs de Acessibilidade" no modal de limpeza do canvas).
      specGroup.setPluginData('handexCategory', opts.a11yType ? 'a11y' : 'spec');

      // Organização de canvas — specs de Acessibilidade vão para dentro da
      // Section dedicada (não afeta specs normais nem a posição visual).
      // Pula o reordenamento por tag nesse caso: o z-order calculado seria
      // descartado de qualquer forma assim que o grupo reparenta pra dentro
      // da Section (a ordem passa a ser só a de criação dentro dela).
      if (opts.a11yType) {
        _reparentIntoA11ySection(specGroup);
      } else {
        _reorderSpecGroupByTag(specGroup, opts.letter);
      }

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
          // Cenário de exceção opcional preenchido já na criação (etapa
          // "Cenário de Exceção" do wizard) -- mesmo shape usado por
          // openGlobalSpecException/deleteGlobalSpecException para specs
          // que ganham o primeiro cenário só depois de criadas.
          excecoes: opts.excecaoInicial ? [opts.excecaoInicial] : [],
          guideSide: opts.guideSide || 'right',
          cardX: _absCardX,
          cardY: _absCardY,
          cardW: _absCardW,
          cardH: _absCardH,
          // --- Acessibilidade --- diferencia "Leitor de Tela" / "Ordem de Tabulação"
          // (aba Acessibilidade em Anotar Specs, modules/accessibility.js). Passthrough
          // simples: nenhum schema paralelo, reaproveita a mesma spec/properties[].
          a11yType: opts.a11yType || null,
          // Ecoa de volta a chave crua da subvariante e a Área Marcada de origem —
          // messages.js monta o objeto salvo localmente a partir desta resposta
          // (spec-created), não a partir de opts, então tudo que a listagem/geração
          // de ficha precisa depois precisa vir aqui também.
          a11ySubtype: opts.a11ySubtype || null,
          a11yAreaId: opts.a11yAreaId || null,
          // Modo de marcação escolhido (Contorno/Agrupamento vs Linha/Conector)
          // — precisa sobreviver no objeto salvo pra editA11ySpec reabrir o
          // formulário com o radio certo já marcado (ver _prefillA11ySpecForEdit).
          drawMode: opts.drawMode || 'contorno',
          // BETA-ONLY: a11y-injecao-em-massa — specs criadas pelo lote com
          // confiança "baixa" ganham este flag pra virar um badge "Verificar"
          // na listagem (_a11ySpecItemHtml, accessibility.js). Fluxo manual
          // nunca envia opts.needsReview, então cai em false por padrão.
          needsReview: !!opts.needsReview,
        }
      });

      // Se o Spec Notes caiu no fallback ESPERADO (variação sem componente
      // real catalogado), avisa que o card foi desenhado — não é erro, mas o
      // designer deve saber que essa combinação ainda não tem cobertura real.
      if (opts.a11yType && _isExpectedFallback) {
        figma.notify(`Especificação criada com card desenhado (sem componente real catalogado para esta variação: ${_a11yImportFailReason}). Arraste para posicionar.`);
      } else {
        figma.notify("Especificação criada — arraste para posicionar. Clique em Concluir quando pronto.");
      }
    })();
  }

  if (msg.type === "lock-spec") {
    const specNode = await figma.getNodeByIdAsync(msg.specId);
    if (specNode && specNode.name && /^\[Spec(A11y)? \| /.test(specNode.name)) {
      specNode.locked = true;
      figma.ui.postMessage({ type: "spec-locked", specId: msg.specId });
    }
  }

  if (msg.type === "highlight-node") {
    // Remove qualquer highlight anterior se existir
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }

    const node = await figma.getNodeByIdAsync(msg.id);
    if (node && node.visible && _nodeOnCurrentPage(node)) {
      if (msg.selectNode !== false) {
        figma.currentPage.selection = [node];
      }
      if (msg.shouldScroll !== false) {
        figma.viewport.scrollAndZoomIntoView([node]);
      }

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
    }
  }

  if (msg.type === "clear-highlight") {
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
  }

  if (msg.type === "hide-node") {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      if (msg.forceState !== undefined) {
        node.visible = msg.forceState;
      } else {
        node.visible = false;
      }
    }
  }

  if (msg.type === "show-node") {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) node.visible = true;
  }

  if (msg.type === "get-selection-name") {
    const sel = figma.currentPage.selection;
    const node = sel.length > 0 ? sel[0] : null;
    figma.ui.postMessage({
      type: "selection-name",
      name: node ? node.name : null,
      mainText: node ? _findMainTextContent(node) : null, // BETA-ONLY: label-automatico
    });
  }

  // ══ BETA-ONLY: label-automatico (início) ══
  // Depende de: _findMainTextContent (função dedicada mais acima nesta
  // fonte). Ver MIGRATION-BETA-TO-MAIN.md.
  // Sugestão de Label (accessibilityLabel) a partir do conteúdo real do
  // elemento — usado tanto pelo fluxo manual (get-selection-name acima)
  // quanto pelo "Usar sugestão" da Detecção Automática (que já tem o nodeId
  // resolvido, sem depender da seleção atual do canvas). Nome da camada
  // raramente reflete o texto visível (ex: "Frame 128"), então extrai o
  // primeiro TEXT node VISÍVEL na ordem de camadas — decisão consciente do
  // usuário: mais simples que escolher por maior fontSize, e funciona bem
  // quando o título é o primeiro filho (padrão comum nos componentes DSC).
  if (msg.type === "get-node-main-text") {
    const node = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : null;
    figma.ui.postMessage({
      type: "node-main-text",
      nodeId: msg.nodeId || null,
      mainText: node ? _findMainTextContent(node) : null,
    });
  }
  // ══ BETA-ONLY: label-automatico (fim) ══

  // --- Acessibilidade --- usado tanto para confirmar uma spec de A11y
  // (mapeamento puro: só precisamos saber QUAL nó foi selecionado) quanto
  // pela ferramenta "Marcar Área" — ver accessibility.js, _getA11ySelectionInfo.
  if (msg.type === "get-a11y-selection-info") {
    const sel = figma.currentPage.selection;
    figma.ui.postMessage({
      type: "a11y-selection-info",
      id: sel.length > 0 ? sel[0].id : null,
      name: sel.length > 0 ? sel[0].name : null,
    });
  }

  // ══ BETA-ONLY: a11y-marcar-area (início) ══
  // Handler pré-existente (Marcar Área), expandido nesta sessão para
  // aceitar msg.conector e escolher entre as 5 variantes do component set em
  // vez de usar sempre "superior" fixo. Depende de: #a11y-area-conector /
  // #a11y-area-number-input (modals.html), confirmA11yArea (accessibility.js).
  // Ver MIGRATION-BETA-TO-MAIN.md.
  // --- Acessibilidade --- "Marcar Área": cria um selo numerado usando o
  // componente REAL "[a11y] Conectores" (mesma family do modo Linha das
  // specs — ver A11Y_CONECTOR_LINHA_KEYS), na variante escolhida pelo
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
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const _conector = A11Y_AREA_CONECTOR_KEYS[msg.conector] ? msg.conector : 'superior';
      const _conectorKey = A11Y_AREA_CONECTOR_KEYS[_conector];
      let badge = null;
      let usedRealComponent = true;
      try {
        const comp = await figma.importComponentByKeyAsync(_conectorKey);
        badge = comp.createInstance();
        // Propriedades reais do component set (number/label/show label) —
        // compartilhadas entre as 5 variantes de conector, confirmadas na
        // variante "superior" via componentPropertyDefinitions.
        badge.setProperties({
          'number#1478:0': String(msg.number),
          'label#733:6': msg.label,
          'show label#733:0': true,
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
      // Posição do selo relativa ao elemento conforme o conector escolhido —
      // cada variante do componente já nasce com a linha apontando pro lado
      // certo, só precisamos encostar a borda oposta do selo no elemento.
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

      // Só precisa de um text node procedural + grupo quando o componente
      // real falha (modo simplificado, sem rótulo embutido).
      let group = badge;
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
        group = figma.group([badge, labelText], figma.currentPage);
      }
      group.name = `[A11yArea | ${msg.number}] ${msg.label}`;
      group.locked = false;
      group.setPluginData('handexCategory', 'a11y');

      // Organização de canvas — selo de área também vai para a Section
      // dedicada de Acessibilidade, junto com as specs.
      _reparentIntoA11ySection(group);

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
          // BETA-ONLY: a11y-marcar-area-unificado — ecoa a escolha
          // Automático/Manual feita no modal, decidida no frontend
          // (confirmA11yArea). Sem lógica nova aqui, só repasse.
          autoDetect: !!msg.autoDetect,
        }
      });

      figma.notify(usedRealComponent
        ? "Área marcada."
        : 'Área marcada — não foi possível usar o selo real da lib "Design Acessível" (modo simplificado).');
    })();
  }
  // ══ BETA-ONLY: a11y-marcar-area (fim) ══

  // ══ BETA-ONLY: a11y-ordem-tabulacao (início — handlers do backend) ══
  // Depende de: window._tabOrderModeOn/toggleTabOrderMode/
  // handleTabOrderSelectionChanged/addTabOrderItem/addTabOrderItemsFromLayers/
  // updateTabOrderNumbering/deleteTabOrderItem (accessibility.js); tabOrderItems
  // (core.js). Ver MIGRATION-BETA-TO-MAIN.md.
  // BETA-ONLY: a11y-ordem-tabulacao-por-area — a partir desta revisão a
  // ferramenta é ESCOPADA por Área Marcada (a11yAreaId em cada item,
  // numeração reinicia por área, UI vive dentro do accordion da área em
  // accessibility.js/_a11yAreaAccordionEl — não mais em specifications.html).
  // Estes handlers de backend continuam agnósticos à área pra desenho no
  // canvas (badge é o mesmo); a11yAreaId é só ecoado no item pro front
  // agrupar/numerar. Ver MIGRATION-BETA-TO-MAIN.md.
  // --- Acessibilidade --- "Ordem de Tabulação": liga/desliga o modo de
  // clique sequencial (ver figma.on('selectionchange') acima). Componente
  // real é "[a11y] Item Number" (component set node 13:479).
  //
  // BUG CORRIGIDO: a constante antiga usava a key do COMPONENT_SET pai
  // ('754e81b72212316d62a33eeaf8d6c273cc0137ed', node 13:479), mas
  // figma.importComponentByKeyAsync só funciona com a key de um COMPONENT
  // filho (uma variante), nunca a do set — por isso o import sempre
  // falhava silenciosamente e caía no fallback (círculo procedural).
  // Confirmado via REST API (2026-08-20): os 5 filhos reais de "[a11y] Item
  // Number" (node_ids 13:480/13:484/13:492/13:500/13:508, nome
  // "conector=X") são, por reaproveitamento de asset da própria lib, as
  // MESMAS 5 keys já usadas em A11Y_AREA_CONECTOR_KEYS ("Marcar Área") —
  // apesar do nome dessa constante sugerir "[a11y] Conectores" (outro
  // component set, node 1:50, com nomes "tipo=X, conector=Y" e node_ids
  // completamente diferentes), o que ela sempre importou de verdade é
  // este mesmo "[a11y] Item Number". Reaproveita as keys já validadas em
  // produção por "Marcar Área" em vez de duplicar/inventar uma segunda
  // extração.
  const A11Y_ITEM_NUMBER_KEYS = {
    superior:   'ff43b15ac0c078b35219984bf035c4c0f0089cf1',
    inferior:   'b355a26c5a89aea074effe28ca6767b08e4a7f99',
    esquerda:   'f9cd4394c0bfc48ae86d3028e836877887d23fcd',
    direita:    '08ac04391034777646eec9395c6d221189ee6d46',
    desativado: '71719f112ec0135b16df0deb6584fbc44af3aff2',
  };

  if (msg.type === "start-tab-order-mode") {
    _tabOrderModeActive = true;
  }

  if (msg.type === "stop-tab-order-mode") {
    _tabOrderModeActive = false;
  }

  // Extraída de create-tab-order-item pra ser reaproveitada também por
  // generate-tab-order-from-layers (geração automática por varredura de
  // camadas) — as duas vias criam exatamente o mesmo selo "[a11y] Item
  // Number" real (ou o fallback círculo+texto), só muda quem decide o
  // targetNodeId/number de entrada. Não faz appendChild na seleção nem
  // scroll de viewport (quem chama decide isso, já que o lote automático
  // não deve reposicionar a viewport a cada item).
  // BETA-ONLY: a11y-ordem-tabulacao-por-area — parâmetro areaId novo, só
  // ecoado no item retornado (não influencia o desenho no canvas). É o que
  // permite ao frontend escopar a numeração por Área Marcada em vez de uma
  // sequência única por frame. Ver MIGRATION-BETA-TO-MAIN.md.
  async function _createTabOrderBadge(node, number, label, conector, areaId) {
    const _conectorOptions = ['desativado', 'inferior', 'superior', 'esquerda', 'direita'];
    // "Direita" é o padrão: mantém o selo visível ao lado do elemento sem
    // sobrepor o conteúdo, mesma convenção adotada em create-a11y-area.
    const _conector = _conectorOptions.includes(conector) ? conector : 'direita';
    const hasLabel = !!label;

    let badge = null;
    let usedRealComponent = true;
    try {
      const comp = await figma.importComponentByKeyAsync(A11Y_ITEM_NUMBER_KEYS[_conector]);
      badge = comp.createInstance();
      badge.setProperties({
        'number#1478:0': String(number),
        'show label#733:0': hasLabel,
        'label#733:6': label || 'Label',
      });
    } catch (e) {
      usedRealComponent = false;
      badge = figma.createEllipse();
      badge.name = 'Selo de Ordem de Tabulação';
      badge.resize(28, 28);
      badge.fills = [{ type: "SOLID", color: hexToRgb('#0070AF') }];
    }

    const bb = node.absoluteBoundingBox;
    figma.currentPage.appendChild(badge);
    const _TAB_ORDER_GAP = 24;
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
      labelText.fontName = { family: "Inter", style: "Bold" };
      labelText.fontSize = 12;
      labelText.fills = [{ type: "SOLID", color: hexToRgb('#FFFFFF') }];
      labelText.characters = String(number);
      figma.currentPage.appendChild(labelText);
      labelText.x = Math.round(badge.x + badge.width / 2 - labelText.width / 2);
      labelText.y = Math.round(badge.y + badge.height / 2 - labelText.height / 2);
      group = figma.group([badge, labelText], figma.currentPage);
    }
    group.name = `[TabOrder | ${number}] ${node.name}`;
    group.locked = false;
    group.setPluginData('handexCategory', 'a11y');

    _reparentIntoA11ySection(group);

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
        a11yAreaId: areaId || null, // BETA-ONLY: a11y-ordem-tabulacao-por-area
      },
    };
  }

  if (msg.type === "create-tab-order-item") {
    (async () => {
      const node = await figma.getNodeByIdAsync(msg.targetNodeId);
      if (!node || !node.absoluteBoundingBox) {
        figma.notify("Elemento não encontrado no canvas — selecione novamente.");
        return;
      }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      // BETA-ONLY: a11y-ordem-tabulacao-por-area — msg.areaId agora é
      // obrigatório no fluxo normal (front bloqueia início do modo sem área
      // ativa), mas o handler continua tolerante a undefined por segurança.
      const { group, usedRealComponent, item } = await _createTabOrderBadge(node, msg.number, msg.label, msg.conector, msg.areaId);

      figma.currentPage.selection = [group];
      figma.viewport.scrollAndZoomIntoView([group]);

      figma.ui.postMessage({ type: "tab-order-item-created", item });

      figma.notify(usedRealComponent
        ? "Elemento marcado na ordem de tabulação."
        : 'Elemento marcado — não foi possível usar o selo real da lib "Design Acessível" (modo simplificado).');
    })();
  }

  // --- Acessibilidade --- "Ordem de Tabulação" — geração automática varrendo
  // a árvore de camadas de uma Área Marcada já existente, em profundidade
  // (ordem real de node.children, a mesma do painel Layers do Figma — não
  // posição visual X/Y). Complementar ao modo de clique manual acima, não um
  // substituto: o designer pode reordenar depois via drag-and-drop na lista
  // e clicar "Atualizar" (renumber-tab-order-items) pra ajustar os selos.
  //
  // BETA-ONLY: a11y-mapeamento-interativo — critério de elegibilidade deixou
  // de ser puramente estrutural (qualquer INSTANCE/COMPONENT). A lib "Design
  // Acessível" documenta que a Ordem de Tabulação deve percorrer "links,
  // botões e campos de formulário" — agora só entram componentes que
  // resolvem, via catálogo DSC (_resolveDscComponentA11yMatch), para um
  // shortName de A11Y_INTERACTIVE_SHORTNAMES (controles reais de foco de
  // teclado). Ícone decorativo, card de layout, imagem, badge etc. são
  // ignorados por inteiro. Não desce dentro de um INSTANCE/COMPONENT já
  // avaliado como unidade (interativo ou não) — mesma regra de sempre, pra
  // não numerar sub-elementos internos (ex: ícone dentro de um Button já
  // contado como unidade inteira) nem descer dentro de algo descartado. O
  // node raiz da própria área nunca entra, só os descendentes.
  if (msg.type === "generate-tab-order-from-layers") {
    (async () => {
      const root = await figma.getNodeByIdAsync(msg.targetNodeId);
      if (!root) {
        figma.notify("Área não encontrada no canvas — marque novamente.");
        figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items: [] });
        return;
      }

      const collected = [];
      async function _walk(n) {
        const children = n.children || [];
        for (const child of children) {
          if (child.visible === false) continue;
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
            const match = componentKey ? _resolveDscComponentA11yMatch(componentKey) : null;
            if (match && A11Y_INTERACTIVE_SHORTNAMES.has(match.a11yCategory)) {
              collected.push(child);
            }
            continue; // não desce dentro de um elemento já avaliado como unidade (interativo ou não)
          }
          await _walk(child);
        }
      }
      await _walk(root);

      if (collected.length === 0) {
        figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items: [] });
        return;
      }

      // BETA-ONLY: a11y-fixes-pos-teste — ordem de tabulação por posição
      // espacial. `collected` nasce na ordem de camadas/z-order do Figma
      // (ordem de `n.children`), nunca na ordem de leitura visual real. Reordena
      // por fluxo de leitura ocidental (esquerda→direita na mesma "linha",
      // depois cima→baixo entre linhas) ANTES de numerar — equivalente ao
      // comparador já usado no FRONTEND para a listagem de specs
      // (_a11ySortSpecsSpatially/A11Y_SPATIAL_ROW_THRESHOLD em accessibility.js,
      // sub-feature a11y-ordenacao-espacial). Mesma tolerância de 24px pra
      // "mesma linha", pra manter os dois comportamentos consistentes.
      const TAB_ORDER_SPATIAL_ROW_THRESHOLD = 24;
      collected.sort((a, b) => {
        const boundsA = a.absoluteBoundingBox;
        const boundsB = b.absoluteBoundingBox;
        if (!boundsA || !boundsB) return 0;
        if (Math.abs(boundsA.y - boundsB.y) > TAB_ORDER_SPATIAL_ROW_THRESHOLD) {
          return boundsA.y - boundsB.y;
        }
        return boundsA.x - boundsB.x;
      });

      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const items = [];
      const createdGroups = [];
      let baseNumber = typeof msg.startNumber === 'number' ? msg.startNumber : 1;
      for (let i = 0; i < collected.length; i++) {
        const node = collected[i];
        if (!node.absoluteBoundingBox) continue;
        // BETA-ONLY: a11y-ordem-tabulacao-por-area — areaId ecoado no item.
        const { group, item } = await _createTabOrderBadge(node, baseNumber + i, '', 'direita', msg.areaId);
        createdGroups.push(group);
        items.push(item);
      }

      if (createdGroups.length > 0) {
        figma.currentPage.selection = createdGroups;
        figma.viewport.scrollAndZoomIntoView(createdGroups);
      }

      figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items });
      figma.notify(`${items.length} elemento${items.length === 1 ? '' : 's'} numerado${items.length === 1 ? '' : 's'} automaticamente.`);
    })();
  }

  // --- Acessibilidade --- renumeração dos selos já desenhados no canvas
  // quando um item do meio da sequência é excluído (ver deleteTabOrderItem em
  // accessibility.js) — o front já recalculou os números finais, aqui só
  // aplicamos setProperties na instância real de cada grupo afetado.
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
          instance.setProperties({ 'number#1478:0': String(entry.number) });
          node.name = `[TabOrder | ${entry.number}] ${node.name.replace(/^\[TabOrder \| \d+\]\s*/, '')}`;
          updated.push(entry.id);
        } catch (e) { }
      }
      figma.ui.postMessage({ type: "tab-order-renumbered", updated });
    })();
  }
  // ══ BETA-ONLY: a11y-ordem-tabulacao (fim — handlers do backend) ══

  // --- Acessibilidade --- "Gerar Ficha de Acessibilidade" no canvas foi
  // removida de novo (2026-07-24) — com as specs já organizadas dentro da
  // Section "Especificações de Acessibilidade" (_getOrCreateA11ySection) e o
  // resumo consolidado disponível na aba "♿ Acessibilidade" do export HTML
  // (handoff.js), um terceiro documento redundante no canvas não bate com o
  // modelo da vertical de acessibilidade (specs vivem junto do design real,
  // não num documento à parte).

  // Checa se a lib "Design Acessível" está acessível pro reaproveitamento dos
  // componentes reais nas specs de A11y (fase 1 — ver accessibility.js
  // openA11yCategoryPickerModal). Usa um componente canário real ("elementos
  // interativos e imagens", componente completo da seção "Specs - Estrutura")
  // como teste: se o import funcionar, a lib está acessível pra esse
  // designer/arquivo; se falhar (lib não habilitada ou sem acesso), orienta
  // a vinculação em vez de deixar o import de fato falhar na hora de criar a spec.
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

  // Edita o estilo da linha (reta/curva/esquinas) de uma spec já criada --
  // mesmo precedente de hide-spec-lines (localizar Conector/DotInicio/DotFim
  // por nome dentro do group), só que removendo e recriando esses 3 nós em
  // vez de alternar .visible. Diferente de fluxos (edit-flow-connection), NÃO
  // apaga o group inteiro -- specCard permanece intacto, só a linha é
  // substituída. Recalcula a partir da posição ATUAL do card (não das
  // coordenadas salvas na criação) -- resolve de brinde a limitação de
  // "linha desalinha se o card for arrastado", pelo menos no momento da edição.
  if (msg.type === "edit-spec-connector") {
    try {
      const specGroup = await figma.getNodeByIdAsync(msg.specId);
      const node = msg.targetNodeId ? await figma.getNodeByIdAsync(msg.targetNodeId) : null;
      if (!specGroup || !('findChildren' in specGroup) || !node) {
        figma.ui.postMessage({ type: 'spec-connector-edit-failed', specId: msg.specId });
        return;
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
        figma.ui.postMessage({ type: 'spec-connector-edit-failed', specId: msg.specId });
        return;
      }

      const wasVisible = specGroup.findChildren(n => n.name === 'Conector' || n.name === 'DotInicio' || n.name === 'DotFim')
        .every(n => n.visible !== false);

      const side = msg.guideSide || 'right';
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

      // vectorPaths e x/y de filhos são relativos à origem do specGroup
      // (GROUP), não absolutos de página. Usa absoluteBoundingBox (não
      // specGroup.x/.y) por segurança -- x/y de um GROUP são sempre
      // derivados do bounding box dos filhos, então ler via
      // absoluteBoundingBox é a forma robusta de saber a origem real,
      // inclusive se o specGroup for movido para dentro de uma Section.
      const _groupBounds = specGroup.absoluteBoundingBox || specGroup.absoluteRenderBounds;
      const _gx = _groupBounds.x, _gy = _groupBounds.y;
      const localStart = { x: startPt.x - _gx, y: startPt.y - _gy };
      const localEnd = { x: endPt.x - _gx, y: endPt.y - _gy };

      let connectorPath = `M ${localStart.x} ${localStart.y} L ${localEnd.x} ${localEnd.y}`;
      if (_specConnectorStyle === 'elbow') {
        const isHorizontal = side === 'right' || side === 'left';
        const corner = isHorizontal ? { x: localEnd.x, y: localStart.y } : { x: localStart.x, y: localEnd.y };
        connectorPath = `M ${localStart.x} ${localStart.y} L ${corner.x} ${corner.y} L ${localEnd.x} ${localEnd.y}`;
      } else if (_specCurvature) {
        const dx = localEnd.x - localStart.x, dy = localEnd.y - localStart.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / dist, py = dx / dist;
        const offset = (_specCurvature / 100) * dist * 0.5;
        const midX = (localStart.x + localEnd.x) / 2, midY = (localStart.y + localEnd.y) / 2;
        const ctrlX = midX + px * offset, ctrlY = midY + py * offset;
        connectorPath = `M ${localStart.x} ${localStart.y} Q ${ctrlX} ${ctrlY} ${localEnd.x} ${localEnd.y}`;
      }

      const themeColor = hexToRgb(msg.color || '#005ca9');

      const oldLineNodes = specGroup.findChildren(n => n.name === 'Conector' || n.name === 'DotInicio' || n.name === 'DotFim');
      oldLineNodes.forEach(n => n.remove());

      const connector = figma.createVector();
      connector.name = 'Conector';
      connector.x = 0;
      connector.y = 0;
      connector.vectorPaths = [{ windingRule: "NONZERO", data: connectorPath }];
      connector.strokes = [{ type: "SOLID", color: themeColor }];
      connector.strokeWeight = 1.5;
      connector.dashPattern = [4, 4];
      connector.strokeCap = "ROUND";
      connector.visible = wasVisible;
      connector.locked = false;
      specGroup.appendChild(connector);

      const _DOT_R = 4;
      const startDot = figma.createEllipse();
      startDot.name = 'DotInicio';
      startDot.resize(_DOT_R * 2, _DOT_R * 2);
      startDot.fills = [{ type: "SOLID", color: themeColor }];
      startDot.strokes = [];
      startDot.visible = wasVisible;
      startDot.locked = true;
      specGroup.appendChild(startDot);
      startDot.x = localStart.x - _DOT_R;
      startDot.y = localStart.y - _DOT_R;

      const endDot = figma.createEllipse();
      endDot.name = 'DotFim';
      endDot.resize(_DOT_R * 2, _DOT_R * 2);
      endDot.fills = [{ type: "SOLID", color: themeColor }];
      endDot.strokes = [];
      endDot.visible = wasVisible;
      endDot.locked = true;
      specGroup.appendChild(endDot);
      endDot.x = localEnd.x - _DOT_R;
      endDot.y = localEnd.y - _DOT_R;

      figma.ui.postMessage({
        type: 'spec-connector-edited',
        specId: msg.specId,
        connectorStyle: _specConnectorStyle,
        connectorCurvature: _specCurvature
      });
    } catch (e) {
      figma.ui.postMessage({ type: 'spec-connector-edit-failed', specId: msg.specId, message: e.message });
    }
  }

  if (msg.type === "unlock-spec-group") {
    const targetLocked = msg.locked !== undefined ? msg.locked : false;
    for (const specId of (msg.specIds || [])) {
      const specGroup = await figma.getNodeByIdAsync(specId);
      if (!specGroup) continue;
      specGroup.locked = targetLocked;
    }
  }

  if (msg.type === 'rename-node') {
    const node = await figma.getNodeByIdAsync(msg.id);
    if (node) {
      node.name = msg.name;
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
    figma.clientStorage.setAsync('handoffData', msg.data).catch(err => {
      console.warn("Storage save failed (possibly missing plugin ID in manifest):", err);
    });
    await _writeSharedPluginData(msg.data);
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

  // BETA-ONLY: flows-mini-mapa-conector-criacao
  if (msg.type === "get-flow-selection-bounds") {
    figma.ui.postMessage({ type: 'flow-selection-bounds', nodes: _getFlowSelectionBoundsPayload() });
  }

  if (msg.type === "create-flow-connection") {
    const selection = figma.currentPage.selection;
    const isEvent = msg.flowType === "event_start" || msg.flowType === "event_end";

    if (!isEvent && selection.length !== 2) {
      figma.notify("Selecione exatamente dois elementos para conectar.");
      return;
    }
    if (isEvent && selection.length === 0) {
      figma.notify("Selecione pelo menos um elemento.");
      return;
    }

    const nodeA = selection[0];
    const nodeB = selection[1] || null;
    // BETA-ONLY: flows-mini-mapa-conector-criacao — _buildFlowConnection
    // agora retorna { group, flow } em vez de postar/notificar direto (ver
    // comentário no fim de _buildFlowConnection).
    const result = await _buildFlowConnection(nodeA, nodeB, msg);
    if (result) figma.ui.postMessage({ type: 'flow-created', flow: result.flow });
    figma.notify("Fluxo criado!");
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

    const result = await _buildFlowConnection(nodeA, nodeB, msg); // BETA-ONLY: flows-mini-mapa-conector-criacao — retorno em vez de post/notify direto
    if (result) figma.ui.postMessage({ type: 'flow-created', flow: result.flow });
    figma.notify("Fluxo criado!");
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

    const result = await _buildFlowConnection(nodeA, nodeB, msg); // BETA-ONLY: flows-mini-mapa-conector-criacao — retorno em vez de post/notify direto
    if (result) figma.ui.postMessage({ type: 'flow-created', flow: result.flow });
    figma.notify("Fluxo criado!");
  }

  // ══ BETA-ONLY: flows-mini-mapa-conector-criacao (início — resync-all-flows) ══
  // Depende de: resyncAllFlows/#btn-resync-flows (specifications.js/
  // flows.html), _buildFlowConnection retornando { group, flow }. Ver
  // MIGRATION-BETA-TO-MAIN.md.
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
        const result = await _buildFlowConnection(nodeA, nodeB, { ...flow, flowType: flow.type, flowName: flow.name, flowId: flow.flowUid });
        if (!result) { failed.push({ flowUid: flow.flowUid, name: flow.name, reason: 'erro-ao-recriar' }); continue; }
        updated.push({ flowUid: flow.flowUid, oldId: flow.id, newId: result.flow.id });
      } catch (e) {
        failed.push({ flowUid: flow.flowUid, name: flow.name, reason: 'erro-ao-recriar' });
      }
    }
    figma.ui.postMessage({ type: 'flows-resynced', updated, failed });
    figma.notify(`${updated.length} fluxo(s) atualizado(s)${failed.length ? `, ${failed.length} não recriado(s)` : ''}.`);
  }
  // ══ BETA-ONLY: flows-mini-mapa-conector-criacao (fim — resync-all-flows) ══

  // ══ BETA-ONLY: a11y-ordenacao-espacial (início) ══
  // Consulta pura de posição no canvas — usada pela listagem agrupada de
  // a11y (renderA11yGroupedList, accessibility.js) pra ordenar specs por
  // posição de leitura real (x/y) em vez da tag alfabética de criação. Sem
  // efeito colateral (não seleciona, não notifica); resolve tudo em paralelo.
  if (msg.type === "resolve-nodes-bounds") {
    const ids = Array.isArray(msg.ids) ? msg.ids : [];
    const bounds = {};
    await Promise.all(ids.map(async (id) => {
      try {
        const node = await figma.getNodeByIdAsync(id);
        bounds[id] = (node && node.absoluteBoundingBox)
          ? { x: node.absoluteBoundingBox.x, y: node.absoluteBoundingBox.y }
          : null;
      } catch (e) {
        bounds[id] = null;
      }
    }));
    figma.ui.postMessage({ type: "nodes-bounds-resolved", bounds });
  }
  // ══ BETA-ONLY: a11y-ordenacao-espacial (fim) ══

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
        figma.ui.postMessage({ type: 'ficha-version-pulled', versao: null });
        return;
      }
      // Nome inclui timestamp "YYYY-MM-DD HH:MM" no final -- ordenação de string já resolve "mais recente"
      fichas.sort((a, b) => a.name.localeCompare(b.name));
      const latest = fichas[fichas.length - 1];
      const campoVersao = latest.findOne(n => n.type === 'FRAME' && n.name === '[Campo] Versão');
      const versaoText = campoVersao ? campoVersao.findAll(n => n.type === 'TEXT')[1] : null;
      const versao = versaoText ? versaoText.characters.trim() : null;
      figma.ui.postMessage({ type: 'ficha-version-pulled', versao: (versao && versao !== '-') ? versao : null });
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

      const CAIXA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631"><g transform="translate(-284.78446,-475.51214)"><g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)"><g transform="scale(0.24,0.24)"><path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/></g></g></g></svg>`;

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
        blue:      { r: 0,     g: 0.439, b: 0.686 },
        blueDark:  { r: 0,     g: 0.247, b: 0.478 },
        blueLight: { r: 0.910, g: 0.957, b: 0.980 },
        orange:    { r: 0.965, g: 0.510, b: 0.165 },
        teal:      { r: 0.298, g: 0.745, b: 0.714 },
        tealLight: { r: 0.851, g: 0.961, b: 0.957 },
        lime:      { r: 0.831, g: 0.969, b: 0.188 },
        yellow:    { r: 1,     g: 0.949, b: 0.749 },
        white:     { r: 1,     g: 1,     b: 1     },
        bg:        { r: 0.941, g: 0.953, b: 0.969 },
        bgBlue:    { r: 0.910, g: 0.957, b: 0.980 },
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


