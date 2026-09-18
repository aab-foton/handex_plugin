// ============================================================
// backend/dsc-matching.js — hac (backend, sandbox principal do Figma)
//
// EXTRAÍDO de code.js (2026-09-14) — Camada 1 da modularização do backend
// (plano aprovado na mesma sessão). Motor de matching DSC → categoria de
// a11y e o scan automático de área (_a11yScanArea) — infraestrutura
// TRANSVERSAL, não exclusiva de nenhuma "aba"/funcionalidade: consumida
// pelo scan geral (handler scan-frame, que alimenta tanto Marcar Área
// quanto o wizard de Detecção Automática do Leitor de Tela) E pelo
// "Mapeamento Automático" da Ordem de Tabulação (handler
// generate-tab-order-from-layers). Por isso este módulo NÃO se chama
// "leitor-de-tela" — nomear por área de produto erraria sobre quem mais
// depende dele.
//
// Movido tal como estava em code.js — zero mudança de lógica interna, só
// recorte/cola com `export` adicionado nas funções/consts que code.js (ou
// outro módulo) ainda precisa consumir de fora. Ver plano em
// C:\Users\augus\.claude\plans\encapsulated-booping-toucan.md para o
// racional completo da extração e a ordem das próximas camadas.
// ============================================================

import DSC_A11Y_MAPPING from '../refs/dsc-component-a11y-mapping.json';
import DSC_A11Y_MAPPING_MOBILE from '../refs/dsc-component-a11y-mapping-mobile.json';
import DSC_A11Y_MAPPING_SUPERDSCWEB from '../refs/dsc-component-a11y-mapping-superdscweb.json';
import DSC_A11Y_MAPPING_ANDROID from '../refs/dsc-component-a11y-mapping-android.json';
import REF_SKELETON from '../refs/_skeleton.json';

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
export function _getDscComponentKeyToFrameMap() {
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
export function _resolveDscComponentA11yMatch(componentKey) {
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

// Resolve o match da SELEÇÃO ATUAL do canvas e posta 'manual-spec-match-resolved'
// pro frontend — extraído do handler resolve-manual-spec-match pra ser
// reaproveitado também pelo listener de selectionchange (_a11yManualMatchModeActive,
// code.js), que re-resolve ao vivo enquanto o gate de seleção do "+ Nova spec"
// estiver ativo. Mesmo padrão de resolução de get-selection-name (só INSTANCE
// com mainComponent remoto é candidato, nunca lança se getMainComponentAsync
// falhar) — reaproveita _resolveDscComponentA11yMatch, não duplica a lógica
// de matching. token null é o caso do listener (não veio de um pedido pontual
// do frontend); o frontend ignora respostas cujo token não bate com o mais
// recente, mas token null nunca é comparado contra nada (ver
// manual-spec-match-resolved, messages.js), então passa sempre.
export async function _resolveManualSpecMatchAndNotify(token) {
  const sel = figma.currentPage.selection;
  const node = sel.length > 0 ? sel[0] : null;
  let match = null;
  if (node && node.type === 'INSTANCE') {
    try {
      const mainComp = await node.getMainComponentAsync();
      if (mainComp && mainComp.remote && mainComp.key) {
        match = _resolveDscComponentA11yMatch(mainComp.key);
      }
    } catch (e) { match = null; }
  }
  figma.ui.postMessage({
    type: 'manual-spec-match-resolved',
    token: token || null,
    nodeId: node ? node.id : null,
    nodeName: node ? node.name : null,
    match
  });
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
export const A11Y_INTERACTIVE_SHORTNAMES = new Set([
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
export function _isA11yInteractiveComponentKey(componentKey) {
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
export function _findVisibleLabelText(node, depth) {
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
// Scan automático de área (Detecção Automática)
// ============================================================

// Percorre a árvore de uma Área Marcada e classifica cada node candidato
// (componente DSC real, ícone, imagem, texto/título, vetor) contra o motor
// de matching acima. Chamada pelo handler `scan-frame` (code.js) — que
// alimenta tanto "Marcar Área" quanto o wizard de Detecção Automática do
// Leitor de Tela.
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

  // Teto de descida DENTRO do modo restrito (visitando descendentes de um
  // componente DSC já resolvido, ver _hasResolvedDscMatch abaixo) — conta
  // separado do `depth` geral da árvore. Ampliado de 1 para 3 (2026-09-18,
  // pedido do usuário: cobrir ícone/decorativo aninhado mais fundo dentro
  // de componentes compostos, ex. um ícone dentro de um Badge dentro de um
  // Card DSC). A REGRA que evita fragmentação (só ícone/decorativo isolado
  // vira item, categoria abaixo desse limite é sempre descartada) não muda
  // — só o ALCANCE vertical aumenta. Ver comentário original do caso
  // "[dsc-tc] Actions - Button Row" (2026-09-09) mais abaixo.
  const RESTRICTED_MODE_MAX_DEPTH = 3;

  // `parentComponentMatch` (2026-09-09): preenchido só quando esta chamada
  // de _extract está visitando um descendente de um componente DSC já
  // resolvido (ver _hasResolvedDscMatch/_hasExposedSlotProperties abaixo)
  // — até RESTRICTED_MODE_MAX_DEPTH níveis abaixo dele (contados em
  // `restrictedDepth`, separado do `depth` geral da árvore). Sinaliza pro
  // bloco de classificação "só aceite este node se ele for um ÍCONE
  // isolado (categoria 'icons'), ignore qualquer outra categoria" — ver uso
  // mais abaixo. Fora desse modo (undefined), o comportamento é o de sempre.
  async function _extract(n, depth, parentComponentMatch, restrictedDepth) {
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
          // Nome do PAI IMEDIATO na árvore, sempre preenchido (2026-09-11,
          // bug real reportado: designer confirmou um TEXT de título
          // pensando ser o componente inteiro, porque nada na lista de
          // revisão indicava que aquele texto vivia DENTRO de outra coisa
          // — o Top App Bar continha o texto mas não foi reconhecido como
          // componente DSC, então parentComponentMatch acima ficou null e
          // não havia nenhum outro sinal de contexto). Diferente de
          // parentComponentMatch (só preenchido quando o pai É um
          // componente DSC já resolvido), este campo é sempre o nome do
          // node pai na árvore, reconhecido ou não — dá contexto mínimo
          // pro designer diferenciar "o componente inteiro" de "algo
          // dentro dele", mesmo quando o hac não sabe categorizar o pai.
          immediateParentName: (n.parent && n.parent !== rootNode) ? n.parent.name : null,
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

      // Já estamos DENTRO do modo restrito (visitando descendente de um
      // componente pai resolvido, ver ramo abaixo) — desce até
      // RESTRICTED_MODE_MAX_DEPTH níveis abaixo dele (2026-09-18, antes era
      // sempre 1), mesmo que este próprio filho seja um FRAME/GROUP com
      // filhos, e mesmo que ele próprio resolva como outro componente DSC.
      // Isso é o que garante o teto, sem depender de
      // _hasResolvedDscMatch/_hasExposedSlotProperties calculados de novo
      // pra este filho — a regra "só ícone/decorativo isolado vira item"
      // (aplicada no bloco de classificação acima, via `category !== 'icons'
      // vira frames`) continua valendo em TODOS esses níveis, evitando
      // fragmentação mesmo com o alcance maior.
      if (parentComponentMatch) {
        if ((restrictedDepth || 0) < RESTRICTED_MODE_MAX_DEPTH && 'children' in n && n.children) {
          for (const child of n.children) {
            await _extract(child, (depth || 0) + 1, parentComponentMatch, (restrictedDepth || 0) + 1);
          }
        }
      } else if (!_hasResolvedDscMatch && !_hasExposedSlotProperties && 'children' in n && n.children) {
        for (const child of n.children) {
          await _extract(child, (depth || 0) + 1);
        }
      } else if (_hasResolvedDscMatch && !_hasExposedSlotProperties && 'children' in n && n.children) {
        // Regra original (2026-09-09, caso real: "[dsc-tc] Actions - Button
        // Row" — cada botão tem um ícone interno que precisa virar spec
        // própria de Elemento Decorativo, hoje invisível porque a
        // recursão parava aqui). Em vez de bloquear totalmente, desce até
        // RESTRICTED_MODE_MAX_DEPTH níveis (o guard acima, no ramo
        // `if (parentComponentMatch)`, impede qualquer nível além desse
        // teto) — cada filho é classificado normalmente pela lógica acima,
        // mas só é aceito se for um ÍCONE isolado (parentComponentMatch
        // !== null && category !== 'icons' vira 'frames', descartado). Não
        // reintroduz o bug original: qualquer OUTRA INSTANCE de componente
        // DSC dentro (ex. um Badge) nunca bate na heurística de ícone,
        // então nunca vira item concorrente — e mesmo que batesse, o guard
        // acima impediria ela de descer além do teto. Aplicado só ao caso
        // _hasResolvedDscMatch — _hasExposedSlotProperties (conteúdo de
        // slot dinâmico, ex. Footer/Badge do Value Section) continua
        // bloqueado por completo, caso conceitualmente diferente (conteúdo
        // configurável via property, não decoração fixa do design) — não
        // ampliado nesta mudança (decisão explícita do usuário, 2026-09-18).
        for (const child of n.children) {
          await _extract(child, (depth || 0) + 1, _dscRemoteMatch, 1);
        }
      }
    } catch (err) {
      console.error("Erro ao escanear node:", n.name, "(type=" + n.type + ", id=" + n.id + ")", err && err.message ? err.message : err);
    }
  }

  await _extract(rootNode, 0);
  return results;
}

export { _a11yScanArea };
