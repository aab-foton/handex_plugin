export const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const formatPx = (value: number | undefined) => (typeof value === 'number' ? `${value}px` : 'unknown');

const safeSpecString = (value: any) => {
  if (typeof value === 'symbol') return value.description ? value.description : value.toString();
  if (value === undefined || value === null) return '';
  return String(value);
};

const addColorValue = (specs: any, color: any, opacity?: number) => {
  if (!color || typeof color.r !== 'number' || typeof color.g !== 'number' || typeof color.b !== 'number') return;
  const hex = rgbToHex(color.r, color.g, color.b);
  if (typeof opacity === 'number' && opacity < 1) {
    specs.colors.add(`${hex} @ ${formatPercent(opacity)}`);
  } else {
    specs.colors.add(hex);
  }
};

const addFillValue = (specs: any, fill: any) => {
  if (!fill || !fill.type) return;

  if (fill.type === 'SOLID') {
    addColorValue(specs, fill.color, fill.opacity ?? fill.opacity === 0 ? fill.opacity : undefined);
    specs.fills.add('SOLID');
  } else if (typeof fill.type === 'string' && fill.type.startsWith('GRADIENT')) {
    specs.gradients.add(`${fill.type}${fill.gradientStops?.length ? ` (${fill.gradientStops.length} stops)` : ''}`);
  } else if (fill.type === 'IMAGE') {
    specs.fills.add('IMAGE');
  } else if (fill.type !== undefined && fill.type !== null) {
    specs.fills.add(safeSpecString(fill.type));
  }
};

const addStrokeValue = (specs: any, node: any) => {
  if (!node.strokes || !Array.isArray(node.strokes)) return;
  node.strokes.forEach((stroke: any) => {
    if (stroke.type === 'SOLID') {
      addColorValue(specs, stroke.color, stroke.opacity ?? undefined);
    }
    const styleParts = [];
    if (typeof node.strokeWeight === 'number') styleParts.push(`${node.strokeWeight}px`);
    if (node.strokeAlign) styleParts.push(safeSpecString(node.strokeAlign));
    if (node.strokeJoin) styleParts.push(safeSpecString(node.strokeJoin));
    if (node.strokeCap) styleParts.push(safeSpecString(node.strokeCap));
    if (Array.isArray(node.dashPattern) && node.dashPattern.length > 0) {
      styleParts.push(`dash(${node.dashPattern.join(',')})`);
    }
    if (styleParts.length > 0) {
      specs.borders.add(styleParts.join(' '));
    }
  });
};

const addCornerRadiusValue = (specs: any, node: any) => {
  if (typeof node.cornerRadius === 'number') {
    specs.radii.add(`${node.cornerRadius}px`);
  } else if (Array.isArray(node.rectangleCornerRadii)) {
    node.rectangleCornerRadii.forEach((radius: number) => {
      specs.radii.add(`${radius}px`);
    });
  }
  if (typeof node.cornerSmoothing === 'number') {
    specs.radii.add(`smoothing ${node.cornerSmoothing}`);
  }
};

const addLayoutValue = (specs: any, node: any) => {
  if (node.layoutMode) {
    const layoutParts = [`mode:${safeSpecString(node.layoutMode)}`];
    if (typeof node.itemSpacing === 'number') layoutParts.push(`gap:${node.itemSpacing}px`);
    if (typeof node.paddingTop === 'number') layoutParts.push(`pt:${node.paddingTop}px`);
    if (typeof node.paddingRight === 'number') layoutParts.push(`pr:${node.paddingRight}px`);
    if (typeof node.paddingBottom === 'number') layoutParts.push(`pb:${node.paddingBottom}px`);
    if (typeof node.paddingLeft === 'number') layoutParts.push(`pl:${node.paddingLeft}px`);
    if (node.primaryAxisAlignItems) layoutParts.push(`primary:${safeSpecString(node.primaryAxisAlignItems)}`);
    if (node.counterAxisAlignItems) layoutParts.push(`counter:${safeSpecString(node.counterAxisAlignItems)}`);
    if (node.primaryAxisSizingMode) layoutParts.push(`primarySizing:${safeSpecString(node.primaryAxisSizingMode)}`);
    if (node.counterAxisSizingMode) layoutParts.push(`counterSizing:${safeSpecString(node.counterAxisSizingMode)}`);
    specs.layout.add(layoutParts.join(' '));
    if (typeof node.itemSpacing === 'number') specs.spacing.add(`${node.itemSpacing}px`);
  }
  if (node.layoutAlign) specs.layout.add(`align:${safeSpecString(node.layoutAlign)}`);
  if (node.constraints && typeof node.constraints === 'object') {
    specs.layout.add(`constraints:${JSON.stringify(node.constraints)}`);
  }
};

const addEffectValue = (specs: any, effect: any) => {
  if (!effect || !effect.type) return;
  const effectParts = [effect.type];
  if (typeof effect.radius === 'number') effectParts.push(`${effect.radius}px`);
  if (effect.offset && typeof effect.offset.x === 'number' && typeof effect.offset.y === 'number') {
    effectParts.push(`offset(${effect.offset.x}px,${effect.offset.y}px)`);
  }
  if (effect.visible === false) effectParts.push('hidden');
  if (effect.color) {
    const color = rgbToHex(effect.color.r, effect.color.g, effect.color.b);
    effectParts.push(color);
  }
  specs.effects.add(effectParts.join(' '));
};

const addTextValue = (specs: any, node: any) => {
  if (node.type !== 'TEXT') return;
  try {
    const fontName = node.fontName;
    const fontSize = node.fontSize;
    if (fontName && typeof fontName === 'object' && 'family' in fontName) {
      const sizeStr = typeof fontSize === 'number' ? `${fontSize}px` : 'mixed';
      const lineHeight = node.lineHeight;
      let lineHeightStr = '';
      if (lineHeight && typeof lineHeight === 'object') {
        if (lineHeight.unit === 'PERCENT') lineHeightStr = `lineHeight:${lineHeight.value}%`;
        else if (lineHeight.unit === 'PIXELS') lineHeightStr = `lineHeight:${lineHeight.value}px`;
      }
      const letterSpacing = node.letterSpacing;
      const letterSpacingStr = letterSpacing ? `${letterSpacing.value}${letterSpacing.unit === 'PERCENT' ? '%' : 'px'}` : '';
      const textCase = node.textCase;
      const textDecoration = node.textDecoration;
      const styleParts = [safeSpecString(fontName.family), safeSpecString(fontName.style), sizeStr];
      if (lineHeightStr) styleParts.push(lineHeightStr);
      if (letterSpacingStr) styleParts.push(`letterSpacing:${letterSpacingStr}`);
      if (textCase) styleParts.push(safeSpecString(textCase));
      if (textDecoration) styleParts.push(safeSpecString(textDecoration));
      specs.typography.add(styleParts.filter(Boolean).join(' '));
    }
  } catch (_){
    // Silently skip mixed/symbol font properties
  }
};

const addGridValue = (specs: any, grid: any) => {
  if (!grid || !grid.pattern) return;
  const parts = [grid.pattern];
  if (typeof grid.sectionSize === 'number') parts.push(`section:${grid.sectionSize}px`);
  if (typeof grid.gutterSize === 'number') parts.push(`gutter:${grid.gutterSize}px`);
  if (typeof grid.offset === 'number') parts.push(`offset:${grid.offset}px`);
  if (typeof grid.count === 'number') parts.push(`count:${grid.count}`);
  specs.grids.add(parts.join(' '));
};

export const extractSpecs = (node: any, specs: any) => {
  if (typeof node.opacity === 'number') {
    specs.opacities.add(formatPercent(node.opacity));
  }
  if (node.fills && Array.isArray(node.fills)) {
    node.fills.forEach((fill: any) => addFillValue(specs, fill));
  }
  if (node.strokes && Array.isArray(node.strokes) && node.strokes.length > 0) {
    addStrokeValue(specs, node);
  }
  if (node.type === 'TEXT') {
    addTextValue(specs, node);
  }
  if (node.effects && Array.isArray(node.effects)) {
    node.effects.forEach((effect: any) => {
      if (effect.visible !== false) addEffectValue(specs, effect);
    });
  }
  if (node.layoutGrids && Array.isArray(node.layoutGrids)) {
    node.layoutGrids.forEach((grid: any) => addGridValue(specs, grid));
  }
  addCornerRadiusValue(specs, node);
  addLayoutValue(specs, node);

  if ('children' in node && node.children) {
    for (const child of node.children) {
      extractSpecs(child, specs);
    }
  }
};
