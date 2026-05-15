import { isDS, registerToFrameJson, frameJsonTemplate } from './audit.js';

figma.showUI(__html__, { width: 480, height: 750 });

let activeHighlightNode = null;

// Tracks the lowest occupied Y per column (keyed by rounded X) — avoids traversing the Figma tree
const specColumnTracker = {};

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

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'ui-ready') {
    try {
      const savedState = await figma.clientStorage.getAsync('handoffData');
      figma.ui.postMessage({
        type: 'init-plugin',
        version: '2.0.0',
        savedState: savedState || null
      });
    } catch (err) {
      console.error("Initialization error:", err);
    }
    return;
  }

  if (msg.type === 'get-selection-name') {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      const node = selection[0];
      if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE" || node.type === "SECTION") {
        figma.ui.postMessage({
          type: 'selection-name',
          name: node.name,
          isManual: true
        });
      }
    } else {
      // No selection: fallback to file/project name
      figma.ui.postMessage({
        type: 'selection-name',
        name: figma.root.name,
        isManual: true
      });
    }
    return;
  }
  if (msg.type === "resize") {
    figma.ui.resize(msg.width, msg.height);
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
        f.layoutAlign = "MIN";

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
          node.layoutAlign = "MIN"; // Hug height (don't stretch)
          if (node.type === "FRAME") {
            if (node.layoutMode === "HORIZONTAL") node.counterAxisSizingMode = "AUTO"; // Hug height
            else node.primaryAxisSizingMode = "AUTO"; // Hug height
          } else if (node.type === "TEXT") {
            node.textAutoResize = "HEIGHT"; // Hug height, width controlled by layoutGrow
          }
        }
      }


      function createSection(parent, titleText) {
        const section = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
        section.name = "Section: " + titleText;
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
        row.name = "Row: " + label;
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



      // MAIN CONTAINER
      const mainContainer = createFrame("HORIZONTAL", 64, 48, hexToRgb("#026173"));
      mainContainer.name = "Handoff Documentation";
      mainContainer.counterAxisAlignItems = "MIN"; // Top align
      mainContainer.primaryAxisSizingMode = "AUTO"; // Hug children width
      mainContainer.counterAxisSizingMode = "AUTO"; // Hug children height

      // 1. FICHA TÉCNICA
      const fichaTecnica = createFrame("VERTICAL", 0, 0, { r: 1, g: 1, b: 1 });
      fichaTecnica.name = "Ficha de projeto";
      fichaTecnica.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
      fichaTecnica.resize(600, 100);
      fichaTecnica.counterAxisSizingMode = "FIXED"; // Base width 600
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
        createRow(infoSection, "Título do Projeto", data.step1.fluxo);
        createRow(infoSection, "Objetivo da Entrega", data.step1.objetivo);
        
        const subGrid = createFrame("HORIZONTAL", 0, 16);
        infoSection.appendChild(subGrid);
        setFillAndHug(subGrid);
        
        createRow(subGrid, "Status", data.step1.status);
        createRow(subGrid, "Versão", data.step1.versao);
      }

      // 1.2 EXCEÇÕES
      if (data.step1.excecoes && data.step1.excecoes.length > 0) {
        const excSection = createSection(content, "Cenários de Exceção");
        data.step1.excecoes.forEach((exc, idx) => {
          createRow(excSection, `Cenário ${idx + 1}`, exc.scenario);
        });
      }

      // 1.3 REGRAS DE NEGÓCIO
      if (data.step1.regras && data.step1.regras.length > 0) {
        const bizSection = createSection(content, "Regras de Negócio e HU");
        data.step1.regras.forEach((regra) => {
          createRow(bizSection, regra.title, regra.link ? "Link de Referência" : "-", !!regra.link, regra.link);
        });
      }

      // 1.4 EQUIPE
      if (data.step1.equipe && data.step1.equipe.length > 0) {
        const teamSection = createSection(content, "Equipe");
        data.step1.equipe.forEach(member => {
          createRow(teamSection, member.role, member.name);
        });
      }

      // 1.5 DOCS E ANEXOS
      if (data.setup && data.setup.incluirDocs && data.step1.docs && data.step1.docs.length > 0) {
        const docsSection = createSection(null, "Docs e Anexos");
        let hasDocs = false;
        data.step1.docs.forEach(doc => {
          if (doc.url) {
            createRow(docsSection, doc.name || "Documento", doc.url, true, doc.url);
            hasDocs = true;
          }
        });
        if (hasDocs) {
          content.appendChild(docsSection);
          setFillAndHug(docsSection);
        }
      }

      // 1.6 BRIEFING ESTRATÉGICO
      if (data.setup && data.setup.incluirBriefing && data.briefing && data.briefing.questions && data.briefing.questions.length > 0) {
        const briefingSection = createSection(content, "Briefing Estratégico");
        data.briefing.questions.forEach((q, idx) => {
          if (q.answer) {
            const qRow = createFrame("VERTICAL", 0, 4);
            briefingSection.appendChild(qRow);
            setFillAndHug(qRow);
            
            const qText = createText(`${idx + 1}. ${q.question}`, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
            qRow.appendChild(qText);
            setFillAndHug(qText);
            
            const aText = createText(q.answer, 13, "Regular", { r: 0.12, g: 0.16, b: 0.23 });
            qRow.appendChild(aText);
            setFillAndHug(aText);
          }
        });
        content.appendChild(briefingSection);
      }

      // 1.3 EQUIPE E RESPONSÁVEIS
      if (data.step3 && data.step3.team && data.step3.team.length > 0) {
        const teamSection = createSection(content, "Equipe e Responsáveis");
        data.step3.team.forEach(m => {
          const mRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
          teamSection.appendChild(mRow);
          setFillAndHug(mRow);
          
          mRow.counterAxisAlignItems = "CENTER";
          mRow.cornerRadius = 8;
          mRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const roleTag = createFrame("HORIZONTAL", 8, 4, { r: 0, g: 0.35, b: 0.79 });
          roleTag.cornerRadius = 4;
          roleTag.appendChild(createText(m.role, 10, "Bold", { r: 1, g: 1, b: 1 }));
          mRow.appendChild(roleTag);
          // Tags usually hug width, but if the user insists ALL items... 
          // However, tags in mRow (HORIZONTAL) with layoutGrow=1 would be weird.
          // I'll keep tags as Hug-Hug unless they look wrong.
          // Wait, roleTag is a child of mRow (HORIZONTAL). setFillAndHug(roleTag) would make it fill width.
          // I'll only setFillAndHug on the nameText to push other items.

          const nameText = createText(m.name, 12, "Medium");
          mRow.appendChild(nameText);
          setFillAndHug(nameText);

          if (m.email) {
            const contactLink = createText("Contato", 11, "Bold", { r: 0, g: 0.35, b: 0.79 });
            contactLink.textDecoration = "UNDERLINE";
            contactLink.hyperlink = { type: "URL", value: m.email.includes("@") ? "mailto:" + m.email : m.email };
            mRow.appendChild(contactLink);
            // Don't fill contactLink, just let it hug.
          }
          teamSection.appendChild(mRow);
        });
      }

      // 1.4 CENÁRIOS DE EXCEÇÃO
      if (data.excecoes && data.excecoes.length > 0) {
        const excSection = createSection(content, "Cenários de Exceção");
        data.excecoes.forEach(e => {
          const eRow = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
          excSection.appendChild(eRow);
          setFillAndHug(eRow);
          
          eRow.counterAxisAlignItems = "CENTER";
          eRow.cornerRadius = 8;
          eRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          const typeTag = createFrame("HORIZONTAL", 8, 4, { r: 0.9, g: 0.2, b: 0.2 });
          typeTag.cornerRadius = 4;
          typeTag.appendChild(createText(e.type, 10, "Bold", { r: 1, g: 1, b: 1 }));
          eRow.appendChild(typeTag);

          const titleText = createText(e.title, 12, "Medium");
          eRow.appendChild(titleText);
          setFillAndHug(titleText);
          
          if (e.link && e.link !== "#") {
            titleText.textDecoration = "UNDERLINE";
            titleText.hyperlink = { type: "URL", value: e.link };
          }
        });
      }

      // 1.5 REGRAS DE NEGÓCIO E HUS
      if (data.regras && data.regras.length > 0) {
        const rulesSection = createSection(content, "Regras de Negócio e HUs");
        data.regras.forEach(r => {
          const rRow = createFrame("VERTICAL", 12, 8, { r: 0.98, g: 0.98, b: 0.99 });
          rulesSection.appendChild(rRow);
          setFillAndHug(rRow);
          
          rRow.cornerRadius = 8;
          rRow.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];

          if (r.link && r.link !== "#") {
            const lText = createText("Acesse o link da HU", 12, "Bold", { r: 0, g: 0.35, b: 0.79 });
            lText.textDecoration = "UNDERLINE";
            lText.hyperlink = { type: "URL", value: r.link };
            rRow.appendChild(lText);
            setFillAndHug(lText);
          }
          if (r.notes) {
            const nText = createText(r.notes, 12, "Regular", { r: 0.4, g: 0.4, b: 0.4 });
            rRow.appendChild(nText);
            setFillAndHug(nText);
          }
        });
      }

      // 1.6 DOCS E ANEXOS
      if (data.docs) {
        const docsSection = createSection(null, "Docs e Anexos");
        const docItems = [
          { key: "proto", label: "Protótipo Navegável" },
          { key: "a11y", label: "Handoff Acessibilidade" },
          { key: "research", label: "Pesquisa de UX" }
        ];
        
        let hasDocs = false;
        docItems.forEach(item => {
          const docData = data.docs[item.key];
          if (docData && docData.checked && docData.link) {
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

      fichaTecnica.appendChild(content);
      mainContainer.appendChild(fichaTecnica);

      // 2. USER INTERFACE
      if (!data.setup || data.setup.componentes !== false) {
        const uiBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
        uiBoard.name = "User Interface";
        uiBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
        uiBoard.cornerRadius = 16;
        uiBoard.resize(800, 100);
        uiBoard.counterAxisSizingMode = "FIXED"; // Base width 800
        uiBoard.primaryAxisSizingMode = "AUTO";  // Hug height
        uiBoard.layoutAlign = "MIN"; // Don't stretch height in horizontal parent

        const uiTitle = createText("User Interface", 24, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
        uiBoard.appendChild(uiTitle);

        // Helper para specs list (Colunas Verticais)
        function createSpecList(title, items, type) {
          if (!items || items.length === 0) return null;
          
          const sec = createFrame("VERTICAL", 24, 16, { r: 1, g: 1, b: 1 });
          sec.name = "Column: " + title;
          sec.cornerRadius = 16;
          sec.resize(252, 100);
          sec.primaryAxisSizingMode = "AUTO";  // Hug height
          sec.counterAxisSizingMode = "FIXED"; // Base width 252 (Matches Image 3)
          // sec.layoutGrow = 1; // Can be used if we want them to share width equally

          const titleNode = createText(title, 16, "Bold", { r: 0, g: 0.35, b: 0.79 });
          sec.appendChild(titleNode);
          setFillAndHug(titleNode);

          const listContainer = createFrame("VERTICAL", 0, 8);
          sec.appendChild(listContainer);
          setFillAndHug(listContainer);

          items.forEach(item => {
            const row = createFrame("HORIZONTAL", 12, 12, { r: 0.98, g: 0.98, b: 0.99 });
            row.name = "Item: " + item.name;
            row.cornerRadius = 8;
            row.strokes = [{ type: "SOLID", color: { r: 0.92, g: 0.94, b: 0.96 } }];
            row.strokeWeight = 1;
            row.counterAxisAlignItems = "CENTER";
            
            listContainer.appendChild(row);
            setFillAndHug(row);

            if (type === "color") {
              const swatch = figma.createRectangle();
              swatch.resize(24, 24);
              swatch.cornerRadius = 6;
              swatch.fills = [{ type: "SOLID", color: hexToRgb(item.hex) }];
              row.appendChild(swatch);
            } else if (["spacing", "borders", "grids", "alignment", "effects"].includes(type)) {
               const placeholder = createFrame("VERTICAL", 0, 0, { r: 0.94, g: 0.96, b: 0.98 });
               placeholder.resize(24, 24);
               placeholder.cornerRadius = 6;
               placeholder.primaryAxisAlignItems = "CENTER";
               placeholder.counterAxisAlignItems = "CENTER";
               
               const innerText = createText((item.value || "").substring(0, 3), 8, "Bold", { r: 0, g: 0.35, b: 0.79 });
               placeholder.appendChild(innerText);
               row.appendChild(placeholder);
            } else {
              const placeholder = createFrame("VERTICAL", 4, 0, { r: 0.94, g: 0.96, b: 0.98 });
              placeholder.resize(24, 24);
              placeholder.cornerRadius = 6;
              row.appendChild(placeholder);
            }

            const info = createFrame("VERTICAL", 0, 2);
            row.appendChild(info);
            setFillAndHug(info);

            const iName = createText(item.name, 11, "Bold", { r: 0.12, g: 0.16, b: 0.23 });
            info.appendChild(iName);
            setFillAndHug(iName);

            if (item.value) {
               const iVal = createText(item.value, 10, "Regular", { r: 0.47, g: 0.52, b: 0.58 });
               info.appendChild(iVal);
               setFillAndHug(iVal);
            }

            const badge = createFrame("HORIZONTAL", 6, 2, { r: 1, g: 1, b: 1 });
            badge.cornerRadius = 4;
            badge.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.2, b: 0.2 }, opacity: 0.2 }];
            const badgeText = createText("Token", 8, "Bold", { r: 0.9, g: 0.2, b: 0.2 });
            badge.appendChild(badgeText);
            row.appendChild(badge);
          });
          
          return sec;
        }

        // Briefing Estratégico Section
        if (data.setup && data.setup.incluirBriefing && data.briefing && data.briefing.questions && data.briefing.questions.length > 0) {
           const briefingSection = createSection(fichaTecnica, "Briefing Estratégico");
           data.briefing.questions.forEach((q, idx) => {
              if (q.answer) {
                 const qRow = createFrame("VERTICAL", 0, 4);
                 qRow.name = "Question " + (idx + 1);
                 briefingSection.appendChild(qRow);
                 setFillAndHug(qRow);

                 const qText = createText(`${idx + 1}. ${q.question}`, 12, "Bold", { r: 0.39, g: 0.45, b: 0.55 });
                 qRow.appendChild(qText);
                 setFillAndHug(qText);

                 const aText = createText(q.answer, 13, "Regular", { r: 0.12, g: 0.16, b: 0.23 });
                 qRow.appendChild(aText);
                 setFillAndHug(aText);
              }
           });
        }

        const specsData = data.step2.specs || { colors: [], typography: [], components: [], icons: [], spacing: [], borders: [], effects: [], grids: [], alignment: [] };
        
        const categories = [
          { title: "Cores", items: specsData.colors, type: "color" },
          { title: "Tipografia", items: specsData.typography, type: "typography" },
          { title: "Espaçamentos", items: specsData.spacing, type: "spacing" },
          { title: "Bordas e Corner Radius", items: specsData.borders, type: "borders" },
          { title: "Efeitos (Shadow/Blur)", items: specsData.effects, type: "effects" },
          { title: "Grids de Layout", items: specsData.grids, type: "grids" },
          { title: "Alinhamentos", items: specsData.alignment, type: "alignment" },
          { title: "Componentes", items: specsData.components, type: "component" },
          { title: "Ícones", items: specsData.icons, type: "icon" }
        ];

        categories.forEach(cat => {
          const sec = createSpecList(cat.title, cat.items, cat.type);
          if (sec) {
             mainContainer.appendChild(sec);
             // We don't call setFillAndHug(sec) here because mainContainer is HORIZONTAL and AUTO width.
             // If we set layoutGrow=1, the columns collapse to 0 width.
             // They already have FIXED width 252 set inside createSpecList.
          }
        });
      }

      // 3. ANATOMIA / MEDIDAS
      const selection = figma.currentPage.selection;
      if (selection.length > 0 && data.setup && (data.setup.espacamentos || data.setup.anatomia || data.setup.instancias)) {
        for (const node of selection) {
          if (node === mainContainer) continue;

          const specsBoard = createFrame("VERTICAL", 32, 24, { r: 1, g: 1, b: 1 });
          specsBoard.name = "Design Specs - " + node.name;
          specsBoard.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.92, b: 0.95 } }];
          specsBoard.cornerRadius = 16;
          specsBoard.resize(800, 100);
          specsBoard.counterAxisSizingMode = "FIXED"; // Base width 800
          specsBoard.primaryAxisSizingMode = "AUTO";  // Hug height
          specsBoard.layoutAlign = "MIN";         // Don't stretch height in horizontal parent

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
                createRow(grid, "Fills", token ? `${token} (${hex})` : hex);
              }
            }
            if ('strokes' in node && Array.isArray(node.strokes)) {
              const ss = node.strokes.find(s => s.type === "SOLID");
              if (ss) {
                const hex = rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase();
                const token = getVariableInfo(node, 'strokes');
                createRow(grid, "Strokes", `${token ? token + ' (' + hex + ')' : hex} (${node.strokeWeight}px)`);
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
        auditBoard.name = "Design Audit";
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

        if (data.auditSummary.issues && data.auditSummary.issues.length > 0) {
           const issueList = createSection(auditBoard, "Pendências Encontradas");
           data.auditSummary.issues.slice(0, 20).forEach(issue => {
             const iRow = createText(`- [${issue.cat}] ${issue.name}`, 12);
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

      // Posiciona no centro
      mainContainer.x = figma.viewport.center.x;
      mainContainer.y = figma.viewport.center.y;

      figma.currentPage.appendChild(mainContainer);
      figma.currentPage.selection = [mainContainer];
      figma.viewport.scrollAndZoomIntoView([mainContainer]);

      figma.ui.postMessage({ type: "handoff-complete" });
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

    const { measureTypes, storeInParent } = msg;

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
          const group = figma.group(items, storeInParent && node.parent && node.parent.type !== "PAGE" ? node.parent : figma.currentPage);
          group.name = `[Medidas ${measureTypes.join(', ')}] ` + node.name;
          group.locked = true;
          appliedMeasuresList.push({ name: node.name, nodeId: group.id, details: appliedDetails });
        }
      }

      figma.ui.postMessage({ type: "measurements-applied", data: appliedMeasuresList });
      figma.notify("Medidas aplicadas com sucesso!");
    })();
  }

  if (msg.type === "scan-frame") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.ui.postMessage({
        type: "scan-result",
        error: "Nenhum item selecionado. Por favor, selecione um ou mais frames, seções ou grupos no Figma para escanear.",
      });
      return;
    }

    const specs = {
      colors: new Map(),
      components: new Map(),
      icons: new Map(),
      typography: new Map(),
      spacing: new Map(),
      borders: new Map(),
      effects: new Map(),
      grids: new Map(),
      alignment: new Map(),
    };

    function addSpec(map, key, data, nodeId) {
      if (!map.has(key)) {
        const newData = Object.assign({}, data, { layers: new Set([data.layerName]), nodeId: nodeId });
        map.set(key, newData);
      } else {
        map.get(key).layers.add(data.layerName);
      }
    }
    const frameJson = frameJsonTemplate();

    const referenceTokens = msg.referenceTokens || null;
    const isAudit = msg.isAudit || false;

    function rgbToHex(r, g, b) {
      const toHex = (c) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      };
      return "#" + toHex(r) + toHex(g) + toHex(b);
    }

    function extractSpecs(n) {
      try {
        // Colors (Fills)
        if ('fills' in n && Array.isArray(n.fills)) {
          let styleName = null;
          let styleKey = null;
          if ('fillStyleId' in n && typeof n.fillStyleId === "string" && n.fillStyleId) {
            const style = figma.getStyleById(n.fillStyleId);
            if (style) {
              styleName = style.name;
              styleKey = style.key;
            }
          }

          let tokenName = null;
          let tokenKey = null;
          if (n.boundVariables && n.boundVariables.fills) {
            const varId = Array.isArray(n.boundVariables.fills) ? (n.boundVariables.fills[0] && n.boundVariables.fills[0].id) : n.boundVariables.fills.id;
            if (varId) {
              const v = figma.variables.getVariableById(varId);
              if (v) {
                tokenName = v.name;
                tokenKey = v.key;
              }
            }
          }

          for (const fill of n.fills) {
            if (fill.type === "SOLID" && fill.color) {
              const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b).toUpperCase();
              const name = tokenName || styleName || hex;
              const ds = isDS(name, hex, "colors", tokenKey || styleKey, referenceTokens, isAudit, frameJson, n.name);
              
              registerToFrameJson(frameJson, "colors", name, hex, tokenKey, styleKey, n.name, ds);

              addSpec(specs.colors, name, {
                name: name,
                hex: hex,
                isDS: ds,
                layerName: n.name,
              }, n.id);
            }
          }
        }

        // Typography
        if (n.type === "TEXT") {
          let styleName = null;
          let styleKey = null;
          if ('textStyleId' in n && typeof n.textStyleId === "string" && n.textStyleId !== figma.mixed && n.textStyleId) {
            const style = figma.getStyleById(n.textStyleId);
            if (style) {
              styleName = style.name;
              styleKey = style.key;
            }
          }

          const family = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.family : "Mixed";
          const fontStyle = (n.fontName && n.fontName !== figma.mixed) ? n.fontName.style : "Mixed";
          const size = (n.fontSize && n.fontSize !== figma.mixed) ? n.fontSize : "Mixed";

          if (
            typeof family === "string" &&
            (family.toLowerCase().includes("icon") || family.toLowerCase().includes("material"))
          ) {
            const iconName = (typeof n.characters === "string") ? n.characters.trim() : "";
            if (iconName.length > 0 && iconName.length < 30) {
              const dsIcons = isDS(styleName || family, iconName, "icons", styleKey, referenceTokens, isAudit, frameJson, n.name);
              registerToFrameJson(frameJson, "icons", iconName, iconName, null, styleKey, n.name, dsIcons);
              addSpec(specs.icons, iconName, {
                name: iconName,
                isDS: isDS(styleName || family, iconName, "icons", styleKey, referenceTokens, isAudit, frameJson, n.name),
                layerName: n.name,
              }, n.id);
            }
          } else {
            const name = styleName || `${family} ${fontStyle} (${size}px)`;
            const ds = isDS(name, name, "typography", styleKey, referenceTokens, isAudit, frameJson, n.name);
            registerToFrameJson(frameJson, "typography", name, name, null, styleKey, n.name, ds);
            addSpec(specs.typography, name, {
              name: name,
              isDS: ds,
              layerName: n.name,
            }, n.id);
          }
        }

        // Components & Instances
        if (n.type === "INSTANCE" || n.type === "COMPONENT") {
          const name = n.name;

          const isIcon =
            name.toLowerCase().includes("icon") ||
            name.toLowerCase().includes("ic-") ||
            (n.width <= 32 && n.height <= 32 && !name.toLowerCase().includes("button"));

          if (isIcon) {
            const dsCompIcons = isDS(name, name, "icons", null, referenceTokens, isAudit, frameJson, n.name);
            registerToFrameJson(frameJson, "icons", name, name, null, null, n.name, dsCompIcons);
            addSpec(specs.icons, name, {
              name: name,
              isDS: isDS(name, name, "icons", null, referenceTokens, isAudit, frameJson, n.name),
              layerName: n.name,
            }, n.id);
          } else {
            const dsComp = isDS(name, name, "components", null, referenceTokens, isAudit, frameJson, n.name);
            registerToFrameJson(frameJson, "components", name, name, null, null, n.name, dsComp);
            addSpec(specs.components, name, {
              name: name,
              isDS: isDS(name, name, "components", null, referenceTokens, isAudit, frameJson, n.name),
              layerName: n.name,
            }, n.id);
          }
        }

        // Spacing, Alignment and Grids
        if ('layoutMode' in n) {
          const getVar = (p) => {
            if (!n.boundVariables) return null;
            const v = n.boundVariables[p];
            if (!v) return null;
            const id = Array.isArray(v) ? (v[0] && v[0].id) : v.id;
            if (!id) return null;
            const variable = figma.variables.getVariableById(id);
            return variable ? { name: variable.name, key: variable.key } : null;
          };

          if (n.layoutMode !== "NONE") {
            // Gap
            if (n.itemSpacing !== figma.mixed && n.itemSpacing > 0) {
              const vInfo = getVar("itemSpacing");
              const tokenName = vInfo ? vInfo.name : null;
              const tokenKey = vInfo ? vInfo.key : null;
              const val = `${n.itemSpacing}px`;
              const name = tokenName || `Gap: ${val}`;
              const ds = isDS(name, val, "spacing", tokenKey, referenceTokens, isAudit, frameJson, n.name);
              registerToFrameJson(frameJson, "spacing", name, val, tokenKey, null, n.name, isDS(name, val, "spacing", tokenKey, referenceTokens, isAudit, frameJson, n.name));
              addSpec(specs.spacing, name, { name: name, value: val, isDS: isDS(name, val, "spacing", tokenKey, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
            }
            // Padding
            const pt = n.paddingTop || 0, pr = n.paddingRight || 0, pb = n.paddingBottom || 0, pl = n.paddingLeft || 0;
            if (pt > 0) {
              const vInfo = getVar("paddingTop"); const name = (vInfo && vInfo.name) || `Padding Top: ${pt}px`;
              const ds = isDS(name, `${pt}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name);
              registerToFrameJson(frameJson, "spacing", name, `${pt}px`, vInfo ? vInfo.key : null, null, n.name, isDS(name, `${pt}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name));
              addSpec(specs.spacing, name, { name: name, value: `${pt}px`, isDS: isDS(name, `${pt}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
            }
            if (pr > 0) {
              const vInfo = getVar("paddingRight"); const name = (vInfo && vInfo.name) || `Padding Right: ${pr}px`;
              const ds = isDS(name, `${pr}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name);
              registerToFrameJson(frameJson, "spacing", name, `${pr}px`, vInfo ? vInfo.key : null, null, n.name, isDS(name, `${pr}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name));
              addSpec(specs.spacing, name, { name: name, value: `${pr}px`, isDS: isDS(name, `${pr}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
            }
            if (pb > 0) {
              const vInfo = getVar("paddingBottom"); const name = (vInfo && vInfo.name) || `Padding Bottom: ${pb}px`;
              const ds = isDS(name, `${pb}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name);
              registerToFrameJson(frameJson, "spacing", name, `${pb}px`, vInfo ? vInfo.key : null, null, n.name, isDS(name, `${pb}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name));
              addSpec(specs.spacing, name, { name: name, value: `${pb}px`, isDS: isDS(name, `${pb}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
            }
            if (pl > 0) {
              const vInfo = getVar("paddingLeft"); const name = (vInfo && vInfo.name) || `Padding Left: ${pl}px`;
              const ds = isDS(name, `${pl}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name);
              registerToFrameJson(frameJson, "spacing", name, `${pl}px`, vInfo ? vInfo.key : null, null, n.name, isDS(name, `${pl}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name));
              addSpec(specs.spacing, name, { name: name, value: `${pl}px`, isDS: isDS(name, `${pl}px`, "spacing", vInfo ? vInfo.key : null, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
            }

            // Alignment
            const align = `${n.primaryAxisAlignItems} / ${n.counterAxisAlignItems}`;
            const ds = isDS(align, align, "alignment", null, referenceTokens, isAudit, frameJson, n.name);
            registerToFrameJson(frameJson, "alignment", `Alinhamento: ${align}`, align, null, null, n.name, isDS(align, align, "alignment", null, referenceTokens, isAudit, frameJson, n.name));
            addSpec(specs.alignment, align, { name: `Alinhamento: ${align}`, value: align, isDS: isDS(align, align, "alignment", null, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
          }
        }

        // Borders & Corner Radii
        if ('cornerRadius' in n && n.cornerRadius !== figma.mixed && n.cornerRadius > 0) {
          const id = (n.boundVariables && n.boundVariables.cornerRadius) ? (Array.isArray(n.boundVariables.cornerRadius) ? n.boundVariables.cornerRadius[0].id : n.boundVariables.cornerRadius.id) : null;
          let tokenName = null;
          let tokenKey = null;
          if (id) {
            const v = figma.variables.getVariableById(id);
            if (v) { tokenName = v.name; tokenKey = v.key; }
          }
          const name = tokenName || `Raio: ${n.cornerRadius}px`;
          registerToFrameJson(frameJson, "borders", name, `${n.cornerRadius}px`, tokenKey, null, n.name);
          addSpec(specs.borders, name, { name: name, value: `${n.cornerRadius}px`, isDS: isDS(name, `${n.cornerRadius}px`, "borders", tokenKey, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
        }

        if ('strokeWeight' in n && n.strokeWeight !== figma.mixed && n.strokeWeight > 0) {
          const id = (n.boundVariables && n.boundVariables.strokeWeight) ? (Array.isArray(n.boundVariables.strokeWeight) ? n.boundVariables.strokeWeight[0].id : n.boundVariables.strokeWeight.id) : null;
          let tokenName = null;
          let tokenKey = null;
          if (id) {
            const v = figma.variables.getVariableById(id);
            if (v) { tokenName = v.name; tokenKey = v.key; }
          }
          const name = tokenName || `Borda: ${n.strokeWeight}px`;
          registerToFrameJson(frameJson, "borders", name, `${n.strokeWeight}px`, tokenKey, null, n.name);
          addSpec(specs.borders, name, { name: name, value: `${n.strokeWeight}px`, isDS: isDS(name, `${n.strokeWeight}px`, "borders", tokenKey, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
          
          if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0) {
             const stroke = n.strokes[0];
             if (stroke.type === "SOLID") {
                const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b).toUpperCase();
                
                let strokeVarName = null;
                let strokeVarKey = null;
                if (n.boundVariables && n.boundVariables.strokes) {
                   const sid = Array.isArray(n.boundVariables.strokes) ? (n.boundVariables.strokes[0] && n.boundVariables.strokes[0].id) : n.boundVariables.strokes.id;
                   if (sid) {
                     const sv = figma.variables.getVariableById(sid);
                     if (sv) { strokeVarName = sv.name; strokeVarKey = sv.key; }
                   }
                }
                
                let styleStrokeName = null;
                let styleStrokeKey = null;
                if ('strokeStyleId' in n && n.strokeStyleId) {
                   const st = figma.getStyleById(n.strokeStyleId);
                   if (st) { styleStrokeName = st.name; styleStrokeKey = st.key; }
                }

                const strokeNameFinal = strokeVarName || styleStrokeName || `Cor Borda: ${hex}`;
                registerToFrameJson(frameJson, "borders", strokeNameFinal, hex, strokeVarKey, styleStrokeKey, n.name, isDS(strokeNameFinal, hex, "colors", strokeVarKey || styleStrokeKey, referenceTokens, isAudit, frameJson, n.name));
                addSpec(specs.borders, strokeNameFinal, { name: strokeNameFinal, value: hex, isDS: isDS(strokeNameFinal, hex, "colors", strokeVarKey || styleStrokeKey, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
             }
          }
        }
        
        // Effects (Shadows, Blurs)
        if ('effects' in n && Array.isArray(n.effects)) {
          let styleName = null;
          let styleKey = null;
          if ('effectStyleId' in n && n.effectStyleId) {
            const style = figma.getStyleById(n.effectStyleId);
            if (style) { styleName = style.name; styleKey = style.key; }
          }
          for (const effect of n.effects) {
            if (effect.visible) {
               const name = styleName || `${effect.type} (${effect.type.includes('SHADOW') ? 'Sombra' : 'Blur'})`;
               const ds = isDS(name, effect.type, "effects", styleKey, referenceTokens, isAudit, frameJson, n.name);
               registerToFrameJson(frameJson, "effects", name, effect.type, null, styleKey, n.name, isDS(name, effect.type, "effects", styleKey, referenceTokens, isAudit, frameJson, n.name));
               addSpec(specs.effects, name, { name: name, value: effect.type, isDS: isDS(name, effect.type, "effects", styleKey, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
            }
          }
        }

        // Grids
        if ('layoutGrids' in n && Array.isArray(n.layoutGrids)) {
          let styleName = null;
          let styleKey = null;
          if ('gridStyleId' in n && n.gridStyleId) {
            const style = figma.getStyleById(n.gridStyleId);
            if (style) { styleName = style.name; styleKey = style.key; }
          }
          for (const grid of n.layoutGrids) {
            if (grid.visible) {
               let typeStr = grid.pattern === "COLUMNS" ? `Colunas: ${grid.count}` : (grid.pattern === "ROWS" ? `Linhas: ${grid.count}` : "Grid");
               const name = styleName || typeStr;
               const ds = isDS(name, typeStr, "grids", styleKey, referenceTokens, isAudit, frameJson, n.name);
               registerToFrameJson(frameJson, "grids", name, typeStr, null, styleKey, n.name, isDS(name, typeStr, "grids", styleKey, referenceTokens, isAudit, frameJson, n.name));
               addSpec(specs.grids, name, { name: name, value: typeStr, isDS: isDS(name, typeStr, "grids", styleKey, referenceTokens, isAudit, frameJson, n.name), layerName: n.name }, n.id);
            }
          }
        }

        if ('children' in n && n.children) {
          for (const child of n.children) {
            extractSpecs(child);
          }
        }
      } catch (err) {
        console.error("Erro ao extrair specs do node:", n.name, err);
      }
    }

    for (const node of selection) {
      extractSpecs(node);
    }

    // Capture previews for icons and components
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

    await prepareListWithPreviews(specs.icons);
    await prepareListWithPreviews(specs.components);
    await Promise.all(previewPromises);

    const formatMap = (map) => {
      return Array.from(map.values())
        .map((item) => {
          const newItem = Object.assign({}, item);
          newItem.layers = Array.from(item.layers);
          // Previews are already in item, but we ensure they are passed
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
      data: {
        colors: formatMap(specs.colors),
        components: formatMap(specs.components),
        icons: formatMap(specs.icons),
        typography: formatMap(specs.typography),
        spacing: formatMap(specs.spacing),
        borders: formatMap(specs.borders),
        effects: formatMap(specs.effects),
        grids: formatMap(specs.grids),
        alignment: formatMap(specs.alignment),
        frameJson: frameJson
      },
    });
  }

  if (msg.type === "get-selection-link") {
    const selection = figma.currentPage.selection;
    if (selection.length > 0) {
      const node = selection[0];
      figma.ui.postMessage({
        type: "selection-link",
        targetId: msg.targetId,
        linkName: node.name
      });
    } else {
      // Fallback to project name if nothing is selected
      figma.ui.postMessage({
        type: "selection-link",
        targetId: msg.targetId,
        linkName: figma.root.name
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
        let val = `${pt}px ${pr}px ${pb}px ${pl}px`;
        if (tT || tR || tB || tL) {
          const tokens = [tT, tR, tB, tL].filter(t => t).join(", ");
          if (tokens) val += ` (${tokens})`;
        }
        properties.push({ key: "padding", label: "Padding", value: val });
      }
    }

    // 4. Colors & Strokes
    if ("fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
      const sf = node.fills.find(f => f.type === "SOLID");
      if (sf) {
        const token = getVar("fills");
        properties.push({ key: "fill", label: "Preenchimento", value: rgbToHex(sf.color.r, sf.color.g, sf.color.b).toUpperCase(), token });
      }
    }
    if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
      const ss = node.strokes.find(s => s.type === "SOLID");
      if (ss) {
        const token = getVar("strokes");
        properties.push({ key: "stroke", label: "Contorno", value: rgbToHex(ss.color.r, ss.color.g, ss.color.b).toUpperCase(), token });
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
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.notify("Selecione um elemento.");
        return;
      }
      const node = selection[0];
      const opts = msg.opts;

      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch (e) { }
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch (e) { }

      // Convert hex color to rgb
      const hex = opts.color.replace("#", "");
      const cr = parseInt(hex.substring(0, 2), 16) / 255;
      const cg = parseInt(hex.substring(2, 4), 16) / 255;
      const cb = parseInt(hex.substring(4, 6), 16) / 255;
      const themeColor = { r: cr, g: cg, b: cb };

      // Create Spec Card
      const specCard = figma.createFrame();
      specCard.name = `Spec Card - ${opts.letter}`;
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
      tagCircle.name = `Tag Spec ${opts.letter}`;
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
        pill.name = "Category Spec";
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
        propsFrame.layoutAlign = "MIN";

        opts.properties.forEach(p => {
          const row = figma.createFrame();
          row.layoutMode = "HORIZONTAL";
          row.itemSpacing = 12;
          row.fills = [];
          row.primaryAxisSizingMode = "AUTO";
          row.counterAxisSizingMode = "AUTO";
          row.layoutAlign = "MIN";
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
          pVal.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
          pVal.characters = String(p.value);
          pVal.textAutoResize = "WIDTH_AND_HEIGHT";

          row.appendChild(pLabel);
          row.appendChild(pVal);

          if (p.token) {
            const pToken = figma.createText();
            pToken.fontName = { family: "Inter", style: "Medium" };
            pToken.fontSize = 9;
            pToken.fills = [{ type: "SOLID", color: themeColor }];
            pToken.characters = `(${p.token})`;
            row.appendChild(pToken);
          }

          propsFrame.appendChild(row);
        });
        specCard.appendChild(propsFrame);
      }

      // Add link after title/properties
      if (opts.link) {
        const linkTxt = figma.createText();
        linkTxt.fontName = { family: "Inter", style: "Regular" };
        linkTxt.fontSize = 11;
        linkTxt.fills = [{ type: "SOLID", color: { r: 0, g: 0.4, b: 0.8 } }];
        linkTxt.characters = "Link: " + opts.link;
        linkTxt.textAutoResize = "WIDTH_AND_HEIGHT";
        specCard.appendChild(linkTxt);
      }

      // Group variables
      let groupNodes = [];

      // Positioning
      const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
      let targetForConnector = node;

      if (bounds) {
        // Draw a dotted highlight frame around the node
        const contour = figma.createFrame();
        contour.name = `Highlight - ${opts.letter}`;
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

        targetForConnector = contour; // Connect to the highlight box
        groupNodes.push(contour);

        // Append card to page first to calculate its real height
        figma.currentPage.appendChild(specCard);

        const side = opts.guideSide || "right";
        const spacing = 100;
        let targetX = bounds.x + bounds.width + spacing;
        let targetY = bounds.y;

        if (side === "left") {
          targetX = bounds.x - specCard.width - spacing;
        } else if (side === "top") {
          targetX = bounds.x + (bounds.width / 2) - (specCard.width / 2);
          targetY = bounds.y - specCard.height - spacing;
        } else if (side === "bottom") {
          targetX = bounds.x + (bounds.width / 2) - (specCard.width / 2);
          targetY = bounds.y + bounds.height + spacing;
        }

        // In-memory stacking: use specColumnTracker to find the lowest Y in this column
        // Key = X position rounded to nearest 50px (same side = same bucket)
        const colKey = `${side}_${Math.round(targetX / 50) * 50}`;
        if (specColumnTracker[colKey] !== undefined) {
          targetY = specColumnTracker[colKey] + 16;
        }

        specCard.x = Math.round(targetX);
        specCard.y = Math.round(targetY);

        // Update tracker after placing
        specColumnTracker[colKey] = Math.round(targetY) + specCard.height;
        groupNodes.push(specCard);

        // --- Improved Vector Connector (Guia) ---
        const connector = figma.createVector();
        connector.name = "Guia de Conexão";

        // Define points based on side
        let startPt = { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }; // Right center
        let endPt = { x: specCard.x, y: specCard.y + 40 }; // Card left side (approx header)

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

        // Draw direct vector path
        connector.vectorPaths = [{
          windingRule: "NONZERO",
          data: `M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}`
        }];

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
      specGroup.name = `Spec Group - ${opts.letter}`;
      specGroup.locked = true; 


      figma.ui.postMessage({
        type: "spec-created",
        spec: {
          id: specGroup.id, // Group ID instead of Card ID so hiding hides everything
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
    if (node && node.visible) {
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
        node.visible = !node.visible;
      }
      // Evita disparar múltiplos notificações se for um comando em massa
      if (msg.forceState === undefined) {
        figma.notify(node.visible ? "Visível" : "Oculto");
      }
    }
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
    figma.clientStorage.setAsync('handoffData', msg.data);
  }

  if (msg.type === 'focus-node') {
    const node = figma.getNodeById(msg.id);
    if (node) {
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

    const nodeA = selection[0];
    const nodeB = selection[1] || null;

    const boundsA = nodeA.absoluteBoundingBox || nodeA.absoluteRenderBounds;
    const boundsB = nodeB ? (nodeB.absoluteBoundingBox || nodeB.absoluteRenderBounds) : null;

    const getEdgePoints = (b) => ({
      top: { x: b.x + b.width / 2, y: b.y, side: 'top' },
      bottom: { x: b.x + b.width / 2, y: b.y + b.height, side: 'bottom' },
      left: { x: b.x, y: b.y + b.height / 2, side: 'left' },
      right: { x: b.x + b.width, y: b.y + b.height / 2, side: 'right' }
    });

    const pointsA = getEdgePoints(boundsA);
    let bestA, bestB;

    // Forçar lado para eventos de Início (Esquerda) e Fim (Direita)
    if (msg.flowType === "event_start") {
      bestA = pointsA.left;
    } else if (msg.flowType === "event_end") {
      bestA = pointsA.right;
    } else if (msg.flowSide && msg.flowSide !== 'auto' && pointsA[msg.flowSide]) {
      bestA = pointsA[msg.flowSide];
    }

    if (nodeB && boundsB) {
      const pointsB = getEdgePoints(boundsB);
      if (!bestA) {
        let minDict = Infinity;
        for (const pA of Object.values(pointsA)) {
          for (const pB of Object.values(pointsB)) {
            const dist = Math.sqrt(Math.pow(pA.x - pB.x, 2) + Math.pow(pA.y - pB.y, 2));
            if (dist < minDict) {
              minDict = dist;
              bestA = pA;
              bestB = pB;
            }
          }
        }
      } else {
        let minDict = Infinity;
        for (const pB of Object.values(pointsB)) {
          const dist = Math.sqrt(Math.pow(bestA.x - pB.x, 2) + Math.pow(bestA.y - pB.y, 2));
          if (dist < minDict) {
            minDict = dist;
            bestB = pB;
          }
        }
      }
    } else {
      // Se for apenas um nó (comum para eventos de início/fim)
      if (msg.flowType === "event_start") {
        bestA = pointsA.left;
        bestB = { x: bestA.x - 60, y: bestA.y, side: 'left' };
      } else if (msg.flowType === "event_end") {
        bestA = pointsA.right;
        bestB = { x: bestA.x + 60, y: bestA.y, side: 'right' };
      } else {
        bestA = bestA || pointsA.right;
        const offset = 40;
        bestB = { x: bestA.x, y: bestA.y, side: bestA.side };
        if (bestA.side === 'top') bestB.y -= offset;
        else if (bestA.side === 'bottom') bestB.y += offset;
        else if (bestA.side === 'left') bestB.x -= offset;
        else bestB.x += offset;
      }
    }

    const connector = figma.createVector();
    connector.name = `Flow Line`;
    figma.currentPage.appendChild(connector);
    connector.x = 0;
    connector.y = 0;

    const strokeColor = { r: 0.12, g: 0.16, b: 0.23 }; // #1E293B
    connector.strokes = [{ type: "SOLID", color: strokeColor }];
    connector.strokeWeight = 2;

    if (msg.flowType === "line_dashed") {
      connector.dashPattern = [6, 4];
    }

    // Caminho da linha
    connector.vectorPaths = [{
      windingRule: "NONZERO",
      data: `M ${bestA.x} ${bestA.y} L ${bestB.x} ${bestB.y}`
    }];

    let nodesToGroup = [connector];

    // Desenhar seta manualmente se não for início de jornada
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

      arrow.vectorPaths = [{
        windingRule: "NONZERO",
        data: `M ${x1} ${y1} L ${bestB.x} ${bestB.y} L ${x2} ${y2}`
      }];
      nodesToGroup.push(arrow);
    }

    if (msg.flowType === "diamond" || msg.flowType === "diamond_dashed") {
      const midX = (bestA.x + bestB.x) / 2;
      const midY = (bestA.y + bestB.y) / 2;
      const size = 64;
      const halfSize = size / 2;

      const shape = figma.createVector();
      figma.currentPage.appendChild(shape);
      shape.x = 0;
      shape.y = 0;
      shape.vectorPaths = [{
        windingRule: "NONZERO",
        data: `M ${midX} ${midY - halfSize} L ${midX + halfSize} ${midY} L ${midX} ${midY + halfSize} L ${midX - halfSize} ${midY} Z`
      }];
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
          symbol.characters = (msg.decisionText || "IF");
          symbol.fontSize = 11;
          symbol.textAlignHorizontal = "CENTER";
          symbol.textAlignVertical = "CENTER";
          symbol.fills = [{ type: "SOLID", color: strokeColor }];
          symbol.resize(size * 0.8, symbol.height);
          symbol.x = midX - (symbol.width / 2);
          symbol.y = midY - (symbol.height / 2);

          const flowNum = msg.nextFlowNumber || 1;
          
          nodesToGroup.push(shape, symbol);
          const finalGroup = figma.group(nodesToGroup, figma.currentPage);
          finalGroup.name = `[Flow-${flowNum}] ${msg.flowName || "Decisão"}`;
          figma.ui.postMessage({ type: 'flow-created', flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
        } catch (e) { console.error(e); }
      })();
    } else if (isEvent) {
      const isStart = msg.flowType === "event_start";
      const targetPoint = bestB;
      const circle = figma.createEllipse();
      figma.currentPage.appendChild(circle);
      circle.resize(48, 48);
      circle.x = targetPoint.x - 24;
      circle.y = targetPoint.y - 24;
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
          label.textAlignHorizontal = "CENTER";
          label.textAlignVertical = "CENTER";
          label.fills = circle.strokes;
          label.x = circle.x + (circle.width / 2) - (label.width / 2);
          label.y = circle.y + (circle.height / 2) - (label.height / 2);

          const flowNum = msg.nextFlowNumber || 1;

          nodesToGroup.push(circle, label);
          const finalGroup = figma.group(nodesToGroup, figma.currentPage);
          finalGroup.name = `[Flow-${flowNum}] ${msg.flowName || (isStart ? "Início" : "Fim")}`;
          figma.ui.postMessage({ type: 'flow-created', flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
        } catch (e) { console.error(e); }
      })();
    } else if (msg.decisionText && (msg.flowType === "line_solid" || msg.flowType === "line_dashed")) {
      const midX = (bestA.x + bestB.x) / 2;
      const midY = (bestA.y + bestB.y) / 2;
      
      (async () => {
        try {
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });

          // Criar textNode para medir as dimensões
          const textNode = figma.createText();
          textNode.name = "Texto";
          textNode.fontName = { family: "Inter", style: "Bold" };
          textNode.characters = msg.decisionText;
          textNode.fontSize = 10;
          textNode.textAlignHorizontal = "CENTER";
          textNode.textAlignVertical = "CENTER";
          textNode.fills = [{ type: "SOLID", color: strokeColor }];

          const paddingH = 8;
          const paddingV = 4;

          // Appendar chipBg PRIMEIRO na página → z-order mais baixo (atrás)
          const chipBg = figma.createRectangle();
          figma.currentPage.appendChild(chipBg);
          chipBg.name = "Fundo";
          chipBg.resize(textNode.width + paddingH * 2, textNode.height + paddingV * 2);
          chipBg.cornerRadius = 6;
          chipBg.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
          chipBg.strokes = [{ type: "SOLID", color: strokeColor }];
          chipBg.strokeWeight = 1;
          chipBg.x = midX - (chipBg.width / 2);
          chipBg.y = midY - (chipBg.height / 2);

          // Appendar textNode DEPOIS na página → z-order mais alto (frente)
          figma.currentPage.appendChild(textNode);
          textNode.x = chipBg.x + paddingH;
          textNode.y = chipBg.y + paddingV;
          
          const flowNum = msg.nextFlowNumber || 1;

          // Garantir que Texto (textNode) venha DEPOIS do Fundo (chipBg) para ficar à frente
          nodesToGroup.push(chipBg, textNode);
          const finalGroup = figma.group(nodesToGroup, figma.currentPage);
          finalGroup.name = `[Flow-${flowNum}] ${msg.flowName || "Conexão"}`;
          figma.ui.postMessage({ type: 'flow-created', flow: { id: finalGroup.id, name: finalGroup.name, type: msg.flowType } });
        } catch (e) { console.error(e); }
      })();
    } else {
      const flowNum = msg.nextFlowNumber || 1;

      const finalGroup = figma.group(nodesToGroup, figma.currentPage);
      finalGroup.name = `[Flow-${flowNum}] ${msg.flowName || "Conexão"}`;
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
      legendFrame.name = "Legendas e Indicadores";
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
      figma.currentPage.appendChild(legendFrame);
      figma.currentPage.selection = [legendFrame];
      figma.viewport.scrollAndZoomIntoView([legendFrame]);
      figma.notify("Legenda criada!");
    })();
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};

// --- SELECTION AUTO-NAMING ---
figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  if (selection.length === 1) {
    const node = selection[0];
    if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE" || node.type === "SECTION") {
      figma.ui.postMessage({
        type: 'selection-name',
        name: node.name
      });
    }
  }
});

