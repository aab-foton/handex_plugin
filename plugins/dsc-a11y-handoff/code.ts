// ==========================================
// 1. CONFIGURAÇÃO INICIAL E TIPAGENS
// ==========================================
figma.showUI(__html__, { width: 560, height: 760, themeColors: true });

let componentePrincipalAtivo: SceneNode | null = null;
let handoffAtivo: SceneNode | null = null;
let contextoTravado: boolean = false;

// ==========================================
// 2. FUNÇÕES AUXILIARES
// ==========================================
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
    const dbInstance = workingFrame.findOne((node: SceneNode) => node.name === "[dsc-h] Plugin Data A11y") as InstanceNode;
    if (dbInstance) {
      const dataToSave = JSON.stringify({
        plataformas: msg.plataformas,
        zoom: msg.zoom,
        mapeamentos: msg.mapeamentos
      });
      dbInstance.setPluginData("a11y-component-data", dataToSave);
    }

    // Salva também no ComponentSet/Component para leitura futura
    if (componentePrincipalAtivo &&
        (componentePrincipalAtivo.type === 'COMPONENT_SET' || componentePrincipalAtivo.type === 'COMPONENT')) {
      const dataToSave = JSON.stringify({ plataformas: msg.plataformas, zoom: msg.zoom, mapeamentos: msg.mapeamentos });
      componentePrincipalAtivo.setPluginData('a11y-component-data', dataToSave);
    }

    figma.ui.postMessage({ type: 'feedback', message: '✅ Handoff preenchido e dados salvos!' });
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

  if (components.length !== 1 || handoffs.length === 0) return;

  // Prioritize an already generated FRAME over an INSTANCE template if both are selected
  let chosenHandoff: SceneNode;
  const generatedHandoff = handoffs.find(n => n.name.startsWith('[A11Y Handoff]'));

  if (generatedHandoff) {
    chosenHandoff = generatedHandoff;
  } else {
    // If no generated handoff (FRAME) is found, take the first one (likely the template instance)
    chosenHandoff = handoffs[0];
  }

  const handoff = chosenHandoff;
  const component = components[0];



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

  // Fallback: lê do ComponentSet/Component se ainda não tiver dados
  if (componentData.mapeamentos.length === 0 && componentePrincipalAtivo &&
      (componentePrincipalAtivo.type === 'COMPONENT_SET' || componentePrincipalAtivo.type === 'COMPONENT')) {
    const rawFromComponent = componentePrincipalAtivo.getPluginData('a11y-component-data');
    if (rawFromComponent) componentData = JSON.parse(rawFromComponent);
  }

  figma.ui.postMessage({
    type: 'setup-ui',
    masterList,
    componentData,
    componentName: componentePrincipalAtivo?.name || "Componente",
    isGenerated: handoff.type !== "INSTANCE"
  });
}