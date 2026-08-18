// ============================================================
// canvas/builders/personas.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "personas" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(800, 0, 0, { r:0.961, g:0.98, b:0.992 }, 16);
    mainFrame.name = "Painel de Personas";
    const hdr = mkHeader("Painel de Personas");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const body = vb(null, 40, 24, null);
    mainFrame.appendChild(body);
    body.layoutAlign = "STRETCH";

    const infoRow = hb(0, 16, null);
    infoRow.counterAxisAlignItems = "CENTER";
    const pic = rct(48, 48, C.blue, 24);
    infoRow.appendChild(pic);
    const nameCol = vb(null, 0, 4, null);
    nameCol.name = 'section/identificacao';
    nameCol.appendChild(tx("Perfil 1 - Nome do Perfil", 18, "Bold", C.blueDark, 'field/nome'));
    nameCol.appendChild(tx("Breve descrição do perfil", 12, "Regular", C.muted, 'field/descricao'));
    infoRow.appendChild(nameCol);
    body.appendChild(infoRow);

    const sep1 = rct(720, 1, C.blueLight);
    body.appendChild(sep1);
    sep1.layoutAlign = "STRETCH";

    const detailsRow = hb(0, 32, null);
    detailsRow.counterAxisAlignItems = "MIN";
    const photo = rct(160, 200, C.blue, 12);
    detailsRow.appendChild(photo);

    const dataCol = vb(null, 0, 16, null);
    dataCol.name = 'section/dados-demograficos';
    const addData = (l, v, fieldId) => {
      const r = hb(0, 8, null);
      r.name = 'section/' + fieldId;
      r.appendChild(tx(l + ":", 14, "Bold", C.blueDark, '_label'));
      r.appendChild(tx(v, 14, "Regular", C.text, 'field/' + fieldId));
      dataCol.appendChild(r);
    };
    addData("Nome",        "Um nome (opcional)",                             "demographics-1");
    addData("Idade",       "Idade média do perfil",                          "demographics-2");
    addData("Ocupação",    "Trabalho / meio de trabalho",                    "demographics-3");
    addData("Renda",       "Renda média",                                    "demographics-4");
    addData("Escolaridade","Educação formal",                                 "demographics-5");
    detailsRow.appendChild(dataCol);
    body.appendChild(detailsRow);

    const colsRow = hb(0, 32, null);
    colsRow.layoutAlign = "STRETCH";

    colsRow.counterAxisAlignItems = "STRETCH";

    const col1 = vb(null, 20, 12, C.blueLight, 12);
    col1.name = 'section/goals';
    col1.layoutAlign = "STRETCH";
    col1.layoutGrow = 1;
    col1.paddingTop = col1.paddingBottom = 20;
    col1.appendChild(tx("Objetivos", 16, "Bold", C.blueDark, '_label'));
    const objT = tx("Listar objetivos relacionados ao produto...", 13, "Regular", C.text, 'field/goals');
    col1.appendChild(objT);
    objT.textAutoResize = "HEIGHT"; objT.layoutAlign = "STRETCH";
    colsRow.appendChild(col1);
    col1.layoutSizingVertical = "FILL";

    const col2 = vb(null, 20, 12, C.blueLight, 12);
    col2.name = 'section/needs';
    col2.layoutAlign = "STRETCH";
    col2.layoutGrow = 1;
    col2.paddingTop = col2.paddingBottom = 20;
    col2.appendChild(tx("Necessidade", 16, "Bold", C.blueDark, '_label'));
    const necT = tx("Listar necessidades e dores para identificar oportunidades.", 13, "Regular", C.text, 'field/needs');
    col2.appendChild(necT);
    necT.textAutoResize = "HEIGHT"; necT.layoutAlign = "STRETCH";
    colsRow.appendChild(col2);
    col2.layoutSizingVertical = "FILL";

    const col3 = vb(null, 20, 12, { r:1, g:0.945, b:0.945 }, 12);
    col3.name = 'section/pain_points';
    col3.layoutAlign = "STRETCH";
    col3.layoutGrow = 1;
    col3.paddingTop = col3.paddingBottom = 20;
    col3.appendChild(tx("Dores", 16, "Bold", C.blueDark, '_label'));
    const painT = tx("Listar dores e frustrações atuais do perfil...", 13, "Regular", C.text, 'field/pain_points');
    col3.appendChild(painT);
    painT.textAutoResize = "HEIGHT"; painT.layoutAlign = "STRETCH";
    colsRow.appendChild(col3);
    col3.layoutSizingVertical = "FILL";
    body.appendChild(colsRow);

    const oppCol = vb(null, 0, 12, null);
    oppCol.name = 'section/opportunities';
    oppCol.layoutAlign = "STRETCH";
    oppCol.appendChild(tx("Oportunidades", 16, "Bold", C.blueDark, '_label'));
    const oppT = tx("Liste oportunidades de produto relacionadas às sessões anteriores.", 13, "Regular", C.text, 'field/opportunities');
    oppCol.appendChild(oppT);
    oppT.textAutoResize = "HEIGHT"; oppT.layoutAlign = "STRETCH";
    body.appendChild(oppCol);

    const sep2 = rct(720, 1, C.blueLight);
    body.appendChild(sep2);
    sep2.layoutAlign = "STRETCH";

    const obsCol = vb(null, 0, 12, null);
    obsCol.name = 'section/notes';
    obsCol.layoutAlign = "STRETCH";
    obsCol.appendChild(tx("Observações adicionais", 14, "Bold", C.blueDark, '_label'));
    const obsT = tx("Observações de hipóteses descobertas em análise de dados internos e externos.", 13, "Regular", C.text, 'field/notes');
    obsCol.appendChild(obsT);
    obsT.textAutoResize = "HEIGHT"; obsT.layoutAlign = "STRETCH";
    body.appendChild(obsCol);

  return mainFrame;
}

module.exports = { build };
