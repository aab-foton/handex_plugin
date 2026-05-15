export const frameJsonTemplate = () => ({
  designTokens: { variables: [] },
  styleTokens: { paint: [], text: [], effect: [], grid: [] },
  detached: []
});

export function registerToFrameJson(frameJson, category, name, value, tokenKey, styleKey, layerName, isMatchedByValue) {
  if (tokenKey) {
    if (!frameJson.designTokens.variables.some(v => v.key === tokenKey)) {
      frameJson.designTokens.variables.push({ key: tokenKey, name: name, value: value, type: category, layerName: layerName });
    }
  } else if (styleKey || isMatchedByValue === true) {
    let styleType = category === "colors" ? "paint" : category === "typography" ? "text" : category === "effects" ? "effect" : category === "grids" ? "grid" : category;
    frameJson.styleTokens[styleType] = frameJson.styleTokens[styleType] || [];
    const searchKey = styleKey || name;
    if (!frameJson.styleTokens[styleType].some(v => v.key === searchKey || v.name === name)) {
      frameJson.styleTokens[styleType].push({ key: searchKey, name: name, value: value, layerName: layerName, softMatch: !styleKey });
    }
  } else {
    frameJson.detached.push({ category: category, name: name, value: value, layerName: layerName });
  }
}

export function isDS(name, value, type, figmaKey, referenceTokens, isAudit, frameJson, nodeName) {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  
  // Manual bypass via naming convention
  if (lowerName.includes("[dsc]") || lowerName.includes("[ dsc]")) return true;
  
  // Audit Reference Check
  if (isAudit && referenceTokens) {
    if (figmaKey) {
       // 1. Check variables
       if (referenceTokens.designTokens && referenceTokens.designTokens.variables) {
         const foundVar = referenceTokens.designTokens.variables.find(t => t.key === figmaKey || t.$key === figmaKey);
         if (foundVar) return true;
       }
       
       // 2. Check styles
       if (referenceTokens.styleTokens) {
         for (const styleType in referenceTokens.styleTokens) {
            const stylesArray = referenceTokens.styleTokens[styleType];
            if (Array.isArray(stylesArray)) {
              const foundStyle = stylesArray.find(s => s.key === figmaKey);
              if (foundStyle) return true;
            }
         }
       }
    }

    // Try specific category first
    const refList = referenceTokens[type] || referenceTokens[type.replace('s', '')];
    
    const checkMatch = (list) => {
      if (!list || !Array.isArray(list)) return false;
      return list.some(ref => {
        const rName = (typeof ref === 'string' ? ref : (ref.name || ref.label || "")).toLowerCase();
        const rValue = (typeof ref === 'string' ? "" : (ref.value || ref.hex || ref.token || "")).toLowerCase();
        const targetValue = String(value || "").toLowerCase();

        // Match by name
        if (rName && (rName === lowerName || lowerName.includes(rName) || rName.includes(lowerName))) return true;
        // Match by value
        if (rValue && targetValue && (rValue === targetValue || targetValue.includes(rValue))) return true;
        
        // Special heuristic for typography: if font family and size match a known preset
        if (type === "typography" && targetValue.includes("px") && rValue) {
          // targetValue usually looks like "caixa std regular (14px)"
          // rValue might have "14px" or "14"
          const sizeMatch = targetValue.match(/\((\d+(\.\d+)?)px\)/);
          if (sizeMatch && (rValue.includes(sizeMatch[1] + "px") || rName.includes(sizeMatch[1]))) {
            if (targetValue.includes("caixa std")) return true;
          }
        }
        
        return false;
      });
    };

    if (checkMatch(refList)) return true;

    // Fallback: Check if it exists in ANY category (global match)
    for (const cat in referenceTokens) {
      if (checkMatch(referenceTokens[cat])) return true;
    }
    
    // Fallback for typography: Official font but wrong size/weight
    if (type === "typography") {
      const targetValue = String(value || "").toLowerCase();
      if (targetValue.includes("caixa std")) return "warning";
    }

    // Fallback for other categories: if it has DS naming conventions but didn't match perfectly
    if (lowerName.includes("/") || lowerName.includes("shadow") || lowerName.includes("[") || lowerName.includes("]")) {
      return "warning";
    }
  }
  return false;
}
