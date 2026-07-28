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
  return { score: AUDIT_SCORE.NONE, matchedBy: null, matchedIn: null, matchedTokenName: null };
}

function scoreToLegacy(score) {
  if (score >= AUDIT_SCORE.EXACT) return true;
  if (score >= AUDIT_SCORE.SOFT) return "warning";
  return false;
}

// Score-based audit:
//   1.0 (EXACT) — element matched by Figma internal `key` (variable or style)
//   0.5 (SOFT)  — element matched only by value or name (low precision, audit mode only)
//   0.0 (NONE)  — no match in any provided reference library
//
// Returns: { score, matchedBy: "key"|"value"|"name"|null, matchedIn: <libName>|null }
// Notes:
//   - Key-based lookup always runs regardless of isAudit (ground truth from Figma).
//   - Soft/value matching only runs when isAudit:true (explicit audit mode).
//   - When multiple reference libraries are provided, picks the highest score.
export function auditProperty(name, value, type, figmaKey, referenceTokensInput, isAudit) {
  if (!referenceTokensInput) return emptyResult();

  const referenceList = Array.isArray(referenceTokensInput) ? referenceTokensInput : [referenceTokensInput];

  // Pass 1 — exact key-based match (always runs, regardless of isAudit).
  // Figma keys are ground truth: if the style/variable/component key is in the DSC
  // reference, the element is compliant regardless of scan mode.
  if (figmaKey) {
    for (const referenceTokens of referenceList) {
      if (!referenceTokens) continue;
      const libName = (referenceTokens.meta && referenceTokens.meta.libraryName) || referenceTokens.libraryName || null;

      if (referenceTokens.designTokens && Array.isArray(referenceTokens.designTokens.variables)) {
        const v = referenceTokens.designTokens.variables.find(t => t.key === figmaKey || t.$key === figmaKey);
        if (v) {
          return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName, matchedTokenName: v.name || null };
        }
      }
      if (referenceTokens.styleTokens) {
        for (const styleType in referenceTokens.styleTokens) {
          const stylesArray = referenceTokens.styleTokens[styleType];
          if (Array.isArray(stylesArray)) {
            const s = stylesArray.find(item => item.key === figmaKey);
            if (s) {
              return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName, matchedTokenName: s.name || null };
            }
          }
        }
      }
      if (Array.isArray(referenceTokens.components)) {
        const c = referenceTokens.components.find(item => item.key === figmaKey);
        if (c) {
          return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName, matchedTokenName: c.name || null };
        }
      }
      // _skeleton.json stores component keys as flat string array in componentKeys
      if (Array.isArray(referenceTokens.componentKeys) && referenceTokens.componentKeys.includes(figmaKey)) {
        return { score: AUDIT_SCORE.EXACT, matchedBy: "key", matchedIn: libName, matchedTokenName: null };
      }
    }
  }

  // Pass 2 — soft/value-based matching (only in explicit audit mode).
  // Normal scans (isAudit: false) rely solely on key-based detection above.
  if (!isAudit || !name) return emptyResult();

  const lowerName = String(name).toLowerCase();
  const targetValue = String(value || "").toLowerCase();

  let best = emptyResult();

  const considerSofterMatch = (libName) => {
    if (best.score < AUDIT_SCORE.SOFT) {
      best = { score: AUDIT_SCORE.SOFT, matchedBy: null, matchedIn: libName, matchedTokenName: null };
    }
  };

  for (const referenceTokens of referenceList) {
    if (!referenceTokens) continue;
    const libName = (referenceTokens.meta && referenceTokens.meta.libraryName) || referenceTokens.libraryName || null;

    // Soft match — by value, name, or category list (spacing/borders/etc.).
    const categoryList = referenceTokens[type] || referenceTokens[type.replace(/s$/, "")] || null;

    const softMatchList = (list) => {
      if (!Array.isArray(list)) return null;
      for (const ref of list) {
        const rName = (typeof ref === "string" ? ref : (ref.name || ref.label || "")).toLowerCase();
        const rValue = (typeof ref === "string" ? "" : (ref.value || ref.hex || ref.token || "")).toLowerCase();
        const rRaw = (typeof ref === "object" && ref && ref.rawValue !== undefined) ? String(ref.rawValue).toLowerCase() : "";
        const refTokenName = (typeof ref === "object" && ref) ? (ref.name || null) : null;

        if (rValue && targetValue && (rValue === targetValue || targetValue === rValue || targetValue.includes(rValue) || rValue.includes(targetValue))) {
          return { kind: "value", tokenName: refTokenName };
        }
        if (rRaw && targetValue && targetValue.replace(/px$/, "") === rRaw) {
          return { kind: "value", tokenName: refTokenName };
        }
        if (rName && (rName === lowerName || lowerName.includes(rName) || rName.includes(lowerName))) {
          return { kind: "name", tokenName: refTokenName };
        }
        if (type === "typography" && targetValue.includes("px") && rValue) {
          const sizeMatch = targetValue.match(/\((\d+(\.\d+)?)px\)/);
          if (sizeMatch && (rValue.includes(sizeMatch[1] + "px") || rName.includes(sizeMatch[1]))) {
            if (targetValue.includes("caixa std")) return { kind: "name", tokenName: refTokenName };
          }
        }
      }
      return null;
    };

    const direct = softMatchList(categoryList);
    if (direct) {
      if (best.score < AUDIT_SCORE.SOFT) best = { score: AUDIT_SCORE.SOFT, matchedBy: direct.kind, matchedIn: libName, matchedTokenName: direct.tokenName };
      continue;
    }

    // Global soft match across all categories of this lib.
    let globalHit = null;
    for (const cat in referenceTokens) {
      const hit = softMatchList(referenceTokens[cat]);
      if (hit) { globalHit = hit; break; }
    }
    if (globalHit) {
      if (best.score < AUDIT_SCORE.SOFT) best = { score: AUDIT_SCORE.SOFT, matchedBy: globalHit.kind, matchedIn: libName, matchedTokenName: globalHit.tokenName };
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

// =====================================================================
// Closest-match suggestion for elements that scored < AJUSTE threshold.
// Given a property type+value and a list of reference libraries, returns
// the nearest DSC token (or null if no useful candidate). Cheap to run.
// =====================================================================
export function suggestClosestMatch(type, value, referenceTokensInput) {
  if (!value || !referenceTokensInput) return null;
  const referenceList = Array.isArray(referenceTokensInput) ? referenceTokensInput : [referenceTokensInput];

  // 1. Colors: euclidean distance in RGB space (0–441 max for #000↔#FFF).
  // Searches both style tokens AND resolved color variables.
  const hexMatch = String(value).match(/#([0-9a-f]{6})/i);
  if (hexMatch && (type === "colors" || type === "color" || type === "stroke")) {
    const target = hexToRgb(hexMatch[1]);
    let best = null;

    for (const ref of referenceList) {
      const libName = (ref.meta && ref.meta.libraryName) || ref.libraryName || null;

      // a) Style tokens (paint styles)
      const styleList = (ref.styleTokens && ref.styleTokens.colors) || [];
      for (const item of styleList) {
        if (!item.value) continue;
        const h = item.value.match(/#([0-9a-f]{6})/i);
        if (!h) continue;
        const rgb = hexToRgb(h[1]);
        const d = Math.sqrt((target.r - rgb.r) ** 2 + (target.g - rgb.g) ** 2 + (target.b - rgb.b) ** 2);
        if (!best || d < best.distance) {
          best = { tokenName: item.name, value: item.value, library: libName, distance: d,
                   kind: "style", styleKey: item.key || null, variableKey: null };
        }
      }

      // b) Color variables (resolved hex stored during extraction)
      const vars = (ref.designTokens && ref.designTokens.variables) || [];
      for (const v of vars) {
        if (!v.value || v.resolvedType !== "COLOR") continue;
        const h = v.value.match(/#([0-9a-f]{6})/i);
        if (!h) continue;
        const rgb = hexToRgb(h[1]);
        const d = Math.sqrt((target.r - rgb.r) ** 2 + (target.g - rgb.g) ** 2 + (target.b - rgb.b) ** 2);
        if (!best || d < best.distance) {
          best = { tokenName: v.name, value: v.value, library: libName, distance: d,
                   kind: "variable", styleKey: null, variableKey: v.key || null };
        }
      }
    }

    if (best && best.distance < 80) {
      best.similarity = Math.max(0, Math.round((1 - best.distance / 441) * 100));
      return best;
    }
    return null;
  }

  // 2. Typography: find best matching text style by name/size.
  if (type === "typography") {
    let best = null;
    for (const ref of referenceList) {
      const libName = (ref.meta && ref.meta.libraryName) || ref.libraryName || null;
      const list = (ref.styleTokens && ref.styleTokens.typography) || [];
      for (const item of list) {
        if (!item.key) continue;
        // Exact name match preferred
        if (item.name && item.name === value) {
          return { tokenName: item.name, value: item.value || item.name, library: libName,
                   distance: 0, kind: "style", styleKey: item.key, variableKey: null, similarity: 100 };
        }
        if (!best) best = { tokenName: item.name, value: item.value || item.name, library: libName,
                            distance: 999, kind: "style", styleKey: item.key, variableKey: null };
      }
    }
    if (best) { best.similarity = 0; return best; }
    return null;
  }

  // 3. Numeric props (font size, radius, spacing): nearest absolute delta.
  const numMatch = String(value).match(/(-?\d+(?:\.\d+)?)\s*px?/);
  if (numMatch) {
    const target = parseFloat(numMatch[1]);
    let best = null;
    for (const ref of referenceList) {
      const libName = (ref.meta && ref.meta.libraryName) || ref.libraryName || null;
      const candidates = collectNumericCandidates(ref, type);
      for (const c of candidates) {
        const d = Math.abs(target - c.value);
        if (!best || d < best.distance) {
          best = { tokenName: c.name, value: c.value + "px", library: libName, distance: d,
                   kind: "numeric", styleKey: c.styleKey || null, variableKey: c.variableKey || null };
        }
      }
    }
    if (best && best.distance <= Math.max(4, target * 0.25)) {
      best.similarity = Math.max(0, Math.round((1 - best.distance / Math.max(target, 1)) * 100));
      return best;
    }
    return null;
  }

  return null;
}

function collectNumericCandidates(ref, type) {
  const out = [];
  // Typography font sizes
  if (type === "typography" || type === "fontSize") {
    const list = (ref.styleTokens && ref.styleTokens.typography) || [];
    for (const item of list) {
      if (typeof item.fontSize === "number") {
        out.push({ name: item.name, value: item.fontSize });
      }
    }
  }
  // Spacing / borders / radii usually come from variables in the DSC.
  const variables = (ref.designTokens && ref.designTokens.variables) || [];
  for (const v of variables) {
    if (typeof v.value === "number") out.push({ name: v.name, value: v.value, variableKey: v.key || null });
  }
  // Fallback: top-level arrays (spacing, borders) as plain numbers
  for (const cat of ["spacing", "borders", "radii"]) {
    const list = ref[cat];
    if (Array.isArray(list)) {
      for (const it of list) {
        const num = typeof it === "number" ? it
                  : (it && typeof it.value === "number" ? it.value
                  : (it && typeof it.rawValue === "number" ? it.rawValue : null));
        if (num !== null) out.push({ name: (it && it.name) || String(num), value: num });
      }
    }
  }
  return out;
}

function hexToRgb(hex) {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// Backwards-compatible wrapper: returns the legacy true | "warning" | false flag,
// but also stamps `_lastAuditResult` on the frameJson so callers that want richer
// data can pick it up. New code should use auditProperty() directly.
export function isDS(name, value, type, figmaKey, referenceTokensInput, isAudit, frameJson, nodeName) {
  const result = auditProperty(name, value, type, figmaKey, referenceTokensInput, isAudit);
  if (frameJson) frameJson._lastAuditResult = result;
  return scoreToLegacy(result.score);
}
