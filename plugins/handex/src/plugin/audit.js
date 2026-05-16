export const frameJsonTemplate = () => ({
  elements: {
    components: [],
    icons: [],
    typography: [],
    frames: [],
    vectors: []
  }
});

export function isDS(name, value, type, figmaKey, referenceTokens, isAudit, frameJson, nodeName) {
  if (!name) return false;
  const lowerName = name.toLowerCase();
  
  // 1. Check if it's an official [dsc] component/element
  const isOfficial = lowerName.includes("[dsc]") || lowerName.includes("[ dsc]");
  
  // Audit Reference Check
  if (isAudit && referenceTokens) {
    // 2. Check for official Variable/Style link (High precision)
    if (figmaKey) {
       // Variables
       if (referenceTokens.designTokens && referenceTokens.designTokens.variables) {
         const foundVar = referenceTokens.designTokens.variables.find(t => t.key === figmaKey || t.$key === figmaKey);
         if (foundVar) return true;
       }
       
       // Styles
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

    // 3. Try to match by Value or Name (Soft match -> Warning)
    const refList = referenceTokens[type] || referenceTokens[type.replace('s', '')];
    
    const checkSoftMatch = (list) => {
      if (!list || !Array.isArray(list)) return false;
      return list.some(ref => {
        const rName = (typeof ref === 'string' ? ref : (ref.name || ref.label || "")).toLowerCase();
        const rValue = (typeof ref === 'string' ? "" : (ref.value || ref.hex || ref.token || "")).toLowerCase();
        const targetValue = String(value || "").toLowerCase();

        // Match by name
        if (rName && (rName === lowerName || lowerName.includes(rName) || rName.includes(lowerName))) return true;
        // Match by value
        if (rValue && targetValue && (rValue === targetValue || targetValue.includes(rValue))) return true;
        
        // Typography heuristic
        if (type === "typography" && targetValue.includes("px") && rValue) {
          const sizeMatch = targetValue.match(/\((\d+(\.\d+)?)px\)/);
          if (sizeMatch && (rValue.includes(sizeMatch[1] + "px") || rName.includes(sizeMatch[1]))) {
            if (targetValue.includes("caixa std")) return true;
          }
        }
        return false;
      });
    };

    if (checkSoftMatch(refList)) return "warning";

    // Global soft match
    for (const cat in referenceTokens) {
      if (checkSoftMatch(referenceTokens[cat])) return "warning";
    }
    
    // Naming conventions / heuristic warnings
    if (type === "typography" && lowerName.includes("caixa std")) return "warning";
    if (lowerName.includes("/") || lowerName.includes("shadow") || lowerName.includes("[") || lowerName.includes("]")) {
      return "warning";
    }
  }

  // If it's an official element but property is not linked, it's a warning by default
  if (isOfficial) return "warning";

  return false;
}
