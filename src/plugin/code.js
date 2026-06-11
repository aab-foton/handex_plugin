import { auditProperty, AUDIT_SCORE, AUDIT_THRESHOLDS, frameJsonTemplate, suggestClosestMatch } from './audit.js';

figma.showUI(__html__, { width: 480, height: 750 });

let activeHighlightNode = null;

function _nodeOnCurrentPage(node) {
  let n = node;
  while (n && n.type !== 'PAGE') n = n.parent;
  return n != null && n.id === figma.currentPage.id;
}


function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0.5, g: 0.5, b: 0.5 };
}

function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// ============================================================
// Design refs extraction (token-free)
// Walks the bundled skeleton and resolves real values via Plugin
// API. Posts progress events to the UI as it goes.
// ============================================================
// Em desenvolvimento (sem bundle), cai no fallback 'dev'.
/* global __HANDEX_VERSION__ */
const PLUGIN_VERSION = (typeof __HANDEX_VERSION__ !== 'undefined') ? __HANDEX_VERSION__ : 'dev';

// â”€â”€ Shared Plugin Data (MCP / REST API readable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Usa setSharedPluginData (namespace 'handex') para que agentes externos
// (MCP, REST API) consigam ler o contexto de negócio embutido nos nodes.
// setPluginData seria sandboxed ao plugin ID — inacessível externamente.
function _writeSharedPluginData(data) {
  const NS = 'handex';
  try {
    // Contexto do projeto na página atual
    const project = {
      titulo:    data.step1?.titulo   || '',
      versao:    data.step1?.versao   || '',
      objetivo:  data.step1?.objetivo || '',
      status:    data.step1?.status   || 'rascunho',
      equipe:    data.step1?.equipe   || [],
      briefing:  (data.step2?.briefingQuestions || []).map(q => ({
        categoria: q.category || '',
        pergunta:  q.question || '',
        resposta:  q.answer   || ''
      })),
      regras: (data.step2?.regras || []).map(r => ({
        titulo: r.titulo || '',
        notas:  r.notas  || '',
        link:   r.link   || ''
      })),
      updatedAt: new Date().toISOString(),
      plugin: `handex@${PLUGIN_VERSION}`
    };
    figma.currentPage.setSharedPluginData(NS, 'project', JSON.stringify(project));
  } catch (e) {
    console.warn('[handex] setSharedPluginData(project) failed:', e);
  }

  // Contexto por frame — getNodeById é O(1), não percorre a árvore
  (data.frames || []).forEach(frame => {
    try {
      const node = figma.getNodeById(frame.figmaId);
      if (!node) return;
      node.setSharedPluginData(NS, 'context', JSON.stringify({
        nome:           frame.nome           || '',
        isNewComponent: frame.isNewComponent || false,
        excecoes: (frame.excecoes || []).map(e => ({
          tipo:   e.tipo   || '',
          titulo: e.titulo || '',
          notas:  e.notas  || '',
          link:   e.link   || ''
        }))
      }));
    } catch (e) {
      // Node pode ter sido deletado — ignorar silenciosamente
    }
  });
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'ui-ready') {
    const currentUser = figma.currentUser
      ? { id: figma.currentUser.id, name: figma.currentUser.name, photoUrl: figma.currentUser.photoUrl }
      : null;
    const theme = figma.ui.theme || 'light';
    const sel = figma.currentPage.selection;
    const projectName = figma.root.name || figma.currentPage.name || '';
    try {
      const savedState = await figma.clientStorage.getAsync('handoffData');
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        projectName,
        savedState: savedState || null
      });
    } catch (err) {
      console.error("Initialization error (continuing without saved state):", err);
      figma.ui.postMessage({
        type: 'init-plugin',
        version: PLUGIN_VERSION,
        currentUser,
        theme,
        projectName,
        savedState: null
      });
    }
    return;
  }

  if (msg.type === 'get-project-name') {
    figma.ui.postMessage({ type: 'project-name', name: figma.root.name || figma.currentPage.name || '' });
    return;
  }

  if (msg.type === 'refresh-spec-card') {
    const grpNode = figma.getNodeById(msg.nodeId);
    if (!grpNode) { figma.ui.postMessage({ type: 'toast', message: 'Card não encontrado no canvas.', kind: 'error' }); return; }
    // Find the spec card frame inside the group (name ends with /Ficha)
    const children = grpNode.type === 'GROUP' ? grpNode.children : [grpNode];
    const cardFrame = children.find(n => n.name && n.name.endsWith('/Ficha'));
    if (!cardFrame || cardFrame.type !== 'FRAME') { figma.ui.postMessage({ type: 'toast', message: 'Card não encontrado no grupo.', kind: 'error' }); return; }
    // Remove existing exception frame if any (named /Exceções)
    const existing = cardFrame.children.find(n => n.name === '[Spec] Exceções');
    if (existing) existing.remove();
    if (msg.excecoes && msg.excecoes.length > 0) {
      (async () => {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const excFrame = figma.createFrame();
        excFrame.name = '[Spec] Exceções';
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 4;
        excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
        excTitle.characters = `CENÁRIOS (${msg.excecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        msg.excecoes.forEach(exc => {
          const t = figma.createText();
          t.fontName = { family: "Inter", style: "Regular" };
          t.fontSize = 10;
          t.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
          t.characters = `[${exc.tipo || 'Geral'}] ${exc.titulo || ''}`;
          t.textAutoResize = "WIDTH_AND_HEIGHT";
          excFrame.appendChild(t);
        });
        cardFrame.appendChild(excFrame);
        figma.ui.postMessage({ type: 'toast', message: 'Card atualizado com os cenários.', kind: 'success' });
      })();
    } else {
      figma.ui.postMessage({ type: 'toast', message: 'Card atualizado.', kind: 'success' });
    }
    return;
  }

  if (msg.type === 'inject-exception-to-spec-canvas') {
    (async () => {
      const exc = msg.exc || {};
      const sel = figma.currentPage.selection;
      if (!sel || sel.length === 0) {
        figma.notify('Selecione um card de especificação no canvas.');
        return;
      }
      const node = sel[0];
      let cardFrame = null;
      if (node.name && node.name.endsWith('/Ficha') && node.type === 'FRAME') {
        cardFrame = node;
      } else if ((node.type === 'GROUP' || node.type === 'FRAME') && node.children) {
        cardFrame = node.children.find(n => n.name && n.name.endsWith('/Ficha'));
      }
      if (!cardFrame && node.parent && (node.parent.type === 'GROUP' || node.parent.type === 'FRAME')) {
        cardFrame = node.parent.children.find(n => n.name && n.name.endsWith('/Ficha'));
      }
      if (!cardFrame) {
        figma.notify('Card de especificação não encontrado. Selecione o card no canvas.');
        return;
      }
      await figma.loadFontAsync({ family: "Inter", style: "Bold" });
      await figma.loadFontAsync({ family: "Inter", style: "Regular" });
      let excFrame = cardFrame.children.find(n => n.name === '[Spec] Exceções');
      if (!excFrame) {
        excFrame = figma.createFrame();
        excFrame.name = '[Spec] Exceções';
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 4;
        excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
        excFrame.paddingLeft = 8; excFrame.paddingRight = 8;
        excFrame.paddingTop = 6; excFrame.paddingBottom = 6;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const hdr = figma.createText();
        hdr.fontName = { family: "Inter", style: "Bold" };
        hdr.fontSize = 9;
        hdr.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
        hdr.characters = 'CENÁRIOS (0)';
        hdr.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(hdr);
        cardFrame.appendChild(excFrame);
      }
      const existingCount = excFrame.children.length - 1;
      const newCount = existingCount + 1;
      const hdrNode = excFrame.children[0];
      if (hdrNode && hdrNode.type === 'TEXT') {
        hdrNode.characters = `CENÁRIOS (${newCount})`;
      }
      const _excTypeRgb = {
        'Erro':        { r: 0.80, g: 0.15, b: 0.15 },
        'Alerta':      { r: 0.80, g: 0.50, b: 0.00 },
        'Sucesso':     { r: 0.10, g: 0.55, b: 0.25 },
        'Confirmação': { r: 0.05, g: 0.35, b: 0.80 },
      };
      const excRow = figma.createFrame();
      excRow.layoutMode = "HORIZONTAL";
      excRow.itemSpacing = 6;
      excRow.fills = [];
      excRow.primaryAxisSizingMode = "AUTO";
      excRow.counterAxisSizingMode = "AUTO";
      excRow.counterAxisAlignItems = "CENTER";
      const typeColor = _excTypeRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 };
      const typeLabel = figma.createText();
      typeLabel.fontName = { family: "Inter", style: "Bold" };
      typeLabel.fontSize = 9;
      typeLabel.fills = [{ type: "SOLID", color: typeColor }];
      typeLabel.characters = (exc.tipo || 'GERAL').toUpperCase();
      typeLabel.textAutoResize = "WIDTH_AND_HEIGHT";
      const titleLabel = figma.createText();
      titleLabel.fontName = { family: "Inter", style: "Regular" };
      titleLabel.fontSize = 10;
      titleLabel.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
      titleLabel.characters = `${exc.titulo || ''}${exc.obs ? ' — ' + exc.obs : ''}`;
      titleLabel.textAutoResize = "WIDTH_AND_HEIGHT";
      excRow.appendChild(typeLabel);
      excRow.appendChild(titleLabel);
      excFrame.appendChild(excRow);
      figma.ui.postMessage({ type: 'toast', message: 'Cenário injetado no card de spec.', kind: 'success' });
    })();
    return;
  }

  if (msg.type === 'get-context-name') {
    const sel = figma.currentPage.selection;
    const name = sel.length > 0 ? sel[0].name : '';
    figma.ui.postMessage({ type: 'context-name', name });
    return;
  }

  if (msg.type === 'get-selection-info') {
    const validTypes = ['FRAME', 'COMPONENT', 'INSTANCE', 'SECTION', 'GROUP'];
    const selection = figma.currentPage.selection.filter(n => validTypes.includes(n.type));
    if (selection.length > 0) {
      figma.ui.postMessage({
        type: 'selection-info',
        nodes: selection.map(n => ({ nodeId: n.id, name: n.name }))
      });
    } else {
      figma.ui.postMessage({
        type: 'selection-info',
        nodes: [],
        error: 'Nenhum frame selecionado no canvas.'
      });
    }
    return;
  }
  if (msg.type === "resize") {
    figma.ui.resize(msg.width, msg.height);
    return;
  }

  if (msg.type === 'clear-cache') {
    const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
    const keys = [
      'handoffData',
      'handex-audit-refs-v1',
      'handex-scan-cache-v1',
      'handex-history-' + fileKey,
    ];
    try {
      await Promise.all(keys.map(k => figma.clientStorage.setAsync(k, null)));
      // Limpa também os sharedPluginData da página atual
      try { figma.currentPage.setSharedPluginData('handex', 'project', ''); } catch (e) {}
      figma.ui.postMessage({ type: 'cache-cleared' });
    } catch (e) {
      console.error("clear-cache failed:", e);
      figma.notify('Erro ao limpar cache', { error: true });
    }
    return;
  }

  if (msg.type === 'scan-cache-save') {
    figma.clientStorage.setAsync('handex-scan-cache-v1', msg.data).catch(e =>
      console.warn("scan-cache-save failed:", e)
    );
    return;
  }

  if (msg.type === 'scan-cache-load') {
    try {
      const cached = await figma.clientStorage.getAsync('handex-scan-cache-v1');
      figma.ui.postMessage({ type: 'scan-cache-loaded', data: cached || null });
    } catch (e) {
      figma.ui.postMessage({ type: 'scan-cache-loaded', data: null });
    }
    return;
  }

  // â”€â”€â”€ Handoff snapshots / history (for diff between versions) â”€â”€â”€â”€â”€â”€â”€â”€
  if (msg.type === "snapshot-load") {
    try {
      const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
      const key = "handex-history-" + fileKey;
      const history = await figma.clientStorage.getAsync(key);
      figma.ui.postMessage({ type: "snapshot-history", history: Array.isArray(history) ? history : [] });
    } catch (e) {
      figma.ui.postMessage({ type: "snapshot-history", history: [] });
    }
    return;
  }

  if (msg.type === "snapshot-save") {
    try {
      const fileKey = (figma.root && figma.root.id) ? figma.root.id : "default";
      const key = "handex-history-" + fileKey;
      const existing = (await figma.clientStorage.getAsync(key)) || [];
      const next = [msg.snapshot].concat(Array.isArray(existing) ? existing : []).slice(0, 5);
      await figma.clientStorage.setAsync(key, next);
    } catch (e) {
      console.error("snapshot-save failed:", e);
    }
    return;
  }

  if (msg.type === "create-handoff") {
    try {
      // Carrega as fontes antes de escrever e ignora erros caso alguma nao exista
      const fonts = [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Medium" },
        { family: "Inter", style: "SemiBold" },
        { family: "Inter", style: "Semi Bold" },
        { family: "Inter", style: "Bold" }
      ];
      for (const font of fonts) {
        try {
          await figma.loadFontAsync(font);
        } catch (e) {
          console.log("Font not loaded:", font);
        }
      }

      const data = msg.data;

      // Helpers
      function createText(text, size = 14, weight = "Regular", color = { r: 0.12, g: 0.16, b: 0.23 }) {
        const t = figma.createText();
        t.fontName = { family: "Inter", style: weight };
        t.characters = String(text || "");
        t.fontSize = size;
        t.fills = [{ type: "SOLID", color }];
        return t;
      }

      function createFrame(direction = "VERTICAL", padding = 0, spacing = 0, fill = null) {
        const f = figma.createFrame();
        f.layoutMode = direction;
        f.paddingLeft = padding;
        f.paddingRight = padding;
        f.paddingTop = padding;
        f.paddingBottom = padding;
        f.itemSpacing = spacing;
        
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "AUTO";
        f.layoutAlign = "INHERIT";

        if (fill) {
          f.fills = [{ type: "SOLID", color: fill }];
        } else {
          f.fills = [];
        }
        return f;
      }

      function setFillAndHug(node) {
        if (!node) return;
        
        try {
          if ('layoutSizingHorizontal' in node) {
            node.layoutSizingHorizontal = "FILL";
          }
          if ('layoutSizingVertical' in node) {
            node.layoutSizingVertical = "HUG";
          }
        } catch(e) {}

        const parent = node.parent;
        const pMode = (parent && 'layoutMode' in parent) ? parent.layoutMode : "VERTICAL";

        if (pMode === "VERTICAL") {
          node.layoutAlign = "STRETCH"; // Fill width
          if (node.type === "FRAME") {
            if (node.layoutMode === "VERTICAL") node.primaryAxisSizingMode = "AUTO"; // Hug height
            else node.counterAxisSizingMode = "AUTO"; // Hug height
          } else if (node.type === "TEXT") {
            node.textAutoResize = "HEIGHT"; // Fill width, hug height
          }
        } else if (pMode === "HORIZONTAL") {
          node.layoutGrow = 1; // Fill width
          node.layoutAlign = "INHERIT"; // Hug height (don't stretch)
          if (node.type === "FRAME") {
            if (node.layoutMode === "HORIZONTAL") node.counterAxisSizingMode = "AUTO"; // Hug height
            else node.primaryAxisSizingMode = "AUTO"; // Hug height
          } else if (node.type === "TEXT") {
            node.textAutoResize = "HEIGHT"; // Hug height, width controlled by layoutGrow
          }
        }
      }

      function getIconSvg(type) {
        const icons = {
          color: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 0-18c4.97 0 9 3.582 9 8 0 1.035-.84 1.875-1.875 1.875H16.5c-1.035 0-1.875.84-1.875 1.875v.375c0 1.035.84 1.875 1.875 1.875H18a3 3 0 0 0 3-3"/></svg>',
          typography: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
          spacing: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M10 12h12"/><path d="m19 15 3-3-3-3"/></svg>',
          radius: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m14 18-4-4 4-4"/><path d="M20 14c-4.4 0-8-3.6-8-8"/></svg>',
          layout: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
          variant: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>',
          effect: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
          stroke: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>'
        };
        return icons[type] || icons['layout'];
      }


      function createSection(parent, titleText) {
        const section = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
        section.name = `[Seção] ${titleText}`;
        if (parent) {
          parent.appendChild(section);
          setFillAndHug(section);
        }
        section.cornerRadius = 8;
        section.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        section.strokeWeight = 1;

        const title = createText(titleText, 16, "Bold", { r: 0, g: 0.35, b: 0.79 });
        section.appendChild(title);
        setFillAndHug(title);
        return section;
      }

      function createRow(parent, label, value, isLink = false, url = "") {
        const row = createFrame("VERTICAL", 0, 4);
        row.name = `[Campo] ${label}`;
        if (parent) {
           parent.appendChild(row);
           setFillAndHug(row);
        }
        
        const lbl = createText(label, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
        row.appendChild(lbl);
        setFillAndHug(lbl);

        const val = createText(value || "-", 14, "Regular", isLink ? { r: 0, g: 0.35, b: 0.79 } : { r: 0.12, g: 0.16, b: 0.23 });
        row.appendChild(val);
        setFillAndHug(val);

        if (isLink && value) {
          val.textDecoration = "UNDERLINE";
          if (url && typeof url === "string") {
            try {
              val.hyperlink = { type: "URL", value: url.startsWith("http") ? url : "https://" + url };
            } catch (e) { }
          }
        }
        return row;
      }



      // Semantic name prefix for all handoff canvas nodes
      const _titulo = (data.step1?.titulo || 'Projeto').replace(/\//g, '-');
      const _handoffBase = `Handex | Ficha de Projeto | ${_titulo}`;

      // Nome sempre inclui data (primeira versão ou atualização)
      const _isUpdate = false;
      const _now = new Date();
      const _ts = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')} ${String(_now.getHours()).padStart(2,'0')}:${String(_now.getMinutes()).padStart(2,'0')}`;
      const _containerName = `${_handoffBase} | ${_ts}`;

      // MAIN CONTAINER
      const mainContainer = createFrame("HORIZONTAL", 64, 48, hexToRgb("#026173"));
      mainContainer.name = _containerName;
      mainContainer.counterAxisAlignItems = "MIN"; // Top align
      mainContainer.primaryAxisSizingMode = "AUTO"; // Hug children width
      mainContainer.counterAxisSizingMode = "AUTO"; // Hug children height

      // 1. FICHA TÉCNICA
      const fichaTecnica = createFrame("VERTICAL", 0, 0, { r: 1, g: 1, b: 1 });
      fichaTecnica.name = `${_handoffBase} | ${_ts} / Ficha de Projeto`;
      fichaTecnica.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
      fichaTecnica.resize(480, 100);
      fichaTecnica.counterAxisSizingMode = "FIXED"; // Base width 480
      fichaTecnica.primaryAxisSizingMode = "AUTO";  // Hug height

      // HEADER (CAIXA)
      const header = createFrame("HORIZONTAL", 24, 16, { r: 1, g: 1, b: 1 });
      fichaTecnica.appendChild(header);
      setFillAndHug(header);
      
      header.counterAxisAlignItems = "CENTER";
      header.primaryAxisAlignItems = "SPACE_BETWEEN";
      header.paddingTop = 20;
      header.paddingBottom = 20;

      const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631">
        <g transform="translate(-284.78446,-475.51214)">
          <g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)">
            <g transform="scale(0.24,0.24)">
              <path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
              <path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none" />
            </g>
          </g>
        </g>
      </svg>`;
      const logoWrapper = figma.createNodeFromSvg(logoSvg);
      logoWrapper.name = "CAIXA Logo";
      const ratio = 205.51 / 46.55;
      logoWrapper.resize(32 * ratio, 32);

      const headerTitle = createText("Handex - Handoff Expresso", 14, "Medium", { r: 0.39, g: 0.45, b: 0.55 });
      header.appendChild(logoWrapper);
      header.appendChild(headerTitle);
      fichaTecnica.appendChild(header);

      // CONTENT WRAPPER
      const content = createFrame("VERTICAL", 24, 24, { r: 1, g: 1, b: 1 });
      fichaTecnica.appendChild(content);
      setFillAndHug(content);

      // 1.1 INFORMAÇÕES BÁSICAS
      if (!data.setup || data.setup.ficha !== false) {
        const infoSection = createSection(content, "Informações Básicas");
        createRow(infoSection, "Título do Projeto", data.step1.titulo);
        if (data.step1.jornada) createRow(infoSection, "Jornada", data.step1.jornada);
        if (data.step1.feature) createRow(infoSection, "Feature", data.step1.feature);
        createRow(infoSection, "Objetivo da Entrega", data.step1.objetivo);

        const subGrid = createFrame("HORIZONTAL", 0, 16);
        infoSection.appendChild(subGrid);
        setFillAndHug(subGrid);

        // Status chip com semântica de cor
        {
          const _statusMap = {
            'rascunho':       { label: 'Rascunho',        bg: { r: 0.94, g: 0.95, b: 0.96 }, text: { r: 0.42, g: 0.47, b: 0.55 } },
            'em-revisao':     { label: 'Em Revisão',      bg: { r: 1,    g: 0.96, b: 0.84 }, text: { r: 0.72, g: 0.45, b: 0.00 } },
            'pronto-para-dev':{ label: 'Pronto para Dev', bg: { r: 0.86, g: 0.93, b: 1.00 }, text: { r: 0.00, g: 0.35, b: 0.79 } },
            'finalizado':     { label: 'Finalizado',      bg: { r: 0.86, g: 0.97, b: 0.88 }, text: { r: 0.07, g: 0.53, b: 0.18 } },
          };
          const _sc = _statusMap[data.step1.status] || _statusMap['rascunho'];
          const statusCol = createFrame("VERTICAL", 0, 4);
          statusCol.name = '[Campo] Status';
          subGrid.appendChild(statusCol);
          setFillAndHug(statusCol);
          statusCol.appendChild(createText('Status', 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 }));
          const chip = createFrame("HORIZONTAL", 8, 4, _sc.bg);
          chip.cornerRadius = 999;
          chip.primaryAxisSizingMode = "AUTO";
          chip.counterAxisSizingMode = "AUTO";
          chip.counterAxisAlignItems = "CENTER";
          chip.appendChild(createText(_sc.label, 11, "Bold", _sc.text));
          statusCol.appendChild(chip);
        }
        createRow(subGrid, "Versão", data.step1.versao);
      }

      // 1.2 EQUIPE E RESPONSÁVEIS
      if (data.step1.equipe && data.step1.equipe.length > 0) {
        const teamSection = createSection(content, "Equipe e Responsáveis");
        data.step1.equipe.forEach(m => {
          const mRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
          teamSection.appendChild(mRow);
          setFillAndHug(mRow);
          mRow.counterAxisAlignItems = "CENTER";
          mRow.cornerRadius = 8;
          mRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const roleTag = createFrame("HORIZONTAL", 8, 3, { r: 0.93, g: 0.96, b: 1.0 });
          roleTag.cornerRadius = 999;
          roleTag.strokes = [{ type: "SOLID", color: { r: 0.70, g: 0.82, b: 0.96 } }];
          roleTag.strokeWeight = 1;
          roleTag.appendChild(createText(m.papel || 'Membro', 9, "Medium", { r: 0, g: 0.35, b: 0.79 }));
          mRow.appendChild(roleTag);

          const nameText = createText(m.nome || '', 12, "Medium");
          nameText.layoutGrow = 1;
          mRow.appendChild(nameText);

          if (m.email) {
            const contactLink = createText("Contato", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
            contactLink.textDecoration = "UNDERLINE";
            contactLink.hyperlink = { type: "URL", value: "mailto:" + m.email };
            mRow.appendChild(contactLink);
          }
        });
      }

      // 1.3 BRIEFING ESTRATÉGICO — coletado aqui, mas gerado no card2 separado
      const _briefingQs = (data.step2 && data.step2.briefingQuestions)
        ? data.step2.briefingQuestions.filter(q => q.answer && q.answer.trim())
        : [];

      // 1.4 REGRAS DE NEGÓCIO E HUs
      const _regras = (data.step2 && data.step2.regras) ? data.step2.regras : [];
      if (_regras.length > 0) {
        const rulesSection = createSection(content, "Regras de Negócio e HUs");
        _regras.forEach(r => {
          const rRow = createFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.98, b: 0.99 });
          rulesSection.appendChild(rRow);
          setFillAndHug(rRow);
          rRow.cornerRadius = 8;
          rRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const rTitle = createText(r.titulo || '', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          rRow.appendChild(rTitle);
          setFillAndHug(rTitle);

          if (r.link && r.link !== "#") {
            const lText = createText("Acesse o link da HU", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
            lText.textDecoration = "UNDERLINE";
            lText.hyperlink = { type: "URL", value: r.link };
            rRow.appendChild(lText);
            setFillAndHug(lText);
          }
          if (r.notas) {
            const nText = createText(r.notas, 12, "Regular", { r: 0.4, g: 0.4, b: 0.4 });
            rRow.appendChild(nText);
            setFillAndHug(nText);
          }
        });
        content.appendChild(rulesSection);
        setFillAndHug(rulesSection);
      }

      // 1.5 CENÁRIOS DE EXCEÇÃO (agregados de todos os frames)
      const _allExcecoes = (data.frames || []).flatMap(f =>
        (f.excecoes || []).map(e => ({ ...e, _frame: f.nome }))
      );
      if (_allExcecoes.length > 0) {
        const excSection = createSection(content, "Cenários de Exceção");
        _allExcecoes.forEach(e => {
          const eRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
          excSection.appendChild(eRow);
          setFillAndHug(eRow);
          eRow.counterAxisAlignItems = "CENTER";
          eRow.cornerRadius = 8;
          eRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const typeTag = createFrame("HORIZONTAL", 8, 4, { r: 0.9, g: 0.2, b: 0.2 });
          typeTag.cornerRadius = 4;
          typeTag.appendChild(createText(e.tipo || '', 10, "Bold", { r: 1, g: 1, b: 1 }));
          eRow.appendChild(typeTag);

          const titleText = createText(`${e.titulo || ''}${e._frame ? ' (' + e._frame + ')' : ''}`, 12, "Medium");
          titleText.layoutGrow = 1;
          eRow.appendChild(titleText);

          if (e.anchor && e.anchor !== "#") {
            titleText.textDecoration = "UNDERLINE";
            titleText.hyperlink = { type: "URL", value: e.anchor };
          }
        });
        content.appendChild(excSection);
        setFillAndHug(excSection);
      }


      // 1.6 DOCS E ANEXOS
      if (data.docs) {
        const docItems = [
          { key: "proto", label: "Protótipo Navegável" },
          { key: "a11y", label: "Handoff Acessibilidade" },
          { key: "research", label: "Pesquisa de UX" }
        ];
        const validDocItems = docItems.filter(item => data.docs[item.key] && data.docs[item.key].link);
        if (validDocItems.length > 0) {
          const docsSection = createSection(content, "Docs e Anexos");
          validDocItems.forEach(item => {
            const docData = data.docs[item.key];
            const dRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
            dRow.layoutAlign = "STRETCH";
            dRow.counterAxisAlignItems = "CENTER";
            dRow.cornerRadius = 8;
            dRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

            const dLabel = createText(item.label, 12, "Bold");
            dLabel.layoutGrow = 1;
            dRow.appendChild(dLabel);

            const dLink = createText("Acesse o link", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
            dLink.textDecoration = "UNDERLINE";
            dLink.hyperlink = { type: "URL", value: docData.link };
            dRow.appendChild(dLink);

            docsSection.appendChild(dRow);
          });
          setFillAndHug(docsSection);
        }
      }

      // 1.6b ESPECIFICAÇÕES VISUAIS (specs globais)
      const _globalSpecs = (data.specs || []).filter(s => s.visible !== false);
      if (_globalSpecs.length > 0) {
        const SPEC_CARD_W = 240;

        // Build a single spec card with fixed width + hug height
        function buildSpecCard(s) {
          const tc = s.color
            ? { r: parseInt(s.color.slice(1,3),16)/255, g: parseInt(s.color.slice(3,5),16)/255, b: parseInt(s.color.slice(5,7),16)/255 }
            : themeColor;

          const card = figma.createFrame();
          card.name = `[Spec/${s.letter || 'A'}] ${s.name || ''}`;
          card.layoutMode = "VERTICAL";
          card.itemSpacing = 4;
          card.paddingLeft = 10; card.paddingRight = 10;
          card.paddingTop = 8; card.paddingBottom = 8;
          card.cornerRadius = 8;
          card.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 1 } }];
          card.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.92, b: 0.96 } }];
          card.primaryAxisSizingMode = "AUTO";    // hug height
          card.counterAxisSizingMode = "FIXED";   // fixed width → text wraps
          card.resize(SPEC_CARD_W, 10);

          // Header: badge + name
          const sHeader = figma.createFrame();
          sHeader.layoutMode = "HORIZONTAL";
          sHeader.itemSpacing = 8;
          sHeader.fills = [];
          sHeader.counterAxisAlignItems = "CENTER";
          sHeader.primaryAxisSizingMode = "FIXED";
          sHeader.counterAxisSizingMode = "AUTO";
          sHeader.layoutAlign = "STRETCH";
          card.appendChild(sHeader);

          const badge = figma.createFrame();
          badge.layoutMode = "HORIZONTAL";
          badge.resize(20, 20);
          badge.cornerRadius = 4;
          badge.fills = [{ type: "SOLID", color: tc }];
          badge.primaryAxisAlignItems = "CENTER"; badge.counterAxisAlignItems = "CENTER";
          const badgeT = figma.createText();
          badgeT.fontName = { family: "Inter", style: "Bold" }; badgeT.fontSize = 9;
          badgeT.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
          badgeT.characters = s.letter || 'A'; badgeT.textAutoResize = "WIDTH_AND_HEIGHT";
          badge.appendChild(badgeT);
          sHeader.appendChild(badge);

          const sName = figma.createText();
          sName.fontName = { family: "Inter", style: "Bold" }; sName.fontSize = 11;
          sName.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.16, b: 0.23 } }];
          sName.characters = s.name || '';
          sName.textAutoResize = "HEIGHT";  // wrap within fixed card width
          sName.layoutGrow = 1;
          sHeader.appendChild(sName);

          if (s.note) {
            const sNote = figma.createText();
            sNote.fontName = { family: "Inter", style: "Regular" }; sNote.fontSize = 10;
            sNote.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
            sNote.characters = s.note;
            sNote.textAutoResize = "HEIGHT";
            sNote.layoutAlign = "STRETCH";
            card.appendChild(sNote);
          }

          // Link
          if (s.link) {
            const lText = figma.createText();
            lText.fontName = { family: "Inter", style: "Regular" }; lText.fontSize = 9;
            lText.fills = [{ type: "SOLID", color: { r: 0, g: 0.35, b: 0.79 } }];
            lText.characters = s.link;
            lText.textDecoration = "UNDERLINE";
            lText.hyperlink = { type: "URL", value: s.link };
            lText.textAutoResize = "HEIGHT";  // wrap long URLs
            lText.layoutAlign = "STRETCH";
            card.appendChild(lText);
          }

          // Exceptions
          const sExcs = s.excecoes || [];
          if (sExcs.length > 0) {
            const _excRgb = { 'Erro': { r: 0.80, g: 0.15, b: 0.15 }, 'Alerta': { r: 0.80, g: 0.50, b: 0.00 }, 'Sucesso': { r: 0.10, g: 0.55, b: 0.25 }, 'Confirmação': { r: 0.05, g: 0.35, b: 0.80 } };
            sExcs.forEach(exc => {
              const eRow = figma.createFrame();
              eRow.layoutMode = "HORIZONTAL"; eRow.itemSpacing = 6; eRow.fills = [];
              eRow.primaryAxisSizingMode = "FIXED"; eRow.counterAxisSizingMode = "AUTO";
              eRow.layoutAlign = "STRETCH";
              eRow.counterAxisAlignItems = "CENTER";
              card.appendChild(eRow);
              const eType = figma.createText();
              eType.fontName = { family: "Inter", style: "Bold" }; eType.fontSize = 9;
              eType.fills = [{ type: "SOLID", color: _excRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 } }];
              eType.characters = (exc.tipo || 'GERAL').toUpperCase(); eType.textAutoResize = "WIDTH_AND_HEIGHT";
              const eTitle = figma.createText();
              eTitle.fontName = { family: "Inter", style: "Regular" }; eTitle.fontSize = 10;
              eTitle.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
              eTitle.characters = exc.titulo || '';
              eTitle.textAutoResize = "HEIGHT";
              eTitle.layoutGrow = 1;
              eRow.appendChild(eType); eRow.appendChild(eTitle);
            });
          }

          return card;
        }

        // Group specs by tag
        const _specsByTag = {};
        _globalSpecs.forEach(s => {
          const tag = s.categoryLabel || s.category || 'Geral';
          if (!_specsByTag[tag]) _specsByTag[tag] = [];
          _specsByTag[tag].push(s);
        });

        const specsSection = createSection(content, "Especificações Visuais");

        // Outer row: different tags side by side
        const specsTagRow = figma.createFrame();
        specsTagRow.name = '[Row] Especificações por Tag';
        specsTagRow.layoutMode = "HORIZONTAL";
        specsTagRow.layoutWrap = "WRAP";
        specsTagRow.itemSpacing = 16;
        specsTagRow.counterAxisSpacing = 16;
        specsTagRow.fills = [];
        specsTagRow.primaryAxisSizingMode = "AUTO";
        specsTagRow.counterAxisSizingMode = "AUTO";
        specsTagRow.counterAxisAlignItems = "MIN";
        specsSection.appendChild(specsTagRow);
        setFillAndHug(specsTagRow);

        Object.entries(_specsByTag).forEach(([tag, tagSpecs]) => {
          if (tagSpecs.length === 1) {
            // Single spec: no group wrapper
            specsTagRow.appendChild(buildSpecCard(tagSpecs[0]));
          } else {
            // 2+ specs with same tag: vertical group
            const group = figma.createFrame();
            group.name = `[Specs/${tag}] Especificações Visuais`;
            group.layoutMode = "VERTICAL";
            group.itemSpacing = 8;
            group.fills = [];
            group.primaryAxisSizingMode = "AUTO";
            group.counterAxisSizingMode = "AUTO";
            group.counterAxisAlignItems = "MIN";
            tagSpecs.forEach(s => group.appendChild(buildSpecCard(s)));
            specsTagRow.appendChild(group);
            setFillAndHug(group);
          }
        });

        content.appendChild(specsSection);
        setFillAndHug(specsSection);
      }

      // 1.7 FRAMES DOCUMENTADOS
      const _frames = data.frames || [];
      if (_frames.length > 0) {
        const framesSection = createSection(content, "Frames Documentados");
        _frames.forEach((f, fi) => {
          const fRow = createFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.99, b: 1 });
          fRow.name = `[Frame] ${f.nome || 'Frame ' + (fi + 1)}`;
          fRow.cornerRadius = 8;
          fRow.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.92, b: 0.96 } }];
          framesSection.appendChild(fRow);
          setFillAndHug(fRow);

          // Nome + badge novo componente
          const fHeader = createFrame("HORIZONTAL", 0, 8);
          fHeader.counterAxisAlignItems = "CENTER";
          fRow.appendChild(fHeader);
          setFillAndHug(fHeader);
          const fName = createText(f.nome || 'Frame', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          fName.layoutGrow = 1;
          fHeader.appendChild(fName);
          if (f.isNewComponent) {
            const badge = createFrame("HORIZONTAL", 8, 3, { r: 0.94, g: 0.92, b: 1.0 });
            badge.cornerRadius = 999;
            badge.strokes = [{ type: "SOLID", color: { r: 0.70, g: 0.60, b: 0.96 } }];
            badge.strokeWeight = 1;
            badge.appendChild(createText("Novo componente", 9, "Medium", { r: 0.38, g: 0.18, b: 0.78 }));
            fHeader.appendChild(badge);
          }
          if (f.audit && f.audit.status) {
            createRow(fRow, "Auditoria DSC", f.audit.status + (f.audit.justificativa ? ' — ' + f.audit.justificativa : ''));
          }
        });
        content.appendChild(framesSection);
        setFillAndHug(framesSection);
      }

      // 1.8 MEDIDAS (seção independente, agrupada por frame)
      const _framesWithMeasures = (_frames || []).filter(f => (f.measurements || []).length > 0);
      if (_framesWithMeasures.length > 0) {
        const measSection = createSection(content, "Medidas");
        _framesWithMeasures.forEach(f => {
          // Sub-cabeçalho do frame
          const fGroup = createFrame("VERTICAL", 0, 6);
          fGroup.name = `[Medidas] ${f.nome || 'Frame'}`;
          measSection.appendChild(fGroup);
          setFillAndHug(fGroup);
          const fLabel = createText(f.nome || 'Frame', 10, "Bold", { r: 0.27, g: 0.45, b: 0.78 });
          fGroup.appendChild(fLabel);
          setFillAndHug(fLabel);
          f.measurements.forEach(m => {
            const details = Array.isArray(m.details) ? m.details.join(' | ') : (m.details || '');
            const mRow = createFrame("HORIZONTAL", 10, 7, { r: 0.94, g: 0.97, b: 1 });
            mRow.name = `[Medida] ${m.name || 'Medida'}`;
            mRow.cornerRadius = 6;
            mRow.counterAxisAlignItems = "CENTER";
            fGroup.appendChild(mRow);
            setFillAndHug(mRow);
            const mName = createText(m.name || 'Medida', 11, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            mName.layoutGrow = 1;
            mRow.appendChild(mName);
            const mVal = createText(details, 10, "Regular", { r: 0.27, g: 0.45, b: 0.78 });
            mRow.appendChild(mVal);
            setFillAndHug(mVal);
          });
        });
        content.appendChild(measSection);
        setFillAndHug(measSection);
      }

      // 1.9 ESPECIFICAÇÕES ANOTADAS (seção independente, agrupada por frame)
      const _framesWithSpecs = (_frames || []).filter(f => (f.createdSpecs || []).length > 0);
      if (_framesWithSpecs.length > 0) {
        const annotSection = createSection(content, "Especificações Anotadas");
        _framesWithSpecs.forEach(f => {
          const fGroup = createFrame("VERTICAL", 0, 6);
          fGroup.name = `[Specs] ${f.nome || 'Frame'}`;
          annotSection.appendChild(fGroup);
          setFillAndHug(fGroup);
          const fLabel = createText(f.nome || 'Frame', 10, "Bold", { r: 0.27, g: 0.45, b: 0.78 });
          fGroup.appendChild(fLabel);
          setFillAndHug(fLabel);
          f.createdSpecs.forEach(s => {
            const catLabel = s.category || s.categoryLabel || 'Geral';
            const sRow = createFrame("VERTICAL", 10, 8, { r: 0.97, g: 0.97, b: 1 });
            sRow.name = `[Spec] ${s.name || s.label || 'Spec'}`;
            sRow.cornerRadius = 8;
            sRow.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.88, b: 0.96 } }];
            fGroup.appendChild(sRow);
            setFillAndHug(sRow);
            // Linha topo: nome + categoria
            const sTop = createFrame("HORIZONTAL", 0, 4);
            sTop.counterAxisAlignItems = "CENTER";
            sRow.appendChild(sTop);
            setFillAndHug(sTop);
            const sName = createText(s.name || s.label || 'Spec', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            sName.layoutGrow = 1;
            sTop.appendChild(sName);
            if (s.link) {
              sName.textDecoration = "UNDERLINE";
              sName.hyperlink = { type: "URL", value: s.link };
            }
            const sCatTag = createFrame("HORIZONTAL", 6, 3, { r: 0.93, g: 0.93, b: 1 });
            sCatTag.cornerRadius = 999;
            sTop.appendChild(sCatTag);
            setFillAndHug(sCatTag);
            sCatTag.appendChild(createText(catLabel, 9, "Medium", { r: 0.38, g: 0.35, b: 0.75 }));
            // Nota (se tiver)
            if (s.note) {
              const sNote = createText(s.note, 10, "Regular", { r: 0.4, g: 0.45, b: 0.55 });
              sRow.appendChild(sNote);
              setFillAndHug(sNote);
            }
          });
        });
        content.appendChild(annotSection);
        setFillAndHug(annotSection);
      }

      // 1.10 FLUXOS DE TELA
      const _flows = data.createdFlows || [];
      if (_flows.length > 0) {
        const flowTypeLabel = { line_solid: 'Linha sólida', line_dashed: 'Linha tracejada', diamond: 'Decisão', diamond_dashed: 'Decisão tracejada', event_start: 'Início', event_end: 'Fim', gateway_parallel: 'Paralelo' };
        const flowsSection = createSection(content, "Fluxos de Tela");
        _flows.forEach((flow, fi) => {
          const fRow = createFrame("VERTICAL", 12, 10, { r: 0.97, g: 0.96, b: 1 });
          fRow.name = `[Fluxo] ${flow.name || 'Fluxo ' + (fi + 1)}`;
          fRow.cornerRadius = 8;
          fRow.strokes = [{ type: "SOLID", color: { r: 0.86, g: 0.84, b: 0.96 } }];
          flowsSection.appendChild(fRow);
          setFillAndHug(fRow);
          // Topo: nome + tipo
          const fTop = createFrame("HORIZONTAL", 0, 4);
          fTop.counterAxisAlignItems = "CENTER";
          fRow.appendChild(fTop);
          setFillAndHug(fTop);
          const fName = createText(flow.name || 'Fluxo', 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          fName.layoutGrow = 1;
          fTop.appendChild(fName);
          const typeStr = flowTypeLabel[flow.type] || flow.type || '';
          if (typeStr) {
            const fTypeTag = createFrame("HORIZONTAL", 6, 3, { r: 0.93, g: 0.90, b: 1 });
            fTypeTag.cornerRadius = 999;
            fTop.appendChild(fTypeTag);
            setFillAndHug(fTypeTag);
            fTypeTag.appendChild(createText(typeStr, 9, "Medium", { r: 0.45, g: 0.35, b: 0.75 }));
          }
          // Conexão origem → destino
          if (flow.fromName || flow.toName) {
            const connStr = `${flow.fromName || '?'} → ${flow.toName || '?'}`;
            const fConn = createText(connStr, 10, "Regular", { r: 0.45, g: 0.50, b: 0.60 });
            fRow.appendChild(fConn);
            setFillAndHug(fConn);
          }
          // Texto de decisão
          if (flow.decisionText) {
            const dText = createText(`"${flow.decisionText}"`, 10, "Regular", { r: 0.5, g: 0.45, b: 0.70 });
            fRow.appendChild(dText);
            setFillAndHug(dText);
          }
        });
        content.appendChild(flowsSection);
        setFillAndHug(flowsSection);
      }

      fichaTecnica.appendChild(content);
      mainContainer.appendChild(fichaTecnica);

      // CARD 2 — BRIEFING ESTRATÉGICO (card separado, só criado se houver respostas)
      if (_briefingQs.length > 0) {
        const card2 = createFrame("VERTICAL", 0, 0, { r: 1, g: 1, b: 1 });
        card2.name = `${_handoffBase} | ${_ts} / Briefing`;
        card2.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        card2.resize(440, 100);
        card2.counterAxisSizingMode = "FIXED";
        card2.primaryAxisSizingMode = "AUTO";
        card2.cornerRadius = 16;

        const bContent = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
        card2.appendChild(bContent);
        setFillAndHug(bContent);

        const briefingSection = createSection(bContent, "Briefing Estratégico");
        _briefingQs.forEach((q, idx) => {
          const qRow = createFrame("VERTICAL", 0, 4);
          qRow.name = `[Briefing] Pergunta ${idx + 1}`;
          briefingSection.appendChild(qRow);
          setFillAndHug(qRow);

          const qText = createText(`${idx + 1}. ${q.question || ''}`, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
          qRow.appendChild(qText);
          setFillAndHug(qText);

          const aText = createText(q.answer, 13, "Regular", { r: 0.12, g: 0.16, b: 0.23 });
          aText.textAutoResize = "HEIGHT";
          aText.resize(392, 20);
          qRow.appendChild(aText);
          setFillAndHug(aText);
        });
        setFillAndHug(briefingSection);
        mainContainer.appendChild(card2);
      }

      // CARD 3 — USER INTERFACE
      if (!data.setup || data.setup.componentes !== false) {
        const uiBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
        uiBoard.name = `${_handoffBase} / Interface`;
        uiBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        uiBoard.cornerRadius = 16;
        uiBoard.primaryAxisSizingMode = "AUTO";   // Hug height
        uiBoard.counterAxisSizingMode = "AUTO";   // Hug width — se expande para todas as colunas
        uiBoard.layoutAlign = "INHERIT"; // Don't stretch height in horizontal parent

        const uiTitle = createText("User Interface", 24, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
        uiBoard.appendChild(uiTitle);

        // Helper para specs list (Colunas Verticais)
        function createSpecList(title, items, type) {
          if (!items || items.length === 0) return null;
          // Só mostra items com token aplicado (isDS !== false) e que tenham ao menos uma prop com token
          const tokenItems = items.filter(item => item.isDS !== false);
          if (tokenItems.length === 0) return null;
          items = tokenItems;

          const sec = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
          sec.name = `[Scan] ${title}`;
          sec.cornerRadius = 16;
          sec.resize(280, 100);
          sec.primaryAxisSizingMode = "AUTO";  // Hug height
          sec.counterAxisSizingMode = "FIXED"; // Base width 280

          const titleNode = createText(title, 18, "Bold", { r: 0, g: 0.35, b: 0.79 });
          sec.appendChild(titleNode);
          setFillAndHug(titleNode);

          const listContainer = createFrame("VERTICAL", 0, 12);
          sec.appendChild(listContainer);
          setFillAndHug(listContainer);

          items.forEach(item => {
            const elCard = createFrame("VERTICAL", 16, 12, { r: 0.98, g: 0.99, b: 1 });
            elCard.name = `[Token] ${item.name}`;
            elCard.cornerRadius = 12;
            elCard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.96 } }];
            elCard.strokeWeight = 1;
            
            listContainer.appendChild(elCard);
            setFillAndHug(elCard);

            // Element Header
            const headerRow = createFrame("HORIZONTAL", 0, 12);
            headerRow.counterAxisAlignItems = "CENTER";
            elCard.appendChild(headerRow);
            setFillAndHug(headerRow);

            // Preview if exists
            if (item.preview) {
               try {
                 const rect = figma.createRectangle();
                 rect.resize(32, 32);
                 rect.fills = [{ type: "IMAGE", imageHash: figma.createImage(item.preview).hash, scaleMode: "FIT" }];
                 rect.cornerRadius = 4;
                 headerRow.appendChild(rect);
               } catch(e) {}
            }

            const iName = createText(item.name, 13, "Bold", { r: 0.1, g: 0.15, b: 0.25 });
            iName.layoutGrow = 1;
            if (item.nodeId && figma.fileKey) {
              try {
                iName.hyperlink = {
                  type: "URL",
                  value: `https://www.figma.com/design/${figma.fileKey}?node-id=${encodeURIComponent(item.nodeId)}`
                };
                iName.textDecoration = "UNDERLINE";
                iName.fills = [{ type: "SOLID", color: { r: 0, g: 0.35, b: 0.79 } }];
              } catch(e) {}
            }
            headerRow.appendChild(iName);

            // Status Badge
            const status = item.componentStatus || (item.isDS === true ? "ok" : (item.isDS === "warning" ? "warning" : "error"));
            if (data.isAudit) {
              const statusColors = {
                ok: { bg: { r: 0.9, g: 0.98, b: 0.94 }, text: { r: 0.05, g: 0.5, b: 0.3 }, label: "DSC" },
                warning: { bg: { r: 1, g: 0.97, b: 0.9 }, text: { r: 0.7, g: 0.4, b: 0 }, label: "AJUSTE" },
                error: { bg: { r: 1, g: 0.93, b: 0.93 }, text: { r: 0.8, g: 0.2, b: 0.2 }, label: "FORA" }
              };
              const config = statusColors[status] || statusColors.error;
              const badge = createFrame("HORIZONTAL", 8, 4, config.bg);
              badge.cornerRadius = 6;
              badge.appendChild(createText(config.label, 9, "Bold", config.text));
              headerRow.appendChild(badge);
            }

            // Properties — só exibe props com token aplicado
            const _tokenProps = (item.properties || []).filter(p => p.isDS === true || p.isDS === "warning" || p.token);
            if (_tokenProps.length > 0) {
              const propsContainer = createFrame("VERTICAL", 0, 6);
              elCard.appendChild(propsContainer);
              setFillAndHug(propsContainer);

              _tokenProps.forEach(prop => {
                const pRow = createFrame("HORIZONTAL", 0, 8);
                pRow.counterAxisAlignItems = "CENTER";
                propsContainer.appendChild(pRow);
                setFillAndHug(pRow);

                // Property Icon
                try {
                  const iconSvg = getIconSvg(prop.type);
                  const iconNode = figma.createNodeFromSvg(iconSvg);
                  iconNode.resize(12, 12);
                  const iconColor = prop.isDS === true ? { r: 0.1, g: 0.6, b: 0.3 } : (prop.isDS === "warning" ? { r: 0.8, g: 0.5, b: 0 } : { r: 0.9, g: 0.3, b: 0.3 });
                  
                  function setSvgColor(node, color) {
                    if ('fills' in node) node.fills = [{ type: "SOLID", color }];
                    if ('strokes' in node) node.strokes = [{ type: "SOLID", color }];
                    if ('children' in node) node.children.forEach(c => setSvgColor(c, color));
                  }
                  setSvgColor(iconNode, iconColor);
                  pRow.appendChild(iconNode);
                } catch(e) {
                  const dot = figma.createEllipse();
                  dot.resize(6, 6);
                  dot.fills = [{ type: "SOLID", color: prop.isDS === true ? { r: 0.2, g: 0.8, b: 0.4 } : { r: 0.9, g: 0.3, b: 0.3 } }];
                  pRow.appendChild(dot);
                }

                const pLabel = createText(`${prop.label || prop.type}:`, 10, "Medium", { r: 0.4, g: 0.45, b: 0.5 });
                pRow.appendChild(pLabel);

                const pVal = createText(prop.value, 10, "Bold", { r: 0.2, g: 0.25, b: 0.3 });
                pVal.layoutGrow = 1;
                pRow.appendChild(pVal);
                
                if (prop.isDS === true && prop.token) {
                   const tBadge = createText(prop.token, 8, "Regular", { r: 0, g: 0.44, b: 0.69 });
                   pRow.appendChild(tBadge);
                }
              });
            }
          });
          
          return sec;
        }

        // Agrega specs de todos os frames + fallback para global
        const _allFrameSpecs = (data.frames || []).map(f => f.specs).filter(Boolean);
        const _globalSpecs = data.step2 && data.step2.specs ? data.step2.specs : null;
        const _specsSource = _allFrameSpecs.length > 0 ? _allFrameSpecs : (_globalSpecs ? [_globalSpecs] : []);
        const specsData = {
          components: _specsSource.flatMap(s => s.components || []),
          icons:      _specsSource.flatMap(s => s.icons      || []),
          typography: _specsSource.flatMap(s => s.typography || []),
          frames:     _specsSource.flatMap(s => s.frames     || []),
          vectors:    _specsSource.flatMap(s => s.vectors    || []),
        };

        const specsRow = figma.createFrame();
        specsRow.name = '[Row] Colunas UI';
        specsRow.layoutMode = "HORIZONTAL";
        specsRow.itemSpacing = 24;
        specsRow.paddingLeft = 0;
        specsRow.paddingRight = 0;
        specsRow.paddingTop = 0;
        specsRow.paddingBottom = 0;
        specsRow.fills = [];
        specsRow.primaryAxisSizingMode = "AUTO";
        specsRow.counterAxisSizingMode = "AUTO";
        specsRow.counterAxisAlignItems = "MIN";

        // Uma coluna por categoria, lado a lado
        [
          { title: "Componentes",     items: specsData.components, type: "components" },
          { title: "Ícones",          items: specsData.icons,      type: "icons"      },
          { title: "Tipografia",      items: specsData.typography, type: "typography" },
          { title: "Vetores",         items: specsData.vectors,    type: "vectors"    },
          { title: "Frames e Layouts",items: specsData.frames,     type: "frames"     },
        ].forEach(cat => {
          const sec = createSpecList(cat.title, cat.items, cat.type);
          if (sec) specsRow.appendChild(sec);
        });

        if (specsRow.children.length > 0) {
          uiBoard.appendChild(specsRow);
          setFillAndHug(specsRow);
        } else {
          specsRow.remove();
        }

        mainContainer.appendChild(uiBoard);
      }

      // 3. ANATOMIA / MEDIDAS
      const selection = figma.currentPage.selection;
      if (selection.length > 0 && data.setup && (data.setup.espacamentos || data.setup.anatomia || data.setup.instancias)) {
        for (const node of selection) {
          if (node === mainContainer) continue;

          const specsBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
          specsBoard.name = `[Design Specs] ${node.name}`;
          specsBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
          specsBoard.cornerRadius = 16;
          specsBoard.resize(800, 100);
          specsBoard.counterAxisSizingMode = "FIXED"; // Base width 800
          specsBoard.primaryAxisSizingMode = "AUTO";  // Hug height
          specsBoard.layoutAlign = "INHERIT";         // Don't stretch height in horizontal parent

          const specsTitle = createText("Design Specs: " + node.name, 24, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          specsBoard.appendChild(specsTitle);
          setFillAndHug(specsTitle);

          if (data.setup.anatomia || data.setup.espacamentos) {
            const layoutSec = createSection(specsBoard, "Layout & Posicionamento");
            const grid = createFrame("HORIZONTAL", 0, 16);
            grid.layoutWrap = "WRAP";
            
            createRow(grid, "Position", `X: ${Math.round(node.x)}, Y: ${Math.round(node.y)}`);
            createRow(grid, "Size", `W: ${Math.round(node.width)}, H: ${Math.round(node.height)}`);

            if ('layoutMode' in node && node.layoutMode !== "NONE") {
              createRow(grid, "Auto Layout", `Dir: ${node.layoutMode}, Spacing: ${node.itemSpacing}`);
              createRow(grid, "Padding", `T: ${node.paddingTop}, R: ${node.paddingRight}, B: ${node.paddingBottom}, L: ${node.paddingLeft}`);
            }
            if ('cornerRadius' in node && node.cornerRadius !== figma.mixed) {
              createRow(grid, "Corner Radius", `${node.cornerRadius}px`);
            }
            layoutSec.appendChild(grid);
            setFillAndHug(grid);
          }

          if (data.setup.instancias || data.setup.anatomia) {
            const appearSec = createSection(specsBoard, "Aparência");
            const grid = createFrame("HORIZONTAL", 0, 16);
            grid.layoutWrap = "WRAP";
            grid.layoutAlign = "STRETCH";

            if ('opacity' in node) createRow(grid, "Opacity", `${Math.round(node.opacity * 100)}%`);
            if ('blendMode' in node && node.blendMode !== "PASS_THROUGH") createRow(grid, "Blend Mode", node.blendMode);

            if ('fills' in node && Array.isArray(node.fills)) {
              const sf = node.fills.find(f => f.type === "SOLID");
              if (sf) {
                const hex = rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase();
                const token = getVariableInfo(node, 'fills');
                createRow(grid, "Fills", token ? token : hex);
              }
            }
            if ('strokes' in node && Array.isArray(node.strokes)) {
              const ss = node.strokes.find(s => s.type === "SOLID");
              if (ss) {
                const hex = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
                const token = getVariableInfo(node, 'strokes');
                createRow(grid, "Strokes", `${token ? token : hex} (${node.strokeWeight}px)`);
              }
            }

            if (grid.children.length > 0) {
              appearSec.appendChild(grid);
              setFillAndHug(grid);
            } else {
              appearSec.remove();
            }
          }

          specsBoard.layoutAlign = "STRETCH";
          mainContainer.appendChild(specsBoard);
        }
      }

      // 4. AUDIT SUMMARY
      if (data.isAudit && data.auditSummary) {
        const auditBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
        auditBoard.name = `${_handoffBase} / Auditoria`;
        auditBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        auditBoard.cornerRadius = 16;
        auditBoard.resize(800, 100);
        auditBoard.counterAxisSizingMode = "FIXED";
        auditBoard.primaryAxisSizingMode = "AUTO";
        
        const auditTitle = createText("Relatório de Auditoria", 24, "Bold", { r: 0, g: 0.35, b: 0.79 });
        auditBoard.appendChild(auditTitle);
        setFillAndHug(auditTitle);

        const summaryText = createText(`Aderência ao Design System: ${data.auditSummary.adoption}%`, 18, "Bold", data.auditSummary.adoption > 90 ? { r: 0, g: 0.5, b: 0 } : { r: 0.8, g: 0, b: 0 });
        auditBoard.appendChild(summaryText);
        setFillAndHug(summaryText);

        const statsText = createText(`Resumo: ${data.auditSummary.issues.length} Fora do Padrão | ${data.auditSummary.adjustments.length} Ajustes`, 14, "Medium", { r: 0.4, g: 0.45, b: 0.5 });
        auditBoard.appendChild(statsText);
        setFillAndHug(statsText);

        if (data.auditSummary.adjustments && data.auditSummary.adjustments.length > 0) {
           const adjSection = createSection(auditBoard, "Ajustes Recomendados (Minorias)");
           data.auditSummary.adjustments.slice(0, 10).forEach(adj => {
             const aRow = createText(`- [${adj.cat}] ${adj.name}`, 12, "Regular", { r: 0.7, g: 0.4, b: 0 });
             adjSection.appendChild(aRow);
             setFillAndHug(aRow);
           });
        }

        if (data.auditSummary.issues && data.auditSummary.issues.length > 0) {
           const issueList = createSection(auditBoard, "Pendências Críticas (Fora do Padrão)");
           data.auditSummary.issues.slice(0, 20).forEach(issue => {
             const iRow = createText(`- [${issue.cat}] ${issue.name}`, 12, "Regular", { r: 0.8, g: 0.2, b: 0.2 });
             issueList.appendChild(iRow);
             setFillAndHug(iRow);
           });
           if (data.auditSummary.issues.length > 20) {
             const moreText = createText(`... e mais ${data.auditSummary.issues.length - 20} itens.`, 10, "Regular", { r: 0.5, g: 0.5, b: 0.5 });
             issueList.appendChild(moreText);
             setFillAndHug(moreText);
           }
        }

        mainContainer.appendChild(auditBoard);
      }

      // Append ao canvas primeiro para que as dimensões AUTO sejam calculadas pelo Figma
      mainContainer.locked = false;
      figma.currentPage.appendChild(mainContainer);
      // Inicializar fora da tela para evitar flash de sobreposição enquanto calcula posição
      mainContainer.x = -99999;
      mainContainer.y = -99999;

      // Calcula gap considerando a largura real da ficha já renderizada
      const _fichaGap = 200;

      let _positioned = false;

      // 1ª prioridade: ao lado de ficha já existente no canvas (evita sobreposição entre fichas)
      const _existingFichas = figma.currentPage.children.filter(n =>
        n.type === 'FRAME' && n.name.startsWith('Handex | Ficha') && n !== mainContainer
      );
      if (_existingFichas.length > 0) {
        const _rightmostFicha = _existingFichas.reduce((max, f) => {
          const bb = f.absoluteBoundingBox;
          if (!bb) return max;
          return (bb.x + bb.width) > max.right ? { right: bb.x + bb.width, y: bb.y } : max;
        }, { right: -Infinity, y: 0 });
        if (_rightmostFicha.right > -Infinity) {
          mainContainer.x = Math.round(_rightmostFicha.right + _fichaGap);
          mainContainer.y = Math.round(_rightmostFicha.y);
          _positioned = true;
        }
      }

      // 2ª prioridade: ao lado do primeiro frame registrado por figmaId
      if (!_positioned) {
        const _mainFrames = data.frames || [];
        for (const _f of _mainFrames) {
          if (!_f.figmaId) continue;
          const _fNode = figma.getNodeById(_f.figmaId);
          if (!_fNode) continue;
          const _fBb = _fNode.absoluteBoundingBox;
          if (_fBb) {
            mainContainer.x = Math.round(_fBb.x + _fBb.width + _fichaGap);
            mainContainer.y = Math.round(_fBb.y);
            _positioned = true;
            break;
          }
        }
      }

      // 3ª prioridade: ao lado da seleção atual no canvas
      if (!_positioned) {
        const _sel = figma.currentPage.selection.filter(n => n !== mainContainer);
        if (_sel.length > 0) {
          const _rightmost = _sel.reduce((max, n) => {
            const bb = n.absoluteBoundingBox;
            return bb && (bb.x + bb.width) > max.edge ? { edge: bb.x + bb.width, x: bb.x + bb.width, y: bb.y } : max;
          }, { edge: -Infinity, x: 0, y: 0 });
          if (_rightmost.edge > -Infinity) {
            mainContainer.x = Math.round(_rightmost.x + _fichaGap);
            mainContainer.y = Math.round(_rightmost.y);
            _positioned = true;
          }
        }
      }

      // 4ª prioridade (fallback): à direita da borda visível do viewport
      if (!_positioned) {
        const _vb = figma.viewport.bounds;
        mainContainer.x = Math.round(_vb.x + _vb.width + _fichaGap);
        mainContainer.y = Math.round(_vb.y + (_vb.height / 2) - (mainContainer.height / 2));
      }

      figma.currentPage.selection = [mainContainer];
      figma.viewport.scrollAndZoomIntoView([mainContainer]);

      figma.ui.postMessage({ type: "handoff-complete", isUpdate: _isUpdate, timestamp: _ts });
    } catch (err) {
      console.error("Handoff Error:", err);
      figma.ui.postMessage({ type: "handoff-error", message: err.message });
    }
  }

  // add-annotations is handled below

  if (msg.type === "measure-nodes-custom") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("Selecione um ou mais itens para mensurar.");
      return;
    }

    const { measureTypes } = msg;

    function getVariableInfo(node, prop) {
      if (!node.boundVariables) return null;
      const boundVar = node.boundVariables[prop];
      if (!boundVar) return null;
      const varId = Array.isArray(boundVar) ? (boundVar[0] && boundVar[0].id) : boundVar.id;
      if (!varId) return null;
      const v = figma.variables.getVariableById(varId);
      return v ? v.name : null;
    }

    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }

      function createMeasurementLine(x1, y1, x2, y2, value, type = 'horizontal', redColor = { r: 1, g: 0.2, b: 0.2 }, tokenName = null) {
        const elements = [];
        const mainLine = figma.createLine();
        mainLine.strokes = [{ type: "SOLID", color: redColor }];
        mainLine.strokeWeight = 1;
        mainLine.x = x1;
        mainLine.y = y1;

        if (type === 'horizontal') {
          mainLine.resize(Math.max(0.01, x2 - x1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color: redColor }];
          t1.x = x1; t1.y = y1 - 4; t1.resize(8, 0); t1.rotation = -90;
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color: redColor }];
          t2.x = x2; t2.y = y1 - 4; t2.resize(8, 0); t2.rotation = -90;
          elements.push(mainLine, t1, t2);
        } else {
          mainLine.rotation = -90;
          mainLine.resize(Math.max(0.01, y2 - y1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color: redColor }];
          t1.x = x1 - 4; t1.y = y1; t1.resize(8, 0);
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color: redColor }];
          t2.x = x1 - 4; t2.y = y2; t2.resize(8, 0);
          elements.push(mainLine, t1, t2);
        }

        const label = figma.createText();
        label.fontName = { family: "Inter", style: "Regular" };
        const labelVal = Math.round(value);
        label.characters = tokenName ? `${tokenName} (${labelVal})` : String(labelVal);
        label.fontSize = 10;
        label.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

        const bg = figma.createRectangle();
        bg.resize(label.width + 8, label.height + 4);
        bg.fills = [{ type: "SOLID", color: redColor }];
        bg.cornerRadius = 4;

        // Coloca o texto por cima do fundo antes de agrupar
        figma.currentPage.appendChild(label);

        if (type === 'horizontal') {
          const dist = Math.abs(x2 - x1);
          const cx = x1 + (x2 - x1) / 2;
          if (dist < bg.width + 8) {
            // Muito pequeno para o chip, traz ao lado (direita)
            bg.x = x2 + 6;
            bg.y = y1 - bg.height / 2;
          } else {
            bg.x = cx - bg.width / 2;
            bg.y = y1 - bg.height / 2;
          }
        } else {
          const dist = Math.abs(y2 - y1);
          const cy = y1 + (y2 - y1) / 2;
          if (dist < bg.height + 8) {
            // Muito pequeno para o chip, traz abaixo
            bg.x = x1 - bg.width / 2;
            bg.y = y2 + 6;
          } else {
            bg.x = x1 - bg.width / 2;
            bg.y = cy - bg.height / 2;
          }
        }

        // Centraliza o texto no chip
        label.x = bg.x + 4;
        label.y = bg.y + 2;

        elements.push(bg, label);
        return elements;
      }

      const appliedMeasuresList = [];

      for (const node of selection) {
        const bounds = node.absoluteRenderBounds || node.absoluteBoundingBox;
        if (!bounds) continue;

        let items = [];
        let appliedDetails = [];

        if (measureTypes && measureTypes.includes('wh')) {
          const wToken = getVariableInfo(node, 'width');
          const hToken = getVariableInfo(node, 'height');
          items.push(...createMeasurementLine(bounds.x, bounds.y - 20, bounds.x + bounds.width, bounds.y - 20, bounds.width, 'horizontal', { r: 1, g: 0.2, b: 0.2 }, wToken));
          items.push(...createMeasurementLine(bounds.x - 20, bounds.y, bounds.x - 20, bounds.y + bounds.height, bounds.height, 'vertical', { r: 1, g: 0.2, b: 0.2 }, hToken));

          let whLabel = `Dimensões: ${Math.round(bounds.width)}x${Math.round(bounds.height)}`;
          if (wToken || hToken) whLabel += ` [Tokens: ${wToken || '-'} x ${hToken || '-'}]`;
          appliedDetails.push(whLabel);
        }

        if (measureTypes && measureTypes.includes('inner') && 'layoutMode' in node && node.layoutMode !== "NONE") {
          const shiftX = bounds.x + bounds.width / 2 - 12;
          const shiftY = bounds.y + bounds.height / 2 - 12;
          let pads = [];
          const tT = getVariableInfo(node, 'paddingTop');
          const tB = getVariableInfo(node, 'paddingBottom');
          const tL = getVariableInfo(node, 'paddingLeft');
          const tR = getVariableInfo(node, 'paddingRight');

          if (node.paddingTop > 0) { items.push(...createMeasurementLine(shiftX, bounds.y, shiftX, bounds.y + node.paddingTop, node.paddingTop, 'vertical', { r: 0, g: 0.5, b: 1 }, tT)); pads.push(`Top: ${node.paddingTop}${tT ? ' [' + tT + ']' : ''}`); }
          if (node.paddingBottom > 0) { items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height - node.paddingBottom, shiftX, bounds.y + bounds.height, node.paddingBottom, 'vertical', { r: 0, g: 0.5, b: 1 }, tB)); pads.push(`Bottom: ${node.paddingBottom}${tB ? ' [' + tB + ']' : ''}`); }
          if (node.paddingLeft > 0) { items.push(...createMeasurementLine(bounds.x, shiftY, bounds.x + node.paddingLeft, shiftY, node.paddingLeft, 'horizontal', { r: 0, g: 0.5, b: 1 }, tL)); pads.push(`Left: ${node.paddingLeft}${tL ? ' [' + tL + ']' : ''}`); }
          if (node.paddingRight > 0) { items.push(...createMeasurementLine(bounds.x + bounds.width - node.paddingRight, shiftY, bounds.x + bounds.width, shiftY, node.paddingRight, 'horizontal', { r: 0, g: 0.5, b: 1 }, tR)); pads.push(`Right: ${node.paddingRight}${tR ? ' [' + tR + ']' : ''}`); }
          if (pads.length > 0) appliedDetails.push(`Padding Interno: ${pads.join(', ')}`);
        }

        if (measureTypes && measureTypes.includes('spacing') && 'layoutMode' in node && node.layoutMode !== "NONE" && node.children.length > 1) {
          let spaceCount = 0;
          const gapToken = getVariableInfo(node, 'itemSpacing');
          for (let i = 0; i < node.children.length - 1; i++) {
            const child1 = node.children[i];
            const child2 = node.children[i + 1];
            const b1 = child1.absoluteRenderBounds || child1.absoluteBoundingBox;
            const b2 = child2.absoluteRenderBounds || child2.absoluteBoundingBox;
            if (!b1 || !b2) continue;

            if (node.layoutMode === "HORIZONTAL") {
              const startX = b1.x + b1.width;
              const endX = b2.x;
              const y = bounds.y + bounds.height / 2;
              if (endX > startX) {
                items.push(...createMeasurementLine(startX, y, endX, y, endX - startX, 'horizontal', { r: 0.8, g: 0.2, b: 0.8 }, gapToken));
                spaceCount++;
              }
            } else if (node.layoutMode === "VERTICAL") {
              const startY = b1.y + b1.height;
              const endY = b2.y;
              const x = bounds.x + bounds.width / 2;
              if (endY > startY) {
                items.push(...createMeasurementLine(x, startY, x, endY, endY - startY, 'vertical', { r: 0.8, g: 0.2, b: 0.8 }, gapToken));
                spaceCount++;
              }
            }
          }
          if (spaceCount > 0) appliedDetails.push(`Gaps: ${spaceCount} espaços de ${node.itemSpacing}px ${gapToken ? '[' + gapToken + ']' : ''}`);
        }

        if (measureTypes && measureTypes.includes('outer')) {
          if (node.parent && node.parent.type !== "PAGE") {
            const pb = node.parent.absoluteRenderBounds || node.parent.absoluteBoundingBox;
            if (pb) {
              const shiftX = bounds.x + bounds.width / 2 + 12;
              const shiftY = bounds.y + bounds.height / 2 + 12;
              let outers = [];
              if (bounds.y > pb.y) { items.push(...createMeasurementLine(shiftX, pb.y, shiftX, bounds.y, bounds.y - pb.y, 'vertical', { r: 1, g: 0.5, b: 0 })); outers.push(`Top: ${Math.round(bounds.y - pb.y)}`); }
              if (bounds.x > pb.x) { items.push(...createMeasurementLine(pb.x, shiftY, bounds.x, shiftY, bounds.x - pb.x, 'horizontal', { r: 1, g: 0.5, b: 0 })); outers.push(`Left: ${Math.round(bounds.x - pb.x)}`); }
              if (pb.x + pb.width > bounds.x + bounds.width) { items.push(...createMeasurementLine(bounds.x + bounds.width, shiftY, pb.x + pb.width, shiftY, (pb.x + pb.width) - (bounds.x + bounds.width), 'horizontal', { r: 1, g: 0.5, b: 0 })); outers.push(`Right: ${Math.round((pb.x + pb.width) - (bounds.x + bounds.width))}`); }
              if (pb.y + pb.height > bounds.y + bounds.height) { items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height, shiftX, pb.y + pb.height, (pb.y + pb.height) - (bounds.y + bounds.height), 'vertical', { r: 1, g: 0.5, b: 0 })); outers.push(`Bottom: ${Math.round((pb.y + pb.height) - (bounds.y + bounds.height))}`); }
              if (outers.length > 0) appliedDetails.push(`Espaçamento Externo: ${outers.join(', ')}`);
            }
          } else {
            figma.notify("Outer padding necessita que o node esteja dentro de um frame.");
          }
        }

        if (items.length > 0) {
          const group = figma.group(items, figma.currentPage);
          group.name = `[Medida] ${node.name}`;
          group.locked = true;
          appliedMeasuresList.push({ name: node.name, nodeId: group.id, details: appliedDetails });
        }

        /* â”€â”€ DORMANT: Frame Auxiliar de Medidas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         * Para ativar:
         *   1. Remover o bloco `figma.group(...)` acima
         *   2. Descomentar este bloco
         *   3. Remover `disabled` e `opacity-50` do checkbox `chk-store-parent` no modal
         *
         * Comportamento: cria "[Medida-Aux] NomeDoFrame" ao lado do original,
         * coloca uma cópia do frame dentro, aplica as medidas na cópia e
         * cria um conector pontilhado ligando original â†’ auxiliar.
         * Re-scan substitui o frame auxiliar existente.
         */
        // if (items.length > 0) {
        //   const pageLvl = figma.currentPage;
        //   const orig = (node.parent && node.parent.type === 'FRAME') ? node.parent : node;
        //   const auxName = `[Medida-Aux] ${orig.name}`;
        //
        //   // Re-scan: substitui frame auxiliar anterior
        //   const existing = pageLvl.children.find(n => n.name === auxName && n.type === 'FRAME');
        //   if (existing) existing.remove();
        //
        //   // Cria frame auxiliar ao lado do original
        //   const auxFrame = figma.createFrame();
        //   auxFrame.name = auxName;
        //   auxFrame.resize(orig.width + 120, orig.height + 120);
        //   auxFrame.x = orig.x + orig.width + 80;
        //   auxFrame.y = orig.y;
        //   auxFrame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.98 } }];
        //   pageLvl.appendChild(auxFrame);
        //
        //   // Copia o frame original para dentro do auxiliar
        //   const clone = orig.clone();
        //   clone.x = 60; clone.y = 60;
        //   auxFrame.appendChild(clone);
        //
        //   // Insere as anotações de medida no frame auxiliar
        //   const group = figma.group(items, auxFrame);
        //   group.name = `[Medidas] ${node.name}`;
        //   group.locked = true;
        //
        //   // Conector pontilhado: original â†’ auxiliar
        //   const connector = figma.createConnector();
        //   connector.connectorStart = { endpointNodeId: orig.id, magnet: 'AUTO' };
        //   connector.connectorEnd   = { endpointNodeId: auxFrame.id, magnet: 'AUTO' };
        //   connector.connectorLineType = 'ELBOWED';
        //   connector.strokes = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.7 } }];
        //   connector.strokeWeight = 1.5;
        //   connector.dashPattern = [4, 4];
        //
        //   appliedMeasuresList.push({ name: node.name, nodeId: auxFrame.id, details: appliedDetails });
        // }
      }

      figma.ui.postMessage({ type: "measurements-applied", data: appliedMeasuresList });
      figma.notify("Medidas aplicadas com sucesso!");
    })();
  }

  /* â”€â”€ DORMANT: Feature 5 — Mapeamento de Protótipo (Conectores + Mermaid) â”€â”€
   * Para ativar:
   *   1. Descomentar o bloco abaixo
   *   2. Adicionar botão "Mapear Protótipo" na view de Fluxos (Step 4)
   *      com onclick: parent.postMessage({ pluginMessage: { type: 'map-prototype-flows' } }, '*')
   *   3. Adicionar handler 'prototype-flows-mapped' em messages.js para receber
   *      { edges, mermaid } e renderizar na lista de fluxos
   *
   * Limitação conhecida: reactions contém apenas transições configuradas no
   * modo Prototype. Frames sem ligação não aparecem — informar o usuário e
   * deixar adição manual via Fluxos (Feature 4) como complemento.
   */
  // if (msg.type === 'map-prototype-flows') {
  //   const frames = figma.currentPage.children.filter(n =>
  //     n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'SECTION'
  //   );
  //   const edges = [];
  //   const nodeIndex = {};
  //   frames.forEach(frame => { nodeIndex[frame.id] = frame.name; });
  //
  //   frames.forEach(frame => {
  //     (frame.reactions || []).forEach(r => {
  //       if (r.action?.type === 'NODE' && r.action.destinationId) {
  //         edges.push({
  //           sourceId:   frame.id,
  //           sourceName: frame.name,
  //           destId:     r.action.destinationId,
  //           destName:   nodeIndex[r.action.destinationId] || r.action.destinationId,
  //           trigger:    r.trigger?.type || 'ON_CLICK'
  //         });
  //         // Conector visual no canvas
  //         const connector = figma.createConnector();
  //         connector.connectorStart = { endpointNodeId: frame.id, magnet: 'AUTO' };
  //         connector.connectorEnd   = { endpointNodeId: r.action.destinationId, magnet: 'AUTO' };
  //         connector.connectorLineType = 'ELBOWED';
  //         connector.strokes = [{ type: 'SOLID', color: { r: 0.3, g: 0.5, b: 0.9 } }];
  //         connector.strokeWeight = 2;
  //       }
  //     });
  //   });
  //
  //   // Serialização Mermaid
  //   // Exemplo de saída: flowchart LR\n  N0["Home"] -->|ON_CLICK| N1["Dashboard"]
  //   const idMap = {};
  //   let idx = 0;
  //   let mermaid = 'flowchart LR\n';
  //   edges.forEach(e => {
  //     if (!idMap[e.sourceId]) idMap[e.sourceId] = `N${idx++}`;
  //     if (!idMap[e.destId])   idMap[e.destId]   = `N${idx++}`;
  //     const src = e.sourceName.replace(/"/g, "'");
  //     const dst = e.destName.replace(/"/g, "'");
  //     mermaid += `  ${idMap[e.sourceId]}["${src}"] -->|${e.trigger}| ${idMap[e.destId]}["${dst}"]\n`;
  //   });
  //
  //   figma.ui.postMessage({ type: 'prototype-flows-mapped', edges, mermaid });
  //   if (edges.length === 0) {
  //     figma.notify('Nenhuma ligação de protótipo encontrada. Adicione conexões manualmente via Fluxos.');
  //   }
  //   return;
  // }

  if (msg.type === "scan-frame") {
    // Se veio um nodeId específico, usa ele; senão usa a seleção atual do canvas
    let selection;
    if (msg.nodeId) {
      const specificNode = figma.getNodeById(msg.nodeId);
      selection = specificNode ? [specificNode] : [];
    } else {
      selection = figma.currentPage.selection;
    }
    const _scanFrameId = msg.frameId || null;

    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "scan-result",
        frameId: _scanFrameId,
        error: "Nenhum item selecionado. Por favor, selecione um ou mais frames, seções ou grupos no Figma para escanear.",
      });
      return;
    }

    const specs = {
      components: new Map(),
      icons: new Map(),
      typography: new Map(),
      frames: new Map(),
      vectors: new Map()
    };
    const frameJson = frameJsonTemplate();

    const selectedLibSlugs = Array.isArray(msg.selectedLibSlugs) && msg.selectedLibSlugs.length > 0 ? msg.selectedLibSlugs : null;
    const rawReferenceTokens = msg.referenceTokens || null;
    const referenceTokens = (() => {
      if (!rawReferenceTokens || !selectedLibSlugs) return rawReferenceTokens;
      const list = Array.isArray(rawReferenceTokens) ? rawReferenceTokens : [rawReferenceTokens];
      const filtered = list.filter(lib => lib && lib.slug && selectedLibSlugs.includes(lib.slug));
      return filtered.length > 0 ? filtered : rawReferenceTokens;
    })();
    const isAudit = msg.isAudit || false;
    const allowedCategories = msg.categories || null; // Array of strings or null

    // Wraps auditProperty + derives the legacy isDS flag (true | "warning" | false).
    // Returns an object that can be spread into the prop, e.g.:
    //   props.push({ ..., ...audit("colors", hex, key) });
    // isRemote: variável ou estilo vem de lib publicada (variable.remote / style.remote).
    // Nesse caso o Figma já garante a origem — não precisa checar no skeleton.
    function audit(propType, propValue, propKey, propName, isRemote) {
      if (isRemote) {
        return { isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: 'remote', matchedIn: null, matchedTokenName: null, closestMatch: null };
      }
      const result = auditProperty(propName, propValue, propType, propKey, referenceTokens, isAudit);
      const isDS = result.score >= AUDIT_SCORE.EXACT ? true
                 : result.score >= AUDIT_SCORE.SOFT ? "warning"
                 : false;
      let closestMatch = null;
      if (isAudit && result.score < AUDIT_THRESHOLDS.AJUSTE) {
        closestMatch = suggestClosestMatch(propType, propValue, referenceTokens);
      }
      return {
        isDS,
        score: isAudit ? result.score : null,
        matchedBy: result.matchedBy,
        matchedIn: result.matchedIn,
        matchedTokenName: result.matchedTokenName,
        closestMatch
      };
    }

    function rgbToHex(r, g, b) {
      const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };
      return "#" + toHex(r) + toHex(g) + toHex(b);
    }

    function getVar(n, p) {
      if (!n.boundVariables) return null;
      const v = n.boundVariables[p];
      if (!v) return null;
      const id = Array.isArray(v) ? (v[0] && v[0].id) : v.id;
      if (!id) return null;
      const variable = figma.variables.getVariableById(id);
      return variable ? { name: variable.name, key: variable.key, remote: variable.remote === true } : null;
    }

    function extractNodeProperties(n) {
      const props = [];
      
      // Colors (Fills)
      if ('fills' in n && Array.isArray(n.fills)) {
        let styleName = null;
        let styleKey = null;
        let fillStyleRemote = false;
        if ('fillStyleId' in n && typeof n.fillStyleId === "string" && n.fillStyleId) {
          const style = figma.getStyleById(n.fillStyleId);
          if (style) { styleName = style.name; styleKey = style.key; fillStyleRemote = style.remote === true; }
        }
        for (const fill of n.fills) {
          // SKIP HIDDEN FILLS
          if (fill.visible === false) continue;

          if (fill.type === "SOLID" && fill.color) {
            const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b).toUpperCase();
            const vInfo = getVar(n, "fills");
            const name = (vInfo && vInfo.name) || styleName || hex;
            const key = (vInfo && vInfo.key) || styleKey;
            const _isRemote = (vInfo && vInfo.remote) || fillStyleRemote;
            props.push({ type: "color", name, value: hex, rawValue: hex, key, variableKey: vInfo ? vInfo.key : null, styleKey, label: "Cor (Fill)", ...audit("colors", hex, key, name, _isRemote) });
          }
        }
      }

      // Typography
      if (n.type === "TEXT") {
        let styleName = null;
        let styleKey = null;
        let textStyleRemote = false;
        if ('textStyleId' in n && typeof n.textStyleId === "string" && n.textStyleId !== figma.mixed && n.textStyleId) {
          const style = figma.getStyleById(n.textStyleId);
          if (style) { styleName = style.name; styleKey = style.key; textStyleRemote = style.remote === true; }
        }
        const family = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.family : "Mixed";
        const fontStyle = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.style : "Mixed";
        const size = (n.fontSize && n.fontSize !== figma.mixed) ? n.fontSize : "Mixed";
        const name = styleName || `${family} ${fontStyle} (${size}px)`;
        const rawSize = typeof size === "number" ? size : null;
        props.push({ type: "typography", name, value: name, rawValue: rawSize, key: styleKey, styleKey, label: "Tipografia", ...audit("typography", name, styleKey, name, textStyleRemote) });
      }

      // Spacing, Alignment
      if ('layoutMode' in n && n.layoutMode !== "NONE") {
        if (n.itemSpacing !== figma.mixed && n.itemSpacing > 0) {
          const vInfo = getVar(n, "itemSpacing");
          const val = `${n.itemSpacing}px`;
          const name = (vInfo && vInfo.name) || val;
          const propKey = vInfo ? vInfo.key : null;
          props.push({ type: "spacing", name, value: val, rawValue: n.itemSpacing, key: propKey, variableKey: propKey, label: "Gap", ...audit("spacing", val, propKey, name, vInfo && vInfo.remote) });
        }
        const paddings = [
          { prop: 'paddingTop', label: 'Top' }, { prop: 'paddingRight', label: 'Right' },
          { prop: 'paddingBottom', label: 'Bottom' }, { prop: 'paddingLeft', label: 'Left' }
        ];
        paddings.forEach(p => {
          if (n[p.prop] > 0) {
            const vInfo = getVar(n, p.prop);
            const val = `${n[p.prop]}px`;
            const name = (vInfo && vInfo.name) || val;
            const propKey = vInfo ? vInfo.key : null;
            props.push({ type: "spacing", name, value: val, rawValue: n[p.prop], key: propKey, variableKey: propKey, label: `Padding ${p.label}`, ...audit("spacing", val, propKey, name, vInfo && vInfo.remote) });
          }
        });
      }

      // Borders
      if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0) {
        // ONLY SCAN VISIBLE STROKES WITH WEIGHT > 0
        const visibleStroke = n.strokes.find(s => s.visible !== false && (s.opacity === undefined || s.opacity > 0));
        
        if (visibleStroke && 'strokeWeight' in n && n.strokeWeight !== figma.mixed && n.strokeWeight > 0) {
          const vInfo = getVar(n, "strokeWeight");
          const val = `${n.strokeWeight}px`;
          const name = (vInfo && vInfo.name) || val;
          const propKey = vInfo ? vInfo.key : null;

          // Whitelist 1px and 0px border width: treat as exact match.
          const whitelisted = (val === "1px" || val === "0px");
          const auditFields = whitelisted
            ? { isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "value", matchedIn: null }
            : audit("borders", val, propKey, name);

          props.push({ type: "strokeWeight", name, value: val, rawValue: n.strokeWeight, key: propKey, variableKey: propKey, label: "Border Width", ...auditFields });

          if (visibleStroke.type === "SOLID") {
            const hex = rgbToHex(visibleStroke.color.r, visibleStroke.color.g, visibleStroke.color.b).toUpperCase();
            let styleName = null; let styleKey = null; let strokeStyleRemote = false;
            if ('strokeStyleId' in n && n.strokeStyleId) {
              const st = figma.getStyleById(n.strokeStyleId);
              if (st) { styleName = st.name; styleKey = st.key; strokeStyleRemote = st.remote === true; }
            }
            const sVar = getVar(n, "strokes");
            const strokeKey = (sVar && sVar.key) || styleKey;
            const strokeName = (sVar && sVar.name) || styleName || hex;
            props.push({ type: "stroke", name: strokeName, value: hex, rawValue: hex, key: strokeKey, variableKey: sVar ? sVar.key : null, styleKey, label: "Border Color", ...audit("colors", hex, strokeKey, strokeName, (sVar && sVar.remote) || strokeStyleRemote) });
          }
        }
      }

      if ('cornerRadius' in n && n.cornerRadius !== figma.mixed && n.cornerRadius > 0) {
        const vInfo = getVar(n, "cornerRadius");
        const val = `${n.cornerRadius}px`;
        const name = (vInfo && vInfo.name) || val;
        const propKey = vInfo ? vInfo.key : null;
        props.push({ type: "radius", name, value: val, rawValue: n.cornerRadius, key: propKey, variableKey: propKey, label: "Radius", ...audit("borders", val, propKey, name, vInfo && vInfo.remote) });
      }

      // Effects
      if ('effects' in n && Array.isArray(n.effects)) {
        let styleName = null; let styleKey = null; let effectStyleRemote = false;
        if ('effectStyleId' in n && n.effectStyleId) {
          const style = figma.getStyleById(n.effectStyleId);
          if (style) { styleName = style.name; styleKey = style.key; effectStyleRemote = style.remote === true; }
        }
        for (const effect of n.effects) {
          if (effect.visible) {
             const name = styleName || `${effect.type} (${effect.type.includes('SHADOW') ? 'Sombra' : 'Blur'})`;
             props.push({ type: "effect", name, value: effect.type, key: styleKey, styleKey, label: "Effect", ...audit("effects", effect.type, styleKey, name, effectStyleRemote) });
          }
        }
      }

      // RESIZING (Width / Height behavior)
      if (n.type !== "PAGE" && n.parent && n.parent.type !== "PAGE") {
        const parent = n.parent;
        let wMode = "Fixed";
        let hMode = "Fixed";

        // Logic for Width
        if (parent.layoutMode === "HORIZONTAL" && n.layoutGrow === 1) wMode = "Fill Container";
        else if (parent.layoutMode === "VERTICAL" && n.layoutAlign === "STRETCH") wMode = "Fill Container";
        else if (n.layoutMode && ((n.layoutMode === "HORIZONTAL" && n.primaryAxisSizingMode === "AUTO") || (n.layoutMode === "VERTICAL" && n.counterAxisSizingMode === "AUTO"))) wMode = "Hug Contents";

        // Logic for Height
        if (parent.layoutMode === "VERTICAL" && n.layoutGrow === 1) hMode = "Fill Container";
        else if (parent.layoutMode === "HORIZONTAL" && n.layoutAlign === "STRETCH") hMode = "Fill Container";
        else if (n.layoutMode && ((n.layoutMode === "VERTICAL" && n.primaryAxisSizingMode === "AUTO") || (n.layoutMode === "HORIZONTAL" && n.counterAxisSizingMode === "AUTO"))) hMode = "Hug Contents";

        props.push({ type: "layout", name: wMode, value: wMode, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: "W Sizing" });
        props.push({ type: "layout", name: hMode, value: hMode, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: "H Sizing" });
      }

      // VARIANTS (For Instances)
      if (n.type === "INSTANCE" && n.componentProperties) {
        Object.entries(n.componentProperties).forEach(([propName, propObj]) => {
          // Format name: remove #... suffix if present
          const cleanName = propName.split("#")[0];
          const val = String(propObj.value);
          // Variants are usually part of DS by definition if the component is [dsc]
          props.push({ type: "variant", name: cleanName, value: val, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: `Prop: ${cleanName}` });
        });
      }

      return props;
    }

    function addElement(category, node, props) {
      // FILTRAGEM POR CATEGORIA (apenas se não for auditoria)
      if (!isAudit && allowedCategories && allowedCategories.length > 0) {
        let isAllowed = false;
        if (category === "frames" && allowedCategories.includes("containers")) isAllowed = true;
        else if (category === "vectors" && allowedCategories.includes("shapes")) isAllowed = true;
        else if (allowedCategories.includes(category)) isAllowed = true;
        
        if (!isAllowed) return;
      }

      // If props is empty, and it's not a component/icon/text, skip to reduce noise
      if (props.length === 0 && (category === "frames" || category === "vectors")) return;

      const name = node.name;

      let componentKey = null;
      if (node.type === "INSTANCE" && node.mainComponent) {
        componentKey = node.mainComponent.key;
      } else if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
        componentKey = node.key;
      }

      let dsElement = false;
      let elementScore = null;
      let elementMatchedBy = null;
      let elementMatchedIn = null;
      let elementMatchedTokenName = null;
      if (category === "components" || category === "icons") {
        const a = audit(category, name, componentKey, name);
        dsElement = a.isDS;
        elementScore = a.score;
        elementMatchedBy = a.matchedBy;
        elementMatchedIn = a.matchedIn;
        elementMatchedTokenName = a.matchedTokenName;
        // Convenção [dsc] no nome confirma conformidade (fallback quando chave não está no skeleton)
        if (dsElement !== true && /^\[dsc\]/i.test(name)) dsElement = true;
        // Instância de biblioteca publicada (remote=true) → conforme ao DSC por definição
        if (dsElement !== true && node.type === 'INSTANCE' && node.mainComponent && node.mainComponent.remote) {
          dsElement = true;
        }
      }
      if (category === "frames") {
        // Frame é conforme se todos os seus tokens de estilo vêm do DSC.
        // Props sem isDS definido (variantes, etc.) são ignoradas na conta.
        const _auditableProps = props.filter(p => p.isDS !== undefined && p.type !== 'variant');
        if (_auditableProps.length === 0) {
          dsElement = true; // sem props auditáveis — sem desvio declarável
        } else {
          const _allOk = _auditableProps.every(p => p.isDS === true);
          const _anyOk = _auditableProps.some(p => p.isDS === true);
          dsElement = _allOk ? true : (_anyOk ? 'warning' : false);
        }
      }
      if (category === "typography") {
        const _typoProp = props.find(p => p.type === "typography");
        if (_typoProp) {
          dsElement = _typoProp.isDS !== undefined ? _typoProp.isDS : false;
          elementScore = _typoProp.score || null;
          elementMatchedBy = _typoProp.matchedBy || null;
          elementMatchedIn = _typoProp.matchedIn || null;
          elementMatchedTokenName = _typoProp.matchedTokenName || null;
          // Token de estilo aplicado + fonte CAIXAstd = tipografia conforme ao DSC
          if (dsElement === false && _typoProp.styleKey) {
            const _family = (node.fontName && node.fontName !== figma.mixed) ? node.fontName.family : '';
            if (/caixa/i.test(_family)) dsElement = true;
          }
        }
      }

      // Pluck variant props from props[] into a separate flat list so the UI
      // can render them as pills in the card header (most relevant info for dev).
      const variants = props
        .filter(p => p.type === "variant")
        .map(p => ({ name: p.name, value: p.value }));

      const map = specs[category];
      if (!map.has(name)) {
        const itemObj = {
          name: name,
          type: category,
          nodeType: node.type,
          componentKey: componentKey,
          layerName: name,
          isDS: dsElement,
          score: elementScore,
          matchedBy: elementMatchedBy,
          matchedIn: elementMatchedIn,
          matchedTokenName: elementMatchedTokenName,
          variants: variants,
          nodeId: node.id,
          layers: new Set([name]),
          properties: props
        };
        map.set(name, itemObj);
        frameJson.elements[category].push({
          name: name,
          type: category,
          nodeType: node.type,
          componentKey: componentKey,
          layerName: name,
          isDS: dsElement,
          score: elementScore,
          matchedBy: elementMatchedBy,
          matchedIn: elementMatchedIn,
          matchedTokenName: elementMatchedTokenName,
          variants: variants,
          properties: props
        });
      } else {
        const item = map.get(name);
        item.layers.add(name);
      }
    }

    function extractSpecs(n, depth) {
      if ((depth || 0) > 8) return;
      // SKIP HIDDEN NODES
      if (n.visible === false) return;

      try {
        const props = extractNodeProperties(n);
        let category = "frames";

        const nameLower = n.name.toLowerCase();
        const isIcon = nameLower.includes("icon") || nameLower.includes("ic-") || 
                       (n.type === "INSTANCE" && n.width <= 32 && n.height <= 32 && !nameLower.includes("button"));

        if (n.type === "TEXT") {
          category = isIcon ? "icons" : "typography";
        } else if (n.type === "INSTANCE" || n.type === "COMPONENT") {
          category = isIcon ? "icons" : "components";
        } else if (n.type === "VECTOR" || n.type === "BOOLEAN_OPERATION" || n.type === "ELLIPSE" || n.type === "RECTANGLE") {
          category = isIcon ? "icons" : "vectors";
        } else if (n.type === "FRAME" || n.type === "GROUP" || n.type === "SECTION") {
          category = "frames";
        }

        addElement(category, n, props);

        if ('children' in n && n.children) {
          for (const child of n.children) {
            extractSpecs(child, (depth || 0) + 1);
          }
        }
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        const stack = err && err.stack ? err.stack : "";
        console.error("Erro ao extrair specs do node:", n.name, "(type=" + n.type + ", id=" + n.id + ")", msg, stack);
      }
    }

    for (const node of selection) {
      extractSpecs(node);
    }

    let framePreview = null;
    if (selection.length > 0 && 'exportAsync' in selection[0]) {
      try {
        framePreview = await selection[0].exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
      } catch (err) {
        console.error("Erro ao exportar preview do frame principal:", err);
      }
    }

    const previewPromises = [];
    const prepareListWithPreviews = async (map) => {
      const items = Array.from(map.values());
      for (const item of items) {
        if (item.nodeId) {
          const node = figma.getNodeById(item.nodeId);
          if (node && 'exportAsync' in node) {
            previewPromises.push(
              node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } })
                .then(bytes => { item.preview = bytes; })
                .catch(() => { item.preview = null; })
            );
          }
        }
      }
    };

    await prepareListWithPreviews(specs.components);
    await prepareListWithPreviews(specs.icons);
    await prepareListWithPreviews(specs.typography);
    await prepareListWithPreviews(specs.frames);
    await prepareListWithPreviews(specs.vectors);
    await Promise.all(previewPromises);

    const formatMap = (map) => {
      return Array.from(map.values())
        .map((item) => {
          const newItem = Object.assign({}, item);
          newItem.layers = Array.from(item.layers);
          return newItem;
        })
        .sort((a, b) => {
          if (a.isDS && !b.isDS) return -1;
          if (!a.isDS && b.isDS) return 1;
          return a.name.localeCompare(b.name);
        });
    };

    figma.ui.postMessage({
      type: "scan-result",
      frameId: _scanFrameId,
      data: {
        components: formatMap(specs.components),
        icons: formatMap(specs.icons),
        typography: formatMap(specs.typography),
        frames: formatMap(specs.frames),
        vectors: formatMap(specs.vectors),
        frameJson: frameJson,
        fileKey: figma.fileKey,
        framePreview: framePreview
      },
    });
  }

  if (msg.type === "get-selection-link") {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      const node = selection[0];
      const fileKey = figma.fileKey;
      const deeplink = fileKey
        ? `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(node.id)}`
        : '';
      figma.ui.postMessage({
        type: "selection-link",
        targetId: msg.targetId,
        linkName: node.name,
        nodeId: node.id,
        deeplink
      });
    } else {
      figma.ui.postMessage({
        type: "selection-link",
        targetId: msg.targetId,
        linkName: figma.root.name,
        nodeId: null,
        deeplink: ''
      });
    }
  }

  if (msg.type === "remove-measurement") {
    try {
      const node = figma.getNodeById(msg.nodeId);
      if (node) {
        node.remove();
        figma.notify("Medida removida.");
      } else {
        figma.notify("Elemento não encontrado (já removido?).");
      }
    } catch (e) {
      figma.notify("Erro ao remover: " + e.message);
    }
  }

  if (msg.type === "reapply-measurements") {
    const { frameId, measurements } = msg;
    const frameNode = figma.getNodeById(frameId);
    if (!frameNode) {
      figma.notify("Frame não encontrado no canvas.");
      return;
    }
    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) {}

      function _makeMeasLine(x1, y1, x2, y2, value, type, color) {
        const els = [];
        const line = figma.createLine();
        line.strokes = [{ type: "SOLID", color }];
        line.strokeWeight = 1;
        line.x = x1; line.y = y1;
        if (type === 'h') {
          line.resize(Math.max(0.01, x2 - x1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color }]; t1.x = x1; t1.y = y1 - 4; t1.resize(8, 0); t1.rotation = -90;
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color }]; t2.x = x2; t2.y = y1 - 4; t2.resize(8, 0); t2.rotation = -90;
          els.push(line, t1, t2);
        } else {
          line.rotation = -90;
          line.resize(Math.max(0.01, y2 - y1), 0);
          const t1 = figma.createLine(); t1.strokes = [{ type: "SOLID", color }]; t1.x = x1 - 4; t1.y = y1; t1.resize(8, 0);
          const t2 = figma.createLine(); t2.strokes = [{ type: "SOLID", color }]; t2.x = x1 - 4; t2.y = y2; t2.resize(8, 0);
          els.push(line, t1, t2);
        }
        const label = figma.createText();
        label.fontName = { family: "Inter", style: "Regular" };
        label.characters = String(Math.round(value));
        label.fontSize = 10;
        label.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        const bg = figma.createRectangle();
        bg.resize(label.width + 8, label.height + 4);
        bg.fills = [{ type: "SOLID", color }];
        bg.cornerRadius = 4;
        const mid = type === 'h' ? { x: (x1 + x2) / 2 - bg.width / 2, y: y1 - bg.height - 4 } : { x: x1 - bg.width - 6, y: (y1 + y2) / 2 - bg.height / 2 };
        bg.x = mid.x; bg.y = mid.y;
        label.x = mid.x + 4; label.y = mid.y + 2;
        els.push(bg, label);
        return els;
      }

      const red = { r: 1, g: 0.2, b: 0.2 };
      let created = 0;

      for (const m of measurements) {
        let target = null;
        // Try to find the element by name within the frame (first match)
        target = frameNode.findOne(n => n.name === m.name && n.type !== 'GROUP');
        if (!target) target = frameNode; // fallback to frame itself

        const bounds = target.absoluteBoundingBox;
        if (!bounds) continue;

        const items = [
          ..._makeMeasLine(bounds.x, bounds.y - 20, bounds.x + bounds.width, bounds.y - 20, bounds.width, 'h', red),
          ..._makeMeasLine(bounds.x + bounds.width + 10, bounds.y, bounds.x + bounds.width + 10, bounds.y + bounds.height, bounds.height, 'v', red)
        ];

        if (items.length > 0) {
          const group = figma.group(items, figma.currentPage);
          group.name = `[Medida] ${m.name}`;
          group.locked = true;
          created++;
        }
      }

      figma.notify(`${created} medida(s) reaplicada(s) no canvas!`);
    })();
  }

  if (msg.type === "request-spec-properties") {
    const properties = [];
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("Selecione um elemento para escaneá-lo.");
      figma.ui.postMessage({ type: "show-spec-properties", properties: [] });
      return;
    }

    const node = selection[0];
    const getVar = (p) => {
      if (!node.boundVariables) return null;
      const v = node.boundVariables[p];
      if (!v) return null;
      const id = Array.isArray(v) ? (v[0] && v[0].id) : v.id;
      if (!id) return null;
      const variable = figma.variables.getVariableById(id);
      return variable ? variable.name : null;
    };

    // 1. Dimensions
    if ("height" in node) {
      const token = getVar("height");
      properties.push({ key: "height", label: "Altura", value: Math.round(node.height) + "px", token });
    }
    if ("width" in node) {
      const token = getVar("width");
      properties.push({ key: "width", label: "Largura", value: Math.round(node.width) + "px", token });
    }

    // 2. Corner Radius
    if ("cornerRadius" in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
      const token = getVar("cornerRadius");
      properties.push({ key: "radius", label: "Raio de borda", value: node.cornerRadius + "px", token });
    }

    // 3. Auto Layout
    if ("layoutMode" in node && node.layoutMode !== "NONE") {
      properties.push({ key: "direction", label: "Direção", value: node.layoutMode === "HORIZONTAL" ? "Horizontal" : "Vertical" });

      const align = `${node.primaryAxisAlignItems} / ${node.counterAxisAlignItems}`;
      properties.push({ key: "alignment", label: "Alinhamento", value: align });

      if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) {
        const token = getVar("itemSpacing");
        properties.push({ key: "gap", label: "Espaçamento (Gap)", value: node.itemSpacing + "px", token });
      }

      const pt = node.paddingTop || 0, pr = node.paddingRight || 0, pb = node.paddingBottom || 0, pl = node.paddingLeft || 0;
      if (pt + pr + pb + pl > 0) {
        const tT = getVar("paddingTop"), tR = getVar("paddingRight"), tB = getVar("paddingBottom"), tL = getVar("paddingLeft");
        const vT = tT || `${pt}px`, vR = tR || `${pr}px`, vB = tB || `${pb}px`, vL = tL || `${pl}px`;
        let val, token;
        if (vT === vR && vR === vB && vB === vL) {
          val = vT;                           // todos iguais — mostra 1
        } else if (vT === vB && vR === vL) {
          val = `${vT} ${vR}`;               // simétrico V H
        } else {
          val = `${vT} ${vR} ${vB} ${vL}`;  // formato completo T R B L
        }
        // token: usa o primeiro token encontrado como referência
        token = tT || tR || tB || tL || null;
        properties.push({ key: "padding", label: "Padding", value: val, token });
      }
    }

    // 4. Colors & Strokes
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      const sf = node.fills.find(f => f.type === "SOLID");
      if (sf) {
        const token = getVar("fills");
        const hexFill = rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase();
        properties.push({ key: "fill", label: "Preenchimento", value: token || hexFill, token });
      }
    }
    if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      const ss = node.strokes.find(s => s.type === "SOLID");
      if (ss) {
        const token = getVar("strokes");
        const hexStroke = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
        properties.push({ key: "stroke", label: "Contorno", value: token || hexStroke, token });
      }
      if (node.strokeWeight !== figma.mixed && node.strokeWeight > 0) {
        properties.push({ key: "strokeWidth", label: "Espessura de borda", value: node.strokeWeight + "px" });
      }
    }

    // 5. Typography
    if (node.type === "TEXT") {
      if (node.fontName !== figma.mixed) {
        properties.push({ key: "fontFamily", label: "Família", value: node.fontName.family });
        properties.push({ key: "fontWeight", label: "Peso", value: node.fontName.style });
      }
      if (node.fontSize !== figma.mixed) {
        const token = getVar("fontSize");
        properties.push({ key: "fontSize", label: "Tamanho da fonte", value: node.fontSize + "px", token });
      }
    }

    // 6. Component Properties
    if (node.type === "INSTANCE" && node.mainComponent) {
      const variantProps = node.variantProperties;
      if (variantProps) {
        for (const [key, val] of Object.entries(variantProps)) {
          properties.push({ key: `variant-${key}`, label: `Prop: ${key}`, value: val });
        }
      }
    }

    figma.ui.postMessage({ type: "show-spec-properties", properties });
  }

  if (msg.type === "create-unified-spec") {
    (async () => {
      const opts = msg.opts;
      // Suporte a targetNodeId (spec gerada a partir de exceção de frame)
      let node = null;
      if (opts.targetNodeId) {
        node = figma.getNodeById(opts.targetNodeId);
      }
      if (!node) {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.notify("Selecione um elemento no canvas.");
          return;
        }
        node = selection[0];
      }

      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      // Convert hex color to rgb
      const hex = opts.color.replace("#", "");
      const cr = parseInt(hex.substring(0, 2), 16) / 255;
      const cg = parseInt(hex.substring(2, 4), 16) / 255;
      const cb = parseInt(hex.substring(4, 6), 16) / 255;
      const themeColor = { r: cr, g: cg, b: cb };

      // Semantic name prefix used throughout all nodes of this spec
      const _specBase = `[Spec/${opts.letter}] ${node.name}`;

      // Create Spec Card
      const specCard = figma.createFrame();
      specCard.name = `${_specBase}/Ficha`;
      specCard.layoutMode = "VERTICAL";
      specCard.paddingLeft = 16;
      specCard.paddingRight = 16;
      specCard.paddingTop = 16;
      specCard.paddingBottom = 16;
      specCard.itemSpacing = 12;
      specCard.cornerRadius = 8;
      specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      specCard.strokes = [{ type: "SOLID", color: themeColor }];
      specCard.strokeWeight = 1.5;
      specCard.primaryAxisSizingMode = "AUTO";
      specCard.counterAxisSizingMode = "AUTO";

      // Header row with Tag
      const headerRow = figma.createFrame();
      headerRow.layoutMode = "HORIZONTAL";
      headerRow.itemSpacing = 8;
      headerRow.fills = [];
      headerRow.primaryAxisSizingMode = "AUTO";
      headerRow.counterAxisSizingMode = "AUTO";

      const tagCircle = figma.createFrame();
      tagCircle.name = `${_specBase}/Tag`;
      tagCircle.layoutMode = "HORIZONTAL";
      tagCircle.primaryAxisSizingMode = "FIXED";
      tagCircle.counterAxisSizingMode = "FIXED";
      tagCircle.resize(42, 42);
      tagCircle.cornerRadius = 8;
      tagCircle.fills = [{ type: "SOLID", color: themeColor }];
      tagCircle.primaryAxisAlignItems = "CENTER";
      tagCircle.counterAxisAlignItems = "CENTER";
      const tagText = figma.createText();
      tagText.fontName = { family: "Inter", style: "Bold" };
      tagText.fontSize = 18;
      tagText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      tagText.characters = opts.letter;
      tagCircle.appendChild(tagText);
      headerRow.appendChild(tagCircle);

      headerRow.counterAxisAlignItems = "CENTER";

      const title = figma.createText();
      title.fontName = { family: "Inter", style: "Bold" };
      title.fontSize = 12;
      title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
      title.characters = node.name;
      headerRow.appendChild(title);
      specCard.appendChild(headerRow);

      if (opts.categoryLabel) {
        const pill = figma.createFrame();
        pill.name = `${_specBase}/Categoria/${opts.categoryLabel}`;
        pill.layoutMode = "HORIZONTAL";
        pill.paddingLeft = 8; pill.paddingRight = 8;
        pill.paddingTop = 4; pill.paddingBottom = 4;
        pill.cornerRadius = 12;
        pill.primaryAxisSizingMode = "AUTO";
        pill.counterAxisSizingMode = "AUTO";
        pill.fills = [];
        pill.strokes = [{ type: "SOLID", color: themeColor }];
        const pillText = figma.createText();
        pillText.fontName = { family: "Inter", style: "Medium" };
        pillText.fontSize = 10;
        pillText.fills = [{ type: "SOLID", color: themeColor }];
        pillText.characters = opts.categoryLabel;
        pill.appendChild(pillText);
        specCard.appendChild(pill);
      }


      if (opts.note) {
        const desc = figma.createText();
        desc.fontName = { family: "Inter", style: "Regular" };
        desc.fontSize = 11;
        desc.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
        desc.characters = opts.note;
        desc.textAutoResize = "WIDTH_AND_HEIGHT";
        specCard.appendChild(desc);
      }

      // Add properties list
      if (opts.properties && opts.properties.length > 0) {
        const propsFrame = figma.createFrame();
        propsFrame.layoutMode = "VERTICAL";
        propsFrame.itemSpacing = 4;
        propsFrame.fills = [];
        propsFrame.primaryAxisSizingMode = "AUTO";
        propsFrame.counterAxisSizingMode = "AUTO";
        propsFrame.name = `${_specBase}/Propriedades`;
        propsFrame.layoutAlign = "INHERIT";

        opts.properties.forEach(p => {
          const row = figma.createFrame();
          row.name = `${_specBase}/Prop/${p.label}`;
          row.layoutMode = "HORIZONTAL";
          row.itemSpacing = 12;
          row.fills = [];
          row.primaryAxisSizingMode = "AUTO";
          row.counterAxisSizingMode = "AUTO";
          row.layoutAlign = "INHERIT";
          row.counterAxisAlignItems = "CENTER";

          const pLabel = figma.createText();
          pLabel.fontName = { family: "Inter", style: "Medium" };
          pLabel.fontSize = 10;
          pLabel.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } }];
          pLabel.characters = p.label.toUpperCase();
          pLabel.textAutoResize = "WIDTH_AND_HEIGHT";

          const pVal = figma.createText();
          pVal.fontName = { family: "Inter", style: "Bold" };
          pVal.fontSize = 11;
          pVal.fills = [{ type: "SOLID", color: p.token ? themeColor : { r: 0.1, g: 0.1, b: 0.1 } }];
          pVal.characters = p.token || String(p.value);
          pVal.textAutoResize = "WIDTH_AND_HEIGHT";

          row.appendChild(pLabel);
          row.appendChild(pVal);

          propsFrame.appendChild(row);
        });
        specCard.appendChild(propsFrame);
      }

      // Exceções mapeadas para esta spec
      const specExcecoes = opts.excecoes || [];
      if (specExcecoes.length > 0) {
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        const excFrame = figma.createFrame();
        excFrame.layoutMode = "VERTICAL";
        excFrame.itemSpacing = 6;
        excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
        excFrame.paddingLeft = 10; excFrame.paddingRight = 10;
        excFrame.paddingTop = 8; excFrame.paddingBottom = 8;
        excFrame.cornerRadius = 6;
        excFrame.primaryAxisSizingMode = "AUTO";
        excFrame.counterAxisSizingMode = "AUTO";
        const excTitle = figma.createText();
        excTitle.fontName = { family: "Inter", style: "Bold" };
        excTitle.fontSize = 9;
        excTitle.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
        excTitle.characters = `CENÁRIOS DE EXCEÇÃO (${specExcecoes.length})`;
        excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
        excFrame.appendChild(excTitle);
        const _excTypeRgb = {
          'Erro':        { r: 0.80, g: 0.15, b: 0.15 },
          'Alerta':      { r: 0.80, g: 0.50, b: 0.00 },
          'Sucesso':     { r: 0.10, g: 0.55, b: 0.25 },
          'Confirmação': { r: 0.05, g: 0.35, b: 0.80 },
        };
        specExcecoes.forEach(exc => {
          const excRow = figma.createFrame();
          excRow.layoutMode = "HORIZONTAL";
          excRow.itemSpacing = 6;
          excRow.fills = [];
          excRow.primaryAxisSizingMode = "AUTO";
          excRow.counterAxisSizingMode = "AUTO";
          excRow.counterAxisAlignItems = "CENTER";
          const typeColor = _excTypeRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 };
          const typeLabel = figma.createText();
          typeLabel.fontName = { family: "Inter", style: "Bold" };
          typeLabel.fontSize = 9;
          typeLabel.fills = [{ type: "SOLID", color: typeColor }];
          typeLabel.characters = (exc.tipo || 'GERAL').toUpperCase();
          typeLabel.textAutoResize = "WIDTH_AND_HEIGHT";
          const titleLabel = figma.createText();
          titleLabel.fontName = { family: "Inter", style: "Regular" };
          titleLabel.fontSize = 10;
          titleLabel.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
          titleLabel.characters = `${exc.titulo || ''}${exc.notas ? ' — ' + exc.notas : ''}`;
          titleLabel.textAutoResize = "WIDTH_AND_HEIGHT";
          excRow.appendChild(typeLabel);
          excRow.appendChild(titleLabel);
          excFrame.appendChild(excRow);
        });
        specCard.appendChild(excFrame);
      }

      // Add link after title/properties
      if (opts.link) {
        const linkTxt = figma.createText();
        linkTxt.fontName = { family: "Inter", style: "Regular" };
        linkTxt.fontSize = 11;
        linkTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0.4, b: 0.8 } }];
        linkTxt.characters = "Link: " + opts.link;
        linkTxt.textAutoResize = "HEIGHT";
        linkTxt.resize(220, 20);
        specCard.appendChild(linkTxt);
      }

      // Group variables
      let groupNodes = [];

      // Positioning
      const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
      if (bounds) {
        // Draw a dotted highlight frame around the node
        const contour = figma.createFrame();
        contour.name = `${_specBase}/Destaque`;
        contour.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));

        // Append first, then set absolute coordinates to avoid origin issues
        figma.currentPage.appendChild(contour);
        contour.x = bounds.x - 16;
        contour.y = bounds.y - 16;

        contour.fills = [];
        contour.strokes = [{ type: "SOLID", color: themeColor }];
        contour.strokeWeight = 2;
        contour.dashPattern = [4, 4];
        contour.locked = true;

        // Tag chip on contour
        const chip = figma.createFrame();
        chip.layoutMode = "HORIZONTAL";
        chip.primaryAxisSizingMode = "FIXED";
        chip.counterAxisSizingMode = "FIXED";
        chip.resize(42, 42);
        chip.cornerRadius = 8;
        chip.fills = [{ type: "SOLID", color: themeColor }];
        chip.primaryAxisAlignItems = "CENTER";
        chip.counterAxisAlignItems = "CENTER";
        const chipText = figma.createText();
        chipText.fontName = { family: "Inter", style: "Bold" };
        chipText.fontSize = 18;
        chipText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        chipText.characters = opts.letter;
        chip.appendChild(chipText);
        contour.appendChild(chip);
        chip.x = 0;
        chip.y = 0;

        groupNodes.push(contour);

        // Append card to page first so Figma computes its real dimensions
        figma.currentPage.appendChild(specCard);

        // Posicionamento: sempre à direita — mesma letra empilha, letra nova cria coluna.
        // Busca nos filhos diretos da página (spec groups são sempre criados na raiz).
        const _specLetter = opts.letter;
        const _existingSpecCards = [];
        figma.currentPage.children.forEach(n => {
          if (n.type === 'GROUP' && n.name.startsWith('[Spec]')) {
            const ficha = n.children && n.children.find(c =>
              c.type === 'FRAME' && c.name.includes('/Ficha') && c !== specCard
            );
            if (ficha) _existingSpecCards.push(ficha);
          } else if (n.type === 'FRAME' && /^\[Spec\/[A-Z]\]/.test(n.name) && n.name.includes('/Ficha') && n !== specCard) {
            _existingSpecCards.push(n);
          }
        });

        // Agrupa por letra: { letter → { x, topY, bottom, right } }
        const _letterMap = {};
        _existingSpecCards.forEach(card => {
          const m = card.name.match(/^\[Spec\/([A-Z])\]/);
          if (!m) return;
          const l = m[1];
          const bb = card.absoluteBoundingBox;
          if (!bb) return;
          if (!_letterMap[l]) _letterMap[l] = { x: bb.x, topY: bb.y, bottom: bb.y + bb.height, right: bb.x + bb.width };
          const bottom = bb.y + bb.height;
          if (bottom > _letterMap[l].bottom) _letterMap[l].bottom = bottom;
          if (bb.x + bb.width > _letterMap[l].right) _letterMap[l].right = bb.x + bb.width;
          if (bb.x < _letterMap[l].x) _letterMap[l].x = bb.x;
          if (bb.y < _letterMap[l].topY) _letterMap[l].topY = bb.y;
        });

        const _SPEC_GAP = 40;
        const _SPEC_COL_GAP = 80;
        let targetX, targetY;

        if (_letterMap[_specLetter]) {
          // Mesma letra: empilha abaixo do último card desta coluna
          targetX = _letterMap[_specLetter].x;
          targetY = _letterMap[_specLetter].bottom + _SPEC_GAP;
        } else if (Object.keys(_letterMap).length > 0) {
          // Nova letra: nova coluna à direita da coluna mais à direita
          const _rightmost = Object.values(_letterMap).reduce((max, v) => v.right > max.right ? v : max);
          targetX = _rightmost.right + _SPEC_COL_GAP;
          targetY = _rightmost.topY;
        } else {
          // Primeira spec: sempre à direita do elemento selecionado
          targetX = bounds.x + bounds.width + 100;
          targetY = bounds.y;
        }

        specCard.x = Math.round(targetX);
        specCard.y = Math.round(targetY);
        groupNodes.push(specCard);

        // --- Conector: sempre do lado direito do nó ao lado esquerdo do card ---
        const connector = figma.createVector();
        connector.name = `${_specBase}/Conector`;

        const startPt = { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
        const endPt   = { x: specCard.x, y: specCard.y + Math.min(40, specCard.height / 2) };
        connector.vectorPaths = [{ windingRule: "NONZERO", data: `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}` }];
        connector.strokes = [{ type: "SOLID", color: themeColor }];
        connector.strokeWeight = 1.5;
        connector.dashPattern = [4, 4];
        connector.strokeCap = "ROUND";
        figma.currentPage.appendChild(connector);
        groupNodes.push(connector);

      } else {
        figma.currentPage.appendChild(specCard);
        specCard.x = figma.viewport.center.x;
        specCard.y = figma.viewport.center.y;
        groupNodes.push(specCard);
      }

      // Always create group at the Page level to avoid nesting in selected components
      const specGroup = figma.group(groupNodes, figma.currentPage);
      specGroup.name = `[Spec] ${node.name}`;
      specGroup.locked = true; 


      figma.ui.postMessage({
        type: "spec-created",
        spec: {
          id: specGroup.id, // Group ID instead of Card ID so hiding hides everything
          targetNodeId: node.id,
          name: node.name,
          letter: opts.letter,
          color: opts.color,
          type: opts.categoryLabel || "Sem categoria",
          note: opts.note,
          properties: opts.properties
        }
      });

      figma.notify("Especificação criada com sucesso!");
    })();
  }

  if (msg.type === "highlight-node") {
    // Remove qualquer highlight anterior se existir
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }

    const node = figma.getNodeById(msg.id);
    if (node && node.visible && _nodeOnCurrentPage(node)) {
      figma.currentPage.selection = [node];
      if (msg.shouldScroll !== false) {
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    }
  }

  if (msg.type === "hide-node") {
    const node = figma.getNodeById(msg.id);
    if (node) {
      if (msg.forceState !== undefined) {
        node.visible = msg.forceState;
      } else {
        node.visible = false;
      }
    }
  }

  if (msg.type === "show-node") {
    const node = figma.getNodeById(msg.id);
    if (node) node.visible = true;
  }

  if (msg.type === 'rename-node') {
    const node = figma.getNodeById(msg.id);
    if (node) {
      node.name = msg.name;
      // Se for um grupo ou frame, tenta encontrar um texto interno para atualizar também
      if (node.type === 'GROUP' || node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
        const textNode = node.findOne(n => n.type === 'TEXT');
        if (textNode) {
          (async () => {
            try {
              await figma.loadFontAsync(textNode.fontName);
              textNode.characters = msg.name;
              // Reposicionar texto se houver um fundo (losango, círculo, etc)
              const bg = node.findOne(n => n.type === 'POLYGON' || n.type === 'ELLIPSE' || n.type === 'RECTANGLE' || n.type === 'STAR' || n.type === 'VECTOR');
              if (bg) {
                textNode.x = bg.x + (bg.width / 2) - (textNode.width / 2);
                textNode.y = bg.y + (bg.height / 2) - (textNode.height / 2);
              }
            } catch (err) {
              console.error("Erro ao carregar fonte para renomear:", err);
            }
          })();
        }
      }
    }
  }

  if (msg.type === "inject-obs-to-spec") {
    (async () => {
      try {
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        const specNode = figma.getNodeById(msg.specNodeId);
        if (!specNode) { figma.notify("Frame de spec não encontrado", { error: true }); return; }

        const obsFrame = figma.createFrame();
        obsFrame.name = `[Obs] ${msg.tipo || 'Exceção'}`;
        obsFrame.layoutMode = "VERTICAL";
        obsFrame.paddingLeft = 10; obsFrame.paddingRight = 10;
        obsFrame.paddingTop = 8; obsFrame.paddingBottom = 8;
        obsFrame.itemSpacing = 4;
        obsFrame.primaryAxisSizingMode = "AUTO";
        obsFrame.counterAxisSizingMode = "AUTO";
        obsFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.97, b: 0.91 } }];
        obsFrame.strokes = [{ type: "SOLID", color: { r: 0.98, g: 0.70, b: 0.30 } }];
        obsFrame.strokeWeight = 1;
        obsFrame.cornerRadius = 8;

        const labelText = figma.createText();
        labelText.fontName = { family: "Inter", style: "Bold" };
        labelText.characters = `Obs · ${msg.tipo || 'Exceção'}: ${msg.titulo || ''}`;
        labelText.fontSize = 10;
        labelText.fills = [{ type: "SOLID", color: { r: 0.72, g: 0.39, b: 0.0 } }];
        obsFrame.appendChild(labelText);

        const obsText = figma.createText();
        obsText.fontName = { family: "Inter", style: "Regular" };
        obsText.characters = msg.obs;
        obsText.fontSize = 11;
        obsText.fills = [{ type: "SOLID", color: { r: 0.25, g: 0.25, b: 0.25 } }];
        obsFrame.appendChild(obsText);

        const parent = specNode.parent || figma.currentPage;
        parent.appendChild(obsFrame);
        obsFrame.x = specNode.x;
        obsFrame.y = (specNode.y || 0) + (specNode.height || 0) + 8;
        figma.notify("Observação injetada no canvas");
      } catch (e) {
        figma.notify("Erro ao injetar observação: " + e.message, { error: true });
      }
    })();
  }

  if (msg.type === "delete-node") {
    const node = figma.getNodeById(msg.id);
    if (node) {
      node.remove();
      figma.notify("Item excluído com sucesso");
    }
    // Remove também o highlight temporário se estiver ativo
    if (activeHighlightNode) {
      try { activeHighlightNode.remove(); } catch (e) { }
      activeHighlightNode = null;
    }
  }

  if (msg.type === 'save-storage') {
    figma.clientStorage.setAsync('handoffData', msg.data).catch(err => {
      console.warn("Storage save failed (possibly missing plugin ID in manifest):", err);
    });
    _writeSharedPluginData(msg.data);
  }

  if (msg.type === 'focus-node') {
    const node = figma.getNodeById(msg.id);
    if (node && _nodeOnCurrentPage(node)) {
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
    }
  }

  if (msg.type === 'resize-ui') {
    figma.ui.resize(msg.width, msg.height);
  }

  if (msg.type === "export-design-data") {
    // Generate a simple CSV or handle basic data extraction. 
    // In Figma plugins, we generally extract the data and send it back to UI to trigger download.
    const nodes = figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
    let data = "Node Name, Type, Width, Height\n";
    nodes.forEach(n => {
      data += `${n.name.replace(/,/g, '')},${n.type},${n.width || 0},${n.height || 0}\n`;
    });
    figma.ui.postMessage({ type: 'design-data-exported', data: data, format: msg.format });
  }

  if (msg.type === "create-flow-connection") {
    const selection = figma.currentPage.selection;
    const isEvent = msg.flowType === "event_start" || msg.flowType === "event_end";

    if (!isEvent && selection.length !== 2) {
      figma.notify("Selecione exatamente dois elementos para conectar.");
      return;
    }
    if (isEvent && selection.length === 0) {
      figma.notify("Selecione pelo menos um elemento.");
      return;
    }

    let nodeA = selection[0];
    let nodeB = selection[1] || null;
    let boundsA = nodeA.absoluteBoundingBox || nodeA.absoluteRenderBounds;
    let boundsB = nodeB ? (nodeB.absoluteBoundingBox || nodeB.absoluteRenderBounds) : null;

    if (!isEvent && boundsB && (!msg.flowSide || msg.flowSide === 'auto')) {
      const cAx = boundsA.x + boundsA.width / 2, cAy = boundsA.y + boundsA.height / 2;
      const cBx = boundsB.x + boundsB.width / 2, cBy = boundsB.y + boundsB.height / 2;
      const adx = Math.abs(cBx - cAx), ady = Math.abs(cBy - cAy);
      const shouldSwap = adx >= ady ? (cBx < cAx) : (cBy < cAy);
      if (shouldSwap) { [nodeA, nodeB] = [nodeB, nodeA]; [boundsA, boundsB] = [boundsB, boundsA]; }
    }

    const getEdgePoints = (b) => ({
      top:    { x: b.x + b.width / 2,  y: b.y,              side: 'top'    },
      bottom: { x: b.x + b.width / 2,  y: b.y + b.height,   side: 'bottom' },
      left:   { x: b.x,                y: b.y + b.height / 2, side: 'left'  },
      right:  { x: b.x + b.width,      y: b.y + b.height / 2, side: 'right' }
    });

    const pointsA = getEdgePoints(boundsA);
    let bestA, bestB;

    if (msg.flowType === "event_start")      bestA = pointsA.left;
    else if (msg.flowType === "event_end")   bestA = pointsA.right;
    else if (msg.flowSide && msg.flowSide !== 'auto' && pointsA[msg.flowSide]) bestA = pointsA[msg.flowSide];

    if (nodeB && boundsB) {
      const pointsB = getEdgePoints(boundsB);
      if (!bestA) {
        const cAx = boundsA.x + boundsA.width / 2, cAy = boundsA.y + boundsA.height / 2;
        const cBx = boundsB.x + boundsB.width / 2, cBy = boundsB.y + boundsB.height / 2;
        const dx = cBx - cAx, dy = cBy - cAy;

        // Se os frames não se sobrepõem horizontalmente â†’ estão lado a lado â†’ rightâ†”left
        const noOverlapH = boundsA.x + boundsA.width <= boundsB.x || boundsB.x + boundsB.width <= boundsA.x;
        // Se os frames não se sobrepõem verticalmente â†’ estão empilhados â†’ bottomâ†”top
        const noOverlapV = boundsA.y + boundsA.height <= boundsB.y || boundsB.y + boundsB.height <= boundsA.y;

        if (noOverlapH) {
          // Lado a lado: sempre horizontal, independente da distância dos centros
          bestA = dx >= 0 ? pointsA.right  : pointsA.left;
          bestB = dx >= 0 ? pointsB.left   : pointsB.right;
        } else if (noOverlapV) {
          // Empilhados: sempre vertical
          bestA = dy >= 0 ? pointsA.bottom : pointsA.top;
          bestB = dy >= 0 ? pointsB.top    : pointsB.bottom;
        } else {
          // Sobreposição em ambos os eixos: usar direção dominante dos centros
          if (Math.abs(dx) >= Math.abs(dy)) { bestA = dx >= 0 ? pointsA.right : pointsA.left; bestB = dx >= 0 ? pointsB.left : pointsB.right; }
          else                              { bestA = dy >= 0 ? pointsA.bottom : pointsA.top;  bestB = dy >= 0 ? pointsB.top : pointsB.bottom; }
        }
      } else {
        let minDist = Infinity;
        for (const pB of Object.values(pointsB)) {
          const d = Math.sqrt(Math.pow(bestA.x - pB.x, 2) + Math.pow(bestA.y - pB.y, 2));
          if (d < minDist) { minDist = d; bestB = pB; }
        }
      }
    } else {
      if (msg.flowType === "event_start")     { bestA = pointsA.left;  bestB = { x: bestA.x - 60, y: bestA.y }; }
      else if (msg.flowType === "event_end")  { bestA = pointsA.right; bestB = { x: bestA.x + 60, y: bestA.y }; }
      else {
        bestA = bestA || pointsA.right;
        const offset = 40;
        bestB = { x: bestA.x, y: bestA.y };
        if (bestA.side === 'top') bestB.y -= offset;
        else if (bestA.side === 'bottom') bestB.y += offset;
        else if (bestA.side === 'left')   bestB.x -= offset;
        else bestB.x += offset;
      }
    }

    const strokeColor = { r: 0.12, g: 0.16, b: 0.23 };
    const line = figma.createVector();
    line.name = `Handex/Fluxo/Linha`;
    figma.currentPage.appendChild(line);
    line.x = 0; line.y = 0;
    line.strokes = [{ type: "SOLID", color: strokeColor }];
    line.strokeWeight = 2;
    if (msg.flowType === "line_dashed" || msg.flowType === "diamond_dashed") line.dashPattern = [6, 4];
    line.vectorPaths = [{ windingRule: "NONZERO", data: `M ${bestA.x} ${bestA.y} L ${bestB.x} ${bestB.y}` }];

    let nodesToGroup = [line];

    if (msg.flowType !== "event_start") {
      const angle = Math.atan2(bestB.y - bestA.y, bestB.x - bestA.x);
      const arrowSize = 8;
      const arrow = figma.createVector();
      figma.currentPage.appendChild(arrow);
      arrow.x = 0; arrow.y = 0;
      arrow.strokes = [{ type: "SOLID", color: strokeColor }];
      arrow.strokeWeight = 2; arrow.strokeCap = "ROUND"; arrow.strokeJoin = "ROUND";
      const x1 = bestB.x - arrowSize * Math.cos(angle - Math.PI / 6);
      const y1 = bestB.y - arrowSize * Math.sin(angle - Math.PI / 6);
      const x2 = bestB.x - arrowSize * Math.cos(angle + Math.PI / 6);
      const y2 = bestB.y - arrowSize * Math.sin(angle + Math.PI / 6);
      arrow.vectorPaths = [{ windingRule: "NONZERO", data: `M ${x1} ${y1} L ${bestB.x} ${bestB.y} L ${x2} ${y2}` }];
      nodesToGroup.push(arrow);
    }

    if (msg.flowType === "diamond" || msg.flowType === "diamond_dashed") {
      const midX = (bestA.x + bestB.x) / 2, midY = (bestA.y + bestB.y) / 2;
      const size = 64, halfSize = size / 2;
      const shape = figma.createVector();
      figma.currentPage.appendChild(shape);
      shape.x = 0; shape.y = 0;
      shape.vectorPaths = [{ windingRule: "NONZERO", data: `M ${midX} ${midY - halfSize} L ${midX + halfSize} ${midY} L ${midX} ${midY + halfSize} L ${midX - halfSize} ${midY} Z` }];
      shape.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      shape.strokes = [{ type: "SOLID", color: strokeColor }];
      shape.strokeWeight = 2;
      if (msg.flowType === "diamond_dashed") shape.dashPattern = [6, 4];
      (async () => {
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
          const symbol = figma.createText();
          figma.currentPage.appendChild(symbol);
          symbol.fontName = { family: "Inter", style: "Bold" };
          symbol.characters = msg.decisionText || "IF";
          symbol.fontSize = 11;
          symbol.textAlignHorizontal = "CENTER"; symbol.textAlignVertical = "CENTER";
          symbol.fills = [{ type: "SOLID", color: strokeColor }];
          symbol.resize(size * 0.8, symbol.height);
          symbol.x = midX - symbol.width / 2; symbol.y = midY - symbol.height / 2;
          nodesToGroup.push(shape, symbol);
          const finalGroup = figma.group(nodesToGroup, figma.currentPage);
          finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || "Decisão"}`;
          finalGroup.locked = true;
          figma.ui.postMessage({ type: 'flow-created', flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
        } catch (e) { console.error(e); }
      })();
    } else if (isEvent) {
      const isStart = msg.flowType === "event_start";
      const circle = figma.createEllipse();
      figma.currentPage.appendChild(circle);
      circle.resize(48, 48);
      circle.x = bestB.x - 24; circle.y = bestB.y - 24;
      circle.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      circle.strokes = [{ type: "SOLID", color: isStart ? { r: 0.13, g: 0.6, b: 0.3 } : { r: 0.86, g: 0.1, b: 0.1 } }];
      circle.strokeWeight = isStart ? 2 : 4;
      (async () => {
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
          const label = figma.createText();
          figma.currentPage.appendChild(label);
          label.fontName = { family: "Inter", style: "Bold" };
          label.characters = isStart ? "INÍCIO" : "FIM";
          label.fontSize = 8;
          label.textAlignHorizontal = "CENTER"; label.textAlignVertical = "CENTER";
          label.fills = circle.strokes;
          label.x = circle.x + circle.width / 2 - label.width / 2;
          label.y = circle.y + circle.height / 2 - label.height / 2;
          nodesToGroup.push(circle, label);
          const finalGroup = figma.group(nodesToGroup, figma.currentPage);
          finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || (isStart ? "Início" : "Fim")}`;
          finalGroup.locked = true;
          figma.ui.postMessage({ type: 'flow-created', flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
        } catch (e) { console.error(e); }
      })();
    } else if (msg.decisionText && (msg.flowType === "line_solid" || msg.flowType === "line_dashed")) {
      const midX = (bestA.x + bestB.x) / 2, midY = (bestA.y + bestB.y) / 2;
      (async () => {
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
          const textNode = figma.createText();
          textNode.name = "Texto";
          textNode.fontName = { family: "Inter", style: "Bold" };
          textNode.characters = msg.decisionText;
          textNode.fontSize = 10;
          textNode.textAlignHorizontal = "CENTER"; textNode.textAlignVertical = "CENTER";
          textNode.fills = [{ type: "SOLID", color: strokeColor }];
          const paddingH = 8, paddingV = 4;
          const chipBg = figma.createRectangle();
          figma.currentPage.appendChild(chipBg);
          chipBg.name = "Fundo";
          chipBg.resize(textNode.width + paddingH * 2, textNode.height + paddingV * 2);
          chipBg.cornerRadius = 6;
          chipBg.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
          chipBg.strokes = [{ type: "SOLID", color: strokeColor }]; chipBg.strokeWeight = 1;
          chipBg.x = midX - chipBg.width / 2; chipBg.y = midY - chipBg.height / 2;
          figma.currentPage.appendChild(textNode);
          textNode.x = chipBg.x + paddingH; textNode.y = chipBg.y + paddingV;
          nodesToGroup.push(chipBg, textNode);
          const finalGroup = figma.group(nodesToGroup, figma.currentPage);
          finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || "Conexão"}`;
          finalGroup.locked = true;
          figma.ui.postMessage({ type: 'flow-created', flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
        } catch (e) { console.error(e); }
      })();
    } else {
      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || "Conexão"}`;
      finalGroup.locked = true;
      figma.ui.postMessage({ type: 'flow-created', flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
    }
    figma.notify("Fluxo criado!");
  }

  if (msg.type === "create-legend") {
    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      const legendFrame = figma.createFrame();
      legendFrame.name = "Handex/Fluxo/Legendas";
      legendFrame.layoutMode = "VERTICAL";
      legendFrame.paddingLeft = 20;
      legendFrame.paddingRight = 20;
      legendFrame.paddingTop = 20;
      legendFrame.paddingBottom = 20;
      legendFrame.itemSpacing = 16;
      legendFrame.cornerRadius = 12;
      legendFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
      legendFrame.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
      legendFrame.strokeWeight = 1;
      legendFrame.primaryAxisSizingMode = "AUTO";
      legendFrame.counterAxisSizingMode = "AUTO";

      // Title
      const legendTitle = figma.createText();
      legendTitle.fontName = { family: "Inter", style: "Bold" };
      legendTitle.characters = "Legendas de Especificação";
      legendTitle.fontSize = 14;
      legendTitle.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
      legendFrame.appendChild(legendTitle);

      const types = [
        { name: "Cenário de exceção", c: { r: 0.97, g: 0.45, b: 0.08 } },
        { name: "Informação extra", c: { r: 0.05, g: 0.64, b: 0.91 } },
        { name: "Comportamento", c: { r: 0.92, g: 0.28, b: 0.60 } },
        { name: "Regra de Negócio", c: { r: 0.02, g: 0.71, b: 0.82 } },
        { name: "Dados da API", c: { r: 0.51, g: 0.80, b: 0.08 } }
      ];

      for (const t of types) {
        const row = figma.createFrame();
        row.layoutMode = "HORIZONTAL";
        row.itemSpacing = 12;
        row.counterAxisAlignItems = "CENTER";
        row.primaryAxisSizingMode = "AUTO";
        row.counterAxisSizingMode = "AUTO";
        row.fills = [];

        const circle = figma.createEllipse();
        circle.resize(16, 16);
        circle.fills = [{ type: "SOLID", color: t.c }];
        circle.strokes = [];

        const text = figma.createText();
        text.fontName = { family: "Inter", style: "Medium" };
        text.characters = t.name;
        text.fontSize = 12;
        text.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];

        row.appendChild(circle);
        row.appendChild(text);
        legendFrame.appendChild(row);
      }

      legendFrame.x = figma.viewport.center.x - 120;
      legendFrame.y = figma.viewport.center.y - 100;
      legendFrame.locked = true;
      figma.currentPage.appendChild(legendFrame);
      figma.currentPage.selection = [legendFrame];
      figma.viewport.scrollAndZoomIntoView([legendFrame]);
      figma.notify("Legenda criada!");
    })();
  }


  if (msg.type === 'pull-briefing-from-canvas') {
    const briefingFrame = figma.currentPage.findOne(n => n.type === 'FRAME' && n.name === 'Briefing Estruturado');
    if (!briefingFrame) {
      figma.ui.postMessage({ type: 'briefing-data-pulled', data: [] });
      return;
    }

    const data = [];
    let currentHeader = null;

    const texts = briefingFrame.findAll(n => n.type === 'TEXT');
    for (const child of texts) {
      const style = child.fontName.style || '';
      if (style.includes('Bold') || style.includes('SemiBold') || style.includes('Black')) {
        currentHeader = child.characters;
      } else if (style.includes('Regular') && currentHeader) {
        if (child.characters.trim().length > 0 && child.characters.trim() !== 'Clique para adicionar...') {
          data.push({ category: "Importado do Canvas", question: currentHeader, answer: child.characters });
        }
        currentHeader = null; 
      }
    }

    figma.ui.postMessage({ type: 'briefing-data-pulled', data });
    return;
  }

  // â”€â”€â”€ INJECT FRAMEWORK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (msg.type === 'inject-framework') {
    (async () => {
      for (const font of [
        { family: "Inter", style: "Regular" },
        { family: "Inter", style: "Medium" },
        { family: "Inter", style: "Bold" }
      ]) {
        try { await figma.loadFontAsync(font); } catch(e) {}
      }

      const CAIXA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631"><g transform="translate(-284.78446,-475.51214)"><g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)"><g transform="scale(0.24,0.24)"><path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/></g></g></g></svg>`;

      const mkLogo = (h) => {
        try {
          const n = figma.createNodeFromSvg(CAIXA_SVG);
          n.name = "CAIXA Logo";
          n.resize(Math.round(h * 205.51 / 46.55), h);
          return n;
        } catch(e) {
          const t = tx("CAIXA", Math.round(h * 0.6), "Bold", C.blue);
          return t;
        }
      };

      const mkHeader = (title) => {
        const bar = figma.createFrame();
        bar.layoutMode = "HORIZONTAL";
        bar.paddingLeft = bar.paddingRight = 16;
        bar.paddingTop = bar.paddingBottom = 14;
        bar.itemSpacing = 12;
        bar.primaryAxisSizingMode = "AUTO";
        bar.counterAxisSizingMode = "AUTO";
        bar.layoutAlign = "STRETCH";
        bar.counterAxisAlignItems = "CENTER";
        bar.fills = [{ type: "SOLID", color: C.bgBlue }];
        bar.appendChild(mkLogo(20));
        bar.appendChild(tx("|", 14, "Regular", C.blueDark));
        bar.appendChild(tx(title, 14, "Bold", C.blueDark));
        return bar;
      };

      const mkCanvas = (h, fill) => {
        const c = figma.createFrame();
        c.resize(100, h);
        c.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        c.layoutAlign = "STRETCH";
        return c;
      };

      const C = {
        blue:      { r: 0,     g: 0.439, b: 0.686 },
        blueDark:  { r: 0,     g: 0.247, b: 0.478 },
        blueLight: { r: 0.910, g: 0.957, b: 0.980 },
        orange:    { r: 0.965, g: 0.510, b: 0.165 },
        teal:      { r: 0.298, g: 0.745, b: 0.714 },
        tealLight: { r: 0.851, g: 0.961, b: 0.957 },
        lime:      { r: 0.831, g: 0.969, b: 0.188 },
        yellow:    { r: 1,     g: 0.949, b: 0.749 },
        white:     { r: 1,     g: 1,     b: 1     },
        bg:        { r: 0.941, g: 0.953, b: 0.969 },
        bgBlue:    { r: 0.910, g: 0.957, b: 0.980 },
        line:      { r: 0.882, g: 0.894, b: 0.910 },
        text:      { r: 0.118, g: 0.161, b: 0.231 },
        muted:     { r: 0.392, g: 0.455, b: 0.545 },
        light:     { r: 0.651, g: 0.706, b: 0.780 },
        green:     { r: 0.133, g: 0.694, b: 0.298 },
        greenLight:{ r: 0.941, g: 0.992, b: 0.949 },
        amber:     { r: 0.961, g: 0.769, b: 0.188 },
        red:       { r: 0.941, g: 0.263, b: 0.212 },
      };

      const tx = (text, size, weight, color) => {
        const n = figma.createText();
        n.fontName = { family: "Inter", style: weight || "Regular" };
        n.characters = String(text || "");
        n.fontSize = size || 12;
        n.fills = [{ type: "SOLID", color: color || C.text }];
        n.textAutoResize = "WIDTH_AND_HEIGHT";
        return n;
      };

      const vb = (w, pad, gap, fill, cr) => {
        const f = figma.createFrame();
        f.layoutMode = "VERTICAL";
        f.paddingLeft = f.paddingRight = pad;
        f.paddingTop = f.paddingBottom = pad;
        f.itemSpacing = gap;
        f.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (cr) f.cornerRadius = cr;
        if (w !== null) {
          f.counterAxisSizingMode = "FIXED";
          f.resize(w, 10);
        } else {
          f.counterAxisSizingMode = "AUTO";
        }
        f.primaryAxisSizingMode = "AUTO"; 
        return f;
      };

      const hb = (pad, gap, fill, cr) => {
        const f = figma.createFrame();
        f.layoutMode = "HORIZONTAL";
        f.paddingLeft = f.paddingRight = pad;
        f.paddingTop = f.paddingBottom = pad;
        f.itemSpacing = gap;
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "AUTO";
        f.counterAxisAlignItems = "CENTER";
        f.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (cr) f.cornerRadius = cr;
        return f;
      };

      const addT = (parent, text, size, weight, color) => {
        const n = tx(text, size, weight, color);
        n.textAutoResize = "HEIGHT";
        n.layoutAlign = "STRETCH";
        parent.appendChild(n);
        return n;
      };

      const sp = (h) => {
        const r = figma.createRectangle();
        r.resize(4, h); r.opacity = 0;
        return r;
      };

      const rct = (w, h, fill, cr, strokeC, strokeW, dash) => {
        const r = figma.createRectangle();
        r.resize(w, h);
        r.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (cr) r.cornerRadius = cr;
        if (strokeC) {
          r.strokes = [{ type: "SOLID", color: strokeC }];
          r.strokeWeight = strokeW || 1;
          if (dash) r.dashPattern = dash;
        }
        return r;
      };

      const ell = (w, h, fill, strokeC, strokeW, dash) => {
        const e = figma.createEllipse();
        e.resize(w, h);
        e.fills = fill ? [{ type: "SOLID", color: fill }] : [];
        if (strokeC) {
          e.strokes = [{ type: "SOLID", color: strokeC }];
          e.strokeWeight = strokeW || 1;
          if (dash) e.dashPattern = dash;
        }
        return e;
      };

      const addLogo = (parent, x, y, size) => {
        size = size || 36;
        const c = ell(size, size, C.blue);
        c.x = x; c.y = y; parent.appendChild(c);
        const lt = tx("UX", Math.round(size * 0.3), "Bold", C.white);
        lt.x = x + Math.round(size * 0.22); lt.y = y + Math.round(size * 0.33);
        parent.appendChild(lt);
      };

      let mainFrame = null;

      if (msg.frameworkId === 'briefing') {
        mainFrame = vb(700, 48, 0, C.white, 16);
        mainFrame.name = "Briefing Estruturado";
        const hdr = mkHeader("Briefing Estruturado");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        mainFrame.appendChild(sp(20));

        const fieldRow = (label, val) => {
          const row = hb(0, 6, null);
          row.counterAxisAlignItems = "MIN";
          row.appendChild(tx(label + "  ", 13, "Bold", C.blue));
          row.appendChild(tx(val, 13, "Regular", C.text));
          mainFrame.appendChild(row);
          mainFrame.appendChild(sp(4));
        };

        const section = (header, body, sub) => {
          mainFrame.appendChild(sp(sub ? 4 : 14));
          addT(mainFrame, header, sub ? 12 : 14, "Bold", sub ? C.orange : C.blue);
          if (body) {
            mainFrame.appendChild(sp(4));
            addT(mainFrame, body, 12, "Regular", C.muted);
          }
        };

        fieldRow("Nome do Projeto:", "Nome do projeto");
        fieldRow("Data de Início:", "00/00/00");
        mainFrame.appendChild(sp(12));
        const sep = rct(604, 1, C.line); mainFrame.appendChild(sep);

        section("Contexto", "Descreva o contexto atual do projeto e por que ele está sendo demandado. Se existirem jornadas mapeadas ou algum material, ele deve ser registrado ou linkado nesta sessão.");
        section("Resultados-chave e critério de sucesso", "Como o sucesso do projeto será medido?");
        section("Atores e usuários", "Quem é o público deste projeto? Você pode aprofundar, aqui, para um estudo de personas.");
        section("Stakeholders e equipe", "Anote quem faz parte da(s) equipe(s), quais são suas responsabilidades. Importante anotar quem vai validar as decisões.");
        section("Escopo");
        section("Está no escopo", "O que precisa ser trabalhado e por que.", true);
        section("Pode estar no escopo", "O que depende de outros fatores para entrar no escopo.", true);
        section("Não está no escopo", "Limitações técnicas ou escopo excluído explicitamente.", true);
        section("Dependências", "Outras áreas que podem ter conhecimento ou domínio sobre parte do projeto.");
        section("Riscos", "Riscos que atrapalhem o sucesso do projeto. O que pode acontecer se não atingirmos as metas?");
        section("Tempo", "Roadmaps, prazos, sprints necessárias, qualquer fator que tangibilize tempo de projeto.");
        section("Organização do trabalho");
        section("Rotina de trabalho da equipe", "Reuniões diárias? Sprint? Retrô?", true);
        section("Comunicação", "Exemplo: reuniões marcadas por email, feitas pelo Teams.", true);
        section("Compartilhamento de dados", "Softwares e pastas, meio de compartilhamento, formatos de arquivos.", true);
        section("Notas adicionais", "Notas aqui.");
        mainFrame.appendChild(sp(8));
      }
      else if (msg.frameworkId === 'csd') {
        mainFrame = vb(940, 0, 0, C.white, 16);
        mainFrame.name = "Matriz CSD";
        const hdr = mkHeader("Matriz CSD – Certezas · Suposições · Dúvidas");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const csdRow = hb(20, 16, null);
        csdRow.layoutAlign = "STRETCH";
        mainFrame.appendChild(csdRow);

        const csdCols = [
          { label: "Certezas",   sub: "O que sabemos com certeza.",              hdr: C.green,  bg: C.greenLight },
          { label: "Suposições", sub: "O que acreditamos, mas não validamos.",   hdr: C.amber,  bg: { r:1, g:0.980, b:0.929 } },
          { label: "Dúvidas",   sub: "O que precisamos descobrir.",              hdr: C.red,    bg: { r:1, g:0.949, b:0.949 } },
        ];

        csdCols.forEach(col => {
          const card = vb(280, 0, 8, col.bg, 12);
          card.paddingBottom = 16;
          const chdr = vb(280, 16, 4, col.hdr, 0);
          chdr.paddingTop = chdr.paddingBottom = 10;
          chdr.layoutAlign = "STRETCH";
          const ct = tx(col.label, 13, "Bold", C.white);
          ct.layoutAlign = "STRETCH"; ct.textAutoResize = "HEIGHT";
          const cs = tx(col.sub, 10, "Regular", C.white); cs.opacity = 0.85;
          cs.layoutAlign = "STRETCH"; cs.textAutoResize = "HEIGHT";
          chdr.appendChild(ct); chdr.appendChild(cs);
          card.appendChild(chdr);

          for (let i = 0; i < 3; i++) {
            const itemWrap = vb(248, 12, 0, C.white, 8);
            itemWrap.paddingTop = itemWrap.paddingBottom = 10;
            itemWrap.strokes = [{ type: "SOLID", color: C.line }];
            itemWrap.strokeWeight = 1;
            itemWrap.layoutAlign = "STRETCH";
            const ph = tx("Clique para adicionar...", 11, "Regular", C.light);
            ph.layoutAlign = "STRETCH"; ph.textAutoResize = "HEIGHT";
            itemWrap.appendChild(ph);
            card.appendChild(itemWrap);
          }
          csdRow.appendChild(card);
        });
      }
      else if (msg.frameworkId === 'five-whys') {
        mainFrame = vb(600, 40, 0, C.bgBlue, 20);
        mainFrame.name = "Os 5 Porquês";
        const hdr = mkHeader("Os 5 porquê?");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        mainFrame.appendChild(sp(12));
        mainFrame.appendChild(rct(520, 1, C.line));
        mainFrame.appendChild(sp(12));

        const probRow = hb(0, 8, null);
        probRow.counterAxisAlignItems = "MIN";
        probRow.appendChild(tx("Problema:  ", 13, "Bold", C.blue));
        probRow.appendChild(tx("Diga qual o problema encontrado.", 13, "Regular", C.muted));
        mainFrame.appendChild(probRow);

        const emojis  = ["ðŸ˜€","ðŸ˜Š","ðŸ¤”","ðŸ˜¢","ðŸ¤¯","ðŸ˜±"];
        const qLabels = ["Porquê o problema ocorre?","Porquê?","Porquê?","Porquê?","Porquê?","Porquê?"];
        const motivos = ["1Â° motivo","2Â° motivo","3Â° motivo","4Â° motivo","5Â° motivo","6Â° motivo"];

        for (let i = 0; i < 6; i++) {
          mainFrame.appendChild(sp(14));
          const row = hb(0, 12, null);
          row.counterAxisAlignItems = "CENTER";
          row.appendChild(tx(emojis[i], 18, "Regular", C.text));
          const block = vb(null, 0, 2, null);
          block.appendChild(tx(qLabels[i], 13, "Bold", C.blue));
          block.appendChild(tx(motivos[i], 12, "Regular", C.muted));
          row.appendChild(block);
          mainFrame.appendChild(row);
        }

        mainFrame.appendChild(sp(20));
        mainFrame.appendChild(rct(520, 1, C.line));
        mainFrame.appendChild(sp(12));
        addT(mainFrame, "Causa raiz", 14, "Bold", C.blue);
        mainFrame.appendChild(sp(4));
        addT(mainFrame, "A real causa do problema é...", 12, "Regular", C.muted);
        mainFrame.appendChild(sp(8));
      }
      else if (msg.frameworkId === 'stakeholders') {
        const shCanvas = figma.createFrame();
        shCanvas.resize(600, 620);
        shCanvas.fills = [{ type: "SOLID", color: C.white }];
        shCanvas.layoutAlign = "STRETCH";

        const cx = 300, cy = 330;
        [[520, 460], [390, 344], [260, 230], [130, 115]].forEach(([ew, eh]) => {
          const e = ell(ew, eh, null, C.line, 1.5, [8, 8]);
          e.x = cx - ew / 2; e.y = cy - eh / 2;
          shCanvas.appendChild(e);
        });

        const solT = tx("Solução", 13, "Bold", C.text);
        solT.x = cx - 26; solT.y = cy + 10; shCanvas.appendChild(solT);

        const stickyBg = rct(106, 84, { r:1, g:0.937, b:0.698 }, 4);
        stickyBg.x = cx - 100; stickyBg.y = cy - 88; shCanvas.appendChild(stickyBg);
        const st1 = tx("Stakeholder", 10, "Medium", C.text);
        st1.x = cx - 94; st1.y = cy - 76; shCanvas.appendChild(st1);
        const st2 = tx("• Necessidade", 10, "Regular", C.text);
        st2.x = cx - 94; st2.y = cy - 60; shCanvas.appendChild(st2);

        mainFrame = vb(600, 0, 0, C.white, 16);
        mainFrame.name = "Mapa de Stakeholders";
        const hdr = mkHeader("Mapa de Stakeholders");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        mainFrame.appendChild(shCanvas);
      }
      else if (msg.frameworkId === 'value-effort') {
        const veCanvas = figma.createFrame();
        veCanvas.resize(620, 720);
        veCanvas.fills = [{ type: "SOLID", color: C.white }];
        veCanvas.layoutAlign = "STRETCH";

        const chartBg = rct(500, 580, C.bgBlue, 8);
        chartBg.x = 60; chartBg.y = 20; veCanvas.appendChild(chartBg);

        const yAx = rct(2, 500, C.text); yAx.x = 100; yAx.y = 40; veCanvas.appendChild(yAx);
        const xAx = rct(420, 2, C.text); xAx.x = 100; xAx.y = 560; veCanvas.appendChild(xAx);
        
        mainFrame = vb(620, 0, 0, C.white, 16);
        mainFrame.name = "Matriz Valor × Esforço";
        const hdr = mkHeader("Matriz Valor × Esforço");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        mainFrame.appendChild(veCanvas);
      }
      else if (msg.frameworkId === 'atomic-research') {
        mainFrame = vb(960, 0, 0, C.white, 16);
        mainFrame.name = "Atomic Research";
        const hdr = mkHeader("Atomic Research");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Insira dados de pesquisa atômica aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'blueprint') {
        mainFrame = vb(1200, 0, 0, C.white, 16);
        mainFrame.name = "Blueprint de Serviço";
        const hdr = mkHeader("Blueprint de Serviço");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Construa o blueprint de serviço aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'heuristics') {
        mainFrame = vb(960, 0, 0, C.white, 16);
        mainFrame.name = "Heurísticas de Nielsen";
        const hdr = mkHeader("Heurísticas de Nielsen");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Avaliação heurística aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'opportunities') {
        mainFrame = vb(960, 0, 0, C.white, 16);
        mainFrame.name = "Mapa de Oportunidades";
        const hdr = mkHeader("Mapa de Oportunidades");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const b = vb(null, 40, 24, null);
        mainFrame.appendChild(b);
        b.layoutAlign = "STRETCH";
        b.appendChild(tx("Mapeamento de oportunidades aqui...", 14, "Regular", C.muted));
      }
      else if (msg.frameworkId === 'personas') {
        mainFrame = vb(800, 0, 0, { r:0.961, g:0.98, b:0.992 }, 16); 
        mainFrame.name = "Painel de Personas";
        const hdr = mkHeader("Painel de Personas");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";
        
        const body = vb(null, 40, 24, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        const infoRow = hb(0, 16, null);
        infoRow.counterAxisAlignItems = "CENTER";
        const pic = rct(48, 48, C.blue, 24);
        infoRow.appendChild(pic);
        const nameCol = vb(null, 0, 4, null);
        nameCol.appendChild(tx("Perfil 1 - Nome do Perfil", 18, "Bold", C.blueDark));
        nameCol.appendChild(tx("Breve descrição (exemplo: Perfil 1 foi mapeado entendendo cliente interno)", 12, "Regular", C.muted));
        infoRow.appendChild(nameCol);
        body.appendChild(infoRow);

        const sep1 = rct(720, 1, C.blueLight);
        body.appendChild(sep1);
        sep1.layoutAlign = "STRETCH";

        const detailsRow = hb(0, 32, null);
        detailsRow.counterAxisAlignItems = "MIN";
        const photo = rct(160, 200, C.blue, 12);
        detailsRow.appendChild(photo);
        
        const dataCol = vb(null, 0, 16, null);
        const addData = (l, v) => {
          const r = hb(0, 8, null);
          r.appendChild(tx(l+":", 14, "Bold", C.blueDark));
          r.appendChild(tx(v, 14, "Regular", C.text));
          dataCol.appendChild(r);
        };
        addData("Nome", "Um nome (opcional)");
        addData("Idade", "idade média do perfil (pode ser conseguido por dados)");
        addData("Ocupação", "Trabalho / meio de trabalho");
        addData("Renda", "Renda média");
        addData("Escolaridade", "Educação formal");
        detailsRow.appendChild(dataCol);
        body.appendChild(detailsRow);

        const colsRow = hb(0, 40, null);
        colsRow.layoutAlign = "STRETCH";
        
        const col1 = vb(null, 0, 12, null);
        col1.layoutAlign = "STRETCH";
        col1.appendChild(tx("Objetivos", 16, "Bold", C.blueDark));
        const objT = tx("Listar objetivos relacionados ao produto, sejam eles objetivos de vida ou objetivos do dia, organização financeira, etc.", 13, "Regular", C.text);
        col1.appendChild(objT);
        objT.textAutoResize = "HEIGHT"; objT.layoutAlign = "STRETCH";
        colsRow.appendChild(col1);

        const col2 = vb(null, 0, 12, null);
        col2.layoutAlign = "STRETCH";
        col2.appendChild(tx("Necessidade", 16, "Bold", C.blueDark));
        const necT = tx("Listar necessidades relacionados ao produto, aqui podemos mapear dores para identificar oportunidades.", 13, "Regular", C.text);
        col2.appendChild(necT);
        necT.textAutoResize = "HEIGHT"; necT.layoutAlign = "STRETCH";
        colsRow.appendChild(col2);

        body.appendChild(colsRow);

        const oppCol = vb(null, 0, 12, null);
        oppCol.layoutAlign = "STRETCH";
        oppCol.appendChild(tx("Oportunidades", 16, "Bold", C.blueDark));
        const oppT = tx("Liste oportunidades de produto relacionadas às sessões anteriores.", 13, "Regular", C.text);
        oppCol.appendChild(oppT);
        oppT.textAutoResize = "HEIGHT"; oppT.layoutAlign = "STRETCH";
        body.appendChild(oppCol);

        const sep2 = rct(720, 1, C.blueLight);
        body.appendChild(sep2);
        sep2.layoutAlign = "STRETCH";

        const obsCol = vb(null, 0, 12, null);
        obsCol.layoutAlign = "STRETCH";
        obsCol.appendChild(tx("Observações adicionais", 14, "Bold", C.blueDark));
        const obsT = tx("Escreva aqui observações de hipóteses descobertas em análise de dados internos e externos que ajudaram a mapear perfis de clientes / usuários.", 13, "Regular", C.text);
        obsCol.appendChild(obsT);
        obsT.textAutoResize = "HEIGHT"; obsT.layoutAlign = "STRETCH";
        body.appendChild(obsCol);
      }
      else if (msg.frameworkId === 'interview-script') {
        mainFrame = vb(800, 0, 0, C.white, 16);
        mainFrame.name = "Roteiro de Entrevistas";
        const hdr = mkHeader("Tag - Nome do Projeto");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const body = vb(null, 40, 24, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        const title = tx("Roteiro de Entrevistas", 24, "Bold", C.blueDark);
        body.appendChild(title);

        const addSec = (titleStr, descStr, isTitle = false) => {
          const sec = vb(null, 0, 8, null);
          sec.layoutAlign = "STRETCH";
          const t = tx(titleStr, isTitle ? 18 : 14, "Bold", isTitle ? C.blueDark : C.text);
          sec.appendChild(t);
          const d = tx(descStr, 13, "Regular", C.muted);
          sec.appendChild(d);
          d.textAutoResize = "HEIGHT"; d.layoutAlign = "STRETCH";
          body.appendChild(sec);
        };

        addSec("1. Introdução e Aquecimento", "Apresente-se, explique o objetivo da entrevista de forma neutra (sem enviesar) e peça consentimento para gravar. Faça perguntas que quebrem o gelo.", true);
        addSec("Sugestões de perguntas:", "- Como é um dia típico de trabalho para você?\n- Quais ferramentas você mais utiliza hoje?");
        
        const sep1 = rct(720, 1, C.line); body.appendChild(sep1); sep1.layoutAlign = "STRETCH";

        addSec("2. Descoberta e Contexto", "Entenda como o usuário lida com o problema hoje, antes de apresentar qualquer solução.", true);
        addSec("Sugestões de perguntas:", "- Me conte sobre a última vez que você precisou realizar [tarefa].\n- O que foi mais difícil nesse processo?\n- Como você contorna esse problema atualmente?");

        const sep2 = rct(720, 1, C.line); body.appendChild(sep2); sep2.layoutAlign = "STRETCH";

        addSec("3. Aprofundamento (Solução / Protótipo)", "Caso haja um protótipo, apresente agora. Peça para o usuário pensar em voz alta.", true);
        addSec("Sugestões de perguntas:", "- O que você acha que essa tela faz?\n- Onde você clicaria para [ação]?\n- O que você esperava que acontecesse ao clicar ali?");

        const sep3 = rct(720, 1, C.line); body.appendChild(sep3); sep3.layoutAlign = "STRETCH";

        addSec("4. Encerramento", "Abra espaço para considerações finais e agradeça.", true);
        addSec("Sugestões de perguntas:", "- Há algo que não perguntei e que você gostaria de comentar?\n- Como você resumiria essa experiência?");
      }
      else if (msg.frameworkId === 'journey') {
        mainFrame = vb(1000, 0, 0, { r:0.941, g:0.965, b:0.976 }, 16); 
        mainFrame.name = "Jornada de Usuário";
        const hdr = mkHeader("Jornada de Usuário");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const body = hb(24, 24, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        const leftCol = vb(220, 0, 12, null);
        body.appendChild(leftCol);

        const mkL = (title, sub, h) => {
          const b = vb(220, 16, 4, C.white, 8);
          if(h) {
            b.counterAxisSizingMode = "FIXED";
            b.resize(220, h);
            b.primaryAxisSizingMode = "FIXED"; 
          }
          b.appendChild(tx(title, 16, "Bold", C.text));
          if(sub) b.appendChild(tx(sub, 12, "Regular", C.muted));
          return b;
        };

        const topBlock = mkL("Jornada", "Etapas da jornada");
        leftCol.appendChild(topBlock);
        leftCol.appendChild(mkL("Passos", "O que faz..."));
        leftCol.appendChild(mkL("Pensa e fala", "O que pensa e fala..."));
        leftCol.appendChild(mkL("Sentimentos", ""));
        leftCol.appendChild(mkL("Oportunidades", ""));
        leftCol.appendChild(mkL("Experiência", "", 240));

        const rightCol = hb(0, 12, null);
        body.appendChild(rightCol);
        rightCol.layoutAlign = "STRETCH";

        const numEtapas = 2; 
        for(let i=1; i<=numEtapas; i++) {
          const col = vb(330, 0, 12, null);
          col.layoutAlign = "STRETCH";
          
          const eTop = vb(null, 16, 4, { r:0.2, g:0.8, b:0.96 }, 8);
          eTop.layoutAlign = "STRETCH";
          eTop.appendChild(tx(i + ". Nome da Etapa", 16, "Bold", C.blueDark));
          eTop.appendChild(tx("Descrição (opcional)", 12, "Regular", C.blueDark));
          col.appendChild(eTop);

          const mkr = (val, h) => {
            const b = vb(null, 16, 4, C.white, 8);
            b.layoutAlign = "STRETCH";
            if(h) {
              b.counterAxisSizingMode = "FIXED"; 
              b.resize(330, h);
              b.primaryAxisSizingMode = "FIXED"; 
            }
            b.appendChild(tx(val, 13, "Regular", C.text));
            return b;
          };

          const s1 = mkr("1.1 Passo");
          const s2 = mkr("1.2 Passo");
          const wS = vb(null, 0, 8, null);
          wS.layoutAlign = "STRETCH";
          wS.appendChild(s1); wS.appendChild(s2);
          col.appendChild(wS);

          const wP = vb(null, 0, 8, null);
          wP.layoutAlign = "STRETCH";
          wP.appendChild(mkr("Pensamento")); wP.appendChild(mkr("Pensamento"));
          col.appendChild(wP);

          const wF = vb(null, 0, 8, null);
          wF.layoutAlign = "STRETCH";
          wF.appendChild(mkr("Sentimento")); wF.appendChild(mkr("Sentimento"));
          col.appendChild(wF);

          const wO = vb(null, 0, 8, null);
          wO.layoutAlign = "STRETCH";
          wO.appendChild(mkr("Oportunidade")); wO.appendChild(mkr("Oportunidade"));
          col.appendChild(wO);

          const expB = vb(null, 16, 4, null, 0); 
          expB.layoutAlign = "STRETCH";
          expB.counterAxisSizingMode = "FIXED";
          expB.resize(330, 240);
          expB.primaryAxisSizingMode = "FIXED";
          
          const line = rct(330, 1, C.muted);
          expB.appendChild(line); 
          line.layoutAlign = "STRETCH";
          
          col.appendChild(expB);

          rightCol.appendChild(col);
        }
      }
      else if (msg.frameworkId === 'relational-map') {
        mainFrame = vb(1000, 0, 0, C.white, 16);
        mainFrame.name = "Mapa Relacional";
        const hdr = mkHeader("Mapa Relacional");
        mainFrame.appendChild(hdr);
        hdr.layoutAlign = "STRETCH";

        const body = hb(40, 32, null);
        mainFrame.appendChild(body);
        body.layoutAlign = "STRETCH";

        for (let i=0; i<4; i++) {
          const col = vb(200, 0, 16, null);
          
          const headB = vb(200, 12, 0, C.white, 4);
          headB.strokes = [{ type: "SOLID", color: C.blue }];
          headB.strokeWeight = 1.5;
          const ht = tx("Classifique, por temas gerais, os itens a serem agrupados abaixo", 10, "Bold", C.text);
          ht.textAlignHorizontal = "CENTER";
          ht.textAutoResize = "HEIGHT";
          ht.layoutAlign = "STRETCH";
          headB.appendChild(ht);
          col.appendChild(headB);

          for (let j=0; j<4; j++) {
            const card = vb(200, 16, 0, { r:0.94, g:0.95, b:0.96 }, 8); 
            card.counterAxisSizingMode = "FIXED";
            card.resize(200, 100);
            card.primaryAxisSizingMode = "FIXED";
            
            const dot = ell(20, 20, j%2==0 ? C.teal : (j==1 ? C.blue : C.orange));
            card.appendChild(dot);
            
            col.appendChild(card);
          }

          body.appendChild(col);
        }
      }

      // â”€â”€ finalizar no canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (mainFrame) {
        const frameName = mainFrame.name;
        figma.currentPage.appendChild(mainFrame);

        const vp = figma.viewport.bounds;
        mainFrame.x = Math.round(vp.x + (vp.width  - mainFrame.width)  / 2);
        mainFrame.y = Math.round(vp.y + (vp.height - mainFrame.height) / 2);

        const grp = figma.group([mainFrame], figma.currentPage);
        grp.name = frameName;

        figma.currentPage.selection = [grp];
        figma.viewport.scrollAndZoomIntoView([grp]);
        figma.ui.postMessage({ type: 'framework-injected', name: msg.frameworkId });
        figma.notify("Framework inserido no canvas! âœ“");
      }
    })();
    return;
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};


