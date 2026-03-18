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
  "variant": "Possibilidades que o componente pode assumir (cor, estilo, etc)",
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

// Verificar se é a primeira vez que o usuário abre o plugin
(async () => {
  const jaViuIntro = await figma.clientStorage.getAsync('dsc-handoff-intro-visto');
  figma.ui.postMessage({ type: 'intro-status', visto: !!jaViuIntro });
})();

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
 * Verifica recursivamente se algum texto dentro do nó tem baixo contraste com branco.
 * Usado para decidir se o card precisa de fundo escuro.
 */
function temTextoBaixoContraste(no: SceneNode): boolean {
  try {
    if (no.type === 'TEXT') {
      const fills = (no as TextNode).fills;
      if (typeof fills === 'symbol') return false; // mixed fills
      const paintFills = fills as ReadonlyArray<Paint>;
      if (paintFills && paintFills.length > 0) {
        for (const fill of paintFills) {
          if (fill.type === 'SOLID' && fill.visible !== false) {
            const { r, g, b } = fill.color;
            if (contrasteComBranco(r, g, b) < LIMIAR_CONTRASTE_WCAG) return true;
          }
        }
      }
      return false;
    }
    if ('children' in no) {
      for (const filho of (no as any).children) {
        if (temTextoBaixoContraste(filho)) return true;
      }
    }
  } catch {}
  return false;
}

/**
 * Determina se um componente instanciado precisa de fundo escuro no card.
 * Condições: (1) sem fundo visível ou fundo branco E (2) textos com baixo contraste.
 */
function precisaFundoEscuro(no: SceneNode): boolean {
  try {
    const fills = (no as any).fills;
    if (typeof fills === 'symbol') return false; // mixed fills
    const semFundo = !fills || fills.length === 0
      || fills.every((f: any) => f.visible === false || f.opacity === 0
        || (f.type === 'SOLID' && f.color.r > 0.95 && f.color.g > 0.95 && f.color.b > 0.95));
    if (!semFundo) return false;
    return temTextoBaixoContraste(no);
  } catch {
    return false;
  }
}

/** Cache de variables de cor locais para evitar chamadas repetidas */
let _cacheVariablesCor: Variable[] | null = null;

/**
 * Busca uma variable de cor local pelo nome (case-insensitive).
 * Usa cache para evitar chamadas repetidas a getLocalVariablesAsync.
 */
async function buscarVariablePorNome(nome: string): Promise<Variable | null> {
  try {
    if (!figma.variables || !figma.variables.getLocalVariablesAsync) return null;
    if (!_cacheVariablesCor) {
      _cacheVariablesCor = await figma.variables.getLocalVariablesAsync('COLOR');
    }
    const alvo = nome.toLowerCase();
    return _cacheVariablesCor.find(v => v.name.toLowerCase() === alvo) || null;
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

  if (tipo === "TEXT") return `Texto que será aplicado na(o) ${nomeExibicao}`;
  if (tipo === "BOOLEAN" || (def && ehVarianteBoolTexto(def))) {
    const nomeLimpo = nomeExibicao.replace(/^(show|has|display)\s+/i, '').trim();
    return `Mostrar ou ocultar ${nomeLimpo}`;
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

  // Aplicar dark mode se solicitado
  if (modeDark) {
    try {
      await aplicarFundoComVariable(card, 'card background 2');
      if (label) await aplicarCorTextoComVariable(label, 'card text 2');
    } catch {}
    try {
      card.setExplicitVariableModeForCollection(modeDark.colecao, modeDark.modeId);
    } catch {
      try {
        card.setExplicitVariableModeForCollection(modeDark.collectionId, modeDark.modeId);
      } catch {}
    }
  } else {
    try {
      if (precisaFundoEscuro(instancia)) {
        await aplicarFundoComVariable(card, 'card background 2');
        if (label) await aplicarCorTextoComVariable(label, 'card text 2');
      }
    } catch {}
  }

  card.appendChild(instancia);
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
        ? defsRaiz[nomeProp].variantOptions || []
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

  async function percorrer(no: SceneNode): Promise<void> {
    if (tiposIgnorados.has(no.type)) return;

    // Separadores visuais (Line 1, Line 2, etc.) — pular, continuar recursão
    if (/^Line\s*\d*$/i.test(no.name)) {
      if ("children" in no) {
        for (const filho of (no as any).children) {
          await percorrer(filho as SceneNode);
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
          await percorrer(filho as SceneNode);
        }
        return;
      }
    }

    // Nó folha com refs (TEXT, etc.) → incluir, STOP
    if (temPropriedade) {
      adicionarElemento(no, !!(refs.visible), null);
      return;
    }

    // Nó sem refs e não-INSTANCE → continuar recursão
    if ("children" in no) {
      for (const filho of (no as any).children) {
        await percorrer(filho as SceneNode);
      }
    }
  }

  if ("children" in instancia) {
    for (const filho of (instancia as any).children) {
      await percorrer(filho as SceneNode);
    }
  }
  console.log(`=== ANATOMIA: ${elementos.length} elementos extraídos ===`);

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

    if (relX < 0.15) return ["left", "top", "bottom", "right"];
    if (relX > 0.85) return ["right", "top", "bottom", "left"];
    if (relY < 0.35) return ["top", "left", "right", "bottom"];
    if (relY > 0.65) return ["bottom", "left", "right", "top"];
    return ["left", "bottom", "right", "top"];
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
      await aplicarFundoComVariable(frameAlvo, 'card background 2');
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

    const temDoisGrupos = externos.length > 0 && internos.length > 0;

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
        const instanciaUnica = await criarInstanciaPreview(componentSet, frameImagem, margemBadge);
        const todosIndices = elementosOrdenados.map((_, i) => i + 1);
        await posicionarBadgesNaInstancia(frameImagem, instanciaUnica, elementosOrdenados, todosIndices, badgeRef);
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

      // Dark mode: aplicar fundo escuro no card e texto claro
      if (modeDark) {
        try {
          await aplicarFundoComVariable(card, 'card background 2');
          const labelCard = buscarFilho(card, "VALUE") as TextNode;
          if (labelCard) await aplicarCorTextoComVariable(labelCard, 'card text 2');
        } catch {}
      }

      const tamanhosRender = opcoesSize.length > 0 ? opcoesSize : [null];
      let fundoEscuroAplicado = !!modeDark; // já aplicou se dark mode

      for (const tamanho of tamanhosRender) {
        const props: Record<string, any> = {
          [chaveEstado]: valorEstado,
          ...comboY
        };
        if (chaveSize && tamanho) props[chaveSize] = tamanho;
        aplicarCascataDNA(props, dna);

        const instancia = obterVariantePadrao(componentSet).createInstance();
        try { instancia.setProperties(props); } catch {}


        // Contraste WCAG (apenas para light mode)
        if (!modeDark) {
          try {
            if (!fundoEscuroAplicado && precisaFundoEscuro(instancia)) {
              const ehDisabled = valorEstado.toLowerCase().includes('disable');
              const ehLight = await estamosNoLightMode(instancia);
              if (!(ehDisabled && ehLight)) {
                await aplicarFundoComVariable(card, 'card background 2');
                const labelCard = buscarFilho(card, "VALUE") as TextNode;
                if (labelCard) await aplicarCorTextoComVariable(labelCard, 'card text 2');
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
      // Setar explicit variable mode — tentar com objeto da coleção (necessário para library)
      try {
        darkDesvinculado.setExplicitVariableModeForCollection(modeDark.colecao, modeDark.modeId);
      } catch {
        // Fallback: tentar com ID string (coleções locais)
        try {
          darkDesvinculado.setExplicitVariableModeForCollection(modeDark.collectionId, modeDark.modeId);
        } catch {}
      }
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

  // 4. Remover seção existente
  if (secaoExistente) {
    secaoExistente.remove();
  }

  // 5. Obter seção fresca do template
  const secaoNova = await obterSecaoDoTemplate(templateCompId, nomeSecao);
  if (!secaoNova) {
    console.log(`Seção "${nomeSecao}" não encontrada no template — pulando.`);
    return;
  }

  // 6. Inserir na posição correta (no mesmo pai onde a seção antiga estava)
  const indiceReal = Math.min(indicePosicao, paiDaSecao.children.length);
  paiDaSecao.insertChild(indiceReal, secaoNova);

  // Marcar a seção com pluginData para identificação robusta
  secaoNova.setPluginData("secaoNome", nomeSecao);
  secaoNova.setPluginData("secaoDominio", DOMINIO_SECOES[nomeSecao] || "design");

  // 7. Chamar função geradora correspondente
  await carregarFontes(secaoNova);

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
    await reinjetarTextosGenericos(secaoNova, textosGenericos);
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

// === INCLUIR COMPONENTE DENTRO DA DOCUMENTAÇÃO ===

/**
 * Move o ComponentSet para dentro do container do handoff e o torna invisível.
 * Isso permite que "Go to main component" leve diretamente ao handoff.
 */
function incluirComponenteNoHandoff(container: FrameNode, componentSet: ComponenteDocumentavel): void {
  // Mover o component set para o início do container (antes das seções)
  container.insertChild(0, componentSet);
  componentSet.visible = false;
}

// === HANDLER DE MENSAGENS DA UI ===

figma.ui.onmessage = async (msg) => {
  /** Handler para marcar intro como vista */
  if (msg.type === 'intro-visto') {
    await figma.clientStorage.setAsync('dsc-handoff-intro-visto', true);
    return;
  }

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

      const handoffExistente = buscarHandoffExistente(componentSet);
      if (!handoffExistente) {
        const nomeBase = componentSet.name.replace(/^\[.*?\]/, "").trim();
        const nomeFormatado = capitalizar(nomeBase);
        figma.ui.postMessage({ type: 'status', status: 'error', message: `Nenhum handoff encontrado para "${nomeFormatado}".` });
        return;
      }

      // Se o usuário selecionou um template, usar o mainComponent dele; senão, usar o salvo no handoff
      let templateCompId: string;
      if (templateSelecionado) {
        const compMain = await templateSelecionado.getMainComponentAsync();
        templateCompId = compMain ? compMain.id : "";
        if (templateCompId) {
          handoffExistente.setPluginData("templateCompId", templateCompId);
        }
      } else {
        templateCompId = handoffExistente.getPluginData("templateCompId");
      }

      if (!templateCompId) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Handoff sem referência ao template. Selecione o template junto com o componente.' });
        return;
      }

      // Verificar que o template está acessível
      const testTemplate = await resolverTemplate(templateCompId);
      if (!testTemplate) {
        figma.ui.postMessage({ type: 'status', status: 'error', message: 'Template não encontrado. Coloque uma instância do template na página.' });
        return;
      }
      testTemplate.remove();

      const modo = msg.mode || 'complete';

      // Carregar fontes
      await carregarFontes(handoffExistente);
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });

      // Sincronizar estrutura do template (condicional)
      const syncTemplate = msg.syncTemplate !== false;
      let secoesNoTemplate = await extrairOrdemDoTemplate(templateCompId);
      let ordemFilhos: string[] = [];
      let secoesInseridas = new Set<string>();

      if (syncTemplate) {
        enviarProgresso('Sincronizando template...');
        const resultado = await sincronizarEstruturaTemplate(handoffExistente, templateCompId);
        secoesNoTemplate = resultado.secoes;
        ordemFilhos = resultado.ordemFilhos;
        secoesInseridas = resultado.secoesInseridas;
      }

      // Determinar seções a atualizar (excluindo as recém-inseridas — já vieram frescas do template)
      const secoesDoModo = secoesNoTemplate.filter(s => {
        if (secoesInseridas.has(s)) return false;
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

      // Incluir componente dentro da documentação se solicitado
      if (msg.incluirComponente) {
        // Verificar se o componente já está dentro do handoff
        const jaIncluso = handoffExistente.children.some(c => c.id === componentSet.id);
        if (!jaIncluso) {
          incluirComponenteNoHandoff(handoffExistente, componentSet);
        }
      }

      figma.viewport.scrollAndZoomIntoView([handoffExistente]);
      figma.ui.postMessage({ type: 'status', status: 'success', message: 'Handoff atualizado com sucesso!' });
    } catch (err: unknown) {
      console.error(err);
      const mensagem = err instanceof Error ? err.message : String(err);
      figma.ui.postMessage({ type: 'status', status: 'error', message: 'Erro: ' + mensagem });
    }
  }
};

/**
 * Tenta resolver a instância do template de handoff usando múltiplas estratégias.
 * 1. Pelo ID do componente salvo no handoff anterior
 * 2. Busca na página atual por instância com nome do template
 * 3. Busca em todas as páginas pelo componente master
 */
async function resolverTemplate(templateCompId: string): Promise<InstanceNode | null> {
  // Estratégia 1: usar o ID salvo
  if (templateCompId) {
    const noTemplate = await figma.getNodeByIdAsync(templateCompId);
    if (noTemplate && noTemplate.type === "COMPONENT") {
      return (noTemplate as ComponentNode).createInstance();
    }
  }

  // Estratégia 2: buscar instância na página atual (percorre Sections)
  const instanciaPagina = buscarNaPagina(n =>
    n.type === "INSTANCE" && n.name.toLowerCase().includes("[dsc-h] template handoff")
  ) as InstanceNode | null;
  if (instanciaPagina) return instanciaPagina;

  // Estratégia 3: buscar componente master em todo o arquivo
  await figma.loadAllPagesAsync();
  const compTemplate = figma.root.findOne(n =>
    (n.type === "COMPONENT" || n.type === "COMPONENT_SET")
    && n.name.toLowerCase().includes("[dsc-h] template handoff")
  );
  if (compTemplate && compTemplate.type === "COMPONENT") {
    return (compTemplate as ComponentNode).createInstance();
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

  // Salvar ID do componente do template para poder recriar depois (update)
  const compPrincipal = await instanciaTemplate.getMainComponentAsync();
  const templateCompId = compPrincipal ? compPrincipal.id : "";

  // --- Desvincular template para Frame editável ---
  const container = instanciaTemplate.detachInstance();

  // Formatar nome do componente (remove prefixo [xxx])
  const nomeBase = componentSet.name.replace(/^\[.*?\]/, "").trim();
  const nomeFormatado = capitalizar(nomeBase);

  container.name = `[dsc] Handoff: ${nomeFormatado}`;
  container.setPluginData("componentSetId", componentSet.id);
  if (templateCompId) container.setPluginData("templateCompId", templateCompId);

  // Posicionar o container
  if (posOverride) {
    container.x = posOverride.x;
    container.y = posOverride.y;
  } else if (noReferencia && !noReferencia.removed) {
    container.x = noReferencia.x + noReferencia.width + 400;
    container.y = noReferencia.y;
  }

  // Carregar fontes necessárias
  await carregarFontes(container);
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });

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

  // Preencher descrição do componente se solicitado
  if (opcoes.preencherDescricao) {
    preencherDescricaoComponente(componentSet);
  }

  // Incluir componente dentro da documentação se solicitado
  if (opcoes.incluirComponente) {
    incluirComponenteNoHandoff(container, componentSet);
  }

  // Navegar até o resultado
  figma.viewport.scrollAndZoomIntoView([container]);
  return true;
}
