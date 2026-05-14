import { extractSpecs } from '../utils/specs';

const rgbToHex = (color: any) => {
  if (!color || typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') return '#000000';
  const toHex = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
};

const buildTokenTree = (tokens: any[]) => {
  const tree: any = {};
  tokens.forEach((token: any) => {
    const parts = token.name.split('/');
    let current = tree;
    parts.forEach((part: string, index: number) => {
      if (index === parts.length - 1) {
        current[part] = {
          $value: token.value,
          $type: token.type,
          $description: token.description,
          $modes: token.valuesByMode,
          $isRemote: token.isRemote || false
        };
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    });
  });
  return tree;
};

// Helper to resolve alias name from ID
const getVariableNameById = (id: string, allVariables: any[]) => {
  const v = allVariables.find(v => v.id === id);
  return v ? v.name : id;
};

const formatVariableValue = (value: any, type: string, allVariables: any[] = []) => {
  if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
    const aliasName = getVariableNameById(value.id, allVariables);
    return { 
      type: 'ALIAS', 
      id: value.id, 
      name: aliasName,
      // We don't resolve the final value here because it depends on the mode
      // and could lead to circular dependencies if not careful.
      // The UI/Consumer should resolve it using the provided ID/Name.
      value: `alias(${aliasName})` 
    };
  }

  if (type === 'COLOR' && value && typeof value === 'object' && 'r' in value) {
    const hex = rgbToHex(value);
    const alpha = typeof value.a === 'number' ? Math.round(value.a * 100) : 100;
    return { 
      raw: value, 
      hex, 
      alpha: `${alpha}%`,
      rgba: `rgba(${Math.round(value.r * 255)}, ${Math.round(value.g * 255)}, ${Math.round(value.b * 255)}, ${alpha / 100})`
    };
  }

  if (type === 'FLOAT') {
    return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
  }

  if (type === 'BOOLEAN') {
    return Boolean(value);
  }

  if (type === 'STRING') {
    return String(value);
  }

  return value === undefined || value === null ? '' : value;
};

const serializePaint = (paint: any) => {
  if (!paint || !paint.type) return { type: 'UNKNOWN' };
  const result: any = { type: paint.type };

  if (paint.boundVariables) {
    result.boundVariables = paint.boundVariables;
  }

  if (paint.type === 'SOLID') {
    result.color = rgbToHex(paint.color);
    result.opacity = typeof paint.opacity === 'number' ? `${Math.round(paint.opacity * 100)}%` : '100%';
  } else if (typeof paint.type === 'string' && paint.type.startsWith('GRADIENT')) {
    result.stops = Array.isArray(paint.gradientStops) ? paint.gradientStops.length : 0;
  }

  return result;
};

const serializeTextStyle = (style: any) => {
  const lineHeight = style.lineHeight;
  let lineHeightStr = 'auto';
  if (lineHeight.unit === 'PIXELS') lineHeightStr = `${Math.round(lineHeight.value)}px`;
  if (lineHeight.unit === 'PERCENT') lineHeightStr = `${Math.round(lineHeight.value)}%`;

  const letterSpacing = style.letterSpacing;
  let letterSpacingStr = '0px';
  if (letterSpacing.unit === 'PIXELS') letterSpacingStr = `${letterSpacing.value}px`;
  if (letterSpacing.unit === 'PERCENT') letterSpacingStr = `${Math.round(letterSpacing.value)}%`;

  const out: any = {
    name: style.name,
    description: style.description || '',
    family: style.fontName?.family || '',
    weight: style.fontName?.style || '',
    size: `${style.fontSize}px`,
    lineHeight: lineHeightStr,
    letterSpacing: letterSpacingStr,
    paragraphSpacing: `${style.paragraphSpacing}px`,
    textCase: style.textCase,
    textDecoration: style.textDecoration,
    // Keep raw for backward compatibility if needed
    fontName: style.fontName && typeof style.fontName === 'object' ? `${style.fontName.family} ${style.fontName.style}` : String(style.fontName || ''),
  };
  
  if (style.boundVariables) {
    out.boundVariables = style.boundVariables;
  }
  
  return out;
};

const serializeEffectStyle = (style: any) => ({
  name: style.name,
  description: style.description || '',
  effects: Array.isArray(style.effects) ? style.effects.map((effect: any) => ({
    type: effect.type,
    radius: effect.radius,
    offset: effect.offset,
    color: effect.color ? rgbToHex(effect.color) : undefined,
    visible: effect.visible,
  })) : [],
});

const serializeGridStyle = (style: any) => ({
  name: style.name,
  description: style.description || '',
  pattern: style.pattern,
  sectionSize: style.sectionSize,
  gutterSize: style.gutterSize,
  offset: style.offset,
  alignment: style.alignment,
  count: style.count,
});

export const getPages = () => {
  const pages = figma.root.children
    .filter(node => node && node.type === 'PAGE')
    .map(page => ({ id: page.id, name: page.name }));
  figma.ui.postMessage({ type: 'pages-list', pages });
};

export const scanProject = async (selectedPageIds: string[]) => {
  console.log("scanProject started", selectedPageIds);
  figma.ui.postMessage({ type: 'log', message: 'Iniciando varredura detalhada...' });
  
  try {
    const data: any = {
      title: figma.root.name,
      timestamp: new Date().toISOString(),
      fileKey: figma.fileKey || 'local',
      totalPagesInFile: figma.root.children.length,
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
        colors: [] as any[],
        numbers: [] as any[],
        strings: [] as any[],
        booleans: [] as any[],
        variables: [] as any[],
        tokensTree: {} as any,
        categorized: {
          spacing: {} as any,
          radii: {} as any,
          typography: {} as any,
          colors: {} as any,
          opacity: {} as any,
          borders: {} as any,
          others: {} as any
        }
      },
      styleTokens: {
        paint: [] as any[],
        text: [] as any[],
        effects: [] as any[],
        grids: [] as any[],
      },
      pages: [],
      libsUsed: [],
    };

    const libsSet = new Set<string>();
    const remoteComponentKeys = new Set<string>();
    const usedVariableIds = new Set<string>();

    const selectedPages = figma.root.children.filter(node => 
      node && node.type === 'PAGE' && selectedPageIds.includes(node.id)
    ) as PageNode[];
    
    data.summary.pagesCount = selectedPages.length;
    console.log("Selected pages:", selectedPages.length);

    try {
      figma.ui.postMessage({ type: 'log', message: 'Extraindo Design Tokens (variáveis)...' });
      console.log("Fetching local variables...");
      const localVariables = await figma.variables.getLocalVariablesAsync();
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      console.log("Variables found:", localVariables.length);
      
      const modeMap: { [id: string]: string } = {};
      collections.forEach(col => {
        col.modes.forEach(m => {
          modeMap[m.modeId] = m.name;
        });
      });

      data.summary.variablesCount = localVariables.length;

      for (let i = 0; i < localVariables.length; i++) {
        const variable = localVariables[i];
        
        // Yield every 100 variables to keep UI responsive
        if (i % 100 === 0) {
          await new Promise(r => setTimeout(r, 1));
        }

        const valuesByMode = Object.entries(variable.valuesByMode || {}).map(([modeId, rawValue]) => ({
          modeId,
          modeName: modeMap[modeId] || modeId,
          value: formatVariableValue(rawValue, variable.resolvedType, localVariables),
        }));

        const entry: any = {
          id: variable.id,
          name: variable.name,
          type: variable.resolvedType,
          description: variable.description || '',
          valuesByMode,
        };

        const firstValue = valuesByMode.length ? valuesByMode[0].value : undefined;

        // Functional Categorization
        const path = variable.name.toLowerCase();
        const firstModeValue = firstValue;
        const valToStore = typeof firstModeValue === 'object' && firstModeValue.type === 'ALIAS' ? firstModeValue.value : firstModeValue;

        if (path.includes('spacing') || path.includes('gap')) {
          data.designTokens.categorized.spacing[variable.name] = valToStore;
        } else if (path.includes('radius') || path.includes('rounded')) {
          data.designTokens.categorized.radii[variable.name] = valToStore;
        } else if (path.includes('font') || path.includes('text') || path.includes('typography')) {
          data.designTokens.categorized.typography[variable.name] = valToStore;
        } else if (path.includes('color') || path.includes('bg') || path.includes('fill') || path.includes('stroke')) {
          data.designTokens.categorized.colors[variable.name] = valToStore;
        } else if (path.includes('opacity')) {
          data.designTokens.categorized.opacity[variable.name] = valToStore;
        } else if (path.includes('border')) {
          data.designTokens.categorized.borders[variable.name] = valToStore;
        } else {
          data.designTokens.categorized.others[variable.name] = valToStore;
        }

        if (variable.resolvedType === 'COLOR' && firstValue && typeof firstValue === 'object' && firstValue.hex) {
          entry.value = firstValue.hex;
          entry.alpha = firstValue.alpha;
          data.designTokens.colors.push(entry);
        } else if (variable.resolvedType === 'FLOAT') {
          entry.value = typeof firstModeValue === 'number' ? `${firstModeValue}px` : String(firstModeValue);
          data.designTokens.numbers.push(entry);
        } else if (variable.resolvedType === 'STRING') {
          entry.value = String(firstValue);
          data.designTokens.strings.push(entry);
        } else if (variable.resolvedType === 'BOOLEAN') {
          entry.value = Boolean(firstValue);
          data.designTokens.booleans.push(entry);
        }

        data.designTokens.variables.push(entry);
      }
      
      data.designTokens.tokensTree = buildTokenTree(data.designTokens.variables);
    } catch (e) {
      console.error("Erro ao buscar variáveis", e);
    }

    try {
      figma.ui.postMessage({ type: 'log', message: 'Extraindo estilos locais de design...' });
      console.log("Fetching local styles...");

      const localPaintStyles = figma.getLocalPaintStyles ? figma.getLocalPaintStyles() : [];
      const localTextStyles = figma.getLocalTextStyles ? figma.getLocalTextStyles() : [];
      const localEffectStyles = figma.getLocalEffectStyles ? figma.getLocalEffectStyles() : [];
      const localGridStyles = figma.getLocalGridStyles ? figma.getLocalGridStyles() : [];

      data.summary.stylesCount = localPaintStyles.length + localTextStyles.length + localEffectStyles.length + localGridStyles.length;

      localPaintStyles.forEach((style: any) => {
        data.styleTokens.paint.push({
          name: style.name,
          type: style.type,
          description: style.description || '',
          paints: Array.isArray(style.paints) ? style.paints.map(serializePaint) : [],
        });
      });

      localTextStyles.forEach((style: any) => {
        data.styleTokens.text.push(serializeTextStyle(style));
      });

      localEffectStyles.forEach((style: any) => {
        data.styleTokens.effects.push(serializeEffectStyle(style));
      });

      localGridStyles.forEach((style: any) => {
        data.styleTokens.grids.push(serializeGridStyle(style));
      });
    } catch (e) {
      console.error("Erro ao buscar estilos locais", e);
    }

    for (let pIdx = 0; pIdx < selectedPages.length; pIdx++) {
      const page = selectedPages[pIdx];
      figma.ui.postMessage({ type: 'log', message: `Varrendo página ${pIdx + 1} de ${selectedPages.length}: ${page.name}` });

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

      const traverse = async (node: any, currentFrame: any = null) => {
        if (!node) return;
        
        nodeCount++;
        
        // Yield every 500 nodes to keep Figma UI alive
        if (nodeCount % 500 === 0) {
          await new Promise(r => setTimeout(r, 1));
        }

        // Track bound variables for remote token detection
        if (node.boundVariables) {
          Object.values(node.boundVariables).forEach((v: any) => {
            if (Array.isArray(v)) {
              v.forEach(item => { if (item.id) usedVariableIds.add(item.id); });
            } else if (v && v.id) {
              usedVariableIds.add(v.id);
            }
          });
        }

        if (nodeCount % 1000 === 0) {
          figma.ui.postMessage({ type: 'log', message: `Processando página ${page.name}... (${nodeCount} elementos)` });
        }

        let frameContext = currentFrame;

        if (node.type === 'FRAME' || node.type === 'SECTION') {
          const isRootFrame = !currentFrame;
          
          let frameData: any = null;
          if (isRootFrame) {
            data.summary.framesCount++;
            
            const specs = {
              colors: new Set<string>(),
              gradients: new Set<string>(),
              typography: new Set<string>(),
              effects: new Set<string>(),
              strokes: new Set<string>(),
              grids: new Set<string>(),
              radii: new Set<string>(),
              opacities: new Set<string>(),
              layout: new Set<string>(),
              spacing: new Set<string>(),
              fills: new Set<string>(),
              borders: new Set<string>(),
            };
            extractSpecs(node, specs);

            frameData = {
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
                grids: Array.from(specs.grids),
                radii: Array.from(specs.radii),
                opacities: Array.from(specs.opacities),
                layout: Array.from(specs.layout),
                spacing: Array.from(specs.spacing),
                fills: Array.from(specs.fills),
                borders: Array.from(specs.borders),
              },
              annotations: [] as any[],
              texts: [] as string[]
            };
            pageData.frames.push(frameData);
            frameContext = frameData;
          }
        }

        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
          data.summary.componentsCount++;
          pageData.components.push({
            id: node.id,
            name: node.name,
            type: node.type,
            description: (node as any).description || ''
          });
        }
        
        if (node.type === 'INSTANCE') {
          data.summary.instancesCount++;
          const isRemote = node.mainComponent && node.mainComponent.remote;
          if (isRemote) {
            data.summary.remoteInstancesCount++;
            remoteComponentKeys.add(node.mainComponent.key);
          }
          
          let compName = 'Desconhecido';
          if (node.mainComponent) {
            if (node.mainComponent.parent && node.mainComponent.parent.type === 'COMPONENT_SET') {
              compName = node.mainComponent.parent.name;
            } else {
              compName = node.mainComponent.name;
            }
          }

          let componentProperties = {};
          try {
            componentProperties = node.componentProperties || {};
          } catch (e) {
            console.warn("Could not get componentProperties for node", node.name, e);
          }

          pageData.instances.push({
            id: node.id,
            name: node.name,
            componentName: compName,
            isRemote: !!isRemote,
            properties: componentProperties
          });
        }

        if ('annotations' in node && Array.isArray(node.annotations) && node.annotations.length > 0) {
          for (const annotation of node.annotations) {
            data.summary.annotationsCount++;
            const annData = {
              nodeName: node.name,
              nodeType: node.type,
              label: annotation.label || '',
              text: annotation.labelMarkdown || ''
            };
            pageData.annotations.push(annData);
            if (frameContext) {
              frameContext.annotations.push(annData);
            }
          }
        }

        if (node.type === 'STICKY') {
          data.summary.annotationsCount++;
          const annData = {
            nodeName: 'Sticky Note',
            nodeType: 'STICKY',
            label: 'Sticky',
            text: node.text ? node.text.characters : ''
          };
          pageData.annotations.push(annData);
          if (frameContext) {
            frameContext.annotations.push(annData);
          }
        }

        if (node.type === 'TEXT') {
          if (node.characters && node.characters.trim().length > 0) {
            if (frameContext) {
              frameContext.texts.push(node.characters.trim());
            }
          }
        }

        if ('children' in node && node.children) {
          for (const child of node.children) {
            await traverse(child, frameContext);
          }
        }
      };

      await traverse(page);

      if ('getMeasurements' in page) {
        try {
          const measurements = (page as any).getMeasurements();
          for (const measure of measurements) {
            data.summary.measurementsCount++;
            let startName = '?';
            if (measure.start && measure.start.node) startName = measure.start.node.name;
            let endName = '?';
            if (measure.end && measure.end.node) endName = measure.end.node.name;
            pageData.measurements.push({ text: measure.freeText || '', start: startName, end: endName });
          }
        } catch (e) {}
      }

      data.pages.push(pageData);
      
      // Yield to event loop to keep UI responsive
      await new Promise(r => setTimeout(r, 10));
    }

    // Resolve remote variables
    if (usedVariableIds.size > 0) {
      const idsArray = Array.from(usedVariableIds);
      figma.ui.postMessage({ type: 'log', message: `Resolvendo variáveis externas/remotas... (0 de ${idsArray.length})` });
      
      const localVars = await figma.variables.getLocalVariablesAsync();
      const localIds = new Set(localVars.map(v => v.id));
      
      let resolvedCount = 0;
      for (let i = 0; i < idsArray.length; i++) {
        const id = idsArray[i];
        if (localIds.has(id)) continue; 
        
        resolvedCount++;
        if (resolvedCount % 20 === 0) {
          figma.ui.postMessage({ type: 'log', message: `Resolvendo variáveis externas/remotas... (${i + 1} de ${idsArray.length})` });
          await new Promise(r => setTimeout(r, 1));
        }
        
        try {
          const variable = await figma.variables.getVariableByIdAsync(id);
          if (variable) {
            const valuesByMode = Object.entries(variable.valuesByMode || {}).map(([mode, rawValue]) => ({
              mode,
              value: formatVariableValue(rawValue, variable.resolvedType, localVars),
            }));

            const entry: any = {
              name: `[REMOTE] ${variable.name}`,
              type: variable.resolvedType,
              description: variable.description || '',
              valuesByMode,
              isRemote: true
            };
            
            data.designTokens.variables.push(entry);
          }
        } catch (e) {}
      }
      // Rebuild tree to include remote variables
      data.designTokens.tokensTree = buildTokenTree(data.designTokens.variables);
    }

    if (remoteComponentKeys.size > 0) {
      const keysArray = Array.from(remoteComponentKeys);
      const BATCH_SIZE = 20;

      for (let i = 0; i < keysArray.length; i += BATCH_SIZE) {
        figma.ui.postMessage({ type: 'log', message: `Mapeando bibliotecas de componentes remotos... (${Math.min(i + BATCH_SIZE, keysArray.length)} de ${keysArray.length})` });
        const batch = keysArray.slice(i, i + BATCH_SIZE);
        
        await Promise.allSettled(
          batch.map(async (key) => {
            try {
              const component = await figma.importComponentByKeyAsync(key);
              if (component) {
                let libName = component.parent && component.parent.type === 'COMPONENT_SET' 
                  ? component.parent.name 
                  : component.name;
                libsSet.add(libName);
              }
            } catch (err) {}
          })
        );
      }
    }

    data.libsUsed = Array.from(libsSet);
    figma.ui.postMessage({ type: 'scan-complete', data });
  } catch (error: any) {
    console.error(error);
    figma.ui.postMessage({ type: 'log', message: `❌ Erro fatal ao mapear projeto: ${error.message}` });
  }
};

