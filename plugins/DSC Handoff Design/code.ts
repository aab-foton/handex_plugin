// =============================================================================
// DSC HANDOFF — Plugin Figma para geração de documentação de componentes
// =============================================================================
// Este plugin gera handoffs visuais de componentes do Design System, incluindo:
// - Tabela de propriedades (texto, booleano, variante, troca de instância)
// - Variações visuais (anatomia do componente)
// - Matriz de estados (combinações de variantes × estados)
// =============================================================================

// === CONFIGURAÇÃO ===

/** Dimensões da janela do plugin */
const UI_LARGURA = 320;
const UI_ALTURA = 500;

/** Layout dos cards de variação e matriz */
const CARD_LARGURA_MINIMA = 160;
const CARD_ESPACAMENTO = 32;
const CARD_PADDING = 48;

/** Limiar de contraste WCAG — abaixo deste valor, aplica fundo escuro */
const LIMIAR_CONTRASTE_WCAG = 3;

/** Candidatos a eixo Y da matriz de estados */
const CANDIDATOS_EIXO_Y = ["variant", "type", "theme", "mode", "color", "size"];

/** Propriedades ignoradas na matriz de estados (não geram cópias extras) */
const PROPRIEDADES_IGNORAR_MATRIZ = ["device", "breakpoint"];

/**
 * Dicionário de descrições para propriedades conhecidas.
 * Propriedades não encontradas aqui recebem descrição automática por tipo.
 */
const DICIONARIO_PROPRIEDADES: Record<string, string> = {
  "variant": "Possibilidades de cor/estilos/layout/etc que o componente pode assumir.",
  "size": "Variações de tamanhos",
  "state": "Variações de estados",
  "show left icon": "Mostrar ou ocultar ícone do lado esquerdo",
  "change icon": "Permite selecionar um ícone da biblioteca oficial",
  "slot": "Mostrar ou ocultar conteúdo em formato personalizado",
  "swap slot": "Permite selecionar um conteúdo personalizado para colocar dentro componente",
  "change slot": "Permite selecionar um conteúdo personalizado para colocar dentro do componente"
};

/**
 * Pares de termos direcionais usados para agrupar propriedades relacionadas
 * em uma única seção de variação (ex: "show icon left" + "show icon right").
 */
const PARES_DIRECIONAIS = [
  { a: 'left', b: 'right' },
  { a: 'top', b: 'bottom' },
  { a: 'start', b: 'end' },
  { a: 'leading', b: 'trailing' },
];

/** Ordem canônica das seções no handoff — garante inserção na posição correta */
const ORDEM_SECOES = ["table", "anatomy", "variants", "states", "observações", "a11y"];

// === COMPONENT SET FORMAT ===
const CSF_COR_FALLBACK: RGB = { r: 100 / 255, g: 116 / 255, b: 122 / 255 };
const CSF_COR_COMPONENTSET: RGB = { r: 0.5411764979362488, g: 0.21960784494876862, b: 0.9607843160629272 };
const CSF_ID_VARIAVEL_TITULO = "VariableID:0bfecd90e80a2b06fe34d8cbc9cc247ef3a559ff/44226:270";
const CSF_ID_VARIAVEL_LABEL  = "VariableID:6bb798f51b021c38186b67a994a8a9456ccf5950/44226:268";

/** Chave do componente master do template atual — usada para importar de bibliotecas externas */
let _templateCompKey = "";
/** Evita chamar loadAllPagesAsync múltiplas vezes por operação */
let _estrategia3Tentada = false;

/** Domínios de cada seção — usado para filtrar quais seções atualizar */
const DOMINIO_SECOES: Record<string, string> = {
  table: "design",
  anatomy: "design",
  variants: "design",
  states: "design",
  "observações": "design",
  a11y: "a11y",
};

/**
 * Verifica se uma propriedade VARIANT é um booleano textual (opções são apenas "true" e "false").
 */
function ehVarianteBoolTexto(def: { type: string; variantOptions?: string[] }): boolean {
  if (def.type !== "VARIANT" || !def.variantOptions) return false;
  const opcoes = def.variantOptions.map(o => o.toLowerCase().trim());
  return opcoes.length === 2 && opcoes.includes("true") && opcoes.includes("false");
}

// === INTERFACES ===

/** Grupo de duas propriedades direcionais pareadas (ex: left/right) */
interface GrupoDirecional {
  nomeBase: string;
  ladoA: { chave: string; rotulo: string };
  ladoB: { chave: string; rotulo: string };
}

/** Combinação gerada a partir de um grupo direcional */
interface CombinacaoGrupo {
  rotulo: string;
  propriedades: Record<string, boolean | string>;
}

/** Mapa de propriedades DNA — relaciona propriedade de visibilidade aos seus "pais" */
type MapaDNA = Map<string, string[]>;

// === INICIALIZAÇÃO DO PLUGIN ===

figma.showUI(__html__, { width: UI_LARGURA, height: UI_ALTURA, title: "DSC Handoff" });

let _desbloqueado = false;

// Avaliar seleção inicial e registrar listener de mudança
avaliarSelecao();
figma.on('selectionchange', () => { avaliarSelecao(); });

async function avaliarSelecao(): Promise<void> {
  const selecao = figma.currentPage.selection;
  if (selecao.length === 0) {
    if (!_desbloqueado) figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }
  const noComponente = selecao.find(n =>
    !(n.type === 'INSTANCE' && n.name.toLowerCase().includes('[dsc-h] template handoff'))
  );
  if (!noComponente) {
    if (!_desbloqueado) figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }
  const componentSet = await resolverComponentSet(noComponente);
  if (!componentSet) {
    if (!_desbloqueado) figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }
  const temTemplateOuHandoff = selecao.some(n =>
    (n.type === 'INSTANCE' && n.name.toLowerCase().includes('[dsc-h] template handoff')) ||
    (n.type === 'FRAME' && n.name.toLowerCase().startsWith('[dsc] handoff:'))
  );
  if (!temTemplateOuHandoff) {
    if (!_desbloqueado) figma.ui.postMessage({ type: 'waiting-selection' });
    return;
  }
  _desbloqueado = true;
  const nomeBase = componentSet.name.replace(/^\[.*?\]/, '').trim();
  const nomeFormatado = capitalizar(nomeBase);
  const isUpdate = !!buscarHandoffExistente(componentSet);
  figma.ui.postMessage({
    type: 'selection-ready',
    componentName: nomeFormatado,
    isUpdate,
  });
}

// === UTILITÁRIOS GERAIS ===

/** Envia mensagem de progresso para a UI (atualiza status bar sem encerrar loading) */
function enviarProgresso(mensagem: string): void {
  figma.ui.postMessage({ type: 'progress', message: mensagem });
}

/** Capitaliza a primeira letra de uma string (mantém o resto em minúsculas) */
function capitalizar(texto: string): string {
  if (!texto) return texto;
  const lower = texto.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Remove o sufixo de ID interno do Figma (ex: "Show Icon#1234" → "Show Icon").
 * Usado para exibir nomes limpos de propriedades.
 */
function limparNomePropriedade(chave: string): string {
  return chave.replace(/#.*$/, "").trim();
}

/**
 * Remove prefixos de nomenclatura DSC dos nomes de elementos na anatomia.
 * Ex: "[dsc] Button" → "Button", ".[base][template] List Checkbox" → "List Checkbox"
 * Mantém o nome integral para referências de Nested Component.
 */
function limparNomeElementoAnatomia(nome: string): string {
  // Remove prefixos como "[dsc]", ".[base]", ".[base][template]", "[dsc-h]", etc.
  return nome.replace(/^\.?\[.*?\]\s*/g, "").trim() || nome;
}

/**
 * Busca recursiva na página atual, percorrendo inclusive dentro de SectionNode.
 * Substitui figma.currentPage.findOne() que pode não entrar em Sections.
 */
function buscarNaPagina(predicado: (n: SceneNode) => boolean): SceneNode | null {
  function percorrer(nos: readonly SceneNode[]): SceneNode | null {
    for (const no of nos) {
      if (no.removed) continue;
      if (predicado(no)) return no;
      if ("children" in no) {
        const encontrado = percorrer((no as FrameNode | SectionNode).children);
        if (encontrado) return encontrado;
      }
    }
    return null;
  }
  return percorrer(figma.currentPage.children);
}

/**
 * Busca recursivamente um filho pelo nome (case-insensitive).
 * @param raiz - Nó raiz para iniciar a busca
 * @param nome - Nome do filho a buscar
 * @returns O nó encontrado ou null
 */
function buscarFilho(raiz: SceneNode, nome: string): SceneNode | null {
  if (!raiz || raiz.removed) return null;
  const alvo = nome.toLowerCase().trim();
  if (raiz.name.toLowerCase().trim() === alvo) return raiz;
  if ("children" in raiz) {
    for (const filho of (raiz as any).children) {
      const encontrado = buscarFilho(filho, nome);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

/**
 * Encontra o primeiro TextNode dentro de um nó (busca em profundidade).
 */
function buscarPrimeiroTexto(no: SceneNode): TextNode | null {
  if (no.type === "TEXT") return no as TextNode;
  if ("children" in no) {
    for (const filho of (no as any).children) {
      const encontrado = buscarPrimeiroTexto(filho);
      if (encontrado) return encontrado;
    }
  }
  return null;
}

/**
 * Carrega recursivamente todas as fontes usadas em nós de texto.
 */
async function carregarFontes(no: SceneNode) {
  if (no.type === "TEXT") {
    const texto = no as TextNode;
    if (typeof texto.fontName !== "symbol") await figma.loadFontAsync(texto.fontName);
  }
  if ("children" in no) {
    for (const filho of (no as any).children) await carregarFontes(filho);
  }
}

/**
 * Coleta todos os TextNodes dentro de um nó (busca recursiva).
 */
function coletarTextos(no: SceneNode): TextNode[] {
  const textos: TextNode[] = [];
  function percorrer(n: SceneNode) {
    if (n.type === "TEXT") textos.push(n as TextNode);
    if ("children" in n) (n as any).children.forEach(percorrer);
  }
  percorrer(no);
  return textos;
}

/**
 * Aplica texto com suporte a **negrito** via marcação markdown.
 * Detecta a família de fonte do TextNode e carrega Regular + Bold.
 */
async function aplicarTextoComNegrito(noTexto: TextNode, texto: string) {
  const fonteAtual = noTexto.fontName;
  const familia = (typeof fonteAtual !== "symbol" && fonteAtual.family) ? fonteAtual.family : "Inter";

  try {
    await figma.loadFontAsync({ family: familia, style: "Regular" });
    await figma.loadFontAsync({ family: familia, style: "Bold" });
  } catch {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  }

  const partes = (texto || " ").split(/(\*\*.*?\*\*)/);
  let textoLimpo = "";
  const intervalosNegrito: { inicio: number; fim: number }[] = [];

  partes.forEach(parte => {
    if (parte.startsWith("**") && parte.endsWith("**")) {
      const conteudo = parte.slice(2, -2);
      intervalosNegrito.push({ inicio: textoLimpo.length, fim: textoLimpo.length + conteudo.length });
      textoLimpo += conteudo;
    } else {
      textoLimpo += parte;
    }
  });

  noTexto.characters = textoLimpo;
  intervalosNegrito.forEach(intervalo => {
    try {
      noTexto.setRangeFontName(intervalo.inicio, intervalo.fim, { family: familia, style: "Bold" });
    } catch {}
  });
}

/**
 * Função inversa de aplicarTextoComNegrito: lê um TextNode e reconstrói
 * o markdown com **negrito** para trechos com style Bold.
 */
function extrairTextoComFormatacao(noTexto: TextNode): string {
  let segmentos: Array<{ characters: string; fontName: FontName }>;
  try {
    segmentos = noTexto.getStyledTextSegments(["fontName"]);
  } catch {
    return noTexto.characters;
  }
  let resultado = "";
  for (const seg of segmentos) {
    if (seg.fontName.style === "Bold") {
      resultado += `**${seg.characters}**`;
    } else {
      resultado += seg.characters;
    }
  }
  return resultado;
}

/**
 * Grava no TextNode o texto original auto-gerado e uma chave semântica via pluginData.
 * Usado para detectar edições manuais na próxima atualização.
 */
function marcarTextoOriginal(noTexto: TextNode, chaveSemantica: string): void {
  noTexto.setPluginData("textoOriginal", noTexto.characters);
  noTexto.setPluginData("chaveSemantica", chaveSemantica);
}

/**
 * Fallback legado: extrai labels e subtítulos de uma seção de variações (sem pluginData).
 * Busca TextNodes em "Subtitle Variants" e "VALUE" para preservar edições.
 */
function extrairLegadoVariants(secao: SceneNode, mapa: Map<string, string>): void {
  if (!("children" in secao)) return;
  const textos = coletarTextos(secao);
  for (const t of textos) {
    // Subtítulos de variação
    if (t.parent && "name" in t.parent) {
      const nomePai = (t.parent as SceneNode).name.toLowerCase();
      if (nomePai.includes("subtitle variant")) {
        mapa.set(`variants::${t.characters.trim()}::subtitle`, t.characters.trim());
      }
    }
    // Labels dos cards (VALUE)
    if (t.name === "VALUE" || (t.parent && (t.parent as SceneNode).name === "VALUE")) {
      const texto = t.characters.trim();
      if (texto) {
        mapa.set(`variants::${texto}::label`, texto);
      }
    }
  }
}

/**
 * Fallback legado: extrai labels de estado e linha da matriz (sem pluginData).
 */
function extrairLegadoStates(secao: SceneNode, mapa: Map<string, string>): void {
  if (!("children" in secao)) return;
  const textos = coletarTextos(secao);
  for (const t of textos) {
    // Labels de estado no header (STATE)
    if (t.name === "STATE" || (t.parent && (t.parent as SceneNode).name === "STATE")) {
      const texto = t.characters.trim();
      if (texto) {
        mapa.set(`states::${texto.toLowerCase()}::label`, texto);
      }
    }
    // Labels de linha (NAME)
    if (t.name === "NAME" || (t.parent && (t.parent as SceneNode).name === "NAME")) {
      const texto = t.characters.trim();
      if (texto) {
        mapa.set(`states::${texto}::rowlabel`, texto);
      }
    }
  }
}

/**
 * Extrai edições manuais de uma seção, comparando texto atual com o original gravado.
 * Retorna Map<chaveSemantica, textoComMarkdown> para reinjeção.
 * Para handoffs antigos (sem pluginData), delega para extratores legados.
 */
function extrairEdicoesManuais(secao: SceneNode, nomeSecao: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const textos = coletarTextos(secao);
  let encontrouPluginData = false;

  for (const t of textos) {
    const chave = t.getPluginData("chaveSemantica");
    if (!chave) continue;
    encontrouPluginData = true;
    const original = t.getPluginData("textoOriginal");
    if (original && t.characters !== original) {
      mapa.set(chave, extrairTextoComFormatacao(t));
    }
  }

  // Fallback para handoffs antigos sem pluginData
  if (!encontrouPluginData) {
    if (nomeSecao === "table") {
      const legado = extrairDescricoesTabela(secao);
      for (const [nome, desc] of legado) {
        mapa.set(`table::${nome}::desc`, desc);
      }
    } else if (nomeSecao === "anatomy") {
      const legado = extrairDescricoesAnatomia(secao);
      for (const [nome, desc] of legado) {
        mapa.set(`anatomy::${nome}::desc`, desc);
      }
    } else if (nomeSecao === "variants") {
      // Extrair subtítulos e labels dos cards de variação
      extrairLegadoVariants(secao, mapa);
    } else if (nomeSecao === "states") {
      // Extrair labels de estado e de linha da matriz
      extrairLegadoStates(secao, mapa);
    }
  }

  return mapa;
}

/**
 * Reinjeta edições manuais preservadas em uma seção recém-gerada.
 * Busca TextNodes por chaveSemantica e aplica o texto editado.
 * Não re-stampa textoOriginal — mantém o valor auto-gerado como baseline de comparação.
 */
async function reinjetarEdicoesManuais(secao: SceneNode, edicoes: Map<string, string>): Promise<void> {
  if (edicoes.size === 0) return;
  const textos = coletarTextos(secao);

  // Índice: chaveSemantica → TextNode (para match direto)
  const indicePorChave = new Map<string, TextNode>();
  for (const t of textos) {
    const chave = t.getPluginData("chaveSemantica");
    if (chave) indicePorChave.set(chave, t);
  }

  const chavesAplicadas = new Set<string>();

  // Match direto por chaveSemantica
  for (const [chave, textoEditado] of edicoes) {
    const t = indicePorChave.get(chave);
    if (t) {
      await carregarFontes(t);
      await aplicarTextoComNegrito(t, textoEditado);
      // NÃO re-stampar textoOriginal — o valor auto-gerado permanece como baseline
      // Tornar container Description visível (subir hierarquia até encontrar o container correto)
      tornarContainerVisivel(t, secao);
      chavesAplicadas.add(chave);
    }
  }

  // Fallback por nome semântico para chaves sem match direto (ex: legado sem stamps)
  const chavesRestantes = new Set<string>();
  for (const chave of edicoes.keys()) {
    if (!chavesAplicadas.has(chave)) chavesRestantes.add(chave);
  }

  if (chavesRestantes.size > 0) {
    // Construir índice: nomeExibicao → row/element frame (subir até o container de linha)
    // Iterar filhos da seção para encontrar linhas/elementos (não depende de t.parent)
    await buscarEAplicarPorNome(secao, edicoes, chavesRestantes);
  }
}

/**
 * Torna visíveis os containers ancestrais de um TextNode (ex: Description oculto na anatomia).
 * Sobe a hierarquia até a raiz da seção, tornando visível qualquer ancestral oculto.
 */
function tornarContainerVisivel(noTexto: TextNode, raizSecao: SceneNode): void {
  let atual: BaseNode | null = noTexto.parent;
  while (atual && atual !== raizSecao && "visible" in atual) {
    if (!(atual as SceneNode).visible) {
      (atual as SceneNode).visible = true;
    }
    atual = atual.parent;
  }
}

/**
 * Fallback: busca por nome da propriedade/elemento dentro da seção e aplica edições.
 * Percorre as linhas/elementos da seção procurando campos "Property Name" ou "Element name"
 * que correspondam ao nome semântico extraído da chave de edição.
 */
async function buscarEAplicarPorNome(
  secao: SceneNode,
  edicoes: Map<string, string>,
  chavesRestantes: Set<string>
): Promise<void> {
  if (!("children" in secao)) return;

  // Percorrer recursivamente buscando containers com "Property Name" ou "Element name"
  async function percorrer(no: SceneNode): Promise<void> {
    if (chavesRestantes.size === 0) return;
    if (!("children" in no)) return;
    const frame = no as FrameNode;

    // Verificar se este nó é uma "linha" (tem Property Name ou Element name)
    const noNome = buscarFilho(frame, "Property Name") || buscarFilho(frame, "Element name");
    if (noNome) {
      const textoNome = buscarPrimeiroTexto(noNome);
      if (textoNome) {
        const nomeAtual = textoNome.characters.trim();

        for (const chaveOrfa of [...chavesRestantes]) {
          const partes = chaveOrfa.split("::");
          if (partes.length < 2 || partes[1] !== nomeAtual) continue;

          const sufixo = partes[partes.length - 1];
          let noAlvo: TextNode | null = null;

          if (sufixo === "desc") {
            noAlvo = buscarPrimeiroTexto(
              buscarFilho(frame, "Property Description") || buscarFilho(frame, "Description") || frame
            );
          } else if (sufixo === "valor") {
            noAlvo = buscarPrimeiroTexto(buscarFilho(frame, "Property Value") || frame);
          }

          if (noAlvo && edicoes.has(chaveOrfa)) {
            await carregarFontes(noAlvo);
            await aplicarTextoComNegrito(noAlvo, edicoes.get(chaveOrfa)!);
            tornarContainerVisivel(noAlvo, secao);
            chavesRestantes.delete(chaveOrfa);
          }
        }
      }
      return; // não descer mais dentro de uma linha
    }

    // Descer nos filhos
    for (const filho of frame.children) {
      await percorrer(filho as SceneNode);
    }
  }

  await percorrer(secao);
}

/**
 * Lê edições manuais persistidas no frame do handoff para uma seção específica.
 */
function lerEdicoesPersistidas(container: FrameNode, nomeSecao: string): Map<string, string> {
  const mapa = new Map<string, string>();
  try {
    const json = container.getPluginData(`edicoesManuais::${nomeSecao}`);
    if (json) {
      const obj = JSON.parse(json) as Record<string, string>;
      for (const [k, v] of Object.entries(obj)) mapa.set(k, v);
    }
  } catch {}
  return mapa;
}

/**
 * Persiste edições manuais no frame do handoff (backup contra destruição de TextNodes).
 */
function persistirEdicoes(container: FrameNode, nomeSecao: string, edicoes: Map<string, string>): void {
  if (edicoes.size === 0) {
    container.setPluginData(`edicoesManuais::${nomeSecao}`, "");
    return;
  }
  const obj: Record<string, string> = {};
  edicoes.forEach((v, k) => { obj[k] = v; });
  container.setPluginData(`edicoesManuais::${nomeSecao}`, JSON.stringify(obj));
}

// === PRESERVAÇÃO DE POSIÇÕES DE BADGES (ANATOMIA) ===

/** Dados de posição de um badge na anatomia */
interface PosicaoBadge {
  numero: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
  connector?: string;
  /** Nome do frame pai (preview-externos, preview-internos, ou image) */
  framePai: string;
}

/**
 * Extrai posições de badges de uma seção de anatomia existente.
 * Percorre frames de preview buscando instâncias [dsc-h] item number.
 */
function extrairPosicoesBadges(secaoAnatomia: SceneNode): PosicaoBadge[] {
  const posicoes: PosicaoBadge[] = [];

  function extrairDeBadge(badge: InstanceNode, framePai: string): void {
    // Extrair número do badge
    let numero = -1;
    try {
      const props = badge.componentProperties;
      for (const [chave, prop] of Object.entries(props)) {
        if (prop.type === "TEXT") {
          numero = parseInt(prop.value as string, 10);
          break;
        }
      }
    } catch {}
    if (numero < 0) {
      const textoNo = buscarPrimeiroTexto(badge);
      if (textoNo) numero = parseInt(textoNo.characters, 10);
    }
    if (isNaN(numero) || numero < 1) return;

    // Extrair connector direction
    let connector: string | undefined;
    try {
      const props = badge.componentProperties;
      const chaveConn = Object.keys(props).find(k =>
        limparNomePropriedade(k).toLowerCase() === "connector"
      );
      if (chaveConn) connector = props[chaveConn].value as string;
    } catch {}

    posicoes.push({
      numero,
      x: badge.x,
      y: badge.y,
      largura: badge.width,
      altura: badge.height,
      connector,
      framePai,
    });
  }

  function percorrerFrame(frame: SceneNode, nomeFrame: string): void {
    if (!("children" in frame)) return;
    for (const filho of (frame as any).children) {
      const no = filho as SceneNode;
      if (no.type === "INSTANCE" && no.name.toLowerCase().includes("[dsc-h] item number")) {
        extrairDeBadge(no as InstanceNode, nomeFrame);
      }
    }
  }

  const frameImagem = buscarFilho(secaoAnatomia, "image") as FrameNode;
  if (!frameImagem) return posicoes;

  // Verificar se tem sub-frames de preview ou se badges estão direto no image
  if ("children" in frameImagem) {
    for (const filho of (frameImagem as any).children) {
      const no = filho as SceneNode;
      if (no.name.startsWith("preview-") && "children" in no) {
        percorrerFrame(no, no.name);
      } else if (no.type === "INSTANCE" && no.name.toLowerCase().includes("[dsc-h] item number")) {
        extrairDeBadge(no as InstanceNode, "image");
      }
    }
  }

  return posicoes;
}

/**
 * Persiste posições de badges no container do handoff via pluginData.
 */
function salvarPosicoesBadges(container: FrameNode, posicoes: PosicaoBadge[]): void {
  if (posicoes.length === 0) {
    container.setPluginData("posicoesBadges", "");
    return;
  }
  container.setPluginData("posicoesBadges", JSON.stringify(posicoes));
}

/**
 * Lê posições de badges persistidas no container do handoff.
 */
function lerPosicoesBadges(container: FrameNode): PosicaoBadge[] {
  try {
    const json = container.getPluginData("posicoesBadges");
    if (json) return JSON.parse(json) as PosicaoBadge[];
  } catch {}
  return [];
}

/**
 * Reaplica posições salvas de badges na anatomia recém-gerada.
 * Só aplica se o número total de badges não mudou (mesma estrutura).
 */
function reaplicarPosicoesBadges(secaoAnatomia: SceneNode, posicoesSalvas: PosicaoBadge[]): boolean {
  if (posicoesSalvas.length === 0) return false;

  const frameImagem = buscarFilho(secaoAnatomia, "image") as FrameNode;
  if (!frameImagem) return false;

  // Coletar badges atuais com seu frame pai
  const badgesAtuais: Array<{ badge: InstanceNode; framePai: string }> = [];

  function coletarBadges(frame: SceneNode, nomeFrame: string): void {
    if (!("children" in frame)) return;
    for (const filho of (frame as any).children) {
      const no = filho as SceneNode;
      if (no.type === "INSTANCE" && no.name.toLowerCase().includes("[dsc-h] item number")) {
        badgesAtuais.push({ badge: no as InstanceNode, framePai: nomeFrame });
      } else if (no.name.startsWith("preview-") && "children" in no) {
        coletarBadges(no, no.name);
      }
    }
  }

  coletarBadges(frameImagem, "image");

  // Verificar se o número de badges é o mesmo
  if (badgesAtuais.length !== posicoesSalvas.length) return false;

  // Verificar compatibilidade de layout: o número de sub-frames deve ser o mesmo
  // Ex: layout antigo com 2 sub-frames (preview-externos/internos) vs. novo com 1 (preview-unico)
  const nomesSubFramesAtual = new Set<string>();
  if ("children" in frameImagem) {
    for (const f of (frameImagem as any).children) {
      if ((f as SceneNode).name.startsWith("preview-")) nomesSubFramesAtual.add((f as SceneNode).name);
    }
  }
  const nomesSubFramesSalvos = new Set(posicoesSalvas.map(p => p.framePai).filter(n => n.startsWith("preview-")));
  if (nomesSubFramesAtual.size !== nomesSubFramesSalvos.size) return false;

  // Mapear posições salvas por número
  const mapaPosicoes = new Map<number, PosicaoBadge>();
  for (const pos of posicoesSalvas) {
    mapaPosicoes.set(pos.numero, pos);
  }

  // Aplicar posições
  for (const { badge } of badgesAtuais) {
    let numero = -1;
    try {
      const props = badge.componentProperties;
      for (const [chave, prop] of Object.entries(props)) {
        if (prop.type === "TEXT") {
          numero = parseInt(prop.value as string, 10);
          break;
        }
      }
    } catch {}
    if (numero < 0) {
      const textoNo = buscarPrimeiroTexto(badge);
      if (textoNo) numero = parseInt(textoNo.characters, 10);
    }

    const posSalva = mapaPosicoes.get(numero);
    if (posSalva) {
      badge.x = posSalva.x;
      badge.y = posSalva.y;
      // Reaplicar connector direction
      if (posSalva.connector) {
        try {
          const props = badge.componentProperties;
          const chaveConn = Object.keys(props).find(k =>
            limparNomePropriedade(k).toLowerCase() === "connector"
          );
          if (chaveConn) badge.setProperties({ [chaveConn]: posSalva.connector });
        } catch {}
      }
      // Reaplicar tamanho (conectores redimensionados)
      try {
        badge.resize(posSalva.largura, posSalva.altura);
      } catch {}
    }
  }

  return true;
}

// === UTILITÁRIOS DE COMPONENTES ===

/**
 * Resolve qualquer seleção do usuário para o ComponentSet correspondente.
 * Aceita: ComponentSet direto, Instance (resolve via mainComponent), ou Component filho de set.
 */
/** Tipo unificado para ComponentSet ou Component avulso */
type ComponenteDocumentavel = ComponentSetNode | ComponentNode;

async function resolverComponentSet(no: SceneNode): Promise<ComponenteDocumentavel | null> {
  if (!no || no.removed) return null;
  if (no.type === "COMPONENT_SET") return no;
  if (no.type === "COMPONENT") {
    if (no.parent?.type === "COMPONENT_SET") {
      return no.parent as ComponentSetNode;
    }
    return no as ComponentNode;
  }
  if (no.type === "INSTANCE") {
    const compPrincipal = await (no as InstanceNode).getMainComponentAsync();
    if (compPrincipal?.parent?.type === "COMPONENT_SET") {
      return compPrincipal.parent as ComponentSetNode;
    }
    if (compPrincipal) return compPrincipal;
  }
  return null;
}

/** Retorna o componente base para criar instâncias (defaultVariant ou o próprio componente) */
function obterVariantePadrao(comp: ComponenteDocumentavel): ComponentNode {
  return comp.type === "COMPONENT_SET" ? comp.defaultVariant : comp;
}

/** Verifica se é um ComponentSet (com variantes) */
function ehComponentSet(comp: ComponenteDocumentavel): comp is ComponentSetNode {
  return comp.type === "COMPONENT_SET";
}

/**
 * Desvincula um nó Instance para Frame editável.
 * Se já for Frame, retorna diretamente.
 */
function desvincularInstancia(no: SceneNode): FrameNode {
  return no.type === "INSTANCE"
    ? (no as InstanceNode).detachInstance()
    : no as FrameNode;
}

/**
 * Desvincula recursivamente todas as instâncias dentro de um nó.
 * Protege componentes de alerta ([dsc] alert) para que continuem sendo instâncias.
 */
function desvincularTodasInstancias(no: SceneNode): SceneNode {
  const nomeLower = no.name.toLowerCase();
  if (nomeLower.includes("[dsc] alert") || nomeLower.includes("[dsc-h]")) return no;

  const desvinculado = no.type === "INSTANCE"
    ? (no as InstanceNode).detachInstance()
    : no;
  if ("children" in desvinculado) {
    for (const filho of [...(desvinculado as any).children]) {
      desvincularTodasInstancias(filho);
    }
  }
  return desvinculado;
}

/**
 * Busca opções de variante em um ComponentSet pelo nome limpo da propriedade.
 * Usa componentPropertyDefinitions primeiro; se vazio, parseia nomes dos filhos como fallback.
 */
function buscarOpcoesVariante(componentSet: ComponenteDocumentavel, nome: string): string[] {
  const defs = componentSet.componentPropertyDefinitions;
  const chave = Object.keys(defs).find(k =>
    limparNomePropriedade(k).toLowerCase() === nome.toLowerCase()
  );

  if (chave) {
    const def = defs[chave];
    if (def.type === "VARIANT" && def.variantOptions && def.variantOptions.length > 0) {
      return def.variantOptions;
    }
  }

  // Fallback: parsear nomes dos filhos no formato "eixo=valor, eixo2=valor2"
  if (!ehComponentSet(componentSet)) return [];
  const valores = new Set<string>();
  for (const filho of componentSet.children) {
    for (const par of filho.name.split(",").map(s => s.trim())) {
      const [eixo, valor] = par.split("=").map(s => s.trim());
      if (eixo && valor && eixo.toLowerCase() === nome.toLowerCase()) {
        valores.add(valor);
      }
    }
  }
  return valores.size > 0 ? Array.from(valores) : [];
}

// === SISTEMA DE CONTRASTE WCAG ===

/**
 * Calcula a luminância relativa de uma cor sRGB conforme WCAG 2.0.
 * Converte cada canal de sRGB (0-1) para linear antes do cálculo.
 */
function luminancia(r: number, g: number, b: number): number {
  const paraLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * paraLinear(r) + 0.7152 * paraLinear(g) + 0.0722 * paraLinear(b);
}

/**
 * Calcula a razão de contraste de uma cor em relação ao branco.
 * Quanto maior o valor, MENOR o contraste (mais próximo do branco).
 * Valores abaixo de LIMIAR_CONTRASTE_WCAG indicam contraste insuficiente.
 */
function contrasteComBranco(r: number, g: number, b: number): number {
  const lumBranco = 1.0;
  const lumCor = luminancia(r, g, b);
  return (lumBranco + 0.05) / (lumCor + 0.05);
}

/**
 * Calcula a razão de contraste de uma cor em relação ao preto (~0.15, fundo escuro dos cards).
 * Valores abaixo de LIMIAR_CONTRASTE_WCAG indicam contraste insuficiente com o fundo escuro.
 */
function contrasteComFundoEscuro(r: number, g: number, b: number): number {
  const lumFundoEscuro = luminancia(0.15, 0.15, 0.15);
  const lumCor = luminancia(r, g, b);
  const mais = Math.max(lumCor, lumFundoEscuro);
  const menos = Math.min(lumCor, lumFundoEscuro);
  return (mais + 0.05) / (menos + 0.05);
}

/**
 * Verifica recursivamente se algum conteúdo tem baixo contraste com fundo escuro.
 * Checa TEXT fills, strokes e fills de shapes (ícones, vetores).
 */
function temConteudoBaixoContrasteComEscuro(no: SceneNode): boolean {
  const resultados: boolean[] = [];

  function coletarCores(n: SceneNode): void {
    try {
      const checarFills = (fills: ReadonlyArray<Paint> | typeof figma.mixed) => {
        if (!fills || typeof fills === 'symbol') return;
        for (const fill of fills as ReadonlyArray<Paint>) {
          if (ehSolidVisivel(fill)) resultados.push(contrasteComFundoEscuro(fill.color.r, fill.color.g, fill.color.b) < LIMIAR_CONTRASTE_WCAG);
        }
      };

      if (n.type === 'TEXT') checarFills((n as TextNode).fills);
      if (TIPOS_FORMA_FOREGROUND.has(n.type)) checarFills((n as any).fills);

      const strokes = (n as any).strokes;
      const strokeWeight = (n as any).strokeWeight;
      if (strokes && typeof strokes !== 'symbol' && typeof strokeWeight === 'number' && strokeWeight > 0) {
        checarFills(strokes);
      }

      if ('children' in n) {
        for (const filho of (n as any).children) coletarCores(filho as SceneNode);
      }
    } catch {}
  }

  coletarCores(no);
  if (resultados.length === 0) return false;
  const baixoContraste = resultados.filter(r => r).length;
  return baixoContraste > resultados.length / 2;
}

/**
 * Determina se um componente no dark mode precisa de fundo claro no card.
 * Verifica fills do nó raiz E dos filhos diretos.
 */
function precisaFundoClaro(no: SceneNode): boolean {
  try {
    const fills = (no as any).fills;
    if (typeof fills === 'symbol') return false;

    const ehFundoEscuroOuVazio = (fs: any) =>
      !fs || typeof fs === 'symbol' || fs.length === 0
      || fs.every((f: any) =>
        f.visible === false || (f.opacity ?? 1) === 0
        || (f.type === 'SOLID' && f.color.r < 0.25 && f.color.g < 0.25 && f.color.b < 0.25)
      );

    if (!ehFundoEscuroOuVazio(fills)) return false;

    if ('children' in no) {
      for (const filho of (no as any).children as SceneNode[]) {
        if (!ehFundoEscuroOuVazio((filho as any).fills)) return false;
      }
    }

    return temConteudoBaixoContrasteComEscuro(no);
  } catch {
    return false;
  }
}

const TIPOS_FORMA_FOREGROUND = new Set(['VECTOR', 'RECTANGLE', 'ELLIPSE', 'STAR', 'POLYGON', 'LINE', 'BOOLEAN_OPERATION']);

function ehSolidVisivel(fill: Paint): fill is SolidPaint {
  return fill.type === 'SOLID' && fill.visible !== false && ((fill as SolidPaint).opacity ?? 1) > 0;
}

/**
 * Verifica recursivamente se algum conteúdo tem baixo contraste com branco.
 * Checa TEXT fills, strokes e fills de shapes (ícones, vetores).
 * Containers (FRAME, GROUP, INSTANCE) são ignorados — apenas seus filhos importam.
 */
function temConteudoBaixoContraste(no: SceneNode): boolean {
  const resultados: boolean[] = [];

  function coletarCores(n: SceneNode): void {
    try {
      const checarFills = (fills: ReadonlyArray<Paint> | typeof figma.mixed) => {
        if (!fills || typeof fills === 'symbol') return;
        for (const fill of fills as ReadonlyArray<Paint>) {
          if (ehSolidVisivel(fill)) resultados.push(contrasteComBranco(fill.color.r, fill.color.g, fill.color.b) < LIMIAR_CONTRASTE_WCAG);
        }
      };

      if (n.type === 'TEXT') checarFills((n as TextNode).fills);
      if (TIPOS_FORMA_FOREGROUND.has(n.type)) checarFills((n as any).fills);

      const strokes = (n as any).strokes;
      const strokeWeight = (n as any).strokeWeight;
      if (strokes && typeof strokes !== 'symbol' && typeof strokeWeight === 'number' && strokeWeight > 0) {
        checarFills(strokes);
      }

      if ('children' in n) {
        for (const filho of (n as any).children) coletarCores(filho as SceneNode);
      }
    } catch {}
  }

  coletarCores(no);
  if (resultados.length === 0) return false;
  const baixoContraste = resultados.filter(r => r).length;
  return baixoContraste > resultados.length / 2;
}

/** @deprecated Alias mantido por compatibilidade — usa temConteudoBaixoContraste */
function temTextoBaixoContraste(no: SceneNode): boolean {
  return temConteudoBaixoContraste(no);
}

/**
 * Retorna true se os fills indicam fundo transparente ou branco (sem background próprio visível).
 */
function ehFundoBrancoOuVazio(fills: any): boolean {
  if (!fills || typeof fills === 'symbol' || fills.length === 0) return true;
  return fills.every((f: any) =>
    f.visible === false || (f.opacity ?? 1) === 0
    || (f.type === 'SOLID' && f.color.r > 0.95 && f.color.g > 0.95 && f.color.b > 0.95)
  );
}

/**
 * Determina se um componente instanciado precisa de fundo escuro no card.
 * Verifica fills do nó raiz E dos filhos diretos (onde o background real costuma estar).
 */
function precisaFundoEscuro(no: SceneNode): boolean {
  try {
    const fills = (no as any).fills;
    if (typeof fills === 'symbol') return false;
    if (!ehFundoBrancoOuVazio(fills)) return false;

    // Checar filhos diretos — em instâncias, o background real está um nível abaixo
    if ('children' in no) {
      for (const filho of (no as any).children as SceneNode[]) {
        const filhoFills = (filho as any).fills;
        if (!ehFundoBrancoOuVazio(filhoFills)) return false;
      }
    }

    return temConteudoBaixoContraste(no);
  } catch {
    return false;
  }
}

/** Cache do mode dark da collection do handoff (para trocar fundo dos cards) */
let _handoffDarkMode: { colecao: VariableCollection; modeId: string } | null | undefined = undefined;

/**
 * Busca o mode dark da collection do handoff (que contém "card background").
 * Retorna null se não encontrar.
 */
async function buscarHandoffDarkMode(): Promise<{ colecao: VariableCollection; modeId: string } | null> {
  if (_handoffDarkMode !== undefined) return _handoffDarkMode;
  _handoffDarkMode = null;
  try {
    // Log: listar todas as variables no cache para debug
    if (_cacheVariablesPorNome) {
      const nomes = [..._cacheVariablesPorNome.keys()].filter(n => n.includes('card'));
      console.log(`[handoff-mode] Variables no cache com "card": ${nomes.join(', ') || 'nenhuma'}`);
    } else {
      console.log('[handoff-mode] Cache de variables não foi construído ainda');
    }

    const varCardBg = await buscarVariablePorNome('card background');
    console.log(`[handoff-mode] buscarVariablePorNome('card background') → ${varCardBg ? varCardBg.name : 'null'}`);
    if (!varCardBg) return null;
    const colecao = await figma.variables.getVariableCollectionByIdAsync(varCardBg.variableCollectionId);
    console.log(`[handoff-mode] Collection: ${colecao ? colecao.name : 'null'}, modes: ${colecao ? colecao.modes.map(m => m.name).join(', ') : '?'}`);
    if (!colecao) return null;
    for (const mode of colecao.modes) {
      if (mode.name.toLowerCase() === 'dark') {
        _handoffDarkMode = { colecao, modeId: mode.modeId };
        console.log(`[handoff-mode] Dark mode encontrado: ${mode.modeId}`);
        return _handoffDarkMode;
      }
    }
    console.log('[handoff-mode] Nenhum mode "dark" encontrado na collection');
  } catch (e) {
    console.log('[handoff-mode] Erro:', e);
  }
  return null;
}

/**
 * Aplica o mode do handoff (light ou dark) num card.
 * Vincula a variable "card background" nos fills e "card text" no label,
 * depois seta o mode da collection do handoff (dark ou light).
 */
/**
 * Aplica fundo e texto dark ou light no card usando variables diretas.
 * Dark: "card background 2" + "card text 2"
 * Light: "card background" + "card text" (ou não mexe se já é o default)
 */
/**
 * Aplica fundo escuro no card para contraste (light mode).
 * Usa variables "card background 2" / "card text 2" diretamente, sem mudar mode da collection.
 */
async function aplicarFundoEscuroCard(card: FrameNode, label?: TextNode | null): Promise<void> {
  try {
    await aplicarFundoComVariable(card, 'card background 2');
    if (label) await aplicarCorTextoComVariable(label, 'card text 2');
  } catch {}
}

/**
 * Seta o mode dark da collection do handoff no card.
 * Usa "card background" + mode dark — para a seção dark mode da matriz/variações.
 */
async function aplicarDarkModeHandoff(card: FrameNode): Promise<void> {
  try {
    await aplicarFundoComVariable(card, 'card background');
    const handoffDark = await buscarHandoffDarkMode();
    if (!handoffDark) return;
    try {
      card.setExplicitVariableModeForCollection(handoffDark.colecao, handoffDark.modeId);
    } catch {
      try {
        card.setExplicitVariableModeForCollection(handoffDark.colecao.id, handoffDark.modeId);
      } catch {}
    }
  } catch {}
}

/** Cache de variables de cor (locais + importadas) */
let _cacheVariablesPorNome: Map<string, Variable> | null = null;

/**
 * Constrói cache de variables buscando locais e importadas (via collections de bound variables).
 * Recebe um nó de referência (ex: template) para descobrir collections importadas.
 */
async function construirCacheVariables(noReferencia?: SceneNode): Promise<void> {
  if (_cacheVariablesPorNome) return;
  _cacheVariablesPorNome = new Map();

  try {
    // 1. Variables locais
    if (figma.variables?.getLocalVariablesAsync) {
      const locais = await figma.variables.getLocalVariablesAsync('COLOR');
      for (const v of locais) {
        _cacheVariablesPorNome.set(v.name.toLowerCase(), v);
      }
    }

    // 2. Variables importadas — extrair IDs de bound variables do nó de referência
    if (noReferencia && figma.variables?.getVariableByIdAsync) {
      const varIds = new Set<string>();
      function extrairVarIds(no: SceneNode): void {
        const bound = (no as any).boundVariables;
        if (bound) {
          for (const prop of Object.values(bound)) {
            const arr = Array.isArray(prop) ? prop : [prop];
            for (const b of arr) {
              if (b && (b as any).id) varIds.add((b as any).id);
            }
          }
        }
        if ('children' in no) {
          for (const filho of (no as any).children) extrairVarIds(filho as SceneNode);
        }
      }
      extrairVarIds(noReferencia);

      // A partir das variables encontradas, carregar todas as variables de cada collection
      const collectionsCarregadas = new Set<string>();
      for (const varId of varIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable) continue;
        const colId = variable.variableCollectionId;
        if (collectionsCarregadas.has(colId)) continue;
        collectionsCarregadas.add(colId);

        const colecao = await figma.variables.getVariableCollectionByIdAsync(colId);
        if (!colecao) continue;

        for (const vid of colecao.variableIds) {
          const v = await figma.variables.getVariableByIdAsync(vid);
          if (v && !_cacheVariablesPorNome.has(v.name.toLowerCase())) {
            _cacheVariablesPorNome.set(v.name.toLowerCase(), v);
          }
        }
      }
    }
  } catch {}
}

/**
 * Busca uma variable de cor pelo nome (case-insensitive).
 * Busca em variables locais e importadas (cache construído por construirCacheVariables).
 */
async function buscarVariablePorNome(nome: string): Promise<Variable | null> {
  try {
    if (!figma.variables) return null;
    // Fallback: construir cache sem referência (só locais) se ainda não foi inicializado
    if (!_cacheVariablesPorNome) await construirCacheVariables();
    return _cacheVariablesPorNome?.get(nome.toLowerCase()) || null;
  } catch {
    return null;
  }
}

/**
 * Aplica fundo escuro no card usando uma variable de cor vinculada.
 * Se a variable não for encontrada, usa fallback hardcoded (RGB 0.15).
 */
async function aplicarCorTextoComVariable(textNode: TextNode, nomeVariable: string): Promise<void> {
  try {
    const variable = await buscarVariablePorNome(nomeVariable);
    if (variable) {
      let paint: SolidPaint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 } };
      paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable);
      textNode.fills = [paint];
    } else {
      textNode.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    }
  } catch {
    textNode.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  }
}

async function aplicarFundoComVariable(card: FrameNode, nomeVariable: string): Promise<void> {
  try {
    const variable = await buscarVariablePorNome(nomeVariable);
    if (variable) {
      let paint: SolidPaint = { type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } };
      paint = figma.variables.setBoundVariableForPaint(paint, 'color', variable);
      card.fills = [paint];
    } else {
      card.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
    }
  } catch {
    card.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.15 } }];
  }
}

/**
 * Detecta se a instância está no light mode, inspecionando explicit variable modes
 * definidos no nó ou em ancestrais.
 * Fallback: assume light mode (true) se não conseguir resolver.
 */
async function estamosNoLightMode(instancia: SceneNode): Promise<boolean> {
  try {
    if (!figma.variables || !figma.variables.getVariableCollectionByIdAsync) return true;
    // Percorrer o nó e ancestrais buscando explicitVariableModes
    let no: SceneNode | null = instancia;
    while (no) {
      const modos = (no as any).explicitVariableModes as Record<string, string> | undefined;
      if (modos) {
        for (const [colecaoId, modeId] of Object.entries(modos)) {
          const colecao = await figma.variables.getVariableCollectionByIdAsync(colecaoId);
          if (colecao) {
            const modeInfo = colecao.modes.find(m => m.modeId === modeId);
            if (modeInfo) {
              return modeInfo.name.toLowerCase().includes('light');
            }
          }
        }
      }
      no = no.parent && 'type' in no.parent ? no.parent as SceneNode : null;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Busca o modeId do mode "dark" a partir das variables usadas por um componente.
 * Inspeciona boundVariables do componente para encontrar a collection correta
 * (que pode ser de library, não local).
 */
async function buscarModeDark(componentSet: ComponenteDocumentavel): Promise<{ collectionId: string; modeId: string; colecao: VariableCollection } | null> {
  try {
    if (!figma.variables || !figma.variables.getVariableByIdAsync) return null;

    // Buscar um ID de variable nos fills do componente ou filhos
    function extrairVariableIds(no: SceneNode): string[] {
      const ids: string[] = [];
      const bound = (no as any).boundVariables;
      if (bound) {
        for (const prop of Object.values(bound)) {
          const arr = Array.isArray(prop) ? prop : [prop];
          for (const b of arr) {
            if (b && (b as any).id) ids.push((b as any).id);
          }
        }
      }
      if ('children' in no) {
        for (const filho of (no as any).children) {
          ids.push(...extrairVariableIds(filho));
        }
      }
      return ids;
    }

    // Tentar com defaultVariant do componentSet
    const varIds = extrairVariableIds(obterVariantePadrao(componentSet));

    // Checar cada variable para encontrar uma collection com mode "dark"
    const colecoesTentadas = new Set<string>();
    for (const varId of varIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;
      const colId = variable.variableCollectionId;
      if (colecoesTentadas.has(colId)) continue;
      colecoesTentadas.add(colId);

      const colecao = await figma.variables.getVariableCollectionByIdAsync(colId);
      if (!colecao) continue;

      for (const mode of colecao.modes) {
        if (mode.name.toLowerCase() === 'dark') {
          return { collectionId: colecao.id, modeId: mode.modeId, colecao };
        }
      }
    }

    // Fallback: tentar collections locais
    if (figma.variables.getLocalVariableCollectionsAsync) {
      const colecoes = await figma.variables.getLocalVariableCollectionsAsync();
      for (const colecao of colecoes) {
        for (const mode of colecao.modes) {
          if (mode.name.toLowerCase() === 'dark') {
            return { collectionId: colecao.id, modeId: mode.modeId, colecao };
          }
        }
      }
    }
  } catch {}
  return null;
}

// === DESCRIÇÕES DE PROPRIEDADES ===

/**
 * Obtém a descrição de uma propriedade para exibir na tabela do handoff.
 * Busca no dicionário primeiro; se não encontrar, gera descrição automática pelo tipo.
 */
function obterDescricaoPropriedade(
  propLow: string,
  tipo: "TEXT" | "BOOLEAN" | "VARIANT" | "INSTANCE_SWAP",
  nomeExibicao: string,
  def?: { type: string; variantOptions?: string[] }
): string {
  const descDicionario = DICIONARIO_PROPRIEDADES[propLow];
  if (descDicionario) return descDicionario;

  if (tipo === "TEXT") return `Texto que será aplicado no ${nomeExibicao}`;
  if (tipo === "BOOLEAN" || (def && ehVarianteBoolTexto(def))) {
    if (/^(show|has|display)\s+/i.test(nomeExibicao)) {
      const nomeLimpo = nomeExibicao.replace(/^(show|has|display)\s+/i, '').trim();
      return `Mostrar ou ocultar ${nomeLimpo}`;
    }
  }

  return "ALERTA: **adicione a descrição desta propriedade**";
}

// === AGRUPAMENTO DIRECIONAL DE VARIAÇÕES ===

/**
 * Detecta pares de propriedades direcionais (left/right, top/bottom, etc.)
 * para agrupá-las em uma única seção de variação no handoff.
 *
 * Algoritmo:
 * 1. Para cada propriedade, verifica se contém um termo direcional em qualquer posição
 * 2. Extrai o nome base removendo o termo direcional
 * 3. Busca a propriedade complementar (ex: "left" → busca "right") no array
 * 4. Só agrupa se ambas tiverem o mesmo tipo (BOOLEAN ou VARIANT)
 *
 * @param propsAnatomia - Lista de chaves de propriedades do componente
 * @param defsRaiz - Definições de propriedades do ComponentSet
 * @returns Objeto com grupos (pares encontrados) e naoAgrupadas (propriedades solo)
 */
function detectarGruposDirecionais(
  propsAnatomia: string[],
  defsRaiz: Record<string, any>
): { grupos: GrupoDirecional[]; naoAgrupadas: string[] } {
  const grupos: GrupoDirecional[] = [];
  const consumidas = new Set<string>();

  for (const nomeProp of propsAnatomia) {
    if (consumidas.has(nomeProp)) continue;
    const limpo = limparNomePropriedade(nomeProp).toLowerCase();
    const palavras = limpo.split(/\s+/);

    for (const par of PARES_DIRECIONAIS) {
      // Procura o termo direcional em qualquer posição das palavras
      const idxA = palavras.indexOf(par.a);
      const idxB = palavras.indexOf(par.b);
      const idxDir = idxA >= 0 ? idxA : idxB >= 0 ? idxB : -1;
      if (idxDir < 0) continue;

      const rotuloDir = idxA >= 0 ? par.a : par.b;
      const dirComplementar = rotuloDir === par.a ? par.b : par.a;

      // Nome base = palavras sem o termo direcional (ex: "show icon left" → "show icon")
      const palavrasBase = [...palavras];
      palavrasBase.splice(idxDir, 1);
      const nomeBase = palavrasBase.join(' ');

      // Nome complementar = mesma estrutura trocando o direcional
      const palavrasComplemento = [...palavras];
      palavrasComplemento[idxDir] = dirComplementar;
      const nomeComplementar = palavrasComplemento.join(' ');

      const chaveComplementar = propsAnatomia.find(p => {
        if (consumidas.has(p) || p === nomeProp) return false;
        return limparNomePropriedade(p).toLowerCase() === nomeComplementar
          && defsRaiz[p].type === defsRaiz[nomeProp].type;
      });

      if (chaveComplementar) {
        const ehLadoA = rotuloDir === par.a;
        grupos.push({
          nomeBase,
          ladoA: { chave: ehLadoA ? nomeProp : chaveComplementar, rotulo: par.a.toUpperCase() },
          ladoB: { chave: ehLadoA ? chaveComplementar : nomeProp, rotulo: par.b.toUpperCase() },
        });
        consumidas.add(nomeProp);
        consumidas.add(chaveComplementar);
      }
      break;
    }
  }

  const naoAgrupadas = propsAnatomia.filter(p => !consumidas.has(p));
  return { grupos, naoAgrupadas };
}

/**
 * Gera todas as combinações de um grupo direcional para exibir como cards.
 *
 * Para BOOLEAN: 4 combinações fixas (só A, só B, ambos, nenhum).
 * Para VARIANT: produto cartesiano de todas as opções de A × B.
 */
function gerarCombinacoes(grupo: GrupoDirecional, defsRaiz: Record<string, any>): CombinacaoGrupo[] {
  const nomeExibicao = grupo.nomeBase.replace(/^(show|has|display)\s+/i, '').toUpperCase();
  const tipoA = defsRaiz[grupo.ladoA.chave].type;

  const ehBoolTextoA = ehVarianteBoolTexto(defsRaiz[grupo.ladoA.chave]);
  if (tipoA === 'BOOLEAN' || ehBoolTextoA) {
    const vTrue: any = tipoA === 'BOOLEAN' ? true : "true";
    const vFalse: any = tipoA === 'BOOLEAN' ? false : "false";
    return [
      { rotulo: `${nomeExibicao} ${grupo.ladoA.rotulo}`, propriedades: { [grupo.ladoA.chave]: vTrue, [grupo.ladoB.chave]: vFalse } },
      { rotulo: `${nomeExibicao} ${grupo.ladoB.rotulo}`, propriedades: { [grupo.ladoA.chave]: vFalse, [grupo.ladoB.chave]: vTrue } },
      { rotulo: `BOTH ${nomeExibicao}S`, propriedades: { [grupo.ladoA.chave]: vTrue, [grupo.ladoB.chave]: vTrue } },
      { rotulo: `NO ${nomeExibicao}`, propriedades: { [grupo.ladoA.chave]: vFalse, [grupo.ladoB.chave]: vFalse } },
    ];
  }

  // VARIANT: produto cartesiano de opções
  const opcoesA = defsRaiz[grupo.ladoA.chave].variantOptions || [];
  const opcoesB = defsRaiz[grupo.ladoB.chave].variantOptions || [];
  const combos: CombinacaoGrupo[] = [];
  for (const a of opcoesA) {
    for (const b of opcoesB) {
      combos.push({
        rotulo: `${a.toUpperCase()} + ${b.toUpperCase()}`,
        propriedades: { [grupo.ladoA.chave]: a, [grupo.ladoB.chave]: b },
      });
    }
  }
  return combos;
}

// === DNA VISUAL (CASCATA DE VISIBILIDADE) ===

/**
 * Escaneia a árvore de um componente para mapear dependências de visibilidade.
 *
 * No Figma, propriedades booleanas podem controlar a visibilidade de camadas internas.
 * Quando uma camada filha depende de uma propriedade "pai" para ser visível,
 * essa relação é registrada em componentPropertyReferences.visible.
 *
 * O mapa DNA resultante permite que, ao ativar uma propriedade (ex: "show icon"),
 * também ativemos automaticamente suas dependências pai (ex: "show toolbar").
 *
 * @param variantePadrao - A variante padrão do ComponentSet
 * @returns Mapa de propriedade → lista de propriedades pai que devem ser ativadas junto
 */
function escanearDNA(variantePadrao: SceneNode): MapaDNA {
  const dna: MapaDNA = new Map();

  function percorrer(no: SceneNode, pais: string[]) {
    const refs = (no as any).componentPropertyReferences;
    const proximosPais = [...pais];
    if (refs?.visible) {
      const prop = refs.visible;
      if (!dna.has(prop)) dna.set(prop, []);
      pais.forEach(pai => {
        if (!dna.get(prop)!.includes(pai)) dna.get(prop)!.push(pai);
      });
      proximosPais.push(prop);
    }
    if ("children" in no) (no as any).children.forEach((filho: any) => percorrer(filho, proximosPais));
  }

  percorrer(variantePadrao, []);
  return dna;
}

/**
 * Aplica cascata de DNA: para cada propriedade true, ativa seus "pais" de visibilidade.
 */
function aplicarCascataDNA(propriedades: Record<string, any>, dna: MapaDNA): void {
  for (const [chave, valor] of Object.entries(propriedades)) {
    const ehAtivo = valor === true || (typeof valor === "string" && valor.toLowerCase().trim() === "true");
    if (ehAtivo && dna.has(chave)) {
      dna.get(chave)!.forEach(pai => { propriedades[pai] = true; });
    }
  }
}

// === FUNÇÕES AUXILIARES DE RENDERIZAÇÃO ===

/**
 * Formata o valor de uma propriedade para exibição na tabela.
 * Valores padrão são marcados em **negrito** (markdown).
 */
function formatarValorPropriedade(
  def: { type: string; defaultValue?: any; variantOptions?: string[]; value?: any },
  componentSet?: ComponentSetNode,
  nomeProp?: string,
  instancia?: InstanceNode
): string {
  if (def.type === "TEXT") return "**texto**";

  if (def.type === "BOOLEAN") {
    const valor = 'value' in def ? def.value as boolean : def.defaultValue as boolean;
    return valor ? "**true**, false" : "true, **false**";
  }

  // VARIANT com opções "true"/"false" — tratar como booleano
  if (ehVarianteBoolTexto(def)) {
    const valorPadrao = ('value' in def ? def.value : def.defaultValue) as string;
    const ehTrue = valorPadrao?.toLowerCase().trim() === "true";
    return ehTrue ? "**true**, false" : "true, **false**";
  }

  if (def.type === "VARIANT") {
    const valorPadrao = ('value' in def ? def.value : def.defaultValue) as string;
    let opcoes = def.variantOptions || [];

    // Para propriedades expostas, buscar opções no ComponentSet de origem
    if (opcoes.length === 0 && instancia && nomeProp) {
      try {
        const mainComp = (instancia as any)._mainComponent;
        if (mainComp?.parent?.type === "COMPONENT_SET") {
          opcoes = buscarOpcoesVariante(mainComp.parent as ComponentSetNode, nomeProp);
        }
      } catch {}
      if (opcoes.length === 0 && componentSet) {
        opcoes = buscarOpcoesVariante(componentSet, nomeProp!);
      }
    }

    if (opcoes.length > 0) {
      return opcoes.map(opt => opt === valorPadrao ? `**${opt}**` : opt).join(", ");
    }
    return typeof valorPadrao === "string" ? `**${valorPadrao}**` : "variante";
  }

  if (def.type === "INSTANCE_SWAP") return "seleção de componente";
  return "";
}

/**
 * Cria e popula uma linha na tabela de propriedades do handoff.
 * Reutiliza o componente master da linha quando disponível, senão clona a base.
 *
 * @param compLinhaTabela - Componente master da linha (pode ser null)
 * @param linhaBase - Linha base do template para clonagem (fallback)
 * @param tabela - Frame da tabela onde a linha será inserida
 * @param nomeExibicao - Nome da propriedade
 * @param valor - Valor formatado (com markdown)
 * @param descricao - Descrição da propriedade
 */
async function criarLinhaTabela(
  compLinhaTabela: ComponentNode | null,
  linhaBase: SceneNode,
  tabela: FrameNode,
  nomeExibicao: string,
  valor: string,
  descricao: string
): Promise<void> {
  const linha = compLinhaTabela ? compLinhaTabela.createInstance() : linhaBase.clone();
  tabela.appendChild(linha);

  // Copiar largura e layout da linha base do template
  if (linhaBase) {
    (linha as FrameNode).resize(linhaBase.width, linha.height);
    if ("layoutSizingHorizontal" in linhaBase) {
      (linha as any).layoutSizingHorizontal = (linhaBase as any).layoutSizingHorizontal;
    }
    if ("layoutAlign" in linhaBase) {
      (linha as any).layoutAlign = (linhaBase as any).layoutAlign;
    }
  }

  // Busca resiliente de TextNodes (por nome → por posição → fallback recursivo)
  let textoNome = buscarPrimeiroTexto(buscarFilho(linha, "Property Name") || (linha as any).children[0]);
  let textoValor = buscarPrimeiroTexto(buscarFilho(linha, "Property Value") || (linha as any).children[1]);
  let textoDesc = buscarPrimeiroTexto(buscarFilho(linha, "Property Description") || (linha as any).children[2]);

  if (!textoNome || !textoValor || !textoDesc) {
    const todosTextos = coletarTextos(linha);
    if (!textoNome && todosTextos.length > 0) textoNome = todosTextos[0];
    if (!textoValor && todosTextos.length > 1) textoValor = todosTextos[1];
    if (!textoDesc && todosTextos.length > 2) textoDesc = todosTextos[2];
  }

  if (textoNome) textoNome.characters = nomeExibicao;
  if (textoValor) {
    await aplicarTextoComNegrito(textoValor, valor);
    marcarTextoOriginal(textoValor, `table::${nomeExibicao}::valor`);
  }
  if (textoDesc) {
    await aplicarTextoComNegrito(textoDesc, descricao);
    marcarTextoOriginal(textoDesc, `table::${nomeExibicao}::desc`);
  }
}

/**
 * Cria um card de variação com instância do componente e verifica fundo escuro.
 *
 * @param containerCards - Frame onde o card será inserido
 * @param cardBase - Card template para clonagem
 * @param componentSet - ComponentSet para criar instâncias
 * @param rotulo - Texto do label do card
 * @param propriedades - Propriedades a aplicar na instância
 * @param dna - Mapa de cascata de visibilidade
 */
async function criarCardVariacao(
  containerCards: FrameNode,
  cardBase: SceneNode,
  componentSet: ComponenteDocumentavel,
  rotulo: string,
  propriedades: Record<string, any>,
  dna: MapaDNA,
  modeDark: { collectionId: string; modeId: string; colecao: VariableCollection } | null = null
): Promise<void> {
  const cardBruto = cardBase.clone();
  containerCards.appendChild(cardBruto);
  // Remover TODAS as instâncias da árvore do card antes de desvincular,
  // para evitar que placeholders do template fiquem duplicados com a nova instância
  function removerInstanciasCard(no: SceneNode): void {
    if (!('children' in no)) return;
    for (const filho of [...(no as any).children]) {
      if (filho.type === 'INSTANCE') {
        filho.remove();
      } else {
        removerInstanciasCard(filho);
      }
    }
  }
  removerInstanciasCard(cardBruto);
  const card = desvincularTodasInstancias(cardBruto) as FrameNode;
  card.minWidth = CARD_LARGURA_MINIMA;
  card.layoutSizingHorizontal = "HUG";

  // Label do card
  const label = buscarFilho(card, "VALUE") as TextNode;
  if (label) {
    label.characters = rotulo;
    marcarTextoOriginal(label, `variants::${rotulo}::label`);
  }

  // Remover placeholder de swap slot
  const swapSlot = buscarFilho(card, "[base] Swap Slot");
  if (swapSlot) swapSlot.remove();

  // Criar instância e aplicar propriedades com cascata DNA
  const instancia = obterVariantePadrao(componentSet).createInstance();
  const propsFinais: Record<string, any> = { ...propriedades };
  aplicarCascataDNA(propsFinais, dna);

  try { instancia.setProperties(propsFinais); } catch {}

  card.appendChild(instancia);

  // Aplicar dark mode se solicitado
  if (modeDark) {
    // Setar dark mode do componente na instância
    try {
      card.setExplicitVariableModeForCollection(modeDark.colecao, modeDark.modeId);
    } catch {
      try {
        card.setExplicitVariableModeForCollection(modeDark.collectionId, modeDark.modeId);
      } catch {}
    }

    // Setar dark mode da collection do handoff no card
    await aplicarDarkModeHandoff(card);
  } else {
    // Light mode: verificar se componente claro some no fundo claro
    try {
      if (precisaFundoEscuro(instancia)) {
        await aplicarFundoEscuroCard(card, label);
      }
    } catch {}
  }
}

/**
 * Cria um container horizontal com wrap para os cards de variação.
 * Insere o container após o subtítulo na seção.
 */
function criarContainerCards(secao: FrameNode, frameSubtitulo: SceneNode | null): FrameNode {
  const container = figma.createFrame();
  container.layoutMode = "HORIZONTAL";
  container.layoutWrap = "WRAP";
  container.layoutSizingVertical = "HUG";
  container.itemSpacing = CARD_ESPACAMENTO;
  container.counterAxisSpacing = CARD_ESPACAMENTO;
  container.fills = [];

  if (frameSubtitulo && frameSubtitulo.parent === secao) {
    let idx = 0;
    for (let i = 0; i < secao.children.length; i++) {
      if (secao.children[i] === frameSubtitulo) { idx = i; break; }
    }
    secao.insertChild(idx + 1, container);
  } else {
    secao.insertChild(1, container);
  }

  container.layoutSizingHorizontal = "FILL";
  return container;
}

/**
 * Verifica se algum card excede a largura do container e,
 * nesse caso, empilha verticalmente em vez de horizontalmente.
 */
function ajustarLayoutSeCardNaoCabe(container: FrameNode): void {
  const larguraContainer = container.width;
  const excede = container.children.some(child =>
    'width' in child && child.width > larguraContainer * 0.9
  );
  if (excede) {
    container.layoutMode = "VERTICAL";
    container.layoutWrap = "NO_WRAP";
  }
}

// === SINCRONIZAÇÃO DE ESTRUTURA DO TEMPLATE ===

/**
 * Copia propriedades de layout e visual de um FrameNode para outro.
 * NÃO copia: name, x, y, width, height, pluginData, children.
 */
function sincronizarPropriedadesLayout(origem: FrameNode, destino: FrameNode): void {
  // Layout
  destino.layoutMode = origem.layoutMode;
  destino.primaryAxisAlignItems = origem.primaryAxisAlignItems;
  destino.counterAxisAlignItems = origem.counterAxisAlignItems;
  destino.layoutWrap = origem.layoutWrap;
  destino.itemSpacing = origem.itemSpacing;
  destino.counterAxisSpacing = origem.counterAxisSpacing;
  destino.paddingTop = origem.paddingTop;
  destino.paddingRight = origem.paddingRight;
  destino.paddingBottom = origem.paddingBottom;
  destino.paddingLeft = origem.paddingLeft;
  destino.layoutSizingHorizontal = origem.layoutSizingHorizontal;
  destino.layoutSizingVertical = origem.layoutSizingVertical;

  // Visual
  destino.fills = JSON.parse(JSON.stringify(origem.fills));
  destino.strokes = JSON.parse(JSON.stringify(origem.strokes));
  destino.strokeWeight = origem.strokeWeight;
  destino.strokeAlign = origem.strokeAlign;
  destino.cornerRadius = origem.cornerRadius;
  if (origem.cornerRadius === figma.mixed) {
    destino.topLeftRadius = origem.topLeftRadius;
    destino.topRightRadius = origem.topRightRadius;
    destino.bottomLeftRadius = origem.bottomLeftRadius;
    destino.bottomRightRadius = origem.bottomRightRadius;
  }
  destino.clipsContent = origem.clipsContent;
  destino.effects = JSON.parse(JSON.stringify(origem.effects));
}

/**
 * Coleta todas as fontes usadas em nós TEXT dentro de uma árvore.
 */
function coletarFontes(no: SceneNode, fontes: Set<string>): void {
  if (no.type === "TEXT") {
    const texto = no as TextNode;
    if (typeof texto.fontName !== "symbol") {
      fontes.add(JSON.stringify(texto.fontName));
    }
  }
  if ("children" in no) {
    for (const filho of (no as any).children) coletarFontes(filho as SceneNode, fontes);
  }
}

/**
 * Sincroniza propriedades visuais recursivamente entre dois nós com mesma estrutura.
 * Para FRAMEs: copia layout/visual. Para TEXTs: copia estilo (fonte, cor) mas NÃO o conteúdo.
 * Faz matching dos filhos por nome para percorrer a árvore em paralelo.
 *
 * IMPORTANTE: chamar com fontes já carregadas para performance.
 */
function sincronizarVisuaisRecursivo(origem: SceneNode, destino: SceneNode): void {
  // Sync de FRAMEs
  if (origem.type === "FRAME" && destino.type === "FRAME") {
    sincronizarPropriedadesLayout(origem as FrameNode, destino as FrameNode);
  }

  // Sync de TEXTs — estilo sem conteúdo
  if (origem.type === "TEXT" && destino.type === "TEXT") {
    const textoOrigem = origem as TextNode;
    const textoDestino = destino as TextNode;

    // Copiar fills (cor do texto)
    if (typeof textoOrigem.fills !== "symbol") {
      textoDestino.fills = JSON.parse(JSON.stringify(textoOrigem.fills));
    }
    // Copiar fonte (se não for mixed)
    if (typeof textoOrigem.fontName !== "symbol" && typeof textoDestino.fontName !== "symbol") {
      try {
        textoDestino.fontName = textoOrigem.fontName;
      } catch { /* fonte não carregada — manter a atual */ }
    }
    // Copiar tamanho (se não for mixed)
    if (typeof textoOrigem.fontSize !== "symbol") {
      textoDestino.fontSize = textoOrigem.fontSize as number;
    }
    // Copiar line height e letter spacing
    if (typeof textoOrigem.lineHeight !== "symbol") {
      textoDestino.lineHeight = textoOrigem.lineHeight;
    }
    if (typeof textoOrigem.letterSpacing !== "symbol") {
      textoDestino.letterSpacing = textoOrigem.letterSpacing;
    }
    return;
  }

  // Recursão: se ambos têm filhos, fazer matching por nome
  if ("children" in origem && "children" in destino) {
    const filhosOrigem = (origem as any).children as SceneNode[];
    const filhosDestino = (destino as any).children as SceneNode[];

    // Criar mapa de destino por nome para matching
    const mapaDestino = new Map<string, SceneNode>();
    for (const f of filhosDestino) mapaDestino.set(f.name, f);

    for (const filhoOrigem of filhosOrigem) {
      const filhoDestino = mapaDestino.get(filhoOrigem.name);
      if (filhoDestino) {
        sincronizarVisuaisRecursivo(filhoOrigem, filhoDestino);
      }
    }
  }
}

/** Seções que possuem função geradora em atualizarSecao */
const SECOES_GERAVEIS = ["table", "anatomy", "variants", "states"];

/** Nomes amigáveis para exibir no progresso da UI */
const NOMES_SECOES: Record<string, string> = {
  table: "Tabela de propriedades",
  anatomy: "Anatomia",
  variants: "Variações",
  states: "Matriz de estados",
  "observações": "Observações",
  a11y: "Acessibilidade",
};

/**
 * Extrai a ordem das seções diretamente do template, sem sincronizar visuais.
 * Retorna a lista de nomes de seções geráveis na ordem em que aparecem no template.
 */
async function extrairOrdemDoTemplate(templateCompId: string): Promise<string[]> {
  const instancia = await resolverTemplate(templateCompId);
  if (!instancia) return [...ORDEM_SECOES];

  const container = instancia.detachInstance();
  const secoes: string[] = [];
  const jaAdicionadas = new Set<string>();

  // Mapear quais filhos diretos contêm seções geráveis (ex: "properties" contém "table")
  const geraveisDoContainer = new Map<string, string[]>();
  for (const nomeGeravel of SECOES_GERAVEIS) {
    const encontrado = buscarFilho(container, nomeGeravel);
    if (encontrado) {
      for (const filhoDirecto of container.children) {
        if (filhoDirecto.name.toLowerCase() !== nomeGeravel && "children" in filhoDirecto) {
          if (buscarFilho(filhoDirecto, nomeGeravel)) {
            const lista = geraveisDoContainer.get(filhoDirecto.name) || [];
            lista.push(nomeGeravel);
            geraveisDoContainer.set(filhoDirecto.name, lista);
          }
        }
      }
    }
  }

  for (const filho of container.children) {
    const nomeNorm = filho.name.toLowerCase();
    if (ORDEM_SECOES.includes(nomeNorm) && !jaAdicionadas.has(nomeNorm)) {
      secoes.push(nomeNorm);
      jaAdicionadas.add(nomeNorm);
    }
    const geraveisDentro = geraveisDoContainer.get(filho.name);
    if (geraveisDentro) {
      for (const g of geraveisDentro) {
        if (!jaAdicionadas.has(g)) {
          secoes.push(g);
          jaAdicionadas.add(g);
        }
      }
    }
  }

  container.remove();
  return secoes.length > 0 ? secoes : [...ORDEM_SECOES];
}

/**
 * Reordena os filhos de um container para corresponder à ordem do template.
 * Filhos extras (que não existem no template) são preservados no final.
 */
function reordenarFilhos(container: FrameNode, ordemTemplate: string[]): void {
  const indicePorNome = new Map<string, number>();
  ordemTemplate.forEach((nome, i) => indicePorNome.set(nome, i));

  const filhos = [...container.children];
  filhos.sort((a, b) => {
    const ia = indicePorNome.has(a.name) ? indicePorNome.get(a.name)! : ordemTemplate.length;
    const ib = indicePorNome.has(b.name) ? indicePorNome.get(b.name)! : ordemTemplate.length;
    return ia - ib;
  });

  for (let i = 0; i < filhos.length; i++) {
    container.insertChild(i, filhos[i]);
  }
}


/**
 * Sincroniza a estrutura do template no handoff existente:
 * - Copia propriedades de layout/visual do container
 * - Para TODOS os filhos do template:
 *   - Se existe no handoff (por nome) → sincroniza visuais recursivamente
 *   - Se NÃO existe → insere diretamente do template fresco
 * - Reordena filhos do handoff para corresponder à ordem do template
 *
 * Retorna:
 * - secoes: nomes dos filhos do template que contêm seções geráveis (para atualizarSecao)
 * - ordemFilhos: ordem completa dos filhos do template
 * - secoesInseridas: filhos que foram inseridos agora (para pular no atualizarSecao)
 */
async function sincronizarEstruturaTemplate(
  handoff: FrameNode,
  templateCompId: string
): Promise<{ secoes: string[]; ordemFilhos: string[]; secoesInseridas: Set<string> }> {
  const fallback = { secoes: [...ORDEM_SECOES], ordemFilhos: [], secoesInseridas: new Set<string>() };

  // 1. Criar instância fresca do template e desvincular
  const instancia = await resolverTemplate(templateCompId);
  if (!instancia) return fallback;

  const containerFresco = instancia.detachInstance();

  // 2. Copiar propriedades de layout/visual do container fresco → handoff
  sincronizarPropriedadesLayout(containerFresco, handoff);

  // 2b. Pré-mapear seções geráveis presentes no template (antes de mover filhos)
  // e identificar quais filhos diretos do template CONTÊM seções geráveis
  const secoesGeraveisPresentes = new Set<string>();
  const geraveisDoContainer = new Map<string, string[]>(); // nome do container → lista de geráveis dentro dele
  for (const nomeGeravel of SECOES_GERAVEIS) {
    const encontrado = buscarFilho(containerFresco, nomeGeravel);
    if (encontrado) {
      secoesGeraveisPresentes.add(nomeGeravel);
      // Verificar se está dentro de um filho direto com nome diferente
      // (ex: "table" dentro de "properties")
      for (const filhoDirecto of containerFresco.children) {
        if (filhoDirecto.name.toLowerCase() !== nomeGeravel && "children" in filhoDirecto) {
          if (buscarFilho(filhoDirecto, nomeGeravel)) {
            const lista = geraveisDoContainer.get(filhoDirecto.name) || [];
            lista.push(nomeGeravel);
            geraveisDoContainer.set(filhoDirecto.name, lista);
          }
        }
      }
    }
  }

  // 3. Processar TODOS os filhos do template uniformemente
  const ordemFilhos: string[] = [];
  const secoesInseridas = new Set<string>();

  // Pré-carregar todas as fontes do template e do handoff (batch, para performance)
  const fontesParaCarregar = new Set<string>();
  coletarFontes(containerFresco, fontesParaCarregar);
  coletarFontes(handoff, fontesParaCarregar);
  await Promise.all(
    [...fontesParaCarregar].map(f => figma.loadFontAsync(JSON.parse(f)).catch(() => {}))
  );

  // Construir mapa de filhos do handoff por nome (para matching)
  // Tratar duplicatas: usar o primeiro match disponível
  const filhosHandoffPorNome = new Map<string, SceneNode[]>();
  for (const filho of handoff.children) {
    const lista = filhosHandoffPorNome.get(filho.name) || [];
    lista.push(filho);
    filhosHandoffPorNome.set(filho.name, lista);
  }

  // Rastrear quais filhos do handoff já foram matchados (para duplicatas como "behaviour")
  const matchados = new Set<string>(); // IDs dos nós já matchados

  const filhosTemplate = [...containerFresco.children];
  for (const filhoTemplate of filhosTemplate) {
    ordemFilhos.push(filhoTemplate.name);

    // Buscar correspondente no handoff (primeiro não-matchado com mesmo nome)
    const candidatos = filhosHandoffPorNome.get(filhoTemplate.name) || [];
    const correspondente = candidatos.find(c => !c.removed && !matchados.has(c.id));

    if (correspondente) {
      // Existe no handoff → sincronizar visuais (preserva textos editados)
      matchados.add(correspondente.id);
      sincronizarVisuaisRecursivo(filhoTemplate, correspondente);
    } else {
      // Não existe no handoff → inserir diretamente do template fresco
      handoff.appendChild(filhoTemplate);
      await carregarFontes(filhoTemplate);

      // Marcar com pluginData se for um container de seção
      const nomeNorm = filhoTemplate.name.toLowerCase();
      if ("children" in filhoTemplate) {
        filhoTemplate.setPluginData("secaoNome", filhoTemplate.name);
        filhoTemplate.setPluginData("secaoDominio", DOMINIO_SECOES[nomeNorm] || DOMINIO_SECOES[filhoTemplate.name] || "design");
      }
      secoesInseridas.add(filhoTemplate.name);
    }
  }

  // 4. Construir lista de seções geráveis na ordem do template.
  // Para cada filho do template, verificar se ele É ou CONTÉM uma seção gerável.
  // Isso garante que "table" (dentro de "properties") entra na posição correta.
  const secoes: string[] = [];
  const jaAdicionadas = new Set<string>();

  for (const nome of ordemFilhos) {
    const nomeNorm = nome.toLowerCase();
    // Caso 1: filho direto é uma seção gerável (ex: "anatomy", "variants", "states")
    if (ORDEM_SECOES.includes(nomeNorm) && !jaAdicionadas.has(nomeNorm)) {
      secoes.push(nomeNorm);
      jaAdicionadas.add(nomeNorm);
    }
    // Caso 2: filho direto CONTÉM seções geráveis (ex: "properties" contém "table")
    const geraveisDentro = geraveisDoContainer.get(nome);
    if (geraveisDentro) {
      for (const nomeGeravel of geraveisDentro) {
        if (!jaAdicionadas.has(nomeGeravel)) {
          secoes.push(nomeGeravel);
          jaAdicionadas.add(nomeGeravel);
        }
      }
    }
  }

  // Adicionar seções geráveis restantes que podem não ter sido capturadas
  for (const nomeGeravel of SECOES_GERAVEIS) {
    if (!jaAdicionadas.has(nomeGeravel) && secoesGeraveisPresentes.has(nomeGeravel)) {
      secoes.push(nomeGeravel);
      jaAdicionadas.add(nomeGeravel);
    }
  }

  // 5. Remover filhos do handoff que não existem mais no template
  const nomesNoTemplate = new Set(ordemFilhos.map(n => n.toLowerCase()));
  for (const filho of [...handoff.children]) {
    if (!nomesNoTemplate.has(filho.name.toLowerCase()) && !matchados.has(filho.id)) {
      filho.remove();
    }
  }

  // 6. NÃO reordenar aqui — a reordenação final acontece nos handlers
  // APÓS atualizarSecao, que pode remover/inserir seções.

  // 7. Descartar o container temporário (filhos inseridos já saíram dele)
  containerFresco.remove();

  return { secoes, ordemFilhos, secoesInseridas };
}

// === EXTRAÇÃO E REINJEÇÃO DE DADOS MANUAIS ===

/**
 * Extrai descrições manuais da tabela de propriedades existente.
 * Retorna Map<nomePropriedade, textoDescricao> para propriedades cujo Description foi editado.
 */
function extrairDescricoesTabela(secaoTabela: SceneNode): Map<string, string> {
  const mapa = new Map<string, string>();
  if (!("children" in secaoTabela)) return mapa;

  const tabela = secaoTabela as FrameNode;
  for (const filho of tabela.children) {
    if (filho.name.toLowerCase().includes("header")) continue;

    const noNome = buscarFilho(filho, "Property Name");
    const noDesc = buscarFilho(filho, "Property Description");
    if (!noNome || !noDesc) continue;

    const textoNome = buscarPrimeiroTexto(noNome);
    const textoDesc = buscarPrimeiroTexto(noDesc);
    if (textoNome && textoDesc && textoDesc.characters.trim()) {
      mapa.set(textoNome.characters.trim(), textoDesc.characters.trim());
    }
  }
  return mapa;
}

/**
 * Extrai descrições manuais da seção de anatomia existente.
 * Retorna Map<nomeElemento, textoDescricao> para elementos cujo Description foi editado.
 */
function extrairDescricoesAnatomia(secaoAnatomia: SceneNode): Map<string, string> {
  const mapa = new Map<string, string>();
  const frameSpecs = buscarFilho(secaoAnatomia, "specs") as FrameNode;
  if (!frameSpecs || !("children" in frameSpecs)) return mapa;

  for (const filho of frameSpecs.children) {
    if (filho.name.toLowerCase() === "element" && "children" in filho) continue; // template

    const noNome = buscarFilho(filho, "Element name");
    const noDesc = buscarFilho(filho, "Description");
    if (!noNome || !noDesc) continue;

    const textoNome = buscarPrimeiroTexto(noNome);
    const textoDesc = buscarPrimeiroTexto(noDesc);
    if (textoNome && textoDesc && textoDesc.characters.trim() && textoDesc.characters.trim() !== " ") {
      mapa.set(textoNome.characters.trim(), textoDesc.characters.trim());
    }
  }
  return mapa;
}

/**
 * Reinjeta descrições manuais preservadas na tabela recém-gerada.
 */
async function reinjetarDescricoesTabela(secaoTabela: SceneNode, dados: Map<string, string>): Promise<void> {
  if (dados.size === 0 || !("children" in secaoTabela)) return;

  const tabela = secaoTabela as FrameNode;
  for (const filho of tabela.children) {
    if (filho.name.toLowerCase().includes("header")) continue;

    const noNome = buscarFilho(filho, "Property Name");
    const noDesc = buscarFilho(filho, "Property Description");
    if (!noNome || !noDesc) continue;

    const textoNome = buscarPrimeiroTexto(noNome);
    const textoDesc = buscarPrimeiroTexto(noDesc);
    if (!textoNome || !textoDesc) continue;

    const chave = textoNome.characters.trim();
    if (dados.has(chave)) {
      await carregarFontes(noDesc);
      await aplicarTextoComNegrito(textoDesc, dados.get(chave)!);
    }
  }
}

/**
 * Reinjeta descrições manuais preservadas na anatomia recém-gerada.
 */
async function reinjetarDescricoesAnatomia(secaoAnatomia: SceneNode, dados: Map<string, string>): Promise<void> {
  if (dados.size === 0) return;

  const frameSpecs = buscarFilho(secaoAnatomia, "specs") as FrameNode;
  if (!frameSpecs || !("children" in frameSpecs)) return;

  for (const filho of frameSpecs.children) {
    const noNome = buscarFilho(filho, "Element name");
    const noDesc = buscarFilho(filho, "Description");
    if (!noNome || !noDesc) continue;

    const textoNome = buscarPrimeiroTexto(noNome);
    const textoDesc = buscarPrimeiroTexto(noDesc);
    if (!textoNome || !textoDesc) continue;

    const chave = textoNome.characters.trim();
    if (dados.has(chave)) {
      await carregarFontes(noDesc);
      await aplicarTextoComNegrito(textoDesc, dados.get(chave)!);
      if ("visible" in noDesc) (noDesc as any).visible = true;
    }
  }
}

/**
 * Extrai todos os textos de uma seção genérica (sem gerador específico).
 * Usa caminho hierárquico do nó como chave para matching robusto.
 * Retorna Map<caminhoDoTexto, conteúdo> para reinjeção posterior.
 */
function extrairTextosGenericos(secao: SceneNode): Map<string, string> {
  const mapa = new Map<string, string>();
  const textos = coletarTextos(secao);
  for (const t of textos) {
    const caminho = calcularCaminhoNo(t, secao);
    mapa.set(caminho, t.characters);
  }
  return mapa;
}

/**
 * Calcula um caminho hierárquico de nomes do nó até a raiz da seção.
 * Ex: "specs/element 1/Description" — usado como chave estável para matching.
 */
function calcularCaminhoNo(no: SceneNode, raiz: SceneNode): string {
  const partes: string[] = [no.name];
  let atual: BaseNode | null = no.parent;
  while (atual && atual !== raiz && "name" in atual) {
    partes.unshift((atual as SceneNode).name);
    atual = atual.parent;
  }
  return partes.join("/");
}

/**
 * Reinjeta textos preservados em uma seção fresca do template.
 * Percorre TextNodes da seção nova e restaura textos que possuem o mesmo caminho hierárquico.
 */
async function reinjetarTextosGenericos(secao: SceneNode, dados: Map<string, string>): Promise<void> {
  if (dados.size === 0) return;
  const textos = coletarTextos(secao);
  for (const t of textos) {
    const caminho = calcularCaminhoNo(t, secao);
    if (dados.has(caminho)) {
      await carregarFontes(t);
      t.characters = dados.get(caminho)!;
    }
  }
}

// === SEÇÕES PRINCIPAIS DO HANDOFF ===

/**
 * Gera a tabela de propriedades do componente.
 * Inclui propriedades locais (do ComponentSet) e propriedades expostas (de instâncias aninhadas).
 */
async function gerarTabelaPropriedades(
  container: FrameNode,
  componentSet: ComponenteDocumentavel,
  compLinhaTabela: ComponentNode | null
): Promise<void> {
  const alvoTabela = buscarFilho(container, "table");
  if (!alvoTabela) return;

  const larguraOriginal = alvoTabela.width;
  const tabela = desvincularInstancia(alvoTabela) as FrameNode;
  tabela.layoutSizingHorizontal = "FIXED";
  tabela.resize(larguraOriginal, tabela.height);

  const linhaBase = buscarFilho(tabela, "Property Table Row");
  if (!linhaBase) return;

  const defs = componentSet.componentPropertyDefinitions;

  // --- Propriedades Locais (ordem do painel do Figma) ---
  // componentProperties de uma instância reflete a ordem do painel;
  // variantes vêm de componentPropertyDefinitions (não existem em componentProperties).
  const instanciaOrdem = obterVariantePadrao(componentSet).createInstance();
  const propsInstancia = instanciaOrdem.componentProperties;
  instanciaOrdem.remove();

  // Variantes primeiro (na ordem de defs), depois o restante na ordem da instância
  const chavesVariantes = Object.keys(defs).filter(k => defs[k].type === "VARIANT");
  const jaIncluidas = new Set(chavesVariantes);
  const chavesInstancia = Object.keys(propsInstancia).filter(k => {
    if (!(k in defs)) return false;
    if (jaIncluidas.has(k)) return false;
    jaIncluidas.add(k);
    return true;
  });
  const chaves = [...chavesVariantes, ...chavesInstancia];

  for (const chave of chaves) {
    const def = defs[chave];
    const nomeExibicao = limparNomePropriedade(chave);
    const valor = formatarValorPropriedade(def);
    const descricao = obterDescricaoPropriedade(nomeExibicao.toLowerCase(), def.type, nomeExibicao, def);

    await criarLinhaTabela(compLinhaTabela, linhaBase, tabela, nomeExibicao, valor, descricao);
  }

  // --- Propriedades Expostas (instâncias aninhadas visíveis externamente) ---
  if ("children" in obterVariantePadrao(componentSet)) {
    const expostas: InstanceNode[] = [];
    for (const filho of (obterVariantePadrao(componentSet) as any).children) {
      if (filho.type === "INSTANCE" && filho.isExposedInstance) {
        expostas.push(filho as InstanceNode);
      }
    }

    for (const instancia of expostas.sort((a, b) => a.name.localeCompare(b.name))) {
      const nomeInstancia = instancia.name;
      const props = instancia.componentProperties;

      for (const [chaveProp, defProp] of Object.entries(props).sort(([a], [b]) => a.localeCompare(b))) {
        const nomeProp = limparNomePropriedade(chaveProp);
        const nomeExibicao = `${nomeInstancia} → ${nomeProp}`;

        // Para VARIANT expostas, buscar opções no ComponentSet de origem
        let valor = "";
        if (defProp.type === "VARIANT") {
          const valorAtual = defProp.value as string;
          let opcoes: string[] = [];

          try {
            const compPrincipal = await instancia.getMainComponentAsync();
            if (compPrincipal?.parent?.type === "COMPONENT_SET") {
              opcoes = buscarOpcoesVariante(compPrincipal.parent as ComponentSetNode, nomeProp);
            }
            if (opcoes.length === 0) {
              opcoes = buscarOpcoesVariante(componentSet, nomeProp);
            }
          } catch {}

          valor = opcoes.length > 0
            ? opcoes.map(opt => opt === valorAtual ? `**${opt}**` : opt).join(", ")
            : typeof valorAtual === "string" ? `**${valorAtual}**` : "variante";
        } else {
          valor = formatarValorPropriedade(defProp as any);
        }

        const descricao = obterDescricaoPropriedade(nomeProp.toLowerCase(), defProp.type, nomeProp, defProp as any);
        await criarLinhaTabela(compLinhaTabela, linhaBase, tabela, nomeExibicao, valor, descricao);
      }
    }
  }

  linhaBase.remove();
}

/**
 * Gera a seção de variações visuais (anatomia) do componente.
 * Agrupa propriedades direcionais (left/right, etc.) e renderiza cards para cada variação.
 */
async function gerarSecaoVariacoes(
  container: FrameNode,
  componentSet: ComponenteDocumentavel,
  dna: MapaDNA,
  truePrimeiro: boolean = false
): Promise<void> {
  const alvoVariacoes = buscarFilho(container, "variants");
  if (!alvoVariacoes) return;

  const secaoVariacoes = desvincularTodasInstancias(alvoVariacoes) as FrameNode;
  const conteudoBase = buscarFilho(secaoVariacoes, "variant content");
  if (!conteudoBase) return;

  // Remover TODAS as seções "variant content" da árvore inteira (exceto o template base)
  // e também seções geradas em runs anteriores (nomeadas "variant-section-*")
  function limparVariantContent(raiz: FrameNode): void {
    for (const filho of [...raiz.children]) {
      if (filho === conteudoBase) continue;
      const nome = filho.name.toLowerCase();
      if (nome === 'variant content' || nome.startsWith('variant-section-')) {
        filho.remove();
      } else if ('children' in filho) {
        limparVariantContent(filho as FrameNode);
      }
    }
  }
  limparVariantContent(secaoVariacoes);

  const defsRaiz = componentSet.componentPropertyDefinitions;

  // Verificar se o componente tem propriedade de state
  const temState = Object.keys(defsRaiz).some(p =>
    limparNomePropriedade(p).toLowerCase().includes("state") && defsRaiz[p].type === "VARIANT"
  );

  // Se não tem state, buscar dark mode para duplicar cards Light/Dark
  const modeDark = !temState ? await buscarModeDark(componentSet) : null;
  const temas: Array<{ sufixo: string; dark: boolean }> = modeDark
    ? [{ sufixo: "Light", dark: false }, { sufixo: "Dark", dark: true }]
    : [{ sufixo: "", dark: false }];

  // Filtrar propriedades elegíveis: excluir state, TEXT e INSTANCE_SWAP
  const propsAnatomia = Object.keys(defsRaiz).filter(p => {
    const nome = limparNomePropriedade(p).toLowerCase();
    const tipo = defsRaiz[p].type;
    return !nome.includes("state") && tipo !== "TEXT" && tipo !== "INSTANCE_SWAP";
  });

  const { grupos, naoAgrupadas } = detectarGruposDirecionais(propsAnatomia, defsRaiz);

  // --- Seções agrupadas (pares direcionais) ---
  for (const grupo of grupos) {
    const secaoBruta = conteudoBase.clone();
    secaoVariacoes.appendChild(secaoBruta);
    const secao = desvincularTodasInstancias(secaoBruta) as FrameNode;

    const frameSubtitulo = buscarFilho(secao, "Subtitle Variants");
    const textoSubtitulo = frameSubtitulo ? buscarPrimeiroTexto(frameSubtitulo) : null;
    const nomeExibicao = capitalizar(grupo.nomeBase.replace(/^(show|has|display)\s+/i, ''));
    secao.name = `variant-section-${grupo.nomeBase}`;
    if (textoSubtitulo) {
      textoSubtitulo.characters = nomeExibicao;
      marcarTextoOriginal(textoSubtitulo, `variants::${nomeExibicao}::subtitle`);
    }

    const cardBase = buscarFilho(secao, "variant card");
    if (!cardBase) continue;

    const containerCards = criarContainerCards(secao, frameSubtitulo);
    const combinacoes = gerarCombinacoes(grupo, defsRaiz);

    for (const tema of temas) {
      for (const combo of combinacoes) {
        const rotulo = tema.sufixo ? `${combo.rotulo} - ${tema.sufixo}` : combo.rotulo;
        await criarCardVariacao(containerCards, cardBase, componentSet, rotulo, combo.propriedades, dna, tema.dark ? modeDark : null);
      }
    }

    cardBase.remove();
    ajustarLayoutSeCardNaoCabe(containerCards);
  }

  // --- Seções não-agrupadas (propriedades individuais) ---
  for (const nomeProp of naoAgrupadas) {
    const secaoBruta = conteudoBase.clone();
    secaoVariacoes.appendChild(secaoBruta);
    const secao = desvincularTodasInstancias(secaoBruta) as FrameNode;
    secao.name = `variant-section-${limparNomePropriedade(nomeProp)}`;

    const frameSubtitulo = buscarFilho(secao, "Subtitle Variants");
    const textoSubtitulo = frameSubtitulo ? buscarPrimeiroTexto(frameSubtitulo) : null;
    if (textoSubtitulo) {
      const nomeExibicaoIndiv = capitalizar(limparNomePropriedade(nomeProp));
      textoSubtitulo.characters = nomeExibicaoIndiv;
      marcarTextoOriginal(textoSubtitulo, `variants::${nomeExibicaoIndiv}::subtitle`);
    }

    const cardBase = buscarFilho(secao, "variant card");
    if (!cardBase) continue;

    const containerCards = criarContainerCards(secao, frameSubtitulo);

    const ehBoolTexto = ehVarianteBoolTexto(defsRaiz[nomeProp]);
    const ehBool = defsRaiz[nomeProp].type === "BOOLEAN" || ehBoolTexto;
    const ordemBool = truePrimeiro ? ["true", "false"] : ["false", "true"];
    const opcoes = ehBool
      ? ordemBool
      : defsRaiz[nomeProp].type === "VARIANT"
        ? (defsRaiz[nomeProp].variantOptions || []).filter(o => !['false', 'true'].includes(o.toLowerCase().trim()))
        : ordemBool;

    for (const tema of temas) {
      for (const opcao of opcoes) {
        const valor = defsRaiz[nomeProp].type === "BOOLEAN" ? (opcao === "true") : opcao;
        const rotulo = tema.sufixo ? `${opcao.toUpperCase()} - ${tema.sufixo}` : opcao.toUpperCase();
        await criarCardVariacao(
          containerCards, cardBase, componentSet,
          rotulo,
          { [nomeProp]: valor },
          dna,
          tema.dark ? modeDark : null
        );
      }
    }

    cardBase.remove();
    ajustarLayoutSeCardNaoCabe(containerCards);
  }

  conteudoBase.remove();
}

// === SEÇÃO DE ANATOMIA ===

/** Informações extraídas de um elemento filho do componente */
interface ElementoAnatomia {
  nome: string;
  tipo: string;
  ehOpcional: boolean;
  dependeDe: string | null;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
  camada: 'externo' | 'interno';
}

/**
 * Classifica elementos como externos (perto das bordas) ou internos (no miolo).
 * Critério: menor distância de qualquer borda do elemento à borda do componente.
 * Se todos caírem no mesmo grupo, força divisão pela mediana.
 */
function classificarElementos(
  elementos: ElementoAnatomia[],
  compW: number,
  compH: number
): void {
  if (elementos.length === 0) return;

  const limiar = 0.2 * Math.min(compW, compH);

  // Calcular menor distância à borda para cada elemento
  const distancias: number[] = elementos.map(elem => {
    const distEsq = elem.posX;
    const distDir = compW - (elem.posX + elem.largura);
    const distTopo = elem.posY;
    const distBase = compH - (elem.posY + elem.altura);
    return Math.min(distEsq, distDir, distTopo, distBase);
  });

  // Classificar pelo limiar
  elementos.forEach((elem, i) => {
    elem.camada = distancias[i] < limiar ? 'externo' : 'interno';
  });

  // Se todos ficaram no mesmo grupo, forçar divisão pela mediana
  const todosExternos = elementos.every(e => e.camada === 'externo');
  const todosInternos = elementos.every(e => e.camada === 'interno');

  if ((todosExternos || todosInternos) && elementos.length > 1) {
    const distOrdenadas = [...distancias].sort((a, b) => a - b);
    const mediana = distOrdenadas[Math.floor(distOrdenadas.length / 2)];
    elementos.forEach((elem, i) => {
      elem.camada = distancias[i] <= mediana ? 'externo' : 'interno';
    });
  }

}

/**
 * Extrai recursivamente elementos da anatomia do componente.
 * Regras de inclusão:
 * - INSTANCE → sempre inclui (sub-componente estrutural), STOP recursão nos filhos
 * - Nó com componentPropertyReferences → inclui, STOP recursão nos filhos
 * - Tipos geométricos puros (RECTANGLE, VECTOR, etc.) → ignora
 * - Separadores visuais (Line 1, Line 2) → pula, continua recursão
 * Usa absoluteBoundingBox da instância de preview para posições reais.
 */
async function extrairElementosAnatomia(
  instancia: InstanceNode,
  _componentSet: ComponenteDocumentavel
): Promise<ElementoAnatomia[]> {
  const elementos: ElementoAnatomia[] = [];
  const paiBbox = (instancia as any).absoluteBoundingBox;
  const tiposIgnorados = new Set(["RECTANGLE", "ELLIPSE", "LINE", "VECTOR", "STAR", "POLYGON"]);

  function adicionarElemento(no: SceneNode, ehOpcional: boolean, dependeDe: string | null): void {
    const bbox = (no as any).absoluteBoundingBox;
    elementos.push({
      nome: no.name, tipo: no.type, ehOpcional, dependeDe,
      posX: bbox && paiBbox ? bbox.x - paiBbox.x : no.x,
      posY: bbox && paiBbox ? bbox.y - paiBbox.y : no.y,
      largura: bbox ? bbox.width : no.width,
      altura: bbox ? bbox.height : no.height,
      camada: 'externo',
    });
  }

  async function percorrer(no: SceneNode, ehFilhoDirecto: boolean = false): Promise<void> {
    if (tiposIgnorados.has(no.type)) return;

    // Separadores visuais (Line 1, Line 2, etc.) — pular, continuar recursão
    if (/^Line\s*\d*$/i.test(no.name)) {
      if ("children" in no) {
        for (const filho of (no as any).children) {
          await percorrer(filho as SceneNode, false);
        }
      }
      return;
    }

    const refs = (no as any).componentPropertyReferences;
    const temPropriedade = refs && Object.keys(refs).length > 0;
    const ehInstancia = no.type === "INSTANCE";

    // INSTANCE → sempre incluir como sub-componente, STOP recursão
    if (ehInstancia) {
      let dependeDe: string | null = null;
      try {
        const compBase = await (no as InstanceNode).getMainComponentAsync();
        if (compBase) {
          dependeDe = compBase.parent?.type === "COMPONENT_SET"
            ? compBase.parent.name
            : compBase.name;
        }
      } catch {}
      adicionarElemento(no, !!(refs && refs.visible), dependeDe);
      return;
    }

    // Container (FRAME/GROUP) com refs → preferir filhos concretos
    if (temPropriedade && (no.type === "FRAME" || no.type === "GROUP") && "children" in no) {
      const filhos = (no as any).children as SceneNode[];
      const temFilhoRelevante = filhos.some((f: SceneNode) => {
        if (tiposIgnorados.has(f.type)) return false;
        if (f.type === "INSTANCE") return true;
        const fRefs = (f as any).componentPropertyReferences;
        return fRefs && Object.keys(fRefs).length > 0;
      });
      if (temFilhoRelevante) {
        for (const filho of filhos) {
          await percorrer(filho as SceneNode, false);
        }
        return;
      }
    }

    // Nó folha com refs (TEXT, etc.) → incluir, STOP
    if (temPropriedade) {
      adicionarElemento(no, !!(refs.visible), null);
      return;
    }

    // TEXT sem refs → incluir sempre (textos são elementos relevantes na anatomia)
    if (no.type === "TEXT") {
      adicionarElemento(no, false, null);
      return;
    }

    // Container sem refs → tentar recursão nos filhos
    if ("children" in no) {
      const tamanhoAntes = elementos.length;
      for (const filho of (no as any).children) {
        await percorrer(filho as SceneNode, false);
      }
      // Se é filho direto da instância e recursão não encontrou nada,
      // incluir o próprio container como elemento estrutural
      if (elementos.length === tamanhoAntes && ehFilhoDirecto) {
        adicionarElemento(no, false, null);
      }
    }
  }

  // Log: listar filhos diretos da instância com tipo, visibilidade e refs
  if ("children" in instancia) {
    console.log(`=== ANATOMIA: filhos diretos da instância (${(instancia as any).children.length}) ===`);
    for (const filho of (instancia as any).children) {
      const f = filho as SceneNode;
      const refs = (f as any).componentPropertyReferences;
      const temRefs = refs && Object.keys(refs).length > 0;
      const vis = "visible" in f ? (f as any).visible : "?";
      console.log(`  → "${f.name}" tipo=${f.type} visible=${vis} temRefs=${temRefs}`);
    }
  }

  if ("children" in instancia) {
    for (const filho of (instancia as any).children) {
      await percorrer(filho as SceneNode, true);
    }
  }

  console.log(`=== ANATOMIA: ${elementos.length} elementos após travessia inteligente ===`);

  // Fallback 1: se a travessia inteligente não encontrou nada,
  // incluir todos os filhos diretos visíveis (inclusive shapes)
  if (elementos.length === 0 && "children" in instancia) {
    console.log("=== ANATOMIA: fallback 1 — incluindo filhos diretos visíveis ===");
    for (const filho of (instancia as any).children) {
      const f = filho as SceneNode;
      if ("visible" in f && f.visible === false) continue;
      if (/^Line\s*\d*$/i.test(f.name)) continue;
      adicionarElemento(f, false, null);
    }
  }

  // Fallback 2: instância sem filhos mas com fills/strokes visíveis (ex: componente = só um stroke)
  if (elementos.length === 0) {
    const temFillVisivel = (instancia as any).fills && typeof (instancia as any).fills !== 'symbol'
      && ((instancia as any).fills as ReadonlyArray<Paint>).some((f: any) => f.visible !== false && f.opacity !== 0);
    const temStrokeVisivel = (instancia as any).strokes && typeof (instancia as any).strokes !== 'symbol'
      && ((instancia as any).strokes as ReadonlyArray<Paint>).some((s: any) => s.visible !== false);
    if (temFillVisivel || temStrokeVisivel) {
      console.log("=== ANATOMIA: fallback 2 — instância raiz como elemento (sem filhos) ===");
      adicionarElemento(instancia, false, null);
    }
  }

  console.log(`=== ANATOMIA: ${elementos.length} elementos extraídos (final) ===`);

  return elementos;
}

/**
 * Configura um badge [dsc-h] Item Number: seta o número e o toggle de opcional.
 * Se connectorOff = true, desativa o conector do badge.
 */
async function configurarBadge(
  badge: InstanceNode,
  numero: number,
  ehOpcional: boolean,
  connectorOff: boolean = false
): Promise<void> {
  try {
    const props = badge.componentProperties;
    // Setar número via propriedade TEXT ou texto direto
    let textoSetado = false;
    for (const [chave, prop] of Object.entries(props)) {
      if (prop.type === "TEXT") {
        badge.setProperties({ [chave]: String(numero) });
        textoSetado = true;
        break;
      }
    }
    if (!textoSetado) {
      const textoNo = buscarPrimeiroTexto(badge);
      if (textoNo) {
        await carregarFontes(badge);
        textoNo.characters = String(numero);
      }
    }
    // Toggle opcional/obrigatório
    for (const [chave, prop] of Object.entries(props)) {
      if (prop.type === "BOOLEAN") {
        badge.setProperties({ [chave]: ehOpcional });
        break;
      }
      if (limparNomePropriedade(chave).toLowerCase() === "optional" && prop.type === "VARIANT") {
        badge.setProperties({ [chave]: ehOpcional ? "true" : "false" });
        break;
      }
    }
    // Desativar conector se solicitado
    if (connectorOff) {
      const chaveConn = Object.keys(props).find(k =>
        limparNomePropriedade(k).toLowerCase() === "connector"
      );
      if (chaveConn) badge.setProperties({ [chaveConn]: "Off" });
    }
  } catch {}
}

/**
 * Posiciona badges ao redor de uma instância de preview para um subconjunto de elementos.
 * Retorna o badgeMainComp para uso na lista de specs.
 */
async function posicionarBadgesNaInstancia(
  framePreview: FrameNode,
  instancia: InstanceNode,
  elementosGrupo: ElementoAnatomia[],
  indices: number[],
  badgeRef: InstanceNode
): Promise<void> {
  let chaveConnector: string | undefined;
  try {
    chaveConnector = Object.keys(badgeRef.componentProperties).find(k =>
      limparNomePropriedade(k).toLowerCase() === "connector"
    );
  } catch {}

  const gap = 8;
  const padding = 4;

  const compLeft = instancia.x;
  const compRight = instancia.x + instancia.width;
  const compTop = instancia.y;
  const compBottom = instancia.y + instancia.height;
  const compW = instancia.width;
  const compH = instancia.height;

  // Pré-calcular dimensões do badge em cada direção
  const dimsPorDir: Record<string, { w: number; h: number }> = {};
  for (const dir of ["left", "right", "top", "bottom"]) {
    if (chaveConnector) {
      try { badgeRef.setProperties({ [chaveConnector]: dir }); } catch {}
    }
    dimsPorDir[dir] = { w: badgeRef.width, h: badgeRef.height };
  }

  const ocupados: { x: number; y: number; w: number; h: number }[] = [];
  function sobrepoe(x: number, y: number, w: number, h: number): boolean {
    for (const o of ocupados) {
      if (x < o.x + o.w + padding && x + w + padding > o.x &&
          y < o.y + o.h + padding && y + h + padding > o.y) return true;
    }
    return false;
  }

  function posNaBorda(edge: string, elemCX: number, elemCY: number, ringIdx: number) {
    const dims = dimsPorDir[edge];
    const dimPerp = (edge === "left" || edge === "right") ? dims.w : dims.h;
    const ringGap = gap + ringIdx * (dimPerp + padding);

    let bx: number, by: number;
    if (edge === "left") {
      bx = compLeft - dims.w - ringGap;
      by = elemCY - dims.h / 2;
    } else if (edge === "right") {
      bx = compRight + ringGap;
      by = elemCY - dims.h / 2;
    } else if (edge === "top") {
      bx = elemCX - dims.w / 2;
      by = compTop - dims.h - ringGap;
    } else {
      bx = elemCX - dims.w / 2;
      by = compBottom + ringGap;
    }

    bx = Math.max(4, Math.min(bx, framePreview.width - dims.w - 4));
    by = Math.max(4, Math.min(by, framePreview.height - dims.h - 4));
    return { bx, by, bw: dims.w, bh: dims.h };
  }

  function ordemBordasParaElemento(elem: ElementoAnatomia): string[] {
    const relX = (elem.posX + elem.largura / 2) / compW;
    const relY = (elem.posY + elem.altura / 2) / compH;

    // Extremos horizontais e verticais
    if (relX < 0.15) return ["left", "top", "bottom", "right"];
    if (relX > 0.85) return ["right", "top", "bottom", "left"];
    if (relY < 0.25) return ["top", "left", "right", "bottom"];
    if (relY > 0.75) return ["bottom", "left", "right", "top"];

    // Zona central — subdivide horizontalmente
    // Centro-esquerda (0.15–0.40): prefere a borda esquerda
    if (relX < 0.40) return ["left", "top", "bottom", "right"];
    // Centro-direita (0.60–0.85): prefere a borda direita
    if (relX > 0.60) return ["right", "top", "bottom", "left"];
    // Centro puro (0.40–0.60): prefere topo/base para não colidir com elementos laterais
    return ["top", "bottom", "left", "right"];
  }

  for (let g = 0; g < elementosGrupo.length; g++) {
    const elem = elementosGrupo[g];
    const numBadge = indices[g]; // número global do badge
    const badge = badgeRef.clone() as InstanceNode;
    framePreview.appendChild(badge);
    await configurarBadge(badge, numBadge, elem.ehOpcional);

    const elemCX = instancia.x + elem.posX + elem.largura / 2;
    const elemCY = instancia.y + elem.posY + elem.altura / 2;

    let colocado = false;
    const ordemBordas = ordemBordasParaElemento(elem);

    for (let ring = 0; ring <= 1 && !colocado; ring++) {
      for (const edge of ordemBordas) {
        const pos = posNaBorda(edge, elemCX, elemCY, ring);

        if (!sobrepoe(pos.bx, pos.by, pos.bw, pos.bh)) {
          if (chaveConnector) {
            try { badge.setProperties({ [chaveConnector]: edge }); } catch {}
          }
          badge.x = pos.bx;
          badge.y = pos.by;
          ocupados.push({ x: pos.bx, y: pos.by, w: pos.bw, h: pos.bh });

          // Redimensionar conector para alcançar a borda do elemento
          const circulo = 24;
          const eL = instancia.x + elem.posX;
          const eT = instancia.y + elem.posY;
          const eR = eL + elem.largura;
          const eB = eT + elem.altura;

          try {
            if (edge === "left") {
              const dist = eL - pos.bx;
              if (dist > circulo) badge.resize(dist, badge.height);
            } else if (edge === "right") {
              const dist = (pos.bx + pos.bw) - eR;
              if (dist > circulo) {
                badge.resize(dist, badge.height);
                badge.x = eR;
              }
            } else if (edge === "top") {
              const dist = eT - pos.by;
              if (dist > circulo) badge.resize(badge.width, dist);
            } else if (edge === "bottom") {
              const dist = (pos.by + pos.bh) - eB;
              if (dist > circulo) {
                badge.resize(badge.width, dist);
                badge.y = eB;
              }
            }
          } catch (e) {
            // resize falhou silenciosamente
          }

          colocado = true;
          break;
        }
      }
    }

    if (!colocado) {
      badge.x = 4;
      badge.y = 4 + g * 30;
    }
  }
}

/**
 * Cria uma instância de preview dentro de um frame, com booleans ativadas e centralizada.
 * Retorna a instância criada.
 */
async function criarInstanciaPreview(
  componentSet: ComponenteDocumentavel,
  frameAlvo: FrameNode,
  margemBadge: number
): Promise<InstanceNode> {
  const instancia = obterVariantePadrao(componentSet).createInstance();
  const defs = componentSet.componentPropertyDefinitions;
  const propsVisiveis: Record<string, any> = {};
  for (const [chave, def] of Object.entries(defs)) {
    if (def.type === "BOOLEAN") propsVisiveis[chave] = true;
    else if (ehVarianteBoolTexto(def)) propsVisiveis[chave] = "true";
  }
  try { instancia.setProperties(propsVisiveis); } catch {}

  // Garantir espaço vertical para badges ao redor (não expandir horizontalmente)
  const alturaNecessaria = instancia.height + margemBadge * 2;
  if (frameAlvo.height < alturaNecessaria) {
    frameAlvo.resize(frameAlvo.width, alturaNecessaria);
  }

  // Verificar contraste e aplicar fundo escuro se necessário
  try {
    if (precisaFundoEscuro(instancia)) {
      await aplicarFundoEscuroCard(frameAlvo as FrameNode);
    }
  } catch {}

  frameAlvo.clipsContent = false;
  frameAlvo.appendChild(instancia);
  instancia.x = (frameAlvo.width - instancia.width) / 2;
  instancia.y = (frameAlvo.height - instancia.height) / 2;

  return instancia;
}

async function gerarSecaoAnatomia(
  container: FrameNode,
  componentSet: ComponenteDocumentavel
): Promise<void> {
  const alvoAnatomia = buscarFilho(container, "anatomy");
  if (!alvoAnatomia) return;

  // Badges [dsc-h] são protegidos pelo desvincularTodasInstancias — permanecem instâncias
  const secaoAnatomia = desvincularTodasInstancias(alvoAnatomia) as FrameNode;

  // --- Preview com badges ---
  const frameImagem = buscarFilho(secaoAnatomia, "image") as FrameNode;
  let elementos: ElementoAnatomia[] = [];
  let badgeMainComp: ComponentNode | null = null;

  if (frameImagem) {
    // Coletar badges template
    const badgesTemplate: InstanceNode[] = [];
    if ("children" in frameImagem) {
      for (const filho of (frameImagem as any).children) {
        if ((filho as SceneNode).name.toLowerCase().includes("[dsc-h] item number") && filho.type === "INSTANCE") {
          badgesTemplate.push(filho as InstanceNode);
        }
      }
    }
    const badgeRef = badgesTemplate[0] || null;
    for (let b = 1; b < badgesTemplate.length; b++) {
      badgesTemplate[b].remove();
    }

    // Criar primeira instância para extrair dados dos elementos
    const margemBadge = 80;
    const instanciaTemp = await criarInstanciaPreview(componentSet, frameImagem, margemBadge);

    // Extrair e classificar elementos
    elementos = await extrairElementosAnatomia(instanciaTemp, componentSet);
    if (elementos.length === 0) {
      instanciaTemp.remove();
      // Remover a seção inteira para não deixar anatomia vazia/quebrada
      secaoAnatomia.remove();
      console.warn("Anatomia: nenhum elemento encontrado — seção removida.");
      return;
    }
    classificarElementos(elementos, instanciaTemp.width, instanciaTemp.height);

    // Separar em grupos: externos primeiro, internos depois (numeração sequencial)
    const externos = elementos.filter(e => e.camada === 'externo');
    const internos = elementos.filter(e => e.camada === 'interno');

    // Reordenar: externos primeiro (1..N), internos depois (N+1..M)
    const elementosOrdenados = [...externos, ...internos];
    const indicesExternos = externos.map((_, i) => i + 1);
    const indicesInternos = internos.map((_, i) => externos.length + i + 1);

    // Remover instância temporária — vamos criar as definitivas
    instanciaTemp.remove();

    const temDoisGrupos = externos.length > 0 && internos.length > 0 && (externos.length + internos.length > 4);

    if (badgeRef) {
      try { badgeMainComp = await badgeRef.getMainComponentAsync(); } catch {}

      // Verificar se o componente é mais largo que o frame disponível
      const instanciaRef = obterVariantePadrao(componentSet).createInstance();
      const defs = componentSet.componentPropertyDefinitions;
      const propsVis: Record<string, any> = {};
      for (const [ch, df] of Object.entries(defs)) {
        if (df.type === "BOOLEAN") propsVis[ch] = true;
        else if (ehVarianteBoolTexto(df)) propsVis[ch] = "true";
      }
      try { instanciaRef.setProperties(propsVis); } catch {}
      const espacoEntreFrames = 48;
      const metadeLargura = temDoisGrupos ? (frameImagem.width - espacoEntreFrames) / 2 : frameImagem.width;
      const larguraAlvo = temDoisGrupos ? metadeLargura : frameImagem.width;
      const naoCabeNoSubFrame = instanciaRef.width + margemBadge * 2 > larguraAlvo;
      instanciaRef.remove();

      if (temDoisGrupos) {

        function criarFramePreview(nome: string, largura: number, altura: number): FrameNode {
          const frame = figma.createFrame();
          frame.name = nome;
          frame.fills = [];
          frame.clipsContent = false;
          frame.resize(largura, altura);
          frameImagem.appendChild(frame);
          return frame;
        }

        if (naoCabeNoSubFrame) {
          // === VERTICAL: componente largo, empilhar previews ===
          const larguraPreview = frameImagem.width;
          const alturaPreview = frameImagem.height;

          const frame1 = criarFramePreview("preview-externos", larguraPreview, alturaPreview);
          frame1.x = 0;
          frame1.y = 0;
          const instancia1 = await criarInstanciaPreview(componentSet, frame1, margemBadge);
          await posicionarBadgesNaInstancia(frame1, instancia1, externos, indicesExternos, badgeRef);

          const frame2 = criarFramePreview("preview-internos", larguraPreview, alturaPreview);
          frame2.x = 0;
          frame2.y = frame1.height + espacoEntreFrames;
          const instancia2 = await criarInstanciaPreview(componentSet, frame2, margemBadge);
          await posicionarBadgesNaInstancia(frame2, instancia2, internos, indicesInternos, badgeRef);

          const alturaTotal = frame1.height + espacoEntreFrames + frame2.height;
          frameImagem.resize(frameImagem.width, alturaTotal);
        } else {
          // === HORIZONTAL: componente cabe, lado a lado ===
          const frame1 = criarFramePreview("preview-externos", metadeLargura, frameImagem.height);
          frame1.x = 0;
          frame1.y = 0;
          const instancia1 = await criarInstanciaPreview(componentSet, frame1, margemBadge);
          await posicionarBadgesNaInstancia(frame1, instancia1, externos, indicesExternos, badgeRef);

          const frame2 = criarFramePreview("preview-internos", metadeLargura, frameImagem.height);
          frame2.x = metadeLargura + espacoEntreFrames;
          frame2.y = 0;
          const instancia2 = await criarInstanciaPreview(componentSet, frame2, margemBadge);
          await posicionarBadgesNaInstancia(frame2, instancia2, internos, indicesInternos, badgeRef);

          // Expandir altura se necessário, manter largura original
          const alturaMax = Math.max(frame1.height, frame2.height);
          if (frameImagem.height < alturaMax) {
            frameImagem.resize(frameImagem.width, alturaMax);
          }
        }

      } else {
        // === 1 INSTÂNCIA: todos no mesmo grupo ===
        // Sub-frame sem auto-layout — isola do layout do frameImagem pai
        const frameUnico = figma.createFrame();
        frameUnico.name = "preview-unico";
        frameUnico.fills = [];
        frameUnico.clipsContent = false;
        frameUnico.layoutMode = "NONE";
        frameUnico.resize(frameImagem.width, frameImagem.height);
        frameUnico.x = 0;
        frameUnico.y = 0;
        frameImagem.appendChild(frameUnico);

        const instanciaUnica = await criarInstanciaPreview(componentSet, frameUnico, margemBadge);
        const todosIndices = elementosOrdenados.map((_, i) => i + 1);
        await posicionarBadgesNaInstancia(frameUnico, instanciaUnica, elementosOrdenados, todosIndices, badgeRef);
      }

      badgeRef.remove();
    }

    // Substituir elementos pela versão ordenada (externos primeiro, internos depois)
    elementos = elementosOrdenados;
  }

  // --- Lista de elementos (specs) — externos 1..N, internos N+1..M ---
  const frameSpecs = buscarFilho(secaoAnatomia, "specs") as FrameNode;
  if (frameSpecs) {
    const elementoTemplate = buscarFilho(frameSpecs, "element");
    if (elementoTemplate) {
      for (let i = 0; i < elementos.length; i++) {
        const elem = elementos[i];
        const elementoItemRaw = elementoTemplate.clone();
        frameSpecs.appendChild(elementoItemRaw);
        const elementoItem = desvincularTodasInstancias(elementoItemRaw);

        const nomeElemento = buscarFilho(elementoItem, "Element name");
        if (nomeElemento && "children" in nomeElemento) {
          for (const filho of [...(nomeElemento as any).children]) {
            const no = filho as SceneNode;
            const nomeLower = no.name.toLowerCase();

            if ((nomeLower.includes("[dsc-h]") || nomeLower === "number") && no.type === "INSTANCE") {
              await configurarBadge(no as InstanceNode, i + 1, elem.ehOpcional, true);
            }
            else if ((nomeLower.includes("[dsc-h]") || nomeLower === "number") && no.type !== "INSTANCE" && badgeMainComp) {
              const badgeNovo = badgeMainComp.createInstance();
              const idx = (nomeElemento as FrameNode).children.indexOf(no);
              (nomeElemento as FrameNode).insertChild(idx >= 0 ? idx : 0, badgeNovo);
              no.remove();
              await configurarBadge(badgeNovo, i + 1, elem.ehOpcional, true);
            }
            else if (no.type === "TEXT" || buscarPrimeiroTexto(no)) {
              const textoNome = no.type === "TEXT"
                ? no as TextNode
                : buscarPrimeiroTexto(no);
              if (textoNome) {
                await carregarFontes(no);
                const nomeElementoLimpo = limparNomeElementoAnatomia(elem.nome);
                textoNome.characters = nomeElementoLimpo;
                marcarTextoOriginal(textoNome, `anatomy::${nomeElementoLimpo}::nome`);
              }
            }
          }
        }

        const descricao = buscarFilho(elementoItem, "Description");
        if (descricao) {
          const textoDesc = buscarPrimeiroTexto(descricao);
          if (textoDesc) {
            await carregarFontes(descricao);
            const nomeElementoLimpo = limparNomeElementoAnatomia(elem.nome);
            if (elem.dependeDe) {
              textoDesc.characters = `Nested Component: ${elem.dependeDe}`;
            } else {
              textoDesc.characters = " ";
              if ("visible" in descricao) (descricao as any).visible = false;
            }
            marcarTextoOriginal(textoDesc, `anatomy::${nomeElementoLimpo}::desc`);
          }
        }
      }

      elementoTemplate.remove();
    }
  }
}

/** Dados pré-calculados para popular uma matriz de estados */
interface DadosMatriz {
  chaveEstado: string;
  opcoesEstado: string[];
  chaveSize: string | undefined;
  opcoesSize: string[];
  combinacoesY: Record<string, string>[];
  larguraCelula: number;
}

/**
 * Popula uma "state matrix" com instâncias do componente.
 * Usada tanto para a matriz light quanto para a dark mode.
 * @param modeDark - se fornecido, aplica dark mode em cada instância e fundo escuro nos cards
 */
async function popularMatrizEstados(
  containerMatriz: FrameNode,
  componentSet: ComponenteDocumentavel,
  dna: MapaDNA,
  dados: DadosMatriz,
  modeDark: { collectionId: string; modeId: string; colecao: VariableCollection } | null = null
): Promise<void> {
  const { chaveEstado, opcoesEstado, chaveSize, opcoesSize, combinacoesY, larguraCelula } = dados;

  const linhaCabecalho = buscarFilho(containerMatriz, "state names") as FrameNode;
  const linhaDadosBase = buscarFilho(containerMatriz, "variant + card");
  if (!linhaCabecalho || !linhaDadosBase) return;

  containerMatriz.layoutSizingHorizontal = "HUG";
  linhaCabecalho.layoutSizingHorizontal = "HUG";

  // --- Header: criar label para cada estado ---
  const labelEstado = buscarFilho(linhaCabecalho, "STATE") as TextNode;
  if (labelEstado) {
    for (const estado of opcoesEstado) {
      const label = labelEstado.clone();
      linhaCabecalho.appendChild(label);
      label.characters = estado.toUpperCase();
      marcarTextoOriginal(label, `states::${estado}::label`);
      if (label.type === "TEXT") {
        (label as TextNode).textAutoResize = "HEIGHT";
      }
      label.layoutSizingHorizontal = "FIXED";
      label.resize(larguraCelula, label.height);
    }
    labelEstado.remove();
  }

  // --- Linhas de dados: uma por combinação Y ---
  for (const comboY of combinacoesY) {
    const linhaBruta = linhaDadosBase.clone();
    containerMatriz.appendChild(linhaBruta);
    const linha = desvincularTodasInstancias(linhaBruta) as FrameNode;
    linha.layoutSizingHorizontal = "HUG";

    const labelLinha = buscarFilho(linha, "NAME") as TextNode;
    if (labelLinha) {
      const textoLabel = Object.values(comboY).join(" / ");
      const textoFinal = textoLabel.toUpperCase() || "DEFAULT";
      labelLinha.characters = textoFinal;
      marcarTextoOriginal(labelLinha, `states::${textoFinal}::rowlabel`);
    }

    const cardBase = buscarFilho(linha, "variant card");
    if (!cardBase) continue;

    for (const valorEstado of opcoesEstado) {
      const cardBruto = cardBase.clone();
      linha.appendChild(cardBruto);
      const card = desvincularTodasInstancias(cardBruto) as FrameNode;
      card.layoutSizingHorizontal = "FIXED";
      card.resize(larguraCelula, card.height);

      const swapSlot = buscarFilho(card, "[base] Swap Slot");
      if (swapSlot) swapSlot.remove();

      // Dark mode: setar mode do handoff no card
      if (modeDark) {
        await aplicarDarkModeHandoff(card);
      }

      const tamanhosRender = opcoesSize.length > 0 ? opcoesSize : [null];
      let fundoEscuroAplicado = !!modeDark;

      for (const tamanho of tamanhosRender) {
        const props: Record<string, any> = {
          [chaveEstado]: valorEstado,
          ...comboY
        };
        if (chaveSize && tamanho) props[chaveSize] = tamanho;
        aplicarCascataDNA(props, dna);

        const instancia = obterVariantePadrao(componentSet).createInstance();
        try { instancia.setProperties(props); } catch {}

        // Dark mode: setar na instância individualmente (não no wrapper da seção)
        if (modeDark) {
          try {
            instancia.setExplicitVariableModeForCollection(modeDark.colecao, modeDark.modeId);
          } catch {
            try {
              instancia.setExplicitVariableModeForCollection(modeDark.collectionId, modeDark.modeId);
            } catch {}
          }
        }

        // Contraste WCAG — light mode: componente claro some no fundo claro
        if (!modeDark) {
          try {
            if (!fundoEscuroAplicado && precisaFundoEscuro(instancia)) {
              const ehDisabled = valorEstado.toLowerCase().includes('disable');
              const ehLight = await estamosNoLightMode(instancia);
              if (!(ehDisabled && ehLight)) {
                await aplicarFundoEscuroCard(card);
                fundoEscuroAplicado = true;
              }
            }
          } catch {}
        }

        card.appendChild(instancia);
      }
    }

    cardBase.remove();
  }

  linhaDadosBase.remove();
}

/**
 * Gera a matriz de estados do componente.
 * Eixo X = estados (default, hover, focused, etc.)
 * Eixo Y = combinações de variantes (variant, type, theme, mode, color)
 * Size é separado e empilhado dentro de cada card para evitar repetição excessiva.
 * Também gera a subseção dark mode se existir no template.
 */
async function gerarMatrizEstados(
  container: FrameNode,
  componentSet: ComponenteDocumentavel,
  dna: MapaDNA
): Promise<void> {
  const defsRaiz = componentSet.componentPropertyDefinitions;

  // Encontrar a propriedade de estado (deve ser VARIANT e conter "state" no nome)
  const chaveEstado = Object.keys(defsRaiz).find(p =>
    limparNomePropriedade(p).toLowerCase().includes("state") && defsRaiz[p].type === "VARIANT"
  );

  const alvoEstados = buscarFilho(container, "states");
  if (!alvoEstados) return;

  // Se não há propriedade de estado ou é componente avulso, remover a seção inteira
  if (!chaveEstado || !ehComponentSet(componentSet)) {
    alvoEstados.remove();
    return;
  }

  const secaoEstados = desvincularTodasInstancias(alvoEstados) as FrameNode;
  const opcoesEstado = defsRaiz[chaveEstado].variantOptions || [];

  const containerMatriz = buscarFilho(secaoEstados, "state matrix") as FrameNode;
  if (!containerMatriz || opcoesEstado.length === 0) return;

  // --- Preparar eixo Y (combinações de variantes, sem size) ---
  const propsEixoY = Object.keys(defsRaiz).filter(k => {
    const nome = limparNomePropriedade(k).toLowerCase();
    return CANDIDATOS_EIXO_Y.some(c => nome === c)
      && !PROPRIEDADES_IGNORAR_MATRIZ.some(ig => nome === ig)
      && defsRaiz[k].type === "VARIANT"
      && k !== chaveEstado;
  });

  const chaveSize = propsEixoY.find(k => limparNomePropriedade(k).toLowerCase() === 'size');
  const opcoesSize: string[] = chaveSize ? (defsRaiz[chaveSize].variantOptions || []) : [];

  type Combinacao = Record<string, string>;
  const dadosEixoY: Array<{ chave: string; opcoes: string[] }> = [];
  for (const chaveY of propsEixoY) {
    if (chaveY === chaveSize) continue;
    const def = defsRaiz[chaveY];
    if (def.variantOptions && def.variantOptions.length > 0) {
      dadosEixoY.push({ chave: chaveY, opcoes: def.variantOptions });
    }
  }

  function produtoCartesiano(eixos: Array<{ chave: string; opcoes: string[] }>): Combinacao[] {
    if (eixos.length === 0) return [{}];
    const [primeiro, ...restante] = eixos;
    const combosRestante = produtoCartesiano(restante);
    const resultado: Combinacao[] = [];
    for (const opcao of primeiro.opcoes) {
      for (const combo of combosRestante) {
        resultado.push({ [primeiro.chave]: opcao, ...combo });
      }
    }
    return resultado;
  }

  const combinacoesY = produtoCartesiano(dadosEixoY);
  if (combinacoesY.length === 0) combinacoesY.push({});

  // Calcular largura da célula usando o maior tamanho do componente
  let larguraMaxima = 0;
  const tamanhosAmostra = opcoesSize.length > 0 ? opcoesSize : [null];
  for (const tamanho of tamanhosAmostra) {
    const amostra = obterVariantePadrao(componentSet).createInstance();
    if (chaveSize && tamanho) try { amostra.setProperties({ [chaveSize]: tamanho }); } catch {}
    larguraMaxima = Math.max(larguraMaxima, amostra.width);
    amostra.remove();
  }
  const larguraCelula = Math.max(CARD_LARGURA_MINIMA, larguraMaxima + CARD_PADDING);

  const dados: DadosMatriz = {
    chaveEstado, opcoesEstado, chaveSize, opcoesSize, combinacoesY, larguraCelula
  };

  // --- Matriz light (principal) ---
  await popularMatrizEstados(containerMatriz, componentSet, dna, dados);

  // --- Matriz dark mode (subseção) ---
  const subsecaoDark = buscarFilho(secaoEstados, "dark mode") as FrameNode | null;
  if (subsecaoDark) {
    const modeDark = await buscarModeDark(componentSet);
    if (modeDark) {
      const darkDesvinculado = desvincularTodasInstancias(subsecaoDark) as FrameNode;
      // Dark mode é setado em cada instância individualmente (dentro de popularMatrizEstados)
      // para não afetar textos estruturais da seção (títulos, labels de linha/coluna)
      const matrizDark = buscarFilho(darkDesvinculado, "state matrix") as FrameNode | null;
      if (matrizDark) {
        await popularMatrizEstados(matrizDark, componentSet, dna, dados, modeDark);
      }
    } else {
      subsecaoDark.remove();
    }
  }
}

// === ATUALIZAÇÃO SELETIVA POR SEÇÃO ===

/**
 * Obtém uma seção fresca do template, pronta para ser inserida no container.
 * Cria uma instância temporária do template, desvincula e extrai a seção pelo nome.
 */
async function obterSecaoDoTemplate(
  templateCompId: string,
  nomeSecao: string
): Promise<SceneNode | null> {
  const instanciaTemplate = await resolverTemplate(templateCompId);
  if (!instanciaTemplate) return null;

  const container = instanciaTemplate.detachInstance();
  await carregarFontes(container);

  const secao = buscarFilho(container, nomeSecao);
  if (!secao) {
    container.remove();
    return null;
  }

  // Mover seção para fora do container temporário antes de descartá-lo
  figma.currentPage.appendChild(secao);
  container.remove();

  return secao;
}

/**
 * Calcula o índice de inserção para uma seção nova no container,
 * respeitando a ordem definida em ordemSecoes (derivada do template).
 */
function calcularIndicePosicao(container: FrameNode, nomeSecao: string, ordemSecoes: string[] = ORDEM_SECOES): number {
  const ordemAlvo = ordemSecoes.indexOf(nomeSecao);

  // Procurar a última seção que precede esta na ordem
  for (let i = container.children.length - 1; i >= 0; i--) {
    const filho = container.children[i];
    const dominio = filho.getPluginData("secaoDominio");
    if (dominio) {
      const nomeFilho = filho.getPluginData("secaoNome");
      const ordemFilho = ordemSecoes.indexOf(nomeFilho);
      if (ordemFilho >= 0 && ordemFilho < ordemAlvo) {
        return i + 1;
      }
    }
  }

  // Se não encontrou nenhuma seção anterior, inserir após filhos que não são seções
  // (título, header, etc.) — buscar o primeiro filho com pluginData ou ir ao final
  for (let i = 0; i < container.children.length; i++) {
    const filho = container.children[i];
    if (filho.getPluginData("secaoDominio")) {
      return i;
    }
  }

  return container.children.length;
}

/**
 * Atualiza uma seção específica do handoff, preservando dados manuais.
 *
 * Fluxo:
 * 1. Busca seção existente no container (por pluginData)
 * 2. Extrai dados manuais se existir
 * 3. Remove seção existente
 * 4. Obtém seção fresca do template
 * 5. Insere na posição correta
 * 6. Chama a função geradora correspondente
 * 7. Reinjeta dados manuais preservados
 */
async function atualizarSecao(
  container: FrameNode,
  nomeSecao: string,
  templateCompId: string,
  componentSet: ComponenteDocumentavel,
  dna: MapaDNA,
  compLinhaTabela: ComponentNode | null,
  ordemSecoes: string[] = ORDEM_SECOES,
  manterEdicoes: boolean = true,
  truePrimeiro: boolean = false
): Promise<void> {
  // 1. Buscar seção existente — busca recursiva (seções podem estar aninhadas em wrappers)
  let secaoExistente: SceneNode | null = null;
  let paiDaSecao: FrameNode = container;
  let indicePosicao = -1;

  // Busca por pluginData (recursiva)
  function buscarPorPluginData(raiz: SceneNode): SceneNode | null {
    if (raiz.getPluginData("secaoNome") === nomeSecao) return raiz;
    if ("children" in raiz) {
      for (const filho of (raiz as any).children) {
        const encontrado = buscarPorPluginData(filho as SceneNode);
        if (encontrado) return encontrado;
      }
    }
    return null;
  }

  secaoExistente = buscarPorPluginData(container);

  // Fallback: buscar por nome (recursivo, para handoffs antigos sem pluginData)
  if (!secaoExistente) {
    secaoExistente = buscarFilho(container, nomeSecao);
  }

  // Determinar pai e índice da seção existente
  if (secaoExistente && secaoExistente.parent && "children" in secaoExistente.parent) {
    paiDaSecao = secaoExistente.parent as FrameNode;
    for (let i = 0; i < paiDaSecao.children.length; i++) {
      if (paiDaSecao.children[i] === secaoExistente) {
        indicePosicao = i;
        break;
      }
    }
  }

  // 2. Extrair dados manuais (sistema unificado via pluginData)
  let edicoes = new Map<string, string>();
  let textosGenericos = new Map<string, string>();

  if (secaoExistente && manterEdicoes) {
    if (SECOES_GERAVEIS.includes(nomeSecao)) {
      edicoes = extrairEdicoesManuais(secaoExistente, nomeSecao);
      // Merge com edições persistidas no handoff (backup)
      const edicoesSalvas = lerEdicoesPersistidas(container, nomeSecao);
      for (const [k, v] of edicoesSalvas) {
        if (!edicoes.has(k)) edicoes.set(k, v);
      }
    } else {
      // Seção sem gerador — preservar todos os textos editados
      textosGenericos = extrairTextosGenericos(secaoExistente);
    }
  }

  // 3. Calcular posição de inserção (se seção não existia)
  if (indicePosicao < 0) {
    indicePosicao = calcularIndicePosicao(paiDaSecao, nomeSecao, ordemSecoes);
  }

  // 5. Obter seção fresca do template (opcional — se não disponível, reutiliza existente)
  const secaoNova = await obterSecaoDoTemplate(templateCompId, nomeSecao);

  if (secaoNova) {
    // 4a. Remover seção existente e inserir versão fresca do template
    if (secaoExistente) secaoExistente.remove();
    const indiceReal = Math.min(indicePosicao, paiDaSecao.children.length);
    paiDaSecao.insertChild(indiceReal, secaoNova);
    secaoNova.setPluginData("secaoNome", nomeSecao);
    secaoNova.setPluginData("secaoDominio", DOMINIO_SECOES[nomeSecao] || "design");
  } else if (secaoExistente) {
    // 4b. Sem template — reutilizar seção existente (template não disponível)
    console.log(`Seção "${nomeSecao}" sem template fresco — reutilizando estrutura existente.`);
  } else {
    // 4c. Sem template e sem seção existente — não há como gerar
    console.log(`Seção "${nomeSecao}" não encontrada no template e não existe no handoff — pulando.`);
    return;
  }

  // 7. Chamar função geradora correspondente
  const secaoAtiva = secaoNova || secaoExistente!;
  await carregarFontes(secaoAtiva);

  if (nomeSecao === "table") {
    await gerarTabelaPropriedades(container, componentSet, compLinhaTabela);
    const tabelaGerada = buscarFilho(container, "table");
    if (tabelaGerada) {
      await reinjetarEdicoesManuais(tabelaGerada, edicoes);
      persistirEdicoes(container, nomeSecao, edicoes);
    }
  } else if (nomeSecao === "anatomy") {
    await gerarSecaoAnatomia(container, componentSet);
    const anatomiaGerada = buscarFilho(container, "anatomy");
    if (anatomiaGerada) {
      await reinjetarEdicoesManuais(anatomiaGerada, edicoes);
      persistirEdicoes(container, nomeSecao, edicoes);
    }
  } else if (nomeSecao === "variants") {
    await gerarSecaoVariacoes(container, componentSet, dna, truePrimeiro);
    const variantsGerada = buscarFilho(container, "variants");
    if (variantsGerada) {
      await reinjetarEdicoesManuais(variantsGerada, edicoes);
      persistirEdicoes(container, nomeSecao, edicoes);
    }
  } else if (nomeSecao === "states") {
    await gerarMatrizEstados(container, componentSet, dna);
    const statesGerada = buscarFilho(container, "states");
    if (statesGerada) {
      await reinjetarEdicoesManuais(statesGerada, edicoes);
      persistirEdicoes(container, nomeSecao, edicoes);
    }
  } else {
    // Seção sem gerador (Comportamento, Posicionamento, etc.)
    // Reinjetar textos manuais preservados na seção fresca do template
    await reinjetarTextosGenericos(secaoAtiva, textosGenericos);
  }
}

/**
 * Busca um handoff existente pelo nome ou por pluginData do componentSetId.
 */
function buscarHandoffExistente(componentSet: ComponenteDocumentavel): FrameNode | null {
  const nomeBase = componentSet.name.replace(/^\[.*?\]/, "").trim();
  const nomeFormatado = capitalizar(nomeBase);
  const nomeHandoff = `[dsc] Handoff: ${nomeFormatado}`;

  // Busca por nome (percorre Sections)
  const porNome = buscarNaPagina(n =>
    n.type === "FRAME" && n.name === nomeHandoff
  ) as FrameNode | null;

  if (porNome) return porNome;

  // Fallback: busca por pluginData (para handoffs renomeados pelo usuário)
  return buscarNaPagina(n =>
    n.type === "FRAME" && n.getPluginData("componentSetId") === componentSet.id
  ) as FrameNode | null;
}

// === DESCRIÇÃO AUTOMÁTICA DO COMPONENTE ===

/**
 * Preenche a descrição do ComponentSet/Component caso esteja vazia.
 * Padrão: "❖ [nome original do componente]\n<N/A>"
 */
function preencherDescricaoComponente(componentSet: ComponenteDocumentavel): void {
  if (componentSet.description && componentSet.description.trim().length > 0) return;
  const descricao = `❖ ${componentSet.name}\n<N/A>`;
  componentSet.description = descricao;
}

// === FORMATAR COMPONENT SET ===

/**
 * Formata o ComponentSet em uma grade documentada (Component Set Format).
 * Reorganiza os variants por estado (colunas) × demais propriedades (linhas),
 * cria um frame com título, labels laterais e cabeçalho de colunas.
 */
async function formatarComponenteSet(componentSet: ComponenteDocumentavel): Promise<void> {
  const isComponentSet = componentSet.type === 'COMPONENT_SET';
  const target = componentSet as ComponentSetNode | ComponentNode;

  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Roboto", style: "Regular" });
  await figma.loadFontAsync({ family: "Roboto", style: "Bold" });

  let titleStyle: TextStyle | null = null;
  let labelStyle: TextStyle | null = null;
  try {
    titleStyle = await figma.importStyleByKeyAsync("ff9f494575cade37fb29a387a905defc05f0be60") as TextStyle;
    if (titleStyle) await figma.loadFontAsync(titleStyle.fontName);
  } catch { /* fallback para Roboto */ }
  try {
    labelStyle = await figma.importStyleByKeyAsync("429a81aa117d02ac73f0c796a5f2643c102c8cbe") as TextStyle;
    if (labelStyle) await figma.loadFontAsync(labelStyle.fontName);
  } catch { /* fallback para Roboto */ }

  // Estilos DSC para o header
  let displayLargeStyle: TextStyle | null = null;
  let textBigStyle: TextStyle | null = null;
  try {
    displayLargeStyle = await figma.importStyleByKeyAsync("f52a06bbeeae43b971609e2b2459ccd7bf49bd71") as TextStyle;
    if (displayLargeStyle) await figma.loadFontAsync(displayLargeStyle.fontName);
  } catch { /* fallback Roboto Bold 60px */ }
  try {
    textBigStyle = await figma.importStyleByKeyAsync("8fa3750f88983da3183bbc843fbbb7bf3a1801b7") as TextStyle;
    if (textBigStyle) await figma.loadFontAsync(textBigStyle.fontName);
  } catch { /* fallback Roboto Regular 20px */ }

  let varHighlight: Variable | null = null;
  let varNeutral5:  Variable | null = null;
  try { varHighlight = await figma.variables.importVariableByKeyAsync("efcc594aa6a398b8eebc4f49d3450f24afd86764"); } catch {}
  try { varNeutral5  = await figma.variables.importVariableByKeyAsync("0bfecd90e80a2b06fe34d8cbc9cc247ef3a559ff"); } catch {}

  async function aplicarEstilo(node: TextNode, style: TextStyle | null, varId: string, fonte: FontName, tamanho: number) {
    node.fills = [{ type: 'SOLID', color: CSF_COR_FALLBACK, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: varId } } }];
    if (style) {
      await figma.loadFontAsync(style.fontName);
      await node.setTextStyleIdAsync(style.id);
    } else {
      await figma.loadFontAsync(fonte);
      node.fontName = fonte;
      node.fontSize = tamanho;
    }
  }

  async function aplicarEstiloDSC(node: TextNode, style: TextStyle | null, variavel: Variable | null, fallbackFont: FontName, fallbackSize: number, fallbackColor: RGB) {
    if (variavel) {
      node.fills = [{ type: 'SOLID', color: fallbackColor, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variavel.id } } }];
    } else {
      node.fills = [{ type: 'SOLID', color: fallbackColor }];
    }
    if (style) {
      await figma.loadFontAsync(style.fontName);
      await node.setTextStyleIdAsync(style.id);
    } else {
      await figma.loadFontAsync(fallbackFont);
      node.fontName = fallbackFont;
      node.fontSize = fallbackSize;
    }
  }

  function produtoCartesiano(props: Record<string, string[]>): Record<string, string>[] {
    const chaves = Object.keys(props);
    if (chaves.length === 0) return [{}];
    let resultado: Record<string, string>[] = [{}];
    for (const chave of chaves) {
      const temp: Record<string, string>[] = [];
      for (const item of resultado) {
        for (const valor of props[chave]) {
          temp.push(Object.assign({}, item, { [chave]: valor }));
        }
      }
      resultado = temp;
    }
    return resultado;
  }

  let colValues: string[] = ["default"];
  let rowCombinations: Record<string, string>[] = [{}];
  let colProp: string | null = null;

  if (isComponentSet) {
    const allProps = (target as ComponentSetNode).variantGroupProperties;
    const propKeys = Object.keys(allProps);
    colProp = propKeys.find(k => k.toLowerCase().includes('state') || k.toLowerCase().includes('status')) || propKeys[0];
    const rowPropsKeys = propKeys.filter(k => k !== colProp);
    colValues = allProps[colProp].values;
    const rowPropsObj: Record<string, string[]> = {};
    for (const rk of rowPropsKeys) rowPropsObj[rk] = allProps[rk].values;
    rowCombinations = produtoCartesiano(rowPropsObj);
  }

  const gap = 80;
  const colWidths: number[] = colValues.map(() => 0);
  const rowHeights: number[] = rowCombinations.map(() => 0);

  if (isComponentSet) {
    const cSet = target as ComponentSetNode;
    rowCombinations.forEach((rowCombo, rowIndex) => {
      colValues.forEach((cVal, colIndex) => {
        const currentProps = Object.assign({}, rowCombo, colProp ? { [colProp]: cVal } : {});
        const variant = cSet.children.find(n => {
          if (n.type !== 'COMPONENT') return false;
          const p = n.variantProperties || {};
          return Object.keys(currentProps).every(k => p[k] === currentProps[k]);
        }) as ComponentNode;
        if (variant) {
          colWidths[colIndex] = Math.max(colWidths[colIndex], variant.width + gap);
          rowHeights[rowIndex] = Math.max(rowHeights[rowIndex], variant.height + gap);
        }
      });
    });
  } else {
    colWidths[0] = target.width + gap;
    rowHeights[0] = target.height + gap;
  }

  const colOffsets = colWidths.reduce((acc: number[], w, i) => [...acc, acc[i] + w], [0]);
  const rowOffsets = rowHeights.reduce((acc: number[], h, i) => [...acc, acc[i] + h], [0]);
  const setWidth  = colOffsets[colOffsets.length - 1];
  const setHeight = rowOffsets[rowOffsets.length - 1];

  // Se o componente está dentro de outro frame, extraí-lo.
  // Só apaga o frame raiz se ele foi gerado por uma execução anterior desta função (marcado via pluginData).
  if (target.parent && target.parent.type !== 'PAGE') {
    let frameRaiz = target.parent as SceneNode;
    while (frameRaiz.parent && frameRaiz.parent.type !== 'PAGE') {
      frameRaiz = frameRaiz.parent as SceneNode;
    }
    const absX = target.absoluteTransform[0][2];
    const absY = target.absoluteTransform[1][2];
    figma.currentPage.appendChild(target);
    target.x = absX;
    target.y = absY;
    if (!frameRaiz.removed && (frameRaiz as FrameNode).getPluginData?.("csfDocFrame") === "true") {
      frameRaiz.remove();
    }
  }

  const originalX = target.x;
  const originalY = target.y;

  if (isComponentSet) {
    const cSet = target as ComponentSetNode;
    cSet.layoutMode = "NONE";
    cSet.resizeWithoutConstraints(setWidth, setHeight);
    cSet.strokes = [{ type: 'SOLID', color: CSF_COR_COMPONENTSET }];
    cSet.strokeWeight = 1;
    cSet.dashPattern = [10, 5];
    cSet.cornerRadius = 5;

    rowCombinations.forEach((rowCombo, rowIndex) => {
      colValues.forEach((cVal, colIndex) => {
        const currentProps = Object.assign({}, rowCombo, colProp ? { [colProp]: cVal } : {});
        const variant = cSet.children.find(n => {
          if (n.type !== 'COMPONENT') return false;
          const p = n.variantProperties || {};
          return Object.keys(currentProps).every(k => p[k] === currentProps[k]);
        }) as ComponentNode;
        if (variant) {
          variant.x = colOffsets[colIndex] + (colWidths[colIndex] - variant.width) / 2;
          variant.y = rowOffsets[rowIndex] + (rowHeights[rowIndex] - variant.height) / 2;
        }
      });
    });
  }

  const docFrame = figma.createFrame();
  docFrame.name = target.name;
  docFrame.setPluginData("csfDocFrame", "true");
  docFrame.layoutMode = 'VERTICAL';
  docFrame.itemSpacing = 80;
  docFrame.paddingTop = 80;
  docFrame.paddingBottom = 80;
  docFrame.paddingLeft = 80;
  docFrame.paddingRight = 80;
  docFrame.primaryAxisSizingMode = 'AUTO';
  docFrame.counterAxisSizingMode = 'AUTO';

  // Header: "Component Set" + subtítulo fixo
  const headerFrame = figma.createFrame();
  headerFrame.name = "Header";
  headerFrame.layoutMode = 'VERTICAL';
  headerFrame.itemSpacing = 24;
  headerFrame.fills = [];
  headerFrame.primaryAxisSizingMode = 'AUTO';
  headerFrame.counterAxisSizingMode = 'AUTO';
  docFrame.appendChild(headerFrame);
  headerFrame.layoutSizingHorizontal = 'FILL';

  const tituloCS = figma.createText();
  tituloCS.characters = "Component Set";
  await aplicarEstiloDSC(tituloCS, displayLargeStyle, varHighlight, { family: "Roboto", style: "Bold" }, 60, { r: 0.051, g: 0.278, b: 0.631 });
  headerFrame.appendChild(tituloCS);
  tituloCS.layoutSizingHorizontal = 'FILL';

  const subtitulo = figma.createText();
  subtitulo.characters = "Apresentação dos componentes de design para utilização dos devs e QAs.";
  await aplicarEstiloDSC(subtitulo, textBigStyle, varNeutral5, { family: "Roboto", style: "Regular" }, 20, { r: 0.2, g: 0.2, b: 0.2 });
  headerFrame.appendChild(subtitulo);
  subtitulo.layoutSizingHorizontal = 'FILL';

  // Nome do componente
  const titulo = figma.createText();
  titulo.characters = target.name;
  await aplicarEstilo(titulo, titleStyle, CSF_ID_VARIAVEL_TITULO, { family: "Roboto", style: "Bold" }, 32);
  docFrame.appendChild(titulo);

  const bodyContainer = figma.createFrame();
  bodyContainer.name = "Body";
  bodyContainer.layoutMode = 'HORIZONTAL';
  bodyContainer.itemSpacing = 0;
  bodyContainer.fills = [];
  bodyContainer.primaryAxisSizingMode = 'AUTO';
  bodyContainer.counterAxisSizingMode = 'AUTO';
  docFrame.appendChild(bodyContainer);

  const sideLabels = figma.createFrame();
  sideLabels.name = "Side Labels";
  sideLabels.layoutMode = 'VERTICAL';
  sideLabels.itemSpacing = 0;
  sideLabels.fills = [];
  bodyContainer.appendChild(sideLabels);
  sideLabels.layoutSizingHorizontal = 'HUG';

  const headerHeight = 60;

  const spacer = figma.createFrame();
  spacer.name = "Spacer";
  spacer.fills = [];
  sideLabels.appendChild(spacer);
  spacer.resize(250, headerHeight);
  spacer.layoutSizingHorizontal = 'FILL';
  spacer.layoutSizingVertical = 'FIXED';

  for (let i = 0; i < rowCombinations.length; i++) {
    const wrapper = figma.createFrame();
    wrapper.resize(250, rowHeights[i]);
    wrapper.fills = [];
    wrapper.layoutMode = 'HORIZONTAL';
    wrapper.primaryAxisAlignItems = 'MAX';
    wrapper.counterAxisAlignItems = 'CENTER';
    wrapper.paddingRight = 40;

    const lbl = figma.createText();
    lbl.characters = Object.keys(rowCombinations[i]).map(k => `${k}: ${rowCombinations[i][k]}`).join('\n') || "default";
    await aplicarEstilo(lbl, labelStyle, CSF_ID_VARIAVEL_LABEL, { family: "Roboto", style: "Regular" }, 14);
    lbl.textAlignHorizontal = 'RIGHT';
    wrapper.appendChild(lbl);
    sideLabels.appendChild(wrapper);
  }

  const mainContent = figma.createFrame();
  mainContent.name = "MainContent";
  mainContent.layoutMode = 'VERTICAL';
  mainContent.itemSpacing = 0;
  mainContent.fills = [];
  mainContent.primaryAxisSizingMode = 'AUTO';
  mainContent.counterAxisSizingMode = 'AUTO';
  bodyContainer.appendChild(mainContent);

  const headerRow = figma.createFrame();
  headerRow.name = "Header Row";
  headerRow.layoutMode = 'HORIZONTAL';
  headerRow.itemSpacing = 0;
  headerRow.fills = [];
  headerRow.resize(setWidth, headerHeight);
  mainContent.appendChild(headerRow);

  for (let i = 0; i < colValues.length; i++) {
    const hWrapper = figma.createFrame();
    hWrapper.name = "Col Wrapper";
    hWrapper.fills = [];
    hWrapper.layoutMode = 'HORIZONTAL';
    hWrapper.primaryAxisAlignItems = 'CENTER';
    hWrapper.counterAxisAlignItems = 'CENTER';
    headerRow.appendChild(hWrapper);
    hWrapper.resize(colWidths[i], headerHeight);
    hWrapper.layoutSizingHorizontal = 'FILL';

    const hLabel = figma.createText();
    hLabel.characters = colValues[i];
    await aplicarEstilo(hLabel, labelStyle, CSF_ID_VARIAVEL_LABEL, { family: "Roboto", style: "Bold" }, 14);
    hLabel.textAlignHorizontal = 'CENTER';
    hWrapper.appendChild(hLabel);
  }

  const setWrapper = figma.createFrame();
  setWrapper.name = "Wrapper";
  setWrapper.fills = [];
  setWrapper.resize(setWidth, setHeight);
  mainContent.appendChild(setWrapper);

  // Ancorar o docFrame na página ANTES de mover o component set para dentro do setWrapper.
  // Mover um ComponentSetNode para um container órfão (fora da página) faz o Figma
  // converter as sub-instâncias dos variants em frames.
  docFrame.x = originalX;
  docFrame.y = originalY;
  figma.currentPage.appendChild(docFrame);

  setWrapper.appendChild(target);
  target.x = isComponentSet ? 0 : (colWidths[0] - target.width) / 2;
  target.y = isComponentSet ? 0 : (rowHeights[0] - target.height) / 2;
}

// === EXTRAS ===

function buscarSectionsRecursivo(nos: readonly SceneNode[]): SectionNode[] {
  const resultado: SectionNode[] = [];
  for (const no of nos) {
    if (no.type === 'SECTION') resultado.push(no as SectionNode);
    if ('children' in no) resultado.push(...buscarSectionsRecursivo((no as ChildrenMixin).children));
  }
  return resultado;
}

// === HANDLER DE MENSAGENS DA UI ===

figma.ui.onmessage = async (msg) => {
  /** Handler para gerar um novo handoff */
  if (msg.type === 'run-handoff') {
    try {

      const selecao = figma.currentPage.selection;
      if (selecao.length === 0) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Selecione o componente para documentar.' });
        return;
      }

      // Separar template e componente da seleção
      let templateSelecionado: InstanceNode | undefined;
      let noComponente: SceneNode | undefined;
      for (const no of selecao) {
        if (no.type === "INSTANCE" && no.name.toLowerCase().includes("[dsc-h] template handoff")) {
          templateSelecionado = no as InstanceNode;
        } else if (!noComponente) {
          noComponente = no;
        }
      }
      if (!noComponente) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Selecione um Component Set, Component ou variante.' });
        return;
      }

      const componentSet = await resolverComponentSet(noComponente);
      const modo = msg.mode || 'complete';

      if (!componentSet) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Selecione um Component Set, Component ou variante.' });
        return;
      }

      // Formatar Component Set antes de qualquer trabalho no handoff
      if (msg.incluirComponente) {
        await formatarComponenteSet(componentSet);
      }

      // Capturar key do template selecionado para uso em resolverTemplate
      if (templateSelecionado) {
        const compMain = await templateSelecionado.getMainComponentAsync();
        if (compMain?.key) _templateCompKey = compMain.key;
      }

      // Sempre gera um novo handoff (o existente é preservado como histórico)
      const opcoes = {
        incluirComponente: !!msg.incluirComponente,
        preencherDescricao: !!msg.preencherDescricao,
        truePrimeiro: !!msg.truePrimeiro,
      };
      const ok = await gerarDocumentoHandoff(componentSet, noComponente, templateSelecionado, undefined, modo, opcoes);
      if (ok) figma.ui.postMessage({ type: 'status', status: 'success', message: 'Handoff gerado com sucesso!' });
    } catch (err: unknown) {
      console.error(err);
      const mensagem = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({ type: 'status', status: 'error', message: 'Erro: ' + mensagem });
    }
  }

  /** Handler para atualizar um handoff existente (atualização seletiva por seção) */
  if (msg.type === 'update-handoff') {
    try {
      const selecao = figma.currentPage.selection;
      if (selecao.length === 0) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Selecione o Component Set ou variante para atualizar.' });
        return;
      }

      // Separar template e componente da seleção
      let templateSelecionado: InstanceNode | undefined;
      let noComponente: SceneNode | undefined;
      for (const no of selecao) {
        if (no.type === "INSTANCE" && no.name.toLowerCase().includes("[dsc-h] template handoff")) {
          templateSelecionado = no as InstanceNode;
        } else if (!noComponente) {
          noComponente = no;
        }
      }
      if (!noComponente) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Selecione um Component Set, Component ou variante para atualizar o handoff.' });
        return;
      }

      const componentSet = await resolverComponentSet(noComponente);
      if (!componentSet) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Selecione um Component Set, Component ou variante para atualizar o handoff.' });
        return;
      }

      // Formatar Component Set antes de qualquer trabalho no handoff
      if (msg.incluirComponente) {
        // Limpar posições de badges salvas — formatarComponenteSet altera a geometria do ComponentSet,
        // tornando as posições antigas inválidas; a anatomia vai recalcular posições corretas
        const handoffParaLimpar = buscarHandoffExistente(componentSet);
        if (handoffParaLimpar) handoffParaLimpar.setPluginData("posicoesBadges", "");
        await formatarComponenteSet(componentSet);
      }

      const handoffExistente = buscarHandoffExistente(componentSet);
      if (!handoffExistente) {
        const nomeBase = componentSet.name.replace(/^\[.*?\]/, "").trim();
        const nomeFormatado = capitalizar(nomeBase);
        figma.ui.postMessage({ type: 'status', status: 'error', message: `Nenhum handoff encontrado para "${nomeFormatado}".` });
        return;
      }

      // Se o usuário selecionou um template, usar o mainComponent dele; senão, usar o salvo no handoff
      _estrategia3Tentada = false;
      let templateCompId: string;
      if (templateSelecionado) {
        const compMain = await templateSelecionado.getMainComponentAsync();
        templateCompId = compMain ? compMain.id : "";
        if (templateCompId) handoffExistente.setPluginData("templateCompId", templateCompId);
        if (compMain?.key) {
          _templateCompKey = compMain.key;
          handoffExistente.setPluginData("templateCompKey", compMain.key);
          figma.clientStorage.setAsync("dsc-handoff-templateCompKey", compMain.key);
        }
      } else {
        templateCompId = handoffExistente.getPluginData("templateCompId");
        _templateCompKey = handoffExistente.getPluginData("templateCompKey") || "";
      }


      if (!templateCompId) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Handoff sem referência ao template. Selecione o template junto com o componente.' });
        return;
      }

      // Verificar se o template está acessível (aviso, não bloqueio)
      const testTemplate = await resolverTemplate(templateCompId);
      if (testTemplate) {
        testTemplate.remove();
      } else {
      }

      const modo = msg.mode || 'complete';

      // Carregar fontes
      await carregarFontes(handoffExistente);
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });

      // Construir cache de variables (locais + importadas do handoff/template)
      await construirCacheVariables(handoffExistente);

      // Sincronizar estrutura do template (só se template disponível)
      const syncTemplate = msg.syncTemplate !== false && !!testTemplate;
      let secoesNoTemplate = testTemplate ? await extrairOrdemDoTemplate(templateCompId) : [];
      let ordemFilhos: string[] = [];
      let secoesInseridas = new Set<string>();

      // Se não temos o template, derivar lista de seções do próprio handoff
      if (!testTemplate) {
        secoesNoTemplate = handoffExistente.children
          .map(c => c.name.toLowerCase())
          .filter(n => ORDEM_SECOES.includes(n));
      }

      if (syncTemplate) {
        enviarProgresso('Sincronizando template...');
        const resultado = await sincronizarEstruturaTemplate(handoffExistente, templateCompId);
        secoesNoTemplate = resultado.secoes;
        ordemFilhos = resultado.ordemFilhos;
        secoesInseridas = resultado.secoesInseridas;
      }

      // Determinar seções a atualizar (excluindo as recém-inseridas — já vieram frescas do template)
      const secoesAtualizar: string[] | undefined = msg.secoesAtualizar;
      const secoesDoModo = secoesNoTemplate.filter(s => {
        if (secoesInseridas.has(s)) return false;
        if (Array.isArray(secoesAtualizar)) return secoesAtualizar.includes(s);
        const dominio = DOMINIO_SECOES[s] || "design";
        return modo === 'complete' || dominio === modo;
      });

      const dna = escanearDNA(obterVariantePadrao(componentSet));

      // Resolver compLinhaTabela a partir do template
      const instTemp = await resolverTemplate(templateCompId);
      let compLinhaTabela: ComponentNode | null = null;
      if (instTemp) {
        const linhaNo = buscarFilho(instTemp, "Property Table Row");
        if (linhaNo && linhaNo.type === "INSTANCE") {
          compLinhaTabela = await (linhaNo as InstanceNode).getMainComponentAsync();
        }
        instTemp.remove();
      }

      // Atualizar cada seção do domínio selecionado (seções de outros domínios ficam intactas)
      const manterEdicoes = msg.manterEdicoes !== false;
      const truePrimeiro = !!msg.truePrimeiro;
      for (const nomeSecao of secoesDoModo) {
        const nomeAmigavel = NOMES_SECOES[nomeSecao] || capitalizar(nomeSecao);
        enviarProgresso(`Atualizando ${nomeAmigavel}...`);
        await atualizarSecao(handoffExistente, nomeSecao, templateCompId, componentSet, dna, compLinhaTabela, secoesNoTemplate, manterEdicoes, truePrimeiro);
      }

      // Reordenar filhos para corresponder à ordem do template
      if (syncTemplate && ordemFilhos.length > 0) reordenarFilhos(handoffExistente, ordemFilhos);

      // Preencher descrição do componente se solicitado
      if (msg.preencherDescricao) {
        preencherDescricaoComponente(componentSet);
      }

      figma.viewport.scrollAndZoomIntoView([handoffExistente]);
      figma.ui.postMessage({ type: 'status', status: 'success', message: 'Handoff atualizado com sucesso!' });
    } catch (err: unknown) {
      console.error(err);
      const mensagem = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({ type: 'status', status: 'error', message: 'Erro: ' + mensagem });
    }
  }

  if (msg.type === 'toggle-nomes-sections') {
    const escopo: 'pagina' | 'selecao' = msg.escopo;
    const sections = escopo === 'pagina'
      ? (figma.currentPage.findAllWithCriteria({ types: ['SECTION'] }) as SectionNode[])
      : buscarSectionsRecursivo(figma.currentPage.selection);

    const estaOculto = sections.some(s => s.getPluginData('dschNomeOriginal') !== '');
    let contador = 0;

    if (!estaOculto) {
      for (const secao of sections) {
        if (secao.name.trim() !== '') {
          secao.setPluginData('dschNomeOriginal', secao.name);
          secao.name = '';
          contador++;
        }
      }
      figma.notify(contador > 0 ? `${contador} nome(s) ocultado(s)` : 'Nenhuma section com nome encontrada');
    } else {
      for (const secao of sections) {
        const nomeOriginal = secao.getPluginData('dschNomeOriginal');
        if (nomeOriginal) {
          secao.name = nomeOriginal;
          secao.setPluginData('dschNomeOriginal', '');
          contador++;
        }
      }
      figma.notify(contador > 0 ? `${contador} nome(s) restaurado(s)` : 'Nenhum nome para restaurar');
    }

    const novoEstado = !estaOculto && contador > 0;
    figma.ui.postMessage({ type: 'estado-sections', escopo, oculto: novoEstado });
  }

  if (msg.type === 'checar-estado-sections') {
    const sectionsPagina = figma.currentPage.findAllWithCriteria({ types: ['SECTION'] }) as SectionNode[];
    const sectionsSelecao = buscarSectionsRecursivo(figma.currentPage.selection);
    figma.ui.postMessage({
      type: 'estado-sections-inicial',
      pagina: sectionsPagina.some(s => s.getPluginData('dschNomeOriginal') !== ''),
      selecao: sectionsSelecao.some(s => s.getPluginData('dschNomeOriginal') !== ''),
    });
  }
};

/**
 * Tenta resolver a instância do template de handoff usando múltiplas estratégias.
 * 1. Pelo ID do componente salvo no handoff anterior
 * 2. Busca na página atual por instância com nome do template
 * 3. Busca em todas as páginas pelo componente master
 */
async function resolverTemplate(templateCompId: string, templateCompKey = ""): Promise<InstanceNode | null> {
  // Estratégia 1: usar o ID salvo (funciona para componentes locais)
  if (templateCompId) {
    const noTemplate = await figma.getNodeByIdAsync(templateCompId);
    if (noTemplate && noTemplate.type === "COMPONENT") {
      const inst = (noTemplate as ComponentNode).createInstance();
      inst.visible = false;
      return inst;
    }
  }

  // Estratégia 1b: importar componente de biblioteca externa pela chave (passada ou em memória)
  const chave = templateCompKey || _templateCompKey;
  if (chave) {
    try {
      const comp = await figma.importComponentByKeyAsync(chave);
      const inst = comp.createInstance();
      inst.visible = false;
      return inst;
    } catch (_e) { /* continua */ }
  }

  // Estratégia 1c: usar chave salva no clientStorage (persiste entre sessões)
  if (!chave) {
    const chaveSalva = await figma.clientStorage.getAsync("dsc-handoff-templateCompKey") as string | undefined;
    if (chaveSalva) {
      try {
        const comp = await figma.importComponentByKeyAsync(chaveSalva);
        const inst = comp.createInstance();
        inst.visible = false;
        _templateCompKey = chaveSalva;
        return inst;
      } catch (_e) { /* continua */ }
    }
  }

  // Estratégia 2: buscar instância na página atual (percorre Sections)
  const instanciaPagina = buscarNaPagina(n =>
    n.type === "INSTANCE" && n.name.toLowerCase().includes("[dsc-h] template handoff")
  ) as InstanceNode | null;
  if (instanciaPagina) {
    const clone = (instanciaPagina as InstanceNode).clone();
    clone.visible = false;
    return clone;
  }

  return null;
}

// === FUNÇÃO PRINCIPAL ===

/**
 * Gera o documento de handoff completo para um ComponentSet.
 * Orquestra a criação de: tabela de propriedades, variações visuais e matriz de estados.
 *
 * @param componentSet - O ComponentSet a documentar
 * @param noReferencia - Nó selecionado (usado para posicionar o handoff)
 * @param templateOverride - Instância de template pré-carregada (para atualização)
 * @param posOverride - Posição fixa (para atualização, mantém posição do handoff antigo)
 * @param modo - Modo de geração: 'complete', 'design' ou 'a11y'
 * @returns true se gerado com sucesso
 */
async function gerarDocumentoHandoff(
  componentSet: ComponenteDocumentavel,
  noReferencia: SceneNode,
  templateOverride?: InstanceNode,
  posOverride?: { x: number; y: number },
  modo: string = 'complete',
  opcoes: { incluirComponente?: boolean; preencherDescricao?: boolean; truePrimeiro?: boolean } = {}
): Promise<boolean> {
  const gerarDesign = modo === 'complete' || modo === 'design';

  // --- Localizar e preparar o template ---
  const instanciaTemplate = templateOverride || buscarNaPagina(n =>
    n.type === "INSTANCE" && n.name.toLowerCase().includes("[dsc-h] template handoff")
  ) as InstanceNode;

  if (!instanciaTemplate) {
    figma.ui.postMessage({ type: 'status', status: 'error', message: "Coloque uma instância do template '[dsc-h] Template Handoff' na página." });
    return false;
  }

  // Capturar componente master da linha da tabela ANTES de desvincular
  const linhaNoTemplate = buscarFilho(instanciaTemplate, "Property Table Row");
  const compLinhaTabela = (linhaNoTemplate && linhaNoTemplate.type === "INSTANCE")
    ? await (linhaNoTemplate as InstanceNode).getMainComponentAsync()
    : null;

  // Salvar ID e chave do componente do template para poder recriar depois (update)
  const compPrincipal = await instanciaTemplate.getMainComponentAsync();
  const templateCompId = compPrincipal ? compPrincipal.id : "";
  const templateCompKey = compPrincipal ? compPrincipal.key : "";
  if (templateCompKey) figma.clientStorage.setAsync("dsc-handoff-templateCompKey", templateCompKey);

  // --- Salvar posição original do template ---
  const posOriginalTemplate = { x: instanciaTemplate.x, y: instanciaTemplate.y };

  // --- Desvincular template para Frame editável ---
  const container = instanciaTemplate.detachInstance();

  // Formatar nome do componente (remove prefixo [xxx])
  const nomeBase = componentSet.name.replace(/^\[.*?\]/, "").trim();
  const nomeFormatado = capitalizar(nomeBase);

  container.name = `[dsc] Handoff: ${nomeFormatado}`;
  container.setPluginData("componentSetId", componentSet.id);
  if (templateCompId) container.setPluginData("templateCompId", templateCompId);
  if (templateCompKey) container.setPluginData("templateCompKey", templateCompKey);

  // Posicionar o container (mantém posição original do template)
  if (posOverride) {
    container.x = posOverride.x;
    container.y = posOverride.y;
  } else {
    container.x = posOriginalTemplate.x;
    container.y = posOriginalTemplate.y;
  }

  // Carregar fontes necessárias
  await carregarFontes(container);
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

  // Construir cache de variables (locais + importadas do template)
  await construirCacheVariables(container);

  // Injetar nome do componente
  const titulo = buscarFilho(container, "Component Name") as TextNode;
  if (titulo) titulo.characters = nomeFormatado;

  // --- Gerar seções conforme o modo (ordem dinâmica do template) ---
  const dna = escanearDNA(obterVariantePadrao(componentSet));
  const ordemDinamica = templateCompId
    ? await extrairOrdemDoTemplate(templateCompId)
    : [...ORDEM_SECOES];


  for (const nomeSecao of ordemDinamica) {
    const dominio = DOMINIO_SECOES[nomeSecao] || "design";
    const deveGerar = modo === 'complete' || dominio === modo;
    const nomeAmigavel = NOMES_SECOES[nomeSecao] || capitalizar(nomeSecao);


    if (!deveGerar) {
      const alvo = buscarFilho(container, nomeSecao);
      if (alvo) alvo.remove();
      continue;
    }

    enviarProgresso(`Gerando ${nomeAmigavel}...`);

    if (nomeSecao === "table") {
      await gerarTabelaPropriedades(container, componentSet, compLinhaTabela);
    } else if (nomeSecao === "anatomy") {
      await gerarSecaoAnatomia(container, componentSet);
    } else if (nomeSecao === "variants") {
      await gerarSecaoVariacoes(container, componentSet, dna, !!opcoes.truePrimeiro);
    } else if (nomeSecao === "states") {
      await gerarMatrizEstados(container, componentSet, dna);
    }
  }

  // Marcar seções com pluginData para identificação robusta na atualização
  for (const nomeSecao of ordemDinamica) {
    const secao = buscarFilho(container, nomeSecao);
    if (secao) {
      secao.setPluginData("secaoNome", nomeSecao);
      secao.setPluginData("secaoDominio", DOMINIO_SECOES[nomeSecao] || "design");
    }
  }

  // Salvar posições de badges da anatomia (backup para futura atualização)
  const secaoAnat = buscarFilho(container, "anatomy");
  if (secaoAnat) {
    const posicoesBadges = extrairPosicoesBadges(secaoAnat);
    salvarPosicoesBadges(container, posicoesBadges);
  }

  // Preencher descrição do componente se solicitado
  if (opcoes.preencherDescricao) {
    preencherDescricaoComponente(componentSet);
  }

  // Navegar até o resultado
  figma.viewport.scrollAndZoomIntoView([container]);
  return true;
}
