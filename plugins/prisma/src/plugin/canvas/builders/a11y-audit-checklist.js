// ============================================================
// canvas/builders/a11y-audit-checklist.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "a11y-audit-checklist" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(640, 48, 0, C.white, 16);
    mainFrame.name = "Checklist de Acessibilidade";
    const hdr = mkHeader("Checklist de Acessibilidade");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";
    mainFrame.appendChild(sp(20));

    const section = (header, body, fieldId) => {
      mainFrame.appendChild(sp(14));
      addT(mainFrame, header, 14, "Bold", C.teal, '_label');
      if (body) {
        mainFrame.appendChild(sp(4));
        addT(mainFrame, body, 12, "Regular", C.muted, fieldId ? 'field/' + fieldId : undefined);
      }
    };

    section("Nível WCAG alvo",                              "A, AA ou AAA.", "nivel_wcag_alvo");
    section("Componentes da lib Design Acessível usados",   "Liste os componentes acessíveis aplicados.", "componentes_a11y_usados");
    section("Itens verificados",                             "Contraste, navegação por teclado, leitor de tela, alt-text, etc.", "itens_verificados");
    section("Desvios encontrados",                           "O que não atendeu ao nível alvo e precisa de ajuste.", "desvios_encontrados");
    section("Ferramenta/método de checagem",                "Ex: plugin de contraste, leitor de tela, auditoria externa.", "ferramenta_checagem");
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
