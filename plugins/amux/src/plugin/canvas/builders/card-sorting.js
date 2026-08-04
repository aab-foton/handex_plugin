// ============================================================
// canvas/builders/card-sorting.js — Síntese de Card Sorting (AMUX)
// Não conduz a sessão de card sorting (isso exige uma ferramenta
// dedicada com participantes remotos, ex. Optimal Workshop) — este
// quadro organiza o resultado já coletado, para o time sintetizar
// as categorias e decidir a arquitetura de informação.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

  mainFrame = vb(1040, 0, 0, C.white, 16);
  mainFrame.name = "Síntese de Card Sorting";
  const hdr = mkHeader("Síntese de Card Sorting");
  mainFrame.appendChild(hdr);
  hdr.layoutAlign = "STRETCH";

  const desc = vb(null, 24, 0, null);
  mainFrame.appendChild(desc);
  desc.layoutAlign = "STRETCH";
  desc.paddingBottom = 8;
  addT(desc, "Organize as categorias que emergiram de uma sessão de card sorting conduzida fora do Figma. Este quadro não substitui a condução da sessão, só o registro do resultado.", 11, "Regular", C.muted);

  const metaRow = hb(24, 16, null);
  metaRow.layoutAlign = "STRETCH";
  mainFrame.appendChild(metaRow);
  mkField(metaRow, 'metodo', "Método usado (aberto/fechado/híbrido)...", 12);
  mkField(metaRow, 'qtd_participantes', "Nº de participantes...", 12);

  const catCols = hb(24, 16, null);
  catCols.layoutAlign = "STRETCH";
  mainFrame.appendChild(catCols);

  const catDefs = [
    { theme: "Categoria 1", color: C.teal, bg: C.tealLight },
    { theme: "Categoria 2", color: C.blue, bg: C.blueLight },
    { theme: "Categoria 3", color: C.amber, bg: { r: 1, g: 0.980, b: 0.929 } },
    { theme: "Categoria 4", color: C.green, bg: C.greenLight }
  ];

  catDefs.forEach((def, ci) => {
    const catKey = 'categoria_' + (ci + 1);
    const col = vb(214, 0, 10, def.bg, 12);
    col.name = 'section/' + catKey;
    col.paddingBottom = 16;

    const colHdr = vb(214, 14, 0, def.color, 0);
    colHdr.name = '_header';
    colHdr.paddingTop = colHdr.paddingBottom = 12;
    colHdr.layoutAlign = "STRETCH";
    colHdr.appendChild(tx(def.theme, 13, "Bold", C.white, '_label'));
    col.appendChild(colHdr);

    const itemsWrap = vb(186, 12, 6, null, 0);
    itemsWrap.paddingLeft = itemsWrap.paddingRight = 14;
    itemsWrap.paddingTop = 10;
    itemsWrap.layoutAlign = "STRETCH";
    const itemsT = tx("Itens agrupados aqui, um por linha...", 11, "Regular", C.light, 'field/' + catKey);
    itemsT.textAutoResize = "HEIGHT"; itemsT.layoutAlign = "STRETCH";
    itemsWrap.appendChild(itemsT);
    col.appendChild(itemsWrap);

    catCols.appendChild(col);
  });

  const divRow = vb(null, 24, 8, C.bg, 12);
  divRow.layoutAlign = "STRETCH";
  divRow.paddingTop = divRow.paddingBottom = 16;
  mainFrame.appendChild(divRow);
  addT(divRow, "Divergências entre participantes", 10, "Bold", C.muted, '_label');
  mkField(divRow, 'divergencias', "Onde os participantes discordaram na categorização...", 11, C.white);

  const decisionRow = vb(null, 24, 8, C.blueLight, 12);
  decisionRow.layoutAlign = "STRETCH";
  decisionRow.paddingTop = decisionRow.paddingBottom = 16;
  mainFrame.appendChild(decisionRow);
  addT(decisionRow, "Decisão de arquitetura de informação", 10, "Bold", C.blueDark, '_label');
  mkField(decisionRow, 'decisao_ia', "O que o time decidiu adotar como estrutura final...", 11, C.white);

  mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
