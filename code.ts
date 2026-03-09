// DSC A11Y Handoff - Plugin Figma para handoff de acessibilidade

// ════════════════════════════════════════
// INTERFACES
// ════════════════════════════════════════

interface ComponentA11yData {
  platform: string[];
  zoom: string[];
  noTab?: boolean;
}

interface LayerA11yData {
  role: string;
  category: string;
  accessibleName?: string;
  altText?: string;
  headingLevel?: number;
  explanation?: string;
}

interface TouchAreaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FocusOrderEntry {
  nodeId: string;
  order: number;
  category: string;
  accessibleName?: string;
  altText?: string;
  headingLevel?: number;
}

interface LayerZone {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  hasA11yData: boolean;
  category: string;
  parentId: string;
  hasChildren: boolean;
}

interface ConnectorInfo {
  componentKey: string;
  componentName: string;
  category: string;
}

// ════════════════════════════════════════
// CONSTANTES
// ════════════════════════════════════════

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
// INICIALIZAÇÃO
// ════════════════════════════════════════

figma.showUI(__html__, { width: 520, height: 760, themeColors: true });

let currentRootId: string | null = null;
let workingNodeId: string | null = null;
let tempInstanceId: string | null = null;
let connectorMap: ConnectorInfo[] = [];

// ════════════════════════════════════════
// SELEÇÃO
// ════════════════════════════════════════

function isValidSelection(node: SceneNode): boolean {
  return node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE';
}

function cleanupTempInstance(): void {
  if (tempInstanceId) {
    try {
      const old = figma.getNodeById(tempInstanceId); // eslint-disable-line @figma/figma-plugins/ban-deprecated-sync-methods
      if (old && 'remove' in old) (old as SceneNode).remove();
    } catch (_e) { /* ignore */ }
    tempInstanceId = null;
  }
}

function handleSelectionChange(): void {
  const selection = figma.currentPage.selection;
  if (selection.length === 1 && tempInstanceId && selection[0].id === tempInstanceId) return;

  cleanupTempInstance();

  if (selection.length !== 1 || !isValidSelection(selection[0])) {
    currentRootId = null;
    workingNodeId = null;
    figma.ui.postMessage({ type: 'selection-changed', valid: false });
    return;
  }

  const root = selection[0];
  currentRootId = root.id;
  workingNodeId = root.id;

  const compRaw = root.getPluginData('a11y-component');
  let compData: ComponentA11yData | null = null;
  if (compRaw) {
    try { compData = JSON.parse(compRaw); } catch (_e) { /* ignore */ }
  }

  figma.ui.postMessage({
    type: 'selection-changed',
    valid: true,
    rootName: root.name,
    rootId: root.id,
    rootType: root.type,
    componentData: compData,
  });
}

figma.on('selectionchange', () => handleSelectionChange());
handleSelectionChange();

// ════════════════════════════════════════
// STEP 1: DADOS DO COMPONENTE
// ════════════════════════════════════════

async function setComponentData(data: ComponentA11yData): Promise<void> {
  if (!currentRootId) return;
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('setPluginData' in node)) return;
  (node as SceneNode).setPluginData('a11y-component', JSON.stringify(data));
}

// ════════════════════════════════════════
// PREVIEW
// ════════════════════════════════════════

function collectLayerZones(node: SceneNode, rootBounds: Rect, depth: number, parentId: string): LayerZone[] {
  const result: LayerZone[] = [];
  if ('children' in node) {
    const parent = node as ChildrenMixin & SceneNode;
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (!child.visible) continue;
      const bounds = child.absoluteBoundingBox;
      if (bounds && bounds.width > 0 && bounds.height > 0) {
        const raw = child.getPluginData('a11y');
        let category = '';
        if (raw) { try { category = JSON.parse(raw).category || ''; } catch (_e) { /* ignore */ } }
        const childHasChildren = 'children' in child && (child as ChildrenMixin & SceneNode).children.length > 0;
        result.push({
          id: child.id, name: child.name, type: child.type,
          x: bounds.x - rootBounds.x, y: bounds.y - rootBounds.y,
          width: bounds.width, height: bounds.height,
          depth, hasA11yData: !!raw, category, parentId,
          hasChildren: childHasChildren,
        });
      }
      result.push(...collectLayerZones(child, rootBounds, depth + 1, child.id));
    }
  }
  return result;
}

async function generatePreview(): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return;

  const root = rootNode as SceneNode;
  let previewTarget: SceneNode | null = null;

  if (root.type === 'COMPONENT_SET') {
    // Reuse existing temp instance if still alive
    if (tempInstanceId) {
      const existing = await figma.getNodeByIdAsync(tempInstanceId);
      if (existing) {
        previewTarget = existing as SceneNode;
        workingNodeId = tempInstanceId;
      } else {
        tempInstanceId = null;
      }
    }
    if (!tempInstanceId) {
      const cs = root as ComponentSetNode;
      const defaultVariant = (cs.defaultVariant || cs.children[0]) as ComponentNode;
      const tempInstance = defaultVariant.createInstance();

      const props = tempInstance.componentProperties;
      const updates: Record<string, string | boolean> = {};
      for (const key of Object.keys(props)) {
        if (props[key].type === 'BOOLEAN') updates[key] = true;
      }
      if (Object.keys(updates).length > 0) tempInstance.setProperties(updates);

      tempInstance.x = root.x;
      tempInstance.y = root.y + root.height + 500;
      tempInstanceId = tempInstance.id;
      workingNodeId = tempInstance.id;
      previewTarget = tempInstance;
    }
  } else {
    workingNodeId = root.id;
    previewTarget = root;
  }

  if (!previewTarget || !('exportAsync' in previewTarget)) return;
  const bounds = previewTarget.absoluteBoundingBox;
  if (!bounds) return;

  const bytes = await (previewTarget as SceneNode & ExportMixin).exportAsync({
    format: 'PNG', constraint: { type: 'WIDTH', value: 1040 },
  });
  const base64 = figma.base64Encode(bytes);
  const layers = collectLayerZones(previewTarget, bounds, 1, previewTarget.id);

  figma.ui.postMessage({
    type: 'preview-data',
    image: base64,
    width: bounds.width,
    height: bounds.height,
    rootZoneId: previewTarget.id,
    layers,
  });
}

// ════════════════════════════════════════
// STEP 2: ROLES POR LAYER
// ════════════════════════════════════════

async function getLayerData(nodeId: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('getPluginData' in node)) {
    figma.ui.postMessage({ type: 'layer-data', nodeId, data: null, name: '' });
    return;
  }
  const sceneNode = node as SceneNode;
  const raw = sceneNode.getPluginData('a11y');
  let data: LayerA11yData | null = null;
  if (raw) { try { data = JSON.parse(raw); } catch (_e) { /* ignore */ } }
  figma.ui.postMessage({ type: 'layer-data', nodeId, data, name: sceneNode.name });
}

async function setLayerData(nodeId: string, data: LayerA11yData): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !('setPluginData' in node)) return;
  (node as SceneNode).setPluginData('a11y', JSON.stringify(data));
  await refreshZones();
}

async function refreshZones(): Promise<void> {
  const targetId = workingNodeId || currentRootId;
  if (!targetId) return;
  const targetNode = await figma.getNodeByIdAsync(targetId);
  if (!targetNode) return;
  const target = targetNode as SceneNode;
  const bounds = target.absoluteBoundingBox;
  if (!bounds) return;
  const layers = collectLayerZones(target, bounds, 1, target.id);
  figma.ui.postMessage({ type: 'zones-updated', layers });
}

// ════════════════════════════════════════
// STEP 3: ÁREAS DE TOQUE
// Sempre salvas no currentRootId (nó original, não temp instance)
// ════════════════════════════════════════

async function saveTouchAreas(areas: TouchAreaRect[]): Promise<void> {
  if (!currentRootId) return;
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('setPluginData' in node)) return;
  (node as SceneNode).setPluginData('a11y-touch-areas', JSON.stringify(areas));
}

async function getTouchAreas(): Promise<void> {
  if (!currentRootId) { figma.ui.postMessage({ type: 'touch-areas-data', areas: [] }); return; }
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('getPluginData' in node)) { figma.ui.postMessage({ type: 'touch-areas-data', areas: [] }); return; }
  const raw = (node as SceneNode).getPluginData('a11y-touch-areas');
  let areas: TouchAreaRect[] = [];
  if (raw) { try { areas = JSON.parse(raw); } catch (_e) { /* ignore */ } }
  figma.ui.postMessage({ type: 'touch-areas-data', areas });
}

// ════════════════════════════════════════
// STEP 4: ORDEM DE FOCO
// Sempre salvas no currentRootId (nó original, não temp instance)
// ════════════════════════════════════════

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

async function getFocusOrder(): Promise<void> {
  const targetId = workingNodeId || currentRootId;
  if (!targetId || !currentRootId) {
    figma.ui.postMessage({ type: 'focus-order-data', entries: [], annotatedNodes: [] });
    return;
  }
  const rootNode = await figma.getNodeByIdAsync(targetId);
  if (!rootNode || !('getPluginData' in rootNode)) {
    figma.ui.postMessage({ type: 'focus-order-data', entries: [], annotatedNodes: [] });
    return;
  }

  const root = rootNode as SceneNode;
  const annotated = collectAnnotatedNodes(root);

  // Ler focus order do nó original (currentRootId), não do temp instance
  const origNode = await figma.getNodeByIdAsync(currentRootId);
  const raw = origNode ? (origNode as SceneNode).getPluginData('a11y-focus-order') : '';
  let storedEntries: FocusOrderEntry[] = [];
  if (raw) { try { storedEntries = JSON.parse(raw); } catch (_e) { /* ignore */ } }

  const annotatedIds = new Set(annotated.map(n => n.nodeId));
  const nameMap = new Map(annotated.map(n => [n.nodeId, n.name]));

  const kept = storedEntries.filter(e => annotatedIds.has(e.nodeId));
  const entries = kept.map((e, i) => ({
    ...e,
    order: i + 1,
    name: nameMap.get(e.nodeId) || 'Layer desconhecido',
  }));

  figma.ui.postMessage({ type: 'focus-order-data', entries, annotatedNodes: annotated });
}

async function setFocusOrder(entries: FocusOrderEntry[]): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('setPluginData' in rootNode)) return;
  (rootNode as SceneNode).setPluginData('a11y-focus-order', JSON.stringify(entries));
}

// ════════════════════════════════════════
// STEP 5: HANDOFF
// ════════════════════════════════════════

function sendProgress(text: string): void {
  figma.ui.postMessage({ type: 'handoff-progress', text });
}

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
        connectorMap.push({
          componentKey: comp.key,
          componentName: comp.name,
          category: guessCategory(comp.name, parentSet.name),
        });
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
        connectorMap.push({
          componentKey: variant.key,
          componentName: variant.name,
          category: guessCategory(variant.name, cs.name),
        });
      }
    }
  }

  figma.ui.postMessage({ type: 'connectors-discovered', count: connectorMap.length });
}

function guessCategory(variantName: string, setName: string): string {
  const name = (variantName + ' ' + setName).toLowerCase();
  if (name.includes('funcao') || name.includes('função') || name.includes('valor')) return 'funcao-valor';
  if (name.includes('titulo') || name.includes('título') || name.includes('heading') || name.includes('h1')) return 'titulo';
  if (name.includes('nome') || name.includes('acessivel') || name.includes('acessível') || name.includes('alt')) return 'nome-acessivel';
  if (name.includes('decorativ')) return 'decorativo';
  if (name.includes('estrutur')) return 'estrutural';
  return 'outros';
}

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

async function generateHandoff(): Promise<void> {
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

  // Dados do componente sempre do nó original
  const compSourceNode = (await figma.getNodeByIdAsync(currentRootId)) as SceneNode;
  const compRaw = compSourceNode.getPluginData('a11y-component');
  let compData: ComponentA11yData = { platform: [], zoom: [] };
  if (compRaw) { try { compData = JSON.parse(compRaw); } catch (_e) { /* ignore */ } }

  // Anotações de layers do working node (temp instance ou componente)
  const annotated = collectAllAnnotatedLayers(root);

  // Focus order e touch areas do nó original
  const focusRaw = compSourceNode.getPluginData('a11y-focus-order');
  let focusEntries: FocusOrderEntry[] = [];
  if (focusRaw) { try { focusEntries = JSON.parse(focusRaw); } catch (_e) { /* ignore */ } }

  const touchRaw = compSourceNode.getPluginData('a11y-touch-areas');
  let touchAreas: TouchAreaRect[] = [];
  if (touchRaw) { try { touchAreas = JSON.parse(touchRaw); } catch (_e) { /* ignore */ } }

  sendProgress('Carregando fontes...');
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Medium" });

  sendProgress('Criando frame de handoff...');

  // ── Frame container externo que agrupa tudo ──
  const outerFrame = figma.createFrame();
  outerFrame.name = `[A11Y Handoff] ${compSourceNode.name}`;
  outerFrame.layoutMode = 'VERTICAL';
  outerFrame.primaryAxisSizingMode = 'AUTO';
  outerFrame.counterAxisSizingMode = 'FIXED';
  const HF_WIDTH = 520;
  outerFrame.resize(HF_WIDTH, 100);
  outerFrame.itemSpacing = 0;
  outerFrame.fills = [];
  outerFrame.x = rootBounds.x + rootBounds.width + 100;
  outerFrame.y = rootBounds.y;

  // ── Frame principal de especificações ──
  const hf = figma.createFrame();
  hf.name = 'Especificações';
  hf.layoutMode = 'VERTICAL';
  hf.primaryAxisSizingMode = 'AUTO';
  hf.counterAxisSizingMode = 'AUTO';
  hf.paddingTop = 40; hf.paddingBottom = 40; hf.paddingLeft = 40; hf.paddingRight = 40;
  hf.itemSpacing = 24;
  hf.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  hf.cornerRadius = 8;
  hf.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
  hf.strokeWeight = 1;
  appendFill(outerFrame, hf);

  // Título
  const titleText = figma.createText();
  titleText.fontName = { family: "Inter", style: "Bold" }; titleText.fontSize = 18;
  titleText.characters = `Handoff A11Y — ${compSourceNode.name}`;
  titleText.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
  titleText.textAutoResize = 'HEIGHT';
  appendFill(hf, titleText);

  // ── Seção: Componente ──
  const compSec = mkSection('Componente');
  if (compData.platform.length > 0) appendFill(compSec, mkLine('Plataforma', compData.platform.map(p => PLATFORM_LABELS[p] || p).join(', ')));
  else appendFill(compSec, mkLine('Plataforma', 'Nenhuma definida'));
  if (compData.zoom.length > 0) appendFill(compSec, mkLine('Zoom', compData.zoom.map(z => ZOOM_LABELS[z] || z).join(', ')));
  else appendFill(compSec, mkLine('Zoom', 'Nenhum definido'));
  appendFill(hf, compSec);

  // ── Seção: Anotações ──
  sendProgress('Documentando anotações...');
  {
    const ls = mkSection('Anotações');
    if (annotated.length === 0) {
      appendFill(ls, mkLine('', 'Nenhuma anotação de role/categoria definida.'));
    }
    for (const { node: ln, data: d } of annotated) {
      const lf = figma.createFrame();
      lf.name = ln.name; lf.layoutMode = 'VERTICAL';
      lf.primaryAxisSizingMode = 'AUTO'; lf.counterAxisSizingMode = 'AUTO';
      lf.itemSpacing = 4; lf.paddingTop = 10; lf.paddingBottom = 10; lf.paddingLeft = 14; lf.paddingRight = 14;
      lf.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.96, b: 0.96 } }]; lf.cornerRadius = 6;

      const lt = figma.createText(); lt.fontName = { family: "Inter", style: "Medium" }; lt.fontSize = 13;
      lt.characters = `▸ ${ln.name}`; lt.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
      lt.textAutoResize = 'HEIGHT';
      appendFill(lf, lt);

      if (d.category) appendFill(lf, mkLine('Categoria', CATEGORY_LABELS[d.category] || d.category));
      if (d.role && d.role !== 'dont-read') appendFill(lf, mkLine('Role', d.role));
      if (d.accessibleName) appendFill(lf, mkLine('Nome acessível', d.accessibleName));
      if (d.altText) appendFill(lf, mkLine('Texto alt.', d.altText));
      if (d.headingLevel) appendFill(lf, mkLine('Nível', `h${d.headingLevel}`));
      if (d.explanation && d.category !== 'decorativo') appendFill(lf, mkLine('Explicação', d.explanation));
      appendFill(ls, lf);
    }
    appendFill(hf, ls);
  }

  // ── Seção: Áreas de toque ──
  sendProgress('Documentando áreas de toque...');
  {
    const ts = mkSection('Áreas de Toque');
    appendFill(ts, mkLine('Referência WCAG', '2.5.5 Target Size Enhanced (≥44×44px) · 2.5.8 Target Size Minimum (≥24×24px)'));
    if (touchAreas.length === 0) {
      appendFill(ts, mkLine('', 'Nenhuma área de toque definida.'));
    }
    for (let i = 0; i < touchAreas.length; i++) {
      const a = touchAreas[i];
      const w = Math.round(a.width), h = Math.round(a.height);
      const minDim = Math.min(w, h);
      let level = '❌ Insuficiente (<24px) — Não atende WCAG 2.5.8';
      if (minDim >= 44) level = '✅ Aprimorado — Atende WCAG 2.5.5 (≥44px)';
      else if (minDim >= 24) level = '⚠️ Mínimo — Atende WCAG 2.5.8 (≥24px), não atende 2.5.5';
      appendFill(ts, mkLine(`Área ${i + 1}`, `${w} × ${h}px — ${level}`));
    }
    appendFill(hf, ts);
  }

  // ── Seção: Ordem de Foco ──
  sendProgress('Documentando ordem de foco...');
  {
    const fs = mkSection('Ordem de Foco');
    if (compData.noTab) {
      appendFill(fs, mkLine('', 'Este componente não tem tabulação.'));
    } else if (focusEntries.length > 0) {
      const nameMap = new Map(collectAnnotatedNodes(root).map(n => [n.nodeId, n.name]));
      for (const e of focusEntries) {
        const nm = nameMap.get(e.nodeId) || '?';
        let desc = `${e.order}. ${nm}`;
        if (e.category) desc += ` — ${CATEGORY_LABELS[e.category] || e.category}`;
        if (e.headingLevel) desc += ` (h${e.headingLevel})`;
        appendFill(fs, mkLine('', desc));
      }
    } else {
      appendFill(fs, mkLine('', 'Nenhuma ordem de foco definida.'));
    }
    appendFill(hf, fs);
  }

  // ── Conectores no componente (ao lado dos layers anotados) ──
  sendProgress('Posicionando conectores...');
  let connectorsPlaced = 0;
  if (connectorMap.length > 0 && annotated.length > 0) {
    for (const { node: ln, data: d } of annotated) {
      const lb = ln.absoluteBoundingBox;
      if (!lb) continue;
      // Buscar conector pela categoria, ou usar 'outros' como fallback
      let conn = connectorMap.find(c => c.category === d.category);
      if (!conn) conn = connectorMap.find(c => c.category === 'outros');
      if (!conn) conn = connectorMap[0]; // usar qualquer um disponível
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

  // ── Instâncias de zoom (dentro do frame container) ──
  sendProgress('Gerando instâncias de zoom...');
  let zoomInstancesCreated = 0;
  const zoomConfigs: { key: string; scale: number; label: string }[] = [];
  if (compData.zoom.includes('resize-text')) zoomConfigs.push({ key: 'resize-text', scale: 2, label: 'Zoom 200% — Redimensionar Texto' });
  if (compData.zoom.includes('reflow')) zoomConfigs.push({ key: 'reflow', scale: 4, label: 'Zoom 400% — Refluxo' });

  for (const zc of zoomConfigs) {
    try {
      let zoomInst: SceneNode | null = null;
      if (root.type === 'COMPONENT') {
        zoomInst = (root as ComponentNode).createInstance();
      } else if (root.type === 'INSTANCE') {
        zoomInst = (root as InstanceNode).clone();
      } else if ('children' in root) {
        const workNode = workingNodeId ? await figma.getNodeByIdAsync(workingNodeId) : null;
        if (workNode && workNode.type === 'INSTANCE') {
          zoomInst = (workNode as InstanceNode).clone();
        }
      }
      if (!zoomInst) continue;

      // Frame wrapper para a instância de zoom (dentro do outer frame)
      const zoomWrap = figma.createFrame();
      zoomWrap.name = zc.label;
      zoomWrap.layoutMode = 'VERTICAL';
      zoomWrap.primaryAxisSizingMode = 'AUTO';
      zoomWrap.counterAxisSizingMode = 'AUTO';
      zoomWrap.itemSpacing = 12;
      zoomWrap.paddingTop = 24; zoomWrap.paddingBottom = 24; zoomWrap.paddingLeft = 24; zoomWrap.paddingRight = 24;
      zoomWrap.fills = [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98 } }];
      zoomWrap.strokes = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
      zoomWrap.strokeWeight = 1;
      zoomWrap.cornerRadius = 8;

      const zLabel = figma.createText();
      zLabel.fontName = { family: "Inter", style: "Bold" }; zLabel.fontSize = 14;
      zLabel.characters = zc.label;
      zLabel.fills = [{ type: 'SOLID', color: { r: 0.33, g: 0.33, b: 0.33 } }];
      zLabel.textAutoResize = 'HEIGHT';
      appendFill(zoomWrap, zLabel);

      zoomInst.rescale(zc.scale);
      zoomWrap.appendChild(zoomInst);

      // Spacer entre a spec e cada zoom section
      const spacer = figma.createFrame();
      spacer.name = 'spacer';
      spacer.resize(HF_WIDTH, 24);
      spacer.fills = [];
      appendFill(outerFrame, spacer);

      appendFill(outerFrame, zoomWrap);
      zoomInstancesCreated++;
    } catch (_e) { /* ignore */ }
  }

  sendProgress('Finalizando...');
  figma.viewport.scrollAndZoomIntoView([outerFrame]);
  figma.ui.postMessage({
    type: 'handoff-result', success: true,
    connectorsPlaced, layersAnnotated: annotated.length,
    zoomInstances: zoomInstancesCreated, touchAreas: touchAreas.length,
  });
}

function appendFill(parent: FrameNode, child: SceneNode): void {
  parent.appendChild(child);
  if ('layoutSizingHorizontal' in child) {
    (child as any).layoutSizingHorizontal = 'FILL';
  }
}

function mkSection(title: string): FrameNode {
  const s = figma.createFrame(); s.name = title; s.layoutMode = 'VERTICAL';
  s.primaryAxisSizingMode = 'AUTO'; s.counterAxisSizingMode = 'AUTO';
  s.itemSpacing = 8; s.fills = [];
  const t = figma.createText(); t.fontName = { family: "Inter", style: "Bold" }; t.fontSize = 14;
  t.characters = title; t.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
  t.textAutoResize = 'HEIGHT';
  appendFill(s, t);
  const d = figma.createRectangle(); d.name = 'divider';
  d.resize(100, 1);
  d.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
  appendFill(s, d);
  return s;
}

function mkLine(label: string, value: string): TextNode {
  const t = figma.createText(); t.fontName = { family: "Inter", style: "Regular" }; t.fontSize = 12;
  t.characters = label ? `${label}: ${value}` : value;
  t.fills = [{ type: 'SOLID', color: { r: 0.33, g: 0.33, b: 0.33 } }];
  t.textAutoResize = 'HEIGHT';
  return t;
}

// ════════════════════════════════════════
// MENSAGENS
// ════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
figma.ui.onmessage = async (msg: any) => {
  switch (msg.type) {
    case 'set-component-data': await setComponentData(msg.data); break;
    case 'generate-preview': await generatePreview(); break;
    case 'get-layer-data': if (msg.nodeId) await getLayerData(msg.nodeId); break;
    case 'set-layer-data': if (msg.nodeId && msg.data) await setLayerData(msg.nodeId, msg.data); break;
    case 'save-touch-areas': if (msg.areas) await saveTouchAreas(msg.areas); break;
    case 'get-touch-areas': await getTouchAreas(); break;
    case 'get-focus-order': await getFocusOrder(); break;
    case 'set-focus-order': if (msg.entries) await setFocusOrder(msg.entries); break;
    case 'discover-connectors': await discoverConnectors(); break;
    case 'generate-handoff': await generateHandoff(); break;
  }
};
