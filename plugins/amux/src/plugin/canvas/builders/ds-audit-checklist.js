// ============================================================
// canvas/builders/ds-audit-checklist.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "ds-audit-checklist" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(640, 48, 0, C.white, 16);
    mainFrame.name = "Checklist de Auditoria DSC";
    const hdr = mkHeader("Checklist de Auditoria DSC");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";
    mainFrame.appendChild(sp(20));

    const section = (header, body, fieldId) => {
      mainFrame.appendChild(sp(14));
      addT(mainFrame, header, 14, "Bold", C.blue, '_label');
      if (body) {
        mainFrame.appendChild(sp(4));
        addT(mainFrame, body, 12, "Regular", C.muted, fieldId ? 'field/' + fieldId : undefined);
      }
    };

    section("Lib DSC de referência",                 "Ex: Fundamentos Visuais, Web (Angular/React)...", "lib_referencia");
    section("Componentes do DSC usados",              "Liste os componentes do Design System aplicados neste projeto.", "componentes_usados");
    section("Componentes customizados / fora do DSC", "O que fugiu do padrão e precisou de customização.", "componentes_customizados");
    section("Justificativa dos desvios",              "Por que os desvios acima foram necessários.", "justificativa_desvio");
    section("Tokens de cor/tipografia verificados",   "Quais tokens (cores, fontes, espaçamentos) foram checados.", "tokens_verificados");
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
