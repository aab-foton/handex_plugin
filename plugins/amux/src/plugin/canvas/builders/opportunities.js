// ============================================================
// canvas/builders/opportunities.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "opportunities" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(1000, 0, 0, C.bgBlue, 16);
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
      { theme: "Tema 1",  color: C.blue,   bg: C.blueLight,   priority: "Alta" },
      { theme: "Tema 2",  color: C.orange, bg: { r:1, g:0.945, b:0.89 }, priority: "Média" },
      { theme: "Tema 3",  color: C.teal,   bg: C.tealLight,   priority: "Alta" },
      { theme: "Tema 4",  color: C.green,  bg: C.greenLight,  priority: "Baixa" },
    ];

    opDefs.forEach((def, ci) => {
      const clusterId = 'clusters-' + (ci + 1);
      const opCol = vb(214, 0, 10, def.bg, 12);
      opCol.name = 'section/' + clusterId;
      opCol.paddingBottom = 16;

      const colHdr = vb(214, 14, 4, def.color, 0);
      colHdr.name = '_header';
      colHdr.paddingTop = colHdr.paddingBottom = 12;
      colHdr.layoutAlign = "STRETCH";
      const ct = tx(def.theme, 13, "Bold", C.white, 'field/' + clusterId);
      ct.layoutAlign = "STRETCH"; ct.textAutoResize = "HEIGHT";
      colHdr.appendChild(ct);
      const pr = tx("Prioridade: " + def.priority, 9, "Regular", C.white, 'field/priority-' + (ci + 1)); pr.opacity = 0.85;
      pr.layoutAlign = "STRETCH"; pr.textAutoResize = "HEIGHT";
      colHdr.appendChild(pr);
      opCol.appendChild(colHdr);

      for (let i = 0; i < 4; i++) {
        const cardKey = clusterId + '-item-' + (i + 1);
        const card = vb(186, 12, 0, C.white, 8);
        card.name = 'section/' + cardKey;
        card.paddingTop = card.paddingBottom = 12;
        card.layoutAlign = "STRETCH";
        const ph = tx("Oportunidade " + (i + 1) + "...", 11, "Regular", C.light, 'field/' + cardKey);
        ph.textAutoResize = "HEIGHT"; ph.layoutAlign = "STRETCH";
        card.appendChild(ph);
        opCol.appendChild(card);
      }

      const footer = vb(186, 10, 6, C.white, 8);
      footer.name = 'section/cluster-' + (ci + 1) + '-footer';
      footer.paddingTop = footer.paddingBottom = 10;
      footer.layoutAlign = "STRETCH";
      const respL = tx("Responsável:", 9, "Bold", C.muted, '_label');
      footer.appendChild(respL);
      const respT = tx("Quem toca essa oportunidade...", 10, "Regular", C.light, 'field/responsible-' + (ci + 1));
      respT.textAutoResize = "HEIGHT"; respT.layoutAlign = "STRETCH";
      footer.appendChild(respT);
      const nextL = tx("Próximos passos:", 9, "Bold", C.muted, '_label');
      footer.appendChild(nextL);
      const nextT = tx("O que fazer a seguir...", 10, "Regular", C.light, 'field/next_steps-' + (ci + 1));
      nextT.textAutoResize = "HEIGHT"; nextT.layoutAlign = "STRETCH";
      footer.appendChild(nextT);
      opCol.appendChild(footer);

      opCols.appendChild(opCol);
    });
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
