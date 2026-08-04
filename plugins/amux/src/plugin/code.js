// ============================================================
// AMUX — Auditoria & Maturidade em UX — code.js (main thread / Figma API)
// Bootstrap + dispatch de mensagens. A construção de cada framework
// no canvas vive em canvas/builders/*.js (um arquivo por framework),
// orquestrada por canvas/registry.js — este arquivo não conhece o
// desenho de nenhum framework específico.
// ============================================================

const { analyzeWithFoundry } = require('./ai/foundry-client');
const { buildFrame } = require('./canvas/registry');
const { finalizeFrame } = require('./canvas/finalize');
const { scanFrameworks } = require('./canvas/scan');
const { fillFrameworkFields } = require('./canvas/fill');

const VERSION = typeof __AMUX_VERSION__ !== 'undefined' ? __AMUX_VERSION__ : '1.0.0';
const STORAGE_KEY = 'amux-data';

figma.showUI(__html__, { width: 380, height: 600, title: `AMUX v${VERSION}` });

// ── Init ──────────────────────────────────────────────────────
async function init() {
  let savedState = null;
  try {
    const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
    if (raw && typeof raw._schemaVersion === 'number') savedState = raw;
  } catch (e) {}

  let currentUser = null;
  try { currentUser = { name: figma.currentUser?.name || '', id: figma.currentUser?.id || '' }; } catch (e) {}

  let fileName = '';
  try { fileName = figma.root.name || ''; } catch (e) {}

  figma.ui.postMessage({ type: 'init-plugin', savedState, currentUser, fileName, version: VERSION });
}

init();

// ── Inject Framework on Canvas ────────────────────────────────
// Delega a construção ao builder registrado para framework.id, e o
// epílogo comum (nomear, reagrupar, posicionar, extrair dados) a
// canvas/finalize.js.
async function injectFramework(framework) {
  const fid = framework.id;
  const ts = new Date().toISOString().slice(0, 10);

  for (const font of [
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Medium" },
    { family: "Inter", style: "Bold" }
  ]) {
    try { await figma.loadFontAsync(font); } catch(e) {}
  }

  const mainFrame = buildFrame(fid, ts);
  const instance = await finalizeFrame(mainFrame, framework, ts);

  if (instance) {
    figma.ui.postMessage({ type: 'framework-injected', frameworkId: framework.id, frameName: instance.frameName, instance });
    figma.notify("Framework inserido no canvas! ✓");
  }
}

// ── Message handlers ──────────────────────────────────────────
figma.ui.onmessage = async (msg) => {

  if (msg.type === 'save-state') {
    try { await figma.clientStorage.setAsync(STORAGE_KEY, msg.data); } catch (e) {}
    return;
  }

  if (msg.type === 'inject-framework') {
    try {
      await injectFramework(msg.framework);
    } catch (e) {
      figma.ui.postMessage({ type: 'framework-inject-error', frameworkId: msg.framework?.id, error: String(e && e.message || e) });
    }
    return;
  }

  if (msg.type === 'scan-frameworks') {
    const results = await scanFrameworks(msg.frameworkIds);
    figma.ui.postMessage({ type: 'scan-complete', results });
    return;
  }

  if (msg.type === 'delete-framework-instance') {
    try {
      const node = await figma.getNodeByIdAsync(msg.instanceId);
      if (node && !node.removed) node.remove();
      figma.ui.postMessage({ type: 'framework-deleted', instanceId: msg.instanceId, ok: true });
    } catch (e) {
      figma.ui.postMessage({ type: 'framework-deleted', instanceId: msg.instanceId, ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  if (msg.type === 'fill-framework-fields') {
    try {
      const result = await fillFrameworkFields(msg.instanceId, msg.values || {});
      figma.ui.postMessage({ type: 'fill-framework-result', instanceId: msg.instanceId, values: msg.values || {}, ...result });
    } catch (e) {
      figma.ui.postMessage({ type: 'fill-framework-result', instanceId: msg.instanceId, values: msg.values || {}, ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  if (msg.type === 'focus-framework-instance') {
    try {
      const node = await figma.getNodeByIdAsync(msg.instanceId);
      if (!node || node.removed) {
        figma.ui.postMessage({ type: 'focus-framework-result', ok: false, error: 'not-found' });
        return;
      }
      const page = node.type === 'PAGE' ? node : (function findPage(n) {
        return n.parent && n.parent.type === 'PAGE' ? n.parent : (n.parent ? findPage(n.parent) : null);
      })(node);
      if (page && page.id !== figma.currentPage.id) {
        await figma.setCurrentPageAsync(page);
      }
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      figma.ui.postMessage({ type: 'focus-framework-result', ok: true });
    } catch (e) {
      figma.ui.postMessage({ type: 'focus-framework-result', ok: false, error: String(e && e.message || e) });
    }
    return;
  }

  if (msg.type === 'analyze-with-ai') {
    try {
      const result = await analyzeWithFoundry(msg.payload);
      figma.ui.postMessage({ type: 'ai-analysis-complete', result });
    } catch (e) {
      figma.ui.postMessage({ type: 'ai-analysis-error', error: String(e && e.message || e) });
    }
    return;
  }

  if (msg.type === 'export-data') {
    figma.ui.postMessage({ type: 'export-ready', data: msg.data });
    return;
  }

  if (msg.type === 'resize-ui') {
    figma.ui.resize(msg.width, msg.height);
    return;
  }
};
