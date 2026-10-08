// ============================================================
// HAC — build-a11y-constants.cjs
//
// Codegen que deriva, a partir do dado bruto extraído via REST API
// (refs/design-acessivel-mobile-properties.json — lib NOVA, mobile e web,
// gerado por fetch-component-properties.cjs — e refs/design-acessivel-
// default-texts.json, de fetch-a11y-default-texts.cjs), as constantes hoje
// consumidas por src/plugin/modules/accessibility.js via alias. A lib ANTIGA
// (design-acessivel-properties.json) não é mais lida desde 2026-10-08.
//
//   - A11Y_FIXED_TEXTS / A11Y_MOBILE_FIXED_TOGGLES (2026-10-08) — textos
//     fixos e campos opcionais dos cards de Títulos e Decorativos
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
const { normalizeRecognitionName, loadWebAliases } = require('./web-recognition.cjs');

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
// Perfil WEB (2026-10-01): mesmo desenho do wrapper mobile, mas as keys das
// variantes vêm TODAS do dado extraído (variantKeys/wrapperVariants de
// design-acessivel-mobile-properties.json, gravados por
// fetch-component-properties.cjs) — nenhuma key escrita à mão neste arquivo.
const WEB_WRAPPER_OUT = path.join(REFS_DIR, 'design-acessivel-web-wrapper.generated.json');
const SUPER_DSC_WEB_SRC = path.join(REFS_DIR, 'super-dsc-web.json');

function readJSON(abs, label) {
  if (!fs.existsSync(abs)) {
    console.warn(`⚠  missing ${label}: ${abs}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

// ── Seleção do component set base ".[hac mob|web base] Elementos e imagens" ─
// A lib "[HAC] Handoff Super DSC Mobile e Web" tem DOIS sets com o mesmo
// shortName "Elementos e imagens" (um mobile, um web): achar por shortName
// dependia da ORDEM do array devolvido pela API. Agora a escolha é por nodeId
// (estável) com fallback por nome completo (regex por plataforma).
const MOBILE_ELEMENTOS_SET = { nodeId: '10206:2177', fullNameRe: /^\.?\[hac mob base\]\s*elementos e imagens$/i };
const WEB_ELEMENTOS_SET = { nodeId: '10658:3627', fullNameRe: /^\.?\[hac web base\]\s*elementos e imagens$/i };

function findElementosSet(json, spec) {
  if (!json || !Array.isArray(json.components)) return null;
  return json.components.find(c => c.nodeId === spec.nodeId)
    || json.components.find(c => spec.fullNameRe.test(String(c.fullName || '')))
    || null;
}

// Perfil WEB: a lib publicou nomes de property com espaço sobrando (ex.:
// " Observações#10634:2" em Spinner) — o formulário compara por igualdade
// exata, então o nome sujo escondia o campo. Só o perfil web normaliza
// (trim); o mobile mantém a saída byte a byte (opts.trimNames ausente).
function toggleNameNormalizer(opts) {
  return (opts && opts.trimNames) ? (n => String(n).trim()) : (n => n);
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
// Component set "[hac mob] Box specs leitor de tela" (fileKey
// HhriLSpKnCB2dHhyiU16iB, node 5413:1262 — mesmo nodeId da lib antiga,
// só a key de publicação mudou) NÃO é importável via
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
// no JSON, ver design-acessivel-mobile-properties.json nodeId 5413:1262).
//
// Migradas (2026-09-15) para a lib NOVA via GET
// /v1/files/HhriLSpKnCB2dHhyiU16iB/components (endpoint oficial de
// componentes publicados do arquivo, não deep-scan) — os 3 nós filhos
// continuam com os MESMOS nodeId de antes, só as keys e os valores de
// "Conector" mudaram (maiúsculas/nome mais longo na opção de elementos).
// Documentadas aqui (não em JSON de origem) pelo mesmo motivo do bloco
// abaixo: é uma correspondência pontual PRODUTO -> variante da lib,
// mantida bem visível pra não virar "key solta" disfarçada de gerado. Se
// precisar reextrair no futuro (ex: lib republicada com novos node ids),
// rodar a mesma chamada contra o fileKey acima.
const MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE = {
  // categoria a11y -> { nodeId, key } da variante (COMPONENT) real,
  // extraídas e confirmadas em 2026-09-15.
  elemento:   { nodeId: '10211:6229', key: '07949749708328cd1d50212cf67d92ddbe408b0f' }, // "Elementos Interativos e Imagens"
  titulo:     { nodeId: '5413:1259', key: 'eb45bff4404c4bcdd1681ca0dcacf79476043e08' }, // "Títulos"
  decorativo: { nodeId: '5413:1260', key: 'c34a58585f9cd5a6e3d4f248e593bd74d94c9ad4' }, // "Elementos Decorativos"
};

function buildMobileWrapper(mobileJSON) {
  if (!mobileJSON || !Array.isArray(mobileJSON.components)) return null;

  // A lib nova tem DOIS component sets com o mesmo shortName "Box specs
  // leitor de tela" — um mobile ("[hac mob] ...", nodeId 5413:1262) e um
  // web ("[hac web] ...", nodeId 10330:4204). Antes da migração só existia
  // a variante mobile, então o .find() por shortName bastava; agora
  // precisa desambiguar pelo fullName, senão pode pegar o set web por
  // acaso (ordem de array não é garantida pela REST API).
  const wrapperSet = mobileJSON.components.find(
    c => c.shortName === 'Box specs leitor de tela' && /^\.?\[hac mob\]/i.test(c.fullName)
  );
  if (!wrapperSet || !wrapperSet.key) {
    console.warn('⚠  component set mobile "Box specs leitor de tela" (ou sua key) não encontrado no JSON mobile — A11Y_MOBILE_WRAPPER ficará nulo');
    return null;
  }

  const conectorProp = (wrapperSet.properties || []).find(
    p => p.type === 'VARIANT' && p.name === 'Conector'
  );
  if (!conectorProp || !Array.isArray(conectorProp.variantOptions)) {
    console.warn('⚠  property VARIANT "Conector" não encontrada em "Box specs leitor de tela" (mobile) — A11Y_MOBILE_WRAPPER ficará nulo');
    return null;
  }

  // Confere que as 3 opções esperadas ainda existem na lib real antes de
  // hardcodar o mapeamento — se a lib mudar de nomenclatura, o build avisa
  // em vez de gerar uma constante que aponta pra uma variante inexistente.
  const expected = ['Elementos Interativos e Imagens', 'Títulos', 'Elementos Decorativos'];
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
// Migrado (2026-09-15) da lib ANTIGA (property VARIANT "Link" do
// component set interno ".[a11y mob base] Link do Componente", que tinha
// 64 opções + "Personalizado" como default real) para a lib NOVA
// (property VARIANT "Componente", 78 opções, direto no set principal
// ".[hac mob base]  Elementos e imagens" — sem nível de indireção, e SEM
// nenhuma opção "Personalizado"/"Outro").
//
// "Personalizado" deliberadamente NÃO é adicionado aqui (nem por conta
// própria do hac) — decisão de produto: o dropdown mostra só os
// componentes REAIS do catálogo; quando o auto-match por nome exato não
// encontra nada (accessibility.js, _renderA11yElementoMobileFields), o
// formulário cai automaticamente no modo de texto livre, sem exigir que
// o designer escolha uma opção de exceção. Ver
// hac_lib_design_acessivel_publicada_migracao_2026_09_15 (memória do
// projeto) para o histórico completo da migração.
function buildLinkOptions(json, setSpec, label) {
  if (!json || !Array.isArray(json.components)) return [];

  const elementosComponentSet = findElementosSet(json, setSpec);
  if (!elementosComponentSet) {
    console.warn(`⚠  component set "Elementos e imagens" (${label}) não encontrado no JSON — opções de componente ficarão vazias`);
    return [];
  }

  const componenteProp = (elementosComponentSet.properties || []).find(
    p => p.type === 'VARIANT' && p.name === 'Componente'
  );
  if (!componenteProp) {
    console.warn(`⚠  property VARIANT "Componente" não encontrada em "Elementos e imagens" (${label}) — opções de componente ficarão vazias`);
    return [];
  }

  return componenteProp.variantOptions || [];
}

// ── A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL ──────────────────────────
// Nomes (mesma grafia usada em mobileLinkOptions/A11Y_MOBILE_LINK_COMPONENT_
// OPTIONS) dos componentes reais cuja INSTÂNCIA aninhada, dentro do
// component set ".[hac mob base] Elementos e imagens", declara a property
// BOOLEAN "Nome Acessível" — dado real extraído por
// fetch-component-properties.cjs (ver extractPerVariantProperties, camada
// "instância aninhada por variante") e gravado em
// components[].perVariantProperties no JSON de origem. Decisão de produto
// (2026-09-17): condiciona a exibição do toggle informativo "Nome Acessível"
// no formulário de specs mobile "Elementos e Imagens" — só aparece quando o
// componente escolhido no dropdown "Link do Componente" está nesta lista.
// 100% derivado do dado real da lib — NUNCA hardcodar esta lista à mão (é
// exatamente o retrabalho que esta extensão do scan foi feita pra evitar).
//
// CORREÇÃO (2026-09-17, investigação "Leitor de Tela"): o critério original
// (variant.toggles, lido da INSTANCE aninhada em ".[hac mob base] Elementos
// e imagens") reflete só o DEFAULT herdado da definição do componente-base —
// quando esse componente-base é, ele mesmo, uma FOLHA de um segundo
// COMPONENT_SET oculto com sub-variantes tipo "Leitor de Tela"
// (Baseline/Disabled/Loading) ou "Propriedade 1" (Padrão/Variante 2/
// Variante 3), esse default é sempre `true` (é o valor herdado da
// definição do SET, presente em todas as sub-variantes por igual) e NÃO
// reflete se alguma sub-variante de fato TEM um nó do desenho vinculado
// (`visible`) àquela property. Confirmado via REST API: "Switch" e "Radio"
// apareciam aqui mesmo NENHUMA das suas sub-variantes reais (Baseline/
// Disabled) tendo binding ativo para "Nome Acessível" — falso-positivo
// puro. Outros 6 componentes (Button, Icon Button, Card Product Offer,
// Checkbox, List Accordion, List Item, Top App Bar) têm o binding ativo só
// em ALGUMAS sub-variantes, não em todas — mantidos na lista por ora
// (comportamento "true se existir em qualquer sub-variante", ver
// screenReaderVariants no schema) porque o formulário hoje não pergunta ao
// designer QUAL sub-variante de Leitor de Tela está documentando (não tem
// esse dropdown) — reduzir a granularidade real pra "existe em pelo menos
// 1" é a aproximação mais segura sem mudar o formulário. Ver memória do
// projeto para a decisão em aberto de adicionar o dropdown "Leitor de
// Tela" e resolver a granularidade completa.
//
// Critério novo: usa screenReaderVariants (camada 3 do scan, resolve o
// binding real por sub-variante) quando presente — inclui o componente
// só se PELO MENOS UMA sub-variante tiver "Nome Acessível" em
// activeToggles. Quando screenReaderVariants está AUSENTE (componente
// "solto", sem SET-neto de sub-variantes — maioria dos casos, ex: Product
// Card, Badge, Spinner), cai no critério antigo (variant.toggles) — nesses
// casos não há ambiguidade a resolver, o default já é o único valor
// possível.
//
// SOBREPOSIÇÃO ESPERADA com A11Y_MOBILE_SCREEN_READER_VARIANTS (auditoria
// 2026-09-23): 15 dos 66 componentes aparecem NAS DUAS listas — os que têm
// sub-variantes E cuja aproximação "pelo menos uma" dá true. Isso é
// redundante mas INTENCIONAL, não defeito: o consumidor
// (_a11yMobileComponentHasToggle, accessibility.js) sempre prioriza o dado
// granular por sub-variante quando ele existe, e só cai nesta lista para
// componentes "folha simples" — então, para esses 15, as entradas aqui
// nunca são lidas hoje. Mantidas de propósito: filtrá-las daqui
// economizaria alguns bytes, mas deixaria a lista INCOMPLETA se algum dia
// a precedência do consumidor mudar — dado sobrando é inofensivo, dado
// faltando vira bug silencioso. Não "otimizar" isso sem antes mudar o
// consumidor.
function buildComponentsWithNomeAcessivel(json, setSpec, opts) {
  if (!json || !Array.isArray(json.components)) return [];
  const nm = toggleNameNormalizer(opts);

  const elementosSet = findElementosSet(json, setSpec);
  if (!elementosSet || !Array.isArray(elementosSet.perVariantProperties)) {
    console.warn(`⚠  perVariantProperties de "Elementos e imagens" (${(opts && opts.label) || '?'}) não encontrado no JSON — resultado de COMPONENTS_WITH_NOME_ACESSIVEL ficará vazio (rode fetch-component-properties.cjs --lib design-acessivel-mobile --deep-scan)`);
    return [];
  }

  const names = [];
  for (const variant of elementosSet.perVariantProperties) {
    let hasNomeAcessivel;
    if (variant.screenReaderVariants && Array.isArray(variant.screenReaderVariants.variants)) {
      hasNomeAcessivel = variant.screenReaderVariants.variants.some(
        (sv) => Array.isArray(sv.activeToggles) && sv.activeToggles.map(nm).includes('Nome Acessível')
      );
    } else {
      hasNomeAcessivel = (variant.toggles || []).some((t) => nm(t.name) === 'Nome Acessível');
    }
    if (!hasNomeAcessivel) continue;
    // variantName vem como "Variante=Componente, Componente=Product Card" —
    // extrai só o valor de "Componente=" pra bater com mobileLinkOptions.
    const m = /Componente=(.+)$/.exec(variant.variantName || '');
    const name = m ? m[1].trim() : (variant.variantName || '').trim();
    if (name) names.push(name);
  }
  return names;
}

// ── A11Y_MOBILE_SCREEN_READER_VARIANTS ──────────────────────────────────
// Dropdown NOVO "Leitor de Tela" no formulário mobile "Elementos e Imagens"
// (decisão de produto 2026-09-17): quando o componente escolhido no
// dropdown "Componente do DSC" tem sub-variantes reais de Leitor de Tela
// (screenReaderVariants, ver comentário de buildMobileComponentsWithNome
// Acessivel acima), o formulário precisa oferecer ESSAS sub-variantes como
// segundo dropdown — e condicionar o toggle "Nome Acessível" pela
// COMBINAÇÃO componente+sub-variante (activeToggles), não mais só pelo
// componente sozinho (esse critério "existe em qualquer sub-variante"
// definido em buildMobileComponentsWithNomeAcessivel FICA como está —
// continua resolvendo a lista do dropdown "Componente do DSC" — mas deixa
// de ser suficiente sozinho pra decidir o toggle quando o componente tem
// sub-variantes).
//
// Shape: { [nomeComponente]: { subModeProperty, variants: [{ name,
// hasNomeAcessivel }] } }. Chave = mesmo nome que já bate com
// A11Y_MOBILE_LINK_COMPONENT_OPTIONS/A11Y_MOBILE_COMPONENTS_WITH_NOME_
// ACESSIVEL (extraído do mesmo "Componente=X" via regex). `name` de cada
// variante = valor puro após "Leitor de Tela=" (ou o nome real da property
// de sub-modo, ex: "Propriedade 1=" no caso do Icon Button) — já sem o
// prefixo, pronto pra popular o <option> do novo dropdown.
//
// Só inclui componentes com screenReaderVariants presente (26/64 hoje,
// achado real 2026-09-17 — deep-scan). Os outros ~38 ("folha simples", sem
// SET-neto de sub-variantes) simplesmente não aparecem aqui — o frontend
// trata ausência de chave como "sem dropdown novo, comportamento antigo".
//
// EXTENSÃO (2026-09-22, pedido explícito do usuário: "o plugin tem que
// refletir a mesma estrutura [do box spec], só que se modificar a depender
// da variante, do componente listado"): cada sub-variante agora carrega
// `activeToggles` (array COMPLETO de nomes BOOLEAN reais com binding ativo
// naquela sub-variante específica — Nome Acessível/Observações/Dica Leitor
// de Tela, o que existir), não só o booleano reduzido `hasNomeAcessivel` de
// antes. `hasNomeAcessivel` continua presente (retrocompatibilidade, nenhum
// ponto de consumo antigo quebra), mas passa a ser só um atalho derivado do
// array novo, nunca uma segunda fonte de verdade. Isso permite ao formulário
// decidir a visibilidade de QUALQUER toggle (não só Nome Acessível/Label)
// pela combinação real componente+sub-variante — ex.: "Top App Bar" na
// sub-variante "Show Filters" não tem "Observações" em activeToggles
// (confirmado via REST API, 1/109 sub-variantes reais), diferente de todas
// as outras sub-variantes do catálogo, que têm.
function buildScreenReaderVariants(json, setSpec, opts) {
  if (!json || !Array.isArray(json.components)) return {};
  const nm = toggleNameNormalizer(opts);

  const elementosSet = findElementosSet(json, setSpec);
  if (!elementosSet || !Array.isArray(elementosSet.perVariantProperties)) {
    console.warn(`⚠  perVariantProperties de "Elementos e imagens" (${(opts && opts.label) || '?'}) não encontrado no JSON — resultado de SCREEN_READER_VARIANTS ficará vazio (rode fetch-component-properties.cjs --lib design-acessivel-mobile --deep-scan)`);
    return {};
  }

  const result = {};
  for (const variant of elementosSet.perVariantProperties) {
    const srv = variant.screenReaderVariants;
    if (!srv || !Array.isArray(srv.variants) || srv.variants.length === 0) continue;

    const m = /Componente=(.+)$/.exec(variant.variantName || '');
    const componentName = m ? m[1].trim() : (variant.variantName || '').trim();
    if (!componentName) continue;

    // subModeProperty vem tipo "Leitor de Tela" ou "Propriedade 1" — usado
    // só como prefixo a remover de variantName (ex: "Leitor de Tela=
    // Baseline" -> "Baseline"), nunca exibido cru na UI.
    const prefixRe = new RegExp('^' + String(srv.subModeProperty || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=');
    const variants = srv.variants.map(sv => {
      const name = String(sv.variantName || '').replace(prefixRe, '').trim() || sv.variantName;
      const activeToggles = Array.isArray(sv.activeToggles) ? sv.activeToggles.map(nm) : [];
      const hasNomeAcessivel = activeToggles.includes('Nome Acessível');
      return { name, hasNomeAcessivel, activeToggles };
    });

    result[componentName] = { subModeProperty: srv.subModeProperty, variants };
  }
  return result;
}

// ── A11Y_MOBILE_COMPONENT_TOGGLES ───────────────────────────────────────
// Mapa { [nomeComponente]: string[] } com os nomes BOOLEAN reais (raw, ex.
// "Nome Acessível"/"Observações") que o componente tem em QUALQUER
// sub-variante — usado como fallback pelo formulário para componentes
// "folha simples" (sem screenReaderVariants, ver A11Y_MOBILE_SCREEN_READER_
// VARIANTS acima): nesse caso não há ambiguidade de sub-variante, `toggles`
// (camada 1 do scan) já é a lista real e definitiva. Para componentes COM
// screenReaderVariants, o formulário deve preferir a combinação
// componente+sub-variante (mais precisa) — este mapa aqui vira só um
// resumo "união de todas as sub-variantes", útil como fallback defensivo
// (ex. sub-variante ainda não escolhida) mas nunca a fonte primária nesse
// caso. 100% derivado de perVariantProperties — nunca lista hardcoded.
function buildComponentToggles(json, setSpec, opts) {
  if (!json || !Array.isArray(json.components)) return {};
  const nm = toggleNameNormalizer(opts);

  const elementosSet = findElementosSet(json, setSpec);
  if (!elementosSet || !Array.isArray(elementosSet.perVariantProperties)) {
    console.warn(`⚠  perVariantProperties de "Elementos e imagens" (${(opts && opts.label) || '?'}) não encontrado no JSON — resultado de COMPONENT_TOGGLES ficará vazio (rode fetch-component-properties.cjs --lib design-acessivel-mobile --deep-scan)`);
    return {};
  }

  const result = {};
  for (const variant of elementosSet.perVariantProperties) {
    const m = /Componente=(.+)$/.exec(variant.variantName || '');
    const componentName = m ? m[1].trim() : (variant.variantName || '').trim();
    if (!componentName) continue;

    const names = new Set();
    if (variant.screenReaderVariants && Array.isArray(variant.screenReaderVariants.variants)) {
      variant.screenReaderVariants.variants.forEach(sv => {
        (sv.activeToggles || []).forEach(name => names.add(nm(name)));
      });
    } else {
      (variant.toggles || []).forEach(t => { if (t && t.name) names.add(nm(t.name)); });
    }
    result[componentName] = Array.from(names);
  }
  return result;
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
function buildComponentLinkNodeIds(libJSON, linkOptions, normalize) {
  if (!libJSON || !Array.isArray(libJSON.components)) return {};
  if (!Array.isArray(linkOptions) || linkOptions.length === 0) return {};

  const stripDscPrefix = (name) => String(name || '').replace(/^\[dsc\]\s*/i, '').trim();
  const norm = normalize || ((n) => String(n || '').trim().toLowerCase());

  // Nome curto (sem prefixo [dsc]) normalizado -> nodeId do component set.
  // Um único nodeId por nome real distinto (confirmado: 70 containingFrame
  // [dsc] distintos em super-app.json, sem colisão de nome após strip).
  const shortNameToNodeId = new Map();
  for (const c of libJSON.components) {
    const frame = c.containingFrame || '';
    if (!/^\[dsc\]/i.test(frame)) continue;
    if (!c.containingFrameNodeId) continue;
    const short = stripDscPrefix(frame);
    const key = norm(short);
    if (!shortNameToNodeId.has(key)) {
      shortNameToNodeId.set(key, { name: short, nodeId: c.containingFrameNodeId });
    }
  }

  const result = {};
  for (const optionName of linkOptions) {
    const match = shortNameToNodeId.get(norm(optionName));
    if (match) result[optionName] = match.nodeId;
  }
  return result;
}

// ── PERFIL WEB — wrapper "[hac web] Box specs leitor de tela" ────────────────
// Espelha o mobile (set "[hac mob] Box specs leitor de tela", property VARIANT
// "Conector"), com UMA categoria a mais (Estrutura da Página) e SEM
// "Informações Adicionais" (decisão de produto 2026-10-01: a web segue
// exatamente o arquivo próprio). A key de cada variante é resolvida pelo NOME
// da opção de "Conector" em wrapperVariants — o NOME da opção por categoria é
// o único dado declarado aqui, e é CONFERIDO contra variantOptions reais da
// property (se a lib renomear, o build avisa em vez de apontar pra variante
// errada).
const WEB_WRAPPER_CONECTOR_OPTION_BY_A11Y_TYPE = {
  elemento: 'Elementos Interativos e Imagens',
  titulo: 'Títulos',
  decorativo: 'Elementos Decorativos',
  estrutura: 'Estrutura da Página',
};

// Component sets base de cada sub-bloco do perfil web, usados só para ler
// OPÇÕES reais (Nível H1-H6, Variação, Tipo...). Achados por nodeId estável
// com fallback por nome completo.
const WEB_BASE_SETS = {
  titulos: { nodeId: '10740:4663', fullNameRe: /^\.?\[hac web base\]\s*t[ií]tulos$/i },
  idiomas: { nodeId: '10740:4664', fullNameRe: /^\.?\[hac web base\]\s*idiomas$/i },
  marco: { nodeId: '10740:4680', fullNameRe: /^\.?\[hac web base\]\s*marco de navega[cç][aã]o$/i },
  estrutura: { nodeId: '10745:5011', fullNameRe: /^\.?\[hac web base\]\s*estrutura da p[aá]gina$/i },
};

function variantOptionsOf(setEntry, propName) {
  const p = setEntry && (setEntry.properties || []).find(x => x.type === 'VARIANT' && x.name === propName);
  return p && Array.isArray(p.variantOptions) ? p.variantOptions.slice() : [];
}

function buildWebWrapper(json) {
  if (!json || !Array.isArray(json.components)) return null;
  const wrapperSet = json.components.find(
    c => c.shortName === 'Box specs leitor de tela' && /^\.?\[hac web\]/i.test(c.fullName || '')
  );
  if (!wrapperSet || !wrapperSet.key) {
    console.warn('⚠  component set web "Box specs leitor de tela" (ou sua key) não encontrado no JSON — wrapper web ficará nulo');
    return null;
  }
  if (!Array.isArray(wrapperSet.wrapperVariants) || wrapperSet.wrapperVariants.length === 0) {
    console.warn('⚠  wrapperVariants ausente em "[hac web] Box specs leitor de tela" — rode fetch-component-properties.cjs --lib design-acessivel-mobile --deep-scan --reset (versão com variantKeys/wrapperVariants); wrapper web ficará nulo');
    return null;
  }
  const conectorOptions = variantOptionsOf(wrapperSet, 'Conector');

  const componentKeyByA11yType = {};
  const contentInstanceByA11yType = {};
  const missing = [];
  for (const [a11yType, optionName] of Object.entries(WEB_WRAPPER_CONECTOR_OPTION_BY_A11Y_TYPE)) {
    const variant = wrapperSet.wrapperVariants.find(v => v.name === `Conector=${optionName}`);
    if (!conectorOptions.includes(optionName) || !variant || !variant.key) {
      missing.push(`${a11yType} ("${optionName}")`);
      continue;
    }
    componentKeyByA11yType[a11yType] = variant.key;
    // Instância de CONTEÚDO = a que não é o "Conector" (selo). É nela que o
    // runtime preenche Componente/Nível/Variação/Observações.
    const content = variant.instances.find(i => i.name !== 'Conector');
    contentInstanceByA11yType[a11yType] = content ? {
      name: content.name,
      properties: content.properties.map(p => ({ name: String(p.name).trim(), type: p.type, value: p.value })),
    } : null;
  }
  if (missing.length) {
    console.warn(`⚠  variantes do wrapper web sem key/opção real na lib: ${missing.join(', ')} — wrapper web ficará nulo`);
    return null;
  }
  return {
    setNodeId: wrapperSet.nodeId,
    setName: wrapperSet.fullName,
    componentKeyByA11yType,
    contentInstanceByA11yType,
  };
}

// Para cada variante de "Estrutura da Página" (Variação), quais BOOLEANs a
// instância aninhada expõe (só "Idioma" tem — Observações). Vem de
// perVariantProperties do set ".[hac web base] Estrutura da Página".
function buildWebEstrutura(json) {
  const set = findElementosSet(json, WEB_BASE_SETS.estrutura);
  // "Idiomas" (Página/Parte) foi retirado da lib em 2026-10 — Idioma virou
  // componente único. Opcional: sem ele, idiomaTipos fica vazio e o
  // formulário/card tratam Idioma sem tipo.
  const idiomas = findElementosSet(json, WEB_BASE_SETS.idiomas);
  const marco = findElementosSet(json, WEB_BASE_SETS.marco);
  if (!set || !marco) {
    console.warn('⚠  sets web de Estrutura da Página (Estrutura/Marco de navegação) não encontrados — A11Y_WEB_ESTRUTURA ficará vazio');
    return { variacoes: [], marcoTipos: [], idiomaTipos: [], togglesByVariacao: {} };
  }
  const variacoes = variantOptionsOf(set, 'Variação');
  const togglesByVariacao = {};
  variacoes.forEach(v => { togglesByVariacao[v] = []; });
  for (const pv of (set.perVariantProperties || [])) {
    const m = /Varia[cç][aã]o=(.+)$/.exec(pv.variantName || '');
    if (!m) continue;
    togglesByVariacao[m[1].trim()] = (pv.properties || []).filter(p => p.type === 'BOOLEAN').map(p => String(p.name).trim());
  }
  return {
    variacoes,
    marcoTipos: variantOptionsOf(marco, 'Tipo'),
    idiomaTipos: idiomas ? variantOptionsOf(idiomas, 'Tipo') : [],
    togglesByVariacao,
  };
}

// Pares "Prop=Valor" do variantName de cada opção de Componente que NÃO são o
// próprio "Componente" nem o valor DEFAULT da property — precisam ir JUNTO no
// mesmo setProperties, senão a combinação não existe na lib. Caso real: opção
// "Imagem" só existe com Variante="Texto Alternativo" (a combinação Variante=
// Componente + Componente=Imagem não existe — mesmo defeito já corrigido na
// lib antiga em 2026-09-17).
function buildComponentExtraVariantProps(json, setSpec) {
  const set = findElementosSet(json, setSpec);
  if (!set) return {};
  const defaults = {};
  (set.properties || []).filter(p => p.type === 'VARIANT').forEach(p => { defaults[p.name] = p.defaultValue; });
  const out = {};
  for (const pv of (set.perVariantProperties || [])) {
    const pairs = String(pv.variantName || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
      const i = x.indexOf('=');
      return [x.slice(0, i).trim(), x.slice(i + 1).trim()];
    });
    const comp = pairs.find(([k]) => k === 'Componente');
    if (!comp) continue;
    const extra = {};
    pairs.forEach(([k, v]) => { if (k !== 'Componente' && v !== defaults[k]) extra[k] = v; });
    if (Object.keys(extra).length) out[comp[1]] = extra;
  }
  return out;
}

// ── Geração ──────────────────────────────────────────────────────────────
// Lib ANTIGA (design-acessivel-properties.json) não é mais lida (2026-10-08,
// usuário: "o plugin inteiro deve ter como base a lib nova") — o catálogo
// A11Y_COMPONENT_PROPERTIES_GENERATED, que vinha dela, deixou de existir.
const mobileJSON = readJSON(MOBILE_SRC, 'design-acessivel-mobile-properties.json');
const superAppJSON = readJSON(SUPER_APP_SRC, 'super-app.json');
const manifestJSON = readJSON(MANIFEST_SRC, '_manifest.json');

const mobileWrapper = buildMobileWrapper(mobileJSON);
const mobileLinkOptions = buildLinkOptions(mobileJSON, MOBILE_ELEMENTOS_SET, 'mobile');
const mobileComponentLinkNodeIds = buildComponentLinkNodeIds(superAppJSON, mobileLinkOptions);
const mobileOpts = { label: 'mobile' };
const mobileComponentsWithNomeAcessivel = buildComponentsWithNomeAcessivel(mobileJSON, MOBILE_ELEMENTOS_SET, mobileOpts);
const mobileScreenReaderVariants = buildScreenReaderVariants(mobileJSON, MOBILE_ELEMENTOS_SET, mobileOpts);
const mobileComponentToggles = buildComponentToggles(mobileJSON, MOBILE_ELEMENTOS_SET, mobileOpts);

// ── Perfil web ────────────────────────────────────────────────────────────
const superDscWebJSON = readJSON(SUPER_DSC_WEB_SRC, 'super-dsc-web.json');
const webOpts = { label: 'web', trimNames: true };
const webWrapper = buildWebWrapper(mobileJSON);
const webLinkOptions = buildLinkOptions(mobileJSON, WEB_ELEMENTOS_SET, 'web');
// Deep-link: só a Super DSC | Web publica containingFrameNodeId (a lib legada
// "Web Angular & React" não tem) — o nome casa pela mesma normalização usada
// no reconhecimento (exato sobre [a-z0-9]).
const webComponentLinkNodeIds = buildComponentLinkNodeIds(superDscWebJSON, webLinkOptions, normalizeRecognitionName);
const webComponentsWithNomeAcessivel = buildComponentsWithNomeAcessivel(mobileJSON, WEB_ELEMENTOS_SET, webOpts);
const webScreenReaderVariants = buildScreenReaderVariants(mobileJSON, WEB_ELEMENTOS_SET, webOpts);
const webComponentToggles = buildComponentToggles(mobileJSON, WEB_ELEMENTOS_SET, webOpts);
const webComponentExtraVariantProps = buildComponentExtraVariantProps(mobileJSON, WEB_ELEMENTOS_SET);
// Mesma derivação para o mobile (2026-10-07): a lib mobile também só tem
// "Texto Alternativo" com Componente="Imagem" — sem o par, o card mobile
// tentava Variante="Componente" + Imagem, combinação inexistente.
const mobileComponentExtraVariantProps = buildComponentExtraVariantProps(mobileJSON, MOBILE_ELEMENTOS_SET);
const webEstrutura = buildWebEstrutura(mobileJSON);
const webTituloNiveis = variantOptionsOf(findElementosSet(mobileJSON, WEB_BASE_SETS.titulos), 'Nível');
const webAliasesLoaded = loadWebAliases(webLinkOptions);
webAliasesLoaded.rejected.forEach(r => console.warn(`⚠  alias web "${r.scanned}" -> "${r.target}" aponta para uma opção que NÃO existe na base web — ignorado`));
const webAliases = webAliasesLoaded.accepted;
// BOOLEANs reais por categoria, lidos da instância de CONTEÚDO do wrapper
// (decorativo: Observações; titulo: nenhum; estrutura: por Variação, acima).
const webFixedToggles = {};
if (webWrapper) {
  for (const [t, inst] of Object.entries(webWrapper.contentInstanceByA11yType)) {
    webFixedToggles[t] = inst ? inst.properties.filter(p => p.type === 'BOOLEAN').map(p => p.name) : [];
  }
}

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

const superDscWebLibMeta = manifestJSON && Array.isArray(manifestJSON.libraries)
  ? manifestJSON.libraries.find(l => l.slug === 'super-dsc-web')
  : null;
const superDscWebFileKey = (superDscWebLibMeta && superDscWebLibMeta.fileKey) || '';
const superDscWebFileName = slugifyFileName((superDscWebLibMeta && superDscWebLibMeta.name) || 'Super DSC Web') || 'Super-DSC-Web';

const header = `// ============================================================
// GERADO AUTOMATICAMENTE por build-a11y-constants.cjs — não editar à mão.
// Fonte: refs/design-acessivel-mobile-properties.json (${mobileJSON ? mobileJSON._meta.generatedAt : 'ausente'})
//      + refs/super-app.json (${superAppJSON ? superAppJSON.meta.exportedAt : 'ausente'})
//      + refs/_manifest.json (fileKey da lib 'super-app')
// Regenerar via: node src/plugin/refs/build-a11y-constants.cjs
//            ou: npm run refs:a11y-constants
//
// Gerado em: ${new Date().toISOString()}
//
// Consumido via alias em src/plugin/modules/accessibility.js:
//   const A11Y_MOBILE_LINK_COMPONENT_OPTIONS = A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED;
//   const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED;
//   const A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL = A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL_GENERATED;
//   const A11Y_MOBILE_SCREEN_READER_VARIANTS = A11Y_MOBILE_SCREEN_READER_VARIANTS_GENERATED;
//   const A11Y_MOBILE_COMPONENT_TOGGLES = A11Y_MOBILE_COMPONENT_TOGGLES_GENERATED;
//   const A11Y_SUPER_APP_FILE_KEY = A11Y_SUPER_APP_FILE_KEY_GENERATED;
//   const A11Y_SUPER_APP_FILE_NAME = A11Y_SUPER_APP_FILE_NAME_GENERATED;
//   (perfil web, 2026-10-01) A11Y_WEB_* — mesmo desenho dos A11Y_MOBILE_*,
//   mais A11Y_WEB_ESTRUTURA/A11Y_WEB_FIXED_TOGGLES/A11Y_WEB_COMPONENT_ALIASES,
//   consumidos por A11Y_UI_PROFILES (accessibility.js). Os pares extras de
//   variante (ex.: Imagem) e os níveis H1-H6 só o BACKEND consome — vão em
//   design-acessivel-web-wrapper.generated.json, não aqui.
// Concatenado por build.cjs no bundle final (ui.html) ANTES de
// accessibility.js — não editar este arquivo à mão.
// ============================================================

`;

// Textos padrão dos campos editáveis de cada componente, por opção de Leitor
// de Tela (2026-10-07) — fonte: design-acessivel-default-texts.json
// (fetch-a11y-default-texts.cjs). Só os campos que o designer edita; vazio se
// o arquivo ainda não foi gerado (formulário segue sem prefill).
const DEFAULT_TEXT_FIELDS = ['Observações', 'Nome Acessível', 'Texto Alternativo'];
function loadDefaultTexts(platform) {
  const p = path.join(REFS_DIR, 'design-acessivel-default-texts.json');
  if (!fs.existsSync(p)) return {};
  const src = (JSON.parse(fs.readFileSync(p, 'utf8'))[platform]) || {};
  const out = {};
  for (const [comp, byLeitor] of Object.entries(src)) {
    for (const [leitor, fields] of Object.entries(byLeitor)) {
      const keep = {};
      for (const f of DEFAULT_TEXT_FIELDS) if (typeof fields[f] === 'string') keep[f] = fields[f];
      if (Object.keys(keep).length) ((out[comp] = out[comp] || {})[leitor] = keep);
    }
  }
  return out;
}
const mobileDefaultTexts = loadDefaultTexts('mobile');
// Textos fixos da Estrutura web por Tipo de Marco e do Idioma (2026-10-07).
function loadWebEstruturaTexts() {
  const p = path.join(REFS_DIR, 'design-acessivel-default-texts.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8')).webEstrutura || {};
}
const webEstruturaTexts = loadWebEstruturaTexts();
// Textos fixos + campos opcionais dos cards de Títulos e Decorativos, por
// plataforma (2026-10-08) — fonte: fixedTexts de design-acessivel-default-
// texts.json (fetch-a11y-default-texts.cjs, lê o card real da lib nova).
function loadFixedTexts() {
  const p = path.join(REFS_DIR, 'design-acessivel-default-texts.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8')).fixedTexts || {};
}
const fixedTexts = loadFixedTexts();
// BOOLEANs reais do card MOBILE por categoria — mesmo desenho de
// webFixedToggles, lido de wrapperVariants do "[hac mob] Box specs".
const mobileFixedToggles = {};
{
  const box = mobileJSON && (mobileJSON.components || []).find(c => c.shortName === 'Box specs leitor de tela' && /^\.?\[hac mob\]/i.test(c.fullName || ''));
  const OPT = { elemento: 'Elementos Interativos e Imagens', titulo: 'Títulos', decorativo: 'Elementos Decorativos' };
  for (const [t, opt] of Object.entries(OPT)) {
    const v = box && (box.wrapperVariants || []).find(w => w.name === `Conector=${opt}`);
    const content = v && (v.instances || []).find(i => i.name !== 'Conector');
    mobileFixedToggles[t] = content ? content.properties.filter(p => p.type === 'BOOLEAN').map(p => String(p.name).trim()) : [];
  }
}
const webDefaultTexts = loadDefaultTexts('web');

const body =
  `const A11Y_MOBILE_DEFAULT_TEXTS_GENERATED = ${JSON.stringify(mobileDefaultTexts, null, 2)};\n\n` +
  `const A11Y_WEB_DEFAULT_TEXTS_GENERATED = ${JSON.stringify(webDefaultTexts, null, 2)};\n\n` +
  `const A11Y_WEB_ESTRUTURA_TEXTS_GENERATED = ${JSON.stringify(webEstruturaTexts, null, 2)};\n\n` +
  `const A11Y_FIXED_TEXTS_GENERATED = ${JSON.stringify(fixedTexts, null, 2)};\n\n` +
  `const A11Y_MOBILE_FIXED_TOGGLES_GENERATED = ${JSON.stringify(mobileFixedToggles, null, 2)};\n\n` +
  `const A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED = ${JSON.stringify(mobileLinkOptions, null, 2)};\n\n` +
  `const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED = ${JSON.stringify(mobileComponentLinkNodeIds, null, 2)};\n\n` +
  `const A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL_GENERATED = ${JSON.stringify(mobileComponentsWithNomeAcessivel, null, 2)};\n\n` +
  `const A11Y_MOBILE_SCREEN_READER_VARIANTS_GENERATED = ${JSON.stringify(mobileScreenReaderVariants, null, 2)};\n\n` +
  `const A11Y_MOBILE_COMPONENT_TOGGLES_GENERATED = ${JSON.stringify(mobileComponentToggles, null, 2)};\n\n` +
  `const A11Y_SUPER_APP_FILE_KEY_GENERATED = ${JSON.stringify(superAppFileKey)};\n` +
  `const A11Y_SUPER_APP_FILE_NAME_GENERATED = ${JSON.stringify(superAppFileName)};\n\n` +
  `// ── Perfil WEB (2026-10-01) — fonte: set ".[hac web base]  Elementos e imagens" + sets base de Estrutura/Títulos\n` +
  `const A11Y_WEB_LINK_COMPONENT_OPTIONS_GENERATED = ${JSON.stringify(webLinkOptions, null, 2)};\n\n` +
  `const A11Y_WEB_COMPONENT_LINK_NODE_IDS_GENERATED = ${JSON.stringify(webComponentLinkNodeIds, null, 2)};\n\n` +
  `const A11Y_WEB_COMPONENTS_WITH_NOME_ACESSIVEL_GENERATED = ${JSON.stringify(webComponentsWithNomeAcessivel, null, 2)};\n\n` +
  `const A11Y_WEB_SCREEN_READER_VARIANTS_GENERATED = ${JSON.stringify(webScreenReaderVariants, null, 2)};\n\n` +
  `const A11Y_WEB_COMPONENT_TOGGLES_GENERATED = ${JSON.stringify(webComponentToggles, null, 2)};\n\n` +
  `const A11Y_WEB_COMPONENT_ALIASES_GENERATED = ${JSON.stringify(webAliases, null, 2)};\n\n` +
  `const A11Y_WEB_ESTRUTURA_GENERATED = ${JSON.stringify(webEstrutura, null, 2)};\n\n` +
  `const A11Y_WEB_FIXED_TOGGLES_GENERATED = ${JSON.stringify(webFixedToggles, null, 2)};\n\n` +
  `const A11Y_WEB_FILE_KEY_GENERATED = ${JSON.stringify(superDscWebFileKey)};\n` +
  `const A11Y_WEB_FILE_NAME_GENERATED = ${JSON.stringify(superDscWebFileName)};\n`;

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
    description: 'GERADO AUTOMATICAMENTE por build-a11y-constants.cjs — não editar à mão. Component set "[hac mob] Box specs leitor de tela" (fileKey HhriLSpKnCB2dHhyiU16iB, lib nova migrada em 2026-09-15) — componentKeyByA11yType traz a key IMPORTÁVEL de cada VARIANTE filha (elemento/titulo/decorativo), extraídas via REST API em 2026-09-15 (a key do component set em si NÃO é importável via figma.importComponentByKeyAsync). Cobre só 3 das 5 categorias — sem equivalente mobile publicado para estrutura/informacoes.',
    source: 'refs/design-acessivel-mobile-properties.json + extração pontual REST API 2026-09-15 (ver MOBILE_WRAPPER_VARIANT_KEYS_BY_A11Y_TYPE em build-a11y-constants.cjs)',
    generatedAt: new Date().toISOString(),
  },
  wrapper: mobileWrapper,
  // Aditivo (2026-10-01): opções reais de "Componente" do perfil mobile, para
  // o perfil de plataforma (backend/platform-profiles.js) declarar as duas
  // plataformas de forma simétrica. O preenchimento mobile NÃO as consulta
  // (comportamento mobile intocado).
  componentOptions: mobileLinkOptions,
  // Pares obrigatórios por componente (ex.: Imagem → Variante "Texto
  // Alternativo"), derivados da lib — 2026-10-07.
  componentExtraVariantProps: mobileComponentExtraVariantProps,
}, null, 2), 'utf8');

// design-acessivel-web-wrapper.generated.json — equivalente web. NULO (campo
// "wrapper") quando o scan ainda não trouxe variantKeys/wrapperVariants.
fs.writeFileSync(WEB_WRAPPER_OUT, JSON.stringify({
  _meta: {
    description: 'GERADO AUTOMATICAMENTE por build-a11y-constants.cjs — não editar à mão. Component set "[hac web] Box specs leitor de tela" (fileKey HhriLSpKnCB2dHhyiU16iB). componentKeyByA11yType traz a key IMPORTÁVEL de cada VARIANTE filha (elemento/titulo/decorativo/estrutura), lida de variantKeys/wrapperVariants do scan — nenhuma key escrita à mão. A web não tem "Informações Adicionais".',
    source: 'refs/design-acessivel-mobile-properties.json (variantKeys/wrapperVariants, gravados por fetch-component-properties.cjs) + refs/web-component-aliases.json',
    generatedAt: new Date().toISOString(),
  },
  wrapper: webWrapper,
  componentOptions: webLinkOptions,
  componentExtraVariantProps: webComponentExtraVariantProps,
  componentAliases: webAliases,
  estrutura: webEstrutura,
  tituloNiveis: webTituloNiveis,
}, null, 2), 'utf8');

console.log(`✅ _a11y-constants.generated.js`);
console.log(`   A11Y_FIXED_TEXTS_GENERATED: ${Object.entries(fixedTexts).map(([p, t]) => p + '(' + Object.keys(t).join('/') + ')').join(' ') || 'vazio'}`);
console.log(`   A11Y_MOBILE_FIXED_TOGGLES_GENERATED: ${JSON.stringify(mobileFixedToggles)}`);
console.log(`   A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED: ${mobileLinkOptions.length} opções`);
console.log(`   A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED: ${Object.keys(mobileComponentLinkNodeIds).length} nomes com nodeId real (de ${mobileLinkOptions.length} opções)`);
console.log(`   A11Y_MOBILE_COMPONENTS_WITH_NOME_ACESSIVEL_GENERATED: ${mobileComponentsWithNomeAcessivel.length} componentes com property real`);
console.log(`   A11Y_MOBILE_SCREEN_READER_VARIANTS_GENERATED: ${Object.keys(mobileScreenReaderVariants).length} componentes com sub-variantes de Leitor de Tela`);
console.log(`   A11Y_MOBILE_COMPONENT_TOGGLES_GENERATED: ${Object.keys(mobileComponentToggles).length} componentes mapeados`);
console.log(`   [web] LINK_COMPONENT_OPTIONS: ${webLinkOptions.length} opções | LINK_NODE_IDS: ${Object.keys(webComponentLinkNodeIds).length} | COM_NOME_ACESSIVEL: ${webComponentsWithNomeAcessivel.length} | SCREEN_READER_VARIANTS: ${Object.keys(webScreenReaderVariants).length} | TOGGLES: ${Object.keys(webComponentToggles).length} | EXTRA_VARIANT_PROPS: ${Object.keys(webComponentExtraVariantProps).length} | ALIASES: ${Object.keys(webAliases).length}`);
console.log(`✅ design-acessivel-web-wrapper.generated.json`);
console.log(`   wrapper web: ${webWrapper ? 'resolvido (' + Object.keys(webWrapper.componentKeyByA11yType).length + ' keys de variante)' : 'NULO — ver warnings acima'}`);
console.log(`✅ design-acessivel-mobile-wrapper.generated.json`);
console.log(`   wrapper: ${mobileWrapper ? 'resolvido (' + Object.keys(mobileWrapper.componentKeyByA11yType).length + ' keys de variante)' : 'NULO — ver warnings acima'}`);
