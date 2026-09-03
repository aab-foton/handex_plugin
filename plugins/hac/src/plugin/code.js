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

// Cópia "rascunho" do frame da Área Marcada, criada já ao clicar "Iniciar
// Ordem de Tabulação" (start-tab-order-copy), antes de qualquer selo ser
// desenhado. Mantida em memória do módulo (não só via pluginData no canvas)
// porque o highlight temporário de cada clique do fluxo manual precisa
// resolver o nó ORIGINAL clicado para o nó EQUIVALENTE dentro da cópia sem
// reconstruir o mapa a cada clique. Mapa nodeId-original → node real do
// Figma, nunca serializado como tal para o frontend (que só recebe ids
// planos). Zerado ao aplicar no canvas (apply-tab-order-to-canvas) ou ao
// cancelar o fluxo (delete-tab-order-draft-copy).
let _activeTabOrderCloneMap = null;
let _activeTabOrderCloneAreaId = null;

// Contador de geração da prévia visual da Ordem de Tabulação
// (preview-tab-order-numbers) — reordenações rápidas em sequência disparam
// múltiplas chamadas fire-and-forget sem fila; sem isso, a resposta mais
// ANTIGA pode terminar de desenhar DEPOIS da mais NOVA (cada await dentro do
// loop cede o event loop), deixando numeração obsoleta até a próxima
// mudança. Cada chamada incrementa e captura seu próprio número; antes de
// cada selo desenhado, confirma que ainda é a geração mais recente — se uma
// chamada mais nova já começou, aborta o loop da antiga imediatamente.
let _tabOrderPreviewGeneration = 0;

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
  if (_activeTabOrderCloneAreaId === areaId) {
    _activeTabOrderCloneMap = null;
    _activeTabOrderCloneAreaId = null;
  }
}

figma.on('close', () => {
  if (activeHighlightNode) {
    try { activeHighlightNode.remove(); } catch (e) { }
    activeHighlightNode = null;
  }
  // Gap pré-existente: se o designer fechar o plugin/Figma com uma cópia
  // rascunho de Ordem de Tabulação ainda ativa (nunca aplicou nem
  // cancelou), ela ficava órfã e permanente no .fig, sem handler de
  // limpeza algum. Reaproveita a mesma remoção de sempre.
  if (_activeTabOrderCloneAreaId) {
    _deleteTabOrderDraftCopy(_activeTabOrderCloneAreaId);
  }
});

figma.on('currentpagechange', () => {
  if (activeHighlightNode) {
    try { activeHighlightNode.remove(); } catch (e) { }
    activeHighlightNode = null;
  }
});

// "Ordem de Tabulação": modo de clique sequencial — liga/desliga via
// start-tab-order-mode/stop-tab-order-mode (vindos do frontend); quando
// ativo e há exatamente 1 elemento selecionado, posta
// tab-order-selection-changed. Seleção vazia ou múltipla é ignorada nesse modo.
let _tabOrderModeActive = false;

// O designer clica fisicamente na CÓPIA rascunho (é o que está focado na
// tela desde start-tab-order-copy — a instrução de UI já diz "clique nos
// elementos dela"), então figma.currentPage.selection sempre traz um node
// que vive DENTRO do clone, nunca o original. Todo o resto do fluxo (o
// nodeMap guardado pra "Aplicar no Canvas", que é Map<originalId,
// cloneNode>) espera receber o id do ORIGINAL — sem esta tradução aqui,
// nodeMap.get(idDoClone) nunca acha nada e TODOS os itens da lista viravam
// "não encontrado" ao aplicar (bug real confirmado em arquivo de produção,
// 23 de 23 itens, 2026-09-02). Busca linear no Map ativo (chave=original,
// valor=node do clone) porque é o único sentido em que ele existe hoje —
// aceitável para o volume real de nodes de uma Área Marcada.
function _resolveTabOrderCloneSelectionToOriginalId(cloneNodeId) {
  if (!_activeTabOrderCloneMap) return cloneNodeId;
  for (const [originalId, clonedNode] of _activeTabOrderCloneMap) {
    if (clonedNode.id === cloneNodeId) return originalId;
  }
  return cloneNodeId;
}

figma.on('selectionchange', () => {
  if (_tabOrderModeActive) {
    const sel = figma.currentPage.selection;
    if (sel.length === 1) {
      const originalId = _resolveTabOrderCloneSelectionToOriginalId(sel[0].id);
      figma.ui.postMessage({ type: 'tab-order-selection-changed', nodeId: originalId, nodeName: sel[0].name });
    }
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

function _getOrCreateNamedSection(sectionName) {
  let section = figma.currentPage.children.find(
    n => n.type === 'SECTION' && n.name === sectionName
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

function _getOrCreateA11ySection() {
  return _getOrCreateNamedSection(A11Y_SECTION_NAME);
}

function _getOrCreateTabOrderSection() {
  return _getOrCreateNamedSection(A11Y_TAB_ORDER_SECTION_NAME);
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
    // organização é só cosmética — a spec/área/cópia segue existindo normalmente
  }
}

function _reparentIntoA11ySection(node) {
  _reparentIntoSection(node, _getOrCreateA11ySection);
}

function _reparentIntoTabOrderSection(node) {
  _reparentIntoSection(node, _getOrCreateTabOrderSection);
}

// Candidatas a "cópia de Ordem de Tabulação" hoje vivem dentro da Section
// dedicada (_getOrCreateTabOrderSection), mas também podem ser filhas
// diretas de figma.currentPage — cópias criadas ANTES desta Section existir
// (arquivos de produção já em uso) nunca foram migradas automaticamente pra
// dentro dela. Varre os dois níveis sempre, sem duplicar (uma cópia nunca é
// simultaneamente filha da página e da Section).
function _forEachTabOrderCopyCandidate(fn) {
  for (const sibling of figma.currentPage.children) {
    if (sibling.type === 'SECTION') continue;
    fn(sibling);
  }
  const section = figma.currentPage.children.find(
    n => n.type === 'SECTION' && n.name === A11Y_TAB_ORDER_SECTION_NAME
  );
  if (section) {
    for (const child of (section.children || [])) fn(child);
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

function _removeExistingTabOrderCopiesForArea(areaId) {
  _forEachTabOrderCopyCandidate(sibling => {
    try {
      if (sibling.getPluginData && sibling.getPluginData('hacTabOrderCopyForArea') === areaId) {
        sibling.remove();
      }
    } catch (e) { }
  });
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

  async function _extract(n, depth) {
    if ((depth || 0) > 16) return;
    if (n.visible === false) return;

    try {
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

      const hasImageFill = Array.isArray(n.fills) &&
        n.fills.some(f => f && f.type === 'IMAGE' && f.visible !== false);

      let category = "frames";
      if (hasImageFill && !isIcon) {
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

      if (category !== 'frames') {
        let componentKey = null;
        let mainComp = null;
        if (n.type === "INSTANCE") {
          try { mainComp = await n.getMainComponentAsync(); } catch (e) { mainComp = null; }
          if (mainComp) componentKey = mainComp.key;
        } else if (n.type === "COMPONENT" || n.type === "COMPONENT_SET") {
          componentKey = n.key;
        }

        let dscComponentMatch = null;
        let needsA11yTokenReview = false;

        if (n.type === 'INSTANCE' && mainComp && mainComp.remote && componentKey) {
          dscComponentMatch = _resolveDscComponentA11yMatch(componentKey);
          _dscRemoteMatch = dscComponentMatch;
        }
        // [DIAGNÓSTICO TEMPORÁRIO 2026-09-02] Bug do Icon Button classificado
        // como decorativo persiste em arquivos de projetos diferentes. Log de
        // instrumentação para descobrir, com dado real, por que o match de
        // componente DSC não acontece. REMOVER depois de diagnosticar.
        if (n.type === 'INSTANCE' || category === 'icons') {
          console.log('[HAC-DIAG]', JSON.stringify({
            layerName: n.name,
            nodeType: n.type,
            category,
            size: Math.round(n.width) + 'x' + Math.round(n.height),
            hasMainComp: !!mainComp,
            mainCompName: mainComp ? mainComp.name : null,
            isRemote: mainComp ? !!mainComp.remote : null,
            componentKey: componentKey ? componentKey.slice(0, 12) + '…' : null,
            matchTried: !!(n.type === 'INSTANCE' && mainComp && mainComp.remote && componentKey),
            matchResult: dscComponentMatch ? (dscComponentMatch.a11yCategory || 'isUnmapped') : null,
          }));
        }
        if (!dscComponentMatch && (category === 'icons' || category === 'vectors')) {
          dscComponentMatch = _resolveDecorativeA11yMatch(n);
        } else if (!dscComponentMatch && category === 'images') {
          dscComponentMatch = _resolveImageA11yMatch(n);
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

      if (!_hasResolvedDscMatch && 'children' in n && n.children) {
        for (const child of n.children) {
          await _extract(child, (depth || 0) + 1);
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
      name: node ? node.name : null,
      mainText: node ? _findMainTextContent(node) : null,
      dscComponentName,
    });
    return;
  }

  if (msg.type === "get-node-main-text") {
    const node = msg.nodeId ? await figma.getNodeByIdAsync(msg.nodeId) : null;
    figma.ui.postMessage({
      type: "node-main-text",
      nodeId: msg.nodeId || null,
      mainText: node ? _findMainTextContent(node) : null,
    });
    return;
  }

  // Usado tanto para confirmar uma spec de A11y (mapeamento puro: só
  // precisamos saber QUAL nó foi selecionado) quanto pela ferramenta "Marcar
  // Área".

  if (msg.type === "get-a11y-selection-info") {
    const sel = figma.currentPage.selection;
    figma.ui.postMessage({
      type: "a11y-selection-info",
      id: sel.length > 0 ? sel[0].id : null,
      name: sel.length > 0 ? sel[0].name : null,
    });
    return;
  }

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
      group.setPluginData('hacCategory', 'a11y');
      // Guardamos o id do frame ORIGINAL (não-injetado pelo hac, então
      // invisível pro filtro hacCategory) pra que o cálculo de posição livre
      // da cópia de Ordem de Tabulação (_findFreeTabOrderCopyPosition)
      // consiga localizar e evitar sobrepor o frame de QUALQUER área, não só
      // da área sendo processada no momento.
      group.setPluginData('hacAreaTargetNodeId', node.id);

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
          autoDetect: !!msg.autoDetect,
        }
      });

      figma.notify(usedRealComponent
        ? "Área marcada."
        : 'Área marcada — não foi possível usar o selo real da lib "Design Acessível" (modo simplificado).');
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

        let _anchorNode = node;
        while (_anchorNode.parent && _anchorNode.parent.type !== 'PAGE') {
          _anchorNode = _anchorNode.parent;
        }
        const _anchorBounds = _anchorNode.absoluteBoundingBox || bounds;

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
        // forma independente. Specs vivem dentro da Section organizadora, por
        // isso escaneamos os filhos dela, não a página inteira.
        const _stackScanNodes = _getOrCreateA11ySection().children || [];
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

      _reparentIntoA11ySection(specGroup);

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
    })();
    return;
  }

  if (msg.type === "lock-spec") {
    const specNode = await figma.getNodeByIdAsync(msg.specId);
    if (specNode && specNode.name && /^\[SpecA11y \| /.test(specNode.name)) {
      specNode.locked = true;
      figma.ui.postMessage({ type: "spec-locked", specId: msg.specId });
    }
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

  if (msg.type === "hide-spec-lines") {
    const targetVisible = msg.forceState !== undefined ? msg.forceState : false;
    for (const specId of (msg.specIds || [])) {
      const specGroup = await figma.getNodeByIdAsync(specId);
      if (!specGroup || !('findChildren' in specGroup)) continue;
      const lineNodes = specGroup.findChildren(n => n.name === 'Conector' || n.name === 'DotInicio' || n.name === 'DotFim');
      lineNodes.forEach(n => { n.visible = targetVisible; });
    }
    return;
  }

  // Edita o estilo da linha (reta/curva/esquinas) de uma spec já criada —
  // localiza Conector/DotInicio/DotFim por nome dentro do group e os
  // recria; NÃO apaga o group inteiro, o specCard permanece intacto.
  // Recalcula a partir da posição ATUAL do card (não das coordenadas salvas
  // na criação).
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

      const themeColor = hexToRgb(msg.color || '#005ca9');

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
  // vive só no frontend); o frontend resolve a origem da área e manda
  // pronta em msg.a11yOrigin ao chamar apply-tab-order-to-canvas — ver
  // accessibility.js (applyTabOrderToCanvas) e A11Y_ITEM_NUMBER_KEYS_MOBILE
  // (topo do arquivo).

  if (msg.type === "start-tab-order-mode") {
    _tabOrderModeActive = true;
    return;
  }

  if (msg.type === "stop-tab-order-mode") {
    _tabOrderModeActive = false;
    return;
  }

  // Extraída para ser reaproveitada por generate-tab-order-from-layers
  // (geração automática) e apply-tab-order-to-canvas (fluxo manual/revisão)
  // — as duas vias criam exatamente o mesmo selo real (ou o fallback
  // círculo+texto). Não faz appendChild na seleção nem scroll de viewport
  // (quem chama decide isso). Só desenha selo de ITEM de tabulação — o selo
  // de Área (create-a11y-area) tem seu próprio código, não passa por aqui.
  async function _createTabOrderBadge(node, number, label, conector, areaId, reparentToSection, origin, tabOrderClone, isPreview) {
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
      // preview-tab-order-numbers/apply-tab-order-to-canvas), mas está dentro
      // de um try/catch mudo lá — se ele tiver falhado (fonte indisponível
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
    group.name = isPreview ? `[Prévia de Tabulação | ${number}] ${node.name}` : `[Selo de Tabulação | ${number}] ${node.name}`;
    group.locked = false;
    group.setPluginData('hacCategory', 'a11y');
    // Se o pai onde o grupo for reparentado (tabOrderClone ou um frame
    // intermediário dele) tiver auto-layout ativo — comum em componentes
    // reais do DSC —, o motor de auto-layout ignora x/y manual e empurra o
    // item pro final da pilha do eixo primário. Forçar posicionamento
    // absoluto antes do reparenting evita esse empilhamento indevido, tanto
    // pro selo real (instância) quanto pro fallback procedural (group).
    if ('layoutPositioning' in group) group.layoutPositioning = 'ABSOLUTE';
    // Selo TEMPORÁRIO da prévia visual (lista pendente ainda sendo montada
    // no modal, antes de "Aplicar no Canvas") — opacidade reduzida pra não
    // ser confundido com o selo real, e marcado com pluginData próprio
    // (hacTabOrderPreviewForArea) pra ser localizado e apagado por completo
    // em QUALQUER caminho de saída do fluxo (reordenar, remover item,
    // cancelar, aplicar de verdade) por _clearTabOrderPreviewBadges — nunca
    // reaproveitado como selo real.
    if (isPreview) {
      group.setPluginData('hacTabOrderPreviewForArea', areaId || '');
      if ('opacity' in group) group.opacity = 0.55;
    }

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
    // try/catch, um appendChild que falhasse no meio do loop de criação dos
    // selos (apply-tab-order-to-canvas) interromperia os selos seguintes sem
    // aviso — o selo já criado e corretamente posicionado não deve se perder
    // por causa de uma falha só na organização/agrupamento.
    if (tabOrderClone) {
      try {
        const _origX = group.x;
        const _origY = group.y;
        tabOrderClone.appendChild(group);
        group.x = Math.round(_origX - tabOrderClone.x);
        group.y = Math.round(_origY - tabOrderClone.y);
      } catch (e) {
        // Selo de PRÉVIA (isPreview=true): nunca deve sobreviver fora do
        // clone que o originou — se o appendChild falhou (ex.: a cópia
        // rascunho foi deletada por delete-tab-order-draft-copy enquanto
        // este loop assíncrono ainda estava em voo), o fallback genérico de
        // reparentar pra Section oficial (_reparentIntoA11ySection) deixaria
        // um selo fantasma órfão e permanente lá dentro, sem nenhum código
        // de limpeza capaz de encontrá-lo (toda limpeza de preview varre só
        // dentro do clone). Descarta silenciosamente em vez disso.
        if (isPreview) {
          try { group.remove(); } catch (e2) { }
        } else if (reparentToSection !== false) {
          _reparentIntoA11ySection(group);
        }
      }
    } else if (reparentToSection !== false) {
      _reparentIntoA11ySection(group);
    }

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

  // Apaga TODOS os selos de prévia temporária (isPreview=true em
  // _createTabOrderBadge) de uma área — chamada em todo caminho de saída do
  // fluxo de revisão da Ordem de Tabulação: reordenar/adicionar/remover item
  // (redesenha do zero), cancelar o modal, e "Aplicar no Canvas" (os selos
  // REAIS tomam o lugar). Varre os filhos da cópia rascunho (onde os
  // previews nascem via tabOrderClone.appendChild) por pluginData — nunca
  // por nome, mesmo padrão de delete-tab-order-draft-copy.
  async function _clearTabOrderPreviewBadges(areaId) {
    let cloneNode = null;
    if (_activeTabOrderCloneMap && _activeTabOrderCloneAreaId === areaId) {
      cloneNode = _findTabOrderCopyForArea(areaId);
    }
    if (!cloneNode) return;
    const toRemove = cloneNode.findAll
      ? cloneNode.findAll(n => n.getPluginData && n.getPluginData('hacTabOrderPreviewForArea') === areaId)
      : [];
    for (const n of toRemove) {
      try { n.remove(); } catch (e) { }
    }
  }

  // Reordena candidatos já coletados (DFS de generate-tab-order-from-layers)
  // seguindo um padrão de leitura visual em zigue-zague ("boustrophedon"):
  // linha 1 esquerda→direita, linha 2 direita→esquerda, linha 3
  // esquerda→direita, e assim por diante. Esse é o critério confirmado pela
  // vertical de acessibilidade do produto como referência real de reading
  // order para Ordem de Tabulação em telas com múltiplas colunas (ex:
  // extrato bancário, grids de cards) — NÃO é convenção nativa de leitor de
  // tela (que lê top-to-bottom/DOM order) nem ordem de camadas do Figma; é
  // um critério de produto documentado pela vertical de a11y. Não
  // "simplificar" de volta para top-to-bottom ou ordem de DFS.
  //
  // Agrupamento em linhas: dois nós pertencem à mesma linha visual quando
  // suas faixas verticais (absoluteBoundingBox.y → y+height) SE SOBREPÕEM —
  // não é uma tolerância fixa em pixels, porque elementos de alturas
  // diferentes na mesma linha (ex: label pequeno ao lado de um input maior)
  // não teriam o mesmo y exato. Comparação contra QUALQUER nó já acumulado
  // na linha atual (não só o último) para tolerar leve desalinhamento
  // vertical entre elementos da mesma linha.
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
  // apply-tab-order-to-canvas, só quando o designer confirma no modal de
  // revisão, reaproveitando a cópia/mapa já ativos aqui.
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
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items: [] });
          return;
        }
        if (typeof root.clone !== 'function') {
          figma.notify("Este elemento não pode ser copiado — marque a área sobre um frame/grupo.");
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items: [] });
          return;
        }

        const { clone, nodeMap } = await _createTabOrderCloneForArea(root, msg.areaId);
        _activeTabOrderCloneMap = nodeMap;
        _activeTabOrderCloneAreaId = msg.areaId || null;

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
          figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items: [], cloneId: clone.id, nodeMap: plainNodeMap });
          return;
        }

        // `collected` nasce na ordem de descoberta (agora paralela por
        // nível, não mais DFS estrito), mas a ordem que importa pro
        // designer é sempre recalculada pela posição visual em
        // zigue-zague — ver _orderNodesInZigzagReadingOrder.
        const withBounds = collected.filter(node => !!node.absoluteBoundingBox);
        const items = _orderNodesInZigzagReadingOrder(withBounds)
          .map(node => ({ nodeId: node.id, nodeName: node.name }));

        figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items, cloneId: clone.id, nodeMap: plainNodeMap });
        figma.notify(`${items.length} elemento${items.length === 1 ? '' : 's'} encontrado${items.length === 1 ? '' : 's'} — revise no modal antes de aplicar.`);
      } catch (e) {
        figma.notify("Não foi possível varrer a área automaticamente — tente novamente.");
        figma.ui.postMessage({ type: "tab-order-generated-from-layers", areaId: msg.areaId, items: [] });
      }
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
          instance.setProperties({ 'number#1478:0': String(entry.number) });
          node.name = `[Selo de Tabulação | ${entry.number}] ${node.name.replace(/^\[Selo de Tabulação \| \d+\]\s*/, '')}`;
          updated.push(entry.id);
        } catch (e) { }
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

  // Gap entre a faixa ocupada (áreas/specs/cópias já existentes) e a nova
  // linha de cópias de Ordem de Tabulação — mesmo valor de _SPEC_GAP (linha
  // ~1789) por consistência visual com o restante do canvas injetado pelo
  // hac. Gap horizontal entre cópias que dividem a mesma faixa reaproveita
  // _SPEC_COL_GAP (~64) pelo mesmo motivo.
  const _TAB_ORDER_ROW_GAP = 32;
  const _TAB_ORDER_COL_GAP = 64;

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

    figma.currentPage.children.forEach(addNode);

    const areaTargetIds = [];
    for (const sibling of figma.currentPage.children) {
      try {
        const areaTargetId = sibling.getPluginData && sibling.getPluginData('hacAreaTargetNodeId');
        if (areaTargetId) areaTargetIds.push(areaTargetId);
      } catch (e) { }
    }
    const section = _getOrCreateA11ySection();
    for (const child of (section.children || [])) {
      try {
        const areaTargetId = child.getPluginData && child.getPluginData('hacAreaTargetNodeId');
        if (areaTargetId) areaTargetIds.push(areaTargetId);
      } catch (e) { }
    }

    for (const areaTargetId of areaTargetIds) {
      try {
        const areaRoot = await figma.getNodeByIdAsync(areaTargetId);
        if (areaRoot) addNode(areaRoot);
      } catch (e) { }
    }

    const tabOrderSection = _getOrCreateTabOrderSection();
    for (const child of (tabOrderSection.children || [])) addNode(child);

    return bounds;
  }

  // Cópias de Ordem de Tabulação (e tudo mais que o hac injeta) crescem numa
  // única "faixa" horizontal abaixo de todo o conteúdo já ocupado na página:
  // simples, previsível, e nunca sobrepõe nada — nem o frame original de
  // qualquer Área Marcada, nem specs, nem cópias de Ordem de Tabulação já
  // existentes (de qualquer área). Dentro da faixa mais recente (mesmo Y,
  // identificável pelas cópias já marcadas com hacTabOrderCopyForArea), a
  // nova cópia entra à direita da última — mesmo raciocínio de "empilha ao
  // lado do que já existe" usado pelas specs (_SPEC_COL_GAP), só que aqui
  // não há sub-colunas por categoria: a faixa inteira é uma única linha.
  // cloneWidth/cloneHeight não entram no cálculo hoje (a faixa cresce pra
  // baixo/direita sem limite, então não há "encaixe" a verificar) — ficam no
  // assinatura só como reserva caso um layout com quebra de linha por
  // largura máxima seja necessário no futuro.
  async function _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight) {
    const occupied = await _collectA11yOccupiedBounds();
    if (occupied.length === 0) {
      return { x: 0, y: 0 };
    }

    const lowestBottom = occupied.reduce((max, b) => Math.max(max, b.bottom), -Infinity);
    const leftmost = occupied.reduce((min, b) => Math.min(min, b.left), Infinity);
    const rowY = Math.round(lowestBottom + _TAB_ORDER_ROW_GAP);

    let rowRightmost = null;
    _forEachTabOrderCopyCandidate(sibling => {
      try {
        if (!sibling.getPluginData || !sibling.getPluginData('hacTabOrderCopyForArea')) return;
        const bb = sibling.absoluteBoundingBox || sibling.absoluteRenderBounds;
        if (!bb) return;
        if (Math.abs(bb.y - rowY) > _TAB_ORDER_ROW_GAP) return;
        const right = bb.x + bb.width;
        if (rowRightmost === null || right > rowRightmost) rowRightmost = right;
      } catch (e) { }
    });

    const rowX = rowRightmost !== null
      ? Math.round(rowRightmost + _TAB_ORDER_COL_GAP)
      : Math.round(leftmost);

    return { x: rowX, y: rowY };
  }

  // Remove qualquer cópia anterior da MESMA área (via pluginData, nunca por
  // nome — o designer pode renomear), clona `root`, posiciona numa faixa
  // livre (nunca sobrepondo o que o hac já colocou/referencia no canvas),
  // nomeia e marca pluginData. Não desenha nenhum selo — isso é
  // responsabilidade exclusiva de quem chama. A remoção da cópia antiga
  // acontece ANTES do cálculo de posição livre de propósito: se a
  // recriação for da MESMA área, o espaço que ela ocupava deve contar como
  // livre de novo.
  async function _createTabOrderCloneForArea(root, areaId) {
    _removeExistingTabOrderCopiesForArea(areaId);

    const cloneWidth = root.absoluteBoundingBox.width;
    const cloneHeight = root.absoluteBoundingBox.height;
    const { x, y } = await _findFreeTabOrderCopyPosition(cloneWidth, cloneHeight);

    const clone = root.clone();
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
    // calculado por _findFreeTabOrderCopyPosition). _reparentIntoTabOrderSection
    // converte x/y pra relativo à Section preservando a posição visual.
    _reparentIntoTabOrderSection(clone);

    return { clone, nodeMap };
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

      const { clone, nodeMap } = await _createTabOrderCloneForArea(root, msg.areaId);
      _activeTabOrderCloneMap = nodeMap;
      _activeTabOrderCloneAreaId = msg.areaId || null;

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
  // resolve internamente, via _activeTabOrderCloneMap, pro node equivalente
  // dentro da cópia rascunho — só então desenha o contorno de highlight,
  // sempre na CÓPIA, nunca no original. Sem cópia ativa cai de volta pro
  // highlight direto no original, pra nunca deixar o clique sem NENHUM
  // feedback visual.
  if (msg.type === "highlight-tab-order-copy-node") {
    (async () => {
      if (activeHighlightNode) {
        try { activeHighlightNode.remove(); } catch (e) { }
        activeHighlightNode = null;
      }

      let targetId = msg.id;
      if (_activeTabOrderCloneMap && _activeTabOrderCloneMap.has(msg.id)) {
        targetId = _activeTabOrderCloneMap.get(msg.id).id;
      }

      const node = await figma.getNodeByIdAsync(targetId);
      if (!node || !node.visible || !_nodeOnCurrentPage(node) || !node.absoluteBoundingBox) return;

      const hexToRgbLocal = (hex) => {
        const h = (hex || '#0891B2').replace('#', '');
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
    })();
    return;
  }

  // Prévia visual TEMPORÁRIA da Ordem de Tabulação — chamada a cada
  // mudança na lista pendente (item adicionado/removido/reordenado) ENQUANTO
  // o modal de revisão está aberto, refletindo a ordem ATUAL da lista.
  // NUNCA toca o frame original: desenha o lote inteiro de selos "fantasma"
  // (opacidade reduzida) dentro da mesma cópia rascunho já criada por
  // start-tab-order-copy, reaproveitando _createTabOrderBadge. Redesenha do
  // zero a cada chamada (apaga os anteriores primeiro) — mais simples e
  // seguro do que tentar diffar a ordem, e o volume de itens de uma Ordem de
  // Tabulação (dezenas, não centenas) não justifica otimizar isso.
  // Requer que start-tab-order-copy já tenha rodado para esta área (fluxo
  // manual) OU generate-tab-order-from-layers (fluxo automático, que também
  // passa por _createTabOrderCloneForArea) — sem cópia ativa, não há onde
  // desenhar a prévia e a chamada é ignorada silenciosamente (a lista
  // pendente continua funcionando normalmente, só sem prévia no canvas).
  if (msg.type === "preview-tab-order-numbers") {
    const myGeneration = ++_tabOrderPreviewGeneration;
    (async () => {
      if (!_activeTabOrderCloneMap || _activeTabOrderCloneAreaId !== msg.areaId) return;
      await _clearTabOrderPreviewBadges(msg.areaId);

      const cloneNode = _findTabOrderCopyForArea(msg.areaId);
      if (!cloneNode) return;

      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      for (const entry of (msg.items || [])) {
        // Duas checagens de invariante a cada iteração, não só uma vez no
        // início do loop — este loop é assíncrono (await dentro dele cede o
        // event loop a cada volta) e tanto o cancelamento/troca da cópia
        // rascunho quanto uma chamada mais nova de preview podem acontecer
        // no meio do caminho:
        //   1. geração obsoleta — uma chamada mais recente já assumiu.
        //   2. cópia rascunho foi deletada/trocada (delete-tab-order-draft-
        //      copy) enquanto este loop ainda rodava.
        // Em qualquer um dos dois casos, aborta imediatamente sem tentar
        // criar mais selos.
        if (myGeneration !== _tabOrderPreviewGeneration) return;
        if (!_activeTabOrderCloneMap || _activeTabOrderCloneAreaId !== msg.areaId) return;
        const mappedNode = _activeTabOrderCloneMap.get(entry.nodeId);
        if (!mappedNode || !mappedNode.absoluteBoundingBox) continue;
        try {
          await _createTabOrderBadge(mappedNode, entry.number, '', 'direita', msg.areaId, false, msg.a11yOrigin, cloneNode, true);
        } catch (e) {
          // Selo de prévia individual falhou (node removido no meio do loop,
          // etc.) — não interrompe o resto do lote, mas loga pra não ficar
          // indiagnosticável (era um catch mudo antes).
          console.error('[hac] preview-tab-order-numbers: falha ao desenhar selo fantasma para', entry.nodeId, e && e.message);
        }
      }
    })();
    return;
  }

  // Limpeza explícita da prévia — chamada ao fechar/cancelar o modal de
  // revisão e antes de "Aplicar no Canvas" desenhar os selos REAIS (que
  // tomam o lugar dos temporários). Sem isso os selos fantasma ficariam
  // órfãos dentro da cópia (delete-tab-order-draft-copy já cobre o caso de
  // cancelar, já que apaga a cópia inteira — este handler cobre o caso de
  // "Aplicar no Canvas", onde a cópia SEGUE existindo, só sem os selos
  // fantasma).
  if (msg.type === "clear-tab-order-preview-numbers") {
    (async () => { await _clearTabOrderPreviewBadges(msg.areaId); })();
    return;
  }

  // Cancelamento do fluxo manual: a cópia rascunho criada por
  // start-tab-order-copy fica órfã (vazia, sem selos) se o designer desistir
  // — remove pelo mesmo pluginData de sempre e zera o estado em memória.
  if (msg.type === "delete-tab-order-draft-copy") {
    _deleteTabOrderDraftCopy(msg.areaId);
    return;
  }

  // "Aplicar no Canvas" — única etapa do fluxo de Ordem de Tabulação que de
  // fato desenha algo. Recebe a lista final (já revisada/reordenada no
  // modal) com o nodeId do elemento ORIGINAL de cada item, e:
  //   1. Localiza/recria a CÓPIA do frame da área (nunca acumula cópias
  //      órfãs).
  //   2. Reaproveita o mapa original→clone já calculado por
  //      start-tab-order-copy quando ainda ativo pra ESTA área; senão clona
  //      de novo do zero (fallback pro fluxo automático, que não passa por
  //      "Iniciar").
  //   3. Desenha os selos na CÓPIA, usando a mesma _createTabOrderBadge de
  //      sempre, mas passando o node MAPEADO como alvo de posicionamento.
  if (msg.type === "apply-tab-order-to-canvas") {
    (async () => {
      const root = await figma.getNodeByIdAsync(msg.targetNodeId);
      if (!root || !root.absoluteBoundingBox) {
        figma.notify("Área não encontrada no canvas — marque novamente.");
        figma.ui.postMessage({ type: "tab-order-applied-to-canvas", items: [] });
        return;
      }
      if (typeof root.clone !== 'function') {
        figma.notify("Este elemento não pode ser copiado — marque a área sobre um frame/grupo.");
        figma.ui.postMessage({ type: "tab-order-applied-to-canvas", items: [] });
        return;
      }

      let clone = null;
      let nodeMap = null;
      if (_activeTabOrderCloneMap && _activeTabOrderCloneAreaId === msg.areaId) {
        const existingCloneEntry = _activeTabOrderCloneMap.get(root.id);
        const existingClone = existingCloneEntry ? await figma.getNodeByIdAsync(existingCloneEntry.id) : null;
        if (existingClone) {
          clone = existingClone;
          nodeMap = _activeTabOrderCloneMap;
        }
      }
      if (!clone) {
        const created = await _createTabOrderCloneForArea(root, msg.areaId);
        clone = created.clone;
        nodeMap = created.nodeMap;
      }
      _activeTabOrderCloneMap = null;
      _activeTabOrderCloneAreaId = null;

      // Os selos fantasma da prévia (se o fluxo passou por
      // preview-tab-order-numbers) dão lugar aos selos REAIS agora — apaga
      // pelo mesmo pluginData, direto no clone já resolvido acima (não
      // depende de _activeTabOrderCloneAreaId, já zerado nesta linha).
      if (clone.findAll) {
        for (const n of clone.findAll(n => n.getPluginData && n.getPluginData('hacTabOrderPreviewForArea') === msg.areaId)) {
          try { n.remove(); } catch (e) { }
        }
      }

      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const items = [];
      const createdGroups = [];
      let skipped = 0;
      for (const entry of (msg.items || [])) {
        const mappedNode = nodeMap.get(entry.nodeId);
        if (!mappedNode || !mappedNode.absoluteBoundingBox) {
          skipped++;
          continue;
        }
        try {
          const { group, item } = await _createTabOrderBadge(mappedNode, entry.number, '', 'direita', msg.areaId, false, msg.a11yOrigin, clone);
          createdGroups.push(group);
          items.push(item);
        } catch (e) {
          // Um selo REAL falhando não pode derrubar o lote inteiro (os
          // itens já desenhados até aqui ficariam perdidos silenciosamente).
          skipped++;
          console.error('[hac] apply-tab-order-to-canvas: falha ao desenhar selo para', entry.nodeId, e && e.message);
        }
      }

      if (createdGroups.length > 0) {
        figma.currentPage.selection = [clone, ...createdGroups];
        figma.viewport.scrollAndZoomIntoView([clone, ...createdGroups]);
      }

      figma.ui.postMessage({ type: "tab-order-applied-to-canvas", items, copyName: clone.name });
      figma.notify(skipped > 0
        ? `Ordem de tabulação aplicada (${items.length} de ${items.length + skipped} — ${skipped} elemento${skipped === 1 ? '' : 's'} não encontrado${skipped === 1 ? '' : 's'}).`
        : `Ordem de tabulação aplicada em "${clone.name}".`);
    })();
    return;
  }

  // Exclusão em cascata da área — remove a cópia do frame gerada por
  // "Aplicar no Canvas" pra esta área, se existir. Localiza só por
  // pluginData, nunca por nome (o designer pode ter renomeado a cópia livremente).
  if (msg.type === "delete-tab-order-copy-for-area") {
    _removeExistingTabOrderCopiesForArea(msg.areaId);
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
};
