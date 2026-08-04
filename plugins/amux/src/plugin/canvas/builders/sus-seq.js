// ============================================================
// canvas/builders/sus-seq.js — SUS / SEQ, satisfação pós-tarefa (AMUX)
// System Usability Scale (10 afirmações, escala 1-5) e Single Ease
// Question (1 pergunta, escala 1-7) — questionários padronizados de
// satisfação, preenchidos manualmente após uma sessão de teste/uso real.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, mkRatingRow, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

  mainFrame = vb(760, 0, 0, C.white, 16);
  mainFrame.name = "SUS / SEQ — Satisfação Pós-Tarefa";
  const hdr = mkHeader("SUS / SEQ — Satisfação Pós-Tarefa");
  mainFrame.appendChild(hdr);
  hdr.layoutAlign = "STRETCH";

  const desc = vb(null, 24, 0, null);
  mainFrame.appendChild(desc);
  desc.layoutAlign = "STRETCH";
  desc.paddingBottom = 8;
  addT(desc, "Registre as respostas coletadas ao final de uma sessão de teste ou uso real. SEQ é uma pergunta única (1-7); SUS são 10 afirmações (1-5, discordo totalmente a concordo totalmente).", 11, "Regular", C.muted);

  // SEQ — pergunta única, escala 1-7
  const seqCard = vb(null, 16, 8, C.blueLight, 12);
  seqCard.layoutAlign = "STRETCH";
  seqCard.paddingTop = seqCard.paddingBottom = 16;
  mainFrame.appendChild(seqCard);
  addT(seqCard, "SEQ — De modo geral, quão fácil ou difícil foi realizar esta tarefa?", 12, "Bold", C.blueDark, '_label');
  addT(seqCard, "1 = Muito difícil · 7 = Muito fácil", 9, "Regular", C.blueDark, '_label');
  const seqRow = mkRatingRow('seq_nota', null, 7);
  seqCard.appendChild(seqRow);

  // SUS — 10 afirmações, escala 1-5
  const susHeader = vb(null, 24, 0, null);
  susHeader.layoutAlign = "STRETCH";
  susHeader.paddingTop = 8;
  mainFrame.appendChild(susHeader);
  addT(susHeader, "SUS — System Usability Scale", 12, "Bold", C.text, '_label');
  addT(susHeader, "1 = Discordo totalmente · 5 = Concordo totalmente", 9, "Regular", C.muted, '_label');

  const susGrid = vb(null, 24, 10, null);
  susGrid.layoutAlign = "STRETCH";
  mainFrame.appendChild(susGrid);

  const susDefs = [
    { n: 1, texto: "Eu usaria este sistema com frequência." },
    { n: 2, texto: "Achei o sistema desnecessariamente complexo." },
    { n: 3, texto: "Achei o sistema fácil de usar." },
    { n: 4, texto: "Precisaria de apoio técnico para usar este sistema." },
    { n: 5, texto: "As funções estão bem integradas." },
    { n: 6, texto: "Há muita inconsistência no sistema." },
    { n: 7, texto: "A maioria das pessoas aprenderia a usar rapidamente." },
    { n: 8, texto: "Achei o sistema pesado/confuso de usar." },
    { n: 9, texto: "Me senti confiante usando o sistema." },
    { n: 10, texto: "Precisei aprender muita coisa antes de conseguir usar." }
  ];

  susDefs.forEach(def => {
    const fieldKey = 'sus_' + def.n;
    const row = hb(0, 12, C.bg, 10);
    row.name = 'section/' + fieldKey;
    row.paddingTop = row.paddingBottom = 10;
    row.layoutAlign = "STRETCH";
    row.counterAxisAlignItems = "CENTER";

    const textWrap = vb(null, 0, 0, null);
    textWrap.layoutGrow = 1;
    const label = tx(def.n + ". " + def.texto, 11, "Regular", C.text, '_label');
    label.textAutoResize = "HEIGHT"; label.layoutAlign = "STRETCH";
    textWrap.appendChild(label);
    row.appendChild(textWrap);

    row.appendChild(mkRatingRow(fieldKey, null, 5));
    susGrid.appendChild(row);
  });

  const scoreCard = vb(null, 16, 6, C.greenLight, 12);
  scoreCard.layoutAlign = "STRETCH";
  scoreCard.paddingTop = scoreCard.paddingBottom = 16;
  mainFrame.appendChild(scoreCard);
  addT(scoreCard, "SUS Score calculado (0-100)", 10, "Bold", C.green, '_label');
  mkField(scoreCard, 'sus_score', "Calcule: some (valor-1) das ímpares + (5-valor) das pares, ×2.5", 11, C.white);

  const notesCard = vb(null, 16, 6, C.bg, 12);
  notesCard.layoutAlign = "STRETCH";
  notesCard.paddingTop = notesCard.paddingBottom = 16;
  mainFrame.appendChild(notesCard);
  addT(notesCard, "Notas sobre a coleta", 10, "Bold", C.muted, '_label');
  mkField(notesCard, 'notas', "Contexto da coleta, participante, observações...", 11, C.white);

  mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
