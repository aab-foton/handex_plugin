// ============================================================
// canvas/builders/how-might-we.js — How Might We (PRISMA)
// Reformula dores/necessidades da Descoberta em perguntas geradoras
// ("Como poderíamos...?"), fazendo a ponte para a Ideação.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

  mainFrame = vb(900, 0, 0, C.white, 16);
  mainFrame.name = "How Might We";
  const hdr = mkHeader("How Might We");
  mainFrame.appendChild(hdr);
  hdr.layoutAlign = "STRETCH";

  const desc = vb(null, 24, 0, null);
  mainFrame.appendChild(desc);
  desc.layoutAlign = "STRETCH";
  desc.paddingBottom = 8;
  addT(desc, "Para cada dor ou necessidade identificada na pesquisa, gere perguntas 'Como poderíamos...' — nem tão amplas que não orientem, nem tão específicas que já embutam a solução.", 11, "Regular", C.muted);

  const blocks = hb(24, 16, null);
  blocks.layoutAlign = "STRETCH";
  mainFrame.appendChild(blocks);

  const defs = [
    { n: 1, color: C.red, bg: { r: 1, g: 0.949, b: 0.949 } },
    { n: 2, color: C.amber, bg: { r: 1, g: 0.980, b: 0.929 } },
    { n: 3, color: C.blue, bg: C.blueLight }
  ];

  defs.forEach(def => {
    const col = vb(268, 0, 10, def.bg, 12);
    col.name = 'section/dor_' + def.n;
    col.paddingBottom = 16;

    const dorHdr = vb(268, 14, 4, def.color, 0);
    dorHdr.name = '_header';
    dorHdr.paddingTop = dorHdr.paddingBottom = 12;
    dorHdr.layoutAlign = "STRETCH";
    dorHdr.appendChild(tx("Dor / necessidade " + def.n, 12, "Bold", C.white, '_label'));
    col.appendChild(dorHdr);

    const dorWrap = vb(240, 12, 0, C.white, 8);
    dorWrap.name = 'section/dor_' + def.n + '-text';
    dorWrap.paddingTop = dorWrap.paddingBottom = 10;
    dorWrap.layoutAlign = "STRETCH";
    const dorT = tx("Descreva a dor identificada...", 11, "Regular", C.light, 'field/dor_' + def.n);
    dorT.textAutoResize = "HEIGHT"; dorT.layoutAlign = "STRETCH";
    dorWrap.appendChild(dorT);
    col.appendChild(dorWrap);

    const arrow = tx("↓ reformular em", 9, "Bold", def.color, '_label');
    col.appendChild(arrow);

    const hmwWrap = vb(240, 12, 0, C.white, 8);
    hmwWrap.name = 'section/hmw_' + def.n + '-text';
    hmwWrap.paddingTop = hmwWrap.paddingBottom = 10;
    hmwWrap.layoutAlign = "STRETCH";
    const hmwT = tx("Como poderíamos... (uma pergunta por linha)", 11, "Regular", C.light, 'field/hmw_' + def.n);
    hmwT.textAutoResize = "HEIGHT"; hmwT.layoutAlign = "STRETCH";
    hmwWrap.appendChild(hmwT);
    col.appendChild(hmwWrap);

    blocks.appendChild(col);
  });

  const selectedCard = vb(null, 16, 6, C.greenLight, 12);
  selectedCard.layoutAlign = "STRETCH";
  selectedCard.paddingTop = selectedCard.paddingBottom = 16;
  mainFrame.appendChild(selectedCard);
  addT(selectedCard, "Pergunta selecionada para prosseguir à Ideação", 10, "Bold", C.green, '_label');
  mkField(selectedCard, 'hmw_selecionada', "Qual pergunta o time escolheu explorar...", 11, C.white);

  mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
