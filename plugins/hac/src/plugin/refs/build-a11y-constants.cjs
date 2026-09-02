// ============================================================
// HAC — build-a11y-constants.cjs
//
// Codegen que deriva, a partir do dado bruto extraído via REST API
// (refs/design-acessivel-properties.json e
// refs/design-acessivel-mobile-properties.json — gerados por
// fetch-component-properties.cjs), as constantes hoje consumidas por
// src/plugin/modules/accessibility.js via alias:
//
//   - A11Y_COMPONENT_PROPERTIES        (25 component sets "[a11y base]"
//     desktop — accessibility.js: const A11Y_COMPONENT_PROPERTIES =
//     A11Y_COMPONENT_PROPERTIES_GENERATED;)
//   - A11Y_MOBILE_LINK_COMPONENT_OPTIONS (64 opções do dropdown VARIANT
//     "Link" do component set interno ".[a11y mob base] Link do
//     Componente" — accessibility.js: const
//     A11Y_MOBILE_LINK_COMPONENT_OPTIONS =
//     A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED;)
//   - A11Y_MOBILE_COMPONENT_LINK_NODE_IDS (2026-09-02 — cruzamento
//     automático, por NOME EXATO, entre as 64 opções acima e os
//     containingFrame/containingFrameNodeId REAIS de refs/super-app.json,
//     lib "DSC | Super App" — fileKey e slug lidos de refs/_manifest.json.
//     Só os nomes com match exato e sem ambiguidade entram na tabela
//     (hoje 46/64 — os outros 18, incl. "Personalizado", não têm
//     correspondência segura na lib real e ficam de fora: o campo de link
//     continua manual pra eles). Consumido por accessibility.js pra gerar
//     automaticamente a URL do deep-link do Figma
//     (https://www.figma.com/design/{fileKey}/{fileName}?node-id={nodeId})
//     quando o designer escolhe um nome do dropdown "Link do Componente".
//     100% derivado do dado extraído por fetch-design-refs.cjs — nenhuma
//     tabela estática escrita à mão; se o componente mudar de nodeId ou for
//     renomeado na lib real, o próximo refresh do skeleton (CI semanal)
//     já reflete isso aqui automaticamente.
//
// Segue o mesmo padrão de organização de refs/build-skeleton.cjs: lê
// refs/*.json (output do fetch), escreve um artefato derivado, sem tocar
// em valores resolvidos além dos já presentes nos JSONs de origem (nomes,
// syncIds, defaults, opções de variante — nada de hex/px, nada novo que já
// não estivesse no dado extraído da API).
//
// IMPORTANTE (2026-09-01): este arquivo gerado (refs/
// _a11y-constants.generated.js) é concatenado por build.cjs no bundle final
// (ui.html) ANTES de accessibility.js — é a fonte de verdade real hoje. Os
// literais manuais que existiam colados em accessibility.js foram removidos
// após validação humana do diff entre o gerado e o manual (paridade total,
// zero divergência de conteúdo).
//
// Uso:
//   node src/plugin/refs/build-a11y-constants.cjs
// Ou via:
//   npm run refs:a11y-constants
// ============================================================

const fs = require('fs');
const path = require('path');

const REFS_DIR = __dirname;
const DESKTOP_SRC = path.join(REFS_DIR, 'design-acessivel-properties.json');
const MOBILE_SRC = path.join(REFS_DIR, 'design-acessivel-mobile-properties.json');
const SUPER_APP_SRC = path.join(REFS_DIR, 'super-app.json');
const MANIFEST_SRC = path.join(REFS_DIR, '_manifest.json');
const OUT = path.join(REFS_DIR, '_a11y-constants.generated.js');
// Saída SEPARADA (JSON puro, não concatenada no bundle da UI) — consumida só
// pelo backend (code.js) via `import ... from './refs/...json'`, MESMO
// padrão já usado ali para design-acessivel-content.json/dsc-component-a11y-
// mapping*.json. Não pode virar um `export` dentro de
// _a11y-constants.generated.js porque aquele arquivo é concatenado CRU
// dentro de um único <script> não-module em ui.html (ver build.cjs) — um
// `export {}` ali quebraria o bundle do frontend.
const MOBILE_WRAPPER_OUT = path.join(REFS_DIR, 'design-acessivel-mobile-wrapper.generated.json');

function readJSON(abs, label) {
  if (!fs.existsSync(abs)) {
    console.warn(`⚠  missing ${label}: ${abs}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

// ── A11Y_COMPONENT_PROPERTIES ───────────────────────────────────────────
// Um item por component set real "[NÃO UTILIZAR][a11y base] *" da lib
// desktop "Design Acessível" — MESMO shape consumido hoje por
// accessibility.js (_getA11yComponentToggles): { shortName, properties:
// [{ name, syncId, type, variantOptions?, defaultValue? }] }.
function buildComponentProperties(desktopJSON) {
  if (!desktopJSON || !Array.isArray(desktopJSON.components)) return [];

  return desktopJSON.components.map(c => ({
    shortName: c.shortName,
    properties: (c.properties || []).map(p => {
      const prop = {
        name: p.name,
        syncId: p.syncId === undefined ? null : p.syncId,
        type: p.type,
      };
      if (p.type === 'VARIANT') {
        prop.variantOptions = p.variantOptions || [];
        prop.defaultValue = p.defaultValue;
      }
      return prop;
    }),
  }));
}

// ── A11Y_MOBILE_WRAPPER ──────────────────────────────────────────────────
// Component set publicado "[a11y mob] Box specs leitor de tela" (fileKey
// 3zdtN13YvPlCGPdXeL0Y2i, node 5413:1262) NÃO é importável via
// figma.importComponentByKeyAsync — essa API só aceita a key de uma VARIANTE
// individual (COMPONENT), não a key do COMPONENT_SET em si (que é o que
// wrapperSet.key contém, extraído por fetch-component-properties.cjs). Usar
// a key do set causava "Could not find a published component with the key"
// em runtime (bug real, confirmado 2026-09-02).
//
// Corrigido usando diretamente as keys das 3 variantes filhas (uma por
// categoria coberta: elemento/titulo/decorativo) em vez da key do set + a
// property VARIANT "Conector" via setProperties. Essas 3 keys NÃO estão em
// nenhum JSON de refs existente — fetch-component-properties.cjs só resolve
// key para o nível de component set (variantes filhas ficam com key: null
// no JSON, ver design-acessivel-mobile-properties.json nodeId 5413:1262),
// então foram extraídas numa chamada avulsa e pontual à REST API do Figma
// (GET /v1/files/:key/nodes?ids=5413:1259,5413:1260,5413:1261) em
// 2026-09-02 e confirmadas 2x. Documentadas aqui (não em JSON de origem)
// pelo mesmo motivo do bloco conectorValueByA11yType abaixo: é uma
// correspondência pontual PRODUTO -> variante da lib, mantida bem visível
// pra não virar "key solta" disfarçada de gerado. Se precisar reextrair no
// futuro (ex: lib republicada com novos node ids), rodar a mesma chamada
// contra o fileKey acima.
const MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE = {
  // categoria a11y -> { nodeId, key } da variante (COMPONENT) real,
  // extraídos e confirmados em 2026-09-02.
  elemento:   { nodeId: '5413:1261', key: 'dc9a3b3d903b4d89ca1173bca5eb0537c9afd136' }, // "Elementos e imagens"
  titulo:     { nodeId: '5413:1259', key: '2e2ed48f6e4574a873bbb2d9a4391cc63572a6d2' }, // "Títulos"
  decorativo: { nodeId: '5413:1260', key: '7d3ccfcea95ea4159d78244f6f6c84963dd54adf' }, // "Elementos decorativos"
};

function buildMobileWrapper(mobileJSON) {
  if (!mobileJSON || !Array.isArray(mobileJSON.components)) return null;

  const wrapperSet = mobileJSON.components.find(
    c => c.shortName === 'Box specs leitor de tela'
  );
  if (!wrapperSet || !wrapperSet.key) {
    console.warn('⚠  component set "Box specs leitor de tela" (ou sua key) não encontrado no JSON mobile — A11Y_MOBILE_WRAPPER ficará nulo');
    return null;
  }

  const conectorProp = (wrapperSet.properties || []).find(
    p => p.type === 'VARIANT' && p.name === 'Conector'
  );
  if (!conectorProp || !Array.isArray(conectorProp.variantOptions)) {
    console.warn('⚠  property VARIANT "Conector" não encontrada em "Box specs leitor de tela" — A11Y_MOBILE_WRAPPER ficará nulo');
    return null;
  }

  // Confere que as 3 opções esperadas ainda existem na lib real antes de
  // hardcodar o mapeamento — se a lib mudar de nomenclatura, o build avisa
  // em vez de gerar uma constante que aponta pra uma variante inexistente.
  const expected = ['Elementos e imagens', 'Títulos', 'Elementos decorativos'];
  const missing = expected.filter(v => !conectorProp.variantOptions.includes(v));
  if (missing.length > 0) {
    console.warn(`⚠  variantes esperadas de "Conector" não encontradas na lib mobile: ${missing.join(', ')} — A11Y_MOBILE_WRAPPER ficará nulo`);
    return null;
  }

  return {
    // componentKeyByA11yType: key IMPORTÁVEL (VARIANTE/COMPONENT) por
    // categoria — substitui o antigo par componentKey (do SET, não
    // importável) + conectorPropertyName/conectorValueByA11yType +
    // setProperties. code.js importa direto a variante certa, sem precisar
    // mais selecionar o Conector em runtime.
    componentKeyByA11yType: {
      elemento: MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE.elemento.key,
      titulo: MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE.titulo.key,
      decorativo: MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE.decorativo.key,
    },
  };
}

// ── A11Y_MOBILE_LINK_COMPONENT_OPTIONS ──────────────────────────────────
// As 64 opções da property VARIANT "Link" do component set interno
// ".[a11y mob base] Link do Componente" (nó "." oculto, sem key publicada,
// só alcançável via --deep-scan em fetch-component-properties.cjs — ver
// components[].source === 'tree-walk' no JSON mobile). Mesmo array de
// strings, na mesma ordem retornada pela API, hoje colado manualmente em
// accessibility.js.
function buildMobileLinkOptions(mobileJSON) {
  if (!mobileJSON || !Array.isArray(mobileJSON.components)) return [];

  const linkComponentSet = mobileJSON.components.find(
    c => c.shortName === 'Link do Componente'
  );
  if (!linkComponentSet) {
    console.warn('⚠  component set "Link do Componente" não encontrado no JSON mobile — A11Y_MOBILE_LINK_COMPONENT_OPTIONS ficará vazio');
    return [];
  }

  const linkProp = (linkComponentSet.properties || []).find(
    p => p.type === 'VARIANT' && p.name === 'Link'
  );
  if (!linkProp) {
    console.warn('⚠  property VARIANT "Link" não encontrada em "Link do Componente" — A11Y_MOBILE_LINK_COMPONENT_OPTIONS ficará vazio');
    return [];
  }

  return linkProp.variantOptions || [];
}

// ── A11Y_MOBILE_COMPONENT_LINK_NODE_IDS ─────────────────────────────────
// Cruza cada nome de mobileLinkOptions (as 64 opções do dropdown) contra os
// containingFrame REAIS de refs/super-app.json (lib "DSC | Super App"),
// por NOME EXATO (case-insensitive, só removendo o prefixo "[dsc] " e
// espaços nas pontas) — MESMO critério de match validado manualmente na
// investigação prévia (46/64 batem sem ambiguidade). Não reaproveita o
// word-match por token de build-dsc-a11y-mapping.cjs (aquele é fuzzy, feito
// pra achar a CATEGORIA de a11y mais provável entre só 16 opções amplas;
// aqui precisamos do componente EXATO, senão o link gerado apontaria pro
// componente errado).
function buildMobileComponentLinkNodeIds(superAppJSON, mobileLinkOptions) {
  if (!superAppJSON || !Array.isArray(superAppJSON.components)) return {};
  if (!Array.isArray(mobileLinkOptions) || mobileLinkOptions.length === 0) return {};

  const stripDscPrefix = (name) => String(name || '').replace(/^\[dsc\]\s*/i, '').trim();

  // Nome curto (sem prefixo [dsc]) em minúsculas -> nodeId do component set.
  // Um único nodeId por nome real distinto (confirmado: 70 containingFrame
  // [dsc] distintos em super-app.json, sem colisão de nome após strip).
  const shortNameToNodeId = new Map();
  for (const c of superAppJSON.components) {
    const frame = c.containingFrame || '';
    if (!/^\[dsc\]/i.test(frame)) continue;
    if (!c.containingFrameNodeId) continue;
    const short = stripDscPrefix(frame);
    const key = short.toLowerCase();
    if (!shortNameToNodeId.has(key)) {
      shortNameToNodeId.set(key, { name: short, nodeId: c.containingFrameNodeId });
    }
  }

  const result = {};
  for (const optionName of mobileLinkOptions) {
    const key = String(optionName || '').trim().toLowerCase();
    const match = shortNameToNodeId.get(key);
    if (match) result[optionName] = match.nodeId;
  }
  return result;
}

// ── Geração ──────────────────────────────────────────────────────────────
const desktopJSON = readJSON(DESKTOP_SRC, 'design-acessivel-properties.json');
const mobileJSON = readJSON(MOBILE_SRC, 'design-acessivel-mobile-properties.json');
const superAppJSON = readJSON(SUPER_APP_SRC, 'super-app.json');
const manifestJSON = readJSON(MANIFEST_SRC, '_manifest.json');

const componentProperties = buildComponentProperties(desktopJSON);
const mobileWrapper = buildMobileWrapper(mobileJSON);
const mobileLinkOptions = buildMobileLinkOptions(mobileJSON);
const mobileComponentLinkNodeIds = buildMobileComponentLinkNodeIds(superAppJSON, mobileLinkOptions);

const superAppLibMeta = manifestJSON && Array.isArray(manifestJSON.libraries)
  ? manifestJSON.libraries.find(l => l.slug === 'super-app')
  : null;
const superAppFileKey = (superAppLibMeta && superAppLibMeta.fileKey) || '';
// O Figma não valida o segmento de nome do deep-link (funciona com qualquer
// string), mas o formato real gerado pela própria UI do Figma "slugifica" o
// nome do arquivo (espaços/pontuação -> hífen) — reproduzido aqui só por
// apresentação, sem afetar a resolução do link.
const slugifyFileName = (name) => String(name || '')
  .trim()
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const superAppFileName = slugifyFileName((superAppLibMeta && superAppLibMeta.name) || 'DSC Super App') || 'DSC-Super-App';

const header = `// ============================================================
// GERADO AUTOMATICAMENTE por build-a11y-constants.cjs — não editar à mão.
// Fonte: refs/design-acessivel-properties.json (${desktopJSON ? desktopJSON._meta.generatedAt : 'ausente'})
//      + refs/design-acessivel-mobile-properties.json (${mobileJSON ? mobileJSON._meta.generatedAt : 'ausente'})
//      + refs/super-app.json (${superAppJSON ? superAppJSON.meta.exportedAt : 'ausente'})
//      + refs/_manifest.json (fileKey da lib 'super-app')
// Regenerar via: node src/plugin/refs/build-a11y-constants.cjs
//            ou: npm run refs:a11y-constants
//
// Gerado em: ${new Date().toISOString()}
//
// Consumido via alias em src/plugin/modules/accessibility.js:
//   const A11Y_COMPONENT_PROPERTIES = A11Y_COMPONENT_PROPERTIES_GENERATED;
//   const A11Y_MOBILE_LINK_COMPONENT_OPTIONS = A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED;
//   const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED;
//   const A11Y_SUPER_APP_FILE_KEY = A11Y_SUPER_APP_FILE_KEY_GENERATED;
//   const A11Y_SUPER_APP_FILE_NAME = A11Y_SUPER_APP_FILE_NAME_GENERATED;
// Concatenado por build.cjs no bundle final (ui.html) ANTES de
// accessibility.js — não editar este arquivo à mão.
// ============================================================

`;

const body =
  `const A11Y_COMPONENT_PROPERTIES_GENERATED = ${JSON.stringify(componentProperties)};\n\n` +
  `const A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED = ${JSON.stringify(mobileLinkOptions, null, 2)};\n\n` +
  `const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED = ${JSON.stringify(mobileComponentLinkNodeIds, null, 2)};\n\n` +
  `const A11Y_SUPER_APP_FILE_KEY_GENERATED = ${JSON.stringify(superAppFileKey)};\n` +
  `const A11Y_SUPER_APP_FILE_NAME_GENERATED = ${JSON.stringify(superAppFileName)};\n`;

fs.writeFileSync(OUT, header + body, 'utf8');

// design-acessivel-mobile-wrapper.generated.json — JSON puro, consumido só
// pelo backend (code.js) via import estático, mesmo padrão de
// design-acessivel-content.json. NULO quando a lib mobile não tiver o
// component set/property esperados (ver buildMobileWrapper) — code.js
// precisa checar antes de usar. Só cobre 3 das 5 categorias de a11y
// (elemento, titulo, decorativo) — "estrutura" e "informacoes" não têm
// equivalente mobile publicado conhecido. componentKeyByA11yType traz a key
// IMPORTÁVEL (variante/COMPONENT) de cada categoria — ver
// MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE acima pra origem/data da
// extração dessas 3 keys.
fs.writeFileSync(MOBILE_WRAPPER_OUT, JSON.stringify({
  _meta: {
    description: 'GERADO AUTOMATICAMENTE por build-a11y-constants.cjs — não editar à mão. Component set "[a11y mob] Box specs leitor de tela" (fileKey 3zdtN13YvPlCGPdXeL0Y2i) — componentKeyByA11yType traz a key IMPORTÁVEL de cada VARIANTE filha (elemento/titulo/decorativo), extraídas via REST API em 2026-09-02 (a key do component set em si NÃO é importável via figma.importComponentByKeyAsync). Cobre só 3 das 5 categorias — sem equivalente mobile publicado para estrutura/informacoes.',
    source: 'refs/design-acessivel-mobile-properties.json + extração pontual REST API 2026-09-02 (ver MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE em build-a11y-constants.cjs)',
    generatedAt: new Date().toISOString(),
  },
  wrapper: mobileWrapper,
}, null, 2), 'utf8');

console.log(`✅ _a11y-constants.generated.js`);
console.log(`   A11Y_COMPONENT_PROPERTIES_GENERATED: ${componentProperties.length} component sets`);
console.log(`   A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED: ${mobileLinkOptions.length} opções`);
console.log(`   A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED: ${Object.keys(mobileComponentLinkNodeIds).length} nomes com nodeId real (de ${mobileLinkOptions.length} opções)`);
console.log(`✅ design-acessivel-mobile-wrapper.generated.json`);
console.log(`   wrapper: ${mobileWrapper ? 'resolvido (' + Object.keys(mobileWrapper.componentKeyByA11yType).length + ' keys de variante)' : 'NULO — ver warnings acima'}`);
