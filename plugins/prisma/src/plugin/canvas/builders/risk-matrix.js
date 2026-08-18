// ============================================================
// canvas/builders/risk-matrix.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "risk-matrix" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(820, 0, 0, C.white, 16);
    mainFrame.name = "Matriz de Riscos";
    const hdr = mkHeader("Matriz de Riscos — Probabilidade × Impacto");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const canvas = figma.createFrame();
    canvas.resize(820, 580);
    canvas.fills = [{ type: "SOLID", color: C.white }];
    canvas.layoutAlign = "STRETCH";
    mainFrame.appendChild(canvas);

    const ox = 120, oy = 20, cw = 220, ch = 160;

    // Zone colors [row=probabilidade desc][col=impacto asc]
    const zoneFills = [
      [{ r:1, g:0.949, b:0.749 }, { r:1, g:0.8, b:0.4 }, { r:0.98, g:0.43, b:0.43 }],
      [C.greenLight,              { r:1, g:0.949, b:0.749 }, { r:1, g:0.8, b:0.4 }],
      [C.greenLight,              C.greenLight,              { r:1, g:0.949, b:0.749 }],
    ];
    const zoneLabels = [
      ["Moderado", "Alto",     "Crítico"],
      ["Baixo",    "Moderado", "Alto"],
      ["Baixo",    "Baixo",    "Moderado"],
    ];
    const zoneLabelColors = [
      [C.amber, C.orange, C.red],
      [C.green, C.amber, C.orange],
      [C.green, C.green, C.amber],
    ];

    // Mapeia o rótulo textual de cada zona para o id fixo em fields[] do JSON
    const zoneFieldIds = { "Crítico": "critical", "Alto": "high", "Moderado": "moderate", "Baixo": "low" };
    const zoneCounters = {};

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cell = rct(cw, ch, zoneFills[r][c], 0, C.line, 1);
        cell.x = ox + c * cw; cell.y = oy + r * ch; canvas.appendChild(cell);
        const lbl = tx("Risco " + zoneLabels[r][c], 11, "Bold", zoneLabelColors[r][c]);
        lbl.x = ox + c * cw + 10; lbl.y = oy + r * ch + 10; canvas.appendChild(lbl);
        const zoneId = zoneFieldIds[zoneLabels[r][c]];
        const idx = (zoneCounters[zoneId] = (zoneCounters[zoneId] || 0) + 1);
        const ph = tx("+ Adicionar risco", 10, "Regular", C.muted, 'field/' + zoneId + '-' + idx);
        ph.x = ox + c * cw + 10; ph.y = oy + r * ch + 30; canvas.appendChild(ph);
      }
    }

    // Row labels (Probabilidade)
    ["ALTA", "MÉDIA", "BAIXA"].forEach((l, i) => {
      const t = tx(l, 10, "Bold", C.text);
      t.x = ox - 60; t.y = oy + i * ch + ch / 2 - 6; canvas.appendChild(t);
    });
    // Col labels (Impacto)
    ["BAIXO", "MÉDIO", "ALTO"].forEach((l, i) => {
      const t = tx(l, 10, "Bold", C.text);
      t.x = ox + i * cw + cw / 2 - 18; t.y = oy + 3 * ch + 12; canvas.appendChild(t);
    });
    // Axis titles
    const yT = tx("PROBABILIDADE  ↑", 10, "Bold", C.text);
    yT.x = 14; yT.y = oy + ch + ch / 2; yT.rotation = -90; canvas.appendChild(yT);
    const xT = tx("IMPACTO  →", 10, "Bold", C.text);
    xT.x = ox + cw; xT.y = oy + 3 * ch + 30; canvas.appendChild(xT);

    mainFrame.appendChild(sp(16));

  return mainFrame;
}

module.exports = { build };
