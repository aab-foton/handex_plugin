// ==========================================
// 1. CONFIGURAÇÃO INICIAL E TIPAGENS
// ==========================================
figma.showUI(__html__, { width: 560, height: 760, themeColors: true });

let componentePrincipalAtivo: SceneNode | null = null;
let handoffAtivo: SceneNode | null = null;
let contextoTravado: boolean = false;
let tempTouchOverlayId: string | null = null;
let componenteVariacaoAtivo: SceneNode | null = null;
let componenteTabVariacaoAtivo: SceneNode | null = null;

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
  } catch (e) {
    console.error("Erro ao carregar fonte:", e);
  }
}

// ==========================================
// 3. ROTEADOR DE MENSAGENS (UI -> FIGMA)
// ==========================================
figma.ui.onmessage = async (msg) => {
  
  if (msg.type === 'load-initial-data') {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) tentarTravarContexto(selection);
    else figma.ui.postMessage({ type: 'waiting-selection' });
  }

  else if (msg.type === 'run-handoff' || msg.type === 'update-handoff') {
    if (!handoffAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Handoff não encontrado.' });
      return;
    }

    // Limpa todos os frames de overlay de área de toque da página
    figma.currentPage.findAll((n: SceneNode) => n.name.startsWith('[A11Y Toque]')).forEach(n => n.remove());
    tempTouchOverlayId = null;

    // --- NOVO: LÓGICA DE DETACH ---
    // Se for uma instância, precisamos dar o detach para conseguir usar appendChild nas tabelas
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
    const compNameNode = workingFrame.findOne((n: SceneNode) => n.name === "Component Name" && n.type === "TEXT") as TextNode;
    if (compNameNode) {
      await updateText(compNameNode, msg.componentName || componentePrincipalAtivo?.name || "Componente");
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

    figma.ui.postMessage({ type: 'feedback', message: '⏳ Preenchendo nome do componente...' });
    const keyboardItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("teclado"));
    const gestureItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("gesto"));

    figma.ui.postMessage({ type: 'feedback', message: '⏳ Gerando tabela de teclado...' });
    if (allTableContainers.length >= 1) await fillTable(allTableContainers[0], keyboardItems);

    figma.ui.postMessage({ type: 'feedback', message: '⏳ Gerando tabela de gestos...' });
    if (allTableContainers.length >= 2) await fillTable(allTableContainers[1], gestureItems);

    // --- PARTE B: LOGICA DE DADOS (SALVAR NO PLUGIN DATA) ---
    figma.ui.postMessage({ type: 'feedback', message: '⏳ Salvando dados...' });
    
    // --- ÁREA DE TOQUE (NOVO) ---
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

        // --- PREENCHER IMAGE (PREVIEW) ---
        const imageFrame = workingFrame.findOne((n: SceneNode) => n.name === 'image') as FrameNode | null;
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
          try {
            const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            const relativeLuminance = (r: number, g: number, b: number) =>
              0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
            const wcagContrast = (l1: number, l2: number) => {
              const lighter = Math.max(l1, l2);
              const darker  = Math.min(l1, l2);
              return (lighter + 0.05) / (darker + 0.05);
            };

            const bgFills   = Array.isArray(imageFrame.fills) ? imageFrame.fills as Paint[] : [];
            const compFills = Array.isArray((componentePrincipalAtivo as FrameNode).fills)
              ? (componentePrincipalAtivo as FrameNode).fills as Paint[]
              : [];
            const bgFill   = bgFills.find(f => f.type === 'SOLID') as SolidPaint | undefined;
            const compFill = compFills.find(f => f.type === 'SOLID') as SolidPaint | undefined;

            let needsSwap = true;
            if (bgFill && compFill) {
              const bgL   = relativeLuminance(bgFill.color.r,   bgFill.color.g,   bgFill.color.b);
              const compL = relativeLuminance(compFill.color.r, compFill.color.g, compFill.color.b);
              needsSwap = wcagContrast(bgL, compL) < 3;
            }

            const figmaVars = (figma as any).variables;
            const allVars: any[] = figmaVars ? await figmaVars.getLocalVariablesAsync() : [];
            if (needsSwap) {
              const cardBg2Var = allVars.find((v: any) => v.name.toLowerCase().includes('card background 2'));
              if (cardBg2Var && figmaVars) {
                const boundFill = figmaVars.setBoundVariableForPaint(
                  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } },
                  'color',
                  cardBg2Var
                );
                imageFrame.fills = [boundFill];
              } else {
                imageFrame.fills = [{ type: 'SOLID', color: { r: 0.16, g: 0.20, b: 0.29 } }];
              }
            }
          } catch(e) {
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
              compClone = componentePrincipalAtivo.clone();
            } else if (variacao.instanceNodeId) {
              const srcNode = await figma.getNodeByIdAsync(variacao.instanceNodeId) as SceneNode | null;
              compClone = srcNode ? srcNode.clone() : componentePrincipalAtivo.clone();
            } else {
              // instanceNodeId zerado (após handoff) — clonar e aplicar propriedades salvas
              compClone = componentePrincipalAtivo.clone();
              if (compClone.type === 'INSTANCE' && variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch(e) {}
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
    }

    // --- FOCUS ORDER: VISUAL NO TEMPLATE (VARIAÇÕES DE TABULAÇÃO) ---
    const variacoesTab: any[] = msg.variacoes_tabulacao || [];
    const variacoesTabComItems = variacoesTab.filter((v: any) => !v.sem_tabulacao && v.tab_order && v.tab_order.length > 0);
    if (variacoesTabComItems.length > 0 && componentePrincipalAtivo) {
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
          try {
            const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            const relativeLuminance = (r: number, g: number, b: number) =>
              0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
            const wcagContrast = (l1: number, l2: number) => {
              const lighter = Math.max(l1, l2);
              const darker  = Math.min(l1, l2);
              return (lighter + 0.05) / (darker + 0.05);
            };
            const bgFillsTab   = Array.isArray(tabImageFrame.fills) ? tabImageFrame.fills as Paint[] : [];
            const compFillsTab = Array.isArray((componentePrincipalAtivo as FrameNode).fills)
              ? (componentePrincipalAtivo as FrameNode).fills as Paint[] : [];
            const bgFillTab   = bgFillsTab.find(f => f.type === 'SOLID') as SolidPaint | undefined;
            const compFillTab = compFillsTab.find(f => f.type === 'SOLID') as SolidPaint | undefined;
            let needsSwapTab = true;
            if (bgFillTab && compFillTab) {
              const bgL   = relativeLuminance(bgFillTab.color.r,   bgFillTab.color.g,   bgFillTab.color.b);
              const compL = relativeLuminance(compFillTab.color.r, compFillTab.color.g, compFillTab.color.b);
              needsSwapTab = wcagContrast(bgL, compL) < 3;
            }
            const figmaVarsTab = (figma as any).variables;
            const allVarsTab: any[] = figmaVarsTab ? await figmaVarsTab.getLocalVariablesAsync() : [];
            if (needsSwapTab) {
              const cardBg2VarTab = allVarsTab.find((v: any) => v.name.toLowerCase().includes('card background 2'));
              if (cardBg2VarTab && figmaVarsTab) {
                tabImageFrame.fills = [figmaVarsTab.setBoundVariableForPaint(
                  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', cardBg2VarTab
                )];
              } else {
                tabImageFrame.fills = [{ type: 'SOLID', color: { r: 0.16, g: 0.20, b: 0.29 } }];
              }
            }
          } catch (e) {
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
              compClone = componentePrincipalAtivo.clone();
            } else if (variacao.instanceNodeId) {
              const srcNode = await figma.getNodeByIdAsync(variacao.instanceNodeId) as SceneNode | null;
              compClone = srcNode ? srcNode.clone() : componentePrincipalAtivo.clone();
            } else {
              compClone = componentePrincipalAtivo.clone();
              if (compClone.type === 'INSTANCE' && variacao.propriedades && Object.keys(variacao.propriedades).length > 0) {
                try { (compClone as InstanceNode).setProperties(variacao.propriedades); } catch (e) {
                  console.warn('[focus-order] setProperties failed:', e);
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
    });
    workingFrame.setPluginData("a11y-component-data", dataToSaveDirect);

    figma.ui.postMessage({ type: 'feedback', message: '✅ Handoff preenchido e dados salvos!' });
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
    } catch (e) {
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

      // Remove frame anterior com mesmo nome se existir
      const frameName = `[A11Y Variação] ${msg.nome}`;
      const existing = figma.currentPage.findOne((n: SceneNode) => n.name === frameName);
      if (existing) existing.remove();

      // Clona o componente e aplica propriedades antes de criar o frame
      // (setProperties pode alterar as dimensões da instância)
      const instance = comp.clone() as InstanceNode;
      instance.x = 0;
      instance.y = 0;

      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try {
          instance.setProperties(msg.propriedades);
        } catch (e) {
          console.warn('[create-variation-frame] setProperties failed:', e);
        }
      }

      // Cria frame container sem auto layout — tamanho igual à instância
      const varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);

      // Posiciona o frame próximo ao componente original
      varFrame.x = comp.x + comp.width + 80;
      varFrame.y = comp.y;

      // Insere no mesmo parent e move a instância para dentro
      (parentNode as FrameNode).appendChild(varFrame);
      varFrame.appendChild(instance);

      figma.currentPage.selection = [varFrame];
      figma.viewport.scrollAndZoomIntoView([varFrame]);

      figma.ui.postMessage({
        type: 'variation-frame-created',
        frameNodeId: varFrame.id,
        instanceNodeId: instance.id
      });
    } catch (e) {
      console.error('[create-variation-frame]', e);
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação: ${e}` });
    }
  }

  else if (msg.type === 'activate-variation') {
    try {
      if (msg.instanceNodeId) {
        const node = await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null;
        componenteVariacaoAtivo = node;
      } else {
        componenteVariacaoAtivo = null;
      }
    } catch (e) {
      componenteVariacaoAtivo = null;
    }
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
      .filter(n => n.id !== comp.id && n.id !== handoffAtivo?.id)
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
      } catch (e) {
        console.warn('[delete-variation-frame]', e);
      }
    }
  }

  else if (msg.type === 'create-tab-variation-frame') {
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
      const instance = comp.clone() as InstanceNode;
      instance.x = 0;
      instance.y = 0;
      if (instance.type === 'INSTANCE' && msg.propriedades && Object.keys(msg.propriedades).length > 0) {
        try { instance.setProperties(msg.propriedades); } catch (e) {
          console.warn('[create-tab-variation-frame] setProperties failed:', e);
        }
      }
      const varFrame = figma.createFrame();
      varFrame.name = frameName;
      varFrame.fills = [];
      varFrame.clipsContent = false;
      varFrame.resize(instance.width, instance.height);
      varFrame.x = comp.x + comp.width + 80;
      varFrame.y = comp.y;
      (parentNode as FrameNode).appendChild(varFrame);
      varFrame.appendChild(instance);
      figma.currentPage.selection = [varFrame];
      figma.viewport.scrollAndZoomIntoView([varFrame]);
      figma.ui.postMessage({ type: 'tab-variation-frame-created', frameNodeId: varFrame.id, instanceNodeId: instance.id });
    } catch (e) {
      figma.ui.postMessage({ type: 'feedback', message: `❌ Erro ao criar frame de variação de tabulação: ${e}` });
    }
  }

  else if (msg.type === 'activate-tab-variation') {
    try {
      if (msg.instanceNodeId) {
        const node = await figma.getNodeByIdAsync(msg.instanceNodeId) as SceneNode | null;
        componenteTabVariacaoAtivo = node;
      } else {
        componenteTabVariacaoAtivo = null;
      }
    } catch (e) {
      componenteTabVariacaoAtivo = null;
    }
  }

  else if (msg.type === 'deactivate-tab-variation') {
    componenteTabVariacaoAtivo = null;
  }

  else if (msg.type === 'delete-tab-variation-frame') {
    if (msg.frameNodeId) {
      try {
        const node = await figma.getNodeByIdAsync(msg.frameNodeId);
        if (node) node.remove();
      } catch (e) {
        console.warn('[delete-tab-variation-frame]', e);
      }
    }
  }
};

// ==========================================
// 4. MONITOR DE SELEÇÃO E VALIDAÇÃO
// ==========================================
figma.on('selectionchange', () => {
  const selection = figma.currentPage.selection;
  if (!contextoTravado) {
    if (selection.length > 0) tentarTravarContexto(selection);
    else figma.ui.postMessage({ type: 'waiting-selection' });
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

  if (components.length !== 1 || handoffs.length === 0) return;

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

    // Pula linha de cabeçalho (valores idênticos ao nome da coluna)
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

async function carregarDadosEEnviarParaUI(handoff: SceneNode) {
  figma.ui.postMessage({ type: 'start-loading' });
  const dbInstance = (handoff as any).findOne((n: SceneNode) => n.name === "[dsc-h] Plugin Data A11y") as InstanceNode;

  let masterList: { mapeamento: string; descricao: string; utilizacao: string }[] = [];
  let componentData: any = { plataformas: [], zoom: [], mapeamentos: [], areas_toque: [], sem_toque: false, variacoes: [], variacoes_tabulacao: [] };
  let dataLoadedFromDb = false;

  // Tenta ler dados salvos diretamente no frame do handoff
  const rawDirect = (handoff as any).getPluginData("a11y-component-data");
  if (rawDirect) {
    componentData = JSON.parse(rawDirect);
    dataLoadedFromDb = true;
  }

  if (dbInstance) {
    masterList = parseMasterList(dbInstance);

    const rawSaved = dbInstance.getPluginData("a11y-component-data");
    if (rawSaved) {
      componentData = JSON.parse(rawSaved);
      dataLoadedFromDb = true;
    }
  }

  // Fallback: lê do ComponentSet/Component APENAS se dbInstance não tinha dados salvos
  if (!dataLoadedFromDb && componentePrincipalAtivo) {
    const dataNode = await resolveDataNode(componentePrincipalAtivo);
    if (dataNode) {
      const rawFromComponent = dataNode.getPluginData('a11y-component-data');
      if (rawFromComponent) componentData = JSON.parse(rawFromComponent);
    }
  }


    figma.ui.postMessage({ type: 'setup-ui',
    masterList,
    componentData,
    componentName: componentePrincipalAtivo?.name
      || (handoff.name.startsWith('[A11Y Handoff]') ? handoff.name.slice('[A11Y Handoff]'.length).trim() : null)
      || "Componente",
    isGenerated: handoff.type !== "INSTANCE"
  });
}