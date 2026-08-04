// ============================================================
// canvas/builders/golden-circle.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "golden-circle" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(700, 0, 0, C.white, 16);
    mainFrame.name = "Golden Circle";
    const hdr = mkHeader("Golden Circle — Simon Sinek");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const canvas = figma.createFrame();
    canvas.resize(700, 640);
    canvas.fills = [{ type: "SOLID", color: C.white }];
    canvas.layoutAlign = "STRETCH";
    mainFrame.appendChild(canvas);

    const cx = 350, cy = 320;

    // WHAT — outer (blue light)
    const whatE = ell(560, 560, C.blueLight, C.blue, 2);
    whatE.x = cx - 280; whatE.y = cy - 280; canvas.appendChild(whatE);

    // HOW — middle (orange light)
    const howE = ell(380, 380, { r:1, g:0.929, b:0.878 }, C.orange, 2);
    howE.x = cx - 190; howE.y = cy - 190; canvas.appendChild(howE);

    // WHY — inner (deep blue)
    const whyE = ell(200, 200, C.bgBlue, C.blue, 2.5);
    whyE.x = cx - 100; whyE.y = cy - 100; canvas.appendChild(whyE);

    // Inner labels
    const addCL = (t, sub, x, y, tc, sc) => {
      const tN = tx(t, 14, "Bold", tc); tN.x = x; tN.y = y; canvas.appendChild(tN);
      const sN = tx(sub, 10, "Regular", sc); sN.x = x; sN.y = y + 20; canvas.appendChild(sN);
    };
    addCL("POR QUÊ?",   "Propósito / Crença",      cx - 46,  cy - 24,  C.blueDark, C.muted);
    addCL("COMO?",      "Processo / Valores",       cx - 34,  cy - 175, C.orange,   C.muted);
    addCL("O QUÊ?",     "Produto / Serviço",        cx - 30,  cy - 263, C.blue,     C.muted);

    // Callout boxes
    const addBox = (title, prompt, x, y, strokeC, fieldId) => {
      const box = vb(180, 12, 4, { r:0.97, g:0.98, b:0.99 }, 10);
      box.name = 'section/' + fieldId;
      box.paddingTop = box.paddingBottom = 12;
      box.strokes = [{ type: "SOLID", color: strokeC }]; box.strokeWeight = 1.5;
      const t = tx(title, 12, "Bold", strokeC, '_label');
      t.textAutoResize = "HEIGHT"; t.layoutAlign = "STRETCH"; box.appendChild(t);
      const p = tx(prompt, 11, "Regular", C.muted, 'field/' + fieldId);
      p.textAutoResize = "HEIGHT"; p.layoutAlign = "STRETCH"; box.appendChild(p);
      box.x = x; box.y = y; canvas.appendChild(box);
    };
    addBox("Por quê existimos?",   "Nosso propósito e crença central...", 20,  270, C.blue,   'why');
    addBox("Como fazemos?",        "Nossos processos e princípios...",    490, 190, C.orange, 'how');
    addBox("O que entregamos?",    "Nossos produtos e serviços...",       490, 390, C.blue,   'what');

  return mainFrame;
}

module.exports = { build };
