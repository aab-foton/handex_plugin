// ============================================================
// canvas/builders/relational-map.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "relational-map" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(1040, 0, 0, C.white, 16);
    mainFrame.name = "Mapa Relacional";
    const hdr = mkHeader("Mapa Relacional — Certezas · Hipóteses · Métodos");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const rmDesc = vb(null, 24, 0, null);
    mainFrame.appendChild(rmDesc);
    rmDesc.layoutAlign = "STRETCH";
    rmDesc.paddingBottom = 8;
    addT(rmDesc, "Classifique seus achados por tema e conecte-os aos métodos de pesquisa mais adequados para validação.", 11, "Regular", C.muted);

    const rmBody = hb(24, 20, null);
    rmBody.layoutAlign = "STRETCH";
    mainFrame.appendChild(rmBody);

    const rmThemes = [
      { label: "Tema 1",  sub: "Certezas do time",         color: C.blue,   bg: C.blueLight,             cardBg: { r:0.88, g:0.94, b:1.0  } },
      { label: "Tema 2",  sub: "Suposições a validar",     color: C.amber,  bg: { r:1, g:0.98, b:0.93 }, cardBg: { r:1, g:0.95, b:0.82   } },
      { label: "Tema 3",  sub: "Dúvidas principais",       color: C.red,    bg: { r:1, g:0.95, b:0.95 }, cardBg: { r:1, g:0.88, b:0.88   } },
      { label: "Métodos", sub: "Pesquisa recomendada",     color: C.teal,   bg: C.tealLight,             cardBg: { r:0.80, g:0.96, b:0.94 } },
    ];

    rmThemes.forEach((def, ci) => {
      const rmCol = vb(222, 0, 0, def.bg, 12);
      rmCol.paddingBottom = 0;

      // Column header
      const rmHdr = vb(222, 14, 4, def.color, 0);
      rmHdr.paddingTop = rmHdr.paddingBottom = 14;
      rmHdr.layoutAlign = "STRETCH";
      const rmT = tx(def.label, 13, "Bold", C.white);
      rmT.layoutAlign = "STRETCH"; rmT.textAutoResize = "HEIGHT";
      const rmS = tx(def.sub, 9, "Regular", C.white); rmS.opacity = 0.85;
      rmS.layoutAlign = "STRETCH"; rmS.textAutoResize = "HEIGHT";
      rmHdr.appendChild(rmT); rmHdr.appendChild(rmS);
      rmCol.appendChild(rmHdr);

      // Colunas 0-2 = temas (certezas/suposições/dúvidas) → campo "themes"
      // Coluna 3 = métodos de pesquisa → campo "methods"
      const isMethodsCol = ci === 3;
      const itemFieldBase = isMethodsCol ? 'methods' : 'themes';

      // Small cards (itens individuais)
      for (let k = 0; k < 3; k++) {
        const itemKey = itemFieldBase + '-' + (ci + 1) + '-item-' + (k + 1);
        const rmCard = vb(194, 12, 0, C.white, 6);
        rmCard.name = 'section/' + itemKey;
        rmCard.paddingTop = rmCard.paddingBottom = 10;
        rmCard.layoutAlign = "STRETCH";
        rmCard.strokes = [{ type: "SOLID", color: def.color }]; rmCard.strokeWeight = 0.75;
        const phT = tx("Item " + (k + 1) + " — clique para editar", 10, "Regular", C.light, 'field/' + itemKey);
        phT.textAutoResize = "HEIGHT"; phT.layoutAlign = "STRETCH";
        rmCard.appendChild(phT);
        rmCol.appendChild(rmCard);
      }

      // Grande quadro colorido ao final — área livre para conectar o tema
      // a hipóteses de pesquisa (colunas de tema) ou anotações (coluna de métodos)
      const bigQuadro = figma.createFrame();
      bigQuadro.resize(222, 260);
      bigQuadro.fills = [{ type: "SOLID", color: def.cardBg }];
      bigQuadro.strokes = [{ type: "SOLID", color: def.color }];
      bigQuadro.strokeWeight = 1.5;
      bigQuadro.cornerRadius = 0;
      bigQuadro.layoutAlign = "STRETCH";
      const hypKey = 'hypotheses-' + (ci + 1);
      bigQuadro.name = 'section/' + hypKey;

      const bigT = tx("Área livre", 11, "Bold", def.color);
      bigT.x = 12; bigT.y = 12; bigQuadro.appendChild(bigT);
      const bigS = tx("Adicione itens, stickies\nou conexões aqui...", 10, "Regular", def.color, isMethodsCol ? undefined : 'field/' + hypKey);
      bigS.x = 12; bigS.y = 32; bigS.opacity = 0.65; bigQuadro.appendChild(bigS);
      rmCol.appendChild(bigQuadro);

      rmBody.appendChild(rmCol);
    });
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
