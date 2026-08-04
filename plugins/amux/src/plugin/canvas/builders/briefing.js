// ============================================================
// canvas/builders/briefing.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "briefing" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(700, 48, 0, C.white, 16);
    mainFrame.name = "Briefing Estruturado";
    const hdr = mkHeader("Briefing Estruturado");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";
    mainFrame.appendChild(sp(20));

    const fieldRow = (label, val, fieldId) => {
      const row = hb(0, 6, null);
      row.name = 'section/' + (fieldId || '_row');
      row.counterAxisAlignItems = "MIN";
      row.appendChild(tx(label + "  ", 13, "Bold", C.blue, '_label'));
      row.appendChild(tx(val, 13, "Regular", C.text, fieldId ? 'field/' + fieldId : undefined));
      mainFrame.appendChild(row);
      mainFrame.appendChild(sp(4));
    };

    const section = (header, body, sub, fieldId) => {
      mainFrame.appendChild(sp(sub ? 4 : 14));
      addT(mainFrame, header, sub ? 12 : 14, "Bold", sub ? C.orange : C.blue, '_label');
      if (body) {
        mainFrame.appendChild(sp(4));
        addT(mainFrame, body, 12, "Regular", C.muted, fieldId ? 'field/' + fieldId : undefined);
      }
    };

    fieldRow("Nome do Projeto:", "Nome do projeto",  "nome");
    fieldRow("Data de Início:",  "00/00/00",          "data-inicio");
    mainFrame.appendChild(sp(12));
    const sep = rct(604, 1, C.line); sep.name = '_divider'; mainFrame.appendChild(sep);

    section("Contexto",                      "Descreva o contexto atual do projeto e por que ele está sendo demandado.", false, "context");
    section("Resultados-chave",              "Como o sucesso do projeto será medido?",                                   false, "objectives");
    section("Atores e usuários",             "Quem é o público deste projeto?",                                          false, "actors");
    section("Stakeholders e equipe",         "Quem faz parte da equipe e quem valida as decisões.",                     false, "stakeholders");
    section("Escopo");
    section("Está no escopo",               "O que precisa ser trabalhado e por que.",                                   true,  "in_scope");
    section("Pode estar no escopo",         "O que depende de outros fatores para entrar.",                              true,  "maybe_scope");
    section("Não está no escopo",           "Limitações técnicas ou escopo excluído explicitamente.",                   true,  "out_scope");
    section("Dependências",                  "Outras áreas com conhecimento sobre parte do projeto.",                    false, "dependencies");
    section("Riscos",                        "O que pode atrapalhar o sucesso? O que acontece se não atingirmos as metas?", false, "risks");
    section("Tempo",                         "Roadmaps, prazos, sprints necessárias.",                                  false, "deadline");
    section("Organização do trabalho");
    section("Rotina da equipe",             "Reuniões diárias? Sprint? Retrô?",                                          true,  "team_routine");
    section("Comunicação",                   "Exemplo: reuniões por email, feitas pelo Teams.",                          true,  "communication");
    section("Compartilhamento de dados",    "Softwares, pastas, formatos de arquivos.",                                  true,  "data_sharing");
    section("Notas adicionais",              "Notas aqui.",                                                               false, "notes");
    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
