// DSC A11Y Handoff - Plugin Figma para handoff de acessibilidade

// ════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════

/** Dados de acessibilidade associados a um componente (nível raiz). */
interface ComponentA11yData {
  /** Plataformas alvo (ex.: 'web', 'mobile-android') */
  platform: string[];
  /** Tipos de zoom suportados (ex.: 'resize-text', 'reflow') */
  zoom: string[];
  /** Se true, o componente não participa da tabulação */
  noTab?: boolean;
  /** Se true, não possui anotações de leitor de tela */
  noScreenReader?: boolean;
  /** Se true, não possui áreas de toque */
  noTouch?: boolean;
  /** Mapeamento de teclado: 'none' = sem mapeamento, string[] = chaves "tecla|ação" selecionadas */
  kbMapping?: 'none' | string[];
  /** Mapeamento de gestos: 'none' = sem mapeamento, string[] = chaves "gesto|ação" selecionadas */
  gestureMapping?: 'none' | string[];
}

/** Dados de acessibilidade associados a um layer individual. */
interface LayerA11yData {
  /** Papel semântico (ex.: 'button', 'heading', 'dont-read') */
  role: string;
  /** Categoria de acessibilidade (ex.: 'funcao-valor', 'decorativo') */
  category: string;
  /** Nome acessível personalizado */
  accessibleName?: string;
  /** Texto alternativo para imagens */
  altText?: string;
  /** Nível de título (1-6) */
  headingLevel?: number;
  /** Explicação adicional para o handoff */
  explanation?: string;
  /** Especificação da role (variante do CSV, ex.: 'default', 'only icon') */
  specification?: string;
  /** Nota de código do CSV (instruções de implementação HTML) */
  codeNote?: string;
  /** Observação adicional do CSV */
  observation?: string;
  /** Tipo(s) de conector do CSV (ex.: 'Função, Valor, Rótulos') */
  connectorType?: string;
  /** Ordem de criação (timestamp) para ordenação na lista unificada */
  order?: number;
}

/** Retângulo de uma área de toque, relativo ao componente. */
interface TouchAreaRect {
  /** Coordenada X relativa ao componente */
  x: number;
  /** Coordenada Y relativa ao componente */
  y: number;
  /** Largura da área de toque em pixels */
  width: number;
  /** Altura da área de toque em pixels */
  height: number;
}

/** Retângulo de agrupamento para leitura conjunta pelo leitor de tela. */
interface AgrupamentoRect {
  /** Coordenada X relativa ao componente */
  x: number;
  /** Coordenada Y relativa ao componente */
  y: number;
  /** Largura da área de agrupamento */
  width: number;
  /** Altura da área de agrupamento */
  height: number;
  /** Tipo de agrupamento (ex.: 'Função, Valor, Rótulos') */
  tipo: string;
  /** Letra identificadora (A, B, C...) */
  letra: string;
  /** Role do CSV (opcional) */
  role?: string;
  /** Especificação do CSV (opcional) */
  specification?: string;
  /** Descrição do CSV */
  explanation?: string;
  /** Observação do CSV */
  observation?: string;
  /** Nome acessível do CSV */
  accessibleName?: string;
  /** Nota de código do CSV */
  codeNote?: string;
  /** Ordem de criação (timestamp) para ordenação na lista unificada */
  order?: number;
}

/** Entrada de conectores combinados para um layer. */
interface CombinadoEntry {
  /** Caminho do layer (namePath) */
  namePath: string;
  /** Lista de conectores (2-5) com cascata completa */
  conectores: {
    tipo: string;
    role: string;
    specification: string;
    explanation?: string;
    observation?: string;
    accessibleName?: string;
    codeNote?: string;
  }[];
}

/** Entrada de ordem de foco para tabulação. */
interface FocusOrderEntry {
  /** ID do nó no Figma */
  nodeId: string;
  /** Posição na ordem de foco */
  order: number;
  /** Categoria de acessibilidade do elemento */
  category: string;
  /** Nome acessível personalizado */
  accessibleName?: string;
  /** Texto alternativo */
  altText?: string;
  /** Nível de título (1-6) */
  headingLevel?: number;
}

/** Zona de layer para renderização no preview interativo. */
interface LayerZone {
  /** ID do nó no Figma */
  id: string;
  /** Nome do layer */
  name: string;
  /** Tipo do nó (ex.: 'FRAME', 'TEXT') */
  type: string;
  /** Coordenada X relativa ao componente raiz */
  x: number;
  /** Coordenada Y relativa ao componente raiz */
  y: number;
  /** Largura do layer */
  width: number;
  /** Altura do layer */
  height: number;
  /** Profundidade na hierarquia de layers */
  depth: number;
  /** Se possui dados de acessibilidade associados */
  hasA11yData: boolean;
  /** Categoria de acessibilidade atribuída */
  category: string;
  /** ID do nó pai */
  parentId: string;
  /** Se o layer possui filhos */
  hasChildren: boolean;
}

/** Informações de um conector de acessibilidade encontrado no arquivo. */
interface ConnectorInfo {
  /** Chave do componente no Figma */
  componentKey: string;
  /** Nome do componente conector */
  componentName: string;
  /** Categoria de acessibilidade inferida */
  category: string;
}

/** Manifesto compartilhado de acessibilidade publicado via sharedPluginData. */
interface SharedA11yManifest {
  /** Versão do schema do manifesto */
  version: number;
  /** Data/hora ISO da última revisão */
  reviewedAt: string;
  /** Metadados do componente */
  component: {
    name: string;
    platforms: string[];
    zoom: string[];
    noTab: boolean;
    noScreenReader?: boolean;
    noTouch?: boolean;
    kbMapping?: 'none' | string[];
    gestureMapping?: 'none' | string[];
  };
  /** Mapa de dados por layer, indexado por namePath */
  layers: Record<string, LayerA11yData>;
  /** Lista de retângulos de áreas de toque */
  touchAreas: { x: number; y: number; width: number; height: number }[];
  /** Lista ordenada de foco, usando namePath como identificador estável */
  focusOrder: { namePath: string; order: number; category: string; accessibleName?: string; altText?: string; headingLevel?: number }[];
  /** Agrupamentos de acessibilidade */
  agrupamentos?: AgrupamentoRect[];
  /** Conectores combinados */
  combinados?: CombinadoEntry[];
}

/** Entrada unificada de anotação de leitor de tela. */
interface UnifiedAnnotationEntry {
  /** Identificador único */
  id: string;
  /** Tipo da anotação: simples (layer individual), combinado (layer com vários conectores) ou agrupamento (retângulo desenhado) */
  type: 'simples' | 'combinado' | 'agrupamento';
  /** Ordem de criação (timestamp) para ordenação na lista unificada */
  order: number;
  /** Caminho do layer (namePath) para tipos 'simples' e 'combinado' */
  namePath?: string;
  /** Dados de acessibilidade para o layer (tipo 'simples') */
  layerData?: LayerA11yData;
  /** Conectores combinados (tipo 'combinado') */
  conectores?: {
    tipo: string;
    role: string;
    specification: string;
    explanation?: string;
    observation?: string;
    accessibleName?: string;
    codeNote?: string;
  }[];
  /** Retângulo do agrupamento (tipo 'agrupamento') */
  rect?: { x: number; y: number; width: number; height: number };
  /** Tipo do agrupamento (tipo 'agrupamento', ex.: 'Função, Valor, Rótulos') */
  agrupTipo?: string;
  /** Letra identificadora (A, B, C...) — opcional, computado em runtime */
  letra?: string;
  /** Campos do agrupamento vindos do CSV */
  role?: string;
  specification?: string;
  explanation?: string;
  observation?: string;
  accessibleName?: string;
  codeNote?: string;
}

/** Configuração de uma variante parametrizada pelo usuário. */
interface VariantConfig {
  /** Identificador único da config (ex: 'vc-1716000000000') */
  id: string;
  /** Nome dado pelo usuário */
  label: string;
  /** nodeId da instância temporária criada no canvas */
  instanceNodeId: string;
  /** Propriedades aplicadas à instância (chave = nome da prop, valor = valor escolhido) */
  properties: Record<string, any>;
  /** Step (tab) onde esta variante foi criada (2=SR, 3=Toque, 4=Tabulação) */
  step: number;
}

// ════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════

const SHARED_NS = 'dsc.a11y';

// Chaves de PluginData
const KEY_COMPONENT = 'a11y-component';
const KEY_SR_UNIFIED = 'a11y-sr-unified::';
const KEY_DATA_VERSION = 'a11y-data-version';
const KEY_VARIANT_CONFIGS = 'a11y-variant-configs';

const CATEGORY_LABELS: Record<string, string> = {
  'funcao-valor': 'Função e valor',
  'estrutural': 'Elementos estruturais',
  'titulo': 'Nível de título / título',
  'nome-acessivel': 'Nome acessível e texto alternativo',
  'decorativo': 'Decorativo',
  'outros': 'Outros',
};

const PLATFORM_LABELS: Record<string, string> = {
  'mobile-crossplatform': 'Mobile Cross-platform',
  'mobile-android': 'Mobile Android',
  'mobile-ios': 'Mobile iOS',
  'web': 'Web',
  'desktop-nativo': 'Desktop Nativo',
};

const ZOOM_LABELS: Record<string, string> = {
  'resize-text': 'Redimensionar Texto (até 200%)',
  'reflow': 'Refluxo (até 400%)',
};

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════

/**
 * Faz parse seguro de JSON, retornando o fallback em caso de erro ou valor vazio.
 * @param raw - String JSON a ser parseada
 * @param fallback - Valor padrão caso o parse falhe
 * @returns Objeto parseado ou o fallback
 */
function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_e) { return fallback; }
}

/**
 * Lê as áreas de toque brutas de um nó, priorizando dados da variante específica.
 * @param node - Nó do qual ler os dados
 * @param variantName - Nome da variante (opcional)
 * @returns Lista de retângulos de áreas de toque
 */
function readTouchAreasRaw(node: SceneNode, variantName?: string): TouchAreaRect[] {
  let raw = '';
  if (variantName) raw = node.getPluginData('a11y-touch-areas::' + variantName);
  if (!raw) raw = node.getPluginData('a11y-touch-areas::');
  if (!raw) raw = node.getPluginData('a11y-touch-areas');
  return safeParseJson<TouchAreaRect[]>(raw, []);
}

/**
 * Lê a ordem de foco bruta de um nó, priorizando dados da variante específica.
 * @param node - Nó do qual ler os dados
 * @param variantName - Nome da variante (opcional)
 * @returns Lista de entradas de ordem de foco
 */
function readFocusOrderRaw(node: SceneNode, variantName?: string): FocusOrderEntry[] {
  let raw = '';
  if (variantName) raw = node.getPluginData('a11y-focus-order::' + variantName);
  if (!raw) raw = node.getPluginData('a11y-focus-order');
  return safeParseJson<FocusOrderEntry[]>(raw, []);
}

/**
 * Lê as anotações unificadas brutas de um nó, priorizando dados da variante específica.
 * @param node - Nó do qual ler os dados
 * @param variantName - Nome da variante (opcional)
 * @returns Lista de entradas unificadas
 */
function readUnifiedAnnotationsRaw(node: SceneNode, variantName?: string): UnifiedAnnotationEntry[] {
  const key = variantName ? KEY_SR_UNIFIED + variantName : KEY_SR_UNIFIED;
  const raw = node.getPluginData(key);
  return safeParseJson<UnifiedAnnotationEntry[]>(raw, []);
}

/**
 * Verifica se uma variante possui dados próprios (override independente do shared).
 */
function variantHasOwnData(node: SceneNode, variantName: string): boolean {
  return node.getPluginData(KEY_SR_UNIFIED + variantName) !== '';
}

/**
 * Salva as anotações unificadas em um nó.
 * @param node - Nó no qual salvar os dados
 * @param entries - Lista de entradas unificadas
 * @param variantName - Nome da variante (opcional)
 */
function saveUnifiedAnnotations(node: SceneNode, entries: UnifiedAnnotationEntry[], variantName?: string): void {
  const key = variantName ? KEY_SR_UNIFIED + variantName : KEY_SR_UNIFIED;
  node.setPluginData(key, JSON.stringify(entries));
}

/**
 * Envia todas as anotações unificadas para a UI, combinando dados compartilhados e de variante.
 * @param variantName - Nome da variante (opcional)
 * @param excOnly - Se true, envia apenas anotações específicas da variante
 */
async function sendUnifiedAnnotations(variantName?: string, excOnly?: boolean): Promise<void> {
  const root = await getCurrentRoot();
  if (!root) return;

  let entries: UnifiedAnnotationEntry[];
  let isVariantScope = false;

  if (variantName && variantHasOwnData(root, variantName)) {
    // Variante possui escopo próprio (independente do shared)
    entries = readUnifiedAnnotationsRaw(root, variantName);
    isVariantScope = true;
  } else {
    // Sem variante ou variante ainda não tem override — usa dados compartilhados
    entries = readUnifiedAnnotationsRaw(root);
    isVariantScope = false;
  }

  // Ordena por ordem de criação
  entries.sort((a, b) => a.order - b.order);

  figma.ui.postMessage({
    type: 'unified-annotations',
    entries: entries.map(e => ({ ...e, scope: isVariantScope ? 'variant' : 'shared' }))
  });
}

/**
 * Migra dados das estruturas antigas (a11y-layers, a11y-agrupamentos, a11y-combinados)
 * para a nova estrutura unificada (a11y-sr-unified::).
 */
async function migrateToUnifiedAnnotations(): Promise<void> {
  const root = await getCurrentRoot();
  if (!root || !('getPluginData' in root)) return;

  const version = root.getPluginData(KEY_DATA_VERSION);
  if (version === '2') return; // Já migrado

  // Verifica se há dados antigos para migrar
  const hasOldData = root.getPluginData('a11y-layers') || 
                     root.getPluginData('a11y-agrupamentos::') || 
                     root.getPluginData('a11y-combinados::');
  
  if (!hasOldData) {
    // Se não há dados antigos, apenas marca como versão 2
    root.setPluginData(KEY_DATA_VERSION, '2');
    return;
  }

  const variantNames = root.type === 'COMPONENT_SET' 
    ? (root as ComponentSetNode).children.filter(c => c.type === 'COMPONENT').map(c => c.name) 
    : [];
  
  const scopes = ['', ...variantNames];

  for (const scope of scopes) {
    // Se já existe dado unificado nesse escopo, pula
    if (root.getPluginData(KEY_SR_UNIFIED + scope)) continue;

    const unified: UnifiedAnnotationEntry[] = [];
    
    // 1. Layers (Simples)
    const layersKey = scope ? 'a11y-layers::' + scope : 'a11y-layers';
    const layersRaw = root.getPluginData(layersKey);
    const layersMap = safeParseJson<Record<string, LayerA11yData>>(layersRaw, {});

    // 2. Combinados
    const combinadosKey = scope ? 'a11y-combinados::' + scope : 'a11y-combinados::';
    const combinadosRaw = root.getPluginData(combinadosKey);
    const combinadosList = safeParseJson<CombinadoEntry[]>(combinadosRaw, []);

    // 3. Agrupamentos
    const agrupamentosKey = scope ? 'a11y-agrupamentos::' + scope : 'a11y-agrupamentos::';
    const agrupamentosRaw = root.getPluginData(agrupamentosKey);
    const agrupamentosList = safeParseJson<AgrupamentoRect[]>(agrupamentosRaw, []);

    // Converter layers e combinados
    for (const [namePath, data] of Object.entries(layersMap)) {
      const combinado = combinadosList.find(c => c.namePath === namePath);
      if (combinado) {
        unified.push({
          id: 'mig-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          type: 'combinado',
          order: data.order || Date.now(),
          namePath,
          conectores: combinado.conectores
        });
      } else {
        unified.push({
          id: 'mig-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          type: 'simples',
          order: data.order || Date.now(),
          namePath,
          layerData: data
        });
      }
    }

    // Converter agrupamentos
    for (const agrup of agrupamentosList) {
      unified.push({
        id: 'mig-agrup-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        type: 'agrupamento',
        order: agrup.order || Date.now(),
        rect: { x: agrup.x, y: agrup.y, width: agrup.width, height: agrup.height },
        agrupTipo: agrup.tipo,
        letra: agrup.letra,
        role: agrup.role,
        specification: agrup.specification,
        explanation: agrup.explanation,
        observation: agrup.observation,
        accessibleName: agrup.accessibleName,
        codeNote: agrup.codeNote
      });
    }

    if (unified.length > 0) {
      // Ordena por order (timestamp) para garantir consistência
      unified.sort((a, b) => a.order - b.order);
      saveUnifiedAnnotations(root as SceneNode, unified, scope);
    }
  }

  root.setPluginData(KEY_DATA_VERSION, '2');
}

/**
 * Salva ou atualiza uma entrada na lista unificada.
 * @param entry - Dados da entrada a salvar
 * @param variantName - Nome da variante (opcional)
 * @param applyToAll - Se true, salva no escopo compartilhado
 */
async function setUnifiedEntry(entry: UnifiedAnnotationEntry, variantName?: string, applyToAll: boolean = true): Promise<void> {
  const root = await getCurrentRoot();
  if (!root) return;

  const scope = (applyToAll || !variantName) ? '' : variantName;
  const entries = readUnifiedAnnotationsRaw(root, scope);

  // Busca se já existe uma entrada para o mesmo layer (simples/combinado) ou com mesmo ID
  let existingIdx = -1;
  if (entry.type !== 'agrupamento' && entry.namePath) {
    existingIdx = entries.findIndex(e => e.type !== 'agrupamento' && e.namePath === entry.namePath);
  } else {
    existingIdx = entries.findIndex(e => e.id === entry.id);
  }

  const now = Date.now();
  if (existingIdx >= 0) {
    const originalOrder = entries[existingIdx].order;
    entries[existingIdx] = { ...entry, order: entry.order || originalOrder };
  } else {
    entries.push({ ...entry, id: entry.id || ('u-' + now), order: entry.order || now });
  }

  saveUnifiedAnnotations(root, entries, scope);

  // Se salvou no compartilhado, remove de todas as variantes para evitar duplicidade
  if (scope === '' && entry.namePath) {
    const variantNames = root.type === 'COMPONENT_SET' 
      ? (root as ComponentSetNode).children.filter(c => c.type === 'COMPONENT').map(c => c.name) 
      : [];
    for (const vn of variantNames) {
      const vEntries = readUnifiedAnnotationsRaw(root, vn);
      const filtered = vEntries.filter(e => e.namePath !== entry.namePath);
      if (filtered.length !== vEntries.length) {
        saveUnifiedAnnotations(root, filtered, vn);
      }
    }
  }

  // Dual-write: também salva no formato antigo para retrocompatibilidade durante a transição
  if (entry.type === 'simples' && entry.layerData && entry.namePath) {
    await setLayerDataByPath(entry.namePath, entry.layerData, variantName, applyToAll);
  }

  await refreshZones();
  await sendUnifiedAnnotations(variantName);
}

/**
 * Helper para setLayerData usando namePath.
 */
async function setLayerDataByPath(namePath: string, data: LayerA11yData, variantName?: string, applyToAll: boolean = true): Promise<void> {
  const root = await getCurrentRoot();
  if (!root) return;
  const key = (applyToAll || !variantName) ? 'a11y-layers' : 'a11y-layers::' + variantName;
  const raw = root.getPluginData(key);
  const map = safeParseJson<Record<string, LayerA11yData>>(raw, {});
  map[namePath] = data;
  root.setPluginData(key, JSON.stringify(map));
  
  if (applyToAll) {
    const variantNames = root.type === 'COMPONENT_SET' ? (root as ComponentSetNode).children.filter(c => c.type === 'COMPONENT').map(c => c.name) : [];
    for (const vn of variantNames) {
      const vKey = 'a11y-layers::' + vn;
      const vRaw = root.getPluginData(vKey);
      const vMap = safeParseJson<Record<string, LayerA11yData>>(vRaw, {});
      if (vMap[namePath]) {
        delete vMap[namePath];
        root.setPluginData(vKey, JSON.stringify(vMap));
      }
    }
  }
}

/**
 * Remove uma entrada da lista unificada.
 */
async function removeUnifiedEntry(id: string, namePath?: string, variantName?: string, applyToAll: boolean = true): Promise<void> {
  const root = await getCurrentRoot();
  if (!root) return;

  const matchFn = (e: UnifiedAnnotationEntry) => namePath ? e.namePath !== namePath : e.id !== id;

  if (applyToAll || !variantName) {
    // Remove apenas do escopo compartilhado — cada variante é independente
    const sharedEntries = readUnifiedAnnotationsRaw(root);
    const filteredShared = sharedEntries.filter(matchFn);
    if (filteredShared.length !== sharedEntries.length) saveUnifiedAnnotations(root, filteredShared);
  } else {
    // Remove apenas do escopo desta variante
    const vEntries = readUnifiedAnnotationsRaw(root, variantName);
    const vFiltered = vEntries.filter(matchFn);
    if (vFiltered.length !== vEntries.length) saveUnifiedAnnotations(root, vFiltered, variantName);
  }

  await refreshZones();
  await sendUnifiedAnnotations(variantName);
}

/**
 * Obtém o nó raiz atual do componente selecionado.
 * @returns Nó raiz ou null se não houver seleção válida
 */
async function getCurrentRoot(): Promise<SceneNode | null> {
  if (!currentRootId) return null;
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('setPluginData' in node)) return null;
  return node as SceneNode;
}

// ════════════════════════════════════════
// INICIALIZAÇÃO
// ════════════════════════════════════════

figma.showUI(__html__, { width: 520, height: 760, themeColors: true });

let currentRootId: string | null = null;
let workingNodeId: string | null = null;
let tempInstanceId: string | null = null;
/** IDs de instâncias temporárias colocadas fora do canvas (x ≤ -99000) para remoção explícita. */
const _orphanInstanceIds = new Set<string>();
let connectorMap: ConnectorInfo[] = [];
let templateNodeId: string | null = null; // picked template for handoff via template
/** Modo de escuta ativo: plugin já tem template e aceita seleções no canvas */
let listeningMode = false;
/** Step atual da UI (informado pela UI para contexto de seleção no canvas) */
let uiCurrentStep = 1;

// ── Dados CSV carregados do template (camada "plugin data") ──
// Cache for SR connector component sets — avoids repeated getMainComponentAsync (3+ sec per call)
let _cachedConnectorCompSet: ComponentSetNode | null = null;
let _cachedCombingadoCompSet: ComponentSetNode | null = null;
let _cachedAgrupamentoCompSet: ComponentSetNode | null = null;
/** Call this when the template changes so component set refs are re-resolved. */
function invalidateSRComponentSetCache() {
  _cachedConnectorCompSet = null;
  _cachedCombingadoCompSet = null;
  _cachedAgrupamentoCompSet = null;
}

let cachedKbData: { keys: string; action: string }[] = [];
let cachedGestureData: { gesture: string; action: string }[] = [];
let cachedRolesData: {
  role: string; specification: string; description: string; observation: string;
  codeNote: string;       // compat: preenchido com web || rn || ''
  codeNoteWeb: string;
  codeNoteRN: string;
  accessibleName: string; connectorType: string; revision: string;
}[] = [];

function resolveCodeNote(
  entry: { role?: string; specification?: string; codeNote?: string },
  platform: string[]
): string {
  const cached = cachedRolesData.find(
    r => r.role === (entry.role || '').toLowerCase() &&
         r.specification === (entry.specification || '')
  );
  const webNote = cached?.codeNoteWeb || '';
  const rnNote  = cached?.codeNoteRN  || '';

  // Sem dados por plataforma → fallback ao armazenado
  if (!webNote && !rnNote) return entry.codeNote || '';

  const hasWeb    = platform.some(p => p === 'web' || p === 'desktop-nativo');
  const hasMobile = platform.some(p => p === 'mobile-crossplatform');

  if (hasWeb && hasMobile && webNote && rnNote && webNote !== rnNote) {
    return `Web: ${webNote}\nReact Native: ${rnNote}`;
  }
  if (hasWeb && webNote)   return webNote;
  if (hasMobile && rnNote) return rnNote;
  // Fallback: retorna o que estiver disponível
  return webNote || rnNote || entry.codeNote || '';
}

// ════════════════════════════════════════
// SELEÇÃO
// ════════════════════════════════════════

const isTemplateName = (n: SceneNode) => n.name.toLowerCase().includes('[dsc-h] template');
const isHandoffName = (n: SceneNode) => n.name.startsWith('[A11Y Handoff]');

/**
 * Verifica se o nó é uma seleção válida (componente, component set ou instância).
 * @param node - Nó a ser verificado
 * @returns true se o tipo do nó é válido para o plugin
 */
function isValidSelection(node: SceneNode): boolean {
  return node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE';
}

/**
 * Verifica se um nó é descendente (direto ou via instância) do root atual.
 * Sobe na hierarquia de parents verificando se algum ancestral tem o rootId,
 * ou se alguma INSTANCE ancestral resolve para um component dentro do root.
 */
async function isNodeDescendantOfRoot(node: SceneNode, rootId: string): Promise<boolean> {
  let cur: BaseNode | null = node;
  while (cur) {
    if (cur.id === rootId) return true;
    if (cur.type === 'COMPONENT' && cur.parent?.id === rootId) return true;
    if (cur.type === 'INSTANCE') {
      try {
        const mc = await (cur as InstanceNode).getMainComponentAsync();
        if (mc) {
          if (mc.id === rootId) return true;
          if (mc.parent?.id === rootId) return true;
          if (mc.parent?.type === 'COMPONENT_SET' && mc.parent.id === rootId) return true;
        }
      } catch (_) { /* continue */ }
    }
    if (cur.type === 'PAGE' || cur.type === 'DOCUMENT') break;
    cur = cur.parent;
  }
  return false;
}

/**
 * Dado um nó qualquer, resolve o componente raiz (COMPONENT_SET ou COMPONENT standalone)
 * subindo na hierarquia de pais. Retorna também o nome da variante se aplicável.
 */
async function resolveComponentRoot(node: SceneNode): Promise<{
  root: SceneNode;
  variantName: string;
} | null> {
  let cur: BaseNode | null = node;

  // Se é um nó dentro de uma instância, resolver para o main component
  if (node.type === 'INSTANCE') {
    try {
      const mc = await (node as InstanceNode).getMainComponentAsync();
      if (mc) {
        if (mc.parent?.type === 'COMPONENT_SET') {
          return { root: mc.parent as SceneNode, variantName: mc.name };
        }
        return { root: mc as SceneNode, variantName: '' };
      }
    } catch (_) { /* fall through */ }
  }

  while (cur) {
    if (cur.type === 'PAGE' || cur.type === 'DOCUMENT') break;

    if (cur.type === 'COMPONENT_SET') {
      return { root: cur as SceneNode, variantName: '' };
    }

    if (cur.type === 'COMPONENT') {
      if (cur.parent?.type === 'COMPONENT_SET') {
        return { root: cur.parent as SceneNode, variantName: cur.name };
      }
      return { root: cur as SceneNode, variantName: '' };
    }

    // Se estamos dentro de uma INSTANCE, resolver para o main component
    if (cur.type === 'INSTANCE') {
      try {
        const mc = await (cur as InstanceNode).getMainComponentAsync();
        if (mc) {
          if (mc.parent?.type === 'COMPONENT_SET') {
            return { root: mc.parent as SceneNode, variantName: mc.name };
          }
          return { root: mc as SceneNode, variantName: '' };
        }
      } catch (_) { /* fall through */ }
    }

    cur = cur.parent;
  }
  return null;
}

/**
 * Para um nó selecionado no canvas (possivelmente dentro de uma instância),
 * resolve o namePath relativo ao componente raiz.
 */
function buildCanvasNamePath(node: SceneNode, rootId: string): string {
  const parts: string[] = [];
  let cur: BaseNode | null = node;
  while (cur && cur.id !== rootId) {
    // Parar se chegamos num COMPONENT_SET ou COMPONENT (que é o root)
    if (cur.type === 'COMPONENT_SET') break;
    if (cur.type === 'COMPONENT' && cur.parent?.type === 'COMPONENT_SET' && cur.parent.id === rootId) break;
    if (cur.type === 'COMPONENT' && cur.id === rootId) break;
    parts.unshift(cur.name);
    cur = cur.parent;
    // Se o parent é uma instância cujo main component é descendente do root, seguir
  }
  return parts.join('/');
}

/**
 * Envia dados do componente raiz para a UI (usado tanto na seleção de 2 nós quanto na auto-detecção).
 */
async function sendComponentData(root: SceneNode, initialVariantId?: string | null, keepStep: boolean = false): Promise<void> {
  const compRaw = root.getPluginData('a11y-component');
  const compData = safeParseJson<ComponentA11yData | null>(compRaw, null);

  let variants: { id: string; name: string; width: number; height: number }[] = [];
  if (root.type === 'COMPONENT_SET') {
    const cs = root as ComponentSetNode;
    for (const child of cs.children) {
      if (child.type === 'COMPONENT') {
        variants.push({ id: child.id, name: child.name, width: Math.round(child.width), height: Math.round(child.height) });
      }
    }
  }

  let selectedVariantIds: string[] = variants.map(v => v.id);
  if (root.type === 'COMPONENT_SET') {
    const selRaw = (root as SceneNode).getPluginData('a11y-selected-variants');
    if (selRaw) {
      try {
        const saved: string[] = JSON.parse(selRaw);
        const validIds = new Set(variants.map(v => v.id));
        const filtered = saved.filter(id => validIds.has(id));
        if (filtered.length > 0) selectedVariantIds = filtered;
      } catch (_e) { /* ignore */ }
    }
  }

  const excNamesRaw = root.getPluginData('a11y-exc-names');
  const excNamesData = safeParseJson<Record<string, Record<string, string>> | null>(excNamesRaw, null);
  const existingHandoff = await findExistingHandoff(root);

  // Property definitions para o formulário de variantes parametrizadas
  let propertyDefs: Record<string, any> = {};
  if (root.type === 'COMPONENT_SET') {
    propertyDefs = (root as ComponentSetNode).componentPropertyDefinitions || {};
  } else if (root.type === 'COMPONENT') {
    propertyDefs = (root as ComponentNode).componentPropertyDefinitions || {};
  }

  // Variant configs parametrizadas pelo usuário
  // Recriar instâncias cujo nodeId não existe mais (plugin foi fechado e deletou as instâncias)
  let variantConfigs = readVariantConfigs(root as SceneNode);
  let configsChanged = false;
  for (const config of variantConfigs) {
    const existing = await figma.getNodeByIdAsync(config.instanceNodeId);
    if (!existing) {
      // Recriar instância
      let componentBase: ComponentNode | null = null;
      if (root.type === 'COMPONENT_SET') {
        componentBase = (root as ComponentSetNode).children.find(c => c.type === 'COMPONENT') as ComponentNode || null;
      } else if (root.type === 'COMPONENT') {
        componentBase = root as ComponentNode;
      }
      if (componentBase) {
        const instance = componentBase.createInstance();
        if (config.properties && Object.keys(config.properties).length > 0) {
          try { instance.setProperties(config.properties); } catch (_e) { /* ignore */ }
        }
        // Encontrar ou recriar frame [A11Y Variantes]
        const page = figma.currentPage;
        let varFrame = page.children.find(n => n.name === '[A11Y Variantes]') as FrameNode | undefined;
        if (!varFrame) {
          varFrame = figma.createFrame();
          varFrame.name = '[A11Y Variantes]';
          varFrame.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.98 } }];
          varFrame.clipsContent = false;
          varFrame.resize(400, 200);
          const refId = templateNodeId || root.id;
          const refNode = await figma.getNodeByIdAsync(refId);
          const ref = refNode as SceneNode;
          if (ref && 'absoluteBoundingBox' in ref && ref.absoluteBoundingBox) {
            varFrame.x = ref.absoluteBoundingBox.x - varFrame.width - 80;
            varFrame.y = ref.absoluteBoundingBox.y;
          }
          page.appendChild(varFrame);
        }
        const existingChildren = varFrame.children;
        const lastBottom = existingChildren.reduce((acc, c) => {
          return Math.max(acc, (c as SceneNode & { y: number; height: number }).y + (c as SceneNode & { y: number; height: number }).height);
        }, 20);
        varFrame.appendChild(instance);
        instance.x = 20;
        instance.y = lastBottom + (existingChildren.length > 0 ? 20 : 0);
        const neededW = Math.max(varFrame.width, instance.x + instance.width + 20);
        const neededH = instance.y + instance.height + 20;
        varFrame.resize(neededW, neededH);
        config.instanceNodeId = instance.id;
        configsChanged = true;
      }
    }
  }
  if (configsChanged) saveVariantConfigs(root as SceneNode, variantConfigs);

  await migrateToUnifiedAnnotations();

  figma.ui.postMessage({
    type: 'selection-changed',
    valid: true,
    rootName: root.name,
    rootId: root.id,
    rootType: root.type,
    componentData: compData,
    variants,
    selectedVariantIds,
    templateNodeId: templateNodeId || null,
    excNames: excNamesData,
    exceptionCustomNames: excNamesData,
    handoffExists: !!existingHandoff,
    initialVariantId: initialVariantId || null,
    keepStep,
    propertyDefs,
    variantConfigs,
  });

  if (compRaw) {
    const hasManifest = root.type === 'COMPONENT_SET'
      ? !!root.getSharedPluginData(SHARED_NS, 'a11y-index')
      : !!root.getSharedPluginData(SHARED_NS, 'a11y-manifest');
    if (!hasManifest) {
      publishSharedA11yData().catch(() => {});
    }
  }
}

/**
 * Lida com a seleção de um layer no canvas quando o plugin está em modo de escuta.
 * Envia dados do layer para a UI sem gerar preview.
 */
async function handleCanvasLayerSelection(node: SceneNode): Promise<void> {
  if (!currentRootId) return;

  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return;

  // NÃO chamar resolveComponentRoot aqui — o root já foi validado pelo caller.
  // Se chamássemos, ícones (instâncias de outros componentes) trocariam o root.

  let variantName = '';

  // ── Construir namePath ──
  // Subir na hierarquia de parents até encontrar o currentRootId,
  // um COMPONENT filho direto do root, ou uma INSTANCE que resolve para o root.
  const parts: string[] = [];
  let cur: BaseNode | null = node;
  while (cur) {
    // Parar se chegamos no root
    if (cur.id === currentRootId) break;
    // Parar se é um COMPONENT direto do COMPONENT_SET root
    if (cur.type === 'COMPONENT' && cur.parent?.id === currentRootId) {
      if (!variantName) variantName = cur.name;
      break;
    }
    // Parar se é uma INSTANCE cujo main component pertence ao root
    if (cur.type === 'INSTANCE') {
      try {
        const mc = await (cur as InstanceNode).getMainComponentAsync();
        if (mc) {
          if (mc.parent?.type === 'COMPONENT_SET' && mc.parent.id === currentRootId) {
            if (!variantName) variantName = mc.name;
            break;
          }
          if (mc.id === currentRootId) break;
        }
      } catch (_) { /* continue */ }
    }
    parts.unshift(cur.name);
    if (cur.type === 'PAGE' || cur.type === 'DOCUMENT') break;
    cur = cur.parent;
  }
  const namePath = parts.join('/');

  // Ler os bounds relativos ao container visual mais próximo (instância ou root)
  const nodeBounds = node.absoluteBoundingBox;
  let refBounds = (rootNode as SceneNode).absoluteBoundingBox;
  // Buscar a instância ancestral mais próxima do root para bounds relativas
  let instParent: BaseNode | null = node;
  while (instParent && instParent.id !== currentRootId) {
    if (instParent.type === 'INSTANCE') {
      try {
        const mc = await (instParent as InstanceNode).getMainComponentAsync();
        if (mc && (mc.parent?.id === currentRootId || mc.id === currentRootId)) {
          const ib = (instParent as SceneNode).absoluteBoundingBox;
          if (ib) refBounds = ib;
          break;
        }
      } catch (_) { /* continue */ }
    }
    instParent = instParent.parent;
  }

  let relativeBounds: { x: number; y: number; width: number; height: number } | null = null;
  if (nodeBounds && refBounds) {
    relativeBounds = {
      x: nodeBounds.x - refBounds.x,
      y: nodeBounds.y - refBounds.y,
      width: nodeBounds.width,
      height: nodeBounds.height,
    };
  }

  // Ler dados de anotação existentes
  let layerData: LayerA11yData | null = null;
  let scope: 'all' | 'variant' = 'all';

  if (variantName) {
    const variantMap = await getConsolidatedMap(variantName);
    if (variantMap[namePath]) {
      layerData = variantMap[namePath];
      scope = 'variant';
    }
  }
  if (!layerData) {
    const sharedMap = await getConsolidatedMap();
    layerData = sharedMap[namePath] || null;
  }

  figma.ui.postMessage({
    type: 'canvas-layer-selected',
    nodeId: node.id,
    name: node.name,
    namePath,
    variantName,
    relativeBounds,
    data: layerData,
    scope,
    rootId: currentRootId,
  });
}

/**
 * Remove a instância temporária criada para preview de variantes.
 */
async function cleanupTempInstance(): Promise<void> {
  if (tempInstanceId) {
    try {
      const old = await figma.getNodeByIdAsync(tempInstanceId);
      if (old && 'remove' in old) (old as SceneNode).remove();
    } catch (_e) { /* ignore */ }
    _orphanInstanceIds.delete(tempInstanceId);
    tempInstanceId = null;
    workingNodeId = null;
  }
  // Remove explicitly tracked orphaned instances (avoids scanning all children of the page)
  for (const id of [..._orphanInstanceIds]) {
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (node && 'remove' in node) (node as SceneNode).remove();
    } catch (_e) { /* ignore */ }
  }
  _orphanInstanceIds.clear();
}

// ════════════════════════════════════════
// CARREGAMENTO DE DADOS DO TEMPLATE
// ════════════════════════════════════════

/**
 * Extrai texto de cada "coluna" de um frame-row.
 * Para cada filho direto: se for TEXT, pega o texto; se for container, pega o primeiro TEXT recursivo.
 * Isso funciona tanto para rows com TEXT diretos quanto para rows com cells (Frame > TEXT).
 */
function getTextChildren(frame: SceneNode & ChildrenMixin): string[] {
  const texts: string[] = [];
  for (const child of frame.children) {
    if (child.type === 'TEXT') {
      texts.push((child as TextNode).characters?.trim() || '');
    } else if ('children' in child) {
      const firstText = findFirstText(child as SceneNode & ChildrenMixin);
      if (firstText !== null) texts.push(firstText);
    }
  }
  return texts;
}

/** Busca recursiva pelo primeiro TEXT node em um container. */
function findFirstText(node: SceneNode & ChildrenMixin): string | null {
  for (const child of node.children) {
    if (child.type === 'TEXT') return (child as TextNode).characters?.trim() || '';
    if ('children' in child) {
      const found = findFirstText(child as SceneNode & ChildrenMixin);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Verifica recursivamente se existe algum TEXT node dentro do nó. */
function hasTextDescendant(node: SceneNode): boolean {
  if (node.type === 'TEXT') return true;
  if ('children' in node) {
    return (node as SceneNode & ChildrenMixin).children.some(c => hasTextDescendant(c));
  }
  return false;
}

/**
 * Verifica se um frame é uma linha de dados (contém TEXT nodes e não é apenas separador).
 */
function isDataRow(frame: SceneNode): frame is FrameNode {
  if (frame.type !== 'FRAME' && frame.type !== 'INSTANCE') return false;
  return hasTextDescendant(frame);
}

/**
 * Carrega dados CSV a partir da camada oculta "plugin data" no template.
 * Estrutura esperada:
 *   plugin data
 *   ├── Mapeamento de Teclado e Gestos do Plugin
 *   │   ├── Frame (header: Mapeamento, Descrição, Utilização)
 *   │   ├── Frame (separator)
 *   │   └── Row N (TEXT Mapeamento, TEXT Descrição, TEXT Utilização)
 *   └── Roles Plugin
 *       ├── Frame (header)
 *       ├── Frame (separator)
 *       └── Row N (TEXT Nome, TEXT Especificação, ...)
 */
/**
 * Função pura que recebe o frame "plugin data" e popula os caches de CSV.
 * Retorna contagens {kb, gesture, roles}.
 */
function parseCsvFromNode(pluginDataFrame: FrameNode | InstanceNode | ComponentNode): { kb: number; gesture: number; roles: number } {
  // ── Mapeamento de Teclado e Gestos ──
  type ChildFrame = FrameNode | InstanceNode | ComponentNode;
  let kbGestureFrame: ChildFrame | null = null;
  let rolesFrame: ChildFrame | null = null;

  for (const child of pluginDataFrame.children) {
    if (child.type !== 'FRAME' && child.type !== 'INSTANCE' && child.type !== 'COMPONENT') continue;
    const name = child.name.toLowerCase();
    if (name.includes('mapeamento') || name.includes('teclado') || name.includes('gestos')) {
      kbGestureFrame = child as ChildFrame;
    } else if (name.includes('roles') || name.includes('role')) {
      rolesFrame = child as ChildFrame;
    }
  }

  // Parse teclado/gestos
  if (kbGestureFrame) {
    const kb: { keys: string; action: string }[] = [];
    const gesture: { gesture: string; action: string }[] = [];
    let isFirstDataRow = true;

    for (const row of kbGestureFrame.children) {
      if (!isDataRow(row)) continue;
      const cells = getTextChildren(row);
      if (cells.length < 2) continue;

      // Pula header (primeira linha de dados com textos de cabeçalho)
      if (isFirstDataRow) {
        const first = cells[0].toLowerCase();
        if (first.includes('mapeamento') || first.includes('tecla') || first.includes('gesto')) {
          isFirstDataRow = false;
          continue;
        }
        isFirstDataRow = false;
      }

      const mapping = cells[0];
      const desc = cells[1];
      const use = (cells[2] || '').toLowerCase().trim();
      if (!mapping || !desc) continue;

      if (use.includes('gesto') || use.includes('gesture')) {
        gesture.push({ gesture: mapping, action: desc });
      } else {
        kb.push({ keys: mapping, action: desc });
      }
    }

    cachedKbData = kb;
    cachedGestureData = gesture;
  } else {
    cachedKbData = [];
    cachedGestureData = [];
  }

  // Parse roles
  if (rolesFrame) {
    const entries: typeof cachedRolesData = [];
    let isFirstDataRow = true;
    let headerCols: string[] = [];

    for (const row of rolesFrame.children) {
      if (!isDataRow(row)) continue;
      const cells = getTextChildren(row as FrameNode);
      if (cells.length < 2) continue;

      // Detecta header
      if (isFirstDataRow) {
        const first = cells[0].toLowerCase();
        if (first.includes('nome') || first.includes('role')) {
          headerCols = cells.map(c => c.toLowerCase());
          isFirstDataRow = false;
          continue;
        }
        isFirstDataRow = false;
      }

      // Mapeia colunas por header ou posição
      const col = (keywords: string[], fallback: number): string => {
        if (headerCols.length > 0) {
          const idx = headerCols.findIndex(h => keywords.some(k => h.includes(k)));
          if (idx >= 0 && idx < cells.length) return cells[idx];
        }
        return (cells[fallback] || '').trim();
      };

      const role = col(['nome'], 0).trim().toLowerCase();
      const specification = col(['especifica'], 1).trim();
      const description = col(['descri'], 2).trim();
      const observation = col(['observa'], 3).trim();
      const codeNoteWeb = col(['nota de código web', 'nota web', 'web'], 4).trim();
      const codeNoteRN  = col(['react native', 'react', 'nota de código react'], 5).trim();
      const codeNote    = codeNoteWeb || codeNoteRN; // compat
      const accessibleName = col(['nome acess'], 6).trim();
      const connectorType  = col(['conector', 'connector'], 7).trim();
      const revision       = col(['revis'], 8).trim();

      if (!role || !specification) continue;
      entries.push({ role, specification, description, observation, codeNote, codeNoteWeb, codeNoteRN, accessibleName, connectorType, revision });
    }

    cachedRolesData = entries;
  } else {
    cachedRolesData = [];
  }

  return { kb: cachedKbData.length, gesture: cachedGestureData.length, roles: cachedRolesData.length };
}

/**
 * Encontra o frame "plugin data" dentro de um nó com children.
 */
function findPluginDataFrame(parent: FrameNode | InstanceNode | ComponentNode): (FrameNode | InstanceNode | ComponentNode) | null {
  const isPluginData = (n: SceneNode) =>
    (n.type === 'FRAME' || n.type === 'INSTANCE' || n.type === 'COMPONENT') &&
    n.name.toLowerCase().includes('plugin data');

  // Primeiro nível
  for (const child of parent.children) {
    if (isPluginData(child)) return child as FrameNode | InstanceNode | ComponentNode;
  }
  // Busca recursiva
  return (parent as unknown as ChildrenMixin).findOne(isPluginData) as (FrameNode | InstanceNode | ComponentNode) | null;
}

/**
 * Persiste a associação template→componente no plugin data do componente.
 * Chamada sempre que ambos templateNodeId e currentRootId estão definidos.
 * Permite recuperar o template correto em sessões futuras ou se o templateNodeId
 * for alterado acidentalmente durante a sessão.
 */
async function persistTemplateAssociation(): Promise<void> {
  if (!templateNodeId || !currentRootId) return;
  try {
    const compNode = await figma.getNodeByIdAsync(currentRootId);
    if (compNode && 'setPluginData' in compNode) {
      (compNode as SceneNode).setPluginData('a11y-tpl-node-id', templateNodeId);
    }
  } catch (_) {
    // Componente pode ser de biblioteca externa — apenas ignorar
  }
}

/**
 * Tenta recuperar o templateNodeId a partir do plugin data do componente atual.
 * Usado como fallback quando templateNodeId está null (plugin reiniciado, etc.).
 */
async function recoverTemplateNodeId(): Promise<string | null> {
  if (!currentRootId) return null;
  try {
    const compNode = await figma.getNodeByIdAsync(currentRootId);
    if (!compNode || !('getPluginData' in compNode)) return null;
    const saved = (compNode as SceneNode).getPluginData('a11y-tpl-node-id');
    if (!saved) return null;
    // Validar que o nó ainda existe no arquivo
    const tplNode = await figma.getNodeByIdAsync(saved);
    return (tplNode && !tplNode.removed) ? saved : null;
  } catch (_) {
    return null;
  }
}

async function loadCsvFromTemplate(tplNodeId: string): Promise<void> {
  const tplNode = await figma.getNodeByIdAsync(tplNodeId);
  if (!tplNode || !('children' in tplNode)) return;

  const pluginDataFrame = findPluginDataFrame(tplNode as FrameNode);
  if (!pluginDataFrame) return;

  parseCsvFromNode(pluginDataFrame);
}

/**
 * Recarrega dados CSV da versão publicada da library (via importComponentByKeyAsync).
 * Retorna contagens ou lança erro.
 */
async function reloadCsvFromLibrary(): Promise<{ kb: number; gesture: number; roles: number }> {
  // Objetivo: recarregar dados do template usando a versão mais recente.
  //
  // O "plugin data" é um componente publicado na library. A instância dele
  // permanece como INSTANCE mesmo após o detach do template (handoff).
  // Quando o arquivo aceita library updates, essa instância reflete os dados novos.
  //
  // Prioridade:
  // 1. templateNodeId (handoff/instância) → contém instância atualizada do plugin data
  // 2. Buscar instância do template em qualquer página
  // 3. Importar pela key da library (fallback)

  // 1. Ler do templateNodeId (handoff detachado ou instância selecionada)
  if (templateNodeId) {
    const tplNode = await figma.getNodeByIdAsync(templateNodeId);
    if (tplNode && 'children' in tplNode) {
      const pdf = findPluginDataFrame(tplNode as FrameNode);
      if (pdf) return parseCsvFromNode(pdf);
    }
  }

  // 2. Buscar instância do template na página atual
  const tplInst = figma.currentPage.findOne(
    (n: SceneNode) => n.type === 'INSTANCE' && n.name.toLowerCase().includes('[dsc-h] template')
  ) as InstanceNode | null;
  if (tplInst) {
    const pdf = findPluginDataFrame(tplInst);
    if (pdf) return parseCsvFromNode(pdf);
  }

  // 3. Fallback: importar pela key da library
  let tplKey: string | null = null;
  if (templateNodeId) {
    const tplNode = await figma.getNodeByIdAsync(templateNodeId);
    if (tplNode && 'getPluginData' in tplNode) {
      tplKey = (tplNode as SceneNode).getPluginData('a11y-handoff-tpl-key') || null;
    }
  }
  if (!tplKey && currentRootId) {
    const rootNode = await figma.getNodeByIdAsync(currentRootId);
    if (rootNode) {
      tplKey = (rootNode as SceneNode).getPluginData('a11y-handoff-tpl-key') || null;
    }
  }

  if (tplKey) {
    try {
      const importedComponent = await figma.importComponentByKeyAsync(tplKey);
      const tempInstance = importedComponent.createInstance();
      try {
        const pdf = findPluginDataFrame(tempInstance);
        if (pdf) return parseCsvFromNode(pdf);
      } finally {
        tempInstance.remove();
      }
    } catch (_e) { /* key inválida ou não publicada */ }
  }

  throw new Error('Template não encontrado. Aceite as atualizações da library e tente novamente.');
}

/**
 * Manipula mudanças de seleção no canvas.
 * Modos:
 * - 1 nó template/handoff → inicializa o plugin (modo escuta)
 * - 1 nó dentro de um componente (modo escuta ativo) → envia dados do layer para a UI
 * - 2 nós (template + componente) → fluxo legado completo
 * - 0 ou >2 nós → mantém estado se em modo escuta, senão invalida
 */
async function handleSelectionChange(): Promise<void> {
  const selection = figma.currentPage.selection;

  // Ignorar seleção da instância temporária (legado)
  if (selection.length === 1 && tempInstanceId && selection[0].id === tempInstanceId) return;

  // ── Seleção vazia: manter estado em modo escuta ──
  if (selection.length === 0) {
    if (!listeningMode) {
      currentRootId = null;
      workingNodeId = null;
      templateNodeId = null;
      figma.ui.postMessage({ type: 'selection-changed', valid: false });
    }
    return;
  }

  // ── Seleção de 1 nó ──
  if (selection.length === 1) {
    const node = selection[0];

    // Caso A: Template selecionado → inicializar modo escuta
    if (isTemplateName(node) || isHandoffName(node)) {
      // Se é handoff, resolver para source component
      if (isHandoffName(node) && node.type === 'FRAME') {
        const sourceId = node.getPluginData('a11y-source-component-id');
        if (sourceId) {
          const sourceNode = await figma.getNodeByIdAsync(sourceId);
          if (sourceNode) {
            currentRootId = sourceNode.id;
            workingNodeId = sourceNode.id;
            // Avisar a UI imediatamente — antes de loadCsvFromTemplate e sendComponentData
            figma.ui.postMessage({ type: 'component-loading', name: (sourceNode as SceneNode).name });
          }
        }
      } else if (node.id !== templateNodeId) {
        // Template puro diferente do atual → limpar root para não reutilizar dados antigos
        currentRootId = null;
        workingNodeId = null;
      }

      templateNodeId = node.id;
      listeningMode = true;
      await loadCsvFromTemplate(templateNodeId);

      // Se já temos um root (handoff selecionado ou sessão anterior), enviar dados completos
      // keepStep=true: usuário está re-selecionando o template, não deve resetar a aba atual
      if (currentRootId) {
        await persistTemplateAssociation();
        const rootNode = await figma.getNodeByIdAsync(currentRootId);
        if (rootNode) {
          await sendComponentData(rootNode as SceneNode, null, true);
          return;
        }
      }

      // Senão, informar UI que o template está pronto
      figma.ui.postMessage({
        type: 'template-ready',
        templateNodeId: node.id,
      });
      return;
    }

    // Caso B: Layer no canvas enquanto em modo escuta → anotar
    if (listeningMode && templateNodeId) {
      // Se já temos um root, verificar PRIMEIRO se o nó é descendente dele.
      // Isso evita que ícones/instâncias de outros componentes (ex: Icon dentro de Button)
      // sejam interpretados como troca de root.
      if (currentRootId) {
        const isDescendant = await isNodeDescendantOfRoot(node, currentRootId);
        if (isDescendant) {
          if (node.id !== currentRootId) {
            await handleCanvasLayerSelection(node);
          }
          return;
        }
      }

      // Não é descendente do root atual (ou não temos root) — tentar resolver novo root
      const resolved = await resolveComponentRoot(node);
      if (resolved) {
        const hadRootBefore = !!currentRootId;
        const isNewRoot = !currentRootId || resolved.root.id !== currentRootId;
        if (isNewRoot) {
          currentRootId = resolved.root.id;
          workingNodeId = resolved.root.id;
          figma.ui.postMessage({ type: 'component-loading', name: resolved.root.name });
          await persistTemplateAssociation();
          await sendComponentData(resolved.root, null, hadRootBefore);
        }

        const isRootItself = node.id === resolved.root.id;
        if (!isRootItself) {
          await handleCanvasLayerSelection(node);
        }
        return;
      }
      // Nó fora de qualquer componente — ignorar silenciosamente
      return;
    }

    // Sem modo escuta ativo: verificar se é um componente para iniciar (sem template)
    // Não faz nada — precisa do template primeiro
    if (!listeningMode) {
      currentRootId = null;
      workingNodeId = null;
      templateNodeId = null;
      figma.ui.postMessage({ type: 'selection-changed', valid: false });
    }
    return;
  }

  // ── Seleção de 2+ nós ──
  if (selection.length >= 2) {
    // Verificar se há um template na seleção (fluxo legado)
    let tplNode: SceneNode | null = null;
    let compNode: SceneNode | null = null;
    for (const n of selection) {
      if (isTemplateName(n) || isHandoffName(n)) {
        if (!tplNode) tplNode = n;
      } else {
        if (!compNode) compNode = n;
      }
    }

    // Se NÃO tem template na seleção e estamos em modo escuta → multi-seleção de layers
    if (!tplNode && listeningMode && currentRootId) {
      // Encontrar o bounds de referência: buscar a instância do canvas que contém
      // os nós selecionados (mesmo lógica do handleCanvasLayerSelection para single-selection).
      // currentRootId aponta para o master component, que pode estar em posição diferente
      // da instância colocada no canvas.
      let refBounds: { x: number; y: number; width: number; height: number } | null = null;

      // Subir na hierarquia do primeiro nó selecionado para encontrar a instância ancestral
      let instParent: BaseNode | null = selection[0];
      while (instParent && instParent.id !== currentRootId) {
        if (instParent.type === 'INSTANCE') {
          try {
            const mc = await (instParent as InstanceNode).getMainComponentAsync();
            if (mc && (mc.parent?.id === currentRootId || mc.id === currentRootId)) {
              const ib = (instParent as SceneNode).absoluteBoundingBox;
              if (ib) { refBounds = ib; break; }
            }
          } catch (_) { /* continue */ }
        }
        instParent = instParent.parent;
      }

      // Fallback: usar o rootNode diretamente
      if (!refBounds) {
        const rootNode = await figma.getNodeByIdAsync(currentRootId);
        if (rootNode) refBounds = (rootNode as SceneNode).absoluteBoundingBox;
      }

      if (refBounds) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const nodeNames: string[] = [];
        for (const n of selection) {
          const b = n.absoluteBoundingBox;
          if (!b) continue;
          if (b.x < minX) minX = b.x;
          if (b.y < minY) minY = b.y;
          if (b.x + b.width > maxX) maxX = b.x + b.width;
          if (b.y + b.height > maxY) maxY = b.y + b.height;
          nodeNames.push(n.name);
        }
        if (minX !== Infinity) {
          figma.ui.postMessage({
            type: 'canvas-multi-selected',
            count: selection.length,
            nodeNames,
            relativeBounds: {
              x: minX - refBounds.x,
              y: minY - refBounds.y,
              width: maxX - minX,
              height: maxY - minY,
            },
          });
        }
      }
      return;
    }

    // Fluxo legado: template + componente (requer exatamente 2 nós com template)
    if (selection.length !== 2 || !tplNode || !compNode) {
      if (!listeningMode) {
        currentRootId = null;
        workingNodeId = null;
        templateNodeId = null;
        figma.ui.postMessage({ type: 'selection-changed', valid: false });
      }
      return;
    }

    cleanupTempInstance();

    // Resolve component
    let initialVariantId: string | null = null;
    if (compNode.type === 'FRAME' && compNode.name.startsWith('[A11Y Handoff]')) {
      const sourceId = compNode.getPluginData('a11y-source-component-id');
      if (sourceId) {
        const sourceNode = await figma.getNodeByIdAsync(sourceId);
        if (sourceNode) compNode = sourceNode as SceneNode;
      }
    }

    if (compNode.type === 'INSTANCE') {
      try {
        const mc = await (compNode as InstanceNode).getMainComponentAsync();
        if (mc) {
          if (mc.parent?.type === 'COMPONENT_SET') {
            initialVariantId = mc.id;
            compNode = mc.parent as SceneNode;
          } else {
            compNode = mc as SceneNode;
          }
        }
      } catch (_) { /* keep as is */ }
    } else if (compNode.type === 'COMPONENT') {
      const parent = (compNode as ComponentNode).parent;
      if (parent?.type === 'COMPONENT_SET') {
        initialVariantId = compNode.id;
        compNode = parent as ComponentSetNode;
      }
    }

    const hadRootBefore2 = !!currentRootId;
    const isSameRoot = hadRootBefore2 && currentRootId === compNode.id;

    templateNodeId = tplNode.id;
    currentRootId = compNode.id;
    workingNodeId = compNode.id;
    listeningMode = true;

    figma.ui.postMessage({ type: 'component-loading', name: compNode.name });
    await loadCsvFromTemplate(templateNodeId);
    await persistTemplateAssociation();
    // keepStep=true se o root não mudou (usuário re-selecionou o mesmo par template+componente)
    await sendComponentData(compNode, initialVariantId, isSameRoot);
    return;
  }

  // Qualquer outro caso: manter estado se em modo escuta
  if (!listeningMode) {
    currentRootId = null;
    workingNodeId = null;
    templateNodeId = null;
    figma.ui.postMessage({ type: 'selection-changed', valid: false });
  }
}

figma.on('selectionchange', () => { handleSelectionChange().catch(() => {}); });

/**
 * Remove todas as instâncias temporárias de variantes configs de um componente e
 * limpa o frame [A11Y Variantes] se ficar vazio.
 */
async function cleanupVariantInstances(compNode: SceneNode): Promise<void> {
  const configs = readVariantConfigs(compNode);
  for (const config of configs) {
    try {
      const inst = await figma.getNodeByIdAsync(config.instanceNodeId);
      if (inst && 'remove' in inst) (inst as SceneNode).remove();
    } catch (_e) { /* ignore */ }
  }
  // Remover frame [A11Y Variantes] se ficou vazio
  try {
    const varFrame = figma.currentPage.children.find(n => n.name === '[A11Y Variantes]');
    if (varFrame && 'children' in varFrame && (varFrame as FrameNode).children.length === 0) {
      (varFrame as FrameNode).remove();
    }
  } catch (_e) { /* ignore */ }
}

figma.on('close', () => {
  // Limpar instância de preview temporária
  if (tempInstanceId) {
    try {
      const old = figma.getNodeById(tempInstanceId);
      if (old && 'remove' in old) (old as SceneNode).remove();
    } catch (_e) { /* ignore */ }
  }
  // Limpar instâncias de variantes parametrizadas do componente atual
  if (currentRootId) {
    try {
      const rootNode = figma.getNodeById(currentRootId);
      if (rootNode && 'getPluginData' in rootNode) {
        const configs = readVariantConfigs(rootNode as SceneNode);
        for (const config of configs) {
          try {
            const inst = figma.getNodeById(config.instanceNodeId);
            if (inst && 'remove' in inst) (inst as SceneNode).remove();
          } catch (_e) { /* ignore */ }
        }
      }
    } catch (_e) { /* ignore */ }
  }
  // Remover frame [A11Y Variantes] se ficou vazio
  try {
    const varFrame = figma.currentPage.children.find(n => n.name === '[A11Y Variantes]');
    if (varFrame && 'children' in varFrame && (varFrame as FrameNode).children.length === 0) {
      (varFrame as FrameNode).remove();
    }
  } catch (_e) { /* ignore */ }
});
handleSelectionChange();

// ════════════════════════════════════════
// STEP 1: DADOS DO COMPONENTE
// ════════════════════════════════════════

/**
 * Salva os dados de acessibilidade do componente raiz no pluginData.
 * @param data - Dados de acessibilidade do componente
 */
async function setComponentData(data: ComponentA11yData): Promise<void> {
  if (!currentRootId) return;
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('setPluginData' in node)) return;
  (node as SceneNode).setPluginData('a11y-component', JSON.stringify(data));
}

// ════════════════════════════════════════
// PREVIEW
// ════════════════════════════════════════

/**
 * Coleta recursivamente as zonas de layers visíveis para o preview interativo.
 * @param node - Nó a percorrer
 * @param rootBounds - Limites do componente raiz (para cálculo de coordenadas relativas)
 * @param depth - Profundidade atual na hierarquia
 * @param parentId - ID do nó pai
 * @returns Lista de zonas de layers
 */
function collectLayerZones(node: SceneNode, rootBounds: Rect, depth: number, parentId: string, maxDepth: number = 60): LayerZone[] {
  const result: LayerZone[] = [];
  if (depth > maxDepth) return result; // Safety limit for extremely deep hierarchies
  if ('children' in node) {
    const parent = node as ChildrenMixin & SceneNode;
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (!child.visible) continue;
      const bounds = child.absoluteBoundingBox;
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const raw = child.getPluginData('a11y');
        let category = '';
        category = safeParseJson<{category?:string}>(raw, {}).category || '';
        const childHasChildren = 'children' in child && (child as ChildrenMixin & SceneNode).children.length > 0;
        result.push({
          id: child.id, name: child.name, type: child.type,
          x: bounds.x - rootBounds.x, y: bounds.y - rootBounds.y,
          width: bounds.width, height: bounds.height,
          depth, hasA11yData: !!raw, category, parentId,
          hasChildren: childHasChildren,
        });
      }
      result.push(...collectLayerZones(child, rootBounds, depth + 1, child.id, maxDepth));
    }
  }
  return result;
}

/**
 * Gera o preview do componente para a UI, incluindo imagem PNG e zonas de layers.
 */
async function generatePreview(): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return;

  const root = rootNode as SceneNode;
  let previewTarget: SceneNode | null = null;

  let currentVariantName = '';

  if (root.type === 'COMPONENT_SET') {
    // Reuse existing temp instance if still alive
    if (tempInstanceId) {
      const existing = await figma.getNodeByIdAsync(tempInstanceId);
      if (existing) {
        previewTarget = existing as SceneNode;
        workingNodeId = tempInstanceId;
        // Resolve variant name from instance
        if ('mainComponent' in existing) {
          const mc = await (existing as InstanceNode).getMainComponentAsync();
          if (mc) currentVariantName = mc.name;
        }
      } else {
        tempInstanceId = null;
      }
    }
    if (!tempInstanceId) {
      const cs = root as ComponentSetNode;
      const defaultVariant = (cs.defaultVariant || cs.children[0]) as ComponentNode;
      currentVariantName = defaultVariant.name;
      const tempInstance = defaultVariant.createInstance();

      const props = tempInstance.componentProperties;
      const updates: Record<string, string | boolean> = {};
      for (const key of Object.keys(props)) {
        if (props[key].type === 'BOOLEAN') updates[key] = true;
      }
      if (Object.keys(updates).length > 0) tempInstance.setProperties(updates);

      // Posiciona fora da área visível para não poluir o canvas
      tempInstance.x = -99999;
      tempInstance.y = -99999;
      _orphanInstanceIds.add(tempInstance.id); // registrar antes de salvar o ID
      tempInstanceId = tempInstance.id;
      workingNodeId = tempInstance.id;
      previewTarget = tempInstance;

      // Restore annotations from effective map (shared + variant-specific)
      const effectiveMap = await getEffectiveConsolidatedMap(currentVariantName);
      for (const [namePath, data] of Object.entries(effectiveMap)) {
        const node = findNodeByNamePath(tempInstance, namePath);
        if (node && 'setPluginData' in node) {
          node.setPluginData('a11y', JSON.stringify(data));
        }
      }
    }
  } else {
    workingNodeId = root.id;
    previewTarget = root;
  }

  if (!previewTarget || !('exportAsync' in previewTarget)) return;
  const bounds = previewTarget.absoluteBoundingBox;
  if (!bounds) return;

  figma.ui.postMessage({ type: 'preview-loading' }); // UI pode exibir spinner enquanto exporta
  const bytes = await (previewTarget as SceneNode & ExportMixin).exportAsync({
    format: 'PNG', constraint: { type: 'WIDTH', value: 1040 },
  });
  const base64 = figma.base64Encode(bytes);
  const childLayers = collectLayerZones(previewTarget, bounds, 1, previewTarget.id);

  // Include the root component itself as a selectable layer
  const rootRaw = previewTarget.getPluginData('a11y');
  let rootCat = '';
  rootCat = safeParseJson<{category?:string}>(rootRaw, {}).category || '';
  const rootLayer: LayerZone = {
    id: previewTarget.id, name: previewTarget.name, type: previewTarget.type,
    x: 0, y: 0, width: bounds.width, height: bounds.height,
    depth: 0, hasA11yData: !!rootRaw, category: rootCat,
    parentId: '', hasChildren: true,
  };
  const layers = [rootLayer, ...childLayers];

  figma.ui.postMessage({
    type: 'preview-data',
    image: base64,
    width: bounds.width,
    height: bounds.height,
    rootZoneId: previewTarget.id,
    layers,
    variantName: currentVariantName,
  });
}

/**
 * Troca a variante exibida no preview, criando uma nova instância temporária.
 * @param variantId - ID da variante a exibir
 */
async function switchVariant(variantId: string, excOnly: boolean = false): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || rootNode.type !== 'COMPONENT_SET') return;

  // Find the variant component
  const cs = rootNode as ComponentSetNode;
  const variant = cs.children.find(c => c.id === variantId) as ComponentNode | undefined;
  if (!variant) return;

  // Modo canvas: não criar instância temporária, apenas enviar dados da variante para a UI
  await sendUnifiedAnnotations(variant.name, excOnly);
}

// ════════════════════════════════════════
// STEP 2: ROLES POR LAYER
// ════════════════════════════════════════

/**
 * Constrói o caminho hierárquico de nomes do nó até a raiz (ex.: "Frame/Button/Label").
 * @param node - Nó de partida
 * @param rootId - ID do nó raiz (ponto de parada)
 * @returns Caminho separado por "/"
 */
function buildNamePath(node: BaseNode, rootId: string): string {
  const parts: string[] = [];
  let cur: BaseNode | null = node;
  while (cur && cur.id !== rootId) {
    parts.unshift(cur.name);
    cur = cur.parent;
  }
  return parts.join('/');
}

/**
 * Obtém o mapa consolidado de anotações de layers para uma variante específica ou compartilhado.
 * @param variantName - Nome da variante (opcional; se omitido, retorna o mapa compartilhado)
 * @returns Mapa de namePath para dados de acessibilidade
 */
async function getConsolidatedMap(variantName?: string): Promise<Record<string, LayerA11yData>> {
  if (!currentRootId) return {};
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('getPluginData' in rootNode)) return {};
  const key = variantName ? 'a11y-layers::' + variantName : 'a11y-layers';
  const raw = (rootNode as SceneNode).getPluginData(key);
  if (!raw) return {};
  return safeParseJson(raw, {} as Record<string, LayerA11yData>);
}

/**
 * Obtém o mapa efetivo combinando dados compartilhados com os específicos da variante.
 * @param variantName - Nome da variante (opcional)
 * @returns Mapa mesclado (compartilhado + variante)
 */
async function getEffectiveConsolidatedMap(variantName?: string): Promise<Record<string, LayerA11yData>> {
  const shared = await getConsolidatedMap();
  if (!variantName) return shared;
  const specific = await getConsolidatedMap(variantName);
  return { ...shared, ...specific };
}

/**
 * Salva o mapa consolidado de anotações no pluginData do componente raiz.
 * @param map - Mapa de namePath para dados de acessibilidade
 * @param variantName - Nome da variante (opcional; se omitido, salva no mapa compartilhado)
 */
async function saveConsolidatedMap(map: Record<string, LayerA11yData>, variantName?: string): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('setPluginData' in rootNode)) return;
  const key = variantName ? 'a11y-layers::' + variantName : 'a11y-layers';
  (rootNode as SceneNode).setPluginData(key, JSON.stringify(map));
}

/**
 * Retorna os nomes de todas as variantes de um COMPONENT_SET.
 * @returns Lista de nomes de variantes
 */
async function getAllVariantNames(): Promise<string[]> {
  if (!currentRootId) return [];
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || rootNode.type !== 'COMPONENT_SET') return [];
  const cs = rootNode as ComponentSetNode;
  return cs.children.filter(c => c.type === 'COMPONENT').map(c => c.name);
}

/**
 * Remove um namePath de todos os mapas específicos de variantes.
 * @param namePath - Caminho do layer a ser removido
 */
async function removeFromAllVariantMaps(namePath: string): Promise<void> {
  const variantNames = await getAllVariantNames();
  for (const vn of variantNames) {
    const map = await getConsolidatedMap(vn);
    if (map[namePath]) {
      delete map[namePath];
      await saveConsolidatedMap(map, vn);
    }
  }
}

/**
 * Lê as configurações de variantes parametrizadas salvas no componente raiz.
 */
function readVariantConfigs(root: SceneNode): VariantConfig[] {
  return safeParseJson<VariantConfig[]>(root.getPluginData(KEY_VARIANT_CONFIGS), []);
}

/**
 * Salva as configurações de variantes parametrizadas no componente raiz.
 */
function saveVariantConfigs(root: SceneNode, configs: VariantConfig[]): void {
  root.setPluginData(KEY_VARIANT_CONFIGS, JSON.stringify(configs));
}

/**
 * Identifica quais variantes possuem overrides específicos para roles, touch e focus.
 * @returns Listas de nomes de variantes com overrides por tipo de dado
 */
async function getVariantOverrides(): Promise<{ roles: string[], touch: string[], focus: string[] }> {
  const result = { roles: [] as string[], touch: [] as string[], focus: [] as string[] };
  if (!currentRootId) return result;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return result;
  const sn = rootNode as SceneNode;
  const variantNames = await getAllVariantNames();

  for (const vn of variantNames) {
    // Check roles (Unified) — basta a chave existir (mesmo array vazio = variante zerada)
    const variantUnified = sn.getPluginData(KEY_SR_UNIFIED + vn);
    if (variantUnified !== '') {
      result.roles.push(vn);
    }
    // Check touch
    const touchKey = 'a11y-touch-areas::' + vn;
    const variantTouch = sn.getPluginData(touchKey);
    if (variantTouch && safeParseJson<any[]>(variantTouch, []).length > 0) {
      result.touch.push(vn);
    }
    // Check focus
    const focusKey = 'a11y-focus-order::' + vn;
    const variantFocus = sn.getPluginData(focusKey);
    if (variantFocus && safeParseJson<any[]>(variantFocus, []).length > 0) {
      result.focus.push(vn);
    }
  }
  return result;
}

/**
 * Cria um override vazio para uma variante e tipo de dado específicos.
 * @param variantName - Nome da variante
 * @param dataType - Tipo de dado ('roles', 'touch' ou 'focus')
 */
async function createVariantOverride(variantName: string, dataType: 'roles' | 'touch' | 'focus'): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return;
  const sn = rootNode as SceneNode;

  if (dataType === 'roles') {
    const key = KEY_SR_UNIFIED + variantName;
    if (!sn.getPluginData(key)) sn.setPluginData(key, '[]');
  } else if (dataType === 'touch') {
    const key = 'a11y-touch-areas::' + variantName;
    if (!sn.getPluginData(key)) sn.setPluginData(key, '[]');
  } else if (dataType === 'focus') {
    const key = 'a11y-focus-order::' + variantName;
    if (!sn.getPluginData(key)) sn.setPluginData(key, '[]');
  }
}

/**
 * Remove o override de uma variante para um tipo de dado específico.
 * @param variantName - Nome da variante
 * @param dataType - Tipo de dado ('roles', 'touch' ou 'focus')
 */
async function removeVariantOverride(variantName: string, dataType: 'roles' | 'touch' | 'focus'): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return;
  const sn = rootNode as SceneNode;

  if (dataType === 'roles') {
    // Limpa o escopo unificado da variante
    sn.setPluginData(KEY_SR_UNIFIED + variantName, '');
  } else if (dataType === 'touch') {
    sn.setPluginData('a11y-touch-areas::' + variantName, '');
  } else if (dataType === 'focus') {
    sn.setPluginData('a11y-focus-order::' + variantName, '');
  }
}

// ════════════════════════════════════════
// SHARED PLUGIN DATA (publicação para outros plugins)
// ════════════════════════════════════════

/**
 * Converte entradas de ordem de foco (baseadas em nodeId) para namePaths estáveis.
 * @param entries - Entradas de ordem de foco com nodeIds
 * @param component - Componente de referência para resolver nomes
 * @returns Lista de entradas com namePath em vez de nodeId
 */
function focusOrderToNamePaths(
  entries: FocusOrderEntry[],
  component: ComponentNode,
): SharedA11yManifest['focusOrder'] {
  const inst = component.createInstance();
  const result: SharedA11yManifest['focusOrder'] = [];
  for (const entry of entries) {
    // Instance child IDs are "instId;compChildId", stored IDs may be from
    // another instance or the component directly — extract the suffix after ";"
    const suffix = entry.nodeId.includes(';')
      ? entry.nodeId.split(';').pop()!
      : entry.nodeId;
    const node = inst.findOne(n => {
      const nSuffix = n.id.includes(';') ? n.id.split(';').pop()! : n.id;
      return nSuffix === suffix;
    });
    const namePath = node ? buildNamePath(node, inst.id) : '';
    const item: SharedA11yManifest['focusOrder'][0] = {
      namePath,
      order: entry.order,
      category: entry.category,
    };
    if (entry.accessibleName) item.accessibleName = entry.accessibleName;
    if (entry.altText) item.altText = entry.altText;
    if (entry.headingLevel) item.headingLevel = entry.headingLevel;
    result.push(item);
  }
  inst.remove();
  return result;
}

/**
 * Publica dados de acessibilidade via sharedPluginData para consumo por outros plugins.
 * @param variantName - Se informado, publica apenas para a variante especificada
 */
async function publishSharedA11yData(variantName?: string): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('setSharedPluginData' in rootNode)) return;
  const sn = rootNode as SceneNode;

  const compRaw = sn.getPluginData('a11y-component');
  if (!compRaw) return; // not reviewed yet
  const compData = safeParseJson<ComponentA11yData | null>(compRaw, null);
  if (!compData) return;

  const now = new Date().toISOString();

  if (sn.type === 'COMPONENT_SET') {
    const cs = sn as ComponentSetNode;
    const componentChildren = cs.children.filter(c => c.type === 'COMPONENT') as ComponentNode[];

    // Write a11y-index on the COMPONENT_SET
    const index = {
      version: 2,
      reviewed: true,
      variantCount: componentChildren.length,
      platforms: compData.platform,
      zoom: compData.zoom,
      noTab: compData.noTab || false,
      noScreenReader: compData.noScreenReader || false,
      noTouch: compData.noTouch || false,
    };
    sn.setSharedPluginData(SHARED_NS, 'a11y-index', JSON.stringify(index));

    // Write a11y-manifest on each COMPONENT child (or just the specified one)
    const targets = variantName
      ? componentChildren.filter(c => c.name === variantName)
      : componentChildren;

    // Read agrupamentos and combinados (shared)
    const agrupRaw = sn.getPluginData('a11y-agrupamentos::');
    const sharedAgrupamentos = safeParseJson<AgrupamentoRect[]>(agrupRaw, []);
    const combRaw = sn.getPluginData('a11y-combinados::');
    const sharedCombinados = safeParseJson<CombinadoEntry[]>(combRaw, []);

    for (const child of targets) {
      const effectiveMap = await getEffectiveConsolidatedMap(child.name);

      const touchAreas = readTouchAreasRaw(sn, child.name);
      const focusEntries = readFocusOrderRaw(sn, child.name);

      const focusOrder = focusEntries.length > 0
        ? focusOrderToNamePaths(focusEntries, child)
        : [];

      // Per-variant agrupamentos/combinados (fallback to shared)
      const varAgrupRaw = sn.getPluginData('a11y-agrupamentos::' + child.name);
      const agrupamentos = varAgrupRaw ? safeParseJson<AgrupamentoRect[]>(varAgrupRaw, sharedAgrupamentos) : sharedAgrupamentos;
      const varCombRaw = sn.getPluginData('a11y-combinados::' + child.name);
      const combinados = varCombRaw ? safeParseJson<CombinadoEntry[]>(varCombRaw, sharedCombinados) : sharedCombinados;

      const manifest: SharedA11yManifest = {
        version: 2,
        reviewedAt: now,
        component: {
          name: cs.name,
          platforms: compData.platform,
          zoom: compData.zoom,
          noTab: compData.noTab || false,
          noScreenReader: compData.noScreenReader || false,
          noTouch: compData.noTouch || false,
          kbMapping: compData.kbMapping,
          gestureMapping: compData.gestureMapping,
        },
        layers: effectiveMap,
        touchAreas,
        focusOrder,
        agrupamentos,
        combinados,
      };

      child.setSharedPluginData(SHARED_NS, 'a11y-manifest', JSON.stringify(manifest));
    }
  } else if (sn.type === 'COMPONENT') {
    const comp = sn as ComponentNode;

    // Layers: for simple components, the shared map is the only map
    const layers = await getEffectiveConsolidatedMap();

    const touchAreas = readTouchAreasRaw(sn);
    const focusEntries = readFocusOrderRaw(sn);

    const focusOrder = focusEntries.length > 0
      ? focusOrderToNamePaths(focusEntries, comp)
      : [];

    const agrupRaw = sn.getPluginData('a11y-agrupamentos::');
    const agrupamentos = safeParseJson<AgrupamentoRect[]>(agrupRaw, []);
    const combRaw = sn.getPluginData('a11y-combinados::');
    const combinados = safeParseJson<CombinadoEntry[]>(combRaw, []);

    const manifest: SharedA11yManifest = {
      version: 2,
      reviewedAt: now,
      component: {
        name: comp.name,
        platforms: compData.platform,
        zoom: compData.zoom,
        noTab: compData.noTab || false,
        noScreenReader: compData.noScreenReader || false,
        noTouch: compData.noTouch || false,
        kbMapping: compData.kbMapping,
        gestureMapping: compData.gestureMapping,
      },
      layers,
      touchAreas,
      focusOrder,
      agrupamentos,
      combinados,
    };

    sn.setSharedPluginData(SHARED_NS, 'a11y-manifest', JSON.stringify(manifest));
  }
}

/**
 * Encontra um nó descendente a partir de um caminho hierárquico de nomes.
 * Para componentes complexos com nomes duplicados em níveis diferentes,
 * tenta todas as correspondências possíveis quando a primeira falha.
 * @param root - Nó raiz para início da busca
 * @param namePath - Caminho separado por "/" (vazio = retorna a própria raiz)
 * @returns Nó encontrado ou null
 */
function findNodeByNamePath(root: BaseNode, namePath: string): SceneNode | null {
  if (!namePath) return root as SceneNode; // empty path = root itself
  const parts = namePath.split('/');

  // Fast path: direct match (works for most cases)
  let cur: BaseNode = root;
  let found = true;
  for (const part of parts) {
    if (!('children' in cur)) { found = false; break; }
    const parent = cur as ChildrenMixin;
    const child = parent.children.find(c => c.name === part);
    if (!child) { found = false; break; }
    cur = child;
  }
  if (found) return cur as SceneNode;

  // Slow path for complex components: DFS trying all children with matching names
  function dfs(node: BaseNode, partIdx: number): SceneNode | null {
    if (partIdx >= parts.length) return node as SceneNode;
    if (!('children' in node)) return null;
    const parent = node as ChildrenMixin;
    for (const child of parent.children) {
      if (child.name === parts[partIdx]) {
        const result = dfs(child, partIdx + 1);
        if (result) return result;
      }
    }
    return null;
  }
  return dfs(root, 0);
}

/**
 * Lê os dados de acessibilidade de um layer e envia para a UI.
 * @param nodeId - ID do nó a consultar
 * @param variantName - Nome da variante (opcional, para verificar overrides)
 */
async function getLayerData(nodeId: string, variantName?: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('getPluginData' in node)) {
    figma.ui.postMessage({ type: 'layer-data', nodeId, data: null, name: '', scope: 'all' });
    return;
  }
  const sceneNode = node as SceneNode;
  let data: LayerA11yData | null = null;
  let scope: 'all' | 'variant' = 'all';

  const targetId = workingNodeId || currentRootId;
  if (targetId) {
    const namePath = buildNamePath(node, targetId);
    // Check variant-specific map first
    if (variantName) {
      const variantMap = await getConsolidatedMap(variantName);
      if (variantMap[namePath]) {
        data = variantMap[namePath];
        scope = 'variant';
      }
    }
    // Fallback to shared map
    if (!data) {
      const sharedMap = await getConsolidatedMap();
      if (sharedMap[namePath]) {
        data = sharedMap[namePath];
        scope = 'all';
      }
    }
  }

  // Fallback: try per-node pluginData
  if (!data) {
    const raw = sceneNode.getPluginData('a11y');
    data = safeParseJson<LayerA11yData | null>(raw, null);
  }

  // Sync to per-node for preview compatibility
  if (data) {
    sceneNode.setPluginData('a11y', JSON.stringify(data));
  }

  const targetIdForPath = workingNodeId || currentRootId;
  const namePath = targetIdForPath ? buildNamePath(node, targetIdForPath) : '';
  figma.ui.postMessage({ type: 'layer-data', nodeId, data, name: sceneNode.name, scope, namePath });
}

/**
 * Salva os dados de acessibilidade de um layer no mapa consolidado e no nó.
 * @param nodeId - ID do nó a atualizar
 * @param data - Dados de acessibilidade a salvar
 * @param variantName - Nome da variante (opcional)
 * @param applyToAll - Se true, salva no mapa compartilhado; se false, apenas na variante
 */
async function setLayerData(nodeId: string, data: LayerA11yData, variantName?: string, applyToAll: boolean = true): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('setPluginData' in node)) return;
  (node as SceneNode).setPluginData('a11y', JSON.stringify(data));

  const targetId = workingNodeId || currentRootId;
  if (targetId) {
    const namePath = buildNamePath(node, targetId);
    if (applyToAll || !variantName) {
      // Save to shared map
      const map = await getConsolidatedMap();
      map[namePath] = data;
      await saveConsolidatedMap(map);
      // Remove from all variant-specific maps
      await removeFromAllVariantMaps(namePath);
    } else {
      // Save to variant-specific map only
      const map = await getConsolidatedMap(variantName);
      map[namePath] = data;
      await saveConsolidatedMap(map, variantName);
    }
  }

  await refreshZones();
}

/**
 * Remove a anotação de um layer dos mapas compartilhado e de todas as variantes.
 * @param namePath - Caminho do layer a ser removido
 * @param variantName - Nome da variante atual (para atualizar a UI)
 */
async function removeLayerAnnotation(namePath: string, variantName?: string): Promise<void> {
  // Check if annotation exists in variant-specific map
  let removedFromVariant = false;
  if (variantName) {
    const variantMap = await getConsolidatedMap(variantName);
    if (namePath in variantMap) {
      delete variantMap[namePath];
      await saveConsolidatedMap(variantMap, variantName);
      removedFromVariant = true;
    }
  }

  // If not found in variant-specific, remove from shared map only
  if (!removedFromVariant) {
    const sharedMap = await getConsolidatedMap();
    delete sharedMap[namePath];
    await saveConsolidatedMap(sharedMap);
  }

  // Also remove from per-node if found
  const targetId = workingNodeId || currentRootId;
  if (targetId) {
    const targetNode = await figma.getNodeByIdAsync(targetId);
    if (targetNode) {
      const node = findNodeByNamePath(targetNode, namePath);
      if (node && 'setPluginData' in node) {
        node.setPluginData('a11y', '');
      }
    }
  }

  await refreshZones();
  await sendUnifiedAnnotations(variantName);
}

/**
 * Recalcula e envia as zonas de layers atualizadas para a UI.
 */
async function refreshZones(): Promise<void> {
  const targetId = workingNodeId || currentRootId;
  if (!targetId) return;
  const targetNode = await figma.getNodeByIdAsync(targetId);
  if (!targetNode) return;
  const target = targetNode as SceneNode;
  const bounds = target.absoluteBoundingBox;
  if (!bounds) return;
  // Include root node itself as a clickable zone (namePath = '')
  const raw = ('getPluginData' in target) ? (target as SceneNode & { getPluginData(k: string): string }).getPluginData('a11y') : '';
  let rootCategory = '';
  rootCategory = safeParseJson<{category?:string}>(raw, {}).category || '';
  const rootZone: LayerZone = {
    id: target.id, name: target.name, type: target.type,
    x: 0, y: 0, width: bounds.width, height: bounds.height,
    depth: 0, hasA11yData: !!raw, category: rootCategory, parentId: '',
    hasChildren: 'children' in target && (target as any).children.length > 0,
  };
  const layers = [rootZone, ...collectLayerZones(target, bounds, 1, target.id)];
  figma.ui.postMessage({ type: 'zones-updated', layers, rootZoneId: target.id });
}

// ════════════════════════════════════════
// STEP 3: ÁREAS DE TOQUE
// Sempre salvas no currentRootId (nó original, não temp instance)
// ════════════════════════════════════════

/**
 * Salva as áreas de toque no componente raiz original.
 * @param areas - Lista de retângulos de áreas de toque
 * @param variantName - Nome da variante (vazio = compartilhado)
 * @param applyToAll - Se true, salva no compartilhado e limpa overrides de variantes
 */
async function saveTouchAreas(areas: TouchAreaRect[], variantName: string = '', applyToAll: boolean = false): Promise<void> {
  if (!currentRootId) return;
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('setPluginData' in node)) return;
  const sn = node as SceneNode;

  if (applyToAll) {
    sn.setPluginData('a11y-touch-areas::', JSON.stringify(areas));
  } else {
    sn.setPluginData('a11y-touch-areas::' + variantName, JSON.stringify(areas));
  }
}

/**
 * Lê as áreas de toque e envia para a UI, priorizando dados da variante.
 * @param variantName - Nome da variante (vazio = compartilhado)
 */
async function getTouchAreas(variantName: string = ''): Promise<void> {
  if (!currentRootId) { figma.ui.postMessage({ type: 'touch-areas-data', areas: [], scope: 'all' }); return; }
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('getPluginData' in node)) { figma.ui.postMessage({ type: 'touch-areas-data', areas: [], scope: 'all' }); return; }
  let scope: 'all' | 'variant' = 'all';
  const sn = node as SceneNode;
  let raw = '';
  // Check variant-specific first
  if (variantName) {
    raw = sn.getPluginData('a11y-touch-areas::' + variantName);
    if (raw) scope = 'variant';
  }
  // Fallback to shared
  if (!raw) {
    raw = sn.getPluginData('a11y-touch-areas::');
    if (!raw) raw = sn.getPluginData('a11y-touch-areas');
    scope = 'all';
  }
  const areas = safeParseJson<TouchAreaRect[]>(raw, []);
  figma.ui.postMessage({ type: 'touch-areas-data', areas, scope });
}

// ════════════════════════════════════════
// STEP 4: ORDEM DE FOCO
// Sempre salvas no currentRootId (nó original, não temp instance)
// ════════════════════════════════════════

/**
 * Coleta recursivamente nós que possuem anotações de acessibilidade (não decorativos).
 * @param node - Nó raiz para busca
 * @returns Lista de nós com seus IDs, nomes e categorias
 */
function collectAnnotatedNodes(node: SceneNode): { nodeId: string; name: string; category: string }[] {
  const result: { nodeId: string; name: string; category: string }[] = [];
  const raw = node.getPluginData('a11y');
  if (raw) {
    try {
      const data: LayerA11yData = JSON.parse(raw);
      if (data.role !== 'dont-read' || data.category) {
        result.push({ nodeId: node.id, name: node.name, category: data.category || '' });
      }
    } catch (_e) { /* ignore */ }
  }
  if ('children' in node) {
    const parent = node as ChildrenMixin & SceneNode;
    for (let i = 0; i < parent.children.length; i++) {
      result.push(...collectAnnotatedNodes(parent.children[i]));
    }
  }
  return result;
}

/**
 * Coleta recursivamente TODOS os nós visíveis (não apenas anotados) para resolução de foco.
 * @param node - Nó raiz para busca
 * @returns Lista de nós com seus IDs e nomes
 */
function collectAllNodes(node: SceneNode): { nodeId: string; name: string; node: SceneNode }[] {
  const result: { nodeId: string; name: string; node: SceneNode }[] = [];
  result.push({ nodeId: node.id, name: node.name, node });
  if ('children' in node) {
    const parent = node as ChildrenMixin & SceneNode;
    for (let i = 0; i < parent.children.length; i++) {
      if (parent.children[i].visible) {
        result.push(...collectAllNodes(parent.children[i]));
      }
    }
  }
  return result;
}

/**
 * Lê a ordem de foco e envia para a UI, resolvendo namePaths para nodeIds atuais.
 * @param variantName - Nome da variante (opcional)
 */
async function getFocusOrder(variantName?: string): Promise<void> {
  const t0 = Date.now();
  const targetId = workingNodeId || currentRootId;
  if (!targetId || !currentRootId) {
    figma.ui.postMessage({ type: 'focus-order-data', entries: [], annotatedNodes: [], scope: 'all' });
    return;
  }

  const rootNode = await figma.getNodeByIdAsync(targetId);
  console.log(`[FOCUS-PERF] getNodeByIdAsync(target): ${Date.now() - t0}ms`);
  if (!rootNode || !('getPluginData' in rootNode)) {
    figma.ui.postMessage({ type: 'focus-order-data', entries: [], annotatedNodes: [], scope: 'all' });
    return;
  }

  const root = rootNode as SceneNode;

  // For COMPONENT_SET roots, track direct COMPONENT children so we can also register
  // "inner" paths relative to each variant boundary — matching handleCanvasLayerSelection.
  const subRootIds = new Set<string>();
  if (root.type === 'COMPONENT_SET') {
    for (const child of (root as ComponentSetNode).children) {
      if (child.type === 'COMPONENT') subRootIds.add(child.id);
    }
  }

  // Single iterative DFS — builds path map AND collects annotated nodes in one pass.
  // Previously this was three separate passes (collectAnnotatedNodes, collectAllNodes,
  // then buildNamePath for every node), totalling 10+ seconds on complex components.
  // Now: one traversal, path built top-down (no .parent walking), ~10× faster.
  const t1 = Date.now();
  const annotated: { nodeId: string; name: string; category: string }[] = [];
  const allNodesByPath = new Map<string, { nodeId: string; name: string }>();
  const allNodeIds = new Set<string>();
  const nameMap = new Map<string, string>();

  // Stack entries: [node, pathFromRoot, innerPathFromNearestSubRoot | null]
  // pathFromRoot = '' for the root itself (mirrors buildNamePath behaviour)
  // innerPathFromNearestSubRoot = null until we descend into a COMPONENT child of COMPONENT_SET
  const stack: [SceneNode, string, string | null][] = [[root, '', null]];
  while (stack.length > 0) {
    const [node, pathSoFar, innerPathSoFar] = stack.pop()!;

    // Check for a11y annotation
    const raw = node.getPluginData('a11y');
    if (raw) {
      try {
        const data: LayerA11yData = JSON.parse(raw);
        if (data.role !== 'dont-read' || data.category) {
          annotated.push({ nodeId: node.id, name: node.name, category: data.category || '' });
        }
      } catch (_e) { /* ignore */ }
    }

    // Register full path (and inner path when inside a COMPONENT_SET variant)
    allNodeIds.add(node.id);
    nameMap.set(node.id, node.name);
    allNodesByPath.set(pathSoFar, { nodeId: node.id, name: node.name });
    if (innerPathSoFar) { // non-empty only — mirrors original `if (innerPath && ...)` guard
      if (!allNodesByPath.has(innerPathSoFar)) {
        allNodesByPath.set(innerPathSoFar, { nodeId: node.id, name: node.name });
      }
    }

    // Queue visible children (reversed so stack pops preserve document order)
    if ('children' in node) {
      const isSubRoot = subRootIds.has(node.id);
      const parent = node as ChildrenMixin & SceneNode;
      for (let i = parent.children.length - 1; i >= 0; i--) {
        const child = parent.children[i];
        if (!child.visible) continue;
        const childPath = pathSoFar ? pathSoFar + '/' + child.name : child.name;
        // Inner path starts fresh when entering a COMPONENT sub-root
        const childInnerPath = isSubRoot ? child.name
          : innerPathSoFar !== null ? innerPathSoFar + '/' + child.name
          : null;
        stack.push([child, childPath, childInnerPath]);
      }
    }
  }
  console.log(`[FOCUS-PERF] single traversal: ${Date.now() - t1}ms (${allNodeIds.size} nodes, ${annotated.length} annotated, ${allNodesByPath.size} paths)`);

  const t2 = Date.now();
  const origNode = await figma.getNodeByIdAsync(currentRootId);
  console.log(`[FOCUS-PERF] getNodeByIdAsync(orig): ${Date.now() - t2}ms`);

  let rawFocus = '';
  let scope: 'all' | 'variant' = 'all';

  // Check variant-specific focus order first
  if (variantName && origNode) {
    rawFocus = (origNode as SceneNode).getPluginData('a11y-focus-order::' + variantName);
    if (rawFocus) scope = 'variant';
  }
  // Fallback to shared
  if (!rawFocus && origNode) {
    rawFocus = (origNode as SceneNode).getPluginData('a11y-focus-order');
    scope = 'all';
  }

  const storedEntries = safeParseJson<(FocusOrderEntry & { namePath?: string })[]>(rawFocus, []);

  // Resolve stored entries: prefer namePath (stable), fallback to nodeId (legacy)
  const entries: (FocusOrderEntry & { name?: string })[] = [];
  for (const e of storedEntries) {
    if (e.namePath !== undefined && allNodesByPath.has(e.namePath)) {
      const resolved = allNodesByPath.get(e.namePath)!;
      entries.push({ ...e, nodeId: resolved.nodeId, order: entries.length + 1, name: resolved.name });
    } else if (allNodeIds.has(e.nodeId)) {
      entries.push({ ...e, order: entries.length + 1, name: nameMap.get(e.nodeId) || 'Layer desconhecido' });
    }
  }

  console.log(`[FOCUS-PERF] total getFocusOrder: ${Date.now() - t0}ms → ${entries.length} entries, scope=${scope}`);
  figma.ui.postMessage({ type: 'focus-order-data', entries, annotatedNodes: annotated, scope });
}

/**
 * Salva a ordem de foco, convertendo nodeIds transientes em namePaths estáveis.
 * @param entries - Lista de entradas de ordem de foco
 * @param variantName - Nome da variante (opcional)
 * @param applyToAll - Se true, salva no compartilhado e limpa overrides de variantes
 */
async function setFocusOrder(entries: FocusOrderEntry[], variantName?: string, applyToAll: boolean = true): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('setPluginData' in rootNode)) return;
  const sn = rootNode as SceneNode;

  // Convert nodeIds (transient instance IDs) to namePaths (stable) for storage
  const targetId = workingNodeId || currentRootId;
  const targetNode = targetId ? await figma.getNodeByIdAsync(targetId) : null;
  const stableEntries = [];
  for (const e of entries) {
    // Use the namePath provided by the UI if available (handles instance child nodeIds correctly).
    // Only rebuild from nodeId if namePath was not provided.
    let namePath = (e as FocusOrderEntry & { namePath?: string }).namePath || '';
    if (!namePath && targetNode) {
      // namePath vazio indica que o node selecionado é a própria raiz da instância/componente.
      // Só é válido se o nodeId for o próprio targetId (componente raiz) — caso contrário,
      // o node está fora da hierarquia do componente (ex: instância em [A11Y Variantes]).
      if (e.nodeId === targetId) {
        namePath = ''; // mantém '' → referencia o root
      } else {
        const node = await figma.getNodeByIdAsync(e.nodeId);
        if (node) namePath = buildNamePath(node, targetId!);
      }
    }
    stableEntries.push({ ...e, namePath });
  }
  const data = JSON.stringify(stableEntries);
  const key = (applyToAll || !variantName) ? 'a11y-focus-order' : 'a11y-focus-order::' + variantName;
  sn.setPluginData(key, data);
}

// ════════════════════════════════════════
// STEP 5: HANDOFF
// ════════════════════════════════════════

// ── Cores ──
const C_BLUE: RGB = { r: 0, g: 0.36, b: 0.71 };
const C_BLACK: RGB = { r: 0.13, g: 0.13, b: 0.13 };
const C_GRAY: RGB = { r: 0.33, g: 0.33, b: 0.33 };
const C_LIGHT_GRAY: RGB = { r: 0.6, g: 0.6, b: 0.6 };
const C_WHITE: RGB = { r: 1, g: 1, b: 1 };
const C_WARN_BG: RGB = { r: 1, g: 0.96, b: 0.88 };
const C_WARN_BORDER: RGB = { r: 0.9, g: 0.78, b: 0.3 };
const C_DECORATIVE: RGB = { r: 0.75, g: 0.22, b: 0.17 };
const C_FUNCTION_VALUE: RGB = { r: 0.88, g: 0.72, b: 0.3 };
const C_STRUCTURAL: RGB = { r: 0.83, g: 0.45, b: 0.42 };
const C_HEADING: RGB = { r: 0.64, g: 0.72, b: 0.3 };
const C_ACCESSIBLE_NAME: RGB = { r: 0.36, g: 0.73, b: 0.65 };
const C_OTHERS: RGB = { r: 0.91, g: 0.58, b: 0.3 };
const C_CONNECTOR_LINE: RGB = { r: 0.45, g: 0.5, b: 0.5 };

const CAT_COLORS: Record<string, RGB> = {
  'funcao-valor': C_FUNCTION_VALUE,
  'estrutural': C_STRUCTURAL,
  'titulo': C_HEADING,
  'nome-acessivel': C_ACCESSIBLE_NAME,
  'decorativo': C_DECORATIVE,
  'outros': C_OTHERS,
};

/**
 * Envia uma mensagem de progresso para a UI durante a geração do handoff.
 * @param text - Texto de progresso a exibir
 */
function sendProgress(text: string): void {
  figma.ui.postMessage({ type: 'handoff-progress', text });
}

/**
 * Descobre conectores de acessibilidade no arquivo Figma para posicionamento automático.
 */
async function discoverConnectors(): Promise<void> {
  connectorMap = [];
  const searchScopes: readonly BaseNode[] = [figma.currentPage, figma.root];
  for (const scope of searchScopes) {
    if (connectorMap.length > 0) break;
    const instances = (scope as ChildrenMixin).findAll(n =>
      n.type === 'INSTANCE' && n.name.includes('[a11y]')
    ) as InstanceNode[];
    for (const inst of instances) {
      const comp = await inst.getMainComponentAsync();
      if (!comp) continue;
      const parentSet = comp.parent;
      if (!parentSet || parentSet.type !== 'COMPONENT_SET') continue;
      const setName = parentSet.name.toLowerCase();
      if (setName.includes('conector') || setName.includes('combinad') || setName.includes('a11y')) {
        connectorMap.push({ componentKey: comp.key, componentName: comp.name, category: guessCategory(comp.name, parentSet.name) });
      }
    }
  }
  if (connectorMap.length === 0) {
    await figma.loadAllPagesAsync();
    const sets = figma.root.findAll(n =>
      n.type === 'COMPONENT_SET' && n.name.includes('[EXCLUSIVO DSC]') && n.name.includes('[a11y]')
    ) as ComponentSetNode[];
    for (const cs of sets) {
      for (let i = 0; i < cs.children.length; i++) {
        const variant = cs.children[i] as ComponentNode;
        connectorMap.push({ componentKey: variant.key, componentName: variant.name, category: guessCategory(variant.name, cs.name) });
      }
    }
  }

  figma.ui.postMessage({ type: 'connectors-discovered', count: connectorMap.length });
}

/**
 * Infere a categoria de acessibilidade a partir do nome da variante e do component set.
 * @param variantName - Nome da variante do conector
 * @param setName - Nome do component set
 * @returns Chave da categoria inferida
 */
function guessCategory(variantName: string, setName: string): string {
  const name = (variantName + ' ' + setName).toLowerCase();
  if (name.includes('funcao') || name.includes('função') || name.includes('valor')) return 'funcao-valor';
  if (name.includes('titulo') || name.includes('título') || name.includes('heading') || name.includes('h1')) return 'titulo';
  if (name.includes('nome') || name.includes('acessivel') || name.includes('acessível') || name.includes('alt')) return 'nome-acessivel';
  if (name.includes('decorativ')) return 'decorativo';
  if (name.includes('estrutur')) return 'estrutural';
  return 'outros';
}

/**
 * Coleta recursivamente todos os layers anotados com dados de acessibilidade.
 * @param node - Nó raiz para busca
 * @returns Lista de nós com seus dados de acessibilidade parseados
 */
function collectAllAnnotatedLayers(node: SceneNode): { node: SceneNode; data: LayerA11yData }[] {
  const result: { node: SceneNode; data: LayerA11yData }[] = [];
  const raw = node.getPluginData('a11y');
  if (raw) { try { result.push({ node, data: JSON.parse(raw) }); } catch (_e) { /* ignore */ } }
  if ('children' in node) {
    const parent = node as ChildrenMixin & SceneNode;
    for (let i = 0; i < parent.children.length; i++) {
      result.push(...collectAllAnnotatedLayers(parent.children[i]));
    }
  }
  return result;
}

// ════════════════════════════════════════
// HANDOFF HELPERS
// ════════════════════════════════════════

/**
 * Adiciona um filho ao frame pai e configura seu dimensionamento horizontal como FILL.
 * @param parent - Frame pai
 * @param child - Nó filho a adicionar
 */
function appendFill(parent: FrameNode, child: SceneNode): void {
  parent.appendChild(child);
  if ('layoutSizingHorizontal' in child) (child as any).layoutSizingHorizontal = 'FILL';
}

/**
 * Cria um nó de texto com fonte Inter e configurações de estilo.
 * @param chars - Conteúdo textual
 * @param size - Tamanho da fonte
 * @param style - Estilo da fonte ('Bold', 'Regular' ou 'Medium')
 * @param color - Cor do texto
 * @returns Nó de texto configurado
 */
function createText(chars: string, size: number, style: 'Bold' | 'Regular' | 'Medium', color: RGB): TextNode {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style }; t.fontSize = size;
  t.characters = chars;
  t.fills = [{ type: 'SOLID', color }];
  t.textAutoResize = 'HEIGHT';
  return t;
}

/**
 * Cria um frame de seção vertical com auto-layout.
 * @param spacing - Espaçamento entre itens (padrão: 16)
 * @returns Frame configurado como seção vertical
 */
function createSection(spacing: number = 16): FrameNode {
  const f = figma.createFrame();
  f.layoutMode = 'VERTICAL'; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = spacing; f.fills = [];
  return f;
}

/**
 * Cria um divisor horizontal (retângulo cinza de 1px de altura).
 * @returns Retângulo configurado como divisor
 */
function createDivider(): RectangleNode {
  const d = figma.createRectangle(); d.name = 'divider';
  d.resize(100, 1); d.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
  return d;
}

/**
 * Cria uma tag visual de tecla (estilo badge cinza arredondado).
 * @param text - Texto da tecla (ex.: "Tab", "Enter")
 * @returns Frame estilizado como tag de tecla
 */
function createKeyTag(text: string): FrameNode {
  const f = figma.createFrame();
  f.layoutMode = 'HORIZONTAL'; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.paddingLeft = 8; f.paddingRight = 8; f.paddingTop = 4; f.paddingBottom = 4;
  f.cornerRadius = 4;
  f.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  f.strokes = [{ type: 'SOLID', color: { r: 0.82, g: 0.82, b: 0.82 } }]; f.strokeWeight = 1;
  f.appendChild(createText(text, 11, 'Medium', C_BLACK));
  return f;
}

/**
 * Cria uma linha de tabela com células de largura configurável.
 * @param cells - Lista de nós (conteúdo de cada célula)
 * @param colWidths - Larguras das colunas (0 = FILL)
 * @param isHeader - Se true, aplica fundo de cabeçalho
 * @returns Frame configurado como linha de tabela
 */
function createTableRow(cells: SceneNode[], colWidths: number[], isHeader: boolean): FrameNode {
  const row = figma.createFrame();
  row.layoutMode = 'HORIZONTAL'; row.primaryAxisSizingMode = 'AUTO'; row.counterAxisSizingMode = 'AUTO';
  row.counterAxisAlignItems = 'CENTER';
  row.fills = [{ type: 'SOLID', color: isHeader ? { r: 0.96, g: 0.96, b: 0.96 } : C_WHITE }];
  for (let i = 0; i < cells.length; i++) {
    const cell = figma.createFrame();
    cell.layoutMode = 'HORIZONTAL'; cell.counterAxisAlignItems = 'CENTER';
    cell.primaryAxisSizingMode = 'AUTO'; cell.counterAxisSizingMode = 'AUTO';
    cell.paddingLeft = 12; cell.paddingRight = 12; cell.paddingTop = 10; cell.paddingBottom = 10;
    cell.fills = [];
    cell.appendChild(cells[i]);
    row.appendChild(cell);
    if (i < colWidths.length && colWidths[i] > 0) {
      cell.resize(colWidths[i], cell.height);
    } else {
      cell.layoutSizingHorizontal = 'FILL';
      if (cells[i].type === 'TEXT') (cells[i] as TextNode).layoutSizingHorizontal = 'FILL';
    }
  }
  return row;
}

/**
 * Cria uma tabela completa com cabeçalho e linhas de dados.
 * @param headers - Textos dos cabeçalhos
 * @param rows - Lista de linhas com conteúdo das células
 * @param col1W - Largura da primeira coluna
 * @returns Frame configurado como tabela
 */
function createTable(headers: string[], rows: { cells: (string | FrameNode)[] }[], col1W: number): FrameNode {
  const table = figma.createFrame();
  table.name = 'Table'; table.layoutMode = 'VERTICAL';
  table.primaryAxisSizingMode = 'AUTO'; table.counterAxisSizingMode = 'AUTO';
  table.itemSpacing = 0; table.fills = [];
  table.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }]; table.strokeWeight = 1;
  table.cornerRadius = 6; table.clipsContent = true;
  // Header
  const hCells = headers.map(h => createText(h, 11, 'Bold', C_BLACK));
  const hr = createTableRow(hCells as SceneNode[], [col1W], true);
  appendFill(table, hr);
  // Rows
  for (const r of rows) {
    const sep = figma.createRectangle(); sep.resize(100, 1);
    sep.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
    appendFill(table, sep);
    const rCells: SceneNode[] = r.cells.map(c => typeof c === 'string' ? createText(c, 11, 'Regular', C_GRAY) as SceneNode : c);
    const dr = createTableRow(rCells, [col1W], false);
    appendFill(table, dr);
  }
  return table;
}

/**
 * Cria uma caixa de informação/aviso com ícone e fundo amarelado.
 * @param text - Texto informativo a exibir
 * @returns Frame estilizado como caixa de aviso
 */
function createInfoBox(text: string): FrameNode {
  const box = figma.createFrame();
  box.layoutMode = 'HORIZONTAL'; box.primaryAxisSizingMode = 'AUTO'; box.counterAxisSizingMode = 'AUTO';
  box.paddingLeft = 16; box.paddingRight = 16; box.paddingTop = 14; box.paddingBottom = 14;
  box.itemSpacing = 10; box.counterAxisAlignItems = 'MIN';
  box.cornerRadius = 6;
  box.fills = [{ type: 'SOLID', color: C_WARN_BG }];
  box.strokes = [{ type: 'SOLID', color: C_WARN_BORDER }]; box.strokeWeight = 1;
  // Icon
  const icon = createText('⚠', 14, 'Regular', { r: 0.8, g: 0.6, b: 0.1 });
  box.appendChild(icon);
  // Text
  const txt = createText(text, 11, 'Regular', { r: 0.4, g: 0.33, b: 0.1 });
  txt.textAutoResize = 'HEIGHT';
  appendFill(box, txt);
  return box;
}

/**
 * Cria um badge circular numerado com cor sólida.
 * @param content - Texto do badge (ex.: "1", "2")
 * @param color - Cor de fundo do badge
 * @param size - Diâmetro do badge (padrão: 22)
 * @returns Frame circular com texto centralizado
 */
function createBadge(content: string, color: RGB, size: number = 22): FrameNode {
  const b = figma.createFrame();
  b.resize(size, size); b.cornerRadius = size / 2;
  b.fills = [{ type: 'SOLID', color }];
  b.layoutMode = 'HORIZONTAL'; b.primaryAxisAlignItems = 'CENTER'; b.counterAxisAlignItems = 'CENTER';
  b.primaryAxisSizingMode = 'FIXED'; b.counterAxisSizingMode = 'FIXED';
  const t = createText(content, size > 20 ? 11 : 9, 'Bold', C_WHITE);
  t.textAlignHorizontal = 'CENTER';
  b.appendChild(t);
  return b;
}

/**
 * Cria um badge com forma geométrica específica por categoria de acessibilidade.
 * @param content - Texto do badge
 * @param category - Categoria (define forma e cor: círculo, estrela, triângulo, etc.)
 * @param size - Tamanho do badge (padrão: 22)
 * @returns Frame com a forma e texto sobrepostos
 */
function createCategoryBadge(content: string, category: string, size: number = 22): FrameNode {
  const color = CAT_COLORS[category] || CAT_COLORS['outros'];
  const f = figma.createFrame();
  f.name = `badge-${category}`;
  f.resize(size, size);
  f.fills = [];
  f.layoutMode = 'NONE';

  const fontSize = size > 20 ? 11 : 9;

  switch (category) {
    case 'funcao-valor': {
      // Yellow circle
      const e = figma.createEllipse();
      e.resize(size, size); e.fills = [{ type: 'SOLID', color }];
      f.appendChild(e);
      break;
    }
    case 'estrutural': {
      // Coral star
      const s = figma.createStar();
      s.resize(size, size); s.fills = [{ type: 'SOLID', color }];
      s.innerRadius = 0.4; // 5-point star look
      f.appendChild(s);
      break;
    }
    case 'titulo': {
      // Olive/green circle
      const e = figma.createEllipse();
      e.resize(size, size); e.fills = [{ type: 'SOLID', color }];
      f.appendChild(e);
      break;
    }
    case 'nome-acessivel': {
      // Teal triangle
      const p = figma.createPolygon();
      p.resize(size, size); p.fills = [{ type: 'SOLID', color }];
      (p as any).pointCount = 3;
      f.appendChild(p);
      break;
    }
    case 'decorativo': {
      // Red circle with ⊘
      const e = figma.createEllipse();
      e.resize(size, size); e.fills = [{ type: 'SOLID', color }];
      f.appendChild(e);
      break;
    }
    case 'outros':
    default: {
      // Orange rounded square
      const r = figma.createRectangle();
      r.resize(size, size); r.cornerRadius = size * 0.22;
      r.fills = [{ type: 'SOLID', color }];
      f.appendChild(r);
      break;
    }
  }

  // Text label centered on shape
  const t = createText(content, fontSize, 'Bold', C_WHITE);
  t.textAlignHorizontal = 'CENTER';
  t.resize(size, size);
  t.textAlignVertical = 'CENTER';
  f.appendChild(t);

  return f;
}

/**
 * Cria um item de legenda com indicador de cor/forma e rótulo.
 * @param color - Cor do indicador
 * @param label - Texto descritivo da legenda
 * @param category - Categoria (opcional, para usar badge em vez de ponto)
 * @returns Frame horizontal com indicador e rótulo
 */
function createLegendItem(color: RGB, label: string, category?: string): FrameNode {
  const f = figma.createFrame();
  f.layoutMode = 'HORIZONTAL'; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = 6; f.counterAxisAlignItems = 'CENTER'; f.fills = [];
  if (category) {
    const badge = createCategoryBadge('', category, 12);
    f.appendChild(badge);
  } else {
    const dot = figma.createEllipse(); dot.resize(10, 10);
    dot.fills = [{ type: 'SOLID', color }];
    f.appendChild(dot);
  }
  f.appendChild(createText(label, 10, 'Regular', C_LIGHT_GRAY));
  return f;
}

/**
 * Cria uma linha de anotação com badge e texto descritivo.
 * @param badge - Badge visual (número ou forma de categoria)
 * @param text - Texto principal da anotação
 * @param subtext - Texto secundário (opcional, ex.: descrição do papel)
 * @returns Frame horizontal com badge e textos
 */
function createAnnotationRow(badge: FrameNode, text: string, subtext?: string): FrameNode {
  const row = figma.createFrame();
  row.layoutMode = 'HORIZONTAL'; row.primaryAxisSizingMode = 'AUTO'; row.counterAxisSizingMode = 'AUTO';
  row.itemSpacing = 10; row.counterAxisAlignItems = 'MIN'; row.fills = [];
  row.appendChild(badge);
  if (subtext) {
    const col = createSection(2);
    col.appendChild(createText(text, 12, 'Bold', C_BLACK));
    col.appendChild(createText(subtext, 11, 'Regular', C_GRAY));
    appendFill(row, col);
  } else {
    const t = createText(text, 12, 'Regular', C_GRAY);
    t.textAutoResize = 'HEIGHT';
    appendFill(row, t);
  }
  return row;
}

/**
 * Cria a tag "Preview" escura usada no canto de frames de preview.
 * @returns Frame estilizado como etiqueta "Preview"
 */
function createPreviewTag(): FrameNode {
  const tag = figma.createFrame();
  tag.layoutMode = 'HORIZONTAL'; tag.primaryAxisSizingMode = 'AUTO'; tag.counterAxisSizingMode = 'AUTO';
  tag.paddingLeft = 10; tag.paddingRight = 10; tag.paddingTop = 5; tag.paddingBottom = 5;
  tag.cornerRadius = 4;
  tag.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  tag.appendChild(createText('Preview', 11, 'Bold', C_WHITE));
  return tag;
}

/**
 * Coleta recursivamente todos os TextNodes dentro de uma árvore de nós.
 * @param node - Nó raiz para busca
 * @returns Lista de TextNodes encontrados
 */
function collectTextNodes(node: SceneNode): TextNode[] {
  if (node.type === 'TEXT') return [node as TextNode];
  const result: TextNode[] = [];
  if ('children' in node) {
    for (const child of (node as FrameNode).children) {
      result.push(...collectTextNodes(child as SceneNode));
    }
  }
  return result;
}

/**
 * Escala o tamanho da fonte de todos os TextNodes dentro de um nó.
 * @param node - Nó raiz contendo os textos
 * @param scale - Fator de escala (ex.: 2 para 200%)
 */
async function scaleTextNodes(node: SceneNode, scale: number): Promise<void> {
  const textNodes = collectTextNodes(node);
  if (textNodes.length === 0) return;

  // Collect unique fonts across all text nodes
  const fontSet = new Set<string>();
  const fonts: FontName[] = [];
  for (const tn of textNodes) {
    const len = tn.characters.length;
    for (let i = 0; i < len; i++) {
      const font = tn.getRangeFontName(i, i + 1);
      if (font !== figma.mixed) {
        const key = font.family + '|' + font.style;
        if (!fontSet.has(key)) { fontSet.add(key); fonts.push(font); }
      }
    }
  }

  // Load all fonts in parallel
  await Promise.all(fonts.map(f => figma.loadFontAsync(f).catch(() => {})));

  // Apply scale
  for (const tn of textNodes) {
    const len = tn.characters.length;
    for (let i = 0; i < len; i++) {
      const sz = tn.getRangeFontSize(i, i + 1);
      if (sz !== figma.mixed && typeof sz === 'number') {
        tn.setRangeFontSize(i, i + 1, Math.round(sz * scale));
      }
    }
  }
}

/**
 * Clona o componente fonte, criando instância ou clone conforme o tipo.
 * @param root - Nó raiz (COMPONENT, INSTANCE ou COMPONENT_SET)
 * @param workId - ID do nó de trabalho (instância temporária, para COMPONENT_SET)
 * @returns Clone do componente ou null
 */
async function cloneSource(root: SceneNode, workId: string | null): Promise<SceneNode | null> {
  if (root.type === 'COMPONENT') return (root as ComponentNode).createInstance();
  if (root.type === 'INSTANCE') return (root as InstanceNode).clone();
  if (root.type === 'COMPONENT_SET' && workId) {
    const w = await figma.getNodeByIdAsync(workId);
    if (w && w.type === 'INSTANCE') return (w as InstanceNode).clone();
  }
  return null;
}

/**
 * Cria o frame de preview com clone do componente e badges posicionados.
 * @param root - Nó raiz do componente
 * @param workId - ID do nó de trabalho
 * @param badges - Lista de badges a posicionar sobre o preview
 * @param contentWidth - Largura do frame de conteúdo
 * @returns Frame de preview ou null em caso de falha
 */
async function createPreviewFrame(
  root: SceneNode, workId: string | null,
  badges: { relX: number; relY: number; content: string; color: RGB; layerCenterY?: number; category?: string }[],
  contentWidth: number,
): Promise<FrameNode | null> {
  const clone = await cloneSource(root, workId);
  if (!clone) return null;

  const BADGE_SIZE = 22;
  const LINE_GAP = 4;
  const LINE_H = 24;
  const cW = clone.width; const cH = clone.height;
  const padTop = BADGE_SIZE + LINE_GAP + LINE_H + 24;
  const padBot = BADGE_SIZE + LINE_GAP + LINE_H + 24;
  const cloneX = (contentWidth - cW) / 2;
  const cloneY = padTop;

  const pf = figma.createFrame();
  pf.name = 'Preview'; pf.layoutMode = 'NONE';
  pf.resize(contentWidth, cH + padTop + padBot);
  pf.fills = [{ type: 'SOLID', color: C_WHITE }];
  pf.strokes = [{ type: 'SOLID', color: { r: 0.78, g: 0.78, b: 0.78 } }];
  pf.strokeWeight = 1; pf.dashPattern = [6, 4]; pf.cornerRadius = 8;

  // "Preview" tag
  const tag = createPreviewTag();
  tag.x = 12; tag.y = 12; pf.appendChild(tag);

  // Clone
  clone.x = cloneX; clone.y = cloneY; pf.appendChild(clone);

  // Separate badges into top and bottom based on position relative to center
  const centerY = cH / 2;
  for (const b of badges) {
    const isBottom = b.relY > centerY;
    const anchorX = cloneX + b.relX;
    const anchorY = isBottom
      ? cloneY + (b.layerCenterY ?? b.relY) + (b.layerCenterY ? 0 : 0)
      : cloneY + b.relY;

    // Connector line (gray)
    const line = figma.createFrame();
    line.name = 'connector'; line.fills = [];
    line.resize(2, LINE_H);
    line.fills = [{ type: 'SOLID', color: C_CONNECTOR_LINE }];

    // Use category badge if category provided, otherwise plain badge
    const makeBdg = () => b.category ? createCategoryBadge(b.content, b.category, BADGE_SIZE) : createBadge(b.content, b.color, BADGE_SIZE);

    if (isBottom) {
      // Badge below: line goes from layer bottom to badge
      const lineY = cloneY + (b.layerCenterY ?? b.relY);
      line.x = anchorX - 1;
      line.y = lineY;
      const badge = makeBdg();
      badge.x = anchorX - badge.width / 2;
      badge.y = lineY + LINE_H + LINE_GAP;
      pf.appendChild(line);
      pf.appendChild(badge);
    } else {
      // Badge above: line goes from badge bottom to layer top
      const badgeY = anchorY - LINE_H - LINE_GAP - BADGE_SIZE;
      line.x = anchorX - 1;
      line.y = anchorY - LINE_H;
      const badge = makeBdg();
      badge.x = anchorX - badge.width / 2;
      badge.y = badgeY;
      pf.appendChild(line);
      pf.appendChild(badge);
    }
  }

  return pf;
}

/**
 * Cria o frame de preview de áreas de toque com retângulos rosa e badges numerados.
 * @param root - Nó raiz do componente
 * @param workId - ID do nó de trabalho
 * @param touchAreas - Lista de áreas de toque a renderizar
 * @param contentWidth - Largura do frame de conteúdo
 * @returns Frame de preview das áreas de toque
 */
async function createTouchPreview(
  root: SceneNode, workId: string | null,
  touchAreas: TouchAreaRect[], contentWidth: number,
): Promise<FrameNode> {
  const INNER_PAD = 48;
  const TOUCH_COLOR: SolidPaint = { type: 'SOLID', color: { r: 1.0, g: 0.694, b: 0.62 }, opacity: 0.48 };

  const clone = await cloneSource(root, workId);
  if (!clone) {
    const empty = figma.createFrame(); empty.resize(contentWidth, 60); empty.fills = []; return empty;
  }

  const innerH = clone.height + INNER_PAD * 2;

  // Frame tracejado
  const pf = figma.createFrame();
  pf.name = 'Touch Preview'; pf.layoutMode = 'NONE';
  pf.resize(contentWidth, innerH);
  pf.fills = [{ type: 'SOLID', color: C_WHITE }];
  pf.strokes = [{ type: 'SOLID', color: { r: 0.72, g: 0.72, b: 0.72 } }];
  pf.strokeWeight = 2; pf.dashPattern = [10, 6]; pf.cornerRadius = 12;

  // Tag "Preview"
  const tag = createPreviewTag();
  tag.x = 14; tag.y = 14; pf.appendChild(tag);

  // Clone (behind)
  const cloneX = (contentWidth - clone.width) / 2;
  const cloneY = INNER_PAD;
  clone.x = cloneX; clone.y = cloneY;
  pf.appendChild(clone);

  // Touch area rectangles ON TOP of component with numbered badges
  for (let ti = 0; ti < touchAreas.length; ti++) {
    const ta = touchAreas[ti];
    const rect = figma.createRectangle();
    rect.resize(ta.width, ta.height);
    rect.x = cloneX + ta.x;
    rect.y = cloneY + ta.y;
    rect.fills = [TOUCH_COLOR];
    rect.strokes = [{ type: 'SOLID', color: { r: 1.0, g: 0.694, b: 0.62 } }];
    rect.strokeWeight = 1;
    pf.appendChild(rect);

    // Number badge on each touch area
    const areaBadge = createBadge(String(ti + 1), C_BLUE, 20);
    areaBadge.x = rect.x + rect.width / 2 - 10;
    areaBadge.y = rect.y - 24;
    if (areaBadge.y < 4) areaBadge.y = rect.y + rect.height + 4;
    pf.appendChild(areaBadge);
  }

  return pf;
}

// ════════════════════════════════════════
// HANDOFF GENERATION
// ════════════════════════════════════════

/**
 * Gera o documento de handoff completo a partir do zero (modo legado, sem template).
 * @param selectedVariantIds - IDs das variantes selecionadas para incluir no handoff
 */
async function generateHandoff(selectedVariantIds: string[] = []): Promise<void> {
  const targetId = workingNodeId || currentRootId;
  if (!targetId || !currentRootId) {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Nenhum componente selecionado.' });
    return;
  }
  const rootNode = await figma.getNodeByIdAsync(targetId);
  if (!rootNode) { figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Nó não encontrado.' }); return; }

  const root = rootNode as SceneNode;
  const rootBounds = root.absoluteBoundingBox;
  if (!rootBounds) { figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Sem dimensões.' }); return; }

  sendProgress('Lendo dados do componente...');
  const compSourceNode = (await figma.getNodeByIdAsync(currentRootId)) as SceneNode;
  const compRaw = compSourceNode.getPluginData('a11y-component');
  const compData = safeParseJson<ComponentA11yData>(compRaw, { platform: [], zoom: [] });

  const annotated = collectAllAnnotatedLayers(root);

  // Determine variants to include in handoff
  const isComponentSet = compSourceNode.type === 'COMPONENT_SET';
  const cs = isComponentSet ? compSourceNode as ComponentSetNode : null;
  interface VariantInfo { id: string; name: string; component: ComponentNode }
  const variantsToRender: VariantInfo[] = [];
  if (cs && selectedVariantIds.length > 0) {
    for (const vid of selectedVariantIds) {
      const child = cs.children.find(c => c.id === vid);
      if (child && child.type === 'COMPONENT') {
        variantsToRender.push({ id: child.id, name: child.name, component: child as ComponentNode });
      }
    }
  }

  // For per-variant handoff: restore variant-specific annotations to temp instances
  // so collectAllAnnotatedLayers picks up the right data per variant
  interface PerVariantAnnotations { variantName: string; annotated: { node: SceneNode; data: LayerA11yData }[] }
  const perVariantAnnotations: PerVariantAnnotations[] = [];
  // Collect per-variant data (annotations, touch areas, focus order) in a single loop
  interface PerVariantTouchData { variantName: string; touchAreas: TouchAreaRect[] }
  interface PerVariantFocusData { variantName: string; entries: FocusOrderEntry[] }
  const perVariantTouch: PerVariantTouchData[] = [];
  const perVariantFocus: PerVariantFocusData[] = [];
  const sharedFocusEntries = readFocusOrderRaw(compSourceNode as SceneNode);

  if (variantsToRender.length > 0) {
    for (const v of variantsToRender) {
      // Annotations
      const effectiveMap = await getEffectiveConsolidatedMap(v.name);
      const inst = v.component.createInstance();
      for (const [namePath, data] of Object.entries(effectiveMap)) {
        const node = findNodeByNamePath(inst, namePath);
        if (node && 'setPluginData' in node) {
          node.setPluginData('a11y', JSON.stringify(data));
        }
      }
      perVariantAnnotations.push({ variantName: v.name, annotated: collectAllAnnotatedLayers(inst) });
      inst.remove();

      // Touch areas
      perVariantTouch.push({ variantName: v.name, touchAreas: readTouchAreasRaw(compSourceNode as SceneNode, v.name) });

      // Focus order
      let entries = safeParseJson<FocusOrderEntry[]>(compSourceNode.getPluginData('a11y-focus-order::' + v.name), []);
      if (entries.length === 0 && sharedFocusEntries.length > 0) entries = sharedFocusEntries;
      perVariantFocus.push({ variantName: v.name, entries });
    }
  } else {
    perVariantTouch.push({ variantName: '', touchAreas: readTouchAreasRaw(compSourceNode as SceneNode) });
  }

  sendProgress('Carregando fontes...');
  await Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Bold' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
  ]);

  sendProgress('Criando documento de handoff...');

  const HANDOFF_WIDTH = 800;
  const HANDOFF_INNER_WIDTH = HANDOFF_WIDTH - 96; // 48px padding each side

  // ── Frame principal ──
  const doc = figma.createFrame();
  doc.name = `[A11Y Handoff] ${compSourceNode.name}`;
  doc.layoutMode = 'VERTICAL'; doc.primaryAxisSizingMode = 'AUTO'; doc.counterAxisSizingMode = 'FIXED';
  doc.resize(HANDOFF_WIDTH, 100);
  doc.paddingTop = 48; doc.paddingBottom = 48; doc.paddingLeft = 48; doc.paddingRight = 48;
  doc.itemSpacing = 40; doc.fills = [{ type: 'SOLID', color: C_WHITE }];
  doc.x = rootBounds.x + rootBounds.width + 120; doc.y = rootBounds.y;

  // ── Título ──
  appendFill(doc, createText('Acessibilidade', 24, 'Bold', C_BLUE));

  // ════════════════ MAPEAMENTO DO TECLADO ════════════════
  sendProgress('Mapeamento de teclado...');
  {
    const sec = createSection(12);
    appendFill(sec, createText('Mapeamento do Teclado', 16, 'Bold', C_BLACK));
    const kbEntries: { keys: string; action: string }[] = [];
    if (compData.kbMapping === 'none') {
      appendFill(sec, createText('Não possui mapeamento de teclado.', 12, 'Regular', C_BLACK));
    } else if (Array.isArray(compData.kbMapping) && compData.kbMapping.length > 0) {
      const csvKb = cachedKbData;
      if (csvKb && csvKb.length > 0) {
        const selectedSet = new Set(compData.kbMapping);
        for (const e of csvKb) {
          if (selectedSet.has(e.keys + '|' + e.action)) kbEntries.push(e);
        }
      }
      if (kbEntries.length > 0) {
        const tableRows = kbEntries.map(e => ({ cells: [createKeyTag(e.keys) as FrameNode | string, e.action] }));
        appendFill(sec, createTable(['Tecla(s)', 'Ação'], tableRows, 240));
      }
    } else {
      appendFill(sec, createText('Nenhum mapeamento de teclado definido.', 12, 'Regular', C_BLACK));
    }
    appendFill(doc, sec);
  }

  // ════════════════ GESTOS COM O LEITOR DE TELA ════════════════
  sendProgress('Gestos do leitor de tela...');
  {
    const sec = createSection(12);
    appendFill(sec, createText('Gestos com o Leitor de Tela', 16, 'Bold', C_BLACK));
    const gestEntries: { gesture: string; action: string }[] = [];
    if (compData.gestureMapping === 'none') {
      appendFill(sec, createText('Não possui mapeamento de gestos.', 12, 'Regular', C_BLACK));
    } else if (Array.isArray(compData.gestureMapping) && compData.gestureMapping.length > 0) {
      const csvGesture = cachedGestureData;
      if (csvGesture && csvGesture.length > 0) {
        const selectedSet = new Set(compData.gestureMapping);
        for (const e of csvGesture) {
          if (selectedSet.has(e.gesture + '|' + e.action)) gestEntries.push(e);
        }
      }
      if (gestEntries.length > 0) {
        const tableRows = gestEntries.map(e => ({ cells: [e.gesture, e.action] }));
        appendFill(sec, createTable(['Gestos', 'Ação'], tableRows, 240));
      }
    } else {
      appendFill(sec, createText('Nenhum mapeamento de gestos definido.', 12, 'Regular', C_BLACK));
    }
    appendFill(doc, sec);
  }

  appendFill(doc, createDivider());

  // ════════════════ TAMANHO DE ÁREA DE CLIQUE E TOQUE ════════════════
  sendProgress('Áreas de toque...');
  {
    const sec = createSection(16);
    appendFill(sec, createText('Tamanho de Área de Clique e Toque', 16, 'Bold', C_BLACK));

    const anyTouchAreas = perVariantTouch.some(pv => pv.touchAreas.length > 0);
    if (anyTouchAreas) {
      if (variantsToRender.length > 1) {
        // Multi-variant: side-by-side touch previews
        const touchRow = figma.createFrame();
        touchRow.name = 'Touch Variants'; touchRow.layoutMode = 'HORIZONTAL';
        touchRow.primaryAxisSizingMode = 'AUTO'; touchRow.counterAxisSizingMode = 'AUTO';
        touchRow.itemSpacing = 40; touchRow.fills = [];
        const perVarWidth = Math.floor((HANDOFF_INNER_WIDTH - 40 * (variantsToRender.length - 1)) / variantsToRender.length);

        for (let vi = 0; vi < variantsToRender.length; vi++) {
          const v = variantsToRender[vi];
          const pvData = perVariantTouch[vi];
          const varCol = createSection(8);
          appendFill(varCol, createText(v.name, 12, 'Bold', C_BLACK));
          const inst = v.component.createInstance();
          const touchPf = await createTouchPreview(inst, inst.id, pvData.touchAreas, perVarWidth);
          inst.remove();
          appendFill(varCol, touchPf);
          for (let i = 0; i < pvData.touchAreas.length; i++) {
            const a = pvData.touchAreas[i];
            const w = Math.round(a.width), h = Math.round(a.height);
            const minDim = Math.min(w, h);
            let level = 'Insuficiente — não atende WCAG 2.5.8';
            if (minDim >= 44) level = 'Aprimorado — atende WCAG 2.5.5 (≥44px)';
            else if (minDim >= 24) level = 'Mínimo — atende WCAG 2.5.8 (≥24px)';
            appendFill(varCol, createAnnotationRow(createBadge(String(i + 1), C_BLUE), `Área ${i + 1} — ${w} × ${h}px`, level));
          }
          touchRow.appendChild(varCol);
        }
        appendFill(sec, touchRow);
      } else {
        // Single variant
        const touchAreas = perVariantTouch[0].touchAreas;
        const pf = await createTouchPreview(root, workingNodeId, touchAreas, HANDOFF_INNER_WIDTH);
        appendFill(sec, pf);
        for (let i = 0; i < touchAreas.length; i++) {
          const a = touchAreas[i];
          const w = Math.round(a.width), h = Math.round(a.height);
          const minDim = Math.min(w, h);
          let level = 'Insuficiente — não atende WCAG 2.5.8';
          if (minDim >= 44) level = 'Aprimorado — atende WCAG 2.5.5 (≥44px)';
          else if (minDim >= 24) level = 'Mínimo — atende WCAG 2.5.8 (≥24px)';
          appendFill(sec, createAnnotationRow(createBadge(String(i + 1), C_BLUE), `Área ${i + 1} — ${w} × ${h}px`, level));
        }
      }
    } else {
      appendFill(sec, createText('Nenhuma área de toque definida.', 11, 'Regular', C_LIGHT_GRAY));
    }

    appendFill(doc, sec);
  }

  appendFill(doc, createDivider());

  // ════════════════ ORDEM DE FOCO POR TABULAÇÃO ════════════════
  sendProgress('Ordem de foco...');
  {
    const sec = createSection(16);
    appendFill(sec, createText('Ordem de Foco por Tabulação', 16, 'Bold', C_BLACK));

    // Info box
    appendFill(sec, createInfoBox(
      'Ordem de foco por tabulação é a ordem em que os elementos interativos de uma página recebem foco do teclado (ao pressionar a tecla Tab). ' +
      'Ela deve ser lógica, intuitiva e deve preservar o significado e a operabilidade da interface. ' +
      'Para idiomas ocidentais, a sequência padrão é da esquerda para a direita, do topo para a base.'
    ));

    if (compData.noTab) {
      appendFill(sec, createAnnotationRow(createBadge('—', C_LIGHT_GRAY), 'Este componente não tem tabulação.'));
    } else {
      // Focus order — shared, single preview (include root itself)
      const zones: LayerZone[] = [{
        id: root.id, name: root.name, type: root.type,
        x: 0, y: 0, width: rootBounds.width, height: rootBounds.height,
        depth: 0, hasA11yData: false, category: '', parentId: '', hasChildren: true,
      }, ...collectLayerZones(root, rootBounds, 1, root.id)];
      const focusBadges = sharedFocusEntries.map((e, i) => {
        const zone = zones.find(z => z.id === e.nodeId);
        return zone ? { relX: zone.x + zone.width / 2, relY: zone.y, content: String(i + 1), color: C_BLUE, layerCenterY: zone.y + zone.height } : null;
      }).filter((b): b is NonNullable<typeof b> => b !== null);
      const pf = await createPreviewFrame(root, workingNodeId, focusBadges, HANDOFF_INNER_WIDTH);
      if (pf) appendFill(sec, pf);

      if (sharedFocusEntries.length > 0) {
        const nameMap = new Map(collectAnnotatedNodes(root).map(n => [n.nodeId, n.name]));
        for (const e of sharedFocusEntries) {
          const nm = nameMap.get(e.nodeId) || '?';
          const catLabel = e.category ? CATEGORY_LABELS[e.category] || e.category : '';
          appendFill(sec, createAnnotationRow(createBadge(String(e.order), C_BLUE), nm, catLabel || undefined));
        }
      } else {
        appendFill(sec, createText('Nenhuma ordem de foco definida.', 11, 'Regular', C_LIGHT_GRAY));
      }
    }

    appendFill(doc, sec);
  }

  appendFill(doc, createDivider());

  // ════════════════ LEITOR DE TELA ════════════════
  sendProgress('Leitor de tela...');
  {
    const sec = createSection(16);
    appendFill(sec, createText('Leitor de Tela', 16, 'Bold', C_BLACK));

    // Screen reader — shared, single preview (include root itself)
    const zones: LayerZone[] = [{
      id: root.id, name: root.name, type: root.type,
      x: 0, y: 0, width: rootBounds.width, height: rootBounds.height,
      depth: 0, hasA11yData: false, category: '', parentId: '', hasChildren: true,
    }, ...collectLayerZones(root, rootBounds, 1, root.id)];
    let srNumIdx = 1;
    const srBadges = annotated.map((a) => {
      const zone = zones.find(z => z.id === a.node.id);
      const color = CAT_COLORS[a.data.category] || CAT_COLORS['outros'];
      const cat = a.data.category || 'outros';
      const content = cat === 'decorativo' ? '⊘' : (cat === 'titulo' && a.data.headingLevel ? `H${a.data.headingLevel}` : String(srNumIdx++));
      return zone ? { relX: zone.x + zone.width / 2, relY: zone.y, content, color, category: cat, layerCenterY: zone.y + zone.height } : null;
    }).filter((b): b is NonNullable<typeof b> => b !== null);
    const pf = await createPreviewFrame(root, workingNodeId, srBadges, HANDOFF_INNER_WIDTH);
    if (pf) appendFill(sec, pf);

    // Legend
    if (annotated.length > 0) {
      const legend = figma.createFrame();
      legend.layoutMode = 'HORIZONTAL'; legend.primaryAxisSizingMode = 'AUTO'; legend.counterAxisSizingMode = 'AUTO';
      legend.itemSpacing = 16; legend.fills = [];
      const usedCats = [...new Set(annotated.map(a => a.data.category).filter(Boolean))];
      for (const cat of usedCats) {
        legend.appendChild(createLegendItem(CAT_COLORS[cat] || CAT_COLORS['outros'], CATEGORY_LABELS[cat] || cat, cat));
      }
      appendFill(sec, legend);
    }

    // Annotations — use same labels as preview badges
    if (annotated.length === 0) {
      appendFill(sec, createText('Nenhuma anotação definida.', 11, 'Regular', C_LIGHT_GRAY));
    }
    // Build label map: decorativo → ⊘, others → sequential number
    let numIdx = 1;
    const labels: string[] = annotated.map(a => {
      if (a.data.category === 'decorativo') return '⊘';
      return String(numIdx++);
    });
    for (let i = 0; i < annotated.length; i++) {
      const { node: ln, data: d } = annotated[i];
      const label = labels[i];

      if (d.category === 'decorativo') {
        appendFill(sec, createAnnotationRow(createCategoryBadge('⊘', 'decorativo'), 'Não deve ser anunciado pelo Leitor de Tela.'));
      } else {
        let roleDesc = '';
        if (d.role && d.role !== 'dont-read') roleDesc = `Identificar como ${d.role}`;
        if (d.specification) roleDesc += (roleDesc ? ' — ' : '') + `Especificação: ${d.specification}`;
        if (d.accessibleName) roleDesc += (roleDesc ? ' — ' : '') + `Nome acessível: "${d.accessibleName}"`;
        if (d.altText) roleDesc += (roleDesc ? ' — ' : '') + `Texto alt.: "${d.altText}"`;
        if (d.headingLevel) roleDesc += (roleDesc ? ' — ' : '') + `Nível h${d.headingLevel}`;
        const badgeContent = d.category === 'titulo' && d.headingLevel ? `H${d.headingLevel}` : label;
        appendFill(sec, createAnnotationRow(createCategoryBadge(badgeContent, d.category || 'outros'), ln.name, roleDesc || undefined));
        if (d.explanation) appendFill(sec, createInfoBox(d.explanation));
        const resolvedNote = resolveCodeNote(
          { role: d.role, specification: d.specification, codeNote: d.codeNote },
          compData.platform || []
        );
        if (resolvedNote && resolvedNote !== 'NA') appendFill(sec, createInfoBox('Nota de código: ' + resolvedNote));
        if (d.observation) appendFill(sec, createInfoBox('Observação: ' + d.observation));
      }
    }

    appendFill(doc, sec);
  }

  // ════════════════ CONECTORES ════════════════
  sendProgress('Posicionando conectores...');
  let connectorsPlaced = 0;
  if (connectorMap.length > 0 && annotated.length > 0) {
    for (const { node: ln, data: d } of annotated) {
      const lb = ln.absoluteBoundingBox;
      if (!lb) continue;
      let conn = connectorMap.find(c => c.category === d.category);
      if (!conn) conn = connectorMap.find(c => c.category === 'outros');
      if (!conn) conn = connectorMap[0];
      if (!conn) continue;
      try {
        const comp = await figma.importComponentByKeyAsync(conn.componentKey);
        const inst = comp.createInstance();
        inst.x = lb.x + lb.width + 8;
        inst.y = lb.y + (lb.height / 2) - (inst.height / 2);
        figma.currentPage.appendChild(inst);
        connectorsPlaced++;
      } catch (_e) { /* ignore */ }
    }
  }

  // ════════════════ ZOOM ════════════════
  sendProgress('Gerando instâncias de zoom...');
  let zoomInstancesCreated = 0;
  const zoomConfigs: { key: string; scale: number; label: string }[] = [];
  if (compData.zoom.includes('resize-text')) zoomConfigs.push({ key: 'resize-text', scale: 2, label: 'Zoom 200% — Redimensionar Texto' });
  if (compData.zoom.includes('reflow')) zoomConfigs.push({ key: 'reflow', scale: 4, label: 'Zoom 400% — Refluxo' });

  if (zoomConfigs.length > 0) {
    appendFill(doc, createDivider());

    const zoomSec = createSection(24);
    appendFill(zoomSec, createText('Instâncias de Zoom', 16, 'Bold', C_BLACK));

    const zoomRow = figma.createFrame();
    zoomRow.layoutMode = 'HORIZONTAL'; zoomRow.primaryAxisSizingMode = 'AUTO'; zoomRow.counterAxisSizingMode = 'AUTO';
    zoomRow.itemSpacing = 24; zoomRow.fills = [];

    for (const zc of zoomConfigs) {
      try {
        const zoomInst = await cloneSource(root, workingNodeId);
        if (!zoomInst) continue;

        const zoomCard = figma.createFrame();
        zoomCard.name = zc.label; zoomCard.layoutMode = 'VERTICAL';
        zoomCard.primaryAxisSizingMode = 'AUTO'; zoomCard.counterAxisSizingMode = 'AUTO';
        zoomCard.counterAxisAlignItems = 'CENTER';
        zoomCard.itemSpacing = 12;
        zoomCard.paddingTop = 24; zoomCard.paddingBottom = 24; zoomCard.paddingLeft = 24; zoomCard.paddingRight = 24;
        zoomCard.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
        zoomCard.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        zoomCard.strokeWeight = 1; zoomCard.cornerRadius = 8;

        zoomCard.appendChild(createText(zc.label, 12, 'Bold', C_GRAY));

        if (zc.key === 'resize-text') {
          // Only scale text nodes, not the whole component
          await scaleTextNodes(zoomInst, zc.scale);
        } else {
          // Reflow: scale the entire component
          if ('rescale' in zoomInst) (zoomInst as InstanceNode).rescale(zc.scale);
        }

        zoomCard.appendChild(zoomInst);
        zoomRow.appendChild(zoomCard);
        zoomInstancesCreated++;
      } catch (_e) { /* ignore */ }
    }

    appendFill(zoomSec, zoomRow);
    appendFill(doc, zoomSec);
  }

  sendProgress('Publicando dados compartilhados...');
  await publishSharedA11yData();

  sendProgress('Finalizando...');
  await cleanupTempInstance();
  figma.viewport.scrollAndZoomIntoView([doc]);
  const totalTouchAreas = perVariantTouch.reduce((s, pv) => s + pv.touchAreas.length, 0);
  figma.ui.postMessage({
    type: 'handoff-result', success: true,
    connectorsPlaced, layersAnnotated: annotated.length,
    zoomInstances: zoomInstancesCreated, touchAreas: totalTouchAreas,
  });
}

// ════════════════════════════════════════
// HANDOFF VIA TEMPLATE (Fase 1)
// ════════════════════════════════════════

/**
 * Busca um filho por nome dentro de um nó com filhos.
 * @param parent - Nó pai
 * @param name - Nome exato do filho a buscar
 * @returns Nó encontrado ou null
 */
function findByName(parent: ChildrenMixin & BaseNode, name: string): SceneNode | null {
  return parent.findOne((n: SceneNode) => n.name === name) as SceneNode | null;
}

/**
 * Obtém uma seção limpa do template importando, destacando e extraindo pelo nome.
 * @param tplKey - Chave do componente template
 * @param sectionName - Nome da seção a extrair
 * @returns Seção extraída ou null em caso de falha
 */
/**
 * Cria um frame detachado a partir do template — tenta importar pela key publicada,
 * se falhar (não publicado), faz clone+detach do nó local via tplNodeId.
 * Retorna o frame detachado (caller é responsável por remover) ou null.
 */
async function createDetachedTemplate(tplKey: string, tplNodeId?: string): Promise<FrameNode | null> {
  // 1. Tenta pela key publicada
  try {
    const tplComp = await figma.importComponentByKeyAsync(tplKey);
    if (tplComp) {
      const inst = tplComp.createInstance();
      return inst.detachInstance();
    }
  } catch (_e) { /* unpublished — fallback to local node */ }

  // 2. Fallback: usa o nó local
  if (tplNodeId) {
    const tplNode = await figma.getNodeByIdAsync(tplNodeId);
    if (tplNode) {
      if (tplNode.type === 'INSTANCE') {
        const cloned = (tplNode as InstanceNode).clone();
        const detached = cloned.detachInstance();
        return detached;
      } else if (tplNode.type === 'COMPONENT') {
        const inst = (tplNode as ComponentNode).createInstance();
        return inst.detachInstance();
      } else if (tplNode.type === 'COMPONENT_SET') {
        const cs = tplNode as ComponentSetNode;
        const variant = cs.children.find(c => c.type === 'COMPONENT' && c.name.includes('Acessibility')) as ComponentNode | undefined;
        const inst = (variant || cs.children[0] as ComponentNode).createInstance();
        return inst.detachInstance();
      }
    }
  }

  return null;
}

async function getTemplateSectionFresh(tplKey: string, sectionName: string, tplNodeId?: string): Promise<SceneNode | null> {
  const detached = await createDetachedTemplate(tplKey, tplNodeId);
  if (!detached) return null;
  const section = findByName(detached, sectionName);
  if (!section) { detached.remove(); return null; }
  figma.currentPage.appendChild(section); // move out before removing parent
  detached.remove();
  return section;
}

/**
 * Clona o template UMA única vez e mapeia TODAS as seções sem movê-las para o root da página.
 * As seções permanecem dentro de `detached` até serem consumidas pelo caller via insertChild()
 * (que move diretamente de detached → destino sem passar pelo root). O caller é responsável
 * por chamar `detached.remove()` ao final para limpar quaisquer seções não consumidas.
 * @param tplKey - Chave do componente template
 * @param tplNodeId - ID do nó template (fallback local)
 * @returns Mapa nome→seção, lista ordenada de nomes e referência ao frame detachado
 */
async function getTemplateSectionsAll(
  tplKey: string,
  tplNodeId?: string
): Promise<{ sections: Map<string, SceneNode>; allNames: string[]; detached: FrameNode | null }> {
  const detached = await createDetachedTemplate(tplKey, tplNodeId);
  if (!detached) return { sections: new Map(), allNames: [], detached: null };

  const allNames = (detached.children as SceneNode[])
    .filter(c => c.type === 'FRAME' || c.type === 'SECTION')
    .map(c => c.name);

  const result = new Map<string, SceneNode>();
  for (const child of [...detached.children] as SceneNode[]) {
    if (child.type !== 'FRAME' && child.type !== 'SECTION') continue;
    // Não mover para o root da página — manter dentro de `detached`.
    // insertChild() do Figma move diretamente entre quaisquer dois parents.
    result.set(child.name, child);
  }
  return { sections: result, allNames, detached };
}

/**
 * Retorna os nomes dos filhos diretos (frames) do template,
 * na ordem em que aparecem. Usado para detectar seções novas no template.
 */
async function getTemplateSectionNames(tplKey: string, tplNodeId?: string): Promise<string[]> {
  const detached = await createDetachedTemplate(tplKey, tplNodeId);
  if (!detached) return [];
  const names = detached.children
    .filter(c => c.type === 'FRAME' || c.type === 'SECTION')
    .map(c => c.name);
  detached.remove();
  return names;
}

/** Dados de áreas de toque por variante para uso no handoff via template. */
interface TplPerVariantTouch {
  /** Nome da variante (vazio = compartilhado) */
  variantName: string;
  /** Nome para exibição */
  displayName: string;
  /** Lista de áreas de toque */
  touchAreas: TouchAreaRect[];
  /** Referência ao componente da variante */
  component: ComponentNode | null;
  /** Propriedades a aplicar na instância (para variant configs) */
  variantProperties?: Record<string, any>;
}

/** Dados de ordem de foco por variante para uso no handoff via template. */
interface TplPerVariantFocus {
  /** Nome da variante (vazio = compartilhado) */
  variantName: string;
  /** Nome para exibição */
  displayName: string;
  /** Entradas de ordem de foco com namePath opcional */
  entries: (FocusOrderEntry & { namePath?: string })[];
  /** Referência ao componente da variante */
  component: ComponentNode | null;
  /** Propriedades a aplicar na instância (para variant configs) */
  variantProperties?: Record<string, any>;
}

/** Dados de anotações de leitor de tela por variante para uso no handoff via template. */
interface TplPerVariantAnnotations {
  /** Nome da variante (vazio = compartilhado) */
  variantName: string;
  /** Nome para exibição */
  displayName: string;
  /** Anotações desta variante */
  annotations: { name: string; namePath: string; data: LayerA11yData }[];
  /** Referência ao componente da variante */
  component: ComponentNode | null;
}

/** Dados de anotações unificadas por variante para uso no handoff via template. */
interface TplPerVariantUnified {
  /** Nome da variante (vazio = compartilhado) */
  variantName: string;
  /** Nome para exibição */
  displayName: string;
  /** Entradas unificadas desta variante */
  entries: UnifiedAnnotationEntry[];
  /** Referência ao componente da variante */
  component: ComponentNode | null;
  /** Propriedades a aplicar na instância (para variant configs) */
  variantProperties?: Record<string, any>;
}

/** Todos os dados necessários para gerar o handoff via template. */
interface HandoffData {
  /** Dados de acessibilidade do componente raiz */
  compData: ComponentA11yData;
  /** Nó fonte do componente */
  compSourceNode: SceneNode;
  /** Entradas de mapeamento de teclado resolvidas */
  kbEntries: { keys: string; action: string }[];
  /** Entradas de mapeamento de gestos resolvidas */
  gestEntries: { gesture: string; action: string }[];
  /** Áreas de toque por variante */
  tplPerVariantTouch: TplPerVariantTouch[];
  /** Todas as áreas de toque achatadas com índice global */
  allTouchEntries: { displayName: string; area: TouchAreaRect; globalIndex: number; componentWidth: number }[];
  /** Ordens de foco por variante */
  tplPerVariantFocus: TplPerVariantFocus[];
  /** Anotações unificadas por variante */
  tplPerVariantUnified: TplPerVariantUnified[];
  /** Anotações de leitor de tela (roles) — compartilhadas (Legacy) */
  annotations: { name: string; namePath: string; data: LayerA11yData }[];
  /** Anotações por variante (Legacy) */
  tplPerVariantAnnotations: TplPerVariantAnnotations[];
  /** Agrupamentos (Legacy) */
  agrupamentos: AgrupamentoRect[];
  /** Combinados (Legacy) */
  combinados: CombinadoEntry[];
}

/**
 * Lê todos os dados necessários para o handoff a partir de um componente fonte.
 * @param compSourceNode - Nó fonte do componente
 * @returns Dados consolidados para geração do handoff
 */
async function readHandoffData(compSourceNode: SceneNode): Promise<HandoffData> {
  // Read component data
  const compRaw = compSourceNode.getPluginData('a11y-component');
  const compData = safeParseJson<ComponentA11yData>(compRaw, { platform: [], zoom: [] });

  // Read custom variant names (excNames)
  const excNamesRaw = compSourceNode.getPluginData('a11y-exc-names');
  const excNames = safeParseJson<Record<string, Record<string, string>>>(excNamesRaw, {});
  /** Resolve o nome customizado para uma variante, ou retorna o nome original */
  const resolveDisplayName = (variantName: string, dataType: 'roles' | 'touch' | 'focus'): string => {
    const map = excNames[dataType];
    return (map && map[variantName]) || variantName;
  };

  // Read keyboard mapping
  const kbEntries: { keys: string; action: string }[] = [];
  if (compData.kbMapping !== 'none' && Array.isArray(compData.kbMapping) && compData.kbMapping.length > 0) {
    const csvKb = cachedKbData;
    if (csvKb && csvKb.length > 0) {
      const selectedSet = new Set(compData.kbMapping);
      for (const e of csvKb) {
        if (selectedSet.has(e.keys + '|' + e.action)) kbEntries.push(e);
      }
    }
  }

  // Read gesture mapping
  const gestEntries: { gesture: string; action: string }[] = [];
  if (compData.gestureMapping !== 'none' && Array.isArray(compData.gestureMapping) && compData.gestureMapping.length > 0) {
    const csvGesture = cachedGestureData;
    if (csvGesture && csvGesture.length > 0) {
      const selectedSet = new Set(compData.gestureMapping);
      for (const e of csvGesture) {
        if (selectedSet.has(e.gesture + '|' + e.action)) gestEntries.push(e);
      }
    }
  }

  // Read touch areas
  const touchAreas = readTouchAreasRaw(compSourceNode as SceneNode);

  // Read focus order
  const focusEntries: (FocusOrderEntry & { namePath?: string })[] = readFocusOrderRaw(compSourceNode as SceneNode);

  // Read variant configs (user-created parametrized variants)
  const variantConfigs = readVariantConfigs(compSourceNode as SceneNode);
  /** Retorna o componente base para instanciar (defaultVariant ou próprio componente) */
  const getBaseComponent = (): ComponentNode | null => {
    if (compSourceNode.type === 'COMPONENT_SET') {
      const cs = compSourceNode as ComponentSetNode;
      return (cs.defaultVariant || cs.children[0]) as ComponentNode;
    } else if (compSourceNode.type === 'COMPONENT') {
      return compSourceNode as ComponentNode;
    }
    return null;
  };

  // Collect per-variant touch areas
  const tplPerVariantTouch: TplPerVariantTouch[] = [];
  if (compSourceNode.type === 'COMPONENT_SET') {
    const cs = compSourceNode as ComponentSetNode;
    const defaultVariant = (cs.defaultVariant || cs.children[0]) as ComponentNode;
    if (touchAreas.length > 0) {
      tplPerVariantTouch.push({ variantName: '', displayName: 'Default', touchAreas, component: defaultVariant });
    }
    for (const child of cs.children) {
      if (child.type !== 'COMPONENT') continue;
      const vKey = 'a11y-touch-areas::' + child.name;
      const vRaw = compSourceNode.getPluginData(vKey);
      if (vRaw) {
        try {
          const ta = JSON.parse(vRaw) as TouchAreaRect[];
          if (ta.length > 0) {
            tplPerVariantTouch.push({ variantName: child.name, displayName: resolveDisplayName(child.name, 'touch'), touchAreas: ta, component: child as ComponentNode });
          }
        } catch (_e) { /* ignore */ }
      }
    }
  } else if (compSourceNode.type === 'COMPONENT') {
    if (touchAreas.length > 0) {
      tplPerVariantTouch.push({ variantName: '', displayName: '', touchAreas, component: compSourceNode as ComponentNode });
    }
  }
  // Variant configs touch areas
  for (const vc of variantConfigs) {
    const vRaw = compSourceNode.getPluginData('a11y-touch-areas::' + vc.id);
    if (vRaw) {
      try {
        const ta = JSON.parse(vRaw) as TouchAreaRect[];
        if (ta.length > 0) {
          const baseComp = getBaseComponent();
          tplPerVariantTouch.push({ variantName: vc.id, displayName: vc.label, touchAreas: ta, component: baseComp, variantProperties: vc.properties });
        }
      } catch (_e) { /* ignore */ }
    }
  }

  // Flatten all touch entries
  const allTouchEntries: { displayName: string; area: TouchAreaRect; globalIndex: number; componentWidth: number }[] = [];
  let globalIdx = 0;
  for (const pv of tplPerVariantTouch) {
    const compW = pv.component ? pv.component.width : 0;
    for (const ta of pv.touchAreas) {
      allTouchEntries.push({ displayName: pv.displayName, area: ta, globalIndex: globalIdx, componentWidth: compW });
      globalIdx++;
    }
  }

  // Collect per-variant focus orders
  const tplPerVariantFocus: TplPerVariantFocus[] = [];
  if (compSourceNode.type === 'COMPONENT_SET') {
    const cs = compSourceNode as ComponentSetNode;
    const defaultVariant = (cs.defaultVariant || cs.children[0]) as ComponentNode;
    if (focusEntries.length > 0) {
      tplPerVariantFocus.push({ variantName: '', displayName: 'Default', entries: focusEntries, component: defaultVariant });
    }
    for (const child of cs.children) {
      if (child.type !== 'COMPONENT') continue;
      const vRaw = compSourceNode.getPluginData('a11y-focus-order::' + child.name);
      if (vRaw) {
        try {
          const entries = JSON.parse(vRaw) as (FocusOrderEntry & { namePath?: string })[];
          if (entries.length > 0) {
            tplPerVariantFocus.push({ variantName: child.name, displayName: resolveDisplayName(child.name, 'focus'), entries, component: child as ComponentNode });
          }
        } catch (_e) { /* ignore */ }
      }
    }
  } else if (compSourceNode.type === 'COMPONENT') {
    if (focusEntries.length > 0) {
      tplPerVariantFocus.push({ variantName: '', displayName: '', entries: focusEntries, component: compSourceNode as ComponentNode });
    }
  }
  // Variant configs focus orders
  for (const vc of variantConfigs) {
    const vRaw = compSourceNode.getPluginData('a11y-focus-order::' + vc.id);
    if (vRaw) {
      try {
        const entries = JSON.parse(vRaw) as (FocusOrderEntry & { namePath?: string })[];
        if (entries.length > 0) {
          const baseComp = getBaseComponent();
          tplPerVariantFocus.push({ variantName: vc.id, displayName: vc.label, entries, component: baseComp, variantProperties: vc.properties });
        }
      } catch (_e) { /* ignore */ }
    }
  }

  // ── Unified SR Annotations ──
  const sharedUnified = readUnifiedAnnotationsRaw(compSourceNode as SceneNode);
  const tplPerVariantUnified: TplPerVariantUnified[] = [];

  const buildUnifiedForVariant = (variantName: string): UnifiedAnnotationEntry[] => {
    const node = compSourceNode as SceneNode;
    const result = variantHasOwnData(node, variantName)
      ? readUnifiedAnnotationsRaw(node, variantName)
      : [...sharedUnified];
    result.sort((a, b) => a.order - b.order);
    return result;
  };

  if (compSourceNode.type === 'COMPONENT_SET') {
    const cs = compSourceNode as ComponentSetNode;
    const defaultVariant = (cs.defaultVariant || cs.children[0]) as ComponentNode;

    // 1. Default variant
    const defEntries = buildUnifiedForVariant(defaultVariant.name);
    if (defEntries.length > 0) {
      const customName = resolveDisplayName(defaultVariant.name, 'roles');
      const displayName = customName !== defaultVariant.name ? customName : 'Default';
      tplPerVariantUnified.push({ variantName: defaultVariant.name, displayName, entries: defEntries, component: defaultVariant });
    }

    // 2. Other variants
    for (const child of cs.children) {
      if (child.type !== 'COMPONENT' || child.id === defaultVariant.id) continue;
      const vRaw = compSourceNode.getPluginData(KEY_SR_UNIFIED + child.name);
      if (!vRaw) continue;
      const vEntries = safeParseJson<UnifiedAnnotationEntry[]>(vRaw, []);
      if (vEntries.length === 0) continue;

      const mergedEntries = buildUnifiedForVariant(child.name);
      const customName = resolveDisplayName(child.name, 'roles');
      const displayName = customName !== child.name ? customName : child.name;
      tplPerVariantUnified.push({ variantName: child.name, displayName, entries: mergedEntries, component: child as ComponentNode });
    }
  } else if (compSourceNode.type === 'COMPONENT') {
    if (sharedUnified.length > 0) {
      tplPerVariantUnified.push({ variantName: '', displayName: '', entries: sharedUnified, component: compSourceNode as ComponentNode });
    }
  }
  // Variant configs unified SR annotations
  for (const vc of variantConfigs) {
    const vRaw = compSourceNode.getPluginData('a11y-sr-unified::' + vc.id);
    if (vRaw) {
      const vcEntries = safeParseJson<UnifiedAnnotationEntry[]>(vRaw, []);
      if (vcEntries.length > 0) {
        vcEntries.sort((a, b) => a.order - b.order);
        const baseComp = getBaseComponent();
        tplPerVariantUnified.push({ variantName: vc.id, displayName: vc.label, entries: vcEntries, component: baseComp, variantProperties: vc.properties });
      }
    }
  }

  // (Legacy fields for compatibility)
  const annRaw = compSourceNode.getPluginData('a11y-layers');
  const annMap = safeParseJson<Record<string, LayerA11yData>>(annRaw, {});
  const annotations: { name: string; namePath: string; data: LayerA11yData }[] = [];
  for (const [namePath, layerData] of Object.entries(annMap)) {
    const parts = namePath.split('/');
    annotations.push({ name: parts[parts.length - 1] || namePath, namePath, data: layerData });
  }
  annotations.sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
  const agrupRaw = compSourceNode.getPluginData('a11y-agrupamentos::');
  const agrupamentos = safeParseJson<AgrupamentoRect[]>(agrupRaw, []);
  const combRaw = compSourceNode.getPluginData('a11y-combinados::');
  const combinados = safeParseJson<CombinadoEntry[]>(combRaw, []);
  const tplPerVariantAnnotations: TplPerVariantAnnotations[] = [];

  return { compData, compSourceNode, kbEntries, gestEntries, tplPerVariantTouch, allTouchEntries, tplPerVariantFocus, tplPerVariantUnified, annotations, tplPerVariantAnnotations, agrupamentos, combinados };
}


// ── Per-section fill functions ──

/**
 * Preenche a seção de título do template com o nome do componente.
 * @param titleFrame - Frame da seção de título no template
 * @param data - Dados do handoff
 */
async function fillTitleSection(titleFrame: FrameNode, data: HandoffData): Promise<void> {
  const compNameText = titleFrame.findOne(n => n.name === 'Component Name' && n.type === 'TEXT') as TextNode | null;
  if (compNameText) {
    await figma.loadFontAsync(compNameText.fontName as FontName);
    compNameText.characters = data.compSourceNode.name;
  }
}

/**
 * Preenche a seção de mapeamento (teclado e gestos) no template.
 * @param mappingFrame - Frame da seção de mapeamento no template
 * @param data - Dados do handoff
 */
async function fillMappingSection(mappingFrame: FrameNode, data: HandoffData): Promise<void> {
  const { kbEntries, gestEntries, compData } = data;

  // Find the two "keyboard maping" frames by index
  const kbMapFrames = mappingFrame.children.filter(c => c.name === 'keyboard maping') as FrameNode[];

  // 1st = Keyboard
  if (kbMapFrames.length >= 1) {
    const kbFrame = kbMapFrames[0];

    if (compData.kbMapping === 'none' || kbEntries.length === 0) {
      kbFrame.visible = false;
    } else {
      const table = kbFrame.findOne(n => n.name === 'table') as FrameNode | null;
      if (table) {
        const allDocTables = table.children.filter(c => c.type === 'INSTANCE' && c.name === '[dsc doc] Doc Table') as InstanceNode[];
        const prototype = allDocTables.find(inst => {
          const props = inst.componentProperties;
          return props['type'] && String(props['type'].value) === 'line';
        });
        if (prototype) {
          for (const entry of kbEntries) {
            const row = prototype.clone();
            table.appendChild(row);
            const keyText = (row as unknown as ChildrenMixin).findOne(
              (n: SceneNode) => n.type === 'TEXT' && n.name === 'name'
            ) as TextNode | null;
            if (keyText) { await figma.loadFontAsync(keyText.fontName as FontName); keyText.characters = entry.keys.replace(/\s*\((unitário|em sequência)\)/gi, '').trim(); }
            const actionText = (row as unknown as ChildrenMixin).findOne(
              (n: SceneNode) => n.type === 'TEXT' && n.name === 'Text or Qualitative number'
            ) as TextNode | null;
            if (actionText) { await figma.loadFontAsync(actionText.fontName as FontName); actionText.characters = entry.action; }
          }
          prototype.remove();
        }
      }
    }
  }

  // 2nd = Gestures
  if (kbMapFrames.length >= 2) {
    const gestFrame = kbMapFrames[1];

    if (compData.gestureMapping === 'none' || gestEntries.length === 0) {
      // No gestures — hide the entire gesture section
      gestFrame.visible = false;
    } else {
      const table = gestFrame.findOne(n => n.name === 'table') as FrameNode | null;
      if (table) {
        const allDocTables = table.children.filter(c => c.type === 'INSTANCE' && c.name === '[dsc doc] Doc Table') as InstanceNode[];
        const prototype = allDocTables.find(inst => {
          const props = inst.componentProperties;
          return props['type'] && String(props['type'].value) === 'line';
        });

        if (prototype) {
          for (const entry of gestEntries) {
            const row = prototype.clone();
            table.appendChild(row);
            const textNodes = (row as unknown as ChildrenMixin).findAll(
              (n: SceneNode) => n.type === 'TEXT' && n.name === 'Text or Qualitative number'
            ) as TextNode[];
            if (textNodes.length >= 2) {
              await figma.loadFontAsync(textNodes[0].fontName as FontName);
              textNodes[0].characters = entry.gesture.replace(/\s*\((unitário|em sequência)\)/gi, '').trim();
              await figma.loadFontAsync(textNodes[1].fontName as FontName);
              textNodes[1].characters = entry.action;
            }
          }
          prototype.remove();
        }
      }
    }
  }
}

/**
 * Preenche a seção de áreas de toque no template com previews e especificações.
 * @param targetAreaFrame - Frame da seção de área de toque no template
 * @param data - Dados do handoff
 */
async function fillTouchAreaSection(targetAreaFrame: FrameNode, data: HandoffData): Promise<void> {
  const { tplPerVariantTouch, allTouchEntries } = data;

  if (allTouchEntries.length === 0) return;

  // ── Image section: component clone(s) + touch area overlays + numbered badges ──
  const imageFrame = targetAreaFrame.findOne(n => n.name === 'image') as FrameNode | null;
  if (imageFrame) {
    const itemNumberProto = imageFrame.findOne(n => (n.type === 'INSTANCE' || n.type === 'FRAME') && n.name === '[dsc-h] Item Number') as InstanceNode | null;
    const handoffAreasProto = imageFrame.findOne(n => (n.type === 'INSTANCE' || n.type === 'FRAME') && n.name === '[dsc-h] Handoff areas') as InstanceNode | null;

    // Switch to absolute positioning
    imageFrame.layoutMode = 'NONE';
    const PAD_X = 64;
    const PAD_Y = 32;
    const GAP_BETWEEN_VARIANTS = 120;
    const imgW = imageFrame.width;

    // Respect the 'tag' (Preview label) — place component below it
    const tagNodeTA = imageFrame.children.find(c => c.name === 'tag') as FrameNode | null;
    const tagBottomTA = tagNodeTA ? tagNodeTA.y + tagNodeTA.height + PAD_Y : PAD_Y;

    // Measure component clones
    const cloneInfos: { clone: InstanceNode; pv: TplPerVariantTouch }[] = [];
    let maxCloneHeight = 0;
    let maxBadgeOverhang = 0;
    for (const pv of tplPerVariantTouch) {
      const compClone = pv.component ? pv.component.createInstance() : null;
      if (!compClone) continue;
      if (pv.variantProperties && Object.keys(pv.variantProperties).length > 0) {
        try { compClone.setProperties(pv.variantProperties); } catch (_e) { /* ignore incompatible props */ }
      }
      cloneInfos.push({ clone: compClone, pv });
      if (compClone.height > maxCloneHeight) maxCloneHeight = compClone.height;
      for (const ta of pv.touchAreas) {
        const overhang = 28 - ta.y;
        if (overhang > maxBadgeOverhang) maxBadgeOverhang = overhang;
      }
    }

    const badgeSpace = Math.max(maxBadgeOverhang, 0) + 28;
    const contentH = badgeSpace + maxCloneHeight;
    // Ensure frame is tall enough to fit tag + badge space + component
    const minFrameH = tagBottomTA + badgeSpace + maxCloneHeight + PAD_Y;
    const finalHeight = Math.max(contentH + 48, minFrameH, 240);
    const contentTopOffset = Math.max(tagBottomTA + badgeSpace, (finalHeight - contentH) / 2 + badgeSpace);

    // Move protos off-canvas for cloning, remove after use
    if (handoffAreasProto) { handoffAreasProto.x = -99999; handoffAreasProto.y = -99999; }
    if (itemNumberProto) { itemNumberProto.x = -99999; itemNumberProto.y = -99999; }

    const totalCloneWidth = cloneInfos.reduce((sum, ci) => sum + ci.clone.width, 0)
      + (cloneInfos.length - 1) * GAP_BETWEEN_VARIANTS;
    const finalWidth = Math.max(imgW, totalCloneWidth + PAD_X * 2);
    imageFrame.resize(finalWidth, finalHeight);

    let cursorX = PAD_X;
    let badgeIdx = 0;

    for (const { clone: compClone, pv } of cloneInfos) {
      const cloneX = cursorX;
      const cloneY = contentTopOffset;

      compClone.x = cloneX;
      compClone.y = cloneY;
      imageFrame.appendChild(compClone);

      // Touch area overlays
      if (handoffAreasProto) {
        for (const ta of pv.touchAreas) {
          const areaOverlay = handoffAreasProto.clone();
          areaOverlay.resize(ta.width, ta.height);
          areaOverlay.x = cloneX + ta.x;
          areaOverlay.y = cloneY + ta.y;
          imageFrame.appendChild(areaOverlay);
        }
      }

      // Numbered badges
      if (itemNumberProto) {
        for (const ta of pv.touchAreas) {
          badgeIdx++;
          const num = itemNumberProto.clone();
          num.x = cloneX + ta.x + ta.width / 2 - num.width / 2;
          num.y = cloneY + ta.y - 28;
          if (num.y < 4) num.y = cloneY + ta.y + ta.height + 4;
          imageFrame.appendChild(num);
          try {
            num.setProperties({ 'number#1478:0': String(badgeIdx), 'connector': 'Off' });
          } catch (_e) {
            const numText = (num as unknown as ChildrenMixin).findOne(
              (n: SceneNode) => n.type === 'TEXT' && n.name === 'Number'
            ) as TextNode | null;
            if (numText) {
              await figma.loadFontAsync(numText.fontName as FontName);
              numText.characters = String(badgeIdx);
            }
          }
        }
      }

      cursorX += compClone.width + GAP_BETWEEN_VARIANTS;
    }

    // Clean up any protos kept for cloning
    if (handoffAreasProto && !handoffAreasProto.removed) handoffAreasProto.remove();
    if (itemNumberProto && !itemNumberProto.removed) itemNumberProto.remove();
  }

  // Specs section: clone element prototype for each touch area
  const specsFrame = targetAreaFrame.findOne(n => n.name === 'specs') as FrameNode | null;
  if (specsFrame) {
    const elementProto = specsFrame.findOne(n => n.name === 'element' && n.type === 'FRAME') as FrameNode | null;
    if (elementProto) {
      for (const entry of allTouchEntries) {
        const ta = entry.area;
        const idx = entry.globalIndex + 1;
        const el = elementProto.clone();
        specsFrame.appendChild(el);

        const label = `Área ${idx}`;
        const elementName = el.findOne(n => n.type === 'INSTANCE' && n.name === 'Element name') as InstanceNode | null;
        if (elementName) {
          try {
            elementName.setProperties({ 'element#3923:0': label });
          } catch (_e) {
            const titleText = (elementName as unknown as ChildrenMixin).findOne(
              (n: SceneNode) => n.type === 'TEXT' && n.name === 'Title'
            ) as TextNode | null;
            if (titleText) {
              await figma.loadFontAsync(titleText.fontName as FontName);
              titleText.characters = label;
            }
          }
          const innerNumber = (elementName as unknown as ChildrenMixin).findOne(
            (n: SceneNode) => n.type === 'TEXT' && n.name === 'Number'
          ) as TextNode | null;
          if (innerNumber) {
            await figma.loadFontAsync(innerNumber.fontName as FontName);
            innerNumber.characters = String(idx);
          }
        }

        const h = Math.round(ta.height);
        const w = Math.round(ta.width);
        const compW = entry.componentWidth;

        // Se a largura da área de toque é ~100% da largura do componente, mostrar texto descritivo
        const isFullWidth = compW > 0 && Math.abs(w - Math.round(compW)) <= 1;
        const widthDisplay = isFullWidth ? '100% de acordo com a largura da aplicação' : `${w}px`;

        // Structure: code > [web code > code spec > TEXT "code property:"] + [value > raw value > TEXT "label"]
        // "web code" instances hold the dimension labels; "value" instances hold the dimension values
        const webCodes = el.findAll(
          (n: SceneNode) => n.type === 'INSTANCE' && n.name === 'web code'
        ) as InstanceNode[];
        const valueChips = el.findAll(
          (n: SceneNode) => n.type === 'INSTANCE' && n.name === 'value'
        ) as InstanceNode[];
        const dimLabels = ['height:', 'width:'];
        const dimVals = [`${h}px`, widthDisplay];
        // Set dimension labels (web code > code spec > TEXT "code property:")
        for (let li = 0; li < webCodes.length; li++) {
          const labelText = (webCodes[li] as unknown as ChildrenMixin).findOne(
            (n: SceneNode) => n.type === 'TEXT'
          ) as TextNode | null;
          if (labelText) {
            await figma.loadFontAsync(labelText.fontName as FontName);
            labelText.characters = dimLabels[Math.min(li, dimLabels.length - 1)];
          }
        }
        // Set dimension values (value > raw value > TEXT "label")
        for (let vi = 0; vi < valueChips.length; vi++) {
          const innerLabel = (valueChips[vi] as unknown as ChildrenMixin).findOne(
            (n: SceneNode) => n.type === 'TEXT' && n.name === 'label'
          ) as TextNode | null;
          if (innerLabel) {
            await figma.loadFontAsync(innerLabel.fontName as FontName);
            innerLabel.characters = dimVals[Math.min(vi, dimVals.length - 1)];
          }
        }
      }
      elementProto.remove();
    }
  }
}

/**
 * Preenche a seção de ordem de foco no template com previews e especificações.
 * @param focusOrderFrame - Frame da seção de ordem de foco no template
 * @param data - Dados do handoff
 */
async function fillFocusOrderSection(focusOrderFrame: FrameNode, data: HandoffData): Promise<void> {
  const { tplPerVariantFocus, compData } = data;

  if (tplPerVariantFocus.length === 0 || compData.noTab) return;

  // Image section: insert component clone(s) + tab order markers
  const foImageFrame = focusOrderFrame.findOne(n => n.name === 'image') as FrameNode | null;
  if (foImageFrame) {
    const orderProto = foImageFrame.findOne(n => n.type === 'INSTANCE' && n.name.includes('Order')) as InstanceNode | null;
    const foItemNumberProto = foImageFrame.findOne(n => n.type === 'INSTANCE' && n.name === '[dsc-h] Item Number') as InstanceNode | null;

    foImageFrame.layoutMode = 'NONE';
    const FO_PAD_X = 64;
    const FO_PAD_Y = 32;
    const FO_GAP = 120;
    const foImgW = foImageFrame.width;

    // Respect the 'tag' (Preview label) — place component below it
    const tagNodeFO = foImageFrame.children.find(c => c.name === 'tag') as FrameNode | null;
    const tagBottomFO = tagNodeFO ? tagNodeFO.y + tagNodeFO.height + FO_PAD_Y : FO_PAD_Y;

    const foCloneInfos: { clone: InstanceNode; pv: TplPerVariantFocus }[] = [];
    let foMaxCloneHeight = 0;
    for (const pv of tplPerVariantFocus) {
      const compClone = pv.component ? pv.component.createInstance() : null;
      if (!compClone) continue;
      if (pv.variantProperties && Object.keys(pv.variantProperties).length > 0) {
        try { compClone.setProperties(pv.variantProperties); } catch (_e) { /* ignore incompatible props */ }
      }
      foCloneInfos.push({ clone: compClone, pv });
      if (compClone.height > foMaxCloneHeight) foMaxCloneHeight = compClone.height;
    }

    const foItemNumberHeight = (foItemNumberProto && foCloneInfos.length > 1) ? 48 : 0;
    const foContentH = foItemNumberHeight + 28 + foMaxCloneHeight;
    const FO_MIN_HEIGHT = 240;
    // Ensure frame is tall enough to fit tag + content
    const foMinFrameH = tagBottomFO + foContentH + FO_PAD_Y;
    const foFinalHeight = Math.max(foContentH + 48, foMinFrameH, FO_MIN_HEIGHT);
    const foContentTopOffset = Math.max(tagBottomFO + foItemNumberHeight + 28, (foFinalHeight - foContentH) / 2 + foItemNumberHeight + 28);

    let foCursorX = FO_PAD_X;

    let variantIdx = 0;
    for (const { clone: compClone, pv } of foCloneInfos) {
      variantIdx++;
      const cloneX = foCursorX;
      const cloneY = foContentTopOffset;
      compClone.x = cloneX;
      compClone.y = cloneY;
      foImageFrame.appendChild(compClone);

      if (foItemNumberProto && foCloneInfos.length > 1) {
        const variantMarker = foItemNumberProto.clone();
        variantMarker.x = cloneX;
        variantMarker.y = cloneY - variantMarker.height - 4;
        foImageFrame.appendChild(variantMarker);
        try {
          variantMarker.setProperties({ 'number#1478:0': String(variantIdx), 'connector': 'Off' });
        } catch (_e) {
          const numText = (variantMarker as unknown as ChildrenMixin).findOne(
            (n: SceneNode) => n.type === 'TEXT' && n.name === 'Number'
          ) as TextNode | null;
          if (numText) {
            await figma.loadFontAsync(numText.fontName as FontName);
            numText.characters = String(variantIdx);
          }
        }
      }

      if (orderProto) {
        for (let i = 0; i < pv.entries.length; i++) {
          const entry = pv.entries[i];
          const tabNum = i + 1;

          let targetNode: SceneNode | null = null;
          if (entry.namePath) {
            // Try direct path first
            targetNode = findNodeByNamePath(compClone, entry.namePath);
            // Try without first segment (might be variant name)
            if (!targetNode && entry.namePath.includes('/')) {
              const withoutFirst = entry.namePath.split('/').slice(1).join('/');
              targetNode = findNodeByNamePath(compClone, withoutFirst);
            }
            // Fallback: search by last name segment
            if (!targetNode) {
              const leafName = entry.namePath.split('/').pop() || '';
              if (leafName) {
                targetNode = (compClone as unknown as ChildrenMixin).findOne(
                  (n: SceneNode) => n.name === leafName
                ) as SceneNode | null;
              }
            }
          }
          if (!targetNode && entry.nodeId) {
            const suffix = entry.nodeId.includes(';') ? entry.nodeId.split(';').pop()! : entry.nodeId;
            targetNode = (compClone as unknown as ChildrenMixin).findOne((n: SceneNode) => {
              const nSuffix = n.id.includes(';') ? n.id.split(';').pop()! : n.id;
              return nSuffix === suffix;
            }) as SceneNode | null;
          }

          if (targetNode) {
            const nodeBounds = targetNode.absoluteBoundingBox;
            const cloneBounds = compClone.absoluteBoundingBox;
            if (nodeBounds && cloneBounds) {
              const relX = nodeBounds.x - cloneBounds.x;
              const relY = nodeBounds.y - cloneBounds.y;

              const marker = orderProto.clone();
              foImageFrame.appendChild(marker);

              // Set size=small and number BEFORE positioning (dimensions change with variant)
              try { marker.setProperties({ 'size': 'small', 'number#7545:0': String(tabNum) }); } catch (_e) {
                try { marker.setProperties({ 'size': 'small' }); } catch (_e2) {}
                try { marker.setProperties({ 'number#7545:0': String(tabNum) }); } catch (_e2) {
                  try { marker.setProperties({ 'number#1478:0': String(tabNum) }); } catch (_e3) {}
                }
                const numText = (marker as unknown as ChildrenMixin).findOne(
                  (n: SceneNode) => n.type === 'TEXT' && (n.name === 'Number' || n.name === 'number')
                ) as TextNode | null;
                if (numText) {
                  await figma.loadFontAsync(numText.fontName as FontName);
                  numText.characters = String(tabNum);
                }
              }

              // Position AFTER size change — use updated marker dimensions
              marker.x = cloneX + relX + nodeBounds.width / 2 - marker.width / 2;
              marker.y = cloneY + relY - marker.height - 4;
              if (marker.y < 4) marker.y = cloneY + relY + nodeBounds.height + 4;
            }
          } else {
            // Fallback: node not found — place marker centered on component
            const marker = orderProto.clone();
            foImageFrame.appendChild(marker);
            // Set size + number BEFORE positioning
            try { marker.setProperties({ 'size': 'small', 'number#7545:0': String(tabNum) }); } catch (_e) {
              try { marker.setProperties({ 'size': 'small' }); } catch (_e2) {}
              try { marker.setProperties({ 'number#7545:0': String(tabNum) }); } catch (_e2) {}
            }
            marker.x = cloneX + compClone.width / 2 - marker.width / 2;
            marker.y = cloneY - marker.height - 4;
            if (marker.y < 4) marker.y = cloneY + compClone.height + 4;
          }
        }
      }

      foCursorX += compClone.width + FO_GAP;
    }

    const foFinalWidth = Math.max(foImgW, foCursorX - FO_GAP + FO_PAD_X * 2);
    foImageFrame.resize(foFinalWidth, foFinalHeight);

    if (orderProto) orderProto.remove();
    if (foItemNumberProto) foItemNumberProto.remove();
  }

  // Specs section: clone element prototype for each focus entry
  const foSpecsFrame = focusOrderFrame.findOne(n => n.name === 'specs') as FrameNode | null;
  if (foSpecsFrame) {
    const foContent = foSpecsFrame.findOne(n => n.name === 'content') as FrameNode | null;
    const specsContainer = foContent || foSpecsFrame;
    const foElementProto = specsContainer.findOne(n => n.name === 'element' && n.type === 'FRAME') as FrameNode | null;

    if (foElementProto) {
      let globalTabNum = 0;
      for (const pv of tplPerVariantFocus) {
        for (let i = 0; i < pv.entries.length; i++) {
          const entry = pv.entries[i];
          globalTabNum++;
          const tabNum = globalTabNum;
          const el = foElementProto.clone();
          specsContainer.appendChild(el);

          let label = entry.namePath ? entry.namePath.split('/').pop() || `Elemento ${tabNum}` : `Elemento ${tabNum}`;
          if (pv.displayName && tplPerVariantFocus.length > 1) {
            label = `${label} (${pv.displayName})`;
          }

          const elementName = el.findOne(n => n.type === 'INSTANCE' && n.name === 'Element name') as InstanceNode | null;
          if (elementName) {
            try {
              elementName.setProperties({ 'element#3923:0': label });
            } catch (_e) {
              const titleText = (elementName as unknown as ChildrenMixin).findOne(
                (n: SceneNode) => n.type === 'TEXT' && n.name === 'Title'
              ) as TextNode | null;
              if (titleText) {
                await figma.loadFontAsync(titleText.fontName as FontName);
                titleText.characters = label;
              }
            }
            const innerNumber = (elementName as unknown as ChildrenMixin).findOne(
              (n: SceneNode) => n.type === 'TEXT' && n.name === 'Number'
            ) as TextNode | null;
            if (innerNumber) {
              await figma.loadFontAsync(innerNumber.fontName as FontName);
              innerNumber.characters = String(tabNum);
            }
          }
        }
      }
      foElementProto.remove();
    }
  }
}

/** Mapeia connectorType do CSV para categoria usada no connectorMap. */
function connectorTypeToCategory(connType: string): string {
  if (!connType) return 'outros';
  const l = connType.toLowerCase();
  if (l.includes('função') || l.includes('funcao') || l.includes('valor') || l.includes('rótulo')) return 'funcao-valor';
  if (l.includes('estrutur') || l.includes('marco') || l.includes('navegação') || l.includes('navegacao')) return 'estrutural';
  if (l.includes('título') || l.includes('titulo') || l.includes('nível') || l.includes('nivel') || l.includes('heading')) return 'titulo';
  if (l.includes('nome acess') || l.includes('texto alt')) return 'nome-acessivel';
  if (l.includes('decorativ') || l.includes('dont-read') || l.includes('não deve') || l.includes('nao deve')) return 'decorativo';
  if (l.includes('informaç') || l.includes('adicion')) return 'informacoes-adicionais';
  return 'outros';
}

/**
 * Preenche a seção de leitor de tela no template com anotações, agrupamentos e combinados.
 * @param srFrame - Frame da seção "screen reader" no template
 * @param data - Dados do handoff
 */
async function fillScreenReaderSection(srFrame: FrameNode, data: HandoffData): Promise<void> {
  const { tplPerVariantUnified, compData, compSourceNode } = data;
  const _t0 = Date.now();
  const _log = (msg: string) => console.log(`[SR] ${Date.now() - _t0}ms | ${msg}`);

  if (compData.noScreenReader || tplPerVariantUnified.length === 0) return;

  _log(`início — ${tplPerVariantUnified.length} variante(s), ${tplPerVariantUnified.reduce((s, b) => s + b.entries.length, 0)} entries`);

  const imageFrame = srFrame.findOne(n => n.name === 'image') as FrameNode | null;
  let compClone: InstanceNode | null = null;

  // ── Image: clone component + position connectors ──
  if (imageFrame) {
    imageFrame.layoutMode = 'NONE';
    const PAD = 64;
    const CONN_MARGIN = 8;

    // Extract connector/combinado/agrupamento component sets — use module-level cache to avoid
    // repeated getMainComponentAsync calls (each takes ~1s with external libraries)
    let connectorCompSet: ComponentSetNode | null = _cachedConnectorCompSet;
    let combinadoCompSet: ComponentSetNode | null = _cachedCombingadoCompSet;
    let agrupamentoCompSet: ComponentSetNode | null = _cachedAgrupamentoCompSet;

    const needsResolution = !connectorCompSet || connectorCompSet.removed ||
                            !combinadoCompSet || combinadoCompSet.removed ||
                            !agrupamentoCompSet || agrupamentoCompSet.removed;

    if (needsResolution) {
      _log('buscando component sets do template...');
      const imageInstances = imageFrame.children.filter(c => c.type === 'INSTANCE') as InstanceNode[];
      const mainComponents = await Promise.all(imageInstances.map(c => c.getMainComponentAsync()));
      for (let i = 0; i < imageInstances.length; i++) {
        const mc = mainComponents[i];
        if (!mc || mc.parent?.type !== 'COMPONENT_SET') continue;
        const cs = mc.parent as ComponentSetNode;
        const csName = cs.name.toLowerCase();
        if (!combinadoCompSet && csName.includes('combinad')) { combinadoCompSet = cs; }
        else if (!agrupamentoCompSet && csName.includes('agrupament')) { agrupamentoCompSet = cs; }
        else if (!connectorCompSet && csName.includes('conect')) { connectorCompSet = cs; }
      }

      // Fallback: scan current page for component sets not found in template placeholders
      const fallbacks: Promise<void>[] = [];
      if (!connectorCompSet) {
        const connInst = figma.currentPage.findOne((n: SceneNode) => n.type === 'INSTANCE' && n.name.toLowerCase().includes('[a11y] conect')) as InstanceNode | null;
        if (connInst) fallbacks.push(connInst.getMainComponentAsync().then(mc => { if (mc?.parent?.type === 'COMPONENT_SET') connectorCompSet = mc.parent as ComponentSetNode; }));
      }
      if (!agrupamentoCompSet) {
        const agrupInst = figma.currentPage.findOne((n: SceneNode) => n.type === 'INSTANCE' && n.name.toLowerCase().includes('agrupament')) as InstanceNode | null;
        if (agrupInst) fallbacks.push(agrupInst.getMainComponentAsync().then(mc => { if (mc?.parent?.type === 'COMPONENT_SET') agrupamentoCompSet = mc.parent as ComponentSetNode; }));
      }
      if (!combinadoCompSet) {
        const combInst = figma.currentPage.findOne((n: SceneNode) => n.type === 'INSTANCE' && n.name.toLowerCase().includes('[a11y] combinad')) as InstanceNode | null;
        if (combInst) fallbacks.push(combInst.getMainComponentAsync().then(mc => { if (mc?.parent?.type === 'COMPONENT_SET') combinadoCompSet = mc.parent as ComponentSetNode; }));
      }
      if (fallbacks.length) await Promise.all(fallbacks);

      // Persist to module cache for next call
      _cachedConnectorCompSet = connectorCompSet;
      _cachedCombingadoCompSet = combinadoCompSet;
      _cachedAgrupamentoCompSet = agrupamentoCompSet;
    } else {
      _log('component sets restaurados do cache');
    }

    const itemNumberProto = imageFrame.findOne(n => n.type === 'INSTANCE' && (n as InstanceNode).name === '[dsc-h] Item Number') as InstanceNode | null;
    const toRemove = [...imageFrame.children].filter(c => c.type === 'INSTANCE' && c !== itemNumberProto);
    for (const c of toRemove) c.remove();

    const categoryToTipo: Record<string, string> = {
      'funcao-valor': 'função valor rótulos',
      'estrutural': 'marcos de navegação',
      'titulo': 'nível de título',
      'decorativo': 'elementos decorativos',
      'informacoes-adicionais': 'informações adicionais',
      'nome-acessivel': 'informações adicionais',
    };

    const edgeToDirMap: Record<string, string> = { 'right': 'direita', 'left': 'esquerda', 'bottom': 'inferior', 'top': 'superior' };
    imageFrame.clipsContent = false;

    const tagNode = imageFrame.children.find(c => c.name === 'tag') as FrameNode | null;
    const COMP_Y = tagNode ? tagNode.y + tagNode.height + PAD : PAD;
    const GAP_BETWEEN_VARIANTS = 120;
    const CONNECTOR_MARGIN = 120;

    _log(`component sets: conector=${!!connectorCompSet} agrupamento=${!!agrupamentoCompSet} combinado=${!!combinadoCompSet}`);

    // Create instances once and reuse them in the main loop (avoids create→remove→create cycle)
    _log('criando instâncias dos blocos...');
    const blockInstances: (InstanceNode | null)[] = tplPerVariantUnified.map(block => {
      if (!block.component) return null;
      const inst = block.component.createInstance();
      if (block.variantProperties && Object.keys(block.variantProperties).length > 0) {
        try { inst.setProperties(block.variantProperties); } catch (_e) { /* ignore */ }
      }
      return inst;
    });
    let totalComponentsWidth = blockInstances.reduce((sum, inst) => sum + (inst?.width ?? 0), 0);
    totalComponentsWidth += (tplPerVariantUnified.length - 1) * GAP_BETWEEN_VARIANTS;

    const availableMargin = (imageFrame.width - totalComponentsWidth) / 2;
    let cursorX = Math.max(CONNECTOR_MARGIN, availableMargin);
    let variantIdx = 0;
    const ocupados: { x: number; y: number; w: number; h: number }[] = [];
    const COLL_PAD = 4;
    let globalLetterIdx = 0;
    const multiVariant = tplPerVariantUnified.length > 1;

    _log('pré-computando dimensões dos conectores...');
    // Pre-compute connector dimensions per edge (avoids 4x setProperties per entry)
    const connDimsPorEdge: Record<string, { w: number; h: number }> = {};
    if (connectorCompSet) {
      const probeVariant = (connectorCompSet.children[0] as ComponentNode | null);
      if (probeVariant) {
        const probeInst = probeVariant.createInstance();
        imageFrame.appendChild(probeInst);
        for (const [edge, dir] of Object.entries(edgeToDirMap)) {
          try { probeInst.setProperties({ 'conector': dir }); } catch (_) {}
          connDimsPorEdge[edge] = { w: probeInst.width, h: probeInst.height };
        }
        probeInst.remove();
      }
    }

    for (let blockIdx = 0; blockIdx < tplPerVariantUnified.length; blockIdx++) {
      const block = tplPerVariantUnified[blockIdx];
      if (!block.component) continue;
      _log(`▶ bloco ${blockIdx + 1}/${tplPerVariantUnified.length} "${block.displayName || 'default'}" — ${block.entries.length} entries`);
      const _tBlock = Date.now();
      if (multiVariant) globalLetterIdx = 0;
      compClone = blockInstances[blockIdx]!;
      compClone.x = cursorX; compClone.y = COMP_Y;
      imageFrame.appendChild(compClone);

      if (itemNumberProto) {
        const marker = itemNumberProto.clone();
        try { marker.setProperties({ 'number#1478:0': String(variantIdx + 1), 'connector': 'Off' }); } catch (_) {}
        marker.x = compClone.x + compClone.width / 2 - marker.width / 2;
        marker.y = compClone.y - marker.height - 4;
        imageFrame.appendChild(marker);
        ocupados.push({ x: marker.x, y: marker.y, w: marker.width, h: marker.height });
      }

      let _entryIdx = 0;
      for (const entry of block.entries) {
        const _tEntry = Date.now(); void _tEntry;
        if (entry.type === 'agrupamento' && entry.rect) {
          let agrupInst: InstanceNode | null = null;
          if (agrupamentoCompSet) {
            const agrupCat = connectorTypeToCategory(entry.agrupTipo || '');
            const tipoVariantVal = categoryToTipo[agrupCat] || (entry.agrupTipo || '').toLowerCase();
            const variant = (agrupamentoCompSet.children.find(c => c.type === 'COMPONENT' && c.name.toLowerCase().includes(tipoVariantVal) && c.name.toLowerCase().includes('superior')) || 
                             agrupamentoCompSet.children.find(c => c.type === 'COMPONENT' && c.name.toLowerCase().includes('superior')) || 
                             agrupamentoCompSet.children[0]) as ComponentNode | null;
            if (variant) agrupInst = variant.createInstance();
          }
          if (agrupInst) {
            agrupInst.x = compClone.x + entry.rect.x; agrupInst.y = compClone.y + entry.rect.y;
            try { agrupInst.resize(entry.rect.width, entry.rect.height); } catch (_) {}
            imageFrame.appendChild(agrupInst);
            const agrupLetter = String.fromCharCode(65 + (globalLetterIdx % 26)) + (globalLetterIdx >= 26 ? Math.floor(globalLetterIdx / 26) + 1 : '');
            try { agrupInst.setProperties({ 'letra#3925:32': agrupLetter }); } catch (_) {}
            globalLetterIdx++;
          }
          continue;
        }

        const d = entry.layerData || { role: 'dont-read', category: 'decorativo', accessibleName: '', altText: '', headingLevel: 0, explanation: '', specification: '', codeNote: '', observation: '', connectorType: '' };
        const isDecorativo = d.category === 'decorativo' || d.role === 'dont-read';
        const isCombinado = entry.type === 'combinado';
        const letter = isDecorativo ? '' : (String.fromCharCode(65 + (globalLetterIdx % 26)) + (globalLetterIdx >= 26 ? Math.floor(globalLetterIdx / 26) + 1 : ''));

        let target: SceneNode | null = null;
        if (entry.namePath) {
          target = findNodeByNamePath(compClone, entry.namePath);
          if (!target && entry.namePath.includes('/')) {
            const withoutFirst = entry.namePath.split('/').slice(1).join('/');
            target = findNodeByNamePath(compClone, withoutFirst);
          }
          if (!target) {
            const leafName = entry.namePath.split('/').pop() || '';
            if (leafName) target = (compClone as unknown as ChildrenMixin).findOne((n: SceneNode) => n.name === leafName) as SceneNode | null;
          }
          if (!target && !entry.namePath.includes('/') && compSourceNode.type === 'COMPONENT_SET') target = compClone;
        } else {
          target = compClone;
        }

        if (!target) { if (!isDecorativo) globalLetterIdx++; continue; }
        const nb = target.absoluteBoundingBox;
        const cb = compClone.absoluteBoundingBox;
        if (!nb || !cb) { if (!isDecorativo) globalLetterIdx++; continue; }

        let instToPlace: InstanceNode | null = null;
        if (isCombinado && combinadoCompSet) {
          const dirVariant = combinadoCompSet.children.find(c => c.type === 'COMPONENT' && c.name.toLowerCase().includes('direita')) as ComponentNode | null;
          const variant = (dirVariant || combinadoCompSet.children[0]) as ComponentNode | null;
          if (variant) {
            instToPlace = variant.createInstance();
            try { instToPlace.setProperties({ 'conector': 'direita' }); } catch (_) {}
            const numConectores = entry.conectores ? entry.conectores.length : 2;
            try {
              instToPlace.setProperties({
                'conector 3#6397:63': numConectores >= 3,
                'conector 4#6397:42': numConectores >= 4,
                'conector 5#6397:21': numConectores >= 5,
                'conector 6#6397:0': numConectores >= 6,
              });
            } catch (_) {}
            if (entry.conectores) {
              const nestedConnectors = (instToPlace as unknown as ChildrenMixin).findAll((n: SceneNode) => n.type === 'INSTANCE' && n.name.toLowerCase().includes('conect')) as InstanceNode[];
              for (let ci = 0; ci < nestedConnectors.length && ci < entry.conectores.length; ci++) {
                const tipoVal = categoryToTipo[connectorTypeToCategory(entry.conectores[ci].tipo)] || 'função valor rótulos';
                try { nestedConnectors[ci].setProperties({ 'tipo': tipoVal }); } catch (_) {}
              }
            }
          }
        } else if (connectorCompSet) {
          const connCat = d.connectorType ? connectorTypeToCategory(d.connectorType) : (d.category || 'outros');
          const tipoVal = categoryToTipo[connCat] || 'função valor rótulos';
          const variant = (connectorCompSet.children.find(c => c.type === 'COMPONENT' && c.name.toLowerCase().includes(tipoVal)) || connectorCompSet.children[0]) as ComponentNode | null;
          if (variant) instToPlace = variant.createInstance();
        }

        if (instToPlace) {
          imageFrame.appendChild(instToPlace);
          // Use pre-computed connector dimensions; fall back to measuring only for combinado instances
          const dimsPorEdge: Record<string, { w: number; h: number }> = isCombinado ? (() => {
            const d2: Record<string, { w: number; h: number }> = {};
            for (const [edge, dir] of Object.entries(edgeToDirMap)) {
              try { instToPlace!.setProperties({ 'conector': dir }); } catch (_) {}
              d2[edge] = { w: instToPlace!.width, h: instToPlace!.height };
            }
            return d2;
          })() : connDimsPorEdge;
          const relElemX = nb.x - cb.x; const relElemY = nb.y - cb.y;
          const elemCX = compClone.x + relElemX + nb.width / 2;
          const elemCY = compClone.y + relElemY + nb.height / 2;
          const normX  = (relElemX + nb.width  / 2) / cb.width;
          const normY  = (relElemY + nb.height / 2) / cb.height;
          const cRight  = compClone.x + compClone.width;
          let edges: string[];
          if (normX >= 0.6) edges = ['right', 'top', 'bottom', 'left'];
          else if (normX <= 0.4) edges = ['left', 'bottom', 'top', 'right'];
          else if (normY <= 0.35) edges = ['top', 'right', 'left', 'bottom'];
          else if (normY >= 0.65) edges = ['bottom', 'right', 'left', 'top'];
          else edges = ['right', 'bottom', 'top', 'left'];
          const elemLeft = compClone.x + relElemX;
          const elemRight = compClone.x + relElemX + nb.width;
          const elemTop = compClone.y + relElemY;
          const elemBottom = compClone.y + relElemY + nb.height;
          const calcPos = (edge: string, ring: number): { bx: number; by: number; bw: number; bh: number } => {
            const dims = dimsPorEdge[edge] || { w: 40, h: 40 };
            const dimPerp = (edge === 'left' || edge === 'right') ? dims.w : dims.h;
            const gap = ring * (dimPerp + COLL_PAD);
            let bx: number, by: number;
            if (edge === 'right') { bx = elemRight + gap; by = elemCY - dims.h / 2; }
            else if (edge === 'left') { bx = elemLeft - dims.w - gap; by = elemCY - dims.h / 2; }
            else if (edge === 'top') { bx = elemCX - dims.w / 2; by = elemTop - dims.h - gap; }
            else { bx = elemCX - dims.w / 2; by = elemBottom + gap; }
            return { bx, by, bw: dims.w, bh: dims.h };
          };
          const sobrepoe = (x: number, y: number, w: number, h: number): boolean => ocupados.some(o => x < o.x + o.w + COLL_PAD && x + w + COLL_PAD > o.x && y < o.y + o.h + COLL_PAD && y + h + COLL_PAD > o.y);
          let placed = false;
          for (let ring = 0; ring <= 4 && !placed; ring++) {
            for (const edge of edges) {
              const pos = calcPos(edge, ring);
              if (!sobrepoe(pos.bx, pos.by, pos.bw, pos.bh)) {
                try { instToPlace.setProperties({ 'conector': edgeToDirMap[edge] }); } catch (_) {}
                instToPlace.x = pos.bx; instToPlace.y = pos.by;
                ocupados.push({ x: pos.bx, y: pos.by, w: pos.bw, h: pos.bh });
                placed = true; break;
              }
            }
          }
          if (!placed) {
            try { instToPlace.setProperties({ 'conector': 'direita' }); } catch (_) {}
            instToPlace.x = cRight + CONN_MARGIN; instToPlace.y = elemCY - instToPlace.height / 2;
          }
          if (letter) {
            try { instToPlace.setProperties({ 'letra#3925:6': letter }); } catch (_) {
              const lt = (instToPlace as unknown as ChildrenMixin).findOne((n: SceneNode) => n.type === 'TEXT') as TextNode | null;
              if (lt) { try { await figma.loadFontAsync(lt.fontName as FontName); lt.characters = letter; } catch (_2) {} }
            }
          }
        }
        const _entryMs = Date.now() - _tEntry;
        if (_entryMs > 50) _log(`  entry ${_entryIdx} tipo=${entry.type} path="${entry.namePath || ''}" — ${_entryMs}ms`);
        _entryIdx++;
        if (!isDecorativo) globalLetterIdx++;
      }
      _log(`◀ bloco ${blockIdx + 1} concluído em ${Date.now() - _tBlock}ms`);
      cursorX += compClone.width + GAP_BETWEEN_VARIANTS;
      variantIdx++;
    }
    _log('seção image concluída');
    if (itemNumberProto) itemNumberProto.remove();
    let maxX = 0, maxY = 0;
    for (const child of imageFrame.children) {
      if ('x' in child && 'width' in child) {
        const cx = (child as SceneNode).x + ((child as SceneNode).width || 0);
        const cy = (child as SceneNode).y + ((child as SceneNode).height || 0);
        if (cx > maxX) maxX = cx; if (cy > maxY) maxY = cy;
      }
    }
    for (const o of ocupados) { maxX = Math.max(maxX, o.x + o.w); maxY = Math.max(maxY, o.y + o.h); }
    imageFrame.resize(Math.max(maxX + PAD, imageFrame.width), Math.max(maxY + PAD, 240));
  }

  // ── Specs: fill annotation list ──
  _log('iniciando seção specs...');
  const specsFrame = srFrame.findOne(n => n.name === 'specs') as FrameNode | null;
  if (!specsFrame) return;
  const contentFrame = specsFrame.findOne(n => n.name === 'content') as FrameNode | null;
  const protoSource = contentFrame || specsFrame;
  const elementProto = protoSource.findOne(n => n.type === 'INSTANCE' && n.name.includes('Element name')) as InstanceNode | null;
  const boxProto = protoSource.findOne(n => n.name.includes('Box specs')) as FrameNode | null;

  async function createSpecRow(proto: InstanceNode, parent: FrameNode, name: string, descText: string, badge?: string): Promise<void> {
    const row = proto.clone(); parent.appendChild(row);
    try { row.setProperties({ 'element#3923:0': name, 'show description#3920:41': !!descText, 'description#3920:9': descText || ' ' }); } catch (_) {
      const allTexts = (row as unknown as ChildrenMixin).findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
      for (const t of allTexts) { await figma.loadFontAsync(t.fontName as FontName); const ln = t.name.toLowerCase(); if (ln.includes('element') || ln.includes('title') || ln === 'title') t.characters = name; else if (ln.includes('description') || ln.includes('desc')) t.characters = descText || ' '; }
    }
    if (badge !== undefined) {
      try { row.setProperties({ 'number#1478:0': badge }); } catch (_) {}
      const innerNumber = (row as unknown as ChildrenMixin).findOne((n: SceneNode) => n.type === 'TEXT' && n.name === 'Number') as TextNode | null;
      if (innerNumber) { await figma.loadFontAsync(innerNumber.fontName as FontName); innerNumber.characters = badge; }
    } else {
      const badgeInst = (row as unknown as ChildrenMixin).findOne((n: SceneNode) => n.type === 'INSTANCE' && (n.name.toLowerCase().includes('item number') || n.name.toLowerCase().includes('number'))) as InstanceNode | null;
      if (badgeInst) badgeInst.visible = false;
    }
  }

  const specCategoryToTipo: Record<string, string> = { 'funcao-valor': 'função valor rótulos', 'estrutural': 'marcos de navegação', 'titulo': 'nível de título', 'decorativo': 'elementos decorativos', 'informacoes-adicionais': 'informações adicionais', 'nome-acessivel': 'informações adicionais' };

  async function createSpecBox(proto: FrameNode, parent: FrameNode, letter: string, tipoCategory: string, description: string, observation: string, accessibleName: string, codeNote: string): Promise<void> {
    const box = proto.clone(); parent.appendChild(box);
    const boxConector = (box as unknown as ChildrenMixin).findOne((n: SceneNode) => n.type === 'INSTANCE' && n.name.toLowerCase().includes('conector')) as InstanceNode | null;
    if (boxConector) {
      const tipoVal = specCategoryToTipo[tipoCategory] || 'função valor rótulos';
      try { boxConector.setProperties({ 'letter#1248:0': letter, 'tipo': tipoVal }); } catch (_) {
        try { boxConector.setProperties({ 'letter#1248:0': letter }); } catch (_2) {}
        try { boxConector.setProperties({ 'tipo': tipoVal }); } catch (_2) {}
        const lt = (boxConector as unknown as ChildrenMixin).findOne((n: SceneNode) => n.type === 'TEXT') as TextNode | null;
        if (lt) { try { await figma.loadFontAsync(lt.fontName as FontName); lt.characters = letter; } catch (_3) {} }
      }
    }
    const fields = [{ frameName: 'Descrição', value: description || '' }, { frameName: 'Observacoes', value: observation || '' }, { frameName: 'Nome Acessivel', value: accessibleName || '' }, { frameName: 'Notas', value: (codeNote && codeNote !== 'NA') ? codeNote : '' }];
    for (const field of fields) {
      const fieldFrame = (box as unknown as ChildrenMixin).findOne((n: SceneNode) => n.type === 'FRAME' && n.name === field.frameName) as FrameNode | null;
      if (!fieldFrame) continue;
      if (!field.value) { fieldFrame.visible = false; continue; }
      const valueText = (fieldFrame as unknown as ChildrenMixin).findOne((n: SceneNode) => n.type === 'TEXT' && n.name === 'Text') as TextNode | null;
      if (valueText) { try { await figma.loadFontAsync(valueText.fontName as FontName); valueText.characters = field.value; } catch (_) {} }
    }
  }

  if (elementProto) {
    // Pre-load all fonts used by the proto nodes once — eliminates N×4 serial loadFontAsync calls
    _log('pré-carregando fontes dos protos...');
    const protoFonts = new Set<string>();
    const collectFonts = (node: BaseNode) => {
      if (node.type === 'TEXT') protoFonts.add(JSON.stringify((node as TextNode).fontName));
      if ('children' in node) (node as ChildrenMixin).children.forEach(collectFonts);
    };
    if (elementProto) collectFonts(elementProto);
    if (boxProto) collectFonts(boxProto);
    await Promise.all([...protoFonts].map(f => figma.loadFontAsync(JSON.parse(f) as FontName)));
    _log(`${protoFonts.size} fontes carregadas`);

    if (elementProto) specsFrame.appendChild(elementProto);
    if (boxProto) specsFrame.appendChild(boxProto);
    if (contentFrame) contentFrame.remove();

    let variantCounter = 1;
    for (const block of tplPerVariantUnified) {
      const _tSpecBlock = Date.now();
      const column = figma.createFrame();
      column.name = 'content'; column.layoutMode = 'VERTICAL'; column.primaryAxisSizingMode = 'AUTO'; column.counterAxisSizingMode = 'AUTO'; column.itemSpacing = 16; column.fills = [];
      specsFrame.appendChild(column);

      await createSpecRow(elementProto, column, block.displayName || 'Default', '', String(variantCounter++));

      let letterIdx = 0;
      for (const entry of block.entries) {
        if (entry.type === 'agrupamento') {
          const agrupCat = connectorTypeToCategory(entry.agrupTipo || '');
          const letter = String.fromCharCode(65 + (letterIdx % 26)) + (letterIdx >= 26 ? Math.floor(letterIdx / 26) + 1 : '');
          if (boxProto) {
            const resolvedNote = resolveCodeNote(
              { role: entry.role, specification: entry.specification, codeNote: entry.codeNote },
              data.compData.platform || []
            );
            await createSpecBox(boxProto, column, letter, agrupCat, entry.explanation || entry.agrupTipo || '', entry.observation || '', entry.accessibleName || '', resolvedNote);
          }
          letterIdx++;
        } else if (entry.type === 'combinado') {
          const letter = String.fromCharCode(65 + (letterIdx % 26)) + (letterIdx >= 26 ? Math.floor(letterIdx / 26) + 1 : '');
          if (entry.conectores) {
            for (const con of entry.conectores) {
              const conCat = connectorTypeToCategory(con.tipo);
              if (boxProto) {
                const resolvedNote = resolveCodeNote(
                  { role: con.role, specification: con.specification, codeNote: con.codeNote },
                  data.compData.platform || []
                );
                await createSpecBox(boxProto, column, letter, conCat, con.explanation || con.specification || con.tipo, con.observation || '', con.accessibleName || '', resolvedNote);
              }
            }
          }
          letterIdx++;
        } else {
          const d = entry.layerData || { role: 'dont-read', category: 'decorativo', accessibleName: '', altText: '', headingLevel: 0, explanation: '', specification: '', codeNote: '', observation: '', connectorType: '' };
          const isDecorativo = d.category === 'decorativo' || d.role === 'dont-read';
          const letter = isDecorativo ? '' : (String.fromCharCode(65 + (letterIdx % 26)) + (letterIdx >= 26 ? Math.floor(letterIdx / 26) + 1 : ''));
          const cat = d.connectorType ? connectorTypeToCategory(d.connectorType) : (d.category || 'outros');
          if (boxProto) {
            const description = d.explanation || (isDecorativo ? 'Não deve ser anunciado pelo Leitor de Tela.' : (d.specification || d.role || ''));
            const resolvedNote = resolveCodeNote(
              { role: d.role, specification: d.specification, codeNote: d.codeNote },
              data.compData.platform || []
            );
            if (description || d.observation || d.accessibleName || resolvedNote) {
              await createSpecBox(boxProto, column, letter, cat, description, d.observation || '', d.accessibleName || '', resolvedNote);
            }
          }
          if (!isDecorativo) letterIdx++;
        }
      }
      _log(`  specs bloco "${block.displayName || 'default'}" — ${Date.now() - _tSpecBlock}ms`);
    }
    elementProto.remove();
    if (boxProto) boxProto.remove();
  }
  _log(`✓ fillScreenReaderSection concluído em ${Date.now() - _t0}ms`);
}

/**
 * Preenche a seção de zoom/responsividade no template com instâncias escaladas.
 * @param responsivinessFrame - Frame da seção de responsividade no template
 * @param data - Dados do handoff
 */
async function fillZoomSection(responsivinessFrame: FrameNode, data: HandoffData): Promise<void> {
  const { compData, compSourceNode } = data;

  const zoomFrame = responsivinessFrame.findOne(n => n.name === 'zoom') as FrameNode | null;

  const tplZoomConfigs: { key: string; scale: number; label: string; valueVariant: string }[] = [];
  if (compData.zoom.includes('resize-text')) tplZoomConfigs.push({ key: 'resize-text', scale: 2, label: 'Zoom 200% — Redimensionar Texto', valueVariant: '200%' });
  if (compData.zoom.includes('reflow')) tplZoomConfigs.push({ key: 'reflow', scale: 4, label: 'Zoom 400% — Refluxo', valueVariant: '400%' });

  if (!zoomFrame || tplZoomConfigs.length === 0) return;

  const zoomImageFrame = zoomFrame.findOne(n => n.name === 'image') as FrameNode | null;
  if (zoomImageFrame) {
    const zoomItemNumberProto = zoomImageFrame.findOne(n => n.type === 'INSTANCE' && n.name === '[dsc-h] Item Number') as InstanceNode | null;

    zoomImageFrame.layoutMode = 'NONE';
    const Z_PAD_X = 64;
    const Z_GAP = 120;
    const zImgW = zoomImageFrame.width;

    const zoomSourceComp = compSourceNode.type === 'COMPONENT_SET'
      ? ((compSourceNode as ComponentSetNode).defaultVariant || (compSourceNode as ComponentSetNode).children[0]) as ComponentNode
      : compSourceNode as ComponentNode;

    const zoomCloneInfos: { clone: InstanceNode; zc: typeof tplZoomConfigs[0] }[] = [];
    let zMaxCloneHeight = 0;
    for (const zc of tplZoomConfigs) {
      const zoomInst = zoomSourceComp.createInstance();
      if (zc.key === 'resize-text') {
        await scaleTextNodes(zoomInst, zc.scale);
      } else {
        zoomInst.rescale(zc.scale);
      }
      zoomCloneInfos.push({ clone: zoomInst, zc });
      if (zoomInst.height > zMaxCloneHeight) zMaxCloneHeight = zoomInst.height;
    }

    const zMarkerH = 28;
    const Z_MIN_HEIGHT = 240;
    const zFinalHeight = Math.max(zMarkerH + zMaxCloneHeight + 80, Z_MIN_HEIGHT);
    const zCenterY = (50 + zFinalHeight) / 2;

    let zCursorX = Z_PAD_X;
    let zIdx = 0;
    for (const { clone: zoomInst } of zoomCloneInfos) {
      zIdx++;
      const cloneX = zCursorX;
      const cloneY = zCenterY - zoomInst.height / 2;
      zoomInst.x = cloneX;
      zoomInst.y = cloneY;
      zoomImageFrame.appendChild(zoomInst);

      if (zoomItemNumberProto) {
        const marker = zoomItemNumberProto.clone();
        marker.x = cloneX + zoomInst.width / 2 - marker.width / 2;
        marker.y = cloneY - marker.height - 4;
        zoomImageFrame.appendChild(marker);
        try {
          marker.setProperties({ 'number#1478:0': String(zIdx), 'connector': 'Off' });
        } catch (_e) {
          const numText = (marker as unknown as ChildrenMixin).findOne(
            (n: SceneNode) => n.type === 'TEXT' && n.name === 'Number'
          ) as TextNode | null;
          if (numText) {
            await figma.loadFontAsync(numText.fontName as FontName);
            numText.characters = String(zIdx);
          }
        }
      }

      zCursorX += zoomInst.width + Z_GAP;
    }

    const zFinalWidth = Math.max(zImgW, zCursorX - Z_GAP + Z_PAD_X * 2);
    zoomImageFrame.resize(zFinalWidth, zFinalHeight);

    if (zoomItemNumberProto) zoomItemNumberProto.remove();
  }
}

/**
 * Busca um handoff existente para o componente, por ID salvo ou por nome na página.
 * @param compSourceNode - Nó fonte do componente
 * @returns Frame do handoff existente ou null
 */
async function findExistingHandoff(compSourceNode: SceneNode): Promise<FrameNode | null> {
  // 1. Try by saved plugin data ID
  const savedId = compSourceNode.getPluginData('a11y-handoff-id');
  if (savedId) {
    const node = await figma.getNodeByIdAsync(savedId);
    if (node && node.type === 'FRAME' && !node.removed) return node as FrameNode;
  }
  // 2. Fallback: search by name on the current page
  const targetName = `[A11Y Handoff] ${compSourceNode.name}`;
  const found = figma.currentPage.findOne(n => n.name === targetName && n.type === 'FRAME') as FrameNode | null;
  return found;
}

// ── Preservação de textos manuais ──

/**
 * Calcula o caminho hierárquico de um nó relativo à raiz da seção.
 * @param no - Nó de partida
 * @param raiz - Nó raiz da seção
 * @returns Caminho separado por "/"
 */
function calcularCaminhoNo(no: SceneNode, raiz: SceneNode): string {
  const partes: string[] = [];
  let atual: SceneNode = no;
  while (atual && atual !== raiz) {
    let parte = atual.name;
    // Disambiguate same-name siblings with index (e.g. element[0], element[1])
    if (atual.parent && 'children' in atual.parent) {
      const siblings = (atual.parent as any).children as SceneNode[];
      const sameNameSiblings = siblings.filter((s: SceneNode) => s.name === atual.name);
      if (sameNameSiblings.length > 1) {
        const idx = sameNameSiblings.indexOf(atual);
        parte = `${atual.name}[${idx}]`;
      }
    }
    partes.unshift(parte);
    atual = atual.parent as SceneNode;
  }
  return partes.join('/');
}

/**
 * Coleta recursivamente todos os TextNodes dentro de uma seção.
 * @param no - Nó raiz da seção
 * @returns Lista de TextNodes encontrados
 */
function coletarTextosSecao(no: SceneNode, skipNames?: Set<string>): TextNode[] {
  const textos: TextNode[] = [];
  /** Percorre recursivamente os filhos coletando TextNodes. */
  function percorrer(n: SceneNode) {
    if (skipNames?.has(n.name)) return; // skip visual-only subtrees (e.g. component preview in 'image')
    if (n.type === 'TEXT') textos.push(n as TextNode);
    if ('children' in n) (n as any).children.forEach(percorrer);
  }
  percorrer(no);
  return textos;
}

/**
 * Extrai um mapa de caminho-para-texto de todos os TextNodes de uma seção.
 * @param secao - Nó raiz da seção
 * @returns Mapa de caminho hierárquico para conteúdo textual
 */
// Frames named 'image' in sections are component preview clones — purely visual,
// never manually edited. Skipping them avoids traversing thousands of nested nodes.
const _SKIP_SECTION_FRAMES = new Set(['image']);

function extrairTextosSecao(secao: SceneNode): Map<string, string> {
  const mapa = new Map<string, string>();
  const textos = coletarTextosSecao(secao, _SKIP_SECTION_FRAMES);
  for (const t of textos) {
    const caminho = calcularCaminhoNo(t, secao);
    mapa.set(caminho, t.characters);
  }
  return mapa;
}

/**
 * Reinjeta textos preservados em uma seção recém-gerada, restaurando edições manuais.
 * @param secao - Nó raiz da seção nova
 * @param dados - Mapa de caminho hierárquico para conteúdo textual a restaurar
 */
async function reinjetarTextosSecao(secao: SceneNode, dados: Map<string, string>): Promise<void> {
  if (dados.size === 0) return;
  const textos = coletarTextosSecao(secao, _SKIP_SECTION_FRAMES);

  // Filtrar apenas os textos que precisam ser reinjetados
  const toReinject = textos
    .map(t => ({ t, caminho: calcularCaminhoNo(t, secao) }))
    .filter(({ caminho }) => dados.has(caminho));
  if (toReinject.length === 0) return;

  // Carregar todas as fontes únicas em paralelo (batch único em vez de serial por texto)
  const uniqueFonts = new Set(
    toReinject
      .filter(({ t }) => typeof t.fontName !== 'symbol')
      .map(({ t }) => JSON.stringify(t.fontName))
  );
  await Promise.all([...uniqueFonts].map(f =>
    figma.loadFontAsync(JSON.parse(f) as FontName).catch(() => {})
  ));

  // Reinjetar textos (fontes já carregadas)
  for (const { t, caminho } of toReinject) {
    try { t.characters = dados.get(caminho)!; } catch (_e) { /* ignore */ }
  }
}

// ── Sincronização visual e preservação de posições ──

/**
 * Copia propriedades de layout e visual de um FrameNode para outro.
 * NÃO copia: name, x, y, width, height, pluginData, children.
 */
function syncLayoutProps(src: FrameNode, dst: FrameNode): void {
  try {
    dst.layoutMode = src.layoutMode;
    dst.primaryAxisAlignItems = src.primaryAxisAlignItems;
    dst.counterAxisAlignItems = src.counterAxisAlignItems;
    dst.layoutWrap = src.layoutWrap;
    dst.itemSpacing = src.itemSpacing;
    dst.counterAxisSpacing = src.counterAxisSpacing;
    dst.paddingTop = src.paddingTop;
    dst.paddingRight = src.paddingRight;
    dst.paddingBottom = src.paddingBottom;
    dst.paddingLeft = src.paddingLeft;
    dst.layoutSizingHorizontal = src.layoutSizingHorizontal;
    dst.layoutSizingVertical = src.layoutSizingVertical;
    dst.fills = JSON.parse(JSON.stringify(src.fills));
    dst.strokes = JSON.parse(JSON.stringify(src.strokes));
    dst.strokeWeight = src.strokeWeight;
    dst.strokeAlign = src.strokeAlign;
    dst.cornerRadius = src.cornerRadius;
    if (src.cornerRadius === figma.mixed) {
      dst.topLeftRadius = src.topLeftRadius;
      dst.topRightRadius = src.topRightRadius;
      dst.bottomLeftRadius = src.bottomLeftRadius;
      dst.bottomRightRadius = src.bottomRightRadius;
    }
    dst.clipsContent = src.clipsContent;
    dst.effects = JSON.parse(JSON.stringify(src.effects));
  } catch (_) { /* some props may not be settable */ }
}

/**
 * Sincroniza propriedades visuais recursivamente entre dois nós com mesma estrutura.
 * Para FRAMEs: copia layout/visual. Para TEXTs: copia estilo (fonte, cor) mas NÃO o conteúdo.
 * Matching de filhos por nome.
 */
function syncVisualsRecursive(src: SceneNode, dst: SceneNode): void {
  if (src.type === 'FRAME' && dst.type === 'FRAME') {
    syncLayoutProps(src as FrameNode, dst as FrameNode);
  }
  if (src.type === 'TEXT' && dst.type === 'TEXT') {
    const ts = src as TextNode, td = dst as TextNode;
    try {
      if (typeof ts.fills !== 'symbol') td.fills = JSON.parse(JSON.stringify(ts.fills));
      if (typeof ts.fontName !== 'symbol' && typeof td.fontName !== 'symbol') td.fontName = ts.fontName;
      if (typeof ts.fontSize !== 'symbol') td.fontSize = ts.fontSize as number;
      if (typeof ts.lineHeight !== 'symbol') td.lineHeight = ts.lineHeight;
      if (typeof ts.letterSpacing !== 'symbol') td.letterSpacing = ts.letterSpacing;
    } catch (_) { /* font not loaded */ }
    return;
  }
  if ('children' in src && 'children' in dst) {
    const dstMap = new Map<string, SceneNode>();
    for (const c of (dst as any).children) dstMap.set(c.name, c);
    for (const sc of (src as any).children) {
      const dc = dstMap.get(sc.name);
      if (dc) syncVisualsRecursive(sc, dc);
    }
  }
}

/** Posição salva de um marcador/elemento no preview */
interface SavedPosition {
  /** Identificador: nome + texto interno (ex: "A", "1", etc.) para matching */
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Extrai posições de todos os filhos do frame "image" de uma seção.
 * Salva por chave composta (nome + texto do primeiro TextNode) para matching robusto.
 */
function extractMarkerPositions(section: SceneNode): SavedPosition[] {
  const positions: SavedPosition[] = [];
  const imageFrame = ('children' in section)
    ? (section as FrameNode).findOne(n => n.name === 'image') as FrameNode | null
    : null;
  if (!imageFrame || !('children' in imageFrame)) return positions;

  for (const child of (imageFrame as FrameNode).children) {
    // Build key from name + first text content (for markers like "[a11y] Order" with number "1")
    let textContent = '';
    if (child.type === 'TEXT') {
      textContent = (child as TextNode).characters;
    } else if ('children' in child) {
      const firstText = (child as FrameNode).findOne(n => n.type === 'TEXT') as TextNode | null;
      if (firstText) textContent = firstText.characters;
    }
    const key = `${child.name}::${textContent}`;
    positions.push({ key, x: child.x, y: child.y, width: child.width, height: child.height });
  }
  return positions;
}

/**
 * Restaura posições salvas nos marcadores da seção regenerada.
 * Faz matching por chave (nome + texto). Se encontrar, aplica x/y salvos.
 */
function restoreMarkerPositions(section: SceneNode, saved: SavedPosition[]): void {
  if (saved.length === 0) return;
  const imageFrame = ('children' in section)
    ? (section as FrameNode).findOne(n => n.name === 'image') as FrameNode | null
    : null;
  if (!imageFrame || !('children' in imageFrame)) return;

  const savedMap = new Map<string, SavedPosition>();
  for (const p of saved) savedMap.set(p.key, p);

  for (const child of (imageFrame as FrameNode).children) {
    // Skip elements whose position/size is determined by fill functions, not manual adjustment
    const nameLower = child.name.toLowerCase();
    if (nameLower.includes('handoff areas')) continue; // touch area overlays
    if (nameLower.includes('[dsc]') || nameLower.includes('[dsc-h] item number')) continue; // component clones and item number badges
    if (child.type === 'INSTANCE' && nameLower.includes('order')) continue; // focus order markers

    let textContent = '';
    if (child.type === 'TEXT') {
      textContent = (child as TextNode).characters;
    } else if ('children' in child) {
      const firstText = (child as FrameNode).findOne(n => n.type === 'TEXT') as TextNode | null;
      if (firstText) textContent = firstText.characters;
    }
    const key = `${child.name}::${textContent}`;
    const sp = savedMap.get(key);
    if (sp) {
      child.x = sp.x;
      child.y = sp.y;
      // Restore size only if it was manually changed (differs from default)
      try {
        if ('resize' in child && (Math.abs(child.width - sp.width) > 1 || Math.abs(child.height - sp.height) > 1)) {
          (child as FrameNode).resize(sp.width, sp.height);
        }
      } catch (_) { /* resize may fail on some node types */ }
    }
  }
}

/**
 * Atualiza um handoff existente, substituindo seções com dados atuais e preservando textos manuais.
 * @param compNodeId - ID do componente fonte
 * @param tplNodeId - ID do nó template
 * @param preserveManualTexts - Se true, preserva textos editados manualmente
 */
async function updateHandoffFromTemplate(compNodeId: string, tplNodeId: string, preserveManualTexts: boolean = true, sectionsToUpdate: string[] | null = null): Promise<void> {
  const compSourceNode = (await figma.getNodeByIdAsync(compNodeId)) as SceneNode;
  if (!compSourceNode) {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Componente não encontrado.' });
    return;
  }

  const existing = await findExistingHandoff(compSourceNode);
  if (!existing) {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Nenhum handoff encontrado. Use "Gerar" primeiro.' });
    return;
  }

  // Resolve the template key for fetching fresh sections
  let tplKey = compSourceNode.getPluginData('a11y-handoff-tpl-key');

  // If the user selected the existing handoff as the "template" (common case:
  // select handoff + component, click "Atualizar"), we need a real template key.
  if (existing.id === tplNodeId) {
    if (!tplKey) {
      figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Selecione uma nova instância do template junto com o componente.' });
      return;
    }
  } else {
    // User selected a different template node — resolve its key
    const tplNode = await figma.getNodeByIdAsync(tplNodeId);
    if (tplNode) {
      if (tplNode.type === 'INSTANCE') {
        const mc = await (tplNode as InstanceNode).getMainComponentAsync();
        if (mc) tplKey = mc.key;
      } else if (tplNode.type === 'COMPONENT') {
        tplKey = (tplNode as ComponentNode).key;
      } else if (tplNode.type === 'COMPONENT_SET') {
        const cs = tplNode as ComponentSetNode;
        const variant = cs.children.find(c => c.type === 'COMPONENT' && c.name.includes('Acessibility')) as ComponentNode | undefined;
        tplKey = (variant || cs.children[0] as ComponentNode).key;
      }
    }
  }

  if (!tplKey) {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Não foi possível determinar o template. Selecione uma instância do template.' });
    return;
  }

  figma.viewport.scrollAndZoomIntoView([existing]);

  // Read all data
  sendProgress('Lendo dados do componente...');
  const data = await readHandoffData(compSourceNode);

  // Clone template UMA vez e mapeia todas as seções (N clones → 1).
  // As seções ficam dentro de `tplDetached` — são movidas diretamente para `existing`
  // via insertChild() sem passar pelo root da página (evita artefatos visuais).
  sendProgress('Carregando template...');
  const { sections: tplSectionsMap, allNames: templateSectionNames, detached: tplDetached } = await getTemplateSectionsAll(tplKey, tplNodeId);

  // Define sections and their fill functions
  const sections: { name: string; label: string; fill: (frame: FrameNode, data: HandoffData) => Promise<void> }[] = [
    { name: 'title', label: 'Título', fill: fillTitleSection },
    { name: 'mapping', label: 'Mapeamento', fill: fillMappingSection },
    { name: 'target area', label: 'Área de Toque', fill: fillTouchAreaSection },
    { name: 'focus order', label: 'Ordem de Tabulação', fill: fillFocusOrderSection },
    { name: 'screen reader', label: 'Leitor de Tela', fill: fillScreenReaderSection },
    { name: 'responsiviness', label: 'Responsividade', fill: fillZoomSection },
  ];

  for (const sec of sections) {
    // Skip sections not selected for update — sync visual style only (preserve content)
    if (sectionsToUpdate && !sectionsToUpdate.includes(sec.name)) {
      sendProgress(`Sincronizando estilo: ${sec.label}...`);
      // Sync template visual style without destroying content (seção dentro de tplDetached)
      const freshForSync = tplSectionsMap.get(sec.name) ?? null;
      tplSectionsMap.delete(sec.name);
      if (freshForSync) {
        const existingSec = findByName(existing as ChildrenMixin & BaseNode, sec.name);
        if (existingSec) {
          syncVisualsRecursive(freshForSync, existingSec);
        }
        // Não remover freshForSync aqui — tplDetached.remove() no final limpa tudo
      }
      continue;
    }
    sendProgress(`Atualizando ${sec.label}...`);

    // Find ALL direct children with this section name and remove duplicates (keep only first)
    const allSameName = [...existing.children].filter(
      c => 'name' in c && (c as SceneNode).name === sec.name
    ) as SceneNode[];
    for (let i = 1; i < allSameName.length; i++) {
      allSameName[i].remove();
    }
    const oldSection = allSameName[0] ?? findByName(existing, sec.name);
    if (!oldSection) continue;

    // Get fresh section from template (pre-extracted from the single clone above)
    const freshSection = tplSectionsMap.get(sec.name) ?? null;
    tplSectionsMap.delete(sec.name);
    if (!freshSection) {
      console.warn(`[HANDOFF-UPDATE] Fresh section "${sec.name}" not found in template — keeping existing content.`);
      continue;
    }

    // Extract texts from old section BEFORE removing
    let textosAntigos = new Map<string, string>();
    if (preserveManualTexts) {
      textosAntigos = extrairTextosSecao(oldSection);
    }

    // Clear old section content
    if ('children' in oldSection) {
      for (const child of [...(oldSection as FrameNode).children]) child.remove();
    }

    // Replace: insert fresh at same position, remove empty old
    const idx = existing.children.indexOf(oldSection as SceneNode);
    existing.insertChild(idx, freshSection);
    oldSection.remove();

    // Fill with current data
    try { await sec.fill(freshSection as FrameNode, data); }
    catch (e) { console.error(`[HANDOFF-UPDATE] Error filling ${sec.name}:`, e); }

    // Extract texts AFTER fill (these are the auto-generated values)
    const textosAutoGerados = extrairTextosSecao(freshSection);

    // Selective preservation: only reinject texts that were MANUALLY edited by the user.
    // Uses a stored baseline of auto-generated texts from the previous fill/update.
    // Without a baseline, we can't distinguish manual edits from stale auto-generated values,
    // so we skip preservation entirely (same approach as DSC Handoff for generated sections).
    const prevAutoKey = `a11y-auto-texts::${sec.name}`;
    const prevAutoRaw = compSourceNode.getPluginData(prevAutoKey);

    if (preserveManualTexts && textosAntigos.size > 0 && prevAutoRaw) {
      const prevAuto = new Map(Object.entries(safeParseJson<Record<string, string>>(prevAutoRaw, {})));

      const textosParaPreservar = new Map<string, string>();
      for (const [caminho, textoAntigo] of textosAntigos) {
        const textoPrevAuto = prevAuto.get(caminho) || '';
        const textoAuto = textosAutoGerados.get(caminho) || '';
        // Preserve only if:
        // 1. Old text differs from what the previous fill generated (= user manually edited it)
        // 2. Old text differs from what the new fill just wrote (= would change the manual edit)
        if (textoAntigo !== textoPrevAuto && textoAntigo !== textoAuto) {
          textosParaPreservar.set(caminho, textoAntigo);
        }
      }
      if (textosParaPreservar.size > 0) {
        await reinjetarTextosSecao(freshSection, textosParaPreservar);
      }
    }

    // Save current auto-generated texts as baseline for next update
    const autoKey = `a11y-auto-texts::${sec.name}`;
    const autoObj: Record<string, string> = {};
    textosAutoGerados.forEach((v, k) => { autoObj[k] = v; });
    compSourceNode.setPluginData(autoKey, JSON.stringify(autoObj));

  }

  // ── Detectar e adicionar seções novas do template ──
  sendProgress('Verificando novas seções...');
  const existingSectionNames = new Set(
    [...existing.children]
      .filter(c => 'name' in c)
      .map(c => (c as SceneNode).name)
  );

  // Mapa de fill functions para seções conhecidas (para preencher novas seções se possível)
  const fillMap = new Map(sections.map(s => [s.name, s.fill]));

  // templateSectionNames já disponível via getTemplateSectionsAll — nenhum clone extra necessário
  const newSections: string[] = [];
  for (const tplSecName of templateSectionNames) {
    if (!existingSectionNames.has(tplSecName)) {
      newSections.push(tplSecName);
    }
  }

  if (newSections.length > 0) {
    for (const newSecName of newSections) {
      sendProgress(`Adicionando nova seção: ${newSecName}...`);
      const freshSection = tplSectionsMap.get(newSecName) ?? null;
      tplSectionsMap.delete(newSecName);
      if (!freshSection) continue;

      // Determinar posição de inserção baseada na ordem do template
      const tplIdx = templateSectionNames.indexOf(newSecName);
      let insertIdx = existing.children.length; // default: append at end

      // Encontrar a seção anterior (no template) que existe no handoff, para inserir depois dela
      for (let i = tplIdx - 1; i >= 0; i--) {
        const prevName = templateSectionNames[i];
        const prevInHandoff = [...existing.children].findIndex(
          c => 'name' in c && (c as SceneNode).name === prevName
        );
        if (prevInHandoff >= 0) {
          insertIdx = prevInHandoff + 1;
          break;
        }
      }

      existing.insertChild(Math.min(insertIdx, existing.children.length), freshSection);

      // Preencher com dados se temos uma fill function para esta seção
      const fillFn = fillMap.get(newSecName);
      if (fillFn) {
        try { await fillFn(freshSection as FrameNode, data); }
        catch (e) { console.error(`[HANDOFF-UPDATE] Error filling new section ${newSecName}:`, e); }
      }

      // Salvar baseline de textos auto-gerados
      const autoTexts = extrairTextosSecao(freshSection);
      const obj: Record<string, string> = {};
      autoTexts.forEach((v, k) => { obj[k] = v; });
      compSourceNode.setPluginData(`a11y-auto-texts::${newSecName}`, JSON.stringify(obj));
    }
  }

  // Remover o frame detachado do template — seções não consumidas (extras) são removidas junto.
  // Seções consumidas já foram movidas para `existing` via insertChild() e não estão mais aqui.
  if (tplDetached) {
    try { tplDetached.remove(); } catch (_e) { /* ignore */ }
  }

  // Preserve name and update references
  existing.name = `[A11Y Handoff] ${compSourceNode.name}`;
  compSourceNode.setPluginData('a11y-handoff-id', existing.id);
  existing.setPluginData('a11y-source-component-id', compSourceNode.id);
  if (tplKey) {
    compSourceNode.setPluginData('a11y-handoff-tpl-key', tplKey);
    existing.setPluginData('a11y-handoff-tpl-key', tplKey);
  }

  sendProgress('Publicando dados...');
  await publishSharedA11yData();
  await cleanupTempInstance();
  figma.viewport.scrollAndZoomIntoView([existing]);

  const totalTouchAreas = data.tplPerVariantTouch.reduce((s, pv) => s + pv.touchAreas.length, 0);
  figma.ui.postMessage({
    type: 'handoff-result', success: true,
    connectorsPlaced: 0, layersAnnotated: 0,
    zoomInstances: 0, touchAreas: totalTouchAreas,
    newSections: newSections.length > 0 ? newSections : undefined,
  });
}

/**
 * Gera um novo handoff a partir de um template, preenchendo todas as seções com dados do componente.
 * @param compNodeId - ID do componente fonte
 * @param tplNodeId - ID do nó template
 * @param overridePosition - Posição fixa para o handoff (opcional)
 * @returns Frame do handoff gerado ou null em caso de erro
 */
async function generateHandoffFromTemplate(compNodeId: string, tplNodeId: string, overridePosition?: { x: number; y: number }): Promise<FrameNode | null> {
  // Clean up any temp instance from switchVariant before generating
  await cleanupTempInstance();
  try {
  if (!compNodeId) {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Nenhum componente selecionado.' });
    return null;
  }
  if (!tplNodeId) {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Nenhum template selecionado.' });
    return null;
  }

  let compSourceNode = (await figma.getNodeByIdAsync(compNodeId)) as SceneNode;
  if (!compSourceNode) { figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Componente não encontrado.' }); return null; }

  // If user selected an instance (not the component set directly), resolve to its component set
  if (compSourceNode.type === 'INSTANCE') {
    try {
      const mc = await (compSourceNode as InstanceNode).getMainComponentAsync();
      if (mc) compSourceNode = (mc.parent?.type === 'COMPONENT_SET' ? mc.parent : mc) as SceneNode;
    } catch (_) { /* keep as is */ }
  }

  const rootBounds = compSourceNode.absoluteBoundingBox;
  if (!rootBounds) { figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Sem dimensões.' }); return null; }

  // Limpar instâncias temporárias de variantes configs antes de gerar
  // (serão recriadas automaticamente quando o plugin for aberto novamente)
  await cleanupVariantInstances(compSourceNode);

  // ── Read all handoff data ──
  sendProgress('Lendo dados do componente...');
  const data = await readHandoffData(compSourceNode);

  // Reorder per-variant annotations to match the user's selected variant order
  if (compSourceNode.type === 'COMPONENT_SET' && data.tplPerVariantAnnotations.length > 1) {
    const selRaw = compSourceNode.getPluginData('a11y-selected-variants');
    if (selRaw) {
      try {
        const savedOrder: string[] = JSON.parse(selRaw);
        // Build a map from variant component id to its index in saved order
        const orderMap = new Map<string, number>();
        savedOrder.forEach((id, idx) => orderMap.set(id, idx));
        data.tplPerVariantAnnotations.sort((a, b) => {
          const ia = a.component && orderMap.has(a.component.id) ? orderMap.get(a.component.id)! : 9999;
          const ib = b.component && orderMap.has(b.component.id) ? orderMap.get(b.component.id)! : 9999;
          return ia - ib;
        });
      } catch (_) { /* keep original order */ }
    }
  }

  // ── Prepare template from picked node ──
  sendProgress('Preparando template...');
  const tplNode = await figma.getNodeByIdAsync(tplNodeId);
  if (!tplNode) {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Template não encontrado.' });
    return null;
  }

  // Save template component key for future "Atualizar" (before detach destroys the link)
  let tplComponentKey = '';
  if (tplNode.type === 'INSTANCE') {
    const mc = await (tplNode as InstanceNode).getMainComponentAsync();
    if (mc) tplComponentKey = mc.key;
  } else if (tplNode.type === 'COMPONENT') {
    tplComponentKey = (tplNode as ComponentNode).key;
  } else if (tplNode.type === 'COMPONENT_SET') {
    const cs = tplNode as ComponentSetNode;
    const variant = cs.children.find(c => c.type === 'COMPONENT' && c.name.includes('Acessibility')) as ComponentNode | undefined;
    tplComponentKey = (variant || cs.children[0] as ComponentNode).key;
  }

  // Clone + detach the template, then remove the original so the handoff takes its place
  // Capture absolute position for correct placement when template is inside a Section/Frame
  const tplAbsBounds = (tplNode as SceneNode).absoluteBoundingBox;
  const tplLocalX = (tplNode as SceneNode).x;
  const tplLocalY = (tplNode as SceneNode).y;
  const tplOriginalParent = (tplNode as SceneNode).parent;
  let detached: FrameNode;
  if (tplNode.type === 'INSTANCE') {
    const cloned = (tplNode as InstanceNode).clone();
    detached = cloned.detachInstance();
    tplNode.remove();
  } else if (tplNode.type === 'COMPONENT') {
    const inst = (tplNode as ComponentNode).createInstance();
    detached = inst.detachInstance();
  } else if (tplNode.type === 'COMPONENT_SET') {
    const cs = tplNode as ComponentSetNode;
    let variant = cs.children.find(c => c.type === 'COMPONENT' && c.name.includes('Acessibility')) as ComponentNode | undefined;
    if (!variant) variant = cs.children[0] as ComponentNode;
    const inst = variant.createInstance();
    detached = inst.detachInstance();
  } else if (tplNode.type === 'FRAME') {
    detached = (tplNode as FrameNode).clone();
    tplNode.remove();
  } else {
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Tipo de nó não suportado como template: ' + tplNode.type });
    return null;
  }
  // Position the handoff where the template was, using local coordinates (same parent)
  detached.x = tplLocalX;
  detached.y = tplLocalY;

  // ── Fill each section using extracted functions ──
  sendProgress('Preenchendo título...');
  const titleFrame = findByName(detached, 'title') as FrameNode | null;
  if (titleFrame) await fillTitleSection(titleFrame, data);

  sendProgress('Preenchendo mapeamento...');
  const mappingFrame = findByName(detached, 'mapping') as FrameNode | null;
  if (mappingFrame) await fillMappingSection(mappingFrame, data);

  sendProgress('Preenchendo áreas de toque...');
  const targetAreaFrame = findByName(detached, 'target area') as FrameNode | null;
  if (targetAreaFrame) await fillTouchAreaSection(targetAreaFrame, data);

  sendProgress('Preenchendo ordem de tabulação...');
  const focusOrderFrame = findByName(detached, 'focus order') as FrameNode | null;
  if (focusOrderFrame) await fillFocusOrderSection(focusOrderFrame, data);

  sendProgress('Preenchendo leitor de tela...');
  const screenReaderFrame = findByName(detached, 'screen reader') as FrameNode | null;
  if (screenReaderFrame) {
    try { await fillScreenReaderSection(screenReaderFrame, data); }
    catch (e) { console.error('[HANDOFF] fillScreenReaderSection error:', e); }
  }

  const _tPost = Date.now();
  const _logPost = (msg: string) => console.log(`[HANDOFF] ${Date.now() - _tPost}ms | ${msg}`);

  _logPost('fillZoomSection...');
  sendProgress('Preenchendo zoom...');
  const responsivinessFrame = findByName(detached, 'responsiviness') as FrameNode | null;
  if (responsivinessFrame) await fillZoomSection(responsivinessFrame, data);

  // ── Position and finalize ──
  _logPost('finalizando posição...');
  sendProgress('Finalizando...');
  detached.name = `[A11Y Handoff] ${compSourceNode.name}`;
  if (overridePosition) {
    detached.x = overridePosition.x;
    detached.y = overridePosition.y;
  }
  // Garante que o frame está no parent correto.
  // Para COMPONENT/COMPONENT_SET, a instância é criada dentro do componente — mover para o
  // parent original do template (Section, Frame, ou a própria página) usando coordenadas absolutas.
  const detachedParentType = detached.parent?.type;
  if (detachedParentType === 'COMPONENT_SET' || detachedParentType === 'COMPONENT') {
    // Instance criada dentro do componente — reposicionar no parent correto
    const targetParent = tplOriginalParent && 'appendChild' in tplOriginalParent
      ? tplOriginalParent as (BaseNode & ChildrenMixin)
      : figma.currentPage;
    (targetParent as ChildrenMixin).appendChild(detached);
    detached.x = tplLocalX;
    detached.y = tplLocalY;
  } else if (detached.parent !== figma.currentPage) {
    // Para INSTANCE/FRAME clonados: se o parent original era uma Section/Frame, manter lá
    // (o clone já está no parent correto, não mover para a página)
    // Só mover se o parent foi removido/inválido
    if (!detached.parent || detached.parent.removed) {
      figma.currentPage.appendChild(detached);
      if (tplAbsBounds) {
        detached.x = tplAbsBounds.x;
        detached.y = tplAbsBounds.y;
      }
    }
  }

  // Save handoff ID and template key on the source component + reverse reference
  compSourceNode.setPluginData('a11y-handoff-id', detached.id);
  detached.setPluginData('a11y-source-component-id', compSourceNode.id);
  if (tplComponentKey) {
    compSourceNode.setPluginData('a11y-handoff-tpl-key', tplComponentKey);
    detached.setPluginData('a11y-handoff-tpl-key', tplComponentKey);
  }

  // Save auto-generated text baselines for each section (used by update to detect manual edits)
  _logPost('salvando baselines de texto...');
  const sectionNames = ['title', 'mapping', 'target area', 'focus order', 'screen reader', 'responsiviness'];
  for (const secName of sectionNames) {
    const _tSec = Date.now();
    const secFrame = findByName(detached, secName) as FrameNode | null;
    if (secFrame) {
      const autoTexts = extrairTextosSecao(secFrame);
      const obj: Record<string, string> = {};
      autoTexts.forEach((v, k) => { obj[k] = v; });
      compSourceNode.setPluginData(`a11y-auto-texts::${secName}`, JSON.stringify(obj));
    }
    _logPost(`  baseline "${secName}" — ${Date.now() - _tSec}ms`);
  }

  _logPost('publishSharedA11yData...');
  sendProgress('Publicando dados...');
  await publishSharedA11yData();
  _logPost('cleanupTempInstance...');
  await cleanupTempInstance();
  _logPost('scrollAndZoom...');
  figma.viewport.scrollAndZoomIntoView([detached]);
  _logPost('postMessage handoff-result...');

  figma.ui.postMessage({
    type: 'handoff-result', success: true,
    connectorsPlaced: 0, layersAnnotated: 0,
    zoomInstances: 0, touchAreas: 0,
  });
  return detached;
  } catch (err) {
    console.error('[HANDOFF-TPL] ERROR:', err);
    figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Erro: ' + String(err) });
    return null;
  }
}

// ════════════════════════════════════════
// MENSAGENS
// ════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
figma.ui.onmessage = async (msg: any) => {
  switch (msg.type) {
    // Salva dados de acessibilidade do componente (plataformas, zoom, etc.)
    case 'set-component-data': await setComponentData(msg.data); break;
    // Gera preview com imagem PNG e zonas de layers
    case 'generate-preview': await generatePreview(); break;
    // Troca a variante exibida no preview
    case 'switch-variant': if (msg.variantId) await switchVariant(msg.variantId, !!msg.excOnly); break;
    // Lê dados de acessibilidade de um layer específico
    case 'get-layer-data': if (msg.nodeId) await getLayerData(msg.nodeId, msg.variantName); break;
    // Salva dados de acessibilidade de um layer específico
    case 'set-layer-data': if (msg.nodeId && msg.data) await setLayerData(msg.nodeId, msg.data, msg.variantName, msg.applyToAll !== false); break;
    // --- Unified SR Annotations ---
    case 'get-unified-annotations': await sendUnifiedAnnotations(msg.variantName, msg.excOnly); break;
    case 'set-unified-entry': await setUnifiedEntry(msg.entry, msg.variantName, msg.applyToAll !== false); break;
    case 'remove-unified-entry': await removeUnifiedEntry(msg.id, msg.namePath, msg.variantName, msg.applyToAll !== false); break;
    // ------------------------------
    // Retorna contagens totais para o resumo (shared + todas as variantes)
    case 'get-summary-counts': {
      if (!currentRootId) { figma.ui.postMessage({ type: 'summary-counts', roles: 0, focus: 0, touch: 0, agrupamentos: 0, variantOverrides: [] }); break; }
      const rootNode = await figma.getNodeByIdAsync(currentRootId);
      if (!rootNode) { figma.ui.postMessage({ type: 'summary-counts', roles: 0, focus: 0, touch: 0, agrupamentos: 0, variantOverrides: [] }); break; }
      const sn = rootNode as SceneNode;

      // Count annotations: shared + all variant-specific (deduplicated by path/ID)
      const allUnifiedKeys = new Set<string>();
      const sharedUnifiedRaw = sn.getPluginData(KEY_SR_UNIFIED);
      if (sharedUnifiedRaw) {
        const arr = safeParseJson<UnifiedAnnotationEntry[]>(sharedUnifiedRaw, []);
        arr.forEach(e => allUnifiedKeys.add(e.type === 'agrupamento' ? e.id : (e.namePath || e.id)));
      }
      const varNames = rootNode.type === 'COMPONENT_SET' ? (rootNode as ComponentSetNode).children.filter(c => c.type === 'COMPONENT').map(c => c.name) : [];
      const variantRoleOverrides: string[] = [];

      // Count focus/touch shared data
      let focusTotal = 0;
      const sharedFocus = sn.getPluginData('a11y-focus-order');
      if (sharedFocus) { const arr = safeParseJson<any[]>(sharedFocus, []); focusTotal += arr.length; }
      let touchTotal = 0;
      const sharedTouch = sn.getPluginData('a11y-touch-areas::');
      if (sharedTouch) { const arr = safeParseJson<any[]>(sharedTouch, []); touchTotal += arr.length; }

      // Loop único sobre variantes: 3× menos iterações e getPluginData calls
      for (const vn of varNames) {
        const [vRaw, vf, vt] = [
          sn.getPluginData(KEY_SR_UNIFIED + vn),
          sn.getPluginData('a11y-focus-order::' + vn),
          sn.getPluginData('a11y-touch-areas::' + vn),
        ];
        if (vRaw) {
          const arr = safeParseJson<UnifiedAnnotationEntry[]>(vRaw, []);
          if (arr.length > 0) variantRoleOverrides.push(vn);
          arr.forEach(e => allUnifiedKeys.add(e.type === 'agrupamento' ? e.id : (e.namePath || e.id)));
        }
        if (vf) { const arr = safeParseJson<any[]>(vf, []); focusTotal += arr.length; }
        if (vt) { const arr = safeParseJson<any[]>(vt, []); touchTotal += arr.length; }
      }

      figma.ui.postMessage({ type: 'summary-counts', roles: allUnifiedKeys.size, focus: focusTotal, touch: touchTotal, agrupamentos: 0, variantOverrides: variantRoleOverrides });
      break;
    }
    // Remove anotação de um layer por namePath
    case 'remove-layer-annotation': if (msg.namePath != null) await removeLayerAnnotation(msg.namePath, msg.variantName); break;
    // Salva áreas de toque (compartilhadas ou por variante)
    case 'save-touch-areas': if (msg.areas) await saveTouchAreas(msg.areas, msg.variantName || '', !!msg.applyToAll); break;
    // Lê áreas de toque e envia para a UI
    case 'get-touch-areas': await getTouchAreas(msg.variantName || ''); break;
    // Lê ordem de foco e envia para a UI
    case 'get-focus-order': await getFocusOrder(msg.variantName); break;
    // Salva ordem de foco (compartilhada ou por variante)
    case 'set-focus-order': if (msg.entries) await setFocusOrder(msg.entries, msg.variantName, msg.applyToAll !== false); break;
    // Descobre conectores de acessibilidade no arquivo
    case 'discover-connectors': await discoverConnectors(); break;
    // Limpa instância temporária de preview
    case 'cleanup-temp-instance': await cleanupTempInstance(); break;
    // UI informa o step atual (para contexto de seleção no canvas)
    case 'set-ui-step': uiCurrentStep = msg.step || 1; break;
    // UI pede para selecionar um nó no canvas (editar anotação existente)
    case 'request-select-node': {
      if (msg.nodeId) {
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (node) {
          figma.currentPage.selection = [node as SceneNode];
          figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
        }
      } else if (msg.namePath && currentRootId) {
        // Procurar pelo namePath no componente
        const rootNode = await figma.getNodeByIdAsync(currentRootId);
        if (rootNode) {
          const target = findNodeByNamePath(rootNode, msg.namePath);
          if (target) {
            figma.currentPage.selection = [target];
            figma.viewport.scrollAndZoomIntoView([target]);
          }
        }
      }
      break;
    }
    // UI pede bounds de um nó para touch area
    case 'get-layer-bounds': {
      if (msg.nodeId && currentRootId) {
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        const rootNode = await figma.getNodeByIdAsync(currentRootId);
        if (node && rootNode) {
          const nb = (node as SceneNode).absoluteBoundingBox;
          const rb = (rootNode as SceneNode).absoluteBoundingBox;
          if (nb && rb) {
            figma.ui.postMessage({
              type: 'layer-bounds',
              nodeId: msg.nodeId,
              bounds: { x: nb.x - rb.x, y: nb.y - rb.y, width: nb.width, height: nb.height },
            });
          }
        }
      }
      break;
    }
    // Gera handoff via template a partir da seleção atual
    case 'generate-handoff': {
      await cleanupTempInstance();
      const genTplId = templateNodeId || await recoverTemplateNodeId();
      if (genTplId && currentRootId) {
        if (!templateNodeId) templateNodeId = genTplId; // restaurar em memória
        await generateHandoffFromTemplate(currentRootId, genTplId);
      } else {
        figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Selecione o template antes de gerar o handoff.' });
      }
      break;
    }
    // Atualiza handoff existente preservando textos manuais
    case 'update-handoff': {
      await cleanupTempInstance();
      const updTplId = templateNodeId || await recoverTemplateNodeId();
      if (updTplId && currentRootId) {
        if (!templateNodeId) templateNodeId = updTplId; // restaurar em memória
        await updateHandoffFromTemplate(currentRootId, updTplId, msg.preserveManualTexts !== false, msg.sections || null);
      } else {
        figma.ui.postMessage({ type: 'handoff-result', success: false, error: 'Selecione o template antes de atualizar o handoff.' });
      }
      break;
    }
    // Verifica se já existe um handoff para o componente selecionado
    case 'check-handoff-exists': {
      if (currentRootId) {
        const comp = (await figma.getNodeByIdAsync(currentRootId)) as SceneNode;
        const existing = comp ? await findExistingHandoff(comp) : null;
        figma.ui.postMessage({ type: 'handoff-exists', exists: !!existing });
      } else {
        figma.ui.postMessage({ type: 'handoff-exists', exists: false });
      }
      break;
    }
    // Gera handoff via template com IDs explícitos
    case 'generate-handoff-template': await generateHandoffFromTemplate(msg.compNodeId, msg.tplNodeId); break;
    // Consulta quais variantes possuem overrides
    case 'get-variant-overrides': {
      const overrides = await getVariantOverrides();
      figma.ui.postMessage({ type: 'variant-overrides', overrides });
      break;
    }
    // Cria um override para uma variante e tipo de dado
    case 'create-variant-override': {
      if (msg.variantName && msg.dataType) {
        await createVariantOverride(msg.variantName, msg.dataType);
      }
      break;
    }
    // Alterna para o contexto de anotação de uma variante parametrizada
    case 'switch-variant-config': {
      if (msg.configId) {
        await sendUnifiedAnnotations(msg.configId, true);
      }
      break;
    }
    // Cria instância temporária de variante com propriedades parametrizadas
    case 'create-instance-variant': {
      if (!msg.label || !currentRootId) break;
      const rootNode = await figma.getNodeByIdAsync(currentRootId);
      if (!rootNode) break;

      // Encontrar o componente base para instanciar
      let componentBase: ComponentNode | null = null;
      if (rootNode.type === 'COMPONENT_SET') {
        const cs = rootNode as ComponentSetNode;
        componentBase = cs.children.find(c => c.type === 'COMPONENT') as ComponentNode || null;
      } else if (rootNode.type === 'COMPONENT') {
        componentBase = rootNode as ComponentNode;
      }
      if (!componentBase) break;

      // Criar instância
      const instance = componentBase.createInstance();

      // Aplicar propriedades escolhidas pelo usuário
      if (msg.properties && Object.keys(msg.properties).length > 0) {
        try { instance.setProperties(msg.properties); } catch (_e) { /* ignore erros de propriedade inválida */ }
      }

      // Encontrar ou criar o frame [A11Y Variantes] na página atual
      const page = figma.currentPage;
      let varFrame = page.children.find(n => n.name === '[A11Y Variantes]') as FrameNode | undefined;
      if (!varFrame) {
        varFrame = figma.createFrame();
        varFrame.name = '[A11Y Variantes]';
        varFrame.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.98 } }];
        varFrame.clipsContent = false;
        varFrame.resize(400, 200);
        // Posicionar à esquerda do template (ou do componente raiz)
        const refId = templateNodeId || currentRootId;
        const refNode = await figma.getNodeByIdAsync(refId);
        const ref = refNode as SceneNode;
        if (ref && 'absoluteBoundingBox' in ref && ref.absoluteBoundingBox) {
          varFrame.x = ref.absoluteBoundingBox.x - varFrame.width - 80;
          varFrame.y = ref.absoluteBoundingBox.y;
        } else if ('absoluteBoundingBox' in (rootNode as SceneNode) && (rootNode as any).absoluteBoundingBox) {
          varFrame.x = (rootNode as any).absoluteBoundingBox.x - 480;
          varFrame.y = (rootNode as any).absoluteBoundingBox.y;
        }
        page.appendChild(varFrame);
      }

      // Adicionar instância ao frame, posicionando abaixo dos filhos existentes
      const existingChildren = varFrame.children.filter(c => c !== instance);
      const lastBottom = existingChildren.reduce((acc, c) => {
        return Math.max(acc, (c as SceneNode & { y: number; height: number }).y + (c as SceneNode & { y: number; height: number }).height);
      }, 20);
      varFrame.appendChild(instance);
      instance.x = 20;
      instance.y = lastBottom + (existingChildren.length > 0 ? 20 : 0);

      // Redimensionar frame para conter todos os filhos
      const neededW = Math.max(varFrame.width, instance.x + instance.width + 20);
      const neededH = instance.y + instance.height + 20;
      varFrame.resize(neededW, neededH);

      // Criar e salvar a VariantConfig
      const configId = 'vc-' + Date.now();
      const config: VariantConfig = {
        id: configId,
        label: msg.label as string,
        instanceNodeId: instance.id,
        properties: msg.properties || {},
        step: (msg.step as number) || 3,
      };
      const sn = rootNode as SceneNode;
      const configs = readVariantConfigs(sn);
      configs.push(config);
      saveVariantConfigs(sn, configs);

      // Inicializar dados de anotação vazios para este config (evita fallback para shared)
      sn.setPluginData(KEY_SR_UNIFIED + configId, '[]');
      sn.setPluginData('a11y-touch-areas::' + configId, '[]');
      sn.setPluginData('a11y-focus-order::' + configId, '[]');

      figma.ui.postMessage({ type: 'variant-config-created', config });
      break;
    }
    // Remove uma variante parametrizada e sua instância temporária
    case 'remove-instance-variant': {
      if (!msg.configId || !currentRootId) break;
      const rootNode = await figma.getNodeByIdAsync(currentRootId);
      if (!rootNode) break;
      const sn = rootNode as SceneNode;

      const configs = readVariantConfigs(sn);
      const config = configs.find(c => c.id === msg.configId);

      if (config) {
        // Remover instância do canvas
        try {
          const inst = await figma.getNodeByIdAsync(config.instanceNodeId);
          if (inst && 'remove' in inst) (inst as SceneNode).remove();
        } catch (_e) { /* ignore */ }

        // Remover frame se ficou vazio
        try {
          const page = figma.currentPage;
          const varFrame = page.children.find(n => n.name === '[A11Y Variantes]') as FrameNode | undefined;
          if (varFrame && varFrame.children.length === 0) varFrame.remove();
        } catch (_e) { /* ignore */ }

        // Limpar dados de anotação
        sn.setPluginData(KEY_SR_UNIFIED + config.id, '');
        sn.setPluginData('a11y-touch-areas::' + config.id, '');
        sn.setPluginData('a11y-focus-order::' + config.id, '');
        sn.setPluginData('a11y-layers::' + config.id, '');

        // Salvar configs sem este item
        saveVariantConfigs(sn, configs.filter(c => c.id !== msg.configId));
      }

      figma.ui.postMessage({ type: 'variant-config-removed', configId: msg.configId as string });
      break;
    }
    // Remove o override de uma variante e tipo de dado
    case 'remove-variant-override': {
      if (msg.variantName && msg.dataType) {
        await removeVariantOverride(msg.variantName, msg.dataType);
        const overrides = await getVariantOverrides();
        figma.ui.postMessage({ type: 'variant-overrides', overrides });
      }
      break;
    }
    // Persiste as variantes selecionadas para o handoff
    case 'set-selected-variants': {
      if (currentRootId && msg.ids) {
        const node = await figma.getNodeByIdAsync(currentRootId);
        if (node && 'setPluginData' in node) {
          (node as SceneNode).setPluginData('a11y-selected-variants', JSON.stringify(msg.ids));
        }
      }
      break;
    }
    // Salva nomes de exceção por variante
    case 'save-exc-names': {
      if (currentRootId && msg.data) {
        const node = await figma.getNodeByIdAsync(currentRootId);
        if (node && 'setPluginData' in node) {
          (node as SceneNode).setPluginData('a11y-exc-names', JSON.stringify(msg.data));
        }
      }
      break;
    }
    // Lê nomes de exceção e envia para a UI
    case 'get-exc-names': {
      if (currentRootId) {
        const node = await figma.getNodeByIdAsync(currentRootId);
        if (node && 'getPluginData' in node) {
          const raw = (node as SceneNode).getPluginData('a11y-exc-names');
          const data = safeParseJson(raw, { roles: {}, touch: {}, focus: {} });
          figma.ui.postMessage({ type: 'exc-names-data', data });
        }
      }
      break;
    }
    // ── CSV: leitura dos dados carregados do template ──

    // Retorna dados CSV de teclado e gestos (carregados do template)
    case 'get-csv-data': {
      figma.ui.postMessage({
        type: 'csv-data',
        kb: cachedKbData.length > 0 ? cachedKbData : null,
        gesture: cachedGestureData.length > 0 ? cachedGestureData : null,
      });
      break;
    }
    // Retorna dados CSV de roles (carregados do template)
    case 'get-roles-csv': {
      figma.ui.postMessage({
        type: 'roles-csv-data',
        data: cachedRolesData.length > 0 ? cachedRolesData : null,
      });
      break;
    }
    // Recarrega dados CSV da versão publicada da library
    case 'reload-csv-from-library': {
      try {
        const counts = await reloadCsvFromLibrary();
        // Envia dados atualizados para a UI (reusa handlers existentes)
        figma.ui.postMessage({
          type: 'csv-data',
          kb: cachedKbData.length > 0 ? cachedKbData : null,
          gesture: cachedGestureData.length > 0 ? cachedGestureData : null,
        });
        figma.ui.postMessage({
          type: 'roles-csv-data',
          data: cachedRolesData.length > 0 ? cachedRolesData : null,
        });
        figma.ui.postMessage({
          type: 'reload-csv-result',
          success: true,
          counts,
        });
      } catch (err: any) {
        figma.ui.postMessage({
          type: 'reload-csv-result',
          success: false,
          error: err.message || String(err),
        });
      }
      break;
    }
  }
};
