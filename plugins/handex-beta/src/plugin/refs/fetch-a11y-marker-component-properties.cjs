// ============================================================
// HANDEX — fetch-a11y-marker-component-properties.cjs
// Irmão de fetch-a11y-component-properties.cjs (que cobre só os 25 sets
// "[NÃO UTILIZAR][a11y base] *", conteúdo do formulário dinâmico de specs).
// Este script cobre os 14 component sets RESTANTES da lib "Design Acessível"
// (fileKey Wy0IhXRVZMSOOr8E609UqI) — 39 sets no arquivo ao todo, 25 + 14.
//
// Os 14 restantes não são "conteúdo de spec": são os MARCADORES/conectores/
// wrapper usados no canvas (Agrupamento, Conectores, Order, Legenda, Screen
// Size, Zoom, Item Number, Combinados, Box specs LT) — inclusive duplicados
// entre a frame "Conectores  [Handoff]" (uso normal) e "Conectores  [DSC
// Handoff]" (prefixo "[EXCLUSIVO DSC]", outra vertical/finalidade). Por isso
// um arquivo de saída separado: consumo e semântica diferentes dos 25 "base"
// (ver design-acessivel-component-properties.json), não porque a extração em
// si mude — o mecanismo /component_sets + /nodes é idêntico.
//
// Uso:
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-a11y-marker-component-properties.cjs
//
// Requer Node 18+ (usa fetch nativo). Sem dependências novas.
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const OUT_PATH = path.join(REFS_DIR, 'design-acessivel-marker-component-properties.json');
const TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = 'Wy0IhXRVZMSOOr8E609UqI';
const A11Y_BASE_RE = /^\[NÃO UTILIZAR\]\[a11y base\]\s*/;
const FIGMA_API = 'https://api.figma.com';
const FETCH_TIMEOUT_MS = 20000;

if (!TOKEN) {
  console.error('⛔  FIGMA_TOKEN environment variable not set.');
  console.error('   Set it via: export FIGMA_TOKEN=xxx');
  process.exit(1);
}

async function figmaGet(pathName) {
  const url = FIGMA_API + pathName;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { headers: { 'X-Figma-Token': TOKEN }, signal: controller.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`GET ${pathName} → timeout após ${FETCH_TIMEOUT_MS}ms`);
    throw new Error(`GET ${pathName} → falha de rede: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${pathName} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const ILLEGAL_CHARS = [0x2028, 0x2029, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF];
const ILLEGAL_RE = new RegExp('[' + ILLEGAL_CHARS.map(c => '\\u' + c.toString(16).padStart(4, '0')).join('') + '\\x00]', 'g');
const clean = (s) => typeof s === 'string' ? s.replace(ILLEGAL_RE, '') : s;

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

// Deriva um shortName/family genéricos a partir do fullName. Prefixos
// conhecidos: "[NÃO UTILIZAR][a11y base] " (não deveria aparecer aqui — os
// 25 "base" ficam no outro catálogo, mas se a lib crescer e algum entrar
// nesta lista por engano isso ainda resolve sem quebrar), "[EXCLUSIVO DSC]"
// e "[a11y]". A ordem do replace importa: remove o prefixo mais específico
// primeiro para não deixar sobra tipo "[a11y] " colado no meio.
const DSC_RE = /^\[EXCLUSIVO DSC\]\s*/;
const A11Y_TAG_RE = /^\[a11y\]\s*/;

function deriveNames(fullName) {
  const original = clean(fullName);
  const isDsc = DSC_RE.test(original);
  let rest = original.replace(A11Y_BASE_RE, '').replace(DSC_RE, '').replace(A11Y_TAG_RE, '').trim();
  const baseSlug = rest
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return { plainName: rest, baseSlug, isDsc };
}

// Descobre TODOS os component sets do arquivo, sem filtro de prefixo, e
// separa os que já pertencem ao catálogo "base" (25, outro script/arquivo)
// dos demais (os 14 alvo deste script). Mantém os "base" fora do JSON de
// saída para não duplicar dado entre os dois catálogos.
async function discoverAllSets() {
  let cursor = null;
  const all = [];
  do {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const resp = await figmaGet(`/v1/files/${FILE_KEY}/component_sets${qs}`);
    const page = (resp && resp.meta && resp.meta.component_sets) || [];
    for (const s of page) {
      if (typeof s.name !== 'string') continue;
      all.push({ nodeId: s.node_id, key: s.key, fullName: clean(s.name) });
    }
    cursor = resp && resp.meta && resp.meta.cursor && resp.meta.cursor.after;
  } while (cursor);
  return all;
}

async function fetchNodesBatch(nodeIds) {
  const resp = await figmaGet(`/v1/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(nodeIds.join(','))}`);
  return (resp && resp.nodes) || {};
}

async function main() {
  console.log(`→ Design Acessível (${FILE_KEY}) — sets fora do catálogo "[a11y base]"`);

  const allSets = await discoverAllSets();
  console.log(`    component sets no arquivo (total): ${allSets.length}`);

  const baseSets = allSets.filter(s => A11Y_BASE_RE.test(s.fullName));
  const markerSets = allSets.filter(s => !A11Y_BASE_RE.test(s.fullName));
  console.log(`    "[a11y base]" (já catalogados em design-acessivel-component-properties.json): ${baseSets.length}`);
  console.log(`    restantes (alvo deste script): ${markerSets.length}`);

  if (allSets.length !== 39) {
    console.warn(`⚠  esperava 39 component sets no arquivo, encontrei ${allSets.length} — lib pode ter sido reestruturada desde a investigação manual.`);
  }

  // Detecta colisão de baseSlug (ex.: "Conectores" normal vs "[EXCLUSIVO DSC]
  // Conectores") para decidir quando o shortName precisa do sufixo "-dsc".
  const slugCounts = {};
  const derived = markerSets.map(s => {
    const d = deriveNames(s.fullName);
    slugCounts[d.baseSlug] = (slugCounts[d.baseSlug] || 0) + 1;
    return { ...s, ...d };
  });

  const nodesData = await fetchNodesBatch(markerSets.map(s => s.nodeId));

  const components = [];
  const warnings = [];

  for (const set of derived) {
    const nodeEntry = nodesData[set.nodeId];
    const doc = nodeEntry && nodeEntry.document;
    if (!doc) {
      warnings.push(`node ${set.nodeId} (${set.fullName}): sem "document" no retorno de /nodes`);
      continue;
    }

    const defs = doc.componentPropertyDefinitions || {};
    const properties = Object.entries(defs).map(([rawKey, def]) => toPropertyEntry(rawKey, def));

    const booleans = properties.filter(p => p.type === 'BOOLEAN');
    const texts = properties.filter(p => p.type === 'TEXT');
    const variants = properties.filter(p => p.type === 'VARIANT');

    const hasCollision = slugCounts[set.baseSlug] > 1;
    const shortName = hasCollision
      ? (set.isDsc ? `${set.baseSlug}-dsc` : set.baseSlug)
      : set.baseSlug;

    components.push({
      nodeId: set.nodeId,
      key: set.key,
      fullName: set.fullName,
      shortName,
      family: set.isDsc ? 'dsc-handoff' : 'handoff',
      properties,
      propertiesByType: {
        toggles: booleans.map(p => p.name),
        texts: texts.map(p => p.name),
        variants: variants.map(p => p.name)
      }
    });

    console.log(`    ${set.fullName} → ${shortName} [${set.isDsc ? 'dsc-handoff' : 'handoff'}]: ${booleans.length} toggle(s) · ${texts.length} texto(s) · ${variants.length} variante(s)`);
  }

  const out = {
    _meta: {
      description: 'Component property definitions (toggles booleanos, campos de texto, variantes) dos 14 component sets da lib Design Acessível que NÃO fazem parte do conteúdo de spec "[NÃO UTILIZAR][a11y base] *" (ver design-acessivel-component-properties.json, os outros 25). São os marcadores/conectores/wrapper usados no canvas: Agrupamento, Conectores, Order, Legenda, Screen Size, Zoom, Item Number, Combinados e o wrapper "Box specs LT" — cada um com uma versão normal (frame "Conectores  [Handoff]") e uma "[EXCLUSIVO DSC]" (frame "Conectores  [DSC Handoff]"), exceto Legenda/Screen Size/Zoom/Box specs LT que só existem numa versão. 25 + 14 = 39 component sets no arquivo ao todo.',
      fileKey: FILE_KEY,
      generatedAt: new Date().toISOString(),
      generator: 'fetch-a11y-marker-component-properties.cjs',
      totalComponentSetsInFile: allSets.length,
      baseCatalogCount: baseSets.length,
      schema: {
        components: 'array — um item por component set fora do catálogo "[a11y base]"',
        'components[].nodeId': 'node_id do component set no arquivo Figma (usado em GET /v1/files/:key/nodes)',
        'components[].key': 'component key publicada (usado em figma.importComponentByKeyAsync)',
        'components[].fullName': 'nome completo do node no Figma, com prefixos originais (ex.: "[EXCLUSIVO DSC][a11y] Conectores")',
        'components[].shortName': 'nome normalizado (minúsculo, sem acento, kebab-case), sem os prefixos "[a11y]"/"[EXCLUSIVO DSC]"/"[NÃO UTILIZAR][a11y base]". Quando o mesmo nome existe nas duas famílias (handoff normal e DSC), a versão DSC recebe sufixo "-dsc" para não colidir (ex.: "conectores" vs "conectores-dsc").',
        'components[].family': '"handoff" (frame "Conectores  [Handoff]", uso normal) | "dsc-handoff" (frame "Conectores  [DSC Handoff]", prefixo "[EXCLUSIVO DSC]" — outra vertical/finalidade)',
        'components[].properties': 'array flat de todas as component property definitions do set',
        'components[].properties[].rawKey': 'chave exata como retornada pela API, ex: "letra#3925:6" — usar para depuração ou para setProperties direto quando a key é estável',
        'components[].properties[].name': 'nome legível sem o sufixo #id, ex: "letra"',
        'components[].properties[].syncId': 'sufixo #id (sync key), null se a property não tiver um',
        'components[].properties[].type': '"BOOLEAN" | "TEXT" | "VARIANT"',
        'components[].properties[].defaultValue': 'valor padrão retornado pela API',
        'components[].properties[].variantOptions': 'presente só quando type === "VARIANT" — lista de valores aceitos',
        'components[].propertiesByType': 'atalho: mesmos dados de properties, separados por type e reduzidos a só os nomes',
        warnings: 'lista de avisos não fatais — JSON pode estar parcial se não vazio'
      },
      warnings
    },
    components
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`✓ ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log(`  ${components.length}/${markerSets.length} component sets extraídos`);
  if (warnings.length) {
    console.warn(`⚠  ${warnings.length} warning(s) — ver _meta.warnings no JSON gerado`);
    process.exit(2);
  }
}

main().catch(e => {
  console.error('⛔  Fatal:', e.message);
  process.exit(1);
});
