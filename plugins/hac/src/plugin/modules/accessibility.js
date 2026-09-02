// ============================================================
// accessibility.js — hac
//
// PORTADO do Handex Beta (src/plugin/modules/accessibility.js) — 2026-08-24.
// Cinco categorias de spec estruturada, criadas exatamente como uma spec
// normal (elemento selecionado no canvas → formulário → create-unified-spec).
// Cada categoria tem selo, cor e regra de numeração próprios — estrutura e
// cores confirmadas inspecionando o arquivo real da lib Figma "Design
// Acessível" (fileKey Wy0IhXRVZMSOOr8E609UqI):
//
//   - elemento     Elementos interativos e imagens. Select com o catálogo real
//                  de 16 componentes do DSC (+ "Outro" livre). Tag MANUAL no
//                  formato A, A1, A1.1... — mesmo input/validação das specs
//                  normais, o designer controla a ordem/agrupamento.
//                  Cor: #FCBE05.
//   - estrutura    Estrutura da página (idiomas / marco de navegação / título
//                  da página / customizável). Tag MANUAL também.
//                  Cor: #EF765E.
//   - titulo       Nível de título — H1-H6 (web) ou "H" fixo (mobile, React
//                  Native não tem semântica de nível). Selo FIXO conforme o
//                  nível escolhido, não usa o input de tag.
//                  Cor: #AFCA0B.
//   - decorativo   Elemento Decorativo (Gerais / Imagem). Selo FIXO "Ø" —
//                  fora da ordem de leitura.
//                  Cor: #D93636.
//   - informacoes  Informações adicionais (Handoffs / Conteúdo extra /
//                  Customizável). Tag MANUAL também.
//                  Cor: #F39200.
//
// ADAPTAÇÃO DE SCHEMA (Handex → hac): o Handex tem DOIS lugares de origem
// pra specs/áreas/itens de tab order — avulsos (handoffData.a11ySpecs, sem
// activeFrameId) e por-frame (frame.a11ySpecs) — e um bug histórico documentado
// (specs "sumindo" por resync sem merge/dedup dos dois lados). O hac NÃO
// TEM conceito de frame: existe só o array único a11ySpecs/a11yAreas/
// tabOrderItems (core.js) — toda a ramificação condicional "se tem frame
// ativo, senão..." foi removida, sempre operando no array único. Não há
// syncAndRenderSpecs/saveSpecsToStorage separados — tudo passa por
// saveToStorage() (core.js).
//
// Depende de: hacData, a11ySpecs, a11yAreas, tabOrderItems,
// renderA11yGroupedList, saveToStorage, showToast, focusNode, openModal/
// closeModal, escapeHtml (todos em core.js/messages.js).
// ============================================================

// Cores reais extraídas dos fills dos componentes publicados na lib "Design
// Acessível". O selo (Tag/Chip) de cada categoria usa a cor "color" no
// stroke/texto e "fill" como tinta de fundo.
const A11Y_CATEGORIES = {
  elemento:    { label: 'Elementos e Imagens',     icon: 'image',   color: '#FCBE05', fill: '#FFF6DC', badge: null },
  estrutura:   { label: 'Estrutura da Página',     icon: 'star',    color: '#EF765E', fill: '#FDEAE6', badge: null },
  titulo:      { label: 'Nível de Título',         icon: 'heading', color: '#AFCA0B', fill: '#F5F9DA', badge: 'H' },
  decorativo:  { label: 'Elemento Decorativo',     icon: 'ban',     color: '#D93636', fill: '#FBE4E4', badge: 'Ø' },
  informacoes: { label: 'Informações Adicionais',  icon: 'info',    color: '#F39200', fill: '#FEF1DE', badge: null },
};

// Conteúdo real da lib (Descrição / Observações / Notas de Código). Mantido
// como literal JS (não JSON importado) porque o bundle do frontend é um
// único <script> concatenado sem require/import.
const A11Y_CONTENT = {
  elemento: {
    componentes: {
      accordion:     { descricao: 'Identificar como button e ler o seu rótulo visível em tela.', notasCodigo: 'O título de cada cabeçalho do accordion deve ser atrelado em um elemento com a role="button", considerar também o status do painel como expandindo ou recolhido com o atributo aria-expanded.' },
      breadcrumb:    { descricao: 'Agrupar e identificar como link, deve ler o seu rótulo visível em tela.' },
      button:        { descricao: 'Identificar como button e ler o seu rótulo visível em tela.' },
      checkbox:      { descricao: 'Identificar como checkbox.', notasCodigo: 'Em HTML, identificar o status do componente como desmarcado com o atributo aria-checked="false". Deve-se também inserir aria-label para adicionar um nome acessível ao elemento.' },
      dialog:        { descricao: 'Identificar como dialog e anunciar o título seguido do conteúdo assim que o componente for apresentado em tela.', notasCodigo: 'Em HTML é necessário atrelar os seguintes atributos ao componente: aria-labelledby, aria-describedby e aria-modal.' },
      inputs:        { descricao: 'Agrupar e identificar como textbox.' },
      link:          { descricao: 'Identificar como link e ler o seu rótulo visível em tela.' },
      listas:        { descricao: 'Construir como lista ordenada.', notasCodigo: 'Em HTML utilize a tag <ol>.' },
      paginator:     { descricao: 'Identificar como combobox e ler a quantidade de itens por página, seleção atual e o status do componente como recolhido ou expandido.', notasCodigo: 'Em HTML, identificar o status do componente como "expandido" ou "recolhido" com aria-expanded. Utilizar aria-labelledby para indicar o elemento que rotula a caixa de combinação e aria-controls para definir que o componente funciona como um pop-up.' },
      'radio button':{ descricao: 'Identificar como radio button.', notasCodigo: 'Identificar o status do componente como marcado ou desmarcado com o atributo aria-checked="true" ou "false". Deve-se também, inserir aria-label para adicionar um nome acessível ao elemento.' },
      snackbar:      { descricao: 'Identificar como alert, deve interromper outros processos e anunciar o conteúdo da notificação sem mover o foco para ele.', notasCodigo: 'Em HTML, o atributo aria-live="assertive" está implícito na função de alerta.' },
      stepper:       { descricao: 'Agrupar e identificar como tab. Deve-se ler o seu rótulo visível junto de sua localização no grupo. A exemplo: "1 de 3". Também considerar o status do elemento como "selecionado".', notasCodigo: 'Em HTML, deve ser fornecido a role="tablist" por padrão, role="tab" quando selecionado e role="tabpanel" quando expandindo. O atributo aria-selected é definido automaticamente com base na alteração da seleção.' },
      switch:        { descricao: 'Identificar como switch.', notasCodigo: 'Identificar o status do componente como marcado ou desmarcado com o atributo aria-checked="true" ou "false". Deve-se também, inserir aria-label para adicionar um nome acessível ao elemento.' },
      table:         { descricao: 'Identificar como table e ler a sua estrutura com a quantidade de linhas e colunas.', notasCodigo: 'Inserir o atributo aria-label em HTML para adicionar um nome acessível e aria-describedby="IDREF" referindo-se a legenda para a tabela.' },
      'tab group':   { descricao: 'Agrupar e identificar como tab. Deve-se ler o seu rótulo visível junto de sua localização no grupo. A exemplo: "1 de 3". Também considerar o status do componente quando estiver "selecionado".', notasCodigo: 'Em HTML, deve ser fornecido a role="tablist" por padrão, role="tab" quando selecionado e role="tabpanel" quando expandindo. O atributo aria-selected é definido automaticamente com base na alteração da seleção.' },
      imagem:        { descricao: 'Inserir o seguinte texto alternativo no elemento: [insira aqui o texto alternativo].', notasCodigo: 'Insira seu texto com as anotações necessárias para o pessoal de desenvolvimento.' },
    },
    // Conteúdo exclusivo da sub-variante mobile "link" (ver
    // A11Y_ELEMENTO_MOBILE_VARIANTS) — Descrição fixa e travada (não
    // editável), texto igual ao já usado no catálogo desktop pro componente
    // "link" (A11Y_CONTENT.elemento.componentes.link), mas com a menção
    // explícita de abertura de nova janela/foco que a doc da vertical exige
    // aqui. Chave própria em vez de reutilizar 'link' pra não colidir com o
    // catálogo de 16 componentes indexado por nome.
    mobileLink: {
      descricao: 'Identificar como link e anunciar que o link abre uma nova janela e direciona o foco para ela.',
    },
  },
  estrutura: {
    idiomas: {
      'da pagina':  { descricao: 'Indicar o idioma predominante da página como: [insira aqui o idioma].', notasCodigo: 'Em HTML Insira o atributo lang e defina o idioma principal da página, por exemplo: Para português do Brasil: <html lang="pt-br">. Para inglês: <html lang="en">. Para espanhol: <html lang="es">.' },
      'das partes': { descricao: 'Indicar a(s) palavras(s) em um idioma.', notasCodigo: 'Em HTML, use o atributo lang para declarar o conteúdo circundante como links ou outras partes do texto.' },
    },
    marco: {
      header: { descricao: 'Indicar como cabeçalho.', notasCodigo: 'Em HTML use a tag <header> para um cabeçalho de uma seção ou página.' },
      nav:    { descricao: 'Indicar como navegação.', notasCodigo: 'Em HTML use a tag <nav> para agrupar os link.' },
      main:   { descricao: 'Indicar o conteúdo como principal da página.', notasCodigo: 'Em HTML <main> não deve ser usado dentro de elementos como <article>, <aside>, <footer>, <header> ou <nav>.' },
      aside:  { descricao: 'Indicar como seção.', notasCodigo: 'Em HTML <aside> possui um significado semântico, indicando que o conteúdo é "à parte", mas relacionado.' },
      footer: { descricao: 'Indicar como rodapé.', notasCodigo: 'Em HTML use a tag <footer> para agrupar informações relacionadas à parte inferior de uma página ou seção.' },
    },
    tituloPagina: { descricao: 'Definir o título da página como: [insira aqui o título].', notasCodigo: 'Definir usando a tag <title> no HTML.' },
    customizavel: { descricao: 'Insira seu texto da descrição.', notasCodigo: 'Insira seu texto com as anotações necessárias para o pessoal de desenvolvimento.' },
  },
  titulo: {
    niveis: {
      h1: { descricao: 'Identificar como título de nível 1.' },
      h2: { descricao: 'Identificar como título de nível 2.' },
      h3: { descricao: 'Identificar como título de nível 3.' },
      h4: { descricao: 'Identificar como título de nível 4.' },
      h5: { descricao: 'Identificar como título de nível 5.' },
      h6: { descricao: 'Identificar como título de nível 6.' },
    },
    mobile: { descricao: 'Identificar como título.', notaCodigo: 'accessibilityRole="header"' },
  },
  decorativo: {
    gerais: { descricao: 'Não deve ser anunciado pelo Leitor de Tela.', notasCodigo: 'Insira seu texto com as anotações necessárias para o pessoal de desenvolvimento.' },
    imagem: { descricao: 'Não deve ser anunciado pelo Leitor de Tela.', notasCodigo: 'Em HTML utilize o atributo alt="" com o valor vazio.' },
  },
  informacoes: {
    handoffs:      { descricao: 'Especificado no handoff: [insira aqui o link ou nome do handoff].' },
    conteudoExtra: { descricao: 'Saiba mais em: [insira aqui o link ou nome do conteúdo].' },
    customizavel:  { descricao: 'Insira seu texto da descrição.' },
  },
};

// Rótulos amigáveis dos 16 componentes do catálogo (mesma chave usada em
// A11Y_CONTENT.elemento.componentes) — só pra exibição no <select>.
const A11Y_COMPONENTE_LABELS = {
  accordion: 'Accordion', breadcrumb: 'Breadcrumb', button: 'Button', checkbox: 'Checkbox',
  dialog: 'Dialog', inputs: 'Inputs', link: 'Link', listas: 'Listas', paginator: 'Paginator',
  'radio button': 'Radio Button', snackbar: 'Snackbar', stepper: 'Stepper', switch: 'Switch',
  table: 'Table', 'tab group': 'Tab Group', imagem: 'Imagem',
};

// ── Component properties reais dos 25 component sets internos "[a11y base]"
// da lib "Design Acessível" — extraído via REST API. Fonte de verdade agora é
// o arquivo GERADO refs/_a11y-constants.generated.js (concatenado no bundle
// ANTES deste módulo, ver build.cjs), produzido por
// refs/build-a11y-constants.cjs a partir de refs/design-acessivel-
// properties.json. Alias mantido com o nome histórico para não exigir
// alterar todos os pontos de consumo já espalhados neste arquivo. Regenerar
// via: npm run refs:a11y-constants (NÃO editar A11Y_COMPONENT_PROPERTIES à
// mão — a fonte real é o JSON extraído da API).
const A11Y_COMPONENT_PROPERTIES = A11Y_COMPONENT_PROPERTIES_GENERATED;

// O <select> de "Elementos e Imagens" usa a chave "imagem" (mesma de
// A11Y_CONTENT.elemento.componentes), mas o component set real correspondente
// na lib se chama "texto alternativo para imagens" — os outros 15 valores do
// select já casam 1:1 com o shortName do component set.
const _A11Y_SELECT_TO_SHORTNAME = {
  imagem: 'texto alternativo para imagens',
};

// Vocabulário canônico dos toggles booleanos encontrados nos 25 component
// sets — a lib tem erros de digitação inconsistentes entre componentes:
//   "nome acesivel" (Switch, Texto alternativo) / "nome acessivel" (maioria)
//   / "nome acessível" (Breadcrumb, com acento) → nomeAcessivel
//   "observacao" (Breadcrumb, singular) / "observacoes" (maioria)          → observacoes
//   "notas" (maioria) / "notas de codigo" (Accordion, Snackbar)            → notas
function _normalizeA11yToggleName(rawName) {
  const s = String(rawName || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .trim();
  if (s === 'nome acesivel' || s === 'nome acessivel') return 'nomeAcessivel';
  if (s === 'observacao' || s === 'observacoes') return 'observacoes';
  if (s === 'notas' || s === 'notas de codigo') return 'notas';
  return null; // property que não é um dos 3 toggles canônicos (ex: variantes, texto "letter")
}

// Rótulos amigáveis dos toggles canônicos — usados no formulário dinâmico
// (label do checkbox) e na persistência (properties[].label).
const A11Y_TOGGLE_LABELS = {
  nomeAcessivel: 'Nome Acessível',
  observacoes: 'Observações',
  notas: 'Notas de Código',
  // Exclusivos do wrapper mobile "[a11y mob] Box specs leitor de tela"
  // (fileKey 3zdtN13YvPlCGPdXeL0Y2i, node 5413:1262, variante "Conector=
  // Elementos e imagens") — confirmados via REST API, NÃO existem no
  // wrapper desktop equivalente ("[a11y] Box specs LT"). Ver
  // A11Y_MOBILE_ONLY_TOGGLES abaixo.
  accessibilityHint: 'Dica para Leitor de Tela',
  linkComponente: 'Link do Componente',
};

// Limite de caracteres dos textareas de toggle dinâmico (Observações/Notas de
// Código/Dica para Leitor de Tela) — anotações livres pro dev, podem ser mais
// longas que um label, mas ainda devem caber num card de spec sem virar bloco
// de texto. "notas" (Notas de Código) usa um teto maior por poder incluir
// referência técnica (ex: nome de prop/atributo) junto da explicação.
const A11Y_TOGGLE_MAXLENGTH = {
  notas: 500,
  observacoes: 400,
  accessibilityHint: 300,
  linkComponente: 300,
};
const A11Y_TOGGLE_MAXLENGTH_DEFAULT = 400;

// Toggle que só existe no wrapper mobile, na sub-variante "componente" —
// nunca renderizado quando a spec é de origem web (o componente real
// desktop não tem esse campo). Chave própria, fora de
// A11Y_COMPONENT_PROPERTIES (catálogo desktop): a origem desse campo é o
// texto oficial da lib mobile ("📍 Instruções (comece por aqui)", node
// 811:866), não uma property BOOLEAN de um component set "[a11y base]"
// desktop.
//
// Confirmado via REST API em 2026-08-31 (ver
// refs/design-acessivel-mobile-link-property.json) no wrapper "[a11y mob]
// Box specs leitor de tela", variante "Elementos e imagens": "Dica Leitor de
// Tela" tem toggle BOOLEAN real (defaultValue true na definição do
// component set base; a instância do wrapper publicado usa false —
// replicado aqui como default desligado). "Link do componente" NÃO tem
// toggle no componente publicado (instância sempre presente, sem
// componentPropertyReferences de visible) — por isso NÃO está mais nesta
// lista de toggles opcionais, virou campo sempre-visível na sub-variante
// "componente" (ver A11Y_MOBILE_LINK_OPTIONS/_renderA11yElementoMobileFields).
const A11Y_MOBILE_ONLY_TOGGLES = [
  { key: 'accessibilityHint', label: 'Dica para Leitor de Tela', placeholder: 'Inserir o seguinte accessibilityHint: [explicação sobre o que acontecerá após a ação].' },
];

// As 3 sub-variantes mutuamente exclusivas de "Elementos e Imagens" mobile —
// strings EXATAS da property VARIANT real "Variante" do component set
// ".[a11y mob base] Elementos e imagens" (fileKey 3zdtN13YvPlCGPdXeL0Y2i,
// node 5362:961), confirmadas via REST API em 2026-08-31 (ver
// refs/design-acessivel-mobile-link-property.json). Não usar camelCase
// aqui — o valor persistido em a11ySubtype.variant precisa bater 1:1 com a
// nomenclatura real do Figma, ainda que as chaves deste objeto (JS) usem
// nomes mais convenientes.
const A11Y_ELEMENTO_MOBILE_VARIANTS = {
  componente: 'componente',
  link: 'link',
  textoAlternativo: 'texto alternativo',
};

// As 64 opções reais do dropdown VARIANT "Link" do component set interno
// ".[a11y mob base] Link do Componente" (node 5536:8553) — nomes exatos, na
// mesma ordem retornada pela API. Fonte de verdade agora é o arquivo GERADO
// refs/_a11y-constants.generated.js (concatenado no bundle ANTES deste
// módulo, ver build.cjs), produzido por refs/build-a11y-constants.cjs a
// partir de refs/design-acessivel-mobile-properties.json. Alias mantido com
// o nome histórico para não exigir alterar todos os pontos de consumo já
// espalhados neste arquivo. "Personalizado" é o default (última opção da
// lista real). Este dropdown é só um RÓTULO textual (type VARIANT, não
// INSTANCE_SWAP) — não há vínculo de componente real por trás de cada
// opção. Regenerar via: npm run refs:a11y-constants (NÃO editar
// A11Y_MOBILE_LINK_COMPONENT_OPTIONS à mão).
const A11Y_MOBILE_LINK_COMPONENT_OPTIONS = A11Y_MOBILE_LINK_COMPONENT_OPTIONS_GENERATED;
const A11Y_MOBILE_LINK_URL_PLACEHOLDER = '[insira aqui o link do componente]. Se o componente não estiver na lista acima, escreva o nome real dele aqui — é assim que a vertical de a11y sabe que falta mapear esse componente na lib.';

// Tabela nome-do-dropdown -> node_id do component set REAL na lib "DSC |
// Super App" (fileKey abaixo) — só os nomes com match EXATO e sem
// ambiguidade contra os containingFrame reais (hoje 46 dos 64; os outros 18,
// incl. "Personalizado", não têm correspondência segura e ficam de fora,
// mantendo o preenchimento manual). Gerada 100% a partir do dado extraído
// via REST API (refs/super-app.json + refs/_manifest.json) por
// refs/build-a11y-constants.cjs — NÃO editar à mão, e nunca usar como tabela
// estática: se o componente mudar de nodeId/for renomeado na lib real, o
// próximo refresh do skeleton (fetch-design-refs.cjs → build-skeleton.cjs →
// build-a11y-constants.cjs, o mesmo pipeline do CI semanal) já atualiza este
// arquivo gerado. Consumida por _autofillA11yMobileLinkUrlFromComponentName.
const A11Y_MOBILE_COMPONENT_LINK_NODE_IDS = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS_GENERATED;
const A11Y_SUPER_APP_FILE_KEY = A11Y_SUPER_APP_FILE_KEY_GENERATED;
const A11Y_SUPER_APP_FILE_NAME = A11Y_SUPER_APP_FILE_NAME_GENERATED;

// Monta o deep-link real do Figma para o node_id de um component set da lib
// "DSC | Super App". type: 'URL' (não 'NODE' — NODE não suporta link
// cross-file a partir de um plugin rodando em outro arquivo). O Figma não
// valida o segmento de nome do arquivo na URL — funciona com qualquer
// string —, mas usamos o nome real (slugificado) da lib por clareza.
function _buildA11yMobileComponentDeepLink(nodeId) {
  if (!nodeId || !A11Y_SUPER_APP_FILE_KEY) return '';
  return `https://www.figma.com/design/${A11Y_SUPER_APP_FILE_KEY}/${A11Y_SUPER_APP_FILE_NAME}?node-id=${encodeURIComponent(nodeId)}`;
}

// Handler do <select> "Componente do DSC" (dropdown "Link do Componente") —
// se o nome escolhido tiver nodeId real conhecido (um dos 46 com match
// seguro), preenche AUTOMATICAMENTE o campo de texto companheiro com a URL
// do deep-link real. Nunca sobrescreve um valor que o designer já tenha
// digitado manualmente (nem ao trocar de opção depois) — só entra quando o
// campo de URL está vazio. Nomes sem match seguro (18 restantes, incl.
// "Personalizado") não alteram o campo: comportamento manual de sempre.
// Renderiza "Componente DSC: <nome>" no cabeçalho do modal — vira link
// clicável (deep-link real do Figma pra lib "DSC | Super App") só quando dá
// pra resolver um nodeId com confiança: origem mobile + nome limpo batendo
// EXATO contra A11Y_MOBILE_COMPONENT_LINK_NODE_IDS (mesmo critério/mesma
// tabela usada em _autofillA11yMobileLinkUrlFromComponentName — 46/64 nomes
// reais cobertos). A lib desktop ("Web Angular & React"/"Super DSC Web") não
// entra aqui: o dado extraído dela (refs/web-angular-react.json,
// refs/super-dsc-web.json) não tem containingFrameNodeId, só componentKey de
// variante — sem nodeId real de component set não dá pra montar um deep-link
// confiável, então cai sempre no texto puro (fallback seguro, sem link
// quebrado). target="_blank" abre a lib publicada numa aba nova do
// navegador; o Figma intercepta e trata normalmente dentro do iframe da UI
// do plugin, sem precisar de postMessage/figma.openExternal (que é API de
// backend e não existe pra esse caso de link estático).
function _renderA11yModalDscComponentName(elId, dscComponentNameRaw, a11yOrigin) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!dscComponentNameRaw) { el.innerHTML = 'Não identificado'; return; }
  const clean = _cleanDscContainingFrameName(dscComponentNameRaw);
  const cleanKey = clean.trim().toLowerCase();
  let nodeId = null;
  if (a11yOrigin === 'mobile') {
    const matchName = Object.keys(A11Y_MOBILE_COMPONENT_LINK_NODE_IDS)
      .find(name => name.trim().toLowerCase() === cleanKey);
    if (matchName) nodeId = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS[matchName];
  }
  const url = nodeId ? _buildA11yMobileComponentDeepLink(nodeId) : '';
  if (url) {
    el.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Abrir componente na lib DSC" class="text-[#0891B2] dark:text-cyan-400 underline decoration-dotted hover:decoration-solid">${escapeHtml(clean)}</a>`;
  } else {
    el.textContent = clean;
  }
}

function _autofillA11yMobileLinkUrlFromComponentName() {
  const select = document.getElementById('a11y-el-mobile-link-select');
  const linkUrl = document.getElementById('a11y-el-mobile-link-url');
  if (!select || !linkUrl) return;
  if (!linkUrl.value.trim()) {
    const nodeId = A11Y_MOBILE_COMPONENT_LINK_NODE_IDS[select.value];
    if (nodeId) {
      const url = _buildA11yMobileComponentDeepLink(nodeId);
      if (url) { linkUrl.value = url; updateA11yCharCounter(linkUrl); }
    }
  }
  _syncA11yMobileLinkUrlLockState();
}

// Trava #a11y-el-mobile-link-url sempre que o <select> companheiro aponta
// para um componente real conhecido (qualquer opção != "Personalizado") —
// nesses casos o texto já foi resolvido automaticamente (ou é a escolha
// deliberada do designer dentre as 64 opções reais) e não deve divergir do
// nome escolhido. Só fica editável quando "Personalizado" está selecionado
// (equivalente ao "Outro" desktop: único jeito de documentar componente fora
// do catálogo). readOnly em vez de disabled: mantém o valor acessível via
// .value no submit (_collectA11yElementoMobileToggleProperties) e visível
// pro designer, só bloqueia edição — disabled removeria o campo do fluxo de
// leitura normal e teria semântica de "campo indisponível", não é o caso.
function _syncA11yMobileLinkUrlLockState() {
  const select = document.getElementById('a11y-el-mobile-link-select');
  const linkUrl = document.getElementById('a11y-el-mobile-link-url');
  const lockHint = document.getElementById('a11y-el-mobile-link-url-lock-hint');
  if (!select || !linkUrl) return;
  const isLocked = select.value !== 'Personalizado';
  linkUrl.readOnly = isLocked;
  linkUrl.classList.toggle('bg-gray-50', isLocked);
  linkUrl.classList.toggle('dark:bg-dark-bg', isLocked);
  linkUrl.classList.toggle('cursor-not-allowed', isLocked);
  if (lockHint) lockHint.classList.toggle('hidden', !isLocked);
}

// ── Migração aditiva: specs "elemento" mobile pré-existentes ganham
// a11ySubtype.variant ──────────────────────────────────────────────────────
// Chamada uma única vez em messages.js (handler 'init-plugin'), logo após
// a11ySpecs ser restaurado de hacData.a11ySpecs — silenciosa, sem toast, sem
// subir _schemaVersion (aditiva por-spec, não estrutural). Idempotente: só
// toca specs que ainda não têm a11ySubtype.variant, então rodar de novo em
// specs já migradas (ou em specs desktop, que nunca ganham essa chave) é
// no-op.
//
// Cobre só o legado ANTERIOR à existência de a11ySubtype.variant — specs
// criadas/editadas depois da correção "a origem filtra tudo" (2026-09) já
// nascem com variant preenchido (inclusive no branch isOutro legado), então
// nunca mais entram neste caminho de inferência por heurística.
//
// Regra de inferência (decisão de produto, ver conversa que introduziu esta
// migração — 2026-08-31):
//   1. properties[key:'linkComponente'] preenchido → 'componente' (tinha o
//      campo de link preenchido, é claramente um componente real).
//   2. properties[key:'descricao'] preenchido E a11ySubtype.componente
//      null/ausente E a11ySubtype.isOutro falso/ausente (só tinha descrição
//      livre, sem componente do catálogo escolhido) → 'texto alternativo'.
//   3. Fallback mais seguro: 'componente'. Quando cai neste fallback E não
//      havia link preenchido, marca spec.needsReview = true (campo que já
//      existe no schema, ver code.js create-unified-spec) pro designer
//      completar o Link do Componente manualmente depois.
function _migrateA11yElementoMobileVariants(specs) {
  return (specs || []).map(spec => {
    if (!spec || spec.a11yType !== 'elemento' || spec.a11yOrigin !== 'mobile') return spec;
    if (spec.a11ySubtype && spec.a11ySubtype.variant) return spec; // já migrada — idempotente

    const props = spec.properties || [];
    const getProp = key => {
      const p = props.find(x => x && x.key === key);
      return p ? p.value : '';
    };
    const linkComponente = getProp('linkComponente');
    const descricao = getProp('descricao');
    const sub = spec.a11ySubtype || {};

    let variant;
    let needsReview = false;
    if (linkComponente && String(linkComponente).trim()) {
      variant = A11Y_ELEMENTO_MOBILE_VARIANTS.componente;
    } else if (descricao && String(descricao).trim() && !sub.componente && !sub.isOutro) {
      variant = A11Y_ELEMENTO_MOBILE_VARIANTS.textoAlternativo;
    } else {
      variant = A11Y_ELEMENTO_MOBILE_VARIANTS.componente;
      needsReview = true; // sem link preenchido — designer precisa completar depois
    }

    return {
      ...spec,
      a11ySubtype: { ...sub, variant },
      needsReview: needsReview ? true : !!spec.needsReview,
    };
  });
}
window._migrateA11yElementoMobileVariants = _migrateA11yElementoMobileVariants;

// Properties VARIANT que já são controladas pelo próprio <select> de
// "Componente" (nível 1, wrapper "componentes/icones/imagens") — nunca viram
// um segundo seletor redundante no formulário, mesmo aparecendo no array
// bruto de properties do catálogo.
const _A11Y_VARIANT_BLOCKLIST = new Set(['componente', 'variante']);

// Capitaliza só a primeira letra — suficiente pra rotular opções de variante
// (ex: "de icone" → "De icone").
function _capitalizeFirst(s) {
  const str = String(s || '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Dado o shortName do <select> de "Elementos e Imagens" (ex: 'button',
// 'imagem'), retorna { toggles: [{ key, label, syncId }], texts: [...],
// variants: [...], variantFields: [{ name, syncId, options, rawName }] } com
// os toggles/variantes canônicos DISPONÍVEIS naquele componente real, ou null
// se o componente não estiver catalogado (fallback gracioso).
function _getA11yComponentToggles(selectValue) {
  const shortName = _A11Y_SELECT_TO_SHORTNAME[selectValue] || selectValue;
  const entry = A11Y_COMPONENT_PROPERTIES.find(c => c.shortName === shortName);
  if (!entry) return null;

  const toggles = [];
  const seen = new Set();
  entry.properties.forEach(p => {
    if (p.type !== 'BOOLEAN') return;
    const canonical = _normalizeA11yToggleName(p.name);
    if (!canonical || seen.has(canonical)) return;
    seen.add(canonical);
    toggles.push({ key: canonical, label: A11Y_TOGGLE_LABELS[canonical] || canonical, syncId: p.syncId, rawName: p.name });
  });

  const variantFields = entry.properties
    .filter(p => p.type === 'VARIANT' && !_A11Y_VARIANT_BLOCKLIST.has(String(p.name || '').toLowerCase()))
    .map(p => ({
      name: p.name,
      syncId: p.syncId,
      rawName: p.name,
      options: (p.variantOptions || []).map(v => ({ value: v, label: _capitalizeFirst(v) })),
      defaultValue: p.defaultValue,
    }));

  return {
    toggles,
    texts: entry.properties.filter(p => p.type === 'TEXT').map(p => p.name),
    variants: entry.properties.filter(p => p.type === 'VARIANT').map(p => p.name),
    variantFields,
  };
}
window._getA11yComponentToggles = _getA11yComponentToggles;

// Procura uma Área Marcada pelo id — array único, sem escopos avulso/
// por-frame (diferença de schema em relação ao Handex).
function _findA11yAreaById(areaId) {
  if (!areaId) return null;
  return (a11yAreas || []).find(a => a && a.id === areaId) || null;
}

// ── Criação ──────────────────────────────────────────────────────────────

// Botão "+" no cabeçalho de cada accordion de Área Marcada primeiro checa se
// a lib "Design Acessível" está acessível antes de abrir o modal de escolha
// de categoria — ver handler 'check-a11y-library' em code.js. A área clicada
// fica guardada em window._a11yPendingAreaId até o formulário (openA11yModal)
// ler e gravar em modal.dataset.areaId — é assim que confirmA11ySpec sabe em
// qual área a nova spec deve nascer.
function openA11yCategoryPickerModal(areaId) {
  window._a11yPendingAreaId = areaId || null;
  window._a11yLibCheckOnSuccess = null; // fluxo normal "+" nunca usa o desvio de openA11yFormFromUndocumented
  // Token de correlação — se o designer clicar "+" em duas áreas diferentes
  // antes da primeira checagem responder, só a resposta do pedido MAIS
  // recente pode abrir o modal.
  const token = 'a11y-lib-check-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  window._a11yLibCheckToken = token;
  parent.postMessage({ pluginMessage: { type: 'check-a11y-library', token } }, '*');
}
window.openA11yCategoryPickerModal = openA11yCategoryPickerModal;

// Chamado por messages.js quando o backend confirma que a lib está acessível
// (resposta 'a11y-library-status', linked: true).
function _openA11yCategoryPickerModalNow() {
  const areaId = window._a11yPendingAreaId;
  const label = document.getElementById('a11y-category-picker-area-label');
  if (label) {
    const area = _findA11yAreaById(areaId);
    if (area) {
      label.textContent = `Nova spec em: ${area.number}  ${area.label}`;
      label.classList.remove('hidden');
    } else {
      label.classList.add('hidden');
    }
  }
  openModal('a11y-category-picker-modal');
}
window._openA11yCategoryPickerModalNow = _openA11yCategoryPickerModalNow;

function closeA11yCategoryPickerModal() {
  closeModal('a11y-category-picker-modal');
}
window.closeA11yCategoryPickerModal = closeA11yCategoryPickerModal;

// Reabre a checagem de vínculo depois que o designer resolve o passo a passo
// (habilitar a lib no Assets) e clica em "Já habilitei, tentar de novo".
function retryA11yLibraryCheck() {
  closeModal('a11y-library-required-modal');
  const token = 'a11y-lib-check-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  window._a11yLibCheckToken = token;
  parent.postMessage({ pluginMessage: { type: 'check-a11y-library', token } }, '*');
}
window.retryA11yLibraryCheck = retryA11yLibraryCheck;

function chooseA11yType(category) {
  closeA11yCategoryPickerModal();
  // Origem da spec manual "+ Nova spec": lê a origem já configurada do
  // projeto (definida antes, no mínimo em Marcar Área — toda spec pertence a
  // uma Área) em vez de assumir 'web' sempre. Só lê o valor já persistido
  // (getA11yProjectOrigin) — não chama ensureA11yProjectOriginThen aqui, que
  // abriria uma modal bloqueante; a esta altura do fluxo a origem já deveria
  // estar definida. Fallback 'web' cobre só o caso raro de ainda não estar.
  openA11yModal(category, { a11yOrigin: getA11yProjectOrigin() || 'web' });
}
window.chooseA11yType = chooseA11yType;

const A11Y_MODAL_TITLE = {
  elemento: 'Elementos e Imagens',
  estrutura: 'Estrutura da Página',
  titulo: 'Nível de Título',
  decorativo: 'Elemento Decorativo',
  informacoes: 'Informações Adicionais',
};

// Categorias que usam tag manual (A, A1, A1.1...) — Título usa selo fixo por
// nível, Decorativo usa selo fixo de ícone.
const A11Y_TAG_INPUT_ID = {
  elemento: 'a11y-el-tag-input',
  estrutura: 'a11y-estrutura-tag-input',
  informacoes: 'a11y-informacoes-tag-input',
};
const A11Y_TAG_ERROR_ID = {
  elemento: 'a11y-el-tag-error',
  estrutura: 'a11y-estrutura-tag-error',
  informacoes: 'a11y-informacoes-tag-error',
};

function openA11yModal(category, options) {
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;
  const presetComponente = options && options.presetComponente;
  // Mesma ideia de presetComponente, mas pro subtipo de "estrutura"
  // (header/nav/main/aside/footer) e o nível de "titulo" — os dois únicos
  // casos, fora "elemento", onde o scan já indica uma variante específica em
  // vez de só a categoria.
  const presetEstruturaTipo = options && options.presetEstruturaTipo;
  const presetTituloNivel = options && options.presetTituloNivel;
  // Origem (web/mobile) da spec sendo criada/editada — decide se os 2 campos
  // exclusivos do wrapper mobile (Dica para Leitor de Tela/Link do
  // Componente) aparecem em "Elementos e Imagens" (ver
  // _renderA11yElementoMobileFields). O fluxo manual "+ Nova spec"
  // (chooseA11yType) já resolve isto lendo getA11yProjectOrigin() antes de
  // chamar este modal; default 'web' aqui cobre só o caso raro de a origem
  // do projeto ainda não estar definida.
  const a11yOrigin = (options && options.a11yOrigin) || 'web';
  // Nome cru do component set DSC real (containingFrame, ex: "[dsc] Button")
  // já resolvido pelo scan que abriu este formulário via
  // openA11yFormFromUndocumented — mesmo raciocínio do a11yOrigin acima.
  // O fluxo manual "+ Nova spec" nunca passa isto, então cai em null.
  const dscComponentName = (options && options.dscComponentName) || null;

  const modal = document.getElementById('a11y-spec-modal');
  if (!modal) return;
  // Instrução antes fixa no corpo do modal virou snackbar — mas o modal
  // reabre repetidamente item a item no wizard de lote (potencialmente 50+
  // vezes numa revisão grande), então só mostra na primeira vez de todas
  // (persistido via figma.clientStorage, mesmo padrão do onboarding —
  // window._a11ySpecModalInstructionShown já chega setada a partir de
  // msg.specModalInstructionSeen em init-plugin, ver messages.js). O
  // conteúdo continua coberto pelo hint fixo do rodapé do modal (ver
  // modals.html) e pelo onboarding, então não se perde depois da 1ª vez.
  // showSnackbar (não showToast) porque o texto tem 3 informações e precisa
  // de mais tempo de leitura — permanece até fechamento manual (X) em vez
  // de sumir sozinho em 3s.
  if (!window._a11ySpecModalInstructionShown) {
    window._a11ySpecModalInstructionShown = true;
    parent.postMessage({ pluginMessage: { type: 'save-spec-modal-instruction-seen' } }, '*');
    showSnackbar('Selecione o elemento no canvas antes de aplicar. A especificação nasce travada e posicionada ao lado dele — use o cadeado na listagem para destravar depois.');
  }
  modal.dataset.category = category;
  modal.dataset.areaId = window._a11yPendingAreaId || '';
  modal.dataset.a11yOrigin = a11yOrigin;
  if (dscComponentName) modal.dataset.dscComponentName = dscComponentName;
  else delete modal.dataset.dscComponentName;
  // Usado pelo lote automatizado pra pré-selecionar o componente sugerido no
  // <select>.
  if (presetComponente) modal.dataset.presetComponente = presetComponente;
  else delete modal.dataset.presetComponente;
  // Fixa qual nó do canvas a spec deve apontar, igual editA11ySpec faz via
  // editingSpec.targetNodeId. Sem isso o backend cairia na seleção atual do
  // canvas (comportamento normal de criação manual), que não é o elemento
  // que o designer clicou na lista de pendentes.
  const pendingTargetNodeId = options && options.pendingTargetNodeId;
  if (pendingTargetNodeId) modal.dataset.pendingTargetNodeId = pendingTargetNodeId;
  else delete modal.dataset.pendingTargetNodeId;
  // editA11ySpec sobrescreve editingSpecId/editingOriginalIndex e o texto do
  // botão logo depois desta chamada — abrir pra criar uma spec nova sempre
  // limpa qualquer resquício de edição anterior.
  delete modal.dataset.editingSpecId;
  delete modal.dataset.editingOriginalIndex;
  const confirmBtnReset = document.getElementById('btn-a11y-confirm');
  if (confirmBtnReset) confirmBtnReset.textContent = 'Aplicar';
  // Reset defensivo do estado visual do wizard (botões "Localizar no
  // canvas"/"Descartar", progresso "N de M") — abrir o formulário fora do wizard
  // (botão "+ Nova spec"/pendências avulsas) nunca deve herdar UI de uma
  // revisão anterior. _advanceA11yBatchWizard reativa o dataset/UI logo
  // depois desta chamada quando de fato é o wizard quem está abrindo.
  delete modal.dataset.wizardActive;
  _resetA11yBatchWizardUi();

  const areaLabelEl = document.getElementById('a11y-modal-area-label');
  if (areaLabelEl) {
    const area = _findA11yAreaById(modal.dataset.areaId);
    if (area) {
      areaLabelEl.textContent = `Área: ${area.number}  ${area.label}`;
      areaLabelEl.classList.remove('hidden');
    } else {
      areaLabelEl.classList.add('hidden');
    }
  }

  // "Camada no canvas"/"Componente DSC" — read-only, comuns às 5 categorias
  // (ver bloco correspondente em modals.html). "Camada no canvas" só chega
  // depois, via get-selection-name/prefillA11yComponentName (fluxo manual) ou
  // já no options.targetNodeName do lote (fluxo automático) — resetado aqui
  // pra nunca herdar o nó da spec anterior enquanto a resposta não chega.
  // "Componente DSC" já pode estar disponível de imediato no fluxo
  // automático (dscComponentName resolvido antes de abrir o modal).
  const targetNodeNameEl = document.getElementById('a11y-modal-target-node-name');
  if (targetNodeNameEl) {
    const presetTargetNodeName = (options && options.targetNodeName) || null;
    targetNodeNameEl.textContent = presetTargetNodeName || '—';
  }
  _renderA11yModalDscComponentName('a11y-modal-dsc-component-name', dscComponentName, a11yOrigin);

  const title = document.getElementById('a11y-modal-title-text');
  if (title) title.textContent = A11Y_MODAL_TITLE[category] || 'Especificação de Acessibilidade';

  const titleIconWrap = document.getElementById('a11y-modal-title-icon');
  if (titleIconWrap) {
    titleIconWrap.innerHTML = `<i data-lucide="${meta.icon}" class="w-4 h-4" style="color:${meta.color}" aria-hidden="true"></i>`;
    _refreshIcons(titleIconWrap);
  }

  // Correção de categoria (ícone de editar + <select> inline) só existe
  // durante a revisão do wizard — fora dele, categoria errada é resolvida
  // apagando e recriando a spec (edição normal não tem esse atalho).
  toggleA11yWizardCategoryPicker(false);
  const categoryEditBtn = document.getElementById('a11y-modal-category-edit-btn');
  if (categoryEditBtn) categoryEditBtn.classList.toggle('hidden', !window._a11yBatchWizardState);

  ['elemento', 'estrutura', 'titulo', 'decorativo', 'informacoes'].forEach(c => {
    const block = document.getElementById(`a11y-fields-${c}`);
    if (block) block.classList.toggle('hidden', category !== c);
  });

  [
    'a11y-el-label',
    'a11y-el-componente-outro',
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; updateA11yCharCounter(el); }
  });

  const drawModeDefault = document.querySelector('input[name="a11y-draw-mode"][value="contorno"]');
  if (drawModeDefault) drawModeDefault.checked = true;

  // Resolve "Camada no canvas"/"Componente DSC" (campos read-only, comuns às
  // 5 categorias) a partir da seleção atual do canvas — só no fluxo manual
  // "+ Nova spec". O fluxo automático já chega com targetNodeName/
  // dscComponentName via options (resolvidos em memória pelo scan, ver
  // _resolveA11yFormPresetFromItem), e o modo edição (options.editing, ver
  // editA11ySpec) já populou os 2 campos com os dados salvos da spec — nos
  // dois casos, a seleção atual do canvas é irrelevante e não pode pisar por
  // cima assim que a resposta assíncrona chegar. Não usar
  // modal.dataset.editingSpecId aqui: editA11ySpec só grava esse dataset
  // DEPOIS desta chamada retornar, tarde demais pra este check síncrono
  // (prefillA11yComponentName, chamado bem mais tarde de forma assíncrona,
  // já enxerga o dataset correto e por isso usa ele em vez de options.editing).
  const isPresetOpen = !!(options && (options.editing || options.targetNodeName));
  if (!isPresetOpen) {
    parent.postMessage({ pluginMessage: { type: 'get-selection-name' } }, '*');
  }

  if (category === 'elemento') {
    const select = document.getElementById('a11y-el-componente-select');
    if (select) {
      const validPreset = presetComponente && A11Y_CONTENT.elemento.componentes[presetComponente];
      select.value = validPreset ? presetComponente : Object.keys(A11Y_CONTENT.elemento.componentes)[0];
    }
    // Reset do seletor de sub-variante mobile pro default real da property
    // ("componente") — editA11ySpec restaura o valor salvo depois, via
    // _prefillA11ySpecForEdit/_restoreA11yElementoMobileVariant.
    const mobileVariantDefault = document.querySelector('input[name="a11y-el-mobile-variant"][value="componente"]');
    if (mobileVariantDefault) mobileVariantDefault.checked = true;
    const mobileList = document.getElementById('a11y-el-mobile-toggles-list');
    if (mobileList) { delete mobileList.dataset.renderedVariant; mobileList.innerHTML = ''; }
    updateA11yElementoFields();
  } else if (category === 'estrutura') {
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    // presetEstruturaTipo só existe pra marco de navegação (header/nav/main/
    // aside/footer), então já implica variacao = 'marco de navegacao' em vez
    // do default 'idiomas'.
    if (subtipoSelect) subtipoSelect.value = presetEstruturaTipo ? 'marco de navegacao' : 'idiomas';
    const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
    if (idiomasSelect) idiomasSelect.value = 'da pagina';
    const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
    if (marcoSelect) marcoSelect.value = presetEstruturaTipo || 'header';
    updateA11yEstruturaFields();
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    if (nivelSelect) nivelSelect.value = presetTituloNivel || _defaultTituloNivelForOrigin(a11yOrigin);
    updateA11yTituloFields();
  } else if (category === 'decorativo') {
    const subtipoSelect = document.getElementById('a11y-decorativo-subtipo-select');
    if (subtipoSelect) subtipoSelect.value = 'gerais';
    updateA11yDecorativoFields();
  } else if (category === 'informacoes') {
    const subtipoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    if (subtipoSelect) subtipoSelect.value = 'handoffs';
    updateA11yInformacoesFields();
  }

  const tagInputId = A11Y_TAG_INPUT_ID[category];
  if (tagInputId) {
    const tagInput = document.getElementById(tagInputId);
    if (tagInput) tagInput.value = _suggestNextA11yTagForArea(modal.dataset.areaId);
  }
  validateA11yTagInput();

  openModal('a11y-spec-modal');
}
window.openA11yModal = openA11yModal;

// Corrige a categoria sugerida pela Detecção Automática sem descartar o item
// (ver botão de editar no cabeçalho, toggleA11yWizardCategoryPicker) —
// reabre o mesmo formulário só que com outra categoria, preservando
// targetNodeId/origem/componente DSC/nome de camada do item atual (o que
// _resolveA11yFormPresetFromItem já resolveu pra ele); presetComponente/
// presetTituloNivel/presetEstruturaTipo não se aplicam à nova categoria, por
// isso não são repassados — cada categoria nasce no próprio default.
function switchA11yWizardCategory(newCategory) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || !A11Y_CATEGORIES[newCategory]) return;
  if (newCategory === modal.dataset.category) { toggleA11yWizardCategoryPicker(false); return; }
  const options = {
    pendingTargetNodeId: modal.dataset.pendingTargetNodeId || null,
    a11yOrigin: modal.dataset.a11yOrigin || 'web',
    dscComponentName: modal.dataset.dscComponentName || null,
    targetNodeName: document.getElementById('a11y-modal-target-node-name').textContent,
  };
  openA11yModal(newCategory, options);
  const state = window._a11yBatchWizardState;
  if (state) _applyA11yWizardModalUi(state);
  toggleA11yWizardCategoryPicker(false);
}
window.switchA11yWizardCategory = switchA11yWizardCategory;

// Alterna o cabeçalho da modal entre o título estático (ícone + nome da
// categoria) e o <select> de correção manual — só existe/faz sentido durante
// o wizard de revisão (fora dele, categoria errada = apagar e recriar a
// spec, orientação já documentada no guia). show=true força abrir mesmo
// clicando de novo no ícone; false força fechar (ex: depois de escolher uma
// categoria).
function toggleA11yWizardCategoryPicker(show) {
  const titleText = document.getElementById('a11y-modal-title-text');
  const picker = document.getElementById('a11y-modal-category-picker');
  if (!titleText || !picker) return;
  const next = typeof show === 'boolean' ? show : picker.classList.contains('hidden');
  titleText.classList.toggle('hidden', next);
  picker.classList.toggle('hidden', !next);
  if (next) {
    const modal = document.getElementById('a11y-spec-modal');
    picker.value = modal ? modal.dataset.category : '';
    picker.focus();
  }
}
window.toggleA11yWizardCategoryPicker = toggleA11yWizardCategoryPicker;

// Contador de caracteres genérico e reaproveitável — usado por TODOS os
// campos de texto livre da spec de a11y (estáticos em modals.html e
// dinâmicos gerados via template string aqui neste arquivo). Convenção:
// todo campo com contador tem um <span id="{id-do-campo}-counter"> logo ao
// lado (irmão no mesmo wrapper) mostrando "N/limite". `oninput` chama esta
// função passando `this` — nenhuma lógica por campo, só lê maxlength do
// próprio elemento. Chamada também on-render (ver chamadas logo após cada
// innerHTML dinâmico) pra refletir valores já restaurados em modo edição.
function updateA11yCharCounter(el) {
  if (!el) return;
  const counter = document.getElementById(el.id + '-counter');
  if (!counter) return;
  const max = el.getAttribute('maxlength');
  const len = (el.value || '').length;
  counter.textContent = max ? `${len}/${max}` : String(len);
}
window.updateA11yCharCounter = updateA11yCharCounter;

// Igual updateA11yCharCounter, mas para contadores dinâmicos sem id fixo —
// usado nos toggles renderizados em loop (Observações/Notas de Código por
// componente), onde vários textareas compartilham o mesmo padrão mas não têm
// id único prático. `el` é o textarea/input; `counterEl` é o <span> irmão
// direto já resolvido pelo chamador (ver _renderA11yElementoToggles e afins).
function updateA11yCharCounterEl(el, counterEl) {
  if (!el || !counterEl) return;
  const max = el.getAttribute('maxlength');
  const len = (el.value || '').length;
  counterEl.textContent = max ? `${len}/${max}` : String(len);
}
window.updateA11yCharCounterEl = updateA11yCharCounterEl;

// Tag manual (A, A1, A1.1...) — mesmo formato e mesma lógica de validação das
// specs normais. Resolve o input/erro certo a partir da categoria aberta no
// momento (modal.dataset.category). Título e Elemento Decorativo usam selo
// fixo, não participam dessa numeração — nesse caso não há o que validar,
// botão sempre habilitado.
function validateA11yTagInput() {
  const modal = document.getElementById('a11y-spec-modal');
  const category = modal ? modal.dataset.category : '';
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  const inputId = A11Y_TAG_INPUT_ID[category];
  if (!inputId) {
    if (confirmBtn) confirmBtn.disabled = false;
    return true;
  }
  const input = document.getElementById(inputId);
  const error = document.getElementById(A11Y_TAG_ERROR_ID[category]);
  if (!input) return true;
  updateA11yCharCounter(input);
  const value = input.value.toUpperCase();
  const isValid = /^[A-Z]\d*(\.\d+)*$/.test(value);
  if (error) error.classList.toggle('hidden', isValid);
  if (confirmBtn) confirmBtn.disabled = !isValid;
  return isValid;
}
window.validateA11yTagInput = validateA11yTagInput;

// A origem filtra tudo (decisão de produto, 2026-09): specs mobile de
// "Elementos e Imagens" nunca compartilham tela com o catálogo desktop de 16
// categorias. Esconde/mostra de uma vez só o bloco do <select> "Componente"
// (trigger + menu, coluna inteira do grid) e o bloco #a11y-el-desktop-block
// ("Outro", preview de Descrição/Nota de Código) + variantes/toggles do
// catálogo (#a11y-el-variants-wrap/#a11y-el-toggles-wrap, que já têm sua
// própria lógica condicional de "tem conteúdo catalogado" — aqui só
// sobrepomos com 'hidden' por cima quando mobile). Chamada sempre do topo de
// updateA11yElementoFields, antes de qualquer outra decisão.
function _toggleA11yElementoDesktopBlock(isMobile) {
  const componenteCol = document.getElementById('a11y-el-desktop-componente-col');
  const desktopBlock = document.getElementById('a11y-el-desktop-block');
  const variantsWrap = document.getElementById('a11y-el-variants-wrap');
  const togglesWrap = document.getElementById('a11y-el-toggles-wrap');
  if (componenteCol) componenteCol.classList.toggle('hidden', isMobile);
  if (desktopBlock) desktopBlock.classList.toggle('hidden', isMobile);
  if (isMobile) {
    // Sobrepõe o 'hidden' condicional que _renderA11yElementoVariants/
    // _renderA11yElementoToggles já controlam (baseado no componente
    // desktop escolhido) — em mobile nenhum dos dois deve aparecer, mesmo
    // que o <select> escondido ainda guarde um valor residual de sessão
    // anterior.
    if (variantsWrap) variantsWrap.classList.add('hidden');
    if (togglesWrap) togglesWrap.classList.add('hidden');
  }
}

// ── Elementos e Imagens ──────────────────────────────────────────────────
// Select com o catálogo real de 16 componentes do DSC + "Outro" (texto
// livre, pra telas com componentes fora do catálogo). Ao escolher um item do
// catálogo, mostra preview somente-leitura de Descrição/Nota de Código.
// Specs mobile (modal.dataset.a11yOrigin === 'mobile') pulam esse catálogo
// inteiro — só a lib de Acessibilidade MOBILE alimenta essas specs, nunca a
// desktop (ver _toggleA11yElementoDesktopBlock acima).
function updateA11yElementoFields() {
  const modal = document.getElementById('a11y-spec-modal');
  const isMobile = !!modal && modal.dataset.a11yOrigin === 'mobile';
  _toggleA11yElementoDesktopBlock(isMobile);
  if (isMobile) {
    _renderA11yElementoMobileFields();
    return;
  }

  const select = document.getElementById('a11y-el-componente-select');
  const outroWrap = document.getElementById('a11y-el-componente-outro-wrap');
  const previewWrap = document.getElementById('a11y-el-preview');
  if (!select) return;
  const triggerLabel = document.getElementById('a11y-el-componente-trigger-label');
  if (triggerLabel) {
    const opt = select.options[select.selectedIndex];
    if (opt) triggerLabel.textContent = opt.textContent;
  }
  const isOutro = select.value === 'outro';
  if (outroWrap) outroWrap.classList.toggle('hidden', !isOutro);
  if (previewWrap) previewWrap.classList.toggle('hidden', isOutro);
  _renderA11yElementoVariants(isOutro ? null : select.value);
  _renderA11yElementoToggles(isOutro ? null : select.value);
  _renderA11yElementoMobileFields();
  if (isOutro) return;

  const entry = A11Y_CONTENT.elemento.componentes[select.value];
  const descEl = document.getElementById('a11y-el-preview-descricao');
  const notaWrap = document.getElementById('a11y-el-preview-nota-wrap');
  const notaEl = document.getElementById('a11y-el-preview-nota');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  if (notaWrap) notaWrap.classList.toggle('hidden', !(entry && entry.notasCodigo));
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';
}
window.updateA11yElementoFields = updateA11yElementoFields;

// Renderiza, dentro de #a11y-el-variants-list, um <select> nativo por
// property VARIANT secundária REAL que o componente escolhido tem na lib
// (ex: Button → "tipo": default/desabilitado/de icone...) — ver
// _getA11yComponentToggles/variantFields. Nunca duplica o próprio <select>
// de "Componente" (esse já é o nível 1, controlado por outro elemento do
// formulário) — variantFields já vem filtrado disso. Aparece ANTES dos
// toggles booleanos (característica mais estrutural do componente).
function _renderA11yElementoVariants(selectValue) {
  const wrap = document.getElementById('a11y-el-variants-wrap');
  const list = document.getElementById('a11y-el-variants-list');
  if (!wrap || !list) return;
  list.innerHTML = '';

  const info = selectValue ? _getA11yComponentToggles(selectValue) : null;
  const fields = (info && info.variantFields) || [];
  wrap.classList.toggle('hidden', fields.length === 0);
  if (fields.length === 0) return;

  fields.forEach(f => {
    const row = document.createElement('div');
    const optionsHtml = f.options.map(o =>
      `<option value="${escapeHtml(o.value)}"${o.value === f.defaultValue ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
    ).join('');
    row.innerHTML = `
      <label class="block text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider mb-1.5 ml-1">${escapeHtml(_capitalizeFirst(f.name))}</label>
      <select data-a11y-variant-name="${escapeHtml(f.rawName)}"
        class="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-xl px-3 py-2.5 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all">
        ${optionsHtml}
      </select>
    `;
    list.appendChild(row);
  });
}

// Lê o(s) <select> de variante dinâmica de volta — chamado por
// confirmA11ySpec. Retorna o valor do primeiro campo encontrado (hoje só
// existe "tipo" por componente) ou null se não houver campo renderizado
// (componente sem variante secundária, ou "Outro").
function _collectA11yElementoVariantValue() {
  const list = document.getElementById('a11y-el-variants-list');
  if (!list) return null;
  const select = list.querySelector('[data-a11y-variant-name]');
  return select ? select.value : null;
}

// Inverso de _collectA11yElementoVariantValue — usado em
// _prefillA11ySpecForEdit (editA11ySpec) pra restaurar o valor salvo em
// spec.a11ySubtype.tipo depois que updateA11yElementoFields já recriou o
// <select> pro componente certo.
function _restoreA11yElementoVariant(tipoValue) {
  if (!tipoValue) return;
  const list = document.getElementById('a11y-el-variants-list');
  if (!list) return;
  const select = list.querySelector('[data-a11y-variant-name]');
  if (select) select.value = tipoValue;
}

// Renderiza, dentro de #a11y-el-toggles-list, um toggle por campo booleano
// REAL que o componente escolhido tem na lib (ver _getA11yComponentToggles) —
// componentes diferentes mostram conjuntos diferentes. Cada toggle começa
// DESLIGADO por padrão (decisão de produto: o designer escolhe explicitamente
// o que documentar a cada spec) e, quando ligado, revela um textarea de texto
// livre — é esse texto que o backend grava de verdade dentro do campo do
// componente real (ver _tryImportA11yComponent, code.js). Reconstrói a lista
// do zero a cada troca de componente.
function _renderA11yElementoToggles(selectValue) {
  const wrap = document.getElementById('a11y-el-toggles-wrap');
  const list = document.getElementById('a11y-el-toggles-list');
  if (!wrap || !list) return;
  list.innerHTML = '';

  const info = selectValue ? _getA11yComponentToggles(selectValue) : null;
  const toggles = (info && info.toggles) || [];
  wrap.classList.toggle('hidden', toggles.length === 0);
  if (toggles.length === 0) return;

  toggles.forEach(t => {
    const max = A11Y_TOGGLE_MAXLENGTH[t.key] || A11Y_TOGGLE_MAXLENGTH_DEFAULT;
    const row = document.createElement('div');
    row.className = 'bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-xl overflow-hidden';
    row.innerHTML = `
      <label class="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none">
        <input type="checkbox" data-a11y-toggle-key="${t.key}"
          onchange="_onA11yElementoToggleChange(this)"
          class="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer shrink-0" />
        <span class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(t.label)}</span>
      </label>
      <div class="hidden px-3 pb-3" data-a11y-toggle-textarea-wrap>
        <textarea data-a11y-toggle-value maxlength="${max}" rows="2" placeholder="Insira seu texto de ${escapeHtml(t.label.toLowerCase())}."
          oninput="updateA11yCharCounterEl(this, this.nextElementSibling)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg px-2.5 py-2 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all resize-none"></textarea>
        <span class="block text-right text-[9px] text-slate-400 dark:text-dark-muted mt-0.5">0/${max}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

// Mostra/esconde o textarea do campo quando o toggle correspondente muda:
// limpa o texto ao desligar, pra não persistir um valor "fantasma" de um
// toggle desativado. `row` é o container criado em
// _renderA11yElementoToggles (checkbox e textarea são sempre irmãos diretos
// dentro dele).
function _onA11yElementoToggleChange(checkbox) {
  const row = checkbox.closest('div');
  const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
  if (!wrap) return;
  wrap.classList.toggle('hidden', !checkbox.checked);
  const ta = wrap.querySelector('[data-a11y-toggle-value]');
  if (!checkbox.checked) {
    if (ta) ta.value = '';
  }
  if (ta) updateA11yCharCounterEl(ta, ta.nextElementSibling);
}
window._onA11yElementoToggleChange = _onA11yElementoToggleChange;

// Lê os toggles ligados com texto preenchido de volta em properties[] —
// chamado por confirmA11ySpec. Cada item vira { key, label, value } igual
// descricao/notaCodigo já fazem hoje, fluindo pro backend do mesmo jeito.
function _collectA11yElementoToggleProperties() {
  const list = document.getElementById('a11y-el-toggles-list');
  if (!list) return [];
  const result = [];
  list.querySelectorAll('[data-a11y-toggle-key]').forEach(checkbox => {
    if (!checkbox.checked) return;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    const ta = wrap ? wrap.querySelector('[data-a11y-toggle-value]') : null;
    const value = ta ? ta.value.trim() : '';
    if (!value) return;
    const key = checkbox.getAttribute('data-a11y-toggle-key');
    result.push({ key, label: A11Y_TOGGLE_LABELS[key] || key, value });
  });
  return result;
}

// Inverso de _collectA11yElementoToggleProperties — usado em
// _prefillA11ySpecForEdit (editA11ySpec) pra religar os toggles que a spec
// salva tinha marcado, com o texto já digitado de volta no textarea.
function _restoreA11yElementoToggles(props) {
  const list = document.getElementById('a11y-el-toggles-list');
  if (!list) return;
  const canonicalKeys = new Set(Object.keys(A11Y_TOGGLE_LABELS));
  (props || []).forEach(p => {
    if (!p || !canonicalKeys.has(p.key)) return;
    const checkbox = list.querySelector(`[data-a11y-toggle-key="${p.key}"]`);
    if (!checkbox) return;
    checkbox.checked = true;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    if (wrap) {
      wrap.classList.remove('hidden');
      const ta = wrap.querySelector('[data-a11y-toggle-value]');
      if (ta) { ta.value = p.value || ''; updateA11yCharCounterEl(ta, ta.nextElementSibling); }
    }
  });
}

// Lê o seletor de sub-variante mobile (radio a11y-el-mobile-variant) — só
// existe/é relevante quando modal.dataset.a11yOrigin === 'mobile'. Default
// 'componente' (mesmo default da property VARIANT real "Variante" no
// component set base, ver A11Y_ELEMENTO_MOBILE_VARIANTS).
function _getA11yElementoMobileVariant() {
  const checked = document.querySelector('input[name="a11y-el-mobile-variant"]:checked');
  return checked ? checked.value : A11Y_ELEMENTO_MOBILE_VARIANTS.componente;
}

// onchange do radio de sub-variante mobile — força o rerender do bloco
// condicional (limpa o guard de dataset.renderedVariant pra
// _renderA11yElementoMobileFields não pular a reconstrução).
function updateA11yElementoMobileVariant() {
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  if (list) delete list.dataset.renderedVariant;
  _renderA11yElementoMobileFields();
}
window.updateA11yElementoMobileVariant = updateA11yElementoMobileVariant;

// Campos exclusivos de "Elementos e Imagens" mobile — bloco inteiro
// reconstruído a cada troca de sub-variante (componente / link / texto
// alternativo), refletindo a árvore real do component set mobile (ver
// refs/design-acessivel-mobile-link-property.json). O toggle "Nome
// Acessível" que existia aqui até 2026-09 foi REMOVIDO (duplicava o campo
// "Label (accessibilityLabel)" sempre visível no topo do formulário,
// #a11y-el-label — ver comentário em _renderA11yElementoMobileFields):
//   - "componente": Descrição/Dica Leitor de Tela/Observação (toggles
//     opcionais, cada um com textarea) + Link do Componente (SEMPRE
//     visível, sem toggle — dropdown de 64 nomes + URL obrigatória).
//   - "link": Descrição fixa e travada (A11Y_CONTENT.elemento.mobileLink) +
//     Observação opcional. Sem Dica Leitor de Tela, sem Link do Componente
//     (não existem nessa variante na lib real).
//   - "texto alternativo": Descrição é textarea LIVRE OBRIGATÓRIA (o alt-text
//     real da mídia) + Observação opcional. Sem Dica, sem Link do
//     Componente.
// Visibilidade do bloco inteiro decidida por modal.dataset.a11yOrigin
// ('mobile'), setado por openA11yModal — nunca aparece em specs web, porque
// o wrapper real desktop ("[a11y] Box specs LT") não tem essa sub-variação.
function _renderA11yElementoMobileFields() {
  const modal = document.getElementById('a11y-spec-modal');
  const wrap = document.getElementById('a11y-el-mobile-toggles-wrap');
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  const variantWrap = document.getElementById('a11y-el-mobile-variant-wrap');
  if (!wrap || !list) return;
  const isMobile = modal && modal.dataset.a11yOrigin === 'mobile';
  wrap.classList.toggle('hidden', !isMobile);
  if (variantWrap) variantWrap.classList.toggle('hidden', !isMobile);
  if (!isMobile) { list.innerHTML = ''; return; }

  const variant = _getA11yElementoMobileVariant();
  // O bloco desktop (catálogo de 16 categorias) nunca fica visível/ativo
  // simultaneamente a este bloco (ver _toggleA11yElementoDesktopBlock) —
  // decisão de produto "a origem filtra tudo" (2026-09): a lib mobile é a
  // única fonte pra specs mobile. Os toggles mobile (Descrição/Dica Leitor
  // de Tela/Observação) são sempre renderizados, sem checagem de duplicidade
  // contra o catálogo desktop — catalogToggleKeys foi removido junto com
  // essa checagem.
  //
  // "Nome Acessível" NÃO é mais renderizado aqui (removido em 2026-09):
  // duplicava o campo "Label (accessibilityLabel)" sempre visível no topo do
  // formulário (#a11y-el-label) — os dois alimentavam o mesmo conceito de
  // texto acessível do elemento (aria-label/accessibilityLabel) e, no
  // fallback procedural (que é o caminho real hoje pra specs mobile
  // "elemento" comuns, já que não existe wrapper mobile real cadastrado em
  // A11Y_CONTENT — ver _tryImportA11yComponent, code.js), apareciam como
  // DUAS linhas separadas e redundantes no card. Ver
  // _restoreA11yElementoMobileToggles/_prefillA11ySpecForEdit para a
  // migração que herda o valor salvo de specs antigas com
  // properties['nomeAcessivel'] de volta pro campo Label do topo.
  // Reconstrói sempre que a variante mudar de fato — guarda no dataset da
  // própria lista pra não perder o texto digitado em rerenders triviais.
  const renderKey = variant;
  if (list.dataset.renderedVariant === renderKey && list.childElementCount > 0) return;
  list.dataset.renderedVariant = renderKey;
  list.innerHTML = '';

  const toggleRowHtml = (key, label, placeholder) => {
    const max = A11Y_TOGGLE_MAXLENGTH[key] || A11Y_TOGGLE_MAXLENGTH_DEFAULT;
    return `
    <div class="bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-xl overflow-hidden">
      <label class="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none">
        <input type="checkbox" data-a11y-toggle-key="${key}"
          onchange="_onA11yElementoToggleChange(this)"
          class="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer shrink-0" />
        <span class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(label)}</span>
      </label>
      <div class="hidden px-3 pb-3" data-a11y-toggle-textarea-wrap>
        <textarea data-a11y-toggle-value maxlength="${max}" rows="2" placeholder="${escapeHtml(placeholder)}"
          oninput="updateA11yCharCounterEl(this, this.nextElementSibling)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg px-2.5 py-2 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all resize-none"></textarea>
        <span class="block text-right text-[9px] text-slate-400 dark:text-dark-muted mt-0.5">0/${max}</span>
      </div>
    </div>`;
  };

  if (variant === A11Y_ELEMENTO_MOBILE_VARIANTS.link) {
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'space-y-2.5';
    wrapDiv.innerHTML = `
      <div class="p-3 bg-gray-50 dark:bg-dark-bg rounded-xl border border-gray-200 dark:border-dark-line">
        <p class="text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider mb-1">Descrição (fixa)</p>
        <p class="text-[12px] text-slate-700 dark:text-white leading-snug">${escapeHtml(A11Y_CONTENT.elemento.mobileLink.descricao)}</p>
      </div>
      ${toggleRowHtml('observacoes', A11Y_TOGGLE_LABELS.observacoes, 'Insira seu texto de observações.')}
    `;
    list.appendChild(wrapDiv);
  } else if (variant === A11Y_ELEMENTO_MOBILE_VARIANTS.textoAlternativo) {
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'space-y-2.5';
    wrapDiv.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-1.5 ml-1">
          <label for="a11y-el-mobile-alt-descricao" class="block text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider">Descrição (texto alternativo) *</label>
          <span id="a11y-el-mobile-alt-descricao-counter" class="text-[9px] text-slate-400 dark:text-dark-muted shrink-0">0/180</span>
        </div>
        <textarea id="a11y-el-mobile-alt-descricao" maxlength="180" rows="2" placeholder="Insira aqui o texto alternativo da imagem/mídia."
          oninput="updateA11yCharCounter(this)"
          class="w-full bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-xl px-3 py-2.5 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all resize-none"></textarea>
      </div>
      ${toggleRowHtml('observacoes', A11Y_TOGGLE_LABELS.observacoes, 'Insira seu texto de observações.')}
    `;
    list.appendChild(wrapDiv);
  } else {
    // "componente" — toggles opcionais (Dica Leitor de Tela vem de
    // A11Y_MOBILE_ONLY_TOGGLES; Observação reaproveita o rótulo canônico do
    // catálogo desktop, sempre renderizado, já que o catálogo desktop nunca
    // compartilha tela com este bloco) + Link do Componente sempre visível.
    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'space-y-2.5';
    wrapDiv.innerHTML = [
      ...A11Y_MOBILE_ONLY_TOGGLES.map(t => toggleRowHtml(t.key, t.label, t.placeholder)),
      toggleRowHtml('observacoes', A11Y_TOGGLE_LABELS.observacoes, 'Insira seu texto de observações.'),
    ].join('');
    list.appendChild(wrapDiv);

    // Link do Componente — sempre visível, sem toggle (reflete a árvore real
    // do Figma: a instância "Link do componente" não tem visible vinculado a
    // nenhum BOOLEAN, ver estruturaCompletaVarianteElementosEImagens no JSON
    // extraído). Dropdown de 64 nomes fixos (default "Personalizado") + campo
    // de texto livre obrigatório (companheiro do dropdown).
    // "Personalizado" (default real da property, confirmado via REST API em
    // refs/design-acessivel-mobile-link-property.json) É o equivalente mobile
    // do "Outro (fora do catálogo)" desktop: quando o designer não encontra o
    // componente real nas 64 opções, deixa "Personalizado" selecionado e usa
    // o campo de texto livre abaixo pra documentar o NOME REAL do componente
    // não mapeado — sinal formal pra vertical de a11y criar essa spec na lib.
    // Reaproveita a mesma key 'linkComponente'/'linkComponenteNome' de sempre
    // (ver _collectA11yElementoMobileToggleProperties) — não precisou criar
    // campo novo, só deixar o rótulo/placeholder explícitos sobre esse uso.
    // Pré-seleção automática (UX, 2026-09): se o nome do componente DSC já
    // resolvido pelo backend (modal.dataset.dscComponentName, ex: "[dsc] Top
    // App Bar") bater EXATAMENTE — após limpar o prefixo "[dsc]" — com uma
    // das 64 opções fixas, usa essa opção como default em vez de
    // "Personalizado". Match exato apenas (case-insensitive/trim, sem
    // aproximação por substring: nomes reais divergem editorialmente da
    // lista curada em vários casos — ex. "[dsc] Chip" vs "Chips", "[dsc]
    // Text Field Single" vs "Input/Text Field - Single" — e não há como
    // resolver isso com heurística segura, mesma razão pela qual
    // A11Y_MOBILE_COMPONENT_LINK_NODE_IDS também só cobre 46/64 por nome
    // exato). Só entra em specs NOVAS: em edição, _restoreA11yElementoMobileToggles
    // roda DEPOIS deste render e sobrescreve linkSelect.value com o dado
    // salvo (sub.linkComponenteNome), então a escolha do designer sempre
    // prevalece.
    const dscNameRaw = modal ? modal.dataset.dscComponentName : '';
    const dscNameClean = dscNameRaw ? _cleanDscContainingFrameName(dscNameRaw).trim().toLowerCase() : '';
    const autoMatchedOption = dscNameClean
      ? A11Y_MOBILE_LINK_COMPONENT_OPTIONS.find(name => name.trim().toLowerCase() === dscNameClean) || null
      : null;
    const linkOptionsHtml = A11Y_MOBILE_LINK_COMPONENT_OPTIONS
      .map(name => {
        const isSelected = autoMatchedOption ? name === autoMatchedOption : name === 'Personalizado';
        return `<option value="${escapeHtml(name)}"${isSelected ? ' selected' : ''}>${escapeHtml(name)}</option>`;
      })
      .join('');
    const linkRow = document.createElement('div');
    linkRow.className = 'bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-xl p-3 space-y-2';
    linkRow.innerHTML = `
      <p class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(A11Y_TOGGLE_LABELS.linkComponente)}</p>
      <div>
        <label for="a11y-el-mobile-link-select" class="block text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider mb-1.5 ml-1">Componente do DSC (escolha "Personalizado" se não encontrar)</label>
        <select id="a11y-el-mobile-link-select"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg px-2.5 py-2 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all">
          ${linkOptionsHtml}
        </select>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1.5 ml-1">
          <label for="a11y-el-mobile-link-url" class="block text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider">Link ou nome do componente *</label>
          <span id="a11y-el-mobile-link-url-counter" class="text-[9px] text-slate-400 dark:text-dark-muted shrink-0">0/300</span>
        </div>
        <input type="text" id="a11y-el-mobile-link-url" maxlength="300" placeholder="${escapeHtml(A11Y_MOBILE_LINK_URL_PLACEHOLDER)}"
          oninput="updateA11yCharCounter(this)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg px-2.5 py-2 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all" />
        <p id="a11y-el-mobile-link-url-lock-hint" class="hidden flex items-center gap-1 mt-1 ml-1 text-[9px] text-slate-400 dark:text-dark-muted">
          <i data-lucide="lock" class="w-2.5 h-2.5"></i> Preenchido automaticamente a partir do componente do DSC — escolha "Personalizado" acima para editar.
        </p>
      </div>
    `;
    list.appendChild(linkRow);
    _refreshIcons(linkRow);

    // Auto-preenchimento do link a partir do nome escolhido (ver
    // _autofillA11yMobileLinkUrlFromComponentName) — só reage a interação
    // real do usuário: atribuição direta de select.value (ex: restauração em
    // modo edição, _restoreA11yElementoMobileToggles) NÃO dispara 'change',
    // então não sobrescreve valores salvos. O listener também reavalia o
    // lock (_syncA11yMobileLinkUrlLockState) a cada troca manual do select.
    const linkSelectEl = linkRow.querySelector('#a11y-el-mobile-link-select');
    if (linkSelectEl) linkSelectEl.addEventListener('change', _autofillA11yMobileLinkUrlFromComponentName);

    // Se a pré-seleção automática encontrou match, preenche a URL de bônus
    // já nesta primeira renderização (equivalente a disparar o 'change' que
    // o designer disparia manualmente). Em modo edição isso é inofensivo: a
    // restauração de dados salvos (_restoreA11yElementoMobileToggles, ver
    // openA11yModal/editA11ySpec) roda DEPOIS, sobrescreve select/URL com os
    // valores da spec original e reaplica o lock por conta própria.
    if (autoMatchedOption) _autofillA11yMobileLinkUrlFromComponentName();
    else _syncA11yMobileLinkUrlLockState();
  }
}

// Lê os toggles mobile ligados com texto preenchido de volta em
// properties[], mais o campo de Descrição livre (variante "texto
// alternativo") e o Link do Componente (variante "componente", sempre
// visível) — chamado por confirmA11ySpec. `linkComponente` só entra quando o
// campo de URL está preenchido (obrigatório na variante "componente"); o
// `select` de nome do componente vai junto como `linkComponenteNome`, mesmo
// no default "Personalizado".
function _collectA11yElementoMobileToggleProperties() {
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  if (!list) return [];
  const result = [];
  list.querySelectorAll('[data-a11y-toggle-key]').forEach(checkbox => {
    if (!checkbox.checked) return;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    const ta = wrap ? wrap.querySelector('[data-a11y-toggle-value]') : null;
    const value = ta ? ta.value.trim() : '';
    if (!value) return;
    const key = checkbox.getAttribute('data-a11y-toggle-key');
    result.push({ key, label: A11Y_TOGGLE_LABELS[key] || key, value });
  });

  const altDescricao = document.getElementById('a11y-el-mobile-alt-descricao');
  if (altDescricao && altDescricao.value.trim()) {
    result.push({ key: 'descricao', label: 'Descrição', value: altDescricao.value.trim() });
  }

  const linkSelect = document.getElementById('a11y-el-mobile-link-select');
  const linkUrl = document.getElementById('a11y-el-mobile-link-url');
  if (linkUrl && linkUrl.value.trim()) {
    if (linkSelect) result.push({ key: 'linkComponenteNome', label: 'Componente do DSC (Link)', value: linkSelect.value });
    result.push({ key: 'linkComponente', label: A11Y_TOGGLE_LABELS.linkComponente, value: linkUrl.value.trim() });
  }

  return result;
}

// Inverso de _collectA11yElementoMobileToggleProperties — usado em
// _prefillA11ySpecForEdit. Precisa que _renderA11yElementoMobileFields já
// tenha rodado (o formulário de edição já é aberto com dataset.a11yOrigin
// setado, ver editA11ySpec) pra achar os campos na DOM. Chamada DEPOIS de
// `setVal('a11y-el-label', getProp('label'))` (ver _prefillA11ySpecForEdit)
// — ordem relevante pro fallback de 'nomeAcessivel' abaixo.
function _restoreA11yElementoMobileToggles(props) {
  const list = document.getElementById('a11y-el-mobile-toggles-list');
  if (!list) return;
  const mobileToggleKeys = new Set(A11Y_MOBILE_ONLY_TOGGLES.map(t => t.key).concat(['observacoes']));
  (props || []).forEach(p => {
    if (!p) return;
    // Migração: specs mobile ANTIGAS podiam ter properties['nomeAcessivel']
    // preenchido pelo toggle "Nome Acessível" removido em 2026-09 (duplicava
    // o campo "Label (accessibilityLabel)" sempre visível no topo do
    // formulário). Ao reabrir pra edição, o valor volta a aparecer — agora
    // no campo Label do topo — sem perder dado. Só entra se o Label ainda
    // estiver vazio (não sobrescreve um valor de Label já salvo na mesma
    // spec — cenário legado em que os dois campos coexistiam preenchidos).
    if (p.key === 'nomeAcessivel') {
      const labelInput = document.getElementById('a11y-el-label');
      if (labelInput && !labelInput.value.trim()) { labelInput.value = p.value || ''; updateA11yCharCounter(labelInput); }
      return;
    }
    if (mobileToggleKeys.has(p.key)) {
      const checkbox = list.querySelector(`[data-a11y-toggle-key="${p.key}"]`);
      if (!checkbox) return;
      checkbox.checked = true;
      const row = checkbox.closest('div');
      const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
      if (wrap) {
        wrap.classList.remove('hidden');
        const ta = wrap.querySelector('[data-a11y-toggle-value]');
        if (ta) { ta.value = p.value || ''; updateA11yCharCounterEl(ta, ta.nextElementSibling); }
      }
      return;
    }
    if (p.key === 'descricao') {
      const altDescricao = document.getElementById('a11y-el-mobile-alt-descricao');
      if (altDescricao) { altDescricao.value = p.value || ''; updateA11yCharCounter(altDescricao); }
      return;
    }
    if (p.key === 'linkComponente') {
      const linkUrl = document.getElementById('a11y-el-mobile-link-url');
      if (linkUrl) { linkUrl.value = p.value || ''; updateA11yCharCounter(linkUrl); }
      return;
    }
    if (p.key === 'linkComponenteNome') {
      const linkSelect = document.getElementById('a11y-el-mobile-link-select');
      if (linkSelect) linkSelect.value = p.value || 'Personalizado';
    }
  });
  // Atribuição direta de .value acima não dispara 'change' — reaplica o
  // lock aqui pra refletir o estado final restaurado (select.value pode ter
  // sido setado antes ou depois de linkUrl.value neste forEach, dependendo
  // da ordem em que a spec salvou 'linkComponenteNome'/'linkComponente').
  _syncA11yMobileLinkUrlLockState();
}

// Menu customizado do "Componente" — o <select> nativo escondido continua
// sendo a fonte de valor (updateA11yElementoFields/confirmA11ySpec leem
// .value dele), esse popover é só a camada visual, pra garantir que abre
// sempre pra baixo (um <select> nativo decide sozinho, sem controle via CSS,
// e dentro da modal abria pra cima por falta de espaço).
let _a11yComponenteMenuCloseHandlers = null;

function toggleA11yComponenteMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('a11y-el-componente-menu');
  const trigger = document.getElementById('a11y-el-componente-trigger');
  if (!menu) return;
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) { closeA11yComponenteMenu(); return; }
  menu.classList.remove('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'true');
  const close = (ev) => {
    const wrap = trigger ? trigger.parentElement : null;
    if (!wrap || !wrap.contains(ev.target)) closeA11yComponenteMenu();
  };
  const onEsc = (ev) => { if (ev.key === 'Escape') closeA11yComponenteMenu(); };
  _a11yComponenteMenuCloseHandlers = { close, onEsc };
  setTimeout(() => {
    document.addEventListener('click', close, true);
    document.addEventListener('keydown', onEsc, true);
  }, 0);
}
window.toggleA11yComponenteMenu = toggleA11yComponenteMenu;

function closeA11yComponenteMenu() {
  const menu = document.getElementById('a11y-el-componente-menu');
  const trigger = document.getElementById('a11y-el-componente-trigger');
  if (menu) menu.classList.add('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  if (_a11yComponenteMenuCloseHandlers) {
    document.removeEventListener('click', _a11yComponenteMenuCloseHandlers.close, true);
    document.removeEventListener('keydown', _a11yComponenteMenuCloseHandlers.onEsc, true);
    _a11yComponenteMenuCloseHandlers = null;
  }
}
window.closeA11yComponenteMenu = closeA11yComponenteMenu;

function selectA11yComponente(value) {
  const select = document.getElementById('a11y-el-componente-select');
  if (select) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }
  closeA11yComponenteMenu();
}
window.selectA11yComponente = selectA11yComponente;

function prefillA11yComponentName(name, mainText, dscComponentName) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  // "Camada no canvas"/"Componente DSC" (read-only, comuns às 5 categorias) —
  // populados aqui independente da categoria aberta, ao contrário do restante
  // desta função (Label/Componente do select), que só existe em "elemento".
  // Resposta assíncrona de get-selection-name (fluxo manual); fluxo
  // automático já resolve os 2 no momento de abrir o modal (openA11yModal),
  // sem passar por aqui.
  const targetNodeNameEl = document.getElementById('a11y-modal-target-node-name');
  if (targetNodeNameEl && name) targetNodeNameEl.textContent = name;
  if (dscComponentName) {
    _renderA11yModalDscComponentName('a11y-modal-dsc-component-name', dscComponentName, modal.dataset.a11yOrigin || 'web');
  }
  if (modal.dataset.category !== 'elemento') return;
  // Label a partir do texto real do elemento (ver _findMainTextContent,
  // code.js) — independente do Componente ter sido reconhecido ou não, e
  // sem sobrescrever se o designer já digitou algo.
  _fillA11yLabelIfEmpty(mainText);
  // Em modo edição (editA11ySpec) o formulário já foi preenchido com os
  // dados salvos da spec — o nome do que estiver selecionado no canvas
  // nesse momento é irrelevante e não pode pisar num "Componente" do
  // catálogo já escolhido (a resposta assíncrona de get-selection-name
  // chegaria depois do prefill síncrono e trocaria pra "Outro" silenciosamente).
  if (modal.dataset.editingSpecId) return;
  // Mesma lógica de proteção do modo edição: se o formulário foi aberto com
  // um componente pré-selecionado (botão da Detecção Automática), o nome do
  // canvas não pode trocar o select pra "Outro" por cima da sugestão já
  // escolhida.
  if (modal.dataset.presetComponente) return;
  // Specs mobile não usam mais o select/"Outro" desktop (bloco escondido, ver
  // _toggleA11yElementoDesktopBlock) — nada aqui pra pré-preencher a partir
  // do nome do canvas; o designer identifica o componente pelo dropdown
  // "Link do Componente" mobile manualmente.
  if (modal.dataset.a11yOrigin === 'mobile') return;
  const outro = document.getElementById('a11y-el-componente-outro');
  const select = document.getElementById('a11y-el-componente-select');
  // Nome do canvas raramente bate com uma chave do catálogo — cai sempre em
  // "Outro" com o nome pré-preenchido, o designer troca pro item certo se
  // reconhecer o componente na lista.
  if (select && outro && !outro.value && name) {
    select.value = 'outro';
    outro.value = name;
    updateA11yCharCounter(outro);
    updateA11yElementoFields();
  }
}
window.prefillA11yComponentName = prefillA11yComponentName;

// Escreve o texto real do elemento (primeiro TEXT visível encontrado no
// canvas, ver _findMainTextContent em code.js) no campo Label, só se ele
// ainda estiver vazio — nunca sobrescreve o que o designer já digitou.
function _fillA11yLabelIfEmpty(mainText) {
  if (!mainText) return;
  const labelInput = document.getElementById('a11y-el-label');
  if (labelInput && !labelInput.value.trim()) { labelInput.value = mainText; updateA11yCharCounter(labelInput); }
}

// Resposta de 'get-node-main-text' — mesmo preenchimento condicional de
// _fillA11yLabelIfEmpty, só que a partir de um nodeId específico, não da
// seleção atual do canvas. Código morto no Handex desde a remoção do fluxo
// individual "Usar sugestão" (nenhum caminho do frontend envia mais
// 'get-node-main-text'); mantido aqui como stub mínimo funcional só porque
// messages.js do hac ainda referencia essa função no roteamento de
// 'node-main-text'.
function prefillA11yLabelFromMainText(mainText) {
  const modal = document.getElementById('a11y-spec-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (modal.dataset.category !== 'elemento') return;
  _fillA11yLabelIfEmpty(mainText);
}
window.prefillA11yLabelFromMainText = prefillA11yLabelFromMainText;

// ── Toggles dinâmicos genéricos (Título/Decorativo/Estrutura/Informações) ──
// Mesmo padrão de _renderA11yElementoToggles/_collectA11yElementoToggleProperties/
// _restoreA11yElementoToggles, mas parametrizado por wrapId/listId/shortName
// em vez de fixo em "a11y-el-*" — usado pelas 4 categorias que não têm um
// <select> de "Componente" dinâmico. Reaproveita _getA11yComponentToggles
// inteiramente: essa função já faz `_A11Y_SELECT_TO_SHORTNAME[selectValue] ||
// selectValue`, então passar o shortName exato do catálogo (ex: 'niveis de
// titulo', 'ED gerais') cai direto no fallback `|| selectValue` e funciona
// sem nenhuma mudança lá.
function _renderA11yFixedToggles(wrapId, listId, shortName) {
  const wrap = document.getElementById(wrapId);
  const list = document.getElementById(listId);
  if (!wrap || !list) return;
  list.innerHTML = '';

  const info = shortName ? _getA11yComponentToggles(shortName) : null;
  const toggles = (info && info.toggles) || [];
  wrap.classList.toggle('hidden', toggles.length === 0);
  if (toggles.length === 0) return;

  toggles.forEach(t => {
    const max = A11Y_TOGGLE_MAXLENGTH[t.key] || A11Y_TOGGLE_MAXLENGTH_DEFAULT;
    const row = document.createElement('div');
    row.className = 'bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-line rounded-xl overflow-hidden';
    row.innerHTML = `
      <label class="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none">
        <input type="checkbox" data-a11y-toggle-key="${t.key}"
          onchange="_onA11yElementoToggleChange(this)"
          class="w-4 h-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer shrink-0" />
        <span class="text-[12px] font-bold text-slate-700 dark:text-white">${escapeHtml(t.label)}</span>
      </label>
      <div class="hidden px-3 pb-3" data-a11y-toggle-textarea-wrap>
        <textarea data-a11y-toggle-value maxlength="${max}" rows="2" placeholder="Insira seu texto de ${escapeHtml(t.label.toLowerCase())}."
          oninput="updateA11yCharCounterEl(this, this.nextElementSibling)"
          class="w-full bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-line rounded-lg px-2.5 py-2 text-[12px] text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-cyan-100 transition-all resize-none"></textarea>
        <span class="block text-right text-[9px] text-slate-400 dark:text-dark-muted mt-0.5">0/${max}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

// Lê os toggles ligados com texto preenchido de volta em properties[] — mesma
// mecânica de _collectA11yElementoToggleProperties, parametrizada por listId.
function _collectA11yFixedToggleProperties(listId) {
  const list = document.getElementById(listId);
  if (!list) return [];
  const result = [];
  list.querySelectorAll('[data-a11y-toggle-key]').forEach(checkbox => {
    if (!checkbox.checked) return;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    const ta = wrap ? wrap.querySelector('[data-a11y-toggle-value]') : null;
    const value = ta ? ta.value.trim() : '';
    if (!value) return;
    const key = checkbox.getAttribute('data-a11y-toggle-key');
    result.push({ key, label: A11Y_TOGGLE_LABELS[key] || key, value });
  });
  return result;
}

// Inverso de _collectA11yFixedToggleProperties — usado em
// _prefillA11ySpecForEdit pra religar os toggles salvos com o texto de volta.
function _restoreA11yFixedToggles(listId, props) {
  const list = document.getElementById(listId);
  if (!list) return;
  const canonicalKeys = new Set(Object.keys(A11Y_TOGGLE_LABELS));
  (props || []).forEach(p => {
    if (!p || !canonicalKeys.has(p.key)) return;
    const checkbox = list.querySelector(`[data-a11y-toggle-key="${p.key}"]`);
    if (!checkbox) return;
    checkbox.checked = true;
    const row = checkbox.closest('div');
    const wrap = row ? row.querySelector('[data-a11y-toggle-textarea-wrap]') : null;
    if (wrap) {
      wrap.classList.remove('hidden');
      const ta = wrap.querySelector('[data-a11y-toggle-value]');
      if (ta) { ta.value = p.value || ''; updateA11yCharCounterEl(ta, ta.nextElementSibling); }
    }
  });
}

// ── Estrutura da Página ──────────────────────────────────────────────────
// Seletor em até 2 níveis: subtipo (idiomas / marco de navegação / título da
// página / customizável) e, quando aplicável, o subtipo específico.
function updateA11yEstruturaFields() {
  const subtipo = document.getElementById('a11y-estrutura-subtipo-select');
  if (!subtipo) return;
  const val = subtipo.value;

  const idiomasWrap = document.getElementById('a11y-estrutura-idiomas-wrap');
  const marcoWrap = document.getElementById('a11y-estrutura-marco-wrap');
  if (idiomasWrap) idiomasWrap.classList.toggle('hidden', val !== 'idiomas');
  if (marcoWrap) marcoWrap.classList.toggle('hidden', val !== 'marco de navegacao');

  let entry = null;
  let isCustomizavel = val === 'customizavel';
  if (val === 'idiomas') {
    const sub = document.getElementById('a11y-estrutura-idiomas-select');
    entry = A11Y_CONTENT.estrutura.idiomas[sub ? sub.value : 'da pagina'];
  } else if (val === 'marco de navegacao') {
    const sub = document.getElementById('a11y-estrutura-marco-select');
    const subVal = sub ? sub.value : 'header';
    if (subVal === 'customizavel') {
      isCustomizavel = true;
    } else {
      entry = A11Y_CONTENT.estrutura.marco[subVal];
    }
  } else if (val === 'titulo da pagina') {
    entry = A11Y_CONTENT.estrutura.tituloPagina;
  }
  if (isCustomizavel) entry = A11Y_CONTENT.estrutura.customizavel;

  const descInput = document.getElementById('a11y-estrutura-descricao');
  const notaWrap = document.getElementById('a11y-estrutura-nota-wrap');
  const notaEl = document.getElementById('a11y-estrutura-nota');
  if (descInput) {
    descInput.readOnly = !isCustomizavel;
    descInput.classList.toggle('bg-gray-50', !isCustomizavel);
    descInput.classList.toggle('dark:bg-dark-bg', !isCustomizavel);
    // Só reescreve o valor quando o campo é somente-leitura — em modo
    // customizável não sobrescreve o que o designer já digitou.
    if (!isCustomizavel) descInput.value = (entry && entry.descricao) || '';
    else if (!descInput.value) descInput.value = (entry && entry.descricao) || '';
    // Contador só faz sentido quando o campo é digitável (customizável) — nos
    // demais subtipos o texto é curado pela lib, sem limite prático de UX.
    const counter = document.getElementById('a11y-estrutura-descricao-counter');
    if (counter) counter.classList.toggle('hidden', !isCustomizavel);
    updateA11yCharCounter(descInput);
  }
  if (notaWrap) notaWrap.classList.toggle('hidden', !(entry && entry.notasCodigo));
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';

  // Toggles dos sub-níveis reais ("EE idiomas": notas+observacoes; "EE marco
  // de navegacao": observacoes) — só existem quando o import real é possível
  // ("customizavel" no nível 1 e "customizavel" dentro de marco de navegação
  // não têm componente catalogado).
  let _estruturaToggleShortName = null;
  if (!isCustomizavel) {
    if (val === 'idiomas') _estruturaToggleShortName = 'EE idiomas';
    else if (val === 'marco de navegacao') _estruturaToggleShortName = 'EE marco de navegacao';
    // "titulo da pagina" não tem sub-nível catalogado — permanece null.
  }
  _renderA11yFixedToggles('a11y-estrutura-toggles-wrap', 'a11y-estrutura-toggles-list', _estruturaToggleShortName);
}
window.updateA11yEstruturaFields = updateA11yEstruturaFields;

// ── Nível de Título ──────────────────────────────────────────────────────
// H1-H6 (web) ou "H (mobile)" fixo — cada nível tem Descrição própria; só o
// modo mobile também tem Nota de Código (accessibilityRole="header").
function updateA11yTituloFields() {
  const select = document.getElementById('a11y-titulo-nivel-select');
  if (!select) return;
  const isMobile = select.value === 'mobile';
  const entry = isMobile ? A11Y_CONTENT.titulo.mobile : A11Y_CONTENT.titulo.niveis[select.value];

  const descEl = document.getElementById('a11y-fixed-descricao');
  const notaWrap = document.getElementById('a11y-fixed-nota-wrap');
  const notaEl = document.getElementById('a11y-fixed-nota');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  if (notaWrap) notaWrap.classList.toggle('hidden', !isMobile);
  if (notaEl) notaEl.textContent = (isMobile && entry && entry.notaCodigo) || '';

  // Toggle real do component set "niveis de titulo" (só "observacoes").
  // Modo mobile ("H", sem nível) não tem componente real catalogado, então
  // não faz sentido mostrar o campo — cai sempre no card procedural.
  _renderA11yFixedToggles('a11y-titulo-toggles-wrap', 'a11y-titulo-toggles-list', isMobile ? null : 'niveis de titulo');
}
window.updateA11yTituloFields = updateA11yTituloFields;

// ── Elemento Decorativo ──────────────────────────────────────────────────
// Sub-select entre "Gerais" e "Imagem" — mesma Descrição, Nota de Código
// diferente (alt="" em HTML pra imagem, anotação genérica pra gerais). Cada
// subtipo abre um component set PRÓPRIO com toggles diferentes.
const _A11Y_DECORATIVO_SHORTNAME = { gerais: 'ED gerais', imagem: 'ED imagem' };

function updateA11yDecorativoFields() {
  const select = document.getElementById('a11y-decorativo-subtipo-select');
  if (!select) return;
  const entry = A11Y_CONTENT.decorativo[select.value];
  const descEl = document.getElementById('a11y-fixed-descricao-dec');
  const notaEl = document.getElementById('a11y-fixed-nota-dec');
  if (descEl) descEl.textContent = (entry && entry.descricao) || '';
  if (notaEl) notaEl.textContent = (entry && entry.notasCodigo) || '';

  _renderA11yFixedToggles('a11y-decorativo-toggles-wrap', 'a11y-decorativo-toggles-list', _A11Y_DECORATIVO_SHORTNAME[select.value] || null);
}
window.updateA11yDecorativoFields = updateA11yDecorativoFields;

// ── Informações Adicionais ───────────────────────────────────────────────
// Sub-select entre "Handoffs" / "Conteúdo extra" / "Customizável" — sem Nota
// de Código nessa categoria (só Descrição + Observações).
function updateA11yInformacoesFields() {
  const select = document.getElementById('a11y-informacoes-subtipo-select');
  if (!select) return;
  const isCustomizavel = select.value === 'customizavel';
  const key = select.value === 'conteudo extra' ? 'conteudoExtra' : select.value;
  const entry = A11Y_CONTENT.informacoes[key];

  const descInput = document.getElementById('a11y-informacoes-descricao');
  if (descInput) {
    descInput.readOnly = !isCustomizavel;
    descInput.classList.toggle('bg-gray-50', !isCustomizavel);
    descInput.classList.toggle('dark:bg-dark-bg', !isCustomizavel);
    if (!isCustomizavel) descInput.value = (entry && entry.descricao) || '';
    else if (!descInput.value) descInput.value = (entry && entry.descricao) || '';
    const counter = document.getElementById('a11y-informacoes-descricao-counter');
    if (counter) counter.classList.toggle('hidden', !isCustomizavel);
    updateA11yCharCounter(descInput);
  }

  // "Customizável" não tem componente real catalogado — sem sentido mostrar
  // o toggle, cai sempre no card procedural.
  _renderA11yFixedToggles('a11y-informacoes-toggles-wrap', 'a11y-informacoes-toggles-list', isCustomizavel ? null : 'informações adicionais');
}
window.updateA11yInformacoesFields = updateA11yInformacoesFields;

// Ponto único de fechamento do modal — X, clique no backdrop e Esc (genérico,
// ver core.js) chamam esta função diretamente. Também é chamada pelo
// caminho de SUCESSO em confirmA11ySpec (botão "Aplicar"), que por isso
// limpa modal.dataset.wizardActive ANTES de chamar closeA11yModal — só
// quando o dataset ainda diz '1' aqui é que o fechamento é "externo"
// (usuário abandonando o formulário sem confirmar), e é isso que deve
// acionar stopA11yBatchWizard.
// O botão "Cancelar" do formulário NÃO chama mais isto direto — chama
// cancelA11yModalExplicit() logo abaixo, que repassa viaExplicitCancelButton
// = true pra stopA11yBatchWizard. Essa distinção existe só pra decidir se o
// snackbar de retomada da revisão aparece: clique em "Cancelar" é intenção
// clara de parar (sem oferta de retomar); X/backdrop/Esc podem ser
// acidentais (oferece retomar via snackbar). Ver stopA11yBatchWizard.
function closeA11yModal() {
  const modal = document.getElementById('a11y-spec-modal');
  const wasWizardActive = modal && modal.dataset.wizardActive === '1';
  closeModal('a11y-spec-modal');
  if (wasWizardActive && window._a11yBatchWizardState) {
    stopA11yBatchWizard(false);
  }
}
window.closeA11yModal = closeA11yModal;

// Chamado só pelo botão "Cancelar" do formulário — ver comentário acima de
// closeA11yModal pra por que a distinção existe.
function cancelA11yModalExplicit() {
  const modal = document.getElementById('a11y-spec-modal');
  const wasWizardActive = modal && modal.dataset.wizardActive === '1';
  closeModal('a11y-spec-modal');
  if (wasWizardActive && window._a11yBatchWizardState) {
    stopA11yBatchWizard(true);
  }
}
window.cancelA11yModalExplicit = cancelA11yModalExplicit;

// Ponte de request/response com o backend para pegar {id, name} da seleção
// atual no canvas — usada por "Marcar Área" (confirmA11yArea, que cria um
// selo perto do elemento) e pelo pré-preenchimento cosmético do nome do
// componente em openA11yModal. confirmA11ySpec NÃO usa mais isso:
// create-unified-spec usa a seleção atual do canvas direto no backend. Só
// existe um pedido pendente por vez (não há fila): se um novo pedido for
// feito antes do anterior responder, o resolver antigo é perdido
// silenciosamente — cenário improvável nesse fluxo (um modal por vez).
function _getA11ySelectionInfo() {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (window._a11ySelectionInfoResolve === resolve_) window._a11ySelectionInfoResolve = null;
      resolve(value);
    };
    // Timeout de segurança — se a resposta do backend nunca chegar, o botão
    // não pode ficar preso pra sempre esperando.
    const timeoutId = setTimeout(() => finish(null), 4000);
    const resolve_ = (value) => { clearTimeout(timeoutId); finish(value); };
    window._a11ySelectionInfoResolve = resolve_;
    parent.postMessage({ pluginMessage: { type: 'get-a11y-selection-info' } }, '*');
  });
}
window._getA11ySelectionInfo = _getA11ySelectionInfo;

// ── Payload puro de "Elementos e Imagens" (fluxo WEB) ───────────────────
// Usado pelo fluxo manual (confirmA11ySpec, categoria 'elemento', origem
// web, fora do caso "Outro") — recebe os dados JÁ RESOLVIDOS (nunca lê do
// DOM) e devolve { letter, properties, a11ySubtype } no mesmo formato que
// confirmA11ySpec monta pra 'create-unified-spec'. O wizard de revisão da
// Detecção Automática NÃO usa este builder — ele reaproveita o próprio
// formulário manual (openA11yModal/confirmA11ySpec) item a item, então os
// dados vêm sempre do DOM preenchido pelo designer, igual ao fluxo manual
// normal. Specs mobile não passam mais por aqui (ver branch `isMobile` em
// confirmA11ySpec, que monta o payload direto a partir de
// linkComponente/variant, sem depender do catálogo desktop).
//
// options:
//   componenteKey  chave do catálogo (ex: 'accordion') — nunca "outro" aqui.
//   label          valor de accessibilityLabel digitado pelo designer.
//   tipo           variante secundária (ex: Button → "de icone"), lida do
//                  <select> dinâmico correspondente quando existe.
//   toggleProperties  array já no formato properties[] ({key,label,value})
//                  dos toggles dinâmicos ligados.
function _buildA11yElementoPayload(letter, componenteKey, label, options) {
  const opts = options || {};
  const tipo = opts.tipo != null ? opts.tipo : null;
  const toggleProperties = opts.toggleProperties || [];
  const componente = A11Y_COMPONENTE_LABELS[componenteKey] || componenteKey;
  const a11ySubtype = { componente: componenteKey, isOutro: false, tipo };
  let properties = [
    { key: 'componente', label: 'Componente', value: componente },
    { key: 'label', label: 'Label', value: label },
  ];
  const entry = A11Y_CONTENT.elemento.componentes[componenteKey];
  if (entry && entry.descricao) properties.push({ key: 'descricao', label: 'Descrição', value: entry.descricao });
  if (entry && entry.notasCodigo) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: entry.notasCodigo });
  properties.push(...toggleProperties);
  properties = properties.filter(p => p.value);
  return { letter, properties, a11ySubtype };
}

// containingFrame chega como o nome cru do component set (ex: "[dsc]
// Alert") — remove o prefixo "[dsc]"/colchetes pra virar um nome legível no
// campo "Componente" (ex: "Alert").
function _cleanDscContainingFrameName(containingFrame) {
  return String(containingFrame || '')
    .replace(/^\[dsc\]\s*/i, '')
    .trim() || (containingFrame || 'Componente');
}
window._cleanDscContainingFrameName = _cleanDscContainingFrameName;

// Default de nível de título quando não há sugestão prévia. O WAI recomenda
// nunca inferir nível pelo tamanho visual da fonte — por isso não existe
// heurística real aqui, só um fallback fixo. A única variação é por origem:
// mobile (React Native) não tem escala H1..H6, só um identificador único de
// título ('mobile', ver A11Y_CONTENT.titulo.mobile) — então o default pra
// specs mobile é essa opção, não 'h1'.
function _defaultTituloNivelForOrigin(origin) {
  return origin === 'mobile' ? 'mobile' : 'h1';
}

// Deduz o "tipo" de marco de navegação (header/nav/main/aside/footer) a
// partir do containingFrame do componente DSC real detectado no canvas — por
// ora só "[dsc] Header" → 'header' e "[dsc] Footer" → 'footer' têm
// correspondência curada. Fallback 'header' quando o nome não é reconhecido.
function _inferA11yEstruturaTipoFromContainingFrame(containingFrame) {
  const name = String(containingFrame || '').toLowerCase();
  if (name.includes('footer')) return 'footer';
  if (name.includes('header')) return 'header';
  return 'header';
}

function confirmA11ySpec() {
  const modal = document.getElementById('a11y-spec-modal');
  const category = modal ? modal.dataset.category : '';
  const areaId = modal ? modal.dataset.areaId : '';
  const editingSpecId = modal ? modal.dataset.editingSpecId : '';
  const editingOriginalIndex = modal && modal.dataset.editingOriginalIndex !== undefined
    ? parseInt(modal.dataset.editingOriginalIndex, 10) : -1;
  const meta = A11Y_CATEGORIES[category];
  if (!meta) return;

  const g = id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  let properties = [];
  let letter;
  // a11ySubtype: chave crua da subvariante escolhida (não o texto já resolvido
  // em properties[]) — usada só pelo backend pra saber qual variante ajustar
  // na instância aninhada do componente real importado da lib.
  let a11ySubtype = null;

  if (category === 'elemento') {
    const tag = g('a11y-el-tag-input').toUpperCase();
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato A, B, A1, A1.1...');
      return;
    }
    const select = document.getElementById('a11y-el-componente-select');
    const isMobile = (modal && modal.dataset.a11yOrigin) === 'mobile';
    // Em specs mobile este select fica escondido e travado no default (ver
    // _toggleA11yElementoDesktopBlock) — isOutro é sempre false pra specs
    // mobile NOVAS. O equivalente mobile de "Outro" é escolher "Personalizado"
    // no dropdown "Link do Componente" (default real da property) e descrever
    // o nome do componente não mapeado no campo de texto livre companheiro —
    // ver A11Y_MOBILE_LINK_COMPONENT_OPTIONS/_renderA11yElementoMobileFields.
    // O branch `if (isOutro)` abaixo continua existindo só pra edição de
    // specs mobile ANTIGAS que já nasceram com isOutro=true (antes desta
    // correção) — não é mais alcançável a partir do formulário mobile atual.
    const isOutro = !isMobile && select && select.value === 'outro';
    const label = g('a11y-el-label');
    // Sub-variante mobile ('componente' | 'link' | 'texto alternativo') — só
    // relevante/lida quando a origem é mobile; ausente em specs web (ver
    // A11Y_ELEMENTO_MOBILE_VARIANTS).
    const mobileVariant = isMobile ? _getA11yElementoMobileVariant() : null;

    // Validações obrigatórias exclusivas de cada sub-variante mobile — a doc
    // da vertical exige esses campos antes de confirmar a spec.
    if (isMobile && mobileVariant === A11Y_ELEMENTO_MOBILE_VARIANTS.componente) {
      const linkUrl = document.getElementById('a11y-el-mobile-link-url');
      if (!linkUrl || !linkUrl.value.trim()) {
        showToast('Informe o Link do Componente.');
        return;
      }
    }
    if (isMobile && mobileVariant === A11Y_ELEMENTO_MOBILE_VARIANTS.textoAlternativo) {
      const altDescricao = document.getElementById('a11y-el-mobile-alt-descricao');
      if (!altDescricao || !altDescricao.value.trim()) {
        showToast('Informe a Descrição (texto alternativo).');
        return;
      }
    }

    if (isOutro) {
      const componenteOutro = g('a11y-el-componente-outro');
      if (!componenteOutro) {
        showToast('Informe o Componente documentado.');
        return;
      }
      if (!label) {
        showToast('Informe o Label (accessibilityLabel) do elemento.');
        return;
      }
      letter = tag;
      a11ySubtype = { componente: null, isOutro: true, tipo: null, variant: mobileVariant };
      properties = [
        { key: 'componente', label: 'Componente', value: componenteOutro },
        { key: 'label', label: 'Label', value: label },
        // Descrição fixa da variante "link" — "Outro" (componente fora do
        // catálogo) também pode ser mobile (ex: componente novo do DSC |
        // Super App ainda sem mapeamento de a11y curado).
        ...(isMobile && mobileVariant === A11Y_ELEMENTO_MOBILE_VARIANTS.link
          ? [{ key: 'descricao', label: 'Descrição', value: A11Y_CONTENT.elemento.mobileLink.descricao }]
          : []),
        // Dica para Leitor de Tela/Observações/Link do Componente/Descrição
        // (texto alternativo) — coletados conforme a sub-variante mobile ativa
        // (_renderA11yElementoMobileFields já renderizou só os campos
        // pertinentes).
        ..._collectA11yElementoMobileToggleProperties(),
      ].filter(p => p.value);
    } else if (isMobile) {
      // Specs mobile não-"Outro" nunca passam pelo catálogo desktop (select
      // fica escondido/travado no default, ver _toggleA11yElementoDesktopBlock)
      // — a origem filtra tudo, fonte de verdade aqui é só a sub-variante
      // mobile (linkComponente/variant), nunca select.value. a11ySubtype.
      // componente fica null (não existe "componente do catálogo desktop"
      // pra essa spec); linkComponente/linkComponenteNome (variante
      // "componente") é quem de fato identifica o componente real
      // documentado, coletado via _collectA11yElementoMobileToggleProperties.
      if (!label) {
        showToast('Informe o Label (accessibilityLabel) do elemento.');
        return;
      }
      letter = tag;
      a11ySubtype = { componente: null, isOutro: false, tipo: null, variant: mobileVariant };
      const overrideDescricao = mobileVariant === A11Y_ELEMENTO_MOBILE_VARIANTS.link
        ? A11Y_CONTENT.elemento.mobileLink.descricao
        : null;
      properties = [
        { key: 'label', label: 'Label', value: label },
        ...(overrideDescricao ? [{ key: 'descricao', label: 'Descrição', value: overrideDescricao }] : []),
        // Dica para Leitor de Tela/Observações/Link do Componente/Descrição
        // (texto alternativo) — coletados conforme a sub-variante mobile ativa
        // (_renderA11yElementoMobileFields já renderizou só os campos
        // pertinentes).
        ..._collectA11yElementoMobileToggleProperties(),
      ].filter(p => p.value);
    } else {
      if (!label) {
        showToast('Informe o Label (accessibilityLabel) do elemento.');
        return;
      }
      // tipo: valor do <select> dinâmico de variante secundária (ex: Button →
      // "de icone") — null quando o componente não tem nenhuma variante
      // catalogada além de "componente".
      const tipo = _collectA11yElementoVariantValue();
      // Toggles dinâmicos do componente real (Nome Acessível/Observações/
      // Notas de Código, conforme disponíveis naquele componente específico).
      // Só entram os que o designer ligou E preencheu; o backend usa
      // properties[].key pra saber qual property ativar via setProperties na
      // instância aninhada certa.
      const built = _buildA11yElementoPayload(tag, select.value, label, {
        tipo,
        toggleProperties: _collectA11yElementoToggleProperties(),
      });
      letter = built.letter;
      properties = built.properties;
      a11ySubtype = built.a11ySubtype;
    }
  } else if (category === 'estrutura') {
    const tag = g('a11y-estrutura-tag-input').toUpperCase();
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato A, B, A1, A1.1...');
      return;
    }
    letter = tag;
    const descricao = g('a11y-estrutura-descricao');
    const notaEl = document.getElementById('a11y-estrutura-nota');
    const notaWrap = document.getElementById('a11y-estrutura-nota-wrap');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descricao },
    ];
    if (notaWrap && !notaWrap.classList.contains('hidden') && notaEl && notaEl.textContent) {
      properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: notaEl.textContent });
    }
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
    const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
    const variacao = subtipoSelect ? subtipoSelect.value : 'idiomas';
    a11ySubtype = {
      variacao,
      tipo: variacao === 'marco de navegacao' ? (marcoSelect ? marcoSelect.value : 'header') : null,
      idioma: variacao === 'idiomas' ? (idiomasSelect ? idiomasSelect.value : 'da pagina') : null,
    };
    // Toggles dos sub-níveis "EE idiomas"/"EE marco de navegacao" — o
    // backend usa properties[].key pra ativar a property booleana real na
    // instância aninhada certa.
    properties.push(..._collectA11yFixedToggleProperties('a11y-estrutura-toggles-list'));
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    const nivel = nivelSelect ? nivelSelect.value : 'h1';
    letter = nivel === 'mobile' ? 'H' : nivel.toUpperCase();
    const descEl = document.getElementById('a11y-fixed-descricao');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descEl ? descEl.textContent : '' },
    ];
    if (nivel === 'mobile') {
      const notaEl = document.getElementById('a11y-fixed-nota');
      if (notaEl && notaEl.textContent) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: notaEl.textContent });
    }
    // Toggle real "observacoes" do set "niveis de titulo" — não aparece no
    // modo mobile (updateA11yTituloFields já esvazia a lista nesse caso).
    properties.push(..._collectA11yFixedToggleProperties('a11y-titulo-toggles-list'));
    a11ySubtype = { nivel };
  } else if (category === 'decorativo') {
    letter = meta.badge;
    const descEl = document.getElementById('a11y-fixed-descricao-dec');
    const notaEl = document.getElementById('a11y-fixed-nota-dec');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descEl ? descEl.textContent : '' },
    ];
    if (notaEl && notaEl.textContent) properties.push({ key: 'notaCodigo', label: 'Nota de Código', value: notaEl.textContent });
    // Toggles reais "observacoes"/"notas" do set correspondente ao subtipo
    // (ED gerais / ED imagem).
    properties.push(..._collectA11yFixedToggleProperties('a11y-decorativo-toggles-list'));
    const decSelect = document.getElementById('a11y-decorativo-subtipo-select');
    a11ySubtype = { tipo: decSelect ? decSelect.value : 'gerais' };
  } else if (category === 'informacoes') {
    const tag = g('a11y-informacoes-tag-input').toUpperCase();
    if (!validateA11yTagInput()) {
      showToast('Tag inválida. Use o formato A, B, A1, A1.1...');
      return;
    }
    letter = tag;
    const descricao = g('a11y-informacoes-descricao');
    properties = [
      { key: 'descricao', label: 'Descrição', value: descricao },
    ];
    // Toggle real "observacoes" do set "informações adicionais" — não
    // aparece no subtipo "customizavel" (sem componente real catalogado).
    properties.push(..._collectA11yFixedToggleProperties('a11y-informacoes-toggles-list'));
    const infoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    a11ySubtype = { subtipo: infoSelect ? infoSelect.value : 'handoffs' };
  }

  // Lido ANTES de limpar o dataset — este é sempre o caminho de SUCESSO
  // (botão "Aplicar"), diferente do fechamento "externo" (X/Esc/backdrop/
  // "Cancelar") que aciona stopA11yBatchWizard dentro de closeA11yModal.
  // Limpa wizardActive ANTES de chamar closeA11yModal() propositalmente:
  // sem isso, closeA11yModal interpretaria este fechamento como abandono e
  // encerraria o wizard no meio de uma confirmação bem-sucedida.
  const isWizardActive = modal && modal.dataset.wizardActive === '1';
  if (modal) delete modal.dataset.wizardActive;

  closeA11yModal();
  // O modal fecha na hora, mas o backend ainda precisa de figma.loadFontAsync
  // (x3) + importComponentByKeyAsync (import real da lib "Design Acessível")
  // antes de notificar. Isso pode levar segundos sem NENHUM feedback visível,
  // criando a falsa impressão de que um clique posterior (ex: na árvore de
  // camadas) foi o que disparou o toast "Especificação criada" quando ele
  // finalmente aparece. No wizard o toast por item é suprimido (silent:
  // true, ver opts abaixo) — o resumo agregado do fim (_advanceA11yBatchWizard)
  // já cobre o feedback.
  if (!isWizardActive) showToast('Criando especificação de acessibilidade…');

  const guideSideEl = document.querySelector('input[name="a11y-guide-side"]:checked');
  const drawModeEl = document.querySelector('input[name="a11y-draw-mode"]:checked');
  const drawMode = drawModeEl ? drawModeEl.value : 'contorno';

  const opts = {
    category: 'acessibilidade',
    categoryLabel: meta.label,
    letter,
    color: meta.color,
    fillColor: meta.fill,
    properties,
    guideSide: guideSideEl ? guideSideEl.value : 'right',
    // Modo "Contorno" (default) usa o marcador real "Agrupamento" — a moldura
    // já embute o selo, não precisa de linha ligando ao card. Modo "Linha"
    // reativa o conector (real da lib quando disponível; vetor procedural
    // como fallback).
    drawMode,
    drawConnection: drawMode === 'linha',
    a11yType: category,
    // Chave crua da subvariante — usada pelo backend pra tentar o import real
    // do componente da lib (ver code.js, _tryImportA11yComponent).
    a11ySubtype,
    // Origem já resolvida por quem abriu o modal: Detecção Automática via
    // openA11yFormFromUndocumented, edição de uma spec existente via
    // editA11ySpec, ou o botão "+ Nova spec" via chooseA11yType (que lê
    // getA11yProjectOrigin() — a origem já configurada do projeto). Default
    // 'web' aqui cobre só o caso raro de modal.dataset.a11yOrigin não ter
    // sido setado.
    a11yOrigin: (modal && modal.dataset.a11yOrigin) || 'web',
    // Mesmo raciocínio do a11yOrigin acima: fluxo manual não passou pela
    // Detecção Automática, então não há componentKey resolvido pra apontar
    // uma lib DSC de origem. Explícito null (em vez de omitir o campo) pra
    // deixar claro, na leitura do payload, que o campo existe e foi
    // conscientemente deixado sem valor. Sobrescrito abaixo quando é edição
    // de uma spec que já tinha origem resolvida — editar não deve apagar o
    // badge de lib de origem que a Detecção Automática já tinha resolvido.
    a11ySourceLib: null,
    // Nome real do component set DSC (ex: "[dsc] Button"), resolvido pelo
    // scan e propagado via modal.dataset.dscComponentName (ver openA11yModal/
    // openA11yFormFromUndocumented). Mesmo raciocínio do a11ySourceLib acima:
    // null explícito no fluxo manual, sobrescrito abaixo na edição pra não
    // apagar o badge de componente que a Detecção Automática já tinha resolvido.
    a11yDscComponentName: (modal && modal.dataset.dscComponentName) || null,
    // Área Marcada onde a spec nasceu — associação explícita, escolhida no
    // momento da criação. O backend ecoa esse campo de volta em spec-created
    // pra spec.a11yAreaId continuar presente no objeto salvo localmente.
    a11yAreaId: areaId || null,
    // IDs das specs irmãs (mesma área + mesma categoria) já no canvas —
    // permite ao backend alinhar o card novo na mesma sub-coluna X das
    // demais specs da área+categoria, mesmo quando usam letras ou lados de
    // conector diferentes.
    existingAreaSpecIds: _collectAreaSiblingSpecIds(areaId, category),
    // Todas as specs da área (qualquer categoria) — só usado quando a
    // categoria acima é nova na área, pra decidir ao lado de qual sub-coluna
    // existente posicionar a nova.
    existingAreaAllSpecIds: _collectAreaAllSpecIds(areaId),
    // Specs criadas pelo wizard de revisão da Detecção Automática SEMPRE
    // nascem com needsReview: false — mesmo que a detecção original tivesse
    // confiança baixa ou fosse um componente não catalogado (isUnmapped),
    // já que passaram por configuração/confirmação humana item a item. Fora
    // do wizard, o fluxo manual nunca setava este campo (nasce false por
    // omissão) — explícito aqui só reforça a mesma regra nos dois casos.
    needsReview: false,
    // Suprime o toast individual de create-unified-spec (code.js) durante o
    // wizard: com N itens revisados em sequência, N toasts do caso feliz só
    // competiriam com o resumo agregado disparado no fim
    // (_advanceA11yBatchWizard). Fora do wizard, continua notificando item a
    // item normalmente (showToast acima já cobre o "Criando…").
    silent: isWizardActive,
  };

  if (areaId) {
    window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();
    window._a11yExpandedAreaIds.add(areaId);
  }

  // Criação a partir de um item da lista de pendentes aponta pro nó real que
  // o scan já identificou, em vez de depender da seleção atual do canvas
  // (mesmo raciocínio de editingSpec.targetNodeId logo abaixo, só que pra
  // criação nova). Não entra no branch de edição: aqui é sempre uma spec
  // nova, sem nó antigo pra apagar.
  const pendingTargetNodeId = modal ? modal.dataset.pendingTargetNodeId : '';
  if (pendingTargetNodeId && !editingSpecId) opts.targetNodeId = pendingTargetNodeId;

  // Editar = apagar o nó antigo (selo + card real) e recriar do zero com os
  // dados atualizados, fixando targetNodeId pra não depender da seleção
  // atual do canvas (o elemento já foi escolhido na criação original).
  const editingSpec = editingOriginalIndex >= 0 ? a11ySpecs[editingOriginalIndex] : null;
  if (editingSpecId && editingSpec) {
    opts.targetNodeId = editingSpec.targetNodeId;
    // Mantém a spec exatamente onde estava no canvas — sem isso o backend
    // trata a recriação como spec nova e a empilha no fim do grupo.
    if (typeof editingSpec.cardX === 'number' && typeof editingSpec.cardY === 'number') {
      opts.pinnedPosition = { x: editingSpec.cardX, y: editingSpec.cardY };
    }
    // Editar reusa este fluxo manual, que por padrão não conhece a origem
    // DSC (ver a11yOrigin/a11ySourceLib acima). Sem isto, editar uma spec
    // criada via Detecção Automática apagaria o badge de lib de origem dela
    // — a edição muda texto/variante, não deveria mudar a proveniência.
    if (editingSpec.a11yOrigin) opts.a11yOrigin = editingSpec.a11yOrigin;
    if (editingSpec.a11ySourceLib) opts.a11ySourceLib = editingSpec.a11ySourceLib;
    if (editingSpec.a11yDscComponentName) opts.a11yDscComponentName = editingSpec.a11yDscComponentName;
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: editingSpecId } }, '*');
    // Guarda a posição original pra spec-created (messages.js) reinserir no
    // mesmo lugar em vez de só empilhar no fim do array — evita que ela
    // "desça" na lista quando duas specs da mesma área compartilham a mesma
    // letra (ordenação por letra é estável, desempate é a ordem de inserção).
    window._a11yEditingReinsertIndex = editingOriginalIndex;
    a11ySpecs.splice(editingOriginalIndex, 1);
  }

  // Fora do wizard: fire-and-forget, igual sempre foi. Dentro do wizard:
  // espera a resposta real 'spec-created' (_createA11ySpecAndWait, mesmo
  // padrão de serialização já usado pelo antigo loop de lote) antes de
  // avançar pro próximo item da fila — evita duas criações concorrentes
  // colidindo (o backend calcula posição/import da lib de forma assíncrona
  // por chamada).
  //
  // Rede de segurança contra duplicidade: recalcula _getDocumentedNodeIdsForArea
  // NA HORA (não usa um snapshot tirado na montagem da fila) — mesma checagem
  // que o antigo loop de lote (confirmA11yBatchGenerate, removido) fazia a
  // cada iteração. Mesmo com revisão humana item a item reduzindo o risco, o
  // hac já teve bug de spec duplicada 4x em sessões anteriores (duplicidade
  // avulso-vs-por-frame); o nó revisado no item corrente pode ter ganhado
  // spec por outra via (edição concorrente, outro item do mesmo lote apontando
  // pro mesmo nó) enquanto o wizard estava parado neste modal. Se o nó já
  // está documentado nesta área, trata como descarte automático e silencioso
  // — não chama o backend, não mostra o toast genérico de falha.
  if (isWizardActive) {
    const wizardState = window._a11yBatchWizardState;
    // Índice capturado agora — navegação livre significa que o designer
    // pode pular pra outro item enquanto o _createA11ySpecAndWait abaixo
    // ainda está em voo (await); sem isso, o .then() marcaria como
    // confirmado/descartado o item que estiver em state.currentIndex NO
    // MOMENTO em que a resposta chegar, não o item que de fato foi
    // confirmado.
    const confirmingIndex = wizardState ? wizardState.currentIndex : -1;
    const dedupeNodeId = opts.targetNodeId || pendingTargetNodeId;
    const alreadyDocumented = wizardState
      && dedupeNodeId
      && _getDocumentedNodeIdsForArea(areaId).has(dedupeNodeId);
    if (alreadyDocumented) {
      wizardState.discarded.add(confirmingIndex);
      showToast('Item já documentado nesta área — pulado automaticamente.');
      _advanceA11yBatchWizard();
      return;
    }
    showA11yWizardSavingIndicator();
    _createA11ySpecAndWait(opts).then(ok => {
      // Lê window._a11yBatchWizardState de novo (não uma cópia capturada
      // antes do await) — se stopA11yBatchWizard() rodou enquanto esta
      // Promise estava pendente, a variável global já foi zerada e esta
      // resposta tardia não deve reviver/mutar um wizard que o usuário já
      // encerrou.
      const state = window._a11yBatchWizardState;
      hideA11yWizardSavingIndicator();
      if (!state) return;
      if (ok) state.confirmed.add(confirmingIndex);
      else showToast('Não foi possível criar esta especificação — item pulado.');
      // Só avança automaticamente pro próximo pendente se o designer ainda
      // está olhando pro item que acabou de confirmar — se ele já pulou pra
      // outro item enquanto isso, o avanço aconteceria por baixo do formulário
      // aberto, trocando o conteúdo sem ação do usuário.
      if (state.currentIndex === confirmingIndex) _advanceA11yBatchWizard();
      else _refreshA11yWizardPaginator(state);
    });
  } else {
    parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
  }
}
window.confirmA11ySpec = confirmA11ySpec;

// ── Listagem ─────────────────────────────────────────────────────────────
// Áreas Marcadas são o agrupamento principal (accordion). Toda spec de A11y
// nasce DENTRO de uma área específica; não existe spec "solta" no fluxo
// normal (o bucket "Sem área" só acolhe dado legado/órfão).
function _a11ySpecItemHtml(spec) {
  const meta = A11Y_CATEGORIES[spec.a11yType] || { label: 'Acessibilidade', icon: 'accessibility' };
  const color = spec.color || meta.color || '#0891B2';
  const fill = spec.fillColor || meta.fill || '#E0F5FA';
  const props = spec.properties || [];
  const isHidden = spec.visible === false;
  const isUnlocked = spec.locked === false;

  const dscComponentLabel = spec.a11yDscComponentName ? _cleanDscContainingFrameName(spec.a11yDscComponentName) : null;

  const searchText = _normalizeSearchText(
    [spec.letter, spec.targetNodeName, spec.name, meta.label, spec.a11yType, spec.a11ySourceLib?.label, dscComponentLabel]
      .concat(props.flatMap(p => [p.label, p.value]))
      .filter(Boolean)
      .join(' ')
  );

  return `
    <div class="relative bg-gray-50/60 dark:bg-dark-bg/40 rounded-xl border ${isUnlocked ? 'border-amber-200 dark:border-amber-800/40' : isHidden ? 'border-gray-100 opacity-50' : 'border-gray-100 dark:border-dark-line'} overflow-hidden"
      data-a11y-spec-item data-a11y-category="${escapeHtml(spec.a11yType || '')}" data-a11y-search="${escapeHtml(searchText)}">
      <div class="flex items-start px-2.5 py-2 gap-2">
        <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white shrink-0 mt-0.5" style="background-color:${color}">${escapeHtml(spec.letter || 'A')}</div>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-semibold text-slate-700 dark:text-white truncate">${escapeHtml(spec.targetNodeName || spec.name || 'Elemento')}</p>
          <div class="flex items-center flex-wrap gap-1 mt-0.5">
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold" style="background-color:${fill};border-color:${color};color:${color};">
              <i data-lucide="${meta.icon}" class="w-2.5 h-2.5"></i> ${meta.label}
            </span>
            ${spec.a11ySourceLib ? `
            <span class="inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-medium bg-slate-50 dark:bg-dark-bg/60 border-slate-200 dark:border-dark-line text-slate-500 dark:text-dark-muted">
              ${escapeHtml(spec.a11ySourceLib.label)}
            </span>` : ''}
            ${dscComponentLabel ? `
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-medium bg-slate-50 dark:bg-dark-bg/60 border-slate-200 dark:border-dark-line text-slate-500 dark:text-dark-muted">
              <i data-lucide="component" class="w-2.5 h-2.5"></i> ${escapeHtml(dscComponentLabel)}
            </span>` : ''}
            ${spec.needsReview ? `
            <button type="button" title="Especificação precisa de revisão — clique para verificar" aria-label="Verificar especificação — precisa de revisão"
              onclick="editA11ySpec(${spec.originalIndex})"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors">
              <i data-lucide="alert-triangle" class="w-2.5 h-2.5"></i> Verificar
            </button>` : ''}
          </div>
        </div>
        <button type="button" title="Focar no elemento no canvas" aria-label="Focar no elemento no canvas"
          onclick="focusNode('${spec.targetNodeId}')"
          class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
          <i data-lucide="locate" class="w-3.5 h-3.5"></i>
        </button>
        <button type="button" title="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas" aria-label="${isHidden ? 'Mostrar' : 'Ocultar'} no canvas"
          onclick="toggleA11ySpecVisibility(${spec.originalIndex})"
          class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
          <i data-lucide="${isHidden ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
        </button>
        <button type="button" title="${isUnlocked ? 'Travar' : 'Destravar'}" aria-label="${isUnlocked ? 'Travar' : 'Destravar'}"
          onclick="toggleA11ySpecLock(${spec.originalIndex})"
          class="w-6 h-6 flex items-center justify-center ${isUnlocked ? 'text-amber-500' : 'text-gray-400'} hover:text-[#0070af] transition-colors shrink-0">
          <i data-lucide="${isUnlocked ? 'lock-open' : 'lock'}" class="w-3.5 h-3.5"></i>
        </button>
        <button type="button" title="Editar" aria-label="Editar especificação de acessibilidade"
          onclick="editA11ySpec(${spec.originalIndex})"
          class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
        </button>
        <button type="button" title="Remover" aria-label="Remover especificação de acessibilidade"
          onclick="deleteA11ySpec(${spec.originalIndex})"
          class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
      ${props.length > 0 ? `
      <div class="px-2.5 pb-2.5 space-y-1">
        ${props.map(p => `
          <div class="flex items-start justify-between gap-2 px-2 py-1 bg-white dark:bg-dark-surface rounded-lg">
            <span class="text-[9px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wider shrink-0 pt-px">${escapeHtml(p.label)}</span>
            <span class="text-[10px] font-semibold text-slate-700 dark:text-white text-right break-all min-w-0">${escapeHtml(String(p.value))}</span>
          </div>`).join('')}
      </div>` : ''}
    </div>
  `;
}

// Conjunto persistente de áreas expandidas — sobrevive a re-renders (ex.:
// criar/editar qualquer spec dispara renderA11yGroupedList e reconstrói a
// lista do zero). Sem isso, cada re-render colapsava de volta qualquer área
// que o designer tivesse aberto manualmente pra consulta.
window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();

function toggleA11yAreaAccordion(uid, areaId) {
  const body = document.getElementById(`body-${uid}`);
  const chevron = document.getElementById(`chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (areaId) {
    if (isHidden) window._a11yExpandedAreaIds.add(areaId);
    else window._a11yExpandedAreaIds.delete(areaId);
  }
}
window.toggleA11yAreaAccordion = toggleA11yAreaAccordion;

// Subaccordion de Ordem de Tabulação. Conjunto separado de
// window._a11yExpandedAreaIds: expandir/recolher a seção de Ordem de
// Tabulação de uma área não pode afetar o estado de expansão da própria
// área (são dois accordions independentes, aninhados). Chaveado pelo uid do
// accordion PAI (área ou "sem área"), não pelo areaId.
window._a11yExpandedTabOrderIds = window._a11yExpandedTabOrderIds || new Set();

function toggleA11yTabOrderAccordion(uid) {
  const body = document.getElementById(`tab-order-body-${uid}`);
  const chevron = document.getElementById(`tab-order-chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (isHidden) window._a11yExpandedTabOrderIds.add(uid);
  else window._a11yExpandedTabOrderIds.delete(uid);
}
window.toggleA11yTabOrderAccordion = toggleA11yTabOrderAccordion;

// Ação em massa disparada pelos botões "Expandir todos"/"Recolher todos"
// dentro de UMA área (nunca afeta outras áreas). `btn` é o próprio elemento
// clicado — sobe até o accordion-content da ÁREA (que contém os
// subaccordions de categoria + Ordem de Tabulação) via closest(), depois
// localiza cada `.accordion-content` filho nesse escopo. Sincroniza os dois
// Sets de estado pra um toggle individual posterior não reabrir/fechar algo
// que a ação em massa acabou de definir.
function _a11ySetAllSubaccordions(btn, expand) {
  const areaBody = btn.closest('.accordion-content');
  if (!areaBody) return;
  areaBody.querySelectorAll(':scope > .accordion-content, :scope > div > .accordion-content').forEach(body => {
    body.classList.toggle('hidden', !expand);
    const idSuffix = body.id.replace(/^(body-|tab-order-body-|undoc-body-)/, '');
    const chevronPrefix = body.id.startsWith('tab-order-body-') ? 'tab-order-chevron-'
      : body.id.startsWith('undoc-body-') ? 'undoc-chevron-'
      : 'chevron-';
    const chevron = document.getElementById(`${chevronPrefix}${idSuffix}`);
    if (chevron) chevron.style.transform = expand ? 'rotate(180deg)' : 'rotate(0deg)';
    if (body.id.startsWith('tab-order-body-')) {
      if (expand) window._a11yExpandedTabOrderIds.add(idSuffix);
      else window._a11yExpandedTabOrderIds.delete(idSuffix);
    } else if (body.id.startsWith('undoc-body-')) {
      if (expand) window._a11yExpandedUndocumentedIds.add(idSuffix);
      else window._a11yExpandedUndocumentedIds.delete(idSuffix);
    }
  });
}
window._a11ySetAllSubaccordions = _a11ySetAllSubaccordions;

// Subaccordion por categoria (elemento/estrutura/titulo/decorativo/informacoes)
// dentro de cada Área. Nasce RECOLHIDO por padrão (mudou em 2026-08-25, avaliação
// design-ux + accessibility-specialist sobre densidade do card de Área — antes
// nascia sempre expandido sem memória de estado). Estado próprio em
// window._a11yExpandedCategoryIds, mesmo padrão de _a11yExpandedTabOrderIds/
// _a11yExpandedUndocumentedIds — chaveado por uid (categoria dentro de uma
// área específica), não por catKey sozinho (a mesma categoria em áreas
// diferentes tem estado independente).
window._a11yExpandedCategoryIds = window._a11yExpandedCategoryIds || new Set();

function toggleA11yCategoryAccordion(uid) {
  const body = document.getElementById(`body-${uid}`);
  const chevron = document.getElementById(`chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (isHidden) window._a11yExpandedCategoryIds.add(uid);
  else window._a11yExpandedCategoryIds.delete(uid);
}
window.toggleA11yCategoryAccordion = toggleA11yCategoryAccordion;

function _a11yCategoryAccordionEl(uid, catKey, catSpecs) {
  const meta = A11Y_CATEGORIES[catKey] || { label: _capitalizeFirst(catKey), icon: 'accessibility', color: '#0891B2', fill: '#E0F5FA' };
  const expand = window._a11yExpandedCategoryIds.has(uid);
  return `
    <div class="rounded-lg border border-gray-100 dark:border-dark-line overflow-hidden ml-1" data-a11y-subcat="${escapeHtml(catKey)}">
      <div class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none bg-gray-50/60 dark:bg-dark-bg/30 hover:bg-gray-100/60 dark:hover:bg-dark-line/20 transition-colors"
        onclick="toggleA11yCategoryAccordion('${uid}')">
        <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0" style="background-color:${meta.fill}">
          <i data-lucide="${meta.icon}" class="w-2.5 h-2.5" style="color:${meta.color}"></i>
        </div>
        <p class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide truncate">${escapeHtml(meta.label)} (${catSpecs.length})</p>
        <i data-lucide="chevron-down" id="chevron-${uid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0" style="transform:${expand ? 'rotate(180deg)' : 'rotate(0deg)'}"></i>
      </div>
      <div id="body-${uid}" class="accordion-content ${expand ? '' : 'hidden'} border-t border-gray-50 dark:border-dark-line p-1.5 space-y-1.5">
        ${catSpecs.map(_a11ySpecItemHtml).join('')}
      </div>
    </div>
  `;
}

// Markup da seção "Ordem de Tabulação" dentro do accordion de UMA área —
// reaproveitado tanto por _a11yAreaAccordionEl (área real, com botões de
// criação) quanto por _a11ySemAreaAccordionEl (bucket "Sem área", read-only,
// sem botões — não há área real pra escopar clique manual ou varredura de
// camadas). O <ul> nasce vazio (id previsível ulId) e é preenchido depois,
// no DOM já inserido, por _renderTabOrderListForArea (ver chamada em
// renderA11yGroupedList).
function _tabOrderSectionHtml(uid, area) {
  const ulId = `tab-order-list-${uid}`;
  const readOnly = !area;
  const areaIdAttr = area ? area.id : '__sem_area__';
  const expand = window._a11yExpandedTabOrderIds.has(uid);
  const chevronStyle = expand ? 'rotate(180deg)' : 'rotate(0deg)';
  const bodyHiddenClass = expand ? '' : 'hidden';

  if (readOnly) {
    return `
      <div class="rounded-lg border border-gray-100 dark:border-dark-line overflow-hidden ml-1">
        <div class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none bg-gray-50/60 dark:bg-dark-bg/30 hover:bg-gray-100/60 dark:hover:bg-dark-line/20 transition-colors"
          onclick="toggleA11yTabOrderAccordion('${uid}')">
          <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 bg-gray-100 dark:bg-dark-line/40">
            <i data-lucide="list-ordered" class="w-2.5 h-2.5 text-gray-400"></i>
          </div>
          <p class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide truncate">Ordem de Tabulação</p>
          <i data-lucide="chevron-down" id="tab-order-chevron-${uid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0" style="transform:${chevronStyle}"></i>
        </div>
        <div id="tab-order-body-${uid}" class="accordion-content ${bodyHiddenClass} border-t border-gray-50 dark:border-dark-line p-1.5">
          <ul id="${ulId}" class="flex flex-col gap-1.5 min-h-[10px]"></ul>
        </div>
      </div>
    `;
  }

  return `
    <div class="rounded-lg border border-gray-100 dark:border-dark-line overflow-hidden ml-1">
      <div class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none bg-gray-50/60 dark:bg-dark-bg/30 hover:bg-gray-100/60 dark:hover:bg-dark-line/20 transition-colors"
        onclick="toggleA11yTabOrderAccordion('${uid}')">
        <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0" style="background-color:#E0F5FA">
          <i data-lucide="list-ordered" class="w-2.5 h-2.5" style="color:#0891B2"></i>
        </div>
        <p class="flex-1 min-w-0 text-[10px] font-bold text-slate-500 dark:text-dark-muted uppercase tracking-wide truncate">Ordem de Tabulação</p>
        <i data-lucide="chevron-down" id="tab-order-chevron-${uid}" class="w-3.5 h-3.5 text-gray-400 transition-transform shrink-0" style="transform:${chevronStyle}"></i>
      </div>
      <div id="tab-order-body-${uid}" class="accordion-content ${bodyHiddenClass} border-t border-gray-50 dark:border-dark-line p-1.5 space-y-1.5">
        <!-- Os 2 botões abaixo não desenham nada diretamente no canvas de
             trabalho: ambos abrem o MESMO modal de revisão
             (#a11y-tab-order-review-modal), que só desenha os selos numa
             CÓPIA do frame ao clicar "Aplicar no Canvas". -->
        <button type="button" onclick="event.stopPropagation(); startTabOrderManualMode('${escapeHtml(areaIdAttr)}', '${escapeHtml(area.targetNodeId || '')}')"
          class="w-full flex items-center justify-center gap-2 h-8 rounded-xl text-[10.5px] font-bold transition-all bg-[#0891B2] text-white hover:bg-cyan-700 active:scale-[0.99] shadow-sm shadow-cyan-500/20">
          <i data-lucide="list-ordered" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Iniciar Ordem de Tabulação
        </button>
        <button type="button" onclick="event.stopPropagation(); _confirmGenerateTabOrderFromLayers('${escapeHtml(areaIdAttr)}', '${escapeHtml(area.targetNodeId || '')}')"
          class="w-full flex items-center justify-center gap-2 h-8 rounded-xl text-[10.5px] font-bold transition-all border border-cyan-200 dark:border-cyan-800/40 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:scale-[0.99]">
          <i data-lucide="sparkles" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Gerar Automaticamente
        </button>
        <!-- Lista abaixo mostra os itens JÁ APLICADOS no canvas (na cópia do
             frame) nesta área, se houver uma cópia gerada anteriormente —
             não a lista pendente (essa vive só dentro do modal enquanto não
             aplicada). -->
        <ul id="${ulId}" class="flex flex-col gap-1.5 min-h-[10px]"></ul>
        <button type="button" onclick="event.stopPropagation(); updateTabOrderNumbering('${escapeHtml(areaIdAttr)}')"
          class="w-full flex items-center justify-center gap-2 h-7 mt-1 rounded-2xl text-[10.5px] font-bold border border-gray-200 dark:border-dark-line text-slate-600 dark:text-dark-muted hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-slate-300 transition-all">
          <i data-lucide="refresh-cw" class="w-3.5 h-3.5" aria-hidden="true"></i>
          Atualizar
        </button>
      </div>
    </div>
  `;
}

// Mesmo padrão visual/estrutural de _a11yCategoryAccordionEl (header
// clicável com chevron + contador entre parênteses + corpo com
// accordion-content/hidden), com estado de expansão próprio em
// window._a11yExpandedUndocumentedIds. Some completamente da área quando não
// há pendência nenhuma (nada a mostrar).
window._a11yExpandedUndocumentedIds = window._a11yExpandedUndocumentedIds || new Set();

function toggleA11yUndocumentedAccordion(uid) {
  const body = document.getElementById(`undoc-body-${uid}`);
  const chevron = document.getElementById(`undoc-chevron-${uid}`);
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  body.classList.toggle('hidden', !isHidden);
  if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  if (isHidden) window._a11yExpandedUndocumentedIds.add(uid);
  else window._a11yExpandedUndocumentedIds.delete(uid);
}
window.toggleA11yUndocumentedAccordion = toggleA11yUndocumentedAccordion;

// Rótulo curto pro card de cada item pendente.
function _a11yUndocumentedItemLabel(kind, item) {
  if (kind === 'tokenReview') return 'Possível título sem token DSC';
  const match = item.dscComponentMatch;
  if (match.isUnmapped === true) return `Outro (${_cleanDscContainingFrameName(match.containingFrame)})`;
  const shortName = match.a11yCategory;
  if (shortName === 'titulo') return `Nível de Título (${(match.suggestedLevel || 'h1').toUpperCase()})`;
  if (shortName === 'decorativo') return 'Elemento Decorativo';
  if (shortName === 'estrutura') return `Estrutura da Página (${_cleanDscContainingFrameName(match.containingFrame)})`;
  return A11Y_COMPONENTE_LABELS[shortName] || _capitalizeFirst(shortName);
}

function _a11yUndocumentedItemHtml(areaId, entry) {
  const { kind, item } = entry;
  const label = _a11yUndocumentedItemLabel(kind, item);
  const name = item.layerName || item.name || 'Elemento';
  // Único destaque de aviso (fundo âmbar) que sobrevive nesta lista: "token
  // sem DSC vinculado" (kind === 'tokenReview'), o único caso em que a
  // detecção genuinamente não tem nada pra trabalhar. "Outro" (isUnmapped —
  // componente DSC real, mas sem categoria de a11y catalogada) e a antiga
  // distinção de confiança alta/baixa foram removidos deste destaque: com o
  // wizard sequencial, todo item passa por revisão humana individual de
  // qualquer forma, então a distinção de confiança virou ruído sem efeito
  // prático (decisão de produto, 2026-09-02).
  const isBaixa = kind === 'tokenReview';
  // encodeURIComponent pro item sobreviver dentro do atributo onclick (nomes
  // de camada podem ter aspas/caracteres especiais) — decodificado de volta
  // em openA11yFormFromUndocumented.
  const encodedItem = encodeURIComponent(JSON.stringify(item));
  return `
    <div class="flex items-center gap-2 px-2.5 py-2 rounded-xl border ${isBaixa ? 'bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40' : 'bg-gray-50 dark:bg-dark-bg border-gray-100 dark:border-dark-line'}">
      <i data-lucide="${kind === 'tokenReview' ? 'alert-circle' : 'circle-help'}" class="w-3.5 h-3.5 ${isBaixa ? 'text-amber-500' : 'text-slate-400'} shrink-0" aria-hidden="true"></i>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white truncate" title="${escapeHtml(name)}">${escapeHtml(name)}</p>
        <p class="text-[9px] text-slate-400 dark:text-dark-muted truncate">${escapeHtml(label)}</p>
      </div>
      <button type="button" title="Focar no canvas" aria-label="Focar no canvas"
        onclick="focusNode('${item.nodeId}')"
        class="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-[#0070af] transition-colors">
        <i data-lucide="crosshair" class="w-3.5 h-3.5" aria-hidden="true"></i>
      </button>
      <button type="button" title="Criar especificação" aria-label="Criar especificação de acessibilidade para ${escapeHtml(name)}"
        onclick="openA11yFormFromUndocumented('${areaId}', '${kind}', '${encodedItem}')"
        class="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-[#0891B2] text-white text-[9.5px] font-bold hover:bg-cyan-700 active:scale-95 transition-all">
        <i data-lucide="plus" class="w-3 h-3"></i> Criar spec
      </button>
    </div>
  `;
}

// Some da área inteira quando não há pendência (mesmo critério dos 4
// accordions de categoria — sem itens, sem accordion).
function _a11yUndocumentedAccordionEl(uid, areaId, entries) {
  if (!entries || entries.length === 0) return '';
  const expand = window._a11yExpandedUndocumentedIds.has(uid);
  const chevronStyle = expand ? 'rotate(180deg)' : 'rotate(0deg)';
  const bodyHiddenClass = expand ? '' : 'hidden';
  return `
    <div class="rounded-lg border border-amber-200 dark:border-amber-800/40 overflow-hidden ml-1" data-a11y-subcat="nao-documentados">
      <div class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
        onclick="toggleA11yUndocumentedAccordion('${uid}')">
        <div class="w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 bg-amber-100 dark:bg-amber-900/30">
          <i data-lucide="circle-help" class="w-2.5 h-2.5 text-amber-600 dark:text-amber-400"></i>
        </div>
        <p class="flex-1 min-w-0 text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide truncate">Não Documentados (${entries.length})</p>
        <i data-lucide="chevron-down" id="undoc-chevron-${uid}" class="w-3.5 h-3.5 text-amber-500 transition-transform shrink-0" style="transform:${chevronStyle}"></i>
      </div>
      <div id="undoc-body-${uid}" class="accordion-content ${bodyHiddenClass} border-t border-amber-100 dark:border-amber-900/30 p-1.5 space-y-1.5">
        ${entries.map(entry => _a11yUndocumentedItemHtml(areaId, entry)).join('')}
      </div>
    </div>
  `;
}

function _a11yAreaAccordionEl(area, areaSpecs) {
  const uid = `a11y-area-${area.originalIndex}`;
  const expand = window._a11yExpandedAreaIds.has(area.id);
  const undocumentedEntries = _collectA11yUndocumentedForArea(area.id);
  // Status agregado da Ordem de Tabulação, visível no header do card ao lado
  // do contador de especificações — antes ficava só implícito, enterrada
  // como último accordion (avaliação de design-ux + accessibility-specialist,
  // 2026-08-25: separar em card próprio fragmentaria a Área, que é a unidade
  // real de organização — a correção certa é dar visibilidade, não fragmentar).
  // "Aplicada" = já existem itens no canvas para esta área (tabOrderItems),
  // "Pendente" caso contrário. Não há estado de "rascunho" persistido — a
  // lista fica só em memória enquanto o modal de revisão não é confirmado.
  const tabOrderCount = _currentTabOrderItems(area.id).length;
  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-dark-line overflow-hidden';
  li.setAttribute('data-a11y-area', area.id);
  li.setAttribute('data-a11y-area-search', escapeHtml(_normalizeSearchText(area.label)));
  li.innerHTML = `
    <div class="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-dark-line/20 transition-colors"
      onclick="toggleA11yAreaAccordion('${uid}', '${area.id}')">
      <div class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white shrink-0" style="background-color:#0070AF">${escapeHtml(String(area.number))}</div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white break-words leading-snug">${escapeHtml(area.label || '')}</p>
        <div class="flex items-center gap-1.5 flex-wrap">
          <p class="text-[9px] text-slate-400 dark:text-dark-muted">${areaSpecs.length} especificaç${areaSpecs.length === 1 ? 'ão' : 'ões'}</p>
          <span class="text-[9px] text-gray-300 dark:text-dark-line">·</span>
          <p class="text-[9px] font-semibold flex items-center gap-1" style="color:${tabOrderCount > 0 ? '#16a34a' : '#94a3b8'}">
            <i data-lucide="${tabOrderCount > 0 ? 'check-circle-2' : 'circle-dashed'}" class="w-2.5 h-2.5 shrink-0"></i>
            Tabulação${tabOrderCount > 0 ? ` (${tabOrderCount})` : ' pendente'}
          </p>
        </div>
      </div>
      <button type="button" title="Nova especificação nesta área" aria-label="Nova especificação nesta área"
        onclick="event.stopPropagation(); openA11yCategoryPickerModal('${area.id}')"
        class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[#0891B2] text-white text-[10px] font-bold hover:bg-cyan-700 active:scale-95 shadow-sm shadow-cyan-500/20 transition-all shrink-0">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nova spec
      </button>
      <button type="button" title="Focar na área no canvas" aria-label="Focar na área no canvas"
        onclick="event.stopPropagation(); focusNode('${area.id}')"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
        <i data-lucide="locate" class="w-3.5 h-3.5"></i>
      </button>
      <!-- Oculta/mostra TUDO da área de uma vez (specs das 5 categorias +
           cópia de Ordem de Tabulação, se existir). -->
      <button type="button" title="Ocultar/Mostrar toda a área no canvas" aria-label="Ocultar/Mostrar toda a área no canvas"
        onclick="event.stopPropagation(); toggleAreaGroupVisibility('${area.id}')"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
        <i data-lucide="${window._a11yAreaHiddenIds.has(area.id) ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
      </button>
      <button type="button" title="Remover área" aria-label="Remover área"
        onclick="event.stopPropagation(); deleteA11yArea(${area.originalIndex})"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
      <i data-lucide="chevron-down" id="chevron-${uid}" class="w-4 h-4 text-gray-400 transition-transform shrink-0" style="transform:${expand ? 'rotate(180deg)' : 'rotate(0deg)'}"></i>
    </div>
    <div id="body-${uid}" class="accordion-content ${expand ? '' : 'hidden'} border-t border-gray-50 dark:border-dark-line p-2 space-y-2">
      ${(areaSpecs.length > 0 || undocumentedEntries.length > 0) ? `
      <div class="flex items-center justify-end gap-1 px-0.5 -mb-0.5">
        <button type="button" onclick="event.stopPropagation(); _a11ySetAllSubaccordions(this, true)"
          class="text-[9.5px] font-bold text-cyan-700 dark:text-cyan-400 hover:underline px-1">Expandir todos</button>
        <span class="text-[9.5px] text-gray-300 dark:text-dark-line">·</span>
        <button type="button" onclick="event.stopPropagation(); _a11ySetAllSubaccordions(this, false)"
          class="text-[9.5px] font-bold text-slate-500 dark:text-dark-muted hover:underline px-1">Recolher todos</button>
      </div>` : ''}
      ${_tabOrderSectionHtml(uid, area)}
      ${areaSpecs.length > 0
        ? Object.keys(A11Y_CATEGORIES)
            .map(catKey => ({ catKey, catSpecs: areaSpecs.filter(s => s.a11yType === catKey) }))
            .filter(({ catSpecs }) => catSpecs.length > 0)
            .map(({ catKey, catSpecs }) => _a11yCategoryAccordionEl(`${uid}-cat-${catKey}`, catKey, catSpecs))
            .join('')
        : (undocumentedEntries.length === 0 ? `<p class="text-[10px] text-slate-400 dark:text-dark-muted text-center py-3">Nenhuma especificação nesta área ainda. Use o botão "Nova spec" acima.</p>` : '')}
      ${_a11yUndocumentedAccordionEl(`${uid}-undoc`, area.id, undocumentedEntries)}
    </div>
  `;
  return li;
}

// Bucket "Sem área" — specs que não têm a11yAreaId válido (dado legado/
// órfão — não deveria mais acontecer no fluxo novo, área é pré-requisito
// pra criar spec). Nunca tenta adivinhar a área certa. Também acolhe itens
// de Ordem de Tabulação legados sem a11yAreaId, na mesma vitrine read-only
// (sem botões de criação — não há área real pra escopar clique manual ou
// varredura de camadas).
function _a11ySemAreaAccordionEl(specs, tabItemsCount) {
  const uid = 'a11y-area-sem';
  const li = document.createElement('li');
  li.className = 'list-none bg-white dark:bg-dark-surface rounded-xl border border-amber-200 dark:border-amber-800/40 overflow-hidden';
  li.setAttribute('data-a11y-area', '__sem_area__');
  li.setAttribute('data-a11y-area-search', 'sem area');
  const parts = [`${specs.length} especificaç${specs.length === 1 ? 'ão' : 'ões'}`];
  if (tabItemsCount > 0) parts.push(`${tabItemsCount} ${tabItemsCount === 1 ? 'item' : 'itens'} de ordem de tabulação`);
  li.innerHTML = `
    <div class="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
      onclick="toggleA11yAreaAccordion('${uid}')">
      <div class="w-6 h-6 rounded-full flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 text-amber-500 shrink-0">
        <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[11px] font-semibold text-slate-700 dark:text-white truncate">Sem área</p>
        <p class="text-[9px] text-slate-400 dark:text-dark-muted">${parts.join(' · ')} sem área associada</p>
      </div>
      <i data-lucide="chevron-down" id="chevron-${uid}" class="w-4 h-4 text-gray-400 transition-transform shrink-0"></i>
    </div>
    <div id="body-${uid}" class="accordion-content hidden border-t border-gray-50 dark:border-dark-line p-2 space-y-2">
      ${specs.map(_a11ySpecItemHtml).join('')}
      ${tabItemsCount > 0 ? _tabOrderSectionHtml(uid, null) : ''}
    </div>
  `;
  return li;
}

// A árvore de camadas do Figma (painel Layers) é a fonte de verdade
// estrutural do documento — a listagem agrupada ordena as specs de cada
// área pela ordem de camadas real (DFS a partir da Área Marcada), não pela
// tag (letter) alfabética nem por x/y.
//
// Cache em memória (não persiste entre sessões/reload do plugin). Estrutura:
// { [areaId]: { [nodeId]: índice de visita DFS } } — o índice só é
// comparável DENTRO da mesma área (a árvore percorrida é a da Área Marcada,
// não do documento inteiro), por isso o cache é escopado por areaId em vez
// de ser um mapa único nodeId→índice.
window._a11yLayerOrderCache = window._a11yLayerOrderCache || {};

function _a11ySortSpecsByLayerOrder(specsList, areaId) {
  const areaCache = (window._a11yLayerOrderCache && areaId) ? window._a11yLayerOrderCache[areaId] : null;
  return specsList.slice().sort((a, b) => {
    const orderA = (areaCache && a.targetNodeId) ? areaCache[a.targetNodeId] : undefined;
    const orderB = (areaCache && b.targetNodeId) ? areaCache[b.targetNodeId] : undefined;
    if (orderA === undefined || orderB === undefined) {
      return String(a.letter || '').localeCompare(String(b.letter || ''));
    }
    return orderA - orderB;
  });
}

// Coleta os targetNodeId ainda não cacheados PARA ESTA ÁREA (o índice de
// ordem de camadas só faz sentido escopado à árvore de uma área específica)
// e consulta o backend de uma vez só. Re-renderiza ao final — chamada
// "fire and forget" a partir de renderA11yGroupedList, que já rendeu uma vez
// com o fallback alfabético enquanto a consulta está em voo.
function _a11yQueueLayerOrderResolution(areaId, targetNodeId, specsList) {
  if (!areaId || !targetNodeId) return;
  const cache = window._a11yLayerOrderCache;
  const areaCache = cache[areaId] || {};
  const missingIds = Array.from(new Set(
    specsList
      .map(s => s.targetNodeId)
      .filter(id => id && !(id in areaCache))
  ));
  if (missingIds.length === 0) return;

  parent.postMessage({ pluginMessage: { type: 'resolve-layer-order', areaId, areaTargetNodeId: targetNodeId, nodeIds: missingIds } }, '*');
}

function renderA11yGroupedList() {
  const list = document.getElementById('a11y-groups-results');
  if (!list) return;
  list.innerHTML = '';

  const areas = (a11yAreas || [])
    .map((a, i) => (a ? Object.assign({}, a, { originalIndex: i }) : null))
    .filter(Boolean)
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const specs = (a11ySpecs || [])
    .map((s, i) => (s ? Object.assign({}, s, { originalIndex: i }) : null))
    .filter(Boolean);

  // Banner vira um snackbar (showToast) — dispara só 1x por sessão do
  // plugin, não persiste entre sessões.
  if (areas.length === 0 && !window._a11yEmptyAreasHintShown) {
    window._a11yEmptyAreasHintShown = true;
    showToast('As especificações de acessibilidade nascem dentro de uma área marcada.');
  }

  // Marcar Área é pré-requisito: sem nenhuma área, nem mostramos a lista —
  // orienta a marcar a primeira antes de anotar qualquer spec.
  if (areas.length === 0) {
    list.innerHTML = `
      <li class="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500 list-none">
        <div class="relative mb-4">
          <i data-lucide="map-pin" class="w-16 h-16 text-slate-200 dark:text-slate-700" style="opacity:0.25"></i>
        </div>
        <p class="text-[12px] font-bold text-slate-500 dark:text-dark-muted text-center px-4 mb-1">Nenhuma área marcada ainda</p>
        <p class="text-[10px] text-slate-400 dark:text-dark-muted text-center px-6">Toque em <button type="button" onclick="openA11yAreaModal()" class="font-bold underline text-[#0070af] dark:text-cyan-400 hover:text-[#005a8c] dark:hover:text-cyan-300">"Marcar Área"</button> para identificar a primeira seção da tela — as especificações de acessibilidade nascem dentro de uma área.</p>
      </li>
    `;
    _refreshIcons();
    return;
  }

  areas.forEach(area => {
    const areaSpecsRaw = specs.filter(s => s.a11yAreaId === area.id);
    const areaSpecs = _a11ySortSpecsByLayerOrder(areaSpecsRaw, area.id);
    const areaLi = _a11yAreaAccordionEl(area, areaSpecs);
    list.appendChild(areaLi);
    // O <ul> nasce vazio no template de _a11yAreaAccordionEl; preenche agora
    // que já está no DOM.
    const uid = `a11y-area-${area.originalIndex}`;
    _renderTabOrderListForArea(area.id, document.getElementById(`tab-order-list-${uid}`));
    _a11yQueueLayerOrderResolution(area.id, area.targetNodeId, areaSpecsRaw);
  });

  // O bucket "Sem área" (specs sem a11yAreaId válido) não tem uma área real
  // pra escopar a árvore/DFS, então mantém o fallback alfabético por tag
  // (letter), sem consulta de ordem de camadas.
  const semArea = specs
    .filter(s => !s.a11yAreaId || !areas.some(a => a.id === s.a11yAreaId))
    .slice()
    .sort((a, b) => String(a.letter || '').localeCompare(String(b.letter || '')));
  const semAreaTabItems = _currentTabOrderItems('__sem_area__');
  if (semArea.length > 0 || semAreaTabItems.length > 0) {
    const semLi = _a11ySemAreaAccordionEl(semArea, semAreaTabItems.length);
    list.appendChild(semLi);
    if (semAreaTabItems.length > 0) {
      _renderTabOrderListForArea('__sem_area__', document.getElementById('tab-order-list-a11y-area-sem'));
    }
  }

  _refreshIcons();
  _setupA11ySearchBar();
}
window.renderA11yGroupedList = renderA11yGroupedList;

// ── Busca + filtro por categoria ─────────────────────────────────────────
// Filtro só de EXIBIÇÃO sobre a lista já renderizada, não persiste entre
// sessões, não altera a11ySpecs/a11yAreas. Estrutura em 3 níveis (Área >
// subaccordion de categoria > spec) — um nível só some se TODOS os filhos
// não baterem o filtro, pra nunca deixar accordion pai vazio visível.
function _normalizeSearchText(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function _setupA11ySearchBar() {
  const bar = document.getElementById('a11y-search-bar');
  if (!bar) return;
  const hasSpecs = a11ySpecs && a11ySpecs.length > 0;
  bar.classList.toggle('hidden', !hasSpecs);
  if (!hasSpecs) return;

  const sel = document.getElementById('a11y-category-filter');
  if (sel) {
    const current = sel.value;
    sel.innerHTML = '<option value="">Todas as categorias</option>';
    Object.keys(A11Y_CATEGORIES).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = A11Y_CATEGORIES[key].label;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value === current)) sel.value = current;
  }

  const searchInput = document.getElementById('a11y-search-input');
  _applyA11yFilters(searchInput ? searchInput.value : '', sel ? sel.value : '');
}

function applyA11ySearchFilter(query) {
  const sel = document.getElementById('a11y-category-filter');
  _applyA11yFilters(query, sel ? sel.value : '');
}
window.applyA11ySearchFilter = applyA11ySearchFilter;

function applyA11yCategoryFilter(category) {
  const searchInput = document.getElementById('a11y-search-input');
  _applyA11yFilters(searchInput ? searchInput.value : '', category);
}
window.applyA11yCategoryFilter = applyA11yCategoryFilter;

function _applyA11yFilters(query, category) {
  const list = document.getElementById('a11y-groups-results');
  const emptyMsg = document.getElementById('a11y-search-empty');
  if (!list) return;

  const term = _normalizeSearchText(query);
  let visibleTotal = 0;

  list.querySelectorAll('[data-a11y-area]').forEach(areaEl => {
    const areaText = areaEl.getAttribute('data-a11y-area-search') || '';
    const areaMatchesTermAlone = term && areaText.includes(term) && !category;
    let visibleInArea = 0;

    areaEl.querySelectorAll('[data-a11y-spec-item]').forEach(itemEl => {
      const text = itemEl.getAttribute('data-a11y-search') || '';
      const cat = itemEl.getAttribute('data-a11y-category') || '';
      const matchText = !term || text.includes(term) || areaMatchesTermAlone;
      const matchCat = !category || cat === category;
      const show = matchText && matchCat;
      itemEl.style.display = show ? '' : 'none';
      if (show) visibleInArea++;
    });

    areaEl.querySelectorAll('[data-a11y-subcat]').forEach(subcatEl => {
      const anyVisible = [...subcatEl.querySelectorAll('[data-a11y-spec-item]')]
        .some(itemEl => itemEl.style.display !== 'none');
      subcatEl.style.display = anyVisible ? '' : 'none';
    });

    areaEl.style.display = visibleInArea > 0 ? '' : 'none';
    visibleTotal += visibleInArea;
  });

  const hasAnyFilter = term || category;
  if (emptyMsg) emptyMsg.classList.toggle('hidden', !hasAnyFilter || visibleTotal > 0);
}

// Wrappers pra não quebrar chamadores existentes (core.js, messages.js) que
// ainda pedem a lista de specs ou a de áreas separadamente — ambos
// renderizam o mesmo accordion unificado.
function renderA11ySpecsList() { renderA11yGroupedList(); }
window.renderA11ySpecsList = renderA11ySpecsList;
function renderA11yAreasList() { renderA11yGroupedList(); }
window.renderA11yAreasList = renderA11yAreasList;

// ── Origem do projeto (web/mobile) — pergunta única por arquivo ─────────
// Decisão de produto (2026-09-02, REVERTE a decisão de 2026-09-01 abaixo):
// a origem web/mobile voltou a ser uma característica do ARQUIVO/PROJETO
// inteiro (nunca misto — confirmado repetidamente pelo usuário), perguntada
// UMA ÚNICA VEZ e persistida em hacData.projectOrigin (core.js), sobrevivendo
// a reaberturas do plugin (mesmo save-storage/clientStorage escopado por
// fileKey de todo o resto do hacData).
//
// Motivo da reversão: perguntar a cada ação (Marcar Área, Detecção
// Automática, Ordem de Tabulação) fazia a MESMA pergunta aparecer duas vezes
// em sequência imediata quando autoDetect está ligado (Marcar Área → abre a
// Detecção Automática automaticamente) — parecia um loop/bug pro designer.
//
// ensureA11yProjectOriginThen(onReady) é o ponto único que toda ação que
// precisa da origem deve chamar: se hacData.projectOrigin já está definido,
// chama onReady(origin) DIRETO (sem abrir modal nenhuma); se não, abre a
// mesma modal bloqueante já existente (#a11y-post-area-detect-modal, estado
// #a11y-post-area-origin) e, na escolha, persiste em hacData.projectOrigin
// (setA11yProjectOrigin) antes de chamar onReady — daí em diante nenhuma
// outra ação nesse arquivo pergunta de novo.
function getA11yProjectOrigin() {
  return (hacData && hacData.projectOrigin) || null;
}
window.getA11yProjectOrigin = getA11yProjectOrigin;

// silent: true evita o toast (usado no fluxo de primeira pergunta, onde o
// toast seria ruído — a confirmação visual já é o modal fechando e a ação
// prosseguindo). false é usado pela troca manual via "Sobre o hac".
function setA11yProjectOrigin(origin, opts) {
  if (origin !== 'web' && origin !== 'mobile') return;
  hacData.projectOrigin = origin;
  saveToStorage();
  if (!opts || !opts.silent) {
    showToast(`Plataforma do projeto definida como ${origin === 'mobile' ? 'Mobile' : 'Web'}.`);
  }
}
window.setA11yProjectOrigin = setA11yProjectOrigin;

// #a11y-post-area-origin visível / #a11y-post-area-loading escondido —
// reaproveitado tanto pela pergunta de origem quanto pelo indicador de
// progresso da Detecção Automática/salvamento do wizard (ver
// showA11yWizardSavingIndicator, mais abaixo).
function _setA11yPostAreaModalStage(stage) {
  const originStage = document.getElementById('a11y-post-area-origin');
  const loadingStage = document.getElementById('a11y-post-area-loading');
  if (originStage) originStage.classList.toggle('hidden', stage !== 'origin');
  if (loadingStage) loadingStage.classList.toggle('hidden', stage !== 'loading');
}

// Ponto único que qualquer ação (Marcar Área, Detecção Automática, Ordem de
// Tabulação, e futuras) deve chamar antes de precisar saber a origem
// web/mobile do arquivo. Nunca pergunta mais de uma vez por arquivo — só
// reabre a modal quando hacData.projectOrigin ainda é null (arquivo novo, ou
// arquivo salvo antes desta versão, sem o campo — migração por ausência).
function ensureA11yProjectOriginThen(onReady) {
  const known = getA11yProjectOrigin();
  if (known) {
    onReady(known);
    return;
  }
  window._a11yPendingOriginCallback = (origin) => {
    setA11yProjectOrigin(origin, { silent: true });
    onReady(origin);
  };
  const originTitle = document.getElementById('a11y-post-area-title');
  if (originTitle) originTitle.innerHTML = '<i data-lucide="smartphone" class="w-4 h-4 text-[#0070af]" aria-hidden="true"></i> Plataforma do Projeto';
  _setA11yPostAreaModalStage('origin');
  openModal('a11y-post-area-detect-modal');
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
window.ensureA11yProjectOriginThen = ensureA11yProjectOriginThen;

// Reabre a pergunta sob demanda (botão "Trocar" na modal "Sobre o hac") —
// única forma de mudar hacData.projectOrigin depois de já definido. Ignora
// o valor atual (não é ensureA11yProjectOriginThen) e mostra a modal sempre.
function openA11yProjectOriginPrompt() {
  if (typeof closeModal === 'function') closeModal('about-hac-modal');
  window._a11yPendingOriginCallback = (origin) => {
    setA11yProjectOrigin(origin, { silent: false });
  };
  const originTitle = document.getElementById('a11y-post-area-title');
  if (originTitle) originTitle.innerHTML = '<i data-lucide="smartphone" class="w-4 h-4 text-[#0070af]" aria-hidden="true"></i> Plataforma do Projeto';
  _setA11yPostAreaModalStage('origin');
  openModal('a11y-post-area-detect-modal');
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
window.openA11yProjectOriginPrompt = openA11yProjectOriginPrompt;

// Abre a modal "Sobre o hac" (botão CAIXA|HAC no header) já preenchendo
// #about-hac-project-origin com a plataforma atual do arquivo (ou "Não
// definida" nos arquivos legados/ainda não perguntados) — o botão "Trocar"
// ao lado chama openA11yProjectOriginPrompt acima.
function openAboutHacModal() {
  const originLabelEl = document.getElementById('about-hac-project-origin');
  if (originLabelEl) {
    const origin = getA11yProjectOrigin();
    originLabelEl.textContent = origin === 'mobile' ? 'Mobile' : origin === 'web' ? 'Web' : 'Não definida';
  }
  openModal('about-hac-modal');
}
window.openAboutHacModal = openAboutHacModal;

// ── Detecção Automática pós-Marcar-Área ─────────────────────────────────
// A detecção nasce escopada ao elemento que ACABOU de virar Área
// (targetNodeId, já resolvido no backend em create-a11y-area).
// a11y-area-created (messages.js) só chama isto quando area.autoDetect é
// truthy (Manual não abre modal nenhum).
//
// A origem web/mobile usada pra retropreencher Título/Decorativo desta
// varredura vem de hacData.projectOrigin (ensureA11yProjectOriginThen),
// nunca mais perguntada aqui isoladamente — ver bloco "Origem do projeto"
// acima para o histórico da decisão.
function openA11yPostAreaDetectModal(area) {
  if (!area || !area.targetNodeId) return;
  window._a11yPendingDetectionArea = {
    targetNodeId: area.targetNodeId,
    areaId: area.id,
    label: area.label,
    declaredOrigin: null,
  };
  ensureA11yProjectOriginThen((origin) => {
    const pending = window._a11yPendingDetectionArea;
    if (!pending) return;
    pending.declaredOrigin = origin;
    const loadingText = document.getElementById('a11y-post-area-loading-text');
    if (loadingText) loadingText.textContent = 'Detectando componentes…';
    _setA11yPostAreaModalStage('loading');
    openModal('a11y-post-area-detect-modal');
    runA11yPostAreaDetection();
  });
}
window.openA11yPostAreaDetectModal = openA11yPostAreaDetectModal;

// Resposta do designer à pergunta bloqueante de origem — único jeito de sair
// do estado de pergunta da modal #a11y-post-area-detect-modal. Reaproveitada
// por ensureA11yProjectOriginThen/openA11yProjectOriginPrompt (window.
// _a11yPendingOriginCallback sempre setado por quem abriu a pergunta).
function chooseA11yDetectionOrigin(origin) {
  if (origin !== 'web' && origin !== 'mobile') return;
  if (typeof window._a11yPendingOriginCallback !== 'function') return;
  const callback = window._a11yPendingOriginCallback;
  window._a11yPendingOriginCallback = null;
  closeModal('a11y-post-area-detect-modal');
  _restoreA11yPostAreaModalTitle();
  callback(origin);
}
window.chooseA11yDetectionOrigin = chooseA11yDetectionOrigin;

// Restaura o título/ícone padrão ("Detecção Automática") da modal
// reaproveitada — chamado depois que openA11yProjectOriginPrompt (troca
// manual via "Sobre o hac") troca temporariamente esse título.
function _restoreA11yPostAreaModalTitle() {
  const originTitle = document.getElementById('a11y-post-area-title');
  if (originTitle) originTitle.innerHTML = '<i data-lucide="radar" class="w-4 h-4 text-[#0070af]" aria-hidden="true"></i> Detecção Automática';
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

// (Removida em 2026-09-02: _askTabOrderOriginThen, que perguntava a origem
// web/mobile de novo, do zero, toda vez que a Ordem de Tabulação rodava —
// decisão de 2026-09-01. Substituída por ensureA11yProjectOriginThen
// (bloco "Origem do projeto" acima), que reaproveita hacData.projectOrigin
// já respondido pela primeira ação do arquivo. startTabOrderManualMode e
// _confirmGenerateTabOrderFromLayers chamam ensureA11yProjectOriginThen
// diretamente; window._tabOrderDeclaredOrigin continua existindo como cache
// da origem durante a sessão de revisão, lido por _tabOrderRequestPreview e
// applyTabOrderToCanvas — só a pergunta repetida foi eliminada.)

function closeA11yPostAreaDetectModal() {
  closeModal('a11y-post-area-detect-modal');
  window._a11yPendingDetectionArea = null;
}
window.closeA11yPostAreaDetectModal = closeA11yPostAreaDetectModal;

// Achado de QA (wizard de revisão individual): entre o clique em "Aplicar"
// (fecha #a11y-spec-modal de forma síncrona) e a resposta 'spec-created'
// chegando (pode levar segundos — fontes + import de componente real da
// lib), não havia NENHUM feedback visual: o plugin parecia travado.
// Reaproveita o mesmo modal/spinner já usado pela varredura pós-Marcar-Área
// (#a11y-post-area-detect-modal) só trocando o texto — não é um estado novo
// de produto, só um indicador de "isto está processando". Chamado em
// confirmA11ySpec logo depois de fechar o modal individual; escondido em
// _advanceA11yBatchWizard, no mesmo instante em que o próximo item abre (ou
// em que o wizard termina/é interrompido). Pula direto pro estado de
// loading — não é uma nova varredura, não faz sentido perguntar origem de
// novo aqui.
function showA11yWizardSavingIndicator() {
  const loadingText = document.getElementById('a11y-post-area-loading-text');
  if (loadingText) loadingText.textContent = 'Salvando especificação…';
  _setA11yPostAreaModalStage('loading');
  openModal('a11y-post-area-detect-modal');
}
function hideA11yWizardSavingIndicator() {
  closeModal('a11y-post-area-detect-modal');
}

// Agrega os 5 buckets do scan (components/icons/typography/vectors/images)
// que vierem com dscComponentMatch preenchido — components/icons cobrem os
// 16 componentes reais do DSC (confidence pode ser 'alta' ou 'baixa');
// typography/vectors só existem por heurística de nome de camada/estilo
// (categorias 'titulo'/'decorativo') e por isso vêm sempre 'baixa'. `images`
// (fills tipo IMAGE) também entra. Usado tanto no fluxo pós-Marcar-Área
// quanto no scan normal (messages.js, handler scan-result).
function _collectA11yDetections(data) {
  if (!data) return [];
  // Cada bucket já chega do backend ordenado por conformidade+alfabético
  // (correto pro Scan de Tokens, mas irrelevante aqui: a Detecção Automática
  // de a11y precisa da ordem estrutural real da árvore de camadas pra que as
  // tags sequenciais (A, B, C...) atribuídas no lote batam com a ordem em
  // que os elementos aparecem na página). `treeOrder` (índice de visita DFS
  // pré-order anexado por extractSpecs/addElement em code.js) sobrevive ao
  // spread genérico do backend. Ordenamos por ele como último passo — itens
  // sem treeOrder vão pro fim via `?? Infinity`.
  return [
    ...(data.components || []),
    ...(data.icons || []),
    ...(data.typography || []),
    ...(data.vectors || []),
    ...(data.images || []),
  ]
    .filter(c => c && c.dscComponentMatch)
    .sort((a, b) => (a.treeOrder ?? Infinity) - (b.treeOrder ?? Infinity));
}
window._collectA11yDetections = _collectA11yDetections;

// Coleta separada dos itens de category === 'typography' que NÃO viraram
// sugestão real (dscComponentMatch continua null/undefined) mas foram
// marcados pelo backend (needsA11yTokenReview) por não terem token DSC de
// tipografia vinculado. Nunca se mistura com _collectA11yDetections (que
// exige dscComponentMatch truthy) — são candidatos de aviso, não sugestões
// elegíveis pro lote.
function _collectA11yTokenReviewCandidates(data) {
  if (!data) return [];
  return (data.typography || []).filter(c => c && c.needsA11yTokenReview === true && !c.dscComponentMatch);
}
window._collectA11yTokenReviewCandidates = _collectA11yTokenReviewCandidates;

// nodeId (real, do canvas) de toda spec de a11y JÁ CONFIRMADA na área — toda
// spec nasce com targetNodeId = nodeId do elemento que a originou, então
// basta cruzar contra a11ySpecs pra saber "esse elemento já foi documentado
// nesta área?". Fonte única de verdade de dedupe por elemento, usada tanto
// pelo accordion "Não Documentados" quanto pelo filtro de elegibilidade do
// lote (ver _filterA11yBatchEligible) — extraída depois de um bug real em
// que as duas listas divergiam: o lote não cruzava contra a11ySpecs, então
// Detecção Automática + Reescanear reapresentava os MESMOS elementos já
// documentados como candidatos elegíveis, e confirmar de novo criava specs
// duplicadas sobre o mesmo targetNodeId (visualmente sobrepostas no canvas).
function _getDocumentedNodeIdsForArea(areaId) {
  if (!areaId) return new Set();
  return new Set(
    (a11ySpecs || [])
      .filter(s => s && s.a11yAreaId === areaId && s.targetNodeId)
      .map(s => s.targetNodeId)
  );
}
window._getDocumentedNodeIdsForArea = _getDocumentedNodeIdsForArea;

// Une as duas fontes de candidato do scan que hoje ficam presas dentro do
// modal de lote (window._a11yDetectionsByArea/_a11yTokenReviewByArea) e
// devolve só quem AINDA não virou spec nesta área — candidato do scan MENOS
// quem já tem spec confirmada pro mesmo nó (_getDocumentedNodeIdsForArea).
// Não guarda flag nenhuma — recalculado a cada render de _a11yAreaAccordionEl.
function _collectA11yUndocumentedForArea(areaId) {
  if (!areaId) return [];
  const documentedNodeIds = _getDocumentedNodeIdsForArea(areaId);

  const byArea = (window._a11yDetectionsByArea && window._a11yDetectionsByArea[areaId]) || [];
  const tokenByArea = (window._a11yTokenReviewByArea && window._a11yTokenReviewByArea[areaId]) || [];

  const fromDetections = byArea
    .filter(item => item && item.nodeId && item.dscComponentMatch && !documentedNodeIds.has(item.nodeId))
    .map(item => ({ kind: 'detection', item }));

  const fromTokenReview = tokenByArea
    .filter(item => item && item.nodeId && !documentedNodeIds.has(item.nodeId))
    .map(item => ({ kind: 'tokenReview', item }));

  return [...fromDetections, ...fromTokenReview]
    .sort((a, b) => (a.item.treeOrder ?? Infinity) - (b.item.treeOrder ?? Infinity));
}
window._collectA11yUndocumentedForArea = _collectA11yUndocumentedForArea;

// Ação de "criar spec" de um item da lista de pendentes — reaproveita o MESMO
// formulário manual (openA11yModal) que o botão "+ Nova spec" do card da área
// abre, só que já com categoria/subtipo pré-selecionados e o nó-alvo fixado
// (ver modal.dataset.pendingTargetNodeId em openA11yModal/confirmA11ySpec) —
// sem isso o formulário cairia na seleção atual do canvas, sem relação com
// o item clicado na lista.
// Ainda passa pela mesma checagem de vínculo da lib "Design Acessível" que
// o botão "+" normal usa. window._a11yLibCheckOnSuccess desvia a resposta
// bem-sucedida da checagem pro formulário direto, pulando o seletor de
// categoria — a categoria aqui já é conhecida, perguntar de novo seria
// redundante.
// Resolve categoria + preset (options de openA11yModal) a partir de um item
// de detecção/pendência JÁ EM MEMÓRIA — extraído de openA11yFormFromUndocumented
// pra ser reaproveitado tanto por ela (item chega serializado num onclick de
// HTML) quanto pelo wizard de revisão da Detecção Automática
// (_advanceA11yBatchWizard, item já vive na fila em memória, sem precisar
// serializar/desserializar). Única fonte de verdade do mapeamento
// categoria/preset — nunca duplicar esta lógica em outro lugar.
// `kind` é 'tokenReview' (texto sem token DSC, sem dscComponentMatch) ou
// 'detection' (default, com dscComponentMatch).
function _resolveA11yFormPresetFromItem(item, kind) {
  // Nome da camada do canvas (item.name === item.layerName, ver
  // _a11yScanArea/code.js) — já em memória desde o scan, sem precisar de
  // round-trip a mais pro backend. Alimenta o campo read-only "Camada no
  // canvas" do formulário (ver openA11yModal/prefillA11yComponentName).
  const targetNodeName = item.name || null;

  if (kind === 'tokenReview') {
    // needsA11yTokenReview nunca tem dscComponentMatch — é só um texto sem
    // token DSC vinculado, sem componente real reconhecido. "Informações
    // Adicionais" é a categoria mais plausível pra um texto solto sem
    // função de título/componente clara — o designer troca de categoria
    // manualmente se o texto for na verdade outra coisa.
    return { category: 'informacoes', options: { pendingTargetNodeId: item.nodeId, targetNodeName } };
  }

  const match = item.dscComponentMatch;
  const isUnmapped = match.isUnmapped === true;
  const shortName = match.a11yCategory;
  const category = (shortName === 'titulo' || shortName === 'decorativo' || shortName === 'estrutura') ? shortName : 'elemento';
  // Origem do componente DETECTADO — mesma fonte que o lote usa
  // (item.dscComponentMatch.origin). Em "elemento"/"estrutura" vem da lib do
  // componente DSC real (_resolveDscComponentA11yMatch, code.js). Em
  // "titulo"/"decorativo" (heurística de texto/ícone, sem componente real)
  // vem retropreenchida com a origin da Área Marcada
  // (handleA11yPostAreaDetectionResult, acima) — nunca fica undefined depois
  // do retropreenchimento, mas o fallback 'web' é mantido por segurança
  // (ex: item avulso fora do fluxo de Detecção Automática por Área).
  const a11yOrigin = match.origin || 'web';
  // Nome real do component set DSC (ex: "[dsc] Button") — null nas
  // heurísticas de texto/ícone (titulo/decorativo/imagem não têm
  // componente DSC real por trás, ver _resolveTypographyA11yMatch/
  // _resolveDecorativeA11yMatch/_resolveImageA11yMatch em code.js).
  const dscComponentName = match.containingFrame || null;

  if (isUnmapped) {
    // "Outro" dentro de Elementos e Imagens — mesmo componente sem
    // categoria catalogada que o lote usa. openA11yModal não tem preset
    // pronto pro caso "Outro" (select cai em 'outro' só quando
    // presetComponente é inválido/ausente, e o campo de texto livre
    // "Componente" fica vazio pro designer preencher) — o designer
    // confirma manualmente, igual seria digitando do zero.
    return { category: 'elemento', options: { pendingTargetNodeId: item.nodeId, a11yOrigin, dscComponentName, targetNodeName } };
  }
  if (category === 'titulo') {
    return { category: 'titulo', options: { pendingTargetNodeId: item.nodeId, presetTituloNivel: match.suggestedLevel, a11yOrigin, dscComponentName, targetNodeName } };
  }
  if (category === 'decorativo') {
    return { category: 'decorativo', options: { pendingTargetNodeId: item.nodeId, a11yOrigin, dscComponentName, targetNodeName } };
  }
  if (category === 'estrutura') {
    const tipo = _inferA11yEstruturaTipoFromContainingFrame(match.containingFrame);
    return { category: 'estrutura', options: { pendingTargetNodeId: item.nodeId, presetEstruturaTipo: tipo, a11yOrigin, dscComponentName, targetNodeName } };
  }
  return { category: 'elemento', options: { pendingTargetNodeId: item.nodeId, presetComponente: shortName, a11yOrigin, dscComponentName, targetNodeName } };
}
window._resolveA11yFormPresetFromItem = _resolveA11yFormPresetFromItem;

function openA11yFormFromUndocumented(areaId, kind, encodedItem) {
  const item = JSON.parse(decodeURIComponent(encodedItem));
  window._a11yPendingAreaId = areaId || null;

  const openForm = () => {
    const { category, options } = _resolveA11yFormPresetFromItem(item, kind);
    openA11yModal(category, options);
  };

  window._a11yLibCheckOnSuccess = openForm;
  const token = 'a11y-lib-check-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  window._a11yLibCheckToken = token;
  parent.postMessage({ pluginMessage: { type: 'check-a11y-library', token } }, '*');
}
window.openA11yFormFromUndocumented = openA11yFormFromUndocumented;

// Dispara o mesmo scan de conformidade DSC, escopado ao targetNodeId da área
// (não a um frame) e com origin: 'a11y-detection' — o backend só repassa
// esse campo de volta na resposta; é o handler scan-result (messages.js)
// que usa esse campo pra rotear a resposta pra cá. Só é chamada depois que
// o designer já respondeu a pergunta de origem (chooseA11yDetectionOrigin já
// trocou a modal pro estado de loading antes de chamar esta função) — exceto
// no reaproveitamento como indicador de "salvando" do wizard
// (showA11yWizardSavingIndicator), que não passa por aqui.
// declaredOrigin viaja no payload só como registro/depuração do lado
// backend — quem de fato consome a escolha do designer é o frontend, em
// handleA11yPostAreaDetectionResult (retropreenchimento de Título/
// Decorativo desta passada).
function runA11yPostAreaDetection() {
  const pending = window._a11yPendingDetectionArea;
  if (!pending || !pending.targetNodeId) return;

  parent.postMessage({
    pluginMessage: {
      type: 'scan-frame',
      frameId: null,
      nodeId: pending.targetNodeId,
      isAudit: false,
      referenceTokens: null,
      selectedLibSlugs: null,
      categories: null,
      origin: 'a11y-detection',
      declaredOrigin: pending.declaredOrigin || null
    }
  }, '*');
}
window.runA11yPostAreaDetection = runA11yPostAreaDetection;

// Chamado pelo handler scan-result (messages.js) quando origin ===
// 'a11y-detection' — recebe as detecções já filtradas (components com
// dscComponentMatch). Guarda em window._a11yLooseDetections pra alimentar o
// botão de lote nesta sessão do modal (hac não tem frame, então não há
// persistência por-frame equivalente ao Handex).
//
// Ao terminar a varredura, pula direto pro modal de resumo do lote
// (openA11yBatchSummaryModal) quando há algo elegível, ou fecha o modal com
// um toast informativo quando não há. Segundo parâmetro opcional
// (tokenReviewCandidates) com os TEXT que parecem título mas não têm token
// DSC vinculado — só ganham um bloco de aviso no modal de resumo, nunca
// entram no lote em si nem geram spec sozinhos.
function handleA11yPostAreaDetectionResult(detections, tokenReviewCandidates) {
  // Restaura o botão de reescanear (spinner) se foi ele quem disparou esta
  // resposta. Feito aqui, não em rescanA11yBatchArea, porque a resposta é
  // assíncrona.
  if (window._a11yBatchRescanBtnPending) {
    window._a11yBatchRescanBtnPending = false;
    const rescanBtn = document.getElementById('btn-a11y-batch-rescan');
    if (rescanBtn) {
      rescanBtn.disabled = false;
      rescanBtn.classList.remove('animate-spin');
    }
    showToast('Área reescaneada.');
  }

  window._a11yLooseDetections = detections;
  window._a11yTokenReviewCandidates = tokenReviewCandidates || [];

  // window._a11yLooseDetections é sobrescrito a cada varredura, então só
  // serve pro lote da ÚLTIMA área escaneada. O accordion "Não Documentados"
  // precisa enxergar os candidatos de TODAS as áreas já escaneadas na
  // sessão (o designer normalmente marca várias áreas antes de revisar
  // pendências), por isso acumulamos aqui por areaId em vez de substituir.
  // Não persiste entre sessões do plugin — um novo scan da mesma área
  // substitui só a entrada dela.
  const pendingAreaId = window._a11yPendingDetectionArea && window._a11yPendingDetectionArea.areaId;
  if (pendingAreaId) {
    window._a11yDetectionsByArea = window._a11yDetectionsByArea || {};
    window._a11yTokenReviewByArea = window._a11yTokenReviewByArea || {};
    window._a11yDetectionsByArea[pendingAreaId] = detections || [];
    window._a11yTokenReviewByArea[pendingAreaId] = tokenReviewCandidates || [];

    // Origem (web/mobile) desta PASSADA de scan — declarada explicitamente
    // pelo designer na pergunta bloqueante que abre a modal
    // (chooseA11yDetectionOrigin), NUNCA mais calculada por voto de maioria
    // entre os componentes detectados. Não é persistida em area.origin (esse
    // campo de schema deixou de ser escrito automaticamente aqui) — vale só
    // pra retropreencher Título/Decorativo desta execução do scan.
    // Título/Decorativo (heurística de texto/ícone, sem componente DSC real
    // por trás) nunca têm como calcular a própria origin no backend — ver
    // _resolveTypographyA11yMatch/_resolveDecorativeA11yMatch (code.js).
    // Retropreenche aqui, no frontend, com a origem declarada nesta rodada.
    // Muta os itens em `detections` in-place — o mesmo array já foi guardado
    // em window._a11yDetectionsByArea[pendingAreaId] acima, então o
    // retropreenchimento vale também pro accordion "Não Documentados", não
    // só pro lote desta passada.
    const declaredOrigin = window._a11yPendingDetectionArea.declaredOrigin || 'web';
    (detections || []).forEach(d => {
      if (d && d.dscComponentMatch && !d.dscComponentMatch.origin) {
        d.dscComponentMatch.origin = declaredOrigin;
      }
    });

    saveToStorage();
  }

  const eligible = _filterA11yBatchEligible(detections, pendingAreaId);
  const hasTokenReviewCandidates = window._a11yTokenReviewCandidates.length > 0;

  if ((!detections || detections.length === 0 || eligible.length === 0) && !hasTokenReviewCandidates) {
    window._a11yResumeWizardAfterScan = false;
    closeA11yPostAreaDetectModal();
    // Se esta resposta veio de um reescaneio (modal de resumo já aberto com
    // dados do scan anterior), fecha também o resumo — sem isso ele ficaria
    // visível mostrando um resultado que não existe mais.
    closeModal('a11y-batch-summary-modal');
    showToast('Nenhum componente do DSC reconhecido nessa área — anote manualmente.');
    return;
  }

  // Quando não há nada elegível pro lote mas existe pelo menos um candidato
  // de aviso, ainda vale abrir o modal de resumo (só pra mostrar o bloco de
  // aviso) em vez de fechar tudo com o toast de "nenhum componente
  // reconhecido", que seria enganoso.
  // Abre o resumo do lote ANTES de fechar o modal de detecção — precisa que
  // window._a11yPendingDetectionArea ainda esteja setado pra pré-selecionar
  // a área de origem no <select> (closeA11yPostAreaDetectModal zera essa
  // variável). closeModal direto (em vez do wrapper) evita empilhar os dois
  // modais visíveis ao mesmo tempo sem perder esse dado.
  openA11yBatchSummaryModal();
  closeModal('a11y-post-area-detect-modal');

  // Retomada via snackbar de "Revisão interrompida" (_resumeA11yBatchWizardForArea)
  // — pula direto pro wizard com o resultado do NOVO scan, sem exigir que o
  // designer veja o resumo e clique em "Iniciar Revisão" de novo.
  // openA11yBatchSummaryModal (acima) já populou window._a11yBatchDetections
  // e pré-selecionou a área no <select>, que é o que startA11yBatchWizard lê.
  if (window._a11yResumeWizardAfterScan) {
    window._a11yResumeWizardAfterScan = false;
    if (eligible.length > 0) startA11yBatchWizard();
  }
}
window.handleA11yPostAreaDetectionResult = handleA11yPostAreaDetectionResult;

// ── Lote "Gerar Handoff Automatizado" ────────────────────────────────────
// Processa as detecções da área corrente (alta E baixa confiança, ver
// window._a11yLooseDetections) de uma vez: mostra um modal de resumo
// agregado, o designer escolhe a Área de destino (pré-requisito — toda spec
// de A11y precisa de a11yAreaId) e confirma uma única vez. O único caminho
// de criação a partir da Detecção Automática — sem confirmação item a item.
function _allA11yAreas() {
  return a11yAreas || [];
}

// Todo item com dscComponentMatch é elegível pro lote — inclui 'titulo'
// (nasce como H1) e 'decorativo' (nasce como subtipo "gerais"), sempre com o
// default mais comum. Decisão consciente do usuário: velocidade acima de
// precisão perfeita — o designer revisa/corrige nível de título e subtipo
// decorativo manualmente depois, em vez de precisar confirmar item a item.
// Também elegível quando dscComponentMatch.isUnmapped === true (componente
// DSC real reconhecido, mas sem categoria de a11y catalogada) — vira
// sugestão "Outro" em elemento.
// `areaId` opcional: quando informado, exclui candidatos cujo nodeId já tem
// spec confirmada NESSA área (_getDocumentedNodeIdsForArea) — sem isso, um
// Reescanear (ou reabrir o resumo) sobre uma área que já teve specs criadas
// reapresenta os mesmos elementos como elegíveis, e confirmar de novo nasce
// specs duplicadas sobre o mesmo targetNodeId (ver bug real documentado em
// _getDocumentedNodeIdsForArea).
function _filterA11yBatchEligible(detections, areaId) {
  const documentedNodeIds = areaId ? _getDocumentedNodeIdsForArea(areaId) : null;
  return (detections || []).filter(d => d && d.dscComponentMatch
    && (d.dscComponentMatch.a11yCategory || d.dscComponentMatch.isUnmapped === true)
    && !(documentedNodeIds && d.nodeId && documentedNodeIds.has(d.nodeId)));
}

// Fonte das detecções pro lote — hac não tem frame, sempre a última
// varredura em memória.
function _currentA11yDetectionsSource() {
  return window._a11yLooseDetections || [];
}

// Reescaneia a mesma área SEM fechar o modal de resumo, pro caso em que o
// designer vincula um Text Style do DSC num item do bloco "Possíveis
// títulos sem token DSC" (ou corrige qualquer outra coisa no Figma) e quer
// ver o resultado atualizado sem perder o contexto (área selecionada,
// scroll, etc.). Passa pela MESMA pergunta bloqueante de origem que a
// Detecção Automática inicial — decisão explícita do usuário: a modal
// aparece toda vez que o scan roda, mesmo reescaneando uma área já
// respondida antes (a lib pode até ter mudado entre uma passada e outra).
// Empilha #a11y-post-area-detect-modal por cima de #a11y-batch-summary-modal
// (ambos ficam tecnicamente abertos; o de resumo só é fechado/reaberto por
// handleA11yPostAreaDetectionResult quando a resposta do scan chega).
function rescanA11yBatchArea() {
  const pending = window._a11yPendingDetectionArea;
  if (!pending || !pending.targetNodeId) {
    showToast('Não foi possível identificar a área para reescanear — marque novamente.');
    return;
  }
  const btn = document.getElementById('btn-a11y-batch-rescan');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('animate-spin');
  }
  window._a11yBatchRescanBtnPending = true;
  pending.declaredOrigin = null;
  const loadingText = document.getElementById('a11y-post-area-loading-text');
  if (loadingText) loadingText.textContent = 'Detectando componentes…';
  _setA11yPostAreaModalStage('origin');
  openModal('a11y-post-area-detect-modal');
}
window.rescanA11yBatchArea = rescanA11yBatchArea;

function openA11yBatchSummaryModal() {
  const allDetections = _currentA11yDetectionsSource();
  // areaId usado pro dedupe de elegibilidade é o MESMO que pré-seleciona o
  // <select> mais abaixo (window._a11yPendingDetectionArea.areaId, com
  // fallback pra primeira área ordenada) — o <select> não tem onchange (não
  // há re-render dinâmico da lista ao trocar de área neste modal hoje), por
  // isso a lista exibida já nasce filtrada contra a área de destino real.
  // Trocar de área no dropdown sem reabrir o modal é um caso não coberto
  // aqui — startA11yBatchWizard lê areaSelect.value no momento em que o
  // wizard é iniciado, então usa a área realmente selecionada (mesmo que
  // diferente de filterAreaId usado só pra esta exibição). O dedupe contra
  // specs já confirmadas (_getDocumentedNodeIdsForArea) só acontece aqui, na
  // montagem da lista exibida — diferente do antigo loop de lote, o wizard
  // NÃO recalcula esse dedupe a cada item confirmado, já que cada item passa
  // por revisão humana individual antes de virar spec (o próprio designer
  // vê o elemento e decide se já foi documentado).
  const pendingAreaIdForFilter = window._a11yPendingDetectionArea && window._a11yPendingDetectionArea.areaId;
  const sortedAreasForFilter = [..._allA11yAreas()].sort((a, b) => (a.number || 0) - (b.number || 0));
  const filterAreaId = pendingAreaIdForFilter && sortedAreasForFilter.some(a => a.id === pendingAreaIdForFilter)
    ? pendingAreaIdForFilter
    : (sortedAreasForFilter[0] ? sortedAreasForFilter[0].id : null);
  const detections = _filterA11yBatchEligible(allDetections, filterAreaId);
  const skippedCount = allDetections.length - detections.length;
  const tokenReviewCandidates = window._a11yTokenReviewCandidates || [];
  if (detections.length === 0 && tokenReviewCandidates.length === 0) return;

  const areas = _allA11yAreas();
  if (detections.length > 0 && areas.length === 0) {
    showToast('Marque uma área da tela antes de gerar o handoff automatizado.');
    return;
  }

  // Agrupa por shortName de componente, pra mostrar contagem agregada ("2
  // Accordion") em vez de listar item a item. A antiga distinção de
  // confiança alta/baixa foi removida do agrupamento e da exibição: com o
  // wizard sequencial, todo item passa por revisão humana individual de
  // qualquer forma, então a distinção virou ruído sem efeito prático
  // (decisão de produto, 2026-09-02) — o campo dscComponentMatch.confidence
  // continua existindo no dado bruto (ver _resolveDscComponentA11yMatch,
  // code.js), só não influencia mais nada visível pro designer aqui. Itens
  // com dscComponentMatch.isUnmapped agrupam por containingFrame (nome do
  // component set DSC real, ex: "[dsc] Alert") em vez de a11yCategory (que
  // vem null nesse caso). 'estrutura' agrupa por containingFrame também no
  // caso mapeado (não só isUnmapped): "[dsc] Header" e "[dsc] Footer"
  // resolvem pro mesmo shortName 'estrutura', mas são marcos de navegação
  // DIFERENTES.
  const groups = {};
  detections.forEach(item => {
    const isUnmapped = item.dscComponentMatch.isUnmapped === true;
    const shortName = isUnmapped ? null : item.dscComponentMatch.a11yCategory;
    const containingFrame = item.dscComponentMatch.containingFrame;
    const key = isUnmapped ? ('outro|' + containingFrame)
      : shortName === 'estrutura' ? ('estrutura|' + containingFrame)
      : shortName;
    if (!groups[key]) groups[key] = { shortName, containingFrame, isUnmapped, count: 0 };
    groups[key].count++;
  });
  const groupList = Object.values(groups).sort((a, b) => {
    const labelA = a.isUnmapped ? _cleanDscContainingFrameName(a.containingFrame) : (A11Y_COMPONENTE_LABELS[a.shortName] || a.shortName);
    const labelB = b.isUnmapped ? _cleanDscContainingFrameName(b.containingFrame) : (A11Y_COMPONENTE_LABELS[b.shortName] || b.shortName);
    return labelA.localeCompare(labelB);
  });

  // Reseta o accordion pra fechado a cada abertura do modal (não deve
  // herdar o estado de um lote anterior) e atualiza o contador do
  // cabeçalho com o total agregado de grupos+itens.
  const groupsBlock = document.getElementById('a11y-batch-summary-groups-block');
  const groupsTitle = document.getElementById('a11y-batch-summary-groups-title');
  if (groupsBlock && groupsTitle) {
    const totalItems = groupList.reduce((sum, g) => sum + g.count, 0);
    groupsTitle.textContent = `Componentes detectados (${groupList.length} grupo${groupList.length === 1 ? '' : 's'}, ${totalItems} ${totalItems === 1 ? 'item' : 'itens'})`;
    const groupsToggleBtn = groupsBlock.querySelector('button[onclick^="toggleAccordion"]');
    const groupsContent = groupsBlock.querySelector('.accordion-content');
    const groupsChevron = groupsToggleBtn ? groupsToggleBtn.querySelector('[data-lucide="chevron-down"]') : null;
    if (groupsContent) groupsContent.classList.add('hidden');
    if (groupsToggleBtn) groupsToggleBtn.setAttribute('aria-expanded', 'false');
    if (groupsChevron) groupsChevron.style.transform = 'rotate(0deg)';
  }

  const groupsWrap = document.getElementById('a11y-batch-summary-groups');
  if (groupsWrap) {
    groupsWrap.innerHTML = groupList.map(g => {
      const label = g.isUnmapped
        ? `Outro (${_cleanDscContainingFrameName(g.containingFrame)})`
        : g.shortName === 'estrutura' ? `Estrutura da Página (${_cleanDscContainingFrameName(g.containingFrame)})`
        : (A11Y_COMPONENTE_LABELS[g.shortName] || _capitalizeFirst(g.shortName));
      return `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl border bg-gray-50 dark:bg-dark-bg border-gray-100 dark:border-dark-line">
          <div class="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-extrabold bg-[#FFF6DC] text-[#FCBE05]">${g.count}</div>
          <p class="flex-1 text-[11px] font-semibold text-slate-700 dark:text-white">${escapeHtml(label)}</p>
        </div>
      `;
    }).join('');
  }

  // Select/botão de lote só fazem sentido quando há algo elegível; no caso
  // "só aviso" ficam ocultos/desabilitados em vez de forçar escolha de área
  // sem propósito.
  const areaSelect = document.getElementById('a11y-batch-area-select');
  const areaWrap = document.getElementById('a11y-batch-area-wrap');
  if (areaWrap) areaWrap.classList.toggle('hidden', detections.length === 0);
  if (areaSelect && detections.length > 0) {
    const sortedAreas = [...areas].sort((a, b) => (a.number || 0) - (b.number || 0));
    areaSelect.innerHTML = sortedAreas.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(String(a.number))}  ${escapeHtml(a.label)}</option>`).join('');
    // Pré-seleciona a área que originou a detecção (fluxo pós-Marcar-Área),
    // quando existir — mais previsível que sempre cair na primeira da lista.
    const pendingAreaId = window._a11yPendingDetectionArea && window._a11yPendingDetectionArea.areaId;
    const preselected = pendingAreaId && sortedAreas.some(a => a.id === pendingAreaId) ? pendingAreaId : (sortedAreas[0] ? sortedAreas[0].id : '');
    areaSelect.value = preselected;
    // Só uma área: não faz sentido exigir escolha, mas deixa visível pra
    // transparência (o designer vê onde as specs vão nascer).
    if (areaWrap) areaWrap.classList.toggle('opacity-60', sortedAreas.length === 1);
    if (sortedAreas.length === 1 && areaSelect) areaSelect.disabled = true;
    else if (areaSelect) areaSelect.disabled = false;
  }

  // Botão passou de "Criar N Especificações" (criação direta em lote) pra
  // "Iniciar Revisão (N itens)" — chama startA11yBatchWizard, que abre o
  // wizard sequencial de confirmação individual (ver decisão de produto:
  // todo item detectado exige confirmação, sem exceção de categoria).
  const confirmBtn = document.getElementById('btn-a11y-batch-confirm');
  if (confirmBtn) {
    confirmBtn.classList.toggle('hidden', detections.length === 0);
    confirmBtn.textContent = `Iniciar Revisão (${detections.length} ${detections.length === 1 ? 'item' : 'itens'})`;
    confirmBtn.disabled = detections.length === 0;
  }

  // _filterA11yBatchEligible não exclui mais categoria nenhuma (titulo/
  // decorativo entram no lote com defaults) — skippedCount só fica > 0 hoje
  // quando o Reescanear reencontra elementos que já viraram spec confirmada
  // nesta área (dedupe por targetNodeId, ver _getDocumentedNodeIdsForArea).
  const skippedNotice = document.getElementById('a11y-batch-summary-skipped-notice');
  if (skippedNotice) {
    if (skippedCount > 0) {
      skippedNotice.textContent = `${skippedCount} ${skippedCount === 1 ? 'item' : 'itens'} não ${skippedCount === 1 ? 'entra' : 'entram'} nesta revisão.`;
      skippedNotice.classList.remove('hidden');
    } else {
      skippedNotice.classList.add('hidden');
    }
  }

  // Renderiza o bloco de aviso (fica oculto se não houver nenhum candidato).
  // Cada item ganha um botão de foco no canvas — nenhuma ação de criação de
  // spec aqui.
  const tokenReviewBlock = document.getElementById('a11y-token-review-block');
  const tokenReviewList = document.getElementById('a11y-token-review-list');
  const tokenReviewTitle = document.getElementById('a11y-token-review-title');
  if (tokenReviewBlock && tokenReviewList) {
    if (tokenReviewCandidates.length === 0) {
      tokenReviewBlock.classList.add('hidden');
      tokenReviewList.innerHTML = '';
    } else {
      tokenReviewBlock.classList.remove('hidden');
      if (tokenReviewTitle) tokenReviewTitle.textContent = `Possíveis títulos sem token DSC (${tokenReviewCandidates.length})`;
      // Sempre reabre fechado (estado do accordion não deve persistir entre
      // lotes diferentes).
      const tokenReviewToggleBtn = tokenReviewBlock.querySelector('button[onclick^="toggleAccordion"]');
      const tokenReviewContent = tokenReviewBlock.querySelector('.accordion-content');
      const tokenReviewChevron = tokenReviewToggleBtn ? tokenReviewToggleBtn.querySelector('[data-lucide="chevron-down"]') : null;
      if (tokenReviewContent) tokenReviewContent.classList.add('hidden');
      if (tokenReviewToggleBtn) tokenReviewToggleBtn.setAttribute('aria-expanded', 'false');
      if (tokenReviewChevron) tokenReviewChevron.style.transform = 'rotate(0deg)';
      tokenReviewList.innerHTML = tokenReviewCandidates.map(item => `
        <div class="flex items-center gap-2 px-3 py-2 rounded-xl border bg-amber-50/60 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40">
          <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true"></i>
          <p class="flex-1 text-[11px] font-semibold text-slate-700 dark:text-white truncate" title="${escapeHtml(item.layerName || item.name || 'Elemento')}">${escapeHtml(item.layerName || item.name || 'Elemento')}</p>
          <button type="button" onclick="focusNode('${item.nodeId}')" title="Focar no canvas" aria-label="Focar no canvas"
            class="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
            <i data-lucide="crosshair" class="w-3.5 h-3.5" aria-hidden="true"></i>
          </button>
        </div>
      `).join('');
      if (typeof _refreshIcons === 'function') _refreshIcons();
    }
  }

  window._a11yBatchDetections = detections;
  openModal('a11y-batch-summary-modal');
}
window.openA11yBatchSummaryModal = openA11yBatchSummaryModal;

function closeA11yBatchSummaryModal() {
  closeModal('a11y-batch-summary-modal');
}
window.closeA11yBatchSummaryModal = closeA11yBatchSummaryModal;

// Espera a resposta 'spec-created' (messages.js) de UMA chamada de
// 'create-unified-spec' antes de disparar a próxima — necessário porque o
// backend calcula posição/import da lib de forma assíncrona por chamada;
// sem serializar, duas criações concorrentes poderiam colidir. Timeout de
// segurança evita travar o wizard inteiro se uma resposta nunca chegar.
// Reaproveitado por confirmA11ySpec quando modal.dataset.wizardActive === '1'
// (decisão de produto: só o wizard precisa serializar — o fluxo manual
// normal continua fire-and-forget, um modal por vez).
function _createA11ySpecAndWait(opts) {
  return new Promise(resolve => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      window._a11yBatchCreateResolve = null;
      resolve(ok);
    };
    const timeoutId = setTimeout(() => finish(false), 15000);
    window._a11yBatchCreateResolve = (ok) => { clearTimeout(timeoutId); finish(ok); };
    parent.postMessage({ pluginMessage: { type: 'create-unified-spec', opts } }, '*');
  });
}

// IDs (node.id reais no canvas) das specs já criadas na mesma Área Marcada E
// na mesma categoria (a11yType) — usado pelo backend (create-unified-spec,
// code.js) pra alinhar o card novo na mesma SUB-COLUNA X das demais specs
// da área+categoria, independente de letra/lado do conector. Categorias
// diferentes da mesma área ganham colunas X distintas (chave composta
// areaId::a11yType) — por isso o filtro aqui precisa dos dois campos.
function _collectAreaSiblingSpecIds(areaId, a11yType) {
  if (!areaId) return [];
  return (a11ySpecs || [])
    .filter(s => s && s.a11yAreaId === areaId && s.a11yType === a11yType && s.id)
    .map(s => s.id);
}

// Todas as specs da mesma área, de QUALQUER categoria — usado pelo backend
// só quando a categoria da spec sendo criada ainda não tem nenhuma spec na
// área (existingAreaSpecIds vem vazio nesse caso): precisa achar a coluna
// mais à direita já ocupada por OUTRA categoria da mesma área pra
// posicionar a nova sub-coluna ao lado dela.
function _collectAreaAllSpecIds(areaId) {
  if (!areaId) return [];
  return (a11ySpecs || [])
    .filter(s => s && s.a11yAreaId === areaId && s.id)
    .map(s => s.id);
}

// Próxima letra livre DENTRO DA ÁREA de destino. Cada área tem seu próprio
// namespace de letras — sem isso o lote poderia começar em letras tipo "K"
// mesmo numa área nova, sem nenhuma relação com o que já existe ali.
// Reaproveitada também por openA11yModal (equivalente do
// _suggestNextSpecTag do Handex, que olhava createdSpecs/a11ySpecs por
// frame — aqui não há frame, então a próxima tag é sempre por área).
function _suggestNextA11yTagForArea(areaId) {
  const specs = (a11ySpecs || []).filter(s => s && s.a11yAreaId === areaId);
  const usedBaseLetters = new Set();
  specs.forEach(s => {
    const raw = String((s && s.letter) || '').trim().toUpperCase();
    const match = raw.match(/^([A-Z]+)/);
    if (match) usedBaseLetters.add(match[1]);
  });
  let i = 0;
  const toLetters = (n) => {
    let s = '';
    n += 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  let candidate = toLetters(i);
  while (usedBaseLetters.has(candidate)) {
    i++;
    candidate = toLetters(i);
  }
  return candidate;
}

// ── Wizard de revisão individual (Detecção Automática) ──────────────────
// Substitui o antigo confirmA11yBatchGenerate (criação em lote sem
// confirmação item a item, removido nesta entrega). Decisão de produto:
// TODO item detectado exige configuração/confirmação individual antes de
// virar spec real — sem exceção de categoria (título e decorativo também
// passam a exigir confirmação, ao contrário do comportamento antigo).
//
// window._a11yBatchWizardState é um SNAPSHOT em memória, não persistido —
// nunca consome/apaga a fonte bruta (window._a11yDetectionsByArea[areaId]/
// window._a11yLooseDetections, que alimentam _collectA11yUndocumentedForArea).
// Por isso cancelar no meio (stopA11yBatchWizard) é de graça: os itens ainda
// não vistos continuam na fonte bruta e voltam a aparecer no accordion "Não
// Documentados" automaticamente, sem nenhuma ação extra aqui. Os já
// confirmados já são specs reais (persistidas via create-unified-spec/
// spec-created) — nada a fazer com eles na hora de parar.
// Ver docs/architecture-state.md pra mais contexto desta decisão.
function _resetA11yBatchWizardUi() {
  const focusBtn = document.getElementById('btn-a11y-wizard-focus');
  if (focusBtn) focusBtn.classList.add('hidden');
  const discardBtn = document.getElementById('btn-a11y-wizard-discard');
  if (discardBtn) discardBtn.classList.add('hidden');
  const progress = document.getElementById('a11y-modal-wizard-progress');
  if (progress) progress.classList.add('hidden');
  const paginator = document.getElementById('a11y-modal-wizard-paginator');
  if (paginator) { paginator.classList.add('hidden'); paginator.innerHTML = ''; }
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  if (confirmBtn) confirmBtn.disabled = false;
  const modal = document.getElementById('a11y-spec-modal');
  if (modal) delete modal.dataset.wizardActive;
}

// Abre a tela de entrada do wizard: monta a fila a partir do MESMO array já
// filtrado que openA11yBatchSummaryModal exibe (window._a11yBatchDetections)
// como um snapshot próprio — trocar de área no meio do wizard não é
// suportado (mesma limitação que o resumo já tinha).
function startA11yBatchWizard() {
  const detections = window._a11yBatchDetections || [];
  const areaSelect = document.getElementById('a11y-batch-area-select');
  const areaId = areaSelect ? areaSelect.value : null;
  if (!areaId) {
    showToast('Selecione a área de destino.');
    return;
  }
  if (detections.length === 0) return;

  window._a11yBatchWizardState = {
    areaId,
    queue: detections.slice(),
    // -1: _advanceA11yBatchWizard busca o próximo pendente a partir de
    // currentIndex + 1, então -1 faz a primeira busca começar no índice 0.
    currentIndex: -1,
    // Sets de ÍNDICES da queue (não dos itens) — permite navegação livre
    // (paginador) consultar o status de qualquer posição em O(1) sem
    // depender de currentIndex ter passado por ali em ordem. Reempurrar o
    // mesmo índice (ex: descartar de novo um item já descartado, ao
    // reabri-lo pelo paginador) é idempotente por construção de Set.
    confirmed: new Set(),
    discarded: new Set(),
  };

  window._a11yExpandedAreaIds = window._a11yExpandedAreaIds || new Set();
  window._a11yExpandedAreaIds.add(areaId);

  closeA11yBatchSummaryModal();
  _advanceA11yBatchWizard();
}
window.startA11yBatchWizard = startA11yBatchWizard;

// Índice do primeiro item pendente (nem confirmado, nem descartado) a
// partir de `from` — usado tanto pra decidir o próximo item ao avançar
// quanto pra saber se a fila inteira já foi resolvida. Navegação livre
// (paginador) significa que "pendente" não é mais só "ainda não alcançado
// por currentIndex": qualquer posição da fila pode estar pendente,
// confirmada ou descartada independente de onde o cursor está agora.
function _findNextA11yWizardPendingIndex(state, from) {
  for (let i = from; i < state.queue.length; i++) {
    if (!state.confirmed.has(i) && !state.discarded.has(i)) return i;
  }
  for (let i = 0; i < from; i++) {
    if (!state.confirmed.has(i) && !state.discarded.has(i)) return i;
  }
  return -1;
}

// Avança pro próximo item pendente da fila (ou encerra, se não sobrar
// nenhum). Chamada tanto pelo início do wizard quanto depois de cada
// confirmação/descarte feitos no item corrente.
function _advanceA11yBatchWizard() {
  const state = window._a11yBatchWizardState;
  if (!state) return;

  const nextIndex = _findNextA11yWizardPendingIndex(state, state.currentIndex + 1);
  if (nextIndex === -1) {
    const confirmedCount = state.confirmed.size;
    const discardedCount = state.discarded.size;
    window._a11yBatchWizardState = null;
    // closeModal direto (não closeA11yModal) — a fila já terminou
    // normalmente, não é um fechamento "externo"/abandono, não deve
    // reacionar stopA11yBatchWizard (que já checaria _a11yBatchWizardState
    // === null e não faria nada, mas ainda assim é mais claro fechar direto
    // aqui e resetar a UI do wizard explicitamente).
    closeModal('a11y-spec-modal');
    _resetA11yBatchWizardUi();
    if (typeof closeA11yPostAreaDetectModal === 'function') closeA11yPostAreaDetectModal();
    if (confirmedCount === 0 && discardedCount === 0) return;
    if (confirmedCount > 0 && discardedCount === 0) {
      showToast(`${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}.`);
    } else if (confirmedCount === 0 && discardedCount > 0) {
      showToast(`Revisão concluída — ${discardedCount} ${discardedCount === 1 ? 'item' : 'itens'} descartado${discardedCount === 1 ? '' : 's'}, nenhuma especificação criada.`);
    } else {
      showToast(`${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}, ${discardedCount} descartado${discardedCount === 1 ? '' : 's'}.`);
    }
    return;
  }

  _openA11yWizardItemAt(nextIndex);
}
window._advanceA11yBatchWizard = _advanceA11yBatchWizard;

// Abre o formulário pra um item específico da fila por índice — usada tanto
// por _advanceA11yBatchWizard (sequencial) quanto pelo paginador (navegação
// livre, qualquer índice, em qualquer direção, revisado ou não).
function _openA11yWizardItemAt(index) {
  const state = window._a11yBatchWizardState;
  if (!state || index < 0 || index >= state.queue.length) return;
  state.currentIndex = index;
  // window._a11yBatchDetections (fonte da fila, ver startA11yBatchWizard) só
  // contém itens com dscComponentMatch (_filterA11yBatchEligible) — nunca
  // candidatos de 'tokenReview' (esses só aparecem como aviso informativo no
  // resumo, nunca entram no lote/wizard). 'detection' é sempre o kind aqui.
  const rawItem = state.queue[index];
  const { category, options } = _resolveA11yFormPresetFromItem(rawItem, 'detection');
  window._a11yPendingAreaId = state.areaId;
  openA11yModal(category, options);
  _applyA11yWizardModalUi(state);
}
window._openA11yWizardItemAt = _openA11yWizardItemAt;

// Pulo direto pra qualquer posição do paginador, em qualquer direção,
// revisado ou não. Itens já confirmados reabrem normalmente (pra
// visualização), mas com "Aplicar" trocado por "Documentado"
// (desabilitado) — ver _applyA11yWizardModalUi — pra nunca duplicar spec
// sobre o mesmo nó. Descartados reabrem totalmente editáveis: navegação
// livre inclui poder reconsiderar um descarte e aplicar depois.
function jumpToA11yWizardItem(index) {
  const state = window._a11yBatchWizardState;
  if (!state) return;
  _openA11yWizardItemAt(index);
}
window.jumpToA11yWizardItem = jumpToA11yWizardItem;

// Reaplica o "modo wizard" da modal (dataset.wizardActive, botões
// Focar/Descartar, progresso "N de M") — openA11yModal sempre reseta esse
// estado no início (ver _resetA11yBatchWizardUi ali dentro), então tanto
// avançar pra um novo item quanto trocar a categoria do item atual (ver
// switchA11yWizardCategory) precisam reaplicar por cima depois de chamar
// openA11yModal.
function _applyA11yWizardModalUi(state) {
  const modal = document.getElementById('a11y-spec-modal');
  if (modal) modal.dataset.wizardActive = '1';
  const focusBtn = document.getElementById('btn-a11y-wizard-focus');
  if (focusBtn) focusBtn.classList.remove('hidden');
  const progress = document.getElementById('a11y-modal-wizard-progress');
  if (progress) {
    progress.textContent = `Item ${state.currentIndex + 1} de ${state.queue.length}`;
    progress.classList.remove('hidden');
  }

  const isConfirmed = state.confirmed.has(state.currentIndex);
  const discardBtn = document.getElementById('btn-a11y-wizard-discard');
  if (discardBtn) discardBtn.classList.toggle('hidden', isConfirmed);
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  if (confirmBtn) {
    confirmBtn.textContent = isConfirmed ? 'Documentado' : 'Aplicar';
    confirmBtn.disabled = isConfirmed;
  }

  const paginator = document.getElementById('a11y-modal-wizard-paginator');
  if (paginator) paginator.classList.remove('hidden');
  _renderA11yWizardPaginator(state);
}

// Só o essencial pra refletir status novo (Set confirmed/discarded mudou)
// sem reabrir o formulário — usado quando uma confirmação assíncrona chega
// pra um item que não é mais o exibido (o designer já pulou pra outro).
function _refreshA11yWizardPaginator(state) {
  if (!state) return;
  _renderA11yWizardPaginator(state);
}
window._refreshA11yWizardPaginator = _refreshA11yWizardPaginator;

// Paginador compacto (padrão "1 2 [3] 4 5 … N"): sempre mostra a primeira e
// a última posição, uma janela ao redor do item atual, com "…" resumindo o
// que fica de fora. Cada botão reflete o status real daquele índice —
// consultado ao vivo nos Sets (confirmed/discarded), não um valor herdado do
// momento em que a fila foi montada.
function _buildA11yWizardPaginatorPages(total, current) {
  const windowSize = 1;
  const pages = new Set([0, total - 1]);
  for (let i = current - windowSize; i <= current + windowSize; i++) {
    if (i >= 0 && i < total) pages.add(i);
  }
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const withGaps = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1] > 1) withGaps.push('gap');
    withGaps.push(page);
  });
  return withGaps;
}

function _renderA11yWizardPaginator(state) {
  const wrap = document.getElementById('a11y-modal-wizard-paginator');
  if (!wrap) return;
  const total = state.queue.length;
  const pages = _buildA11yWizardPaginatorPages(total, state.currentIndex);
  wrap.innerHTML = pages.map(page => {
    if (page === 'gap') return '<span class="w-4 text-center text-[10px] text-slate-300 dark:text-dark-muted shrink-0">…</span>';
    const isCurrent = page === state.currentIndex;
    const isConfirmed = state.confirmed.has(page);
    const isDiscarded = state.discarded.has(page);
    let classes = 'min-w-[20px] h-5 px-1 shrink-0 rounded-full text-[9px] font-extrabold flex items-center justify-center transition-colors ';
    if (isCurrent) {
      classes += 'bg-[#0891B2] text-white shadow-sm shadow-cyan-500/30';
    } else if (isConfirmed) {
      classes += 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
    } else if (isDiscarded) {
      classes += 'bg-gray-100 text-gray-400 hover:bg-gray-200 dark:bg-dark-bg dark:text-dark-muted';
    } else {
      classes += 'bg-gray-50 text-slate-500 hover:bg-cyan-50 hover:text-[#0891B2] dark:bg-dark-bg dark:text-dark-muted dark:hover:bg-cyan-900/20';
    }
    const title = isConfirmed ? 'Documentado' : isDiscarded ? 'Descartado' : 'Pendente';
    return `<button type="button" onclick="jumpToA11yWizardItem(${page})" title="Item ${page + 1} — ${title}" aria-label="Item ${page + 1} — ${title}" aria-current="${isCurrent ? 'true' : 'false'}" class="${classes}">${page + 1}</button>`;
  }).join('');
}

// Centraliza/dá zoom no elemento do item atual do wizard no canvas — reusa o
// mesmo nodeId que openA11yModal já grava em modal.dataset.pendingTargetNodeId
// (ver _advanceA11yBatchWizard acima) em vez de duplicar estado próprio do
// wizard. Mesma função focusNode(id) (core.js) usada na listagem de specs.
function focusA11yWizardCurrentNode() {
  const modal = document.getElementById('a11y-spec-modal');
  const nodeId = modal ? modal.dataset.pendingTargetNodeId : '';
  if (!nodeId) return;
  focusNode(nodeId);
}
window.focusA11yWizardCurrentNode = focusA11yWizardCurrentNode;

// Descarta o item corrente sem criar spec — nunca chama create-unified-spec.
// Idempotente por índice (Set): reabrir pelo paginador um item já
// confirmado nunca chega aqui (botão vira "Documentado", ver
// _applyA11yWizardModalUi), então não há risco de descartar algo que já
// virou spec real.
function discardCurrentA11yBatchWizardItem() {
  const state = window._a11yBatchWizardState;
  if (!state) return;
  state.discarded.add(state.currentIndex);
  _advanceA11yBatchWizard();
}
window.discardCurrentA11yBatchWizardItem = discardCurrentA11yBatchWizardItem;

// Encerra o wizard a qualquer momento — X, backdrop e Esc chamam via
// closeA11yModal (viaExplicitCancelButton = false); o botão "Cancelar" chama
// via cancelA11yModalExplicit (viaExplicitCancelButton = true). Itens já
// confirmados permanecem como specs reais; os pendentes (nem confirmados,
// nem descartados — navegação livre significa que isso não é mais só "do
// currentIndex em diante") voltam automaticamente pra "Não Documentados" —
// não precisam de nenhum tratamento aqui, a fonte bruta nunca foi tocada.
//
// Quando o fechamento NÃO veio do botão "Cancelar" (pode ter sido
// acidental — clique perdido no X/backdrop, Esc sem querer) e ainda restam
// itens na fila, oferece retomar via snackbar com ação: reabrir a revisão
// dispara um NOVO scan da área (não reaproveita a fila antiga em memória),
// porque o canvas pode ter mudado entre o cancelamento e a retomada.
// Reaproveita o mesmo caminho de scan que a Detecção Automática usa
// (openA11yPostAreaDetectModal), então o dedupe por targetNodeId contra
// specs já confirmadas continua valendo automaticamente — ver
// _filterA11yBatchEligible/_getDocumentedNodeIdsForArea.
function stopA11yBatchWizard(viaExplicitCancelButton) {
  const state = window._a11yBatchWizardState;
  window._a11yBatchWizardState = null;
  _resetA11yBatchWizardUi();
  closeModal('a11y-spec-modal');
  if (typeof closeA11yPostAreaDetectModal === 'function') closeA11yPostAreaDetectModal();
  if (!state) return;
  const confirmedCount = state.confirmed.size;
  const remaining = state.queue.length - state.confirmed.size - state.discarded.size;
  const areaId = state.areaId;
  if (!viaExplicitCancelButton && remaining > 0 && areaId) {
    const message = confirmedCount > 0
      ? `Revisão interrompida — ${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}, ${remaining} ${remaining === 1 ? 'item' : 'itens'} de volta pra "Não Documentados".`
      : `Revisão interrompida — ${remaining} ${remaining === 1 ? 'item' : 'itens'} continua${remaining === 1 ? '' : 'm'} em "Não Documentados".`;
    showSnackbar(message, {
      actionLabel: 'Continuar revisão',
      onAction: () => _resumeA11yBatchWizardForArea(areaId),
    });
    return;
  }
  if (confirmedCount > 0) {
    showToast(`Revisão interrompida — ${confirmedCount} especifica${confirmedCount === 1 ? 'ção criada' : 'ções criadas'}, ${remaining} ${remaining === 1 ? 'item' : 'itens'} de volta pra "Não Documentados".`);
  } else {
    showToast(`Revisão interrompida — ${remaining} ${remaining === 1 ? 'item' : 'itens'} continua${remaining === 1 ? '' : 'm'} em "Não Documentados".`);
  }
}
window.stopA11yBatchWizard = stopA11yBatchWizard;

// Dispara um novo scan da área (mesmo caminho que a Detecção Automática
// inicial usa) e, quando o resultado chegar, reabre o wizard direto — sem
// passar pelo modal de resumo agregado, pra ser o mais próximo possível de
// "retomar de onde parou" com um clique só. handleA11yPostAreaDetectionResult
// (fluxo normal de scan) já monta window._a11yBatchDetections/
// window._a11yPendingDetectionArea; aqui só marcamos a intenção de pular
// direto pro wizard quando esse resultado chegar.
function _resumeA11yBatchWizardForArea(areaId) {
  const area = _findA11yAreaById(areaId);
  if (!area || !area.targetNodeId) {
    showToast('Não foi possível localizar a área para retomar — reescaneie manualmente.');
    return;
  }
  window._a11yResumeWizardAfterScan = true;
  openA11yPostAreaDetectModal(area);
}
window._resumeA11yBatchWizardForArea = _resumeA11yBatchWizardForArea;

// Remover a entrada também remove o nó no canvas (mesmo padrão de
// deleteA11yArea logo abaixo) — specs de A11y têm nó real desde a criação.
function deleteA11ySpec(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec) return;
  if (spec.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
  }
  a11ySpecs.splice(originalIndex, 1);
  saveToStorage();
  renderA11yGroupedList();
}
window.deleteA11ySpec = deleteA11ySpec;

// Mostrar/ocultar o nó da spec no canvas — mesmo par de mensagens
// ('hide-node'/'show-node') que specs normais usam no Handex.
function toggleA11ySpecVisibility(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec || !spec.id) return;
  spec.visible = spec.visible === false ? true : false;
  parent.postMessage({ pluginMessage: { type: spec.visible === false ? 'hide-node' : 'show-node', id: spec.id } }, '*');
  saveToStorage();
  renderA11yGroupedList();
}
window.toggleA11ySpecVisibility = toggleA11ySpecVisibility;

// Estado efêmero (não persiste entre sessões) das áreas ocultadas de uma vez
// pelo botão de olho no cabeçalho do card. Set de areaId, não de spec.id —
// a visibilidade por spec continua controlada individualmente por
// toggleA11ySpecVisibility.
window._a11yAreaHiddenIds = window._a11yAreaHiddenIds || new Set();

// Ocultar/mostrar TUDO de uma área de uma vez: as specs de leitor de tela (5
// categorias) e os itens de Ordem de Tabulação daquela área — que vivem numa
// CÓPIA separada do frame, não nos elementos de trabalho reais.
function toggleAreaGroupVisibility(areaId) {
  if (window._a11yAreaHiddenIds.has(areaId)) {
    window._a11yAreaHiddenIds.delete(areaId);
  } else {
    window._a11yAreaHiddenIds.add(areaId);
  }
  const hidden = window._a11yAreaHiddenIds.has(areaId);

  (a11ySpecs || []).forEach(spec => {
    if (!spec || spec.a11yAreaId !== areaId || !spec.id) return;
    spec.visible = !hidden;
    parent.postMessage({ pluginMessage: { type: hidden ? 'hide-node' : 'show-node', id: spec.id } }, '*');
  });

  // Cópia de Ordem de Tabulação: fire-and-forget, o backend simplesmente
  // não encontra nada se a área nunca gerou cópia.
  parent.postMessage({ pluginMessage: { type: 'toggle-tab-order-copy-visibility', areaId, visible: !hidden } }, '*');

  saveToStorage();
  renderA11yGroupedList();
}
window.toggleAreaGroupVisibility = toggleAreaGroupVisibility;

// "Concluir posicionamento" — trava o specGroup no canvas (lock-spec aceita
// o prefixo '[SpecA11y | ...]', ver regex em code.js). A UI só some o aviso
// "Posicionando…" quando a resposta 'spec-locked' chega (messages.js).
// Specs de A11y nascem travadas — este toggle é o único jeito de mexer
// nelas depois.
function toggleA11ySpecLock(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec || !spec.id) return;
  const isNowUnlocked = spec.locked === false;
  spec.locked = isNowUnlocked ? true : false;
  parent.postMessage({ pluginMessage: { type: 'unlock-spec-group', specIds: [spec.id], locked: spec.locked } }, '*');
  saveToStorage();
  renderA11yGroupedList();
  showToast(isNowUnlocked
    ? 'Especificação travada novamente.'
    : 'Especificação destravada — edite com cuidado e trave novamente ao concluir.');
}
window.toggleA11ySpecLock = toggleA11ySpecLock;

// Abre o mesmo formulário usado pra criar (sem passar pelo seletor de
// categoria — a categoria de uma spec existente não muda) já preenchido com
// os dados atuais. confirmA11ySpec detecta modal.dataset.editingSpecId e, em
// vez de só criar, apaga o nó antigo no canvas e recria com os valores
// atualizados.
function editA11ySpec(originalIndex) {
  const spec = a11ySpecs[originalIndex];
  if (!spec || !spec.a11yType) return;
  window._a11yPendingAreaId = spec.a11yAreaId || null;
  // targetNodeName/dscComponentName (já salvos na spec) populam os 2 campos
  // read-only do topo do formulário também em modo edição — mesmos dados que
  // a criação exibe, sem depender de nova resolução via canvas/scan.
  openA11yModal(spec.a11yType, {
    a11yOrigin: spec.a11yOrigin || 'web',
    targetNodeName: spec.targetNodeName || null,
    dscComponentName: spec.a11yDscComponentName || null,
    // Sinaliza pra openA11yModal não disparar get-selection-name — os 2
    // campos read-only já foram resolvidos acima a partir da spec salva, sem
    // depender da seleção atual do canvas (que é irrelevante aqui e mudaria
    // silenciosamente o conteúdo exibido quando a resposta assíncrona
    // chegasse). Ver comentário em openA11yModal.
    editing: true,
  });
  const modal = document.getElementById('a11y-spec-modal');
  if (modal) {
    modal.dataset.editingSpecId = spec.id || '';
    modal.dataset.editingOriginalIndex = String(originalIndex);
  }
  _prefillA11ySpecForEdit(spec);
  const confirmBtn = document.getElementById('btn-a11y-confirm');
  if (confirmBtn) confirmBtn.textContent = 'Salvar';
}
window.editA11ySpec = editA11ySpec;

// Reconstrói os campos do formulário a partir de spec.a11ySubtype (chave
// crua da subvariante) e spec.properties[] (valores já resolvidos/digitados
// pelo designer) — o inverso exato do que confirmA11ySpec monta por
// categoria.
function _prefillA11ySpecForEdit(spec) {
  const category = spec.a11yType;
  const sub = spec.a11ySubtype || {};
  const props = spec.properties || [];
  const getProp = key => {
    const p = props.find(x => x.key === key);
    return p ? p.value : '';
  };
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) { el.value = val; updateA11yCharCounter(el); }
  };

  const tagInputId = A11Y_TAG_INPUT_ID[category];
  if (tagInputId) setVal(tagInputId, spec.letter || 'A');

  if (category === 'elemento') {
    const modal = document.getElementById('a11y-spec-modal');
    const isMobile = !!modal && modal.dataset.a11yOrigin === 'mobile';
    const select = document.getElementById('a11y-el-componente-select');
    // Specs mobile nunca restauram o select desktop (bloco fica escondido,
    // ver _toggleA11yElementoDesktopBlock) — mesmo specs mobile ANTIGAS que
    // tenham sub.componente preenchido (resquício de quando o bug de
    // exclusão mútua existia) simplesmente ignoram esse campo aqui, sem
    // quebrar o resto do formulário.
    if (!isMobile) {
      if (sub.isOutro) {
        if (select) select.value = 'outro';
        setVal('a11y-el-componente-outro', getProp('componente'));
      } else if (sub.componente && select) {
        select.value = sub.componente;
      }
    } else if (sub.isOutro) {
      // Spec mobile ANTIGA que nasceu com isOutro=true (antes desta correção,
      // quando o "Outro" desktop ainda convivia com o bloco mobile) — o nome
      // real do componente documentado estava em properties['componente'].
      // Reabrir pra edição precisa recuperar esse valor sem quebrar: joga no
      // campo de texto livre "Link ou nome do componente" mobile (mesmo
      // espírito do "Personalizado", ver A11Y_MOBILE_LINK_COMPONENT_OPTIONS),
      // só se o campo de link real ainda não tiver um valor próprio salvo.
      // _renderA11yElementoMobileFields (chamada por updateA11yElementoFields
      // logo abaixo) precisa já ter recriado #a11y-el-mobile-link-url antes
      // deste valor ser aplicado — por isso este preenchimento acontece de
      // novo, redundante, depois de updateA11yElementoFields mais adiante
      // (ver bloco _restoreA11yElementoMobileToggles/fallback isOutro logo
      // após).
      window._a11yPrefillMobileOutroComponente = getProp('componente') || '';
    }
    // Restaura a sub-variante mobile salva (componente/link/texto
    // alternativo) ANTES de updateA11yElementoFields — _renderA11yElemento
    // MobileFields (chamada de dentro dela) lê o radio marcado pra decidir
    // qual bloco condicional montar. Specs desktop (sub.variant ausente)
    // não têm esse radio no DOM relevante (bloco fica escondido por origem).
    if (sub.variant) {
      const mobileVariantRadio = document.querySelector(`input[name="a11y-el-mobile-variant"][value="${sub.variant}"]`);
      if (mobileVariantRadio) mobileVariantRadio.checked = true;
    }
    const mobileList = document.getElementById('a11y-el-mobile-toggles-list');
    if (mobileList) delete mobileList.dataset.renderedVariant; // força reconstrução do bloco certo
    updateA11yElementoFields();
    setVal('a11y-el-label', getProp('label'));
    // Restaura a variante secundária salva (ex: Button → "de icone") —
    // updateA11yElementoFields acima já recriou o <select> pro componente
    // certo, aqui só aplicamos o valor gravado em cima do default.
    _restoreA11yElementoVariant(sub.tipo);
    // Restaura os toggles dinâmicos salvos (Nome Acessível/Observações/Notas
    // de Código).
    _restoreA11yElementoToggles(props);
    // Restaura os campos exclusivos mobile (Dica para Leitor de Tela/Nome
    // Acessível/Observações/Link do Componente/Descrição livre — conforme a
    // sub-variante) — só existem em specs mobile; updateA11yElementoFields
    // acima já rendereu o bloco certo a partir do radio de variante e de
    // modal.dataset.a11yOrigin, setados antes desta chamada.
    _restoreA11yElementoMobileToggles(props);
    // Fallback pra specs mobile ANTIGAS com isOutro=true (ver bloco acima) —
    // só preenche se o campo real de link ainda estiver vazio (spec antiga
    // não tinha linkComponente, então não há conflito de valor).
    if (window._a11yPrefillMobileOutroComponente) {
      const linkUrl = document.getElementById('a11y-el-mobile-link-url');
      if (linkUrl && !linkUrl.value.trim()) linkUrl.value = window._a11yPrefillMobileOutroComponente;
      delete window._a11yPrefillMobileOutroComponente;
    }
  } else if (category === 'estrutura') {
    const subtipoSelect = document.getElementById('a11y-estrutura-subtipo-select');
    if (subtipoSelect) subtipoSelect.value = sub.variacao || 'idiomas';
    if (sub.variacao === 'marco de navegacao') {
      const marcoSelect = document.getElementById('a11y-estrutura-marco-select');
      if (marcoSelect) marcoSelect.value = sub.tipo || 'header';
    } else if (sub.variacao === 'idiomas') {
      const idiomasSelect = document.getElementById('a11y-estrutura-idiomas-select');
      if (idiomasSelect) idiomasSelect.value = sub.idioma || 'da pagina';
    }
    updateA11yEstruturaFields();
    const isCustom = sub.variacao === 'customizavel' || (sub.variacao === 'marco de navegacao' && sub.tipo === 'customizavel');
    if (isCustom) setVal('a11y-estrutura-descricao', getProp('descricao'));
    _restoreA11yFixedToggles('a11y-estrutura-toggles-list', props);
  } else if (category === 'titulo') {
    const nivelSelect = document.getElementById('a11y-titulo-nivel-select');
    if (nivelSelect) nivelSelect.value = sub.nivel || 'h1';
    updateA11yTituloFields();
    _restoreA11yFixedToggles('a11y-titulo-toggles-list', props);
  } else if (category === 'decorativo') {
    const decSelect = document.getElementById('a11y-decorativo-subtipo-select');
    if (decSelect) decSelect.value = sub.tipo || 'gerais';
    updateA11yDecorativoFields();
    _restoreA11yFixedToggles('a11y-decorativo-toggles-list', props);
  } else if (category === 'informacoes') {
    const infoSelect = document.getElementById('a11y-informacoes-subtipo-select');
    if (infoSelect) infoSelect.value = sub.subtipo || 'handoffs';
    updateA11yInformacoesFields();
    const isCustom = sub.subtipo === 'customizavel';
    if (isCustom) setVal('a11y-informacoes-descricao', getProp('descricao'));
    _restoreA11yFixedToggles('a11y-informacoes-toggles-list', props);
  }

  validateA11yTagInput();

  const guideRadio = document.querySelector(`input[name="a11y-guide-side"][value="${spec.guideSide || 'right'}"]`);
  if (guideRadio) guideRadio.checked = true;

  const drawModeRadio = document.querySelector(`input[name="a11y-draw-mode"][value="${spec.drawMode || 'contorno'}"]`);
  if (drawModeRadio) drawModeRadio.checked = true;
}

// ── Áreas Marcadas ───────────────────────────────────────────────────────
// Selo azul numerado (1, 2, 3...) apontando uma seção/região da tela. Vira o
// agrupamento principal da aba: cada área é um accordion e toda spec de A11y
// nasce dentro de uma área. Numeração sequencial por PROJETO inteiro (nunca
// reaproveita número de área excluída).
function openA11yAreaModal() {
  const input = document.getElementById('a11y-area-label-input');
  if (input) { input.value = ''; updateA11yCharCounter(input); }
  const conectorDefault = document.querySelector('input[name="a11y-area-conector"][value="superior"]');
  if (conectorDefault) conectorDefault.checked = true;
  // Sugere o próximo número livre, mas deixa editável — o designer pode
  // querer reordenar áreas ou pular números de propósito.
  const numberInput = document.getElementById('a11y-area-number-input');
  if (numberInput) numberInput.value = _nextA11yAreaNumber();
  openModal('a11y-area-modal');
  setTimeout(() => { if (input) input.focus(); }, 50);
  // Pré-preenche com o nome do frame/elemento selecionado no canvas — só
  // cosmético, o designer pode sobrescrever antes de confirmar.
  _getA11ySelectionInfo().then(sel => {
    const modal = document.getElementById('a11y-area-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (input && !input.value && sel && sel.name) { input.value = sel.name; updateA11yCharCounter(input); }
  });
}
window.openA11yAreaModal = openA11yAreaModal;

// Rebusca a seleção atual do canvas e substitui o rótulo — diferente do
// pré-preenchimento de abertura (que só entra se o campo estiver vazio),
// aqui é ação explícita do designer, então sempre sobrescreve.
function refreshA11yAreaLabelFromSelection() {
  const input = document.getElementById('a11y-area-label-input');
  _getA11ySelectionInfo().then(sel => {
    if (!sel || !sel.name) {
      showToast('Selecione um elemento no canvas antes de atualizar o nome.');
      return;
    }
    if (input) { input.value = sel.name; updateA11yCharCounter(input); }
  });
}
window.refreshA11yAreaLabelFromSelection = refreshA11yAreaLabelFromSelection;

function closeA11yAreaModal() {
  closeModal('a11y-area-modal');
}
window.closeA11yAreaModal = closeA11yAreaModal;

function _nextA11yAreaNumber() {
  const max = (a11yAreas || []).reduce((m, a) => Math.max(m, (a && a.number) || 0), 0);
  return max + 1;
}

// A origem web/mobile também é necessária aqui, na criação da própria
// Área — o selo de número da Área (A11Y_AREA_CONECTOR_KEYS no backend)
// precisa saber se importa o componente desktop ou mobile da lib Design
// Acessível, e esse momento é ANTES de qualquer Detecção Automática rodar
// (ela só é disparada depois que a área já existe, se autoDetect estiver
// ligado). Usa ensureA11yProjectOriginThen (ver bloco "Origem do projeto"
// acima): se hacData.projectOrigin já foi respondido nesta sessão do
// arquivo, segue direto sem perguntar de novo — decisão de produto de
// 2026-09-02, que substitui a pergunta independente por área (2026-09-01).
function confirmA11yArea() {
  const input = document.getElementById('a11y-area-label-input');
  const label = input ? input.value.trim() : '';
  if (!label) {
    showToast('Informe o rótulo da área.');
    return;
  }
  const conectorInput = document.querySelector('input[name="a11y-area-conector"]:checked');
  const conector = conectorInput ? conectorInput.value : 'superior';
  const numberInput = document.getElementById('a11y-area-number-input');
  const number = numberInput && numberInput.value ? parseInt(numberInput.value, 10) : _nextA11yAreaNumber();
  // Escolha Automático/Manual feita junto com a criação da área (default
  // 'auto', mesmo se nada vier marcado).
  const modeInput = document.querySelector('input[name="a11y-area-detect-mode"]:checked');
  const autoDetect = (modeInput ? modeInput.value : 'auto') === 'auto';
  closeA11yAreaModal();
  _getA11ySelectionInfo().then(sel => {
    if (!sel || !sel.id) {
      showToast('Selecione um elemento no canvas antes de marcar a área.');
      return;
    }
    ensureA11yProjectOriginThen((origin) => {
      parent.postMessage({ pluginMessage: { type: 'create-a11y-area', targetNodeId: sel.id, label, number, conector, autoDetect, origin } }, '*');
    });
  });
}
window.confirmA11yArea = confirmA11yArea;

// Excluir uma área remove o selo do canvas, a entrada do array, E TODAS AS
// SPECS vinculadas a ela (a11yAreaId === area.id) — exclusão em cascata, sem
// confirmação extra (decisão do usuário). Antes as specs vinculadas viravam
// órfãs no bucket "Sem área"; isso deixava specs de canvas "mortas" (a área
// que as contextualizava já não existe mais). Também cobre a Ordem de
// Tabulação desta área: os itens já aplicados (selos na cópia do frame) E a
// própria cópia (identificada só pelo pluginData
// hacTabOrderCopyForArea, já que o nome pode ter sido editado pelo
// designer) — senão a cópia ficava órfã no canvas.
function deleteA11yArea(originalIndex) {
  const area = a11yAreas[originalIndex];
  if (!area) return;

  const specsToRemove = (a11ySpecs || []).filter(s => s && s.a11yAreaId === area.id);
  specsToRemove.forEach(spec => {
    if (spec.id) parent.postMessage({ pluginMessage: { type: 'delete-node', id: spec.id } }, '*');
  });
  if (specsToRemove.length > 0) {
    a11ySpecs = a11ySpecs.filter(s => !(s && s.a11yAreaId === area.id));
  }

  const tabItemsToRemove = _currentTabOrderItems(area.id);
  tabItemsToRemove.forEach(it => {
    if (it.id) parent.postMessage({ pluginMessage: { type: 'delete-node', id: it.id } }, '*');
  });
  if (tabItemsToRemove.length > 0) {
    tabOrderItems = (tabOrderItems || []).filter(it => !(it && it.a11yAreaId === area.id));
  }
  parent.postMessage({ pluginMessage: { type: 'delete-tab-order-copy-for-area', areaId: area.id } }, '*');

  if (area.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: area.id } }, '*');
  }
  a11yAreas.splice(originalIndex, 1);
  saveToStorage();
  renderA11yGroupedList();
}
window.deleteA11yArea = deleteA11yArea;

// ── Ordem de Tabulação ───────────────────────────────────────────────────
// Ferramenta SEPARADA de "Especificação para Leitor de Tela" (Áreas
// Marcadas acima) — documenta a sequência de foco do teclado (tecla Tab),
// não uma marcação de seção/região. Usa o componente real "[a11y] Item
// Number" (family "handoff"), não o "[a11y] Conectores" usado por Marcar
// Área.
//
// Escopo por área: cada Área Marcada tem sua própria sequência 1,2,3... —
// os itens continuam numa lista solta só (tabOrderItems, mesma estrutura de
// sempre), só ganharam o campo a11yAreaId. "Reiniciar por área" é sempre
// uma questão de FILTRAR por a11yAreaId ao calcular o próximo número e ao
// exibir/reordenar — nunca de reestruturar o array em sub-arrays. Itens
// legados sem a11yAreaId caem no bucket "Sem área" (mesmo padrão visual do
// bucket de specs órfãs, _a11ySemAreaAccordionEl acima), só como vitrine
// read-only.
//
// Arquitetura: nenhum selo é desenhado sobre os elementos de trabalho
// reais. Clique manual e varredura automática apenas POPULAM uma LISTA
// PENDENTE em memória (window._tabOrderPendingList) revisável no modal
// #a11y-tab-order-review-modal — só ao clicar "Aplicar no Canvas"
// (applyTabOrderToCanvas) é que o backend clona o frame da área e desenha
// os selos na cópia (handler apply-tab-order-to-canvas, code.js).
//
// Decisão de UX: o modal de revisão fica aberto durante TODO o fluxo
// manual, não só ao final — abrir o modal já no início do clique
// sequencial dá feedback "ao vivo" da lista sendo montada. "+ Adicionar
// item" (usado só no automático, mas disponível nos dois) reaproveita
// exatamente o mesmo mecanismo de captura de clique que o manual já usa
// por baixo — só muda se o modo fica "sempre ouvindo" (manual) ou "ouve um
// clique e para" (adicionar item avulso).
window._tabOrderPendingList = [];
window._tabOrderPendingAreaId = null;
window._tabOrderPendingTargetNodeId = null;
// 'continuous' (fluxo manual, ouve toda seleção enquanto o modal estiver
// aberto) | 'single' (aguardando exatamente 1 clique via "+ Adicionar item")
// | null (parado). core.js guarda contra navegação/troca de view enquanto
// esta flag está ativa, chamando cancelTabOrderReview() automaticamente.
window._tabOrderCaptureMode = null;
let _tabOrderTempIdSeq = 1;

function _tabOrderNextTempId() {
  return `tmp-${_tabOrderTempIdSeq++}`;
}

// Ativado pelo botão "Iniciar Ordem de Tabulação" — reinicia a lista
// pendente (fluxo novo, nunca acumula com uma sessão anterior não aplicada)
// e abre o modal já em modo de escuta contínua.
//
// Dispara 'start-tab-order-copy' ANTES de abrir a escuta de cliques: o
// backend clona o frame da área IMEDIATAMENTE (cópia vazia, sem selos
// ainda), pra que o frame ORIGINAL fique 100% intocado durante todo o
// fluxo manual (o highlight temporário de cada clique passa a ser
// desenhado sobre o node equivalente dentro da cópia, nunca mais no
// original). Resposta tratada em handleTabOrderCopyStarted
// (messages.js → aqui).
function startTabOrderManualMode(areaId, targetNodeId) {
  if (!areaId || !targetNodeId) {
    showToast('Marque uma área da tela antes de iniciar a ordem de tabulação.');
    return;
  }
  ensureA11yProjectOriginThen((origin) => {
    window._tabOrderDeclaredOrigin = origin;
    window._tabOrderPendingList = [];
    window._tabOrderPendingAreaId = areaId;
    window._tabOrderPendingTargetNodeId = targetNodeId;
    window._tabOrderActiveCloneId = null;
    window._tabOrderActiveCloneNodeMap = null;
    parent.postMessage({ pluginMessage: { type: 'start-tab-order-copy', areaId, targetNodeId } }, '*');
    openTabOrderReviewModal();
    _tabOrderSetCaptureMode('continuous');
    showToast('Cópia da área criada — clique nos elementos dela, em sequência.');
  });
}
window.startTabOrderManualMode = startTabOrderManualMode;

// Resposta de 'tab-order-copy-started' (messages.js) — guarda o id da cópia
// rascunho e o mapa original→clone (objeto plano {nodeId-original:
// nodeId-do-clone}) pra uso local (diagnóstico/eventual necessidade futura
// do front); o BACKEND também guarda o mapa completo em memória — é ele
// quem de fato resolve original→clone a cada highlight, o front só precisa
// saber que a cópia existe.
function handleTabOrderCopyStarted(cloneId, nodeMap) {
  window._tabOrderActiveCloneId = cloneId || null;
  window._tabOrderActiveCloneNodeMap = nodeMap || null;
}
window.handleTabOrderCopyStarted = handleTabOrderCopyStarted;

// Abre o modal de revisão vazio/pré-populado — chamado tanto pelo início do
// fluxo manual quanto pela chegada do resultado da varredura automática
// (addTabOrderItemsFromLayers). Idempotente: reabrir com o modal já aberto
// só re-renderiza a lista.
function openTabOrderReviewModal() {
  openModal('a11y-tab-order-review-modal');
  _renderTabOrderPendingList();
}
window.openTabOrderReviewModal = openTabOrderReviewModal;

// Liga/desliga a escuta de seleção do canvas no backend. 'continuous' e
// 'single' usam o MESMO listener/mensagem do backend
// (start-tab-order-mode); a diferença de comportamento (adicionar 1x vs.
// continuamente) é decidida aqui no front, em
// handleTabOrderSelectionChanged, olhando window._tabOrderCaptureMode.
function _tabOrderSetCaptureMode(mode) {
  const wasOff = !window._tabOrderCaptureMode;
  window._tabOrderCaptureMode = mode;
  if (mode && wasOff) {
    parent.postMessage({ pluginMessage: { type: 'start-tab-order-mode' } }, '*');
  } else if (!mode && !wasOff) {
    parent.postMessage({ pluginMessage: { type: 'stop-tab-order-mode' } }, '*');
  }
}

// Botão "+ Adicionar item" dentro do modal — entra em modo de escuta única:
// o próximo clique no canvas vira item pendente e a escuta volta ao modo
// anterior (contínuo, se o fluxo manual ainda estiver "aberto"; ou some de
// vez, se veio do automático puro). O botão muda de rótulo/estado enquanto
// espera, pra dar feedback claro de "modo à espera".
function startTabOrderAddItemWait() {
  const btn = document.getElementById('btn-tab-order-add-item');
  const label = btn ? btn.querySelector('[data-tab-order-add-item-label]') : null;
  window._tabOrderResumeCaptureMode = window._tabOrderCaptureMode;
  _tabOrderSetCaptureMode('single');
  if (label) label.textContent = 'Selecione um elemento no canvas…';
  if (btn) btn.disabled = true;
}
window.startTabOrderAddItemWait = startTabOrderAddItemWait;

function _tabOrderResetAddItemButton() {
  const btn = document.getElementById('btn-tab-order-add-item');
  const label = btn ? btn.querySelector('[data-tab-order-add-item-label]') : null;
  if (label) label.textContent = 'Adicionar item';
  if (btn) btn.disabled = false;
}

// Chamado por messages.js a cada tab-order-selection-changed recebido do
// backend enquanto alguma escuta está ativa (contínua ou de 1 clique só).
// NUNCA cria nada no canvas aqui — só empurra pra lista pendente e aplica o
// highlight temporário (feedback "isso foi capturado").
//
// SEM BLOQUEIO (decisão de produto revertida em 2026-09-02): o reconhecimento
// automático de "acionável" via matching DSC (_isA11yInteractiveComponentKey)
// não é confiável o suficiente — falha em Icon Buttons de libs não mapeadas e
// em cards customizados sem match no catálogo (ex.: "Meus cartões",
// "Carteiras digitais", "Click to Pay"). Como não há garantia real de
// reconhecimento, qualquer clique no modo de captura entra direto na lista
// pendente, sem checagem nem aviso — o designer decide 100% nesse fluxo.
function handleTabOrderSelectionChanged(nodeId, nodeName) {
  if (!window._tabOrderCaptureMode || !nodeId) return;

  const wasSingle = window._tabOrderCaptureMode === 'single';
  window._tabOrderPendingList.push({ nodeId, nodeName: nodeName || '', tempId: _tabOrderNextTempId() });
  // Usa o handler dedicado highlight-tab-order-copy-node (code.js), que
  // resolve o nodeId ORIGINAL pro node equivalente dentro da cópia
  // rascunho (criada em startTabOrderManualMode) e desenha o contorno lá —
  // o original nunca é tocado.
  parent.postMessage({ pluginMessage: { type: 'highlight-tab-order-copy-node', id: nodeId, highlight: true, color: '#0891B2', selectNode: false, shouldScroll: false } }, '*');

  if (wasSingle) {
    _tabOrderSetCaptureMode(window._tabOrderResumeCaptureMode || null);
    window._tabOrderResumeCaptureMode = null;
    _tabOrderResetAddItemButton();
  }

  _renderTabOrderPendingList();
}
window.handleTabOrderSelectionChanged = handleTabOrderSelectionChanged;

// Destaca um item da lista PENDENTE no canvas — usa o mesmo handler dedicado
// highlight-tab-order-copy-node (code.js) que o clique direto no canvas em
// handleTabOrderSelectionChanged já usa, em vez do sendHighlight genérico
// (que dispara highlight-node contra o node ORIGINAL). A lista pendente só
// existe enquanto a cópia rascunho está ativa, então o destaque tem que
// resolver original→clone como todo o resto do fluxo de Ordem de
// Tabulação — senão o retângulo aparece no frame errado (o original, nunca
// tocado por esse fluxo).
function _highlightTabOrderListItem(nodeId) {
  if (!nodeId) return;
  parent.postMessage({ pluginMessage: { type: 'highlight-tab-order-copy-node', id: nodeId, highlight: true, color: '#0891B2', selectNode: false, shouldScroll: false } }, '*');
}
window._highlightTabOrderListItem = _highlightTabOrderListItem;

// Renderiza a lista PENDENTE (ainda não aplicada no canvas) dentro do modal
// de revisão — reaproveita o mesmo padrão visual/drag-and-drop de
// _renderTabOrderListForArea, mas opera sobre window._tabOrderPendingList
// (tempId em vez de originalIndex/id real, já que não existe node no
// canvas ainda pra esses itens).
function _renderTabOrderPendingList() {
  const containerEl = document.getElementById('a11y-tab-order-pending-list');
  const emptyEl = document.getElementById('a11y-tab-order-pending-empty');
  const applyBtn = document.getElementById('btn-tab-order-apply');
  if (!containerEl) return;

  const items = window._tabOrderPendingList || [];
  if (emptyEl) emptyEl.classList.toggle('hidden', items.length > 0);
  if (applyBtn) applyBtn.disabled = items.length === 0;

  containerEl.innerHTML = items.map((it, listIndex) => `
    <li class="list-none flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-dark-surface rounded-lg border border-gray-100 dark:border-dark-line cursor-pointer"
      title="Destacar este elemento no canvas"
      draggable="true"
      data-list-index="${listIndex}"
      onclick="_highlightTabOrderListItem('${escapeHtml(it.nodeId)}')"
      ondragstart="_tabOrderPendingDragStart(event, ${listIndex})"
      ondragover="_tabOrderDragOver(event)"
      ondrop="_tabOrderPendingDrop(event, ${listIndex})"
      ondragend="_tabOrderDragEnd(event)">
      <span class="text-gray-300 dark:text-dark-muted cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar" aria-hidden="true">
        <i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>
      </span>
      <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white shrink-0" style="background-color:#0891B2">${listIndex + 1}</div>
      <p class="flex-1 min-w-0 text-[11px] text-slate-700 dark:text-white truncate">${escapeHtml(it.nodeName || '')}</p>
      <button type="button" title="Remover da lista" aria-label="Remover da lista"
        onclick="event.stopPropagation(); deleteTabOrderPendingItem('${escapeHtml(it.tempId)}')"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </li>
  `).join('');

  _refreshIcons();
  _tabOrderRequestPreview();
}
window._renderTabOrderPendingList = _renderTabOrderPendingList;

// Pede ao backend pra (re)desenhar a numeração fantasma refletindo a ordem
// ATUAL de window._tabOrderPendingList — chamada ao final de TODA
// re-renderização da lista pendente (adicionar item, remover item,
// reordenar por drag-and-drop), então a prévia nunca fica dessincronizada
// da lista. Funciona igual nos dois fluxos: tanto start-tab-order-copy
// (manual) quanto generate-tab-order-from-layers (automático) já deixam uma
// cópia ativa no backend (_activeTabOrderCloneMap/_activeTabOrderCloneAreaId)
// antes da lista pendente existir. O backend ignora silenciosamente se por
// algum motivo não houver cópia ativa pra esta área (ver
// preview-tab-order-numbers em code.js).
function _tabOrderRequestPreview() {
  const areaId = window._tabOrderPendingAreaId;
  if (!areaId) return;
  const items = (window._tabOrderPendingList || []).map((it, i) => ({ nodeId: it.nodeId, number: i + 1 }));
  // window._tabOrderDeclaredOrigin já foi respondido no início da revisão
  // (ver ensureA11yProjectOriginThen, chamado por startTabOrderManualMode/
  // _confirmGenerateTabOrderFromLayers) — não há mais area.origin calculado
  // pra reaproveitar aqui.
  const a11yOrigin = window._tabOrderDeclaredOrigin || 'web';
  parent.postMessage({ pluginMessage: { type: 'preview-tab-order-numbers', areaId, items, a11yOrigin } }, '*');
}

let _tabOrderPendingDragIndex = null;

function _tabOrderPendingDragStart(ev, listIndex) {
  _tabOrderPendingDragIndex = listIndex;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', String(listIndex)); } catch (e) { }
  ev.currentTarget.classList.add('opacity-50');
}
window._tabOrderPendingDragStart = _tabOrderPendingDragStart;

function _tabOrderPendingDrop(ev, targetListIndex) {
  ev.preventDefault();
  const sourceListIndex = _tabOrderPendingDragIndex;
  if (sourceListIndex === null || sourceListIndex === targetListIndex) return;
  const list = window._tabOrderPendingList;
  const [moved] = list.splice(sourceListIndex, 1);
  list.splice(targetListIndex, 0, moved);
  _tabOrderPendingDragIndex = null;
  _renderTabOrderPendingList();
}
window._tabOrderPendingDrop = _tabOrderPendingDrop;

function deleteTabOrderPendingItem(tempId) {
  window._tabOrderPendingList = (window._tabOrderPendingList || []).filter(it => it.tempId !== tempId);
  _renderTabOrderPendingList();
}
window.deleteTabOrderPendingItem = deleteTabOrderPendingItem;

// Fecha o modal sem aplicar nada — descarta a lista pendente por completo
// (nenhum selo foi desenhado ainda, então não há nada pra desfazer) e limpa
// o highlight temporário, se ainda visível.
//
// A cópia "rascunho" do frame (criada em startTabOrderManualMode OU
// _confirmGenerateTabOrderFromLayers, ANTES de qualquer selo) fica órfã se o
// designer desistir aqui — sem selo nenhum, não faz sentido deixá-la no
// canvas. Dispara 'delete-tab-order-draft-copy' pra removê-la, só quando
// havia de fato uma cópia ativa desta área (window._tabOrderActiveCloneId)
// — guarda de defesa pro caso raro de o backend não ter conseguido criar a
// cópia (área não encontrada/não clonável).
function cancelTabOrderReview() {
  _tabOrderSetCaptureMode(null);
  window._tabOrderResumeCaptureMode = null;
  if (window._tabOrderActiveCloneId && window._tabOrderPendingAreaId) {
    parent.postMessage({ pluginMessage: { type: 'delete-tab-order-draft-copy', areaId: window._tabOrderPendingAreaId } }, '*');
  }
  window._tabOrderActiveCloneId = null;
  window._tabOrderActiveCloneNodeMap = null;
  window._tabOrderPendingList = [];
  window._tabOrderPendingAreaId = null;
  window._tabOrderPendingTargetNodeId = null;
  window._tabOrderDeclaredOrigin = null;
  _tabOrderResetAddItemButton();
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
  closeModal('a11y-tab-order-review-modal');
}
window.cancelTabOrderReview = cancelTabOrderReview;

// "Aplicar no Canvas" — única ação que de fato toca o canvas neste fluxo.
// Backend clona o frame da área, mapeia cada nodeId pendente pro node
// equivalente dentro do clone, e desenha os selos lá. Resposta tratada em
// handleTabOrderAppliedToCanvas (messages.js → aqui).
//
// window._tabOrderDeclaredOrigin já foi respondido no INÍCIO da revisão
// (startTabOrderManualMode/_confirmGenerateTabOrderFromLayers, via
// ensureA11yProjectOriginThen) — não pergunta de novo aqui. Ver bloco
// "Origem do projeto" (2026-09-02) pra decisão completa de por que a
// pergunta acontece uma única vez por arquivo, não mais por ação.
function applyTabOrderToCanvas() {
  const areaId = window._tabOrderPendingAreaId;
  const targetNodeId = window._tabOrderPendingTargetNodeId;
  const items = window._tabOrderPendingList || [];
  if (!areaId || !targetNodeId || items.length === 0) return;

  const applyBtn = document.getElementById('btn-tab-order-apply');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Aplicando…'; }

  _tabOrderSetCaptureMode(null);
  parent.postMessage({ pluginMessage: { type: 'clear-highlight' } }, '*');
  parent.postMessage({
    pluginMessage: {
      type: 'apply-tab-order-to-canvas',
      areaId,
      targetNodeId,
      items: items.map((it, i) => ({ nodeId: it.nodeId, nodeName: it.nodeName, number: i + 1 })),
      a11yOrigin: window._tabOrderDeclaredOrigin || 'web',
    },
  }, '*');
}
window.applyTabOrderToCanvas = applyTabOrderToCanvas;

// Resposta de 'tab-order-applied-to-canvas' (messages.js) — os itens já
// vêm com id real (grupo do selo, na cópia) prontos pro mesmo tratamento de
// addTabOrderItem (push + persistência), reaproveitado item a item. Antes
// de inserir os novos, descarta do array de dados QUALQUER item antigo
// desta MESMA área — o backend já apagou a cópia anterior inteira e
// recriou do zero, então os ids antigos apontam pra nós que não existem
// mais.
function handleTabOrderAppliedToCanvas(items, copyName) {
  const applyBtn = document.getElementById('btn-tab-order-apply');
  if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Aplicar no Canvas'; }

  if (!Array.isArray(items) || items.length === 0) {
    showToast('Não foi possível aplicar a ordem de tabulação — tente novamente.');
    return;
  }

  const areaId = window._tabOrderPendingAreaId;
  if (areaId) {
    tabOrderItems = (tabOrderItems || []).filter(it => it && it.a11yAreaId !== areaId);
  }

  items.forEach(item => addTabOrderItem(item));
  window._tabOrderPendingList = [];
  window._tabOrderPendingAreaId = null;
  window._tabOrderPendingTargetNodeId = null;
  window._tabOrderDeclaredOrigin = null;
  // A cópia rascunho (se havia) já foi reaproveitada/finalizada pelo
  // backend (apply-tab-order-to-canvas zera o mapa interno); limpa o
  // espelho local.
  window._tabOrderActiveCloneId = null;
  window._tabOrderActiveCloneNodeMap = null;
  closeModal('a11y-tab-order-review-modal');
  showToast(`Ordem de tabulação aplicada em "${copyName || 'cópia do frame'}".`);
}
window.handleTabOrderAppliedToCanvas = handleTabOrderAppliedToCanvas;

// Defensivo: itens salvos antes da introdução de canvasNumber (reordenação
// via drag-and-drop) não têm o campo — assume-se sincronizado com o canvas
// na primeira leitura, senão o botão "Atualizar" reenviaria tudo à toa.
// areaId filtra o subconjunto escopado à área (numeração reinicia por
// área); passe undefined só quando genuinamente precisar de todos os itens.
// Sentinel '__sem_area__' filtra o bucket "Sem área" (itens legados sem
// a11yAreaId, ou cuja área foi excluída).
function _currentTabOrderItems(areaId) {
  const all = (tabOrderItems || []).filter(Boolean).map(it => {
    if (it.canvasNumber === undefined) it.canvasNumber = it.number;
    return it;
  });
  if (areaId === undefined) return all;
  if (areaId === '__sem_area__') {
    const validAreaIds = new Set(_allA11yAreas().map(a => a.id));
    return all.filter(it => !it.a11yAreaId || !validAreaIds.has(it.a11yAreaId));
  }
  return all.filter(it => it.a11yAreaId === areaId);
}

// Resposta de tab-order-item-created (messages.js) — chamado de lá para
// manter o mesmo padrão de a11y-area-created (push no array, depois salva e
// renderiza). Re-render é sempre da lista agrupada inteira
// (renderA11yGroupedList) — mais simples e menos propenso a bug do que
// atualizar cirurgicamente um único accordion.
function addTabOrderItem(item) {
  if (!item) return;
  item.canvasNumber = item.number;
  tabOrderItems.push(item);
  saveToStorage();
  renderA11yGroupedList();
}
window.addTabOrderItem = addTabOrderItem;

// ── Geração automática por varredura de camadas ─────────────────────────
// Complementar ao fluxo manual acima: varre a árvore de uma Área Marcada já
// existente (na ordem espacial calculada em code.js) e POPULA a lista
// pendente com os candidatos, abrindo o modal de revisão já preenchido —
// não desenha mais nada direto no canvas (isso só acontece em
// applyTabOrderToCanvas). O designer pode reordenar via drag-and-drop,
// remover itens, ou complementar com "+ Adicionar item" antes de "Aplicar
// no Canvas". Cada botão "Gerar Automaticamente" já nasce dentro do
// accordion de uma área específica — chama direto com a área do próprio
// accordion, sem modal de escolha.
function _confirmGenerateTabOrderFromLayers(areaId, targetNodeId) {
  if (!areaId || !targetNodeId) return;
  ensureA11yProjectOriginThen((origin) => {
    window._tabOrderDeclaredOrigin = origin;
    window._tabOrderPendingList = [];
    window._tabOrderPendingAreaId = areaId;
    window._tabOrderPendingTargetNodeId = targetNodeId;
    window._tabOrderActiveCloneId = null;
    window._tabOrderActiveCloneNodeMap = null;
    parent.postMessage({ pluginMessage: { type: 'generate-tab-order-from-layers', areaId, targetNodeId } }, '*');
    showToast('Varrendo elementos interativos da área…');
  });
}
window._confirmGenerateTabOrderFromLayers = _confirmGenerateTabOrderFromLayers;

// Resposta de tab-order-generated-from-layers (messages.js) — items é
// {nodeId, nodeName}[] (candidatos, referenciando o frame ORIGINAL, nunca
// itens já desenhados); cloneId/nodeMap vêm porque o backend já criou e
// focou a cópia da área ANTES de varrer (mesmo padrão do fluxo manual, ver
// handleTabOrderCopyStarted) — guarda os dois pra que "Cancelar" e a prévia
// de selos fantasma (preview-tab-order-numbers) funcionem igual ao fluxo
// manual. Popula a lista pendente e abre o modal de revisão já preenchido;
// o designer confirma explicitamente pelo botão "Aplicar no Canvas".
function addTabOrderItemsFromLayers(items, cloneId, nodeMap) {
  window._tabOrderActiveCloneId = cloneId || null;
  window._tabOrderActiveCloneNodeMap = nodeMap || null;

  // Sem cloneId, o backend nem chegou a criar a cópia (área não encontrada
  // ou não clonável) — nesse caso não há onde marcar nada, então não abre o
  // modal, só avisa (figma.notify do backend já cobriu o motivo).
  if (!cloneId) {
    window._tabOrderPendingList = [];
    return;
  }

  window._tabOrderPendingList = Array.isArray(items)
    ? items.map(it => ({ nodeId: it.nodeId, nodeName: it.nodeName || '', tempId: _tabOrderNextTempId() }))
    : [];
  openTabOrderReviewModal();
  if (window._tabOrderPendingList.length === 0) {
    showToast('Nenhum elemento interativo encontrado automaticamente — a cópia da área já está pronta para marcação manual ("+ Adicionar item").');
  } else {
    showToast(`${window._tabOrderPendingList.length} elemento${window._tabOrderPendingList.length === 1 ? '' : 's'} encontrado${window._tabOrderPendingList.length === 1 ? '' : 's'} — revise a ordem e clique em "Aplicar no Canvas".`);
  }
}
window.addTabOrderItemsFromLayers = addTabOrderItemsFromLayers;

// Reordenação manual (drag-and-drop) é só de LISTA — a ordem visual normal
// é sempre derivada de it.number (ver .sort abaixo), então redistribuir a
// posição no array não muda nada sozinho. Ao soltar um item em nova posição
// (_tabOrderDrop), recalculamos number = index+1 pra TODOS os itens DA
// MESMA ÁREA (dado do plugin, sem tocar canvas) e guardamos o número já
// aplicado no canvas em canvasNumber, pra saber depois — no clique em
// "Atualizar" — quais itens realmente precisam de renumber-tab-order-items.
// canvasNumber nasce igual a number na criação e só é atualizado quando o
// backend confirma a renumeração.
let _tabOrderDragIndex = null;
let _tabOrderDragAreaId = null;

// Renderiza a lista de itens de Ordem de Tabulação escopada a UMA área (ou
// ao bucket "Sem área", passando areaId = '__sem_area__') dentro do
// containerEl fornecido (o <ul> específico daquele accordion). Chamada uma
// vez por accordion de área em _a11yAreaAccordionEl/_a11ySemAreaAccordionEl.
function _renderTabOrderListForArea(areaId, containerEl) {
  if (!containerEl) return;

  const items = _currentTabOrderItems(areaId)
    .map(it => Object.assign({}, it, { originalIndex: tabOrderItems.indexOf(it) }))
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  const readOnly = areaId === '__sem_area__';

  containerEl.innerHTML = items.map((it, listIndex) => `
    <li class="list-none flex items-center gap-2 px-2.5 py-1.5 bg-white dark:bg-dark-surface rounded-lg border border-gray-100 dark:border-dark-line"
      draggable="${readOnly ? 'false' : 'true'}"
      data-list-index="${listIndex}"
      ${readOnly ? '' : `ondragstart="_tabOrderDragStart(event, ${listIndex}, '${escapeHtml(String(areaId))}')"
      ondragover="_tabOrderDragOver(event)"
      ondrop="_tabOrderDrop(event, ${listIndex}, '${escapeHtml(String(areaId))}')"
      ondragend="_tabOrderDragEnd(event)"`}>
      ${readOnly ? '' : `<span class="text-gray-300 dark:text-dark-muted cursor-grab active:cursor-grabbing shrink-0" title="Arrastar para reordenar" aria-hidden="true">
        <i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i>
      </span>`}
      <div class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white shrink-0" style="background-color:#0891B2">${escapeHtml(String(it.number))}</div>
      <p class="flex-1 min-w-0 text-[11px] text-slate-700 dark:text-white truncate">${escapeHtml(it.targetNodeName || '')}</p>
      <button type="button" title="Focar no canvas" aria-label="Focar no canvas"
        onclick="focusNode('${it.id}')"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-[#0070af] transition-colors shrink-0">
        <i data-lucide="locate" class="w-3.5 h-3.5"></i>
      </button>
      <button type="button" title="Remover da ordem de tabulação" aria-label="Remover da ordem de tabulação"
        onclick="deleteTabOrderItem(${it.originalIndex})"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </li>
  `).join('');

  _refreshIcons();
}
window._renderTabOrderListForArea = _renderTabOrderListForArea;

function _tabOrderDragStart(ev, listIndex, areaId) {
  _tabOrderDragIndex = listIndex;
  _tabOrderDragAreaId = areaId;
  ev.dataTransfer.effectAllowed = 'move';
  try { ev.dataTransfer.setData('text/plain', String(listIndex)); } catch (e) { }
  ev.currentTarget.classList.add('opacity-50');
}
window._tabOrderDragStart = _tabOrderDragStart;

function _tabOrderDragOver(ev) {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
}
window._tabOrderDragOver = _tabOrderDragOver;

function _tabOrderDragEnd(ev) {
  ev.currentTarget.classList.remove('opacity-50');
  _tabOrderDragIndex = null;
  _tabOrderDragAreaId = null;
}
window._tabOrderDragEnd = _tabOrderDragEnd;

// Reordena o array em memória e recalcula number = index+1 pra refletir a
// nova posição visual DENTRO DA MESMA ÁREA — sem enviar nada ao canvas
// aqui; a divergência com canvasNumber é o que o botão "Atualizar"
// (updateTabOrderNumbering) usa depois pra saber quem precisa de
// renumber-tab-order-items.
function _tabOrderDrop(ev, targetListIndex, areaId) {
  ev.preventDefault();
  const sourceListIndex = _tabOrderDragIndex;
  if (sourceListIndex === null || sourceListIndex === targetListIndex || areaId !== _tabOrderDragAreaId) return;

  const ordered = _currentTabOrderItems(areaId).sort((a, b) => (a.number || 0) - (b.number || 0));
  const [moved] = ordered.splice(sourceListIndex, 1);
  ordered.splice(targetListIndex, 0, moved);

  ordered.forEach((it, i) => { it.number = i + 1; });

  saveToStorage();
  renderA11yGroupedList();
}
window._tabOrderDrop = _tabOrderDrop;

// Clique em "Atualizar" (escopado a uma área) — só ENTÃO o canvas é
// tocado. Compara number (já recalculado pelo drag-and-drop) contra
// canvasNumber (o que de fato está desenhado nos selos) e manda pro
// backend só quem realmente mudou, mesma lógica de comparação que
// deleteTabOrderItem já usa.
function updateTabOrderNumbering(areaId) {
  const ordered = _currentTabOrderItems(areaId).sort((a, b) => (a.number || 0) - (b.number || 0));
  const renumberPayload = [];
  ordered.forEach(it => {
    if (it.id && it.number !== it.canvasNumber) {
      renumberPayload.push({ id: it.id, number: it.number });
    }
  });

  if (renumberPayload.length === 0) {
    showToast('A ordem já está atualizada no canvas.');
    return;
  }

  parent.postMessage({ pluginMessage: { type: 'renumber-tab-order-items', items: renumberPayload } }, '*');
  ordered.forEach(it => { it.canvasNumber = it.number; });

  saveToStorage();
  showToast('Ordem atualizada no canvas.');
}
window.updateTabOrderNumbering = updateTabOrderNumbering;

// Excluir um item do MEIO da sequência renumera localmente todos os
// posteriores DA MESMA ÁREA (-1) antes de salvar/renderizar, e propaga a
// mudança pros selos já desenhados no canvas via renumber-tab-order-items.
function deleteTabOrderItem(originalIndex) {
  const raw = tabOrderItems[originalIndex];
  if (!raw) return;

  const areaId = raw.a11yAreaId || null;

  if (raw.id) {
    parent.postMessage({ pluginMessage: { type: 'delete-node', id: raw.id } }, '*');
  }
  tabOrderItems.splice(originalIndex, 1);

  const remaining = _currentTabOrderItems(areaId || '__sem_area__')
    .sort((a, b) => (a.number || 0) - (b.number || 0));
  const renumberPayload = [];
  remaining.forEach((it, i) => {
    const newNumber = i + 1;
    if (it.number !== newNumber) {
      it.number = newNumber;
      if (it.id) renumberPayload.push({ id: it.id, number: newNumber });
    }
  });

  if (renumberPayload.length > 0) {
    parent.postMessage({ pluginMessage: { type: 'renumber-tab-order-items', items: renumberPayload } }, '*');
    // canvas já foi atualizado acima — sincroniza canvasNumber pra não sobrar
    // divergência falsa quando o designer clicar em "Atualizar" depois.
    remaining.forEach(it => { it.canvasNumber = it.number; });
  }

  saveToStorage();
  renderA11yGroupedList();
}
window.deleteTabOrderItem = deleteTabOrderItem;

// ── Guia de categorias ───────────────────────────────────────────────────
function openA11yCategoriesHelp() {
  openModal('a11y-categories-help-modal');
}
window.openA11yCategoriesHelp = openA11yCategoriesHelp;

// Stub mínimo funcional: messages.js referencia closeEditSpecConnectorModal
// no roteamento de 'spec-connector-edited' (edição do estilo de linha de
// uma spec, botão "Editar linha" nas specs normais do Handex). O hac não
// portou o modal #edit-spec-connector-modal (fora do escopo desta tarefa —
// não estava na lista de 8 modais de acessibilidade a portar), mas o
// backend (code.js) ainda tem o handler 'edit-spec-connector' pronto. Só
// limpa o estado de edição em memória, sem tentar fechar um modal que não
// existe no DOM do hac — closeModal() já no-opa graciosamente se o id
// não for encontrado, então isto é seguro mesmo se o modal for adicionado
// no futuro.
function closeEditSpecConnectorModal() {
  window._editingSpecConnectorIndex = null;
  closeModal('edit-spec-connector-modal');
}
window.closeEditSpecConnectorModal = closeEditSpecConnectorModal;
