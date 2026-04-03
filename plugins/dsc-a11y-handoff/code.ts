// ==========================================
// 1. CONFIGURAÇÃO INICIAL E TIPAGENS
// ==========================================
figma.showUI(__html__, { width: 560, height: 760, themeColors: true });

let componentePrincipalAtivo: SceneNode | null = null;
let handoffAtivo: SceneNode | null = null;
let contextoTravado: boolean = false;
let tempTouchOverlayId: string | null = null;

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
        .filter(n => n !== rowModel)
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
    if (msg.areas_toque && msg.areas_toque.length > 0) {
      const targetArea = workingFrame.findOne((n: SceneNode) => n.name === 'target area') as FrameNode;
      if (targetArea) {
        const specs = targetArea.findOne((n: SceneNode) => n.name === 'specs') as FrameNode;
        if (specs) {
          const rowModel = Array.from(specs.children).find(n => n.name === 'element') as FrameNode | undefined;
          if (rowModel) {
            Array.from(specs.children).filter(n => n !== rowModel).forEach(n => n.remove());
            for (let i = 0; i < msg.areas_toque.length; i++) {
              const area = msg.areas_toque[i];
              const row = rowModel.clone();
              row.visible = true;
              specs.appendChild(row);
              const nameInst = row.findOne((n: SceneNode) => n.name === 'Element name') as InstanceNode | null;
              if (nameInst) {
                const nameText = nameInst.findOne((n: SceneNode) => n.type === 'TEXT') as TextNode | null;
                if (nameText) await updateText(nameText, `${i + 1} ${area.nome}`);
              }
              const codes = Array.from(row.children).filter(n => n.name === 'code') as FrameNode[];
              const { hStr, wStr } = getTouchDimensions(area.preset);
              if (codes[0]) {
                const v = codes[0].findOne((n: SceneNode) => n.name === 'value' && n.type === 'TEXT') as TextNode | null;
                if (v) await updateText(v, hStr);
              }
              if (codes[1]) {
                const v = codes[1].findOne((n: SceneNode) => n.name === 'value' && n.type === 'TEXT') as TextNode | null;
                if (v) await updateText(v, wStr);
              }
            }
            rowModel.visible = false;
          }
        }
      }
    }

    const dbInstance = workingFrame.findOne((node: SceneNode) => node.name === "[dsc-h] Plugin Data A11y") as InstanceNode;
    if (dbInstance) {
      const dataToSave = JSON.stringify({
        plataformas: msg.plataformas,
        zoom: msg.zoom,
        mapeamentos: msg.mapeamentos,
        areas_toque: msg.areas_toque || []
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
          areas_toque: msg.areas_toque || []
        });
        dataNode.setPluginData('a11y-component-data', dataToSave);
      }
    }

    figma.ui.postMessage({ type: 'feedback', message: '✅ Handoff preenchido e dados salvos!' });
  }

  else if (msg.type === 'create-touch-overlay') {
    if (!componentePrincipalAtivo) {
      figma.ui.postMessage({ type: 'feedback', message: '⚠️ Nenhum componente ativo.' });
      return;
    }
    const comp = componentePrincipalAtivo as FrameNode;
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
      const frame = figma.currentPage.findOne((n: SceneNode) => n.id === tempTouchOverlayId);
      if (frame) {
        width = Math.round((frame as FrameNode).width);
        height = Math.round((frame as FrameNode).height);
        if (componentePrincipalAtivo) {
          relX = Math.round(frame.x - componentePrincipalAtivo.x);
          relY = Math.round(frame.y - componentePrincipalAtivo.y);
        }
        frame.remove();
      }
      tempTouchOverlayId = null;
    }
    figma.ui.postMessage({ type: 'touch-area-confirmed', nome: msg.nome, preset: msg.preset, width, height, relX, relY });
  }

  else if (msg.type === 'cancel-touch-area') {
    if (tempTouchOverlayId) {
      const frame = figma.currentPage.findOne((n: SceneNode) => n.id === tempTouchOverlayId);
      if (frame) frame.remove();
      tempTouchOverlayId = null;
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
  let componentData = { plataformas: [], zoom: [], mapeamentos: [] };

  if (dbInstance) {
    masterList = parseMasterList(dbInstance);

    const rawSaved = dbInstance.getPluginData("a11y-component-data");
    if (rawSaved) componentData = JSON.parse(rawSaved);
  }

  // Fallback: lê do ComponentSet/Component se ainda não tiver dados (inclusive via INSTANCE)
  if (componentData.mapeamentos.length === 0 && componentePrincipalAtivo) {
    const dataNode = await resolveDataNode(componentePrincipalAtivo);
    if (dataNode) {
      const rawFromComponent = dataNode.getPluginData('a11y-component-data');
      if (rawFromComponent) componentData = JSON.parse(rawFromComponent);
    }
  }

  figma.ui.postMessage({
    type: 'setup-ui',
    masterList,
    componentData,
    componentName: componentePrincipalAtivo?.name
      || (handoff.name.startsWith('[A11Y Handoff]') ? handoff.name.slice('[A11Y Handoff]'.length).trim() : null)
      || "Componente",
    isGenerated: handoff.type !== "INSTANCE"
  });
}