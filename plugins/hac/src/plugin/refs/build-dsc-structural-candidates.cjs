// ============================================================
// HAC — build-dsc-structural-candidates.cjs
//
// Gera/atualiza src/plugin/refs/dsc-structural-review.json — a lista de
// componentes DSC que hoje têm match de categoria de acessibilidade com
// confiança BAIXA (resolvido só por nome/substring em
// build-dsc-a11y-mapping.cjs), candidatos reais a melhorar o matching com
// uma segunda fonte de evidência: a estrutura REAL de filhos do componente
// (existe um ícone isolado? existe um texto visível?), via REST API do
// Figma — nunca via Plugin API (que só roda dentro do sandbox do plugin
// aberto no Figma do designer, não em CI).
//
// Duas responsabilidades, nesta ordem:
//
//   PARTE A — gera/atualiza a LISTA de candidatos a partir dos 4
//   dsc-component-a11y-mapping*.json já regenerados (campo
//   baixaConfianca). NUNCA sobrescreve uma entrada que já tem os 3 campos
//   preenchidos (hasComposedIcon/hasVisibleLabelText/structuralNote) —
//   preserva revisões já feitas manualmente (ex.: via Gemini + MCP do
//   Figma, ver GEMINI-TASK.md) ou por execuções anteriores deste script.
//
//   PARTE B — para toda entrada AINDA pendente (campos null/ausentes),
//   resolve a árvore real via REST API (2 chamadas por componente):
//     1. GET /v1/components/{key}          → meta.node_id + meta.file_key
//     2. GET /v1/files/{file_key}/nodes?ids={node_id} → árvore de filhos
//   e preenche hasComposedIcon/hasVisibleLabelText/structuralNote com base
//   em regra determinística (tipo dos filhos rasos) — nunca julgamento
//   interpretativo livre, isso é responsabilidade de quem revisar
//   manualmente depois (ver _meta.howToFill no arquivo gerado).
//
// GARANTIA DE PRODUTO (mesmo princípio de fetch-design-refs.cjs/
// fetch-instruction-frames.cjs): FIGMA_TOKEN é usado só aqui, em scripts
// de CI/manutenção — nunca embarcado no plugin distribuído, e nunca
// impeditivo: falha em resolver um componente específico (key removida/
// renomeada, erro de rede pontual) nunca para o script inteiro —
// best-effort por entrada, best-effort por lib.
//
// Uso:
//   FIGMA_TOKEN=xxx node src/plugin/refs/build-dsc-structural-candidates.cjs
//
// Requer Node 18+ (usa fetch nativo).
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const TOKEN = process.env.FIGMA_TOKEN;
const OUT_PATH = path.join(REFS_DIR, 'dsc-structural-review.json');

const FIGMA_API = 'https://api.figma.com';

// slug (mesmo usado em _manifest.json e nas chaves de `candidates` do
// arquivo gerado) → nome do arquivo dsc-component-a11y-mapping*.json
// correspondente. Não é 1:1 com o slug (build-dsc-a11y-mapping.cjs usa
// convenções de nome próprias, herdadas de quando só existiam 2 libs).
const LIB_MAPPING_FILES = {
  'web-angular-react': 'dsc-component-a11y-mapping.json',
  'super-app': 'dsc-component-a11y-mapping-mobile.json',
  'super-dsc-web': 'dsc-component-a11y-mapping-superdscweb.json',
  'dsc-android': 'dsc-component-a11y-mapping-android.json',
};

async function figmaGet(pathName) {
  const url = FIGMA_API + pathName;
  const res = await fetch(url, { headers: { 'X-Figma-Token': TOKEN } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${pathName} → HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function readManifestFileKeys() {
  const manifest = JSON.parse(fs.readFileSync(path.join(REFS_DIR, '_manifest.json'), 'utf8'));
  const out = {};
  for (const lib of manifest.libraries || []) out[lib.slug] = lib.fileKey;
  return out;
}

// ---- PARTE A: gera/atualiza a lista de candidatos ----

function loadExistingReview() {
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch (e) {
    return null;
  }
}

function isEntryComplete(entry) {
  return entry &&
    entry.hasComposedIcon !== undefined && entry.hasComposedIcon !== null && entry.hasComposedIcon !== 'PREENCHER' &&
    entry.hasVisibleLabelText !== undefined && entry.hasVisibleLabelText !== null && entry.hasVisibleLabelText !== 'PREENCHER' &&
    typeof entry.structuralNote === 'string' && entry.structuralNote && entry.structuralNote !== 'PREENCHER';
}

function buildCandidateEntry(rawEntry, fileKey) {
  return {
    containingFrame: rawEntry.containingFrame,
    currentMatch: rawEntry.match ? rawEntry.match.shortName : null,
    currentConfidence: rawEntry.match ? rawEntry.match.confidence : null,
    currentReason: rawEntry.match ? rawEntry.match.reason : null,
    variantCount: rawEntry.variantCount,
    sampleComponentKey: (rawEntry.sampleKeys && rawEntry.sampleKeys[0]) || null,
    fileKey,
    hasComposedIcon: 'PREENCHER',
    hasVisibleLabelText: 'PREENCHER',
    structuralNote: 'PREENCHER',
  };
}

function mergeCandidates(existingList, freshList) {
  const existingByFrame = new Map((existingList || []).map(e => [e.containingFrame, e]));
  return freshList.map(fresh => {
    const prior = existingByFrame.get(fresh.containingFrame);
    // Preserva a entrada já revisada por completo — nunca sobrescreve
    // trabalho já feito (manual ou de execução anterior deste script).
    if (prior && isEntryComplete(prior)) return prior;
    // Componente novo (ou ainda pendente): mantém sampleComponentKey/
    // variantCount/match ATUALIZADOS (podem ter mudado num scan novo),
    // mas preserva qualquer progresso parcial já feito nos 3 campos.
    return prior ? { ...fresh, hasComposedIcon: prior.hasComposedIcon, hasVisibleLabelText: prior.hasVisibleLabelText, structuralNote: prior.structuralNote } : fresh;
  });
}

function buildCandidatesList(fileKeys) {
  const candidates = {};
  const existing = loadExistingReview();
  const existingCandidates = (existing && existing.candidates) || {};

  for (const [slug, mappingFile] of Object.entries(LIB_MAPPING_FILES)) {
    const mappingPath = path.join(REFS_DIR, mappingFile);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    } catch (e) {
      console.error(`[build-dsc-structural-candidates] não consegui ler ${mappingFile}, pulando lib ${slug}:`, e.message);
      candidates[slug] = existingCandidates[slug] || [];
      continue;
    }
    const fresh = (data.baixaConfianca || []).map(e => buildCandidateEntry(e, fileKeys[slug] || null));
    candidates[slug] = mergeCandidates(existingCandidates[slug], fresh);
  }
  return candidates;
}

// ---- PARTE B: resolve estrutura real via REST API ----

// Mesmo critério de tamanho/tipo já usado em _isIconGroupContainer/isIcon
// (code.js) — ícone é um VECTOR/BOOLEAN_OPERATION/ELLIPSE/RECTANGLE
// pequeno (≤32px em ambas dimensões), nunca julgamento visual, só regra
// de tipo+tamanho.
const ICON_LIKE_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'ELLIPSE', 'RECTANGLE']);
const ICON_MAX_SIZE = 32;

// Profundidade rasa e proposital (2-3 níveis) — mesmo princípio já usado
// no aprofundamento do scan em runtime (_a11yScanArea, code.js): um
// componente real do DSC nunca precisa de mais que isso pra expor um
// ícone/texto filho relevante.
function analyzeNodeTree(node, depth) {
  const result = { hasComposedIcon: false, hasVisibleLabelText: false, iconInfo: null, textInfo: null };
  if (!node || (depth || 0) > 3) return result;

  function visit(n, d) {
    if (!n || d > 3) return;
    if (ICON_LIKE_TYPES.has(n.type)) {
      const w = n.absoluteBoundingBox ? n.absoluteBoundingBox.width : (n.size ? n.size.x : null);
      const h = n.absoluteBoundingBox ? n.absoluteBoundingBox.height : (n.size ? n.size.y : null);
      if (typeof w === 'number' && typeof h === 'number' && w <= ICON_MAX_SIZE && h <= ICON_MAX_SIZE) {
        if (!result.hasComposedIcon) {
          result.hasComposedIcon = true;
          result.iconInfo = { type: n.type, width: Math.round(w), height: Math.round(h) };
        }
      }
    }
    if (n.type === 'TEXT' && typeof n.characters === 'string' && n.characters.trim()) {
      if (!result.hasVisibleLabelText) {
        result.hasVisibleLabelText = true;
        result.textInfo = n.characters.trim().slice(0, 40);
      }
    }
    if (Array.isArray(n.children)) {
      for (const child of n.children) visit(child, d + 1);
    }
  }
  visit(node, 0);
  return result;
}

function buildStructuralNote(analysis, resolveError) {
  if (resolveError) return 'não foi possível resolver o componente — key pode estar desatualizada';
  const parts = [];
  if (analysis.hasComposedIcon && analysis.iconInfo) {
    parts.push(`Tem ícone isolado (${analysis.iconInfo.type}, ${analysis.iconInfo.width}x${analysis.iconInfo.height})`);
  }
  if (analysis.hasVisibleLabelText && analysis.textInfo) {
    parts.push(`texto visível ('${analysis.textInfo}')`);
  }
  if (parts.length === 0) {
    return 'Sem ícone nem texto filho detectado em nível raso — estrutura simples, match atual provavelmente já suficiente.';
  }
  return parts.join(' e ') + ' — candidato a componente composto, revisar se sub-elementos merecem spec própria.';
}

async function resolveComponentStructure(componentKey) {
  const compMeta = await figmaGet(`/v1/components/${componentKey}`);
  const nodeId = compMeta && compMeta.meta && compMeta.meta.node_id;
  const fileKey = compMeta && compMeta.meta && compMeta.meta.file_key;
  if (!nodeId || !fileKey) throw new Error('meta.node_id/file_key ausente na resposta de /v1/components');

  const nodesResp = await figmaGet(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}`);
  const nodeDoc = nodesResp && nodesResp.nodes && nodesResp.nodes[nodeId] && nodesResp.nodes[nodeId].document;
  if (!nodeDoc) throw new Error('document ausente na resposta de /v1/files/:key/nodes');

  return analyzeNodeTree(nodeDoc, 0);
}

async function fillPendingEntries(candidates) {
  let resolved = 0, failed = 0, skipped = 0;
  for (const [slug, list] of Object.entries(candidates)) {
    for (const entry of list) {
      if (isEntryComplete(entry)) { skipped++; continue; }
      if (!entry.sampleComponentKey) {
        entry.hasComposedIcon = null;
        entry.hasVisibleLabelText = null;
        entry.structuralNote = 'não foi possível resolver o componente — sampleComponentKey ausente';
        failed++;
        continue;
      }
      try {
        const analysis = await resolveComponentStructure(entry.sampleComponentKey);
        entry.hasComposedIcon = analysis.hasComposedIcon;
        entry.hasVisibleLabelText = analysis.hasVisibleLabelText;
        entry.structuralNote = buildStructuralNote(analysis, false);
        resolved++;
      } catch (e) {
        console.error(`[build-dsc-structural-candidates] falha ao resolver ${slug}/${entry.containingFrame} (${entry.sampleComponentKey}):`, e.message);
        entry.hasComposedIcon = null;
        entry.hasVisibleLabelText = null;
        entry.structuralNote = buildStructuralNote(null, true);
        failed++;
      }
    }
  }
  return { resolved, failed, skipped };
}

async function main() {
  if (!TOKEN) {
    console.error('⛔  FIGMA_TOKEN environment variable not set — nada a fazer (token nunca é impeditivo: script termina sem erro, arquivo existente não é tocado).');
    process.exit(0);
  }

  const fileKeys = readManifestFileKeys();
  const candidates = buildCandidatesList(fileKeys);

  let resolveStats = { resolved: 0, failed: 0, skipped: 0 };
  try {
    resolveStats = await fillPendingEntries(candidates);
  } catch (e) {
    console.error('[build-dsc-structural-candidates] falha inesperada na Parte B — mantendo candidatos já gerados na Parte A.', e.message);
  }

  const totalCandidates = Object.values(candidates).reduce((sum, arr) => sum + arr.length, 0);
  const pending = Object.values(candidates).reduce((sum, arr) => sum + arr.filter(e => !isEntryComplete(e)).length, 0);

  const prior = loadExistingReview();
  const out = {
    _meta: {
      AGENTE_AUTOMATIZADO_LEIA_PRIMEIRO: (prior && prior._meta && prior._meta.AGENTE_AUTOMATIZADO_LEIA_PRIMEIRO) ||
        'Este arquivo é gerado/atualizado por build-dsc-structural-candidates.cjs (Parte A) e preenchido automaticamente via REST API (Parte B) ou manualmente (Gemini + MCP do Figma). Nunca editar os 4 arquivos dsc-component-a11y-mapping*.json a partir daqui — são a FONTE, não o destino.',
      description: 'Revisão ESTRUTURAL dos componentes DSC que hoje têm match de a11y com confiança BAIXA nas 4 libs de produção do hac — candidatos reais a melhorar o matching DSC→categoria de acessibilidade (build-dsc-a11y-mapping.cjs), hoje feito só por nome/substring.',
      scope: 'Escopo deliberadamente restrito aos componentes de confiança BAIXA (não os milhares sem match nenhum, nem os já resolvidos com confiança alta) — candidatos reais onde uma segunda fonte de evidência (estrutura real, não só nome) pode confirmar ou corrigir o match atual.',
      howToFill: (prior && prior._meta && prior._meta.howToFill) ||
        'hasComposedIcon/hasVisibleLabelText são preenchidos automaticamente por build-dsc-structural-candidates.cjs via REST API (regra determinística de tipo/tamanho de filho, sem julgamento). structuralNote é gerado por template a partir desses 2 campos. Revisão humana (ou de um agente com MCP do Figma, ver GEMINI-TASK.md) pode refinar structuralNote com contexto visual adicional — nesse caso a entrada revisada nunca é sobrescrita por execuções futuras deste script.',
      totalCandidates,
      pendingCount: pending,
      extractedFrom: Object.values(LIB_MAPPING_FILES),
      lastAutomatedRunAt: new Date().toISOString(),
      lastAutomatedRunStats: resolveStats,
      extractedBy: (prior && prior._meta && prior._meta.extractedBy) || 'build-dsc-structural-candidates.cjs (REST API)',
      extractedAt: (prior && prior._meta && prior._meta.extractedAt) || new Date().toISOString().slice(0, 10),
      status: pending === 0 ? 'preenchido' : `preenchido-parcial — ${pending} de ${totalCandidates} entradas ainda pendentes`,
    },
    candidates,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✅ dsc-structural-review.json atualizado — ${totalCandidates} candidatos (${resolveStats.resolved} resolvidos agora, ${resolveStats.skipped} já revisados antes, ${resolveStats.failed} falharam)`);
}

main().catch(e => {
  console.error('[build-dsc-structural-candidates] falha fatal inesperada:', e && e.stack || e);
  process.exit(1);
});
