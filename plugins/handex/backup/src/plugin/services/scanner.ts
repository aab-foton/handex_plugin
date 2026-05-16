import { extractSpecs } from '../utils/specs';

// Função auxiliar para transformar nomes planos em árvore hierárquica
function buildTokenTree(flatTokens: any[]) {
  const tree: any = {};
  
  flatTokens.forEach(token => {
    const parts = token.name.split('/');
    let current = tree;
    
    parts.forEach((part: string, index: number) => {
      if (index === parts.length - 1) {
        current[part] = {
          type: token.type,
          values: token.values,
          description: token.description || '',
          remote: token.remote || false,
          collection: token.collectionName || 'Default'
        };
      } else {
        if (!current[part]) current[part] = {};
        if (typeof current[part] !== 'object') {
            const val = current[part];
            current[part] = { _value: val };
        }
        current = current[part];
      }
    });
  });
  
  return tree;
}

export const getPages = () => {
  const pages = figma.root.children
    .filter(node => node && node.type === 'PAGE')
    .map(page => ({ id: page.id, name: page.name }));
  figma.ui.postMessage({ type: 'pages-list', pages });
};

export const scanProject = async (selectedPageIds: string[]) => {
  figma.ui.postMessage({ type: 'log', message: 'Iniciando varredura profunda de ativos...' });
  
  try {
    const encounteredVariableIds = new Set<string>();
    const encounteredStyleIds = new Set<string>();
    
    const data: any = {
      title: figma.root.name,
      timestamp: new Date().toISOString(),
      fileKey: figma.fileKey || 'local',
      summary: {
        pagesCount: 0,
        framesCount: 0,
        componentsCount: 0,
        instancesCount: 0,
        remoteInstancesCount: 0,
        variablesCount: 0,
        stylesCount: 0,
        annotationsCount: 0,
        measurementsCount: 0,
      },
      designTokens: {
        raw: [] as any[],
        tree: {} as any
      },
      designStyles: [] as any[], // Novo: Para auditoria de Estilos legados/híbridos
      pages: [],
      libsUsed: [],
    };

    const selectedPages = figma.root.children.filter(node => 
      node && node.type === 'PAGE' && selectedPageIds.includes(node.id)
    ) as PageNode[];
    
    data.summary.pagesCount = selectedPages.length;

    // 1. Coletar variáveis locais
    try {
      const localVariables = await figma.variables.getLocalVariablesAsync();
      localVariables.forEach(v => encounteredVariableIds.add(v.id));
    } catch (e) {}

    // 2. Coletar estilos locais (Paint, Text, Effect)
    try {
      const paintStyles = figma.getLocalPaintStyles();
      const textStyles = figma.getLocalTextStyles();
      const effectStyles = figma.getLocalEffectStyles();
      
      [...paintStyles, ...textStyles, ...effectStyles].forEach(s => {
        encounteredStyleIds.add(s.id);
        data.designStyles.push({
          id: s.id,
          name: s.name,
          type: s.type,
          description: s.description,
          remote: s.remote
        });
      });
      data.summary.stylesCount = data.designStyles.length;
    } catch (e) {}

    const libsSet = new Set<string>();
    const remoteComponentKeys = new Set<string>();

    for (let pIdx = 0; pIdx < selectedPages.length; pIdx++) {
      const page = selectedPages[pIdx];
      figma.ui.postMessage({ type: 'log', message: `Analisando página: ${page.name}` });

      const pageData: any = {
        id: page.id,
        name: page.name,
        frames: [],
        components: [],
        instances: [],
        annotations: [],
        measurements: []
      };

      let nodeCount = 0;

      const traverse = (node: any, currentFrame: any = null) => {
        if (!node) return;
        nodeCount++;

        // --- DADOS PARA AUDITORIA PROGRAMÁTICA ---
        const nodeAudit: any = {
          id: node.id,
          name: node.name,
          type: node.type,
          bindings: {} as Record<string, string>,
          styles: {} as Record<string, string>,
          mainComponentKey: node.type === 'INSTANCE' && node.mainComponent ? node.mainComponent.key : undefined
        };

        // Capturar IDs de variáveis vinculadas (Tokens)
        if ('boundVariables' in node && node.boundVariables) {
          const bv = node.boundVariables;
          for (const [prop, binding] of Object.entries(bv)) {
            if (binding) {
              if (Array.isArray(binding)) {
                nodeAudit.bindings[prop] = binding.map((b: any) => b.id).join('|');
                binding.forEach((b: any) => encounteredVariableIds.add(b.id));
              } else {
                const bId = (binding as any).id;
                nodeAudit.bindings[prop] = bId;
                encounteredVariableIds.add(bId);
              }
            }
          }
        }

        // Capturar IDs de Estilos (Styles)
        const styleProps = ['fillStyleId', 'strokeStyleId', 'textStyleId', 'effectStyleId', 'gridStyleId'];
        styleProps.forEach(prop => {
          if (prop in node && node[prop]) {
            const sId = node[prop];
            if (typeof sId === 'string' && sId.length > 0 && sId !== figma.mixed.toString()) {
              nodeAudit.styles[prop] = sId;
              encounteredStyleIds.add(sId);
            }
          }
        });

        let frameContext = currentFrame;
        if (node.type === 'FRAME' || node.type === 'SECTION') {
          const isRootFrame = !currentFrame;
          if (isRootFrame) {
            data.summary.framesCount++;
            const specs = { colors: new Set<string>(), gradients: new Set<string>(), typography: new Set<string>(), effects: new Set<string>(), strokes: new Set<string>(), grids: new Set<string>() };
            extractSpecs(node, specs);
            const frameData: any = {
              id: node.id,
              name: node.name,
              type: node.type,
              width: Math.round(node.width),
              height: Math.round(node.height),
              specs: {
                colors: Array.from(specs.colors),
                gradients: Array.from(specs.gradients),
                typography: Array.from(specs.typography),
                effects: Array.from(specs.effects),
                strokes: Array.from(specs.strokes),
                grids: Array.from(specs.grids)
              },
              auditLog: [] as any[],
              annotations: [] as any[],
              texts: [] as string[]
            };
            pageData.frames.push(frameData);
            frameContext = frameData;
          }
        }

        // Se o nó tem vínculos, estilos ou é instância, registra no auditLog
        if (frameContext && (Object.keys(nodeAudit.bindings).length > 0 || Object.keys(nodeAudit.styles).length > 0 || nodeAudit.mainComponentKey)) {
           frameContext.auditLog.push(nodeAudit);
        }

        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
          data.summary.componentsCount++;
          pageData.components.push({ id: node.id, name: node.name, type: node.type, description: (node as any).description || '' });
        }
        
        if (node.type === 'INSTANCE') {
          data.summary.instancesCount++;
          if (node.mainComponent && node.mainComponent.remote) {
            data.summary.remoteInstancesCount++;
            remoteComponentKeys.add(node.mainComponent.key);
          }
          pageData.instances.push({
            id: node.id,
            name: node.name,
            componentName: node.mainComponent ? (node.mainComponent.parent?.type === 'COMPONENT_SET' ? node.mainComponent.parent.name : node.mainComponent.name) : 'Unknown',
            isRemote: !!(node.mainComponent && node.mainComponent.remote),
            mainComponentKey: node.mainComponent?.key
          });
        }

        if ('annotations' in node && Array.isArray(node.annotations)) {
          node.annotations.forEach((ann: any) => {
            data.summary.annotationsCount++;
            const a = { nodeName: node.name, label: ann.label || '', text: ann.labelMarkdown || '' };
            pageData.annotations.push(a);
            if (frameContext) frameContext.annotations.push(a);
          });
        }

        if (node.type === 'TEXT' && node.characters && frameContext) {
           frameContext.texts.push(node.characters.trim());
        }

        if ('children' in node && node.children) {
          for (const child of node.children) traverse(child, frameContext);
        }
      };

      traverse(page);
      data.pages.push(pageData);
      await new Promise(r => setTimeout(r, 10));
    }

    // 3. Resolver Variáveis
    figma.ui.postMessage({ type: 'log', message: 'Resolvendo tokens...' });
    const resolvedTokens: any[] = [];
    const collectionCache: Record<string, string> = {};
    const varIds = Array.from(encounteredVariableIds);
    for (const vId of varIds) {
        try {
            const v = await figma.variables.getVariableByIdAsync(vId);
            if (!v) continue;
            if (!collectionCache[v.variableCollectionId]) {
                const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
                collectionCache[v.variableCollectionId] = col ? col.name : 'Default';
            }
            const mv: Record<string, any> = {};
            for (const [mId, val] of Object.entries(v.valuesByMode)) {
                let pv = val;
                if (v.resolvedType === 'COLOR' && val && typeof val === 'object' && 'r' in (val as any)) {
                    const c = val as RGBA;
                    pv = '#' + [c.r, c.g, c.b].map(x => Math.round(x*255).toString(16).padStart(2,'0')).join('');
                } else if (v.resolvedType === 'FLOAT') pv = val + 'px';
                mv[mId] = pv;
            }
            resolvedTokens.push({ id: v.id, name: v.name, type: v.resolvedType, remote: v.remote, collectionName: collectionCache[v.variableCollectionId], values: mv });
        } catch(e) {}
    }

    // 4. Resolver Estilos Remotos que não estavam no getLocal
    figma.ui.postMessage({ type: 'log', message: 'Resolvendo estilos remotos...' });
    const styleIds = Array.from(encounteredStyleIds);
    for (const sId of styleIds) {
        const existing = data.designStyles.find((s:any) => s.id === sId);
        if (!existing) {
            try {
                const s = await figma.importStyleByKeyAsync(sId.split(',')[1] || sId); // Simplificação de key
                if (s) data.designStyles.push({ id: s.id, name: s.name, type: s.type, remote: true });
            } catch(e) {
                // Se falhar importação por key, tentamos apenas o que o figma nos dá
                try {
                    const s = await figma.getStyleById(sId);
                    if (s) data.designStyles.push({ id: s.id, name: s.name, type: s.type, remote: s.remote });
                } catch(err) {}
            }
        }
    }

    data.designTokens.raw = resolvedTokens;
    data.designTokens.tree = buildTokenTree(resolvedTokens);
    data.summary.variablesCount = resolvedTokens.length;

    // 5. Mapear Bibliotecas
    const keys = Array.from(remoteComponentKeys);
    for (let i = 0; i < keys.length; i += 20) {
        const batch = keys.slice(i, i + 20);
        await Promise.allSettled(batch.map(async k => {
            try {
                const c = await figma.importComponentByKeyAsync(k);
                if (c) libsSet.add(c.parent?.type === 'COMPONENT_SET' ? c.parent.name : c.name);
            } catch(e) {}
        }));
    }
    data.libsUsed = Array.from(libsSet);
    figma.ui.postMessage({ type: 'scan-complete', data });

  } catch (error: any) {
    figma.ui.postMessage({ type: 'log', message: `Erro fatal: ${error.message}` });
  }
};
