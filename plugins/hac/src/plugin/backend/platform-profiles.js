// ============================================================
// backend/platform-profiles.js — hac (backend, sandbox principal do Figma)
//
// PERFIS POR PLATAFORMA (2026-10-01, Fase 4 do plano "web segue o arquivo
// próprio"). Até aqui, "web vs mobile" era decidido por `if (origin ===
// 'mobile')` espalhado em code.js/dsc-matching.js, cada ponto com o seu
// próprio dicionário. Este módulo concentra, em UM lugar, tudo que difere por
// plataforma — quem precisa saber "o que a web tem?" ou "o que o mobile tem?"
// pergunta ao perfil, nunca compara a string de origem.
//
// Cada perfil declara:
//   - boxSpecs     o set "[hac web|mob] Box specs leitor de tela" do arquivo
//                  próprio (fileKey HhriLSpKnCB2dHhyiU16iB) e as keys IMPORTÁVEIS
//                  de cada variante por categoria (GERADAS por
//                  refs/build-a11y-constants.cjs a partir do scan — nenhuma key
//                  de wrapper escrita à mão). `fallbackProfile` diz de qual
//                  outro perfil emprestar o wrapper de uma categoria que este
//                  perfil não publica (hoje: mobile -> web em "estrutura";
//                  mesma decisão de produto que já valia para os marcadores —
//                  nunca bloqueia a criação da spec). `fillStrategy` diz qual
//                  rotina preenche o card importado.
//   - categories   categorias que a plataforma TEM (mobile 3, web 4 — a web
//                  deixou de ter "Informações Adicionais" em 2026-10-01).
//   - recognitionLibs  libs DSC de COMPONENTES REAIS que o scan reconhece,
//                  com o mapeamento componente -> categoria de a11y de cada uma.
//   - recognition  estratégia de casar o nome do componente escaneado com uma
//                  opção da base "Componente": web = EXATO normalizado + aliases
//                  aprovados por humano (o plugin não adivinha); mobile = null
//                  (o mobile mantém a sugestão aproximada do formulário).
//   - componentOptions / componentExtraVariantProps  opções REAIS da property
//                  "Componente" e pares de variante que precisam ir juntos.
//   - markers      keys dos marcadores Agrupamento (modo Contorno) e Conector
//                  (modo Linha) por categoria × direção. A lib nova não separa
//                  web/mobile nesses dois sets — os dois perfis apontam para o
//                  MESMO dicionário, mas cada um o declara (se divergirem um
//                  dia, a mudança é aqui).
//   - selos        keys dos selos de ÁREA (Identificação da tela) e de ITEM
//                  (Ordenação), já unificados web+mobile (v0.1.0-beta.68).
//
// Regra para quem editar: o comportamento MOBILE é o gabarito. Qualquer
// mudança neste arquivo que altere o que o mobile resolve precisa de
// confirmação explícita do dono do produto.
// ============================================================

import MOBILE_WRAPPER_RAW from '../refs/design-acessivel-mobile-wrapper.generated.json';
import WEB_WRAPPER_RAW from '../refs/design-acessivel-web-wrapper.generated.json';
import DSC_A11Y_MAPPING_MOBILE from '../refs/dsc-component-a11y-mapping-mobile.json';
import DSC_A11Y_MAPPING_SUPERDSCWEB from '../refs/dsc-component-a11y-mapping-superdscweb.json';
import DSC_A11Y_MAPPING_ANDROID from '../refs/dsc-component-a11y-mapping-android.json';

// ── Marcadores (arquivo próprio "[HAC] Handoff Super DSC Mobile e Web") ─────
// Keys do component set "[hac] Agrupamento" — o selo/marcador PEQUENO (badge +
// moldura) do modo "Contorno": categoria × orientação (já embute a direção do
// conector). Todas re-obtidas via GET /v1/files/HhriLSpKnCB2dHhyiU16iB/
// components (a lib nova não separa web/mobile neste set). Histórico das
// correções de key (2026-09-17/18: migração da lib antiga, "títulos" renomeado,
// "Estrutura da Página" publicada) está no git log de code.js. "Informações
// Adicionais" NÃO existe mais em nenhuma plataforma (2026-10-01) — as últimas
// 9 keys da lib antiga (Wy0IhXRVZMSOOr8E609UqI) saíram junto.
export const A11Y_AGRUPAMENTO_KEYS = {
  elemento: {
    direita:  'ea54a0cca62bc6d8abee539efe989a18b1e322a7',
    esquerda: '2165d66fcd65d977bc2cdcd86c26d68a07e65eaf',
    superior: '83a72d71793cde67cb11c38df56e8f9bd1cb2acf',
    inferior: '97c0d6479a58b03397515b664e3d3de64b594706',
  },
  decorativo: {
    direita:  '1f552b66bc48721b9be3160b02ac6a4762af0086',
    esquerda: '143e04b04c302c1be1b0fe081bb3bf43d0a5a004',
    superior: '73f5b3d53cd673a4846b60e251e0108805644951',
    inferior: 'edb2b2b5aaabb8649461ceee62307c0d27134982',
  },
  // "Estrutura da Página" NOVA (node_ids 10766:210/218/226/234) — não
  // confundir com "titulo": os node_ids que na lib antiga se chamavam
  // "estrutura da página" foram RENOMEADOS para "títulos" na lib nova.
  estrutura: {
    direita:  '7b57c21d29e28b96a4b9d040cd77602a583783ac',
    esquerda: 'b16123a85a77b6f39b134d689e9ba18f966cc949',
    superior: '2bf9e00f39fb195a017a6697177a325121576073',
    inferior: '7c9dca5e5312553824b84dfbb602097468be0bc4',
  },
  titulo: {
    direita:  'ed17abfec856f9ca286f6bb4b828319af73f9851',
    esquerda: 'e30f1468b18340bcce7e6937c9f655c2ebffc372',
    superior: '517ba6be813cc42c1d296a5e3c7161137aad4488',
    inferior: '2a317e3e61483a5fc0de41424ce82273f4c53a25',
  },
};

// Keys do component set "[hac] Conectores" (modo "Linha"): categoria × direção,
// incluindo "desativado" (sem traço — usado por badges de passo da Ficha).
// "Estrutura da Página": node_ids 10768:280/283/287/291/295.
export const A11Y_CONECTOR_LINHA_KEYS = {
  elemento: {
    esquerda: '711ff70084002beb5484985790d313785826b041',
    direita:  '48c0a893abb2859bf28fe660db2ef5a8ed998389',
    superior: 'd103d6403ab8f289c44499cf931de5d08e1c80a2',
    inferior: '406b93c17f12ce592b2854a126b67e23c87a97e4',
    desativado: '5506fa7159f82aa6984493ed9e8ef60372c3dd72',
  },
  estrutura: {
    esquerda: '26fa2e6f7f6a16f35054f29cd12de90bbf190ba0',
    direita:  '9b9aa1cfd2bb4327be1d72bfb125b326b90bc62e',
    superior: '9ab20cfc07ba0de6fe15754d53804d491ab728bf',
    inferior: '575e5b4fe3d2be90721a46cad9e30473503684fa',
    desativado: 'afedf7e06bde8d754bae4309a121b5760723bb96',
  },
  titulo: {
    esquerda: '3bda769bd18a3bcb0dedb3691deaa9548644a3dd',
    direita:  '19fa60fe8f30a98e26eff0d2d1c75e973a87dfca',
    superior: 'bbea0b89885808fb9af379a23573b2f9360f6b88',
    inferior: 'ef9578ce7fd51d26cdccc22fbc862bdd716050ce',
    desativado: '938d4f64c6272528b49c22da2cb03cf54c1ddeff',
  },
  decorativo: {
    esquerda: '3bae568e0f46c702d1a34c9d1d7545352f0af488',
    direita:  '7f737bd2821b3360c3a77a256c68a1aa2b43baa0',
    superior: '79fae2a5d1438938ff3072d3e677196f78c471f8',
    inferior: 'b054d91b10030c6aded2df65a801a425e1c1843f',
    desativado: '7e1c5465b4c1ff00dfb05baaa6bd7aaa2a508829',
  },
};

// ── Selos (web e mobile, unificados) ────────────────────────────────────────
// "[hac] Identificação da tela" — selo de ÁREA/tela com conector (create-a11y-
// area, update-a11y-area-conector e o selo "Número da tela" da Ficha). Desenha
// um Connector (traço) por direção, exceto "desativado". Substituiu as 4 cópias
// de "[a11y] Item Number" da lib antiga (v0.1.0-beta.68).
export const A11Y_IDENTIFICACAO_TELA_KEYS = {
  superior:   '30bc07a9462265a9c69b28f2389c25578fec3a75',
  inferior:   'bcaca4f76c4fc4f045706fee17d00432f0e1ed5b',
  esquerda:   'ad35c5a35f919c325fac63197f72d80988a99599',
  direita:    'c1827f24908f990a0983b0519c2800c302d9f113',
  desativado: '64dd33125f08835d3561647ebf1a21bd0221b3f1',
};

// rawKeys das properties de "[hac] Identificação da tela" (confirmadas em
// refs/design-acessivel-mobile-properties.json, node 13:479).
export const A11Y_IDENTIFICACAO_TELA_PROPS = {
  number: 'número#1478:0',
  showLabel: 'mostrar label#733:0',
  label: 'label#733:6',
};

// "[hac] Ordenação" (variante tamanho=pequeno, node 5222:4269) — selo de ITEM
// da Ordem de Tabulação. Só tem properties "tamanho" e "número" (rawKey
// "número#5265:3"); a posição é resolvida por x/y absoluto no chamador.
export const A11Y_ORDENACAO_ITEM_KEY = '860c9f70d42c05f23e00c8414df16911d3292cab';

// Componentes PUBLICADOS de instrução da Ficha (2026-10-05) — página
// "🖥️ | Template de Handoff Web" do arquivo próprio.
// Chave = sectionKey de _FICHA_BLOCK_CONFIG (code.js).
export const A11Y_WEB_INSTRUCTION_KEYS = {
  leitor:    '798a147836938ed8174a8027c9bcd7c022bc4921', // [hac web] Instruções para Especificações (10574:18222)
  tabulacao: 'b5059f2dfb5e4639686e3eb56a78e6914d8ddc4f', // [hac web]  Instruções para Ordem de Tabulação (10574:18221)
};

// Mobile (2026-10-06, pedido do usuário: "igual à web") — página
// "📱 | Template de Handoff Mobile". Inclui o Swipe, que só existe no mobile.
export const A11Y_MOBILE_INSTRUCTION_KEYS = {
  leitor:    '70db108bb7f430ccba44d545e93e471d8cdb1d20', // [hac mob] Instruções para Especificações (10533:3117)
  tabulacao: 'c4d3787688fd6f4bf09d54bac5637867478bf614', // [hac mob] Instruções para Ordem de Tabulação (10533:3078)
  swipe:     'd00095a4988bdd68e25d414856b1293ffeaeea38', // [hac mob] Instruções para Ordem de Swipe (10533:3085)
};

const SELOS = {
  identificacaoTelaKeys: A11Y_IDENTIFICACAO_TELA_KEYS,
  identificacaoTelaProps: A11Y_IDENTIFICACAO_TELA_PROPS,
  ordenacaoItemKey: A11Y_ORDENACAO_ITEM_KEY,
};

// ── Reconhecimento web: casamento EXATO normalizado ─────────────────────────
// Cópia IDÊNTICA de normalizeRecognitionName em refs/web-recognition.cjs e em
// modules/accessibility.js (frontend) — não existe um único arquivo que sirva
// aos 3 sistemas de módulo; mudou aqui, muda nos outros dois.
export function normalizeRecognitionName(name) {
  return String(name || '')
    .replace(/^\[dsc[^\]]*\]\s*/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const WEB_COMPONENT_OPTIONS = (WEB_WRAPPER_RAW && WEB_WRAPPER_RAW.componentOptions) || [];
const WEB_COMPONENT_ALIASES = (WEB_WRAPPER_RAW && WEB_WRAPPER_RAW.componentAliases) || {};

/**
 * @typedef {Object} PlatformProfile
 * @property {'web'|'mobile'} origin
 * @property {string} label
 * @property {{ setName: string, wrapper: (null | { componentKeyByA11yType: Record<string, string> }), fallbackProfile: ('web'|null), fillStrategy: ('web-base'|'mobile-original') }} boxSpecs
 * @property {string[]} categories
 * @property {Array<{ slug: string, sourceLib: { id: string, label: string }, mapping: any }>} recognitionLibs
 * @property {null | { strategy: 'exact+alias', options: string[], aliases: Record<string, string> }} recognition
 * @property {string[]} componentOptions
 * @property {Record<string, Record<string, string>>} componentExtraVariantProps
 * @property {null | { estrutura: { variacoes: string[], marcoTipos: string[], idiomaTipos: string[], togglesByVariacao: Record<string, string[]> }, tituloNiveis: string[] }} blockOptions
 * @property {{ agrupamentoKeys: Record<string, Record<string, string>>, conectorLinhaKeys: Record<string, Record<string, string>> }} markers
 * @property {typeof SELOS} selos
 * @property {Record<string, string>} instructionComponentKeys  sectionKey -> key do componente de instrução publicado (vazio = coluna montada)
 */

/** @type {Record<'web'|'mobile', PlatformProfile>} */
export const PLATFORM_PROFILES = {
  web: {
    origin: 'web',
    label: 'Web',
    boxSpecs: {
      setName: '[hac web] Box specs leitor de tela',
      wrapper: (WEB_WRAPPER_RAW && WEB_WRAPPER_RAW.wrapper) || null,
      fallbackProfile: null,
      // Como o card é PREENCHIDO depois de importado: 'web-base' = ordem
      // Componente -> sub-modo -> toggles -> textos, com conferência de cada
      // setProperties (_tryImportA11yWebWrapperComponent, code.js).
      fillStrategy: 'web-base',
    },
    categories: ['elemento', 'estrutura', 'titulo', 'decorativo'],
    recognitionLibs: [
      { slug: 'super-dsc-web', sourceLib: { id: 'super-dsc-web', label: 'Super DSC | Web' }, mapping: DSC_A11Y_MAPPING_SUPERDSCWEB },
    ],
    recognition: { strategy: 'exact+alias', options: WEB_COMPONENT_OPTIONS, aliases: WEB_COMPONENT_ALIASES },
    componentOptions: WEB_COMPONENT_OPTIONS,
    componentExtraVariantProps: (WEB_WRAPPER_RAW && WEB_WRAPPER_RAW.componentExtraVariantProps) || {},
    // Opções REAIS dos blocos web além de "Componente": níveis H1-H6 de
    // "Títulos" e Variação/Tipo de "Estrutura da Página" (lidas dos sets base).
    blockOptions: {
      estrutura: (WEB_WRAPPER_RAW && WEB_WRAPPER_RAW.estrutura) || { variacoes: [], marcoTipos: [], idiomaTipos: [], togglesByVariacao: {} },
      tituloNiveis: (WEB_WRAPPER_RAW && WEB_WRAPPER_RAW.tituloNiveis) || [],
    },
    markers: { agrupamentoKeys: A11Y_AGRUPAMENTO_KEYS, conectorLinhaKeys: A11Y_CONECTOR_LINHA_KEYS },
    selos: SELOS,
    instructionComponentKeys: A11Y_WEB_INSTRUCTION_KEYS,
  },
  mobile: {
    origin: 'mobile',
    label: 'Mobile',
    boxSpecs: {
      setName: '[hac mob] Box specs leitor de tela',
      wrapper: (MOBILE_WRAPPER_RAW && MOBILE_WRAPPER_RAW.wrapper) || null,
      // O mobile publica 3 categorias (elemento/titulo/decorativo). "estrutura"
      // — alcançável pela Detecção Automática (Top App Bar, Navigation Bar,
      // Screen Footer mapeiam para ela) — empresta o wrapper do perfil web.
      fallbackProfile: 'web',
      // Preenchimento ORIGINAL do mobile, preservado sem alteração
      // (_tryImportA11yMobileWrapperComponent, code.js).
      fillStrategy: 'mobile-original',
    },
    categories: ['elemento', 'titulo', 'decorativo'],
    recognitionLibs: [
      { slug: 'super-app', sourceLib: { id: 'super-app', label: 'DSC | Super App' }, mapping: DSC_A11Y_MAPPING_MOBILE },
      { slug: 'dsc-android', sourceLib: { id: 'dsc-android', label: 'DSC | Android' }, mapping: DSC_A11Y_MAPPING_ANDROID },
    ],
    // Mobile NÃO usa casamento exato+alias no backend: o preenchimento do card
    // mobile segue o mecanismo original (nome detectado/escolhido direto).
    recognition: null,
    componentOptions: (MOBILE_WRAPPER_RAW && MOBILE_WRAPPER_RAW.componentOptions) || [],
    componentExtraVariantProps: (MOBILE_WRAPPER_RAW && MOBILE_WRAPPER_RAW.componentExtraVariantProps) || {},
    // Mobile não tem blocos de Estrutura/Níveis próprios (título é "H" fixo).
    blockOptions: null,
    markers: { agrupamentoKeys: A11Y_AGRUPAMENTO_KEYS, conectorLinhaKeys: A11Y_CONECTOR_LINHA_KEYS },
    selos: SELOS,
    instructionComponentKeys: A11Y_MOBILE_INSTRUCTION_KEYS,
  },
};

/**
 * Perfil de uma origem. Origem ausente/desconhecida cai em 'web' — mesmo
 * default que o código tinha antes (`a11yOrigin === 'mobile' ? mobile : web`).
 * @param {string | null | undefined} origin
 * @returns {PlatformProfile}
 */
export function getPlatformProfile(origin) {
  return origin === 'mobile' ? PLATFORM_PROFILES.mobile : PLATFORM_PROFILES.web;
}

/**
 * Key IMPORTÁVEL da variante do Box specs para a categoria, no perfil dado —
 * ou no perfil emprestado (`fallbackProfile`) quando este não publica a
 * categoria. Devolve também QUAL perfil serviu (o preenchimento usa o perfil
 * que forneceu o wrapper, não o da spec).
 * @param {PlatformProfile} profile
 * @param {string} a11yType
 * @returns {{ key: string, servedBy: PlatformProfile } | null}
 */
export function resolveBoxSpecsVariant(profile, a11yType) {
  const own = profile.boxSpecs.wrapper && profile.boxSpecs.wrapper.componentKeyByA11yType[a11yType];
  if (own) return { key: own, servedBy: profile };
  if (profile.boxSpecs.fallbackProfile) {
    const lender = PLATFORM_PROFILES[profile.boxSpecs.fallbackProfile];
    const borrowed = lender.boxSpecs.wrapper && lender.boxSpecs.wrapper.componentKeyByA11yType[a11yType];
    if (borrowed) return { key: borrowed, servedBy: lender };
  }
  return null;
}

/**
 * Reconhece UM nome (de componente DSC ou escolhido no formulário) como uma
 * opção da base "Componente" do perfil. Só perfis com `recognition` (web).
 * Exato normalizado primeiro; depois alias aprovado. NUNCA aproximado.
 * @param {PlatformProfile} profile
 * @param {string | null | undefined} name
 * @returns {{ option: string, via: 'exact' | 'alias' } | null}
 */
export function resolveComponentOption(profile, name) {
  if (!profile.recognition) return null;
  const n = normalizeRecognitionName(name);
  if (!n) return null;
  const exact = profile.recognition.options.find(o => normalizeRecognitionName(o) === n);
  if (exact) return { option: exact, via: 'exact' };
  const alias = profile.recognition.aliases[n];
  if (alias) return { option: alias, via: 'alias' };
  return null;
}
