// ============================================================
// canvas/builders/journey.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "journey" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(1000, 0, 0, { r:0.941, g:0.965, b:0.976 }, 16);
    mainFrame.name = "Jornada de Usuário";
    const hdr = mkHeader("Jornada de Usuário");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const body = hb(24, 24, null);
    mainFrame.appendChild(body);
    body.layoutAlign = "STRETCH";

    const leftCol = vb(220, 0, 12, null);
    body.appendChild(leftCol);

    const mkL = (title, sub, h) => {
      const b = vb(220, 16, 4, C.white, 8);
      if (h) {
        b.counterAxisSizingMode = "FIXED";
        b.resize(220, h);
        b.primaryAxisSizingMode = "FIXED";
      }
      b.appendChild(tx(title, 16, "Bold", C.text));
      if (sub) b.appendChild(tx(sub, 12, "Regular", C.muted));
      return b;
    };

    leftCol.appendChild(mkL("Jornada", "Etapas da jornada"));
    leftCol.appendChild(mkL("Passos", "O que faz..."));
    leftCol.appendChild(mkL("Pensa e fala", "O que pensa e fala..."));
    leftCol.appendChild(mkL("Sentimentos", ""));
    leftCol.appendChild(mkL("Dores", ""));
    leftCol.appendChild(mkL("Oportunidades", ""));
    leftCol.appendChild(mkL("Experiência", "", 240));

    const rightCol = hb(0, 12, null);
    body.appendChild(rightCol);
    rightCol.layoutAlign = "STRETCH";

    for (let i = 1; i <= 2; i++) {
      const col = vb(330, 0, 12, null);
      col.layoutAlign = "STRETCH";

      const eTop = vb(null, 16, 4, { r:0.2, g:0.8, b:0.96 }, 8);
      eTop.name = 'section/stages-' + i;
      eTop.layoutAlign = "STRETCH";
      eTop.appendChild(tx(i + ". Nome da Etapa", 16, "Bold", C.blueDark, 'field/stages-' + i));
      eTop.appendChild(tx("Descrição da etapa", 12, "Regular", C.blueDark, '_label'));
      col.appendChild(eTop);

      const mkr = (val, h) => {
        const b = vb(null, 16, 4, C.white, 8);
        b.layoutAlign = "STRETCH";
        if (h) {
          b.counterAxisSizingMode = "FIXED";
          b.resize(330, h);
          b.primaryAxisSizingMode = "FIXED";
        }
        b.appendChild(tx(val, 13, "Regular", C.text));
        return b;
      };

      const mkrNamed = (val, fieldId) => {
        const b = mkr(val);
        b.name = 'section/' + fieldId;
        const ch = b.children[0];
        if (ch && ch.type === 'TEXT') {
          ch.name = 'field/' + fieldId;
          // tx() só grava o placeholder (maturai_placeholder) quando o
          // nome field/<id> já é conhecido no momento da chamada — aqui
          // o nome é atribuído depois, então gravamos manualmente para
          // que fill.js/scan.js reconheçam "Passo 1" etc. como o texto
          // padrão (não preenchido), não como dado real do usuário.
          ch.setPluginData('maturai_placeholder', val);
        }
        return b;
      };

      const wS = vb(null, 0, 8, null); wS.name = 'section/actions-' + i; wS.layoutAlign = "STRETCH";
      wS.appendChild(mkrNamed("Passo 1", 'actions-' + i + '-1'));
      wS.appendChild(mkrNamed("Passo 2", 'actions-' + i + '-2'));
      col.appendChild(wS);

      const wP = vb(null, 0, 8, null); wP.name = 'section/thoughts-' + i; wP.layoutAlign = "STRETCH";
      wP.appendChild(mkrNamed("Pensamento 1", 'thoughts-' + i + '-1'));
      wP.appendChild(mkrNamed("Pensamento 2", 'thoughts-' + i + '-2'));
      col.appendChild(wP);

      const wF = vb(null, 0, 8, null); wF.name = 'section/feelings-' + i; wF.layoutAlign = "STRETCH";
      wF.appendChild(mkrNamed("Sentimento 1", 'feelings-' + i + '-1'));
      wF.appendChild(mkrNamed("Sentimento 2", 'feelings-' + i + '-2'));
      col.appendChild(wF);

      const wPain = vb(null, 0, 8, null); wPain.name = 'section/pain_points-' + i; wPain.layoutAlign = "STRETCH";
      wPain.appendChild(mkrNamed("Dor 1", 'pain_points-' + i + '-1'));
      wPain.appendChild(mkrNamed("Dor 2", 'pain_points-' + i + '-2'));
      col.appendChild(wPain);

      const wO = vb(null, 0, 8, null); wO.name = 'section/opportunities-' + i; wO.layoutAlign = "STRETCH";
      wO.appendChild(mkrNamed("Oportunidade 1", 'opportunities-' + i + '-1'));
      wO.appendChild(mkrNamed("Oportunidade 2", 'opportunities-' + i + '-2'));
      col.appendChild(wO);

      const expB = vb(null, 16, 4, null, 0);
      expB.name = 'section/experience_curve-' + i;
      expB.layoutAlign = "STRETCH";
      expB.counterAxisSizingMode = "FIXED";
      expB.resize(330, 240);
      expB.primaryAxisSizingMode = "FIXED";
      const line = rct(330, 1, C.muted);
      expB.appendChild(line);
      line.layoutAlign = "STRETCH";
      const expT = tx("Descreva a curva de experiência (altos e baixos emocionais)...", 11, "Regular", C.light, 'field/experience_curve-' + i);
      expT.textAutoResize = "HEIGHT"; expT.layoutAlign = "STRETCH";
      expB.appendChild(expT);
      col.appendChild(expB);

      rightCol.appendChild(col);
    }

  return mainFrame;
}

module.exports = { build };
