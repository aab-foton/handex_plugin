(async function createHandexComponentsV2() {
  const L = (...a) => console.log('[HandexDS V2]', ...a);
  L('Iniciando constru??o de alta fidelidade...');

  // 1. Obter refer?ncias de vari?veis existentes
  const localVars = figma.variables.getLocalVariables();
  const localCols = figma.variables.getLocalVariableCollections();

  const getVar = (name, colName) => {
    const col = localCols.find(c => c.name === colName);
    if (!col) return null;
    return localVars.find(v => v.name === name && v.variableCollectionId === col.id) || null;
  };

  const vars = {
    blue500: getVar('blue/500', 'color/brand'),
    surface: getVar('surface', 'color/surface'),
    bg: getVar('bg', 'color/surface'),
    line: getVar('line', 'color/surface'),
    text: getVar('text', 'color/surface'),
    muted: getVar('muted', 'color/surface'),
    radXl: getVar('xl', 'radius'),
    radFull: getVar('full', 'radius'),
    typeSm: getVar('sm', 'type'),
    typeMd: getVar('md', 'type'),
    typeLg: getVar('lg', 'type')
  };

  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

  function applyColor(paint, variable) {
    if (!variable) return paint;
    return { ...paint, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variable.id } } };
  }

  function applyRadius(node, variable) {
    if (!variable) return;
    node.cornerRadius = 16;
    node.boundVariables = {
      topLeftRadius: { type: 'VARIABLE_ALIAS', id: variable.id },
      topRightRadius: { type: 'VARIABLE_ALIAS', id: variable.id },
      bottomLeftRadius: { type: 'VARIABLE_ALIAS', id: variable.id },
      bottomRightRadius: { type: 'VARIABLE_ALIAS', id: variable.id }
    };
  }

  function createText(text, sizeVar, style, colorVar, hex) {
    const t = figma.createText();
    t.characters = text;
    t.fontName = { family: 'Inter', style: style };
    if (sizeVar) t.boundVariables = { fontSize: { type: 'VARIABLE_ALIAS', id: sizeVar.id } };
    const c = hex ? { r: parseInt(hex.slice(1,3),16)/255, g: parseInt(hex.slice(3,5),16)/255, b: parseInt(hex.slice(5,7),16)/255 } : { r: 0.1, g: 0.1, b: 0.1 };
    t.fills = [applyColor({ type: 'SOLID', color: c }, colorVar)];
    return t;
  }

  const shadowSoft = {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.08 },
    offset: { x: 0, y: 8 },
    radius: 24,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  };

  const shadowButton = {
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.05 },
    offset: { x: 0, y: 2 },
    radius: 4,
    spread: 0,
    visible: true,
    blendMode: 'NORMAL'
  };

  const compPage = figma.root.children.find(p => p.name.includes('Componentes'));
  if (compPage) {
    await figma.setCurrentPageAsync(compPage);
    [...compPage.children].forEach(n => { try { n.remove(); } catch(e) {} });

    let cx = 100;
    let cy = 100;

    // T?tulo da Se??o
    const title = createText('Componentes Master', vars.typeLg, 'Bold', vars.text, '#1e293b');
    title.x = cx; title.y = cy - 60;
    compPage.appendChild(title);

    // BOT?O PRIM?RIO (Master Component)
    const btnPrim = figma.createComponent();
    btnPrim.name = 'Button / Primary';
    btnPrim.layoutMode = 'HORIZONTAL';
    btnPrim.primaryAxisAlignItems = 'CENTER';
    btnPrim.counterAxisAlignItems = 'CENTER';
    btnPrim.paddingLeft = 24; btnPrim.paddingRight = 24; btnPrim.paddingTop = 14; btnPrim.paddingBottom = 14;
    btnPrim.itemSpacing = 8;
    btnPrim.fills = [applyColor({ type: 'SOLID', color: { r: 0, g: 0.361, b: 0.663 } }, vars.blue500)];
    applyRadius(btnPrim, vars.radXl);
    btnPrim.effects = [shadowButton];
    btnPrim.appendChild(createText('Label do Bot?o', vars.typeSm, 'Bold', null, '#ffffff'));
    btnPrim.x = cx; btnPrim.y = cy;
    compPage.appendChild(btnPrim);

    // BOT?O SECUND?RIO (Master Component)
    const btnSec = figma.createComponent();
    btnSec.name = 'Button / Secondary';
    btnSec.layoutMode = 'HORIZONTAL';
    btnSec.primaryAxisAlignItems = 'CENTER';
    btnSec.counterAxisAlignItems = 'CENTER';
    btnSec.paddingLeft = 24; btnSec.paddingRight = 24; btnSec.paddingTop = 14; btnSec.paddingBottom = 14;
    btnSec.itemSpacing = 8;
    btnSec.fills = [applyColor({ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, vars.surface)];
    btnSec.strokes = [applyColor({ type: 'SOLID', color: { r: 0.867, g: 0.890, b: 0.925 } }, vars.line)];
    btnSec.strokeWeight = 1.5;
    applyRadius(btnSec, vars.radXl);
    btnSec.effects = [shadowButton];
    btnSec.appendChild(createText('Label do Bot?o', vars.typeSm, 'Bold', vars.text, '#1e293b'));
    btnSec.x = cx + 240; btnSec.y = cy;
    compPage.appendChild(btnSec);

    cy += 120;

    // INPUT FIELD (Master Component)
    const inputField = figma.createComponent();
    inputField.name = 'Input / Text Field';
    inputField.layoutMode = 'VERTICAL';
    inputField.itemSpacing = 8;
    inputField.resize(320, 70);
    inputField.fills = [];
    
    const label = createText('Label do Campo', vars.typeSm, 'Medium', vars.text, '#1e293b');
    inputField.appendChild(label);

    const inputBox = figma.createFrame();
    inputBox.name = 'Box';
    inputBox.layoutMode = 'HORIZONTAL';
    inputBox.counterAxisAlignItems = 'CENTER';
    inputBox.layoutAlign = 'STRETCH';
    inputBox.paddingLeft = 16; inputBox.paddingRight = 16; inputBox.paddingTop = 14; inputBox.paddingBottom = 14;
    inputBox.fills = [applyColor({ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, vars.surface)];
    inputBox.strokes = [applyColor({ type: 'SOLID', color: { r: 0.867, g: 0.890, b: 0.925 } }, vars.line)];
    inputBox.strokeWeight = 1.5;
    applyRadius(inputBox, vars.radXl);
    
    const placeholder = createText('Digite aqui...', vars.typeSm, 'Regular', vars.muted, '#8394a8');
    inputBox.appendChild(placeholder);
    inputField.appendChild(inputBox);
    inputField.x = cx; inputField.y = cy;
    compPage.appendChild(inputField);

    L('Componentes premium gerados.');
  }

  const patPage = figma.root.children.find(p => p.name.includes('Padroes') || p.name.includes('Padr?es'));
  if (patPage) {
    await figma.setCurrentPageAsync(patPage);
    [...patPage.children].forEach(n => { try { n.remove(); } catch(e) {} });

    // HIGH FIDELITY SHELL (Master Component)
    const shell = figma.createComponent();
    shell.name = 'Padr?o / Shell do Plugin';
    shell.resize(360, 640);
    shell.fills = [applyColor({ type: 'SOLID', color: { r: 0.933, g: 0.949, b: 0.969 } }, vars.bg)];
    applyRadius(shell, vars.radXl);
    shell.clipsContent = true;
    shell.effects = [shadowSoft];
    shell.layoutMode = 'VERTICAL';

    // Header
    const header = figma.createFrame();
    header.name = 'Header Area';
    header.layoutMode = 'HORIZONTAL';
    header.primaryAxisAlignItems = 'SPACE_BETWEEN';
    header.counterAxisAlignItems = 'CENTER';
    header.paddingLeft = 24; header.paddingRight = 24; header.paddingTop = 20; header.paddingBottom = 20;
    header.layoutAlign = 'STRETCH';
    header.fills = [applyColor({ type: 'SOLID', color: { r: 0, g: 0.361, b: 0.663 } }, vars.blue500)];
    
    const hTitle = createText('Handex Express', vars.typeMd, 'Bold', null, '#ffffff');
    header.appendChild(hTitle);
    
    const closeSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6L18 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const closeIcon = figma.createNodeFromSvg(closeSvg);
    header.appendChild(closeIcon);
    shell.appendChild(header);

    // Body
    const body = figma.createFrame();
    body.name = 'Content Area';
    body.layoutMode = 'VERTICAL';
    body.itemSpacing = 24;
    body.paddingLeft = 24; body.paddingRight = 24; body.paddingTop = 32; body.paddingBottom = 32;
    body.layoutAlign = 'STRETCH';
    body.layoutGrow = 1; // Preenche o espa?o flex
    body.fills = [];

    // Premium Card
    const card = figma.createFrame();
    card.name = 'Token Analysis Card';
    card.layoutMode = 'VERTICAL';
    card.itemSpacing = 12;
    card.paddingLeft = 24; card.paddingRight = 24; card.paddingTop = 24; card.paddingBottom = 24;
    card.layoutAlign = 'STRETCH';
    card.fills = [applyColor({ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, vars.surface)];
    card.strokes = [applyColor({ type: 'SOLID', color: { r: 0.867, g: 0.890, b: 0.925 } }, vars.line)];
    card.strokeWeight = 1;
    applyRadius(card, vars.radXl);
    card.effects = [shadowButton];

    const cTitle = createText('Tokens do Frame', vars.typeMd, 'Bold', vars.text, '#1e293b');
    const cDesc = createText('An?lise completa dos componentes. Os tokens est?o em conformidade com o Design System da CAIXA.', vars.typeSm, 'Regular', vars.muted, '#8394a8');
    cDesc.layoutAlign = 'STRETCH';
    card.appendChild(cTitle);
    card.appendChild(cDesc);
    
    // Icone check verde no card
    const checkSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.6666 5L7.49992 14.1667L3.33325 10" stroke="#22C55E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const checkIcon = figma.createNodeFromSvg(checkSvg);
    
    const cardHeaderRow = figma.createFrame();
    cardHeaderRow.layoutMode = 'HORIZONTAL';
    cardHeaderRow.primaryAxisAlignItems = 'SPACE_BETWEEN';
    cardHeaderRow.layoutAlign = 'STRETCH';
    cardHeaderRow.fills = [];
    cardHeaderRow.appendChild(cTitle);
    cardHeaderRow.appendChild(checkIcon);
    
    card.insertChild(0, cardHeaderRow);
    body.appendChild(card);
    shell.appendChild(body);

    // Footer
    const footer = figma.createFrame();
    footer.name = 'Footer Area';
    footer.layoutMode = 'HORIZONTAL';
    footer.primaryAxisAlignItems = 'CENTER';
    footer.counterAxisAlignItems = 'CENTER';
    footer.paddingLeft = 24; footer.paddingRight = 24; footer.paddingTop = 20; footer.paddingBottom = 20;
    footer.layoutAlign = 'STRETCH';
    footer.fills = [applyColor({ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }, vars.surface)];
    
    const fBtn = figma.createFrame();
    fBtn.layoutMode = 'HORIZONTAL';
    fBtn.primaryAxisAlignItems = 'CENTER';
    fBtn.layoutAlign = 'STRETCH';
    fBtn.layoutGrow = 1;
    fBtn.paddingTop = 16; fBtn.paddingBottom = 16;
    fBtn.fills = [applyColor({ type: 'SOLID', color: { r: 0, g: 0.361, b: 0.663 } }, vars.blue500)];
    applyRadius(fBtn, vars.radXl);
    fBtn.effects = [shadowButton];
    fBtn.appendChild(createText('Gerar Especifica??es', vars.typeSm, 'Bold', null, '#ffffff'));

    footer.appendChild(fBtn);
    shell.appendChild(footer);

    shell.x = 100; shell.y = 100;
    patPage.appendChild(shell);
    
    figma.viewport.scrollAndZoomIntoView([shell]);
    L('Padr?es premium gerados.');
  }

  figma.notify('Alta Fidelidade V2 Gerada! Componentes criados com sombras e auto-layout.');
})();