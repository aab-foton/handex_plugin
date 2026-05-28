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
let componenteVariacaoAtivo: SceneNode | null = null;
let componenteTabVariacaoAtivo: SceneNode | null = null;
let componenteSRVariacaoAtivo: SceneNode | null = null;

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
    const first = (comp as ComponentSetNode).children.find(c => c.type === 'COMPONENT') as ComponentNode | undefined;
    if (first) return first.createInstance();
  }
  return comp.clone();
}

/**
 * Remove todos os marcadores visuais de uma variação
 */
function clearVariationMarkers(varFrame: FrameNode) {
  const markers = varFrame.findAll(n => n.name === '[a11y-marker]');
  markers.forEach(m => m.remove());
}

/**
 * Desenha marcadores visuais sobre o frame da variação para indicar o que já foi mapeado
 */
async function drawVariationMarkers(varFrame: FrameNode, markers: any[], color: RGB, type: 'touch' | 'tab' | 'sr') {
  if (!markers || markers.length === 0) return;

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const markerFrame = figma.createFrame();
    markerFrame.name = '[a11y-marker]';
    markerFrame.x = m.relX;
    markerFrame.y = m.relY;
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
      tentarTravarContexto(figma.currentPage.selection);
      if (!handoffAtivo) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Template não encontrado. Selecione o novo template e o componente no canvas.' });
        return;
      }
    }

    // Limpa todos os frames de overlay de área de toque da página
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Toque]')).forEach(n => n.remove());
    tempTouchOverlayId = null;

    // --- SWAP: substitui handoff antigo pelo novo template ---
    const isOldHandoff = !!(handoffAtivo as any).findOne(
      (n: SceneNode) => n.name === 'keyboard maping' || n.name === 'keyboard mapping'
    );

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
      try {
        const novoComp = await figma.importComponentByKeyAsync('4ebd8a017a86b29ca60427416ed4b76af05e4a67');
        const novaInstancia = novoComp.createInstance();
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
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Não foi possível importar o novo template. Verifique se a biblioteca DSC está conectada ao arquivo.' });
        return;
      }
    }

    // Cache de variáveis Figma (usado 3x para WCAG contrast)
    const figmaVarsGlobal = (figma as any).variables;
    const allVarsGlobal: any[] = figmaVarsGlobal ? await figmaVarsGlobal.getLocalVariablesAsync() : [];

    // --- LÓGICA DE DETACH ---
    const isUpdate = handoffAtivo.type !== 'INSTANCE';
    let workingFrame: FrameNode;

    if (handoffAtivo.type === "INSTANCE") {
      workingFrame = handoffAtivo.detachInstance();
      workingFrame.name = `[A11Y Handoff] ${msg.componentName || componentePrincipalAtivo?.name || 'Componente'}`;
      handoffAtivo = workingFrame;
    } else {
      workingFrame = handoffAtivo as FrameNode;
    }

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

        const textNodes = newRow.findAll((n: SceneNode) => n.type === "TEXT") as TextNode[];
        if (textNodes.length >= 2) {
          let textoLimpo = item.mapeamento
            .replace(/\s*\(unitário\)/gi, '')
            .replace(/\s*\(em sequência\)/gi, '');
          await updateText(textNodes[0], textoLimpo);
          await updateText(textNodes[1], item.descricao);
        }
      }

      // Oculta o modelo em vez de deletar — permite updates futuros
      rowModel.visible = false;
    };

    if (msg.runMapeamento !== false) {
      figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} tabelas...` });
      const keyboardItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("teclado"));
      const gestureItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("gesto"));

      figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} tabela de teclado...` });
      if (msg.sem_teclado) {
        if (allTableContainers.length >= 1) allTableContainers[0].visible = false;
      } else {
        if (allTableContainers.length >= 1) await fillTable(allTableContainers[0], keyboardItems);
      }
      figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} tabela de gestos...` });
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
      for (const v of msg.variacoes) {
        if (!v.sem_toque && Array.isArray(v.areas_toque)) {
          for (const a of v.areas_toque) todasAsAreas.push(a);
        }
      }
    } else if (Array.isArray(msg.areas_toque)) {
      todasAsAreas.push(...msg.areas_toque);
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
                for (const t of allTexts) {
                  if (t.characters === 'Elemento') await updateText(t, area.nome);
                  else if (/^\d+$/.test(t.characters.trim())) await updateText(t, String(i + 1));
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

        figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} preview de área de toque...` });
        // --- PREENCHER IMAGE (PREVIEW) ---
        if (msg.runTouch !== false) {
          let imageFrame = workingFrame.findOne((n: SceneNode) =>
            n.name === 'image' &&
            n.parent?.name !== 'screen reader' &&
            (n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'COMPONENT' || n.type === 'INSTANCE')
          ) as FrameNode | InstanceNode | null;
        const variacoes: any[] = msg.variacoes || [];
        const variacoesComAreas = variacoes.filter((v: any) => !v.sem_toque && v.areas_toque && v.areas_toque.length > 0);

        if (imageFrame && variacoesComAreas.length > 0 && componentePrincipalAtivo) {
          // Após swap do template, imageFrame pode ainda ser INSTANCE (detach do pai não é recursivo).
          // Precisamos desatar antes de inserir filhos ou editar textos aninhados.
          if (imageFrame.type === 'INSTANCE') {
            imageFrame = imageFrame.detachInstance();
          }
          const modelHandoffAreas = (Array.from(imageFrame.children).find(n => n.name === '[dsc-h] Handoff areas')
            ?? (imageFrame as FrameNode).findOne(n => n.name === '[dsc-h] Handoff areas')) as InstanceNode | undefined;
          const modelItemNumber   = (Array.from(imageFrame.children).find(n => n.name === '[dsc-h] Item Number')
            ?? (imageFrame as FrameNode).findOne(n => n.name === '[dsc-h] Item Number'))   as InstanceNode | undefined;

          // Remover todos os filhos que não são modelos fixos (limpeza de execução anterior)
          const tagNode = Array.from(imageFrame.children).find(n => n.name === 'tag');
          // Se os modelos estão aninhados, preserva o ancestral direto do imageFrame
          const getDirectChildOf = (frame: FrameNode | InstanceNode, node: BaseNode | undefined): BaseNode | undefined => {
            if (!node) return undefined;
            let cur: BaseNode = node;
            while (cur.parent && cur.parent !== frame) cur = cur.parent;
            return cur.parent === frame ? cur : undefined;
          };
          const handoffAreasAncestor = getDirectChildOf(imageFrame, modelHandoffAreas);
          const itemNumberAncestor   = getDirectChildOf(imageFrame, modelItemNumber);
          const nodesToKeep = new Set<BaseNode>([tagNode, handoffAreasAncestor ?? modelHandoffAreas, itemNumberAncestor ?? modelItemNumber].filter(Boolean) as BaseNode[]);
          Array.from(imageFrame.children)
            .filter(n => !nodesToKeep.has(n))
            .forEach(n => n.remove());

          const PAD_TOP  = 80;
          const PAD_SIDE = 24;
          const PAD_LEFT = 160;
          const GAP_H    = 140;  // gap horizontal entre variações
          const GAP_V    = 60;  // gap vertical ao quebrar linha
          const MAX_WIDTH = Math.max(imageFrame.width, 800); // limite antes de quebrar linha

          // Ajustar cor de fundo do imageFrame
          try { await applyWcagBackground(imageFrame, componentePrincipalAtivo, allVarsGlobal); } catch (e) {
            figma.ui.postMessage({ type: 'feedback', message: `❌ Erro no bloco de cor: ${e}` });
          }

          let currentX = PAD_LEFT;
          let currentY = PAD_TOP;
          let rowHeight = 0;
          let globalCounter = 0;
          let totalWidth = PAD_LEFT;
          let totalHeight = PAD_TOP;

          for (const variacao of variacoesComAreas) {
            // Obter clone do componente correto para esta variação
            let compClone: SceneNode;
            if (variacao.id === 'default') {
              compClone = createComponentInstance(componentePrincipalAtivo);
            } else if (variacao.instanceNodeId) {
              let srcNode: SceneNode | null = null;
              try { srcNode = await figma.getNodeByIdAsync(variacao.instanceNodeId) as SceneNode | null; } catch (_e) { srcNode = null; }
              
              if (srcNode && srcNode.parent && srcNode.parent.type === 'FRAME' && srcNode.parent.name.includes('Variação')) {
                clearVariationMarkers(srcNode.parent as FrameNode);
              }
              compClone = srcNode ? srcNode.clone() : createComponentInstance(componentePrincipalAtivo);
            } else {
              // instanceNodeId zerado (após handoff) — clonar e aplicar propriedades salvas
              compClone = createComponentInstance(componentePrincipalAtivo);
              if (compClone.type === 'INSTANCE' && variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch(e) { figma.ui.postMessage({ type: 'feedback', message: '⚠️ Variante toque não aplicada: ' + String(e) }); }
              }
            }

            // Verificar se precisa quebrar linha
            if (currentX > PAD_LEFT && currentX + compClone.width > MAX_WIDTH) {
              currentX = PAD_LEFT;
              currentY += rowHeight + GAP_V;
              rowHeight = 0;
            }

            compClone.x = currentX;
            compClone.y = currentY;
            imageFrame.insertChild(0, compClone);

            // Criar overlays e marcadores para cada área desta variação
            if (modelHandoffAreas && modelItemNumber && Array.isArray(variacao.areas_toque)) {
              for (const area of variacao.areas_toque) {
                globalCounter++;

                const areaClone = modelHandoffAreas.clone();
                areaClone.visible = true;
                const isFullWidthPreset = area.preset === '44x100' || area.preset === '24x100';
                // Fallback de altura: usa o preset quando area.height foi salvo como 0
                const presetH = (area.preset === '44x100' || area.preset === '44x44') ? 44
                              : (area.preset === '24x100' || area.preset === '24x24') ? 24 : 0;
                const areaH = area.height > 0 ? area.height : (presetH > 0 ? presetH : (compClone as any).height);
                const areaW = isFullWidthPreset ? (compClone as any).width : (area.width > 0 ? area.width : (compClone as any).width);
                areaClone.resize(areaW, areaH);
                areaClone.x = area.relX + currentX;
                areaClone.y = area.relY + currentY;
                imageFrame.appendChild(areaClone);

                const numClone = modelItemNumber.clone();
                numClone.visible = true;
                const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                const numText = numTexts.find(n => /^\d+$/.test((n as TextNode).characters.trim())) || numTexts[0] || null;
                if (numText) await updateText(numText as TextNode, String(globalCounter));
                try { numClone.setProperties({ 'connector': 'Off' }); } catch(e) {}
                numClone.x = currentX;
                numClone.y = currentY - numClone.height - 4;
                imageFrame.appendChild(numClone);
              }
            }

            rowHeight = Math.max(rowHeight, compClone.height);
            totalWidth = Math.max(totalWidth, currentX + compClone.width);
            currentX += compClone.width + GAP_H;
          }

          totalHeight = currentY + rowHeight;

          // Redimensionar imageFrame para acomodar tudo
          imageFrame.resize(
            Math.max(imageFrame.width, totalWidth + PAD_SIDE),
            totalHeight + PAD_SIDE
          );

          if (modelHandoffAreas) modelHandoffAreas.visible = false;
          if (modelItemNumber)   modelItemNumber.visible   = false;
        }
      }

    figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} preview de tabulação...` });
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

          const tagNodeTab = Array.from(tabImageFrame.children).find(n => n.name === 'tag');
          const keepTab = new Set<BaseNode>([tagNodeTab, modelOrder, modelItemNumber].filter(Boolean) as BaseNode[]);
          Array.from(tabImageFrame.children).filter(n => !keepTab.has(n)).forEach(n => n.remove());

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
            // Obter clone do componente correto para esta variação
            let compClone: SceneNode;
            if (variacao.id === 'default') {
              compClone = createComponentInstance(componentePrincipalAtivo);
              // size=Small por padrão para melhor legibilidade no preview de tabulação
              if (compClone.type === 'INSTANCE') {
                try { (compClone as InstanceNode).setProperties({ size: 'Small' }); } catch (_) {}
              }
            } else if (variacao.instanceNodeId) {
              let srcNode: SceneNode | null = null;
              try { srcNode = await figma.getNodeByIdAsync(variacao.instanceNodeId) as SceneNode | null; } catch (_e) { srcNode = null; }

              if (srcNode && srcNode.parent && srcNode.parent.type === 'FRAME' && srcNode.parent.name.includes('Variação')) {
                clearVariationMarkers(srcNode.parent as FrameNode);
              }
              compClone = srcNode ? srcNode.clone() : createComponentInstance(componentePrincipalAtivo);
            } else {
              compClone = createComponentInstance(componentePrincipalAtivo);
              if (compClone.type === 'INSTANCE') {
                // size=Small como padrão; propriedades da variação sobrescrevem se necessário
                try { (compClone as InstanceNode).setProperties({ size: 'Small' }); } catch (_) {}
                if (variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                  try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch (e) {
                    figma.ui.postMessage({ type: 'feedback', message: '⚠️ Variante tabulação não aplicada: ' + String(e) });
                  }
                }
              }
            }

            // Verificar se precisa quebrar linha
            if (currentX > TAB_PAD_LEFT && currentX + compClone.width > TAB_MAX_WIDTH) {
              currentX = TAB_PAD_LEFT;
              currentY += rowHeight + TAB_GAP_V;
              rowHeight = 0;
            }

            compClone.x = currentX;
            compClone.y = currentY;
            tabImageFrame.insertChild(0, compClone);

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

        figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} preview de leitor de tela...` });
        // --- LEITOR DE TELA: PREVIEW ---
        const variacoesLT: any[] = msg.variacoes_leitor || [];
        const variacoesLTComItems = variacoesLT.filter((v: any) => !v.sem_leitor && v.conectores_leitor && v.conectores_leitor.length > 0);

        // Moved debug message, without specific reference to 'modelAgrupamento' as it is not yet in scope.

        
        if (msg.runLeitor !== false && variacoesLTComItems.length > 0 && componentePrincipalAtivo) {
          const srSection = Array.from(workingFrame.children).find((n: SceneNode) => n.name === 'screen reader') as FrameNode | null;
          if (srSection) {
            const srImageFrame = Array.from(srSection.children).find((n: SceneNode) => n.name === 'image') as FrameNode | null;
            if (srImageFrame) {
              const modelConector    = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Conectores')   as InstanceNode | undefined;
              const modelAgrupamento = srImageFrame.findOne(n => n.name === '[a11y] Agrupamento')  as InstanceNode | undefined;
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
              const agrupamentoAncestor = modelAgrupamento ? getDirectChild(srImageFrame, modelAgrupamento) : null;
              const keepSR = new Set<BaseNode>([tagSR, modelConector, agrupamentoAncestor ?? modelAgrupamento, modelItemNumber].filter(Boolean) as BaseNode[]);
              Array.from(srImageFrame.children).filter(n => !keepSR.has(n)).forEach(n => n.remove());
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

                // ── Variação nova ou sem capture: geração normal ──
                // Obter clone do componente correto para esta variação
                let compClone: SceneNode;
                if (variacao.id === 'default') {
                  compClone = createComponentInstance(componentePrincipalAtivo);
                } else if (variacao.instanceNodeId) {
                  let srcNode: SceneNode | null = null;
                  try { srcNode = await figma.getNodeByIdAsync(variacao.instanceNodeId) as SceneNode | null; } catch (_e) { srcNode = null; }
                  
                  if (srcNode && srcNode.parent && srcNode.parent.type === 'FRAME' && srcNode.parent.name.includes('Variação')) {
                    clearVariationMarkers(srcNode.parent as FrameNode);
                  }
                  compClone = srcNode ? srcNode.clone() : createComponentInstance(componentePrincipalAtivo);
                } else {
                  compClone = createComponentInstance(componentePrincipalAtivo);
                  if (compClone.type === 'INSTANCE' && variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                    try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch (e) {
                      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Variante SR não aplicada: ' + String(e) });
                    }
                  }
                }

                // Verificar se precisa quebrar linha
                if (currentX > SR_PAD_LEFT && currentX + compClone.width > SR_MAX_WIDTH) {
                  currentX = SR_PAD_LEFT;
                  currentY += rowHeight + SR_GAP_V;
                  rowHeight = 0;
                }

                compClone.x = currentX;
                compClone.y = currentY;
                srImageFrame.insertChild(0, compClone);

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
                    const spaceRight  = compW - ((c.relX || 0) + (c.width  || 80));
                    const spaceLeft   = c.relX  || 0;
                    const spaceBottom = compH - ((c.relY || 0) + (c.height || 40));
                    const maxSpace = Math.max(spaceRight, spaceLeft, spaceBottom);
                    const orientacao = maxSpace === spaceRight  ? 'direita'
                                     : maxSpace === spaceLeft   ? 'esquerda'
                                     : 'inferior';

                    try { agClone.setProperties({ 'orientação': orientacao }); } catch(e) {
                      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Agrupamento props não aplicadas: ' + String(e) });
                    }
                    const agTexts = agClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                    const agLetraTxt = agTexts.find(n => /^[A-Za-z✦]/.test(n.characters.trim())) || agTexts[0] || null;
                    if (agLetraTxt) await updateText(agLetraTxt, letra);
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
                    
                    const BADGE_SIZE = 32;
                    const OUT_GAP    = 8;
                    const relX = c.relX || 0;
                    const relY = c.relY || 0;
                    const elW  = c.width  || 0;
                    const elH  = c.height || 0;
                    let lineLength = 80;
                    if (lado === 'esquerda') {
                      lineLength = Math.max(OUT_GAP, OUT_GAP + relX);
                      try { conClone.resize(BADGE_SIZE + lineLength, conClone.height); } catch(e) {}
                      conClone.x = currentX - OUT_GAP - BADGE_SIZE;
                      conClone.y = currentY + relY + elH / 2 - conClone.height / 2;
                    } else if (lado === 'direita') {
                      lineLength = Math.max(OUT_GAP, OUT_GAP + (compW - relX - elW));
                      try { conClone.resize(BADGE_SIZE + lineLength, conClone.height); } catch(e) {}
                      conClone.x = currentX + relX + elW;
                      conClone.y = currentY + relY + elH / 2 - conClone.height / 2;
                    } else if (lado === 'superior') {
                      lineLength = Math.max(OUT_GAP, OUT_GAP + relY + itemNumH + 4);
                      try { conClone.resize(conClone.width, BADGE_SIZE + lineLength); } catch(e) {}
                      conClone.x = currentX + relX + elW / 2 - conClone.width / 2;
                      conClone.y = currentY - OUT_GAP - BADGE_SIZE - itemNumH - 4;
                    } else {
                      lineLength = Math.max(OUT_GAP, OUT_GAP + (compH - relY - elH));
                      try { conClone.resize(conClone.width, BADGE_SIZE + lineLength); } catch(e) {}
                      conClone.x = currentX + relX + elW / 2 - conClone.width / 2;
                      conClone.y = currentY + relY + elH;
                    }
                    const numNodeCon = conClone.findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
                    if (numNodeCon) await updateText(numNodeCon, letra);
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

    figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} specs de leitor de tela...` });
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

                    const cloneNumTxt = clone.findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
                    if (cloneNumTxt) await updateText(cloneNumTxt, letra);

                    const conectorNode = clone.findOne((n: SceneNode) => n.name === '[a11y] Conectores') as SceneNode | null;
                    if (conectorNode && 'findOne' in conectorNode) {
                      const numTxt = (conectorNode as FrameNode).findOne((n: SceneNode) => n.name === 'Number' && n.type === 'TEXT') as TextNode | null;
                      if (numTxt) await updateText(numTxt, letra);
                    }

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

                    if (conectorNode && conectorNode.type === 'INSTANCE') {
                      const t = (c.tipo || '').toLowerCase();
                      let tipoVariante = 'função valor rótulos';
                      if (t.includes('decorat'))                                                          tipoVariante = 'elementos decorativos';
                      else if (t.includes('marco') || t.includes('naveg'))                                tipoVariante = 'marcos de navegação';
                      else if (t.includes('título') || t.includes('titulo') || t.includes('heading') || t.includes('nível') || t.includes('nivel')) tipoVariante = 'nível de título';
                      else if (t.includes('infor') || t.includes('adicional'))                            tipoVariante = 'informações adicionais';
                      try { (conectorNode as InstanceNode).setProperties({ 'tipo': tipoVariante }); } catch(e) {}
                    }
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
    }

    // Remove frames de variação do canvas após geração do preview (varredura única)
    figma.currentPage.findAll((n: SceneNode) =>
      n.name.startsWith('[A11Y Variação]') ||
      n.name.startsWith('[A11Y Tab Variação]') ||
      n.name.startsWith('[A11Y LT Variação]') ||
      n.name === '[A11Y Variações]'
    ).forEach(n => n.remove());
    variacoesContainerId = null;
    pluginDataNodeId = null;

    // Zerar frameNodeId/instanceNodeId para que no próximo carregamento os frames sejam recriados
    if (msg.variacoes_tabulacao) {
      for (const v of msg.variacoes_tabulacao) {
        if (v.id !== 'default') {
          v.frameNodeId = null;
          v.instanceNodeId = null;
        }
      }
    }
    if (msg.variacoes) {
      for (const v of msg.variacoes) {
        if (v.id !== 'default') {
          v.frameNodeId = null;
          v.instanceNodeId = null;
        }
      }
    }
    if (msg.variacoes_leitor) {
      for (const v of msg.variacoes_leitor) {
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

    figma.ui.postMessage({ type: 'feedback', message: `✅ Handoff ${isUpdate ? 'atualizado' : 'gerado'} e dados salvos!` });
    figma.ui.postMessage({ type: 'handoff-complete' });
  }

  else if (msg.type === 'create-touch-overlay') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const comp = (componenteVariacaoAtivo ?? componentePrincipalAtivo) as FrameNode;
    const overlayName = `[A11Y Toque] ${msg.nome}`;

    // Remove overlay anterior com mesmo nome
    figma.currentPage.findAll((n: SceneNode) => n.name === overlayName).forEach(n => n.remove());

    const cw = (comp as any).width  ?? 100;
    const ch = (comp as any).height ?? 100;
    const absX = comp.absoluteTransform[0][2];
    const absY = comp.absoluteTransform[1][2];
    let w: number, h: number, dx: number, dy: number;
    if      (msg.preset === '44x100') { w = cw; h = 44;  dx = 0;              dy = (ch - 44) / 2; }
    else if (msg.preset === '44x44')  { w = 44; h = 44;  dx = (cw - 44) / 2; dy = (ch - 44) / 2; }
    else if (msg.preset === '24x24')  { w = 24; h = 24;  dx = (cw - 24) / 2; dy = (ch - 24) / 2; }
    else                              { w = cw; h = 24;  dx = 0;              dy = (ch - 24) / 2; }

    const overlay = figma.createFrame();
    overlay.name = overlayName;
    overlay.fills = [{ type: 'SOLID', color: { r: 1, g: 0.75, b: 0.75 }, opacity: 0.5 }];
    overlay.strokes = [];
    overlay.clipsContent = false;
    figma.currentPage.appendChild(overlay); // append primeiro para garantir posicionamento correto
    overlay.resize(w, h);
    overlay.x = absX + dx;
    overlay.y = absY + dy;
    tempTouchOverlayId = overlay.id;
    figma.currentPage.selection = [overlay];
    figma.viewport.scrollAndZoomIntoView([overlay]);
  }

  else if (msg.type === 'confirm-touch-area') {
    let width = 0, height = 0, relX = 0, relY = 0;
    if (tempTouchOverlayId) {
      const frame = await figma.getNodeByIdAsync(tempTouchOverlayId) as FrameNode | null;
      if (frame) {
        width = Math.round(frame.width);
        height = Math.round(frame.height);
        const refNode = componenteVariacaoAtivo ?? componentePrincipalAtivo;
        if (refNode) {
          // frame está na página (absoluteTransform = x/y diretos); refNode pode estar aninhado
          relX = Math.round(frame.x - (refNode as any).absoluteTransform[0][2]);
          relY = Math.round(frame.y - (refNode as any).absoluteTransform[1][2]);
        }
        frame.remove();
      }
      tempTouchOverlayId = null;
    }
    figma.ui.postMessage({ type: 'touch-area-confirmed', nome: msg.nome, preset: msg.preset, width, height, relX, relY });
  }

  else if (msg.type === 'cancel-touch-area') {
    if (tempTouchOverlayId) {
      const frame = await figma.getNodeByIdAsync(tempTouchOverlayId) as FrameNode | null;
      if (frame) frame.remove();
      tempTouchOverlayId = null;
    }
  }

  else if (msg.type === 'remove-touch-overlay') {
    const targetName = `[A11Y Toque] ${msg.nome}`;
    figma.currentPage.findAll((n: SceneNode) => n.name === targetName).forEach(n => n.remove());
  }

  else if (msg.type === 'highlight-touch-area') {
    const targetName = `[A11Y Toque] ${msg.nome}`;
    const node = figma.currentPage.findOne((n: SceneNode) => n.name === targetName);
    if (node) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
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
    let varFrame: FrameNode | null = null;
    try {
      const comp = componentePrincipalAtivo;
      const parentNode = comp.parent as FrameNode | PageNode;
      if (!parentNode) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Componente sem parent.' });
        return;
      }

      const frameName = `[A11Y Variação] ${msg.nome}`;
      const existing = figma.currentPage.findOne((n: SceneNode) => n.name === frameName) as FrameNode | null;
      if (existing) {
        const existingInstance = Array.from(existing.children).find(c => c.type === 'INSTANCE' || c.type === 'COMPONENT') as SceneNode | null;
        if (existingInstance) {
          figma.currentPage.selection = [existing];
          figma.viewport.scrollAndZoomIntoView([existing]);
          figma.ui.postMessage({ type: 'variation-frame-created', frameNodeId: existing.id, instanceNodeId: existingInstance.id });
          return;
        }
      }

      instance = createComponentInstance(comp);
      instance.x = 0;
      instance.y = 0;
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch(e) { figma.ui.postMessage({ type: "feedback", message: "⚠️ Propriedade não aplicada: " + String(e) }); }
      }

      varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);

      const container = await getOrCreateVariacoesContainer(comp, handoffAtivo, parentNode);
      container.appendChild(varFrame);
      varFrame.appendChild(instance);

      const frameId = varFrame.id;
      const instanceId = instance.id;
      instance = null; varFrame = null; // ancorados — não limpar no catch

      const placed = figma.currentPage.findOne((n: SceneNode) => n.id === frameId) as FrameNode;
      if (placed) { figma.currentPage.selection = [placed]; figma.viewport.scrollAndZoomIntoView([placed]); }
      figma.ui.postMessage({ type: 'variation-frame-created', frameNodeId: frameId, instanceNodeId: instanceId });
    } catch(e) {
      try { instance?.remove(); } catch (_) {}
      try { varFrame?.remove(); } catch (_) {}
      console.error('[create-variation-frame]', e);
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação: ${e}` });
    }
  }

  else if (msg.type === 'activate-variation') {
    try {
      if (msg.instanceNodeId) {
        const node = await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null;
        componenteVariacaoAtivo = node;
        
        // Desenha marcadores no varFrame (parent da instância)
        if (node && node.parent && node.parent.type === 'FRAME' && node.parent.name.startsWith('[A11Y Variação]')) {
          const varFrame = node.parent as FrameNode;
          clearVariationMarkers(varFrame);
          await drawVariationMarkers(varFrame, msg.areas_toque || [], { r: 1, g: 0.6, b: 0 }, 'touch');
        }
      } else {
        componenteVariacaoAtivo = null;
      }
    } catch(e) {
      componenteVariacaoAtivo = null;
    }
  }

  else if (msg.type === 'deactivate-variation') {
    if (componenteVariacaoAtivo && componenteVariacaoAtivo.parent && componenteVariacaoAtivo.parent.type === 'FRAME') {
      clearVariationMarkers(componenteVariacaoAtivo.parent as FrameNode);
    }
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
      .filter(n => n.id !== comp.id && n.id !== handoffAtivo?.id && n.name !== '[a11y-marker]')
      .map(n => ({
        layerName: n.name,
        nodeId: n.id,
        relX: Math.round(n.absoluteTransform[0][2] - compX),
        relY: Math.round(n.absoluteTransform[1][2] - compY),
        width: Math.round((n as FrameNode).width  ?? 0),
        height: Math.round((n as FrameNode).height ?? 0),
      }));

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
    if (msg.frameNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(msg.frameNodeId);
        if (node) node.remove();
      } catch(e) {}
    }
  }

  else if (msg.type === 'create-sr-variation-frame') {
    figma.ui.postMessage({ type: 'feedback', message: '⏳ Criando frame de variação...' });
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    let instance: SceneNode | null = null;
    let varFrame: FrameNode | null = null;
    try {
      const comp = componentePrincipalAtivo;
      const parentNode = comp.parent as FrameNode | PageNode;
      if (!parentNode) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Componente sem parent.' });
        return;
      }
      const frameName = `[A11Y LT Variação] ${msg.nome}`;
      const existing = figma.currentPage.findOne((n: SceneNode) => n.name === frameName);
      if (existing) existing.remove();
      instance = createComponentInstance(comp);
      instance.x = 0;
      instance.y = 0;
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch (e) { figma.ui.postMessage({ type: "feedback", message: "⚠️ Propriedade não aplicada: " + String(e) }); }
      }
      varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);
      const container = await getOrCreateVariacoesContainer(comp, handoffAtivo, parentNode);
      container.appendChild(varFrame);
      varFrame.appendChild(instance);
      const frameId = varFrame.id; const instanceId = instance.id;
      instance = null; varFrame = null; // ancorados — não limpar no catch
      const placed = figma.currentPage.findOne((n: SceneNode) => n.id === frameId) as FrameNode;
      if (placed) { figma.currentPage.selection = [placed]; figma.viewport.scrollAndZoomIntoView([placed]); }
      figma.ui.postMessage({ type: 'sr-variation-frame-created', frameNodeId: frameId, instanceNodeId: instanceId });
    } catch(e) {
      try { instance?.remove(); } catch (_) {}
      try { varFrame?.remove(); } catch (_) {}
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação de leitor: ${e}` });
    }
  }

  else if (msg.type === 'create-tab-variation-frame') {
    figma.ui.postMessage({ type: 'feedback', message: '⏳ Criando frame de variação de tabulação...' });
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    let instance: SceneNode | null = null;
    let varFrame: FrameNode | null = null;
    try {
      const comp = componentePrincipalAtivo;
      const parentNode = comp.parent as FrameNode | PageNode;
      if (!parentNode) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Componente sem parent.' });
        return;
      }
      const frameName = `[A11Y Tab Variação] ${msg.nome}`;
      const existing = figma.currentPage.findOne((n: SceneNode) => n.name === frameName);
      if (existing) existing.remove();
      instance = createComponentInstance(comp);
      instance.x = 0;
      instance.y = 0;
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch (e) {
          figma.ui.postMessage({ type: 'feedback', message: '⚠️ Variante tabulação não aplicada: ' + String(e) });
        }
      }
      varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);
      const container = await getOrCreateVariacoesContainer(comp, handoffAtivo, parentNode);
      container.appendChild(varFrame);
      varFrame.appendChild(instance);
      const frameId = varFrame.id; const instanceId = instance.id;
      instance = null; varFrame = null; // ancorados — não limpar no catch
      const placed = figma.currentPage.findOne((n: SceneNode) => n.id === frameId) as FrameNode;
      if (placed) { figma.currentPage.selection = [placed]; figma.viewport.scrollAndZoomIntoView([placed]); }
      figma.ui.postMessage({ type: 'tab-variation-frame-created', frameNodeId: frameId, instanceNodeId: instanceId });
    } catch(e) {
      try { instance?.remove(); } catch (_) {}
      try { varFrame?.remove(); } catch (_) {}
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação de tabulação: ${e}` });
    }
  }

  else if (msg.type === 'activate-tab-variation') {
    try {
      if (msg.instanceNodeId) {
        const node = await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null;
        componenteTabVariacaoAtivo = node;

        if (node && node.parent && node.parent.type === 'FRAME' && node.parent.name.startsWith('[A11Y Tab Variação]')) {
          const varFrame = node.parent as FrameNode;
          clearVariationMarkers(varFrame);
          await drawVariationMarkers(varFrame, msg.tab_order || [], { r: 0.2, g: 0.4, b: 0.9 }, 'tab');
        }
      } else {
        componenteTabVariacaoAtivo = null;
      }
    } catch(e) {
      componenteTabVariacaoAtivo = null;
    }
  }

  else if (msg.type === 'deactivate-tab-variation') {
    if (componenteTabVariacaoAtivo && componenteTabVariacaoAtivo.parent && componenteTabVariacaoAtivo.parent.type === 'FRAME') {
      clearVariationMarkers(componenteTabVariacaoAtivo.parent as FrameNode);
    }
    componenteTabVariacaoAtivo = null;
  }

  else if (msg.type === 'delete-tab-variation-frame') {
    if (msg.frameNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(msg.frameNodeId);
        if (node) node.remove();
      } catch(e) {}
    }
  }

  else if (msg.type === 'activate-sr-variation') {
    try {
      if (msg.instanceNodeId) {
        const node = await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null;
        componenteSRVariacaoAtivo = node;

        if (node && node.parent && node.parent.type === 'FRAME' && node.parent.name.startsWith('[A11Y LT Variação]')) {
          const varFrame = node.parent as FrameNode;
          clearVariationMarkers(varFrame);
          await drawVariationMarkers(varFrame, msg.conectores_leitor || [], { r: 0.6, g: 0.2, b: 0.9 }, 'sr');
        }
      } else {
        componenteSRVariacaoAtivo = null;
      }
    } catch(e) {
      componenteSRVariacaoAtivo = null;
    }
  }

  else if (msg.type === 'deactivate-sr-variation') {
    if (componenteSRVariacaoAtivo && componenteSRVariacaoAtivo.parent && componenteSRVariacaoAtivo.parent.type === 'FRAME') {
      clearVariationMarkers(componenteSRVariacaoAtivo.parent as FrameNode);
    }
    componenteSRVariacaoAtivo = null;
  }

  else if (msg.type === 'delete-sr-variation-frame') {
    if (msg.frameNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(msg.frameNodeId);
        if (node) node.remove();
      } catch (e) { figma.ui.postMessage({ type: "feedback", message: "⚠️ Propriedade não aplicada: " + String(e) }); }    }
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
    const comp = (componenteSRVariacaoAtivo ?? componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as SceneNode & { absoluteTransform: Transform };
    if (!comp) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo. Reabra o plugin com o componente selecionado.' });
      return;
    }
    
    try {
      const t = ((msg.tipoConnector as string) || '').toLowerCase();
      let cor: RGB;
      if (t.includes('decorat'))                                        cor = { r: 0.898, g: 0.224, b: 0.208 }; // vermelho
      else if (t.includes('marco') || t.includes('naveg'))              cor = { r: 0.984, g: 0.45,  b: 0.42  }; // salmão
      else if (t.includes('título') || t.includes('titulo') || t.includes('heading') || t.includes('nível') || t.includes('nivel'))
                                                                        cor = { r: 0.263, g: 0.627, b: 0.278 }; // verde
      else if (t.includes('infor') || t.includes('adicional'))          cor = { r: 0.984, g: 0.549, b: 0     }; // laranja
      else                                                              cor = { r: 0.976, g: 0.659, b: 0.145 }; // amarelo (padrão)
      const nome = (msg.roleNome as string) || 'conector';
      const overlay = figma.createFrame();
      overlay.name = `[A11Y Leitor] ${nome}`;
      overlay.resize(100, 60);
      figma.currentPage.appendChild(overlay);
      overlay.x = comp.absoluteTransform[0][2];
      overlay.y = comp.absoluteTransform[1][2];
      overlay.fills = [{ type: 'SOLID', color: cor, opacity: 0.25 } as SolidPaint];
      overlay.strokes = [{ type: 'SOLID', color: cor } as SolidPaint];
      overlay.strokeWeight = 2;
      figma.currentPage.selection = [overlay];
      figma.viewport.scrollAndZoomIntoView([overlay]);
      tempSROverlayId = overlay.id;
      tempSROverlayRefX = comp.absoluteTransform[0][2];
      tempSROverlayRefY = comp.absoluteTransform[1][2];
      figma.ui.postMessage({ type: 'sr-overlay-created' });
    } catch(e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de anotação: ${e}` });
    }
  }

  else if (msg.type === 'confirm-sr-area') {
    if (!tempSROverlayId) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum frame de área encontrado. Clique em Confirmar para criar o frame primeiro.' });
      figma.ui.postMessage({ type: 'sr-overlay-missing' });
      return;
    }
    const overlay = await figma.getNodeByIdAsync(tempSROverlayId) as FrameNode | null;
    if (!overlay) return;
    const item = {
      tipo: 'agrupamento' as const,
      relX: overlay.x - tempSROverlayRefX,
      relY: overlay.y - tempSROverlayRefY,
      width: overlay.width,
      height: overlay.height,
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

function tentarTravarContexto(selection: readonly SceneNode[]) {
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
      carregarDadosEEnviarParaUI(h);
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
  carregarDadosEEnviarParaUI(handoffAtivo);
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
      n => n.name === '[a11y] Conectores'
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
      n => n.name === '[a11y] Agrupamento'
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

  // 3. Dados diretos no frame do handoff (override final — mais recente)
  const rawDirect = (handoff as any).getPluginData('a11y-component-data');
  if (rawDirect) {
    try { componentData = JSON.parse(rawDirect); } catch(e) {}
  }

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
      || (handoff.name.startsWith('[A11Y Handoff]') ? handoff.name.slice('[A11Y Handoff]'.length).trim() : null)
      || "Componente",
    isGenerated: handoff.type !== "INSTANCE",
    settings: { syncTemplate: settingSync }
  });
}