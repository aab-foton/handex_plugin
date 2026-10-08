// ============================================================
// HAC — report-web-recognition.cjs
//
// Relatório de COBERTURA do reconhecimento web: quantas famílias de
// componente da lib DSC web (Super DSC | Web) batem com as opções da base "Componente" do arquivo próprio, e quais
// NÃO batem — com a opção mais provável SUGERIDA para um humano aprovar.
//
// ESTE RELATÓRIO NÃO É LIDO PELO PLUGIN. As sugestões são palpites de
// similaridade de tokens (a regra de produto proíbe o plugin de adivinhar);
// só viram reconhecimento quando um humano copia o par aprovado para
// refs/web-component-aliases.json. Saída: docs/web-recognition-report.json.
//
// Uso: node src/plugin/refs/report-web-recognition.cjs
// (offline — lê só arquivos já versionados em refs/; sem FIGMA_TOKEN)
// ============================================================

const fs = require('fs');
const path = require('path');
const { normalizeRecognitionName, loadWebAliases, resolveWebRecognition } = require('./web-recognition.cjs');

const REFS = __dirname;
const OUT = path.join(REFS, '..', '..', '..', 'docs', 'web-recognition-report.json');

const wrapper = JSON.parse(fs.readFileSync(path.join(REFS, 'design-acessivel-web-wrapper.generated.json'), 'utf8'));
const options = wrapper.componentOptions || [];
const { accepted: aliases } = loadWebAliases(options);

const LIBS = [
  { slug: 'super-dsc-web', file: 'super-dsc-web.json', label: 'Super DSC | Web' },
];

const tokens = (s) => String(s || '')
  .replace(/^\[dsc[^\]]*\]\s*/i, '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function suggest(name) {
  const t = new Set(tokens(name));
  if (t.size === 0) return [];
  return options
    .map(o => {
      const ot = new Set(tokens(o));
      const inter = [...t].filter(x => ot.has(x)).length;
      const union = new Set([...t, ...ot]).size;
      return { option: o, score: union ? Math.round((inter / union) * 100) / 100 : 0 };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

const report = {
  _meta: {
    description: 'Cobertura do reconhecimento web (exato normalizado + aliases aprovados) das 2 libs DSC web contra as opções da base web. NÃO ATIVADO: nada daqui é lido pelo plugin. "sugestoes" são similaridade de tokens (palpite) para aprovação humana — só entram em refs/web-component-aliases.json depois de aprovadas.',
    generatedAt: new Date().toISOString(),
    baseOptions: options.length,
    aliasesAprovados: Object.keys(aliases).length,
    regra: 'exato = nome normalizado (minúsculas, sem acento, só [a-z0-9], sem prefixo [dsc]) igual ao de uma opção da base',
  },
  libs: {},
  opcoesDaBaseSemFamiliaCorrespondente: [],
};

const matchedOptionsAcrossLibs = new Set();

for (const lib of LIBS) {
  const json = JSON.parse(fs.readFileSync(path.join(REFS, lib.file), 'utf8'));
  const families = new Map(); // containingFrame -> nº de variantes
  for (const c of json.components || []) {
    const f = c.containingFrame;
    if (!f) continue;
    families.set(f, (families.get(f) || 0) + 1);
  }
  const all = [...families.keys()];
  // Ícones/utilitários soltos não têm prefixo "[dsc]" — contam no total, mas
  // não entram na lista de "não bateu" (ruído, não são candidatos de a11y).
  const dsc = all.filter(f => /^\[dsc/i.test(f));
  const exact = [];
  const viaAlias = [];
  const none = [];
  for (const f of dsc) {
    const r = resolveWebRecognition(f, options, aliases);
    if (r && r.via === 'exact') { exact.push({ familia: f, opcao: r.option }); matchedOptionsAcrossLibs.add(r.option); }
    else if (r) { viaAlias.push({ familia: f, opcao: r.option }); matchedOptionsAcrossLibs.add(r.option); }
    else none.push({ familia: f, sugestoes: suggest(f).map(s => ({ ...s, status: 'SUGESTÃO NÃO APROVADA — não ativa' })) });
  }
  // Quantas famílias (incluindo ícones) batem — número comparável ao
  // levantamento manual de 2026-10-01 (que contou o total de famílias).
  const exactAnyFamily = all.filter(f => {
    const r = resolveWebRecognition(f, options, aliases);
    return r && r.via === 'exact';
  }).length;
  report.libs[lib.slug] = {
    label: lib.label,
    familiasTotal: all.length,
    familiasDscPrefixadas: dsc.length,
    bateramExatoTotal: exactAnyFamily,
    bateramExatoDsc: exact.length,
    bateramViaAlias: viaAlias.length,
    semCorrespondenciaDsc: none.length,
    exato: exact,
    viaAlias,
    semCorrespondencia: none,
  };
}

report.opcoesDaBaseSemFamiliaCorrespondente = options.filter(o => !matchedOptionsAcrossLibs.has(o));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');

console.log(`Base web: ${options.length} opções | aliases aprovados: ${Object.keys(aliases).length}`);
for (const [slug, r] of Object.entries(report.libs)) {
  console.log(`${slug}: ${r.familiasTotal} famílias (${r.familiasDscPrefixadas} [dsc]) | exato: ${r.bateramExatoTotal} (${r.bateramExatoDsc} [dsc]) | alias: ${r.bateramViaAlias} | sem correspondência [dsc]: ${r.semCorrespondenciaDsc}`);
}
console.log(`Opções da base sem nenhuma família correspondente: ${report.opcoesDaBaseSemFamiliaCorrespondente.length} -> ${report.opcoesDaBaseSemFamiliaCorrespondente.join(', ')}`);
console.log(`✅ ${path.relative(process.cwd(), OUT)}`);
