// ============================================================
// canvas/builders/journey-versioning.js — gerado a partir de code.js (extração
// automática). Constrói o frame do framework "journey-versioning" no canvas.
// ============================================================

function build(kit, ts) {
  const { C, tx, vb, hb, addT, mkField, sp, rct, ell, mkLogo, mkHeader } = kit;
  let mainFrame = null;

    mainFrame = vb(1400, 0, 0, { r:0.941, g:0.965, b:0.976 }, 16);
    mainFrame.name = "Versionamento de Jornadas";
    const hdr = mkHeader("Versionamento de Jornadas — Atual × Proposta");
    mainFrame.appendChild(hdr);
    hdr.layoutAlign = "STRETCH";

    const body = hb(24, 20, null);
    body.layoutAlign = "STRETCH";
    body.counterAxisAlignItems = "MIN";
    mainFrame.appendChild(body);

    // Left column: row labels
    const labelCol = vb(180, 0, 12, null);
    body.appendChild(labelCol);

    const rowLabels = ["Etapa", "Ação do Usuário", "Emoção / Sentimento", "Dores / Problemas", "Oportunidades", "Observações"];
    const rowHeights = [80, 100, 80, 100, 100, 80];

    const mkTopBadge = (label) => {
      const b = vb(180, 12, 0, C.white, 10);
      b.name = 'section/stages';
      b.counterAxisSizingMode = "FIXED"; b.resize(180, 80);
      b.primaryAxisSizingMode = "FIXED";
      b.counterAxisAlignItems = "CENTER";
      const t = tx(label, 12, "Bold", C.text, '_label');
      t.textAlignHorizontal = "CENTER";
      t.textAutoResize = "HEIGHT"; t.layoutAlign = "STRETCH";
      b.appendChild(t);
      const ph = tx("Nomeie as etapas da jornada...", 10, "Regular", C.light, 'field/stages');
      ph.textAlignHorizontal = "CENTER";
      ph.textAutoResize = "HEIGHT"; ph.layoutAlign = "STRETCH";
      b.appendChild(ph);
      return b;
    };
    labelCol.appendChild(mkTopBadge("Eixo da Jornada"));
    rowLabels.slice(1).forEach((rl, i) => {
      const b = vb(180, 12, 0, C.white, 10);
      b.counterAxisSizingMode = "FIXED"; b.resize(180, rowHeights[i + 1]);
      b.primaryAxisSizingMode = "FIXED";
      b.counterAxisAlignItems = "CENTER";
      const t = tx(rl, 12, "Bold", C.muted);
      t.textAlignHorizontal = "CENTER";
      t.textAutoResize = "HEIGHT"; t.layoutAlign = "STRETCH";
      b.appendChild(t);
      labelCol.appendChild(b);
    });

    // Version columns
    const versions = [
      { label: "v1.0 — Jornada Atual",     badge: C.muted,   bg: C.bg },
      { label: "v2.0 — Jornada Proposta",  badge: C.blue,    bg: C.blueLight },
      { label: "v3.0 — Visão Futura",      badge: C.teal,    bg: C.tealLight },
    ];

    const verKeys = ['v1', 'v2', 'v3'];
    // rowFieldKeys por versão — casa com fields[] de journey-versioning no JSON:
    // v1_actions/v1_pains e v2_actions/v2_improved são os campos "canônicos" do
    // framework; os demais (emotion/opportunities/notes por versão, e a versão v3
    // inteira) são conteúdo real do canvas que não existia no JSON original e foi
    // adicionado para não perder dado ao normalizar os nomes dos nós.
    const rowFieldKeysByVersion = {
      v1: ['v1_actions', 'v1_emotion', 'v1_pains', 'v1_opportunities', 'v1_notes'],
      v2: ['v2_actions', 'v2_emotion', 'v2_pains', 'v2_improved', 'v2_notes'],
      v3: ['v3_actions', 'v3_emotion', 'v3_pains', 'v3_improved', 'delta'],
    };
    versions.forEach((ver, vi) => {
      const vKey = verKeys[vi];
      const col = vb(360, 0, 12, null);
      col.name = 'section/' + vKey;
      body.appendChild(col);

      const badge = vb(null, 12, 0, ver.badge, 10);
      badge.name = '_header';
      badge.layoutAlign = "STRETCH";
      badge.counterAxisSizingMode = "AUTO";
      badge.primaryAxisSizingMode = "AUTO";
      badge.paddingTop = badge.paddingBottom = 12;
      badge.counterAxisAlignItems = "CENTER";
      const badgeT = tx(ver.label, 13, "Bold", C.white, '_label');
      badgeT.textAlignHorizontal = "CENTER";
      badgeT.layoutAlign = "STRETCH"; badgeT.textAutoResize = "HEIGHT";
      badge.appendChild(badgeT);
      col.appendChild(badge);

      const rowFieldKeys = rowFieldKeysByVersion[vKey];
      rowLabels.slice(1).forEach((_, i) => {
        const fieldId = rowFieldKeys[i];
        const cell = vb(null, 12, 4, ver.bg, 8);
        cell.name = 'section/' + fieldId;
        cell.layoutAlign = "STRETCH";
        cell.counterAxisSizingMode = "FIXED"; cell.resize(360, rowHeights[i + 1]);
        cell.primaryAxisSizingMode = "FIXED";
        const ph = tx("Descreva aqui...", 11, "Regular", C.light, 'field/' + fieldId);
        ph.textAutoResize = "HEIGHT"; ph.layoutAlign = "STRETCH";
        cell.appendChild(ph);
        col.appendChild(cell);
      });
    });

    mainFrame.appendChild(sp(8));

  return mainFrame;
}

module.exports = { build };
