// ============================================================
// canvas/fill.js — Preenchimento de framework via formulário do
// plugin (AMUX)
// Escreve valores digitados na UI diretamente nos nós field/<id>
// de um frame já injetado no canvas, sem exigir que o usuário
// clique em cada texto no Figma manualmente. Depende da normalização
// de field/<id> feita nos builders (canvas/builders/*.js) — cada
// chave em `values` deve corresponder a um nome de nó field/<chave>
// (ou field/<chave>-N para campos multi-nó; nesse caso todos os nós
// com esse prefixo recebem o mesmo valor).
// ============================================================

// fillFrameworkFields(instanceId, values) → { ok, filled, missing }
async function fillFrameworkFields(instanceId, values) {
  const node = await figma.getNodeByIdAsync(instanceId);
  if (!node || node.removed) {
    return { ok: false, error: 'not-found' };
  }

  for (const font of [
    { family: "Inter", style: "Regular" },
    { family: "Inter", style: "Medium" },
    { family: "Inter", style: "Bold" }
  ]) {
    try { await figma.loadFontAsync(font); } catch (e) {}
  }

  const fieldNodes = node.findAll(n => n.type === 'TEXT' && n.name.startsWith('field/'));
  const filled = [];
  const missing = [];

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;

    // Match exato (field/<key>) ou multi-nó (field/<key>-N) — todos os
    // nós com esse prefixo recebem o mesmo valor.
    const targets = fieldNodes.filter(n => {
      const name = n.name.slice('field/'.length);
      return name === key || name.startsWith(key + '-');
    });

    if (targets.length === 0) {
      missing.push(key);
      continue;
    }

    for (const target of targets) {
      try {
        await figma.loadFontAsync(target.fontName);
      } catch (e) {}
      target.characters = String(value);
      filled.push(key);

      // O texto inicial do nó é sempre o placeholder do builder (cor
      // apagada/muted, ver canvas/kit.js) — ao gravar um valor real aqui,
      // restauramos a cor de texto normal, senão o valor preenchido
      // continua com a mesma aparência visual de "ainda vazio".
      target.fills = [{ type: 'SOLID', color: { r: 0.118, g: 0.161, b: 0.231 } }];

      // Campos de escala (mkRatingRow, ver canvas/kit.js) guardam o
      // valor num nó field/<id> 1x1 dentro da própria linha _rating —
      // repintar as caixas _rating-box-1..5 aqui é o que mantém o
      // destaque visual em sincronia com o valor salvo via formulário
      // (sem isso, a nota mudaria no dado mas não no canvas).
      const ratingRow = target.parent;
      if (ratingRow && ratingRow.name === '_rating') {
        const n = parseInt(value, 10);
        for (const box of ratingRow.children) {
          if (!box.name || !box.name.startsWith('_rating-box-')) continue;
          const boxN = parseInt(box.name.slice('_rating-box-'.length), 10);
          const isSel = boxN === n;
          box.fills = [{ type: 'SOLID', color: isSel ? { r: 0, g: 0.439, b: 0.686 } : { r: 0.941, g: 0.953, b: 0.969 } }];
          const label = box.children.find(c => c.type === 'TEXT');
          if (label) {
            try { await figma.loadFontAsync(label.fontName); } catch (e) {}
            label.fills = [{ type: 'SOLID', color: isSel ? { r: 1, g: 1, b: 1 } : { r: 0.392, g: 0.455, b: 0.545 } }];
          }
        }
      }
    }
  }

  return { ok: true, filled: [...new Set(filled)], missing };
}

module.exports = { fillFrameworkFields };
