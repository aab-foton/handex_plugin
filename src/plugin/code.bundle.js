(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/plugin/audit.js
  var frameJsonTemplate = () => ({
    elements: {
      components: [],
      icons: [],
      typography: [],
      frames: [],
      vectors: []
    }
  });
  var AUDIT_SCORE = {
    EXACT: 1,
    SOFT: 0.5,
    NONE: 0
  };
  var AUDIT_THRESHOLDS = {
    OURO: 0.98,
    AJUSTE: 0.11
  };
  function emptyResult() {
    return { score: AUDIT_SCORE.NONE, matchedBy: null, matchedIn: null, matchedTokenName: null };
  }
  function auditProperty(name, value, type, figmaKey, referenceTokensInput, isAudit) {
    if (!isAudit || !referenceTokensInput) return emptyResult();
    if (!name) return emptyResult();
    const lowerName = String(name).toLowerCase();
    const targetValue = String(value || "").toLowerCase();
    const referenceList = Array.isArray(referenceTokensInput) ? referenceTokensInput : [referenceTokensInput];
    let best = emptyResult();
    const considerSofterMatch = (libName) => {
      if (best.score < AUDIT_SCORE.SOFT) {
        best = { score: AUDIT_SCORE.SOFT, matchedBy: null, matchedIn: libName, matchedTokenName: null };
      }
    };
    for (const referenceTokens of referenceList) {
      if (!referenceTokens) continue;
      const libName = referenceTokens.meta && referenceTokens.meta.libraryName || referenceTokens.libraryName || null;
      if (figmaKey) {
        if (referenceTokens.designTokens && Array.isArray(referenceTokens.designTokens.variables)) {
          const v = referenceTokens.designTokens.variables.find((t) => t.key === figmaKey || t.$key === figmaKey);
          if (v) {
            return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName, matchedTokenName: v.name || null };
          }
        }
        if (referenceTokens.styleTokens) {
          for (const styleType in referenceTokens.styleTokens) {
            const stylesArray = referenceTokens.styleTokens[styleType];
            if (Array.isArray(stylesArray)) {
              const s = stylesArray.find((item) => item.key === figmaKey);
              if (s) {
                return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName, matchedTokenName: s.name || null };
              }
            }
          }
        }
        if (Array.isArray(referenceTokens.components)) {
          const c = referenceTokens.components.find((item) => item.key === figmaKey);
          if (c) {
            return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName, matchedTokenName: c.name || null };
          }
        }
      }
      const categoryList = referenceTokens[type] || referenceTokens[type.replace(/s$/, "")] || null;
      const softMatchList = (list) => {
        if (!Array.isArray(list)) return null;
        for (const ref of list) {
          const rName = (typeof ref === "string" ? ref : ref.name || ref.label || "").toLowerCase();
          const rValue = (typeof ref === "string" ? "" : ref.value || ref.hex || ref.token || "").toLowerCase();
          const rRaw = typeof ref === "object" && ref && ref.rawValue !== void 0 ? String(ref.rawValue).toLowerCase() : "";
          const refTokenName = typeof ref === "object" && ref ? ref.name || null : null;
          if (rValue && targetValue && (rValue === targetValue || targetValue === rValue || targetValue.includes(rValue) || rValue.includes(targetValue))) {
            return { kind: "value", tokenName: refTokenName };
          }
          if (rRaw && targetValue && targetValue.replace(/px$/, "") === rRaw) {
            return { kind: "value", tokenName: refTokenName };
          }
          if (rName && (rName === lowerName || lowerName.includes(rName) || rName.includes(lowerName))) {
            return { kind: "name", tokenName: refTokenName };
          }
          if (type === "typography" && targetValue.includes("px") && rValue) {
            const sizeMatch = targetValue.match(/\((\d+(\.\d+)?)px\)/);
            if (sizeMatch && (rValue.includes(sizeMatch[1] + "px") || rName.includes(sizeMatch[1]))) {
              if (targetValue.includes("caixa std")) return { kind: "name", tokenName: refTokenName };
            }
          }
        }
        return null;
      };
      const direct = softMatchList(categoryList);
      if (direct) {
        if (best.score < AUDIT_SCORE.SOFT) best = { score: AUDIT_SCORE.SOFT, matchedBy: direct.kind, matchedIn: libName, matchedTokenName: direct.tokenName };
        continue;
      }
      let globalHit = null;
      for (const cat in referenceTokens) {
        const hit = softMatchList(referenceTokens[cat]);
        if (hit) {
          globalHit = hit;
          break;
        }
      }
      if (globalHit) {
        if (best.score < AUDIT_SCORE.SOFT) best = { score: AUDIT_SCORE.SOFT, matchedBy: globalHit.kind, matchedIn: libName, matchedTokenName: globalHit.tokenName };
        continue;
      }
      if (type === "typography" && lowerName.includes("caixa std")) {
        considerSofterMatch(libName);
        continue;
      }
      if (lowerName.includes("/") || lowerName.includes("shadow") || lowerName.includes("[") || lowerName.includes("]")) {
        considerSofterMatch(libName);
      }
    }
    return best;
  }
  function suggestClosestMatch(type, value, referenceTokensInput) {
    if (!value || !referenceTokensInput) return null;
    const referenceList = Array.isArray(referenceTokensInput) ? referenceTokensInput : [referenceTokensInput];
    const hexMatch = String(value).match(/#([0-9a-f]{6})/i);
    if (hexMatch && (type === "colors" || type === "color" || type === "stroke")) {
      const target = hexToRgb(hexMatch[1]);
      let best = null;
      for (const ref of referenceList) {
        const libName = ref.meta && ref.meta.libraryName || ref.libraryName || null;
        const styleList = ref.styleTokens && ref.styleTokens.colors || [];
        for (const item of styleList) {
          if (!item.value) continue;
          const h = item.value.match(/#([0-9a-f]{6})/i);
          if (!h) continue;
          const rgb = hexToRgb(h[1]);
          const d = Math.sqrt((target.r - rgb.r) ** 2 + (target.g - rgb.g) ** 2 + (target.b - rgb.b) ** 2);
          if (!best || d < best.distance) {
            best = {
              tokenName: item.name,
              value: item.value,
              library: libName,
              distance: d,
              kind: "style",
              styleKey: item.key || null,
              variableKey: null
            };
          }
        }
        const vars = ref.designTokens && ref.designTokens.variables || [];
        for (const v of vars) {
          if (!v.value || v.resolvedType !== "COLOR") continue;
          const h = v.value.match(/#([0-9a-f]{6})/i);
          if (!h) continue;
          const rgb = hexToRgb(h[1]);
          const d = Math.sqrt((target.r - rgb.r) ** 2 + (target.g - rgb.g) ** 2 + (target.b - rgb.b) ** 2);
          if (!best || d < best.distance) {
            best = {
              tokenName: v.name,
              value: v.value,
              library: libName,
              distance: d,
              kind: "variable",
              styleKey: null,
              variableKey: v.key || null
            };
          }
        }
      }
      if (best && best.distance < 80) {
        best.similarity = Math.max(0, Math.round((1 - best.distance / 441) * 100));
        return best;
      }
      return null;
    }
    if (type === "typography") {
      let best = null;
      for (const ref of referenceList) {
        const libName = ref.meta && ref.meta.libraryName || ref.libraryName || null;
        const list = ref.styleTokens && ref.styleTokens.typography || [];
        for (const item of list) {
          if (!item.key) continue;
          if (item.name && item.name === value) {
            return {
              tokenName: item.name,
              value: item.value || item.name,
              library: libName,
              distance: 0,
              kind: "style",
              styleKey: item.key,
              variableKey: null,
              similarity: 100
            };
          }
          if (!best) best = {
            tokenName: item.name,
            value: item.value || item.name,
            library: libName,
            distance: 999,
            kind: "style",
            styleKey: item.key,
            variableKey: null
          };
        }
      }
      if (best) {
        best.similarity = 0;
        return best;
      }
      return null;
    }
    const numMatch = String(value).match(/(-?\d+(?:\.\d+)?)\s*px?/);
    if (numMatch) {
      const target = parseFloat(numMatch[1]);
      let best = null;
      for (const ref of referenceList) {
        const libName = ref.meta && ref.meta.libraryName || ref.libraryName || null;
        const candidates = collectNumericCandidates(ref, type);
        for (const c of candidates) {
          const d = Math.abs(target - c.value);
          if (!best || d < best.distance) {
            best = {
              tokenName: c.name,
              value: c.value + "px",
              library: libName,
              distance: d,
              kind: "numeric",
              styleKey: c.styleKey || null,
              variableKey: c.variableKey || null
            };
          }
        }
      }
      if (best && best.distance <= Math.max(4, target * 0.25)) {
        best.similarity = Math.max(0, Math.round((1 - best.distance / Math.max(target, 1)) * 100));
        return best;
      }
      return null;
    }
    return null;
  }
  function collectNumericCandidates(ref, type) {
    const out = [];
    if (type === "typography" || type === "fontSize") {
      const list = ref.styleTokens && ref.styleTokens.typography || [];
      for (const item of list) {
        if (typeof item.fontSize === "number") {
          out.push({ name: item.name, value: item.fontSize });
        }
      }
    }
    const variables = ref.designTokens && ref.designTokens.variables || [];
    for (const v of variables) {
      if (typeof v.value === "number") out.push({ name: v.name, value: v.value, variableKey: v.key || null });
    }
    for (const cat of ["spacing", "borders", "radii"]) {
      const list = ref[cat];
      if (Array.isArray(list)) {
        for (const it of list) {
          const num = typeof it === "number" ? it : it && typeof it.value === "number" ? it.value : it && typeof it.rawValue === "number" ? it.rawValue : null;
          if (num !== null) out.push({ name: it && it.name || String(num), value: num });
        }
      }
    }
    return out;
  }
  function hexToRgb(hex) {
    const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  // src/plugin/code.js
  figma.showUI(__html__, { width: 480, height: 750 });
  var activeHighlightNode = null;
  function _nodeOnCurrentPage(node) {
    let n = node;
    while (n && n.type !== "PAGE") n = n.parent;
    return n != null && n.id === figma.currentPage.id;
  }
  var specColumnTracker = {};
  function hexToRgb2(hex) {
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
  var PLUGIN_VERSION = true ? "4.1.1" : "dev";
  function _writeSharedPluginData(data) {
    var _a, _b, _c, _d, _e, _f, _g;
    const NS = "handex";
    try {
      const project = {
        titulo: ((_a = data.step1) == null ? void 0 : _a.titulo) || "",
        versao: ((_b = data.step1) == null ? void 0 : _b.versao) || "",
        objetivo: ((_c = data.step1) == null ? void 0 : _c.objetivo) || "",
        status: ((_d = data.step1) == null ? void 0 : _d.status) || "rascunho",
        equipe: ((_e = data.step1) == null ? void 0 : _e.equipe) || [],
        briefing: (((_f = data.step2) == null ? void 0 : _f.briefingQuestions) || []).map((q) => ({
          categoria: q.category || "",
          pergunta: q.question || "",
          resposta: q.answer || ""
        })),
        regras: (((_g = data.step2) == null ? void 0 : _g.regras) || []).map((r) => ({
          titulo: r.titulo || "",
          notas: r.notas || "",
          link: r.link || ""
        })),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        plugin: `handex@${PLUGIN_VERSION}`
      };
      figma.currentPage.setSharedPluginData(NS, "project", JSON.stringify(project));
    } catch (e) {
      console.warn("[handex] setSharedPluginData(project) failed:", e);
    }
    (data.frames || []).forEach((frame) => {
      try {
        const node = figma.getNodeById(frame.figmaId);
        if (!node) return;
        node.setSharedPluginData(NS, "context", JSON.stringify({
          nome: frame.nome || "",
          isNewComponent: frame.isNewComponent || false,
          excecoes: (frame.excecoes || []).map((e) => ({
            tipo: e.tipo || "",
            titulo: e.titulo || "",
            notas: e.notas || "",
            link: e.link || ""
          }))
        }));
      } catch (e) {
      }
    });
  }
  figma.ui.onmessage = async (msg) => {
    var _a;
    if (msg.type === "ui-ready") {
      const currentUser = figma.currentUser ? { id: figma.currentUser.id, name: figma.currentUser.name, photoUrl: figma.currentUser.photoUrl } : null;
      const theme = figma.ui.theme || "light";
      const sel = figma.currentPage.selection;
      const projectName = (sel.length > 0 ? sel[0].name : "") || figma.currentPage.name || figma.root.name || "";
      const _handoffBase = "[Handoff]";
      const _existingAtInit = figma.currentPage.findAll((n) => n.type === "FRAME" && n.name.startsWith(_handoffBase));
      try {
        const savedState = await figma.clientStorage.getAsync("handoffData");
        figma.ui.postMessage({
          type: "init-plugin",
          version: PLUGIN_VERSION,
          currentUser,
          theme,
          projectName,
          savedState: savedState || null,
          existingHandoffCount: _existingAtInit.length
        });
      } catch (err) {
        console.error("Initialization error (continuing without saved state):", err);
        figma.ui.postMessage({
          type: "init-plugin",
          version: PLUGIN_VERSION,
          currentUser,
          theme,
          projectName,
          savedState: null,
          existingHandoffCount: _existingAtInit.length
        });
      }
      return;
    }
    if (msg.type === "get-project-name") {
      figma.ui.postMessage({ type: "project-name", name: figma.root.name || figma.currentPage.name || "" });
      return;
    }
    if (msg.type === "refresh-spec-card") {
      const grpNode = figma.getNodeById(msg.nodeId);
      if (!grpNode) {
        figma.ui.postMessage({ type: "toast", message: "Card n\xC3\xA3o encontrado no canvas.", kind: "error" });
        return;
      }
      const children = grpNode.type === "GROUP" ? grpNode.children : [grpNode];
      const cardFrame = children.find((n) => n.name && n.name.endsWith("/Ficha"));
      if (!cardFrame || cardFrame.type !== "FRAME") {
        figma.ui.postMessage({ type: "toast", message: "Card n\xC3\xA3o encontrado no grupo.", kind: "error" });
        return;
      }
      const existing = cardFrame.children.find((n) => n.name === "[Spec] Exce\xC3\xA7\xC3\xB5es");
      if (existing) existing.remove();
      if (msg.excecoes && msg.excecoes.length > 0) {
        (async () => {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
          const excFrame = figma.createFrame();
          excFrame.name = "[Spec] Exce\xC3\xA7\xC3\xB5es";
          excFrame.layoutMode = "VERTICAL";
          excFrame.itemSpacing = 4;
          excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
          excFrame.paddingLeft = 8;
          excFrame.paddingRight = 8;
          excFrame.paddingTop = 6;
          excFrame.paddingBottom = 6;
          excFrame.cornerRadius = 6;
          excFrame.primaryAxisSizingMode = "AUTO";
          excFrame.counterAxisSizingMode = "AUTO";
          const excTitle = figma.createText();
          excTitle.fontName = { family: "Inter", style: "Bold" };
          excTitle.fontSize = 9;
          excTitle.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
          excTitle.characters = `CEN\xC3\x81RIOS (${msg.excecoes.length})`;
          excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
          excFrame.appendChild(excTitle);
          msg.excecoes.forEach((exc) => {
            const t = figma.createText();
            t.fontName = { family: "Inter", style: "Regular" };
            t.fontSize = 10;
            t.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
            t.characters = `[${exc.tipo || "Geral"}] ${exc.titulo || ""}`;
            t.textAutoResize = "WIDTH_AND_HEIGHT";
            excFrame.appendChild(t);
          });
          cardFrame.appendChild(excFrame);
          figma.ui.postMessage({ type: "toast", message: "Card atualizado com os cen\xC3\xA1rios.", kind: "success" });
        })();
      } else {
        figma.ui.postMessage({ type: "toast", message: "Card atualizado.", kind: "success" });
      }
      return;
    }
    if (msg.type === "get-context-name") {
      const sel = figma.currentPage.selection;
      const name = sel.length > 0 ? sel[0].name : "";
      figma.ui.postMessage({ type: "context-name", name });
      return;
    }
    if (msg.type === "get-selection-info") {
      const validTypes = ["FRAME", "COMPONENT", "INSTANCE", "SECTION", "GROUP"];
      const selection = figma.currentPage.selection.filter((n) => validTypes.includes(n.type));
      if (selection.length > 0) {
        figma.ui.postMessage({
          type: "selection-info",
          nodes: selection.map((n) => ({ nodeId: n.id, name: n.name }))
        });
      } else {
        figma.ui.postMessage({
          type: "selection-info",
          nodes: [],
          error: "Nenhum frame selecionado no canvas."
        });
      }
      return;
    }
    if (msg.type === "resize") {
      figma.ui.resize(msg.width, msg.height);
      return;
    }
    if (msg.type === "clear-cache") {
      const fileKey = figma.root && figma.root.id ? figma.root.id : "default";
      const keys = [
        "handoffData",
        "handex-audit-refs-v1",
        "handex-scan-cache-v1",
        "handex-history-" + fileKey
      ];
      try {
        await Promise.all(keys.map((k) => figma.clientStorage.setAsync(k, null)));
        try {
          figma.currentPage.setSharedPluginData("handex", "project", "");
        } catch (e) {
        }
        figma.ui.postMessage({ type: "cache-cleared" });
      } catch (e) {
        console.error("clear-cache failed:", e);
        figma.notify("Erro ao limpar cache", { error: true });
      }
      return;
    }
    if (msg.type === "scan-cache-save") {
      figma.clientStorage.setAsync("handex-scan-cache-v1", msg.data).catch(
        (e) => console.warn("scan-cache-save failed:", e)
      );
      return;
    }
    if (msg.type === "scan-cache-load") {
      try {
        const cached = await figma.clientStorage.getAsync("handex-scan-cache-v1");
        figma.ui.postMessage({ type: "scan-cache-loaded", data: cached || null });
      } catch (e) {
        figma.ui.postMessage({ type: "scan-cache-loaded", data: null });
      }
      return;
    }
    if (msg.type === "snapshot-load") {
      try {
        const fileKey = figma.root && figma.root.id ? figma.root.id : "default";
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
        const fileKey = figma.root && figma.root.id ? figma.root.id : "default";
        const key = "handex-history-" + fileKey;
        const existing = await figma.clientStorage.getAsync(key) || [];
        const next = [msg.snapshot].concat(Array.isArray(existing) ? existing : []).slice(0, 5);
        await figma.clientStorage.setAsync(key, next);
      } catch (e) {
        console.error("snapshot-save failed:", e);
      }
      return;
    }
    if (msg.type === "create-handoff") {
      try {
        let createText = function(text, size = 14, weight = "Regular", color = { r: 0.12, g: 0.16, b: 0.23 }) {
          const t = figma.createText();
          t.fontName = { family: "Inter", style: weight };
          t.characters = String(text || "");
          t.fontSize = size;
          t.fills = [{ type: "SOLID", color }];
          return t;
        }, createFrame = function(direction = "VERTICAL", padding = 0, spacing = 0, fill = null) {
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
        }, setFillAndHug = function(node) {
          if (!node) return;
          try {
            if ("layoutSizingHorizontal" in node) {
              node.layoutSizingHorizontal = "FILL";
            }
            if ("layoutSizingVertical" in node) {
              node.layoutSizingVertical = "HUG";
            }
          } catch (e) {
          }
          const parent = node.parent;
          const pMode = parent && "layoutMode" in parent ? parent.layoutMode : "VERTICAL";
          if (pMode === "VERTICAL") {
            node.layoutAlign = "STRETCH";
            if (node.type === "FRAME") {
              if (node.layoutMode === "VERTICAL") node.primaryAxisSizingMode = "AUTO";
              else node.counterAxisSizingMode = "AUTO";
            } else if (node.type === "TEXT") {
              node.textAutoResize = "HEIGHT";
            }
          } else if (pMode === "HORIZONTAL") {
            node.layoutGrow = 1;
            node.layoutAlign = "INHERIT";
            if (node.type === "FRAME") {
              if (node.layoutMode === "HORIZONTAL") node.counterAxisSizingMode = "AUTO";
              else node.primaryAxisSizingMode = "AUTO";
            } else if (node.type === "TEXT") {
              node.textAutoResize = "HEIGHT";
            }
          }
        }, getIconSvg = function(type) {
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
          return icons[type] || icons["layout"];
        }, createSection = function(parent, titleText) {
          const section = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
          section.name = `[Se\xC3\xA7\xC3\xA3o] ${titleText}`;
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
        }, createRow = function(parent, label, value, isLink = false, url = "") {
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
              } catch (e) {
              }
            }
          }
          return row;
        };
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
        const _titulo = (((_a = data.step1) == null ? void 0 : _a.titulo) || "Projeto").replace(/\//g, "-");
        const _handoffBase = `Handex | Ficha de Projeto | ${_titulo}`;
        const _existingHandoffs = figma.currentPage.findAll(
          (n) => n.type === "FRAME" && n.name.startsWith(_handoffBase)
        );
        const _now = /* @__PURE__ */ new Date();
        const _ts = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")} ${String(_now.getHours()).padStart(2, "0")}:${String(_now.getMinutes()).padStart(2, "0")}`;
        const _containerName = `${_handoffBase} | ${_ts}`;
        const mainContainer = createFrame("HORIZONTAL", 64, 48, hexToRgb2("#026173"));
        mainContainer.name = _containerName;
        mainContainer.counterAxisAlignItems = "MIN";
        mainContainer.primaryAxisSizingMode = "AUTO";
        mainContainer.counterAxisSizingMode = "AUTO";
        const fichaTecnica = createFrame("VERTICAL", 0, 0, { r: 1, g: 1, b: 1 });
        fichaTecnica.name = `${_handoffBase} | ${_ts} / Ficha de Projeto`;
        fichaTecnica.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        fichaTecnica.resize(600, 100);
        fichaTecnica.counterAxisSizingMode = "FIXED";
        fichaTecnica.primaryAxisSizingMode = "AUTO";
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
        const content = createFrame("VERTICAL", 24, 24, { r: 1, g: 1, b: 1 });
        fichaTecnica.appendChild(content);
        setFillAndHug(content);
        if (!data.setup || data.setup.ficha !== false) {
          const infoSection = createSection(content, "Informa\xC3\xA7\xC3\xB5es B\xC3\xA1sicas");
          createRow(infoSection, "T\xC3\xADtulo do Projeto", data.step1.titulo);
          if (data.step1.jornada) createRow(infoSection, "Jornada", data.step1.jornada);
          if (data.step1.feature) createRow(infoSection, "Feature", data.step1.feature);
          createRow(infoSection, "Objetivo da Entrega", data.step1.objetivo);
          const subGrid = createFrame("HORIZONTAL", 0, 16);
          infoSection.appendChild(subGrid);
          setFillAndHug(subGrid);
          {
            const _statusMap = {
              "rascunho": { label: "Rascunho", bg: { r: 0.94, g: 0.95, b: 0.96 }, text: { r: 0.42, g: 0.47, b: 0.55 } },
              "em-revisao": { label: "Em Revis\xC3\xA3o", bg: { r: 1, g: 0.96, b: 0.84 }, text: { r: 0.72, g: 0.45, b: 0 } },
              "pronto-para-dev": { label: "Pronto para Dev", bg: { r: 0.86, g: 0.93, b: 1 }, text: { r: 0, g: 0.35, b: 0.79 } },
              "finalizado": { label: "Finalizado", bg: { r: 0.86, g: 0.97, b: 0.88 }, text: { r: 0.07, g: 0.53, b: 0.18 } }
            };
            const _sc = _statusMap[data.step1.status] || _statusMap["rascunho"];
            const statusCol = createFrame("VERTICAL", 0, 4);
            statusCol.name = "[Campo] Status";
            subGrid.appendChild(statusCol);
            setFillAndHug(statusCol);
            statusCol.appendChild(createText("Status", 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 }));
            const chip = createFrame("HORIZONTAL", 8, 4, _sc.bg);
            chip.cornerRadius = 999;
            chip.primaryAxisSizingMode = "AUTO";
            chip.counterAxisSizingMode = "AUTO";
            chip.counterAxisAlignItems = "CENTER";
            chip.appendChild(createText(_sc.label, 11, "Bold", _sc.text));
            statusCol.appendChild(chip);
          }
          createRow(subGrid, "Vers\xC3\xA3o", data.step1.versao);
        }
        if (data.step1.equipe && data.step1.equipe.length > 0) {
          const teamSection = createSection(content, "Equipe e Respons\xC3\xA1veis");
          data.step1.equipe.forEach((m) => {
            const mRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
            teamSection.appendChild(mRow);
            setFillAndHug(mRow);
            mRow.counterAxisAlignItems = "CENTER";
            mRow.cornerRadius = 8;
            mRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];
            const roleTag = createFrame("HORIZONTAL", 8, 4, { r: 0, g: 0.35, b: 0.79 });
            roleTag.cornerRadius = 4;
            roleTag.appendChild(createText(m.papel || "Membro", 10, "Bold", { r: 1, g: 1, b: 1 }));
            mRow.appendChild(roleTag);
            const nameText = createText(m.nome || "", 12, "Medium");
            nameText.layoutGrow = 1;
            mRow.appendChild(nameText);
            if (m.email) {
              const contactLink = createText("Contato", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
              contactLink.textDecoration = "UNDERLINE";
              contactLink.hyperlink = { type: "URL", value: "mailto:" + m.email };
              mRow.appendChild(contactLink);
            }
          });
          content.appendChild(teamSection);
          setFillAndHug(teamSection);
        }
        const _briefingQs = data.step2 && data.step2.briefingQuestions ? data.step2.briefingQuestions.filter((q) => q.answer && q.answer.trim()) : [];
        if (_briefingQs.length > 0) {
          const briefingSection = createSection(content, "Briefing Estrat\xC3\xA9gico");
          _briefingQs.forEach((q, idx) => {
            const qRow = createFrame("VERTICAL", 0, 4);
            qRow.name = `[Briefing] Pergunta ${idx + 1}`;
            briefingSection.appendChild(qRow);
            setFillAndHug(qRow);
            const qText = createText(`${idx + 1}. ${q.question || ""}`, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
            qRow.appendChild(qText);
            setFillAndHug(qText);
            const aText = createText(q.answer, 13, "Regular", { r: 0.12, g: 0.16, b: 0.23 });
            qRow.appendChild(aText);
            setFillAndHug(aText);
          });
          content.appendChild(briefingSection);
          setFillAndHug(briefingSection);
        }
        const _regras = data.step2 && data.step2.regras ? data.step2.regras : [];
        if (_regras.length > 0) {
          const rulesSection = createSection(content, "Regras de Neg\xC3\xB3cio e HUs");
          _regras.forEach((r) => {
            const rRow = createFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.98, b: 0.99 });
            rulesSection.appendChild(rRow);
            setFillAndHug(rRow);
            rRow.cornerRadius = 8;
            rRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];
            const rTitle = createText(r.titulo || "", 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
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
        const _allExcecoes = (data.frames || []).flatMap(
          (f) => (f.excecoes || []).map((e) => __spreadProps(__spreadValues({}, e), { _frame: f.nome }))
        );
        if (_allExcecoes.length > 0) {
          const excSection = createSection(content, "Cen\xC3\xA1rios de Exce\xC3\xA7\xC3\xA3o");
          _allExcecoes.forEach((e) => {
            const eRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
            excSection.appendChild(eRow);
            setFillAndHug(eRow);
            eRow.counterAxisAlignItems = "CENTER";
            eRow.cornerRadius = 8;
            eRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];
            const typeTag = createFrame("HORIZONTAL", 8, 4, { r: 0.9, g: 0.2, b: 0.2 });
            typeTag.cornerRadius = 4;
            typeTag.appendChild(createText(e.tipo || "", 10, "Bold", { r: 1, g: 1, b: 1 }));
            eRow.appendChild(typeTag);
            const titleText = createText(`${e.titulo || ""}${e._frame ? " (" + e._frame + ")" : ""}`, 12, "Medium");
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
        if (data.docs) {
          const docsSection = createSection(null, "Docs e Anexos");
          const docItems = [
            { key: "proto", label: "Prot\xC3\xB3tipo Naveg\xC3\xA1vel" },
            { key: "a11y", label: "Handoff Acessibilidade" },
            { key: "research", label: "Pesquisa de UX" }
          ];
          let hasDocs = false;
          docItems.forEach((item) => {
            const docData = data.docs[item.key];
            if (docData && docData.link) {
              hasDocs = true;
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
            }
          });
          if (hasDocs) {
            content.appendChild(docsSection);
            setFillAndHug(docsSection);
          }
        }
        const _globalSpecs = (data.specs || []).filter((s) => s.visible !== false);
        if (_globalSpecs.length > 0) {
          const specsSection = createSection(content, "Especifica\xC3\xA7\xC3\xB5es Visuais");
          _globalSpecs.forEach((s) => {
            const sRow = figma.createFrame();
            sRow.name = `[Spec/${s.letter || "A"}] ${s.name || ""}`;
            sRow.layoutMode = "VERTICAL";
            sRow.itemSpacing = 4;
            sRow.paddingLeft = 10;
            sRow.paddingRight = 10;
            sRow.paddingTop = 8;
            sRow.paddingBottom = 8;
            sRow.cornerRadius = 8;
            sRow.fills = [{ type: "SOLID", color: { r: 0.98, g: 0.98, b: 1 } }];
            sRow.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.92, b: 0.96 } }];
            sRow.primaryAxisSizingMode = "AUTO";
            sRow.counterAxisSizingMode = "AUTO";
            specsSection.appendChild(sRow);
            setFillAndHug(sRow);
            const sHeader = figma.createFrame();
            sHeader.layoutMode = "HORIZONTAL";
            sHeader.itemSpacing = 8;
            sHeader.fills = [];
            sHeader.counterAxisAlignItems = "CENTER";
            sHeader.primaryAxisSizingMode = "AUTO";
            sHeader.counterAxisSizingMode = "AUTO";
            sRow.appendChild(sHeader);
            const tag = figma.createFrame();
            tag.layoutMode = "HORIZONTAL";
            tag.resize(20, 20);
            tag.cornerRadius = 4;
            const tc = s.color ? { r: parseInt(s.color.slice(1, 3), 16) / 255, g: parseInt(s.color.slice(3, 5), 16) / 255, b: parseInt(s.color.slice(5, 7), 16) / 255 } : themeColor;
            tag.fills = [{ type: "SOLID", color: tc }];
            tag.primaryAxisAlignItems = "CENTER";
            tag.counterAxisAlignItems = "CENTER";
            const tagT = figma.createText();
            tagT.fontName = { family: "Inter", style: "Bold" };
            tagT.fontSize = 9;
            tagT.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            tagT.characters = s.letter || "A";
            tagT.textAutoResize = "WIDTH_AND_HEIGHT";
            tag.appendChild(tagT);
            sHeader.appendChild(tag);
            const sName = figma.createText();
            sName.fontName = { family: "Inter", style: "Bold" };
            sName.fontSize = 11;
            sName.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.16, b: 0.23 } }];
            sName.characters = s.name || "";
            sName.textAutoResize = "WIDTH_AND_HEIGHT";
            sHeader.appendChild(sName);
            if (s.note) {
              const sNote = figma.createText();
              sNote.fontName = { family: "Inter", style: "Regular" };
              sNote.fontSize = 10;
              sNote.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
              sNote.characters = s.note;
              sNote.textAutoResize = "WIDTH_AND_HEIGHT";
              sRow.appendChild(sNote);
            }
            const sExcs = s.excecoes || [];
            if (sExcs.length > 0) {
              const _excRgb = { "Erro": { r: 0.8, g: 0.15, b: 0.15 }, "Alerta": { r: 0.8, g: 0.5, b: 0 }, "Sucesso": { r: 0.1, g: 0.55, b: 0.25 }, "Confirma\xC3\xA7\xC3\xA3o": { r: 0.05, g: 0.35, b: 0.8 } };
              sExcs.forEach((exc) => {
                const eRow = figma.createFrame();
                eRow.layoutMode = "HORIZONTAL";
                eRow.itemSpacing = 6;
                eRow.fills = [];
                eRow.primaryAxisSizingMode = "AUTO";
                eRow.counterAxisSizingMode = "AUTO";
                eRow.counterAxisAlignItems = "CENTER";
                sRow.appendChild(eRow);
                const eType = figma.createText();
                eType.fontName = { family: "Inter", style: "Bold" };
                eType.fontSize = 9;
                eType.fills = [{ type: "SOLID", color: _excRgb[exc.tipo] || { r: 0.4, g: 0.4, b: 0.4 } }];
                eType.characters = (exc.tipo || "GERAL").toUpperCase();
                eType.textAutoResize = "WIDTH_AND_HEIGHT";
                const eTitle = figma.createText();
                eTitle.fontName = { family: "Inter", style: "Regular" };
                eTitle.fontSize = 10;
                eTitle.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
                eTitle.characters = exc.titulo || "";
                eTitle.textAutoResize = "WIDTH_AND_HEIGHT";
                eRow.appendChild(eType);
                eRow.appendChild(eTitle);
              });
            }
          });
          content.appendChild(specsSection);
          setFillAndHug(specsSection);
        }
        const _frames = data.frames || [];
        if (_frames.length > 0) {
          const framesSection = createSection(content, "Frames Documentados");
          _frames.forEach((f, fi) => {
            const fRow = createFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.99, b: 1 });
            fRow.name = `[Frame] ${f.nome || "Frame " + (fi + 1)}`;
            fRow.cornerRadius = 8;
            fRow.strokes = [{ type: "SOLID", color: { r: 0.88, g: 0.92, b: 0.96 } }];
            framesSection.appendChild(fRow);
            setFillAndHug(fRow);
            const fHeader = createFrame("HORIZONTAL", 0, 8);
            fHeader.counterAxisAlignItems = "CENTER";
            fRow.appendChild(fHeader);
            setFillAndHug(fHeader);
            const fName = createText(f.nome || "Frame", 12, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            fName.layoutGrow = 1;
            fHeader.appendChild(fName);
            if (f.isNewComponent) {
              const badge = createFrame("HORIZONTAL", 6, 3, { r: 0.38, g: 0.4, b: 0.95 });
              badge.cornerRadius = 4;
              badge.appendChild(createText("Novo componente", 9, "Bold", { r: 1, g: 1, b: 1 }));
              fHeader.appendChild(badge);
            }
            if (f.audit && f.audit.status) {
              createRow(fRow, "Auditoria DSC", f.audit.status + (f.audit.justificativa ? " \xE2\u20AC\u201D " + f.audit.justificativa : ""));
            }
            const fMeasurements = f.measurements || [];
            if (fMeasurements.length > 0) {
              const mLabel = createText(`Medidas (${fMeasurements.length})`, 10, "Bold", { r: 0.4, g: 0.45, b: 0.55 });
              fRow.appendChild(mLabel);
              setFillAndHug(mLabel);
              fMeasurements.forEach((m) => {
                const details = Array.isArray(m.details) ? m.details.join(" | ") : m.details || "";
                createRow(fRow, m.name || "Medida", details);
              });
            }
            const fSpecs = f.createdSpecs || [];
            if (fSpecs.length > 0) {
              const sLabel = createText(`Especifica\xC3\xA7\xC3\xB5es (${fSpecs.length})`, 10, "Bold", { r: 0.4, g: 0.45, b: 0.55 });
              fRow.appendChild(sLabel);
              setFillAndHug(sLabel);
              fSpecs.forEach((s) => {
                const sVal = `[${s.category || s.categoryLabel || "Geral"}]${s.note ? " " + s.note : ""}`;
                const sRow = createFrame("HORIZONTAL", 8, 6, { r: 0.97, g: 0.97, b: 1 });
                sRow.cornerRadius = 6;
                sRow.counterAxisAlignItems = "CENTER";
                fRow.appendChild(sRow);
                setFillAndHug(sRow);
                const sName = createText(s.name || s.label || "Spec", 11, "Bold");
                sName.layoutGrow = 1;
                sRow.appendChild(sName);
                const sCat = createText(sVal, 10, "Regular", { r: 0.5, g: 0.5, b: 0.6 });
                sRow.appendChild(sCat);
                setFillAndHug(sCat);
                if (s.link) {
                  sName.textDecoration = "UNDERLINE";
                  sName.hyperlink = { type: "URL", value: s.link };
                }
              });
            }
          });
          content.appendChild(framesSection);
          setFillAndHug(framesSection);
        }
        const _flows = data.createdFlows || [];
        if (_flows.length > 0) {
          const flowsSection = createSection(content, "Fluxos de Tela");
          const flowTypeLabel = { line_solid: "Linha s\xC3\xB3lida", line_dashed: "Linha tracejada", diamond: "Decis\xC3\xA3o", diamond_dashed: "Decis\xC3\xA3o tracejada", event_start: "In\xC3\xADcio", event_end: "Fim", gateway_parallel: "Paralelo" };
          _flows.forEach((flow, fi) => {
            const fRow = createFrame("HORIZONTAL", 12, 8, { r: 0.97, g: 0.96, b: 1 });
            fRow.name = `[Fluxo] ${flow.name || "Fluxo " + (fi + 1)}`;
            fRow.cornerRadius = 8;
            fRow.strokes = [{ type: "SOLID", color: { r: 0.86, g: 0.84, b: 0.96 } }];
            fRow.counterAxisAlignItems = "CENTER";
            flowsSection.appendChild(fRow);
            setFillAndHug(fRow);
            const fName = createText(flow.name || "Fluxo", 12, "Bold");
            fName.layoutGrow = 1;
            fRow.appendChild(fName);
            const fType = createText(flowTypeLabel[flow.type] || flow.type || "", 10, "Regular", { r: 0.45, g: 0.35, b: 0.75 });
            fRow.appendChild(fType);
            setFillAndHug(fType);
            if (flow.decisionText) {
              const dText = createText(`"${flow.decisionText}"`, 10, "Regular", { r: 0.5, g: 0.5, b: 0.6 });
              fRow.appendChild(dText);
              setFillAndHug(dText);
            }
          });
          content.appendChild(flowsSection);
          setFillAndHug(flowsSection);
        }
        fichaTecnica.appendChild(content);
        mainContainer.appendChild(fichaTecnica);
        if (!data.setup || data.setup.componentes !== false) {
          let createSpecList = function(title, items, type) {
            if (!items || items.length === 0) return null;
            const sec = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
            sec.name = `[Scan] ${title}`;
            sec.cornerRadius = 16;
            sec.resize(280, 100);
            sec.primaryAxisSizingMode = "AUTO";
            sec.counterAxisSizingMode = "FIXED";
            const titleNode = createText(title, 18, "Bold", { r: 0, g: 0.35, b: 0.79 });
            sec.appendChild(titleNode);
            setFillAndHug(titleNode);
            const listContainer = createFrame("VERTICAL", 0, 12);
            sec.appendChild(listContainer);
            setFillAndHug(listContainer);
            items.forEach((item) => {
              const elCard = createFrame("VERTICAL", 16, 12, { r: 0.98, g: 0.99, b: 1 });
              elCard.name = `[Token] ${item.name}`;
              elCard.cornerRadius = 12;
              elCard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.96 } }];
              elCard.strokeWeight = 1;
              listContainer.appendChild(elCard);
              setFillAndHug(elCard);
              const headerRow = createFrame("HORIZONTAL", 0, 12);
              headerRow.counterAxisAlignItems = "CENTER";
              elCard.appendChild(headerRow);
              setFillAndHug(headerRow);
              if (item.preview) {
                try {
                  const rect = figma.createRectangle();
                  rect.resize(32, 32);
                  rect.fills = [{ type: "IMAGE", imageHash: figma.createImage(item.preview).hash, scaleMode: "FIT" }];
                  rect.cornerRadius = 4;
                  headerRow.appendChild(rect);
                } catch (e) {
                }
              }
              const iName = createText(item.name, 13, "Bold", { r: 0.1, g: 0.15, b: 0.25 });
              iName.layoutGrow = 1;
              headerRow.appendChild(iName);
              const status = item.componentStatus || (item.isDS === true ? "ok" : item.isDS === "warning" ? "warning" : "error");
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
              if (item.properties && item.properties.length > 0) {
                const propsContainer = createFrame("VERTICAL", 0, 6);
                elCard.appendChild(propsContainer);
                setFillAndHug(propsContainer);
                item.properties.forEach((prop) => {
                  const pRow = createFrame("HORIZONTAL", 0, 8);
                  pRow.counterAxisAlignItems = "CENTER";
                  propsContainer.appendChild(pRow);
                  setFillAndHug(pRow);
                  try {
                    let setSvgColor = function(node, color) {
                      if ("fills" in node) node.fills = [{ type: "SOLID", color }];
                      if ("strokes" in node) node.strokes = [{ type: "SOLID", color }];
                      if ("children" in node) node.children.forEach((c) => setSvgColor(c, color));
                    };
                    const iconSvg = getIconSvg(prop.type);
                    const iconNode = figma.createNodeFromSvg(iconSvg);
                    iconNode.resize(12, 12);
                    const iconColor = prop.isDS === true ? { r: 0.1, g: 0.6, b: 0.3 } : prop.isDS === "warning" ? { r: 0.8, g: 0.5, b: 0 } : { r: 0.9, g: 0.3, b: 0.3 };
                    setSvgColor(iconNode, iconColor);
                    pRow.appendChild(iconNode);
                  } catch (e) {
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
          };
          const uiBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
          uiBoard.name = `${_handoffBase} / Interface`;
          uiBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
          uiBoard.cornerRadius = 16;
          uiBoard.resize(800, 100);
          uiBoard.counterAxisSizingMode = "FIXED";
          uiBoard.primaryAxisSizingMode = "AUTO";
          uiBoard.layoutAlign = "INHERIT";
          const uiTitle = createText("User Interface", 24, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
          uiBoard.appendChild(uiTitle);
          const _bqs2 = data.step2 && data.step2.briefingQuestions ? data.step2.briefingQuestions.filter((q) => q.answer && q.answer.trim()) : [];
          if (_bqs2.length > 0) {
            const briefingSection = createSection(fichaTecnica, "Briefing Estrat\xC3\xA9gico");
            _bqs2.forEach((q, idx) => {
              const qRow = createFrame("VERTICAL", 0, 4);
              qRow.name = `[Briefing] Pergunta ${idx + 1}`;
              briefingSection.appendChild(qRow);
              setFillAndHug(qRow);
              const qText = createText(`${idx + 1}. ${q.question || ""}`, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
              qRow.appendChild(qText);
              setFillAndHug(qText);
              const aText = createText(q.answer, 13, "Regular", { r: 0.12, g: 0.16, b: 0.23 });
              qRow.appendChild(aText);
              setFillAndHug(aText);
            });
          }
          const _allFrameSpecs = (data.frames || []).map((f) => f.specs).filter(Boolean);
          const _globalSpecs2 = data.step2 && data.step2.specs ? data.step2.specs : null;
          const _specsSource = _allFrameSpecs.length > 0 ? _allFrameSpecs : _globalSpecs2 ? [_globalSpecs2] : [];
          const specsData = {
            components: _specsSource.flatMap((s) => s.components || []),
            icons: _specsSource.flatMap((s) => s.icons || []),
            typography: _specsSource.flatMap((s) => s.typography || []),
            frames: _specsSource.flatMap((s) => s.frames || []),
            vectors: _specsSource.flatMap((s) => s.vectors || [])
          };
          const categories = [
            { title: "Componentes", items: specsData.components, type: "components" },
            { title: "\xC3\x8Dcones", items: specsData.icons, type: "icons" },
            { title: "Tipografia", items: specsData.typography, type: "typography" },
            { title: "Frames e Layouts", items: specsData.frames, type: "frames" },
            { title: "Vetores", items: specsData.vectors, type: "vectors" }
          ];
          const specsRow = figma.createFrame();
          specsRow.layoutMode = "HORIZONTAL";
          specsRow.layoutWrap = "WRAP";
          specsRow.itemSpacing = 16;
          specsRow.counterAxisSpacing = 16;
          specsRow.paddingLeft = 0;
          specsRow.paddingRight = 0;
          specsRow.paddingTop = 0;
          specsRow.paddingBottom = 0;
          specsRow.fills = [];
          specsRow.primaryAxisSizingMode = "AUTO";
          specsRow.counterAxisSizingMode = "AUTO";
          categories.forEach((cat) => {
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
        const selection = figma.currentPage.selection;
        if (selection.length > 0 && data.setup && (data.setup.espacamentos || data.setup.anatomia || data.setup.instancias)) {
          for (const node of selection) {
            if (node === mainContainer) continue;
            const specsBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
            specsBoard.name = `[Design Specs] ${node.name}`;
            specsBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
            specsBoard.cornerRadius = 16;
            specsBoard.resize(800, 100);
            specsBoard.counterAxisSizingMode = "FIXED";
            specsBoard.primaryAxisSizingMode = "AUTO";
            specsBoard.layoutAlign = "INHERIT";
            const specsTitle = createText("Design Specs: " + node.name, 24, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            specsBoard.appendChild(specsTitle);
            setFillAndHug(specsTitle);
            if (data.setup.anatomia || data.setup.espacamentos) {
              const layoutSec = createSection(specsBoard, "Layout & Posicionamento");
              const grid = createFrame("HORIZONTAL", 0, 16);
              grid.layoutWrap = "WRAP";
              createRow(grid, "Position", `X: ${Math.round(node.x)}, Y: ${Math.round(node.y)}`);
              createRow(grid, "Size", `W: ${Math.round(node.width)}, H: ${Math.round(node.height)}`);
              if ("layoutMode" in node && node.layoutMode !== "NONE") {
                createRow(grid, "Auto Layout", `Dir: ${node.layoutMode}, Spacing: ${node.itemSpacing}`);
                createRow(grid, "Padding", `T: ${node.paddingTop}, R: ${node.paddingRight}, B: ${node.paddingBottom}, L: ${node.paddingLeft}`);
              }
              if ("cornerRadius" in node && node.cornerRadius !== figma.mixed) {
                createRow(grid, "Corner Radius", `${node.cornerRadius}px`);
              }
              layoutSec.appendChild(grid);
              setFillAndHug(grid);
            }
            if (data.setup.instancias || data.setup.anatomia) {
              const appearSec = createSection(specsBoard, "Apar\xC3\xAAncia");
              const grid = createFrame("HORIZONTAL", 0, 16);
              grid.layoutWrap = "WRAP";
              grid.layoutAlign = "STRETCH";
              if ("opacity" in node) createRow(grid, "Opacity", `${Math.round(node.opacity * 100)}%`);
              if ("blendMode" in node && node.blendMode !== "PASS_THROUGH") createRow(grid, "Blend Mode", node.blendMode);
              if ("fills" in node && Array.isArray(node.fills)) {
                const sf = node.fills.find((f) => f.type === "SOLID");
                if (sf) {
                  const hex = rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase();
                  const token = getVariableInfo(node, "fills");
                  createRow(grid, "Fills", token ? token : hex);
                }
              }
              if ("strokes" in node && Array.isArray(node.strokes)) {
                const ss = node.strokes.find((s) => s.type === "SOLID");
                if (ss) {
                  const hex = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
                  const token = getVariableInfo(node, "strokes");
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
        if (data.isAudit && data.auditSummary) {
          const auditBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
          auditBoard.name = `${_handoffBase} / Auditoria`;
          auditBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
          auditBoard.cornerRadius = 16;
          auditBoard.resize(800, 100);
          auditBoard.counterAxisSizingMode = "FIXED";
          auditBoard.primaryAxisSizingMode = "AUTO";
          const auditTitle = createText("Relat\xC3\xB3rio de Auditoria", 24, "Bold", { r: 0, g: 0.35, b: 0.79 });
          auditBoard.appendChild(auditTitle);
          setFillAndHug(auditTitle);
          const summaryText = createText(`Ader\xC3\xAAncia ao Design System: ${data.auditSummary.adoption}%`, 18, "Bold", data.auditSummary.adoption > 90 ? { r: 0, g: 0.5, b: 0 } : { r: 0.8, g: 0, b: 0 });
          auditBoard.appendChild(summaryText);
          setFillAndHug(summaryText);
          const statsText = createText(`Resumo: ${data.auditSummary.issues.length} Fora do Padr\xC3\xA3o | ${data.auditSummary.adjustments.length} Ajustes`, 14, "Medium", { r: 0.4, g: 0.45, b: 0.5 });
          auditBoard.appendChild(statsText);
          setFillAndHug(statsText);
          if (data.auditSummary.adjustments && data.auditSummary.adjustments.length > 0) {
            const adjSection = createSection(auditBoard, "Ajustes Recomendados (Minorias)");
            data.auditSummary.adjustments.slice(0, 10).forEach((adj) => {
              const aRow = createText(`- [${adj.cat}] ${adj.name}`, 12, "Regular", { r: 0.7, g: 0.4, b: 0 });
              adjSection.appendChild(aRow);
              setFillAndHug(aRow);
            });
          }
          if (data.auditSummary.issues && data.auditSummary.issues.length > 0) {
            const issueList = createSection(auditBoard, "Pend\xC3\xAAncias Cr\xC3\xADticas (Fora do Padr\xC3\xA3o)");
            data.auditSummary.issues.slice(0, 20).forEach((issue) => {
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
        mainContainer.locked = true;
        figma.currentPage.appendChild(mainContainer);
        if (_isUpdate && _existingHandoffs.length > 0) {
          const _rightmost = _existingHandoffs.reduce((best, n) => {
            const bb = n.absoluteBoundingBox;
            const bestBb = best.absoluteBoundingBox;
            return bb && bestBb && bb.x + bb.width > bestBb.x + bestBb.width ? n : best;
          });
          const _bb = _rightmost.absoluteBoundingBox;
          if (_bb) {
            mainContainer.x = _bb.x + _bb.width + 80;
            mainContainer.y = _bb.y;
          } else {
            mainContainer.x = figma.viewport.center.x;
            mainContainer.y = figma.viewport.center.y;
          }
        } else {
          mainContainer.x = figma.viewport.center.x;
          mainContainer.y = figma.viewport.center.y;
        }
        figma.currentPage.selection = [mainContainer];
        figma.viewport.scrollAndZoomIntoView([mainContainer]);
        figma.ui.postMessage({ type: "handoff-complete", isUpdate: _isUpdate, timestamp: _ts });
      } catch (err) {
        console.error("Handoff Error:", err);
        figma.ui.postMessage({ type: "handoff-error", message: err.message });
      }
    }
    if (msg.type === "measure-nodes-custom") {
      let getVariableInfo2 = function(node, prop) {
        if (!node.boundVariables) return null;
        const boundVar = node.boundVariables[prop];
        if (!boundVar) return null;
        const varId = Array.isArray(boundVar) ? boundVar[0] && boundVar[0].id : boundVar.id;
        if (!varId) return null;
        const v = figma.variables.getVariableById(varId);
        return v ? v.name : null;
      };
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.notify("Selecione um ou mais itens para mensurar.");
        return;
      }
      const { measureTypes } = msg;
      (async () => {
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        } catch (e) {
        }
        function createMeasurementLine(x1, y1, x2, y2, value, type = "horizontal", redColor = { r: 1, g: 0.2, b: 0.2 }, tokenName = null) {
          const elements = [];
          const mainLine = figma.createLine();
          mainLine.strokes = [{ type: "SOLID", color: redColor }];
          mainLine.strokeWeight = 1;
          mainLine.x = x1;
          mainLine.y = y1;
          if (type === "horizontal") {
            mainLine.resize(Math.max(0.01, x2 - x1), 0);
            const t1 = figma.createLine();
            t1.strokes = [{ type: "SOLID", color: redColor }];
            t1.x = x1;
            t1.y = y1 - 4;
            t1.resize(8, 0);
            t1.rotation = -90;
            const t2 = figma.createLine();
            t2.strokes = [{ type: "SOLID", color: redColor }];
            t2.x = x2;
            t2.y = y1 - 4;
            t2.resize(8, 0);
            t2.rotation = -90;
            elements.push(mainLine, t1, t2);
          } else {
            mainLine.rotation = -90;
            mainLine.resize(Math.max(0.01, y2 - y1), 0);
            const t1 = figma.createLine();
            t1.strokes = [{ type: "SOLID", color: redColor }];
            t1.x = x1 - 4;
            t1.y = y1;
            t1.resize(8, 0);
            const t2 = figma.createLine();
            t2.strokes = [{ type: "SOLID", color: redColor }];
            t2.x = x1 - 4;
            t2.y = y2;
            t2.resize(8, 0);
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
          figma.currentPage.appendChild(label);
          if (type === "horizontal") {
            const dist = Math.abs(x2 - x1);
            const cx = x1 + (x2 - x1) / 2;
            if (dist < bg.width + 8) {
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
              bg.x = x1 - bg.width / 2;
              bg.y = y2 + 6;
            } else {
              bg.x = x1 - bg.width / 2;
              bg.y = cy - bg.height / 2;
            }
          }
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
          if (measureTypes && measureTypes.includes("wh")) {
            const wToken = getVariableInfo2(node, "width");
            const hToken = getVariableInfo2(node, "height");
            items.push(...createMeasurementLine(bounds.x, bounds.y - 20, bounds.x + bounds.width, bounds.y - 20, bounds.width, "horizontal", { r: 1, g: 0.2, b: 0.2 }, wToken));
            items.push(...createMeasurementLine(bounds.x - 20, bounds.y, bounds.x - 20, bounds.y + bounds.height, bounds.height, "vertical", { r: 1, g: 0.2, b: 0.2 }, hToken));
            let whLabel = `Dimens\xC3\xB5es: ${Math.round(bounds.width)}x${Math.round(bounds.height)}`;
            if (wToken || hToken) whLabel += ` [Tokens: ${wToken || "-"} x ${hToken || "-"}]`;
            appliedDetails.push(whLabel);
          }
          if (measureTypes && measureTypes.includes("inner") && "layoutMode" in node && node.layoutMode !== "NONE") {
            const shiftX = bounds.x + bounds.width / 2 - 12;
            const shiftY = bounds.y + bounds.height / 2 - 12;
            let pads = [];
            const tT = getVariableInfo2(node, "paddingTop");
            const tB = getVariableInfo2(node, "paddingBottom");
            const tL = getVariableInfo2(node, "paddingLeft");
            const tR = getVariableInfo2(node, "paddingRight");
            if (node.paddingTop > 0) {
              items.push(...createMeasurementLine(shiftX, bounds.y, shiftX, bounds.y + node.paddingTop, node.paddingTop, "vertical", { r: 0, g: 0.5, b: 1 }, tT));
              pads.push(`Top: ${node.paddingTop}${tT ? " [" + tT + "]" : ""}`);
            }
            if (node.paddingBottom > 0) {
              items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height - node.paddingBottom, shiftX, bounds.y + bounds.height, node.paddingBottom, "vertical", { r: 0, g: 0.5, b: 1 }, tB));
              pads.push(`Bottom: ${node.paddingBottom}${tB ? " [" + tB + "]" : ""}`);
            }
            if (node.paddingLeft > 0) {
              items.push(...createMeasurementLine(bounds.x, shiftY, bounds.x + node.paddingLeft, shiftY, node.paddingLeft, "horizontal", { r: 0, g: 0.5, b: 1 }, tL));
              pads.push(`Left: ${node.paddingLeft}${tL ? " [" + tL + "]" : ""}`);
            }
            if (node.paddingRight > 0) {
              items.push(...createMeasurementLine(bounds.x + bounds.width - node.paddingRight, shiftY, bounds.x + bounds.width, shiftY, node.paddingRight, "horizontal", { r: 0, g: 0.5, b: 1 }, tR));
              pads.push(`Right: ${node.paddingRight}${tR ? " [" + tR + "]" : ""}`);
            }
            if (pads.length > 0) appliedDetails.push(`Padding Interno: ${pads.join(", ")}`);
          }
          if (measureTypes && measureTypes.includes("spacing") && "layoutMode" in node && node.layoutMode !== "NONE" && node.children.length > 1) {
            let spaceCount = 0;
            const gapToken = getVariableInfo2(node, "itemSpacing");
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
                  items.push(...createMeasurementLine(startX, y, endX, y, endX - startX, "horizontal", { r: 0.8, g: 0.2, b: 0.8 }, gapToken));
                  spaceCount++;
                }
              } else if (node.layoutMode === "VERTICAL") {
                const startY = b1.y + b1.height;
                const endY = b2.y;
                const x = bounds.x + bounds.width / 2;
                if (endY > startY) {
                  items.push(...createMeasurementLine(x, startY, x, endY, endY - startY, "vertical", { r: 0.8, g: 0.2, b: 0.8 }, gapToken));
                  spaceCount++;
                }
              }
            }
            if (spaceCount > 0) appliedDetails.push(`Gaps: ${spaceCount} espa\xC3\xA7os de ${node.itemSpacing}px ${gapToken ? "[" + gapToken + "]" : ""}`);
          }
          if (measureTypes && measureTypes.includes("outer")) {
            if (node.parent && node.parent.type !== "PAGE") {
              const pb = node.parent.absoluteRenderBounds || node.parent.absoluteBoundingBox;
              if (pb) {
                const shiftX = bounds.x + bounds.width / 2 + 12;
                const shiftY = bounds.y + bounds.height / 2 + 12;
                let outers = [];
                if (bounds.y > pb.y) {
                  items.push(...createMeasurementLine(shiftX, pb.y, shiftX, bounds.y, bounds.y - pb.y, "vertical", { r: 1, g: 0.5, b: 0 }));
                  outers.push(`Top: ${Math.round(bounds.y - pb.y)}`);
                }
                if (bounds.x > pb.x) {
                  items.push(...createMeasurementLine(pb.x, shiftY, bounds.x, shiftY, bounds.x - pb.x, "horizontal", { r: 1, g: 0.5, b: 0 }));
                  outers.push(`Left: ${Math.round(bounds.x - pb.x)}`);
                }
                if (pb.x + pb.width > bounds.x + bounds.width) {
                  items.push(...createMeasurementLine(bounds.x + bounds.width, shiftY, pb.x + pb.width, shiftY, pb.x + pb.width - (bounds.x + bounds.width), "horizontal", { r: 1, g: 0.5, b: 0 }));
                  outers.push(`Right: ${Math.round(pb.x + pb.width - (bounds.x + bounds.width))}`);
                }
                if (pb.y + pb.height > bounds.y + bounds.height) {
                  items.push(...createMeasurementLine(shiftX, bounds.y + bounds.height, shiftX, pb.y + pb.height, pb.y + pb.height - (bounds.y + bounds.height), "vertical", { r: 1, g: 0.5, b: 0 }));
                  outers.push(`Bottom: ${Math.round(pb.y + pb.height - (bounds.y + bounds.height))}`);
                }
                if (outers.length > 0) appliedDetails.push(`Espa\xC3\xA7amento Externo: ${outers.join(", ")}`);
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
        }
        figma.ui.postMessage({ type: "measurements-applied", data: appliedMeasuresList });
        figma.notify("Medidas aplicadas com sucesso!");
      })();
    }
    if (msg.type === "scan-frame") {
      let audit = function(propType, propValue, propKey, propName) {
        const result = auditProperty(propName, propValue, propType, propKey, referenceTokens, isAudit);
        const isDS = result.score >= AUDIT_SCORE.EXACT ? true : result.score >= AUDIT_SCORE.SOFT ? "warning" : false;
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
      }, rgbToHex2 = function(r, g, b) {
        const toHex = (c) => {
          const hex = Math.round(c * 255).toString(16);
          return hex.length === 1 ? "0" + hex : hex;
        };
        return "#" + toHex(r) + toHex(g) + toHex(b);
      }, getVar = function(n, p) {
        if (!n.boundVariables) return null;
        const v = n.boundVariables[p];
        if (!v) return null;
        const id = Array.isArray(v) ? v[0] && v[0].id : v.id;
        if (!id) return null;
        const variable = figma.variables.getVariableById(id);
        return variable ? { name: variable.name, key: variable.key } : null;
      }, extractNodeProperties = function(n) {
        const props = [];
        if ("fills" in n && Array.isArray(n.fills)) {
          let styleName = null;
          let styleKey = null;
          if ("fillStyleId" in n && typeof n.fillStyleId === "string" && n.fillStyleId) {
            const style = figma.getStyleById(n.fillStyleId);
            if (style) {
              styleName = style.name;
              styleKey = style.key;
            }
          }
          for (const fill of n.fills) {
            if (fill.visible === false) continue;
            if (fill.type === "SOLID" && fill.color) {
              const hex = rgbToHex2(fill.color.r, fill.color.g, fill.color.b).toUpperCase();
              const vInfo = getVar(n, "fills");
              const name = vInfo && vInfo.name || styleName || hex;
              const key = vInfo && vInfo.key || styleKey;
              props.push(__spreadValues({ type: "color", name, value: hex, rawValue: hex, key, variableKey: vInfo ? vInfo.key : null, styleKey, label: "Cor (Fill)" }, audit("colors", hex, key, name)));
            }
          }
        }
        if (n.type === "TEXT") {
          let styleName = null;
          let styleKey = null;
          if ("textStyleId" in n && typeof n.textStyleId === "string" && n.textStyleId !== figma.mixed && n.textStyleId) {
            const style = figma.getStyleById(n.textStyleId);
            if (style) {
              styleName = style.name;
              styleKey = style.key;
            }
          }
          const family = n.fontName && n.fontName !== figma.mixed ? n.fontName.family : "Mixed";
          const fontStyle = n.fontName && n.fontName !== figma.mixed ? n.fontName.style : "Mixed";
          const size = n.fontSize && n.fontSize !== figma.mixed ? n.fontSize : "Mixed";
          const name = styleName || `${family} ${fontStyle} (${size}px)`;
          const rawSize = typeof size === "number" ? size : null;
          props.push(__spreadValues({ type: "typography", name, value: name, rawValue: rawSize, key: styleKey, styleKey, label: "Tipografia" }, audit("typography", name, styleKey, name)));
        }
        if ("layoutMode" in n && n.layoutMode !== "NONE") {
          if (n.itemSpacing !== figma.mixed && n.itemSpacing > 0) {
            const vInfo = getVar(n, "itemSpacing");
            const val = `${n.itemSpacing}px`;
            const name = vInfo && vInfo.name || val;
            const propKey = vInfo ? vInfo.key : null;
            props.push(__spreadValues({ type: "spacing", name, value: val, rawValue: n.itemSpacing, key: propKey, variableKey: propKey, label: "Gap" }, audit("spacing", val, propKey, name)));
          }
          const paddings = [
            { prop: "paddingTop", label: "Top" },
            { prop: "paddingRight", label: "Right" },
            { prop: "paddingBottom", label: "Bottom" },
            { prop: "paddingLeft", label: "Left" }
          ];
          paddings.forEach((p) => {
            if (n[p.prop] > 0) {
              const vInfo = getVar(n, p.prop);
              const val = `${n[p.prop]}px`;
              const name = vInfo && vInfo.name || val;
              const propKey = vInfo ? vInfo.key : null;
              props.push(__spreadValues({ type: "spacing", name, value: val, rawValue: n[p.prop], key: propKey, variableKey: propKey, label: `Padding ${p.label}` }, audit("spacing", val, propKey, name)));
            }
          });
        }
        if ("strokes" in n && Array.isArray(n.strokes) && n.strokes.length > 0) {
          const visibleStroke = n.strokes.find((s) => s.visible !== false && (s.opacity === void 0 || s.opacity > 0));
          if (visibleStroke && "strokeWeight" in n && n.strokeWeight !== figma.mixed && n.strokeWeight > 0) {
            const vInfo = getVar(n, "strokeWeight");
            const val = `${n.strokeWeight}px`;
            const name = vInfo && vInfo.name || val;
            const propKey = vInfo ? vInfo.key : null;
            const whitelisted = val === "1px" || val === "0px";
            const auditFields = whitelisted ? { isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "value", matchedIn: null } : audit("borders", val, propKey, name);
            props.push(__spreadValues({ type: "strokeWeight", name, value: val, rawValue: n.strokeWeight, key: propKey, variableKey: propKey, label: "Border Width" }, auditFields));
            if (visibleStroke.type === "SOLID") {
              const hex = rgbToHex2(visibleStroke.color.r, visibleStroke.color.g, visibleStroke.color.b).toUpperCase();
              let styleName = null;
              let styleKey = null;
              if ("strokeStyleId" in n && n.strokeStyleId) {
                const st = figma.getStyleById(n.strokeStyleId);
                if (st) {
                  styleName = st.name;
                  styleKey = st.key;
                }
              }
              const sVar = getVar(n, "strokes");
              const strokeKey = sVar && sVar.key || styleKey;
              const strokeName = sVar && sVar.name || styleName || hex;
              props.push(__spreadValues({ type: "stroke", name: strokeName, value: hex, rawValue: hex, key: strokeKey, variableKey: sVar ? sVar.key : null, styleKey, label: "Border Color" }, audit("colors", hex, strokeKey, strokeName)));
            }
          }
        }
        if ("cornerRadius" in n && n.cornerRadius !== figma.mixed && n.cornerRadius > 0) {
          const vInfo = getVar(n, "cornerRadius");
          const val = `${n.cornerRadius}px`;
          const name = vInfo && vInfo.name || val;
          const propKey = vInfo ? vInfo.key : null;
          props.push(__spreadValues({ type: "radius", name, value: val, rawValue: n.cornerRadius, key: propKey, variableKey: propKey, label: "Radius" }, audit("borders", val, propKey, name)));
        }
        if ("effects" in n && Array.isArray(n.effects)) {
          let styleName = null;
          let styleKey = null;
          if ("effectStyleId" in n && n.effectStyleId) {
            const style = figma.getStyleById(n.effectStyleId);
            if (style) {
              styleName = style.name;
              styleKey = style.key;
            }
          }
          for (const effect of n.effects) {
            if (effect.visible) {
              const name = styleName || `${effect.type} (${effect.type.includes("SHADOW") ? "Sombra" : "Blur"})`;
              props.push(__spreadValues({ type: "effect", name, value: effect.type, key: styleKey, styleKey, label: "Effect" }, audit("effects", effect.type, styleKey, name)));
            }
          }
        }
        if (n.type !== "PAGE" && n.parent && n.parent.type !== "PAGE") {
          const parent = n.parent;
          let wMode = "Fixed";
          let hMode = "Fixed";
          if (parent.layoutMode === "HORIZONTAL" && n.layoutGrow === 1) wMode = "Fill Container";
          else if (parent.layoutMode === "VERTICAL" && n.layoutAlign === "STRETCH") wMode = "Fill Container";
          else if (n.layoutMode && (n.layoutMode === "HORIZONTAL" && n.primaryAxisSizingMode === "AUTO" || n.layoutMode === "VERTICAL" && n.counterAxisSizingMode === "AUTO")) wMode = "Hug Contents";
          if (parent.layoutMode === "VERTICAL" && n.layoutGrow === 1) hMode = "Fill Container";
          else if (parent.layoutMode === "HORIZONTAL" && n.layoutAlign === "STRETCH") hMode = "Fill Container";
          else if (n.layoutMode && (n.layoutMode === "VERTICAL" && n.primaryAxisSizingMode === "AUTO" || n.layoutMode === "HORIZONTAL" && n.counterAxisSizingMode === "AUTO")) hMode = "Hug Contents";
          props.push({ type: "layout", name: wMode, value: wMode, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: "W Sizing" });
          props.push({ type: "layout", name: hMode, value: hMode, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: "H Sizing" });
        }
        if (n.type === "INSTANCE" && n.componentProperties) {
          Object.entries(n.componentProperties).forEach(([propName, propObj]) => {
            const cleanName = propName.split("#")[0];
            const val = String(propObj.value);
            props.push({ type: "variant", name: cleanName, value: val, isDS: true, score: isAudit ? AUDIT_SCORE.EXACT : null, matchedBy: "intrinsic", matchedIn: null, label: `Prop: ${cleanName}` });
          });
        }
        return props;
      }, addElement = function(category, node, props) {
        if (!isAudit && allowedCategories && allowedCategories.length > 0) {
          let isAllowed = false;
          if (category === "frames" && allowedCategories.includes("containers")) isAllowed = true;
          else if (category === "vectors" && allowedCategories.includes("shapes")) isAllowed = true;
          else if (allowedCategories.includes(category)) isAllowed = true;
          if (!isAllowed) return;
        }
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
        }
        const variants = props.filter((p) => p.type === "variant").map((p) => ({ name: p.name, value: p.value }));
        const map = specs[category];
        if (!map.has(name)) {
          const itemObj = {
            name,
            type: category,
            nodeType: node.type,
            componentKey,
            layerName: name,
            isDS: dsElement,
            score: elementScore,
            matchedBy: elementMatchedBy,
            matchedIn: elementMatchedIn,
            matchedTokenName: elementMatchedTokenName,
            variants,
            nodeId: node.id,
            layers: /* @__PURE__ */ new Set([name]),
            properties: props
          };
          map.set(name, itemObj);
          frameJson.elements[category].push({
            name,
            type: category,
            nodeType: node.type,
            componentKey,
            layerName: name,
            isDS: dsElement,
            score: elementScore,
            matchedBy: elementMatchedBy,
            matchedIn: elementMatchedIn,
            matchedTokenName: elementMatchedTokenName,
            variants,
            properties: props
          });
        } else {
          const item = map.get(name);
          item.layers.add(name);
        }
      }, extractSpecs = function(n, depth) {
        if ((depth || 0) > 8) return;
        if (n.visible === false) return;
        try {
          const props = extractNodeProperties(n);
          let category = "frames";
          const nameLower = n.name.toLowerCase();
          const isIcon = nameLower.includes("icon") || nameLower.includes("ic-") || n.type === "INSTANCE" && n.width <= 32 && n.height <= 32 && !nameLower.includes("button");
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
          if ("children" in n && n.children) {
            for (const child of n.children) {
              extractSpecs(child, (depth || 0) + 1);
            }
          }
        } catch (err) {
          const msg2 = err && err.message ? err.message : String(err);
          const stack = err && err.stack ? err.stack : "";
          console.error("Erro ao extrair specs do node:", n.name, "(type=" + n.type + ", id=" + n.id + ")", msg2, stack);
        }
      };
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
          error: "Nenhum item selecionado. Por favor, selecione um ou mais frames, se\xC3\xA7\xC3\xB5es ou grupos no Figma para escanear."
        });
        return;
      }
      const specs = {
        components: /* @__PURE__ */ new Map(),
        icons: /* @__PURE__ */ new Map(),
        typography: /* @__PURE__ */ new Map(),
        frames: /* @__PURE__ */ new Map(),
        vectors: /* @__PURE__ */ new Map()
      };
      const frameJson = frameJsonTemplate();
      const selectedLibSlugs = Array.isArray(msg.selectedLibSlugs) && msg.selectedLibSlugs.length > 0 ? msg.selectedLibSlugs : null;
      const rawReferenceTokens = msg.referenceTokens || null;
      const referenceTokens = (() => {
        if (!rawReferenceTokens || !selectedLibSlugs) return rawReferenceTokens;
        const list = Array.isArray(rawReferenceTokens) ? rawReferenceTokens : [rawReferenceTokens];
        const filtered = list.filter((lib) => lib && lib.slug && selectedLibSlugs.includes(lib.slug));
        return filtered.length > 0 ? filtered : rawReferenceTokens;
      })();
      const isAudit = msg.isAudit || false;
      const allowedCategories = msg.categories || null;
      for (const node of selection) {
        extractSpecs(node);
      }
      let framePreview = null;
      if (selection.length > 0 && "exportAsync" in selection[0]) {
        try {
          framePreview = await selection[0].exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
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
            if (node && "exportAsync" in node) {
              previewPromises.push(
                node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } }).then((bytes) => {
                  item.preview = bytes;
                }).catch(() => {
                  item.preview = null;
                })
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
        return Array.from(map.values()).map((item) => {
          const newItem = Object.assign({}, item);
          newItem.layers = Array.from(item.layers);
          return newItem;
        }).sort((a, b) => {
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
          frameJson,
          fileKey: figma.fileKey,
          framePreview
        }
      });
    }
    if (msg.type === "get-selection-link") {
      const selection = figma.currentPage.selection;
      if (selection.length > 0) {
        const node = selection[0];
        const fileKey = figma.fileKey;
        const deeplink = fileKey ? `https://www.figma.com/design/${fileKey}?node-id=${encodeURIComponent(node.id)}` : "";
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
          deeplink: ""
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
          figma.notify("Elemento n\xC3\xA3o encontrado (j\xC3\xA1 removido?).");
        }
      } catch (e) {
        figma.notify("Erro ao remover: " + e.message);
      }
    }
    if (msg.type === "request-spec-properties") {
      const properties = [];
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.notify("Selecione um elemento para escane\xC3\xA1-lo.");
        figma.ui.postMessage({ type: "show-spec-properties", properties: [] });
        return;
      }
      const node = selection[0];
      const getVar = (p) => {
        if (!node.boundVariables) return null;
        const v = node.boundVariables[p];
        if (!v) return null;
        const id = Array.isArray(v) ? v[0] && v[0].id : v.id;
        if (!id) return null;
        const variable = figma.variables.getVariableById(id);
        return variable ? variable.name : null;
      };
      if ("height" in node) {
        const token = getVar("height");
        properties.push({ key: "height", label: "Altura", value: Math.round(node.height) + "px", token });
      }
      if ("width" in node) {
        const token = getVar("width");
        properties.push({ key: "width", label: "Largura", value: Math.round(node.width) + "px", token });
      }
      if ("cornerRadius" in node && node.cornerRadius !== figma.mixed && node.cornerRadius > 0) {
        const token = getVar("cornerRadius");
        properties.push({ key: "radius", label: "Raio de borda", value: node.cornerRadius + "px", token });
      }
      if ("layoutMode" in node && node.layoutMode !== "NONE") {
        properties.push({ key: "direction", label: "Dire\xC3\xA7\xC3\xA3o", value: node.layoutMode === "HORIZONTAL" ? "Horizontal" : "Vertical" });
        const align = `${node.primaryAxisAlignItems} / ${node.counterAxisAlignItems}`;
        properties.push({ key: "alignment", label: "Alinhamento", value: align });
        if (node.itemSpacing !== figma.mixed && node.itemSpacing > 0) {
          const token = getVar("itemSpacing");
          properties.push({ key: "gap", label: "Espa\xC3\xA7amento (Gap)", value: node.itemSpacing + "px", token });
        }
        const pt = node.paddingTop || 0, pr = node.paddingRight || 0, pb = node.paddingBottom || 0, pl = node.paddingLeft || 0;
        if (pt + pr + pb + pl > 0) {
          const tT = getVar("paddingTop"), tR = getVar("paddingRight"), tB = getVar("paddingBottom"), tL = getVar("paddingLeft");
          const vT = tT || `${pt}px`, vR = tR || `${pr}px`, vB = tB || `${pb}px`, vL = tL || `${pl}px`;
          let val, token;
          if (vT === vR && vR === vB && vB === vL) {
            val = vT;
          } else if (vT === vB && vR === vL) {
            val = `${vT} ${vR}`;
          } else {
            val = `${vT} ${vR} ${vB} ${vL}`;
          }
          token = tT || tR || tB || tL || null;
          properties.push({ key: "padding", label: "Padding", value: val, token });
        }
      }
      if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
        const sf = node.fills.find((f) => f.type === "SOLID");
        if (sf) {
          const token = getVar("fills");
          const hexFill = rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase();
          properties.push({ key: "fill", label: "Preenchimento", value: token || hexFill, token });
        }
      }
      if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
        const ss = node.strokes.find((s) => s.type === "SOLID");
        if (ss) {
          const token = getVar("strokes");
          const hexStroke = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
          properties.push({ key: "stroke", label: "Contorno", value: token || hexStroke, token });
        }
        if (node.strokeWeight !== figma.mixed && node.strokeWeight > 0) {
          properties.push({ key: "strokeWidth", label: "Espessura de borda", value: node.strokeWeight + "px" });
        }
      }
      if (node.type === "TEXT") {
        if (node.fontName !== figma.mixed) {
          properties.push({ key: "fontFamily", label: "Fam\xC3\xADlia", value: node.fontName.family });
          properties.push({ key: "fontWeight", label: "Peso", value: node.fontName.style });
        }
        if (node.fontSize !== figma.mixed) {
          const token = getVar("fontSize");
          properties.push({ key: "fontSize", label: "Tamanho da fonte", value: node.fontSize + "px", token });
        }
      }
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
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
          figma.notify("Selecione um elemento.");
          return;
        }
        const node = selection[0];
        const opts = msg.opts;
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        } catch (e) {
        }
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        } catch (e) {
        }
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        } catch (e) {
        }
        const hex = opts.color.replace("#", "");
        const cr = parseInt(hex.substring(0, 2), 16) / 255;
        const cg = parseInt(hex.substring(2, 4), 16) / 255;
        const cb = parseInt(hex.substring(4, 6), 16) / 255;
        const themeColor2 = { r: cr, g: cg, b: cb };
        const _specBase = `[Spec/${opts.letter}] ${node.name}`;
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
        specCard.strokes = [{ type: "SOLID", color: themeColor2 }];
        specCard.strokeWeight = 1.5;
        specCard.primaryAxisSizingMode = "AUTO";
        specCard.counterAxisSizingMode = "AUTO";
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
        tagCircle.fills = [{ type: "SOLID", color: themeColor2 }];
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
          pill.paddingLeft = 8;
          pill.paddingRight = 8;
          pill.paddingTop = 4;
          pill.paddingBottom = 4;
          pill.cornerRadius = 12;
          pill.primaryAxisSizingMode = "AUTO";
          pill.counterAxisSizingMode = "AUTO";
          pill.fills = [];
          pill.strokes = [{ type: "SOLID", color: themeColor2 }];
          const pillText = figma.createText();
          pillText.fontName = { family: "Inter", style: "Medium" };
          pillText.fontSize = 10;
          pillText.fills = [{ type: "SOLID", color: themeColor2 }];
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
        if (opts.properties && opts.properties.length > 0) {
          const propsFrame = figma.createFrame();
          propsFrame.layoutMode = "VERTICAL";
          propsFrame.itemSpacing = 4;
          propsFrame.fills = [];
          propsFrame.primaryAxisSizingMode = "AUTO";
          propsFrame.counterAxisSizingMode = "AUTO";
          propsFrame.name = `${_specBase}/Propriedades`;
          propsFrame.layoutAlign = "INHERIT";
          opts.properties.forEach((p) => {
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
            pVal.fills = [{ type: "SOLID", color: p.token ? themeColor2 : { r: 0.1, g: 0.1, b: 0.1 } }];
            pVal.characters = p.token || String(p.value);
            pVal.textAutoResize = "WIDTH_AND_HEIGHT";
            row.appendChild(pLabel);
            row.appendChild(pVal);
            propsFrame.appendChild(row);
          });
          specCard.appendChild(propsFrame);
        }
        const specExcecoes = opts.excecoes || [];
        if (specExcecoes.length > 0) {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
          const excFrame = figma.createFrame();
          excFrame.layoutMode = "VERTICAL";
          excFrame.itemSpacing = 6;
          excFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.93 } }];
          excFrame.paddingLeft = 10;
          excFrame.paddingRight = 10;
          excFrame.paddingTop = 8;
          excFrame.paddingBottom = 8;
          excFrame.cornerRadius = 6;
          excFrame.primaryAxisSizingMode = "AUTO";
          excFrame.counterAxisSizingMode = "AUTO";
          const excTitle = figma.createText();
          excTitle.fontName = { family: "Inter", style: "Bold" };
          excTitle.fontSize = 9;
          excTitle.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.3, b: 0.1 } }];
          excTitle.characters = `CEN\xC3\x81RIOS DE EXCE\xC3\u2021\xC3\u0192O (${specExcecoes.length})`;
          excTitle.textAutoResize = "WIDTH_AND_HEIGHT";
          excFrame.appendChild(excTitle);
          const _excTypeRgb = {
            "Erro": { r: 0.8, g: 0.15, b: 0.15 },
            "Alerta": { r: 0.8, g: 0.5, b: 0 },
            "Sucesso": { r: 0.1, g: 0.55, b: 0.25 },
            "Confirma\xC3\xA7\xC3\xA3o": { r: 0.05, g: 0.35, b: 0.8 }
          };
          specExcecoes.forEach((exc) => {
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
            typeLabel.characters = (exc.tipo || "GERAL").toUpperCase();
            typeLabel.textAutoResize = "WIDTH_AND_HEIGHT";
            const titleLabel = figma.createText();
            titleLabel.fontName = { family: "Inter", style: "Regular" };
            titleLabel.fontSize = 10;
            titleLabel.fills = [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2 } }];
            titleLabel.characters = `${exc.titulo || ""}${exc.notas ? " \xE2\u20AC\u201D " + exc.notas : ""}`;
            titleLabel.textAutoResize = "WIDTH_AND_HEIGHT";
            excRow.appendChild(typeLabel);
            excRow.appendChild(titleLabel);
            excFrame.appendChild(excRow);
          });
          specCard.appendChild(excFrame);
        }
        if (opts.link) {
          const linkTxt = figma.createText();
          linkTxt.fontName = { family: "Inter", style: "Regular" };
          linkTxt.fontSize = 11;
          linkTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0.4, b: 0.8 } }];
          linkTxt.characters = "Link: " + opts.link;
          linkTxt.textAutoResize = "WIDTH_AND_HEIGHT";
          specCard.appendChild(linkTxt);
        }
        let groupNodes = [];
        const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
        if (bounds) {
          const contour = figma.createFrame();
          contour.name = `${_specBase}/Destaque`;
          contour.resize(Math.max(bounds.width + 32, 40), Math.max(bounds.height + 32, 40));
          figma.currentPage.appendChild(contour);
          contour.x = bounds.x - 16;
          contour.y = bounds.y - 16;
          contour.fills = [];
          contour.strokes = [{ type: "SOLID", color: themeColor2 }];
          contour.strokeWeight = 2;
          contour.dashPattern = [4, 4];
          contour.locked = true;
          const chip = figma.createFrame();
          chip.layoutMode = "HORIZONTAL";
          chip.primaryAxisSizingMode = "FIXED";
          chip.counterAxisSizingMode = "FIXED";
          chip.resize(42, 42);
          chip.cornerRadius = 8;
          chip.fills = [{ type: "SOLID", color: themeColor2 }];
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
          figma.currentPage.appendChild(specCard);
          const side = opts.guideSide || "right";
          const spacing = 100;
          let targetX = bounds.x + bounds.width + spacing;
          let targetY = bounds.y;
          if (side === "left") {
            targetX = bounds.x - specCard.width - spacing;
          } else if (side === "top") {
            targetX = bounds.x + bounds.width / 2 - specCard.width / 2;
            targetY = bounds.y - specCard.height - spacing;
          } else if (side === "bottom") {
            targetX = bounds.x + bounds.width / 2 - specCard.width / 2;
            targetY = bounds.y + bounds.height + spacing;
          }
          const colKey = `${side}_${Math.round(targetX / 50) * 50}`;
          if (specColumnTracker[colKey] !== void 0) {
            targetY = specColumnTracker[colKey] + 16;
          }
          specCard.x = Math.round(targetX);
          specCard.y = Math.round(targetY);
          specColumnTracker[colKey] = Math.round(targetY) + specCard.height;
          groupNodes.push(specCard);
          const connector = figma.createVector();
          connector.name = `${_specBase}/Conector`;
          let startPt = { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
          let endPt = { x: specCard.x, y: specCard.y + 40 };
          if (side === "left") {
            startPt = { x: bounds.x, y: bounds.y + bounds.height / 2 };
            endPt = { x: specCard.x + specCard.width, y: specCard.y + 40 };
          } else if (side === "top") {
            startPt = { x: bounds.x + bounds.width / 2, y: bounds.y };
            endPt = { x: specCard.x + specCard.width / 2, y: specCard.y + specCard.height };
          } else if (side === "bottom") {
            startPt = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
            endPt = { x: specCard.x + specCard.width / 2, y: specCard.y };
          }
          connector.vectorPaths = [{ windingRule: "NONZERO", data: `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}` }];
          connector.strokes = [{ type: "SOLID", color: themeColor2 }];
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
        const specGroup = figma.group(groupNodes, figma.currentPage);
        specGroup.name = `[Spec] ${node.name}`;
        specGroup.locked = true;
        figma.ui.postMessage({
          type: "spec-created",
          spec: {
            id: specGroup.id,
            // Group ID instead of Card ID so hiding hides everything
            name: node.name,
            letter: opts.letter,
            color: opts.color,
            type: opts.categoryLabel || "Sem categoria",
            note: opts.note,
            properties: opts.properties
          }
        });
        figma.notify("Especifica\xC3\xA7\xC3\xA3o criada com sucesso!");
      })();
    }
    if (msg.type === "highlight-node") {
      if (activeHighlightNode) {
        try {
          activeHighlightNode.remove();
        } catch (e) {
        }
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
        if (msg.forceState !== void 0) {
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
    if (msg.type === "rename-node") {
      const node = figma.getNodeById(msg.id);
      if (node) {
        node.name = msg.name;
        if (node.type === "GROUP" || node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
          const textNode = node.findOne((n) => n.type === "TEXT");
          if (textNode) {
            (async () => {
              try {
                await figma.loadFontAsync(textNode.fontName);
                textNode.characters = msg.name;
                const bg = node.findOne((n) => n.type === "POLYGON" || n.type === "ELLIPSE" || n.type === "RECTANGLE" || n.type === "STAR" || n.type === "VECTOR");
                if (bg) {
                  textNode.x = bg.x + bg.width / 2 - textNode.width / 2;
                  textNode.y = bg.y + bg.height / 2 - textNode.height / 2;
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
          if (!specNode) {
            figma.notify("Frame de spec n\xC3\xA3o encontrado", { error: true });
            return;
          }
          const obsFrame = figma.createFrame();
          obsFrame.name = `[Obs] ${msg.tipo || "Exce\xC3\xA7\xC3\xA3o"}`;
          obsFrame.layoutMode = "VERTICAL";
          obsFrame.paddingLeft = 10;
          obsFrame.paddingRight = 10;
          obsFrame.paddingTop = 8;
          obsFrame.paddingBottom = 8;
          obsFrame.itemSpacing = 4;
          obsFrame.primaryAxisSizingMode = "AUTO";
          obsFrame.counterAxisSizingMode = "AUTO";
          obsFrame.fills = [{ type: "SOLID", color: { r: 1, g: 0.97, b: 0.91 } }];
          obsFrame.strokes = [{ type: "SOLID", color: { r: 0.98, g: 0.7, b: 0.3 } }];
          obsFrame.strokeWeight = 1;
          obsFrame.cornerRadius = 8;
          const labelText = figma.createText();
          labelText.fontName = { family: "Inter", style: "Bold" };
          labelText.characters = `Obs \xC2\xB7 ${msg.tipo || "Exce\xC3\xA7\xC3\xA3o"}: ${msg.titulo || ""}`;
          labelText.fontSize = 10;
          labelText.fills = [{ type: "SOLID", color: { r: 0.72, g: 0.39, b: 0 } }];
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
          figma.notify("Observa\xC3\xA7\xC3\xA3o injetada no canvas");
        } catch (e) {
          figma.notify("Erro ao injetar observa\xC3\xA7\xC3\xA3o: " + e.message, { error: true });
        }
      })();
    }
    if (msg.type === "delete-node") {
      const node = figma.getNodeById(msg.id);
      if (node) {
        node.remove();
        figma.notify("Item exclu\xC3\xADdo com sucesso");
      }
      if (activeHighlightNode) {
        try {
          activeHighlightNode.remove();
        } catch (e) {
        }
        activeHighlightNode = null;
      }
    }
    if (msg.type === "save-storage") {
      figma.clientStorage.setAsync("handoffData", msg.data).catch((err) => {
        console.warn("Storage save failed (possibly missing plugin ID in manifest):", err);
      });
      _writeSharedPluginData(msg.data);
    }
    if (msg.type === "focus-node") {
      const node = figma.getNodeById(msg.id);
      if (node && _nodeOnCurrentPage(node)) {
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    }
    if (msg.type === "resize-ui") {
      figma.ui.resize(msg.width, msg.height);
    }
    if (msg.type === "export-design-data") {
      const nodes = figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
      let data = "Node Name, Type, Width, Height\n";
      nodes.forEach((n) => {
        data += `${n.name.replace(/,/g, "")},${n.type},${n.width || 0},${n.height || 0}
`;
      });
      figma.ui.postMessage({ type: "design-data-exported", data, format: msg.format });
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
      let boundsB = nodeB ? nodeB.absoluteBoundingBox || nodeB.absoluteRenderBounds : null;
      if (!isEvent && boundsB && (!msg.flowSide || msg.flowSide === "auto")) {
        const cAx = boundsA.x + boundsA.width / 2, cAy = boundsA.y + boundsA.height / 2;
        const cBx = boundsB.x + boundsB.width / 2, cBy = boundsB.y + boundsB.height / 2;
        const adx = Math.abs(cBx - cAx), ady = Math.abs(cBy - cAy);
        const shouldSwap = adx >= ady ? cBx < cAx : cBy < cAy;
        if (shouldSwap) {
          [nodeA, nodeB] = [nodeB, nodeA];
          [boundsA, boundsB] = [boundsB, boundsA];
        }
      }
      const getEdgePoints = (b) => ({
        top: { x: b.x + b.width / 2, y: b.y, side: "top" },
        bottom: { x: b.x + b.width / 2, y: b.y + b.height, side: "bottom" },
        left: { x: b.x, y: b.y + b.height / 2, side: "left" },
        right: { x: b.x + b.width, y: b.y + b.height / 2, side: "right" }
      });
      const pointsA = getEdgePoints(boundsA);
      let bestA, bestB;
      if (msg.flowType === "event_start") bestA = pointsA.left;
      else if (msg.flowType === "event_end") bestA = pointsA.right;
      else if (msg.flowSide && msg.flowSide !== "auto" && pointsA[msg.flowSide]) bestA = pointsA[msg.flowSide];
      if (nodeB && boundsB) {
        const pointsB = getEdgePoints(boundsB);
        if (!bestA) {
          const cAx = boundsA.x + boundsA.width / 2, cAy = boundsA.y + boundsA.height / 2;
          const cBx = boundsB.x + boundsB.width / 2, cBy = boundsB.y + boundsB.height / 2;
          const dx = cBx - cAx, dy = cBy - cAy;
          const noOverlapH = boundsA.x + boundsA.width <= boundsB.x || boundsB.x + boundsB.width <= boundsA.x;
          const noOverlapV = boundsA.y + boundsA.height <= boundsB.y || boundsB.y + boundsB.height <= boundsA.y;
          if (noOverlapH) {
            bestA = dx >= 0 ? pointsA.right : pointsA.left;
            bestB = dx >= 0 ? pointsB.left : pointsB.right;
          } else if (noOverlapV) {
            bestA = dy >= 0 ? pointsA.bottom : pointsA.top;
            bestB = dy >= 0 ? pointsB.top : pointsB.bottom;
          } else {
            if (Math.abs(dx) >= Math.abs(dy)) {
              bestA = dx >= 0 ? pointsA.right : pointsA.left;
              bestB = dx >= 0 ? pointsB.left : pointsB.right;
            } else {
              bestA = dy >= 0 ? pointsA.bottom : pointsA.top;
              bestB = dy >= 0 ? pointsB.top : pointsB.bottom;
            }
          }
        } else {
          let minDist = Infinity;
          for (const pB of Object.values(pointsB)) {
            const d = Math.sqrt(Math.pow(bestA.x - pB.x, 2) + Math.pow(bestA.y - pB.y, 2));
            if (d < minDist) {
              minDist = d;
              bestB = pB;
            }
          }
        }
      } else {
        if (msg.flowType === "event_start") {
          bestA = pointsA.left;
          bestB = { x: bestA.x - 60, y: bestA.y };
        } else if (msg.flowType === "event_end") {
          bestA = pointsA.right;
          bestB = { x: bestA.x + 60, y: bestA.y };
        } else {
          bestA = bestA || pointsA.right;
          const offset = 40;
          bestB = { x: bestA.x, y: bestA.y };
          if (bestA.side === "top") bestB.y -= offset;
          else if (bestA.side === "bottom") bestB.y += offset;
          else if (bestA.side === "left") bestB.x -= offset;
          else bestB.x += offset;
        }
      }
      const strokeColor = { r: 0.12, g: 0.16, b: 0.23 };
      const line = figma.createVector();
      line.name = `Handex/Fluxo/Linha`;
      figma.currentPage.appendChild(line);
      line.x = 0;
      line.y = 0;
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
        arrow.x = 0;
        arrow.y = 0;
        arrow.strokes = [{ type: "SOLID", color: strokeColor }];
        arrow.strokeWeight = 2;
        arrow.strokeCap = "ROUND";
        arrow.strokeJoin = "ROUND";
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
        shape.x = 0;
        shape.y = 0;
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
            symbol.textAlignHorizontal = "CENTER";
            symbol.textAlignVertical = "CENTER";
            symbol.fills = [{ type: "SOLID", color: strokeColor }];
            symbol.resize(size * 0.8, symbol.height);
            symbol.x = midX - symbol.width / 2;
            symbol.y = midY - symbol.height / 2;
            nodesToGroup.push(shape, symbol);
            const finalGroup = figma.group(nodesToGroup, figma.currentPage);
            finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || "Decis\xC3\xA3o"}`;
            finalGroup.locked = true;
            figma.ui.postMessage({ type: "flow-created", flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
          } catch (e) {
            console.error(e);
          }
        })();
      } else if (isEvent) {
        const isStart = msg.flowType === "event_start";
        const circle = figma.createEllipse();
        figma.currentPage.appendChild(circle);
        circle.resize(48, 48);
        circle.x = bestB.x - 24;
        circle.y = bestB.y - 24;
        circle.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        circle.strokes = [{ type: "SOLID", color: isStart ? { r: 0.13, g: 0.6, b: 0.3 } : { r: 0.86, g: 0.1, b: 0.1 } }];
        circle.strokeWeight = isStart ? 2 : 4;
        (async () => {
          try {
            await figma.loadFontAsync({ family: "Inter", style: "Bold" });
            const label = figma.createText();
            figma.currentPage.appendChild(label);
            label.fontName = { family: "Inter", style: "Bold" };
            label.characters = isStart ? "IN\xC3\x8DCIO" : "FIM";
            label.fontSize = 8;
            label.textAlignHorizontal = "CENTER";
            label.textAlignVertical = "CENTER";
            label.fills = circle.strokes;
            label.x = circle.x + circle.width / 2 - label.width / 2;
            label.y = circle.y + circle.height / 2 - label.height / 2;
            nodesToGroup.push(circle, label);
            const finalGroup = figma.group(nodesToGroup, figma.currentPage);
            finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || (isStart ? "In\xC3\xADcio" : "Fim")}`;
            finalGroup.locked = true;
            figma.ui.postMessage({ type: "flow-created", flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
          } catch (e) {
            console.error(e);
          }
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
            textNode.textAlignHorizontal = "CENTER";
            textNode.textAlignVertical = "CENTER";
            textNode.fills = [{ type: "SOLID", color: strokeColor }];
            const paddingH = 8, paddingV = 4;
            const chipBg = figma.createRectangle();
            figma.currentPage.appendChild(chipBg);
            chipBg.name = "Fundo";
            chipBg.resize(textNode.width + paddingH * 2, textNode.height + paddingV * 2);
            chipBg.cornerRadius = 6;
            chipBg.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            chipBg.strokes = [{ type: "SOLID", color: strokeColor }];
            chipBg.strokeWeight = 1;
            chipBg.x = midX - chipBg.width / 2;
            chipBg.y = midY - chipBg.height / 2;
            figma.currentPage.appendChild(textNode);
            textNode.x = chipBg.x + paddingH;
            textNode.y = chipBg.y + paddingV;
            nodesToGroup.push(chipBg, textNode);
            const finalGroup = figma.group(nodesToGroup, figma.currentPage);
            finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || "Conex\xC3\xA3o"}`;
            finalGroup.locked = true;
            figma.ui.postMessage({ type: "flow-created", flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
          } catch (e) {
            console.error(e);
          }
        })();
      } else {
        const finalGroup = figma.group(nodesToGroup, figma.currentPage);
        finalGroup.name = `Handex/Fluxo/${msg.nextFlowNumber || 1}/${msg.flowName || "Conex\xC3\xA3o"}`;
        finalGroup.locked = true;
        figma.ui.postMessage({ type: "flow-created", flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
      }
      figma.notify("Fluxo criado!");
    }
    if (msg.type === "create-legend") {
      (async () => {
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        } catch (e) {
        }
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        } catch (e) {
        }
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
        } catch (e) {
        }
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
        const legendTitle = figma.createText();
        legendTitle.fontName = { family: "Inter", style: "Bold" };
        legendTitle.characters = "Legendas de Especifica\xC3\xA7\xC3\xA3o";
        legendTitle.fontSize = 14;
        legendTitle.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
        legendFrame.appendChild(legendTitle);
        const types = [
          { name: "Cen\xC3\xA1rio de exce\xC3\xA7\xC3\xA3o", c: { r: 0.97, g: 0.45, b: 0.08 } },
          { name: "Informa\xC3\xA7\xC3\xA3o extra", c: { r: 0.05, g: 0.64, b: 0.91 } },
          { name: "Comportamento", c: { r: 0.92, g: 0.28, b: 0.6 } },
          { name: "Regra de Neg\xC3\xB3cio", c: { r: 0.02, g: 0.71, b: 0.82 } },
          { name: "Dados da API", c: { r: 0.51, g: 0.8, b: 0.08 } }
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
    if (msg.type === "pull-briefing-from-canvas") {
      const briefingFrame = figma.currentPage.findOne((n) => n.type === "FRAME" && n.name === "Briefing Estruturado");
      if (!briefingFrame) {
        figma.ui.postMessage({ type: "briefing-data-pulled", data: [] });
        return;
      }
      const data = [];
      let currentHeader = null;
      const texts = briefingFrame.findAll((n) => n.type === "TEXT");
      for (const child of texts) {
        const style = child.fontName.style || "";
        if (style.includes("Bold") || style.includes("SemiBold") || style.includes("Black")) {
          currentHeader = child.characters;
        } else if (style.includes("Regular") && currentHeader) {
          if (child.characters.trim().length > 0 && child.characters.trim() !== "Clique para adicionar...") {
            data.push({ category: "Importado do Canvas", question: currentHeader, answer: child.characters });
          }
          currentHeader = null;
        }
      }
      figma.ui.postMessage({ type: "briefing-data-pulled", data });
      return;
    }
    if (msg.type === "inject-framework") {
      (async () => {
        for (const font of [
          { family: "Inter", style: "Regular" },
          { family: "Inter", style: "Medium" },
          { family: "Inter", style: "Bold" }
        ]) {
          try {
            await figma.loadFontAsync(font);
          } catch (e) {
          }
        }
        const CAIXA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 205.51265 46.553631"><g transform="translate(-284.78446,-475.51214)"><g transform="matrix(1.25,0,0,-1.25,15.493106,1024.9702)"><g transform="scale(0.24,0.24)"><path d="m 1107.19,1780.04 -17.74,-44.21 24.55,0 -6.73,44.39 -0.08,-0.18 z m -93.98,-101.49 72.77,149.83 55.02,0 30.68,-149.83 -48.3,0 -3.56,19.97 -46.86,0 -10.78,-19.97 -48.97,0 z m 181.34,0 21.08,149.83 48.67,0 -21.07,-149.83 -48.68,0 z m 323.71,101.67 -17.81,-44.39 24.54,0 -6.73,44.39 z m -94.06,-101.67 72.78,149.83 55.01,0 30.69,-149.83 -48.31,0 -3.55,19.97 -46.87,0 -10.78,-19.97 -48.97,0" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1316.6,1748.61 60.99,0 41.79,-69.21 -61,0 -41.78,69.21" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1322.94,1759.24 63.04,0 54.75,68.92 -63.04,0 -54.75,-68.92" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1259.91,1678.98 63.03,0 54.75,69.76 -63.04,0 -54.74,-69.76" style="fill:#f6822a;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1282.64,1829 58.83,0 40.31,-69.76 -58.84,0 -40.3,69.76" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/><path d="m 1014.65,1823.02 -4.68,-44.07 c -17.939,24.75 -59.517,7.67 -62.782,-23.16 -4.149,-39.13 35.867,-48.25 57.642,-25.21 l -4.69,-44.17 c -6.499,-3.19 -12.855,-5.67 -19.128,-7.34 -6.239,-1.68 -12.492,-2.57 -18.696,-2.7 -7.8,-0.17 -14.867,0.65 -21.234,2.44 -6.367,1.76 -12.129,4.56 -17.227,8.34 -9.832,7.19 -16.941,16.33 -21.32,27.45 -4.379,11.16 -5.82,23.75 -4.328,37.82 1.203,11.31 4.051,21.62 8.59,30.97 4.5,9.34 10.734,17.84 18.672,25.54 7.504,7.34 15.676,12.88 24.519,16.64 8.809,3.73 18.422,5.72 28.813,5.94 6.207,0.13 12.297,-0.49 18.207,-1.92 5.942,-1.42 11.802,-3.64 17.642,-6.57" style="fill:#0070af;fill-opacity:1;fill-rule:evenodd;stroke:none"/></g></g></g></svg>`;
        const mkLogo = (h) => {
          try {
            const n = figma.createNodeFromSvg(CAIXA_SVG);
            n.name = "CAIXA Logo";
            n.resize(Math.round(h * 205.51 / 46.55), h);
            return n;
          } catch (e) {
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
          blue: { r: 0, g: 0.439, b: 0.686 },
          blueDark: { r: 0, g: 0.247, b: 0.478 },
          blueLight: { r: 0.91, g: 0.957, b: 0.98 },
          orange: { r: 0.965, g: 0.51, b: 0.165 },
          teal: { r: 0.298, g: 0.745, b: 0.714 },
          tealLight: { r: 0.851, g: 0.961, b: 0.957 },
          lime: { r: 0.831, g: 0.969, b: 0.188 },
          yellow: { r: 1, g: 0.949, b: 0.749 },
          white: { r: 1, g: 1, b: 1 },
          bg: { r: 0.941, g: 0.953, b: 0.969 },
          bgBlue: { r: 0.91, g: 0.957, b: 0.98 },
          line: { r: 0.882, g: 0.894, b: 0.91 },
          text: { r: 0.118, g: 0.161, b: 0.231 },
          muted: { r: 0.392, g: 0.455, b: 0.545 },
          light: { r: 0.651, g: 0.706, b: 0.78 },
          green: { r: 0.133, g: 0.694, b: 0.298 },
          greenLight: { r: 0.941, g: 0.992, b: 0.949 },
          amber: { r: 0.961, g: 0.769, b: 0.188 },
          red: { r: 0.941, g: 0.263, b: 0.212 }
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
          r.resize(4, h);
          r.opacity = 0;
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
          c.x = x;
          c.y = y;
          parent.appendChild(c);
          const lt = tx("UX", Math.round(size * 0.3), "Bold", C.white);
          lt.x = x + Math.round(size * 0.22);
          lt.y = y + Math.round(size * 0.33);
          parent.appendChild(lt);
        };
        let mainFrame = null;
        if (msg.frameworkId === "briefing") {
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
          fieldRow("Data de In\xC3\xADcio:", "00/00/00");
          mainFrame.appendChild(sp(12));
          const sep = rct(604, 1, C.line);
          mainFrame.appendChild(sep);
          section("Contexto", "Descreva o contexto atual do projeto e por que ele est\xC3\xA1 sendo demandado. Se existirem jornadas mapeadas ou algum material, ele deve ser registrado ou linkado nesta sess\xC3\xA3o.");
          section("Resultados-chave e crit\xC3\xA9rio de sucesso", "Como o sucesso do projeto ser\xC3\xA1 medido?");
          section("Atores e usu\xC3\xA1rios", "Quem \xC3\xA9 o p\xC3\xBAblico deste projeto? Voc\xC3\xAA pode aprofundar, aqui, para um estudo de personas.");
          section("Stakeholders e equipe", "Anote quem faz parte da(s) equipe(s), quais s\xC3\xA3o suas responsabilidades. Importante anotar quem vai validar as decis\xC3\xB5es.");
          section("Escopo");
          section("Est\xC3\xA1 no escopo", "O que precisa ser trabalhado e por que.", true);
          section("Pode estar no escopo", "O que depende de outros fatores para entrar no escopo.", true);
          section("N\xC3\xA3o est\xC3\xA1 no escopo", "Limita\xC3\xA7\xC3\xB5es t\xC3\xA9cnicas ou escopo exclu\xC3\xADdo explicitamente.", true);
          section("Depend\xC3\xAAncias", "Outras \xC3\xA1reas que podem ter conhecimento ou dom\xC3\xADnio sobre parte do projeto.");
          section("Riscos", "Riscos que atrapalhem o sucesso do projeto. O que pode acontecer se n\xC3\xA3o atingirmos as metas?");
          section("Tempo", "Roadmaps, prazos, sprints necess\xC3\xA1rias, qualquer fator que tangibilize tempo de projeto.");
          section("Organiza\xC3\xA7\xC3\xA3o do trabalho");
          section("Rotina de trabalho da equipe", "Reuni\xC3\xB5es di\xC3\xA1rias? Sprint? Retr\xC3\xB4?", true);
          section("Comunica\xC3\xA7\xC3\xA3o", "Exemplo: reuni\xC3\xB5es marcadas por email, feitas pelo Teams.", true);
          section("Compartilhamento de dados", "Softwares e pastas, meio de compartilhamento, formatos de arquivos.", true);
          section("Notas adicionais", "Notas aqui.");
          mainFrame.appendChild(sp(8));
        } else if (msg.frameworkId === "csd") {
          mainFrame = vb(940, 0, 0, C.white, 16);
          mainFrame.name = "Matriz CSD";
          const hdr = mkHeader("Matriz CSD \xE2\u20AC\u201C Certezas \xC2\xB7 Suposi\xC3\xA7\xC3\xB5es \xC2\xB7 D\xC3\xBAvidas");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          const csdRow = hb(20, 16, null);
          csdRow.layoutAlign = "STRETCH";
          mainFrame.appendChild(csdRow);
          const csdCols = [
            { label: "Certezas", sub: "O que sabemos com certeza.", hdr: C.green, bg: C.greenLight },
            { label: "Suposi\xC3\xA7\xC3\xB5es", sub: "O que acreditamos, mas n\xC3\xA3o validamos.", hdr: C.amber, bg: { r: 1, g: 0.98, b: 0.929 } },
            { label: "D\xC3\xBAvidas", sub: "O que precisamos descobrir.", hdr: C.red, bg: { r: 1, g: 0.949, b: 0.949 } }
          ];
          csdCols.forEach((col) => {
            const card = vb(280, 0, 8, col.bg, 12);
            card.paddingBottom = 16;
            const chdr = vb(280, 16, 4, col.hdr, 0);
            chdr.paddingTop = chdr.paddingBottom = 10;
            chdr.layoutAlign = "STRETCH";
            const ct = tx(col.label, 13, "Bold", C.white);
            ct.layoutAlign = "STRETCH";
            ct.textAutoResize = "HEIGHT";
            const cs = tx(col.sub, 10, "Regular", C.white);
            cs.opacity = 0.85;
            cs.layoutAlign = "STRETCH";
            cs.textAutoResize = "HEIGHT";
            chdr.appendChild(ct);
            chdr.appendChild(cs);
            card.appendChild(chdr);
            for (let i = 0; i < 3; i++) {
              const itemWrap = vb(248, 12, 0, C.white, 8);
              itemWrap.paddingTop = itemWrap.paddingBottom = 10;
              itemWrap.strokes = [{ type: "SOLID", color: C.line }];
              itemWrap.strokeWeight = 1;
              itemWrap.layoutAlign = "STRETCH";
              const ph = tx("Clique para adicionar...", 11, "Regular", C.light);
              ph.layoutAlign = "STRETCH";
              ph.textAutoResize = "HEIGHT";
              itemWrap.appendChild(ph);
              card.appendChild(itemWrap);
            }
            csdRow.appendChild(card);
          });
        } else if (msg.frameworkId === "five-whys") {
          mainFrame = vb(600, 40, 0, C.bgBlue, 20);
          mainFrame.name = "Os 5 Porqu\xC3\xAAs";
          const hdr = mkHeader("Os 5 porqu\xC3\xAA?");
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
          const emojis = ["\xF0\u0178\u02DC\u20AC", "\xF0\u0178\u02DC\u0160", "\xF0\u0178\xA4\u201D", "\xF0\u0178\u02DC\xA2", "\xF0\u0178\xA4\xAF", "\xF0\u0178\u02DC\xB1"];
          const qLabels = ["Porqu\xC3\xAA o problema ocorre?", "Porqu\xC3\xAA?", "Porqu\xC3\xAA?", "Porqu\xC3\xAA?", "Porqu\xC3\xAA?", "Porqu\xC3\xAA?"];
          const motivos = ["1\xC2\xB0 motivo", "2\xC2\xB0 motivo", "3\xC2\xB0 motivo", "4\xC2\xB0 motivo", "5\xC2\xB0 motivo", "6\xC2\xB0 motivo"];
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
          addT(mainFrame, "A real causa do problema \xC3\xA9...", 12, "Regular", C.muted);
          mainFrame.appendChild(sp(8));
        } else if (msg.frameworkId === "stakeholders") {
          const shCanvas = figma.createFrame();
          shCanvas.resize(600, 620);
          shCanvas.fills = [{ type: "SOLID", color: C.white }];
          shCanvas.layoutAlign = "STRETCH";
          const cx = 300, cy = 330;
          [[520, 460], [390, 344], [260, 230], [130, 115]].forEach(([ew, eh]) => {
            const e = ell(ew, eh, null, C.line, 1.5, [8, 8]);
            e.x = cx - ew / 2;
            e.y = cy - eh / 2;
            shCanvas.appendChild(e);
          });
          const solT = tx("Solu\xC3\xA7\xC3\xA3o", 13, "Bold", C.text);
          solT.x = cx - 26;
          solT.y = cy + 10;
          shCanvas.appendChild(solT);
          const stickyBg = rct(106, 84, { r: 1, g: 0.937, b: 0.698 }, 4);
          stickyBg.x = cx - 100;
          stickyBg.y = cy - 88;
          shCanvas.appendChild(stickyBg);
          const st1 = tx("Stakeholder", 10, "Medium", C.text);
          st1.x = cx - 94;
          st1.y = cy - 76;
          shCanvas.appendChild(st1);
          const st2 = tx("\xE2\u20AC\xA2 Necessidade", 10, "Regular", C.text);
          st2.x = cx - 94;
          st2.y = cy - 60;
          shCanvas.appendChild(st2);
          mainFrame = vb(600, 0, 0, C.white, 16);
          mainFrame.name = "Mapa de Stakeholders";
          const hdr = mkHeader("Mapa de Stakeholders");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          mainFrame.appendChild(shCanvas);
        } else if (msg.frameworkId === "value-effort") {
          const veCanvas = figma.createFrame();
          veCanvas.resize(620, 720);
          veCanvas.fills = [{ type: "SOLID", color: C.white }];
          veCanvas.layoutAlign = "STRETCH";
          const chartBg = rct(500, 580, C.bgBlue, 8);
          chartBg.x = 60;
          chartBg.y = 20;
          veCanvas.appendChild(chartBg);
          const yAx = rct(2, 500, C.text);
          yAx.x = 100;
          yAx.y = 40;
          veCanvas.appendChild(yAx);
          const xAx = rct(420, 2, C.text);
          xAx.x = 100;
          xAx.y = 560;
          veCanvas.appendChild(xAx);
          mainFrame = vb(620, 0, 0, C.white, 16);
          mainFrame.name = "Matriz Valor \xC3\u2014 Esfor\xC3\xA7o";
          const hdr = mkHeader("Matriz Valor \xC3\u2014 Esfor\xC3\xA7o");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          mainFrame.appendChild(veCanvas);
        } else if (msg.frameworkId === "atomic-research") {
          mainFrame = vb(960, 0, 0, C.white, 16);
          mainFrame.name = "Atomic Research";
          const hdr = mkHeader("Atomic Research");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          const b = vb(null, 40, 24, null);
          mainFrame.appendChild(b);
          b.layoutAlign = "STRETCH";
          b.appendChild(tx("Insira dados de pesquisa at\xC3\xB4mica aqui...", 14, "Regular", C.muted));
        } else if (msg.frameworkId === "blueprint") {
          mainFrame = vb(1200, 0, 0, C.white, 16);
          mainFrame.name = "Blueprint de Servi\xC3\xA7o";
          const hdr = mkHeader("Blueprint de Servi\xC3\xA7o");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          const b = vb(null, 40, 24, null);
          mainFrame.appendChild(b);
          b.layoutAlign = "STRETCH";
          b.appendChild(tx("Construa o blueprint de servi\xC3\xA7o aqui...", 14, "Regular", C.muted));
        } else if (msg.frameworkId === "heuristics") {
          mainFrame = vb(960, 0, 0, C.white, 16);
          mainFrame.name = "Heur\xC3\xADsticas de Nielsen";
          const hdr = mkHeader("Heur\xC3\xADsticas de Nielsen");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          const b = vb(null, 40, 24, null);
          mainFrame.appendChild(b);
          b.layoutAlign = "STRETCH";
          b.appendChild(tx("Avalia\xC3\xA7\xC3\xA3o heur\xC3\xADstica aqui...", 14, "Regular", C.muted));
        } else if (msg.frameworkId === "opportunities") {
          mainFrame = vb(960, 0, 0, C.white, 16);
          mainFrame.name = "Mapa de Oportunidades";
          const hdr = mkHeader("Mapa de Oportunidades");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          const b = vb(null, 40, 24, null);
          mainFrame.appendChild(b);
          b.layoutAlign = "STRETCH";
          b.appendChild(tx("Mapeamento de oportunidades aqui...", 14, "Regular", C.muted));
        } else if (msg.frameworkId === "personas") {
          mainFrame = vb(800, 0, 0, { r: 0.961, g: 0.98, b: 0.992 }, 16);
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
          nameCol.appendChild(tx("Breve descri\xC3\xA7\xC3\xA3o (exemplo: Perfil 1 foi mapeado entendendo cliente interno)", 12, "Regular", C.muted));
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
            r.appendChild(tx(l + ":", 14, "Bold", C.blueDark));
            r.appendChild(tx(v, 14, "Regular", C.text));
            dataCol.appendChild(r);
          };
          addData("Nome", "Um nome (opcional)");
          addData("Idade", "idade m\xC3\xA9dia do perfil (pode ser conseguido por dados)");
          addData("Ocupa\xC3\xA7\xC3\xA3o", "Trabalho / meio de trabalho");
          addData("Renda", "Renda m\xC3\xA9dia");
          addData("Escolaridade", "Educa\xC3\xA7\xC3\xA3o formal");
          detailsRow.appendChild(dataCol);
          body.appendChild(detailsRow);
          const colsRow = hb(0, 40, null);
          colsRow.layoutAlign = "STRETCH";
          const col1 = vb(null, 0, 12, null);
          col1.layoutAlign = "STRETCH";
          col1.appendChild(tx("Objetivos", 16, "Bold", C.blueDark));
          const objT = tx("Listar objetivos relacionados ao produto, sejam eles objetivos de vida ou objetivos do dia, organiza\xC3\xA7\xC3\xA3o financeira, etc.", 13, "Regular", C.text);
          col1.appendChild(objT);
          objT.textAutoResize = "HEIGHT";
          objT.layoutAlign = "STRETCH";
          colsRow.appendChild(col1);
          const col2 = vb(null, 0, 12, null);
          col2.layoutAlign = "STRETCH";
          col2.appendChild(tx("Necessidade", 16, "Bold", C.blueDark));
          const necT = tx("Listar necessidades relacionados ao produto, aqui podemos mapear dores para identificar oportunidades.", 13, "Regular", C.text);
          col2.appendChild(necT);
          necT.textAutoResize = "HEIGHT";
          necT.layoutAlign = "STRETCH";
          colsRow.appendChild(col2);
          body.appendChild(colsRow);
          const oppCol = vb(null, 0, 12, null);
          oppCol.layoutAlign = "STRETCH";
          oppCol.appendChild(tx("Oportunidades", 16, "Bold", C.blueDark));
          const oppT = tx("Liste oportunidades de produto relacionadas \xC3\xA0s sess\xC3\xB5es anteriores.", 13, "Regular", C.text);
          oppCol.appendChild(oppT);
          oppT.textAutoResize = "HEIGHT";
          oppT.layoutAlign = "STRETCH";
          body.appendChild(oppCol);
          const sep2 = rct(720, 1, C.blueLight);
          body.appendChild(sep2);
          sep2.layoutAlign = "STRETCH";
          const obsCol = vb(null, 0, 12, null);
          obsCol.layoutAlign = "STRETCH";
          obsCol.appendChild(tx("Observa\xC3\xA7\xC3\xB5es adicionais", 14, "Bold", C.blueDark));
          const obsT = tx("Escreva aqui observa\xC3\xA7\xC3\xB5es de hip\xC3\xB3teses descobertas em an\xC3\xA1lise de dados internos e externos que ajudaram a mapear perfis de clientes / usu\xC3\xA1rios.", 13, "Regular", C.text);
          obsCol.appendChild(obsT);
          obsT.textAutoResize = "HEIGHT";
          obsT.layoutAlign = "STRETCH";
          body.appendChild(obsCol);
        } else if (msg.frameworkId === "interview-script") {
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
            d.textAutoResize = "HEIGHT";
            d.layoutAlign = "STRETCH";
            body.appendChild(sec);
          };
          addSec("1. Introdu\xC3\xA7\xC3\xA3o e Aquecimento", "Apresente-se, explique o objetivo da entrevista de forma neutra (sem enviesar) e pe\xC3\xA7a consentimento para gravar. Fa\xC3\xA7a perguntas que quebrem o gelo.", true);
          addSec("Sugest\xC3\xB5es de perguntas:", "- Como \xC3\xA9 um dia t\xC3\xADpico de trabalho para voc\xC3\xAA?\n- Quais ferramentas voc\xC3\xAA mais utiliza hoje?");
          const sep1 = rct(720, 1, C.line);
          body.appendChild(sep1);
          sep1.layoutAlign = "STRETCH";
          addSec("2. Descoberta e Contexto", "Entenda como o usu\xC3\xA1rio lida com o problema hoje, antes de apresentar qualquer solu\xC3\xA7\xC3\xA3o.", true);
          addSec("Sugest\xC3\xB5es de perguntas:", "- Me conte sobre a \xC3\xBAltima vez que voc\xC3\xAA precisou realizar [tarefa].\n- O que foi mais dif\xC3\xADcil nesse processo?\n- Como voc\xC3\xAA contorna esse problema atualmente?");
          const sep2 = rct(720, 1, C.line);
          body.appendChild(sep2);
          sep2.layoutAlign = "STRETCH";
          addSec("3. Aprofundamento (Solu\xC3\xA7\xC3\xA3o / Prot\xC3\xB3tipo)", "Caso haja um prot\xC3\xB3tipo, apresente agora. Pe\xC3\xA7a para o usu\xC3\xA1rio pensar em voz alta.", true);
          addSec("Sugest\xC3\xB5es de perguntas:", "- O que voc\xC3\xAA acha que essa tela faz?\n- Onde voc\xC3\xAA clicaria para [a\xC3\xA7\xC3\xA3o]?\n- O que voc\xC3\xAA esperava que acontecesse ao clicar ali?");
          const sep3 = rct(720, 1, C.line);
          body.appendChild(sep3);
          sep3.layoutAlign = "STRETCH";
          addSec("4. Encerramento", "Abra espa\xC3\xA7o para considera\xC3\xA7\xC3\xB5es finais e agrade\xC3\xA7a.", true);
          addSec("Sugest\xC3\xB5es de perguntas:", "- H\xC3\xA1 algo que n\xC3\xA3o perguntei e que voc\xC3\xAA gostaria de comentar?\n- Como voc\xC3\xAA resumiria essa experi\xC3\xAAncia?");
        } else if (msg.frameworkId === "journey") {
          mainFrame = vb(1e3, 0, 0, { r: 0.941, g: 0.965, b: 0.976 }, 16);
          mainFrame.name = "Jornada de Usu\xC3\xA1rio";
          const hdr = mkHeader("Jornada de Usu\xC3\xA1rio");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          const body = hb(24, 24, null);
          mainFrame.appendChild(body);
          body.layoutAlign = "STRETCH";
          const leftCol = vb(220, 0, 12, null);
          body.appendChild(leftCol);
          const mkL = (title, sub, h) => {
            const b = vb(220, 16, 4, C.white, 8);
            if (h) {
              b.counterAxisSizingMode = "FIXED";
              b.resize(220, h);
              b.primaryAxisSizingMode = "FIXED";
            }
            b.appendChild(tx(title, 16, "Bold", C.text));
            if (sub) b.appendChild(tx(sub, 12, "Regular", C.muted));
            return b;
          };
          const topBlock = mkL("Jornada", "Etapas da jornada");
          leftCol.appendChild(topBlock);
          leftCol.appendChild(mkL("Passos", "O que faz..."));
          leftCol.appendChild(mkL("Pensa e fala", "O que pensa e fala..."));
          leftCol.appendChild(mkL("Sentimentos", ""));
          leftCol.appendChild(mkL("Oportunidades", ""));
          leftCol.appendChild(mkL("Experi\xC3\xAAncia", "", 240));
          const rightCol = hb(0, 12, null);
          body.appendChild(rightCol);
          rightCol.layoutAlign = "STRETCH";
          const numEtapas = 2;
          for (let i = 1; i <= numEtapas; i++) {
            const col = vb(330, 0, 12, null);
            col.layoutAlign = "STRETCH";
            const eTop = vb(null, 16, 4, { r: 0.2, g: 0.8, b: 0.96 }, 8);
            eTop.layoutAlign = "STRETCH";
            eTop.appendChild(tx(i + ". Nome da Etapa", 16, "Bold", C.blueDark));
            eTop.appendChild(tx("Descri\xC3\xA7\xC3\xA3o (opcional)", 12, "Regular", C.blueDark));
            col.appendChild(eTop);
            const mkr = (val, h) => {
              const b = vb(null, 16, 4, C.white, 8);
              b.layoutAlign = "STRETCH";
              if (h) {
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
            wS.appendChild(s1);
            wS.appendChild(s2);
            col.appendChild(wS);
            const wP = vb(null, 0, 8, null);
            wP.layoutAlign = "STRETCH";
            wP.appendChild(mkr("Pensamento"));
            wP.appendChild(mkr("Pensamento"));
            col.appendChild(wP);
            const wF = vb(null, 0, 8, null);
            wF.layoutAlign = "STRETCH";
            wF.appendChild(mkr("Sentimento"));
            wF.appendChild(mkr("Sentimento"));
            col.appendChild(wF);
            const wO = vb(null, 0, 8, null);
            wO.layoutAlign = "STRETCH";
            wO.appendChild(mkr("Oportunidade"));
            wO.appendChild(mkr("Oportunidade"));
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
        } else if (msg.frameworkId === "relational-map") {
          mainFrame = vb(1e3, 0, 0, C.white, 16);
          mainFrame.name = "Mapa Relacional";
          const hdr = mkHeader("Mapa Relacional");
          mainFrame.appendChild(hdr);
          hdr.layoutAlign = "STRETCH";
          const body = hb(40, 32, null);
          mainFrame.appendChild(body);
          body.layoutAlign = "STRETCH";
          for (let i = 0; i < 4; i++) {
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
            for (let j = 0; j < 4; j++) {
              const card = vb(200, 16, 0, { r: 0.94, g: 0.95, b: 0.96 }, 8);
              card.counterAxisSizingMode = "FIXED";
              card.resize(200, 100);
              card.primaryAxisSizingMode = "FIXED";
              const dot = ell(20, 20, j % 2 == 0 ? C.teal : j == 1 ? C.blue : C.orange);
              card.appendChild(dot);
              col.appendChild(card);
            }
            body.appendChild(col);
          }
        }
        if (mainFrame) {
          const frameName = mainFrame.name;
          figma.currentPage.appendChild(mainFrame);
          const vp = figma.viewport.bounds;
          mainFrame.x = Math.round(vp.x + (vp.width - mainFrame.width) / 2);
          mainFrame.y = Math.round(vp.y + (vp.height - mainFrame.height) / 2);
          const grp = figma.group([mainFrame], figma.currentPage);
          grp.name = frameName;
          figma.currentPage.selection = [grp];
          figma.viewport.scrollAndZoomIntoView([grp]);
          figma.ui.postMessage({ type: "framework-injected", name: msg.frameworkId });
          figma.notify("Framework inserido no canvas! \xE2\u0153\u201C");
        }
      })();
      return;
    }
    if (msg.type === "close") {
      figma.closePlugin();
    }
  };
})();
