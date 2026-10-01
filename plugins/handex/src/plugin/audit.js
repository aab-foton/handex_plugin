export const frameJsonTemplate = () => ({
  elements: {
    components: [],
    icons: [],
    typography: [],
    frames: [],
    vectors: []
  }
});

export const AUDIT_SCORE = {
  EXACT: 1.0,
  SOFT: 0.5,
  NONE: 0.0
};

function emptyResult() {
  return { score: AUDIT_SCORE.NONE, matchedBy: null, matchedIn: null, matchedTokenName: null, matchedTier: null };
}

// Score-based audit (só por chave, nunca por valor ou nome):
//   1.0 (EXACT) — chave interna do Figma (variável, estilo ou componente) está no skeleton
//   0.0 (NONE)  — chave ausente em todas as libs de referência
//
// Returns: { score, matchedBy: "key"|null, matchedIn: <libName>|null }
// Índice key → { matchedIn, matchedTokenName, tier } de todas as libs de
// referência, construído uma vez por objeto de lista e reaproveitado entre
// chamadas (WeakMap: some junto com a lista). Sem isso, cada propriedade de
// cada nó percorria dezenas de milhares de chaves com find/includes --
// medido em 2026-09-24: ~2s para 4.000 buscas (500 nós × 8 props), rodando
// na thread do documento e congelando o arquivo durante o scan. Com o
// índice: <1ms.
//
// Precedência entre libs quando a MESMA chave aparece em mais de uma
// (2026-09-24, decisão de produto): libs 'priority' (as "Super" -- Super
// DSC | Web e DSC | Super App, cada uma já com tokens próprios por
// plataforma) sempre vencem 'legacy' (Fundamentos Visuais, Web Angular &
// React -- migração em andamento) e 'standalone' (Design Acessível, vertical
// à parte, fora dessa hierarquia). Entre legacy/standalone, ou entre duas
// libs do mesmo tier, vale a ordem de _manifest.json (primeira que aparecer
// no array 'libraries' fica). Ver _manifest.json._meta.tierPriority.
const _TIER_RANK = { priority: 2, legacy: 1, standalone: 1 };
const _keyIndexCache = new WeakMap();

function _libNameOf(ref) {
  return (ref.meta && ref.meta.libraryName) || ref.libraryName || ref.name || null;
}

function _buildKeyIndex(referenceList) {
  const index = new Map();
  let tier = null;
  const add = (key, libName, tokenName, tierRank) => {
    if (!key) return;
    const existing = index.get(key);
    if (!existing || tierRank > existing.tierRank) {
      index.set(key, { matchedIn: libName, matchedTokenName: tokenName || null, tierRank, tier });
    }
  };
  for (const ref of referenceList) {
    if (!ref) continue;
    const libName = _libNameOf(ref);
    const tierRank = _TIER_RANK[ref.tier] || _TIER_RANK.legacy;
    tier = ref.tier || 'legacy';
    if (ref.designTokens && Array.isArray(ref.designTokens.variables)) {
      ref.designTokens.variables.forEach(t => { add(t.key, libName, t.name, tierRank); add(t.$key, libName, t.name, tierRank); });
    }
    // Todas as variáveis publicadas, inclusive STRING/BOOLEAN e apelidos sem
    // valor próprio (build-skeleton.cjs).
    if (Array.isArray(ref.variableKeys)) ref.variableKeys.forEach(v => add(v.key, libName, v.name, tierRank));
    if (ref.styleTokens) {
      for (const styleType in ref.styleTokens) {
        const list = ref.styleTokens[styleType];
        if (Array.isArray(list)) list.forEach(s => add(s.key, libName, s.name, tierRank));
      }
    }
    if (Array.isArray(ref.components)) ref.components.forEach(c => add(c.key, libName, c.name, tierRank));
    // _skeleton.json guarda componentes como array plano de chaves, sem nome
    if (Array.isArray(ref.componentKeys)) ref.componentKeys.forEach(k => add(k, libName, null, tierRank));
  }
  return index;
}

function _keyIndexFor(referenceTokensInput, referenceList) {
  const cacheKey = typeof referenceTokensInput === 'object' ? referenceTokensInput : null;
  if (cacheKey && _keyIndexCache.has(cacheKey)) return _keyIndexCache.get(cacheKey);
  const index = _buildKeyIndex(referenceList);
  if (cacheKey) _keyIndexCache.set(cacheKey, index);
  return index;
}

export function auditProperty(name, value, type, figmaKey, referenceTokensInput) {
  if (!referenceTokensInput) return emptyResult();

  const referenceList = Array.isArray(referenceTokensInput) ? referenceTokensInput : [referenceTokensInput];

  // Figma keys are ground truth: if the style/variable/component key is in the DSC
  // reference, the element is compliant.
  if (figmaKey) {
    const hit = _keyIndexFor(referenceTokensInput, referenceList).get(figmaKey);
    if (hit) {
      return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: hit.matchedIn, matchedTokenName: hit.matchedTokenName, matchedTier: hit.tier };
    }
  }

  return emptyResult();
}
