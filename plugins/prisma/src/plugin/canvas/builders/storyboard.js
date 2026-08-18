// ============================================================
// canvas/builders/storyboard.js — Storyboard (PRISMA)
// Sequência de cenas mostrando como um usuário vive um cenário de
// uso, do contexto inicial à resolução — torna soluções abstratas
// mais tangíveis antes de prototipar.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

  mainFrame = vb(1040, 0, 0, C.white, 16);
  mainFrame.name = "Storyboard";
  const hdr = mkHeader("Storyboard");
  mainFrame.appendChild(hdr);
  hdr.layoutAlign = "STRETCH";

  const desc = vb(null, 24, 0, null);
  mainFrame.appendChild(desc);
  desc.layoutAlign = "STRETCH";
  desc.paddingBottom = 8;
  addT(desc, "Descreva, cena a cena, como o usuário vive este cenário — do contexto inicial até a resolução.", 11, "Regular", C.muted);

  const cenarioCard = vb(null, 16, 6, C.blueLight, 12);
  cenarioCard.layoutAlign = "STRETCH";
  cenarioCard.paddingTop = cenarioCard.paddingBottom = 16;
  mainFrame.appendChild(cenarioCard);
  addT(cenarioCard, "Cenário / contexto", 10, "Bold", C.blueDark, '_label');
  mkField(cenarioCard, 'cenario', "Quem é o usuário, onde está, o que motiva esta história...", 11, C.white);

  const scenesRow = hb(24, 12, null);
  scenesRow.layoutAlign = "STRETCH";
  mainFrame.appendChild(scenesRow);

  const sceneDefs = [
    { n: 1, label: "Situação inicial", color: C.muted },
    { n: 2, label: "Cena 2", color: C.muted },
    { n: 3, label: "Cena 3", color: C.muted },
    { n: 4, label: "Resolução", color: C.green }
  ];

  sceneDefs.forEach(def => {
    const scene = vb(232, 0, 0, C.bg, 12);
    scene.name = 'section/cena_' + def.n;
    scene.paddingBottom = 14;

    const frameArea = vb(232, 0, 0, C.white, 0);
    frameArea.counterAxisSizingMode = "FIXED";
    frameArea.resize(232, 160);
    frameArea.primaryAxisSizingMode = "FIXED";
    frameArea.primaryAxisAlignItems = "CENTER";
    frameArea.counterAxisAlignItems = "CENTER";
    const placeholderIcon = tx("🎬", 32, "Regular", C.light, '_label');
    frameArea.appendChild(placeholderIcon);
    scene.appendChild(frameArea);

    const capHdr = hb(14, 6, null);
    capHdr.paddingTop = 10;
    capHdr.layoutAlign = "STRETCH";
    const badge = vb(null, 4, 0, def.color, 999);
    badge.paddingLeft = badge.paddingRight = 8;
    badge.paddingTop = badge.paddingBottom = 3;
    badge.appendChild(tx(String(def.n), 9, "Bold", C.white, '_num'));
    capHdr.appendChild(badge);
    capHdr.appendChild(tx(def.label, 10, "Bold", C.text, '_label'));
    scene.appendChild(capHdr);

    const capWrap = vb(204, 0, 0, null, 0);
    capWrap.paddingLeft = capWrap.paddingRight = 14;
    capWrap.layoutAlign = "STRETCH";
    const capT = tx("Descreva o que acontece nesta cena...", 10, "Regular", C.light, 'field/cena_' + def.n);
    capT.textAutoResize = "HEIGHT"; capT.layoutAlign = "STRETCH";
    capWrap.appendChild(capT);
    scene.appendChild(capWrap);

    scenesRow.appendChild(scene);
  });

  const emotionCard = vb(null, 16, 6, C.bg, 12);
  emotionCard.layoutAlign = "STRETCH";
  emotionCard.paddingTop = emotionCard.paddingBottom = 16;
  mainFrame.appendChild(emotionCard);
  addT(emotionCard, "Emoção do usuário ao longo da história", 10, "Bold", C.muted, '_label');
  mkField(emotionCard, 'emocao_usuario', "Como o usuário se sente em cada momento...", 11, C.white);

  mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
