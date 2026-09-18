// ============================================================
// HAC — fetch-component-properties.cjs
// Extração PROFUNDA de component property definitions (toggles
// BOOLEAN, campos TEXT, VARIANT com opções, INSTANCE_SWAP) para
// QUALQUER uma das libs DSC cadastradas em refs/_manifest.json —
// generalização de fetch-a11y-component-properties.cjs (Handex Beta,
// escopado só à lib desktop "Design Acessível") para cobrir as 5
// libs do hac: as 3 de produção (web-angular-react, super-app,
// super-dsc-web) e as 2 de acessibilidade (design-acessivel,
// design-acessivel-mobile).
//
// ------------------------------------------------------------
// POR QUE A UNIDADE DE TRABALHO É "COMPONENT SET", NÃO "VARIANTE":
// ------------------------------------------------------------
// componentPropertyDefinitions só existe no nível do COMPONENT_SET
// (a família — ex: "[dsc] Button"), nunca por variante individual
// isolada. Os JSONs de refs/{slug}.json (gerados por
// fetch-design-refs.cjs) guardam uma entrada por VARIANTE (com
// `containingFrame` = nome do set-pai), mas nenhum node_id — só
// `key` (component key publicada, formato hash, não aceito por
// GET /nodes, que exige node_id formato "123:45").
//
// Por isso este script SEMPRE descobre node_ids do zero via
// GET /v1/files/:key/component_sets (paginado), nunca a partir dos
// JSONs de variantes já existentes. Isso também reduz drasticamente
// o volume real de chamadas: a granularidade útil são os component
// sets reais (dezenas a poucas centenas por lib), não os milhares de
// variantes/ícones soltos contados em _manifest.json.
//
// Confirmado nos dados reais do repo (2026-09-01):
//   web-angular-react  →   61 component sets reais (todo containingFrame já é 1:1 com um set)
//   super-app          →   70 component sets "[dsc] *" (mais ~1420 ícones soltos, fora do escopo)
//   super-dsc-web       →   93 component sets "[dsc] *"/"⚙️ *"
//   design-acessivel     →   25 component sets "[NÃO UTILIZAR][a11y base] *"
//   design-acessivel-mobile → ~39 component sets "[a11y mob base] *" (alguns OCULTOS, prefixo "."
//                              — não aparecem em /component_sets, só na árvore completa do doc,
//                              ver achado real documentado em design-acessivel-mobile-link-property.json)
// Total real ≈ 288 component sets, não os ~11 mil componentes/variantes
// somados no manifest — a extração profunda NUNCA precisou visitar
// variante por variante, só a família.
//
// ------------------------------------------------------------
// DESCOBERTA DE NODE IDS (2 camadas, camada 2 é fallback):
// ------------------------------------------------------------
//   1. GET /v1/files/:key/component_sets (paginado por cursor) —
//      cobre a grande maioria dos casos (sets publicados/visíveis).
//   2. GET /v1/files/:key?depth=<N> (árvore completa, sem valores
//      resolvidos) — busca adicional, ativada com --deep-scan, para
//      achar component sets OCULTOS da lista de assets (prefixo "."
//      na convenção Figma, sem `key` publicada). Caso real já
//      confirmado na lib design-acessivel-mobile (".[a11y mob base]
//      Link do Componente", node 5536:8553) — não tem key publicada,
//      não pode ser importado via figma.importComponentByKeyAsync,
//      mas TEM componentPropertyDefinitions relevantes.
//
// ------------------------------------------------------------
// PAGINAÇÃO / RATE LIMIT / CHECKPOINT:
// ------------------------------------------------------------
// GET /v1/files/:key/nodes?ids=a,b,c aceita uma lista de node_ids
// numa única chamada, mas:
//   - a URL tem limite prático de tamanho → lotes de NODES_BATCH_SIZE
//     ids por chamada (default 80, configurável via --batch-size).
//   - a API tem rate limit por minuto → delay fixo entre chamadas
//     (default 1100ms, configurável via --delay-ms) — number sozinho
//     não evita 429 em contas com limite mais apertado; se ocorrer
//     429, o script faz retry com backoff exponencial (até 3
//     tentativas) antes de desistir do lote.
//
// Progresso é persistido incrementalmente em
// refs/.checkpoints/{slug}-properties.checkpoint.json — a cada lote
// bem-sucedido, o checkpoint é regravado (não só ao final). Se o
// processo for interrompido (timeout de CI, erro fatal, Ctrl+C), a
// PRÓXIMA execução com os MESMOS argumentos (mesma lib) retoma dali:
// re-lê o checkpoint, filtra os node_ids já resolvidos com sucesso, e
// só busca o que falta. O checkpoint guarda um hash do conjunto total
// de node_ids esperado (assinatura da descoberta) — se a lib mudar
// entre execuções (set novo, set removido), o hash diverge e o
// checkpoint é invalidado (log de aviso + reinício limpo) em vez de
// silenciosamente misturar dados de estruturas diferentes.
//
// O JSON final de saída (refs/{slug}-properties.json) só é escrito
// quando TODOS os node_ids da descoberta foram resolvidos (sucesso
// total) — enquanto isso, o estado "parcial" vive só no checkpoint,
// nunca num arquivo -properties.json incompleto. Use --finalize-partial
// para forçar a escrita do output mesmo com pendências/erros (gera
// _meta.warnings não vazio e exit code 2, mesmo padrão dos outros
// scripts de refs/).
//
// ------------------------------------------------------------
// USO:
// ------------------------------------------------------------
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-component-properties.cjs --lib design-acessivel
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-component-properties.cjs --lib super-app --deep-scan
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-component-properties.cjs --all
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-component-properties.cjs --lib web-angular-react --batch-size 60 --delay-ms 1500
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-component-properties.cjs --lib super-dsc-web --finalize-partial
//   FIGMA_TOKEN=xxx node src/plugin/refs/fetch-component-properties.cjs --lib design-acessivel --reset   (ignora checkpoint existente)
//
// Requer Node 18+ (usa fetch nativo). Sem dependências novas.
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REFS_DIR = __dirname;
const MANIFEST_PATH = path.join(REFS_DIR, '_manifest.json');
const CHECKPOINT_DIR = path.join(REFS_DIR, '.checkpoints');
const TOKEN = process.env.FIGMA_TOKEN;
const FIGMA_API = 'https://api.figma.com';

// ------------------------------------------------------------
// Libs elegíveis para extração profunda. As 3 de produção vêm do
// _manifest.json (fonte única de verdade para fileKey); as 2 de
// acessibilidade não estão no manifest (ver nota em _manifest.json
// sobre por que — component keys hardcoded em code.js), então ficam
// declaradas aqui, com o mesmo padrão de {slug, name, fileKey}.
// A11Y_BASE_PREFIX_RE seleciona quais component sets do arquivo
// interessam (evita varrer templates/documentação irrelevantes nas
// libs de produção, que não têm prefixo restritivo e por isso não
// definem prefixRe — nesse caso TODOS os component sets do arquivo
// entram no escopo).
// ------------------------------------------------------------
const A11Y_LIBRARIES = [
  {
    slug: 'design-acessivel',
    name: 'Design Acessível (desktop)',
    fileKey: 'Wy0IhXRVZMSOOr8E609UqI',
    prefixRe: /^\[N[ÃA]O UTILIZAR\]\[a11y base\]\s*/i
  },
  {
    slug: 'design-acessivel-mobile',
    name: 'Design Acessível (mobile)',
    // Migrado (2026-09-15) de '3zdtN13YvPlCGPdXeL0Y2i' (arquivo antigo,
    // ainda publicado/ativo mas sendo DESCONTINUADO — confirmado com o
    // dono do repo) para 'HhriLSpKnCB2dHhyiU16iB' ("[HAC] Handoff Super
    // DSC Mobile e Web"), publicado como team library em algum momento
    // entre 2026-09-08 (0 components via REST API) e 2026-09-15 (250
    // components/51 component_sets, confirmado). A lib nova SUBSTITUI a
    // antiga — não é uma segunda fonte em paralelo.
    fileKey: 'HhriLSpKnCB2dHhyiU16iB',
    // Prefixo mudou de "[a11y mob ...]" pra "[hac ...]" na lib nova —
    // confirmado nos nomes reais: wrappers publicados "[hac mob] Box
    // specs leitor de tela"/"[hac] Agrupamento"/"[hac] Conectores"/"[hac]
    // Número da tela"/"[hac] Ordenação"/"[hac web] Box specs leitor de
    // tela"; nós OCULTOS internos (sem key, só via --deep-scan) como
    // ".[hac mob base]  Elementos e imagens" (node 10206:2177 — NOTA:
    // dois espaços reais entre "]" e "Elementos" no nome do Figma, \s+
    // no regex cobre isso) e ".[hac base] Box conteúdo bloqueado/editável".
    // Mesmo espírito do regex antigo: prefixo "." opcional (sets ocultos),
    // "[hac" + sufixo opcional "mob"/"web" + sufixo opcional "base".
    prefixRe: /^\.?\[hac(?:\s+(?:mob|web))?(?:\s+base)?\]\s*/i
  }
];

if (!TOKEN) {
  console.error('⛔  FIGMA_TOKEN environment variable not set.');
  console.error('   Set it via: export FIGMA_TOKEN=xxx');
  process.exit(1);
}

// ------------------------------------------------------------
// Arg parsing
// ------------------------------------------------------------
const argv = process.argv.slice(2);
function flagVal(flag, def = null) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : def;
}
const hasFlag = (flag) => argv.includes(flag);

const LIB_SLUG = flagVal('--lib');
const RUN_ALL = hasFlag('--all');
const DEEP_SCAN = hasFlag('--deep-scan');
const RESET = hasFlag('--reset');
const FINALIZE_PARTIAL = hasFlag('--finalize-partial');
const BATCH_SIZE = parseInt(flagVal('--batch-size', '80'), 10);
const DELAY_MS = parseInt(flagVal('--delay-ms', '1100'), 10);
const MAX_RETRIES = parseInt(flagVal('--max-retries', '3'), 10);
const TIME_BUDGET_MS = parseInt(flagVal('--time-budget-ms', '0'), 10); // 0 = sem limite (roda até terminar ou falhar)
const DEEP_SCAN_MAX_DEPTH = parseInt(flagVal('--deep-scan-depth', '4'), 10);
// Profundidade separada (maior) usada SÓ pra construir o parentSetIndex
// (camada 3, sub-variantes "Leitor de Tela") — depth=4 (usado pra achar os
// sets ocultos "[hac ...]") já esgota a profundidade exatamente na própria
// variante-folha (".Button" > "Leitor de Tela=Loading"), sem descer aos
// filhos dela (INSTANCE "Nome Acessível" etc, onde vive o
// componentPropertyReferences real). Confirmado empiricamente (2026-09-17):
// depth=5 já é suficiente pra essa lib; default 6 dá 1 nível de folga pra
// tolerar estruturas um pouco mais profundas sem precisar reconfirmar toda
// vez. Custo real medido: ~2.3MB (depth=4) -> ~5.8MB (depth=5) no arquivo
// design-acessivel-mobile — aceitável, é 1 chamada a mais por lib (só
// quando --deep-scan), não por component set.
const SCREEN_READER_INDEX_DEPTH = parseInt(flagVal('--screen-reader-depth', '6'), 10);

if (!LIB_SLUG && !RUN_ALL) {
  console.error('⛔  Informe --lib <slug> ou --all.');
  console.error('   Libs disponíveis: web-angular-react, super-app, super-dsc-web, design-acessivel, design-acessivel-mobile');
  process.exit(1);
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const ILLEGAL_CHARS = [0x2028, 0x2029, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0xFEFF];
const ILLEGAL_RE = new RegExp('[' + ILLEGAL_CHARS.map(c => '\\u' + c.toString(16).padStart(4, '0')).join('') + '\\x00]', 'g');
const clean = (s) => typeof s === 'string' ? s.replace(ILLEGAL_RE, '') : s;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

async function figmaGet(pathName, { retries = MAX_RETRIES } = {}) {
  const url = FIGMA_API + pathName;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { 'X-Figma-Token': TOKEN } });
    if (res.ok) return res.json();

    // 429 (rate limit) e 5xx são retryable com backoff exponencial;
    // qualquer outro status (401/403/404) falha imediato — não adianta
    // retentar erro de autenticação ou node inexistente.
    const retryable = res.status === 429 || res.status >= 500;
    const body = await res.text().catch(() => '');
    if (!retryable || attempt === retries) {
      throw new Error(`GET ${pathName} → HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const backoffMs = DELAY_MS * Math.pow(2, attempt + 1);
    console.warn(`    ⚠  HTTP ${res.status} em ${pathName} — retry ${attempt + 1}/${retries} em ${backoffMs}ms`);
    await sleep(backoffMs);
  }
}

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
    type: def.type, // 'VARIANT' | 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP'
    defaultValue: def.defaultValue !== undefined ? def.defaultValue : null
  };
  if (def.type === 'VARIANT' && Array.isArray(def.variantOptions)) {
    entry.variantOptions = def.variantOptions.map(clean);
  }
  if (def.type === 'INSTANCE_SWAP' && Array.isArray(def.preferredValues)) {
    entry.preferredValues = def.preferredValues.map((v) => ({
      type: v.type || null,
      key: v.key || null
    }));
  }
  return entry;
}

// ------------------------------------------------------------
// Camada 2 de leitura — "instância aninhada por variante".
//
// Achado real (2026-09-17): alguns component sets são wrappers "vazios"
// (o próprio set só declara uma property VARIANT tipo "Componente" pra
// escolher QUAL componente real está sendo documentado) — a definição
// de propriedades relevante (BOOLEAN "Nome Acessível", "Observações"
// etc.) não vive em componentPropertyDefinitions do set, vive dentro da
// INSTANCE aninhada de CADA variante filha, com componentId e
// componentProperties (valor atual, não definição completa) próprios.
// Caso confirmado via REST API: ".[hac mob base]  Elementos e imagens"
// (fileKey HhriLSpKnCB2dHhyiU16iB, node 10206:2177) e seu equivalente
// web ".[hac web base]  Elementos e imagens" (node 10658:3627) — 66/60
// variantes filhas respectivamente, cada uma com 1 INSTANCE filha só.
//
// Detecção é ESTRUTURAL, não por nome hardcoded de set: para cada
// variante filha (children do COMPONENT_SET, cada uma um COMPONENT),
// se ela tiver exatamente 1 filho do tipo INSTANCE com
// componentProperties não vazio, extrai esse dado como
// "propriedades da variante". Sets que não têm esse padrão (a imensa
// maioria — declaram tudo no nível do set, via
// componentPropertyDefinitions) simplesmente não produzem nada aqui:
// perVariantProperties fica ausente/vazio, sem custo nem risco de
// regressão pros consumidores existentes de {slug}-properties.json.
//
// Por que estrutural e não um whitelist de slugs/nomes: a motivação
// original desta extensão foi justamente evitar hardcode de uma lista
// de nomes de componente que fica desatualizada a cada mudança da lib
// (mesmo padrão de retrabalho já visto várias vezes neste repo — ver
// princípio "a lib é a referência" no CLAUDE.md). Rodar em TODAS as
// libs (produção + a11y) é seguro porque o custo é zero (mesmo payload
// de /nodes já buscado, só um parse adicional em memória) e o critério
// estrutural (1 filho INSTANCE com componentProperties) é raro o
// bastante pra não gerar falsos positivos nos ~285 component sets reais
// varridos hoje.
// ------------------------------------------------------------
function extractPerVariantProperties(setDoc, parentSetIndex) {
  const variants = Array.isArray(setDoc.children) ? setDoc.children : [];
  const perVariant = [];

  for (const variant of variants) {
    if (!variant || variant.type !== 'COMPONENT') continue;
    const kids = Array.isArray(variant.children) ? variant.children : [];
    const instanceKids = kids.filter((k) => k && k.type === 'INSTANCE');
    if (instanceKids.length !== 1) continue; // padrão exige exatamente 1 instância aninhada

    const inst = instanceKids[0];
    const rawProps = inst.componentProperties || {};
    const propNames = Object.keys(rawProps);
    if (propNames.length === 0) continue; // instância sem componentProperties não é o padrão que buscamos

    const properties = propNames.map((rawKey) => {
      const { name, syncId } = splitPropKey(rawKey);
      const p = rawProps[rawKey] || {};
      return {
        rawKey: clean(rawKey),
        name: clean(name),
        syncId,
        type: p.type || null, // 'BOOLEAN' | 'TEXT' | 'VARIANT' | 'INSTANCE_SWAP' (valor ATUAL da instância, não definição)
        value: p.value !== undefined ? p.value : null
      };
    });

    const entry = {
      variantName: clean(variant.name || ''),
      variantId: variant.id || null,
      nestedInstanceName: clean(inst.name || ''),
      nestedInstanceId: inst.id || null,
      nestedComponentId: inst.componentId || null,
      properties,
      toggles: properties.filter((p) => p.type === 'BOOLEAN').map((p) => ({ name: p.name, value: !!p.value }))
    };

    // Camada 3 (achado real 2026-09-17, ver investigação "Leitor de Tela"):
    // o componentId referenciado pela instância aninhada pode, ele mesmo,
    // ser uma FOLHA de um segundo COMPONENT_SET oculto (ex: ".Button" com
    // sub-variantes "Leitor de Tela=Baseline/Disabled/Loading"). Quando
    // isso acontece, componentPropertyDefinitions desse SET-neto é
    // IGUAL em todas as sub-variantes (herdado do set, sempre presente) —
    // mas o BINDING REAL de visibilidade de cada property (qual nó do
    // desenho referencia aquela property via `visible`) varia por
    // sub-variante e não é dedutível a partir da definição sozinha.
    // Sem essa camada, o campo `toggles` acima reporta sempre `value:true`
    // pro default da instância (quase sempre o defaultValue do set), o que
    // já causou um falso-positivo confirmado (Switch: reportava Nome
    // Acessível=true, mas NENHUMA sub-variante real usa essa property no
    // desenho). Só populado quando parentSetIndex resolve o
    // nestedComponentId a um SET com propriedade VARIANT de sub-variantes
    // (ex: "Leitor de Tela") — ausente/undefined nos demais casos (não
    // remove nem quebra os consumidores existentes de toggles/properties).
    if (parentSetIndex && entry.nestedComponentId) {
      const resolved = resolveScreenReaderVariants(entry.nestedComponentId, parentSetIndex);
      if (resolved) entry.screenReaderVariants = resolved;
    }

    perVariant.push(entry);
  }

  return perVariant;
}

// ------------------------------------------------------------
// Camada 3 — índice reverso childComponentId -> SET pai (construído 1x por
// lib a partir da MESMA árvore completa já baixada por discoverViaTreeWalk,
// sem custo adicional de chamada) + resolução de bindings reais de
// visibilidade por sub-variante.
//
// Ambiguidade real confirmada (2026-09-17): pode existir mais de um
// COMPONENT_SET com o MESMO NOME no arquivo (ex: dois ".Button" — um do
// wrapper mobile, outro de outra seção/plataforma). Por isso o índice é
// chaveado pelo id do FILHO (nestedComponentId), não pelo nome do set —
// cada componentId só pode ser filho direto de um único COMPONENT_SET.
// ------------------------------------------------------------
function buildParentSetIndex(rootDoc) {
  const index = new Map(); // childComponentId -> { setId, setName, propertyDefinitions, siblings: [{id,name}] }

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'COMPONENT_SET' && Array.isArray(node.children)) {
      // Guarda o node COMPLETO de cada sibling (não só {id,name}) — é dele
      // que collectPropertyReferenceBindings extrai os bindings reais de
      // visibilidade em resolveScreenReaderVariants.
      const siblings = node.children.filter((c) => c && c.type === 'COMPONENT');
      for (const child of node.children) {
        if (!child || child.type !== 'COMPONENT') continue;
        index.set(child.id, {
          setId: node.id,
          setName: clean(node.name || ''),
          propertyDefinitions: node.componentPropertyDefinitions || {},
          siblings
        });
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }

  walk(rootDoc);
  return index;
}

// Percorre recursivamente um node do Figma coletando todo
// componentPropertyReferences encontrado (bindings reais de nós do
// desenho a properties — ex: {"visible": "Nome Acessível#123:45"}).
function collectPropertyReferenceBindings(node, acc) {
  if (!node || typeof node !== 'object') return acc;
  if (node.componentPropertyReferences) {
    for (const [field, rawKey] of Object.entries(node.componentPropertyReferences)) {
      const { name } = splitPropKey(rawKey);
      acc.push({ field, propertyName: clean(name), nodeName: clean(node.name || ''), nodeType: node.type });
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectPropertyReferenceBindings(child, acc);
  }
  return acc;
}

// Dado o componentId da instância aninhada (nestedComponentId), verifica se
// ele é filho de um SET com uma property VARIANT de "sub-modo" (ex: "Leitor
// de Tela", "Propriedade 1") e, se sim, resolve — POR SUB-VARIANTE IRMÃ —
// quais properties BOOLEAN têm binding ativo de visibilidade no desenho.
// Retorna null quando o componentId não é filho de nenhum SET indexado
// (componente "solto", sem sub-variantes — maioria dos casos, ex: Accordion
// simples) ou quando o SET pai não tem nenhuma property VARIANT (sem
// sub-modo a diferenciar).
function resolveScreenReaderVariants(nestedComponentId, parentSetIndex) {
  const parent = parentSetIndex.get(nestedComponentId);
  if (!parent) return null;

  const variantPropNames = Object.entries(parent.propertyDefinitions)
    .filter(([, def]) => def && def.type === 'VARIANT')
    .map(([rawKey]) => splitPropKey(rawKey).name);
  if (variantPropNames.length === 0) return null; // SET sem sub-modo (ex: só 1 variante trivial)

  const booleanDefs = Object.entries(parent.propertyDefinitions)
    .filter(([, def]) => def && def.type === 'BOOLEAN')
    .map(([rawKey]) => splitPropKey(rawKey).name);

  // parent.siblings guarda o node COMPLETO de cada sub-variante (não só
  // {id,name}) — confirmado empiricamente que depth=4 (mesmo valor já
  // usado por discoverViaTreeWalk) já traz os filhos do set oculto
  // completos, com componentPropertyReferences presentes nos descendentes.
  return {
    setName: parent.setName,
    setId: parent.setId,
    subModeProperty: variantPropNames[0], // caso real conhecido: sempre 1 property VARIANT por set neste padrão
    variants: parent.siblings.map((sib) => {
      const bindings = collectPropertyReferenceBindings(sib, []);
      const activeBooleans = booleanDefs.filter((name) =>
        bindings.some((b) => b.propertyName === name)
      );
      return {
        variantName: clean(sib.name || ''),
        variantId: sib.id || null,
        activeToggles: activeBooleans
      };
    })
  };
}

// ------------------------------------------------------------
// Resolução da lib alvo: junta libs de produção do manifest com as
// libs de a11y declaradas localmente, garantindo slug único.
// ------------------------------------------------------------
function loadEligibleLibraries() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const prodLibs = manifest.libraries.map((l) => ({
    slug: l.slug,
    name: l.name,
    fileKey: l.fileKey,
    prefixRe: null // produção: nenhum prefixo restritivo — todos os component sets do arquivo entram
  }));
  return [...prodLibs, ...A11Y_LIBRARIES];
}

// ------------------------------------------------------------
// Descoberta de node_ids (camada 1: /component_sets paginado)
// ------------------------------------------------------------
async function discoverViaComponentSetsEndpoint(fileKey, prefixRe) {
  let cursor = null;
  const sets = [];
  do {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const resp = await figmaGet(`/v1/files/${fileKey}/component_sets${qs}`);
    const page = (resp && resp.meta && resp.meta.component_sets) || [];
    for (const s of page) {
      const name = clean(s.name || '');
      if (prefixRe && !prefixRe.test(name)) continue;
      sets.push({
        nodeId: s.node_id,
        key: s.key || null,
        fullName: name,
        shortName: prefixRe ? clean(name.replace(prefixRe, '')) : name,
        source: 'component_sets'
      });
    }
    cursor = resp && resp.meta && resp.meta.cursor && resp.meta.cursor.after;
    if (cursor) await sleep(DELAY_MS);
  } while (cursor);
  return sets;
}

// ------------------------------------------------------------
// Descoberta de node_ids (camada 2, opcional: varredura de árvore
// completa via GET /files/:key?depth=N, para achar sets OCULTOS —
// prefixo "." na convenção Figma, sem key publicada, não listados em
// /component_sets. Caso real confirmado na lib design-acessivel-mobile.
// Só ativa com --deep-scan porque é uma chamada mais pesada (árvore
// inteira do arquivo) e não é necessária pras libs de produção.
// ------------------------------------------------------------
async function discoverViaTreeWalk(fileKey, prefixRe, alreadyFoundNodeIds) {
  const resp = await figmaGet(`/v1/files/${fileKey}?depth=${DEEP_SCAN_MAX_DEPTH}`);
  const found = [];
  const seen = new Set(alreadyFoundNodeIds);

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'COMPONENT_SET') {
      const name = clean(node.name || '');
      const matches = prefixRe ? prefixRe.test(name) : true;
      if (matches && !seen.has(node.id)) {
        seen.add(node.id);
        found.push({
          nodeId: node.id,
          key: node.key || null, // sets ocultos ("." prefix) tipicamente vêm sem key — confirmado
          fullName: name,
          shortName: prefixRe ? clean(name.replace(prefixRe, '')) : name,
          source: 'tree-walk'
        });
      }
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }

  const doc = resp && resp.document;
  if (doc) walk(doc);
  return found;
}

// ------------------------------------------------------------
// Descoberta de node_ids (camada 3, opcional: SEGUNDA árvore completa via
// GET /files/:key?depth=N, com depth MAIOR que o da camada 2.
//
// Por que uma chamada separada, não reaproveitar a árvore de
// discoverViaTreeWalk: achado real (2026-09-17) — DEEP_SCAN_MAX_DEPTH
// (default 4, o mínimo pra achar sets ocultos "[hac ...]") já esgota a
// profundidade EXATAMENTE na própria variante-folha do SET-neto (ex:
// ".Button" > "Leitor de Tela=Loading" já é o nó de nível 4 a partir da
// raiz, retornado com children:[] truncado) — não sobra profundidade pra
// descer aos filhos dela (INSTANCE "Nome Acessível" etc, onde vive
// componentPropertyReferences, o dado que resolveScreenReaderVariants
// precisa). depth=5 já resolveu no caso real testado; default aqui é 6
// (1 nível de folga). Custo extra medido no arquivo real: ~2.3MB (depth=4)
// -> ~5.8MB (depth=6) — aceitável por ser 1 chamada por LIB, não por
// component set.
// ------------------------------------------------------------
async function fetchScreenReaderTree(fileKey) {
  const resp = await figmaGet(`/v1/files/${fileKey}?depth=${SCREEN_READER_INDEX_DEPTH}`);
  return (resp && resp.document) || null;
}

// ------------------------------------------------------------
// Checkpoint
// ------------------------------------------------------------
function checkpointPath(slug) {
  return path.join(CHECKPOINT_DIR, `${slug}-properties.checkpoint.json`);
}

function loadCheckpoint(slug) {
  const p = checkpointPath(slug);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn(`    ⚠  checkpoint corrompido (${e.message}) — ignorando e reiniciando`);
    return null;
  }
}

function saveCheckpoint(slug, checkpoint) {
  if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(checkpointPath(slug), JSON.stringify(checkpoint, null, 2), 'utf8');
}

function clearCheckpoint(slug) {
  const p = checkpointPath(slug);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// ------------------------------------------------------------
// Extração principal por lib
// ------------------------------------------------------------
async function extractLibrary(libMeta) {
  const { slug, name, fileKey, prefixRe } = libMeta;
  console.log(`\n→ ${name} (${slug}, ${fileKey})`);

  // 1. Descoberta de node_ids (sempre refeita — é barata comparada ao
  //    custo de /nodes, e garante que a assinatura de comparação do
  //    checkpoint reflita o estado ATUAL da lib, não um estado velho).
  let discovered = await discoverViaComponentSetsEndpoint(fileKey, prefixRe);
  console.log(`    component sets via /component_sets: ${discovered.length}`);

  // parentSetIndex (camada 3, resolução de sub-variantes "Leitor de Tela")
  // exige uma árvore com depth maior que a de discoverViaTreeWalk (ver
  // fetchScreenReaderTree) — nula quando --deep-scan não está ativo. Isso é
  // uma limitação aceita (não uma regressão): sem --deep-scan, o script já
  // não achava os sets ocultos "[hac ...]" de qualquer forma, então
  // screenReaderVariants simplesmente fica ausente, igual a hoje.
  let parentSetIndex = null;

  if (DEEP_SCAN) {
    const extra = await discoverViaTreeWalk(fileKey, prefixRe, discovered.map((s) => s.nodeId));
    if (extra.length) console.log(`    component sets adicionais via tree-walk (--deep-scan): ${extra.length}`);
    discovered = [...discovered, ...extra];

    const screenReaderRootDoc = await fetchScreenReaderTree(fileKey);
    if (screenReaderRootDoc) {
      parentSetIndex = buildParentSetIndex(screenReaderRootDoc);
      console.log(`    índice de SETs-pai (--deep-scan, p/ sub-variantes "Leitor de Tela", depth=${SCREEN_READER_INDEX_DEPTH}): ${parentSetIndex.size} componentId(s) indexado(s)`);
    }
  }

  if (discovered.length === 0) {
    console.error(`    ⛔  Nenhum component set encontrado${prefixRe ? ' com o prefixo esperado' : ''} — lib pode ter sido reestruturada, ou prefixRe desatualizado.`);
    return { ok: false, slug };
  }

  // Assinatura da descoberta: hash estável do conjunto de node_ids
  // esperado. Usada para invalidar checkpoint de execução anterior se
  // a lib mudou entre rodadas (set novo/removido) — evita misturar
  // progresso de estruturas diferentes.
  const expectedNodeIds = discovered.map((s) => s.nodeId).sort();
  const discoverySignature = sha256({ fileKey, expectedNodeIds, prefixRe: prefixRe ? prefixRe.source : null });

  // 2. Carrega checkpoint (se existir e não --reset)
  let checkpoint = RESET ? null : loadCheckpoint(slug);
  if (checkpoint && checkpoint.discoverySignature !== discoverySignature) {
    console.warn('    ⚠  checkpoint existente não bate com a descoberta atual (lib mudou desde a última execução) — reiniciando do zero');
    checkpoint = null;
  }
  if (!checkpoint) {
    checkpoint = {
      slug,
      fileKey,
      discoverySignature,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalExpected: discovered.length,
      resolved: {}, // nodeId -> component entry já extraído com sucesso
      failedNodeIds: []
    };
  } else {
    console.log(`    checkpoint encontrado: ${Object.keys(checkpoint.resolved).length}/${checkpoint.totalExpected} já resolvidos anteriormente`);
  }

  const byNodeId = new Map(discovered.map((s) => [s.nodeId, s]));
  const pending = discovered.filter((s) => !checkpoint.resolved[s.nodeId]);
  console.log(`    pendentes nesta execução: ${pending.length}`);

  const startTime = Date.now();
  const warnings = [];
  let stoppedByBudget = false;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    if (TIME_BUDGET_MS > 0 && Date.now() - startTime > TIME_BUDGET_MS) {
      console.warn(`    ⏱  orçamento de tempo (--time-budget-ms=${TIME_BUDGET_MS}) atingido — interrompendo, checkpoint salvo, retome na próxima execução`);
      stoppedByBudget = true;
      break;
    }

    const batch = pending.slice(i, i + BATCH_SIZE);
    const nodeIds = batch.map((s) => s.nodeId);
    console.log(`    lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)} (${batch.length} node ids)...`);

    try {
      const resp = await figmaGet(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeIds.join(','))}`);
      const nodesData = (resp && resp.nodes) || {};

      for (const set of batch) {
        const nodeEntry = nodesData[set.nodeId];
        const doc = nodeEntry && nodeEntry.document;
        if (!doc) {
          warnings.push(`node ${set.nodeId} (${set.shortName}): sem "document" no retorno de /nodes`);
          checkpoint.failedNodeIds = Array.from(new Set([...checkpoint.failedNodeIds, set.nodeId]));
          continue;
        }

        const defs = doc.componentPropertyDefinitions || {};
        const properties = Object.entries(defs).map(([rawKey, def]) => toPropertyEntry(rawKey, def));
        const booleans = properties.filter((p) => p.type === 'BOOLEAN');
        const texts = properties.filter((p) => p.type === 'TEXT');
        const variants = properties.filter((p) => p.type === 'VARIANT');
        const instanceSwaps = properties.filter((p) => p.type === 'INSTANCE_SWAP');
        const perVariantProperties = extractPerVariantProperties(doc, parentSetIndex);

        checkpoint.resolved[set.nodeId] = {
          nodeId: set.nodeId,
          key: set.key,
          fullName: set.fullName,
          shortName: set.shortName,
          source: set.source,
          properties,
          propertiesByType: {
            toggles: booleans.map((p) => p.name),
            texts: texts.map((p) => p.name),
            variants: variants.map((p) => p.name),
            instanceSwaps: instanceSwaps.map((p) => p.name)
          },
          // Presente só quando o set segue o padrão "instância aninhada por
          // variante" (ver extractPerVariantProperties) — ausente/[] pros
          // ~285 component sets que declaram tudo normalmente no nível do
          // set. Não remover nem tornar obrigatório: consumidores existentes
          // do JSON continuam lendo só `properties`/`propertiesByType`.
          perVariantProperties
        };
        // remove de failedNodeIds se uma tentativa anterior tinha falhado
        checkpoint.failedNodeIds = checkpoint.failedNodeIds.filter((id) => id !== set.nodeId);
      }

      checkpoint.updatedAt = new Date().toISOString();
      saveCheckpoint(slug, checkpoint);
    } catch (e) {
      console.error(`    ⛔  lote falhou: ${e.message}`);
      for (const set of batch) {
        warnings.push(`node ${set.nodeId} (${set.shortName}): lote falhou — ${e.message.slice(0, 150)}`);
        checkpoint.failedNodeIds = Array.from(new Set([...checkpoint.failedNodeIds, set.nodeId]));
      }
      checkpoint.updatedAt = new Date().toISOString();
      saveCheckpoint(slug, checkpoint);
      // segue pro próximo lote em vez de abortar a lib inteira — um
      // lote com problema (ex: um node_id inválido) não deve impedir
      // o restante de ser extraído.
    }

    if (i + BATCH_SIZE < pending.length) await sleep(DELAY_MS);
  }

  const resolvedCount = Object.keys(checkpoint.resolved).length;
  const isComplete = resolvedCount === discovered.length && checkpoint.failedNodeIds.length === 0 && !stoppedByBudget;

  console.log(`    resolvidos: ${resolvedCount}/${discovered.length}${checkpoint.failedNodeIds.length ? ` (${checkpoint.failedNodeIds.length} com falha)` : ''}`);

  if (!isComplete && !FINALIZE_PARTIAL) {
    console.log(`    ⏸  extração incompleta — checkpoint salvo em ${path.relative(process.cwd(), checkpointPath(slug))}, rode novamente para continuar (ou use --finalize-partial para gravar o output mesmo assim).`);
    return { ok: false, slug, partial: true, resolvedCount, totalExpected: discovered.length };
  }

  // 3. Escreve output final (JSON por lib)
  const components = discovered
    .map((s) => checkpoint.resolved[s.nodeId])
    .filter(Boolean);

  const outPath = path.join(REFS_DIR, `${slug}-properties.json`);
  const out = {
    _meta: {
      description: `Component property definitions (VARIANT/BOOLEAN/TEXT/INSTANCE_SWAP, com opções e defaults) de cada component set${prefixRe ? ` "${prefixRe.source}"` : ''} da lib "${name}". Gerado por fetch-component-properties.cjs (generalização de fetch-a11y-component-properties.cjs para as 5 libs DSC do hac). Unidade de extração é o COMPONENT SET (família), não a variante individual — ver cabeçalho do script para justificativa.`,
      slug,
      libraryName: name,
      fileKey,
      generatedAt: new Date().toISOString(),
      generator: 'fetch-component-properties.cjs',
      deepScan: DEEP_SCAN,
      discoverySignature,
      counts: {
        totalComponentSets: discovered.length,
        resolved: resolvedCount,
        failed: checkpoint.failedNodeIds.length
      },
      schema: {
        components: 'array — um item por component set real da lib',
        'components[].nodeId': 'node_id do component set no arquivo Figma (usado em GET /v1/files/:key/nodes)',
        'components[].key': 'component key publicada (null se o set não tiver key — ex: sets ocultos "." encontrados via --deep-scan)',
        'components[].fullName': 'nome completo do node no Figma, incluindo prefixo (se prefixRe aplicável)',
        'components[].shortName': 'nome sem o prefixo (se prefixRe aplicável) — chave amigável para UI',
        'components[].source': '"component_sets" (via GET /component_sets) ou "tree-walk" (via --deep-scan, set oculto)',
        'components[].properties': 'array flat de todas as component property definitions do set',
        'components[].properties[].rawKey': 'chave exata como retornada pela API, ex: "observacoes#7489:0"',
        'components[].properties[].name': 'nome legível sem o sufixo #id — usar para casar com componentProperties em runtime',
        'components[].properties[].syncId': 'sufixo #id (sync key), null se a property não tiver um',
        'components[].properties[].type': '"VARIANT" | "BOOLEAN" | "TEXT" | "INSTANCE_SWAP"',
        'components[].properties[].defaultValue': 'valor padrão retornado pela API',
        'components[].properties[].variantOptions': 'presente só quando type === "VARIANT" — lista de valores aceitos',
        'components[].properties[].preferredValues': 'presente só quando type === "INSTANCE_SWAP" — lista de {type, key} de componentes preferidos',
        'components[].propertiesByType': 'mesmos dados de properties, separados por type e reduzidos a nomes',
        'components[].perVariantProperties': 'array — presente só quando o set segue o padrão "instância aninhada por variante" (wrapper com property VARIANT tipo "Componente" + 1 INSTANCE filha por variante carregando as componentProperties reais, ex: ".[hac mob/web base] Elementos e imagens"). Cada item: {variantName, variantId, nestedInstanceName, nestedInstanceId, nestedComponentId, properties[], toggles[], screenReaderVariants?}. properties[].value é o valor ATUAL da instância (não uma definição/default, já que instâncias não têm componentPropertyDefinitions). toggles é o mesmo dado filtrado a BOOLEAN com {name, value:boolean}, atalho para UI — CUIDADO: toggles[].value reflete só o default herdado do SET, não se a property tem uso real na sub-variante atualmente configurada (ver screenReaderVariants). Ausente/[] nos demais sets — não é um campo obrigatório do schema.',
        'components[].perVariantProperties[].screenReaderVariants': 'presente só quando --deep-scan está ativo E o nestedComponentId é filho de um SEGUNDO component set oculto com uma property VARIANT de sub-modo (achado real 2026-09-17: ex. ".Button" com "Leitor de Tela"={Baseline,Disabled,Loading}, ".Icon Button" com "Propriedade 1"={Padrão,Variante 2,Variante 3}). componentPropertyDefinitions desse SET-neto é herdado igualmente por TODAS as sub-variantes (por isso toggles[] acima não diferencia) — mas o BINDING REAL de visibilidade de cada property no desenho (componentPropertyReferences) varia por sub-variante e só é resolvível aqui. Schema: {setName, setId, subModeProperty, variants: [{variantName, variantId, activeToggles: string[]}]}. activeToggles lista só os nomes BOOLEAN que têm de fato um nó do desenho vinculado (visible) àquela property NAQUELA sub-variante específica — ex.: Switch tem Nome Acessível na definição do SET mas activeToggles vem [] em Baseline E em Disabled (falso-positivo real do toggles[] acima, já confirmado); Button só tem "Nome Acessível" em activeToggles da sub-variante Loading, não em Baseline/Disabled.',
        warnings: 'lista de avisos não fatais — JSON pode estar parcial se não vazio (ver counts.failed)'
      },
      warnings
    },
    components
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`    ✓ ${path.relative(process.cwd(), outPath)}`);

  if (isComplete) {
    // extração 100% completa — checkpoint não é mais necessário, remove
    // pra não confundir uma próxima execução limpa com um resume parcial.
    clearCheckpoint(slug);
  }

  return { ok: isComplete, slug, partial: !isComplete, resolvedCount, totalExpected: discovered.length, warnings: warnings.length };
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  const eligible = loadEligibleLibraries();
  const targets = RUN_ALL ? eligible : eligible.filter((l) => l.slug === LIB_SLUG);

  if (targets.length === 0) {
    console.error(`⛔  Lib "${LIB_SLUG}" não encontrada. Disponíveis: ${eligible.map((l) => l.slug).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  for (const lib of targets) {
    try {
      results.push(await extractLibrary(lib));
    } catch (e) {
      console.error(`⛔  ${lib.name}: ${e.message}`);
      results.push({ ok: false, slug: lib.slug, error: e.message });
    }
  }

  console.log('\n— Resumo —');
  let hadIncomplete = false;
  let hadFatal = false;
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.slug}: ERRO FATAL — ${r.error}`);
      hadFatal = true;
    } else if (r.partial) {
      console.log(`  ${r.slug}: PARCIAL — ${r.resolvedCount}/${r.totalExpected} (rode de novo para continuar)`);
      hadIncomplete = true;
    } else {
      console.log(`  ${r.slug}: completo — ${r.resolvedCount}/${r.totalExpected}${r.warnings ? ` (${r.warnings} warning(s))` : ''}`);
      if (r.warnings) hadIncomplete = true;
    }
  }

  if (hadFatal) process.exit(1);
  if (hadIncomplete) process.exit(2); // exit code 2 = parcial/com avisos, mesmo padrão dos outros scripts de refs/
}

main().catch((e) => {
  console.error('⛔  Fatal:', e.message);
  process.exit(1);
});
