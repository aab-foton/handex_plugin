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

async function cleanupTempInstance(): Promise<void> {
  if (tempInstanceId) {
    try {
      const old = await figma.getNodeByIdAsync(tempInstanceId);
      if (old && 'remove' in old) (old as SceneNode).remove();
    } catch (_e) { /* ignore */ }
    tempInstanceId = null;
    workingNodeId = null;
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

  // Collect variants for COMPONENT_SET
  let variants: { id: string; name: string; width: number; height: number }[] = [];
  if (root.type === 'COMPONENT_SET') {
    const cs = root as ComponentSetNode;
    for (const child of cs.children) {
      if (child.type === 'COMPONENT') {
        variants.push({ id: child.id, name: child.name, width: Math.round(child.width), height: Math.round(child.height) });
      }
    }
  }

  // Read selected variant IDs (persisted)
  let selectedVariantIds: string[] = variants.map(v => v.id);
  if (root.type === 'COMPONENT_SET') {
    const selRaw = (root as SceneNode).getPluginData('a11y-selected-variants');
    if (selRaw) {
      try {
        const saved: string[] = JSON.parse(selRaw);
        // Filter to only still-existing variant IDs
        const validIds = new Set(variants.map(v => v.id));
        const filtered = saved.filter(id => validIds.has(id));
        if (filtered.length > 0) selectedVariantIds = filtered;
      } catch (_e) { /* ignore */ }
    }
  }

  figma.ui.postMessage({
    type: 'selection-changed',
    valid: true,
    rootName: root.name,
    rootId: root.id,
    rootType: root.type,
    componentData: compData,
    variants,
    selectedVariantIds,
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

      tempInstance.x = root.x;
      tempInstance.y = root.y + root.height + 500;
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

  const bytes = await (previewTarget as SceneNode & ExportMixin).exportAsync({
    format: 'PNG', constraint: { type: 'WIDTH', value: 1040 },
  });
  const base64 = figma.base64Encode(bytes);
  const childLayers = collectLayerZones(previewTarget, bounds, 1, previewTarget.id);

  // Include the root component itself as a selectable layer
  const rootRaw = previewTarget.getPluginData('a11y');
  let rootCat = '';
  if (rootRaw) { try { rootCat = JSON.parse(rootRaw).category || ''; } catch (_e) { /* ignore */ } }
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

async function switchVariant(variantId: string): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || rootNode.type !== 'COMPONENT_SET') return;

  // Clean up old temp instance
  await cleanupTempInstance();

  // Find the variant component
  const cs = rootNode as ComponentSetNode;
  const variant = cs.children.find(c => c.id === variantId) as ComponentNode | undefined;
  if (!variant) return;

  // Create new temp instance from selected variant
  const tempInstance = variant.createInstance();
  tempInstance.x = cs.x;
  tempInstance.y = cs.y + cs.height + 500;
  tempInstanceId = tempInstance.id;
  workingNodeId = tempInstance.id;

  // Restore annotations from effective map (shared + variant-specific)
  const effectiveMap = await getEffectiveConsolidatedMap(variant.name);
  for (const [namePath, data] of Object.entries(effectiveMap)) {
    const node = findNodeByNamePath(tempInstance, namePath);
    if (node && 'setPluginData' in node) {
      node.setPluginData('a11y', JSON.stringify(data));
    }
  }

  // Generate preview for this variant
  await generatePreview();
}

// ════════════════════════════════════════
// STEP 2: ROLES POR LAYER
// ════════════════════════════════════════

function buildNamePath(node: BaseNode, rootId: string): string {
  const parts: string[] = [];
  let cur: BaseNode | null = node;
  while (cur && cur.id !== rootId) {
    parts.unshift(cur.name);
    cur = cur.parent;
  }
  return parts.join('/');
}

async function getConsolidatedMap(variantName?: string): Promise<Record<string, LayerA11yData>> {
  if (!currentRootId) return {};
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('getPluginData' in rootNode)) return {};
  const key = variantName ? 'a11y-layers::' + variantName : 'a11y-layers';
  const raw = (rootNode as SceneNode).getPluginData(key);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_e) { return {}; }
}

async function getEffectiveConsolidatedMap(variantName?: string): Promise<Record<string, LayerA11yData>> {
  const shared = await getConsolidatedMap();
  if (!variantName) return shared;
  const specific = await getConsolidatedMap(variantName);
  return { ...shared, ...specific };
}

async function saveConsolidatedMap(map: Record<string, LayerA11yData>, variantName?: string): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('setPluginData' in rootNode)) return;
  const key = variantName ? 'a11y-layers::' + variantName : 'a11y-layers';
  (rootNode as SceneNode).setPluginData(key, JSON.stringify(map));
}

async function getAllVariantNames(): Promise<string[]> {
  if (!currentRootId) return [];
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || rootNode.type !== 'COMPONENT_SET') return [];
  const cs = rootNode as ComponentSetNode;
  return cs.children.filter(c => c.type === 'COMPONENT').map(c => c.name);
}

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

async function getVariantOverrides(): Promise<{ roles: string[], touch: string[], focus: string[] }> {
  const result = { roles: [] as string[], touch: [] as string[], focus: [] as string[] };
  if (!currentRootId) return result;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return result;
  const sn = rootNode as SceneNode;
  const variantNames = await getAllVariantNames();

  for (const vn of variantNames) {
    // Check roles: variant-specific key exists (even empty placeholder)
    const rolesKey = 'a11y-layers::' + vn;
    const variantRoles = sn.getPluginData(rolesKey);
    if (variantRoles) {
      result.roles.push(vn);
    }
    // Check touch: variant-specific key exists
    const touchKey = 'a11y-touch-areas::' + vn;
    const variantTouch = sn.getPluginData(touchKey);
    if (variantTouch) {
      result.touch.push(vn);
    }
    // Check focus: variant-specific key exists
    const focusKey = 'a11y-focus-order::' + vn;
    const variantFocus = sn.getPluginData(focusKey);
    if (variantFocus) {
      result.focus.push(vn);
    }
  }
  return result;
}

async function createVariantOverride(variantName: string, dataType: 'roles' | 'touch' | 'focus'): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return;
  const sn = rootNode as SceneNode;

  if (dataType === 'roles') {
    const key = 'a11y-layers::' + variantName;
    if (!sn.getPluginData(key)) sn.setPluginData(key, '{}');
  } else if (dataType === 'touch') {
    const key = 'a11y-touch-areas::' + variantName;
    if (!sn.getPluginData(key)) sn.setPluginData(key, '[]');
  } else if (dataType === 'focus') {
    const key = 'a11y-focus-order::' + variantName;
    if (!sn.getPluginData(key)) sn.setPluginData(key, '[]');
  }
}

async function removeVariantOverride(variantName: string, dataType: 'roles' | 'touch' | 'focus'): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode) return;
  const sn = rootNode as SceneNode;

  if (dataType === 'roles') {
    // Clear variant-specific consolidated map
    sn.setPluginData('a11y-layers::' + variantName, '');
  } else if (dataType === 'touch') {
    sn.setPluginData('a11y-touch-areas::' + variantName, '');
  } else if (dataType === 'focus') {
    sn.setPluginData('a11y-focus-order::' + variantName, '');
  }
}

function findNodeByNamePath(root: BaseNode, namePath: string): SceneNode | null {
  if (!namePath) return root as SceneNode; // empty path = root itself
  const parts = namePath.split('/');
  let cur: BaseNode = root;
  for (const part of parts) {
    if (!('children' in cur)) return null;
    const parent = cur as ChildrenMixin;
    const child = parent.children.find(c => c.name === part);
    if (!child) return null;
    cur = child;
  }
  return cur as SceneNode;
}

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
    if (raw) { try { data = JSON.parse(raw); } catch (_e) { /* ignore */ } }
  }

  // Sync to per-node for preview compatibility
  if (data) {
    sceneNode.setPluginData('a11y', JSON.stringify(data));
  }

  figma.ui.postMessage({ type: 'layer-data', nodeId, data, name: sceneNode.name, scope });
}

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
  await sendAllLayerAnnotations(variantName);
}

async function sendAllLayerAnnotations(variantName?: string, excOnly?: boolean): Promise<void> {
  let map: Record<string, LayerA11yData>;
  let variantMap: Record<string, LayerA11yData> = {};

  if (excOnly && variantName) {
    // Exception-only mode: show only variant-specific annotations
    map = await getConsolidatedMap(variantName);
    variantMap = map;
  } else {
    map = await getEffectiveConsolidatedMap(variantName);
    variantMap = variantName ? await getConsolidatedMap(variantName) : {};
  }

  const annotations = Object.entries(map).map(([namePath, data]) => ({
    namePath,
    name: namePath.split('/').pop() || namePath,
    data,
    scope: (variantName && variantMap[namePath]) ? 'variant' as const : 'all' as const,
  }));
  annotations.sort((a, b) => a.name.localeCompare(b.name));
  figma.ui.postMessage({ type: 'all-layer-annotations', annotations });
}

async function removeLayerAnnotation(namePath: string, variantName?: string): Promise<void> {
  // Remove from shared map
  const sharedMap = await getConsolidatedMap();
  delete sharedMap[namePath];
  await saveConsolidatedMap(sharedMap);

  // Remove from all variant-specific maps
  await removeFromAllVariantMaps(namePath);

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
  await sendAllLayerAnnotations(variantName);
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

async function saveTouchAreas(areas: TouchAreaRect[], variantName: string = '', applyToAll: boolean = false): Promise<void> {
  if (!currentRootId) return;
  const node = await figma.getNodeByIdAsync(currentRootId);
  if (!node || !('setPluginData' in node)) return;
  const sn = node as SceneNode;

  if (applyToAll) {
    // Save to shared key and clear all variant-specific keys
    sn.setPluginData('a11y-touch-areas::', JSON.stringify(areas));
    const variantNames = await getAllVariantNames();
    for (const vn of variantNames) {
      sn.setPluginData('a11y-touch-areas::' + vn, '');
    }
  } else {
    sn.setPluginData('a11y-touch-areas::' + variantName, JSON.stringify(areas));
  }
}

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
  let areas: TouchAreaRect[] = [];
  if (raw) { try { areas = JSON.parse(raw); } catch (_e) { /* ignore */ } }
  figma.ui.postMessage({ type: 'touch-areas-data', areas, scope });
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

async function getFocusOrder(variantName?: string): Promise<void> {
  const targetId = workingNodeId || currentRootId;
  if (!targetId || !currentRootId) {
    figma.ui.postMessage({ type: 'focus-order-data', entries: [], annotatedNodes: [], scope: 'all' });
    return;
  }
  const rootNode = await figma.getNodeByIdAsync(targetId);
  if (!rootNode || !('getPluginData' in rootNode)) {
    figma.ui.postMessage({ type: 'focus-order-data', entries: [], annotatedNodes: [], scope: 'all' });
    return;
  }

  const root = rootNode as SceneNode;
  const annotated = collectAnnotatedNodes(root);

  const origNode = await figma.getNodeByIdAsync(currentRootId);
  let raw = '';
  let scope: 'all' | 'variant' = 'all';

  // Check variant-specific focus order first
  if (variantName && origNode) {
    raw = (origNode as SceneNode).getPluginData('a11y-focus-order::' + variantName);
    if (raw) scope = 'variant';
  }
  // Fallback to shared
  if (!raw && origNode) {
    raw = (origNode as SceneNode).getPluginData('a11y-focus-order');
    scope = 'all';
  }

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

  figma.ui.postMessage({ type: 'focus-order-data', entries, annotatedNodes: annotated, scope });
}

async function setFocusOrder(entries: FocusOrderEntry[], variantName?: string, applyToAll: boolean = true): Promise<void> {
  if (!currentRootId) return;
  const rootNode = await figma.getNodeByIdAsync(currentRootId);
  if (!rootNode || !('setPluginData' in rootNode)) return;
  const sn = rootNode as SceneNode;
  const data = JSON.stringify(entries);

  if (applyToAll || !variantName) {
    sn.setPluginData('a11y-focus-order', data);
    // Remove from all variant-specific keys
    const variantNames = await getAllVariantNames();
    for (const vn of variantNames) {
      sn.setPluginData('a11y-focus-order::' + vn, '');
    }
  } else {
    sn.setPluginData('a11y-focus-order::' + variantName, data);
  }
}

// ════════════════════════════════════════
// STEP 5: HANDOFF
// ════════════════════════════════════════

// ── Cores ──
const C_BLUE: RGB = { r: 0, g: 0.36, b: 0.71 };
const C_BLACK: RGB = { r: 0.13, g: 0.13, b: 0.13 };
const C_GRAY: RGB = { r: 0.33, g: 0.33, b: 0.33 };
const C_LGRAY: RGB = { r: 0.6, g: 0.6, b: 0.6 };
const C_WHITE: RGB = { r: 1, g: 1, b: 1 };
const C_WARN_BG: RGB = { r: 1, g: 0.96, b: 0.88 };
const C_WARN_BORDER: RGB = { r: 0.9, g: 0.78, b: 0.3 };
const C_DECOR: RGB = { r: 0.91, g: 0.3, b: 0.24 };
const C_FUNCAO: RGB = { r: 0.18, g: 0.55, b: 0.34 };

const CAT_COLORS: Record<string, RGB> = {
  'funcao-valor': C_FUNCAO,
  'estrutural': { r: 0.55, g: 0.55, b: 0.55 },
  'titulo': { r: 0.48, g: 0.77, b: 0.5 },
  'nome-acessivel': { r: 0.31, g: 0.8, b: 0.77 },
  'decorativo': C_DECOR,
  'outros': { r: 0.9, g: 0.49, b: 0.13 },
};

// ── Mapeamento teclado/gestos por role ──
const ROLE_KB: Record<string, { keys: string; action: string }[]> = {
  'button': [
    { keys: 'tab ou shift + tab', action: 'Navega entre os componentes' },
    { keys: 'enter ou space', action: 'Ativa a ação do componente' },
  ],
  'link': [
    { keys: 'tab ou shift + tab', action: 'Navega entre os links' },
    { keys: 'enter', action: 'Ativa o link' },
  ],
  'checkbox': [
    { keys: 'tab ou shift + tab', action: 'Navega entre os checkboxes' },
    { keys: 'space', action: 'Marca ou desmarca o checkbox' },
  ],
  'radio': [
    { keys: 'tab', action: 'Navega para o grupo de rádio' },
    { keys: '↑ ↓ ← →', action: 'Seleciona uma opção do grupo' },
  ],
  'textbox': [
    { keys: 'tab ou shift + tab', action: 'Navega para o campo de texto' },
  ],
  'searchbox': [
    { keys: 'tab ou shift + tab', action: 'Navega para o campo de busca' },
  ],
  'switch': [
    { keys: 'tab ou shift + tab', action: 'Navega entre os componentes' },
    { keys: 'space', action: 'Alterna o estado do switch' },
  ],
  'slider': [
    { keys: 'tab ou shift + tab', action: 'Navega para o slider' },
    { keys: '↑ → / ↓ ←', action: 'Aumenta / diminui o valor' },
  ],
  'tab': [
    { keys: 'tab', action: 'Navega para a lista de abas' },
    { keys: '← →', action: 'Navega entre as abas' },
    { keys: 'enter ou space', action: 'Ativa a aba selecionada' },
  ],
  'combobox': [
    { keys: 'tab ou shift + tab', action: 'Navega para o combobox' },
    { keys: '↑ ↓', action: 'Navega entre as opções' },
    { keys: 'enter', action: 'Seleciona a opção' },
    { keys: 'esc', action: 'Fecha a lista' },
  ],
  'listbox': [
    { keys: 'tab ou shift + tab', action: 'Navega para a lista' },
    { keys: '↑ ↓', action: 'Navega entre os itens' },
  ],
  'menu': [
    { keys: 'enter ou space', action: 'Abre o menu' },
    { keys: '↑ ↓', action: 'Navega entre os itens do menu' },
    { keys: 'esc', action: 'Fecha o menu' },
  ],
  'menuitem': [
    { keys: '↑ ↓', action: 'Navega entre os itens do menu' },
    { keys: 'enter ou space', action: 'Ativa o item do menu' },
  ],
  'dialog': [
    { keys: 'tab ou shift + tab', action: 'Navega entre os elementos do diálogo' },
    { keys: 'esc', action: 'Fecha o diálogo' },
  ],
};

const ROLE_GESTURE: Record<string, { gesture: string; action: string }[]> = {
  'button': [
    { gesture: 'Swipe', action: 'Avança e retorna pelos componentes' },
    { gesture: 'Doubletap', action: 'Ativa a ação do componente' },
  ],
  'link': [
    { gesture: 'Swipe', action: 'Avança e retorna pelos links' },
    { gesture: 'Doubletap', action: 'Ativa o link' },
  ],
  'checkbox': [
    { gesture: 'Swipe', action: 'Avança e retorna pelos checkboxes' },
    { gesture: 'Doubletap', action: 'Marca ou desmarca o checkbox' },
  ],
  'switch': [
    { gesture: 'Swipe', action: 'Avança e retorna pelos componentes' },
    { gesture: 'Doubletap', action: 'Alterna o estado do switch' },
  ],
  'radio': [
    { gesture: 'Swipe', action: 'Avança e retorna pelas opções' },
    { gesture: 'Doubletap', action: 'Seleciona a opção' },
  ],
  'textbox': [
    { gesture: 'Swipe', action: 'Avança e retorna pelos campos' },
    { gesture: 'Doubletap', action: 'Ativa o campo para edição' },
  ],
  'slider': [
    { gesture: 'Swipe up/down', action: 'Ajusta o valor do slider' },
  ],
  'tab': [
    { gesture: 'Swipe', action: 'Avança e retorna pelas abas' },
    { gesture: 'Doubletap', action: 'Ativa a aba' },
  ],
  'dialog': [
    { gesture: 'Swipe', action: 'Navega entre os elementos do diálogo' },
  ],
};

// ── Progress ──
function sendProgress(text: string): void {
  figma.ui.postMessage({ type: 'handoff-progress', text });
}

// ── Connector discovery ──
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

// ════════════════════════════════════════
// HANDOFF HELPERS
// ════════════════════════════════════════

function appendFill(parent: FrameNode, child: SceneNode): void {
  parent.appendChild(child);
  if ('layoutSizingHorizontal' in child) (child as any).layoutSizingHorizontal = 'FILL';
}

function mkT(chars: string, size: number, style: 'Bold' | 'Regular' | 'Medium', color: RGB): TextNode {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style }; t.fontSize = size;
  t.characters = chars;
  t.fills = [{ type: 'SOLID', color }];
  t.textAutoResize = 'HEIGHT';
  return t;
}

function mkSec(spacing: number = 16): FrameNode {
  const f = figma.createFrame();
  f.layoutMode = 'VERTICAL'; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = spacing; f.fills = [];
  return f;
}

function mkDivider(): RectangleNode {
  const d = figma.createRectangle(); d.name = 'divider';
  d.resize(100, 1); d.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];
  return d;
}

function mkKeyTag(text: string): FrameNode {
  const f = figma.createFrame();
  f.layoutMode = 'HORIZONTAL'; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.paddingLeft = 8; f.paddingRight = 8; f.paddingTop = 4; f.paddingBottom = 4;
  f.cornerRadius = 4;
  f.fills = [{ type: 'SOLID', color: { r: 0.95, g: 0.95, b: 0.95 } }];
  f.strokes = [{ type: 'SOLID', color: { r: 0.82, g: 0.82, b: 0.82 } }]; f.strokeWeight = 1;
  f.appendChild(mkT(text, 11, 'Medium', C_BLACK));
  return f;
}

function mkTableRow(cells: SceneNode[], colWidths: number[], isHeader: boolean): FrameNode {
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

function mkTable(headers: string[], rows: { cells: (string | FrameNode)[] }[], col1W: number): FrameNode {
  const table = figma.createFrame();
  table.name = 'Table'; table.layoutMode = 'VERTICAL';
  table.primaryAxisSizingMode = 'AUTO'; table.counterAxisSizingMode = 'AUTO';
  table.itemSpacing = 0; table.fills = [];
  table.strokes = [{ type: 'SOLID', color: { r: 0.88, g: 0.88, b: 0.88 } }]; table.strokeWeight = 1;
  table.cornerRadius = 6; table.clipsContent = true;
  // Header
  const hCells = headers.map(h => mkT(h, 11, 'Bold', C_BLACK));
  const hr = mkTableRow(hCells as SceneNode[], [col1W], true);
  appendFill(table, hr);
  // Rows
  for (const r of rows) {
    const sep = figma.createRectangle(); sep.resize(100, 1);
    sep.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.92 } }];
    appendFill(table, sep);
    const rCells: SceneNode[] = r.cells.map(c => typeof c === 'string' ? mkT(c, 11, 'Regular', C_GRAY) as SceneNode : c);
    const dr = mkTableRow(rCells, [col1W], false);
    appendFill(table, dr);
  }
  return table;
}

function mkInfoBox(text: string): FrameNode {
  const box = figma.createFrame();
  box.layoutMode = 'HORIZONTAL'; box.primaryAxisSizingMode = 'AUTO'; box.counterAxisSizingMode = 'AUTO';
  box.paddingLeft = 16; box.paddingRight = 16; box.paddingTop = 14; box.paddingBottom = 14;
  box.itemSpacing = 10; box.counterAxisAlignItems = 'MIN';
  box.cornerRadius = 6;
  box.fills = [{ type: 'SOLID', color: C_WARN_BG }];
  box.strokes = [{ type: 'SOLID', color: C_WARN_BORDER }]; box.strokeWeight = 1;
  // Icon
  const icon = mkT('⚠', 14, 'Regular', { r: 0.8, g: 0.6, b: 0.1 });
  box.appendChild(icon);
  // Text
  const txt = mkT(text, 11, 'Regular', { r: 0.4, g: 0.33, b: 0.1 });
  txt.textAutoResize = 'HEIGHT';
  appendFill(box, txt);
  return box;
}

function mkBadge(content: string, color: RGB, size: number = 22): FrameNode {
  const b = figma.createFrame();
  b.resize(size, size); b.cornerRadius = size / 2;
  b.fills = [{ type: 'SOLID', color }];
  b.layoutMode = 'HORIZONTAL'; b.primaryAxisAlignItems = 'CENTER'; b.counterAxisAlignItems = 'CENTER';
  b.primaryAxisSizingMode = 'FIXED'; b.counterAxisSizingMode = 'FIXED';
  const t = mkT(content, size > 20 ? 11 : 9, 'Bold', C_WHITE);
  t.textAlignHorizontal = 'CENTER';
  b.appendChild(t);
  return b;
}

function mkLegendItem(color: RGB, label: string): FrameNode {
  const f = figma.createFrame();
  f.layoutMode = 'HORIZONTAL'; f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.itemSpacing = 6; f.counterAxisAlignItems = 'CENTER'; f.fills = [];
  const dot = figma.createEllipse(); dot.resize(10, 10);
  dot.fills = [{ type: 'SOLID', color }];
  f.appendChild(dot);
  f.appendChild(mkT(label, 10, 'Regular', C_LGRAY));
  return f;
}

function mkAnnotationRow(badge: FrameNode, text: string, subtext?: string): FrameNode {
  const row = figma.createFrame();
  row.layoutMode = 'HORIZONTAL'; row.primaryAxisSizingMode = 'AUTO'; row.counterAxisSizingMode = 'AUTO';
  row.itemSpacing = 10; row.counterAxisAlignItems = 'MIN'; row.fills = [];
  row.appendChild(badge);
  if (subtext) {
    const col = mkSec(2);
    col.appendChild(mkT(text, 12, 'Bold', C_BLACK));
    col.appendChild(mkT(subtext, 11, 'Regular', C_GRAY));
    appendFill(row, col);
  } else {
    const t = mkT(text, 12, 'Regular', C_GRAY);
    t.textAutoResize = 'HEIGHT';
    appendFill(row, t);
  }
  return row;
}

function mkPreviewTag(): FrameNode {
  const tag = figma.createFrame();
  tag.layoutMode = 'HORIZONTAL'; tag.primaryAxisSizingMode = 'AUTO'; tag.counterAxisSizingMode = 'AUTO';
  tag.paddingLeft = 10; tag.paddingRight = 10; tag.paddingTop = 5; tag.paddingBottom = 5;
  tag.cornerRadius = 4;
  tag.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.2, b: 0.2 } }];
  tag.appendChild(mkT('Preview', 11, 'Bold', C_WHITE));
  return tag;
}

async function cloneSource(root: SceneNode, workId: string | null): Promise<SceneNode | null> {
  if (root.type === 'COMPONENT') return (root as ComponentNode).createInstance();
  if (root.type === 'INSTANCE') return (root as InstanceNode).clone();
  if (root.type === 'COMPONENT_SET' && workId) {
    const w = await figma.getNodeByIdAsync(workId);
    if (w && w.type === 'INSTANCE') return (w as InstanceNode).clone();
  }
  return null;
}

async function mkPreviewFrame(
  root: SceneNode, workId: string | null,
  badges: { relX: number; relY: number; content: string; color: RGB; layerCenterY?: number }[],
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
  const tag = mkPreviewTag();
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

    // Line
    const line = figma.createFrame();
    line.name = 'connector'; line.fills = [];
    line.resize(2, LINE_H);
    line.fills = [{ type: 'SOLID', color: b.color }];

    if (isBottom) {
      // Badge below: line goes from layer bottom to badge
      const lineY = cloneY + (b.layerCenterY ?? b.relY);
      line.x = anchorX - 1;
      line.y = lineY;
      const badge = mkBadge(b.content, b.color);
      badge.x = anchorX - badge.width / 2;
      badge.y = lineY + LINE_H + LINE_GAP;
      pf.appendChild(line);
      pf.appendChild(badge);
    } else {
      // Badge above: line goes from badge bottom to layer top
      const badgeY = anchorY - LINE_H - LINE_GAP - BADGE_SIZE;
      line.x = anchorX - 1;
      line.y = anchorY - LINE_H;
      const badge = mkBadge(b.content, b.color);
      badge.x = anchorX - badge.width / 2;
      badge.y = badgeY;
      pf.appendChild(line);
      pf.appendChild(badge);
    }
  }

  return pf;
}

// ── Touch Area Preview (retângulos rosa + badges numerados) ──
async function mkTouchPreview(
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
  const tag = mkPreviewTag();
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
    const areaBadge = mkBadge(String(ti + 1), C_BLUE, 20);
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
  let compData: ComponentA11yData = { platform: [], zoom: [] };
  if (compRaw) { try { compData = JSON.parse(compRaw); } catch (_e) { /* ignore */ } }

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
  if (variantsToRender.length > 0) {
    for (const v of variantsToRender) {
      const effectiveMap = await getEffectiveConsolidatedMap(v.name);
      const inst = v.component.createInstance();
      // Apply effective annotations to instance
      for (const [namePath, data] of Object.entries(effectiveMap)) {
        const node = findNodeByNamePath(inst, namePath);
        if (node && 'setPluginData' in node) {
          node.setPluginData('a11y', JSON.stringify(data));
        }
      }
      const varAnnotated = collectAllAnnotatedLayers(inst);
      perVariantAnnotations.push({ variantName: v.name, annotated: varAnnotated });
      inst.remove();
    }
  }

  // Collect per-variant touch areas
  interface PerVariantTouchData { variantName: string; touchAreas: TouchAreaRect[] }
  const perVariantTouch: PerVariantTouchData[] = [];
  if (variantsToRender.length > 0) {
    for (const v of variantsToRender) {
      const touchKey = 'a11y-touch-areas::' + v.name;
      let touchRaw = compSourceNode.getPluginData(touchKey);
      if (!touchRaw) touchRaw = compSourceNode.getPluginData('a11y-touch-areas');
      if (!touchRaw) touchRaw = compSourceNode.getPluginData('a11y-touch-areas::');
      let ta: TouchAreaRect[] = [];
      if (touchRaw) { try { ta = JSON.parse(touchRaw); } catch (_e) { /* ignore */ } }
      perVariantTouch.push({ variantName: v.name, touchAreas: ta });
    }
  } else {
    let touchRaw = compSourceNode.getPluginData('a11y-touch-areas::');
    if (!touchRaw) touchRaw = compSourceNode.getPluginData('a11y-touch-areas');
    let ta: TouchAreaRect[] = [];
    if (touchRaw) { try { ta = JSON.parse(touchRaw); } catch (_e) { /* ignore */ } }
    perVariantTouch.push({ variantName: '', touchAreas: ta });
  }

  // Focus order — check per-variant first, then shared
  let focusEntries: FocusOrderEntry[] = [];
  // For multi-variant, we'll use per-variant if available
  const focusRaw = compSourceNode.getPluginData('a11y-focus-order');
  if (focusRaw) { try { focusEntries = JSON.parse(focusRaw); } catch (_e) { /* ignore */ } }

  // Collect per-variant focus orders
  interface PerVariantFocusData { variantName: string; entries: FocusOrderEntry[] }
  const perVariantFocus: PerVariantFocusData[] = [];
  if (variantsToRender.length > 0) {
    for (const v of variantsToRender) {
      let vRaw = compSourceNode.getPluginData('a11y-focus-order::' + v.name);
      let entries: FocusOrderEntry[] = [];
      if (vRaw) { try { entries = JSON.parse(vRaw); } catch (_e) { /* ignore */ } }
      // Fallback to shared
      if (entries.length === 0 && focusEntries.length > 0) entries = focusEntries;
      perVariantFocus.push({ variantName: v.name, entries });
    }
  }

  // Roles únicos para tabelas de teclado/gestos
  const roles = [...new Set(annotated.map(a => a.data.role).filter(r => r && r !== 'dont-read'))];

  sendProgress('Carregando fontes...');
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  sendProgress('Criando documento de handoff...');

  const HF_WIDTH = 800;
  const INNER_W = HF_WIDTH - 96; // 48px padding each side

  // ── Frame principal ──
  const doc = figma.createFrame();
  doc.name = `[A11Y Handoff] ${compSourceNode.name}`;
  doc.layoutMode = 'VERTICAL'; doc.primaryAxisSizingMode = 'AUTO'; doc.counterAxisSizingMode = 'FIXED';
  doc.resize(HF_WIDTH, 100);
  doc.paddingTop = 48; doc.paddingBottom = 48; doc.paddingLeft = 48; doc.paddingRight = 48;
  doc.itemSpacing = 40; doc.fills = [{ type: 'SOLID', color: C_WHITE }];
  doc.x = rootBounds.x + rootBounds.width + 120; doc.y = rootBounds.y;

  // ── Título ──
  appendFill(doc, mkT('Acessibilidade', 24, 'Bold', C_BLUE));

  // ════════════════ MAPEAMENTO DO TECLADO ════════════════
  sendProgress('Mapeamento de teclado...');
  {
    const sec = mkSec(12);
    appendFill(sec, mkT('Mapeamento do Teclado', 16, 'Bold', C_BLACK));
    // Collect keyboard entries from roles
    const kbEntries: { keys: string; action: string }[] = [];
    const seen = new Set<string>();
    for (const role of roles) {
      for (const e of (ROLE_KB[role] || [])) {
        const k = e.keys + '|' + e.action;
        if (!seen.has(k)) { seen.add(k); kbEntries.push(e); }
      }
    }
    if (kbEntries.length === 0) {
      kbEntries.push({ keys: 'tab ou shift + tab', action: 'Navega entre os elementos interativos' });
    }
    const tableRows = kbEntries.map(e => ({ cells: [mkKeyTag(e.keys) as FrameNode | string, e.action] }));
    appendFill(sec, mkTable(['Tecla(s)', 'Ação'], tableRows, 240));
    appendFill(doc, sec);
  }

  // ════════════════ GESTOS COM O LEITOR DE TELA ════════════════
  sendProgress('Gestos do leitor de tela...');
  {
    const sec = mkSec(12);
    appendFill(sec, mkT('Gestos com o Leitor de Tela', 16, 'Bold', C_BLACK));
    const gestEntries: { gesture: string; action: string }[] = [];
    const seen = new Set<string>();
    for (const role of roles) {
      for (const e of (ROLE_GESTURE[role] || [])) {
        const k = e.gesture + '|' + e.action;
        if (!seen.has(k)) { seen.add(k); gestEntries.push(e); }
      }
    }
    if (gestEntries.length === 0) {
      gestEntries.push({ gesture: 'Swipe', action: 'Avança e retorna pelos elementos' });
      gestEntries.push({ gesture: 'Doubletap', action: 'Ativa o elemento' });
    }
    const tableRows = gestEntries.map(e => ({ cells: [e.gesture, e.action] }));
    appendFill(sec, mkTable(['Gestos', 'Ação'], tableRows, 240));
    appendFill(doc, sec);
  }

  appendFill(doc, mkDivider());

  // ════════════════ TAMANHO DE ÁREA DE CLIQUE E TOQUE ════════════════
  sendProgress('Áreas de toque...');
  {
    const sec = mkSec(16);
    appendFill(sec, mkT('Tamanho de Área de Clique e Toque', 16, 'Bold', C_BLACK));

    const anyTouchAreas = perVariantTouch.some(pv => pv.touchAreas.length > 0);
    if (anyTouchAreas) {
      if (variantsToRender.length > 1) {
        // Multi-variant: side-by-side touch previews
        const touchRow = figma.createFrame();
        touchRow.name = 'Touch Variants'; touchRow.layoutMode = 'HORIZONTAL';
        touchRow.primaryAxisSizingMode = 'AUTO'; touchRow.counterAxisSizingMode = 'AUTO';
        touchRow.itemSpacing = 40; touchRow.fills = [];
        const perVarWidth = Math.floor((INNER_W - 40 * (variantsToRender.length - 1)) / variantsToRender.length);

        for (let vi = 0; vi < variantsToRender.length; vi++) {
          const v = variantsToRender[vi];
          const pvData = perVariantTouch[vi];
          const varCol = mkSec(8);
          appendFill(varCol, mkT(v.name, 12, 'Bold', C_BLACK));
          const inst = v.component.createInstance();
          const touchPf = await mkTouchPreview(inst, inst.id, pvData.touchAreas, perVarWidth);
          inst.remove();
          appendFill(varCol, touchPf);
          for (let i = 0; i < pvData.touchAreas.length; i++) {
            const a = pvData.touchAreas[i];
            const w = Math.round(a.width), h = Math.round(a.height);
            const minDim = Math.min(w, h);
            let level = 'Insuficiente — não atende WCAG 2.5.8';
            if (minDim >= 44) level = 'Aprimorado — atende WCAG 2.5.5 (≥44px)';
            else if (minDim >= 24) level = 'Mínimo — atende WCAG 2.5.8 (≥24px)';
            appendFill(varCol, mkAnnotationRow(mkBadge(String(i + 1), C_BLUE), `Área ${i + 1} — ${w} × ${h}px`, level));
          }
          touchRow.appendChild(varCol);
        }
        appendFill(sec, touchRow);
      } else {
        // Single variant
        const touchAreas = perVariantTouch[0].touchAreas;
        const pf = await mkTouchPreview(root, workingNodeId, touchAreas, INNER_W);
        appendFill(sec, pf);
        for (let i = 0; i < touchAreas.length; i++) {
          const a = touchAreas[i];
          const w = Math.round(a.width), h = Math.round(a.height);
          const minDim = Math.min(w, h);
          let level = 'Insuficiente — não atende WCAG 2.5.8';
          if (minDim >= 44) level = 'Aprimorado — atende WCAG 2.5.5 (≥44px)';
          else if (minDim >= 24) level = 'Mínimo — atende WCAG 2.5.8 (≥24px)';
          appendFill(sec, mkAnnotationRow(mkBadge(String(i + 1), C_BLUE), `Área ${i + 1} — ${w} × ${h}px`, level));
        }
      }
    } else {
      appendFill(sec, mkT('Nenhuma área de toque definida.', 11, 'Regular', C_LGRAY));
    }

    appendFill(doc, sec);
  }

  appendFill(doc, mkDivider());

  // ════════════════ ORDEM DE FOCO POR TABULAÇÃO ════════════════
  sendProgress('Ordem de foco...');
  {
    const sec = mkSec(16);
    appendFill(sec, mkT('Ordem de Foco por Tabulação', 16, 'Bold', C_BLACK));

    // Info box
    appendFill(sec, mkInfoBox(
      'Ordem de foco por tabulação é a ordem em que os elementos interativos de uma página recebem foco do teclado (ao pressionar a tecla Tab). ' +
      'Ela deve ser lógica, intuitiva e deve preservar o significado e a operabilidade da interface. ' +
      'Para idiomas ocidentais, a sequência padrão é da esquerda para a direita, do topo para a base.'
    ));

    if (compData.noTab) {
      appendFill(sec, mkAnnotationRow(mkBadge('—', C_LGRAY), 'Este componente não tem tabulação.'));
    } else {
      // Focus order — shared, single preview (include root itself)
      const zones: LayerZone[] = [{
        id: root.id, name: root.name, type: root.type,
        x: 0, y: 0, width: rootBounds.width, height: rootBounds.height,
        depth: 0, hasA11yData: false, category: '', parentId: '', hasChildren: true,
      }, ...collectLayerZones(root, rootBounds, 1, root.id)];
      const focusBadges = focusEntries.map((e, i) => {
        const zone = zones.find(z => z.id === e.nodeId);
        return zone ? { relX: zone.x + zone.width / 2, relY: zone.y, content: String(i + 1), color: C_BLUE, layerCenterY: zone.y + zone.height } : null;
      }).filter((b): b is NonNullable<typeof b> => b !== null);
      const pf = await mkPreviewFrame(root, workingNodeId, focusBadges, INNER_W);
      if (pf) appendFill(sec, pf);

      if (focusEntries.length > 0) {
        const nameMap = new Map(collectAnnotatedNodes(root).map(n => [n.nodeId, n.name]));
        for (const e of focusEntries) {
          const nm = nameMap.get(e.nodeId) || '?';
          const catLabel = e.category ? CATEGORY_LABELS[e.category] || e.category : '';
          appendFill(sec, mkAnnotationRow(mkBadge(String(e.order), C_BLUE), nm, catLabel || undefined));
        }
      } else {
        appendFill(sec, mkT('Nenhuma ordem de foco definida.', 11, 'Regular', C_LGRAY));
      }
    }

    appendFill(doc, sec);
  }

  appendFill(doc, mkDivider());

  // ════════════════ LEITOR DE TELA ════════════════
  sendProgress('Leitor de tela...');
  {
    const sec = mkSec(16);
    appendFill(sec, mkT('Leitor de Tela', 16, 'Bold', C_BLACK));

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
      const content = a.data.category === 'decorativo' ? '⊘' : String(srNumIdx++);
      return zone ? { relX: zone.x + zone.width / 2, relY: zone.y, content, color, layerCenterY: zone.y + zone.height } : null;
    }).filter((b): b is NonNullable<typeof b> => b !== null);
    const pf = await mkPreviewFrame(root, workingNodeId, srBadges, INNER_W);
    if (pf) appendFill(sec, pf);

    // Legend
    if (annotated.length > 0) {
      const legend = figma.createFrame();
      legend.layoutMode = 'HORIZONTAL'; legend.primaryAxisSizingMode = 'AUTO'; legend.counterAxisSizingMode = 'AUTO';
      legend.itemSpacing = 16; legend.fills = [];
      const usedCats = [...new Set(annotated.map(a => a.data.category).filter(Boolean))];
      for (const cat of usedCats) {
        legend.appendChild(mkLegendItem(CAT_COLORS[cat] || CAT_COLORS['outros'], CATEGORY_LABELS[cat] || cat));
      }
      appendFill(sec, legend);
    }

    // Annotations — use same labels as preview badges
    if (annotated.length === 0) {
      appendFill(sec, mkT('Nenhuma anotação definida.', 11, 'Regular', C_LGRAY));
    }
    // Build label map: decorativo → ⊘, others → sequential number
    let numIdx = 1;
    const labels: string[] = annotated.map(a => {
      if (a.data.category === 'decorativo') return '⊘';
      return String(numIdx++);
    });
    for (let i = 0; i < annotated.length; i++) {
      const { node: ln, data: d } = annotated[i];
      const color = CAT_COLORS[d.category] || CAT_COLORS['outros'];
      const label = labels[i];

      if (d.category === 'decorativo') {
        appendFill(sec, mkAnnotationRow(mkBadge('⊘', C_DECOR), 'Não deve ser anunciado pelo Leitor de Tela.'));
      } else {
        let roleDesc = '';
        if (d.role && d.role !== 'dont-read') roleDesc = `Identificar como ${d.role}`;
        if (d.accessibleName) roleDesc += (roleDesc ? ' — ' : '') + `Nome acessível: "${d.accessibleName}"`;
        if (d.altText) roleDesc += (roleDesc ? ' — ' : '') + `Texto alt.: "${d.altText}"`;
        if (d.headingLevel) roleDesc += (roleDesc ? ' — ' : '') + `Nível h${d.headingLevel}`;
        appendFill(sec, mkAnnotationRow(mkBadge(label, color), ln.name, roleDesc || undefined));
        if (d.explanation) appendFill(sec, mkInfoBox(d.explanation));
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
    appendFill(doc, mkDivider());

    const zoomSec = mkSec(24);
    appendFill(zoomSec, mkT('Instâncias de Zoom', 16, 'Bold', C_BLACK));

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

        zoomCard.appendChild(mkT(zc.label, 12, 'Bold', C_GRAY));
        if ('rescale' in zoomInst) (zoomInst as InstanceNode).rescale(zc.scale);
        zoomCard.appendChild(zoomInst);
        zoomRow.appendChild(zoomCard);
        zoomInstancesCreated++;
      } catch (_e) { /* ignore */ }
    }

    appendFill(zoomSec, zoomRow);
    appendFill(doc, zoomSec);
  }

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
// MENSAGENS
// ════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
figma.ui.onmessage = async (msg: any) => {
  switch (msg.type) {
    case 'set-component-data': await setComponentData(msg.data); break;
    case 'generate-preview': await generatePreview(); break;
    case 'switch-variant': if (msg.variantId) await switchVariant(msg.variantId); break;
    case 'get-layer-data': if (msg.nodeId) await getLayerData(msg.nodeId, msg.variantName); break;
    case 'set-layer-data': if (msg.nodeId && msg.data) await setLayerData(msg.nodeId, msg.data, msg.variantName, msg.applyToAll !== false); break;
    case 'get-all-layer-annotations': await sendAllLayerAnnotations(msg.variantName, msg.excOnly); break;
    case 'remove-layer-annotation': if (msg.namePath) await removeLayerAnnotation(msg.namePath, msg.variantName); break;
    case 'save-touch-areas': if (msg.areas) await saveTouchAreas(msg.areas, msg.variantName || '', !!msg.applyToAll); break;
    case 'get-touch-areas': await getTouchAreas(msg.variantName || ''); break;
    case 'get-focus-order': await getFocusOrder(msg.variantName); break;
    case 'set-focus-order': if (msg.entries) await setFocusOrder(msg.entries, msg.variantName, msg.applyToAll !== false); break;
    case 'discover-connectors': await discoverConnectors(); break;
    case 'generate-handoff': await generateHandoff(msg.selectedVariantIds || []); break;
    case 'get-variant-overrides': {
      const overrides = await getVariantOverrides();
      figma.ui.postMessage({ type: 'variant-overrides', overrides });
      break;
    }
    case 'create-variant-override': {
      if (msg.variantName && msg.dataType) {
        await createVariantOverride(msg.variantName, msg.dataType);
      }
      break;
    }
    case 'remove-variant-override': {
      if (msg.variantName && msg.dataType) {
        await removeVariantOverride(msg.variantName, msg.dataType);
        const overrides = await getVariantOverrides();
        figma.ui.postMessage({ type: 'variant-overrides', overrides });
      }
      break;
    }
    case 'set-selected-variants': {
      if (currentRootId && msg.ids) {
        const node = await figma.getNodeByIdAsync(currentRootId);
        if (node && 'setPluginData' in node) {
          (node as SceneNode).setPluginData('a11y-selected-variants', JSON.stringify(msg.ids));
        }
      }
      break;
    }
  }
};
