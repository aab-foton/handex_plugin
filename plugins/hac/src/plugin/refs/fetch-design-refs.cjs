// ============================================================
// HAC — fetch-design-refs.cjs
// Adaptação/redução de src/plugin/refs/fetch-design-refs.cjs do Handex Beta
// (2026-08-24). Mesma lógica de busca via REST API do Figma, escopada ao
// manifest enxuto do hac (hoje só a lib "web-angular-react" — ver
// _manifest.json). Não porta a busca de "styles" resolvidos em hex/px:
// mantém o princípio do Handex de nunca embarcar valor resolvido no
// artefato distribuído (só keys/nomes; os valores são resolvidos em
// runtime via Plugin API dentro do Figma).
//
// Para cada lib em refs/_manifest.json, busca variables + components
// na REST API da Figma e escreve um JSON por lib em refs/{slug}.json.
//
// O output deste script é consumido por build-skeleton.cjs.
//
// Uso:
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-design-refs.cjs
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-design-refs.cjs --only web-angular-react
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

if (!TOKEN) {
  console.error('⛔  FIGMA_TOKEN environment variable not set.');
  console.error('   Set it via: export FIGMA_TOKEN=xxx');
  process.exit(1);
}

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlySlug = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const FIGMA_API = 'https://api.figma.com';

async function figmaGet(pathName) {
  const url = FIGMA_API + pathName;
  const res = await fetch(url, { headers: { 'X-Figma-Token': TOKEN } });
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
    // GRID and any others are ignored — não usados pelo hac
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
      generator: 'fetch-design-refs.cjs (hac)',
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
    const varsResp = await figmaGet(`/v1/files/${libMeta.fileKey}/variables/local`);
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

  // 2.5. Component sets — em algumas libs (ex: "DSC | Super App", descoberta
  // em 2026-08-25) o próprio component set já carrega o nome "[dsc] X" e o
  // `containing_frame.name` de cada variante vem VAZIO (diferente da lib
  // desktop "Web Angular & React", onde é o FRAME que envolve o set que tem
  // o nome "[dsc] X"). Sem este mapa, o matching perderia 100% dos
  // componentes reais dessas libs — confirmado com "[dsc] Button" na lib
  // mobile: containing_frame.name === "" mas o set.name já é "[dsc] Button".
  // Chaveado por node_id do set (containing_frame.containingComponentSet.nodeId
  // em cada variante aponta pra este mesmo node_id).
  const componentSetNameByNodeId = {};
  try {
    const setsResp = await figmaGet(`/v1/files/${libMeta.fileKey}/component_sets`);
    const sets = (setsResp && setsResp.meta && setsResp.meta.component_sets) || [];
    for (const s of sets) {
      componentSetNameByNodeId[s.node_id] = clean(s.name || '');
    }
    console.log(`    component sets: ${sets.length}`);
  } catch (e) {
    console.warn(`    ⚠  component_sets failed: ${e.message}`);
    out.meta.warnings.push(`component_sets fetch error: ${e.message}`);
  }

  // 3. Components (paginated via cursor on large libs) — containingFrame é o
  // campo que o hac realmente precisa (matching DSC → categoria de a11y).
  // Fallback: containing_frame.name vazio → nome do component set (via
  // componentSetNameByNodeId acima) → ainda vazio, fica '' (sem match).
  try {
    let cursor = null;
    let total = 0;
    do {
      const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const compsResp = await figmaGet(`/v1/files/${libMeta.fileKey}/components${qs}`);
      const components = (compsResp && compsResp.meta && compsResp.meta.components) || [];
      for (const c of components) {
        const frame = c.containing_frame || {};
        const setNodeId = frame.containingComponentSet && frame.containingComponentSet.nodeId;
        const containingFrame = clean(frame.name) || componentSetNameByNodeId[setNodeId] || '';
        out.components.push({
          key: c.key,
          name: clean(c.name || ''),
          description: clean(c.description || ''),
          containingFrame
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
