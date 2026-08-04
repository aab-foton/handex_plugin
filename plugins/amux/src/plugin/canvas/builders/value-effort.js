// ============================================================
// canvas/builders/value-effort.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "value-effort" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    const veCanvas = figma.createFrame();
    veCanvas.resize(620, 720);
    veCanvas.fills = [{ type: "SOLID", color: C.white }];
    veCanvas.layoutAlign = "STRETCH";

    const chartBg = rct(500, 580, C.bgBlue, 8);
    chartBg.x = 60; chartBg.y = 20; veCanvas.appendChild(chartBg);
    const yAx = rct(2, 500, C.text); yAx.x = 100; yAx.y = 40; veCanvas.appendChild(yAx);
    const xAx = rct(420, 2, C.text); xAx.x = 100; xAx.y = 560; veCanvas.appendChild(xAx);

    // Axis titles
    const veYT = tx("VALOR  ↑", 10, "Bold", C.text);
    veYT.x = 20; veYT.y = 280; veYT.rotation = -90; veCanvas.appendChild(veYT);
    const veXT = tx("ESFORÇO  →", 10, "Bold", C.text);
    veXT.x = 280; veXT.y = 570; veCanvas.appendChild(veXT);

    // Quadrantes: alto valor/baixo esforço (quick wins) · alto valor/alto esforço (big bets)
    // baixo valor/baixo esforço (fill-ins) · baixo valor/alto esforço (thankless tasks)
    const veQuad = (id, title, x, y, color) => {
      const box = vb(190, 12, 4, null, 0);
      box.name = 'section/' + id;
      box.x = x; box.y = y; veCanvas.appendChild(box);
      const t = tx(title, 11, "Bold", color, '_label');
      t.textAutoResize = "HEIGHT"; t.layoutAlign = "STRETCH"; box.appendChild(t);
      const ph = tx("Clique para adicionar...", 10, "Regular", C.light, 'field/' + id);
      ph.textAutoResize = "HEIGHT"; ph.layoutAlign = "STRETCH"; box.appendChild(ph);
    };
    veQuad("quick_wins",      "Quick Wins",        110, 40,  C.green);
    veQuad("big_bets",        "Grandes Apostas",   320, 40,  C.blue);
    veQuad("fill_ins",        "Fill-ins",          110, 320, C.muted);
    veQuad("thankless_tasks", "Thankless Tasks",   320, 320, C.red);

    mainFrame = vb(620, 0, 0, C.white, 16);
    mainFrame.name = "Matriz Valor × Esforço";
    const hdr = mkHeader("Matriz Valor × Esforço");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";
    mainFrame.appendChild(veCanvas);

  return mainFrame;
}

module.exports = { build };
