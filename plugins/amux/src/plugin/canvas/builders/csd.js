// ============================================================
// canvas/builders/csd.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "csd" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(940, 0, 0, C.white, 16);
    mainFrame.name = "Matriz CSD";
    const hdr = mkHeader("Matriz CSD – Certezas · Suposições · Dúvidas");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const csdRow = hb(20, 16, null);
    csdRow.layoutAlign = "STRETCH";
    mainFrame.appendChild(csdRow);

    const csdCols = [
      { label: "Certezas",   sub: "O que sabemos com certeza.",              hdr: C.green,  bg: C.greenLight },
      { label: "Suposições", sub: "O que acreditamos, mas não validamos.",   hdr: C.amber,  bg: { r:1, g:0.980, b:0.929 } },
      { label: "Dúvidas",   sub: "O que precisamos descobrir.",              hdr: C.red,    bg: { r:1, g:0.949, b:0.949 } },
    ];

    csdCols.forEach((col, ci) => {
      const colKey = ['certainties', 'assumptions', 'doubts'][ci];
      const card = vb(280, 0, 8, col.bg, 12);
      card.name = 'section/' + colKey;
      card.paddingBottom = 16;
      const chdr = vb(280, 16, 4, col.hdr, 0);
      chdr.name = '_header';
      chdr.paddingTop = chdr.paddingBottom = 10;
      chdr.layoutAlign = "STRETCH";
      const ct = tx(col.label, 13, "Bold", C.white, '_label');
      ct.layoutAlign = "STRETCH"; ct.textAutoResize = "HEIGHT";
      const cs = tx(col.sub, 10, "Regular", C.white); cs.opacity = 0.85;
      cs.layoutAlign = "STRETCH"; cs.textAutoResize = "HEIGHT";
      chdr.appendChild(ct); chdr.appendChild(cs);
      card.appendChild(chdr);

      for (let i = 0; i < 3; i++) {
        const itemWrap = vb(248, 12, 0, C.white, 8);
        itemWrap.name = 'section/' + colKey + '-' + (i + 1);
        itemWrap.paddingTop = itemWrap.paddingBottom = 10;
        itemWrap.strokes = [{ type: "SOLID", color: C.line }];
        itemWrap.strokeWeight = 1;
        itemWrap.layoutAlign = "STRETCH";
        const ph = tx("Clique para adicionar...", 11, "Regular", C.light, 'field/' + colKey + '-' + (i + 1));
        ph.layoutAlign = "STRETCH"; ph.textAutoResize = "HEIGHT";
        itemWrap.appendChild(ph);
        card.appendChild(itemWrap);
      }
      csdRow.appendChild(card);
    });

  return mainFrame;
}

module.exports = { build };
