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
      figma.notify("⚠️ Handoff não encontrado.");
      return;
    }

    // --- NOVO: LÓGICA DE DETACH ---
    // Se for uma instância, precisamos dar o detach para conseguir usar appendChild nas tabelas
    let workingFrame: FrameNode;
    
    if (handoffAtivo.type === "INSTANCE") {
      workingFrame = handoffAtivo.detachInstance();
      // Atualizamos o nome para indicar que foi gerado
      workingFrame.name = `[dsc] A11Y Handoff: ${msg.componentName || componentePrincipalAtivo?.name || "Componente"}`;
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
      // Procura a tabela dentro do container
      const tableWrapper = container.findOne((n: SceneNode) => n.name === "table") as FrameNode;
      if (!tableWrapper || data.length === 0) return;

      // NOVO: Agora procura especificamente pela instância "Row" para usar como modelo
      const rowModel = tableWrapper.findOne((n: SceneNode) => n.name === "Row") as InstanceNode;
      if (!rowModel) {
        console.error("Não encontrei a camada 'Row' dentro de 'table'");
        return;
      }

      for (const item of data) {
        // Clona a linha modelo
        const newRow = rowModel.clone();
        tableWrapper.appendChild(newRow); 
        
        // Pega todos os textos da nova linha
        const textNodes = newRow.findAll((n: SceneNode) => n.type === "TEXT") as TextNode[];
        
        if (textNodes.length >= 2) {
          // Limpeza do texto (remove os sufixos indesejados)
          let textoLimpo = item.mapeamento
            .replace(/\s*\(unitário\)/gi, '')
            .replace(/\s*\(em sequência\)/gi, '');

          // Atualiza os textos
          await updateText(textNodes[0], textoLimpo);
          await updateText(textNodes[1], item.descricao);
        }
      }
      
      // Deleta a linha "Row" original que serviu de modelo
      rowModel.remove(); 
    };

    const keyboardItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("teclado"));
    const gestureItems = msg.mapeamentos.filter((m: any) => m.utilizacao.toLowerCase().includes("gesto"));

    if (allTableContainers.length >= 1) await fillTable(allTableContainers[0], keyboardItems);
    if (allTableContainers.length >= 2) await fillTable(allTableContainers[1], gestureItems);

    // --- PARTE B: LOGICA DE DADOS (SALVAR NO PLUGIN DATA) ---
    const dbInstance = workingFrame.findOne((node: SceneNode) => node.name === "[dsc-h] Plugin Data A11y") as InstanceNode;
    if (dbInstance) {
      const dataToSave = JSON.stringify({
        plataformas: msg.plataformas,
        zoom: msg.zoom,
        mapeamentos: msg.mapeamentos
      });
      dbInstance.setPluginData("a11y-component-data", dataToSave);
    }

    figma.notify("✅ Handoff preenchido e dados salvos!");
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
  const handoffs = selection.filter(n => n.name.includes("[dsc-h] Template Handoff") || n.name.startsWith('[dsc] A11Y Handoff:'));
  const components = selection.filter(n => 
    (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET' || n.type === 'INSTANCE' || n.type === 'FRAME') && !handoffs.includes(n)
  );

  if (components.length === 1 && handoffs.length === 1) {
    componentePrincipalAtivo = components[0];
    handoffAtivo = handoffs[0];
    contextoTravado = true;
    carregarDadosEEnviarParaUI(handoffAtivo);
  }
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

  figma.ui.postMessage({
    type: 'setup-ui',
    masterList,
    componentData,
    componentName: componentePrincipalAtivo?.name || "Componente"
  });
}