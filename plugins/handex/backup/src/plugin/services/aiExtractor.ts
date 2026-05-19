import { extractSpecs } from '../utils/specs';

function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return figma.base64Encode(bytes); // Figma tem API nativa pra isso! Oops, actually figma.base64Encode exists. Wait let's just use it over btoa.
}

export const generateAiContext = async () => {
  const selectedNodes = figma.currentPage.selection;
  
  if (selectedNodes.length === 0) {
    figma.ui.postMessage({ type: 'ai-context-error', message: 'Nenhum frame selecionado.' });
    return;
  }

  try {
    const images: { name: string, base64: string }[] = [];
    let textDump = `=== CONTEXTO DOS ELEMENTOS SELECIONADOS NO FIGMA ===\n\n`;

    for (const node of selectedNodes) {
      textDump += `>> ELEMENTO: ${node.name} (Tipo: ${node.type})\n`;
      
      const specs = { colors: new Set<string>(), gradients: new Set<string>(), typography: new Set<string>(), effects: new Set<string>(), strokes: new Set<string>(), grids: new Set<string>() };
      extractSpecs(node, specs);

      textDump += `  - Cores e Gradientes: ${Array.from(specs.colors).concat(Array.from(specs.gradients)).join(', ') || 'Nenhuma'}\n`;
      textDump += `  - Tipografia: ${Array.from(specs.typography).join(', ') || 'Nenhuma'}\n`;
      textDump += `  - Efeitos e Bordas: ${Array.from(specs.effects).concat(Array.from(specs.strokes)).join(', ') || 'Nenhum'}\n`;
      textDump += `  - Grids de Layout: ${Array.from(specs.grids).join(', ') || 'Nenhum'}\n`;

      const texts: string[] = [];
      const traverseText = (n: any) => {
        if (n.type === 'TEXT' && n.characters) texts.push(n.characters.trim());
        if ('children' in n && n.children) n.children.forEach(traverseText);
      };
      traverseText(node);
      
      if (texts.length > 0) {
        textDump += `  - Textos Contidos na UI:\n    "${texts.filter(t => t.length > 0).join('" | "')}"\n`;
      }
      
      textDump += `\n`;

      try {
        const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
        // Figma nativamente suporta base64Encode nos plugins
        const base64 = figma.base64Encode(bytes);
        images.push({ name: node.name, base64: base64 });
      } catch (e) {
        console.error(`Erro ao exportar PNG do nó ${node.name}`, e);
      }
    }

    figma.ui.postMessage({ type: 'ai-context-ready', textDump, images });
  } catch (error: any) {
    console.error(error);
    figma.ui.postMessage({ type: 'ai-context-error', message: `Erro ao extrair contexto: ${error.message}` });
  }
};
