// ============================================================
// HAC — build-a11y-heuristics.cjs (2026-10-06)
//
// Gera refs/a11y-heuristics.generated.json a partir da lib "DSC | Fundamentos
// Visuais" (refs/fundamentos-visuais.json), para o reconhecimento
// DETERMINÍSTICO da seleção manual (dsc-matching.js,
// _resolveManualSpecMatchAndNotify):
//
//   iconKeyPrefixes — prefixo (12 hex) da key de cada componente de ícone da
//     lib. Instância cujo componente principal está aqui = ícone bruto →
//     Elementos Decorativos. 12 caracteres bastam (10 mil keys, sem colisão)
//     e mantêm o bundle pequeno.
//   headingLevels — estilos "heading" da lib, do maior para o menor. A própria
//     lib diz que são usados "de forma sequencial nas tags HTML H1 ao H6", então
//     a ordem de tamanho vira o nível (huge = H1 … tiny = H6). "display" = H1.
//
// Rodado pelo build-skeleton.cjs (e, portanto, pelo refresh semanal do CI).
// ============================================================
const fs = require('fs');
const path = require('path');

const REFS = __dirname;
const SRC = path.join(REFS, 'fundamentos-visuais.json');
const OUT = path.join(REFS, 'a11y-heuristics.generated.json');

function build() {
  if (!fs.existsSync(SRC)) {
    console.warn('⚠  fundamentos-visuais.json ausente — a11y-heuristics não atualizado');
    return;
  }
  const d = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const prefixes = Array.from(new Set((d.components || []).map(c => c && c.key && c.key.slice(0, 12)).filter(Boolean))).sort();

  const typo = (d.styleTokens && d.styleTokens.typography) || [];
  const sizeOf = t => (t.resolved && t.resolved.fontSize) || t.fontSize || null;
  const headingSizes = new Map();
  for (const t of typo) {
    const m = /^heading\s+(\w+)/i.exec(t.name || '');
    if (m && sizeOf(t)) headingSizes.set(m[1].toLowerCase(), sizeOf(t));
  }
  const headingLevels = Array.from(headingSizes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([size, px], i) => ({ name: 'heading ' + size, fontSize: px, level: i + 1 }));

  const out = {
    _meta: {
      generatedAt: new Date().toISOString(),
      source: 'refs/fundamentos-visuais.json (DSC | Fundamentos Visuais)',
      note: 'Gerado por build-a11y-heuristics.cjs — não editar à mão.',
    },
    iconKeyPrefixes: prefixes,
    headingLevels,
  };
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n', 'utf8');
  console.log(`✅ a11y-heuristics.generated.json — ${prefixes.length} ícones, níveis: ${headingLevels.map(h => h.name + '=H' + h.level).join(', ')}`);
}

if (require.main === module) build();
module.exports = { build };
