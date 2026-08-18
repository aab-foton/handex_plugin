// ============================================================
// canvas/builders/five-whys.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "five-whys" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(600, 40, 0, C.bgBlue, 20);
    mainFrame.name = "Os 5 Porquês";
    const hdr = mkHeader("Os 5 porquê?");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    mainFrame.appendChild(sp(12));
    mainFrame.appendChild(rct(520, 1, C.line));
    mainFrame.appendChild(sp(12));

    const probRow = hb(0, 8, null);
    probRow.name = 'section/problem';
    probRow.counterAxisAlignItems = "MIN";
    probRow.appendChild(tx("Problema:  ", 13, "Bold", C.blue, '_label'));
    probRow.appendChild(tx("Diga qual o problema encontrado.", 13, "Regular", C.muted, 'field/problem'));
    mainFrame.appendChild(probRow);

    const emojis  = ["😀","😊","🤔","😢","🤯","😱"];
    const qLabels = ["Porquê o problema ocorre?","Porquê?","Porquê?","Porquê?","Porquê?","Porquê?"];
    const pqKeys  = ["why1","why2","why3","why4","why5","why6"];

    for (let i = 0; i < 6; i++) {
      mainFrame.appendChild(sp(14));
      const row = hb(0, 12, null);
      row.name = 'section/' + pqKeys[i];
      row.counterAxisAlignItems = "CENTER";
      row.appendChild(tx(emojis[i], 18, "Regular", C.text, '_emoji'));
      const block = vb(null, 0, 2, null);
      block.name = '_block';
      block.appendChild(tx(qLabels[i], 13, "Bold", C.blue, '_label'));
      block.appendChild(tx((i + 1) + "° motivo — descreva aqui", 12, "Regular", C.muted, 'field/' + pqKeys[i]));
      row.appendChild(block);
      mainFrame.appendChild(row);
    }

    mainFrame.appendChild(sp(20));
    mainFrame.appendChild(rct(520, 1, C.line));
    mainFrame.appendChild(sp(12));
    addT(mainFrame, "Causa raiz", 14, "Bold", C.blue, '_label');
    mainFrame.appendChild(sp(4));
    addT(mainFrame, "A real causa do problema é...", 12, "Regular", C.muted, 'field/root_cause');
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
