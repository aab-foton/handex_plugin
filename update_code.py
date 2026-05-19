with open('src/plugin/code.js', 'r', encoding='utf-8') as f:
    content = f.read()

unified_logic = """  if (msg.type === "create-unified-spec") {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.notify("Selecione pelo menos um elemento no canvas.");
      return;
    }

    (async () => {
      try { await figma.loadFontAsync({ family: "Inter", style: "Regular" }); } catch(e) {}
      try { await figma.loadFontAsync({ family: "Inter", style: "Medium" }); } catch(e) {}
      try { await figma.loadFontAsync({ family: "Inter", style: "Bold" }); } catch(e) {}

      const typeColors = {
        cenario: { r: 0.97, g: 0.45, b: 0.08 },
        info: { r: 0.05, g: 0.64, b: 0.91 },
        comportamento: { r: 0.92, g: 0.28, b: 0.60 },
        regra: { r: 0.02, g: 0.71, b: 0.82 },
        api: { r: 0.51, g: 0.80, b: 0.08 }
      };
      const typeLabels = {
        cenario: "Cenário de exceção",
        info: "Informação extra",
        comportamento: "Comportamento",
        regra: "Regra de Negócio",
        api: "Dados da API"
      };

      const opts = msg.opts || {};
      const inc = opts.include || {};
      const category = opts.category || "";
      const customNote = opts.note || "";
      const baseLetter = (opts.letter || "A").toUpperCase();
      const linkUrl = opts.link || "";

      const color = typeColors[category] || { r: 0.4, g: 0.4, b: 0.4 };
      const labelText = typeLabels[category] || category || "Anotação";

      function getNextLetter(letter, index) {
        if (index === 0) return letter;
        if (/^[A-Z]$/.test(letter)) {
          return String.fromCharCode(letter.charCodeAt(0) + index);
        }
        if (/^\\d+$/.test(letter)) {
          return String(parseInt(letter) + index);
        }
        return letter + (index + 1);
      }

      const createdNodes = [];

      for (let i = 0; i < selection.length; i++) {
        const node = selection[i];
        const currentLetter = getNextLetter(baseLetter, i);
        const bounds = node.absoluteBoundingBox || node.absoluteRenderBounds;
        if (!bounds) continue;

        // --- Native Annotations ---
        const properties = [];
        if (inc.height !== false) properties.push({ type: "height" });
        if (inc.width !== false) properties.push({ type: "width" });
        if (inc.minHeight && "minHeight" in node && node.minHeight > 0) properties.push({ type: "minHeight" });
        if (inc.maxHeight && "maxHeight" in node && node.maxHeight > 0) properties.push({ type: "maxHeight" });
        if (inc.minWidth && "minWidth" in node && node.minWidth > 0) properties.push({ type: "minWidth" });
        if (inc.maxWidth && "maxWidth" in node && node.maxWidth > 0) properties.push({ type: "maxWidth" });

        if ("layoutMode" in node && node.layoutMode !== "NONE") {
          if (inc.direction !== false) properties.push({ type: "layoutMode" });
          if (inc.alignment !== false) properties.push({ type: "alignItems" });
          if (inc.gap !== false && node.itemSpacing > 0) properties.push({ type: "itemSpacing" });
          if (inc.padding !== false) {
            properties.push({ type: "paddingTop" });
            properties.push({ type: "paddingRight" });
            properties.push({ type: "paddingBottom" });
            properties.push({ type: "paddingLeft" });
          }
        }
        if (inc.radius !== false && "cornerRadius" in node && node.cornerRadius != null && node.cornerRadius !== figma.mixed) properties.push({ type: "cornerRadius" });
        if (inc.opacity && "opacity" in node && node.opacity < 1) properties.push({ type: "opacity" });
        if (inc.fill !== false && "fills" in node && Array.isArray(node.fills) && node.fills.length > 0) properties.push({ type: "fills" });
        if ("strokes" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
          if (inc.stroke !== false) properties.push({ type: "strokes" });
          if (inc.strokeWidth !== false) properties.push({ type: "strokeWeight" });
        }
        if (inc.effects !== false && "effects" in node && Array.isArray(node.effects) && node.effects.length > 0) properties.push({ type: "effects" });
        if (node.type === "TEXT") {
          if (inc.fontFamily !== false) properties.push({ type: "fontFamily" });
          if (inc.fontSize !== false) properties.push({ type: "fontSize" });
          if (inc.fontWeight !== false) properties.push({ type: "fontWeight" });
          if (inc.fontStyle) properties.push({ type: "fontStyle" });
          if (inc.lineHeight !== false) properties.push({ type: "lineHeight" });
          if (inc.letterSpacing) properties.push({ type: "letterSpacing" });
        }
        if (inc.mainComponent !== false && node.type === "INSTANCE" && node.mainComponent) properties.push({ type: "mainComponent" });

        const annObj = { properties };
        if (customNote) annObj.label = customNote;
        if (category) annObj.categoryName = labelText;

        try {
          const existing = Array.isArray(node.annotations) ? [...node.annotations] : [];
          node.annotations = [...existing, annObj];
        } catch(e1) {
          try {
            if (typeof node.setAnnotations === "function") {
              const existing = Array.isArray(node.annotations) ? [...node.annotations] : [];
              node.setAnnotations([...existing, annObj]);
            }
          } catch(e2) {}
        }

        // --- Visual Spec Card & Highlight ---
        const padding = 16;
        const highlight = figma.createFrame();
        highlight.name = `Indicator Contour - ${currentLetter}`;
        highlight.resize(bounds.width + (padding * 2), bounds.height + (padding * 2));
        highlight.x = bounds.x - padding;
        highlight.y = bounds.y - padding;
        highlight.fills = [];
        highlight.strokes = [{ type: "SOLID", color: color }];
        highlight.strokeWeight = 2;
        highlight.dashPattern = [6, 4];
        
        let baseRadius = 0;
        if ("cornerRadius" in node && typeof node.cornerRadius === "number") baseRadius = node.cornerRadius;
        highlight.cornerRadius = baseRadius + padding;
        figma.currentPage.appendChild(highlight);

        const badge = figma.createFrame();
        badge.name = "Badge";
        badge.resize(28, 28);
        badge.cornerRadius = 14;
        badge.fills = [{ type: "SOLID", color: color }];
        badge.layoutMode = "HORIZONTAL";
        badge.primaryAxisAlignItems = "CENTER";
        badge.counterAxisAlignItems = "CENTER";
        
        const badgeText = figma.createText();
        badgeText.fontName = { family: "Inter", style: "Bold" };
        badgeText.characters = currentLetter;
        badgeText.fontSize = 12;
        badgeText.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        badge.appendChild(badgeText);
        highlight.appendChild(badge);
        badge.x = -14;
        badge.y = -14;

        const specCard = figma.createFrame();
        specCard.name = `Spec Card - ${currentLetter}`;
        specCard.layoutMode = "VERTICAL";
        specCard.paddingLeft = 20; specCard.paddingRight = 20;
        specCard.paddingTop = 20; specCard.paddingBottom = 20;
        specCard.itemSpacing = 16; specCard.cornerRadius = 12;
        specCard.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        specCard.strokes = [{ type: "SOLID", color: color }];
        specCard.strokeWeight = 1;
        specCard.resize(280, 10);
        specCard.counterAxisSizingMode = "FIXED";
        specCard.primaryAxisSizingMode = "AUTO";

        const cardIndicator = figma.createFrame();
        cardIndicator.name = "Letra da Especificação";
        cardIndicator.resize(42, 32); 
        cardIndicator.cornerRadius = 16;
        cardIndicator.fills = [{ type: "SOLID", color: color }];
        cardIndicator.layoutMode = "HORIZONTAL";
        cardIndicator.primaryAxisAlignItems = "CENTER";
        cardIndicator.counterAxisAlignItems = "CENTER";
        cardIndicator.paddingLeft = 8; cardIndicator.paddingRight = 8;
        cardIndicator.paddingTop = 4; cardIndicator.paddingBottom = 4;
        cardIndicator.minWidth = 42;
        cardIndicator.minHeight = 32;
        
        const cit = figma.createText();
        cit.fontName = { family: "Inter", style: "Bold" };
        cit.characters = currentLetter;
        cit.fontSize = 14; cit.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
        cardIndicator.appendChild(cit);
        specCard.appendChild(cardIndicator);

        const title = figma.createText();
        title.fontName = { family: "Inter", style: "Bold" };
        title.characters = node.name;
        title.fontSize = 13; title.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
        specCard.appendChild(title);

        const pill = figma.createFrame();
        pill.name = "Tipo de Especificação";
        pill.layoutMode = "HORIZONTAL";
        pill.paddingLeft = 10; pill.paddingRight = 10;
        pill.paddingTop = 5; pill.paddingBottom = 5;
        pill.cornerRadius = 20; pill.fills = [];
        pill.strokes = [{ type: "SOLID", color: color }];
        pill.strokeWeight = 1.5;
        pill.primaryAxisSizingMode = "AUTO";
        pill.counterAxisSizingMode = "AUTO";

        const pillText = figma.createText();
        pillText.fontName = { family: "Inter", style: "Medium" };
        pillText.characters = labelText;
        pillText.fontSize = 11; pillText.fills = [{ type: "SOLID", color: color }];
        pill.appendChild(pillText);
        specCard.appendChild(pill);

        if (customNote) {
            const desc = figma.createText();
            desc.name = "Descrição da Especificação";
            desc.fontName = { family: "Inter", style: "Regular" };
            desc.characters = customNote;
            desc.fontSize = 12; desc.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];
            desc.layoutAlign = "STRETCH";
            specCard.appendChild(desc);
        }

        // Add Properties text
        const propsTextContent = [];
        if (inc.height !== false) propsTextContent.push("Height: " + Math.round(node.height) + "px");
        if (inc.width  !== false) propsTextContent.push("Width: "  + Math.round(node.width)  + "px");
        if ("cornerRadius" in node && node.cornerRadius > 0 && inc.radius !== false) propsTextContent.push("Corner radius: " + node.cornerRadius + "px");
        if ("layoutMode" in node && node.layoutMode !== "NONE") {
          if (inc.direction !== false) propsTextContent.push("Direction: " + node.layoutMode);
          if (inc.gap !== false && node.itemSpacing > 0) propsTextContent.push("Gap: " + node.itemSpacing + "px");
          if (inc.padding !== false) {
            const pt=node.paddingTop||0, pr=node.paddingRight||0, pb=node.paddingBottom||0, pl=node.paddingLeft||0;
            if (pt+pr+pb+pl > 0) propsTextContent.push("Padding: "+pt+"px "+pr+"px "+pb+"px "+pl+"px");
          }
        }
        
        if (propsTextContent.length > 0) {
            const propFrame = figma.createFrame();
            propFrame.layoutMode = "VERTICAL";
            propFrame.itemSpacing = 4;
            propFrame.fills = [];
            propFrame.layoutAlign = "STRETCH";
            
            for (const pt of propsTextContent) {
                const ptNode = figma.createText();
                ptNode.fontName = { family: "Inter", style: "Regular" };
                ptNode.characters = "• " + pt;
                ptNode.fontSize = 11; ptNode.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.4, b: 0.4 } }];
                propFrame.appendChild(ptNode);
            }
            specCard.appendChild(propFrame);
        }

        if (linkUrl) {
          const lk = figma.createText();
          lk.fontName = { family: "Inter", style: "Medium" };
          lk.characters = "🔗 Link: " + linkUrl;
          lk.fontSize = 11; lk.fills = [{ type: "SOLID", color: { r: 0, g: 0.44, b: 0.69 } }];
          lk.layoutAlign = "STRETCH";
          try {
            lk.hyperlink = { type: "URL", value: linkUrl.startsWith("http") ? linkUrl : "https://" + linkUrl };
          } catch(e) {}
          specCard.appendChild(lk);
        }

        figma.currentPage.appendChild(specCard);
        specCard.x = highlight.x + highlight.width + 120;
        specCard.y = highlight.y;

        const connector = figma.createConnector();
        figma.currentPage.appendChild(connector);
        connector.name = `Link - ${currentLetter}`;
        connector.strokes = [{ type: "SOLID", color: color }];
        connector.strokeWeight = 3;
        connector.dashPattern = [6, 4];
        connector.cornerRadius = 20;
        connector.strokeCap = "ROUND";
        connector.strokeJoin = "ROUND";
        
        connector.connectorStart = { endpointNodeId: highlight.id, magnet: "RIGHT" };
        connector.connectorEnd = { endpointNodeId: specCard.id, magnet: "LEFT" };

        const specGroup = figma.group([highlight, specCard, connector], figma.currentPage);
        specGroup.name = `Especificação ${currentLetter} - ${node.name}`;
        createdNodes.push(specGroup);
        
        const specData = {
          nodeId: specGroup.id,
          name: node.name,
          letter: currentLetter,
          type: labelText,
          color: color
        };
        figma.ui.postMessage({ type: 'spec-created', data: specData });
      }

      figma.currentPage.selection = createdNodes;
      figma.viewport.scrollAndZoomIntoView(createdNodes);
      figma.notify(`${selection.length} especificações criadas com sucesso!`);
    })();
  }
"""

start_add_annotations = content.find('  if (msg.type === "add-annotations") {')
end_add_annotations = content.find('  if (msg.type === "remove-measurement") {', start_add_annotations)

if start_add_annotations != -1 and end_add_annotations != -1:
    content = content[:start_add_annotations] + content[end_add_annotations:]

start_advanced_spec = content.find('  if (msg.type === "create-advanced-spec") {')
end_advanced_spec = content.find('  if (msg.type === "create-flow") {', start_advanced_spec)

if start_advanced_spec != -1 and end_advanced_spec != -1:
    content = content[:start_advanced_spec] + unified_logic + "\n" + content[end_advanced_spec:]

export_data_logic = """  if (msg.type === "export-design-data") {
    // Generate a simple CSV or handle basic data extraction. 
    // In Figma plugins, we generally extract the data and send it back to UI to trigger download.
    const nodes = figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
    let data = "Node Name, Type, Width, Height\\n";
    nodes.forEach(n => {
        data += `${n.name.replace(/,/g, '')},${n.type},${n.width || 0},${n.height || 0}\\n`;
    });
    figma.ui.postMessage({ type: 'design-data-exported', data: data, format: msg.format });
  }
"""

content = content.replace('  if (msg.type === "create-flow") {', export_data_logic + '\n  if (msg.type === "create-flow") {')

with open('src/plugin/code.js', 'w', encoding='utf-8') as f:
    f.write(content)
