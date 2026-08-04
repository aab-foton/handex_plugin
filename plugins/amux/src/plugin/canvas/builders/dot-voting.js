// ============================================================
// canvas/builders/dot-voting.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "dot-voting" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(860, 0, 0, C.white, 16);
    mainFrame.name = "Dot Voting";
    const hdr = mkHeader("Dot Voting — Priorização Colaborativa");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const body = vb(null, 24, 0, null);
    mainFrame.appendChild(body);
    body.layoutAlign = "STRETCH";
    body.paddingBottom = 24;

    addT(body, "Como funciona", 12, "Bold", C.blue);
    addT(body, "Cada participante tem 5 pontos (dots) para distribuir entre as ideias. Pode colocar mais de um ponto na mesma ideia.", 11, "Regular", C.muted);
    mainFrame.appendChild(sp(4));

    // Table header
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
    thItem.counterAxisSizingMode = "FIXED"; thItem.resize(380, 10);
    thItem.primaryAxisSizingMode = "AUTO";
    const thItemT = tx("Ideia / Iniciativa", 12, "Bold", C.white);
    thItemT.layoutAlign = "STRETCH"; thItemT.textAutoResize = "HEIGHT";
    thItem.appendChild(thItemT);
    tHead.appendChild(thItem);

    const participants = ["Participante 1", "Participante 2", "Participante 3"];
    participants.forEach((p, pi) => {
      const thP = vb(100, 12, 0, null, 0);
      thP.name = 'section/participants-' + (pi + 1);
      thP.paddingTop = thP.paddingBottom = 10;
      thP.counterAxisSizingMode = "FIXED"; thP.resize(100, 10);
      thP.primaryAxisSizingMode = "AUTO";
      thP.counterAxisAlignItems = "CENTER";
      const thPT = tx(p, 11, "Bold", C.white, 'field/participants-' + (pi + 1));
      thPT.textAlignHorizontal = "CENTER";
      thPT.layoutAlign = "STRETCH"; thPT.textAutoResize = "HEIGHT";
      thP.appendChild(thPT);
      tHead.appendChild(thP);
    });

    const thTotal = vb(100, 12, 0, null, 0);
    thTotal.paddingTop = thTotal.paddingBottom = 10;
    thTotal.counterAxisSizingMode = "FIXED"; thTotal.resize(100, 10);
    thTotal.primaryAxisSizingMode = "AUTO";
    thTotal.counterAxisAlignItems = "CENTER";
    const thTotalT = tx("Total", 11, "Bold", C.white, '_label');
    thTotalT.textAlignHorizontal = "CENTER";
    thTotalT.layoutAlign = "STRETCH"; thTotalT.textAutoResize = "HEIGHT";
    thTotal.appendChild(thTotalT);
    tHead.appendChild(thTotal);

    // Table rows
    const ideias = [
      "Ideia / Iniciativa 1", "Ideia / Iniciativa 2", "Ideia / Iniciativa 3",
      "Ideia / Iniciativa 4", "Ideia / Iniciativa 5", "Ideia / Iniciativa 6",
    ];
    ideias.forEach((ideia, i) => {
      const row = figma.createFrame();
      row.name = 'section/items-' + (i + 1);
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
      itemCell.paddingTop = itemCell.paddingBottom = 12;
      itemCell.counterAxisSizingMode = "FIXED"; itemCell.resize(380, 10);
      itemCell.primaryAxisSizingMode = "AUTO";
      const itemT = tx(ideia, 12, "Regular", C.text, 'field/items-' + (i + 1));
      itemT.layoutAlign = "STRETCH"; itemT.textAutoResize = "HEIGHT";
      itemCell.appendChild(itemT);
      row.appendChild(itemCell);

      const dotColors = [{ r:0.2, g:0.6, b:1 }, { r:1, g:0.5, b:0.2 }, { r:0.3, g:0.75, b:0.4 }];
      [0,1,2].forEach(p => {
        const dotCell = vb(100, 8, 4, null, 0);
        dotCell.paddingTop = dotCell.paddingBottom = 12;
        dotCell.counterAxisSizingMode = "FIXED"; dotCell.resize(100, 10);
        dotCell.primaryAxisSizingMode = "AUTO";
        dotCell.counterAxisAlignItems = "CENTER";
        const dotsT = tx("● ● ●", 12, "Regular", dotColors[p]);
        dotsT.opacity = 0.3;
        dotsT.textAlignHorizontal = "CENTER";
        dotsT.layoutAlign = "STRETCH"; dotsT.textAutoResize = "HEIGHT";
        dotCell.appendChild(dotsT);
        row.appendChild(dotCell);
      });

      const totalCell = vb(100, 8, 0, null, 0);
      totalCell.paddingTop = totalCell.paddingBottom = 12;
      totalCell.counterAxisSizingMode = "FIXED"; totalCell.resize(100, 10);
      totalCell.primaryAxisSizingMode = "AUTO";
      totalCell.counterAxisAlignItems = "CENTER";
      const totalT = tx("0", 14, "Bold", C.blue, 'field/results-' + (i + 1));
      totalT.textAlignHorizontal = "CENTER";
      totalT.layoutAlign = "STRETCH"; totalT.textAutoResize = "HEIGHT";
      totalCell.appendChild(totalT);
      row.appendChild(totalCell);

      const sep = rct(860, 1, C.line); sep.layoutAlign = "STRETCH"; body.appendChild(sep);
    });

  return mainFrame;
}

module.exports = { build };
