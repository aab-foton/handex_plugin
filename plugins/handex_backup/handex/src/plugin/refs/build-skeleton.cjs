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
    styleTokens: { colors: [], typography: [], effects: [] },
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
const totalStyles = skeleton.libraries.reduce((a, l) => a + l.styleTokens.colors.length + l.styleTokens.typography.length + l.styleTokens.effects.length, 0);
const totalComponents = skeleton.libraries.reduce((a, l) => a + l.componentKeys.length, 0);

console.log(`✅ _skeleton.json (${sizeKB} KB)`);
console.log(`   ${skeleton.libraries.length} libraries`);
console.log(`   ${totalStyles} styles • ${totalComponents} component keys`);
