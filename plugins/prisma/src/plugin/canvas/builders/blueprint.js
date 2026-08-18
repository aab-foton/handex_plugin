// ============================================================
// canvas/builders/blueprint.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "blueprint" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(1400, 0, 0, C.white, 16);
    mainFrame.name = "Blueprint de Serviço";
    const hdr = mkHeader("Blueprint de Serviço");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    // Swim lane canvas
    const bpCanvas = figma.createFrame();
    bpCanvas.resize(1400, 780);
    bpCanvas.fills = [{ type: "SOLID", color: C.bg }];
    bpCanvas.layoutAlign = "STRETCH";
    mainFrame.appendChild(bpCanvas);

    const lw = 180, sw = 380, pad = 16, rowH = 100;
    const laneLabels = ["Evidências", "Jornada do Usuário", "Ações de Frontstage", "Tecnologia / Sistemas", "Ações de Backstage", "Processos de Suporte"];
    const laneColors = [C.blueLight, { r:0.878, g:0.961, b:0.996 }, C.blueLight, { r:0.973, g:0.965, b:0.996 }, { r:1, g:0.945, b:0.89 }, { r:0.941, g:0.992, b:0.949 }];
    const stages = ["Etapa 1", "Etapa 2", "Etapa 3"];

    // Lane rows
    laneLabels.forEach((lane, ri) => {
      const ly = pad + ri * (rowH + 2);
      const lbl = rct(lw, rowH, laneColors[ri], 0, C.line, 1);
      lbl.x = pad; lbl.y = ly; bpCanvas.appendChild(lbl);
      const lt = tx(lane, 11, "Bold", ri < 3 ? C.blueDark : C.muted);
      lt.x = pad + 10; lt.y = ly + rowH / 2 - 8; bpCanvas.appendChild(lt);
    });

    // Stage columns
    stages.forEach((stage, ci) => {
      const sx = pad + lw + 8 + ci * (sw + 8);
      const stageHdr = rct(sw, 36, C.blue, 0, C.blueDark, 1);
      stageHdr.x = sx; stageHdr.y = 2; bpCanvas.appendChild(stageHdr);
      const sT = tx(stage, 13, "Bold", C.white);
      sT.x = sx + sw / 2 - 30; sT.y = 10; bpCanvas.appendChild(sT);

      const laneKeys = ['evidence', 'user_journey', 'frontstage', 'technology', 'backstage', 'support'];
      laneLabels.forEach((_, ri) => {
        const ly = pad + ri * (rowH + 2);
        const cellKey = laneKeys[ri] + '-etapa' + (ci + 1);
        const cell = rct(sw, rowH, C.white, 0, C.line, 1);
        cell.name = 'section/' + cellKey;
        cell.x = sx; cell.y = ly; bpCanvas.appendChild(cell);
        const ph = tx("+ Adicionar", 10, "Regular", C.light, 'field/' + cellKey);
        ph.x = sx + 12; ph.y = ly + 12; bpCanvas.appendChild(ph);
      });
    });

    // Linha de visibilidade (entre row 2 e row 3)
    const visY = pad + 3 * (rowH + 2) - 1;
    const visLine = rct(1400 - pad * 2, 3, C.orange);
    visLine.x = pad; visLine.y = visY; bpCanvas.appendChild(visLine);
    const visT = tx("─── LINHA DE VISIBILIDADE ───", 9, "Bold", C.orange);
    visT.x = pad + lw + 8; visT.y = visY + 5; bpCanvas.appendChild(visT);

    mainFrame.appendChild(sp(16));

  return mainFrame;
}

module.exports = { build };
