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

export const AUDIT_THRESHOLDS = {
  OURO: 0.98,
  AJUSTE: 0.11
};

function emptyResult() {
  return { score: AUDIT_SCORE.NONE, matchedBy: null, matchedIn: null };
}

function scoreToLegacy(score) {
  if (score >= AUDIT_SCORE.EXACT) return true;
  if (score >= AUDIT_SCORE.SOFT) return "warning";
  return false;
}

// Score-based audit:
//   1.0 (EXACT) — element matched by Figma internal `key` (variable or style)
//   0.5 (SOFT)  — element matched only by value or name (low precision)
//   0.0 (NONE)  — no match in any provided reference library
//
// Returns: { score, matchedBy: "key"|"value"|"name"|null, matchedIn: <libName>|null }
// Notes:
//   - When multiple reference libraries are provided, picks the highest score (any
//     library confirming an exact key match is enough to make the prop "ouro").
//   - When isAudit is false or no reference is provided, score is NONE — UI hides the
//     audit indicator in that mode via handoffData.step2.isAuditEnabled.
export function auditProperty(name, value, type, figmaKey, referenceTokensInput, isAudit) {
  if (!isAudit || !referenceTokensInput) return emptyResult();
  if (!name) return emptyResult();

  const lowerName = String(name).toLowerCase();
  const targetValue = String(value || "").toLowerCase();
  const referenceList = Array.isArray(referenceTokensInput) ? referenceTokensInput : [referenceTokensInput];

  let best = emptyResult();

  const considerSofterMatch = (libName) => {
    if (best.score < AUDIT_SCORE.SOFT) {
      best = { score: AUDIT_SCORE.SOFT, matchedBy: null, matchedIn: libName };
    }
  };

  for (const referenceTokens of referenceList) {
    if (!referenceTokens) continue;
    const libName = (referenceTokens.meta && referenceTokens.meta.libraryName) || referenceTokens.libraryName || null;

    // 1. Exact match by Figma internal key (variables + styles) — highest precision.
    if (figmaKey) {
      if (referenceTokens.designTokens && Array.isArray(referenceTokens.designTokens.variables)) {
        if (referenceTokens.designTokens.variables.some(t => t.key === figmaKey || t.$key === figmaKey)) {
          return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName };
        }
      }
      if (referenceTokens.styleTokens) {
        for (const styleType in referenceTokens.styleTokens) {
          const stylesArray = referenceTokens.styleTokens[styleType];
          if (Array.isArray(stylesArray) && stylesArray.some(s => s.key === figmaKey)) {
            return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName };
          }
        }
      }
      if (Array.isArray(referenceTokens.components) && referenceTokens.components.some(c => c.key === figmaKey)) {
        return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName };
      }
    }

    // 2. Soft match — by value, name, or category list (spacing/borders/etc.).
    const categoryList = referenceTokens[type] || referenceTokens[type.replace(/s$/, "")] || null;

    const softMatchList = (list) => {
      if (!Array.isArray(list)) return null;
      for (const ref of list) {
        const rName = (typeof ref === "string" ? ref : (ref.name || ref.label || "")).toLowerCase();
        const rValue = (typeof ref === "string" ? "" : (ref.value || ref.hex || ref.token || "")).toLowerCase();
        const rRaw = (typeof ref === "object" && ref && ref.rawValue !== undefined) ? String(ref.rawValue).toLowerCase() : "";

        if (rValue && targetValue && (rValue === targetValue || targetValue === rValue || targetValue.includes(rValue) || rValue.includes(targetValue))) {
          return "value";
        }
        if (rRaw && targetValue && targetValue.replace(/px$/, "") === rRaw) {
          return "value";
        }
        if (rName && (rName === lowerName || lowerName.includes(rName) || rName.includes(lowerName))) {
          return "name";
        }
        if (type === "typography" && targetValue.includes("px") && rValue) {
          const sizeMatch = targetValue.match(/\((\d+(\.\d+)?)px\)/);
          if (sizeMatch && (rValue.includes(sizeMatch[1] + "px") || rName.includes(sizeMatch[1]))) {
            if (targetValue.includes("caixa std")) return "name";
          }
        }
      }
      return null;
    };

    const direct = softMatchList(categoryList);
    if (direct) {
      if (best.score < AUDIT_SCORE.SOFT) best = { score: AUDIT_SCORE.SOFT, matchedBy: direct, matchedIn: libName };
      continue;
    }

    // Global soft match across all categories of this lib.
    let globalHit = null;
    for (const cat in referenceTokens) {
      const hit = softMatchList(referenceTokens[cat]);
      if (hit) { globalHit = hit; break; }
    }
    if (globalHit) {
      if (best.score < AUDIT_SCORE.SOFT) best = { score: AUDIT_SCORE.SOFT, matchedBy: globalHit, matchedIn: libName };
      continue;
    }

    // Heuristic: naming hints (legacy behavior).
    if (type === "typography" && lowerName.includes("caixa std")) {
      considerSofterMatch(libName);
      continue;
    }
    if (lowerName.includes("/") || lowerName.includes("shadow") || lowerName.includes("[") || lowerName.includes("]")) {
      considerSofterMatch(libName);
    }
  }

  return best;
}

// Backwards-compatible wrapper: returns the legacy true | "warning" | false flag,
// but also stamps `_lastAuditResult` on the frameJson so callers that want richer
// data can pick it up. New code should use auditProperty() directly.
export function isDS(name, value, type, figmaKey, referenceTokensInput, isAudit, frameJson, nodeName) {
  const result = auditProperty(name, value, type, figmaKey, referenceTokensInput, isAudit);
  if (frameJson) frameJson._lastAuditResult = result;
  return scoreToLegacy(result.score);
}
