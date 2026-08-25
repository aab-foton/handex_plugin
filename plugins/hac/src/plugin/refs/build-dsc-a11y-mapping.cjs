// ============================================================
// HAC — build-dsc-a11y-mapping.cjs
// Adaptação de src/plugin/refs/build-dsc-a11y-mapping.cjs do Handex Beta
// (2026-08-24) — mesma lógica de matching (sinônimos, overrides de
// Header/Footer/Logotipo), só path/nomenclatura ajustados. Diferente do
// Handex (onde este mapa é rotulado "fundação de dados, não usado em
// runtime"), no hac o output deste script — dsc-component-a11y-mapping.json
// — é ESSENCIAL EM RUNTIME: é consumido por _getDscFrameToA11yMap() em
// code.js para resolver containingFrame → {shortName, confidence} da
// Detecção Automática de a11y. Ver nota em dsc-component-a11y-mapping.json.
//
// Para cada component set real da lib "Web Angular & React"
// (refs/web-angular-react.json, gerado por fetch-design-refs.cjs), tenta
// casar o nome com um dos 16 shortNames de acessibilidade já usados no
// formulário dinâmico (ver módulo accessibility.js → A11Y_COMPONENTE_LABELS,
// a portar).
//
// Por que "containingFrame" e não "name":
//   A REST API /v1/files/:key/components devolve, por VARIANTE, um
//   nome do tipo "confidencial=true, tipo=EXTERNO.RESTRITO, ..." — é
//   o nome da combinação de properties da variante, não do componente
//   "pai". O nome que interessa pra esta heurística (o nome do
//   component set / família, ex: "[dsc] Accordion") vem em
//   `containing_frame.name`, já capturado por fetch-design-refs.cjs
//   como `containingFrame`. Confirmado nos dados reais do Handex: 1893
//   componentes (variantes) agrupados em só 61 containingFrame
//   distintos — é a granularidade certa para bater contra os 16
//   shortNames de a11y (que também representam famílias, não
//   variantes individuais).
//
// Uso (lib desktop, comportamento padrão, igual sempre foi):
//   node src/plugin/refs/build-dsc-a11y-mapping.cjs
//
// Uso (qualquer outra lib do manifest, ex: mobile/Super App — 2026-08-25):
//   node src/plugin/refs/build-dsc-a11y-mapping.cjs --src super-app.json --out dsc-component-a11y-mapping-mobile.json
// O 3º argumento posicional (sem --src/--out) é aceito como slug curto:
//   node src/plugin/refs/build-dsc-a11y-mapping.cjs super-app
// resolve para src=super-app.json, out=dsc-component-a11y-mapping-super-app.json.
//
// Requer que o arquivo de origem já exista (rodar antes:
//   node src/plugin/refs/fetch-design-refs.cjs --only <slug>
// ou npm run refs:fetch).
//
// Output padrão: refs/dsc-component-a11y-mapping.json
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;

// Parsing simples de argumentos — mantém o comportamento padrão (sem
// argumentos = lib desktop web-angular-react) intacto pra não quebrar
// npm run refs:a11y-mapping/refs:rebuild já em uso.
const _argv = process.argv.slice(2);
function _argVal(flag) {
  const i = _argv.indexOf(flag);
  return i >= 0 ? _argv[i + 1] : null;
}
const _positional = _argv.find(a => !a.startsWith('--') && _argv[_argv.indexOf(a) - 1] !== '--src' && _argv[_argv.indexOf(a) - 1] !== '--out');
const _srcFlag = _argVal('--src');
const _outFlag = _argVal('--out');

const SRC_FILE = _srcFlag || (_positional ? `${_positional}.json` : 'web-angular-react.json');
const OUT_FILE = _outFlag || (_positional ? `dsc-component-a11y-mapping-${_positional}.json` : 'dsc-component-a11y-mapping.json');
const SRC_PATH = path.join(REFS_DIR, SRC_FILE);
const OUT_PATH = path.join(REFS_DIR, OUT_FILE);

// Os 16 shortNames oficiais do formulário dinâmico de a11y — mesma lista de
// modules/accessibility.js → A11Y_COMPONENTE_LABELS (a portar do Handex).
// Copiado (não importado) porque accessibility.js não é um módulo
// CommonJS/ESM isolado — é um fragmento concatenado no bundle do frontend,
// sem export. IMPORTANTE: manter sincronizado manualmente se
// A11Y_COMPONENTE_LABELS mudar.
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
  // 'select' e 'slider': "[dsc] Select", "[dsc] Select with Chips", "[dsc]
  // Range Slider", "[dsc] Slider" são campos de formulário reais (recebem
  // foco de Tab e input do usuário) e caíam em semMatch por falta de
  // sinônimo. Confirmados em refs/_skeleton.json (lib web-angular-react)
  // antes de adicionar (herdado do Handex).
  inputs: ['input', 'datepicker', 'timepicker', 'textarea', 'currency', 'inputfile', 'inputtextarea', 'select', 'slider', 'textfield', 'textinput'],
  imagem: ['imagem', 'image', 'foto', 'thumbnail', 'avatar', 'textoalternativo'],
  listas: ['lista', 'list', 'menuitem', 'menulateral'],
  link: ['link', 'hyperlink'],
  table: ['tabela', 'table'],
  // 'radio button': lib mobile (DSC | Super App, 2026-08-25) nomeia o
  // componente só "[dsc] Radio", sem "button" — confirmado nos dados reais
  // dessa lib antes de adicionar (mesma disciplina dos sinônimos herdados
  // do Handex acima).
  'radio button': ['radio'],
  // 'tab group': mesma lib mobile nomeia "[dsc] Tabs" (plural, sem "group") —
  // diferente do "[dsc] Tab" isolado já tratado como baixa confiança acima
  // (esse continua ambíguo de propósito).
  'tab group': ['tabs'],
};

// Correspondências indiretas para famílias DSC que representam ESTRUTURA de
// página (não um dos 16 componentes interativos catalogados em
// A11Y_SHORTNAMES) ou conteúdo de imagem/marca. Tratadas à parte de
// A11Y_SYNONYMS porque os shortNames de destino ('estrutura', 'imagem') não
// fazem parte da lista de 16 componentes de "Elementos e Imagens" — 'estrutura'
// é uma das 5 categorias FIXAS de a11y (Estrutura da Página, subtipo "marco de
// navegação"), e 'imagem' já existe em A11Y_SHORTNAMES mas usa sinônimos
// específicos aqui por precisão (match por NOME EXATO do containingFrame, não
// substring — "[dsc] Header"/"[dsc] Footer" são nomes curtos demais para
// substring seguro sem gerar falso-positivo em outras famílias, ex: "[dsc-tc]
// Footer Template", que é um template de documentação e não deve casar).
// Confiança sempre 'baixa' — é correspondência indireta/curada por nós, não o
// nome literal de um shortName. Herdado do Handex (decisão confirmada com o
// designer em 2026-08-21): Header e Footer têm marco de navegação real na lib
// "Design Acessível" (EE marco de navegacao → tipo header/footer); Logotipo
// não tem componente próprio, mas semanticamente precisa de texto alternativo
// (categoria "Elementos e Imagens" → 'imagem').
const A11Y_STRUCTURAL_EXACT_OVERRIDES = {
  '[dsc] Header': { shortName: 'estrutura', reason: 'estrutura de página — marco de navegação "header"' },
  '[dsc] Footer': { shortName: 'estrutura', reason: 'estrutura de página — marco de navegação "footer"' },
  '[dsc] Logotipo': { shortName: 'imagem', reason: 'conteúdo de imagem/marca — precisa de texto alternativo' },
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

  // Checagem por NOME EXATO (não substring) do containingFrame cru, antes de
  // qualquer outro teste. Precisa vir primeiro porque 'estrutura'/'imagem'
  // (destinos aqui) não seguem o mesmo vocabulário de shortName "família de
  // componente interativo" do restante da função, e usar substring nesses
  // nomes curtos ("Header"/"Footer") arriscaria casar por engano outras
  // famílias (ex: "[dsc-tc] Footer Template", que é um template de doc, não
  // uma instância real de rodapé — não deve mudar de bucket).
  const override = A11Y_STRUCTURAL_EXACT_OVERRIDES[String(containingFrameName || '').trim()];
  if (override) {
    return { shortName: override.shortName, confidence: 'baixa', reason: override.reason };
  }

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
    console.error(`   Rode antes: node src/plugin/refs/fetch-design-refs.cjs --only ${SRC_FILE.replace(/\.json$/, '')}`);
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
  // por confiança é responsabilidade de altaConfianca/baixaConfianca no JSON.
  // 'estrutura' não é um dos 16 shortNames de A11Y_SHORTNAMES (é uma das 5
  // categorias FIXAS de a11y, não um componente de "Elementos e Imagens"),
  // mas pode aparecer como match.shortName via
  // A11Y_STRUCTURAL_EXACT_OVERRIDES — sem essa entrada extra, o incremento
  // abaixo quebraria com "Cannot read properties of undefined" na primeira
  // família de Header/Footer.
  const byShortName = {};
  for (const s of A11Y_SHORTNAMES) byShortName[s] = { families: 0, variantCount: 0 };
  byShortName['estrutura'] = { families: 0, variantCount: 0 };
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
      description: 'Mapa containingFrame -> categoria de a11y, ESSENCIAL EM RUNTIME no hac (consumido por _getDscFrameToA11yMap em code.js para a Detecção Automática de a11y). Gerado por build-dsc-a11y-mapping.cjs a partir de refs/web-angular-react.json (dados reais da REST API do Figma, sem valores inventados). Adaptação do Handex Beta (onde este mesmo formato de arquivo é descrito como "fundação de dados, não usado em runtime" — desatualizado lá, mas aqui no hac o consumo em runtime é o desenho intencional desde o início).',
      generatedAt: new Date().toISOString(),
      generator: 'build-dsc-a11y-mapping.cjs (hac)',
      sourceFile: SRC_FILE,
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
