// ============================================================
// canvas/builders/post-launch-tracker.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "post-launch-tracker" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(640, 48, 0, C.white, 16);
    mainFrame.name = "Painel de Acompanhamento Pós-lançamento";
    const hdr = mkHeader("Acompanhamento Pós-lançamento");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";
    mainFrame.appendChild(sp(20));

    const section = (header, body, fieldId) => {
      mainFrame.appendChild(sp(14));
      addT(mainFrame, header, 14, "Bold", C.green, '_label');
      if (body) {
        mainFrame.appendChild(sp(4));
        addT(mainFrame, body, 12, "Regular", C.muted, fieldId ? 'field/' + fieldId : undefined);
      }
    };

    section("Métrica em produção observada",  "Ex: taxa de conclusão, chamados de suporte, NPS.", "metrica_producao");
    section("Período observado",               "Ex: 30/60/90 dias após o lançamento.", "periodo_observado");
    section("Canal de feedback monitorado",    "Ex: pesquisa de satisfação, analytics, suporte.", "canal_feedback");
    section("Ação/ajuste decorrente",           "O que o time fez a partir do que foi observado.", "acao_decorrente");
    section("Próximo ciclo de revisão",         "Quando o time volta a olhar essas métricas.", "proximo_ciclo");
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
