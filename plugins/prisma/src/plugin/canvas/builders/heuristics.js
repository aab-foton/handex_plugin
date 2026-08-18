// ============================================================
// canvas/builders/heuristics.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "heuristics" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, mkRatingRow, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(1000, 0, 0, C.white, 16);
    mainFrame.name = "Heurísticas de Nielsen";
    const hdr = mkHeader("Heurísticas de Nielsen — Avaliação de Usabilidade");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const heuDesc = vb(null, 24, 0, null);
    mainFrame.appendChild(heuDesc);
    heuDesc.layoutAlign = "STRETCH";
    heuDesc.paddingBottom = 8;
    addT(heuDesc, "Avalie cada heurística com uma nota de 1 a 5 e registre problemas encontrados.", 11, "Regular", C.muted);

    const hGrid = hb(24, 20, null);
    hGrid.counterAxisAlignItems = "MIN";
    hGrid.layoutAlign = "STRETCH";
    mainFrame.appendChild(hGrid);

    const hCol1 = vb(456, 0, 16, null);
    const hCol2 = vb(456, 0, 16, null);
    hGrid.appendChild(hCol1);
    hGrid.appendChild(hCol2);

    const hDefs = [
      { n: "1", name: "Visibilidade do status",           desc: "O sistema deve sempre manter o usuário informado sobre o que está acontecendo." },
      { n: "2", name: "Correspondência com o mundo real", desc: "O sistema deve falar a linguagem do usuário, com palavras e conceitos familiares." },
      { n: "3", name: "Controle e liberdade do usuário",  desc: "Usuários frequentemente escolhem funções erradas; precisam de saídas de emergência." },
      { n: "4", name: "Consistência e padrões",           desc: "Usuários não devem se questionar se palavras ou ações diferentes significam a mesma coisa." },
      { n: "5", name: "Prevenção de erros",               desc: "Projete com cuidado para prevenir problemas antes de ocorrerem." },
      { n: "6", name: "Reconhecimento em vez de memória", desc: "Minimize a carga de memória do usuário deixando objetos e ações visíveis." },
      { n: "7", name: "Flexibilidade e eficiência",       desc: "Aceleradores permitem que usuários experientes executem ações mais rapidamente." },
      { n: "8", name: "Estética e design minimalista",    desc: "Diálogos não devem conter informação irrelevante ou raramente necessária." },
      { n: "9", name: "Ajuda para reconhecer erros",      desc: "Mensagens de erro devem indicar claramente o problema e sugerir solução." },
      { n:"10", name: "Ajuda e documentação",             desc: "Mesmo sem documentação, pode ser necessário fornecer ajuda facilmente pesquisável." },
    ];

    // ids alinhados 1:1 com fields[] de heuristics no frameworks.json
    const hFieldIds = ['visibility', 'real_world', 'user_control', 'consistency', 'error_prevention', 'recognition', 'flexibility', 'aesthetics', 'error_recovery', 'help_docs'];

    hDefs.forEach((h, i) => {
      const hKey = 'h' + h.n;
      const fieldKey = hFieldIds[i];
      const card = vb(456, 16, 8, C.bg, 12);
      card.name = 'section/' + hKey;
      card.paddingTop = card.paddingBottom = 16;
      card.layoutAlign = "STRETCH";
      const titleRow = hb(0, 8, null);
      titleRow.name = '_title-row';
      const badge = vb(null, 6, 0, C.blue, 6);
      badge.name = '_badge';
      badge.paddingTop = badge.paddingBottom = 4;
      badge.paddingLeft = badge.paddingRight = 8;
      badge.appendChild(tx(h.n, 10, "Bold", C.white, '_num'));
      titleRow.appendChild(badge);
      titleRow.appendChild(tx(h.name, 12, "Bold", C.text, '_label'));
      card.appendChild(titleRow);
      const dT = tx(h.desc, 10, "Regular", C.muted, '_desc');
      dT.textAutoResize = "HEIGHT"; dT.layoutAlign = "STRETCH";
      card.appendChild(dT);
      const ratingLabel = tx("Severidade:", 10, "Bold", C.muted, '_label');
      card.appendChild(ratingLabel);
      const rRow = mkRatingRow(fieldKey); card.appendChild(rRow);
      const obsT = tx("Observações e problemas encontrados...", 10, "Regular", C.light, 'field/' + fieldKey + '-obs');
      obsT.textAutoResize = "HEIGHT"; obsT.layoutAlign = "STRETCH";
      card.appendChild(obsT);
      if (i % 2 === 0) hCol1.appendChild(card);
      else hCol2.appendChild(card);
    });
    mainFrame.appendChild(sp(16));

  return mainFrame;
}

module.exports = { build };
