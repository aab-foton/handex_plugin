// ============================================================
// HANDEX — fetch-design-refs.cjs
// Para cada lib em refs/_manifest.json, busca styles + components
// na REST API da Figma e escreve um JSON por lib em refs/{slug}.json.
//
// O output deste script é consumido por build-skeleton.cjs.
//
// Uso:
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-design-refs.cjs
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-design-refs.cjs --only fundamentos-visuais
//
// Requer Node 18+ (usa fetch nativo).
//
// Nota: a REST API da Figma não devolve valores resolvidos para
// styles publicados em libraries — só keys/nomes/descrições. Os
// valores reais são resolvidos em runtime via Plugin API. Por isso
// o output deste script é intencionalmente o "esqueleto" da DSC.
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const MANIFEST_PATH = path.join(REFS_DIR, '_manifest.json');
const TOKEN = process.env.FIGMA_TOKEN;
// Fallback opcional caso FIGMA_TOKEN não tenha escopo file_variables:read
// (já aconteceu neste projeto — um token de leitura retornava 403 só nesse
// endpoint, mesmo funcionando normal em /styles e /components). Se
// FIGMA_TOKEN_VARIABLES não estiver setado, usa o mesmo TOKEN de sempre.
const TOKEN_VARIABLES = process.env.FIGMA_TOKEN_VARIABLES || TOKEN;

if (!TOKEN) {
  console.error('⛔  FIGMA_TOKEN environment variable not set.');
  console.error('   Set it via: export FIGMA_TOKEN=xxx');
  process.exit(1);
}

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlySlug = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const FIGMA_API = 'https://api.figma.com';

async function figmaGet(pathName, token = TOKEN) {
  const url = FIGMA_API + pathName;
  const res = await fetch(url, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${pathName} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Strip characters that would break embedding into a JS string literal later.
const ILLEGAL_CHARS = [0x2028, 0x2029, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF];
const ILLEGAL_RE = new RegExp('[' + ILLEGAL_CHARS.map(c => '\\u' + c.toString(16).padStart(4, '0')).join('') + '\\x00]', 'g');
const clean = (s) => typeof s === 'string' ? s.replace(ILLEGAL_RE, '') : s;

function categorizeStyleType(styleType) {
  switch (styleType) {
    case 'FILL':   return 'colors';
    case 'TEXT':   return 'typography';
    case 'EFFECT': return 'effects';
    // GRID and any others are ignored — não usados pela auditoria
    default: return null;
  }
}

async function fetchLibrary(libMeta) {
  console.log(`→ ${libMeta.name} (${libMeta.fileKey})`);

  const out = {
    meta: {
      libraryName: clean(libMeta.name),
      figmaFileKey: libMeta.fileKey,
      exportedAt: new Date().toISOString(),
      generator: 'fetch-design-refs.cjs',
      warnings: ['styles: /nodes não consultado — valores são resolvidos em runtime via Plugin API']
    },
    designTokens: { variables: [] }, // descoberto em runtime via teamLibrary
    styleTokens: { colors: [], typography: [], effects: [] },
    components: [],
    spacing: [],
    borders: []
  };

  // 1. Styles
  try {
    const stylesResp = await figmaGet(`/v1/files/${libMeta.fileKey}/styles`);
    const styles = (stylesResp && stylesResp.meta && stylesResp.meta.styles) || [];
    for (const s of styles) {
      const cat = categorizeStyleType(s.style_type);
      if (!cat) continue;
      out.styleTokens[cat].push({
        key: s.key,
        name: clean(s.name || ''),
        description: clean(s.description || '')
      });
    }
    console.log(`    styles: ${out.styleTokens.colors.length} colors · ${out.styleTokens.typography.length} typography · ${out.styleTokens.effects.length} effects`);
  } catch (e) {
    console.warn(`    ⚠  styles failed: ${e.message}`);
    out.meta.warnings.push(`styles fetch error: ${e.message}`);
  }

  // 2. Variables with resolved values (COLOR → hex, FLOAT → number)
  try {
    const varsResp = await figmaGet(`/v1/files/${libMeta.fileKey}/variables/local`, TOKEN_VARIABLES);
    const meta = (varsResp && varsResp.meta) || varsResp || {};
    const variablesObj  = meta.variables           || {};
    const collectionsObj = meta.variableCollections || {};

    // Map collection ID → default mode ID
    const defaultModes = {};
    for (const [colId, col] of Object.entries(collectionsObj)) {
      defaultModes[colId] = col.defaultModeId;
    }

    // Map variable ID → variable (for alias resolution)
    const varsById = {};
    for (const v of Object.values(variablesObj)) {
      if (v && v.id) varsById[v.id] = v;
    }

    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');

    // Resolve VARIABLE_ALIAS chains up to 8 hops
    function resolveRaw(v, depth = 0) {
      if (depth > 8) return null;
      const modeId = defaultModes[v.variableCollectionId];
      const raw = modeId && v.valuesByMode && v.valuesByMode[modeId];
      if (!raw) return null;
      if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
        const ref = varsById[raw.id];
        return ref ? resolveRaw(ref, depth + 1) : null;
      }
      return raw;
    }

    for (const v of Object.values(variablesObj)) {
      if (!v || !v.key || v.hiddenFromPublishing) continue;

      const rawValue = resolveRaw(v);

      let value = null;
      if (v.resolvedType === 'COLOR' && rawValue && typeof rawValue === 'object' && 'r' in rawValue) {
        value = `#${toHex(rawValue.r)}${toHex(rawValue.g)}${toHex(rawValue.b)}`;
      } else if (v.resolvedType === 'FLOAT' && typeof rawValue === 'number') {
        value = rawValue;
      } else if (typeof rawValue === 'string' || typeof rawValue === 'boolean') {
        value = rawValue;
      }

      out.designTokens.variables.push({
        key:            v.key,
        name:           clean(v.name || ''),
        resolvedType:   v.resolvedType || null,
        collection:     clean((collectionsObj[v.variableCollectionId] || {}).name || ''),
        value
      });
    }
    console.log(`    variables: ${out.designTokens.variables.length} (${out.designTokens.variables.filter(v=>v.resolvedType==='COLOR').length} colors · ${out.designTokens.variables.filter(v=>v.resolvedType==='FLOAT').length} numbers)`);
  } catch (e) {
    console.warn(`    ⚠  variables skipped: ${e.message.slice(0, 80)}`);
    out.meta.warnings.push(`variables fetch skipped: ${e.message.slice(0, 120)}`);
  }

  // 3. Components (paginated via cursor on large libs)
  try {
    let cursor = null;
    let total = 0;
    do {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const compsResp = await figmaGet(`/v1/files/${libMeta.fileKey}/components${qs}`);
      const components = (compsResp && compsResp.meta && compsResp.meta.components) || [];
      for (const c of components) {
        out.components.push({
          key: c.key,
          name: clean(c.name || ''),
          description: clean(c.description || ''),
          containingFrame: (c.containing_frame && clean(c.containing_frame.name)) || ''
        });
      }
      total += components.length;
      cursor = compsResp && compsResp.meta && compsResp.meta.cursor && compsResp.meta.cursor.after;
    } while (cursor);
    console.log(`    components: ${total}`);
  } catch (e) {
    console.warn(`    ⚠  components failed: ${e.message}`);
    out.meta.warnings.push(`components fetch error: ${e.message}`);
  }

  // 3. Write per-lib JSON
  const outPath = path.join(REFS_DIR, libMeta.file);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`    ✓ ${path.relative(process.cwd(), outPath)}`);

  return out.meta.warnings.length > 1; // returns true if there were errors beyond the default warning
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const libs = onlySlug
    ? manifest.libraries.filter(l => l.slug === onlySlug)
    : manifest.libraries;

  if (libs.length === 0) {
    console.error(`⛔  No libraries matched ${onlySlug ? '--only ' + onlySlug : ''}`);
    process.exit(1);
  }

  let hadErrors = false;
  for (const lib of libs) {
    try {
      const err = await fetchLibrary(lib);
      if (err) hadErrors = true;
    } catch (e) {
      console.error(`⛔  ${lib.name}: ${e.message}`);
      hadErrors = true;
    }
  }

  // Update _manifest.json with new generatedAt + counts
  manifest.generatedAt = new Date().toISOString();
  for (const lib of manifest.libraries) {
    try {
      const libPath = path.join(REFS_DIR, lib.file);
      if (fs.existsSync(libPath)) {
        const data = JSON.parse(fs.readFileSync(libPath, 'utf8'));
        lib.counts = {
          variables: data.designTokens.variables.length,
          colors: data.styleTokens.colors.length,
          typography: data.styleTokens.typography.length,
          effects: data.styleTokens.effects.length,
          components: data.components.length
        };
      }
    } catch (_) { /* keep previous counts on error */ }
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('✓ _manifest.json updated');

  if (hadErrors) {
    console.warn('\n⚠  Completed with errors — check warnings above. Skeleton may be partial.');
    process.exit(2); // exit code 2 = partial success (use in CI to fail-soft)
  }
}

main().catch(e => {
  console.error('⛔  Fatal:', e.message);
  process.exit(1);
});
