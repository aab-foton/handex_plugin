// ============================================================
// HANDEX — build-skeleton.cjs
// Reads refs/*.json (output of fetch-design-refs.cjs) and emits
// refs/_skeleton.json, a minimal, sanitized bundle containing
// only the data needed by the runtime audit:
//   - library metadata (slug, name, fileKey)
//   - style keys + names + types (no descriptions → no U+2028)
//   - component keys (flat string array per lib)
//
// The skeleton is embedded into ui.html by build.cjs as
// window.__HANDEX_REF_SKELETON__. At runtime the plugin calls
// figma.importStyleByKeyAsync to resolve values (no token needed).
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
    // 'priority' | 'legacy' | 'standalone' -- ver _manifest.json._meta.tierPriority.
    // 'legacy' por padrão pra qualquer lib cadastrada sem o campo (nunca some
    // silenciosamente do índice de auditoria, só perde a prioridade que não
    // foi declarada).
    tier: libMeta.tier || 'legacy',
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

  // Chave de TODA variável publicada pela lib, de qualquer tipo e com ou sem
  // valor resolvido -- só pra provar vínculo (audit.js). As listas acima
  // descartam STRING/BOOLEAN e apelidos sem valor próprio (ex: tokens
  // semânticos de spacing/radius que apontam pra outro token), porque servem
  // pra sugerir valor, não pra checar origem. Medido em 2026-09-24: ~370
  // variáveis publicadas ficavam fora (121 só na Super DSC | Web), e um nó
  // vinculado a qualquer uma delas seria reportado como "não é do DSC".
  entry.variableKeys = vars
    .filter(v => v && v.key)
    .map(v => ({ key: v.key, name: clean(v.name || '') }));

  if (Array.isArray(lib.components)) {
    entry.componentKeys = lib.components
      .filter(c => c && c.key)
      .map(c => c.key);
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

console.log(`✅ _skeleton.json (${sizeKB} KB)`);
console.log(`   ${skeleton.libraries.length} libraries`);
console.log(`   ${totalStyles} styles • ${totalComponents} component keys`);
if (totalVarColors || totalVarNumbers) {
  console.log(`   ${totalVarColors} color variables • ${totalVarNumbers} number variables`);
}
