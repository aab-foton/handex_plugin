// ============================================================
// HANDEX — fetch-a11y-component-properties.cjs
// Extrai as component property definitions (toggles booleanos,
// campos de texto, variantes) de cada component set INTERNO da
// lib "Design Acessível" (fileKey Wy0IhXRVZMSOOr8E609UqI) — os
// 25 sets prefixados "[NÃO UTILIZAR][a11y base] <nome>" que formam
// o conteúdo real renderizado dentro do wrapper "[a11y] Box specs LT".
//
// Diferente de fetch-design-refs.cjs (que só usa /styles, /variables
// e /components — nunca revela properties de variantes), este script
// consulta:
//   1. GET /v1/files/:key/component_sets  → descobre os sets e node_ids
//   2. GET /v1/files/:key/nodes?ids=...   → componentPropertyDefinitions
//      de cada set, numa única chamada em lote.
//
// Escopo desta extração é só o arquivo "Design Acessível" — as outras
// libs DSC não têm essa mecânica de toggles e ficam fora por ora.
//
// Output: refs/design-acessivel-component-properties.json (ver schema
// documentado no cabeçalho do JSON gerado, chave "_meta.schema").
//
// Uso:
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-a11y-component-properties.cjs
//
// Requer Node 18+ (usa fetch nativo). Sem dependências novas.
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const OUT_PATH = path.join(REFS_DIR, 'design-acessivel-component-properties.json');
const TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = 'Wy0IhXRVZMSOOr8E609UqI';
const A11Y_BASE_PREFIX = '[NÃO UTILIZAR][a11y base] ';
// A lib tem inconsistências reais de nomenclatura entre sets (confirmado:
// "nome acessivel" vs "nome acesivel" em properties, e aqui o set
// "texto alternativo para imagens" não tem o espaço após "[a11y base]").
// Por isso o match usa regex tolerante a espaço ausente/duplicado em vez
// de comparar com startsWith(A11Y_BASE_PREFIX) — mais robusto a longo prazo.
const A11Y_BASE_RE = /^\[NÃO UTILIZAR\]\[a11y base\]\s*/;
const FIGMA_API = 'https://api.figma.com';

if (!TOKEN) {
  console.error('⛔  FIGMA_TOKEN environment variable not set.');
  console.error('   Set it via: export FIGMA_TOKEN=xxx');
  process.exit(1);
}

async function figmaGet(pathName) {
  const url = FIGMA_API + pathName;
  const res = await fetch(url, { headers: { 'X-Figma-Token': TOKEN } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${pathName} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const ILLEGAL_CHARS = [0x2028, 0x2029, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF];
const ILLEGAL_RE = new RegExp('[' + ILLEGAL_CHARS.map(c => '\\u' + c.toString(16).padStart(4, '0')).join('') + '\\x00]', 'g');
const clean = (s) => typeof s === 'string' ? s.replace(ILLEGAL_RE, '') : s;

// Property key da API vem como "nome#123:45" — separa o nome legível
// (usado pra casar com propCandidates no code.js) do id interno de sync.
function splitPropKey(rawKey) {
  const idx = rawKey.lastIndexOf('#');
  if (idx === -1) return { name: rawKey, syncId: null };
  return { name: rawKey.slice(0, idx), syncId: rawKey.slice(idx + 1) };
}

function toPropertyEntry(rawKey, def) {
  const { name, syncId } = splitPropKey(rawKey);
  const entry = {
    rawKey: clean(rawKey),
    name: clean(name),
    syncId,
    type: def.type,
    defaultValue: def.defaultValue !== undefined ? def.defaultValue : null
  };
  if (def.type === 'VARIANT' && Array.isArray(def.variantOptions)) {
    entry.variantOptions = def.variantOptions.map(clean);
  }
  return entry;
}

async function discoverA11yBaseSets() {
  let cursor = null;
  const sets = [];
  do {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const resp = await figmaGet(`/v1/files/${FILE_KEY}/component_sets${qs}`);
    const page = (resp && resp.meta && resp.meta.component_sets) || [];
    for (const s of page) {
      if (typeof s.name === 'string' && A11Y_BASE_RE.test(s.name)) {
        sets.push({
          nodeId: s.node_id,
          key: s.key,
          fullName: clean(s.name),
          shortName: clean(s.name.replace(A11Y_BASE_RE, ''))
        });
      }
    }
    cursor = resp && resp.meta && resp.meta.cursor && resp.meta.cursor.after;
  } while (cursor);
  return sets;
}

// A REST API aceita uma lista de ids numa única chamada /nodes?ids=a,b,c —
// evita 25 requisições separadas.
async function fetchNodesBatch(nodeIds) {
  const resp = await figmaGet(`/v1/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(nodeIds.join(','))}`);
  return (resp && resp.nodes) || {};
}

async function main() {
  console.log(`→ Design Acessível (${FILE_KEY})`);

  const baseSets = await discoverA11yBaseSets();
  console.log(`    component sets "${A11Y_BASE_PREFIX}*" encontrados: ${baseSets.length}`);
  if (baseSets.length === 0) {
    console.error('⛔  Nenhum component set com o prefixo esperado foi encontrado — lib pode ter sido reestruturada.');
    process.exit(1);
  }

  const nodesData = await fetchNodesBatch(baseSets.map(s => s.nodeId));

  const components = [];
  const warnings = [];

  for (const set of baseSets) {
    const nodeEntry = nodesData[set.nodeId];
    const doc = nodeEntry && nodeEntry.document;
    if (!doc) {
      warnings.push(`node ${set.nodeId} (${set.shortName}): sem "document" no retorno de /nodes`);
      continue;
    }

    const defs = doc.componentPropertyDefinitions || {};
    const properties = Object.entries(defs).map(([rawKey, def]) => toPropertyEntry(rawKey, def));

    const booleans = properties.filter(p => p.type === 'BOOLEAN');
    const texts = properties.filter(p => p.type === 'TEXT');
    const variants = properties.filter(p => p.type === 'VARIANT');

    components.push({
      nodeId: set.nodeId,
      key: set.key,
      fullName: set.fullName,
      shortName: set.shortName,
      properties,
      propertiesByType: {
        toggles: booleans.map(p => p.name),
        texts: texts.map(p => p.name),
        variants: variants.map(p => p.name)
      }
    });

    console.log(`    ${set.shortName}: ${booleans.length} toggle(s) · ${texts.length} texto(s) · ${variants.length} variante(s)`);
  }

  const out = {
    _meta: {
      description: 'Component property definitions (toggles booleanos, campos de texto, variantes) dos 25 component sets internos "[NÃO UTILIZAR][a11y base] *" da lib Design Acessível — conteúdo consumido para montar o formulário dinâmico de specs de acessibilidade. Não confundir com refs/design-acessivel.json (achatado, sem properties) nem com refs/design-acessivel-content.json (conteúdo de texto fixo por variante, catalogado manualmente).',
      fileKey: FILE_KEY,
      generatedAt: new Date().toISOString(),
      generator: 'fetch-a11y-component-properties.cjs',
      schema: {
        components: 'array — um item por component set "[a11y base]"',
        'components[].nodeId': 'node_id do component set no arquivo Figma (usado em GET /v1/files/:key/nodes)',
        'components[].key': 'component key publicada (usado em figma.importComponentByKeyAsync se algum dia necessário)',
        'components[].fullName': 'nome completo do node no Figma, incluindo o prefixo "[NÃO UTILIZAR][a11y base] "',
        'components[].shortName': 'nome sem o prefixo — chave amigável para UI e para casar com A11Y_CONTENT (design-acessivel-content.json)',
        'components[].properties': 'array flat de todas as component property definitions do set',
        'components[].properties[].rawKey': 'chave exata como retornada pela API, ex: "observacoes#7489:0" — usar para depuração, não para lookup',
        'components[].properties[].name': 'nome legível sem o sufixo #id, ex: "observacoes" — usar para casar com componentProperties em runtime (mesmo método de _findNestedInstanceWithAnyProp em code.js)',
        'components[].properties[].syncId': 'sufixo #id (sync key), null se a property não tiver um (raro)',
        'components[].properties[].type': '"BOOLEAN" | "TEXT" | "VARIANT"',
        'components[].properties[].defaultValue': 'valor padrão retornado pela API',
        'components[].properties[].variantOptions': 'presente só quando type === "VARIANT" — lista de valores aceitos',
        'components[].propertiesByType': 'mesmos dados de properties, já separados por type e reduzidos a só os nomes — atalho para montar toggles/campos/variantes na UI sem re-filtrar o array',
        warnings: 'lista de avisos não fatais (ex: node sem retorno) — JSON pode estar parcial se não vazio'
      },
      warnings
    },
    components
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`✓ ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log(`  ${components.length}/${baseSets.length} component sets extraídos`);
  if (warnings.length) {
    console.warn(`⚠  ${warnings.length} warning(s) — ver _meta.warnings no JSON gerado`);
    process.exit(2);
  }
}

main().catch(e => {
  console.error('⛔  Fatal:', e.message);
  process.exit(1);
});
