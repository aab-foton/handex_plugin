(() => {
  // src/plugin/code.js
  var VERSION = true ? "1.0.0" : "1.0.0";
  var STORAGE_KEY = "maturai-ux-data";
  var CANVAS_PREFIX = "[MaturAI]";
  figma.showUI(__html__, { width: 380, height: 600, title: `Maturai UX v${VERSION}` });
  async function init() {
    var _a, _b;
    let savedState = null;
    try {
      const raw = await figma.clientStorage.getAsync(STORAGE_KEY);
      if (raw && raw._schemaVersion === 1) savedState = raw;
    } catch (e) {
    }
    let currentUser = null;
    try {
      currentUser = { name: ((_a = figma.currentUser) == null ? void 0 : _a.name) || "", id: ((_b = figma.currentUser) == null ? void 0 : _b.id) || "" };
    } catch (e) {
    }
    figma.ui.postMessage({ type: "init-plugin", savedState, currentUser, version: VERSION });
  }
  init();
  figma.ui.onmessage = async (msg) => {
    if (msg.type === "save-state") {
      try {
        await figma.clientStorage.setAsync(STORAGE_KEY, msg.data);
      } catch (e) {
      }
      return;
    }
    if (msg.type === "inject-framework") {
      await injectFramework(msg.framework);
      return;
    }
    if (msg.type === "scan-frameworks") {
      const results = await scanFrameworks(msg.frameworkIds);
      figma.ui.postMessage({ type: "scan-complete", results });
      return;
    }
    if (msg.type === "export-data") {
      figma.ui.postMessage({ type: "export-ready", data: msg.data });
      return;
    }
    if (msg.type === "resize-ui") {
      figma.ui.resize(msg.width, msg.height);
      return;
    }
  };
  async function injectFramework(framework) {
    const fid = framework.id;
    const ts = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
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
    const tx = (text, size, weight, color, name) => {
      const n = figma.createText();
      n.fontName = { family: "Inter", style: weight || "Regular" };
      n.characters = String(text || "");
      n.fontSize = size || 12;
      n.fills = [{ type: "SOLID", color: color || C.text }];
      n.textAutoResize = "WIDTH_AND_HEIGHT";
      if (name) n.name = name;
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
    const addT = (parent, text, size, weight, color, name) => {
      const n = tx(text, size, weight, color, name);
      n.textAutoResize = "HEIGHT";
      n.layoutAlign = "STRETCH";
      parent.appendChild(n);
      return n;
    };
    const mkField = (parent, id, placeholder, fontSize, fill, cr) => {
      const wrap = vb(null, 12, 0, fill !== void 0 ? fill : C.bg, cr !== void 0 ? cr : 8);
      wrap.name = "section/" + id;
      wrap.paddingTop = wrap.paddingBottom = 10;
      wrap.layoutAlign = "STRETCH";
      const val = tx(placeholder, fontSize || 12, "Regular", C.light, "field/" + id);
      val.textAutoResize = "HEIGHT";
      val.layoutAlign = "STRETCH";
      wrap.appendChild(val);
      if (parent) parent.appendChild(wrap);
      return wrap;
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
    const mkLogo = (h) => {
      try {
        const n = figma.createNodeFromSvg(CAIXA_SVG);
        n.name = "CAIXA Logo";
        n.resize(Math.round(h * 205.51 / 46.55), h);
        return n;
      } catch (e) {
        return tx("CAIXA", Math.round(h * 0.6), "Bold", C.blue);
      }
    };
    const mkHeader = (title) => {
      const bar = figma.createFrame();
      bar.name = "_header";
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
      bar.appendChild(tx("|", 14, "Regular", C.blueDark, "_sep"));
      bar.appendChild(tx(title, 14, "Bold", C.blueDark, "_title"));
      return bar;
    };
    let mainFrame = null;
    if (fid === "briefing") {
      mainFrame = vb(700, 48, 0, C.white, 16);
      mainFrame.name = "Briefing Estruturado";
      const hdr = mkHeader("Briefing Estruturado");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      mainFrame.appendChild(sp(20));
      const fieldRow = (label, val, fieldId) => {
        const row = hb(0, 6, null);
        row.name = "section/" + (fieldId || "_row");
        row.counterAxisAlignItems = "MIN";
        row.appendChild(tx(label + "  ", 13, "Bold", C.blue, "_label"));
        row.appendChild(tx(val, 13, "Regular", C.text, fieldId ? "field/" + fieldId : void 0));
        mainFrame.appendChild(row);
        mainFrame.appendChild(sp(4));
      };
      const section = (header, body, sub, fieldId) => {
        const wrap = vb(null, 0, 4, null);
        wrap.name = fieldId ? "section/" + fieldId : "_section";
        wrap.layoutAlign = "STRETCH";
        mainFrame.appendChild(sp(sub ? 4 : 14));
        addT(mainFrame, header, sub ? 12 : 14, "Bold", sub ? C.orange : C.blue, "_label");
        if (body) {
          mainFrame.appendChild(sp(4));
          addT(mainFrame, body, 12, "Regular", C.muted, fieldId ? "field/" + fieldId : void 0);
        }
      };
      fieldRow("Nome do Projeto:", "Nome do projeto", "nome");
      fieldRow("Data de In\xEDcio:", "00/00/00", "data-inicio");
      mainFrame.appendChild(sp(12));
      const sep = rct(604, 1, C.line);
      sep.name = "_divider";
      mainFrame.appendChild(sep);
      section("Contexto", "Descreva o contexto atual do projeto e por que ele est\xE1 sendo demandado.", false, "contexto");
      section("Resultados-chave", "Como o sucesso do projeto ser\xE1 medido?", false, "resultados");
      section("Atores e usu\xE1rios", "Quem \xE9 o p\xFAblico deste projeto?", false, "atores");
      section("Stakeholders e equipe", "Quem faz parte da equipe e quem valida as decis\xF5es.", false, "stakeholders");
      section("Escopo");
      section("Est\xE1 no escopo", "O que precisa ser trabalhado e por que.", true, "in-escopo");
      section("Pode estar no escopo", "O que depende de outros fatores para entrar.", true, "talvez-escopo");
      section("N\xE3o est\xE1 no escopo", "Limita\xE7\xF5es t\xE9cnicas ou escopo exclu\xEDdo explicitamente.", true, "fora-escopo");
      section("Depend\xEAncias", "Outras \xE1reas com conhecimento sobre parte do projeto.", false, "dependencias");
      section("Riscos", "O que pode atrapalhar o sucesso? O que acontece se n\xE3o atingirmos as metas?", false, "riscos");
      section("Tempo", "Roadmaps, prazos, sprints necess\xE1rias.", false, "tempo");
      section("Organiza\xE7\xE3o do trabalho");
      section("Rotina da equipe", "Reuni\xF5es di\xE1rias? Sprint? Retr\xF4?", true, "rotina");
      section("Comunica\xE7\xE3o", "Exemplo: reuni\xF5es por email, feitas pelo Teams.", true, "comunicacao");
      section("Compartilhamento de dados", "Softwares, pastas, formatos de arquivos.", true, "compartilhamento");
      section("Notas adicionais", "Notas aqui.", false, "notas");
      mainFrame.appendChild(sp(8));
    } else if (fid === "csd") {
      mainFrame = vb(940, 0, 0, C.white, 16);
      mainFrame.name = "Matriz CSD";
      const hdr = mkHeader("Matriz CSD \u2013 Certezas \xB7 Suposi\xE7\xF5es \xB7 D\xFAvidas");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const csdRow = hb(20, 16, null);
      csdRow.layoutAlign = "STRETCH";
      mainFrame.appendChild(csdRow);
      const csdCols = [
        { label: "Certezas", sub: "O que sabemos com certeza.", hdr: C.green, bg: C.greenLight },
        { label: "Suposi\xE7\xF5es", sub: "O que acreditamos, mas n\xE3o validamos.", hdr: C.amber, bg: { r: 1, g: 0.98, b: 0.929 } },
        { label: "D\xFAvidas", sub: "O que precisamos descobrir.", hdr: C.red, bg: { r: 1, g: 0.949, b: 0.949 } }
      ];
      csdCols.forEach((col, ci) => {
        const colKey = ["certeza", "suposicao", "duvida"][ci];
        const card = vb(280, 0, 8, col.bg, 12);
        card.name = "section/" + colKey;
        card.paddingBottom = 16;
        const chdr = vb(280, 16, 4, col.hdr, 0);
        chdr.name = "_header";
        chdr.paddingTop = chdr.paddingBottom = 10;
        chdr.layoutAlign = "STRETCH";
        const ct = tx(col.label, 13, "Bold", C.white, "_label");
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
          itemWrap.name = "section/" + colKey + "-" + (i + 1);
          itemWrap.paddingTop = itemWrap.paddingBottom = 10;
          itemWrap.strokes = [{ type: "SOLID", color: C.line }];
          itemWrap.strokeWeight = 1;
          itemWrap.layoutAlign = "STRETCH";
          const ph = tx("Clique para adicionar...", 11, "Regular", C.light, "field/" + colKey + "-" + (i + 1));
          ph.layoutAlign = "STRETCH";
          ph.textAutoResize = "HEIGHT";
          itemWrap.appendChild(ph);
          card.appendChild(itemWrap);
        }
        csdRow.appendChild(card);
      });
    } else if (fid === "five-whys") {
      mainFrame = vb(600, 40, 0, C.bgBlue, 20);
      mainFrame.name = "Os 5 Porqu\xEAs";
      const hdr = mkHeader("Os 5 porqu\xEA?");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      mainFrame.appendChild(sp(12));
      mainFrame.appendChild(rct(520, 1, C.line));
      mainFrame.appendChild(sp(12));
      const probRow = hb(0, 8, null);
      probRow.name = "section/problema";
      probRow.counterAxisAlignItems = "MIN";
      probRow.appendChild(tx("Problema:  ", 13, "Bold", C.blue, "_label"));
      probRow.appendChild(tx("Diga qual o problema encontrado.", 13, "Regular", C.muted, "field/problema"));
      mainFrame.appendChild(probRow);
      const emojis = ["\u{1F600}", "\u{1F60A}", "\u{1F914}", "\u{1F622}", "\u{1F92F}", "\u{1F631}"];
      const qLabels = ["Porqu\xEA o problema ocorre?", "Porqu\xEA?", "Porqu\xEA?", "Porqu\xEA?", "Porqu\xEA?", "Porqu\xEA?"];
      const pqKeys = ["porque-1", "porque-2", "porque-3", "porque-4", "porque-5", "porque-6"];
      for (let i = 0; i < 6; i++) {
        mainFrame.appendChild(sp(14));
        const row = hb(0, 12, null);
        row.name = "section/" + pqKeys[i];
        row.counterAxisAlignItems = "CENTER";
        row.appendChild(tx(emojis[i], 18, "Regular", C.text, "_emoji"));
        const block = vb(null, 0, 2, null);
        block.name = "_block";
        block.appendChild(tx(qLabels[i], 13, "Bold", C.blue, "_label"));
        block.appendChild(tx(i + 1 + "\xB0 motivo \u2014 descreva aqui", 12, "Regular", C.muted, "field/" + pqKeys[i]));
        row.appendChild(block);
        mainFrame.appendChild(row);
      }
      mainFrame.appendChild(sp(20));
      mainFrame.appendChild(rct(520, 1, C.line));
      mainFrame.appendChild(sp(12));
      addT(mainFrame, "Causa raiz", 14, "Bold", C.blue, "_label");
      mainFrame.appendChild(sp(4));
      addT(mainFrame, "A real causa do problema \xE9...", 12, "Regular", C.muted, "field/causa-raiz");
      mainFrame.appendChild(sp(8));
    } else if (fid === "stakeholders") {
      mainFrame = vb(780, 0, 0, C.white, 16);
      mainFrame.name = "Mapa de Stakeholders";
      const hdr = mkHeader("Mapa de Stakeholders \u2014 Poder \xD7 Interesse");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const canvas = figma.createFrame();
      canvas.resize(780, 640);
      canvas.fills = [{ type: "SOLID", color: C.white }];
      canvas.layoutAlign = "STRETCH";
      mainFrame.appendChild(canvas);
      const ox = 110, oy = 30, qw = 300, qh = 260;
      const q = (x, y, fill) => {
        const r = rct(qw, qh, fill);
        r.x = x;
        r.y = y;
        canvas.appendChild(r);
      };
      q(ox, oy, C.greenLight);
      q(ox + qw, oy, C.tealLight);
      q(ox, oy + qh, C.bg);
      q(ox + qw, oy + qh, { r: 1, g: 0.98, b: 0.929 });
      const ql = (txt, x, y, col) => {
        const t = tx(txt, 10, "Bold", col);
        t.x = x;
        t.y = y;
        canvas.appendChild(t);
      };
      ql("MANTER SATISFEITO", ox + 10, oy + 10, C.green);
      ql("GERENCIAR DE PERTO", ox + qw + 10, oy + 10, C.teal);
      ql("MONITORAR", ox + 10, oy + qh + 10, C.muted);
      ql("MANTER INFORMADO", ox + qw + 10, oy + qh + 10, C.amber);
      const yAx = rct(2, qh * 2 + 20, C.text);
      yAx.x = ox - 1;
      yAx.y = oy - 10;
      canvas.appendChild(yAx);
      const xAx = rct(qw * 2 + 20, 2, C.text);
      xAx.x = ox - 10;
      xAx.y = oy + qh * 2 + 1;
      canvas.appendChild(xAx);
      const yLbl = tx("PODER / INFLU\xCANCIA  \u2191", 10, "Bold", C.text);
      yLbl.x = 14;
      yLbl.y = oy + qh + 20;
      yLbl.rotation = -90;
      canvas.appendChild(yLbl);
      const xLbl = tx("INTERESSE / IMPACTO  \u2192", 10, "Bold", C.text);
      xLbl.x = ox + qw - 50;
      xLbl.y = oy + qh * 2 + 14;
      canvas.appendChild(xLbl);
      const axL = (t, x, y) => {
        const n = tx(t, 9, "Regular", C.muted);
        n.x = x;
        n.y = y;
        canvas.appendChild(n);
      };
      axL("Baixo", ox - 36, oy + qh * 2 - 14);
      axL("Alto", ox + qw * 2 - 24, oy + qh * 2 - 14);
      axL("Baixo", ox - 60, oy + qh * 2 - 14);
      axL("Alto", ox - 50, oy + 4);
      const sticky = (name, role, x, y, bg) => {
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const s = rct(110, 72, bg, 6);
        s.name = "section/" + key;
        s.x = x;
        s.y = y;
        canvas.appendChild(s);
        const t = tx(name, 10, "Bold", C.text, "field/" + key);
        t.x = x + 8;
        t.y = y + 8;
        canvas.appendChild(t);
        const d = tx(role, 9, "Regular", C.muted, "field/" + key + "-papel");
        d.x = x + 8;
        d.y = y + 24;
        canvas.appendChild(d);
      };
      sticky("Patrocinador", "Decide o or\xE7amento", ox + qw + 60, oy + 50, { r: 0.729, g: 0.953, b: 0.929 });
      sticky("Gestor de TI", "Aprova tecnologia", ox + qw + 170, oy + 140, { r: 0.729, g: 0.953, b: 0.929 });
      sticky("\xC1rea Jur\xEDdica", "Valida compliance", ox + 40, oy + 50, { r: 0.749, g: 0.953, b: 0.749 });
      sticky("Usu\xE1rio Final", "Usa o produto", ox + qw + 60, oy + qh + 60, { r: 1, g: 0.937, b: 0.698 });
      sticky("Comunica\xE7\xE3o", "Informada sobre", ox + 60, oy + qh + 140, { r: 0.94, g: 0.95, b: 0.96 });
    } else if (fid === "value-effort") {
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
      mainFrame.name = "Matriz Valor \xD7 Esfor\xE7o";
      const hdr = mkHeader("Matriz Valor \xD7 Esfor\xE7o");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      mainFrame.appendChild(veCanvas);
    } else if (fid === "atomic-research") {
      mainFrame = vb(960, 0, 0, { r: 0.973, g: 0.965, b: 0.996 }, 16);
      mainFrame.name = "Atomic Research";
      const hdr = mkHeader("Atomic Research");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const arDesc = vb(null, 24, 0, null);
      mainFrame.appendChild(arDesc);
      arDesc.layoutAlign = "STRETCH";
      arDesc.paddingBottom = 8;
      addT(arDesc, "Estrutura achados de pesquisa em 4 n\xEDveis: do experimento executado at\xE9 a conclus\xE3o estrat\xE9gica.", 11, "Regular", C.muted);
      const arCols = hb(24, 16, null);
      arCols.layoutAlign = "STRETCH";
      mainFrame.appendChild(arCols);
      const arDefs = [
        { label: "EXPERIMENTO", sub: "O que foi testado / observado?", color: C.blue, bg: C.blueLight },
        { label: "FATO", sub: "O que aconteceu / foi visto?", color: C.orange, bg: { r: 1, g: 0.945, b: 0.89 } },
        { label: "INSIGHT", sub: "O que isso significa?", color: C.teal, bg: C.tealLight },
        { label: "CONCLUS\xC3O", sub: "O que vamos fazer com isso?", color: C.green, bg: C.greenLight }
      ];
      arDefs.forEach((def, ci) => {
        const colKey = ["experimento", "fato", "insight", "conclusao"][ci];
        const colF = vb(208, 0, 10, def.bg, 12);
        colF.name = "section/" + colKey;
        colF.paddingBottom = 16;
        const chdr = vb(208, 14, 4, def.color, 0);
        chdr.name = "_header";
        chdr.paddingTop = chdr.paddingBottom = 12;
        chdr.layoutAlign = "STRETCH";
        const ct = tx(def.label, 12, "Bold", C.white, "_label");
        ct.layoutAlign = "STRETCH";
        ct.textAutoResize = "HEIGHT";
        const cs = tx(def.sub, 9, "Regular", C.white);
        cs.opacity = 0.85;
        cs.layoutAlign = "STRETCH";
        cs.textAutoResize = "HEIGHT";
        chdr.appendChild(ct);
        chdr.appendChild(cs);
        colF.appendChild(chdr);
        for (let i = 0; i < 3; i++) {
          const card = vb(180, 12, 0, C.white, 8);
          card.name = "section/" + colKey + "-" + (i + 1);
          card.paddingTop = card.paddingBottom = 12;
          card.layoutAlign = "STRETCH";
          card.strokes = [{ type: "SOLID", color: def.color }];
          card.strokeWeight = 1;
          const ph = tx("Clique para adicionar...", 11, "Regular", C.light, "field/" + colKey + "-" + (i + 1));
          ph.textAutoResize = "HEIGHT";
          ph.layoutAlign = "STRETCH";
          card.appendChild(ph);
          colF.appendChild(card);
        }
        arCols.appendChild(colF);
      });
      mainFrame.appendChild(sp(8));
    } else if (fid === "blueprint") {
      mainFrame = vb(1400, 0, 0, C.white, 16);
      mainFrame.name = "Blueprint de Servi\xE7o";
      const hdr = mkHeader("Blueprint de Servi\xE7o");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const bpCanvas = figma.createFrame();
      bpCanvas.resize(1400, 780);
      bpCanvas.fills = [{ type: "SOLID", color: C.bg }];
      bpCanvas.layoutAlign = "STRETCH";
      mainFrame.appendChild(bpCanvas);
      const lw = 180, sw = 380, pad = 16, rowH = 100;
      const laneLabels = ["Evid\xEAncias", "Jornada do Usu\xE1rio", "A\xE7\xF5es de Frontstage", "Tecnologia / Sistemas", "A\xE7\xF5es de Backstage", "Processos de Suporte"];
      const laneColors = [C.blueLight, { r: 0.878, g: 0.961, b: 0.996 }, C.blueLight, { r: 0.973, g: 0.965, b: 0.996 }, { r: 1, g: 0.945, b: 0.89 }, { r: 0.941, g: 0.992, b: 0.949 }];
      const stages = ["Etapa 1", "Etapa 2", "Etapa 3"];
      laneLabels.forEach((lane, ri) => {
        const ly = pad + ri * (rowH + 2);
        const lbl = rct(lw, rowH, laneColors[ri], 0, C.line, 1);
        lbl.x = pad;
        lbl.y = ly;
        bpCanvas.appendChild(lbl);
        const lt = tx(lane, 11, "Bold", ri < 3 ? C.blueDark : C.muted);
        lt.x = pad + 10;
        lt.y = ly + rowH / 2 - 8;
        bpCanvas.appendChild(lt);
      });
      stages.forEach((stage, ci) => {
        const sx = pad + lw + 8 + ci * (sw + 8);
        const stageHdr = rct(sw, 36, C.blue, 0, C.blueDark, 1);
        stageHdr.x = sx;
        stageHdr.y = 2;
        bpCanvas.appendChild(stageHdr);
        const sT = tx(stage, 13, "Bold", C.white);
        sT.x = sx + sw / 2 - 30;
        sT.y = 10;
        bpCanvas.appendChild(sT);
        const laneKeys = ["evidencias", "jornada", "frontstage", "tecnologia", "backstage", "suporte"];
        laneLabels.forEach((_, ri) => {
          const ly = pad + ri * (rowH + 2);
          const cellKey = laneKeys[ri] + "-etapa" + (ci + 1);
          const cell = rct(sw, rowH, C.white, 0, C.line, 1);
          cell.name = "section/" + cellKey;
          cell.x = sx;
          cell.y = ly;
          bpCanvas.appendChild(cell);
          const ph = tx("+ Adicionar", 10, "Regular", C.light, "field/" + cellKey);
          ph.x = sx + 12;
          ph.y = ly + 12;
          bpCanvas.appendChild(ph);
        });
      });
      const visY = pad + 3 * (rowH + 2) - 1;
      const visLine = rct(1400 - pad * 2, 3, C.orange);
      visLine.x = pad;
      visLine.y = visY;
      bpCanvas.appendChild(visLine);
      const visT = tx("\u2500\u2500\u2500 LINHA DE VISIBILIDADE \u2500\u2500\u2500", 9, "Bold", C.orange);
      visT.x = pad + lw + 8;
      visT.y = visY + 5;
      bpCanvas.appendChild(visT);
      mainFrame.appendChild(sp(16));
    } else if (fid === "heuristics") {
      mainFrame = vb(1e3, 0, 0, C.white, 16);
      mainFrame.name = "Heur\xEDsticas de Nielsen";
      const hdr = mkHeader("Heur\xEDsticas de Nielsen \u2014 Avalia\xE7\xE3o de Usabilidade");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const heuDesc = vb(null, 24, 0, null);
      mainFrame.appendChild(heuDesc);
      heuDesc.layoutAlign = "STRETCH";
      heuDesc.paddingBottom = 8;
      addT(heuDesc, "Avalie cada heur\xEDstica com uma nota de 1 a 5 e registre problemas encontrados.", 11, "Regular", C.muted);
      const hGrid = hb(24, 20, null);
      hGrid.counterAxisAlignItems = "MIN";
      hGrid.layoutAlign = "STRETCH";
      mainFrame.appendChild(hGrid);
      const hCol1 = vb(456, 0, 16, null);
      const hCol2 = vb(456, 0, 16, null);
      hGrid.appendChild(hCol1);
      hGrid.appendChild(hCol2);
      const hDefs = [
        { n: "1", name: "Visibilidade do status", desc: "O sistema deve sempre manter o usu\xE1rio informado sobre o que est\xE1 acontecendo." },
        { n: "2", name: "Correspond\xEAncia com o mundo real", desc: "O sistema deve falar a linguagem do usu\xE1rio, com palavras e conceitos familiares." },
        { n: "3", name: "Controle e liberdade do usu\xE1rio", desc: "Usu\xE1rios frequentemente escolhem fun\xE7\xF5es erradas; precisam de sa\xEDdas de emerg\xEAncia." },
        { n: "4", name: "Consist\xEAncia e padr\xF5es", desc: "Usu\xE1rios n\xE3o devem se questionar se palavras ou a\xE7\xF5es diferentes significam a mesma coisa." },
        { n: "5", name: "Preven\xE7\xE3o de erros", desc: "Projete com cuidado para prevenir problemas antes de ocorrerem." },
        { n: "6", name: "Reconhecimento em vez de mem\xF3ria", desc: "Minimize a carga de mem\xF3ria do usu\xE1rio deixando objetos e a\xE7\xF5es vis\xEDveis." },
        { n: "7", name: "Flexibilidade e efici\xEAncia", desc: "Aceleradores permitem que usu\xE1rios experientes executem a\xE7\xF5es mais rapidamente." },
        { n: "8", name: "Est\xE9tica e design minimalista", desc: "Di\xE1logos n\xE3o devem conter informa\xE7\xE3o irrelevante ou raramente necess\xE1ria." },
        { n: "9", name: "Ajuda para reconhecer erros", desc: "Mensagens de erro devem indicar claramente o problema e sugerir solu\xE7\xE3o." },
        { n: "10", name: "Ajuda e documenta\xE7\xE3o", desc: "Mesmo sem documenta\xE7\xE3o, pode ser necess\xE1rio fornecer ajuda facilmente pesquis\xE1vel." }
      ];
      const mkRatingRow = () => {
        const row = hb(0, 6, null);
        for (let s = 1; s <= 5; s++) {
          const box = vb(null, 6, 0, C.bg, 4);
          box.paddingTop = box.paddingBottom = 6;
          box.paddingLeft = box.paddingRight = 8;
          const bT = tx(String(s), 10, "Bold", C.muted);
          box.appendChild(bT);
          row.appendChild(box);
        }
        return row;
      };
      hDefs.forEach((h, i) => {
        const hKey = "h" + h.n;
        const card = vb(456, 16, 8, C.bg, 12);
        card.name = "section/" + hKey;
        card.paddingTop = card.paddingBottom = 16;
        card.layoutAlign = "STRETCH";
        const titleRow = hb(0, 8, null);
        titleRow.name = "_title-row";
        const badge = vb(null, 6, 0, C.blue, 6);
        badge.name = "_badge";
        badge.paddingTop = badge.paddingBottom = 4;
        badge.paddingLeft = badge.paddingRight = 8;
        badge.appendChild(tx(h.n, 10, "Bold", C.white, "_num"));
        titleRow.appendChild(badge);
        titleRow.appendChild(tx(h.name, 12, "Bold", C.text, "_label"));
        card.appendChild(titleRow);
        const dT = tx(h.desc, 10, "Regular", C.muted, "_desc");
        dT.textAutoResize = "HEIGHT";
        dT.layoutAlign = "STRETCH";
        card.appendChild(dT);
        const ratingLabel = tx("Severidade:", 10, "Bold", C.muted, "_label");
        card.appendChild(ratingLabel);
        const rRow = mkRatingRow();
        rRow.name = "_rating";
        card.appendChild(rRow);
        const obsT = tx("Observa\xE7\xF5es e problemas encontrados...", 10, "Regular", C.light, "field/" + hKey + "-obs");
        obsT.textAutoResize = "HEIGHT";
        obsT.layoutAlign = "STRETCH";
        card.appendChild(obsT);
        if (i % 2 === 0) hCol1.appendChild(card);
        else hCol2.appendChild(card);
      });
      mainFrame.appendChild(sp(16));
    } else if (fid === "opportunities") {
      mainFrame = vb(1e3, 0, 0, C.bgBlue, 16);
      mainFrame.name = "Mapa de Oportunidades";
      const hdr = mkHeader("Mapa de Oportunidades");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const opDesc = vb(null, 24, 0, null);
      mainFrame.appendChild(opDesc);
      opDesc.layoutAlign = "STRETCH";
      opDesc.paddingBottom = 8;
      addT(opDesc, "Agrupe oportunidades por tema. Use as colunas para classificar por cluster e prioridade.", 11, "Regular", C.muted);
      const opCols = hb(24, 16, null);
      opCols.layoutAlign = "STRETCH";
      mainFrame.appendChild(opCols);
      const opDefs = [
        { theme: "Tema 1", color: C.blue, bg: C.blueLight, priority: "Alta" },
        { theme: "Tema 2", color: C.orange, bg: { r: 1, g: 0.945, b: 0.89 }, priority: "M\xE9dia" },
        { theme: "Tema 3", color: C.teal, bg: C.tealLight, priority: "Alta" },
        { theme: "Tema 4", color: C.green, bg: C.greenLight, priority: "Baixa" }
      ];
      opDefs.forEach((def, ci) => {
        const clusterKey = "cluster-" + (ci + 1);
        const opCol = vb(214, 0, 10, def.bg, 12);
        opCol.name = "section/" + clusterKey;
        opCol.paddingBottom = 16;
        const colHdr = vb(214, 14, 4, def.color, 0);
        colHdr.name = "_header";
        colHdr.paddingTop = colHdr.paddingBottom = 12;
        colHdr.layoutAlign = "STRETCH";
        const ct = tx(def.theme, 13, "Bold", C.white, "field/" + clusterKey + "-tema");
        ct.layoutAlign = "STRETCH";
        ct.textAutoResize = "HEIGHT";
        colHdr.appendChild(ct);
        const pr = tx("Prioridade: " + def.priority, 9, "Regular", C.white, "field/" + clusterKey + "-prioridade");
        pr.opacity = 0.85;
        pr.layoutAlign = "STRETCH";
        pr.textAutoResize = "HEIGHT";
        colHdr.appendChild(pr);
        opCol.appendChild(colHdr);
        for (let i = 0; i < 4; i++) {
          const cardKey = clusterKey + "-op-" + (i + 1);
          const card = vb(186, 12, 0, C.white, 8);
          card.name = "section/" + cardKey;
          card.paddingTop = card.paddingBottom = 12;
          card.layoutAlign = "STRETCH";
          const ph = tx("Oportunidade " + (i + 1) + "...", 11, "Regular", C.light, "field/" + cardKey);
          ph.textAutoResize = "HEIGHT";
          ph.layoutAlign = "STRETCH";
          card.appendChild(ph);
          opCol.appendChild(card);
        }
        opCols.appendChild(opCol);
      });
      mainFrame.appendChild(sp(8));
    } else if (fid === "personas") {
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
      nameCol.name = "section/identificacao";
      nameCol.appendChild(tx("Perfil 1 - Nome do Perfil", 18, "Bold", C.blueDark, "field/nome"));
      nameCol.appendChild(tx("Breve descri\xE7\xE3o do perfil", 12, "Regular", C.muted, "field/descricao"));
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
      dataCol.name = "section/dados-demograficos";
      const addData = (l, v, fieldId) => {
        const r = hb(0, 8, null);
        r.name = "section/" + fieldId;
        r.appendChild(tx(l + ":", 14, "Bold", C.blueDark, "_label"));
        r.appendChild(tx(v, 14, "Regular", C.text, "field/" + fieldId));
        dataCol.appendChild(r);
      };
      addData("Nome", "Um nome (opcional)", "nome-completo");
      addData("Idade", "Idade m\xE9dia do perfil", "idade");
      addData("Ocupa\xE7\xE3o", "Trabalho / meio de trabalho", "ocupacao");
      addData("Renda", "Renda m\xE9dia", "renda");
      addData("Escolaridade", "Educa\xE7\xE3o formal", "escolaridade");
      detailsRow.appendChild(dataCol);
      body.appendChild(detailsRow);
      const colsRow = hb(0, 40, null);
      colsRow.layoutAlign = "STRETCH";
      const col1 = vb(null, 20, 12, C.blueLight, 12);
      col1.name = "section/objetivos";
      col1.layoutAlign = "STRETCH";
      col1.layoutGrow = 1;
      col1.paddingTop = col1.paddingBottom = 20;
      col1.appendChild(tx("Objetivos", 16, "Bold", C.blueDark, "_label"));
      const objT = tx("Listar objetivos relacionados ao produto...", 13, "Regular", C.text, "field/objetivos");
      col1.appendChild(objT);
      objT.textAutoResize = "HEIGHT";
      objT.layoutAlign = "STRETCH";
      colsRow.appendChild(col1);
      const col2 = vb(null, 20, 12, C.blueLight, 12);
      col2.name = "section/necessidades";
      col2.layoutAlign = "STRETCH";
      col2.layoutGrow = 1;
      col2.paddingTop = col2.paddingBottom = 20;
      col2.appendChild(tx("Necessidade", 16, "Bold", C.blueDark, "_label"));
      const necT = tx("Listar necessidades e dores para identificar oportunidades.", 13, "Regular", C.text, "field/necessidades");
      col2.appendChild(necT);
      necT.textAutoResize = "HEIGHT";
      necT.layoutAlign = "STRETCH";
      colsRow.appendChild(col2);
      body.appendChild(colsRow);
      const oppCol = vb(null, 0, 12, null);
      oppCol.name = "section/oportunidades";
      oppCol.layoutAlign = "STRETCH";
      oppCol.appendChild(tx("Oportunidades", 16, "Bold", C.blueDark, "_label"));
      const oppT = tx("Liste oportunidades de produto relacionadas \xE0s sess\xF5es anteriores.", 13, "Regular", C.text, "field/oportunidades");
      oppCol.appendChild(oppT);
      oppT.textAutoResize = "HEIGHT";
      oppT.layoutAlign = "STRETCH";
      body.appendChild(oppCol);
      const sep2 = rct(720, 1, C.blueLight);
      body.appendChild(sep2);
      sep2.layoutAlign = "STRETCH";
      const obsCol = vb(null, 0, 12, null);
      obsCol.name = "section/observacoes";
      obsCol.layoutAlign = "STRETCH";
      obsCol.appendChild(tx("Observa\xE7\xF5es adicionais", 14, "Bold", C.blueDark, "_label"));
      const obsT = tx("Observa\xE7\xF5es de hip\xF3teses descobertas em an\xE1lise de dados internos e externos.", 13, "Regular", C.text, "field/observacoes");
      obsCol.appendChild(obsT);
      obsT.textAutoResize = "HEIGHT";
      obsT.layoutAlign = "STRETCH";
      body.appendChild(obsCol);
    } else if (fid === "interview-script") {
      mainFrame = vb(800, 0, 0, C.white, 16);
      mainFrame.name = "Roteiro de Entrevistas";
      const hdr = mkHeader("Tag - Nome do Projeto");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const body = vb(null, 40, 24, null);
      mainFrame.appendChild(body);
      body.layoutAlign = "STRETCH";
      body.appendChild(tx("Roteiro de Entrevistas", 24, "Bold", C.blueDark));
      const addSec = (titleStr, descStr, isTitle, fieldId) => {
        const sec = vb(null, 0, 8, null);
        sec.name = fieldId ? "section/" + fieldId : "_section";
        sec.layoutAlign = "STRETCH";
        sec.appendChild(tx(titleStr, isTitle ? 18 : 14, "Bold", isTitle ? C.blueDark : C.text, "_label"));
        const d = tx(descStr, 13, "Regular", C.muted, fieldId ? "field/" + fieldId : void 0);
        sec.appendChild(d);
        d.textAutoResize = "HEIGHT";
        d.layoutAlign = "STRETCH";
        body.appendChild(sec);
      };
      addSec("1. Introdu\xE7\xE3o e Aquecimento", "Apresente-se, explique o objetivo e pe\xE7a consentimento para gravar. Perguntas de aquecimento...", true, "aquecimento");
      addSec("Perguntas sugeridas:", "- Como \xE9 um dia t\xEDpico de trabalho?\n- Quais ferramentas voc\xEA mais utiliza hoje?", false, "aquecimento-perguntas");
      const sep1 = rct(720, 1, C.line);
      sep1.name = "_divider";
      body.appendChild(sep1);
      sep1.layoutAlign = "STRETCH";
      addSec("2. Descoberta e Contexto", "Entenda como o usu\xE1rio lida com o problema hoje, antes de apresentar qualquer solu\xE7\xE3o.", true, "descoberta");
      addSec("Perguntas sugeridas:", "- Me conte sobre a \xFAltima vez que precisou realizar [tarefa].\n- O que foi mais dif\xEDcil?\n- Como voc\xEA contorna esse problema hoje?", false, "descoberta-perguntas");
      const sep2 = rct(720, 1, C.line);
      sep2.name = "_divider";
      body.appendChild(sep2);
      sep2.layoutAlign = "STRETCH";
      addSec("3. Aprofundamento / Prot\xF3tipo", "Caso haja prot\xF3tipo, apresente agora. Pe\xE7a para o usu\xE1rio pensar em voz alta.", true, "aprofundamento");
      addSec("Perguntas sugeridas:", "- O que voc\xEA acha que essa tela faz?\n- Onde voc\xEA clicaria para [a\xE7\xE3o]?\n- O que esperava que acontecesse ao clicar?", false, "aprofundamento-perguntas");
      const sep3 = rct(720, 1, C.line);
      sep3.name = "_divider";
      body.appendChild(sep3);
      sep3.layoutAlign = "STRETCH";
      addSec("4. Encerramento", "Abra espa\xE7o para considera\xE7\xF5es finais e agrade\xE7a.", true, "encerramento");
      addSec("Perguntas sugeridas:", "- H\xE1 algo que n\xE3o perguntei e que gostaria de comentar?\n- Como resumiria essa experi\xEAncia?", false, "encerramento-perguntas");
    } else if (fid === "journey") {
      mainFrame = vb(1e3, 0, 0, { r: 0.941, g: 0.965, b: 0.976 }, 16);
      mainFrame.name = "Jornada de Usu\xE1rio";
      const hdr = mkHeader("Jornada de Usu\xE1rio");
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
      leftCol.appendChild(mkL("Jornada", "Etapas da jornada"));
      leftCol.appendChild(mkL("Passos", "O que faz..."));
      leftCol.appendChild(mkL("Pensa e fala", "O que pensa e fala..."));
      leftCol.appendChild(mkL("Sentimentos", ""));
      leftCol.appendChild(mkL("Oportunidades", ""));
      leftCol.appendChild(mkL("Experi\xEAncia", "", 240));
      const rightCol = hb(0, 12, null);
      body.appendChild(rightCol);
      rightCol.layoutAlign = "STRETCH";
      for (let i = 1; i <= 2; i++) {
        const col = vb(330, 0, 12, null);
        col.layoutAlign = "STRETCH";
        const eTop = vb(null, 16, 4, { r: 0.2, g: 0.8, b: 0.96 }, 8);
        eTop.name = "section/etapa-" + i;
        eTop.layoutAlign = "STRETCH";
        eTop.appendChild(tx(i + ". Nome da Etapa", 16, "Bold", C.blueDark, "field/etapa-" + i + "-nome"));
        eTop.appendChild(tx("Descri\xE7\xE3o da etapa", 12, "Regular", C.blueDark, "field/etapa-" + i + "-descricao"));
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
        const mkrNamed = (val, fieldId) => {
          const b = mkr(val);
          b.name = "section/" + fieldId;
          const ch = b.children[0];
          if (ch && ch.type === "TEXT") ch.name = "field/" + fieldId;
          return b;
        };
        const wS = vb(null, 0, 8, null);
        wS.name = "section/etapa-" + i + "-passos";
        wS.layoutAlign = "STRETCH";
        wS.appendChild(mkrNamed("Passo 1", "etapa-" + i + "-passo-1"));
        wS.appendChild(mkrNamed("Passo 2", "etapa-" + i + "-passo-2"));
        col.appendChild(wS);
        const wP = vb(null, 0, 8, null);
        wP.name = "section/etapa-" + i + "-pensamentos";
        wP.layoutAlign = "STRETCH";
        wP.appendChild(mkrNamed("Pensamento 1", "etapa-" + i + "-pensamento-1"));
        wP.appendChild(mkrNamed("Pensamento 2", "etapa-" + i + "-pensamento-2"));
        col.appendChild(wP);
        const wF = vb(null, 0, 8, null);
        wF.name = "section/etapa-" + i + "-sentimentos";
        wF.layoutAlign = "STRETCH";
        wF.appendChild(mkrNamed("Sentimento 1", "etapa-" + i + "-sentimento-1"));
        wF.appendChild(mkrNamed("Sentimento 2", "etapa-" + i + "-sentimento-2"));
        col.appendChild(wF);
        const wO = vb(null, 0, 8, null);
        wO.name = "section/etapa-" + i + "-oportunidades";
        wO.layoutAlign = "STRETCH";
        wO.appendChild(mkrNamed("Oportunidade 1", "etapa-" + i + "-oportunidade-1"));
        wO.appendChild(mkrNamed("Oportunidade 2", "etapa-" + i + "-oportunidade-2"));
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
    } else if (fid === "relational-map") {
      mainFrame = vb(1040, 0, 0, C.white, 16);
      mainFrame.name = "Mapa Relacional";
      const hdr = mkHeader("Mapa Relacional \u2014 Certezas \xB7 Hip\xF3teses \xB7 M\xE9todos");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const rmDesc = vb(null, 24, 0, null);
      mainFrame.appendChild(rmDesc);
      rmDesc.layoutAlign = "STRETCH";
      rmDesc.paddingBottom = 8;
      addT(rmDesc, "Classifique seus achados por tema e conecte-os aos m\xE9todos de pesquisa mais adequados para valida\xE7\xE3o.", 11, "Regular", C.muted);
      const rmBody = hb(24, 20, null);
      rmBody.layoutAlign = "STRETCH";
      mainFrame.appendChild(rmBody);
      const rmThemes = [
        { label: "Tema 1", sub: "Certezas do time", color: C.blue, bg: C.blueLight, cardBg: { r: 0.88, g: 0.94, b: 1 } },
        { label: "Tema 2", sub: "Suposi\xE7\xF5es a validar", color: C.amber, bg: { r: 1, g: 0.98, b: 0.93 }, cardBg: { r: 1, g: 0.95, b: 0.82 } },
        { label: "Tema 3", sub: "D\xFAvidas principais", color: C.red, bg: { r: 1, g: 0.95, b: 0.95 }, cardBg: { r: 1, g: 0.88, b: 0.88 } },
        { label: "M\xE9todos", sub: "Pesquisa recomendada", color: C.teal, bg: C.tealLight, cardBg: { r: 0.8, g: 0.96, b: 0.94 } }
      ];
      rmThemes.forEach((def, ci) => {
        const rmCol = vb(222, 0, 0, def.bg, 12);
        rmCol.paddingBottom = 0;
        const rmHdr = vb(222, 14, 4, def.color, 0);
        rmHdr.paddingTop = rmHdr.paddingBottom = 14;
        rmHdr.layoutAlign = "STRETCH";
        const rmT = tx(def.label, 13, "Bold", C.white);
        rmT.layoutAlign = "STRETCH";
        rmT.textAutoResize = "HEIGHT";
        const rmS = tx(def.sub, 9, "Regular", C.white);
        rmS.opacity = 0.85;
        rmS.layoutAlign = "STRETCH";
        rmS.textAutoResize = "HEIGHT";
        rmHdr.appendChild(rmT);
        rmHdr.appendChild(rmS);
        rmCol.appendChild(rmHdr);
        for (let k = 0; k < 3; k++) {
          const itemKey = "tema-" + (ci + 1) + "-item-" + (k + 1);
          const rmCard = vb(194, 12, 0, C.white, 6);
          rmCard.name = "section/" + itemKey;
          rmCard.paddingTop = rmCard.paddingBottom = 10;
          rmCard.layoutAlign = "STRETCH";
          rmCard.strokes = [{ type: "SOLID", color: def.color }];
          rmCard.strokeWeight = 0.75;
          const phT = tx("Item " + (k + 1) + " \u2014 clique para editar", 10, "Regular", C.light, "field/" + itemKey);
          phT.textAutoResize = "HEIGHT";
          phT.layoutAlign = "STRETCH";
          rmCard.appendChild(phT);
          rmCol.appendChild(rmCard);
        }
        const bigQuadro = figma.createFrame();
        bigQuadro.resize(222, 260);
        bigQuadro.fills = [{ type: "SOLID", color: def.cardBg }];
        bigQuadro.strokes = [{ type: "SOLID", color: def.color }];
        bigQuadro.strokeWeight = 1.5;
        bigQuadro.cornerRadius = 0;
        bigQuadro.layoutAlign = "STRETCH";
        bigQuadro.name = "quadro-" + def.label;
        const bigT = tx("\xC1rea livre", 11, "Bold", def.color);
        bigT.x = 12;
        bigT.y = 12;
        bigQuadro.appendChild(bigT);
        const bigS = tx("Adicione itens, stickies\nou conex\xF5es aqui...", 10, "Regular", def.color);
        bigS.x = 12;
        bigS.y = 32;
        bigS.opacity = 0.65;
        bigQuadro.appendChild(bigS);
        rmCol.appendChild(bigQuadro);
        rmBody.appendChild(rmCol);
      });
      mainFrame.appendChild(sp(8));
    } else if (fid === "5w2h") {
      mainFrame = vb(760, 0, 0, C.white, 16);
      mainFrame.name = "5W2H";
      const hdr = mkHeader("5W2H \u2014 Planejamento Estruturado");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const body = vb(null, 0, 0, null);
      mainFrame.appendChild(body);
      body.layoutAlign = "STRETCH";
      const rows5w2h = [
        { en: "WHAT", pt: "O qu\xEA?", sub: "O que vai ser feito / desenvolvido?", color: C.blue },
        { en: "WHY", pt: "Por qu\xEA?", sub: "Por que isso deve ser feito?", color: C.orange },
        { en: "WHO", pt: "Quem?", sub: "Quem ser\xE1 o respons\xE1vel pela execu\xE7\xE3o?", color: C.teal },
        { en: "WHERE", pt: "Onde?", sub: "Onde ser\xE1 executado / entregue?", color: C.green },
        { en: "WHEN", pt: "Quando?", sub: "Quando deve acontecer? Qual o prazo?", color: C.amber },
        { en: "HOW", pt: "Como?", sub: "Como ser\xE1 feito? Quais os passos?", color: C.blueDark },
        { en: "HOW MUCH", pt: "Quanto custa?", sub: "Qual o custo ou esfor\xE7o estimado?", color: C.red }
      ];
      const w2hKeys = ["what", "why", "who", "where", "when", "how", "how-much"];
      rows5w2h.forEach((row, i) => {
        const card = figma.createFrame();
        card.name = "section/" + w2hKeys[i];
        card.layoutMode = "HORIZONTAL";
        card.paddingLeft = card.paddingRight = 0;
        card.paddingTop = card.paddingBottom = 0;
        card.itemSpacing = 0;
        card.primaryAxisSizingMode = "AUTO";
        card.counterAxisSizingMode = "AUTO";
        card.counterAxisAlignItems = "MIN";
        card.fills = i % 2 === 0 ? [{ type: "SOLID", color: C.bg }] : [{ type: "SOLID", color: C.white }];
        card.layoutAlign = "STRETCH";
        const lbl = vb(140, 14, 4, row.color, 0);
        lbl.counterAxisSizingMode = "FIXED";
        lbl.resize(140, 10);
        lbl.primaryAxisSizingMode = "AUTO";
        lbl.paddingTop = lbl.paddingBottom = 20;
        lbl.counterAxisAlignItems = "CENTER";
        const enT = tx(row.en, 13, "Bold", C.white);
        enT.textAlignHorizontal = "CENTER";
        enT.layoutAlign = "STRETCH";
        enT.textAutoResize = "HEIGHT";
        lbl.appendChild(enT);
        const ptT = tx(row.pt, 10, "Regular", C.white);
        ptT.opacity = 0.82;
        ptT.textAlignHorizontal = "CENTER";
        ptT.layoutAlign = "STRETCH";
        ptT.textAutoResize = "HEIGHT";
        lbl.appendChild(ptT);
        card.appendChild(lbl);
        const content = vb(null, 20, 4, null, 0);
        content.layoutAlign = "STRETCH";
        content.paddingTop = content.paddingBottom = 16;
        const subT = tx(row.sub, 10, "Regular", C.muted, "_label");
        subT.textAutoResize = "HEIGHT";
        subT.layoutAlign = "STRETCH";
        content.appendChild(subT);
        const valT = tx("Clique para adicionar...", 13, "Regular", C.light, "field/" + w2hKeys[i]);
        valT.textAutoResize = "HEIGHT";
        valT.layoutAlign = "STRETCH";
        content.appendChild(valT);
        card.appendChild(content);
        body.appendChild(card);
        if (i < rows5w2h.length - 1) {
          const sep = rct(760, 1, C.line);
          sep.layoutAlign = "STRETCH";
          body.appendChild(sep);
        }
      });
      mainFrame.appendChild(sp(8));
    } else if (fid === "golden-circle") {
      mainFrame = vb(700, 0, 0, C.white, 16);
      mainFrame.name = "Golden Circle";
      const hdr = mkHeader("Golden Circle \u2014 Simon Sinek");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const canvas = figma.createFrame();
      canvas.resize(700, 640);
      canvas.fills = [{ type: "SOLID", color: C.white }];
      canvas.layoutAlign = "STRETCH";
      mainFrame.appendChild(canvas);
      const cx = 350, cy = 320;
      const whatE = ell(560, 560, C.blueLight, C.blue, 2);
      whatE.x = cx - 280;
      whatE.y = cy - 280;
      canvas.appendChild(whatE);
      const howE = ell(380, 380, { r: 1, g: 0.929, b: 0.878 }, C.orange, 2);
      howE.x = cx - 190;
      howE.y = cy - 190;
      canvas.appendChild(howE);
      const whyE = ell(200, 200, C.bgBlue, C.blue, 2.5);
      whyE.x = cx - 100;
      whyE.y = cy - 100;
      canvas.appendChild(whyE);
      const addCL = (t, sub, x, y, tc, sc) => {
        const tN = tx(t, 14, "Bold", tc);
        tN.x = x;
        tN.y = y;
        canvas.appendChild(tN);
        const sN = tx(sub, 10, "Regular", sc);
        sN.x = x;
        sN.y = y + 20;
        canvas.appendChild(sN);
      };
      addCL("POR QU\xCA?", "Prop\xF3sito / Cren\xE7a", cx - 46, cy - 24, C.blueDark, C.muted);
      addCL("COMO?", "Processo / Valores", cx - 34, cy - 175, C.orange, C.muted);
      addCL("O QU\xCA?", "Produto / Servi\xE7o", cx - 30, cy - 263, C.blue, C.muted);
      const addBox = (title, prompt, x, y, strokeC, fieldId) => {
        const box = vb(180, 12, 4, { r: 0.97, g: 0.98, b: 0.99 }, 10);
        box.name = "section/" + fieldId;
        box.paddingTop = box.paddingBottom = 12;
        box.strokes = [{ type: "SOLID", color: strokeC }];
        box.strokeWeight = 1.5;
        const t = tx(title, 12, "Bold", strokeC, "_label");
        t.textAutoResize = "HEIGHT";
        t.layoutAlign = "STRETCH";
        box.appendChild(t);
        const p = tx(prompt, 11, "Regular", C.muted, "field/" + fieldId);
        p.textAutoResize = "HEIGHT";
        p.layoutAlign = "STRETCH";
        box.appendChild(p);
        box.x = x;
        box.y = y;
        canvas.appendChild(box);
      };
      addBox("Por qu\xEA existimos?", "Nosso prop\xF3sito e cren\xE7a central...", 20, 270, C.blue, "por-que");
      addBox("Como fazemos?", "Nossos processos e princ\xEDpios...", 490, 190, C.orange, "como");
      addBox("O que entregamos?", "Nossos produtos e servi\xE7os...", 490, 390, C.blue, "o-que");
    } else if (fid === "risk-matrix") {
      mainFrame = vb(820, 0, 0, C.white, 16);
      mainFrame.name = "Matriz de Riscos";
      const hdr = mkHeader("Matriz de Riscos \u2014 Probabilidade \xD7 Impacto");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const canvas = figma.createFrame();
      canvas.resize(820, 580);
      canvas.fills = [{ type: "SOLID", color: C.white }];
      canvas.layoutAlign = "STRETCH";
      mainFrame.appendChild(canvas);
      const ox = 120, oy = 20, cw = 220, ch = 160;
      const zoneFills = [
        [{ r: 1, g: 0.949, b: 0.749 }, { r: 1, g: 0.8, b: 0.4 }, { r: 0.98, g: 0.43, b: 0.43 }],
        [C.greenLight, { r: 1, g: 0.949, b: 0.749 }, { r: 1, g: 0.8, b: 0.4 }],
        [C.greenLight, C.greenLight, { r: 1, g: 0.949, b: 0.749 }]
      ];
      const zoneLabels = [
        ["Moderado", "Alto", "Cr\xEDtico"],
        ["Baixo", "Moderado", "Alto"],
        ["Baixo", "Baixo", "Moderado"]
      ];
      const zoneLabelColors = [
        [C.amber, C.orange, C.red],
        [C.green, C.amber, C.orange],
        [C.green, C.green, C.amber]
      ];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const cell = rct(cw, ch, zoneFills[r][c], 0, C.line, 1);
          cell.x = ox + c * cw;
          cell.y = oy + r * ch;
          canvas.appendChild(cell);
          const lbl = tx("Risco " + zoneLabels[r][c], 11, "Bold", zoneLabelColors[r][c]);
          lbl.x = ox + c * cw + 10;
          lbl.y = oy + r * ch + 10;
          canvas.appendChild(lbl);
          const ph = tx("+ Adicionar risco", 10, "Regular", C.muted);
          ph.x = ox + c * cw + 10;
          ph.y = oy + r * ch + 30;
          canvas.appendChild(ph);
        }
      }
      ["ALTA", "M\xC9DIA", "BAIXA"].forEach((l, i) => {
        const t = tx(l, 10, "Bold", C.text);
        t.x = ox - 60;
        t.y = oy + i * ch + ch / 2 - 6;
        canvas.appendChild(t);
      });
      ["BAIXO", "M\xC9DIO", "ALTO"].forEach((l, i) => {
        const t = tx(l, 10, "Bold", C.text);
        t.x = ox + i * cw + cw / 2 - 18;
        t.y = oy + 3 * ch + 12;
        canvas.appendChild(t);
      });
      const yT = tx("PROBABILIDADE  \u2191", 10, "Bold", C.text);
      yT.x = 14;
      yT.y = oy + ch + ch / 2;
      yT.rotation = -90;
      canvas.appendChild(yT);
      const xT = tx("IMPACTO  \u2192", 10, "Bold", C.text);
      xT.x = ox + cw;
      xT.y = oy + 3 * ch + 30;
      canvas.appendChild(xT);
      mainFrame.appendChild(sp(16));
    } else if (fid === "crazy-8s") {
      mainFrame = vb(900, 0, 0, C.bgBlue, 16);
      mainFrame.name = "Crazy 8s";
      const hdr = mkHeader("Crazy 8s \u2014 8 ideias em 8 minutos");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const intro = vb(null, 24, 4, null);
      mainFrame.appendChild(intro);
      intro.layoutAlign = "STRETCH";
      intro.paddingBottom = 0;
      addT(intro, "Regras do exerc\xEDcio", 12, "Bold", C.blue);
      addT(intro, "1 minuto por quadrante \xB7 Sem editar, s\xF3 esbo\xE7ar \xB7 N\xE3o avalie as ideias durante o exerc\xEDcio", 11, "Regular", C.muted);
      const grid = figma.createFrame();
      grid.layoutMode = "HORIZONTAL";
      grid.paddingLeft = grid.paddingRight = 24;
      grid.paddingTop = grid.paddingBottom = 16;
      grid.itemSpacing = 16;
      grid.primaryAxisSizingMode = "AUTO";
      grid.counterAxisSizingMode = "AUTO";
      grid.counterAxisAlignItems = "MIN";
      grid.fills = [];
      grid.layoutAlign = "STRETCH";
      mainFrame.appendChild(grid);
      const col1 = vb(null, 0, 16, null);
      col1.counterAxisSizingMode = "AUTO";
      const col2 = vb(null, 0, 16, null);
      col2.counterAxisSizingMode = "AUTO";
      grid.appendChild(col1);
      grid.appendChild(col2);
      for (let i = 1; i <= 8; i++) {
        const box = vb(400, 16, 8, C.white, 12);
        box.name = "section/ideia-" + i;
        box.counterAxisSizingMode = "FIXED";
        box.resize(400, 200);
        box.primaryAxisSizingMode = "FIXED";
        box.strokes = [{ type: "SOLID", color: C.line }];
        box.strokeWeight = 1.5;
        const badge = hb(8, 4, C.blue, 12);
        badge.name = "_badge";
        badge.paddingTop = badge.paddingBottom = 4;
        const badgeT = tx(String(i), 11, "Bold", C.white, "_num");
        badge.appendChild(badgeT);
        box.appendChild(badge);
        const ph = tx("Esboce ou descreva a ideia " + i + "...", 11, "Regular", C.light, "field/ideia-" + i);
        ph.textAutoResize = "HEIGHT";
        ph.layoutAlign = "STRETCH";
        box.appendChild(ph);
        if (i <= 4) col1.appendChild(box);
        else col2.appendChild(box);
      }
      mainFrame.appendChild(sp(8));
    } else if (fid === "dot-voting") {
      mainFrame = vb(860, 0, 0, C.white, 16);
      mainFrame.name = "Dot Voting";
      const hdr = mkHeader("Dot Voting \u2014 Prioriza\xE7\xE3o Colaborativa");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const body = vb(null, 24, 0, null);
      mainFrame.appendChild(body);
      body.layoutAlign = "STRETCH";
      body.paddingBottom = 24;
      addT(body, "Como funciona", 12, "Bold", C.blue);
      addT(body, "Cada participante tem 5 pontos (dots) para distribuir entre as ideias. Pode colocar mais de um ponto na mesma ideia.", 11, "Regular", C.muted);
      mainFrame.appendChild(sp(4));
      const tHead = figma.createFrame();
      tHead.layoutMode = "HORIZONTAL";
      tHead.paddingLeft = tHead.paddingRight = 0;
      tHead.paddingTop = tHead.paddingBottom = 10;
      tHead.itemSpacing = 0;
      tHead.primaryAxisSizingMode = "AUTO";
      tHead.counterAxisSizingMode = "AUTO";
      tHead.fills = [{ type: "SOLID", color: C.blue }];
      tHead.layoutAlign = "STRETCH";
      body.appendChild(tHead);
      const thItem = vb(380, 12, 0, null, 0);
      thItem.paddingTop = thItem.paddingBottom = 10;
      thItem.counterAxisSizingMode = "FIXED";
      thItem.resize(380, 10);
      thItem.primaryAxisSizingMode = "AUTO";
      const thItemT = tx("Ideia / Iniciativa", 12, "Bold", C.white);
      thItemT.layoutAlign = "STRETCH";
      thItemT.textAutoResize = "HEIGHT";
      thItem.appendChild(thItemT);
      tHead.appendChild(thItem);
      const participants = ["Participante 1", "Participante 2", "Participante 3", "Total"];
      participants.forEach((p) => {
        const thP = vb(100, 12, 0, null, 0);
        thP.paddingTop = thP.paddingBottom = 10;
        thP.counterAxisSizingMode = "FIXED";
        thP.resize(100, 10);
        thP.primaryAxisSizingMode = "AUTO";
        thP.counterAxisAlignItems = "CENTER";
        const thPT = tx(p, 11, "Bold", C.white);
        thPT.textAlignHorizontal = "CENTER";
        thPT.layoutAlign = "STRETCH";
        thPT.textAutoResize = "HEIGHT";
        thP.appendChild(thPT);
        tHead.appendChild(thP);
      });
      const ideias = [
        "Ideia / Iniciativa 1",
        "Ideia / Iniciativa 2",
        "Ideia / Iniciativa 3",
        "Ideia / Iniciativa 4",
        "Ideia / Iniciativa 5",
        "Ideia / Iniciativa 6"
      ];
      ideias.forEach((ideia, i) => {
        const row = figma.createFrame();
        row.name = "section/item-" + (i + 1);
        row.layoutMode = "HORIZONTAL";
        row.paddingLeft = row.paddingRight = 0;
        row.paddingTop = row.paddingBottom = 0;
        row.itemSpacing = 0;
        row.primaryAxisSizingMode = "AUTO";
        row.counterAxisSizingMode = "AUTO";
        row.fills = i % 2 === 0 ? [{ type: "SOLID", color: C.white }] : [{ type: "SOLID", color: C.bg }];
        row.layoutAlign = "STRETCH";
        body.appendChild(row);
        const itemCell = vb(380, 16, 0, null, 0);
        itemCell.name = "section/item-" + (i + 1) + "-descricao";
        itemCell.paddingTop = itemCell.paddingBottom = 12;
        itemCell.counterAxisSizingMode = "FIXED";
        itemCell.resize(380, 10);
        itemCell.primaryAxisSizingMode = "AUTO";
        const itemT = tx(ideia, 12, "Regular", C.text, "field/item-" + (i + 1));
        itemT.layoutAlign = "STRETCH";
        itemT.textAutoResize = "HEIGHT";
        itemCell.appendChild(itemT);
        row.appendChild(itemCell);
        const dotColors = [{ r: 0.2, g: 0.6, b: 1 }, { r: 1, g: 0.5, b: 0.2 }, { r: 0.3, g: 0.75, b: 0.4 }];
        [0, 1, 2].forEach((p) => {
          const dotCell = vb(100, 8, 4, null, 0);
          dotCell.paddingTop = dotCell.paddingBottom = 12;
          dotCell.counterAxisSizingMode = "FIXED";
          dotCell.resize(100, 10);
          dotCell.primaryAxisSizingMode = "AUTO";
          dotCell.counterAxisAlignItems = "CENTER";
          const dotsT = tx("\u25CF \u25CF \u25CF", 12, "Regular", dotColors[p]);
          dotsT.opacity = 0.3;
          dotsT.textAlignHorizontal = "CENTER";
          dotsT.layoutAlign = "STRETCH";
          dotsT.textAutoResize = "HEIGHT";
          dotCell.appendChild(dotsT);
          row.appendChild(dotCell);
        });
        const totalCell = vb(100, 8, 0, null, 0);
        totalCell.paddingTop = totalCell.paddingBottom = 12;
        totalCell.counterAxisSizingMode = "FIXED";
        totalCell.resize(100, 10);
        totalCell.primaryAxisSizingMode = "AUTO";
        totalCell.counterAxisAlignItems = "CENTER";
        const totalT = tx("0", 14, "Bold", C.blue);
        totalT.textAlignHorizontal = "CENTER";
        totalT.layoutAlign = "STRETCH";
        totalT.textAutoResize = "HEIGHT";
        totalCell.appendChild(totalT);
        row.appendChild(totalCell);
        const sep = rct(860, 1, C.line);
        sep.layoutAlign = "STRETCH";
        body.appendChild(sep);
      });
    } else if (fid === "journey-versioning") {
      mainFrame = vb(1400, 0, 0, { r: 0.941, g: 0.965, b: 0.976 }, 16);
      mainFrame.name = "Versionamento de Jornadas";
      const hdr = mkHeader("Versionamento de Jornadas \u2014 Atual \xD7 Proposta");
      mainFrame.appendChild(hdr);
      hdr.layoutAlign = "STRETCH";
      const body = hb(24, 20, null);
      body.layoutAlign = "STRETCH";
      body.counterAxisAlignItems = "MIN";
      mainFrame.appendChild(body);
      const labelCol = vb(180, 0, 12, null);
      body.appendChild(labelCol);
      const rowLabels = ["Etapa", "A\xE7\xE3o do Usu\xE1rio", "Emo\xE7\xE3o / Sentimento", "Dores / Problemas", "Oportunidades", "Observa\xE7\xF5es"];
      const rowHeights = [80, 100, 80, 100, 100, 80];
      const mkTopBadge = (label) => {
        const b = vb(180, 12, 0, C.white, 10);
        b.counterAxisSizingMode = "FIXED";
        b.resize(180, 80);
        b.primaryAxisSizingMode = "FIXED";
        b.counterAxisAlignItems = "CENTER";
        const t = tx(label, 12, "Bold", C.text);
        t.textAlignHorizontal = "CENTER";
        t.textAutoResize = "HEIGHT";
        t.layoutAlign = "STRETCH";
        b.appendChild(t);
        return b;
      };
      labelCol.appendChild(mkTopBadge("Eixo da Jornada"));
      rowLabels.slice(1).forEach((rl, i) => {
        const b = vb(180, 12, 0, C.white, 10);
        b.counterAxisSizingMode = "FIXED";
        b.resize(180, rowHeights[i + 1]);
        b.primaryAxisSizingMode = "FIXED";
        b.counterAxisAlignItems = "CENTER";
        const t = tx(rl, 12, "Bold", C.muted);
        t.textAlignHorizontal = "CENTER";
        t.textAutoResize = "HEIGHT";
        t.layoutAlign = "STRETCH";
        b.appendChild(t);
        labelCol.appendChild(b);
      });
      const versions = [
        { label: "v1.0 \u2014 Jornada Atual", badge: C.muted, bg: C.bg },
        { label: "v2.0 \u2014 Jornada Proposta", badge: C.blue, bg: C.blueLight },
        { label: "v3.0 \u2014 Vis\xE3o Futura", badge: C.teal, bg: C.tealLight }
      ];
      const verKeys = ["v1", "v2", "v3"];
      const rowFieldKeys = ["acao", "emocao", "dores", "oportunidades", "observacoes"];
      versions.forEach((ver, vi) => {
        const vKey = verKeys[vi];
        const col = vb(360, 0, 12, null);
        col.name = "section/" + vKey;
        body.appendChild(col);
        const badge = vb(null, 12, 0, ver.badge, 10);
        badge.name = "_header";
        badge.layoutAlign = "STRETCH";
        badge.counterAxisSizingMode = "AUTO";
        badge.primaryAxisSizingMode = "AUTO";
        badge.paddingTop = badge.paddingBottom = 12;
        badge.counterAxisAlignItems = "CENTER";
        const badgeT = tx(ver.label, 13, "Bold", C.white, "_label");
        badgeT.textAlignHorizontal = "CENTER";
        badgeT.layoutAlign = "STRETCH";
        badgeT.textAutoResize = "HEIGHT";
        badge.appendChild(badgeT);
        col.appendChild(badge);
        rowLabels.slice(1).forEach((_, i) => {
          const cellKey = vKey + "-" + rowFieldKeys[i];
          const cell = vb(null, 12, 4, ver.bg, 8);
          cell.name = "section/" + cellKey;
          cell.layoutAlign = "STRETCH";
          cell.counterAxisSizingMode = "FIXED";
          cell.resize(360, rowHeights[i + 1]);
          cell.primaryAxisSizingMode = "FIXED";
          const ph = tx("Descreva aqui...", 11, "Regular", C.light, "field/" + cellKey);
          ph.textAutoResize = "HEIGHT";
          ph.layoutAlign = "STRETCH";
          cell.appendChild(ph);
          col.appendChild(cell);
        });
      });
      mainFrame.appendChild(sp(8));
    }
    if (mainFrame) {
      const frameName = `${CANVAS_PREFIX} ${mainFrame.name} \u2014 ${ts}`;
      mainFrame.name = frameName;
      figma.currentPage.appendChild(mainFrame);
      const vp = figma.viewport.bounds;
      mainFrame.x = Math.round(vp.x + (vp.width - mainFrame.width) / 2);
      mainFrame.y = Math.round(vp.y + (vp.height - mainFrame.height) / 2);
      mainFrame.setSharedPluginData("maturai", "frameworkId", framework.id);
      mainFrame.setSharedPluginData("maturai", "frameworkName", framework.name);
      mainFrame.setSharedPluginData("maturai", "injectedAt", (/* @__PURE__ */ new Date()).toISOString());
      const grp = figma.group([mainFrame], figma.currentPage);
      grp.name = frameName;
      figma.currentPage.selection = [grp];
      figma.viewport.scrollAndZoomIntoView([grp]);
      figma.ui.postMessage({ type: "framework-injected", frameworkId: framework.id, frameName });
      figma.notify("Framework inserido no canvas! \u2713");
    }
  }
  async function scanFrameworks(frameworkIds) {
    const page = figma.currentPage;
    const candidates = page.findAll(
      (n) => n.type === "FRAME" && n.name.startsWith(CANVAS_PREFIX)
    );
    const results = [];
    for (const frame of candidates) {
      const frameworkId = frame.getSharedPluginData("maturai", "frameworkId");
      if (!frameworkId) continue;
      if (frameworkIds && frameworkIds.length > 0 && !frameworkIds.includes(frameworkId)) continue;
      const fieldNodes = frame.findAll(
        (n) => n.type === "TEXT" && n.name.startsWith("field/")
      );
      const data = {};
      for (const node of fieldNodes) {
        const fieldId = node.name.slice("field/".length);
        data[fieldId] = node.characters.trim();
      }
      results.push({
        frameworkId,
        frameworkName: frame.getSharedPluginData("maturai", "frameworkName") || frameworkId,
        frameName: frame.name,
        instanceId: frame.id,
        injectedAt: frame.getSharedPluginData("maturai", "injectedAt") || "",
        scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
        fieldCount: fieldNodes.length,
        data
      });
    }
    return results;
  }
})();
