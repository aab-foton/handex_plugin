// ============================================================
// canvas/builders/crazy-8s.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "crazy-8s" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(900, 0, 0, C.bgBlue, 16);
    mainFrame.name = "Crazy 8s";
    const hdr = mkHeader("Crazy 8s — 8 ideias em 8 minutos");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const intro = vb(null, 24, 4, null);
    mainFrame.appendChild(intro);
    intro.layoutAlign = "STRETCH";
    intro.paddingBottom = 0;
    addT(intro, "Regras do exercício", 12, "Bold", C.blue);
    addT(intro, "1 minuto por quadrante · Sem editar, só esboçar · Não avalie as ideias durante o exercício", 11, "Regular", C.muted);

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

    const col1 = vb(null, 0, 16, null); col1.counterAxisSizingMode = "AUTO";
    const col2 = vb(null, 0, 16, null); col2.counterAxisSizingMode = "AUTO";
    grid.appendChild(col1); grid.appendChild(col2);

    for (let i = 1; i <= 8; i++) {
      const box = vb(400, 16, 8, C.white, 12);
      box.name = 'section/idea_' + i;
      box.counterAxisSizingMode = "FIXED";
      box.resize(400, 200);
      box.primaryAxisSizingMode = "FIXED";
      box.strokes = [{ type: "SOLID", color: C.line }]; box.strokeWeight = 1.5;

      const badge = hb(8, 4, C.blue, 12);
      badge.name = '_badge';
      badge.paddingTop = badge.paddingBottom = 4;
      const badgeT = tx(String(i), 11, "Bold", C.white, '_num');
      badge.appendChild(badgeT);
      box.appendChild(badge);

      const ph = tx("Esboce ou descreva a ideia " + i + "...", 11, "Regular", C.light, 'field/idea_' + i);
      ph.textAutoResize = "HEIGHT"; ph.layoutAlign = "STRETCH";
      box.appendChild(ph);

      if (i <= 4) col1.appendChild(box); else col2.appendChild(box);
    }
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
