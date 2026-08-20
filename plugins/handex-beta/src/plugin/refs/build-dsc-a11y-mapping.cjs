// ============================================================
// HANDEX — build-dsc-a11y-mapping.cjs
// FUNDAÇÃO DE DADOS (fase 1) para a futura detecção automática de
// componente DSC → categoria de handoff de acessibilidade.
//
// NÃO faz detecção em runtime, NÃO altera o scan, NÃO cria UI.
// Só produz um JSON de auditoria: para cada component set real da
// lib "Web Angular & React" (refs/web-angular-react.json, gerado por
// fetch-design-refs.cjs), tenta casar o nome com um dos 16 shortNames
// de acessibilidade já usados no formulário dinâmico (ver
// src/plugin/modules/accessibility.js → A11Y_COMPONENTE_LABELS).
//
// Por que "containingFrame" e não "name":
//   A REST API /v1/files/:key/components devolve, por VARIANTE, um
//   nome do tipo "confidencial=true, tipo=EXTERNO.RESTRITO, ..." — é
//   o nome da combinação de properties da variante, não do componente
//   "pai". O nome que interessa pra esta heurística (o nome do
//   component set / família, ex: "[dsc] Accordion") vem em
//   `containing_frame.name`, já capturado por fetch-design-refs.cjs
//   como `containingFrame`. Confirmado nos dados reais: 1893
//   componentes (variantes) agrupados em só 61 containingFrame
//   distintos — é a granularidade certa para bater contra os 16
//   shortNames de a11y (que também representam famílias, não
//   variantes individuais).
//
// Uso:
//   node src/plugin/refs/build-dsc-a11y-mapping.cjs
//
// Requer que refs/web-angular-react.json já exista (rodar antes:
//   node src/plugin/refs/fetch-design-refs.cjs --only web-angular-react
// ou npm run refs:fetch -- --only web-angular-react).
//
// Output: refs/dsc-component-a11y-mapping.json
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const SRC_PATH = path.join(REFS_DIR, 'web-angular-react.json');
const OUT_PATH = path.join(REFS_DIR, 'dsc-component-a11y-mapping.json');

// Os 16 shortNames oficiais do formulário dinâmico de a11y — mesma lista de
// src/plugin/modules/accessibility.js → A11Y_COMPONENTE_LABELS. Copiado (não
// importado) porque accessibility.js não é um módulo CommonJS/ESM isolado —
// é um fragmento concatenado no bundle do frontend, sem export.
// IMPORTANTE: manter sincronizado manualmente se A11Y_COMPONENTE_LABELS mudar.
const A11Y_SHORTNAMES = [
  'accordion', 'breadcrumb', 'button', 'checkbox', 'dialog', 'inputs', 'link',
  'listas', 'paginator', 'radio button', 'snackbar', 'stepper', 'switch',
  'table', 'tab group', 'imagem'
];

// Sinônimos/variações de superfície que um componente de PRODUÇÃO (Web
// Angular & React) pode usar e que não batem por substring direta contra o
// shortName de a11y (que vem da lib "Design Acessível", nomenclatura própria
// e mais "genérica"/conceitual). Cada entrada é testada por substring na
// forma normalizada, na ORDEM declarada — a primeira que bater vence.
// "inputs" e "imagem" precisam de sinônimos porque a lib de produção nomeia
// por tipo de campo (Input, Input Currency, Datepicker...) ou não tem um
// component set chamado literalmente "imagem"/"texto alternativo".
const A11Y_SYNONYMS = {
  // BETA-ONLY: a11y-mapeamento-interativo — 'select' e 'slider' adicionados:
  // "[dsc] Select", "[dsc] Select with Chips", "[dsc] Range Slider", "[dsc]
  // Slider" são campos de formulário reais (recebem foco de Tab e input do
  // usuário) e caíam em semMatch por falta de sinônimo. Confirmados em
  // refs/_skeleton.json (lib web-angular-react) antes de adicionar.
  inputs: ['input', 'datepicker', 'timepicker', 'textarea', 'currency', 'inputfile', 'inputtextarea', 'select', 'slider'],
  imagem: ['imagem', 'image', 'foto', 'thumbnail', 'avatar', 'textoalternativo'],
  listas: ['lista', 'list', 'menuitem', 'menulateral'],
  link: ['link', 'hyperlink'],
  table: ['tabela', 'table'],
};

function normalize(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/\[dsc[^\]]*\]/g, '') // remove prefixos [dsc], [dsc-tc], [dsc doc]
    .replace(/[\/\-_.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Versão "colada" (sem espaços) — usada pra checar substring isolada com
// menos falsos negativos por causa de espaço extra/faltante entre palavras
// (ex: "radio button" vs "radiobutton", "tab group" vs "tabgroup").
function squash(str) {
  return normalize(str).replace(/\s+/g, '');
}

// Confiança ALTA: a substring do shortName (colada) aparece isolada no nome
// normalizado colado, como palavra/bloco reconhecível — não uma coincidência
// de poucas letras dentro de outra palavra maior sem relação semântica.
// Confiança BAIXA: bate só via lista de sinônimos (correspondência indireta,
// depende de uma tabela curada por nós, não do nome literal da lib DSC) ou
// é uma substring curta demais pra ser conclusiva sozinha (ex: "tab" dentro
// de "table" — tratado explicitamente para não gerar falso-alto).
function matchShortName(containingFrameName) {
  const norm = normalize(containingFrameName);
  const sq = squash(containingFrameName);

  // Casos ambíguos conhecidos que precisam de tratamento explícito ANTES do
  // teste genérico de substring, senão geram falso-positivo de alta confiança:
  //   - "tab" é substring de "table" → testar "tab group"/"tab" só depois de
  //     descartar "table".
  //   - "link" pode aparecer dentro de nomes que não são links de a11y (não
  //     observado nos dados reais desta lib, mas mantido defensivo).
  if (sq.includes('table')) {
    return { shortName: 'table', confidence: 'alta', reason: 'substring "table"' };
  }
  if (sq.includes('tabgroup')) {
    return { shortName: 'tab group', confidence: 'alta', reason: 'substring "tab group"' };
  }
  if (/(^|\s)tab(\s|$)/.test(norm) || sq === 'tab') {
    // "[dsc] Tab" isolado — é a base do Tab Group, mas não tem "group" no
    // nome. Sinalizado como baixa confiança: pode ser o próprio Tab Group
    // (aba individual) ou um componente não relacionado a a11y (raro).
    return { shortName: 'tab group', confidence: 'baixa', reason: '"tab" isolado, sem "group" no nome — pode ser aba individual do Tab Group' };
  }

  // Testa shortNames do mais LONGO (colado) pro mais curto — evita que um
  // shortName genérico (ex: "button") capture por engano um nome que na
  // verdade bate com um shortName mais específico que o CONTÉM (ex: "radio
  // button" também contém "button" como substring; sem essa ordenação
  // "[dsc] Radio Button" seria classificado errado como "button").
  const candidates = A11Y_SHORTNAMES
    .filter(s => s !== 'table' && s !== 'tab group') // já tratados acima
    .slice()
    .sort((a, b) => squash(b).length - squash(a).length);

  for (const shortName of candidates) {
    const shortSq = squash(shortName);
    if (sq.includes(shortSq)) {
      return { shortName, confidence: 'alta', reason: `substring "${shortName}"` };
    }
  }

  // Sinônimos — correspondência indireta, sempre BAIXA confiança (depende de
  // tabela curada nossa, não do nome literal da lib DSC).
  for (const [shortName, synonyms] of Object.entries(A11Y_SYNONYMS)) {
    for (const syn of synonyms) {
      if (sq.includes(squash(syn))) {
        return { shortName, confidence: 'baixa', reason: `sinônimo "${syn}"` };
      }
    }
  }

  return null;
}

function main() {
  if (!fs.existsSync(SRC_PATH)) {
    console.error(`⛔  ${path.relative(process.cwd(), SRC_PATH)} não encontrado.`);
    console.error('   Rode antes: node src/plugin/refs/fetch-design-refs.cjs --only web-angular-react');
    process.exit(1);
  }

  const lib = JSON.parse(fs.readFileSync(SRC_PATH, 'utf8'));
  const components = Array.isArray(lib.components) ? lib.components : [];

  // Agrupa por containingFrame (a unidade real de "componente" para esta
  // heurística — ver comentário de cabeçalho). Guarda 1 key de exemplo e a
  // contagem de variantes por family.
  const families = new Map();
  for (const c of components) {
    const frameName = c.containingFrame || '(sem containingFrame)';
    if (!families.has(frameName)) {
      families.set(frameName, { containingFrame: frameName, variantCount: 0, sampleKeys: [] });
    }
    const f = families.get(frameName);
    f.variantCount += 1;
    if (f.sampleKeys.length < 3) f.sampleKeys.push(c.key);
  }

  const familyList = Array.from(families.values()).sort((a, b) => b.variantCount - a.variantCount);

  const alta = [];
  const baixa = [];
  const semMatch = [];

  for (const fam of familyList) {
    const m = matchShortName(fam.containingFrame);
    const entry = {
      containingFrame: fam.containingFrame,
      variantCount: fam.variantCount,
      sampleKeys: fam.sampleKeys,
      match: m ? { shortName: m.shortName, confidence: m.confidence, reason: m.reason } : null
    };
    if (!m) semMatch.push(entry);
    else if (m.confidence === 'alta') alta.push(entry);
    else baixa.push(entry);
  }

  // Agregado por shortName — quantas families (e quantos componentes/variantes
  // reais no total) cada um dos 16 capturou, somando TODAS as confianças
  // (alta + baixa). É um resumo estatístico do que foi classificado; separar
  // por confiança é responsabilidade de altaConfianca/baixaConfianca no JSON,
  // não deste agregado. BETA-ONLY: a11y-mapeamento-interativo — antes só
  // somava `alta`, escondendo famílias reais classificadas via sinônimo
  // (ex.: "inputs" aparecia zerado mesmo com 10 famílias em baixaConfianca).
  const byShortName = {};
  for (const s of A11Y_SHORTNAMES) byShortName[s] = { families: 0, variantCount: 0 };
  for (const entry of [...alta, ...baixa]) {
    byShortName[entry.match.shortName].families += 1;
    byShortName[entry.match.shortName].variantCount += entry.variantCount;
  }

  const totalComponents = components.length;
  const totalFamilies = familyList.length;
  const altaVariants = alta.reduce((a, e) => a + e.variantCount, 0);
  const baixaVariants = baixa.reduce((a, e) => a + e.variantCount, 0);
  const semMatchVariants = semMatch.reduce((a, e) => a + e.variantCount, 0);

  const out = {
    _meta: {
      description: 'Fundação de dados (fase 1) para detecção automática de componente DSC → categoria de handoff de a11y. Gerado por build-dsc-a11y-mapping.cjs a partir de refs/web-angular-react.json (dados reais da REST API do Figma, sem valores inventados). NÃO usado em runtime — é insumo para revisão humana antes de qualquer fase de detecção/UI.',
      generatedAt: new Date().toISOString(),
      generator: 'build-dsc-a11y-mapping.cjs',
      sourceFile: 'web-angular-react.json',
      sourceFileKey: lib.meta ? lib.meta.figmaFileKey : null,
      unit: 'containingFrame (nome do component set/família — não o nome da variante individual, ver comentário de cabeçalho do script)',
      a11yShortNames: A11Y_SHORTNAMES,
      counts: {
        totalComponentsVariants: totalComponents,
        totalFamilies: totalFamilies,
        altaConfianca: { families: alta.length, variantCount: altaVariants },
        baixaConfianca: { families: baixa.length, variantCount: baixaVariants },
        semMatch: { families: semMatch.length, variantCount: semMatchVariants },
        pctFamiliesAlta: totalFamilies ? +(alta.length / totalFamilies * 100).toFixed(1) : 0,
        pctVariantsAlta: totalComponents ? +(altaVariants / totalComponents * 100).toFixed(1) : 0
      },
      byShortName
    },
    altaConfianca: alta,
    baixaConfianca: baixa,
    semMatch: semMatch
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf8');
  console.log(`✓ ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log(`  ${totalFamilies} families (${totalComponents} variantes) — alta: ${alta.length} (${out._meta.counts.pctFamiliesAlta}%) · baixa: ${baixa.length} · sem match: ${semMatch.length}`);
}

main();
