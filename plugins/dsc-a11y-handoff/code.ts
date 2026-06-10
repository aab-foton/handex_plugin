// ==========================================
// 1. CONFIGURAÇÃO INICIAL E TIPAGENS
// ==========================================
figma.showUI(__html__, { width: 560, height: 760, themeColors: true });

figma.on('close', () => {
  try {
    const container = variacoesContainerId
      ? figma.getNodeById(variacoesContainerId)
      : figma.currentPage.findOne((n: SceneNode) => n.name === '[A11Y Variações]');
    if (container) container.remove();
    variacoesContainerId = null;
    pluginDataNodeId = null;
  } catch (e) {}
});

let componentePrincipalAtivo: SceneNode | null = null;
let handoffAtivo: SceneNode | null = null;
let variacoesContainerId: string | null = null;
let pluginDataNodeId: string | null = null;
let contextoTravado: boolean = false;
let tempTouchOverlayId: string | null = null;
let tempSROverlayId: string | null = null;
let tempSROverlayRefX: number = 0;
let tempSROverlayRefY: number = 0;
let tempSROverlayTipo: string = 'conector';
let componenteVariacaoAtivo: SceneNode | null = null;
let componenteTabVariacaoAtivo: SceneNode | null = null;
let componenteSRVariacaoAtivo: SceneNode | null = null;
let isHandoffGenerated = false;

// ==========================================
// 2. FUNÇÕES AUXILIARES
// ==========================================

// Resolve o nó onde pluginData deve ser salvo/lido:
// COMPONENT_SET ou COMPONENT → retorna direto
// INSTANCE → sobe para o mainComponent (ou seu parent ComponentSet)
// Outros tipos → null
async function resolveDataNode(node: SceneNode): Promise<(ComponentSetNode | ComponentNode) | null> {
  if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') {
    return node as ComponentSetNode | ComponentNode;
  }
  if (node.type === 'INSTANCE') {
    const master = await (node as InstanceNode).getMainComponentAsync();
    if (!master) return null;
    return (master.parent?.type === 'COMPONENT_SET'
      ? master.parent
      : master) as ComponentSetNode | ComponentNode;
  }
  return null;
}

async function getCachedPluginDataNode(): Promise<InstanceNode | null> {
  if (pluginDataNodeId) {
    const cached = await figma.getNodeByIdAsync(pluginDataNodeId) as InstanceNode | null;
    if (cached) return cached;
    pluginDataNodeId = null;
  }
  if (!handoffAtivo) return null;
  const found = (handoffAtivo as any).findOne((n: SceneNode) => n.name === '[dsc-h] Plugin Data A11y') as InstanceNode | null;
  if (found) pluginDataNodeId = found.id;
  return found;
}

function getTouchDimensions(preset: string): { hStr: string; wStr: string } {
  if (preset === '44x100') return { hStr: '44px', wStr: 'Ocupa 100% da largura do componente' };
  if (preset === '44x44')  return { hStr: '44px', wStr: '44px' };
  if (preset === '24x24')  return { hStr: '24px', wStr: '24px' };
  if (preset === '24x100') return { hStr: '24px', wStr: 'Ocupa 100% da largura do componente' };
  return { hStr: '—', wStr: '—' };
}

async function updateText(node: TextNode, value: string) {
  try {
    // Verifica se o texto tem formatações misturadas (ex: negrito em uma palavra só)
    if (node.fontName === figma.mixed) {
      // Pega a fonte do primeiro caractere para usar de base
      const fallbackFont = node.getRangeFontName(0, 1) as FontName;
      await figma.loadFontAsync(fallbackFont);
      node.setRangeFontName(0, node.characters.length, fallbackFont);
    } else {
      await figma.loadFontAsync(node.fontName as FontName);
    }
    node.characters = value;
  } catch(e) {
    console.error("Erro ao carregar fonte:", e);
  }
}

async function applyWcagBackground(imageFrame: FrameNode, componentNode: SceneNode, allVars: any[]): Promise<void> {
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const relativeLuminance = (r: number, g: number, b: number) =>
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const wcagContrast = (l1: number, l2: number) => {
    const lighter = Math.max(l1, l2);
    const darker  = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };
  const bgFills = Array.isArray(imageFrame.fills) ? imageFrame.fills as Paint[] : [];
  const bgFill  = bgFills.find(f => f.type === 'SOLID') as SolidPaint | undefined;

  // COMPONENT_SET não tem fills — usa o primeiro filho COMPONENT
  let fillSource: SceneNode = componentNode;
  if (componentNode.type === 'COMPONENT_SET') {
    const firstChild = (componentNode as ComponentSetNode).children.find(c => c.type === 'COMPONENT') as ComponentNode | undefined;
    if (firstChild) fillSource = firstChild;
  }
  const rootFills = Array.isArray((fillSource as FrameNode).fills) ? (fillSource as FrameNode).fills as Paint[] : [];
  const rootFill  = rootFills.find(f => f.type === 'SOLID') as SolidPaint | undefined;

  // Se o componente não tem fill de fundo, procura a cor de conteúdo (texto ou ícone)
  // para garantir que textos/ícones brancos sobre fundo branco não passem despercebidos
  let effectiveCompColor: RGB;
  if (rootFill) {
    effectiveCompColor = rootFill.color;
  } else {
    const CONTENT_TYPES = new Set(['TEXT', 'VECTOR', 'ELLIPSE', 'RECTANGLE', 'POLYGON', 'STAR', 'BOOLEAN_OPERATION']);
    const contentNodes = (fillSource as any).findAll((n: SceneNode) => CONTENT_TYPES.has(n.type)) as SceneNode[];
    let contentColor: RGB | null = null;
    for (const n of contentNodes) {
      const nFills = Array.isArray((n as any).fills) ? (n as any).fills as Paint[] : [];
      const solid  = nFills.find((f: Paint) => f.type === 'SOLID' && (f as SolidPaint).opacity !== 0) as SolidPaint | undefined;
      if (solid) { contentColor = solid.color; break; }
    }
    // Último fallback: branco (componente totalmente transparente sem conteúdo visível detectado)
    effectiveCompColor = contentColor ?? { r: 1, g: 1, b: 1 };
  }

  let needsSwap = false;
  if (bgFill) {
    const bgL   = relativeLuminance(bgFill.color.r,   bgFill.color.g,   bgFill.color.b);
    const compL = relativeLuminance(effectiveCompColor.r, effectiveCompColor.g, effectiveCompColor.b);
    needsSwap = wcagContrast(bgL, compL) < 3;
  }
  if (needsSwap) {
    const figmaVars = (figma as any).variables;
    const cardBg2Var = allVars.find((v: any) => v.name.toLowerCase().includes('card background 2'));
    if (cardBg2Var && figmaVars) {
      imageFrame.fills = [figmaVars.setBoundVariableForPaint(
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', cardBg2Var
      )];
    } else {
      imageFrame.fills = [{ type: 'SOLID', color: { r: 0.16, g: 0.20, b: 0.29 } }];
    }
  }
}

function computeLetrasTS(conectores: any[]): string[] {
  const letras: string[] = [];
  let decCounter = 0;
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const typeCounters: Record<string, number> = {};
  for (const item of conectores) {
    if (item.tipo === 'decorativo') {
      letras.push('✦' + (decCounter > 0 ? String(decCounter + 1) : ''));
      decCounter++;
    } else {
      const tipo: string = item.tipo || '';
      if (typeCounters[tipo] === undefined) typeCounters[tipo] = 0;
      letras.push(ALPHA[typeCounters[tipo] % 26]);
      typeCounters[tipo]++;
    }
  }
  return letras;
}

function createComponentInstance(comp: SceneNode): SceneNode {
  if (comp.type === 'INSTANCE') return (comp as InstanceNode).clone();
  if (comp.type === 'COMPONENT') return (comp as ComponentNode).createInstance();
  if (comp.type === 'COMPONENT_SET') {
    const set = comp as ComponentSetNode;
    // defaultVariant tem prioridade; se ausente, usa o primeiro filho COMPONENT acessível
    const defaultVar = (set as any).defaultVariant as ComponentNode | undefined;
    const variant = (defaultVar?.type === 'COMPONENT' ? defaultVar : null)
      ?? (Array.from(set.children).find(c => c.type === 'COMPONENT') as ComponentNode | undefined);
    if (variant) return variant.createInstance();
    // Filhos não acessíveis (componente de biblioteca remota sem cache): NUNCA clonar o set inteiro.
    // Retorna frame placeholder para não inserir todas as variantes no handoff.
    const ph = figma.createFrame();
    ph.fills = [];
    try { ph.resize(Math.max(1, set.width), Math.max(1, set.height)); } catch (_) {}
    return ph;
  }
  return comp.clone();
}

/**
 * Remove todos os marcadores visuais de uma variação
 */
function ensureHandoffDetached(): FrameNode {
  if (handoffAtivo && handoffAtivo.type === 'INSTANCE') {
    const frame = (handoffAtivo as InstanceNode).detachInstance();
    frame.name = `[A11Y Handoff] ${componentePrincipalAtivo?.name || 'Componente'}`;
    handoffAtivo = frame;
  }
  return handoffAtivo as FrameNode;
}

async function renumberTouchBadges(imageFrame: FrameNode): Promise<void> {
  const children = Array.from(imageFrame.children);

  // Parse metadata once for all children — O(n) instead of O(n²) or O(n log n)
  const metaCache = new Map<string, any>();
  for (const n of children) {
    try { metaCache.set(n.id, JSON.parse(n.getPluginData('a11y-meta') || '{}')); } catch { metaCache.set(n.id, {}); }
  }

  const allOverlays = children.filter(n => metaCache.get(n.id)?.type === 'touch-overlay');

  // Pre-index badges by "variationId:nome" for O(1) lookup
  const badgeMap = new Map<string, SceneNode>();
  for (const n of children) {
    const d = metaCache.get(n.id);
    if (d?.type === 'touch-badge') {
      badgeMap.set(`${d.variationId ?? 'default'}:${d.nome}`, n);
    }
  }

  const byVariation = new Map<string, SceneNode[]>();
  for (const ov of allOverlays) {
    const vid = metaCache.get(ov.id)?.variationId ?? 'default';
    if (!byVariation.has(vid)) byVariation.set(vid, []);
    byVariation.get(vid)!.push(ov);
  }

  for (const [, overlays] of byVariation) {
    // Sort uses cached metadata — no JSON.parse inside comparator
    overlays.sort((a, b) => (metaCache.get(a.id)?.index ?? 0) - (metaCache.get(b.id)?.index ?? 0));

    for (let i = 0; i < overlays.length; i++) {
      const ov = overlays[i];
      const meta = metaCache.get(ov.id)!;
      meta.index = i;
      ov.setPluginData('a11y-meta', JSON.stringify(meta));
      const prefix: number = meta.variationPrefix ?? 1;

      const badge = badgeMap.get(`${meta.variationId ?? 'default'}:${meta.nome}`);
      if (badge) {
        const bMeta = metaCache.get(badge.id)!;
        bMeta.index = i;
        badge.setPluginData('a11y-meta', JSON.stringify(bMeta));
        const numText = ((badge as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[])
          .find((n: TextNode) => /^[\d.]+$/.test(n.characters.trim()));
        if (numText) await updateText(numText as TextNode, `${prefix}.${i + 1}`);
      }
    }
  }
}

async function getTouchImageFrame(): Promise<FrameNode | null> {
  if (!handoffAtivo) return null;
  // Verifica se o nó ainda existe (pode ter sido deletado pelo usuário)
  const stillExists = await figma.getNodeByIdAsync(handoffAtivo.id);
  if (!stillExists || !handoffAtivo) {
    handoffAtivo = null;
    figma.ui.postMessage({ type: 'feedback', message: '⚠️ O template foi removido. Selecione novamente o componente e o template.' });
    return null;
  }
  const handoff = ensureHandoffDetached();
  const targetAreaSection = Array.from((handoff as FrameNode).children).find(n => n.name === 'target area') as FrameNode | null;
  if (!targetAreaSection) return null;
  let img = Array.from((targetAreaSection as FrameNode).children).find(n =>
    n.name === 'image' &&
    (n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'COMPONENT' || n.type === 'INSTANCE')
  ) as FrameNode | InstanceNode | null;
  if (!img) return null;
  if (img.type === 'INSTANCE') img = img.detachInstance();
  return img as FrameNode;
}

async function getTabImageFrame(): Promise<FrameNode | null> {
  if (!handoffAtivo) return null;
  const stillExists = await figma.getNodeByIdAsync(handoffAtivo.id);
  if (!stillExists || !handoffAtivo) {
    handoffAtivo = null;
    figma.ui.postMessage({ type: 'feedback', message: '⚠️ O template foi removido. Selecione novamente o componente e o template.' });
    return null;
  }
  const handoff = ensureHandoffDetached();
  const focusOrderContainer = Array.from((handoff as FrameNode).children).find(n => n.name === 'focus order') as FrameNode | null;
  if (!focusOrderContainer) return null;
  let img = Array.from((focusOrderContainer as FrameNode).children).find(n =>
    n.name === 'image' &&
    (n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE')
  ) as FrameNode | InstanceNode | null;
  if (!img) return null;
  if (img.type === 'INSTANCE') img = img.detachInstance();
  return img as FrameNode;
}

async function getSRImageFrame(): Promise<FrameNode | null> {
  if (!handoffAtivo) return null;
  const stillExists = await figma.getNodeByIdAsync(handoffAtivo.id);
  if (!stillExists || !handoffAtivo) {
    handoffAtivo = null;
    figma.ui.postMessage({ type: 'feedback', message: '⚠️ O template foi removido. Selecione novamente o componente e o template.' });
    return null;
  }
  const handoff = ensureHandoffDetached();
  const srSection = Array.from((handoff as FrameNode).children).find(n => n.name === 'screen reader') as FrameNode | null;
  if (!srSection) return null;
  let img = Array.from((srSection as FrameNode).children).find(n =>
    n.name === 'image' &&
    (n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE')
  ) as FrameNode | InstanceNode | null;
  if (!img) return null;
  if (img.type === 'INSTANCE') img = img.detachInstance();
  return img as FrameNode;
}

function clearVariationMarkers(varFrame: FrameNode) {
  const markers = varFrame.findAll(n => n.getPluginData('a11y-marker') !== '');
  markers.forEach(m => m.remove());
}

/**
 * Desenha marcadores visuais sobre o frame da variação para indicar o que já foi mapeado
 */
async function drawVariationMarkers(varFrame: FrameNode, markers: any[], color: RGB, type: 'touch' | 'tab' | 'sr', offsetX = 0, offsetY = 0) {
  if (!markers || markers.length === 0) return;

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const markerFrame = figma.createFrame();
    markerFrame.setPluginData('a11y-marker', '1');
    markerFrame.x = m.relX + offsetX;
    markerFrame.y = m.relY + offsetY;
    markerFrame.resize(Math.max(m.width || 20, 1), Math.max(m.height || 20, 1));
    markerFrame.fills = [];
    markerFrame.strokes = [{ type: 'SOLID', color }];
    markerFrame.strokeWeight = 2;
    markerFrame.dashPattern = [4, 4];
    markerFrame.clipsContent = false;
    
    // Bloqueia o marcador para não atrapalhar a seleção de outros elementos
    markerFrame.locked = true;

    if (type === 'tab') {
      try {
        const text = figma.createText();
        await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        text.characters = String(i + 1);
        text.fontSize = 10;
        text.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        
        const badge = figma.createFrame();
        badge.name = 'badge';
        badge.layoutMode = 'HORIZONTAL';
        badge.primaryAxisSizingMode = 'AUTO';
        badge.counterAxisSizingMode = 'AUTO';
        badge.paddingTop = 2; badge.paddingBottom = 2; badge.paddingLeft = 4; badge.paddingRight = 4;
        badge.fills = [{ type: 'SOLID', color }];
        badge.cornerRadius = 4;
        badge.appendChild(text);
        
        markerFrame.appendChild(badge);
        // Posiciona o badge no canto superior direito do item
        badge.x = Math.max(0, (m.width || 20) - badge.width);
        badge.y = 0;
      } catch (e) {
        console.error("Erro ao criar badge de tabulação:", e);
      }
    }

    if (type === 'sr' && m.tipoAnotacao === 'agrupamento') {
      markerFrame.dashPattern = []; // Linha contínua para agrupamentos
      markerFrame.strokeWeight = 3;
    }

    varFrame.appendChild(markerFrame);
  }
}

async function getOrCreateVariacoesContainer(comp: SceneNode, handoff: SceneNode | null, parentNode: FrameNode | PageNode): Promise<FrameNode> {
  const CONTAINER_NAME = '[A11Y Variações]';
  const GAP = 80;

  // Reutiliza container existente (cache por ID para evitar findOne O(n))
  if (variacoesContainerId) {
    const cached = await figma.getNodeByIdAsync(variacoesContainerId) as FrameNode | null;
    if (cached) return cached;
    variacoesContainerId = null;
  }
  const existing = figma.currentPage.findOne((n: SceneNode) => n.name === CONTAINER_NAME) as FrameNode | null;
  if (existing) { variacoesContainerId = existing.id; return existing; }

  // Cria novo container com auto layout horizontal + wrap
  const container = figma.createFrame();
  container.name = CONTAINER_NAME;
  container.fills = [];
  container.clipsContent = false;
  container.layoutMode = 'HORIZONTAL';
  container.layoutWrap = 'WRAP';
  container.itemSpacing = 24;
  container.counterAxisSpacing = 24;
  container.paddingTop = 0;
  container.paddingBottom = 0;
  container.paddingLeft = 0;
  container.paddingRight = 0;
  container.primaryAxisSizingMode = 'AUTO';
  container.counterAxisSizingMode = 'AUTO';

  // Posiciona: à direita do handoff se espaço livre, senão abaixo do comp
  if (handoff) {
    const rightX = handoff.x + handoff.width + GAP;
    const rightY = handoff.y;
    // Verifica se algum sibling ocupa a área à direita do handoff
    const siblings = parentNode.type === 'PAGE'
      ? (figma.currentPage.children as SceneNode[])
      : (parentNode as FrameNode).children as SceneNode[];
    const overlap = siblings.some(n => {
      if (n === comp || n === handoff) return false;
      return n.x < rightX + 400 && (n.x + n.width) > rightX && n.y < rightY + handoff.height && (n.y + n.height) > rightY;
    });
    if (!overlap) {
      container.x = rightX;
      container.y = rightY;
    } else {
      // Abaixo do elemento mais baixo à esquerda do handoff
      const leftSiblings = siblings.filter(n => n !== comp && n !== handoff && n.x < handoff.x);
      const maxBottom = leftSiblings.reduce((acc, n) => Math.max(acc, n.y + n.height), comp.y + comp.height);
      container.x = comp.x;
      container.y = maxBottom + GAP;
    }
  } else {
    container.x = comp.x + comp.width + GAP;
    container.y = comp.y;
  }

  if (parentNode.type === 'PAGE') {
    figma.currentPage.appendChild(container);
  } else {
    (parentNode as FrameNode).appendChild(container);
  }
  variacoesContainerId = container.id;

  return container;
}

// ==========================================
// 3. ROTEADOR DE MENSAGENS (UI -> FIGMA)
// ==========================================
figma.ui.onmessage = async (msg) => {

  if (msg.type === 'load-initial-data') {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      figma.ui.postMessage({ type: 'start-loading' });
      tentarTravarContexto(selection);
    } else {
      figma.ui.postMessage({ type: 'waiting-selection' });
    }
  }

  else if (msg.type === 'run-handoff' || msg.type === 'update-handoff') {
    if (!handoffAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Handoff não encontrado.' });
      return;
    }
    const handoffNode = await figma.getNodeByIdAsync(handoffAtivo.id);
    if (!handoffNode) {
      handoffAtivo = null;
      componentePrincipalAtivo = null;
      tentarTravarContexto(figma.currentPage.selection, true);
      if (!handoffAtivo) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Template não encontrado. Selecione o novo template e o componente no canvas.' });
        return;
      }
    }

    // Limpa overlays temporários de área de toque e leitor de tela
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Toque]') || n.name.startsWith('[A11Y Leitor]')).forEach(n => n.remove());
    tempTouchOverlayId = null;
    tempSROverlayId = null;

    // --- SWAP: substitui handoff antigo pelo novo template ---
    const isOldHandoff = handoffAtivo.name.startsWith('[dsc] A11Y Handoff:');

    // Clones das seções que o usuário NÃO quer atualizar (preenchidos dentro do bloco isOldHandoff)
    const oldSnapshots: Array<{ sectionName: string; clones: SceneNode[] }> = [];

    // Conteúdo SR do handoff antigo capturado antes do swap (para reutilizar no preview)
    type OldSRVar = {
      comp: SceneNode; origX: number; origY: number;
      badges: { clone: SceneNode; relX: number; relY: number; idx: number }[];
      numBadge: SceneNode | null;
    };
    const oldSRVarCapture: OldSRVar[] = [];

    if (isOldHandoff) {
      figma.ui.postMessage({ type: 'feedback', message: '⏳ Substituindo template antigo...' });
      let novaInstancia: InstanceNode | null = null;
      try {
        const novoComp = await figma.importComponentByKeyAsync('4ebd8a017a86b29ca60427416ed4b76af05e4a67');
        novaInstancia = novoComp.createInstance();
        novaInstancia.x = handoffAtivo.x;
        novaInstancia.y = handoffAtivo.y;
        const pai = handoffAtivo.parent;
        if (pai) (pai as any).appendChild(novaInstancia);
        const dadosSalvos = (handoffAtivo as any).getPluginData('a11y-component-data');
        if (dadosSalvos) novaInstancia.setPluginData('a11y-component-data', dadosSalvos);

        // Antes de deletar o antigo: clona as seções desmarcadas para preservá-las visualmente.
        // Os clones são movidos para a página (figma.currentPage) para sobreviver ao .remove() do handoff.
        const sectionFlags: Array<{ name: string; flag: boolean | undefined; multi: boolean }> = [
          { name: 'target area',    flag: msg.runTouch,      multi: false },
          { name: 'focus order',    flag: msg.runTab,         multi: false },
          { name: 'screen reader',  flag: msg.runLeitor,      multi: false },
          { name: 'zoom',           flag: msg.runZoom,         multi: false },
          { name: 'screen size',    flag: msg.runZoom,         multi: false },
          { name: 'keyboard maping', flag: msg.runMapeamento, multi: true  },
        ];
        for (const def of sectionFlags) {
          if (def.flag === false) {
            if (def.multi) {
              const nodes = (handoffAtivo as any).findAll(
                (n: SceneNode) => n.name === 'keyboard maping' || n.name === 'keyboard mapping'
              ) as SceneNode[];
              if (nodes.length > 0) {
                const clones = nodes.map((n: SceneNode) => {
                  const c = n.clone();
                  figma.currentPage.appendChild(c); // move para a página antes do .remove()
                  c.visible = false;
                  return c;
                });
                oldSnapshots.push({ sectionName: def.name, clones });
              }
            } else {
              const node = (handoffAtivo as any).findOne((n: SceneNode) => n.name === def.name) as SceneNode | null;
              if (node) {
                const c = node.clone();
                figma.currentPage.appendChild(c);
                c.visible = false;
                oldSnapshots.push({ sectionName: def.name, clones: [c] });
              }
            }
          }
        }

        // Captura conteúdo SR por variação antes de deletar o handoff antigo.
        // IMPORTANTE: mover clones para figma.currentPage imediatamente — eles morrem com handoffAtivo.remove().
        if (msg.runLeitor !== false) {
          const oldSRSec = (handoffAtivo as any).findOne((n: SceneNode) => n.name === 'screen reader') as FrameNode | null;
          const oldImgFr = oldSRSec
            ? (Array.from(oldSRSec.children as SceneNode[]).find(n => n.name === 'image') as FrameNode | undefined)
            : undefined;
          if (oldImgFr) {
            const comps = (Array.from(oldImgFr.children as SceneNode[]) as SceneNode[])
              .filter(n => n.type === 'INSTANCE' && !n.name.startsWith('[a11y]') && !n.name.startsWith('[dsc-h]') && n.name !== 'tag')
              .sort((a: any, b: any) => a.x - b.x);
            for (let ci = 0; ci < comps.length; ci++) {
              const comp = comps[ci] as any;
              const compCX = comp.x + comp.width / 2;
              const isClosestToThis = (node: any) => comps.every((oc: any, oi: number) =>
                oi === ci || Math.abs((node.x + node.width / 2) - compCX) <= Math.abs((node.x + node.width / 2) - (oc.x + oc.width / 2))
              );

              // Clona componente e move para página (sobrevive ao .remove do handoff)
              const compClone = comp.clone() as SceneNode;
              figma.currentPage.appendChild(compClone);
              compClone.visible = false;

              // Clona badges e move para página
              const varBadges = (Array.from(oldImgFr.children as SceneNode[]) as SceneNode[])
                .filter(n => n.name.startsWith('[a11y]') && isClosestToThis(n))
                .sort((a: any, b: any) => a.y - b.y || a.x - b.x)
                .map((b: any, i: number) => {
                  const bClone = b.clone() as SceneNode;
                  figma.currentPage.appendChild(bClone);
                  bClone.visible = false;
                  return { clone: bClone, relX: b.x - comp.x, relY: b.y - comp.y, idx: i };
                });

              // Clona item number e move para página
              const numBadgeNode = (Array.from(oldImgFr.children as SceneNode[]) as SceneNode[])
                .find(n => n.name === '[dsc-h] Item Number' && isClosestToThis(n)) || null;
              let numClone: SceneNode | null = null;
              if (numBadgeNode) {
                numClone = (numBadgeNode as SceneNode).clone();
                figma.currentPage.appendChild(numClone);
                numClone.visible = false;
              }

              oldSRVarCapture.push({
                comp: compClone,
                origX: comp.x, origY: comp.y,
                badges: varBadges,
                numBadge: numClone
              });
            }
          }
        }

        handoffAtivo.remove();
        handoffAtivo = novaInstancia;
      } catch (e) {
        // Remove o novo template se já foi criado antes da falha (evita duplicata órfã na página)
        try { if (handoffAtivo !== novaInstancia && novaInstancia?.parent) novaInstancia.remove(); } catch (_) {}
        // Remove clones de seções e SR que foram jogados na página mas não foram restaurados
        for (const snap of oldSnapshots) {
          for (const c of snap.clones) { try { if (c.parent) c.remove(); } catch (_) {} }
        }
        for (const cap of oldSRVarCapture) {
          try { if (cap.comp.parent) cap.comp.remove(); } catch (_) {}
          for (const b of cap.badges) { try { if (b.clone.parent) b.clone.remove(); } catch (_) {} }
          try { if (cap.numBadge?.parent) cap.numBadge.remove(); } catch (_) {}
        }
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Não foi possível substituir o template antigo. Verifique se a biblioteca DSC está conectada ao arquivo.' });
        return;
      }
    }

    // Cache de variáveis Figma (usado 3x para WCAG contrast)
    const figmaVarsGlobal = (figma as any).variables;
    const allVarsGlobal: any[] = figmaVarsGlobal ? await figmaVarsGlobal.getLocalVariablesAsync() : [];

    // --- LÓGICA DE DETACH ---
    const wasGenerated = isHandoffGenerated;
    const workingFrame = ensureHandoffDetached();

    // --- Restaura seções do handoff antigo que não devem ser atualizadas ---
    // Para cada seção desmarcada: substitui a seção vazia do novo template pelo clone do antigo.
    for (const snapshot of oldSnapshots) {
      const isKM = snapshot.sectionName === 'keyboard maping';
      const newSections: SceneNode[] = isKM
        ? workingFrame.findAll((n: SceneNode) => n.name === 'keyboard maping') as SceneNode[]
        : [workingFrame.findOne((n: SceneNode) => n.name === snapshot.sectionName) as SceneNode | null].filter(Boolean) as SceneNode[];

      const maxLen = Math.max(snapshot.clones.length, newSections.length);
      for (let i = 0; i < maxLen; i++) {
        const clone  = snapshot.clones[i];
        const newSec = newSections[i];
        if (clone && newSec) {
          const parent   = newSec.parent as any;
          const children = Array.from(parent.children as SceneNode[]);
          const idx      = children.indexOf(newSec);
          if (idx >= 0) parent.insertChild(idx, clone); else parent.appendChild(clone);
          newSec.remove();
        } else if (newSec) {
          newSec.remove();                        // mais seções no novo do que no antigo
        } else if (clone) {
          workingFrame.appendChild(clone);        // mais seções no antigo do que no novo
        }
        if (clone) clone.visible = true;
      }
    }

    // --- PARTE A: LOGICA VISUAL (ESCREVER NAS TABELAS) ---
    // Procuramos o Nome do Componente dentro do workingFrame
    if (msg.runTitulo !== false) {
      const compNameNode = workingFrame.findOne((n: SceneNode) => n.name === "Component Name" && n.type === "TEXT") as TextNode;
      if (compNameNode) {
        await updateText(compNameNode, msg.componentName || componentePrincipalAtivo?.name || "Componente");
      }
    }

    // Localizamos os containers das tabelas
    const allTableContainers = workingFrame.findAll((n: SceneNode) => n.name === "keyboard maping") as FrameNode[];

    const fillTable = async (container: FrameNode, data: any[]) => {
      const tableWrapper = container.findOne((n: SceneNode) => n.name === "table") as FrameNode;
      if (!tableWrapper) return;

      const isDataRow = (n: SceneNode) =>
        (n as any).children &&
        Array.from((n as any).children as SceneNode[]).some((c: SceneNode) => c.name.includes('Table Cell'));

      // 1. Nome "Row" (template fresco)
      // 2. [dsc doc] Doc Table com Table Cell (template novo via swap)
      // 3. Qualquer instance/frame com 2+ TextNodes exceto cabeçalho (handoff antigo)
      const rowModel = (
        Array.from(tableWrapper.children).find((n) => n.name === "Row")
        ?? Array.from(tableWrapper.children).find((n) => n.type === 'INSTANCE' && isDataRow(n))
        ?? Array.from(tableWrapper.children).find((n) =>
          (n.type === 'INSTANCE' || n.type === 'FRAME') &&
          ((n as any).findAll?.((c: SceneNode) => c.type === 'TEXT') as TextNode[] ?? []).length >= 2
        )
      ) as InstanceNode | undefined;
      if (!rowModel) {
        console.error("Não encontrei a camada 'Row' dentro de 'table'");
        return;
      }

      // Remove linhas de dados anteriores, preservando o modelo e o cabeçalho
      Array.from(tableWrapper.children)
        .filter(n => {
          if (n === rowModel) return false;
          if (n.name !== rowModel.name) return false;
          if (rowModel.name !== 'Row') return isDataRow(n);
          return true;
        })
        .forEach(n => n.remove());

      if (data.length === 0) return;

      for (const item of data) {
        const newRow = rowModel.clone();
        newRow.visible = true; // garante visibilidade caso o modelo esteja oculto
        tableWrapper.appendChild(newRow);

        // Percorre por coluna (filho direto do row) para evitar índice errado quando
        // células têm número de text nodes diferente (ex: linha de gesto tem 4 nodes, teclado tem 3)
        const columns = Array.from((newRow as any).children || []) as SceneNode[];
        let mapText: TextNode | null = null;
        let descText: TextNode | null = null;
        if (columns.length >= 2) {
          const col0Texts = (columns[0] as any).findAll?.((n: SceneNode) => n.type === 'TEXT') as TextNode[] ?? [];
          const col1Texts = (columns[1] as any).findAll?.((n: SceneNode) => n.type === 'TEXT') as TextNode[] ?? [];
          mapText  = col0Texts[0] || null;
          descText = col1Texts[0] || null;
        } else {
          const textNodes = newRow.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
          mapText  = textNodes[0] || null;
          descText = textNodes[1] || null;
        }
        if (mapText) {
          const textoLimpo = item.mapeamento
            .replace(/\s*\(unitário\)/gi, '')
            .replace(/\s*\(em sequência\)/gi, '');
          await updateText(mapText, textoLimpo);
        }
        if (descText) await updateText(descText, item.descricao);
      }

      // Oculta o modelo em vez de deletar — permite updates futuros
      rowModel.visible = false;
    };

    if (msg.runMapeamento !== false) {
      figma.ui.postMessage({ type: 'feedback', message: `⏳ ${wasGenerated ? 'Atualizando' : 'Gerando'} tabelas...` });
      const keyboardItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("teclado"));
      const gestureItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("gesto"));
      figma.ui.postMessage({ type: 'feedback', message: `⏳ ${wasGenerated ? 'Atualizando' : 'Gerando'} tabela de teclado...` });
      if (msg.sem_teclado) {
        if (allTableContainers.length >= 1) allTableContainers[0].visible = false;
      } else {
        if (allTableContainers.length >= 1) await fillTable(allTableContainers[0], keyboardItems);
      }
      figma.ui.postMessage({ type: 'feedback', message: `⏳ ${wasGenerated ? 'Atualizando' : 'Gerando'} tabela de gestos...` });
      if (msg.sem_gesto) {
        if (allTableContainers.length >= 2) allTableContainers[1].visible = false;
      } else {
        if (allTableContainers.length >= 2) await fillTable(allTableContainers[1], gestureItems);
      }
      }

    // --- PARTE B: LOGICA DE DADOS (SALVAR NO PLUGIN DATA) ---
    
    // --- ÁREA DE TOQUE (NOVO) ---
    if (msg.runTouch !== false) {
      const todasAsAreas: any[] = [];
    if (msg.variacoes && msg.variacoes.length > 0) {
      for (let varIdx = 0; varIdx < msg.variacoes.length; varIdx++) {
        const v = msg.variacoes[varIdx];
        if (!v.sem_toque && Array.isArray(v.areas_toque)) {
          for (let aIdx = 0; aIdx < v.areas_toque.length; aIdx++) {
            todasAsAreas.push({ ...v.areas_toque[aIdx], _varPrefix: varIdx + 1, _localIdx: aIdx + 1 });
          }
        }
      }
    } else if (Array.isArray(msg.areas_toque)) {
      todasAsAreas.push(...(msg.areas_toque as any[]).map((a: any, i: number) => ({ ...a, _varPrefix: 1, _localIdx: i + 1 })));
    }

    if (todasAsAreas.length > 0) {
      const targetArea = workingFrame.findOne((n: SceneNode) => n.name === 'target area') as FrameNode;
      if (targetArea) {
        const specs = targetArea.findOne((n: SceneNode) => n.name === 'specs') as FrameNode;
        if (specs) {
          const rowModel = Array.from(specs.children).find(n => n.name === 'element') as FrameNode | undefined;
          if (rowModel) {
            Array.from(specs.children).filter(n => n !== rowModel).forEach(n => n.remove());
            for (let i = 0; i < todasAsAreas.length; i++) {
              const area = todasAsAreas[i];
              const row = rowModel.clone();
              row.visible = true;
              specs.appendChild(row);
              const nameInst = row.findOne((n: SceneNode) => n.name === 'Element name') as InstanceNode | null;
              if (nameInst) {
                const allTexts = nameInst.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                const badgeLabel = `${area._varPrefix ?? 1}.${area._localIdx ?? (i + 1)}`;
                const nomeDisplay = (area.nome as string).replace(/\s+\d+$/, '');
                for (const t of allTexts) {
                  if (t.characters === 'Elemento') await updateText(t, nomeDisplay);
                  else if (/^[\d.]+$/.test(t.characters.trim())) await updateText(t, badgeLabel);
                }
              }
              const codes = Array.from(row.children).filter(n => n.name === 'code') as FrameNode[];
              const { hStr, wStr } = area.preset === 'livre'
                ? { hStr: `${area.height}px`, wStr: `${area.width}px` }
                : getTouchDimensions(area.preset);
              if (codes[0]) {
                const valueInst0 = codes[0].findOne((n: SceneNode) => n.name === 'value') as InstanceNode | null;
                if (valueInst0) {
                  const v = valueInst0.findOne((n: SceneNode) => n.type === 'TEXT') as TextNode | null;
                  if (v) await updateText(v, hStr);
                }
              }
              if (codes[1]) {
                const valueInst1 = codes[1].findOne((n: SceneNode) => n.name === 'value') as InstanceNode | null;
                if (valueInst1) {
                  const v = valueInst1.findOne((n: SceneNode) => n.type === 'TEXT') as TextNode | null;
                  if (v) await updateText(v, wStr);
                }
              }
            }
            rowModel.visible = false;
          }
        }
      }
    }
    }

        figma.ui.postMessage({ type: 'feedback', message: `⏳ ${wasGenerated ? 'Atualizando' : 'Gerando'} preview de área de toque...` });
        // --- PREENCHER IMAGE (PREVIEW) ---
        if (msg.runTouch !== false) {
          const variacoes: any[] = msg.variacoes || [];

          let imageFrame = workingFrame.findOne((n: SceneNode) =>
            n.name === 'image' &&
            n.parent?.name !== 'screen reader' &&
            (n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'COMPONENT' || n.type === 'INSTANCE')
          ) as FrameNode | InstanceNode | null;

          if (imageFrame && componentePrincipalAtivo) {
            if (imageFrame.type === 'INSTANCE') imageFrame = imageFrame.detachInstance();

            const modelHandoffAreas = (Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch areas')
              ?? (imageFrame as FrameNode).findOne(n => n.name === '[a11y] Touch areas')) as InstanceNode | undefined;
            const modelItemNumber = (Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch Area Connector')
              ?? (imageFrame as FrameNode).findOne(n => n.name === '[a11y] Touch Area Connector')) as InstanceNode | undefined;
            if (modelHandoffAreas) modelHandoffAreas.visible = false;
            if (modelItemNumber) modelItemNumber.visible = false;

            try { await applyWcagBackground(imageFrame as FrameNode, componentePrincipalAtivo, allVarsGlobal); } catch (e) {
              figma.ui.postMessage({ type: 'feedback', message: `❌ Erro no bloco de cor: ${e}` });
            }

            // Garante instâncias lado a lado: cria se faltar, reposiciona se sobreposta.
            // Dois passes: (1) coleta/cria instâncias; (2) posiciona e recria overlays se necessário.
            const PAD_LEFT_RH = 160, PAD_TOP_RH = 80, GAP_H_RH = 140;
            type RhVarEntry = { variacao: any; varId: string; inst: SceneNode };
            const rhEntries: RhVarEntry[] = [];

            // Passe 1: coleta ou cria instâncias (sem posicionar ainda)
            for (const variacao of variacoes) {
              if (variacao.sem_toque || !variacao.areas_toque || variacao.areas_toque.length === 0) continue;
              const varId: string = variacao.id;
              let inst = Array.from(imageFrame.children).find(n => {
                try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'variation-component' && d.variationId === varId; } catch { return false; }
              }) as SceneNode | null;
              if (!inst) {
                inst = createComponentInstance(componentePrincipalAtivo) as InstanceNode;
                if (variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                  try { (inst as any).setProperties(variacao.propriedades); } catch(_e) {}
                }
                imageFrame.appendChild(inst);
                inst.setPluginData('a11y-meta', JSON.stringify({ type: 'variation-component', variationId: varId }));
              }
              rhEntries.push({ variacao, varId, inst });
            }

            // Passe 2: posiciona instâncias lado a lado; move ou cria overlays/badges
            let rhNextX = PAD_LEFT_RH;
            for (let ei = 0; ei < rhEntries.length; ei++) {
              const { variacao, varId, inst } = rhEntries[ei];
              const recrPrefix = variacoes.indexOf(variacao) + 1;
              const instW = (inst as any).width, instH = (inst as any).height;
              const targetX = rhNextX, targetY = PAD_TOP_RH;

              (inst as any).x = targetX;
              (inst as any).y = targetY;
              imageFrame.resize(
                Math.max((imageFrame as FrameNode).width, targetX + instW + 24),
                Math.max((imageFrame as FrameNode).height, PAD_TOP_RH + instH + 40)
              );

              // Sempre recria overlays e badges para garantir posicionamento consistente.
              Array.from(imageFrame.children)
                .filter(n => {
                  try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}');
                    return (d.type === 'touch-overlay' || d.type === 'touch-badge') && d.variationId === varId;
                  } catch { return false; }
                })
                .forEach(n => n.remove());
              const areas: any[] = variacao.areas_toque || [];
              for (let areaIdx = 0; areaIdx < areas.length; areaIdx++) {
                const area = areas[areaIdx];
                if (!modelHandoffAreas) continue;
                const areaClone = (modelHandoffAreas as InstanceNode).clone();
                areaClone.visible = true;
                try { areaClone.resize(area.width, area.height); } catch(_e) {}
                areaClone.x = targetX + (area.relX || 0);
                areaClone.y = targetY + (area.relY || 0);
                imageFrame.appendChild(areaClone);
                areaClone.setPluginData('a11y-meta', JSON.stringify({ type: 'touch-overlay', variationId: varId, nome: area.nome, index: areaIdx, variationPrefix: recrPrefix }));
                if (modelItemNumber) {
                  const numClone = (modelItemNumber as InstanceNode).clone();
                  numClone.visible = true;
                  // Badge sempre à esquerda do overlay com conector apontando para direita.
                  // Ignora badgeOffsetX salvo — pode estar incorreto se instâncias foram movidas.
                  if (area.badgeProps && Object.keys(area.badgeProps).length > 0) {
                    try { (numClone as any).setProperties({ ...area.badgeProps, 'conector': 'direita' }); } catch(_e) {}
                  } else {
                    try { (numClone as any).setProperties({ 'conector': 'direita' }); } catch(_e) {}
                  }
                  if (area.badgeWidth > 0 && area.badgeHeight > 0) {
                    try { numClone.resize(area.badgeWidth, area.badgeHeight); } catch(_e) {}
                  }
                  numClone.x = areaClone.x - (numClone as any).width;
                  numClone.y = areaClone.y + Math.round(area.height / 2) - Math.round((numClone as any).height / 2);
                  imageFrame.appendChild(numClone);
                  numClone.setPluginData('a11y-meta', JSON.stringify({ type: 'touch-badge', variationId: varId, nome: area.nome, index: areaIdx, variationPrefix: recrPrefix }));
                  const numTexts = (numClone as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                  const numText = numTexts.find((n: TextNode) => /^[\d.]+$/.test(n.characters.trim())) || numTexts[0];
                  if (numText) await updateText(numText as TextNode, `${recrPrefix}.${areaIdx + 1}`);
                }
              }

              rhNextX = targetX + instW + GAP_H_RH;
            }

            // Re-numerar badges por variação com formato X.Y (X = índice da variação, Y = área local)
            for (let varIdx = 0; varIdx < variacoes.length; varIdx++) {
              const variacao = variacoes[varIdx];
              if (variacao.sem_toque || !variacao.areas_toque || variacao.areas_toque.length === 0) continue;
              const varId = variacao.id;
              const varPrefix = varIdx + 1;
              const badges = Array.from(imageFrame.children).filter(n => {
                try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'touch-badge' && d.variationId === varId; } catch { return false; }
              }).sort((a, b) => {
                const da = JSON.parse(a.getPluginData('a11y-meta') || '{}');
                const db = JSON.parse(b.getPluginData('a11y-meta') || '{}');
                return (da.index || 0) - (db.index || 0);
              });
              for (let localIdx = 0; localIdx < badges.length; localIdx++) {
                const badge = badges[localIdx];
                const numTexts = (badge as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                const numText = numTexts.find((n: TextNode) => /^[\d.]+$/.test(n.characters.trim())) || numTexts[0];
                if (numText) await updateText(numText as TextNode, `${varPrefix}.${localIdx + 1}`);
              }
            }

            // Redimensionar imageFrame com base nas instâncias presentes
            const allVarInstances = Array.from(imageFrame.children).filter(n => {
              try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'variation-component'; } catch { return false; }
            }) as SceneNode[];
            if (allVarInstances.length > 0) {
              const maxRight  = Math.max(...allVarInstances.map(n => (n as any).x + (n as any).width));
              const maxBottom = Math.max(...allVarInstances.map(n => (n as any).y + (n as any).height));
              imageFrame.resize(
                Math.max((imageFrame as FrameNode).width, maxRight + 24),
                Math.max(maxBottom + 24, 80)
              );
            }
          }
        }

    figma.ui.postMessage({ type: 'feedback', message: `⏳ ${wasGenerated ? 'Atualizando' : 'Gerando'} preview de tabulação...` });
    // --- FOCUS ORDER: VISUAL NO TEMPLATE (VARIAÇÕES DE TABULAÇÃO) ---
    const variacoesTab: any[] = msg.variacoes_tabulacao || [];
    const variacoesTabComItems = variacoesTab.filter((v: any) => !v.sem_tabulacao && v.tab_order && v.tab_order.length > 0);
    if (msg.runTab !== false && variacoesTabComItems.length > 0 && componentePrincipalAtivo) {
      // Busca apenas filhos diretos do workingFrame para evitar pegar 'focus order' aninhado na legenda
      const focusOrderContainer = Array.from(workingFrame.children).find(n => n.name === 'focus order') as FrameNode | null;
      if (focusOrderContainer) {
        // Busca apenas filhos diretos do focusOrderContainer para evitar 'image' aninhado em [a11y] Legenda
        const tabImageFrame = Array.from(focusOrderContainer.children).find(n => n.name === 'image') as FrameNode | null;
        if (tabImageFrame) {
          const modelOrder      = Array.from(tabImageFrame.children).find(n => n.name === '[a11y] Order')        as InstanceNode | undefined;
          const modelItemNumber = Array.from(tabImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;

          // Mantém modelos, tag e instâncias de variação; remove badges e markers antigos
          const tagNodeTab = Array.from(tabImageFrame.children).find(n => n.name === 'tag');
          Array.from(tabImageFrame.children).filter(n => {
            if (n === tagNodeTab || n === modelOrder || n === modelItemNumber) return false;
            try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); if (d.type === 'tab-variation-component') return false; } catch { }
            return true;
          }).forEach(n => n.remove());
          clearVariationMarkers(tabImageFrame);

          // Ajuste WCAG de contraste do fundo
          try { await applyWcagBackground(tabImageFrame, componentePrincipalAtivo, allVarsGlobal); } catch (e) {
            figma.ui.postMessage({ type: 'feedback', message: `❌ Erro no bloco de cor (focus order): ${e}` });
          }

          const TAB_PAD_TOP  = 64;
          const TAB_PAD_LEFT = 160;
          const TAB_PAD_SIDE = 24;
          const TAB_GAP_H    = 140;
          const TAB_GAP_V    = 60;
          const TAB_MAX_WIDTH = Math.max(tabImageFrame.width, 800);

          let currentX = TAB_PAD_LEFT;
          let currentY = TAB_PAD_TOP;
          let rowHeight = 0;
          let globalItemCounter = 0;
          let totalWidth = TAB_PAD_LEFT;
          let totalHeight = TAB_PAD_TOP;

          for (const variacao of variacoesTabComItems) {
            // Reutiliza instância já presente no tabImageFrame (nova arquitetura)
            let compClone: SceneNode | null = Array.from(tabImageFrame.children).find(n => {
              try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'tab-variation-component' && d.variationId === variacao.id; } catch { return false; }
            }) as SceneNode | null;
            if (!compClone) {
              compClone = createComponentInstance(componentePrincipalAtivo);
              if (variacao.id === 'default') {
                if (compClone.type === 'INSTANCE') { try { (compClone as InstanceNode).setProperties({ size: 'Small' }); } catch (_) {} }
              } else if (variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                if (compClone.type === 'INSTANCE') { try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch (_) {} }
              }
              tabImageFrame.appendChild(compClone);
              compClone.setPluginData('a11y-meta', JSON.stringify({ type: 'tab-variation-component', variationId: variacao.id }));
            }

            // Verificar se precisa quebrar linha
            if (currentX > TAB_PAD_LEFT && currentX + compClone.width > TAB_MAX_WIDTH) {
              currentX = TAB_PAD_LEFT;
              currentY += rowHeight + TAB_GAP_V;
              rowHeight = 0;
            }

            compClone.x = currentX;
            compClone.y = currentY;

            // [dsc-h] Item Number: 1 por instância do componente (global), connector 'off'
            globalItemCounter++;
            if (modelItemNumber) {
              const numClone = modelItemNumber.clone();
              numClone.visible = true;
              const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
              const numText = numTexts.find(n => /^\d+$/.test((n as TextNode).characters.trim())) || numTexts[0] || null;
              if (numText) await updateText(numText as TextNode, String(globalItemCounter));
              numClone.x = currentX;
              numClone.y = currentY - numClone.height - 4;
              tabImageFrame.appendChild(numClone);
              if (numClone.type === 'INSTANCE') {
                try { (numClone as InstanceNode).setProperties({ 'connector': 'Off' }); } catch (e) {}
              }
            }

            // [a11y] Order: por item de tabulação, reinicia em 1 para cada variação
            const tabItems: any[] = variacao.tab_order || [];
            for (let i = 0; i < tabItems.length; i++) {
              const item = tabItems[i];
              if (modelOrder) {
                const orderClone = modelOrder.clone();
                orderClone.visible = true;
                const numText = orderClone.findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
                if (numText) await updateText(numText, String(i + 1));
                // Canto superior direito do item, clampado dentro do compClone
                const rawOrderX = currentX + item.relX + item.width - orderClone.width;
                const rawOrderY = currentY + item.relY + 4;
                orderClone.x = Math.max(currentX, Math.min(rawOrderX, currentX + compClone.width - orderClone.width));
                orderClone.y = Math.max(currentY, Math.min(rawOrderY, currentY + (compClone as FrameNode).height - orderClone.height));
                tabImageFrame.appendChild(orderClone);
              }
            }

            rowHeight = Math.max(rowHeight, compClone.height);
            totalWidth = Math.max(totalWidth, currentX + compClone.width);
            currentX += compClone.width + TAB_GAP_H;
          }

          totalHeight = currentY + rowHeight;
          tabImageFrame.resize(
            Math.max(tabImageFrame.width, totalWidth + TAB_PAD_SIDE),
            totalHeight + TAB_PAD_SIDE
          );
          if (modelOrder)      modelOrder.visible      = false;
          if (modelItemNumber) modelItemNumber.visible = false;

        }
      }
    }

        figma.ui.postMessage({ type: 'feedback', message: `⏳ ${wasGenerated ? 'Atualizando' : 'Gerando'} preview de leitor de tela...` });
        // --- LEITOR DE TELA: PREVIEW ---
        const variacoesLT: any[] = msg.variacoes_leitor || [];
        const variacoesLTComItems = variacoesLT.filter((v: any) => !v.sem_leitor && v.conectores_leitor && v.conectores_leitor.length > 0);

        // Moved debug message, without specific reference to 'modelAgrupamento' as it is not yet in scope.

        
        if (msg.runLeitor !== false && variacoesLTComItems.length > 0 && componentePrincipalAtivo) {
          const srSection = Array.from(workingFrame.children).find((n: SceneNode) => n.name === 'screen reader') as FrameNode | null;
          if (srSection) {
            const srImageFrame = Array.from(srSection.children).find((n: SceneNode) => n.name === 'image') as FrameNode | null;
            if (srImageFrame) {
              const modelConector    = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Screen Reader Conector')   as InstanceNode | undefined;
              const modelAgrupamento = srImageFrame.findOne(n => n.name === '[a11y] Screen Reader Gruping')  as InstanceNode | undefined;
              const modelItemNumber  = Array.from(srImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;
              const tagSR            = Array.from(srImageFrame.children).find(n => n.name === 'tag');

              // Helper: encontrar o filho direto de srImageFrame que contém o node
              function getDirectChild(frame: FrameNode, node: BaseNode): BaseNode | null {
                let current: BaseNode = node;
                while (current.parent && current.parent !== frame) {
                  current = current.parent;
                }
                return current.parent === frame ? current : null;
              }
              const srInstances = Array.from(srImageFrame.children).filter(n => {
                try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'sr-variation-component'; } catch { return false; }
              });
              const agrupamentoAncestor = modelAgrupamento ? getDirectChild(srImageFrame, modelAgrupamento) : null;
              const keepSR = new Set<BaseNode>([tagSR, modelConector, agrupamentoAncestor ?? modelAgrupamento, modelItemNumber, ...srInstances].filter(Boolean) as BaseNode[]);
              Array.from(srImageFrame.children).filter(n => !keepSR.has(n)).forEach(n => n.remove());
              clearVariationMarkers(srImageFrame);
              const itemNumH = modelItemNumber ? modelItemNumber.height : 36;

              srImageFrame.clipsContent = false;

              // WCAG contrast check
              try { await applyWcagBackground(srImageFrame, componentePrincipalAtivo, allVarsGlobal); } catch (e) {
                figma.ui.postMessage({ type: 'feedback', message: `❌ Erro no bloco de cor (leitor preview): ${e}` });
              }

              const SR_PAD_TOP  = 120;
              const SR_PAD_LEFT = 160;
              const SR_PAD_SIDE = 60; // aumentado para badges que extrapolam altura do componente
              const SR_GAP_H    = 140;
              const SR_GAP_V    = 60;
              const SR_MAX_WIDTH = Math.max(srImageFrame.width, 800);

              let currentX = SR_PAD_LEFT;
              let currentY = SR_PAD_TOP;
              let rowHeight = 0;
              let globalItemCounter = 0;
              let totalWidth = SR_PAD_LEFT;
              let totalHeight = SR_PAD_TOP;
              let migrVarIdx = 0; // índice na oldSRVarCapture para variações de migração

              for (const variacao of variacoesLTComItems) {
                const conectoresVar = variacao.conectores_leitor || [];
                const isMigration = isOldHandoff && conectoresVar.length > 0 &&
                  conectoresVar.every((c: any) => c.origem === 'migração' || c.origem === 'migração-sem-match');
                const oldCapture = (isMigration && oldSRVarCapture[migrVarIdx]) ? oldSRVarCapture[migrVarIdx] : null;
                if (isMigration) migrVarIdx++;

                if (oldCapture) {
                  // ── Variação de migração: reutiliza nós do handoff antigo ──
                  const oldCompW = (oldCapture.comp as any).width  || componentePrincipalAtivo.width;
                  const oldCompH = (oldCapture.comp as any).height || componentePrincipalAtivo.height;
                  if (currentX > SR_PAD_LEFT && currentX + oldCompW > SR_MAX_WIDTH) {
                    currentX = SR_PAD_LEFT; currentY += rowHeight + SR_GAP_V; rowHeight = 0;
                  }
                  // Inserir primeiro no frame, depois setar x,y (coordenadas relativas ao frame pai)
                  srImageFrame.insertChild(0, oldCapture.comp);
                  oldCapture.comp.x = currentX;
                  oldCapture.comp.y = currentY;
                  oldCapture.comp.visible = true;

                  globalItemCounter++;
                  const numNode = oldCapture.numBadge ?? (modelItemNumber ? modelItemNumber.clone() : null);
                  if (numNode) {
                    srImageFrame.appendChild(numNode);
                    const numTxts = (numNode as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                    const numTxt = numTxts.find(n => /^\d+$/.test(n.characters.trim())) || numTxts[0] || null;
                    if (numTxt) await updateText(numTxt, String(globalItemCounter));
                    numNode.x = currentX;
                    numNode.y = currentY - numNode.height - 4;
                    numNode.visible = true;
                    try { (numNode as any).setProperties({ 'connector': 'Off' }); } catch(e) {}
                  }

                  // Filtra badges: inclui os que não foram excluídos (por migrBadgeIdx)
                  const keepIdxs = new Set(conectoresVar
                    .filter((c: any) => c.migrBadgeIdx != null && c.migrBadgeIdx >= 0)
                    .map((c: any) => c.migrBadgeIdx));
                  const hasIdxData = keepIdxs.size > 0;
                  for (const bd of oldCapture.badges) {
                    if (hasIdxData && !keepIdxs.has(bd.idx)) continue;
                    srImageFrame.appendChild(bd.clone);
                    bd.clone.x = currentX + bd.relX;
                    bd.clone.y = currentY + bd.relY;
                    bd.clone.visible = true;
                  }

                  rowHeight = Math.max(rowHeight, oldCompH);
                  totalWidth = Math.max(totalWidth, currentX + oldCompW);
                  currentX += oldCompW + SR_GAP_H;
                  continue; // pula a geração normal
                }

                // ── Variação nova ou instância já no srImageFrame (nova arquitetura) ──
                let compClone: SceneNode | null = Array.from(srImageFrame.children).find(n => {
                  try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'sr-variation-component' && d.variationId === variacao.id; } catch { return false; }
                }) as SceneNode | null;
                if (!compClone) {
                  compClone = createComponentInstance(componentePrincipalAtivo);
                  if (variacao.id !== 'default' && variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                    if (compClone.type === 'INSTANCE') {
                      try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch (e) {
                        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Variante SR não aplicada: ' + String(e) });
                      }
                    }
                  }
                  srImageFrame.insertChild(0, compClone);
                  compClone.setPluginData('a11y-meta', JSON.stringify({ type: 'sr-variation-component', variationId: variacao.id }));
                }

                // Verificar se precisa quebrar linha
                if (currentX > SR_PAD_LEFT && currentX + compClone.width > SR_MAX_WIDTH) {
                  currentX = SR_PAD_LEFT;
                  currentY += rowHeight + SR_GAP_V;
                  rowHeight = 0;
                }

                compClone.x = currentX;
                compClone.y = currentY;

                // [dsc-h] Item Number: 1 por instância do componente (global), connector 'off'
                globalItemCounter++;
                if (modelItemNumber) {
                  const numClone = modelItemNumber.clone();
                  numClone.visible = true;
                  const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                  const numText = numTexts.find(n => /^\d+$/.test((n as TextNode).characters.trim())) || numTexts[0] || null;
                  if (numText) await updateText(numText as TextNode, String(globalItemCounter));
                  numClone.x = currentX;
                  numClone.y = currentY - numClone.height - 4;
                  srImageFrame.appendChild(numClone);
                  if (numClone.type === 'INSTANCE') {
                    try { (numClone as InstanceNode).setProperties({ 'connector': 'Off' }); } catch (e) {}
                  }
                }

                // Conectores e agrupamentos sobre o componente
                const conectores = variacao.conectores_leitor || [];
                const letrasLT = computeLetrasTS(conectores);
                const compW = (compClone as FrameNode).width  || componentePrincipalAtivo.width;
                const compH = (compClone as FrameNode).height || componentePrincipalAtivo.height;

                for (let i = 0; i < conectores.length; i++) {
                  let c = conectores[i];
                  const letra = letrasLT[i];

                  // Fallback para conectores sem dados de posição (migrados do formato antigo)
                  if (!('relX' in c) && !('relY' in c)) {
                    const N = conectores.length;
                    const spacing = compH / (N + 1);
                    c = { ...c, relX: 0, relY: Math.round(spacing * (i + 1) - 10), width: 20, height: 20 };
                  }

                  if (c.tipoAnotacao === 'agrupamento' && modelAgrupamento) {
                    const agClone = modelAgrupamento.clone();
                    agClone.visible = true;
                    const agRelX = c.relX || 0;
                    const agRelY = c.relY || 0;
                    const agW = c.width || 80;
                    const agH = c.height || 40;
                    agClone.resize(agW, agH);
                    srImageFrame.appendChild(agClone);
                    agClone.x = currentX + agRelX;
                    agClone.y = currentY + agRelY;
                    let orientacao: string = (c as any).orientacao || '';
                    if (!orientacao) {
                      const _agRHRX   = (c.relX || 0) + (c.width  || 80);
                      const _agRHBot  = (c.relY || 0) + (c.height || 40);
                      const _agRHRGap = compW - _agRHRX;
                      const _agRHVGap = compH - _agRHBot;
                      if      (_agRHRGap < (c.width  || 80) * 0.15) orientacao = 'direita';
                      else if (_agRHVGap < (c.height || 40) * 0.15) orientacao = 'inferior';
                      else orientacao = (_agRHRX - (c.width || 80) / 2) < compW / 2 ? 'esquerda' : 'direita';
                    }
                    const _agT = (c.tipo || c.tipoConnector || '').toLowerCase();
                    let _agTipo = 'função valor rótulos';
                    if (_agT.includes('decorat'))                                                                        _agTipo = 'elementos decorativos';
                    else if (_agT.includes('marco') || _agT.includes('naveg'))                                           _agTipo = 'marcos de navegação';
                    else if (_agT.includes('título') || _agT.includes('titulo') || _agT.includes('nível') || _agT.includes('nivel')) _agTipo = 'nível de título';
                    else if (_agT.includes('infor') || _agT.includes('adicional'))                                       _agTipo = 'informações adicionais';
                    try { agClone.setProperties({ 'tipo': _agTipo, 'orientação': orientacao }); } catch(e) {
                      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Agrupamento props não aplicadas: ' + String(e) });
                    }
                    if (_agTipo === 'nível de título' && c.especificacao) {
                      const _agRHKeys = Object.keys(agClone.componentProperties || {});
                      const _agRHHKey = _agRHKeys.find(k => k.toLowerCase().includes('nível') || k.toLowerCase().includes('nivel') || k.toLowerCase().includes('título') || k.toLowerCase().includes('titulo') || k.toLowerCase().includes('heading'));
                      if (_agRHHKey) {
                        // Tenta minúsculo (ex: 'h3'); se falhar, tenta maiúsculo ('H3') — valor exato depende do componente
                        try { agClone.setProperties({ [_agRHHKey]: c.especificacao }); } catch(_e) {
                          try { agClone.setProperties({ [_agRHHKey]: c.especificacao.toUpperCase() }); } catch(_e2) { /* ignore */ }
                        }
                      }
                    }
                    const agTexts = agClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                    // Prioriza nó com padrão H1/H2/H3 (badge de heading), depois qualquer letra inicial
                    const agLetraTxt = agTexts.find(n => /^H\d+$/i.test(n.characters.trim()))
                      || agTexts.find(n => /^[A-Za-z✦]/.test(n.characters.trim()))
                      || agTexts[0] || null;
                    const _agRHBadge = _agTipo === 'nível de título' && c.especificacao ? c.especificacao : letra;
                    if (agLetraTxt) await updateText(agLetraTxt, _agRHBadge);
                  } else if (modelConector && c.tipoAnotacao !== 'agrupamento') {
                    const conClone = modelConector.clone();
                    conClone.visible = true;
                    srImageFrame.appendChild(conClone);
                    const t = (c.tipo || '').toLowerCase();
                    let tipoVariante = 'função valor rótulos';
                    if (t.includes('decorat'))                                                          tipoVariante = 'elementos decorativos';
                    else if (t.includes('marco') || t.includes('naveg'))                                tipoVariante = 'marcos de navegação';
                    else if (t.includes('título') || t.includes('titulo') || t.includes('heading') || t.includes('nível') || t.includes('nivel')) tipoVariante = 'nível de título';
                    else if (t.includes('infor') || t.includes('adicional'))                            tipoVariante = 'informações adicionais';

                    if ((c as any).positioned) {
                      const relX = c.relX || 0, relY = c.relY || 0;
                      const savedW = (c as any).width || conClone.width;
                      const savedH = (c as any).height || conClone.height;
                      let lado: string;
                      if      (relX + savedW <= 0)  lado = 'esquerda';
                      else if (relX >= compW)        lado = 'direita';
                      else if (relY + savedH <= 0)   lado = 'superior';
                      else if (relY >= compH)         lado = 'inferior';
                      else {
                        const dL = Math.abs(relX), dR = Math.abs(compW - relX - savedW);
                        const dT = Math.abs(relY), dB = Math.abs(compH - relY - savedH);
                        const minD = Math.min(dL, dR, dT, dB);
                        lado = minD === dL ? 'esquerda' : minD === dR ? 'direita' : minD === dT ? 'superior' : 'inferior';
                      }
                      try { (conClone as InstanceNode).setProperties({ 'tipo': tipoVariante, 'conector': lado }); } catch(e) {}
                      try { conClone.resize(savedW, savedH); } catch(e) {}
                      conClone.x = currentX + relX;
                      conClone.y = currentY + relY;
                    } else {
                      const distLeft   = c.relX || 0;
                      const distRight  = compW - ((c.relX || 0) + (c.width || 20));
                      const distTop    = c.relY || 0;
                      const distBottom = compH - ((c.relY || 0) + (c.height || 20));
                      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
                      const lado = minDist === distLeft   ? 'esquerda'
                                 : minDist === distRight  ? 'direita'
                                 : minDist === distTop    ? 'superior'
                                 : 'inferior';
                      try { (conClone as InstanceNode).setProperties({ 'tipo': tipoVariante, 'conector': lado }); } catch(e) {}
                      const BADGE_SIZE = 32, OUT_GAP = 8;
                      const relX = c.relX || 0, relY = c.relY || 0, elW = c.width || 0, elH = c.height || 0;
                      if (lado === 'esquerda') {
                        try { conClone.resize(BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + relX), conClone.height); } catch(e) {}
                        conClone.x = currentX - OUT_GAP - BADGE_SIZE;
                        conClone.y = currentY + relY + elH / 2 - conClone.height / 2;
                      } else if (lado === 'direita') {
                        try { conClone.resize(BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + (compW - relX - elW)), conClone.height); } catch(e) {}
                        conClone.x = currentX + relX + elW;
                        conClone.y = currentY + relY + elH / 2 - conClone.height / 2;
                      } else if (lado === 'superior') {
                        try { conClone.resize(conClone.width, BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + relY + itemNumH + 4)); } catch(e) {}
                        conClone.x = currentX + relX + elW / 2 - conClone.width / 2;
                        conClone.y = currentY - OUT_GAP - BADGE_SIZE - itemNumH - 4;
                      } else {
                        try { conClone.resize(conClone.width, BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + (compH - relY - elH))); } catch(e) {}
                        conClone.x = currentX + relX + elW / 2 - conClone.width / 2;
                        conClone.y = currentY + relY + elH;
                      }
                    }
                    if (tipoVariante === 'nível de título' && c.especificacao) {
                      const _rhKeys = Object.keys((conClone as any).componentProperties || {});
                      const _rhHKey = _rhKeys.find(k => k.toLowerCase().includes('nível') || k.toLowerCase().includes('nivel') || k.toLowerCase().includes('título') || k.toLowerCase().includes('titulo') || k.toLowerCase().includes('heading'));
                      if (_rhHKey) try { (conClone as InstanceNode).setProperties({ [_rhHKey]: c.especificacao }); } catch(_e) {}
                    }
                    const numNodeCon = conClone.findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
                    const _badgeValRH = tipoVariante === 'nível de título' && c.especificacao ? c.especificacao : letra;
                    if (numNodeCon) await updateText(numNodeCon, _badgeValRH);
                  }
                }

                rowHeight = Math.max(rowHeight, compClone.height);
                totalWidth = Math.max(totalWidth, currentX + compClone.width);
                currentX += compClone.width + SR_GAP_H;
              }

              totalHeight = currentY + rowHeight;
              srImageFrame.resize(
                Math.max(srImageFrame.width, totalWidth + SR_PAD_SIDE),
                totalHeight + SR_PAD_SIDE
              );

              if (modelConector)    modelConector.remove();
              const agToRemove = agrupamentoAncestor ?? modelAgrupamento;
              if (agToRemove) agToRemove.remove();
              if (modelItemNumber)  modelItemNumber.remove();
            }
          }
        }

    figma.ui.postMessage({ type: 'feedback', message: `⏳ ${wasGenerated ? 'Atualizando' : 'Gerando'} specs de leitor de tela...` });
    // --- LEITOR DE TELA: SPECS ---
    const variacoesLTSpecsAll: any[] = msg.variacoes_leitor || [];
    const variacoesLTSpecsComItems = variacoesLTSpecsAll.filter((v: any) => !v.sem_leitor && Array.isArray(v.conectores_leitor) && v.conectores_leitor.length > 0);

    if (msg.runLeitor !== false && variacoesLTSpecsComItems.length > 0) {
          const srSection = workingFrame.findOne((n: SceneNode) => n.name === 'screen reader') as FrameNode | null;
          if (srSection) {
            const allBoxes = srSection.findOne((n: SceneNode) => n.name === 'all boxes') as FrameNode | null;
            if (allBoxes) {
              const model = Array.from(allBoxes.children).find(n => n.name === '[a11y] Box specs LT') as FrameNode | undefined;
              if (model) {
                const isWeb    = (msg.plataformas as string[])?.includes('Web') ?? false;
                const isMobile = (msg.plataformas as string[])?.some((p: string) => ['Mobile iOS','Mobile Android','Mobile Cross-Platform'].includes(p)) ?? false;

                const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const hideIfEmpty = (cloneNode: FrameNode, fieldName: string, value: string) => {
                  const val = (value || '').trim().toUpperCase();
                  if (val === '' || val === 'NA') {
                    let frame = cloneNode.findOne((n: SceneNode) => n.name === fieldName) as FrameNode | null;
                    if (!frame) {
                      const normTarget = normalize(fieldName);
                      frame = cloneNode.findOne((n: SceneNode) => normalize(n.name) === normTarget) as FrameNode | null;
                    }
                    if (frame) frame.visible = false;
                  }
                };
                const fillField = async (cloneNode: FrameNode, fieldName: string, value: string) => {
                  if (!value || value.trim() === '' || value.trim().toUpperCase() === 'NA') return;
                  let frame = cloneNode.findOne((n: SceneNode) => n.name === fieldName) as FrameNode | null;
                  if (!frame) {
                    const normTarget = normalize(fieldName);
                    frame = cloneNode.findOne((n: SceneNode) => normalize(n.name) === normTarget) as FrameNode | null;
                  }
                  if (!frame) {

                    return;
                  }
                  const txt = frame.findOne((n: SceneNode) => n.name === 'Text' && n.type === 'TEXT') as TextNode | null;
                  if (!txt) return;
                  await updateText(txt, value);
                };

                const contentFrame = allBoxes.parent as FrameNode | null;
                // specsFrame é o pai de contentFrame (frame chamado 'specs')
                const specsFrame = contentFrame?.parent as FrameNode | null;

                // Remove clones de content de execuções anteriores (mantém contentFrame original)
                if (specsFrame && contentFrame) {
                  Array.from(specsFrame.children)
                    .filter(n => n !== contentFrame && n.name === contentFrame.name)
                    .forEach(n => n.remove());
                }

                for (let varIdx = 0; varIdx < variacoesLTSpecsComItems.length; varIdx++) {
                  const variacao = variacoesLTSpecsComItems[varIdx];

                  // varIdx=0: usa contentFrame/allBoxes/model originais
                  // varIdx>0: clona contentFrame e appenda em specsFrame
                  let curContentFrame: FrameNode | null = contentFrame;
                  let curAllBoxes: FrameNode = allBoxes;
                  let curModel: FrameNode | undefined = model;

                  if (varIdx > 0 && contentFrame && specsFrame) {
                    const contentClone = contentFrame.clone() as FrameNode;
                    specsFrame.appendChild(contentClone);
                    curContentFrame = contentClone;
                    curAllBoxes = contentClone.findOne((n: SceneNode) => n.name === 'all boxes') as FrameNode || curAllBoxes;
                    curModel = Array.from(curAllBoxes.children).find(n => n.name === '[a11y] Box specs LT') as FrameNode | undefined || curModel;
                  }

                  // Limpa boxes existentes (mantém modelo)
                  Array.from(curAllBoxes.children).filter(n => n !== curModel).forEach(n => n.remove());

                  const letras = computeLetrasTS(variacao.conectores_leitor);

                  // Preencher Element name no curContentFrame
                  const normalize2 = normalize; // alias para usar dentro da closure
                  const elementNameInFrame = curContentFrame?.findOne((n: SceneNode) =>
                    n.name === 'Element name' || normalize2(n.name) === 'element name'
                  ) as FrameNode | null;
                  if (elementNameInFrame && 'findOne' in elementNameInFrame) {
                    const enNumTxt = elementNameInFrame.findOne((n: SceneNode) =>
                      n.type === 'TEXT' && (n.name === 'Number' || normalize2(n.name) === 'number')
                    ) as TextNode | null;
                    if (enNumTxt) await updateText(enNumTxt, String(varIdx + 1));
                    const enTitleTxt = elementNameInFrame.findOne((n: SceneNode) =>
                      n.type === 'TEXT' && n.name !== 'Number' && normalize2(n.name) !== 'number'
                    ) as TextNode | null;
                    if (enTitleTxt) await updateText(enTitleTxt, variacao.nome || 'Default');
                  }

                  // Gerar boxes para conectores desta variação
                  for (let i = 0; i < variacao.conectores_leitor.length; i++) {
                    const c     = variacao.conectores_leitor[i];
                    const letra = letras[i];
                    const subs  = c.substituicoes || {};

                    const clone = (curModel || model).clone();
                    clone.visible = true;
                    curAllBoxes.appendChild(clone);

                    const tSpec = (c.tipo || '').toLowerCase();
                    const isHeadingSpec = tSpec.includes('título') || tSpec.includes('titulo') || tSpec.includes('heading') || tSpec.includes('nível') || tSpec.includes('nivel');
                    const badgeLabel = isHeadingSpec && c.especificacao ? c.especificacao : letra;

                    const conectorNode = clone.findOne((n: SceneNode) => n.name === '[a11y] Screen Reader Conector') as SceneNode | null;

                    // setProperties ANTES dos updateText para evitar reset de overrides
                    if (conectorNode && conectorNode.type === 'INSTANCE') {
                      const t = (c.tipo || '').toLowerCase();
                      let tipoVariante = 'função valor rótulos';
                      if (t.includes('decorat'))                                                                                                    tipoVariante = 'elementos decorativos';
                      else if (t.includes('marco') || t.includes('naveg'))                                                                          tipoVariante = 'marcos de navegação';
                      else if (t.includes('título') || t.includes('titulo') || t.includes('heading') || t.includes('nível') || t.includes('nivel')) tipoVariante = 'nível de título';
                      else if (t.includes('infor') || t.includes('adicional'))                                                                      tipoVariante = 'informações adicionais';
                      try { (conectorNode as InstanceNode).setProperties({ 'tipo': tipoVariante }); } catch(_e) {}
                    }

                    // Atualiza letra do role dentro do [a11y] Screen Reader Conector
                    const innerNumTxt = conectorNode && 'findOne' in conectorNode
                      ? (conectorNode as FrameNode).findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null
                      : null;
                    if (innerNumTxt) await updateText(innerNumTxt, badgeLabel);

                    // Atualiza número sequencial no campo externo (distinto do interno)
                    const allNumTxts = clone.findAll((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode[];
                    const outerNumTxt = allNumTxts.find(n => n !== innerNumTxt) || null;
                    if (outerNumTxt) await updateText(outerNumTxt as TextNode, String(i + 1));

                    await fillField(clone, 'Descrição', subs.descricao || c.descricao || '');

                    const obsVal = c.observacao || '';
                    hideIfEmpty(clone, 'Observacoes', obsVal);
                    await fillField(clone, 'Observacoes', obsVal);

                    const nomeAccVal = subs.nomeAcessivel || c.nomeAcessivel || '';
                    hideIfEmpty(clone, 'Nome Acessivel', nomeAccVal);
                    await fillField(clone, 'Nome Acessivel', nomeAccVal);

                    let notasFinal = '';
                    const web = c.codigoWeb || '';
                    const rn  = c.codigoRN  || '';
                    const webOk = web && web.toUpperCase() !== 'NA';
                    const rnOk  = rn  && rn.toUpperCase()  !== 'NA';
                    if (isWeb && isMobile) {
                      notasFinal = [(subs.codigoWeb || (webOk ? web : '')), (subs.codigoRN || (rnOk ? rn : ''))].filter(Boolean).join('\n');
                    } else if (isWeb) {
                      notasFinal = subs.codigoWeb || (webOk ? web : '');
                    } else if (isMobile) {
                      notasFinal = subs.codigoRN || (rnOk ? rn : '');
                    }
                    hideIfEmpty(clone, 'Notas', notasFinal);
                    await fillField(clone, 'Notas', notasFinal);
                  }

                  // FIX 4 — Auto layout do curAllBoxes (por variação)
                  curAllBoxes.layoutMode = 'VERTICAL';
                  curAllBoxes.primaryAxisSizingMode = 'AUTO';
                  curAllBoxes.itemSpacing = 16;
                  if (curModel) curModel.visible = false;
                }
              }
            }
          }
        }

    // --- ZOOM WCAG ---
    const zoomTypes: string[] = msg.zoom || [];
    if (msg.runZoom !== false && zoomTypes.length > 0 && componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⏳ Gerando preview de zoom...' });
      const zoomContainer = workingFrame.findOne((n: SceneNode) => n.name === 'zoom') as FrameNode | null;
      if (zoomContainer) {
        const zoomImageFrame = Array.from(zoomContainer.children).find(n => n.name === 'image') as FrameNode | null;
        if (zoomImageFrame) {
          
          const zoomTag = Array.from(zoomImageFrame.children).find(n => n.name === 'tag');
          const modelItemNumber = Array.from(zoomImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;

          const keepZoom = new Set<BaseNode>([zoomTag, modelItemNumber].filter(Boolean) as BaseNode[]);
          Array.from(zoomImageFrame.children).filter(n => !keepZoom.has(n)).forEach(n => n.remove());

          try { await applyWcagBackground(zoomImageFrame, componentePrincipalAtivo, allVarsGlobal); } catch (e) {
            figma.ui.postMessage({ type: 'feedback', message: `❌ Erro no bloco de cor (zoom): ${e}` });
          }

          const ZOOM_NUM_Y    = 80;  // y fixo do item number
          const ZOOM_GAP_NUM  = 8;   // gap entre item number e componente
          const ZOOM_PAD_LEFT = 40;
          const ZOOM_PAD_SIDE = 24;
          const ZOOM_GAP_H    = 80;
          let zoomCurrentX = ZOOM_PAD_LEFT;
          let zoomTotalWidth = 0; // mantido para tracking interno, largura do frame não é alterada
          let zoomMaxHeight = 0;
          let zoomCompY = ZOOM_NUM_Y; // calculado por iteração; último valor usado no resize

          const scaleMap: Record<string, number> = {
            '200% Texto (reflow)':      1,
            '200% Componente (scaling)': 2,
            '400% Componente (scaling)': 4,
          };

          for (let zi = 0; zi < zoomTypes.length; zi++) {
            const zType  = zoomTypes[zi];
            const scale  = scaleMap[zType] ?? 1;

            // Cria item number antes do componente para calcular compY dinamicamente
            let compY = ZOOM_NUM_Y;
            if (modelItemNumber) {
              const numClone = modelItemNumber.clone();
              numClone.visible = true;
              const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
              const numText = numTexts.find(n => /^\d+$/.test(n.characters.trim())) || numTexts[0] || null;
              if (numText) await updateText(numText, String(zi + 1));
              numClone.x = zoomCurrentX;
              numClone.y = ZOOM_NUM_Y;
              zoomImageFrame.appendChild(numClone);
              if (numClone.type === 'INSTANCE') {
                try { (numClone as InstanceNode).setProperties({ 'connector': 'Off' }); } catch (e) {}
              }
              compY = ZOOM_NUM_Y + numClone.height + ZOOM_GAP_NUM;
            }
            zoomCompY = compY;

            const compClone = createComponentInstance(componentePrincipalAtivo) as FrameNode & SceneNode;
            compClone.x = zoomCurrentX;
            compClone.y = compY;
            zoomImageFrame.insertChild(0, compClone);
            if (zType === '200% Texto (reflow)') {
              // Escala apenas os nós de texto 2x — clone já inserido no frame para referências válidas após await
              const textNodes = compClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
              const fontsToLoad = new Set<string>();
              for (const tn of textNodes) {
                const f = tn.fontName;
                if (f !== figma.mixed) fontsToLoad.add(`${f.family}::${f.style}`);
              }
              await Promise.all(Array.from(fontsToLoad).map(k => {
                const [family, style] = k.split('::');
                return figma.loadFontAsync({ family, style });
              }));
              for (const tn of textNodes) {
                try {
                  const fs = tn.fontSize;
                  if (typeof fs === 'number') tn.fontSize = fs * 2;
                } catch (e) {}
              }
            } else if (scale !== 1) {
              // Scaling proporcional do componente inteiro
              (compClone as any).rescale(scale);
            }

            zoomMaxHeight  = Math.max(zoomMaxHeight, compClone.height);
            zoomTotalWidth = zoomCurrentX + compClone.width;
            zoomCurrentX  += compClone.width + ZOOM_GAP_H;
          }

          // Mantém largura original do template — conteúdo que não caber fica clipado
          zoomImageFrame.clipsContent = true;
          zoomImageFrame.resize(
            zoomImageFrame.width,
            zoomCompY + zoomMaxHeight + ZOOM_PAD_SIDE + 40
          );
          if (modelItemNumber) modelItemNumber.visible = false;

        }
      }

      // Sync 'screen size' spec rows: hide rows whose zoom type is not selected, renumber visible ones
      // Fixed positional order matches the template: row0=texto/reflow, row1=componente 200% mobile, row2=componente 400%
      const ZOOM_ROW_TYPES = [
        '200% Texto (reflow)',
        '200% Componente (scaling)',
        '400% Componente (scaling)',
      ];
      let screenSizeSection = workingFrame.findOne((n: SceneNode) => n.name === 'screen size') as FrameNode | null;
      if (screenSizeSection) {
        if ((screenSizeSection as any).type === 'INSTANCE') {
          screenSizeSection = (screenSizeSection as any as InstanceNode).detachInstance() as unknown as FrameNode;
        }
        const specsHolder = (screenSizeSection.findOne((n: SceneNode) => n.name === 'specs') ?? screenSizeSection) as FrameNode;
        const specRows = Array.from(specsHolder.children)
          .filter(n => n.name !== 'element' && n.name !== 'tag' && n.name !== 'header' && n.name !== 'title') as SceneNode[];
        let visNum = 0;
        for (let ri = 0; ri < ZOOM_ROW_TYPES.length && ri < specRows.length; ri++) {
          const row = specRows[ri];
          const isSelected = zoomTypes.includes(ZOOM_ROW_TYPES[ri]);
          (row as any).visible = isSelected;
          if (isSelected) {
            visNum++;
            const numTexts = (row as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
            const numText = numTexts.find((n: TextNode) => /^\d+$/.test(n.characters.trim()));
            if (numText) await updateText(numText as TextNode, String(visNum));
          }
        }
      }
    }

    // Remove container de variações de toque legado se ainda existir
    figma.currentPage.findAll((n: SceneNode) =>
      n.name === '[A11Y Variações]'
    ).forEach(n => n.remove());
    variacoesContainerId = null;
    pluginDataNodeId = null;

    // Remove capturas de migração SR que não foram reinseridas no handoff
    // (ex: runLeitor=false ou número de variações de migração diferente do esperado)
    for (const cap of oldSRVarCapture) {
      try { if (cap.comp.parent === figma.currentPage) cap.comp.remove(); } catch (_) {}
      for (const b of cap.badges) {
        try { if (b.clone.parent === figma.currentPage) b.clone.remove(); } catch (_) {}
      }
      try { if (cap.numBadge && cap.numBadge.parent === figma.currentPage) cap.numBadge.remove(); } catch (_) {}
    }

    if (msg.variacoes) {
      for (const v of msg.variacoes) {
        if (v.id !== 'default') {
          v.frameNodeId = null;
          v.instanceNodeId = null;
        }
      }
    }
    figma.ui.postMessage({ type: 'feedback', message: '⏳ Salvando dados...' });
    const dbInstance = workingFrame.findOne((node: SceneNode) => node.name === "[dsc-h] Plugin Data A11y") as InstanceNode;
    if (dbInstance) {
      const dataToSave = JSON.stringify({
        plataformas: msg.plataformas,
        zoom: msg.zoom,
        mapeamentos: msg.mapeamentos,
        areas_toque: msg.areas_toque || [],
        sem_toque: msg.sem_toque || false,
        variacoes: msg.variacoes || [],
        variacoes_tabulacao: msg.variacoes_tabulacao || [],
        variacoes_leitor: msg.variacoes_leitor || [],
        conectores_leitor: msg.conectores_leitor || [],
        sem_leitor: msg.sem_leitor || false,
      });
      dbInstance.setPluginData("a11y-component-data", dataToSave);
    }

    // Salva também no ComponentSet/Component para leitura futura (inclusive via INSTANCE)
    if (componentePrincipalAtivo) {
      const dataNode = await resolveDataNode(componentePrincipalAtivo);
      if (dataNode) {
        const dataToSave = JSON.stringify({
          plataformas: msg.plataformas,
          zoom: msg.zoom,
          mapeamentos: msg.mapeamentos,
          areas_toque: msg.areas_toque || [],
          sem_toque: msg.sem_toque || false,
          variacoes: msg.variacoes || [],
          variacoes_tabulacao: msg.variacoes_tabulacao || [],
          variacoes_leitor: msg.variacoes_leitor || [],
          conectores_leitor: msg.conectores_leitor || [],
          sem_leitor: msg.sem_leitor || false,
        });
        dataNode.setPluginData('a11y-component-data', dataToSave);
      }
    }

    // Salva também diretamente no frame do handoff como backup garantido
    const dataToSaveDirect = JSON.stringify({
      plataformas: msg.plataformas,
      zoom: msg.zoom,
      mapeamentos: msg.mapeamentos,
      areas_toque: msg.areas_toque || [],
      sem_toque: msg.sem_toque || false,
      variacoes: msg.variacoes || [],
      variacoes_tabulacao: msg.variacoes_tabulacao || [],
      variacoes_leitor: msg.variacoes_leitor || [],
      conectores_leitor: msg.conectores_leitor || [],
      sem_leitor: msg.sem_leitor || false,
    });
    workingFrame.setPluginData("a11y-component-data", dataToSaveDirect);

    isHandoffGenerated = true;
    workingFrame.setPluginData('a11y-handoff-generated', 'true');
    figma.ui.postMessage({ type: 'feedback', message: `✅ Handoff ${wasGenerated ? 'atualizado' : 'gerado'} e dados salvos!` });
    figma.ui.postMessage({ type: 'handoff-complete' });
  }

  else if (msg.type === 'create-touch-overlay') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      figma.ui.postMessage({ type: 'touch-overlay-failed' });
      return;
    }
    try {
      const imageFrame = await getTouchImageFrame();
      if (!imageFrame) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Frame de preview não encontrado no template. Gere o handoff primeiro.' });
        figma.ui.postMessage({ type: 'touch-overlay-failed' });
        return;
      }
      const variationId: string = msg.variationId ?? 'default';

      // Encontrar ou criar instância de referência desta variação
      let refInstance = Array.from(imageFrame.children).find(n => {
        try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'variation-component' && d.variationId === variationId; } catch { return false; }
      }) as SceneNode | null;
      if (!refInstance) {
        refInstance = createComponentInstance(componentePrincipalAtivo);
        const existingCount = Array.from(imageFrame.children).filter(n => {
          try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'variation-component'; } catch { return false; }
        }).length;
        refInstance.x = 160 + existingCount * ((componentePrincipalAtivo as any).width + 140);
        refInstance.y = 80;
        imageFrame.appendChild(refInstance);
        refInstance.setPluginData('a11y-meta', JSON.stringify({ type: 'variation-component', variationId }));
        // Redimensionar e aplicar fundo
        const neededW = Math.max((imageFrame as FrameNode).width, (refInstance as any).x + (refInstance as any).width + 24);
        const neededH = Math.max((imageFrame as FrameNode).height, 80 + (refInstance as any).height + 40);
        imageFrame.resize(neededW, neededH);
        try { await applyWcagBackground(imageFrame as FrameNode, componentePrincipalAtivo, []); } catch(_e) {}
      }

      const modelHandoffAreas = (Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch areas')
        ?? (imageFrame as FrameNode).findOne(n => n.name === '[a11y] Touch areas')) as InstanceNode | undefined;
      const modelItemNumber = (Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch Area Connector')
        ?? (imageFrame as FrameNode).findOne(n => n.name === '[a11y] Touch Area Connector')) as InstanceNode | undefined;

      if (!modelHandoffAreas) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Modelo [a11y] Touch areas não encontrado. Gere o handoff primeiro.' });
        figma.ui.postMessage({ type: 'touch-overlay-failed' });
        return;
      }

      const cw = (refInstance as any).width ?? 100;
      const ch = (refInstance as any).height ?? 100;
      let w: number, h: number, dx: number, dy: number;
      if      (msg.preset === '44x100') { w = cw; h = 44; dx = 0;              dy = (ch - 44) / 2; }
      else if (msg.preset === '44x44')  { w = 44; h = 44; dx = (cw - 44) / 2; dy = (ch - 44) / 2; }
      else if (msg.preset === '24x24')  { w = 24; h = 24; dx = (cw - 24) / 2; dy = (ch - 24) / 2; }
      else                              { w = cw; h = 24; dx = 0;              dy = (ch - 24) / 2; }

      // Local index within this variation (for X.Y numbering)
      const localAreaIndex = Array.from(imageFrame.children).filter(n => {
        try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'touch-overlay' && d.variationId === variationId; } catch { return false; }
      }).length;
      const variationPrefix: number = msg.variationPrefix ?? 1;

      const areaClone = modelHandoffAreas.clone();
      areaClone.visible = true;
      areaClone.resize(w, h);
      areaClone.x = (refInstance as any).x + dx;
      areaClone.y = (refInstance as any).y + dy;
      imageFrame.appendChild(areaClone);
      areaClone.setPluginData('a11y-meta', JSON.stringify({ type: 'touch-overlay', variationId, nome: msg.nome, index: localAreaIndex, variationPrefix }));

      if (modelItemNumber) {
        const numClone = modelItemNumber.clone();
        numClone.visible = true;
        try { numClone.setProperties({ 'conector': 'desativado' }); } catch(_e) {}
        numClone.x = areaClone.x;
        numClone.y = areaClone.y - numClone.height - 4;
        imageFrame.appendChild(numClone);
        numClone.setPluginData('a11y-meta', JSON.stringify({ type: 'touch-badge', variationId, nome: msg.nome, index: localAreaIndex, variationPrefix }));
        const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
        const numText = numTexts.find(n => /^[\d.]+$/.test((n as TextNode).characters.trim())) || numTexts[0];
        if (numText) await updateText(numText as TextNode, `${variationPrefix}.${localAreaIndex + 1}`);
        modelItemNumber.visible = false;
      }
      modelHandoffAreas.visible = false;

      tempTouchOverlayId = areaClone.id;
      figma.currentPage.selection = [areaClone];
      figma.viewport.scrollAndZoomIntoView([areaClone]);
      figma.ui.postMessage({ type: 'touch-overlay-created' });
    } catch(e) {
      console.error('[create-touch-overlay]', e);
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar overlay: ${e}` });
      figma.ui.postMessage({ type: 'touch-overlay-failed' });
    }
  }

  else if (msg.type === 'confirm-touch-area') {
    let width = 0, height = 0, relX = 0, relY = 0;
    let badgeOffsetX = 0, badgeOffsetY = 0;
    let badgeWidth = 0, badgeHeight = 0;
    const badgeProps: Record<string, any> = {};
    try {
      if (tempTouchOverlayId) {
        const overlay = await figma.getNodeByIdAsync(tempTouchOverlayId) as FrameNode | InstanceNode | null;
        if (overlay) {
          width  = Math.round((overlay as any).width);
          height = Math.round((overlay as any).height);
          const meta = JSON.parse(overlay.getPluginData('a11y-meta') || '{}');
          const variationId: string = meta.variationId ?? 'default';
          const imageFrame = overlay.parent as FrameNode;
          const refInstance = imageFrame
            ? Array.from(imageFrame.children).find(n => {
                try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'variation-component' && d.variationId === variationId; } catch { return false; }
              }) as SceneNode | null
            : null;
          if (refInstance) {
            relX = Math.round((overlay as any).x - (refInstance as any).x);
            relY = Math.round((overlay as any).y - (refInstance as any).y);
          }
          // Ler badge correspondente: posição relativa ao overlay + componentProperties
          const badge = imageFrame
            ? Array.from(imageFrame.children).find(n => {
                try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'touch-badge' && d.variationId === variationId && d.index === meta.index; } catch { return false; }
              })
            : null;
          if (badge) {
            badgeOffsetX = Math.round((badge as any).x - (overlay as any).x);
            badgeOffsetY = Math.round((badge as any).y - (overlay as any).y);
            badgeWidth  = Math.round((badge as any).width);
            badgeHeight = Math.round((badge as any).height);
            if ((badge as any).componentProperties) {
              for (const [k, v] of Object.entries((badge as any).componentProperties as Record<string, { value: any }>)) {
                badgeProps[k] = v.value;
              }
            }
          }
        }
      }
    } catch(e) { console.error('[confirm-touch-area]', e); }
    tempTouchOverlayId = null;
    figma.ui.postMessage({ type: 'touch-area-confirmed', nome: msg.nome, preset: msg.preset, width, height, relX, relY, badgeOffsetX, badgeOffsetY, badgeWidth, badgeHeight, badgeProps });
  }

  else if (msg.type === 'cancel-touch-area') {
    if (tempTouchOverlayId) {
      try {
        const overlay = await figma.getNodeByIdAsync(tempTouchOverlayId);
        if (overlay) {
          const meta = JSON.parse(overlay.getPluginData('a11y-meta') || '{}');
          if (meta.type === 'touch-overlay' && overlay.parent) {
            const imageFrame = overlay.parent as FrameNode;
            const badge = Array.from(imageFrame.children).find(n => {
              try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'touch-badge' && d.variationId === meta.variationId && d.index === meta.index; } catch { return false; }
            });
            if (badge) badge.remove();
          }
          overlay.remove();
        }
      } catch(_e) {}
      tempTouchOverlayId = null;
    }
  }

  else if (msg.type === 'remove-touch-overlay') {
    try {
      const imageFrame = await getTouchImageFrame();
      if (!imageFrame) return;
      const variationId: string = msg.variationId ?? 'default';
      Array.from(imageFrame.children).filter(n => {
        try {
          const d = JSON.parse(n.getPluginData('a11y-meta') || '{}');
          return (d.type === 'touch-overlay' || d.type === 'touch-badge') && d.variationId === variationId && d.nome === msg.nome;
        } catch { return false; }
      }).forEach(n => n.remove());
      await renumberTouchBadges(imageFrame);
    } catch(e) { console.error('[remove-touch-overlay]', e); }
  }

  else if (msg.type === 'highlight-touch-area') {
    try {
      const imageFrame = await getTouchImageFrame();
      if (!imageFrame) return;
      const variationId: string = msg.variationId ?? 'default';
      const node = Array.from(imageFrame.children).find(n => {
        try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'touch-overlay' && d.variationId === variationId && d.nome === msg.nome; } catch { return false; }
      }) as SceneNode | null;
      if (node) { figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node]); }
    } catch(e) { console.error('[highlight-touch-area]', e); }
  }

  else if (msg.type === 'get-component-properties') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'component-properties-ready', props: [] });
      return;
    }
    try {
      let defs: ComponentPropertyDefinitions | null = null;
      const node = componentePrincipalAtivo;
      if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') {
        defs = (node as ComponentSetNode | ComponentNode).componentPropertyDefinitions;
      } else if (node.type === 'INSTANCE') {
        const main = await (node as InstanceNode).getMainComponentAsync();
        if (main) {
          const source = main.parent?.type === 'COMPONENT_SET' ? main.parent : main;
          defs = (source as ComponentSetNode | ComponentNode).componentPropertyDefinitions;
        }
      }
      if (!defs) {
        figma.ui.postMessage({ type: 'component-properties-ready', props: [] });
        return;
      }
      // Captura valores atuais da instância (se for INSTANCE)
      let instanceValues: Record<string, any> = {};
      if (node.type === 'INSTANCE') {
        const compProps = (node as InstanceNode).componentProperties;
        Object.entries(compProps).forEach(([k, v]) => { instanceValues[k] = v.value; });
      }
      const props = Object.entries(defs)
        .filter(([_, def]) => def.type === 'VARIANT' || def.type === 'BOOLEAN')
        .map(([name, def]) => ({
          name,
          type: def.type,
          options: def.type === 'VARIANT' ? (def as any).variantOptions : [true, false],
          currentValue: instanceValues[name] ?? (def as any).defaultValue
        }));
      figma.ui.postMessage({ type: 'component-properties-ready', props });
    } catch(e) {
      console.error('[get-component-properties]', e);
      figma.ui.postMessage({ type: 'component-properties-ready', props: [] });
    }
  }

  else if (msg.type === 'create-variation-frame') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    let instance: SceneNode | null = null;
    try {
      const imageFrame = await getTouchImageFrame();
      if (!imageFrame) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Frame de preview não encontrado. Gere o handoff primeiro, depois adicione variações.' });
        figma.ui.postMessage({ type: 'variation-frame-failed' });
        return;
      }
      const variationId: string = msg.id || msg.nome;

      // Idempotência: reutiliza instância existente desta variação
      const existingInst = Array.from(imageFrame.children).find(n => {
        try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'variation-component' && d.variationId === variationId; } catch { return false; }
      }) as SceneNode | null;
      if (existingInst) {
        figma.currentPage.selection = [existingInst];
        figma.viewport.scrollAndZoomIntoView([existingInst]);
        figma.ui.postMessage({ type: 'variation-frame-created', frameNodeId: imageFrame.id, instanceNodeId: existingInst.id });
        return;
      }

      // Ocultar modelos do template que ficam visíveis por padrão
      const _mHA = (Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch areas')
        ?? (imageFrame as FrameNode).findOne(n => n.name === '[a11y] Touch areas')) as InstanceNode | undefined;
      const _mIN = (Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch Area Connector')
        ?? (imageFrame as FrameNode).findOne(n => n.name === '[a11y] Touch Area Connector')) as InstanceNode | undefined;
      if (_mHA) _mHA.visible = false;
      if (_mIN) _mIN.visible = false;

      // Posição: à direita das instâncias já existentes
      const PAD_LEFT = 160;
      const PAD_TOP  = 80;
      const GAP_H    = 140;
      const existingCount = Array.from(imageFrame.children).filter(n => {
        try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'variation-component'; } catch { return false; }
      }).length;
      const insertX = PAD_LEFT + existingCount * ((componentePrincipalAtivo as any).width + GAP_H);

      instance = createComponentInstance(componentePrincipalAtivo);
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch(e) {
          figma.ui.postMessage({ type: 'feedback', message: '⚠️ Propriedade não aplicada: ' + String(e) });
        }
      }
      instance.x = insertX;
      instance.y = PAD_TOP;
      imageFrame.appendChild(instance);
      instance.setPluginData('a11y-meta', JSON.stringify({ type: 'variation-component', variationId }));

      // Redimensionar imageFrame para comportar a instância
      const neededW = Math.max((imageFrame as FrameNode).width, (instance as any).x + (instance as any).width + 24);
      const neededH = Math.max((imageFrame as FrameNode).height, PAD_TOP + (instance as any).height + 40);
      imageFrame.resize(neededW, neededH);

      // Aplicar fundo com verificação de contraste WCAG
      try { await applyWcagBackground(imageFrame as FrameNode, componentePrincipalAtivo, []); } catch(_e) {}

      const instanceId = instance.id;
      instance = null; // ancorado

      const placed = await figma.getNodeByIdAsync(instanceId) as SceneNode | null;
      if (placed) { figma.currentPage.selection = [placed]; figma.viewport.scrollAndZoomIntoView([placed]); }
      figma.ui.postMessage({ type: 'variation-frame-created', frameNodeId: imageFrame.id, instanceNodeId: instanceId });
    } catch(e) {
      try { instance?.remove(); } catch (_) {}
      console.error('[create-variation-frame]', e);
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar instância de variação: ${e}` });
      figma.ui.postMessage({ type: 'variation-frame-failed' });
    }
  }

  else if (msg.type === 'activate-variation') {
    try {
      const imageFrame = await getTouchImageFrame();
      if (!imageFrame) { componenteVariacaoAtivo = null; return; }

      const variationId: string = msg.variationId ?? 'default';

      // Verifica se a instância ainda existe dentro do imageFrame (por ID ou por pluginData)
      let instance: SceneNode | null = msg.instanceNodeId
        ? await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null
        : null;
      if (instance && (instance as any).parent?.id !== imageFrame.id) instance = null;

      // Fallback: busca no imageFrame pelo pluginData (cobre default sem instanceNodeId salvo)
      if (!instance) {
        instance = Array.from(imageFrame.children).find(n => {
          try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'variation-component' && d.variationId === variationId; } catch { return false; }
        }) as SceneNode | null;
        if (instance) figma.ui.postMessage({ type: 'variation-instance-recreated', variationId, instanceNodeId: instance.id });
      }

      if (!instance) {
        // Recria instância + overlays a partir dos dados salvos
        if (!componentePrincipalAtivo) { componenteVariacaoAtivo = null; return; }

        const PAD_LEFT = 160, PAD_TOP = 80, GAP_H = 140;
        const existingCount = Array.from(imageFrame.children).filter(n => {
          try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'variation-component'; } catch { return false; }
        }).length;

        const newInst = createComponentInstance(componentePrincipalAtivo) as InstanceNode;
        if (msg.propriedades && Object.keys(msg.propriedades).length > 0) {
          try { (newInst as any).setProperties(msg.propriedades); } catch(_e) {}
        }
        const cw = (newInst as any).width;
        const ch = (newInst as any).height;
        newInst.x = PAD_LEFT + existingCount * (cw + GAP_H);
        newInst.y = PAD_TOP;
        imageFrame.appendChild(newInst);
        newInst.setPluginData('a11y-meta', JSON.stringify({ type: 'variation-component', variationId }));

        const neededW = Math.max((imageFrame as FrameNode).width, newInst.x + cw + 24);
        const neededH = Math.max((imageFrame as FrameNode).height, PAD_TOP + ch + 40);
        imageFrame.resize(neededW, neededH);
        try { await applyWcagBackground(imageFrame as FrameNode, componentePrincipalAtivo, []); } catch(_e) {}

        const modelHandoffAreas = (
          Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch areas')
          ?? (imageFrame as FrameNode).findOne((n: SceneNode) => n.name === '[a11y] Touch areas')
        ) as InstanceNode | undefined;
        const modelItemNumber = (
          Array.from(imageFrame.children).find(n => n.name === '[a11y] Touch Area Connector')
          ?? (imageFrame as FrameNode).findOne((n: SceneNode) => n.name === '[a11y] Touch Area Connector')
        ) as InstanceNode | undefined;
        if (modelHandoffAreas) modelHandoffAreas.visible = false;
        if (modelItemNumber) modelItemNumber.visible = false;

        // Recria overlays a partir das áreas salvas
        const areas: any[] = msg.areas_toque || [];
        const recrPrefix: number = msg.variationPrefix ?? 1;
        for (let areaIdx = 0; areaIdx < areas.length; areaIdx++) {
          const area = areas[areaIdx];
          if (!modelHandoffAreas) break;

          const areaClone = (modelHandoffAreas as InstanceNode).clone();
          areaClone.visible = true;
          try { areaClone.resize(area.width, area.height); } catch(_e) {}
          areaClone.x = newInst.x + (area.relX || 0);
          areaClone.y = newInst.y + (area.relY || 0);
          imageFrame.appendChild(areaClone);
          areaClone.setPluginData('a11y-meta', JSON.stringify({ type: 'touch-overlay', variationId, nome: area.nome, index: areaIdx, variationPrefix: recrPrefix }));

          if (modelItemNumber) {
            const numClone = (modelItemNumber as InstanceNode).clone();
            numClone.visible = true;
            if (area.badgeProps && Object.keys(area.badgeProps).length > 0) {
              try { (numClone as any).setProperties(area.badgeProps); } catch(_e) {}
            } else {
              try { (numClone as any).setProperties({ 'conector': 'desativado' }); } catch(_e) {}
            }
            if (area.badgeWidth > 0 && area.badgeHeight > 0) {
              try { numClone.resize(area.badgeWidth, area.badgeHeight); } catch(_e) {}
            }
            numClone.x = areaClone.x + (area.badgeOffsetX ?? 0);
            numClone.y = areaClone.y + (area.badgeOffsetY ?? -((numClone as any).height + 4));
            imageFrame.appendChild(numClone);
            numClone.setPluginData('a11y-meta', JSON.stringify({ type: 'touch-badge', variationId, nome: area.nome, index: areaIdx, variationPrefix: recrPrefix }));
            const numTexts = (numClone as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
            const numText = numTexts.find((n: TextNode) => /^[\d.]+$/.test(n.characters.trim())) || numTexts[0];
            if (numText) await updateText(numText as TextNode, `${recrPrefix}.${areaIdx + 1}`);
          }
        }

        instance = newInst;
        figma.ui.postMessage({ type: 'variation-instance-recreated', variationId, instanceNodeId: instance.id });
      }

      componenteVariacaoAtivo = instance;
      figma.currentPage.selection = [instance as SceneNode];
      figma.viewport.scrollAndZoomIntoView([instance as SceneNode]);
    } catch(e) { componenteVariacaoAtivo = null; }
  }

  else if (msg.type === 'deactivate-variation') {
    componenteVariacaoAtivo = null;
  }

  else if (msg.type === 'get-tab-selection') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const selection = figma.currentPage.selection;
    const comp = (componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as FrameNode;
    const compX = comp.absoluteTransform[0][2];
    const compY = comp.absoluteTransform[1][2];

    const items = selection
      .filter(n => n.id !== handoffAtivo?.id && n.getPluginData('a11y-marker') === '')
      .map(n => {
        if (n.id === comp.id) {
          return {
            layerName: n.name, nodeId: n.id,
            relX: 0, relY: 0,
            width: Math.round((comp as FrameNode).width ?? 0),
            height: Math.round((comp as FrameNode).height ?? 0),
          };
        }
        return {
          layerName: n.name, nodeId: n.id,
          relX: Math.round(n.absoluteTransform[0][2] - compX),
          relY: Math.round(n.absoluteTransform[1][2] - compY),
          width: Math.round((n as FrameNode).width  ?? 0),
          height: Math.round((n as FrameNode).height ?? 0),
        };
      });

    if (items.length === 0) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Selecione camadas no canvas e clique novamente.' });
      return;
    }
    figma.ui.postMessage({ type: 'tab-items-ready', items });
  }

  else if (msg.type === 'get-component-as-tab') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const comp = (componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as FrameNode;
    figma.ui.postMessage({
      type: 'tab-items-ready',
      items: [{
        layerName: comp.name,
        nodeId: comp.id,
        relX: 0,
        relY: 0,
        width: Math.round((comp as FrameNode).width ?? 0),
        height: Math.round((comp as FrameNode).height ?? 0),
      }]
    });
  }

  else if (msg.type === 'delete-variation-frame') {
    try {
      if (msg.instanceNodeId) {
        const node = await figma.getNodeByIdAsync(msg.instanceNodeId);
        if (node) node.remove();
      }
      if (msg.variationId) {
        const imageFrame = await getTouchImageFrame();
        if (imageFrame) {
          Array.from(imageFrame.children).filter(n => {
            try {
              const d = JSON.parse(n.getPluginData('a11y-meta') || '{}');
              return (d.type === 'touch-overlay' || d.type === 'touch-badge') && d.variationId === msg.variationId;
            } catch { return false; }
          }).forEach(n => n.remove());
        }
      }
    } catch(e) { console.error('[delete-variation-frame]', e); }
  }

  else if (msg.type === 'create-sr-variation-frame') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    try {
      const srImageFrame = await getSRImageFrame();
      if (!srImageFrame) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Frame de leitor de tela não encontrado. Gere o handoff primeiro.' });
        return;
      }
      const variationId: string = msg.variationId ?? msg.id ?? ('sr_' + Date.now());
      const _modelC = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Screen Reader Conector') as InstanceNode | undefined;
      const _modelN = Array.from(srImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;
      const _modelA = srImageFrame.findOne(n => n.name === '[a11y] Screen Reader Gruping') as InstanceNode | undefined;
      if (_modelC) _modelC.visible = false;
      if (_modelN) _modelN.visible = false;
      if (_modelA) _modelA.visible = false;
      let inst = Array.from(srImageFrame.children).find(n => {
        try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'sr-variation-component' && d.variationId === variationId; } catch { return false; }
      }) as SceneNode | null;
      if (!inst) {
        const PAD_LEFT = 160, PAD_TOP = 120, GAP_H = 140;
        const existingInsts = Array.from(srImageFrame.children).filter(n => {
          try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'sr-variation-component'; } catch { return false; }
        }) as SceneNode[];
        const slotIndex = typeof msg.variationIndex === 'number' ? msg.variationIndex : existingInsts.length;
        inst = createComponentInstance(componentePrincipalAtivo);
        if (msg.propriedades && Object.keys(msg.propriedades).length > 0) {
          try { (inst as any).setProperties(msg.propriedades); } catch(_e) {}
        }
        const slotWidth = Math.max((inst as any).width, ...existingInsts.map((n: any) => n.width));
        (inst as any).x = PAD_LEFT + slotIndex * (slotWidth + GAP_H);
        (inst as any).y = PAD_TOP;
        srImageFrame.appendChild(inst as SceneNode);
        inst.setPluginData('a11y-meta', JSON.stringify({ type: 'sr-variation-component', variationId }));
        const neededW = Math.max((srImageFrame as FrameNode).width, (inst as any).x + (inst as any).width + 24);
        const neededH = Math.max((srImageFrame as FrameNode).height, PAD_TOP + (inst as any).height + 40);
        srImageFrame.resize(neededW, neededH);
        try { await applyWcagBackground(srImageFrame as FrameNode, componentePrincipalAtivo, []); } catch(_e) {}
      }
      componenteSRVariacaoAtivo = inst;
      figma.currentPage.selection = [inst as SceneNode];
      figma.viewport.scrollAndZoomIntoView([inst as SceneNode]);
      figma.ui.postMessage({ type: 'sr-variation-frame-created', frameNodeId: inst.id, instanceNodeId: inst.id });
    } catch(e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar variação de leitor de tela: ${e}` });
    }
  }

  else if (msg.type === 'create-tab-variation-frame') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    try {
      const tabImageFrame = await getTabImageFrame();
      if (!tabImageFrame) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Frame de tabulação não encontrado. Gere o handoff primeiro.' });
        return;
      }
      const variationId: string = msg.variationId ?? msg.id ?? ('var_' + Date.now());
      // Esconde modelos que mostram "0" por padrão
      const _modelO = Array.from(tabImageFrame.children).find(n => n.name === '[a11y] Order') as InstanceNode | undefined;
      const _modelN = Array.from(tabImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;
      if (_modelO) _modelO.visible = false;
      if (_modelN) _modelN.visible = false;
      let inst = Array.from(tabImageFrame.children).find(n => {
        try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'tab-variation-component' && d.variationId === variationId; } catch { return false; }
      }) as SceneNode | null;
      if (!inst) {
        const PAD_LEFT = 160, PAD_TOP = 80, GAP_H = 140;
        const existingInsts = Array.from(tabImageFrame.children).filter(n => {
          try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'tab-variation-component'; } catch { return false; }
        }) as SceneNode[];
        const slotIndex = typeof msg.variationIndex === 'number' ? msg.variationIndex : existingInsts.length;
        inst = createComponentInstance(componentePrincipalAtivo);
        if (msg.propriedades && Object.keys(msg.propriedades).length > 0) {
          try { (inst as any).setProperties(msg.propriedades); } catch(_e) {}
        }
        const slotWidth = Math.max((inst as any).width, ...existingInsts.map((n: any) => n.width));
        (inst as any).x = PAD_LEFT + slotIndex * (slotWidth + GAP_H);
        (inst as any).y = PAD_TOP;
        tabImageFrame.appendChild(inst as SceneNode);
        inst.setPluginData('a11y-meta', JSON.stringify({ type: 'tab-variation-component', variationId }));
        const neededW = Math.max((tabImageFrame as FrameNode).width, (inst as any).x + (inst as any).width + 24);
        const neededH = Math.max((tabImageFrame as FrameNode).height, PAD_TOP + (inst as any).height + 40);
        tabImageFrame.resize(neededW, neededH);
        try { await applyWcagBackground(tabImageFrame as FrameNode, componentePrincipalAtivo, []); } catch(_e) {}
      }
      componenteTabVariacaoAtivo = inst;
      figma.currentPage.selection = [inst as SceneNode];
      figma.viewport.scrollAndZoomIntoView([inst as SceneNode]);
      figma.ui.postMessage({ type: 'tab-variation-frame-created', frameNodeId: inst.id, instanceNodeId: inst.id });
    } catch(e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar variação de tabulação: ${e}` });
    }
  }

  else if (msg.type === 'activate-tab-variation') {
    try {
      const tabImageFrame = await getTabImageFrame();
      if (!tabImageFrame) {
        componenteTabVariacaoAtivo = null;
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Frame de tabulação não encontrado. Gere o handoff primeiro.' });
        return;
      }
      const variationId: string = msg.variationId ?? 'default';

      const modelOrder      = Array.from(tabImageFrame.children).find(n => n.name === '[a11y] Order')        as InstanceNode | undefined;
      const modelItemNumber = Array.from(tabImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;
      if (modelOrder)      modelOrder.visible      = false;
      if (modelItemNumber) modelItemNumber.visible = false;

      let instanceWasCreated = false;
      let instance: SceneNode | null = msg.instanceNodeId
        ? await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null
        : null;
      if (instance && (instance as any).parent?.id !== tabImageFrame.id) instance = null;
      if (!instance) {
        instance = Array.from(tabImageFrame.children).find(n => {
          try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'tab-variation-component' && d.variationId === variationId; } catch { return false; }
        }) as SceneNode | null;
        if (instance) figma.ui.postMessage({ type: 'tab-variation-instance-recreated', variationId, instanceNodeId: instance.id });
      }
      if (!instance) {
        instanceWasCreated = true;
        if (!componentePrincipalAtivo) { componenteTabVariacaoAtivo = null; return; }
        const PAD_LEFT = 160, PAD_TOP = 80, GAP_H = 140;
        const existingInsts = Array.from(tabImageFrame.children).filter(n => {
          try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'tab-variation-component'; } catch { return false; }
        }) as SceneNode[];
        const slotIndex = typeof msg.variationIndex === 'number' ? msg.variationIndex : existingInsts.length;
        instance = createComponentInstance(componentePrincipalAtivo) as InstanceNode;
        if (msg.propriedades && Object.keys(msg.propriedades).length > 0) {
          try { (instance as any).setProperties(msg.propriedades); } catch(_e) {}
        }
        const slotWidth = Math.max((instance as any).width, ...existingInsts.map((n: any) => n.width));
        (instance as any).x = PAD_LEFT + slotIndex * (slotWidth + GAP_H);
        (instance as any).y = PAD_TOP;
        tabImageFrame.appendChild(instance as SceneNode);
        instance.setPluginData('a11y-meta', JSON.stringify({ type: 'tab-variation-component', variationId }));
        const neededW = Math.max((tabImageFrame as FrameNode).width, (instance as any).x + (instance as any).width + 24);
        const neededH = Math.max((tabImageFrame as FrameNode).height, PAD_TOP + (instance as any).height + 40);
        tabImageFrame.resize(neededW, neededH);
        try { await applyWcagBackground(tabImageFrame as FrameNode, componentePrincipalAtivo, []); } catch(_e) {}
        figma.ui.postMessage({ type: 'tab-variation-instance-recreated', variationId, instanceNodeId: instance.id });
      }
      componenteTabVariacaoAtivo = instance;

      const instX = (instance as any).x as number;
      const instY = (instance as any).y as number;
      const instW = (instance as any).width as number;
      const instH = (instance as any).height as number;

      // Resolve tabOrder antes de checar marcadores
      let tabOrder: any[] = msg.tab_order || [];
      if (tabOrder.length === 0) {
        try {
          const dbNode = await getCachedPluginDataNode();
          if (dbNode) {
            const saved = JSON.parse(dbNode.getPluginData('a11y-component-data') || '{}');
            const savedVar = (saved.variacoes_tabulacao || []).find((v: any) => v.id === variationId);
            if (savedVar?.tab_order?.length > 0) tabOrder = savedVar.tab_order;
          }
        } catch(_e) {}
      }

      const variationNumber = typeof msg.variationIndex === 'number' ? msg.variationIndex + 1 : 1;

      // Verifica se marcadores desta variação já estão corretos (não toca marcadores de outras variações)
      if (!instanceWasCreated) {
        const currentMarkers = Array.from(tabImageFrame.children)
          .filter(n => n.getPluginData('a11y-marker') === variationId);
        const expectedCount = tabOrder.length + (modelItemNumber ? 1 : 0);
        if (currentMarkers.length === expectedCount) {
          figma.currentPage.selection = [instance as SceneNode];
          figma.viewport.scrollAndZoomIntoView([instance as SceneNode]);
          return;
        }
        currentMarkers.forEach(n => n.remove());
      }

      // [dsc-h] Item Number acima da instância
      if (modelItemNumber) {
        const numClone = modelItemNumber.clone();
        numClone.setPluginData('a11y-marker', variationId);
        numClone.visible = true;
        const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
        const numText = numTexts.find(n => /^\d+$/.test((n as TextNode).characters.trim())) || numTexts[0] || null;
        if (numText) await updateText(numText as TextNode, String(variationNumber));
        numClone.x = instX;
        numClone.y = instY - numClone.height - 4;
        tabImageFrame.appendChild(numClone);
        if (numClone.type === 'INSTANCE') {
          try { (numClone as InstanceNode).setProperties({ 'connector': 'Off' }); } catch(_e) {}
        }
      }

      // [a11y] Order em cada item de tabulação
      if (modelOrder && tabOrder.length > 0) {
        for (let i = 0; i < tabOrder.length; i++) {
          const item = tabOrder[i];
          const orderClone = modelOrder.clone();
          orderClone.setPluginData('a11y-marker', variationId);
          orderClone.visible = true;
          const numText = orderClone.findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
          if (numText) await updateText(numText, String(i + 1));
          const rawX = instX + item.relX + item.width  - orderClone.width;
          const rawY = instY + item.relY + 4;
          orderClone.x = Math.max(instX, Math.min(rawX, instX + instW - orderClone.width));
          orderClone.y = Math.max(instY, Math.min(rawY, instY + instH - orderClone.height));
          tabImageFrame.appendChild(orderClone);
        }
      }

      figma.currentPage.selection = [instance as SceneNode];
      figma.viewport.scrollAndZoomIntoView([instance as SceneNode]);
    } catch(e) {
      componenteTabVariacaoAtivo = null;
      console.error('[activate-tab-variation] erro:', e);
    }
  }

  else if (msg.type === 'deactivate-tab-variation') {
    componenteTabVariacaoAtivo = null;
  }

  else if (msg.type === 'delete-tab-variation-frame') {
    try {
      const tabImageFrame = await getTabImageFrame();
      if (tabImageFrame && msg.variationId) {
        Array.from(tabImageFrame.children).filter(n => {
          try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'tab-variation-component' && d.variationId === msg.variationId; } catch { return false; }
        }).forEach(n => n.remove());
        Array.from(tabImageFrame.children)
          .filter(n => n.getPluginData('a11y-marker') === msg.variationId)
          .forEach(n => n.remove());
      }
    } catch(e) { console.error('[delete-tab-variation-frame]', e); }
  }

  else if (msg.type === 'activate-sr-variation') {
    try {
      const srImageFrame = await getSRImageFrame();
      if (!srImageFrame) {
        componenteSRVariacaoAtivo = null;
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Frame de leitor de tela não encontrado. Gere o handoff primeiro.' });
        return;
      }
      const variationId: string = msg.variationId ?? 'default';
      const variationNumber = typeof msg.variationIndex === 'number' ? msg.variationIndex + 1 : 1;
      const modelConector    = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Screen Reader Conector')   as InstanceNode | undefined;
      const modelItemNumber  = Array.from(srImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;
      const modelAgrupamento = srImageFrame.findOne(n => n.name === '[a11y] Screen Reader Gruping') as InstanceNode | undefined;
      if (modelConector)    modelConector.visible    = false;
      if (modelItemNumber)  modelItemNumber.visible  = false;
      if (modelAgrupamento) modelAgrupamento.visible = false;

      let instance: SceneNode | null = msg.instanceNodeId
        ? await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null
        : null;
      if (instance && (instance as any).parent?.id !== srImageFrame.id) instance = null;
      if (!instance) {
        instance = Array.from(srImageFrame.children).find(n => {
          try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'sr-variation-component' && d.variationId === variationId; } catch { return false; }
        }) as SceneNode | null;
        if (instance) figma.ui.postMessage({ type: 'sr-variation-instance-recreated', variationId, instanceNodeId: instance.id });
      }

      if (!instance) {
        if (!componentePrincipalAtivo) { componenteSRVariacaoAtivo = null; return; }
        const PAD_LEFT = 160, PAD_TOP = 120, GAP_H = 140;
        const existingInsts = Array.from(srImageFrame.children).filter(n => {
          try { return JSON.parse(n.getPluginData('a11y-meta') || '{}').type === 'sr-variation-component'; } catch { return false; }
        }) as SceneNode[];
        const slotIndex = typeof msg.variationIndex === 'number' ? msg.variationIndex : existingInsts.length;
        instance = createComponentInstance(componentePrincipalAtivo);
        if (msg.propriedades && Object.keys(msg.propriedades).length > 0) {
          try { (instance as any).setProperties(msg.propriedades); } catch(_e) {}
        }
        const slotWidth = Math.max((instance as any).width, ...existingInsts.map((n: any) => n.width));
        (instance as any).x = PAD_LEFT + slotIndex * (slotWidth + GAP_H);
        (instance as any).y = PAD_TOP;
        srImageFrame.appendChild(instance as SceneNode);
        instance.setPluginData('a11y-meta', JSON.stringify({ type: 'sr-variation-component', variationId }));
        const neededW = Math.max((srImageFrame as FrameNode).width, (instance as any).x + (instance as any).width + 24);
        const neededH = Math.max((srImageFrame as FrameNode).height, PAD_TOP + (instance as any).height + 40);
        srImageFrame.resize(neededW, neededH);
        try { await applyWcagBackground(srImageFrame as FrameNode, componentePrincipalAtivo, []); } catch(_e) {}
        figma.ui.postMessage({ type: 'sr-variation-instance-recreated', variationId, instanceNodeId: instance.id });
      }
      componenteSRVariacaoAtivo = instance;
      const oldMarkers = (srImageFrame as FrameNode).findAll(n => n.getPluginData('a11y-marker') === variationId);

      const instX    = (instance as any).x as number;
      const instY    = (instance as any).y as number;
      const instW    = (instance as any).width  as number;
      const instH    = (instance as any).height as number;
      const itemNumH = modelItemNumber ? (modelItemNumber as any).height : 36;

      // Badge de número acima da instância
      if (modelItemNumber) {
        const numClone = modelItemNumber.clone();
        numClone.setPluginData('a11y-marker', variationId);
        numClone.visible = true;
        const numTexts = (numClone as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
        const numText = numTexts.find(n => /^\d+$/.test((n as TextNode).characters.trim())) || numTexts[0] || null;
        if (numText) await updateText(numText as TextNode, String(variationNumber));
        numClone.x = instX;
        numClone.y = instY - numClone.height - 4;
        srImageFrame.appendChild(numClone);
        if (numClone.type === 'INSTANCE') {
          try { (numClone as InstanceNode).setProperties({ 'connector': 'Off' }); } catch(_e) {}
        }
      }

      // Conectores e agrupamentos reais (como no run-handoff, mas marcados para cleanup)
      const conectoresAct = msg.conectores_leitor || [];
      const letrasAct = computeLetrasTS(conectoresAct);
      for (let i = 0; i < conectoresAct.length; i++) {
        let c = conectoresAct[i];
        const letra = letrasAct[i];
        if (!('relX' in c) && !('relY' in c)) {
          const spacing = instH / (conectoresAct.length + 1);
          c = { ...c, relX: 0, relY: Math.round(spacing * (i + 1) - 10), width: 20, height: 20 };
        }
        if (c.tipoAnotacao === 'agrupamento' && modelAgrupamento) {
          const agClone = modelAgrupamento.clone();
          agClone.setPluginData('a11y-marker', variationId);
          agClone.visible = true;
          agClone.resize(c.width || 80, c.height || 40);
          srImageFrame.appendChild(agClone);
          agClone.x = instX + (c.relX || 0);
          agClone.y = instY + (c.relY || 0);
          let orientacao: string = (c as any).orientacao || '';
          if (!orientacao) {
            const _agActRX  = (c.relX || 0) + (c.width || 80);
            const _agActBot = (c.relY || 0) + (c.height || 40);
            const _agActRGap = instW - _agActRX;
            const _agActVGap = instH - _agActBot;
            if      (_agActRGap < (c.width || 80) * 0.15) orientacao = 'direita';
            else if (_agActVGap < (c.height || 40) * 0.15) orientacao = 'inferior';
            else orientacao = (_agActRX - (c.width || 80) / 2) < instW / 2 ? 'esquerda' : 'direita';
          }
          const _agActT = (c.tipo || c.tipoConnector || '').toLowerCase();
          let _agActTipo = 'função valor rótulos';
          if (_agActT.includes('decorat'))                                                                              _agActTipo = 'elementos decorativos';
          else if (_agActT.includes('marco') || _agActT.includes('naveg'))                                             _agActTipo = 'marcos de navegação';
          else if (_agActT.includes('título') || _agActT.includes('titulo') || _agActT.includes('nível') || _agActT.includes('nivel')) _agActTipo = 'nível de título';
          else if (_agActT.includes('infor') || _agActT.includes('adicional'))                                         _agActTipo = 'informações adicionais';
          try { (agClone as InstanceNode).setProperties({ 'tipo': _agActTipo, 'orientação': orientacao }); } catch(_e) {}
          if (_agActTipo === 'nível de título' && c.especificacao) {
            const _agActKeys = Object.keys((agClone as any).componentProperties || {});
            const _agActHKey = _agActKeys.find(k => k.toLowerCase().includes('nível') || k.toLowerCase().includes('nivel') || k.toLowerCase().includes('título') || k.toLowerCase().includes('titulo') || k.toLowerCase().includes('heading'));
            if (_agActHKey) {
              try { (agClone as InstanceNode).setProperties({ [_agActHKey]: c.especificacao }); } catch(_e) {
                try { (agClone as InstanceNode).setProperties({ [_agActHKey]: c.especificacao.toUpperCase() }); } catch(_e2) { /* ignore */ }
              }
            }
          }
          const agTexts = (agClone as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
          const agLetraTxt = agTexts.find(n => /^H\d+$/i.test(n.characters.trim()))
            || agTexts.find(n => /^[A-Za-z✦]/.test(n.characters.trim()))
            || agTexts[0] || null;
          const _agActBadge = _agActTipo === 'nível de título' && c.especificacao ? c.especificacao : letra;
          if (agLetraTxt) await updateText(agLetraTxt, _agActBadge);
        } else if (modelConector && c.tipoAnotacao !== 'agrupamento') {
          const conClone = modelConector.clone();
          conClone.setPluginData('a11y-marker', variationId);
          conClone.visible = true;
          srImageFrame.appendChild(conClone);
          const t = (c.tipo || '').toLowerCase();
          let tipoVariante = 'função valor rótulos';
          if (t.includes('decorat'))                                                                             tipoVariante = 'elementos decorativos';
          else if (t.includes('marco') || t.includes('naveg'))                                                   tipoVariante = 'marcos de navegação';
          else if (t.includes('título') || t.includes('titulo') || t.includes('heading') || t.includes('nível') || t.includes('nivel')) tipoVariante = 'nível de título';
          else if (t.includes('infor') || t.includes('adicional'))                                               tipoVariante = 'informações adicionais';
          if ((c as any).positioned) {
            const relX = c.relX || 0, relY = c.relY || 0;
            const savedW = (c as any).width || conClone.width;
            const savedH = (c as any).height || conClone.height;
            let lado: string;
            if      (relX + savedW <= 0)  lado = 'esquerda';
            else if (relX >= instW)       lado = 'direita';
            else if (relY + savedH <= 0)  lado = 'superior';
            else if (relY >= instH)       lado = 'inferior';
            else {
              const dL = Math.abs(relX), dR = Math.abs(instW - relX - savedW);
              const dT = Math.abs(relY), dB = Math.abs(instH - relY - savedH);
              const minD = Math.min(dL, dR, dT, dB);
              lado = minD === dL ? 'esquerda' : minD === dR ? 'direita' : minD === dT ? 'superior' : 'inferior';
            }
            try { (conClone as InstanceNode).setProperties({ 'tipo': tipoVariante, 'conector': lado }); } catch(_e) {}
            try { conClone.resize(savedW, savedH); } catch(_e) {}
            conClone.x = instX + relX;
            conClone.y = instY + relY;
          } else {
            const distLeft   = c.relX || 0;
            const distRight  = instW - ((c.relX || 0) + (c.width  || 20));
            const distTop    = c.relY || 0;
            const distBottom = instH - ((c.relY || 0) + (c.height || 20));
            const minDist = Math.min(distLeft, distRight, distTop, distBottom);
            const lado = minDist === distLeft ? 'esquerda' : minDist === distRight ? 'direita' : minDist === distTop ? 'superior' : 'inferior';
            try { (conClone as InstanceNode).setProperties({ 'tipo': tipoVariante, 'conector': lado }); } catch(_e) {}
            const BADGE_SIZE = 32, OUT_GAP = 8;
            const relX = c.relX || 0, relY = c.relY || 0, elW = c.width || 0, elH = c.height || 0;
            if (lado === 'esquerda') {
              try { conClone.resize(BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + relX), conClone.height); } catch(_e) {}
              conClone.x = instX - OUT_GAP - BADGE_SIZE;
              conClone.y = instY + relY + elH / 2 - conClone.height / 2;
            } else if (lado === 'direita') {
              try { conClone.resize(BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + (instW - relX - elW)), conClone.height); } catch(_e) {}
              conClone.x = instX + relX + elW;
              conClone.y = instY + relY + elH / 2 - conClone.height / 2;
            } else if (lado === 'superior') {
              try { conClone.resize(conClone.width, BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + relY + itemNumH + 4)); } catch(_e) {}
              conClone.x = instX + relX + elW / 2 - conClone.width / 2;
              conClone.y = instY - OUT_GAP - BADGE_SIZE - itemNumH - 4;
            } else {
              try { conClone.resize(conClone.width, BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + (instH - relY - elH))); } catch(_e) {}
              conClone.x = instX + relX + elW / 2 - conClone.width / 2;
              conClone.y = instY + relY + elH;
            }
          }
          if (tipoVariante === 'nível de título' && c.especificacao) {
            const _actKeys = Object.keys((conClone as any).componentProperties || {});
            const _actHKey = _actKeys.find(k => k.toLowerCase().includes('nível') || k.toLowerCase().includes('nivel') || k.toLowerCase().includes('título') || k.toLowerCase().includes('titulo') || k.toLowerCase().includes('heading'));
            if (_actHKey) try { (conClone as InstanceNode).setProperties({ [_actHKey]: c.especificacao }); } catch(_e) {}
          }
          const numNodeCon = (conClone as any).findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
          const _badgeValAct = tipoVariante === 'nível de título' && c.especificacao ? c.especificacao : letra;
          if (numNodeCon) await updateText(numNodeCon, _badgeValAct);
        }
      }

      oldMarkers.forEach(m => m.remove());
      figma.currentPage.selection = [instance];
      figma.viewport.scrollAndZoomIntoView([instance]);
    } catch(e) {
      componenteSRVariacaoAtivo = null;
    }
  }

  else if (msg.type === 'deactivate-sr-variation') {
    componenteSRVariacaoAtivo = null;
  }

  else if (msg.type === 'append-sr-marker') {
    try {
      const srImageFrame = await getSRImageFrame();
      const inst = componenteSRVariacaoAtivo;
      if (!srImageFrame || !inst) return;
      const c = msg.connector;
      const letra: string = msg.letra || 'A';
      const _srAppMeta = JSON.parse((inst as any).getPluginData?.('a11y-meta') || '{}');
      const _srAppVarId: string = _srAppMeta.variationId || 'default';
      const instX = (inst as any).x as number;
      const instY = (inst as any).y as number;
      const instW = (inst as any).width  as number;
      const instH = (inst as any).height as number;
      const modelConector    = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Screen Reader Conector')   as InstanceNode | undefined;
      const modelAgrupamento = srImageFrame.findOne(n => n.name === '[a11y] Screen Reader Gruping') as InstanceNode | undefined;
      const modelItemNumber  = Array.from(srImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;
      const itemNumH = modelItemNumber ? (modelItemNumber as any).height : 36;
      if (c.tipoAnotacao === 'agrupamento' && modelAgrupamento) {
        const agClone = modelAgrupamento.clone();
        agClone.setPluginData('a11y-marker', _srAppVarId);
        agClone.visible = true;
        agClone.resize(c.width || 80, c.height || 40);
        srImageFrame.appendChild(agClone);
        agClone.x = instX + (c.relX || 0);
        agClone.y = instY + (c.relY || 0);
        let orientacao: string = (c as any).orientacao || '';
        if (!orientacao) {
          const _agAppRX   = (c.relX || 0) + (c.width  || 80);
          const _agAppBot  = (c.relY || 0) + (c.height || 40);
          const _agAppRGap = instW - _agAppRX;
          const _agAppVGap = instH - _agAppBot;
          if      (_agAppRGap < (c.width  || 80) * 0.15) orientacao = 'direita';
          else if (_agAppVGap < (c.height || 40) * 0.15) orientacao = 'inferior';
          else orientacao = (_agAppRX - (c.width || 80) / 2) < instW / 2 ? 'esquerda' : 'direita';
        }
        const _agAppT = (c.tipo || c.tipoConnector || '').toLowerCase();
        let _agAppTipo = 'função valor rótulos';
        if (_agAppT.includes('decorat'))                                                                              _agAppTipo = 'elementos decorativos';
        else if (_agAppT.includes('marco') || _agAppT.includes('naveg'))                                             _agAppTipo = 'marcos de navegação';
        else if (_agAppT.includes('título') || _agAppT.includes('titulo') || _agAppT.includes('nível') || _agAppT.includes('nivel')) _agAppTipo = 'nível de título';
        else if (_agAppT.includes('infor') || _agAppT.includes('adicional'))                                         _agAppTipo = 'informações adicionais';
        try { (agClone as InstanceNode).setProperties({ 'tipo': _agAppTipo, 'orientação': orientacao }); } catch(_e) {}
        if (_agAppTipo === 'nível de título' && c.especificacao) {
          const _agAppKeys = Object.keys((agClone as any).componentProperties || {});
          const _agAppHKey = _agAppKeys.find(k => k.toLowerCase().includes('nível') || k.toLowerCase().includes('nivel') || k.toLowerCase().includes('título') || k.toLowerCase().includes('titulo') || k.toLowerCase().includes('heading'));
          if (_agAppHKey) {
            try { (agClone as InstanceNode).setProperties({ [_agAppHKey]: c.especificacao }); } catch(_e) {
              try { (agClone as InstanceNode).setProperties({ [_agAppHKey]: c.especificacao.toUpperCase() }); } catch(_e2) { /* ignore */ }
            }
          }
        }
        const agTexts = (agClone as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
        const agLetraTxt = agTexts.find(n => /^H\d+$/i.test(n.characters.trim()))
          || agTexts.find(n => /^[A-Za-z✦]/.test(n.characters.trim()))
          || agTexts[0] || null;
        const _agAppBadge = _agAppTipo === 'nível de título' && c.especificacao ? c.especificacao : letra;
        if (agLetraTxt) await updateText(agLetraTxt, _agAppBadge);
      } else if (modelConector && c.tipoAnotacao !== 'agrupamento') {
        const conClone = modelConector.clone();
        conClone.setPluginData('a11y-marker', _srAppVarId);
        conClone.visible = true;
        srImageFrame.appendChild(conClone);
        const t = (c.tipo || '').toLowerCase();
        let tipoVariante = 'função valor rótulos';
        if (t.includes('decorat'))                                                                              tipoVariante = 'elementos decorativos';
        else if (t.includes('marco') || t.includes('naveg'))                                                   tipoVariante = 'marcos de navegação';
        else if (t.includes('título') || t.includes('titulo') || t.includes('heading') || t.includes('nível') || t.includes('nivel')) tipoVariante = 'nível de título';
        else if (t.includes('infor') || t.includes('adicional'))                                               tipoVariante = 'informações adicionais';
        if ((c as any).positioned) {
          const relX = c.relX || 0, relY = c.relY || 0;
          const savedW = (c as any).width || conClone.width, savedH = (c as any).height || conClone.height;
          let lado: string;
          if      (relX + savedW <= 0)  lado = 'esquerda';
          else if (relX >= instW)       lado = 'direita';
          else if (relY + savedH <= 0)  lado = 'superior';
          else if (relY >= instH)       lado = 'inferior';
          else {
            const dL = Math.abs(relX), dR = Math.abs(instW - relX - savedW);
            const dT = Math.abs(relY), dB = Math.abs(instH - relY - savedH);
            const minD = Math.min(dL, dR, dT, dB);
            lado = minD === dL ? 'esquerda' : minD === dR ? 'direita' : minD === dT ? 'superior' : 'inferior';
          }
          try { (conClone as InstanceNode).setProperties({ 'tipo': tipoVariante, 'conector': lado }); } catch(_e) {}
          try { conClone.resize(savedW, savedH); } catch(_e) {}
          conClone.x = instX + relX;
          conClone.y = instY + relY;
        } else {
          const distLeft = c.relX || 0, distRight = instW - ((c.relX || 0) + (c.width || 20));
          const distTop  = c.relY || 0, distBottom = instH - ((c.relY || 0) + (c.height || 20));
          const minDist  = Math.min(distLeft, distRight, distTop, distBottom);
          const lado = minDist === distLeft ? 'esquerda' : minDist === distRight ? 'direita' : minDist === distTop ? 'superior' : 'inferior';
          try { (conClone as InstanceNode).setProperties({ 'tipo': tipoVariante, 'conector': lado }); } catch(_e) {}
          const BADGE_SIZE = 32, OUT_GAP = 8;
          const relX = c.relX || 0, relY = c.relY || 0, elW = c.width || 0, elH = c.height || 0;
          if (lado === 'esquerda') {
            try { conClone.resize(BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + relX), conClone.height); } catch(_e) {}
            conClone.x = instX - OUT_GAP - BADGE_SIZE;
            conClone.y = instY + relY + elH / 2 - conClone.height / 2;
          } else if (lado === 'direita') {
            try { conClone.resize(BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + (instW - relX - elW)), conClone.height); } catch(_e) {}
            conClone.x = instX + relX + elW;
            conClone.y = instY + relY + elH / 2 - conClone.height / 2;
          } else if (lado === 'superior') {
            try { conClone.resize(conClone.width, BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + relY + itemNumH + 4)); } catch(_e) {}
            conClone.x = instX + relX + elW / 2 - conClone.width / 2;
            conClone.y = instY - OUT_GAP - BADGE_SIZE - itemNumH - 4;
          } else {
            try { conClone.resize(conClone.width, BADGE_SIZE + Math.max(OUT_GAP, OUT_GAP + (instH - relY - elH))); } catch(_e) {}
            conClone.x = instX + relX + elW / 2 - conClone.width / 2;
            conClone.y = instY + relY + elH;
          }
        }
        if (tipoVariante === 'nível de título' && c.especificacao) {
          const _appKeys = Object.keys((conClone as any).componentProperties || {});
          const _appHKey = _appKeys.find(k => k.toLowerCase().includes('nível') || k.toLowerCase().includes('nivel') || k.toLowerCase().includes('título') || k.toLowerCase().includes('titulo') || k.toLowerCase().includes('heading'));
          if (_appHKey) try { (conClone as InstanceNode).setProperties({ [_appHKey]: c.especificacao }); } catch(_e) {}
        }
        const numNodeCon = (conClone as any).findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
        const _badgeValApp = tipoVariante === 'nível de título' && c.especificacao ? c.especificacao : letra;
        if (numNodeCon) await updateText(numNodeCon, _badgeValApp);
      }
    } catch(_e) {}
  }

  else if (msg.type === 'delete-sr-variation-frame') {
    try {
      const srImageFrame = await getSRImageFrame();
      if (!srImageFrame || !msg.variationId) return;
      let wasActive = false;
      if (componenteSRVariacaoAtivo) {
        try {
          const meta = JSON.parse((componenteSRVariacaoAtivo as any).getPluginData?.('a11y-meta') || '{}');
          wasActive = meta.variationId === msg.variationId;
        } catch {}
      }
      Array.from(srImageFrame.children).filter(n => {
        try { const d = JSON.parse(n.getPluginData('a11y-meta') || '{}'); return d.type === 'sr-variation-component' && d.variationId === msg.variationId; } catch { return false; }
      }).forEach(n => n.remove());
      (srImageFrame as any).findAll((n: any) => n.getPluginData('a11y-marker') === msg.variationId).forEach((n: any) => n.remove());
      if (wasActive) componenteSRVariacaoAtivo = null;
    } catch(e) {}
  }

  else if (msg.type === 'save-leitor-tela') {
    if (!handoffAtivo) return;
    const dbInstance = (handoffAtivo as any).findOne((n: SceneNode) => n.name === '[dsc-h] Plugin Data A11y') as InstanceNode | null;
    const baseRaw = dbInstance
      ? dbInstance.getPluginData('a11y-component-data')
      : (handoffAtivo as any).getPluginData('a11y-component-data');
    const dados = JSON.parse(baseRaw || '{}');
    dados.conectores_leitor = msg.conectores_leitor ?? [];
    dados.sem_leitor = msg.sem_leitor ?? false;
    dados.variacoes_leitor = msg.variacoes_leitor ?? [];
    const saved = JSON.stringify(dados);
    if (dbInstance) dbInstance.setPluginData('a11y-component-data', saved);
    (handoffAtivo as any).setPluginData('a11y-component-data', saved);

    if (componentePrincipalAtivo) {
      const dataNode = await resolveDataNode(componentePrincipalAtivo);
      if (dataNode) dataNode.setPluginData('a11y-component-data', saved);
    }
  }

  else if (msg.type === 'import-old-section') {
    if (!handoffAtivo) {
      figma.ui.postMessage({ type: 'old-section-data', section: msg.section, found: false, data: {} });
      return;
    }
    try {
      if (msg.section === 'geral') {
        const result = await parseOldGeralData(handoffAtivo, componentePrincipalAtivo);
        const found = result.visualPairs.length > 0 || result.pluginDataMapeamentos.length > 0 || result.pluginDataPlataformas.length > 0;
        figma.ui.postMessage({ type: 'old-section-data', section: 'geral', found, data: result });
      } else if (msg.section === 'toque') {
        const result = await parseOldTouchAreas(handoffAtivo);
        figma.ui.postMessage({ type: 'old-section-data', section: 'toque', found: result.variacoes.some(v => v.areas.length > 0), data: result });
      } else if (msg.section === 'tabulacao') {
        const result = await parseOldTabOrder(handoffAtivo);
        figma.ui.postMessage({ type: 'old-section-data', section: 'tabulacao', found: result.variacoes.some(v => v.items.length > 0), data: result });
      } else if (msg.section === 'leitor') {
        const result = await parseOldSRData(handoffAtivo);
        figma.ui.postMessage({ type: 'old-section-data', section: 'leitor', found: result.variacoes.length > 0, data: result });
      }
    } catch (e) {
      figma.ui.postMessage({ type: 'old-section-data', section: msg.section, found: false, data: {}, error: String(e) });
    }
  }

  else if (msg.type === 'save-partial-data') {
    if (!handoffAtivo) return;
    const dbInstance = await getCachedPluginDataNode();
    const baseRaw = dbInstance
      ? dbInstance.getPluginData('a11y-component-data')
      : (handoffAtivo as any).getPluginData('a11y-component-data');
    const dados = JSON.parse(baseRaw || '{}');
    dados[msg.key] = msg.value;
    const saved = JSON.stringify(dados);
    if (dbInstance) dbInstance.setPluginData('a11y-component-data', saved);
    (handoffAtivo as any).setPluginData('a11y-component-data', saved);
    if (componentePrincipalAtivo) {
      const dataNode = await resolveDataNode(componentePrincipalAtivo);
      if (dataNode) dataNode.setPluginData('a11y-component-data', saved);
    }
  }

  else if (msg.type === 'get-sr-selection') {
    const selection = figma.currentPage.selection.filter(n => n.name !== '[a11y-marker]');
    if (selection.length === 0) {
      figma.ui.postMessage({ type: 'sr-selection-result', error: 'Selecione um elemento no canvas.' });
      return;
    }
    const comp = (componenteSRVariacaoAtivo ?? componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as SceneNode & { absoluteTransform: Transform };
    if (!comp) {
      figma.ui.postMessage({ type: 'sr-selection-result', error: 'Nenhum componente ativo.' });
      return;
    }
    const compX = comp.absoluteTransform[0][2];
    const compY = comp.absoluteTransform[1][2];
    const node = selection[0] as SceneNode & { absoluteTransform: Transform; width: number; height: number };
    const absX = (node as any).absoluteTransform[0][2];
    const absY = (node as any).absoluteTransform[1][2];
    figma.ui.postMessage({
      type: 'sr-selection-result',
      item: {
        tipo: msg.tipo,
        nodeId: node.id,
        layerName: node.name,
        relX: absX - compX,
        relY: absY - compY,
        width: (node as any).width,
        height: (node as any).height,
      }
    });
  }

  else if (msg.type === 'create-sr-overlay') {
    try {
      const srImageFrame = await getSRImageFrame();
      if (!srImageFrame) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Frame de leitor de tela não encontrado. Gere o handoff primeiro.' });
        return;
      }
      const inst = componenteSRVariacaoAtivo;
      if (!inst) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhuma variação de leitor de tela ativa.' });
        return;
      }
      const tipoAnotacao = (msg.tipoAnotacao as string) || 'conector';
      tempSROverlayTipo   = tipoAnotacao;
      tempSROverlayRefX   = (inst as any).x as number;
      tempSROverlayRefY   = (inst as any).y as number;
      const instX = (inst as any).x as number;
      const instY = (inst as any).y as number;
      const instW = (inst as any).width  as number;
      const instH = (inst as any).height as number;

      let modelNode: InstanceNode | undefined;
      if (tipoAnotacao === 'agrupamento') {
        modelNode = srImageFrame.findOne(n => n.name === '[a11y] Screen Reader Gruping') as InstanceNode | undefined;
      } else {
        modelNode = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Screen Reader Conector') as InstanceNode | undefined;
      }
      if (!modelNode) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Modelo de conector não encontrado. Gere o handoff primeiro.' });
        return;
      }

      const clone = modelNode.clone() as InstanceNode;
      clone.visible = true;
      srImageFrame.appendChild(clone);

      if (tipoAnotacao === 'agrupamento') {
        clone.resize(Math.min(80, instW), Math.min(40, instH));
        clone.x = instX + Math.round(instW / 4);
        clone.y = instY + Math.round(instH / 4);
        const _agOvT = ((msg.tipoConnector as string) || '').toLowerCase();
        let _agOvTipo = 'função valor rótulos';
        if (_agOvT.includes('decorat'))                                                                              _agOvTipo = 'elementos decorativos';
        else if (_agOvT.includes('marco') || _agOvT.includes('naveg'))                                              _agOvTipo = 'marcos de navegação';
        else if (_agOvT.includes('título') || _agOvT.includes('titulo') || _agOvT.includes('nível') || _agOvT.includes('nivel')) _agOvTipo = 'nível de título';
        else if (_agOvT.includes('infor') || _agOvT.includes('adicional'))                                          _agOvTipo = 'informações adicionais';
        try { (clone as InstanceNode).setProperties({ 'tipo': _agOvTipo }); } catch(_e) {}
        if (_agOvTipo === 'nível de título' && msg.especificacao) {
          const _agOvKeys = Object.keys((clone as InstanceNode).componentProperties || {});
          const _agOvHKey = _agOvKeys.find(k => k.toLowerCase().includes('titulo') || k.toLowerCase().includes('título') || k.toLowerCase().includes('heading'));
          if (_agOvHKey) try { (clone as InstanceNode).setProperties({ [_agOvHKey]: msg.especificacao }); } catch(_e) {}
        }
      } else {
        const t = ((msg.tipoConnector as string) || '').toLowerCase();
        let tipoVariante = 'função valor rótulos';
        if (t.includes('decorat'))                                                                              tipoVariante = 'elementos decorativos';
        else if (t.includes('marco') || t.includes('naveg'))                                                   tipoVariante = 'marcos de navegação';
        else if (t.includes('título') || t.includes('titulo') || t.includes('heading') || t.includes('nível') || t.includes('nivel')) tipoVariante = 'nível de título';
        else if (t.includes('infor') || t.includes('adicional'))                                               tipoVariante = 'informações adicionais';
        try { (clone as InstanceNode).setProperties({ 'tipo': tipoVariante, 'conector': 'direita' }); } catch(_e) {}
        if (tipoVariante === 'nível de título' && msg.especificacao) {
          const _overlayKeys = Object.keys((clone as any).componentProperties || {});
          const _hKey = _overlayKeys.find(k => k.toLowerCase().includes('nível') || k.toLowerCase().includes('nivel') || k.toLowerCase().includes('título') || k.toLowerCase().includes('titulo') || k.toLowerCase().includes('heading'));
          if (_hKey) try { (clone as InstanceNode).setProperties({ [_hKey]: msg.especificacao }); } catch(_e) {}
        }
        clone.x = instX + instW + 8;
        clone.y = instY + Math.round(instH / 2 - clone.height / 2);
      }

      tempSROverlayId = clone.id;
      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);
      figma.ui.postMessage({ type: 'sr-overlay-created' });
    } catch(e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar conector: ${e}` });
    }
  }

  else if (msg.type === 'confirm-sr-area') {
    if (!tempSROverlayId) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum conector encontrado. Clique em Confirmar para criar o conector primeiro.' });
      figma.ui.postMessage({ type: 'sr-overlay-missing' });
      return;
    }
    const overlay = await figma.getNodeByIdAsync(tempSROverlayId) as SceneNode | null;
    if (!overlay) { tempSROverlayId = null; return; }
    // Lê orientação diretamente da propriedade do componente — o que o usuário viu é o que fica
    let _ciOrient = 'esquerda';
    try {
      const _props = (overlay as InstanceNode).componentProperties;
      const _orientKey = Object.keys(_props).find(k => k.toLowerCase().includes('orienta'));
      if (_orientKey) _ciOrient = String((_props[_orientKey] as any).value || 'esquerda');
    } catch(_e) {}
    const item = {
      tipo: tempSROverlayTipo,
      relX: Math.round((overlay as any).x - tempSROverlayRefX),
      relY: Math.round((overlay as any).y - tempSROverlayRefY),
      width: Math.round((overlay as any).width),
      height: Math.round((overlay as any).height),
      positioned: true,
      orientacao: _ciOrient,
    };
    overlay.remove();
    tempSROverlayId = null;
    figma.ui.postMessage({ type: 'sr-area-confirmed', item });
  }

  else if (msg.type === 'cancel-sr-area') {
    if (tempSROverlayId) {
      const node = await figma.getNodeByIdAsync(tempSROverlayId);
      if (node) node.remove();
      tempSROverlayId = null;
    }
  }
};

// ==========================================
// 4. MONITOR DE SELEÇÃO E VALIDAÇÃO
// ==========================================
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  if (!contextoTravado) {
    if (selection.length > 0) {
      figma.ui.postMessage({ type: 'start-loading' });
      tentarTravarContexto(selection);
    } else {
      figma.ui.postMessage({ type: 'waiting-selection' });
    }
  }
});

function tentarTravarContexto(selection: readonly SceneNode[], skipUISetup = false) {
  const handoffs = selection.filter(n =>
    n.name.includes("[dsc-h] Template Handoff") ||
    n.name.startsWith('[A11Y Handoff]')
  );
  const components = selection.filter(n =>
    (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET' || n.type === 'INSTANCE' || n.type === 'FRAME') && !handoffs.includes(n)
  );

  // Caso especial: apenas o frame gerado selecionado (sem componente) → carrega direto
  if (handoffs.length === 1 && components.length === 0) {
    const h = handoffs[0];
    if (h.type !== 'INSTANCE' && h.name.startsWith('[A11Y Handoff]')) {
      componentePrincipalAtivo = null;
      handoffAtivo = h;
      contextoTravado = true;
      if (!skipUISetup) carregarDadosEEnviarParaUI(h);
      return;
    }
  }

  if (components.length !== 1 || handoffs.length === 0) {
    figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }

  // Prioriza frame gerado sobre template instância, se ambos selecionados
  const generatedHandoff = handoffs.find(n => n.name.startsWith('[A11Y Handoff]'));
  const handoff = generatedHandoff ?? handoffs[0];
  const component = components[0];

  // Validação de variante para o template de handoff
  if (handoff.type === 'INSTANCE') {
    const props = handoff.componentProperties;
    for (const propName in props) {
      const prop = props[propName];
      if (prop.type === 'VARIANT' && prop.value !== 'Acessibility') {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Selecione a variante de Acessibilidade no componente de Template de Handoff.' });
        return;
      }
    }
  }

  // Handoff já gerado (FRAME): valida que o componente selecionado é o correto
  if (handoff.type !== "INSTANCE" && handoff.name.startsWith('[A11Y Handoff]')) {
    const expectedName = handoff.name.slice('[A11Y Handoff]'.length).trim();
    if (component.name !== expectedName) {
      figma.ui.postMessage({ type: 'feedback', message: `⚠️ Este handoff pertence ao componente "${expectedName}". Selecione o componente correto.` });
      return;
    }
  }

  componentePrincipalAtivo = component;
  handoffAtivo = handoff;
  contextoTravado = true;
  if (!skipUISetup) carregarDadosEEnviarParaUI(handoffAtivo);
}

function parseMasterList(dbInstance: InstanceNode): { mapeamento: string; descricao: string; utilizacao: string }[] {
  const tabela = (dbInstance as any).findOne(
    (n: SceneNode) => n.name === "Mapeamento de Teclado e Gestos do Plugin"
  ) as FrameNode | null;
  if (!tabela) return [];

  const rows = (tabela.children as SceneNode[]).filter(
    (n) => n.type === "FRAME" || n.type === "INSTANCE" || n.type === "COMPONENT"
  );

  const resultado: { mapeamento: string; descricao: string; utilizacao: string }[] = [];

  for (const row of rows) {
    const textos = (row as FrameNode).findAll((n: SceneNode) => n.type === "TEXT") as TextNode[];
    if (textos.length < 3) continue;

    const mapeamento = textos[0].characters.trim();
    const descricao  = textos[1].characters.trim();
    const utilizacao = textos[2].characters.trim();

    // Pula linha de cabeçalho (valores idênt1icos ao nome da coluna)
    if (
      mapeamento.toLowerCase() === "mapeamento" ||
      descricao.toLowerCase()  === "descrição"  ||
      utilizacao.toLowerCase() === "utilização"
    ) continue;

    if (!mapeamento || !utilizacao) continue;

    resultado.push({ mapeamento, descricao, utilizacao });
  }

  return resultado;
}

function parseRolesList(dbInstance: InstanceNode): { nome: string; especificacao: string; descricao: string; observacao: string; codigoWeb: string; codigoRN: string; nomeAcessivel: string; tipoConnector: string; revisao: string }[] {
  const tabela = (dbInstance as any).findOne(
    (n: SceneNode) => n.name === 'Roles Plugin'
  ) as FrameNode | null;
  if (!tabela) return [];

  const rows = (tabela.children as SceneNode[]).filter(
    (n) => n.type === 'FRAME' || n.type === 'INSTANCE' || n.type === 'COMPONENT'
  );

  const resultado: { nome: string; especificacao: string; descricao: string; observacao: string; codigoWeb: string; codigoRN: string; nomeAcessivel: string; tipoConnector: string; revisao: string }[] = [];

  for (const row of rows) {
    const textos = ((row as FrameNode).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[])
      .sort((a, b) => a.x - b.x);
    if (textos.length < 8) continue;

    const nome = textos[0]?.characters.trim() ?? '';
    if (nome.toLowerCase() === 'nome' || !nome) continue;

    resultado.push({
      nome,
      especificacao: textos[1]?.characters.trim() ?? '',
      descricao:     textos[2]?.characters.trim() ?? '',
      observacao:    textos[3]?.characters.trim() ?? '',
      codigoWeb:     textos[4]?.characters.trim() ?? '',
      codigoRN:      textos[5]?.characters.trim() ?? '',
      nomeAcessivel: textos[6]?.characters.trim() ?? '',
      tipoConnector: textos[7]?.characters.trim() ?? '',
      revisao:       textos[8]?.characters.trim() ?? '',
    });
  }

  return resultado;
}

// ==========================================
// PARSER DE MIGRAÇÃO — LEITOR DE TELA (Fase 4)
// ==========================================

async function parseOldSRData(handoff: SceneNode): Promise<{
  variacoes: { nome: string; propriedades: Record<string, string>; rawConnectors: { descricao: string; relX?: number; relY?: number; width?: number; height?: number; tipoAnotacao?: string; migrBadgeIdx?: number }[] }[];
}> {
  const variacoes: { nome: string; propriedades: Record<string, string>; rawConnectors: { descricao: string; relX?: number; relY?: number; width?: number; height?: number; tipoAnotacao?: string; migrBadgeIdx?: number }[] }[] = [];

  const srFrame = (handoff as any).findOne(
    (n: SceneNode) => n.name === 'screen reader'
  ) as FrameNode | null;
  if (!srFrame) return { variacoes };

  // Lê instâncias de componente no image frame, ordenadas por X (esquerda → direita = ordem das variações)
  const imageFrame = Array.from(srFrame.children as SceneNode[]).find(
    (n: SceneNode) => n.name === 'image'
  ) as FrameNode | undefined;

  const componentInstances: { props: Record<string, string>; x: number; y: number; w: number; h: number }[] = [];
  if (imageFrame) {
    const instances = Array.from(imageFrame.children as SceneNode[]).filter(
      (n: SceneNode) => n.type === 'INSTANCE' &&
        !n.name.startsWith('[a11y]') &&
        !n.name.startsWith('[dsc-h]') &&
        n.name !== 'tag'
    ) as InstanceNode[];

    instances.sort((a, b) => a.x - b.x);

    for (const inst of instances) {
      const raw = (inst as InstanceNode).componentProperties || {};
      const props: Record<string, string> = {};
      for (const [key, val] of Object.entries(raw)) {
        // Remove sufixo "#XXXX:XX" do nome da propriedade
        const cleanKey = key.replace(/#[\w:]+$/, '').trim();
        props[cleanKey] = String((val as any).value ?? '');
      }
      componentInstances.push({ props, x: inst.x, y: inst.y, w: inst.width, h: inst.height });
    }
  }

  // Agrupa badges [a11y] do imageFrame por variação para incluir posição na migração
  const badgesByVar: Array<Array<{ relX: number; relY: number; w: number; h: number; tipoAnotacao: string }>> =
    componentInstances.map(() => []);

  if (imageFrame && componentInstances.length > 0) {
    const nearestIdx = (badgeX: number, badgeW: number): number => {
      const cx = badgeX + badgeW / 2;
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < componentInstances.length; i++) {
        const ci = componentInstances[i];
        const d = Math.abs(cx - (ci.x + ci.w / 2));
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    };

    // Conectores regulares: badge fica fora do componente → converter para posição do elemento
    const connectorNodes = (Array.from(imageFrame.children as SceneNode[]) as SceneNode[]).filter(
      n => n.name === '[a11y] Screen Reader Conector'
    );
    for (const badge of connectorNodes) {
      const idx = nearestIdx(badge.x, badge.width);
      const ci = componentInstances[idx];
      const isLeft  = badge.x + badge.width <= ci.x;
      const isRight = badge.x >= ci.x + ci.w;
      const isAbove = badge.y + badge.height <= ci.y;
      const isBelow = badge.y >= ci.y + ci.h;
      const badgeCY = badge.y + badge.height / 2;
      const badgeCX = badge.x + badge.width / 2;
      let relX: number, relY: number;
      if (isLeft) {
        relX = 0;
        relY = Math.max(0, Math.min(ci.h - 20, badgeCY - ci.y - 10));
      } else if (isRight) {
        relX = ci.w - 20;
        relY = Math.max(0, Math.min(ci.h - 20, badgeCY - ci.y - 10));
      } else if (isAbove) {
        relX = Math.max(0, Math.min(ci.w - 20, badgeCX - ci.x - 10));
        relY = 0;
      } else if (isBelow) {
        relX = Math.max(0, Math.min(ci.w - 20, badgeCX - ci.x - 10));
        relY = ci.h - 20;
      } else {
        relX = Math.max(0, badge.x - ci.x);
        relY = Math.max(0, badge.y - ci.y);
      }
      badgesByVar[idx].push({ relX, relY, w: 20, h: 20, tipoAnotacao: '' });
    }

    // Agrupamentos: usar posição e tamanho reais (são retângulos que cobrem a área)
    const agrupamentoNodes = (Array.from(imageFrame.children as SceneNode[]) as SceneNode[]).filter(
      n => n.name === '[a11y] Screen Reader Gruping'
    );
    for (const ag of agrupamentoNodes) {
      const idx = nearestIdx(ag.x, ag.width);
      const ci = componentInstances[idx];
      badgesByVar[idx].push({
        relX: ag.x - ci.x,
        relY: ag.y - ci.y,
        w: ag.width,
        h: ag.height,
        tipoAnotacao: 'agrupamento'
      });
    }

    for (const grp of badgesByVar) grp.sort((a, b) => a.relY - b.relY || a.relX - b.relX);
  }

  const specsFrame = Array.from(srFrame.children as SceneNode[]).find(
    (n: SceneNode) => n.name === 'specs'
  ) as FrameNode | undefined;
  if (!specsFrame) return { variacoes };

  const contentBlocks = Array.from(specsFrame.children as SceneNode[]).filter(
    (n: SceneNode) => n.name === 'content'
  ) as FrameNode[];

  for (let idx = 0; idx < contentBlocks.length; idx++) {
    const block = contentBlocks[idx];

    // Nome: Element name → Title
    const elementName = Array.from(block.children as SceneNode[]).find(
      (n: SceneNode) => n.name === 'Element name'
    ) as FrameNode | undefined;
    const titleNode = elementName
      ? (elementName as any).findOne((n: SceneNode) => n.type === 'TEXT' && n.name === 'Title') as TextNode | null
      : null;
    const nomeVariacao = titleNode?.characters.trim() || `Variação ${idx + 1}`;

    // Propriedades do componente correspondente (por ordem)
    const propriedades = componentInstances[idx]?.props ?? {};

    const boxes = Array.from(block.children as SceneNode[]).filter(
      (n: SceneNode) => n.name === '[a11y] Box specs LT'
    ) as FrameNode[];

    const rawConnectors: { descricao: string; relX?: number; relY?: number; width?: number; height?: number; tipoAnotacao?: string; migrBadgeIdx?: number }[] = [];

    for (const box of boxes) {
      const contentFrame = Array.from(box.children as SceneNode[]).find(
        (n: SceneNode) => n.name === 'Content'
      ) as FrameNode | undefined;
      if (!contentFrame) continue;

      const descricaoFrame = Array.from(contentFrame.children as SceneNode[]).find(
        (n: SceneNode) => n.name === 'Descrição'
      ) as FrameNode | undefined;
      if (!descricaoFrame) continue;

      const textNode = (descricaoFrame as any).findOne(
        (n: SceneNode) => n.type === 'TEXT' && n.name === 'Text'
      ) as TextNode | null;
      if (!textNode || !textNode.characters.trim()) continue;

      const currentBadgeIdx = rawConnectors.length;
      const badgePos = badgesByVar[idx]?.[currentBadgeIdx];
      rawConnectors.push({
        descricao: textNode.characters.trim(),
        migrBadgeIdx: currentBadgeIdx,
        ...(badgePos ? { relX: badgePos.relX, relY: badgePos.relY, width: badgePos.w, height: badgePos.h, tipoAnotacao: badgePos.tipoAnotacao } : {})
      });
    }

    if (rawConnectors.length > 0) {
      variacoes.push({ nome: nomeVariacao, propriedades, rawConnectors });
    }
  }

  return { variacoes };
}

// ==========================================
// PARSER DE MIGRAÇÃO — TABULAÇÃO (Fase 3)
// ==========================================

type TabItem = { nome: string; layerName: string; nodeId: string; relX: number; relY: number; width: number; height: number };
type TabVariacao = { nome: string; propriedades: Record<string, string>; items: TabItem[] };

async function parseOldTabOrder(handoff: SceneNode): Promise<{ variacoes: TabVariacao[] }> {
  const variacoes: TabVariacao[] = [];

  const focusOrderFrame = (handoff as any).findOne(
    (n: SceneNode) => n.name === 'focus order'
  ) as FrameNode | null;
  if (!focusOrderFrame) return { variacoes };

  const imageFrame = Array.from(focusOrderFrame.children as SceneNode[]).find(
    (n: SceneNode) => n.name === 'image'
  ) as FrameNode | undefined;
  if (!imageFrame) return { variacoes };

  // Componentes no imageFrame ordenados por X (um por variação)
  const instances = Array.from(imageFrame.children as SceneNode[])
    .filter((n: SceneNode) => n.type === 'INSTANCE' && !n.name.startsWith('[a11y]') && !n.name.startsWith('[dsc-h]') && n.name !== 'tag')
    .sort((a: SceneNode, b: SceneNode) => ((a as any).absoluteTransform?.[0]?.[2] ?? 0) - ((b as any).absoluteTransform?.[0]?.[2] ?? 0)) as InstanceNode[];

  // Todos os [a11y] Order badges no imageFrame
  const orders = Array.from(imageFrame.children as SceneNode[]).filter(
    (n: SceneNode) => n.name === '[a11y] Order'
  ) as SceneNode[];

  if (instances.length === 0) return { variacoes };

  // Agrupa badges por componente usando sobreposição de X absoluto
  const instBounds = instances.map(inst => ({
    inst,
    left:  (inst as any).absoluteTransform?.[0]?.[2] ?? 0,
    right: ((inst as any).absoluteTransform?.[0]?.[2] ?? 0) + ((inst as any).width ?? 0),
    top:   (inst as any).absoluteTransform?.[1]?.[2] ?? 0,
  }));

  const groups = new Map<InstanceNode, SceneNode[]>();
  instances.forEach(inst => groups.set(inst, []));

  for (const order of orders) {
    const cx = ((order as any).absoluteTransform?.[0]?.[2] ?? 0) + ((order as any).width ?? 0) / 2;
    const match = instBounds.find(b => cx >= b.left && cx <= b.right) ?? instBounds[0];
    groups.get(match.inst)?.push(order);
  }

  for (let idx = 0; idx < instances.length; idx++) {
    const inst = instances[idx];
    const instBound = instBounds[idx];
    const badges = groups.get(inst) ?? [];
    if (badges.length === 0) continue;

    // componentProperties desta variação
    const rawProps = (inst as InstanceNode).componentProperties ?? {};
    const propriedades: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawProps)) {
      propriedades[key.replace(/#[\w:]+$/, '').trim()] = String((val as any).value ?? '');
    }

    // Extrai número e posição de cada badge
    const parsed: { num: number; item: TabItem }[] = [];
    for (const order of badges) {
      const allTexts = (order as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
      const numberNode = allTexts.find((n: TextNode) => n.name === 'Number' || /^\d+$/.test(n.characters.trim()));
      const num = numberNode ? parseInt(numberNode.characters.trim()) : NaN;
      if (isNaN(num)) continue;

      const absX = (order as any).absoluteTransform?.[0]?.[2] ?? 0;
      const absY = (order as any).absoluteTransform?.[1]?.[2] ?? 0;

      parsed.push({
        num,
        item: {
          nome: `Tab ${num}`,
          layerName: '',
          nodeId: '',
          relX: Math.round(absX - instBound.left),
          relY: Math.round(absY - instBound.top),
          width:  Math.round((order as any).width  ?? 0),
          height: Math.round((order as any).height ?? 0),
        }
      });
    }

    parsed.sort((a, b) => a.num - b.num);
    const nomeVar = idx === 0 ? 'Default' : (inst.name || `Variação ${idx + 1}`);
    variacoes.push({ nome: nomeVar, propriedades, items: parsed.map(p => p.item) });
  }

  return { variacoes };
}

// ==========================================
// PARSER DE MIGRAÇÃO — ÁREA DE TOQUE (Fase 2)
// ==========================================

type TouchArea = { nome: string; width: number; height: number; preset: string; relX: number; relY: number };
type TouchVariacao = { nome: string; propriedades: Record<string, string>; areas: TouchArea[] };

function toTouchPreset(h: number, w: number): string {
  if (h === 44 && w === 44) return '44x44';
  if (h === 44) return '44x100';
  if (h === 24 && w === 24) return '24x24';
  if (h === 24) return '24x100';
  return 'livre';
}

async function parseOldTouchAreas(handoff: SceneNode): Promise<{ variacoes: TouchVariacao[] }> {
  const variacoes: TouchVariacao[] = [];

  // Abordagem estruturada: target area → specs → element[] + image → instances[]
  const targetAreaFrame = (handoff as any).findOne(
    (n: SceneNode) => n.name === 'target area'
  ) as FrameNode | null;

  if (targetAreaFrame) {
    const specsFrame = Array.from(targetAreaFrame.children as SceneNode[]).find(
      (n: SceneNode) => n.name === 'specs'
    ) as FrameNode | undefined;
    const imageFrame = Array.from(targetAreaFrame.children as SceneNode[]).find(
      (n: SceneNode) => n.name === 'image'
    ) as FrameNode | undefined;

    const instances: InstanceNode[] = imageFrame
      ? (Array.from(imageFrame.children as SceneNode[])
          .filter((n: SceneNode) => n.type === 'INSTANCE' && !n.name.startsWith('[dsc-h]') && n.name !== 'tag')
          .sort((a: SceneNode, b: SceneNode) => (a as any).x - (b as any).x) as InstanceNode[])
      : [];

    const elements: FrameNode[] = specsFrame
      ? (Array.from(specsFrame.children as SceneNode[]).filter(
          (n: SceneNode) => n.name === 'element' && (n as any).visible !== false
        ) as FrameNode[])
      : [];

    for (let idx = 0; idx < elements.length; idx++) {
      const elem = elements[idx];

      // Nome da área via Element name
      const nameInst = Array.from(elem.children as SceneNode[]).find(
        (n: SceneNode) => n.name === 'Element name'
      );
      const nameTexts = nameInst
        ? ((nameInst as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[])
        : [];
      const nameText = nameTexts.find((t: TextNode) =>
        !/^\d+$/.test(t.characters.trim()) && t.characters.trim().length > 1 && t.characters.trim().length < 60
      );
      const nome = nameText?.characters.trim().replace(/^\d+\s+/, '') || `Área ${idx + 1}`;

      // Height e width via code[0]/code[1] → value → Text
      const codes = Array.from(elem.children as SceneNode[]).filter(
        (n: SceneNode) => n.name === 'code'
      ) as FrameNode[];
      const getCodeText = (code: FrameNode): string => {
        const valueInst = (code as any).findOne((n: SceneNode) => n.name === 'value') as FrameNode | null;
        const t = valueInst ? (valueInst as any).findOne((n: SceneNode) => n.type === 'TEXT') as TextNode | null : null;
        return t?.characters.trim() || '';
      };
      const hStr = codes[0] ? getCodeText(codes[0]) : '';
      const wStr = codes[1] ? getCodeText(codes[1]) : '';
      const h = parseInt(hStr);
      const w = /^\d+px$/i.test(wStr) ? parseInt(wStr) : 0;
      if (isNaN(h) || h === 0) continue;

      // componentProperties do componente correspondente (por índice)
      const inst = instances[idx];
      const propriedades: Record<string, string> = {};
      if (inst) {
        for (const [key, val] of Object.entries((inst as InstanceNode).componentProperties ?? {})) {
          propriedades[key.replace(/#[\w:]+$/, '').trim()] = String((val as any).value ?? '');
        }
      }

      // Tenta recuperar relX/relY real a partir do overlay visual no imageFrame antigo
      let relX = 0;
      let relY = 0;
      let overlayWidth = w;
      if (inst && imageFrame) {
        const overlayFrames = (Array.from(imageFrame.children as SceneNode[]) as SceneNode[]).filter(
          (n: SceneNode) => n.name !== 'tag' && n.name !== '[dsc-h] Item Number' &&
            !(instances as SceneNode[]).includes(n) &&
            (n as any).height != null && Math.round((n as any).height) === h
        );
        // Escolhe o overlay mais próximo horizontalmente ao inst
        const bestOverlay = overlayFrames.sort((a, b) =>
          Math.abs((a as any).x - inst.x) - Math.abs((b as any).x - inst.x)
        )[0] as FrameNode | undefined;
        if (bestOverlay) {
          relX = (bestOverlay.x - inst.x);
          relY = (bestOverlay.y - inst.y);
          overlayWidth = Math.round(bestOverlay.width) === Math.round(inst.width) ? 0 : bestOverlay.width;
        }
      }
      const finalW = overlayWidth > 0 ? overlayWidth : w;

      const nomeVar = idx === 0 ? 'Default' : (inst?.name || `Variação ${idx + 1}`);
      variacoes.push({
        nome: nomeVar,
        propriedades,
        areas: [{ nome, width: finalW, height: h, preset: toTouchPreset(h, finalW), relX, relY }]
      });
    }

    if (variacoes.length > 0) return { variacoes };
  }

  // Fallback: varredura por labels "height:" (handoffs sem target area nomeado)
  const areas: TouchArea[] = [];

  // Template antigo: label "height:" e valor "44px" são TextNodes separados
  const allTextNodes = (handoff as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
  const heightLabels = allTextNodes.filter((n: TextNode) =>
    /^height\s*:?\s*$/i.test(n.characters.trim())
  );

  for (const hlabel of heightLabels) {
    // Sobe até encontrar container que tenha width label E valores em px
    let areaContainer: BaseNode | null = hlabel.parent;
    let containerTexts: TextNode[] = [];

    for (let depth = 0; depth < 5 && areaContainer; depth++) {
      if ((areaContainer as any).findAll) {
        const texts = (areaContainer as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
        const hasWidth = texts.some((n: TextNode) => /^width\s*:?\s*$/i.test(n.characters.trim()));
        const hasPxVal = texts.some((n: TextNode) => /^\d+\s*px$/i.test(n.characters.trim()));
        if (hasWidth && hasPxVal) {
          containerTexts = texts;
          break;
        }
      }
      areaContainer = (areaContainer as any).parent ?? null;
    }

    if (!containerTexts.length) continue;

    const widthLabel = containerTexts.find((n: TextNode) => /^width\s*:?\s*$/i.test(n.characters.trim()));
    if (!widthLabel) continue;

    const pxValues = containerTexts.filter((n: TextNode) => /^\d+\s*px$/i.test(n.characters.trim()));
    if (pxValues.length < 1) continue;

    const hAbsY = (hlabel as any).absoluteTransform?.[1]?.[2] ?? hlabel.y;

    // height: px value mais próximo do label "height:"
    const hValue = pxValues.reduce((best: TextNode, node: TextNode) => {
      const nodeY = (node as any).absoluteTransform?.[1]?.[2] ?? node.y;
      const bestY = (best as any).absoluteTransform?.[1]?.[2] ?? best.y;
      return Math.abs(nodeY - hAbsY) < Math.abs(bestY - hAbsY) ? node : best;
    });
    const h = parseInt(hValue.characters);
    if (isNaN(h)) continue;

    // width: px value diferente do height, ou 0 se for texto descritivo (ex: "100% de acordo com a aplicação")
    const wAbsY = (widthLabel as any).absoluteTransform?.[1]?.[2] ?? widthLabel.y;
    const remainingPx = pxValues.filter((n: TextNode) => n !== hValue);
    let w = 0;
    if (remainingPx.length > 0) {
      const wValue = remainingPx.reduce((best: TextNode, node: TextNode) => {
        const nodeY = (node as any).absoluteTransform?.[1]?.[2] ?? node.y;
        const bestY = (best as any).absoluteTransform?.[1]?.[2] ?? best.y;
        return Math.abs(nodeY - wAbsY) < Math.abs(bestY - wAbsY) ? node : best;
      });
      w = parseInt(wValue.characters) || 0;
    }
    // w === 0 → width descritivo (full-width) → preset baseado só no height

    // Nome: TextNode que não seja label, px value, badge numérico, nem texto descritivo longo
    const nameNode = containerTexts.find((n: TextNode) => {
      const t = n.characters.trim();
      return !/^(height|width)\s*:?\s*$/i.test(t) &&
        !/^\d+\s*px$/i.test(t) &&
        !/^\d+$/.test(t) &&
        t.length > 1 &&
        t.length < 50;
    });
    const rawName = nameNode?.characters.trim() || `Área ${areas.length + 1}`;
    const nome = rawName.replace(/^\d+\s+/, '').trim() || rawName;

    if (!areas.find((a: TouchArea) => a.nome === nome && a.width === w && a.height === h)) {
      areas.push({ nome, width: w, height: h, preset: toTouchPreset(h, w), relX: 0, relY: 0 });
    }
  }

  if (areas.length > 0) {
    variacoes.push({ nome: 'Default', propriedades: {}, areas });
  }
  return { variacoes };
}

async function parseOldGeralData(
  handoff: SceneNode,
  comp: SceneNode | null
): Promise<{
  visualPairs: { mapeamento: string; descricao: string }[];
  pluginDataKeys: string[];
  pluginDataMapeamentos: { mapeamento: string; utilizacao: string }[];
  pluginDataPlataformas: string[];
  pluginDataZoom: string[];
}> {
  const visualPairs: { mapeamento: string; descricao: string }[] = [];

  const skipMapeamento = ['teclado', 'ação', 'mapeamento', 'gesto', 'descrição', ''];

  // FONTE 1: nós visuais do handoff antigo
  const kbContainer = (handoff as any).findOne((n: SceneNode) =>
    n.name === 'keyboard maping' || n.name === 'keyboard mapping'
  ) as FrameNode | null;
  const extractPairsFromContainer = (container: FrameNode) => {
    // As linhas podem estar em um filho "table" (um nível mais fundo)
    const tableChild = (container.children as SceneNode[]).find(n => n.name === 'table') as FrameNode | undefined;
    const source = tableChild ?? container;
    const rows = (source.children as SceneNode[]).filter(n => n.type !== 'TEXT');
    for (const row of rows) {
      const textos = (row as any).findAll
        ? ((row as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[])
        : [];
      if (textos.length >= 1) {
        const mapeamento = textos[0].characters.trim();
        const descricao  = textos[1]?.characters.trim() ?? '';
        if (!skipMapeamento.includes(mapeamento.toLowerCase())) {
          visualPairs.push({ mapeamento, descricao });
        }
      }
    }
  };

  if (kbContainer) extractPairsFromContainer(kbContainer);

  const gestureContainer = (handoff as any).findOne((n: SceneNode) =>
    n.name === 'gesto maping' || n.name === 'gesture maping' || n.name === 'gesture mapping' || n.name === 'gestures'
  ) as FrameNode | null;
  if (gestureContainer) extractPairsFromContainer(gestureContainer);

  // FONTE 1b: zoom visual — busca por textos únicos das labels de zoom do plugin antigo
  const visualZoom: string[] = [];
  const allTexts = (handoff as any).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
  const hasRedimensionamento = allTexts.some(n => n.characters.toLowerCase().includes('redimensionamento'));
  const hasRefluxo = allTexts.some(n => n.characters.toLowerCase().includes('refluxo'));
  if (hasRedimensionamento) visualZoom.push('200% Texto (reflow)');
  if (hasRefluxo) visualZoom.push('400% Componente (scaling)');
  // FONTE 2: pluginData — mesma lógica do auto-load (component → dbInstance → handoff frame)
  const pluginDataKeys: string[] = [];
  const pluginDataMapeamentos: { mapeamento: string; utilizacao: string }[] = [];
  const pluginDataPlataformas: string[] = [];
  const pluginDataZoom: string[] = [];

  // Mesma ordem de override do carregarDadosEEnviarParaUI:
  // componente → dbInstance → frame do handoff (cada um sobrescreve o anterior)
  let savedData: any = null;

  if (comp) {
    const dataNode = await resolveDataNode(comp);
    if (dataNode) {
      try {
        const keys = dataNode.getPluginDataKeys();
        pluginDataKeys.push(...keys);
        const raw = dataNode.getPluginData('a11y-component-data');
        if (raw) savedData = JSON.parse(raw);
      } catch(_e) {}
    }
  }
  const dbScan = (handoff as any).findOne((n: SceneNode) => n.name === '[dsc-h] Plugin Data A11y') as InstanceNode | null;
  if (dbScan) {
    try {
      const raw = dbScan.getPluginData('a11y-component-data');
      if (raw) savedData = JSON.parse(raw);
    } catch(_e) {}
  }
  try {
    const raw = (handoff as any).getPluginData('a11y-component-data');
    if (raw) savedData = JSON.parse(raw);
  } catch(_e) {}

  if (savedData) {
    if (savedData.mapeamentos && Array.isArray(savedData.mapeamentos)) {
      for (const m of savedData.mapeamentos) {
        if (m.mapeamento) pluginDataMapeamentos.push({ mapeamento: m.mapeamento, utilizacao: m.utilizacao || '' });
      }
    }
    if (savedData.plataformas && Array.isArray(savedData.plataformas)) {
      pluginDataPlataformas.push(...savedData.plataformas);
    }
    if (savedData.zoom && Array.isArray(savedData.zoom)) {
      pluginDataZoom.push(...savedData.zoom);
    }
  }

  // Mescla visualZoom + pluginDataZoom (sem duplicatas)
  const zoomFinal = [...new Set([...visualZoom, ...pluginDataZoom])];

  return { visualPairs, pluginDataKeys, pluginDataMapeamentos, pluginDataPlataformas, pluginDataZoom: zoomFinal };
}

async function carregarDadosEEnviarParaUI(handoff: SceneNode) {
  const dbInstance = (handoff as any).findOne((n: SceneNode) => n.name === "[dsc-h] Plugin Data A11y") as InstanceNode;

  let masterList: { mapeamento: string; descricao: string; utilizacao: string }[] = [];
  let rolesList: ReturnType<typeof parseRolesList> = [];
  // Detecta handoff antigo antes de carregar dados
  const isOldFormat = !!(handoff as any).findOne(
    (n: SceneNode) => n.name === 'keyboard maping' || n.name === 'keyboard mapping'
  );

  let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, variacoes: [], variacoes_tabulacao: [], variacoes_leitor: [], conectores_leitor: [], sem_leitor: false };

  // 1. COMPONENT_SET como baseline
  if (componentePrincipalAtivo) {
    const dataNode = await resolveDataNode(componentePrincipalAtivo);
    if (dataNode) {
      const rawFromComponent = dataNode.getPluginData('a11y-component-data');
      if (rawFromComponent) {
        try { componentData = JSON.parse(rawFromComponent); } catch(e) {}
      }
    }
  }

  // 2. dbInstance dentro do handoff (override se tem dados — mais específico)
  if (dbInstance) {
    const rawSaved = dbInstance.getPluginData('a11y-component-data');
    if (rawSaved) {
      try { componentData = JSON.parse(rawSaved); } catch(e) {}
    }
  }

  // Após o primeiro await, handoffAtivo pode ter sido atualizado para o FRAME novo
  // (ensureHandoffDetached transfere pluginData e atualiza handoffAtivo).
  // Usar activeHandoff garante que os acessos pós-await usem um nó ainda válido.
  const activeHandoff = (handoffAtivo || handoff) as any;

  // 3. Dados diretos no frame do handoff (override final — mais recente)
  const rawDirect = activeHandoff.getPluginData('a11y-component-data');
  if (rawDirect) {
    try { componentData = JSON.parse(rawDirect); } catch(e) {}
  }

  // Flag: verdadeiro somente se run-handoff completou com sucesso ao menos uma vez.
  // Não usar type !== 'INSTANCE': o detach acontece ao criar qualquer preview, antes da geração.
  // Não usar rawDirect: save-partial-data também escreve no frame durante preenchimento dos previews.
  isHandoffGenerated = activeHandoff.getPluginData('a11y-handoff-generated') === 'true';

  // parseMasterList e parseRolesList: sempre executam se dbInstance existe
  if (dbInstance) {
    masterList = parseMasterList(dbInstance);
    rolesList = parseRolesList(dbInstance);
  }

  const settingSync = await figma.clientStorage.getAsync('a11y-setting-sync') ?? true;
  figma.ui.postMessage({ type: 'setup-ui', isOldFormat,
    masterList,
    rolesList,
    componentData,
    componentName: componentePrincipalAtivo?.name
      || (activeHandoff.name.startsWith('[A11Y Handoff]') ? activeHandoff.name.slice('[A11Y Handoff]'.length).trim() : null)
      || "Componente",
    isGenerated: activeHandoff.type !== "INSTANCE",
    settings: { syncTemplate: settingSync }
  });
}