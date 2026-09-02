// ============================================================
// HAC — build-dsc-a11y-mapping.cjs
// Adaptação de src/plugin/refs/build-dsc-a11y-mapping.cjs do Handex Beta
// (2026-08-24), com CORREÇÃO DE MATCHING em 2026-09-01 (falsos positivos
// comprovados na lib super-dsc-web: ícones soltos como "3d-select-face",
// "playlist-plus", "window-tabs" batendo por substring solta contra
// sinônimos de inputs/listas/tab group). 3 correções aplicadas:
//   1. Filtro de prefixo (DSC_FRAME_PREFIXES/hasDscPrefix) — descarta
//      containingFrame que não seja um component set DSC real ANTES de
//      qualquer match.
//   2. Match por PALAVRA COMPLETA (wordMatch/tokensOf), não substring —
//      elimina falso positivo tipo "select" dentro de "3d-select-face".
//   3. Tabela de correspondência curada POR LIB (A11Y_LIB_COMPONENT_MAP),
//      substituindo o antigo A11Y_SYNONYMS genérico aplicado igualmente
//      às 3 libs.
// Diferente do Handex (onde este mapa é rotulado "fundação de dados, não
// usado em runtime"), no hac o output deste script —
// dsc-component-a11y-mapping.json — é ESSENCIAL EM RUNTIME: é consumido
// por _getDscFrameToA11yMap() em code.js para resolver containingFrame →
// {shortName, confidence} da Detecção Automática de a11y. Ver nota em
// dsc-component-a11y-mapping.json.
//
// Para cada component set real de uma das 3 libs de produção
// (refs/web-angular-react.json, refs/super-app.json, refs/super-dsc-web.json,
// geradas por fetch-design-refs.cjs), tenta casar o nome com um dos 16
// shortNames de acessibilidade já usados no formulário dinâmico (ver módulo
// accessibility.js → A11Y_COMPONENTE_LABELS).
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

// Slug da lib de origem (mesma convenção de refs/_manifest.json e das chaves
// `libs` em A11Y_LIB_COMPONENT_MAP) — derivado do nome do arquivo de origem
// sem extensão. Usado por matchShortName para consultar só a curadoria
// específica da lib atual, nunca a de outra lib.
const LIB_SLUG = SRC_FILE.replace(/\.json$/, '');

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

// Prefixos REAIS de component set/família das 3 libs de produção — CONFIRMADO
// nos dados reais (2026-09-01) via inspeção de containingFrame das 3 libs
// (web-angular-react.json, super-app.json, super-dsc-web.json). Qualquer
// containingFrame que não comece com um destes é ruído e NUNCA deve ser
// submetido a matchShortName — é a causa raiz dos falsos positivos
// comprovados (ícones soltos de icon-set genérico, sem relação com DSC, ex:
// "3d-select-face", "playlist-plus", "window-tabs" batendo por substring
// solta contra sinônimos de "inputs"/"listas"/"tab group"). "⚙️" era citado
// em versão antiga deste comentário como candidato mas NÃO aparece nos dados
// reais das 3 libs — removido daqui por não ter suporte empírico.
// Confirmado por lib (contagem de families por prefixo, 2026-09-01):
//   web-angular-react: [dsc]=47, [dsc-tc]=3, [dsc doc]=1, (sem prefixo)=10 (ruído: "Group 8", "componentes", etc.)
//   super-app:         [dsc]=70, [dsc-tc]=23, [dsc-ts]=31, [dsc-ult]=8, [chart]=1, (sem prefixo)=1417 (ruído: ícones soltos)
//   super-dsc-web:     [dsc]=80, [dsc-tc]=9, [dsc-ts]=4, (sem prefixo)=1413 (ruído: ícones soltos)
// Confirmado também para a lib mobile/Android (dsc-android, adicionada
// 2026-09-02): [dsc]=782 variantes/35 families reais (ex: "[dsc] Icon
// Button", "[dsc] Checkbox"), [base]=4 (componentes internos de
// navegação auxiliar, NÃO catalogáveis — propositalmente fora deste
// filtro, mesmo critério de ruído das outras libs), (sem prefixo)=275
// (ícones soltos, mesmo padrão de ruído já visto em super-app/super-dsc-web).
const DSC_FRAME_PREFIXES = [/^\[dsc\]/i, /^\[dsc-tc\]/i, /^\[dsc-ts\]/i, /^\[dsc-ult\]/i, /^\[dsc doc\]/i, /^\[chart\]/i];

function hasDscPrefix(containingFrameName) {
  const s = String(containingFrameName || '').trim();
  return DSC_FRAME_PREFIXES.some(re => re.test(s));
}

// Tabela de correspondência CURADA POR LIB — substitui o antigo A11Y_SYNONYMS
// genérico (aplicado igualmente às 3 libs), que era exatamente o mecanismo do
// falso positivo: um sinônimo pensado pra uma lib (ex: 'select' pra
// web-angular-react) podia bater por substring solta em nomes de outra lib
// sem relação nenhuma. Cada shortName aqui lista, PARA CADA LIB, os nomes reais
// (sem o prefixo [dsc.../[dsc doc]) de containingFrame que representam aquele
// componente — curado a partir da inspeção real de web-angular-react.json,
// super-app.json e super-dsc-web.json (2026-09-01), não de suposição. Testado
// por PALAVRA COMPLETA (ver wordMatch/tokensOf), não substring — normalize()
// segue sendo a normalização de base, mas a comparação final exige token
// inteiro batendo, não fragmento de string.
//
// slugs de lib usados como chave aqui = mesmo slug de refs/_manifest.json
// (bate com o nome de arquivo sem .json): 'web-angular-react', 'super-app',
// 'super-dsc-web', 'dsc-android'.
//
// Curadoria de 'dsc-android' (Material Design nativo, adicionada 2026-09-02)
// feita a partir da inspeção real de dsc-android.json e
// dsc-android-properties.json (35 families reais com prefixo "[dsc]",
// confirmado 2026-09-02) — não de suposição sobre nomenclatura Material.
// Vários component sets desta lib são elementos estruturais/de navegação
// SEM equivalente nos 16 shortNames (Badge, Divider, Top App Bar, Navigation
// Bar/Rail/Drawer, Menu, Plain Tooltip, indicadores de progresso) — mantidos
// SEM entrada aqui de propósito, mesmo padrão de "Card"/"Tooltip"/"Spinner"
// já adotado nas outras 3 libs (componente DSC real, mas fora do escopo dos
// 16 componentes interativos catalogados). Chips (Assist/Filter/Input/
// Suggestion Chip) também ficaram FORA por não terem equivalente direto
// claro em nenhuma das 3 libs já curadas (não é buton nem input no sentido
// estrito do formulário de a11y) — decisão conservadora, evita inventar
// correspondência sem base semântica sólida.
const A11Y_LIB_COMPONENT_MAP = [
  { shortName: 'accordion', libs: {
    'web-angular-react': ['Accordion'],
    'super-app': ['Accordion', 'List Accordion'],
    // super-dsc-web: SEM correspondência clara — não existe family "Accordion"
    // nem "List Accordion" nos dados reais desta lib (confirmado 2026-09-01).
    // dsc-android: SEM correspondência — não existe family "Accordion" nos
    // dados reais desta lib (confirmado 2026-09-02).
  } },
  { shortName: 'breadcrumb', libs: {
    'web-angular-react': ['Breadcrumb'],
    // super-app: SEM correspondência — nomenclatura mobile não usa breadcrumb
    // (padrão de navegação é próprio de desktop/web).
    'super-dsc-web': ['Breadcrumb'],
    // dsc-android: SEM correspondência — mobile nativo não usa breadcrumb
    // (mesmo raciocínio de super-app).
  } },
  { shortName: 'button', libs: {
    'web-angular-react': ['Button'],
    'super-app': ['Button', 'Icon Button', 'Icon Button Text', 'Segmented Button', 'Tile Button', 'Credit Card Button', 'Digital Wallet Button'],
    'super-dsc-web': ['Button', 'Icon Button', 'Icon Button Text', 'Toggle Button', 'Toggle Icon Button', 'Segmented Button', 'Tile Button', 'Batch Button'],
    // dsc-android: "Button" e "Icon Button" já batem por wordMatch direto
    // (ALTA confiança, ver matchShortName) — não precisam de entrada aqui.
    // Mantido comentário para registrar que a curadoria foi considerada e
    // não houve necessidade de correspondência indireta.
  } },
  { shortName: 'checkbox', libs: {
    'web-angular-react': ['Checkbox'],
    'super-app': ['Checkbox'],
    'super-dsc-web': ['Checkbox'],
    // dsc-android: "Checkbox" já bate por wordMatch direto (ALTA confiança).
  } },
  { shortName: 'dialog', libs: {
    'web-angular-react': ['Dialog'],
    // super-app: nomenclatura mobile usa "Sheet"/"Tipkit Popover" em vez de
    // "Dialog" — equivalente semântico de plataforma (modal/overlay bloqueante),
    // decisão de curadoria explícita, não substring incidental.
    'super-app': ['Sheet'],
    // super-dsc-web: usa "Modal" em vez de "Dialog" — mesmo padrão de
    // equivalência semântica (Dialog do Angular Material ~ Modal do DSC web).
    'super-dsc-web': ['Modal'],
    // dsc-android: "Dialog" já bate por wordMatch direto (ALTA confiança).
  } },
  { shortName: 'inputs', libs: {
    'web-angular-react': [
      'Input', 'Input Currency', 'Input File', 'Input Textarea', 'Input with Chips',
      'Datepicker', 'Datepicker Calendar', 'Datepicker Range', 'Timepicker',
      'Dropdown Input with Chips', 'Dropdown Select with Chips', 'Select', 'Select with Chips',
      'Range Slider', 'Slider',
    ],
    'super-app': [
      'Input Chat', 'Input Money', 'Input Pin', 'Input Slider', 'Input Stepper',
      'Text Field Form', 'Text Field Single', 'Date Picker', 'Date Picker Container',
      'Account Select', 'Search Bar',
    ],
    'super-dsc-web': [
      'Input Chat', 'Input Money', 'Input Pin', 'Input Slider', 'Input Stepper', 'Input with Chips',
      'Text Field Form', 'Text Area', 'Date Field Form', 'Password Field Form', 'Select Field Form',
      'Dropdown', 'Account Select', 'Search Bar',
    ],
    // dsc-android: "Text Field" é o campo de entrada de texto genérico
    // (Material Design), equivalente direto a "Text Field Form"/"Input" nas
    // outras libs. Sliders (Discrete/Continuous/Centered/Range Selection
    // Slider) equivalem a "Range Slider"/"Slider"/"Input Slider" já curados
    // para as outras 3 libs — mesmo padrão de controle de entrada por
    // arrasto. "Modal Date Picker"/"Modal Date Input" equivalem a "Date
    // Picker"/"Date Field Form" já curados — mesmo conceito de seletor de
    // data, variação "modal" é detalhe de apresentação Android, não muda a
    // categoria de a11y.
    'dsc-android': [
      'Text Field', 'Discrete Slider', 'Continuous Slider', 'Centered Slider',
      'Range Selection Slider', 'Modal Date Picker', 'Modal Date Input',
    ],
  } },
  { shortName: 'link', libs: {
    // Nenhuma das 3 libs tem um component set [dsc] chamado "Link" (link
    // costuma ser estilo de texto/token, não componente estruturado nestas
    // libs) — SEM correspondência clara em nenhuma das 3, confirmado
    // 2026-09-01. Mantido aqui vazio de propósito (não usar substring
    // "link" contra nomes como "Sidebar Menu" ou "Table / Body Cell" — não
    // haveria bate real de qualquer forma, só documentando a ausência).
    // dsc-android: mesma ausência — sem family "Link" nos dados reais.
  } },
  { shortName: 'listas', libs: {
    // web-angular-react: sem family "Lista" — "Menu item"/"Menu Lateral" são
    // os candidatos mais próximos de navegação em lista, mas sem prefixo
    // [dsc] (vêm sem prefixo nos dados reais) — não incluídos aqui por não
    // atender ao filtro de prefixo de qualquer forma.
    'super-app': ['List Item', 'List Heading', 'List Footer', 'List Accordion', 'Transaction List Item'],
    'super-dsc-web': ['List Item', 'List Heading', 'Progress List', 'Progress List Item'],
    // dsc-android: SEM correspondência clara — não existe family "[dsc] List
    // *" nos dados reais desta lib (confirmado 2026-09-02); "[base] Item"/
    // "[base] Menu item" são componentes internos sem prefixo [dsc], fora do
    // filtro de qualquer forma.
  } },
  { shortName: 'paginator', libs: {
    'web-angular-react': ['Paginator'],
    // super-app: SEM correspondência — não existe "Paginator" na lib mobile
    // (padrão de paginação mobile é scroll infinito / outro padrão, não
    // paginador de página como no desktop).
    'super-dsc-web': ['Paginator'],
    // dsc-android: SEM correspondência — mesmo raciocínio de super-app
    // (mobile nativo não usa paginador de página).
  } },
  { shortName: 'radio button', libs: {
    'web-angular-react': ['Radio Button'],
    'super-app': ['Radio'],
    'super-dsc-web': ['Radio'],
    // dsc-android: "Radio Button" já bate por wordMatch direto (ALTA confiança).
  } },
  { shortName: 'snackbar', libs: {
    'web-angular-react': ['Snackbar'],
    // super-app: usa "Toast" em vez de "Snackbar" — equivalência semântica de
    // plataforma (mesma decisão de curadoria do par Dialog/Sheet acima).
    'super-app': ['Toast'],
    'super-dsc-web': ['Toast'],
    // dsc-android: SEM correspondência clara — não existe family "Snackbar"
    // nem "Toast" nos dados reais desta lib (confirmado 2026-09-02).
  } },
  { shortName: 'stepper', libs: {
    'web-angular-react': ['Horizontal Stepper', 'Vertical Stepper'],
    // super-app: "Input Stepper" é campo numérico incremental (não indicador
    // de progresso multi-etapas) — conceito DIFERENTE do Stepper de a11y
    // (que documenta navegação sequencial entre etapas), por isso NÃO
    // incluído aqui apesar de conter a palavra "Stepper". SEM correspondência
    // clara pro conceito de a11y nesta lib.
    'super-dsc-web': ['Stepper'],
    // dsc-android: SEM correspondência — não existe family "Stepper" nos
    // dados reais desta lib.
  } },
  { shortName: 'switch', libs: {
    'web-angular-react': ['Switch'],
    'super-app': ['Switch'],
    'super-dsc-web': ['Switch'],
    // dsc-android: "Switch" já bate por wordMatch direto (ALTA confiança).
  } },
  { shortName: 'table', libs: {
    'web-angular-react': ['Table Cell', 'Table Header', 'Table Footer'],
    // super-app: SEM correspondência — não há componente de tabela tabular na
    // lib mobile (dados tabulares em mobile usam padrões de lista).
    'super-dsc-web': ['Table / Body Cell', 'Table / Header Cell', 'Table / Footer Cell', 'Table Desktop', 'Table Mobile'],
    // dsc-android: SEM correspondência — mesmo raciocínio de super-app
    // (mobile nativo não usa tabela tabular).
  } },
  { shortName: 'tab group', libs: {
    'web-angular-react': ['Tab Group'],
    // super-app: nomeia só "Tabs" (plural, sem "group") — confirmado nos
    // dados reais desta lib.
    'super-app': ['Tabs'],
    // super-dsc-web: SEM correspondência — não existe family "Tabs"/"Tab
    // Group" nos dados reais desta lib (confirmado 2026-09-01).
    // dsc-android: nomeia "Tabs" (mesmo padrão de nomenclatura mobile de
    // super-app) — confirmado 2026-09-02.
    'dsc-android': ['Tabs'],
  } },
  { shortName: 'imagem', libs: {
    'web-angular-react': ['Logotipo'],
    'super-app': ['Image Media', 'Avatar', 'Avatar Hero', 'Logo CAIXA', 'Banking Logos', 'National Flags', 'Social Programs Logos'],
    'super-dsc-web': ['Image Media', 'Avatar', 'Logotipo', 'Banking Logos', 'National Flags', 'Social Programs Logos'],
    // dsc-android: "Logotipo" já bate por A11Y_STRUCTURAL_EXACT_OVERRIDES
    // (nome exato "[dsc] Logotipo") — não precisa de entrada aqui.
  } },
];

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

// Compara por TOKEN/PALAVRA COMPLETA, não substring — correção #2 aprovada.
// "needle" e "haystack" são normalizados (normalize(), COM espaços) e cada um
// vira uma lista de tokens; o match só vale se TODOS os tokens de needle
// aparecerem como tokens (exatos) em haystack, na ordem em que aparecem (não
// necessariamente adjacentes, pra tolerar "Radio Button" vs "Button Radio" —
// não observado nos dados reais, mas evita fragilidade desnecessária).
// Isso é o que impede "select" (needle) de bater dentro de "3d-select-face"
// (haystack) — "select" nunca é um TOKEN isolado de "3d-select-face" (o token
// ali é "3d-select-face" inteiro, sem separador), mas bate corretamente contra
// "[dsc] Select Field Form" (token "select" isolado).
function tokensOf(str) {
  return normalize(str).split(' ').filter(Boolean);
}

function wordMatch(needle, haystackName) {
  const needleTokens = tokensOf(needle);
  if (!needleTokens.length) return false;
  const haystackTokens = tokensOf(haystackName);
  if (!haystackTokens.length) return false;
  // Todos os tokens do needle precisam estar presentes (exatos) no haystack.
  return needleTokens.every(t => haystackTokens.includes(t));
}

// Confiança ALTA: o nome do shortName bate por PALAVRA COMPLETA (wordMatch)
// contra o containingFrame — não uma coincidência de poucas letras dentro de
// outra palavra maior sem relação semântica (esse era o bug: substring solta).
// Confiança BAIXA: bate só via A11Y_LIB_COMPONENT_MAP (correspondência
// indireta/curada por nós, específica da lib de origem, não o nome literal
// do shortName) ou é um caso ambíguo tratado como baixa confiança de propósito
// (ex: "[dsc] Tab" isolado, sem "Group" — pode ser aba individual).
//
// libSlug identifica de qual lib (web-angular-react/super-app/super-dsc-web)
// veio containingFrameName — correção #3: a tabela curada é POR LIB, não mais
// um sinônimo genérico global.
function matchShortName(containingFrameName, libSlug) {
  const norm = normalize(containingFrameName);

  // Correção #1 (filtro de prefixo): descarta ruído ANTES de qualquer match —
  // ver DSC_FRAME_PREFIXES e comentário de justificativa acima. Sem isso,
  // ícones soltos de icon-set genérico (ex: "3d-select-face", "playlist-plus",
  // "window-tabs") chegavam até aqui e batiam por acidente.
  if (!hasDscPrefix(containingFrameName)) {
    return null;
  }

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
  // teste genérico de palavra completa, senão geram falso-positivo de alta
  // confiança:
  //   - "table" e "tab group"/"tab" têm tokens que se sobrepõem
  //     ("Table" != "Tab" como token, mas mantido defensivo/explícito).
  // NOTA: usa wordMatch (token exato), não mais `sq.includes('table')`
  // (substring solta) — "Table" só bate token isolado, nunca fragmento
  // dentro de outra palavra.
  if (wordMatch('table', norm)) {
    return { shortName: 'table', confidence: 'alta', reason: 'palavra "table"' };
  }
  if (wordMatch('tab group', norm)) {
    return { shortName: 'tab group', confidence: 'alta', reason: 'palavra "tab group"' };
  }
  if (/(^|\s)tab(\s|$)/.test(norm)) {
    // "[dsc] Tab" isolado — é a base do Tab Group, mas não tem "group" no
    // nome. Sinalizado como baixa confiança: pode ser o próprio Tab Group
    // (aba individual) ou um componente não relacionado a a11y (raro).
    return { shortName: 'tab group', confidence: 'baixa', reason: '"tab" isolado, sem "group" no nome — pode ser aba individual do Tab Group' };
  }

  // Testa shortNames do mais LONGO (mais tokens) pro mais curto — evita que um
  // shortName genérico (ex: "button") capture por engano um nome que na
  // verdade bate com um shortName mais específico que o CONTÉM (ex: "radio
  // button" também contém o token "button"; sem essa ordenação "[dsc] Radio
  // Button" seria classificado errado como "button").
  const candidates = A11Y_SHORTNAMES
    .filter(s => s !== 'table' && s !== 'tab group') // já tratados acima
    .slice()
    .sort((a, b) => tokensOf(b).length - tokensOf(a).length);

  for (const shortName of candidates) {
    if (wordMatch(shortName, norm)) {
      return { shortName, confidence: 'alta', reason: `palavra "${shortName}"` };
    }
  }

  // Tabela curada POR LIB — correspondência indireta, sempre BAIXA confiança
  // (depende de curadoria nossa específica da lib de origem, não do nome
  // literal do shortName). Só consulta a entrada da lib atual (libSlug) —
  // elimina o risco de um nome curado pra uma lib bater por acidente em nomes
  // de outra lib que nunca foram inspecionados para aquele shortName.
  for (const { shortName, libs } of A11Y_LIB_COMPONENT_MAP) {
    const names = libSlug ? libs[libSlug] : null;
    if (!names || !names.length) continue;
    for (const curatedName of names) {
      if (wordMatch(curatedName, norm)) {
        return { shortName, confidence: 'baixa', reason: `tabela curada (${libSlug}) "${curatedName}"` };
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
    const m = matchShortName(fam.containingFrame, LIB_SLUG);
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
      libSlug: LIB_SLUG,
      dscFramePrefixesApplied: DSC_FRAME_PREFIXES.map(re => re.source),
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
