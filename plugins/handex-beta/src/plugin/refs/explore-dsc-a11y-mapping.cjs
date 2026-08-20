// ============================================================
// HANDEX — explore-dsc-a11y-mapping.cjs
// EXPLORATÓRIO / PROPOSTA NOVA — não integrado a nada do pipeline atual.
//
// Objetivo: para a lib "Web Angular & React" (fileKey abaixo), buscar os
// componentes REAIS (nome + key) via REST API própria — refs/web-angular-react.json
// só guarda um array de componentKeys (strings soltas, sem nome), então não dá
// pra fazer heurística de correspondência textual a partir dele.
//
// Este script NÃO toca em fetch-design-refs.cjs, _skeleton.json, _manifest.json
// nem em nenhum arquivo já existente em refs/ — faz sua própria chamada GET
// /v1/files/:key/components (retorna nome + key de cada componente publicado,
// sem precisar de /nodes em lote) e escreve tudo em um arquivo de saída novo.
//
// Depois de buscar, aplica uma heurística simples de correspondência textual
// entre o nome de cada componente DSC e as 25 categorias de a11y (mesmas
// shortNames de design-acessivel-component-properties.json, catalogadas por
// fetch-a11y-component-properties.cjs) — só para dar um primeiro sinal de
// quantos componentes têm nome parecido com alguma categoria, não é um
// mapeamento definitivo nem uma integração com o scan de conformidade.
//
// Uso:
//   FIGMA_TOKEN=xxx node src/plugin/refs/explore-dsc-a11y-mapping.cjs
//
// Requer Node 18+ (usa fetch nativo). Sem dependências novas.
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const OUT_PATH = path.join(REFS_DIR, 'explore-dsc-a11y-mapping.json');
const A11Y_PROPS_PATH = path.join(REFS_DIR, 'design-acessivel-component-properties.json');
const TOKEN = process.env.FIGMA_TOKEN;
const FILE_KEY = '8QvOeTODSBi3PquJT5CISP'; // Web Angular & React (ver _manifest.json)
const FIGMA_API = 'https://api.figma.com';
const FETCH_TIMEOUT_MS = 30000;

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
    throw new Error(`GET ${pathName} → HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const ILLEGAL_CHARS = [0x2028, 0x2029, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF];
const ILLEGAL_RE = new RegExp('[' + ILLEGAL_CHARS.map(c => '\\u' + c.toString(16).padStart(4, '0')).join('') + '\\x00]', 'g');
const clean = (s) => typeof s === 'string' ? s.replace(ILLEGAL_RE, '') : s;

function normalize(s) {
  return clean(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// GET /v1/files/:key/components pagina via cursor, retorna todos os
// componentes publicados do arquivo com name + key (sem precisar buscar
// /nodes por id — nome já vem pronto aqui).
async function fetchAllComponents() {
  let cursor = null;
  const all = [];
  do {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const resp = await figmaGet(`/v1/files/${FILE_KEY}/components${qs}`);
    const page = (resp && resp.meta && resp.meta.components) || [];
    for (const c of page) {
      all.push({
        key: c.key,
        nodeId: c.node_id,
        name: clean(c.name),
        containingFrame: c.containing_frame && c.containing_frame.name ? clean(c.containing_frame.name) : null,
        containingComponentSet: c.containing_frame && c.containing_frame.containingStateGroup
          ? clean(c.containing_frame.containingStateGroup.name || '')
          : null
      });
    }
    cursor = resp && resp.meta && resp.meta.cursor && resp.meta.cursor.after;
  } while (cursor);
  return all;
}

function loadA11yCategories() {
  if (!fs.existsSync(A11Y_PROPS_PATH)) {
    console.warn(`⚠  ${path.relative(process.cwd(), A11Y_PROPS_PATH)} não encontrado — heurística de match ficará vazia.`);
    return [];
  }
  const data = JSON.parse(fs.readFileSync(A11Y_PROPS_PATH, 'utf8'));
  return (data.components || []).map(c => ({
    shortName: c.shortName,
    normalized: normalize(c.shortName)
  }));
}

// Heurística puramente textual, sem pretensão de precisão alta:
// 1. match exato normalizado (raro, nomes de lib != nomes de categoria)
// 2. a categoria inteira aparece como substring do nome do componente
// 3. pelo menos uma palavra "significativa" (len >= 4) da categoria aparece
//    como palavra inteira no nome do componente
// Confiança é só um rótulo relativo para leitura humana, não um score calibrado.
function matchCategory(componentName, categories) {
  const normName = normalize(componentName);
  const nameWords = new Set(normName.split(' ').filter(Boolean));

  let best = null;
  for (const cat of categories) {
    if (!cat.normalized) continue;
    if (normName === cat.normalized) {
      best = { category: cat.shortName, confidence: 'alta', reason: 'match exato' };
      break;
    }
    if (normName.includes(cat.normalized)) {
      const candidate = { category: cat.shortName, confidence: 'alta', reason: 'categoria contida no nome' };
      if (!best || best.confidence !== 'alta') best = candidate;
      continue;
    }
    const catWords = cat.normalized.split(' ').filter(w => w.length >= 4);
    const hit = catWords.find(w => nameWords.has(w));
    if (hit) {
      const candidate = { category: cat.shortName, confidence: 'media', reason: `palavra em comum: "${hit}"` };
      if (!best) best = candidate;
    }
  }
  return best;
}

async function main() {
  console.log(`→ Web Angular & React (${FILE_KEY}) — busca própria, sem tocar em fetch-design-refs.cjs`);

  const categories = loadA11yCategories();
  console.log(`  categorias de a11y carregadas: ${categories.length}`);

  const components = await fetchAllComponents();
  console.log(`  componentes reais encontrados via /components: ${components.length}`);

  // /v1/files/:key/components retorna nome de VARIANTE (ex: "state=hover,
  // status=editable"), não o nome do component set. O nome que importa pra
  // heurística de categoria é containingFrame (ex: "[dsc] Accordion") — usar
  // c.name aqui produzia falsos positivos (substring de variant/state batendo
  // por acaso com categorias). Quando containingFrame não existe, cai no nome
  // bruto do componente como fallback.
  const results = components.map(c => {
    const matchBasis = c.containingFrame || c.name;
    const match = matchCategory(matchBasis, categories);
    return {
      key: c.key,
      nodeId: c.nodeId,
      name: c.name,
      containingFrame: c.containingFrame,
      matchBasis,
      match: match ? match.category : null,
      confidence: match ? match.confidence : 'nenhuma',
      reason: match ? match.reason : null
    };
  });

  const summary = {
    total: results.length,
    alta: results.filter(r => r.confidence === 'alta').length,
    media: results.filter(r => r.confidence === 'media').length,
    nenhuma: results.filter(r => r.confidence === 'nenhuma').length
  };

  const byCategory = {};
  for (const r of results) {
    if (!r.match) continue;
    byCategory[r.match] = byCategory[r.match] || [];
    byCategory[r.match].push({ name: r.name, confidence: r.confidence, key: r.key });
  }

  // Cada componente publicado é uma VARIANTE (o mesmo set gera várias linhas
  // em /components, uma por combinação de propriedade). Para responder
  // "quantos componentes/sets reais existem" e "taxa de match por set" —
  // não por variante — agrupa por matchBasis (containingFrame ou nome bruto).
  const setsMap = new Map();
  for (const r of results) {
    const setKey = r.matchBasis;
    if (!setsMap.has(setKey)) {
      setsMap.set(setKey, { setName: setKey, variantCount: 0, match: r.match, confidence: r.confidence, reason: r.reason });
    }
    setsMap.get(setKey).variantCount += 1;
  }
  const sets = Array.from(setsMap.values());
  const setsSummary = {
    totalSets: sets.length,
    alta: sets.filter(s => s.confidence === 'alta').length,
    media: sets.filter(s => s.confidence === 'media').length,
    nenhuma: sets.filter(s => s.confidence === 'nenhuma').length
  };

  const out = {
    _meta: {
      description: 'EXPLORATÓRIO. Componentes reais da lib Web Angular & React (nome + key, buscados via GET /v1/files/:key/components própria deste script) cruzados por heurística textual simples com as 25 categorias de a11y catalogadas em design-acessivel-component-properties.json. Não é um mapeamento oficial nem integrado ao scan de conformidade — serve só para avaliação humana da viabilidade da ideia.',
      fileKey: FILE_KEY,
      generatedAt: new Date().toISOString(),
      generator: 'explore-dsc-a11y-mapping.cjs',
      summary,
      setsSummary,
      note: '"summary" conta cada VARIANTE publicada individualmente (results[], igual à contagem achatada de _manifest.json ~1885/1893). "setsSummary" agrupa por component set real (campo matchBasis = containingFrame) — é essa a contagem que responde "quantos componentes reais existem" e a taxa de match relevante, já que a heurística roda sobre o nome do set, não da variante.'
    },
    results,
    byCategory,
    sets
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`✓ ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log(`  total: ${summary.total} | confiança alta: ${summary.alta} | média: ${summary.media} | nenhuma: ${summary.nenhuma}`);
}

main().catch(e => {
  console.error('⛔  Fatal:', e.message);
  process.exit(1);
});
