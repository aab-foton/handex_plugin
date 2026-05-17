import { getPages, scanProject } from './services/scanner';
import { exportPages } from './services/exporter';
import { generateAiContext } from './services/aiExtractor';

figma.showUI(__html__, { width: 450, height: 650, themeColors: true });

figma.clientStorage.getAsync('gemini-key').then(key => {
  if (key) {
    figma.ui.postMessage({ type: 'init-gemini-key', key });
  }
});

figma.on('selectionchange', () => {
  const selectedNodes = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'selection-changed', count: selectedNodes.length });
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'get-pages') {
    getPages();
  }

  if (msg.type === 'scan-project') {
    await scanProject(msg.selectedPageIds);
  }

  if (msg.type === 'export-pages') {
    await exportPages(msg.format, msg.selectedPageIds);
  }

  if (msg.type === 'generate-ai-context') {
    await generateAiContext();
  }

  if (msg.type === 'save-gemini-key') {
    await figma.clientStorage.setAsync('gemini-key', msg.key);
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};
