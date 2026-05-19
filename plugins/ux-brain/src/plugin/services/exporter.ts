export const exportPages = async (format: string, selectedPageIds: string[]) => {
  figma.ui.postMessage({ type: 'log', message: `Iniciando exportação em ${format}...` });
  
  const exportData: any[] = [];
  const selectedPages = figma.root.children.filter(node => 
    node && node.type === 'PAGE' && selectedPageIds.includes(node.id)
  ) as PageNode[];
  
  for (const page of selectedPages) {
    const nodesToExport: SceneNode[] = [];
    
    for (const node of page.children) {
      if (!node) continue;
      if (node.type === 'SECTION') {
        nodesToExport.push(node);
        if ('children' in node && node.children) {
          for (const child of node.children) {
            if (child && (child.type === 'FRAME' || child.type === 'GROUP')) {
              nodesToExport.push(child as SceneNode);
            }
          }
        }
      } else if (node.type === 'FRAME' || node.type === 'GROUP') {
        nodesToExport.push(node);
      }
    }
    
    for (let i = 0; i < nodesToExport.length; i++) {
      const node = nodesToExport[i];
      try {
        figma.ui.postMessage({ type: 'log', message: `Exportando ${node.name}...` });
        
        const exportSettings: ExportSettings = format === 'PNG' 
          ? { format: 'PNG', constraint: { type: 'SCALE', value: 1 } } 
          : { format: 'PDF' };
          
        const bytes = await node.exportAsync(exportSettings);
        const safeName = node.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        exportData.push({
          name: `${safeName}.${format.toLowerCase()}`,
          bytes: bytes
        });
      } catch (e) {
        console.error("Erro ao exportar nó " + node.name, e);
      }
    }
  }

  figma.ui.postMessage({ type: 'export-complete', exportData, format });
};
