// ============================================================
// canvas/builders/stakeholders.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "stakeholders" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(780, 0, 0, C.white, 16);
    mainFrame.name = "Mapa de Stakeholders";
    const hdr = mkHeader("Mapa de Stakeholders — Poder × Interesse");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const canvas = figma.createFrame();
    canvas.resize(780, 640);
    canvas.fills = [{ type: "SOLID", color: C.white }];
    canvas.layoutAlign = "STRETCH";
    mainFrame.appendChild(canvas);

    const ox = 110, oy = 30, qw = 300, qh = 260;

    // Quadrant backgrounds
    const q = (x, y, fill) => { const r = rct(qw, qh, fill); r.x = x; r.y = y; canvas.appendChild(r); };
    q(ox,       oy,       C.greenLight);                         // TL: Manter Satisfeito
    q(ox + qw,  oy,       C.tealLight);                          // TR: Gerenciar de Perto
    q(ox,       oy + qh,  C.bg);                                 // BL: Monitorar
    q(ox + qw,  oy + qh,  { r:1, g:0.980, b:0.929 });           // BR: Manter Informado

    // Quadrant label helper
    const ql = (txt, x, y, col) => { const t = tx(txt, 10, "Bold", col); t.x = x; t.y = y; canvas.appendChild(t); };
    ql("MANTER SATISFEITO",  ox + 10,       oy + 10,       C.green);
    ql("GERENCIAR DE PERTO", ox + qw + 10,  oy + 10,       C.teal);
    ql("MONITORAR",          ox + 10,       oy + qh + 10,  C.muted);
    ql("MANTER INFORMADO",   ox + qw + 10,  oy + qh + 10,  C.amber);

    // Axes
    const yAx = rct(2, qh * 2 + 20, C.text); yAx.x = ox - 1; yAx.y = oy - 10; canvas.appendChild(yAx);
    const xAx = rct(qw * 2 + 20, 2, C.text); xAx.x = ox - 10; xAx.y = oy + qh * 2 + 1; canvas.appendChild(xAx);

    // Axis labels
    const yLbl = tx("PODER / INFLUÊNCIA  ↑", 10, "Bold", C.text);
    yLbl.x = 14; yLbl.y = oy + qh + 20; yLbl.rotation = -90; canvas.appendChild(yLbl);
    const xLbl = tx("INTERESSE / IMPACTO  →", 10, "Bold", C.text);
    xLbl.x = ox + qw - 50; xLbl.y = oy + qh * 2 + 14; canvas.appendChild(xLbl);

    // Low/High labels on axes
    const axL = (t, x, y) => { const n = tx(t, 9, "Regular", C.muted); n.x = x; n.y = y; canvas.appendChild(n); };
    axL("Baixo", ox - 36, oy + qh * 2 - 14);
    axL("Alto",  ox + qw * 2 - 24, oy + qh * 2 - 14);
    axL("Baixo", ox - 60, oy + qh * 2 - 14);
    axL("Alto",  ox - 50, oy + 4);

    // Sample sticky notes — nomeadas pelo id fixo da categoria (quadrante),
    // não por um slug do texto de exemplo, para casar com fields[] do JSON.
    const stickyCounters = {};
    const sticky = (categoryId, name, role, x, y, bg) => {
      const idx = (stickyCounters[categoryId] = (stickyCounters[categoryId] || 0) + 1);
      const key = categoryId + '-' + idx;
      const s = rct(110, 72, bg, 6); s.name = 'section/' + key; s.x = x; s.y = y; canvas.appendChild(s);
      const t = tx(name, 10, "Bold", C.text, 'field/' + key); t.x = x + 8; t.y = y + 8; canvas.appendChild(t);
      const d = tx(role, 9, "Regular", C.muted, 'field/' + key + '-role'); d.x = x + 8; d.y = y + 24; canvas.appendChild(d);
    };
    sticky("manage_closely",  "Patrocinador",  "Decide o orçamento",  ox + qw + 60,  oy + 50,       { r:0.729, g:0.953, b:0.929 });
    sticky("manage_closely",  "Gestor de TI",  "Aprova tecnologia",   ox + qw + 170, oy + 140,      { r:0.729, g:0.953, b:0.929 });
    sticky("keep_satisfied",  "Área Jurídica", "Valida compliance",   ox + 40,       oy + 50,       { r:0.749, g:0.953, b:0.749 });
    sticky("keep_informed",   "Usuário Final", "Usa o produto",       ox + qw + 60,  oy + qh + 60,  { r:1, g:0.937, b:0.698 });
    sticky("monitor",         "Comunicação",   "Informada sobre",     ox + 60,       oy + qh + 140, { r:0.94, g:0.95, b:0.96 });

  return mainFrame;
}

module.exports = { build };
