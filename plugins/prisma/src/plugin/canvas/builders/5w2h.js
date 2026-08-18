// ============================================================
// canvas/builders/5w2h.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "5w2h" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(760, 0, 0, C.white, 16);
    mainFrame.name = "5W2H";
    const hdr = mkHeader("5W2H — Planejamento Estruturado");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const body = vb(null, 0, 0, null);
    mainFrame.appendChild(body);
    body.layoutAlign = "STRETCH";

    const rows5w2h = [
      { en: "WHAT",      pt: "O quê?",       sub: "O que vai ser feito / desenvolvido?",    color: C.blue },
      { en: "WHY",       pt: "Por quê?",      sub: "Por que isso deve ser feito?",            color: C.orange },
      { en: "WHO",       pt: "Quem?",         sub: "Quem será o responsável pela execução?",  color: C.teal },
      { en: "WHERE",     pt: "Onde?",         sub: "Onde será executado / entregue?",         color: C.green },
      { en: "WHEN",      pt: "Quando?",       sub: "Quando deve acontecer? Qual o prazo?",    color: C.amber },
      { en: "HOW",       pt: "Como?",         sub: "Como será feito? Quais os passos?",       color: C.blueDark },
      { en: "HOW MUCH",  pt: "Quanto custa?", sub: "Qual o custo ou esforço estimado?",       color: C.red },
    ];

    const w2hKeys = ['what','why','who','where','when','how','how_much'];
    rows5w2h.forEach((row, i) => {
      const card = figma.createFrame();
      card.name = 'section/' + w2hKeys[i];
      card.layoutMode = "HORIZONTAL";
      card.paddingLeft = card.paddingRight = 0;
      card.paddingTop = card.paddingBottom = 0;
      card.itemSpacing = 0;
      card.primaryAxisSizingMode = "AUTO";
      card.counterAxisSizingMode = "AUTO";
      card.counterAxisAlignItems = "MIN";
      card.fills = i % 2 === 0 ? [{ type: "SOLID", color: C.bg }] : [{ type: "SOLID", color: C.white }];
      card.layoutAlign = "STRETCH";

      const lbl = vb(140, 14, 4, row.color, 0);
      lbl.counterAxisSizingMode = "FIXED";
      lbl.resize(140, 10);
      lbl.primaryAxisSizingMode = "AUTO";
      lbl.paddingTop = lbl.paddingBottom = 20;
      lbl.counterAxisAlignItems = "CENTER";
      const enT = tx(row.en, 13, "Bold", C.white);
      enT.textAlignHorizontal = "CENTER";
      enT.layoutAlign = "STRETCH";
      enT.textAutoResize = "HEIGHT";
      lbl.appendChild(enT);
      const ptT = tx(row.pt, 10, "Regular", C.white);
      ptT.opacity = 0.82;
      ptT.textAlignHorizontal = "CENTER";
      ptT.layoutAlign = "STRETCH";
      ptT.textAutoResize = "HEIGHT";
      lbl.appendChild(ptT);
      card.appendChild(lbl);

      const content = vb(null, 20, 4, null, 0);
      content.layoutAlign = "STRETCH";
      content.paddingTop = content.paddingBottom = 16;
      const subT = tx(row.sub, 10, "Regular", C.muted, '_label');
      subT.textAutoResize = "HEIGHT"; subT.layoutAlign = "STRETCH";
      content.appendChild(subT);
      const valT = tx("Clique para adicionar...", 13, "Regular", C.light, 'field/' + w2hKeys[i]);
      valT.textAutoResize = "HEIGHT"; valT.layoutAlign = "STRETCH";
      content.appendChild(valT);
      card.appendChild(content);
      body.appendChild(card);

      if (i < rows5w2h.length - 1) {
        const sep = rct(760, 1, C.line); sep.layoutAlign = "STRETCH"; body.appendChild(sep);
      }
    });
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
