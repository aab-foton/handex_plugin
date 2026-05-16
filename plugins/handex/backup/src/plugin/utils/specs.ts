export const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return '#' + toHex(r) + toHex(g) + toHex(b);
};

export const extractSpecs = (node: any, specs: any) => {
  if (node.fills && Array.isArray(node.fills)) {
    node.fills.forEach((fill: any) => {
      if (fill.type === 'SOLID' && fill.color) {
        specs.colors.add(rgbToHex(fill.color.r, fill.color.g, fill.color.b));
      }
      if (fill.type === 'GRADIENT_LINEAR' || fill.type === 'GRADIENT_RADIAL' || fill.type === 'GRADIENT_ANGULAR' || fill.type === 'GRADIENT_DIAMOND') {
        specs.gradients.add(fill.type);
      }
    });
  }
  if (node.strokes && Array.isArray(node.strokes)) {
    node.strokes.forEach((stroke: any) => {
      if (stroke.type === 'SOLID' && stroke.color) {
        specs.colors.add(rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b));
      }
    });
    if (node.strokeWeight !== undefined && typeof node.strokeWeight === 'number') {
      specs.strokes.add(node.strokeWeight + 'px');
    }
  }
  if (node.type === 'TEXT') {
    try {
      const fontName = node.fontName;
      const fontSize = node.fontSize;
      if (fontName && typeof fontName !== 'symbol' && typeof fontName === 'object' && 'family' in fontName) {
        const sizeStr = (typeof fontSize === 'number') ? fontSize + 'px' : 'mixed';
        specs.typography.add(fontName.family + ' ' + fontName.style + ' (' + sizeStr + ')');
      }
    } catch (_) {
      // Silently skip mixed/symbol font properties
    }
  }
  if (node.effects && Array.isArray(node.effects)) {
    node.effects.forEach((effect: any) => {
      if (effect.visible) specs.effects.add(effect.type);
    });
  }
  if (node.layoutGrids && Array.isArray(node.layoutGrids)) {
    node.layoutGrids.forEach((grid: any) => {
      if (grid.visible) specs.grids.add(grid.pattern);
    });
  }
  if ('children' in node && node.children) {
    for (const child of node.children) {
      extractSpecs(child, specs);
    }
  }
};
