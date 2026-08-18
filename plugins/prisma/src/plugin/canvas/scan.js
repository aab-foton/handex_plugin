// ============================================================
// canvas/scan.js — Leitura de frames PRISMA no canvas (PRISMA)
// Lê todos os nós TEXT com nome 'field/<id>' de forma recursiva,
// percorrendo TODAS as páginas do arquivo (não só a página atual) —
// um projeto real costuma ter frameworks espalhados por várias
// páginas, e o scan precisa enxergar o projeto inteiro.
// Convenção de nomes do builder:
//   section/<id>  → frame container de um campo
//   field/<id>    → texto editável (fonte de dado extraída)
//   _header / _canvas / _divider → decorativos (ignorados)
// ============================================================

const CANVAS_PREFIX = '[PRISMA]';
const PLUGIN_DATA_NS = 'prisma';

function _scanPage(page, frameworkIds) {
  const candidates = page.findAll(n =>
    n.type === 'FRAME' && n.name.startsWith(CANVAS_PREFIX)
  );

  const results = [];

  for (const frame of candidates) {
    const frameworkId = frame.getSharedPluginData(PLUGIN_DATA_NS, 'frameworkId');
    if (!frameworkId) continue;
    if (frameworkIds && frameworkIds.length > 0 && !frameworkIds.includes(frameworkId)) continue;

    const fieldNodes = frame.findAll(n =>
      n.type === 'TEXT' && n.name.startsWith('field/')
    );

    const data = {};
    let fieldCount = 0;
    for (const node of fieldNodes) {
      const fieldId = node.name.slice('field/'.length);
      const value = node.characters.trim();

      // Texto igual ao placeholder original (canvas/kit.js, tx()) não é
      // dado preenchido pelo usuário — grava como vazio em `data`, para
      // que qualquer consumidor (export, contagem de fieldCount no
      // frontend) trate igual a "não preenchido", sem precisar conhecer
      // a regra de placeholder por conta própria.
      const placeholder = node.getPluginData('prisma_placeholder').trim();
      const isFilled = !!value && value !== placeholder;
      data[fieldId] = isFilled ? value : '';
      if (isFilled) fieldCount++;
    }

    results.push({
      frameworkId,
      frameworkName: frame.getSharedPluginData(PLUGIN_DATA_NS, 'frameworkName') || frameworkId,
      frameName: frame.name,
      instanceId: frame.id,
      pageId: page.id,
      pageName: page.name,
      injectedAt: frame.getSharedPluginData(PLUGIN_DATA_NS, 'injectedAt') || '',
      version: Number(frame.getSharedPluginData(PLUGIN_DATA_NS, 'version')) || 1,
      scannedAt: new Date().toISOString(),
      fieldCount,
      data
    });
  }

  return results;
}

async function scanFrameworks(frameworkIds) {
  const originalPage = figma.currentPage;
  const results = [];

  for (const page of figma.root.children) {
    await figma.setCurrentPageAsync(page);
    results.push(..._scanPage(page, frameworkIds));
  }

  if (figma.currentPage.id !== originalPage.id) {
    await figma.setCurrentPageAsync(originalPage);
  }

  return results;
}

module.exports = { scanFrameworks, _scanPage, CANVAS_PREFIX, PLUGIN_DATA_NS };
