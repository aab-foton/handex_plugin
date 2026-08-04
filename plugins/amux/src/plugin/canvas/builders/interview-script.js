// ============================================================
// canvas/builders/interview-script.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "interview-script" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(800, 0, 0, C.white, 16);
    mainFrame.name = "Roteiro de Entrevistas";
    const hdr = mkHeader("Tag - Nome do Projeto");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const body = vb(null, 40, 24, null);
    mainFrame.appendChild(body);
    body.layoutAlign = "STRETCH";

    body.appendChild(tx("Roteiro de Entrevistas", 24, "Bold", C.blueDark));

    const objSec = vb(null, 0, 8, null);
    objSec.name = 'section/objective';
    objSec.layoutAlign = "STRETCH";
    objSec.appendChild(tx("Objetivo da entrevista", 14, "Bold", C.blueDark, '_label'));
    const objD = tx("O que você precisa aprender com essas entrevistas?", 13, "Regular", C.muted, 'field/objective');
    objD.textAutoResize = "HEIGHT"; objD.layoutAlign = "STRETCH";
    objSec.appendChild(objD);
    body.appendChild(objSec);
    const sep0 = rct(720, 1, C.line); sep0.name = '_divider'; body.appendChild(sep0); sep0.layoutAlign = "STRETCH";

    const addSec = (titleStr, descStr, isTitle, fieldId) => {
      const sec = vb(null, 0, 8, null);
      sec.name = fieldId ? 'section/' + fieldId : '_section';
      sec.layoutAlign = "STRETCH";
      sec.appendChild(tx(titleStr, isTitle ? 18 : 14, "Bold", isTitle ? C.blueDark : C.text, '_label'));
      const d = tx(descStr, 13, "Regular", C.muted, fieldId ? 'field/' + fieldId : undefined);
      sec.appendChild(d);
      d.textAutoResize = "HEIGHT"; d.layoutAlign = "STRETCH";
      body.appendChild(sec);
    };

    addSec("1. Introdução e Aquecimento", "Apresente-se, explique o objetivo e peça consentimento para gravar. Perguntas de aquecimento...", true, "warmup-1");
    addSec("Perguntas sugeridas:", "- Como é um dia típico de trabalho?\n- Quais ferramentas você mais utiliza hoje?", false, "warmup-2");
    const sep1 = rct(720, 1, C.line); sep1.name = '_divider'; body.appendChild(sep1); sep1.layoutAlign = "STRETCH";

    addSec("2. Descoberta e Contexto", "Entenda como o usuário lida com o problema hoje, antes de apresentar qualquer solução.", true, "discovery-1");
    addSec("Perguntas sugeridas:", "- Me conte sobre a última vez que precisou realizar [tarefa].\n- O que foi mais difícil?\n- Como você contorna esse problema hoje?", false, "discovery-2");
    const sep2 = rct(720, 1, C.line); sep2.name = '_divider'; body.appendChild(sep2); sep2.layoutAlign = "STRETCH";

    addSec("3. Aprofundamento / Protótipo", "Caso haja protótipo, apresente agora. Peça para o usuário pensar em voz alta.", true, "deepening-1");
    addSec("Perguntas sugeridas:", "- O que você acha que essa tela faz?\n- Onde você clicaria para [ação]?\n- O que esperava que acontecesse ao clicar?", false, "deepening-2");
    const sep3 = rct(720, 1, C.line); sep3.name = '_divider'; body.appendChild(sep3); sep3.layoutAlign = "STRETCH";

    addSec("4. Encerramento", "Abra espaço para considerações finais e agradeça.", true, "closing-1");
    addSec("Perguntas sugeridas:", "- Há algo que não perguntei e que gostaria de comentar?\n- Como resumiria essa experiência?", false, "closing-2");

  return mainFrame;
}

module.exports = { build };
