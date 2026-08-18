// ============================================================
// canvas/builders/atomic-research.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "atomic-research" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(960, 0, 0, { r:0.973, g:0.965, b:0.996 }, 16);
    mainFrame.name = "Atomic Research";
    const hdr = mkHeader("Atomic Research");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const arDesc = vb(null, 24, 0, null);
    mainFrame.appendChild(arDesc);
    arDesc.layoutAlign = "STRETCH";
    arDesc.paddingBottom = 8;
    addT(arDesc, "Estrutura achados de pesquisa em 4 níveis: do experimento executado até a conclusão estratégica.", 11, "Regular", C.muted);

    const arCols = hb(24, 16, null);
    arCols.layoutAlign = "STRETCH";
    mainFrame.appendChild(arCols);

    const arDefs = [
      { label: "EXPERIMENTO", sub: "O que foi testado / observado?",   color: C.blue,   bg: C.blueLight },
      { label: "FATO",        sub: "O que aconteceu / foi visto?",     color: C.orange, bg: { r:1, g:0.945, b:0.89 } },
      { label: "INSIGHT",     sub: "O que isso significa?",            color: C.teal,   bg: C.tealLight },
      { label: "CONCLUSÃO",   sub: "O que vamos fazer com isso?",      color: C.green,  bg: C.greenLight },
    ];
    arDefs.forEach((def, ci) => {
      const colKey = ['experiment', 'fact', 'insight', 'conclusion'][ci];
      const colF = vb(208, 0, 10, def.bg, 12);
      colF.name = 'section/' + colKey;
      colF.paddingBottom = 16;
      const chdr = vb(208, 14, 4, def.color, 0);
      chdr.name = '_header';
      chdr.paddingTop = chdr.paddingBottom = 12;
      chdr.layoutAlign = "STRETCH";
      const ct = tx(def.label, 12, "Bold", C.white, '_label');
      ct.layoutAlign = "STRETCH"; ct.textAutoResize = "HEIGHT";
      const cs = tx(def.sub, 9, "Regular", C.white); cs.opacity = 0.85;
      cs.layoutAlign = "STRETCH"; cs.textAutoResize = "HEIGHT";
      chdr.appendChild(ct); chdr.appendChild(cs);
      colF.appendChild(chdr);
      for (let i = 0; i < 3; i++) {
        const card = vb(180, 12, 0, C.white, 8);
        card.name = 'section/' + colKey + '-' + (i + 1);
        card.paddingTop = card.paddingBottom = 12;
        card.layoutAlign = "STRETCH";
        card.strokes = [{ type: "SOLID", color: def.color }];
        card.strokeWeight = 1;
        const ph = tx("Clique para adicionar...", 11, "Regular", C.light, 'field/' + colKey + '-' + (i + 1));
        ph.textAutoResize = "HEIGHT"; ph.layoutAlign = "STRETCH";
        card.appendChild(ph);
        colF.appendChild(card);
      }
      arCols.appendChild(colF);
    });
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
