// ============================================================
// HAC — build-skeleton.cjs
// Adaptação/redução de src/plugin/refs/build-skeleton.cjs do Handex Beta
// (2026-08-24). Simplificado: o Handex agrega 6 libs completas (~900KB,
// com styleTokens/variables/componentKeys de scan geral que o hac não
// usa, já que não há aba "Escanear Tokens" nem conformidade DSC geral
// aqui). O hac só precisa de "componentsDetailed" (key + name +
// containingFrame) da lib "web-angular-react" — é o único dado consumido
// em runtime por _getDscComponentKeyToFrameMap (ver code.js), para
// resolver instância do canvas -> containingFrame -> categoria de a11y
// via dsc-component-a11y-mapping.json.
//
// Mantém, por robustez/paridade de formato com o Handex (caso outra lib
// seja adicionada no futuro), a extração de styleTokens/variables/
// componentKeys — mas hoje, com manifest de 1 lib só, o skeleton final é
// uma fração do tamanho do Handex.
//
// Reads refs/*.json (output of fetch-design-refs.cjs) and emits
// refs/_skeleton.json — embarcado em ui.html por build.cjs como
// window.__HAC_REF_SKELETON__. At runtime the plugin calls
// figma.importComponentByKeyAsync para resolver instâncias reais (no
// token needed no cliente distribuído).
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const MANIFEST = path.join(REFS_DIR, '_manifest.json');
const OUT = path.join(REFS_DIR, '_skeleton.json');

// Strip characters that break JS string literals when the host
// (Figma) serializes ui.html: U+2028 LINE SEPARATOR, U+2029
// PARAGRAPH SEPARATOR, U+200B-200F ZERO WIDTH chars, U+FEFF BOM,
// and stray NULs. Built via String.fromCharCode to keep this file
// itself free of those literal characters.
const ILLEGAL_CHARS = [0x2028, 0x2029, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF];
const ILLEGAL_RE = new RegExp('[' + ILLEGAL_CHARS.map(c => '\\u' + c.toString(16).padStart(4, '0')).join('') + '\\x00]', 'g');

function clean(s) {
  if (typeof s !== 'string') return s;
  return s.replace(ILLEGAL_RE, '').trim();
}

function readLib(file) {
  const abs = path.join(REFS_DIR, file);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠  missing lib file: ${file}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const skeleton = {
  generatedAt: new Date().toISOString(),
  libraries: []
};

for (const libMeta of manifest.libraries) {
  const lib = readLib(libMeta.file);
  if (!lib) continue;

  const entry = {
    slug: libMeta.slug,
    name: clean(libMeta.name),
    fileKey: libMeta.fileKey,
    styleTokens: { colors: [], typography: [], effects: [] },
    variables: { colors: [], numbers: [] },
    componentKeys: []
  };

  if (lib.styleTokens) {
    for (const k of ['colors', 'typography', 'effects']) {
      const arr = lib.styleTokens[k];
      if (!Array.isArray(arr)) continue;
      entry.styleTokens[k] = arr
        .filter(s => s && s.key)
        .map(s => ({ key: s.key, name: clean(s.name || '') }));
    }
  }

  // Variables with resolved values
  const vars = (lib.designTokens && Array.isArray(lib.designTokens.variables))
    ? lib.designTokens.variables : [];

  entry.variables.colors = vars
    .filter(v => v.resolvedType === 'COLOR' && v.value)
    .map(v => ({ key: v.key, name: clean(v.name), value: v.value, collection: clean(v.collection || '') }));

  entry.variables.numbers = vars
    .filter(v => v.resolvedType === 'FLOAT' && v.value !== null && v.value !== undefined)
    .map(v => ({ key: v.key, name: clean(v.name), value: v.value, collection: clean(v.collection || '') }));

  if (Array.isArray(lib.components)) {
    entry.componentKeys = lib.components
      .filter(c => c && c.key)
      .map(c => c.key);
  }

  // componentsDetailed: key + name + containingFrame, só para a lib
  // "web-angular-react" — é onde vive a correspondência componente DSC →
  // categoria de handoff de a11y (ver refs/build-dsc-a11y-mapping.cjs e
  // refs/dsc-component-a11y-mapping.json). No hac, na prática, é a
  // ÚNICA lib presente no manifest — mas mantém a checagem explícita de
  // slug por paridade com o Handex, caso o manifest cresça no futuro.
  if (libMeta.slug === 'web-angular-react' && Array.isArray(lib.components)) {
    entry.componentsDetailed = lib.components
      .filter(c => c && c.key)
      .map(c => ({ key: c.key, name: clean(c.name || ''), containingFrame: clean(c.containingFrame || '') }));
  }

  skeleton.libraries.push(entry);
}

const json = JSON.stringify(skeleton);
fs.writeFileSync(OUT, json, 'utf8');

const sizeKB = (json.length / 1024).toFixed(1);
const totalStyles     = skeleton.libraries.reduce((a, l) => a + l.styleTokens.colors.length + l.styleTokens.typography.length + l.styleTokens.effects.length, 0);
const totalComponents = skeleton.libraries.reduce((a, l) => a + l.componentKeys.length, 0);
const totalVarColors  = skeleton.libraries.reduce((a, l) => a + l.variables.colors.length, 0);
const totalVarNumbers = skeleton.libraries.reduce((a, l) => a + l.variables.numbers.length, 0);
const totalDetailed   = skeleton.libraries.reduce((a, l) => a + (Array.isArray(l.componentsDetailed) ? l.componentsDetailed.length : 0), 0);

console.log(`✅ _skeleton.json (${sizeKB} KB)`);
console.log(`   ${skeleton.libraries.length} libraries`);
console.log(`   ${totalStyles} styles • ${totalComponents} component keys`);
if (totalVarColors || totalVarNumbers) {
  console.log(`   ${totalVarColors} color variables • ${totalVarNumbers} number variables`);
}
if (totalDetailed) {
  console.log(`   ${totalDetailed} componentsDetailed (web-angular-react only)`);
}
