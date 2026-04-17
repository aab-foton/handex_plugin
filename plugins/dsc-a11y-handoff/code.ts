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
  } catch (e) {}
});

let componentePrincipalAtivo: SceneNode | null = null;
let handoffAtivo: SceneNode | null = null;
let variacoesContainerId: string | null = null;
let contextoTravado: boolean = false;
let tempTouchOverlayId: string | null = null;
let tempSROverlayId: string | null = null;
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
  const bgFills   = Array.isArray(imageFrame.fills)   ? imageFrame.fills   as Paint[] : [];
  const compFills = Array.isArray((componentNode as FrameNode).fills) ? (componentNode as FrameNode).fills as Paint[] : [];
  const bgFill   = bgFills.find(f   => f.type === 'SOLID') as SolidPaint | undefined;
  const compFill = compFills.find(f => f.type === 'SOLID') as SolidPaint | undefined;
  let needsSwap = true;
  if (bgFill && compFill) {
    const bgL   = relativeLuminance(bgFill.color.r,   bgFill.color.g,   bgFill.color.b);
    const compL = relativeLuminance(compFill.color.r, compFill.color.g, compFill.color.b);
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

function getOrCreateVariacoesContainer(comp: SceneNode, handoff: SceneNode | null, parentNode: FrameNode | PageNode): FrameNode {
  const CONTAINER_NAME = '[A11Y Variações]';
  const GAP = 80;

  // Reutiliza container existente (cache por ID para evitar findOne O(n))
  if (variacoesContainerId) {
    const cached = figma.getNodeById(variacoesContainerId) as FrameNode | null;
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

    // Cache de variáveis Figma (usado 3x para WCAG contrast)
    const figmaVarsGlobal = (figma as any).variables;
    const allVarsGlobal: any[] = figmaVarsGlobal ? await figmaVarsGlobal.getLocalVariablesAsync() : [];

    // --- NOVO: LÓGICA DE DETACH ---
    // Se for uma instância, precisamos dar o detach para conseguir usar appendChild nas tabelas
    const isUpdate = handoffAtivo.type !== 'INSTANCE';
    let workingFrame: FrameNode;
    
    if (handoffAtivo.type === "INSTANCE") {
      workingFrame = handoffAtivo.detachInstance();
      // Atualizamos o nome para indicar que foi gerado
      workingFrame.name = `[A11Y Handoff] ${msg.componentName || componentePrincipalAtivo?.name || 'Componente'}`;
      // Atualizamos a referência global para o novo Frame
      handoffAtivo = workingFrame;
    } else {
      workingFrame = handoffAtivo as FrameNode;
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

      // Busca o modelo "Row" diretamente nos filhos (pode estar oculto em updates)
      const rowModel = Array.from(tableWrapper.children).find((n) => n.name === "Row") as InstanceNode | undefined;
      if (!rowModel) {
        console.error("Não encontrei a camada 'Row' dentro de 'table'");
        return;
      }

      // Remove linhas de dados anteriores, preservando o modelo "Row"
      Array.from(tableWrapper.children)
        .filter(n => n !== rowModel && n.name === 'Row')
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
        if (!v.sem_toque && v.areas_toque) {
          for (const a of v.areas_toque) todasAsAreas.push(a);
        }
      }
    } else if (msg.areas_toque) {
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

        figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} preview de leitor de tela...` });
        // --- LEITOR DE TELA: PREVIEW ---
        const variacoesLT: any[] = msg.variacoes_leitor || [];
        const variacoesLTComItems = variacoesLT.filter((v: any) => !v.sem_leitor && v.conectores_leitor && v.conectores_leitor.length > 0);
        
        if (msg.runLeitor !== false && variacoesLTComItems.length > 0 && componentePrincipalAtivo) {
          const srSection = Array.from(workingFrame.children).find((n: SceneNode) => n.name === 'screen reader') as FrameNode | null;
          if (srSection) {
            const srImageFrame = Array.from(srSection.children).find((n: SceneNode) => n.name === 'image') as FrameNode | null;
            if (srImageFrame) {
              const modelConector    = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Conectores')   as InstanceNode | undefined;
              const modelAgrupamento = Array.from(srImageFrame.children).find(n => n.name === '[a11y] Agrupamento')  as InstanceNode | undefined;
              const modelItemNumber  = Array.from(srImageFrame.children).find(n => n.name === '[dsc-h] Item Number') as InstanceNode | undefined;
              const tagSR            = Array.from(srImageFrame.children).find(n => n.name === 'tag');

              const keepSR = new Set<BaseNode>([tagSR, modelConector, modelAgrupamento, modelItemNumber].filter(Boolean) as BaseNode[]);
              Array.from(srImageFrame.children).filter(n => !keepSR.has(n)).forEach(n => n.remove());
              const itemNumH = modelItemNumber ? modelItemNumber.height : 36;

              // WCAG contrast check
              try { await applyWcagBackground(srImageFrame, componentePrincipalAtivo, allVarsGlobal); } catch (e) {
                figma.ui.postMessage({ type: 'feedback', message: `❌ Erro no bloco de cor (leitor preview): ${e}` });
              }

              const SR_PAD_TOP  = 120;
              const SR_PAD_LEFT = 160;
              const SR_PAD_SIDE = 24;
              const SR_GAP_H    = 140;
              const SR_GAP_V    = 60;
              const SR_MAX_WIDTH = Math.max(srImageFrame.width, 800);

              let currentX = SR_PAD_LEFT;
              let currentY = SR_PAD_TOP;
              let rowHeight = 0;
              let globalItemCounter = 0;
              let totalWidth = SR_PAD_LEFT;
              let totalHeight = SR_PAD_TOP;

              for (const variacao of variacoesLTComItems) {
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
                  const c = conectores[i];
                  const letra = letrasLT[i];

                  if (c.tipoAnotacao === 'agrupamento' && modelAgrupamento) {
                    const agClone = modelAgrupamento.clone();
                    agClone.visible = true;
                    const agRelX = c.relX || 0;
                    const agRelY = c.relY || 0;
                    const agW = c.width || 80;
                    const agH = c.height || 40;
                    agClone.resize(agW, agH);
                    agClone.x = currentX + agRelX;
                    agClone.y = currentY + agRelY;
                    const spaceRight  = compW - ((c.relX || 0) + (c.width  || 80));
                    const spaceLeft   = c.relX  || 0;
                    const spaceBottom = compH - ((c.relY || 0) + (c.height || 40));
                    const maxSpace = Math.max(spaceRight, spaceLeft, spaceBottom);
                    const orientacao = maxSpace === spaceRight  ? 'direita'
                                     : maxSpace === spaceLeft   ? 'esquerda'
                                     : 'inferior';
                    try { agClone.setProperties({ 'orientação': orientacao, 'letra': letra }); } catch(e) {
                      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Agrupamento props não aplicadas: ' + String(e) });
                    }
                    srImageFrame.appendChild(agClone);
                  } else if (modelConector) {
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
              if (modelAgrupamento) modelAgrupamento.remove();
              if (modelItemNumber)  modelItemNumber.remove();
            }
          }
        }

        figma.ui.postMessage({ type: 'feedback', message: `⏳ ${isUpdate ? 'Atualizando' : 'Gerando'} preview de área de toque...` });
        // --- PREENCHER IMAGE (PREVIEW) ---
        if (msg.runTouch !== false) {
          const imageFrame = workingFrame.findOne((n: SceneNode) => n.name === 'image' && n.parent?.name !== 'screen reader') as FrameNode | null;
        const variacoes: any[] = msg.variacoes || [];
        const variacoesComAreas = variacoes.filter((v: any) => !v.sem_toque && v.areas_toque && v.areas_toque.length > 0);

        if (imageFrame && variacoesComAreas.length > 0 && componentePrincipalAtivo) {
          const modelHandoffAreas = Array.from(imageFrame.children).find(n => n.name === '[dsc-h] Handoff areas') as InstanceNode | undefined;
          const modelItemNumber   = Array.from(imageFrame.children).find(n => n.name === '[dsc-h] Item Number')   as InstanceNode | undefined;

          // Remover todos os filhos que não são modelos fixos (limpeza de execução anterior)
          const tagNode = Array.from(imageFrame.children).find(n => n.name === 'tag');
          const nodesToKeep = new Set<BaseNode>([tagNode, modelHandoffAreas, modelItemNumber].filter(Boolean) as BaseNode[]);
          Array.from(imageFrame.children)
            .filter(n => !nodesToKeep.has(n))
            .forEach(n => n.remove());

          const PAD_TOP  = 40;
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
            if (modelHandoffAreas && modelItemNumber) {
              for (const area of variacao.areas_toque) {
                globalCounter++;

                const areaClone = modelHandoffAreas.clone();
                areaClone.visible = true;
                areaClone.resize(area.width, area.height);
                areaClone.x = area.relX + currentX;
                areaClone.y = area.relY + currentY;
                imageFrame.appendChild(areaClone);

                const numClone = modelItemNumber.clone();
                numClone.visible = true;
                const numTexts = numClone.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
                const numText = numTexts.find(n => /^\d+$/.test((n as TextNode).characters.trim())) || numTexts[0] || null;
                if (numText) await updateText(numText as TextNode, String(globalCounter));
                try { numClone.setProperties({ 'connector': 'left' }); } catch(e) {}
                numClone.x = area.relX + currentX - numClone.width;
                numClone.y = area.relY + currentY + area.height / 2 - numClone.height / 2;
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
                  figma.ui.postMessage({ type: 'feedback', message: '⚠️ Variante tabulação não aplicada: ' + String(e) });
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

    // Remove frames de variação do canvas após geração do preview
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Variação]')).forEach(n => n.remove());
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Tab Variação]')).forEach(n => n.remove());
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y LT Variação]')).forEach(n => n.remove());
    figma.currentPage.findAll((n: SceneNode) => n.name === '[A11Y Variações]').forEach(n => n.remove());
    variacoesContainerId = null;

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
  }

  else if (msg.type === 'create-touch-overlay') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const comp = (componenteVariacaoAtivo ?? componentePrincipalAtivo) as FrameNode;
    if (!comp.parent) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Componente sem parent.' });
      return;
    }
    const parentNode = comp.parent as FrameNode | PageNode;
    const overlayName = `[A11Y Toque] ${msg.nome}`;

    // Remove overlay anterior com mesmo nome
    const existing = parentNode.children.find((n: SceneNode) => n.name === overlayName);
    if (existing) existing.remove();

    const cw = comp.width, ch = comp.height;
    let w: number, h: number, dx: number, dy: number;
    if      (msg.preset === '44x100') { w = cw; h = 44;  dx = 0;              dy = (ch - 44) / 2; }
    else if (msg.preset === '44x44')  { w = 44; h = 44;  dx = (cw - 44) / 2; dy = (ch - 44) / 2; }
    else if (msg.preset === '24x24')  { w = 24; h = 24;  dx = (cw - 24) / 2; dy = (ch - 24) / 2; }
    else                              { w = cw; h = 24;  dx = 0;              dy = (ch - 24) / 2; }

    const overlay = figma.createFrame();
    overlay.name = overlayName;
    overlay.resize(w, h);
    overlay.x = comp.x + dx;
    overlay.y = comp.y + dy;
    overlay.fills = [{ type: 'SOLID', color: { r: 1, g: 0.75, b: 0.75 }, opacity: 0.5 }];
    overlay.strokes = [];
    overlay.clipsContent = false;
    (parentNode as FrameNode).appendChild(overlay);
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
          relX = Math.round(frame.x - refNode.x);
          relY = Math.round(frame.y - refNode.y);
        }
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
      const props = Object.entries(defs)
        .filter(([_, def]) => def.type === 'VARIANT' || def.type === 'BOOLEAN')
        .map(([name, def]) => ({
          name,
          type: def.type,
          options: def.type === 'VARIANT' ? (def as any).variantOptions : [true, false]
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
    try {
      const comp = componentePrincipalAtivo;
      const parentNode = comp.parent as FrameNode | PageNode;
      if (!parentNode) {
        figma.ui.postMessage({ type: 'feedback', message: '⚠️ Componente sem parent.' });
        return;
      }

      // Remove frame anterior com mesmo nome se existir, se não encontrar, cria novo
      const frameName = `[A11Y Variação] ${msg.nome}`;
      const existing = figma.currentPage.findOne((n: SceneNode) => n.name === frameName) as FrameNode | null;
      if (existing) {
        const existingInstance = Array.from(existing.children).find(c => c.type === 'INSTANCE' || c.type === 'COMPONENT') as SceneNode | null;
        if (existingInstance) {
          figma.currentPage.selection = [existing];
          figma.viewport.scrollAndZoomIntoView([existing]);
          figma.ui.postMessage({
            type: 'variation-frame-created', // Mensagem de sucesso para o UI
            frameNodeId: existing.id,
            instanceNodeId: existingInstance.id
          });
          return; // Termina a execução se encontrou e reusou o frame
        }
      }
      // Continua a criação normal se não encontrou um frame existente com instância
      // Cria instância do componente (suporta INSTANCE, COMPONENT, COMPONENT_SET)
      const instance = createComponentInstance(comp);
      instance.x = 0;
      instance.y = 0;

      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try {
          instance.setProperties(msg.propriedades);
        } catch(e) { figma.ui.postMessage({ type: "feedback", message: "⚠️ Propriedade não aplicada: " + String(e) }); }
      }

      // Cria frame container sem auto layout — tamanho igual à instância
      const varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);

      const container = getOrCreateVariacoesContainer(comp, handoffAtivo, parentNode);
      container.appendChild(varFrame);
      varFrame.appendChild(instance);

      figma.currentPage.selection = [varFrame];
      figma.viewport.scrollAndZoomIntoView([varFrame]);

      figma.ui.postMessage({
        type: 'variation-frame-created',
        frameNodeId: varFrame.id,
        instanceNodeId: instance.id
      });
    } catch(e) {
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
      const instance = createComponentInstance(comp);
      instance.x = 0;
      instance.y = 0;
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch (e) { figma.ui.postMessage({ type: "feedback", message: "⚠️ Propriedade não aplicada: " + String(e) }); }
      }
      const varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);
      const container = getOrCreateVariacoesContainer(comp, handoffAtivo, parentNode);
      container.appendChild(varFrame);
      varFrame.appendChild(instance);
      figma.currentPage.selection = [varFrame];
      figma.viewport.scrollAndZoomIntoView([varFrame]);
      figma.ui.postMessage({ type: 'sr-variation-frame-created', frameNodeId: varFrame.id, instanceNodeId: instance.id });
    } catch(e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação de leitor: ${e}` });
    }
  }

  else if (msg.type === 'create-tab-variation-frame') {
    figma.ui.postMessage({ type: 'feedback', message: '⏳ Criando frame de variação de tabulação...' });
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
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
      const instance = createComponentInstance(comp);
      instance.x = 0;
      instance.y = 0;
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch (e) {
          figma.ui.postMessage({ type: 'feedback', message: '⚠️ Variante tabulação não aplicada: ' + String(e) });
        }
      }
      const varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);
      const container = getOrCreateVariacoesContainer(comp, handoffAtivo, parentNode);
      container.appendChild(varFrame);
      varFrame.appendChild(instance);
      figma.currentPage.selection = [varFrame];
      figma.viewport.scrollAndZoomIntoView([varFrame]);
      figma.ui.postMessage({ type: 'tab-variation-frame-created', frameNodeId: varFrame.id, instanceNodeId: instance.id });
    } catch(e) {
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
    if (!dbInstance) return;
    const dados = JSON.parse(dbInstance.getPluginData('a11y-component-data') || '{}');
    dados.conectores_leitor = msg.conectores_leitor ?? [];
    dados.sem_leitor = msg.sem_leitor ?? false;
    dados.variacoes_leitor = msg.variacoes_leitor ?? [];
    dbInstance.setPluginData('a11y-component-data', JSON.stringify(dados));
    (handoffAtivo as any).setPluginData('a11y-component-data', JSON.stringify(dados));

    if (componentePrincipalAtivo) {
      const dataNode = await resolveDataNode(componentePrincipalAtivo);
      if (dataNode) dataNode.setPluginData('a11y-component-data', JSON.stringify(dados));
    }
  }

  else if (msg.type === 'save-partial-data') {
    if (!handoffAtivo) return;
    const dbInstance = (handoffAtivo as any).findOne((n: SceneNode) => n.name === '[dsc-h] Plugin Data A11y') as InstanceNode | null;
    if (!dbInstance) return;
    const dados = JSON.parse(dbInstance.getPluginData('a11y-component-data') || '{}');
    dados[msg.key] = msg.value;
    const saved = JSON.stringify(dados);
    dbInstance.setPluginData('a11y-component-data', saved);
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
      overlay.x = comp.absoluteTransform[0][2];
      overlay.y = comp.absoluteTransform[1][2];
      overlay.fills = [{ type: 'SOLID', color: cor, opacity: 0.25 } as SolidPaint];
      overlay.strokes = [{ type: 'SOLID', color: cor } as SolidPaint];
      overlay.strokeWeight = 2;
      figma.currentPage.appendChild(overlay);
      figma.currentPage.selection = [overlay];
      figma.viewport.scrollAndZoomIntoView([overlay]);
      tempSROverlayId = overlay.id;
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
    const comp = (componenteTabVariacaoAtivo ?? componentePrincipalAtivo) as SceneNode & { absoluteTransform: Transform };
    if (!comp) return;
    const compX = comp.absoluteTransform[0][2];
    const compY = comp.absoluteTransform[1][2];
    const item = {
      tipo: 'agrupamento' as const,
      relX: overlay.x - compX,
      relY: overlay.y - compY,
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
    const textos = (row as FrameNode).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
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

async function carregarDadosEEnviarParaUI(handoff: SceneNode) {
  const dbInstance = (handoff as any).findOne((n: SceneNode) => n.name === "[dsc-h] Plugin Data A11y") as InstanceNode;

  let masterList: { mapeamento: string; descricao: string; utilizacao: string }[] = [];
  let rolesList: ReturnType<typeof parseRolesList> = [];
  let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, variacoes: [], variacoes_tabulacao: [], variacoes_leitor: [], conectores_leitor: [], sem_leitor: false };
  // 1. COMPONENT_SET como baseline (sempre tenta, independente de outras fontes)
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
    masterList = parseMasterList(dbInstance);
    rolesList = parseRolesList(dbInstance);
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


    const settingSync = await figma.clientStorage.getAsync('a11y-setting-sync') ?? true;
    figma.ui.postMessage({ type: 'setup-ui',
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